// Crazy Taxi (b8a; the owner: "we should have a Crazy Taxi style mode that is similar to the classic Sega Crazy Taxi game
// where you have to try to get passengers from one place to the other as fast as you can"). From a taxi rank (its card's
// "or" line) or the phone's Jobs app: a cab, and a clock (CRAZY.startS) that starts when you get in. Fares wait round you
// with an arm up, a ring at their feet in their colour: green a short trip, yellow a middling one, red a long one (more
// pay, more seconds). Stop by one and they jump in; each has their own clock to get there (par: late, they jump out).
// Set them down there and they pay - more the faster, plus the seconds back on the clock: SPEEDY, GOOD, SLOW. On the
// way, tips: a near miss with the traffic, a drift, a flat-out dash - each times your combo, which a crash loses. When
// the clock runs out the run's over: the summary card (your takings, the fares, the tips, the best combo, the licence -
// S to E - and your best run: profile.crazyBest), Again, or done. The cab's the company's to bring back after (jobs.js).
//   update(world, dt)            the runs (world.js SYSTEMS)
//   start(world, p, rank, again) sign on -> error | null (again: from the summary, the same cab where it is)
//   target(world, p, j)          the job tracker's target, the waiting fares' marks (phone.js)
//   cardInfo(world, j)           the HUD card's clock
//   devCrazy(world, p)           dev: a run, the cab beside you, you at the wheel
import { CRAZY } from '../../shared/rules.js';
import { K, T } from '../../shared/constants.js';
import { obbVsObb } from '../../shared/math.js';
import { store } from '../store.js';
import { spawnNpc, despawnNpc } from './npc.js';
import { kerbFor } from './kerbdrive.js';
import * as jobs from './jobs.js';
import { rankFor, kerbSpot, placesOf, pick, setDown } from './taxijob.js';

const WHO = ['a surfer', 'a punk', 'a tourist', 'a businessman', 'a grandma', 'a skater', 'a rock star', 'a chef', 'a nurse', 'a gamer', 'a bride', 'a detective'];
const RATE = [[0.5, 'SPEEDY!', 1, 1], [0.2, 'GOOD', 0.85, 0.6], [0, 'SLOW', 0.7, 0.3]];   // (the share of their clock left: the word, the pay, the seconds back)
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const left = (world, j) => Math.max(0, j.clockAt - world.time);

export function start(world, p, rank = null, again = false) {
  if (!p.ped || p.ped.dead) return 'Not right now.';
  if (p.job) return 'You already have a job - cancel it first.';
  let v = null;
  if (again) { const ri = jobs.returnInfo(world, p); if (ri && ri.v.model === 'taxi' && Math.hypot(ri.v.x - p.ped.x, ri.v.y - p.ped.y) < 400) { v = ri.v; p.truckReturn = null; } }
  rank = rank || rankFor(world, p);
  if (!v && !rank) return 'No taxi company here.';
  p.job = { type: 'crazy', stage: 'ready', truck: 0, clockAt: 0, expires: world.time + 1200, waiting: [], fare: null, done: 0, cash: 0, tips: 0, combo: 0, best: 0, hitAt: 0, near: new Map(), driftT: 0, dashT: 0, rank: rank || { x: p.ped.x, y: p.ped.y, name: 'here' }, text: 'Crazy Taxi: get in your cab - the clock starts when you do' };
  if (v) jobs.markIssued(world, p, v, { label: v.returnTo ? v.returnTo.label : 'the rank' });
  else if (!jobs.workTruck(world, p, rank, 'taxi', { label: rank.name })) { p.job = null; return 'No room to park a cab there.'; }
  world.notify(p, `CRAZY TAXI! Get in your cab (the green ring) and the clock starts: ${CRAZY.startS}s. Fares wave from rings - green short, yellow longer, red long. Stop by one, get them there fast for seconds back. Near misses, drifts and dashes earn tips.`, 'good', 'Crazy Taxi: get in the cab - the clock starts');
  p.meDirty = true;
  return null;
}

