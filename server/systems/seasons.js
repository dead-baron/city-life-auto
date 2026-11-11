// Seasons and leaderboards (docs/PROGRESSION.md "Seasons, the beta gift and the wipe"; progression build item 7; the
// numbers and the seasons: shared/rules.js SEASONS, SEASON). The public beta is Season 0; launch is Season 1.
//   - the season now: store.kept.season { n, at (ms it began) } - SEASON (rules.js) set from it as the world starts
//     (init -> use) and its mods applied to the rule tables (applyMods: put back when the season changes).
//   - a season ends only when the owner says (the admin command 'season' with end and confirm: server/admin.js ->
//     endSeason): the final boards; each career board's top SEASON.top get a gold plate for good (cosmetics.js 'b:<s>:<c>');
//     the season kept in the hall (store.kept.seasons); everyone online out to the title (players.js seasonOut); the next
//     season; every profile reset (resetOne): the progress-epoch reset (store.js resetProfile - the account, name, looks,
//     clothes and cosmetics kept; the crews' members and names kept, their holdings - the crew bank, its arrears - emptied:
//     crews.js seasonReset) with the season's badge and top-of-ladder titles noted
//     first and the skills carried over at SEASON.skillKeep of their levels. The records board of fish starts again.
//     A profile still behind the season when it joins (none should be: the end resets them all and saves) gets the same.
//   - the leaderboards: each career's (career XP - all of it is this season's: a season's end resets it) and the side
//     boards from the records the game keeps (the biggest fish in your log, races won, bowling's best game, STARFALL's
//     high score). Worked out over every profile once every SEASON.refreshS s (update) and kept (cache), never per
//     request; the phone's What's next app shows each board's top SEASON.top and your own place (boardsFor).
//   - the What's next header line (header): the season's name and theme, the days left; the Skills app's badges (badges).
import * as R from '../../shared/rules.js';
import { FISH_BY_ID } from '../../shared/fish.js';
import { SKILLS, levelOf, xpTo } from '../../shared/skills.js';
import { K } from '../../shared/constants.js';
import { store, resetProfile } from '../store.js';
import * as careers from './careers.js';
import * as cosmetics from './cosmetics.js';
import * as biz from './biz.js';
import * as players from './players.js';
import * as crews from './crews.js';   // (the crews' holdings: crews.js seasonReset)

const { SEASON, SEASONS, CAREERS, CAREER_KEYS } = R;
const DAY_MS = 86400000;
const TOP = (c) => CAREERS[c].ranks.length - 1;

// ---- the season now ------------------------------------------------------------------------------------------------------
// a season's definition: SEASONS' (or, past the end of the list, a plain one - the owner can end a season before the next
// is written up)
export function seasonDef(n) {
  return SEASONS.find((s) => s.n === n) || { n, name: `Season ${n}`, theme: '', blurb: '', start: null, end: null, beta: false, mods: {} };
}
// the rule tables' values before any season's mods: path -> [table, key, value]
const BASE = new Map();
function target(path) {
  const parts = String(path).split('.');
  let o = R[parts[0]];
  for (let i = 1; i < parts.length - 1 && o; i++) o = o[parts[i]];
  const k = parts[parts.length - 1];
  return o && typeof o === 'object' && parts.length > 1 && typeof o[k] === 'number' ? [o, k] : null;
}
// a season's mods on the rule tables (what was there before put back first). -> the paths applied
export function applyMods(mods = {}) {
  for (const [, [o, k, v]] of BASE) o[k] = v;
  BASE.clear();
  const done = [];
  for (const [path, m] of Object.entries(mods || {})) {
    const t = target(path);
    if (!t) { console.warn(`[seasons] mod ${path}: not a number in shared/rules.js - left out`); continue; }
    const [o, k] = t;
    BASE.set(path, [o, k, o[k]]);
    o[k] = typeof m === 'number' ? o[k] * m : m && typeof m.set === 'number' ? m.set : o[k];
    done.push(path);
  }
  return done;
}
// SEASON set to season n (or a definition: the tests' themes), started at `at` (ms); its mods applied
export function use(n, at = null) {
  const d = typeof n === 'object' && n ? { ...seasonDef(n.n), ...n } : seasonDef(n);
  Object.assign(SEASON, { n: d.n, name: d.name, theme: d.theme || '', blurb: d.blurb || '', start: d.start || null, end: d.end || null, beta: !!d.beta, mods: d.mods || {} });
  SEASON.at = at ?? (d.start ? Date.parse(d.start) : Date.now());
  applyMods(SEASON.mods);
  cache = null;
  return SEASON;
}
// the season the store keeps (a new server: the first one, from its start date)
export function init(world) {
  const k = store.kept.season;
  if (k && Number.isFinite(k.n)) use(k.n, k.at);
  else { use(SEASONS[0].n); store.kept.season = { n: SEASON.n, at: SEASON.at }; store.touch(); }
  void world;
}
// when it ends (ms), or null: the beta's ends with the wipe before launch
export function endsAt() {
  if (SEASON.end) return Date.parse(SEASON.end);
  if (SEASON.beta) return null;
  return (SEASON.at || Date.now()) + SEASON.weeks * 7 * DAY_MS;
}
// What's next's header line: { n, name, theme, left (days, or null), note }
export function header(now = Date.now()) {
  const e = endsAt(), left = e === null ? null : Math.max(0, Math.ceil((e - now) / DAY_MS));
  const note = e === null ? 'ends with the wipe before launch' : left === 0 ? 'ends today' : `${left} day${left === 1 ? '' : 's'} left`;
  return { n: SEASON.n, name: SEASON.name, theme: SEASON.theme, left, note };
}
export const behind = (prof) => !!prof && (Number(prof.season) || 0) < SEASON.n;

