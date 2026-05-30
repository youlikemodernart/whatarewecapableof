const $ = (selector) => document.querySelector(selector);

const refs = {
  signinPanel: $('#signin-panel'),
  signinHelp: $('#signin-help'),
  workspace: $('#invoice-workspace'),
  state: $('#invoice-state'),
  notice: $('#notice'),
  list: $('#invoice-list'),
  form: $('#invoice-form'),
  newInvoice: $('#new-invoice'),
  addItem: $('#add-item'),
  saveInvoice: $('#save-invoice'),
  duplicateInvoice: $('#duplicate-invoice'),
  markReady: $('#mark-ready'),
  approveInvoice: $('#approve-invoice'),
  exportJson: $('#export-json'),
  importJson: $('#import-json'),
  exportMercuryPlan: $('#export-mercury-plan'),
  printInvoice: $('#print-invoice'),
  printInvoiceBottom: $('#print-invoice-bottom'),
  deleteInvoice: $('#delete-invoice'),
  saveNumbering: $('#save-numbering'),
  numberExample: $('#number-example'),
  numberPadding: $('#number-padding'),
  paymentStatusLabel: $('#payment-status-label'),
  paymentHelp: $('#payment-help'),
  paymentMode: $('#payment-mode'),
  paymentAmount: $('#payment-amount'),
  paymentUrl: $('#payment-url'),
  createTestPaymentLink: $('#create-test-payment-link'),
  createLivePaymentLink: $('#create-live-payment-link'),
  copyPaymentLink: $('#copy-payment-link'),
  userProfileSelect: $('#user-profile-select'),
  applyUserProfile: $('#apply-user-profile'),
  saveUserProfile: $('#save-user-profile'),
  deleteUserProfile: $('#delete-user-profile'),
  payeeProfileSelect: $('#payee-profile-select'),
  applyPayeeProfile: $('#apply-payee-profile'),
  savePayeeProfile: $('#save-payee-profile'),
  deletePayeeProfile: $('#delete-payee-profile'),
  clientProfileSelect: $('#client-profile-select'),
  applyClientProfile: $('#apply-client-profile'),
  saveClientProfile: $('#save-client-profile'),
  deleteClientProfile: $('#delete-client-profile'),
  invoiceNumber: $('#invoice-number'),
  status: $('#status'),
  invoiceDate: $('#invoice-date'),
  dueDate: $('#due-date'),
  salesRep: $('#sales-rep'),
  salesRepEmail: $('#sales-rep-email'),
  salesRole: $('#sales-role'),
  project: $('#project'),
  fromName: $('#from-name'),
  fromEmail: $('#from-email'),
  fromAddress: $('#from-address'),
  payeeReportingScope: $('#payee-reporting-scope'),
  fromMercuryAccount: $('#from-mercury-account'),
  clientName: $('#client-name'),
  clientCompany: $('#client-company'),
  clientEmail: $('#client-email'),
  clientAddress: $('#client-address'),
  clientMercuryCustomer: $('#client-mercury-customer'),
  clientInvoiceCode: $('#client-invoice-code'),
  itemsEditor: $('#items-editor'),
  discount: $('#discount'),
  taxRate: $('#tax-rate'),
  shipping: $('#shipping'),
  notes: $('#notes'),
  terms: $('#terms'),
  paymentInstructions: $('#payment-instructions'),
  previewNumber: $('#preview-number'),
  previewFromName: $('#preview-from-name'),
  previewFromEmail: $('#preview-from-email'),
  previewFromAddress: $('#preview-from-address'),
  previewClientLabel: $('#preview-client-label'),
  previewClientEmail: $('#preview-client-email'),
  previewClientAddress: $('#preview-client-address'),
  previewMeta: $('#preview-meta'),
  previewDates: $('#preview-dates'),
  previewAttrs: $('#preview-attrs'),
  previewInvoiceDateField: $('#preview-invoice-date-field'),
  previewDueDateField: $('#preview-due-date-field'),
  previewProjectField: $('#preview-project-field'),
  previewSalesRepField: $('#preview-sales-rep-field'),
  previewInvoiceDate: $('#preview-invoice-date'),
  previewDueDate: $('#preview-due-date'),
  previewProject: $('#preview-project'),
  previewSalesRep: $('#preview-sales-rep'),
  previewSalesRole: $('#preview-sales-role'),
  previewItems: $('#preview-items'),
  previewSubtotal: $('#preview-subtotal'),
  previewDiscount: $('#preview-discount'),
  previewTax: $('#preview-tax'),
  previewShipping: $('#preview-shipping'),
  previewTotal: $('#preview-total'),
  previewNotes: $('#preview-notes'),
  previewTerms: $('#preview-terms'),
  previewPayment: $('#preview-payment'),
};

let currentInvoice = null;
let invoices = [];
let items = [];
let profiles = { payee: [], client: [], user: [] };
let paymentSettings = { configured: false, mode: 'disabled', testLinksEnabled: false, liveLinksEnabled: false };
let formDirty = false;

