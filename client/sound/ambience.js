// The ambience (the owner's notes: "ambience in nature, the rain and the sea"; "a campfire's gentle crackle; now and
// then an owl or crickets at night. Subtle, never repetitive"). Beds of filtered noise - the city's hum, the wind,
// leaves, the sea's swell and the surf, the rain, the subway, a fire's roar - made once from three looping noise
// sources and crossfaded slowly as you move: a few times a second the tiles around the camera are sampled (how
// much water, sand, green, street) with the district, the time of day and the rain. Over them, now and then, a
// creature or the town: birds by day, crickets and an owl at night, gulls by the sea, a dog, a far siren, a horn;
// rain pattering; a fire's crackle near a lit campfire or a burning car. Never on a fixed loop: every gap is random.
// Only the beds you can hear run: a bed's noise source is connected while it's heard (and a source nobody hears is
// stopped), its filters at k-rate - a bed that's off costs the audio thread nothing.
import { T, TILE, VF } from '../../shared/constants.js';
import { TERRAIN_CELL } from '../../shared/worldmask-dims.js';
import { setp, krate } from './engine.js';

const R = Math.random, rr = (a, b) => a + R() * (b - a);
const URBAN = new Set([T.ROAD, T.SIDEWALK, T.PLAZA, T.LOT, T.BUILDING, T.WALL, T.BRIDGE]);
const GREEN = new Set([T.GRASS, T.FIELD, T.DIRT]);
const WILD = { wild: 1, rural: 0.7, desert: 0.9, rocky: 0.8, park: 0.5, water: 0.6 };
const FOREST = 2;   // (the map's terrain class of the woods: shared/map.js decodeTerrain W G F D R S, m.terrainCls)
// the surf's level on the waterline: a crash peaks near the town's and the rain's beds (tools/sound/bench.py beds), not
// 15 dB over them (#397)
export const SURF_LEVEL = 0.32;
// Each bed alone at gain 1, A-weighted (dBA: `python3 tools/sound/bench.py --only beds`, 2026-10-15), and the most each
// one is ever turned up to (levels below; test/ambience.test.js checks the mix never goes past them). The rustle of the
// leaves is as loud at gain 1 as the rain: at 0.35 it peaked over heavy rain (-28.3 dBA) and ran on every patch of grass
// in the country - the "loud nonstop ocean or wind" the owner heard at Willow Valley station (2026-10-15). Now it's
// the woods' own (the map's forest cells round you) and peaks under the city's hum (-32.8 by day): -34.3 in a full gust.
export const BED_DBA = Object.freeze({ city: -25.3, wind: -21.3, leaves: -16.6, sea: -24.3, surf: -28.5, rain: -15, sub: -30.9, fire: -26.6, flow: -19.7, cave: -35 });
export const BED_MAX = Object.freeze({ city: 0.42, wind: 0.4, leaves: 0.13, sea: 0.5, surf: SURF_LEVEL, rain: 0.22, sub: 0.6, fire: 0.35, flow: 0.3, cave: 0.28 });
const LEAVES_LEVEL = BED_MAX.leaves, RIVER_LEVEL = 0.07, LAKE_K = 0.3;   // (a river running by: a quiet babble; a lake laps)
// the falls and the white water (2026-10-21; the owner, 10-16: "stream or waterfall sound in the forest with no visible
// source"): a river's babble was as loud from 24 tiles off as from its bank, any way you looked - heard off the top or
// the bottom of the screen with no water in sight - and a falls made no more noise than a quiet reach. Now the river's
// samples count less the further off they are (none past ROAR.far tiles), and a falls roars: loudest at its foot, gone
// ROAR.falls tiles away (a rapid half as loud, ROAR.rapid tiles) - the flow bed, turned up
const ROAR = { level: 0.2, falls: 22, rapid: 12, rapidK: 0.45, far: 28 };

