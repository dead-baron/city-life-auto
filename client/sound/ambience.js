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
import { setp, krate } from './engine.js';

const R = Math.random, rr = (a, b) => a + R() * (b - a);
const URBAN = new Set([T.ROAD, T.SIDEWALK, T.PLAZA, T.LOT, T.BUILDING, T.WALL, T.BRIDGE]);
const GREEN = new Set([T.GRASS, T.FIELD, T.DIRT]);
const WILD = { wild: 1, rural: 0.7, desert: 0.9, rocky: 0.8, park: 0.5, water: 0.6 };
// the surf's level on the waterline: a crash peaks near the town's and the rain's beds (tools/sound/bench.py beds), not
// 15 dB over them (#397)
export const SURF_LEVEL = 0.32;

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
    this.k = { water: 0, sand: 0, green: 0, urban: 0, shore: 0, wx: 0, wild: 0, style: '' };
    this.fires = null;
    this.fire = null;   // the nearest fire (a lit campfire, a burning vehicle): { x, y, d }
  }
  // the map's campfires, found once
  campfires(map) {
    if (this.fires && this.fires.map === map) return this.fires.list;
    const list = [];
    if (map && map.props) for (let i = 0; i < map.props.length; i++) { const p = map.props[i]; if (p && p.t === 'campfire') list.push(p); }
    this.fires = { map, list };
    return list;
  }
  // what's around: the tiles near and far, the district
  scan(map, L) {
    const k = this.k, tx0 = Math.floor(L.x / TILE), ty0 = Math.floor(L.y / TILE);
    let w = 0, s = 0, g = 0, u = 0, n = 0, wx = 0, wi = 0, li = 0, ni = 0, gi = 0;
    for (let dy = -24; dy <= 24; dy += 6) for (let dx = -24; dx <= 24; dx += 6) {
      const t = map.tileAt(tx0 + dx, ty0 + dy); n++;
      if (t === T.WATER || t === T.DEEP || t === undefined) { w++; wx += dx; } else if (t === T.SAND) s++; else if (GREEN.has(t)) g++; else if (URBAN.has(t)) u++;
    }
    for (let dy = -6; dy <= 6; dy += 2) for (let dx = -6; dx <= 6; dx += 2) {
      const t = map.tileAt(tx0 + dx, ty0 + dy); ni++;
      if (t === T.WATER || t === T.DEEP || t === undefined) wi++; else { li++; if (GREEN.has(t)) gi++; }
    }
    k.water = w / n; k.sand = s / n; k.green = Math.max(g / n, gi / ni); k.urban = u / n;
    k.shore = wi && li ? Math.min(1, (Math.min(wi, li) / ni) * 3.5) : 0;
    k.wx = w ? wx / w / 24 : 0;
    const D = map.districtAt(L.x, L.y);
    k.style = D ? D.style : '';
    k.wild = WILD[k.style] || 0;
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
    const want = {
      city: open * roof * Math.min(1, k.urban * 1.4) * (1 - k.wild * 0.7) * (night > 0.5 ? 0.6 : 1) * 0.42,
      wind: open * roof * (0.05 + 0.26 * k.wild * (1 - k.urban) + 0.1 * rain + 0.15 * Math.max(0, k.water - 0.6)) * this.gust,
      leaves: open * roof * k.green * Math.min(1, k.wild * 1.6) * 0.35 * this.gust * this.gust,
      sea: open * roof * Math.pow(k.water, 0.8) * 0.5 * swell,
      surf: open * roof * k.shore * SURF_LEVEL,
      rain: (sub ? 0 : rain * (inside ? 0.09 : 0.22) * (0.85 + 0.15 * this.gust)),   // (heard through the roof indoors; it swells a little with the gusts)
      sub: sub && !F.ug ? 0.6 : 0,
      flow: F.ug === 1 ? 0.3 : 0,
      cave: F.ug === 2 ? 0.28 : 0,
      fire: this.fire && !sub ? Math.pow(Math.max(0, 1 - this.fire.d / 520), 2) * 0.35 : 0,
    };
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
