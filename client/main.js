// City Life Auto browser client: a "dumb window" that sends input vectors, predicts only
// the local character/vehicle with the shared physics, interpolates everyone else from
// authoritative snapshots, and renders the 16-bit city on a single canvas.
import { TILE, CHUNK_PX, DT, K, PF, VF, WEATHER, gameClock, MAP_W, MAP_H } from '../shared/constants.js';
import { generateCity, lightState } from '../shared/map.js';
import { pedStep, vehStep, driveInput } from '../shared/physics.js';
import { decodeSnapshot, encodeInput, MSG_SNAPSHOT, CTRL } from '../shared/protocol.js';
import { IN, quantizeAngle, quantizeAxis, dequantizeAxis, dequantizeAngle } from '../shared/input.js';
import { VEHICLE_BY_INDEX } from '../shared/vehicles.js';
import { WEAPONS, WEAPON_BY_INDEX } from '../shared/items.js';
import { lerp, lerpAngle, localToWorld } from '../shared/math.js';
import { serverUrl, TOKEN_KEY } from './config.js';
import { initInput, sample, input, takeNumberPick, settings, saveSettings, detectDevice, touchAimState, virtualTap } from './input.js';
import { GroundCache, drawOverheadProp, drawPrefabGlow } from './render/tiles.js';
import { atlas, loadAtlas, drawVehicle, drawVehicleShadow, drawCrate, drawBag, pedSprite, PED_BOX } from './render/sprites.js';
import { FX } from './render/fx.js';
import { HUD } from './hud.js';
import { initAudio, sfx } from './audio.js';

const $ = (id) => document.getElementById(id);
const canvas = $('view');
const g = canvas.getContext('2d', { alpha: false });
const lightCv = document.createElement('canvas');
const lg = lightCv.getContext('2d');

const VIEW_H = 660;           // world px visible vertically in 16:9 landscape
const INTERP_TICKS = 2.2;     // render others ~110 ms in the past

const S = {
  ws: null, token: null, pid: null, welcomed: false, playing: false, dev: false, reconnectIn: 1000,
  map: null, ground: null, hud: null, fx: new FX(),
  ents: new Map(), latestTick: 0, renderTick: 0, loopTime: 60, weather: 0,
  ctrlKind: 0, ctrlId: 0, me: null, seq: 0, pending: [], pred: null, acc: 0, lastAim: 0,
  cam: { x: 4400, y: 2200, zoom: 1, shake: 0 }, smooth: { x: 0, y: 0 }, geysers: [], flashes: [], camAlert: new Map(),
  rtt: 0, bigmap: false, rain: [], fps: 0,
};

try { S.token = localStorage.getItem(TOKEN_KEY); } catch { S.token = null; }

// ---------------------------------------------------------------------------
// Networking
// Offline practice transport: a Web Worker running the server simulation locally,
// exposed with the same interface as a WebSocket.
class WorkerSocket {
  constructor() {
    this.readyState = 0;
    this.binaryType = 'arraybuffer';
    this.w = new Worker(new URL('./practice-worker.js', import.meta.url), { type: 'module' });
    this.w.onmessage = (e) => {
      if (e.data === '{"t":"ready"}') { this.readyState = 1; this.onopen && this.onopen(); return; }
      this.onmessage && this.onmessage({ data: e.data });
    };
    this.w.onerror = (e) => { console.error('practice worker error', e.message || e); $('t-status').textContent = 'Offline practice failed to start: ' + (e.message || 'unknown error'); };
  }
  send(d) { if (d instanceof ArrayBuffer) this.w.postMessage(d, [d]); else this.w.postMessage(d); }
  close() { this.readyState = 3; this.w.terminate(); }
}

function startPractice() {
  S.practice = true;
  if (S.ws) { const old = S.ws; S.ws = null; try { old.close(); } catch { /* closing */ } }
  S.welcomed = false;
  $('t-status').textContent = 'Starting offline practice city on this device...';
  const ws = new WorkerSocket();
  S.ws = ws;
  ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', token: null }));
  ws.onmessage = (ev) => { if (typeof ev.data !== 'string') onBinary(ev.data); else { let m; try { m = JSON.parse(ev.data); } catch { return; } onText(m); } };
  S.playing = true; // jump straight in once the local city says welcome
}

function connect() {
  if (S.practice) return;
  const url = serverUrl();
  $('t-status').textContent = `Connecting to ${url.replace(/^wss?:\/\//, '').replace(/\/ws$/, '')}...`;
  let ws;
  try { ws = new WebSocket(url); } catch (e) { scheduleReconnect('Bad server address'); return; }
  ws.binaryType = 'arraybuffer';
  S.ws = ws;
  ws.onopen = () => { S.reconnectIn = 1000; ws.send(JSON.stringify({ t: 'hello', token: S.token })); };
  ws.onmessage = (ev) => {
    if (typeof ev.data !== 'string') { onBinary(ev.data); return; }
    let m; try { m = JSON.parse(ev.data); } catch { return; }
    onText(m);
  };
  ws.onclose = () => { if (S.ws === ws) scheduleReconnect('Connection lost'); };
  ws.onerror = () => {};
}

function scheduleReconnect(why) {
  if (S.practice) return;
  S.welcomed = false;
  S.ws = null;
  $('title').classList.remove('hidden');
  $('hud').classList.add('hidden');
  $('play').disabled = true;
  $('t-status').textContent = S.everConnected
    ? `${why}. Retrying in ${Math.round(S.reconnectIn / 1000)}s... (if you were mid-fight you have 30s before your ghost drops loot)`
    : `The online city isn't reachable right now (retrying every few seconds). Try PRACTICE OFFLINE below.`;
  setTimeout(connect, S.reconnectIn);
  S.reconnectIn = Math.min(15000, S.reconnectIn * 1.6);
}

function send(obj) { if (S.ws && S.ws.readyState === 1) S.ws.send(typeof obj === 'string' || obj instanceof ArrayBuffer ? obj : JSON.stringify(obj)); }

function onText(m) {
  switch (m.t) {
    case 'welcome':
      S.welcomed = true; S.pid = m.pid; S.dev = !!m.dev;
      if (!m.practice) S.everConnected = true;
      if (m.token && !m.practice) { S.token = m.token; try { localStorage.setItem(TOKEN_KEY, m.token); } catch { /* private mode */ } }
      document.body.classList.toggle('practice', !!m.practice);
      if (!S.map || S.map.seed !== (m.seed >>> 0)) setupWorld(m.seed);
      S.ents.clear(); S.pred = null; S.pending = [];
      $('t-status').textContent = m.practice ? 'Offline practice city ready' : `Signed in as ${m.name}`;
      $('play').disabled = false;
      if (S.playing) startPlaying();
      setupDev();
      break;
    case 'sp': for (const d of m.e) { const e = ent(d.id, d.k); e.d = d; } break;
    case 'ds': for (const id of m.ids) S.ents.delete(id); break;
    case 'ev': for (const ev of m.l) onEvent(ev); break;
    case 'me': S.me = m; S.hud && S.hud.setMe(m); break;
    case 'menu': S.hud.openMenu(m); break;
    case 'pong': S.rtt = performance.now() - m.ts; break;
    case 'kicked': S.hud && S.hud.toast(m.reason, 'bad'); $('t-status').textContent = m.reason; break;
    case 'full': $('t-status').textContent = `City is full (${m.max} players). Retrying soon...`; break;
    default: break;
  }
}

function ent(id, kind) {
  let e = S.ents.get(id);
  if (!e) { e = { id, kind, d: null, buf: [], walk: 0, rx: 0, ry: 0, ra: 0, flags: 0, hp: 1, parent: 0, extra: 0, lx: null, ly: null }; S.ents.set(id, e); }
  return e;
}

function onBinary(buf) {
  const dv = new DataView(buf);
  if (dv.getUint8(0) !== MSG_SNAPSHOT) return;
  const s = decodeSnapshot(dv);
  if (s.tick <= S.latestTick && S.latestTick - s.tick < 1000) return;
  S.latestTick = s.tick;
  if (Math.abs(S.renderTick - (s.tick - INTERP_TICKS)) > 8) S.renderTick = s.tick - INTERP_TICKS;
  S.loopTime = s.loopTime;
  if (s.weather !== S.weather) { S.weather = s.weather; }
  for (const it of s.ents) {
    const e = ent(it.id, it.kind);
    const lastS = e.buf[e.buf.length - 1];
    // static entities are only refreshed at 1 Hz: re-anchor so motion resumes smoothly
    if (lastS && s.tick - lastS.t > 2) e.buf.push({ t: s.tick - 1, x: lastS.x, y: lastS.y, a: lastS.a });
    e.buf.push({ t: s.tick, x: it.x, y: it.y, a: it.a });
    if (e.buf.length > 5) e.buf.shift();
    e.flags = it.flags; e.hp = it.hp; e.parent = it.parent; e.extra = it.extra;
  }
  reconcile(s);
}

