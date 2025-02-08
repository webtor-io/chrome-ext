import queryString from 'query-string';
import loadTorrentById from './lib/loadTorrentById';

function openTab({magnet, downloadId}) {
  chrome.tabs.create({
      url: 'https://webtor.io/show?' + queryString.stringify({magnet, downloadId})
  }, function(window) {});
}

chrome.runtime.onMessage.addListener(async (msg) => {
  if (msg.url) {
    openTab({magnet: msg.url});
  }
  if (msg.downloadId) {
    const torrent = await loadTorrentById(msg.downloadId);
    if (torrent) {
      console.log('post message torrent', torrent);
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs){
        const uint8Array = new Uint8Array(torrent);
        const arr = Array.from(uint8Array);
        chrome.tabs.sendMessage(tabs[0].id, {torrent: arr}, function(response) {
          console.log('Message sent with torrent data', arr);
        });
      });
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
      openTab({downloadId: item.id});
    }
  }
});
