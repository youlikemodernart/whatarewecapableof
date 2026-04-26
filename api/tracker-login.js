const { verifyPassword, createSessionCookie } = require('./_tracker');

const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const attempts = new Map();

function getClientKey(req) {
  return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')
    .split(',')[0]
    .trim()
    .toLowerCase();
}

function isRateLimited(key) {
  const now = Date.now();
  const record = attempts.get(key);
  if (!record || record.resetAt <= now) return false;
  return record.count >= MAX_ATTEMPTS;
}

function recordFailure(key) {
  const now = Date.now();
  const record = attempts.get(key);
  if (!record || record.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + ATTEMPT_WINDOW_MS });
    return;
  }

  record.count += 1;
  attempts.set(key, record);
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const clientKey = getClientKey(req);
  if (isRateLimited(clientKey)) {
    return res.status(429).json({ error: 'Too many attempts. Try again later.' });
  }

  try {
    const password = req.body?.password;
    if (!verifyPassword(password)) {
      recordFailure(clientKey);
      return res.status(401).json({ error: 'Incorrect password.' });
    }

    attempts.delete(clientKey);
    res.setHeader('Set-Cookie', createSessionCookie(req));
    return res.json({ success: true });
  } catch (err) {
    console.error('Tracker login error:', err.message);
    return res.status(500).json({ error: 'Tracker authentication is not configured.' });
  }
};
