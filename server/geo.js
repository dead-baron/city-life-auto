// Where players connect from, roughly - the owner's console's "Where from" (server/adminhttp.js; the owner, 11-16: "where
// they're logging in from"). A country (and a region when it's cheap), worked out on the server when a player joins; the
// connecting address is looked up and dropped there and then - never stored, never shown, never logged (privacy policy:
// server/legal.js).
//   1. The address, in a country-by-IP table: DB-IP's "IP to Country Lite" (CC BY 4.0, https://db-ip.com - credited on
//      the console), packed into <data>/ipcountry.bin (packTable; by hand: tools/ipcountry.mjs). The server fetches this month's edition by
//      itself a minute after it starts when the table is missing or over 40 days old (start: in the background, never on the
//      start's path), or the file is put there by hand. No table yet: step 2 alone.
//   2. The page's time zone (the hello's tz: Intl's), through the IANA tz database's zone table (server/data/tzcountry.json,
//      public domain): its country - and its region ("Central", "Ontario"), which the address can't give. When the address
//      found a country the time zone's region is added only if the two agree.
// where(ip, tz) -> { c: 'US', r: 'Central' | undefined, s: 'ip' | 'tz' } or null. names[c]: the country's name.
import { readFileSync, existsSync, statSync, writeFileSync, renameSync } from 'node:fs';
import { join as pathJoin, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const TZ = JSON.parse(readFileSync(pathJoin(dirname(fileURLToPath(import.meta.url)), 'data', 'tzcountry.json'), 'utf8'));
export const names = TZ.names;
export const TABLE_FILE = 'ipcountry.bin', MAX_AGE_DAYS = 40, FETCH_AFTER_MS = 60e3;

// DB-IP's CSV (start,end,country per line; v4 and v6) packed: 'CLAG', the v4 count, the v6 count, 0; then the v4 range
// starts (u32), their countries (two letters in a u16; 0 for a gap), the v6 starts' top 64 bits (two u32), their countries.
// Ranges next to each other in the same country are merged; a gap between two ranges gets a start of its own (country 0).
export const MAGIC = 0x47414c43;
export function packTable(csv) {
  const R4 = [], R6 = [];
  for (const line of String(csv).split('\n')) {
    const [a, b, c] = line.trim().replace(/"/g, '').split(',');
    if (!a || !b || !/^[A-Z]{2}$/.test(c || '')) continue;
    const A = parseIp(a), B = parseIp(b);
    if (!A || !B || A.v !== B.v) continue;
    const cc = (c.charCodeAt(0) << 8) | c.charCodeAt(1);
    if (A.v === 4) R4.push([A.n, B.n, cc]); else R6.push([A.hi * 4294967296 + A.lo, B.hi * 4294967296 + B.lo, cc]);
  }
  const squash = (R, step, max) => {
    R.sort((x, y) => x[0] - y[0]);
    const out = [];
    for (const [s, e, cc] of R) {
      const last = out[out.length - 1];
      if (last && last[1] === cc && last[2] + step >= s) { last[2] = Math.max(last[2], e); continue; }
      if (last && last[2] + step < s) out.push([last[2] + step, 0, s - step]);   // (a gap: nobody's)
      out.push([s, cc, e]);
    }
    const end = out[out.length - 1];
    if (end && end[2] + step <= max) out.push([end[2] + step, 0, max]);   // (past the last range: nobody's)
    return out;
  };
  const A4 = squash(R4, 1, 4294967295), A6 = squash(R6, 1, 18446744073709552000);   // (v6 by its top 64 bits as a double: exact to /53, plenty for countries)
  const buf = Buffer.alloc(16 + A4.length * 6 + A6.length * 10);
  buf.writeUInt32LE(MAGIC, 0); buf.writeUInt32LE(A4.length, 4); buf.writeUInt32LE(A6.length, 8);
  let o = 16;
  for (const r of A4) { buf.writeUInt32LE(r[0] >>> 0, o); o += 4; }
  for (const r of A4) { buf.writeUInt16LE(r[1], o); o += 2; }
  for (const r of A6) { const hi = Math.floor(r[0] / 4294967296), lo = r[0] - hi * 4294967296; buf.writeUInt32LE(hi >>> 0, o); buf.writeUInt32LE(lo >>> 0, o + 4); o += 8; }
  for (const r of A6) { buf.writeUInt16LE(r[1], o); o += 2; }
  return buf;
}
// the packed table (packTable): v4 starts (u32), v6 starts' top 64 bits (two u32), a country each
function readTable(buf) {
  if (!buf || buf.length < 16 || buf.readUInt32LE(0) !== MAGIC) return null;
  const n4 = buf.readUInt32LE(4), n6 = buf.readUInt32LE(8);
  let o = 16;
  const v4 = new Uint32Array(n4), c4 = new Uint16Array(n4), v6h = new Uint32Array(n6), v6l = new Uint32Array(n6), c6 = new Uint16Array(n6);
  for (let i = 0; i < n4; i++, o += 4) v4[i] = buf.readUInt32LE(o);
  for (let i = 0; i < n4; i++, o += 2) c4[i] = buf.readUInt16LE(o);
  for (let i = 0; i < n6; i++, o += 8) { v6h[i] = buf.readUInt32LE(o); v6l[i] = buf.readUInt32LE(o + 4); }
  for (let i = 0; i < n6; i++, o += 2) c6[i] = buf.readUInt16LE(o);
  return { v4, c4, v6h, v6l, c6 };
}
const ccOf = (n) => (n ? String.fromCharCode(n >> 8, n & 255) : null);
// the last start at or below the key (binary search); its country, or null ('ZZ' / unassigned: 0)
function find(starts, codes, key) {
  let lo = 0, hi = starts.length - 1, at = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (starts[m] <= key) { at = m; lo = m + 1; } else hi = m - 1; }
  return at < 0 ? null : ccOf(codes[at]);
}
function find6(T, hi, lo) {
  let a = 0, b = T.v6h.length - 1, at = -1;
  while (a <= b) { const m = (a + b) >> 1; if (T.v6h[m] < hi || (T.v6h[m] === hi && T.v6l[m] <= lo)) { at = m; a = m + 1; } else b = m - 1; }
  return at < 0 ? null : ccOf(T.c6[at]);
}
// an address as a number: v4 (also v4 in v6, ::ffff:a.b.c.d) -> { v: 4, n }, v6 -> { v: 6, hi, lo } (its top 64 bits)
export function parseIp(ip) {
  let s = String(ip || '').trim();
  if (s.startsWith('::ffff:') && s.includes('.')) s = s.slice(7);
  if (/^\d+\.\d+\.\d+\.\d+$/.test(s)) { const p = s.split('.').map(Number); if (p.some((x) => x > 255)) return null; return { v: 4, n: ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3] }; }
  if (!s.includes(':')) return null;
  s = s.split('%')[0];
  const [a, b] = s.split('::'), head = a ? a.split(':') : [], tail = b !== undefined && b ? b.split(':') : [];
  if (s.split('::').length > 2) return null;
  const groups = b === undefined ? head : [...head, ...Array(8 - head.length - tail.length).fill('0'), ...tail];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/i.test(g))) return null;
  const g = groups.map((x) => parseInt(x, 16));
  return { v: 6, hi: ((g[0] << 16) >>> 0) + g[1], lo: ((g[2] << 16) >>> 0) + g[3] };
}

