// The other bathhouses and the showers out in the world (nat5, the owner 2026-10-31: "Also can we add a few more bath
// houses and showers into the world?" - server/systems/bathhouse.js, showers.js, shared/homelayout.js bathonsen / bathkr /
// bathspa / bathsea, shared/world3-showers.js): each house's floor whole and walkable, its own pieces and what they do -
// the onsen's rock pools, the jjimjilbang's sauna and heated floor, every house's cold plunge and the contrast after the
// heat - its bathers going through the routine to the house's own pools; an outdoor shower washing you; the phone's
// Places listing the houses; the art of every piece. (World v3's houses and showers where they are: world3server.test.js)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport } from './helpers.js';
import { BATH } from '../shared/rules-play.js';
import { layout, useAt, blocked, TILE_IN } from '../shared/homelayout.js';
import * as bath from '../server/systems/bathhouse.js';
import * as showers from '../server/systems/showers.js';
import * as players from '../server/systems/players.js';
import * as homeinside from '../server/systems/homeinside.js';

const STYLES = { onsen: ['spring', 'bath', 'steam'], kr: ['sauna', 'bath', 'plunge', 'lounge', 'shower'], spa: ['bath', 'steam', 'sauna', 'plunge', 'lounge'], sea: ['bath', 'plunge', 'shower'] };
// the tiles you can reach from the door, paid
function reach(L) {
  const seen = new Set(), q = [[Math.floor(L.spawn.x / TILE_IN), Math.floor(L.spawn.y / TILE_IN)]];
  while (q.length) {
    const [x, y] = q.pop(), k = x + ',' + y;
    if (seen.has(k) || x < 0 || y < 0 || x >= L.cols || y >= L.rows || blocked(L, (x + 0.5) * TILE_IN, (y + 0.5) * TILE_IN, 10, 0, true)) continue;
    seen.add(k); q.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return seen;
}
function door(w, p, style) {
  const poi = { id: w.map.pois.length, kind: 'delivery', label: `Test ${style}`, x: p.ped.x + 10, y: p.ped.y, r: 40, bath: style };
  w.map.pois.push(poi);
  return poi;
}

test('each house\'s floor: the lobby and the locker rooms, its own pools and rooms all within reach, its bathers\' way to each', () => {
  for (const [style, uses] of Object.entries(STYLES)) {
    const L = layout('bath' + style, 2), G = bath._test.geoOf(L);
    assert.equal(L.bath, style, `${style}: the house's style`);
    assert.equal(G.sides.length, 2);
    for (const S of G.sides) assert.ok(S.showers.length >= 3, `${style}: the locker room's showers for the bathers`);
    const got = new Set();
    for (const k of reach(L)) { const [x, y] = k.split(',').map(Number); const u = useAt(L, (x + 0.5) * TILE_IN, (y + 0.5) * TILE_IN, 26); if (u) got.add(u.use); }
    for (const u of ['door', 'desk', 'locker', ...uses]) assert.ok(got.has(u), `${style}: the ${u} within reach (${[...got]})`);
    assert.ok(G.soaks.length >= 2, `${style}: more than the bath for its bathers (${G.soaks.map((q) => q.piece.use)})`);
    // the bathers' way up from the hall's front row to each: open floor all along
    for (const s of G.soaks) for (const tx of s.cols) for (let ty = s.piece.ty + s.piece.th; ty * TILE_IN < G.frontY; ty++) assert.ok(!L.solid(tx, ty), `${style}: ${s.piece.use} reached up column ${tx}`);
  }
  assert.equal(layout('bath', 2).bath, 'sento', 'the old houses: the sento');
});

test('the onsen\'s hot spring heals more and refreshes longer; the sauna\'s heat then the cold plunge: the contrast', async () => {
  const w = makeWorld();
  const { p } = joinPlayer(w, { cash: 100, bank: 0 });
  // the onsen: in the rock pool
  const poi = door(w, p, 'onsen');
  teleport(w, p.ped, poi.x, poi.y);
  const it = players.findInteraction(w, p);
  assert.match(it.label, new RegExp(`\\$${BATH.fees.onsen} at the desk`), 'the onsen\'s own fee');
  assert.equal(bath.devIn(w, p, { style: 'onsen', at: 'spring' }), null);
  const s = p.ped.home;
  assert.equal(s.sk, 'spring');
  p.ped.hp = 40;
  run(w, BATH.soakS + 0.5);
  assert.ok(p.ped.hp >= 40 + BATH.springHeal * BATH.soakS - 1, `the spring's health (${p.ped.hp})`);
  assert.ok(p.ped.buffs.bath - w.time > BATH.buffS, 'a longer refresh than the bath\'s');
  homeinside.leave(w, p);
  // the jjimjilbang: the sauna, then the plunge within contrastS
  const kr = door(w, p, 'kr');
  teleport(w, p.ped, kr.x, kr.y);
  assert.equal(bath.devIn(w, p, { style: 'kr', at: 'sauna' }), null);
  assert.equal(p.ped.home.sk, 'sauna');
  assert.equal(p.ped.home.steam, 1, 'sat in it, not in water');
  run(w, BATH.soakS + 0.5);
  assert.ok(p.ped.home.hotAt > 0, 'hot');
  const h = bath.hallById(w, p.ped.home.id), L = bath.hallLayout(h), q = L.pieces.find((o) => o.use === 'plunge');
  const st = p.ped.home; st.seat = null; st.soak = 0; st.x = q.x + q.w / 2; st.y = q.y + q.h + 12;
  const pl = players.findInteraction(w, p);
  assert.match(pl.label, /cold plunge.*straight from the heat/);
  p.ped.hp = 50; p.ped.buffs.bath = 0;
  pl.run();
  assert.equal(p.ped.hp, 50 + BATH.contrastHeal, 'the contrast: health at once');
  assert.ok(p.ped.buffs.bath - w.time >= BATH.contrastBuffS - 1, 'and the longest refresh');
  // the heated floor: lie down on it
  st.seat = null; st.soak = 0;
  const fl = L.pieces.find((o) => o.use === 'lounge'); st.x = fl.x - 12; st.y = fl.y + fl.h / 2;
  const lie = players.findInteraction(w, p);
  assert.match(lie.label, /heated floor/);
  lie.run();
  assert.equal(st.sk, 'lounge');
  homeinside.leave(w, p);
});

test('each house\'s bathers: through the routine to the house\'s own pools, the sauna, the heated floor - inside the walls', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w, { cash: 100, bank: 0 });
  for (const style of Object.keys(STYLES)) {
    const poi = door(w, p, style);
    teleport(w, p.ped, poi.x, poi.y);
    players.findInteraction(w, p).run();
    const h = bath.hallOf(w, poi), L = bath.hallLayout(h), G = bath._test.geoOf(L);
    assert.equal(h.plan, 'bath' + style);
    const used = new Set();
    for (let k = 0; k < 24; k++) {
      const b = bath._test.newBather(w, h, G, L);
      const spot = b.path.find((q) => q[3] && (q[3].po === 'soak' || q[3].po === 'sit'));
      const gap = (q) => Math.hypot(Math.max(q.x - spot[0], 0, spot[0] - q.x - q.w), Math.max(q.y - spot[1], 0, spot[1] - q.y - q.h));   // (the nearest of them: the steam's seat is beside its stones)
      const piece = L.pieces.filter((q) => bath._test.SOAK[q.use] && gap(q) <= 16).sort((a, b) => gap(a) - gap(b))[0];
      assert.ok(piece, `${style}: a bather's soak in something (${spot})`);
      used.add(piece.use);
      for (const q of b.path) assert.ok(q[0] > 0 && q[1] > 0 && q[0] < L.w && q[1] < L.h, `${style}: inside`);
    }
    assert.ok(used.size >= 2, `${style}: the bathers use more than the bath (${[...used]})`);
    run(w, 2);
    homeinside.leave(w, p);
  }
});

