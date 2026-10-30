// Home upgrades (server/systems/homeups.js; shared/homeups.js; the owner's notes 2, 10-24): the floors, the basement and
// the rooms laid out walkable; the garage's menu - firewood stacked or put towards an upgrade, the bag's stone and scrap
// unloaded, paid for the rest and built; up and down the stairs; the amenities (the fireplace, the hot tub, the bar, the
// exercise bike) and the workbench; the parking spaces, the garden beds; what a sale pays; the materials in the bag.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport, players } from './helpers.js';
import { layout, useAt, blocked, TILE_IN, planOf } from '../shared/homelayout.js';
import { ROOMS, ROOM_IDS, UPS, specOf, levelsOf, roomsOn, slotsOf, roomId, STAIRS, MATS, matOfItem } from '../shared/homeups.js';
import { PIECES, SHOP_KINDS } from '../shared/homedecor.js';
import { HOME_IN } from '../shared/rules.js';
import { HOME_UPS, MAT_PRICE, HOME_STORE, HOME_CRAFTS, HOME_AMEN } from '../shared/rules-play.js';
import { ITEMS, itemCat, SHOPS } from '../shared/items.js';
import { undergroundOf, PICKS } from '../shared/underground.js';
import * as economy from '../server/systems/economy.js';
import * as homes from '../server/systems/homes.js';
import * as homeinside from '../server/systems/homeinside.js';
import * as homeups from '../server/systems/homeups.js';
import * as gardening from '../server/systems/gardening.js';
import * as cargo from '../server/systems/cargo.js';
import * as ug from '../server/systems/underground.js';
import * as felling from '../server/systems/felling.js';

// the tiles walkable from the way in (4-way), and what's in reach of them
function reach(L) {
  const seen = new Set(), q = [[Math.floor(L.spawn.x / TILE_IN), Math.floor(L.spawn.y / TILE_IN)]];
  while (q.length) { const [x, y] = q.pop(); if (seen.has(x + ',' + y) || L.solid(x, y)) continue; seen.add(x + ',' + y); q.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]); }
  const uses = new Set();
  for (const c of seen) { const [x, y] = c.split(',').map(Number); const u = useAt(L, (x + 0.5) * TILE_IN, (y + 0.5) * TILE_IN, HOME_IN.reach); if (u) uses.add(u.use); }
  return { seen, uses };
}

test('the levels and rooms: every room kind in every slot of every level walkable from the stairs, the ground floor with its stairs as walkable as ever', () => {
  for (const plan of ['house', 'mansion', 'trailer']) for (const tier of [0, 2, 3]) {
    // the ground floor: the stairs up, down or both - the door, the bed... and the stairs all in reach
    for (const code of plan === 'trailer' ? ['d'] : ['u', 'd', 'ud']) {
      const L = layout(`${plan}~0~${code}`, tier), { uses } = reach(L);
      assert.equal(L.key, plan, 'drawn as the home it is');
      for (const u of ['door', 'bed', 'wardrobe', 'safe', 'fridge', 'shower', 'hall', 'stairs']) assert.ok(uses.has(u), `${plan} ${code} tier ${tier}: the ${u}`);
      if (plan !== 'trailer') assert.ok(uses.has('garage'), `${plan}: the garage`);
      const [sx, sy] = STAIRS[plan].at;
      assert.ok(L.cell(sx, sy) === '^' && L.cell(sx + 1, sy + 1) === '^', 'the stairs where they go');
      assert.ok(!blocked(L, L.arrive.x, L.arrive.y), 'off the stairs onto open floor');
    }
    for (const lv of [1, 2, -1]) {
      const n = slotsOf(plan, lv);
      if (!n) continue;
      for (const k of ROOM_IDS) {
        const R = ROOMS[k];
        if (!(lv > 0 ? R.up : R.down)) continue;
        for (let slot = 0; slot < n; slot++) {
          const rooms = new Array(n).fill('-'); rooms[slot] = k;
          const L = layout(`${plan}~${lv}~${rooms.join(',')}`, tier);
          assert.equal(L.key, lv > 0 ? 'upper' : 'cellar');
          assert.ok(L.grid.every((r) => r.length === L.cols), 'square');
          assert.ok(!L.door, 'no front door up or down the stairs');
          const { seen, uses } = reach(L);
          assert.ok(uses.has('stairs'), `${plan} ${lv} ${k}: the stairs`);
          // every piece in the room with a use within reach, and the room entered
          const x0 = 1 + slot * 7;
          assert.ok(seen.has(`${x0 + 2},4`), `${plan} lv ${lv} ${k} in slot ${slot}: in through its doorway`);
          for (const p of L.pieces) if (p.use && p.tx >= x0 && p.tx < x0 + 6) {
            const ok = [...seen].some((c) => { const [x, y] = c.split(',').map(Number); const cx = (x + 0.5) * TILE_IN, cy = (y + 0.5) * TILE_IN; return Math.hypot(Math.max(p.x - cx, 0, cx - p.x - p.w), Math.max(p.y - cy, 0, cy - p.y - p.h)) <= HOME_IN.reach + 2; });
            assert.ok(ok, `${plan} lv ${lv} ${k}: its ${p.use} (${p.ch}) in reach`);
          }
          // the empty slots shut off
          for (let o = 0; o < n; o++) if (o !== slot) assert.ok(!seen.has(`${1 + o * 7 + 2},4`), 'an empty room has no way in');
        }
      }
    }
  }
  // the specs: the plan's own key while nothing's built; the levels and their rooms as built
  assert.equal(specOf('house', 0, null), 'house');
  const u = { b: ['floor2', 'basement', roomId(1, 2, 'gym')] };
  assert.deepEqual(levelsOf('house', u), [-1, 0, 1]);
  assert.equal(specOf('house', 0, u), 'house~0~ud');
  assert.equal(specOf('house', 1, u), 'house~1~bed,-,gym');
  assert.equal(specOf('house', -1, u), 'house~-1~store,-,-');
  assert.deepEqual(roomsOn('house', u, 1), ['bed', null, 'gym']);
  assert.equal(specOf('apartment', 1, u), 'apartment', 'an apartment has no floors to add');
});

