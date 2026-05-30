const { authConfig, createOAuthStateCookie, getBaseUrl, json } = require('../_auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { error: 'Method not allowed' });
  }

  const config = authConfig();
  if (!config.configured) {
    return json(res, 503, { error: 'Google OAuth is not configured.' });
  }

  const { state, cookie } = createOAuthStateCookie(req);
  const redirectUri = `${getBaseUrl(req)}/api/oauth/google/callback`;
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    hd: config.allowedDomain,
    prompt: 'select_account',
  });

  res.statusCode = 302;
  res.setHeader('Set-Cookie', cookie);
  res.setHeader('Location', `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  res.end();
};