async function getJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed: ${response.status}`);
  return data;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatDisplayDate(value) {
  if (!value) return '';
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(value);
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(date);
}

function moneyToCents(value) {
  const text = String(value || '').replace(/[$,]/g, '').trim();
  if (!text || !/^-?\d+(?:\.\d{0,2})?$/.test(text)) return 0;
  const negative = text.startsWith('-');
  const unsigned = negative ? text.slice(1) : text;
  const [dollars, cents = ''] = unsigned.split('.');
  const result = (Number(dollars || 0) * 100) + Number(cents.padEnd(2, '0').slice(0, 2));
  return negative ? -result : result;
}

function formatCurrency(cents) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format((Number(cents) || 0) / 100);
}

function formatStatus(status) {
  if (status === 'ready_for_review') return 'Ready for review';
  return String(status || 'draft').replace(/[_-]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function paymentLabel(payment) {
  if (!payment) return 'No link';
  if (payment.status === 'active') return `${formatStatus(payment.mode)} link active`;
  if (payment.status === 'paid') return 'Paid';
  if (payment.status === 'processing') return 'Payment processing';
  if (payment.status === 'expired') return 'Expired';
  if (payment.status === 'failed') return 'Failed';
  if (payment.status === 'refunded') return 'Refunded';
  if (payment.status === 'disputed') return 'Dispute watch';
  return formatStatus(payment.status || 'No link');
}

function checkoutModeAvailable(mode) {
  if (!paymentSettings.configured) return false;
  if (mode === 'test') return paymentSettings.mode === 'test' && paymentSettings.testLinksEnabled;
  if (mode === 'live') return paymentSettings.mode === 'live' && paymentSettings.liveLinksEnabled;
  return false;
}

function paymentModeCopy(payment) {
  if (payment) return `${formatStatus(payment.mode)} mode`;
  if (!paymentSettings.configured) return 'Not configured';
  if (paymentSettings.mode === 'live') return paymentSettings.liveLinksEnabled ? 'Live ready' : 'Live disabled';
  if (paymentSettings.mode === 'test') return paymentSettings.testLinksEnabled ? 'Test ready' : 'Test disabled';
  return formatStatus(paymentSettings.mode || 'disabled');
}

function safeFileName(value, fallback) {
  return String(value || fallback).replace(/[^a-z0-9_.-]+/gi, '-').replace(/^-+|-+$/g, '') || fallback;
}

function downloadText(filename, text, type = 'text/plain') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function blankItem() {
  return { id: crypto.randomUUID(), description: 'Consulting work', quantity: 1, unitPrice: '0.00' };
}

function baseInvoice() {
  return {
    id: '',
    invoiceNumber: 'Assigned on save',
    status: 'draft',
    currency: 'USD',
    project: '',
    invoiceDate: todayIso(),
    dueDate: '',
    salesRep: '',
    salesRepEmail: '',
    salesRole: 'admin',
    payeeProfileId: '',
    clientProfileId: '',
    userProfileId: '',
    payeeReportingScope: 'wawco',
    excludeFromWawcoDashboard: false,
    from: { name: 'What are we capable of?', company: 'What are we capable of?', email: 'hello@whatarewecapableof.com', address: '', mercuryDestinationAccountId: '' },
    client: { name: '', company: '', email: '', address: '', mercuryCustomerId: '', invoiceCode: '' },
    items: [blankItem()],
    discount: '0.00',
    taxRate: 0,
    shipping: '0.00',
    notes: 'Thank you.',
    terms: 'Payment due within 14 days unless otherwise agreed.',
    paymentInstructions: 'Payment instructions to be confirmed before sending.',
  };
}

function setNotice(message) {
  refs.notice.textContent = message || '';
}

function setState(message) {
  refs.state.textContent = message || '';
}

function totalsFor(invoiceItems = items) {
  const subtotalCents = invoiceItems.reduce((sum, item) => {
    const quantity = Number(item.quantity || 0);
    return sum + Math.round(Math.max(0, quantity) * Math.max(0, moneyToCents(item.unitPrice)));
  }, 0);
  const discountCents = Math.min(subtotalCents, Math.max(0, moneyToCents(refs.discount.value)));
  const taxableCents = Math.max(0, subtotalCents - discountCents);
  const taxCents = Math.round(taxableCents * Math.max(0, Number(refs.taxRate.value || 0)) / 100);
  const shippingCents = Math.max(0, moneyToCents(refs.shipping.value));
  const totalCents = taxableCents + taxCents + shippingCents;
  return { subtotalCents, discountCents, taxableCents, taxCents, shippingCents, totalCents };
}

function currentFormInvoice(status = refs.status.value || 'draft') {
  const invoiceItems = items.map((item) => ({
    id: item.id || crypto.randomUUID(),
    description: item.description || '',
    quantity: Number(item.quantity || 0),
    unitPrice: item.unitPrice || '0.00',
  }));
  const payeeReportingScope = refs.payeeReportingScope.value || 'wawco';
  return {
    ...(currentInvoice || {}),
    invoiceNumber: refs.invoiceNumber.value || currentInvoice?.invoiceNumber || '',
    status,
    currency: 'USD',
    project: refs.project.value,
    invoiceDate: refs.invoiceDate.value,
    dueDate: refs.dueDate.value,
    salesRep: refs.salesRep.value,
    salesRepEmail: refs.salesRepEmail.value,
    salesRole: refs.salesRole.value,
    payeeProfileId: refs.payeeProfileSelect.value || '',
    clientProfileId: refs.clientProfileSelect.value || '',
    userProfileId: refs.userProfileSelect.value || '',
    payeeReportingScope,
    excludeFromWawcoDashboard: payeeReportingScope === 'private',
    from: {
      ...(currentInvoice?.from || {}),
      name: refs.fromName.value,
      company: refs.fromName.value,
      email: refs.fromEmail.value,
      address: refs.fromAddress.value,
      mercuryDestinationAccountId: refs.fromMercuryAccount.value,
    },
    client: {
      ...(currentInvoice?.client || {}),
      name: refs.clientName.value,
      company: refs.clientCompany.value,
      email: refs.clientEmail.value,
      address: refs.clientAddress.value,
      mercuryCustomerId: refs.clientMercuryCustomer.value,
      invoiceCode: refs.clientInvoiceCode.value,
    },
    items: invoiceItems,
    discount: refs.discount.value || '0.00',
    taxRate: Number(refs.taxRate.value || 0),
    shipping: refs.shipping.value || '0.00',
    notes: refs.notes.value,
    terms: refs.terms.value,
    paymentInstructions: refs.paymentInstructions.value,
    totals: totalsFor(invoiceItems),
    payment: currentInvoice?.payment || null,
  };
}

function profileOptionLabel(profile) {
  return profile?.label || profile?.data?.label || 'Untitled profile';
}

function renderProfileSelect(type) {
  const select = refs[`${type}ProfileSelect`];
  if (!select) return;
  const currentValue = select.value;
  select.replaceChildren();
  const empty = document.createElement('option');
  empty.value = '';
  empty.textContent = `Saved ${type} profiles`;
  select.append(empty);
  profiles[type].forEach((profile) => {
    const option = document.createElement('option');
    option.value = profile.id;
    option.textContent = profileOptionLabel(profile);
    select.append(option);
  });
  if ([...select.options].some((option) => option.value === currentValue)) select.value = currentValue;
}

function profileById(type, id) {
  return profiles[type].find((profile) => profile.id === id) || null;
}

async function loadProfiles() {
  const [payee, client, user] = await Promise.all([
    getJson('/api/profiles?type=payee'),
    getJson('/api/profiles?type=client'),
    getJson('/api/profiles?type=user'),
  ]);
  profiles = {
    payee: payee.profiles || [],
    client: client.profiles || [],
    user: user.profiles || [],
  };
  renderProfileSelect('payee');
  renderProfileSelect('client');
  renderProfileSelect('user');
}

async function loadNumbering() {
  const data = await getJson('/api/numbering');
  const numbering = data.numbering || {};
  refs.numberPadding.value = numbering.sequencePadding || 2;
  refs.numberExample.textContent = numbering.example || 'SUBSTRATE-052626-01';
}

async function saveNumbering() {
  const numbering = {
    sequencePadding: Number(refs.numberPadding.value),
  };
  await getJson('/api/numbering', { method: 'PUT', body: JSON.stringify({ numbering }) });
  await loadNumbering();
  setNotice('Numbering rule saved.');
}

function payeeProfileFromForm() {
  return {
    label: refs.fromName.value || refs.fromEmail.value || 'Untitled payee',
    name: refs.fromName.value,
    company: refs.fromName.value,
    email: refs.fromEmail.value,
    address: refs.fromAddress.value,
    mercuryDestinationAccountId: refs.fromMercuryAccount.value,
    defaultTerms: refs.terms.value,
    defaultPaymentInstructions: refs.paymentInstructions.value,
    reportingScope: refs.payeeReportingScope.value,
    excludeFromWawcoDashboard: refs.payeeReportingScope.value === 'private',
  };
}

function clientProfileFromForm() {
  return {
    label: refs.clientCompany.value || refs.clientName.value || refs.clientEmail.value || 'Untitled client',
    name: refs.clientName.value,
    company: refs.clientCompany.value,
    email: refs.clientEmail.value,
    address: refs.clientAddress.value,
    mercuryCustomerId: refs.clientMercuryCustomer.value,
    invoiceCode: refs.clientInvoiceCode.value,
  };
}

function userProfileFromForm() {
  return {
    label: refs.salesRep.value || refs.salesRepEmail.value || 'Untitled user',
    salesRep: refs.salesRep.value,
    salesRepEmail: refs.salesRepEmail.value,
    salesRole: refs.salesRole.value,
  };
}

function profileFromForm(type) {
  if (type === 'payee') return payeeProfileFromForm();
  if (type === 'client') return clientProfileFromForm();
  return userProfileFromForm();
}

function applyPayeeProfile(profile) {
  if (!profile) return;
  const data = profile.data || {};
  refs.payeeProfileSelect.value = profile.id;
  refs.fromName.value = data.name || data.company || '';
  refs.fromEmail.value = data.email || '';
  refs.fromAddress.value = data.address || '';
  refs.fromMercuryAccount.value = data.mercuryDestinationAccountId || '';
  refs.payeeReportingScope.value = data.reportingScope === 'private' || data.excludeFromWawcoDashboard ? 'private' : 'wawco';
  if (data.defaultTerms) refs.terms.value = data.defaultTerms;
  if (data.defaultPaymentInstructions) refs.paymentInstructions.value = data.defaultPaymentInstructions;
  currentInvoice = { ...(currentInvoice || baseInvoice()), payeeProfileId: profile.id, payeeReportingScope: refs.payeeReportingScope.value, excludeFromWawcoDashboard: refs.payeeReportingScope.value === 'private' };
  formDirty = true;
  renderPreview();
}

function applyClientProfile(profile) {
  if (!profile) return;
  const data = profile.data || {};
  refs.clientProfileSelect.value = profile.id;
  refs.clientName.value = data.name || '';
  refs.clientCompany.value = data.company || '';
  refs.clientEmail.value = data.email || '';
  refs.clientAddress.value = data.address || '';
  refs.clientMercuryCustomer.value = data.mercuryCustomerId || '';
  refs.clientInvoiceCode.value = data.invoiceCode || '';
  currentInvoice = { ...(currentInvoice || baseInvoice()), clientProfileId: profile.id };
  formDirty = true;
  renderPreview();
}

function applyUserProfile(profile) {
  if (!profile) return;
  const data = profile.data || {};
  refs.userProfileSelect.value = profile.id;
  refs.salesRep.value = data.salesRep || '';
  refs.salesRepEmail.value = data.salesRepEmail || '';
  refs.salesRole.value = data.salesRole || 'admin';
  currentInvoice = { ...(currentInvoice || baseInvoice()), userProfileId: profile.id };
  formDirty = true;
  renderPreview();
}

function applyProfile(type) {
  const profile = profileById(type, refs[`${type}ProfileSelect`].value);
  if (type === 'payee') applyPayeeProfile(profile);
  else if (type === 'client') applyClientProfile(profile);
  else applyUserProfile(profile);
  setNotice(profile ? `${formatStatus(type)} profile applied.` : `Choose a saved ${type} profile first.`);
}

async function saveProfile(type) {
  const id = refs[`${type}ProfileSelect`].value;
  const body = { profile: profileFromForm(type) };
  const data = id
    ? await getJson(`/api/profiles?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(body) })
    : await getJson(`/api/profiles?type=${encodeURIComponent(type)}`, { method: 'POST', body: JSON.stringify(body) });
  await loadProfiles();
  refs[`${type}ProfileSelect`].value = data.profile.id;
  setNotice(`${formatStatus(type)} profile saved.`);
}

