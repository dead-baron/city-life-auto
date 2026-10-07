// Deterministic math: sin, cos, tan, atan, atan2 and hypot that give the same bits in every JavaScript engine.
//
// Why: the server (Node) and every client build the world from the seed (shared/map.js generateCity) and must end up
// with the same map - the client checks a signature of it on joining, and a client whose map differs thinks it's an
// outdated page and reloads. But Math.sin & co. are "implementation-approximated" in the language spec: V8 (Chrome,
// Node) uses its port of fdlibm, JavaScriptCore (Safari - and every browser on an iPhone or iPad) the system's maths
// library, and they disagree in the last bit for a few percent of arguments - enough to shift a tile or a prop. So
// world generation runs with these instead (withDeterministicMath): plain double arithmetic and Math.sqrt (which the
// IEEE 754 standard pins down exactly), the same in every engine.
//
// They're line-for-line ports of fdlibm 5.3 (Sun Microsystems, 1993: "Permission to use, copy, modify, and distribute
// this software is freely granted, provided that this notice is preserved") as V8 has it (src/base/ieee754.cc), and
// hypot is V8's (builtins/math.tq): so they give exactly what Chrome and Node always gave, and the world comes out as
// it always has. test/dmath.test.js checks them against the engine bit for bit where the engine is V8.
//
//   withDeterministicMath(fn)   runs fn() with Math.sin/cos/tan/atan/atan2/hypot swapped for these, then puts the
//                               engine's back (generation is synchronous, so nothing else runs meanwhile)
//   dsin, dcos, dtan, datan, datan2, dhypot   the functions themselves

// ---- the bits of a double ---------------------------------------------------------------------------------------
const F64 = new Float64Array(1), I32 = new Int32Array(F64.buffer), U32 = new Uint32Array(F64.buffer);
const LE = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1, HI = LE ? 1 : 0, LO = LE ? 0 : 1;
const hiWord = (x) => { F64[0] = x; return I32[HI]; };          // the high 32 bits (sign, exponent, top of the mantissa)
const loWord = (x) => { F64[0] = x; return U32[LO]; };          // the low 32 bits
const fromWords = (h, l) => { I32[HI] = h | 0; U32[LO] = l >>> 0; return F64[0]; };
const withLoWord = (x, l) => { F64[0] = x; U32[LO] = l >>> 0; return F64[0]; };
const scalbn = (x, n) => {   // x * 2^n, exactly (n within the range the reduction below uses)
  while (n > 1000) { x *= fromWords(0x7e700000, 0); n -= 1000; }   // (2^1000)
  while (n < -1000) { x *= fromWords(0x01700000, 0); n += 1000; }  // (2^-1000)
  return x * fromWords((n + 1023) << 20, 0);
};

