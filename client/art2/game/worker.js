// Art v2 live renderer: a bake worker (docs/art-v2/GAME-RENDERER.md). It runs the pure recipes off the
// main thread - static-world chunks (chunkbake.js) and the sprites of moving things (actors.js, peds.js)
// - and caches what it makes.
//
// Protocol (pool.js): in  { id, op, args }   out { id, ok: true, result, ms } | { id, ok: false, error }
//   init       { M, lowMem }       WorldData (a structured clone of the client's CityMap); answers with
//                                  which providers loaded
//   bakeChunk  { cx, cy, opt }     -> { cx, cy, g, lights, gh, ms, ... }  (g: the engine's packed planes
//                                  {w,h,ax,ay,p0,p1,p2}, or {w,h,ax,ay,col,nrm,z,emi,flag})
//   sprite     { kind, key, a }    kind: ped (peds.pedSprite) or any actors.SPRITES kind (vehicle, animal, crate,
//                                  bag, ball, proj, train, fx, muzzle, tracer, critter); a: its arguments
//                                  -> { g } (the provider's G-buffer)
//   stats      {}                  cache sizes and timings
//   patch      { props, reset }    world changes, no answer: props [[index, broken {a} | null]] (reset: none broken first)
// Every result's typed arrays are transferred. A provider that throws answers with an error (the host
// falls back); the worker carries on.
import { bakeChunk, loadProviders, SpriteCache, providers as chunkProviders } from './chunkbake.js';
import * as GB from '../gbuf.js';

let M = null, statCache = null, sprCache = null;
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

// a G-buffer as a message: packed into the engine's three planes here (gbuf.js packGBuf: fresh arrays,
// so a cached original stays whole) when this gbuf.js has it, else the five maps (copied if cached)
function pack(g, copy, transfer) {
  if (GB.packGBuf) {
    const pk = GB.packGBuf(g);
    const o = { w: g.w, h: g.h, ax: g.ax || 0, ay: g.ay || 0, p0: pk.p0, p1: pk.p1, p2: pk.p2 };
    transfer.push(pk.p0.buffer, pk.p1.buffer, pk.p2.buffer);
    return o;
  }
  const o = { w: g.w, h: g.h, ax: g.ax || 0, ay: g.ay || 0 };
  for (const k of ['col', 'nrm', 'z', 'emi', 'flag']) { const a = copy ? g[k].slice() : g[k]; o[k] = a; transfer.push(a.buffer); }
  return o;
}

let ready = null;
async function init(args) {
  M = args.M;
  try { const { CityMap } = await import('../../../shared/map.js'); Object.setPrototypeOf(M, CityMap.prototype); } catch (e) { P.errors.map = String((e && e.message) || e); }
  const lowMem = !!args.lowMem;
  statCache = new SpriteCache((lowMem ? 40 : 120) * 1e6);
  sprCache = new SpriteCache((lowMem ? 8 : 32) * 1e6);
  const [pc] = await Promise.all([loadProviders(), loadActors()]);
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
    const r = bakeChunk(M, cx, cy, opt || {}, statCache, chunkProviders);
    const transfer = [];
    const g = pack(r.g, false, transfer);
    transfer.push(r.gh.buffer);
    stats.chunks++; stats.chunkMs += performance.now() - t0;
    self.postMessage({ id, ok: true, result: { cx, cy, g, lights: r.lights, gh: r.gh, live: r.live, n: r.n, items: r.items, made: r.made, bake: r.ms, errors: r.errors }, ms: performance.now() - t0 }, transfer);
    return;
  }
  if (op === 'sprite') {
    const { kind, key, a } = args;
    const fn = kind === 'ped' ? P.peds && P.peds.pedSprite : (P.actors && P.actors.SPRITES && P.actors.SPRITES[kind]) || (SPRITE_FN[kind] && SPRITE_FN[kind]());
    if (!fn) throw new Error(`no provider for ${kind} sprites`);
    const g = key ? sprCache.get(key, () => fn(...a)) : fn(...a);
    if (!g || !g.w) throw new Error(`${kind} provider gave nothing`);
    const transfer = [];
    const out = pack(g, !!key, transfer);
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
