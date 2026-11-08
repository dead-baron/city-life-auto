// The event calendar and the extraction payouts (docs/PROGRESSION.md "Extraction and scheduled events";
// server/systems/calendar.js, server/systems/extract.js): a wall-clock scheduler (rules.js EVENTS) that survives a restart,
// the armored truck run (carbon-gold, bank to bank by road, clear of the new characters' places) and the dock shipment,
// the crates paid only on delivery (a fence, a bank, the police's recovery, the home stash) and lost with them, and who
// sees them on the map (gold: everyone; steel and iron: the chunks round them).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport } from './helpers.js';
import { K, T, CHUNK_PX } from '../shared/constants.js';
import { EVENTS, EVENT_GRACE_S, CRATE_PAY, EXTRACT, ARMORED_EVENT, DOCK_EVENT } from '../shared/rules.js';
import { EVENT_KINDS } from '../shared/worldevents.js';
import * as calendar from '../server/systems/calendar.js';
import * as extract from '../server/systems/extract.js';
import * as streetlife from '../server/systems/streetlife.js';
import * as cargo from '../server/systems/cargo.js';
import * as jobs from '../server/systems/jobs.js';
import * as events from '../server/systems/events.js';
import * as phone from '../server/systems/phone.js';
import { guideSections } from '../shared/guide.js';

const ROADISH = new Set([T.ROAD, T.BRIDGE, T.LOT, T.PLAZA, T.SIDEWALK]);
const AR = EVENTS.find((e) => e.id === 'armored'), DK = EVENTS.find((e) => e.id === 'dock');
function setup() {
  const w = makeWorld({ npcBudget: 120 });
  const { p } = joinPlayer(w);
  run(w, 0.2);
  w.street = { live: [], nextAt: 1e9, last: '' };
  w.nextHappenAt = 1e9; w.nextPetAt = 1e9; w.nextDropAt = 1e9;
  return { w, p };
}
// a player carrying a fresh valuable crate at (x, y)
function carrying(w, p, tier, extractOpts, x, y) {
  teleport(w, p.ped, x, y);
  const c = w.spawnCrate(tier, x, y, { contraband: !!extractOpts.stolen, value: CRATE_PAY[tier] });
  c.extract = { ev: null, from: { x: x + 5000, y }, ...extractOpts };
  cargo.pickUp(w, p.ped, c);
  return c;
}
const poi = (w, kind) => w.map.pois.find((q) => q.kind === kind);
// what the player's been told (the toasts sent down their connection, and any not sent yet)
const told = (p, re) => p.toasts.some((t) => re.test(t.text)) || p.conn.sent.some((m) => re.test(typeof m === 'string' ? m : JSON.stringify(m)));

test('the calendar: the armored truck run and the dock shipment on, gang war, crackdown, race night and the cup listed for later', () => {
  assert.deepEqual(EVENTS.map((e) => e.id), ['armored', 'dock', 'gangwar', 'crackdown', 'racenight', 'soccercup']);
  assert.deepEqual(EVENTS.filter((e) => e.on).map((e) => e.id), ['armored', 'dock']);
  assert.equal(AR.periodS, 1800, 'every 30 minutes');
  assert.equal(DK.periodS, 3600, 'hourly');
  for (const e of EVENTS) assert.ok(e.periodS > 0 && e.durationS > 0 && e.durationS < e.periodS && e.offsetS >= 0 && e.offsetS < e.periodS && e.title, e.id);
  for (const k of ['gold', 'cargo', 'dock']) assert.ok(EVENT_KINDS[k] && EVENT_KINDS[k].label, k);
  assert.ok(EVENT_KINDS.gold.noArrow && EVENT_KINDS.cargo.noArrow, 'a marker on the map, not a guide arrow');
});

