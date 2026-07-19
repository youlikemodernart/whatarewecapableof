(() => {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get('slug') || '';

  const els = {
    loading: document.getElementById('loading'),
    passcodeView: document.getElementById('passcodeView'),
    passcodeForm: document.getElementById('passcodeForm'),
    passcode: document.getElementById('passcode'),
    passcodeError: document.getElementById('passcodeError'),
    passcodeTitle: document.getElementById('passcodeTitle'),
    passcodeClient: document.getElementById('passcodeClient'),
    passcodeBody: document.getElementById('passcodeBody'),
    welcomeView: document.getElementById('welcomeView'),
    welcomeTitle: document.getElementById('welcomeTitle'),
    welcomeClient: document.getElementById('welcomeClient'),
    welcomeBody: document.getElementById('welcomeBody'),
    welcomePrivacy: document.getElementById('welcomePrivacy'),
    beginButton: document.getElementById('beginButton'),
    beginError: document.getElementById('beginError'),
    questionView: document.getElementById('questionView'),
    questionCard: document.getElementById('questionCard'),
    questionError: document.getElementById('questionError'),
    progressBar: document.getElementById('progressBar'),
    saveState: document.getElementById('saveState'),
    backButton: document.getElementById('backButton'),
    nextButton: document.getElementById('nextButton'),
    doneView: document.getElementById('doneView'),
  };

  let deck = null;
  let index = 0;
  const answers = new Map();

  function show(name) {
    ['loading', 'passcodeView', 'welcomeView', 'questionView', 'doneView'].forEach((key) => els[key].classList.toggle('hidden', key !== name));
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  async function request(path, options = {}) {
    const response = await fetch(path, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
    const text = await response.text();
    const data = text && response.headers.get('content-type')?.includes('application/json') ? JSON.parse(text) : text;
    if (!response.ok) throw new Error(data?.error || 'Request failed.');
    return data;
  }

  function showWelcome(meta) {
    els.welcomeTitle.textContent = meta.welcome?.title || meta.title || 'A few questions';
    els.welcomeClient.textContent = meta.clientLabel || 'Shared question link';
    els.welcomeBody.textContent = meta.welcome?.body || '';
    els.welcomePrivacy.textContent = meta.welcome?.privacy || 'Only share information you are comfortable providing through this link.';
    els.saveState.textContent = 'Link-only access';
    show('welcomeView');
  }

  async function loadDeck() {
    if (!slug) {
      els.loading.innerHTML = '<h1>Link unavailable</h1><p class="context">Use the complete question link.</p>';
      return;
    }
    try {
      const data = await request(`/api/public/deck?slug=${encodeURIComponent(slug)}`, { headers: {} });
      const meta = data.deck;
      els.passcodeTitle.textContent = meta.welcome?.title || 'Enter passcode';
      els.passcodeClient.textContent = meta.clientLabel || 'Client questions';
      els.passcodeBody.textContent = meta.welcome?.privacy || 'This question set needs a passcode before answers can be opened.';
      if (meta.passcodeRequired) show('passcodeView');
      else showWelcome(meta);
    } catch (error) {
      els.loading.innerHTML = `<h1>Link unavailable</h1><p class="context">${escapeHtml(error.message)}</p>`;
    }
  }

  async function start(passcode) {
    const data = await request('/api/public/start', {
      method: 'POST',
      body: JSON.stringify({ slug, passcode, begin: true }),
    });
    deck = data.deck;
    index = 0;
    els.saveState.textContent = 'Your session is open';
    show('questionView');
    render();
  }

  function currentQuestion() {
    return deck.questions[index];
  }

  function choicesFor(question) {
    if (question.type === 'yes_no' && !question.choices) return [{ ref: 'yes', label: 'Yes' }, { ref: 'no', label: 'No' }];
    return question.choices || [];
  }

  function valueFor(question) {
    return answers.get(question.ref)?.value;
  }

  function setValue(question, value) {
    answers.set(question.ref, { questionRef: question.ref, value });
    els.questionError.textContent = '';
  }

  function render() {
    const q = currentQuestion();
    els.progressBar.style.width = `${Math.round(((index + 1) / deck.questions.length) * 100)}%`;
    els.backButton.disabled = index === 0;
    els.nextButton.textContent = index === deck.questions.length - 1 ? 'Submit' : 'Next';
    els.questionError.textContent = '';

    let body = `<p class="qmeta">Question ${index + 1} of ${deck.questions.length}</p>`;
    body += `<h1>${escapeHtml(q.prompt)}</h1>`;
    if (q.contextText) body += `<p class="context">${escapeHtml(q.contextText)}</p>`;
    if (q.recommendationRationale) body += `<p class="reason">Suggested: ${escapeHtml(q.recommendationRationale)}</p>`;

    const saved = valueFor(q);
    const choiceRow = (choice, type, checked) => {
      const desc = choice.description ? `<span class="desc">${escapeHtml(choice.description)}</span>` : '';
      const suggested = choice.isRecommended ? '<span class="suggested">Suggested</span>' : '';
      return `<label class="choice"><span class="opt"><input type="${type}" name="choice" value="${escapeHtml(choice.ref)}" ${checked ? 'checked' : ''}> <strong>${escapeHtml(choice.label)}</strong></span>${desc}${suggested}</label>`;
    };

    if (q.type === 'identity') {
      const value = saved || {};
      body += ['name', 'email', 'role'].map((key) => {
        const field = (q.fields || []).find((candidate) => candidate.key === key) || { key, label: key };
        const type = key === 'email' ? 'email' : 'text';
        return `<div class="field"><label for="${key}">${escapeHtml(field.label)}</label><input id="${key}" type="${type}" data-field="${key}" autocomplete="${escapeHtml(field.autocomplete || '')}" value="${escapeHtml(value[key] || '')}"></div>`;
      }).join('');
    } else if (q.type === 'short_text') {
      body += `<div class="field"><label for="answer">Answer</label><input id="answer" value="${escapeHtml(saved || '')}" placeholder="${escapeHtml(q.placeholder || '')}"></div>`;
    } else if (q.type === 'long_text') {
      body += `<div class="field"><label for="answer">Answer</label><textarea id="answer" placeholder="${escapeHtml(q.placeholder || '')}">${escapeHtml(saved || '')}</textarea></div>`;
    } else if (q.type === 'multi_choice') {
      const selected = Array.isArray(saved) ? saved : [];
      body += `<div class="choices">${choicesFor(q).map((choice) => choiceRow(choice, 'checkbox', selected.includes(choice.ref))).join('')}</div>`;
    } else if (q.type === 'single_choice' || q.type === 'yes_no') {
      body += `<div class="choices">${choicesFor(q).map((choice) => choiceRow(choice, 'radio', saved === choice.ref)).join('')}</div>`;
    } else if (q.type === 'approval_checkbox') {
      body += `<div class="choices"><label class="choice"><span class="opt"><input type="checkbox" id="approval" ${saved === true ? 'checked' : ''}> <strong>${escapeHtml(q.approvalText || 'I approve.')}</strong></span></label></div>`;
    }
    els.questionCard.innerHTML = body;
  }

  function collect(question) {
    if (question.type === 'identity') {
      const value = {};
      els.questionCard.querySelectorAll('[data-field]').forEach((input) => { value[input.dataset.field] = input.value.trim(); });
      setValue(question, value);
    } else if (question.type === 'short_text' || question.type === 'long_text') {
      setValue(question, els.questionCard.querySelector('#answer')?.value.trim() || '');
    } else if (question.type === 'multi_choice') {
      setValue(question, Array.from(els.questionCard.querySelectorAll('input[name="choice"]:checked')).map((input) => input.value));
    } else if (question.type === 'single_choice' || question.type === 'yes_no') {
      setValue(question, els.questionCard.querySelector('input[name="choice"]:checked')?.value || '');
    } else if (question.type === 'approval_checkbox') {
      setValue(question, els.questionCard.querySelector('#approval')?.checked === true);
    }
  }

  function valid(question) {
    const value = valueFor(question);
    if (!question.required) return true;
    if (question.type === 'identity') return Boolean(value?.name && value?.email && value?.role);
    if (question.type === 'multi_choice') return Array.isArray(value) && value.length > 0;
    if (question.type === 'approval_checkbox') return value === true;
    return Boolean(value);
  }

  async function next() {
    const q = currentQuestion();
    collect(q);
    if (!valid(q)) {
      els.questionError.textContent = q.type === 'approval_checkbox' ? 'Please check the box before submitting.' : 'Please answer this before continuing.';
      return;
    }
    if (index < deck.questions.length - 1) {
      index += 1;
      render();
      return;
    }
    try {
      await request('/api/public/submit', {
        method: 'POST',
        body: JSON.stringify({ answers: Array.from(answers.values()) }),
      });
      show('doneView');
    } catch (error) {
      els.questionError.textContent = error.message;
    }
  }

  els.passcodeForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    els.passcodeError.textContent = '';
    try { await start(els.passcode.value); } catch (error) { els.passcodeError.textContent = error.message; }
  });
  els.beginButton.addEventListener('click', async () => {
    els.beginError.textContent = '';
    els.beginButton.disabled = true;
    try { await start(''); } catch (error) { els.beginError.textContent = error.message; els.beginButton.disabled = false; }
  });
  els.backButton.addEventListener('click', () => { if (index > 0) { collect(currentQuestion()); index -= 1; render(); } });
  els.nextButton.addEventListener('click', next);

  loadDeck();
})();
