// The art from the server (2026-10-08; the user's Pixel 7 Pro on Medium: new places showed their stand-ins for a while,
// most on the train). A phone takes a second or more to bake a chunk; at a train's or a fast car's speed the view needs
// about three new ones a second, more than four workers bake. So the server bakes the world's chunks itself, in the
// background, with the page's own bake code (server/artbake.js runs client/art2's chunk bake in a worker thread at the
// lowest priority), keeps them as files and serves them; a page downloads a chunk (about 250 KB) instead of baking it.
//
//   GET /art/<art>/<q>/<ap>/<cx>/<cy>  ->  200 the chunk (artbake.js's file: chunkstore.js packChunk, gzipped)
//                                      ->  404 not baked yet (asked for: it's baked before the background work goes on),
//                                          or another build's art (the page bakes it itself, as before)
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

export function createArtCdn({ map, root, dataDir, seed, threads = defaultThreads(), prewarm = defaultPrewarm(), log = console.log, onBytes = null } = {}) {
  const S = {
    art: null, dir: null, workers: [], idle: [], asked: [], askedSet: new Set(), pre: [], preAt: 0, inflight: new Map(),
    stats: { baked: 0, bakeMs: 0, served: 0, servedBytes: 0, missed: 0, errors: 0, startedAt: Date.now() }, threads, stopped: false,
  };
  const keyOf = (q, ap, cx, cy) => `${q}/${ap}/${cx}/${cy}`;
  const fileOf = (q, ap, cx, cy) => join(S.dir, `q${q}a${ap}`, `${cx}_${cy}.bin`);
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
    if (!S.art || !threads) return;
    S.dir = join(dataDir, 'art', S.art);
    mkdirSync(S.dir, { recursive: true });
    // other builds' art goes
    try { for (const d of readdirSync(join(dataDir, 'art'))) if (d !== S.art) rmSync(join(dataDir, 'art', d), { recursive: true, force: true }); } catch { /* best effort */ }
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
      if (m.ok) { S.stats.baked++; S.stats.bakeMs += m.ms; } else { S.stats.errors++; if (S.stats.errors < 20) log(`[art] bake failed ${m.q}/${m.ap}/${m.cx},${m.cy}: ${m.error}`); }
      if (slot.art === S.art && !S.stopped) { S.idle.push(slot); pump(); }
    });
    w.on('error', (e) => { log(`[art] bake thread failed: ${e && e.message}`); S.idle = S.idle.filter((s) => s !== slot); S.workers = S.workers.filter((s) => s !== slot); if (slot.job) S.inflight.delete(slot.job.key); });
    w.on('exit', () => { S.workers = S.workers.filter((s) => s !== slot); S.idle = S.idle.filter((s) => s !== slot); });
    w.unref();
    S.workers.push(slot);
  }
  // the next chunk to bake: one asked for (newest first), else the background's next one not on disk
  function next() {
    while (S.asked.length) {
      const j = S.asked.pop(); S.askedSet.delete(j.key);
      if (!S.inflight.has(j.key) && !existsSync(j.file)) return j;
    }
    while (S.pre.length) {
      const [q, ap, cx, cy] = S.pre.shift(), key = keyOf(q, ap, cx, cy), file = fileOf(q, ap, cx, cy);
      if (!S.inflight.has(key) && !existsSync(file)) return { key, q, ap, cx, cy, file };
    }
    return null;
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

  // GET /art/<art>/<q>/<ap>/<cx>/<cy>: true when it was ours to answer
  function handle(path, req, res) {
    if (!path.startsWith('/art/')) return false;
    const m = /^\/art\/([0-9a-f]{6,40})\/([0-3])\/([12])\/(\d{1,3})\/(\d{1,3})$/.exec(path);
    const head = { 'access-control-allow-origin': '*', 'cache-control': 'no-store' };
    // (not serving: another build's art, or no bake threads - CLA_ART_THREADS=0 - so no files either)
    if (!m || !S.art || !S.dir || m[1] !== S.art) { res.writeHead(404, head); res.end(); S.stats.missed++; return true; }
    const q = +m[2], ap = +m[3], cx = +m[4], cy = +m[5];
    if (cx >= CX || cy >= CY) { res.writeHead(404, head); res.end(); return true; }
    const file = fileOf(q, ap, cx, cy);
    let st = null;
    try { st = statSync(file); } catch { st = null; }
    if (!st) {
      // not baked yet: to the front of the queue (unless it's being baked now)
      const key = keyOf(q, ap, cx, cy);
      if (!S.inflight.has(key) && !S.askedSet.has(key) && S.workers.length) {
        S.asked.push({ key, q, ap, cx, cy, file }); S.askedSet.add(key);
        if (S.asked.length > ASK_MAX) { const old = S.asked.shift(); S.askedSet.delete(old.key); }
        pump();
      }
      S.stats.missed++;
      res.writeHead(404, head); res.end();
      return true;
    }
    S.stats.served++; S.stats.servedBytes += st.size;
    if (onBytes) onBytes(st.size + 300);
    res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': st.size, 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=31536000, immutable' });
    createReadStream(file).pipe(res);
    return true;
  }
  // how far the background is (for /stats)
  function summary() {
    const s = S.stats;
    let have = 0;
    try { for (const q of prewarm) have += readdirSync(join(S.dir, `q${q}a2`)).filter((f) => f.endsWith('.bin')).length; } catch { /* none yet */ }
    return { art: S.art, threads: S.workers.length, baked: s.baked, avgBakeMs: s.baked ? Math.round(s.bakeMs / s.baked) : 0, have, of: CX * CY * prewarm.length, served: s.served, servedMB: +(s.servedBytes / 1e6).toFixed(1), missed: s.missed, asked: S.asked.length, errors: s.errors };
  }
  function stop() { S.stopped = true; for (const s of S.workers) { try { s.w.terminate(); } catch { /* gone */ } } S.workers = []; }

  start();
  return { handle, rebuild, summary, stop, get art() { return S.art; }, _state: S };
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
