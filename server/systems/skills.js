// Skills (the owner, 10-04 / 10-06: "skills and daily caps - strength, stamina, swimming, driving, shooting,
// constitution; modest gains"; docs/DESIGN-NOTES.md "Skills and progression"). Each of the six levels 0..10 by doing
// things: an activity earns xp for one skill (shared/rules.js SKILL.act), up to its cap an in-game day - you can keep
// levelling the same skill that day by doing something else for it, so a daily routine is the fast way up (no
// endless xp from one thing). What a level does, never more than +15% at the top:
//   strength      harder blows (combat.js melee)              stamina       a longer sprint (pedMods staminaMax)
//   swimming      a faster stroke (pedMods swimMul)            driving       less damage to your ride in a crash (vehicles.js)
//   shooting      a steadier aim (combat.js: less spread)      constitution  more health (the body's base health)
// The page gets the levels (players.js me.skl) for what it predicts - stamina and swimming - and the phone's Skills app
// the whole picture (panel: { t: 'skills' }).
//   profile.skills: { xp: { strength: n, ... }, day (world.day the `today` counts are for), today: { activity: xp } }
import { SKILL, HEARTY_HP } from '../../shared/rules.js';
import { SKILLS, SKILL_INFO, levelOf, bonusOf, xpTo } from '../../shared/skills.js';
import { store } from '../store.js';

const own = (p) => (p.profile.skills ||= { xp: {}, day: -1, today: {} });
export const level = (p, k) => (p && p.profile && p.profile.skills ? levelOf(p.profile.skills.xp[k] || 0) : 0);
export const bonus = (p, k) => bonusOf(level(p, k));
// a ped's bonus (a player's; nobody else levels)
export const pedBonus = (ped, k) => (ped && ped.player ? bonus(ped.player, k) : 0);

// xp for doing `act` (n goes of it: seconds, km...), as far as today's cap for it allows; the xp added
export function gain(world, p, act, n = 1) {
  const A = SKILL.act[act];
  if (!A || !p || !p.profile || !(n > 0)) return 0;
  const s = own(p);
  if (s.day !== world.day) { s.day = world.day; s.today = {}; }
  const used = s.today[act] || 0, add = Math.min(A.xp * n, A.cap - used);
  if (add <= 0) return 0;
  s.today[act] = used + add;
  const k = A.skill, before = levelOf(s.xp[k] || 0);
  s.xp[k] = (s.xp[k] || 0) + add;
  const after = levelOf(s.xp[k]);
  if (after > before) {
    const I = SKILL_INFO[k];
    world.notify(p, `${I.name} up: level ${after} - ${I.does} (+${Math.round(bonusOf(after) * 100)}%).`, 'good');
    if (k === 'constitution') applyHp(world, p);
    p.meDirty = true;
  } else if (used + add >= A.cap - 1e-9) {
    // today's fill of this one: what else counts for the skill
    const more = Object.entries(SKILL.act).filter(([a, B]) => a !== act && B.skill === k && (s.today[a] || 0) < B.cap).map(([, B]) => B.name);
    world.notify(p, `${SKILL_INFO[k].name}: that's all from ${A.name} today${more.length ? ` - ${more.join(' or ')} still counts` : ''}.`, 'info');
  }
  store.touch();
  return add;
}

// the body's health: 100, more with constitution (a hearty meal's on top: economy.js applyBuff)
export const baseHp = (p) => Math.round(100 * (1 + bonus(p, 'constitution')));
export function applyHp(world, p) {
  const ped = p.ped;
  if (!ped || ped.dead) return;
  const was = ped.maxHp, base = baseHp(p);
  ped.baseHp = base;
  ped.maxHp = base + (ped.buffs && ped.buffs.hearty > world.time ? HEARTY_HP : 0);
  if (ped.maxHp > was) ped.hp = Math.min(ped.maxHp, ped.hp + ped.maxHp - was);
  ped.hp = Math.min(ped.hp, ped.maxHp);
  p.meDirty = true;
}

// the levels, for the page (players.js me.skl: SKILLS' order)
export const levels = (p) => SKILLS.map((k) => level(p, k));

// the phone's Skills app: each skill's level, how far to the next, what it does now; what's left today
export function panel(world, p) {
  const s = p.profile.skills || { xp: {}, today: {}, day: -1 }, today = s.day === world.day ? s.today : {};
  return {
    t: 'skills',
    list: SKILLS.map((k) => {
      const xp = s.xp[k] || 0, L = levelOf(xp);
      return { k, name: SKILL_INFO[k].name, does: SKILL_INFO[k].does, L, max: SKILL.max, pct: Math.round(bonusOf(L) * 100), xp: Math.floor(xp - xpTo(L)), need: L >= SKILL.max ? 0 : xpTo(L + 1) - xpTo(L) };
    }),
    today: Object.entries(SKILL.act).map(([a, A]) => ({ a, name: A.name, skill: SKILL_INFO[A.skill].name, left: Math.max(0, Math.round(A.cap - (today[a] || 0))), cap: A.cap })),
  };
}