async function deleteProfile(type) {
  const id = refs[`${type}ProfileSelect`].value;
  if (!id) {
    setNotice(`Choose a saved ${type} profile first.`);
    return;
  }
  if (!window.confirm(`Delete this ${type} profile? Existing invoice drafts will keep their saved fields.`)) return;
  await getJson(`/api/profiles?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  await loadProfiles();
  refs[`${type}ProfileSelect`].value = '';
  setNotice(`${formatStatus(type)} profile deleted.`);
}

function renderItemsEditor() {
  refs.itemsEditor.replaceChildren();
  items.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'item-row';
    row.innerHTML = `
      <label>Description
        <input data-item-field="description" data-index="${index}" autocomplete="off">
      </label>
      <label>Qty
        <input data-item-field="quantity" data-index="${index}" inputmode="decimal">
      </label>
      <label>Rate
        <input data-item-field="unitPrice" data-index="${index}" inputmode="decimal">
      </label>
      <button type="button" class="secondary danger" data-remove-item="${index}" aria-label="Remove item">×</button>
    `;
    row.querySelector('[data-item-field="description"]').value = item.description || '';
    row.querySelector('[data-item-field="quantity"]').value = item.quantity ?? 1;
    row.querySelector('[data-item-field="unitPrice"]').value = item.unitPrice || '0.00';
    refs.itemsEditor.append(row);
  });
}

function fillForm(invoice = baseInvoice()) {
  currentInvoice = invoice;
  formDirty = false;
  refs.invoiceNumber.value = invoice.invoiceNumber || '';
  refs.status.value = invoice.status || 'draft';
  refs.invoiceDate.value = invoice.invoiceDate || '';
  refs.dueDate.value = invoice.dueDate || '';
  refs.salesRep.value = invoice.salesRep || '';
  refs.salesRepEmail.value = invoice.salesRepEmail || '';
  refs.salesRole.value = invoice.salesRole || 'admin';
  refs.userProfileSelect.value = invoice.userProfileId || '';
  refs.project.value = invoice.project || '';
  refs.payeeProfileSelect.value = invoice.payeeProfileId || '';
  refs.fromName.value = invoice.from?.name || invoice.from?.company || 'What are we capable of?';
  refs.fromEmail.value = invoice.from?.email || 'hello@whatarewecapableof.com';
  refs.fromAddress.value = invoice.from?.address || '';
  refs.fromMercuryAccount.value = invoice.from?.mercuryDestinationAccountId || '';
  refs.payeeReportingScope.value = invoice.payeeReportingScope === 'private' || invoice.excludeFromWawcoDashboard ? 'private' : 'wawco';
  refs.clientProfileSelect.value = invoice.clientProfileId || '';
  refs.clientName.value = invoice.client?.name || '';
  refs.clientCompany.value = invoice.client?.company || '';
  refs.clientEmail.value = invoice.client?.email || '';
  refs.clientAddress.value = invoice.client?.address || '';
  refs.clientMercuryCustomer.value = invoice.client?.mercuryCustomerId || '';
  refs.clientInvoiceCode.value = invoice.client?.invoiceCode || '';
  items = (invoice.items && invoice.items.length ? invoice.items : [blankItem()]).map((item) => ({
    id: item.id || crypto.randomUUID(),
    description: item.description || '',
    quantity: item.quantity ?? 1,
    unitPrice: item.unitPrice || '0.00',
  }));
  refs.discount.value = invoice.discount || '0.00';
  refs.taxRate.value = invoice.taxRate || 0;
  refs.shipping.value = invoice.shipping || '0.00';
  refs.notes.value = invoice.notes || '';
  refs.terms.value = invoice.terms || '';
  refs.paymentInstructions.value = invoice.paymentInstructions || '';
  refs.deleteInvoice.disabled = !invoice.id;
  renderItemsEditor();
  renderPreview();
}

function renderPaymentPanel(invoice) {
  const payment = invoice.payment || null;
  const persistedApproved = Boolean(currentInvoice?.id && currentInvoice.status === 'approved' && invoice.status === 'approved' && !formDirty);
  const canCreateLink = Boolean(invoice.id && persistedApproved && !payment?.active && Number(invoice.totals?.totalCents || 0) > 0);
  const canCreateTestLink = canCreateLink && checkoutModeAvailable('test');
  const canCreateLiveLink = canCreateLink && checkoutModeAvailable('live');
  refs.paymentStatusLabel.textContent = paymentLabel(payment);
  refs.paymentStatusLabel.classList.toggle('is-active', Boolean(payment?.active));
  refs.paymentStatusLabel.classList.toggle('is-paid', payment?.status === 'paid');
  refs.paymentMode.textContent = paymentModeCopy(payment);
  refs.paymentAmount.textContent = formatCurrency(payment?.amountCents ?? invoice.totals?.totalCents ?? 0);
  refs.paymentUrl.value = payment?.url || '';
  refs.createTestPaymentLink.disabled = !canCreateTestLink;
  refs.createLivePaymentLink.disabled = !canCreateLiveLink;
  refs.copyPaymentLink.disabled = !payment?.url;
  if (!invoice.id) refs.paymentHelp.textContent = 'Save the invoice before creating a payment link.';
  else if (formDirty) refs.paymentHelp.textContent = 'Save or approve the current invoice state before creating a payment link.';
  else if (invoice.status !== 'approved' || currentInvoice?.status !== 'approved') refs.paymentHelp.textContent = 'Approve the invoice before creating a Stripe Checkout link.';
  else if (payment?.active) refs.paymentHelp.textContent = 'This invoice already has an active payment link for the current snapshot.';
  else if (canCreateLiveLink) refs.paymentHelp.textContent = 'Ready to create a live Stripe Checkout link. Create it at send time; Checkout Sessions expire.';
  else if (canCreateTestLink) refs.paymentHelp.textContent = 'Ready to create a Stripe Checkout link in test mode.';
  else if (!paymentSettings.configured) refs.paymentHelp.textContent = 'Stripe Checkout is not configured for this workspace.';
  else refs.paymentHelp.textContent = `Stripe is configured for ${formatStatus(paymentSettings.mode)}, but that link mode is disabled here.`;
}

function previewPaymentInstructions(invoice) {
  const parts = [invoice.paymentInstructions || ''].filter(Boolean);
  const payment = invoice.payment || null;
  if (payment?.url && ['active', 'processing', 'paid'].includes(payment.status)) {
    parts.push(`${payment.mode === 'test' ? 'TEST MODE, DO NOT PAY\n' : ''}Pay online for this invoice:\n${payment.url}`);
  }
  return parts.join('\n\n');
}

function renderPreview() {
  const invoice = currentFormInvoice();
  const totals = invoice.totals;
  renderPaymentPanel(invoice);
  refs.previewNumber.textContent = invoice.invoiceNumber || 'Assigned on save';
  refs.previewFromName.textContent = invoice.from.name || 'What are we capable of?';
  refs.previewFromEmail.textContent = invoice.from.email || '';
  refs.previewFromAddress.textContent = invoice.from.address || '';
  refs.previewClientLabel.textContent = invoice.client.company || invoice.client.name || 'Client';
  refs.previewClientEmail.textContent = invoice.client.email || '';
  refs.previewClientAddress.textContent = invoice.client.address || '';
  const invoiceDate = String(invoice.invoiceDate || '').trim();
  const dueDate = String(invoice.dueDate || '').trim();
  const project = String(invoice.project || '').trim();
  const salesRep = String(invoice.salesRep || '').trim();
  refs.previewInvoiceDate.textContent = formatDisplayDate(invoiceDate);
  refs.previewDueDate.textContent = formatDisplayDate(dueDate);
  refs.previewProject.textContent = project;
  refs.previewSalesRep.textContent = salesRep;
  refs.previewSalesRole.textContent = salesRep ? formatStatus(invoice.salesRole || 'admin') : '';
  refs.previewInvoiceDateField.hidden = !invoiceDate;
  refs.previewDueDateField.hidden = !dueDate;
  refs.previewProjectField.hidden = !project;
  refs.previewSalesRepField.hidden = !salesRep;
  const datesVisible = Boolean(invoiceDate || dueDate);
  const attrsVisible = Boolean(project || salesRep);
  refs.previewDates.hidden = !datesVisible;
  refs.previewAttrs.hidden = !attrsVisible;
  refs.previewMeta.hidden = !datesVisible && !attrsVisible;
  refs.previewAttrs.style.gridTemplateColumns = attrsVisible && (!project || !salesRep) ? '1fr' : '';
  refs.previewItems.replaceChildren();
  invoice.items.forEach((item) => {
    const amountCents = Math.round(Math.max(0, Number(item.quantity || 0)) * Math.max(0, moneyToCents(item.unitPrice)));
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td></td>
      <td class="numeric"></td>
      <td class="numeric"></td>
      <td class="numeric"></td>
    `;
    tr.children[0].textContent = item.description || 'Line item';
    tr.children[1].textContent = String(item.quantity || 0);
    tr.children[2].textContent = formatCurrency(moneyToCents(item.unitPrice));
    tr.children[3].textContent = formatCurrency(amountCents);
    refs.previewItems.append(tr);
  });
  refs.previewSubtotal.textContent = formatCurrency(totals.subtotalCents);
  refs.previewDiscount.textContent = formatCurrency(totals.discountCents);
  refs.previewTax.textContent = formatCurrency(totals.taxCents);
  refs.previewShipping.textContent = formatCurrency(totals.shippingCents);
  refs.previewTotal.textContent = formatCurrency(totals.totalCents);
  refs.previewNotes.textContent = invoice.notes || '';
  refs.previewTerms.textContent = invoice.terms || '';
  refs.previewPayment.textContent = previewPaymentInstructions(invoice);
}

