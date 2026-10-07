// Mini-games: soccer on the Greenfield Park pitch and beach volleyball. The ball is always out
// there - anyone can kick it around. When two or more players are on the pitch / court a match
// counts down and starts; teams are split by where you stand. Walk off and you forfeit (the
// match goes on), anyone who arrives mid-match joins the next round. Weapons still work: if
// every player on one side is dead or gone, the last team standing wins.
import { K } from '../../shared/constants.js';
import { MATCH_COUNTDOWN_S, SOCCER_GOALS, SOCCER_MATCH_S, VOLLEY_POINTS, MATCH_PRIZE } from '../../shared/rules.js';
import { mulberry32 } from '../../shared/rng.js';
import { store } from '../store.js';

const rng = mulberry32(5150);
const RESULTS_S = 6, LEAVE_GRACE_S = 3, JOIN_MARGIN = 48;
const GRAV = 620, NET_H = 46;
export const TEAM_NAMES = ['RED', 'BLUE'];

// ---- the ball ---------------------------------------------------------------------------------
function spawnBall(world, venue) {
  const r = venue.rect;
  const e = { id: world.newId(), kind: K.BALL, x: r.x + r.w / 2, y: r.y + r.h / 2, a: 0, z: 0, vx: 0, vy: 0, vz: 0, venue: venue.id, ballKind: venue.kind, cx: -1, cy: -1 };
  if (venue.kind === 'volley') { e.x = r.x + r.w * 0.25; e.z = 60; }
  return world.add(e);
}

export function init(world) {
  world.matchState = (world.map.venues || []).map(() => ({ phase: 'idle', teams: [[], []], score: [0, 0], t: 0, ball: 0, out: new Map(), lastHit: -1, serve: 0 }));
}

const inRect = (r, x, y, m = 0) => x > r.x - m && x < r.x + r.w + m && y > r.y - m && y < r.y + r.h + m;
const ballOf = (world, i) => world.get(world.matchState[i].ball);

function resetBall(world, venue, st, side = -1) {
  const b = ballOf(world, venue.id);
  if (!b) return;
  const r = venue.rect;
  b.vx = 0; b.vy = 0; b.vz = 0;
  b.rest = false;
  if (venue.kind === 'soccer') { b.x = r.x + r.w / 2; b.y = r.y + r.h / 2; b.z = 0; }
  else { const s = side < 0 ? st.serve : side; b.x = r.x + r.w * (s === 0 ? 0.25 : 0.75); b.y = r.y + r.h / 2; b.z = 70; }
  st.lastHit = -1;
}

// A player swings at the ball (fire / punch). Returns true when the ball was in reach.
export function tryKick(world, ped, aim) {
  for (const b of world.query(ped.x, ped.y, 40, K.BALL)) {
    if (b.ballKind === 'golf' || Math.hypot(b.x - ped.x, b.y - ped.y) > 36) continue;   // (a golf ball takes a club: golf.js)
    const venue = world.map.venues[b.venue];
    if (venue.kind === 'soccer') {
      b.vx = Math.cos(aim) * 560; b.vy = Math.sin(aim) * 560;
      if (Math.hypot(ped.vx, ped.vy) > 150) { b.vx *= 1.15; b.vy *= 1.15; }
    } else {
      if (b.z > 80) continue;
      hitVolley(world, venue, b, ped, true, aim);
    }
    world.emit(b.x, b.y, { e: 'kick', x: b.x, y: b.y });
    return true;
  }
  return false;
}

function sideOf(venue, x) { return x < venue.netX ? 0 : 1; }
function hitVolley(world, venue, b, ped, spike, aim) {
  const r = venue.rect;
  const from = sideOf(venue, b.x);
  // aim deep into the other half (a spike flies flatter and faster toward where you point)
  const tx = from === 0 ? r.x + r.w * (0.6 + rng() * 0.32) : r.x + r.w * (0.08 + rng() * 0.32);
  let ty = r.y + r.h * (0.15 + rng() * 0.7);
  if (spike && aim !== undefined) ty = Math.max(r.y + 10, Math.min(r.y + r.h - 10, b.y + Math.sin(aim) * r.h * 0.6));
  const vz = spike ? 300 : 430;
  const tFlight = (vz + Math.sqrt(vz * vz + 2 * GRAV * b.z)) / GRAV;
  b.vz = vz; b.vx = (tx - b.x) / tFlight; b.vy = (ty - b.y) / tFlight;
  const st = world.matchState[venue.id];
  st.lastHit = teamOf(st, ped);
  if (st.lastHit < 0 && st.phase !== 'playing') st.lastHit = from;
}