// ---- argument reduction: x = n * pi/2 + (y0 + y1), |y0 + y1| <= pi/4 ----------------------------------------------
const TWO_OVER_PI = [   // 2/pi in 24-bit pieces
  0xA2F983, 0x6E4E44, 0x1529FC, 0x2757D1, 0xF534DD, 0xC0DB62, 0x95993C, 0x439041, 0xFE5163, 0xABDEBB, 0xC561B7,
  0x246E3A, 0x424DD2, 0xE00649, 0x2EEA09, 0xD1921C, 0xFE1DEB, 0x1CB129, 0xA73EE8, 0x8235F5, 0x2EBB44, 0x84E99C,
  0x7026B4, 0x5F7E41, 0x3991D6, 0x398353, 0x39F49C, 0x845F8B, 0xBDF928, 0x3B1FF8, 0x97FFDE, 0x05980F, 0xEF2F11,
  0x8B5A0A, 0x6D1F6D, 0x367ECF, 0x27CB09, 0xB74F46, 0x3F669E, 0x5FEA2D, 0x7527BA, 0xC7EBE5, 0xF17B3D, 0x0739F7,
  0x8A5292, 0xEA6BFB, 0x5FB11F, 0x8D5D08, 0x560330, 0x46FC7B, 0x6BABF0, 0xCFBC20, 0x9AF436, 0x1DA9E3, 0x91615E,
  0xE61B08, 0x659985, 0x5F14A0, 0x68408D, 0xFFD880, 0x4D7327, 0x310606, 0x1556CA, 0x73A8C9, 0x60E27B, 0xC08C6B,
];
const NPIO2_HW = [   // the high words of n * pi/2, n = 1..32
  0x3FF921FB, 0x400921FB, 0x4012D97C, 0x401921FB, 0x401F6A7A, 0x4022D97C, 0x4025FDBB, 0x402921FB, 0x402C463A,
  0x402F6A7A, 0x4031475C, 0x4032D97C, 0x40346B9C, 0x4035FDBB, 0x40378FDB, 0x403921FB, 0x403AB41B, 0x403C463A,
  0x403DD85A, 0x403F6A7A, 0x40407E4C, 0x4041475C, 0x4042106C, 0x4042D97C, 0x4043A28C, 0x40446B9C, 0x404534AC,
  0x4045FDBB, 0x4046C6CB, 0x40478FDB, 0x404858EB, 0x404921FB,
];
const PIO2 = [   // pi/2 in 24-bit pieces (for the reduction of huge arguments)
  fromWords(0x3FF921FB, 0x40000000), fromWords(0x3E74442D, 0x00000000), fromWords(0x3CF84698, 0x80000000),
  fromWords(0x3B78CC51, 0x60000000), fromWords(0x39F01B83, 0x80000000), fromWords(0x387A2520, 0x40000000),
  fromWords(0x36E38222, 0x80000000), fromWords(0x3569F31D, 0x00000000),
];
const INVPIO2 = fromWords(0x3FE45F30, 0x6DC9C883);   // 2/pi
const PIO2_1 = fromWords(0x3FF921FB, 0x54400000);    // the first 33 bits of pi/2
const PIO2_1T = fromWords(0x3DD0B461, 0x1A626331);   // pi/2 - PIO2_1
const PIO2_2 = fromWords(0x3DD0B461, 0x1A600000);    // the next 33 bits
const PIO2_2T = fromWords(0x3BA3198A, 0x2E037073);   // pi/2 - (PIO2_1 + PIO2_2)
const PIO2_3 = fromWords(0x3BA3198A, 0x2E000000);    // the next 33 bits
const PIO2_3T = fromWords(0x397B839A, 0x252049C1);   // pi/2 - (PIO2_1 + PIO2_2 + PIO2_3)
const TWO24 = 16777216, TWON24 = 5.9604644775390625e-8;

// fdlibm __kernel_rem_pio2 (prec 2: 53 bits + 53 bits of y): huge x, given as 24-bit pieces tx[0..nx-1] * 2^(e0 - 24k)
const KQ = new Float64Array(20), KF = new Float64Array(20), KFQ = new Float64Array(20), KIQ = new Int32Array(20);
function kernelRemPio2(tx, y, e0, nx) {
  const jk = 4, jp = jk, jx = nx - 1, q = KQ, f = KF, fq = KFQ, iq = KIQ;
  let jv = Math.trunc((e0 - 3) / 24); if (jv < 0) jv = 0;
  let q0 = e0 - 24 * (jv + 1);
  let j = jv - jx;
  const m = jx + jk;
  for (let i = 0; i <= m; i++, j++) f[i] = j < 0 ? 0 : TWO_OVER_PI[j];
  for (let i = 0; i <= jk; i++) { let fw = 0; for (let k = 0; k <= jx; k++) fw += tx[k] * f[jx + i - k]; q[i] = fw; }
  let jz = jk, z, n, ih, fw;
  for (;;) {   // (recompute: with more of 2/pi, when the leading bits cancel)
    let i = 0;
    z = q[jz];
    for (j = jz; j > 0; i++, j--) { fw = Math.trunc(TWON24 * z); iq[i] = Math.trunc(z - TWO24 * fw); z = q[j - 1] + fw; }
    z = scalbn(z, q0);
    z -= 8 * Math.floor(z * 0.125);
    n = Math.trunc(z);
    z -= n;
    ih = 0;
    if (q0 > 0) { i = iq[jz - 1] >> (24 - q0); n += i; iq[jz - 1] -= i << (24 - q0); ih = iq[jz - 1] >> (23 - q0); }
    else if (q0 === 0) ih = iq[jz - 1] >> 23;
    else if (z >= 0.5) ih = 2;
    if (ih > 0) {   // q > 0.5
      n += 1;
      let carry = 0;
      for (i = 0; i < jz; i++) {
        j = iq[i];
        if (carry === 0) { if (j !== 0) { carry = 1; iq[i] = 0x1000000 - j; } } else iq[i] = 0xffffff - j;
      }
      if (q0 > 0) { if (q0 === 1) iq[jz - 1] &= 0x7fffff; else if (q0 === 2) iq[jz - 1] &= 0x3fffff; }
      if (ih === 2) { z = 1 - z; if (carry !== 0) z -= scalbn(1, q0); }
    }
    if (z === 0) {
      j = 0;
      for (i = jz - 1; i >= jk; i--) j |= iq[i];
      if (j === 0) {   // need recomputation
        let k = 1;
        while (iq[jk - k] === 0) k++;
        for (i = jz + 1; i <= jz + k; i++) {
          f[jx + i] = TWO_OVER_PI[jv + i];
          fw = 0;
          for (j = 0; j <= jx; j++) fw += tx[j] * f[jx + i - j];
          q[i] = fw;
        }
        jz += k;
        continue;
      }
    }
    break;
  }
  if (z === 0) { jz -= 1; q0 -= 24; while (iq[jz] === 0) { jz--; q0 -= 24; } }
  else {
    z = scalbn(z, -q0);
    if (z >= TWO24) { fw = Math.trunc(TWON24 * z); iq[jz] = Math.trunc(z - TWO24 * fw); jz += 1; q0 += 24; iq[jz] = fw; }
    else iq[jz] = Math.trunc(z);
  }
  fw = scalbn(1, q0);
  for (let i = jz; i >= 0; i--) { q[i] = fw * iq[i]; fw *= TWON24; }
  for (let i = jz; i >= 0; i--) { fw = 0; for (let k = 0; k <= jp && k <= jz - i; k++) fw += PIO2[k] * q[i + k]; fq[jz - i] = fw; }
  fw = 0;
  for (let i = jz; i >= 0; i--) fw += fq[i];
  y[0] = ih === 0 ? fw : -fw;
  fw = fq[0] - fw;
  for (let i = 1; i <= jz; i++) fw += fq[i];
  y[1] = ih === 0 ? fw : -fw;
  return n & 7;
}

