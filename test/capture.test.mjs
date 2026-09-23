import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pageOriginFor, frameMayFetch, frameIsOf, orderTabs, askTabs, acquireTorrent, mayReceive, replyBytes,
} from '../src/js/lib/capture.js';
import {toBase64} from '../src/js/lib/torrent.js';

const enc = (s) => new TextEncoder().encode(s);
const TORRENT = enc('d4:infod6:lengthi1e4:name1:x12:piece lengthi16384e6:pieces0:ee');
const HTML = enc('<html><body>Please log in</body></html>');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const RT = 'https://rutracker.org';
const rutracker = {
  id: 7,
  url: RT + '/forum/dl.php?t=6512345',
  finalUrl: RT + '/forum/dl.php?t=6512345',
  referrer: RT + '/forum/viewtopic.php?t=6512345',
};

test('which downloads a tab of the site fetches again', async (t) => {
  for (const [name, item, want] of [
    ['dl.php next to the topic page', rutracker, RT],
    ['no finalUrl yet', {...rutracker, finalUrl: undefined}, RT],
    ['redirect within the site', {...rutracker, finalUrl: RT + '/forum/dl2.php?t=1'}, RT],
    ['a file on a CDN linked from the page', {url: 'https://cdn.example/x.torrent', referrer: 'https://site.example/t/1'}, null],
    ['a link on the site redirecting to a CDN', {url: 'https://site.example/get/1', finalUrl: 'https://cdn.example/x.torrent', referrer: 'https://site.example/t/1'}, null],
    ['no referrer', {...rutracker, referrer: ''}, null],
    ['referrer from another site', {...rutracker, referrer: 'https://evil.example/'}, null],
    ['referrer from a subdomain', {...rutracker, referrer: 'https://www.rutracker.org/forum/'}, null],
    ['referrer over http', {...rutracker, referrer: 'http://rutracker.org/forum/viewtopic.php?t=1'}, null],
    ['referrer on another port', {...rutracker, referrer: RT + ':8443/forum/'}, null],
    ['a URL with userinfo pointing elsewhere', {url: 'https://rutracker.org@evil.example/x.torrent', referrer: RT + '/'}, null],
    ['not http', {url: 'ftp://site.example/x.torrent', referrer: 'ftp://site.example/'}, null],
    ['data URL', {url: 'data:application/x-bittorrent,d4:infodee', referrer: RT + '/'}, null],
    ['nothing', {}, null],
  ]) {
    await t.test(name, () => assert.equal(pageOriginFor(item), want));
  }
});

test('which frame fetches', async (t) => {
  const req = {id: 7, url: rutracker.url, origin: RT};
  for (const [name, frame, r, want] of [
    ['a frame of the site', RT, req, true],
    ['a frame of another site', 'https://evil.example', req, false],
    ['a frame of a subdomain', 'https://www.rutracker.org', req, false],
    ['the same host over http', 'http://rutracker.org', req, false],
    ['an opaque origin', 'null', req, false],
    ['no origin', undefined, req, false],
    ['origin and URL disagree', 'https://evil.example', {...req, origin: 'https://evil.example'}, false],
    ['URL elsewhere under a matching origin', RT, {...req, url: 'https://evil.example/x.torrent'}, false],
    ['userinfo trick', RT, {...req, url: 'https://rutracker.org@evil.example/x'}, false],
    ['no url', RT, {id: 7, origin: RT}, false],
    ['no request', RT, undefined, false],
  ]) {
    await t.test(name, () => assert.equal(frameMayFetch(frame, r), want));
  }
});

test('which frame answers the probe', () => {
  assert.equal(frameIsOf(RT, RT), true);
  assert.equal(frameIsOf('https://evil.example', RT), false);
  assert.equal(frameIsOf('https://www.rutracker.org', RT), false);
  assert.equal(frameIsOf('null', 'null'), false);
  assert.equal(frameIsOf(undefined, undefined), false);
  assert.equal(frameIsOf(RT, undefined), false);
});

test('tabs are asked active first, then by last use, same profile only', () => {
  const tabs = [
    {id: 1, lastAccessed: 100},
    {id: 2, lastAccessed: 300},
    {id: 3, active: true, lastAccessed: 50},
    {id: 4, lastAccessed: 999, incognito: true},
    {id: 5, lastAccessed: 998, discarded: true},
    {id: -1, lastAccessed: 997},
    {id: 6, lastAccessed: 200},
  ];
  assert.deepEqual(orderTabs(tabs, {incognito: false}).map((t) => t.id), [3, 2, 6, 1]);
  assert.deepEqual(orderTabs(tabs, {incognito: true}).map((t) => t.id), [4]);
});