// ---- the leaderboards ----------------------------------------------------------------------------------------------------
// each board: { id, t (its title), career (a career's: the top 10's plate), v(prof) -> its number (0: not on it), s(v, prof) -> the line }
const n0 = (v) => Math.max(0, Number(v) || 0);
const num = (v) => Math.round(v).toLocaleString('en-US');
function bestFish(prof) {
  let best = null;
  for (const [id, e] of Object.entries(prof.fishLog || {})) { const f = FISH_BY_ID[id], lb = Array.isArray(e) ? Number(e[1]) || 0 : 0; if (f && lb > 0 && (!best || lb > best[1])) best = [f, lb]; }
  return best;
}
export const BOARDS = [
  ...CAREER_KEYS.map((c) => ({ id: c, career: c, t: `Top ${CAREERS[c].ranks[TOP(c)].name}`, v: (prof) => careers.careerXp(prof, c), s: (v, prof) => `${num(v)} XP · ${careers.rankName(c, careers.rankOfXp(c, v))}` })),
  { id: 'fish', t: 'Biggest catch', v: (prof) => { const b = bestFish(prof); return b ? b[1] : 0; }, s: (v, prof) => { const b = bestFish(prof); return `${v} lb${b ? ` ${b[0].name}` : ''}`; } },
  { id: 'races', t: 'Races won', v: (prof) => n0(prof.raceWins), s: (v) => `${num(v)} win${v === 1 ? '' : 's'}` },
  { id: 'bowl', t: 'Bowling: best game', v: (prof) => n0(prof.bowlBest), s: (v) => `${num(v)} pins` },
  { id: 'arcade', t: 'STARFALL high score', v: (prof) => n0(prof.arcadeBest), s: (v) => num(v) },
];
const banned = (prof, now) => { const b = prof.acct && prof.acct.ban; return !!b && (!b.until || b.until > now); };
// every board over every profile: { at, boards: { id: { list: [{ pid, n, v }] (best first), place: Map pid -> index } } }
export function compute(now = Date.now()) {
  const out = { at: now, boards: {} };
  const rows = Object.fromEntries(BOARDS.map((B) => [B.id, []]));
  for (const prof of store.all()) {
    if (!prof || banned(prof, now)) continue;
    for (const B of BOARDS) { const v = B.v(prof); if (v > 0) rows[B.id].push({ pid: prof.pid, n: prof.name, v }); }
  }
  for (const B of BOARDS) {
    const list = rows[B.id].sort((a, b) => b.v - a.v || String(a.n).localeCompare(String(b.n)));
    out.boards[B.id] = { list, place: new Map(list.map((e, i) => [e.pid, i])) };
  }
  return out;
}
var cache = null;   // (a var: use() clears it, and may run while this module is still loading - an import cycle)
export const cached = () => cache;
export function refresh(now = Date.now()) { cache = compute(now); return cache; }
const boards = (now = Date.now()) => cache || refresh(now);
// the phone's view: each board's top SEASON.top and your place - { at (s since worked out), season: header, boards: [{ id,
// t, career, top: [{ i, n, s, me }], me: { i, s } | null, of (how many on it) }] }
export function boardsFor(p, now = Date.now()) {
  const C = boards(now), prof = p.profile;
  return {
    at: Math.round((now - C.at) / 1000), season: header(now), top: SEASON.top,
    boards: BOARDS.map((B) => {
      const b = C.boards[B.id], i = b.place.get(p.pid), mine = i === undefined ? null : b.list[i];
      const line = (e) => B.s(e.v, store.get(e.pid) || prof);
      return { id: B.id, t: B.t, career: B.career || null, of: b.list.length, top: b.list.slice(0, SEASON.top).map((e, j) => ({ i: j + 1, n: e.n, s: line(e), me: e.pid === p.pid ? 1 : 0 })), me: mine ? { i: i + 1, s: line(mine) } : null };
    }),
  };
}
// each second-ish: the boards worked out again every SEASON.refreshS (by the wall clock)
export function update(world) {
  if (world.tick % 20 !== 11) return;
  const now = Date.now();
  if (!cache || now - cache.at >= SEASON.refreshS * 1000) refresh(now);
}

