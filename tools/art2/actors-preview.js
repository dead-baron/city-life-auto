// Preview of the live renderer's actor sprites (client/art2/game/actors.js): builds G-buffer stages, places
// sprites with the engine's per-pixel depth rule (the larger height wins, ties go to the later layer), adds
// the moving lights (headlights, tail and brake lamps, sirens, fire, effect flashes) and lights each stage
// with the Lighter. A view is one or more panels (a stage + a lighting preset) stacked in the .wrap.
import * as A from '../../client/art2/game/actors.js';
import { GBuf } from '../../client/art2/gbuf.js';
import { paintRect } from '../../client/art2/ground.js';
import { Lighter, PRESETS } from '../../client/art2/light.js';
import { VEHICLE_BY_INDEX, VEHICLES, PAINTS } from '../../shared/vehicles.js';
import { VEHICLE_ART_SIZE } from '../../shared/prefab-data.js';

const q = new URLSearchParams(location.search), view = q.get('view') || 'line', P0 = q.get('p') || 'golden';
const Z = Number(q.get('z') || 2), showLabels = q.get('labels') !== '0', TAU = Math.PI * 2;
const timing = {};
const timed = (name, fn) => { const t0 = performance.now(); const r = fn(); (timing[name] ||= []).push(performance.now() - t0); return r; };
// a rider for bikes and jet skis from the characters provider, when it is there
let PEDS = null;
try { PEDS = await import('../../client/art2/game/peds.js'); } catch (e) { PEDS = null; }
const RIDER_APP = { s: 2, h: 0, hc: 0, t: 2, tc: 3, tc2: 1, l: 2, sh: 0, ht: 5, htc: 0, b: 0, bd: 1 };

