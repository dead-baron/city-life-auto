// Art v2 live renderer: a bake worker (docs/art-v2/GAME-RENDERER.md). It runs the pure recipes off the
// main thread - static-world chunks (chunkbake.js) and the sprites of moving things (actors.js, peds.js)
// - and caches what it makes.
//
// Protocol (pool.js): in  { id, op, args }   out { id, ok: true, result, ms } | { id, ok: false, error }
//   init       { M, lowMem }       WorldData (a structured clone of the client's CityMap); answers with
//                                  which providers loaded
//   init       + artPx (1 | 2): world px per art pixel - chunks and sprites go out at art resolution
//   bakeChunk  { cx, cy, opt }     -> { cx, cy, g, under, lights, gh, ms, ... }  (g: the engine's packed planes
//                                  {w,h,ax,ay,ap,p0,p1,p2} at art resolution; under: the art-resolution under
//                                  layer, or null when the chunk has no buildings); it pauses every few ms
//                                  (chunkbake.bakeSteps), so sprite jobs sent meanwhile run in between
//   sprite     { kind, key, a }    kind: ped (peds.pedSprite) or any actors.SPRITES kind (vehicle, animal, crate,
//                                  bag, ball, proj, train, fx, muzzle, tracer, critter); a: its arguments
//                                  -> { g } (the provider's G-buffer as art-resolution planes)
//   stats      {}                  cache sizes and timings
//   patch      { props, reset }    world changes, no answer: props [[index, broken {a} | null]] (reset: none broken first)
// Every result's typed arrays are transferred. A provider that throws answers with an error (the host
// falls back); the worker carries on.
import { bakeSteps, loadProviders, SpriteCache, providers as chunkProviders } from './chunkbake.js';
import * as GB from '../gbuf.js';

// A pause that lets the messages already waiting for this worker run first (a message to ourselves goes to the
// back of the queue): a bake pauses at each of its yields, so the sprite a thing on screen is waiting for is made
// within a few ms instead of after the whole bake (a second or more on a phone).
const chan = typeof MessageChannel !== 'undefined' ? new MessageChannel() : null, waiting = [];
if (chan) chan.port1.onmessage = () => { const f = waiting.shift(); if (f) f(); };
const pause = () => new Promise((res) => { if (chan) { waiting.push(res); chan.port2.postMessage(0); } else setTimeout(res, 0); });

let M = null, statCache = null, sprCache = null, ART = 2;
const P = { actors: null, peds: null, errors: {} };
const stats = { chunks: 0, chunkMs: 0, sprites: 0, spriteMs: 0, errors: 0 };

async function loadActors() {
  const load = async (name, file) => {
    try { return await import(file); } catch (e) { P.errors[name] = String((e && e.message) || e); return null; }
  };
  [P.actors, P.peds] = await Promise.all([load('actors', './actors.js'), load('peds', './peds.js')]);
}
const SPRITE_FN = {
  vehicle: () => P.actors && P.actors.vehicleSprite, animal: () => P.actors && P.actors.animalSprite,
  crate: () => P.actors && P.actors.crateSprite, bag: () => P.actors && P.actors.bagSprite, ball: () => P.actors && P.actors.ballSprite,
  proj: () => P.actors && P.actors.projSprite, train: () => P.actors && P.actors.trainCarSprite, fx: () => P.actors && P.actors.fxSprite,
  ped: () => P.peds && P.peds.pedSprite,
};

// a G-buffer as a message: packed into the engine's three planes here (gbuf.js packGBuf: fresh arrays, so a
// cached original stays whole) and turned into art pixels (gbuf.js downsample2: 1 art pixel = ART world px) unless
// its provider drew it at that size already (g.ap: the voxel renders); a chunk's "under" layer goes with it
function pack(g, transfer, under = null, run = 0) {
  let pk = GB.packGBuf(g), u = null;
  if (ART > 1 && (g.ap || 1) < ART) {
    const d = GB.downsample2(pk, { run });
    if (under) u = GB.downsampleUnder(under, g.w, g.h, d.pick);
    pk = d;
  } else u = under;
  const o = { w: pk.w, h: pk.h, ax: pk.ax || 0, ay: pk.ay || 0, ap: pk.ap || g.ap || 1, p0: pk.p0, p1: pk.p1, p2: pk.p2 };
  transfer.push(o.p0.buffer, o.p1.buffer, o.p2.buffer);
  if (u) transfer.push(u.buffer);
  return { o, u };
}

