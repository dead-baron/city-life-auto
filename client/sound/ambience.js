// The ambience (the owner's notes: "ambience in nature, the rain and the sea"; "a campfire's gentle crackle; now and
// then an owl or crickets at night. Subtle, never repetitive"). Beds of filtered noise - the city's hum, the wind,
// leaves, the sea's swell and the surf, the rain, the subway, a fire's roar - made once from three looping noise
// sources and crossfaded slowly as you move: a few times a second the tiles around the camera are sampled (how
// much water, sand, green, street) with the district, the time of day and the rain. Over them, now and then, a
// creature or the town: birds by day, crickets and an owl at night, gulls by the sea, a dog, a far siren, a horn;
// rain pattering; a fire's crackle near a lit campfire or a burning car. Never on a fixed loop: every gap is random.
import { T, TILE, VF } from '../../shared/constants.js';
import { setp } from './engine.js';

const R = Math.random, rr = (a, b) => a + R() * (b - a);
const URBAN = new Set([T.ROAD, T.SIDEWALK, T.PLAZA, T.LOT, T.BUILDING, T.WALL, T.BRIDGE]);
const GREEN = new Set([T.GRASS, T.FIELD, T.DIRT]);
const WILD = { wild: 1, rural: 0.7, desert: 0.9, rocky: 0.8, park: 0.5, water: 0.6 };

export class Ambience {
  constructor(E) {
    this.E = E; const c = E.ctx; this.ctx = c;
    const src = (b) => { const s = c.createBufferSource(); s.buffer = b; s.loop = true; s.start(0, R() * (b.duration - 0.1)); return s; };
    const flt = (type, f, q = 0.7) => { const n = c.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; return n; };
    const gain = (v = 0) => { const n = c.createGain(); n.gain.value = v; return n; };
    this.white = src(E.buf.white); this.pink = src(E.buf.pink); this.brown = src(E.buf.brown);
    this.out = E.mix.ambIn;
    const bed = (from, chain, connectNow = false) => {
      const g = gain(0); let last = from;
      for (const n of chain) { last.connect(n); last = n; }
      last.connect(g);
      const b = { g, chain, on: false, quietAt: 0, w: 0 };
      if (connectNow) { g.connect(this.out); b.on = true; }
      return b;
    };
    this.pan = c.createStereoPanner ? c.createStereoPanner() : null; if (this.pan) this.pan.connect(this.out);
    this.beds = {
      city: bed(this.brown, [flt('lowpass', 420, 0.5)]),
      wind: bed(this.pink, [flt('bandpass', 600, 0.8)]),
      leaves: bed(this.pink, [flt('highpass', 1500), flt('bandpass', 3200, 0.4)]),
      sea: bed(this.brown, [flt('lowpass', 520, 0.5)]),
      surf: bed(this.white, [flt('bandpass', 900, 0.3), gain(0.2)]),
      rain: bed(this.white, [flt('highpass', 900), flt('lowpass', 6500)]),
      sub: bed(this.brown, [flt('lowpass', 190, 0.8)]),
      fire: bed(this.brown, [flt('lowpass', 330, 0.6)]),
    };
    this.surfEnv = this.beds.surf.chain[1];   // (the wave crashes: its own envelope, under the shore's level)
    this.windF = this.beds.wind.chain[0];
    this.gust = 0.7; this.swellPh = R() * 6.28;
    this.next = { scan: 0, bird: 0, cricket: 0, owl: rr(20, 60), dog: rr(20, 60), siren: rr(40, 120), horn: rr(8, 30), gull: rr(5, 15), drop: 0, crackle: 0, surf: 0 };
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
    if (F.sub) return;
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
      if (rain > 0.2 && t >= nx.drop) { nx.drop = t + rr(0.04, 0.2) / rain; const [x, y] = this.around(L, 20, 300); E.play('drop', x, y, rain); }
    }
    if (this.fire && t >= nx.crackle) { nx.crackle = t + rr(0.05, 0.3); E.play('crackle', this.fire.x, this.fire.y, rr(0.5, 1)); }
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
      wind: open * roof * (0.06 + 0.4 * k.wild * (1 - k.urban) + 0.25 * rain + 0.2 * Math.max(0, k.water - 0.6)) * this.gust,
      leaves: open * roof * k.green * Math.min(1, k.wild * 1.6) * 0.35 * this.gust * this.gust,
      sea: open * roof * Math.pow(k.water, 0.8) * 0.5 * swell,
      surf: open * roof * k.shore * 0.8,
      rain: (sub ? 0 : rain * (inside ? 0.35 : 0.5)),
      sub: sub ? 0.6 : 0,
      fire: this.fire && !sub ? Math.pow(Math.max(0, 1 - this.fire.d / 520), 2) * 0.35 : 0,
    };
    for (const name in want) {
      const b = B[name], w = want[name];
      if (w > 0.002 && !b.on) { b.g.connect(name === 'sea' || name === 'surf' ? this.pan || this.out : this.out); b.on = true; }
      if (b.on) {
        setp(b.g.gain, w, t, name === 'fire' ? 0.4 : 1.2);
        if (w <= 0.002) { if (!b.quietAt) b.quietAt = t; else if (t - b.quietAt > 6) { try { b.g.disconnect(); } catch { /* gone */ } b.on = false; b.quietAt = 0; } } else b.quietAt = 0;
      }
    }
    this.windF.frequency.setTargetAtTime(320 + 650 * this.gust, t, 0.6);
    if (this.pan) this.pan.pan.setTargetAtTime(Math.max(-0.7, Math.min(0.7, k.wx)), t, 1);
    // the surf: a wave breaks every several seconds along the shore
    if (k.shore > 0.1 && t >= this.next.surf) {
      this.next.surf = t + rr(4.5, 9);
      const e = this.surfEnv.gain;
      e.cancelScheduledValues(t); e.setTargetAtTime(rr(0.7, 1), t, 0.35); e.setTargetAtTime(0.15, t + rr(1, 1.6), 1.4);
    }
    // indoors the ambience is heard through the walls
    this.E.mix.ambLp.frequency.setTargetAtTime(inside ? 700 : sub ? 1500 : 18000, t, 0.4);
  }
  silence() {
    const t = this.ctx.currentTime;
    for (const name in this.beds) {
      const b = this.beds[name];
      if (!b.on) continue;
      setp(b.g.gain, 0, t, 0.5);
      if (!b.quietAt) b.quietAt = t; else if (t - b.quietAt > 6) { try { b.g.disconnect(); } catch { /* gone */ } b.on = false; b.quietAt = 0; }
    }
  }
}
