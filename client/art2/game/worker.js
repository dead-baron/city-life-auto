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
//   init       + cacheMB, sprMB, modelMB: what the caches may hold (pool.js cacheBudget: far less on a phone)
//   init       + artKey, keepCap, tidy: baked chunks are kept in the browser (chunkstore.js) under artKey (version.json's
//              hash of the art), at most keepCap of them; one worker (tidy) drops other builds' and the oldest
//   bakeChunk  + ck: the chunk's key in that store - served from it when it's there, kept once baked; what players
//              changed near it (props broken, campfires lit or put out: the patches below) is part of the key
//   prebakeChunk { cx, cy, opt, ck } -> { kept }: baked into the store only (host.js _prebake: the chunks round you and on
//              the roads ahead, while there is nothing more urgent) - nothing comes back but whether it is kept now;
//              { kept: true, had: true } when it was there already
//   peekChunk  { cx, cy, ck } -> the kept chunk as bakeChunk gives it, exact: true when it is just as the world is now
//              (exact: false: kept with other props broken - a stand-in until the bake), or { none: true }
//   init       { key } instead of M: the city this browser keeps (client/worldcache.js) - read here, in parallel with
//              the other workers, instead of copied over by the page; answers needWorld: true when it isn't there,
//              and waits for a 'world' { M } (everything sent meanwhile waits too)
//   stats      {}                  cache sizes, hit rates and timings
//   patch      { props, reset }    world changes, no answer: props [[index, broken {a} | null]] (reset: none broken first)
// Every result's typed arrays are transferred. A provider that throws answers with an error (the host
// falls back); the worker carries on. Running out of memory (an allocation that fails: a RangeError) empties
// every cache and tries the job once more before answering with the error (oom: true).
import { bakeSteps, loadProviders, SpriteCache, providers as chunkProviders } from './chunkbake.js';
import * as GB from '../gbuf.js';
import { readWorld } from '../../worldcache.js';
import { getChunk, hasChunk, putChunk, packChunk, tidy, canKeep } from './chunkstore.js';

// A pause that lets the messages already waiting for this worker run first (a message to ourselves goes to the
// back of the queue): a bake pauses at each of its yields, so the sprite a thing on screen is waiting for is made
// within a few ms instead of after the whole bake (a second or more on a phone).
const chan = typeof MessageChannel !== 'undefined' ? new MessageChannel() : null, waiting = [];
if (chan) chan.port1.onmessage = () => { const f = waiting.shift(); if (f) f(); };
const pause = () => new Promise((res) => { if (chan) { waiting.push(res); chan.port2.postMessage(0); } else setTimeout(res, 0); });