function renderDraftList() {
  refs.list.replaceChildren();
  if (!invoices.length) {
    const empty = document.createElement('p');
    empty.className = 'invoice-list-empty';
    empty.textContent = 'No hosted drafts yet.';
    refs.list.append(empty);
    return;
  }
  invoices.forEach((invoice) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = currentInvoice?.id === invoice.id ? 'active' : '';
    const left = document.createElement('span');
    left.innerHTML = `<strong></strong><small></small>`;
    left.querySelector('strong').textContent = invoice.invoiceNumber || 'Draft';
    left.querySelector('small').textContent = invoice.clientLabel || 'Untitled client';
    const right = document.createElement('small');
    right.textContent = `${formatCurrency(invoice.totalCents)} · ${formatStatus(invoice.status)}`;
    button.append(left, right);
    button.addEventListener('click', () => loadInvoice(invoice.id));
    refs.list.append(button);
  });
}

async function loadSession() {
  const session = await getJson('/api/session');
  paymentSettings = session.payments || paymentSettings;
  if (!session.auth.configured || !session.user) {
    refs.signinPanel.hidden = false;
    refs.workspace.hidden = true;
    refs.signinHelp.textContent = session.auth.configured ? `Allowed domain: ${session.auth.allowedDomain}` : 'Google OAuth is not configured yet.';
    return;
  }
  refs.signinPanel.hidden = true;
  refs.workspace.hidden = false;
  await Promise.all([loadProfiles(), loadNumbering()]);
  await loadInvoices();
}

