// Detective tracking tools and the station office (docs/PROGRESSION.md, the police career's 'tracking' and 'office' ranks;
// the numbers: shared/rules.js TRACK). Every officer already sees a wanted player's search circle (law.js radarFor: where
// they were last seen, widening); a detective on duty can put a tracker on one of them - picked from the case board
// (Captain Reyes's: the What's next card's Track button, or the office's front desk - contacts.js, which this module
// plugs into with setTracker):
//   - one suspect at a time; a new one at most every TRACK.startGapS (the rate limit, on the server);
//   - their position, to the nearest TRACK.fuzzPx, refreshed every TRACK.everyS while they're wanted (TRACK.officeS with
//     a station office), on that officer's minimap and big map only (the self record's radar: { k: 'track', x, y, n, r,
//     age }); nothing while they're hidden indoors, and after TRACK.lostS hidden the trail's lost;
//   - over when they're no longer wanted, cuffed, offline, or the officer takes off the badge.
// The station office: the 'office' rank gives the office Reyes's chain does (profile.contacts.office { at: 'reyes', rank:
// 1 }) to a Chief without one - its case board at the precinct's front desk.
//   p.trk: { pid, n, x, y, fix (world.time of the last fix), seen (world.time last not hidden), at (when started) } - not saved
import { TRACK } from '../../shared/rules.js';
import { store } from '../store.js';
import * as careers from './careers.js';
import * as contacts from './contacts.js';

export const can = (p) => !!(p && p.badge && careers.hasUnlock(p, 'tracking'));
export const on = (p, pid) => !!(p && p.trk && p.trk.pid === pid);
const hasOffice = (p) => !!(p.profile.contacts && p.profile.contacts.office);
export const everyS = (p) => (hasOffice(p) ? TRACK.officeS : TRACK.everyS);
const snap = (v) => Math.floor(v / TRACK.fuzzPx) * TRACK.fuzzPx + TRACK.fuzzPx / 2;
const posOf = (world, q) => { const ped = q.ped, v = ped && ped.vehId ? world.get(ped.vehId) : null; return v || ped; };

// a tracker on a wanted player: null, or why not
export function start(world, p, pid) {
  if (!can(p)) return p && p.badge ? `Tracking comes at ${rankName()} (police).` : 'On duty only.';
  const q = world.players.get(pid);
  if (!q || q === p || !q.ped || !(q.wanted > 0) || q.custody) return 'They\'re not wanted now.';
  if (on(p, pid)) return null;
  const wait = (p.trkStart ?? -1e9) + TRACK.startGapS - world.time;
  if (wait > 0) return `The tracker's busy - a new suspect in ${Math.ceil(wait)} s.`;
  p.trkStart = world.time;
  p.trk = { pid, n: q.name || 'Someone', x: 0, y: 0, fix: -1e9, seen: world.time, at: world.time };
  fix(world, p, q);
  world.notify(p, `Tracking ${p.trk.n}: on your map, a fix every ${everyS(p)} s while they're wanted.`, 'good');
  p.meDirty = true;
  return null;
}
function rankName() { const R = careers.CAREERS.police.ranks; for (let i = 0; i < R.length; i++) if ((R[i].unlock || []).some((u) => u.k === 'tracking')) return R[i].name; return 'Detective'; }
function fix(world, p, q) {
  const at = posOf(world, q);
  p.trk.x = snap(at.x); p.trk.y = snap(at.y); p.trk.fix = world.time; p.trk.seen = world.time;
  p.meDirty = true;
}
export function stop(world, p, why) {
  if (!p.trk) return;
  if (why) world.notify(p, `Tracker off ${p.trk.n}: ${why}.`, 'info');
  p.trk = null; p.meDirty = true;
}
// the tracker's refresh: never more often than everyS, whatever the page asks
export function step(world, p) {
  const T = p.trk;
  if (!T) return;
  if (!can(p)) return stop(world, p, 'off duty');
  const q = world.players.get(T.pid);
  if (!q || !q.ped) return stop(world, p, 'they\'ve left town');
  if (q.custody) return stop(world, p, 'they\'re in custody');
  if (!(q.wanted > 0)) return stop(world, p, 'they\'re not wanted any more');
  if (world.time - T.fix < everyS(p)) return;
  if (q.ped.hidden) {   // (indoors: no fix - the last one stands, then the trail's lost)
    if (world.time - T.seen > TRACK.lostS) stop(world, p, 'the trail went cold');
    return;
  }
  fix(world, p, q);
}
// the officer's own radar (players.js buildMe)
export function radar(world, p, out) {
  const T = p.trk;
  if (T) out.push({ k: 'track', x: T.x, y: T.y, n: T.n, r: TRACK.fuzzPx / 2, age: Math.round(world.time - T.fix) });
  return out;
}

// The 'office' rank: a station office for a Chief without one (Reyes's precinct, as his chain's)
export function office(world, p) {
  if (hasOffice(p) || !careers.hasUnlock(p, 'office')) return false;
  contacts.book(p.profile).office = { at: 'reyes', rank: 1 };
  store.touch();
  world.notify(p, `A station office of your own at ${contacts.CONTACTS.reyes.place.name}: its case board at the front desk, and your tracker gets a fix every ${TRACK.officeS} s.`, 'good');
  p.nxDirty = true;
  return true;
}

export function update(world) {
  if (world.tick % 10 !== 3) return;
  const slow = world.tick % 100 === 3;
  for (const p of world.players.values()) {
    try {
      if (p.trk) step(world, p);
      if (slow && p.profile && p.conn) office(world, p);
    } catch (e) { if (world.opts && world.opts.throwErrors) throw e; console.error('[tracking]', e); }
  }
}

contacts.setTracker({ can, on, start });
