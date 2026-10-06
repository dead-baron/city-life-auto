// Spectator mode (debug menu): a free camera over the whole world, for looking round and for
// taking screenshots of whole neighbourhoods to design over.
//
// It only draws what this browser already has: the city is generated client-side from the seed,
// so every street, lot and roof can be drawn anywhere without asking the server for anything. Live
// people and vehicles are whatever the server is already sending (around where you left your
// character) - spectating never makes the server load or spawn anything new.
//
// Close in, the world is the new renderer's (main.js hands it this camera: move() steps it, overlay()
// draws the names, grid and players over it). Further out than the new renderer can hold in memory, and
// in the schematic view, the world is drawn here as flat colour-coded shapes, one cell per tile. No old
// art anywhere.
import { T, TILE, MAP_W, MAP_H } from '../shared/constants.js';
import { teleportPlaces } from './devtp.js';

const WORLD_W = MAP_W * TILE, WORLD_H = MAP_H * TILE;
export const SPEC_LAYERS = [
  ['labels', 'Names (districts, streets, places)'], ['grid', 'Tile grid'], ['schematic', 'Schematic: flat shapes'],
];

// schematic colours: tiles, then buildings by what they are
const TILE_COL = {
  [T.ROAD]: '#3a3d44', [T.SIDEWALK]: '#c2bfb6', [T.PLAZA]: '#d6cfbf', [T.LOT]: '#8f8d88', [T.GRASS]: '#6fae4f', [T.FIELD]: '#a9c85c',
  [T.DIRT]: '#b08a5a', [T.SAND]: '#e6d39a', [T.WATER]: '#3f7fc2', [T.DEEP]: '#2b5e9c', [T.DOCK]: '#8a5c34', [T.BRIDGE]: '#6b6e76',
  [T.WALL]: '#4a4a4a', [T.FLOOR]: '#a8a29a', [T.COUNTER]: '#a8a29a', [T.BUILDING]: '#a8a29a',
};
export const SCHEMATIC_KEY = [
  ['#e07b54', 'Homes'], ['#e8c14a', 'Shops & food'], ['#d65aa8', 'Nightlife'], ['#5a8fd8', 'Civic, banks, police, hospitals'],
  ['#8e6fc4', 'Industrial & yards'], ['#a8a29a', 'Other buildings'], ['#3a3d44', 'Road'], ['#c2bfb6', 'Sidewalk'], ['#d6cfbf', 'Plaza'],
  ['#8f8d88', 'Parking / lot'], ['#6fae4f', 'Grass'], ['#3f7fc2', 'Water'],
];
function buildingCol(b) {
  const k = b.kind || '', biz = b.business || '';
  if (/^(house|apt|shanty|shack|estate|mansion|farm|home)/.test(k)) return '#e07b54';
  if (/club|neon|luna|midnight|tattoo|arcade/.test(k) || biz === 'club') return '#d65aa8';
  if (/police|hospital|fire|school|church|bank|court|civic|theatre/.test(k) || /police|hospital|bank|courthouse/.test(biz)) return '#5a8fd8';
  if (/warehouse|industrial|repair|construction|junk|site|dealer|motors|fuel|gas/.test(k)) return '#8e6fc4';
  if (/conv|strip|rest|diner|shops|market|quickstop|liquor|boutique|bistro|royale|vellori|monarch|crown|diamond|redawning|greenbistro|trail|hotel|beachbar|tackle/.test(k)) return '#e8c14a';
  return '#a8a29a';
}