async function loadInvoices() {
  setState('Loading hosted drafts...');
  const data = await getJson('/api/invoices');
  invoices = data.invoices || [];
  renderDraftList();
  if (!currentInvoice) fillForm(baseInvoice());
  setState(invoices.length ? `${invoices.length} hosted draft${invoices.length === 1 ? '' : 's'}.` : 'No hosted drafts yet.');
}

async function loadInvoice(id) {
  setNotice('Loading draft...');
  const data = await getJson(`/api/invoices?id=${encodeURIComponent(id)}`);
  fillForm(data.invoice);
  renderDraftList();
  setNotice('Draft loaded.');
}

async function createNewDraft() {
  currentInvoice = null;
  fillForm(baseInvoice());
  setNotice('Blank draft ready. Save when you want to store it in Fin.');
}

async function saveInvoice(status = refs.status.value || 'draft') {
  setNotice(status === 'approved' ? 'Approving invoice...' : 'Saving draft...');
  const payload = currentFormInvoice(status);
  const data = currentInvoice?.id
    ? await getJson(`/api/invoices?id=${encodeURIComponent(currentInvoice.id)}`, { method: 'PUT', body: JSON.stringify(payload) })
    : await getJson('/api/invoices', { method: 'POST', body: JSON.stringify(payload) });
  fillForm(data.invoice);
  await loadInvoices();
  if (status === 'approved') setNotice('Invoice approved for Stripe payment link creation.');
  else setNotice(status === 'ready_for_review' ? 'Draft marked ready for review.' : 'Draft saved.');
}