// fdlibm __ieee754_rem_pio2: returns n (its low bits: the quadrant), y[0] + y[1] the remainder
const TX = new Float64Array(3);
function remPio2(x, y) {
  const hx = hiWord(x), ix = hx & 0x7fffffff;
  let z, w, t, r, fn, n, i, j;
  if (ix <= 0x3fe921fb) { y[0] = x; y[1] = 0; return 0; }   // |x| <= pi/4: none needed
  if (ix < 0x4002d97c) {   // |x| < 3pi/4: n = +-1
    if (hx > 0) {
      z = x - PIO2_1;
      if (ix !== 0x3ff921fb) { y[0] = z - PIO2_1T; y[1] = (z - y[0]) - PIO2_1T; }
      else { z -= PIO2_2; y[0] = z - PIO2_2T; y[1] = (z - y[0]) - PIO2_2T; }   // (near pi/2: 33+33+53 bits of pi)
      return 1;
    }
    z = x + PIO2_1;
    if (ix !== 0x3ff921fb) { y[0] = z + PIO2_1T; y[1] = (z - y[0]) + PIO2_1T; }
    else { z += PIO2_2; y[0] = z + PIO2_2T; y[1] = (z - y[0]) + PIO2_2T; }
    return -1;
  }
  if (ix <= 0x413921fb) {   // |x| <= 2^19 * pi/2: medium
    t = Math.abs(x);
    n = Math.trunc(t * INVPIO2 + 0.5);
    fn = n;
    r = t - fn * PIO2_1;
    w = fn * PIO2_1T;   // (the first round: good to 85 bits)
    if (n < 32 && ix !== NPIO2_HW[n - 1]) y[0] = r - w;   // (no cancellation)
    else {
      j = ix >> 20;
      y[0] = r - w;
      i = j - ((hiWord(y[0]) >> 20) & 0x7ff);
      if (i > 16) {   // a second iteration: good to 118 bits
        t = r; w = fn * PIO2_2; r = t - w; w = fn * PIO2_2T - ((t - r) - w); y[0] = r - w;
        i = j - ((hiWord(y[0]) >> 20) & 0x7ff);
        if (i > 49) { t = r; w = fn * PIO2_3; r = t - w; w = fn * PIO2_3T - ((t - r) - w); y[0] = r - w; }   // (a third: 151 bits)
      }
    }
    y[1] = (r - y[0]) - w;
    if (hx < 0) { y[0] = -y[0]; y[1] = -y[1]; return -n; }
    return n;
  }
  if (ix >= 0x7ff00000) { y[0] = y[1] = x - x; return 0; }   // inf or NaN
  // huge: z = |x| scaled to [2^23, 2^24), cut into three 24-bit pieces
  const e0 = (ix >> 20) - 1046;
  z = fromWords(ix - (e0 << 20), loWord(x));
  for (i = 0; i < 2; i++) { TX[i] = Math.trunc(z); z = (z - TX[i]) * TWO24; }
  TX[2] = z;
  let nx = 3;
  while (TX[nx - 1] === 0) nx--;
  n = kernelRemPio2(TX, y, e0, nx);
  if (hx < 0) { y[0] = -y[0]; y[1] = -y[1]; return -n; }
  return n;
}