let ready = null;
async function init(args) {
  M = args.M; ART = args.artPx === 1 ? 1 : 2;
  try { const { CityMap } = await import('../../../shared/map.js'); Object.setPrototypeOf(M, CityMap.prototype); } catch (e) { P.errors.map = String((e && e.message) || e); }
  const lowMem = !!args.lowMem;
  statCache = new SpriteCache((lowMem ? 40 : (args.workers || 3) >= 4 ? 90 : 120) * 1e6); // (four workers: a little less each)
  sprCache = new SpriteCache((lowMem ? 8 : 32) * 1e6);
  const [pc] = await Promise.all([loadProviders(), loadActors()]);
  if (P.actors && P.actors.setArtPx) P.actors.setArtPx(ART);   // (voxel things render straight at the art pixel)
  return { ground: pc.ground, statics: pc.statics, actors: !!P.actors, peds: !!P.peds, errors: { ...pc.errors, ...P.errors } };
}

async function handle(msg) {
  const { id, op, args } = msg;
  const t0 = performance.now();
  if (op === 'init') {
    ready = init(args);
    const result = await ready;
    self.postMessage({ id, ok: true, result, ms: performance.now() - t0 });
    return;
  }
  if (ready) await ready; // (jobs that arrive while the providers load wait for them)
  if (op === 'patch') { // the world changed (props smashed or put back): no answer
    if (M && args.reset) for (const pr of M.props || []) delete pr.broken;
    if (M) for (const [i, br] of args.props || []) { const pr = M.props[i]; if (!pr) continue; if (br) pr.broken = br; else delete pr.broken; }
    return;
  }
  if (!M && op !== 'stats') throw new Error('worker not initialised');
  if (op === 'bakeChunk') {
    const { cx, cy, opt } = args;
    const it = bakeSteps(M, cx, cy, { ...(opt || {}), artPx: ART }, statCache, chunkProviders);
    let step = it.next();
    while (!step.done) { await pause(); step = it.next(); }
    const r = step.value;
    const transfer = [];
    // (the under layer only matters where there are buildings to fade)
    const { o: g, u: under } = pack(r.g, transfer, r.under && r.blds && r.blds.length ? r.under : null, GB.CHUNK_RUN);
    transfer.push(r.gh.buffer);
    stats.chunks++; stats.chunkMs += performance.now() - t0;
    self.postMessage({ id, ok: true, result: { cx, cy, g, under, blds: r.blds || [], lights: r.lights, gh: r.gh, live: r.live, n: r.n, items: r.items, made: r.made, bake: r.ms, errors: r.errors }, ms: performance.now() - t0 }, transfer);
    return;
  }
  if (op === 'sprite') {
    const { kind, key, a } = args;
    const fn = kind === 'ped' ? P.peds && P.peds.pedSprite : (P.actors && P.actors.SPRITES && P.actors.SPRITES[kind]) || (SPRITE_FN[kind] && SPRITE_FN[kind]());
    if (!fn) throw new Error(`no provider for ${kind} sprites`);
    const g = key ? sprCache.get(key, () => fn(...a)) : fn(...a);
    if (!g || !g.w) throw new Error(`${kind} provider gave nothing`);
    const transfer = [];
    const out = pack(g, transfer).o;
    stats.sprites++; stats.spriteMs += performance.now() - t0;
    self.postMessage({ id, ok: true, result: { g: out }, ms: performance.now() - t0 }, transfer);
    return;
  }
  if (op === 'stats') {
    self.postMessage({ id, ok: true, result: { ...stats, statBytes: statCache ? statCache.bytes : 0, statN: statCache ? statCache.m.size : 0, sprBytes: sprCache ? sprCache.bytes : 0, sprN: sprCache ? sprCache.m.size : 0 }, ms: 0 });
    return;
  }
  throw new Error(`unknown op ${op}`);
}

self.onmessage = (e) => {
  const msg = e.data;
  handle(msg).catch((err) => {
    stats.errors++;
    self.postMessage({ id: msg && msg.id, ok: false, error: String((err && err.stack) || err) });
  });
};