test('the scheduler: occurrences on the wall clock; started inside the grace window after a restart, not after it', () => {
  const base = Date.UTC(2026, 10, 7, 12, 0, 0);   // (12:00 UTC: the armored run's period starts at :10 and :40)
  const o = calendar.occurrence(AR, base);
  assert.equal(new Date(o.start).toISOString(), '2026-11-07T11:40:00.000Z');
  assert.equal(o.end - o.start, AR.durationS * 1000);
  const n = calendar.nextOccurrence(AR, base);
  assert.equal(new Date(n.start).toISOString(), '2026-11-07T12:10:00.000Z');
  assert.equal(n.k, o.k + 1);
  assert.equal(new Date(calendar.nextOccurrence(DK, base).start).toISOString(), '2026-11-07T12:35:00.000Z');
  // due: once, at the start or a little after it (a restart then still starts it), never late
  const at = n.start, started = new Set();
  assert.equal(calendar.due(AR, at - 1000, started), null, 'not before its time');
  assert.equal(calendar.due(AR, at + 2000, started).k, n.k);
  assert.ok(calendar.due(AR, at + (EVENT_GRACE_S - 1) * 1000, new Set()), 'a server back up inside the grace window starts it');
  assert.equal(calendar.due(AR, at + (EVENT_GRACE_S + 5) * 1000, new Set()), null, 'later than that it waits for the next');
  started.add(calendar.keyOf(AR, n.k));
  assert.equal(calendar.due(AR, at + 3000, started), null, 'never twice');

  // run in a world on a stopped clock: it starts on time with someone online, and is in the city feed
  const { w, p } = setup();
  let now = at - 5000;
  calendar.setClock(() => now);
  try {
    run(w, 2);
    assert.equal(calendar.liveRuns(w).length, 0, 'not yet');
    const L0 = calendar.listing(w, p).find((e) => e.id === 'armored');
    assert.ok(L0.etaS > 0 && L0.etaS <= 7 && !L0.live, `the countdown (${L0.etaS}s)`);
    now = at + 1000;
    run(w, 2);
    const live = calendar.liveRuns(w).filter((r) => r.id === 'armored');
    assert.equal(live.length, 1, 'the armored truck run started');
    assert.ok(events.feedFor(w).items.some((f) => /Armored truck run/.test(f.text)), 'a line in the city feed');
    run(w, 2);
    assert.equal(calendar.liveRuns(w).filter((r) => r.id === 'armored').length, 1, 'once');
    const L1 = calendar.listing(w, p).find((e) => e.id === 'armored');
    assert.ok(L1.live && L1.etaS === 0 && L1.x !== null);
    // the phone's City feed app has it, with the rest of the calendar
    const msg = phone.handle(w, p, { a: 'feed' });
    assert.ok(msg.cal && msg.cal.length === EVENTS.length && msg.cal.find((e) => e.id === 'gangwar').on === false);
    // the "What's next" cards
    const cards = calendar.eventCards(p, now, w);
    assert.ok(cards.length >= 2);
    for (const c of cards) {
      assert.equal(c.source, 'event');
      assert.ok(c.id && c.title && typeof c.sub === 'string' && Number.isFinite(c.etaS) && c.pay > 0);
      assert.ok(c.action.type === 'waypoint' && Number.isFinite(c.action.x) && Number.isFinite(c.action.y));
    }
    assert.equal(cards[0].etaS, 0, 'the one on now first');
    // nobody online: it doesn't run
    const w2 = makeWorld({ npcBudget: 0 });
    now = calendar.nextOccurrence(DK, now).start + 1000;
    run(w2, 2);
    assert.equal(calendar.liveRuns(w2).length, 0);
  } finally { calendar.setClock(null); }
});

