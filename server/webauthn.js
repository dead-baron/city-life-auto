// Passkeys (WebAuthn level 2, the owner's 11-03 addition: the device's own fingerprint or face sign-in, nothing to
// register with anyone). Verification with node:crypto only: CBOR for the attestation object and the COSE public key,
// ES256 (P-256) and RS256 keys, the challenge, origin and rpId checks, the user-presence flag and the sign counter.
// We ask for attestation 'none': the attestation statement is not verified (any format is taken as self-asserted - we
// trust the key from the first sign-up on, never where it came from).
import { createPublicKey, verify as cryptoVerify, createHash, randomBytes } from 'node:crypto';
import { safeEqual } from './auth.js';

export const ALG = { ES256: -7, RS256: -257 };
export const CHALLENGE_TTL_MS = 5 * 60e3;
const FLAG_UP = 0x01, FLAG_UV = 0x04, FLAG_AT = 0x40;

const fromB64u = (s) => { if (typeof s !== 'string' || s.length > 16384 || !/^[A-Za-z0-9_-]*={0,2}$/.test(s)) throw new Error('not base64url'); return Buffer.from(s, 'base64url'); };
const sha256 = (b) => createHash('sha256').update(b).digest();

// ---- CBOR (RFC 8949), the subset authenticators send: ints, byte and text strings, arrays, maps (as Map), tags, simple
// values and floats; definite and indefinite lengths. -> [value, next offset]
export function cborDecode(buf, off = 0, depth = 0) {
  if (depth > 16) throw new Error('cbor: too deep');
  if (off >= buf.length) throw new Error('cbor: truncated');
  const ib = buf[off++], mt = ib >> 5, ai = ib & 31;
  let len;
  const need = (n) => { if (off + n > buf.length) throw new Error('cbor: truncated'); };
  if (ai < 24) len = ai;
  else if (ai === 24) { need(1); len = buf[off]; off += 1; }
  else if (ai === 25) { need(2); len = buf.readUInt16BE(off); off += 2; }
  else if (ai === 26) { need(4); len = buf.readUInt32BE(off); off += 4; }
  else if (ai === 27) { need(8); const v = buf.readBigUInt64BE(off); off += 8; if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('cbor: too big'); len = Number(v); }
  else if (ai === 31 && mt >= 2 && mt <= 5) len = -1;   // indefinite
  else if (mt === 7 && ai === 31) throw new Error('cbor: stray break');
  else throw new Error('cbor: bad length');
  switch (mt) {
    case 0: return [len, off];
    case 1: return [-1 - len, off];
    case 2: case 3: {
      if (len === -1) {
        const parts = [];
        while (buf[off] !== 0xff) { const [v, n] = cborDecode(buf, off, depth + 1); parts.push(typeof v === 'string' ? Buffer.from(v) : v); off = n; }
        const all = Buffer.concat(parts);
        return [mt === 2 ? all : all.toString('utf8'), off + 1];
      }
      need(len);
      const b = buf.subarray(off, off + len);
      return [mt === 2 ? Buffer.from(b) : b.toString('utf8'), off + len];
    }
    case 4: {
      const out = [];
      if (len === -1) { while (buf[off] !== 0xff) { const [v, n] = cborDecode(buf, off, depth + 1); out.push(v); off = n; } return [out, off + 1]; }
      if (len > 10000) throw new Error('cbor: too long');
      for (let i = 0; i < len; i++) { const [v, n] = cborDecode(buf, off, depth + 1); out.push(v); off = n; }
      return [out, off];
    }
    case 5: {
      const m = new Map();
      const pair = () => { const [k, n] = cborDecode(buf, off, depth + 1); off = n; const [v, n2] = cborDecode(buf, off, depth + 1); off = n2; m.set(k, v); };
      if (len === -1) { while (buf[off] !== 0xff) pair(); return [m, off + 1]; }
      if (len > 10000) throw new Error('cbor: too long');
      for (let i = 0; i < len; i++) pair();
      return [m, off];
    }
    case 6: return cborDecode(buf, off, depth + 1);   // a tag: the value inside
    case 7: {
      if (ai === 20) return [false, off];
      if (ai === 21) return [true, off];
      if (ai === 22 || ai === 23) return [null, off];
      if (ai === 25) { const h = len, s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 31, f = h & 1023; return [s * (e === 0 ? f * 2 ** -24 : e === 31 ? (f ? NaN : Infinity) : (1 + f / 1024) * 2 ** (e - 15)), off]; }
      if (ai === 26) { const b = Buffer.alloc(4); b.writeUInt32BE(len); return [b.readFloatBE(0), off]; }
      if (ai === 27) throw new Error('cbor: double not supported');
      return [len, off];
    }
    default: throw new Error('cbor: bad major type');
  }
}
// the encoder, for the tests' fake authenticators (and nothing on the live path)
export function cborEncode(v) {
  const head = (mt, n) => {
    if (n < 24) return Buffer.from([(mt << 5) | n]);
    if (n < 256) return Buffer.from([(mt << 5) | 24, n]);
    if (n < 65536) { const b = Buffer.alloc(3); b[0] = (mt << 5) | 25; b.writeUInt16BE(n, 1); return b; }
    const b = Buffer.alloc(5); b[0] = (mt << 5) | 26; b.writeUInt32BE(n, 1); return b;
  };
  if (typeof v === 'number') return v >= 0 ? head(0, v) : head(1, -1 - v);
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) return Buffer.concat([head(2, v.length), Buffer.from(v)]);
  if (typeof v === 'string') { const b = Buffer.from(v); return Buffer.concat([head(3, b.length), b]); }
  if (Array.isArray(v)) return Buffer.concat([head(4, v.length), ...v.map(cborEncode)]);
  if (v instanceof Map) return Buffer.concat([head(5, v.size), ...[...v].flatMap(([k, x]) => [cborEncode(k), cborEncode(x)])]);
  if (v && typeof v === 'object') return cborEncode(new Map(Object.entries(v)));
  if (v === true) return Buffer.from([0xf5]);
  if (v === false) return Buffer.from([0xf4]);
  return Buffer.from([0xf6]);
}

