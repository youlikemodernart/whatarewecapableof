const { createPiopCheckoutSession } = require('../_piop_checkout');

const RETURN_URL = 'https://whatarewecapableof.com/piop';
const MAX_BODY_BYTES = 2048;
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const rateWindows = new Map();
const ALLOWED_ORIGINS = new Set([
  'https://whatarewecapableof.com',
  'https://www.whatarewecapableof.com',
]);

function requestOrigin(req) {
  const origin = String(req.headers?.origin || '').trim();
  if (origin) return origin;
  const referer = String(req.headers?.referer || '').trim();
  if (!referer) return '';
  try { return new URL(referer).origin; } catch { return ''; }
}

function parseBody(body) {
  if (!body) return {};
  if (typeof body === 'object' && !Buffer.isBuffer(body)) return body;
  const text = Buffer.isBuffer(body) ? body.toString('utf8') : String(body);
  return Object.fromEntries(new URLSearchParams(text));
}

function wantsJson(req) {
  return String(req.headers?.accept || '').toLowerCase().includes('application/json');
}

function checkoutEnabled() {
  return String(process.env.PIOP_CHECKOUT_ENABLED || '').trim() === '1';
}

function requestIp(req) {
  const forwarded = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || 'unknown';
}

function bodyTooLarge(req) {
  const declared = Number(req.headers?.['content-length'] || 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return true;
  if (req.body === undefined || req.body === null) return false;
  const observed = Buffer.isBuffer(req.body)
    ? req.body.length
    : Buffer.byteLength(typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
  return observed > MAX_BODY_BYTES;
}

function consumeRateLimit(ip, now = Date.now()) {
  if (rateWindows.size > 1000) {
    for (const [key, window] of rateWindows) {
      if (now - window.startedAt >= RATE_LIMIT_WINDOW_MS) rateWindows.delete(key);
    }
    while (rateWindows.size > 1000) rateWindows.delete(rateWindows.keys().next().value);
  }
  const current = rateWindows.get(ip);
  if (!current || now - current.startedAt >= RATE_LIMIT_WINDOW_MS) {
    rateWindows.set(ip, { startedAt: now, count: 1 });
    return { allowed: true, retryAfter: 0 };
  }
  current.count += 1;
  if (current.count <= RATE_LIMIT_MAX) return { allowed: true, retryAfter: 0 };
  return {
    allowed: false,
    retryAfter: Math.max(1, Math.ceil((RATE_LIMIT_WINDOW_MS - (now - current.startedAt)) / 1000)),
  };
}

function validRequestId(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
}

function sendJson(res, status, value) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(value));
}

function redirect(res, location) {
  res.statusCode = 303;
  res.setHeader('Location', location);
  res.setHeader('Cache-Control', 'no-store');
  res.end();
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return wantsJson(req) ? sendJson(res, 405, { error: 'method_not_allowed' }) : redirect(res, `${RETURN_URL}?support=unavailable`);
  }

  if (!checkoutEnabled()) {
    return wantsJson(req) ? sendJson(res, 503, { error: 'checkout_disabled' }) : redirect(res, `${RETURN_URL}?support=unavailable`);
  }
  const origin = requestOrigin(req);
  if (!ALLOWED_ORIGINS.has(origin)) return sendJson(res, 403, { error: 'origin_not_allowed' });
  if (bodyTooLarge(req)) return sendJson(res, 413, { error: 'request_too_large' });

  const body = parseBody(req.body);
  if (String(body.source || '').trim() !== 'piop-page') {
    return wantsJson(req) ? sendJson(res, 400, { error: 'invalid_source' }) : redirect(res, `${RETURN_URL}?support=unavailable`);
  }
  if (String(body.company || '').trim()) {
    res.statusCode = 204;
    return res.end();
  }
  if (!validRequestId(body.request_id)) {
    return wantsJson(req) ? sendJson(res, 400, { error: 'invalid_request' }) : redirect(res, `${RETURN_URL}?support=unavailable`);
  }
  const rate = consumeRateLimit(requestIp(req));
  if (!rate.allowed) {
    res.setHeader('Retry-After', String(rate.retryAfter));
    return wantsJson(req) ? sendJson(res, 429, { error: 'rate_limited' }) : redirect(res, `${RETURN_URL}?support=unavailable`);
  }

  try {
    const session = await createPiopCheckoutSession({
      amount: body.amount,
      frequency: body.frequency,
      requestId: String(body.request_id).trim().toLowerCase(),
    });
    if (wantsJson(req)) {
      return sendJson(res, 200, {
        checkoutUrl: session.url,
        frequency: session.frequency,
        amountCents: session.amountCents,
      });
    }
    return redirect(res, session.url);
  } catch (error) {
    if (wantsJson(req)) return sendJson(res, Number(error?.statusCode || 500), { error: 'checkout_unavailable' });
    return redirect(res, `${RETURN_URL}?support=unavailable`);
  }
};
