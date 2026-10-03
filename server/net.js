// Network fan-out with spatial net-culling (GDD §15): each client only receives entities,
// spawn descriptors and events inside its active chunk + the 8 adjacent chunks.
// Each entity is encoded ONCE per tick; per client we copy only records that changed since
// that client's previous snapshot (static entities refresh at 1 Hz).
import { K, CHUNK_PX } from '../shared/constants.js';
import { SnapshotWriter, CTRL, SNAP_ENTITY } from '../shared/protocol.js';
import { WEAPONS } from '../shared/items.js';
import * as players from './systems/players.js';
import * as vehicles from './systems/vehicles.js';

const writer = new SnapshotWriter(1500);
const MAX_BUFFERED = 512 * 1024;
const REFRESH_TICKS = 20;
let recBuf = new Uint8Array(SNAP_ENTITY * 4096);
let recDv = new DataView(recBuf.buffer);

function descriptor(e) {
  switch (e.kind) {
    case K.PED: return { id: e.id, k: K.PED, app: e.app, n: e.player ? e.player.name : '', pl: !!e.player, ar: e.archetype, v: e.appVer || 0 };
    case K.VEH: return { id: e.id, k: K.VEH, m: e.def.i, p: e.paint, vr: e.variant, o: e.ownerName || '', v: e.descVer || 0 };
    case K.CRATE: return { id: e.id, k: K.CRATE, t: e.tier, l: e.label || '', cb: !!e.contraband, val: e.value };
    case K.BAG: return { id: e.id, k: K.BAG, t: e.cashOnly ? 0 : e.tier, val: e.value };
    case K.PROJ: return { id: e.id, k: K.PROJ, w: WEAPONS[e.weapon]?.i ?? 12 };
    default: return null;
  }
}
function descVersion(e) { return e.kind === K.PED ? (e.appVer || 0) : e.kind === K.VEH ? (e.descVer || 0) : 0; }

function fields(world, e) {
  switch (e.kind) {
    case K.PED: return [players.pedFlags(world, e), Math.max(0, e.hp / e.maxHp), e.vehId, WEAPONS[e.weapon]?.i ?? 0];
    case K.VEH: return [vehicles.vehFlags(world, e), Math.max(0, e.hp / e.def.hp), 0, 0];
    case K.CRATE: return [e.state === 'carried' ? 1 : e.state === 'loaded' ? 2 : 0, Math.min(1, e.z / 64), e.parent, e.slot];
    case K.BAG: return [0, 1, 0, e.cashOnly ? 0 : e.tier];
    case K.PROJ: return [0, 1, 0, 0];
    default: return [0, 0, 0, 0];
  }
}

// Encode every entity once; mark entities whose wire record changed this tick.
function encodeAll(world) {
  const need = world.entities.size * SNAP_ENTITY;
  if (need > recBuf.length) { recBuf = new Uint8Array(need * 2); recDv = new DataView(recBuf.buffer); }
  let i = 0;
  for (const e of world.entities.values()) {
    const [flags, hp, parent, extra] = fields(world, e);
    const o = i * SNAP_ENTITY;
    // same byte layout as SnapshotWriter.add
    recDv.setUint32(o, e.id >>> 0, true);
    recDv.setUint8(o + 4, e.kind);
    recDv.setUint16(o + 5, flags & 0xffff, true);
    recDv.setFloat32(o + 7, e.x, true);
    recDv.setFloat32(o + 11, e.y, true);
    const t = ((e.a % 6.283185307179586) + 6.283185307179586) % 6.283185307179586;
    recDv.setUint16(o + 15, Math.round((t / 6.283185307179586) * 65535) & 0xffff, true);
    recDv.setUint8(o + 17, Math.max(0, Math.min(255, Math.round(hp * 255))));
    recDv.setUint32(o + 18, (parent || 0) >>> 0, true);
    recDv.setUint8(o + 22, extra & 0xff);
    // change detection on the quantized record
    const sig = (Math.round(e.x * 4) * 73856093) ^ (Math.round(e.y * 4) * 19349663) ^ (recDv.getUint16(o + 15, true) * 83492791) ^ (flags * 2654435761) ^ (recBuf[o + 17] << 3) ^ ((parent || 0) * 97) ^ (extra << 11);
    if (sig !== e._sig) { e._sig = sig; e._chg = world.tick; }
    e._ri = i;
    i++;
  }
}

