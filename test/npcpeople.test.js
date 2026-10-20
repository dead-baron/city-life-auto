// The city's people (task #365): every civilian NPC dressed from the wardrobe (server/systems/npclooks.js), shaded by
// district and hour, from bounded pools; the street personalities (server/systems/personas.js) where they belong, with
// their walks, props and ways.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport } from './helpers.js';
import { K, T, TILE, MAP_W, MAP_H } from '../shared/constants.js';
import { validLook, encodeLook, decodeLook, LOOK_CODE_LEN, PIECES } from '../shared/look.js';
import { RECIPES, recipeLook, poolFor, POOL_N, styleMix } from '../server/systems/npclooks.js';
import { PERSONAS, LOOKS, BUSKS, spawnPersona, spawnHere, interaction as busk } from '../server/systems/personas.js';
import { BUSKER_TIP, BUSKER_SAMARITAN } from '../shared/rules.js';
import { spawnNpc, onGunfire, onDeath } from '../server/systems/npc.js';
import { _descriptor } from '../server/net.js';

const w = makeWorld();
const m = w.map;
// a walkable pavement point in a district of this style
function spotIn(style, k = 0) {
  let seen = 0;
  for (let ty = 8; ty < MAP_H - 8; ty += 3) for (let tx = 8; tx < MAP_W - 8; tx += 3) {
    const x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE, t = m.tileAt(tx, ty);
    if (t !== T.SIDEWALK && t !== T.PLAZA && t !== T.GRASS && t !== T.SAND) continue;
    if (m.districtAt(x, y).style !== style) continue;
    if (seen++ === k * 40) return { x, y };
  }
  return null;
}
const tags = (L) => Object.values(L.outfit).filter(Boolean).flatMap((o) => PIECES[o.id].tags);
const share = (looks, tag) => looks.filter((L) => tags(L).includes(tag)).length / looks.length;
const clear = () => { for (const e of [...w.entities.values()]) if (e.kind === K.PED && !e.player) w.remove(e); };

test('every recipe gives whole, valid looks that travel as their code', () => {
  for (const [k, R] of [...Object.entries(RECIPES), ...Object.entries(LOOKS).map(([k, v]) => ['p:' + k, v])]) {
    for (let s = 0; s < 25; s++) {
      const g = recipeLook(k, s * 101 + 7, 'commercial', false, R);
      assert.ok(g && g.look, k);
      const code = encodeLook(g.look);
      assert.equal(code.length, LOOK_CODE_LEN, k);
      assert.deepEqual(decodeLook(code), validLook(g.look), `${k}: the code says it all`);
      assert.ok(g.look.outfit.shoes, `${k}: shoes on`);
      assert.ok(g.look.outfit.set || (g.look.outfit.top && g.look.outfit.bottoms) || PIECES[g.look.outfit.top?.id]?.name === 'Bare chest', `${k}: dressed`);
      assert.ok([0, 1, 2, 3].includes(g.bi), `${k}: a combat build`);
    }
  }
  // what they wear says what they are
  const L = (k, s, R = RECIPES[k]) => recipeLook(k, s, 'commercial', false, R).look;
  const names = (Lk) => Object.values(Lk.outfit).filter(Boolean).map((o) => PIECES[o.id].name);
  for (let s = 0; s < 10; s++) {
    assert.ok(names(L('construction', s)).includes('Hard hat') && names(L('construction', s)).includes('Hi-vis vest'), 'the hard hat and hi-vis');
    assert.ok(L('senior', s).body.age >= 4, 'seniors are in their sixties and seventies');
    assert.ok(names(L('p:swim', s, LOOKS.swim)).includes('Swim trunks') && names(L('p:swim', s, LOOKS.swim)).includes('Flip-flops') && names(L('p:swim', s, LOOKS.swim)).includes('Belt bag'), 'the purple swimsuit dancer');
    assert.equal(L('p:punk', s, LOOKS.punk).hair.style, 10, 'the punk\'s mohawk');
  }
  const ex = Array.from({ length: 40 }, (_, s) => L('executive', s));
  assert.ok(share(ex, 'business') > 0.6, 'executives in business clothes');
});

