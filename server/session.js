import * as revive from './systems/revive.js';
import * as stash from './systems/stash.js';
// One connected client: handshake, input decoding and message routing. Shared by the
// Node WebSocket server and the in-browser offline practice worker.
import { decodeInput, MSG_INPUT } from '../shared/protocol.js';
import * as perf from './perfreports.js';
import * as players from './systems/players.js';
import { mapSignature } from '../shared/map.js';
import * as unstuck from './systems/unstuck.js';
import * as combat from './systems/combat.js';
import * as economy from './systems/economy.js';
import * as cargo from './systems/cargo.js';
import * as arms from './systems/arms.js';
import { store } from './store.js';
import * as dev from './dev.js';
import * as cruiser from './systems/cruiser.js';
import * as phone from './systems/phone.js';
import * as paint from './systems/paint.js';
import * as station from './systems/station.js';
import * as custody from './systems/custody.js';
import * as gates from './systems/gates.js';
import * as nightclubs from './systems/nightclubs.js';
import * as foraging from './systems/foraging.js';
import * as campfires from './systems/campfires.js';
import * as chess from './systems/chess.js';
import * as poolmatch from './systems/poolmatch.js';
import * as hockeymatch from './systems/hockeymatch.js';
import * as trains from './systems/trains.js';
import * as rides from './systems/rides.js';
import * as felling from './systems/felling.js';
import * as lights from './systems/lights.js';
import { brokenList } from './systems/props.js';
import { brokenBarrierList } from './systems/barriers.js';
import { setView } from './view.js';
const AWAY_QUIET_MS = 120000;   // (= ws.js AWAY_QUIET_MS - not imported: the practice worker loads this file)
import * as devmode from './devmode.js';
import * as looks from './systems/looks.js';
import * as arcade from './systems/arcade.js';
import * as music from './systems/music.js';
import * as racebook from './systems/racebook.js';
import * as safety from './systems/safety.js';
import * as cinefollow from './systems/cinefollow.js';
import * as logoff from './systems/logoff.js';
import * as ftue from './systems/ftue.js';
import * as jobcenter from './systems/jobcenter.js';