export class Ambience {
  constructor(E) {
    this.E = E; const c = E.ctx; this.ctx = c;
    this.level = 1;   // (the beds' level against the effects: tools/sound/bench.py)
    const flt = (type, f, q = 0.7) => { const n = krate(c.createBiquadFilter()); n.type = type; n.frequency.value = f; n.Q.value = q; return n; };
    const gain = (v = 0) => { const n = c.createGain(); n.gain.value = v; return n; };
    this.srcs = { white: null, pink: null, brown: null };   // (a looping noise source per colour, while a bed of it is heard)
    this.out = E.mix.ambIn;
    const bed = (color, chain) => {
      const g = gain(0); let last = chain[0];
      for (let i = 1; i < chain.length; i++) { last.connect(chain[i]); last = chain[i]; }
      last.connect(g);
      return { g, chain, color, on: false, quietAt: 0, w: 0 };
    };
    this.pan = c.createStereoPanner ? krate(c.createStereoPanner()) : null; if (this.pan) this.pan.connect(this.out);
    this.beds = {
      city: bed('brown', [flt('lowpass', 420, 0.5)]),
      wind: bed('pink', [flt('bandpass', 600, 0.8)]),
      leaves: bed('pink', [flt('highpass', 1500), flt('bandpass', 3200, 0.4)]),
      sea: bed('brown', [flt('lowpass', 520, 0.5)]),
      // (the surf: the hiss of the wash taken off with a low-pass - #397, it was the loudest thing on the waterline)
      surf: bed('white', [flt('bandpass', 800, 0.35), flt('lowpass', 2200, 0.6), gain(0.2)]),
      // (rain: soft pink noise, not a white hiss - the white one was some 20 dB louder than the city round it: the owner
      // found it overpowering, 2026-10-09)
      rain: bed('pink', [flt('highpass', 450), flt('lowpass', 4200)]),
      sub: bed('brown', [flt('lowpass', 190, 0.8)]),
      fire: bed('brown', [flt('lowpass', 330, 0.6)]),
      // under the ground (F.ug: server/systems/underground.js): the sewer's stream running past, the cave's hollow hush
      flow: bed('pink', [flt('bandpass', 720, 0.7), flt('lowpass', 2400)]),
      cave: bed('brown', [flt('lowpass', 130, 0.9)]),
    };
    this.surfEnv = this.beds.surf.chain[2];   // (the wave crashes: its own envelope, under the shore's level)
    this.windF = this.beds.wind.chain[0];
    this.gust = 0.7; this.swellPh = R() * 6.28;
    this.next = { ugdrip: 0, rat: 0, flap: 0, scan: 0, bird: 0, cricket: 0, owl: rr(20, 60), dog: rr(20, 60), siren: rr(40, 120), horn: rr(8, 30), gull: rr(5, 15), drop: 0, crackle: 0, surf: 0 };
    this.crickets = [[0, 0], [0, 0], [0, 0]];
    this.k = { water: 0, sand: 0, green: 0, urban: 0, shore: 0, wx: 0, wild: 0, woods: 0, river: 0, roar: 0, style: '' };
    this.fires = null;
    this.fire = null;   // the nearest fire (a lit campfire, a burning vehicle): { x, y, d }
    this.roars = null;
  }
  // the map's falls (its nature sites' falls: their foot, as wide as the water) and white water (the rivers' rapids, a
  // point every few tiles along them), found once - px
  whiteWater(map) {
    if (this.roars && this.roars.map === map) return this.roars;
    const falls = [], rapids = [];
    for (const s of (map && map.natureSites) || []) if (s && s.falls && Number.isFinite(s.falls.x)) falls.push({ x: s.falls.x, y: s.falls.y + 8, hw: Math.max(16, (s.falls.w || 64) / 2) });
    for (const c of (map && map.waters && map.waters.ch) || []) {
      if (!c || !Array.isArray(c.r) || !Array.isArray(c.pts)) continue;
      let run = 0;
      for (let j = 1; j < c.pts.length; j++) {
        const [ax, ay] = c.pts[j - 1], [bx, by] = c.pts[j], l = Math.hypot(bx - ax, by - ay);
        for (let u = 0; u < l; u += 4) { const s2 = run + u; if (c.r.some(([s0, s1]) => s2 >= s0 && s2 <= s1)) { const t = u / l; rapids.push((ax + (bx - ax) * t + 0.5) * TILE, (ay + (by - ay) * t + 0.5) * TILE); } }
        run += l;
      }
    }
    this.roars = { map, falls, rapids };
    return this.roars;
  }
  // how loud the white water is where you stand: 0..1
  roar(map, L) {
    const W = this.whiteWater(map);
    let best = 0;
    for (const f of W.falls) {
      const dx = Math.max(0, Math.abs(L.x - f.x) - f.hw), dy = L.y - f.y, d = Math.hypot(dx, dy) / TILE;
      if (d < ROAR.falls) best = Math.max(best, (1 - d / ROAR.falls) * (1 - d / ROAR.falls));
    }
    for (let i = 0; i < W.rapids.length; i += 2) {
      const d = Math.hypot(L.x - W.rapids[i], L.y - W.rapids[i + 1]) / TILE;
      if (d < ROAR.rapid) best = Math.max(best, ROAR.rapidK * (1 - d / ROAR.rapid) * (1 - d / ROAR.rapid));
    }
    return best;
  }
  // the map's campfires, found once
  campfires(map) {
    if (this.fires && this.fires.map === map) return this.fires.list;
    const list = [];
    if (map && map.props) for (let i = 0; i < map.props.length; i++) { const p = map.props[i]; if (p && p.t === 'campfire') list.push(p); }
    this.fires = { map, list };
    return list;
  }
  // what's around: the tiles near and far, the district. The sea's water (k.water, k.shore: the swell, the surf, the
  // gulls) apart from a river's or a lake's (the map's river layer, lakes in it too: k.river - a lake only laps a little
  // in the swell); the woods (k.woods: green ground in the map's forest cells, a park's lawns half as much) apart from
  // the open grass and fields (k.green)
  scan(map, L) {
    const k = this.k, tx0 = Math.floor(L.x / TILE), ty0 = Math.floor(L.y / TILE);
    const D = map.districtAt(L.x, L.y);
    k.style = D ? D.style : '';
    k.wild = WILD[k.style] || 0;
    const riv = map.river || null, lake = map.lake || null, TC = map.terrainCls, cls = TC && TC.cls, cw = TC && TC.cw;
    // (0 dry land, 1 the sea, 2 a river, 3 a lake)
    const wet = (tx, ty, t) => {
      if (t !== T.WATER && t !== T.DEEP) return 0;
      if (!riv || !map.inside(tx, ty)) return 1;
      const i = map.idx(tx, ty);
      return riv[i] ? (lake && lake[i] ? 3 : 2) : 1;
    };
    let w = 0, s = 0, g = 0, u = 0, n = 0, wx = 0, wi = 0, li = 0, ni = 0, gi = 0, wo = 0, rv = 0, rn = 0;
    for (let dy = -24; dy <= 24; dy += 6) for (let dx = -24; dx <= 24; dx += 6) {
      const tx = tx0 + dx, ty = ty0 + dy, t = map.tileAt(tx, ty), q = wet(tx, ty, t); n++;
      if (q === 1 || q === 3) { const kq = q === 1 ? 1 : LAKE_K; w += kq; wx += dx * kq; }
      else if (q === 2) rv += Math.max(0, 1 - Math.hypot(dx, dy) / ROAR.far);   // (a river off at the edge of hearing counts for little)
      else if (t === T.SAND) s++;
      else if (GREEN.has(t)) { g++; if (cls && cls[Math.floor(ty / TERRAIN_CELL) * cw + Math.floor(tx / TERRAIN_CELL)] === FOREST) wo++; }
      else if (URBAN.has(t)) u++;
    }
    for (let dy = -6; dy <= 6; dy += 2) for (let dx = -6; dx <= 6; dx += 2) {
      const tx = tx0 + dx, ty = ty0 + dy, t = map.tileAt(tx, ty), q = wet(tx, ty, t); ni++;
      if (q === 1) wi++; else if (q) rn++; else { li++; if (GREEN.has(t)) gi++; }
    }
    k.water = w / n; k.sand = s / n; k.green = Math.max(g / n, gi / ni); k.urban = u / n;
    k.woods = Math.min(1, wo / n * 1.25 + (k.style === 'park' ? k.green * 0.5 : 0));
    k.river = Math.min(1, Math.max(rv / n, rn / ni) * 3);
    k.roar = this.roar(map, L);
    k.shore = wi && li ? Math.min(1, (Math.min(wi, li) / ni) * 3.5) : 0;
    k.wx = w ? wx / w / 24 : 0;
  }
  // somewhere around you for a critter: d px away in a random direction
  around(L, d0, d1) { const a = R() * 6.283, d = rr(d0, d1); return [L.x + Math.cos(a) * d, L.y + Math.sin(a) * d]; }

