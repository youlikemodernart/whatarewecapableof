const crypto = require('crypto');

const SYSTEM_IMPORT_KEY_ID_HEADER = 'x-fin-import-key-id';
const SYSTEM_IMPORT_TIMESTAMP_HEADER = 'x-fin-import-timestamp';
const SYSTEM_IMPORT_NONCE_HEADER = 'x-fin-import-nonce';
const SYSTEM_IMPORT_BODY_SHA256_HEADER = 'x-fin-import-body-sha256';
const SYSTEM_IMPORT_SIGNATURE_HEADER = 'x-fin-import-signature';
const DEFAULT_SYSTEM_IMPORT_PATH = '/api/finance/system-import-summary';
const DEFAULT_MAX_SKEW_SECONDS = 5 * 60;
const DEFAULT_NONCE_TTL_SECONDS = 15 * 60;

function env(name, fallback = '') {
  return String(process.env[name] ?? fallback).trim();
}

function boundedNumberEnv(name, fallback, min, max) {
  const parsed = Number(env(name, String(fallback)));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function makeSystemAuthError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function systemImportsEnabled() {
  return env('FIN_FINANCE_IMPORTS_ENABLED', '1') !== '0'
    && env('FIN_FINANCE_SYSTEM_IMPORTS_ENABLED', '0') === '1';
}

function cleanKeyId(value) {
  const text = String(value || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{1,78}[A-Za-z0-9]$/.test(text)) {
    throw makeSystemAuthError(401, 'System import key id is invalid.');
  }
  return text;
}

function cleanNonce(value) {
  const text = String(value || '').trim();
  if (!/^[A-Za-z0-9._~-]{16,128}$/.test(text)) {
    throw makeSystemAuthError(401, 'System import nonce is invalid.');
  }
  return text;
}

function cleanHexDigest(value, label) {
  const text = String(value || '').trim().toLowerCase().replace(/^sha256=/, '');
  if (!/^[a-f0-9]{64}$/.test(text)) throw makeSystemAuthError(401, `${label} is invalid.`);
  return text;
}

function parseKeyPairs(raw) {
  const text = String(raw || '').trim();
  if (!text) return new Map();
  if (text.startsWith('{')) {
    const parsed = JSON.parse(text);
    return new Map(Object.entries(parsed).map(([key, value]) => [cleanKeyId(key), String(value || '')]));
  }
  const pairs = new Map();
  for (const part of text.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean)) {
    const separator = part.includes('=') ? '=' : ':';
    const index = part.indexOf(separator);
    if (index <= 0) throw makeSystemAuthError(500, 'System import key configuration is invalid.');
    const keyId = cleanKeyId(part.slice(0, index));
    const secret = part.slice(index + 1).trim();
    pairs.set(keyId, secret);
  }
  return pairs;
}

function configuredSystemImportKeys() {
  const pairs = parseKeyPairs(env('FIN_FINANCE_SYSTEM_IMPORT_KEYS'));
  const singleSecret = env('FIN_FINANCE_SYSTEM_IMPORT_SECRET');
  if (singleSecret) {
    const keyId = cleanKeyId(env('FIN_FINANCE_SYSTEM_IMPORT_KEY_ID', 'mini-b'));
    pairs.set(keyId, singleSecret);
  }
  return pairs;
}

function secretForSystemImportKey(keyId) {
  const keys = configuredSystemImportKeys();
  const secret = keys.get(cleanKeyId(keyId));
  if (!secret) throw makeSystemAuthError(401, 'System import key id is not allowed.');
  if (Buffer.byteLength(secret, 'utf8') < 32) throw makeSystemAuthError(500, 'System import secret is too short.');
  return secret;
}

function bodySha256(rawBody) {
  return crypto.createHash('sha256').update(Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody || ''), 'utf8')).digest('hex');
}

function pathFromRequest(req) {
  return new URL(req.url || DEFAULT_SYSTEM_IMPORT_PATH, 'https://fin.local').pathname || DEFAULT_SYSTEM_IMPORT_PATH;
}

function canonicalSystemImportString({ method = 'POST', path = DEFAULT_SYSTEM_IMPORT_PATH, timestamp, nonce, bodyHash }) {
  return ['v1', String(method || 'POST').toUpperCase(), path || DEFAULT_SYSTEM_IMPORT_PATH, timestamp, nonce, bodyHash].join('\n');
}

function hmacSha256Hex(secret, value) {
  return crypto.createHmac('sha256', secret).update(String(value)).digest('hex');
}

function safeEqualHex(left, right) {
  const a = Buffer.from(String(left || ''), 'hex');
  const b = Buffer.from(String(right || ''), 'hex');
  if (a.length !== b.length || a.length === 0) return false;
  return crypto.timingSafeEqual(a, b);
}

