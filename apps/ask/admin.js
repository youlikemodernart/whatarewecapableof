(() => {
  const els = {
    signin: document.getElementById('signin'),
    signinHelp: document.getElementById('signinHelp'),
    adminApp: document.getElementById('adminApp'),
    stats: document.getElementById('stats'),
    deckRows: document.getElementById('deckRows'),
    importForm: document.getElementById('importForm'),
    importJson: document.getElementById('importJson'),
    importResult: document.getElementById('importResult'),
    responseRows: document.getElementById('responseRows'),
    markdownPreview: document.getElementById('markdownPreview'),
  };

  function escapeHtml(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
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
    els.signinHelp.textContent = session?.auth?.configured ? `Allowed domain: ${session.auth.allowedDomain}` : 'Google OAuth is not configured yet.';
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
    els.deckRows.innerHTML = decks.map((deck) => `
      <tr>
        <td><strong>${escapeHtml(deck.title)}</strong><br><span class="helper">${escapeHtml(deck.clientLabel)} · ${escapeHtml(deck.sensitivity)}</span></td>
        <td>${escapeHtml(deck.status)}</td>
        <td>${escapeHtml(deck.responseCount || 0)}</td>
        <td>${deck.publicUrl ? `<a href="${escapeHtml(deck.publicUrl)}" target="_blank" rel="noreferrer">Open</a><br><span class="helper">${escapeHtml(deck.publicSlug)}</span>` : '<span class="helper">Link unavailable</span>'}</td>
      </tr>
    `).join('') || '<tr><td colspan="4">No question sets yet.</td></tr>';
  }

  function renderRows(responses) {
    els.responseRows.innerHTML = responses.map((response) => `
      <tr>
        <td><strong>${escapeHtml(response.respondentName || 'Unknown')}</strong><br><span class="helper">${escapeHtml(response.respondentEmail || '')}</span></td>
        <td>${escapeHtml(response.status)}</td>
        <td>${escapeHtml(response.followupCount || 0)}</td>
        <td>${escapeHtml(response.submittedAt || response.updatedAt || '')}</td>
        <td><button type="button" class="secondary" data-export="${escapeHtml(response.id)}">Export</button></td>
      </tr>
    `).join('') || '<tr><td colspan="5">No responses yet.</td></tr>';
  }

  async function loadExport(id) {
    els.markdownPreview.textContent = 'Loading export...';
    try {
      els.markdownPreview.textContent = await request(`/api/admin/export?id=${encodeURIComponent(id)}`);
    } catch (error) {
      els.markdownPreview.textContent = error.message;
    }
  }

  async function importDeck(event) {
    event.preventDefault();
    els.importResult.classList.remove('hidden');
    els.importResult.textContent = 'Importing deck...';
    try {
      const parsed = JSON.parse(els.importJson.value || '{}');
      const result = await request('/api/admin/decks', { method: 'POST', body: JSON.stringify(parsed) });
      const linkHtml = result.secret.publicUrl
        ? `Link: <a href="${escapeHtml(result.secret.publicUrl)}" target="_blank" rel="noreferrer">${escapeHtml(result.secret.publicUrl)}</a><br>`
        : 'No respondent link is active until this deck is published.<br>';
      els.importResult.innerHTML = `Imported <strong>${escapeHtml(result.deck.title)}</strong>.<br>${linkHtml}${result.secret.passcodeRequired ? `Passcode: <code>${escapeHtml(result.secret.passcode)}</code><br>` : ''}<span class="helper">Copy this passcode now. Client send remains a separate approval step.</span>`;
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
      els.importForm.addEventListener('submit', importDeck);
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
