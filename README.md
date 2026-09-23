# Webtor.io Chrome extension
This extension handles torrent downloads and magnet-links
and opens them right at [webtor.io](https://webtor.io)
Please visit [Chrome Web Store](https://chrome.google.com/webstore/detail/webtorio-watch-torrents-o/ngkpdaefpmokglfnmienfiaioffjodam) for more information.

## Building for use
```
npm install
npm run build
```
This downloads all dependencies and generates `dist` folder.
Now you can add it to Chrome with this few steps:
1. Open the `chrome://extensions` page.
2. Disable the official Webtor.io version.
3. Enable the **Developer mode**.
4. Click **Load unpacked extension** button, navigate to project's `dist/` folder.

## Tests
```
npm test
```
Unit tests (node:test) for the pieces that decide what reaches Webtor: which
downloads are left alone (anything from webtor.io), which bytes count as a
torrent, which tab and frame may fetch a download again, and which page gets
the bytes.

After a load or an update of the unpacked extension, reload the tabs you
download from: Chrome does not put the new content script into tabs that
were already open, and without it a site that serves torrents only to its own
pages falls back to the extension's own fetch.
