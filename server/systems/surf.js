// Surfing (the owner's #312, 10-08). A surfboard in your bag (shared/items.js surfboard: the surf shops and the sports
// shops) and the sea: you lie on it and paddle, faster than you swim. At a surf break (shared/surf.js findBreaks: a
// straight sandy beach facing the open sea) the waves roll in, in sets; paddle for the beach as one comes and you're up
// on it (ped.surf.st 'ride'). Then ride it: the stick carves you along the face - left or right along the beach - while
// the wave carries you in. It breaks from one end and the break peels along the crest toward the other: ride ahead of
// it, in the pocket just in front of the white water, for the points; the action button takes you up off the lip in an
// air. Stay in the white water and it has you (a tumble, 'wipe'); ride it all the way in, or off the end of the beach,
// and the ride's done - its points counted, your best kept. The server steps it all (update); the page draws the waves
// from the same arithmetic (shared/surf.js wavesAt on the world's tick) and you on the board (art2: people.js surf poses,
// the descriptor's sf), and the score (me.surf).
//   ped.surf = { st: 'pad' | 'ride' | 'air' | 'wipe', b: the break near (its id) or -1, mx, my (the stick), w (the wave
//   ridden), a, va (along the break: where, how fast), pts (this ride's), until (air, wipe), carveAt, sign }
import { TILE, T, DT } from '../../shared/constants.js';
import { WATER_T, PED_BLOCK, isSwimming } from '../../shared/mapcore.js';
import { IN } from '../../shared/input.js';
import { SURF, wavesAt, onBreak, breakPt, broken, findBreaks, crestD, heightAt, gapAt } from '../../shared/surf.js';
import { store } from '../store.js';
import * as skills from './skills.js';

export const hasBoard = (p) => !!(p && p.profile && (p.profile.inventory.surfboard || 0) > 0);
const GRID = 2048;
// the map's breaks, once, and a grid of them
const BR = new WeakMap();
export const breaksOf = (world) => breaksOfMap(world.map);
export function breaksOfMap(m) {
  let B = BR.get(m);
  if (!B) {
    const list = findBreaks(m), grid = new Map();
    for (const b of list) {
      const R = b.half + SURF.start + 200;
      for (let gy = Math.floor((b.y - R) / GRID); gy <= Math.floor((b.y + R) / GRID); gy++) for (let gx = Math.floor((b.x - R) / GRID); gx <= Math.floor((b.x + R) / GRID); gx++) {
        const k = gx * 65536 + gy; let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(b);
      }
    }
    BR.set(m, (B = { list, grid }));
  }
  return B;
}
// the break whose waters (x, y) is in - along its beach and out to where its waves rise - or null
export function breakAt(world, x, y) {
  const a = breaksOf(world).grid.get(Math.floor(x / GRID) * 65536 + Math.floor(y / GRID));
  if (!a) return null;
  for (const b of a) { const q = onBreak(b, x, y); if (Math.abs(q.a) <= b.half + 64 && q.d >= -40 && q.d <= SURF.start + 160) return b; }
  return null;
}
export function breaksNear(world, x, y, r = SURF.near) {
  const out = [], seen = new Set(), G = breaksOf(world).grid;
  for (let gy = Math.floor((y - r) / GRID); gy <= Math.floor((y + r) / GRID); gy++) for (let gx = Math.floor((x - r) / GRID); gx <= Math.floor((x + r) / GRID); gx++)
    for (const b of G.get(gx * 65536 + gy) || []) if (!seen.has(b) && Math.hypot(b.x - x, b.y - y) < r + b.half) { seen.add(b); out.push(b); }
  return out;
}
const now = (world) => world.tick * DT;   // (the waves' clock: the tick's, as the page has it)
// the sea, not a river, a lake or a pond
function seaAt(map, x, y) {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  if (!map.inside(tx, ty)) return true;
  const i = map.idx(tx, ty), t = map.tiles[i];
  return WATER_T[t] === 1 && !(map.river && map.river[i]) && !(map.lake && map.lake[i]) && !(map.land && map.land[i]);
}
const descOn = (ped, st) => { const sf = st === 'pad' ? 1 : st === 'ride' ? 2 : st === 'air' ? 3 : st === 'wipe' ? 4 : 0; if (ped.surfSf !== sf) { ped.surfSf = sf; ped.appVer = (ped.appVer || 0) + 1; } };

