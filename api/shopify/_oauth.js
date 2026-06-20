const crypto = require('crypto');

const DEFAULT_SCOPE_LIST = [
  'read_products',
  'write_products',
  'read_inventory',
  'write_inventory',
  'read_locations',
  'read_files',
  'write_files',
  'read_themes',
  'write_themes',
  'read_metaobjects',
  'write_metaobjects',
  'read_metaobject_definitions',
  'write_metaobject_definitions',
  'read_publications',
  'write_publications',
  'read_content',
  'write_content',
  'read_online_store_pages',
  'read_online_store_navigation',
  'write_online_store_navigation',
  'read_translations',
  'write_translations',
];
const DEFAULT_SCOPES = DEFAULT_SCOPE_LIST.join(',');
const STATE_TTL_MS = 10 * 60 * 1000;

function env(name, fallback = '') {
  return String(process.env[name] || fallback).trim();
}

function getConfig() {
  const clientId = env('SHOPIFY_WAWCO_CLIENT_ID');
  const clientSecret = env('SHOPIFY_WAWCO_CLIENT_SECRET');
  const scopes = normalizeScopes([DEFAULT_SCOPES, env('SHOPIFY_WAWCO_SCOPES')].filter(Boolean).join(','));

  if (!clientId || !clientSecret) {
    throw new Error('Missing SHOPIFY_WAWCO_CLIENT_ID or SHOPIFY_WAWCO_CLIENT_SECRET');
  }

  return { clientId, clientSecret, scopes };
}

function normalizeScopes(value = '') {
  const seen = new Set();
  const scopes = [];
  for (const scope of String(value || '').split(',')) {
    const cleaned = scope.trim();
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    scopes.push(cleaned);
  }
  return scopes.join(',');
}

function normalizeShop(value = '') {
  const cleaned = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^admin\.shopify\.com\/store\//, '')
    .replace(/\/.*$/, '')
    .replace(/\/$/, '');

  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(cleaned)) {
    throw new Error('Invalid shop domain. Use the myshopify.com domain.');
  }

  return cleaned;
}

function baseUrl(req) {
  const explicit = env('SHOPIFY_WAWCO_BASE_URL');
  if (explicit) return explicit.replace(/\/$/, '');

  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

function callbackUrl(req) {
  return `${baseUrl(req)}/api/shopify/callback`;
}

function sign(value, secret) {
  return crypto.createHmac('sha256', secret).update(String(value)).digest('hex');
}

function safeEqual(a, b) {
  const aBuffer = Buffer.from(String(a));
  const bBuffer = Buffer.from(String(b));
  if (aBuffer.length !== bBuffer.length) return false;
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

function createState(shop, clientSecret) {
  const issuedAt = Date.now();
  const nonce = crypto.randomBytes(16).toString('hex');
  const payload = `${shop}.${issuedAt}.${nonce}`;
  const signature = sign(payload, clientSecret);
  return Buffer.from(`${payload}.${signature}`).toString('base64url');
}

function verifyState(state, shop, clientSecret) {
  if (!state) return false;

  let decoded;
  try {
    decoded = Buffer.from(String(state), 'base64url').toString('utf8');
  } catch (err) {
    return false;
  }

  const match = decoded.match(/^([a-z0-9][a-z0-9-]*\.myshopify\.com)\.(\d+)\.([a-f0-9]{32})\.([a-f0-9]{64})$/);
  if (!match) return false;

  const [, stateShop, issuedAt, nonce, signature] = match;
  return verifyStateParts(stateShop, issuedAt, nonce, signature, shop, clientSecret);
}

function verifyStateParts(stateShop, issuedAt, nonce, signature, shop, clientSecret) {
  const issued = Number(issuedAt);
  if (stateShop !== shop) return false;
  if (!Number.isFinite(issued) || Date.now() - issued > STATE_TTL_MS) return false;
  if (!/^[a-f0-9]{32}$/.test(String(nonce))) return false;
  const payload = `${stateShop}.${issued}.${nonce}`;
  const expected = sign(payload, clientSecret);
  return safeEqual(expected, signature);
}

function flattenQuery(query = {}) {
  const entries = [];
  for (const [key, value] of Object.entries(query)) {
    if (key === 'hmac' || key === 'signature') continue;
    if (Array.isArray(value)) {
      for (const item of value) entries.push([key, String(item)]);
    } else if (value !== undefined) {
      entries.push([key, String(value)]);
    }
  }
  return entries.sort(([a], [b]) => a.localeCompare(b));
}

function verifyShopifyHmac(query, clientSecret) {
  const received = String(query.hmac || '');
  if (!/^[a-f0-9]{64}$/i.test(received)) return false;

  const message = flattenQuery(query)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  const expected = crypto.createHmac('sha256', clientSecret).update(message).digest('hex');
  return safeEqual(expected, received);
}

function html(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>WAWCO Shopify OAuth</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 40px; max-width: 760px; line-height: 1.45; }
    code, textarea { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    textarea { width: 100%; min-height: 96px; padding: 12px; box-sizing: border-box; }
    .error { color: #a40000; }
  </style>
</head>
<body>${body}</body>
</html>`);
}

module.exports = {
  getConfig,
  normalizeShop,
  callbackUrl,
  createState,
  verifyState,
  verifyShopifyHmac,
  html,
};
