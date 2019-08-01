const debug = require('debug')('webtor:ext:inject');
const port = chrome.extension.connect({name: 'inject'});
for (let link of document.links) {
  if (/^magnet/.test(link.href)) {
    link.addEventListener('click', (e) => {
      const msg = {url: e.currentTarget.href};
      debug('port post message url=%s', msg.url);
      port.postMessage(msg);
      event.preventDefault();
      event.stopPropagation();
    }, true);
  }
}
window.addEventListener('message', function(event) {
  // We only accept messages from ourselves
  if (event.source != window)
    return;

  if (event.data.downloadId) {
    debug('port post message downloadId=%d', event.data.downloadId);
    port.postMessage({downloadId: event.data.downloadId});
  }
}, false);
port.onMessage.addListener((msg) => {
  if (msg.torrent) {
    debug('window post message torrent=%o', msg.torrent);
    window.postMessage(msg, '*');
  }
});
debug('injected');
const actualCode = `
  window.__webtorInjected = true;
`;

const script = document.createElement('script');
script.textContent = actualCode;
(document.head||document.documentElement).appendChild(script);
script.remove();
window.postMessage({webtorInjected: true}, '*');