// ---------------------------------------------------------------------------
// Client-side prediction for the local character / driven vehicle
function pedModsFrom(flags, speedMul) {
  return { canMove: !!(flags & 1), canSprint: !!(flags & 2), speedMul, regenMul: flags & 4 ? 2.2 : 1, staminaMax: flags & 8 ? 140 : 100, analog: true };
}

function reconcile(s) {
  S.pending = S.pending.filter((p) => p.seq > s.ack);
  const kind = s.ctrlKind === CTRL.PED ? 'ped' : s.ctrlKind === CTRL.DRIVER ? 'veh' : null;
  if (!kind) { S.pred = null; S.ctrlKind = s.ctrlKind; S.ctrlId = s.ctrlId; if (s.ctrlKind === CTRL.NONE && s.ctrlId) S.myPedId = s.ctrlId; return; }
  const switched = !S.pred || S.pred.kind !== kind || S.ctrlId !== s.ctrlId;
  S.ctrlKind = s.ctrlKind; S.ctrlId = s.ctrlId;
  if (kind === 'ped') S.myPedId = s.ctrlId;
  const old = S.pred ? { x: S.pred.s.x, y: S.pred.s.y } : null;
  let st;
  if (kind === 'ped') {
    st = { x: s.self.x, y: s.self.y, a: s.self.a, vx: s.self.vx, vy: s.self.vy, stamina: s.self.stamina, rollT: s.self.rollT, rdx: s.self.rdx, rdy: s.self.rdy, prevBits: s.prevBits };
    S.pred = { kind, s: st, mods: pedModsFrom(s.selfFlags, s.self.speedMul), prev: null };
  } else {
    const e = S.ents.get(s.ctrlId);
    const def = e && e.d ? VEHICLE_BY_INDEX[e.d.m] : null;
    if (!def) { S.pred = null; return; }
    st = { x: s.self.x, y: s.self.y, a: s.self.a, vx: s.self.vx, vy: s.self.vy, av: s.self.av };
    S.pred = { kind, s: st, def, prev: null };
  }
  for (const p of S.pending) stepPred(p);
  S.pred.prev = { ...S.pred.s };
  if (old && !switched) {
    const ex = old.x - S.pred.s.x, ey = old.y - S.pred.s.y;
    if (ex * ex + ey * ey < 140 * 140) { S.smooth.x += ex; S.smooth.y += ey; } else { S.smooth.x = 0; S.smooth.y = 0; }
  } else { S.smooth.x = 0; S.smooth.y = 0; }
}

function stepPred(inp) {
  const P = S.pred;
  if (!P) return;
  if (P.kind === 'ped') pedStep(P.s, inp, DT, S.map, P.mods);
  else vehStep(P.s, driveInput(P.s, inp), DT, S.map, P.def, { rain: S.weather === WEATHER.RAIN });
}

function fixedStep() {
  if (!S.welcomed) return;
  const selfScreen = worldToScreen(selfPos());
  const wcur = S.me ? WEAPONS[S.me.weapon] : null;
  const armed = !!(wcur && wcur.type !== 'melee' && wcur.type !== 'tool' && !(S.me && S.me.carrying));
  let inp = sample({ selfScreen, inVehicle: S.ctrlKind === CTRL.DRIVER || S.ctrlKind === CTRL.PASSENGER, lastAim: S.lastAim, armed });
  if (input.padStart && S.playing) toggleMap(!S.bigmap);
  if (!S.playing || S.hud.menuOpen || S.bigmap) inp = { bits: 0, mx: 0, my: 0, aim: inp.aim };
  if (inp.bits & IN.AIMING) { S.lastAim = inp.aim; S.lastAimAt = performance.now(); S.lastFire = !!(inp.bits & IN.FIRE); }
  S.seq++;
  const mxq = quantizeAxis(inp.mx), myq = quantizeAxis(inp.my), aq = quantizeAngle(inp.aim);
  send(encodeInput(S.seq, inp.bits, mxq, myq, aq));
  const dq = { seq: S.seq, bits: inp.bits, mx: dequantizeAxis(mxq), my: dequantizeAxis(myq), aim: dequantizeAngle(aq) };
  S.pending.push(dq);
  if (S.pending.length > 60) S.pending.shift();
  if (S.pred) { S.pred.prev = { ...S.pred.s }; stepPred(dq); }
  // predict our own melee swing so punches animate the instant you click
  if ((dq.bits & IN.FIRE) && S.pred && S.pred.kind === 'ped' && S.me && !S.me.carrying && !S.me.dead) {
    const w = WEAPONS[S.me.weapon];
    if (w && w.type === 'melee' && S.loopClock >= (S.localSwingReady || 0)) {
      const e = S.ents.get(S.ctrlId);
      if (e) { e.swingAt = S.loopClock; e.swingSide = (e.swingSide || 0) ^ 1; e.localSwing = S.loopClock; }
      S.localSwingReady = S.loopClock + w.cd;
      sfx('swing', 1);
    }
  }
  // menu navigation by gamepad / number keys
  if (S.hud.menuOpen) {
    if (input.menuNav) S.hud.navMenu(input.menuNav);
    if (input.menuSelect) S.hud.choose(S.hud.menuFocus);
    if (input.menuBack) S.hud.closeMenu();
  } else if (S.bigmap && input.menuBack) { toggleMap(false);
  }
  const n = takeNumberPick();
  if (n !== null) {
    if (S.hud.menuOpen) S.hud.choose(n);
    else if (S.me && S.me.weapons[n]) send({ t: 'weapon', id: S.me.weapons[n].id });
  }
}

// ---------------------------------------------------------------------------
// Events from the server
function distVol(x, y) { const d = Math.hypot(x - S.cam.x, y - S.cam.y); return Math.max(0, 1 - d / 1100); }

function onEvent(ev) {
  const now = S.loopClock;
  const fx = S.fx;
  switch (ev.e) {
    case 'toast': S.hud.toast(ev.text, ev.tone); if (ev.tone === 'bad') sfx('bad'); else if (ev.tone === 'good') sfx('cash', 0.6); else if (ev.tone === 'warn') sfx('alert', 0.7); break;
    case 'shot': {
      const w = WEAPON_BY_INDEX[ev.w];
      fx.tracer(ev.x1, ev.y1, ev.x2, ev.y2);
      S.flashes.push({ x: ev.x1, y: ev.y1, t: 0.06 });
      fx.spawn(4, ev.x1, ev.y1, 0, 0, 0.05, 6, '#fff3b0');
      sfx(w && (w.id === 'shotgun' || w.id === 'rifle' || w.id === 'rocket') ? 'heavy' : 'shot', distVol(ev.x1, ev.y1));
      break;
    }
    case 'blood': fx.blood(ev.x, ev.y, ev.a, ev.n, now); sfx('hit', distVol(ev.x, ev.y)); break;
    case 'death': fx.decal(5, ev.x - Math.cos(ev.a) * 4, ev.y - Math.sin(ev.a) * 4, ev.a, 14, '#6a0a10', now, 0.9); break;
    case 'crash': fx.sparks(ev.x, ev.y, 4 + Math.round(ev.p * 8)); sfx('crash', distVol(ev.x, ev.y) * (0.4 + ev.p)); if (distVol(ev.x, ev.y) > 0.8) S.cam.shake = Math.max(S.cam.shake, ev.p * 6); break;
    case 'explode': fx.explosion(ev.x, ev.y, ev.r, now); sfx('explode', distVol(ev.x, ev.y)); S.cam.shake = Math.max(S.cam.shake, 14 * distVol(ev.x, ev.y)); S.flashes.push({ x: ev.x, y: ev.y, t: 0.5, r: ev.r * 3 }); break;
    case 'spark': fx.sparks(ev.x, ev.y, 3); break;
    case 'taser': fx.tracer(ev.x1, ev.y1, ev.x2, ev.y2, 'rgba(120,200,255,'); fx.sparks(ev.x2, ev.y2, 4); sfx('taser', distVol(ev.x1, ev.y1)); break;
    case 'swing': {
      if (ev.id !== S.myPedId) sfx('swing', distVol(ev.x, ev.y));
      const a = S.ents.get(ev.id);
      if (a && !(a.localSwing && S.loopClock - a.localSwing < 0.6)) { a.swingAt = S.loopClock; a.swingSide = ev.side || 0; }
      break;
    }
    case 'hit': {
      const v = S.ents.get(ev.id);
      if (v) { v.hitAt = S.loopClock; v.hitA = ev.a; }
      fx.impact(ev.x, ev.y, ev.a);
      sfx('hit', distVol(ev.x, ev.y) * 1.2);
      if (ev.id === S.myPedId) S.cam.shake = Math.max(S.cam.shake, 5);
      else if (distVol(ev.x, ev.y) > 0.9) S.cam.shake = Math.max(S.cam.shake, 2);
      break;
    }
    case 'foot': fx.decal(2, ev.x, ev.y, ev.a, 1, '#7a0d12', now, 0.8); break;
    case 'geyser': S.geysers.push({ x: ev.x, y: ev.y, until: performance.now() + ev.d * 1000 }); fx.splash(ev.x, ev.y, 14); break;
    case 'splash': fx.splash(ev.x, ev.y); sfx('splash', distVol(ev.x, ev.y)); break;
    case 'thud': sfx('thud', distVol(ev.x, ev.y)); break;
    case 'door': sfx('door', distVol(ev.x, ev.y)); break;
    case 'loot': case 'cash': fx.ring(ev.x, ev.y, 20, 'rgba(120,255,160,'); sfx('cash', distVol(ev.x, ev.y)); break;
    case 'camera': S.camAlert.set(ev.id, performance.now() + 2500); sfx('camera', distVol(S.map.cameras[ev.id].x, S.map.cameras[ev.id].y)); break;
    case 'revive': fx.ring(ev.x, ev.y, 30, 'rgba(120,255,160,', 3); fx.floatText(ev.x, ev.y - 20, '+', '#3ddc84'); break;
    case 'poof': case 'fade': if (ev.x !== undefined) fx.ring(ev.x, ev.y, 24, 'rgba(255,255,255,'); break;
    case 'scream': fx.floatText(ev.x, ev.y - 18, 'AAAAH!', '#fff'); break;
    case 'yelp': fx.floatText(ev.x, ev.y - 18, 'WHOA!', '#ffd36b'); break;
    case 'thanks': fx.floatText(ev.x, ev.y - 18, 'Thank you!', '#3ddc84'); break;
    case 'bite': fx.splash(ev.x, ev.y, 6); sfx('bite'); break;
    case 'cast': fx.splash(ev.x, ev.y, 4); break;
    case 'catch': fx.splash(ev.x, ev.y, 12); fx.floatText(ev.x, ev.y - 20, 'Caught!', '#7de0ff'); sfx('cash'); break;
    case 'heal': fx.ring(ev.x, ev.y, 26, 'rgba(120,255,160,'); break;
    default: break;
  }
}

