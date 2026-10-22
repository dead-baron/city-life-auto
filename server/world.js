// Authoritative world: entity registry, spatial chunk grid, clock/weather, tick order.
import { CHUNK_PX, CHUNK_TILES, DT, K, DAY_LOOP_S, gameClock } from '../shared/constants.js';
import { createPed, createVehicle, createCrate, createBag, createProjectile } from './entities.js';
import * as players from './systems/players.js';
import * as vehicles from './systems/vehicles.js';
import * as combat from './systems/combat.js';
import * as cargo from './systems/cargo.js';
import * as law from './systems/law.js';
import * as bounties from './systems/bounties.js';
import * as npc from './systems/npc.js';
import * as traffic from './systems/traffic.js';
import * as transit from './systems/transit.js';
import * as ferries from './systems/ferries.js';
import * as police from './systems/police.js';
import * as custody from './systems/custody.js';
import * as cells from './systems/cells.js';
import * as cruiser from './systems/cruiser.js';
import * as events from './systems/events.js';
import * as gangwar from './systems/gangwar.js';
import * as paint from './systems/paint.js';
import * as phone from './systems/phone.js';
import * as ems from './systems/ems.js';
import * as tow from './systems/tow.js';
import * as revive from './systems/revive.js';
import * as economy from './systems/economy.js';
import * as jobs from './systems/jobs.js';
import * as env from './systems/environment.js';
import * as homes from './systems/homes.js';
import * as station from './systems/station.js';
import * as interiors from './systems/interiors.js';
import * as dealer from './systems/dealer.js';
import * as gates from './systems/gates.js';
import * as nightclubs from './systems/nightclubs.js';
import * as boats from './systems/boats.js';
import * as gang from './systems/gang.js';
import * as races from './systems/races.js';
import * as minigames from './systems/minigames.js';
import * as robbery from './systems/robbery.js';
import * as trains from './systems/trains.js';
import * as rentals from './systems/rentals.js';
import * as spikes from './systems/spikes.js';
import * as pets from './systems/pets.js';
import * as happenings from './systems/happenings.js';
import * as personas from './systems/personas.js';
import * as wildlife from './systems/wildlife.js';
import * as sharks from './systems/sharks.js';
import * as unstuck from './systems/unstuck.js';
import * as props from './systems/props.js';
import * as barriers from './systems/barriers.js';
import * as rides from './systems/rides.js';
import * as foraging from './systems/foraging.js';
import * as hunting from './systems/hunting.js';
import * as campfires from './systems/campfires.js';
import * as lights from './systems/lights.js';
import * as felling from './systems/felling.js';
import * as wanderer from './systems/wanderer.js';
import * as places from './systems/places.js';
import * as underground from './systems/underground.js';
import * as golf from './systems/golf.js';
import * as hoops from './systems/hoops.js';
import * as bikers from './systems/bikers.js';
import * as streetlife from './systems/streetlife.js';
import * as activities from './systems/activities.js';
import * as burning from './systems/burning.js';
import * as tank from './systems/tank.js';
import * as bowling from './systems/bowling.js';
import * as cinema from './systems/cinema.js';
import * as aircraft from './systems/aircraft.js';
import * as skydive from './systems/skydive.js';
import * as grenades from './systems/grenades.js';
import * as sar from './systems/sar.js';
import * as charter from './systems/charter.js';
import * as dusting from './systems/dusting.js';
import * as coastguard from './systems/coastguard.js';
import * as gardening from './systems/gardening.js';
import * as farming from './systems/farming.js';

import * as homeinside from './systems/homeinside.js';
import * as mortgage from './systems/mortgage.js';
import * as mail from './systems/mail.js';

import * as policeair from './systems/policeair.js';
import * as airtraffic from './systems/airtraffic.js';
import * as net from './net.js';
import { warmGround } from './systems/offroad.js';
import * as firefighter from './systems/firefighter.js';
import * as paramedic from './systems/paramedic.js';
import * as taxijob from './systems/taxijob.js';
import * as busjob from './systems/busjob.js';
import * as towjob from './systems/towjob.js';

