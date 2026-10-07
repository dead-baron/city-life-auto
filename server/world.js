// Authoritative world: entity registry, spatial chunk grid, clock/weather, tick order.
import { CHUNK_PX, CHUNKS_X, CHUNKS_Y, DT, K, DAY_LOOP_S, gameClock } from '../shared/constants.js';
import { createPed, createVehicle, createCrate, createBag, createProjectile } from './entities.js';
import * as players from './systems/players.js';
import * as vehicles from './systems/vehicles.js';
import * as combat from './systems/combat.js';
import * as cargo from './systems/cargo.js';
import * as law from './systems/law.js';
import * as npc from './systems/npc.js';
import * as traffic from './systems/traffic.js';
import * as police from './systems/police.js';
import * as cruiser from './systems/cruiser.js';
import * as events from './systems/events.js';
import * as gangwar from './systems/gangwar.js';
import * as paint from './systems/paint.js';
import * as phone from './systems/phone.js';
import * as ems from './systems/ems.js';
import * as revive from './systems/revive.js';
import * as economy from './systems/economy.js';
import * as jobs from './systems/jobs.js';
import * as env from './systems/environment.js';
import * as homes from './systems/homes.js';
import * as station from './systems/station.js';
import * as interiors from './systems/interiors.js';
import * as dealer from './systems/dealer.js';
import * as gates from './systems/gates.js';
import * as boats from './systems/boats.js';
import * as gang from './systems/gang.js';
import * as races from './systems/races.js';
import * as minigames from './systems/minigames.js';
import * as robbery from './systems/robbery.js';
import * as trains from './systems/trains.js';
import * as rentals from './systems/rentals.js';
import * as spikes from './systems/spikes.js';
import * as pets from './systems/pets.js';
import * as wildlife from './systems/wildlife.js';
import * as unstuck from './systems/unstuck.js';
import * as props from './systems/props.js';
import * as barriers from './systems/barriers.js';
import * as rides from './systems/rides.js';
import * as places from './systems/places.js';
import * as golf from './systems/golf.js';
import * as net from './net.js';

// Fixed system order. Each runs isolated: one failing system never blocks the tick or snapshots.
const SYSTEMS = [
  ['environment', env.update],      // chrono loop + rain
  ['inputs', players.processInputs],// player-controlled peds + vehicle inputs
  ['homes', homes.update],          // going inside your home (hide), step-out protection
  ['rides', rides.update],          // the Ferris wheel, balloon flights: carrying the riders, setting them down
  ['places', places.update],        // things to do at the places: stripping the boneyard's planes for parts
  ['gates', gates.update],          // sliding gates (motor pools, Syndicate compound)
  ['station', station.update],
  ['dealer', dealer.update],        // dealership lot stock      // police motor pool gates + restocking
  ['interiors', interiors.update],  // shop clerks / desk staff in walk-in buildings
  ['npc', npc.update],              // pedestrian AI, gangs, muggers
  ['pets', pets.update],            // lost pets wandering, led home on a collar
  ['wildlife', wildlife.update],    // animals out in the wilds: deer, coyotes, rabbits, the farms' herds
  ['traffic', traffic.update],      // NPC drivers (lane following, lights)
  ['boats', boats.update],          // NPC boaters + harbor police patrol boats
  ['rentals', rentals.update],      // boat hire clocks: warnings, tow-backs, overdue = stolen
  ['trains', trains.update],        // the rail loop: trains, riders, crossings, the mail-car strongbox
  ['police', police.update],        // NPC police dispatch / pursuit
  ['cruiser', cruiser.update],      // player officers' personal cruisers: delivery, loss, tow
  ['gang', gang.update],            // Syndicate membership: Smuggler's Rock guards
  ['gangwar', gangwar.update],      // gangs vs police: provocation + shootouts near turf
  ['paint', paint.update],          // Spray & Go paint shop bays
  ['races', races.update],
  ['minigames', minigames.update],  // soccer pitch, beach volleyball          // jetski / boat races
  ['golf', golf.update],            // Cedar Hills Golf Club: the balls in play
  ['events', events.update],        // world events (snatch-and-grabs, drops) for blips + arrows
  ['phone', phone.update],          // phone job board + police patrol calls
  ['ems', ems.update],              // ambulances + 45s cleanup loop
  ['revive', revive.update],        // holding to revive / finish a downed player, the limp afterwards
  ['vehicles', vehicles.update],    // vehicle physics + collisions + ped hits
  ['spikes', spikes.update],        // police spike strips: shredded tyres
  ['props', props.update],          // smashable street furniture, hydrant geysers, tidy-up
  ['barriers', barriers.update],    // smashed highway barriers: the road crew puts them back
  ['combat', combat.update],        // projectiles, bleeding, regen, stun timers
  ['cargo', cargo.update],          // crates, loot bags
  ['robbery', robbery.update],      // store hold-ups, silent alarms, squad-car response
  ['law', law.update],              // heat decay, search circles, bounties
  ['jobs', jobs.update],            // contraband drops, fishing, jobs
  ['economy', economy.update],      // auto-heal at ER reception
  ['unstuck', unstuck.update],      // unstuck requests: hold still, then a nudge to open ground
  ['players', players.update],      // ghost timers, respawns, prompts, persistence
];