class Stage {
  constructor(w, h) { this.G = new GBuf(w, h); this.lights = []; this.labels = []; }
  ground(kind, x, y, w, h, seed = 1) { paintRect(this.G, x, y, w, h, kind, seed); }
  // place sprite S with its anchor at (x, y); z0 raises it (a deck, a bed, flight height)
  put(S, x, y, z0 = 0) {
    const G = this.G, ox = Math.round(x - S.ax), oy = Math.round(y - S.ay - z0);
    for (let sy = 0; sy < S.h; sy++) {
      const gy = sy + oy; if (gy < 0 || gy >= G.h) continue;
      for (let sx = 0; sx < S.w; sx++) {
        const gx = sx + ox; if (gx < 0 || gx >= G.w) continue;
        const si = sy * S.w + sx, a = S.col[si * 4 + 3]; if (!a) continue;
        const di = gy * G.w + gx, sz = S.z[si] + z0;
        if (a < 255) { const k = a / 255; for (let c = 0; c < 3; c++) G.col[di * 4 + c] = G.col[di * 4 + c] * (1 - k) + S.col[si * 4 + c] * k; continue; }
        if (sz < G.z[di] && G.col[di * 4 + 3] && !(G.flag[di] & 1)) continue;
        for (let c = 0; c < 4; c++) { G.col[di * 4 + c] = S.col[si * 4 + c]; G.nrm[di * 4 + c] = S.nrm[si * 4 + c]; G.emi[di * 4 + c] = S.emi[si * 4 + c]; }
        G.z[di] = sz; G.flag[di] = S.flag[si];
      }
    }
    if (S.light) this.light(x + S.light.x, y + S.light.y, z0 + S.light.z, S.light.r, S.light.col, S.light.k);
  }
  label(text, x, y) { this.labels.push([text, x, y]); }
  light(x, y, z, r, col, k) { this.lights.push({ x, y, z, r, col, k }); }
  // a vehicle at heading index hi of N, with its lights; riders on bikes and jet skis
  veh(d, st, x, y, hi, N = 32, z0 = 0) {
    const t = VEHICLE_BY_INDEX[d.m].id, spr = timed('vehicle ' + t, () => A.vehicleSprite(d, st, hi, N)), ang = hi * TAU / N;
    if (VEHICLE_BY_INDEX[d.m].kind === 'boat' && !st.still) this.put(timed('wake', () => A.wakeSprite(d, hi, N, (x | 0) & 3)), x, y, z0);
    this.put(spr, x, y, z0);
    this.vehLights(d, st, x, y, ang);
    const L = A.vehicleLights(d), def = VEHICLE_BY_INDEX[d.m];
    if (PEDS && PEDS.pedSprite && L.seat && (def.kind === 'bike' || t === 'jetski') && !st.wreck && q.get('riders') !== '0') {   // (&riders=0: the bare vehicles)
      try {
        // dir8 from the heading (0 S, 1 SW, 2 W ... 6 E, 7 SE); the seated pose has its hips at SEATS[pose], so
        // lift it by the model's own seat height minus that
        const d8 = (((Math.round(ang / (Math.PI / 4)) - 2) % 8) + 8) % 8, pose = def.pedal ? 'pedal' : 'ride';
        let R; try { R = PEDS.pedSprite(RIDER_APP, pose, d8, 0, 0); } catch (e) { R = PEDS.pedSprite(PEDS.adaptApp(RIDER_APP), pose, d8, 0, 0); }
        const c = Math.cos(ang), s = Math.sin(ang), hip = (PEDS.SEATS && PEDS.SEATS[pose]) ?? 20;
        this.put(R, x + L.seat[0] * c - L.seat[1] * s, y + L.seat[0] * s + L.seat[1] * c, z0 + L.seat[2] - hip);
      } catch (e) { /* no rider */ }
    }
    return spr;
  }
  vehLights(d, st, x, y, ang) {
    const L = A.vehicleLights(d), c = Math.cos(ang), s = Math.sin(ang);
    const at = ([lx, ly, lz]) => [x + lx * c - ly * s, y + lx * s + ly * c, lz];
    // headlight beams as lights stepping out ahead (the game uses cone lights; the night grade wants k ~3)
    if (st.lights) { for (const p of L.head) { const [wx, wy, wz] = at(p); this.light(wx + c * 6, wy + s * 6, wz + 4, 36, [1, 0.94, 0.78], 3); } for (const dd of [0.75, 1.15, 1.6]) this.light(x + c * L.L * dd, y + s * L.L * dd, 12, 52 + dd * 26, [1, 0.92, 0.72], 4.4 - dd * 1.4); }
    if (st.lights || st.brake) for (const p of L.tail) { const [wx, wy, wz] = at(p); this.light(wx - c * 8, wy - s * 8, wz + 6, st.brake ? 56 : 38, [1, 0.12, 0.08], st.brake ? 4.2 : 2); }
    if (st.rev) for (const p of L.rev) { const [wx, wy, wz] = at(p); this.light(wx - c * 10, wy - s * 10, wz + 6, 42, [1, 1, 0.95], 3); }
    if (st.siren) L.siren.forEach((p) => { const [wx, wy, wz] = at(p), ph = st.siren === true ? 3 : st.siren; if (ph === 3 || p[3] === 2 || (ph === 1 && p[3] === 0) || (ph === 2 && p[3] === 1)) this.light(wx, wy, wz + 4, 120, p[3] === 0 ? [1, 0.12, 0.1] : p[3] === 1 ? [0.2, 0.35, 1] : [1, 0.6, 0.15], 4); });
    if (st.dmg === 2 && !st.burn) { const p = L.fire[0]; if (p) { const [wx, wy, wz] = at(p); this.put(A.fxSprite('smokeLight', 3), wx + 2, wy - 1, wz + 4); } }   // the SMOKE flag
    if (st.burn) L.fire.forEach((p, i) => { const [wx, wy, wz] = at(p); this.light(wx, wy, wz + 10, 90, [1, 0.55, 0.22], 1.5); const f = A.fxSprite(i ? 'fireSmall' : 'fireLarge', 2 + i); this.put(f, wx, wy + 1, wz - 2); if (!st.wreck || i === 0) this.put(A.fxSprite('smokeHeavy', 2 + i), wx + 4, wy - 2, wz + 18); });
  }
}
const backdrop = (S, rows) => { for (const [y0, h, kind] of rows) S.ground(kind, 0, y0, S.G.w, h, 3); };
const dOf = (t, p = 0, vr = 0, tn = -1) => ({ m: VEHICLES[t].i, p, vr, tn });