function header(req, name) {
  const lower = name.toLowerCase();
  return req.headers?.[lower] ?? req.headers?.[name] ?? '';
}

function parseTimestamp(value, nowMs = Date.now()) {
  const text = String(value || '').trim();
  if (!text) throw makeSystemAuthError(401, 'System import timestamp is required.');
  const parsed = /^\d+$/.test(text) ? Number(text) * 1000 : Date.parse(text);
  if (!Number.isFinite(parsed)) throw makeSystemAuthError(401, 'System import timestamp is invalid.');
  const maxSkewMs = boundedNumberEnv('FIN_FINANCE_SYSTEM_IMPORT_MAX_SKEW_SECONDS', DEFAULT_MAX_SKEW_SECONDS, 30, 60 * 60) * 1000;
  if (Math.abs(nowMs - parsed) > maxSkewMs) throw makeSystemAuthError(401, 'System import timestamp is outside the allowed window.');
  return new Date(parsed).toISOString();
}

function verifySystemImportRequest(req, rawBody, options = {}) {
  if (!systemImportsEnabled()) throw makeSystemAuthError(403, 'System finance imports are disabled.');
  if (String(req.method || '').toUpperCase() !== 'POST') throw makeSystemAuthError(405, 'Method not allowed');

  const keyId = cleanKeyId(header(req, SYSTEM_IMPORT_KEY_ID_HEADER));
  const nonce = cleanNonce(header(req, SYSTEM_IMPORT_NONCE_HEADER));
  const timestamp = parseTimestamp(header(req, SYSTEM_IMPORT_TIMESTAMP_HEADER), options.nowMs || Date.now());
  const bodyHash = bodySha256(rawBody);
  const suppliedBodyHash = cleanHexDigest(header(req, SYSTEM_IMPORT_BODY_SHA256_HEADER), 'System import body SHA-256');
  if (!safeEqualHex(bodyHash, suppliedBodyHash)) throw makeSystemAuthError(401, 'System import body SHA-256 does not match.');

  const signature = cleanHexDigest(header(req, SYSTEM_IMPORT_SIGNATURE_HEADER), 'System import signature');
  const secret = secretForSystemImportKey(keyId);
  const path = pathFromRequest(req);
  const canonical = canonicalSystemImportString({ method: req.method, path, timestamp, nonce, bodyHash });
  const expected = hmacSha256Hex(secret, canonical);
  if (!safeEqualHex(expected, signature)) throw makeSystemAuthError(401, 'System import signature is invalid.');

  return {
    keyId,
    nonce,
    timestamp,
    bodySha256: bodyHash,
    canonicalVersion: 'v1',
    path,
    nonceTtlSeconds: boundedNumberEnv('FIN_FINANCE_SYSTEM_IMPORT_NONCE_TTL_SECONDS', DEFAULT_NONCE_TTL_SECONDS, 60, 24 * 60 * 60),
  };
}

function signSystemImportRequest({ keyId, secret, method = 'POST', path = DEFAULT_SYSTEM_IMPORT_PATH, body, timestamp = new Date().toISOString(), nonce = crypto.randomBytes(18).toString('base64url') }) {
  const cleanId = cleanKeyId(keyId);
  const cleanNonceValue = cleanNonce(nonce);
  const bodyHash = bodySha256(body);
  const canonicalTimestamp = new Date(Date.parse(timestamp)).toISOString();
  const canonical = canonicalSystemImportString({ method, path, timestamp: canonicalTimestamp, nonce: cleanNonceValue, bodyHash });
  const signature = hmacSha256Hex(secret, canonical);
  return {
    keyId: cleanId,
    nonce: cleanNonceValue,
    timestamp: canonicalTimestamp,
    bodySha256: bodyHash,
    signature,
    headers: {
      [SYSTEM_IMPORT_KEY_ID_HEADER]: cleanId,
      [SYSTEM_IMPORT_TIMESTAMP_HEADER]: canonicalTimestamp,
      [SYSTEM_IMPORT_NONCE_HEADER]: cleanNonceValue,
      [SYSTEM_IMPORT_BODY_SHA256_HEADER]: bodyHash,
      [SYSTEM_IMPORT_SIGNATURE_HEADER]: `sha256=${signature}`,
    },
  };
}

module.exports = {
  SYSTEM_IMPORT_KEY_ID_HEADER,
  SYSTEM_IMPORT_TIMESTAMP_HEADER,
  SYSTEM_IMPORT_NONCE_HEADER,
  SYSTEM_IMPORT_BODY_SHA256_HEADER,
  SYSTEM_IMPORT_SIGNATURE_HEADER,
  DEFAULT_SYSTEM_IMPORT_PATH,
  systemImportsEnabled,
  bodySha256,
  canonicalSystemImportString,
  signSystemImportRequest,
  verifySystemImportRequest,
};