// ---------------------------------------------------------------------------
// World setup / UI wiring
function setupWorld(seed) {
  S.map = generateCity(seed);
  S.ground = new GroundCache(S.map);
  S.hud = new HUD(S.map, (poi, opt) => send({ t: 'menu', poi, opt }), () => {});
  S.hud.onRespawn = (choice) => send({ t: 'respawn', choice });
}

function startPlaying() {
  S.playing = true;
  initAudio();
  if (input.device === 'touch' && settings.autoFullscreen !== false) toggleFullscreen(true);
  setTimeout(maybeLandscapeTip, 600);
  $('title').classList.add('hidden');
  $('hud').classList.remove('hidden');
  if (S.me) S.hud.setMe(S.me);
}

function setupDev() {
  const box = $('dev');
  if (!S.dev) { box.classList.add('hidden'); return; }
  box.innerHTML = '<b>DEV / PLAYTEST (` to hide)</b>';
  const cmds = [['rain', 'Start rain'], ['clear', 'Stop rain'], ['night', 'Jump to night'], ['day', 'Jump to day'], ['money', '+$25k'], ['guns', 'Give weapons'],
    ['samaritan', '+50 Samaritan'], ['wanted', '2 stars', { n: 2 }], ['wanted', '4 stars', { n: 4 }], ['clean', 'Clear wanted'],
    ['car', 'Spawn pickup', { m: 'pickup' }], ['cargo', 'Loaded flatbed (cargo test)'], ['car', 'Spawn speedboat', { m: 'speedboat' }], ['car', 'Spawn sports car', { m: 'sports' }], ['drop', 'Contraband drop', { n: 4 }], ['heal', 'Heal']];
  for (const [c, label, extra] of cmds) {
    const b = document.createElement('button');
    b.textContent = label;
    b.onclick = () => send({ t: 'dev', c, ...(extra || {}) });
    box.appendChild(b);
  }
  box.classList.add('hidden');
  $('dev-btn').classList.remove('hidden');
  if (S.playing) S.hud.toast(S.practice ? 'Offline practice: nothing here is saved. Press ` (or DEV) for the cheats panel.' : 'Dev mode: press ` (backtick) for the playtest panel.', 'info');
}

$('practice').onclick = () => { initAudio(); if (input.device === 'touch' && settings.autoFullscreen !== false) toggleFullscreen(true); setTimeout(maybeLandscapeTip, 1500); startPractice(); };
$('play').onclick = () => { startPlaying(); if (S.dev) S.hud.toast('Dev mode: press ` (backtick) for the playtest panel.', 'info'); };

initInput(canvas, {
  onKey(k) {
    if (k === 'Escape') { if (S.hud?.menuOpen) S.hud.closeMenu(); if (S.bigmap) toggleMap(false); openSettings(false); }
    if (k === 'KeyM' && S.playing) toggleMap(!S.bigmap);
    if (k === 'Backquote' && S.dev) $('dev').classList.toggle('hidden');
    if (k === 'Enter' && !S.playing && S.welcomed) $('play').click();
  },
  onDev() { if (S.dev) $('dev').classList.toggle('hidden'); },
  onMap() { if (S.playing) toggleMap(!S.bigmap); },
  onSettings() { openSettings(true); },
  onFullscreen() { toggleFullscreen(); },
});
input.onDevice = () => setTimeout(() => { onResize(); if (S.hud && S.me) { $('helpbox').dataset.sig = ''; S.hud.setMe(S.me); } }, 0);
detectDevice();

// ---- fullscreen, landscape tip, settings ------------------------------------------------------
const fsSupported = !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
function isFullscreen() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
function toggleFullscreen(force) {
  const want = force ?? !isFullscreen();
  if (!fsSupported) {
    S.hud?.toast('This browser can\'t go fullscreen from a page. On iPhone: Share → Add to Home Screen, then open City Life Auto from your home screen.', 'info');
    return;
  }
  const el = document.documentElement;
  if (want && !isFullscreen()) {
    const req = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen();
    Promise.resolve(req).then(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {});
  } else if (!want && isFullscreen()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
}
for (const id of ['b-fs', 't-fs', 's-fs']) $(id).onclick = () => toggleFullscreen();
document.addEventListener('fullscreenchange', () => document.body.classList.toggle('fs', isFullscreen()));

let landTipShown = false;
function maybeLandscapeTip() {
  if (landTipShown || input.device !== 'touch' || innerHeight <= innerWidth) return;
  landTipShown = true;
  const el = $('land-tip');
  el.classList.remove('hidden', 'fade');
  setTimeout(() => el.classList.add('fade'), 4200);
  setTimeout(() => el.classList.add('hidden'), 5600);
}

function openSettings(on) {
  $('settings').classList.toggle('hidden', !on);
  if (!on) return;
  $('s-kbdrive').value = settings.kbDrive;
  $('s-edgefire').checked = settings.touchEdgeFire;
  $('s-padfire').checked = settings.padStickFire;
  $('s-vibrate').checked = settings.vibrate;
  $('s-autofs').checked = settings.autoFullscreen !== false;
}
$('s-kbdrive').onchange = (e) => { settings.kbDrive = e.target.value; saveSettings(); };
$('s-edgefire').onchange = (e) => { settings.touchEdgeFire = e.target.checked; saveSettings(); };
$('s-padfire').onchange = (e) => { settings.padStickFire = e.target.checked; saveSettings(); };
$('s-vibrate').onchange = (e) => { settings.vibrate = e.target.checked; saveSettings(); };
$('s-autofs').onchange = (e) => { settings.autoFullscreen = e.target.checked; saveSettings(); };
$('s-close').onclick = () => openSettings(false);
$('settings').onclick = (e) => { if (e.target.id === 'settings') openSettings(false); };
for (const id of ['b-settings', 't-settings']) $(id).onclick = () => openSettings(true);

function toggleMap(on) { S.bigmap = on; $('bigmap').classList.toggle('hidden', !on); $('bigmap-hint').textContent = input.device === 'touch' ? 'Tap anywhere to close' : input.device === 'gamepad' ? 'Menu / B to close' : 'M / Esc to close'; }
$('bigmap').onclick = () => toggleMap(false);
$('radar').onclick = () => { if (S.playing) toggleMap(true); };
$('weapon').addEventListener('touchstart', (e) => { e.preventDefault(); if (S.playing) virtualTap('nextw'); }, { passive: false });
$('radar').addEventListener('touchstart', (e) => { e.preventDefault(); if (S.playing) toggleMap(true); }, { passive: false });

// ---------------------------------------------------------------------------
// Rendering
let W = 0, H = 0, DPR = 1;
function onResize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = innerWidth; H = innerHeight;
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
  lightCv.width = Math.ceil(W / 2); lightCv.height = Math.ceil(H / 2);
  document.body.classList.toggle('portrait', H > W);
  if (S.playing) maybeLandscapeTip();
}
addEventListener('resize', onResize);
onResize();