// ---- COSE_Key -> a node KeyObject and its alg
export function coseToKey(cose) {
  if (!(cose instanceof Map)) throw new Error('key: not a COSE map');
  const kty = cose.get(1), alg = cose.get(3);
  if (kty === 2 && alg === ALG.ES256) {
    const crv = cose.get(-1), x = cose.get(-2), y = cose.get(-3);
    if (crv !== 1 || !Buffer.isBuffer(x) || !Buffer.isBuffer(y) || x.length !== 32 || y.length !== 32) throw new Error('key: bad P-256 key');
    return { alg, key: createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: x.toString('base64url'), y: y.toString('base64url') }, format: 'jwk' }) };
  }
  if (kty === 3 && alg === ALG.RS256) {
    const n = cose.get(-1), e = cose.get(-2);
    if (!Buffer.isBuffer(n) || !Buffer.isBuffer(e) || n.length < 256) throw new Error('key: bad RSA key (2048 bits or more)');
    return { alg, key: createPublicKey({ key: { kty: 'RSA', n: n.toString('base64url'), e: e.toString('base64url') }, format: 'jwk' }) };
  }
  throw new Error('key: only ES256 and RS256 passkeys are supported');
}

// authenticator data: rpIdHash(32) flags(1) signCount(4) [aaguid(16) credIdLen(2) credId COSE_Key] [extensions]
export function parseAuthData(ad) {
  if (!Buffer.isBuffer(ad) || ad.length < 37) throw new Error('authData: too short');
  const out = { rpIdHash: ad.subarray(0, 32), flags: ad[32], count: ad.readUInt32BE(33) };
  if (out.flags & FLAG_AT) {
    if (ad.length < 55) throw new Error('authData: no credential');
    const n = ad.readUInt16BE(53);
    if (n < 16 || n > 1023 || ad.length < 55 + n) throw new Error('authData: bad credential id');
    out.credId = ad.subarray(55, 55 + n);
    const [cose] = cborDecode(ad, 55 + n);
    out.cose = cose;
  }
  return out;
}

function checkClient(clientDataB64, type, challenge, origins) {
  const raw = fromB64u(clientDataB64);
  let c;
  try { c = JSON.parse(raw.toString('utf8')); } catch { throw new Error('clientData: not JSON'); }
  if (!c || c.type !== type) throw new Error('clientData: wrong type');
  if (typeof c.challenge !== 'string' || !safeEqual(c.challenge.replace(/=+$/, ''), challenge)) throw new Error('clientData: wrong challenge');
  if (typeof c.origin !== 'string' || !origins.includes(c.origin)) throw new Error('clientData: origin not allowed');
  if (c.crossOrigin === true) throw new Error('clientData: cross-origin');
  return { raw, origin: c.origin };
}
function checkRp(auth, rpId, requireUV) {
  if (!auth.rpIdHash.equals(sha256(Buffer.from(rpId)))) throw new Error('authData: wrong rpId');
  if (!(auth.flags & FLAG_UP)) throw new Error('authData: user not present');
  if (requireUV && !(auth.flags & FLAG_UV)) throw new Error('authData: user not verified');
}

