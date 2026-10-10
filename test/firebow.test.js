// The two bows (the owner's notes, 2026-10-10: "the hunting bow fires a flaming arrow ... the flaming arrow shouldn't be
// for the hunting bow. I'd like to keep the Flaming Arrow Bow weapon (call it something cool)"): the Hunting Bow looses
// plain arrows - no fire, no smoke behind them - and the Emberfang Bow's arrows burn: they hurt more, set a vehicle
// burning and light a campfire they come down by, and burn away (none left lying to pick up). The hunting lodge keeps one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeWorld, joinPlayer, teleport, run } from './helpers.js';
import { WEAPONS, WEAPON_BY_INDEX, SHOPS } from '../shared/items.js';
import { FIRE_ARROW } from '../shared/rules.js';
import { K } from '../shared/constants.js';
import * as combat from '../server/systems/combat.js';
import * as campfires from '../server/systems/campfires.js';
import * as npc from '../server/systems/npc.js';

const src = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
// every event from here on (the world clears its list each tick)
const evs = (w, e) => w.log.filter((ev) => ev.e === e);
function archer(id) {
  const w = makeWorld();
  w.log = []; const emit = w.emit.bind(w); w.emit = (x, y, ev) => { w.log.push(ev); return emit(x, y, ev); };
  const { p } = joinPlayer(w);
  const at = w.map.natureSites.find((s) => s.name === 'Giants Loop');
  teleport(w, p.ped, at.x + 200, at.y - 300);
  for (const arr of w.map.solidProps.values()) for (const e of arr) if (Math.abs(e.y - p.ped.y) < 80 && Math.abs(e.x - p.ped.x) < 700) e.off = true;
  p.profile.weapons[id] = 10; p.ped.weapon = id; p.ped.mag[id] = 1; p.ped.a = 0; p.ped.protectUntil = 0;
  w.events.length = 0;
  return { w, p };
}

