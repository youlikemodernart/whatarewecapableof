const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const COOKIE_NAME = 'wawco_tracker_session';
const DEFAULT_SESSION_DAYS = 14;

function env(name, fallback = '') {
  return (process.env[name] ?? fallback).trim();
}

function getPasswordConfig() {
  const passwordHash = env('TRACKER_PASSWORD_HASH');
  const password = env('TRACKER_PASSWORD');

  if (!passwordHash && !password) {
    throw new Error('Missing TRACKER_PASSWORD_HASH or TRACKER_PASSWORD');
  }

  return { passwordHash, password };
}

function getSessionSecret() {
  const explicit = env('TRACKER_SESSION_SECRET');
  if (explicit) return explicit;

  const { passwordHash, password } = getPasswordConfig();
  return passwordHash || password;
}

function safeEqual(a, b) {
  const aBuffer = Buffer.from(String(a));
  const bBuffer = Buffer.from(String(b));
  if (aBuffer.length !== bBuffer.length) return false;
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function verifyPassword(candidate) {
  const passwordInput = String(candidate || '');
  const { passwordHash, password } = getPasswordConfig();

  if (passwordHash) {
    const normalized = passwordHash.startsWith('sha256:')
      ? passwordHash.slice('sha256:'.length)
      : passwordHash;
    return /^[a-f0-9]{64}$/i.test(normalized) && safeEqual(sha256(passwordInput), normalized.toLowerCase());
  }

  return safeEqual(passwordInput, password);
}

function parseCookies(cookieHeader = '') {
  return String(cookieHeader || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const eqIndex = part.indexOf('=');
      if (eqIndex === -1) return cookies;

      try {
        const key = decodeURIComponent(part.slice(0, eqIndex).trim());
        const value = decodeURIComponent(part.slice(eqIndex + 1).trim());
        cookies[key] = value;
      } catch (err) {
        return cookies;
      }

      return cookies;
    }, {});
}

function sign(value, secret = getSessionSecret()) {
  return crypto.createHmac('sha256', secret).update(String(value)).digest('hex');
}

function createSessionCookie(req) {
  const days = Math.max(1, parseInt(env('TRACKER_SESSION_DAYS', String(DEFAULT_SESSION_DAYS)), 10) || DEFAULT_SESSION_DAYS);
  const expiresAt = Math.floor(Date.now() / 1000) + days * 24 * 60 * 60;
  const payload = `v1.${expiresAt}`;
  const signature = sign(payload);
  const value = `${payload}.${signature}`;
  const secure = req.headers['x-forwarded-proto'] === 'https' || env('VERCEL') === '1';

  return [
    `${COOKIE_NAME}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    secure ? 'Secure' : '',
    `Max-Age=${days * 24 * 60 * 60}`,
  ].filter(Boolean).join('; ');
}

function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function verifySession(req) {
  getPasswordConfig();

  const cookies = parseCookies(req.headers.cookie || '');
  const value = cookies[COOKIE_NAME];
  if (!value) return false;

  const parts = value.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return false;

  const expiresAt = Number(parts[1]);
  if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return false;

  const payload = `v1.${parts[1]}`;
  const expected = sign(payload);
  return safeEqual(parts[2], expected);
}

function requireSession(req, res) {
  try {
    if (verifySession(req)) return true;
  } catch (err) {
    res.status(500).json({ error: 'Tracker authentication is not configured.' });
    return false;
  }

  res.status(401).json({ error: 'Password required.' });
  return false;
}

function stripMarkdown(value = '') {
  return String(value)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .trim();
}

function parseMarkdownLink(value = '') {
  const match = /\[([^\]]+)\]\(([^)]+)\)/.exec(value);
  if (!match) return null;
  return { label: match[1], href: match[2] };
}

function parseTable(block) {
  const table = {};
  const rows = block.match(/^\|[^\n]+\|$/gm) || [];

  for (const row of rows) {
    if (/^\|\s*-+\s*\|\s*-+\s*\|$/.test(row)) continue;
    const cells = row
      .slice(1, -1)
      .split('|')
      .map((cell) => cell.trim());
    if (cells.length < 2 || !cells[0]) continue;
    table[cells[0].toLowerCase()] = cells.slice(1).join(' | ').trim();
  }

  return table;
}

function extractLabel(block, label) {
  const labels = Array.isArray(label) ? label : [label];

  for (const candidate of labels) {
    const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\*\\*${escaped}(?:\\s*\\([^\\n:]+\\))?:\\*\\*\\s*([\\s\\S]*?)(?=\\n\\*\\*[A-Z][^\\n]*?:\\*\\*|\\n---|$)`, 'i');
    const match = regex.exec(block);
    if (!match) continue;

    return normalizeExtractedText(match[1]);
  }

  return '';
}