test('the armored truck run\'s routes: bank to bank on the roads, the length the rules say, clear of every new character\'s place', () => {
  const { w } = setup();
  const R = calendar.armoredRoutes(w), net = w.map.net, spots = calendar.ftueSpots(w);
  assert.ok(R.length >= 1, 'at least one route');
  assert.ok(spots.length >= 3, 'the arrival stations, their lots and alleys');
  for (const r of R) {
    assert.equal(r.from.kind, 'bank'); assert.equal(r.to.kind, 'bank');
    assert.ok(r.len >= ARMORED_EVENT.runPx[0] && r.len <= ARMORED_EVENT.runPx[1], `${r.len} px`);
    // a chain of roads from the junction by one bank to the junction by the other
    let n = r.n0;
    for (const eid of r.edges) { const nx = net.nodes[n].links[eid]; assert.ok(nx !== undefined, `edge ${eid} leaves junction ${n}`); n = nx; }
    assert.equal(n, w.map.nearestNode(r.to.x, r.to.y).id, 'ends by the bank it goes to');
    let pts = 0, on = 0;
    for (const eid of r.edges) {
      const e = net.edges[eid];
      for (let i = 1; i < e.pts.length; i++) for (let f = 0; f < 1; f += 0.25) {
        const x = e.pts[i - 1].x + (e.pts[i].x - e.pts[i - 1].x) * f, y = e.pts[i - 1].y + (e.pts[i].y - e.pts[i - 1].y) * f;
        for (const q of spots) assert.ok(Math.hypot(q.x - x, q.y - y) >= ARMORED_EVENT.ftuePx, 'clear of the FTUE areas');
        if (e.lvl) continue;
        pts++; if (ROADISH.has(w.map.tileAtPx(x, y))) on++;
      }
    }
    assert.ok(on / pts > 0.97, `on the roads (${on}/${pts})`);
  }
  assert.deepEqual(calendar.armoredPlan(w, 7), R[7 % R.length], 'an occurrence keeps its route');
});

test('the armored truck run: carbon-gold aboard, two guards, nobody in the back, no squad car, on the roads; its gold on everyone\'s map', () => {
  const { w, p } = setup();
  const { p: far } = joinPlayer(w);
  const r = calendar.startNow(w, 'armored');
  assert.ok(r, 'started');
  const sev = r.sev, van = w.get(sev.van);
  assert.deepEqual(sev.load, new Array(ARMORED_EVENT.gold).fill(4));
  assert.equal(sev.guards.length, 2); assert.equal(sev.back, 0); assert.equal(sev.escort, 0);
  assert.ok(Math.hypot(van.x - r.plan.from.x, van.y - r.plan.from.y) < 700, 'leaves from its bank');
  // a player across the map sees the gold; a guard rides along
  teleport(w, far.ped, van.x + CHUNK_PX * 12, van.y);
  let samples = 0, onRoad = 0;
  for (let k = 0; k < 40 * 20; k++) {
    w.step();
    if (k % 20 === 0 && !sev.attackedAt) { samples++; if (ROADISH.has(w.map.tileAtPx(van.x, van.y))) onRoad++; }
    if (k === 200) { p.badge = true; teleport(w, p.ped, van.x + 60, van.y + 60); }
  }
  assert.ok(onRoad / samples > 0.9, `on the roads (${onRoad}/${samples})`);
  const seen = extract.visibleTo(w, far);
  assert.ok(seen.some((m) => m.k === 'gold' && Math.hypot(m.x - van.x, m.y - van.y) < 200), 'the gold on a far player\'s map');
  const me = events.forPlayer(w, far) || [];
  assert.ok(me.some((m) => m.k === 'gold'), 'sent in me.happen');
  assert.ok(!me.some((m) => m.k === 'armored'), 'not twice');
  // robbed: its gold crates spill, valuables paid on delivery, still on everyone's map
  van.hp -= 40; van.lastAttacker = p.ped.id; p.badge = false;
  run(w, 1);
  assert.ok(sev.attackedAt);
  const evc = streetlife.live(w).find((e) => e === sev);
  assert.ok(evc);
  van.wreckAt = w.time; run(w, 1);
  const crates = [...w.entities.values()].filter((e) => e.kind === K.CRATE && e.armored === sev.id);
  assert.equal(crates.length, ARMORED_EVENT.gold);
  for (const c of crates) { assert.equal(c.tier, 4); assert.equal(c.value, CRATE_PAY[4]); assert.ok(c.extract.stolen && c.extract.ev === r.key); }
  run(w, 1);
  assert.ok(extract.visibleTo(w, far).filter((m) => m.k === 'gold').length >= ARMORED_EVENT.gold, 'the spilled gold too');
});

