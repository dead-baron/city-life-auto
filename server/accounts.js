// Accounts (the owner, 11-03: "one account with several linked sign-ins"). The account is the profile: its id is the
// profile's pid and its record rides on the profile as `profile.acct`, so it's saved, kept across restarts and backed up
// with everything else (server/file-store.js), and a profile from before has one made on its next login - a guest, its
// name and progress untouched, its old token still good (server/auth.js generation 0).
//   acct: { v, kind: 'guest' | 'member', created, gen (token generation), logins: [{ p, sub, at }] (google, discord,
//           reddit, email - sub is the provider's user id, an email only as a keyed hash), passkeys: [{ id, pub, alg,
//           count, at, name }], role: null | 'helper' | 'admin' | 'owner', username: bool (picked one), nameAt,
//           age17 (when the 17+ gate was confirmed), ban: { at, until (0: for good), why, by } | null, devices: [hashed
//           markers], strikes, chatMuteUntil, blocks, mutes, contacts, inbox, chatOff (server/chat.js), ftue (analytics) }
// Guests play as GuestNNNN and can't rename; signing in with any provider or a passkey makes the account a member.
import { randomBytes, createHash } from 'node:crypto';
import { issueToken, verifyToken, newPlayerId, keyedHash, safeEqual } from './auth.js';

export const ROLES = ['helper', 'admin', 'owner'];
export const PROVIDERS = ['google', 'discord', 'reddit', 'email', 'passkey'];
export const USERNAME_GAP_DAYS = 30;          // a username changes at most once a month (the first pick is free)
export const TRANSFER_TTL_MS = 10 * 60e3;     // a guest's transfer code lasts ten minutes, once
export const LOGIN_CODE_TTL_MS = 2 * 60e3;    // the code a sign-in hands the page lasts two minutes, once
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // (no 0/O, 1/I/L: read off one screen, typed on another)
const MAX_DEVICES = 5, MAX_LOGINS = 12, MAX_PASSKEYS = 10;

const hashCode = (code) => createHash('sha256').update(String(code).toUpperCase().replace(/[^A-Z0-9]/g, '')).digest('base64url');
export function humanCode(n = 10) {
  const b = randomBytes(n);
  let s = '';
  for (let i = 0; i < n; i++) s += CODE_ALPHABET[b[i] % CODE_ALPHABET.length];   // (256 % 31 = 8: a bias of under 4%, harmless here)
  return s.slice(0, 5) + '-' + s.slice(5);
}

