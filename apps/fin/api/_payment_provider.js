const DEFAULT_PAYMENT_PROVIDER = 'stripe_checkout';
const BILL_VENDOR_AP_PROVIDER = 'bill_vendor_ap';

const PAYMENT_PROVIDERS = new Set([DEFAULT_PAYMENT_PROVIDER, BILL_VENDOR_AP_PROVIDER]);

const PROVIDER_ALIASES = new Map([
  ['stripe', DEFAULT_PAYMENT_PROVIDER],
  ['stripe_checkout', DEFAULT_PAYMENT_PROVIDER],
  ['stripe_payment_page', DEFAULT_PAYMENT_PROVIDER],
  ['customer_payment_page', DEFAULT_PAYMENT_PROVIDER],
  ['checkout', DEFAULT_PAYMENT_PROVIDER],
  ['bill', BILL_VENDOR_AP_PROVIDER],
  ['billcom', BILL_VENDOR_AP_PROVIDER],
  ['bill_com', BILL_VENDOR_AP_PROVIDER],
  ['billcom_vendor_ap', BILL_VENDOR_AP_PROVIDER],
  ['bill_com_vendor_ap', BILL_VENDOR_AP_PROVIDER],
  ['bill_vendor', BILL_VENDOR_AP_PROVIDER],
  ['bill_vendor_ap', BILL_VENDOR_AP_PROVIDER],
  ['vendor_ap', BILL_VENDOR_AP_PROVIDER],
  ['external_bill_ap', BILL_VENDOR_AP_PROVIDER],
]);

const PAYMENT_PROVIDER_LABELS = {
  [DEFAULT_PAYMENT_PROVIDER]: 'Stripe customer payment page',
  [BILL_VENDOR_AP_PROVIDER]: 'BILL vendor/AP, external',
};

const PAYMENT_PROVIDER_HELP = {
  [DEFAULT_PAYMENT_PROVIDER]: 'Fin can create a customer payment page from an approved invoice snapshot. The customer chooses bank account or card before Stripe Checkout.',
  [BILL_VENDOR_AP_PROVIDER]: 'Fin remains the invoice source of truth. Payment is handled through the client\'s BILL.com vendor/AP workflow; Fin does not create a Stripe page or call BILL.',
};

function cleanProviderToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\.com/g, 'com')
    .replace(/[\s/-]+/g, '_')
    .replace(/[^a-z0-9_]+/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizePaymentProvider(value, fallback = DEFAULT_PAYMENT_PROVIDER) {
  const fallbackProvider = PAYMENT_PROVIDERS.has(fallback) ? fallback : DEFAULT_PAYMENT_PROVIDER;
  const token = cleanProviderToken(value);
  if (!token) return fallbackProvider;
  if (PAYMENT_PROVIDERS.has(token)) return token;
  return PROVIDER_ALIASES.get(token) || fallbackProvider;
}

function invoicePaymentProvider(invoice = {}, fallback = DEFAULT_PAYMENT_PROVIDER) {
  const source = invoice && typeof invoice === 'object' ? invoice : {};
  const client = source.client && typeof source.client === 'object' ? source.client : {};
  return normalizePaymentProvider(
    source.paymentProvider
      || source.payment_provider
      || source.paymentProviderPreference
      || source.payment_provider_preference
      || client.paymentProviderPreference
      || client.payment_provider_preference
      || client.paymentProvider
      || client.payment_provider,
    fallback,
  );
}

function invoiceUsesBillVendorAp(invoice = {}) {
  return invoicePaymentProvider(invoice) === BILL_VENDOR_AP_PROVIDER;
}

function paymentProviderLabel(providerInput) {
  const provider = normalizePaymentProvider(providerInput);
  return PAYMENT_PROVIDER_LABELS[provider] || PAYMENT_PROVIDER_LABELS[DEFAULT_PAYMENT_PROVIDER];
}

function paymentProviderHelp(providerInput) {
  const provider = normalizePaymentProvider(providerInput);
  return PAYMENT_PROVIDER_HELP[provider] || PAYMENT_PROVIDER_HELP[DEFAULT_PAYMENT_PROVIDER];
}

function billVendorApStripeBlockMessage() {
  return 'This invoice is marked for BILL vendor/AP. Fin keeps the invoice of record, but this provider does not create a Stripe customer payment page.';
}

function assertInvoiceAllowsStripePaymentPage(invoice = {}) {
  if (!invoiceUsesBillVendorAp(invoice)) return;
  const error = new Error(billVendorApStripeBlockMessage());
  error.status = 409;
  throw error;
}

module.exports = {
  BILL_VENDOR_AP_PROVIDER,
  DEFAULT_PAYMENT_PROVIDER,
  PAYMENT_PROVIDER_HELP,
  PAYMENT_PROVIDER_LABELS,
  PAYMENT_PROVIDERS,
  assertInvoiceAllowsStripePaymentPage,
  billVendorApStripeBlockMessage,
  invoicePaymentProvider,
  invoiceUsesBillVendorAp,
  normalizePaymentProvider,
  paymentProviderHelp,
  paymentProviderLabel,
};
