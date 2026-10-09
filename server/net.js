// Network fan-out with spatial net-culling (GDD §15): each client only receives entities,
// spawn descriptors and events inside its camera view plus a prefetch margin (view.js), so
// things arrive before they scroll on screen. Entities are looked up through the chunk grid.
// Each entity is encoded ONCE per tick; per client we copy only records that changed since
// that client's previous snapshot (static entities refresh at 1 Hz).
import { K, CHUNK_PX } from '../shared/constants.js';
import { SnapshotWriter, CTRL, SNAP_ENTITY } from '../shared/protocol.js';
import { WEAPONS } from '../shared/items.js';
import { isSwimming, WATER_T } from '../shared/map.js';
import * as wildlife from './systems/wildlife.js';
import * as players from './systems/players.js';
import * as vehicles from './systems/vehicles.js';
import { blinkState } from './systems/homes.js';
import { bagWireTier, bagBlinks } from './systems/cargo.js';
import { netRect, NET_KEEP } from './view.js';

const writer = new SnapshotWriter(1500);
const MAX_BUFFERED = 512 * 1024;
const REFRESH_TICKS = 20;
const rect = {};
let recBuf = new Uint8Array(SNAP_ENTITY * 4096);
let recDv = new DataView(recBuf.buffer);

function descriptor(e) {
  switch (e.kind) {
    // fl: a player's flashlight is switched on; st: sitting by a campfire; bt: a bounty on their head (the golden skull:
    // bounties.js); ph: their phone out (1: its menu open: phone.js phoneOut; 2: held up, filming: npc.js spectacle); cf:
    // cuffed (custody.js: hands behind the back); mb: carrying a robbery's takings, the money bag on the back (hotmoney.js). The flags and extra
    // bytes are full; turning any of these on or off bumps appVer, so the descriptor is sent again. A player's look travels as its code alone
    // (app.lk: shared/look.js).
    case K.PED: return { id: e.id, k: K.PED, app: e.app && e.app.lk ? { lk: e.app.lk } : e.app, n: e.player ? e.player.name : '', pl: !!e.player, ar: e.archetype, v: e.appVer || 0, ...(e.flashOn ? { fl: 1 } : null), ...(e.sit ? { st: 1 } : null), ...(e.player && e.player.skull ? { bt: 1 } : null), ...(e.phoneOut ? { ph: e.filming || 1 } : null), ...(e.cuffed ? { cf: 1 } : null), ...(e.moneyBag ? { mb: 1 } : null), ...(e.gt ? { gt: e.gt } : null), ...(e.pp ? { pp: e.pp } : null), ...(e.sitBench ? { sb: 1 } : null), ...(e.holdBars ? { hb: 1 } : null) };
    case K.VEH: return { id: e.id, k: K.VEH, m: e.def.i, p: e.paint, vr: e.variant, tn: e.tint ?? -1, o: e.ownerName || '', v: e.descVer || 0, fs: e.forSale ? e.forSale.price : 0 };
    case K.CRATE: return { id: e.id, k: K.CRATE, t: e.tier, l: e.label || '', cb: !!e.contraband, val: e.value };
    case K.BAG: return { id: e.id, k: K.BAG, t: bagWireTier(e), val: e.value };
    case K.PROJ: return { id: e.id, k: K.PROJ, w: WEAPONS[e.weapon]?.i ?? 12 };
    case K.BALL: return { id: e.id, k: K.BALL, t: e.ballKind === 'hoop' ? 3 : e.ballKind === 'golf' ? 2 : e.ballKind === 'volley' ? 1 : 0 };
    case K.TRAIN: return { id: e.id, k: K.TRAIN, c: e.carType, tr: e.train, n: e.car };
    default: return null;
  }
}
export const _descriptor = (e) => descriptor(e);   // (tests)
function descVersion(e) { return e.kind === K.PED ? (e.appVer || 0) : e.kind === K.VEH ? (e.descVer || 0) : 0; }

