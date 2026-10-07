// Rides: the Ferris wheel on Westport Pier and hot-air balloon flights from the Dry Creek Balloon Field (the wheel
// and the routes: shared/rides.js). Walk up to the boarding point and buy a ticket and you're aboard - out of the
// street like someone indoors (nobody can see you or hurt you, and there's nothing to do but take in the view)
// while your camera opens out: the wheel takes you once round, a flight drifts out over the country and comes down
// back at the field. Everyone sees the balloons go over: each flight is broadcast when it starts and ends, and the
// clients draw it from the shared route. Not while wanted, carrying a crate or driving.
import { FERRIS_PRICE, FERRIS_S, BALLOON_PRICE, BALLOON_S, BALLOONS_UP } from '../../shared/rules.js';
import { ferrisSite, balloonSite, ferrisBoardCab, balloonRoutes, balloonAt } from '../../shared/rides.js';
import { payFrom } from './economy.js';
import * as homes from './homes.js';
import { store } from '../store.js';

const REACH = { ferris: 40, balloon: 46 };
let nextId = 1, nextRoute = 0;
const at = {};

// the action-button prompt at a boarding point (null elsewhere); aboard: how long is left
export function interaction(world, p) {
  const ped = p.ped;
  if (!ped || ped.vehId || ped.hidden) return null;
  const fw = ferrisSite(world.map);
  if (fw && Math.hypot(ped.x - fw.board.x, ped.y - fw.board.y) < REACH.ferris) return { label: `Ride the Ferris wheel ($${FERRIS_PRICE})`, run: () => start(world, p, 'ferris') };
  const bf = balloonSite(world.map);
  if (bf && Math.hypot(ped.x - bf.board.x, ped.y - bf.board.y) < REACH.balloon) return { label: `Hot-air balloon flight ($${BALLOON_PRICE})`, run: () => start(world, p, 'balloon') };
  return null;
}
export function aboardLabel(world, ped) {
  const R = ped.ride, left = Math.max(0, Math.ceil(R.dur - (world.time - R.t0)));
  return R.k === 'ferris' ? `On the Ferris wheel - ${left}s` : `Up in the balloon - ${left}s`;
}

const flightsUp = (world) => { let n = 0; for (const q of world.players.values()) if (q.ped && q.ped.ride && q.ped.ride.k === 'balloon') n++; return n; };
function nextDown(world) {
  let soonest = Infinity;
  for (const q of world.players.values()) { const R = q.ped && q.ped.ride; if (R && R.k === 'balloon') soonest = Math.min(soonest, R.dur - (world.time - R.t0)); }
  return Math.max(1, Math.ceil(soonest));
}

// Buy a ticket and go aboard. Returns an error message (also told to the player), or null.
export function start(world, p, kind) {
  const ped = p.ped;
  const fail = (msg, tone = 'warn') => { world.notify(p, msg, tone); return msg; };
  if (!ped || ped.dead || ped.vehId || ped.hidden || ped.ride) return fail('Not right now.');
  if (world.time < ped.downUntil || world.time < ped.stunUntil) return fail('Not right now.');
  if (p.wanted > 0) return fail('Not with the police after you.', 'bad');
  if (ped.carrying) return fail('Set the crate down first.');
  const site = kind === 'ferris' ? ferrisSite(world.map) : balloonSite(world.map);
  if (!site) return fail('Not running today.');
  const routes = kind === 'balloon' ? balloonRoutes(world.map) : null;
  if (routes && !routes.length) return fail('Not running today.');
  if (kind === 'balloon' && flightsUp(world) >= BALLOONS_UP) return fail(`All ${BALLOONS_UP} balloons are up - the next one is down in about ${nextDown(world)}s.`, 'info');
  const price = kind === 'ferris' ? FERRIS_PRICE : BALLOON_PRICE;
  if (!payFrom(p, price)) return fail(`A ticket is $${price}.`);
  const R = { id: nextId++, k: kind, t0: world.time, dur: kind === 'ferris' ? FERRIS_S : BALLOON_S, ret: { x: site.board.x, y: site.board.y } };
  if (kind === 'ferris') R.cab = ferrisBoardCab(world.loopTime);
  else { R.r = nextRoute++ % routes.length; R.pal = R.id % 4; }
  ped.ride = R;
  ped.hidden = true; ped.inside = null; ped.interior = null; ped.entering = null; ped.fishing = null;
  ped.vx = 0; ped.vy = 0; ped.rollT = 0;
  if (kind === 'balloon') { const L = site.launch; ped.x = L.x; ped.y = L.y; }
  world.place(ped);
  world.broadcast({ e: 'ride', ...wire(world, ped) });
  world.notify(p, kind === 'ferris' ? 'You step into the cab at the bottom and the wheel carries you up over the bay.'
    : `The burner roars and the basket lifts off the grass. Today's flight: ${routes[R.r].name}.`, 'good');
  p.meDirty = true;
  store.touch();
  return null;
}

// a ride as the clients get it: who (the rider's entity id), which, how far in (el, s) of how long (d)
function wire(world, ped) {
  const R = ped.ride;
  const w = { id: R.id, ped: ped.id, k: R.k, el: +(world.time - R.t0).toFixed(2), d: R.dur };
  if (R.k === 'ferris') w.cab = R.cab; else { w.r = R.r; w.pal = R.pal; }
  return w;
}
// every ride under way (the welcome message: someone joining sees the balloons already up)
export function active(world) {
  const out = [];
  for (const q of world.players.values()) if (q.ped && q.ped.ride && !q.ped.removed) out.push(wire(world, q.ped));
  return out;
}
// your own ride, for the 'me' message (null when you're not on one)
export function meInfo(world, p) { return p.ped && p.ped.ride ? wire(world, p.ped) : null; }

// Off again: back on the boarding deck / the field (landed), or just the ride forgotten (something else let you
// out - a dev teleport - or you're gone).
function end(world, p, landed) {
  const ped = p.ped, R = ped.ride;
  ped.ride = null;
  if (landed) {
    ped.hidden = false;
    ped.x = R.ret.x + (world.rand() - 0.5) * 14; ped.y = R.ret.y + 4;
    ped.vx = 0; ped.vy = 0;
    world.place(ped);
    homes.protect(world, ped, 1.5);
    world.notify(p, R.k === 'ferris' ? 'Round you come, and out onto the deck.' : 'A gentle bump and you\'re down. Thanks for flying.', 'info');
  }
  world.broadcast({ e: 'rideend', id: R.id });
  p.meDirty = true;
}

export function update(world) {
  for (const p of world.players.values()) {
    const ped = p.ped;
    if (!ped || !ped.ride) continue;
    const R = ped.ride;
    if (ped.removed || ped.dead || !ped.hidden) { end(world, p, false); continue; }
    const t = world.time - R.t0;
    if (R.k === 'balloon') {
      const route = balloonRoutes(world.map)[R.r];
      if (route) { balloonAt(route, Math.min(t, R.dur), R.dur, at); ped.x = at.x; ped.y = at.y; } // (the rider goes along: what they're sent follows the balloon)
    }
    if (t >= R.dur) end(world, p, true);
  }
}

// Where to come back after logging off mid-ride: the boarding point.
export function savedSpot(ped) { return ped && ped.ride ? ped.ride.ret : null; }
