const buckets = new Map();

function clientKey(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || String(req.headers['x-real-ip'] || req.socket?.remoteAddress || 'local');
}

function checkRateLimit(req, scope, { limit = 20, windowMs = 60_000 } = {}) {
  const now = Date.now();
  const key = `${scope}:${clientKey(req)}`;
  const bucket = buckets.get(key) || { count: 0, resetAt: now + windowMs };
  if (bucket.resetAt <= now) {
    bucket.count = 0;
    bucket.resetAt = now + windowMs;
  }
  bucket.count += 1;
  buckets.set(key, bucket);
  if (bucket.count > limit) {
    const error = new Error('Too many attempts. Try again later.');
    error.status = 429;
    throw error;
  }
}

module.exports = { checkRateLimit };
