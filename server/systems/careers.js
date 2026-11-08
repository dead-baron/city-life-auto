// Careers and ranks (docs/PROGRESSION.md, owner-approved 2026-11-07; the numbers: shared/rules.js CAREERS). Three careers -
// Crime, Police, Business - of 8 ranks each; one character can climb all three. Rank comes from career XP, from what the
// game already hands out:
//   crime     profile.criminalExp (robberies, car theft, heists, hot cargo - and fencing now: CAREERS.crime.fencePer)
//   police    profile.policePts (arrests, bounties alive, patrol calls) + Samaritan points earned on duty (samPer each)
//   business  profile.careers.biz: clean money earned (onMoney: the honest sources, CLEAN) and property bought (props)
// The old police ladder (LEGACY_POLICE: Officer .. Chief of Police) is the new one's first ranks at the same points - a
// profile from before is checked once (migrate: its points at least its old rank's), so nobody drops a rank.
// Crime and police pull against each other: a crime costs a cop police XP (onCrime: on duty, dutyLoss x its heat; off,
// crimeLoss x), and a fresh record of CAREERS.police.lockStars+ stars (the peak-wanted memory) locks police duty
// (dutyLock: law.js goOnDuty). A rank-up is a moment: the career's contact calls (a line in the HUD's notes, kept in the
// app's calls) and a title card with the unlock (the page: { t: 'ftue', a: 'rank', title, sub } - client/ftue.js).
// The gating API the rest of the game asks:
//   careerRank(p | prof, c) -> 0..7        hasUnlock(p | prof, key) -> bool      unlockValue(p | prof, key, def) -> v
//   fenceCut(p, base) · loanDeposit(prof, base) · loanMax(prof, base) · patrolPay(p, pay) · vehicleRefusal(p, model)
//   uniformRank(prof) (the uniform's 0..5: shared/look.js policeLook) · dutyLock(p) -> null | why
// Progress events (note(world, p, ev, d)): what the goals count and what you've tried (the app's novelty) - each a line
// at its emit point: 'fence' {n: $}, 'theft', 'hotEscape', 'rob' {take, hurt} (-> 'cleanRob'), 'arrest', 'bounty',
// 'dispatch', 'duty', 'shift' {job}, 'fishSold' {n: $}, 'clean' {n: $}, 'takings', 'fish' {lb}, 'strike', 'soccerWin',
// 'soccer', 'raceWin', 'race', 'bowl', 'heist', 'sam' {n}, 'xp:<career>' {n} (worked out each second from the counters).
//   profile.careers: { v, main (the career you picked to lead with, or null: your highest), seen { c: rank shown },
//                      biz (business XP), props [keys of property counted], tried { act: 1 }, calls [{ who, text, at }],
//                      pv (the old police ranks checked) } - absent on old profiles (migrate adds it on joining)
import { CAREERS, CAREER_KEYS, POLICE_VEHICLE_RANK } from '../../shared/rules.js';
import { store } from '../store.js';

export { CAREERS, CAREER_KEYS };
// The police ladder before careers (shared/rules.js POLICE_RANKS until 2026-11-07): rank i here is rank LEGACY_TO[i] now
export const LEGACY_POLICE = [
  { name: 'Officer', pts: 0 }, { name: 'Senior Officer', pts: 40 }, { name: 'Sergeant', pts: 120 },
  { name: 'Lieutenant', pts: 260 }, { name: 'Captain', pts: 480 }, { name: 'Chief of Police', pts: 800 },
];
export const LEGACY_TO = [0, 1, 2, 3, 4, 5];
export function legacyRank(pts) {
  let r = 0;
  for (let i = 0; i < LEGACY_POLICE.length; i++) if ((pts || 0) >= LEGACY_POLICE[i].pts) r = i;
  return r;
}

const profOf = (x) => (x && x.profile ? x.profile : x);
const rec = (prof) => (prof.careers ||= fresh());
export const fresh = () => ({ v: 1, main: null, seen: {}, biz: 0, props: [], tried: {}, calls: [] });

