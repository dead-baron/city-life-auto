// The city from the server (World v3 part 8, stage 1: docs/WORLD-V3.md). Every browser used to build the city from the
// seed (client/worldgen.js, 4-10 s on a phone) the first time it saw a new world; the server has built it already, so it
// cuts it into region files (shared/regionpack.js) and serves them, and the page's city worker downloads them instead
// (about 2 MB gzipped for today's world), building only when it can't get them. The route World v3 needs: a phone never
// builds a 5 x 4 km world.
//
//   GET /world/<world>/<seed>/index.bin       -> 200 the index (gzipped; immutable: the URL has the world's hash)
//   GET /world/<world>/<seed>/r<x>-<y>.bin    -> 200 a region file (gzipped)
//                                             -> 404 + x-world-miss: hash (another build's world) | seed | packing (not
//                                                written yet) | file (no such file)
//
// world is version.json's world hash (tools/stamp-version.mjs: the generator's code), the key browsers keep the city
// under (client/worldcache.js). The cut is taken from the city as generated, before the World runs (the running world
// changes the map: smashed props' and gates' solid entries, cell doors, smash.js's break grid), then gzipped and written
// to <dataDir>/world/<world>-<seed>/ in the background (older builds' folders deleted).
import { mkdirSync, readdirSync, rmSync, createReadStream, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { gzip } from 'node:zlib';
import { packRegions } from '../shared/regionpack.js';

const FILE = /^(index|r\d{1,2}-\d{1,2})\.bin$/;

// the cut, now (city: the CityMap or cityData; it must not have run yet): { pack, ms }
export function cutWorld(city, meta) {
  const t0 = performance.now();
  const pack = packRegions(city, { meta });
  return { pack, ms: Math.round(performance.now() - t0) };
}

// cut: what cutWorld returned; world: version.json's world hash (read from root when not given); delayMs: the gzip and
// the writing wait this long (the server's first ticks and the players reconnecting after a restart go first)
export function createWorldCdn({ cut, root, dataDir, seed, world = null, delayMs = 0, log = console.log, onBytes = null } = {}) {
  const S = { world: world || readWorld(root), seed: seed >>> 0, dir: null, state: 'packing', files: new Map(), ms: { cut: cut ? cut.ms : 0, gzip: 0, write: 0 }, bytes: 0, served: 0, servedBytes: 0, missed: 0, error: null };
  const ready = (async () => {
    if (!S.world || !cut) { S.state = 'off'; return; }
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs).unref());
    try {
      const base = join(dataDir, 'world');
      S.dir = join(base, `${S.world}-${S.seed}`);
      mkdirSync(S.dir, { recursive: true });
      try { for (const d of readdirSync(base)) if (join(base, d) !== S.dir) rmSync(join(base, d), { recursive: true, force: true }); } catch { /* best effort */ }
      const list = [['index.bin', cut.pack.index], ...cut.pack.regions.map((r) => [`${r.key}.bin`, r.bytes])];
      let t0 = performance.now();
      const zs = await Promise.all(list.map(([, b]) => new Promise((res, rej) => gzip(b, { level: 9 }, (e, z) => (e ? rej(e) : res(z))))));
      S.ms.gzip = Math.round(performance.now() - t0); t0 = performance.now();
      list.forEach(([name], i) => {
        const file = join(S.dir, name), tmp = `${file}.tmp`;
        writeFileSync(tmp, zs[i]); renameSync(tmp, file);
        S.files.set(name, { file, size: zs[i].length }); S.bytes += zs[i].length;
      });
      S.ms.write = Math.round(performance.now() - t0);
      cut.pack = null;   // (the raw cut goes: the files serve now)
      S.state = 'ready';
      log(`[world] serving the city as ${S.files.size} region files, ${(S.bytes / 1e6).toFixed(2)} MB gzipped (cut ${S.ms.cut} ms, gzip ${S.ms.gzip} ms, write ${S.ms.write} ms) from ${S.dir}`);
    } catch (e) {
      S.state = 'failed'; S.error = String((e && e.message) || e);
      log(`[world] not serving the city: ${S.error}`);
    }
  })();

  // true when it was ours to answer
  function handle(path, req, res) {
    if (!path.startsWith('/world/')) return false;
    const qi = path.indexOf('?');
    if (qi >= 0) path = path.slice(0, qi);
    const m = /^\/world\/([0-9a-f]{6,40})\/(\d{1,10})\/([^/]+)$/.exec(path);
    const miss = (why) => { S.missed++; res.writeHead(404, { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'x-world-miss', 'cache-control': 'no-store', 'x-world-miss': why }); res.end(); return true; };
    if (!m || !FILE.test(m[3])) return miss('file');
    if (m[1] !== S.world) return miss('hash');
    if ((+m[2] >>> 0) !== S.seed || String(+m[2]) !== m[2]) return miss('seed');
    if (S.state !== 'ready') return miss('packing');
    const f = S.files.get(m[3]);
    if (!f) return miss('file');
    S.served++; S.servedBytes += f.size;
    if (onBytes) onBytes(f.size + 300);
    res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': f.size, 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=31536000, immutable' });
    const rs = createReadStream(f.file);
    rs.on('error', () => { try { if (res.destroy) res.destroy(); else res.end(); } catch { /* gone */ } });
    rs.pipe(res);
    return true;
  }
  function summary() {
    return { world: S.world, seed: S.seed, state: S.state, files: S.files.size, MB: +(S.bytes / 1e6).toFixed(2), ms: S.ms, served: S.served, servedMB: +(S.servedBytes / 1e6).toFixed(1), missed: S.missed, error: S.error || undefined };
  }
  return { handle, summary, ready, get state() { return S.state; }, get world() { return S.world; }, _state: S };
}

function readWorld(root) { try { return JSON.parse(readFileSync(join(root, 'version.json'), 'utf8')).world || null; } catch { return null; } }