function normalizeExtractedText(value = '') {
  return String(value)
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractBullets(section = '') {
  return String(section)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line))
    .map((line) => stripMarkdown(line.replace(/^[-*]\s+/, '')));
}

function extractOpenQuestions(value = '') {
  const text = String(value || '').trim();
  if (!text) return [];

  const numbered = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^\d+\.\s+/.test(line))
    .map((line) => stripMarkdown(line.replace(/^\d+\.\s+/, '')));
  if (numbered.length) return numbered;

  return text
    .split(/;|\n|,/)
    .map((item) => stripMarkdown(item))
    .map((item) => item.replace(/^and\s+/i, '').trim())
    .filter(Boolean);
}

function deriveTags(status = '', next = '') {
  const combined = `${status} ${next}`.toLowerCase();
  const tags = [];

  if (/awaiting|waiting/.test(combined)) tags.push('awaiting');
  if (/ready|send|outreach|review|needs|before|schedule|call|question/.test(combined)) tags.push('attention');
  if (/delivered|deployed|complete|migration complete/.test(combined)) tags.push('delivered');
  if (/not yet|deferred|paused/.test(combined)) tags.push('parked');

  return [...new Set(tags)];
}

function getTableValue(table, key) {
  return stripMarkdown(table[key] || '');
}

function parseProposalBlock(name, block) {
  const table = parseTable(block);
  const urlLink = parseMarkdownLink(table.url || '');
  const history = extractBullets(extractLabel(block, 'History'));
  const next = stripMarkdown(extractLabel(block, 'Next'));
  const status = getTableValue(table, 'status');

  return {
    name: stripMarkdown(name),
    slug: stripMarkdown(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    url: urlLink?.href || getTableValue(table, 'url'),
    urlLabel: urlLink?.label || '',
    prepared: getTableValue(table, 'prepared'),
    status,
    relationship: getTableValue(table, 'relationship'),
    tabs: getTableValue(table, 'tabs'),
    source: getTableValue(table, 'source'),
    client: stripMarkdown(extractLabel(block, 'Client')),
    keyPeople: stripMarkdown(extractLabel(block, 'Key people')),
    proposedWork: stripMarkdown(extractLabel(block, ["What we're proposing", 'What we observed'])),
    publicBoundaries: stripMarkdown(extractLabel(block, 'Public boundaries')),
    pricing: stripMarkdown(extractLabel(block, 'Pricing (not on site)')),
    openQuestions: extractOpenQuestions(extractLabel(block, 'Open questions')),
    next,
    history,
    lastHistory: history[history.length - 1] || '',
    deepDocs: stripMarkdown(extractLabel(block, 'Deep docs')),
    tags: deriveTags(status, next),
  };
}

function parseProposals(markdown) {
  const activeMatch = /(?:^|\n)##\s+Active\b/.exec(markdown);
  const sectionStart = activeMatch ? activeMatch.index + activeMatch[0].length : 0;
  const rest = markdown.slice(sectionStart);
  const nextSectionIndex = rest.search(/\n##\s+(?!Active\b)/);
  const source = nextSectionIndex >= 0 ? rest.slice(0, nextSectionIndex) : rest;
  const matches = [...source.matchAll(/^###\s+(.+)$/gm)];
  const proposals = [];

  matches.forEach((match, index) => {
    const name = match[1].trim();
    const blockStart = match.index + match[0].length;
    const nextMatch = matches[index + 1];
    const nextSection = source.slice(blockStart).search(/^##\s+/m);
    let blockEnd = nextMatch ? nextMatch.index : source.length;
    if (!nextMatch && nextSection >= 0) blockEnd = blockStart + nextSection;

    const block = source.slice(blockStart, blockEnd).trim();
    proposals.push(parseProposalBlock(name, block));
  });

  return proposals;
}

function readTrackerData() {
  const proposalsPath = path.join(process.cwd(), 'PROPOSALS.md');
  const markdown = fs.readFileSync(proposalsPath, 'utf8');
  const stats = fs.statSync(proposalsPath);
  const proposals = parseProposals(markdown);

  return {
    generatedAt: new Date().toISOString(),
    source: 'PROPOSALS.md',
    sourceUpdatedAt: stats.mtime.toISOString(),
    count: proposals.length,
    proposals,
  };
}

module.exports = {
  COOKIE_NAME,
  verifyPassword,
  createSessionCookie,
  clearSessionCookie,
  verifySession,
  requireSession,
  parseProposals,
  readTrackerData,
};