function baseZoom() {
  // GDD §13: fixed 16:9 landscape scaling; portrait keeps the same pixel scale and simply
  // shows a narrow vertical strip instead of zooming in.
  const long = Math.max(W, H);
  return long / (VIEW_H * 16 / 9);
}

function selfPos() {
  const P = S.pred;
  if (P) {
    const a = Math.min(1, S.acc / DT);
    const pr = P.prev || P.s;
    return { x: lerp(pr.x, P.s.x, a) + S.smooth.x, y: lerp(pr.y, P.s.y, a) + S.smooth.y, a: lerpAngle(pr.a, P.s.a, a) };
  }
  const e = S.ents.get(S.ctrlId);
  if (e) return { x: e.rx, y: e.ry, a: e.ra };
  return { x: S.cam.x, y: S.cam.y, a: 0 };
}

function worldToScreen(p) {
  if (!p) return null;
  return { x: (p.x - S.cam.x) * S.cam.zoom + W / 2, y: (p.y - S.cam.y) * S.cam.zoom + H / 2 };
}

function interp(e, rt) {
  const b = e.buf;
  if (!b.length) return;
  let i = b.length - 1;
  while (i > 0 && b[i - 1].t > rt) i--;
  const s1 = b[i], s0 = i > 0 ? b[i - 1] : s1;
  let x, y, a;
  if (s0 === s1 || s1.t === s0.t) { x = s1.x; y = s1.y; a = s1.a; }
  else {
    const k = Math.max(0, Math.min(1, (rt - s0.t) / (s1.t - s0.t)));
    x = lerp(s0.x, s1.x, k); y = lerp(s0.y, s1.y, k); a = lerpAngle(s0.a, s1.a, k);
  }
  if (e.lx !== null) e.walk += Math.hypot(x - e.lx, y - e.ly);
  e.lx = x; e.ly = y;
  e.rx = x; e.ry = y; e.ra = a;
}

const SWING_TIME = 0.3;
function pedPose(e) {
  const f = e.flags;
  if (f & PF.DEAD) return 'dead';
  if (f & (PF.DOWN | PF.STUN)) return 'down';
  if (f & PF.ROLL) return 'roll';
  if (f & PF.FISHING) return 'fish';
  if (f & PF.CARRY) return 'carry';
  const w = WEAPON_BY_INDEX[e.extra];
  const meleeW = w && w.type === 'melee';
  if (meleeW && e.swingAt !== undefined && S.loopClock - e.swingAt < SWING_TIME) return e.extra === 0 ? 'punch' : 'swing';
  if (f & PF.ATTACK) {
    if (!meleeW) return 'aim';
  }
  if (f & PF.AIM) return 'aim';
  if (e.as > 14 || ((f & PF.MOVING) && e.as === undefined)) return 'move';
  return 'idle';
}

let last = performance.now(), fpsAcc = 0, fpsN = 0, pingAt = 0;
function frame(nowMs) {
  const dt = Math.min(0.1, (nowMs - last) / 1000);
  last = nowMs;
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 1) { S.fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
  if (S.welcomed && S.map) {
    S.acc += dt;
    let steps = 0;
    while (S.acc >= DT && steps < 4) { fixedStep(); S.acc -= DT; steps++; }
    if (steps >= 4) S.acc = 0;
    S.renderTick += dt * 20;
    const target = S.latestTick - INTERP_TICKS;
    S.renderTick += (target - S.renderTick) * Math.min(1, dt * 2);
    if (S.renderTick > S.latestTick) S.renderTick = S.latestTick;
    S.loopTime += dt;
    S.loopClock = (S.loopClock || 0) + dt;
    const k = Math.exp(-10 * dt);
    S.smooth.x *= k; S.smooth.y *= k;
    if (nowMs - pingAt > 2000) { pingAt = nowMs; send({ t: 'ping', ts: performance.now() }); }
    render(dt);
  } else {
    g.fillStyle = '#0b0d14'; g.fillRect(0, 0, canvas.width, canvas.height);
  }
  requestAnimationFrame(frame);
}