const views = {};
// every model at heading 0 (seen side-on from the south), like V1 / V2 / V4
views.line = () => {
  const rows = [['compact', 'sedan', 'taxi', 'sports', 'pickup', 'van'], ['police', 'ambulance', 'armored', 'swat', 'bike', 'policebike', 'bicycle'],
    ['bus', 'flatbed', 'boxtruck'], ['dumptruck', 'mixer', 'tanker'], ['garbage', 'firetruck', 'towtruck'], ['jetski', 'speedboat', 'dinghy', 'policeboat']];
  const paints = { compact: 6, sedan: 12, sports: 0, pickup: 13, van: 2, bike: 0, bicycle: 6, jetski: 0, speedboat: 1, dinghy: 11 };
  const W = 860, RH = 120, S = new Stage(W, rows.length * RH + 20);
  backdrop(S, [[0, (rows.length - 1) * RH + 10, 'asphalt'], [(rows.length - 1) * RH + 10, RH + 10, 'water']]);
  rows.forEach((r, ri) => {
    let x = 20;
    r.forEach((t, i) => {
      const d = dOf(t, paints[t] ?? 0, [0, 0, 0, 1, 1, 0, 0][i] + (t === 'flatbed' ? 9 : 0), -1);
      const spr = A.vehicleSprite(d, {}, 0, 32);
      S.veh(d, {}, x + spr.ax, 92 + ri * RH, 0);
      S.label(t, x + 2, 108 + ri * RH);
      x += spr.w + 22;
    });
  });
  return [{ S }];
};
// all 26 models at 8 headings (set=cars|trucks|small)
views.grid = () => {
  const sets = { cars: ['compact', 'sedan', 'taxi', 'sports', 'pickup', 'van', 'police', 'ambulance', 'swat', 'armored'],
    trucks: ['bus', 'flatbed', 'boxtruck', 'dumptruck', 'mixer', 'tanker', 'garbage', 'firetruck', 'towtruck'],
    small: ['bike', 'policebike', 'bicycle', 'jetski', 'speedboat', 'dinghy', 'policeboat'] };
  const set = q.get('set') || 'cars', list = sets[set], big = set === 'trucks';
  const CW = big ? 220 : set === 'small' ? 110 : 136, RH = big ? 200 : set === 'small' ? 100 : 132, S = new Stage(CW * 8 + 20, list.length * RH + 10);
  backdrop(S, [[0, S.G.h, 'asphalt']]);
  list.forEach((t, ri) => {
    const d = dOf(t, (ri * 5 + 1) % PAINTS.length, ri, -1);
    if (VEHICLES[t].kind === 'boat') S.ground('water', 0, ri * RH, S.G.w, RH, 5);
    for (let k = 0; k < 8; k++) S.veh(d, {}, 10 + CW * k + CW / 2, ri * RH + RH * 0.64, k * 4, 32);
    S.label(t, 4, ri * RH + 12);
  });
  return [{ S }];
};
// the pedal bikes: side-on with a rider, then each at 8 headings (riders on the first two rows' bikes), a wreck
views.bikes = () => {
  const list = ['bicycle', 'cruiser', 'mtb', 'roadbike', 'bmx', 'cargobike'], CW = 92, RH = 86;
  const S = new Stage(CW * 8 + 20, list.length * RH + 120);
  backdrop(S, [[0, S.G.h, 'asphalt']]);
  list.forEach((t, ri) => {
    const d = dOf(t, [6, 9, 5, 0, 1, 12][ri], ri, -1);
    for (let k = 0; k < 8; k++) S.veh(d, {}, 10 + CW * k + CW / 2, ri * RH + RH * 0.62, k * 4, 32);
    S.label(t, 4, ri * RH + 12);
  });
  const y = list.length * RH + 70;
  list.forEach((t, i) => { const d = dOf(t, [6, 9, 5, 0, 1, 12][i], 1, -1); S.veh(d, i === 5 ? { wreck: true } : {}, 60 + i * 120, y, 0); S.label(i === 5 ? 'cargobike wreck' : t, 20 + i * 120, y + 34); });
  return [{ S }];
};
// the sedan at 16 headings, like V3
views.rot = () => {
  const S = new Stage(4 * 150, 4 * 130);
  backdrop(S, [[0, S.G.h, 'asphalt']]);
  const d = dOf('sedan', 9, 0);
  for (let i = 0; i < 16; i++) S.veh(d, {}, 75 + (i % 4) * 150, 88 + Math.floor(i / 4) * 130, i * 2, 32);
  return [{ S }];
};
// V6: clean, damaged, wrecked (burnt out), burning, smouldering, bloody; at night: headlights, brakes, siren
views.states = () => {
  const day = new Stage(4 * 150, 2 * 120), night = new Stage(4 * 150, 120);
  backdrop(day, [[0, day.G.h, 'asphalt']]); backdrop(night, [[0, night.G.h, 'asphalt']]);
  const d = dOf('sedan', 9, 0);
  [[{}, 'clean'], [{ dmg: 1 }, 'dented'], [{ dmg: 2 }, 'smashed (smoke)'], [{ burn: true }, 'burning'], [{ wreck: true, burn: true }, 'burning wreck'], [{ wreck: true }, 'burnt out']].forEach(([st, name], i) => {
    day.veh(d, st, 75 + (i % 3) * 150, 82 + Math.floor(i / 3) * 120, 0); day.label(name, 8 + (i % 3) * 150, 112 + Math.floor(i / 3) * 120);
  });
  day.veh(dOf('bicycle', 6), { wreck: true }, 525, 82, 0); day.label('bicycle wreck', 458, 112);
  day.veh(dOf('pickup', 0, 6), { dmg: 1 }, 525, 202, 0); day.label('rusty variant', 458, 232);
  night.veh(d, { lights: true }, 75, 70, 0); night.label('headlights', 8, 112);
  night.veh(d, { lights: true, brake: true }, 225, 70, 0); night.label('brake', 158, 112);
  night.veh(dOf('police'), { lights: true, siren: 1 }, 375, 70, 0); night.label('siren', 308, 112);
  night.veh(d, { bloody: true, dmg: 1, rev: true }, 525, 70, 16); night.label('bloody / reverse', 458, 112);
  return [{ S: day, preset: 'golden' }, { S: night, preset: 'night' }];
};
// V5: crates, bags and vehicles carrying crates at their cargo slots
views.cargo = () => {
  const S = new Stage(760, 300);
  backdrop(S, [[0, 300, 'asphalt']]);
  S.ground('water', 560, 150, 200, 150, 4);
  [1, 2, 3, 4].forEach((t, i) => { S.put(timed('crate', () => A.crateSprite(t, '', 0, 16)), 40 + i * 54, 70); S.label('crate ' + t, 22 + i * 54, 92); });
  S.put(A.crateSprite(1, 'Produce Box', 0, 16), 256, 70); S.label('produce', 236, 92);
  [1, 2, 3, 4, 0].forEach((t, i) => { S.put(timed('bag', () => A.bagSprite(t, 0, 16)), 330 + i * 56, 70); S.label('bag ' + t, 314 + i * 56, 92); });
  S.put(A.ballSprite(0, 0), 620, 70); S.put(A.ballSprite(1, 1), 650, 70); S.label('balls', 612, 92);
  // vehicles with their slots filled
  const loads = [['pickup', 60, 220, [1, 3, 2, 1]], ['flatbed', 250, 220, [1, 2, 3, 4, 2, 1, 3, 2]], ['bike', 420, 220, [3]], ['speedboat', 650, 232, [2, 4]]];
  for (const [t, x, y, tiers] of loads) {
    const d = dOf(t, t === 'pickup' ? 0 : t === 'bike' ? 6 : 2, t === 'flatbed' ? 9 : 0);
    S.veh(d, {}, x, y, 0);
    const def = VEHICLE_BY_INDEX[d.m], L = A.vehicleLights(d), bed = L.bed ?? (def.kind === 'boat' ? 12 : L.H);
    // slots are physics-local [forward, right]; scale them onto the art footprint
    const kx = L.L / def.L, ky = L.W / def.W;
    tiers.forEach((tier, i) => { const s = def.slots[i]; if (s) S.put(A.crateSprite(tier, '', 0, 16), x + s[0] * kx, y + s[1] * ky, bed); });
    S.label(t, x - 30, y + 40);
  }
  return [{ S }];
};
// pets in every direction and pose, then the farm and wild animals
views.animals = () => {
  const pets = ['pet:dog_golden', 'pet:dog_black', 'pet:dog_spaniel', 'pet:dog_pup', 'pet:cat_black', 'pet:cat_grey', 'pet:cat_ginger'];
  const CW = 46, RH = 46, S = new Stage(CW * 15 + 20, RH * pets.length + 220);
  backdrop(S, [[0, RH * pets.length + 6, 'sidewalk'], [RH * pets.length + 6, 230, 'grass']]);
  pets.forEach((k, r) => {
    for (let d8 = 0; d8 < 8; d8++) S.put(timed('animal', () => A.animalSprite(k, 'idle', d8, 0)), 24 + d8 * CW, 34 + r * RH);
    for (let f = 0; f < 4; f++) S.put(A.animalSprite(k, f < 2 ? 'walk' : 'run', 6, f), 24 + (8 + f) * CW, 34 + r * RH);
    S.put(A.animalSprite(k, 'sit', 7, 0), 24 + 12 * CW, 34 + r * RH);
    S.put(A.animalSprite(k, 'lie', 1, 0), 24 + 13 * CW, 34 + r * RH);
    S.put(A.animalSprite(k, 'graze', 6, 0), 24 + 14 * CW, 34 + r * RH);
    S.label(k.slice(4), 2, 44 + r * RH);
  });
  const farm = ['cow', 'horse', 'sheep', 'pig', 'goat', 'deer', 'rabbit', 'raccoon', 'coyote', 'husky', 'shepherd', 'dalmatian', 'bulldog', 'catCalico'];
  const y0 = RH * pets.length + 6;
  farm.forEach((k, i) => { const x = 60 + (i % 7) * 96, y = y0 + 76 + Math.floor(i / 7) * 96; S.put(A.animalSprite(k, i % 3 === 2 ? 'graze' : 'idle', i % 2 ? 7 : 6, 0), x, y); S.label(k, x - 20, y + 14); });
  return [{ S, preset: q.get('p') || 'noon' }];
};
// objects at headings, projectiles, critters
views.objects = () => {
  const S = new Stage(720, 340);
  backdrop(S, [[0, 340, 'asphalt']]);
  for (let t = 1; t <= 4; t++) for (let k = 0; k < 4; k++) S.put(A.crateSprite(t, '', k * 2, 16), 30 + k * 40, 40 + (t - 1) * 44);
  for (let t = 0; t <= 4; t++) for (let k = 0; k < 4; k++) S.put(A.bagSprite(t, k * 2, 16), 210 + k * 40, 36 + t * 36);
  for (let k = 0; k < 4; k++) { S.put(A.ballSprite(0, k), 400 + k * 22, 40); S.put(A.ballSprite(1, k), 400 + k * 22, 70, 6); }
  for (let k = 0; k < 8; k++) S.put(timed('rocket', () => A.projSprite(12, k * 4, 32)), 400 + (k % 4) * 40, 130 + Math.floor(k / 4) * 40);
  ['pigeon', 'seagull', 'sparrow', 'heron'].forEach((c, r) => { const n = A.critterInfo(c).frames; for (let f = 0; f < n; f++) S.put(A.critterSprite(c, f, f % 2 === 1), 580 + f * 26, 50 + r * 60, f > 0 && c !== 'heron' ? 20 : 0); S.label(c, 560, 64 + r * 60); });
  S.label('crates 1-4 x heading', 10, 210); S.label('bags 0-4', 200, 220); S.label('balls / rockets', 392, 220);
  return [{ S }];
};
// the dropped backpacks, Common to Legendary, at four headings, and the pile of notes, by day and by night (the rare
// ones with the glow the game puts about them: host.js _lights)
views.packs = () => {
  const mk = (preset) => {
    const S = new Stage(560, 250);
    backdrop(S, [[0, 140, 'asphalt'], [140, 110, 'grass']]);
    for (let r = 1; r <= 5; r++) for (let k = 0; k < 4; k++) {
      const x = 40 + (r - 1) * 110 + (k % 2) * 40, y = 50 + Math.floor(k / 2) * 46 + (r % 2) * 120;
      S.put(A.bagSprite(4 + r, k * 4 + 1, 16), x, y);
      if (r >= 3) S.light(x, y, 16, r === 5 ? 130 : r === 4 ? 90 : 60, r === 5 ? [1, 0.8, 0.38] : r === 4 ? [0.78, 0.47, 1] : [0.35, 0.65, 1], (r === 5 ? 1.1 : r === 4 ? 0.8 : 0.5) * (preset === 'night' ? 1.5 : 0.6));
    }
    S.put(A.bagSprite(0, 3, 16), 520, 60);
    ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'].forEach((n, i) => S.label(n, 30 + i * 110, i % 2 ? 236 : 116));
    return { S, preset };
  };
  return [mk('noon'), mk('night')];
};
// train cars: roof, lit roof (night), the cut-away interior (my train), the empty mail car
views.trains = () => {
  const day = new Stage(760, 660), night = new Stage(760, 260);
  backdrop(day, [[0, 660, 'ballast']]); backdrop(night, [[0, 260, 'ballast']]);
  [0, 1, 2].forEach((c, i) => { day.put(timed('train', () => A.trainCarSprite(c, 'roof', 0, 32)), 130 + i * 240, 140); day.label(['front car', 'coach', 'mail'][c] + ' roof', 60 + i * 240, 190); });
  [0, 1, 2].forEach((c, i) => { day.put(A.trainCarSprite(c, c === 2 ? 'in-empty' : 'in', 0, 32), 130 + i * 240, 330); day.label(['front car in (seats, cab shut)', 'coach in', 'mail in, empty'][i], 40 + i * 240, 380); });
  day.put(A.trainCarSprite(0, 'roof', 4, 32), 160, 500); day.put(A.trainCarSprite(0, 'in', 28, 32), 420, 520); day.put(A.trainCarSprite(1, 'roof', 28, 32), 640, 520);
  [0, 1, 2].forEach((c, i) => { night.put(A.trainCarSprite(c, 'roof-lit', 0, 32), 130 + i * 240, 140); for (const [x, y, z] of A.trainLights(c).windows) night.light(130 + i * 240 + x, 140 + y, z, 46, [1, 0.8, 0.5], 1.8); for (const [x, y, z] of A.trainLights(c).head) { night.light(130 + i * 240 + x, 140 + y, z, 40, [1, 0.95, 0.8], 3); for (const k of [1, 2, 3]) night.light(130 + i * 240 + x + 30 * k, 140 + y, 12, 40 + 10 * k, [1, 0.9, 0.65], 3.4 - k * 0.8); } });
  return [{ S: day, preset: 'golden' }, { S: night, preset: 'night' }];
};
// every effect frame (FX), the pooled particles and the live decals
views.fx = () => {
  const names = A.FX_NAMES, S = new Stage(1000, 40 + names.length * 0 + 1180);
  backdrop(S, [[0, S.G.h, 'asphalt']]);
  let x = 10, y = 10, rowH = 0;
  for (const n of names) {
    const info = A.fxInfo(n), frames = [];
    for (let f = 0; f < info.frames; f++) frames.push(timed('fx ' + n, () => A.fxSprite(n, f)));
    const w = frames.reduce((a, g) => a + g.w + 2, 0) + 70;
    if (x + w > S.G.w) { x = 10; y += rowH + 14; rowH = 0; }
    S.label(n, x, y + 6);
    let fx = x;
    for (const g of frames) { S.put(g, fx + g.ax, y + 10 + g.ay); fx += g.w + 2; rowH = Math.max(rowH, g.h + 10); }
    x = fx + 18;
  }
  for (let k = 0; k < 8; k++) S.put(A.muzzleSprite(2, k * 2, 16, 1), 60 + k * 70, y + rowH + 60);
  for (let k = 0; k < 8; k++) S.put(A.tracerSprite(k % 2 ? 'white' : 'orange', k * 2, 16, 0), 60 + k * 70, y + rowH + 130);
  return [{ S, preset: q.get('p') || 'night' }];
};