export function createAccounts({ store, secret, now = Date.now }) {
  const transfers = new Map();   // hash(code) -> { pid, exp }
  const loginCodes = new Map();  // code -> { pid, exp, method, created }
  let index = null, indexCount = -1;

  function ensure(profile) {
    if (!profile) return null;
    let a = profile.acct;
    if (a && a.v === 1) return a;
    a = profile.acct = { v: 1, kind: 'guest', created: profile.created || now(), gen: 0, logins: [], passkeys: [], role: null, username: false, nameAt: 0, age17: 0, ban: null, devices: [] };
    store.touch();
    return a;
  }
  const get = (pid) => { const p = store.get(pid); return p ? ensure(p) : null; };
  const profileOf = (pid) => store.get(pid);

  // provider:sub -> pid and pk:<credential id> -> pid, rebuilt when the profiles change in number (and checked on use)
  function idx() {
    if (index && indexCount === store.count) return index;
    index = new Map(); indexCount = store.count;
    for (const p of store.all()) {
      const a = p.acct;
      if (!a) continue;
      for (const l of a.logins || []) index.set(`${l.p}:${l.sub}`, p.pid);
      for (const k of a.passkeys || []) index.set(`pk:${k.id}`, p.pid);
    }
    return index;
  }
  const dropIndex = () => { index = null; };
  function findLogin(provider, sub) {
    const pid = idx().get(`${provider}:${sub}`);
    const a = pid ? get(pid) : null;
    return a && a.logins.some((l) => l.p === provider && l.sub === sub) ? pid : null;
  }
  function findPasskey(id) {
    const pid = idx().get(`pk:${id}`);
    const a = pid ? get(pid) : null;
    const cred = a && a.passkeys.find((k) => k.id === id);
    return cred ? { pid, acct: a, cred } : null;
  }

  function link(pid, provider, sub) {
    const a = get(pid);
    if (!a) return 'No such account.';
    const other = findLogin(provider, sub);
    if (other && other !== pid) return 'That sign-in is already linked to another account.';
    if (other === pid) return null;
    if (a.logins.length >= MAX_LOGINS) return 'Too many sign-ins on this account.';
    a.logins.push({ p: provider, sub, at: now() });
    a.kind = 'member';
    dropIndex(); store.touch();
    return null;
  }
  function unlink(pid, provider) {
    const a = get(pid);
    if (!a) return 'No such account.';
    const n = a.logins.length + a.passkeys.length;
    const left = a.logins.filter((l) => l.p !== provider);
    if (left.length === a.logins.length) return 'That sign-in isn\'t linked.';
    if (n - (a.logins.length - left.length) < 1) return 'Keep at least one way to sign in.';
    a.logins = left; dropIndex(); store.touch();
    return null;
  }

  // A sign-in came back from a provider: the account it's linked to, or (link) linked to the given account, or a new
  // member account. -> { pid, created } | { err }
  function signIn(provider, sub, { linkPid = null } = {}) {
    if (!PROVIDERS.includes(provider) || typeof sub !== 'string' || !sub || sub.length > 200) return { err: 'Bad sign-in.' };
    if (linkPid) { const err = link(linkPid, provider, sub); return err ? { err } : { pid: linkPid, created: false, linked: true }; }
    const had = findLogin(provider, sub);
    if (had) return { pid: had, created: false };
    const pid = newPlayerId();
    const prof = store.create(pid);
    ensure(prof).created = now();
    link(pid, provider, sub);
    return { pid, created: true };
  }

  const token = (pid) => { const a = get(pid); return issueToken(pid, a ? a.gen : 0, secret); };
  // a token the page holds: its account when the token is genuine and of the account's current generation
  function checkToken(tok) {
    const v = verifyToken(tok, secret);
    if (!v) return null;
    const prof = store.get(v.pid);
    if (!prof) return { pid: v.pid, acct: null, gen: v.g };   // (a token for a profile not made yet: index.js makes it)
    const a = ensure(prof);
    if (v.g !== (a.gen || 0)) return null;
    return { pid: v.pid, acct: a, gen: v.g };
  }
  function signOutEverywhere(pid) { const a = get(pid); if (!a) return null; a.gen = (a.gen || 0) + 1; store.touch(); return token(pid); }

  // ---- one-time codes ----
  function sweep() {
    const t = now();
    for (const [k, v] of transfers) if (v.exp <= t) transfers.delete(k);
    for (const [k, v] of loginCodes) if (v.exp <= t) loginCodes.delete(k);
  }
  function makeTransfer(pid) {
    sweep();
    for (const [k, v] of transfers) if (v.pid === pid) transfers.delete(k);   // (one standing code per account)
    const code = humanCode();
    transfers.set(hashCode(code), { pid, exp: now() + TRANSFER_TTL_MS });
    return { code, exp: now() + TRANSFER_TTL_MS };
  }
  function redeemTransfer(code) {
    if (typeof code !== 'string' || code.length > 20) return null;
    sweep();
    const k = hashCode(code), v = transfers.get(k);
    if (!v) return null;
    transfers.delete(k);
    return store.get(v.pid) ? v.pid : null;
  }
  function makeLoginCode(pid, meta = {}) {
    sweep();
    const code = randomBytes(24).toString('base64url');
    loginCodes.set(code, { pid, exp: now() + LOGIN_CODE_TTL_MS, ...meta });
    return code;
  }
  function redeemLoginCode(code) {
    if (typeof code !== 'string' || code.length > 64) return null;
    sweep();
    const v = loginCodes.get(code);
    if (!v) return null;
    loginCodes.delete(code);
    return store.get(v.pid) ? v : null;
  }

  // ---- passkeys ----
  function addPasskey(pid, cred) {
    const a = get(pid);
    if (!a) return 'No such account.';
    if (findPasskey(cred.id)) return 'That passkey is already registered.';
    if (a.passkeys.length >= MAX_PASSKEYS) return 'Too many passkeys on this account.';
    a.passkeys.push({ id: cred.id, pub: cred.pub, alg: cred.alg, count: cred.count || 0, at: now(), name: String(cred.name || 'Passkey').slice(0, 40) });
    a.kind = 'member';
    dropIndex(); store.touch();
    return null;
  }

  // ---- roles, bans, devices ----
  const role = (pid) => { const a = get(pid); return (a && a.role) || null; };
  function setRole(pid, r) {
    const a = get(pid);
    if (!a) return 'No such account.';
    if (r !== null && !ROLES.includes(r)) return 'No such role.';
    a.role = r; store.touch();
    return null;
  }
  const ownerExists = () => { for (const p of store.all()) if (p.acct && p.acct.role === 'owner') return true; return false; };
  function banned(pid) {
    const a = get(pid);
    if (!a || !a.ban) return null;
    if (a.ban.until && a.ban.until <= now()) { a.ban = null; store.touch(); return null; }
    return a.ban;
  }
  function ban(pid, { hours = 0, why = '', by = null } = {}) {
    const a = get(pid);
    if (!a) return null;
    a.ban = { at: now(), until: hours > 0 ? now() + hours * 3600e3 : 0, why: String(why).slice(0, 200), by };
    a.gen = (a.gen || 0) + 1;   // (every token it had stops working)
    store.touch();
    return a.ban;
  }
  function unban(pid) { const a = get(pid); if (!a || !a.ban) return false; a.ban = null; store.touch(); return true; }
  const deviceHash = (dm) => (typeof dm === 'string' && /^[a-f0-9]{16,64}$/.test(dm) ? keyedHash('device', dm, secret) : null);
  function noteDevice(pid, dm) {
    const h = deviceHash(dm), a = get(pid);
    if (!h || !a) return null;
    a.devices = (a.devices || []).filter((d) => d !== h);
    a.devices.unshift(h);
    if (a.devices.length > MAX_DEVICES) a.devices.length = MAX_DEVICES;
    store.touch();
    return h;
  }
  // a device marker seen on an account that is banned now (a soft marker: the page keeps it, a cleared browser loses it)
  function deviceBanned(dm) {
    const h = deviceHash(dm);
    if (!h) return false;
    for (const p of store.all()) { const a = p.acct; if (a && a.ban && (!a.ban.until || a.ban.until > now()) && (a.devices || []).includes(h)) return true; }
    return false;
  }

  // the one-time owner claim (no CLA_OWNER_ID, no owner yet): a code printed in the server log at start
  let claim = null;
  function bootstrapOwner(ownerId, log = console.log) {
    if (ownerId) {
      const prof = store.get(ownerId);
      if (prof) { if (role(ownerId) !== 'owner') setRole(ownerId, 'owner'); log(`[roles] owner: account ${ownerId.slice(0, 6)}... (CLA_OWNER_ID)`); return null; }
      log('[roles] CLA_OWNER_ID names no account on this server - falling back to a claim code');
    }
    if (ownerExists()) return null;
    claim = humanCode(12);
    log(`[roles] no owner yet: in the game, Settings -> Account -> Claim ownership, enter ${claim} (works once, until the server restarts)`);
    return claim;
  }
  function claimOwner(pid, code) {
    if (!claim || ownerExists()) return 'Nothing to claim.';
    if (!safeEqual(String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, ''), claim.replace(/[^A-Z0-9]/g, ''))) return 'That isn\'t the code.';
    claim = null;
    setRole(pid, 'owner');
    return null;
  }

  return {
    ensure, get, profileOf, findLogin, findPasskey, link, unlink, signIn, token, checkToken, signOutEverywhere,
    makeTransfer, redeemTransfer, makeLoginCode, redeemLoginCode, addPasskey, role, setRole, ownerExists,
    banned, ban, unban, noteDevice, deviceBanned, deviceHash, bootstrapOwner, claimOwner, sweep, touch: () => store.touch(),
    isGuest: (pid) => { const a = get(pid); return !a || a.kind !== 'member'; },
    get claimOpen() { return !!claim; },
  };
}
