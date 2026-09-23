// Tagged so a click on the toolbar icon is counted as the extension,
// not as direct traffic.
chrome.tabs.create({'url': 'https://webtor.io/?utm_source=chrome-ext&utm_medium=popup'});
