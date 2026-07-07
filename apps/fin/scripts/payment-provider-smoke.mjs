import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');

const {
  BILL_VENDOR_AP_PROVIDER,
  DEFAULT_PAYMENT_PROVIDER,
  assertInvoiceAllowsStripePaymentPage,
  invoicePaymentProvider,
  invoiceUsesBillVendorAp,
  normalizePaymentProvider,
  paymentProviderHelp,
  paymentProviderLabel,
} = require('../api/_payment_provider.js');
const { normalizeInvoice } = require('../api/_invoice.js');

assert.equal(normalizePaymentProvider(''), DEFAULT_PAYMENT_PROVIDER);
assert.equal(normalizePaymentProvider('Stripe Checkout'), DEFAULT_PAYMENT_PROVIDER);
assert.equal(normalizePaymentProvider('BILL.com vendor/AP'), BILL_VENDOR_AP_PROVIDER);
assert.equal(normalizePaymentProvider('external BILL AP'), BILL_VENDOR_AP_PROVIDER);
assert.equal(paymentProviderLabel(BILL_VENDOR_AP_PROVIDER), 'BILL vendor/AP, external');
assert.match(paymentProviderHelp(BILL_VENDOR_AP_PROVIDER), /does not create a Stripe page or call BILL/);

const defaultInvoice = normalizeInvoice({
  client: { company: 'Default Client' },
  items: [{ description: 'Local test', quantity: 1, unitPrice: '100.00' }],
});
assert.equal(defaultInvoice.paymentProvider, DEFAULT_PAYMENT_PROVIDER);
assert.equal(defaultInvoice.client.paymentProviderPreference, DEFAULT_PAYMENT_PROVIDER);
assert.equal(invoicePaymentProvider(defaultInvoice), DEFAULT_PAYMENT_PROVIDER);
assert.equal(invoiceUsesBillVendorAp(defaultInvoice), false);
assert.doesNotThrow(() => assertInvoiceAllowsStripePaymentPage(defaultInvoice));

const billInvoice = normalizeInvoice({
  client: { company: 'Unitus', paymentProviderPreference: 'bill_vendor_ap' },
  items: [{ description: 'Local test', quantity: 1, unitPrice: '100.00' }],
});
assert.equal(billInvoice.paymentProvider, BILL_VENDOR_AP_PROVIDER);
assert.equal(billInvoice.client.paymentProviderPreference, BILL_VENDOR_AP_PROVIDER);
assert.equal(invoicePaymentProvider(billInvoice), BILL_VENDOR_AP_PROVIDER);
assert.equal(invoiceUsesBillVendorAp(billInvoice), true);
assert.throws(
  () => assertInvoiceAllowsStripePaymentPage(billInvoice),
  (error) => error.status === 409 && /BILL vendor\/AP/.test(error.message),
);

const rootBillInvoice = normalizeInvoice({
  paymentProvider: 'vendor ap',
  client: { company: 'Unitus' },
  items: [{ description: 'Local test', quantity: 1, unitPrice: '100.00' }],
});
assert.equal(rootBillInvoice.client.paymentProviderPreference, BILL_VENDOR_AP_PROVIDER);

const dbSource = await readFile(path.join(appRoot, 'api/_db.js'), 'utf8');
const legacyStripeFunction = dbSource.slice(dbSource.indexOf('async function createInvoicePaymentRequest'), dbSource.indexOf('async function activateInvoicePaymentRequest'));
assert.ok(legacyStripeFunction.includes('assertInvoiceAllowsStripePaymentPage(invoice);'), 'legacy Stripe creation path must reject bill_vendor_ap invoices');
assert.ok(
  legacyStripeFunction.indexOf('assertInvoiceAllowsStripePaymentPage(invoice);') < legacyStripeFunction.indexOf('const amountCents'),
  'legacy Stripe guard must run before amount/payment request setup',
);
const customerPageFunction = dbSource.slice(dbSource.indexOf('async function createInvoiceCustomerPaymentPage'), dbSource.indexOf('function safePublicInvoice'));
assert.ok(customerPageFunction.includes('assertInvoiceAllowsStripePaymentPage(invoice);'), 'customer payment page path must reject bill_vendor_ap invoices');
assert.ok(
  customerPageFunction.indexOf('assertInvoiceAllowsStripePaymentPage(invoice);') < customerPageFunction.indexOf("const methodFamily = 'customer_choice'"),
  'customer page guard must run before payment request creation setup',
);
assert.match(dbSource, /paymentProviderPreference: normalizePaymentProvider/);

const htmlSource = await readFile(path.join(appRoot, 'invoices.html'), 'utf8');
assert.match(htmlSource, /id="client-payment-provider"/);
assert.match(htmlSource, /BILL vendor\/AP, external/);
assert.match(htmlSource, /does not read credentials, call BILL, or create a Stripe payment page/);

const clientSource = await readFile(path.join(appRoot, 'invoices.js'), 'utf8');
assert.match(clientSource, /BILL_VENDOR_AP_PROVIDER = 'bill_vendor_ap'/);
assert.match(clientSource, /This invoice uses external BILL vendor\/AP routing/);
assert.match(clientSource, /No Stripe page will be created/);

console.log('payment-provider-smoke-ok');
