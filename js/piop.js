(() => {
  const amountInput = document.querySelector('#support-amount');
  const form = document.querySelector('.support-form');
  const requestIdInput = document.querySelector('#support-request-id');
  const status = document.querySelector('#support-status');
  const installListCount = document.querySelector('#install-list-count');
  const reviewButton = document.querySelector('#review-install-list');
  const reviewSection = document.querySelector('#install-review');
  const reviewCount = document.querySelector('#install-review-count');
  const selectedPackageList = document.querySelector('#selected-package-list');
  const generatePromptButton = document.querySelector('#generate-setup-prompt');
  const clearInstallListButton = document.querySelector('#clear-install-list');
  const setupPrompt = document.querySelector('#setup-prompt');
  const setupPromptText = document.querySelector('#setup-prompt-text');
  const copySetupPromptButton = document.querySelector('#copy-setup-prompt');
  const setupPromptStatus = document.querySelector('#setup-prompt-status');
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
      remove.addEventListener('click', () => {
        installList.delete(id);
        const sourceButton = document.querySelector(`[data-skill-id="${id}"]`);
        if (sourceButton) {
          sourceButton.dataset.selected = 'false';
          sourceButton.textContent = 'Add to install list';
        }
        updateInstallList();
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
    renderInstallReview();
  }

  function buildSetupPrompt() {
    const packages = [...installList.values()].map((packageInfo) => [
      `- ${packageInfo.name}`,
      `  Version: ${packageInfo.version}`,
      `  Scope: ${packageInfo.scope}`,
      `  Risk tier: ${packageInfo.risk}`,
      `  Install command: ${packageInfo.command}`,
    ].join('\n')).join('\n');
    return `I want to install this PiOp set:\n\n${packages}\n\nFirst inspect these exact package sources and explain what will be installed, where, and what each package can access or change. Do not install anything yet. Wait for my confirmation.\n\nAfter confirmation, install only these pinned versions and scopes. Then verify package discovery, versions, scope, and declared smoke checks. Report failures without substituting other packages or versions.`;
  }

  for (const button of document.querySelectorAll('.skill-install-toggle')) {
    button.dataset.selected = 'false';
    button.addEventListener('click', () => {
      const id = button.dataset.skillId || '';
      const selected = button.dataset.selected === 'true';
      button.dataset.selected = String(!selected);
      button.textContent = selected ? 'Add to install list' : 'Remove from install list';
      if (selected) installList.delete(id);
      else installList.set(id, {
        name: button.dataset.skillName || 'Skill',
        version: button.dataset.skillVersion || 'Unknown version',
        scope: button.dataset.skillScope || 'Unknown scope',
        risk: button.dataset.skillRisk || 'Unknown risk',
        command: button.dataset.skillCommand || '',
      });
      updateInstallList();
    });
  }

  reviewButton?.addEventListener('click', () => {
    if (!reviewSection) return;
    reviewSection.hidden = false;
    reviewSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  generatePromptButton?.addEventListener('click', () => {
    if (!setupPromptText) return;
    setupPromptText.value = buildSetupPrompt();
    if (setupPrompt) setupPrompt.hidden = false;
  });

  clearInstallListButton?.addEventListener('click', () => {
    installList.clear();
    for (const button of document.querySelectorAll('.skill-install-toggle')) {
      button.dataset.selected = 'false';
      button.textContent = 'Add to install list';
    }
    if (setupPrompt) setupPrompt.hidden = true;
    updateInstallList();
  });

  copySetupPromptButton?.addEventListener('click', async () => {
    if (!setupPromptText || !setupPromptStatus) return;
    try {
      await navigator.clipboard.writeText(setupPromptText.value);
      setupPromptStatus.textContent = 'Setup prompt copied.';
    } catch {
      setupPromptStatus.textContent = 'Copy failed. Select the prompt above.';
    }
  });

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