// ---- the kernels on [-pi/4, pi/4] -------------------------------------------------------------------------------
const S1 = fromWords(0xBFC55555, 0x55555549), S2 = fromWords(0x3F811111, 0x1110F8A6), S3 = fromWords(0xBF2A01A0, 0x19C161D5);
const S4 = fromWords(0x3EC71DE3, 0x57B1FE7D), S5 = fromWords(0xBE5AE5E6, 0x8A2B9CEB), S6 = fromWords(0x3DE5D93A, 0x5ACFD57C);
function kSin(x, y, iy) {
  const ix = hiWord(x) & 0x7fffffff;
  if (ix < 0x3e400000 && Math.trunc(x) === 0) return x;   // |x| < 2^-27
  const z = x * x, v = z * x, r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
  if (iy === 0) return x + v * (S1 + z * r);
  return x - ((z * (0.5 * y - v * r) - y) - v * S1);
}
const C1 = fromWords(0x3FA55555, 0x5555554C), C2 = fromWords(0xBF56C16C, 0x16C15177), C3 = fromWords(0x3EFA01A0, 0x19CB1590);
const C4 = fromWords(0xBE927E4F, 0x809C52AD), C5 = fromWords(0x3E21EE9E, 0xBDB4B1C4), C6 = fromWords(0xBDA8FAE9, 0xBE8838D4);
function kCos(x, y) {
  const ix = hiWord(x) & 0x7fffffff;
  if (ix < 0x3e400000 && Math.trunc(x) === 0) return 1;   // |x| < 2^-27
  const z = x * x, r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
  if (ix < 0x3FD33333) return 1 - (0.5 * z - (z * r - x * y));   // |x| < 0.3
  const qx = ix > 0x3fe90000 ? 0.28125 : fromWords(ix - 0x00200000, 0);   // (x/4, or 0.28125 above 0.78125)
  const hz = 0.5 * z - qx, a = 1 - qx;
  return a - (hz - (z * r - x * y));
}
const T = [
  fromWords(0x3FD55555, 0x55555563), fromWords(0x3FC11111, 0x1110FE7A), fromWords(0x3FABA1BA, 0x1BB341FE),
  fromWords(0x3F9664F4, 0x8406D637), fromWords(0x3F8226E3, 0xE96E8493), fromWords(0x3F6D6D22, 0xC9560328),
  fromWords(0x3F57DBC8, 0xFEE08315), fromWords(0x3F4344D8, 0xF2F26501), fromWords(0x3F3026F7, 0x1A8D1068),
  fromWords(0x3F147E88, 0xA03792A6), fromWords(0x3F12B80F, 0x32F0A7E9), fromWords(0xBEF375CB, 0xDB605373),
  fromWords(0x3EFB2A70, 0x74BF7AD4),
];
const PIO4 = fromWords(0x3FE921FB, 0x54442D18), PIO4LO = fromWords(0x3C81A626, 0x33145C07);
function kTan(x, y, iy) {   // iy: 1 tan, -1 -1/tan
  const hx = hiWord(x), ix = hx & 0x7fffffff;
  let z, r, v, w, s;
  if (ix < 0x3e300000 && Math.trunc(x) === 0) {   // |x| < 2^-28
    if (((ix | loWord(x)) | (iy + 1)) === 0) return 1 / Math.abs(x);
    if (iy === 1) return x;
    z = w = x + y; z = withLoWord(z, 0);   // (-1/(x+y), carefully)
    v = y - (z - x);
    let t = -1 / w; const a = t; t = withLoWord(t, 0);
    s = 1 + t * z;
    return t + a * (s + t * v);
  }
  if (ix >= 0x3FE59428) {   // |x| >= 0.6744
    if (hx < 0) { x = -x; y = -y; }
    z = PIO4 - x; w = PIO4LO - y; x = z + w; y = 0;
  }
  z = x * x; w = z * z;
  r = T[1] + w * (T[3] + w * (T[5] + w * (T[7] + w * (T[9] + w * T[11]))));
  v = z * (T[2] + w * (T[4] + w * (T[6] + w * (T[8] + w * (T[10] + w * T[12])))));
  s = z * x;
  r = y + z * (s * (r + v) + y);
  r += T[0] * s;
  w = x + r;
  if (ix >= 0x3FE59428) { v = iy; return (1 - ((hx >> 30) & 2)) * (v - 2 * (x - (w * w / (w + v) - r))); }
  if (iy === 1) return w;
  z = withLoWord(w, 0);   // (-1/(x+r), accurately)
  v = r - (z - x);
  let t = -1 / w; const a = t; t = withLoWord(t, 0);
  s = 1 + t * z;
  return t + a * (s + t * v);
}

