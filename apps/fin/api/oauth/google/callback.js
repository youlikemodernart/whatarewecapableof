const {
  authConfig,
  getBaseUrl,
  verifyOAuthState,
  clearOAuthStateCookie,
  createSessionCookie,
  exchangeCodeForTokens,
  verifyGoogleIdToken,
  json,
} = require('../../_auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { error: 'Method not allowed' });
  }

  const config = authConfig();
  if (!config.configured) {
    return json(res, 503, { error: 'Google OAuth is not configured.' });
  }

  const url = new URL(req.url, getBaseUrl(req));
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    res.statusCode = 302;
    res.setHeader('Set-Cookie', clearOAuthStateCookie());
    res.setHeader('Location', `/?auth=google-error`);
    return res.end();
  }

  if (!code || !verifyOAuthState(req, state)) {
    res.statusCode = 302;
    res.setHeader('Set-Cookie', clearOAuthStateCookie());
    res.setHeader('Location', `/?auth=state-error`);
    return res.end();
  }

  try {
    const redirectUri = `${getBaseUrl(req)}/api/oauth/google/callback`;
    const tokens = await exchangeCodeForTokens({ code, redirectUri });
    const user = await verifyGoogleIdToken(tokens.id_token);
    res.statusCode = 302;
    res.setHeader('Set-Cookie', [clearOAuthStateCookie(), createSessionCookie(req, user)]);
    res.setHeader('Location', '/');
    return res.end();
  } catch (err) {
    res.statusCode = 302;
    res.setHeader('Set-Cookie', clearOAuthStateCookie());
    res.setHeader('Location', `/?auth=denied`);
    return res.end();
  }
};