// ---- XP and ranks ---------------------------------------------------------------------------------------------------
export function careerXp(x, c) {
  const prof = profOf(x);
  if (!prof) return 0;
  if (c === 'crime') return Math.max(0, Math.floor(prof.criminalExp || 0));
  if (c === 'police') return Math.max(0, Math.floor(prof.policePts || 0));
  if (c === 'business') return Math.max(0, Math.floor((prof.careers && prof.careers.biz) || 0));
  return 0;
}
export function rankOfXp(c, xp) {
  const R = CAREERS[c].ranks;
  let r = 0;
  for (let i = 0; i < R.length; i++) if (xp >= R[i].xp) r = i;
  return r;
}
export const careerRank = (x, c) => (CAREERS[c] ? rankOfXp(c, careerXp(x, c)) : 0);
export const rankName = (c, r) => CAREERS[c].ranks[Math.max(0, Math.min(CAREERS[c].ranks.length - 1, r))].name;
// what a rank unlocks: [{ k, v, name, soon }]
export const unlocksAt = (c, r) => (CAREERS[c].ranks[r] && CAREERS[c].ranks[r].unlock) || [];
// every career's line in the app: { k, name, rank, title, xp, lo, hi (the next rank's xp, or null at the top), next:
// { name, unlocks } | null, have [unlock names], contact }
export function rankInfo(x, c) {
  const C = CAREERS[c], xp = careerXp(x, c), r = rankOfXp(c, xp), R = C.ranks, nx = R[r + 1] || null;
  const have = [];
  for (let i = 0; i <= r; i++) for (const u of unlocksAt(c, i)) have.push({ name: u.name, soon: u.soon ? 1 : 0 });
  return { k: c, name: C.name, icon: C.icon, rank: r, title: R[r].name, xp, lo: R[r].xp, hi: nx ? nx.xp : null, next: nx ? { name: nx.name, unlocks: unlocksAt(c, r + 1).map((u) => ({ name: u.name, soon: u.soon ? 1 : 0 })) } : null, have, contact: contactOf(c, r) };
}
export const contactOf = (c, r) => CAREERS[c].contact[r >= CAREERS[c].lateFrom ? 1 : 0];
// the unlock's best value at or under your rank in any career (v, or true for a plain unlock), else undefined
function unlockOf(x, key) {
  let best;
  for (const c of CAREER_KEYS) {
    const r = careerRank(x, c);
    for (let i = 0; i <= r; i++) for (const u of unlocksAt(c, i)) if (u.k === key && !u.soon) {
      const v = u.v === undefined ? true : u.v;
      if (best === undefined || (typeof v === 'number' && (typeof best !== 'number' || (key === 'deposit' ? v < best : v > best)))) best = v;
    }
  }
  return best;
}
export const hasUnlock = (x, key) => unlockOf(x, key) !== undefined;
export const unlockValue = (x, key, def = 0) => { const v = unlockOf(x, key); return v === undefined || v === true ? def : v; };
// the main career: the one you picked, else the one you're furthest along (by rank, then XP; business first on a tie -
// a new character's honest start)
export function mainCareer(x) {
  const prof = profOf(x);
  const m = prof && prof.careers && prof.careers.main;
  if (m && CAREERS[m]) return m;
  let best = 'business', br = -1, bx = -1;
  for (const c of ['business', 'crime', 'police']) { const xp = careerXp(prof, c), r = rankOfXp(c, xp); if (r > br || (r === br && xp > bx)) { best = c; br = r; bx = xp; } }
  if (bx <= 0 && prof && prof.ftue && prof.ftue.ans === 'hustle') return 'crime';   // (the hustle's first car: a crime start)
  return best;
}
export function setMain(p, c) {
  if (!CAREERS[c]) return false;
  rec(p.profile).main = c;
  store.touch(); p.meDirty = true;
  return true;
}

// XP added to a career (goals' rewards; fencing; patrol calls) - never below zero. The rank's moment comes with the
// next second's check (update)
export function addXp(world, p, c, n) {
  const prof = p.profile;
  if (!n || !CAREERS[c]) return 0;
  if (c === 'crime') prof.criminalExp = Math.max(0, (prof.criminalExp || 0) + n);
  else if (c === 'police') prof.policePts = Math.max(0, (prof.policePts || 0) + n);
  else rec(prof).biz = Math.max(0, (rec(prof).biz || 0) + n);
  store.touch(); p.meDirty = true;
  return n;
}