// ---- the Skills app: the badges and the titles kept ----------------------------------------------------------------------
export function badges(p) {
  const C = cosmetics.cosmOf(p.profile);
  return {
    n: SEASON.n, name: SEASON.name, theme: SEASON.theme,
    played: [...C.sb],
    titles: [...C.tops.map((t) => `${careers.rankName(t.c, TOP(t.c))} (S${t.s})`), ...C.bp.map((q) => cosmetics.plateText(cosmetics.boardPlateId(q.s, q.c), p.profile))],
  };
}

// ---- a season's end ------------------------------------------------------------------------------------------------------
// skills at SEASON.skillKeep of their levels (rounded down), from the level's start
export function carrySkills(sk) {
  const xp = {};
  for (const k of SKILLS) { const L = levelOf((sk && sk.xp && sk.xp[k]) || 0), keep = Math.floor(L * SEASON.skillKeep); if (keep > 0) xp[k] = xpTo(keep); }
  return { xp, day: -1, today: {} };
}
// one profile into the season now: what it earned noted (the badge if it played - the beta's: everyone in it -, the top
// ranks' titles), its homes and businesses let go in the running world, the reset, the skills carried
export function resetOne(world, prof) {
  const was = Number(prof.season) || 0, C = cosmetics.cosmOf(prof);
  if (seasonDef(was).beta) cosmetics.noteSeason(prof, was);
  cosmetics.noteTops(prof, was);
  const sk = carrySkills(prof.skills);
  if (world) {
    for (const [id, pid] of [...world.homeOwner]) if (pid === prof.pid) world.homeOwner.delete(id);
    biz.release(world, prof);
  }
  resetProfile(prof);
  prof.cosm = C;
  prof.skills = sk;
  prof.season = SEASON.n;
  store.touch();
  return prof;
}
// The owner's call (admin.js 'season' end): this season over, the next one begun. -> { was, n, reset, plates: [{ n, c, i }] }
export function endSeason(world, { now = Date.now() } = {}) {
  const was = SEASON.n, def = seasonDef(was), final = compute(now);
  // the top of each career board: a gold plate for good
  const plates = [];
  for (const c of CAREER_KEYS) final.boards[c].list.slice(0, SEASON.top).forEach((e, j) => {
    const prof = store.get(e.pid);
    if (!prof) return;
    const C = cosmetics.cosmOf(prof);
    if (!C.bp.some((q) => q.s === was && q.c === c)) C.bp.push({ s: was, c, i: j + 1, of: SEASON.top });
    plates.push({ n: e.n, c, i: j + 1 });
  });
  // the hall: the season and its boards' tops, kept
  const hall = (store.kept.seasons ||= {});
  hall[was] = { name: def.name, theme: def.theme || '', start: SEASON.at, end: now, boards: Object.fromEntries(BOARDS.map((B) => [B.id, final.boards[B.id].list.slice(0, SEASON.top).map((e) => ({ n: e.n, v: e.v }))])) };
  // everyone online out to the title - back in, they're in the new season
  const nx = seasonDef(was + 1);
  const why = `${def.name} is over - thanks for playing! The city starts again: ${nx.name}${nx.theme ? ` (${nx.theme})` : ''}. Your cosmetics, titles and badge come with you.`;
  for (const p of [...world.players.values()]) { if (p.profile) cosmetics.noteSeason(p.profile, was); players.seasonOut(world, p, why); }
  // the next season, and every profile into it
  use(nx.n, now);
  store.kept.season = { n: SEASON.n, at: SEASON.at };
  const gone = new Set();
  for (const prof of store.all()) if (behind(prof)) { resetOne(world, prof); gone.add(prof.pid); }
  for (const v of [...world.entities.values()]) {   // (their cars left in the street: gone, or nobody's with someone in them)
    if (v.kind !== K.VEH || !gone.has(v.owner)) continue;
    if (!v.seats.some((s) => s)) world.remove(v);
    else { v.owner = null; v.ownerName = null; v.despawnable = true; v.descVer = (v.descVer || 0) + 1; }
  }
  store.kept.fishRecords = {};
  crews.seasonReset(now);   // (the crews' holdings - the bank, the arrears; the members and the name stay)
  cache = null;
  store.touch();
  try { store.flushSync(); } catch (e) { console.error('[seasons] save after the season\'s end failed (it saves again shortly):', e.message); }
  if (world.track) world.track('season', null, { was, n: SEASON.n, reset: gone.size });
  console.log(`[seasons] ${def.name} ended: ${gone.size} profile${gone.size === 1 ? '' : 's'} into ${SEASON.name}; ${plates.length} top-${SEASON.top} plate${plates.length === 1 ? '' : 's'}`);
  return { was, n: SEASON.n, reset: gone.size, plates };
}