// opts: { seed, dev, maxPlayers, label, login(token) -> { profile, token } }
// opts.hooks (server/launch.js, the online server only): the launch foundation - accounts, chat, roles, anti-cheat,
// analytics. Offline practice has none and plays as before.
const TEXT_MAX = 8192, PERF_MAX = 16384;   // a text message's size cap (a perf report is the biggest a page sends)
const FLOOD_CLOSE_S = 5;                   // this many seconds in a row over the flood guard and the socket is closed
export function createSession(world, conn, opts) {
  let player = null, waiting = false;   // (waiting: in the line at the door - server/line.js)
  let msgBudget = 0, budgetAt = Date.now(), floodS = 0, myToken = null;
  const hooks = opts.hooks || null;
  const api = {
    onMessage(data, isBinary) {
      const t = Date.now();
      if (t - budgetAt > 1000) { if (msgBudget > 120) { if (++floodS >= FLOOD_CLOSE_S) { conn.close(4008, 'flood'); return; } } else floodS = 0; budgetAt = t; msgBudget = 0; }
      if (++msgBudget > 120) return; // flood guard
      if (!isBinary && typeof data === 'string' && data.length > PERF_MAX) return;   // (too big for anything a page sends)
      if (isBinary) {
        // (the input: 13 bytes, the action bits 32 wide - protocol.js; a page from before that sends 11, read with the high
        // word 0, and a server from before reads the first 11 of the new form: they meet for the minutes after a deploy.
        // A snapshot's prevBits stays 16 bits: only the low word reaches the prediction)
        if (!player || data.byteLength < 11) return;
        const dv = ArrayBuffer.isView(data) ? new DataView(data.buffer, data.byteOffset, data.byteLength) : new DataView(data);
        if (hooks && !hooks.input(player)) return;
        if (dv.getUint8(0) === MSG_INPUT) players.queueInput(player, decodeInput(dv));
        return;
      }
      let msg;
      // (no key that changes how a value turns into text: an object with its own toString / valueOf threw wherever the
      // server did String() on it - the security audit, 11-19)
      try { msg = JSON.parse(data, (k, v) => (k === 'toString' || k === 'valueOf' || k === '__proto__' || k === 'constructor' ? undefined : v)); } catch { return; }
      if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return;
      if (data.length > TEXT_MAX && msg.t !== 'perf') return;
      if (msg.t === 'hello') {
        if (player || waiting) return;
        const closed = opts.closedReason && opts.closedReason();
        if (closed) { conn.sendJSON({ t: 'kicked', reason: closed }); conn.close(4003, 'quota'); return; }
        // a full city: the line at the door (server/line.js - its turn comes: the same hello, let in); without one (offline
        // practice, the tests), turned away as before
        if (opts.line) {
          const r = opts.line.arrive(conn, msg.token, () => { waiting = false; if (conn.open) api.hello(msg); });
          if (r !== 'in') { waiting = r === 'queued'; return; }
        } else {
          const online = [...world.players.values()].filter((p) => p.conn).length;
          if (online >= opts.maxPlayers) { conn.sendJSON({ t: 'full', max: opts.maxPlayers }); conn.close(4001, 'full'); return; }
        }
        api.hello(msg);
        return;
      }
      if (!player) return;
      if (hooks && !hooks.allow(player, msg.t)) return;   // (faster than its kind may come: dropped - server/anticheat.js)
      // what a change to someone's money happens under (server/moneywatch.js): the message, a shop's kind for a menu pick
      if (hooks) {
        const poi = msg.t === 'menu' ? world.map.pois[Number(msg.poi)] : null;
        world.curMsg = msg.t === 'menu' ? `shop:${(poi && poi.kind) || 'menu'}` : msg.t === 'dev' ? 'dev' : `msg:${String(msg.t).slice(0, 16)}`;
        world.curOpt = msg.t === 'menu' ? String(msg.opt || '').slice(0, 30) : null;
      }
      try { api.route(msg); } finally { world.curMsg = null; world.curOpt = null; }
    },
    // in: the account signed in, the character into the city
    hello(msg) {
      if (player) return;
      const res = opts.login(msg.token, msg);
      if (res.refused) { conn.sendJSON(res.refused === 'agegate' ? { t: 'agegate', age: 13 } : { t: 'kicked', reason: res.refused, code: res.code, until: res.until }); conn.close(res.code || 4003, 'refused'); return; }
      const { profile, token } = res;
      myToken = token;
      // build / built: the build this server runs - a page on an older one reloads into it (client/update.js)
      conn.sendJSON({ t: 'welcome', token, pid: profile.pid, name: profile.name, seed: opts.seed, world: opts.world, sig: mapSignature(world.map), tick: world.tick, day: world.day, dev: opts.dev, practice: !!opts.practice, server: opts.label, build: world.build || undefined, built: world.buildAt || undefined, broken: brokenList(world), barriers: brokenBarrierList(world), bays: paint.closedBays(world), gates: gates.gatesOpen(world), clubs: nightclubs.liveList(world), forage: foraging.goneList(world), fires: campfires.fireList(world), felled: felling.felledList(world), logs: felling.logList(world), glights: lights.groundList(world), xing: trains.crossingStates(world), tt: trains.timetable(world), rides: rides.active(world) });
      player = players.join(world, conn, profile, { clientBuild: typeof msg.cb === 'string' ? msg.cb.slice(0, 40) : null, clientBuiltAt: Number(msg.cbt) || 0 });
      // the safe exit's end of this session (logoff.js finish): its leaving as any leaving (the launch hooks), and nothing
      // more from this connection reaches the character (the socket closes right after)
      const me = player;
      me.endSession = () => { if (player !== me) return; player = null; if (hooks) hooks.leave(me); };
      // where the character starts (a fresh start after an update, a first visit: a hospital or their home): the page's
      // city worker picks its first window of World v3 round it, not round where the page guessed (client/worldgen.js)
      if (player.ped && Number.isFinite(player.ped.x)) conn.sendJSON({ t: 'spawnat', x: Math.round(player.ped.x), y: Math.round(player.ped.y) });
      conn.sendJSON(looks.stateMsg(player));   // your look, whether you've picked one yet, your saved looks (client/creator.js)
      if (hooks) hooks.join(player, { dm: typeof msg.dm === 'string' ? msg.dm.slice(0, 64) : null, age17: !!msg.age17, ip: conn.remoteAddress || null, tz: typeof msg.tz === 'string' ? msg.tz.slice(0, 48) : null, dk: typeof msg.dk === 'string' ? msg.dk.slice(0, 12) : null }, res);   // (ip: only for the country, server/geo.js - not kept)
    },
    route(msg) {
      if (hooks) {
        const r = hooks.message(player, msg);
        if (r !== undefined) { if (r) conn.sendJSON(r); return; }
      }
      if (msg.t !== 'ping' && msg.t !== 'away' && msg.t !== 'view' && msg.t !== 'perf' && msg.t !== 'cerr' && msg.t !== 'diag' && !(msg.t === 'cine' && msg.tour)) players.stillHere(player);   // (anything they did: not idle)
      // the cinematic mode (client/director.js): its camera flown, its panel used - here (above); its tour gliding on by
      // itself - like riding a train, the idle clock runs slow (players.js riding)
      if (msg.t === 'cine') { if (msg.tour) player.cineTourMs = Date.now(); if (msg.f !== undefined) cinefollow.request(world, player, msg, !!(opts.dev || player.devMode)); return; }   // (f: its follow scenes - systems/cinefollow.js)
      if (msg.t === 'view') { setView(player, msg.hw, msg.hh); return; } // how much world the screen shows
      if (msg.t === 'ping') { conn.sendJSON({ t: 'pong', ts: msg.ts }); return; }
      if (msg.t === 'away') { players.setAway(world, player, !!msg.on); conn.quietMs = msg.on ? AWAY_QUIET_MS : 0; return; }   // (and its socket may stay silent longer: ws.js)   // (the page in the background, or back)
      // a client noticing something wrong on its side (it built a different map from the same build): logged, once a connection
      if (msg.t === 'diag') { if (!conn.diagSaid && typeof msg.what === 'string') { conn.diagSaid = true; console.warn(`[diag] ${player.name}: ${msg.what.slice(0, 300)}`); } return; }
      // how this device loaded and runs the game (once a connection: server/perfreports.js, listed at /perf)
      if (msg.t === 'perf') {   // (one report a connection, and one more four minutes into play: main.js perfReport)
        const play = !!(msg.r && msg.r.stage === 'play'), said = play ? 'perfPlaySaid' : 'perfSaid';
        if (!conn[said] && !opts.practice) { conn[said] = true; const c = perf.addReport(world, msg.r); if (hooks && c) hooks.perf(c, player); }
        return;
      }
      if (msg.t === 'cerr') { if (perf.addClientError(world, conn, msg) && hooks) hooks.error(player, msg.where); return; }   // (an error in the page: /clienterrors)
      if (msg.t === 'menu') { economy.handleMenu(world, player, Number(msg.poi), String(msg.opt || '')); return; }
      if (msg.t === 'weapon' && player.ped && !player.ped.dead) { combat.selectWeapon(world, player.ped, String(msg.id)); return; }
      // the bag: use an item, or put one in a quick-wheel slot (null clears it)
      if (msg.t === 'inv' && msg.a === 'use' && typeof msg.id === 'string') { economy.useItem(world, player, msg.id); return; }
      if (msg.t === 'inv' && msg.a === 'slot' && Number.isInteger(msg.i)) { economy.setQuick(player, msg.i, typeof msg.id === 'string' ? msg.id : null); return; }
      if (msg.t === 'inv' && msg.a === 'drop' && typeof msg.id === 'string') { const err = cargo.dropItem(world, player, msg.id.slice(0, 40), msg.n, !!msg.w); if (err) world.notify(player, err, 'warn'); store.touch(); return; }   // (the bag's Drop: into a bag at your feet)
      if (msg.t === 'inv' && msg.a === 'give' && typeof msg.id === 'string') { const err = arms.handTo(world, player, msg.id.slice(0, 40)); if (err) world.notify(player, err, 'warn'); return; }   // (the bag's Give: a weapon to a crewmate close by - arms.js)
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
      if (msg.t === 'arcade') { arcade.onScore(world, player, msg); return; }
      if (msg.t === 'hockey' || (msg.t === 'pool' && player.hockey)) { hockeymatch.onMsg(world, player, msg); return; }   // a mallet, the machine, leaving - air hockey against someone (hockeymatch.js)
      if (msg.t === 'pool') { poolmatch.onMsg(world, player, msg); return; }   // a shot, the computer, a frame alone, leaving - a game of pool (poolmatch.js)
      if (msg.t === 'chess') { chess.onMsg(world, player, msg); return; }   // a move, a resignation, a draw at the park's chess table (chess.js)
      if (msg.t === 'mus') { music.onMsg(world, player, msg); return; }   // the rhythm game's hits, an instrument's notes, the radio (music.js)   // a game's score from the cabinet (arcade.js)
      if (msg.t === 'racebook') { conn.sendJSON(racebook.screen(world, player)); return; }   // the race book's screen asking where the race is (racebook.js)
      if (msg.t === 'interior' && player.ped && player.ped.interior) { station.openInterior(world, player); return; }
      if (msg.t === 'bail') { const err = custody.payBail(world, player); if (err) world.notify(player, err, 'warn'); return; }
      if (msg.t === 'unstuck') { unstuck.request(world, player); return; }
      if (msg.t === 'logoff') { const r = logoff.request(world, player, msg.a); if (r) conn.sendJSON(r); return; }   // the pause menu's LOG OFF: the safe exit (logoff.js)
      if (msg.t === 'surrender') { const err = unstuck.surrender(world, player); if (err) world.notify(player, err, 'warn'); return; }
      if (msg.t === 'cruiser') { const err = cruiser.call(world, player); if (err) world.notify(player, err, 'warn'); return; }
      if (msg.t === 'stash') { stash.handle(world, player, msg); return; }   // (your stash, open in the Inventory: stash.js)
      if (msg.t === 'look') { const r = looks.handle(world, player, msg); if (r) conn.sendJSON(r); return; } // the character creator (and the blade's colour)
      // Start fresh (task #413): this session's own character deleted for good - never anyone else's (no pid is read from
      // the message); the page forgets its token and comes back as a new player
      if (msg.t === 'wipe') {
        const p = player;
        player = null;
        if (hooks) hooks.leave(p);   // (the session's end, as for any leaving: the analytics, the money watcher let go)
        const kept = players.wipeAccount(world, p);
        conn.sendJSON(kept ? { t: 'wiped', keep: myToken } : { t: 'wiped' });   // (keep: the account stays - the page keeps its token)
        conn.close(4005, 'wiped');
        return;
      }
      // Delete account (Settings > Account, pressed twice): this session's own account - never anyone else's - out of the
      // game and kept ACCOUNT.deleteDays for RESTORE, then erased (server/accounts.js markDeleted, launch.js purge)
      if (msg.t === 'delacct' && hooks && hooks.deleteAccount) {
        const p = player, err = hooks.deleteAccount(p);
        if (err) { world.notify(p, err, 'warn'); return; }
        player = null;
        hooks.leave(p);
        players.leaveForGood(world, p);
        conn.sendJSON({ t: 'acctdeleted', until: hooks.deletedUntil(p.pid) });
        conn.close(4017, 'deleted');
        return;
      }
      if (msg.t === 'ad') { jobcenter.onAd(world, player, msg); return; }   // the job computer's rewarded ad: started, watched to its end, done (systems/jobcenter.js - paid only there)
      if (msg.t === 'intro') { ftue.handle(world, player, msg); return; }   // the first-time experience: skip, the arrival played, the Guide's replay and tips (systems/ftue.js)
      if (msg.t === 'safety') { safety.set(player, !!msg.on); return; }   // (Settings: Safety mode - server/systems/safety.js)
      if (msg.t === 'name') { players.rename(world, player, msg.name); return; }   // (Settings: your name - players.js rename)
      if (msg.t === 'plist') { conn.sendJSON(devmode.playerList(world, player)); return; } // who's online (options / map)
      if (msg.t === 'devmode') { if (msg.leave) devmode.exit(world, player); else if (!player.devMode) devmode.tryPassword(world, player, msg.pw); return; }
      // the debug commands: the server's own dev mode, or a player in Dev Debug Mode who may have it (devmode.mayDev: the open
      // mode while it's on, else the admin role - asked again for every command, never taken from the page)
      if (msg.t === 'dev' && (opts.dev || (player.devMode && devmode.mayDev(player)))) {
        if (hooks && !opts.dev) hooks.devCommand(player, String(msg.c || ''), msg);
        dev.command(world, player, String(msg.c || ''), msg);
      }
    },
    onClose() {
      if (waiting) { waiting = false; if (opts.line) opts.line.leave(conn); return; }   // (out of the line: Cancel, the tab closed)
      if (player && player.conn === conn) { const pid = player.pid; if (hooks) hooks.leave(player); players.leave(world, player); if (opts.line) opts.line.left(pid); }
    },
  };
  return api;
}
