// Traffic against buildings at busy corners (the owner, 2026-10-17: "Vehicles are still turning and getting stuck on
// buildings" - NPC cars up on the pavement at a junction corner by a City Diner, nosed into its front, round two
// ambulances and a burning wreck in the road). A headless run of the real server's world - World v3, built as the
// server builds it (server/world3.js) - with players stood at junction corners where the buildings come close to the
// pavement (the City Diner corners first, then other signalled town junctions), and the screenshot made at each, again
// every 70-90 s: a car blown up in a lane short of the junction, people killed beside it (the ambulances come, sirens
// on), the player wanted for a few seconds (the police come), gunfire and cars shot at (drivers panic).
// Counted, for every AI vehicle near a player (traffic, ambulances, police, tow trucks):
//   left the road     its middle off the road (ROAD, BRIDGE, LOT), and the driving mode it was in then
//   touched           its body within 4 px of a building or a wall tile (CAR_BLOCK)
//   in a building     3 px inside its outline on one
//   stuck             touching one and barely moving (inside a 40 px circle) for STUCK_S or more: the episodes, how long,
//                     the mode it was in when it left the road and while stuck
// Modes: lane (driving its lane), turn:<turn|back>/<road|kerb|any> (turning round: roadends.js, where it may put its
// wheels), panic, yield (giving way to a siren), reverse (backing out), parkIt; <kind>:<mode> for the services.
//   node --expose-gc tools/trafficbuildings.mjs              the report: 8 sites, 5 in-game minutes
//   node tools/trafficbuildings.mjs --min 3 --sites 4 --seed 7 --mayhem 0 --police 0 --night 1 --v --json
//   node tools/trafficbuildings.mjs --cache /dev/shm/w3.bin  the world kept in a file (written the first time: ~0.6 GB)
// (Heavy - the v3 world, about a minute to build and 1.6 GB: run it under `flock /tmp/cla-heavy.lock`.)
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serialize, deserialize } from 'node:v8';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const MINUTES = +opt('--min', 5), SEED = +opt('--seed', 5), NSITES = +opt('--sites', 8);
const MAYHEM = +opt('--mayhem', 1), POLICE = +opt('--police', 1), NIGHT = +opt('--night', 0);
const VERBOSE = args.includes('--v'), JSON_OUT = args.includes('--json'), CACHE = opt('--cache', '');
const STUCK_S = 4, STILL_PX = 40;

process.env.CLA_DATA_DIR ||= mkdtempSync(join(tmpdir(), 'cla-tb-'));
process.env.CLA_SECRET ||= 'test-secret';
const { joinPlayer, teleport } = await import('../test/helpers.js');
const { World } = await import('../server/world.js');
const { K, T, TILE } = await import('../shared/constants.js');
const { CAR_BLOCK, cityFromData } = await import('../shared/mapcore.js');
const { cityData } = await import('../shared/map.js');
const { mulberry32 } = await import('../shared/rng.js');
const { lanePath } = await import('../shared/roads.js');
const { pointAt } = await import('../shared/geom.js');
const { vehForwardSpeed } = await import('../shared/physics.js');
const npc = await import('../server/systems/npc.js');
const vehicles = await import('../server/systems/vehicles.js');
const combat = await import('../server/systems/combat.js');
const law = await import('../server/systems/law.js');

async function theWorld() {
  if (CACHE && existsSync(CACHE)) { const m = cityFromData(deserialize(readFileSync(CACHE))); delete m._sig; return m; }
  const { map } = await (await import('../server/world3.js')).buildWorld3(1337, { log: () => {} });
  if (CACHE) writeFileSync(CACHE, serialize(cityData(map)));
  return map;
}

// (for a closer look: hooks.onStuck(world, vehicle, episode) once a vehicle has been stuck 8 s - a picture of it; and
// hooks.onTick(world) after every tick)
export const hooks = { onStuck: null, onTick: null };

