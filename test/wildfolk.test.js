// The people of the wilds (Nature-C4, server/systems/wildfolk.js): rangers, backpackers and runners, birders, anglers at
// the holds, kayakers, climbers, foragers and campers, found on the map by rules, each where they belong, dressed for it,
// doing it in their kit; a word with a ranger tells you about the wilds round here; the riders on the dirt roads dressed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport, players } from './helpers.js';
import { K, T } from '../shared/constants.js';
import { PED_BLOCK } from '../shared/map.js';
import { decodeLook, PIECES } from '../shared/look.js';
import { spotsOf, fill } from '../server/systems/activities.js';
import { WILD_KINDS, tipsFor, compass, riderLook, dressWild } from '../server/systems/wildfolk.js';
import { wildStyle, habitatAt } from '../server/systems/wildlife.js';
import { _descriptor } from '../server/net.js';
import { spawnNpc } from '../server/systems/npc.js';

const w = makeWorld();
const m = w.map;
const S = spotsOf(m);
const of = (k) => S.list.filter((s) => s.k === k);
const clear = () => { for (const e of [...w.entities.values()]) if (e.kind === K.PED && !e.player) w.remove(e); w.acts = new Map(); w.actRest = new Map(); };
const people = (g) => g.ids.map((i) => w.get(i)).filter((e) => e && !e.pet);
const open = (x, y) => { const t = m.tileAtPx(x, y); return !PED_BLOCK[t] && t !== T.ROAD && t !== T.WATER && t !== T.DEEP; };
const wears = (e) => { const L = decodeLook(e.app.lk); return Object.values(L.outfit).filter(Boolean).map((o) => PIECES[o.id].name); };
const water = (x, y, a) => [24, 40, 60, 80].some((r) => { const t = m.tileAtPx(x + Math.cos(a) * r, y + Math.sin(a) * r); return t === T.WATER || t === T.DEEP; });

test('the people of the wilds have their places: found by rules, out in the wild country, on open ground', () => {
  for (const k of Object.keys(WILD_KINDS)) assert.ok(of(k).length >= 1, `some ${k} spots (${of(k).length})`);
  for (const k of Object.keys(WILD_KINDS)) for (const s of of(k)) {
    assert.ok(wildStyle(m, s.x, s.y), `${k}: out in the wilds`);
    assert.ok(open(s.x, s.y), `${k}: on open ground`);
  }
  for (const s of [...of('holds'), ...of('birders').filter((q) => !q.view)]) assert.ok(water(s.x, s.y, s.a), `${s.k}: facing the water`);
  for (const s of of('climbers')) { const hab = habitatAt(m, s.x, s.y); assert.ok(hab.mountain || hab.desert || wildStyle(m, s.x, s.y) === 'desert', 'climbers in the peaks or the canyons'); }
  for (const s of of('trail')) { assert.ok(s.route.length >= 5, 'a trail goes somewhere'); for (const q of s.route.slice(1)) assert.equal(m.tileAtPx(q.x, q.y), T.DIRT, 'along the dirt'); }
  for (const s of of('foragers')) for (const q of s.route) assert.ok((m.forage || []).some((f) => Math.hypot(f.x - q.x, f.y - q.y) < 20), 'from patch to patch');
  // spread out: no two of a kind on top of each other
  for (const k of Object.keys(WILD_KINDS)) { const L = of(k); for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) assert.ok(Math.hypot(L[i].x - L[j].x, L[i].y - L[j].y) > 300, `${k} spread out`); }
});

test('each in their kit: the ranger\'s hat, the backpacker\'s poles and pack, binoculars, the rod and the tackle box, the kayak, the rope, the basket, the camp stove', () => {
  clear();
  const kit = { ranger: ['Ranger hat'], birders: [], holds: [], kayakers: ['Life vest'], climbers: ['Climbing helmet'], foragers: [], campcook: [] };
  for (const [k, pieces] of Object.entries(kit)) {
    const g = fill(w, of(k)[0], { seen: true });
    assert.ok(g && g.ids.length, `${k} filled`);
    const ps = people(g);
    for (const e of ps) for (const name of pieces) assert.ok(wears(e).includes(name), `${k}: wears the ${name}`);
    const pp = ps.map((e) => _descriptor(e).pp).filter(Boolean);
    if (k === 'birders') assert.ok(pp.includes('binoculars'), 'binoculars up');
    if (k === 'holds') { assert.ok(pp.includes('tackle') && ps.every((e) => e.fishing), 'rods out, the tackle box'); }
    if (k === 'kayakers') assert.ok(pp.includes('kayak'), 'the kayak on the shoulder');
    if (k === 'climbers') { assert.ok(pp.includes('rope') && pp.includes('climbkit'), 'the rope, the kit'); assert.ok(ps.some((e) => _descriptor(e).gt === 'kneel'), 'one down by the kit'); }
    if (k === 'foragers') assert.ok(pp.includes('basket'), 'the basket');
    if (k === 'campcook') { assert.equal(ps[0].gt, 'sit'); assert.equal(_descriptor(ps[0]).pp, 'campstove'); }
  }
  // the trail: backpackers (poles, the trekking pack) or a runner - fill a few to see both
  let packs = 0, runners = 0;
  for (const s of of('trail')) {
    const g = fill(w, s, { seen: true });
    if (!g) continue;
    for (const e of people(g)) { const ws = wears(e); if (ws.includes('Trekking pack')) { packs++; assert.equal(_descriptor(e).pp, 'poles'); } else if (ws.includes('Running shoes')) runners++; }
  }
  assert.ok(packs > 0 && runners > 0, `backpackers (${packs}) and runners (${runners})`);
});

