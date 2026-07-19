(() => {
  'use strict';

  const rawArticles = Array.isArray(window.EDITORIAL_ARTICLES) ? window.EDITORIAL_ARTICLES : [];
  const articles = rawArticles.filter((article) => (
    article
    && /^[a-z0-9-]+$/.test(article.slug || '')
    && typeof article.title === 'string'
    && typeof article.dateLabel === 'string'
    && typeof article.excerpt === 'string'
    && typeof article.articleHtml === 'string'
    && Number.isInteger(article.sectionCount)
  ));

  const allowedTags = new Set(['P', 'H1', 'H2', 'SECTION', 'EM', 'STRONG', 'A', 'UL', 'OL', 'LI', 'BR']);
  const discardTags = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'FORM', 'INPUT', 'BUTTON', 'SVG', 'MATH', 'TEMPLATE']);
  const storagePrefix = 'wawco-editorial-studio/v1/';
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function articleForSlug(slug) {
    return articles.find((article) => article.slug === slug);
  }

  function createElement(name, text) {
    const element = document.createElement(name);
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function escapeHtml(value) {
    return value.replace(/[&<>'"]/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    })[character]);
  }

  function safeHref(value) {
    try {
      const url = new URL(value, window.location.origin);
      if (url.protocol === 'mailto:') return url.href;
      if (url.origin === window.location.origin && ['http:', 'https:'].includes(url.protocol)) {
        return `${url.pathname}${url.search}${url.hash}`;
      }
    } catch {
      // Invalid links are removed by the caller.
    }
    return null;
  }

  function sanitizeArticleHtml(rawHtml) {
    const parser = new DOMParser();
    const documentFragment = parser.parseFromString(`<body>${rawHtml}</body>`, 'text/html');

    function unwrap(node) {
      const parent = node.parentNode;
      if (!parent) return;
      while (node.firstChild) parent.insertBefore(node.firstChild, node);
      node.remove();
    }

    function sanitizeNode(node) {
      if (node.nodeType === Node.TEXT_NODE) return;
      if (node.nodeType !== Node.ELEMENT_NODE) {
        node.remove();
        return;
      }

      const tag = node.tagName;
      if (discardTags.has(tag)) {
        node.remove();
        return;
      }

      [...node.childNodes].forEach(sanitizeNode);

      if (!allowedTags.has(tag)) {
        unwrap(node);
        return;
      }

      const originalClass = node.getAttribute('class') || '';
      const originalHref = node.getAttribute('href') || '';
      [...node.attributes].forEach((attribute) => node.removeAttribute(attribute.name));

      if (tag === 'P' && ['post-eyebrow', 'leave'].includes(originalClass)) {
        node.className = originalClass;
      }
      if (tag === 'H1') node.className = 'lead';
      if (tag === 'UL' && originalClass === 'guarantees') node.className = 'guarantees';
      if (tag === 'A') {
        const href = safeHref(originalHref);
        if (href) node.setAttribute('href', href);
      }
    }

    [...documentFragment.body.childNodes].forEach(sanitizeNode);
    return documentFragment.body.innerHTML.trim();
  }

  function normalizeSourceHtml(rawHtml) {
    return sanitizeArticleHtml(rawHtml);
  }

  function loadDraft(slug, fallback) {
    try {
      const saved = window.localStorage.getItem(`${storagePrefix}${slug}`);
      return saved === null ? fallback : sanitizeArticleHtml(saved);
    } catch {
      return fallback;
    }
  }

  function saveDraft(slug, html) {
    try {
      window.localStorage.setItem(`${storagePrefix}${slug}`, sanitizeArticleHtml(html));
      return true;
    } catch {
      return false;
    }
  }

  function clearDraft(slug) {
    try {
      window.localStorage.removeItem(`${storagePrefix}${slug}`);
      return true;
    } catch {
      return false;
    }
  }

  function renderLibrary() {
    const list = document.querySelector('#article-library');
    const status = document.querySelector('#library-status');
    if (!list || !status) return;

    if (!articles.length) {
      status.textContent = 'No canonical articles are available.';
      return;
    }

    articles.forEach((article) => {
      const item = createElement('li');
      const link = createElement('a');
      link.href = `./edit/?article=${encodeURIComponent(article.slug)}`;
      link.setAttribute('aria-label', `Edit ${article.title}`);

      const meta = createElement('p', `${article.dateLabel} · ${article.sectionCount} sections`);
      meta.className = 'article-library-meta';
      const title = createElement('h2', article.title);
      title.className = 'article-library-title';
      const excerpt = createElement('p', article.excerpt);
      excerpt.className = 'article-library-excerpt';

      link.append(meta, title, excerpt);
      item.append(link);
      list.append(item);
    });

    status.textContent = `${articles.length} published articles`;
  }

  function renderEditorError(message) {
    const shell = document.querySelector('.editorial-workspace-shell');
    if (!shell) return;
    shell.replaceChildren();
    const heading = createElement('h1', 'Article unavailable');
    heading.className = 'lead';
    const detail = createElement('p', message);
    const back = createElement('a', 'Back to articles');
    back.href = '../';
    const wrapper = createElement('div');
    wrapper.className = 'editorial-error';
    wrapper.append(heading, detail, back);
    shell.append(wrapper);
  }

  function insertPlainText(text) {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function renderEditor() {
    const slug = new URLSearchParams(window.location.search).get('article');
    const article = articleForSlug(slug);
    if (!article) {
      renderEditorError('Choose one of the canonical articles from the Editorial Studio library.');
      return;
    }

    const editor = document.querySelector('#editor');
    const editorScroll = document.querySelector('#editor-scroll');
    const outline = document.querySelector('#outline');
    const preview = document.querySelector('#preview');
    const status = document.querySelector('#editorial-status');
    const resetButton = document.querySelector('#reset-draft');
    const downloadButton = document.querySelector('#download-draft');
    if (!editor || !editorScroll || !outline || !preview || !status || !resetButton || !downloadButton) return;

    const originalMarkup = normalizeSourceHtml(article.articleHtml);
    let previewReady = false;
    let previewQueued = false;
    let scrollQueued = false;
    let pendingContext = null;
    let saveTimer;

    document.title = `${article.title} | Editorial Studio`;
    editor.innerHTML = loadDraft(article.slug, originalMarkup);

    function headingNodes() {
      return [...editor.querySelectorAll('h2')];
    }

    function anchorNodes() {
      const intro = editor.querySelector('#article-start');
      return [intro, ...headingNodes()].filter(Boolean);
    }

    function prepareDocument() {
      const intro = editor.querySelector('.post-eyebrow') || editor.querySelector('h1');
      if (intro) intro.id = 'article-start';
      headingNodes().forEach((heading, index) => {
        heading.id = `section-${index + 1}`;
      });
    }

    function serializedMarkup() {
      const parser = new DOMParser();
      const documentFragment = parser.parseFromString(`<body>${sanitizeArticleHtml(editor.innerHTML)}</body>`, 'text/html');
      const intro = documentFragment.body.querySelector('.post-eyebrow') || documentFragment.body.querySelector('h1');
      if (intro) intro.id = 'article-start';
      [...documentFragment.body.querySelectorAll('h2')].forEach((heading, index) => {
        heading.id = `section-${index + 1}`;
      });
      return documentFragment.body.innerHTML;
    }

    function renderOutline() {
      const list = createElement('ol');
      list.className = 'outline-list';
      headingNodes().forEach((heading) => {
        const item = createElement('li');
        const button = createElement('button', heading.textContent.trim() || 'Untitled section');
        button.type = 'button';
        button.dataset.target = heading.id;
        button.addEventListener('click', () => goToHeading(heading.id));
        item.append(button);
        list.append(item);
      });
      outline.replaceChildren(list);
    }

    function setActiveHeading(id) {
      outline.querySelectorAll('button').forEach((button) => {
        button.toggleAttribute('aria-current', button.dataset.target === id);
        if (button.dataset.target === id) button.setAttribute('aria-current', 'location');
      });
    }

    function positionInEditor(node) {
      const containerRect = editorScroll.getBoundingClientRect();
      return editorScroll.scrollTop + node.getBoundingClientRect().top - containerRect.top;
    }

    function contextAtEditorPosition(position) {
      const anchors = anchorNodes();
      if (!anchors.length) return null;
      let activeIndex = 0;
      anchors.forEach((anchor, index) => {
        if (positionInEditor(anchor) <= position) activeIndex = index;
      });
      const active = anchors[activeIndex];
      const next = anchors[activeIndex + 1];
      const start = positionInEditor(active);
      const end = next ? positionInEditor(next) : editorScroll.scrollHeight;
      return {
        id: active.id,
        progress: Math.min(1, Math.max(0, (position - start) / Math.max(1, end - start))),
      };
    }

    function contextFromEditorScroll() {
      const readingLine = editorScroll.scrollTop + Math.min(96, editorScroll.clientHeight * 0.2);
      return contextAtEditorPosition(readingLine);
    }

    function contextFromSelection() {
      const selection = window.getSelection();
      if (!selection?.rangeCount || !editor.contains(selection.anchorNode)) return null;
      const range = selection.getRangeAt(0).cloneRange();
      range.collapse(true);
      const caretRect = range.getBoundingClientRect();
      if (!Number.isFinite(caretRect.top)) return null;
      const containerRect = editorScroll.getBoundingClientRect();
      return contextAtEditorPosition(editorScroll.scrollTop + caretRect.top - containerRect.top);
    }

    function currentContext({ preferSelection = false } = {}) {
      return (preferSelection && contextFromSelection()) || contextFromEditorScroll();
    }

    function updateActiveHeading() {
      const context = contextFromEditorScroll();
      if (!context) return;
      const target = context.id === 'article-start' ? headingNodes()[0]?.id : context.id;
      if (target) setActiveHeading(target);
    }

    function goToHeading(id) {
      const heading = editor.querySelector(`#${CSS.escape(id)}`);
      if (!heading) return;
      heading.scrollIntoView({ block: 'start', behavior: prefersReducedMotion.matches ? 'auto' : 'smooth' });
      setActiveHeading(id);
      scheduleScrollSync({ id, progress: 0 });
    }

    function previewDocument(markup) {
      return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="/css/site.css">
</head>
<body class="page-post">
  <div class="page">
    <header class="site-header">
      <a class="mark" href="/">What are we capable of?</a>
      <a class="mail" href="mailto:hello@whatarewecapableof.com">hello@whatarewecapableof.com</a>
    </header>
    <main id="main">${markup}</main>
    <footer class="site-footer">
      <a href="/">What are we capable of?</a>
      <span>2026</span>
    </footer>
  </div>
</body>
</html>`;
    }

    function documentPosition(node, iframeWindow) {
      return node.getBoundingClientRect().top + iframeWindow.scrollY;
    }

    function syncPreviewToContext(context) {
      if (!previewReady || !context) return;
      const previewDocument = preview.contentDocument;
      const previewWindow = preview.contentWindow;
      const active = previewDocument?.getElementById(context.id);
      if (!active || !previewWindow) return;
      const intro = previewDocument.querySelector('#article-start');
      const anchors = [intro, ...previewDocument.querySelectorAll('#main h2')].filter(Boolean);
      const activeIndex = anchors.indexOf(active);
      const next = anchors[activeIndex + 1];
      const start = documentPosition(active, previewWindow);
      const documentHeight = Math.max(previewDocument.documentElement.scrollHeight, previewDocument.body?.scrollHeight || 0);
      const end = next ? documentPosition(next, previewWindow) : documentHeight;
      const target = start + Math.min(1, Math.max(0, context.progress)) * Math.max(1, end - start) - 24;
      const maxScroll = Math.max(0, documentHeight - previewWindow.innerHeight);
      previewWindow.scrollTo({ top: Math.min(maxScroll, Math.max(0, target)), behavior: 'auto' });
    }

    function refreshPreview(context) {
      const main = preview.contentDocument?.querySelector('#main');
      if (!main) return;
      main.innerHTML = serializedMarkup();
      syncPreviewToContext(context);
    }

    function schedulePreview(context) {
      pendingContext = context || currentContext({ preferSelection: true });
      if (previewQueued) return;
      previewQueued = true;
      window.requestAnimationFrame(() => {
        previewQueued = false;
        refreshPreview(pendingContext || currentContext());
        pendingContext = null;
      });
    }

    function scheduleScrollSync(context) {
      pendingContext = context || currentContext();
      if (scrollQueued) return;
      scrollQueued = true;
      window.requestAnimationFrame(() => {
        scrollQueued = false;
        syncPreviewToContext(pendingContext || currentContext());
        pendingContext = null;
      });
    }

    function setStatus(message) {
      status.textContent = message;
    }

    function persistDraft() {
      const saved = saveDraft(article.slug, editor.innerHTML);
      setStatus(saved ? 'Draft saved on this device' : 'Draft could not be saved on this device');
    }

    function scheduleSave() {
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(persistDraft, 300);
    }

    function normalizeEditor() {
      const currentMarkup = editor.innerHTML;
      const sanitized = sanitizeArticleHtml(currentMarkup);
      if (currentMarkup !== sanitized) editor.innerHTML = sanitized;
      prepareDocument();
      renderOutline();
      updateActiveHeading();
      schedulePreview(currentContext());
    }

    function downloadDraft() {
      const markup = serializedMarkup();
      const documentHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(article.title)} draft | What are we capable of?</title>
  <link rel="stylesheet" href="/css/site.css">
</head>
<body class="page-post">
  <div class="page">
    <header class="site-header">
      <a class="mark" href="/">What are we capable of?</a>
      <a class="mail" href="mailto:hello@whatarewecapableof.com">hello@whatarewecapableof.com</a>
    </header>
    <main id="main">${markup}</main>
    <footer class="site-footer">
      <a href="/">What are we capable of?</a>
      <span>2026</span>
    </footer>
  </div>
</body>
</html>`;
      const blob = new Blob([documentHtml], { type: 'text/html' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${article.slug}-draft.html`;
      link.click();
      URL.revokeObjectURL(link.href);
      setStatus('Sanitized HTML draft downloaded');
    }

    prepareDocument();
    renderOutline();
    updateActiveHeading();
    preview.addEventListener('load', () => {
      previewReady = true;
      syncPreviewToContext(currentContext());
      setStatus('Draft saved on this device');
    }, { once: true });
    preview.srcdoc = previewDocument(serializedMarkup());

    editor.addEventListener('input', () => {
      const context = currentContext({ preferSelection: true });
      prepareDocument();
      renderOutline();
      updateActiveHeading();
      schedulePreview(context);
      scheduleSave();
    });

    editor.addEventListener('paste', (event) => {
      event.preventDefault();
      insertPlainText(event.clipboardData?.getData('text/plain') || '');
      editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
    });

    editor.addEventListener('drop', (event) => {
      event.preventDefault();
      insertPlainText(event.dataTransfer?.getData('text/plain') || '');
      editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
    });

    editor.addEventListener('blur', normalizeEditor);
    editor.addEventListener('keyup', () => scheduleScrollSync(currentContext({ preferSelection: true })));
    editor.addEventListener('pointerup', () => scheduleScrollSync(currentContext({ preferSelection: true })));

    editorScroll.addEventListener('scroll', () => {
      updateActiveHeading();
      scheduleScrollSync();
    }, { passive: true });

    resetButton.addEventListener('click', () => {
      window.clearTimeout(saveTimer);
      clearDraft(article.slug);
      editor.innerHTML = originalMarkup;
      prepareDocument();
      editorScroll.scrollTo({ top: 0, behavior: 'auto' });
      renderOutline();
      updateActiveHeading();
      refreshPreview({ id: 'article-start', progress: 0 });
      setStatus('Published copy restored on this device');
    });

    downloadButton.addEventListener('click', downloadDraft);
  }

  if (document.body?.dataset.editorialPage === 'library') renderLibrary();
  if (document.body?.dataset.editorialPage === 'editor') renderEditor();
})();
