// The Starlite Drive-In (the owner's #322; the bill and the lot: shared/drivein.js, the numbers: shared/rules-games.js
// DRIVEIN). After dark the features run back to back on the big screen for everyone (the page draws them:
// client/drivein.js). Pull into a stall facing the screen, stop, and tune in - the speaker on the window - for the
// night's admission, a car's worth (the others in your car ride on your ticket; tune in again later that night for
// nothing). The page frames the screen while you watch and plays the score; the HUD keeps the time. Get out, drive off
// or go down and it ends for you; the night's last feature over, everyone's wished a safe drive home.
//   p.drivein: { v (the vehicle), x, y (where it stood), night, k (the show), f (its feature) } while you watch;
//   p.dinNight: the night you paid for
import { TILE } from '../../shared/constants.js';
import { DRIVEIN } from '../../shared/rules-games.js';
import { FEATURES, SHOW, showAt, featureFor, driveInOf } from '../../shared/drivein.js';
import { payFrom } from './economy.js';

const STILL = 25;          // px/s: slower than this, the car's parked
const MOVE_PX = 40;        // moved this far from the stall: driven off
const NEAR_PX = 1800;      // the screen's in view: the page gets what's on

// the drive-in on this map (found once)
function site(world) {
  if (world._din === undefined || world._dinMap !== world.map) { world._dinMap = world.map; world._din = driveInOf(world.map); }
  return world._din;
}
// in the rows of stalls: the lot between the screen's apron and the snack bar
const inStalls = (D, x, y) => x > D.x0 + TILE && x < D.x1 - TILE && y > D.sy + 3 * TILE && y < D.y1 - 7 * TILE;
// the car's nose toward the screen
function facing(D, v) {
  const to = Math.atan2(D.sy - 70 - v.y, D.sx - v.x);
  return Math.cos(to - (v.a || 0)) > 0.3;   // (within ~70 degrees: the outer stalls look across at it)
}
const featureName = (f) => `"${FEATURES[f].title}"`;
// someone in this car has tonight's ticket: you ride on it
function carTicket(world, p, v, night) {
  for (const id of v.seats || []) { const ped = id ? world.get(id) : null, q = ped && ped.player; if (q && q !== p && ped.vehId === v.id && q.dinNight === night) return true; }
  return false;
}
// where you could tune in: in a land vehicle in the stalls
function parkedAt(world, p) {
  const D = site(world), ped = p.ped;
  if (!D || !ped || !ped.vehId || ped.dead) return null;
  const v = world.get(ped.vehId);
  if (!v || v.removed || !v.def || v.def.kind === 'air' || v.def.kind === 'boat' || !inStalls(D, v.x, v.y)) return null;
  return { D, v };
}

export function interaction(world, p) {
  const at = parkedAt(world, p);
  if (!at) return null;
  const { D, v } = at;
  if (p.drivein) return { label: 'Switch off the speaker (stop watching)', run: () => leave(world, p, 'You hang the speaker back on its post.') };
  const sh = showAt(world.day, world.loopTime);
  if (!sh) return { label: world.clock.isNight ? `That's all at the ${D.name} tonight` : `The ${D.name} shows films after dark`, passive: true, run: () => {} };
  if (Math.hypot(v.vx || 0, v.vy || 0) > STILL || !facing(D, v)) return { label: 'Stop in a stall facing the screen to watch', passive: true, run: () => {} };
  const paid = p.dinNight === sh.night || carTicket(world, p, v, sh.night);
  const what = sh.at < 0 ? `next up, ${featureName(sh.f)}` : featureName(sh.f);
  return { label: `Tune in: ${what}${paid ? '' : ` ($${DRIVEIN.price} a car)`}`, run: () => { const e = tuneIn(world, p); if (e) world.notify(p, e, 'bad'); } };
}

