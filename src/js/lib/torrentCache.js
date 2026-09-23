// Torrents fetched on download, waiting for the Webtor tab opened for them.
// An entry leaves when that tab takes it, when it has waited `ttlMs`, or when
// `max` newer ones arrive; nothing stays for the life of the worker.
export default class TorrentCache {
  constructor({max = 8, ttlMs = 2 * 60 * 1000, now = Date.now} = {}) {
    this.max = max;
    this.ttlMs = ttlMs;
    this.now = now;
    this.entries = new Map();
  }

  put(id, entry) {
    this.prune();
    this.entries.delete(id);
    this.entries.set(id, {...entry, expires: this.now() + this.ttlMs});
    while (this.entries.size > this.max) {
      this.entries.delete(this.entries.keys().next().value);
    }
  }

  get(id) {
    this.prune();
    return this.entries.get(id) || null;
  }

  delete(id) {
    this.entries.delete(id);
  }

  get size() {
    this.prune();
    return this.entries.size;
  }

  prune() {
    const now = this.now();
    for (const [id, e] of this.entries) {
      if (e.expires <= now) this.entries.delete(id);
    }
  }
}
