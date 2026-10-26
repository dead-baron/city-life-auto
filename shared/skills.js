// The six skills (the owner, 10-04 / 10-06; the U2 concept): levelled by doing things, a little better at each level -
// never a hard advantage (+15% at the top: rules.js SKILL). Shared: the server levels them and applies them
// (server/systems/skills.js); the page shows them (the phone's Skills app) and predicts what touches your own movement
// - stamina's longer sprint, swimming's stroke - from the levels the server sends (players.js me.skl).
import { SKILL } from './rules-page.js';

export const SKILLS = ['strength', 'stamina', 'swimming', 'driving', 'shooting', 'constitution'];
export const SKILL_INFO = {
  strength: { name: 'Strength', does: 'harder punches and blows' },
  stamina: { name: 'Stamina', does: 'a longer sprint' },
  swimming: { name: 'Swimming', does: 'a faster stroke' },
  driving: { name: 'Driving', does: 'less damage to your ride in a crash' },
  shooting: { name: 'Shooting', does: 'a steadier aim' },
  constitution: { name: 'Constitution', does: 'more health' },
};
// the xp a level takes in all; the level some xp makes; a level's bonus (0 .. SKILL.top)
export const xpTo = (L) => SKILL.perLevel * L * (L + 1);
export function levelOf(xp) {
  let L = 0;
  while (L < SKILL.max && xp >= xpTo(L + 1)) L++;
  return L;
}
export const bonusOf = (L) => SKILL.top * Math.min(L || 0, SKILL.max) / SKILL.max;