test('going about it: along the trail and back, the forager down on a knee at each patch, the ranger\'s beat with the radio, the kayaker along the shore', () => {
  clear();
  const { p } = joinPlayer(w);
  const tr = of('trail').find((s) => s.route.length >= 8) || of('trail')[0];
  teleport(w, p.ped, tr.x, tr.y + 900);
  const gt = fill(w, tr, { seen: true });
  const hiker = people(gt)[0], far = tr.route[tr.route.length - 1];
  let reach = Infinity, back = Infinity;
  for (let i = 0; i < 1400; i++) { run(w, 0.1); const d = Math.hypot(hiker.x - far.x, hiker.y - far.y); reach = Math.min(reach, d); if (reach < 30) back = Math.min(back, Math.hypot(hiker.x - tr.x, hiker.y - tr.y)); if (back < 30) break; }
  assert.ok(reach < 30, `out to the far end of the trail (${Math.round(reach)} px off)`);
  assert.ok(back < 30, `and back to the trailhead (${Math.round(back)})`);
  // the forager: from patch to patch, kneeling at each
  clear();
  const fs = of('foragers')[0];
  teleport(w, p.ped, fs.x, fs.y + 900);
  const gf = fill(w, fs, { seen: true }), fo = people(gf)[0], visited = new Set();
  let knelt = 0;
  for (let i = 0; i < 1600; i++) { run(w, 0.1); if (fo.gt === 'kneel') { knelt++; fs.route.forEach((q, j) => { if (Math.hypot(q.x - fo.x, q.y - fo.y) < 14) visited.add(j); }); } }
  assert.ok(knelt > 0 && visited.size >= 2, `down on a knee at the patches (${visited.size} of them)`);
  // the ranger: out and back, the radio now and then at the ends
  clear();
  const rs = of('ranger')[0];
  teleport(w, p.ped, rs.x, rs.y + 900);
  const gr = fill(w, rs, { seen: true }), rg = people(gr)[0];
  let radio = 0, out = Infinity;
  for (let i = 0; i < 1200; i++) { run(w, 0.1); if (rg.pp === 'radio') radio++; out = Math.min(out, Math.hypot(rg.x - rs.x2, rg.y - rs.y2)); }
  assert.ok(out < 20 && radio > 0, `the beat walked (${Math.round(out)}), a word on the radio (${radio})`);
  // the kayaker along the shore, the kayak up all the way
  clear();
  const ks = of('kayakers')[0];
  teleport(w, p.ped, ks.x, ks.y + 900);
  const gk = fill(w, ks, { seen: true }), ky = people(gk)[0];
  let kout = Infinity, down = 0;
  for (let i = 0; i < 600; i++) { run(w, 0.1); kout = Math.min(kout, Math.hypot(ky.x - ks.x2, ky.y - ks.y2)); if (ky.pp !== 'kayak') down++; }
  assert.ok(kout < 20 && down === 0, 'along the shore with the kayak up');
});

test('a word with the ranger: about the wilds round here - a find worth the trip and which way, what\'s protected; a new thing each time', () => {
  clear();
  const { p } = joinPlayer(w);
  const rs = of('ranger')[0];
  const g = fill(w, rs, { seen: true }), rg = people(g)[0];
  teleport(w, p.ped, rg.x + 20, rg.y + 6);
  const act = players.findInteraction(w, p);
  assert.ok(act && /ranger/i.test(act.label), `the prompt (${act && act.label})`);
  const said = [];
  for (let i = 0; i < 4; i++) { p.toasts.length = 0; p.rangerTalkAt = 0; players.findInteraction(w, p).run(); said.push(p.toasts.map((t) => t.text).join(' ')); }
  assert.ok(said.every((t) => /^Ranger: "/.test(t)), 'the ranger speaks');
  assert.equal(new Set(said).size, said.length, 'something new each time');
  assert.ok(said.some((t) => /protected/.test(t) && /\$\d+/.test(t)), 'what\'s protected, and the fine');
  const tips = tipsFor(w, p, rg);
  assert.ok(/(north|south|east|west)/.test(tips[0]) && /(just|walk|hike)/.test(tips[0]), `where a find is (${tips[0]})`);
  assert.ok(Math.abs(rg.a - Math.atan2(p.ped.y - rg.y, p.ped.x - rg.x)) < 0.01 || rg.npc.talkTo === p.ped.id, 'they turn to you');
  assert.equal(compass(0, -1), 'north'); assert.equal(compass(1, 1), 'south-east');
});

test('out on the dirt roads: the mountain bikers in their helmets, the dirt bikers in jersey and helmet', () => {
  assert.equal(riderLook('mtb'), 'mtbiker'); assert.equal(riderLook('dirtbike'), 'dirtbiker'); assert.equal(riderLook('sedan'), null);
  const s = of('trail')[0];
  const a = spawnNpc(w, 'hiker', s.x, s.y, 'driver'), b = spawnNpc(w, 'casual', s.x + 40, s.y, 'driver');
  dressWild(w, a, 'mtbiker', Math.random); dressWild(w, b, 'dirtbiker', Math.random);
  assert.ok(wears(a).includes('Bike helmet'), 'a bike helmet');
  assert.ok(wears(b).includes('MX jersey') && wears(b).includes('Moto helmet'), 'the jersey and the helmet');
});
