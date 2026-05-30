const { getSession, storageConfig, json } = require('./_auth');
const { makeHttpError, readJsonBody, handleApiError } = require('./_http');
const { ensureUser, numberingSettings, updateNumberingSettings } = require('./_db');

function ensureStorageReady() {
  const storage = storageConfig();
  if (!storage.configured) throw makeHttpError(503, 'Hosted database is not configured yet.');
  if (storage.mode !== 'postgres') throw makeHttpError(501, `Hosted numbering storage mode is not supported: ${storage.mode}`);
  return storage;
}

module.exports = async function handler(req, res) {
  const user = getSession(req);
  if (!user) return json(res, 401, { error: 'Sign in required.' });

  try {
    const storage = ensureStorageReady();

    if (req.method === 'GET') {
      const numbering = await numberingSettings();
      return json(res, 200, { ok: true, storage, numbering });
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      const currentUser = await ensureUser(user);
      if (currentUser.role !== 'admin') throw makeHttpError(403, 'Only admins can update invoice numbering.');
      const body = await readJsonBody(req);
      const numbering = await updateNumberingSettings(body.numbering || body);
      return json(res, 200, { ok: true, storage, numbering });
    }

    res.setHeader('Allow', 'GET, PUT, PATCH');
    return json(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    return handleApiError(res, json, error);
  }
};
