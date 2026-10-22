// The Starlite Drive-In (#322 - shared/drivein.js, server/systems/drivein.js): the night's bill worked out from the
// world's clock, the same for anyone; tuning in from a stall facing the screen for a car's admission (the others in the
// car on its ticket, again later that night for nothing); the intermission and the next feature; driving off; the
// night's last show over; what the page is told.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport } from './helpers.js';
import { TILE, DAY_LOOP_S, DAY_PART_S } from '../shared/constants.js';
import { DRIVEIN } from '../shared/rules-games.js';
import { FEATURES, SHOW, showAt, featureFor, driveInOf } from '../shared/drivein.js';
import * as drivein from '../server/systems/drivein.js';
import * as vehicles from '../server/systems/vehicles.js';

const toldP = (p, conn, re) => p.toasts.some((t) => re.test(t.text))
  || conn.sent.some((m) => typeof m === 'string' && m.startsWith('{"t":"ev"') && JSON.parse(m).l.some((e) => e.e === 'toast' && re.test(e.text)));
const told = (x, re) => toldP(x.p, x.conn, re);

test('the bill: after dark, features back to back with an intermission between; the last runs into the dawn; a new run each night', () => {
  const per = SHOW.len + SHOW.gap;
  assert.ok(SHOW.first >= DAY_PART_S - 30, 'the first once it\'s dark');
  assert.equal(showAt(100, 600), null, 'nothing by day');
  assert.equal(showAt(100, 300), null);
  let s = showAt(100, SHOW.first - 10);
  assert.ok(s && s.k === 0 && s.at === -10 && s.night === 100, 'the tonight card before the first');
  s = showAt(100, SHOW.first + 5);
  assert.ok(s.k === 0 && s.at === 5 && s.f === featureFor(100, 0), 'the first feature on');
  s = showAt(100, SHOW.first + SHOW.len + 2);
  assert.ok(s.k === 1 && s.at === 2 - SHOW.gap, 'the intermission, counting down to the second');
  s = showAt(100, SHOW.first + per + 1);
  assert.ok(s.k === 1 && s.at === 1, 'the second on');
  // after the loop turns over (the server's day counts on): still last night's bill, its last show running out
  const lastAt = SHOW.first + (SHOW.shows - 1) * per;
  assert.ok(lastAt < DAY_LOOP_S && lastAt + SHOW.len > DAY_LOOP_S, 'the late show runs past the turn of the loop');
  s = showAt(101, 5);
  assert.ok(s && s.night === 100 && s.k === SHOW.shows - 1, 'the late show, after the turn');
  assert.equal(showAt(101, lastAt + SHOW.len - DAY_LOOP_S + 1), null, 'the bill over at dawn');
  // the features: each night's all different, and not the same run every night
  for (let n = 0; n < 20; n++) {
    const bill = Array.from({ length: SHOW.shows }, (_, k) => featureFor(n, k));
    assert.ok(bill.every((f) => f >= 0 && f < FEATURES.length) && new Set(bill).size === SHOW.shows, `night ${n}: ${bill}`);
  }
  assert.notEqual(featureFor(7, 0), featureFor(8, 0), 'tomorrow opens with something else');
  assert.ok(FEATURES.every((f) => f.title && f.tag && f.kind && f.pal.length === 4), 'every feature has its look');
});

