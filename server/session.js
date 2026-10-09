import * as revive from './systems/revive.js';
// One connected client: handshake, input decoding and message routing. Shared by the
// Node WebSocket server and the in-browser offline practice worker.
import { decodeInput, MSG_INPUT } from '../shared/protocol.js';
import * as perf from './perfreports.js';
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
import * as custody from './systems/custody.js';
import * as gates from './systems/gates.js';
import * as foraging from './systems/foraging.js';
import * as campfires from './systems/campfires.js';
import * as trains from './systems/trains.js';
import * as rides from './systems/rides.js';
import { brokenList } from './systems/props.js';
import { brokenBarrierList } from './systems/barriers.js';
import { setView } from './view.js';
import * as devmode from './devmode.js';
import * as looks from './systems/looks.js';

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
        // build / built: the build this server runs - a page on an older one reloads into it (client/update.js)
        conn.sendJSON({ t: 'welcome', token, pid: profile.pid, name: profile.name, seed: opts.seed, sig: mapSignature(world.map), tick: world.tick, dev: opts.dev, practice: !!opts.practice, server: opts.label, build: world.build || undefined, built: world.buildAt || undefined, broken: brokenList(world), barriers: brokenBarrierList(world), bays: paint.closedBays(world), gates: gates.gatesOpen(world), forage: foraging.goneList(world), fires: campfires.fireList(world), xing: trains.crossingStates(world), tt: trains.timetable(world), rides: rides.active(world) });
        player = players.join(world, conn, profile, { clientBuild: typeof msg.cb === 'string' ? msg.cb.slice(0, 40) : null, clientBuiltAt: Number(msg.cbt) || 0 });
        conn.sendJSON(looks.stateMsg(player));   // your look, whether you've picked one yet, your saved looks (client/creator.js)
        return;
      }
      if (!player) return;
      if (msg.t === 'view') { setView(player, msg.hw, msg.hh); return; } // how much world the screen shows
      if (msg.t === 'ping') { conn.sendJSON({ t: 'pong', ts: msg.ts }); return; }
      // a client noticing something wrong on its side (it built a different map from the same build): logged, once a connection
      if (msg.t === 'diag') { if (!conn.diagSaid && typeof msg.what === 'string') { conn.diagSaid = true; console.warn(`[diag] ${player.name}: ${msg.what.slice(0, 300)}`); } return; }
      // how this device loaded and runs the game (once a connection: server/perfreports.js, listed at /perf)
      if (msg.t === 'perf') {   // (one report a connection, and one more four minutes into play: main.js perfReport)
        const play = !!(msg.r && msg.r.stage === 'play'), said = play ? 'perfPlaySaid' : 'perfSaid';
        if (!conn[said] && !opts.practice) { conn[said] = true; perf.addReport(world, msg.r); }
        return;
      }
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
      if (msg.t === 'bail') { const err = custody.payBail(world, player); if (err) world.notify(player, err, 'warn'); return; }
      if (msg.t === 'unstuck') { unstuck.request(world, player); return; }
      if (msg.t === 'surrender') { const err = unstuck.surrender(world, player); if (err) world.notify(player, err, 'warn'); return; }
      if (msg.t === 'cruiser') { const err = cruiser.call(world, player); if (err) world.notify(player, err, 'warn'); return; }
      if (msg.t === 'look') { const r = looks.handle(world, player, msg); if (r) conn.sendJSON(r); return; } // the character creator
      if (msg.t === 'plist') { conn.sendJSON(devmode.playerList(world, player)); return; } // who's online (options / map)
      if (msg.t === 'devmode') { if (msg.leave) devmode.exit(world, player); else if (!player.devMode) devmode.tryPassword(world, player, msg.pw); return; }
      if (msg.t === 'dev' && (opts.dev || player.devMode)) { dev.command(world, player, String(msg.c || ''), msg); }
    },
    onClose() { if (player && player.conn === conn) players.leave(world, player); },
  };
}
