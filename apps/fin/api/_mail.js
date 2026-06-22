const crypto = require('crypto');

const GMAIL_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1';
const DEFAULT_GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.compose';
const DEFAULT_PAYMENT_SENDER = 'noah@whatarewecapableof.com';

let cachedAccessToken = null;

async function fetchWithTimeout(url, options = {}, timeoutMs = 10_000, failureCode = 'request-timeout') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(failureCode);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function env(name, fallback = '') {
  return String(process.env[name] ?? fallback).trim();
}

function cleanSingleLine(value, max = 240) {
  return String(value || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanText(value, max = 4000) {
  return String(value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().slice(0, max);
}

function cleanEmail(value) {
  const email = cleanSingleLine(value, 320).toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return '';
  return email;
}

function emailEnabled() {
  return env('FIN_PAYMENT_EMAILS_ENABLED', '0') === '1' || env('FIN_PAYMENT_EMAILS_FAKE', '0') === '1';
}

function fakeEmailEnabled() {
  return env('FIN_PAYMENT_EMAILS_FAKE', '0') === '1';
}

function senderEmail() {
  return cleanEmail(env('FIN_PAYMENT_EMAIL_SENDER', DEFAULT_PAYMENT_SENDER));
}

function serviceAccountRaw() {
  return env('GOOGLE_SERVICE_ACCOUNT_KEY') || env('GOOGLE_APPLICATION_CREDENTIALS_JSON');
}

function paymentEmailRuntimeStatus() {
  const sender = senderEmail();
  const hasServiceAccount = Boolean(serviceAccountRaw());
  return {
    enabled: emailEnabled(),
    fake: fakeEmailEnabled(),
    configured: fakeEmailEnabled() || Boolean(sender && hasServiceAccount),
    sender,
    serviceAccountConfigured: hasServiceAccount,
    scope: env('FIN_PAYMENT_EMAIL_SCOPE', DEFAULT_GMAIL_SCOPE),
  };
}

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function parseServiceAccount() {
  const raw = serviceAccountRaw();
  if (!raw) throw new Error('gmail-service-account-missing');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('gmail-service-account-invalid-json');
  }
  const clientEmail = cleanSingleLine(parsed.client_email, 320);
  const privateKey = String(parsed.private_key || '').replace(/\\n/g, '\n');
  if (!clientEmail || !privateKey) throw new Error('gmail-service-account-incomplete');
  return { clientEmail, privateKey };
}

async function gmailAccessToken(subject) {
  const safeSubject = cleanEmail(subject);
  if (!safeSubject) throw new Error('gmail-subject-missing');
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && cachedAccessToken.subject === safeSubject && cachedAccessToken.expiresAtSeconds > nowSeconds + 60) {
    return cachedAccessToken.token;
  }

  const account = parseServiceAccount();
  const scope = env('FIN_PAYMENT_EMAIL_SCOPE', DEFAULT_GMAIL_SCOPE);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss: account.clientEmail,
    sub: safeSubject,
    scope,
    aud: GMAIL_TOKEN_URL,
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  }));
  const signingInput = `${header}.${payload}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(account.privateKey).toString('base64url');
  const assertion = `${signingInput}.${signature}`;

  const body = new URLSearchParams();
  body.set('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer');
  body.set('assertion', assertion);
  const response = await fetchWithTimeout(GMAIL_TOKEN_URL, { method: 'POST', body }, 10_000, 'gmail-token-request-timeout');
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error('gmail-token-request-failed');
  cachedAccessToken = {
    subject: safeSubject,
    token: data.access_token,
    expiresAtSeconds: nowSeconds + Math.max(60, Math.min(3600, Number(data.expires_in || 3600))),
  };
  return cachedAccessToken.token;
}

function formatCurrency(cents, currency = 'USD') {
  const amount = Number(cents || 0) / 100;
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: cleanSingleLine(currency, 3).toUpperCase() || 'USD' }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function formatAddress(name, email) {
  const safeEmail = cleanEmail(email);
  const safeName = cleanSingleLine(name, 120).replace(/["<>]/g, '');
  if (!safeEmail) return '';
  return safeName ? `"${safeName}" <${safeEmail}>` : safeEmail;
}

function clientGreeting(invoice = {}) {
  const name = cleanSingleLine(invoice.client?.name || invoice.client?.company || invoice.client?.label || '', 120);
  return name ? `Hi ${name},` : 'Hi,';
}

function notificationCopy({ notificationType, invoice = {}, payment = {}, entity = {} }) {
  const invoiceNumber = cleanSingleLine(payment.invoiceNumber || invoice.invoiceNumber || 'your invoice', 120);
  const entityName = cleanSingleLine(entity.name || entity.legalName || entity.label || invoice.from?.company || invoice.from?.name || 'What are we capable of?', 160);
  const currency = cleanSingleLine(payment.currency || invoice.currency || 'USD', 3).toUpperCase() || 'USD';
  const invoiceAmount = Number(payment.baseAmountCents || invoice.totals?.totalCents || payment.amountCents || 0);
  const paidAmount = Number(payment.collectionAmountCents || payment.amountCents || invoiceAmount || 0);
  const lines = [];
  let subject = '';

  if (notificationType === 'payment_started') {
    subject = `Payment started for invoice ${invoiceNumber}`;
    lines.push(clientGreeting(invoice));
    lines.push('');
    lines.push(`We received your bank payment authorization for invoice ${invoiceNumber}.`);
    lines.push('Bank payments can take a few business days to settle. You do not need to start another checkout.');
    lines.push('');
    lines.push(`Invoice amount: ${formatCurrency(invoiceAmount, currency)}`);
    lines.push('Status: Processing');
  } else if (notificationType === 'payment_received') {
    subject = `Payment received for invoice ${invoiceNumber}`;
    lines.push(clientGreeting(invoice));
    lines.push('');
    lines.push(`We received your payment for invoice ${invoiceNumber}.`);
    lines.push('');
    lines.push(`Amount paid: ${formatCurrency(paidAmount, currency)}`);
    lines.push('Status: Paid');
  } else {
    subject = `Payment issue for invoice ${invoiceNumber}`;
    lines.push(clientGreeting(invoice));
    lines.push('');
    lines.push(`The payment for invoice ${invoiceNumber} did not complete or needs attention.`);
    lines.push('You have not been marked paid in Fin for this payment attempt. Reply to this email and we will help with a fresh payment path.');
    lines.push('');
    lines.push(`Invoice amount: ${formatCurrency(invoiceAmount, currency)}`);
    lines.push('Status: Needs attention');
  }

  lines.push('');
  lines.push('Thank you,');
  lines.push(entityName);

  const text = cleanText(lines.join('\n'), 4000);
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.45;color:#111;max-width:560px">${text.split('\n').map((line) => line ? `<p>${escapeHtml(line)}</p>` : '<p>&nbsp;</p>').join('')}</div>`;
  return { subject, text, html };
}

