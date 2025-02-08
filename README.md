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

## Troubleshooting
To fix issues with handling torrent downloads you should:
1. Open the `chrome://extensions` page.
2. Find Webtor.io extension
3. Click "Details"
4. Activate "Allow Access to file URLs"

In this case extension will load torrent file directly from disk without any issues.
