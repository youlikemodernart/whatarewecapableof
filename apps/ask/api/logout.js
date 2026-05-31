const { clearSessionCookies } = require('./_auth');

module.exports = async function handler(req, res) {
  res.statusCode = 302;
  res.setHeader('Set-Cookie', clearSessionCookies());
  res.setHeader('Location', '/admin.html');
  res.end();
};
