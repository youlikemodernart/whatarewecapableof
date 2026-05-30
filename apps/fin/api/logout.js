const { clearSessionCookie } = require('./_auth');

module.exports = async function handler(req, res) {
  res.statusCode = 302;
  res.setHeader('Set-Cookie', clearSessionCookie());
  res.setHeader('Location', '/');
  res.end();
};
