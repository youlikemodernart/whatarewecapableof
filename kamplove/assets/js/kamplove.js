(() => {
  const toggle = document.querySelector('.globalnav-toggle');
  const menu = document.querySelector('.globalnav-links');
  if (toggle && menu) {
    const close = () => { toggle.setAttribute('aria-expanded', 'false'); menu.classList.remove('is-open'); };
    const open = () => { toggle.setAttribute('aria-expanded', 'true'); menu.classList.add('is-open'); };
    toggle.addEventListener('click', () => toggle.getAttribute('aria-expanded') === 'true' ? close() : open());
    menu.querySelectorAll('a').forEach((a) => a.addEventListener('click', close));
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
    document.addEventListener('click', (event) => {
      if (!menu.contains(event.target) && !toggle.contains(event.target)) close();
    });
  }

  const floating = document.getElementById('floatingCta');
  const hero = document.querySelector('.tile.hero, .tile.hero-xl');
  const give = document.getElementById('give');
  if (floating && hero && 'IntersectionObserver' in window) {
    let heroVisible = true;
    let giveVisible = false;
    const update = () => floating.classList.toggle('is-visible', !heroVisible && !giveVisible);
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === hero) heroVisible = entry.isIntersecting;
        if (give && entry.target === give) giveVisible = entry.isIntersecting;
      }
      update();
    }, { threshold: 0, rootMargin: '-44px 0px 0px 0px' });
    observer.observe(hero);
    if (give) observer.observe(give);
  }

  document.querySelectorAll('.video-play').forEach((button) => {
    button.addEventListener('click', () => {
      const id = button.dataset.yt;
      if (!id) return;
      const tile = button.closest('.video-tile');
      if (!tile) return;
      const title = button.getAttribute('aria-label') || 'YouTube video';
      const iframe = document.createElement('iframe');
      iframe.src = `https://www.youtube.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`;
      iframe.title = title;
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      iframe.allowFullscreen = true;
      tile.appendChild(iframe);
      tile.querySelector('img')?.remove();
      button.remove();
    });
  });

  const campusSelect = document.getElementById('campusSelect');
  if (campusSelect) {
    const updateDonationTarget = () => {
      const slug = campusSelect.value;
      document.querySelectorAll('a[data-donate-base]').forEach((link) => {
        const base = link.dataset.donateBase;
        link.href = slug ? `${base}?default_campaign=${encodeURIComponent(slug)}` : base;
      });
      const iframe = document.getElementById('donateIframe');
      if (iframe) {
        const base = iframe.dataset.donateBase || iframe.src.split('?')[0];
        const url = new URL(base);
        url.searchParams.set('default_interval', 'm');
        if (slug) url.searchParams.set('default_campaign', slug);
        const next = url.toString();
        if (iframe.src !== next) iframe.src = next;
      }
    };
    campusSelect.addEventListener('change', updateDonationTarget);
  }

  const slider = document.getElementById('calcSlider');
  const display = document.getElementById('calcDisplay');
  const impact = document.getElementById('calcImpact');
  const tiers = [
    { amt: 25, msg: 'Buys <strong>one student leader</strong> their training workbook and retreat materials.' },
    { amt: 50, msg: 'One <strong>monthly partner</strong>. One hundred partners per campus funds it in full.' },
    { amt: 75, msg: 'Sponsors a student to a <strong>fall camping trip</strong>.' },
    { amt: 100, msg: 'Sends <strong>one student</strong> to a full weekend Kamp.' },
    { amt: 150, msg: 'Sends a student and covers <strong>discipleship materials</strong> for a year.' },
    { amt: 200, msg: 'Sends <strong>two students</strong> to a weekend Kamp.' },
    { amt: 300, msg: 'Develops <strong>a student leader</strong> for a full year.' },
    { amt: 500, msg: 'Develops <strong>two student leaders</strong> for a year.' },
    { amt: 750, msg: 'Sends <strong>seven students</strong> to a weekend Kamp.' },
    { amt: 1000, msg: 'Underwrites <strong>a full small group</strong> of students for a year.' },
    { amt: 1500, msg: 'Covers <strong>one month</strong> of year-round leader development on a campus.' },
    { amt: 2000, msg: 'Sends <strong>twenty students</strong> to a weekend Kamp.' },
    { amt: 3000, msg: 'Funds <strong>a full month</strong> of campus operations.' },
    { amt: 5000, msg: 'Matches <strong>a campus monthly goal</strong>: one hundred partners at $50.' },
    { amt: 7500, msg: 'Underwrites <strong>a full Kamp weekend</strong> for a campus.' },
    { amt: 10000, msg: 'Underwrites <strong>a Kamp weekend</strong> and seeds regional leadership.' },
    { amt: 15000, msg: 'Funds <strong>half a new campus launch</strong>.' },
    { amt: 25000, msg: 'Launches <strong>a brand new campus</strong> into the Kamp Love movement.' }
  ];
  if (slider && display && impact) {
    const format = (number) => '$' + number.toLocaleString();
    const update = () => {
      const tier = tiers[Number(slider.value)] || tiers[0];
      display.textContent = format(tier.amt);
      impact.innerHTML = tier.msg;
    };
    slider.addEventListener('input', update);
    update();
  }

  const yearNav = document.getElementById('yearNav');
  const yearData = document.getElementById('yearData');
  if (yearNav && yearData) {
    const years = [
      { y: '2025-26', u: '14', k: '27', st: '4,175', lead: '1,229' },
      { y: '2026-27', u: '30', k: '60', st: '9,400', lead: '2,710' },
      { y: '2027-28', u: '60', k: '120', st: '18,800', lead: '5,420' },
      { y: '2028-29', u: '75', k: '150', st: '23,500', lead: '6,780' },
      { y: '2029-30', u: '100', k: '200', st: '31,400', lead: '9,040' },
      { y: '2030-31', u: '100', k: '200', st: '31,400', lead: '9,040' }
    ];
    const render = (item) => {
      yearData.innerHTML = `
        <div class="y"><div class="big">${item.u}</div><div class="lbl">Universities</div></div>
        <div class="y"><div class="big">${item.k}</div><div class="lbl">Kamps</div></div>
        <div class="y"><div class="big">${item.st}</div><div class="lbl">Kampers per year</div></div>
        <div class="y"><div class="big">${item.lead}</div><div class="lbl">Leaders per year</div></div>`;
    };
    years.forEach((item, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = item.y;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', index === 0 ? 'true' : 'false');
      button.addEventListener('click', () => {
        Array.from(yearNav.children).forEach((child) => child.setAttribute('aria-selected', 'false'));
        button.setAttribute('aria-selected', 'true');
        render(item);
      });
      yearNav.appendChild(button);
    });
    render(years[0]);
  }

  document.querySelectorAll('[data-financial-controls]').forEach((controls) => {
    const targetSelector = controls.getAttribute('data-financial-controls');
    const target = document.querySelector(targetSelector);
    if (!target) return;
    controls.querySelectorAll('button[data-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        const mode = button.dataset.mode;
        target.dataset.mode = mode;
        controls.querySelectorAll('button[data-mode]').forEach((peer) => peer.setAttribute('aria-pressed', peer === button ? 'true' : 'false'));
      });
    });
  });

  // Mobile per-year financial statement. Built from the matrix table so the
  // table stays the single source of truth; the wide table is hidden on small
  // screens (CSS), and a year-selector renders one full year vertically at a
  // time. No-JS small screens keep the scrollable table as the fallback.
  document.querySelectorAll('[data-model-statement]').forEach((mount) => {
    const model = mount.closest('.model');
    const table = model && model.querySelector('.financial-table');
    if (!model || !table) return;

    const columns = Array.from(table.querySelectorAll('thead th')).slice(1).map((th) => th.textContent.replace(/\s+/g, ' ').trim());
    if (!columns.length) return;

    const sections = [];
    let section = null;
    table.querySelectorAll('tbody tr').forEach((tr) => {
      if (tr.classList.contains('row-head')) {
        section = { label: tr.textContent.replace(/\s+/g, ' ').trim(), rows: [] };
        sections.push(section);
        return;
      }
      if (!section) { section = { label: '', rows: [] }; sections.push(section); }
      const cells = Array.from(tr.children);
      section.rows.push({
        label: cells[0].textContent.replace(/\s+/g, ' ').trim(),
        values: cells.slice(1).map((td) => td.textContent.replace(/\s+/g, ' ').trim()),
        total: tr.classList.contains('total')
      });
    });

    const years = document.createElement('div');
    years.className = 'statement-years';
    years.setAttribute('role', 'tablist');
    years.setAttribute('aria-label', 'Select a year to view');

    const caption = document.createElement('p');
    caption.className = 'statement-current';
    caption.setAttribute('aria-live', 'polite');

    const panel = document.createElement('div');
    panel.className = 'statement-panel';

    const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
    const render = (index) => {
      caption.textContent = 'Showing ' + columns[index];
      panel.textContent = '';
      sections.forEach((group) => {
        const sec = document.createElement('div');
        sec.className = 'statement-section';
        if (group.label) {
          const head = document.createElement('p');
          head.className = 'statement-section-label';
          head.textContent = group.label;
          sec.appendChild(head);
        }
        group.rows.forEach((row) => {
          const line = document.createElement('div');
          line.className = 'statement-row' + (row.total ? ' total' : '');
          const lbl = document.createElement('span');
          lbl.className = 'lbl';
          lbl.textContent = row.label;
          const val = document.createElement('span');
          val.className = 'val';
          val.textContent = row.values[index] || '';
          line.appendChild(lbl);
          line.appendChild(val);
          sec.appendChild(line);
        });
        panel.appendChild(sec);
      });
    };

    columns.forEach((label, index) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'statement-year';
      chip.textContent = label;
      chip.setAttribute('role', 'tab');
      chip.setAttribute('aria-selected', index === 0 ? 'true' : 'false');
      chip.addEventListener('click', () => {
        years.querySelectorAll('.statement-year').forEach((peer) => peer.setAttribute('aria-selected', 'false'));
        chip.setAttribute('aria-selected', 'true');
        render(index);
        chip.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reduceMotion() ? 'auto' : 'smooth' });
      });
      years.appendChild(chip);
    });

    const hint = document.createElement('p');
    hint.className = 'statement-hint';
    hint.textContent = 'Tap a year for its full statement. The side-by-side five-year matrix opens on a wider screen.';

    mount.appendChild(years);
    mount.appendChild(caption);
    mount.appendChild(panel);
    mount.appendChild(hint);
    render(0);
    model.classList.add('has-statement');
  });

  const deckProgress = document.getElementById('deckProgress');
  const slides = Array.from(document.querySelectorAll('.deck-slide'));
  if (deckProgress && slides.length && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const index = slides.indexOf(entry.target) + 1;
          deckProgress.textContent = `${index} / ${slides.length}`;
        }
      });
    }, { threshold: 0.55 });
    slides.forEach((slide) => observer.observe(slide));
  }
  if (slides.length) {
    document.addEventListener('keydown', (event) => {
      if (!['ArrowDown', 'ArrowRight', 'PageDown', 'ArrowUp', 'ArrowLeft', 'PageUp'].includes(event.key)) return;
      const current = slides.findIndex((slide) => Math.abs(slide.getBoundingClientRect().top) < window.innerHeight * 0.5);
      const delta = ['ArrowDown', 'ArrowRight', 'PageDown'].includes(event.key) ? 1 : -1;
      const next = Math.max(0, Math.min(slides.length - 1, (current < 0 ? 0 : current) + delta));
      slides[next]?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    });
  }

  if (!matchMedia('(prefers-reduced-motion: reduce)').matches && 'IntersectionObserver' in window) {
    const targets = document.querySelectorAll('.tile, .card, .stat, .step, .b, .traj .y, .opp, .ol-vision li');
    const reveal = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          reveal.unobserve(entry.target);
        }
      });
    }, { threshold: 0.05, rootMargin: '0px 0px -8% 0px' });
    requestAnimationFrame(() => {
      document.documentElement.classList.add('js-anim');
      targets.forEach((target) => reveal.observe(target));
    });
  }
})();
