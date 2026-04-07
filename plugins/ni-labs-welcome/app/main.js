const button = document.querySelector('#pingButton');
const statusLine = document.querySelector('#statusLine');

button?.addEventListener('click', () => {
  const timestamp = new Date().toLocaleTimeString();
  if (statusLine) {
    statusLine.textContent = `Smoke check completed at ${timestamp}.`;
  }
});