// A new passkey (navigator.credentials.create): -> { id, pub (SPKI, base64url), alg, count, fmt }; throws why not
export function verifyRegistration(body, { challenge, origins, rpId, requireUV = false }) {
  if (!body || typeof body !== 'object' || !body.response) throw new Error('bad request');
  checkClient(body.response.clientDataJSON, 'webauthn.create', challenge, origins);
  let att;
  try { [att] = cborDecode(fromB64u(body.response.attestationObject)); } catch (e) { throw new Error('attestation: ' + e.message); }
  if (!(att instanceof Map) || !Buffer.isBuffer(att.get('authData'))) throw new Error('attestation: no authData');
  const fmt = att.get('fmt');
  if (typeof fmt !== 'string') throw new Error('attestation: no format');
  if (fmt === 'none' && att.get('attStmt') instanceof Map && att.get('attStmt').size) throw new Error('attestation: none with a statement');
  const auth = parseAuthData(att.get('authData'));
  checkRp(auth, rpId, requireUV);
  if (!auth.credId || !auth.cose) throw new Error('authData: no credential');
  const id = auth.credId.toString('base64url');
  if (typeof body.id !== 'string' || body.id.replace(/=+$/, '') !== id) throw new Error('credential id mismatch');
  const { alg, key } = coseToKey(auth.cose);
  return { id, pub: key.export({ type: 'spki', format: 'der' }).toString('base64url'), alg, count: auth.count, fmt };
}

// A sign-in (navigator.credentials.get) with a known passkey: -> { count } (the new sign counter); throws why not
export function verifyAssertion(body, cred, { challenge, origins, rpId, requireUV = false, userHandle = null }) {
  if (!body || typeof body !== 'object' || !body.response) throw new Error('bad request');
  const { raw } = checkClient(body.response.clientDataJSON, 'webauthn.get', challenge, origins);
  const ad = fromB64u(body.response.authenticatorData);
  const auth = parseAuthData(ad);
  checkRp(auth, rpId, requireUV);
  if (userHandle && body.response.userHandle && fromB64u(body.response.userHandle).toString('base64url') !== userHandle) throw new Error('user handle mismatch');
  const key = createPublicKey({ key: Buffer.from(cred.pub, 'base64url'), format: 'der', type: 'spki' });
  const data = Buffer.concat([ad, sha256(raw)]);
  const sig = fromB64u(body.response.signature);
  const ok = cred.alg === ALG.ES256 ? cryptoVerify('sha256', data, { key, dsaEncoding: 'der' }, sig)
    : cred.alg === ALG.RS256 ? cryptoVerify('sha256', data, key, sig) : false;
  if (!ok) throw new Error('bad signature');
  // the sign counter: an authenticator that counts must count up (a lower or equal count may be a cloned key); one that
  // doesn't (0 every time, as synced passkeys do) is fine. A backwards count isn't a refusal - it's reported (cloned),
  // and the caller flags it for review rather than locking the key's owner out
  const cloned = (auth.count !== 0 || (cred.count || 0) !== 0) && auth.count <= (cred.count || 0);
  return { count: auth.count, cloned, was: cred.count || 0 };
}

// the challenges handed out: single use, five minutes
export function createChallenges(now = Date.now) {
  const m = new Map();
  const sweep = () => { const t = now(); for (const [k, v] of m) if (v.exp <= t) m.delete(k); };
  return {
    issue(meta) { sweep(); if (m.size > 5000) m.delete(m.keys().next().value); const c = randomBytes(32).toString('base64url'); m.set(c, { ...meta, exp: now() + CHALLENGE_TTL_MS }); return c; },
    // the challenge a response answers, taken (once): read from the client data, checked against what we issued
    take(clientDataB64, kind) {
      sweep();
      let c;
      try { c = JSON.parse(fromB64u(clientDataB64).toString('utf8')).challenge; } catch { return null; }
      if (typeof c !== 'string') return null;
      c = c.replace(/=+$/, '');
      const v = m.get(c);
      if (!v || v.kind !== kind) return null;
      m.delete(c);
      return { challenge: c, ...v };
    },
    get size() { return m.size; },
  };
}