// Fixed system order. Each runs isolated: one failing system never blocks the tick or snapshots.
const SYSTEMS = [
  ['environment', env.update],      // chrono loop + rain
  ['inputs', players.processInputs],// player-controlled peds + vehicle inputs
  ['homes', homes.update],          // going inside your home (hide), step-out protection
  ['rides', rides.update],          // the Ferris wheel, balloon flights: carrying the riders, setting them down
  ['places', places.update],        // things to do at the places: stripping the boneyard's planes for parts
  ['underground', underground.update], // the sewers and the cave: police who followed you down, bats, the den bear, falling rocks, mining
  ['nightclubs', nightclubs.update], // the clubs open at dusk, wind down after sunrise; dancers, the line, the bouncers (task #432)
  ['gates', gates.update],          // sliding gates (motor pools, Syndicate compound)
  ['station', station.update],
  ['dealer', dealer.update],        // dealership lot stock      // police motor pool gates + restocking
  ['interiors', interiors.update],  // shop clerks / desk staff in walk-in buildings
  ['npc', npc.update],              // pedestrian AI, gangs, muggers
  ['pets', pets.update],            // lost pets wandering, led home on a collar
  ['happenings', happenings.update], // a street fight, someone collapsing, a dropped wallet - now and then near someone
  ['personas', personas.update],    // the street personalities' walked dogs (personas.js)
  ['wildlife', wildlife.update],    // animals out in the wilds: deer, coyotes, rabbits, the farms' herds
  ['sharks', sharks.update],        // a great white now and then where someone's swimming out at sea (sharks.js)
  ['traffic', traffic.update],      // NPC drivers (lane following, lights)
  ['transit', transit.update],      // the bus lines: buses into service round their loops, the doors closing
  ['ferries', ferries.update],      // the island ferries to their timetable, the cars on their decks
  ['boats', boats.update],          // NPC boaters + harbor police patrol boats
  ['rentals', rentals.update],      // boat hire clocks: warnings, tow-backs, overdue = stolen
  ['trains', trains.update],        // the rail loop: trains, riders, crossings, the mail-car strongbox
  ['police', police.update],        // NPC police dispatch / pursuit
  ['custody', custody.update],      // the arrested: held, walked to a car, driven to the station, the cells
  ['cells', cells.update],          // the police stations' cell blocks: nobody hurt there, the doors, NPC inmates
  ['cruiser', cruiser.update],      // player officers' personal cruisers: delivery, loss, tow
  ['gang', gang.update],            // Syndicate membership: Smuggler's Rock guards
  ['gangwar', gangwar.update],      // gangs vs police: provocation + shootouts near turf
  ['bikers', bikers.update],        // the biker clubs at the Rusty Spur: hanging out, riding two by two, chasing (task #366)
  ['paint', paint.update],          // Spray & Go paint shop bays
  ['races', races.update],
  ['minigames', minigames.update],  // soccer pitch, beach volleyball          // jetski / boat races
  ['golf', golf.update],            // the golf course (Lakeside Greens): the balls in play
  ['hoops', hoops.update],          // North Point Courts: shooting hoops
  ['events', events.update],        // world events (snatch-and-grabs, drops) for blips + arrows
  ['phone', phone.update],          // phone job board + police patrol calls
  ['ems', ems.update],              // ambulances + 45s cleanup loop
  ['revive', revive.update],        // holding to revive / finish a downed player, the limp afterwards
  ['vehicles', vehicles.update],    // vehicle physics + collisions + ped hits
  ['tow', tow.update],              // the tow service: trucks for wrecks and cars left blocking a lane; the towed hung behind them
  ['spikes', spikes.update],        // police spike strips: shredded tyres
  ['props', props.update],          // smashable street furniture, hydrant geysers, tidy-up
  ['barriers', barriers.update],    // smashed highway barriers: the road crew puts them back
  ['combat', combat.update],
  ['grenades', grenades.update],    // grenades thrown: their arcs, bounces and fuses (grenades.js)        // projectiles, bleeding, regen, stun timers
  ['cargo', cargo.update],          // crates, loot bags
  ['robbery', robbery.update],      // store hold-ups, silent alarms, squad-car response
  ['law', law.update],              // heat decay, search circles
  ['bounties', bounties.update],    // bounty clocks (while the target is out in the city), refunds, last seen
  ['jobs', jobs.update],            // contraband drops, fishing, jobs
  ['foraging', foraging.update],    // picked mushroom spots and tidepool stars growing back
  ['hunting', hunting.update],      // field-dressing game, cooking over the fire
  ['campfires', campfires.update],  // fires lit and put out, warming up by one
  ['lights', lights.update],        // lights to carry: batteries running down, flares and glow sticks burning out
  ['felling', felling.update],      // cutting trees, the falls, the logs, the stumps growing back
  ['wanderer', wanderer.update],    // the rare hooded stranger who sells the plasma blade
  ['economy', economy.update],      // auto-heal at ER reception
  ['unstuck', unstuck.update],      // unstuck requests: hold still, then a nudge to open ground
  ['players', players.update],      // ghost timers, respawns, prompts, persistence
  ['streetlife', streetlife.update], // street races at night, police chases, armored trucks' runs - now and then near someone
  ['bowling', bowling.update],      // Pinwheel Lanes: the balls rolling, the pins, the turns, the NPC groups
  ['cinema', cinema.update],        // The Grand Theatre: the films in the screens, the audience
  ['activities', activities.update], // people going about their lives: anglers, chess in the park, picnics, a painter (activities.js)
  ['aircraft', aircraft.update],    // helicopters and planes: the parked ones at their pads and stands, mid-air collisions (aircraft.js)
  ['skydive', skydive.update],      // people falling from aircraft: the fall, the parachute, the landing (skydive.js)
  ['burning', burning.update],      // people on fire: burning down, going out, catching it from fire (H58)
  ['tank', tank.update],            // the tanks' turrets turning to their drivers' aim (H58)
  ['sar', sar.update],              // search and rescue pilots' shifts: the calls, the harness, the hand-over (H59)
  ['charter', charter.update],      // charter pilots' bookings: rich customers flown from place to place (H59)
  ['dusting', dusting.update],      // crop dusters' contracts: the farm fields sprayed from the air (dusting.js)
  ['coastguard', coastguard.update], // the coast guard's patrols: smugglers run down and boarded, people pulled out of the water (H59)
  ['gardening', gardening.update],  // the plots in owned homes' yards: growing, drying out, wilting; the plots near each player sent (H61)
  ['farming', farming.update],      // the farms' fields: the rows growing, a tractor down a row ploughing, sowing, harvesting it (H61)
  ['homeinside', homeinside.update], // inside your home: sleeping, the shower, where you are in there to your page (H62)
  ['mortgage', mortgage.update],    // mortgages: a payment each in-game day from the bank, the home taken back after too many missed (H65)
  ['mail', mail.update],            // the mail: the week's utilities bill, letters, coupons (H71)
  ['policeair', policeair.update],  // the police air unit: up from headquarters at a high wanted level, following the suspect overhead (H66)
  ['airtraffic', airtraffic.update], // light planes in and out of the runways and airstrips, the news helicopter over a chase (H66)
  ['firefighter', firefighter.update], // the fires in the grass, the dumpsters, the kitchens; firefighters' calls, the hose (H68)
  ['paramedic', paramedic.update],  // paramedics' calls: treating the hurt on the spot, the badly hurt to a hospital, players down (H68)
  ['taxijob', taxijob.update],      // taxi drivers' fares: hailing, aboard, the meter, the tip (H72)
  ['busjob', busjob.update],        // bus drivers' lines: the stops, the passengers on and off, the timetable (H72)
  ['towjob', towjob.update],        // tow truck drivers' calls: backed up to, hooked, towed to the impound (H72)
];

