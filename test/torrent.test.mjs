import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_TORRENT_BYTES, isTorrentBytes, isTorrentDownload, readCapped, toBase64, fromBase64,
} from '../src/js/lib/torrent.js';

const enc = (s) => new TextEncoder().encode(s);

// A well-formed torrent of exactly `total` bytes: d4:infod1:p<n>:<n bytes>ee
function padded(total) {
  for (let n = total - 12; n > 0; n--) {
    const head = enc(`d4:infod1:p${n}:`);
    if (head.length + n + 2 !== total) continue;
    const b = new Uint8Array(total);
    b.set(head);
    b.set(enc('ee'), head.length + n);
    return b;
  }
  throw new Error('no size ' + total);
}
// Fixtures are encoded, not typed: a hand-counted length is easy to get wrong.
function bencode(v) {
  if (typeof v === 'number') return `i${v}e`;
  if (typeof v === 'string') return `${new TextEncoder().encode(v).length}:${v}`;
  if (Array.isArray(v)) return 'l' + v.map(bencode).join('') + 'e';
  return 'd' + Object.keys(v).sort().map((k) => bencode(k) + bencode(v[k])).join('') + 'e';
}
const TORRENT = bencode({
  'announce': 'udp://tracker.example.org:1337/announce',
  'info': {'length': 1024, 'name': 'test.bin', 'piece length': 16384, 'pieces': 'A'.repeat(20)},
});
const MULTI = bencode({
  'announce-list': [['udp://a.example:1/announce'], ['udp://b.example:2/announce']],
  'comment': 'hi',
  'creation date': -1,
  'info': {
    'files': [{'length': 3, 'path': ['a', 'b']}, {'length': 7, 'path': ['c']}],
    'name': 'x', 'piece length': 16384, 'pieces': '',
  },
});

test('torrents pass', async (t) => {
  for (const [name, s] of [
    ['single file', TORRENT],
    ['multi file, announce-list', MULTI],
    ['only info', 'd4:infod4:name1:xee'],
    ['info not first', 'd1:ai1e4:infodee'],
    ['trailing bytes after the dictionary', TORRENT + '\n'],
  ]) {
    await t.test(name, () => assert.equal(isTorrentBytes(enc(s)), true));
  }
  await t.test('binary pieces', () => {
    const head = enc('d4:infod6:pieces4:');
    const b = new Uint8Array(head.length + 4 + 2);
    b.set(head);
    b.set([0x00, 0x65, 0x64, 0xff], head.length);
    b.set(enc('ee'), head.length + 4);
    assert.equal(isTorrentBytes(b), true);
  });
  await t.test('exactly the limit', () => {
    assert.equal(isTorrentBytes(padded(MAX_TORRENT_BYTES)), true);
  });
});

test('anything else does not', async (t) => {
  for (const [name, s] of [
    ['empty', ''],
    ['html login page', '<!DOCTYPE html><html><head><title>login</title></head><body>d4:infodee</body></html>'],
    ['challenge page', '<html><head><title>Just a moment...</title></head></html>'],
    ['json error', '{"error":"not logged in"}'],
    ['plain text starting with d', 'denied: 4:info'],
    ['bencoded list', 'l4:infodee'],
    ['no info', 'd8:announce3:abce'],
    ['info not a dictionary', 'd4:info3:abce'],
    ['info only as a value', 'd1:a4:infoe'],
    ['info only nested', 'd1:ad4:infodeee'],
    ['truncated', TORRENT.slice(0, -1)],
    ['truncated inside a string', TORRENT.slice(0, 40)],
    ['string longer than the body', 'd4:infod4:name99:xee'],
    ['bad int', 'd1:ai1x4:infodee'],
    ['empty int', 'd1:aie4:infodee'],
    ['key not a string', 'di1e1:a4:infodee'],
    ['empty dictionary, info after it', 'de4:infodee'],
    ['deep nesting', 'd4:infod1:a' + 'l'.repeat(100000) + 'e'.repeat(100000) + 'ee'],
  ]) {
    await t.test(name, () => assert.equal(isTorrentBytes(enc(s)), false));
  }
  await t.test('over the limit', () => {
    assert.equal(isTorrentBytes(padded(MAX_TORRENT_BYTES + 1)), false);
  });
  await t.test('not bytes', () => {
    for (const v of [undefined, null, TORRENT, enc(TORRENT).buffer, Array.from(enc(TORRENT))]) {
      assert.equal(isTorrentBytes(v), false);
    }
  });
});

test('which downloads are torrents', async (t) => {
  for (const [item, want] of [
    [{filename: '/Users/me/Downloads/x.torrent'}, true],
    [{filename: 'C:\\Downloads\\[rutracker.org].t1.TORRENT'}, true],
    [{filename: '/d/dl.php', mime: 'application/x-bittorrent'}, true],
    [{filename: '/d/dl.php', mime: 'application/x-bittorrent; charset=binary'}, true],
    [{filename: '/d/dl.php', mime: 'Application/X-BitTorrent'}, true],
    [{filename: '/d/x.torrent.html', mime: 'text/html'}, false],
    [{filename: '/d/x.zip', mime: 'application/zip'}, false],
    [{filename: ''}, false],
    [{}, false],
  ]) {
    await t.test(JSON.stringify(item), () => assert.equal(isTorrentDownload(item), want));
  }
});

test('readCapped', async (t) => {
  await t.test('reads a small body', async () => {
    assert.deepEqual(await readCapped(new Response(enc(TORRENT))), enc(TORRENT));
  });
  await t.test('refuses a declared length over the cap', async () => {
    const res = new Response('x', {headers: {'content-length': String(MAX_TORRENT_BYTES + 1)}});
    await assert.rejects(readCapped(res), /over/);
  });
  await t.test('stops reading a streamed body past the cap', async () => {
    let pulled = 0;
    const body = new ReadableStream({
      pull(c) {
        pulled++;
        c.enqueue(new Uint8Array(1024));
        if (pulled > 10000) c.close();
      },
    });
    await assert.rejects(readCapped(new Response(body), 4096), /over/);
    assert.ok(pulled < 20, `pulled ${pulled} chunks`);
  });
});

test('base64 round trip', () => {
  const all = new Uint8Array(70000);
  for (let i = 0; i < all.length; i++) all[i] = i % 256;
  assert.deepEqual(fromBase64(toBase64(all)), all);
  assert.deepEqual(fromBase64(toBase64(new Uint8Array(0))), new Uint8Array(0));
});