function fields(world, e) {
  switch (e.kind) {
    // extra: bits 0-4 weapon, 5-6 blink (1 slow, 2 fast, 3 hidden indoors), bit 7 in the water (incl. under a bridge)
    // parent: the vehicle you're in, or the train car you're riding
    // (an animal: extra bits 0-4 what it's doing - fauna.js APOSE - and bit 7 in the water)
    case K.PED: if (e.wild) return [players.pedFlags(world, e), Math.max(0, e.hp / e.maxHp), 0, (wildlife.poseOf(e) & 31) | (WATER_T[world.map.tileAtPx(e.x, e.y)] === 1 ? 128 : 0)];
      return [players.pedFlags(world, e), Math.max(0, e.hp / e.maxHp), e.vehId || (e.onTrain ? world.trains[e.onTrain.t].cars[e.onTrain.c].id : 0), (e.cuffed ? 0 : WEAPONS[e.weapon]?.i ?? 0) | (e.player ? blinkState(world, e) << 5 : 0) | (!e.vehId && !e.hidden && isSwimming(world.map, e) ? 128 : 0)];
    case K.VEH: return [vehicles.vehFlags(world, e), Math.max(0, e.hp / e.def.hp), 0, 0];
    case K.CRATE: return [e.state === 'carried' ? 1 : e.state === 'loaded' ? 2 : 0, Math.min(1, e.z / 64), e.parent, e.slot];
    case K.BAG: return [bagBlinks(world, e) ? 1 : 0, 1, 0, bagWireTier(e)];   // flags 1: about to vanish (it blinks)
    case K.PROJ: return [0, 1, 0, 0];
    case K.BALL: return [0, 1, 0, Math.max(0, Math.min(255, Math.round(e.z / 2)))]; // extra: height above the ground / 2
    // train car flags: 1 underground, 2 doors open, 4 horn, 8 lights on, 16 strongbox gone (mail car); parent: the car ahead
    case K.TRAIN: return [(e.sub ? 1 : 0) | (e.doors ? 2 : 0) | (e.horn ? 4 : 0) | (e.lit ? 8 : 0) | (e.boxGone ? 16 : 0), 1, e.car ? world.trains[e.train].cars[e.car - 1].id : 0, 0];
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
    const lz = e.kind === K.PED || e.kind === K.VEH || e.kind === K.PROJ ? Math.max(0, Math.min(255, Math.round((e.lz || 0) * 255))) : 0;
    recDv.setUint8(o + 23, lz);
    // change detection on the quantized record
    const sig = (Math.round(e.x * 4) * 73856093) ^ (Math.round(e.y * 4) * 19349663) ^ (recDv.getUint16(o + 15, true) * 83492791) ^ (flags * 2654435761) ^ (recBuf[o + 17] << 3) ^ ((parent || 0) * 97) ^ (extra << 11) ^ (lz << 19);
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
    const r = netRect(world, p, rect);
    const minX = r.x0, maxX = r.x1, minY = r.y0, maxY = r.y1;
    const kx0 = minX - NET_KEEP, kx1 = maxX + NET_KEEP, ky0 = minY - NET_KEEP, ky1 = maxY + NET_KEEP;
    const tick = world.tick;
    const lastSnap = p.lastSnapTick || 0;
    p.seenMark = (p.seenMark || 0) + 1;
    const mark = p.seenMark;

    const spawns = [];
    let ctrl = CTRL.NONE, ctrlId = 0, self = null, sflags = 0;
    if (ped && !ped.dead && ped.onTrain) { ctrl = CTRL.RIDER; ctrlId = ped.id; self = { x: ped.x, y: ped.y, a: ped.a, vx: ped.vx, vy: ped.vy, lz: 0 }; }
    else if (ped && !ped.dead && ped.cuffed && !veh) { ctrl = CTRL.RIDER; ctrlId = ped.id; self = { x: ped.x, y: ped.y, a: ped.a, vx: ped.vx, vy: ped.vy, lz: ped.lz || 0 }; }   // (cuffed: custody.js walks them - no prediction)
    else if (ped && !ped.dead) {
      if (veh) { ctrl = ped.seat === 0 && !veh.scripted && !veh.onDeck ? CTRL.DRIVER : CTRL.PASSENGER; /* easing out of a garage: just watch */ ctrlId = veh.id; self = { x: veh.x, y: veh.y, a: veh.a, vx: veh.vx, vy: veh.vy, av: veh.av, stamina: veh.slip || 0, rollT: veh.spin || 0, rdx: veh.launch || 0, lz: veh.lz || 0 }; sflags = veh.rev ? 32 : 0; } // (a vehicle's slide / burnout / launch state rides in the ped-only slots) // reverse-gear state keeps point-to-drive prediction exact
      else {
        ctrl = CTRL.PED; ctrlId = ped.id;
        const mods = players.pedMods(world, ped);
        self = { x: ped.x, y: ped.y, a: ped.a, vx: ped.vx, vy: ped.vy, av: 0, stamina: ped.stamina, rollT: ped.rollT, rdx: ped.rdx, rdy: ped.rdy, speedMul: mods.speedMul, lz: ped.lz || 0 };
        sflags = (mods.canMove ? 1 : 0) | (mods.canSprint ? 2 : 0) | (mods.regenMul > 1 ? 4 : 0) | (mods.staminaMax > 100 ? 8 : 0) | (mods.tumble ? 16 : 0) | (mods.air ? 32 : 0);
      }
    } else if (ped) { ctrlId = ped.id; self = { x: ped.x, y: ped.y, a: ped.a, vx: 0, vy: 0, lz: ped.lz || 0 }; }
    writer.begin(tick, p.ack, world.loopTime, world.weather, ctrl, ctrlId, self, sflags, ped ? ped.prevBits : 0);

    // the subway is its own level: underground you only see your own train; up top, nothing below
    const myTrain = ped && ped.onTrain ? ped.onTrain.t : -1, mySub = !!(ped && ped.sub);
    const visit = (e, check) => {
      if (e._mark === mark && e._markP === p) return;
      if (check) { // inside the window, or already known and not yet past the keep margin
        const x = e.x, y = e.y;
        if (x < kx0 || x > kx1 || y < ky0 || y > ky1) return;
        if ((x < minX || x > maxX || y < minY || y > maxY) && !p.known.has(e.id)) return;
      }
      if ((e.sub || mySub) && e !== ped) {
        const et = e.kind === K.TRAIN ? e.train : e.onTrain ? e.onTrain.t : -2;
        if (et !== myTrain) return;
      }
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
    for (const e of world.inChunks(Math.floor(kx0 / CHUNK_PX), Math.floor(ky0 / CHUNK_PX), Math.floor(kx1 / CHUNK_PX), Math.floor(ky1 / CHUNK_PX))) visit(e, true);
    if (ped) visit(ped, false);
    if (veh) visit(veh, false);

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
