import test from 'node:test';
import assert from 'node:assert/strict';
import {isDownloadPage, downloadPageUrl, magnetPageUrl, isWebtorDownload} from '../src/js/lib/webtor.js';

// A visit the extension opens is counted as the extension's, not as direct.
test('the tabs the extension opens carry its utm parameters', () => {
  const d = new URL(downloadPageUrl(42));
  assert.equal(d.searchParams.get('id'), '42');
  assert.equal(d.searchParams.get('utm_source'), 'chrome-ext');
  assert.equal(d.searchParams.get('utm_medium'), 'download');

  const magnet = 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=a%20b&tr=udp://t.example:80';
  const m = new URL(magnetPageUrl(magnet));
  assert.equal(m.pathname, '/ext/magnet');
  assert.equal(m.searchParams.get('url'), magnet);
  assert.equal(m.searchParams.get('utm_source'), 'chrome-ext');
  assert.equal(m.searchParams.get('utm_medium'), 'magnet');
});

// web-ui 302s the bare /ext/download to /<lang>/ext/download for anyone whose
// lang cookie is not English, so the localized page must pass as well.
test('the download page, bare and under a language prefix', async (t) => {
  for (const url of [
    'https://webtor.io/ext/download',
    'https://webtor.io/ext/download?id=5',
    'https://webtor.io/ru/ext/download?id=5',
    'https://webtor.io/de/ext/download?id=5',
    'https://webtor.io/pt/ext/download',
    downloadPageUrl(42),
  ]) {
    await t.test(url, () => assert.equal(isDownloadPage(url), true));
  }
});

test('anything else on webtor.io or elsewhere does not', async (t) => {
  for (const url of [
    'https://webtor.io/ext/download-evil',
    'https://webtor.io/ru/ext/download-evil?id=5',
    'https://webtor.io/ext/download/',
    'https://webtor.io/xx/yy/ext/download',
    'https://webtor.io/rus/ext/download',
    'https://webtor.io/r/ext/download',
    'https://webtor.io/RU/ext/download',
    'https://webtor.io/evil/ext/download?id=5',
    'https://webtor.io/ext/magnet?url=magnet:?xt=urn:btih:00',
    'https://webtor.io/',
    'https://evil.example/ru/ext/download',
    'https://evil.example/ext/download?id=5',
    'https://webtor.io.evil.example/ru/ext/download',
    'https://evil.example/https://webtor.io/ru/ext/download',
    'http://webtor.io/ru/ext/download',
    'https://www.webtor.io/ru/ext/download',
    'https://webtor.io:8443/ru/ext/download',
    'about:blank',
    'not a url',
    undefined,
  ]) {
    await t.test(String(url), () => assert.equal(isDownloadPage(url), false));
  }
});

// A .torrent taken from Webtor must not be sent back to Webtor.
test('downloads from webtor.io are left alone', async (t) => {
  for (const item of [
    {url: 'https://webtor.io/abc.torrent'},
    {url: 'https://webtor.io/ru/abc.torrent?token=x'},
    {url: 'http://webtor.io/abc.torrent'},
    {url: 'https://sub.webtor.io/abc.torrent'},
    {url: 'https://a.b.webtor.io/abc.torrent'},
    {url: 'https://WEBTOR.IO/abc.torrent'},
    {url: 'https://webtor.io./abc.torrent'},
    {url: 'https://webtor.io:8443/abc.torrent'},
    {url: 'https://files.example/x', finalUrl: 'https://webtor.io/abc.torrent'},
    {url: 'https://files.example/x', finalUrl: 'https://cdn.webtor.io/abc.torrent'},
    // Served from another host, started on a webtor page.
    {url: 'https://files.example/abc.torrent', referrer: 'https://webtor.io/'},
    {url: 'https://files.example/abc.torrent', referrer: 'https://webtor.io/ru/12ab34cd'},
    {url: 'https://files.example/abc.torrent', referrer: 'https://www.webtor.io/x'},
  ]) {
    await t.test(JSON.stringify(item), () => assert.equal(isWebtorDownload(item), true));
  }
});

test('downloads from anywhere else are taken', async (t) => {
  for (const item of [
    {url: 'https://rutracker.org/forum/dl.php?t=1', finalUrl: 'https://rutracker.org/forum/dl.php?t=1', referrer: 'https://rutracker.org/forum/viewtopic.php?t=1'},
    {url: 'https://files.example/abc.torrent'},
    {url: 'https://files.example/abc.torrent', finalUrl: 'https://cdn.example/abc.torrent', referrer: ''},
    {url: 'https://webtor.io.evil.example/abc.torrent'},
    {url: 'https://evilwebtor.io/abc.torrent'},
    {url: 'https://webtor.iox/abc.torrent'},
    {url: 'https://evil.example/webtor.io/abc.torrent'},
    {url: 'https://evil.example/abc.torrent?r=https://webtor.io/'},
    {url: 'https://evil.example/abc.torrent', referrer: 'https://evil.example/?from=https://webtor.io/'},
    {url: 'https://webtor.io@evil.example/abc.torrent'},
    {url: 'file:///Users/me/webtor.io/abc.torrent'},
    {url: 'data:application/x-bittorrent,d4:infode'},
    {url: 'blob:https://evil.example/1234'},
    {url: 'not a url', finalUrl: undefined, referrer: undefined},
  ]) {
    await t.test(JSON.stringify(item), () => assert.equal(isWebtorDownload(item), false));
  }
});