function teamOf(st, ped) {
  if (!ped || !ped.player) return -1;
  for (let k = 0; k < 2; k++) if (st.teams[k].includes(ped.player.pid)) return k;
  return -1;
}

function stepBall(world, venue, st, dt) {
  const b = ballOf(world, venue.id);
  if (!b) return;
  const r = venue.rect;
  const prevX = b.x;
  b.x += b.vx * dt; b.y += b.vy * dt;
  if (venue.kind === 'soccer') {
    const f = Math.exp(-0.95 * dt);
    b.vx *= f; b.vy *= f;
    b.a += Math.hypot(b.vx, b.vy) * dt * 0.08;
    // people and cars push it along
    for (const e of world.query(b.x, b.y, 80)) {
      if (e.kind === K.PED && !e.dead && !e.vehId && !e.hidden) {
        const d = Math.hypot(b.x - e.x, b.y - e.y);
        if (d < 15 && d > 0.01) { const nx = (b.x - e.x) / d, ny = (b.y - e.y) / d; b.vx = e.vx * 1.25 + nx * 70; b.vy = e.vy * 1.25 + ny * 70; b.x = e.x + nx * 15; b.y = e.y + ny * 15; }
      } else if (e.kind === K.VEH && !e.wreckAt) {
        const d = Math.hypot(b.x - e.x, b.y - e.y);
        if (d < e.def.L / 2 + 6) { const nx = (b.x - e.x) / (d || 1), ny = (b.y - e.y) / (d || 1); b.vx = e.vx * 1.3 + nx * 120; b.vy = e.vy * 1.3 + ny * 120; }
      }
    }
    // goals at both ends; elsewhere the ball rebounds off the touchlines
    const mouth = Math.abs(b.y - (r.y + r.h / 2)) < venue.goalW / 2;
    if (b.x < r.x) { if (mouth) { goal(world, venue, st, 1); return; } b.x = r.x; b.vx = Math.abs(b.vx) * 0.6; }
    if (b.x > r.x + r.w) { if (mouth) { goal(world, venue, st, 0); return; } b.x = r.x + r.w; b.vx = -Math.abs(b.vx) * 0.6; }
    if (b.y < r.y) { b.y = r.y; b.vy = Math.abs(b.vy) * 0.6; }
    if (b.y > r.y + r.h) { b.y = r.y + r.h; b.vy = -Math.abs(b.vy) * 0.6; }
    return;
  }
  // volleyball: a lob through the air, bumped back by whoever it drops onto
  if (b.rest) { if (!world.query(b.x, b.y, 30, K.PED).some((e) => !e.dead && !e.vehId && Math.hypot(e.x - b.x, e.y - b.y) < 24)) return; b.rest = false; b.z = 1; }
  b.vz -= GRAV * dt; b.z += b.vz * dt;
  if ((prevX - venue.netX) * (b.x - venue.netX) < 0 && b.z < NET_H) { b.x = prevX; b.vx = -b.vx * 0.25; b.vy *= 0.4; } // into the net
  if (b.z < 60 && b.vz < 0) {
    for (const e of world.query(b.x, b.y, 40, K.PED)) {
      if (e.dead || e.vehId || e.hidden || Math.hypot(e.x - b.x, e.y - b.y) > 26) continue;
      hitVolley(world, venue, b, e, false);
      world.emit(b.x, b.y, { e: 'kick', x: b.x, y: b.y });
      break;
    }
  }
  if (b.z <= 0) {
    b.z = 0;
    if (st.phase !== 'playing') { b.vx = 0; b.vy = 0; b.vz = 0; b.rest = true; return; } // a kick-about: it just lies in the sand
    const inside = inRect(r, b.x, b.y);
    const landed = sideOf(venue, b.x);
    // in: the side it landed on loses the point; out: whoever hit it last loses it
    const loser = inside ? landed : (st.lastHit >= 0 ? st.lastHit : landed);
    point(world, venue, st, 1 - loser);
  }
}

