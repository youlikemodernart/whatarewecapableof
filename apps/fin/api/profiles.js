const { getSession, storageConfig, json } = require('./_auth');
const { makeHttpError, readJsonBody, handleApiError } = require('./_http');
const { listProfiles, createProfile, updateProfile, deleteProfile } = require('./_db');

function urlFromReq(req) {
  return new URL(req.url || '/api/profiles', 'http://127.0.0.1');
}

function profileTypeFromRequest(req) {
  const type = String(urlFromReq(req).searchParams.get('type') || '').trim();
  if (!type) throw makeHttpError(400, 'Profile type is required.');
  return type;
}

function profileIdFromRequest(req) {
  return String(urlFromReq(req).searchParams.get('id') || '').trim();
}

function ensureStorageReady() {
  const storage = storageConfig();
  if (!storage.configured) throw makeHttpError(503, 'Hosted database is not configured yet.');
  if (storage.mode !== 'postgres') throw makeHttpError(501, `Hosted profile storage mode is not supported: ${storage.mode}`);
  return storage;
}

module.exports = async function handler(req, res) {
  const user = getSession(req);
  if (!user) return json(res, 401, { error: 'Sign in required.' });

  try {
    const storage = ensureStorageReady();
    const type = profileTypeFromRequest(req);

    if (req.method === 'GET') {
      const profiles = await listProfiles(user, type);
      return json(res, 200, { ok: true, storage, type, profiles });
    }

    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const profile = await createProfile(user, type, body.profile || body);
      return json(res, 201, { ok: true, storage, type, profile });
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      const id = profileIdFromRequest(req);
      if (!id) throw makeHttpError(400, 'Profile id is required.');
      const body = await readJsonBody(req);
      const profile = await updateProfile(user, id, type, body.profile || body);
      if (!profile) throw makeHttpError(404, 'Profile not found.');
      return json(res, 200, { ok: true, storage, type, profile });
    }

    if (req.method === 'DELETE') {
      const id = profileIdFromRequest(req);
      if (!id) throw makeHttpError(400, 'Profile id is required.');
      const deleted = await deleteProfile(user, id, type);
      if (!deleted) throw makeHttpError(404, 'Profile not found.');
      return json(res, 200, { ok: true, storage, type, deleted: true, id });
    }

    res.setHeader('Allow', 'GET, POST, PUT, PATCH, DELETE');
    return json(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    return handleApiError(res, json, error);
  }
};
