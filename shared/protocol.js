// Wire protocol. Hot-path messages (inputs, snapshots) are compact binary; rare
// messages (spawn descriptors, events, menus, personal stats) are JSON text frames.

import { quantizeAngle, dequantizeAngle, dequantizeAxis } from './input.js';

export const MSG_INPUT = 1;
export const MSG_SNAPSHOT = 2;

export const CTRL = { NONE: 0, PED: 1, DRIVER: 2, PASSENGER: 3 };

// ---- Client -> server input (11 bytes) -------------------------------------
export function encodeInput(seq, bits, mxq, myq, aimq) {
  const buf = new ArrayBuffer(11);
  const dv = new DataView(buf);
  dv.setUint8(0, MSG_INPUT);
  dv.setUint32(1, seq >>> 0, true);
  dv.setUint16(5, bits & 0xffff, true);
  dv.setInt8(7, mxq);
  dv.setInt8(8, myq);
  dv.setUint16(9, aimq & 0xffff, true);
  return buf;
}
export function decodeInput(dv) {
  return {
    seq: dv.getUint32(1, true),
    bits: dv.getUint16(5, true),
    mx: dequantizeAxis(dv.getInt8(7)),
    my: dequantizeAxis(dv.getInt8(8)),
    aim: dequantizeAngle(dv.getUint16(9, true)),
  };
}

// ---- Server -> client snapshot ---------------------------------------------
export const SNAP_HEADER = 1 + 4 + 4 + 4 + 1 + 1 + 4 + 11 * 4 + 1 + 2 + 2;
export const SNAP_ENTITY = 4 + 1 + 2 + 4 + 4 + 2 + 1 + 4 + 1;

export class SnapshotWriter {
  constructor(maxEntities = 1500) {
    this.buf = new ArrayBuffer(SNAP_HEADER + SNAP_ENTITY * maxEntities);
    this.dv = new DataView(this.buf);
    this.max = maxEntities;
    this.count = 0;
  }
  begin(tick, ackSeq, loopTime, weather, ctrlKind, ctrlId, self, selfFlags, prevBits) {
    const dv = this.dv;
    dv.setUint8(0, MSG_SNAPSHOT);
    dv.setUint32(1, tick >>> 0, true);
    dv.setUint32(5, ackSeq >>> 0, true);
    dv.setFloat32(9, loopTime, true);
    dv.setUint8(13, weather);
    dv.setUint8(14, ctrlKind);
    dv.setUint32(15, ctrlId >>> 0, true);
    let o = 19;
    const f = self || ZERO_SELF;
    dv.setFloat32(o, f.x, true); o += 4;
    dv.setFloat32(o, f.y, true); o += 4;
    dv.setFloat32(o, f.a, true); o += 4;
    dv.setFloat32(o, f.vx, true); o += 4;
    dv.setFloat32(o, f.vy, true); o += 4;
    dv.setFloat32(o, f.av || 0, true); o += 4;
    dv.setFloat32(o, f.stamina || 0, true); o += 4;
    dv.setFloat32(o, f.rollT || 0, true); o += 4;
    dv.setFloat32(o, f.rdx || 0, true); o += 4;
    dv.setFloat32(o, f.rdy || 0, true); o += 4;
    dv.setFloat32(o, f.speedMul || 1, true); o += 4;
    dv.setUint8(o, selfFlags); o += 1;
    dv.setUint16(o, prevBits & 0xffff, true); o += 2;
    this.countOffset = o;
    this.count = 0;
  }
  add(id, kind, flags, x, y, a, hpPct, parent, extra) {
    if (this.count >= this.max) return;
    const o = SNAP_HEADER + this.count * SNAP_ENTITY;
    const dv = this.dv;
    dv.setUint32(o, id >>> 0, true);
    dv.setUint8(o + 4, kind);
    dv.setUint16(o + 5, flags & 0xffff, true);
    dv.setFloat32(o + 7, x, true);
    dv.setFloat32(o + 11, y, true);
    dv.setUint16(o + 15, quantizeAngle(a), true);
    dv.setUint8(o + 17, Math.max(0, Math.min(255, Math.round(hpPct * 255))));
    dv.setUint32(o + 18, (parent || 0) >>> 0, true);
    dv.setUint8(o + 22, extra & 0xff);
    this.count++;
  }
  // Copy a pre-encoded SNAP_ENTITY-byte record (see server/net.js encodeAll).
  addRaw(srcU8, offset) {
    if (this.count >= this.max) return;
    const o = SNAP_HEADER + this.count * SNAP_ENTITY;
    new Uint8Array(this.buf, o, SNAP_ENTITY).set(srcU8.subarray(offset, offset + SNAP_ENTITY));
    this.count++;
  }
  finish() {
    this.dv.setUint16(this.countOffset, this.count, true);
    return new Uint8Array(this.buf, 0, SNAP_HEADER + this.count * SNAP_ENTITY);
  }
}
const ZERO_SELF = { x: 0, y: 0, a: 0, vx: 0, vy: 0, av: 0, stamina: 0, rollT: 0, rdx: 0, rdy: 0, speedMul: 1 };

export function decodeSnapshot(dv) {
  let o = 19;
  const snap = {
    tick: dv.getUint32(1, true),
    ack: dv.getUint32(5, true),
    loopTime: dv.getFloat32(9, true),
    weather: dv.getUint8(13),
    ctrlKind: dv.getUint8(14),
    ctrlId: dv.getUint32(15, true),
  };
  const self = {};
  for (const k of ['x', 'y', 'a', 'vx', 'vy', 'av', 'stamina', 'rollT', 'rdx', 'rdy', 'speedMul']) { self[k] = dv.getFloat32(o, true); o += 4; }
  snap.self = self;
  snap.selfFlags = dv.getUint8(o); o += 1;
  snap.prevBits = dv.getUint16(o, true); o += 2;
  const count = dv.getUint16(o, true); o += 2;
  const ents = new Array(count);
  for (let i = 0; i < count; i++) {
    const b = SNAP_HEADER + i * SNAP_ENTITY;
    ents[i] = {
      id: dv.getUint32(b, true),
      kind: dv.getUint8(b + 4),
      flags: dv.getUint16(b + 5, true),
      x: dv.getFloat32(b + 7, true),
      y: dv.getFloat32(b + 11, true),
      a: dequantizeAngle(dv.getUint16(b + 15, true)),
      hp: dv.getUint8(b + 17) / 255,
      parent: dv.getUint32(b + 18, true),
      extra: dv.getUint8(b + 22),
    };
  }
  snap.ents = ents;
  return snap;
}
