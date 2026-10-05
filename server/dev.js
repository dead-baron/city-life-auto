// Playtest/debug commands: accepted when the server runs with CLA_DEV=1 (offline practice), or
// online from a player in Dev Debug Mode (devmode.js - nothing they do there is saved).
import { surfaceZ } from '../shared/levels.js';
import { DAY_LOOP_S, DAY_PART_S, STAR_HEAT } from '../shared/constants.js';
import { VEHICLES } from '../shared/vehicles.js';
import { WEAPONS } from '../shared/items.js';
import { store } from './store.js';
import * as env from './systems/environment.js';
import * as jobs from './systems/jobs.js';
import * as law from './systems/law.js';
import * as combat from './systems/combat.js';
import * as npc from './systems/npc.js';
import * as gangwar from './systems/gangwar.js';
import * as cruiser from './systems/cruiser.js';
import * as trains from './systems/trains.js';
import * as devmode from './devmode.js';
import * as pets from './systems/pets.js';

const { clearSpot } = cruiser;

export const DEV_COMMANDS = ['god', 'godp', 'gunsp', 'healp', 'shootout', 'die', 'snatch', 'cargo', 'rain', 'clear', 'night', 'day', 'money', 'wanted', 'clean', 'record', 'cop', 'promote', 'samaritan', 'car', 'guns', 'drop', 'heal', 'tp', 'train', 'calltrain', 'goto', 'bring', 'grant', 'spectate', 'time'];

// Find a clear spot near the player for a dev-spawned vehicle (never inside buildings).

