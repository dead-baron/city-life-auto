// Fallible drivers, rarely (server/systems/slips.js; the owner's notes, 11-03): a driver now and then reacts late to
// someone stepping into the road, or to the car ahead stopping hard - and after a rear-end the two drivers mostly drive
// on, sometimes get out to have words, now and then come to blows; either way they're back in and away, and the lane
// clear, within about 40 s. Never near a hospital, nor to someone lying in the road.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport, straightRoad } from './helpers.js';
import { K } from '../shared/constants.js';
import { DRIVER_SLIPS as S } from '../shared/rules.js';
import { laneOffset } from '../shared/roads.js';
import { spawnNpc } from '../server/systems/npc.js';
import * as traffic from '../server/systems/traffic.js';
import * as slips from '../server/systems/slips.js';
import { jammed } from '../server/systems/reroute.js';

function edgeAt(m, x, y) {
  for (const e of m.edges) {
    if (e.lvl !== 0 || e.pts.some((p) => Math.abs(p.y - y) > 8)) continue;
    const xs = e.pts.map((p) => p.x);
    if (Math.min(...xs) <= x && Math.max(...xs) >= x) return e;
  }
  return null;
}
function car(w, model, x, y, a = 0) {
  const v = w.spawnVehicle(model, x, y, a, {});
  const d = spawnNpc(w, 'casual', v.x, v.y, 'driver'); d.vehId = v.id; d.seat = 0; v.seats[0] = d.id;
  traffic.joinTraffic(w, v);
  return v;
}
// a long straight street, away from every hospital, with a player watching from the pavement
function street(w) {
  const hs = w.map.hospitals || [];
  for (const kind of ['st', 'ave']) {
    const r = straightRoad(w.map, 1400, { kind });
    if (r && !hs.some((h) => Math.hypot(h.x - (r.x + 600), h.y - r.y) < S.safeR + 600)) {
      const e = edgeAt(w.map, r.x + 600, r.y);
      const a = joinPlayer(w);
      teleport(w, a.p.ped, r.x + 600, r.y - r.hw - 120);
      a.p.ped.spawnedAt = -1e9;   // (not just woken up: slips.js keeps clear of those)
      return { r, e, y0: r.y + laneOffset(e, 0), p: a.p };
    }
  }
  return null;
}
const withRules = (o, f) => { const was = { ...S }; Object.assign(S, o); try { return f(); } finally { Object.assign(S, was); } };
const run = (w, s, f = null) => { for (let i = 0; i < s * 20; i++) { w.step(); if (f && f()) return true; } return false; };

test('a rear-end that ends in words: both pull up, get out, argue, get back in and drive on - the lane clear within 40 s', () => {
  const w = makeWorld();
  const st = street(w);
  assert.ok(st, 'a street');
  withRules({ argue: 1, fight: 0 }, () => {
    const lead = car(w, 'sedan', st.r.x + 520, st.y0), back = car(w, 'sedan', st.r.x + 420, st.y0);
    w.rand = () => 0.5;   // (the dice: 0.5 < argue 1 - fight 0)
    slips.bumped(w, back, lead, 200);
    assert.ok(back.ai.incident && lead.ai.incident, 'both pulled up for it');
    assert.equal(back.ai.incident.kind, 'argue');
    // the traffic behind sees the pair as a blockage (and goes round: reroute.js)
    const third = car(w, 'sedan', st.r.x + 300, st.y0);
    third._blk = back.id; back.ai.jam = false;
    assert.equal(jammed(w, third), true, 'a car pulled up for it is in the way');
    const d0 = w.get(back.seats[0]);
    let out = false, said = 0;
    const emit = w.emit.bind(w);
    w.emit = (x, y, e) => { if (e.e === 'say') said++; return emit(x, y, e); };
    const done = run(w, 45, () => { if (!d0.vehId) out = true; return out && back.seats[0] === d0.id && !back.ai?.incident && !lead.ai?.incident; });
    assert.ok(out, 'the driver got out');
    assert.ok(said >= 2, `words were had (${said} lines)`);
    assert.ok(done, `back in and the incident over within 45 s (${w.time.toFixed(1)} s)`);
    assert.ok(back.ai && back.ai.kind === 'traffic' && lead.ai && lead.ai.kind === 'traffic', 'both drive on as traffic');
    const x0 = back.x;
    run(w, 6);
    assert.ok(Math.hypot(back.x - x0, back.y - st.y0) > 60, 'and away');
    assert.equal(w.slips.argues, 1);
  });
});

test('a rear-end that comes to blows: a fist fight between the two drivers, broken off, then both back in and away', () => {
  const w = makeWorld();
  const st = street(w);
  withRules({ argue: 0, fight: 1, police: 0 }, () => {
    const lead = car(w, 'sedan', st.r.x + 520, st.y0), back = car(w, 'sedan', st.r.x + 420, st.y0);
    w.rand = () => 0.3;
    slips.bumped(w, back, lead, 220);
    assert.equal(back.ai.incident.kind, 'fight');
    const da = w.get(back.seats[0]), db = w.get(lead.seats[0]);
    let fought = 0, hits = 0;
    w.rand = Math.random;
    const hp0 = da.hp + db.hp, t0 = w.time;
    const done = run(w, 50, () => { if (da.npc.state === 'fight' && db.npc.state === 'fight') fought += 0.05; return fought && back.seats[0] === da.id && lead.seats[0] === db.id && !back.ai?.incident; });
    hits = hp0 - da.hp - db.hp;
    assert.ok(fought > 2, `they fought (${fought.toFixed(1)} s, ${Math.round(hits)} hp of blows; over in ${(w.time - t0).toFixed(1)} s)`);
    assert.equal(da.weapon, 'fists');
    assert.ok(done, `both back in within 50 s (${w.time.toFixed(1)} s)`);
    assert.ok(!da.dead && !db.dead, 'nobody killed over a bumper');
  });
});

