const { authConfig, storageConfig, json } = require('./_auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { error: 'Method not allowed' });
  }

  return json(res, 200, {
    ok: true,
    service: 'wawco-ask',
    authConfigured: authConfig().configured,
    storage: storageConfig(),
  });
};
