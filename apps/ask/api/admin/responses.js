const { getSession, requireCsrf, json } = require('../_auth');
const { handleApiError, makeHttpError } = require('../_http');
const { listResponses } = require('../_db');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return json(res, 405, { error: 'Method not allowed' });
  }

  try {
    const user = getSession(req);
    if (!user) throw makeHttpError(401, 'Sign in required.');
    if (req.method !== 'GET' && !requireCsrf(req)) throw makeHttpError(403, 'CSRF check failed.');
    const responses = await listResponses();
    return json(res, 200, { ok: true, user, responses });
  } catch (error) {
    return handleApiError(res, json, error);
  }
};