test('askTabs', async (t) => {
  const req = {id: 7, url: rutracker.url, origin: RT};
  const good = {id: 7, data: toBase64(TORRENT)};
  const isProbe = (msg) => !!msg.torrentProbe;

  await t.test('first valid reply wins; the URL goes only to tabs of the site', async () => {
    const probed = [];
    const fetched = [];
    const probes = {1: Promise.reject(new Error('Receiving end does not exist')), 2: Promise.resolve(undefined), 3: Promise.resolve(true), 4: Promise.resolve(true)};
    const bytes = await askTabs([{id: 1}, {id: 2}, {id: 3}, {id: 4}], req, (id, msg) => {
      if (isProbe(msg)) {
        assert.deepEqual(msg, {torrentProbe: {origin: RT}});
        probed.push(id);
        return probes[id];
      }
      assert.deepEqual(msg, {fetchTorrent: req});
      fetched.push(id);
      return Promise.resolve(good);
    }, Date.now() + 1000);
    assert.deepEqual(bytes, TORRENT);
    assert.deepEqual(probed, [1, 2, 3]);
    assert.deepEqual(fetched, [3]);
  });

  await t.test('a probe answer other than true is a no', async () => {
    const fetched = [];
    const bytes = await askTabs([{id: 1}, {id: 2}], req, (id, msg) => {
      if (isProbe(msg)) return Promise.resolve(id === 1 ? 'yes' : {ok: true});
      fetched.push(id);
      return Promise.resolve(good);
    }, Date.now() + 1000);
    assert.equal(bytes, null);
    assert.deepEqual(fetched, []);
  });

  await t.test('a login page, a failure or another id are not taken, the next tab is tried', async () => {
    const replies = {
      1: {id: 7, data: toBase64(HTML)},
      2: {id: 7, error: 'HTTP 403'},
      3: {id: 8, data: toBase64(TORRENT)},
      4: {id: 7, data: '%%% not base64'},
    };
    const send = (id, msg) => Promise.resolve(isProbe(msg) ? true : replies[id]);
    assert.equal(await askTabs([{id: 1}, {id: 2}, {id: 3}, {id: 4}], req, send, Date.now() + 1000), null);
    replies[5] = good;
    assert.deepEqual(await askTabs([{id: 1}, {id: 2}, {id: 3}, {id: 4}, {id: 5}], req, send, Date.now() + 1000), TORRENT);
  });

  await t.test('a tab that never answers costs no more than the deadline', async () => {
    for (const hang of ['probe', 'fetch']) {
      const started = Date.now();
      const bytes = await askTabs([{id: 1}, {id: 2}], req, (id, msg) => {
        if (isProbe(msg) && hang === 'fetch') return Promise.resolve(true);
        return new Promise(() => {});
      }, Date.now() + 80);
      assert.equal(bytes, null);
      assert.ok(Date.now() - started < 500, `${hang}: took ${Date.now() - started} ms`);
    }
  });
});

test('replyBytes', () => {
  assert.deepEqual(replyBytes({id: 1, data: toBase64(TORRENT)}, 1), TORRENT);
  assert.equal(replyBytes({id: 1, data: toBase64(TORRENT)}, 2), null);
  assert.equal(replyBytes({id: 1, data: toBase64(HTML)}, 1), null);
  assert.equal(replyBytes(undefined, 1), null);
});

test('acquireTorrent', async (t) => {
  const direct = (bytes) => {
    const f = async () => {
      f.calls++;
      return bytes;
    };
    f.calls = 0;
    return f;
  };

  await t.test('the page when it can, no second request', async () => {
    const d = direct(TORRENT);
    let asked = null;
    const bytes = await acquireTorrent(rutracker, {inPage: async (item, origin) => {
      asked = origin;
      return TORRENT;
    }, direct: d});
    assert.deepEqual(bytes, TORRENT);
    assert.equal(asked, RT);
    assert.equal(d.calls, 0);
  });

  await t.test('the extension when the page brings a login page', async () => {
    const d = direct(TORRENT);
    const bytes = await acquireTorrent(rutracker, {inPage: async () => HTML, direct: d});
    assert.deepEqual(bytes, TORRENT);
    assert.equal(d.calls, 1);
  });

  await t.test('the extension when the page throws', async () => {
    const bytes = await acquireTorrent(rutracker, {inPage: async () => {
      throw new Error('boom');
    }, direct: direct(TORRENT)});
    assert.deepEqual(bytes, TORRENT);
  });

  await t.test('the extension when the page hangs, after pageMs', async () => {
    const started = Date.now();
    const bytes = await acquireTorrent(rutracker, {inPage: () => new Promise(() => {}), direct: direct(TORRENT), pageMs: 60});
    assert.deepEqual(bytes, TORRENT);
    assert.ok(Date.now() - started < 500);
  });

  await t.test('straight to the extension for a CDN file', async () => {
    let asked = false;
    const bytes = await acquireTorrent({id: 1, url: 'https://cdn.example/x.torrent', referrer: 'https://site.example/'}, {
      inPage: async () => {
        asked = true;
        return TORRENT;
      },
      direct: direct(TORRENT),
    });
    assert.deepEqual(bytes, TORRENT);
    assert.equal(asked, false);
  });

  await t.test('nothing when neither brings a torrent', async () => {
    const log = [];
    for (const d of [direct(HTML), direct(new Uint8Array(0)), async () => {
      throw new TypeError('Failed to fetch');
    }, () => new Promise(() => {})]) {
      const bytes = await acquireTorrent(rutracker, {inPage: async () => HTML, direct: d, directMs: 60, log: (m) => log.push(m)});
      assert.equal(bytes, null);
    }
    assert.ok(log.some((m) => /Failed to fetch/.test(m)), log.join('\n'));
    assert.ok(log.some((m) => /timed out/.test(m)), log.join('\n'));
  });

  await t.test('a slow page that answers after the deadline does not count', async () => {
    const bytes = await acquireTorrent(rutracker, {inPage: async () => {
      await sleep(150);
      return TORRENT;
    }, direct: direct(HTML), pageMs: 30, directMs: 30});
    assert.equal(bytes, null);
  });
});

test('only the tab opened for the download gets its bytes', () => {
  assert.equal(mayReceive({tab: {id: 5}, frameId: 0}, 5), true);
  assert.equal(mayReceive({tab: {id: 6}, frameId: 0}, 5), false);
  assert.equal(mayReceive({tab: {id: 5}, frameId: 3}, 5), false);
  assert.equal(mayReceive({frameId: 0}, 5), false);
  assert.equal(mayReceive({tab: {id: 5}, frameId: 0}, undefined), false);
});
