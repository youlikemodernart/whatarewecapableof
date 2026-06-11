const { storageConfig, json, getBaseUrl } = require('../_auth');
const { makeHttpError, readJsonBody, handleApiError } = require('../_http');
const {
  getPublicPaymentPage,
  createCustomerCheckoutPaymentRequest,
  activateCustomerCheckoutPaymentRequest,
  failCustomerCheckoutPaymentRequest,
} = require('../_db');
const { cleanPaymentMethod } = require('../_payment_pricing');
const { ensureStripeCheckoutEnabled, createCheckoutSession } = require('../_stripe');

function ensureStorageReady() {
  const storage = storageConfig();
  if (!storage.configured) throw makeHttpError(503, 'Hosted database is not configured yet.');
  if (storage.mode !== 'postgres') throw makeHttpError(501, `Hosted payment storage mode is not supported: ${storage.mode}`);
  return storage;
}

function expectedHost(req) {
  return String(req.headers['x-forwarded-host'] || req.headers.host || '').toLowerCase();
}

function ensureSameOrigin(req) {
  const origin = String(req.headers.origin || '').trim();
  if (!origin) throw makeHttpError(403, 'Origin header is required for checkout.');
  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    throw makeHttpError(403, 'Origin is invalid.');
  }
  if (parsed.host.toLowerCase() !== expectedHost(req)) throw makeHttpError(403, 'Origin is not allowed for checkout.');
}

function noStore(res) {
  res.setHeader('Cache-Control', 'no-store');
}

module.exports = async function handler(req, res) {
  noStore(res);
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Method not allowed' });
  }

  try {
    const storage = ensureStorageReady();
    ensureSameOrigin(req);
    const body = await readJsonBody(req, 20_000);
    const token = String(body.token || body.t || '').trim();
    const method = cleanPaymentMethod(body.method);
    const page = await getPublicPaymentPage(token);
    const stripe = ensureStripeCheckoutEnabled(page.page.mode);
    const prepared = await createCustomerCheckoutPaymentRequest(token, method);

    if (prepared.reused) {
      if (prepared.paymentRequest?.status === 'active' && prepared.paymentRequest.url) {
        return json(res, 200, { ok: true, storage, stripe, reused: true, url: prepared.paymentRequest.url, payment: prepared.paymentRequest });
      }
      throw makeHttpError(409, 'Checkout is already in progress. Try again shortly.');
    }

    try {
      const session = await createCheckoutSession({
        paymentRequest: prepared.paymentRequest,
        invoice: prepared.invoice,
        baseUrl: getBaseUrl(req),
      });
      const payment = await activateCustomerCheckoutPaymentRequest(prepared.paymentRequest.id, session);
      return json(res, 201, { ok: true, storage, stripe, reused: false, url: payment.url, payment });
    } catch (error) {
      await failCustomerCheckoutPaymentRequest(prepared.paymentRequest.id, error.message).catch(() => {});
      throw error;
    }
  } catch (error) {
    return handleApiError(res, json, error);
  }
};
