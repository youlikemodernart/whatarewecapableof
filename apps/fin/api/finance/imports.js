const { getSession, storageConfig, json } = require('../_auth');
const { makeHttpError, handleApiError } = require('../_http');
const { listFinanceImports, deleteFinanceImport } = require('../_db');

function urlFromReq(req) {
  return new URL(req.url || '/api/finance/imports', 'http://fin.local');
}

function ensureStorageReady() {
  const storage = storageConfig();
  if (!storage.configured) throw makeHttpError(503, 'Hosted database is not configured yet.');
  if (storage.mode !== 'postgres') throw makeHttpError(501, `Hosted finance import mode is not supported: ${storage.mode}`);
  return storage;
}

function expectedHost(req) {
  return String(req.headers['x-forwarded-host'] || req.headers.host || '').toLowerCase();
}

function ensureSameOrigin(req) {
  const origin = String(req.headers.origin || '').trim();
  if (!origin) throw makeHttpError(403, 'Origin header is required for finance import changes.');
  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    throw makeHttpError(403, 'Origin is invalid.');
  }
  if (parsed.host.toLowerCase() !== expectedHost(req)) throw makeHttpError(403, 'Origin is not allowed for finance import changes.');
}

function noStore(res) {
  res.setHeader('Cache-Control', 'no-store');
}

module.exports = async function handler(req, res) {
  noStore(res);
  const user = getSession(req);
  if (!user) return json(res, 401, { error: 'Sign in required.' });

  try {
    const storage = ensureStorageReady();

    if (req.method === 'GET') {
      const imports = await listFinanceImports(user);
      return json(res, 200, { ok: true, storage, imports });
    }

    if (req.method === 'DELETE') {
      ensureSameOrigin(req);
      const params = urlFromReq(req).searchParams;
      const id = String(params.get('id') || '').trim();
      if (!id) throw makeHttpError(400, 'Finance import id is required.');
      const deleted = await deleteFinanceImport(user, id, params.get('reason') || 'deleted from Fin import list');
      if (!deleted) throw makeHttpError(404, 'Finance import not found.');
      return json(res, 200, { ok: true, storage, deleted: true, id });
    }

    res.setHeader('Allow', 'GET, DELETE');
    return json(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    return handleApiError(res, json, error);
  }
};