test('most rear-ends: both drive on; never near a hospital', () => {
  const w = makeWorld();
  const st = street(w);
  const lead = car(w, 'sedan', st.r.x + 520, st.y0), back = car(w, 'sedan', st.r.x + 420, st.y0);
  w.rand = () => 0.99;
  slips.bumped(w, back, lead, 200);
  assert.ok(!back.ai.incident && !lead.ai.incident, 'on they go');
  assert.equal(w.slips.driveOn, 1);
  // by a hospital: no words, no fight, whatever the dice
  const h = w.map.hospitals[0];
  const w2 = makeWorld();
  const a = car(w2, 'sedan', h.x + 60, h.y), b = car(w2, 'sedan', h.x - 40, h.y);
  a.a = b.a = 0;
  w2.rand = () => 0;
  slips.bumped(w2, b, a, 200);
  assert.ok(!a.ai.incident && !b.ai.incident, 'no incident by a hospital');
});

test('a driver late for the car ahead stopping hard runs into its back: a real crash, dents on both', () => {
  const w = makeWorld();
  const st = street(w);
  withRules({ rearP: 1, inattentive: 1, rearLateS: [1.2, 1.2], argue: 0, fight: 0 }, () => {
    const lead = car(w, 'sedan', st.r.x + 560, st.y0), back = car(w, 'sedan', st.r.x + 420, st.y0);
    lead.vx = back.vx = 240;
    // the one in front stops dead (as for someone stepping out): its desired speed to nothing
    run(w, 1);
    const hp0 = [lead.hp, back.hp];
    lead.vx *= 0.2; lead.hardBrakeAt = w.time; lead.ai.reverseUntil = 0;
    lead.ai.parkIt = true;   // (it stays stopped)
    const hit = run(w, 3, () => (w.slips?.rearEnds || 0) > 0 || back.hp < hp0[1]);
    assert.ok(w.slips.lates >= 1, 'the driver behind reacted late');
    assert.ok(hit, 'and ran into it');
    assert.ok(lead.hp < hp0[0] && back.hp < hp0[1], `both dented (${hp0} -> ${lead.hp}, ${back.hp})`);
  });
});

test('a driver now and then doesn\'t see someone stepping out in front; never someone lying in the road', () => {
  const w = makeWorld();
  const st = street(w);
  withRules({ missP: 1, close: 1, night: 1, rain: 1, crossing: 1, lateS: [5, 5] }, () => {
    const x0 = Math.min(...st.e.pts.map((p) => p.x)) + 120;   // (along one stretch of it, no junction in between)
    const v = car(w, 'sedan', x0, st.y0);
    v.vx = 240;
    const q = spawnNpc(w, 'casual', x0 + 260, st.y0, 'civ');
    q.npc.driven = true;   // (standing there in the road)
    w.rand = () => 0;
    const hit = run(w, 4, () => (w.slips?.missHits || 0) > 0);
    assert.ok(w.slips.misses >= 1, 'it missed them');
    assert.ok(hit, 'and hit them');
    // lying in the road: always seen
    const w2 = makeWorld();
    const st2 = street(w2);
    const x2 = Math.min(...st2.e.pts.map((p) => p.x)) + 120;
    const v2 = car(w2, 'sedan', x2, st2.y0);
    v2.vx = 240;
    const q2 = spawnNpc(w2, 'casual', x2 + 300, st2.y0, 'civ');
    q2.downUntil = w2.time + 99; q2.npc.driven = true;
    w2.rand = () => 0;
    run(w2, 4);
    assert.ok(!(w2.slips?.misses), 'nobody lying in the road is missed');
    assert.ok(Math.hypot(v2.vx, v2.vy) < 30 && v2.x < q2.x - 40, 'it stopped for them');
  });
  // a player who has just woken up (or come in) is never the one missed, nor anyone near them
  const w3 = makeWorld();
  const st3 = street(w3);
  st3.p.ped.spawnedAt = w3.time;
  withRules({ missP: 1, close: 1, night: 1, rain: 1, crossing: 1 }, () => {
    const x3 = Math.min(...st3.e.pts.map((p) => p.x)) + 120;
    const v3 = car(w3, 'sedan', x3, st3.y0);
    v3.vx = 240;
    teleport(w3, st3.p.ped, x3 + 300, st3.y0);
    w3.rand = () => 0;
    run(w3, 3);
    assert.ok(!(w3.slips?.misses), 'a player just come in is always seen');
  });
  // the rules' own rates: small
  assert.ok(S.missP <= 0.1 && S.rearP <= 0.5 && S.fight <= 0.15 && S.argue <= 0.35, 'rare by default');
  void K;
});
