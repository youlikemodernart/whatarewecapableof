const { json, getDraft, clearDraftCookie } = require('../_auth');
const { readJsonBody, handleApiError, makeHttpError } = require('../_http');
const { submitResponse } = require('../_db');
const { checkRateLimit } = require('../_rate_limit');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Method not allowed' });
  }

  try {
    const body = await readJsonBody(req, 96_000);
    checkRateLimit(req, 'ask:submit', { limit: 20, windowMs: 10 * 60 * 1000 });
    const draft = getDraft(req);
    if (!draft?.responseId) {
      throw makeHttpError(401, 'This response session expired. Please reopen the link.');
    }
    const response = await submitResponse({ responseId: draft.responseId, answers: body.answers });
    res.setHeader('Set-Cookie', clearDraftCookie());
    return json(res, 200, {
      ok: true,
      submitted: true,
      followupCount: response.followupCount,
      approvalCount: response.approvalCount,
    });
  } catch (error) {
    return handleApiError(res, json, error);
  }
};
