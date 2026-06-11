const crypto = require('crypto');
const { makeHttpError } = require('./_http');
const { paymentMethodQuote } = require('./_payment_pricing');

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

function appendReturnState(url, state) {
  const text = String(url || '').trim();
  if (!text) return '';
  const joiner = text.includes('?') ? '&' : '?';
  return `${text}${joiner}${state}`;
}

function fakeCheckoutSession(paymentRequest) {
  const methodPart = paymentRequest.paymentMethodType ? `_${paymentRequest.paymentMethodType}` : '';
  const id = `cs_${paymentRequest.mode}${methodPart}_${crypto.createHash('sha256').update(paymentRequest.id).digest('hex').slice(0, 24)}`;
  return {
    id,
    url: `https://checkout.stripe.com/c/pay/${id}`,
    paymentIntentId: `pi_${crypto.createHash('sha256').update(`pi:${paymentRequest.id}`).digest('hex').slice(0, 24)}`,
    customerId: '',
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };
}

function addCheckoutLine(form, index, { amountCents, currency, name, description }) {
  appendForm(form, `line_items[${index}][quantity]`, '1');
  appendForm(form, `line_items[${index}][price_data][currency]`, String(currency || 'USD').toLowerCase());
  appendForm(form, `line_items[${index}][price_data][unit_amount]`, amountCents);
  appendForm(form, `line_items[${index}][price_data][product_data][name]`, name);
  appendForm(form, `line_items[${index}][price_data][product_data][description]`, description);
}

function checkoutReturnUrls(paymentRequest, baseUrl) {
  if (paymentRequest.publicUrl) {
    return {
      successUrl: appendReturnState(paymentRequest.publicUrl, 'checkout=success&session_id={CHECKOUT_SESSION_ID}'),
      cancelUrl: appendReturnState(paymentRequest.publicUrl, 'checkout=cancel'),
    };
  }
  return {
    successUrl: `${baseUrl}/invoices?payment=success&invoice=${encodeURIComponent(paymentRequest.invoiceId)}`,
    cancelUrl: `${baseUrl}/invoices?payment=cancel&invoice=${encodeURIComponent(paymentRequest.invoiceId)}`,
  };
}

async function createCheckoutSession({ paymentRequest, invoice, baseUrl }) {
  if (fakeStripeEnabled()) return fakeCheckoutSession(paymentRequest);

  const form = new URLSearchParams();
  const quote = paymentRequest.paymentMethodFamily && paymentRequest.paymentMethodFamily !== 'legacy'
    ? paymentMethodQuote(paymentRequest.baseAmountCents || paymentRequest.amountCents, paymentRequest.paymentMethodFamily)
    : null;
  const { successUrl, cancelUrl } = checkoutReturnUrls(paymentRequest, baseUrl);
  appendForm(form, 'mode', 'payment');
  appendForm(form, 'client_reference_id', paymentRequest.invoiceId);
  appendForm(form, 'success_url', successUrl);
  appendForm(form, 'cancel_url', cancelUrl);
  appendForm(form, 'customer_email', invoice.client?.email || '');
  if (paymentRequest.paymentMethodType) appendForm(form, 'payment_method_types[0]', paymentRequest.paymentMethodType);

  addCheckoutLine(form, 0, {
    amountCents: quote ? quote.baseAmountCents : paymentRequest.amountCents,
    currency: paymentRequest.currency,
    name: checkoutLineName(paymentRequest),
    description: `Payment for ${paymentRequest.invoiceNumber || 'What are we capable of? invoice'}`,
  });
  if (quote?.method === 'card' && quote.clientProcessingCostCents > 0) {
    addCheckoutLine(form, 1, {
      amountCents: quote.clientProcessingCostCents,
      currency: paymentRequest.currency,
      name: 'Card processing cost',
      description: 'Processing cost shown before card checkout.',
    });
  }

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

function safePaymentMethodDetails(details = {}) {
  const type = String(details.type || '').trim();
  if (type === 'card') {
    return {
      type,
      card: {
        brand: String(details.card?.brand || '').trim().slice(0, 40),
        funding: String(details.card?.funding || '').trim().slice(0, 40),
        country: String(details.card?.country || '').trim().slice(0, 4),
        last4: String(details.card?.last4 || '').trim().replace(/\D+/g, '').slice(-4),
      },
    };
  }
  if (type === 'us_bank_account') {
    return {
      type,
      us_bank_account: {
        bank_name: String(details.us_bank_account?.bank_name || '').trim().slice(0, 80),
        account_holder_type: String(details.us_bank_account?.account_holder_type || '').trim().slice(0, 40),
        account_type: String(details.us_bank_account?.account_type || '').trim().slice(0, 40),
        last4: String(details.us_bank_account?.last4 || '').trim().replace(/\D+/g, '').slice(-4),
      },
    };
  }
  return type ? { type } : {};
}

function reconciliationFromCharge(charge = {}) {
  const balanceTransaction = charge.balance_transaction && typeof charge.balance_transaction === 'object'
    ? charge.balance_transaction
    : null;
  const balanceTransactionId = typeof charge.balance_transaction === 'string'
    ? charge.balance_transaction
    : balanceTransaction?.id || '';
  const actualStripeFeeCents = Number.isFinite(Number(balanceTransaction?.fee)) ? Number(balanceTransaction.fee) : null;
  const actualNetCents = Number.isFinite(Number(balanceTransaction?.net)) ? Number(balanceTransaction.net) : null;
  const status = actualStripeFeeCents !== null && actualNetCents !== null
    ? 'reconciled'
    : balanceTransactionId ? 'pending_balance_transaction' : 'pending_stripe_fee';
  return {
    chargeId: typeof charge.id === 'string' ? charge.id : '',
    balanceTransactionId,
    actualStripeFeeCents,
    actualNetCents,
    reconciliationStatus: status,
    paymentMethodDetails: safePaymentMethodDetails(charge.payment_method_details || {}),
  };
}

async function retrieveChargeReconciliation(chargeId) {
  const id = String(chargeId || '').trim();
  if (!id || fakeStripeEnabled()) return null;
  const key = stripeSecretKey();
  if (!key) return null;
  const response = await fetch(`${STRIPE_API_BASE}/charges/${encodeURIComponent(id)}?expand[]=balance_transaction`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { chargeId: id, reconciliationStatus: 'reconciliation_fetch_failed', error: data.error?.message || `Stripe charge fetch failed: ${response.status}` };
  return reconciliationFromCharge(data);
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
  retrieveChargeReconciliation,
  reconciliationFromCharge,
  verifyStripeWebhook,
  signTestWebhookPayload,
};
