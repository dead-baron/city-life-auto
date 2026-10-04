// City Life Auto browser client: a "dumb window" that sends input vectors, predicts only
// the local character/vehicle with the shared physics, interpolates everyone else from
// authoritative snapshots, and renders the 16-bit city on a single canvas.
import { TILE, CHUNK_PX, DT, K, T, PF, VF, WEATHER, gameClock, MAP_W, MAP_H } from '../shared/constants.js';
import { generateCity, WATER_T, TRAIN_CARS } from '../shared/map.js';
import { signalFor } from '../shared/roads.js';
import { pedStep, vehStep, driveInput } from '../shared/physics.js';
import { smashProps, geyserDrag, isHydrant, GEYSER_S } from '../shared/smash.js';
import { decodeSnapshot, encodeInput, MSG_SNAPSHOT, CTRL } from '../shared/protocol.js';
import { IN, quantizeAngle, quantizeAxis, dequantizeAxis, dequantizeAngle } from '../shared/input.js';
import { VEHICLE_BY_INDEX } from '../shared/vehicles.js';
import { WEAPONS, WEAPON_BY_INDEX } from '../shared/items.js';
import { lerp, lerpAngle, localToWorld } from '../shared/math.js';
import { serverUrl, TOKEN_KEY } from './config.js';
import { initInput, sample, input, takeNumberPick, settings, saveSettings, detectDevice, touchAimState, virtualTap, pollPadForMenus } from './input.js';
import { GroundCache, drawOverheadProp, debrisColors, lampHead, interiorArt, drawShopDoor } from './render/tiles.js';
import { atlas, loadAtlas, drawVehicle, drawVehicleShadow, drawVehicleWreck, drawCrate, drawBag, pedSprite, PED_BOX, vehicleSide } from './render/sprites.js';
import { FX } from './render/fx.js';
import { HUD } from './hud.js';
import { createPhone } from './phone.js';
import { createMapWaypoints, ROLE_ICON, ROLE_NAME } from './mapwaypoints.js';
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
import { drawInterior } from './interiors.js';
import { EVENT_KINDS, ARROW_SHOW_S, ARROW_FADE_S } from '../shared/worldevents.js';
import { startTutorial, stopTutorial, tutorialActive, tutorialNext, tutorialPrev, tutorialTogglePause, tutorialKey, tutorialSeen, tutorialSeenOld, markTutorialSeen } from './tutorial.js';
import { initAudio, sfx } from './audio.js';
import { drawTrainCar, drawCoupling, drawCrossing, drawStationClock, drawBoardingCue, drawTunnel, portalCovers } from './render/trains.js';
import { NPC_CRITICAL } from '../shared/rules.js';
import { charSprite, dir8, baseDir, CW, FOOT_Y } from './render/chars.js';
import { bodySprite, loadBodies, lyingSprite, LW, LH } from './render/body.js';
import { BuildingLayer } from './render/buildings.js';
import { Highway, liftOf, levelKey } from './render/highway.js';
import { underDeck } from '../shared/levels.js';

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
  confirmedBreaks: new Set(), predBreaks: new Map(), // street furniture smashed: server-confirmed / predicted
  bayOpen: {}, bayAnim: {}, // paint-shop shutters
  garageOpen: {}, garageAnim: {}, // home garage doors
  gateOpen: {}, gateAnim: {}, // police motor pool gates
  xing: [], xingAnim: [], // level crossings: { d: gates down, b: [arm broken, arm broken] }
};
if (/[?&]debug\b/.test(location.search)) window.__S = S; // playtest inspection hook

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
  // only announce the first attempt: rewriting the status on every retry made the title screen jump
  if (!S.connectFailed) $('t-status').textContent = `Connecting to ${url.replace(/^wss?:\/\//, '').replace(/\/ws$/, '')}...`;
  let ws;
  try { ws = new WebSocket(url); } catch (e) { scheduleReconnect('Bad server address'); return; }
  ws.binaryType = 'arraybuffer';
  S.ws = ws;
  ws.onopen = () => { S.reconnectIn = 1000; S.connectFailed = false; ws.send(JSON.stringify({ t: 'hello', token: S.token })); };
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
  S.connectFailed = true;
  $('title').classList.remove('hidden');
  $('hud').classList.add('hidden');
  $('t-resume').classList.add('hidden');
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
      for (const p of S.map.props) if (p.broken) { delete p.broken; const se = S.map.propSolid.get(S.map.props.indexOf(p)); if (se) se.off = false; }
      S.confirmedBreaks.clear(); S.predBreaks.clear();
      S.bayOpen = {}; for (const i of m.bays || []) S.bayOpen[i] = false;
      S.gateOpen = {}; S.gateAnim = {}; for (const gt of S.map.gates || []) for (const pr of gt.props) pr.off = false;
      for (const i of m.gates || []) setGate(i, true);
      for (const i of m.broken || []) { S.confirmedBreaks.add(i); setPropBroken(i, 0, false); }
      if (S.map.levels) { S.map.levels.broken = new Map(); for (const k of m.barriers || []) S.map.levels.broken.set(k, true); }
      S.xing = m.xing || []; S.xingAnim = S.xing.map((x) => (x.d ? 1 : 0));
      S.tt = { l: m.tt || [], at: performance.now() / 1000 };
      S.portals = portalCovers(S.map);
      S.ground.cache.clear();
      $('t-status').textContent = m.practice ? 'Offline practice city ready' : `Signed in as ${m.name}`;
      $('play').disabled = false;
      if (S.playing) startPlaying();
      setupDev();
      sendView();
      break;
    case 'sp': for (const d of m.e) { const e = ent(d.id, d.k); e.d = d; } break;
    case 'ds': for (const id of m.ids) S.ents.delete(id); break;
    case 'ev': for (const ev of m.l) onEvent(ev); break;
    case 'me':
      S.me = m; if (m.pedId) S.myPedId = m.pedId; S.hud && S.hud.setMe(m);
      if (!!m.devMode !== !!S.devMode) { S.devMode = !!m.devMode; setupDev(); if (topOverlay() === 'devpw' && S.devMode) closeOverlay('devpw'); requestPlayers(); if (S.devMode && S.openDevOnEnter) { S.openDevOnEnter = false; openOverlay('dev'); } }
      { const g = document.getElementById('dev-god'); if (g) g.classList.toggle('on', !!m.god); }
      break;
    case 'menu': S.hud.openMenu(m); break;
    case 'pong': S.rtt = performance.now() - m.ts; break;
    case 'board': phone.onBoard(m); break;
    case 'plist': S.plist = m; if (S.hud) S.hud.plist = m.l; renderPlayers(); if (S.bigmap) mapwp.refreshPlayers(); renderDevPlayers(); break;
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
    if (lastS && s.tick - lastS.t > 2) e.buf.push({ t: s.tick - 1, x: lastS.x, y: lastS.y, a: lastS.a, z: lastS.z });
    e.buf.push({ t: s.tick, x: it.x, y: it.y, a: it.a, z: it.lz });
    if (e.buf.length > 5) e.buf.shift();
    e.flags = it.flags; e.hp = it.hp; e.parent = it.parent;
    if (it.kind === K.PED) { e.extra = it.extra & 31; e.blink = (it.extra >> 5) & 3; e.swim = (it.extra & 128) !== 0; } // weapon | blink | in water
    else e.extra = it.extra;
    e.seen = s.tick;
  }
  // anything the server stopped mentioning for 4 s is gone (a missed despawn would otherwise
  // leave a frozen ghost - e.g. a nameplate lying in the street)
  if (s.tick % 20 === 0) for (const [id, e] of S.ents) if (s.tick - (e.seen ?? s.tick) > 80 && id !== S.ctrlId && id !== S.myPedId) S.ents.delete(id);
  reconcile(s);
}

// ---------------------------------------------------------------------------
// Client-side prediction for the local character / driven vehicle
function pedModsFrom(flags, speedMul) {
  return { canMove: !!(flags & 1), canSprint: !!(flags & 2), speedMul, regenMul: flags & 4 ? 2.2 : 1, staminaMax: flags & 8 ? 140 : 100, tumble: !!(flags & 16), air: !!(flags & 32), canSwim: true, analog: true };
}

function reconcile(s) {
  S.pending = S.pending.filter((p) => p.seq > s.ack);
  const kind = s.ctrlKind === CTRL.PED ? 'ped' : s.ctrlKind === CTRL.DRIVER ? 'veh' : null;
  if (!kind) { S.pred = null; S.ctrlKind = s.ctrlKind; S.ctrlId = s.ctrlId; if ((s.ctrlKind === CTRL.NONE || s.ctrlKind === CTRL.RIDER) && s.ctrlId) S.myPedId = s.ctrlId; return; }
  const switched = !S.pred || S.pred.kind !== kind || S.ctrlId !== s.ctrlId;
  S.ctrlKind = s.ctrlKind; S.ctrlId = s.ctrlId;
  if (kind === 'ped') S.myPedId = s.ctrlId;
  // Where the character is drawn right now (interpolated between the last two steps). The new
  // prediction must keep drawing from the same spot, or every snapshot makes it hop.
  const alpha = Math.min(1, S.acc / DT);
  const drawn = (P) => { const pr = P.prev || P.s; return { x: lerp(pr.x, P.s.x, alpha), y: lerp(pr.y, P.s.y, alpha), a: lerpAngle(pr.a, P.s.a, alpha) }; };
  const old = S.pred && !switched ? drawn(S.pred) : null;
  let st;
  if (kind === 'ped') {
    st = { x: s.self.x, y: s.self.y, a: s.self.a, vx: s.self.vx, vy: s.self.vy, stamina: s.self.stamina, rollT: s.self.rollT, rdx: s.self.rdx, rdy: s.self.rdy, prevBits: s.prevBits, under: !!(S.ents.get(s.ctrlId) || {}).swim, lz: s.self.lz };
    S.pred = { kind, s: st, mods: pedModsFrom(s.selfFlags, s.self.speedMul), prev: null };
  } else {
    const e = S.ents.get(s.ctrlId);
    const def = e && e.d ? VEHICLE_BY_INDEX[e.d.m] : null;
    if (!def) { S.pred = null; return; }
    st = { x: s.self.x, y: s.self.y, a: s.self.a, vx: s.self.vx, vy: s.self.vy, av: s.self.av, rev: !!(s.selfFlags & 32), lz: s.self.lz, slip: s.self.stamina, spin: s.self.rollT, launch: s.self.rdx };
    S.pred = { kind, s: st, def, prev: null };
  }
  // replay unacknowledged inputs; keep the state before the last one as `prev` so the render
  // interpolation continues exactly as fixedStep would have left it
  for (let i = 0; i < S.pending.length; i++) { if (i === S.pending.length - 1) S.pred.prev = { ...S.pred.s }; stepPred(S.pending[i]); }
  if (!S.pending.length) S.pred.prev = { ...S.pred.s };
  if (old && !switched) {
    const now = drawn(S.pred);
    const ex = old.x - now.x, ey = old.y - now.y;
    if (ex * ex + ey * ey < 140 * 140) { S.smooth.x += ex; S.smooth.y += ey; } else { S.smooth.x = 0; S.smooth.y = 0; }
    // heading corrections are eased too (snapping the car's angle reads as jitter)
    let ea = old.a - now.a;
    while (ea > Math.PI) ea -= Math.PI * 2;
    while (ea < -Math.PI) ea += Math.PI * 2;
    S.smooth.a = Math.abs(ea) < 0.6 ? (S.smooth.a || 0) + ea : 0;
  } else { S.smooth.x = 0; S.smooth.y = 0; S.smooth.a = 0; }
}

function stepPred(inp) {
  const P = S.pred;
  if (!P) return;
  if (P.kind === 'ped') pedStep(P.s, inp, DT, S.map, P.mods);
  else {
    vehStep(P.s, driveInput(P.s, inp), DT, S.map, P.def, { rain: S.weather === WEATHER.RAIN });
    // predict smashing street furniture exactly like the server does (same momentum loss), so
    // clipping a lamp post doesn't cause a correction. A break predicted during an input that
    // is being replayed counts as not-yet-happened, so the replay re-applies it.
    smashProps(S.map, P.s, P.def,
      (i) => S.confirmedBreaks.has(i) || (S.predBreaks.has(i) && S.predBreaks.get(i).seq < inp.seq),
      (i) => {
        if (!S.predBreaks.has(i) || S.predBreaks.get(i).seq >= inp.seq) S.predBreaks.set(i, { seq: inp.seq, at: performance.now() });
        const pr = S.map.props[i];
        if (isHydrant(pr.t) && !S.geysers.some((g) => Math.hypot(g.x - pr.x, g.y - pr.y) < 4)) S.geysers.push({ x: pr.x, y: pr.y, until: performance.now() + GEYSER_S * 1000, seq: inp.seq });
        else if (isHydrant(pr.t)) { const g = S.geysers.find((q) => Math.hypot(q.x - pr.x, q.y - pr.y) < 4); if (g.seq !== undefined && g.seq > inp.seq) g.seq = inp.seq; }
        if (!pr.broken) setPropBroken(i, P.s.a, true);
      });
    // hydrant spray drags the car (a geyser predicted during a later input doesn't apply yet)
    if (S.geysers.length) geyserDrag(P.s, S.geysers, DT, (g) => g.seq === undefined || g.seq <= inp.seq);
  }
}

function fixedStep() {
  if (!S.welcomed) return;
  const selfScreen = worldToScreen(selfPos());
  const wcur = S.me ? WEAPONS[S.me.weapon] : null;
  const armed = !!(wcur && wcur.type !== 'melee' && wcur.type !== 'tool' && !(S.me && S.me.carrying));
  let inp = sample({ selfScreen, inVehicle: S.ctrlKind === CTRL.DRIVER || S.ctrlKind === CTRL.PASSENGER, driver: S.ctrlKind === CTRL.DRIVER, lastAim: S.lastAim, armed });
  const inOverlay = overlayPad();
  if (!inOverlay && input.padStart && S.playing) { if (S.bigmap) toggleMap(false); openOverlay('pause'); }
  if (!inOverlay && !S.playing) titlePad();
  if (!inOverlay && input.padCall && S.playing && !S.hud.menuOpen && !S.bigmap) callCruiser();
  if (!inOverlay && input.padPhone && S.playing && !S.hud.menuOpen && !S.bigmap) openPhone();
  const menuUp = !S.playing || S.hud.menuOpen || S.bigmap || inOverlay;
  // the button that closed a menu (B / Esc / Enter...) is still held when the menu goes away -
  // ignore the action buttons until they're released, or B would instantly reopen the shop menu
  if (S.menuWasUp && !menuUp) S.suppressBits = IN.ACTION | IN.DIVE | IN.VEHICLE | IN.FIRE | IN.THROW | IN.USE;
  S.menuWasUp = menuUp;
  if (menuUp || performance.now() < (S.inputMuteUntil || 0)) inp = { bits: 0, mx: 0, my: 0, aim: inp.aim };
  if (S.suppressBits) { const held = inp.bits & S.suppressBits; inp.bits &= ~S.suppressBits; S.suppressBits &= held; }
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
  if (inOverlay) { /* overlay consumed the pad */ } else if (S.hud.menuOpen) {
    if (input.menuNav) S.hud.navMenu(input.menuNav);
    if (input.menuSelect) S.hud.choose(S.hud.menuFocus);
    if (input.menuBack) S.hud.closeMenu();
  } else if (S.me && S.me.dead) deathPad();
  const n = takeNumberPick();
  if (n !== null) {
    if (S.hud.menuOpen) S.hud.choose(n);
    else if (S.me && S.me.weapons[n]) send({ t: 'weapon', id: S.me.weapons[n].id });
  }
}

