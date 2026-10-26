// Game numbers the page itself reads before it is in the city (the HUD, the explosions and lights it predicts, the
// Ferris wheel, the skills' bonuses - client/main.js, hud.js, interiors.js; shared/explosions.js, lights.js, rides.js,
// skills.js): kept out of shared/rules.js so the page doesn't download all of it (30 KB gzipped, 2026-10-26).
// shared/rules.js re-exports every one, so it stays the one place to import game numbers from; each keeps its note
// there too.
export const NPC_CRITICAL = 0.3;        // below this share of health people bleed; NPCs stop fighting and limp off
export const TANKER_BLAST = { r: 330, dmg: 160 };
export const EXPLOSIVES_BLAST = { r: 200, dmg: 110, per: 30, max: 410 };   // a crate, + per crate
export const CALM_PROMPT_S = 4;         // sitting by a fire this long without touching anything: its prompt fades...
export const CALM_HUD_S = 20;           // ...and this long, the whole HUD, for the scene (task #375)
export const FERRIS_S = 40;             // one turn of the wheel (it turns all the time)
export const POLICE_ARMORY = ['service', 'prifle', 'psniper', 'passault', 'pshotgun']; // department weapons in the HQ armory
export const BATTERY_S = 1800;             // a set of batteries: half an hour switched on (a light lasts a little more or less by its kind)
export const FLARE_S = 60;                 // a road flare burns about a minute
export const GLOWSTICK_S = 240;            // a glow stick glows a few minutes
export const SAFETY_CONFIRM_S = 4;
export const SKILL = {
  max: 10, top: 0.15, perLevel: 25,
  act: {
    brawl: { skill: 'strength', xp: 1, cap: 20, name: 'landing blows' },
    haul: { skill: 'strength', xp: 3, cap: 15, name: 'carrying crates' },
    run: { skill: 'stamina', xp: 0.5, cap: 20, name: 'sprinting' },
    swim: { skill: 'swimming', xp: 0.5, cap: 25, name: 'swimming' },
    drive: { skill: 'driving', xp: 4, cap: 20, name: 'driving' },
    race: { skill: 'driving', xp: 10, cap: 20, name: 'racing' },
    shoot: { skill: 'shooting', xp: 1, cap: 20, name: 'hitting what you aim at' },
    sleep: { skill: 'constitution', xp: 15, cap: 15, name: 'a night in your own bed' },
    meal: { skill: 'constitution', xp: 8, cap: 16, name: 'home-cooked meals' },
    campfire: { skill: 'constitution', xp: 0.2, cap: 10, name: 'sitting by a campfire' },
    pushups: { skill: 'strength', xp: 1, cap: 15, name: 'push-ups' },
    situps: { skill: 'stamina', xp: 1, cap: 15, name: 'sit-ups' },
  },
};