async function approveInvoice() {
  if (!window.confirm('Approve this invoice for Stripe payment link creation? Review the amount, client, due date, terms, and payment instructions first.')) return;
  await saveInvoice('approved');
}

async function duplicateInvoice() {
  const source = currentFormInvoice('draft');
  delete source.id;
  source.invoiceNumber = '';
  const data = await getJson('/api/invoices', { method: 'POST', body: JSON.stringify(source) });
  fillForm(data.invoice);
  await loadInvoices();
  setNotice('Draft duplicated.');
}

async function deleteInvoice() {
  if (!currentInvoice?.id) return;
  if (!window.confirm('Delete this hosted draft? It will be hidden from the workspace but kept as a soft-deleted record.')) return;
  setNotice('Deleting draft...');
  await getJson(`/api/invoices?id=${encodeURIComponent(currentInvoice.id)}`, { method: 'DELETE' });
  currentInvoice = null;
  fillForm(baseInvoice());
  await loadInvoices();
  setNotice('Draft deleted.');
}

function exportJson() {
  const invoice = currentFormInvoice();
  downloadText(`${safeFileName(invoice.invoiceNumber, 'wawco-invoice-draft')}.json`, JSON.stringify(invoice, null, 2), 'application/json');
  setNotice('JSON exported locally from the browser.');
}