// a fare waiting near (x, y): a tier, somewhere to go -> the waiting record | null
function newWaiter(world, p, x, y) {
  const m = world.map, L = placesOf(m);
  const a = { x: x + 0, y: y + 0 };
  for (let k = 0; k < 6; k++) {
    const r = CRAZY.spot[0] + world.rand() * (CRAZY.spot[1] - CRAZY.spot[0]), ang = world.rand() * Math.PI * 2;
    a.x = x + Math.cos(ang) * r; a.y = y + Math.sin(ang) * r;
    const kb = kerbFor(world, a.x, a.y);
    if (!kb.e || Math.hypot(kb.x - a.x, kb.y - a.y) > 400) continue;
    const at = pavementBy(m, kb) || kerbSpot(m, { x: kb.x - Math.sin(kb.a || 0) * 40, y: kb.y + Math.cos(kb.a || 0) * 40 });
    if (!at || Math.hypot(at.x - x, at.y - y) < CRAZY.spot[0] * 0.6) continue;
    const roll = world.rand(), ti = roll < 0.45 ? 0 : roll < 0.8 ? 1 : 2;
    let tier = null, to = null;
    for (const t of [ti, (ti + 1) % 3, (ti + 2) % 3]) { to = pick(world, L, at.x, at.y, CRAZY.tiers[t].trip[0], CRAZY.tiers[t].trip[1]); if (to) { tier = t; break; } }
    if (!to) continue;
    const q = spawnNpc(world, 'casual', at.x, at.y, 'civ');
    q.npc.sar = p.pid; q.npc.keep = true; q.vx = 0; q.vy = 0; q.pp = 'hail'; q.appVer = (q.appVer || 0) + 1;
    (world.crazyFolk ||= new Set()).add(q.id);
    return { cust: q.id, tier, to: { x: to.x, y: to.y, name: to.label }, who: WHO[Math.floor(world.rand() * WHO.length)], board: 0 };
  }
  return null;
}
// the pavement beside the kerb point kb: out from the road either way to the first sidewalk tile, in plain sight
function pavementBy(m, kb) {
  const nx = -Math.sin(kb.a || 0), ny = Math.cos(kb.a || 0);
  for (const sd of [1, -1]) for (let d = 16; d <= 128; d += 8) {
    const x = kb.x + nx * sd * d, y = kb.y + ny * sd * d, t = m.tileAtPx(x, y);
    if (t === T.ROAD || t === T.BRIDGE) continue;
    if (t !== T.SIDEWALK) break;
    const tx = Math.floor(x / 32), ty = Math.floor(y / 32);
    if (m.inside(tx, ty) && m.bld[m.idx(tx, ty)] < 0) return { x: x + nx * sd * 10, y: y + ny * sd * 10 };
    break;
  }
  return null;
}
function drop(world, w) { const q = world.get(w.cust); if (q && !q.removed && !q.vehId) despawnNpc(world, q); if (world.crazyFolk) world.crazyFolk.delete(w.cust); }

function tip(world, p, v, word, base) {
  const j = p.job;
  j.combo = Math.min(CRAZY.comboMax, j.combo + 1);
  j.best = Math.max(j.best, j.combo);
  const n = base * j.combo;
  j.fare.tips += n;
  world.emit(v.x, v.y, { e: 'ctip', x: v.x, y: v.y, n: `${word} +$${n}${j.combo > 1 ? ` x${j.combo}` : ''}` });
}