export class World {
  constructor(map, opts = {}) {
    this.map = map;
    this.opts = opts;
    this.entities = new Map();
    this.nextId = 1;
    this.chunks = new Map();
    this.players = new Map();       // pid -> player session (online or ghost)
    this.time = 1;                  // seconds since server start (never 0: timestamps double as flags)
    this.tick = 0;
    this.loopTime = opts.loopStart ?? 60; // seconds into the 20-minute chrono loop
    this.weather = 0;
    this.events = [];               // {x, y, ev} positional events this tick
    this.globalEvents = [];         // broadcast to everyone
    this.npcCount = 0;
    this.trafficCount = 0;
    this.bodies = new Set();
    this.shotLog = [];
    this.sysMs = SYSTEMS.map(() => 0);
    this.netMs = 0;
    this.stats = { tickMs: 0, tickMax: 0, bytesOut: 0, msgsOut: 0, entities: 0 };
    this.rand = opts.rand || Math.random;
    this.dev = !!opts.dev;
    this.npcBudget = opts.npcBudget ?? 700;
    // the build this server runs (version.json; server/build.js) and when it was stamped - null when not
    // tracked (offline practice); players coming back from an older build start fresh (players.join)
    this.build = opts.build || null;
    this.buildAt = opts.buildAt || 0;
    this.freshOnUpdate = opts.freshOnUpdate || 'spawn'; // 'spawn' | 'all' | 'off' (server/config.js)
    env.init(this);
    homes.init(this);
    gates.init(this);
    station.init(this);
    races.init(this);
    minigames.init(this);
    dealer.init(this);
    jobs.init(this);
    trains.init(this);
    barriers.init(this);
  }

  get clock() { return gameClock(this.loopTime); }

  newId() { const id = this.nextId++; if (this.nextId > 0xfffffff0) this.nextId = 1; return id; }

  add(e) { this.entities.set(e.id, e); this.place(e); return e; }
  remove(e) {
    if (!this.entities.has(e.id)) return;
    this.entities.delete(e.id);
    const set = this.chunks.get(e.cy * CHUNKS_X + e.cx);
    if (set) set.delete(e);
    e.removed = true;
  }
  place(e) {
    if (e.hidden) { // inside a home: out of the spatial grid, so nobody can see, hit or query it
      if (e.cx >= 0) { const old = this.chunks.get(e.cy * CHUNKS_X + e.cx); if (old) old.delete(e); }
      e.cx = -1; e.cy = -1;
      return;
    }
    let cx = Math.floor(e.x / CHUNK_PX), cy = Math.floor(e.y / CHUNK_PX);
    if (cx < 0) cx = 0; else if (cx >= CHUNKS_X) cx = CHUNKS_X - 1;
    if (cy < 0) cy = 0; else if (cy >= CHUNKS_Y) cy = CHUNKS_Y - 1;
    if (cx === e.cx && cy === e.cy) return;
    if (e.cx >= 0) { const old = this.chunks.get(e.cy * CHUNKS_X + e.cx); if (old) old.delete(e); }
    e.cx = cx; e.cy = cy;
    const k = cy * CHUNKS_X + cx;
    let set = this.chunks.get(k);
    if (!set) { set = new Set(); this.chunks.set(k, set); }
    set.add(e);
  }
  *inChunks(cx0, cy0, cx1, cy1) {
    for (let cy = Math.max(0, cy0); cy <= Math.min(CHUNKS_Y - 1, cy1); cy++)
      for (let cx = Math.max(0, cx0); cx <= Math.min(CHUNKS_X - 1, cx1); cx++) {
        const set = this.chunks.get(cy * CHUNKS_X + cx);
        if (set) yield* set;
      }
  }
  // All entities within radius r of (x,y), optionally filtered by kind.
  query(x, y, r, kind = 0) {
    const out = [];
    const cx0 = Math.floor((x - r) / CHUNK_PX), cx1 = Math.floor((x + r) / CHUNK_PX);
    const cy0 = Math.floor((y - r) / CHUNK_PX), cy1 = Math.floor((y + r) / CHUNK_PX);
    const r2 = r * r;
    for (const e of this.inChunks(cx0, cy0, cx1, cy1)) {
      if (kind && e.kind !== kind) continue;
      const dx = e.x - x, dy = e.y - y;
      if (dx * dx + dy * dy <= r2) out.push(e);
    }
    return out;
  }
  nearestPlayerDist2(x, y) {
    let best = Infinity;
    for (const p of this.players.values()) {
      if (!p.ped) continue;
      const d = (p.ped.x - x) ** 2 + (p.ped.y - y) ** 2;
      if (d < best) best = d;
    }
    return best;
  }