async function importJson(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const invoice = { ...baseInvoice(), ...(parsed.invoice || parsed), id: '', invoiceNumber: 'Assigned on save' };
    fillForm(invoice);
    setNotice('JSON imported into the editor. Save draft to store it in Fin.');
  } catch (error) {
    setNotice(`Import failed: ${error.message}`);
  } finally {
    event.target.value = '';
  }
}

function yamlScalar(value) {
  const text = String(value ?? '');
  if (!text) return '""';
  if (/^[A-Za-z0-9_.@:/ -]+$/.test(text)) return JSON.stringify(text);
  return JSON.stringify(text);
}

async function createPaymentLink(mode) {
  if (!currentInvoice?.id) {
    setNotice('Save the invoice before creating a payment link.');
    return;
  }
  if (formDirty) {
    setNotice('Save or approve the current invoice state before creating a payment link.');
    return;
  }
  if (currentInvoice.status !== 'approved') {
    setNotice('Approve the invoice before creating a payment link.');
    return;
  }
  if (mode === 'live') {
    const confirmed = window.confirm('Create a live Stripe Checkout link for this approved invoice? This creates a live Stripe payment object. Do not send the link until the client send is separately approved.');
    if (!confirmed) return;
  }
  setNotice(`Creating Stripe ${mode} payment link...`);
  const data = await getJson('/api/stripe/checkout', {
    method: 'POST',
    body: JSON.stringify({ invoiceId: currentInvoice.id, mode }),
  });
  currentInvoice = { ...(currentInvoice || {}), payment: data.payment };
  renderPreview();
  setNotice(data.reused ? `Existing Stripe ${mode} payment link loaded.` : `Stripe ${mode} payment link created.`);
}

async function copyPaymentLink() {
  const url = refs.paymentUrl.value.trim();
  if (!url) {
    setNotice('No payment link to copy.');
    return;
  }
  await navigator.clipboard.writeText(url);
  setNotice('Payment link copied.');
}

