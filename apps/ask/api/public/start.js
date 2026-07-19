const { json, createDraftCookie, getDraft } = require('../_auth');
const { readJsonBody, handleApiError, makeHttpError } = require('../_http');
const { cleanSlug, startResponse, resumeResponse } = require('../_db');
const { checkRateLimit } = require('../_rate_limit');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Method not allowed' });
  }

  try {
    const body = await readJsonBody(req, 12_000);
    if (body.begin !== true) throw makeHttpError(400, 'Use the Begin action to open these questions.');
    const slug = cleanSlug(body.slug);
    const existingDraft = getDraft(req);
    const resumed = existingDraft?.responseId
      ? await resumeResponse({ responseId: existingDraft.responseId, slug })
      : null;
    if (resumed) return json(res, 200, { ok: true, draftStarted: true, resumed: true, deck: resumed.deck });

    checkRateLimit(req, `ask:start:${slug}`, { limit: 8, windowMs: 10 * 60 * 1000 });
    const result = await startResponse({
      slug,
      passcode: String(body.passcode || '').slice(0, 256),
    });
    res.setHeader('Set-Cookie', createDraftCookie(req, result));
    return json(res, 200, { ok: true, draftStarted: true, resumed: false, deck: result.deck });
  } catch (error) {
    return handleApiError(res, json, error);
  }
};