export function createGeo({ dir = null, fetch = null, now = Date.now, log = console } = {}) {
  let T = null, loaded = false;
  const file = dir ? pathJoin(dir, TABLE_FILE) : null;
  function load() {
    loaded = true;
    if (!file || !existsSync(file)) return;
    try { T = readTable(readFileSync(file)); } catch (e) { log.error?.('[geo] the IP table could not be read:', e.message); T = null; }
  }
  function byIp(ip) {
    if (!loaded) load();
    if (!T) return null;
    const a = parseIp(ip);
    if (!a) return null;
    return a.v === 4 ? find(T.v4, T.c4, a.n) : find6(T, a.hi, a.lo);
  }
  function byTz(tz) { const z = TZ.zones[String(tz || '')]; return z ? { c: z[0], r: z[1] && z[1] !== names[z[0]] ? z[1] : undefined } : null; }   // (a region that's the whole country: none)
  function where(ip, tz) {
    const c = byIp(ip), t = byTz(tz);
    if (c) return { c, ...(t && t.c === c && t.r ? { r: t.r } : null), s: 'ip' };
    return t ? { c: t.c, ...(t.r ? { r: t.r } : null), s: 'tz' } : null;
  }
  // this month's DB-IP Lite edition, packed into the table (or last month's, early in a month before the new one is out)
  async function refresh() {
    if (!file || !fetch) return false;
    const d = new Date(now());
    for (const back of [0, 1]) {
      const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - back, 1)), ym = m.toISOString().slice(0, 7);
      try {
        const r = await fetch(`https://download.db-ip.com/free/dbip-country-lite-${ym}.csv.gz`);
        if (!r || !r.ok) continue;
        const csv = gunzipSync(Buffer.from(await r.arrayBuffer())).toString('utf8');
        const bin = packTable(csv);
        writeFileSync(file + '.tmp', bin); renameSync(file + '.tmp', file);
        load();
        log.log?.(`[geo] the IP-to-country table is ${ym}'s (${(bin.length / 1048576).toFixed(1)} MB)`);
        return true;
      } catch (e) { log.error?.('[geo] fetching the IP table failed:', e.message); }
    }
    return false;
  }
  const stale = () => !file || !existsSync(file) || now() - statSync(file).mtimeMs > MAX_AGE_DAYS * 86400e3;
  return { where, byIp, byTz, refresh, stale, get table() { if (!loaded) load(); return !!T; }, credit: 'IP to Country Lite by DB-IP (CC BY 4.0)' };
}
