// Playtest/debug commands, only accepted when the server runs with CLA_DEV=1.
import { DAY_LOOP_S, DAY_PART_S, STAR_HEAT } from '../shared/constants.js';
import { VEHICLES } from '../shared/vehicles.js';
import { collideVehicleTiles } from '../shared/physics.js';
import { CAR_BLOCK } from '../shared/map.js';
import { WEAPONS } from '../shared/items.js';
import { store } from './store.js';
import * as env from './systems/environment.js';
import * as jobs from './systems/jobs.js';
import * as law from './systems/law.js';

export const DEV_COMMANDS = ['cargo', 'rain', 'clear', 'night', 'day', 'money', 'wanted', 'clean', 'record', 'cop', 'promote', 'samaritan', 'car', 'guns', 'drop', 'heal', 'tp'];

// Find a clear spot near the player for a dev-spawned vehicle (never inside buildings).
function clearSpot(world, ped, def) {
  for (let ring = 0; ring < 4; ring++) {
    for (let k = 0; k < 12; k++) {
      const a = ped.a + (k * Math.PI) / 6;
      const d = 90 + ring * 50 + def.L / 2;
      const x = ped.x + Math.cos(a) * d, y = ped.y + Math.sin(a) * d;
      const s = { x, y, a: 0, vx: 0, vy: 0 };
      const ox = x, oy = y;
      collideVehicleTiles(s, def, world.map, CAR_BLOCK);
      if (Math.hypot(s.x - ox, s.y - oy) < 0.5 && !world.query(x, y, def.L, 2).length) return { x, y, a: 0 };
    }
  }
  return { x: ped.x, y: ped.y + 80, a: 0 };
}

export function command(world, p, c, msg) {
  const ped = p.ped;
  const prof = p.profile;
  switch (c) {
    case 'rain': env.startRain(world, 300); break;
    case 'clear': env.stopRain(world); break;
    case 'night': world.loopTime = DAY_PART_S + 5; break;
    case 'day': world.loopTime = 90; break;
    case 'money': prof.cash += 5000; prof.bank += 20000; world.notify(p, '[dev] +$5,000 cash, +$20,000 bank', 'info'); break;
    case 'wanted': {
      if (!ped) break;
      const s = Math.max(1, Math.min(5, Number(msg.n) || 2));
      law.addHeat(world, p, STAR_HEAT[s] - p.heat + 1, ped.x, ped.y);
      break;
    }
    case 'clean': law.clearWanted(world, p); prof.peakWanted = 0; break;
    case 'record': // wipe the criminal record: no wanted level, no felonies, no peak-wanted memory
      law.clearWanted(world, p); prof.peakWanted = 0; prof.felonies = 0; prof.firedUntil = 0; p.disguised = false;
      world.notify(p, '[dev] Criminal record wiped - no felonies on file.', 'info'); p.meDirty = true; break;
    case 'cop': { // join the force on the spot (record wiped, enough Samaritan points), keep current rank
      law.clearWanted(world, p); prof.peakWanted = 0; prof.felonies = 0; prof.firedUntil = 0;
      prof.samaritan = Math.max(prof.samaritan, law.ENFORCER_MIN_SAMARITAN + 10);
      const err = p.badge ? null : law.goOnDuty(world, p);
      world.notify(p, err ? `[dev] ${err}` : `[dev] On duty as ${law.POLICE_RANKS[law.policeRank(prof)].name}. Dispatch map: M / Start → Map / tap the radar.`, err ? 'bad' : 'good');
      break;
    }
    case 'promote': { // jump to the next police rank
      const r = law.policeRank(prof);
      if (r < law.POLICE_RANKS.length - 1) law.addPolicePts(world, p, law.POLICE_RANKS[r + 1].pts - (prof.policePts || 0));
      else world.notify(p, '[dev] Already Chief of Police.', 'info');
      break;
    }
    case 'samaritan': prof.samaritan += 50; world.notify(p, '[dev] +50 Samaritan', 'info'); break;
    case 'car': {
      if (!ped) break;
      const model = VEHICLES[msg.m] ? msg.m : 'pickup';
      const sp = clearSpot(world, ped, VEHICLES[model]);
      const v = world.spawnVehicle(model, sp.x, sp.y, sp.a, { npcOwned: false });
      v.issuedTo = p.pid;
      break;
    }
    case 'guns':
      for (const id of ['bat', 'pistol', 'shotgun', 'rifle', 'smg', 'rocket', 'rod']) {
        const w = WEAPONS[id];
        prof.weapons[id] = (prof.weapons[id] || 0) + (w.mag ? w.mag * 5 : 0);
        if (w.mag && ped) ped.mag[id] = w.mag;
      }
      prof.inventory.medkit = (prof.inventory.medkit || 0) + 3;
      break;
    case 'cargo': {
      // a flatbed pre-loaded with one crate of every tier, for open-cargo playtests
      if (!ped) break;
      const sp = clearSpot(world, ped, VEHICLES.flatbed);
      const v = world.spawnVehicle('flatbed', sp.x, sp.y, sp.a, { npcOwned: false });
      v.issuedTo = p.pid;
      [1, 2, 3, 4, 1, 2].forEach((tier, i) => {
        const c = world.spawnCrate(tier, v.x, v.y, { owner: p.pid, contraband: false });
        c.state = 'loaded'; c.parent = v.id; c.slot = i; v.cargo[i] = c.id;
      });
      break;
    }
    case 'drop': jobs.spawnDrop(world, Number(msg.n) === 4 ? 4 : 3); break;
    case 'heal': if (ped) { ped.hp = ped.maxHp; ped.bleeding = false; } break;
    case 'tp': if (ped && !ped.vehId && Number.isFinite(msg.x) && Number.isFinite(msg.y)) { ped.x = msg.x; ped.y = msg.y; p.teleportAt = world.time; } break;
    default: world.notify(p, `[dev] unknown command ${c}. Try: ${DEV_COMMANDS.join(', ')}`, 'warn'); return;
  }
  world.loopTime %= DAY_LOOP_S;
  p.meDirty = true;
  store.touch();
}
