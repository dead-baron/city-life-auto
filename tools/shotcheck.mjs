// The shot list's sanity check (the owner, 2026-11-14 20:21: "It's showing not interesting areas, usually tops of
// buildings or sides of buildings; there aren't interesting NPCs doing things; it's all at night"): one shot played on a
// built world as the camera panel plays it (held, then on), the camera's frame looked at three times through it -
//   - over open ground at street level: its middle never on a roof (or the walls drawn up over the street), most of the
//     frame streets, plazas, parks or water (director.js frameOpen)
//   - its subject in frame: what the camera follows (a vehicle, the racers, a crowd) inside the picture
//   - people about: a place shot or a people shot has people on foot in the picture; a vehicle shot its vehicle
//   - the time it says: its note names the band its time of day reads as (shared/scenes/shots.js TOD)
// test/world3scenes.test.js runs it over the kept shots (shared/scenes KEPT); `node tools/shotcheck.mjs` reports on all.
import { K, TILE } from '../shared/constants.js';
import { TOD } from '../shared/scenes/shots.js';

const W = 1280, H = 720;
export function checkShot(world, director, sc, p) {
  const why = [], seen = [];
  const r = director.start(world, sc.id, { mode: 'dev', ref: null, hold: true, viewer: p });
  if (r.err) return { id: sc.id, ok: false, why: [r.err], seen };
  const run = r.run;
  director.goRun(world, run);
  const band = sc.tl ? null : TOD(sc.time);
  if (band && !sc.note.includes(band) && !(band === 'day' && /noon|afternoon|morning|day/.test(sc.note))) why.push(`its note doesn't say ${band} (${sc.note})`);
  const at = [0.2, 0.5, 0.85].map((u) => Math.round(u * (sc.len - (sc.linger || 0)) * 20));
  let tick = 0, peds = 0, subjIn = 0, subjN = 0;
  const followIds = [...new Set((sc.cam || []).map((c) => c.follow || (c.between && c.between[0])).filter(Boolean))];
  for (const k of at) {
    while (tick < k && !run.over) { world.step(); tick++; }
    if (run.over) { why.push(`over early (${run.why}) at ${(tick / 20).toFixed(1)} s`); break; }
    const cam = run.camPrev;
    if (!cam) { why.push('no camera'); continue; }
    const f = director.frameOpen(world.map, cam.x, cam.y, cam.z);
    const hw = W / 2 / cam.z, hh = H / 2 / cam.z;
    const inFrame = (e) => Math.abs(e.x - cam.x) < hw * 0.92 && Math.abs(e.y - cam.y) < hh * 0.92;
    let n = 0;
    for (const e of world.query(cam.x, cam.y, Math.hypot(hw, hh))) if (e.kind === K.PED && !e.dead && !e.vehId && !e.hidden && !e.player && inFrame(e)) n++;
    peds = Math.max(peds, n);
    // the subject: the cast the camera's on (at this moment, or any it follows)
    const cast = followIds.map((cid) => { const A = run.cast.get(cid) || run.cast.get(`${cid}.0`); return A && world.get(A.id); }).filter(Boolean);
    if (cast.length) { subjN++; if (cast.some((e) => inFrame(e.vehId ? world.get(e.vehId) || e : e))) subjIn++; }
    seen.push({ t: +(tick / 20).toFixed(1), x: Math.round(cam.x / TILE), y: Math.round(cam.y / TILE), z: +cam.z.toFixed(2), open: +f.open.toFixed(2), mid: f.mid, peds: n });
    if (!sc.interior) {
      if (!f.mid) why.push(`its middle on a roof at ${(tick / 20).toFixed(1)} s (tile ${Math.round(cam.x / TILE)}, ${Math.round(cam.y / TILE)})`);
      if (f.open < 0.5) why.push(`mostly roofs at ${(tick / 20).toFixed(1)} s (${Math.round(f.open * 100)}% open)`);
    }
  }
  if (subjN && subjIn < subjN) why.push(`its subject out of the picture ${subjN - subjIn} of ${subjN} times`);
  const vehicleShot = (sc.cast || []).some((c) => c.veh);
  if (!vehicleShot && peds < 3) why.push(`hardly anyone about (${peds} on foot in the picture at most)`);
  director.end(world, run, 'stopped');
  for (let i = 0; i < 2; i++) world.step();
  return { id: sc.id, ok: !why.length, why, seen, peds };
}

// node tools/shotcheck.mjs: World v3 built (about 100 s, 2 GB - under the heavy lock), every shot checked, a report
if (import.meta.url === `file://${process.argv[1]}`) {
  const { buildWorld3 } = await import('../server/world3.js');
  const { World } = await import('../server/world.js');
  const { joinPlayer } = await import('../test/helpers.js');
  const director = await import('../server/systems/director.js');
  const { SCENE_LIST, isKept } = await import('../shared/scenes/index.js');
  const { map } = await buildWorld3(1337, { log: () => {} });
  const world = new World(map, { npcBudget: 60 });
  const { p } = joinPlayer(world);
  p.devMode = true;
  for (let i = 0; i < 10; i++) world.step();
  const only = process.argv[2] ? process.argv[2].split(',') : null;
  for (const sc of SCENE_LIST) {
    if (only && !only.includes(sc.id)) continue;
    const res = checkShot(world, director, sc, p);
    console.log(`${res.ok ? 'PASS' : 'FAIL'} ${isKept(sc.id) ? 'kept' : 'more'} ${sc.id}: ${res.why.join('; ')} | ${res.seen.map((q) => `${q.t}s ${q.x},${q.y} z${q.z} open${q.open}${q.mid ? '' : ' ROOF'} peds${q.peds}`).join(' / ')}`);
  }
}