test('at the Starlite: tune in from a stall facing the screen; the car rides on one ticket; the next feature; drive off; the night\'s end', () => {
  const w = makeWorld(), D = driveInOf(w.map);
  assert.ok(D && /Drive-In/.test(D.name), 'the drive-in on the map');
  const st = w.map.parking.find((q) => q.drive && q.x > D.x0 + TILE && q.x < D.x1 - TILE && q.y > D.sy + 3 * TILE && q.y < D.y1 - 7 * TILE);
  assert.ok(st, 'a stall facing the screen');
  const A = joinPlayer(w), B = joinPlayer(w);
  A.prof.cash = 100; B.prof.cash = 100;
  const v = w.spawnVehicle('sedan', st.x, st.y, -Math.PI / 2, { npcOwned: false, despawnable: false });
  teleport(w, A.p.ped, st.x + 34, st.y); assert.ok(vehicles.tryEnter(w, A.p.ped) && A.p.ped.vehId === v.id, 'A at the wheel');
  teleport(w, B.p.ped, st.x - 34, st.y); assert.ok(vehicles.tryEnter(w, B.p.ped) && B.p.ped.vehId === v.id && B.p.ped.seat > 0, 'B beside her');
  // by day: nothing on
  w.loopTime = 300;
  let act = drivein.interaction(w, A.p);
  assert.ok(act && act.passive && /after dark/.test(act.label), act && act.label);
  // after dark: the first feature on
  w.loopTime = SHOW.first + 5;
  const sh = showAt(w.day, w.loopTime);
  act = drivein.interaction(w, A.p);
  assert.ok(act && !act.passive && act.label.includes(FEATURES[sh.f].title) && act.label.includes(`$${DRIVEIN.price}`), act && act.label);
  // facing away: turn to the screen first
  v.a = Math.PI / 2;
  assert.ok(drivein.interaction(w, A.p).passive, 'facing the wrong way');
  assert.match(drivein.tuneIn(w, A.p), /facing the screen/);
  v.a = -Math.PI / 2;
  act.run();
  assert.equal(A.prof.cash, 100 - DRIVEIN.price, 'the admission paid');
  assert.ok(A.p.drivein && A.p.drivein.v === v.id, 'tuned in');
  assert.ok(told(A, /speaker on the window/), 'told');
  // the passenger: on the car's ticket
  assert.ok(!drivein.interaction(w, B.p).label.includes('$'), 'no charge for the passenger');
  assert.equal(drivein.tuneIn(w, B.p), null);
  assert.equal(B.prof.cash, 100, 'free');
  // what the page gets: the feature, how far in, tuned in
  const me = drivein.meInfo(w, A.p);
  assert.ok(me && me.w === 1 && me.f === sh.f && me.k === 0 && Math.abs(me.at - 5) < 0.2, JSON.stringify(me));
  assert.match(drivein.targetFor(w, A.p).text, /s left/);
  // the first one ends: the intermission, the next feature
  run(w, SHOW.len - 4);
  assert.ok(A.p.drivein && A.p.drivein.k === 1, 'still tuned in, on to the next');
  assert.ok(told(A, /Intermission - next up/), 'the next one announced');
  assert.ok(drivein.meInfo(w, A.p).at < 0, 'the intermission counting down');
  // driving off ends it; back in a stall later that night, no charge
  v.x += 80; run(w, 0.5);
  assert.equal(A.p.drivein, null, 'driven off');
  assert.ok(told(A, /clunk/), 'with the speaker still on the window');
  v.x -= 80; v.vx = 0; v.vy = 0;
  assert.ok(!drivein.interaction(w, A.p).label.includes('$'), 'paid for tonight');
  assert.equal(drivein.tuneIn(w, A.p), null);
  assert.equal(A.prof.cash, 100 - DRIVEIN.price, 'not charged again');
  // the night's last show over: everyone wished a safe drive home
  w.loopTime = DAY_LOOP_S - 4;
  const day0 = w.day;
  run(w, 4 + SHOW.first + (SHOW.shows - 1) * (SHOW.len + SHOW.gap) + SHOW.len - DAY_LOOP_S + 1);
  assert.equal(w.day, day0 + 1, 'the loop turned over');
  assert.equal(A.p.drivein, null, 'the bill over');
  assert.ok(told(A, /That's all at the/), 'good night');
  // someone far away isn't told what's on
  const C = joinPlayer(w);
  w.loopTime = SHOW.first + 5;
  teleport(w, C.p.ped, D.sx + 6000, D.sy);
  assert.equal(drivein.meInfo(w, C.p), null, 'too far to see the screen');
  teleport(w, C.p.ped, D.sx, D.y1 + 100);
  assert.ok(drivein.meInfo(w, C.p) && drivein.meInfo(w, C.p).w === 0, 'near: what\'s on, not tuned in');
});