// ---- the gating hooks ---------------------------------------------------------------------------------------------------
export const fenceCut = (p, base) => Math.max(0.05, base - unlockValue(p, 'fenceCut', 0));
export const loanDeposit = (prof, base) => (prof ? Math.min(base, unlockValue(prof, 'deposit', base)) : base);
export const loanMax = (prof, base) => base + (prof ? unlockValue(prof, 'loans', 0) : 0);
export const patrolPay = (p, pay) => Math.round(pay * (1 + unlockValue(p, 'patrolPay', 0)));
// the uniform by rank: the old ladder's 0..5 (shared/look.js policeLook) - the same rank as before for everyone migrated
export const uniformRank = (prof) => Math.min(LEGACY_POLICE.length - 1, careerRank(prof, 'police'));
// An officer on duty and a police vehicle above their rank: why not (null: fine). Off duty it's theft as it always was.
export function vehicleRefusal(p, model) {
  const need = POLICE_VEHICLE_RANK[model];
  if (need === undefined || !p || !p.badge) return null;
  return careerRank(p, 'police') >= need ? null : `The ${model === 'policeheli' ? 'helicopter' : 'SWAT truck'} is for a ${rankName('police', need)} and up.`;
}
// a fresh record of lockStars+ stars locks police duty for lockMin minutes after its last heat (the peak-wanted memory)
export function dutyLock(p) {
  const prof = p.profile, P = CAREERS.police;
  if ((prof.peakWanted || 0) < P.lockStars) return null;
  const left = (prof.peakWantedAt || 0) + P.lockMin * 60e3 - Date.now();
  if (left <= 0) return null;
  return `Your ${prof.peakWanted}-star record is too fresh to wear the badge - come back in ${Math.ceil(left / 60e3)} min.`;
}

// ---- progress events --------------------------------------------------------------------------------------------------
const listeners = [];
export function onNote(fn) { if (!listeners.includes(fn)) listeners.push(fn); }
// what counts as having tried an activity (the app's novelty): the event's own name, a shift's job type
const TRIED = { fish: 'fish', strike: 'bowl', bowl: 'bowl', soccer: 'soccer', soccerWin: 'soccer', race: 'race', raceWin: 'race', fence: 'fence', theft: 'theft', rob: 'rob', arrest: 'arrest', duty: 'duty', fishSold: 'fish', takings: 'biz', heist: 'heist' };
export function note(world, p, ev, d = {}) {
  if (!p || !p.profile) return;
  const R = rec(p.profile);
  const act = ev === 'shift' ? d.job : TRIED[ev];
  if (act && !R.tried[act]) { R.tried[act] = 1; store.touch(); }
  for (const fn of listeners) { try { fn(world, p, ev, d); } catch (e) { if (world.opts && world.opts.throwErrors) throw e; console.error('[careers] note', ev, e); } }
  if (ev === 'rob' && d.take > 0 && !d.hurt) note(world, p, 'cleanRob', d);
}
export const tried = (p, act) => !!(p.profile.careers && p.profile.careers.tried && p.profile.careers.tried[act]);

// crimes (law.js crime, for the one who did it): a cop loses police XP; a theft starts the "lose them" watch; hurting
// someone mid-robbery spoils the clean robbery
const THEFTS = new Set(['theft', 'carjack', 'carjackHurt', 'policeTheft', 'copCarjack']);
const HURTS = new Set(['punch', 'assault', 'murder', 'copAssault', 'copMurder', 'vehKill', 'hitrun', 'copPunch']);
export function onCrime(world, p, type, spec) {
  if (!p || !spec) return;
  if (p.robbery && HURTS.has(type)) p.robbery.hurt = true;
  if (THEFTS.has(type)) { p.hotCar = world.time; p.hotCarHi = false; note(world, p, 'theft', { type }); }
  const P = CAREERS.police, pts = p.profile.policePts || 0;
  if (pts > 0 && !(p.badge && type === 'brandish')) {
    const loss = Math.min(pts, Math.max(1, Math.round(spec.heat * (p.badge ? P.dutyLoss : P.crimeLoss))));
    p.profile.policePts = pts - loss;
    world.notify(p, `-${loss} police XP: ${spec.label.toLowerCase()} isn't what an officer does.`, 'warn');
    store.touch(); p.meDirty = true;
  }
}
// the crime money a clean source paid out (a crate fenced at the Exchange, a poaching run): not clean money
export function dirty(p, n) { if (p && n > 0) p.cxDirty = (p.cxDirty || 0) + n; }

