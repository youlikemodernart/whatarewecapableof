const { ensureStripeCheckoutEnabled, stripeConfigForEntity } = require('./_stripe');

const STRIPE_API_BASE = 'https://api.stripe.com/v1';
const PIOP_URL = 'https://whatarewecapableof.com/piop';
const MIN_AMOUNT_CENTS = 100;
const MAX_AMOUNT_CENTS = 1_000_000;

function cleanFrequency(value) {
  const frequency = String(value || '').trim().toLowerCase();
  if (frequency !== 'once' && frequency !== 'monthly') throw Object.assign(new Error('Choose one-time or monthly support.'), { statusCode: 400 });
  return frequency;
}

function amountToCents(value) {
  const normalized = String(value ?? '').trim();
  if (!/^\d+$/.test(normalized)) {
    throw Object.assign(new Error('Enter a whole-dollar amount.'), { statusCode: 400 });
  }
  const amount = Number(normalized);
  const cents = Math.round(amount * 100);
  if (cents < MIN_AMOUNT_CENTS || cents > MAX_AMOUNT_CENTS) {
    throw Object.assign(new Error('Choose an amount from $1 to $10,000.'), { statusCode: 400 });
  }
  return cents;
}

function cleanRequestId(value) {
  const requestId = String(value || '').trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(requestId)) {
    throw Object.assign(new Error('Invalid checkout request.'), { statusCode: 400 });
  }
  return requestId;
}

function append(form, key, value) {
  if (value === undefined || value === null || value === '') return;
  form.append(key, String(value));
}

function piopProductId() {
  const productId = String(process.env.PIOP_STRIPE_PRODUCT_ID || '').trim();
  if (!/^prod_[A-Za-z0-9]+$/.test(productId)) {
    throw Object.assign(new Error('PiOp Stripe product is not configured.'), { statusCode: 503 });
  }
  return productId;
}

function buildCheckoutForm({ amountCents, frequency, productId }) {
  const recurring = frequency === 'monthly';
  const form = new URLSearchParams();
  append(form, 'mode', recurring ? 'subscription' : 'payment');
  append(form, 'success_url', `${PIOP_URL}?support=thank-you`);
  append(form, 'cancel_url', `${PIOP_URL}?support=cancelled`);
  append(form, 'billing_address_collection', 'auto');
  append(form, 'line_items[0][quantity]', '1');
  append(form, 'line_items[0][price_data][currency]', 'usd');
  append(form, 'line_items[0][price_data][unit_amount]', amountCents);
  append(form, 'line_items[0][price_data][product]', productId);
  if (recurring) append(form, 'line_items[0][price_data][recurring][interval]', 'month');
  const metadataTarget = recurring ? 'subscription_data[metadata]' : 'payment_intent_data[metadata]';
  const metadata = {
    piop_support: 'true',
    support_frequency: frequency,
    access_entitlement: 'none',
    source: 'whatarewecapableof.com/piop',
  };
  for (const [key, value] of Object.entries(metadata)) {
    append(form, `metadata[${key}]`, value);
    append(form, `${metadataTarget}[${key}]`, value);
  }
  return form;
}

async function createPiopCheckoutSession({ amount, frequency, requestId }) {
  const normalizedFrequency = cleanFrequency(frequency);
  const amountCents = amountToCents(amount);
  const normalizedRequestId = cleanRequestId(requestId);
  const gate = ensureStripeCheckoutEnabled('live', 'wawco');
  if (gate.fake) {
    throw Object.assign(new Error('PiOp public checkout cannot run in Stripe fake mode.'), { statusCode: 503 });
  }
  const config = stripeConfigForEntity('wawco');
  const form = buildCheckoutForm({
    amountCents,
    frequency: normalizedFrequency,
    productId: piopProductId(),
  });
  const response = await fetch(`${STRIPE_API_BASE}/checkout/sessions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Idempotency-Key': `piop-support-${normalizedRequestId}`,
    },
    body: form,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.url || !data.id) {
    const error = new Error('Stripe Checkout is temporarily unavailable.');
    error.statusCode = response.status >= 500 ? 502 : 400;
    throw error;
  }
  return {
    id: data.id,
    url: data.url,
    frequency: normalizedFrequency,
    amountCents,
  };
}

module.exports = {
  MAX_AMOUNT_CENTS,
  MIN_AMOUNT_CENTS,
  amountToCents,
  buildCheckoutForm,
  cleanFrequency,
  cleanRequestId,
  createPiopCheckoutSession,
  piopProductId,
};