test('district shading: the beach dresses for the beach, downtown for business, the Strip at night for the club', () => {
  // (many looks, not one district's pool of POOL_N: a pool is a small sample, and how it falls moves with every piece added)
  const casual = (st, night = false) => Array.from({ length: 300 }, (_, i) => recipeLook('casual', 1000 + i * 31, st, night).look);
  assert.ok(share(casual('beach'), 'beach') > share(casual('towers'), 'beach') + 0.25, 'beach styles at the beach');
  assert.ok(share(casual('towers'), 'business') > share(casual('beach'), 'business') + 0.15, 'business downtown by day');
  assert.ok(share(casual('nightlife', true), 'nightclub') > share(casual('nightlife', false), 'nightclub') + 0.15, 'nightclub clothes on the Strip at night');
  assert.ok(share(casual('southside'), 'street') + share(casual('southside'), 'punk') > share(casual('luxury'), 'street') + share(casual('luxury'), 'punk'), 'the rough districts dress rougher');
  // uniforms of a sort don't change with the district
  assert.deepEqual(styleMix(RECIPES.construction, 'beach', false), [['work', 1]]);
  // and a spawned NPC at the beach is dressed from the beach pool
  const at = spotIn('beach');
  clear();
  const looks = Array.from({ length: 12 }, (_, i) => decodeLook(spawnNpc(w, 'casual', at.x + i * 30, at.y, 'civ').app.lk));
  assert.ok(share(looks, 'beach') > 0.3, 'beach clothes on the beach');
});

