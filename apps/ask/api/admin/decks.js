const { getBaseUrl, getSession, requireCsrf, json } = require('../_auth');
const { readJsonBody, handleApiError, makeHttpError } = require('../_http');
const { createDeckFromImport, reconfigureDeckAccess, reviseDeckQuestions, listDecks } = require('../_db');

module.exports = async function handler(req, res) {
  if (!['GET', 'POST', 'PATCH'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, PATCH');
    return json(res, 405, { error: 'Method not allowed' });
  }

  try {
    const user = getSession(req);
    if (!user) throw makeHttpError(401, 'Sign in required.');
    const baseUrl = getBaseUrl(req);

    if (req.method === 'GET') {
      const decks = await listDecks({ baseUrl });
      return json(res, 200, { ok: true, user, decks });
    }

    if (!requireCsrf(req)) throw makeHttpError(403, 'CSRF check failed.');
    const body = await readJsonBody(req, 96_000);
    if (req.method === 'POST') {
      const result = await createDeckFromImport({
        deckInput: body.deck || body,
        actorUserId: user.email || user.sub || 'admin',
        baseUrl,
      });
      return json(res, 201, result);
    }

    if (body.action === 'revise-questions') {
      const result = await reviseDeckQuestions({
        deckId: body.id || body.deckId,
        questions: body.questions,
        actorUserId: user.email || user.sub || 'admin',
        baseUrl,
      });
      return json(res, 200, result);
    }

    const result = await reconfigureDeckAccess({
      deckId: body.id || body.deckId,
      access: body.access,
      actorUserId: user.email || user.sub || 'admin',
      baseUrl,
    });
    return json(res, 200, result);
  } catch (error) {
    return handleApiError(res, json, error);
  }
};
