const { authConfig, storageConfig, paymentConfig, getSession, json } = require('./_auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { error: 'Method not allowed' });
  }

  const auth = authConfig();
  const user = getSession(req);

  return json(res, 200, {
    ok: true,
    user,
    auth: {
      configured: auth.configured,
      allowedDomain: auth.allowedDomain,
      allowlistEnabled: auth.allowedEmails.length > 0,
    },
    storage: storageConfig(),
    payments: paymentConfig(),
  });
};