// ---------------------------------------------------------------------------
// Events from the server
function setPropBroken(i, a, withFx) {
  const p = S.map.props[i];
  if (!p || p.broken) return;
  p.broken = { a };
  const se = S.map.propSolid.get(i);
  if (se) se.off = true;
  S.ground.invalidateAt(p.x, p.y);
  if (!withFx) return;
  const c = debrisColors(p.t);
  for (let k = 0; k < 14; k++) {
    const aa = a + (Math.random() - 0.5) * 1.8, sp = 60 + Math.random() * 180;
    S.fx.spawn(4, p.x, p.y, Math.cos(aa) * sp, Math.sin(aa) * sp, 0.5 + Math.random() * 0.4, 2 + Math.random() * 2.5, c[k % 3], 0, 60 + Math.random() * 90);
  }
  if (p.t.startsWith('tree') || p.t.startsWith('palm') || p.t.startsWith('shrub') || p.t.startsWith('bush')) for (let k = 0; k < 10; k++) S.fx.spawn(4, p.x + (Math.random() - 0.5) * 30, p.y + (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60, 1 + Math.random(), 3, Math.random() < 0.5 ? '#3f7f2c' : '#5fa03a', 0, 20);
  sfx('hit', distVol(p.x, p.y) * 1.3);
}

function distVol(x, y) { const d = Math.hypot(x - S.cam.x, y - S.cam.y); return Math.max(0, 1 - d / 1100); }

function onEvent(ev) {
  const now = S.loopClock;
  const fx = S.fx;
  switch (ev.e) {
    case 'toast': S.hud.toast(ev.text, ev.tone); if (ev.tone === 'bad') sfx('bad'); else if (ev.tone === 'good') sfx('cash', 0.6); else if (ev.tone === 'warn') sfx('alert', 0.7); break;
    case 'shot': {
      const w = WEAPON_BY_INDEX[ev.w];
      fx.tracer(ev.x1, ev.y1, ev.x2, ev.y2);
      if (w && w.silenced) { sfx('swing', distVol(ev.x1, ev.y1) * 0.5); break; } // a suppressed cough, no muzzle flash
      S.flashes.push({ x: ev.x1, y: ev.y1, t: 0.06 });
      fx.spawn(4, ev.x1, ev.y1, 0, 0, 0.05, 6, '#fff3b0');
      sfx(w && (w.id === 'shotgun' || w.id === 'rifle' || w.id === 'rocket' || w.id === 'psniper' || w.id === 'pshotgun') ? 'heavy' : 'shot', distVol(ev.x1, ev.y1));
      break;
    }
    case 'blood': if (ev.g) fx.bulletHit(ev.x, ev.y, ev.a, now); else fx.blood(ev.x, ev.y, ev.a, ev.n, now); sfx('hit', distVol(ev.x, ev.y)); break;
    case 'drip': fx.drip(ev.x, ev.y, now); break; // a bleeding person's trail
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
    case 'fling': { const e = S.ents.get(ev.id); if (e) { e.flingAt = S.loopClock; e.flingDur = ev.d; e.flingK = ev.k; e.flingLanded = false; } break; }
    case 'knockdown': {
      fx.ring(ev.x, ev.y, 30, 'rgba(255,230,120,', 0.4);
      fx.floatText(ev.x, ev.y - 26, 'KNOCKDOWN!', '#ffd36b');
      sfx('hit', distVol(ev.x, ev.y) * 1.5);
      if (distVol(ev.x, ev.y) > 0.8) S.cam.shake = Math.max(S.cam.shake, 6);
      break;
    }
    case 'hit': {
      const v = S.ents.get(ev.id);
      if (v) { v.hitAt = S.loopClock; v.hitA = ev.a; v.barUntil = S.loopClock + 4; }
      fx.impact(ev.x, ev.y, ev.a);
      sfx('hit', distVol(ev.x, ev.y) * 1.2);
      if (ev.id === S.myPedId) S.cam.shake = Math.max(S.cam.shake, 5);
      else if (distVol(ev.x, ev.y) > 0.9) S.cam.shake = Math.max(S.cam.shake, 2);
      break;
    }
    case 'foot': fx.decal(2, ev.x, ev.y, ev.a, 1, '#7a0d12', now, 0.8); break;
    case 'garagedoor': S.garageOpen[ev.home] = performance.now() + 2600; break;
    case 'baydoor': S.bayOpen[ev.i] = ev.open; sfx('door', 0.8); break;
    case 'gate': setGate(ev.i, ev.open); break;
    case 'xing': S.xing[ev.i] = { d: ev.d, b: ev.b }; break;
    case 'tt': S.tt = { l: ev.l, at: performance.now() / 1000 }; break; // station clocks
    case 'gatebreak': fx.sparks(ev.x, ev.y, 6); for (let k = 0; k < 6; k++) fx.spawn(4, ev.x, ev.y, Math.cos(ev.a + (Math.random() - 0.5)) * 160, Math.sin(ev.a + (Math.random() - 0.5)) * 160, 0.5, 3, k % 2 ? '#f4f4f4' : '#c8262b'); sfx('crash', distVol(ev.x, ev.y) * 0.6); break;
    case 'trainhorn': { const d = Math.hypot(ev.x - S.cam.x, ev.y - S.cam.y); sfx(ev.s === 2 ? 'trainhorn' : 'trainhornshort', Math.max(0, 1 - d / 2400)); break; }
    case 'kick': sfx('thud', distVol(ev.x, ev.y) * 0.6); break;
    case 'alarm': sfx('alert', distVol(ev.x, ev.y)); S.alarms = (S.alarms || []).concat([{ x: ev.x, y: ev.y, until: performance.now() + 20000 }]); break;
    case 'goal': sfx('cash', 1); S.cam.shake = Math.max(S.cam.shake, 3); break;
    case 'teams': { S.venueTeams ??= {}; S.venueTeams[ev.v] = ev.t; S.pedTeam = new Map(); for (const t of Object.values(S.venueTeams)) t.forEach((ids, k) => { for (const id of ids) S.pedTeam.set(id, k); }); break; }
    case 'raceGo': S.fx.ring(ev.x, ev.y, 60, 'rgba(255,220,80,'); sfx('cash', 1); break;
    case 'checkpoint': S.fx.ring(ev.x, ev.y, 40, 'rgba(120,255,160,'); sfx('cash', 0.6); break;
    case 'barrier': { // a highway barrier smashed through
      for (const k of ev.k) S.map.levels.broken.set(k, true);
      fx.sparks(ev.x, ev.y, 10);
      for (let k = 0; k < 16; k++) { const a = ev.a + (Math.random() - 0.5) * 1.6, sp = 80 + Math.random() * 200; fx.spawn(4, ev.x, ev.y, Math.cos(a) * sp, Math.sin(a) * sp, 0.6 + Math.random() * 0.4, 3, k % 3 ? '#b4b6bb' : '#7d7f86'); }
      sfx('crash', distVol(ev.x, ev.y)); S.cam.shake = Math.max(S.cam.shake, 6 * distVol(ev.x, ev.y));
      break;
    }
    case 'barrierfix': for (const k of ev.k) S.map.levels.broken.delete(k); break;
    case 'propbreak': S.confirmedBreaks.add(ev.i); S.predBreaks.delete(ev.i); setPropBroken(ev.i, ev.a, true); break;
    case 'propfix': {
      const p = S.map.props[ev.i];
      S.confirmedBreaks.delete(ev.i); S.predBreaks.delete(ev.i);
      if (p) { delete p.broken; const se = S.map.propSolid.get(ev.i); if (se) se.off = false; S.ground.invalidateAt(p.x, p.y); }
      break;
    }
    case 'geyser': { const g = S.geysers.find((q) => Math.hypot(q.x - ev.x, q.y - ev.y) < 4); if (g) delete g.seq; else S.geysers.push({ x: ev.x, y: ev.y, until: performance.now() + ev.d * 1000 }); fx.splash(ev.x, ev.y, 14); break; }
    case 'splash': fx.splash(ev.x, ev.y, ev.n || 10); sfx('splash', distVol(ev.x, ev.y)); break;
    case 'sinkboom': fx.splash(ev.x, ev.y, 44); fx.ring(ev.x, ev.y, 60, 'rgba(220,240,255,', 1.2); fx.ring(ev.x, ev.y, 36, 'rgba(255,190,90,', 0.5); for (let i = 0; i < 14; i++) fx.smoke(ev.x + (Math.random() - 0.5) * 50, ev.y + (Math.random() - 0.5) * 50, false); sfx('explode', distVol(ev.x, ev.y) * 0.45); S.cam.shake = Math.max(S.cam.shake, 6 * distVol(ev.x, ev.y)); break;
    case 'thud': sfx('thud', distVol(ev.x, ev.y)); break;
    case 'door': sfx('door', distVol(ev.x, ev.y)); break;
    case 'loot': case 'cash': fx.ring(ev.x, ev.y, 20, 'rgba(120,255,160,'); sfx('cash', distVol(ev.x, ev.y)); if (ev.n) fx.floatText(ev.x, ev.y - 18, `+$${ev.n}`, '#7fe07f'); break;
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
  S.highway = new Highway(S.map);
  S.buildings = new BuildingLayer(S.map, S.ground);
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

// The debug menu: commands on the left (give weapons first, leave dev mode last), everyone
// online on the right with per-player buttons. Every button presses in, clicks, and pops a
// little note saying what it did.
const DEV_CMDS = [
  ['guns', '🔫 Give weapons'], ['god', '🛡 Invincible (toggle)'], ['heal', '❤ Heal'], ['money', '💵 +$25k'],
  ['car', '🏎 Spawn sports car', { m: 'sports' }], ['car', '🛻 Spawn pickup', { m: 'pickup' }], ['car', '🚤 Spawn speedboat', { m: 'speedboat' }], ['cargo', '📦 Loaded flatbed (cargo test)'],
  ['calltrain', '🚉 Call a train to this station'], ['train', '🚆 Hop on the nearest train'],
  ['rain', '🌧 Start rain'], ['clear', '☀ Stop rain'], ['night', '🌙 Jump to night'], ['day', '🌅 Jump to day'],
  ['wanted', '★★ 2 stars', { n: 2 }], ['wanted', '★★★★ 4 stars', { n: 4 }], ['clean', '🧽 Clear wanted'], ['record', '📜 Wipe criminal record'],
  ['samaritan', '😇 +50 Samaritan'], ['cop', '👮 Join the police'], ['promote', '⬆ Promote police rank'],
  ['drop', '🎁 Contraband drop', { n: 4 }], ['snatch', '👜 Snatch-and-grab nearby'], ['shootout', '💥 Gang vs police shootout'], ['die', '☠ Die (respawn test)'],
];
function devPress(b, label, run) {
  b.onclick = () => {
    b.classList.remove('pressed'); void b.offsetWidth; b.classList.add('pressed');
    sfx('click', 0.8);
    S.hud.toast(`🛠 ${label.replace(/^[^A-Za-z+$]+/, '')}`, 'info');
    run();
  };
}
function setupDev() {
  const box = $('dev');
  const on = S.dev || S.devMode;
  $('b-dev').classList.toggle('hidden', !on);
  if (!on) { box.classList.add('hidden'); $('dev-btn').classList.add('hidden'); if (topOverlay() === 'dev') closeOverlay('dev'); return; }
  box.innerHTML = `<div class="dev-head"><b>${S.devMode ? 'DEV DEBUG MODE · nothing is saved' : 'DEV / PLAYTEST CHEATS'}</b><button class="dev-x" title="Close">✕</button></div><div class="dev-cols"><div class="dev-cmds"></div><div id="dev-players"></div></div>`;
  box.querySelector('.dev-x').onclick = () => closeOverlay('dev');
  const cmds = box.querySelector('.dev-cmds');
  for (const [c, label, extra] of DEV_CMDS) {
    const b = document.createElement('button');
    b.textContent = label;
    if (c === 'god') { b.id = 'dev-god'; b.classList.toggle('on', !!(S.me && S.me.god)); }
    devPress(b, label, () => send({ t: 'dev', c, ...(extra || {}) }));
    cmds.appendChild(b);
  }
  if (S.devMode) {
    const leave = document.createElement('button');
    leave.textContent = '⏏ Leave dev mode (restore my progress)'; leave.className = 'dev-leave';
    devPress(leave, 'Leaving dev mode', () => { send({ t: 'devmode', leave: true }); closeOverlay('dev'); });
    cmds.appendChild(leave);
  }
  renderDevPlayers();
  box.classList.add('hidden');
  $('dev-btn').classList.remove('hidden');
  if (S.playing && S.dev) S.hud.toast(S.practice ? 'Offline practice: nothing here is saved. Tap 🛠 (or press `) for the cheats panel.' : 'Dev mode: tap 🛠 or press ` (backtick) for the playtest panel.', 'info');
}
function renderDevPlayers() {
  const el = $('dev-players');
  if (!el) return;
  const all = (S.plist && S.plist.l) || [];
  const ps = all.filter((q) => !q.me);
  el.innerHTML = `<b>PLAYERS ONLINE (${all.length || 1})</b>` + (ps.length ? '' : '<p class="dev-none">Just you right now.</p>');
  for (const q of ps) {
    const row = document.createElement('div'); row.className = 'dev-pl';
    row.innerHTML = `<span>${esc(q.n)}${q.dm ? ' <i>dev</i>' : ''}${q.god ? ' 🛡' : ''}<small>${esc(q.d || '')}${q.dead ? ' · down' : ''}</small></span>`;
    const acts = [['goto', '📍 Go to'], ['bring', '🧲 Bring'], ['gunsp', '🔫 Weapons'], ['healp', '❤ Heal'], ['godp', q.god ? '🛡 Invincible: ON' : '🛡 Invincible: off'], ...(q.dm ? [] : [['grant', '🛠 Give dev']])];
    for (const [c, label] of acts) {
      const b = document.createElement('button'); b.textContent = label;
      if (c === 'godp' && q.god) b.classList.add('on');
      devPress(b, `${label} - ${q.n}`, () => { send({ t: 'dev', c, pid: q.id }); if (c === 'goto' || c === 'bring') closeOverlay('dev'); setTimeout(requestPlayers, 300); });
      row.appendChild(b);
    }
    el.appendChild(row);
  }
}
// Players online (options menu). Devs get teleport / fetch / grant buttons on each row.
function renderPlayers() {
  const el = $('pl-list');
  if (!el) return;
  const ps = (S.plist && S.plist.l) || [];
  $('p-players').textContent = `Players online${ps.length ? ` (${ps.length})` : ''}`;
  if (topOverlay() !== 'players') return;
  $('pl-sub').textContent = S.practice ? 'Offline practice - just you in this city.' : `${ps.length} in the city right now.`;
  el.innerHTML = '';
  for (const q of ps) {
    const row = document.createElement('div'); row.className = 'pl-row';
    row.innerHTML = `<span class="pl-ic">${q.me ? '★' : ROLE_ICON[q.r] || '•'}</span><span class="pl-nm">${esc(q.n)}${q.me ? ' (you)' : ''}${q.dm ? ' <i>dev</i>' : ''}<small>${esc(ROLE_NAME[q.r] || '')}${q.w ? ' ' + '★'.repeat(q.w) : ''}${q.d ? ' · ' + esc(q.d) : ''}${q.dead ? ' · down' : ''}</small></span>`;
    if (S.plist.dev && !q.me && q.id) for (const [c, label] of [['goto', 'Go to'], ['bring', 'Bring'], ...(q.dm ? [] : [['grant', 'Give dev']])]) {
      const b = document.createElement('button'); b.className = 'pl-btn'; b.textContent = label;
      b.onclick = () => { send({ t: 'dev', c, pid: q.id }); if (c !== 'grant') { closeOverlay('players'); closeOverlay('pause'); } setTimeout(requestPlayers, 300); };
      row.appendChild(b);
    }
    el.appendChild(row);
  }
}
function requestPlayers() { if (S.welcomed) send({ t: 'plist' }); }
// keep the lists fresh while one is on screen
setInterval(() => { if (S.playing && overlays.some((o) => o === 'players' || o === 'bigmap' || o === 'dev' || o === 'pause')) requestPlayers(); }, 2500);
function submitDevPw() {
  const pw = $('devpw-in').value;
  if (!pw) return;
  send({ t: 'devmode', pw });
  $('devpw-in').value = '';
}
$('devpw-go').onclick = submitDevPw;
$('devpw-in').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submitDevPw(); } else if (e.key === 'Escape') closeOverlay('devpw'); });

const practiceGo = () => { initAudio(); if (input.device === 'touch' && settings.autoFullscreen !== false) toggleFullscreen(true); setTimeout(maybeLandscapeTip, 1500); startPractice(); };
const playGo = () => { startPlaying(); if (S.dev) S.hud.toast('Dev mode: press ` (backtick) for the playtest panel.', 'info'); };
$('practice').onclick = firstPlay(practiceGo);
$('play').onclick = firstPlay(playGo);