test('an outdoor shower: on foot beside it, the action button - stand under it and the blood and the dirt wash off, a little health back', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w, { cash: 10, bank: 0 });
  // (somewhere quiet first: the spawn may be by a hospital's desk or a shop's door, whose talk would come first)
  const M = w.map, TL = 32, quiet = M.pois.filter(Boolean);
  for (let k = 0, done = false; k < 4000 && !done; k++) {
    const tx = M.x0 + ((k * 7919) % M.w), ty = M.y0 + ((k * 104729) % M.h);
    if (!M.inside(tx, ty) || M.tiles[M.idx(tx, ty)] !== 1) continue;
    const X = (tx + 0.5) * TL, Y = (ty + 0.5) * TL;
    if (quiet.some((q) => Math.hypot(q.x - X, q.y - Y) < 400)) continue;
    teleport(w, p.ped, X, Y); done = true;
  }
  const x = p.ped.x + 30, y = p.ped.y;
  w.map.props.push({ t: 'shower', x, y });
  delete w.map._showers;
  assert.ok(showers.showerNear(w, p.ped.x, p.ped.y), 'the shower in reach');
  p.ped.grime = { b: 0.7, d: 0.5 }; p.ped.bleeding = true; p.ped.hp = 50;
  const it = players.findInteraction(w, p);
  assert.match(it.label, /outdoor shower - wash off the blood and the dirt/);
  it.run();
  assert.equal(p.ped.bleeding, false, 'the bleeding stops');
  run(w, BATH.outS + 0.4);
  assert.equal(p.ped.grime, null, 'washed off');
  assert.ok(p.ped.hp >= 50 + BATH.outHeal - 0.01, 'a little health back');
  // stepping away cuts it short
  p.ped.grime = { b: 0.5, d: 0 };
  players.findInteraction(w, p).run();
  teleport(w, p.ped, p.ped.x - 60, p.ped.y);
  run(w, BATH.outS + 0.4);
  assert.ok(p.ped.grime && p.ped.grime.b > 0.3, 'stepped out from under it: still bloody');
  assert.equal(p.outShower, null);
});

