const { getSession, storageConfig, json, getBaseUrl } = require('../_auth');
const { makeHttpError, readJsonBody, handleApiError } = require('../_http');
const { createInvoiceCustomerPaymentPage, invoiceEntityIdForUser } = require('../_db');
const { cleanMode, ensureStripeCheckoutEnabled } = require('../_stripe');

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
  if (!origin) throw makeHttpError(403, 'Origin header is required for Stripe Checkout creation.');
  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    throw makeHttpError(403, 'Origin is invalid.');
  }
  if (parsed.host.toLowerCase() !== expectedHost(req)) throw makeHttpError(403, 'Origin is not allowed for Stripe Checkout creation.');
}

function noStore(res) {
  res.setHeader('Cache-Control', 'no-store');
}

module.exports = async function handler(req, res) {
  noStore(res);
  const user = getSession(req);
  if (!user) return json(res, 401, { error: 'Sign in required.' });

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Method not allowed' });
  }

  try {
    const storage = ensureStorageReady();
    ensureSameOrigin(req);
    const body = await readJsonBody(req, 20_000);
    const invoiceId = String(body.invoiceId || '').trim();
    if (!invoiceId) throw makeHttpError(400, 'Invoice id is required.');
    const mode = cleanMode(body.mode || 'test');
    const entityId = await invoiceEntityIdForUser(user, invoiceId);
    if (!entityId) throw makeHttpError(404, 'Invoice draft not found.');
    const stripe = ensureStripeCheckoutEnabled(mode, entityId);
    const prepared = await createInvoiceCustomerPaymentPage(user, invoiceId, mode, getBaseUrl(req));

    if (prepared.reused) {
      if (prepared.paymentRequest?.status === 'active' && prepared.paymentRequest.publicUrl) {
        return json(res, 200, { ok: true, storage, stripe, reused: true, payment: prepared.paymentRequest });
      }
      throw makeHttpError(409, 'This invoice already has a customer payment page in progress. Wait for it to finish or expire before creating another link.');
    }

    return json(res, 201, { ok: true, storage, stripe, reused: false, payment: prepared.paymentRequest });
  } catch (error) {
    return handleApiError(res, json, error);
  }
};