export class World {
  constructor(map, opts = {}) {
    this.map = map;
    // the net-culling chunks' grid over the world's frame (the map's m.frame: the world the server runs)
    this.chunksX = Math.ceil(map.frame.w / CHUNK_TILES); this.chunksY = Math.ceil(map.frame.h / CHUNK_TILES);
    this.opts = opts;
    this.entities = new Map();
    this.nextId = 1;
    this.chunks = new Map();
    this.players = new Map();       // pid -> player session (online or ghost)
    this.time = 1;                  // seconds since server start (never 0: timestamps double as flags)
    this.tick = 0;
    this.loopTime = opts.loopStart ?? 60; // seconds into the 20-minute chrono loop
    // which turn of the loop it is: the day (06:00 to 06:00). The clients hash the weather that only comes some
    // mornings or nights from it (a misty night, a foggy morning, the sea glowing: client/render/atmos.js), so everyone
    // has the same; they learn it in the welcome and count the turns of the clock themselves. From the wall clock at
    // start, so a restart doesn't begin at day 0 again.
    this.day = opts.day ?? Math.floor(Date.now() / 1000 / DAY_LOOP_S);
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
    // (World v3's frame, over 4 M tiles: the off-road tables made now, not in the tick of the first ambulance that needs
    // them - 0.4-0.6 s there: systems/offroad.js warmGround)
    if (map.w * map.h > 4e6) { warmGround(map); dusting.patchesOf(map); }   // (and the crop patches the crop dusters spray: dusting.js)
  }

