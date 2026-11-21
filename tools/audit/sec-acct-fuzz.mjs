// Security audit (accounts / chat / admin messages), report-only: does any odd-typed field make a handler throw?
// A throw in a message handler is not caught anywhere on the live path (session.js route has try/finally, no catch; ws.js
// emits 'message' from the socket's 'data' listener; index.js has no 'uncaughtException' handler): it ends the server.
// Drives launch.js hooks.message (chat, mod, contacts, inbox, friend, emote, typing, chatset, admin, name, acct, ftue, ga)
// and launch.login as a guest and as an admin with field values of every awkward type. Prints any throw.
//   node --max-old-space-size=3072 tools/audit/sec-acct-fuzz.mjs
import { clock, fakeWorld, fakePlayer } from '../../test/launchkit.js';
import { MemoryStore, useStore, store } from '../../server/store.js';
import { config } from '../../server/config.js';
import { createLaunch } from '../../server/launch.js';

const quiet = { log() {}, warn() {}, error() {} };
useStore(new MemoryStore());
const world = fakeWorld(); world.stats = { tickMs: 0 }; world.time = 100; world.emit = () => {};
const c = clock();
const L = createLaunch({ config: { ...config, launch: { ...config.launch } }, store, world, ip: () => '1', dataDir: null, now: c.now, log: quiet });
const join = (o = {}) => { const p = fakePlayer(world, store, o); L.hooks.join(p, {}, {}); return p; };
const g = join(), adm = join(), other = join();
L.accounts.signIn('password', 'pw-adm', { linkPid: adm.pid }); L.accounts.setRole(adm.pid, 'owner');

const VALS = [undefined, null, true, 0, -1, 1e308, NaN, '', 'x', 'constructor', '__proto__', 'toString', 'hasOwnProperty', [], [1, 2], {}, { toString: 1 }, { length: 5 }, 'a'.repeat(5000), L.chat.hid(other.pid), other.pid];
const FIELDS = ['a', 'id', 'ch', 'text', 'to', 'e', 'm', 'on', 'off', 'who', 'why', 'note', 'name', 'email', 'code', 'page', 'kind', 'what', 'n', 'hours', 'mins', 'place', 'x', 'y', 'rid', 'role', 'i', 'item', 's', 'cid', 'sid', 'confirm', 'end'];
const TYPES = ['chat', 'emote', 'typing', 'chatset', 'mod', 'contacts', 'inbox', 'friend', 'admin', 'name', 'acct', 'ftue', 'ga', 'arcade', 'chess'];
const ADMIN_A = ['whoami', 'claim', 'players', 'plog', 'refund', 'rescue', 'restore', 'kick', 'ban', 'unban', 'mute', 'unmute', 'strike', 'unstrike', 'namefree', 'prison', 'reviews', 'resolve', 'role', 'pagelink', 'roster', 'watch', 'tpto', 'bring', 'send', 'heal', 'revive', 'endjob', 'gift', 'founder', 'season', 'undelete', 'constructor', '__proto__'];
const MOD_A = ['mute', 'unmute', 'block', 'unblock', 'report'], FR_A = ['ask', 'yes', 'no', 'unfriend', 'forget'], ACCT_A = ['state', 'transfer', 'name', 'age', 'news'];
const throws = new Map();
let n = 0;
function hit(p, msg) {
  n++;
  try { L.hooks.message(p, msg); } catch (e) { const k = `${msg.t}${msg.a !== undefined ? '/' + (typeof msg.a === 'string' ? msg.a.slice(0, 12) : JSON.stringify(msg.a)) : ''}: ${e && e.message}`; if (!throws.has(k)) throws.set(k, JSON.stringify(msg, (k2, v) => (typeof v === 'string' && v.length > 40 ? v.slice(0, 40) + '...' : v)).slice(0, 200)); }
}
for (const t of TYPES) {
  const as = t === 'admin' ? ADMIN_A : t === 'mod' ? MOD_A : t === 'friend' ? FR_A : t === 'acct' ? ACCT_A : [undefined];
  for (const a of as) for (const f of FIELDS) for (const v of VALS) for (const p of [g, adm]) {
    const msg = { t, ...(a !== undefined ? { a } : null), [f]: v };
    if (t === 'admin' && f !== 'id') msg.id = other.pid;
    hit(p, msg);
  }
}
// the hello: token and fields of every type
for (const v of VALS) for (const f of ['dm', 'age17', 'restore']) { n++; try { L.login(v, { [f]: v }, '1'); } catch (e) { throws.set(`login(${typeof v}): ${e.message}`, JSON.stringify(v) || typeof v); } }
console.log(`${n} messages; ${throws.size} distinct throws (each one would end the live server - nothing catches it)`);
for (const [k, m] of throws) console.log(`  THROWS ${k}\n         ${m}`);