function start(world, p) {
  const ped = p.ped;
  ped.surf = { st: 'pad', b: -1, mx: 0, my: 0, w: -1, a: 0, va: 0, pts: 0, until: 0, carveAt: 0, sign: 0 };
  ped.vx *= 0.5; ped.vy *= 0.5;
  descOn(ped, 'pad');
  p.meDirty = true;
  if (!(p.profile.surfRides > 0) && !p.surfTold) { p.surfTold = true; world.notify(p, 'On your board. At a surf break, paddle for the beach as a wave comes to catch it.', 'info'); }
}
export function stop(world, p) {
  const ped = p.ped;
  if (!ped || !ped.surf) return;
  if (ped.surf.st === 'ride' || ped.surf.st === 'air') endRide(world, p, null);
  ped.surf = null;
  descOn(ped, null);
  p.meDirty = true;
}
function endRide(world, p, why) {
  const ped = p.ped, s = ped.surf, prof = p.profile, pts = Math.round(s.pts);
  s.st = 'pad'; s.w = -1; s.va = 0;
  descOn(ped, 'pad');
  p.meDirty = true;
  prof.surfRides = (prof.surfRides || 0) + 1;
  const best = pts > (prof.surfBest || 0);
  if (best) prof.surfBest = pts;
  s.last = pts;
  store.touch();
  if (why) world.notify(p, `${why} - ${pts.toLocaleString('en-US')} points${best ? ' - your best ride!' : ''}`, pts >= 1500 ? 'good' : 'info');
}
function wipe(world, p, why) {
  const ped = p.ped, s = ped.surf;
  endRide(world, p, why);
  s.st = 'wipe'; s.until = world.time + SURF.wipeS;
  descOn(ped, 'wipe');
  world.emit(ped.x, ped.y, { e: 'splash', x: ped.x, y: ped.y, n: 14 });
}

// your stick on the board; the action button (or the dive) up off the lip in an air
export function input(world, p, ped, inp, pressed) {
  const s = ped.surf;
  s.mx = Math.max(-1, Math.min(1, inp.mx || 0)); s.my = Math.max(-1, Math.min(1, inp.my || 0));
  ped.aimAngle = inp.aim;
  if ((pressed & (IN.ACTION | IN.DIVE)) && s.st === 'ride' && world.time - (s.airEnd ?? -9) > SURF.airGap) {   // (not again the moment you land)
    s.st = 'air'; s.until = world.time + SURF.airS;
    descOn(ped, 'air');
    world.emit(ped.x, ped.y, { e: 'splash', x: ped.x, y: ped.y, n: 6 });
  }
}
export function interaction(world, p) {
  const s = p.ped && p.ped.surf;
  if (!s) return null;
  if (s.st === 'ride') return { label: 'Carve along the wave - action button: an air', passive: true };
  if (s.st === 'air') return { label: 'Up off the lip!', passive: true };
  if (s.st === 'pad' && s.b >= 0) return { label: 'Paddle for the beach as a wave comes', passive: true };
  return null;
}

export function update(world, dt) {
  for (const p of world.players.values()) {
    const ped = p.ped;
    if (!ped) continue;
    const s = ped.surf;
    if (!s) {
      if (!hasBoard(p) || ped.dead || ped.vehId || ped.hidden || ped.onTrain || ped.sky || ped.cuffed || ped.ride || ped.board || ped.carrying || ped.fishing) continue;
      if (isSwimming(world.map, ped) && seaAt(world.map, ped.x, ped.y)) start(world, p);
      continue;
    }
    if (ped.dead || ped.vehId || ped.hidden || ped.onTrain || ped.sky || ped.cuffed || ped.ride || !hasBoard(p)) { stop(world, p); continue; }
    try { step(world, p, ped, s, dt); } catch (e) { world.reportError('surf', e); stop(world, p); }
  }
}