// ---- sin, cos, tan ----------------------------------------------------------------------------------------------
const Y = new Float64Array(2);
export function dsin(x) {
  x = +x;
  const ix = hiWord(x) & 0x7fffffff;
  if (ix <= 0x3fe921fb) return kSin(x, 0, 0);
  if (ix >= 0x7ff00000) return x - x;   // NaN
  const n = remPio2(x, Y);
  switch (n & 3) {
    case 0: return kSin(Y[0], Y[1], 1);
    case 1: return kCos(Y[0], Y[1]);
    case 2: return -kSin(Y[0], Y[1], 1);
    default: return -kCos(Y[0], Y[1]);
  }
}
export function dcos(x) {
  x = +x;
  const ix = hiWord(x) & 0x7fffffff;
  if (ix <= 0x3fe921fb) return kCos(x, 0);
  if (ix >= 0x7ff00000) return x - x;
  const n = remPio2(x, Y);
  switch (n & 3) {
    case 0: return kCos(Y[0], Y[1]);
    case 1: return -kSin(Y[0], Y[1], 1);
    case 2: return -kCos(Y[0], Y[1]);
    default: return kSin(Y[0], Y[1], 1);
  }
}
export function dtan(x) {
  x = +x;
  const ix = hiWord(x) & 0x7fffffff;
  if (ix <= 0x3fe921fb) return kTan(x, 0, 1);
  if (ix >= 0x7ff00000) return x - x;
  const n = remPio2(x, Y);
  return kTan(Y[0], Y[1], 1 - ((n & 1) << 1));   // (1: n even, -1: n odd)
}

