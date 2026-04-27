(() => {
  const root = document.querySelector('[data-booking-type]');
  if (!root) return;

  const API = '';
  const bookingType = root.dataset.bookingType || 'coach';
  const timezoneLabel = root.dataset.timezoneLabel || 'Arizona time';
  const emptyMessage = root.dataset.emptyMessage || 'No availability right now.';

  let selectedDate = null;
  let selectedSlot = null;

  const $dates = document.getElementById('step-dates');
  const $times = document.getElementById('step-times');
  const $form = document.getElementById('step-form');
  const $confirmed = document.getElementById('step-confirmed');
  const $error = document.getElementById('step-error');

  function bookingQuery(params = {}) {
    const query = new URLSearchParams({ type: bookingType, ...params });
    return query.toString();
  }

  function showStep(step) {
    [$dates, $times, $form, $confirmed, $error].forEach((el) => {
      el.style.display = 'none';
    });
    step.style.display = 'block';
  }

  function formatDateDisplay(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  async function fetchJson(url, options) {
    const res = await fetch(url, options);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed.');
    return data;
  }

  async function loadDates() {
    const list = document.getElementById('dates-list');
    list.textContent = '...';
    try {
      const data = await fetchJson(API + '/api/availability?' + bookingQuery());
      if (!data.dates || data.dates.length === 0) {
        list.textContent = emptyMessage;
        return;
      }
      list.innerHTML = '';
      const ul = document.createElement('ul');
      ul.style.listStyle = 'none';
      ul.style.padding = '0';
      data.dates.forEach((d) => {
        const li = document.createElement('li');
        li.style.padding = 'var(--space-0-5) 0';
        const a = document.createElement('a');
        a.href = '#';
        a.textContent = formatDateDisplay(d.date);
        a.addEventListener('click', (e) => {
          e.preventDefault();
          selectDate(d.date);
        });
        li.appendChild(a);
        ul.appendChild(li);
      });
      list.appendChild(ul);
    } catch (err) {
      list.textContent = 'Could not load availability.';
    }
  }

  async function selectDate(dateStr) {
    selectedDate = dateStr;
    document.getElementById('selected-date-label').textContent = formatDateDisplay(dateStr);
    showStep($times);
    const list = document.getElementById('times-list');
    list.textContent = '...';
    try {
      const data = await fetchJson(API + '/api/availability?' + bookingQuery({ date: dateStr }));
      if (!data.slots || data.slots.length === 0) {
        list.textContent = 'No slots available on this date.';
        return;
      }
      list.innerHTML = '';
      const ul = document.createElement('ul');
      ul.style.listStyle = 'none';
      ul.style.padding = '0';
      data.slots.forEach((s) => {
        const li = document.createElement('li');
        li.style.padding = 'var(--space-0-5) 0';
        const a = document.createElement('a');
        a.href = '#';
        a.textContent = s.display;
        a.addEventListener('click', (e) => {
          e.preventDefault();
          selectSlot(s);
        });
        li.appendChild(a);
        ul.appendChild(li);
      });
      list.appendChild(ul);
    } catch (err) {
      list.textContent = 'Could not load times.';
    }
  }

  function selectSlot(slot) {
    selectedSlot = slot;
    document.getElementById('selected-slot-label').textContent =
      formatDateDisplay(selectedDate) + ' at ' + slot.display + ' ' + timezoneLabel;
    showStep($form);
  }

  document.getElementById('back-to-dates').addEventListener('click', (e) => {
    e.preventDefault();
    showStep($dates);
  });

  document.getElementById('back-to-times').addEventListener('click', (e) => {
    e.preventDefault();
    showStep($times);
  });

  document.getElementById('booking-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submit-btn');
    const original = btn.textContent;
    btn.textContent = '...';
    btn.disabled = true;

    try {
      const data = await fetchJson(API + '/api/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: bookingType,
          start: selectedSlot.start,
          name: document.getElementById('name').value,
          email: document.getElementById('email').value,
          purpose: document.getElementById('purpose').value,
          note: document.getElementById('note').value,
        }),
      });

      if (data.success) {
        showStep($confirmed);
      } else {
        document.getElementById('error-message').textContent = data.error || 'Something went wrong.';
        showStep($error);
      }
    } catch (err) {
      document.getElementById('error-message').textContent = err.message || 'Could not complete booking.';
      showStep($error);
    } finally {
      btn.textContent = original;
      btn.disabled = false;
    }
  });

  loadDates();
})();