export function send(world) {
  encodeAll(world);
  for (const p of world.players.values()) {
    const conn = p.conn;
    if (!conn || !conn.open) continue;
    if (conn.buffered > MAX_BUFFERED) { world.stats.dropped = (world.stats.dropped || 0) + 1; continue; }
    const ped = p.ped;
    const veh = ped && ped.vehId ? world.get(ped.vehId) : null;
    const focus = veh || ped;
    if (!focus) continue;
    const cx = Math.floor(focus.x / CHUNK_PX), cy = Math.floor(focus.y / CHUNK_PX);
    const minX = (cx - 1) * CHUNK_PX, maxX = (cx + 2) * CHUNK_PX, minY = (cy - 1) * CHUNK_PX, maxY = (cy + 2) * CHUNK_PX;
    const tick = world.tick;
    const lastSnap = p.lastSnapTick || 0;
    p.seenMark = (p.seenMark || 0) + 1;
    const mark = p.seenMark;

    const spawns = [];
    let ctrl = CTRL.NONE, ctrlId = 0, self = null, sflags = 0;
    if (ped && !ped.dead) {
      if (veh) { ctrl = ped.seat === 0 ? CTRL.DRIVER : CTRL.PASSENGER; ctrlId = veh.id; self = veh; }
      else {
        ctrl = CTRL.PED; ctrlId = ped.id;
        const mods = players.pedMods(world, ped);
        self = { x: ped.x, y: ped.y, a: ped.a, vx: ped.vx, vy: ped.vy, av: 0, stamina: ped.stamina, rollT: ped.rollT, rdx: ped.rdx, rdy: ped.rdy, speedMul: mods.speedMul };
        sflags = (mods.canMove ? 1 : 0) | (mods.canSprint ? 2 : 0) | (mods.regenMul > 1 ? 4 : 0) | (mods.staminaMax > 100 ? 8 : 0) | (mods.tumble ? 16 : 0);
      }
    } else if (ped) { ctrlId = ped.id; self = { x: ped.x, y: ped.y, a: ped.a, vx: 0, vy: 0 }; }
    writer.begin(tick, p.ack, world.loopTime, world.weather, ctrl, ctrlId, self, sflags, ped ? ped.prevBits : 0);

    const visit = (e) => {
      if (e._mark === mark && e._markP === p) return;
      e._mark = mark; e._markP = p;
      let k = p.known.get(e.id);
      const ver = descVersion(e);
      if (!k || k.v !== ver) {
        const d = descriptor(e);
        if (d) spawns.push(d);
        if (!k) { k = { v: ver, sent: -1e9, seen: mark }; p.known.set(e.id, k); } else k.v = ver;
        k.sent = -1e9;
      }
      k.seen = mark;
      if (e._chg >= lastSnap || tick - k.sent >= REFRESH_TICKS || e === ped || e === veh) {
        writer.addRaw(recBuf, e._ri * SNAP_ENTITY);
        k.sent = tick;
      }
    };
    for (const e of world.inChunks(cx - 1, cy - 1, cx + 1, cy + 1)) visit(e);
    if (ped) visit(ped);
    if (veh) visit(veh);

    const gone = [];
    for (const [id, k] of p.known) if (k.seen !== mark) { gone.push(id); p.known.delete(id); }
    let bytes = 0;
    if (spawns.length) { const s = JSON.stringify({ t: 'sp', e: spawns }); conn.sendText(s); bytes += s.length; }
    if (gone.length) { const s = JSON.stringify({ t: 'ds', ids: gone }); conn.sendText(s); bytes += s.length; }
    const snap = writer.finish();
    conn.sendBinary(snap);
    bytes += snap.byteLength;
    p.lastSnapTick = tick + 1;

    const evs = [];
    for (const ev of world.events) if (ev.x >= minX && ev.x < maxX && ev.y >= minY && ev.y < maxY) evs.push(ev.ev);
    for (const ev of world.globalEvents) evs.push(ev);
    for (const t of p.toasts) evs.push({ e: 'toast', text: t.text, tone: t.tone });
    p.toasts.length = 0;
    if (evs.length) { const s = JSON.stringify({ t: 'ev', l: evs }); conn.sendText(s); bytes += s.length; }

    if ((p.meDirty && tick - p.meTick >= 2) || tick - p.meTick >= 20) {
      p.meDirty = false; p.meTick = tick;
      const s = JSON.stringify(players.buildMe(world, p));
      conn.sendText(s);
      bytes += s.length;
    }
    world.stats.bytesOut += bytes;
  }
}