test('looks vary: people side by side never match, but a district\'s crowd reuses a bounded pool', () => {
  const at = spotIn('commercial');
  clear();
  const a = spawnNpc(w, 'casual', at.x, at.y, 'civ'), b = spawnNpc(w, 'casual', at.x + 12, at.y, 'civ');
  assert.ok(a.app.lk && b.app.lk && a.app.lk !== b.app.lk, 'two people side by side differ');
  const near = Array.from({ length: 14 }, (_, i) => spawnNpc(w, 'casual', at.x + (i % 4) * 20, at.y + Math.floor(i / 4) * 20, 'civ').app.lk);
  assert.equal(new Set([a.app.lk, b.app.lk, ...near]).size, 16, 'a crowd of sixteen, all different');
  // far apart, many of them: no more distinct looks than the pool holds
  clear();
  const codes = new Set();
  for (let i = 0; i < 120; i++) { const e = spawnNpc(w, 'casual', at.x, at.y, 'civ'); codes.add(e.app.lk); w.remove(e); }
  assert.ok(codes.size <= POOL_N, `${codes.size} distinct looks for 120 people (pool ${POOL_N})`);
  assert.ok(codes.size >= POOL_N * 0.7, 'and the pool is used');
  // the police in the issued uniform (CC5: the patrol shirt, now and then a sergeant's or a rookie's), as a look
  const cop = spawnNpc(w, 'cop', at.x, at.y, 'cop'), CL = decodeLook(cop.app.lk);
  assert.ok(CL && CL.outfit.top && /^(Uniform shirt|Sergeant's shirt)$/.test(PIECES[CL.outfit.top.id].name), 'police in the uniform');
  assert.equal(cop.app.t, 6, 'a uniform to the old renderer too');
});

test('NPC look data is compact: the code alone, sent once', () => {
  const at = spotIn('commercial');
  clear();
  const e = spawnNpc(w, 'executive', at.x, at.y, 'civ');
  const d = _descriptor(e);
  assert.deepEqual(Object.keys(d.app), ['lk']);
  assert.ok(JSON.stringify(d.app).length < 80, JSON.stringify(d.app));
  const p = spawnPersona(w, spawnNpc, 'cane', at.x + 40, at.y);
  const dp = _descriptor(p);
  assert.equal(dp.gt, 'hunch'); assert.equal(dp.pp, 'cane');
  assert.ok(JSON.stringify(dp).length < 200, JSON.stringify(dp));
});

test('the personalities: where they turn up, their walks and props, their ways', () => {
  clear();
  // only the ones who belong there
  const beach = spotIn('beach');
  for (let i = 0; i < 40; i++) {
    const p = spawnHere(w, spawnNpc, beach.x, beach.y, false);
    if (!p) continue;
    assert.ok(PERSONAS[p.npc.persona].w.some(([s]) => s === 'beach'), `${p.npc.persona} at the beach`);
    w.remove(p);
  }
  const tow = spotIn('towers');
  for (let i = 0; i < 30; i++) { const p = spawnHere(w, spawnNpc, tow.x, tow.y, false); if (p) { assert.notEqual(p.npc.persona, 'swim', 'no swimsuit dancing downtown'); w.remove(p); } }
  clear();
  // walks and props
  const at = spotIn('park');
  for (const [k, gt, pp] of [['cane', 'hunch', 'cane'], ['glam', 'strut', undefined], ['skater', 'skate', 'board'], ['blader', 'blade', undefined], ['homeless', 'push', 'cart'], ['phone', undefined, 'phone'], ['dancer', 'dance', undefined], ['swim', 'dance', undefined], ['trolley', undefined, 'trolley']]) {
    const p = spawnPersona(w, spawnNpc, k, at.x, at.y);
    assert.equal(p.npc.persona, k); assert.equal(p.gt, gt, k); assert.equal(p.pp, pp, k);
    assert.ok(p.app.lk, `${k} dressed from the wardrobe`);
  }
  { const p = spawnPersona(w, spawnNpc, 'busker', at.x, at.y); const B = BUSKS[p.npc.busk]; assert.ok(B, 'a busker\'s act'); assert.equal(p.pp, B.pp, 'busker'); assert.equal(p.gt, B.gt, 'busker'); assert.ok(p.app.lk, 'busker dressed from the wardrobe'); }
  clear();
  // the dog walker's three dogs, at heel out in front
  const dw = spawnPersona(w, spawnNpc, 'dogs', at.x, at.y);
  assert.equal(dw.dogs.length, 3);
  const dogs = dw.dogs.map((id) => w.get(id));
  assert.ok(dogs.every((d) => d.pet && d.pet.walked === dw.id && d.archetype.startsWith('pet:dog')), 'three dogs on leads');
  const { p: pl } = joinPlayer(w); teleport(w, pl.ped, at.x + 200, at.y);
  run(w, 4);
  for (const d of dogs) assert.ok(Math.hypot(d.x - dw.x, d.y - dw.y) < 60, 'the dogs keep with the walker');
  w.remove(dw); run(w, 1);
  // the tracksuit couple, in the same tracksuit, side by side
  const c1 = spawnPersona(w, spawnNpc, 'couple', at.x, at.y + 40), c2 = w.get(c1.npc.with2);
  const L1 = decodeLook(c1.app.lk), L2 = decodeLook(c2.app.lk);
  assert.ok(L1.outfit.set && L2.outfit.set && L1.outfit.set.c === L2.outfit.set.c, 'matching tracksuits');
  assert.notEqual(L1.body.base, L2.body.base);
  run(w, 3);
  assert.ok(Math.hypot(c1.x - c2.x, c1.y - c2.y) < 70, 'walking together');
  // the jogger runs laps
  const j = spawnPersona(w, spawnNpc, 'jogger', at.x, at.y);
  assert.ok(j.npc.laps && j.npc.laps.length >= 3, 'a lap route');
  const x0 = j.x, y0 = j.y; run(w, 1);
  const v = Math.hypot(j.x - x0, j.y - y0);
  assert.ok(v > 62, `jogging (${v.toFixed(0)} px/s)`);
  // tough guys don't back off from gunfire; the homeless man carries nothing to rob
  const t = spawnPersona(w, spawnNpc, 'tough', at.x + 60, at.y);
  onGunfire(w, at.x + 300, at.y, pl.ped);
  assert.notEqual(t.npc.state, 'flee', 'the tough guy stands his ground');
  const h = spawnPersona(w, spawnNpc, 'homeless', at.x - 60, at.y);
  assert.ok(h.npc.poor && h.npc.camp);
  const before = [...w.entities.values()].filter((e) => e.kind === K.BAG).length;
  onDeath(w, h, null);
  assert.equal([...w.entities.values()].filter((e) => e.kind === K.BAG).length, before, 'no cash, no loot');
  // a hot-dog seller at a food cart, a fisherman at a pier's rail with a line in the water, tourists with a map and a phone
  const cart = m.props.find((q) => q.t === 'foodcart' && m.districtAt(q.x, q.y).style !== 'water');
  const vd = spawnPersona(w, spawnNpc, 'vendor', cart.x, cart.y + 40);
  assert.ok(vd && Math.hypot(vd.x - cart.x, vd.y - cart.y - 18) < 3, 'the seller by the cart');
  let fsh = null;
  for (const q of m.props.filter((q) => q.t === 'pierrail')) { fsh = spawnPersona(w, spawnNpc, 'fisher', q.x, q.y); if (fsh) break; }
  assert.ok(fsh && fsh.fishing, 'fishing off the pier');
  run(w, 1);
  assert.ok(fsh.fishing && Math.hypot(fsh.vx, fsh.vy) < 1, 'still fishing');
  const tz = spawnPersona(w, spawnNpc, 'tourists', at.x, at.y);
  assert.equal(tz.pp, 'map'); assert.equal(w.get(tz.npc.with2).pp, 'phone');
});

test('street life: the busker plays for coins, people sit on benches, someone sleeps in the park', () => {
  clear();
  const at = spotIn('civic');
  const { p, prof } = joinPlayer(w, { cash: 50, samaritan: 0 });
  const b = spawnPersona(w, spawnNpc, 'busker', at.x, at.y);
  teleport(w, p.ped, b.x + 20, b.y);
  const it = busk(w, p);
  assert.ok(it && /Drop a coin/.test(it.label), 'drop a coin');
  it.run();
  assert.equal(prof.cash, 50 - BUSKER_TIP); assert.equal(prof.samaritan, BUSKER_SAMARITAN);
  assert.equal(busk(w, p), null, 'once in a while');
  run(w, 2);
  assert.ok(Math.hypot(b.x - b.npc.spot.x, b.y - b.npc.spot.y) < 14, 'the busker keeps his pitch');
  // a bench: walk to it, sit (the descriptor's sb), get up after a while
  clear();
  const park = spotIn('park');
  const { p: q } = joinPlayer(w); teleport(w, q.ped, park.x, park.y);
  let s = null;
  for (let k = 0; k < 30 && !s; k++) { const sp = spotIn('park', k); s = sp && spawnPersona(w, spawnNpc, 'bench', sp.x, sp.y); }
  assert.ok(s && s.npc.bench, 'someone heading for a bench');
  teleport(w, q.ped, s.x + 150, s.y);
  run(w, 4);
  assert.ok(s.sitBench, 'sitting on the bench');
  assert.equal(_descriptor(s).sb, 1);
  let z = null;
  for (let k = 0; k < 30 && !z; k++) { const sp = spotIn('park', k); z = sp && spawnPersona(w, spawnNpc, 'sleeper', sp.x, sp.y); }
  assert.ok(z && z.passedOut && z.npc.state === 'passed', 'asleep in the park');
  // a selfie at the fountain: the phone held up, facing away from it, for a while (and the descriptor not sent again and again)
  const f = m.props.find((q) => q.t === 'fountain');
  teleport(w, q.ped, f.x + 200, f.y);
  const sf = spawnPersona(w, spawnNpc, 'selfie', f.x + 40, f.y);
  assert.ok(sf && sf.filming === 2 && sf.npc.state === 'film', 'phone up');
  assert.ok(Math.cos(sf.a - Math.atan2(sf.y - f.y, sf.x - f.x)) > 0.9, 'the fountain behind them');
  const v0 = sf.appVer;
  run(w, 2);
  assert.equal(sf.filming, 2); assert.equal(sf.appVer, v0, 'sent once');  // leaning on a wall, a foot up behind
  let ln = null;
  for (let k = 0; k < 20 && !ln; k++) { const sp = spotIn('commercial', k); ln = sp && spawnPersona(w, spawnNpc, 'leaner', sp.x, sp.y); }
  assert.ok(ln && ln.gt === 'lean', 'someone leaning on a wall');
  const bx = ln.x - Math.cos(ln.a) * 20, by = ln.y - Math.sin(ln.a) * 20;
  assert.ok(m.buildingAtPx(bx, by), 'the wall behind them');
});

test('the walks and props are drawn: the client turns gt / pp / sb into the people renderer\'s poses and props', async () => {
  const Pd = await import('../client/art2/game/peds.js');
  const g = recipeLook('p:homeless', 3, 'park', false, LOOKS.homeless), code = encodeLook(g.look);
  const A = Pd.adaptApp({ lk: code }), Ap = Pd.withProp(A, 'cart');
  assert.equal(Ap.carry, 'cart');
  assert.notEqual(Pd.pedKey(A, 'idle', 0, 0, 0), Pd.pedKey(Ap, 'idle', 0, 0, 0), 'a prop is a sprite of its own');
  const plain = Pd.pedSprite(A, 'idle', 1, 0, 0), cart = Pd.pedSprite(Ap, 'push', 1, 0, 0);
  assert.ok(cart.w * cart.h > plain.w * plain.h * 1.3, 'the cart out in front');
  for (const [gt, pose] of [['hunch', 'walk0'], ['strut', 'walk1'], ['skate', 'walk2'], ['blade', 'walk1'], ['dance', 'idle'], ['push', 'walk0'], ['lean', 'idle']]) {
    const q = Pd.personaPose({ gt }, pose);
    assert.equal(q, gt);
    for (let f = 0; f < Pd.PED_POSES[q]; f++) { const G = Pd.pedSprite(Pd.withProp(A, gt === 'hunch' ? 'cane' : 'phone'), q, f % 8, f, 0); assert.ok(G.w > 10 && G.h > 30, `${q} ${f}`); }
  }
  assert.equal(Pd.personaPose({ gt: 'hunch' }, 'walk3'), 'walk3', 'running for their life: the plain run');
  assert.equal(Pd.personaPose({ sb: 1 }, 'idle'), 'sitx', 'a seat on the bench: one of the ways of sitting, held a while (peds.js sitFrame)');
  for (const pp of ['trolley', 'leads', 'guitar', 'call', 'cane', 'board', 'map']) assert.ok(Pd.pedSprite(Pd.withProp(A, pp), 'walk0', 2, 1, 0).w > 10, pp);
  assert.equal(Pd.pedFrame('hunch', 7), 5);
});

test('the buskers (Shared-9): five acts with their kit, a pitch by the fountain facing it, a crowd that stops to listen, a statue that bows for a coin', () => {
  clear();
  const f = m.props.find((q) => q.t === 'fountain' && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => m.tileAtPx(q.x + dx * 140, q.y + dy * 140) === T.PLAZA || m.tileAtPx(q.x + dx * 140, q.y + dy * 140) === T.SIDEWALK));
  assert.ok(f, 'a fountain with paving round it');
  const { p, prof } = joinPlayer(w, { cash: 50 }); teleport(w, p.ped, f.x + 400, f.y + 400);
  // by day, each act once - none twice near each other
  w.clock && (w.clock.isNight = false);
  const acts = new Map();
  for (let k = 0; k < 40 && acts.size < 3; k++) {
    const b = spawnPersona(w, spawnNpc, 'busker', f.x + ((k % 5) - 2) * 60, f.y + 60, false);
    if (b) acts.set(b.npc.busk, b);
  }
  assert.ok(acts.size >= 2, `acts at once round the fountain (${[...acts.keys()]})`);
  for (const [kind, b] of acts) {
    assert.ok(BUSKS[kind], kind);
    assert.equal(b.pp, BUSKS[kind].pp, `${kind}: its kit (the descriptor's pp)`);
    assert.equal(_descriptor(b).pp, BUSKS[kind].pp);
    const d = Math.hypot(b.x - f.x, b.y - f.y);
    if (d < 200 && b.npc.spot.a !== undefined) assert.ok(Math.abs(Math.atan2(Math.sin(b.npc.spot.a - Math.atan2(f.y - b.y, f.x - b.x)), Math.cos(b.npc.spot.a - Math.atan2(f.y - b.y, f.x - b.x)))) < 0.2, `${kind}: facing the fountain`);
  }
  assert.ok([...acts.values()].some((q) => q.npc.spot.a !== undefined && Math.hypot(q.x - f.x, q.y - f.y) < 200), 'a pitch by the fountain');
  const ks = [...acts.values()];
  for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) assert.ok(Math.hypot(ks[i].x - ks[j].x, ks[i].y - ks[j].y) >= 220, 'their pitches apart');
  // passers-by stop to listen, facing the act, then go on their way
  const b = ks[0];
  for (let k = 0; k < 8; k++) spawnNpc(w, 'casual', b.x + 120 + k * 12, b.y + 40, 'civ');
  let crowd = [];
  for (let s = 0; s < 40 && crowd.length < 2; s++) { run(w, 1); crowd = [...w.entities.values()].filter((e) => e.npc && e.npc.state === 'audience' && e.npc.aud.b === b.id); }
  assert.ok(crowd.length >= 2, `a crowd gathers (${crowd.length})`);
  run(w, 3);
  const at = crowd.filter((e) => e.npc.state === 'audience' && Math.hypot(e.x - e.npc.aud.x, e.y - e.npc.aud.y) < 12);
  for (const e of at) { const da = Math.atan2(b.y - e.y, b.x - e.x) - e.a; assert.ok(Math.abs(Math.atan2(Math.sin(da), Math.cos(da))) < 0.3, 'watching the act'); }
  run(w, 45);
  assert.ok(crowd.every((e) => e.removed || e.npc.state !== 'audience'), 'and on they go');
  // the living statue: in bronze on its crate; a coin and it bows, then freezes again
  let st = [...acts.values()].find((q) => q.npc.busk === 'statue');
  for (let k = 0; k < 60 && !st; k++) { clear(); const q = spawnPersona(w, spawnNpc, 'busker', f.x, f.y + 60, false); if (q && q.npc.busk === 'statue') st = q; }
  assert.ok(st, 'a living statue by day');
  assert.equal(st.gt, 'statue'); assert.equal(_descriptor(st).gt, 'statue');
  teleport(w, p.ped, st.x + 20, st.y);
  const it = busk(w, p);
  assert.ok(it && /statue's hat/.test(it.label), it && it.label);
  it.run();
  assert.equal(st.gt, 'statuebow', 'it bows');
  run(w, 4);
  assert.equal(st.gt, 'statue', 'and freezes again');
  assert.equal(prof.cash, 50 - BUSKER_TIP);
  // never a statue after dark
  for (let k = 0; k < 30; k++) { clear(); const q = spawnPersona(w, spawnNpc, 'busker', f.x, f.y + 60, true); assert.ok(!q || q.npc.busk !== 'statue', 'no statue at night'); }
});
