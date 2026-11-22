// Security audit (sign-ins), report-only: an account made on someone else's email address, kept by a second sign-in.
//  1. The attacker signs up with the victim's address (no proof of the inbox is asked: the account plays at once,
//     authhttp.js signup) and links a Discord / Google sign-in of their own to it (the account's own Bearer: link-confirm).
//  2. The victim later tries to sign up: 409 "That email can't make a new account... use Forgot password".
//  3. The victim does Forgot password, gets the email, sets a password (authhttp.js reset: signOutEverywhere) and plays.
//  4. The attacker signs in with the provider they linked - into the victim's account, its progress and its email.
// Drives the real HTTP handlers (createLaunch http) with a fake mailer; the provider step uses accounts.link / signIn,
// what link-confirm and the OAuth callback call. Prints what happened; never asserts, never fixes.
//   node --max-old-space-size=3072 tools/audit/sec-acct-prehijack.mjs
import { clock, call, fakeWorld } from '../../test/launchkit.js';
import { MemoryStore, useStore, store } from '../../server/store.js';
import { config } from '../../server/config.js';
import { createLaunch } from '../../server/launch.js';

const ORIGIN = 'https://game.example';
useStore(new MemoryStore());
const world = fakeWorld(); world.stats = { tickMs: 0 };
const c = clock(), mails = [];
const quiet = { log() {}, warn() {}, error() {} };
const cfg = { ...config, launch: { ...config.launch, publicUrl: 'https://play.example', pageOrigins: [ORIGIN], google: { id: 'g', secret: 's' }, discord: { id: '', secret: '' }, passwords: true, email: { key: 'rkey', from: 'CLA <a@b.c>' } } };
const L = createLaunch({ config: cfg, store, world, ip: (r) => r.ip, dataDir: null, now: c.now, log: quiet, signOutCloseMs: 0, mail: (m) => { mails.push(m); return true; } });
const post = (path, body, o = {}) => call(L.http, { method: 'POST', url: path, body, ip: o.ip || '5.5.5.5', headers: { origin: ORIGIN, ...(o.headers || {}) } });
const tick = () => new Promise((z) => setImmediate(z));

const VICTIM = 'victim.person@example.com';
let r = await post('/auth/password/signup', { email: VICTIM, password: 'attacker chosen pass', confirm: 'attacker chosen pass', action: 'new' }, { ip: '6.6.6.6' });
const atk = r.json();
console.log('1. attacker signs up with the victim\'s address:', r.status, atk.created ? `account ${atk.pid.slice(0, 6)}... made, plays at once` : JSON.stringify(atk));
const lk = L.accounts.link(atk.pid, 'google', 'attacker-google-sub');
console.log('   attacker links their own Google to it (link-confirm, Bearer = that account):', lk || 'linked');
await tick();
console.log('   emails sent so far:', mails.length, mails.map((m) => m.subject).join(' | '));
r = await post('/auth/password/signup', { email: VICTIM, password: 'victims own passphrase', confirm: 'victims own passphrase', action: 'new' });
console.log('2. the victim tries to sign up:', r.status, r.json().err);
mails.length = 0;
r = await post('/auth/password/forgot', { email: VICTIM });
await tick();
const t = (mails[0] && mails[0].text.match(/\/auth\/password\/reset\?t=([A-Za-z0-9_.-]+)/) || [])[1];
console.log('3. victim: Forgot password ->', r.status, t ? 'reset email received' : 'no email');
r = await call(L.http, { method: 'POST', url: '/auth/password/reset', body: new URLSearchParams({ t, pw: 'victims own passphrase', pw2: 'victims own passphrase' }).toString(), ip: '5.5.5.5' });
console.log('   victim sets their password:', r.status, /Password changed/.test(r.body) ? 'Password changed (other devices signed out)' : r.body.slice(0, 80));
r = await post('/auth/password/login', { email: VICTIM, password: 'victims own passphrase' });
const vic = r.json();
console.log('   victim signs in:', r.status, vic.pid === atk.pid ? 'into the SAME account the attacker made' : vic.pid);
store.get(vic.pid).bank = 123456;   // (the victim plays and earns)
const a = L.accounts.get(vic.pid);
console.log('   the account\'s sign-ins after the reset:', a.logins.map((l) => l.p).join(', '));
const back = L.accounts.signIn('google', 'attacker-google-sub');
console.log('4. attacker signs in with their Google:', back.pid === vic.pid ? `INTO THE VICTIM'S ACCOUNT (bank $${store.get(back.pid).bank}); token valid: ${!!L.accounts.checkToken(L.accounts.token(back.pid))}` : `a different account (${back.pid})`);