// the speaker on the window: pay the night's admission (unless it's paid) and watch
export function tuneIn(world, p, pay = payFrom) {
  const at = parkedAt(world, p);
  if (!at) return 'Pull into a stall at the drive-in first.';
  const { D, v } = at;
  if (p.drivein) return 'You\'re tuned in already.';
  const sh = showAt(world.day, world.loopTime);
  if (!sh) return world.clock.isNight ? `That's all at the ${D.name} tonight.` : `The ${D.name} shows films after dark.`;
  if (Math.hypot(v.vx || 0, v.vy || 0) > STILL || !facing(D, v)) return 'Stop in a stall facing the screen first.';
  if (p.dinNight !== sh.night && !carTicket(world, p, v, sh.night)) {
    if (!pay(p, DRIVEIN.price)) return `Admission's $${DRIVEIN.price} a car - you're short.`;
  }
  p.dinNight = sh.night;
  p.drivein = { v: v.id, x: v.x, y: v.y, night: sh.night, k: sh.k, f: sh.f };
  p.meDirty = true;
  const F = FEATURES[sh.f];
  world.notify(p, sh.at < 0
    ? `You hang the speaker on the window. ${sh.k ? 'Intermission' : `Tonight at the ${D.name}`} - ${featureName(sh.f)} starts in ${Math.ceil(-sh.at)}s.`
    : `You hang the speaker on the window: ${featureName(sh.f)} - ${F.tag}. Drive off to leave.`, 'good');
  return null;
}
export function leave(world, p, say, kind = 'info') {
  if (!p.drivein) return;
  p.drivein = null; p.meDirty = true;
  if (say) world.notify(p, say, kind);
}

// the watchers: out of the car, driven off, gone down; a new feature on; the night's bill over
export function update(world) {
  if (world.tick % 5 !== 2) return;
  const D = site(world);
  for (const p of world.players.values()) {
    const c = p.drivein;
    if (!c) continue;
    const ped = p.ped, v = ped && !ped.dead && ped.vehId === c.v ? world.get(c.v) : null;
    if (!v || v.removed || !D) { leave(world, p, ped && !ped.dead ? 'You leave the drive-in - the film goes on without you.' : null); continue; }
    if (Math.hypot(v.x - c.x, v.y - c.y) > MOVE_PX) { leave(world, p, 'You pull out with the speaker still on the window - clunk. The film goes on without you.'); continue; }
    const sh = showAt(world.day, world.loopTime);
    if (!sh || sh.night !== c.night) { leave(world, p, `That's all at the ${D.name} tonight - drive home safe!`, 'good'); continue; }
    if (sh.k !== c.k) {
      const was = c.f;
      c.k = sh.k; c.f = sh.f; p.meDirty = true;
      world.notify(p, `The end: ${featureName(was)}. Intermission - next up, ${featureName(sh.f)} (${FEATURES[sh.f].tag}).`, 'info');
    }
  }
}

// for the page (the 'me' payload's din): what's on, near the drive-in or watching - the feature, the show, how far in
// it is (below 0: the intermission before it), the one after it (-1: the last), and whether you're tuned in
export function meInfo(world, p) {
  const D = site(world), ped = p.ped;
  if (!D || !ped) return null;
  const v = ped.vehId ? world.get(ped.vehId) : null, x = v ? v.x : ped.x, y = v ? v.y : ped.y;
  if (!p.drivein && (ped.ug || Math.hypot(x - D.sx, y - D.sy) > NEAR_PX)) return null;
  const sh = showAt(world.day, world.loopTime);
  if (!sh) return null;
  return { f: sh.f, k: sh.k, at: Math.round(sh.at * 10) / 10, n: sh.k + 1 < SHOW.shows ? featureFor(sh.night, sh.k + 1) : -1, w: p.drivein ? 1 : 0 };
}
// the HUD tracker (the job slot) while you watch: the film and the time left; the marker at the foot of the screen
export function targetFor(world, p) {
  const c = p.drivein, D = site(world);
  if (!c || !D) return null;
  const sh = showAt(world.day, world.loopTime);
  if (!sh) return null;
  const text = sh.at < 0 ? `${D.name}: ${featureName(sh.f)} starts in ${Math.ceil(-sh.at)}s` : `${D.name}: ${featureName(sh.f)} · ${Math.max(0, Math.round(sh.len - sh.at))}s left`;
  return { text, x: D.sx, y: D.sy + 40, stage: 'drivein' };
}