function render(dt) {
  const fx = S.fx;
  const now = S.loopClock;
  for (const e of S.ents.values()) interp(e, S.renderTick);
  // own entity follows prediction
  const sp = selfPos();
  if (S.pred) { const e = S.ents.get(S.ctrlId); if (e) { if (e.lx !== null) e.walk += Math.hypot(sp.x - e.rx, sp.y - e.ry) * 0; e.rx = sp.x; e.ry = sp.y; e.ra = sp.a; } }
  // things riding on my driven vehicle (passengers, loaded crates) follow the prediction too
  if (S.pred && S.pred.kind === 'veh') {
    for (const e of S.ents.values()) {
      if (e.kind === K.CRATE && e.parent === S.ctrlId && (e.flags & 3) === 2) {
        const sl = S.pred.def.slots[e.extra];
        if (sl) { const [x, y] = localToWorld(sp.x, sp.y, sp.a, sl[0], sl[1]); e.rx = x; e.ry = y; e.ra = sp.a; }
      }
    }
  }
  // walk-cycle phase from how far each ped actually moved on screen this frame: continuous
  // across walk <-> run (stride length eases with speed), so the loop never jumps
  for (const e of S.ents.values()) {
    if (e.kind !== K.PED) continue;
    if (e.ax === undefined) { e.ax = e.rx; e.ay = e.ry; e.as = 0; e.phase = 0; continue; }
    let d = Math.hypot(e.rx - e.ax, e.ry - e.ay);
    if (d > 60) d = 0; // teleport / respawn
    e.ax = e.rx; e.ay = e.ry;
    const v = d / Math.max(dt, 1e-3);
    e.as += (v - e.as) * (1 - Math.exp(-(v > e.as ? 12 : 7) * dt));
    const blend = Math.max(0, Math.min(1, (e.as - 70) / 110));
    e.phase = (e.phase + d / (4.6 + blend * 2.4)) % 8;
  }
  // camera
  let speed = 0;
  if (S.pred && S.pred.kind === 'veh') speed = Math.hypot(S.pred.s.vx, S.pred.s.vy);
  else if (S.ctrlKind === CTRL.PASSENGER) { const e = S.ents.get(S.ctrlId); if (e && e.buf.length > 1) { const b = e.buf; speed = Math.hypot(b[b.length - 1].x - b[b.length - 2].x, b[b.length - 1].y - b[b.length - 2].y) * 20; } }
  const targetZoom = baseZoom() / (1 + Math.min(0.5, speed / 1300));
  S.cam.zoom += (targetZoom - S.cam.zoom) * Math.min(1, dt * 2.5);
  const lead = Math.min(140, speed * 0.25);
  const tx = sp.x + Math.cos(sp.a) * lead, ty = sp.y + Math.sin(sp.a) * lead;
  if (Math.hypot(tx - S.cam.x, ty - S.cam.y) > 1500) { S.cam.x = tx; S.cam.y = ty; }
  S.cam.x += (tx - S.cam.x) * Math.min(1, dt * 8);
  S.cam.y += (ty - S.cam.y) * Math.min(1, dt * 8);
  {
    // keep the camera inside the world (no black void past the map edge)
    const hw = W / 2 / S.cam.zoom, hh = H / 2 / S.cam.zoom, WW = MAP_W * TILE, WH = MAP_H * TILE;
    S.cam.x = hw * 2 >= WW ? WW / 2 : Math.max(hw, Math.min(WW - hw, S.cam.x));
    S.cam.y = hh * 2 >= WH ? WH / 2 : Math.max(hh, Math.min(WH - hh, S.cam.y));
  }
  S.cam.shake *= Math.exp(-6 * dt);
  const shx = (Math.random() - 0.5) * S.cam.shake, shy = (Math.random() - 0.5) * S.cam.shake;

  const z = S.cam.zoom;
  const halfW = W / 2 / z, halfH = H / 2 / z;
  const view = { x0: S.cam.x - halfW - 64, x1: S.cam.x + halfW + 64, y0: S.cam.y - halfH - 64, y1: S.cam.y + halfH + 64 };
  const clock = gameClock(S.loopTime);
  const rain = S.weather === WEATHER.RAIN;

  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  g.fillStyle = '#10141c'; g.fillRect(0, 0, W, H);
  // crisp nearest-neighbour pixels at gameplay zoom; filtered only when zoomed out (fast driving)
  // so minified art doesn't shimmer
  g.imageSmoothingEnabled = z < 0.92;
  g.setTransform(DPR * z, 0, 0, DPR * z, DPR * (W / 2 - S.cam.x * z + shx), DPR * (H / 2 - S.cam.y * z + shy));
  S.worldTf = [DPR * z, 0, 0, DPR * z, DPR * (W / 2 - S.cam.x * z + shx), DPR * (H / 2 - S.cam.y * z + shy)];

  // ground chunks
  const cx0 = Math.floor(view.x0 / CHUNK_PX), cx1 = Math.floor(view.x1 / CHUNK_PX), cy0 = Math.floor(view.y0 / CHUNK_PX), cy1 = Math.floor(view.y1 / CHUNK_PX);
  S.chunkView = [cx0, cx1, cy0, cy1];
  for (let cy = Math.max(0, cy0); cy <= Math.min(Math.ceil(MAP_H * TILE / CHUNK_PX) - 1, cy1); cy++)
    for (let cx = Math.max(0, cx0); cx <= Math.min(Math.ceil(MAP_W * TILE / CHUNK_PX) - 1, cx1); cx++)
      g.drawImage(S.ground.get(cx, cy), cx * CHUNK_PX, cy * CHUNK_PX, CHUNK_PX + 0.5, CHUNK_PX + 0.5);
  g.imageSmoothingEnabled = true;

  // animated water glints
  drawWaterGlints(view, now);
  if (rain) { g.fillStyle = 'rgba(30,50,80,0.16)'; g.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0); }
  fx.drawDecals(g, view, now, rain);

  const vis = (e) => e.rx > view.x0 - 100 && e.rx < view.x1 + 100 && e.ry > view.y0 - 100 && e.ry < view.y1 + 100;
  const peds = [], vehs = [], crates = [], bags = [], projs = [];
  for (const e of S.ents.values()) {
    if (!vis(e) || !e.d) continue;
    if (e.kind === K.PED) peds.push(e);
    else if (e.kind === K.VEH) vehs.push(e);
    else if (e.kind === K.CRATE) crates.push(e);
    else if (e.kind === K.BAG) bags.push(e);
    else if (e.kind === K.PROJ) projs.push(e);
  }
  if (rain) drawWetReflections(view, vehs, clock.dark, now, dt);

  for (const b of bags) { g.save(); g.translate(b.rx, b.ry); g.rotate(b.ra); drawBag(g, b.d.t, now); g.restore(); }
  for (const c of crates) if ((c.flags & 3) === 0) drawCrateEnt(c, now);
  // downed / dead peds under vehicles
  for (const p of peds) if (p.flags & (PF.DEAD | PF.DOWN | PF.STUN)) drawPed(p, now);
  for (const v of vehs) drawVehicleEnt(v, now, dt);
  for (const c of crates) if ((c.flags & 3) === 2) drawCrateEnt(c, now);
  for (const p of peds) if (!(p.flags & (PF.DEAD | PF.DOWN | PF.STUN))) drawPed(p, now);
  for (const c of crates) if ((c.flags & 3) === 1) drawCrateEnt(c, now);
  for (const pr of projs) { g.save(); g.translate(pr.rx, pr.ry); g.rotate(pr.ra); g.fillStyle = '#4a5a2a'; g.fillRect(-8, -3, 16, 6); g.fillStyle = '#c8262b'; g.fillRect(6, -3, 3, 6); g.restore(); fx.fire(pr.rx - Math.cos(pr.ra) * 10, pr.ry - Math.sin(pr.ra) * 10); fx.smoke(pr.rx, pr.ry, false); }

  // geysers
  const nowMs = performance.now();
  S.geysers = S.geysers.filter((gy) => gy.until > nowMs);
  for (const gy of S.geysers) fx.geyser(gy.x, gy.y);

  // traffic lights, cameras, overhead canopy
  drawSignals(view);
  for (let cy = Math.max(0, cy0); cy <= cy1; cy++) for (let cx = Math.max(0, cx0); cx <= cx1; cx++)
    for (const p of S.ground.overhead(cx, cy)) if (p.x > view.x0 - 40 && p.x < view.x1 + 40 && p.y > view.y0 - 40 && p.y < view.y1 + 40) drawOverheadProp(g, p, clock.dark > 0.3);

  updateBirds(dt, view, vehs, peds);
  fx.update(dt);
  fx.drawParticles(g);

  // aim sight for sticks / touch (the mouse has its own cursor)
  if (input.device !== 'keyboard' && S.playing && S.me && !S.me.dead && performance.now() - (S.lastAimAt || 0) < 250) {
    const ta = touchAimState();
    const fire = S.lastFire || ta.firing;
    const a = S.lastAim, x0 = sp.x + Math.cos(a) * 22, y0 = sp.y + Math.sin(a) * 22;
    g.save();
    g.strokeStyle = fire ? 'rgba(255,70,60,.85)' : 'rgba(255,255,255,.55)';
    g.lineWidth = 2; g.setLineDash([6, 6]); g.lineDashOffset = -now * 40;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(sp.x + Math.cos(a) * 190, sp.y + Math.sin(a) * 190); g.stroke();
    g.setLineDash([]);
    g.beginPath(); g.arc(sp.x + Math.cos(a) * 190, sp.y + Math.sin(a) * 190, fire ? 7 : 5, 0, 6.28); g.stroke();
    g.restore();
  }

  // name tags + public flares + rumor marker
  drawWorldLabels(peds, vehs, now, z);

  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  drawLighting(clock.dark, view, vehs, peds, z, dt);
  if (rain) drawRain(dt);

  // HUD bits
  const dist = S.map.districtAt(sp.x, sp.y);
  if (dist.name !== S.district) {
    if (S.distCand === dist.name) { if (performance.now() - S.distCandAt > 600) { S.district = dist.name; S.hud.showDistrict(dist.name, dist.isl); } }
    else { S.distCand = dist.name; S.distCandAt = performance.now(); }
  }
  S.hud.setClock(S.loopTime, S.weather);
  S.hud.drawRadar(sp.x, sp.y, sp.a);
  {
    const showTouch = input.device === 'touch' && S.playing;
    if (showTouch !== S.uiTouch) { S.uiTouch = showTouch; $('touch').classList.toggle('hidden', !showTouch); }
    const inVeh = S.ctrlKind === CTRL.DRIVER || S.ctrlKind === CTRL.PASSENGER;
    if (inVeh !== S.uiInVeh) { S.uiInVeh = inVeh; document.body.classList.toggle('in-veh', inVeh); }
    const dead = !!(S.me && S.me.dead);
    if (dead !== S.uiDead) { S.uiDead = dead; document.body.classList.toggle('dead', dead); }
    if (S.pred && S.pred.kind === 'ped') { const st = Math.round(S.pred.s.stamina); if (st !== S.uiSt) { S.uiSt = st; $('st-fill').style.width = Math.min(100, st / ((S.pred.mods && S.pred.mods.staminaMax) || 100) * 100) + '%'; } }
  }
  if (S.bigmap) S.hud.drawBigMap(sp.x, sp.y, sp.a);
  if ((nowMs | 0) % 500 < 20) S.hud.setNet(`${S.practice ? 'OFFLINE PRACTICE · ' : ''}${S.fps} fps · ${Math.round(S.rtt)} ms · ${S.ents.size} ents`);
}

// Urban wildlife (GDD §10): client-side pigeons/gulls that scatter from cars and runners.
const birds = [];
function updateBirds(dt, view, vehs, peds) {
  const m = S.map;
  if (birds.length < 14 && Math.random() < 0.15) {
    const x = view.x0 + Math.random() * (view.x1 - view.x0), y = view.y0 + Math.random() * (view.y1 - view.y0);
    const t = m.tileAtPx(x, y);
    const near = Math.hypot(x - S.cam.x, y - S.cam.y) > 260;
    if (near && (t === 2 || t === 4 || t === 3 || t === 8 || t === 9)) birds.push({ x, y, a: Math.random() * 6.28, fly: 0, vx: 0, vy: 0, gull: t === 8 || t === 9, peck: Math.random() * 3 });
  }
  for (let i = birds.length - 1; i >= 0; i--) {
    const b = birds[i];
    if (b.x < view.x0 - 300 || b.x > view.x1 + 300 || b.y < view.y0 - 300 || b.y > view.y1 + 300) { birds.splice(i, 1); continue; }
    if (!b.fly) {
      b.peck += dt;
      for (const v of vehs) if (Math.hypot(v.rx - b.x, v.ry - b.y) < 110) { b.fly = 1; break; }
      if (!b.fly) for (const p of peds) if ((p.flags & PF.MOVING) && Math.hypot(p.rx - b.x, p.ry - b.y) < 45) { b.fly = 1; break; }
      if (b.fly) { const a = Math.random() * 6.28; b.vx = Math.cos(a) * 230; b.vy = Math.sin(a) * 230; b.a = a; }
    } else { b.x += b.vx * dt; b.y += b.vy * dt; b.fly += dt; if (b.fly > 4) { birds.splice(i, 1); continue; } }
    g.save(); g.translate(b.x, b.y); g.rotate(b.a);
    const s = b.fly ? 1.4 : 1;
    g.fillStyle = 'rgba(0,0,0,.25)'; if (b.fly) g.fillRect(-3 + b.fly * 6, 4 + b.fly * 6, 6, 3);
    g.fillStyle = b.gull ? '#f2f2f2' : '#8a8f9a';
    g.beginPath(); g.ellipse(0, 0, 4 * s, 2.6 * s, 0, 0, 6.28); g.fill();
    if (b.fly) { const w = Math.sin(b.fly * 30) * 5; g.fillRect(-2, -2.5 - 4 - w * 0.4, 4, 4 + w * 0.4); g.fillRect(-2, 2.5, 4, 4 + w * 0.4); }
    g.fillStyle = b.gull ? '#ffc23d' : '#3a3f4a'; g.beginPath(); g.arc(3.5 * s, Math.sin(b.peck * 6) * 0.6, 1.6 * s, 0, 6.28); g.fill();
    g.restore();
  }
}