function goal(world, venue, st, team) {
  world.emit(venue.rect.x + venue.rect.w / 2, venue.rect.y + venue.rect.h / 2, { e: 'goal', team });
  if (st.phase === 'playing') {
    st.score[team]++;
    tellAll(world, st, `GOAL for ${TEAM_NAMES[team]}! ${TEAM_NAMES[0]} ${st.score[0]} - ${st.score[1]} ${TEAM_NAMES[1]}`, 'good');
    if (st.score[team] >= SOCCER_GOALS) { finish(world, venue, st, team, 'first to ' + SOCCER_GOALS); return; }
  }
  resetBall(world, venue, st);
}

function point(world, venue, st, team) {
  if (st.phase === 'playing') {
    st.score[team]++;
    st.serve = team;
    tellAll(world, st, `Point ${TEAM_NAMES[team]}: ${st.score[0]} - ${st.score[1]}`, 'info');
    if (st.score[team] >= VOLLEY_POINTS) { finish(world, venue, st, team, 'first to ' + VOLLEY_POINTS); return; }
  }
  resetBall(world, venue, st, team);
}

function tellAll(world, st, text, tone) { for (const team of st.teams) for (const pid of team) { const p = world.players.get(pid); if (p) world.notify(p, text, tone); } }

function finish(world, venue, st, winner, why) {
  st.phase = 'results'; st.t = world.time + RESULTS_S;
  if (winner >= 0) {
    for (const pid of st.teams[winner]) { const p = world.players.get(pid); if (p) { p.profile.bank += MATCH_PRIZE; p.meDirty = true; } }
    store.touch();
    tellAll(world, st, `${TEAM_NAMES[winner]} wins (${why})! ${TEAM_NAMES[0]} ${st.score[0]} - ${st.score[1]} ${TEAM_NAMES[1]}. Winners +$${MATCH_PRIZE}.`, 'good');
  } else tellAll(world, st, `Match over - nobody left standing. ${TEAM_NAMES[0]} ${st.score[0]} - ${st.score[1]} ${TEAM_NAMES[1]}`, 'info');
  world.broadcast({ e: 'teams', v: venue.id, t: [[], []] });
  resetBall(world, venue, st);
}

// Players standing on the pitch / court (on foot, alive).
function onVenue(world, venue) {
  const out = [];
  for (const p of world.players.values()) {
    const ped = p.ped;
    if (!ped || ped.dead || ped.hidden || ped.vehId) continue;
    if (inRect(venue.rect, ped.x, ped.y, JOIN_MARGIN)) out.push(p);
  }
  return out;
}

function pedIds(world, st) { return st.teams.map((t) => t.map((pid) => world.players.get(pid)?.ped?.id).filter(Boolean)); }