// ---- atan, atan2 ------------------------------------------------------------------------------------------------
const ATANHI = [fromWords(0x3FDDAC67, 0x0561BB4F), fromWords(0x3FE921FB, 0x54442D18), fromWords(0x3FEF730B, 0xD281F69B), fromWords(0x3FF921FB, 0x54442D18)];
const ATANLO = [fromWords(0x3C7A2B7F, 0x222F65E2), fromWords(0x3C81A626, 0x33145C07), fromWords(0x3C700788, 0x7AF0CBBD), fromWords(0x3C91A626, 0x33145C07)];
const AT = [
  fromWords(0x3FD55555, 0x5555550D), fromWords(0xBFC99999, 0x9998EBC4), fromWords(0x3FC24924, 0x920083FF),
  fromWords(0xBFBC71C6, 0xFE231671), fromWords(0x3FB745CD, 0xC54C206E), fromWords(0xBFB3B0F2, 0xAF749A6D),
  fromWords(0x3FB10D66, 0xA0D03D51), fromWords(0xBFADDE2D, 0x52DEFD9A), fromWords(0x3FA97B4B, 0x24760DEB),
  fromWords(0xBFA2B444, 0x2C6A6C2F), fromWords(0x3F90AD3A, 0xE322DA11),
];
export function datan(x) {
  x = +x;
  const hx = hiWord(x), ix = hx & 0x7fffffff;
  let id;
  if (ix >= 0x44100000) {   // |x| >= 2^66
    if (ix > 0x7ff00000 || (ix === 0x7ff00000 && loWord(x) !== 0)) return x + x;   // NaN
    return hx > 0 ? ATANHI[3] + ATANLO[3] : -ATANHI[3] - ATANLO[3];
  }
  if (ix < 0x3fdc0000) {   // |x| < 0.4375
    if (ix < 0x3e400000) return x;   // |x| < 2^-27
    id = -1;
  } else {
    x = Math.abs(x);
    if (ix < 0x3ff30000) {   // |x| < 1.1875
      if (ix < 0x3fe60000) { id = 0; x = (2 * x - 1) / (2 + x); } else { id = 1; x = (x - 1) / (x + 1); }
    } else if (ix < 0x40038000) { id = 2; x = (x - 1.5) / (1 + 1.5 * x); }   // |x| < 2.4375
    else { id = 3; x = -1 / x; }
  }
  const z = x * x, w = z * z;
  const s1 = z * (AT[0] + w * (AT[2] + w * (AT[4] + w * (AT[6] + w * (AT[8] + w * AT[10])))));
  const s2 = w * (AT[1] + w * (AT[3] + w * (AT[5] + w * (AT[7] + w * AT[9]))));
  if (id < 0) return x - x * (s1 + s2);
  const r = ATANHI[id] - ((x * (s1 + s2) - ATANLO[id]) - x);
  return hx < 0 ? -r : r;
}
const PI_O_4 = fromWords(0x3FE921FB, 0x54442D18), PI_O_2 = fromWords(0x3FF921FB, 0x54442D18);
const PI = fromWords(0x400921FB, 0x54442D18), PI_LO = fromWords(0x3CA1A626, 0x33145C07), TINY = 1e-300;
export function datan2(y, x) {
  y = +y; x = +x;
  if (x !== x || y !== y) return x + y;   // NaN
  const hx = hiWord(x), ix = hx & 0x7fffffff, lx = loWord(x), hy = hiWord(y), iy = hy & 0x7fffffff, ly = loWord(y);
  if (((hx - 0x3ff00000) | lx) === 0) return datan(y);   // x = 1
  let m = ((hy >> 31) & 1) | ((hx >> 30) & 2);   // 2 * sign(x) + sign(y)
  if ((iy | ly) === 0) {   // y = 0
    if (m <= 1) return y;
    return m === 2 ? PI + TINY : -PI - TINY;
  }
  if ((ix | lx) === 0) return hy < 0 ? -PI_O_2 - TINY : PI_O_2 + TINY;   // x = 0
  if (ix === 0x7ff00000) {   // x is +-inf
    if (iy === 0x7ff00000) return [PI_O_4 + TINY, -PI_O_4 - TINY, 3 * PI_O_4 + TINY, -3 * PI_O_4 - TINY][m];
    return [0, -0, PI + TINY, -PI - TINY][m];
  }
  if (iy === 0x7ff00000) return hy < 0 ? -PI_O_2 - TINY : PI_O_2 + TINY;   // y is +-inf
  const k = (iy - ix) >> 20;
  let z;
  if (k > 60) { z = PI_O_2 + 0.5 * PI_LO; m &= 1; }   // |y/x| > 2^60
  else if (hx < 0 && k < -60) z = 0;   // |y|/x < -2^60
  else z = datan(Math.abs(y / x));
  switch (m) {
    case 0: return z;
    case 1: return -z;
    case 2: return PI - (z - PI_LO);
    default: return (z - PI_LO) - PI;
  }
}

// ---- hypot (V8's: scaled to the largest, the squares summed with Kahan's compensation) -----------------------------
const HYP = [];
export function dhypot(...args) {
  const n = args.length;
  if (n === 0) return 0;
  let max = 0, nan = false;
  HYP.length = n;
  for (let i = 0; i < n; i++) {
    const v = +args[i];
    if (v !== v) { nan = true; HYP[i] = 0; } else { const a = Math.abs(v); HYP[i] = a; if (a > max) max = a; }
  }
  if (max === Infinity) return Infinity;
  if (nan) return NaN;
  if (max === 0) return 0;
  let sum = 0, comp = 0;
  for (let i = 0; i < n; i++) {
    const q = HYP[i] / max, summand = q * q - comp, pre = sum + summand;
    comp = (pre - sum) - summand;
    sum = pre;
  }
  return Math.sqrt(sum) * max;
}

// ---- running something with them ---------------------------------------------------------------------------------
const SWAP = { sin: dsin, cos: dcos, tan: dtan, atan: datan, atan2: datan2, hypot: dhypot };
let depth = 0;
const saved = {};
export function withDeterministicMath(fn) {
  if (depth++ === 0) for (const k in SWAP) { saved[k] = Math[k]; Math[k] = SWAP[k]; }
  try { return fn(); } finally { if (--depth === 0) for (const k in SWAP) Math[k] = saved[k]; }
}