test('the catalogue: every upgrade and room has its cost; the amenities are pieces you place, never sold at the counter; materials have a bag category', () => {
  for (const id of Object.keys(UPS)) assert.ok(HOME_UPS[id] && HOME_UPS[id].labour > 0, `${id}: its cost`);
  for (const k of ROOM_IDS) assert.ok(HOME_UPS[`room:${k}`], `room ${k}: its cost`);
  for (const id of Object.keys(UPS)) if (UPS[id].piece) { assert.ok(PIECES[UPS[id].piece] && PIECES[UPS[id].piece].am && PIECES[UPS[id].piece].use, `${id}: an amenity piece with a use`); assert.ok(!SHOP_KINDS.includes(UPS[id].piece), 'not at the counter'); }
  for (const k of Object.keys(HOME_CRAFTS)) assert.ok(PIECES[k], `the workbench makes ${k}`);
  for (const p of ['trailer', 'apartment', 'studio', 'penthouse', 'house', 'mansion']) assert.ok(Object.values(UPS).filter((U) => U.plans.includes(p)).length >= 4, `${p}: a few upgrades`);
  assert.equal(itemCat('stone'), 'materials'); assert.equal(itemCat('scrap'), 'materials');
  assert.equal(matOfItem('ironOre'), 'metal'); assert.equal(matOfItem('stone'), 'stone');
  assert.ok(SHOPS.hardware.buy.some((o) => o.id === 'stone' && o.price === MAT_PRICE.stone), 'the hardware store sells building stone');
  assert.ok(MATS.wood && MATS.stone && MATS.metal);
});

const poiOf = (w, h) => w.map.pois.find((q) => q.kind === 'home' && q.home === h.id);
function ownHome(w, p, kind = 'house') {
  const h = w.map.homes.find((q) => q.kind === kind && !w.homeOwner.has(q.id) && q.garage);
  teleport(w, p.ped, h.x, h.y);
  economy.handleMenu(w, p, poiOf(w, h).id, 'hbuy');
  assert.equal(w.homeOwner.get(h.id), p.pid);
  return h;
}
const lastMenu = (conn) => [...conn.sent].reverse().find((m) => m && m.t === 'menu');
const pick = (w, p, conn, re) => { const m = lastMenu(conn), o = m.opts.find((q) => re.test(q.id) || re.test(q.label)); assert.ok(o, `no option ${re} in ${m.title}: ${m.opts.map((q) => q.label).join(' | ')}`); economy.handleMenu(w, p, m.poi, o.id); return o; };
const bundle = (w, x, y) => { const c = w.spawnCrate(1, x, y, { label: felling.FIREWOOD_LABEL, value: 45, contraband: false }); c.logs = true; c.wood = true; return c; };

