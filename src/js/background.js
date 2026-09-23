import loadTorrentById from './lib/loadTorrentById';
import {magnetPageUrl, downloadPageUrl, isDownloadPage} from './lib/webtor';

function openTab(url) {
  chrome.tabs.create({url}, function(window) {});
}

chrome.runtime.onMessage.addListener(async (msg, sender) => {
  if (msg.url) {
    openTab(magnetPageUrl(msg.url));
  }
  if (msg.downloadId) {
    if (!sender.tab || !isDownloadPage(sender.url)) {
      console.log('ignore download request from', sender.url);
      return;
    }
    const torrent = await loadTorrentById(msg.downloadId);
    if (torrent) {
      const arr = Array.from(new Uint8Array(torrent));
      // Back to the frame that asked, not to whatever tab is active: that
      // may be another site, possibly framing the webtor page.
      chrome.tabs.sendMessage(sender.tab.id, {torrent: arr}, {frameId: sender.frameId});
    } else {
      console.log('no torrent');
    }
  }
});

chrome.downloads.onChanged.addListener(async function(item) {
  if (item.state !== undefined
      && item.state.current == 'complete'
      && item.state.previous == 'in_progress'
    ) {
    const torrent = await loadTorrentById(item.id);
    if (torrent) {
      openTab(downloadPageUrl(item.id));
    }
  }
});
