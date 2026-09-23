import test from 'node:test';
import assert from 'node:assert/strict';
import TorrentCache from '../src/js/lib/torrentCache.js';

test('an entry is there until taken', () => {
  const c = new TorrentCache();
  c.put(1, {bytes: 'a'});
  assert.equal(c.get(1).bytes, 'a');
  assert.equal(c.get(2), null);
  c.delete(1);
  assert.equal(c.get(1), null);
  assert.equal(c.size, 0);
});

test('an entry nobody took expires', () => {
  let now = 1000;
  const c = new TorrentCache({ttlMs: 100, now: () => now});
  c.put(1, {bytes: 'a'});
  now += 99;
  assert.ok(c.get(1));
  now += 1;
  assert.equal(c.get(1), null);
  assert.equal(c.size, 0);
});

test('no more than max entries, oldest out first', () => {
  const c = new TorrentCache({max: 3});
  for (let id = 1; id <= 10; id++) c.put(id, {bytes: id});
  assert.equal(c.size, 3);
  assert.deepEqual([8, 9, 10].map((id) => c.get(id).bytes), [8, 9, 10]);
  assert.equal(c.get(7), null);
  // Putting an id again makes it the newest.
  c.put(8, {bytes: 'again'});
  c.put(11, {bytes: 11});
  assert.equal(c.get(9), null);
  assert.equal(c.get(8).bytes, 'again');
});
