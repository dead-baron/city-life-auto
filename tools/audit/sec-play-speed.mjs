// Security audit (report only): a page that sends two inputs a tick (40 a second, under anticheat INPUT_MAX 75) is stepped
// twice a tick (players.js inputsOf: n = 2 while its queue is over 3) - it moves at double speed. Does the movement audit flag it?
//   node --max-old-space-size=3072 tools/audit/sec-play-speed.mjs
import { makeWorld, joinPlayer, teleport, straightRoad } from '../../test/helpers.js';
import { createAntiCheat } from '../../server/anticheat.js';
import { IN } from '../../shared/input.js';

const w = makeWorld();
const ac = createAntiCheat({ mod: null, log: { warn: () => {} } });
const road = straightRoad(w.map, 3000);
function trial(label, perTick, bits, mx) {
  const { p } = joinPlayer(w);
  teleport(w, p.ped, road.x + 40, road.y);
  let seq = p.ack, clock = 0;
  const realNow = Date.now;
  // the audit's wall clock follows the world's (a real server: one tick each 50 ms)
  const acx = createAntiCheat({ mod: null, log: { warn: () => {} }, now: () => 1e12 + clock * 1000 });
  const x0 = p.ped.x, flags = [];
  for (let t = 0; t < 20 * 6; t++) {
    for (let k = 0; k < perTick; k++) p.inputQ.length < 8 ? p.inputQ.push({ seq: ++seq, bits, mx, my: 0, aim: 0 }) : null;
    w.step(); clock += 0.05;
    if (t % 10 === 0) flags.push(...acx.audit(w));
  }
  const sp = (p.ped.x - x0) / 6;
  console.log(`${label}: ${perTick} inputs a tick -> ${Math.round(sp)} px/s (${(sp * 3.6 / 32).toFixed(1)} km/h), inSteps ${p.inSteps}, flags: ${flags.filter((f) => f.id === p.pid).map((f) => f.kind).join(',') || 'none'}; foot allowance ${Math.round(acx.allowed(w, p))} px/s`);
  w.remove(p.ped); w.players.delete(p.pid);
  void realNow;
}
trial('run, honest page ', 1, 0, 1);
trial('run, 2x page     ', 2, 0, 1);
trial('sprint, honest   ', 1, IN.SPRINT, 1);
trial('sprint, 2x page  ', 2, IN.SPRINT, 1);
void ac;

// in a car: full throttle down the long road, then the same at half throttle (a 2x page under the vehicle allowance)
function carTrial(label, perTick, throttleMy) {
  const { p } = joinPlayer(w);
  const v = w.spawnVehicle('sedan', road.x + 60, road.y, 0);
  p.ped.vehId = v.id; p.ped.seat = 0; v.seats[0] = p.ped.id;
  let seq = p.ack, clock = 0;
  const acx = createAntiCheat({ mod: null, log: { warn: () => {} }, now: () => 2e12 + clock * 1000 });
  const flags = []; let x0 = 0, t = 0;
  for (t = 0; t < 20 * 8; t++) {
    if (t === 40) x0 = v.x;
    for (let k = 0; k < perTick; k++) if (p.inputQ.length < 8) p.inputQ.push({ seq: ++seq, bits: 0, mx: 1, my: 0, aim: 0 });
    w.step(); clock += 0.05;
    if (t % 10 === 0) flags.push(...acx.audit(w));
    if (v.x > road.x + road.len - 200) break;
  }
  const sp = (v.x - x0) / ((t - 40) / 20);
  console.log(`${label}: ${perTick}/tick -> ~${Math.round(sp)} px/s over the last stretch (def.max ${v.def.max}, allowance ${Math.round(acx.allowed(w, p))}), flags: ${flags.filter((f) => f.id === p.pid).map((f) => f.kind).join(',') || 'none'}`);
  w.remove(v); w.remove(p.ped); w.players.delete(p.pid);
}
carTrial('sedan honest, full ', 1, -1);
carTrial('sedan 2x,     full ', 2, -1);
