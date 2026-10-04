// Water races around Pelican Key: a jetski sprint and a boat classic. Pull up to the start buoy
// (on a jetski / in a boat) and you're entered; a countdown gives others time to join, then it's
// checkpoint to checkpoint. Anyone who turns up mid-race joins the next round. Leave your craft,
// die, or wander off and you forfeit - the race carries on for everyone else.
import { store } from '../store.js';

export const COUNTDOWN_S = 15;
const RESULTS_S = 8, MAX_S = 330, CP_R = 130, START_R = 190, LOST_PX = 3200;

const qualifies = (race, v) => !!v && !v.wreckAt && (race.kind === 'jetski' ? v.model === 'jetski' : v.def.kind === 'boat' && v.model !== 'jetski');

export function init(world) {
  world.raceState = (world.map.races || []).map(() => ({ phase: 'idle', racers: new Map(), t: 0, finished: 0, results: [] }));
}

function craft(world, p) {
  const ped = p.ped;
  if (!ped || ped.dead || !ped.vehId || ped.seat !== 0) return null;
  return world.get(ped.vehId);
}

function tell(world, race, st, text, tone = 'info') { for (const pid of st.racers.keys()) { const q = world.players.get(pid); if (q) world.notify(q, text, tone); } }

export function update(world) {
  if (!world.raceState || world.tick % 5 !== 3) return;
  const now = world.time;
  world.map.races.forEach((race, i) => {
    const st = world.raceState[i];
    // who is sitting at the start buoy in the right kind of craft
    const atStart = [];
    for (const p of world.players.values()) {
      const v = craft(world, p);
      if (qualifies(race, v) && Math.hypot(v.x - race.start.x, v.y - race.start.y) < START_R) atStart.push(p);
    }
    if (st.phase === 'idle') {
      if (atStart.length) {
        st.phase = 'countdown'; st.t = now + COUNTDOWN_S; st.racers = new Map(); st.finished = 0; st.results = [];
        for (const p of atStart) st.racers.set(p.pid, { cp: 0, done: false });
        for (const q of world.players.values()) if (q.ped && Math.hypot(q.ped.x - race.start.x, q.ped.y - race.start.y) < 1800) world.notify(q, `${race.name}: starting in ${COUNTDOWN_S}s - pull up to the start buoy to join!`, 'info');
      }
    } else if (st.phase === 'countdown') {
      for (const p of atStart) if (!st.racers.has(p.pid)) { st.racers.set(p.pid, { cp: 0, done: false }); world.notify(p, `You're in: ${race.name}.`, 'good'); }
      for (const pid of [...st.racers.keys()]) {
        const p = world.players.get(pid), v = p && craft(world, p);
        if (!qualifies(race, v) || Math.hypot(v.x - race.start.x, v.y - race.start.y) > START_R * 2.5) { st.racers.delete(pid); if (p) world.notify(p, 'You left the start - out of this round.', 'warn'); }
        else if (p) p.meDirty = true;
      }
      if (!st.racers.size) { st.phase = 'idle'; return; }
      if (now >= st.t) {
        st.phase = 'running'; st.t = now;
        tell(world, race, st, `GO! ${race.name} - ${race.cps.length} checkpoints.`, 'good');
        world.emit(race.start.x, race.start.y, { e: 'raceGo', x: race.start.x, y: race.start.y });
      }
    } else if (st.phase === 'running') {
      let live = 0;
      for (const [pid, r] of st.racers) {
        if (r.done) continue;
        const p = world.players.get(pid), v = p && craft(world, p);
        const cp = race.cps[r.cp];
        if (!qualifies(race, v) || Math.hypot(v.x - cp.x, v.y - cp.y) > LOST_PX) { r.done = true; r.forfeit = true; if (p) { world.notify(p, `You forfeited ${race.name}.`, 'bad'); p.meDirty = true; } continue; }
        live++;
        if (Math.hypot(v.x - cp.x, v.y - cp.y) < CP_R) {
          r.cp++; p.meDirty = true;
          world.emit(cp.x, cp.y, { e: 'checkpoint', x: cp.x, y: cp.y });
          if (r.cp >= race.cps.length) {
            r.done = true; r.place = ++st.finished; r.time = now - st.t;
            st.results.push({ pid, name: p.name, place: r.place, time: r.time });
            const n = st.racers.size;
            const share = n === 1 ? 0.5 : [0.6, 0.3, 0.1][r.place - 1] || 0;
            const prize = Math.round(race.prize * Math.max(1, n) * share / 10) * 10;
            if (prize) { p.profile.bank += prize; store.touch(); }
            world.notify(p, `Finished ${ordinal(r.place)} in ${r.time.toFixed(1)}s${prize ? ` - +$${prize} to your bank` : ''}!`, r.place === 1 ? 'good' : 'info');
            live--;
          }
        }
      }
      if (!live || now - st.t > MAX_S) {
        st.phase = 'results'; st.t = now + RESULTS_S;
        const board = st.results.map((r) => `${ordinal(r.place)} ${r.name} ${r.time.toFixed(1)}s`).join(' · ') || 'nobody finished';
        tell(world, race, st, `${race.name} results: ${board}`);
      }
      for (const p of atStart) if (!st.racers.has(p.pid) && now - (p.raceWaitAt || -99) > 15) { p.raceWaitAt = now; world.notify(p, `${race.name} is under way - you'll be in the next round.`, 'info'); }
    } else if (st.phase === 'results' && now >= st.t) {
      for (const pid of st.racers.keys()) { const p = world.players.get(pid); if (p) p.meDirty = true; }
      st.phase = 'idle'; st.racers = new Map();
    }
  });
}

const ordinal = (n) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;

// HUD tracker + waypoint for a racer (uses the job tracker slot).
export function targetFor(world, p) {
  if (!world.raceState) return null;
  for (let i = 0; i < world.raceState.length; i++) {
    const st = world.raceState[i], r = st.racers.get(p.pid);
    if (!r) continue;
    const race = world.map.races[i];
    if (st.phase === 'countdown') return { text: `${race.name}: starts in ${Math.max(0, Math.ceil(st.t - world.time))}s - stay at the start buoy`, x: Math.round(race.start.x), y: Math.round(race.start.y), stage: 'race' };
    if (st.phase === 'running' && !r.done) { const cp = race.cps[r.cp]; return { text: `${race.name}: checkpoint ${r.cp + 1}/${race.cps.length}`, x: Math.round(cp.x), y: Math.round(cp.y), stage: 'race' }; }
  }
  return null;
}