  get clock() { return gameClock(this.loopTime); }

  newId() { const id = this.nextId++; if (this.nextId > 0xfffffff0) this.nextId = 1; return id; }

  add(e) { this.entities.set(e.id, e); this.place(e); return e; }
  remove(e) {
    if (!this.entities.has(e.id)) return;
    this.entities.delete(e.id);
    const set = this.chunks.get(e.cy * this.chunksX + e.cx);
    if (set) set.delete(e);
    e.removed = true;
  }
  place(e) {
    if (e.hidden) { // inside a home: out of the spatial grid, so nobody can see, hit or query it
      if (e.cx >= 0) { const old = this.chunks.get(e.cy * this.chunksX + e.cx); if (old) old.delete(e); }
      e.cx = -1; e.cy = -1;
      return;
    }
    let cx = Math.floor(e.x / CHUNK_PX), cy = Math.floor(e.y / CHUNK_PX);
    if (cx < 0) cx = 0; else if (cx >= this.chunksX) cx = this.chunksX - 1;
    if (cy < 0) cy = 0; else if (cy >= this.chunksY) cy = this.chunksY - 1;
    if (cx === e.cx && cy === e.cy) return;
    if (e.cx >= 0) { const old = this.chunks.get(e.cy * this.chunksX + e.cx); if (old) old.delete(e); }
    e.cx = cx; e.cy = cy;
    const k = cy * this.chunksX + cx;
    let set = this.chunks.get(k);
    if (!set) { set = new Set(); this.chunks.set(k, set); }
    set.add(e);
  }
  *inChunks(cx0, cy0, cx1, cy1) {
    // (both ends into the grid: what's out past the world's edge is kept in the edge's chunks - place() - so a look
    // from out there finds it)
    const X = this.chunksX - 1, Y = this.chunksY - 1;
    cx0 = cx0 < 0 ? 0 : cx0 > X ? X : cx0; cx1 = cx1 < 0 ? 0 : cx1 > X ? X : cx1;
    cy0 = cy0 < 0 ? 0 : cy0 > Y ? Y : cy0; cy1 = cy1 < 0 ? 0 : cy1 > Y ? Y : cy1;
    for (let cy = cy0; cy <= cy1; cy++)
      for (let cx = cx0; cx <= cx1; cx++) {
        const set = this.chunks.get(cy * this.chunksX + cx);
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
    if (!this.clockHold) { // (dev: the clock can be frozen)
      this.loopTime += DT;
      if (this.loopTime >= DAY_LOOP_S) { this.loopTime %= DAY_LOOP_S; this.day++; }
    }

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