export async function run() {
  const m = await theWorld(), net = m.net;
  const rng = mulberry32(SEED);
  Math.random = mulberry32(SEED + 2);   // (the same run every time)
  const w = new World(m, { npcBudget: 600, throwErrors: true, rand: mulberry32(SEED + 1), loopStart: NIGHT ? 1000 : 400, day: 0 });
  // ---- the sites: the City Diner corners, then other signalled junctions of town streets with buildings close by ----
  const DINERS = [[2649, 3144], [3051, 3105], [3827, 3255], [3656, 3284], [3792, 3320], [3565, 3355], [4266, 3379], [4289, 3474], [5357, 2829], [1582, 3542]];
  const blockNear = (x, y, r) => { let n = 0; for (let dy = -r; dy <= r; dy += 16) for (let dx = -r; dx <= r; dx += 16) if (CAR_BLOCK[m.tileAtPx(x + dx, y + dy)]) n++; return n; };
  const ground = net.nodes.filter((q) => q.lvl === 0 && q.edges.length >= 3 && q.edges.every((id) => net.edges[id].lvl === 0));
  const sites = [], apart = (J) => !sites.some((s) => Math.hypot(s.J.x - J.x, s.J.y - J.y) < 2400);
  for (const [tx, ty] of DINERS) {
    const p = m.pois.find((q) => /City Diner/.test(q.label || '') && Math.abs(Math.floor(q.x / TILE) - tx) < 3 && Math.abs(Math.floor(q.y / TILE) - ty) < 3);
    if (!p) continue;
    const J = ground.map((q) => ({ q, d: Math.hypot(q.x - p.x, q.y - p.y) })).filter((o) => o.d < 1100).sort((a, b) => a.d - b.d)[0]?.q;
    if (J && apart(J)) sites.push({ name: `City Diner ${tx},${ty} (${m.districtAt(p.x, p.y).name})`, J });
  }
  for (const J of ground.filter((q) => q.light && q.edges.every((id) => ['st', 'ave', 'blvd', 'art'].includes(net.edges[id].kind))).sort(() => rng() - 0.5)) {
    if (sites.length >= NSITES) break;
    if (apart(J) && blockNear(J.x, J.y, (J.half || 60) + 120) >= 30) sites.push({ name: `junction ${J.id} @${Math.floor(J.x / TILE)},${Math.floor(J.y / TILE)} (${m.districtAt(J.x, J.y).name})`, J });
  }
  sites.length = Math.min(sites.length, NSITES);
  // the player stands on the pavement at a corner of the junction (invincible: nobody takes them away)
  for (const s of sites) {
    let at = { x: s.J.x, y: s.J.y };
    search: for (let r = (s.J.half || 50) + 40; r < 420; r += 16) for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2 + 0.4, x = s.J.x + Math.cos(a) * r, y = s.J.y + Math.sin(a) * r, t = m.tileAtPx(x, y);
      if ((t === T.SIDEWALK || t === T.PLAZA) && m.isWalkable(x, y)) { at = { x, y }; break search; }
    }
    const { p } = joinPlayer(w);
    teleport(w, p.ped, at.x, at.y);
    p.invincible = true;
    Object.assign(s, { p, events: 0, next: 12 + rng() * 6, k: 0, wantedOff: 0, mayhemUntil: 0 });
  }
  // ---- the scene: a wreck burning in a lane short of the junction, people down beside it ----
  const car = (model, x, y, a) => {
    const v = w.spawnVehicle(model, x, y, a, {});
    const d = npc.spawnNpc(w, 'casual', v.x, v.y, 'driver'); d.vehId = v.id; d.seat = 0; v.seats[0] = d.id;
    return v;
  };
  function scene(s) {
    const J = s.J, ped = s.p.ped;
    const ins = J.edges.filter((id) => !net.edges[id].oneway || net.edges[id].b === J.id);
    const id = ins[(s.k++ + Math.floor(rng() * ins.length)) % ins.length], e = net.edges[id], from = e.a === J.id ? e.b : e.a;
    const lp = lanePath(net, e, from, 0), q = pointAt(lp, Math.max(30, lp[lp.length - 1].s - 90 - rng() * 160));
    vehicles.explode(w, car(rng() < 0.5 ? 'sedan' : 'taxi', q.x, q.y, Math.atan2(q.ty, q.tx)), ped);
    for (const [along, side] of [[30, 34], [-40, -60], [70, 80]]) {
      const x = q.x + q.tx * along - q.ty * side, y = q.y + q.ty * along + q.tx * side;
      if (m.isWalkable(x, y)) combat.kill(w, npc.spawnNpc(w, 'casual', x, y, 'civ'), ped, 'pistol');
    }
    s.events++;
    s.wantedOff = w.time + (POLICE ? 10 : 0.01);
    if (MAYHEM) s.mayhemUntil = w.time + 6;
  }
  // ---- the measure ----
  const open = (o) => (!o ? '?' : o.size === 3 ? 'road' : o.size === 4 ? 'kerb' : o.size === 7 ? 'country' : o.size === 10 ? 'any' : `n${o.size}`);
  const modeOf = (v) => {
    const ai = v.ai, now = w.time;
    if (ai.kind !== 'traffic') return `${ai.kind}:${ai.mode || ''}${ai.round ? '+round' : ''}${ai.off ? '+off' : ''}`;
    if (ai.parkIt) return 'parkIt';
    if (ai.turn) return `turn:${ai.turn.mode}/${open(ai.turn.open)}${ai.turn.pausedUntil > now ? '/paused' : ''}`;
    return ai.panicUntil > now ? 'panic' : ai.yieldUntil > now ? 'yield' : ai.reverseUntil > now ? 'reverse' : 'lane';
  };
  const contact = (v) => {
    const c = Math.cos(v.a), sn = Math.sin(v.a);
    let touch = false;
    for (const [inset, res] of [[-3, 'in'], [4, 'touch']]) {
      const hl = v.def.L / 2 + inset, hw = v.def.W / 2 + inset;
      for (const f of [-1, -0.5, 0, 0.5, 1]) for (const l of [-1, 0, 1]) {
        const tx = Math.floor((v.x + c * f * hl - sn * l * hw) / TILE), ty = Math.floor((v.y + sn * f * hl + c * l * hw) / TILE);
        if (CAR_BLOCK[m.tileAt(tx, ty)] || (m.lvl0Block && m.inside(tx, ty) && m.lvl0Block[m.idx(tx, ty)] === 1)) { if (res === 'in') return 'in'; touch = true; }
      }
    }
    return touch ? 'touch' : '';
  };
  const ROAD = new Set([T.ROAD, T.BRIDGE, T.LOT]);
  const cars = new Map(), episodes = [], offBy = {}, touchBy = {}, inBy = {}, offCars = new Set(), touchCars = new Set(), inCars = new Set();
  const t0 = performance.now(), ticks = Math.round(MINUTES * 60 * 20);
  for (let tick = 0; tick < ticks; tick++) {
    for (const s of sites) {
      if (w.time >= s.next) { scene(s); s.next = w.time + 70 + rng() * 20; }
      if (s.wantedOff && w.time > s.wantedOff) { law.clearWanted(w, s.p); s.wantedOff = 0; }
      if (s.mayhemUntil > w.time && tick % 20 === 0) {
        npc.onGunfire(w, s.p.ped.x, s.p.ped.y, s.p.ped);
        for (const v of w.query(s.p.ped.x, s.p.ped.y, 320, K.VEH)) if (v.ai && v.ai.kind === 'traffic' && rng() < 0.35) npc.onVehicleHit(w, v, s.p.ped);
      }
    }
    w.step();
    if (hooks.onTick) hooks.onTick(w);
    const now = w.time, seen = new Set();
    for (const s of sites) for (const v of w.query(s.p.ped.x, s.p.ped.y, 1000, K.VEH)) {
      if (seen.has(v.id) || !v.ai || v.parked || (v.lz || 0) > 0.3 || v.def.kind === 'boat' || v.def.kind === 'air' || v.fly) continue;
      seen.add(v.id);
      let c = cars.get(v.id);
      if (!c) cars.set(v.id, (c = { kind: v.ai.kind, hist: [], recent: [], log: [], left: null, ep: null, site: s.name }));
      const mode = modeOf(v), tt = m.tileAtPx(v.x, v.y), onRoad = ROAD.has(tt);
      c.recent.push(mode); if (c.recent.length > 20) c.recent.shift();
      if (!onRoad && c.onRoad !== false) {
        const hit = now - (v.hardHitAt ?? -99) < 1.5;
        c.left = { mode, before: [...new Set(c.recent.slice(0, -1))].join('>'), hit };
        const k = `${mode}${hit ? '+hit' : ''}`;
        offBy[k] = (offBy[k] || 0) + 1; offCars.add(v.id);
      }
      c.onRoad = onRoad;
      const where = onRoad ? 'road' : tt === T.SIDEWALK ? 'pave' : tt === T.PLAZA ? 'plaza' : `tile ${tt}`, lg = c.log[c.log.length - 1];
      if (!lg || lg.mode !== mode || lg.where !== where) { c.log.push({ t: +now.toFixed(1), mode, where, x: Math.round(v.x), y: Math.round(v.y), fwd: Math.round(vehForwardSpeed(v)) }); if (c.log.length > 30) c.log.shift(); }
      if (tick % 2) continue;
      const ct = contact(v);
      if (ct === 'in') { inCars.add(v.id); inBy[mode] = (inBy[mode] || 0) + 1; }
      if (ct) { touchCars.add(v.id); touchBy[mode] = (touchBy[mode] || 0) + 1; }
      c.hist.push({ t: now, x: v.x, y: v.y });
      while (c.hist.length && now - c.hist[0].t > STUCK_S + 0.01) c.hist.shift();
      let r = 0;
      for (const h of c.hist) r = Math.max(r, Math.hypot(h.x - v.x, h.y - v.y));
      if (ct && now - c.hist[0].t >= STUCK_S - 0.01 && r < STILL_PX) {
        c.ep ||= { id: v.id, model: v.model, kind: v.ai.kind, site: c.site, t0: now - STUCK_S, x: Math.round(v.x), y: Math.round(v.y), left: c.left, modes: {} };
        c.ep.modes[mode] = (c.ep.modes[mode] || 0) + 1;
        if (!c.ep.log && now - c.ep.t0 >= 8) { c.ep.log = c.log.slice(); if (hooks.onStuck) hooks.onStuck(w, v, c.ep); }
      } else if (c.ep && (!ct || r > STILL_PX * 1.5)) { c.ep.t1 = now; c.ep.end = 'got out'; episodes.push(c.ep); c.ep = null; }
    }
    for (const [id, c] of cars) {
      if (c.gone || seen.has(id)) continue;
      const v = w.get(id);
      if (v && v.ai && !v.parked) continue;   // (just out of range of every player)
      c.gone = true;
      if (c.ep) { c.ep.t1 = now; c.ep.end = v ? 'left traffic' : 'removed'; episodes.push(c.ep); c.ep = null; }
    }
    if (VERBOSE && tick % 1200 === 0) console.log(`  t=${Math.round(now)} s: ${cars.size} vehicles, ${episodes.length} episodes (${((performance.now() - t0) / 1000).toFixed(0)} s)`);
  }
  for (const c of cars.values()) if (c.ep) { c.ep.t1 = w.time; c.ep.end = 'still there at the end'; episodes.push(c.ep); }
  for (const e of episodes) e.secs = +(e.t1 - e.t0).toFixed(1);
  // ---- the report ----
  const sorted = (o) => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, n]) => [k, Math.round(n)]));
  const byLeft = {}, byWhile = {}, byKind = {};
  for (const e of episodes) {
    const k = e.left ? `${e.left.mode}${e.left.hit ? '+hit' : ''}` : `${e.kind}: never off the road`;
    byLeft[k] = (byLeft[k] || 0) + e.secs;
    const top = Object.entries(e.modes).sort((a, b) => b[1] - a[1])[0][0];
    byWhile[top] = (byWhile[top] || 0) + e.secs;
    byKind[e.kind] = (byKind[e.kind] || 0) + e.secs;
  }
  const traffic = episodes.filter((e) => e.kind === 'traffic');
  const out = {
    minutes: MINUTES, seed: SEED, mayhem: MAYHEM, police: POLICE, night: NIGHT, sites: sites.map((s) => `${s.name}: ${s.events} scenes`), wallS: Math.round((performance.now() - t0) / 1000),
    vehicles: cars.size, offRoad: offCars.size, touched: touchCars.size, inBuilding: inCars.size,
    stuck: { episodes: episodes.length, vehicles: new Set(episodes.map((e) => e.id)).size, vehicleSeconds: Math.round(episodes.reduce((a, e) => a + e.secs, 0)), over8s: episodes.filter((e) => e.secs >= 8).length, longest: Math.max(0, ...episodes.map((e) => e.secs)),
      traffic: { episodes: traffic.length, vehicleSeconds: Math.round(traffic.reduce((a, e) => a + e.secs, 0)) }, byKind: sorted(byKind), byModeWhenItLeftTheRoad: sorted(byLeft), byModeWhileStuck: sorted(byWhile),
      endedBy: episodes.reduce((o, e) => ((o[e.end] = (o[e.end] || 0) + 1), o), {}) },
    leftTheRoadBy: sorted(offBy), touchingBy: sorted(touchBy), inABuildingBy: sorted(inBy),
    counters: { rejoins: w.rejoins || 0, turns: w.turns || 0, turnsHeld: w.turnsHeld || 0, turnsGivenUp: w.turnsGivenUp || 0, wallBackouts: w.wallBackouts || 0, wallEscapes: w.wallEscapes || 0, reroutes: w.reroutes || 0 },
  };
  return { out, episodes };
}