// Money settled (server/launch.js onMoney - server/moneywatch.js): the honest sources' takings are clean money -
// business XP (cleanPer) and the goals' 'clean'
const CLEAN_SYS = new Set(['jobs', 'taxijob', 'busjob', 'towjob', 'crazytaxi', 'truckjob', 'mailjob', 'forklift', 'fishboat', 'rangerjob', 'firefighter', 'paramedic', 'sar', 'charter', 'dusting', 'coastguard', 'farming', 'biz', 'fishing', 'places', 'felling', 'underground', 'nightclubs']);
const CLEAN_SHOP = new Set(['fishmarket', 'tackle', 'market', 'fruitstand', 'farmstand', 'winery', 'salvage', 'assay', 'grocery', 'farm', 'warehouse', 'delivery', 'trapper', 'butcher', 'lodge', 'huntcamp', 'menu', 'charter']);
export const isClean = (src) => CLEAN_SYS.has(src) || (src.startsWith('shop:') && CLEAN_SHOP.has(src.slice(5)));
export function onMoney(world, p, src, net) {
  if (!(net > 0) || !p || !p.profile || !isClean(String(src))) return 0;
  let n = net;
  if (p.cxDirty) { const d = Math.min(n, p.cxDirty); p.cxDirty -= d; n -= d; }
  if (n <= 0) return 0;
  const R = rec(p.profile);
  R.cash = (R.cash || 0) + n;   // (clean money earned, all told)
  R.bizf = (R.bizf || 0) + n * CAREERS.business.cleanPer;   // (its XP as it builds up: whole points go to biz)
  const whole = Math.floor(R.bizf);
  if (whole > 0) { R.bizf -= whole; R.biz = (R.biz || 0) + whole; }
  note(world, p, 'clean', { n });
  store.touch();
  return n;
}

// ---- the profile's record ---------------------------------------------------------------------------------------------
// what you own: homes by their deeds, businesses by what was paid ({ key: $ })
function owned(prof) {
  const out = {};
  for (const id of prof.homes || []) out[`h${id}`] = (prof.deeds && prof.deeds[id]) || 0;
  for (const [id, e] of Object.entries(prof.biz || {})) out[`b${id}`] = (e && e.paid) || 0;
  return out;
}
// A profile's careers record, added once (old profiles): the ranks it stands at now marked as seen (no moments for
// standing it already had), the police points at least the old rank's (LEGACY_TO), its property counted toward business.
export function migrate(prof) {
  if (!prof) return false;
  let changed = false;
  if (!prof.careers) { prof.careers = fresh(); changed = true; }
  const R = prof.careers;
  R.seen ||= {}; R.tried ||= {}; R.calls ||= []; R.props ||= [];
  if (!R.pv) {
    const old = legacyRank(prof.policePts || 0), want = CAREERS.police.ranks[LEGACY_TO[old]].xp;
    if ((prof.policePts || 0) > 0 && (prof.policePts || 0) < want) prof.policePts = want;
    R.pv = 1;
    const own = owned(prof);
    for (const [k, paid] of Object.entries(own)) if (!R.props.includes(k)) { R.props.push(k); R.biz = (R.biz || 0) + Math.floor(paid * CAREERS.business.propPer); }
    if ((prof.fishLog && Object.keys(prof.fishLog).length) || (prof.stats && prof.stats.fish)) R.tried.fish = 1;
    if (prof.stats && prof.stats.arrests) R.tried.arrest = 1;
    for (const c of CAREER_KEYS) if (R.seen[c] === undefined) R.seen[c] = careerRank(prof, c);
    changed = true;
  }
  return changed;
}