test('the garage: firewood on the bed stacked or put towards a floor upstairs, the bag unloaded, the rest paid for - and up the stairs it is', () => {
  const w = makeWorld();
  const { p, conn, prof } = joinPlayer(w, { bank: 1e6 });
  const h = ownHome(w, p);
  // drive up with three bundles on the back: the garage's menu
  const v = w.spawnVehicle('flatbed', h.garage.x, h.garage.y, 0, { npcOwned: false });
  for (let i = 0; i < 3; i++) { const c = bundle(w, v.x, v.y); c.state = 'loaded'; c.parent = v.id; c.slot = i; v.cargo[i] = c.id; }
  p.ped.vehId = v.id; p.ped.seat = 0; v.seats[0] = p.ped.id;
  let a = players.findInteraction(w, p);
  assert.match(a.label, /Your garage: stack the 3 bundles of firewood, or put them towards an upgrade/);
  a.run();
  let m = lastMenu(conn);
  assert.equal(m.poi, homeups.UP_POI);
  assert.ok(m.opts.some((o) => o.id === 'u:stack'), 'stack them');
  assert.ok(m.opts.some((o) => o.id === 'u:tw:floor2'), 'or put them towards the second floor');
  pick(w, p, conn, /^u:tw:floor2$/);
  assert.equal(prof.homeUp[h.id].p.floor2.wood, 3, 'three bundles in towards it');
  assert.ok(v.cargo.every((id) => !id), 'off the bed');
  // on foot with one more: stacked this time
  p.ped.vehId = 0; p.ped.seat = -1; v.seats[0] = 0; w.remove(v);
  teleport(w, p.ped, h.garage.x + 20, h.garage.y);
  const c = bundle(w, p.ped.x + 6, p.ped.y); cargo.pickUp(w, p.ped, c);
  a = players.findInteraction(w, p);
  assert.match(a.label, /Your garage: stack the firewood, or put it towards an upgrade/);
  a.run(); pick(w, p, conn, /^u:stack$/);
  assert.equal(homeups.matsAt(prof, h.id).wood, 1, 'one stacked');
  assert.equal(felling.woodAt(p, h), 1);
  // the bag's stone and scrap unloaded
  prof.inventory.stone = 5; prof.inventory.scrap = 2;
  a = players.findInteraction(w, p);
  assert.match(a.label, /Your garage at .* - materials and upgrades/);
  a.run(); pick(w, p, conn, /^u:unload$/);
  assert.deepEqual([prof.inventory.stone, prof.inventory.scrap], [0, 0]);
  assert.deepEqual([homeups.matsAt(prof, h.id).stone, homeups.matsAt(prof, h.id).metal], [5, 2]);
  // the upgrades: the second floor's card - put in what's here, pay for the rest
  pick(w, p, conn, /^u:list$/);
  pick(w, p, conn, /^u:card:floor2$/);
  m = lastMenu(conn);
  assert.match(m.sub, /firewood 3\/24/);
  pick(w, p, conn, /^u:put:floor2$/);
  const got = prof.homeUp[h.id].p.floor2;
  assert.deepEqual([got.wood, got.stone, got.metal], [4, 5, 2], 'the garage emptied into it');
  const C = HOME_UPS.floor2, owe = C.labour + (C.wood - 4) * MAT_PRICE.wood + (C.stone - 5) * MAT_PRICE.stone + (C.metal - 2) * MAT_PRICE.metal;
  const pay = lastMenu(conn).opts.find((o) => o.id === 'u:pay:floor2');
  assert.equal(pay.price, owe, 'the rest: the labour and what is missing');
  const bank0 = prof.bank + prof.cash;
  pick(w, p, conn, /^u:pay:floor2$/);
  assert.ok(homeups.levels(w, h).includes(1), 'built');
  assert.equal(bank0 - prof.bank - prof.cash, owe, 'paid that');
  // inside: the stairs in the hall, up them to the landing and its bedroom, down again
  teleport(w, p.ped, h.x, h.y);
  a = players.findInteraction(w, p); a.run();
  assert.ok(p.ped.home, 'in');
  const L0 = homeinside.planFor(h, w, 0);
  assert.equal(L0.spec, 'house~0~u');
  const st = L0.pieces.find((q) => q.use === 'stairs');
  p.ped.home.x = st.x - TILE_IN / 2; p.ped.home.y = st.y + TILE_IN;
  a = players.findInteraction(w, p);
  assert.match(a.label, /Up the stairs to the second floor/);
  a.run();
  assert.equal(p.ped.home.lv, 1);
  assert.ok(conn.sent.some((q) => q && q.t === 'home' && q.plan === 'house~1~bed,-,-' && q.lv === 1), 'the page is told the floor');
  const L1 = homeinside.planFor(h, w, 1);
  assert.ok(!blocked(L1, p.ped.home.x, p.ped.home.y), 'standing on the landing');
  const bed = L1.pieces.find((q) => q.use === 'bed');
  assert.ok(bed, 'a bedroom up here');
  // a room in the next empty slot, from the hall table's list (here: from the menu straight)
  homeups.openMenu(w, p, h, 'list');
  pick(w, p, conn, /^u:rooms:1$/);
  pick(w, p, conn, new RegExp(`^u:card:${roomId(1, 1, 'gym')}$`));
  pick(w, p, conn, /^u:pay:/);
  assert.equal(homeinside.planFor(h, w, 1).spec, 'house~1~bed,gym,-', 'a gym along the hall');
  // down again
  const s1 = homeinside.planFor(h, w, 1).pieces.find((q) => q.use === 'stairs');
  p.ped.home.x = s1.x + s1.w + 12; p.ped.home.y = s1.y + s1.h / 2;
  a = players.findInteraction(w, p);
  assert.match(a.label, /Down the stairs to the ground floor/);
  a.run();
  assert.equal(p.ped.home.lv || 0, 0);
  // garage space and the sale
  const cap0 = homes.garageCap(w, prof);
  homeups.devHomeUp(w, p, { build: ['parking1'] });
  assert.equal(homes.garageCap(w, prof), cap0 + 1, 'another parking space');
  homeinside.leave(w, p);
  const before = prof.bank;
  homes.sell(w, p, h);
  const ups = (homeups.priceOf('floor2') + homeups.priceOf(roomId(1, 1, 'gym')) + homeups.priceOf('parking1')) * HOME_STORE.back;
  assert.equal(prof.bank - before, Math.round(h.price * 0.6) + Math.round(ups), 'the upgrades fetch their share');
  assert.ok(!prof.homeUp[h.id], 'they go with the place');
});

