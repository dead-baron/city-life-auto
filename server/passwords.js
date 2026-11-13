// Email + password sign-in (the owner, 11-12): the password's hash, what a password may be, the email address as the
// account finds it, and the signed one-time links (a password reset, an email check). Node's own crypto only.
//   hashPassword(pw) -> 'scrypt$N$r$p$salt$hash' (a random salt per password; async: scrypt runs on libuv's pool, so a
//                       sign-in never stalls the game's tick)
//   verifyPassword(pw, stored) -> bool (timingSafeEqual; a missing hash is checked against a dummy all the same, so a
//                       wrong address costs as long as a wrong password)
//   passwordProblem(pw, email) -> why not | null      normEmail(raw) -> 'a@b.c' | null
//   signLink / readLink: a link's token, HMAC-signed (no server state: it outlives a restart - the server restarts on
//                       every deploy); a reset's carries the current password's fingerprint, so it works once
// Passwords are never logged, kept in the clear or put in a URL.
import { scrypt, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';
import { ACCOUNT } from '../shared/rules.js';
import { safeEqual, keyedHash } from './auth.js';

// N = 2^15, r = 8: 32 MB and ~50-100 ms a hash (OWASP's floor is N = 2^17 at r = 8, p = 1 for a dedicated box; this one
// also runs the city - and the rate limits and the lockout stand in front of it)
const SCRYPT = { N: 1 << 15, r: 8, p: 1, len: 32 };
const scryptP = (pw, salt, o) => new Promise((ok, no) => scrypt(pw, salt, o.len, { N: o.N, r: o.r, p: o.p, maxmem: 128 * o.N * o.r * 2 }, (e, k) => (e ? no(e) : ok(k))));

export async function hashPassword(pw) {
  const salt = randomBytes(16);
  const k = await scryptP(String(pw).normalize('NFKC'), salt, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64url')}$${k.toString('base64url')}`;
}
let dummy = null;
export async function verifyPassword(pw, stored) {
  const real = typeof stored === 'string' && stored.startsWith('scrypt$');
  if (!real) stored = dummy ||= await hashPassword(randomBytes(12).toString('hex'));
  const [, N, r, p, salt, want] = stored.split('$');
  const o = { N: Number(N), r: Number(r), p: Number(p), len: 32 };
  if (!(o.N >= 1024 && o.N <= 1 << 20 && o.r >= 1 && o.r <= 32 && o.p >= 1 && o.p <= 4)) return false;
  let k;
  try { k = await scryptP(String(pw ?? '').slice(0, ACCOUNT.pwMax * 4).normalize('NFKC'), Buffer.from(salt, 'base64url'), o); } catch { return false; }
  const w = Buffer.from(want, 'base64url');
  return w.length === k.length && timingSafeEqual(w, k) && real;
}

// the most common passwords of ten characters or more (and the game's own names): a small list, matched whole and
// without case. Plus: one character over and over, a run like 0123456789, the address itself.
const COMMON = new Set(['1234567890', '0123456789', '0987654321', '9876543210', '12345678910', '123456789a', '123456789q', 'a123456789', 'q123456789',
  '1q2w3e4r5t', '1q2w3e4r5t6y', 'q1w2e3r4t5', 'qwertyuiop', 'qwerty1234', 'qwerty12345', 'qwerty123456', 'asdfghjkl1', 'asdfghjkl;', 'zxcvbnm123', '1qaz2wsx3edc',
  'password12', 'password123', 'password1234', 'password12345', 'password123456', 'password01', 'passw0rd123', 'p@ssw0rd123', 'p@ssword123', 'password!1',
  'iloveyou12', 'iloveyou123', 'iloveyou1234', 'letmein123', 'welcome123', 'welcome1234', 'trustno1234', 'football123', 'baseball123', 'basketball',
  'superman123', 'batman1234', 'starwars123', 'princess123', 'sunshine123', 'whatever123', 'dragon1234', 'monkey1234', 'shadow1234', 'master1234',
  'michael123', 'jennifer123', 'abc1234567', 'abcdefghij', 'abcdefg123', 'abcd123456', 'aa12345678', 'admin12345', 'administrator', 'changeme123',
  'computer123', 'internet123', 'samsung123', 'liverpool1', 'chelsea123', 'pokemon123', 'minecraft1', 'minecraft123', 'fortnite123', 'roblox1234',
  'gta5online', 'grandtheftauto', 'citylifeauto', 'citylifeauto1', 'citylifeauto123', 'deadbaron123', 'qazwsxedcrfv', 'zaq12wsxcde3', '1234qwerasdf', 'qwer1234asdf']);
export function passwordProblem(pw, email = '') {
  const s = String(pw ?? '');
  if (s.length < ACCOUNT.pwMin) return `A password is at least ${ACCOUNT.pwMin} characters - a few words together work well.`;
  if (s.length > ACCOUNT.pwMax) return `A password is at most ${ACCOUNT.pwMax} characters.`;
  const low = s.toLowerCase();
  if (COMMON.has(low) || COMMON.has(low.replace(/[!.?]+$/, ''))) return 'That password is one of the most common - pick another.';
  if (/^(.)\1+$/.test(s)) return 'Not one character over and over - pick another.';
  const run = '01234567890123456789abcdefghijklmnopqrstuvwxyz', rev = [...run].reverse().join('');
  if (run.includes(low) || rev.includes(low)) return 'That password is too easy to guess - pick another.';
  if (email && (low === String(email).toLowerCase() || low === String(email).toLowerCase().split('@')[0])) return 'Not your email address - pick another.';
  return null;
}

// an address as the account finds it: trimmed, lower case (the part before the @ too: almost every mail service
// ignores its case, and two accounts on one inbox would only confuse)
const EMAIL_RE = /^[^\s@<>()",;:]{1,64}@[a-z0-9.-]{1,190}\.[a-z]{2,24}$/;
export function normEmail(raw) {
  const e = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return e.length <= 254 && EMAIL_RE.test(e) && !e.includes('..') ? e : null;
}
export const emailKey = (email, secret) => keyedHash('email', email, secret);   // (the magic links' hash: their accounts are found by it too)
export const pwFingerprint = (stored, secret) => keyedHash('pwfp', stored || '-', secret).slice(0, 16);

// a signed link token: payload.signature (kind in the signature: a verify link can't be used as a reset)
export function signLink(kind, data, secret) {
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
  return `${payload}.${createHmac('sha256', secret).update(`link:${kind}\0${payload}`).digest('base64url')}`;
}
export function readLink(kind, token, secret, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 600) return null;
  const dot = token.indexOf('.');
  if (dot < 1) return null;
  const payload = token.slice(0, dot);
  if (!safeEqual(token.slice(dot + 1), createHmac('sha256', secret).update(`link:${kind}\0${payload}`).digest('base64url'))) return null;
  try {
    const d = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return d && typeof d.pid === 'string' && typeof d.exp === 'number' && d.exp > now ? d : null;
  } catch { return null; }
}
