if (window.webtorInjected) return;
const debug = require('debug')('webtor:ext:inject');

for (let link of document.links) {
  if (/^magnet/.test(link.href)) {
    link.addEventListener('click', (e) => {
      const msg = {url: e.currentTarget.href};
      debug('port post message url=%s', msg.url);
      chrome.runtime.sendMessage(msg);
      e.preventDefault();
      e.stopPropagation();
      return false;
    }, true);
  }
}
window.addEventListener('message', function(event) {
  // We only accept messages from ourselves
  if (event.source !== window) return;

  if (!event.data.downloadId) return;

  debug('post message downloadId=%d', event.data.downloadId);
  chrome.runtime.sendMessage({downloadId: event.data.downloadId});
}, false);

let t;
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.torrent) {
    debug('window post message torrent=%o', msg.torrent);
    const uint8Array = new Uint8Array(msg.torrent);
    console.log(uint8Array);
    window.postMessage({
      torrent: uint8Array.buffer,
      ver: VERSION,
    }, '*', [uint8Array.buffer]);
    clearInterval(t);
  }
});
debug('injected ver=%s', VERSION);
window.webtorInjected = true;
if (window.location.href.includes('/ext/download?id=')) {
  let i = 0;
  t = setInterval(() => {
    if (i > 10) clearInterval(t);
    window.postMessage({webtorInjected: true}, '*');
    i++;
  }, 500);
}
