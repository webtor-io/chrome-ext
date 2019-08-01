import queryString from 'query-string';
import loadTorrentById from './lib/loadTorrentById';
const debug = require('debug')('webtor:ext:background');

function openTab({magnet, downloadId}) {
  chrome.tabs.create({'url': 'https://webtor.io/show?' + queryString.stringify({magnet, downloadId})}, function(window) {
  });
}

chrome.runtime.onConnect.addListener((port) => {
  port.onMessage.addListener(async(msg) => {
    if (msg.url) {
      openTab({magnet: msg.url});
    }
    if (msg.downloadId) {
      const torrent = await loadTorrentById(msg.downloadId);
      if (torrent) {
        debug('port post message torrent=%o', torrent);
        port.postMessage({torrent});
      } else {
        debug('no torrent');
      }
    }
  });
});

chrome.downloads.onChanged.addListener(async function(item) {
  if (item.state !== undefined
      && item.state.current == 'complete'
      && item.state.previous == 'in_progress'
    ) {
    const torrent = await loadTorrentById(item.id);
    if (torrent) {
      openTab({downloadId: item.id});
    }
  }
});
