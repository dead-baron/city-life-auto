// The art from the server (2026-10-08; the user's Pixel 7 Pro on Medium: new places showed their stand-ins for a while,
// most on the train). A phone takes a second or more to bake a chunk; at a train's or a fast car's speed the view needs
// about three new ones a second, more than four workers bake. So the server bakes the world's chunks itself, in the
// background, with the page's own bake code (server/artbake.js runs client/art2's chunk bake in a worker thread at the
// lowest priority), keeps them as files and serves them; a page downloads a chunk (about 250 KB) instead of baking it.
//
//   GET /art/<art>/<q>/<ap>/<cx>/<cy>[?pre=1]  ->  200 the chunk (artbake.js's file: chunkstore.js packChunk, gzipped)
//                                      ->  404 not baked yet (asked for: it's baked before the background work goes on;
//                                          x-art-eta says when), or another build's art (the page bakes it itself)
//                                      ->  200 + x-art-stale: the build before this one's chunk, while this one's is baked
//   A page on the build before this one gets its own chunks (kept until the next build). pre=1: a page looking ahead -
//   never queued, no stand-in. Round the players online (focus) the chunks are baked first after the asks.
//
// art is version.json's art hash, the key the pages keep their baked chunks under (a new build of the bake code or the
// world is a new hash: everything is baked afresh, the old files deleted). Client-only pushes don't restart the
// server: when version.json's art changes on disk, the bake threads start again on the new code. In the background,
// every chunk of the map for the qualities in PREWARM, the busiest first (towns before the country, the country before
// open sea). What pages ask for goes to the front of the queue. CLA_ART_THREADS bake threads (0: off).
import { Worker } from 'node:worker_threads';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, createReadStream, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cpus } from 'node:os';
import { MAP_W, MAP_H, TILE } from '../shared/constants.js';

const CHUNK = 768;                                // (client/art2/game/chunkbake.js CHUNK: the art's chunks, not the net's)
const CX = Math.ceil((MAP_W * TILE) / CHUNK), CY = Math.ceil((MAP_H * TILE) / CHUNK);
const ASK_MAX = 400;                              // chunks asked for and waiting, at most (the oldest go)
const FOCUS_R = 4;                                // chunks round each player baked first after the asks (a 9 x 9 square)
const FOCUS_Q_MS = 10 * 60000;                    // a quality pages asked for in the last ten minutes is baked round players too