let M = null, statCache = null, sprCache = null, ART = 2;
const P = { actors: null, peds: null, errors: {} };
const stats = { chunks: 0, chunkMs: 0, sprites: 0, spriteMs: 0, errors: 0, shed: 0 };

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
const PK = { p0: null, p1: null, p2: null };   // (full-size planes on their way to art pixels: kept, not made afresh)
function pack(g, transfer, under = null, run = 0) {
  const down = ART > 1 && (g.ap || 1) < ART, n4 = g.w * g.h * 4;
  if (down && (!PK.p0 || PK.p0.length < n4)) { PK.p0 = new Uint8Array(n4); PK.p1 = new Uint8Array(n4); PK.p2 = new Uint8Array(n4); }
  let pk = down ? GB.packGBuf(g, PK.p0, PK.p1, PK.p2) : GB.packGBuf(g), u = null;
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

// The modules start loading as soon as the worker does (the pool is made while the page builds the city), so they
// are in by the time the world arrives.
const MODS = Promise.all([loadProviders(), loadActors(), import('../../../shared/map.js').catch((e) => { P.errors.map = String((e && e.message) || e); return null; })]);
MODS.catch(() => {});
let ready = null, worldIn = null, KEEP = null;
async function init(args) {
  ART = args.artPx === 1 ? 1 : 2;
  KEEP = args.artKey && canKeep() ? { art: args.artKey, n: 0, q: Promise.resolve(), tidy: !!args.tidy, cap: args.keepCap || 80 } : null;
  if (KEEP && KEEP.tidy) setTimeout(() => tidy(KEEP.art, KEEP.cap), 4000);   // (once things have settled; and every so often after)
  const lowMem = !!args.lowMem;
  // (the pool says how much; without that: four workers a little less each)
  statCache = new SpriteCache((args.cacheMB || (lowMem ? 40 : (args.workers || 3) >= 4 ? 90 : 120)) * 1e6);
  sprCache = new SpriteCache((args.sprMB || (lowMem ? 8 : 32)) * 1e6);
  const t0 = performance.now();
  const [pc, , mapMod] = await MODS;
  const modsMs = performance.now() - t0;
  if (P.actors && P.actors.setArtPx) P.actors.setArtPx(ART);   // (voxel things render straight at the art pixel)
  if (P.actors && P.actors.setActorBudget) P.actors.setActorBudget(args.modelMB ? { modelMB: args.modelMB } : { lowMem });
  const t1 = performance.now();
  const m = args.M || (args.key ? await readWorld(args.key) : null);
  return { mapMod, m, result: { ground: pc.ground, statics: pc.statics, actors: !!P.actors, peds: !!P.peds, errors: { ...pc.errors, ...P.errors }, modsMs, readMs: args.M ? 0 : performance.now() - t1, needWorld: !m } };
}
// Props a player changed (broken, or a campfire lit or put out: index -> the prop) - those near a chunk are part of its
// key in the store, so it is only served as baked with the same changes. (A campfire's lit0: how the map laid it out,
// noted at the first change.)
const dirty = new Map();
const isDirty = (pr) => !!pr && (!!pr.broken || (pr.lit0 !== undefined && !!pr.lit !== !!pr.lit0));
function markDirty(i) { const pr = M && M.props[i]; if (isDirty(pr)) dirty.set(i, pr); else dirty.delete(i); }
function dirtySig(cx, cy) {
  // (what a prop changes reaches 320 px above it and a little round it: host.js propChanged - with room to spare)
  const X0 = cx * 768, Y0 = cy * 768, out = [];
  for (const [i, p] of dirty) if (p.x > X0 - 160 && p.x < X0 + 768 + 160 && p.y > Y0 - 80 && p.y < Y0 + 768 + 400) out.push(`${i}${p.broken ? 'b' + (p.broken.a || 0) : ''}${p.lit0 !== undefined ? 'l' + (p.lit ? 1 : 0) : ''}`);
  return out.sort().join(',');
}
// the world as this worker's own CityMap (its methods back: shared/map.js cityFromData)
function takeWorld(m, mapMod) {
  M = m;
  dirty.clear();
  (M.props || []).forEach((pr, i) => { if (isDirty(pr)) dirty.set(i, pr); });
  try { if (mapMod && mapMod.cityFromData) mapMod.cityFromData(M); else if (mapMod) Object.setPrototypeOf(M, mapMod.CityMap.prototype); } catch (e) { P.errors.map = String((e && e.message) || e); }
}

async function handle(msg) {
  const { id, op, args } = msg;
  const t0 = performance.now();
  if (op === 'init') {
    const p = init(args);
    // (everything after waits for the world: sent with this, read from the browser's copy, or a 'world' to come)
    ready = p.then(({ m, mapMod }) => (m ? takeWorld(m, mapMod) : new Promise((res) => { worldIn = (w) => res(takeWorld(w, mapMod)); })));
    const { result } = await p;
    self.postMessage({ id, ok: true, result, ms: performance.now() - t0 });
    return;
  }
  if (op === 'world') { if (worldIn) { const f = worldIn; worldIn = null; f(args.M); } return; }   // (the city, when it wasn't kept)
  if (ready) await ready; // (jobs that arrive while the providers load wait for them)
  if (op === 'patch') { // the world changed (props smashed or put back): no answer
    if (M && args.reset) { for (const pr of M.props || []) delete pr.broken; for (const [i, pr] of dirty) { if (!isDirty(pr)) dirty.delete(i); } }
    if (M) for (const [i, br] of args.props || []) { const pr = M.props[i]; if (!pr) continue; if (br) pr.broken = br; else delete pr.broken; markDirty(i); }
    if (M) for (const [i, lit] of args.lit || []) { const pr = M.props[i]; if (!pr) continue; if (pr.lit0 === undefined) pr.lit0 = !!pr.lit; pr.lit = lit; markDirty(i); }   // (a campfire lit or put out)
    return;
  }
  if (!M && op !== 'stats') throw new Error('worker not initialised');
  if (op === 'peekChunk') {   // (a quick look in the store: no baking)
    const { cx, cy, ck } = args;
    let got = null, exact = true;
    if (KEEP && ck) {
      const d = dirtySig(cx, cy), base = `${KEEP.art}|${ck}`;
      got = await getChunk(d ? `${base}|d${d}` : base);
      if (!got) { got = await getChunk(base, true); exact = false; }
    }
    if (!got) { self.postMessage({ id, ok: true, result: { none: true }, ms: performance.now() - t0 }); return; }
    const transfer = [got.g.p0.buffer, got.g.p1.buffer, got.g.p2.buffer];
    if (got.under) transfer.push(got.under.buffer);
    if (got.gh) transfer.push(got.gh.buffer);
    stats.peeks = (stats.peeks || 0) + 1;
    self.postMessage({ id, ok: true, result: { cx, cy, ...got, exact, kept: true, errors: null }, ms: performance.now() - t0 }, transfer);
    return;
  }
  if (op === 'prebakeChunk') {   // (into the store only: host.js _prebake)
    const { cx, cy, opt } = args;
    if (!KEEP || !args.ck) { self.postMessage({ id, ok: true, result: { kept: false }, ms: 0 }); return; }
    const d0 = dirtySig(cx, cy), ck = `${KEEP.art}|${args.ck}${d0 ? '|d' + d0 : ''}`;
    if (await hasChunk(ck)) { self.postMessage({ id, ok: true, result: { kept: true, had: true }, ms: performance.now() - t0 }); return; }
    const it = bakeSteps(M, cx, cy, { ...(opt || {}), artPx: ART, scratch: ART > 1 }, statCache, chunkProviders);
    let step = it.next();
    while (!step.done) { await pause(); step = it.next(); }
    const r = step.value;
    let kept = false;
    if (!r.errors && dirtySig(cx, cy) === d0) {
      const { o: g, u: under } = pack(r.g, [], r.under && r.blds && r.blds.length ? r.under : null, GB.CHUNK_RUN);
      kept = await (KEEP.q = KEEP.q.then(() => putChunk(ck, packChunk({ cx, cy, g, under, blds: r.blds || [], lights: r.lights, gh: r.gh, live: r.live, n: r.n, items: r.items }))).catch(() => false));
      if (KEEP.tidy && ++KEEP.n % 12 === 0) tidy(KEEP.art, KEEP.cap).catch(() => {});
    }
    stats.prebaked = (stats.prebaked || 0) + 1; stats.prebakeMs = (stats.prebakeMs || 0) + performance.now() - t0;
    self.postMessage({ id, ok: true, result: { kept }, ms: performance.now() - t0 });
    return;
  }
  if (op === 'bakeChunk') {
    const { cx, cy, opt } = args;
    // (kept from an earlier bake of this build of the art: chunkstore.js)
    let ck = null, d0 = '';
    if (KEEP && args.ck) { d0 = dirtySig(cx, cy); ck = `${KEEP.art}|${args.ck}${d0 ? '|d' + d0 : ''}`; }
    if (ck) {
      const got = await getChunk(ck);
      if (got) {
        const transfer = [got.g.p0.buffer, got.g.p1.buffer, got.g.p2.buffer];
        if (got.under) transfer.push(got.under.buffer);
        if (got.gh) transfer.push(got.gh.buffer);
        stats.chunks++; stats.kept = (stats.kept || 0) + 1; stats.chunkMs += performance.now() - t0;
        self.postMessage({ id, ok: true, result: { cx, cy, ...got, made: 0, bake: { kept: performance.now() - t0 }, errors: null, kept: true }, ms: performance.now() - t0 }, transfer);
        return;
      }
    }
    const it = bakeSteps(M, cx, cy, { ...(opt || {}), artPx: ART, scratch: ART > 1 }, statCache, chunkProviders);
    let step = it.next();
    while (!step.done) { await pause(); step = it.next(); }
    const r = step.value;
    const transfer = [];
    // (the under layer only matters where there are buildings to fade)
    const { o: g, u: under } = pack(r.g, transfer, r.under && r.blds && r.blds.length ? r.under : null, GB.CHUNK_RUN);
    transfer.push(r.gh.buffer);
    stats.chunks++; stats.chunkMs += performance.now() - t0;
    const result = { cx, cy, g, under, blds: r.blds || [], lights: r.lights, gh: r.gh, live: r.live, n: r.n, items: r.items, made: r.made, bake: r.ms, errors: r.errors };
    // (kept for next time: copied before the arrays go, compressed and stored after - one at a time)
    const keep = ck && !r.errors && dirtySig(cx, cy) === d0 ? packChunk(result) : null;   // (unless something changed there meanwhile)
    self.postMessage({ id, ok: true, result, ms: performance.now() - t0 }, transfer);
    if (keep) KEEP.q = KEEP.q.then(() => putChunk(ck, keep)).then(() => { if (KEEP.tidy && ++KEEP.n % 12 === 0) return tidy(KEEP.art, KEEP.cap); return null; }).catch(() => {});
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
    const c = (k) => (k ? { bytes: k.bytes, n: k.m.size, max: k.max, hits: k.hits, misses: k.misses } : null);
    self.postMessage({ id, ok: true, result: { ...stats, statBytes: statCache ? statCache.bytes : 0, statN: statCache ? statCache.m.size : 0, sprBytes: sprCache ? sprCache.bytes : 0, sprN: sprCache ? sprCache.m.size : 0, stat: c(statCache), spr: c(sprCache) }, ms: 0 });
    return;
  }
  throw new Error(`unknown op ${op}`);
}

// out of memory: an allocation that failed (typed arrays are where a phone runs out), or a stack blown by it
const isOOM = (e) => e instanceof RangeError || /allocation failed|out of memory/i.test(String((e && e.message) || e));
// empty every cache to get memory back (they fill again as things are drawn)
function shed() {
  if (statCache) statCache.clear();
  if (sprCache) sprCache.clear();
  try { if (P.actors && P.actors.clearActorCaches) P.actors.clearActorCaches(); } catch { /* best effort */ }
  stats.shed++;
}

self.onmessage = (e) => {
  const msg = e.data;
  handle(msg).catch((err) => {
    if (!isOOM(err) || !msg || (msg.op !== 'bakeChunk' && msg.op !== 'sprite')) throw err;
    shed();
    return handle(msg); // once more, with the memory the caches held
  }).catch((err) => {
    stats.errors++;
    self.postMessage({ id: msg && msg.id, ok: false, error: String((err && err.stack) || err), oom: isOOM(err) });
  });
};