test('inside: the fireplace burns a bundle and heals, the hot tub, the bar, the bike; the workbench makes furniture from the materials', () => {
  const w = makeWorld();
  const { p, conn, prof } = joinPlayer(w, { bank: 1e6 });
  const h = ownHome(w, p);
  homeups.devHomeUp(w, p, { build: ['fireplace', 'hottub', 'bar', 'bike', 'basement', roomId(-1, 1, 'workshop')], mats: { wood: 6, stone: 2, metal: 3 } });
  for (const k of ['fireplace', 'hottub', 'bar', 'exbike']) assert.equal(prof.furn[k], 1, `${k} in storage`);
  // placed in the living room (as Decorate would)
  prof.decor = { [h.id]: { it: [{ k: 'fireplace', tx: 1, ty: 5, r: 0 }, { k: 'bar', tx: 3, ty: 2, r: 0 }, { k: 'exbike', tx: 9, ty: 7, r: 0 }, { k: 'hottub', tx: 7, ty: 6, r: 0 }], plan: planOf(h) } };
  teleport(w, p.ped, h.x, h.y);
  homeinside.devIn(w, p, { id: h.id });
  const L = homeinside.planIn(w, h, 0), at = (use) => { const q = L.pieces.find((o) => o.use === use); assert.ok(q, `a ${use}`); for (let ty = 0; ty < L.rows; ty++) for (let tx = 0; tx < L.cols; tx++) { const x = (tx + 0.5) * TILE_IN, y = (ty + 0.5) * TILE_IN; if (blocked(L, x, y)) continue; const u = useAt(L, x, y, HOME_IN.reach); if (u && u.use === use) { p.ped.home.x = x; p.ped.home.y = y; return; } } assert.fail(`can't reach the ${use}`); };
  at('fire');
  let a = players.findInteraction(w, p);
  assert.match(a.label, /Light the fire \(a bundle of firewood - 6 in the garage\)/);
  a.run();
  assert.equal(homeups.matsAt(prof, h.id).wood, 5, 'a bundle burnt');
  assert.ok(homeups.fireOn(w, h));
  p.ped.hp = 50;
  run(w, 5);
  assert.ok(p.ped.hp >= 50 + HOME_AMEN.heal * 4, 'warm: healing');
  assert.ok(conn.sent.some((q) => q && q.t === 'home' && q.fire === 1), 'the page draws it lit');
  at('bar'); a = players.findInteraction(w, p); assert.match(a.label, /Pour yourself a glass/); a.run();
  assert.ok(p.ped.buffs.wine > w.time, 'the wine buff');
  at('tub'); a = players.findInteraction(w, p); assert.match(a.label, /hot tub/); a.run();
  assert.ok(p.ped.home.soak && p.ped.home.seat, 'soaking');
  p.ped.hp = 40; w.homeFire.clear();
  run(w, 2);
  assert.ok(p.ped.hp >= 40 + HOME_AMEN.tubHeal * 1.5, 'the tub heals fast');
  players.queueInput(p, { seq: 9001, bits: 0, mx: 1, my: 0, aim: 0 }); w.step();
  assert.ok(!p.ped.home.seat && !p.ped.home.soak, 'out of the tub');
  players.queueInput(p, { seq: 9003, bits: 0, mx: 0, my: 0, aim: 0 }); w.step();
  at('bike'); a = players.findInteraction(w, p); assert.match(a.label, /exercise bike/); a.run();
  const xp0 = ((prof.skills || {}).xp || {}).stamina || 0;
  run(w, HOME_AMEN.bikeS * 2 + 1);
  assert.ok((prof.skills.xp.stamina || 0) > xp0, 'stamina from the bike');
  players.queueInput(p, { seq: 9002, bits: 0, mx: -1, my: 0, aim: 0 }); w.step();
  // down to the workshop: the workbench makes a bookshelf from three bundles
  homeinside.toLevel(w, p, h, -1);
  const LB = homeinside.planIn(w, h, -1);
  const bench = LB.pieces.find((o) => o.use === 'bench');
  assert.ok(bench, 'the workshop has its bench');
  p.ped.home.x = bench.x + 16; p.ped.home.y = bench.y + bench.h + 14;
  a = players.findInteraction(w, p); assert.match(a.label, /workbench/); a.run();
  pick(w, p, conn, /^u:make:bookshelf$/);
  assert.equal(prof.furn.bookshelf, 1, 'a bookshelf in storage');
  assert.equal(homeups.matsAt(prof, h.id).wood, 5 - HOME_CRAFTS.bookshelf.wood, 'made of the firewood');
  // the basement's storeroom keeps more
  assert.equal(homeups.storeCap(prof, h), HOME_STORE.base.house + HOME_STORE.basement + HOME_STORE.room);
});