  update(F, S, dt, inside) {
    const E = this.E, L = E.listener, t = this.ctx.currentTime, k = this.k, nx = this.next;
    if (t >= nx.scan && S.map) { nx.scan = t + 0.25; this.scan(S.map, L); this.findFire(F, S, L); this.levels(F, S, t, inside); }
    if (F.sub) { if (F.ug) this.under(F, t); return; }
    const night = F.clock ? F.clock.dark : 0, rain = S.rainK || 0;
    const greenish = k.green > 0.25 || k.wild >= 0.5;
    // ---- the creatures and the town, now and then ----
    if (!inside) {
      if (night < 0.35 && greenish && rain < 0.5 && t >= nx.bird) { nx.bird = t + rr(1.6, 7); const [x, y] = this.around(L, 150, 650); E.play('bird', x, y, rr(0.5, 1)); }
      if (night > 0.6 && greenish && rain < 0.3 && t >= nx.cricket) {
        nx.cricket = t + rr(0.18, 0.9);
        const c = this.crickets[Math.floor(R() * 3)];
        if (Math.hypot(c[0] - L.x, c[1] - L.y) > 650 || R() < 0.02) { const [x, y] = this.around(L, 180, 520); c[0] = x; c[1] = y; }
        E.play('cricket', c[0], c[1], rr(0.6, 1));
      }
      if (night > 0.7 && k.wild >= 0.5 && rain < 0.2 && t >= nx.owl) { nx.owl = t + rr(35, 110); const [x, y] = this.around(L, 300, 800); E.play('owl', x, y, 0.9); }
      if (k.urban > 0.25 && t >= nx.dog) { nx.dog = t + rr(night > 0.5 ? 30 : 50, 140); const [x, y] = this.around(L, 500, 1100); E.play('dog', x, y, 0.6); }
      if (k.urban > 0.4 && t >= nx.siren) { nx.siren = t + rr(70, 220); const [x, y] = this.around(L, 2000, 2400); E.play('farsiren', x, y, 0.6); }
      if (k.urban > 0.35 && night < 0.5 && t >= nx.horn) { nx.horn = t + rr(14, 55); const [x, y] = this.around(L, 2000, 2400); E.play('farhorn', x, y, 0.7); }
      if (k.water > 0.2 && night < 0.4 && rain < 0.5 && t >= nx.gull) { nx.gull = t + rr(8, 30); const [x, y] = this.around(L, 300, 900); E.play('gull', x, y, 0.7); }
      if (rain > 0.2 && t >= nx.drop) { nx.drop = t + rr(0.12, 0.4) / rain; const [x, y] = this.around(L, 20, 260); E.play('drop', x, y, rr(0.4, 1) * rain); }   // (a few drops close by, not a constant ticking)
    }
    if (this.fire && t >= nx.crackle) {
      const v = rr(0.5, 1);
      nx.crackle = t + rr(0.05, 0.3); E.play('crackle', this.fire.x, this.fire.y, v);
      if (S.onCrackle) S.onCrackle(this.fire.x, this.fire.y, v);   // (a loud one: the campfire flares - render/campfx.js)
    }
  }
  // down the sewers: drips, now and then a rat; in the cave: drips ringing off the rock, the odd flap of a bat
  under(F, t) {
    const E = this.E, L = E.listener, nx = this.next, cave = F.ug === 2;
    if (t >= nx.ugdrip) { nx.ugdrip = t + rr(cave ? 0.35 : 0.6, cave ? 1.8 : 2.6); const [x, y] = this.around(L, 60, 500); E.play('cavedrip', x, y, rr(0.5, 1)); }
    if (!cave && t >= nx.rat) { nx.rat = t + rr(4, 14); const [x, y] = this.around(L, 80, 400); E.play('squeak', x, y, rr(0.6, 1)); }
    if (cave && t >= nx.flap) { nx.flap = t + rr(9, 26); const [x, y] = this.around(L, 200, 700); E.play('flutter', x, y, rr(0.4, 0.8)); }
  }
  findFire(F, S, L) {
    let best = null, bd = 520;
    for (const p of this.campfires(S.map)) {
      if (!p.lit || Math.abs(p.x - L.x) > bd || Math.abs(p.y - L.y) > bd) continue;
      const d = Math.hypot(p.x - L.x, p.y - L.y);
      if (d < bd) { bd = d; best = p; }
    }
    for (const v of F.vehs) if (v.flags & VF.BURN) { const d = Math.hypot(v.rx - L.x, v.ry - L.y); if (d < bd) { bd = d; best = v; } }
    for (const p of F.peds) if (p.burn) { const d = Math.hypot(p.rx - L.x, p.ry - L.y); if (d < bd) { bd = d; best = p; } }   // (someone on fire: server burning.js)
    if (!best) { this.fire = null; return; }
    this.fire = this.fire || { x: 0, y: 0, d: 0 };
    this.fire.x = best.x ?? best.rx; this.fire.y = best.y ?? best.ry; this.fire.d = bd;
    if (best.rx !== undefined) { this.fire.x = best.rx; this.fire.y = best.ry; }
  }
  // the beds' levels for where you are (eased: a slow crossfade)
  levels(F, S, t, inside) {
    const k = this.k, B = this.beds, night = F.clock ? F.clock.dark : 0, rain = S.rainK || 0, sub = !!F.sub;
    this.gust = Math.max(0.35, Math.min(1, this.gust + (R() - 0.5) * 0.25));
    this.swellPh += 0.25 * 6.283 / rr(7.5, 10);
    const swell = 0.65 + 0.35 * Math.sin(this.swellPh);
    const roof = inside ? 0.35 : 1, open = sub ? 0 : 1;
    const want = this.want || (this.want = {});
    want.city = open * roof * Math.min(1, k.urban * 1.4) * (1 - k.wild * 0.7) * (night > 0.5 ? 0.6 : 1) * BED_MAX.city;
    // (the open country's breeze: under the city's hum, gusting - it was 0.05 + 0.26 wild, the leaves on top of it)
    // (under the trees the wind is up in the canopy - the leaves' rustle - not a whoosh along the ground: the owner,
    // 2026-10-16, "ocean sounds in the forest" - the wind bed's gusts swelling and falling like waves under the redwoods)
    want.wind = open * roof * (0.04 + 0.2 * k.wild * (1 - k.urban) + 0.1 * rain + 0.15 * Math.max(0, k.water - 0.6)) * this.gust * (1 - 0.65 * k.woods);
    want.leaves = open * roof * k.woods * LEAVES_LEVEL * this.gust * this.gust;   // (the woods' rustle, in the gusts)
    want.sea = open * roof * Math.pow(k.water, 0.8) * BED_MAX.sea * swell;
    want.surf = open * roof * k.shore * SURF_LEVEL;
    want.rain = sub ? 0 : rain * (inside ? 0.09 : BED_MAX.rain) * (0.85 + 0.15 * this.gust);   // (the server's weather: heard through the roof indoors; it swells a little with the gusts)
    want.sub = sub && !F.ug ? BED_MAX.sub : 0;
    want.flow = F.ug === 1 ? BED_MAX.flow : F.ug ? 0 : open * roof * Math.min(BED_MAX.flow, k.river * RIVER_LEVEL + k.roar * ROAR.level);   // (the sewer's stream; up top, a river running by, a falls roaring)
    want.cave = F.ug === 2 ? BED_MAX.cave : 0;
    want.fire = this.fire && !sub ? Math.pow(Math.max(0, 1 - this.fire.d / 520), 2) * BED_MAX.fire : 0;
    for (const name in want) {
      const b = B[name], w = want[name] * this.level;
      if (w > 0.002 && !b.on) this.bedOn(name, b);
      if (b.on) {
        setp(b.g.gain, w, t, name === 'fire' ? 0.4 : 1.2);
        if (w <= 0.002) { if (!b.quietAt) b.quietAt = t; else if (t - b.quietAt > 4) this.bedOff(b); } else b.quietAt = 0;
      }
    }
    setp(this.windF.frequency, 320 + 650 * this.gust, t, 0.6);
    if (this.pan) setp(this.pan.pan, Math.max(-0.7, Math.min(0.7, k.wx)), t, 1);
    // the surf: a wave breaks every several seconds along the shore
    if (k.shore > 0.1 && t >= this.next.surf) {
      this.next.surf = t + rr(4.5, 9);
      const e = this.surfEnv.gain;
      e.cancelScheduledValues(t); e.setTargetAtTime(rr(0.55, 0.85), t, 0.4); e.setTargetAtTime(0.15, t + rr(1, 1.6), 1.4);
    }
    // indoors the ambience is heard through the walls
    setp(this.E.mix.ambLp.frequency, inside ? 700 : F.ug ? 3200 : sub ? 1500 : 18000, t, 0.4);
  }
  // a bed heard: its noise (made if none of that colour is running) into its filters, its level to the bus
  bedOn(name, b) {
    const c = this.ctx;
    let s = this.srcs[b.color];
    if (!s) {
      const buf = this.E.buf[b.color];
      s = krate(c.createBufferSource()); s.buffer = buf; s.loop = true; s.start(0, R() * (buf.duration - 0.1));
      this.srcs[b.color] = s;
    }
    s.connect(b.chain[0]);
    b.g.connect(name === 'sea' || name === 'surf' ? this.pan || this.out : this.out);
    b.on = true; b.quietAt = 0;
  }
  // a bed gone quiet: unplugged, and its noise stopped when no other bed needs it
  bedOff(b) {
    const s = this.srcs[b.color];
    try { b.g.disconnect(); } catch { /* gone */ }
    if (s) { try { s.disconnect(b.chain[0]); } catch { /* gone */ } }
    b.on = false; b.quietAt = 0;
    if (s && !Object.values(this.beds).some((o) => o.on && o.color === b.color)) { try { s.stop(); } catch { /* stopped */ } try { s.disconnect(); } catch { /* gone */ } this.srcs[b.color] = null; }
  }
  silence() {
    const t = this.ctx.currentTime;
    for (const name in this.beds) {
      const b = this.beds[name];
      if (!b.on) continue;
      setp(b.g.gain, 0, t, 0.5);
      if (!b.quietAt) b.quietAt = t; else if (t - b.quietAt > 4) this.bedOff(b);
    }
  }
  // the beds heard right now (the bench, the debug line)
  heard() { return Object.keys(this.beds).filter((n) => this.beds[n].on); }
}