function main(r) {
  const { out, episodes } = r, s = out.stuck;
  console.log(`== ${out.vehicles} AI vehicles near ${out.sites.length} corners over ${out.minutes} in-game minutes (seed ${out.seed}; ${out.wallS} s to run)`);
  for (const x of out.sites) console.log(`   ${x}`);
  console.log(`  left the road: ${out.offRoad}; touched a building: ${out.touched}; in a building: ${out.inBuilding}`);
  console.log(`  stuck against a building >${STUCK_S} s: ${s.episodes} episodes, ${s.vehicles} vehicles, ${s.vehicleSeconds} vehicle-s (${s.over8s} over 8 s, longest ${s.longest} s); NPC traffic ${s.traffic.episodes} / ${s.traffic.vehicleSeconds} vehicle-s`);
  console.log(`    by kind ${JSON.stringify(s.byKind)}`);
  console.log(`    by the mode it left the road in ${JSON.stringify(s.byModeWhenItLeftTheRoad)}`);
  console.log(`    by its mode while stuck ${JSON.stringify(s.byModeWhileStuck)}; ended ${JSON.stringify(s.endedBy)}`);
  console.log(`  left the road by mode ${JSON.stringify(out.leftTheRoadBy)}`);
  console.log(`  touching a building by mode (samples) ${JSON.stringify(out.touchingBy)}; in one ${JSON.stringify(out.inABuildingBy)}`);
  console.log(`  ${JSON.stringify(out.counters)}`);
  if (VERBOSE) for (const e of episodes.sort((a, b) => b.secs - a.secs).slice(0, 12)) {
    console.log(`  ${e.secs} s: ${e.kind} ${e.model} #${e.id} at ${e.x},${e.y} [${e.site}], off the road ${e.left ? `${e.left.mode} (before: ${e.left.before || '-'})${e.left.hit ? ' hit' : ''}` : '-'}, while stuck ${JSON.stringify(e.modes)}, ${e.end}`);
    if (e.log) for (const q of e.log) console.log(`      ${q.t} ${q.mode} ${q.where} @${q.x},${q.y} ${q.fwd} px/s`);
  }
  if (JSON_OUT) console.log(JSON.stringify(out, null, 1));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(await run());
