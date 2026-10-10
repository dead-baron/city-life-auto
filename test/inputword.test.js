// The input word is 32 bits on the wire (shared/protocol.js): a second 16-bit word after the old 11 bytes, so a page
// and a server of different builds still understand each other in the minutes after a deploy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, fakeConn } from './helpers.js';
import { encodeInput, decodeInput, INPUT_BYTES, MSG_INPUT } from '../shared/protocol.js';
import { IN } from '../shared/input.js';
import { createSession } from '../server/session.js';
import * as players from '../server/systems/players.js';
import { store } from '../server/store.js';

// the 11-byte message every page sent before this build
function oldEncode(seq, bits, mxq, myq, aimq) {
  const dv = new DataView(new ArrayBuffer(11));
  dv.setUint8(0, MSG_INPUT); dv.setUint32(1, seq >>> 0, true); dv.setUint16(5, bits & 0xffff, true);
  dv.setInt8(7, mxq); dv.setInt8(8, myq); dv.setUint16(9, aimq & 0xffff, true);
  return dv.buffer;
}
// how a server of the old build read one (it never looks past byte 10)
const oldDecode = (dv) => ({ seq: dv.getUint32(1, true), bits: dv.getUint16(5, true) });

test('the input carries 32 bits: every IN bit and the high word round-trip', () => {
  const all = Object.values(IN).reduce((a, b) => a | b, 0);
  for (const bits of [0, IN.DANCE, all, 1 << 16, 1 << 23, 0x7fff0000, (0x7fffffff >>> 0), all | (1 << 20)]) {
    const buf = encodeInput(9, bits, 10, -10, 1234);
    assert.equal(buf.byteLength, INPUT_BYTES);
    const d = decodeInput(new DataView(buf));
    assert.equal(d.bits, bits >>> 0, `bits ${bits.toString(16)}`);
    assert.equal(d.seq, 9);
  }
  assert.ok(Object.values(IN).every((b) => b < 2 ** 31), 'no action on the sign bit');
});

test('an old page meets the new server, and a new page an old server', () => {
  // old page -> new server: 11 bytes, the high word reads as nothing
  const d = decodeInput(new DataView(oldEncode(5, IN.FIRE | IN.DANCE, 127, 0, 0)));
  assert.equal(d.bits, IN.FIRE | IN.DANCE); assert.equal(d.mx, 1);
  // new page -> old server: the first 11 bytes are the old message
  const buf = encodeInput(6, IN.BLOCK | (1 << 18), 0, 0, 0);
  const o = oldDecode(new DataView(buf));
  assert.equal(o.seq, 6); assert.equal(o.bits, IN.BLOCK, 'the low word as before; the new bits unseen');
  // through a live session: both forms are queued for the player
  const w = makeWorld();
  const conn = fakeConn();
  const prof = store.create('ab12cd34ef56ab12cd34ef99');
  const s = createSession(w, conn, { seed: 1337, dev: false, maxPlayers: 10, login: () => ({ profile: prof, token: 't' }) });
  s.onMessage(JSON.stringify({ t: 'hello', token: null }), false);
  const p = [...w.players.values()].find((q) => q.profile === prof || q.pid === prof.pid) || [...w.players.values()][0];
  s.onMessage(oldEncode(1, IN.SPRINT, 0, 0, 0), true);
  s.onMessage(Buffer.from(encodeInput(2, IN.SPRINT | (1 << 17), 0, 0, 0)), true);   // (ws hands the server a Buffer)
  const q = p.inputQ.map((i) => i.bits);
  assert.deepEqual(q, [IN.SPRINT, (IN.SPRINT | (1 << 17)) >>> 0]);
});

test('a high bit is pressed and held like any other on the server', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const HI = 1 << 19;
  players.queueInput(p, decodeInput(new DataView(encodeInput(p.ack + 1, HI, 0, 0, 0))));
  w.step();
  assert.ok(p.prevBits & HI, 'held');
  // a backed-up queue keeps a one-shot high-bit press when it's trimmed
  for (let i = 0; i < 12; i++) players.queueInput(p, { seq: p.ack + 1 + i, bits: i === 0 ? HI : 0, mx: 0, my: 0, aim: 0 });
  assert.ok(p.inputQ[0].bits & HI);
});
