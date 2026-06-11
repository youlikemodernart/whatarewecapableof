const { storageConfig, json } = require('./_auth');
const { makeHttpError, handleApiError } = require('./_http');
const { getPublicPaymentPage } = require('./_db');

function ensureStorageReady() {
  const storage = storageConfig();
  if (!storage.configured) throw makeHttpError(503, 'Hosted database is not configured yet.');
  if (storage.mode !== 'postgres') throw makeHttpError(501, `Hosted payment storage mode is not supported: ${storage.mode}`);
  return storage;
}

function noStore(res) {
  res.setHeader('Cache-Control', 'no-store');
}

function tokenFromRequest(req) {
  const url = new URL(req.url || '/api/pay', 'http://127.0.0.1');
  return String(url.searchParams.get('t') || url.searchParams.get('token') || '').trim();
}

module.exports = async function handler(req, res) {
  noStore(res);
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { error: 'Method not allowed' });
  }

  try {
    const storage = ensureStorageReady();
    const token = tokenFromRequest(req);
    const paymentPage = await getPublicPaymentPage(token);
    return json(res, 200, { ok: true, storage, paymentPage });
  } catch (error) {
    return handleApiError(res, json, error);
  }
};