initInput(canvas, {
  onKey(k) {
    if (topOverlay() === 'tutorial' && tutorialKey(k)) return;
    if (S.playing && S.me && S.me.dead && !topOverlay() && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS'].includes(k)) { cycleDeathChoice(['ArrowLeft', 'ArrowUp', 'KeyA', 'KeyW'].includes(k) ? -1 : 1); return; }
    if (k === 'Escape' && topOverlay() === 'phone' && phone.screen !== 'home') { phone.back(); return; }
    if (k === 'Escape' && topOverlay() === 'bigmap' && mapwp.inGroup) { mapwp.back(); return; }
    // menus with the keyboard: W/S or arrows move, Enter / Space / E selects, A/D or arrows change a setting
    if (topOverlay() && topOverlay() !== 'tutorial' && menuKey(k)) return;
    if (!topOverlay() && S.hud && S.hud.menuOpen) {
      if (k === 'ArrowUp' || k === 'KeyW') { S.hud.navMenu(-1); return; }
      if (k === 'ArrowDown' || k === 'KeyS') { S.hud.navMenu(1); return; }
      if (k === 'Enter' || k === 'Space') { S.hud.choose(S.hud.menuFocus); return; }
    }
    if (k === 'KeyP' && S.playing && !topOverlay()) { openPhone(); return; }
    if (k === 'Escape') { if (topOverlay()) closeOverlay(); else if (S.hud?.menuOpen) S.hud.closeMenu(); else if (S.bigmap) toggleMap(false); else if (S.playing) openOverlay('pause'); }
    if (k === 'KeyM' && S.playing) toggleMap(!S.bigmap);
    if (k === 'KeyV' && S.playing && !topOverlay()) callCruiser();
    if (k === 'Backquote' && (S.dev || S.devMode)) { if (topOverlay() === 'dev') closeOverlay('dev'); else openOverlay('dev'); }
    if (k === 'Enter' && !S.playing && S.welcomed) $('play').click();
  },
  onDev() { if (S.dev || S.devMode) { if (topOverlay() === 'dev') closeOverlay('dev'); else openOverlay('dev'); } },
  onMap() { if (S.playing) toggleMap(!S.bigmap); },
  onCruiser() { if (S.playing) callCruiser(); },
  onPhone() { if (S.playing) openPhone(); },
  onSettings() { openSettings(true); },
  onFullscreen() { toggleFullscreen(); },
});
input.onDevice = () => setTimeout(() => { onResize(); if (S.hud && S.me) { $('helpbox').dataset.sig = ''; S.hud.setMe(S.me); } }, 0);
detectDevice();

function cycleDeathChoice(step) {
  const btns = [...document.querySelectorAll('#d-spawn .spawn-opt')];
  if (!btns.length) return;
  const cur = Math.max(0, btns.findIndex((b) => b.classList.contains('on')));
  const i = (cur + step + btns.length) % btns.length;
  S.deathFocus = i; btns[i].click();
}
// Death screen with a controller: D-pad / stick picks where to wake up, A confirms.
function deathPad() {
  const btns = [...document.querySelectorAll('#d-spawn .spawn-opt')];
  if (!btns.length) return;
  const step = input.menuNav || input.menuLR;
  if (step) cycleDeathChoice(step); // moving the highlight picks it
}

// ---- phone + waypoints ---------------------------------------------------------------------------
const phone = createPhone({
  map: () => S.map, pos: () => selfPos(), isCop: () => !!(S.me && S.me.faction === 'enforcer'), send: (o) => send(o),
  setWaypoint: (w) => { S.waypoint = w; if (S.hud) S.hud.waypoint = w; },
  waypoint: () => S.waypoint,
  toast: (t, tone) => S.hud && S.hud.toast(t, tone),
  refocus: () => { ovFocus = 0; focusOverlay(); },
  close: () => closeOverlay('phone'),
});
const mapwp = createMapWaypoints({
  map: () => S.map, pos: () => selfPos(),
  setWaypoint: (w) => { S.waypoint = w; if (S.hud) S.hud.waypoint = w; if (w) S.hud.toast(`Waypoint set: ${w.label}`, 'info'); },
  waypoint: () => S.waypoint,
  refocus: () => { ovFocus = 0; focusOverlay(); },
  setFilter: (list) => { if (S.hud) S.hud.mapFilter = list; },
  myHomes: () => (S.me && S.me.homes) || [],
  players: () => (S.plist && S.plist.l) || [],
});
function openPhone() { if (!S.playing || !S.map) return; if (topOverlay() !== 'phone') openOverlay('phone'); phone.open(); }
// arrive at a phone waypoint -> it clears itself
// a predicted smash the server never confirmed (rare: it decided we missed) is put back
function expirePredictedBreaks() {
  if (!S.predBreaks.size) return;
  const now = performance.now();
  for (const [i, b] of S.predBreaks) {
    if (now - b.at < 2000) continue;
    S.predBreaks.delete(i);
    if (S.confirmedBreaks.has(i)) continue;
    const p = S.map.props[i];
    if (p && p.broken) { delete p.broken; const se = S.map.propSolid.get(i); if (se) se.off = false; S.ground.invalidateAt(p.x, p.y); }
  }
}
function checkWaypoint() {
  if (!S.waypoint || !S.playing) return;
  const p = selfPos();
  if (Math.hypot(p.x - S.waypoint.x, p.y - S.waypoint.y) < 140) { S.hud.toast(`Arrived: ${S.waypoint.label}`, 'good'); S.waypoint = null; S.hud.waypoint = null; }
}

// ---- tutorial: guided tour over the live city map ---------------------------------------------
let tutMap = null;
// `then` runs once the tour is finished or skipped (first play: tour first, then into the city)
function openTutorial(chapter, then) {
  const map = S.map || (tutMap ||= generateCity(1337));
  openOverlay('tutorial');
  startTutorial({ map, fallback: S.hud ? S.hud.mini : null, chapter, onClose: () => { if (overlays.includes('tutorial')) closeOverlay('tutorial'); if (then) setTimeout(then, 0); } });
}
// first-time players see the tour before their first game (SKIP is always there)
function firstPlay(go) {
  return () => {
    if (tutorialSeen()) { go(); return; }
    if (input.device === 'touch' && settings.autoFullscreen !== false) toggleFullscreen(true); // needs this tap's user gesture
    // ask in a popup (nothing on the title screen moves around)
    tutAskGo = go;
    if (tutorialSeenOld()) { $('tut-ask-h').textContent = 'THE CITY TOUR HAS BEEN UPDATED'; $('tut-ask-p').textContent = 'New places, rules and features since you last watched it. Take the tour?'; }
    openOverlay('tut-ask');
  };
}
let tutAskGo = null;
$('tut-ask-watch').onclick = () => { const go = tutAskGo; tutAskGo = null; closeOverlay('tut-ask'); openTutorial(null, go); };
$('tut-ask-skip').onclick = () => { const go = tutAskGo; tutAskGo = null; markTutorialSeen(); closeOverlay('tut-ask'); if (go) go(); };
$('t-tutorial').onclick = () => openTutorial();
// back to the game you left (the city kept running while you were on the title screen)
$('t-resume').onclick = () => {
  if (!S.welcomed) { $('t-resume').classList.add('hidden'); return; }
  $('t-resume').classList.add('hidden');
  $('title').classList.add('hidden'); $('hud').classList.remove('hidden');
  S.playing = true;
  S.inputMuteUntil = performance.now() + 300;
};
$('tut-next').onclick = () => tutorialNext();
$('tut-prev').onclick = () => tutorialPrev();
$('tut-pause').onclick = () => tutorialTogglePause();
$('tut-skip').onclick = () => closeOverlay('tutorial');
$('tut-cv').addEventListener('click', () => tutorialNext());

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
    Promise.resolve(req).then(followRotation).catch(() => {});
  } else if (!want && isFullscreen()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
}
for (const id of ['b-fs', 't-fs', 's-fs']) $(id).onclick = () => toggleFullscreen();
$('b-map').onclick = () => { if (S.playing) toggleMap(!S.bigmap); };
$('b-phone').onclick = () => openPhone();
$('b-menu').onclick = () => { if (S.playing) { sfx('click', 0.6); if (topOverlay() === 'pause') closeOverlay('pause'); else openOverlay('pause'); } };
$('b-dev').onclick = () => { if (!S.playing) return; sfx('click', 0.6); if (topOverlay() === 'dev') closeOverlay('dev'); else openOverlay('dev'); };
$('ph-back').onclick = () => phone.back();
document.addEventListener('fullscreenchange', () => { document.body.classList.toggle('fs', isFullscreen()); if (isFullscreen()) followRotation(); setTimeout(onResize, 50); });

// Let the phone rotate freely, even in fullscreen and in the installed app. 'any' follows the
// rotation sensor and overrides an older landscape-only install (Android only refreshes an installed
// app's settings after a day or so). Browsers that refuse orientation locking just ignore this.
function followRotation() {
  const o = screen.orientation;
  if (!o || !o.lock) return;
  o.lock('any').catch(() => { try { o.unlock(); } catch { /* not allowed here */ } });
}
if (matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches) followRotation();

// ---- installable app (PWA): its own manifest id + scope /city-life-auto/, so it installs
// separately from the other deadbaron.com games -----------------------------------------------
const standalone = matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
document.body.classList.toggle('installed', standalone);
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  // main.js is imported by boot.js, often after the load event already fired
  const reg = () => navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => {});
  if (document.readyState === 'complete') reg(); else addEventListener('load', reg);
}
// Install flow. Chrome only fires beforeinstallprompt when it thinks the app isn't installed, and
// after an uninstall it can keep that belief for a while (stale WebAPK record, old service worker).
// So the install button is always there outside the app: it uses the native prompt when Chrome
// offers one, otherwise it opens a help sheet with the manual steps plus a "Repair install" that
// wipes only this game's service worker + caches (never the other deadbaron.com games).
let installEvt = null;
let relatedInstalled = false;
const UA = navigator.userAgent;
const IS_IOS = /iPad|iPhone|iPod/.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const IS_ANDROID = /Android/.test(UA);
const IS_SAMSUNG = /SamsungBrowser/.test(UA);
const IS_FIREFOX = /Firefox|FxiOS/.test(UA);
if (!standalone) $('t-install').classList.remove('hidden');
if (!standalone && navigator.getInstalledRelatedApps) {
  navigator.getInstalledRelatedApps().then((apps) => { relatedInstalled = apps.some((a) => a.platform === 'webapp'); }).catch(() => {});
}
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; relatedInstalled = false; if (!standalone) $('t-install').classList.remove('hidden'); });
addEventListener('appinstalled', () => { installEvt = null; relatedInstalled = true; closeOverlay('install'); S.hud?.toast('City Life Auto is installed - open it from your home screen.', 'good'); });

function installSteps() {
  if (IS_IOS) return `<h3>iPhone / iPad (Safari)</h3><ol><li>Tap the <b>Share</b> button.</li><li>Choose <b>Add to Home Screen</b>, then <b>Add</b>.</li></ol><p>Reinstalling after a delete works the same way - iOS keeps no install record.</p>`;
  if (IS_SAMSUNG) return `<h3>Samsung Internet</h3><ol><li>Tap the <b>☰ menu</b>.</li><li>Choose <b>Add page to</b> → <b>Apps screen</b> (or <b>Home screen</b>).</li></ol>`;
  if (IS_FIREFOX && IS_ANDROID) return `<h3>Firefox for Android</h3><ol><li>Tap the <b>⋮ menu</b>.</li><li>Choose <b>Install</b> (or <b>Add to Home screen</b>).</li></ol>`;
  if (IS_ANDROID) return `<h3>Chrome on Android</h3><ol><li>Tap the <b>⋮ menu</b> (top right).</li><li>Choose <b>Install app</b> (older Chrome: <b>Add to Home screen</b> → <b>Install</b>).</li></ol>`;
  return `<h3>Desktop Chrome / Edge</h3><ol><li>Click the <b>install icon</b> at the right end of the address bar, or open the <b>⋮ / … menu</b>.</li><li>Choose <b>Install City Life Auto</b> (Edge: <b>Apps → Install this site as an app</b>).</li></ol>`;
}
function stuckSteps() {
  if (IS_IOS) return '';
  const android = IS_ANDROID && !IS_FIREFOX;
  return `<h3>Says "already installed" after you removed it?</h3><ol>
    ${android ? '<li>Make sure it is really gone: phone <b>Settings → Apps → City Life Auto → Uninstall</b>. Removing only the home-screen icon can leave the app installed.</li>' : '<li>Make sure it is really gone: open <b>chrome://apps</b> (Edge: <b>edge://apps</b>), right-click City Life Auto → <b>Uninstall</b>.</li>'}
    <li>Tap <b>Repair install and reload</b> below. It clears only this game's offline copy - your saves and other games are untouched.</li>
    <li>${android ? 'Fully close Chrome (swipe it away in recent apps), reopen it' : 'Restart the browser'} and come back to this page, then install again.</li>
  </ol>`;
}
function openInstall() {
  if (installEvt && !relatedInstalled) { nativeInstall(); return; }
  $('i-sub').textContent = relatedInstalled
    ? 'Your browser reports City Life Auto as already installed - open it from your home screen / app list.'
    : 'Your browser didn’t offer its install prompt, so here are the steps.';
  $('i-body').innerHTML = installSteps() + stuckSteps();
  $('i-go').classList.toggle('hidden', !installEvt);
  openOverlay('install');
}
async function nativeInstall() {
  const evt = installEvt;
  if (!evt) return;
  installEvt = null;
  evt.prompt();
  try { await evt.userChoice; } catch { /* dismissed */ }
  closeOverlay('install');
}
async function repairInstall() {
  const scopePath = new URL('./', location.href).pathname;
  try {
    if (navigator.serviceWorker) {
      for (const r of await navigator.serviceWorker.getRegistrations()) {
        if (new URL(r.scope).pathname !== scopePath) continue; // never touch the other games
        try { (r.active || r.waiting || r.installing)?.postMessage('cla-reset'); } catch { /* gone */ }
        await r.unregister();
      }
    }
    if (self.caches) for (const k of await caches.keys()) if (k.startsWith('city-life-auto-')) await caches.delete(k);
  } catch { /* best effort */ }
  try { localStorage.removeItem('cla.build'); } catch { /* storage blocked */ }
  const u = new URL(location.href);
  u.searchParams.set('fresh', Date.now().toString(36));
  location.replace(u.href);
}
$('t-install').onclick = openInstall;
$('s-install').onclick = openInstall;
$('i-go').onclick = nativeInstall;
$('s-repair').onclick = repairInstall;
$('i-repair').onclick = repairInstall;
if (standalone) $('s-install').classList.add('hidden');
// drop the one-off ?fresh= marker so it doesn't stick to bookmarks
if (new URLSearchParams(location.search).has('fresh')) { const u = new URL(location.href); u.searchParams.delete('fresh'); history.replaceState(null, '', u.href); }

let landTipShown = false;
function maybeLandscapeTip() {
  if (landTipShown || input.device !== 'touch' || innerHeight <= innerWidth) return;
  landTipShown = true;
  const el = $('land-tip');
  el.classList.remove('hidden', 'fade');
  setTimeout(() => el.classList.add('fade'), 4200);
  setTimeout(() => el.classList.add('hidden'), 5600);
}