// a light check: bare asphalt, one point light per cell at heights 2..40 (to tune light strengths)
views.lighttest = () => {
  const S = new Stage(400, 100);
  backdrop(S, [[0, 100, 'asphalt']]);
  [2, 10, 20, 40].forEach((z, i) => { S.light(50 + i * 100, 50, z, 60, [1, 0.9, 0.7], 2); S.label('z ' + z, 30 + i * 100, 90); });
  return [{ S, preset: q.get('p') || 'night' }];
};
const T0 = performance.now();
const panels = (views[view] || views.line)().filter((p, i) => q.get('panel') === null || Number(q.get('panel')) === i);
const T1 = performance.now();
const wrap = document.querySelector('.wrap');
wrap.innerHTML = '';
let H = 0, Wmax = 0, nl = 0;
for (const pnl of panels) {
  const S = pnl.S, cv = document.createElement('canvas'), lab = document.createElement('canvas');
  for (const c of [cv, lab]) { c.width = S.G.w * Z; c.height = S.G.h * Z; c.style.top = H + 'px'; wrap.appendChild(c); }
  const L = new Lighter(cv); L.setScene(S.G); L.render(PRESETS[pnl.preset || P0], S.lights, 1.0);
  if (showLabels) { const g = lab.getContext('2d'); g.font = `${6 * Z}px monospace`; g.fillStyle = 'rgba(255,255,255,0.9)'; g.shadowColor = '#000'; g.shadowBlur = 3; for (const [t, x, y] of S.labels) g.fillText(t, x * Z, y * Z); }
  H += S.G.h * Z; Wmax = Math.max(Wmax, S.G.w * Z); nl += S.lights.length;
}
wrap.style.width = Wmax + 'px'; wrap.style.height = H + 'px';
const stats = Object.entries(timing).map(([k, v]) => `${k}: ${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)} ms avg x${v.length} (first ${v[0].toFixed(1)})`);
document.getElementById('t').textContent = `${view} - built in ${(T1 - T0).toFixed(0)} ms - ${nl} lights - riders: ${PEDS && PEDS.pedSprite ? 'peds.js' : 'none'}`;
document.getElementById('nav').innerHTML = Object.keys(views).map((k) => `<a href="?view=${k}">${k}</a>`).join('');
// the model table: game model -> art2 model, art footprint vs the physics footprint
window.table = Object.values(VEHICLES).sort((a, b) => a.i - b.i).map((v) => { const L = A.vehicleLights({ m: v.i }), ph = VEHICLE_ART_SIZE[v.art || v.id] || [v.L, v.W]; return [v.i, v.id, A.vehType({ m: v.i }), L.L, L.W, ph[0], ph[1]]; });
window.info = stats.join('\n');
window.done = true;