  // ---- factories ----
  spawnPed(x, y, opts) { return this.add(createPed(this.newId(), x, y, opts)); }
  spawnVehicle(model, x, y, a, opts) { return this.add(createVehicle(this.newId(), model, x, y, a, opts)); }
  spawnCrate(tier, x, y, opts = {}) { return this.add(createCrate(this.newId(), tier, x, y, { ...opts, now: this.time })); }
  spawnBag(x, y, contents, ownerName) { return this.add(createBag(this.newId(), x, y, contents, this.time, ownerName)); }
  spawnProjectile(owner, x, y, a, speed, maxDist, weapon) { return this.add(createProjectile(this.newId(), owner, x, y, a, speed, maxDist, weapon)); }

  get(id) { return id ? this.entities.get(id) || null : null; }

  emit(x, y, ev) {
    this.events.push({ x, y, ev });
    // a big splash of blood leaves a pool people can tread in (combat.js: bloody footprints)
    if (ev.e === 'blood' && (ev.n || 0) >= 6) {
      (this.bloodPools ||= []).push({ x: ev.x, y: ev.y, t: this.time });
      if (this.bloodPools.length > 120) this.bloodPools.shift();
    }
  }
  broadcast(ev) { this.globalEvents.push(ev); }
  notify(player, text, tone = 'info') { if (player && player.conn) player.toasts.push({ text, tone }); }

  profile() {
    const out = { net: +this.netMs.toFixed(2) };
    SYSTEMS.forEach(([n], i) => { out[n] = +this.sysMs[i].toFixed(2); });
    return out;
  }

  reportError(name, e) {
    this.errorCounts ??= new Map();
    const n = (this.errorCounts.get(name) || 0) + 1;
    this.errorCounts.set(name, n);
    if (n <= 5 || n % 500 === 0) console.error(`[tick] ${name} system error (#${n}):`, e);
    if (this.opts.throwErrors) throw e;
  }

  step() {
    const t0 = performance.now();
    this.tick++;
    this.time += DT;
    if (!this.clockHold) this.loopTime = (this.loopTime + DT) % DAY_LOOP_S; // (dev: the clock can be frozen)

    const systems = SYSTEMS;
    for (let i = 0; i < systems.length; i++) {
      const t = performance.now();
      try { systems[i][1](this, DT); } catch (e) { this.reportError(systems[i][0], e); }
      this.sysMs[i] = this.sysMs[i] * 0.98 + (performance.now() - t) * 0.02;
    }

    for (const e of this.entities.values()) this.place(e);
    const tn = performance.now();
    try { net.send(this); } catch (e) { this.reportError('net', e); }
    this.netMs = this.netMs * 0.98 + (performance.now() - tn) * 0.02;
    this.events.length = 0;
    this.globalEvents.length = 0;

    const ms = performance.now() - t0;
    this.stats.tickMs = this.stats.tickMs * 0.95 + ms * 0.05;
    if (ms > this.stats.tickMax) this.stats.tickMax = ms;
    this.stats.entities = this.entities.size;
  }
}
