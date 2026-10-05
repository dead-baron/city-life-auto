import * as revive from './systems/revive.js';
// One connected client: handshake, input decoding and message routing. Shared by the
// Node WebSocket server and the in-browser offline practice worker.
import { decodeInput, MSG_INPUT } from '../shared/protocol.js';
import * as players from './systems/players.js';
import { mapSignature } from '../shared/map.js';
import * as unstuck from './systems/unstuck.js';
import * as combat from './systems/combat.js';
import * as economy from './systems/economy.js';
import * as dev from './dev.js';
import * as cruiser from './systems/cruiser.js';
import * as phone from './systems/phone.js';
import * as paint from './systems/paint.js';
import * as station from './systems/station.js';
import * as gates from './systems/gates.js';
import * as trains from './systems/trains.js';
import { brokenList } from './systems/props.js';
import { brokenBarrierList } from './systems/barriers.js';
import { setView } from './view.js';
import * as devmode from './devmode.js';

// opts: { seed, dev, maxPlayers, label, login(token) -> { profile, token } }
export function createSession(world, conn, opts) {
  let player = null;
  let msgBudget = 0, budgetAt = Date.now();
  return {
    onMessage(data, isBinary) {
      const t = Date.now();
      if (t - budgetAt > 1000) { budgetAt = t; msgBudget = 0; }
      if (++msgBudget > 120) return; // flood guard
      if (isBinary) {
        if (!player || data.byteLength < 11) return;
        const dv = ArrayBuffer.isView(data) ? new DataView(data.buffer, data.byteOffset, data.byteLength) : new DataView(data);
        if (dv.getUint8(0) === MSG_INPUT) players.queueInput(player, decodeInput(dv));
        return;
      }
      let msg;
      try { msg = JSON.parse(data); } catch { return; }
      if (!msg || typeof msg !== 'object') return;
      if (msg.t === 'hello') {
        if (player) return;
        const closed = opts.closedReason && opts.closedReason();
        if (closed) { conn.sendJSON({ t: 'kicked', reason: closed }); conn.close(4003, 'quota'); return; }
        const online = [...world.players.values()].filter((p) => p.conn).length;
        if (online >= opts.maxPlayers) { conn.sendJSON({ t: 'full', max: opts.maxPlayers }); conn.close(4001, 'full'); return; }
        const { profile, token } = opts.login(msg.token);
        conn.sendJSON({ t: 'welcome', token, pid: profile.pid, name: profile.name, seed: opts.seed, sig: mapSignature(world.map), tick: world.tick, dev: opts.dev, practice: !!opts.practice, server: opts.label, broken: brokenList(world), barriers: brokenBarrierList(world), bays: paint.closedBays(world), gates: gates.gatesOpen(world), xing: trains.crossingStates(world), tt: trains.timetable(world) });
        player = players.join(world, conn, profile);
        return;
      }
      if (!player) return;
      if (msg.t === 'view') { setView(player, msg.hw, msg.hh); return; } // how much world the screen shows
      if (msg.t === 'ping') { conn.sendJSON({ t: 'pong', ts: msg.ts }); return; }
      if (msg.t === 'menu') { economy.handleMenu(world, player, Number(msg.poi), String(msg.opt || '')); return; }
      if (msg.t === 'weapon' && player.ped && !player.ped.dead) { combat.selectWeapon(world, player.ped, String(msg.id)); return; }
      // the bag: use an item, or put one in a quick-wheel slot (null clears it)
      if (msg.t === 'inv' && msg.a === 'use' && typeof msg.id === 'string') { economy.useItem(world, player, msg.id); return; }
      if (msg.t === 'inv' && msg.a === 'slot' && Number.isInteger(msg.i)) { economy.setQuick(player, msg.i, typeof msg.id === 'string' ? msg.id : null); return; }
      // downed: call for help (again: re-alert), give up waiting, the paid ambulance
      if (msg.t === 'down') {
        if (msg.a === 'help') revive.callHelp(world, player);
        else if (msg.a === 'cancel') revive.cancelHelp(world, player);
        else if (msg.a === 'amb') revive.callAmbulance(world, player);
        else if (msg.a === 'ambx') revive.cancelAmbulance(world, player);
        return;
      }
      if (msg.t === 'respawn' && typeof msg.choice === 'string' && msg.choice.length < 20) { player.respawnChoice = msg.choice; player.meDirty = true; return; } // just picks; the normal wake-up timer runs
      if (msg.t === 'phone') { const r = phone.handle(world, player, msg); if (r) conn.sendJSON(r); return; }
      if (msg.t === 'interior' && player.ped && player.ped.interior) { station.openInterior(world, player); return; }
      if (msg.t === 'unstuck') { unstuck.request(world, player); return; }
      if (msg.t === 'surrender') { const err = unstuck.surrender(world, player); if (err) world.notify(player, err, 'warn'); return; }
      if (msg.t === 'cruiser') { const err = cruiser.call(world, player); if (err) world.notify(player, err, 'warn'); return; }
      if (msg.t === 'plist') { conn.sendJSON(devmode.playerList(world, player)); return; } // who's online (options / map)
      if (msg.t === 'devmode') { if (msg.leave) devmode.exit(world, player); else if (!player.devMode) devmode.tryPassword(world, player, msg.pw); return; }
      if (msg.t === 'dev' && (opts.dev || player.devMode)) { dev.command(world, player, String(msg.c || ''), msg); }
    },
    onClose() { if (player && player.conn === conn) players.leave(world, player); },
  };
}
