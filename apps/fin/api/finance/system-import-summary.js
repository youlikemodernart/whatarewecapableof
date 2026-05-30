const { storageConfig, json } = require('../_auth');
const { makeHttpError, readBody, handleApiError } = require('../_http');
const { createSystemFinanceImport, claimFinanceSystemImportNonce } = require('../_db');
const { verifySystemImportRequest } = require('../_system_import_auth');

const MAX_IMPORT_BODY_BYTES = 1_000_000;

function ensureStorageReady() {
  const storage = storageConfig();
  if (!storage.configured) throw makeHttpError(503, 'Hosted database is not configured yet.');
  if (storage.mode !== 'postgres') throw makeHttpError(501, `Hosted finance import mode is not supported: ${storage.mode}`);
  return storage;
}

function ensureJsonContentType(req) {
  const type = String(req.headers['content-type'] || '').toLowerCase();
  if (!type.includes('application/json')) throw makeHttpError(415, 'Expected application/json.');
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
    ensureJsonContentType(req);
    const rawBody = await readBody(req, MAX_IMPORT_BODY_BYTES);
    const auth = verifySystemImportRequest(req, rawBody);
    const storage = ensureStorageReady();
    await claimFinanceSystemImportNonce(auth);

    let body;
    try {
      body = rawBody.trim() ? JSON.parse(rawBody) : {};
    } catch {
      throw makeHttpError(400, 'Invalid JSON body.');
    }

    const result = await createSystemFinanceImport({
      keyId: auth.keyId,
      label: `Fin system import ${auth.keyId}`,
    }, body, auth);
    return json(res, result.skipped ? 200 : 201, {
      ok: true,
      storage,
      skipped: result.skipped,
      reason: result.reason,
      import: result.import,
    });
  } catch (error) {
    return handleApiError(res, json, error);
  }
};
