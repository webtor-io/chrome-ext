// web-ui's API refuses a torrent body over 8 MiB (maxResourceBody in
// handlers/api/resource.go). A .torrent is metadata; anything bigger is not
// one worth carrying to Webtor.
export const MAX_TORRENT_BYTES = 8 << 20;

// Nesting in a real torrent is shallow (info.files[].path[] is five levels
// from the top); the cap only keeps a hostile body from making the walk below
// do silly work.
const MAX_DEPTH = 64;

const D = 0x64; // d
const E = 0x65; // e
const I = 0x69; // i
const L = 0x6c; // l
const COLON = 0x3a;
const MINUS = 0x2d;

export function isTorrentDownload(item) {
  if (/\.torrent$/i.test(item.filename || '')) return true;
  const mime = String(item.mime || '').split(';')[0].trim().toLowerCase();
  return mime === 'application/x-bittorrent';
}

// True for a bencoded dictionary that has an `info` dictionary: what a
// .torrent is, and not what a login page, a bot challenge or a truncated body
// is. Bytes after the top-level dictionary are ignored, as web-ui's decoder
// ignores them.
export function isTorrentBytes(bytes) {
  if (!(bytes instanceof Uint8Array)) return false;
  if (bytes.length === 0 || bytes.length > MAX_TORRENT_BYTES) return false;
  if (bytes[0] !== D) return false;
  let pos = 1;
  let hasInfo = false;
  while (pos < bytes.length && bytes[pos] !== E) {
    const key = readString(bytes, pos);
    if (!key) return false;
    pos = key.end;
    if (isInfoKey(bytes, key.start, key.end) && bytes[pos] === D) hasInfo = true;
    pos = skipValue(bytes, pos);
    if (pos < 0) return false;
  }
  return pos < bytes.length && hasInfo;
}

function isInfoKey(b, start, end) {
  return end - start === 4 && b[start] === 0x69 && b[start + 1] === 0x6e && b[start + 2] === 0x66 && b[start + 3] === 0x6f;
}

function isDigit(c) {
  return c >= 0x30 && c <= 0x39;
}

// <len>:<bytes>; returns where the bytes start and end, or null.
function readString(b, pos) {
  let len = 0;
  let digits = 0;
  while (pos < b.length && isDigit(b[pos])) {
    len = len * 10 + (b[pos] - 0x30);
    if (len > b.length) return null;
    pos++;
    digits++;
  }
  if (digits === 0 || b[pos] !== COLON) return null;
  const start = pos + 1;
  const end = start + len;
  if (end > b.length) return null;
  return {start, end};
}

// i<digits>e
function skipInt(b, pos) {
  pos++;
  if (b[pos] === MINUS) pos++;
  const first = pos;
  while (pos < b.length && isDigit(b[pos])) pos++;
  if (pos === first || b[pos] !== E) return -1;
  return pos + 1;
}

// Skips one value of any type without recursion; -1 on anything malformed.
function skipValue(b, pos) {
  let depth = 0;
  do {
    if (pos >= b.length) return -1;
    const c = b[pos];
    if (c === D || c === L) {
      if (++depth > MAX_DEPTH) return -1;
      pos++;
    } else if (c === E) {
      if (depth === 0) return -1;
      depth--;
      pos++;
    } else if (c === I) {
      pos = skipInt(b, pos);
      if (pos < 0) return -1;
    } else if (isDigit(c)) {
      const s = readString(b, pos);
      if (!s) return -1;
      pos = s.end;
    } else {
      return -1;
    }
  } while (depth > 0);
  return pos;
}

// Reads a response body, giving up as soon as it passes `max` bytes instead
// of buffering whatever the server sends.
export async function readCapped(res, max = MAX_TORRENT_BYTES) {
  const declared = Number(res.headers.get('content-length'));
  if (declared > max) throw new Error(`body of ${declared} bytes is over ${max}`);
  if (!res.body) {
    const all = new Uint8Array(await res.arrayBuffer());
    if (all.length > max) throw new Error(`body is over ${max} bytes`);
    return all;
  }
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) {
      reader.cancel().catch(() => {});
      throw new Error(`body is over ${max} bytes`);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

// fetch + status check + capped read. The caller decides whether the bytes
// are a torrent.
export async function fetchCapped(url, init, max = MAX_TORRENT_BYTES) {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return readCapped(res, max);
}

// Extension messages are JSON; base64 is a third of the size of a number array.
export function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

export function fromBase64(str) {
  const s = atob(str);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
