(() => {
  const els = {
    signin: document.getElementById('signin'),
    signinHelp: document.getElementById('signinHelp'),
    adminApp: document.getElementById('adminApp'),
    adminWho: document.getElementById('adminWho'),
    stats: document.getElementById('stats'),
    deckRows: document.getElementById('deckRows'),
    importForm: document.getElementById('importForm'),
    importJson: document.getElementById('importJson'),
    importResult: document.getElementById('importResult'),
    responseRows: document.getElementById('responseRows'),
    markdownPreview: document.getElementById('markdownPreview'),
    copyExport: document.getElementById('copyExport'),
  };

  function escapeHtml(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function formatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return escapeHtml(value);
    return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function cookieValue(name) {
    return document.cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) || '';
  }

  async function request(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.method && options.method !== 'GET') {
      const csrf = decodeURIComponent(cookieValue('wawco_ask_csrf'));
      if (csrf) headers['x-ask-csrf'] = csrf;
      if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
    }
    const response = await fetch(path, { credentials: 'same-origin', ...options, headers });
    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await response.json() : await response.text();
    if (!response.ok) throw new Error(data?.error || 'Request failed.');
    return data;
  }

  function showSignin(session) {
    els.signin.classList.remove('hidden');
    els.adminApp.classList.add('hidden');
    els.signinHelp.textContent = session?.auth?.configured
      ? `Use a WAWCO Google account (${session.auth.allowedDomain}).`
      : 'Google sign-in is not configured yet.';
  }

  function renderStats(responses, decks) {
    const submitted = responses.filter((response) => response.status === 'submitted').length;
    const followups = responses.reduce((sum, response) => sum + Number(response.followupCount || 0), 0);
    els.stats.innerHTML = [
      ['Question sets', decks.length],
      ['Submitted', submitted],
      ['Needs follow-up', followups],
    ].map(([label, value]) => `<div class="stat"><b>${escapeHtml(value)}</b><span>${escapeHtml(label)}</span></div>`).join('');
  }

  function renderDeckRows(decks) {
    els.deckRows.innerHTML = decks.map((deck) => {
      const link = deck.publicUrl
        ? `<a href="${escapeHtml(deck.publicUrl)}" target="_blank" rel="noreferrer">Open link</a><span class="sub">${escapeHtml(deck.publicSlug || '')}</span>`
        : '<span class="sub">Link unavailable</span>';
      return `<li class="row">
        <div class="cell"><span class="k">Deck</span><span class="v"><strong>${escapeHtml(deck.title)}</strong><span class="sub">${escapeHtml(deck.clientLabel)} · ${escapeHtml(deck.sensitivity)}</span></span></div>
        <div class="cell"><span class="k">Status</span><span class="v">${escapeHtml(deck.status)}</span></div>
        <div class="cell"><span class="k">Responses</span><span class="v">${escapeHtml(deck.responseCount || 0)}</span></div>
        <div class="cell"><span class="k">Respondent link</span><span class="v">${link}</span></div>
      </li>`;
    }).join('') || '<li class="empty">No question sets yet. Import one above.</li>';
  }

  function renderRows(responses) {
    els.responseRows.innerHTML = responses.map((response) => `
      <li class="row">
        <div class="cell"><span class="k">Respondent</span><span class="v"><strong>${escapeHtml(response.respondentName || 'Unknown')}</strong><span class="sub">${escapeHtml(response.respondentEmail || '')}</span></span></div>
        <div class="cell"><span class="k">Status</span><span class="v">${escapeHtml(response.status)}</span></div>
        <div class="cell"><span class="k">Follow-up</span><span class="v">${escapeHtml(response.followupCount || 0)}</span></div>
        <div class="cell"><span class="k">Submitted</span><span class="v">${escapeHtml(formatDate(response.submittedAt || response.updatedAt || ''))}</span></div>
        <div class="cell"><span class="k">Summary</span><span class="v"><button type="button" class="secondary" data-export="${escapeHtml(response.id)}">Export</button></span></div>
      </li>`).join('') || '<li class="empty">No responses yet.</li>';
  }

  async function loadExport(id) {
    els.markdownPreview.textContent = 'Loading summary…';
    els.copyExport.hidden = true;
    try {
      els.markdownPreview.textContent = await request(`/api/admin/export?id=${encodeURIComponent(id)}`);
      els.copyExport.hidden = false;
      els.copyExport.textContent = 'Copy';
    } catch (error) {
      els.markdownPreview.textContent = error.message;
    }
  }

  async function copyExport() {
    try {
      await navigator.clipboard.writeText(els.markdownPreview.textContent);
      els.copyExport.textContent = 'Copied';
      setTimeout(() => { els.copyExport.textContent = 'Copy'; }, 1500);
    } catch {
      els.copyExport.textContent = 'Copy failed';
    }
  }

  async function importDeck(event) {
    event.preventDefault();
    els.importResult.classList.remove('hidden');
    els.importResult.textContent = 'Importing deck…';
    try {
      const parsed = JSON.parse(els.importJson.value || '{}');
      const result = await request('/api/admin/decks', { method: 'POST', body: JSON.stringify(parsed) });
      const linkHtml = result.secret.publicUrl
        ? `Link: <a href="${escapeHtml(result.secret.publicUrl)}" target="_blank" rel="noreferrer">${escapeHtml(result.secret.publicUrl)}</a><br>`
        : 'No respondent link is active until this deck is published.<br>';
      els.importResult.innerHTML = `Imported <strong>${escapeHtml(result.deck.title)}</strong>.<br>${linkHtml}${result.secret.passcodeRequired ? `Passcode: <code>${escapeHtml(result.secret.passcode)}</code><br>` : ''}<span class="helper">Copy this passcode now. Sending the link to a client stays a separate approval step.</span>`;
      els.importJson.value = '';
      await loadAdminData();
    } catch (error) {
      els.importResult.textContent = error.message;
    }
  }

  async function loadAdminData() {
    const [deckData, responseData] = await Promise.all([
      request('/api/admin/decks'),
      request('/api/admin/responses'),
    ]);
    renderStats(responseData.responses || [], deckData.decks || []);
    renderDeckRows(deckData.decks || []);
    renderRows(responseData.responses || []);
  }

  async function init() {
    const session = await request('/api/session').catch(() => null);
    if (!session?.user) {
      showSignin(session);
      return;
    }
    try {
      els.signin.classList.add('hidden');
      els.adminApp.classList.remove('hidden');
      if (els.adminWho) els.adminWho.textContent = `${session.user.email} · `;
      els.importForm.addEventListener('submit', importDeck);
      els.copyExport.addEventListener('click', copyExport);
      await loadAdminData();
      els.responseRows.addEventListener('click', (event) => {
        const button = event.target.closest('[data-export]');
        if (button) loadExport(button.dataset.export);
      });
    } catch (error) {
      showSignin(session);
      els.signinHelp.textContent = error.message;
    }
  }

  init();
})();
