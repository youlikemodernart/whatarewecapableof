#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const {
  fakeFinanceImportSummary,
  normalizeFinanceImport,
} = require('../apps/fin/api/_finance_import.js');
const { signSystemImportRequest } = require('../apps/fin/api/_system_import_auth.js');

const __filename = fileURLToPath(import.meta.url);
const ROOT_DIR = path.resolve(path.dirname(__filename), '..');
const FINANCE_DIR = path.join(ROOT_DIR, '.finance');
const RECEIPT_DIR = path.join(FINANCE_DIR, 'fin-refresh-receipts');
const DEFAULT_TARGET = 'https://fin.whatarewecapableof.com/api/finance/system-import-summary';

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }
    const eq = token.indexOf('=');
    const key = token.slice(2, eq === -1 ? undefined : eq);
    const next = eq === -1 ? argv[i + 1] : token.slice(eq + 1);
    const isBoolean = eq === -1 && (next === undefined || next.startsWith('--'));
    args[key] = isBoolean ? true : next;
    if (!isBoolean && eq === -1) i += 1;
  }
  return args;
}

function env(name, fallback = '') {
  return String(process.env[name] ?? fallback).trim();
}

function expandHome(value) {
  return String(value || '').replace(/^~(?=$|\/)/, os.homedir());
}

function monthArg(value, fallback = '') {
  const month = String(value || fallback || '').trim();
  if (month && !/^\d{4}-\d{2}$/.test(month)) throw new Error('--month must use YYYY-MM.');
  return month;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(filePath, 0o600);
}

function safeTarget(url) {
  const parsed = new URL(url);
  return `${parsed.origin}${parsed.pathname}`;
}

