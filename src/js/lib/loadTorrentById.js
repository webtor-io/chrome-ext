const debug = require('debug')('webtor:ext:lib:loadTorrentById');
function processResponse(response, resolve) {
  const ab = new Uint8Array(response);
  const buffer = new Buffer(ab.byteLength);
  const view = new Uint8Array(ab);
  for (let i = 0; i < buffer.length; ++i) {
    buffer[i] = view[i];
  }
  debug('resolve buffer=%o', buffer);
  resolve(buffer);
}
function sendRequest(urls, resolve) {
  if (urls.length == 0) resolve();
  const url = urls.shift();
  debug('url=%o', url);
  const xhr = new XMLHttpRequest();
  xhr.onerror = function() {
    sendRequest(urls, resolve);
  }
  xhr.onreadystatechange = function() {
    if (this.readyState == 4 && this.response != null) {
      processResponse(this.response, resolve);
    }
  };
  xhr.open('GET', url);
  xhr.responseType = 'arraybuffer';
  xhr.send();
}
export default function loadTorrentById(id) {
  debug('request id=%d', id);
  return new Promise(function(resolve, reject) {
    chrome.downloads.search({id}, function(items) {
      for (let item of items) {
        if (item.filename.match(/\.torrent$/i)) {
          debug('item=%o', item);
          sendRequest([
            'file://' + item.filename,
            item.url,
          ], resolve);
        } else {
          resolve();
        }
      }
    });
  });
}