test('the run delivered: the officers and hunters who stayed with it are paid for the escort', () => {
  const { w, p } = setup();
  const r = calendar.startNow(w, 'armored');
  p.badge = true;
  const bank0 = p.profile.bank;
  r.guardT.set(p.pid, ARMORED_EVENT.guardMinS + 1);
  const van = w.get(r.sev.van);
  van.x = r.sev.goal.x; van.y = r.sev.goal.y; w.place(van);
  run(w, 2);
  assert.equal(r.sev.how, 'delivered');
  assert.ok(r.over);
  assert.equal(p.profile.bank, bank0 + ARMORED_EVENT.guardPay);
});

test('the dock shipment: steel and iron on the quay, first come, first served, cleared at the end', () => {
  const { w, p } = setup();
  const r = calendar.startNow(w, 'dock');
  assert.ok(r);
  const cs = r.crates.map((id) => w.get(id));
  assert.equal(cs.filter((c) => c.tier === 2).length, DOCK_EVENT.steel);
  assert.equal(cs.filter((c) => c.tier === 3).length, DOCK_EVENT.iron);
  run(w, 1);
  for (const c of cs) {
    assert.ok(!c.removed && c.extract && !c.extract.stolen && !c.contraband, 'nobody\'s yet');
    assert.ok(Math.hypot(c.x - r.site.x, c.y - r.site.y) < 200);
    const t = w.map.tileAtPx(c.x, c.y);
    assert.ok(t !== T.WATER && t !== T.DEEP, 'on the quay');
  }
  assert.ok(events.feedFor(w).items.some((f) => f.kind === 'dock'), 'in the city feed');
  // steel and iron: only the players nearby see them
  teleport(w, p.ped, r.site.x + 100, r.site.y);
  run(w, 1);
  assert.ok(extract.visibleTo(w, p).filter((m) => m.k === 'cargo').length === cs.length, 'near: all of them');
  teleport(w, p.ped, r.site.x + CHUNK_PX * 3, r.site.y);
  assert.equal(extract.visibleTo(w, p).filter((m) => m.k === 'cargo').length, 0, 'three chunks off: none');
  // first come: picked up, it's theirs to carry
  teleport(w, p.ped, cs[0].x + 10, cs[0].y);
  cargo.pickUp(w, p.ped, cs[0]);
  assert.equal(p.ped.carrying, cs[0].id);
  assert.equal(cs[0].extract.by, p.pid);
});

test('payouts only on delivery: a fence pays a criminal, the bank vault an honest hauler, the police recover what was stolen', () => {
  const crim = { badge: false, hunter: false, wanted: 2 }, honest = { wanted: 0 }, cop = { badge: true, wanted: 0 }, hunter = { hunter: true, wanted: 0 };
  const stolen = { tier: 4, value: CRATE_PAY[4], extract: { stolen: true } }, dock = { tier: 3, value: CRATE_PAY[3], extract: { stolen: false } };
  assert.equal(extract.payout(stolen, crim, 'fence').bank, CRATE_PAY[4] * EXTRACT.fence);
  assert.ok(extract.payout(stolen, crim, 'fence').xp > 0, 'Criminal EXP');
  assert.equal(extract.payout(stolen, cop, 'fence'), null, 'not for an officer on duty');
  assert.equal(extract.payout(stolen, crim, 'vault'), null, 'the bank won\'t take it from someone wanted');
  assert.equal(extract.payout(dock, honest, 'vault').bank, Math.round(CRATE_PAY[3] * EXTRACT.vault));
  assert.equal(extract.payout(dock, honest, 'vault').kind, 'vault');
  assert.equal(extract.payout(stolen, cop, 'vault').kind, 'recover');
  assert.equal(extract.payout(stolen, cop, 'vault').bank, Math.round(CRATE_PAY[4] * EXTRACT.recover));
  assert.equal(extract.payout(stolen, cop, 'police').pts, EXTRACT.recoverPts);
  assert.equal(extract.payout(stolen, hunter, 'police').kind, 'recover', 'a bounty hunter too');
  assert.equal(extract.payout(stolen, hunter, 'police').pts, 0);
  assert.equal(extract.payout(dock, cop, 'police'), null, 'nothing to recover');
  assert.equal(extract.payout({ tier: 3 }, honest, 'vault'), null, 'an ordinary crate isn\'t one of these');
});

