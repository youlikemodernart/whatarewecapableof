const { authConfig, storageConfig, paymentConfig, json } = require('./_auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { error: 'Method not allowed' });
  }

  const auth = authConfig();
  const storage = storageConfig();
  const payments = paymentConfig();

  return json(res, 200, {
    ok: true,
    service: 'wawco-fin',
    authConfigured: auth.configured,
    storageConfigured: storage.configured,
    paymentsConfigured: payments.configured,
  });
};
