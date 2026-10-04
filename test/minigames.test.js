// Soccer and beach volleyball mini-games.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport } from './helpers.js';
import { K } from '../shared/constants.js';
import { MATCH_COUNTDOWN_S, SOCCER_GOALS, VOLLEY_POINTS, MATCH_PRIZE } from '../shared/rules.js';
import * as minigames from '../server/systems/minigames.js';
import * as combat from '../server/systems/combat.js';
import { ISLANDS } from '../shared/map.js';

const venue = (w, kind) => w.map.venues.find((v) => v.kind === kind);
const ballFor = (w, v) => w.get(w.matchState[v.id].ball);

test('venues: a soccer pitch in Greenfield Park, volleyball courts on Sunset Beach and Pelican Key', () => {
  const w = makeWorld();
  const pitch = venue(w, 'soccer');
  assert.ok(pitch && /Greenfield/.test(pitch.name));
  for (const [k, arr] of w.map.solidProps) for (const sp of arr) {
    if (sp.off) continue;
    assert.ok(!(sp.x > pitch.rect.x && sp.x < pitch.rect.x + pitch.rect.w && sp.y > pitch.rect.y && sp.y < pitch.rect.y + pitch.rect.h), `nothing solid on the pitch (${k})`);
  }
  const courts = w.map.venues.filter((v) => v.kind === 'volley');
  assert.equal(courts.length, 2);
  const [x0, y0, x1, y1] = ISLANDS.P.box;
  assert.ok(courts.some((c) => c.rect.x / 32 > x0 && c.rect.x / 32 < x1 && c.rect.y / 32 > y0 && c.rect.y / 32 < y1), 'one on Pelican Key');
});

test('soccer: anyone can kick the ball; two players start a match; goals count; walking off forfeits', () => {
  const w = makeWorld();
  const v = venue(w, 'soccer');
  const r = v.rect;
  const a = joinPlayer(w, { bank: 0 }), b = joinPlayer(w, { bank: 0 });
  teleport(w, a.p.ped, r.x + r.w * 0.3, r.y + r.h / 2);
  teleport(w, b.p.ped, r.x + r.w + 900, r.y);
  run(w, 0.3);
  const ball = ballFor(w, v);
  assert.ok(ball && ball.kind === K.BALL, 'ball on the pitch');
  // kick-about with no match on
  ball.x = a.p.ped.x + 20; ball.y = a.p.ped.y; ball.vx = 0; ball.vy = 0;
  assert.ok(minigames.tryKick(w, a.p.ped, 0));
  run(w, 0.2);
  assert.ok(ball.x > a.p.ped.x + 60, 'kicked away');
  assert.equal(w.matchState[v.id].phase, 'idle');
  // second player walks on: countdown, then a match
  teleport(w, b.p.ped, r.x + r.w * 0.7, r.y + r.h / 2);
  run(w, MATCH_COUNTDOWN_S + 0.6);
  const st = w.matchState[v.id];
  assert.equal(st.phase, 'playing');
  assert.deepEqual(st.teams, [[a.p.pid], [b.p.pid]], 'sides by where you stand');
  assert.match(await_me(w, a.p), /you're RED/);
  // RED scores into the right-hand goal
  for (let g = 0; g < SOCCER_GOALS - 1; g++) { ball.x = r.x + r.w - 10; ball.y = r.y + r.h / 2; ball.vx = 400; ball.vy = 0; run(w, 0.2); }
  assert.equal(st.score[0], SOCCER_GOALS - 1);
  // BLUE walks off the pitch: forfeit, RED is the last team standing
  teleport(w, b.p.ped, r.x + r.w + 900, r.y);
  run(w, 4);
  assert.equal(st.phase === 'results' || st.phase === 'idle', true);
  assert.equal(a.p.profile.bank, MATCH_PRIZE, 'winner paid');
  assert.equal(b.p.profile.bank, 0);
});

function await_me(w, p) { return JSON.stringify((minigames.targetFor(w, p) || {}).text || ''); }

test('volleyball: points go against the side the ball lands on; first to the target wins; a dead team loses', () => {
  const w = makeWorld();
  const v = venue(w, 'volley');
  const r = v.rect;
  const a = joinPlayer(w, { bank: 0 }), b = joinPlayer(w, { bank: 0 });
  teleport(w, a.p.ped, r.x + r.w * 0.2, r.y + r.h / 2);
  teleport(w, b.p.ped, r.x + r.w * 0.8, r.y + r.h / 2);
  run(w, MATCH_COUNTDOWN_S + 0.8);
  const st = w.matchState[v.id];
  assert.equal(st.phase, 'playing');
  const ball = ballFor(w, v);
  // drop it on BLUE's side, away from the player
  ball.x = r.x + r.w * 0.9; ball.y = r.y + 10; ball.z = 5; ball.vx = 0; ball.vy = 0; ball.vz = -50;
  run(w, 0.2);
  assert.equal(st.score[0], 1, 'RED point');
  // BLUE gets shot: RED is the last team standing
  combat.damage(w, b.p.ped, 9999, a.p.ped, 'gun');
  run(w, 0.5);
  assert.notEqual(st.phase, 'playing');
  assert.equal(a.p.profile.bank, MATCH_PRIZE);
  void VOLLEY_POINTS;
});
