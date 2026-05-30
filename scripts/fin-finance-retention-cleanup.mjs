#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT_DIR = path.resolve(path.dirname(__filename), '..');
const FINANCE_DIR = path.join(ROOT_DIR, '.finance');
const SNAPSHOT_DIR = path.join(FINANCE_DIR, 'snapshots');
const EXPORT_DIR = path.join(FINANCE_DIR, 'exports');
const RECEIPT_DIR = path.join(FINANCE_DIR, 'fin-refresh-receipts');
const DEFAULT_LOG_DIR = path.join(os.homedir(), 'Library', 'Logs', 'wawco-fin');

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

function expandHome(value) {
  return String(value || '').replace(/^~(?=$|\/)/, os.homedir());
}

function intArg(args, key, fallback, min = 0, max = 10_000_000) {
  const value = args[key] === undefined ? fallback : Number(args[key]);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`--${key} must be an integer between ${min} and ${max}.`);
  return value;
}

function lstatSafe(filePath) {
  try {
    return fs.lstatSync(filePath);
  } catch {
    return null;
  }
}

function realpathSafe(filePath) {
  try {
    return fs.realpathSync(filePath);
  } catch {
    return null;
  }
}

function isInsidePath(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function validateDirectoryRoot(dir, { label, required = false, parentReal = null } = {}) {
  const resolved = path.resolve(expandHome(dir));
  const stat = lstatSafe(resolved);
  if (!stat) {
    if (required) throw new Error(`${label} is missing: ${resolved}.`);
    return null;
  }
  if (stat.isSymbolicLink()) throw new Error(`${label} must not be a symlink: ${resolved}.`);
  if (!stat.isDirectory()) throw new Error(`${label} must be a directory: ${resolved}.`);
  const real = realpathSafe(resolved);
  if (!real) throw new Error(`${label} realpath could not be resolved: ${resolved}.`);
  if (parentReal && !isInsidePath(real, parentReal)) throw new Error(`${label} must stay inside ${parentReal}.`);
  return { path: resolved, real };
}

function validateFileCandidate(filePath, rootInfo, expectedType) {
  const resolved = path.resolve(filePath);
  const stat = lstatSafe(resolved);
  if (!stat || stat.isSymbolicLink()) return null;
  const type = stat.isDirectory() ? 'dir' : stat.isFile() ? 'file' : 'other';
  if (type !== expectedType) return null;
  const real = realpathSafe(resolved);
  if (!real || !isInsidePath(real, rootInfo.real)) throw new Error(`cleanup candidate escaped ${rootInfo.real}.`);
  return { path: resolved, real, stat, type };
}

function listEntries({ dir, match, expectedType, parentReal = null, label }) {
  const rootInfo = validateDirectoryRoot(dir, { label, required: false, parentReal });
  if (!rootInfo) return [];
  const entries = [];
  for (const name of fs.readdirSync(rootInfo.path)) {
    if (!match.test(name)) continue;
    const candidate = validateFileCandidate(path.join(rootInfo.path, name), rootInfo, expectedType);
    if (!candidate) continue;
    entries.push({
      name,
      path: candidate.path,
      real: candidate.real,
      mtimeMs: candidate.stat.mtimeMs,
      size: candidate.stat.size,
      type: candidate.type,
    });
  }
  return entries.sort((a, b) => b.mtimeMs - a.mtimeMs || a.name.localeCompare(b.name));
}

function removeCandidate(entry, rootInfo) {
  const current = validateFileCandidate(entry.path, rootInfo, entry.type);
  if (!current) return false;
  if (entry.type === 'dir') fs.rmSync(current.path, { recursive: true, force: true });
  else fs.rmSync(current.path, { force: true });
  return true;
}

function pruneByCount({ dir, match, keep, apply, expectedType, parentReal, label }) {
  const rootInfo = validateDirectoryRoot(dir, { label, required: false, parentReal });
  const entries = rootInfo ? listEntries({ dir, match, expectedType, parentReal, label }) : [];
  const remove = entries.slice(keep);
  const result = {
    dir: path.relative(ROOT_DIR, path.resolve(dir)),
    keep,
    total: entries.length,
    removed: 0,
    removedBytes: 0,
    candidates: remove.length,
  };
  for (const entry of remove) {
    result.removedBytes += entry.size;
    if (apply && rootInfo && removeCandidate(entry, rootInfo)) result.removed += 1;
  }
  return result;
}

function validateLogDir(logDir) {
  const requested = path.resolve(expandHome(logDir));
  const expected = path.resolve(DEFAULT_LOG_DIR);
  if (requested !== expected) throw new Error(`--log-dir is restricted to ${expected}.`);
  return validateDirectoryRoot(requested, { label: 'log directory', required: false });
}

function trimLog({ filePath, logRootInfo, maxBytes, keepBytes, apply }) {
  const resolved = path.resolve(expandHome(filePath));
  const result = {
    path: resolved.replace(os.homedir(), '~'),
    exists: false,
    sizeBytes: 0,
    maxBytes,
    keepBytes,
    trimmed: false,
  };
  if (!logRootInfo) return result;
  if (!isInsidePath(resolved, logRootInfo.path)) throw new Error(`log path must stay inside ${logRootInfo.path}.`);
  const stat = lstatSafe(resolved);
  result.exists = Boolean(stat);
  result.sizeBytes = stat ? stat.size : 0;
  if (!stat || stat.isSymbolicLink()) return result;
  if (!stat.isFile()) throw new Error(`log path must be a regular file: ${resolved}.`);
  const real = realpathSafe(resolved);
  if (!real || !isInsidePath(real, logRootInfo.real)) throw new Error(`log path escaped ${logRootInfo.real}.`);
  if (stat.size <= maxBytes) return result;
  if (apply) {
    const fd = fs.openSync(resolved, 'r');
    const tmp = `${resolved}.tmp-${process.pid}-${Date.now()}`;
    try {
      const length = Math.min(keepBytes, stat.size);
      const buffer = Buffer.alloc(length);
      fs.readSync(fd, buffer, 0, length, stat.size - length);
      const outFd = fs.openSync(tmp, 'wx', 0o600);
      try {
        fs.writeSync(outFd, Buffer.from(`[trimmed by fin retention cleanup at ${new Date().toISOString()}]\n`, 'utf8'));
        fs.writeSync(outFd, buffer);
      } finally {
        fs.closeSync(outFd);
      }
      fs.renameSync(tmp, resolved);
      fs.chmodSync(resolved, 0o600);
    } finally {
      fs.closeSync(fd);
      if (fs.existsSync(tmp)) fs.rmSync(tmp, { force: true });
    }
  }
  result.trimmed = true;
  return result;
}

function ensureReceiptDir(financeRootInfo) {
  if (!fs.existsSync(RECEIPT_DIR)) fs.mkdirSync(RECEIPT_DIR, { recursive: true, mode: 0o700 });
  return validateDirectoryRoot(RECEIPT_DIR, { label: 'receipt directory', required: true, parentReal: financeRootInfo.real });
}

function writeJson(filePath, value, financeRootInfo) {
  const receiptRoot = ensureReceiptDir(financeRootInfo);
  const resolved = path.resolve(expandHome(filePath));
  if (!isInsidePath(resolved, receiptRoot.path)) throw new Error(`--receipt must stay inside ${receiptRoot.path}.`);
  const parent = validateDirectoryRoot(path.dirname(resolved), { label: 'receipt parent', required: true, parentReal: receiptRoot.real });
  const parentReal = parent.real;
  const existing = lstatSafe(resolved);
  if (existing?.isSymbolicLink()) throw new Error('--receipt must not be a symlink.');
  if (existing && !existing.isFile()) throw new Error('--receipt must be a regular file.');
  const targetReal = existing ? realpathSafe(resolved) : path.join(parentReal, path.basename(resolved));
  if (!targetReal || !isInsidePath(targetReal, receiptRoot.real)) throw new Error(`--receipt must stay inside ${receiptRoot.real}.`);
  fs.writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(resolved, 0o600);
  return resolved;
}

function stamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function printHelp() {
  console.log(`WAWCO Fin retention cleanup\n\nUsage:\n  node scripts/fin-finance-retention-cleanup.mjs --apply\n\nOptions:\n  --apply                  Delete or trim files. Omit for dry-run.\n  --keep-snapshots N       Keep latest N scheduler Mercury snapshots. Default 168.\n  --keep-exports N         Keep latest N hosted-safe scheduler exports. Default 168.\n  --keep-receipts N        Keep latest N scheduler/cleanup receipts. Default 336.\n  --max-log-bytes N        Trim logs only when larger than N bytes. Default 1048576.\n  --keep-log-bytes N       Keep last N bytes when trimming logs. Default 262144.\n  --log-dir PATH           Restricted to ~/Library/Logs/wawco-fin.\n  --receipt PATH           Optional cleanup receipt under .finance/fin-refresh-receipts/.\n  --help                   Show help.\n\nBoundary:\n  This script only prunes known WAWCO Fin generated artifacts: .finance/snapshots/mercury-*-system-refresh directories, .finance/exports/fin-dashboard-summary-*.json files, .finance/fin-refresh-receipts/fin-refresh-*.json and retention-cleanup-*.json files, and Fin refresh logs. It rejects symlinked cleanup roots, skips symlink candidates, and does not call providers or read raw finance file contents.\n`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const apply = args.apply === true;
  const keepSnapshots = intArg(args, 'keep-snapshots', 168, 1);
  const keepExports = intArg(args, 'keep-exports', 168, 1);
  const keepReceipts = intArg(args, 'keep-receipts', 336, 1);
  const maxLogBytes = intArg(args, 'max-log-bytes', 1_048_576, 1);
  const keepLogBytes = intArg(args, 'keep-log-bytes', 262_144, 1, maxLogBytes);
  const logDir = path.resolve(expandHome(args['log-dir'] || DEFAULT_LOG_DIR));
  const rootInfo = validateDirectoryRoot(ROOT_DIR, { label: 'project root', required: true });
  const financeRootInfo = validateDirectoryRoot(FINANCE_DIR, { label: 'finance directory', required: true, parentReal: rootInfo.real });
  const logRootInfo = validateLogDir(logDir);

  const summary = {
    ok: true,
    apply,
    createdAt: new Date().toISOString(),
    retention: {
      snapshots: pruneByCount({ dir: SNAPSHOT_DIR, match: /^mercury-.*-system-refresh$/, keep: keepSnapshots, apply, expectedType: 'dir', parentReal: financeRootInfo.real, label: 'snapshot directory' }),
      exports: pruneByCount({ dir: EXPORT_DIR, match: /^fin-dashboard-summary-\d{4}-\d{2}-\d{8}T\d{6}Z\.json$/, keep: keepExports, apply, expectedType: 'file', parentReal: financeRootInfo.real, label: 'export directory' }),
      receipts: pruneByCount({ dir: RECEIPT_DIR, match: /^(fin-refresh-\d{4}-\d{2}-\d{8}T\d{6}Z|retention-cleanup-\d{8}T\d{6}Z)\.json$/, keep: keepReceipts, apply, expectedType: 'file', parentReal: financeRootInfo.real, label: 'receipt directory' }),
      logs: [
        trimLog({ filePath: path.join(logDir, 'fin-refresh.out.log'), logRootInfo, maxBytes: maxLogBytes, keepBytes: keepLogBytes, apply }),
        trimLog({ filePath: path.join(logDir, 'fin-refresh.err.log'), logRootInfo, maxBytes: maxLogBytes, keepBytes: keepLogBytes, apply }),
        trimLog({ filePath: path.join(logDir, 'fin-retention-cleanup.out.log'), logRootInfo, maxBytes: maxLogBytes, keepBytes: keepLogBytes, apply }),
        trimLog({ filePath: path.join(logDir, 'fin-retention-cleanup.err.log'), logRootInfo, maxBytes: maxLogBytes, keepBytes: keepLogBytes, apply }),
      ],
    },
  };

  const receiptPath = args.receipt
    ? writeJson(args.receipt, summary, financeRootInfo)
    : apply
      ? writeJson(path.join(RECEIPT_DIR, `retention-cleanup-${stamp()}.json`), summary, financeRootInfo)
      : '';
  if (receiptPath) summary.receiptPath = path.relative(ROOT_DIR, receiptPath);

  console.log(JSON.stringify({
    ok: summary.ok,
    apply: summary.apply,
    removed: {
      snapshots: summary.retention.snapshots.removed,
      exports: summary.retention.exports.removed,
      receipts: summary.retention.receipts.removed,
    },
    candidates: {
      snapshots: summary.retention.snapshots.candidates,
      exports: summary.retention.exports.candidates,
      receipts: summary.retention.receipts.candidates,
    },
    trimmedLogs: summary.retention.logs.filter((log) => log.trimmed).map((log) => log.path),
    receiptPath: summary.receiptPath || '',
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
