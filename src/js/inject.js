if (window.webtorInjected) return;
const debug = require('debug')('webtor:ext:inject');
const {isDownloadPage, torrentPageMessage} = require('./lib/webtor');
const {fetchCapped, toBase64} = require('./lib/torrent');
const {frameIsOf, frameMayFetch, PAGE_FETCH_TIMEOUT_MS} = require('./lib/capture');

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

// The file the user has just downloaded, fetched again from this frame so the
// request is the one this site's own page makes: its cookies, its Referer,
// Sec-Fetch-Site: same-origin (see pageOriginFor in lib/capture.js).
// Only the background can ask: runtime messages reach a content script from
// its own extension alone, never from the page. The bytes go back to the
// background, which checks they are a torrent, and are not handed to the page.
async function fetchTorrentHere(url) {
  // same-origin, not include: frameMayFetch has already limited the URL to
  // this frame's origin, and should the site redirect elsewhere, the other
  // origin gets no cookies.
  const bytes = await fetchCapped(url, {credentials: 'same-origin', signal: AbortSignal.timeout(PAGE_FETCH_TIMEOUT_MS)});
  return toBase64(bytes);
}

let t;
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || sender.tab) return;
  if (msg.torrentProbe) {
    if (!frameIsOf(window.location.origin, msg.torrentProbe.origin)) return;
    sendResponse(true);
    return;
  }
  if (msg.fetchTorrent) {
    const req = msg.fetchTorrent;
    if (!frameMayFetch(window.location.origin, req)) return;
    debug('fetch torrent id=%d url=%s', req.id, req.url);
    fetchTorrentHere(req.url).then(
        (data) => sendResponse({id: req.id, data}),
        (e) => sendResponse({id: req.id, error: String(e && e.message ? e.message : e)}),
    );
    return true;
  }
  if (msg.torrent) {
    debug('window post message torrent=%o', msg.torrent);
    const uint8Array = new Uint8Array(msg.torrent);
    window.postMessage(torrentPageMessage(uint8Array, VERSION), '*', [uint8Array.buffer]);
    clearInterval(t);
  }
});
debug('injected ver=%s', VERSION);
window.webtorInjected = true;
if (isDownloadPage(window.location.href)) {
  let i = 0;
  t = setInterval(() => {
    if (i > 10) clearInterval(t);
    window.postMessage({webtorInjected: true}, '*');
    i++;
  }, 500);
}
