// The capture server (the owner, 2026-11-13: trailers and TikTok clips from the scene director's scripts): the same server
// code, started with CLA_CAPTURE=1 on its own port - a private instance, nobody else on it, always the build the live one
// runs (on the Oracle box: deploy/cla-capture.service, a second service from the same checkout).
//   - Deterministic: Math.random is a seeded generator from the moment this module loads (server/index.js imports it
//     first), the world's day and clock start fixed, and the world doesn't tick on its own - the capture driver steps it
//     (tools/capture.mjs: /capture/step), in lockstep with the page's frames. Same seed, same scene: the same take.
//   - Private: these routes answer the machine itself only (127.0.0.1); the server listens there unless HOST says
//     otherwise; dev mode is on (the scenes are the debug menu's).
//   - The pages that join are cameras: no first-time experience (ftue.js), their own character hidden and out of the way
//     (director.js watch: capView), their inputs not acted on.
// Routes (GET, JSON): /capture/state - the tick, who's joined, the scenes running; /capture/step?n= - the world n ticks
// on; /capture/start?id=&seed= - a scene now, every joined page its camera (seed: Math.random reseeded first, so the
// take doesn't depend on how long the pages took to load; hold=1: held at its first moment until /capture/go);
// /capture/go - the held scene's clock running from this tick; /capture/stop - every scene over.
import { mulberry32 } from '../shared/rng.js';

export const CAPTURE = process.env.CLA_CAPTURE === '1';
const SEED = Number(process.env.CLA_SEED || 1337) >>> 0;
export function seedRandom(seed) { const r = mulberry32((seed >>> 0) ^ 0x9e3779b9); Math.random = r; return r; }
if (CAPTURE) seedRandom(SEED);

const json = (res, code, o) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(o)); };
const local = (req) => { const a = (req.socket && req.socket.remoteAddress) || ''; return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1'; };

// the driver's routes: true when the request was one of them
export async function captureHttp(world, req, res, url) {
  if (!url.pathname.startsWith('/capture/')) return false;
  if (!CAPTURE || !local(req)) { res.writeHead(404); res.end(); return true; }
  const director = await import('./systems/director.js');
  const q = url.searchParams, what = url.pathname.slice('/capture/'.length);
  const viewers = () => [...world.players.values()].filter((p) => p.conn && p.ped);
  const runInfo = () => director.runsOf(world).map((r) => ({ id: r.id, seq: r.seq, t: +((world.tick - r.tick0) / 20).toFixed(2), len: r.sc.len, beats: r.beats.map((B) => B.st[0]).join(''), cast: Object.fromEntries([...r.cast].map(([cid, A]) => { const e = world.get(A.id); return [cid, e && !e.removed ? [Math.round(e.x * 10) / 10, Math.round(e.y * 10) / 10] : null]; })) }));
  try {
    if (what === 'state') return json(res, 200, { tick: world.tick, time: world.time, players: viewers().map((p) => ({ name: p.name, x: Math.round(p.ped.x), y: Math.round(p.ped.y), cap: !!p.capView })), runs: runInfo(), last: world.dirLast || null }), true;
    if (what === 'step') {
      const n = Math.max(1, Math.min(200, Number(q.get('n')) || 1));
      for (let i = 0; i < n; i++) { try { world.step(); } catch (e) { console.error('[capture] tick error', e); } }
      return json(res, 200, { tick: world.tick, runs: runInfo(), last: world.dirLast || null }), true;
    }
    if (what === 'start') {
      if (q.has('seed')) { const r = seedRandom(Number(q.get('seed')) || 0); world.rand = r; }
      director.stopAll(world);
      const vs = viewers();
      const r = director.start(world, String(q.get('id') || ''), { mode: 'capture', viewer: vs[0] || null, hold: q.get('hold') === '1' });
      if (r.err) return json(res, 400, { err: r.err }), true;
      for (const p of vs.slice(1)) director.watch(world, r.run, p);
      return json(res, 200, { ok: true, seq: r.run.seq, tick0: r.run.tick0, len: r.run.sc.len, viewers: vs.length, anchors: r.run.anchors }), true;
    }
    if (what === 'go') { director.go(world); return json(res, 200, { ok: true, tick: world.tick }), true; }
    if (what === 'stop') { director.stopAll(world); return json(res, 200, { ok: true }), true; }
    return json(res, 404, { err: 'no such route' }), true;
  } catch (e) {
    console.error('[capture]', e);
    return json(res, 500, { err: String(e && e.message) }), true;
  }
}