function drawWaterGlints(view, now) {
  g.fillStyle = 'rgba(255,255,255,.35)';
  const t0 = Math.floor(view.x0 / TILE), t1 = Math.floor(view.x1 / TILE), u0 = Math.floor(view.y0 / TILE), u1 = Math.floor(view.y1 / TILE);
  for (let ty = u0; ty <= u1; ty += 2) for (let tx = t0; tx <= t1; tx += 2) {
    const t = S.map.tileAt(tx, ty);
    if (t !== 6 && t !== 7) continue;
    const ph = (now * 0.8 + ((tx * 7 + ty * 13) % 10) / 10) % 1;
    if (ph > 0.5) continue;
    g.fillRect(tx * TILE + ((tx * 11) % 24), ty * TILE + ((ty * 5) % 24) + ph * 6, 6, 1.5);
  }
}

function drawCrateEnt(c, now) {
  const lift = (c.flags & 3) === 0 ? c.hp * 64 : (c.flags & 3) === 1 ? 6 : 0;
  g.save();
  if (lift > 1) { g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(c.rx + 3, c.ry + 3, 13, 10, 0, 0, 6.28); g.fill(); }
  g.translate(c.rx, c.ry - lift * 0.6);
  g.rotate(c.ra);
  const sc = 1 + lift / 120;
  g.scale(sc, sc);
  drawCrate(g, c.d.t, c.d.l, now);
  g.restore();
  if (c.d.t >= 3 && (c.flags & 3) === 0) {
    g.save(); g.globalAlpha = 0.5 + 0.3 * Math.sin(now * 4);
    g.strokeStyle = c.d.t === 4 ? '#ffd36b' : '#c07aff'; g.lineWidth = 2;
    g.beginPath(); g.arc(c.rx, c.ry, 18, 0, 6.28); g.stroke(); g.restore();
  }
}

const SEAT_BIKE = [[2, 0], [-12, 0]];
const PED_SCALE = 1.35; // characters read at ~40% of a sedan's length, like the concept scenes
function drawVehicleEnt(v, now, dt) {
  const def = VEHICLE_BY_INDEX[v.d.m];
  if (!def) return;
  const f = v.flags;
  g.save();
  g.translate(v.rx, v.ry);
  g.rotate(v.ra);
  if (def.kind !== 'boat') drawVehicleShadow(g, v.d, def);
  drawVehicle(g, v.d, def, f);
  const L = def.L, Wd = def.W;
  if (f & VF.BLOODY) { g.fillStyle = 'rgba(120,10,16,.85)'; for (let k = 0; k < 5; k++) { const h = ((v.id * 13 + k * 7) % 17) / 17; g.beginPath(); g.arc(L * 0.3 + h * L * 0.15, -Wd * 0.3 + ((k * 0.37 + h) % 1) * Wd * 0.6, 2 + h * 3, 0, 6.28); g.fill(); } }
  if (f & VF.BRAKE) { g.fillStyle = 'rgba(255,40,40,.9)'; g.fillRect(-L / 2 - 1, -Wd / 2 + 4, 3, 6); g.fillRect(-L / 2 - 1, Wd / 2 - 10, 3, 6); }
  if (f & VF.REVERSE) { g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(-L / 2 - 1, -Wd / 2 + 10, 2, 4); g.fillRect(-L / 2 - 1, Wd / 2 - 14, 2, 4); }
  if (f & VF.SIREN) {
    const ph = Math.floor(now * 6) % 2;
    g.globalAlpha = 0.9;
    g.fillStyle = ph ? '#ff2a2a' : '#2a6aff'; g.beginPath(); g.arc(-2, -6, 6, 0, 6.28); g.fill();
    g.fillStyle = ph ? '#2a6aff' : '#ff2a2a'; g.beginPath(); g.arc(-2, 6, 6, 0, 6.28); g.fill();
    g.globalAlpha = 1;
  }
  if (f & VF.WRECK) { g.fillStyle = 'rgba(10,8,6,.62)'; g.fillRect(-L / 2, -Wd / 2, L, Wd); }
  g.restore();
  // riders on bikes are visible
  if (def.kind === 'bike') {
    for (const p of S.ents.values()) if (p.kind === K.PED && p.parent === v.id && p.d && !(p.flags & PF.DEAD)) {
      const seat = SEAT_BIKE[0];
      const [x, y] = localToWorld(v.rx, v.ry, v.ra, seat[0], seat[1]);
      const spr = pedSprite(p.d.app, 'idle', 0, 0);
      g.save(); g.translate(x, y); g.rotate(v.ra); g.drawImage(spr, -PED_BOX / 2 * 0.9, -PED_BOX / 2 * 0.9, PED_BOX * 0.9, PED_BOX * 0.9); g.restore();
    }
  }
  // particles: smoke, fire, drift, boat wake, siren audio
  const fwdX = Math.cos(v.ra), fwdY = Math.sin(v.ra);
  if ((f & VF.SMOKE) && Math.random() < 0.3) S.fx.smoke(v.rx + fwdX * def.L * 0.35, v.ry + fwdY * def.L * 0.35, !!(f & VF.WRECK));
  if ((f & VF.BURN) && Math.random() < 0.7) S.fx.fire(v.rx + fwdX * def.L * 0.2, v.ry + fwdY * def.L * 0.2);
  if (f & VF.DRIFT && def.kind !== 'boat') {
    for (const sgn of [-1, 1]) {
      const [x, y] = localToWorld(v.rx, v.ry, v.ra, -def.L * 0.35, sgn * def.W * 0.38);
      S.fx.decal(4, x, y, v.ra, 1, '#111', S.loopClock, 0.5);
    }
    if (Math.random() < 0.4) S.fx.smoke(v.rx - fwdX * def.L * 0.4, v.ry - fwdY * def.L * 0.4, false);
  }
  if (def.kind === 'boat' && v.buf.length > 1) {
    const b = v.buf; const sp = Math.hypot(b[b.length - 1].x - b[b.length - 2].x, b[b.length - 1].y - b[b.length - 2].y);
    if (sp > 2 && Math.random() < 0.8) S.fx.spawn(5, v.rx - fwdX * def.L * 0.5, v.ry - fwdY * def.L * 0.5, (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40, 0.7, 3, '#e8f6ff');
  }
  if (f & VF.SIREN) sfx('siren', distVol(v.rx, v.ry) * 0.7);
  if (f & VF.HORN) sfx('horn', distVol(v.rx, v.ry));
  void dt;
}

function drawPed(p, now) {
  const f = p.flags;
  if (f & PF.INVEH) return;
  const pose = pedPose(p);
  let fr = pose === 'move' || pose === 'carry' ? Math.floor(p.phase || 0) % 8 : pose === 'roll' ? Math.floor(now * 12) % 4 : pose === 'idle' ? Math.floor(now * 1.5 + p.id) % 8 : pose === 'down' && (f & PF.STUN) ? 1 : 0;
  if (pose === 'punch' || pose === 'swing') fr = Math.min(3, Math.floor(((now - p.swingAt) / SWING_TIME) * 4)) + (p.swingSide ? 4 : 0);
  const lvl = (p.as || 0) < 62 ? 0 : p.as < 112 ? 1 : p.as < 165 ? 2 : 3;
  const spr = pedSprite(p.d.app, pose === 'move' ? 'move' + lvl : pose, fr, p.extra);
  const hitK = p.hitAt !== undefined ? Math.max(0, 1 - (now - p.hitAt) / 0.22) : 0;
  g.save();
  g.translate(p.rx + (hitK ? Math.cos(p.hitA) * 5 * hitK : 0), p.ry + (hitK ? Math.sin(p.hitA) * 5 * hitK : 0));
  g.rotate(p.ra + (hitK ? 0.25 * hitK : 0));
  if (pose === 'punch' && (fr & 3) === 2) { g.translate(3, 0); }
  if (f & PF.GHOST) g.globalAlpha = 0.45 + 0.2 * Math.sin(now * 8);
  g.scale(PED_SCALE, PED_SCALE);
  g.imageSmoothingEnabled = false; // crisp pixel-art characters
  g.drawImage(spr, -PED_BOX / 2, -PED_BOX / 2, PED_BOX, PED_BOX);
  if (hitK > 0.4) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = (hitK - 0.4); g.drawImage(spr, -PED_BOX / 2, -PED_BOX / 2, PED_BOX, PED_BOX); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
  g.imageSmoothingEnabled = true;
  if (pose === 'fish') { g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(24, -6); g.lineTo(44, 0); g.stroke(); }
  g.restore();
  if (f & PF.UMBRELLA) { const u = umbrellaSprite(p.id % UMBRELLA_COLORS.length); g.drawImage(u, p.rx - 21, p.ry - 23, 40, 40); }
  if ((f & PF.BLEED) && Math.random() < 0.08) S.fx.spawn(1, p.rx, p.ry, 0, 0, 0.3, 2, '#9a0f14');
  if (f & PF.STUN && Math.random() < 0.3) S.fx.spawn(4, p.rx + (Math.random() - 0.5) * 14, p.ry + (Math.random() - 0.5) * 14, 0, 0, 0.15, 2, '#9fdcff');
}

function drawSignals(view) {
  for (const n of S.map.nodes) {
    if (!n.light || n.x < view.x0 - 100 || n.x > view.x1 + 100 || n.y < view.y0 - 100 || n.y > view.y1 + 100) continue;
    const ls = lightState(n, S.loopTime);
    const col = (s) => (s === 'G' ? '#3ddc84' : s === 'Y' ? '#ffc23d' : '#ff3b3b');
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x = n.x + dx * 78, y = n.y + dy * 78;
      g.fillStyle = '#111'; g.fillRect(x - 5, y - 5, 10, 10);
      // corner head faces the approaching N/S traffic on one side and E/W on the other
      g.fillStyle = col((dx * dy > 0) ? ls.ns : ls.ew);
      g.beginPath(); g.arc(x, y, 3.2, 0, 6.28); g.fill();
    }
  }
  const nowMs = performance.now();
  for (const c of S.map.cameras) {
    if (c.x < view.x0 || c.x > view.x1 || c.y < view.y0 || c.y > view.y1) continue;
    const alert = (S.camAlert.get(c.id) || 0) > nowMs;
    g.fillStyle = '#2a2d36'; g.fillRect(c.x - 7, c.y - 5, 14, 10); g.fillStyle = '#555'; g.fillRect(c.x + 5, c.y - 2, 6, 4);
    const on = alert ? Math.floor(nowMs / 120) % 2 : Math.floor(nowMs / 900) % 2;
    if (on) { g.fillStyle = alert ? '#ff2a2a' : '#3b8aff'; g.beginPath(); g.arc(c.x - 3, c.y, 2.5, 0, 6.28); g.fill(); }
    if (alert) { g.fillStyle = 'rgba(255,40,40,.12)'; g.beginPath(); g.arc(c.x, c.y, c.r * 0.6, 0, 6.28); g.fill(); }
  }
}

