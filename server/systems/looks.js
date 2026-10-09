// A player's look (shared/look.js): kept in the profile as its compact code, worn by their ped as the old-style
// appearance plus that code (lookToApp: app.lk), so every client draws it and the police describe it. The creator
// (client/creator.js) sets it - free for now (shops come in part 2) - and keeps up to SAVED_LOOKS named looks.
//   ensureLook(prof)        an old profile's random outfit becomes a look; a new player gets a starter until they pick
//   appOf(prof)             the appearance their ped wears
//   handle(world, p, msg)   the client's { t: 'look', a: 'set' | 'save' | 'del' | 'ren' | 'get', ... } -> reply or null
//   stateMsg(p)             { t: 'looks', cur, picked, saved: [{ n, c }] }
import { decodeLook, encodeLook, validLook, lookToApp, lookFromOutfit, starterFor, randomLook, SLOTS } from '../../shared/look.js';
import { store } from '../store.js';

export const SAVED_LOOKS = 12;
const NAME_MAX = 20;

export function ensureLook(prof) {
  if (typeof prof.look === 'string' && decodeLook(prof.look)) { if (!Array.isArray(prof.looks)) prof.looks = []; return; }
  if (prof.outfit) { prof.look = encodeLook(lookFromOutfit(prof.outfit)); prof.lookPicked = true; }
  else { prof.look = encodeLook(starterFor(parseInt(String(prof.pid || '0').slice(0, 8), 16) || 0)); prof.lookPicked = false; }
  delete prof.outfit;
  if (!Array.isArray(prof.looks)) prof.looks = [];
}
export function appOf(prof) {
  ensureLook(prof);
  return lookToApp(decodeLook(prof.look), prof.look);
}
export function stateMsg(p) {
  const prof = p.profile;
  ensureLook(prof);
  return { t: 'looks', cur: prof.look, picked: prof.lookPicked !== false, saved: prof.looks.map((s) => ({ n: s.n, c: s.c })) };
}
const cleanName = (n) => String(n || '').replace(/[^\p{L}\p{N} '&.,!?-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);

// why the look can't change right now (null: it can)
export function changeBlocked(world, p) {
  const ped = p.ped;
  if (!ped) return 'Not right now.';
  if (ped.dead) return 'Not while you\'re down.';
  if (ped.cuffed || p.custody) return 'Not in cuffs.';
  if (p.badge) return 'Hand in the uniform (go off duty) first.';
  if (p.wanted > 0) return 'Not while the police are after you - lose them first (or buy a new outfit at a clothes shop).';
  return null;
}
// put a look on (code already checked): the profile, the ped, everyone's view of them
export function wear(world, p, code) {
  const prof = p.profile;
  prof.look = code;
  prof.lookPicked = true;
  if (p.ped) { p.ped.app = appOf(prof); p.ped.appVer = (p.ped.appVer || 0) + 1; }
  store.touch();
}
// a whole new outfit (the clothes shop's service, the wardrobe at home): body, face and hair kept
export function freshOutfit(prof, seed) {
  ensureLook(prof);
  const cur = decodeLook(prof.look), r = randomLook(seed >>> 0, cur.body.base);
  for (const s of SLOTS) cur.outfit[s] = r.outfit[s];
  return encodeLook(validLook(cur));
}

export function handle(world, p, msg) {
  const prof = p.profile;
  ensureLook(prof);
  const a = String(msg.a || 'get');
  if (a === 'get') return stateMsg(p);
  if (a === 'set') {
    const L = decodeLook(msg.c);
    if (!L) { world.notify(p, 'That look didn\'t come through.', 'warn'); return stateMsg(p); }
    const code = encodeLook(L);
    if (code === prof.look) { if (prof.lookPicked === false) { prof.lookPicked = true; store.touch(); } return stateMsg(p); }
    const why = changeBlocked(world, p);
    if (why) { world.notify(p, why, 'warn'); return stateMsg(p); }
    wear(world, p, code);
    return stateMsg(p);
  }
  if (a === 'save') {
    const L = decodeLook(typeof msg.c === 'string' ? msg.c : prof.look);
    const n = cleanName(msg.n);
    if (!L || !n) { world.notify(p, 'Give the look a name.', 'warn'); return stateMsg(p); }
    const code = encodeLook(L), i = prof.looks.findIndex((s) => s.n.toLowerCase() === n.toLowerCase());
    if (i >= 0) prof.looks[i] = { n, c: code };
    else if (prof.looks.length >= SAVED_LOOKS) { world.notify(p, `You can keep ${SAVED_LOOKS} looks: delete one first.`, 'warn'); return stateMsg(p); }
    else prof.looks.push({ n, c: code });
    store.touch();
    world.notify(p, `Look saved: ${n}.`, 'good');
    return stateMsg(p);
  }
  const i = Number(msg.i);
  if (!Number.isInteger(i) || i < 0 || i >= prof.looks.length) return stateMsg(p);
  if (a === 'del') { prof.looks.splice(i, 1); store.touch(); return stateMsg(p); }
  if (a === 'ren') {
    const n = cleanName(msg.n);
    if (!n) return stateMsg(p);
    if (prof.looks.some((s, j) => j !== i && s.n.toLowerCase() === n.toLowerCase())) { world.notify(p, 'You have a look by that name already.', 'warn'); return stateMsg(p); }
    prof.looks[i].n = n;
    store.touch();
    return stateMsg(p);
  }
  return stateMsg(p);
}