export function createArtCdn({ map, root, dataDir, seed, threads = defaultThreads(), prewarm = defaultPrewarm(), log = console.log, onBytes = null } = {}) {
  const S = {
    art: null, dir: null, prev: null, prevDir: null, workers: [], idle: [], asked: [], askedSet: new Set(), pre: [], preAt: 0, inflight: new Map(),
    done: new Set(), focus: [], qSeen: new Map(),
    stats: { baked: 0, bakeMs: 0, served: 0, servedBytes: 0, missed: 0, errors: 0, stale: 0, focusBaked: 0, startedAt: Date.now() }, threads, stopped: false,
  };
  const keyOf = (q, ap, cx, cy) => `${q}/${ap}/${cx}/${cy}`;
  const fileOf = (q, ap, cx, cy, dir = S.dir) => join(dir, `q${q}a${ap}`, `${cx}_${cy}.bin`);
  const onDisk = (key, file) => { if (S.done.has(key)) return true; if (existsSync(file)) { S.done.add(key); return true; } return false; };
  const readArt = () => { try { return JSON.parse(readFileSync(join(root, 'version.json'), 'utf8')).art || null; } catch { return null; } };

  // the order the background bakes go in: the busiest chunks first (places, then roads, then land), open sea last
  const order = (() => {
    const score = new Float64Array(CX * CY);
    for (const p of map.pois || []) { const cx = Math.floor(p.x / CHUNK), cy = Math.floor(p.y / CHUNK); if (cx >= 0 && cy >= 0 && cx < CX && cy < CY) score[cy * CX + cx] += 40; }
    for (const e of map.edges || []) for (const pt of e.pts || []) { const cx = Math.floor(pt.x / CHUNK), cy = Math.floor(pt.y / CHUNK); if (cx >= 0 && cy >= 0 && cx < CX && cy < CY) score[cy * CX + cx] += 1; }
    for (let cy = 0; cy < CY; cy++) for (let cx = 0; cx < CX; cx++) {
      let land = 0;
      for (let y = cy * CHUNK + 32; y < (cy + 1) * CHUNK; y += 96) for (let x = cx * CHUNK + 32; x < (cx + 1) * CHUNK; x += 96) if (!map.isWater(x, y)) land++;
      score[cy * CX + cx] += land * 0.5 + (land ? 10 : 0);
    }
    const all = [];
    for (let i = 0; i < CX * CY; i++) all.push(i);
    return all.sort((a, b) => score[b] - score[a]);
  })();

  function start() {
    S.art = readArt();
    S.done = new Set();
    if (!S.art || !threads) return;
    S.dir = join(dataDir, 'art', S.art);
    mkdirSync(S.dir, { recursive: true });
    // The build before this one is kept (the newest of the others): its chunks go to the pages still on it, and to
    // everyone as stand-ins while this build's are baked (handle). Older builds' art goes.
    S.prev = null; S.prevDir = null;
    try {
      const others = readdirSync(join(dataDir, 'art')).filter((d) => d !== S.art).map((d) => { let t = 0; try { t = statSync(join(dataDir, 'art', d)).mtimeMs; } catch { /* gone */ } return [d, t]; }).sort((a, b) => b[1] - a[1]);
      if (others.length) { S.prev = others[0][0]; S.prevDir = join(dataDir, 'art', S.prev); }
      for (const [d] of others.slice(1)) rmSync(join(dataDir, 'art', d), { recursive: true, force: true });
    } catch { /* best effort */ }
    S.pre = [];
    for (const q of prewarm) for (const i of order) S.pre.push([q, 2, i % CX, Math.floor(i / CX)]);
    for (let i = 0; i < threads; i++) spawn();
    log(`[art] serving chunks of art ${S.art} from ${S.dir} (${threads} bake thread${threads === 1 ? '' : 's'}; background: quality ${prewarm.join(', ')})`);
  }
  function spawn() {
    const w = new Worker(new URL('./artbake.js', import.meta.url), { workerData: { root, seed } });
    const slot = { w, ready: false, job: null, art: S.art };
    w.on('message', (m) => {
      if (m.ready) { slot.ready = true; S.idle.push(slot); pump(); return; }
      const job = slot.job; slot.job = null;
      if (job) S.inflight.delete(job.key);
      if (m.ok) { S.stats.baked++; S.stats.bakeMs += m.ms; if (job) { S.done.add(job.key); if (job.focus) S.stats.focusBaked++; } } else { S.stats.errors++; if (S.stats.errors < 20) log(`[art] bake failed ${m.q}/${m.ap}/${m.cx},${m.cy}: ${m.error}`); }
      if (slot.art === S.art && !S.stopped) { S.idle.push(slot); pump(); }
    });
    w.on('error', (e) => { log(`[art] bake thread failed: ${e && e.message}`); S.idle = S.idle.filter((s) => s !== slot); S.workers = S.workers.filter((s) => s !== slot); if (slot.job) S.inflight.delete(slot.job.key); });
    w.on('exit', () => { S.workers = S.workers.filter((s) => s !== slot); S.idle = S.idle.filter((s) => s !== slot); });
    w.unref();
    S.workers.push(slot);
  }
  // the next chunk to bake: one asked for (newest first); else round the players online, nearest first (focus); else the
  // background's next one not on disk
  function next() {
    while (S.asked.length) {
      const j = S.asked.pop(); S.askedSet.delete(j.key);
      if (!S.inflight.has(j.key) && !onDisk(j.key, j.file)) return j;
    }
    const f = nextFocus();
    if (f) return f;
    while (S.pre.length) {
      const [q, ap, cx, cy] = S.pre.shift(), key = keyOf(q, ap, cx, cy), file = fileOf(q, ap, cx, cy);
      if (!S.inflight.has(key) && !onDisk(key, file)) return { key, q, ap, cx, cy, file };
    }
    return null;
  }
  // round the players (focus: their positions, world px), ring by ring, for the background qualities and any a page asked
  // for lately - so after a new build the art where people are comes back first
  function nextFocus() {
    if (!S.focus.length) return null;
    const now = Date.now(), qs = new Set(prewarm);
    for (const [q, t] of S.qSeen) if (now - t < FOCUS_Q_MS) qs.add(q);
    for (let r = 0; r <= FOCUS_R; r++) for (const p of S.focus) {
      const pcx = Math.floor(p.x / CHUNK), pcy = Math.floor(p.y / CHUNK);
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const cx = pcx + dx, cy = pcy + dy;
        if (cx < 0 || cy < 0 || cx >= CX || cy >= CY) continue;
        for (const q of qs) {
          const key = keyOf(q, 2, cx, cy);
          if (S.inflight.has(key)) continue;
          const file = fileOf(q, 2, cx, cy);
          if (!onDisk(key, file)) return { key, q, ap: 2, cx, cy, file, focus: true };
        }
      }
    }
    return null;
  }
  // where the players are now (server/index.js, every few seconds): world px
  function focus(points) {
    S.focus = (points || []).filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y)).slice(0, 48);
    if (S.focus.length) pump();
  }
  function pump() {
    while (S.idle.length) {
      const j = next();
      if (!j) return;
      const slot = S.idle.shift();
      slot.job = j; S.inflight.set(j.key, j);
      slot.w.postMessage({ cx: j.cx, cy: j.cy, q: j.q, ap: j.ap, file: j.file });
    }
  }
  // a new build of the art on disk (a client-only push: the server wasn't restarted): the threads start again on its code
  function rebuild() {
    const art = readArt();
    if (!art || art === S.art) return;
    log(`[art] new art ${art} (was ${S.art}): baking afresh`);
    for (const s of S.workers) { try { s.w.terminate(); } catch { /* gone */ } }
    S.workers = []; S.idle = []; S.asked = []; S.askedSet.clear(); S.inflight.clear();
    start();
  }

  // GET /art/<art>/<q>/<ap>/<cx>/<cy>[?pre=1]: true when it was ours to answer. A chunk not baked yet is asked for (to the
  // front of the queue) unless it's only a page looking ahead (pre=1: a guess, not what someone is looking at - those
  // would push the chunks people see down the queue); the 404 says when it should be ready (x-art-eta, ms), so the page
  // can wait for it when that beats baking it itself (worker.js).
  function handle(path, req, res) {
    if (!path.startsWith('/art/')) return false;
    const qi = path.indexOf('?'), pre = qi >= 0 && /[?&]pre=1\b/.test(path.slice(qi));
    if (qi >= 0) path = path.slice(0, qi);
    const m = /^\/art\/([0-9a-f]{6,40})\/([0-3])\/([12])\/(\d{1,3})\/(\d{1,3})$/.exec(path);
    const head = { 'access-control-allow-origin': '*', 'cache-control': 'no-store', 'access-control-expose-headers': 'x-art-eta, x-art-stale' };
    const serve = (st, file, extra = null) => {
      S.stats.served++; S.stats.servedBytes += st.size;
      if (onBytes) onBytes(st.size + 300);
      res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': st.size, 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=31536000, immutable', ...extra });
      // (the file can go between the look and the read - an old build's, cleared away: the page gets a cut-short answer
      // it reads as a miss, never a crash here)
      const rs = createReadStream(file);
      rs.on('error', () => { try { if (res.destroy) res.destroy(); else res.end(); } catch { /* gone */ } });
      rs.pipe(res);
      return true;
    };
    const statOf = (file) => { try { return statSync(file); } catch { return null; } };
    if (!m || !S.art || !S.dir) { res.writeHead(404, head); res.end(); S.stats.missed++; return true; }
    const q = +m[2], ap = +m[3], cx = +m[4], cy = +m[5];
    if (cx >= CX || cy >= CY) { res.writeHead(404, head); res.end(); return true; }
    // a page still on the build before this one: its own chunks, while they're kept (never baked again)
    if (m[1] !== S.art) {
      const pf = S.prevDir && m[1] === S.prev ? fileOf(q, ap, cx, cy, S.prevDir) : null, ps = pf ? statOf(pf) : null;
      if (ps) return serve(ps, pf);
      res.writeHead(404, head); res.end(); S.stats.missed++; return true;
    }
    S.qSeen.set(q, Date.now());
    const file = fileOf(q, ap, cx, cy), st = statOf(file);
    if (st) { S.done.add(keyOf(q, ap, cx, cy)); return serve(st, file); }
    // not baked yet: to the front of the queue (unless it's being baked now, or this is only a look ahead)
    const key = keyOf(q, ap, cx, cy);
    if (!pre && !S.inflight.has(key) && !S.askedSet.has(key) && S.workers.length) {
      S.asked.push({ key, q, ap, cx, cy, file }); S.askedSet.add(key);
      if (S.asked.length > ASK_MAX) { const old = S.asked.shift(); S.askedSet.delete(old.key); }
      pump();
    }
    S.stats.missed++;
    const eta = etaOf(key), etaH = eta > 0 ? { 'x-art-eta': String(eta) } : null;
    // meanwhile the build before this one's chunk stands in (marked stale: the page shows it, keeps nothing, and its own
    // bake or this build's download replaces it) - not for a look ahead
    if (!pre && S.prevDir) {
      const pf = fileOf(q, ap, cx, cy, S.prevDir), ps = statOf(pf);
      if (ps) { S.stats.stale++; return serve(ps, pf, { 'cache-control': 'no-store', 'x-art-stale': '1', 'access-control-expose-headers': 'x-art-eta, x-art-stale', ...etaH }); }
    }
    res.writeHead(404, etaH ? { ...head, ...etaH } : head); res.end();
    return true;
  }
  // when a chunk not on disk should be: being baked now - most of a bake to go; asked for - a bake for each thread's worth
  // of the asks before it (they're taken newest first) and its own; neither - 0 (it isn't coming)
  function etaOf(key) {
    const avg = S.stats.baked ? S.stats.bakeMs / S.stats.baked : 2500, th = Math.max(1, S.workers.length);
    if (S.inflight.has(key)) return Math.round(avg * 0.7);
    if (!S.askedSet.has(key)) return 0;
    let ahead = 0;
    for (let i = S.asked.length - 1; i >= 0 && S.asked[i].key !== key; i--) ahead++;
    return Math.round(avg * (1 + (ahead + S.inflight.size) / th));
  }
  // how far the background is (for /stats)
  function summary() {
    const s = S.stats;
    let have = 0;
    try { for (const q of prewarm) have += readdirSync(join(S.dir, `q${q}a2`)).filter((f) => f.endsWith('.bin')).length; } catch { /* none yet */ }
    return { art: S.art, prev: S.prev, threads: S.workers.length, baked: s.baked, avgBakeMs: s.baked ? Math.round(s.bakeMs / s.baked) : 0, have, of: CX * CY * prewarm.length, served: s.served, servedMB: +(s.servedBytes / 1e6).toFixed(1), missed: s.missed, stale: s.stale, asked: S.asked.length, focus: S.focus.length, focusBaked: s.focusBaked, qualities: [...S.qSeen.keys()], errors: s.errors };
  }
  function stop() { S.stopped = true; for (const s of S.workers) { try { s.w.terminate(); } catch { /* gone */ } } S.workers = []; }

  start();
  return { handle, rebuild, summary, stop, focus, get art() { return S.art; }, _state: S, _next: next };
}

// The qualities baked in the background (CLA_ART_PREWARM, e.g. "1,2": Medium then High); the rest only when asked for
function defaultPrewarm() {
  const env = process.env.CLA_ART_PREWARM;
  const qs = (env === undefined ? '1' : env).split(',').map((s) => Number(s.trim())).filter((q) => q >= 0 && q <= 3 && Number.isInteger(q));
  return [...new Set(qs)];
}
// One bake thread on a small server (the game's tick has the other core), two on four cores or more, none on one.
function defaultThreads() {
  const env = process.env.CLA_ART_THREADS;
  if (env !== undefined && env !== '') return Math.max(0, Number(env) || 0);
  const n = cpus().length;
  return n >= 4 ? 2 : n >= 2 ? 1 : 0;
}
export const ART_CHUNKS = { CX, CY, CHUNK };