function exportMercuryPlan() {
  const invoice = currentFormInvoice();
  const lines = [
    '# Mercury invoice plan generated by WAWCO Fin',
    '# Review only. This file does not create, send, or update anything in Mercury.',
    'sendEmailOption: DontSend',
    `invoiceNumber: ${yamlScalar(invoice.invoiceNumber || 'unassigned')}`,
    `status: ${yamlScalar(invoice.status)}`,
    `invoiceDate: ${yamlScalar(invoice.invoiceDate)}`,
    `dueDate: ${yamlScalar(invoice.dueDate)}`,
    `currency: ${yamlScalar(invoice.currency || 'USD')}`,
    `project: ${yamlScalar(invoice.project)}`,
    'payee:',
    `  name: ${yamlScalar(invoice.from.name)}`,
    `  email: ${yamlScalar(invoice.from.email)}`,
    `  address: ${yamlScalar(invoice.from.address)}`,
    `  mercuryDestinationAccountId: ${yamlScalar(invoice.from.mercuryDestinationAccountId)}`,
    'client:',
    `  name: ${yamlScalar(invoice.client.name)}`,
    `  company: ${yamlScalar(invoice.client.company)}`,
    `  email: ${yamlScalar(invoice.client.email)}`,
    `  address: ${yamlScalar(invoice.client.address)}`,
    `  mercuryCustomerId: ${yamlScalar(invoice.client.mercuryCustomerId)}`,
    'items:',
    ...invoice.items.map((item) => [
      `  - description: ${yamlScalar(item.description)}`,
      `    quantity: ${Number(item.quantity || 0)}`,
      `    unitPrice: ${yamlScalar(item.unitPrice || '0.00')}`,
    ].join('\n')),
    'totals:',
    `  subtotalCents: ${invoice.totals.subtotalCents}`,
    `  discountCents: ${invoice.totals.discountCents}`,
    `  taxCents: ${invoice.totals.taxCents}`,
    `  shippingCents: ${invoice.totals.shippingCents}`,
    `  totalCents: ${invoice.totals.totalCents}`,
    `notes: ${yamlScalar(invoice.notes)}`,
    `terms: ${yamlScalar(invoice.terms)}`,
    `paymentInstructions: ${yamlScalar(invoice.paymentInstructions)}`,
  ];
  downloadText(`${safeFileName(invoice.invoiceNumber, 'wawco-mercury-plan')}.yaml`, `${lines.join('\n')}\n`, 'application/x-yaml');
  setNotice('Mercury plan downloaded. No Mercury API call was made.');
}

refs.form.addEventListener('input', (event) => {
  formDirty = true;
  const target = event.target;
  if (target.matches('[data-item-field]')) {
    const index = Number(target.dataset.index);
    const field = target.dataset.itemField;
    items[index][field] = target.value;
  }
  renderPreview();
});

refs.itemsEditor.addEventListener('click', (event) => {
  const remove = event.target.closest('[data-remove-item]');
  if (!remove) return;
  const index = Number(remove.dataset.removeItem);
  formDirty = true;
  items.splice(index, 1);
  if (!items.length) items.push(blankItem());
  renderItemsEditor();
  renderPreview();
});

refs.addItem.addEventListener('click', () => {
  formDirty = true;
  items.push(blankItem());
  renderItemsEditor();
  renderPreview();
});

refs.newInvoice.addEventListener('click', createNewDraft);
refs.saveInvoice.addEventListener('click', () => saveInvoice('draft').catch((error) => setNotice(error.message)));
refs.markReady.addEventListener('click', () => saveInvoice('ready_for_review').catch((error) => setNotice(error.message)));
refs.approveInvoice.addEventListener('click', () => approveInvoice().catch((error) => setNotice(error.message)));
refs.duplicateInvoice.addEventListener('click', () => duplicateInvoice().catch((error) => setNotice(error.message)));
refs.deleteInvoice.addEventListener('click', () => deleteInvoice().catch((error) => setNotice(error.message)));
refs.exportJson.addEventListener('click', exportJson);
refs.importJson.addEventListener('change', importJson);
refs.exportMercuryPlan.addEventListener('click', exportMercuryPlan);
refs.createTestPaymentLink.addEventListener('click', () => createPaymentLink('test').catch((error) => setNotice(error.message)));
refs.createLivePaymentLink.addEventListener('click', () => createPaymentLink('live').catch((error) => setNotice(error.message)));
refs.copyPaymentLink.addEventListener('click', () => copyPaymentLink().catch((error) => setNotice(error.message)));
refs.printInvoice.addEventListener('click', () => window.print());
refs.printInvoiceBottom.addEventListener('click', () => window.print());
refs.saveNumbering.addEventListener('click', () => saveNumbering().catch((error) => setNotice(error.message)));
refs.applyPayeeProfile.addEventListener('click', () => applyProfile('payee'));
refs.savePayeeProfile.addEventListener('click', () => saveProfile('payee').catch((error) => setNotice(error.message)));
refs.deletePayeeProfile.addEventListener('click', () => deleteProfile('payee').catch((error) => setNotice(error.message)));
refs.applyClientProfile.addEventListener('click', () => applyProfile('client'));
refs.saveClientProfile.addEventListener('click', () => saveProfile('client').catch((error) => setNotice(error.message)));
refs.deleteClientProfile.addEventListener('click', () => deleteProfile('client').catch((error) => setNotice(error.message)));
refs.applyUserProfile.addEventListener('click', () => applyProfile('user'));
refs.saveUserProfile.addEventListener('click', () => saveProfile('user').catch((error) => setNotice(error.message)));
refs.deleteUserProfile.addEventListener('click', () => deleteProfile('user').catch((error) => setNotice(error.message)));

loadSession().catch((error) => {
  refs.signinPanel.hidden = false;
  refs.workspace.hidden = true;
  refs.signinHelp.textContent = error.message;
});
