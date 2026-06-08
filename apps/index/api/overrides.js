const { getSession, json, requireCsrf } = require('./_auth');
const { loadOverrides, saveOverrideChanges, isPersistenceConfigured, persistenceStatus } = require('./_db');
const { normalizeOverrideChanges, registryPayload } = require('./_registry');

const MAX_BODY_BYTES = 64_000;

function makeHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function readRawBody(req, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(makeHttpError(413, 'Request body is too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function readJsonBody(req) {
  const type = String(req.headers['content-type'] || '').toLowerCase();
  if (!type.includes('application/json')) throw makeHttpError(415, 'Expected application/json.');
  const raw = await readRawBody(req);
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw makeHttpError(400, 'Invalid JSON body.');
  }
}

function handleError(res, error) {
  const status = error.status || 500;
  return json(res, status, {
    error: status === 500 ? 'Windex overrides could not be updated.' : error.message,
  });
}

async function handleGet(res) {
  const overrides = await loadOverrides();
  return json(res, 200, {
    ok: true,
    overrides,
    overrideCount: Object.keys(overrides).length,
    persistence: persistenceStatus(),
  });
}

async function handlePut(req, res, user) {
  if (!requireCsrf(req)) {
    return json(res, 403, { error: 'Request must come from the Windex origin.' });
  }

  if (!isPersistenceConfigured()) {
    return json(res, 503, {
      error: 'Windex server persistence is not configured yet. Copy changes for Pi, or set INDEX_POSTGRES_URL before applying in Windex.',
      persistence: persistenceStatus(),
    });
  }

  const body = await readJsonBody(req);
  const changes = normalizeOverrideChanges(body.changes);
  const overrides = await saveOverrideChanges(changes, { actor: user.email });
  return json(res, 200, registryPayload(overrides, {
    persistence: persistenceStatus(),
    appliedChangeCount: changes.length,
  }));
}

module.exports = async function handler(req, res) {
  if (!['GET', 'PUT'].includes(req.method)) {
    res.setHeader('Allow', 'GET, PUT');
    return json(res, 405, { error: 'Method not allowed' });
  }

  const user = getSession(req);
  if (!user) {
    return json(res, 401, { error: 'Sign in with your work Google account to manage Windex.' });
  }

  try {
    if (req.method === 'GET') return await handleGet(res);
    return await handlePut(req, res, user);
  } catch (error) {
    return handleError(res, error);
  }
};
