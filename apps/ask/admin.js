(() => {
  const els = {
    signin: document.getElementById('signin'),
    signinHelp: document.getElementById('signinHelp'),
    adminApp: document.getElementById('adminApp'),
    stats: document.getElementById('stats'),
    responseRows: document.getElementById('responseRows'),
    markdownPreview: document.getElementById('markdownPreview'),
  };

  function escapeHtml(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  async function request(path, options = {}) {
    const response = await fetch(path, { credentials: 'same-origin', ...options });
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

  function renderStats(responses) {
    const submitted = responses.filter((response) => response.status === 'submitted').length;
    const followups = responses.reduce((sum, response) => sum + Number(response.followupCount || 0), 0);
    els.stats.innerHTML = [
      ['Responses', responses.length],
      ['Submitted', submitted],
      ['Needs follow-up', followups],
    ].map(([label, value]) => `<div class="stat"><b>${escapeHtml(value)}</b><span>${escapeHtml(label)}</span></div>`).join('');
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

  async function init() {
    const session = await request('/api/session').catch(() => null);
    if (!session?.user) {
      showSignin(session);
      return;
    }
    try {
      const data = await request('/api/admin/responses');
      els.signin.classList.add('hidden');
      els.adminApp.classList.remove('hidden');
      renderStats(data.responses || []);
      renderRows(data.responses || []);
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