function step(world, p, dt) {
  const j = p.job, now = world.time, ped = p.ped, v = world.get(j.truck);
  if (!v || v.removed || v.wreckAt) { finish(world, p, 'Your cab is wrecked!'); return; }
  const driving = ped && ped.vehId === v.id && ped.seat === 0, speed = Math.hypot(v.vx, v.vy);
  if (j.stage === 'ready') {
    if (!driving) return;
    j.clockAt = now + CRAZY.startS; j.stage = 'pickup'; j.hitAt = v.hardHitAt || 0;
    world.emit(v.x, v.y, { e: 'ctip', x: v.x, y: v.y, n: 'GO!' });
  }
  j.expires = j.clockAt + 60;
  if (now >= j.clockAt) { finish(world, p, 'Time\'s up!'); return; }
  // a crash: the combo's gone
  if ((v.hardHitAt || 0) > j.hitAt) { j.hitAt = v.hardHitAt; if (v.hardHit > CRAZY.bump && j.combo) { j.combo = 0; world.emit(v.x, v.y, { e: 'ctip', x: v.x, y: v.y, n: 'CRASH! combo lost' }); } }
  // the fares waiting round you: kept topped up, the ones left far behind gone
  j.waiting = j.waiting.filter((w) => { const q = world.get(w.cust); const keep = q && !q.removed && !q.dead && Math.hypot(q.x - v.x, q.y - v.y) < 2600; if (!keep) drop(world, w); return keep; });
  if (!j.fare && j.waiting.length < CRAZY.waiting && world.tick % 10 === 0) { const w = newWaiter(world, p, v.x, v.y); if (w) { j.waiting.push(w); p.meDirty = true; } }
  const f = j.fare;
  if (!f) {
    if (!driving) { setText(p, 'Crazy Taxi: back in your cab!'); return; }
    setText(p, "Crazy Taxi: pick up a fare - stop by a ring");
    for (const w of j.waiting) {
      const q = world.get(w.cust);
      if (!q || Math.hypot(q.x - v.x, q.y - v.y) > CRAZY.boardR + v.def.L / 2 || speed > CRAZY.boardV) { w.board = 0; continue; }
      w.board += dt;
      if (w.board < CRAZY.boardS) continue;
      const seat = [2, 3, 1].find((i) => i < v.seats.length && !v.seats[i]);
      if (seat === undefined) continue;
      v.seats[seat] = q.id; q.vehId = v.id; q.seat = seat; q.pp = null; q.appVer = (q.appVer || 0) + 1;
      const d = Math.hypot(w.to.x - v.x, w.to.y - v.y), par = CRAZY.parS + d / CRAZY.pxS;
      j.fare = { ...w, d, par, onAt: now, until: now + par, tips: 0 };
      j.waiting = j.waiting.filter((o) => o !== w);
      j.stage = 'go';
      world.emit(v.x, v.y, { e: 'door', x: v.x, y: v.y });
      world.notify(p, `${cap(w.who)}: "${w.to.name}! Step on it!"`, 'good', `To ${w.to.name}`);
      p.meDirty = true;
      return;
    }
    return;
  }
  const q = world.get(f.cust);
  if (!q || q.removed || q.vehId !== v.id) { endFare(world, p); return; }
  const fl = Math.max(0, f.until - now);
  if (fl <= 0) {   // too slow: out they get
    setDown(world, v, q);
    if (world.crazyFolk) world.crazyFolk.delete(q.id);
    j.combo = 0;
    world.emit(v.x, v.y, { e: 'ctip', x: v.x, y: v.y, n: `"I'LL WALK!"` });
    endFare(world, p);
    return;
  }
  setText(p, `Crazy Taxi: ${f.who} to ${f.to.name}`);
  if (driving) {
    // the tips: a near miss, a drift, a dash
    if (speed > CRAZY.nearV) for (const o of world.query(v.x, v.y, 220, K.VEH)) {
      if (o === v || o.hitchTo === v.id || (j.near.get(o.id) || -99) > now - 3) continue;
      const hw = v.def.W / 2, hl = v.def.L / 2;
      if (obbVsObb(v.x, v.y, v.a, hl + CRAZY.nearPx, hw + CRAZY.nearPx, o.x, o.y, o.a, o.def.L / 2, o.def.W / 2) && !obbVsObb(v.x, v.y, v.a, hl + 2, hw + 2, o.x, o.y, o.a, o.def.L / 2, o.def.W / 2)) { j.near.set(o.id, now); tip(world, p, v, 'NEAR MISS', CRAZY.nearTip); }
    }
    if (v.drift && speed > 220) { if (j.driftT >= 0 && (j.driftT += dt) >= CRAZY.driftS) { j.driftT = -1; tip(world, p, v, 'DRIFT', CRAZY.driftTip); } } else j.driftT = 0;
    if (speed > v.def.max * CRAZY.dashK) { if ((j.dashT += dt) >= CRAZY.dashS) { j.dashT = -2; tip(world, p, v, 'DASH', CRAZY.dashTip); } } else if (j.dashT > 0) j.dashT = 0;
  }
  if (speed > CRAZY.dropV || Math.hypot(v.x - f.to.x, v.y - f.to.y) > CRAZY.dropR) return;
  // there: the pay, the seconds back
  const share = fl / f.par, [, word, pk, bk] = RATE.find(([lo]) => share >= lo), T = CRAZY.tiers[f.tier];
  const pay = Math.round(T.pay * pk + f.tips), secs = Math.round(T.bonus * bk);
  j.clockAt = Math.min(now + CRAZY.maxS, j.clockAt + secs);
  j.done++; j.cash += pay; j.tips += f.tips;
  p.profile.cash += pay;
  setDown(world, v, q);
  if (world.crazyFolk) world.crazyFolk.delete(q.id);
  world.emit(v.x, v.y, { e: 'cash', x: v.x, y: v.y, n: pay });
  world.emit(v.x, v.y, { e: 'ctip', x: v.x, y: v.y, n: `${word} +${secs}s` });
  endFare(world, p);
  store.touch();
}
function endFare(world, p) { const j = p.job; j.fare = null; j.stage = 'pickup'; p.meDirty = true; }
function setText(p, t) { if (p.job.text !== t) { p.job.text = t; p.meDirty = true; } }

