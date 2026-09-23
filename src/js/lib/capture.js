import {isTorrentBytes, fromBase64} from './torrent.js';

// How long the tabs get to fetch the file, all of them together, before the
// extension fetches it itself.
export const PAGE_TIMEOUT_MS = 6000;
// One page fetch; below PAGE_TIMEOUT_MS so a slow tab still leaves room.
export const PAGE_FETCH_TIMEOUT_MS = 5000;
export const DIRECT_TIMEOUT_MS = 10000;

function httpOrigin(url) {
  let u;
  try {
    u = new URL(url);
  } catch (e) {
    return null;
  }
  return u.protocol === 'https:' || u.protocol === 'http:' ? u.origin : null;
}

// The origin whose tabs may fetch the downloaded file again, or null.
//
// Trackers serve .torrent files from the page's own site and only to their
// own pages: dl.php next to viewtopic.php, behind the session cookie, a
// cookie the page's script sets on the click, a check of the Referer, a bot
// challenge. The extension's own fetch does carry the site's cookies, but it
// comes with no Referer and Sec-Fetch-Site: cross-site, which is what hotlink
// and bot checks turn away. So the file is fetched again from a tab of that
// site, and the request is the one the site's own page makes.
//
// That is done only when the file, where it ended up and the page that
// started the download all share one origin:
//  - then the tab repeats a request the site's own page has just made. Were
//    the URL's origin enough, a foreign page could make the browser download
//    some site's URL and have it requested again from a tab of that site,
//    now looking like the site's own request (same-origin Referer and
//    Sec-Fetch-Site), past the very checks that turned the foreign page away.
//    The referrer, unlike the URL, is not the foreign page's to choose;
//  - a file on another origin (a CDN, or a redirect to one) cannot be read
//    from the page without CORS anyway, so it goes straight to the fetch from
//    the extension, as before.
export function pageOriginFor(item) {
  const origin = httpOrigin(item.url);
  if (!origin) return null;
  if (httpOrigin(item.finalUrl || item.url) !== origin) return null;
  if (httpOrigin(item.referrer) !== origin) return null;
  return origin;
}

// Whether a frame at frameOrigin takes a fetchTorrent request: only for a
// URL on its own origin, the one the background picked. A frame never makes
// a cross-origin request with the user's cookies on the extension's behalf.
export function frameMayFetch(frameOrigin, req) {
  if (!req || typeof req.url !== 'string') return false;
  return frameIsOf(frameOrigin, req.origin) && httpOrigin(req.url) === frameOrigin;
}

// The probe before it: is this frame of that origin.
export function frameIsOf(frameOrigin, origin) {
  if (typeof origin !== 'string' || !frameOrigin || frameOrigin === 'null') return false;
  return origin === frameOrigin;
}

// The tab the user clicked in is most likely the active one, so it goes
// first; the rest by how recently they were used. Tabs of another profile
// (incognito) hold other cookies and are left out.
export function orderTabs(tabs, item) {
  return tabs
    .filter((t) => typeof t.id === 'number' && t.id >= 0 && !t.discarded && !!t.incognito === !!item.incognito)
    .sort((a, b) => (b.active === true) - (a.active === true) || (b.lastAccessed || 0) - (a.lastAccessed || 0));
}

export function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

export function replyBytes(reply, id) {
  if (!reply || reply.id !== id || typeof reply.data !== 'string') return null;
  let bytes;
  try {
    bytes = fromBase64(reply.data);
  } catch (e) {
    return null;
  }
  return isTorrentBytes(bytes) ? bytes : null;
}

// Asks one tab at a time. A tab is first asked only whether it has a frame of
// the origin: the URL itself (on private trackers it may carry a passkey) goes
// only to tabs of that site, not into every page's renderer. A tab without
// such a frame answers at once (nobody responds, the message port closes).
// All tabs of a site share its cookies, so the first one that can fetch is as
// good as any and the site gets one extra request, not one per open tab.
export async function askTabs(tabs, req, send, deadline, now = Date.now) {
  for (const tab of tabs) {
    const left = () => deadline - now();
    if (left() <= 0) break;
    let reply;
    try {
      if (await withTimeout(send(tab.id, {torrentProbe: {origin: req.origin}}), left()) !== true) continue;
      if (left() <= 0) break;
      reply = await withTimeout(send(tab.id, {fetchTorrent: req}), left());
    } catch (e) {
      continue;
    }
    const bytes = replyBytes(reply, req.id);
    if (bytes) return bytes;
  }
  return null;
}

async function attempt(what, fn, ms, log) {
  try {
    const bytes = await withTimeout(Promise.resolve().then(fn), ms);
    if (isTorrentBytes(bytes)) return bytes;
    log(`${what}: no torrent in the reply`);
  } catch (e) {
    log(`${what}: ${e && e.message ? e.message : e}`);
  }
  return null;
}

// The downloaded torrent's bytes, or null. A tab of the site first when
// pageOriginFor allows it, then the plain fetch from the extension; each
// bounded in time, and nothing that is not a torrent comes out.
export async function acquireTorrent(item, {inPage, direct, pageMs = PAGE_TIMEOUT_MS, directMs = DIRECT_TIMEOUT_MS, log = () => {}}) {
  const origin = pageOriginFor(item);
  if (origin) {
    const bytes = await attempt('page', () => inPage(item, origin, Date.now() + pageMs), pageMs, log);
    if (bytes) return bytes;
  }
  return attempt('direct', () => direct(item, directMs), directMs, log);
}

// The bytes go only to the top frame of the tab the extension opened for this
// download. isDownloadPage alone would let any page that frames
// webtor.io/ext/download?id=N, reloading it until the download lands, take
// the bytes before the user's tab does.
export function mayReceive(sender, tabId) {
  return !!sender.tab && sender.tab.id === tabId && sender.frameId === 0;
}
