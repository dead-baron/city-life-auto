// Foraging (shared/foraging.js, server/systems/foraging.js): mushrooms on Highland Woods' redwood floor, the rare
// golden stars in the Lighthouse Tidepools. A spot gives a few, everyone sees it picked bare, it grows back; the
// market buys the good eating, the Back-Alley Exchange the illegal ghostglass, and an arrest takes the ghostglass.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport, players } from './helpers.js';
import { SHOPS, ITEMS } from '../shared/items.js';
import { FORAGE_KINDS } from '../shared/foraging.js';
import { FORAGE_REGROW_S } from '../shared/rules.js';
import * as economy from '../server/systems/economy.js';
import * as law from '../server/systems/law.js';
import * as foraging from '../server/systems/foraging.js';

const watch = (w) => { const evs = [], b0 = w.broadcast.bind(w); w.broadcast = (ev) => { if (ev.e === 'forage') evs.push(ev); b0(ev); }; return evs; };

test('the redwood floor has mushrooms to find (most good eating, some poison, a few illegal), the tidepools two golden stars', () => {
  const w = makeWorld();
  const F = w.map.forage || [];
  const by = (k) => F.filter((f) => f.k === k);
  assert.ok(by('goldTrumpet').length + by('bunCap').length + by('shelfOyster').length >= 60, 'plenty of good eating');
  assert.ok(by('redcap').length >= 10, 'redcaps');
  assert.ok(by('ghostglass').length >= 2 && by('ghostglass').length <= 12, `ghostglass is rare (${by('ghostglass').length})`);
  assert.equal(by('goldStar').length, 2, 'two golden stars');
  for (const f of F) assert.ok(FORAGE_KINDS[f.k] && ITEMS[FORAGE_KINDS[f.k].item], `${f.k} is a kind with an item`);
  // the mushrooms grow in Highland Woods, by the giants; the stars at the Lighthouse Tidepools
  const giants = w.map.props.filter((p) => p.t === 'redwood' && /^giant/.test(p.sp));
  const near = (f) => giants.some((g) => Math.hypot(g.x - f.x, g.y - f.y) < 120);
  assert.ok(by('goldTrumpet').filter(near).length >= by('goldTrumpet').length * 0.6, 'at the feet of the giants');
  const tp = w.map.landmarks.find((l) => l.name === 'Lighthouse Tidepools');
  for (const s of by('goldStar')) assert.ok(s.x > tp.x - 200 && s.x < tp.x + tp.w + 400 && s.y > tp.y - 200 && s.y < tp.y + tp.h + 200, 'a star in the tidepools');
});

test('pick mushrooms: a few in the bag, the spot bare for everyone until it grows back; the market buys them', () => {
  const w = makeWorld();
  const { p, conn } = joinPlayer(w);
  const evs = watch(w);
  const i = w.map.forage.findIndex((f) => f.k === 'goldTrumpet');
  const f = w.map.forage[i];
  teleport(w, p.ped, f.x, f.y + 14);
  const act = players.findInteraction(w, p);
  assert.ok(act && /golden trumpets/.test(act.label), `the prompt (${act && act.label})`);
  act.run();
  const got = p.profile.inventory.goldTrumpet || 0;
  assert.ok(got >= 2 && got <= 4, `golden trumpets (${got})`);
  assert.ok(evs.some((e) => e.i === i && !e.up), 'everyone hears it was picked');
  assert.ok(/Picked here already/.test(players.findInteraction(w, p).label), 'the spot is bare');
  // someone joining now sees it bare (the welcome carries the list)
  assert.ok(foraging.goneList(w).includes(i), 'the bare spots for the welcome');
  // it grows back
  run(w, FORAGE_REGROW_S.goldTrumpet + 2);
  assert.ok(evs.some((e) => e.i === i && e.up), 'it grows back, and everyone hears');
  assert.ok(/golden trumpets/.test(players.findInteraction(w, p).label), 'something to pick again');
  // sell them at the market
  const market = w.map.pois.find((q) => q.counter && q.kind === 'market');
  teleport(w, p.ped, market.x, market.y + 6);
  const bank0 = p.profile.bank;
  economy.openMenu(w, p, market);
  economy.handleMenu(w, p, market.id, 's:goldTrumpet');
  assert.equal(p.profile.bank - bank0, got * SHOPS.market.sellPrice.goldTrumpet, 'the market pays for them');
  void conn;
});

test('ghostglass is contraband: only the Back-Alley Exchange buys it, and an arrest takes it', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const i = w.map.forage.findIndex((f) => f.k === 'ghostglass');
  const f = w.map.forage[i];
  teleport(w, p.ped, f.x, f.y + 14);
  const act = players.findInteraction(w, p);
  assert.ok(act && /ghostglass/.test(act.label), `the prompt (${act && act.label})`);
  act.run();
  assert.ok((p.profile.inventory.ghostglass || 0) >= 1, 'caps in the bag');
  assert.ok(p.toasts.some((t) => /Illegal/.test(t.text)), 'told it is illegal');
  assert.ok(ITEMS.ghostglass.illegal && SHOPS.fence.sells.includes('ghostglass'), 'the black market buys it');
  for (const [k, s] of Object.entries(SHOPS)) if (k !== 'fence') assert.ok(!(s.sells || []).includes('ghostglass'), `${k} doesn't`);
  // busted: confiscated
  p.wanted = 1;
  law.arrest(w, null, p.ped);
  assert.ok(!p.profile.inventory.ghostglass, 'the police took the caps');
});

test('the golden star from the tidepools: rare, slow to come back, collectors pay well', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const i = w.map.forage.findIndex((f) => f.k === 'goldStar');
  const f = w.map.forage[i];
  teleport(w, p.ped, f.x, f.y + 12);
  const act = players.findInteraction(w, p);
  assert.ok(act && /golden star/.test(act.label), `the prompt (${act && act.label})`);
  act.run();
  assert.equal(p.profile.inventory.goldStar, 1, 'one star');
  assert.ok(FORAGE_REGROW_S.goldStar >= 1800, 'a long while before another');
  assert.ok(SHOPS.fence.sellPrice.goldStar > ITEMS.goldStar.sell && SHOPS.pawn.sells.includes('goldStar'), 'the pawn shop buys it, the black market pays more');
});