function assertInsideDir(filePath, dir, flagName) {
  const resolved = path.resolve(expandHome(filePath));
  const root = path.resolve(dir);
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${flagName} must stay under ${path.relative(ROOT_DIR, root) || root}.`);
  }
  return resolved;
}

function assertProviderRefreshOutputPaths(args, sourceRefresh) {
  if (sourceRefresh !== 'mercury') return;
  if (args['snapshot-out']) assertInsideDir(args['snapshot-out'], path.join(FINANCE_DIR, 'snapshots'), '--snapshot-out');
  if (args.out) assertInsideDir(args.out, FINANCE_DIR, '--out');
}

function assertProviderRefreshTarget(args, sourceRefresh) {
  if (sourceRefresh !== 'mercury' || args['dry-run']) return;
  const target = safeTarget(args.target || env('FIN_FINANCE_SYSTEM_IMPORT_URL', DEFAULT_TARGET));
  const parsed = new URL(target);
  const isLiveFin = target === DEFAULT_TARGET;
  const isLoopback = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
  if (!isLiveFin && !isLoopback) throw new Error('--source-refresh mercury can only post to live Fin or loopback targets. Use --dry-run for other targets.');
}

function sourceRefreshMode(args) {
  const mode = String(args['source-refresh'] || 'none').trim().toLowerCase();
  if (!['none', 'mercury'].includes(mode)) {
    throw new Error(`--source-refresh ${mode} is not supported. Use --source-refresh none or --source-refresh mercury.`);
  }
  return mode;
}

function utcMonthBounds(month) {
  const selected = monthArg(month, new Date().toISOString().slice(0, 7));
  const [yearText, monthText] = selected.split('-');
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const start = `${selected}-01`;
  const endDate = new Date(Date.UTC(year, monthIndex + 1, 0));
  const today = new Date();
  const todayMonth = today.toISOString().slice(0, 7);
  const end = selected === todayMonth ? today.toISOString().slice(0, 10) : endDate.toISOString().slice(0, 10);
  return { month: selected, start, end };
}

function stamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function readManifest(snapshotDir) {
  return readJson(path.join(snapshotDir, 'manifest.json'));
}

function parseJsonDocuments(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    // Mercury CLI can emit multiple top-level JSON documents. Continue with a small scanner.
  }

  const values = [];
  let index = 0;
  while (index < trimmed.length) {
    while (index < trimmed.length && /\s/.test(trimmed[index])) index += 1;
    if (index >= trimmed.length) break;
    const start = index;
    let depth = 0;
    let inString = false;
    let escape = false;
    for (; index < trimmed.length; index += 1) {
      const ch = trimmed[index];
      if (inString) {
        if (escape) escape = false;
        else if (ch === '\\') escape = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === '{' || ch === '[') depth += 1;
      else if (ch === '}' || ch === ']') {
        depth -= 1;
        if (depth === 0) {
          index += 1;
          break;
        }
      }
    }
    const chunk = trimmed.slice(start, index).trim();
    if (chunk) {
      const parsed = JSON.parse(chunk);
      if (Array.isArray(parsed)) values.push(...parsed);
      else values.push(parsed);
    }
  }
  return values;
}

function countSnapshotRows(snapshotDir, command) {
  const filePath = path.join(snapshotDir, `${command}.json`);
  return parseJsonDocuments(fs.readFileSync(filePath, 'utf8')).length;
}

function assertMercurySnapshotHealthy(snapshotDir, snapshotLimit = 200) {
  const manifest = readManifest(snapshotDir);
  const errors = Array.isArray(manifest.errors) ? manifest.errors : [];
  if (errors.length) {
    throw new Error(`Mercury read-only snapshot reported ${errors.length} command error(s); refusing to export or import. Review the private manifest under ${path.relative(ROOT_DIR, snapshotDir)}.`);
  }
  const commands = new Set((manifest.files || []).map((file) => String(file.command || '')));
  const required = ['accounts', 'cards', 'transactions', 'invoices', 'customers', 'categories'];
  const missing = required.filter((command) => !commands.has(command) || !fs.existsSync(path.join(snapshotDir, `${command}.json`)));
  if (missing.length) throw new Error(`Mercury snapshot is incomplete (${missing.join(', ')} missing); refusing to export or import.`);
  const rowCounts = Object.fromEntries(required.map((command) => [command, countSnapshotRows(snapshotDir, command)]));
  const paginatedCommands = ['transactions', 'invoices', 'customers', 'categories'];
  const exactLimit = paginatedCommands.filter((command) => rowCounts[command] >= snapshotLimit);
  if (exactLimit.length) {
    throw new Error(`Mercury snapshot hit the configured row limit for ${exactLimit.join(', ')}; refusing to export or import until the limit is raised or pagination is verified.`);
  }
  return {
    dir: snapshotDir,
    generatedAt: manifest.generatedAt || '',
    commands: [...commands].sort(),
    rowCounts,
    errorCount: errors.length,
  };
}

function refreshMercurySnapshot(args, month) {
  if (args.snapshot) throw new Error('Do not pass --snapshot with --source-refresh mercury. The refresh creates a new private Mercury snapshot.');
  const { month: selectedMonth, start, end } = utcMonthBounds(month);
  const mercuryHelper = path.join(ROOT_DIR, 'scripts/mercury-finance.mjs');
  const outDir = args['snapshot-out']
    ? assertInsideDir(args['snapshot-out'], path.join(FINANCE_DIR, 'snapshots'), '--snapshot-out')
    : path.join(FINANCE_DIR, 'snapshots', `mercury-${stamp()}-system-refresh`);
  const limitNumber = Number(args['snapshot-limit'] || 200);
  if (!Number.isInteger(limitNumber) || limitNumber < 1 || limitNumber > 10_000) throw new Error('--snapshot-limit must be an integer between 1 and 10000.');
  const limit = String(limitNumber);
  const childArgs = [mercuryHelper, 'snapshot', '--out', outDir, '--posted-start', start, '--posted-end', end, '--limit', limit];
  const result = spawnSync(process.execPath, childArgs, { cwd: ROOT_DIR, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error('Mercury read-only snapshot command failed; refusing to export or import. Review the private command environment and stderr locally.');
  }
  const health = assertMercurySnapshotHealthy(outDir, limitNumber);
  return { ...health, month: selectedMonth, postedStart: start, postedEnd: end };
}

function refreshSources(args, sourceRefresh) {
  if (sourceRefresh === 'none') return null;
  if (sourceRefresh === 'mercury') {
    if (args.fixture || args.summary) throw new Error('--source-refresh mercury is only valid with --export-real.');
    if (!args['export-real']) throw new Error('--source-refresh mercury requires --export-real.');
    assertProviderRefreshOutputPaths(args, sourceRefresh);
    assertProviderRefreshTarget(args, sourceRefresh);
    const month = monthArg(args.month, new Date().toISOString().slice(0, 7));
    const snapshot = refreshMercurySnapshot(args, month);
    args.month = month;
    args.snapshot = snapshot.dir;
    return { provider: 'mercury', ...snapshot, snapshotDir: path.relative(ROOT_DIR, snapshot.dir) };
  }
  throw new Error(`Unsupported source refresh mode: ${sourceRefresh}`);
}

function exportRealSummary(args) {
  const exporter = path.join(ROOT_DIR, 'scripts/fin-finance-export-hosted-summary.mjs');
  const childArgs = [exporter, '--real'];
  if (args.month) childArgs.push('--month', String(args.month));
  if (args.out) childArgs.push('--out', String(args.out));
  if (args.snapshot) childArgs.push('--snapshot', String(args.snapshot));
  if (args.recurring) childArgs.push('--recurring', String(args.recurring));
  if (args['card-labels']) childArgs.push('--card-labels', String(args['card-labels']));
  if (args['invoice-db']) childArgs.push('--invoice-db', String(args['invoice-db']));
  const result = spawnSync(process.execPath, childArgs, { cwd: ROOT_DIR, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`Hosted-safe summary export failed: ${String(result.stderr || result.stdout || '').trim()}`);
  }
  const outPath = String(result.stdout || '').trim().split(/\r?\n/).filter(Boolean).at(-1);
  if (!outPath) throw new Error('Hosted-safe summary exporter did not return an output path.');
  return path.resolve(outPath);
}

function loadSummary(args) {
  const fixture = args.fixture === true;
  const summaryPath = args.summary ? path.resolve(expandHome(args.summary)) : '';
  const exportReal = args['export-real'] === true;
  const selectedCount = [fixture, Boolean(summaryPath), exportReal].filter(Boolean).length;
  if (selectedCount !== 1) throw new Error('Choose exactly one summary source: --fixture, --summary PATH, or --export-real.');

  let source = '';
  let summary;
  if (fixture) {
    const month = monthArg(args.month, '2099-12');
    summary = fakeFinanceImportSummary(month);
    source = 'fixture';
  } else if (summaryPath) {
    summary = readJson(summaryPath);
    source = summaryPath;
  } else {
    const exportedPath = exportRealSummary(args);
    summary = readJson(exportedPath);
    source = exportedPath;
  }

  const normalized = normalizeFinanceImport(summary).data;
  return { summary: normalized, source };
}

function assertProviderRefreshSummaryHealthy(summary, refreshedSource) {
  if (!refreshedSource) return;
  if (summary.month !== refreshedSource.month) throw new Error(`Refreshed summary month ${summary.month} did not match requested source-refresh month ${refreshedSource.month}.`);
  if (!summary.sources.sourceKinds.includes('mercury')) throw new Error('Refreshed summary did not include Mercury as a source kind; refusing to import.');
  const snapshotErrors = summary.mercury?.snapshot?.errors || [];
  if (snapshotErrors.length) throw new Error(`Refreshed summary contains ${snapshotErrors.length} Mercury snapshot error(s); refusing to import.`);
  const blockerLabels = new Set([
    'Mercury snapshot reported errors',
    'No Mercury snapshot found',
    'Selected month absent from Mercury snapshot',
  ]);
  const blockers = (summary.exceptions || []).filter((item) => blockerLabels.has(String(item.label || '')));
  if (blockers.length) throw new Error(`Refreshed summary has ${blockers.length} Mercury coverage blocker(s); refusing to import.`);
}

function safePreview(summary) {
  return {
    month: summary.month,
    generatedAt: summary.generatedAt,
    label: summary.label,
    contentSha256: summary.sources.contentSha256,
    sourceKinds: summary.sources.sourceKinds,
    rowCounts: {
      accounts: summary.mercury.accounts.length,
      activeCards: summary.mercury.activeCards.length,
      cardTransactions: summary.mercury.cardTransactions.length,
      observedCardExpenses: summary.mercury.observedCardExpenses.expenses.length,
      recentTransactions: summary.mercury.recentTransactions.length,
      recurringItems: summary.recurring.items.length,
      exceptions: summary.exceptions.length,
    },
  };
}

function defaultReceiptPath(summary) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return path.join(RECEIPT_DIR, `fin-refresh-${summary.month}-${stamp}.json`);
}

async function pushSummary({ args, summary }) {
  const target = safeTarget(args.target || env('FIN_FINANCE_SYSTEM_IMPORT_URL', DEFAULT_TARGET));
  const targetUrl = new URL(target);
  const keyId = String(args['key-id'] || env('FIN_FINANCE_SYSTEM_IMPORT_KEY_ID') || '').trim();
  const secret = env('FIN_FINANCE_SYSTEM_IMPORT_SECRET');
  if (!keyId) throw new Error('Missing system import key id. Set FIN_FINANCE_SYSTEM_IMPORT_KEY_ID or pass --key-id.');
  if (!secret) throw new Error('Missing system import secret. Set FIN_FINANCE_SYSTEM_IMPORT_SECRET in the environment.');
  if (Buffer.byteLength(secret, 'utf8') < 32) throw new Error('System import secret must be at least 32 bytes.');

  const body = JSON.stringify(summary);
  const signed = signSystemImportRequest({ keyId, secret, method: 'POST', path: targetUrl.pathname, body });
  const request = {
    keyId,
    target,
    bodySha256: signed.bodySha256,
    nonce: signed.nonce,
    timestamp: signed.timestamp,
  };

  if (args['dry-run']) {
    return { dryRun: true, request };
  }

  const response = await fetch(target, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...signed.headers,
    },
    body,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`System import failed with ${response.status}: ${data.error || 'Unknown error'}`);
  }
  return {
    dryRun: false,
    status: response.status,
    request,
    skipped: Boolean(data.skipped),
    reason: String(data.reason || ''),
    import: data.import || null,
  };
}

function printHelp() {
  console.log(`WAWCO Fin finance refresh push\n\nUsage:\n  npm run fin:finance-refresh -- --fixture --dry-run\n  npm run fin:finance-refresh -- --fixture --target http://127.0.0.1:3321/api/finance/system-import-summary\n  npm run fin:finance-refresh -- --summary .finance/exports/fin-dashboard-summary-YYYY-MM-...json\n\nOptions:\n  --fixture                 Use generic fake data. Does not read .finance/.\n  --summary PATH            Push an already generated hosted-safe summary JSON.\n  --export-real             Generate a hosted-safe summary from existing ignored .finance artifacts, then push it. Requires explicit approval before real use.\n  --source-refresh none     Default. Does not refresh provider source data.\n  --source-refresh mercury  Run a read-only Mercury snapshot into ignored .finance/, then export/import. Requires --export-real and current approval.\n  --snapshot-limit N        Limit passed to the Mercury snapshot helper for list calls. Defaults to 200.\n  --snapshot-out PATH       Optional private output directory under .finance/snapshots/ for the Mercury snapshot created by --source-refresh mercury.\n  --month YYYY-MM           Month for --fixture or --export-real.\n  --target URL              Import endpoint. Defaults to FIN_FINANCE_SYSTEM_IMPORT_URL or live Fin.\n  --key-id VALUE            HMAC key id. Defaults to FIN_FINANCE_SYSTEM_IMPORT_KEY_ID.\n  --dry-run                 Validate, canonicalize, and sign locally without sending.\n  --receipt PATH            Write a sanitized receipt JSON. Defaults to .finance/fin-refresh-receipts/ after a send.\n  --help                    Show this help.\n\nBoundary:\n  --source-refresh none performs no finance-source refresh. --source-refresh mercury runs only the WAWCO Mercury helper's read-only snapshot command, keeps raw snapshots under .finance/snapshots/, and refuses to export/import if the snapshot reports command errors, hits the configured row limit, or does not cover the requested month. No Stripe, Gmail, bank write, payment, customer write, invoice-send, card write, recipient, webhook, or transaction-category action is performed by this script.\n`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const sourceRefresh = sourceRefreshMode(args);
  const refreshedSource = refreshSources(args, sourceRefresh);
  const { summary, source } = loadSummary(args);
  assertProviderRefreshSummaryHealthy(summary, refreshedSource);
  const result = await pushSummary({ args, summary });
  const receipt = {
    ok: true,
    dryRun: result.dryRun,
    sourceRefresh,
    sourceRefreshResult: refreshedSource ? {
      provider: refreshedSource.provider,
      snapshotDir: refreshedSource.snapshotDir,
      month: refreshedSource.month,
      postedStart: refreshedSource.postedStart,
      postedEnd: refreshedSource.postedEnd,
      commandCount: refreshedSource.commands.length,
      errorCount: refreshedSource.errorCount,
      rowCounts: refreshedSource.rowCounts,
    } : null,
    summarySource: source === 'fixture' ? 'fixture' : path.relative(ROOT_DIR, source),
    target: result.request.target,
    keyId: result.request.keyId,
    month: summary.month,
    contentSha256: summary.sources.contentSha256,
    bodySha256: result.request.bodySha256,
    rowCounts: safePreview(summary).rowCounts,
    skipped: Boolean(result.skipped),
    reason: result.reason || '',
    import: result.import ? {
      id: result.import.id,
      month: result.import.month,
      importedAt: result.import.importedAt,
      contentSha256: result.import.contentSha256,
      validatorVersion: result.import.validatorVersion,
    } : null,
    createdAt: new Date().toISOString(),
  };

  const shouldWriteReceipt = args.receipt || !result.dryRun;
  if (shouldWriteReceipt) {
    const receiptPath = args.receipt ? path.resolve(expandHome(args.receipt)) : defaultReceiptPath(summary);
    writeJson(receiptPath, receipt);
    receipt.receiptPath = path.relative(ROOT_DIR, receiptPath);
  }

  console.log(JSON.stringify({
    ok: true,
    dryRun: result.dryRun,
    skipped: receipt.skipped,
    reason: receipt.reason,
    sourceRefreshResult: receipt.sourceRefreshResult,
    preview: safePreview(summary),
    import: receipt.import,
    receiptPath: receipt.receiptPath || '',
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
