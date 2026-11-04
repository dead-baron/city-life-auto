// Signed login tokens (GDD §1 frictionless login). Token = payload.signature, HMAC-SHA256 over the payload.
// payload: { pid, iat, g? } - g is the account's token generation (server/accounts.js): "sign out everywhere" and a ban
// bump it, and a token of an older generation stops working. Tokens from before the launch foundation have no g and
// read as generation 0, which every account starts at: they keep working.
import { createHmac, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { config } from './config.js';

const b64u = (buf) => Buffer.from(buf).toString('base64url');

function sign(payload, secret = config.secret) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function issueToken(pid, gen = 0, secret = config.secret) {
  const body = { pid, iat: Date.now() };
  if (gen) body.g = gen;
  const payload = b64u(JSON.stringify(body));
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyToken(token, secret = config.secret) {
  if (typeof token !== 'string' || token.length > 512) return null;
  const dot = token.indexOf('.');
  if (dot < 1) return null;
  const payload = token.slice(0, dot), sig = token.slice(dot + 1);
  if (!safeEqual(sig, sign(payload, secret))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof data.pid !== 'string' || !/^[a-f0-9]{16,32}$/.test(data.pid)) return null;
    data.g = Number.isInteger(data.g) && data.g > 0 ? data.g : 0;
    return data;
  } catch { return null; }
}

export function newPlayerId() { return randomBytes(12).toString('hex'); }

// constant-time string compare (different lengths compare unequal without leaking where they differ)
export function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  if (x.length !== y.length) { timingSafeEqual(x, x); return false; }
  return timingSafeEqual(x, y);
}

// a keyed one-way hash of something we must recognise but never keep (an email address, a device marker, a GA user id)
export function keyedHash(kind, value, secret = config.secret) {
  return createHmac('sha256', secret).update(kind + '\0' + String(value)).digest('base64url').slice(0, 32);
}
export const sha256 = (buf) => createHash('sha256').update(buf).digest();
export const randomCode = (bytes = 32) => randomBytes(bytes).toString('base64url');