export const rankOf = (cash) => CRAZY.rank.find(([lo]) => cash >= lo)[1];
// the run's over: the fare aboard and the ones waiting gone, the summary card, the cab to bring back
function finish(world, p, why) {
  const j = p.job, v = world.get(j.truck);
  if (j.fare) { const q = world.get(j.fare.cust); if (q && v && q.vehId === v.id) setDown(world, v, q); if (world.crazyFolk) world.crazyFolk.delete(j.fare.cust); }
  for (const w of j.waiting) drop(world, w);
  const prof = p.profile, prev = prof.crazyBest || 0, sum = { t: 'crazyend', why, fares: j.done, cash: j.cash, tips: j.tips, combo: j.best, rank: rankOf(j.cash), best: Math.max(prev, j.cash), record: j.cash > prev && j.cash > 0 };
  prof.crazyBest = sum.best;
  if (p.conn) p.conn.sendJSON(sum);
  world.notify(p, `${why} Crazy Taxi: ${j.done} fare${j.done === 1 ? '' : 's'}, $${j.cash} (tips $${j.tips}), licence ${sum.rank}${sum.record ? ' - a new best!' : ''}.`, 'good');
  jobs.jobDone(world, p);
  store.touch();
}

export function update(world, dt) {
  if (world.crazyFolk && world.tick % 40 === 7) for (const id of [...world.crazyFolk]) {   // (anyone waiting for a run that's gone)
    const q = world.get(id), p = q && world.players.get(q.npc && q.npc.sar);
    const mine = p && p.job && p.job.type === 'crazy' && (p.job.waiting.some((w) => w.cust === id) || (p.job.fare && p.job.fare.cust === id));
    if (!mine) { world.crazyFolk.delete(id); if (q && !q.removed && !q.vehId) despawnNpc(world, q); }
  }
  for (const p of world.players.values()) if (p.job && p.job.type === 'crazy') step(world, p, dt);
}

export function target(world, p, j) {
  const v = world.get(j.truck);
  const marks = j.fare ? [] : j.waiting.map((w) => { const q = world.get(w.cust); return q ? [Math.round(q.x), Math.round(q.y), CRAZY.tiers[w.tier].col] : null; }).filter(Boolean);
  if (j.fare) return { text: j.text, x: Math.round(j.fare.to.x), y: Math.round(j.fare.to.y), stage: 'go', crazy: 1 };
  let best = null, bd = Infinity;
  for (const [x, y] of marks) { const d = v ? Math.hypot(x - v.x, y - v.y) : 0; if (d < bd) { bd = d; best = [x, y]; } }
  const at = best || (v ? [v.x, v.y] : [j.rank.x, j.rank.y]);
  return { text: j.text, x: Math.round(at[0]), y: Math.round(at[1]), stage: j.stage === 'ready' ? 'wait' : 'pickup', crazy: 1, marks };
}
// the HUD card: the clock (left, s 'clock') and the fare it's on
export function cardInfo(world, j) {
  return { left: j.stage === 'ready' ? CRAZY.startS : Math.round(left(world, j)), s: 'clock', ...(j.fare || j.done ? { u: 'Fare', n: j.done + (j.fare ? 1 : 0) } : null), ...(j.fare ? { fl: Math.max(0, Math.round(j.fare.until - world.time)) } : null) };
}

// dev ('crazycab'): a run, the cab beside you on the street and you at the wheel - the clock going
export function devCrazy(world, p) {
  const ped = p.ped;
  if (!ped || ped.dead) return 'On your feet first.';
  if (p.job) jobs.failJob(world, p, '[dev] job dropped');
  const err = start(world, p, { x: ped.x, y: ped.y, name: 'here' });
  if (err) return err;
  const v = world.get(p.job.truck), k = kerbFor(world, ped.x, ped.y);
  if (v && !ped.vehId) {
    if (k.e) { v.x = k.x; v.y = k.y; v.a = k.a || 0; } v.vx = 0; v.vy = 0; world.place(v);
    v.seats[0] = ped.id; ped.vehId = v.id; ped.seat = 0; ped.x = v.x; ped.y = v.y; p.teleportAt = world.time; world.place(ped); p.meDirty = true;
  }
  return null;
}
