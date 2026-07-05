const { normalizeInvoice, cleanEntityId, cleanReportingEntityId, publicEntity } = require('./_invoice');

const TEMPLATE_STATUSES = new Set(['active', 'paused']);
const CADENCES = new Set(['weekly']);
const SEND_MODES = new Set(['draft_only', 'prepare_for_approval']);
const PAYMENT_PAGE_MODES = new Set(['manual_after_approval', 'none']);

function makeError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function cleanSingleLine(value, max = 240) {
  return String(value || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanText(value, max = 4000) {
  return String(value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').slice(0, max).trim();
}

function cleanEmail(value) {
  const email = cleanSingleLine(value, 320).toLowerCase();
  if (!email) return '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function cleanEmailList(value, max = 10) {
  const raw = Array.isArray(value) ? value : String(value || '').split(',');
  const emails = raw.map(cleanEmail).filter(Boolean).slice(0, max);
  return [...new Set(emails)];
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function cleanDate(value, fallback = todayIso()) {
  const text = cleanSingleLine(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return fallback;
  const date = new Date(`${text}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) return fallback;
  return date.toISOString().slice(0, 10) === text ? text : fallback;
}

function addDays(dateIso, days) {
  const date = new Date(`${cleanDate(dateIso)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function dayOfWeek(value, fallback = 1) {
  const number = Number(value);
  if (Number.isInteger(number) && number >= 0 && number <= 6) return number;
  return fallback;
}

function dayOfWeekForDate(dateIso) {
  return new Date(`${cleanDate(dateIso)}T00:00:00Z`).getUTCDay();
}

function nextWeeklyDate(targetDay = 1, fromDate = todayIso()) {
  const start = cleanDate(fromDate);
  const current = dayOfWeekForDate(start);
  const target = dayOfWeek(targetDay, 1);
  const delta = (target - current + 7) % 7;
  return addDays(start, delta || 7);
}

function cleanIntervalCount(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 1;
  return Math.max(1, Math.min(12, Math.round(number)));
}

function cleanDueDays(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(90, Math.round(number)));
}

function renderTemplateString(value, context = {}) {
  const replacements = {
    run_date: context.runDate || '',
    period_start: context.periodStart || '',
    period_end: context.periodEnd || '',
    invoice_number: context.invoiceNumber || '',
    payment_link: context.paymentLink || '[payment link]',
  };
  return String(value || '').replace(/\{(run_date|period_start|period_end|invoice_number|payment_link)\}/g, (_, key) => replacements[key] || '');
}

function normalizeEmailTemplate(input = {}, invoice = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const recipientEmails = cleanEmailList(source.recipientEmails || source.to || invoice.client?.email || '', 10);
  return {
    fromEmail: cleanEmail(source.fromEmail || source.from || invoice.from?.email || 'hello@whatarewecapableof.com') || 'hello@whatarewecapableof.com',
    fromName: cleanSingleLine(source.fromName || source.senderName || 'Noah Glynn', 120),
    recipientEmails,
    ccEmails: cleanEmailList(source.ccEmails || source.cc, 10),
    bccEmails: cleanEmailList(source.bccEmails || source.bcc, 10),
    subject: cleanSingleLine(source.subject || `${invoice.client?.company || invoice.client?.name || 'Client'} weekly support invoice`, 180),
    body: cleanText(source.body || 'Hi,\n\nAttached is the invoice for this week\'s support. You can pay by bank account or card through the payment link.\n\nThank you,\nNoah', 4000),
    attachPdf: source.attachPdf === false ? false : true,
    includePaymentLink: source.includePaymentLink === false ? false : true,
  };
}

function cleanSendMode(value) {
  const mode = cleanSingleLine(value || 'prepare_for_approval', 40).toLowerCase();
  if (!SEND_MODES.has(mode)) throw makeError(400, 'Recurring invoice send mode must be draft_only or prepare_for_approval. Auto-send requires a separate approval-gated release.');
  return mode;
}

function cleanPaymentPageMode(value) {
  const mode = cleanSingleLine(value || 'manual_after_approval', 40).toLowerCase();
  return PAYMENT_PAGE_MODES.has(mode) ? mode : 'manual_after_approval';
}

function normalizeRecurringInvoiceTemplate(input = {}, options = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const id = cleanSingleLine(options.id || source.id, 80);
  const rawInvoice = source.invoiceTemplate || source.invoice || {};
  const entityId = cleanEntityId(source.entityId || source.entity_id || rawInvoice.entityId || 'wawco');
  const reportingEntityId = cleanReportingEntityId(source.reportingEntityId || source.reporting_entity_id || rawInvoice.reportingEntityId || entityId, entityId);
  const sendMode = cleanSendMode(source.sendMode || source.send_mode || rawInvoice.recurringSendMode);
  const invoiceStatus = sendMode === 'draft_only' ? 'draft' : 'ready_for_review';
  const invoiceTemplate = normalizeInvoice({
    ...rawInvoice,
    id: '',
    invoiceNumber: '',
    entityId,
    reportingEntityId,
    status: ['draft', 'ready_for_review'].includes(cleanSingleLine(rawInvoice.status, 40)) ? rawInvoice.status : invoiceStatus,
  }, { id: '', invoiceNumber: '', entityId });
  const cadence = cleanSingleLine(source.cadence || 'weekly', 40).toLowerCase();
  if (!CADENCES.has(cadence)) throw makeError(400, 'Recurring invoice cadence must be weekly.');
  const inferredDay = dayOfWeekForDate(source.nextRunDate || source.next_run_date || todayIso());
  const templateDay = dayOfWeek(source.dayOfWeek ?? source.day_of_week, inferredDay);
  const nextRunDate = cleanDate(source.nextRunDate || source.next_run_date || nextWeeklyDate(templateDay));
  const status = TEMPLATE_STATUSES.has(cleanSingleLine(source.status || 'active', 40).toLowerCase()) ? cleanSingleLine(source.status || 'active', 40).toLowerCase() : 'active';
  const label = cleanSingleLine(source.label || `${invoiceTemplate.client.company || invoiceTemplate.client.name || 'Client'} weekly invoice`, 160);
  return {
    id,
    status,
    label,
    entityId,
    entity: publicEntity(entityId),
    reportingEntityId,
    reportingEntity: publicEntity(reportingEntityId),
    cadence,
    intervalCount: cleanIntervalCount(source.intervalCount || source.interval_count || 1),
    dayOfWeek: templateDay,
    nextRunDate,
    dueDays: cleanDueDays(source.dueDays ?? source.due_days),
    sendMode,
    paymentPageMode: cleanPaymentPageMode(source.paymentPageMode || source.payment_page_mode),
    invoiceTemplate,
    emailTemplate: normalizeEmailTemplate(source.emailTemplate || source.email || {}, invoiceTemplate),
  };
}

function periodForRun(template = {}, runDateInput = '') {
  const runDate = cleanDate(runDateInput || template.nextRunDate || todayIso());
  if (template.cadence === 'weekly') {
    return { runDate, periodStart: runDate, periodEnd: addDays(runDate, (cleanIntervalCount(template.intervalCount) * 7) - 1) };
  }
  return { runDate, periodStart: runDate, periodEnd: runDate };
}

function nextRecurringRunDate(template = {}, runDateInput = '') {
  const runDate = cleanDate(runDateInput || template.nextRunDate || todayIso());
  if (template.cadence === 'weekly') return addDays(runDate, cleanIntervalCount(template.intervalCount) * 7);
  return addDays(runDate, 7);
}

function buildRecurringInvoiceForRun(template = {}, options = {}) {
  const period = periodForRun(template, options.runDate || template.nextRunDate);
  const context = { ...period };
  const requestedStatus = cleanSingleLine(options.invoiceStatus || '', 40);
  const status = ['draft', 'ready_for_review'].includes(requestedStatus)
    ? requestedStatus
    : template.sendMode === 'draft_only' ? 'draft' : 'ready_for_review';
  const source = template.invoiceTemplate || {};
  const invoice = normalizeInvoice({
    ...source,
    invoiceNumber: '',
    id: '',
    status,
    invoiceDate: period.runDate,
    dueDate: addDays(period.runDate, cleanDueDays(template.dueDays)),
    project: renderTemplateString(source.project, context),
    notes: renderTemplateString(source.notes, context),
    terms: renderTemplateString(source.terms, context),
    paymentInstructions: renderTemplateString(source.paymentInstructions, context),
    items: Array.isArray(source.items) ? source.items.map((item) => ({
      ...item,
      description: renderTemplateString(item.description, context),
    })) : source.items,
    recurring: {
      templateId: template.id || '',
      templateLabel: template.label || '',
      runDate: period.runDate,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      sendMode: template.sendMode || 'prepare_for_approval',
    },
  }, { id: '', invoiceNumber: '', entityId: template.entityId || source.entityId || 'wawco' });
  return { invoice, ...period };
}

function recurringTemplateSafeSummary(template = {}) {
  const invoice = template.invoiceTemplate || {};
  return {
    id: template.id || '',
    status: template.status || 'active',
    label: template.label || '',
    entityId: template.entityId || invoice.entityId || 'wawco',
    reportingEntityId: template.reportingEntityId || invoice.reportingEntityId || template.entityId || 'wawco',
    cadence: template.cadence || 'weekly',
    intervalCount: Number(template.intervalCount || 1),
    dayOfWeek: Number(template.dayOfWeek || 1),
    nextRunDate: template.nextRunDate || '',
    dueDays: Number(template.dueDays || 0),
    sendMode: template.sendMode || 'prepare_for_approval',
    paymentPageMode: template.paymentPageMode || 'manual_after_approval',
    clientLabel: invoice.client?.company || invoice.client?.name || invoice.client?.email || '',
    recipientCount: Array.isArray(template.emailTemplate?.recipientEmails) ? template.emailTemplate.recipientEmails.length : 0,
    attachPdf: template.emailTemplate?.attachPdf !== false,
    totalCents: Number(invoice.totals?.totalCents || 0),
  };
}

function recurringTemplateListItem(template = {}) {
  return recurringTemplateSafeSummary(template);
}

function recurringRunSummary(run = {}, template = {}) {
  return {
    id: run.id || '',
    templateId: run.templateId || template.id || '',
    templateLabel: template.label || run.templateLabel || '',
    runDate: run.runDate || '',
    periodStart: run.periodStart || '',
    periodEnd: run.periodEnd || '',
    status: run.status || 'created',
    invoiceId: run.invoiceId || '',
    invoiceNumber: run.invoiceNumber || '',
    paymentRequestId: run.paymentRequestId || '',
    sendMode: run.sendMode || template.sendMode || 'prepare_for_approval',
    emailStatus: run.emailStatus || 'not_sent',
    paymentPageStatus: run.paymentPageStatus || 'requires_invoice_approval',
  };
}

module.exports = {
  normalizeRecurringInvoiceTemplate,
  recurringTemplateSafeSummary,
  recurringTemplateListItem,
  buildRecurringInvoiceForRun,
  periodForRun,
  nextRecurringRunDate,
  recurringRunSummary,
  cleanDate,
  addDays,
};