test('the phone\'s Places and the map list the bathhouses; the region index names a bathhouse\'s door as one', async () => {
  const { PLACE_GROUPS } = await import('../client/phone.js').catch(() => ({ PLACE_GROUPS: null }));
  if (PLACE_GROUPS) assert.ok(PLACE_GROUPS.some((g) => g.kinds.includes('bathhouse')), 'a Places category');
  const { MAP_CATS, KIND_ICON } = await import('../client/mapwaypoints.js');
  assert.ok(MAP_CATS.some((g) => g.kinds.includes('bathhouse')) && KIND_ICON.bathhouse, 'the map\'s category and icon');
  const src = (await import('node:fs')).readFileSync(new URL('../shared/regionpack.js', import.meta.url), 'utf8');
  assert.match(src, /p\.bath \? 'bathhouse'/, 'the index lists them as bathhouses');
});

test('the new pieces\' art: every house\'s makers build; the shower block and the onsen\'s lodge in the bake', async () => {
  const { BATH_STYLE, bathFloor } = await import('../client/art2/props-bath.js');
  for (const [style, S] of Object.entries(BATH_STYLE)) {
    for (const [ch, make] of Object.entries(S.makers)) {
      const G = make(ch === 'u' ? 320 : 96, ch === 'u' ? 96 : ch === '_' ? 160 : 64, 2, 3).render(0, { px: 2 });
      let n = 0; for (let i = 3; i < G.col.length; i += 4) if (G.col[i]) n++;
      assert.ok(n > 30, `${style} ${ch}: nothing drawn`);
    }
  }
  assert.ok(bathFloor('onsen', ':', 10, 10, 5, 5), 'the onsen\'s flagstones');
  const { showerHut } = await import('../client/art2/props-wild.js');
  const { onsenLodge } = await import('../client/art2/props-garden.js');
  for (const m of [showerHut(), onsenLodge()]) { const G = m.render(0, { px: 2 }); let n = 0; for (let i = 3; i < G.col.length; i += 4) if (G.col[i]) n++; assert.ok(n > 200); }
});