test('the yard: two more garden beds; stone knocked loose mining; a guest takes the stairs but not the fire', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w, { bank: 1e6 });
  const h = w.map.homes.find((q) => q.kind === 'house' && !w.homeOwner.has(q.id) && gardening.allSpots(w.map, q).length >= 6);
  assert.ok(h, 'a house with room in the yard for more beds');
  teleport(w, p.ped, h.x, h.y);
  economy.handleMenu(w, p, poiOf(w, h).id, 'hbuy');
  const n0 = gardening.plotsOf(w, h).length;
  assert.ok(homeups.offered(prof, h, w).some((o) => o.id === 'garden1'));
  homeups.devHomeUp(w, p, { build: ['garden1'] });
  assert.equal(gardening.plotsOf(w, h).length, n0 + 2, 'two more beds');
  assert.equal(gardening.plotSpots(w.map, h).length, n0, 'the ones it came with as ever');
  // mining: building stone with the ore
  const L = undergroundOf(w.map), v = L.veins.find((q) => !q.ug && q.need <= 2);
  prof.inventory.pickIron = 1;
  teleport(w, p.ped, v.x, v.y);
  ug.beginMining(w, p, v.i);
  run(w, PICKS.pickIron.s + 0.3);
  assert.ok((prof.inventory.stone || 0) >= 2, 'stone from the rock round the vein');
  assert.equal(ITEMS.stone.mat, 'stone');
  // a guest
  homeups.devHomeUp(w, p, { build: ['floor2', 'fireplace'] });
  const { p: q } = joinPlayer(w);
  teleport(w, p.ped, h.x, h.y);
  homeinside.devIn(w, p, { id: h.id });
  q.ped.home = { id: h.id, x: 200, y: 200, a: 0, mv: false, sleep: 0, shower: 0, eatAt: -9, guest: p.pid };
  q.ped.hidden = true; q.ped.inside = h.id;
  const st = homeinside.planFor(h, w, 0).pieces.find((o) => o.use === 'stairs');
  q.ped.home.x = st.x - TILE_IN / 2; q.ped.home.y = st.y + TILE_IN;
  const a = players.findInteraction(w, q);
  assert.match(a.label, /Up the stairs/);
  a.run();
  assert.equal(q.ped.home.lv, 1, 'the guest goes up');
  const fire = homeups.insideInteraction(w, q, h, q.ped.home, { use: 'fire' });
  assert.ok(fire.passive && /not yours/.test(fire.label), 'the fire is the owner\'s to light');
});