function drawWorldLabels(peds, vehs, now, z) {
  const fs = 12 / z;
  g.textAlign = 'center';
  g.font = `bold ${fs}px monospace`;
  for (const p of peds) {
    if (p.flags & PF.INVEH && !p.d.pl) continue;
    if (p.flags & PF.FLARE) {
      // GDD §6: 3-second public red exclamation flare above a reported suspect
      const bob = Math.sin(now * 10) * 3 / z;
      g.fillStyle = '#000'; g.font = `bold ${30 / z}px monospace`; g.fillText('!', p.rx + 1.5 / z, p.ry - 30 / z + bob + 1.5 / z);
      g.fillStyle = Math.floor(now * 8) % 2 ? '#ff2020' : '#ff7070'; g.fillText('!', p.rx, p.ry - 30 / z + bob);
      g.font = `bold ${fs}px monospace`;
    }
    if (p.d.pl && p.d.n && p.id !== S.myPedId) {
      const y = p.ry - 26 / z;
      g.fillStyle = 'rgba(0,0,0,.6)'; g.fillText(p.d.n, p.rx + 1 / z, y + 1 / z);
      g.fillStyle = p.flags & PF.BADGE ? '#7ab0ff' : '#fff'; g.fillText(p.d.n, p.rx, y);
      if (p.hp < 0.999 && !(p.flags & PF.DEAD)) { g.fillStyle = '#000'; g.fillRect(p.rx - 14 / z, y + 3 / z, 28 / z, 3 / z); g.fillStyle = '#ff4d5e'; g.fillRect(p.rx - 14 / z, y + 3 / z, 28 / z * p.hp, 3 / z); }
    }
  }
  const me = S.me;
  if (me && me.rumor) {
    const r = me.rumor;
    g.globalAlpha = 0.18 + 0.1 * Math.sin(now * 3);
    g.strokeStyle = r.t === 4 ? '#ffd36b' : '#c07aff'; g.lineWidth = 4 / z; g.setLineDash([12 / z, 10 / z]);
    g.beginPath(); g.arc(r.x, r.y, r.r, 0, 6.28); g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
  }
  if (me && me.job) {
    g.fillStyle = '#ffd400'; g.strokeStyle = '#000'; g.lineWidth = 2 / z;
    const bob = Math.sin(now * 4) * 5;
    g.beginPath(); g.moveTo(me.job.x, me.job.y - 20 + bob); g.lineTo(me.job.x - 10, me.job.y - 40 + bob); g.lineTo(me.job.x + 10, me.job.y - 40 + bob); g.closePath(); g.fill(); g.stroke();
  }
  void vehs;
}

