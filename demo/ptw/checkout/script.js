const widgetStatus = document.getElementById('widgetStatus');

function updateWidgetStatus() {
  const iframe = document.querySelector('.hievents-widget iframe');
  if (widgetStatus && iframe) {
    widgetStatus.textContent = 'Ready';
  }
}

const observer = new MutationObserver(updateWidgetStatus);
const widget = document.querySelector('.hievents-widget');
if (widget) {
  observer.observe(widget, { childList: true, subtree: true });
}

window.addEventListener('load', () => {
  updateWidgetStatus();
  window.setTimeout(updateWidgetStatus, 1200);
});
