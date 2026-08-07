(() => {
  const amountInput = document.querySelector('#support-amount');
  const form = document.querySelector('.support-form');
  const requestIdInput = document.querySelector('#support-request-id');
  const status = document.querySelector('#support-status');
  const installListCount = document.querySelector('#install-list-count');
  const installList = new Map();

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

  function updateInstallList() {
    if (!installListCount) return;
    if (installList.size === 0) {
      installListCount.textContent = 'Empty';
      return;
    }
    const names = [...installList.values()];
    installListCount.textContent = `${names.length} selected: ${names.join(', ')}`;
  }

  for (const button of document.querySelectorAll('.skill-install-toggle')) {
    button.addEventListener('click', () => {
      const id = button.dataset.skillId || '';
      const name = button.dataset.skillName || 'Skill';
      const selected = button.getAttribute('aria-pressed') === 'true';
      button.setAttribute('aria-pressed', String(!selected));
      button.textContent = selected ? 'Add to install list' : 'In install list';
      if (selected) installList.delete(id);
      else installList.set(id, name);
      updateInstallList();
    });
  }

  updateInstallList();
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
