const files = {};
export default function loadTorrentById(id) {
  console.log('request id', id);
  return new Promise(function(resolve, reject) {
    if (files[id]) {
      console.log('found in cache');
      resolve(files[id]);
      return;
    }
    chrome.downloads.search({id}, async function(items) {
      for (let item of items) {
        if (item.filename.match(/\.torrent$/i)) {
          console.log('item', item);
          const response = await fetch(item.finalUrl);
          const buffer = await response.arrayBuffer();
          console.log('resolve buffer', buffer);
          files[id] = buffer;
          resolve(buffer);
        } else {
          resolve();
        }
      }
    });
  });
}
