import test from 'node:test';
import assert from 'node:assert/strict';
import {isDownloadPage, downloadPageUrl} from '../src/js/lib/webtor.js';

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
