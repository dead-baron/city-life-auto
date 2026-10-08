// Shared constants used by both the authoritative server and the browser client.

export const TILE = 32;                 // world pixels per tile
export const MAP_W = 1312;              // tiles: the world map concept, one pixel per tile (1 tile = 1 m)
export const MAP_H = 1200;              // tiles
export const WORLD_W = MAP_W * TILE;    // 41984 px
export const WORLD_H = MAP_H * TILE;
// The world's layout version (docs/WORLD-V2.md). Profiles remember the version they were saved in;
// homes and anything else a profile refers to by its place in the map (home indices, the spot you
// logged out on) only make sense in that world, so when this changes they are released - homes
// bought back, you wake at a hospital (server/systems/homes.js checkWorld). Bump it whenever a change
// moves homes or the streets under people's feet.
//   1  the original world (until 2026-10)
//   2  World v2 stage 1: Metro City's core re-laid (real-sized blocks, pavements by district class)
//   3  the hero corner: Holly Street x Madison Street laid out in Midtown (the art targets' crossroads)
//   4  World v2 stage 1b: highways two lanes each way, diamond interchanges on the ring
//   5  roads that go somewhere: the Arts District, the Gull Isles' villages; houses along the winding drives of Pine
//      Hills, the Lake District and The Bluffs, Cedar Isle's ring road only along Cedar Falls; every business
//      places itself with its own numbers (so the next rework of one district doesn't move the rest)
export const WORLD_VERSION = 5;
export const CHUNK_TILES = 24;          // net-culling chunk = one city block pitch
export const CHUNK_PX = CHUNK_TILES * TILE; // 768 px
export const CHUNKS_X = Math.ceil(MAP_W / CHUNK_TILES);
export const CHUNKS_Y = Math.ceil(MAP_H / CHUNK_TILES);

export const TICK_HZ = 20;
export const DT = 1 / TICK_HZ;
export const TICK_MS = 1000 / TICK_HZ;

export const PED_RADIUS = 11;

// Chrono loop (GDD §3): 20-minute cycle, 14 min day + 6 min night (the night was 5 min: longer and darker now).
export const DAY_LOOP_S = 1200;
export const DAY_PART_S = 840;

// Tile types
export const T = {
  WALL: 0, GRASS: 1, SIDEWALK: 2, ROAD: 3, PLAZA: 4, BUILDING: 5, WATER: 6, DEEP: 7,
  SAND: 8, DOCK: 9, DIRT: 10, FIELD: 11, BRIDGE: 12, LOT: 13,
  FLOOR: 14, COUNTER: 15, // inside walk-in buildings: shop floor (walkable) and the counter (blocks people, not sight)
};

// Weather
export const WEATHER = { CLEAR: 0, RAIN: 1 };

// Entity kinds (wire values)
export const K = { PED: 1, VEH: 2, CRATE: 3, BAG: 4, PROJ: 5, PICKUP: 6, BALL: 7, TRAIN: 8 };

// Ped flag bits (wire)
export const PF = {
  DEAD: 1, DOWN: 2, STUN: 4, SPRINT: 8, ATTACK: 16, AIM: 32, ROLL: 64, CARRY: 128,
  INVEH: 256, BLEED: 512, GHOST: 1024, FLARE: 2048, BADGE: 4096, MOVING: 8192,
  FISHING: 16384, UMBRELLA: 32768,
};
PF.PASSENGER = PF.SPRINT; // in a vehicle the sprint bit means "not the driver's seat"
PF.KNEEL = PF.FISHING;    // on a medic: kneeling beside someone

// Vehicle flag bits (wire)
export const VF = {
  LIGHTS: 1, SIREN: 2, BRAKE: 4, REVERSE: 8, WRECK: 16, BURN: 32, SMOKE: 64, DRIFT: 128,
  HORN: 256, BLOODY: 512, DRIVER: 1024, OWNED: 2048, FLAT: 4096, DEAD: 8192, // DEAD: out of health, the engine cut out (it rolls to a stop, burns, explodes)
};

// Factions
export const FACTION = { CITIZEN: 'citizen', CRIMINAL: 'criminal', ENFORCER: 'enforcer', HUNTER: 'hunter' };

// Wanted thresholds (heat points -> stars 1..5)
export const STAR_HEAT = [0, 10, 30, 60, 100, 160];

export function starsForHeat(heat) {
  let s = 0;
  for (let i = 1; i < STAR_HEAT.length; i++) if (heat >= STAR_HEAT[i]) s = i;
  return s;
}

// Game clock: returns { minutes (0..1439), night (0..1 darkness), isNight }
export function gameClock(loopSeconds) {
  const t = ((loopSeconds % DAY_LOOP_S) + DAY_LOOP_S) % DAY_LOOP_S;
  let minutes;
  if (t < DAY_PART_S) minutes = 6 * 60 + (t / DAY_PART_S) * 14 * 60;          // 06:00 -> 20:00
  else minutes = 20 * 60 + ((t - DAY_PART_S) / (DAY_LOOP_S - DAY_PART_S)) * 10 * 60; // 20:00 -> 06:00
  minutes = minutes % 1440;
  // darkness ramps over the last 60 s of the day part (dusk) and the first 60 s of the next (dawn)
  let dark;
  if (t >= DAY_PART_S) dark = 1;
  else if (t > DAY_PART_S - 60) dark = (t - (DAY_PART_S - 60)) / 60;
  else if (t < 60) dark = 1 - t / 60;
  else dark = 0;
  return { minutes, dark, isNight: t >= DAY_PART_S - 30 || t < 30 };
}