function drawLighting(dark, view, vehs, peds, z, dt) {
  S.flashes = S.flashes.filter((f) => (f.t -= dt) > 0);
  if (dark < 0.02 && !S.flashes.length) return;
  const lw = lightCv.width, lh = lightCv.height;
  const toL = (x, y) => [((x - S.cam.x) * z + W / 2) / 2, ((y - S.cam.y) * z + H / 2) / 2];
  const zz = z / 2;
  lg.globalCompositeOperation = 'source-over';
  lg.clearRect(0, 0, lw, lh);
  lg.fillStyle = `rgba(14,16,52,${(0.74 * dark).toFixed(3)})`;
  lg.fillRect(0, 0, lw, lh);
  lg.globalCompositeOperation = 'destination-out';
  const hole = (x, y, r, a = 1) => {
    const [lx, ly] = toL(x, y);
    const rr = r * zz;
    if (lx < -rr || ly < -rr || lx > lw + rr || ly > lh + rr) return;
    const gr = lg.createRadialGradient(lx, ly, 0, lx, ly, rr);
    gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    lg.fillStyle = gr; lg.fillRect(lx - rr, ly - rr, rr * 2, rr * 2);
  };
  if (dark > 0.02) {
    for (const l of S.map.lamps) if (l.x > view.x0 - 120 && l.x < view.x1 + 120 && l.y > view.y0 - 120 && l.y < view.y1 + 120) hole(l.x, l.y, 120, 0.85);
    for (const p of S.map.pois) if (p.x > view.x0 - 100 && p.x < view.x1 + 100 && p.y > view.y0 - 100 && p.y < view.y1 + 100) hole(p.x, p.y - 20, 95, 0.75);
    for (const v of vehs) {
      if (!(v.flags & VF.LIGHTS)) continue;
      const def = VEHICLE_BY_INDEX[v.d.m];
      const [lx, ly] = toL(v.rx, v.ry);
      lg.save(); lg.translate(lx, ly); lg.rotate(v.ra);
      const len = 260 * zz, w0 = def.W * 0.4 * zz, w1 = 120 * zz;
      const gr = lg.createLinearGradient(def.L / 2 * zz, 0, def.L / 2 * zz + len, 0);
      gr.addColorStop(0, 'rgba(0,0,0,.95)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      lg.fillStyle = gr; lg.beginPath();
      lg.moveTo(def.L / 2 * zz, -w0); lg.lineTo(def.L / 2 * zz + len, -w1); lg.lineTo(def.L / 2 * zz + len, w1); lg.lineTo(def.L / 2 * zz, w0); lg.closePath(); lg.fill();
      lg.restore();
      hole(v.rx, v.ry, def.L * 0.7, 0.5);
    }
    const sp = selfPos();
    hole(sp.x, sp.y, 70, 0.35);
  }
  for (const f of S.flashes) hole(f.x, f.y, f.r || 90, Math.min(1, f.t * 10));
  lg.globalCompositeOperation = 'source-over';
  g.imageSmoothingEnabled = true;
  g.drawImage(lightCv, 0, 0, W, H);
  if (dark > 0.05) drawNightGlow(dark);
  // additive colour: lamp glow, sirens, neon
  if (dark > 0.02) {
    g.globalCompositeOperation = 'lighter';
    for (const l of S.map.lamps) {
      if (l.x < view.x0 || l.x > view.x1 || l.y < view.y0 || l.y > view.y1) continue;
      const s = worldToScreen(l);
      const gr = g.createRadialGradient(s.x, s.y, 0, s.x, s.y, 95 * z);
      gr.addColorStop(0, `rgba(255,196,96,${0.3 * dark})`); gr.addColorStop(0.5, `rgba(255,170,70,${0.1 * dark})`); gr.addColorStop(1, 'rgba(255,170,70,0)');
      g.fillStyle = gr; g.fillRect(s.x - 95 * z, s.y - 95 * z, 190 * z, 190 * z);
    }
    for (const v of vehs) {
      if (!(v.flags & VF.SIREN)) continue;
      const s = worldToScreen({ x: v.rx, y: v.ry });
      const ph = Math.floor(S.loopClock * 6) % 2;
      const gr = g.createRadialGradient(s.x, s.y, 0, s.x, s.y, 110 * z);
      gr.addColorStop(0, ph ? 'rgba(255,40,40,.35)' : 'rgba(40,90,255,.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(s.x - 110 * z, s.y - 110 * z, 220 * z, 220 * z);
    }
    g.globalCompositeOperation = 'source-over';
  }
  void peds;
}

// ---- night: lit windows, neon and lobby light from the per-lot emissive layer ------------------
function drawNightGlow(dark) {
  if (!S.worldTf || !atlas.prefabGlow || !atlas.prefabGlow.length) return;
  g.save();
  g.setTransform(...S.worldTf);
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = Math.min(1, dark * 0.85);
  g.imageSmoothingEnabled = true;
  const [cx0, cx1, cy0, cy1] = S.chunkView;
  const seen = new Set();
  for (let cy = Math.max(0, cy0); cy <= cy1; cy++) for (let cx = Math.max(0, cx0); cx <= cx1; cx++)
    for (const p of S.ground.prefabsAt(cx, cy)) { if (seen.has(p)) continue; seen.add(p); drawPrefabGlow(g, p); }
  g.restore();
}

// ---- rain: broken light streaks reflected in wet asphalt (head/tail lights, lamps, shopfronts) ------
function reflect(x, y, len, w, rgb, a) {
  for (let k = 0, n = Math.max(3, len / 5 | 0); k < n; k++) {
    const t = k / n, j = Math.sin(x * 0.7 + y * 1.3 + k * 2.1 + S.loopClock * 9) * 0.5 + 0.5;
    const ww = w * (1 - t * 0.7) * (0.55 + 0.45 * j);
    g.fillStyle = `rgba(${rgb},${(a * (1 - t) * (0.6 + 0.4 * j)).toFixed(3)})`;
    g.fillRect(x - ww / 2 + (j - 0.5) * 3, y + k * 5, ww, 3);
  }
}
function drawWetReflections(view, vehs, dark, now, dt) {
  const k = 0.35 + 0.65 * dark;
  g.save();
  g.globalCompositeOperation = 'lighter';
  for (const v of vehs) {
    const def = VEHICLE_BY_INDEX[v.d.m];
    if (!def || def.kind === 'boat') continue;
    const c = Math.cos(v.ra), sn = Math.sin(v.ra), L = def.L / 2 - 3, Wd = def.W / 2 - 6;
    const lit = v.flags & VF.LIGHTS, brake = v.flags & VF.BRAKE;
    for (const side of [-1, 1]) {
      const hx = v.rx + c * L - sn * Wd * side, hy = v.ry + sn * L + c * Wd * side;
      const tx = v.rx - c * L - sn * Wd * side, ty = v.ry - sn * L + c * Wd * side;
      if (lit) reflect(hx, hy + 4, 70, 9, '255,226,150', 0.42 * k);
      reflect(tx, ty + 4, brake ? 60 : 38, 7, '255,40,40', (brake ? 0.55 : 0.3) * k);
    }
    if (v.flags & VF.SIREN) reflect(v.rx, v.ry + 8, 60, 14, Math.floor(S.loopClock * 6) % 2 ? '255,40,40' : '60,110,255', 0.45 * k);
    // tyre spray when moving
    const sp = v._lx !== undefined ? Math.hypot(v.rx - v._lx, v.ry - v._ly) / Math.max(dt, 1e-3) : 0;
    v._lx = v.rx; v._ly = v.ry;
    if (sp > 140 && Math.random() < 0.7) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const tx = v.rx - c * L - sn * Wd * side, ty = v.ry - sn * L + c * Wd * side;
      S.fx.spawn(5, tx, ty, -c * sp * 0.25 + (Math.random() - 0.5) * 40, -sn * sp * 0.25 + (Math.random() - 0.5) * 40, 0.35, 2, '#cfe6ff', 0, 30);
    }
  }
  if (dark > 0.05) {
    for (const l of S.map.lamps) if (l.x > view.x0 && l.x < view.x1 && l.y > view.y0 - 40 && l.y < view.y1) reflect(l.x, l.y + 10, 55, 10, '255,200,110', 0.35 * dark);
    for (const p of S.map.pois) if (p.x > view.x0 && p.x < view.x1 && p.y > view.y0 - 40 && p.y < view.y1) reflect(p.x, p.y + 6, 50, 26, '255,190,100', 0.22 * dark);
  }
  g.restore();
  void now;
}

// ---- umbrellas (pixel-art canopy, cached per colour) -------------------------------------------
const UMBRELLA_COLORS = ['#2f5fc8', '#c8262b', '#2b2b33', '#2f9a5a', '#e8b923', '#7a3ac8'];
const umbrellaCache = [];
function umbrellaSprite(i) {
  if (umbrellaCache[i]) return umbrellaCache[i];
  const N = 20, cv = document.createElement('canvas'); cv.width = cv.height = N;
  const u = cv.getContext('2d');
  const base = UMBRELLA_COLORS[i];
  const n = parseInt(base.slice(1), 16), rgb = [n >> 16, (n >> 8) & 255, n & 255];
  const tone = (f) => `rgb(${rgb.map((q) => Math.max(0, Math.min(255, Math.round(f > 0 ? q + (255 - q) * f : q * (1 + f))))).join(',')})`;
  const cx = 9.5, cy = 9.5, R = 8.6;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy);
    // octagonal canopy edge
    const ang = Math.atan2(dy, dx), oct = R * Math.cos(Math.PI / 8) / Math.cos(((ang % (Math.PI / 4)) + Math.PI / 4) % (Math.PI / 4) - Math.PI / 8);
    if (d > oct + 0.4) continue;
    const panel = Math.floor(((ang + Math.PI) / (Math.PI / 4)) + 0.5) % 2;
    const light = -(dx * 0.6 + dy * 0.8) / R;
    let f = panel ? -0.12 : 0.06;
    f += light * 0.3;
    if (d > oct - 1.1) f = -0.55; // rim
    u.fillStyle = tone(f); u.fillRect(x, y, 1, 1);
  }
  // ribs + tip
  u.fillStyle = tone(-0.45);
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 + Math.PI / 8; for (let r = 2; r < R - 1; r++) u.fillRect(Math.round(cx + Math.cos(a) * r - 0.5), Math.round(cy + Math.sin(a) * r - 0.5), 1, 1); }
  u.fillStyle = '#ddd'; u.fillRect(9, 9, 2, 2);
  u.fillStyle = 'rgba(255,255,255,.35)'; u.fillRect(5, 5, 3, 1); u.fillRect(5, 6, 1, 2);
  umbrellaCache[i] = cv;
  return cv;
}

function drawRain(dt) {
  if (S.rain.length < 220) for (let i = S.rain.length; i < 220; i++) S.rain.push({ x: Math.random() * W, y: Math.random() * H, s: 600 + Math.random() * 400 });
  g.strokeStyle = 'rgba(180,200,255,.35)'; g.lineWidth = 1;
  g.beginPath();
  for (const r of S.rain) {
    r.y += r.s * dt; r.x -= r.s * 0.15 * dt;
    if (r.y > H) { r.y = -10; r.x = Math.random() * (W + 60); }
    g.moveTo(r.x, r.y); g.lineTo(r.x + 3, r.y - 14);
  }
  g.stroke();
  // drops hitting the ground
  g.fillStyle = 'rgba(210,225,255,.38)';
  for (let i = 0; i < 26; i++) { const x = Math.random() * W, y = Math.random() * H; g.fillRect(x - 2, y, 4, 1); g.fillRect(x, y - 1, 1, 1); }
}

// ---------------------------------------------------------------------------
loadAtlas('assets/').finally(() => { connect(); requestAnimationFrame(frame); });

// expose for automated playtests / debugging in the console
window.CLA = { S, send, WEAPONS };
