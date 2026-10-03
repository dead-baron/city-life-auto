// Signed guest tokens (GDD §1 frictionless login). Token = payload.signature, HMAC-SHA256.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from './config.js';

const b64u = (buf) => Buffer.from(buf).toString('base64url');

function sign(payload) {
  return createHmac('sha256', config.secret).update(payload).digest('base64url');
}

export function issueToken(pid) {
  const payload = b64u(JSON.stringify({ pid, iat: Date.now() }));
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token) {
  if (typeof token !== 'string' || token.length > 512) return null;
  const dot = token.indexOf('.');
  if (dot < 1) return null;
  const payload = token.slice(0, dot), sig = token.slice(dot + 1);
  const expect = sign(payload);
  const a = Buffer.from(sig), b = Buffer.from(expect);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof data.pid !== 'string' || !/^[a-f0-9]{16,32}$/.test(data.pid)) return null;
    return data;
  } catch { return null; }
}

export function newPlayerId() { return randomBytes(12).toString('hex'); }
