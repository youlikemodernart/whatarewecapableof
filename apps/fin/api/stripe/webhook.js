const { json } = require('../_auth');
const { readRawBody, handleApiError } = require('../_http');
const { verifyStripeWebhook } = require('../_stripe');
const { processStripeEvent } = require('../_db');

const MAX_WEBHOOK_BYTES = 500_000;

function noStore(res) {
  res.setHeader('Cache-Control', 'no-store');
}

module.exports = async function handler(req, res) {
  noStore(res);
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Method not allowed' });
  }

  try {
    const rawBody = await readRawBody(req, MAX_WEBHOOK_BYTES);
    const event = verifyStripeWebhook(rawBody, req.headers['stripe-signature']);
    const result = await processStripeEvent(event);
    return json(res, 200, { ok: true, result });
  } catch (error) {
    return handleApiError(res, json, error);
  }
};
