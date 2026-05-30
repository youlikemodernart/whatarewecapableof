const crypto = require('crypto');
const { makeHttpError } = require('./_http');

const STRIPE_API_BASE = 'https://api.stripe.com/v1';
const WEBHOOK_TOLERANCE_SECONDS = 300;

function env(name, fallback = '') {
  return String(process.env[name] ?? fallback).trim();
}

function paymentsMode() {
  return env('STRIPE_MODE', 'disabled').toLowerCase() || 'disabled';
}

function stripeSecretKey() {
  return env('STRIPE_SECRET_KEY');
}

function stripeWebhookSecret() {
  return env('STRIPE_WEBHOOK_SECRET');
}

function fakeStripeEnabled() {
  return env('FIN_STRIPE_FAKE', '0') === '1';
}

function testLinksEnabled() {
  return env('FIN_STRIPE_TEST_LINKS_ENABLED', '0') === '1';
}

function liveLinksEnabled() {
  return env('FIN_STRIPE_LIVE_LINKS_ENABLED', '0') === '1';
}

function cleanMode(value) {
  const mode = String(value || '').trim().toLowerCase();
  if (mode !== 'test' && mode !== 'live') throw makeHttpError(400, 'Stripe mode must be test or live.');
  return mode;
}

function ensureStripeCheckoutEnabled(mode) {
  const requestedMode = cleanMode(mode);
  if (requestedMode === 'test' && !testLinksEnabled()) throw makeHttpError(403, 'Stripe test payment links are disabled.');
  if (requestedMode === 'live' && !liveLinksEnabled()) throw makeHttpError(403, 'Stripe live payment links are disabled.');

  const configuredMode = paymentsMode();
  if (configuredMode !== requestedMode && !fakeStripeEnabled()) {
    throw makeHttpError(503, `Stripe is configured for ${configuredMode || 'disabled'} mode, not ${requestedMode} mode.`);
  }

  const key = stripeSecretKey();
  if (!fakeStripeEnabled()) {
    if (!key) throw makeHttpError(503, 'Stripe secret key is not configured.');
    if (!stripeWebhookSecret()) throw makeHttpError(503, 'Stripe webhook secret is not configured.');
    if (requestedMode === 'test' && !key.startsWith('sk_test_')) throw makeHttpError(503, 'Stripe test mode requires a test secret key.');
    if (requestedMode === 'live' && !key.startsWith('sk_live_')) throw makeHttpError(503, 'Stripe live mode requires a live secret key.');
  }

  return { mode: requestedMode, fake: fakeStripeEnabled() };
}

function appendForm(form, key, value) {
  if (value === undefined || value === null || value === '') return;
  form.append(key, String(value));
}

function checkoutLineName(paymentRequest) {
  return `Invoice ${paymentRequest.invoiceNumber || paymentRequest.invoiceId}`;
}

function fakeCheckoutSession(paymentRequest) {
  const id = `cs_${paymentRequest.mode}_${crypto.createHash('sha256').update(paymentRequest.id).digest('hex').slice(0, 24)}`;
  return {
    id,
    url: `https://checkout.stripe.com/c/pay/${id}`,
    paymentIntentId: `pi_${crypto.createHash('sha256').update(`pi:${paymentRequest.id}`).digest('hex').slice(0, 24)}`,
    customerId: '',
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };
}

async function createCheckoutSession({ paymentRequest, invoice, baseUrl }) {
  if (fakeStripeEnabled()) return fakeCheckoutSession(paymentRequest);

  const form = new URLSearchParams();
  appendForm(form, 'mode', 'payment');
  appendForm(form, 'client_reference_id', paymentRequest.invoiceId);
  appendForm(form, 'success_url', `${baseUrl}/invoices?payment=success&invoice=${encodeURIComponent(paymentRequest.invoiceId)}`);
  appendForm(form, 'cancel_url', `${baseUrl}/invoices?payment=cancel&invoice=${encodeURIComponent(paymentRequest.invoiceId)}`);
  appendForm(form, 'customer_email', invoice.client?.email || '');
  appendForm(form, 'line_items[0][quantity]', '1');
  appendForm(form, 'line_items[0][price_data][currency]', String(paymentRequest.currency || 'USD').toLowerCase());
  appendForm(form, 'line_items[0][price_data][unit_amount]', paymentRequest.amountCents);
  appendForm(form, 'line_items[0][price_data][product_data][name]', checkoutLineName(paymentRequest));
  appendForm(form, 'line_items[0][price_data][product_data][description]', `Payment for ${paymentRequest.invoiceNumber || 'WAWCO invoice'}`);

  for (const [key, value] of Object.entries(paymentRequest.metadata || {})) {
    appendForm(form, `metadata[${key}]`, value);
    appendForm(form, `payment_intent_data[metadata][${key}]`, value);
  }

  const response = await fetch(`${STRIPE_API_BASE}/checkout/sessions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeSecretKey()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Idempotency-Key': paymentRequest.idempotencyKey,
    },
    body: form,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.error?.message || `Stripe Checkout Session creation failed: ${response.status}`;
    throw makeHttpError(response.status >= 500 ? 502 : 400, message);
  }
  return {
    id: data.id,
    url: data.url,
    paymentIntentId: typeof data.payment_intent === 'string' ? data.payment_intent : data.payment_intent?.id || '',
    customerId: typeof data.customer === 'string' ? data.customer : data.customer?.id || '',
    expiresAt: data.expires_at ? new Date(Number(data.expires_at) * 1000).toISOString() : '',
  };
}

function parseStripeSignature(header) {
  const parts = String(header || '').split(',').map((part) => part.trim()).filter(Boolean);
  const values = {};
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq);
    const value = part.slice(eq + 1);
    if (!values[key]) values[key] = [];
    values[key].push(value);
  }
  return values;
}

function timingSafeHexEqual(left, right) {
  if (!/^[a-f0-9]+$/i.test(String(left)) || !/^[a-f0-9]+$/i.test(String(right))) return false;
  const a = Buffer.from(String(left), 'hex');
  const b = Buffer.from(String(right), 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function verifyStripeWebhook(rawBody, signatureHeader) {
  const secret = stripeWebhookSecret();
  if (!secret) throw makeHttpError(503, 'Stripe webhook secret is not configured.');
  const parsed = parseStripeSignature(signatureHeader);
  const timestamp = Number(parsed.t?.[0] || 0);
  if (!Number.isFinite(timestamp) || timestamp <= 0) throw makeHttpError(401, 'Stripe webhook signature timestamp is missing.');
  const age = Math.abs(Math.floor(Date.now() / 1000) - timestamp);
  if (age > WEBHOOK_TOLERANCE_SECONDS) throw makeHttpError(401, 'Stripe webhook signature timestamp is stale.');
  const signedPayload = Buffer.concat([Buffer.from(`${timestamp}.`, 'utf8'), Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8')]);
  const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
  const signatures = parsed.v1 || [];
  if (!signatures.some((candidate) => timingSafeHexEqual(candidate, expected))) throw makeHttpError(401, 'Stripe webhook signature is invalid.');
  try {
    return JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody));
  } catch {
    throw makeHttpError(400, 'Stripe webhook payload is invalid JSON.');
  }
}

function signTestWebhookPayload(rawBody, secret, timestamp = Math.floor(Date.now() / 1000)) {
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8');
  const payload = Buffer.concat([Buffer.from(`${timestamp}.`, 'utf8'), body]);
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

module.exports = {
  cleanMode,
  ensureStripeCheckoutEnabled,
  createCheckoutSession,
  verifyStripeWebhook,
  signTestWebhookPayload,
};
