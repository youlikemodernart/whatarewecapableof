const { getBaseUrl, json } = require('../_auth');
const { handleApiError } = require('../_http');
const { publicDeck, cleanSlug } = require('../_db');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { error: 'Method not allowed' });
  }

  try {
    const url = new URL(req.url, getBaseUrl(req));
    const slug = cleanSlug(url.searchParams.get('slug'));
    const deck = await publicDeck(slug, false);
    return json(res, 200, { ok: true, deck });
  } catch (error) {
    return handleApiError(res, json, error);
  }
};
