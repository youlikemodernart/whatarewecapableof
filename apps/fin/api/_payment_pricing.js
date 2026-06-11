const PAYMENT_METHODS = new Set(['bank_account', 'card']);

const STRIPE_PRICING_VERSION = 'stripe-public-us-2026-06-09';
const ACH_PERCENT_BPS = 80;
const ACH_FEE_CAP_CENTS = 500;
const CARD_PERCENT_BPS = 290;
const CARD_FIXED_FEE_CENTS = 30;

function cleanPaymentMethod(value) {
  const method = String(value || '').trim().toLowerCase().replace(/[-\s]+/g, '_');
  if (!PAYMENT_METHODS.has(method)) {
    const error = new Error('Payment method must be bank_account or card.');
    error.status = 400;
    throw error;
  }
  return method;
}

function ceilDiv(numerator, denominator) {
  return Math.floor((Number(numerator) + Number(denominator) - 1) / Number(denominator));
}

function cardGrossUpCents(baseAmountCents) {
  const base = Math.max(0, Math.round(Number(baseAmountCents) || 0));
  if (!base) return 0;
  return ceilDiv((base + CARD_FIXED_FEE_CENTS) * 10_000, 10_000 - CARD_PERCENT_BPS);
}

function achFeeCents(baseAmountCents) {
  const base = Math.max(0, Math.round(Number(baseAmountCents) || 0));
  if (!base) return 0;
  return Math.min(ACH_FEE_CAP_CENTS, Math.round(base * ACH_PERCENT_BPS / 10_000));
}

function paymentMethodQuote(baseAmountCents, methodInput) {
  const method = cleanPaymentMethod(methodInput);
  const base = Math.max(0, Math.round(Number(baseAmountCents) || 0));
  if (method === 'bank_account') {
    const expectedFee = achFeeCents(base);
    return {
      method: 'bank_account',
      paymentMethodFamily: 'bank_account',
      paymentMethodType: 'us_bank_account',
      feePolicy: 'bank_wawco_absorbs_ach',
      baseAmountCents: base,
      clientProcessingCostCents: 0,
      collectionAmountCents: base,
      expectedStripeFeeCents: expectedFee,
      expectedNetCents: Math.max(0, base - expectedFee),
      formula: {
        version: STRIPE_PRICING_VERSION,
        source: 'Stripe public pricing checked 2026-06-09',
        method: 'ACH Direct Debit',
        percentBps: ACH_PERCENT_BPS,
        capCents: ACH_FEE_CAP_CENTS,
        settlement: 'standard',
        clientPaysProcessingCost: false,
      },
      disclosureText: 'Bank account payment through Stripe has no added processing-cost line for the client. What are we capable of? absorbs the standard ACH fee.',
      customerLabel: 'Bank account',
      shortCopy: 'No added processing-cost line. Bank payments can take a few business days to settle.',
    };
  }

  const collection = cardGrossUpCents(base);
  const clientCost = Math.max(0, collection - base);
  return {
    method: 'card',
    paymentMethodFamily: 'card',
    paymentMethodType: 'card',
    feePolicy: 'card_customer_pays_processing_cost',
    baseAmountCents: base,
    clientProcessingCostCents: clientCost,
    collectionAmountCents: collection,
    expectedStripeFeeCents: clientCost,
    expectedNetCents: collection - clientCost,
    formula: {
      version: STRIPE_PRICING_VERSION,
      source: 'Stripe public pricing checked 2026-06-09',
      method: 'Domestic card',
      percentBps: CARD_PERCENT_BPS,
      fixedFeeCents: CARD_FIXED_FEE_CENTS,
      grossUp: 'ceil((base_cents + fixed_fee_cents) / (1 - percent))',
      clientPaysProcessingCost: true,
    },
    disclosureText: 'Card payment includes a processing-cost line calculated from Stripe public domestic card pricing checked on June 9, 2026.',
    customerLabel: 'Card',
    shortCopy: 'Includes the processing-cost line shown before Stripe Checkout.',
  };
}

function customerPaymentMethods(baseAmountCents) {
  return [paymentMethodQuote(baseAmountCents, 'bank_account'), paymentMethodQuote(baseAmountCents, 'card')];
}

module.exports = {
  ACH_FEE_CAP_CENTS,
  ACH_PERCENT_BPS,
  CARD_FIXED_FEE_CENTS,
  CARD_PERCENT_BPS,
  STRIPE_PRICING_VERSION,
  cardGrossUpCents,
  achFeeCents,
  cleanPaymentMethod,
  customerPaymentMethods,
  paymentMethodQuote,
};
