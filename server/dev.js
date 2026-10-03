// Playtest/debug commands, only accepted when the server runs with CLA_DEV=1.
import { DAY_LOOP_S, DAY_PART_S, STAR_HEAT } from '../shared/constants.js';
import { VEHICLES } from '../shared/vehicles.js';
import { WEAPONS } from '../shared/items.js';
import { store } from './store.js';
import * as env from './systems/environment.js';
import * as jobs from './systems/jobs.js';
import * as law from './systems/law.js';

export const DEV_COMMANDS = ['cargo', 'rain', 'clear', 'night', 'day', 'money', 'wanted', 'clean', 'samaritan', 'car', 'guns', 'drop', 'heal', 'tp'];

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
    case 'samaritan': prof.samaritan += 50; world.notify(p, '[dev] +50 Samaritan', 'info'); break;
    case 'car': {
      if (!ped) break;
      const model = VEHICLES[msg.m] ? msg.m : 'pickup';
      const v = world.spawnVehicle(model, ped.x + Math.cos(ped.a) * 90, ped.y + Math.sin(ped.a) * 90, ped.a, { npcOwned: false });
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
      const v = world.spawnVehicle('flatbed', ped.x + Math.cos(ped.a) * 120, ped.y + Math.sin(ped.a) * 120, ped.a, { npcOwned: false });
      v.issuedTo = p.pid;
      [1, 2, 3, 4, 1, 2].forEach((tier, i) => {
        const c = world.spawnCrate(tier, v.x, v.y, { owner: p.pid, contraband: false });
        c.state = 'loaded'; c.parent = v.id; c.slot = i; v.cargo[i] = c.id;
      });
      break;
    }
    case 'drop': jobs.spawnDrop(world, Number(msg.n) === 4 ? 4 : 3); break;
    case 'heal': if (ped) { ped.hp = ped.maxHp; ped.bleeding = false; } break;
    case 'tp': if (ped && !ped.vehId && Number.isFinite(msg.x) && Number.isFinite(msg.y)) { ped.x = msg.x; ped.y = msg.y; } break;
    default: world.notify(p, `[dev] unknown command ${c}. Try: ${DEV_COMMANDS.join(', ')}`, 'warn'); return;
  }
  world.loopTime %= DAY_LOOP_S;
  p.meDirty = true;
  store.touch();
}
