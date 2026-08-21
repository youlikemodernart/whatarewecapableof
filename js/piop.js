(() => {
  const amountInput = document.querySelector('#support-amount');
  const form = document.querySelector('.support-form');
  const requestIdInput = document.querySelector('#support-request-id');
  const status = document.querySelector('#support-status');

  function announce(message) {
    if (!status) return;
    status.hidden = false;
    status.textContent = '';
    window.requestAnimationFrame(() => {
      status.textContent = message;
    });
  }

  function refreshRequestId() {
    if (!requestIdInput || !window.crypto) return;
    if (window.crypto.randomUUID) {
      requestIdInput.value = window.crypto.randomUUID();
      return;
    }
    const bytes = window.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    requestIdInput.value = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  refreshRequestId();
  const initialSubmit = form?.querySelector('[type="submit"]');
  if (initialSubmit && requestIdInput?.value) initialSubmit.disabled = false;

  for (const button of document.querySelectorAll('[data-amount]')) {
    button.addEventListener('click', () => {
      if (!amountInput) return;
      amountInput.value = button.dataset.amount || '';
      amountInput.focus();
    });
  }

  if (form) {
    form.addEventListener('submit', (event) => {
      if (!requestIdInput?.value) refreshRequestId();
      if (!requestIdInput?.value) {
        event.preventDefault();
        announce('Payment is unavailable in this browser. Please email us.');
        return;
      }
      const submit = form.querySelector('[type="submit"]');
      if (submit) {
        submit.disabled = true;
        submit.textContent = 'Opening Stripe...';
      }
    });
  }

  window.addEventListener('pageshow', (event) => {
    if (!event.persisted || !form) return;
    refreshRequestId();
    const submit = form.querySelector('[type="submit"]');
    if (submit) {
      submit.disabled = false;
      submit.textContent = 'Continue to secure payment';
    }
  });

  if (status) {
    const outcome = new URLSearchParams(window.location.search).get('support');
    const messages = {
      'thank-you': 'Stripe returned you to PiOp. Check your email for payment confirmation.',
      cancelled: 'Payment was canceled. Nothing was charged.',
      unavailable: 'Payment is temporarily unavailable. Please try again later or email us.',
    };
    if (messages[outcome]) announce(messages[outcome]);
  }
})();
