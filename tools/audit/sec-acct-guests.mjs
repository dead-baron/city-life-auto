// Security audit (accounts), report-only: what a fresh hello (no token) gets around, and what unlimited new guests cost.
//  1. a banned guest / member comes back as a new guest: with its device marker (dm) -> refused; without it -> let in
//  2. a chat-muted guest comes back as a new guest: not muted
//  3. N hellos with no token from one address (CLA_GUESTS_PER_HOUR defaults to 0: no limit) -> N saved profiles; the
//     bytes each adds to profiles.json (one JSON file, stringified on the main thread every 5 s) and the time to stringify
//  4. a guest's own rename then scans every profile (launch.js memberOwns / heldBy / guestsHolding, players.js rename)
// Prints what happened; never asserts, never fixes.   node --max-old-space-size=3072 tools/audit/sec-acct-guests.mjs [N]
import { clock, fakeWorld, fakePlayer } from '../../test/launchkit.js';
import { MemoryStore, useStore, store } from '../../server/store.js';
import { config } from '../../server/config.js';
import { createLaunch } from '../../server/launch.js';

const quiet = { log() {}, warn() {}, error() {} };
const N = Number(process.argv[2]) || 20000;
useStore(new MemoryStore());
const world = fakeWorld(); world.stats = { tickMs: 0 }; world.time = 100;
const c = clock();
const L = createLaunch({ config: { ...config, launch: { ...config.launch } }, store, world, ip: () => '1.2.3.4', dataDir: null, now: c.now, log: quiet });
console.log(`config defaults: guestPerHour=${config.launch.guestPerHour} blockBannedDevices=${config.launch.blockBannedDevices} requireAge=${config.launch.requireAge} devOpen=${config.launch.devOpen}`);

// 1. ban evasion
const DM = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const first = L.login(null, { dm: DM }, '1.2.3.4');
const p = fakePlayer(world, store, { pid: first.profile.pid });
L.hooks.join(p, { dm: DM }, first);
L.accounts.ban(p.pid, { hours: 0, why: 'audit' });
console.log('\n1. banned account, its own token          ->', L.login(first.token, { dm: DM }, '1.2.3.4').refused ? 'refused (ok)' : 'LET IN');
console.log('   new hello, no token, same device marker ->', (L.login(null, { dm: DM }, '1.2.3.4').refused) ? 'refused (ok)' : 'LET IN');
const ev = L.login(null, {}, '1.2.3.4');
console.log('   new hello, no token, no dm (cleared site data / private window / a script) ->', ev.refused ? 'refused' : `LET IN as a fresh guest ${ev.profile.pid.slice(0, 6)}...`);
console.log('   (no IP ban exists: launch.js login checks only accounts.banned(token pid) and deviceBanned(hello.dm))');

// 2. mute evasion
const m1 = L.login(null, {}, '1.2.3.4'); const mp = fakePlayer(world, store, { pid: m1.profile.pid, x: 0, y: 0 }); L.hooks.join(mp, {}, m1);
L.mod.mute(L.accounts.get(mp.pid), 24);
const say1 = L.chat.send(world, mp, { ch: 'near', text: 'hello there' });
const m2 = L.login(null, {}, '1.2.3.4'); const mp2 = fakePlayer(world, store, { pid: m2.profile.pid, x: 0, y: 0 }); L.hooks.join(mp2, {}, m2);
const say2 = L.chat.send(world, mp2, { ch: 'near', text: 'hello again' });
console.log('\n2. muted guest says a line                 ->', say1.err || 'sent');
console.log('   the same person as a new guest           ->', say2.err || 'SENT (mute gone)');

// 3. unlimited new guests
const before = store.count, t0 = performance.now();
let refused = 0;
for (let i = 0; i < N; i++) { const r = L.login(null, {}, '1.2.3.4'); if (r.refused) refused++; }
const ms = performance.now() - t0;
console.log(`\n3. ${N} hellos with no token from one address: ${store.count - before} new profiles, ${refused} refused, ${ms.toFixed(0)} ms`);
const one = JSON.stringify([...store.all()].at(-1)).length;
const t1 = performance.now(); const all = JSON.stringify({ version: 1, profiles: [...store.all()], kept: store.kept }); const ser = performance.now() - t1;
console.log(`   one new guest profile serialised: ${one} bytes; ${store.count} profiles -> ${(all.length / 1e6).toFixed(1)} MB, JSON.stringify ${ser.toFixed(0)} ms on the main thread`);
console.log(`   extrapolated: 1,000,000 guests ~ ${(one * 1e6 / 1e9).toFixed(2)} GB in one string (V8's string limit is ~0.5-1 GB: FileStore.flush would throw "Invalid string length" every 5 s - nothing saved again)`);
console.log('   (nothing ever removes a guest profile that never came back: only Start fresh / Delete account do)');

// 4. a rename scans every profile
const g = fakePlayer(world, store, {}); L.hooks.join(g, {}, {});
g.renameTryAt = 0; g.profile.nameAt = 0;
const t2 = performance.now(); const err = L.rename(g, 'Saltwater'); const rn = performance.now() - t2;
console.log(`\n4. one guest rename with ${store.count} profiles: ${rn.toFixed(1)} ms on the tick (${err || 'ok'}) - memberOwns + heldBy + players.rename each walk store.all()`);