function step(world, p, ped, s, dt) {
  const m = world.map, t = now(world);
  const B = s.b >= 0 ? breaksOf(world).list[s.b] : null;
  if (s.st === 'pad' || s.st === 'wipe') {
    const B2 = breakAt(world, ped.x, ped.y);
    s.b = B2 ? B2.id : -1;
    let tx = 0, ty = 0;
    if (s.st === 'wipe') {   // (tumbling in the white water: carried in a little, nothing to steer)
      if (B2) { tx = -B2.nx * 40; ty = -B2.ny * 40; }
      if (world.time >= s.until) { s.st = 'pad'; descOn(ped, 'pad'); }
    } else { const l = Math.hypot(s.mx, s.my); if (l > 0.08) { tx = s.mx / Math.max(1, l) * SURF.paddle; ty = s.my / Math.max(1, l) * SURF.paddle; } }
    const k = 1 - Math.exp(-3 * dt);
    ped.vx += (tx - ped.vx) * k; ped.vy += (ty - ped.vy) * k;
    if (Math.hypot(ped.vx, ped.vy) > 12) ped.a = Math.atan2(ped.vy, ped.vx);
    const nx = ped.x + ped.vx * dt, ny = ped.y + ped.vy * dt, tile = m.tileAtPx(nx, ny);
    if (WATER_T[tile] === 1 || tile === T.BRIDGE) { ped.x = nx; ped.y = ny; }   // (a bridge: paddling under it)
    else if (!PED_BLOCK[tile]) { ped.x = nx; ped.y = ny; world.place(ped); stop(world, p); return; }   // (up the beach, onto a dock or a quay: off the board, it's in your bag)
    else { ped.vx = 0; ped.vy = 0; }
    world.place(ped);
    if (!isSwimming(m, ped)) { stop(world, p); return; }
    if (Math.hypot(ped.vx, ped.vy) > 30) skills.gain(world, p, 'swim', dt);
    // a wave coming: paddling for the beach as its crest reaches you (where it hasn't broken and stands high enough - not
    // in a gap in its lip: shared/surf.js heightAt), you're up
    if (s.st === 'pad' && B2) {
      const q = onBreak(B2, ped.x, ped.y), inward = -(s.mx * B2.nx + s.my * B2.ny);
      if (inward > 0.35 && Math.abs(q.a) < B2.half - 24 && q.d > SURF.shore + 60) {
        for (const w of wavesAt(B2, t, s.ws || (s.ws = []))) {
          if (w.wash) continue;
          const rel = crestD(B2, w, q.a) - q.d;
          if (rel < SURF.catch[0] || rel > SURF.catch[1] || broken(B2, w, q.a)) continue;
          if (gapAt(B2, w, q.a)) continue;   // (a gap in its lip)
          const h = heightAt(B2, w, q.a);
          s.st = 'ride'; s.w = w.id; s.a = q.a; s.pts = 0; s.va = (ped.vx * -B2.ny + ped.vy * B2.nx) * 0.5; s.sign = 0; s.carveAt = 0; s.size = Math.max(0.5, h);
          descOn(ped, 'ride'); p.meDirty = true;
          world.emit(ped.x, ped.y, { e: 'splash', x: ped.x, y: ped.y, n: 8 });
          if (!(p.profile.surfRides > 2)) world.notify(p, 'Up! Carve along the face, ahead of the white water.', 'good');
          break;
        }
      }
    }
    return;
  }
  // riding (or up in the air off the lip): the wave carries you in, the stick carves you along it
  if (!B) { endRide(world, p, null); return; }
  const w = wavesAt(B, t, s.ws || (s.ws = [])).find((q) => q.id === s.w);
  if (!w || w.wash || crestD(B, w, s.a) - SURF.face < SURF.shore) { endRide(world, p, 'Rode it in'); return; }
  const tan = s.mx * -B.ny + s.my * B.nx, want = Math.abs(tan) > 0.15 ? tan * SURF.along : B.side * SURF.along * 0.3;   // (no stick: it trims along, away from where it broke)
  const k = 1 - Math.exp(-(s.st === 'air' ? 0.5 : 3.2) * dt);
  s.va += (want - s.va) * k;
  s.a = Math.max(-B.half - 40, Math.min(B.half + 40, s.a + s.va * dt));   // (never carried far past the beach's end)
  const P = breakPt(B, s.a, crestD(B, w, s.a) - SURF.face);   // (on the face of the crest where you are along it: as the page draws it)
  if (WATER_T[m.tileAtPx(P.x, P.y)] !== 1) { endRide(world, p, Math.abs(s.a) > B.half - 60 ? 'Off the end of the wave' : 'Rode it in'); return; }   // (the beach not quite straight: never carried up onto it)
  ped.vx = (P.x - ped.x) / dt; ped.vy = (P.y - ped.y) / dt;
  ped.x = P.x; ped.y = P.y;
  // (facing the way you carve, angled in toward the beach)
  ped.a = Math.atan2((s.va >= 0 ? B.nx : -B.nx) * 0.85 - B.ny * 0.5, (s.va >= 0 ? -B.ny : B.ny) * 0.85 - B.nx * 0.5);
  world.place(ped);
  skills.gain(world, p, 'swim', dt);
  if (world.tick % 5 === 0) p.meDirty = true;   // (the points on the page as they come)
  // the points: a second up, the speed along the face, the pocket ahead of the break; a carve (a quick turn back)
  const PT = SURF.pts, size = s.size || 1;
  s.pts += dt * size * (PT.base + PT.speed * Math.abs(s.va) + (w.edge !== null && B.side * (s.a - w.edge) < SURF.pocket ? PT.pocket : 0));
  const sg = Math.abs(s.va) > 110 ? Math.sign(s.va) : 0;
  if (sg && s.sign && sg !== s.sign && world.time - s.carveAt > PT.carveS) { s.pts += PT.carve * size; s.carveAt = world.time; }
  if (sg) s.sign = sg;
  if (s.st === 'air') {
    if (world.time < s.until) return;   // (up in the air: the white water can't touch you yet)
    s.st = 'ride'; s.pts += PT.air * size; s.airEnd = world.time; descOn(ped, 'ride'); world.emit(ped.x, ped.y, { e: 'splash', x: ped.x, y: ped.y, n: 10 });   // (landed: where it's broken, or past the end, the ride's over all the same)
  }
  if (broken(B, w, s.a - B.side * 10)) { wipe(world, p, 'The white water got you'); return; }
  if (Math.abs(s.a) > B.half) { endRide(world, p, 'Off the end of the wave'); }
}

// what the page needs for the HUD and the waves: the breaks near you, where you are on the board, this ride's points
export function meInfo(world, p) {
  const ped = p.ped;
  if (!ped) return null;
  // (the breaks near anyone, so the waves are drawn for whoever's on the beach - once they've been found: at the server's
  // start, index.js; until then, only for someone with a board)
  const s = ped.surf, at = (p.cineF && p.cineF.fid && p.cineF.eye) || ped, near = hasBoard(p) || s || BR.has(world.map) ? breaksNear(world, at.x, at.y) : [];   // (at: the cinematic mode following someone - round them, cinefollow.js)
  if (!s && !near.length) return null;
  return {
    b: near.map((b) => [b.id, b.x, b.y, b.nx, b.ny, b.half, b.ph, b.side]),
    st: s ? s.st : null, pts: s && (s.st === 'ride' || s.st === 'air') ? Math.round(s.pts) : null, last: s ? s.last ?? null : null, best: p.profile.surfBest || 0,
  };
}
