(() => {
  const headerInput = document.querySelector('#q');
  const headerForm = document.querySelector('.mh-search');
  const skillInput = document.querySelector('#sk');
  const skills = [...document.querySelectorAll('.skill')];
  const chips = [...document.querySelectorAll('[data-filter]')];
  const status = document.querySelector('#skill-filter-status');
  const active = new Set();

  const apply = () => {
    const query = skillInput.value.trim().toLowerCase();
    let shown = 0;
    for (const skill of skills) {
      const text = skill.textContent.toLowerCase();
      const matchesQuery = !query || text.includes(query);
      const matchesFilters = [...active].every((filter) =>
        skill.dataset.tier === filter || skill.dataset.scope === filter
      );
      const visible = matchesQuery && matchesFilters;
      skill.hidden = !visible;
      if (visible) shown += 1;
    }
    status.textContent = `${shown} of ${skills.length} skills shown`;
  };

  skillInput.addEventListener('input', () => {
    headerInput.value = skillInput.value;
    apply();
  });
  headerInput.addEventListener('input', () => {
    skillInput.value = headerInput.value;
    apply();
  });
  headerForm.addEventListener('submit', (event) => {
    event.preventDefault();
    document.querySelector('#skills').scrollIntoView({ behavior: 'smooth', block: 'start' });
    skillInput.focus({ preventScroll: true });
  });
  for (const chip of chips) {
    chip.addEventListener('click', () => {
      const filter = chip.dataset.filter;
      if (active.has(filter)) active.delete(filter); else active.add(filter);
      chip.setAttribute('aria-pressed', String(active.has(filter)));
      apply();
    });
  }
  apply();
})();
