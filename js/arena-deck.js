(() => {
  const slides = Array.from(document.querySelectorAll('.slide'));
  const progressBar = document.getElementById('deck-progress-bar');
  const slideCount = document.getElementById('slide-count');
  const prevButton = document.getElementById('prev-slide');
  const nextButton = document.getElementById('next-slide');

  if (!slides.length || !progressBar || !slideCount || !prevButton || !nextButton) return;

  let activeIndex = 0;

  const updateUi = (index) => {
    activeIndex = Math.max(0, Math.min(slides.length - 1, index));
    const human = activeIndex + 1;
    slideCount.textContent = `${human} of ${slides.length}`;
    progressBar.style.width = `${(human / slides.length) * 100}%`;
    prevButton.disabled = activeIndex === 0;
    nextButton.disabled = activeIndex === slides.length - 1;
  };

  const goTo = (index) => {
    const nextIndex = Math.max(0, Math.min(slides.length - 1, index));
    document.body.classList.add('is-keyboarding');
    slides[nextIndex].scrollIntoView({ behavior: 'smooth', block: 'start' });
    updateUi(nextIndex);
  };

  prevButton.addEventListener('click', () => goTo(activeIndex - 1));
  nextButton.addEventListener('click', () => goTo(activeIndex + 1));

  window.addEventListener('keydown', (event) => {
    const tag = event.target && event.target.tagName ? event.target.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || event.metaKey || event.ctrlKey || event.altKey) return;

    if (event.key === 'ArrowDown' || event.key === 'PageDown' || event.key === ' ') {
      event.preventDefault();
      goTo(activeIndex + 1);
    }

    if (event.key === 'ArrowUp' || event.key === 'PageUp') {
      event.preventDefault();
      goTo(activeIndex - 1);
    }

    if (event.key === 'Home') {
      event.preventDefault();
      goTo(0);
    }

    if (event.key === 'End') {
      event.preventDefault();
      goTo(slides.length - 1);
    }
  });

  const observer = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

    if (!visible) return;
    const index = slides.indexOf(visible.target);
    if (index >= 0) updateUi(index);
  }, {
    root: null,
    threshold: [0.42, 0.58, 0.72]
  });

  slides.forEach((slide) => observer.observe(slide));
  updateUi(0);
})();
