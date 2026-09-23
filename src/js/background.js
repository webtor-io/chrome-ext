import {magnetPageUrl, downloadPageUrl, isDownloadPage, isWebtorDownload} from './lib/webtor';
import {MAX_TORRENT_BYTES, isTorrentDownload, fetchCapped} from './lib/torrent';
import {acquireTorrent, askTabs, orderTabs, mayReceive} from './lib/capture';
import TorrentCache from './lib/torrentCache';

const cache = new TorrentCache();

function openTab(url) {
  return chrome.tabs.create({url});
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.url) {
    openTab(magnetPageUrl(msg.url));
  }
  if (msg.downloadId) {
    deliver(Number(msg.downloadId), sender).catch((e) => console.log('download', msg.downloadId, e));
  }
});

async function deliver(id, sender) {
  if (!sender.tab || !isDownloadPage(sender.url)) {
    console.log('ignore download request from', sender.url);
    return;
  }
  const entry = cache.get(id);
  if (!entry) {
    console.log('no torrent for download', id);
    return;
  }
  if (!mayReceive(sender, await entry.tab)) {
    console.log('ignore download request from a tab not opened for download', id);
    return;
  }
  cache.delete(id);
  // Back to the frame that asked, not to whatever tab is active: that
  // may be another site, possibly framing the webtor page.
  chrome.tabs.sendMessage(sender.tab.id, {torrent: Array.from(entry.bytes)}, {frameId: sender.frameId});
}

chrome.downloads.onChanged.addListener((delta) => {
  if (delta.state !== undefined
      && delta.state.current == 'complete'
      && delta.state.previous == 'in_progress'
    ) {
    onDownloaded(delta.id).catch((e) => console.log('download', delta.id, e));
  }
});

async function onDownloaded(id) {
  const [item] = await chrome.downloads.search({id});
  if (!item || !isTorrentDownload(item)) return;
  if (isWebtorDownload(item)) {
    console.log('download', id, 'is from webtor.io, leaving it as it is');
    return;
  }
  if (item.fileSize > MAX_TORRENT_BYTES) {
    console.log('download', id, 'is too big for a torrent:', item.fileSize);
    return;
  }
  const bytes = await acquireTorrent(item, {
    inPage: fetchInTabs,
    direct: (item, ms) => fetchCapped(item.finalUrl || item.url, {signal: AbortSignal.timeout(ms)}),
    log: (m) => console.log('download', id, m),
  });
  if (!bytes) {
    console.log('download', id, 'gave no torrent, Webtor not opened');
    return;
  }
  const tab = openTab(downloadPageUrl(id)).then((t) => t.id);
  cache.put(id, {bytes, tab});
  tab.catch((e) => {
    cache.delete(id);
    console.log('download', id, 'tab not opened', e);
  });
}

async function fetchInTabs(item, origin, deadline) {
  const tabs = orderTabs(await chrome.tabs.query({}), item);
  return askTabs(tabs, {id: item.id, url: item.url, origin}, (tabId, msg) => chrome.tabs.sendMessage(tabId, msg), deadline);
}