export function update(world, dt) {
  if (!world.matchState) return;
  const now = world.time;
  world.map.venues.forEach((venue, i) => {
    const st = world.matchState[i];
    const anyone = [...world.players.values()].some((p) => p.ped && Math.hypot(p.ped.x - (venue.rect.x + venue.rect.w / 2), p.ped.y - (venue.rect.y + venue.rect.h / 2)) < 1600);
    let b = ballOf(world, i);
    if (anyone && !b) { st.ball = spawnBall(world, venue).id; b = ballOf(world, i); resetBall(world, venue, st); }
    else if (!anyone && b && st.phase === 'idle') { world.remove(b); st.ball = 0; return; }
    if (b) stepBall(world, venue, st, dt);
    if (world.tick % 5 !== 1) return;
    const here = onVenue(world, venue);
    if (st.phase === 'idle') {
      if (here.length >= 2) {
        st.phase = 'countdown'; st.t = now + MATCH_COUNTDOWN_S;
        for (const p of here) world.notify(p, `${venue.name}: match starts in ${MATCH_COUNTDOWN_S}s! Stay on to play - walk off to sit it out.`, 'info');
      }
    } else if (st.phase === 'countdown') {
      if (here.length < 2) { st.phase = 'idle'; for (const p of here) world.notify(p, 'Not enough players - match called off.', 'warn'); return; }
      if (now >= st.t) start(world, venue, st, here);
    } else if (st.phase === 'playing') {
      // forfeits (walked off) and eliminations (killed)
      for (let k = 0; k < 2; k++) {
        st.teams[k] = st.teams[k].filter((pid) => {
          const p = world.players.get(pid);
          const ped = p && p.ped;
          if (!p || !ped || ped.dead) { if (p) world.notify(p, 'You were knocked out of the match.', 'bad'); return false; }
          if (inRect(venue.rect, ped.x, ped.y, JOIN_MARGIN * 2) && !ped.vehId) { st.out.delete(pid); return true; }
          if (!st.out.has(pid)) st.out.set(pid, now);
          if (now - st.out.get(pid) < LEAVE_GRACE_S) return true;
          st.out.delete(pid); world.notify(p, 'You walked off - forfeited. The match goes on without you.', 'warn'); p.meDirty = true;
          return false;
        });
      }
      world.broadcast({ e: 'teams', v: venue.id, t: pedIds(world, st) });
      const alive = st.teams.map((t) => t.length);
      if (!alive[0] && !alive[1]) { finish(world, venue, st, -1, ''); return; }
      if (!alive[0] || !alive[1]) { finish(world, venue, st, alive[0] ? 0 : 1, 'last team standing'); return; }
      if (venue.kind === 'soccer' && now - st.t > SOCCER_MATCH_S) {
        const w = st.score[0] === st.score[1] ? -1 : st.score[0] > st.score[1] ? 0 : 1;
        if (w < 0) { tellAll(world, st, 'Full time - it\'s a draw!', 'info'); st.phase = 'results'; st.t = now + RESULTS_S; world.broadcast({ e: 'teams', v: venue.id, t: [[], []] }); }
        else finish(world, venue, st, w, 'full time');
        return;
      }
      for (const p of here) if (teamOf(st, p.ped) < 0 && now - (p.matchWaitAt || -99) > 20) { p.matchWaitAt = now; world.notify(p, `${venue.name}: match in progress - you'll be in the next round. The ball's fair game meanwhile.`, 'info'); }
    } else if (st.phase === 'results' && now >= st.t) {
      st.phase = 'idle'; st.teams = [[], []]; st.score = [0, 0];
    }
  });
}

function start(world, venue, st, players) {
  // sides by where people stand (left / right of centre), then evened out
  const mid = venue.rect.x + venue.rect.w / 2;
  const teams = [[], []];
  for (const p of players.sort((a, b) => a.ped.x - b.ped.x)) teams[p.ped.x < mid ? 0 : 1].push(p);
  while (teams[0].length > teams[1].length + 1) teams[1].unshift(teams[0].pop());
  while (teams[1].length > teams[0].length + 1) teams[0].push(teams[1].shift());
  st.teams = teams.map((t) => t.map((p) => p.pid));
  st.score = [0, 0]; st.phase = 'playing'; st.t = world.time; st.out = new Map(); st.serve = Math.floor(rng() * 2);
  resetBall(world, venue, st);
  for (let k = 0; k < 2; k++) for (const p of teams[k]) { world.notify(p, `${venue.name}: GO! You're ${TEAM_NAMES[k]}${venue.kind === 'soccer' ? ` - attack the ${k === 0 ? 'right' : 'left'} goal` : ''}. Fire / punch near the ball to ${venue.kind === 'soccer' ? 'kick' : 'spike'} it.`, 'good'); p.meDirty = true; }
  world.broadcast({ e: 'teams', v: venue.id, t: pedIds(world, st) });
}

// HUD tracker line for players in a match.
export function targetFor(world, p) {
  if (!world.matchState) return null;
  for (let i = 0; i < world.matchState.length; i++) {
    const st = world.matchState[i], venue = world.map.venues[i];
    const k = st.teams.findIndex((t) => t.includes(p.pid));
    if (k < 0 || st.phase !== 'playing') continue;
    const b = ballOf(world, i);
    const left = venue.kind === 'soccer' ? ` · ${Math.max(0, Math.ceil((SOCCER_MATCH_S - (world.time - st.t)) / 60 * 10) / 10)} min` : '';
    return { text: `${venue.kind === 'soccer' ? 'Soccer' : 'Volleyball'}: ${TEAM_NAMES[0]} ${st.score[0]} - ${st.score[1]} ${TEAM_NAMES[1]} · you're ${TEAM_NAMES[k]}${left}`, x: Math.round(b ? b.x : venue.rect.x), y: Math.round(b ? b.y : venue.rect.y), stage: 'match' };
  }
  return null;
}