// ---- overlays: pause menu, settings, controls, dev panel - all navigable with a gamepad --------
// Start (or Esc) opens the pause menu; D-pad / left stick moves, A selects, left/right changes a
// setting, B goes back. Mouse and touch just click.
const overlays = [];
let ovFocus = 0;
function topOverlay() { return overlays[overlays.length - 1] || null; }
function openOverlay(id) {
  if (topOverlay() === id) return;
  if (id === 'settings') syncSettings();
  if (id === 'controls') $('c-body').innerHTML = $('t-help').innerHTML;
  if (id === 'players' || id === 'bigmap' || id === 'dev') requestPlayers();
  if (id === 'pause') {
    requestPlayers();
    document.querySelectorAll('#pause .online-only').forEach((b) => b.classList.toggle('hidden', !!S.practice));
    $('p-devmode').textContent = S.devMode ? '⏏ Leave Dev Debug Mode (restore my progress)' : 'Dev Debug Mode';
    // the debug menu goes to the top of the options while you're in dev mode
    const dbg = document.querySelector('#pause [data-p="dev"]'); dbg.parentNode.insertBefore(dbg, dbg.parentNode.firstChild);
    document.querySelectorAll('#pause .dev-only').forEach((b) => b.classList.toggle('hidden', !S.dev && !S.devMode));
  }
  if (id === 'pause') { document.querySelectorAll('#pause .cop-only').forEach((b) => b.classList.toggle('hidden', !(S.me && S.me.cruiser))); $('p-sub').textContent = S.practice ? 'Offline practice - the city keeps running while this menu is open.' : 'Online - the city keeps running while this menu is open.'; }
  overlays.push(id);
  $(id).classList.remove('hidden');
  if (id === 'dev') $('dev').classList.add('as-overlay');
  if (id === 'bigmap') S.bigmap = true;
  ovFocus = 0; focusOverlay();
}
function closeOverlay(id = topOverlay()) {
  if (!id) return;
  const i = overlays.lastIndexOf(id);
  if (i >= 0) overlays.splice(i, 1);
  $(id).classList.add('hidden');
  if (id === 'dev') $('dev').classList.remove('as-overlay');
  if (id === 'tutorial') stopTutorial();
  if (id === 'bigmap') { S.bigmap = false; if (S.hud) S.hud.mapFilter = null; }
  S.inputMuteUntil = performance.now() + 300; // the A press that closed the menu shouldn't roll you
  ovFocus = 0; focusOverlay();
}
function focusables() {
  const id = topOverlay();
  if (!id) return [];
  return [...$(id).querySelectorAll('button, select, input')].filter((el) => !el.disabled && el.offsetParent !== null && !el.classList.contains('x'));
}
function menuKey(k) {
  const f = focusables();
  if (!f.length) return false;
  const el = f[(ovFocus + f.length) % f.length];
  if (k === 'ArrowUp' || k === 'KeyW') { ovFocus--; focusOverlay(); return true; }
  if (k === 'ArrowDown' || k === 'KeyS') { ovFocus++; focusOverlay(); return true; }
  if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'KeyA' || k === 'KeyD') {
    const d = k === 'ArrowLeft' || k === 'KeyA' ? -1 : 1;
    if (el.tagName === 'SELECT') { el.selectedIndex = (el.selectedIndex + d + el.options.length) % el.options.length; el.dispatchEvent(new Event('change')); return true; }
    if (el.type === 'checkbox') { el.checked = d > 0; el.dispatchEvent(new Event('change')); return true; }
    return false;
  }
  if (k === 'Enter' || k === 'Space' || k === 'KeyE') {
    if (el.tagName === 'SELECT') { el.selectedIndex = (el.selectedIndex + 1) % el.options.length; el.dispatchEvent(new Event('change')); }
    else if (el.type === 'checkbox') { el.checked = !el.checked; el.dispatchEvent(new Event('change')); }
    else el.click();
    return true;
  }
  return false;
}
function focusOverlay() {
  document.querySelectorAll('.pfocus').forEach((el) => el.classList.remove('pfocus'));
  const f = focusables();
  if (!f.length) return;
  ovFocus = (ovFocus + f.length) % f.length;
  const el = f[ovFocus];
  (el.closest('.srow') || el).classList.add('pfocus');
  el.scrollIntoView({ block: 'nearest' });
}
function overlayPad() {
  if (!topOverlay()) return false;
  const f = focusables();
  const el = f[ovFocus];
  if (topOverlay() === 'phone' && input.menuBack && phone.screen !== 'home') { phone.back(); return true; }
  if (topOverlay() === 'bigmap' && input.menuBack && mapwp.inGroup) { mapwp.back(); return true; }
  if (topOverlay() === 'tutorial' && input.menuLR) { if (input.menuLR > 0) tutorialNext(); else tutorialPrev(); return true; }
  if (input.menuNav) { ovFocus += input.menuNav; focusOverlay(); }
  if (el && input.menuLR) {
    if (el.tagName === 'SELECT') { el.selectedIndex = (el.selectedIndex + input.menuLR + el.options.length) % el.options.length; el.dispatchEvent(new Event('change')); }
    else if (el.type === 'checkbox') { el.checked = input.menuLR > 0; el.dispatchEvent(new Event('change')); }
  }
  if (el && input.menuSelect) {
    if (el.tagName === 'SELECT') { el.selectedIndex = (el.selectedIndex + 1) % el.options.length; el.dispatchEvent(new Event('change')); }
    else if (el.type === 'checkbox') { el.checked = !el.checked; el.dispatchEvent(new Event('change')); }
    else el.click();
  }
  if (input.menuBack) closeOverlay();
  if (input.padStart) { while (topOverlay()) closeOverlay(); }
  return true;
}
// Title screen with a gamepad: D-pad / stick between the buttons, A (or Start) to press.
let titleFocus = -1;
function titlePad() {
  if ($('title').classList.contains('hidden')) return;
  const btns = [...document.querySelectorAll('#title button')].filter((b) => !b.disabled && b.offsetParent !== null);
  if (!btns.length) return;
  if (titleFocus < 0) {
    if (input.device !== 'gamepad') return;
    titleFocus = 0; markTitle(btns); return; // highlight PLAY as soon as a pad is in use
  }
  if (input.menuNav || input.menuLR) titleFocus = (titleFocus + (input.menuNav || input.menuLR) + btns.length) % btns.length;
  titleFocus = Math.min(titleFocus, btns.length - 1);
  markTitle(btns);
  if (input.menuSelect || input.padStart) btns[titleFocus].click();
}
function markTitle(btns) {
  document.querySelectorAll('#title .pfocus').forEach((b) => b.classList.remove('pfocus'));
  btns[Math.max(0, titleFocus)].classList.add('pfocus');
}

function syncSettings() {
  $('s-kbdrive').value = settings.kbDrive;
  $('s-paddrive').value = settings.padDrive || 'triggers';
  $('s-edgefire').checked = settings.touchEdgeFire;
  $('s-padfire').checked = settings.padStickFire;
  $('s-vibrate').checked = settings.vibrate;
  $('s-autofs').checked = settings.autoFullscreen !== false;
}
function openSettings(on) { if (on) openOverlay('settings'); else closeOverlay('settings'); }
for (const b of document.querySelectorAll('#pause [data-p]')) {
  b.onclick = () => {
    const a = b.dataset.p;
    if (a === 'resume') closeOverlay('pause');
    else if (a === 'map') { closeOverlay('pause'); toggleMap(true); }
    else if (a === 'phone') { closeOverlay('pause'); openPhone(); }
    else if (a === 'cruiser') { closeOverlay('pause'); callCruiser(); }
    else if (a === 'settings') openOverlay('settings');
    else if (a === 'controls') openOverlay('controls');
    else if (a === 'fullscreen') toggleFullscreen();
    else if (a === 'dev') openOverlay('dev');
    else if (a === 'players') { closeOverlay('pause'); openOverlay('players'); renderPlayers(); }
    else if (a === 'devmode') { closeOverlay('pause'); sfx('click', 0.8); if (S.devMode) send({ t: 'devmode', leave: true }); else { send({ t: 'devmode', pw: '' }); S.openDevOnEnter = true; } }
    else if (a === 'title') { closeOverlay('pause'); S.playing = false; $('title').classList.remove('hidden'); $('hud').classList.add('hidden'); if (S.welcomed && !S.practice) $('play').disabled = false; $('t-resume').classList.toggle('hidden', !S.welcomed); titleFocus = 0; }
  };
}
for (const x of document.querySelectorAll('.overlay [data-close]')) x.onclick = () => closeOverlay(x.closest('.overlay').id);
for (const id of ['pause', 'settings', 'controls', 'players', 'devpw']) $(id).addEventListener('click', (e) => { if (e.target.id === id) closeOverlay(id); });
$('s-kbdrive').onchange = (e) => { settings.kbDrive = e.target.value; saveSettings(); };
$('s-paddrive').onchange = (e) => { settings.padDrive = e.target.value; saveSettings(); };
$('s-edgefire').onchange = (e) => { settings.touchEdgeFire = e.target.checked; saveSettings(); };
$('s-padfire').onchange = (e) => { settings.padStickFire = e.target.checked; saveSettings(); };
$('s-vibrate').onchange = (e) => { settings.vibrate = e.target.checked; saveSettings(); };
$('s-autofs').onchange = (e) => { settings.autoFullscreen = e.target.checked; saveSettings(); };
for (const id of ['b-settings', 't-settings']) $(id).onclick = () => openSettings(true);

function toggleMap(on) {
  if (on) {
    if (topOverlay() !== 'bigmap') openOverlay('bigmap');
    $('bigmap-hint').textContent = input.device === 'touch' ? 'Tap the map to drop a marker · tap outside to close' : input.device === 'gamepad' ? 'Pick a place on the left · B to close' : 'Click the map to drop a marker · M / Esc to close';
    mapwp.open();
  } else if (overlays.includes('bigmap')) closeOverlay('bigmap');
}
// clicking the dark backdrop closes; clicking the map itself drops a waypoint there
$('bigmap').onclick = (e) => { if (e.target === $('bigmap')) toggleMap(false); };
$('bigmap-c').onclick = (e) => {
  const sc = S.hud && S.hud.bigmapScale;
  if (!sc) return;
  const r = $('bigmap-c').getBoundingClientRect();
  const [ox, oy] = S.hud.bigmapOrigin || [0, 0];
  const x = ox + (e.clientX - r.left) / sc, y = oy + (e.clientY - r.top) / sc;
  // snap to a highlighted place if the click is close to one
  let label = 'Marked spot', bx = x, by = y, bd = 24 / sc;
  for (const p of (S.hud.mapFilter || [])) { const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; bx = p.x; by = p.y; label = p.label; } }
  S.waypoint = { x: bx, y: by, label }; S.hud.waypoint = S.waypoint;
  S.hud.toast(`Waypoint set: ${label}`, 'info');
  mapwp.refresh();
};
$('radar').onclick = () => { if (S.playing) toggleMap(true); };
$('weapon').addEventListener('touchstart', (e) => { e.preventDefault(); if (S.playing) virtualTap('nextw'); }, { passive: false });
$('radar').addEventListener('touchstart', (e) => { e.preventDefault(); if (S.playing) toggleMap(true); }, { passive: false });

// ---------------------------------------------------------------------------
// Rendering
let W = 0, H = 0, DPR = 1;
function onResize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  const nw = innerWidth, nh = innerHeight;
  if (nw === W && nh === H && canvas.width === Math.round(W * DPR)) return;
  W = nw; H = nh;
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
  lightCv.width = Math.ceil(W / 2); lightCv.height = Math.ceil(H / 2);
  document.body.classList.toggle('portrait', H > W);
  if (S.playing) maybeLandscapeTip();
  sendView();
}
// Tell the server how much world this screen shows at rest, so it spawns things just out of
// sight and sends them before they scroll into view.
function sendView() {
  if (!W || !H) return;
  const z = baseZoom();
  send({ t: 'view', hw: Math.round(W / 2 / z), hh: Math.round(H / 2 / z) });
}
addEventListener('resize', onResize);
// rotating a phone in fullscreen doesn't always fire 'resize' right away: catch every signal
addEventListener('orientationchange', () => { onResize(); setTimeout(onResize, 120); setTimeout(onResize, 400); });
screen.orientation?.addEventListener?.('change', () => { onResize(); setTimeout(onResize, 120); });
window.visualViewport?.addEventListener('resize', onResize);
onResize();

function baseZoom() {
  // GDD §13: fixed 16:9 landscape scaling; portrait keeps the same pixel scale and simply
  // shows a narrow vertical strip instead of zooming in.
  // Big screens (desktop full screen) show more of the city instead of blowing the characters
  // up: up to ~30% more world on a 1080p+ monitor, the phone view stays as it was.
  const long = Math.max(W, H);
  const viewH = VIEW_H * (1 + 0.3 * Math.max(0, Math.min(1, (long - 960) / 960)));
  return long / (viewH * 16 / 9);
}

