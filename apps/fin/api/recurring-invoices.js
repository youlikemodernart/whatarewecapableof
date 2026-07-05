const { getSession, storageConfig, json } = require('./_auth');
const { makeHttpError, readJsonBody, handleApiError } = require('./_http');
const {
  listRecurringInvoiceTemplates,
  getRecurringInvoiceTemplate,
  createRecurringInvoiceTemplate,
  updateRecurringInvoiceTemplate,
  deleteRecurringInvoiceTemplate,
  listRecurringInvoiceRuns,
  generateRecurringInvoiceRun,
} = require('./_db');

function requestParams(req) {
  return new URL(req.url || '/api/recurring-invoices', 'http://127.0.0.1').searchParams;
}

function ensureStorageReady() {
  const storage = storageConfig();
  if (!storage.configured) throw makeHttpError(503, 'Hosted database is not configured yet.');
  if (storage.mode !== 'postgres') throw makeHttpError(501, `Hosted invoice storage mode is not supported: ${storage.mode}`);
  return storage;
}

async function handleGet(req, res, user, storage) {
  const params = requestParams(req);
  const id = String(params.get('id') || '').trim();
  if (id && params.get('runs')) {
    const runs = await listRecurringInvoiceRuns(user, id, { limit: params.get('limit') || 50 });
    return json(res, 200, { ok: true, storage, runs });
  }
  if (id) {
    const template = await getRecurringInvoiceTemplate(user, id);
    if (!template) throw makeHttpError(404, 'Recurring invoice template not found.');
    return json(res, 200, { ok: true, storage, template });
  }
  const templates = await listRecurringInvoiceTemplates(user, { includePaused: params.get('includePaused') || params.get('include_paused') });
  return json(res, 200, { ok: true, storage, templates });
}

async function handlePost(req, res, user, storage) {
  const body = await readJsonBody(req);
  const action = String(body.action || '').trim();
  if (action === 'generate_run') {
    const templateId = String(body.templateId || body.template_id || '').trim();
    if (!templateId) throw makeHttpError(400, 'templateId is required.');
    const result = await generateRecurringInvoiceRun(user, templateId, body.options || body);
    return json(res, result.created ? 201 : 200, { ok: true, storage, ...result });
  }
  const template = await createRecurringInvoiceTemplate(user, body.template || body);
  return json(res, 201, { ok: true, storage, template });
}

async function handlePatch(req, res, user, storage) {
  const id = String(requestParams(req).get('id') || '').trim();
  if (!id) throw makeHttpError(400, 'Recurring invoice template id is required.');
  const body = await readJsonBody(req);
  const template = await updateRecurringInvoiceTemplate(user, id, body.template || body);
  if (!template) throw makeHttpError(404, 'Recurring invoice template not found.');
  return json(res, 200, { ok: true, storage, template });
}

async function handleDelete(req, res, user, storage) {
  const id = String(requestParams(req).get('id') || '').trim();
  if (!id) throw makeHttpError(400, 'Recurring invoice template id is required.');
  const deleted = await deleteRecurringInvoiceTemplate(user, id);
  if (!deleted) throw makeHttpError(404, 'Recurring invoice template not found.');
  return json(res, 200, { ok: true, storage, deleted: true, id });
}

module.exports = async function handler(req, res) {
  const user = getSession(req);
  if (!user) return json(res, 401, { error: 'Sign in required.' });

  try {
    const storage = ensureStorageReady();
    if (req.method === 'GET') return await handleGet(req, res, user, storage);
    if (req.method === 'POST') return await handlePost(req, res, user, storage);
    if (req.method === 'PATCH' || req.method === 'PUT') return await handlePatch(req, res, user, storage);
    if (req.method === 'DELETE') return await handleDelete(req, res, user, storage);
    res.setHeader('Allow', 'GET, POST, PATCH, PUT, DELETE');
    return json(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    return handleApiError(res, json, error);
  }
};
