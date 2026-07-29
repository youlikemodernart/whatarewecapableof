import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
process.env.STRIPE_MODE = 'live';
process.env.FIN_STRIPE_LIVE_LINKS_ENABLED = '1';
process.env.FIN_STRIPE_FAKE = '0';
process.env.PIOP_CHECKOUT_ENABLED = '1';
process.env.STRIPE_SECRET_KEY = ['sk', 'live', 'smoke'].join('_');
process.env.STRIPE_WEBHOOK_SECRET = ['whsec', 'smoke'].join('_');
process.env.PIOP_STRIPE_PRODUCT_ID = 'prod_piopSmoke';

const handler = require('../api/piop/checkout.js');

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    end(value = '') { this.body = value; this.ended = true; },
  };
}

let callSequence = 0;

function nextRequestId() {
  callSequence += 1;
  return `00000000-0000-4000-8000-${String(callSequence).padStart(12, '0')}`;
}

async function call({ body = {}, origin = 'https://whatarewecapableof.com', accept = 'application/json', method = 'POST', ip } = {}) {
  const requestId = nextRequestId();
  if (method === 'POST' && typeof body === 'string') {
    if (!body.includes('source=')) body = `${body}&source=piop-page`;
    if (!body.includes('request_id=')) body = `${body}&request_id=${requestId}`;
  }
  if (method === 'POST' && body && typeof body === 'object') {
    if (body.source === undefined) body = { ...body, source: 'piop-page' };
    if (body.request_id === undefined) body = { ...body, request_id: requestId };
  }
  const req = { method, body, headers: { origin, accept, 'x-forwarded-for': ip || `192.0.2.${callSequence}` } };
  const res = response();
  await handler(req, res);
  return res;
}

const requests = [];
const originalFetch = global.fetch;
global.fetch = async (url, options) => {
  requests.push({ url, options, form: Object.fromEntries(options.body.entries()) });
  return {
    ok: true,
    status: 200,
    async json() { return { id: `cs_smoke_${requests.length}`, url: `https://checkout.stripe.com/c/pay/cs_smoke_${requests.length}` }; },
  };
};

try {
  const once = await call({ body: { amount: '25', frequency: 'once', source: 'piop-page' } });
  assert.equal(once.statusCode, 200);
  assert.equal(JSON.parse(once.body).amountCents, 2500);
  assert.equal(requests[0].form.mode, 'payment');
  assert.equal(requests[0].form['line_items[0][price_data][unit_amount]'], '2500');
  assert.equal(requests[0].form['line_items[0][price_data][product]'], 'prod_piopSmoke');
  assert.equal(requests[0].form['payment_intent_data[metadata][access_entitlement]'], 'none');
  assert.equal(requests[0].form.customer_creation, undefined);
  assert.equal(requests[0].options.headers['Idempotency-Key'], 'piop-support-00000000-0000-4000-8000-000000000001');

  const monthly = await call({ body: 'amount=10&frequency=monthly&source=piop-page' });
  assert.equal(monthly.statusCode, 200);
  assert.equal(JSON.parse(monthly.body).frequency, 'monthly');
  assert.equal(requests[1].form.mode, 'subscription');
  assert.equal(requests[1].form['line_items[0][price_data][recurring][interval]'], 'month');
  assert.equal(requests[1].form['subscription_data[metadata][access_entitlement]'], 'none');

  const redirect = await call({ body: { amount: '50', frequency: 'once' }, accept: 'text/html' });
  assert.equal(redirect.statusCode, 303);
  assert.match(redirect.headers.location, /^https:\/\/checkout\.stripe\.com\//);

  const badAmount = await call({ body: { amount: '0', frequency: 'once' } });
  assert.equal(badAmount.statusCode, 400);
  assert.deepEqual(JSON.parse(badAmount.body), { error: 'checkout_unavailable' });

  const badFrequency = await call({ body: { amount: '25', frequency: 'yearly' } });
  assert.equal(badFrequency.statusCode, 400);

  const fractionalAmount = await call({ body: { amount: '1.01', frequency: 'once' } });
  assert.equal(fractionalAmount.statusCode, 400);

  const excessPrecision = await call({ body: { amount: '1.001', frequency: 'once' } });
  assert.equal(excessPrecision.statusCode, 400);

  const scientificNotation = await call({ body: { amount: '1e3', frequency: 'once' } });
  assert.equal(scientificNotation.statusCode, 400);

  const badOrigin = await call({ body: { amount: '25', frequency: 'once' }, origin: 'https://example.invalid' });
  assert.equal(badOrigin.statusCode, 403);

  const badSource = await call({ body: { amount: '25', frequency: 'once', source: 'other' } });
  assert.equal(badSource.statusCode, 400);

  const honeypot = await call({ body: { amount: '25', frequency: 'once', company: 'bot' } });
  assert.equal(honeypot.statusCode, 204);

  const badRequestId = await call({ body: { amount: '25', frequency: 'once', request_id: 'bad' } });
  assert.equal(badRequestId.statusCode, 400);

  const oversized = await call({ body: { amount: '25', frequency: 'once', padding: 'x'.repeat(3000) } });
  assert.equal(oversized.statusCode, 413);

  for (let index = 0; index < 5; index += 1) {
    const withinLimit = await call({ body: { amount: '0', frequency: 'once' }, ip: '198.51.100.10' });
    assert.equal(withinLimit.statusCode, 400);
  }
  const rateLimited = await call({ body: { amount: '0', frequency: 'once' }, ip: '198.51.100.10' });
  assert.equal(rateLimited.statusCode, 429);
  assert.ok(Number(rateLimited.headers['retry-after']) > 0);

  const get = await call({ method: 'GET' });
  assert.equal(get.statusCode, 405);

  process.env.PIOP_CHECKOUT_ENABLED = '0';
  const disabled = await call({ body: { amount: '25', frequency: 'once' } });
  assert.equal(disabled.statusCode, 503);
  process.env.PIOP_CHECKOUT_ENABLED = '1';

  process.env.FIN_STRIPE_FAKE = '1';
  const fakeMode = await call({ body: { amount: '25', frequency: 'once' } });
  assert.equal(fakeMode.statusCode, 503);
  process.env.FIN_STRIPE_FAKE = '0';

  delete process.env.PIOP_STRIPE_PRODUCT_ID;
  const unconfigured = await call({ body: { amount: '25', frequency: 'once' } });
  assert.equal(unconfigured.statusCode, 503);
  process.env.PIOP_STRIPE_PRODUCT_ID = 'prod_piopSmoke';

  assert.equal(requests.length, 3);
  console.log('PASS piop_checkout_smoke once=1 monthly=1 redirect=1 validation=13 rate_limit=1 circuit_breaker=1 fake_no_network=1');
} finally {
  global.fetch = originalFetch;
}
