const { getSession, storageConfig, json } = require('../_auth');
const { makeHttpError, handleApiError } = require('../_http');
const { financeSummary } = require('../_db');

function queryFromRequest(req) {
  return new URL(req.url || '/api/finance/summary', 'http://fin.local').searchParams;
}

function ensureStorageReady() {
  const storage = storageConfig();
  if (!storage.configured) throw makeHttpError(503, 'Hosted database is not configured yet.');
  if (storage.mode !== 'postgres') throw makeHttpError(501, `Hosted finance dashboard mode is not supported: ${storage.mode}`);
  return storage;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const user = getSession(req);
  if (!user) return json(res, 401, { error: 'Sign in required.' });

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { error: 'Method not allowed' });
  }

  try {
    const storage = ensureStorageReady();
    const params = queryFromRequest(req);
    const summary = await financeSummary(user, { month: params.get('month') || '', entity: params.get('entity') || '' });
    return json(res, 200, { ok: true, storage, summary });
  } catch (error) {
    return handleApiError(res, json, error);
  }
};
