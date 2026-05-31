const { getBaseUrl, getSession, json } = require('../_auth');
const { handleApiError, makeHttpError } = require('../_http');
const { getResponse, responseMarkdown } = require('../_db');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { error: 'Method not allowed' });
  }

  try {
    const user = getSession(req);
    if (!user) throw makeHttpError(401, 'Sign in required.');
    const url = new URL(req.url, getBaseUrl(req));
    const response = await getResponse(url.searchParams.get('id'));
    const markdown = responseMarkdown(response);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(markdown);
  } catch (error) {
    return handleApiError(res, json, error);
  }
};
