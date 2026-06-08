const crypto = require('crypto');

const SESSION_COOKIE = 'windex_session';
const OAUTH_STATE_COOKIE = 'windex_oauth_state';
const DEFAULT_ALLOWED_DOMAIN = 'whatarewecapableof.com';
const GOOGLE_ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);

function env(name, fallback = '') {
  return String(process.env[name] ?? fallback).trim();
}

function getBaseUrl(req) {
  const configured = env('INDEX_BASE_URL');
  if (configured) return configured.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

function authConfig() {
  const clientId = env('INDEX_GOOGLE_CLIENT_ID');
  const clientSecret = env('INDEX_GOOGLE_CLIENT_SECRET');
  const sessionSecret = env('INDEX_SESSION_SECRET');
  const allowedDomain = env('INDEX_ALLOWED_DOMAIN', DEFAULT_ALLOWED_DOMAIN).toLowerCase();
  const allowedEmails = env('INDEX_ALLOWED_EMAILS')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  const requireHostedDomain = env('INDEX_REQUIRE_HOSTED_DOMAIN', '1') !== '0';

  return {
    configured: Boolean(clientId && clientSecret && sessionSecret),
    clientId,
    clientSecret,
    sessionSecret,
    allowedDomain,
    allowedEmails,
    requireHostedDomain,
  };
}

function parseCookies(cookieHeader = '') {
  return String(cookieHeader || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const eq = part.indexOf('=');
      if (eq === -1) return cookies;
      try {
        cookies[decodeURIComponent(part.slice(0, eq))] = decodeURIComponent(part.slice(eq + 1));
      } catch (error) {
        return cookies;
      }
      return cookies;
    }, {});
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function sign(value, secret = authConfig().sessionSecret) {
  if (!secret) throw new Error('Missing INDEX_SESSION_SECRET');
  return crypto.createHmac('sha256', secret).update(String(value)).digest('hex');
}

function cookieAttrs(req, maxAgeSeconds) {
  const secure = req.headers['x-forwarded-proto'] === 'https' || env('VERCEL') === '1';
  return [
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    secure ? 'Secure' : '',
    Number.isFinite(maxAgeSeconds) ? `Max-Age=${maxAgeSeconds}` : '',
  ].filter(Boolean).join('; ');
}

function createOAuthStateCookie(req) {
  const state = crypto.randomBytes(24).toString('base64url');
  const expiresAt = Math.floor(Date.now() / 1000) + 10 * 60;
  const payload = `v1.${expiresAt}.${state}`;
  const value = `${payload}.${sign(payload)}`;
  return {
    state,
    cookie: `${OAUTH_STATE_COOKIE}=${encodeURIComponent(value)}; ${cookieAttrs(req, 10 * 60)}`,
  };
}

function verifyOAuthState(req, state) {
  const value = parseCookies(req.headers.cookie || '')[OAUTH_STATE_COOKIE];
  if (!value || !state) return false;
  const parts = value.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return false;
  const expiresAt = Number(parts[1]);
  if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return false;
  if (!safeEqual(parts[2], state)) return false;
  const payload = `v1.${parts[1]}.${parts[2]}`;
  return safeEqual(parts[3], sign(payload));
}

function clearOAuthStateCookie() {
  return `${OAUTH_STATE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function createSessionCookie(req, user) {
  const expiresAt = Math.floor(Date.now() / 1000) + 14 * 24 * 60 * 60;
  const body = Buffer.from(JSON.stringify({
    sub: user.sub,
    email: user.email,
    email_verified: user.email_verified !== false,
    hd: user.hd || '',
    name: user.name || user.email,
    picture: user.picture || '',
  })).toString('base64url');
  const payload = `v1.${expiresAt}.${body}`;
  const value = `${payload}.${sign(payload)}`;
  return `${SESSION_COOKIE}=${encodeURIComponent(value)}; ${cookieAttrs(req, 14 * 24 * 60 * 60)}`;
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function getSession(req) {
  const config = authConfig();
  if (!config.configured) return null;
  const value = parseCookies(req.headers.cookie || '')[SESSION_COOKIE];
  if (!value) return null;
  const parts = value.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return null;
  const expiresAt = Number(parts[1]);
  if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return null;
  const payload = `v1.${parts[1]}.${parts[2]}`;
  if (!safeEqual(parts[3], sign(payload, config.sessionSecret))) return null;

  try {
    const user = JSON.parse(Buffer.from(parts[2], 'base64url').toString('utf8'));
    if (!isAllowedUser(user)) return null;
    return user;
  } catch (error) {
    return null;
  }
}

function isAllowedUser(user) {
  const config = authConfig();
  const email = String(user?.email || '').toLowerCase();
  const hostedDomain = String(user?.hd || '').toLowerCase();
  const explicitlyAllowed = config.allowedEmails.includes(email);
  if (!email || user.email_verified === false) return false;
  if (config.allowedEmails.length && !explicitlyAllowed) return false;
  if (!email.endsWith(`@${config.allowedDomain}`)) return false;
  if (config.requireHostedDomain && !explicitlyAllowed && hostedDomain !== config.allowedDomain) return false;
  return true;
}

function requestOrigin(req) {
  const origin = String(req.headers.origin || '').trim();
  if (origin) return origin;

  const referer = String(req.headers.referer || req.headers.referrer || '').trim();
  if (!referer) return '';
  try {
    return new URL(referer).origin;
  } catch (error) {
    return '';
  }
}

function requireCsrf(req) {
  const method = String(req.method || 'GET').toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return true;

  let expectedOrigin = '';
  try {
    expectedOrigin = new URL(getBaseUrl(req)).origin;
  } catch (error) {
    return false;
  }

  const actualOrigin = requestOrigin(req);
  return Boolean(actualOrigin && expectedOrigin && safeEqual(actualOrigin, expectedOrigin));
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(JSON.stringify(body, null, 2));
}

async function exchangeCodeForTokens({ code, redirectUri }) {
  const config = authConfig();
  const body = new URLSearchParams({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.id_token) throw new Error('Google token exchange failed');
  return data;
}

async function fetchGoogleKeys() {
  const response = await fetch('https://www.googleapis.com/oauth2/v3/certs');
  const data = await response.json();
  if (!response.ok || !Array.isArray(data.keys)) throw new Error('Google key fetch failed');
  return data.keys;
}

function base64urlJson(value) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

async function verifyGoogleIdToken(idToken) {
  const config = authConfig();
  const [headerPart, payloadPart, signaturePart] = String(idToken).split('.');
  if (!headerPart || !payloadPart || !signaturePart) throw new Error('Invalid Google ID token');
  const header = base64urlJson(headerPart);
  const payload = base64urlJson(payloadPart);
  if (header.alg !== 'RS256') throw new Error('Unexpected Google token algorithm');
  if (!GOOGLE_ISSUERS.has(payload.iss)) throw new Error('Unexpected Google token issuer');
  if (payload.aud !== config.clientId) throw new Error('Unexpected Google token audience');
  if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) throw new Error('Expired Google token');
  if (!payload.email_verified) throw new Error('Google email is not verified');

  const keys = await fetchGoogleKeys();
  const key = keys.find((candidate) => candidate.kid === header.kid);
  if (!key) throw new Error('Google signing key not found');
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerPart}.${payloadPart}`);
  verifier.end();
  const publicKey = crypto.createPublicKey({ key, format: 'jwk' });
  const signature = Buffer.from(signaturePart, 'base64url');
  if (!verifier.verify(publicKey, signature)) throw new Error('Invalid Google token signature');

  const user = {
    sub: payload.sub,
    email: String(payload.email || '').toLowerCase(),
    email_verified: payload.email_verified,
    name: payload.name || payload.email,
    picture: payload.picture || '',
    hd: payload.hd || '',
  };
  if (!isAllowedUser(user)) throw new Error('Account is not allowed for this workspace');
  return user;
}

module.exports = {
  authConfig,
  getBaseUrl,
  createOAuthStateCookie,
  verifyOAuthState,
  clearOAuthStateCookie,
  createSessionCookie,
  clearSessionCookie,
  getSession,
  requireCsrf,
  json,
  exchangeCodeForTokens,
  verifyGoogleIdToken,
};
