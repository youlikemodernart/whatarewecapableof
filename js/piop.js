(() => {
  const amountInput = document.querySelector('#support-amount');
  const form = document.querySelector('.support-form');
  const requestIdInput = document.querySelector('#support-request-id');
  const status = document.querySelector('#support-status');
  const contextSelect = document.querySelector('#context-select');
  const contextState = document.querySelector('#context-state');
  const contextDescription = document.querySelector('#context-description');

  const contextDescriptions = {
    neutral: 'The shared library is shown without a selected organization or person. Choosing a fixture changes the context label and explanation only.',
    'neww-blake': 'Neww / Blake is shown as a working context. The shared library remains available and no access or action authority changes.',
    'neww-joacim': 'Neww / Joacim is shown as a working context. The shared library remains available and no access or action authority changes.',
    'neww-jony': 'Neww / Jony is shown as a working context. The shared library remains available and no access or action authority changes.',
    'noah-smbp': 'Noah / smbp is shown as a working context. The shared library remains available and no access or action authority changes.',
  };

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

  if (contextSelect && contextState && contextDescription) {
    const updateContext = () => {
      const option = contextSelect.options[contextSelect.selectedIndex];
      const label = option?.textContent || 'Neutral default';
      contextState.textContent = `Showing: ${label}`;
      contextDescription.textContent = contextDescriptions[contextSelect.value] || contextDescriptions.neutral;
    };

    contextSelect.addEventListener('change', updateContext);
    updateContext();
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

  for (const button of document.querySelectorAll('[data-copy-command]')) {
    button.addEventListener('click', async () => {
      const command = button.dataset.copyCommand || '';
      const targetId = button.getAttribute('aria-describedby');
      const target = targetId ? document.getElementById(targetId) : null;
      try {
        await Promise.race([
          navigator.clipboard.writeText(command),
          new Promise((_, reject) => window.setTimeout(() => reject(new Error('Clipboard timeout')), 1500)),
        ]);
        if (target) target.textContent = 'Install command copied.';
      } catch {
        if (target) target.textContent = 'Copy failed. Select the command above.';
      }
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
    if (messages[outcome]) {
      announce(messages[outcome]);
      status.scrollIntoView({ block: 'center' });
    }
  }
})();