export function command(world, p, c, msg) {
  const ped = p.ped;
  const prof = p.profile;
  switch (c) {
    case 'rain': env.startRain(world, 300); break;
    case 'clear': env.stopRain(world); break;
    case 'night': world.loopTime = DAY_PART_S + 5; break;
    case 'day': world.loopTime = 90; break;
    case 'time': { // jump the clock to a time of day: msg.m minutes after midnight
      const mins = ((Number(msg.m) % 1440) + 1440) % 1440;
      // 06:00-20:00 is the day part (DAY_PART_S), 20:00-06:00 the rest of the loop
      world.loopTime = mins >= 360 && mins < 1200 ? (mins - 360) / 840 * DAY_PART_S : DAY_PART_S + (((mins - 1200 + 1440) % 1440) / 600) * (DAY_LOOP_S - DAY_PART_S);
      break;
    }
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
      if (!err && !(ped && ped.vehId && world.get(ped.vehId)?.cruiserOf === p.pid)) cruiser.issueNow(world, p);
      world.notify(p, err ? `[dev] ${err}` : `[dev] On duty as ${law.POLICE_RANKS[law.policeRank(prof)].name}. Dispatch map: M / Start → Map / tap the radar.`, err ? 'bad' : 'good');
      break;
    }
    case 'promote': { // jump to the next police rank
      const r = law.policeRank(prof);
      if (r < law.POLICE_RANKS.length - 1) law.addPolicePts(world, p, law.POLICE_RANKS[r + 1].pts - (prof.policePts || 0));
      else world.notify(p, '[dev] Already Chief of Police.', 'info');
      break;
    }
    case 'shootout': world.notify(p, gangwar.startShootout(world, p) ? '[dev] Shootout started nearby.' : '[dev] No gang turf near you - go toward The Yards or Southside.', 'info'); break;
    case 'die': if (ped && !ped.dead) combat.damage(world, ped, 99999, null, 'crash', 0); break;
    case 'snatch': npc.snatchEvent(world, p); world.notify(p, '[dev] A mugger is on the way to a nearby pedestrian.', 'info'); break;
    case 'pet': pets.spawnLost(world, p); world.notify(p, '[dev] A pet ran off nearby.', 'info'); break;
    case 'samaritan': prof.samaritan += 50; world.notify(p, '[dev] +50 Samaritan', 'info'); break;
    case 'car': {
      if (!ped) break;
      const model = VEHICLES[msg.m] ? msg.m : 'pickup';
      let sp = clearSpot(world, ped, VEHICLES[model]);
      if ((ped.lz || 0) > 0.5) { // up on the deck: somewhere on the deck beside you
        sp = { x: ped.x, y: ped.y, a: ped.a };
        for (let k = 0; k < 16; k++) { const a = (k * Math.PI) / 8, x = ped.x + Math.cos(a) * 110, y = ped.y + Math.sin(a) * 110; if (surfaceZ(world.map, x, y, 1) !== null) { sp = { x, y, a: 0 }; break; } }
      }
      const v = world.spawnVehicle(model, sp.x, sp.y, sp.a, { npcOwned: false });
      v.issuedTo = p.pid;
      v.lz = ped.lz || 0; // up on the highway with you
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
    case 'train': { // hop aboard a train right now (nearest, or msg.n), in car msg.car (default: the first coach)
      if (!ped || ped.dead || !world.trains.length) break;
      if (ped.onTrain) trains.alight(world, ped, ped.x, ped.y);
      let t = world.trains[Number(msg.n)] || null;
      if (!t) { let bd = Infinity; for (const q of world.trains) { const e = world.get(q.cars[0].id); const d = Math.hypot(e.x - ped.x, e.y - ped.y); if (d < bd) { bd = d; t = q; } } }
      const ci = Math.max(1, Math.min(t.cars.length - 1, Number(msg.car) || 1));
      trains.board(world, ped, t, ci, 0, 0, 0);
      world.notify(p, `[dev] Aboard train ${t.i}, car ${ci}.`, 'info');
      break;
    }
    case 'calltrain': { // bring the next train into the nearest station, doors open
      if (!ped || ped.dead || !world.trains.length) break;
      const r = trains.callTrain(world, ped.x, ped.y);
      if (r) world.notify(p, `[dev] A train is waiting at ${r.st.name}.`, 'info');
      break;
    }
    case 'tp': if (ped && ped.onTrain) trains.alight(world, ped, ped.x, ped.y); if (ped) ped.sub = false;
      if (ped && !ped.vehId && Number.isFinite(msg.x) && Number.isFinite(msg.y)) { ped.x = msg.x; ped.y = msg.y; ped.lz = msg.lz === 1 && surfaceZ(world.map, msg.x, msg.y, 1) !== null ? 1 : 0; p.teleportAt = world.time; } break; // lz: 1 = up on the highway deck
    case 'god': devmode.setInvincible(world, p, null); break;              // invincible (toggle)
    case 'spectate':                                                        // free camera: your character stays put, safe
      if (msg.on && !p.spectating) { p.spectating = true; p.specWasGod = !!p.invincible; p.invincible = true; if (ped) { ped.hp = ped.maxHp; ped.bleeding = false; } }
      else if (!msg.on && p.spectating) { p.spectating = false; p.invincible = p.specWasGod; }
      p.meDirty = true;
      break;
    case 'godp': devmode.setInvincible(world, p, msg.pid); break;          // make another player invincible (toggle)
    case 'gunsp': case 'healp': {                                          // give another player weapons / heal them
      const q = world.players.get(String(msg.pid));
      if (!q || !q.ped || q.ped.dead) { world.notify(p, '[dev] Can\'t reach that player right now.', 'warn'); break; }
      if (c === 'healp') { q.ped.hp = q.ped.maxHp; q.ped.bleeding = false; world.notify(q, `${p.name} (dev) healed you.`, 'good'); world.notify(p, `[dev] Healed ${q.name}.`, 'info'); }
      else { command(world, q, 'guns', {}); world.notify(p, `[dev] Gave ${q.name} weapons.`, 'info'); }
      q.meDirty = true;
      break;
    }
    case 'goto': devmode.goTo(world, p, msg.pid); break;     // teleport to an online player
    case 'bring': devmode.bring(world, p, msg.pid); break;   // fetch an online player to you
    case 'grant': devmode.grant(world, p, msg.pid); break;   // give someone Dev Debug Mode (their progress stops saving too)
    default: world.notify(p, `[dev] unknown command ${c}. Try: ${DEV_COMMANDS.join(', ')}`, 'warn'); return;
  }
  world.loopTime %= DAY_LOOP_S;
  p.meDirty = true;
  store.touch();
}