// ---- rank-ups: the contact's call and the title card ------------------------------------------------------------------
const LINES = {
  crime: [
    'Word gets around, {rank}. Keep your head down and your hands quick.',
    'Look at you - {rank}. The Southside\'s starting to say your name.',
    '{rank}. The fence\'ll give you a better rate now. Don\'t make me regret it.',
    'You\'re {rank} now. Deacon\'s heard of you. That\'s good and bad.',
    '{rank}. People listen when you talk now. Say less.',
    '{rank}. The docks remember who delivers. You deliver.',
    '{rank}. One more rung and the city\'s yours. Patience.',
    'Kingpin. Nobody moves in this town without you hearing first.',
  ],
  police: [
    'Welcome to the force, {rank}. Badge on, eyes open.',
    'Good work out there - you\'re an {rank} now. Dispatch will keep you in the loop longer.',
    '{rank}. You\'re setting the pace for the new recruits. Keep it clean.',
    'Sergeant\'s stripes. The SWAT truck\'s yours to take when it\'s needed.',
    'Detective. I asked for you by name - welcome to my squad.',
    '{rank}. You\'ve earned the good patrol calls - they pay more.',
    'Captain. The air unit answers to you now.',
    'Chief. The whole department is yours. Don\'t let it soften you.',
  ],
  business: [
    'Every empire starts at a stall, {rank}.',
    '{rank}! The bank takes you more seriously now - a smaller deposit on your next place.',
    '{rank}. You\'re building something. Park West notices.',
    '{rank}. The bank will carry one more mortgage for you.',
    '{rank}. Rent coming in while you sleep - that\'s the dream.',
    '{rank}. I\'ve had my eye on you. Let\'s talk about towers.',
    '{rank}. Downtown knows your name now.',
    'Tycoon. The towers have room at the top for you.',
  ],
};
export function rankUp(world, p, c, r) {
  const C = CAREERS[c], name = rankName(c, r), who = contactOf(c, r);
  const text = LINES[c][r].replace('{rank}', name);
  const R = rec(p.profile);
  R.calls.unshift({ who, text, c, at: Date.now() });
  if (R.calls.length > 5) R.calls.length = 5;
  world.notify(p, `Call from ${who}: "${text}"`, 'good', `${who} called: ${name}!`);
  const un = unlocksAt(c, r), live = un.filter((u) => !u.soon).map((u) => u.name), soon = un.filter((u) => u.soon).map((u) => u.name);
  const sub = `${C.name} rank ${r + 1} of ${C.ranks.length}${live.length ? ` · ${live.join(' · ')}` : ''}${soon.length ? ` · coming: ${soon.join(' · ')}` : ''}`;
  if (p.conn) p.conn.sendJSON({ t: 'ftue', a: 'rank', c, title: name.toUpperCase(), sub });
  if (world.track) world.track('rank', p, { career: c, rank: r });
  store.touch();
}
function checkRanks(world, p) {
  const R = rec(p.profile);
  for (const c of CAREER_KEYS) {
    const r = careerRank(p, c), s = R.seen[c] ?? r;
    if (r > s) { R.seen[c] = r; rankUp(world, p, c, r); p.nxDirty = true; }
    else if (r < s) { R.seen[c] = r; world.notify(p, `${CAREERS[c].name}: down to ${rankName(c, r)}.`, 'warn'); p.nxDirty = true; store.touch(); }
  }
}

// ---- each second ------------------------------------------------------------------------------------------------------
// the counters' changes since last time: XP by career (the weekly goals; 'xp:<c>'), Samaritan points (the goals' 'sam';
// on duty, police XP too), a job ended with money made (a shift), a stolen car at 2 stars got away from, property bought
export function update(world) {
  if (world.tick % 20 !== 13) return;
  for (const p of world.players.values()) {
    if (!p.profile || !p.conn) continue;
    try { tick(world, p); } catch (e) { if (world.opts && world.opts.throwErrors) throw e; console.error('[careers]', e); }
  }
}
export function tick(world, p) {
  const prof = p.profile;
  if (!prof.careers || !prof.careers.pv) migrate(prof);
  const R = prof.careers;
  const sam = prof.samaritan || 0;
  if (p.cxSam === undefined) p.cxSam = sam;
  if (sam > p.cxSam) {
    const d = sam - p.cxSam;
    note(world, p, 'sam', { n: d });
    if (p.badge) prof.policePts = (prof.policePts || 0) + Math.round(d * CAREERS.police.samPer);
  }
  p.cxSam = sam;
  p.cxXp ||= {};
  for (const c of CAREER_KEYS) {
    const xp = careerXp(prof, c), was = p.cxXp[c];
    if (was !== undefined && xp > was) note(world, p, `xp:${c}`, { n: xp - was });
    p.cxXp[c] = xp;
  }
  // a job: its type and your money when it began; ended with more (not a patrol: that's a dispatch call) - a shift
  const jt = p.job ? p.job.type || 'job' : null, money = (prof.cash || 0) + (prof.bank || 0);
  if (jt !== (p.cxJob ? p.cxJob.type : null)) {
    if (p.cxJob && p.cxJob.type !== 'patrol' && money - p.cxJob.money >= 20) note(world, p, 'shift', { job: p.cxJob.type, n: money - p.cxJob.money });
    p.cxJob = jt ? { type: jt, money } : null;
  }
  // a stolen car: 2 stars after it, then none - and not in cuffs
  if (p.hotCar) {
    if (p.custody || world.time - p.hotCar > 900) p.hotCar = 0;
    else if (p.wanted >= 2) p.hotCarHi = true;
    else if (p.hotCarHi && p.wanted === 0) { p.hotCar = 0; p.hotCarHi = false; note(world, p, 'hotEscape'); }
  }
  if (world.tick % 100 === 13) {   // (property bought: business XP for what it cost)
    for (const [k, paid] of Object.entries(owned(prof))) if (!R.props.includes(k)) { R.props.push(k); R.biz = (R.biz || 0) + Math.floor(paid * CAREERS.business.propPer); store.touch(); }
  }
  checkRanks(world, p);
}