export function createSpectator({ map, players, mobile }) {
  const S = {
    on: false, x: 0, y: 0, z: 0.25,
    layers: { labels: true, grid: false, schematic: false },
    keys: new Set(), panelHidden: false,
  };
  let schematic = null;

  // the schematic: one pixel per tile, buildings coloured by what they are (built once)
  function buildSchematic() {
    const cv = document.createElement('canvas');
    cv.width = MAP_W; cv.height = MAP_H;
    const g = cv.getContext('2d');
    const img = g.createImageData(MAP_W, MAP_H);
    const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const tc = {};
    for (const [t, c] of Object.entries(TILE_COL)) tc[t] = hex(c);
    const bc = map.buildings.map((b) => hex(buildingCol(b)));
    for (let i = 0; i < MAP_W * MAP_H; i++) {
      const t = map.tiles[i];
      const b = map.bld[i];
      const col = (t === T.BUILDING || t === T.FLOOR || t === T.COUNTER) && b >= 0 && bc[b] ? bc[b] : tc[t] || [20, 24, 32];
      img.data[i * 4] = col[0]; img.data[i * 4 + 1] = col[1]; img.data[i * 4 + 2] = col[2]; img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return cv;
  }

  // ---- drawing --------------------------------------------------------------------------------------
  function minZoom(W, H) { return Math.min(W / WORLD_W, H / WORLD_H) * 0.95; }

  // the flat view: cam { x, y, z } (the live camera, or a scaled copy for a hi-res snapshot); live: also
  // move the camera and draw the players
  function render(g, W, H, DPR, dt, now, cam = null) {
    const live = !cam;
    if (live) { step(dt, W, H); cam = S; }
    const z = cam.z, ox = W / 2 - cam.x * z, oy = H / 2 - cam.y * z;
    const view = { x0: cam.x - W / 2 / z, y0: cam.y - H / 2 / z, x1: cam.x + W / 2 / z, y1: cam.y + H / 2 / z };
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    g.fillStyle = '#0b1830'; g.fillRect(0, 0, W, H);
    schematic ||= buildSchematic();
    g.imageSmoothingEnabled = false;
    g.drawImage(schematic, ox, oy, WORLD_W * z, WORLD_H * z);
    if (z * TILE >= 3) outlineBuildings(g, view, z, ox, oy);
    if (S.layers.grid) drawGrid(g, view, z, ox, oy);
    if (S.layers.labels) drawLabels(g, view, z, ox, oy);
    if (live) { drawPlayers(g, z, ox, oy); S.loading = 0; }
    return 0;
  }
  // over the new renderer's picture: the names, the grid and the players (the canvas cleared to see-through)
  function overlay(g, W, H, DPR) {
    const z = S.z, ox = W / 2 - S.x * z, oy = H / 2 - S.y * z;
    const view = { x0: S.x - W / 2 / z, y0: S.y - H / 2 / z, x1: S.x + W / 2 / z, y1: S.y + H / 2 / z };
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, g.canvas.width, g.canvas.height);
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (S.layers.grid) drawGrid(g, view, z, ox, oy);
    if (S.layers.labels) drawLabels(g, view, z, ox, oy);
    drawPlayers(g, z, ox, oy);
    S.loading = 0;
  }

  // The current flat view drawn again `scale` times bigger, into a new canvas (the art view is saved as
  // the screen shows it: main.js).
  async function snapshot(W, H, scale, onProgress) {
    const z = S.z * scale, OW = Math.round(W * scale), OH = Math.round(H * scale);
    const cam = { x: S.x, y: S.y, z };
    const cv = document.createElement('canvas');
    cv.width = OW; cv.height = OH;
    const g = cv.getContext('2d', { alpha: false });
    render(g, OW, OH, 1, 0, 0, cam);
    onProgress?.(1);
    return cv;
  }
  // the biggest scale (up to 4x, at most full detail) that keeps the picture a size browsers can save
  function snapshotScale(W, H) {
    const maxSide = mobile ? 4096 : 8192, maxArea = mobile ? 16e6 : 40e6;
    for (const k of [4, 3, 2, 1.5]) if (Math.max(W, H) * k <= maxSide && W * H * k * k <= maxArea && S.z * k <= 1.5) return k;
    return 1;
  }
  // the tile rectangle on screen (so a drawing can be matched back to the map)
  function viewTiles(W, H) {
    const x0 = Math.max(0, Math.floor((S.x - W / 2 / S.z) / TILE)), y0 = Math.max(0, Math.floor((S.y - H / 2 / S.z) / TILE));
    const x1 = Math.min(MAP_W, Math.ceil((S.x + W / 2 / S.z) / TILE)), y1 = Math.min(MAP_H, Math.ceil((S.y + H / 2 / S.z) / TILE));
    return { x0, y0, x1, y1 };
  }

  function outlineBuildings(g, view, z, ox, oy) {
    g.save();
    g.lineWidth = 1; g.strokeStyle = 'rgba(0,0,0,.55)';
    g.beginPath();
    for (const b of map.buildings) {
      if (b.gone) continue;
      const x = b.tx * TILE, y = b.ty * TILE, w = b.tw * TILE, h = b.th * TILE;
      if (x > view.x1 || x + w < view.x0 || y > view.y1 || y + h < view.y0) continue;
      g.rect(Math.round(ox + x * z) + 0.5, Math.round(oy + y * z) + 0.5, Math.round(w * z), Math.round(h * z));
    }
    g.stroke();
    g.restore();
  }

  function drawGrid(g, view, z, ox, oy) {
    const step = z * TILE >= 6 ? 1 : z * TILE * 10 >= 6 ? 10 : z * TILE * 100 >= 8 ? 100 : 0;
    if (!step) return;
    g.save();
    for (const [every, col] of [[step, 'rgba(255,255,255,.12)'], [step * 10, 'rgba(255,255,255,.35)']]) {
      if (every * TILE * z < 4) continue;
      g.strokeStyle = col; g.lineWidth = 1;
      g.beginPath();
      const tx0 = Math.floor(view.x0 / TILE / every) * every, tx1 = Math.ceil(view.x1 / TILE);
      const ty0 = Math.floor(view.y0 / TILE / every) * every, ty1 = Math.ceil(view.y1 / TILE);
      for (let tx = tx0; tx <= tx1; tx += every) { const x = Math.round(ox + tx * TILE * z) + 0.5; g.moveTo(x, 0); g.lineTo(x, 99999); }
      for (let ty = ty0; ty <= ty1; ty += every) { const y = Math.round(oy + ty * TILE * z) + 0.5; g.moveTo(0, y); g.lineTo(99999, y); }
      g.stroke();
    }
    // tile coordinates along the edges, so a drawing can be matched back to the map
    const lab = step * 10;
    g.fillStyle = 'rgba(255,255,255,.85)'; g.font = '600 11px Rubik, sans-serif'; g.textBaseline = 'top'; g.textAlign = 'left';
    for (let tx = Math.ceil(view.x0 / TILE / lab) * lab; tx * TILE < view.x1; tx += lab) g.fillText(String(tx), Math.round(ox + tx * TILE * z) + 3, 3);
    for (let ty = Math.ceil(view.y0 / TILE / lab) * lab; ty * TILE < view.y1; ty += lab) g.fillText(String(ty), 3, Math.round(oy + ty * TILE * z) + 3);
    g.restore();
  }

  let places = null, streets = null;
  function drawLabels(g, view, z, ox, oy) {
    places ||= teleportPlaces(map);
    g.save();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const text = (s, x, y, size, col) => { g.font = `${size}px Anton, Impact, sans-serif`; g.lineWidth = Math.max(2, size / 5); g.strokeStyle = 'rgba(0,0,0,.85)'; g.strokeText(s, x, y); g.fillStyle = col; g.fillText(s, x, y); };
    // street names along the middle of each named stretch (once per name per ~1.5 km)
    if (z >= 0.1) {
      if (!streets) {
        streets = [];
        const seen = [];
        for (const e of map.edges || []) {
          if (!e.name || e.lvl !== 0 || !e.pts || e.pts.length < 2) continue;
          const i = Math.floor(e.pts.length / 2), a = e.pts[Math.max(0, i - 1)], b = e.pts[i];
          const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
          if (seen.some((q) => q.n === e.name && Math.hypot(q.x - x, q.y - y) < 1500)) continue;
          seen.push({ n: e.name, x, y });
          let ang = Math.atan2(b.y - a.y, b.x - a.x);
          if (ang > Math.PI / 2) ang -= Math.PI; else if (ang < -Math.PI / 2) ang += Math.PI;
          streets.push({ n: e.name, x, y, a: ang });
        }
      }
      const fs = Math.max(9, Math.min(16, 40 * z));
      g.font = `600 ${fs}px Rubik, sans-serif`;
      for (const s of streets) {
        if (s.x < view.x0 || s.x > view.x1 || s.y < view.y0 || s.y > view.y1) continue;
        g.save(); g.translate(ox + s.x * z, oy + s.y * z); g.rotate(s.a);
        g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.75)'; g.strokeText(s.n, 0, 0); g.fillStyle = '#fff'; g.fillText(s.n, 0, 0);
        g.restore();
      }
    }
    // business names on their buildings when close enough to read
    if (z >= 0.3) {
      g.font = '600 11px Rubik, sans-serif';
      for (const b of map.buildings) {
        if (!b.business || b.gone) continue;
        const x = (b.tx + b.tw / 2) * TILE, y = (b.ty + b.th / 2) * TILE;
        if (x < view.x0 || x > view.x1 || y < view.y0 || y > view.y1) continue;
        g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.8)'; g.strokeText(b.name, ox + x * z, oy + y * z); g.fillStyle = '#ffe9a8'; g.fillText(b.name, ox + x * z, oy + y * z);
      }
    }
    // districts, stations, landmarks
    const big = Math.max(12, Math.min(30, 90 * z + 8));
    for (const p of places) {
      if (p.x < view.x0 - 400 || p.x > view.x1 + 400 || p.y < view.y0 - 400 || p.y > view.y1 + 400) continue;
      if (p.kind !== 'district' && z < 0.08) continue;
      text(p.kind === 'district' ? p.name.toUpperCase() : p.name, ox + p.x * z, oy + p.y * z - (p.kind === 'district' ? 0 : 14), p.kind === 'district' ? big : Math.max(10, big * 0.6), p.kind === 'district' ? '#fff4c8' : p.kind === 'station' ? '#ffc890' : '#bfe9ff');
    }
    g.restore();
  }

  function drawPlayers(g, z, ox, oy) {
    const list = players() || [];
    g.save();
    g.font = '700 12px Rubik, sans-serif'; g.textAlign = 'center';
    for (const q of list) {
      if (q.x === undefined) continue;
      const x = ox + q.x * z, y = oy + q.y * z;
      g.fillStyle = q.me ? '#ff3e8a' : q.dead ? '#888' : '#5dff9a'; g.strokeStyle = '#000'; g.lineWidth = 2;
      g.beginPath(); g.arc(x, y, 6, 0, 6.283); g.fill(); g.stroke();
      g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.85)'; g.strokeText(q.n + (q.me ? ' (you)' : ''), x, y - 10); g.fillStyle = '#fff'; g.fillText(q.n + (q.me ? ' (you)' : ''), x, y - 10);
    }
    g.restore();
  }

  // ---- moving the camera ----------------------------------------------------------------------------
  let pad = null;
  function step(dt, W, H) {
    let mx = 0, my = 0, zoom = 0;
    const k = S.keys;
    if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) my -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) my += 1;
    if (k.has('KeyE') || k.has('Equal') || k.has('NumpadAdd')) zoom += 1;
    if (k.has('KeyQ') || k.has('Minus') || k.has('NumpadSubtract')) zoom -= 1;
    if (pad) { mx += pad.lx || 0; my += pad.ly || 0; zoom += (pad.rt || 0) - (pad.lt || 0); }
    const fast = k.has('ShiftLeft') || k.has('ShiftRight') ? 3 : 1;
    S.x += mx * 900 * fast * dt / S.z; S.y += my * 900 * fast * dt / S.z;
    if (zoom) zoomBy(Math.pow(2.4, zoom * dt), W / 2, H / 2, W, H);
    clamp(W, H);
  }
  // keep the world on screen: you can fly a little past the coast, and once the whole world fits
  // it sits in the middle
  function clamp(W, H) {
    S.z = Math.max(minZoom(W, H), Math.min(2, S.z));
    const edge = (half, world) => { const f = Math.max(0, Math.min(1, half * 4 / world - 1)); return Math.min(world / 2, half * 0.6 + f * Math.max(0, world / 2 - half * 0.6)); };
    const lx = edge(W / 2 / S.z, WORLD_W), ly = edge(H / 2 / S.z, WORLD_H);
    S.x = Math.max(lx, Math.min(WORLD_W - lx, S.x)); S.y = Math.max(ly, Math.min(WORLD_H - ly, S.y));
  }
  // zoom by k about a screen point (CSS px)
  function zoomBy(k, sx, sy, W, H) {
    const wx = S.x + (sx - W / 2) / S.z, wy = S.y + (sy - H / 2) / S.z;
    S.z = Math.max(minZoom(W, H), Math.min(2, S.z * k));
    S.x = wx - (sx - W / 2) / S.z; S.y = wy - (sy - H / 2) / S.z;
  }

  return {
    get on() { return S.on; },
    state: S,
    levelName() { return 'flat'; },
    loading() { return S.loading || 0; },
    enter(x, y) { S.on = true; S.x = x; S.y = y; S.z = 0.7; S.keys.clear(); },
    exit() { S.on = false; S.keys.clear(); schematic = null; },
    setLayer(name, on) { S.layers[name] = on; },
    render, overlay,
    move(dt, W, H) { step(dt, W, H); },
    snapshot, snapshotScale, viewTiles,
    key(code, down) { if (down) S.keys.add(code); else S.keys.delete(code); },
    pad(p) { pad = p; },
    pan(dx, dy) { S.x -= dx / S.z; S.y -= dy / S.z; },
    zoomBy,
    center(x, y) { S.x = x; S.y = y; },
    clearKeys() { S.keys.clear(); },
  };
}