test('delivered, lost, recovered: the money moves only at the door', () => {
  const { w, p } = setup();
  const fence = poi(w, 'fence') || poi(w, 'smuggler'), bank = poi(w, 'bank');
  // delivered to the fence
  let c = carrying(w, p, 4, { src: 'armored', stolen: true }, fence.x, fence.y);
  let bank0 = p.profile.bank, cash0 = p.profile.cash;
  run(w, 1);
  assert.equal(p.profile.bank, bank0, 'nothing for carrying it');
  const z = jobs.deliveryZoneFor(w, p, c);
  assert.ok(z && /Fence the carbon-gold case/.test(z.label), z && z.label);
  z.run();
  assert.equal(p.profile.bank, bank0 + CRATE_PAY[4]);
  assert.equal(p.profile.cash, cash0);
  assert.ok(c.removed && !p.ped.carrying);
  run(w, 1);
  assert.ok(!told(p, /payout with it/), 'not lost: delivered');
  // lost: into the water on the way - nothing, and they're told
  c = carrying(w, p, 3, { src: 'dock', stolen: false }, fence.x, fence.y);
  run(w, 1);
  bank0 = p.profile.bank;
  cargo.dropCrate(w, p.ped);
  w.remove(c);   // (gone: the water took it)
  run(w, 1);
  assert.equal(p.profile.bank, bank0);
  assert.ok(told(p, /payout with it/), 'told it\'s lost');
  // recovered: an officer brings a stolen one to a bank
  p.badge = true; p.wanted = 0;
  c = carrying(w, p, 4, { src: 'armored', stolen: true }, bank.x, bank.y);
  bank0 = p.profile.bank;
  const sam0 = p.profile.samaritan, pts0 = p.profile.policePts || 0;
  const zr = jobs.deliveryZoneFor(w, p, c);
  assert.ok(zr && /Return the stolen/.test(zr.label), zr && zr.label);
  zr.run();
  assert.equal(p.profile.bank, bank0 + Math.round(CRATE_PAY[4] * EXTRACT.recover));
  assert.equal(p.profile.samaritan, sam0 + EXTRACT.recoverSam);
  assert.equal(p.profile.policePts, pts0 + EXTRACT.recoverPts);
  // not at the counter it came from: a crate has to come from somewhere first
  p.badge = false;
  c = carrying(w, p, 3, { src: 'dock', stolen: false }, bank.x, bank.y);
  c.extract.from = { x: bank.x, y: bank.y };
  assert.match(jobs.deliveryZoneFor(w, p, c).label, /has to come from somewhere else/);
});

test('a home\'s stash keeps a crate (an old save without one loads), and gives it back at the door', () => {
  const { w, p } = setup();
  delete p.profile.stash;
  assert.ok(extract.stashCrate(p.profile, 3), 'a reward delivered home (weekly goals)');
  assert.equal(p.profile.stash.crates.length, 1);
  const opts = [];
  extract.homeOpts(p, opts);
  assert.equal(opts.length, 1);
  assert.match(opts[0].label, /iron vault/);
  assert.equal(extract.takeOut(w, p, 0), null);
  const c = w.get(p.ped.carrying);
  assert.ok(c && c.tier === 3 && c.extract && c.value === CRATE_PAY[3]);
  assert.equal(p.profile.stash.crates.length, 0);
  assert.equal(extract.payout(c, p, 'home').kind, 'stash');
  for (let i = 0; i < EXTRACT.stashMax; i++) extract.stashCrate(p.profile, 2);
  assert.equal(extract.stashCrate(p.profile, 2), false, 'up to stashMax');
});

test('the Guide teaches the crates and the calendar from the rules', () => {
  const S = guideSections(), earn = S.find((s) => s.id === 'earn').entries;
  const cr = earn.find((e) => e.id === 'valuables'), ev = earn.find((e) => e.id === 'calendar');
  assert.ok(cr && ev);
  assert.ok(cr.b.includes('$' + CRATE_PAY[4].toLocaleString('en-US')));
  assert.match(ev.b, new RegExp(`every ${AR.periodS / 60} minutes`, 'i'));
});