test('the Hunting Bow looses plain arrows; the Emberfang Bow is the fire bow, sold rarely', () => {
  const bow = WEAPONS.bow, fb = WEAPONS.firebow;
  assert.equal(bow.name, 'Hunting Bow'); assert.ok(!bow.fire, 'the hunting bow: no fire');
  assert.ok(fb && fb.type === 'bow' && fb.fire && fb.name === 'Emberfang Bow', 'the fire bow');
  assert.ok(fb.i < 32 && WEAPON_BY_INDEX[fb.i] === fb, 'a weapon index of its own (fits the wire\'s five bits)');
  const sellers = Object.entries(SHOPS).filter(([, s]) => (s.buy || []).some((o) => o.kind === 'weapon' && o.id === 'firebow')).map(([k]) => k);
  assert.deepEqual(sellers, ['lodge'], 'only the hunting lodge keeps one');
  const offer = SHOPS.lodge.buy.find((o) => o.kind === 'weapon' && o.id === 'firebow');
  assert.ok(offer.price > 4 * SHOPS.lodge.buy.find((o) => o.kind === 'weapon' && o.id === 'bow').price, 'and dear');
  assert.ok(SHOPS.lodge.buy.some((o) => o.kind === 'ammo' && o.id === 'firebow'), 'fire arrows to go with it');
  // the client: no flame or smoke behind a hunting arrow (it was every projectile's rocket trail); the fire arrow burns
  const main = src('client/main.js');
  assert.match(main, /for \(const pr of F\.projs\) \{ const w = pr\.d && pr\.d\.w; if \(w === 24\) continue; if \(w === 30\)/, 'the trail: rockets and fire arrows only');
  assert.match(src('client/art2/game/actors.js'), /\(w \| 0\) === 30 \? objRender\('firearrow', fireArrowModel/, 'art v2: a fire arrow of its own');
  assert.match(src('client/art2/game/peds.js'), /firebow: 'emberBow'/, 'and the bow of its own, in the hand');
  assert.match(src('client/render/peds.js'), /case 30: \{/, 'the classic renderer draws it too');
});

test('fire arrows burn: more hurt than a plain arrow, a burst of flame, none left lying; a hunting arrow is plain and can be picked up', () => {
  const hurt = (id) => {
    const { w, p } = archer(id);
    const v = npc.spawnNpc(w, 'casual', p.ped.x + 150, p.ped.y);
    v.npc.state = 'idle'; v.hp = v.maxHp = 1000;
    w.rand = () => 0.5;
    combat.tryAttack(w, p.ped, 0);
    run(w, 0.6);
    return { took: 1000 - v.hp, hit: evs(w, 'arrowhit')[0] };
  };
  const plain = hurt('bow'), fire = hurt('firebow');
  assert.ok(plain.hit && !plain.hit.f, 'a hunting arrow: plain');
  assert.ok(fire.hit && fire.hit.f === 1, 'a fire arrow: in flames');
  assert.ok(fire.took > plain.took + FIRE_ARROW.burn * 0.5, `it burns (${fire.took.toFixed(0)} vs ${plain.took.toFixed(0)})`);
  // a miss into open ground: a hunting arrow lies there to pick up; a fire arrow burns away
  for (const [id, lies] of [['bow', true], ['firebow', false]]) {
    const { w, p } = archer(id);
    combat.tryAttack(w, p.ped, Math.PI / 2);
    run(w, 1.5);
    const st = evs(w, 'arrowstick')[0];
    assert.ok(st && !!st.f === !lies, `${id}: comes down ${lies ? 'plain' : 'burning'}`);
    assert.equal(!!(w.arrows || []).find((a) => a.owner === p.ped.id), lies, `${id}: ${lies ? 'lies there' : 'burnt away'}`);
  }
});

test('fire arrows set a vehicle burning and light a campfire they land by', () => {
  const shootCar = (id) => {
    const { w, p } = archer(id);
    const car = w.spawnVehicle('sedan', p.ped.x + 160, p.ped.y, 0, { npcOwned: false });
    const hp0 = car.hp;
    combat.tryAttack(w, p.ped, 0);
    for (let i = 0; i < 12 && car.hp === hp0; i++) run(w, 0.05);
    return { dmg: hp0 - car.hp, burning: car.burnUntil > w.time };
  };
  const plain = shootCar('bow'), fire = shootCar('firebow');
  assert.ok(plain.dmg > 0 && fire.dmg > 2.5 * plain.dmg, `it hurts the car more than an arrow would (${fire.dmg.toFixed(1)} vs ${plain.dmg.toFixed(1)})`);
  assert.ok(fire.burning && !plain.burning, 'and sets it burning a while');
  const { w } = archer('firebow');
  // a campfire: an arrow landing by it lights it
  const fires = w.map.props.map((q, i) => [q, i]).filter(([q]) => q && q.t === 'campfire');
  assert.ok(fires.length, 'campfires on the map');
  const [cf, i] = fires.find(([, j]) => !campfires.isLit(w, j)) || fires[0];
  if (campfires.isLit(w, i)) campfires.setLit(w, i, false);
  const { w: w2, p: p2 } = archer('firebow');
  if (campfires.isLit(w2, i)) campfires.setLit(w2, i, false);
  teleport(w2, p2.ped, cf.x - 40, cf.y - 200);
  for (const arr of w2.map.solidProps.values()) for (const e of arr) if (Math.abs(e.x - cf.x) < 60 && e.y > cf.y - 260 && e.y < cf.y + 20 && e !== cf) e.off = true;
  p2.ped.mag.firebow = 1; p2.ped.reloadUntil = 0; p2.ped.nextAttack = 0;
  // loose it to come down right by the fire: aimed at the fire, the range cut so it lands there
  const a = Math.atan2(cf.y - p2.ped.y, cf.x - p2.ped.x);
  assert.ok(combat.tryAttack(w2, p2.ped, a), 'loosed');
  const proj = [...w2.entities.values()].find((e) => e.kind === K.PROJ && e.weapon === 'firebow');
  assert.ok(proj, 'a fire arrow in flight');
  proj.maxDist = Math.hypot(cf.x - proj.x, cf.y - proj.y) - 4;
  run(w2, 1);
  assert.ok(evs(w2, 'arrowstick').some((e) => e.f === 1), 'it comes down burning');
  assert.ok(campfires.isLit(w2, i), 'the campfire catches');
});

test('a deflected arrow drops: it falls a step off the blade and lies a while (both renderers); a fire arrow flares and burns away', async () => {
  for (const id of ['bow', 'firebow']) {
    const { w, p } = archer(id);
    const v = joinPlayer(w).p.ped;   // (someone guarding with the plasma blade, facing the archer)
    teleport(w, v, p.ped.x + 150, p.ped.y);
    v.hp = v.maxHp = 1000; v.protectUntil = 0; v.weapon = 'plasma'; v.player.profile.weapons.plasma = 1;
    w.rand = () => 0.5;
    combat.tryAttack(w, p.ped, 0);
    for (let i = 0; i < 12; i++) { v.a = Math.PI; v.guardUntil = w.time + 1; w.step(); }
    const dr = evs(w, 'arrowdrop')[0];
    assert.ok(evs(w, 'deflect').length && dr, `${id}: turned aside, it drops`);
    assert.equal(v.hp, 1000, 'unhurt');
    assert.ok(!evs(w, 'arrowhit').length && !evs(w, 'arrowstick').length);
    const d = Math.hypot(dr.x - v.x, dr.y - v.y);
    assert.ok(d > 8 && d < 45, `near where it was turned (${d | 0} px)`);
    assert.equal(Math.hypot(dr.sx - v.x, dr.sy - v.y) < 2, true, '(from the blade)');
    assert.equal(dr.f, id === 'firebow' ? 1 : 0);
    assert.ok(!(w.arrows || []).length, 'not one to pick up');
  }
  // the clients: a pooled chunk thrown down to where it rests, tagged for art v2; a fire arrow flares and goes sooner
  const { vdmg } = await import('../client/render/vehdmg.js');
  for (const f of [0, 1]) {
    const calls = [], fires = [];
    const fx = { chunks: [{}, {}, {}], ci: 0, chunk(...a) { calls.push(a); const o = this.chunks[this.ci]; this.ci = (this.ci + 1) % 3; o.on = true; o.vp = null; o.rest = a[13]; }, fire: (x, y) => fires.push([x, y]), smoke() {}, sparks() {} };
    vdmg({ S: { fx, ents: new Map() } }, { e: 'arrowdrop', x: 130, y: 100, sx: 100, sy: 100, a: 0.3, f });
    assert.equal(calls.length, 1, 'one chunk');
    const [, , , , , , , x, y, vx, vy] = calls[0];
    assert.deepEqual([x, y], [100, 100], 'thrown from the blade');
    assert.ok(vx > 0 && Math.abs(vy) < 1e-9, 'toward where it rests');
    assert.equal(fx.chunks[0].vp.k, 'arrow', '(art v2 draws it: host.js _particles)');
    assert.ok(Math.abs(fx.chunks[0].a - 0.3) < 1e-9, 'lying the way it glanced');
    assert.equal(fires.length > 0, !!f, f ? 'a fire arrow flares where it lands' : 'a plain one just drops');
    assert.ok(f ? fx.chunks[0].rest < 2 : fx.chunks[0].rest >= 3, 'lies a few seconds (a fire arrow burns away sooner)');
  }
  const host = src('client/art2/game/host.js');
  assert.ok(/_arrowDrop\(c, o\)/.test(host) && /c\.vp\.k === 'arrow'/.test(host), 'art v2 draws a dropped arrow');
  assert.ok(/case 'arrowdrop'/.test(src('client/main.js')), 'the classic page hands it on');
});
