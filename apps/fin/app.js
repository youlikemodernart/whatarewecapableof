const $ = (selector) => document.querySelector(selector);

const refs = {
  authStatus: $('#auth-status'),
  storageStatus: $('#storage-status'),
  paymentStatus: $('#payment-status'),
  signinPanel: $('#signin-panel'),
  signinCopy: $('#signin-copy'),
  signinHelp: $('#signin-help'),
  workspacePanel: $('#workspace-panel'),
  welcomeTitle: $('#welcome-title'),
  invoicesPanel: $('#invoices-panel'),
  invoiceState: $('#invoice-state'),
  invoiceList: $('#invoice-list'),
  newInvoice: $('#new-invoice'),
  refreshInvoices: $('#refresh-invoices'),
};

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
  if (!response.ok) {
    const message = data.error || `Request failed: ${response.status}`;
    throw new Error(message);
  }
  return data;
}

function setStatus(element, value, state = 'pending') {
  element.textContent = value;
  element.closest('.status-card')?.classList.remove('ready', 'pending');
  element.closest('.status-card')?.classList.add(state);
}

function formatCurrency(cents) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format((Number(cents) || 0) / 100);
}

function renderInvoiceList(invoices = []) {
  refs.invoiceList.replaceChildren();
  if (!invoices.length) {
    refs.invoiceList.hidden = true;
    return;
  }

  const list = document.createElement('div');
  list.className = 'invoice-table';
  invoices.forEach((invoice) => {
    const row = document.createElement('article');
    row.className = 'invoice-row';

    const main = document.createElement('div');
    const number = document.createElement('strong');
    number.textContent = invoice.invoiceNumber || 'Draft invoice';
    const label = document.createElement('p');
    label.textContent = invoice.clientLabel || 'Untitled client';
    main.append(number, label);

    const meta = document.createElement('div');
    meta.className = 'invoice-meta';
    const status = document.createElement('span');
    status.textContent = invoice.status || 'draft';
    const total = document.createElement('span');
    total.textContent = formatCurrency(invoice.totalCents);
    meta.append(status, total);

    row.append(main, meta);
    list.append(row);
  });

  refs.invoiceList.append(list);
  refs.invoiceList.hidden = false;
}

function paymentStatusText(payments = {}) {
  if (!payments.configured) return 'Disabled';
  if (payments.mode === 'live' && payments.liveLinksEnabled) return 'Stripe live ready';
  if (payments.mode === 'test' && payments.testLinksEnabled) return 'Stripe test ready';
  return `Stripe ${payments.mode || 'configured'}`;
}

function renderSession(data) {
  setStatus(refs.authStatus, data.auth.configured ? (data.user ? 'Signed in' : 'Configured') : 'Needs OAuth', data.auth.configured ? 'ready' : 'pending');
  setStatus(refs.storageStatus, data.storage.configured ? data.storage.mode : 'Needs DB', data.storage.configured ? 'ready' : 'pending');
  setStatus(refs.paymentStatus, paymentStatusText(data.payments), data.payments.configured ? 'ready' : 'pending');

  if (!data.auth.configured) {
    refs.signinPanel.hidden = false;
    refs.workspacePanel.hidden = true;
    refs.invoicesPanel.hidden = true;
    refs.signinCopy.textContent = 'The hosted shell is live. Google OAuth is not configured yet.';
    refs.signinHelp.textContent = 'Next gate: set FIN_GOOGLE_CLIENT_ID, FIN_GOOGLE_CLIENT_SECRET, FIN_SESSION_SECRET, and allowlisted team emails in the Vercel project.';
    refs.signinPanel.querySelector('.button').setAttribute('aria-disabled', 'true');
    refs.signinPanel.querySelector('.button').addEventListener('click', (event) => event.preventDefault());
    return;
  }

  if (!data.user) {
    refs.signinPanel.hidden = false;
    refs.workspacePanel.hidden = true;
    refs.invoicesPanel.hidden = true;
    refs.signinHelp.textContent = `Allowed domain: ${data.auth.allowedDomain}`;
    return;
  }

  refs.signinPanel.hidden = true;
  refs.workspacePanel.hidden = false;
  refs.invoicesPanel.hidden = false;
  refs.welcomeTitle.textContent = `Signed in as ${data.user.email}`;
  loadInvoices();
}

async function loadSession() {
  try {
    const data = await getJson('/api/invoices?resource=session');
    renderSession(data);
  } catch (error) {
    setStatus(refs.authStatus, 'Error', 'pending');
    refs.signinPanel.hidden = false;
    refs.signinHelp.textContent = error.message;
  }
}

async function loadInvoices() {
  refs.invoiceState.textContent = 'Checking invoice API...';
  refs.invoiceList.hidden = true;
  try {
    const data = await getJson('/api/invoices');
    if (!data.storage.configured) {
      refs.invoiceState.textContent = 'Invoice API is reachable. Hosted database is not configured yet, so shared drafts are disabled.';
      return;
    }
    renderInvoiceList(data.invoices || []);
    refs.invoiceState.textContent = data.invoices.length ? `${data.invoices.length} hosted draft${data.invoices.length === 1 ? '' : 's'} found.` : 'No hosted invoice drafts yet.';
  } catch (error) {
    refs.invoiceState.textContent = error.message;
  }
}

async function createBlankInvoice() {
  refs.newInvoice.disabled = true;
  refs.invoiceState.textContent = 'Creating blank hosted draft...';
  try {
    await getJson('/api/invoices', {
      method: 'POST',
      body: JSON.stringify({
        client: { company: '' },
        items: [{ description: 'Consulting work', quantity: 1, unitPrice: '0.00' }],
      }),
    });
    await loadInvoices();
  } catch (error) {
    refs.invoiceState.textContent = error.message;
  } finally {
    refs.newInvoice.disabled = false;
  }
}

refs.newInvoice?.addEventListener('click', createBlankInvoice);
refs.refreshInvoices?.addEventListener('click', loadInvoices);
loadSession();
