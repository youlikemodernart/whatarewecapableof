const { getSession, json } = require('./_auth');
const { loadOverrides, persistenceStatus } = require('./_db');
const { registryPayload } = require('./_registry');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { error: 'Method not allowed' });
  }

  const user = getSession(req);
  if (!user) {
    return json(res, 401, { error: 'Sign in with your work Google account to load Windex.' });
  }

  try {
    const overrides = await loadOverrides();
    return json(res, 200, registryPayload(overrides, { persistence: persistenceStatus() }));
  } catch (error) {
    return json(res, 500, { error: 'Windex registry could not load.' });
  }
};
