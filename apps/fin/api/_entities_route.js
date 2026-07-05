const { getSession, storageConfig, json } = require('./_auth');
const { makeHttpError, handleApiError } = require('./_http');
const { listEntities } = require('./_db');

function ensureStorageReady() {
  const storage = storageConfig();
  if (!storage.configured) throw makeHttpError(503, 'Hosted entity storage is not configured yet.');
  if (storage.mode !== 'postgres') throw makeHttpError(501, `Hosted entity storage mode is not supported: ${storage.mode}`);
  return storage;
}

module.exports = async function handler(req, res) {
  const user = getSession(req);
  if (!user) return json(res, 401, { error: 'Sign in required.' });

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { error: 'Method not allowed' });
  }

  try {
    const storage = ensureStorageReady();
    const entities = await listEntities(user);
    return json(res, 200, { ok: true, storage, entities });
  } catch (error) {
    return handleApiError(res, json, error);
  }
};
