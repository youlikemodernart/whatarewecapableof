(() => {
  const amountInput = document.querySelector('#support-amount');
  const form = document.querySelector('.support-form');
  const requestIdInput = document.querySelector('#support-request-id');
  const status = document.querySelector('#support-status');
  const installListSummary = document.querySelector('#install-list-summary');
  const installListCount = document.querySelector('#install-list-count');
  const reviewButton = document.querySelector('#review-install-list');
  const reviewSection = document.querySelector('#install-review');
  const reviewCount = document.querySelector('#install-review-count');
  const reviewTitle = document.querySelector('#install-review-title');
  const selectedPackageList = document.querySelector('#selected-package-list');
  const generatePromptButton = document.querySelector('#generate-setup-prompt');
  const clearInstallListButton = document.querySelector('#clear-install-list');
  const setupPrompt = document.querySelector('#setup-prompt');
  const setupPromptText = document.querySelector('#setup-prompt-text');
  const copySetupPromptButton = document.querySelector('#copy-setup-prompt');
  const setupPromptStatus = document.querySelector('#setup-prompt-status');
  const emailSkillRequest = document.querySelector('#email-skill-request');
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

  function invalidateSkillRequest() {
    if (setupPrompt) setupPrompt.hidden = true;
    if (setupPromptText) setupPromptText.value = '';
    if (setupPromptStatus) setupPromptStatus.textContent = '';
    if (emailSkillRequest) {
      emailSkillRequest.hidden = true;
      emailSkillRequest.removeAttribute('href');
    }
  }

  function setSourceButtonState(id, selected) {
    const sourceButton = document.querySelector(`[data-skill-id="${id}"]`);
    sourceButton?.setAttribute('aria-pressed', String(selected));
    return sourceButton;
  }

  function renderInstallReview() {
    if (!selectedPackageList) return;
    selectedPackageList.replaceChildren();
    for (const [id, packageInfo] of installList) {
      const row = document.createElement('div');
      row.className = 'selected-package';
      const name = document.createElement('span');
      name.className = 'selected-package-name';
      name.textContent = packageInfo.name;
      const meta = document.createElement('span');
      meta.className = 'selected-package-meta';
      meta.textContent = `${packageInfo.version} · ${packageInfo.risk} · ${packageInfo.scope}`;
      const remove = document.createElement('button');
      remove.className = 'remove-package';
      remove.type = 'button';
      remove.textContent = 'Remove';
      remove.setAttribute('aria-label', `Remove ${packageInfo.name} from skill set`);
      remove.addEventListener('click', () => {
        const removedIndex = [...installList.keys()].indexOf(id);
        installList.delete(id);
        const sourceButton = setSourceButtonState(id, false);
        invalidateSkillRequest();
        updateInstallList();
        const remaining = selectedPackageList.querySelectorAll('.remove-package');
        if (remaining.length) remaining[Math.min(removedIndex, remaining.length - 1)].focus();
        else sourceButton?.focus();
      });
      row.append(name, meta, remove);
      selectedPackageList.append(row);
    }
  }

  function updateInstallList() {
    const count = installList.size;
    if (installListCount) installListCount.textContent = count ? `${count} selected` : 'Empty';
    if (reviewButton) reviewButton.hidden = count === 0;
    if (reviewCount) reviewCount.textContent = count ? `${count} SELECTED` : 'EMPTY';
    if (reviewSection) reviewSection.hidden = count === 0;
    renderInstallReview();
  }

  function buildSkillRequest() {
    const packages = [...installList.values()].map((packageInfo) => [
      `- ${packageInfo.name}`,
      `  Version: ${packageInfo.version}`,
      `  Scope: ${packageInfo.scope}`,
      `  Risk tier: ${packageInfo.risk}`,
    ].join('\n')).join('\n');
    return `PiOp skill set request\n\nRecipient name: [add name]\nOrganization or project, if relevant: [add context]\n\nRequested packages:\n${packages}\n\nPlease review this combination for compatibility, scope, and risk before fulfillment. Private GitHub is the source authority for the exact reviewed versions. I do not need repository access. If approved, please prepare a recipient-specific verified ZIP, deliver it through a private Google Drive file, and send the exact copy-and-paste Pi setup prompt by email. Do not substitute package versions or expand account, credential, or organization access without confirming the change first.`;
  }

  for (const button of document.querySelectorAll('.skill-install-toggle')) {
    button.hidden = false;
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => {
      const id = button.dataset.skillId || '';
      const selected = button.getAttribute('aria-pressed') === 'true';
      button.setAttribute('aria-pressed', String(!selected));
      if (selected) installList.delete(id);
      else installList.set(id, {
        name: button.dataset.skillName || 'Skill',
        version: button.dataset.skillVersion || 'Unknown version',
        scope: button.dataset.skillScope || 'Unknown scope',
        risk: button.dataset.skillRisk || 'Unknown risk',
      });
      invalidateSkillRequest();
      updateInstallList();
    });
  }

  reviewButton?.addEventListener('click', () => {
    if (!reviewSection || !reviewTitle) return;
    reviewTitle.focus({ preventScroll: true });
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    reviewSection.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  });

  generatePromptButton?.addEventListener('click', () => {
    if (!setupPromptText || installList.size === 0) return;
    const request = buildSkillRequest();
    setupPromptText.value = request;
    if (setupPrompt) setupPrompt.hidden = false;
    if (emailSkillRequest) {
      const subject = encodeURIComponent('PiOp skill set request');
      const body = encodeURIComponent(request);
      emailSkillRequest.href = `mailto:hello@whatarewecapableof.com?subject=${subject}&body=${body}`;
      emailSkillRequest.hidden = false;
    }
  });

  clearInstallListButton?.addEventListener('click', () => {
    installList.clear();
    const sourceButtons = document.querySelectorAll('.skill-install-toggle');
    for (const button of sourceButtons) button.setAttribute('aria-pressed', 'false');
    invalidateSkillRequest();
    updateInstallList();
    sourceButtons[0]?.focus();
  });

  copySetupPromptButton?.addEventListener('click', async () => {
    if (!setupPromptText || !setupPromptStatus) return;
    try {
      await Promise.race([
        navigator.clipboard.writeText(setupPromptText.value),
        new Promise((_, reject) => window.setTimeout(() => reject(new Error('Clipboard timeout')), 1500)),
      ]);
      setupPromptStatus.textContent = 'Request copied.';
    } catch {
      setupPromptStatus.textContent = 'Copy failed. Select the request above.';
    }
  });

  if (installListSummary) installListSummary.hidden = false;
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