// ---- personal police cruiser: radio dispatch, then an arrow leads you to it ------------------
function callCruiser() {
  const c = S.me && S.me.cruiser;
  if (!c) return;
  if (c.s === 'none' && c.cd > 0) { S.hud.toast(`Dispatch can send a new cruiser in ${c.cd}s.`, 'warn'); return; }
  send({ t: 'cruiser' });
}
// World events: a coloured arrow around the player points at each one (and a ring marks it
// when it's on screen). Each arrow shows for ARROW_SHOW_S seconds from when it first appeared
// and then fades, so an ignored event doesn't nag forever; the radar blip stays.
const evSeen = new Map();
function drawEventArrows(g, list, z, now) {
  const me = selfPos();
  const tNow = performance.now() / 1000;
  const live = new Set();
  let slot = 0;
  for (const ev of list) {
    const kind = EVENT_KINDS[ev.k];
    if (!kind) continue;
    live.add(ev.id);
    if (!evSeen.has(ev.id)) evSeen.set(ev.id, tNow);
    const age = tNow - evSeen.get(ev.id);
    const alpha = age < ARROW_SHOW_S - ARROW_FADE_S ? 1 : Math.max(0, (ARROW_SHOW_S - age) / ARROW_FADE_S);
    if (alpha <= 0) continue;
    const dx = ev.x - me.x, dy = ev.y - me.y, d = Math.hypot(dx, dy);
    g.save();
    g.globalAlpha = alpha;
    // ring on the event itself
    const ph = (now * 1.4) % 1;
    g.strokeStyle = kind.color; g.lineWidth = 3 / z;
    g.beginPath(); g.arc(ev.x, ev.y, (18 + ph * 22) / Math.max(z, 0.5), 0, 6.28); g.stroke();
    if (d > 150) {
      const a = Math.atan2(dy, dx), r = (78 + slot * 6) / z;
      const ax = me.x + Math.cos(a) * r, ay = me.y + Math.sin(a) * r, s = 15 / z;
      g.translate(ax, ay);
      g.save(); g.rotate(a);
      g.fillStyle = kind.color; g.strokeStyle = 'rgba(0,0,0,.85)'; g.lineWidth = 2 / z;
      g.beginPath(); g.moveTo(s, 0); g.lineTo(-s * 0.7, -s * 0.8); g.lineTo(-s * 0.3, 0); g.lineTo(-s * 0.7, s * 0.8); g.closePath(); g.fill(); g.stroke();
      g.restore();
      const txt = `${kind.label} · ${Math.round(d / 32)}m`;
      g.font = `600 ${12 / z}px Rubik, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      const ly = (Math.sin(a) > 0 ? 1 : -1) * 22 / z;
      g.lineWidth = 3 / z; g.strokeStyle = 'rgba(0,0,0,.85)'; g.strokeText(txt, 0, ly);
      g.fillStyle = kind.color; g.fillText(txt, 0, ly);
    }
    g.restore();
    slot++;
  }
  // remember dismissed arrows for a while, so walking out of range and back doesn't re-nag
  for (const [id, t0] of evSeen) if (!live.has(id) && tNow - t0 > 600) evSeen.delete(id);
}

// Officers see a small red/blue chevron over criminals they can see; it turns into a pulsing
// "cuff" ring once the suspect is on the ground (walk up and press interact).
function drawSuspectMarks(g, ids, z, now) {
  for (const id of ids) {
    const e = S.ents.get(id);
    if (!e || e.rx === undefined || (e.flags & PF.INVEH)) continue;
    const down = e.flags & (PF.DOWN | PF.STUN | PF.DEAD);
    const y = e.ry - 22;
    g.save();
    if (down) {
      g.globalAlpha = 0.55 + 0.35 * Math.sin(now * 6);
      g.strokeStyle = '#7ab0ff'; g.lineWidth = 2 / z;
      g.beginPath(); g.arc(e.rx, e.ry, 17, 0, 6.28); g.stroke();
    } else {
      g.globalAlpha = 0.7;
      g.fillStyle = (now * 2 | 0) % 2 ? '#ff4a4a' : '#5b8cff';
      g.strokeStyle = 'rgba(0,0,0,.8)'; g.lineWidth = 1.2 / z;
      g.beginPath(); g.moveTo(e.rx, y + 5); g.lineTo(e.rx - 4.5, y - 1); g.lineTo(e.rx + 4.5, y - 1); g.closePath(); g.fill(); g.stroke();
    }
    g.restore();
  }
}
function selfPos() {
  const P = S.pred;
  if (P) {
    const a = Math.min(1, S.acc / DT);
    const pr = P.prev || P.s;
    return { x: lerp(pr.x, P.s.x, a) + S.smooth.x, y: lerp(pr.y, P.s.y, a) + S.smooth.y, a: lerpAngle(pr.a, P.s.a, a) + (S.smooth.a || 0), z: lerp(pr.lz || 0, P.s.lz || 0, a) };
  }
  const e = S.ents.get(S.ctrlId);
  if (e) return { x: e.rx, y: e.ry, a: e.ra, z: e.rz || 0 };
  return { x: S.cam.x, y: S.cam.y, a: 0, z: 0 };
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
  let x, y, a, z;
  if (s0 === s1 || s1.t === s0.t) { x = s1.x; y = s1.y; a = s1.a; z = s1.z || 0; }
  else {
    const k = Math.max(0, Math.min(1, (rt - s0.t) / (s1.t - s0.t)));
    x = lerp(s0.x, s1.x, k); y = lerp(s0.y, s1.y, k); a = lerpAngle(s0.a, s1.a, k); z = lerp(s0.z || 0, s1.z || 0, k);
  }
  e.rz = z;
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
    // corrections decay over ~150 ms in a car (smoother), ~100 ms on foot (snappier)
    const k = Math.exp(-(S.pred && S.pred.kind === 'veh' ? 7 : 10) * dt);
    S.smooth.x *= k; S.smooth.y *= k; S.smooth.a = (S.smooth.a || 0) * k;
    if (nowMs - pingAt > 2000) { pingAt = nowMs; send({ t: 'ping', ts: performance.now() }); }
    if (!tutorialActive()) render(dt);
    tickInterior();
    checkWaypoint();
    expirePredictedBreaks();
  } else {
    g.fillStyle = '#0b0d14'; g.fillRect(0, 0, canvas.width, canvas.height);
    // title screen before the city connects: the pad still drives the menus
    if (pollPadForMenus() && !overlayPad()) titlePad();
  }
  requestAnimationFrame(frame);
}

function render(dt) {
  const fx = S.fx;
  const now = S.loopClock;
  for (const e of S.ents.values()) interp(e, S.renderTick);
  // own entity follows prediction
  const sp = selfPos();
  if (S.pred) { const e = S.ents.get(S.ctrlId); if (e) { e.rx = sp.x; e.ry = sp.y; e.ra = sp.a; e.rz = sp.z; } }
  // things riding on my driven vehicle (passengers, loaded crates) follow the prediction too
  if (S.pred && S.pred.kind === 'veh') {
    for (const e of S.ents.values()) {
      if (e.kind === K.CRATE && e.parent === S.ctrlId && (e.flags & 3) === 2) {
        const sl = S.pred.def.slots[e.extra];
        if (sl) { const [x, y] = localToWorld(sp.x, sp.y, sp.a, sl[0], sl[1]); e.rx = x; e.ry = y; e.ra = sp.a; e.rz = sp.z; }
      }
    }
  }
  // walk-cycle phase from how far each ped actually moved on screen this frame: continuous
  // across walk <-> run (stride length eases with speed), so the loop never jumps
  for (const e of S.ents.values()) { // train cars: how far each moved this frame (riders walk relative to it)
    if (e.kind !== K.TRAIN) continue;
    e.fdx = e.px === undefined ? 0 : e.rx - e.px; e.fdy = e.py === undefined ? 0 : e.ry - e.py; e.px = e.rx; e.py = e.ry;
  }
  for (const e of S.ents.values()) {
    if (e.kind !== K.PED) continue;
    if (e.ax === undefined) { e.ax = e.rx; e.ay = e.ry; e.as = 0; e.phase = 0; continue; }
    const car = e.parent ? S.ents.get(e.parent) : null;
    if (car && car.kind === K.TRAIN) { e.ax += car.fdx || 0; e.ay += car.fdy || 0; }
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
  else if (S.ctrlKind === CTRL.PASSENGER || S.ctrlKind === CTRL.RIDER) { const e = S.ents.get(S.ctrlId); if (e && e.buf.length > 1) { const b = e.buf; speed = Math.hypot(b[b.length - 1].x - b[b.length - 2].x, b[b.length - 1].y - b[b.length - 2].y) * 20; } }
  const targetZoom = baseZoom() / (1 + Math.min(0.5, speed / 1300));
  S.cam.zoom += (targetZoom - S.cam.zoom) * (1 - Math.exp(-2.5 * dt));
  // look-ahead follows the (smoothed) velocity, not the raw heading, so small steering wobbles
  // and server corrections don't shake the camera
  let lvx = 0, lvy = 0;
  if (S.pred && S.pred.kind === 'veh') { lvx = S.pred.s.vx; lvy = S.pred.s.vy; }
  const lk = 1 - Math.exp(-3 * dt);
  S.camLead = S.camLead || { x: 0, y: 0 };
  S.camLead.x += (Math.max(-560, Math.min(560, lvx)) * 0.25 - S.camLead.x) * lk;
  S.camLead.y += (Math.max(-560, Math.min(560, lvy)) * 0.25 - S.camLead.y) * lk;
  const tx = sp.x + S.camLead.x, ty = sp.y + S.camLead.y;
  // The camera is locked to the (already smoothed) character + a smoothed look-ahead: a
  // chasing camera with a frame-time-dependent lag made the car slide around on screen when
  // frame times vary (phones). Teleports / respawns still snap.
  S.cam.x = tx; S.cam.y = ty;
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
  // snap the world offset to whole device pixels: pixel-art ground and sprites then round the
  // same way every frame instead of shimmering by a pixel against each other
  const offX = Math.round(DPR * (W / 2 - S.cam.x * z + shx)), offY = Math.round(DPR * (H / 2 - S.cam.y * z + shy));
  g.setTransform(DPR * z, 0, 0, DPR * z, offX, offY);
  S.worldTf = [DPR * z, 0, 0, DPR * z, offX, offY];
  S.viewRect = view;

  // ground chunks
  const cx0 = Math.floor(view.x0 / CHUNK_PX), cx1 = Math.floor(view.x1 / CHUNK_PX), cy0 = Math.floor(view.y0 / CHUNK_PX), cy1 = Math.floor(view.y1 / CHUNK_PX);
  S.chunkView = [cx0, cx1, cy0, cy1];
  for (let cy = Math.max(0, cy0); cy <= Math.min(Math.ceil(MAP_H * TILE / CHUNK_PX) - 1, cy1); cy++)
    for (let cx = Math.max(0, cx0); cx <= Math.min(Math.ceil(MAP_W * TILE / CHUNK_PX) - 1, cx1); cx++)
      g.drawImage(S.ground.get(cx, cy), cx * CHUNK_PX, cy * CHUNK_PX, CHUNK_PX + 0.5, CHUNK_PX + 0.5);
  g.imageSmoothingEnabled = true;

  // animated water glints
  drawWaterGlints(view, now);
  S.ground.shores.animate(g, view, now);
  if (rain) { g.fillStyle = 'rgba(30,50,80,0.16)'; g.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0); }
  // the train I'm riding (if any)
  const meEnt = S.ents.get(S.myPedId);
  const myCar = S.ctrlKind === CTRL.RIDER && meEnt && meEnt.parent ? S.ents.get(meEnt.parent) : null;
  const myTrain = myCar && myCar.kind === K.TRAIN && myCar.d ? myCar.d.tr : -1;
  const sub = !!(myCar && myCar.kind === K.TRAIN && (myCar.flags & 1)); // riding through the subway: only the tunnel
  if (sub) drawTunnel(g, S.map, view, now);
  else fx.drawDecals(g, view, now, rain);
  // the elevated highway: its shadow and the ramps' feet lie on the ground
  const hv = sub ? { slabs: [], pillars: [] } : S.highway.visible(view);
  S.highway.drawShadows(g, hv.slabs, clock.dark);
  S.highway.drawLow(g, hv.slabs);
  const insideB = sub ? null : drawInteriorView(sp);

  const vis = (e) => e.rx > view.x0 - 160 && e.rx < view.x1 + 160 && e.ry > view.y0 - 160 && e.ry < view.y1 + 160;
  const peds = [], vehs = [], crates = [], bags = [], projs = [], balls = [], cars = [], riders = [];
  for (const e of S.ents.values()) {
    if (!vis(e) || !e.d) continue;
    if (e.kind === K.PED && e.parent) { const c = S.ents.get(e.parent); if (c && c.kind === K.TRAIN) { if (c.d && c.d.tr === myTrain) riders.push(e); continue; } } // riders of other trains are under the roof
    if (e.kind === K.TRAIN) cars.push(e);
    else if (e.kind === K.PED) peds.push(e);
    else if (e.kind === K.VEH) vehs.push(e);
    else if (e.kind === K.CRATE) crates.push(e);
    else if (e.kind === K.BAG) bags.push(e);
    else if (e.kind === K.PROJ) projs.push(e);
    else if (e.kind === K.BALL) balls.push(e);
  }
  if (rain) drawWetReflections(view, vehs, clock.dark, now, dt);

  for (const b of bags) { g.save(); g.translate(b.rx, b.ry); g.rotate(b.ra); drawBag(g, b.d.t, now); g.restore(); }
  for (const c of crates) if ((c.flags & 3) === 0) drawCrateEnt(c, now);
  // water level first: swimmers, then boats - and the bridge decks drawn back over them, so
  // anything passing under a bridge really is under it
  const inWater = (e) => WATER_T[S.map.tileAtPx(e.rx, e.ry)] === 1 || S.map.tileAtPx(e.rx, e.ry) === T.BRIDGE;
  const swimmers = peds.filter((p) => !(p.flags & PF.INVEH) && p.swim);
  const boats = vehs.filter((v) => VEHICLE_BY_INDEX[v.d.m] && VEHICLE_BY_INDEX[v.d.m].kind === 'boat');
  for (const p of swimmers) drawPed(p, now);
  for (const v of boats) drawVehicleEnt(v, now, dt);
  for (const v of boats) if (inWater(v)) coverWithBridge(v.rx, v.ry, 80);
  for (const p of swimmers) coverWithBridge(p.rx, p.ry, 20);
  // downed / dead peds lie on the ground under everything that stands
  const up = (e) => (e.rz || 0) > 0.01;
  for (const p of peds) if ((p.flags & (PF.DEAD | PF.DOWN | PF.STUN)) && !swimmers.includes(p) && !up(p)) drawPed(p, now);
  drawTrains(cars, riders, myTrain, sub, now);
  for (const b of balls) drawBall(b);
  // 3/4 view: buildings, vehicles, people, carried crates, trees and lamp posts drawn in order of
  // where they stand (north first), so whatever is behind a building is hidden by it
  const items = [];
  const bl = sub ? [] : S.buildings.inView(view);
  S.bFade ??= new Map();
  for (const it of bl) {
    const inFade = (S.roofFade && S.roofFade[it.b.id]) || 0;
    const xray = !inFade && S.buildings.hides(it, sp.x, sp.y, 6) ? 1 : 0;
    const cur = S.bFade.get(it.b.id) || 0;
    const k = cur + (xray - cur) * (1 - Math.exp(-8 * dt));
    S.bFade.set(it.b.id, k);
    items.push({ y: it.y1, b: it, a: Math.max(0.08, 1 - inFade * 0.92 - k * 0.6) });
  }
  for (const v of vehs) if (!boats.includes(v)) items.push({ y: levelKey(v.ry, v.rz || 0), v, z: v.rz || 0 });
  for (const p of peds) if (!swimmers.includes(p) && (up(p) || !(p.flags & (PF.DEAD | PF.DOWN | PF.STUN)))) items.push({ y: levelKey(p.ry, p.rz || 0) - ((p.flags & (PF.DEAD | PF.DOWN | PF.STUN)) ? 0.4 : 0), p, z: p.rz || 0 });
  for (const c of crates) if ((c.flags & 3) === 2) { const par = S.ents.get(c.parent); const pz = par ? par.rz || 0 : 0; items.push({ y: levelKey(par ? par.ry : c.ry, pz) + 0.5, c, z: pz }); }
  S.highway.items(hv.slabs, hv.pillars, items);
  for (const c of crates) if ((c.flags & 3) === 1) items.push({ y: c.ry + 1, c });
  if (!sub) for (let cy = Math.max(0, cy0); cy <= cy1 + 1; cy++) for (let cx = Math.max(0, cx0); cx <= cx1; cx++)
    for (const p of S.ground.overhead(cx, cy)) if (p.x > view.x0 - 40 && p.x < view.x1 + 40 && p.y > view.y0 - 40 && p.y < view.y1 + 90) items.push({ y: p.y + 8, o: p });
  items.sort((a, b) => a.y - b.y);
  const nightLit = clock.dark > 0.3;
  for (const it of items) {
    const lift = it.z ? liftOf(it.z) : 0;
    if (lift) { g.save(); g.translate(0, -lift); }
    if (it.b) S.buildings.draw(g, it.b, it.a);
    else if (it.slab) S.highway.drawSlab(g, it.slab);
    else if (it.pillar) S.highway.drawPillar(g, it.pillar);
    else if (it.v) drawVehicleEnt(it.v, now, dt);
    else if (it.p) drawPed(it.p, now);
    else if (it.c) drawCrateEnt(it.c, now);
    else if (it.o) drawOverheadProp(g, it.o, nightLit);
    if (lift) g.restore();
  }
  // your own boat stays readable under a bridge: a faint outline through the deck
  if (S.pred && S.pred.kind === 'veh') { const me = S.ents.get(S.ctrlId); const d = me && me.d ? VEHICLE_BY_INDEX[me.d.m] : null; if (d && d.kind === 'boat' && underBridge(me.rx, me.ry, d.L / 2)) outlineVehicle(me, d); }
  else if (S.pred) { const me = S.ents.get(S.ctrlId); if (me && me.swim && S.map.tileAtPx(me.rx, me.ry) === T.BRIDGE) { g.save(); g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 2; g.setLineDash([4, 4]); g.beginPath(); g.arc(me.rx, me.ry, 13, 0, 6.28); g.stroke(); g.restore(); } }
  // ...and so do you, walking or driving under the elevated highway
  if (S.pred) {
    const me = S.ents.get(S.ctrlId);
    if (me && (me.rz || 0) < 0.3 && underDeck(S.map, me.rx, me.ry)) {
      const d = S.pred.kind === 'veh' && me.d ? VEHICLE_BY_INDEX[me.d.m] : null;
      if (d) outlineVehicle(me, d);
      else { g.save(); g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 2; g.setLineDash([4, 4]); g.beginPath(); g.arc(me.rx, me.ry, 13, 0, 6.28); g.stroke(); g.restore(); }
    }
  }
  if (!sub) coverWalkIns(view, peds, insideB, dt);
  for (const pr of projs) { g.save(); g.translate(pr.rx, pr.ry); g.rotate(pr.ra); g.fillStyle = '#4a5a2a'; g.fillRect(-8, -3, 16, 6); g.fillStyle = '#c8262b'; g.fillRect(6, -3, 3, 6); g.restore(); fx.fire(pr.rx - Math.cos(pr.ra) * 10, pr.ry - Math.sin(pr.ra) * 10); fx.smoke(pr.rx, pr.ry, false); }

  // geysers
  const nowMs = performance.now();
  S.geysers = S.geysers.filter((gy) => gy.until > nowMs);
  for (const gy of S.geysers) fx.geyser(gy.x, gy.y);

  if (!sub) { // (none of it down in the subway)
    drawBays(view, dt);
    drawGarageDoors(view, dt);
    drawBoathouseRoofs(view, dt, vehs);
    drawGates(view, dt);
    drawCrossings(view, dt, now);
    drawStationClocks(view, now);
    drawBuoys(view, now);
    drawSignals(view);
    updateBirds(dt, view, vehs, peds);
  }
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
  S.trainCars = cars;
  if (!sub) drawLighting(clock.dark, view, vehs, peds, z, dt);
  if (rain && !sub) drawRain(dt);

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
  let lift = (c.flags & 3) === 0 ? c.hp * 64 : (c.flags & 3) === 1 ? 26 : 0;
  if ((c.flags & 3) === 2) { const par = S.ents.get(c.parent); const pd = par && par.d ? VEHICLE_BY_INDEX[par.d.m] : null; if (pd) lift = vehLift(pd) / 0.6 + 4; } // on the bed: up with the body
  g.save();
  if (lift > 1) { g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(c.rx + 3, c.ry + 3, 13, 10, 0, 0, 6.28); g.fill(); }
  g.translate(c.rx, c.ry - lift * 0.6);
  g.rotate(c.ra);
  const sc = (c.flags & 3) === 0 ? 1 + lift / 120 : 1;
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
const PED_SCALE = 1.18; // characters a touch smaller than before (was 1.35) - purely visual, physics radius unchanged
const PED_BUILD_SCALE = [0.92, 1, 1.07, 1.16]; // frail, average, tough, brute
// Home garage doors: roll up when your car pulls up to a garage you own (or when the server says
// a car was just parked / taken out).
function drawGarageDoors(view, dt) {
  const mine = new Set(((S.me && S.me.homes) || []).map((h) => h.id));
  const myCar = S.pred && S.pred.kind === 'veh' ? S.pred.s : null;
  for (const gr of S.map.garages || []) {
    const h = S.map.homes[gr.home];
    if (!h || !h.garageDoor) continue;
    const d = h.garageDoor;
    if (d.x < view.x0 - 100 || d.x > view.x1 + 100 || d.y < view.y0 - 100 || d.y > view.y1 + 100) continue;
    const near = myCar && mine.has(gr.home) && Math.hypot(myCar.x - h.garage.x, myCar.y - h.garage.y) < 170;
    const want = near || (S.garageOpen[gr.home] || 0) > performance.now() ? 1 : 0;
    S.garageAnim[gr.home] = (S.garageAnim[gr.home] || 0) + (want - (S.garageAnim[gr.home] || 0)) * (1 - Math.exp(-4 * dt));
    const k = S.garageAnim[gr.home];
    const x = d.x - d.w / 2 + 3, w = d.w - 6, depth = 22;
    const y0 = gr.south ? d.y - depth : d.y;
    // dark interior shows as the door lifts
    g.fillStyle = '#16171b'; g.fillRect(x, y0, w, depth);
    // the door: corrugated panel, shrinking toward the top as it rolls up
    const dh = depth * (1 - k);
    const dy = gr.south ? d.y - depth : d.y + (depth - dh);
    g.fillStyle = '#c9c5bb'; g.fillRect(x, gr.south ? dy : dy, w, dh);
    g.fillStyle = 'rgba(0,0,0,.18)'; for (let yy = 0; yy < dh; yy += 4) g.fillRect(x, (gr.south ? dy : dy) + yy, w, 1);
    g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 1.5; g.strokeRect(x, y0, w, depth);
  }
}

// Boathouse roofs over the waterfront homes' slips: a gabled tin roof that turns see-through
// while a boat (or anybody) is underneath, so you can see what's moored there.
function drawBoathouseRoofs(view, dt, vehs) {
  S.bhFade ??= [];
  const list = S.map.boathouses || [];
  for (let i = 0; i < list.length; i++) {
    const bh = list[i];
    const x = bh.tx * TILE - 6, y = bh.ty * TILE - 6, w = bh.tw * TILE + 12, h = bh.th * TILE + 12;
    if (x > view.x1 || x + w < view.x0 || y > view.y1 || y + h < view.y0) continue;
    let under = false;
    for (const v of vehs) if (v.rx > x - 20 && v.rx < x + w + 20 && v.ry > y - 20 && v.ry < y + h + 20) { under = true; break; }
    const me = S.ents.get(S.ctrlId);
    if (me && me.rx > x - 30 && me.rx < x + w + 30 && me.ry > y - 30 && me.ry < y + h + 30) under = true;
    const cur = S.bhFade[i] || 0;
    const k = cur + ((under ? 1 : 0) - cur) * (1 - Math.exp(-6 * dt));
    S.bhFade[i] = k;
    g.save();
    g.globalAlpha = 1 - k * 0.72;
    const along = bh.dx !== 0;
    g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x + 6, y + 8, w, h);
    // two pitches either side of the ridge, corrugated
    const lit = '#9aa3a8', dark = '#737c82';
    if (along) {
      g.fillStyle = lit; g.fillRect(x, y, w, h / 2);
      g.fillStyle = dark; g.fillRect(x, y + h / 2, w, h / 2);
      g.fillStyle = 'rgba(0,0,0,.14)'; for (let k2 = x + 3; k2 < x + w; k2 += 6) g.fillRect(k2, y, 2, h);
      g.fillStyle = '#c4ccd0'; g.fillRect(x, y + h / 2 - 1.5, w, 3);
    } else {
      g.fillStyle = lit; g.fillRect(x, y, w / 2, h);
      g.fillStyle = dark; g.fillRect(x + w / 2, y, w / 2, h);
      g.fillStyle = 'rgba(0,0,0,.14)'; for (let k2 = y + 3; k2 < y + h; k2 += 6) g.fillRect(x, k2, w, 2);
      g.fillStyle = '#c4ccd0'; g.fillRect(x + w / 2 - 1.5, y, 3, h);
    }
    g.strokeStyle = 'rgba(30,34,38,.7)'; g.lineWidth = 2; g.strokeRect(x, y, w, h);
    g.restore();
  }
}

// Paint-shop shutters: roll down over the bay (and the car in it) while it's being sprayed.
function drawBays(view, dt) {
  for (let i = 0; i < (S.map.bays || []).length; i++) {
    const b = S.map.bays[i];
    const x = b.tx * TILE, y = b.ty * TILE, w = b.tw * TILE, h = b.th * TILE;
    if (x > view.x1 || x + w < view.x0 || y > view.y1 || y + h < view.y0) continue;
    const want = S.bayOpen[i] === false ? 1 : 0;
    S.bayAnim[i] = (S.bayAnim[i] || 0) + (want - (S.bayAnim[i] || 0)) * (1 - Math.exp(-5 * dt));
    const k = S.bayAnim[i];
    // shutter rolled up at the entrance
    const fy = b.south ? y + h : y;
    g.fillStyle = '#6b6f78'; g.fillRect(x - 2, b.south ? fy - 5 : fy, w + 4, 5);
    if (k < 0.01) continue;
    // closed (or closing): corrugated shutter + roof over the whole bay
    const ch = h * k;
    const cy = b.south ? y : y + h - ch;
    g.fillStyle = '#7a7f88'; g.fillRect(x - 2, cy, w + 4, ch);
    g.fillStyle = 'rgba(0,0,0,.25)';
    for (let yy = cy + 3; yy < cy + ch; yy += 6) g.fillRect(x - 2, yy, w + 4, 2);
    g.fillStyle = '#ffd400'; g.font = 'bold 12px monospace'; g.textAlign = 'center';
    if (k > 0.7) g.fillText('SPRAY & GO', x + w / 2, cy + ch / 2 + 4);
  }
}

// Soccer ball / volleyball: shadow on the ground, the ball lifted by its height.
function drawBall(b) {
  const z = (b.extra || 0) * 2;
  const volley = b.d.t === 1;
  g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(b.rx + z * 0.15, b.ry + z * 0.25 + 4, 7 - Math.min(3, z / 40), 4, 0, 0, 6.28); g.fill();
  const y = b.ry - z;
  g.fillStyle = volley ? '#f7e27a' : '#f8f8f8'; g.beginPath(); g.arc(b.rx, y, 7, 0, 6.28); g.fill();
  g.strokeStyle = '#1b2333'; g.lineWidth = 1.5; g.stroke();
  g.save(); g.translate(b.rx, y); g.rotate(b.ra || 0);
  if (volley) { g.strokeStyle = '#2350c8'; g.lineWidth = 1.5; g.beginPath(); g.arc(0, 0, 4, 0.5, 2.6); g.stroke(); g.beginPath(); g.arc(0, 0, 4, 3.6, 5.7); g.stroke(); }
  else { g.fillStyle = '#1b1d22'; g.beginPath(); for (let k = 0; k < 5; k++) { const a = k * 1.2566; g.lineTo(Math.cos(a) * 2.6, Math.sin(a) * 2.6); } g.fill(); for (let k = 0; k < 5; k++) { const a = k * 1.2566 + 0.63; g.beginPath(); g.arc(Math.cos(a) * 6, Math.sin(a) * 6, 1.6, 0, 6.28); g.fill(); } }
  g.restore();
}

// Walk-in buildings. Inside one, its floor plan shows under a faded roof; from outside, the roof
// is drawn back over anyone in there, and the sliding doors open as people come and go.
function walkInAt(x, y) {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  const t = S.map.tileAt(tx, ty);
  if (t !== T.FLOOR && t !== T.COUNTER) return null;
  const b = S.map.buildings[S.map.bld[ty * S.map.w + tx]];
  return b && b.walkIn ? b : null;
}
function drawInteriorView(sp) {
  const b = S.playing && S.ctrlKind !== CTRL.RIDER ? walkInAt(sp.x, sp.y) : null; // riding the subway under a shop doesn't open it
  S.roofFade ??= {};
  for (const id of S.map.walkIns || []) {
    const want = b && b.id === id ? 1 : 0;
    const cur = S.roofFade[id] || 0;
    if (!want && cur < 0.01) continue;
    S.roofFade[id] = cur + (want - cur) * 0.15;
    const bb = S.map.buildings[id];
    g.drawImage(interiorArt(S.map, bb), bb.tx * TILE, bb.ty * TILE); // the lifted building above it fades out
  }
  return b;
}
function coverWalkIns(view, peds, insideB, dt) {
  S.doorAnim ??= {};
  for (const id of S.map.walkIns || []) {
    const b = S.map.buildings[id];
    const x0 = b.tx * TILE, y0 = b.ty * TILE, x1 = x0 + b.tw * TILE, y1 = y0 + b.th * TILE;
    if (x1 < view.x0 || x0 > view.x1 || y1 < view.y0 || y0 > view.y1) continue;
    const fade = (S.roofFade && S.roofFade[id]) || 0;
    void fade;
    for (let i = 0; i < b.walkIn.units.length; i++) {
      const u = b.walkIn.units[i];
      const dx = (u.door.tx + u.door.w / 2) * TILE, dy = (u.door.ty + 0.5) * TILE;
      const near = peds.some((p) => !(p.flags & PF.INVEH) && Math.hypot(p.rx - dx, p.ry - dy) < 56);
      const key = id * 16 + i;
      S.doorAnim[key] = (S.doorAnim[key] || 0) + ((near ? 1 : 0) - (S.doorAnim[key] || 0)) * (1 - Math.exp(-9 * dt));
      drawShopDoor(g, u, b.walkIn.south, S.doorAnim[key]);
    }
  }
}

// Inside a police station: the lobby / armory art covers the city view while the menu is used.
let intShown = null, intDrawnAt = 0;
function tickInterior() {
  const kind = S.playing && S.me && !S.me.dead ? S.me.interior : null;
  const el = $('interior');
  if (kind !== intShown) {
    intShown = kind;
    el.classList.toggle('hidden', !kind);
    intDrawnAt = 0;
    if (kind) $('int-open').textContent = kind === 'armory' ? '▲ Armory' : '▲ Front desk';
  }
  if (!kind) return;
  const now = performance.now();
  if (now - intDrawnAt < 250) return;
  intDrawnAt = now;
  const cv = $('int-cv');
  const w = Math.round(innerWidth), h = Math.round(innerHeight);
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const meEnt = S.ents.get(S.myPedId);
  drawInterior(cv, kind, meEnt && meEnt.d ? meEnt.d.app : {}, now / 1000);
  $('int-open').classList.toggle('hidden', !!(S.hud && S.hud.menuOpen));
}
$('int-open').onclick = () => send({ t: 'interior' });

// Race buoys: a big start float with a chequered flag, numbered checkpoint buoys bobbing.
function drawBuoys(view, now) {
  const inView = (p) => p.x > view.x0 - 60 && p.x < view.x1 + 60 && p.y > view.y0 - 60 && p.y < view.y1 + 60;
  for (const race of S.map.races || []) {
    const bob = (k) => Math.sin(now * 2 + k) * 1.5;
    race.cps.forEach((c, k) => {
      if (!inView(c)) return;
      g.fillStyle = 'rgba(255,255,255,.25)'; g.beginPath(); g.ellipse(c.x, c.y + 4, 14, 6, 0, 0, 6.28); g.fill();
      g.fillStyle = k % 2 ? '#ffffff' : '#e8382b'; g.beginPath(); g.arc(c.x, c.y + bob(k), 9, 0, 6.28); g.fill();
      g.strokeStyle = '#1b2333'; g.lineWidth = 2; g.stroke();
      g.fillStyle = k % 2 ? '#e8382b' : '#fff'; g.font = 'bold 10px monospace'; g.textAlign = 'center'; g.fillText(String(k + 1), c.x, c.y + bob(k) + 4);
    });
    const s = race.start;
    if (!inView(s)) continue;
    g.fillStyle = 'rgba(255,255,255,.3)'; g.beginPath(); g.ellipse(s.x, s.y + 6, 26, 9, 0, 0, 6.28); g.fill();
    g.fillStyle = '#ff9a1a'; g.beginPath(); g.arc(s.x, s.y + bob(9), 14, 0, 6.28); g.fill();
    g.strokeStyle = '#1b2333'; g.lineWidth = 2; g.stroke();
    g.fillStyle = '#1b2333'; g.fillRect(s.x - 1, s.y - 30, 2, 28);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) { g.fillStyle = (r + c) % 2 ? '#fff' : '#111'; g.fillRect(s.x + 1 + c * 4, s.y - 30 + r * 4, 4, 4); }
    g.font = 'bold 12px monospace'; g.textAlign = 'center'; g.fillStyle = 'rgba(0,0,0,.6)'; g.fillText(race.name, s.x + 1, s.y + 31);
    g.fillStyle = '#fff'; g.fillText(race.name, s.x, s.y + 30);
    g.font = 'bold 10px monospace'; g.fillStyle = '#ffd36b'; g.fillText(race.kind === 'jetski' ? 'START - jet skis' : 'START - boats', s.x, s.y + 44);
  }
}

// Sliding gates (motor pools, the Syndicate compound): steel panels that roll aside.
function drawGates(view, dt) {
  const list = S.map.gates || [];
  for (let i = 0; i < list.length; i++) {
    const gt = list[i];
    if (Math.abs(gt.x - (view.x0 + view.x1) / 2) > (view.x1 - view.x0) / 2 + 250 || Math.abs(gt.y - (view.y0 + view.y1) / 2) > (view.y1 - view.y0) / 2 + 250) continue;
    const want = S.gateOpen[i] ? 1 : 0;
    S.gateAnim[i] = (S.gateAnim[i] ?? want) + (want - (S.gateAnim[i] ?? want)) * (1 - Math.exp(-4 * dt));
    const k = S.gateAnim[i];
    g.save();
    g.translate(gt.x, gt.y);
    if (gt.vertical) g.rotate(Math.PI / 2);
    const x0 = -gt.w / 2;
    const gx = x0 + gt.w * k * 0.92; // slides toward one post
    const police = gt.rule === 'police';
    g.save();
    g.beginPath(); g.rect(x0, -10, gt.w, 20); g.clip();
    g.fillStyle = police ? '#d8dce4' : '#5a5048'; g.fillRect(gx, -5, gt.w, 10);
    g.fillStyle = police ? '#1d3a8a' : '#c8262b'; for (let px = gx + 6; px < gx + gt.w - 4; px += 24) g.fillRect(px, -4, 10, 8);
    g.fillStyle = '#2a2c31'; g.fillRect(gx, -6, 4, 12);
    g.restore();
    g.fillStyle = '#2a2c31'; g.fillRect(x0 - 8, -8, 8, 16); g.fillRect(-x0, -8, 8, 16);
    if (k > 0.05 && k < 0.95) { g.fillStyle = Math.floor(S.loopClock * 6) % 2 ? '#ffb000' : '#5a3a00'; g.beginPath(); g.arc(-x0 + 6, -10, 4, 0, 6.28); g.fill(); }
    g.restore();
  }
}
// Trains: couplings, then the cars (lit interiors for the train you're riding, roofs for the
// rest), the people aboard yours, and the ground drawn back over anything that has already slid
// into a tunnel mouth.
function drawTrains(cars, riders, myTrain, sub, now) {
  if (!cars.length && !riders.length) return;
  const byId = new Map(cars.map((c) => [c.id, c]));
  for (const c of cars) { const ahead = c.parent ? byId.get(c.parent) : null; if (ahead) drawCoupling(g, ahead, c); }
  for (const c of cars) drawTrainCar(g, c, c.d.tr === myTrain, now);
  for (const p of riders) { g.save(); g.translate(p.rx, p.ry); g.scale(0.8, 0.8); g.translate(-p.rx, -p.ry); drawPed(p, now); g.restore(); } // a touch smaller, so two fit abreast
  if (!sub) for (const pc of S.portals || []) {
    if (!cars.some((c) => c.rx > pc.x0 - 120 && c.rx < pc.x1 + 120 && c.ry > pc.y0 - 120 && c.ry < pc.y1 + 120)) continue;
    coverGround(pc.x0, pc.y0, pc.x1, pc.y1);
  }
  // the horn and the rumble
  for (const c of cars) {
    if (c.d.c !== 0) continue;
    const moving = c.buf.length > 1 && Math.hypot(c.buf[c.buf.length - 1].x - c.buf[c.buf.length - 2].x, c.buf[c.buf.length - 1].y - c.buf[c.buf.length - 2].y) > 4;
    if (moving) sfx('rumble', distVol(c.rx, c.ry) * 0.6);
  }
}

// Redraw a rectangle of the baked ground on top of whatever is there.
function coverGround(x0, y0, x1, y1) {
  for (let cy = Math.floor(y0 / CHUNK_PX); cy <= Math.floor((y1 - 1) / CHUNK_PX); cy++)
    for (let cx = Math.floor(x0 / CHUNK_PX); cx <= Math.floor((x1 - 1) / CHUNK_PX); cx++) {
      const bx = cx * CHUNK_PX, by = cy * CHUNK_PX;
      const sx = Math.max(x0, bx), sy = Math.max(y0, by), ex = Math.min(x1, bx + CHUNK_PX), ey = Math.min(y1, by + CHUNK_PX);
      if (ex <= sx || ey <= sy) continue;
      g.drawImage(S.ground.get(cx, cy), sx - bx, sy - by, ex - sx, ey - sy, sx, sy, ex - sx, ey - sy);
    }
}

// Level crossings: gate arms swing down when the server says a train is coming; the bell rings.
function drawCrossings(view, dt, now) {
  const xs = (S.map.rail && S.map.rail.crossings) || [];
  xs.forEach((c, i) => {
    const st = S.xing[i] || { d: 0, b: [0, 0] };
    const a = S.xingAnim[i] ?? 0;
    S.xingAnim[i] = a + ((st.d ? 1 : 0) - a) * (1 - Math.exp(-3.5 * dt));
    if (c.x < view.x0 - 260 || c.x > view.x1 + 260 || c.y < view.y0 - 260 || c.y > view.y1 + 260) return;
    drawCrossing(g, c, S.xingAnim[i], st.b || [0, 0], !!st.d, now);
    if (st.d) sfx('bell', distVol(c.x, c.y) * 0.7);
  });
}

// Each platform's countdown to the next train (the server sends the timetable every second;
// the boards tick down smoothly in between).
function drawStationClocks(view, now) {
  const sts = (S.map.rail && S.map.rail.stations) || [];
  const tt = S.tt || { l: [], at: 0 };
  const since = performance.now() / 1000 - tt.at;
  sts.forEach((st, i) => {
    const cx = st.under ? st.platform.x : st.x, cy = st.under ? st.platform.y : st.y;
    if (cx < view.x0 - 600 || cx > view.x1 + 600 || cy < view.y0 - 600 || cy > view.y1 + 600) return;
    const v = tt.l[i];
    const secs = v === undefined ? -1 : v === 0 ? 0 : Math.max(0.01, v - since);
    if (secs === 0 && S.ctrlKind !== CTRL.RIDER) drawBoardingCue(g, S.map.rail, st, now); // a train is in: the platform lights up
    drawStationClock(g, S.map.rail, st, secs, now);
  });
}

function setGate(i, open) {
  S.gateOpen[i] = open;
  const gt = S.map.gates && S.map.gates[i];
  if (gt) for (const pr of gt.props) pr.off = !!open;
}

// Re-draw the baked bridge-deck tiles around a point (over a boat / swimmer beneath them).
function coverWithBridge(x, y, r) {
  const t0x = Math.floor((x - r) / TILE), t1x = Math.floor((x + r) / TILE), t0y = Math.floor((y - r) / TILE), t1y = Math.floor((y + r) / TILE);
  for (let ty = t0y; ty <= t1y; ty++) for (let tx = t0x; tx <= t1x; tx++) {
    if (S.map.tileAt(tx, ty) !== T.BRIDGE) continue;
    const cx = Math.floor(tx * TILE / CHUNK_PX), cy = Math.floor(ty * TILE / CHUNK_PX);
    const ch = S.ground.get(cx, cy);
    g.drawImage(ch, tx * TILE - cx * CHUNK_PX, ty * TILE - cy * CHUNK_PX, TILE, TILE, tx * TILE, ty * TILE, TILE, TILE);
  }
}
function underBridge(x, y, r) {
  for (const [dx, dy] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) if (S.map.tileAtPx(x + dx, y + dy) === T.BRIDGE) return true;
  return false;
}
function outlineVehicle(v, def) {
  g.save(); g.translate(v.rx, v.ry); g.rotate(v.ra);
  g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 2; g.setLineDash([6, 5]);
  g.strokeRect(-def.L / 2, -def.W / 2, def.L, def.W);
  g.restore();
}

function driverBlinks(v) { for (const p of S.ents.values()) if (p.kind === K.PED && p.parent === v.id && p.blink) return true; return false; }
function drawVehicleEnt(v, now, dt) {
  const def = VEHICLE_BY_INDEX[v.d.m];
  if (!def) return;
  const f = v.flags;
  // a land vehicle in the water is sinking: it settles, darkens and fades, bubbling
  const sinking = def.kind !== 'boat' && WATER_T[S.map.tileAtPx(v.rx, v.ry)] === 1;
  v.sinkT = sinking ? (v.sinkT || 0) + dt : 0;
  const sk = Math.min(1, v.sinkT / 3);
  if (sinking && Math.random() < 0.5) S.fx.splash(v.rx + (Math.random() - 0.5) * def.L * 0.6, v.ry + (Math.random() - 0.5) * def.W * 0.6, 1);
  // 2.5D lift: side walls (the darkened outline stacked up the screen), the top view raised on
  // them, leaning out on corners and nosing down under braking
  const lift = sinking ? 0 : vehLift(def);
  const prevA = v.leanA ?? v.ra;
  let dA = v.ra - prevA; while (dA > Math.PI) dA -= Math.PI * 2; while (dA < -Math.PI) dA += Math.PI * 2;
  v.leanA = v.ra;
  const spd = v.buf.length > 1 ? Math.hypot(v.buf[v.buf.length - 1].x - v.buf[v.buf.length - 2].x, v.buf[v.buf.length - 1].y - v.buf[v.buf.length - 2].y) * 20 : 0;
  const latT = Math.max(-1, Math.min(1, (dA / Math.max(dt, 1e-3)) * spd / 900));
  v.lean = (v.lean || 0) + (latT - (v.lean || 0)) * (1 - Math.exp(-6 * dt));
  const leanPx = def.kind === 'boat' ? 0 : -v.lean * (def.kind === 'bike' ? 2.5 : 1.6), dip = (f & VF.BRAKE) && spd > 60 ? 1 : 0;
  g.save();
  g.translate(v.rx, v.ry);
  if (sinking) { g.globalAlpha = 1 - 0.75 * sk; g.scale(1 - 0.18 * sk, 1 - 0.18 * sk); }
  if (v.blinkUntil > now || driverBlinks(v)) g.globalAlpha *= Math.floor(now * 10) % 2 ? 0.25 : 1; // pulling out of a garage
  if (def.kind !== 'boat' && !sinking) { g.save(); g.rotate(v.ra); drawVehicleShadow(g, v.d, def); g.restore(); }
  if (lift > 0) {
    const side = vehicleSide(v.d, def, !!(f & VF.WRECK));
    const sw = side.width / 2, sh = side.height / 2;
    for (let k = 0; k < lift; k += 1.5) {
      g.save(); g.translate(-Math.sin(v.ra) * leanPx * (k / lift), -k); g.rotate(v.ra);
      g.drawImage(side, -sw / 2, -sh / 2, sw, sh);
      g.restore();
    }
  }
  g.translate(-Math.sin(v.ra) * leanPx + Math.cos(v.ra) * dip, -lift + Math.sin(v.ra) * dip);
  g.rotate(v.ra);
  if (f & VF.WRECK) drawVehicleWreck(g, v.d, def); else drawVehicle(g, v.d, def, f);
  const L = def.L, Wd = def.W;
  if (f & VF.BLOODY) { g.fillStyle = 'rgba(120,10,16,.85)'; for (let k = 0; k < 5; k++) { const h = ((v.id * 13 + k * 7) % 17) / 17; g.beginPath(); g.arc(L * 0.3 + h * L * 0.15, -Wd * 0.3 + ((k * 0.37 + h) % 1) * Wd * 0.6, 2 + h * 3, 0, 6.28); g.fill(); } }
  if (f & VF.BRAKE) { g.fillStyle = 'rgba(255,40,40,.9)'; g.fillRect(-L / 2 - 1, -Wd / 2 + 4, 3, 6); g.fillRect(-L / 2 - 1, Wd / 2 - 10, 3, 6); }
  if (f & VF.REVERSE) { g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(-L / 2 - 1, -Wd / 2 + 10, 2, 4); g.fillRect(-L / 2 - 1, Wd / 2 - 14, 2, 4); }
  if (f & VF.SIREN) {
    const ph = Math.floor(now * 6) % 2;
    const bike = def.kind === 'bike', bx = bike ? -L / 2 + 8 : -2, by = bike ? 4 : 6, br = bike ? 3.5 : 6;
    g.globalAlpha = 0.9;
    g.fillStyle = ph ? '#ff2a2a' : '#2a6aff'; g.beginPath(); g.arc(bx, -by, br, 0, 6.28); g.fill();
    g.fillStyle = ph ? '#2a6aff' : '#ff2a2a'; g.beginPath(); g.arc(bx, by, br, 0, 6.28); g.fill();
    g.globalAlpha = 1;
  }
  g.restore();
  if (v.d.fs) { // dealership price tag on the windscreen
    const txt = `$${v.d.fs.toLocaleString()}`;
    g.font = 'bold 12px monospace'; g.textAlign = 'center';
    const w = g.measureText(txt).width + 10;
    g.fillStyle = '#fff8d0'; g.fillRect(v.rx - w / 2, v.ry - 9, w, 18);
    g.strokeStyle = '#c8262b'; g.lineWidth = 2; g.strokeRect(v.rx - w / 2, v.ry - 9, w, 18);
    g.fillStyle = '#c8262b'; g.fillText(txt, v.rx, v.ry + 4);
    g.font = 'bold 8px monospace'; g.fillStyle = '#1b2333'; g.fillText('FOR SALE', v.rx, v.ry - 12);
  }
  // riders on bikes are visible
  if (def.kind === 'bike') {
    for (const p of S.ents.values()) if (p.kind === K.PED && p.parent === v.id && p.d && !(p.flags & PF.DEAD)) {
      const seat = SEAT_BIKE[0];
      const [x, y0] = localToWorld(v.rx, v.ry, v.ra, seat[0], seat[1]);
      const y = y0 - vehLift(def);
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

// how high a vehicle's body stands (world px of visible side wall)
const LIFT = { bus: 12, flatbed: 9, swat: 10, armored: 10, ambulance: 9, van: 9, pickup: 8, sports: 5, bike: 3, policebike: 3 };
function vehLift(def) { return def.kind === 'boat' ? 3 : LIFT[def.id] ?? 7; }

// rings on the water around a swimmer, plus a little splash while they paddle
function drawSwimRipples(p, now) {
  g.save();
  g.strokeStyle = 'rgba(220,240,255,.55)'; g.lineWidth = 1.5;
  for (let k = 0; k < 2; k++) {
    const ph = (now * 0.9 + k * 0.5 + p.id * 0.13) % 1;
    g.globalAlpha = 1 - ph;
    g.beginPath(); g.ellipse(p.rx, p.ry, 12 + ph * 16, 9 + ph * 12, 0, 0, 6.28); g.stroke();
  }
  g.globalAlpha = 0.35; g.fillStyle = '#0c3a66';
  g.beginPath(); g.ellipse(p.rx, p.ry + 2, 13, 10, 0, 0, 6.28); g.fill();
  g.restore();
  if ((p.as || 0) > 30 && Math.random() < 0.12 && S.map.tileAtPx(p.rx, p.ry) !== T.BRIDGE) S.fx.splash(p.rx, p.ry, 2);
}

function drawPed(p, now) {
  const f = p.flags;
  if (f & PF.INVEH) return;
  if (p.blink === 3) return; // inside a home
  let pose = pedPose(p);
  // thrown from a vehicle: airborne arc, then a roll / faceplant / slide on the back
  const flT = p.flingAt !== undefined ? now - p.flingAt : 99;
  const flying = flT < (p.flingDur || 0);
  const flK = p.flingK;
  const flRecent = flT < (p.flingDur || 0) + 3;
  if (!flying && flRecent && !p.flingLanded && p.flingAt !== undefined) { p.flingLanded = true; S.fx.smoke(p.rx, p.ry, false); S.fx.smoke(p.rx + 6, p.ry + 4, false); sfx('thud', distVol(p.rx, p.ry)); }
  if (flying) pose = flK === 'roll' ? 'roll' : 'down';
  else if (pose === 'down' && !(f & PF.DEAD) && (p.as || 0) > 70 && !(flRecent && flK !== 'roll')) pose = 'roll'; // tumbling along
  let fr = pose === 'move' || pose === 'carry' ? Math.floor(p.phase || 0) % 8 : pose === 'roll' ? Math.floor(now * 12) % 4 : pose === 'idle' ? Math.floor(now * 1.5 + p.id) % 8 : pose === 'down' && (f & PF.STUN) ? 1 : 0;
  if (pose === 'punch' || pose === 'swing') fr = Math.min(3, Math.floor(((now - p.swingAt) / SWING_TIME) * 4)) + (p.swingSide ? 4 : 0);
  const lvl = (p.as || 0) < 62 ? 0 : p.as < 112 ? 1 : p.as < 165 ? 2 : 3;
  const hitK = p.hitAt !== undefined ? Math.max(0, 1 - (now - p.hitAt) / 0.22) : 0;
  const swimming = !(f & PF.INVEH) && !!p.swim;
  if (swimming) drawSwimRipples(p, now);
  const team = S.pedTeam && S.pedTeam.get(p.id);
  if (team !== undefined) { g.strokeStyle = team === 0 ? '#ff3b3b' : '#3b8bff'; g.lineWidth = 3; g.beginPath(); g.ellipse(p.rx, p.ry + 4, 13, 8, 0, 0, 6.28); g.stroke(); }
  // standing people: the 3/4-view character, upright on screen, facing one of 8 directions
  if (UPRIGHT.has(pose) && !flying) { drawUpright(p, pose === 'move' ? 'move' + lvl : pose, fr, hitK, swimming, now); return; }
  // lying still on the ground (down or dead, not tumbling or flying): the drawn body from the
  // animation sheet, lying along the way they faced
  if ((pose === 'down' || pose === 'dead') && !flying && !swimming) {
    const ly = lyingSprite(p.d.app, pose === 'dead' ? 1 : 0);
    if (ly) {
      g.save();
      g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(p.rx + 2, p.ry + 3, 24, 10, p.ra, 0, 6.28); g.fill();
      g.translate(p.rx, p.ry); g.rotate(p.ra + Math.PI);
      const sc = 1.25;
      g.imageSmoothingEnabled = false;
      if (f & PF.GHOST) g.globalAlpha = 0.45;
      g.drawImage(ly, -LW * sc / 2, -LH * sc / 2, LW * sc, LH * sc);
      if (hitK > 0.4) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = hitK - 0.4; g.drawImage(ly, -LW * sc / 2, -LH * sc / 2, LW * sc, LH * sc); g.globalCompositeOperation = 'source-over'; }
      g.imageSmoothingEnabled = true;
      g.restore();
      if (f & PF.STUN && Math.random() < 0.3) S.fx.spawn(4, p.rx + (Math.random() - 0.5) * 14, p.ry + (Math.random() - 0.5) * 14, 0, 0, 0.15, 2, '#9fdcff');
      return;
    }
  }
  const spr = pedSprite(p.d.app, pose === 'move' ? 'move' + lvl : pose, fr, p.extra);
  g.save();
  if (swimming) g.globalAlpha = f & PF.DEAD ? 0.5 : 0.72; // body under the surface, head above
  let lift = 0, spin = 0, grow = 1;
  if (flying) {
    const k = flT / p.flingDur, h = Math.sin(Math.PI * k);
    lift = h * 20; grow = 1 + 0.4 * h;
    spin = flK === 'roll' ? k * Math.PI * 3 : flK === 'slide' ? k * Math.PI : 0;
    // shadow stays on the ground while the body flies
    g.save(); g.globalAlpha = 0.35 * (1 - 0.5 * h); g.fillStyle = '#000';
    g.beginPath(); g.ellipse(p.rx + h * 6, p.ry + h * 10, 11 * (1 - 0.3 * h), 7 * (1 - 0.3 * h), 0, 0, 6.28); g.fill(); g.restore();
  } else if (flRecent && flK === 'slide' && (f & PF.DOWN)) spin = Math.PI; // landed on the back
  // a critically hurt NPC limps: the body lurches to one side on every other step
  const limp = p.d && !p.d.pl && p.hp < NPC_CRITICAL && pose === 'move' && !(f & PF.DEAD) ? Math.sin((p.phase || 0) * Math.PI / 4) : 0;
  g.translate(p.rx + (hitK ? Math.cos(p.hitA) * 5 * hitK : 0), p.ry - lift + (hitK ? Math.sin(p.hitA) * 5 * hitK : 0));
  g.rotate(p.ra + spin + (hitK ? 0.25 * hitK : 0) + limp * 0.28);
  if (limp) g.translate(0, Math.max(0, limp) * 2.5);
  if (grow !== 1) g.scale(grow, grow);
  if (pose === 'punch' && (fr & 3) === 2) { g.translate(3, 0); }
  if (f & PF.GHOST) g.globalAlpha = 0.45 + 0.2 * Math.sin(now * 8);
  if (p.blink) g.globalAlpha *= Math.floor(now * (p.blink === 1 ? 3 : 10)) % 2 ? 0.18 : 1; // going indoors (slow, then fast) / spawn protection
  const bs = PED_BUILD_SCALE[p.d.app && p.d.app.bd !== undefined ? p.d.app.bd : 1] || 1;
  g.scale(PED_SCALE * bs, PED_SCALE * bs);
  g.imageSmoothingEnabled = false; // crisp pixel-art characters
  g.drawImage(spr, -PED_BOX / 2, -PED_BOX / 2, PED_BOX, PED_BOX);
  if (hitK > 0.4) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = (hitK - 0.4); g.drawImage(spr, -PED_BOX / 2, -PED_BOX / 2, PED_BOX, PED_BOX); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
  g.imageSmoothingEnabled = true;
  if (pose === 'fish') { g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(24, -6); g.lineTo(44, 0); g.stroke(); }
  g.restore();
  if (f & PF.UMBRELLA) { const u = umbrellaSprite(p.id % UMBRELLA_COLORS.length); g.drawImage(u, p.rx - 18, p.ry - 20, 35, 35); }
  if ((f & PF.BLEED) && Math.random() < 0.08) S.fx.spawn(1, p.rx, p.ry, 0, 0, 0.3, 2, '#9a0f14');
  if (f & PF.STUN && Math.random() < 0.3) S.fx.spawn(4, p.rx + (Math.random() - 0.5) * 14, p.ry + (Math.random() - 0.5) * 14, 0, 0, 0.15, 2, '#9fdcff');
}

// Upright 3/4 character: feet on the ground point, mirrored for the east-facing directions.
const UPRIGHT = new Set(['idle', 'move', 'punch', 'swing', 'aim', 'carry', 'fish']);
const CSCALE = 1.32; // world px per character art px
function drawUpright(p, pose, fr, hitK, swimming, now) {
  const f = p.flags;
  const d8 = dir8(p.ra);
  // concept-art body (all 8 directions drawn); the procedural painter until it has loaded
  const body = bodySprite(p.d.app, d8, pose, fr, p.extra);
  const [d, mirror0] = baseDir(d8);
  const mirror = body ? false : mirror0;
  const spr = body || charSprite(p.d.app, d, pose, fr, p.extra);
  const bs = PED_BUILD_SCALE[p.d.app && p.d.app.bd !== undefined ? p.d.app.bd : 1] || 1;
  const sc = CSCALE * (0.92 + 0.08 * bs) ;
  const limp = p.d && !p.d.pl && p.hp < NPC_CRITICAL && pose.startsWith('move') && !(f & PF.DEAD) ? Math.sin((p.phase || 0) * Math.PI / 4) : 0;
  const fx = p.rx + (hitK ? Math.cos(p.hitA) * 4 * hitK : 0), fy = p.ry + 6 + (hitK ? Math.sin(p.hitA) * 3 * hitK : 0);
  g.save();
  if (!swimming) { // contact shadow
    g.fillStyle = 'rgba(0,0,0,.28)'; g.beginPath(); g.ellipse(fx + 2, fy - 1, 11 * bs, 5, 0, 0, 6.28); g.fill();
  }
  if (f & PF.GHOST) g.globalAlpha = 0.45 + 0.2 * Math.sin(now * 8);
  if (p.blink) g.globalAlpha *= Math.floor(now * (p.blink === 1 ? 3 : 10)) % 2 ? 0.18 : 1;
  g.translate(fx, fy);
  if (limp) g.rotate(limp * 0.12);
  g.scale(mirror ? -sc * bs : sc * bs, sc);
  g.imageSmoothingEnabled = false;
  if (swimming) { // only head and shoulders above the water
    g.globalAlpha *= f & PF.DEAD ? 0.5 : 0.9;
    g.drawImage(spr, 0, 0, CW, 26, -CW / 2, -FOOT_Y + 12, CW, 26);
  } else g.drawImage(spr, -CW / 2, -FOOT_Y);
  if (hitK > 0.4) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = hitK - 0.4; g.drawImage(spr, -CW / 2, -FOOT_Y); g.globalCompositeOperation = 'source-over'; }
  g.imageSmoothingEnabled = true;
  g.restore();
  if (pose === 'fish') { const a = p.ra; g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(p.rx + Math.cos(a) * 20, p.ry - 14 + Math.sin(a) * 10); g.lineTo(p.rx + Math.cos(a) * 46, p.ry + Math.sin(a) * 30); g.stroke(); }
  if (f & PF.UMBRELLA) { const u = umbrellaSprite(p.id % UMBRELLA_COLORS.length); g.drawImage(u, p.rx - 20, p.ry - 62, 40, 40); }
  if ((f & PF.BLEED) && Math.random() < 0.08) S.fx.spawn(1, p.rx, p.ry, 0, 0, 0.3, 2, '#9a0f14');
  if (f & PF.STUN && Math.random() < 0.3) S.fx.spawn(4, p.rx + (Math.random() - 0.5) * 14, p.ry - 20 + (Math.random() - 0.5) * 14, 0, 0, 0.15, 2, '#9fdcff');
}

// Traffic signals on mast arms: a pole on the near-right corner of every approach with an arm
// reaching over the incoming lanes and a 3-lamp head facing the drivers. Cameras sit on poles.
const SIG_COL = { G: '#3ddc84', Y: '#ffc23d', R: '#ff3b3b' };
function drawSignals(view) {
  S.sigHeads = [];
  for (const sg of S.map.signals || []) {
    if (sg.x < view.x0 - 260 || sg.x > view.x1 + 260 || sg.y < view.y0 - 260 || sg.y > view.y1 + 260) continue;
    const n = S.map.nodes[sg.node];
    if (sg.wire) { drawSpanWire(sg, n); continue; }
    {
      const pr = S.map.props[sg.pi];
      if (pr && pr.broken) continue; // knocked over: it lies in the road (baked into the ground)
      const id = sg.edge;
      const st = signalFor(n, id, S.loopTime);
      const px = sg.x, py = sg.y, hx = sg.hx, hy = sg.hy;
      const rx = (px - hx) / (Math.hypot(px - hx, py - hy) || 1), ry = (py - hy) / (Math.hypot(px - hx, py - hy) || 1);
      g.strokeStyle = 'rgba(0,0,0,.3)'; g.lineWidth = 4; g.beginPath(); g.moveTo(px + 4, py + 4); g.lineTo(hx + 4, hy + 4); g.stroke();
      g.strokeStyle = '#2a2d35'; g.lineWidth = 3.5; g.beginPath(); g.moveTo(px, py); g.lineTo(hx, hy); g.stroke();
      g.strokeStyle = '#4c5260'; g.lineWidth = 1; g.beginPath(); g.moveTo(px, py - 1); g.lineTo(hx, hy - 1); g.stroke();
      g.fillStyle = '#30343e'; g.beginPath(); g.arc(px, py, 5, 0, 6.28); g.fill();
      g.fillStyle = '#555b68'; g.beginPath(); g.arc(px - 1, py - 1, 2, 0, 6.28); g.fill();
      // head: three lamps in a row across the arm, lit lamp facing the drivers
      S.sigHeads.push({ x: hx, y: hy, c: SIG_COL[st] });
      g.save(); g.translate(hx, hy); g.rotate(Math.atan2(ry, rx));
      g.fillStyle = '#14161b'; g.fillRect(-14, -5, 28, 10);
      g.fillStyle = '#e8b923'; g.fillRect(-14, -5, 28, 1.5);
      ['R', 'Y', 'G'].forEach((c, k) => {
        const on = st === c;
        g.fillStyle = on ? SIG_COL[c] : 'rgba(80,80,80,.9)';
        g.beginPath(); g.arc(-8 + k * 8, 0.5, 3, 0, 6.28); g.fill();
        if (on) { g.fillStyle = SIG_COL[c] + '55'; g.beginPath(); g.arc(-8 + k * 8, 0.5, 6, 0, 6.28); g.fill(); }
      });
      g.restore();
    }
  }
  const nowMs = performance.now();
  for (const c of S.map.cameras) {
    if (c.x < view.x0 - 60 || c.x > view.x1 + 60 || c.y < view.y0 - 60 || c.y > view.y1 + 60) continue;
    const alert = (S.camAlert.get(c.id) || 0) > nowMs;
    // pole on the corner, short arm reaching toward the junction, camera housing at the end
    const a = 3 * Math.PI / 4, ex = c.x + Math.cos(a) * 24, ey = c.y + Math.sin(a) * 24;
    g.strokeStyle = 'rgba(0,0,0,.3)'; g.lineWidth = 4; g.beginPath(); g.moveTo(c.x + 4, c.y + 4); g.lineTo(ex + 4, ey + 4); g.stroke();
    g.strokeStyle = '#2a2d35'; g.lineWidth = 3.5; g.beginPath(); g.moveTo(c.x, c.y); g.lineTo(ex, ey); g.stroke();
    g.fillStyle = '#30343e'; g.beginPath(); g.arc(c.x, c.y, 5.5, 0, 6.28); g.fill();
    g.fillStyle = '#f2c21b'; g.beginPath(); g.arc(c.x, c.y, 2.2, 0, 6.28); g.fill();
    g.save(); g.translate(ex, ey); g.rotate(a);
    g.fillStyle = '#d8dce4'; g.fillRect(-6, -5, 16, 10); g.fillStyle = '#9aa0aa'; g.fillRect(-6, 3, 16, 2);
    g.fillStyle = '#1a1c22'; g.fillRect(10, -3.5, 4, 7);
    g.restore();
    const on = alert ? Math.floor(nowMs / 120) % 2 : Math.floor(nowMs / 900) % 2;
    if (on) { g.fillStyle = alert ? '#ff2a2a' : '#3b8aff'; g.beginPath(); g.arc(ex, ey, 2.5, 0, 6.28); g.fill(); }
    if (alert) { g.fillStyle = 'rgba(255,40,40,.12)'; g.beginPath(); g.arc(c.x, c.y, c.r * 0.6, 0, 6.28); g.fill(); }
  }
}

// Span-wire signals: cables from the corners (building walls or slim posts) meet over the middle
// of the junction, and a head hangs off the hub facing each approach.
function drawSpanWire(sg, n) {
  const hub = { x: sg.x, y: sg.y };
  for (const c of sg.corners) {
    // cable (with its shadow on the road), sagging a touch toward the hub
    const mx = (c.x + hub.x) / 2 + 3, my = (c.y + hub.y) / 2 + 6;
    g.strokeStyle = 'rgba(0,0,0,.22)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(c.x + 6, c.y + 8); g.quadraticCurveTo(mx + 6, my + 8, hub.x + 6, hub.y + 8); g.stroke();
    g.strokeStyle = '#1b1d22'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(c.x, c.y); g.quadraticCurveTo(mx, my, hub.x, hub.y); g.stroke();
    if (c.wall) { g.fillStyle = '#3a3d44'; g.fillRect(c.x - 3, c.y - 3, 6, 6); }
    else { g.fillStyle = '#30343e'; g.beginPath(); g.arc(c.x, c.y, 3.5, 0, 6.28); g.fill(); g.fillStyle = '#5a606c'; g.beginPath(); g.arc(c.x - 1, c.y - 1, 1.4, 0, 6.28); g.fill(); }
  }
  g.fillStyle = '#22252b'; g.beginPath(); g.arc(hub.x, hub.y, 4, 0, 6.28); g.fill();
  for (const h of sg.heads) {
    const st = signalFor(n, h.edge, S.loopTime);
    S.sigHeads.push({ x: h.x, y: h.y, c: SIG_COL[st] });
    g.strokeStyle = '#1b1d22'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(hub.x, hub.y); g.lineTo(h.x, h.y); g.stroke();
    // a vertical-ish box hanging off the hub, its lit lamp facing the drivers coming in
    g.save(); g.translate(h.x, h.y); g.rotate(h.a + Math.PI / 2);
    g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(-10, -3, 24, 10);
    g.fillStyle = '#14161b'; g.fillRect(-12, -5, 24, 10);
    g.fillStyle = '#e8b923'; g.fillRect(-12, 3.5, 24, 1.5);
    ['R', 'Y', 'G'].forEach((c, k) => {
      const on = st === c;
      g.fillStyle = on ? SIG_COL[c] : 'rgba(80,80,80,.9)';
      g.beginPath(); g.arc(-7 + k * 7, -0.5, 2.6, 0, 6.28); g.fill();
      if (on) { g.fillStyle = SIG_COL[c] + '55'; g.beginPath(); g.arc(-7 + k * 7, -0.5, 5.5, 0, 6.28); g.fill(); }
    });
    g.restore();
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
    if (!p.d.pl && p.barUntil && S.loopClock < p.barUntil && p.hp < 0.999 && !(p.flags & PF.DEAD)) {
      // health bar over whoever you're brawling with; tough/brute builds get a tag so you can size them up
      const y = p.ry - 24 / z, bd = p.d.app ? p.d.app.bd : 1;
      g.fillStyle = 'rgba(0,0,0,.75)'; g.fillRect(p.rx - 16 / z, y, 32 / z, 5 / z);
      g.fillStyle = p.hp < 0.3 ? '#ff4d5e' : '#7fe07f'; g.fillRect(p.rx - 15 / z, y + 1 / z, 30 / z * p.hp, 3 / z);
      if (bd >= 2) { g.fillStyle = bd === 3 ? '#ff9a3a' : '#ffd36b'; g.font = `bold ${11 / z}px monospace`; g.fillText(bd === 3 ? 'BRUTE' : 'TOUGH', p.rx, y - 6 / z); g.font = `bold ${fs}px monospace`; }
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
  if (me && me.suspects && me.suspects.length) drawSuspectMarks(g, me.suspects, z, now);
  if (me && me.happen) drawEventArrows(g, me.happen, z, now);
  if (S.waypoint) { // subtle diamond on the spot itself
    const w = S.waypoint, bob = Math.sin(now * 3) * 3;
    g.save(); g.globalAlpha = 0.85; g.fillStyle = '#4fd6ff'; g.strokeStyle = '#000'; g.lineWidth = 2 / z;
    g.beginPath(); g.moveTo(w.x, w.y - 30 + bob); g.lineTo(w.x + 8, w.y - 20 + bob); g.lineTo(w.x, w.y - 10 + bob); g.lineTo(w.x - 8, w.y - 20 + bob); g.closePath(); g.fill(); g.stroke(); g.restore();
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
    for (const l of S.map.lamps) if (!l.broken && l.x > view.x0 - 120 && l.x < view.x1 + 120 && l.y > view.y0 - 120 && l.y < view.y1 + 120) { const h = lampHead(l); hole(h.x, h.y, 120, 0.85); }
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
    for (const c of S.trainCars || []) {
      if (!(c.flags & 8)) continue;
      const def = TRAIN_CARS[c.d.c];
      hole(c.rx, c.ry, def.L * 0.6, 0.55);
      if (c.d.c === 0) { // the locomotive's headlight throws a long beam down the line
        const [lx, ly] = toL(c.rx, c.ry);
        lg.save(); lg.translate(lx, ly); lg.rotate(c.ra);
        const len = 420 * zz, x0 = def.L / 2 * zz;
        const gr = lg.createLinearGradient(x0, 0, x0 + len, 0);
        gr.addColorStop(0, 'rgba(0,0,0,.95)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        lg.fillStyle = gr; lg.beginPath(); lg.moveTo(x0, -10 * zz); lg.lineTo(x0 + len, -90 * zz); lg.lineTo(x0 + len, 90 * zz); lg.lineTo(x0, 10 * zz); lg.closePath(); lg.fill();
        lg.restore();
      }
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
      if (l.broken || l.x < view.x0 || l.x > view.x1 || l.y < view.y0 || l.y > view.y1) continue;
      const s = worldToScreen(lampHead(l));
      const gr = g.createRadialGradient(s.x, s.y, 0, s.x, s.y, 95 * z);
      gr.addColorStop(0, `rgba(255,196,96,${0.3 * dark})`); gr.addColorStop(0.5, `rgba(255,170,70,${0.1 * dark})`); gr.addColorStop(1, 'rgba(255,170,70,0)');
      g.fillStyle = gr; g.fillRect(s.x - 95 * z, s.y - 95 * z, 190 * z, 190 * z);
    }
    for (const h of S.sigHeads || []) { // signal lamps glow after dark
      const s = worldToScreen(h);
      const gr = g.createRadialGradient(s.x, s.y, 0, s.x, s.y, 22 * z);
      gr.addColorStop(0, h.c + 'cc'); gr.addColorStop(1, h.c + '00');
      g.globalAlpha = dark; g.fillStyle = gr; g.fillRect(s.x - 22 * z, s.y - 22 * z, 44 * z, 44 * z); g.globalAlpha = 1;
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
  if (!S.worldTf || !S.viewRect) return;
  g.save();
  g.setTransform(...S.worldTf);
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = Math.min(1, dark * 0.85);
  g.imageSmoothingEnabled = true;
  for (const it of S.buildings.inView(S.viewRect)) S.buildings.drawGlow(g, it);
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
    for (const l of S.map.lamps) if (!l.broken && l.x > view.x0 && l.x < view.x1 && l.y > view.y0 - 40 && l.y < view.y1) { const h = lampHead(l); reflect(h.x, h.y + 10, 55, 10, '255,200,110', 0.35 * dark); }
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
loadBodies('assets/');
loadAtlas('assets/').finally(() => { connect(); requestAnimationFrame(frame); });

// expose for automated playtests / debugging in the console
window.CLA = { S, send, WEAPONS };