function buildMimeMessage({ to, fromEmail, fromName, subject, text, html }) {
  const boundary = `fin_${crypto.randomBytes(12).toString('hex')}`;
  const headers = [
    `To: ${formatAddress('', to)}`,
    `From: ${formatAddress(fromName, fromEmail)}`,
    `Subject: ${cleanSingleLine(subject, 180)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  const parts = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    cleanText(text, 4000),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    String(html || ''),
    `--${boundary}--`,
    '',
  ];
  return [...headers, '', ...parts].join('\r\n');
}

async function sendPaymentNotificationEmail({ to, notificationType, invoice, payment, entity }) {
  const runtime = paymentEmailRuntimeStatus();
  if (!runtime.enabled) throw new Error('payment-email-disabled');
  if (!runtime.configured) throw new Error('payment-email-not-configured');
  const recipient = cleanEmail(to);
  if (!recipient) throw new Error('payment-email-recipient-invalid');
  const fromEmail = runtime.sender;
  const copy = notificationCopy({ notificationType, invoice, payment, entity });
  const fromName = cleanSingleLine(entity?.name || entity?.legalName || entity?.label || env('FIN_PAYMENT_EMAIL_FROM_NAME', 'WAWCO Fin'), 120);

  if (runtime.fake) {
    return {
      id: `fake_${crypto.createHash('sha256').update(`${recipient}:${notificationType}:${payment?.id || ''}`).digest('hex').slice(0, 16)}`,
      threadId: '',
      fake: true,
      subject: copy.subject,
    };
  }

  const raw = buildMimeMessage({ to: recipient, fromEmail, fromName, subject: copy.subject, text: copy.text, html: copy.html });
  const token = await gmailAccessToken(fromEmail);
  const response = await fetchWithTimeout(`${GMAIL_API_BASE}/users/${encodeURIComponent(fromEmail)}/messages/send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: base64url(raw) }),
  }, 10_000, 'gmail-message-send-timeout');
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.id) throw new Error('gmail-message-send-failed');
  return { id: cleanSingleLine(data.id, 160), threadId: cleanSingleLine(data.threadId, 160), fake: false, subject: copy.subject };
}

module.exports = {
  cleanEmail,
  paymentEmailRuntimeStatus,
  notificationCopy,
  sendPaymentNotificationEmail,
};
