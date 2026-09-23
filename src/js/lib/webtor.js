export const WEBTOR_URL = 'https://webtor.io';

// Magnets go straight to /ext/magnet. The legacy /show redirect in front of
// it re-encodes the link as "url=magnet:..." and the page then keeps only the
// info hash, dropping trackers and the name.
export function magnetPageUrl(magnet) {
  return WEBTOR_URL + '/ext/magnet?' + new URLSearchParams({url: magnet});
}

export function downloadPageUrl(downloadId) {
  return WEBTOR_URL + '/ext/download?' + new URLSearchParams({id: downloadId});
}

// The only page allowed to ask for a downloaded .torrent is the one the
// extension opens itself after a download finishes. Any other page asking
// would let a site walk download ids and read the user's .torrent files.
//
// web-ui 302s /ext/download to /<lang>/ext/download for anyone whose lang
// cookie is not English (any visit to a /ru/, /de/... page sets it), so the
// page the tab lands on may carry a two-letter language prefix.
const DOWNLOAD_PATH = /^\/(?:[a-z]{2}\/)?ext\/download$/;

export function isDownloadPage(url) {
  let u;
  try {
    u = new URL(url);
  } catch (e) {
    return false;
  }
  return u.origin === WEBTOR_URL && DOWNLOAD_PATH.test(u.pathname);
}

// web-ui's /ext/download page (assets/src/js/app/ext/download.js) reads the
// bytes from `torrent` only when ver <= 0.1.12 and from `torrent.data` for
// every later version, so the bytes travel under `data`.
export function torrentPageMessage(bytes, ver) {
  return {torrent: {data: bytes}, ver};
}
