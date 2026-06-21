const $ = (selector) => document.querySelector(selector);

const refs = {
  entityEyebrow: $('#pay-entity-eyebrow'),
  title: $('#pay-title'),
  message: $('#pay-message'),
  invoice: $('#pay-invoice'),
  invoiceNumber: $('#pay-invoice-number'),
  amount: $('#pay-amount'),
  client: $('#pay-client'),
  dueWrap: $('#pay-due-wrap'),
  due: $('#pay-due'),
  methods: $('#pay-methods'),
  summary: $('#pay-summary'),
  base: $('#pay-base'),
  processingRow: $('#pay-processing-row'),
  processingLabel: $('#pay-processing-label'),
  processing: $('#pay-processing'),
  total: $('#pay-total'),
  disclosure: $('#pay-disclosure'),
  entityHelp: $('#pay-entity-help'),
  continueButton: $('#pay-continue'),
};

let paymentPage = null;
let selectedMethod = 'bank_account';

function tokenFromLocation() {
  const params = new URLSearchParams(window.location.search);
  return String(params.get('t') || params.get('token') || '').trim();
}

function checkoutState() {
  return String(new URLSearchParams(window.location.search).get('checkout') || '').trim();
}

function formatCurrency(cents, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format((Number(cents) || 0) / 100);
}

function formatDisplayDate(value) {
  if (!value) return '';
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(value);
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(date);
}

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

function methodByName(name) {
  return (paymentPage?.methods || []).find((method) => method.method === name) || paymentPage?.methods?.[0] || null;
}

function renderCheckoutMessage() {
  const state = checkoutState();
  if (state === 'success') {
    refs.message.textContent = 'Stripe received the checkout step. Bank account payments can stay processing while the transfer settles. The invoice updates after Stripe confirms the status.';
  } else if (state === 'cancel') {
    refs.message.textContent = 'Checkout was canceled. You can choose a payment method and continue again.';
  } else {
    refs.message.textContent = 'Choose a payment method. Each option opens its own Stripe Checkout path.';
  }
}

function renderMethods() {
  refs.methods.replaceChildren();
  (paymentPage.methods || []).forEach((method) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `pay-method${method.method === selectedMethod ? ' is-selected' : ''}`;
    button.dataset.method = method.method;
    const title = document.createElement('strong');
    title.textContent = method.label;
    const amount = document.createElement('span');
    amount.textContent = formatCurrency(method.collectionAmountCents, paymentPage.currency);
    const copy = document.createElement('small');
    copy.textContent = method.shortCopy;
    button.append(title, amount, copy);
    button.addEventListener('click', () => {
      selectedMethod = method.method;
      renderMethods();
      renderSummary();
    });
    refs.methods.append(button);
  });
}

function renderSummary() {
  const method = methodByName(selectedMethod);
  if (!method) return;
  refs.base.textContent = formatCurrency(method.baseAmountCents, paymentPage.currency);
  refs.processingRow.hidden = method.clientProcessingCostCents <= 0;
  refs.processingLabel.textContent = method.method === 'card' ? 'Card processing cost' : 'Processing cost';
  refs.processing.textContent = formatCurrency(method.clientProcessingCostCents, paymentPage.currency);
  refs.total.textContent = formatCurrency(method.collectionAmountCents, paymentPage.currency);
  refs.disclosure.textContent = method.disclosureText || '';
  refs.continueButton.textContent = method.method === 'bank_account' ? 'Continue to bank account checkout' : 'Continue to card checkout';
  refs.continueButton.disabled = paymentPage.invoice.status === 'paid';
}

function renderPage() {
  const invoice = paymentPage.invoice || {};
  const entity = invoice.entity || {};
  const amountCents = Number(paymentPage.amountCents || invoice.totals?.totalCents || 0);
  refs.entityEyebrow.textContent = entity.branding?.payPageEyebrow || entity.name || invoice.from?.name || 'Fin';
  refs.entityHelp.textContent = `Stripe collects the payment details. ${entity.branding?.payPageHelp || `${entity.name || invoice.from?.name || 'The issuing entity'} updates the invoice after Stripe confirms the payment status.`}`;
  refs.title.textContent = invoice.status === 'paid' ? 'Invoice paid' : 'Pay this invoice';
  renderCheckoutMessage();
  refs.invoice.hidden = false;
  refs.methods.hidden = invoice.status === 'paid';
  refs.summary.hidden = invoice.status === 'paid';
  refs.invoiceNumber.textContent = invoice.invoiceNumber || 'Invoice';
  refs.amount.textContent = formatCurrency(amountCents, paymentPage.currency);
  refs.client.textContent = invoice.client?.company || invoice.client?.name || invoice.client?.label || 'Client';
  const dueDate = formatDisplayDate(invoice.dueDate);
  refs.dueWrap.hidden = !dueDate;
  refs.due.textContent = dueDate;
  renderMethods();
  renderSummary();
}

async function loadPaymentPage() {
  const token = tokenFromLocation();
  if (!token) throw new Error('Payment page token is missing.');
  const data = await getJson(`/api/pay?t=${encodeURIComponent(token)}`);
  paymentPage = data.paymentPage;
  selectedMethod = paymentPage.methods?.some((method) => method.method === 'bank_account') ? 'bank_account' : paymentPage.methods?.[0]?.method || 'card';
  renderPage();
}

async function continueToStripe() {
  const token = tokenFromLocation();
  const method = methodByName(selectedMethod);
  if (!token || !method) return;
  refs.continueButton.disabled = true;
  refs.message.textContent = 'Opening Stripe Checkout...';
  try {
    const data = await getJson('/api/pay/checkout', {
      method: 'POST',
      body: JSON.stringify({ token, method: method.method }),
    });
    if (!data.url) throw new Error('Stripe Checkout URL was not returned.');
    window.location.assign(data.url);
  } catch (error) {
    refs.message.textContent = error.message;
    refs.continueButton.disabled = false;
  }
}

refs.continueButton.addEventListener('click', continueToStripe);

loadPaymentPage().catch((error) => {
  refs.title.textContent = 'Payment page unavailable';
  refs.message.textContent = error.message;
  refs.invoice.hidden = true;
  refs.methods.hidden = true;
  refs.summary.hidden = true;
  refs.continueButton.disabled = true;
});
