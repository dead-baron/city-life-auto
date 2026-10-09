// City Life Auto browser client: a "dumb window" that sends input vectors, predicts only
// the local character/vehicle with the shared physics, interpolates everyone else from
// authoritative snapshots, and renders the 16-bit city on a single canvas.
import { TILE, CHUNK_PX, DT, K, T, PF, VF, WEATHER, gameClock, MAP_W, MAP_H, PED_RADIUS } from '../shared/constants.js';
import { generateCity, cityFromData, WATER_T, TRAIN_CARS, mapSignature, DISTRICTS } from '../shared/map.js';
import { signalFor } from '../shared/signals.js';
import { pedStep, vehStep, driveInput } from '../shared/physics.js';
import { smashProps, geyserDrag, isHydrant, GEYSER_S } from '../shared/smash.js';
import { decodeSnapshot, encodeInput, MSG_SNAPSHOT, CTRL } from '../shared/protocol.js';
import { IN, quantizeAngle, quantizeAxis, dequantizeAxis, dequantizeAngle } from '../shared/input.js';
import { VEHICLE_BY_INDEX } from '../shared/vehicles.js';
import { WEAPONS, WEAPON_BY_INDEX } from '../shared/items.js';
import { edgeInfo, EDGE_SLOW, EDGE_OUT } from '../shared/border.js';
import { lerp, lerpAngle, localToWorld, circleVsObb } from '../shared/math.js';
import { serverUrl, TOKEN_KEY } from './config.js';
import { buildTeleport } from './devtp.js';
import { createInventory, createWheel, createWeaponPicker } from './inventory.js';
import { createSpectator, SPEC_LAYERS, SCHEMATIC_KEY } from './spectator.js';
import { initInput, sample, input, takeNumberPick, settings, saveSettings, detectDevice, touchAimState, virtualTap, tapHold, pollPadForMenus, mouseScreen, IS_CONSOLE, deviceStats } from './input.js';
import { GroundCache, drawOverheadProp, debrisColors, lampHead, interiorArt, drawShopDoor } from './render/tiles.js';
import { PROP_SIZES } from '../shared/prefab-data.js';
import { atlas, loadAtlas, loadGlowSheets, loadInteriorArt, drawVehicle, drawVehicleShadow, drawVehicleWreck, drawCrate, drawBag, pedSprite, PED_BOX, vehicleSide } from './render/sprites.js';
import { FX } from './render/fx.js';
import { HUD } from './hud.js';
import { createPhone } from './phone.js';
import { createMapWaypoints, ROLE_ICON, ROLE_NAME } from './mapwaypoints.js';
import { createRouter } from './route.js';
import { iconImg } from './pixicons.js';
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
import { drawInterior } from './interiors.js';
import { EVENT_KINDS, ARROW_SHOW_S, ARROW_FADE_S } from '../shared/worldevents.js';
import { startTutorial, stopTutorial, tutorialActive, tutorialNext, tutorialPrev, tutorialTogglePause, tutorialKey, tutorialSeen, tutorialSeenOld, markTutorialSeen } from './tutorial.js';
import { initAudio, sfx, soundEvent, soundFrame, soundSettingsUi } from './audio.js';
import { drawStarView } from './stargaze.js';
import { noteServerBuild, myBuild } from './update.js';
import { buildGive, buildQuickGive } from './devgive.js';
import { DEV_SECTIONS } from './devcats.js';
import { drawTrainCar, drawCoupling, drawCrossing, drawStationClock, drawBoardingCue, drawTunnel, portalCovers, drawOnStairs } from './render/trains.js';
import { NPC_CRITICAL } from '../shared/rules.js';
import { ferrisSite, ferrisCab, balloonSite, balloonRoutes, balloonAt, slideSite, slideRider } from '../shared/rides.js';
import { swingMeter, carry as golfCarry } from '../shared/golf.js';
import { courtHoops, idealPower, shotWindow } from '../shared/hoops.js';
import { charSprite, dir8, baseDir, CW, FOOT_Y } from './render/chars.js';
import { bodySprite, loadBodies, lyingSprite, LW, LH } from './render/body.js';
import { ANIMAL_ART } from '../shared/animal-art.js';
import { BuildingLayer } from './render/buildings.js';
import { Highway, liftOf, levelKey } from './render/highway.js';
import { underDeck } from '../shared/levels.js';
import { skyAt, lampLevel, neonLevel, hash as hashAt } from './render/atmos.js';
import { Lighting, LIGHT } from './render/lighting.js';
import { Weather } from './render/weather.js';
import { drawBuildingShadows, drawPropShadows, drawContactShade, drawSpriteShadows } from './render/shadows.js';
import { registerNewProps } from './render/newprops.js';
import { LOW_MEM, canvasStats, setDeviceKind } from './platform.js';
import { Flora, FLORA_PROPS, wind } from './render/flora/index.js';
import { gfx, initGfx, applyPreset, setOption, stepDown, gfxChosen, getDevice, PRESETS, PRESET_NAMES, OPTIONS, worldArtWanted } from './gfx.js';
initGfx();
import { registerCountryProps, COUNTRY_TALL, GROW as COUNTRY_GROW, drawWires, drawCountryEmissive, countryLightY } from './render/country.js';

const $ = (id) => document.getElementById(id);
const canvas = $('view');
// World art (Settings, or ?art=2 / ?art=1): the art v2 renderer draws the world on #world (WebGL2)
// under this canvas, which then carries only the overlays - so it needs an alpha channel, and that is
// fixed when the context is made: the choice applies per page load.
const ART2_WANTED = worldArtWanted();
let v1ArtP = null; // the classic art, once something asked for it (ensureV1Art)
const g = canvas.getContext('2d', { alpha: ART2_WANTED });

const VIEW_H = 660;           // world px visible vertically in 16:9 landscape
const INTERP_TICKS = 2.2;     // render others ~110 ms in the past

const S = {
  ws: null, token: null, pid: null, welcomed: false, playing: false, dev: false, reconnectIn: 1000,
  map: null, ground: null, hud: null, fx: new FX(),
  // the classic renderer's highway deck (render/highway.js): made the first time something draws it, not for every city
  _hw: null, get highway() { return this._hw || (this._hw = this.map ? new Highway(this.map) : null); },
  ents: new Map(), latestTick: 0, renderTick: 0, loopTime: 60, weather: 0,
  ctrlKind: 0, ctrlId: 0, me: null, seq: 0, pending: [], pred: null, acc: 0, lastAim: 0,
  cam: { x: 4400, y: 2200, zoom: 1, shake: 0 }, smooth: { x: 0, y: 0 }, geysers: [], flashes: [], camAlert: new Map(), spikes: new Map(),
  rtt: 0, bigmap: false, rain: [], fps: 0,
  confirmedBreaks: new Set(), predBreaks: new Map(), // street furniture smashed: server-confirmed / predicted
  bayOpen: {}, bayAnim: {}, // paint-shop shutters
  garageOpen: {}, garageAnim: {}, // home garage doors
  gateOpen: {}, gateAnim: {}, // police motor pool gates
  forageGone: new Set(),      // foraging spots picked bare (map.forage indices; server/systems/foraging.js)
  xing: [], xingAnim: [], // level crossings: { d: gates down, b: [arm broken, arm broken] }
};
S.fx.resolve = (id) => { const e = S.ents.get(id); return e && e.rx !== undefined ? e : null; }; // speech bubbles follow their speaker
if (/[?&]debug\b/.test(location.search)) window.__S = S; // playtest inspection hook

// ---- the load timeline -------------------------------------------------------------------------------------
// How long each step of getting into the city took on this device, in ms since the page started loading: the
// boot check (boot.js), the code, the server's welcome, the city built from the seed, the renderer and its bake
// workers, the first art, and the whole screen drawn. The diagnostics overlay shows it, the server is told once
// per page (the debug menu lists the latest devices), and tools/perf reads it from window.CLA.load.
const LOAD = { at: {}, ms: {}, sent: false };
function loadMark(k) { if (LOAD.at[k] === undefined) LOAD.at[k] = Math.round(performance.now()); }
function loadSpan(k, ms) { LOAD.ms[k] = Math.round(ms); }
// "boot 0.4 · code 1.2 · welcome 1.9 · city 11.0 (city 9.1) · ..." in seconds, in the order they happened
function loadLine() {
  const s = (ms) => (ms / 1000).toFixed(1);
  const at = Object.entries(LOAD.at).sort((a, b) => a[1] - b[1]).map(([k, v]) => `${k} ${s(v)}`).join(' · ');
  const ms = Object.entries(LOAD.ms).map(([k, v]) => `${k} ${s(v)}`).join(', ');
  return `${at}${ms ? `  (took ${ms})` : ''} s${LOAD.city ? `  city ${LOAD.city === 'cache' ? 'read back' : LOAD.city === 'built' ? 'built in a worker' : 'built on the page'}` : ''}`;
}
{ const b = window.CLA_BOOT; if (b) { LOAD.at.boot = Math.round(b.done); if (b.fetched) LOAD.ms.update = Math.round(b.done - b.start); } }
loadMark('code');

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
  ws.onmessage = (ev) => { if (holding(ws, ev.data)) return; if (typeof ev.data !== 'string') onBinary(ev.data); else { let m; try { m = JSON.parse(ev.data); } catch { return; } onText(m); } };
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
  ws.onopen = () => { loadMark('socket'); S.reconnectIn = 1000; S.connectFailed = false; ws.send(JSON.stringify({ t: 'hello', token: S.token, cb: myBuild().v, cbt: myBuild().at })); }; // cb / cbt: this page's build (client/update.js)
  ws.onmessage = (ev) => {
    if (holding(ws, ev.data)) return;
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
// ---- looks (shared/look.js, loaded lazily): a player's look travels as its code alone ({ lk }) and becomes the
// old-style appearance here; the character creator (client/creator.js) loads the first time it opens
let LOOKS = null, creatorP = null;
const lookWait = [];
import('../shared/look.js').then((m) => { LOOKS = m; for (const d of lookWait.splice(0)) lookApp(d); }).catch((e) => console.warn('[looks]', e));
function lookApp(d) { if (!LOOKS) { lookWait.push(d); return; } const L = LOOKS.decodeLook(d.app.lk); if (L) d.app = LOOKS.lookToApp(L, d.app.lk); }
function openCreator(mode) {
  creatorP ||= import('./creator.js').then((m) => { m.init({ send, openOverlay, closeOverlay, topOverlay, sfx, toast: (t, k) => S.hud && S.hud.toast(t, k) }); S.creator = m; return m; });
  creatorP.then((m) => m.open(mode, S.looks)).catch((e) => console.warn('[creator]', e));
}

function onText(m) {
  switch (m.t) {
    case 'welcome':
      loadMark('welcome');
      if (holdForCity(m)) break;   // (the city is still being built: this and what follows wait for it)
      try { localStorage.setItem('cla.seed', String(m.seed >>> 0)); } catch { /* storage blocked */ }
      S.welcomed = true; S.pid = m.pid; S.dev = !!m.dev;
      if (!m.practice) S.everConnected = true;
      if (m.token && !m.practice) { S.token = m.token; try { localStorage.setItem(TOKEN_KEY, m.token); } catch { /* private mode */ } }
      document.body.classList.toggle('practice', !!m.practice);
      if (S.spec && S.spec.on) { if (S.map.seed !== (m.seed >>> 0)) exitSpectate(); else send({ t: 'dev', c: 'spectate', on: true }); } // back in after a reconnect
      if (!S.map || S.map.seed !== (m.seed >>> 0)) setupWorld(m.seed);
      if (m.sig && S.mapFrom === 'cache' && m.sig !== mapSignature(S.map)) { console.warn('[city] the kept city is not the server\'s: building it again'); forgetCity(); setupWorld(m.seed, true); }
      S.updating = noteServerBuild(m.build, m.built); // the server runs a newer build: this page reloads into it (client/update.js)
      if (m.sig && m.sig !== mapSignature(S.map)) {
        // the server runs a newer world than this page: reload into it (client/update.js does the rest) - unless both
        // are the same build, when a reload would build the same different world again (it used to, every 30 s, on
        // iPhones: shared/dmath.js): then play on, and tell the server so it shows up in its log
        if (!(m.build && String(m.build) === myBuild().v)) { if (S.updating) $('play').disabled = true; else outdatedBuild(m.sig); return; }
        if (!S.mismatchSaid) { S.mismatchSaid = true; console.warn('[map] this browser built a different city from the same build', mapSignature(S.map), 'vs', m.sig); send({ t: 'diag', what: `map signature ${mapSignature(S.map)} vs server ${m.sig} (${navigator.userAgent})` }); }
      }
      S.ents.clear(); S.pred = null; S.pending = [];
      for (const p of S.map.props) if (p.broken) { delete p.broken; const se = S.map.propSolid.get(S.map.props.indexOf(p)); if (se) se.off = false; }
      S.confirmedBreaks.clear(); S.predBreaks.clear();
      S.bayOpen = {}; for (const i of m.bays || []) S.bayOpen[i] = false;
      S.gateOpen = {}; S.gateAnim = {}; for (const gt of S.map.gates || []) for (const pr of gt.props) pr.off = false;
      for (const i of m.gates || []) setGate(i, true);
      S.forageGone = new Set(m.forage || []);
      S.map.props.forEach((p, i) => { if (p.lit0 !== undefined && !!p.lit !== p.lit0) setFire(i, p.lit0, false); });
      for (const [i, lit] of m.fires || []) setFire(i, lit, false);
      for (const i of m.broken || []) { S.confirmedBreaks.add(i); setPropBroken(i, 0, false); }
      if (S.map.levels) { S.map.levels.broken = new Map(); for (const k of m.barriers || []) S.map.levels.broken.set(k, true); }
      if (S.art2) S.art2.resync(); // (back in after a reconnect: the art v2 bakes follow the server's broken props and barriers)
      S.xing = m.xing || []; S.xingAnim = S.xing.map((x) => (x.d ? 1 : 0));
      S.tt = { l: m.tt || [], at: performance.now() / 1000 };
      S.rides = new Map(); for (const r of m.rides || []) rideOn(r);   // (the balloons already up, the riders on the wheel)
      S.portals = portalCovers(S.map);
      S.ground.clear();
      $('t-status').textContent = m.practice ? 'Offline practice city ready' : S.updating ? 'Updating to the latest version...' : `Signed in as ${m.name}`;
      $('play').disabled = false;
      if (S.playing) startPlaying();
      setupDev();
      sendView();
      break;
    case 'sp': for (const d of m.e) { const e = ent(d.id, d.k); if (d.app && d.app.lk && d.app.t === undefined) lookApp(d); e.d = d; } break;
    case 'looks': S.looks = m; if (S.creator) S.creator.onState(m); if (m.open) openCreator(m.open); else if (!m.picked && S.playing && topOverlay() !== 'creator') openCreator('start'); break;   // (a new player picks a starting look first; the home's wardrobe opens the wheel or the mirror)
    case 'ds': for (const id of m.ids) S.ents.delete(id); break;
    case 'ev': for (const ev of m.l) onEvent(ev); break;
    case 'me':
      S.me = m; if (m.pedId) S.myPedId = m.pedId; S.hud && S.hud.setMe(m);
      syncTaxiDest();
      if (m.ride && !(S.rides && S.rides.has(m.ride.id))) rideOn(m.ride);   // (back in mid-ride)
      bag.refresh(); wheel.refresh(); wpick.refresh();
      if (m.dead) { wheel.close(); wpick.close(); if (topOverlay() === 'inv') closeOverlay('inv'); }
      if (!!m.devMode !== !!S.devMode) { S.devMode = !!m.devMode; setupDev(); if (topOverlay() === 'devpw' && S.devMode) closeOverlay('devpw'); requestPlayers(); if (S.devMode && S.openDevOnEnter) { S.openDevOnEnter = false; openOverlay('dev'); } }
      { const g = document.getElementById('dev-god'); if (g) g.classList.toggle('on', !!m.god); }
      break;
    case 'menu': S.hud.openMenu(m); break;
    case 'look': S.look = { x: m.x, y: m.y, t0: performance.now(), dur: (m.s || 6) * 1000, px: null, py: null }; break;   // (a telescope: the view swings out there a while)
    case 'stars': S.stars = { what: m.what, seed: m.seed | 0, dur: m.s || 9, t0: performance.now(), px: null, py: null }; break;   // (the observatory: the night sky through the eyepiece)
    case 'pong': S.rtt = performance.now() - m.ts; break;
    case 'board': phone.onBoard(m); break;
    case 'feed': phone.onFeed(m); break;
    case 'bounties': phone.onBounties(m); break;
    case 'transit': S.transit = m; if (S.hud) S.hud.transit = m; phone.onTransit(m); if (S.bigmap) mapwp.refreshLegend(); break;
    case 'plist': S.plist = m; if (S.hud) S.hud.plist = m.l; renderPlayers(); if (S.bigmap) mapwp.refreshPlayers(); renderDevPlayers(); break;
    case 'kicked': S.hud && S.hud.toast(m.reason, 'bad'); $('t-status').textContent = m.reason; break;
    case 'full': $('t-status').textContent = `City is full (${m.max} players). Retrying soon...`; break;
    case 'build': noteServerBuild(m.v, m.at); break; // a new build went live: update this page (client/update.js)
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
    st = { x: s.self.x, y: s.self.y, a: s.self.a, vx: s.self.vx, vy: s.self.vy, av: s.self.av, rev: !!(s.selfFlags & 32), lz: s.self.lz, slip: s.self.stamina, spin: s.self.rollT, launch: s.self.rdx, flat: !!(e.flags & VF.FLAT), dead: !!(e.flags & VF.DEAD) };
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

// A train is solid, standing at a platform or moving (the server pushes people out of its cars): predict that too, so
// walking into the side of one holds you there instead of jittering back.
function pushOutOfTrains(s) {
  if ((s.lz || 0) > 0.3) return;
  for (const e of S.ents.values()) {
    if (e.kind !== K.TRAIN || (e.flags & 1) || !e.d || !e.buf.length) continue;   // (subway cars run underground)
    const def = TRAIN_CARS[e.d.c] || TRAIN_CARS[1], b = e.buf[e.buf.length - 1];   // (where the server last had it)
    if (Math.abs(b.x - s.x) > def.L / 2 + 40 || Math.abs(b.y - s.y) > def.L / 2 + 40) continue;
    const h = circleVsObb(s.x, s.y, PED_RADIUS, b.x, b.y, b.a, def.L / 2, def.W / 2);
    if (h) { s.x += h.nx * h.depth; s.y += h.ny * h.depth; }
  }
}
function stepPred(inp) {
  const P = S.pred;
  if (!P) return;
  if (P.kind === 'ped') { pedStep(P.s, inp, DT, S.map, P.mods); pushOutOfTrains(P.s); }
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
  const spec = !!(S.spec && S.spec.on);
  if (spec && !inOverlay) { S.spec.pad(input.padAxes); if (input.menuBack) exitSpectate(); if (input.padX) specSave(); if (input.padY) specPanel(); }
  if (spec) { /* the free camera has the pad */ } else if (!inOverlay && input.padStart && S.playing) { if (S.bigmap) toggleMap(false); openOverlay('pause'); }
  if (!inOverlay && !S.playing) titlePad();
  if (!spec && !inOverlay && input.padCall && S.playing && !S.hud.menuOpen && !S.bigmap) callCruiser();
  if (!spec && !inOverlay && input.padPhone && S.playing && !S.hud.menuOpen && !S.bigmap) openPhone();
  // the bag (D-pad →) and the quick wheel (hold View, point with the right stick, let go)
  if (!spec && !inOverlay && input.padRight && S.playing && !S.hud.menuOpen && !S.bigmap) toggleBag();
  if (!spec && input.padView && !S.padViewHeld && canWheel() && !wheel.open) { wheel.show(); S.wheelAt = performance.now(); S.padWheel = true; }
  if (wheel.open && S.padWheel && input.padAxes) wheel.point(input.padAxes.rx * 100, input.padAxes.ry * 100);
  if (!input.padView && S.padViewHeld && wheel.open && S.padWheel) { S.padWheel = false; wheel.release(performance.now() - (S.wheelAt || 0) < 250); }
  S.padViewHeld = input.padView;
  const menuUp = !S.playing || S.hud.menuOpen || S.bigmap || inOverlay || wheel.open || wpick.open || spec;
  // the button that closed a menu (B / Esc / Enter...) is still held when the menu goes away -
  // ignore the action buttons until they're released, or B would instantly reopen the shop menu
  if (S.menuWasUp && !menuUp) S.suppressBits = IN.ACTION | IN.DIVE | IN.VEHICLE | IN.FIRE | IN.THROW | IN.USE;
  S.menuWasUp = menuUp;
  if (menuUp || performance.now() < (S.inputMuteUntil || 0)) inp = { bits: 0, mx: 0, my: 0, aim: inp.aim };
  if (S.suppressBits) { const held = inp.bits & S.suppressBits; inp.bits &= ~S.suppressBits; S.suppressBits &= held; }
  if (inp.bits & IN.AIMING) { S.lastAim = inp.aim; S.lastAimAt = performance.now(); S.lastFire = !!(inp.bits & IN.FIRE); }
  golfSwingStep(inp);
  S.seq++;
  const mxq = quantizeAxis(inp.mx), myq = quantizeAxis(inp.my), aq = quantizeAngle(inp.aim);
  send(encodeInput(S.seq, inp.bits, mxq, myq, aq));
  const dq = { seq: S.seq, bits: inp.bits, mx: dequantizeAxis(mxq), my: dequantizeAxis(myq), aim: dequantizeAngle(aq) };
  S.pending.push(dq);
  if (S.pending.length > 60) S.pending.shift();
  if (S.pred) { S.pred.prev = { ...S.pred.s }; stepPred(dq); }
  // predict our own melee swing so punches animate the instant you click
  if ((dq.bits & IN.FIRE) && S.pred && S.pred.kind === 'ped' && S.me && !S.me.carrying && !S.me.dead && !(S.me.golf && S.me.golf.near) && !S.me.hoops) {   // (by your golf ball it's a swing of the club)
    const w = WEAPONS[S.me.weapon];
    if (w && w.type === 'melee' && S.loopClock >= (S.localSwingReady || 0)) {
      const e = S.ents.get(S.ctrlId);
      if (e) { e.swingAt = S.loopClock; e.swingSide = (e.swingSide || 0) ^ 1; e.localSwing = S.loopClock; }
      S.localSwingReady = S.loopClock + w.cd;
      if (w.plasma && e) plasmaSwing(e); else sfx('swing', 1);
    }
  }
  // menu navigation by gamepad / number keys
  if (inOverlay) { /* overlay consumed the pad */ } else if (S.hud.menuOpen) {
    if (input.menuNav) S.hud.navMenu(input.menuNav);
    if (input.menuSelect) S.hud.choose(S.hud.menuFocus);
    if (input.menuBack) S.hud.closeMenu();
  } else if (S.me && S.me.dead && !spec) deathPad();
  else if (inCell() && !spec && (input.padY || input.menuSelect)) payBail();
  const n = takeNumberPick();
  if (n !== null && !spec) {
    if (S.hud.menuOpen) S.hud.choose(n);
    else if (S.me && S.me.weapons[n]) send({ t: 'weapon', id: S.me.weapons[n].id });
  }
}

// ---------------------------------------------------------------------------
// Events from the server
// A campfire lit or put out (server campfires.js): the prop and every renderer's copy of it follow; lit0 keeps how the map
// laid it out, for a reconnect
function setFire(i, lit, withFx) {
  const p = S.map.props[i];
  if (!p || p.t !== 'campfire') return;
  if (p.lit0 === undefined) p.lit0 = !!p.lit;
  if (!!p.lit === !!lit) return;
  p.lit = lit ? 1 : 0;
  S.ground.invalidateAt(p.x, p.y);
  if (S.art2) S.art2.propChanged(i);
  if (!withFx) return;
  const fx = S.fx, v = distVol(p.x, p.y);
  if (lit) { fx.sparks(p.x, p.y - 4, 8); fx.ring(p.x, p.y, 18, 'rgba(255,170,70,', 0.4); sfx('ignite', v); }
  else { for (let k = 0; k < 6; k++) fx.smoke(p.x + (Math.random() - 0.5) * 16, p.y - 4 + (Math.random() - 0.5) * 8, false); sfx('douse', v); }
}
function setPropBroken(i, a, withFx) {
  const p = S.map.props[i];
  if (!p || p.broken) return;
  p.broken = { a };
  const se = S.map.propSolid.get(i);
  if (se) se.off = true;
  S.ground.invalidateAt(p.x, p.y);
  if (S.art2) S.art2.propChanged(i);
  if (!withFx) return;
  smashFx(p, i, a);
}

// What a smashed thing does: the object itself goes flying (a piece of its own sprite, spinning),
// and what it's made of / holds spills out - water from a hydrant, mail from a mailbox, rubbish
// from a bin, planks from a bench, glass from a bus shelter, papers from a news box.
const BOARD = ['#e8e8e8', '#c8262b', '#2f5fc8', '#e8b923'];
const PAPER = ['#f2f0e6', '#e8e4d4', '#ffffff', '#d8dce8'];
const MAIL = ['#f4f1e4', '#e6dcc0', '#ffffff', '#c8d8f0', '#f0d0b0'];
const TRASH = ['#5a4a32', '#7a6a4a', '#3f5a2e', '#c8c2b4', '#8a2a24', '#2f3a5a', '#e8d070', '#9a9a9a'];
const GLASS = ['#d8ecff', '#b8d8f0', '#ffffff', '#9ec4e0'];
const WOODC = ['#7a5230', '#a87444', '#5a3a1e', '#8a6038'];
function smashFx(p, i, a) {
  const fx = S.fx, now = S.loopClock, t = p.t;
  const vol = distVol(p.x, p.y);
  const v1 = atlas.ready && !!atlas.frames && !S.art2; // (pieces of the classic sprites fly only in the classic view)
  const fr = v1 ? atlas.frames['prop_' + t] : null;
  const sz = PROP_SIZES[t] || [24, 24];
  const throwIt = (scale = 1, spin = 9, up = 220) => {
    if (!fr) return;
    const sp = 140 + Math.random() * 120;
    const aa = a + (Math.random() - 0.5) * 0.7;
    fx.chunk(atlas.imgs[fr.a], fr.x, fr.y, fr.w, fr.h, sz[0] * scale, sz[1] * scale, p.x, p.y, Math.cos(aa) * sp, Math.sin(aa) * sp, up, (Math.random() < 0.5 ? -1 : 1) * spin, 7);
  };
  // pieces: the sprite cut into quarters, scattered
  const shatter = (n = 4, speed = 160) => {
    if (!fr) return;
    for (let k = 0; k < n; k++) {
      const qx = k % 2, qy = (k >> 1) % 2;
      const aa = a + (Math.random() - 0.5) * 2.2, sp = speed * (0.5 + Math.random());
      fx.chunk(atlas.imgs[fr.a], fr.x + qx * fr.w / 2, fr.y + qy * fr.h / 2, fr.w / 2, fr.h / 2, sz[0] / 2, sz[1] / 2, p.x + (qx - 0.5) * sz[0] / 2, p.y + (qy - 0.5) * sz[1] / 2, Math.cos(aa) * sp, Math.sin(aa) * sp, 120 + Math.random() * 160, (Math.random() - 0.5) * 18, 5 + Math.random() * 3);
    }
  };
  const bits = (n, colors, speed = 180, up = 90, size = 2.5) => {
    for (let k = 0; k < n; k++) {
      const aa = a + (Math.random() - 0.5) * 2.4, sp = speed * (0.3 + Math.random());
      fx.spawn(4, p.x, p.y, Math.cos(aa) * sp, Math.sin(aa) * sp, 0.6 + Math.random() * 0.6, size * (0.6 + Math.random() * 0.8), colors[k % colors.length], 0, up * (0.5 + Math.random()));
    }
  };
  if (isHydrant(t)) {
    throwIt(1, 14, 320); // the hydrant pops off its stand and tumbles away
    fx.splash(p.x, p.y, 30);
    for (let k = 0; k < 24; k++) { const aa = Math.random() * 6.283, sp = 60 + Math.random() * 200; fx.spawn(6, p.x, p.y, Math.cos(aa) * sp, Math.sin(aa) * sp, 0.8 + Math.random() * 0.6, 3 + Math.random() * 3, Math.random() < 0.5 ? '#ffffff' : '#9fd4ff', 4, 220 + Math.random() * 160); }
    // most of the time the gushing water pools across the street (the same for everyone)
    if (hashAt(i, 77) < 0.7) S.wx.addPool(p.x + Math.cos(a) * 30, p.y + Math.sin(a) * 18, 70 + hashAt(i, 78) * 60, now);
    sfx('clang', vol); sfx('gush', vol);
  } else if (t === 'mailbox') {
    throwIt(1, 10, 260);
    fx.flutter(p.x, p.y, 30, MAIL, Math.random, 200, 200);
    bits(6, ['#2350c8', '#1b3a8a', '#c8262b'], 160);
    sfx('clang', vol); sfx('paper', vol);
  } else if (t.startsWith('news')) {
    throwIt(1, 8, 200);
    fx.flutter(p.x, p.y, 24, PAPER, Math.random, 180, 170);
    sfx('paper', vol); sfx('hit', vol);
  } else if (t === 'trashcan' || t === 'bags' || t.startsWith('dump')) {
    const big = t.startsWith('dump');
    if (big) shatter(4, 120); else throwIt(1, 10, 220);
    fx.flutter(p.x, p.y, big ? 18 : 10, PAPER.concat(['#c8c2b4']), Math.random, 150, 140);
    bits(big ? 34 : 18, TRASH, big ? 220 : 170, 110, 3);
    fx.litter(p.x + Math.cos(a) * 20, p.y + Math.sin(a) * 14, big ? 40 : 20, TRASH, big ? 70 : 42, now);
    for (let k = 0; k < (big ? 4 : 2); k++) fx.smoke(p.x, p.y, false); // a puff of dust and stink
    sfx(big ? 'clang' : 'hit', vol); sfx('paper', vol * 0.6);
  } else if (t === 'billboard') {
    const bf = v1 ? atlas.frames['prop_billboard' + (p.ad || 0)] : null;
    if (bf) for (let k = 0; k < 6; k++) { const qx = k % 3, qy = (k / 3) | 0, aa = a + (Math.random() - 0.5) * 2; fx.chunk(atlas.imgs[bf.a], bf.x + qx * bf.w / 3, bf.y + qy * bf.h / 2, bf.w / 3, bf.h / 2, 44, 42, p.x + (qx - 1) * 44, p.y - 30 + qy * 30, Math.cos(aa) * 120, Math.sin(aa) * 120, 200, (Math.random() - 0.5) * 10, 7); }
    fx.flutter(p.x, p.y - 30, 20, BOARD, Math.random, 180, 240);
    fx.sparks(p.x, p.y - 30, 12);
    sfx('crash', vol); sfx('clang', vol);
  } else if (t === 'tent') {
    throwIt(1, 6, 160);
    fx.flutter(p.x, p.y, 10, [['#e07b20', '#f29a3e'], ['#3f8a3a', '#5fae52'], ['#2f6fc8', '#4f8fe8']][p.v || 0].concat(['#e8e4d4']), Math.random, 120, 120);
    sfx('hit', vol);
  } else if (t === 'upole') {
    fx.sparks(p.x, p.y - 46, 22);
    bits(8, ['#6a4a2e', '#8a6440', '#d8dce4'], 160, 140, 3);
    sfx('crash', vol * 0.8); sfx('clang', vol);
  } else if (t === 'dspeaker' || t === 'scope') {
    throwIt(1, 10, 220);
    bits(6, ['#7a7e86', '#2a2c33', '#2f9a8a'], 150, 100, 2);
    sfx('clang', vol * 0.8);
  } else if (t === 'phonebox') {
    throwIt(1, 8, 200);
    bits(26, GLASS, 200, 120, 2);
    bits(8, ['#c8262b', '#a01c20'], 180, 110, 3);
    fx.litter(p.x, p.y + 4, 18, GLASS, 30, now);
    sfx('glass', vol); sfx('clang', vol * 0.6);
  } else if (t === 'crates') {
    shatter(4, 170);
    bits(22, WOODC, 220, 130, 3.4);
    fx.litter(p.x, p.y, 12, WOODC, 34, now);
    sfx('crash', vol * 0.7);
  } else if (t === 'acunit') {
    throwIt(1, 10, 200);
    bits(10, ['#a6a9ae', '#7a7e86', '#2a2c33'], 180, 100, 2.5);
    fx.sparks(p.x, p.y, 8);
    sfx('clang', vol);
  } else if (t === 'trashpile') {
    fx.flutter(p.x, p.y, 12, PAPER.concat(['#c8c2b4']), Math.random, 150, 140);
    bits(30, TRASH, 200, 110, 3);
    fx.litter(p.x, p.y, 34, TRASH, 56, now);
    sfx('hit', vol); sfx('paper', vol * 0.6);
  } else if (t === 'busstop') {
    shatter(4, 170);
    bits(40, GLASS, 240, 140, 2.2);
    fx.litter(p.x, p.y + 6, 36, GLASS, 46, now);
    fx.flutter(p.x, p.y, 6, ['#f2c21b', '#ffffff', '#2f5fc8'], Math.random, 120, 140); // the timetable and the poster
    sfx('glass', vol * 1.2); sfx('crash', vol * 0.6);
  } else if (t.startsWith('bench') || t === 'pbench' || t === 'picnic' || t.startsWith('pallet') || t === 'lumber' || t === 'planks' || t === 'cart' || t.startsWith('foodcart')) {
    shatter(4, 180);
    bits(20, WOODC, 220, 120, 3.4);
    fx.litter(p.x, p.y, 10, WOODC, 36, now);
    sfx('crash', vol * 0.7);
  } else if (t.startsWith('vend') || t === 'atm') {
    shatter(4, 120);
    bits(24, GLASS, 200, 110, 2);
    bits(14, ['#c8262b', '#2f9a5a', '#e8d070', '#2350c8'], 200, 120, 3); // cans and snacks
    fx.sparks(p.x, p.y, 10);
    sfx('glass', vol); sfx('clang', vol);
  } else if (t === 'drum') {
    throwIt(1, 16, 260);
    fx.decal(5, p.x + Math.cos(a) * 18, p.y + Math.sin(a) * 12, a, 18, '#1a1a1e', now, 0.7); // an oil slick
    sfx('clang', vol);
  } else if (t === 'cone' || t === 'barrier' || t === 'tires' || t === 'spool') {
    throwIt(1, 12, 240);
    sfx('thud', vol);
  } else if (t.startsWith('umbrella')) {
    throwIt(1, 6, 300);
    sfx('hit', vol);
  } else {
    const c = debrisColors(t);
    for (let k = 0; k < 14; k++) {
      const aa = a + (Math.random() - 0.5) * 1.8, sp = 60 + Math.random() * 180;
      fx.spawn(4, p.x, p.y, Math.cos(aa) * sp, Math.sin(aa) * sp, 0.5 + Math.random() * 0.4, 2 + Math.random() * 2.5, c[k % 3], 0, 60 + Math.random() * 90);
    }
    if (t.startsWith('tree') || t.startsWith('palm') || t.startsWith('shrub') || t.startsWith('bush') || t.startsWith('flower') || t.startsWith('planter') || t === 'potted') {
      fx.flutter(p.x, p.y, 18, ['#3f7f2c', '#5fa03a', '#2f6a24', '#7aa848'], Math.random, 120, 120);
    }
    if (t.startsWith('planter') || t === 'potted') fx.litter(p.x, p.y, 14, ['#5a3a1e', '#6a4a2a', '#3f7f2c'], 26, now); // soil
    sfx('hit', vol * 1.3);
  }
}

function distVol(x, y) { const d = Math.hypot(x - S.cam.x, y - S.cam.y); return Math.max(0, 1 - d / 1100); }
// The plasma blade through the air: its hum, and a blue arc round the one swinging it, as far as it reaches
const PLASMA_I = WEAPONS.plasma.i;
function plasmaSwing(a) {
  S.fx.slash(a.rx, a.ry, a.ra || 0, 34, 'rgba(120,190,255,', 0.2, 4, true);
  sfx('hum', distVol(a.rx, a.ry));
}

function onEvent(ev) {
  soundEvent(ev, S);   // its sound, placed where it happened (client/sound/events.js): the sfx calls below then stay quiet
  const now = S.loopClock;
  const fx = S.fx;
  switch (ev.e) {
    case 'toast': S.hud.toast(ev.text, ev.tone); if (ev.tone === 'bad') sfx('bad'); else if (ev.tone === 'good') sfx('cash', 0.6); else if (ev.tone === 'warn') sfx('alert', 0.7); break;
    case 'shot': {
      const w = WEAPON_BY_INDEX[ev.w];
      fx.tracer(ev.x1, ev.y1, ev.x2, ev.y2);
      if (w && w.silenced) { sfx('swing', distVol(ev.x1, ev.y1) * 0.5); break; } // a suppressed cough, no muzzle flash
      S.flashes.push({ x: ev.x1, y: ev.y1, t: 0.065, a: Math.atan2(ev.y2 - ev.y1, ev.x2 - ev.x1), r: 170 });
      fx.spawn(4, ev.x1, ev.y1, 0, 0, 0.05, 6, '#fff3b0');
      sfx(w && (w.id === 'shotgun' || w.id === 'rifle' || w.id === 'rocket' || w.id === 'psniper' || w.id === 'pshotgun' || w.id === 'huntrifle') ? 'heavy' : 'shot', distVol(ev.x1, ev.y1));
      break;
    }
    case 'blood': if (ev.g) fx.bulletHit(ev.x, ev.y, ev.a, now); else fx.blood(ev.x, ev.y, ev.a, ev.n, now); sfx('hit', distVol(ev.x, ev.y)); break;
    case 'drip': fx.drip(ev.x, ev.y, now); break; // a bleeding person's trail
    case 'death': {
      const e = S.ents.get(ev.id);
      if (e && ev.k) { e.deadK = ev.k; e.deathAt = S.loopClock; }   // (pedLook plays the fall: to the knees, spun round, slumping)
      if (ev.k === 'halved') {   // the plasma blade: cut in two, the wound seared shut - a scorch, smoke and sparks, no pool of blood
        fx.decal(3, ev.x, ev.y, Math.random() * 6.28, 9, '#111', now, 0.55);
        fx.sparks(ev.x, ev.y, 10); for (let k = 0; k < 4; k++) fx.smoke(ev.x, ev.y, false);
        fx.ring(ev.x, ev.y, 22, 'rgba(255,170,90,', 0.35);
        if (e) e.smokeUntil = S.loopClock + 5;
      } else fx.decal(5, ev.x - Math.cos(ev.a) * 4, ev.y - Math.sin(ev.a) * 4, ev.a, 14, '#6a0a10', now, 0.9);
      break;
    }
    // blades (server combat.js melee): a killing blow that's a finisher - a stab (a deep thrust) or a slash (a long cut
    // across) - with a heavier hit, more blood and the camera's kick; the plasma blade sears where it cuts (sparks and a
    // hiss, no blood) and now and then turns a bullet aside
    case 'finisher': {
      const a = S.ents.get(ev.id), v = S.ents.get(ev.t), near = distVol(ev.x, ev.y);
      if (v) { v.hitAt = S.loopClock; v.hitA = ev.a; }
      fx.blood(ev.x, ev.y, ev.a, ev.k === 'stab' ? 10 : 14, now);
      if (ev.k === 'slash') fx.slash(a ? a.rx : ev.x - Math.cos(ev.a) * 18, a ? a.ry : ev.y - Math.sin(ev.a) * 18, ev.a, 26, 'rgba(255,255,255,', 0.24, 3);
      else fx.ring(ev.x, ev.y, 12, 'rgba(200,24,32,', 0.25);
      sfx(ev.k === 'stab' ? 'stab' : 'slash', near * 1.3);
      if (ev.id === S.myPedId || ev.t === S.myPedId) S.cam.shake = Math.max(S.cam.shake, 6);
      else if (near > 0.85) S.cam.shake = Math.max(S.cam.shake, 3);
      break;
    }
    case 'sizzle': fx.sparks(ev.x, ev.y, 7); fx.smoke(ev.x, ev.y, false); fx.ring(ev.x, ev.y, 14, 'rgba(120,190,255,', 0.25); sfx('sear', distVol(ev.x, ev.y)); break;
    case 'deflect': fx.sparks(ev.x, ev.y, 6); fx.slash(ev.x, ev.y, ev.a, 13, 'rgba(140,200,255,', 0.16, 2, true); sfx('zing', distVol(ev.x, ev.y)); break;
    case 'react': { // a hit: the stagger (and the hit flash) - a shove on the heels, or forward from behind
      const e = S.ents.get(ev.id);
      if (e) { e.reactAt = S.loopClock; e.reactD = ev.d; e.reactA = ev.a; e.hitAt = S.loopClock; e.hitA = ev.a; e.barUntil = S.loopClock + 4; }
      if (ev.id === S.myPedId) S.cam.shake = Math.max(S.cam.shake, 3);
      break;
    }
    case 'crash': fx.sparks(ev.x, ev.y, 4 + Math.round(ev.p * 8)); sfx('crash', distVol(ev.x, ev.y) * (0.4 + ev.p)); if (distVol(ev.x, ev.y) > 0.8) S.cam.shake = Math.max(S.cam.shake, ev.p * 6); break;
    case 'explode': fx.explosion(ev.x, ev.y, ev.r, now); sfx('explode', distVol(ev.x, ev.y)); S.cam.shake = Math.max(S.cam.shake, 14 * distVol(ev.x, ev.y)); S.flashes.push({ x: ev.x, y: ev.y, t: 0.55, r: ev.r * 4, kind: 'boom' }); break;
    case 'spark': fx.sparks(ev.x, ev.y, 3); break;
    case 'taser': fx.tracer(ev.x1, ev.y1, ev.x2, ev.y2, 'rgba(120,200,255,'); fx.sparks(ev.x2, ev.y2, 4); sfx('taser', distVol(ev.x1, ev.y1)); break;
    case 'spray': // pepper spray: an orange mist cone
      for (let k = 0; k < 18; k++) { const aa = ev.a + (Math.random() - 0.5) * 0.8, sp = 120 + Math.random() * 160; fx.spawn(5, ev.x, ev.y, Math.cos(aa) * sp, Math.sin(aa) * sp, 0.45 + Math.random() * 0.25, 2 + Math.random() * 2, k & 1 ? 'rgba(255,150,60,.75)' : 'rgba(255,205,120,.7)', 9); }
      sfx('spray', distVol(ev.x, ev.y)); break;
    case 'spikes': S.spikes.set(ev.id, { x: ev.x, y: ev.y, a: ev.a, half: ev.half, until: performance.now() + ev.left * 1000 }); break;
    case 'spikesgone': S.spikes.delete(ev.id); break;
    case 'pop': fx.sparks(ev.x, ev.y, 6); fx.smoke(ev.x, ev.y, false); sfx('pop', distVol(ev.x, ev.y)); break;
    case 'swing': {
      const a = S.ents.get(ev.id), mine = !!(a && a.localSwing && S.loopClock - a.localSwing < 0.6);
      if (a && !mine) { a.swingAt = S.loopClock; a.swingSide = ev.side || 0; }
      if (mine) break;   // (your own swing played the moment you pressed)
      if (a && a.extra === PLASMA_I) plasmaSwing(a);   // (the plasma blade hums through the air, a blue arc behind it)
      else if (ev.id !== S.myPedId) sfx('swing', distVol(ev.x, ev.y));
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
    case 'foot': fx.decal(2, ev.x, ev.y, ev.a, 1, '#7a0d12', now, ev.f !== undefined ? 0.25 + 0.55 * ev.f : 0.8); break; // tracked prints fade as the soles dry
    case 'garagedoor': S.garageOpen[ev.home] = performance.now() + 2600; break;
    case 'baydoor': S.bayOpen[ev.i] = ev.open; sfx('door', 0.8); break;
    case 'gate': setGate(ev.i, ev.open); break;
    case 'forage': if (ev.up) S.forageGone.delete(ev.i); else S.forageGone.add(ev.i); break;
    case 'xing': S.xing[ev.i] = { d: ev.d, b: ev.b }; break;
    case 'tt': S.tt = { l: ev.l, at: performance.now() / 1000 }; break; // station clocks
    case 'gatebreak': fx.sparks(ev.x, ev.y, 6); for (let k = 0; k < 6; k++) fx.spawn(4, ev.x, ev.y, Math.cos(ev.a + (Math.random() - 0.5)) * 160, Math.sin(ev.a + (Math.random() - 0.5)) * 160, 0.5, 3, k % 2 ? '#f4f4f4' : '#c8262b'); sfx('crash', distVol(ev.x, ev.y) * 0.6); break;
    case 'trainhorn': { const d = Math.hypot(ev.x - S.cam.x, ev.y - S.cam.y); sfx(ev.s === 2 ? 'trainhorn' : 'trainhornshort', Math.max(0, 1 - d / 2400)); break; }
    case 'kick': sfx('thud', distVol(ev.x, ev.y) * 0.6); break;
    case 'golfhit': sfx(ev.k ? 'golfhit' : 'putt', distVol(ev.x, ev.y)); break;   // (golf: server/systems/golf.js)
    case 'golfcup': sfx('golfcup', distVol(ev.x, ev.y)); break;
    case 'golfsplash': sfx('splash', distVol(ev.x, ev.y)); break;
    case 'hoop': sfx(ev.in ? (ev.sw ? 'swish' : 'hoopin') : 'clank', distVol(ev.x, ev.y)); break;   // (shooting hoops: server/systems/hoops.js)
    case 'ride': rideOn(ev); if (ev.k === 'balloon') { const L = balloonSite(S.map); if (L) sfx('burner', distVol(L.launch.x, L.launch.y)); } break;   // a ride under way: the wheel's cab you're in, a balloon going up
    case 'rideend': if (S.rides) S.rides.delete(ev.id); break;
    case 'bells': { const d = Math.hypot(ev.x - S.cam.x, ev.y - S.cam.y), v = Math.max(0, 1 - d / 2600); for (let k = 0; k < (ev.n || 3); k++) setTimeout(() => sfx('churchbell', v * (k % 2 ? 0.85 : 1)), k * 1150); break; }   // (the mission's bells carry a long way)
    case 'alarm': sfx('alert', distVol(ev.x, ev.y)); S.alarms = (S.alarms || []).concat([{ x: ev.x, y: ev.y, until: performance.now() + 20000 }]); break;
    case 'goal': sfx('cash', 1); S.cam.shake = Math.max(S.cam.shake, 3); break;
    case 'teams': { S.venueTeams ??= {}; S.venueTeams[ev.v] = ev.t; S.pedTeam = new Map(); for (const t of Object.values(S.venueTeams)) t.forEach((ids, k) => { for (const id of ids) S.pedTeam.set(id, k); }); break; }
    case 'raceGo': S.fx.ring(ev.x, ev.y, 60, 'rgba(255,220,80,'); sfx('cash', 1); break;
    case 'checkpoint': S.fx.ring(ev.x, ev.y, 40, 'rgba(120,255,160,'); sfx('cash', 0.6); break;
    case 'barrier': { // a highway barrier smashed through: the stretch opens up (the deck rebaked without it: art2
      // barrierChanged) and its concrete goes flying out over the edge and down into the street below
      for (const k of ev.k) S.map.levels.broken.set(k, true);
      if (S.art2) S.art2.barrierChanged(ev.k, true);
      fx.sparks(ev.x, ev.y, 14);
      for (let k = 0; k < 28; k++) {
        const a = ev.a + (Math.random() - 0.5) * 1.9, sp = 120 + Math.random() * 360;
        const o = fx.spawn(9, ev.x + Math.cos(ev.a + 1.57) * (Math.random() - 0.5) * 70, ev.y + Math.sin(ev.a + 1.57) * (Math.random() - 0.5) * 70, Math.cos(a) * sp, Math.sin(a) * sp, 1.4 + Math.random() * 0.6, 3 + Math.random() * 3, k % 4 ? '#b4b0a6' : '#7d7a72', 0, 60 + Math.random() * 220);
        o.z = 285;   // (from up on the deck: art2 draws v1 heights at 0.3 - DECK_LIFT 88 px)
      }
      for (let k = 0; k < 6; k++) fx.smoke(ev.x + (Math.random() - 0.5) * 40, ev.y + (Math.random() - 0.5) * 40, false);
      sfx('crash', distVol(ev.x, ev.y)); sfx('glass', distVol(ev.x, ev.y) * 0.5); S.cam.shake = Math.max(S.cam.shake, 9 * distVol(ev.x, ev.y));
      break;
    }
    case 'barrierfix': for (const k of ev.k) S.map.levels.broken.delete(k); if (S.art2) S.art2.barrierChanged(ev.k, false); break;
    case 'propbreak': S.confirmedBreaks.add(ev.i); S.predBreaks.delete(ev.i); setPropBroken(ev.i, ev.a, true); break;
    case 'fire': setFire(ev.i, ev.lit, true); break;
    case 'propfix': {
      const p = S.map.props[ev.i];
      S.confirmedBreaks.delete(ev.i); S.predBreaks.delete(ev.i);
      if (p) { delete p.broken; const se = S.map.propSolid.get(ev.i); if (se) se.off = false; S.ground.invalidateAt(p.x, p.y); if (S.art2) S.art2.propChanged(ev.i); }
      break;
    }
    case 'geyser': { const g = S.geysers.find((q) => Math.hypot(q.x - ev.x, q.y - ev.y) < 4); if (g) delete g.seq; else S.geysers.push({ x: ev.x, y: ev.y, until: performance.now() + ev.d * 1000 }); fx.splash(ev.x, ev.y, 14); break; }
    case 'splash': fx.splash(ev.x, ev.y, ev.n || 10); sfx('splash', distVol(ev.x, ev.y)); break;
    case 'sinkboom': fx.splash(ev.x, ev.y, 44); fx.ring(ev.x, ev.y, 60, 'rgba(220,240,255,', 1.2); fx.ring(ev.x, ev.y, 36, 'rgba(255,190,90,', 0.5); for (let i = 0; i < 14; i++) fx.smoke(ev.x + (Math.random() - 0.5) * 50, ev.y + (Math.random() - 0.5) * 50, false); sfx('explode', distVol(ev.x, ev.y) * 0.45); S.cam.shake = Math.max(S.cam.shake, 6 * distVol(ev.x, ev.y)); break;
    case 'thud': sfx('thud', distVol(ev.x, ev.y)); break;
    case 'door': sfx('door', distVol(ev.x, ev.y)); break;
    case 'deposit': fx.ring(ev.x, ev.y - 20, 26, 'rgba(61,220,132,'); sfx('cash', distVol(ev.x, ev.y)); fx.floatText(ev.x, ev.y - 40, `Banked $${ev.n}`, '#3ddc84'); break;
    case 'loot': case 'cash': fx.ring(ev.x, ev.y, 20, 'rgba(120,255,160,'); sfx('cash', distVol(ev.x, ev.y)); if (ev.n) fx.floatText(ev.x, ev.y - 18, `+$${ev.n}`, '#7fe07f'); break;
    case 'pflash': S.flashes.push({ x: ev.x + Math.cos(ev.a || 0) * 8, y: ev.y + Math.sin(ev.a || 0) * 8 - 4, t: 0.09, r: 80, kind: 'photo' }); sfx('shutter', distVol(ev.x, ev.y) * 0.6); break;   // (someone taking photos with their phone: server npc.js spectacle)
    case 'camera': S.camAlert.set(ev.id, performance.now() + 2500); sfx('camera', distVol(S.map.cameras[ev.id].x, S.map.cameras[ev.id].y)); break;
    case 'revive': fx.ring(ev.x, ev.y, 30, 'rgba(120,255,160,', 3); fx.floatText(ev.x, ev.y - 20, '+', '#3ddc84'); break;
    case 'poof': case 'fade':
      if (ev.k === 'plasma') {   // the hooded stranger, gone in a flash of blue light (server wanderer.js)
        fx.ring(ev.x, ev.y, 44, 'rgba(120,180,255,', 0.6); fx.ring(ev.x, ev.y, 20, 'rgba(230,245,255,', 0.3); fx.sparks(ev.x, ev.y, 12);
        S.flashes.push({ x: ev.x, y: ev.y, t: 0.35, r: 260, kind: 'plasma' });
        sfx('hum', distVol(ev.x, ev.y) * 1.5); sfx('zing', distVol(ev.x, ev.y));
      } else if (ev.x !== undefined) fx.ring(ev.x, ev.y, 24, 'rgba(255,255,255,');
      break;
    case 'scream': fx.floatText(ev.x, ev.y - 18, 'AAAAH!', '#fff'); break;
    case 'say': fx.say(ev.id, ev.x, ev.y, ev.text); sfx('alert', distVol(ev.x, ev.y) * 0.5); break;
    case 'yelp': fx.floatText(ev.x, ev.y - 18, 'WHOA!', '#ffd36b'); break;
    case 'thanks': fx.floatText(ev.x, ev.y - 18, 'Thank you!', '#3ddc84'); break;
    case 'bite': fx.splash(ev.x, ev.y, 6); sfx('bite'); break;
    case 'cast': fx.splash(ev.x, ev.y, 4); break;
    case 'catch': fx.splash(ev.x, ev.y, 12); fx.floatText(ev.x, ev.y - 20, 'Caught!', '#7de0ff'); sfx('cash'); break;
    case 'heal': fx.ring(ev.x, ev.y, 26, 'rgba(120,255,160,'); break;
    // the hunt (combat.js arrows, wildlife.js): a bow loosed, an arrow striking home or into the ground, an animal's
    // roar as it charges, its swipe landing, birds bursting up
    case 'loose': sfx('twang', distVol(ev.x, ev.y)); break;
    case 'arrowhit': sfx('thwack', distVol(ev.x, ev.y)); break;
    case 'arrowstick': sfx('thwack', distVol(ev.x, ev.y) * 0.5); if (ev.wall) fx.sparks(ev.x, ev.y, 2); break;
    case 'roar': sfx(ev.k === 'cougar' || ev.k === 'bobcat' ? 'screech' : ev.k === 'goose' ? 'honk' : 'growl', distVol(ev.x, ev.y)); if (distVol(ev.x, ev.y) > 0.75 && (ev.k === 'grizzly' || ev.k === 'moose')) S.cam.shake = Math.max(S.cam.shake, 3); break;
    case 'maul': { const t = S.ents.get(ev.t); if (t) { t.hitAt = S.loopClock; t.hitA = ev.a; t.barUntil = S.loopClock + 4; } sfx('hit', distVol(ev.x, ev.y) * 1.4); if (ev.t === S.myPedId) S.cam.shake = Math.max(S.cam.shake, 8); break; }
    case 'flush': sfx('flutter', distVol(ev.x, ev.y)); fx.flutter(ev.x, ev.y, 5, ['#8a6a4a', '#c8b48a', '#4a3a2a'], Math.random, 70, 70); break;
    default: break;
  }
}

// ---------------------------------------------------------------------------
// World setup / UI wiring
// This page is an older build than the server's (it was updated while you played). Reload into the
// new one. GitHub Pages can lag the game server by a minute or two: if the reload still brings the
// old build, say so and try again shortly instead of reloading in a loop.
function outdatedBuild(sig) {
  // say so on the title screen too (it used to sit on "Connecting..." while the versions differed)
  $('t-status').textContent = 'The server and this page are on different versions (an update is rolling out) - retrying shortly...';
  $('play').disabled = true;
  let tried = null;
  try { tried = sessionStorage.getItem('cla.reloadFor'); } catch { tried = null; }
  try { localStorage.removeItem('cla.build'); } catch { /* storage blocked */ }
  if (tried !== sig) {
    try { sessionStorage.setItem('cla.reloadFor', sig); } catch { /* storage blocked */ }
    if (S.hud) S.hud.toast('The game was just updated - loading the new version...', 'info');
    setTimeout(() => location.reload(), 600);
    return;
  }
  if (S.hud) S.hud.toast('A new version is still rolling out - retrying in 30 seconds...', 'warn');
  try { sessionStorage.removeItem('cla.reloadFor'); } catch { /* storage blocked */ }
  setTimeout(() => { try { sessionStorage.setItem('cla.reloadFor', sig); } catch { /* blocked */ } location.reload(); }, 30000);
}

// ---- the city from client/worldgen.js ------------------------------------------------------------------------
// boot.js starts building the city in a worker while the page loads (or reads back the copy this browser kept: client/
// worldcache.js). When the server's welcome comes first, it and every message after it wait here (holding) and run in
// order once the city is in. A different seed, or no worker, and the page builds the city itself, as before.
function holdForCity(m) {
  const job = window.CLA_WORLD, seed = m.seed >>> 0;
  if (!job || job.taken || job.failed || job.map || job.seed !== seed || (S.map && S.map.seed === seed)) return false;
  if (!S.hold || S.holdWs !== S.ws) { S.hold = []; S.holdWs = S.ws; }
  S.hold.push(m);
  $('t-status').textContent = 'Building the city...';
  $('play').disabled = true;
  if (!job.waiting) {
    job.waiting = true;
    job.promise.then((data) => { job.map = cityFromData(data); }, (e) => { console.warn('[city] the worker could not build it - building it here', e); job.failed = true; })
      .then(releaseHeld);
  }
  return true;
}
function holding(ws, d) {
  if (!S.hold || S.holdWs !== ws) return false;
  S.hold.push(d);
  return true;
}
function releaseHeld() {
  const q = S.hold, ws = S.holdWs;
  S.hold = null; S.holdWs = null;
  if (!q || ws !== S.ws) return;   // (the connection was lost meanwhile: the next welcome takes the city)
  for (const d of q) {
    if (typeof d === 'string') { let m; try { m = JSON.parse(d); } catch { continue; } onText(m); }
    else if (d instanceof ArrayBuffer) onBinary(d);
    else onText(d);
  }
}
function forgetCity() { import('./worldcache.js').then((c) => c.dropWorld()).catch(() => {}); }

function setupWorld(seed, here = false) {
  let t = performance.now();
  const job = window.CLA_WORLD;
  if (!here && job && job.map && job.seed === (seed >>> 0)) {
    // built (or read back from this browser's copy) by client/worldgen.js while the page loaded
    S.map = job.map; job.map = null; job.taken = true; S.mapFrom = job.from;
    if (S.mapFrom === 'cache') { delete S.map._sig; mapSignature(S.map); }   // (its fingerprint worked out from what was read)
    loadSpan('city', job.ms);
  } else {
    S.map = generateCity(seed); S.mapFrom = 'page';
    loadSpan('city', performance.now() - t);
  }
  loadMark('city'); LOAD.city = S.mapFrom; t = performance.now();
  S.flora = new Flora(S.map); S.flora.configure(gfx); if (atlas.ready) S.flora.registerAtlas(atlas); // procedural vegetation (render/flora): before the ground is baked
  S.ground = new GroundCache(S.map, LOW_MEM ? 12 : 24); // (consoles give the browser little graphics memory)
  S.wx = new Weather(S.map);
  S.poleAt = null;
  S.wx.onThunder = () => sfx('thunder', 1);
  S.light ||= new Lighting();
  S._hw = null;
  S.buildings = new BuildingLayer(S.map, S.ground);
  S.spec = createSpectator({
    map: S.map,
    players: () => (S.plist && S.plist.l) || [], mobile: input.device === 'touch',
  });
  S.hud = new HUD(S.map, (poi, opt) => send({ t: 'menu', poi, opt }), () => {});
  S.hud.onRespawn = (choice) => send({ t: 'respawn', choice });
  S.router = createRouter(S.map);   // the GPS route to your waypoint (client/route.js)
  S.hud.onDown = (a) => downAct(a);
  loadSpan('setup', performance.now() - t);
  startArt2(S.map);
}

// ---- the classic (v1) art ------------------------------------------------------------------------------
// The sprite atlas, the hand-drawn prop sheets and the body sheets: ~250 MB of pictures once decoded. The
// new renderer draws none of it, so it loads only when something still needs it - the classic renderer
// (no WebGL2, ?art=1, or the graphics lost for good), the subway tunnel, the city tour, the spectator map.
function ensureV1Art() {
  if (v1ArtP) return v1ArtP;
  loadBodies('assets/');
  v1ArtP = loadAtlas('assets/', gfx.lighting >= 2).then(() => {
    if (!atlas.ready || !atlas.frames) return;
    registerNewProps(); registerCountryProps();
    if (S.flora) S.flora.registerAtlas(atlas);
    if (S.ground) S.ground.clear(); // (chunks drawn before the art arrived are drawn again with it)
  }).catch((e) => console.warn('[v1 art]', e));
  return v1ArtP;
}
// The classic renderer draws the frame only with ?art=1, or while you ride the subway (the tunnel view
// is still classic art). While the new renderer starts (or restarts) the world stays dark instead.
function v1Draws(F) {
  const on = !ART2_WANTED || !!F.sub;
  if (on) ensureV1Art();
  return on;
}

// ---- the art v2 world renderer (client/art2/game/host.js) --------------------------------------------
// Loaded only when wanted and built per city. Until it is ready, while riding the subway (the tunnel
// view) and for good if it fails, the v1 renderer draws the frame (the overlay canvas takes a whole v1
// frame just as well).
const worldCv = $('world');
let world2Shown = false;
// The art from the server (server/artcdn.js): the game server bakes the world's chunks and the bake workers download them
// (worker.js) - online only (the offline practice has no server), and not with ?artcdn=0
function artCdnBase() {
  if (S.practice || /[?&]artcdn=0\b/.test(location.search)) return null;
  try { const u = new URL(serverUrl()); return `${u.protocol === 'wss:' ? 'https:' : 'http:'}//${u.host}/art/`; } catch { return null; }
}
function showWorld2(on) { if (on === world2Shown || !worldCv) return; world2Shown = on; worldCv.classList.toggle('hidden', !on); }
function art2Draws(F) { const on = !!(S.art2 && S.art2.ready && !F.sub); showWorld2(on); return on; }
async function startArt2(map) {
  if (!ART2_WANTED || !worldCv) return;
  if (S.art2) { S.art2.dispose(); S.art2 = null; showWorld2(false); }
  const token = (S.art2Token = (S.art2Token || 0) + 1);
  let mod;
  try { mod = await import('./art2/game/host.js'); } catch (e) { art2Failed('the renderer could not load: ' + ((e && e.message) || e)); return; }
  S.art2Off = null;
  if (token !== S.art2Token || S.map !== map) return; // a newer city arrived meanwhile
  // what the renderer borrows from here: how people look and pose, body heights, seats, the birds
  const api = { pedLook, pedPose, vehLift, selfPos, walkInAt, umbrellaSprite, birds, PED_BUILD_SCALE, CSCALE, SEAT_BIKE, SEAT_JETSKI, RIDER_H, UMBRELLA_COLORS };
  let w = null;
  // (a city read back from this browser's copy is read by the bake workers themselves: no copy sent from here)
  const worldKey = S.mapFrom === 'cache' && window.CLA_WORLD ? window.CLA_WORLD.key : null;
  try { w = await mod.World2.create({ S, map, canvas: worldCv, gfx, lowMem: LOW_MEM, api, onFail: art2Failed, worldKey, artKey: window.CLA_ART_KEY || null, artCdn: artCdnBase() }); } catch (e) { console.error('[art2]', e); w = null; }
  if (token !== S.art2Token || S.map !== map) { if (w) w.dispose(); return; }
  if (!w) { art2Failed(mod.World2.lastWhy || 'WebGL2 is not available'); return; }
  S.art2 = w; S.art2At = performance.now();
  loadMark('renderer');
  w.onLoad = (k, ms) => { loadMark(k); if (ms !== undefined) loadSpan(k, ms); };   // (workers, art, screen)
  for (const [k, ms] of w.loadQ || []) w.onLoad(k, ms);
  const el = $('art2-err'); if (el) el.classList.add('hidden');
  w.resize(W, H, DPR);
}
// Out past the map's edge (shared/border.js): a pulsing arrow at your feet pointing the shortest way back - amber
// while you're only warned, red once the sea is holding you back - and the banner over the screen.
const EDGE_I = { d: 0, nx: 0, ny: 0 };
function drawEdgeArrow(sp, e, now) {
  const a = Math.atan2(e.ny, e.nx), pulse = 0.5 + 0.5 * Math.sin(now * 6), r = 44 + pulse * 7, hold = e.d > EDGE_SLOW;
  g.save();
  g.translate(sp.x + e.nx * r, sp.y + e.ny * r - 8); g.rotate(a);
  g.globalAlpha = 0.7 + 0.3 * pulse;
  g.lineJoin = 'round'; g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,.65)'; g.fillStyle = hold ? '#ff5a4a' : '#ffd36b';
  for (const off of [0, -13]) {
    g.beginPath(); g.moveTo(16 + off, 0); g.lineTo(-6 + off, -13); g.lineTo(-1 + off, 0); g.lineTo(-6 + off, 13); g.closePath();
    g.stroke(); g.fill();
    g.globalAlpha *= 0.6;
  }
  g.restore();
}
let edgeWarnState = -1;
function edgeWarn(k) {
  if (k === edgeWarnState) return;
  edgeWarnState = k;
  const el = $('edgewarn');
  if (!el) return;
  el.classList.toggle('hidden', !k); el.classList.toggle('hold', k === 2);
  el.innerHTML = k === 2 ? 'TURN BACK<small>The open sea won\'t let you go any further</small>' : k === 1 ? 'LEAVING THE CITY\'S WATERS<small>Turn back - follow the arrow</small>' : '';
}

// With the art v2 world the overlay canvas also carries what v1 draws as marks inside its world pass:
// tracers, rings and floating text, flying debris, price tags, team rings, the glow round valuable
// crates (world transform set).
function drawArt2Marks(F) {
  const fx = S.fx, now = F.now;
  g.save();
  g.lineWidth = 2;
  for (const t of fx.tracers) { g.strokeStyle = t.color + (1 - t.t / 0.08).toFixed(2) + ')'; g.beginPath(); g.moveTo(t.x1, t.y1); g.lineTo(t.x2, t.y2); g.stroke(); }
  for (const r of fx.rings) { const k = r.t / r.max; g.strokeStyle = r.color + (1 - k).toFixed(2) + ')'; g.lineWidth = 3; g.beginPath(); g.arc(r.x, r.y, r.r * (0.3 + k), 0, 6.28); g.stroke(); }
  fx.drawArcs(g);   // (blade streaks)
  for (const c of fx.chunks) {
    if (!c.on || !c.img) continue;
    const fade = c.life > c.rest ? Math.max(0, 1 - (c.life - c.rest) / 1.5) : 1;
    g.globalAlpha = fade; g.save(); g.translate(c.x, c.y - c.z * 0.6); g.rotate(c.a); g.drawImage(c.img, c.sx, c.sy, c.sw, c.sh, -c.w / 2, -c.h / 2, c.w, c.h); g.restore();
  }
  g.globalAlpha = 1;
  fx.drawTexts(g);
  for (const v of F.vehs) if (v.d.fs) {
    const txt = `$${v.d.fs.toLocaleString()}`;
    g.font = 'bold 12px monospace'; g.textAlign = 'center';
    const w = g.measureText(txt).width + 10;
    g.fillStyle = '#fff8d0'; g.fillRect(v.rx - w / 2, v.ry - 9, w, 18);
    g.strokeStyle = '#c8262b'; g.lineWidth = 2; g.strokeRect(v.rx - w / 2, v.ry - 9, w, 18);
    g.fillStyle = '#c8262b'; g.fillText(txt, v.rx, v.ry + 4);
  }
  if (S.pedTeam) for (const p of F.peds) { const team = S.pedTeam.get(p.id); if (team === undefined) continue; g.strokeStyle = team === 0 ? '#ff3b3b' : '#3b8bff'; g.lineWidth = 3; g.beginPath(); g.ellipse(p.rx, p.ry + 4, 13, 8, 0, 0, 6.28); g.stroke(); }
  for (const c of F.crates) if (c.d.t >= 3 && (c.flags & 3) === 0) { g.globalAlpha = 0.5 + 0.3 * Math.sin(now * 4); g.strokeStyle = c.d.t === 4 ? '#ffd36b' : '#c07aff'; g.lineWidth = 2; g.beginPath(); g.arc(c.rx, c.ry, 18, 0, 6.28); g.stroke(); }
  g.restore();
}
// The new renderer couldn't start or stopped (no WebGL2, the graphics memory lost again and again, its
// workers failing). There is no classic renderer to fall back to any more: say why, and start it again (a
// few times, then a panel with the reason and a Try again button).
let art2Retries = 0;
function art2Failed(why) {
  console.warn('[art2] stopped:', why);
  if (S.art2) { try { S.art2.dispose(); } catch { /* already gone */ } S.art2 = null; }
  S.art2Off = why;
  showWorld2(false);
  if (S.art2At && performance.now() - S.art2At > 120000) art2Retries = 0; // (it had been running fine)
  if (art2Retries < 3) {
    art2Retries++;
    if (S.hud) S.hud.toast(`The graphics stopped (${why}) - restarting them...`, 'warn');
    setTimeout(() => { if (S.map && !S.art2) startArt2(S.map); }, 1500 * art2Retries);
    return;
  }
  let el = $('art2-err');
  if (!el) { el = document.createElement('div'); el.id = 'art2-err'; el.className = 'art2-err'; document.body.appendChild(el); }
  el.innerHTML = '<b>The graphics can\'t run here</b><p></p><button type="button">Try again</button>';
  el.querySelector('p').textContent = why;
  el.querySelector('button').onclick = () => { el.classList.add('hidden'); art2Retries = 0; if (S.map && !S.art2) startArt2(S.map); };
  el.classList.remove('hidden');
}

function startPlaying() {
  S.playing = true;
  initAudio();
  if (input.device === 'touch' && settings.autoFullscreen !== false) toggleFullscreen(true, true);
  $('title').classList.add('hidden');
  $('hud').classList.remove('hidden');
  if (S.me) S.hud.setMe(S.me);
  if (S.looks && !S.looks.picked && topOverlay() !== 'creator') openCreator('start');
}

// The debug menu: give weapons first, teleport anywhere second, the free camera third, then a section per
// feature (client/devcats.js: weather and time, me, the law, vehicles, trains, jobs, crime, events, shops, homes,
// nature) that spawns the thing or takes you to the nearest place it happens - one section open at a time, so
// it stays short on a pad. Everyone online sits in the right-hand column (left / right on a pad jumps across).
// Every button presses in, clicks, and pops a note saying what it did.
function devPress(b, label, run) {
  b.onclick = () => {
    b.classList.remove('pressed'); void b.offsetWidth; b.classList.add('pressed');
    clearTimeout(b._pt); b._pt = setTimeout(() => b.classList.remove('pressed'), 380);   // (lit while it presses in, then back)
    if (input.device !== 'gamepad') b.blur();
    sfx('click', 0.8);
    S.hud.toast(`🛠 ${label.replace(/^[^A-Za-z0-9+$]+/, '')}`, 'info');
    run();
  };
}
// commands that only change your own screen
function devLocal(c, extra) {
  if (c === '@bolt') { if (S.wx) S.wx.strike(Math.random() < 0.5); }   // (a bolt you can see: a near strike half the time)
  else if (c === '@fog') S.fogForce = extra ? { k: extra.k, spread: extra.spread } : null;
}
// Open the debug menu straight away, switching Dev Debug Mode on first if it's off (no password while the team
// and friends are testing; if the server asks for one after all, its prompt opens).
function openDebug() {
  if (S.dev || S.devMode) { if (topOverlay() !== 'dev') openOverlay('dev'); return; }
  if (!S.welcomed) return;
  S.openDevOnEnter = true;
  send({ t: 'devmode', pw: '' });
  setTimeout(() => { if (!S.devMode && S.openDevOnEnter) { S.openDevOnEnter = false; openOverlay('devpw'); } }, 2000);
}
function setupDev() {
  const box = $('dev');
  const on = S.dev || S.devMode;
  $('b-dev').classList.toggle('on', !!on);
  $('b-dev').title = on ? 'Debug menu' : 'Debug menu (switches Dev Debug Mode on)';
  if (!on) { box.classList.add('hidden'); $('dev-btn').classList.add('hidden'); if (topOverlay() === 'dev') closeOverlay('dev'); return; }
  box.innerHTML = `<div class="dev-head"><b>🐞 ${S.devMode ? 'DEBUG · your progress is kept' : 'DEBUG · PLAYTEST CHEATS'}</b><button class="dev-x" title="Close">✕</button></div><div class="dev-cols"><div class="dev-cmds"></div><div id="dev-players"></div></div>`;
  box.querySelector('.dev-x').onclick = () => closeOverlay('dev');
  const cmds = box.querySelector('.dev-cmds');
  const add = (label, cls, run) => { const b = document.createElement('button'); b.textContent = label; if (cls) b.className = cls; if (run) devPress(b, label, run); cmds.appendChild(b); return b; };
  // 1. weapons and tools, one press; anything else to anyone from the give panel under it
  add('🔫 Give every weapon + tools', 'dev-top', () => send({ t: 'dev', c: 'guns' }));
  // ...or just one: pick a weapon or tool and who gets it (you, or anyone online)
  const qgBox = document.createElement('div'); qgBox.id = 'dev-qg'; cmds.appendChild(qgBox);
  S.devQuickGive = buildQuickGive(qgBox, { send, press: devPress, players: () => (S.plist && S.plist.l) || [] });
  const giveBtn = add('🎁 Give anything to me or a player…', 'dev-give-toggle');
  const giveBox = document.createElement('div'); giveBox.id = 'dev-give'; giveBox.className = 'hidden'; cmds.appendChild(giveBox);
  S.devGive = buildGive(giveBox, { send, press: devPress, players: () => (S.plist && S.plist.l) || [] });
  giveBtn.onclick = () => {
    const open = giveBox.classList.toggle('hidden') === false;
    giveBtn.textContent = open ? '🎁 Give ▲ (hide)' : '🎁 Give anything to me or a player…';
    if (open) { requestPlayers(); S.devGive.refreshTargets(); }
  };
  // 2. teleport anywhere: a map of every district, station and landmark (built the first time it's opened)
  const tpBtn = add('📍 Teleport anywhere…', 'dev-tp-toggle');
  const tpBox = document.createElement('div'); tpBox.id = 'dev-tp'; tpBox.className = 'hidden'; cmds.appendChild(tpBox);
  tpBtn.onclick = () => {
    const open = tpBox.classList.toggle('hidden') === false;
    tpBtn.textContent = open ? '📍 Teleport ▲ (hide)' : '📍 Teleport anywhere…';
    if (open && !tpBox.childElementCount && S.map) buildTeleport(tpBox, S.map, (pl) => {
      sfx('click', 0.8);
      send({ t: 'dev', c: 'tp', x: Math.round(pl.x), y: Math.round(pl.y) });
      S.hud.toast(`🛠 Teleported to ${pl.name}`, 'info');
      closeOverlay('dev');
    });
  };
  // 3. the free camera
  add('🎥 Spectate (free camera)', 'dev-spec', () => enterSpectate());
  // then a section per feature, one open at a time
  const bodies = [];
  for (const sec of DEV_SECTIONS) {
    const head = add(`${sec.title}`, 'dev-sec');
    const body = document.createElement('div'); body.className = 'dev-sec-body hidden'; cmds.appendChild(body);
    bodies.push([sec.id, head, body]);
    for (const [label, c, extra] of sec.items) {
      const b = document.createElement('button'); b.textContent = label;
      if (c === 'god') { b.id = 'dev-god'; b.classList.toggle('on', !!(S.me && S.me.god)); }
      const goes = c === 'near' || c === 'train';
      devPress(b, label, () => { if (c[0] === '@') devLocal(c, extra); else send({ t: 'dev', c, ...(extra || {}) }); if (goes) closeOverlay('dev'); });
      body.appendChild(b);
    }
    head.onclick = () => {
      const open = body.classList.contains('hidden');
      for (const [, h, bd] of bodies) { bd.classList.add('hidden'); h.classList.remove('open'); }
      if (open) { body.classList.remove('hidden'); head.classList.add('open'); }
      S.devOpenSec = open ? sec.id : null;
      sfx('click', 0.5);
      if (input.device !== 'gamepad') head.blur();
    };
    if (S.devOpenSec === sec.id) { body.classList.remove('hidden'); head.classList.add('open'); }
  }
  if (S.devMode) add('⏏ Leave dev mode (keep my progress)', 'dev-leave', () => { send({ t: 'devmode', leave: true }); closeOverlay('dev'); });
  renderDevPlayers();
  box.classList.add('hidden');
  $('dev-btn').classList.remove('hidden');
  if (S.playing && S.dev) S.hud.toast(S.practice ? 'Offline practice: nothing here is saved. Tap 🐞 (or press `) for the cheats panel.' : 'Dev mode: tap 🐞 or press ` (backtick) for the playtest panel.', 'info');
}
function renderDevPlayers() {
  if (S.devGive) S.devGive.refreshTargets(); // the give menu's "give to" list
  if (S.devQuickGive) S.devQuickGive.refreshTargets();
  const el = $('dev-players');
  if (!el) return;
  const all = (S.plist && S.plist.l) || [];
  const ps = all.filter((q) => !q.me);
  el.innerHTML = `<b>PLAYERS ONLINE (${all.length || 1})</b>` + (ps.length ? '' : '<p class="dev-none">Just you right now.</p>');
  for (const q of ps) {
    const row = document.createElement('div'); row.className = 'dev-pl';
    row.innerHTML = `<span>${esc(q.n)}${q.dm ? ' <i>dev</i>' : ''}${q.god ? ' 🛡' : ''}<small>${esc(q.d || '')}${q.dead ? ' · down' : ''}</small></span>`;
    const acts = [['goto', '📍 Go to'], ['bring', '🧲 Bring'], ['gunsp', '🔫 Weapons + tools'], ['healp', '❤ Heal'], ['godp', q.god ? '🛡 Invincible: ON' : '🛡 Invincible: off'], ...(q.dm ? [] : [['grant', '🛠 Give dev']])];
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
  optText($('p-players'), `Players online${ps.length ? ` (${ps.length})` : ''}`);
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
function requestTransit() { if (S.welcomed) send({ t: 'phone', a: 'transit' }); }   // the bus lines and where their buses are
// while you have a taxi, the server is told your waypoint (where the driver takes you; a new one re-routes the cab)
function syncTaxiDest() {
  if (!(S.me && S.me.taxi)) { S.taxiSent = null; return; }
  const w = S.waypoint, k = w ? `${Math.round(w.x)},${Math.round(w.y)}` : '-';
  if (k === S.taxiSent) return;
  S.taxiSent = k;
  send({ t: 'phone', a: 'taxi', op: 'dest', x: w ? w.x : null, y: w ? w.y : null, label: w ? w.label : '' });
}
// keep the lists fresh while one is on screen
setInterval(() => {
  if (S.playing && overlays.some((o) => o === 'players' || o === 'bigmap' || o === 'dev' || o === 'pause')) requestPlayers();
  if (S.playing && S.bigmap) requestTransit();
}, 2500);
function submitDevPw() {
  const pw = $('devpw-in').value;
  if (!pw) return;
  send({ t: 'devmode', pw });
  $('devpw-in').value = '';
}
$('devpw-go').onclick = submitDevPw;
$('devpw-in').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submitDevPw(); } else if (e.key === 'Escape') closeOverlay('devpw'); });

const practiceGo = () => { initAudio(); if (input.device === 'touch' && settings.autoFullscreen !== false) toggleFullscreen(true, true); startPractice(); };
const playGo = () => { startPlaying(); if (S.dev) S.hud.toast('Dev mode: press ` (backtick) for the playtest panel.', 'info'); };
$('practice').onclick = firstPlay(practiceGo);
$('play').onclick = firstPlay(playGo);

initInput(canvas, {
  onKey(k) {
    if (S.spec && S.spec.on && !topOverlay() && specKey(k)) return;
    if (topOverlay() === 'tutorial' && tutorialKey(k)) return;
    if (topOverlay() === 'creator' && S.creator && S.creator.key(k)) return;
    if (inCell() && !topOverlay() && (k === 'KeyB' || k === 'Enter')) { payBail(); return; }
    const deathUp = S.playing && S.me && S.me.dead && !topOverlay();   // (the choices only take keys once they're showing)
    if (deathUp && !(S.hud && S.hud.deathRevealed)) { if (['KeyH', 'KeyJ', 'KeyC', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS'].includes(k)) return; }
    else if (deathUp && S.me.down && !S.me.down.finished) {
      if (k === 'KeyH') { downAct('help'); return; }
      if (k === 'KeyJ') { downAct(S.me.down.amb ? 'ambx' : 'amb'); return; }
      if (k === 'KeyC' && S.me.down.help) { downAct('cancel'); return; }
    }
    if (deathUp && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS'].includes(k)) { cycleDeathChoice(['ArrowLeft', 'ArrowUp', 'KeyA', 'KeyW'].includes(k) ? -1 : 1); return; }
    if (k === 'Escape' && topOverlay() === 'phone' && phone.screen !== 'home') { phone.back(); return; }
    if (k === 'Escape' && topOverlay() === 'bigmap' && mapwp.inGroup) { mapwp.back(); return; }
    if (topOverlay() === 'bigmap' && S.hud) { // zoom the city map: + / - (and C to find yourself)
      if (k === 'Equal' || k === 'NumpadAdd') { S.hud.zoomMap(1.5); return; }
      if (k === 'Minus' || k === 'NumpadSubtract') { S.hud.zoomMap(1 / 1.5); return; }
      if (k === 'KeyC') { const me = selfPos(); S.hud.centerMap(me.x, me.y); return; }
    }
    // menus with the keyboard: W/S or arrows move, Enter / Space / E selects, A/D or arrows change a setting
    if (topOverlay() && topOverlay() !== 'tutorial' && menuKey(k)) return;
    if (!topOverlay() && S.hud && S.hud.menuOpen) {
      if (k === 'ArrowUp' || k === 'KeyW') { S.hud.navMenu(-1); return; }
      if (k === 'ArrowDown' || k === 'KeyS') { S.hud.navMenu(1); return; }
      if (k === 'Enter' || k === 'Space') { S.hud.choose(S.hud.menuFocus); return; }
    }
    if (k === 'KeyI' && S.playing) { toggleBag(); return; }
    if (k === 'KeyX' && canWheel() && !wheel.open) {
      wheel.show(); S.wheelAt = performance.now();
      // start from where the mouse already is (after that the wheel itself tracks the pointer)
      const ms = mouseScreen(); if (performance.now() - (ms.movedAt || 0) < 4000) wheel.point(ms.x - innerWidth / 2, ms.y - innerHeight / 2);
      return;
    }
    if (k === 'Escape' && wheel.open) { wheel.close(); return; }
    if (k === 'KeyP' && S.playing && !topOverlay()) { openPhone(); return; }
    if (k === 'Escape') { if (topOverlay()) closeOverlay(); else if (S.hud?.menuOpen) S.hud.closeMenu(); else if (S.bigmap) toggleMap(false); else if (S.playing) openOverlay('pause'); }
    if (k === 'KeyM' && S.playing) toggleMap(!S.bigmap);
    if (k === 'KeyV' && S.playing && !topOverlay()) callCruiser();
    if (k === 'Backquote' && S.playing) { if (topOverlay() === 'dev') closeOverlay('dev'); else openDebug(); }
    if (k === 'Enter' && !S.playing && S.welcomed) $('play').click();
  },
  onKeyUp(k) { if (S.spec) S.spec.key(k, false); if (k === 'KeyX' && wheel.open) wheel.release(performance.now() - (S.wheelAt || 0) < 250); },
  onItems() { if (S.spec && S.spec.on) return; if (canWheel()) { if (wheel.open) wheel.close(); else wheel.show(true); } },
  onWeaponPick() { openWeaponPick(); },
  onDev() { if (!S.playing) return; if (topOverlay() === 'dev') closeOverlay('dev'); else openDebug(); },
  onMap() { if (S.playing) toggleMap(!S.bigmap); },
  onCruiser() { if (S.playing) callCruiser(); },
  onPhone() { if (S.playing) openPhone(); },
  onSettings() { openSettings(true); },
  onFullscreen() { toggleFullscreen(); },
});
input.onDevice = () => setTimeout(() => { onResize(); if (S.hud && S.me) { $('helpbox').dataset.sig = ''; S.hud.setMe(S.me); } }, 0);
detectDevice();

// Downed: call for help, the ambulance, give up waiting.
function downAct(a) {
  const dn = S.me && S.me.down;
  if (!dn || dn.finished) return;
  if (a === 'amb' && !dn.canAmb) { S.hud.toast(dn.ambUsed ? 'One ambulance per time you go down.' : `An ambulance needs $${dn.fee} in your bank.`, 'warn'); return; }
  sfx('click', 0.8);
  send({ t: 'down', a });
}

// In a cell (server custody.js): pay the bail and walk out now (or wait it out)
const inCell = () => !!(S.playing && S.me && S.me.custody && S.me.custody.s === 'cell' && !S.me.dead);
function payBail() {
  if (!inCell()) return;
  if (!S.me.custody.can) { S.hud.toast(`The bail is $${S.me.custody.bail} - you don't have it. Wait it out.`, 'warn'); return; }
  sfx('click', 0.8);
  send({ t: 'bail' });
}
$('j-bail').onclick = () => payBail();

function cycleDeathChoice(step) {
  const btns = [...document.querySelectorAll('#d-spawn .spawn-opt')];
  if (!btns.length) return;
  const cur = Math.max(0, btns.findIndex((b) => b.classList.contains('on')));
  const i = (cur + step + btns.length) % btns.length;
  S.deathFocus = i; btns[i].click();
}
// Death screen with a controller: D-pad / stick picks where to wake up, A confirms.
function deathPad() {
  // downed: X calls for help (again), Y the ambulance (or cancels it), B cancels the request (back to the countdown) -
  // once the choices are showing
  if (!(S.hud && S.hud.deathRevealed)) return;
  const dn = S.me && S.me.down;
  if (dn && !dn.finished) {
    if (input.padX) downAct('help');
    if (input.padY) downAct(dn.amb ? 'ambx' : 'amb');
    if (input.menuBack && dn.help) downAct('cancel');
  }
  const btns = [...document.querySelectorAll('#d-spawn .spawn-opt')];
  if (!btns.length) return;
  const step = input.menuNav || input.menuLR;
  if (step) cycleDeathChoice(step); // moving the highlight picks it
}

// ---- the bag + quick wheel ----------------------------------------------------------------------
const bag = createInventory({ el: $('inv'), send: (o) => send(o), me: () => S.me });
const wheel = createWheel({ el: $('wheel'), send: (o) => send(o), me: () => S.me });
// the weapon picker (touch: hold WPN or the weapon box): every weapon you carry, tap one to take it out
const wpick = createWeaponPicker({ el: $('wpick'), send: (o) => send(o), me: () => S.me });
function openWeaponPick() { if (wpick.open) { wpick.close(); return; } if (canWheel() && S.me.weapons && S.me.weapons.length > 1) { if (wheel.open) wheel.close(); wpick.show(); } }
function canWheel() { return S.playing && S.me && !S.me.dead && !(S.spec && S.spec.on) && !topOverlay() && !(S.hud && S.hud.menuOpen) && !S.bigmap; }
function toggleBag() {
  if (topOverlay() === 'inv') { closeOverlay('inv'); return; }
  if (!S.playing || !S.me || S.me.dead || topOverlay() || (S.hud && S.hud.menuOpen)) return;
  if (S.bigmap) toggleMap(false);
  wheel.close();
  openOverlay('inv');
}
$('b-bag').onclick = () => toggleBag();
// a sticky (touch) wheel: tap off the slots to put it away; with the mouse it follows the pointer
$('wheel').addEventListener('pointerdown', (e) => { if (e.target === $('wheel')) wheel.close(); });
$('wheel').addEventListener('pointermove', (e) => { if (wheel.open && e.pointerType === 'mouse') wheel.point(e.clientX - innerWidth / 2, e.clientY - innerHeight / 2); });
// every pop-up panel (bag, players, settings...) closes when you tap the dark space around it
for (const ov of document.querySelectorAll('.overlay')) {
  if (ov.id === 'tutorial') continue;
  ov.addEventListener('pointerdown', (e) => { if (e.target === ov && topOverlay() === ov.id) closeOverlay(ov.id); });
}

// ---- spectator (debug menu): a free camera over the whole city ----------------------------------
// Your character stays where it is (made invincible on the server); the camera flies anywhere. The
// city's art is drawn from what this browser already generates, so it never asks the server for
// more - people and vehicles show only where the server is already sending them (round you).
// the furthest out the spectator shows the new renderer's art: the chunks a view that size needs must fit its
// memory (about 28 of 768 px, 16 on a console); further out it shows the flat map
function specArtMinZoom() {
  for (const z of [0.4, 0.5, 0.6, 0.75, 0.9, 1.1]) if ((W / z / 768 + 2) * (H / z / 768 + 2) <= (LOW_MEM ? 16 : 28)) return z;
  return 1.3;
}
function enterSpectate() {
  if (!S.spec || !S.playing) return;
  if (topOverlay()) closeOverlay(topOverlay());
  if (S.bigmap) toggleMap(false);
  if (S.hud && S.hud.menuOpen) S.hud.closeMenu();
  wheel.close();
  const me = selfPos();
  S.spec.enter(me.x, me.y);
  send({ t: 'dev', c: 'spectate', on: true });
  document.body.classList.add('spectating');
  $('spec-pad').classList.remove('hidden');
  buildSpecPanel();
  $('spec').classList.remove('hidden', 'min');
  S.specPlistAt = 0;
}
function exitSpectate() {
  if (!S.spec || !S.spec.on) return;
  S.spec.exit();
  send({ t: 'dev', c: 'spectate', on: false });
  document.body.classList.remove('spectating');
  $('spec-pad').classList.add('hidden');
  $('spec').classList.add('hidden');
  specPointers.clear();
  S.suppressBits = IN.ACTION | IN.DIVE | IN.VEHICLE | IN.FIRE | IN.THROW | IN.USE;
}
// keys while spectating: movement / zoom go to the camera; Esc leaves, H hides the panel,
// C finds you, P saves a screenshot. Returns true when the key was used.
function specKey(k) {
  if (k === 'Escape') { exitSpectate(); return true; }
  if (k === 'KeyH') { specPanel(); return true; }
  if (k === 'KeyC') { const me = selfPos(); S.spec.center(me.x, me.y); return true; }
  if (k === 'KeyP') { specSave(); return true; }
  if (k === 'Backquote') return false; // the debug menu still opens over it
  S.spec.key(k, true);
  return true;
}
function specPanel() {
  const el = $('spec');
  if (!el.classList.contains('hidden') && !el.classList.contains('min')) el.classList.add(input.device === 'touch' ? 'min' : 'hidden');
  else el.classList.remove('hidden', 'min');
}
function specName(ext, scale = 1) {
  const t = S.spec.viewTiles(W, H);
  const d = S.map.districtAt(S.spec.state.x, S.spec.state.y);
  const mode = S.spec.state.layers.schematic ? 'schematic' : 'art';
  const slug = (d && d.name ? d.name : 'city').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `cla_${slug}_${mode}_tiles-x${t.x0}-${t.x1}_y${t.y0}-${t.y1}${scale > 1 ? `_${scale}x` : ''}.${ext}`;
}
function downloadCanvas(cv, name) {
  cv.toBlob((blob) => {
    if (!blob) { S.hud.toast('Could not make the image (too big for this browser).', 'warn'); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    S.hud.toast(`Saved ${name}`, 'good');
  }, 'image/png');
}
// the screen as it is (what you see, at screen resolution): the new renderer's picture is taken right after
// the next frame draws it (render: S.specGrab), the flat view straight away
function specSave() {
  if (!S.spec || !S.spec.on) return;
  sfx('click', 0.8);
  if (S.specArt) { S.specGrab = (cv) => downloadCanvas(cv, specName('png')); return; }
  S.spec.render(g, W, H, DPR, 0, S.loopClock);
  downloadCanvas(canvas, specName('png'));
}
// the same view again with up to 4x the detail (tiles baked finer, over a few frames)
async function specHiRes(btn) {
  if (!S.spec || !S.spec.on || S.specBusy) return;
  if (S.specArt) { S.hud.toast('Hi-res pictures come from the schematic view - saving the art view as you see it.', 'info'); specSave(); return; }
  const k = S.spec.snapshotScale(W, H);
  if (k <= 1) { S.hud.toast('This close in the screen already shows full detail - saving it as it is.', 'info'); specSave(); return; }
  S.specBusy = true;
  const was = btn.textContent;
  btn.textContent = `Rendering ${k}x…`;
  try {
    const cv = await S.spec.snapshot(W, H, k, (f) => { btn.textContent = `Rendering ${Math.round(f * 100)}%`; });
    if (cv) downloadCanvas(cv, specName('png', k));
  } finally { S.specBusy = false; btn.textContent = was; }
}
function buildSpecPanel() {
  const el = $('spec');
  if (el.dataset.built) { syncSpecPanel(); return; }
  el.dataset.built = '1';
  const touch = input.device === 'touch', pad = input.device === 'gamepad';
  el.innerHTML = `<button class="sp-mini">🎥 Spectator ▾</button><h2>🎥 SPECTATOR</h2><div class="sp-read"></div>
    <div class="sp-layers"></div>
    <div class="sp-btns"><button class="sp-me">⌖ Find me</button><button class="sp-png">📸 Save PNG</button><button class="sp-hi">🖼 Hi-res PNG</button><button class="sp-hide">▴ Hide panel</button><button class="sp-exit" style="grid-column: span 2">✕ Exit spectator</button></div>
    <div class="sp-legend hidden"><b>Schematic key</b><div class="sp-key">${SCHEMATIC_KEY.map(([c, n]) => `<span><i style="background:${c}"></i>${n}</span>`).join('')}</div><p class="sp-hint">Black outlines: buildings. White dashes: painted lots (one concept image each).</p></div>
    <p class="sp-hint">${touch ? 'Drag to fly, pinch to zoom.' : pad ? 'Left stick flies, RT / LT zoom, X saves a PNG, Y hides this panel, B exits.' : 'WASD / arrows fly (Shift faster), E / Q or wheel zoom, drag to pan. C finds you, P saves a PNG, H hides this panel, Esc exits.'} The file name carries the tile coordinates on screen, so a drawing over it can be matched back to the map.</p>`;
  const lay = el.querySelector('.sp-layers');
  for (const [id, label] of SPEC_LAYERS) {
    const l = document.createElement('label');
    l.innerHTML = `<input type="checkbox" data-l="${id}"> ${label}`;
    l.querySelector('input').onchange = (e) => { S.spec.setLayer(id, e.target.checked); syncSpecPanel(); };
    lay.appendChild(l);
  }
  el.querySelector('.sp-mini').onclick = () => el.classList.remove('min');
  el.querySelector('.sp-me').onclick = () => { const me = selfPos(); S.spec.center(me.x, me.y); };
  el.querySelector('.sp-png').onclick = () => specSave();
  el.querySelector('.sp-hi').onclick = (e) => specHiRes(e.currentTarget);
  el.querySelector('.sp-hide').onclick = () => el.classList.add('min');
  el.querySelector('.sp-exit').onclick = () => exitSpectate();
  syncSpecPanel();
}
function syncSpecPanel() {
  const el = $('spec'), L = S.spec.state.layers;
  for (const i of el.querySelectorAll('.sp-layers input')) i.checked = !!L[i.dataset.l];
  el.querySelector('.sp-legend').classList.toggle('hidden', !L.schematic);
}
// once a frame while spectating: the readout, and who's where (every few seconds)
function specTick() {
  const now = performance.now();
  if (now - (S.specPlistAt || 0) > 3000) { S.specPlistAt = now; requestPlayers(); }
  if (now - (S.specReadAt || 0) < 250) return;
  S.specReadAt = now;
  const st = S.spec.state, t = S.spec.viewTiles(W, H);
  const d = S.map.districtAt(st.x, st.y);
  const n = S.spec.loading();
  const r = $('spec').querySelector('.sp-read');
  if (r) r.innerHTML = `${d ? d.name : ''} · zoom ${(st.z * 100).toFixed(st.z < 0.1 ? 1 : 0)}% · ${S.specArt ? 'art' : st.layers.schematic ? 'schematic' : 'flat map (zoom in for the art)'}${n ? ` · loading ${n}` : ''}<small>tiles x ${t.x0}-${t.x1}, y ${t.y0}-${t.y1}</small>`;
}
// mouse wheel, drag, and two-finger pinch on the spectator layer
const specPointers = new Map();
let specPinch = null;
$('spec-pad').addEventListener('wheel', (e) => { e.preventDefault(); if (S.spec && S.spec.on) S.spec.zoomBy(Math.pow(1.0015, -e.deltaY), e.clientX, e.clientY, W, H); }, { passive: false });
$('spec-pad').addEventListener('pointerdown', (e) => {
  if (!S.spec || !S.spec.on) return;
  try { $('spec-pad').setPointerCapture(e.pointerId); } catch { /* the pointer is already gone */ }
  specPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  $('spec-pad').classList.add('drag');
  specPinch = null;
});
$('spec-pad').addEventListener('pointermove', (e) => {
  const p = specPointers.get(e.pointerId);
  if (!p || !S.spec || !S.spec.on) return;
  if (specPointers.size === 1) { S.spec.pan(e.clientX - p.x, e.clientY - p.y); p.x = e.clientX; p.y = e.clientY; return; }
  p.x = e.clientX; p.y = e.clientY;
  const [a, b] = [...specPointers.values()];
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, d = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
  if (specPinch) {
    S.spec.pan(mx - specPinch.mx, my - specPinch.my);
    S.spec.zoomBy(d / specPinch.d, mx, my, W, H);
  }
  specPinch = { mx, my, d };
});
const specUp = (e) => {
  specPointers.delete(e.pointerId);
  specPinch = null;
  if (!specPointers.size) $('spec-pad').classList.remove('drag');
};
$('spec-pad').addEventListener('pointerup', specUp);
$('spec-pad').addEventListener('pointercancel', specUp);
addEventListener('blur', () => { if (S.spec) S.spec.clearKeys(); });

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
  refocus: () => { ovFocus = startFocus(); focusOverlay(); },
  setFilter: (list) => { if (S.hud) S.hud.mapFilter = list; },
  myHomes: () => (S.me && S.me.homes) || [],
  players: () => (S.plist && S.plist.l) || [],
  transit: () => S.transit,
  police: () => !!(S.me && S.me.faction === 'enforcer'),
  zoom: (k) => S.hud && S.hud.zoomMap(k),
  findMe: () => mapFindMe(),
  markHere: () => mapMarkCentre(),
  device: () => input.device,
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
    if (p && p.broken) { delete p.broken; const se = S.map.propSolid.get(i); if (se) se.off = false; S.ground.invalidateAt(p.x, p.y); if (S.art2) S.art2.propChanged(i); }
  }
}
function checkWaypoint() {
  if (!S.waypoint || !S.playing) return;
  const p = selfPos();
  if (Math.hypot(p.x - S.waypoint.x, p.y - S.waypoint.y) < 140) { S.hud.toast(`Arrived: ${S.waypoint.label}`, 'good'); S.waypoint = null; S.hud.waypoint = null; }
}

// ---- tutorial: guided tour over the live city map ---------------------------------------------
// Paused (user, 2026-10-06): the tour is not offered and not kept in sync with the game until it is redesigned.
const TUTORIAL_ON = false;
let tutMap = null;
// `then` runs once the tour is finished or skipped (first play: tour first, then into the city)
function openTutorial(chapter, then) {
  ensureV1Art(); // (the tour draws the map with the classic art)
  const map = S.map || (tutMap ||= generateCity(1337));
  openOverlay('tutorial');
  startTutorial({ map, fallback: S.hud ? S.hud.mini : null, chapter, onClose: () => { if (overlays.includes('tutorial')) closeOverlay('tutorial'); if (then) setTimeout(then, 0); } });
}
// first-time players see the tour before their first game (SKIP is always there)
function firstPlay(go0) {
  return () => {
    // a new player picks graphics first (the recommended preset for this device is highlighted)
    const go = () => (gfxChosen() ? go0() : askGfx(go0));
    if (!TUTORIAL_ON || tutorialSeen()) { go(); return; }
    if (input.device === 'touch' && settings.autoFullscreen !== false) toggleFullscreen(true, true); // needs this tap's user gesture
    // ask in a popup (nothing on the title screen moves around)
    tutAskGo = go;
    if (tutorialSeenOld()) { $('tut-ask-h').textContent = 'THE CITY TOUR HAS BEEN UPDATED'; $('tut-ask-p').textContent = 'New places, rules and features since you last watched it. Take the tour?'; }
    openOverlay('tut-ask');
  };
}
let tutAskGo = null;

// ---- graphics: the first-run choice and the settings section ------------------------------------
let gfxAskGo = null;
function askGfx(go) {
  const d = getDevice(), rec = d.recommended;
  gfxAskGo = go;
  $('gfx-ask-p').innerHTML = `We detected <b>${d.label}</b>${d.why.length > 1 ? ` (${d.why.slice(1).join(' · ')})` : ''} and picked <b>${PRESET_NAMES[rec]}</b> graphics as the best fit. Play with that, or choose another setting now.`;
  const box = $('gfx-ask-opts');
  box.innerHTML = '';
  const DESC = { low: 'flat ground art, basic lighting - smoothest on older devices', medium: 'lighting, bloom and detailed still vegetation', high: 'living vegetation that sways and flattens, golden-hour glow, every shadow', ultra: 'high, with lusher vegetation and native sharpness - fast desktops' };
  const order = [rec, ...['low', 'medium', 'high', 'ultra'].filter((k) => k !== rec)];
  for (const k of order) {
    const b = document.createElement('button');
    b.className = 'opt' + (k === rec ? ' rec' : '');
    b.innerHTML = k === rec ? `▶ ${PRESET_NAMES[k]} (recommended)<br><small>${DESC[k]}</small>` : `${PRESET_NAMES[k]}<br><small>${DESC[k]}</small>`;
    b.onclick = () => { applyPreset(k); onGfxChange(); const g2 = gfxAskGo; gfxAskGo = null; closeOverlay('gfx-ask'); if (g2) g2(); };
    box.appendChild(b);
  }
  const c = document.createElement('button');
  c.className = 'opt'; c.textContent = '⚙ Customize each effect…';
  c.onclick = () => { applyPreset(rec); onGfxChange(); const g2 = gfxAskGo; gfxAskGo = null; closeOverlay('gfx-ask'); openOverlay('settings'); S.afterSettings = g2; };
  box.appendChild(c);
  openOverlay('gfx-ask');
}
// rebuild what depends on the graphics settings
function onGfxChange() {
  onResize();
  if (S.ground) S.ground.clear();         // baked ground art changes with the vegetation setting
  if (S.flora) S.flora.configure(gfx);
  if (gfx.lighting >= 2 && v1ArtP) loadGlowSheets();
  syncGfxPanel();
}
function buildGfxPanel() {
  const box = $('s-gfxbox');
  if (box.dataset.built) return;
  box.dataset.built = '1';
  const d = getDevice();
  box.innerHTML = `<h3>GRAPHICS</h3><p class="gfx-dev">${d.forced ? 'Set to' : 'Detected'} ${d.label}${d.consoleWhy && !d.forced ? ` (${d.consoleWhy})` : ''}${d.gpu ? ' · ' + d.why.slice(1, 2).join('') : ''} - recommended: ${PRESET_NAMES[d.recommended]}</p><p class="gfx-dev" id="s-renderer"></p>`;
  const row = (label, el, sub) => { const l = document.createElement('label'); l.className = 'srow' + (sub ? ' sub' : ''); const sp = document.createElement('span'); sp.textContent = label; l.append(sp, el); box.appendChild(l); };
  // what this device is, if the guess was wrong (consoles get the pad controls and the memory-light caches)
  const dv = document.createElement('select'); dv.id = 's-device';
  for (const [v, t] of [['', 'Detect automatically'], ['console', 'Xbox / games console'], ['pc', 'Computer'], ['mobile', 'Phone or tablet']]) { const o = document.createElement('option'); o.value = v; o.textContent = t; dv.appendChild(o); }
  dv.value = d.forced || '';
  dv.onchange = () => { setDeviceKind(dv.value || null); S.hud?.toast('Restarting to apply the device setting...', 'info'); setTimeout(() => location.reload(), 600); };
  row('This device', dv);
  const ps = document.createElement('select'); ps.id = 's-preset';
  for (const k of ['low', 'medium', 'high', 'ultra', 'custom']) { const o = document.createElement('option'); o.value = k; o.textContent = PRESET_NAMES[k] + (k === d.recommended ? ' (recommended)' : ''); ps.appendChild(o); }
  ps.onchange = () => { if (ps.value !== 'custom') { applyPreset(ps.value); onGfxChange(); } };
  row('Preset', ps);
  for (const [key, label, choices] of OPTIONS) {
    let el;
    if (choices === 'bool') { el = document.createElement('input'); el.type = 'checkbox'; el.onchange = () => { setOption(key, el.checked); onGfxChange(); }; }
    else {
      el = document.createElement('select');
      for (const [v, t] of choices) { const o = document.createElement('option'); o.value = String(v); o.textContent = t; el.appendChild(o); }
      el.onchange = () => { const v = choices.find(([x]) => String(x) === el.value)[0]; setOption(key, v); onGfxChange(); };
    }
    el.dataset.g = key;
    row(label, el, true);
  }
}
function syncGfxPanel() {
  buildGfxPanel();
  $('s-preset').value = gfx.preset;
  const rr = $('s-renderer');
  if (rr) rr.textContent = S.art2 ? `World graphics: new renderer, ${['Low', 'Medium', 'High', 'Ultra'][S.art2.q] || ''} detail${LOW_MEM ? ', low-memory mode' : ''}` : ART2_WANTED ? (S.art2Off ? `World graphics: basic (${S.art2Off})` : 'World graphics: new renderer starting...') : 'World graphics: basic (?art=1 in the address)';
  for (const el of $('s-gfxbox').querySelectorAll('[data-g]')) {
    const v = gfx[el.dataset.g];
    if (el.type === 'checkbox') el.checked = !!v; else el.value = String(v);
  }
}
$('tut-ask-watch').onclick = () => { const go = tutAskGo; tutAskGo = null; closeOverlay('tut-ask'); openTutorial(null, go); };
$('tut-ask-skip').onclick = () => { const go = tutAskGo; tutAskGo = null; markTutorialSeen(); closeOverlay('tut-ask'); if (go) go(); };
$('t-tutorial').onclick = () => openTutorial();
if (!TUTORIAL_ON) $('t-tutorial').classList.add('hidden');
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
// auto: on its own as play starts (where it can't - an iPhone - nothing is said; the tip is for a tap on the button)
function toggleFullscreen(force, auto = false) {
  const want = force ?? !isFullscreen();
  if (!fsSupported) {
    if (!auto) S.hud?.toast('This browser can\'t go fullscreen from a page. On iPhone: Share → Add to Home Screen, then open City Life Auto from your home screen.', 'info');
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
$('b-dev').onclick = () => { if (!S.playing) return; sfx('click', 0.6); if (topOverlay() === 'dev') closeOverlay('dev'); else openDebug(); };
$('ph-back').onclick = () => phone.back();
for (const ev of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(ev, () => { document.body.classList.toggle('fs', isFullscreen()); if (isFullscreen()) followRotation(); setTimeout(onResize, 50); });   // (older iPad Safari: the prefixed one)

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


// ---- overlays: pause menu, settings, controls, dev panel - all navigable with a gamepad --------
// Start (or Esc) opens the pause menu; D-pad / left stick moves, A selects, left/right changes a
// setting, B goes back. Mouse and touch just click.
const overlays = [];
let ovFocus = 0;
function topOverlay() { return overlays[overlays.length - 1] || null; }
function openOverlay(id) {
  if (topOverlay() === id) return;
  if (id === 'settings') { syncSettings(); syncAccount(); }
  if (id === 'controls') $('c-body').innerHTML = $('help-tpl').innerHTML;
  if (id === 'players' || id === 'bigmap' || id === 'dev') requestPlayers();
  if (id === 'bigmap') requestTransit();
  if (id === 'pause') {
    requestPlayers();
    document.querySelectorAll('#pause .online-only').forEach((b) => b.classList.toggle('hidden', !!S.practice));
    // the debug menu is the top option (it switches Dev Debug Mode on if needed); leaving dev mode lower down
    $('p-devmode').classList.toggle('hidden', !S.devMode || !!S.practice);
  }
  if (id === 'pause') { buildHubs('sys'); S.uiTopKey = ''; }
  if (id === 'pause') { document.querySelectorAll('#pause .cop-only').forEach((b) => b.classList.toggle('hidden', !(S.me && S.me.cruiser))); $('p-sub').textContent = S.practice ? 'Offline practice - the city keeps running while this menu is open.' : 'Online - the city keeps running while this menu is open.'; }
  overlays.push(id);
  $(id).classList.remove('hidden');
  if (id === 'inv') bag.show();
  if (id === 'dev') $('dev').classList.add('as-overlay');
  if (id === 'bigmap') S.bigmap = true;
  if (id === 'phone' && S.welcomed) send({ t: 'phone', a: 'out', on: true });   // (your phone in your hand for everyone: server phone.js)
  ovFocus = startFocus(); focusOverlay();
}
// where a pad's focus starts in a screen: its first menu line or panel button, not the hub's tabs along the top
function startFocus() { const i = focusables().findIndex((el) => !el.closest('.hub')); return i >= 0 ? i : 0; }
function closeOverlay(id = topOverlay()) {
  if (!id) return;
  const i = overlays.lastIndexOf(id);
  if (i >= 0) overlays.splice(i, 1);
  $(id).classList.add('hidden');
  if (id === 'inv') bag.hide();
  if (id === 'dev') $('dev').classList.remove('as-overlay');
  if (id === 'tutorial') stopTutorial();
  if (id === 'settings' && S.afterSettings) { const g2 = S.afterSettings; S.afterSettings = null; settings.gfxPreset ||= gfx.preset; setTimeout(g2, 0); }
  if (id === 'bigmap') { S.bigmap = false; if (S.hud) S.hud.mapFilter = null; }
  if (id === 'phone' && S.welcomed) send({ t: 'phone', a: 'out', on: false });
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
    if (el.type === 'range') { el.value = String(Number(el.value) + d * (Number(el.step) || 5)); el.dispatchEvent(new Event('input')); return true; }   // (the volume sliders)
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
  if (topOverlay() === 'creator' && S.creator) return S.creator.pad(input);
  const f = focusables();
  const el = f[ovFocus];
  if (topOverlay() === 'phone' && input.menuBack && phone.screen !== 'home') { phone.back(); return true; }
  if (topOverlay() === 'bigmap' && input.menuBack && mapwp.inGroup) { mapwp.back(); return true; }
  if (topOverlay() === 'bigmap' && input.padY) { mapMarkCentre(); return true; }
  if (topOverlay() === 'bigmap' && input.menuLR && el && (el.classList.contains('bm-catname') || el.classList.contains('bm-check'))) { const id = el.dataset.group || el.dataset.toggle; mapwp.toggle(id); return true; }
  if (topOverlay() === 'tutorial' && input.menuLR) { if (input.menuLR > 0) tutorialNext(); else tutorialPrev(); return true; }
  if (input.menuNav) { ovFocus += input.menuNav; focusOverlay(); }
  if (topOverlay() === 'dev' && el && el.tagName === 'BUTTON' && input.menuLR) { // the debug menu: across to the players and back
    const other = el.closest('#dev-players') ? $('dev').querySelector('.dev-cmds') : $('dev-players');
    const to = other && f.find((b) => other.contains(b));
    if (to) { ovFocus = f.indexOf(to); focusOverlay(); }
    return true;
  }
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
  syncGfxPanel();
  $('s-diag').checked = diag.on;
  $('s-smooth').checked = settings.smooth !== false;
  soundSettingsUi($('s-soundbox'));
}
// Account transfer: the login token is the account. Copy it here, paste it on another device;
// the one it replaces is kept so a wrong paste can be undone.
const PREV_TOKEN_KEY = TOKEN_KEY + '.prev';
const codeMsg = (t) => { $('s-code-msg').textContent = t; };
function syncAccount() {
  let prev = null;
  try { prev = localStorage.getItem(PREV_TOKEN_KEY); } catch { prev = null; }
  $('s-code-back').classList.toggle('hidden', !prev || prev === S.token);
  codeMsg('');
}
$('s-code-copy').onclick = async () => {
  if (!S.token) { codeMsg('Play online once first - your character gets its code then.'); return; }
  try { await navigator.clipboard.writeText(S.token); codeMsg('Copied. Paste it into Settings on your other device. Keep it private: whoever has it plays as you.'); }
  catch { $('s-code-in').value = S.token; $('s-code-in').select(); codeMsg('Copy the code from the box above (it\'s selected). Keep it private.'); }
};
function switchAccount(token, note) {
  try { if (S.token && S.token !== token) localStorage.setItem(PREV_TOKEN_KEY, S.token); localStorage.setItem(TOKEN_KEY, token); }
  catch { codeMsg('This browser blocks storage, so the code cannot be saved here.'); return; }
  codeMsg(note);
  setTimeout(() => location.reload(), 700);
}
$('s-code-use').onclick = () => {
  const t = $('s-code-in').value.trim();
  if (!/^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/.test(t)) { codeMsg('That doesn\'t look like a transfer code.'); return; }
  if (t === S.token) { codeMsg('That\'s the character you\'re already playing.'); return; }
  switchAccount(t, 'Switching character...');
};
$('s-code-back').onclick = () => {
  let prev = null;
  try { prev = localStorage.getItem(PREV_TOKEN_KEY); } catch { prev = null; }
  if (prev) switchAccount(prev, 'Going back to your previous character...');
};

function openSettings(on) { if (on) openOverlay('settings'); else closeOverlay('settings'); }

// ---- UI v2 (the concepts U1 / U7): the hub's round tabs, icons by the menu lines, the top bar, the hints ------------
// an icon (client/pixicons.js) in front of every [data-icon] menu line; the line's words in a span of their own
function decorate(root = document) {
  for (const el of root.querySelectorAll('[data-icon]')) {
    if (el.querySelector(':scope > img.pi')) continue;
    const t = document.createElement('span'); t.className = 't';
    while (el.firstChild && !(el.firstChild.nodeType === 1 && el.firstChild.classList.contains('note'))) t.appendChild(el.firstChild);
    el.prepend(t);
    t.insertAdjacentHTML('beforebegin', iconImg(el.dataset.icon, Number(el.dataset.iconSize) || 22));
  }
}
function optText(el, text) { const t = el && el.querySelector('.t'); if (t) t.textContent = text; else if (el) el.textContent = text; }
decorate();
// the HUD's round buttons: pixel icons (the debug one keeps its bug)
for (const [id, ic] of [['b-menu', 'menu'], ['b-phone', 'phone'], ['b-bag', 'bag'], ['b-map', 'map'], ['b-settings', 'sys'], ['b-fs', 'full']]) if ($(id)) $(id).innerHTML = iconImg(ic, 18);
// the hub: MAP, JOBS (the phone's job board), PEOPLE (who's online), GEAR (your bag), SYS (the pause menu)
const HUB = [['map', 'map', 'MAP'], ['jobs', 'jobs', 'JOBS'], ['people', 'people', 'PEOPLE'], ['gear', 'bag', 'GEAR'], ['sys', 'sys', 'SYS']];
function buildHubs(active) {
  for (const nav of document.querySelectorAll('.hub')) {
    if (!nav.childElementCount) {
      nav.innerHTML = HUB.map(([id, ic, lbl]) => `<button data-hub="${id}" title="${lbl}"><span class="ring">${iconImg(ic, 26)}</span><span class="lbl">${lbl}</span></button>`).join('');
      for (const b of nav.querySelectorAll('[data-hub]')) b.onclick = (e) => { e.stopPropagation(); hubGo(b.dataset.hub); };
    }
    for (const b of nav.querySelectorAll('[data-hub]')) b.classList.toggle('on', b.dataset.hub === active);
  }
}
function hubGo(id) {
  if (!S.playing) return;
  sfx('click', 0.6);
  // leave whatever is open, then open the tab's screen
  for (const ov of [...overlays].reverse()) if (ov !== 'settings') closeOverlay(ov);
  if (S.bigmap) toggleMap(false);
  if (id === 'map') toggleMap(true);
  else if (id === 'jobs') { if (topOverlay() !== 'phone') openOverlay('phone'); phone.openApp('jobs'); }
  else if (id === 'people') { openOverlay('players'); renderPlayers(); }
  else if (id === 'gear') toggleBag();
  else if (id === 'sys') openOverlay('pause');
}
// the hints along the bottom: [glyph, what it does] - 'pad:A' a pad button, 'key:M' a key, else a word
function footHints(list) {
  return list.map(([k, what]) => {
    const g = k.startsWith('pad:') ? `<span class="g-pad pad-${k.slice(4).toLowerCase()}">${k.slice(4)}</span>` : k.startsWith('key:') ? `<span class="g-key">${k.slice(4)}</span>` : `<b>${k}</b>`;
    return `<span class="hint">${g} ${what}</span>`;
  }).join('');
}
// the top bar (clock, health and stamina, the weapon) and the money corner, while the map or the pause menu is up
function uiTop() {
  const me = S.me;
  if (!me) return;
  const c = gameClock(S.loopTime), hh = Math.floor(c.minutes / 60), mm = Math.floor(c.minutes % 60);
  const st = S.uiSt ?? 100, key = `${hh}:${mm}|${me.hp}|${st}|${me.cash}|${me.bank}|${me.wanted}|${$('w-name').textContent}|${$('w-ammo').textContent}`;
  if (key === S.uiTopKey) return;
  S.uiTopKey = key;
  const time = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  for (const el of document.querySelectorAll('.ui-clock')) el.innerHTML = `<span style="color:${c.isNight ? '#9fbaff' : '#ffd34a'}">${c.isNight ? '☾' : '☀'}</span>${time}`;
  const hp = Math.max(0, Math.round((me.hp / me.maxHp) * 100));
  for (const el of document.querySelectorAll('.ui-bar.hp')) { el.firstChild.style.width = hp + '%'; el.lastChild.textContent = Math.round(me.hp); }
  for (const el of document.querySelectorAll('.ui-bar.st')) { el.firstChild.style.width = Math.min(100, st) + '%'; el.lastChild.textContent = Math.round(st); }
  for (const el of document.querySelectorAll('.ui-wpn')) el.innerHTML = `${$('w-icon').innerHTML}<span>${$('w-ammo').textContent || $('w-name').textContent}</span>`;
  let stars = '';
  for (let i = 1; i <= 5; i++) stars += i <= (me.wanted || 0) ? '★' : '<i>★</i>';
  for (const el of document.querySelectorAll('.ui-money')) el.innerHTML = `<span class="c">$${me.cash.toLocaleString('en-US')}</span><span class="b">🏦 $${me.bank.toLocaleString('en-US')}</span><span class="st">${stars}</span>`;
  for (const el of document.querySelectorAll('.pz-foot')) el.innerHTML = footHints(input.device === 'gamepad' ? [['pad:A', 'Select'], ['pad:B', 'Back']] : input.device === 'touch' ? [['Tap', 'select'], ['Tap outside', 'close']] : [['key:Enter', 'Select'], ['key:Esc', 'Back']]);
}
for (const b of document.querySelectorAll('#pause [data-p]')) {
  b.onclick = () => {
    const a = b.dataset.p;
    if (a === 'resume') closeOverlay('pause');
    else if (a === 'map') { closeOverlay('pause'); toggleMap(true); }
    else if (a === 'phone') { closeOverlay('pause'); openPhone(); }
    else if (a === 'cruiser') { closeOverlay('pause'); callCruiser(); }
    else if (a === 'settings') openOverlay('settings');
    else if (a === 'controls') openOverlay('controls');
    else if (a === 'look') { closeOverlay('pause'); openCreator('edit'); }
    else if (a === 'unstuck') { closeOverlay('pause'); send({ t: 'unstuck' }); }
    else if (a === 'surrender') {
      // press twice: dying (or, when wanted, turning yourself in) isn't something to do by accident
      if (b.dataset.armed && performance.now() - Number(b.dataset.armed) < 4000) { delete b.dataset.armed; optText(b, 'Surrender'); closeOverlay('pause'); send({ t: 'surrender' }); }
      else { b.dataset.armed = String(performance.now()); optText(b, S.me && S.me.wanted > 0 ? 'Tap again: turn yourself in (fine)' : 'Tap again: give up and respawn'); }
    }
    else if (a === 'fullscreen') toggleFullscreen();
    else if (a === 'dev') { closeOverlay('pause'); sfx('click', 0.8); openDebug(); }
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
$('s-diag').onchange = (e) => { settings.diag = e.target.checked; diag.on = e.target.checked; saveSettings(); if (!diag.on && diag.el) { diag.el.remove(); diag.el = null; } };
$('s-smooth').onchange = (e) => { settings.smooth = e.target.checked; saveSettings(); if (!settings.smooth && GOV.scale !== 1) { GOV.scale = 1; onResize(); } };
// graphics: high on desktops, medium on phones and tablets unless chosen
function gfxQuality() { return gfx.lighting; }
for (const id of ['b-settings', 't-settings']) $(id).onclick = () => openSettings(true);

function toggleMap(on) {
  if (on) {
    if (topOverlay() !== 'bigmap') openOverlay('bigmap');
    $('bigmap-hint').innerHTML = footHints(input.device === 'touch' ? [['Pinch', 'zoom'], ['Drag', 'look around'], ['Tap', 'set a waypoint']]
      : input.device === 'gamepad' ? [['pad:A', 'Select'], ['pad:B', 'Back'], ['pad:Y', 'Set waypoint'], ['RT / LT', 'Zoom'], ['R stick', 'Look around']]
        : [['Click', 'set a waypoint'], ['Wheel', 'zoom'], ['Drag', 'look around'], ['key:C', 'find me'], ['key:M', 'close']]);
    buildHubs('map');
    // the map's own module, the first time (client/worldmap.js: kept out of the page's first load)
    if (S.hud && !S.hud.worldmap) {
      import('./worldmap.js').then((M) => { if (S.hud && !S.hud.worldmap) { S.hud.worldmap = M.createWorldMap(S.map); const me = selfPos(); S.hud.centerMap(me.x, me.y); } }).catch((e) => console.warn('[map]', e));
    }
    if (S.hud && S.hud.mapView) { S.hud.resetMap(); const me = selfPos(); S.hud.centerMap(me.x, me.y); }
    mapwp.open();
    S.uiTopKey = '';
  } else if (overlays.includes('bigmap')) closeOverlay('bigmap');
}
$('bm-close').onclick = () => toggleMap(false);
function mapFindMe() { if (!S.hud || !S.hud.mapView) return; const me = selfPos(); if (S.hud.mapView.z < 2.5) S.hud.zoomMap(3 / S.hud.mapView.z); S.hud.centerMap(me.x, me.y); }
// a waypoint where the cross in the middle of the map is (a pad's Y, the panel's Set Waypoint): snapped to a place there
function mapMarkCentre() {
  const wm = S.hud && S.hud.worldmap, c = $('bigmap-c');
  if (!wm) return;
  markAt(c.clientWidth / 2, c.clientHeight / 2);
}
function markAt(sx, sy) {
  const wm = S.hud.worldmap;
  const hit = wm.hitAt(sx, sy), [x, y] = wm.toWorld(sx, sy);
  const label = hit ? hit.label || 'Marked spot' : 'Marked spot';
  S.waypoint = { x: hit ? hit.x : x, y: hit ? hit.y : y, label }; S.hud.waypoint = S.waypoint;
  S.hud.toast(`Waypoint set: ${label}`, 'info');
  sfx('click', 0.6);
  mapwp.refresh();
}
// Zoom and look around the map: mouse wheel / pinch zooms about the pointer, dragging pans, the
// + / - / ⌖ buttons (and + - C keys, LT / RT and the right stick on a pad) do the same.
const mapPtrs = new Map();
let mapDrag = null, mapDragged = false;
const mapPos = (e) => { const r = $('bigmap-c').getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
$('bigmap-c').addEventListener('wheel', (e) => { e.preventDefault(); const [x, y] = mapPos(e); S.hud && S.hud.zoomMap(Math.pow(1.0015, -e.deltaY), x, y); }, { passive: false });
$('bigmap-c').addEventListener('pointerdown', (e) => {
  try { $('bigmap-c').setPointerCapture(e.pointerId); } catch { /* a pointer the browser no longer tracks */ }
  mapPtrs.set(e.pointerId, mapPos(e));
  if (mapPtrs.size === 1) { mapDrag = mapPos(e); mapDragged = false; }
});
$('bigmap-c').addEventListener('pointermove', (e) => {
  if (!mapPtrs.has(e.pointerId) || !S.hud) return;
  const prev = mapPtrs.get(e.pointerId), cur = mapPos(e);
  if (mapPtrs.size >= 2) { // pinch: zoom about the middle of the two fingers, and pan with it
    const [a, b] = [...mapPtrs.entries()].map(([id, p]) => (id === e.pointerId ? cur : p));
    const [o] = [...mapPtrs.entries()].filter(([id]) => id !== e.pointerId).map(([, p]) => p);
    const d0 = Math.hypot(prev[0] - o[0], prev[1] - o[1]), d1 = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (d0 > 10) S.hud.zoomMap(d1 / d0, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    S.hud.panMap((cur[0] - prev[0]) / 2, (cur[1] - prev[1]) / 2);
    mapDragged = true;
  } else if (mapDrag) {
    if (Math.hypot(cur[0] - mapDrag[0], cur[1] - mapDrag[1]) > 6) mapDragged = true;
    if (mapDragged) S.hud.panMap(cur[0] - prev[0], cur[1] - prev[1]);
  }
  mapPtrs.set(e.pointerId, cur);
});
const mapUp = (e) => { mapPtrs.delete(e.pointerId); if (!mapPtrs.size) mapDrag = null; };
$('bigmap-c').addEventListener('pointerup', mapUp);
$('bigmap-c').addEventListener('pointercancel', mapUp);
// on a pad: RT zooms in, LT out, the right stick looks around
function padMapLook(dt) {
  const a = input.padAxes;
  if (!a || !S.hud || !S.hud.mapView) return;
  if (a.rt || a.lt) S.hud.zoomMap(Math.pow(2.2, (a.rt - a.lt) * dt));
  if (a.rx || a.ry) S.hud.panMap(-a.rx * 700 * dt, -a.ry * 700 * dt);
}
$('bigmap-c').onclick = (e) => {
  if (mapDragged) { mapDragged = false; return; } // that was a drag or a pinch, not a tap
  if (!S.hud || !S.hud.worldmap) return;
  const r = $('bigmap-c').getBoundingClientRect();
  markAt(e.clientX - r.left, e.clientY - r.top);   // (on a place's icon: that place, by name)
};
$('radar').onclick = () => { if (S.playing) toggleMap(true); };
// on touch the weapon box is a button too: a tap takes out the next weapon, holding it opens the picker
{ const wb = $('weapon'); const tap = () => { if (S.playing) virtualTap('nextw'); }; tapHold(wb, tap, () => { if (S.playing) openWeaponPick(); }); }
$('radar').addEventListener('touchstart', (e) => { e.preventDefault(); if (S.playing) toggleMap(true); }, { passive: false });

// ---------------------------------------------------------------------------
// Rendering
let W = 0, H = 0, DPR = 1;
// (the frame record and the sharpness governor: see "smooth first" below - declared here, onResize reads GOV)
const FR = { t: new Float32Array(240), n: 0 };
const GOV = { scale: 1, base: 1, next: 0, slow: 0, fast: 0, tried: null, rest: 0, steps: 0, fails: 0 };
const GOV_STEP = 0.85, GOV_SLOW_MS = 22, GOV_FAST_MS = 17.5;
function onResize() {
  // A 4K TV reports a pixel ratio of 2, which made a console draw every pass at 3840x2160 until
  // its graphics memory ran out. Lower settings and consoles draw at fewer pixels (the art is
  // pixel art: it barely shows), and nothing ever renders more than ~2.5 megapixels.
  const cap = IS_CONSOLE ? Math.min(1, gfx.resolution) : gfx.resolution;
  const base = Math.max(0.5, Math.min(cap, window.devicePixelRatio || 1, Math.sqrt(2.5e6 / Math.max(1, innerWidth * innerHeight))));
  DPR = Math.max(0.5, base * GOV.scale);   // (eased off while the frame rate can't keep up: govern below)
  GOV.base = base;
  const nw = innerWidth, nh = innerHeight;
  if (nw === W && nh === H && canvas.width === Math.round(W * DPR)) return;
  W = nw; H = nh;
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
  if (S.art2) S.art2.resize(W, H, DPR);
  document.body.classList.toggle('portrait', H > W);
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

// ---- graphics memory lost ------------------------------------------------------------------------
// When the browser runs out of graphics memory (consoles and old phones mostly) it throws away the
// canvases: everything we drew and cached goes blank. Rather than limp on with a blank or
// half-drawn screen, step the graphics setting down one notch and reload (the server keeps your
// place; you're straight back in).
function graphicsLost(why) {
  if (S.gfxLost) return;
  S.gfxLost = true;
  diag.lost++;
  const q = gfx.preset;
  stepDown();
  try { sessionStorage.setItem('cla.gfxLost', JSON.stringify({ why, q, at: Date.now() })); } catch { /* blocked */ }
  if (S.hud) S.hud.toast('Graphics memory ran out - reloading with lighter graphics...', 'warn');
  setTimeout(() => location.reload(), 1200);
}
canvas.addEventListener('contextlost', (e) => { e.preventDefault(); graphicsLost('contextlost'); });
setInterval(() => { if (typeof g.isContextLost === 'function' && g.isContextLost()) graphicsLost('watchdog'); }, 2000);
try {
  const was = JSON.parse(sessionStorage.getItem('cla.gfxLost') || 'null');
  if (was && Date.now() - was.at < 60000) { sessionStorage.removeItem('cla.gfxLost'); setTimeout(() => S.hud && S.hud.toast(`Graphics were lowered to ${PRESET_NAMES[gfx.preset]} after the screen lost its graphics memory (Settings to change).`, 'info'), 4000); }
} catch { /* blocked */ }

// ---- smooth first: adaptive sharpness ---------------------------------------------------------------------------
// The frames of the last few seconds (always kept: this and the device report read them). When a device can't hold
// the frame rate at the chosen sharpness (Ultra on a phone, mostly), the render size steps down 15% at a time, a few
// seconds apart, until it does - never below 60% of the setting, or 0.75 - and back up when there is room again. The
// art is pixel art, so a step or two barely shows; dropped frames do. A step that doesn't help (the frame rate held
// back by something else: the CPU, a phone saving power at 30 fps) is undone, and it waits a minute before trying
// again (two, four... up to ten). Settings → "Keep it smooth" turns it off.
function frameRecord(dtMs) { FR.t[FR.n++ % 240] = dtMs; }
function framePct(p, last = 240) {   // the p-th percentile of the last frames (ms)
  const n = Math.min(FR.n, 240, last), a = [];
  for (let i = 0; i < n; i++) a.push(FR.t[(FR.n - 1 - i) % 240]);
  a.sort((x, y) => x - y);
  return n ? a[Math.min(n - 1, Math.floor(n * p))] : 0;
}
function govern(nowMs) {
  if (nowMs < GOV.next) return;
  GOV.next = nowMs + 2000;
  if (!S.playing || !S.art2 || !S.art2.ready || document.hidden || settings.smooth === false || LOAD.at.screen === undefined || nowMs - LOAD.at.screen < 6000) { GOV.slow = GOV.fast = 0; return; }
  const p75 = framePct(0.75, 120);   // (the last two seconds or so)
  // the step just taken: did it help? if not, the pixels weren't what held it back - undo it, and rest a minute
  if (GOV.tried) {
    const t = GOV.tried; GOV.tried = null;
    if (p75 > t.before * 0.92) { GOV.scale = t.scale; GOV.fails++; GOV.rest = nowMs + Math.min(600000, 60000 * 2 ** (GOV.fails - 1)); onResize(); return; }
  }
  if (nowMs < GOV.rest) return;
  GOV.slow = p75 > GOV_SLOW_MS ? GOV.slow + 1 : 0;
  GOV.fast = p75 < GOV_FAST_MS ? GOV.fast + 1 : 0;
  const floor = Math.max(0.6, 0.75 / Math.max(0.75, GOV.base));
  if (GOV.slow >= 2 && GOV.scale > floor + 1e-3) {
    GOV.tried = { scale: GOV.scale, before: p75 };
    GOV.scale = Math.max(floor, GOV.scale * GOV_STEP); GOV.slow = 0; GOV.steps++;
    onResize();
  } else if (GOV.fast >= 6 && GOV.scale < 1) {
    GOV.scale = Math.min(1, GOV.scale / GOV_STEP); GOV.fast = 0;
    onResize();
  }
}

// ---- how this device did: one report a page ----------------------------------------------------------------------
// Twenty seconds after the screen was first fully drawn (or two minutes in, if it never was): the load timeline, the
// frame rate, the sharpness it settled on, and what the device is - sent to the server, which keeps the latest and
// lists them at /perf (server/perfreports.js), so how phones and tablets out there do can be read off one page.
function perfReport(nowMs) {
  if (LOAD.sent && !LOAD.sent2 && S.art2 && LOAD.at.screen !== undefined && nowMs - LOAD.at.screen > 240000) {
    // four minutes into play, a second report: how well the art kept up as they went round (the share of frames
    // with a stand-in on screen, overall and on the move, the longest such stretch) and what was baked ahead
    LOAD.sent2 = true;
    const a2 = S.art2.stats(), L = a2.late || {}, d = getDevice();
    send({ t: 'perf', r: {
      stage: 'play', kind: d.kind, gpu: (d.gpu || '').slice(0, 80), ua: navigator.userAgent.slice(0, 160), cores: navigator.hardwareConcurrency || 0, mem: navigator.deviceMemory || 0,
      preset: gfx.preset, w: W, h: H, dpr: +DPR.toFixed(2), scale: +GOV.scale.toFixed(2), steps: GOV.steps, fps: S.fps, p50: +framePct(0.5).toFixed(1), p95: +framePct(0.95).toFixed(1),
      bake: a2.t ? Math.round(a2.t.bakeAvg || 0) : 0, kept: a2.n ? a2.n.kept || 0 : 0, workers: a2.pool ? a2.pool.workers : 0,
      late: L.of ? +(100 * L.frames / L.of).toFixed(1) : 0, lateMove: L.moving ? +(100 * L.movingLate / L.moving).toFixed(1) : 0, lateMax: +(L.max || 0).toFixed(1), moving: L.of ? +(100 * L.moving / L.of).toFixed(0) : 0,
      ahead: a2.ahead ? a2.ahead.baked : 0,
      cdn: a2.n ? a2.n.cdn || 0 : 0, cdnMs: a2.n && a2.n.cdn && a2.t ? Math.round((a2.t.cdnSum || 0) / a2.n.cdn) : 0,
      fetched: a2.fetched ? a2.fetched.got + a2.fetched.had : 0, fetchMiss: a2.fetched ? a2.fetched.miss : 0, cdnOff: a2.fetched && a2.fetched.off ? 1 : 0,
    } });
    return;
  }
  if (LOAD.sent || !S.welcomed || S.practice) return;
  const at = LOAD.at.screen;
  if (at === undefined ? nowMs < 120000 : nowMs - at < 20000) return;
  LOAD.sent = true;
  const d = getDevice(), a2 = S.art2 ? S.art2.stats() : null;
  send({ t: 'perf', r: {
    kind: d.kind, gpu: (d.gpu || '').slice(0, 80), ua: navigator.userAgent.slice(0, 160), cores: navigator.hardwareConcurrency || 0, mem: navigator.deviceMemory || 0,
    preset: gfx.preset, w: W, h: H, dpr: +DPR.toFixed(2), scale: +GOV.scale.toFixed(2), steps: GOV.steps,
    at: LOAD.at, ms: LOAD.ms, city: LOAD.city || '', fps: S.fps, p50: +framePct(0.5).toFixed(1), p95: +framePct(0.95).toFixed(1),
    bake: a2 && a2.t ? Math.round(a2.t.bakeAvg || 0) : 0, kept: a2 && a2.n ? a2.n.kept || 0 : 0, workers: a2 && a2.pool ? a2.pool.workers : 0,
  } });
}

// ---- diagnostics overlay (?diag, or Settings) -----------------------------------------------------
// Everything worth knowing when it runs badly on some device: frame rate and where the frame
// goes, the render size, memory, the controller, how often the input device flips. Made for
// reading off a TV or a phone screenshot.
const diag = { on: /[?&]diag\b/.test(location.search) || settings.diag === true, lost: 0, el: null, last: 0, frames: [], long: 0, sw0: 0, swAt: performance.now() };
function diagFrame(dtMs) {
  if (!diag.on) return;
  diag.frames.push(dtMs); if (diag.frames.length > 120) diag.frames.shift();
  if (dtMs > 50) diag.long++;
  const now = performance.now();
  if (now - diag.last < 500) return;
  diag.last = now;
  if (!diag.el) { diag.el = document.createElement('pre'); diag.el.id = 'diag'; document.body.appendChild(diag.el); }
  const f = diag.frames.slice().sort((a, b) => a - b), avg = f.reduce((a, b) => a + b, 0) / (f.length || 1);
  const p = S.perf || {};
  const mem = performance.memory ? `${Math.round(performance.memory.usedJSHeapSize / 1e6)}/${Math.round(performance.memory.jsHeapSizeLimit / 1e6)} MB` : 'n/a';
  const pads = (navigator.getGamepads ? [...navigator.getGamepads()] : []).filter(Boolean);
  const swRate = (deviceStats.switches - diag.sw0) / Math.max(1, (now - diag.swAt) / 60000);
  if (now - diag.swAt > 60000) { diag.sw0 = deviceStats.switches; diag.swAt = now; }
  const cacheMB = (S.ground ? S.ground.cache.size : 0) * CHUNK_PX * CHUNK_PX * 4 / 1e6;
  const cs = canvasStats();
  diag.el.textContent = [
    `fps ${S.fps}  frame avg ${avg.toFixed(1)} ms  worst ${(f[f.length - 1] || 0).toFixed(0)} ms  >50ms: ${diag.long}`,
    `parts ${Object.entries(p).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(' · ')}`,
    `screen ${W}x${H} @${DPR.toFixed(2)} (device ${(window.devicePixelRatio || 1).toFixed(2)}${GOV.scale < 1 ? `, eased to ${Math.round(GOV.scale * 100)}% to keep it smooth` : ''}) = ${(canvas.width * canvas.height / 1e6).toFixed(1)} MP  gfx ${gfx.preset} (light ${gfx.lighting}, flora ${gfx.flora})  frames p50 ${framePct(0.5).toFixed(1)} p95 ${framePct(0.95).toFixed(1)} ms`,
    `ground cache ${S.ground ? S.ground.cache.size : 0}/${S.ground ? S.ground.max : 0} chunks (${cacheMB.toFixed(0)} MB)  canvases ${cs.n} (${cs.mb.toFixed(0)} MB)  js heap ${mem}  gfx lost ${diag.lost}${LOW_MEM ? '  low-memory mode' : ''}`,
    ...(ART2_WANTED ? [S.art2 ? `art2 ${S.art2.diag()}` : `art2 off: ${S.art2Off || 'starting'}`] : []),
    `load ${loadLine()}`,
    `input ${input.device}  flips/min ${swRate.toFixed(0)}  pad ${pads.length ? `${pads[0].id.slice(0, 40)} [${pads[0].mapping || 'no mapping'}]` : 'none'}  emulation ${navigator.gamepadInputEmulation ?? 'n/a'}`,
    `${IS_CONSOLE ? 'console · ' : ''}${navigator.userAgent.replace(/^Mozilla\/5\.0 /, '').slice(0, 110)}`,
  ].join('\n');
}
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
  return long / (viewH * 16 / 9) * (S.camScale || 1); // (S.camScale: a closer camera, for trying framings)
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
// the FISHING bit on these means kneeling (a medic at someone hurt, an officer holding someone down), not fishing
const KNEELERS = new Set(['medic', 'cop', 'swat', 'agent', 'soldier']);
function pedPose(e) {
  const f = e.flags;
  if (f & PF.DEAD) return 'dead';
  if ((f & PF.DOWN) && (f & PF.ROLL)) return 'crawl'; // (down + rolling: dragging themselves along on the stomach)
  if (f & (PF.DOWN | PF.STUN)) return 'down';
  if (f & PF.ROLL) return 'roll';
  if (f & PF.FISHING) return e.d && KNEELERS.has(e.d.ar) ? 'kneel' : 'fish';
  if (e.d && e.d.cf) return 'cuffed';   // (hands cuffed behind the back: server custody.js)
  if (f & PF.CARRY) return 'carry';
  if (e.d && e.d.st && !(f & PF.MOVING)) return 'sitlow';   // sitting by a campfire (server campfires.js)
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
  diagFrame(nowMs - last);
  if (nowMs - last < 250) frameRecord(nowMs - last);   // (not the gap after the tab was hidden)
  govern(nowMs); perfReport(nowMs);
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

// ---- the frame ------------------------------------------------------------------------------------------
// A frame is four steps:
//   prepFrame(dt)     interpolation and prediction, the camera, the sky, who is on screen: the frame packet F
//                     every later step reads (null while the spectator camera draws its own frame)
//   tickVisuals(F)    the visual simulation - particles and decals, sounds, cars leaning and sinking, doors,
//                     gates, shutters and crossing arms easing, signal heads, birds, trampled grass, building
//                     fades, the frame's light sources - the same whichever renderer draws the world
//   the world         drawWorldV1(F) (Canvas2D) or the art v2 renderer (S.art2: client/art2/game/host.js)
//   drawOverlays(F)   what stays sharp and unlit on top: aim line, name tags, markers, and the HUD bits
function render(dt) {
  const F = prepFrame(dt);
  if (!F) return;
  tickVisuals(F);
  F.mark('visuals');
  const v2 = art2Draws(F);
  if (v2) S.art2.frame(F);
  else if (v1Draws(F)) drawWorldV1(F);
  else { g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#10141c'; g.fillRect(0, 0, canvas.width, canvas.height); }
  if (F.spec) { // spectating close in: the new renderer's picture, the spectator's names / grid / players on top
    S.spec.overlay(g, W, H, DPR);
    specTick();
    if (S.specGrab && v2) {
      const done = S.specGrab; S.specGrab = null;
      const cv = document.createElement('canvas'); cv.width = canvas.width; cv.height = canvas.height;
      const c2 = cv.getContext('2d'); c2.drawImage(worldCv, 0, 0, cv.width, cv.height); c2.drawImage(canvas, 0, 0);
      done(cv);
    }
    return;
  }
  drawOverlays(F, v2);
}

function prepFrame(dt) {
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
  // spectating: close in, the new renderer draws the spectator's camera (below); further out than it can hold
  // in memory (or in the schematic view), the spectator's flat map
  S.specArt = false;
  if (S.spec && S.spec.on) {
    const st = S.spec.state;
    if (!S.art2 || st.layers.schematic || st.z < specArtMinZoom()) { showWorld2(false); S.spec.render(g, W, H, DPR, dt, now); specTick(); return null; }
    S.specArt = true;
    S.spec.move(dt, W, H);
  }
  // camera
  let speed = 0;
  if (S.pred && S.pred.kind === 'veh') speed = Math.hypot(S.pred.s.vx, S.pred.s.vy);
  else if (S.ctrlKind === CTRL.PASSENGER || S.ctrlKind === CTRL.RIDER) { const e = S.ents.get(S.ctrlId); if (e && e.buf.length > 1) { const b = e.buf; speed = Math.hypot(b[b.length - 1].x - b[b.length - 2].x, b[b.length - 1].y - b[b.length - 2].y) * 20; } }
  // down: like a movie camera, it slowly pulls back from your body (never wider than the server sends)
  const downFor = S.me && S.me.dead ? (S.downFor = (S.downFor || 0) + dt) : (S.downFor = 0);
  const pull = downFor ? 1 + (DOWN_PULL - 1) * Math.min(1, downFor / 9) * (0.5 - 0.5 * Math.cos(Math.min(1, downFor / 9) * Math.PI)) : 1;
  // the pull-back at speed (up to 1.5x): while the art can't keep up with it (a chunk on screen still a stand-in at
  // speed: a phone's bakes), it eases off - down to 1.25x - and comes back slowly once the art keeps up again
  if (S.art2 && S.art2.lateNow && speed > 300 && S.art2.lateNow()) S.zoMax = Math.max(0.25, (S.zoMax ?? 0.5) - 0.12 * dt);
  else if ((S.zoMax ?? 0.5) < 0.5) S.zoMax = Math.min(0.5, S.zoMax + 0.015 * dt);
  const targetZoom = baseZoom() / Math.max(pull, S.me && S.me.ride ? (S.me.ride.k === 'slide' ? SLIDE_PULL : RIDE_PULL) : 1, 1 + Math.min(S.zoMax ?? 0.5, speed / 1300));
  S.cam.zoom += (targetZoom - S.cam.zoom) * (1 - Math.exp(-(downFor ? 0.8 : 2.5) * dt));
  S.cam.tz = targetZoom; // (the new renderer bakes ahead for the wider view it is zooming out to)
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
  if (S.look) {   // looking through a telescope: ease out to the view and back; walking off ends it
    const L = S.look, t = performance.now() - L.t0;
    if (L.px === null) { L.px = sp.x; L.py = sp.y; }
    if (t > L.dur || Math.hypot(sp.x - L.px, sp.y - L.py) > 24) S.look = null;
    else { const e = Math.min(1, t / 900, (L.dur - t) / 900), k = e * e * (3 - 2 * e); S.cam.x = tx + (L.x - tx) * k; S.cam.y = ty + (L.y - ty) * k; }
  }
  if (S.rides && S.rides.size) {   // rides: forget the ones long over (the end can be missed: a rider gone), point my camera
    const nowS = performance.now() / 1000;
    for (const [id, R] of S.rides) if (nowS - R.at > R.d + 4) S.rides.delete(id);
    const rc = rideCam(tx, ty);
    if (rc) { S.cam.x = rc[0]; S.cam.y = rc[1]; }
    // up in my balloon: the burner roars now and then (the pilot keeping her up)
    const mine = S.me && S.me.ride && S.me.ride.k === 'balloon' ? S.rides.get(S.me.ride.id) : null;
    if (mine) { const t = nowS - mine.at; if (t > (mine.burn ?? 9) && t < mine.d - 14) { sfx('burner', 0.6); mine.burn = t + 11 + Math.random() * 8; } }
  }
  {
    // keep the camera over the world: the sea runs on past the map's edge as far as you can go (shared/border.js),
    // so it follows you out there; never past where nothing can go
    const WW = MAP_W * TILE, WH = MAP_H * TILE;
    S.cam.x = Math.max(-EDGE_OUT, Math.min(WW + EDGE_OUT, S.cam.x));
    S.cam.y = Math.max(-EDGE_OUT, Math.min(WH + EDGE_OUT, S.cam.y));
  }
  if (S.specArt) { const st = S.spec.state; S.cam.x = st.x; S.cam.y = st.y; S.cam.zoom = st.z; S.cam.shake = 0; } // (the spectator's camera)
  S.cam.shake *= Math.exp(-6 * dt);
  const shx = (Math.random() - 0.5) * S.cam.shake, shy = (Math.random() - 0.5) * S.cam.shake;

  const z = S.cam.zoom;
  const halfW = W / 2 / z, halfH = H / 2 / z;
  const view = { x0: S.cam.x - halfW - 64, x1: S.cam.x + halfW + 64, y0: S.cam.y - halfH - 64, y1: S.cam.y + halfH + 64 };
  const clock = gameClock(S.loopTime);
  const rain = S.weather === WEATHER.RAIN;
  // the sky: time of day, how long it's been raining, fog, lightning (render/atmos.js)
  S.rainK = (S.rainK || 0) + ((rain ? 1 : 0) - (S.rainK || 0)) * (1 - Math.exp(-dt / 8));
  S.wx.update(dt, rain, now);
  wind.update(S.loopTime, S.rainK || 0);
  const sky = skyAt(S.loopTime, clock.minutes, S.rainK);
  if (S.wx.flash > 0) { const f = S.wx.flash * (0.5 + 0.4 * sky.night); sky.amb = sky.amb.map((v) => v + (1 - v) * f); }
  const quality = gfxQuality();
  S.fx.thin = !gfx.particles;
  const pf = S.perf ??= {}; let pt = performance.now();
  const mark = (k) => { const n = performance.now(); pf[k] = (pf[k] || 0) * 0.9 + (n - pt) * 0.1; pt = n; };
  S.light.begin(sky, S.cam, z, quality); // (the light records: collectLights fills them for either renderer)
  if (S.fogForce) sky.fog = S.fogForce;
  S.sky = sky;
  // snap the world offset to whole device pixels: pixel-art ground and sprites then round the
  // same way every frame instead of shimmering by a pixel against each other
  const offX = Math.round(DPR * (W / 2 - S.cam.x * z + shx)), offY = Math.round(DPR * (H / 2 - S.cam.y * z + shy));
  S.worldTf = [DPR * z, 0, 0, DPR * z, offX, offY];
  S.viewRect = view;
  const cx0 = Math.floor(view.x0 / CHUNK_PX), cx1 = Math.floor(view.x1 / CHUNK_PX), cy0 = Math.floor(view.y0 / CHUNK_PX), cy1 = Math.floor(view.y1 / CHUNK_PX);
  S.chunkView = [cx0, cx1, cy0, cy1];
  // the train I'm riding (if any)
  const meEnt = S.ents.get(S.myPedId);
  const myCar = S.ctrlKind === CTRL.RIDER && meEnt && meEnt.parent ? S.ents.get(meEnt.parent) : null;
  const myTrain = myCar && myCar.kind === K.TRAIN && myCar.d ? myCar.d.tr : -1;
  const sub = !!(myCar && myCar.kind === K.TRAIN && (myCar.flags & 1)); // riding through the subway: only the tunnel
  // who is on screen, by kind
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
  // at the water's level: swimmers and boats (drawn under bridge decks)
  const swimmers = peds.filter((p) => !(p.flags & PF.INVEH) && p.swim);
  const boats = vehs.filter((v) => VEHICLE_BY_INDEX[v.d.m] && VEHICLE_BY_INDEX[v.d.m].kind === 'boat');
  return {
    dt, now, nowMs: performance.now(), fx, sp: S.specArt ? { x: S.cam.x, y: S.cam.y, a: 0, z: 0 } : sp, z, shx, shy, view, clock, rain, sky, quality, mark, spec: S.specArt,
    chunkView: S.chunkView, meEnt, myCar, myTrain, sub,
    peds, vehs, crates, bags, projs, balls, cars, riders, swimmers, boats,
    insideB: null, roofArt: [], bl: [], bA: [], refl: [],
  };
}

// The visual simulation of the frame (see render): everything here runs whichever renderer draws.
function tickVisuals(F) {
  const { dt, now, view, sky, sub, fx } = F;
  // walk-in shops: inside one, its roof fades away and the floor plan shows
  if (!sub && !F.spec) F.insideB = interiorTick(F.sp, F.roofArt);
  // grass, crops and bushes: trampled underfoot and flattened by wheels; trees shaken by cars (render/flora)
  if (!sub && S.flora) { S.flora.sky = sky; S.flora.update(dt, now, S.lastPeds || [], S.lastVehs || [], fx, sky); }
  // vehicles lean and sink, smoke, burn, skid, leave wakes, sound sirens; people bleed, spark, splash, land
  for (const v of F.vehs) vehVisual(v, now, dt);
  for (const p of F.peds) pedVisual(p, now);
  for (const p of F.riders) pedVisual(p, now);
  trainsTick(F.cars, F.riders);
  // buildings in view: see-through while they hide you, faded while you're inside
  if (!sub) buildingFades(F);
  // lights of the frame (for the light map, the puddles and the rain; lamps warm up, flashes die away)
  F.refl = sub ? [] : collectLights(sky, view, F.vehs, F.peds, dt);
  // the wet street: rain rings on open water, splashes through puddles, manhole steam, tyre spray
  if (!sub) {
    if (F.rain) S.wx.rainOnWater(view, dt);
    S.wx.splashes(F.peds.concat(F.vehs), fx, (v) => sfx('splash', v * 0.4), now);
    S.wx.steam(view, fx, dt, now, sky);
  }
  if (F.rain || S.wx.wet > 0.2) tyreSpray(F.vehs, dt);
  // rockets trail fire and smoke; smashed hydrants gush
  for (const pr of F.projs) { fx.fire(pr.rx - Math.cos(pr.ra) * 10, pr.ry - Math.sin(pr.ra) * 10); fx.smoke(pr.rx, pr.ry, false); }
  S.geysers = S.geysers.filter((gy) => gy.until > F.nowMs);
  for (const gy of S.geysers) fx.geyser(gy.x, gy.y);
  // street furniture that moves (none of it down in the subway)
  if (!sub) {
    doorsTick(view, F.peds, dt);
    baysTick(view, dt);
    garagesTick(view, dt);
    boathousesTick(view, dt, F.vehs);
    spikesTick(F.nowMs);
    gatesTick(view, dt);
    crossingsTick(view, dt);
    signalsTick(view);
    birdsTick(dt, view, F.vehs, F.peds);
  }
  S.lastPeds = F.peds; S.lastVehs = F.vehs;
  for (const v of F.vehs) { const d = VEHICLE_BY_INDEX[v.d.m]; if (d) { v._L = d.L; v._W = d.W; } }
  S.trainCars = F.cars;
  fx.update(dt);
  soundFrame(F, S);   // engines, footsteps, the ambience, the places' music (client/sound/)
}

// The buildings in view this frame, with how see-through each is drawn: x-rayed while it hides you,
// faded while you're inside it.
function buildingFades(F) {
  const bl = S.buildings.inView(F.view), bA = [];
  S.bFade ??= new Map();
  for (const it of bl) {
    const inFade = (S.roofFade && S.roofFade[it.b.id]) || 0;
    const xray = !inFade && S.buildings.hides(it, F.sp.x, F.sp.y, 6) ? 1 : 0;
    const cur = S.bFade.get(it.b.id) || 0;
    const k = cur + (xray - cur) * (1 - Math.exp(-8 * F.dt));
    S.bFade.set(it.b.id, k);
    bA.push(Math.max(0.08, 1 - inFade * 0.92 - k * 0.6));
  }
  F.bl = bl; F.bA = bA;
}

// The v1 world: Canvas2D, painter's order, its own light map and post passes.
function drawWorldV1(F) {
  const { fx, now, dt, z, view, sky, sub, rain, quality, mark, sp, peds, vehs, crates, bags, projs, balls, cars, riders, swimmers, boats, myTrain, refl } = F;
  const [cx0, cx1, cy0, cy1] = F.chunkView;
  S.light.resize(W, H);
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  g.fillStyle = '#10141c'; g.fillRect(0, 0, W, H);
  // crisp nearest-neighbour pixels at gameplay zoom; filtered only when zoomed out (fast driving)
  // so minified art doesn't shimmer
  g.imageSmoothingEnabled = z < 0.92;
  g.setTransform(...S.worldTf);

  // past the map's edge: open sea (shared/border.js)
  if (!sub && (view.x0 < 0 || view.y0 < 0 || view.x1 > MAP_W * TILE || view.y1 > MAP_H * TILE)) { g.fillStyle = '#1d5a86'; g.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0); }
  // ground chunks
  for (let cy = Math.max(0, cy0); cy <= Math.min(Math.ceil(MAP_H * TILE / CHUNK_PX) - 1, cy1); cy++)
    for (let cx = Math.max(0, cx0); cx <= Math.min(Math.ceil(MAP_W * TILE / CHUNK_PX) - 1, cx1); cx++)
      g.drawImage(S.ground.get(cx, cy), cx * CHUNK_PX, cy * CHUNK_PX, CHUNK_PX + 0.5, CHUNK_PX + 0.5);
  g.imageSmoothingEnabled = true;

  // animated water glints
  drawWaterGlints(view, now);
  S.ground.shores.animate(g, view, now);
  const wetK = Math.max(S.rainK, S.wx.wet * 0.8);
  if (wetK > 0.01) { g.fillStyle = `rgba(30,50,80,${(0.17 * wetK).toFixed(3)})`; g.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0); }
  mark('ground');
  S.wx.drawWaterSheen(g, view, sky, now);
  if (sub) drawTunnel(g, S.map, view, now);
  else fx.drawDecals(g, view, now, rain);
  // grass, crops, bushes and flower beds: sway, part round people, lie flat where cars went (render/flora)
  if (!sub && S.flora) {
    S.flora.drawLive(g, view, S.ground, sky);
    mark('flora');
  }
  // the elevated highway: its shadow and the ramps' feet lie on the ground
  const hv = sub ? { slabs: [], pillars: [] } : S.highway.visible(view);
  S.highway.drawShadows(g, hv.slabs, sky);
  S.highway.drawLow(g, hv.slabs);
  // the sun's shadows: buildings (from just off screen too), trees and palms
  if (!sub && sky.sun > 0.05 && gfx.shadows > 0) {
    const reach = 90 * Math.min(3.2, sky.shadowLen);
    const near = S.buildings.inView({ x0: view.x0 - reach, y0: view.y0 - reach, x1: view.x1 + reach, y1: view.y1 + reach });
    drawContactShade(g, near, sky);
    drawBuildingShadows(g, near, sky);
    // every prop throws its own silhouette (render/shadows.js); the few drawn in code without a
    // sprite (lamp posts, poles) keep the soft blot
    castList.length = 0;
    if (gfx.shadows >= 2) {
    const blots = [];
    const seen = new Set();
    const addCast = (p) => {
      if (p.broken || seen.has(p)) return;
      seen.add(p);
      const t = p.t;
      if (NO_CAST.has(t)) return;
      if (S.flora && FLORA_PROPS.has(t)) { castList.push(S.flora.castFor(p)); return; }
      const fr = atlas.ready ? atlas.frames['prop_' + (t === 'billboard' ? 'billboard' + (p.ad || 0) : t === 'tent' ? 'tent' + (p.v || 0) : t)] : null;
      if (!fr) { if (TALL_SHADOW[t]) blots.push(p); return; }
      const grow = COUNTRY_GROW[t];
      if (COUNTRY_TALL[t]) { const s0 = PROP_SIZES[t], k = t === 'pumpjack' || t === 'otank' ? 1 : grow || 1, w = s0[0] * k, h = s0[1] * k; castList.push({ img: atlas.imgs[fr.a], fr, x: p.x, base: p.y + 4, w, h }); return; }
      const s = PROP_SIZES[t] || [24, 24];
      castList.push({ img: atlas.imgs[fr.a], fr, x: p.x, base: p.y + s[1] / 2 - 2, w: s[0], h: s[1] });
    };
    for (let cy = Math.max(0, cy0 - 1); cy <= cy1 + 1; cy++) for (let cx = Math.max(0, cx0 - 1); cx <= cx1 + 1; cx++) {
      for (const p of S.ground.overhead(cx, cy)) addCast(p);
      for (const p of S.ground.lowProps.get(cy * 1000 + cx) || []) addCast(p);
    }
    drawSpriteShadows(g, castList, sky);
    drawPropShadows(g, blots, sky, (p) => TALL_SHADOW[p.t]);
    }
  }
  // inside a walk-in shop: its floor plan, under the fading roof
  for (const id of F.roofArt) { const bb = S.map.buildings[id]; g.drawImage(interiorArt(S.map, bb), bb.tx * TILE, bb.ty * TILE); }
  mark('shadows');
  // the puddles (they catch the frame's lights) and the ripples on them
  if (!sub) {
    S.wx.drawPuddles(g, view, sky, gfx.reflections ? refl : [], rain, now, dt, quality);
    S.wx.drawRipples(g);
  }
  mark('lights+puddles');
  if (rain || S.wx.wet > 0.2) drawWetReflections(view, vehs, sky.night, now, dt);

  for (const b of bags) { g.save(); g.translate(b.rx, b.ry); g.rotate(b.ra); drawBag(g, b.d.t, now); g.restore(); }
  for (const c of crates) if ((c.flags & 3) === 0) drawCrateEnt(c, now);
  // water level first: swimmers, then boats - and the bridge decks drawn back over them, so
  // anything passing under a bridge really is under it
  const inWater = (e) => WATER_T[S.map.tileAtPx(e.rx, e.ry)] === 1 || S.map.tileAtPx(e.rx, e.ry) === T.BRIDGE;
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
  S.light.setRoofs(F.bl);
  for (let i = 0; i < F.bl.length; i++) items.push({ y: F.bl[i].y1, b: F.bl[i], a: F.bA[i] });
  for (const v of vehs) if (!boats.includes(v)) items.push({ y: levelKey(v.ry, v.rz || 0), v, z: v.rz || 0 });
  for (const p of peds) if (!swimmers.includes(p) && (up(p) || !(p.flags & (PF.DEAD | PF.DOWN | PF.STUN)))) items.push({ y: levelKey(p.ry, p.rz || 0) - ((p.flags & (PF.DEAD | PF.DOWN | PF.STUN)) ? 0.4 : 0), p, z: p.rz || 0 });
  for (const c of crates) if ((c.flags & 3) === 2) { const par = S.ents.get(c.parent); const pz = par ? par.rz || 0 : 0; items.push({ y: levelKey(par ? par.ry : c.ry, pz) + 0.5, c, z: pz }); }
  S.highway.items(hv.slabs, hv.pillars, items);
  for (const c of crates) if ((c.flags & 3) === 1) items.push({ y: c.ry + 1, c });
  const poles = [];
  if (!sub) for (let cy = Math.max(0, cy0); cy <= cy1 + 1; cy++) for (let cx = Math.max(0, cx0); cx <= cx1; cx++)
    for (const p of S.ground.overhead(cx, cy)) {
      const tall = COUNTRY_TALL[p.t] || 0; // masts, turbines... stand up from their base: keep them while any of them shows
      if (p.x > view.x0 - 40 - tall * 0.5 && p.x < view.x1 + 40 + tall * 0.5 && p.y > view.y0 - 40 && p.y < view.y1 + 90 + tall) {
        items.push({ y: p.y + 8, o: p });
        if (p.t === 'upole') poles.push(p);
      }
    }
  items.sort((a, b) => a.y - b.y);
  const nightLit = F.clock.dark > 0.3;
  if (S.flora) S.flora.beginFrame();
  for (const it of items) {
    const lift = it.z ? liftOf(it.z) : 0;
    if (lift) { g.save(); g.translate(0, -lift); }
    if (it.b) S.buildings.draw(g, it.b, it.a);
    else if (it.slab) S.highway.drawSlab(g, it.slab);
    else if (it.pillar) S.highway.drawPillar(g, it.pillar);
    else if (it.v) drawVehicleEnt(it.v, now, dt);
    else if (it.p) { if (!drawOnStairs(g, S.map, it.p, () => drawPed(it.p, now))) drawPed(it.p, now); }
    else if (it.c) drawCrateEnt(it.c, now);
    else if (it.o) drawOverheadProp(g, it.o, it.o.t === 'lamp' ? (it.o._lv || 0) > 0.5 : nightLit);
    if (lift) g.restore();
  }
  // wading through tall grass and crops: the stalks in front of your legs drawn over them
  if (S.flora && !sub) S.flora.drawFront(g, peds.filter((p) => !(p.flags & (PF.INVEH | PF.DEAD | PF.DOWN))));
  // the wires strung between the utility poles, over everything at ground level
  if (poles.length) {
    if (!S.poleAt) { S.poleAt = new Map(); for (const p of S.map.props) if (p.t === 'upole') S.poleAt.set(`${Math.round(p.x)},${Math.round(p.y)}`, p); }
    drawWires(g, poles, (x, y) => S.poleAt.get(`${Math.round(x)},${Math.round(y)}`));
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
  if (!sub) coverWalkIns(view);
  for (const pr of projs) {
    g.save(); g.translate(pr.rx, pr.ry); g.rotate(pr.ra);
    if (pr.d && pr.d.w === 24) { g.fillStyle = '#c8a46c'; g.fillRect(-11, -1, 22, 2); g.fillStyle = '#d8dde2'; g.fillRect(10, -2, 3, 4); g.fillStyle = '#c84a32'; g.fillRect(-11, -3, 5, 6); }   // an arrow
    else { g.fillStyle = '#4a5a2a'; g.fillRect(-8, -3, 16, 6); g.fillStyle = '#c8262b'; g.fillRect(6, -3, 3, 6); }
    g.restore();
  }

  if (!sub) { // (none of it down in the subway)
    drawBays(view);
    drawGarageDoors(view);
    drawBoathouseRoofs(view);
    drawSpikes(view);
    drawAtmMarks(view, now);
    drawGates(view);
    drawCrossings(view, now);
    drawStationClocks(view, now);
    drawBuoys(view, now);
    drawSignals(view);
    drawBirds();
  }
  if (S.flora && !sub) S.flora.leavesFrame(g, view, dt, false);
  fx.drawParticles(g);

  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (sub) drawSubwayLights(F.myCar, z, dt);
  mark('world');
  if (!sub) {
    S.wx.drawFog(g, sky, S.cam, z, W, H, DPR, now);
    mark('fog');
    S.light.applyLightMap(g, DPR);
    mark('lightmap');
    if (sky.night > 0.05) drawNightGlow(sky.night, peds, vehs);
    g.setTransform(...S.worldTf);
    S.fx.drawEmissive(g);
    if (gfx.reflections) S.wx.drawGlints(g, reflSrc, gfxQuality(), sky.night);
    // lit signs keep their colours at night: drawn again over the darkened scene
    if (selfLit.length) { g.globalAlpha = Math.min(0.85, sky.night); for (const p of selfLit) drawOverheadProp(g, p, true); g.globalAlpha = 1; }
    if (countryLit.length) { g.globalAlpha = Math.min(1, sky.night * 1.3); for (const p of countryLit) drawCountryEmissive(g, p, sky.night); g.globalAlpha = 1; }
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    mark('neon');
    S.light.applyGlows(g, DPR);
    mark('glows');
  }
  if (rain && !sub) drawRain(dt, sky);
  mark('rain');
  if (!sub) S.light.post(g, DPR, now, gfx.tiltShift === true);
  mark('post');
  void sp;
}

// What stays sharp and unlit over the world: the aim line, name tags and markers; then the HUD bits.
// With the art v2 world (v2) this canvas is a transparent layer over it: cleared, then the rain
// streaks and the markers v1 draws inside its world pass go on it here.
function drawOverlays(F, v2) {
  const { sp, now, z } = F;
  if (v2) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (F.rain) drawRain(F.dt, F.sky);
    g.setTransform(...S.worldTf);
    drawAtmMarks(F.view, now);
    drawStationClocks(F.view, now); // (interim, flat on the overlay: the platform boards and race buoys)
    drawBuoys(F.view, now);
    drawArt2Marks(F);
  }
  g.setTransform(...S.worldTf);
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
  drawWorldLabels(F.peds, F.vehs, now, z);
  // out past the map's edge: the arrow home at your feet, and the warning (shared/border.js)
  const edge = S.playing && S.me && !S.me.dead ? edgeInfo(sp.x, sp.y, EDGE_I) : null;
  if (edge && edge.d > 0) drawEdgeArrow(sp, edge, now);
  edgeWarn(edge && edge.d > 0 ? (edge.d > EDGE_SLOW ? 2 : 1) : 0);

  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (S.stars) {   // at the observatory's eyepiece: the night sky a few seconds (walking off ends it)
    const st = S.stars, t = (performance.now() - st.t0) / 1000;
    if (st.px === null) { st.px = sp.x; st.py = sp.y; }
    if (t > st.dur || Math.hypot(sp.x - st.px, sp.y - st.py) > 24) S.stars = null;
    else drawStarView(g, canvas.width / DPR, canvas.height / DPR, st, t);
  }

  // HUD bits
  const dist = S.map.districtAt(sp.x, sp.y);
  if (dist.name !== S.district) {
    if (S.distCand === dist.name) { if (performance.now() - S.distCandAt > 600) { S.district = dist.name; S.hud.showDistrict(dist.name, dist.isl); } }
    else { S.distCand = dist.name; S.distCandAt = performance.now(); }
  }
  S.hud.setClock(S.loopTime, S.weather);
  // the GPS route to your waypoint along the roads, on the radar and the map (client/route.js; worked out again only
  // when you stray from it or the waypoint changes)
  if (S.router) S.hud.route = S.waypoint && S.playing && S.me && !S.me.dead ? S.router.update(sp, S.waypoint, S.ctrlKind === CTRL.DRIVER || S.ctrlKind === CTRL.PASSENGER) : null;
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
  if (S.bigmap) { padMapLook(Math.min(0.05, F.dt || 0.016)); S.hud.drawBigMap(sp.x, sp.y, sp.a, { cats: mapwp.cats, route: S.hud.route, cross: input.device === 'gamepad' }); uiTop(); }
  else if (topOverlay() === 'pause') uiTop();
  if ((F.nowMs | 0) % 500 < 20) S.hud.setNet(`${S.practice ? 'OFFLINE PRACTICE · ' : ''}${S.fps} fps · ${Math.round(S.rtt)} ms · ${S.ents.size} ents`);
}

// Urban wildlife (GDD §10): client-side pigeons/gulls that scatter from cars and runners.
const birds = [];
function birdsTick(dt, view, vehs, peds) {
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
  }
}
function drawBirds() {
  for (let i = birds.length - 1; i >= 0; i--) {
    const b = birds[i];
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
const SEAT_JETSKI = [[-2, 0], [-14, 0]];
const RIDER_H = 28; // art rows from the top of the head down to the hips
// A rider astride a bike or jet ski: the upper body of the drawn character, facing the way the
// vehicle points, sat on the saddle (legs hidden by the bodywork).
function drawRider(p, v, def, seat) {
  const [x, y0] = localToWorld(v.rx, v.ry, v.ra, seat[0], seat[1]);
  const d8 = dir8(v.ra);
  const body = bodySprite(p.d.app, d8, 'idle', 0, 0);
  const lift = vehLift(def) + 2;
  if (body) {
    const sc = CSCALE * 0.92;
    g.save(); g.translate(x, y0 - lift); g.scale(sc, sc);
    g.imageSmoothingEnabled = false;
    g.drawImage(body, 0, 0, CW, RIDER_H, -CW / 2, -RIDER_H + 4, CW, RIDER_H);
    g.imageSmoothingEnabled = true;
    g.restore();
    return;
  }
  const spr = pedSprite(p.d.app, 'idle', 0, 0);
  g.save(); g.translate(x, y0 - lift); g.rotate(v.ra); g.drawImage(spr, -PED_BOX / 2 * 0.9, -PED_BOX / 2 * 0.9, PED_BOX * 0.9, PED_BOX * 0.9); g.restore();
}
const PED_SCALE = 1.18; // characters a touch smaller than before (was 1.35) - purely visual, physics radius unchanged
const PED_BUILD_SCALE = [0.92, 1, 1.07, 1.16]; // frail, average, tough, brute
// Home garage doors: roll up when your car pulls up to a garage you own (or when the server says
// a car was just parked / taken out).
function garagesTick(view, dt) {
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
  }
}
function drawGarageDoors(view) {
  for (const gr of S.map.garages || []) {
    const h = S.map.homes[gr.home];
    if (!h || !h.garageDoor) continue;
    const d = h.garageDoor;
    if (d.x < view.x0 - 100 || d.x > view.x1 + 100 || d.y < view.y0 - 100 || d.y > view.y1 + 100) continue;
    const k = S.garageAnim[gr.home] || 0;
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
function boathousesTick(view, dt, vehs) {
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
    S.bhFade[i] = cur + ((under ? 1 : 0) - cur) * (1 - Math.exp(-6 * dt));
  }
}
function drawBoathouseRoofs(view) {
  S.bhFade ??= [];
  const list = S.map.boathouses || [];
  for (let i = 0; i < list.length; i++) {
    const bh = list[i];
    const x = bh.tx * TILE - 6, y = bh.ty * TILE - 6, w = bh.tw * TILE + 12, h = bh.th * TILE + 12;
    if (x > view.x1 || x + w < view.x0 || y > view.y1 || y + h < view.y0) continue;
    const k = S.bhFade[i] || 0;
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
function baysTick(view, dt) {
  for (let i = 0; i < (S.map.bays || []).length; i++) {
    const b = S.map.bays[i];
    const x = b.tx * TILE, y = b.ty * TILE, w = b.tw * TILE, h = b.th * TILE;
    if (x > view.x1 || x + w < view.x0 || y > view.y1 || y + h < view.y0) continue;
    const want = S.bayOpen[i] === false ? 1 : 0;
    S.bayAnim[i] = (S.bayAnim[i] || 0) + (want - (S.bayAnim[i] || 0)) * (1 - Math.exp(-5 * dt));
  }
}
function drawBays(view) {
  for (let i = 0; i < (S.map.bays || []).length; i++) {
    const b = S.map.bays[i];
    const x = b.tx * TILE, y = b.ty * TILE, w = b.tw * TILE, h = b.th * TILE;
    if (x > view.x1 || x + w < view.x0 || y > view.y1 || y + h < view.y0) continue;
    const k = S.bayAnim[i] || 0;
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
  if (b.d.t === 3) { // a basketball
    g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(b.rx + z * 0.15, b.ry + z * 0.25 + 1, 4.6, 2.6, 0, 0, 6.28); g.fill();
    g.fillStyle = '#e0702a'; g.beginPath(); g.arc(b.rx, b.ry - z - 4.6, 4.6, 0, 6.28); g.fill(); g.strokeStyle = '#1e1a18'; g.lineWidth = 1; g.stroke();
    return;
  }
  if (b.d.t === 2) { // a golf ball: small and white, its shadow below it
    g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(b.rx + z * 0.15, b.ry + z * 0.25 + 1, 2.6, 1.6, 0, 0, 6.28); g.fill();
    g.fillStyle = '#f6f6f2'; g.beginPath(); g.arc(b.rx, b.ry - z - 2, 2.6, 0, 6.28); g.fill(); g.strokeStyle = '#3a3f48'; g.lineWidth = 0.8; g.stroke();
    return;
  }
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
// The walk-in you're standing in (riding the subway under a shop doesn't open it), easing every
// walk-in's roof fade; `art` gets the ones whose floor plan shows this frame.
function interiorTick(sp, art) {
  // (a balloon over a shop doesn't open it, nor a train under it; cuffed - custody.js walks you - it does)
  const cuffed = S.ctrlKind === CTRL.RIDER && !!S.ents.get(S.myPedId)?.d?.cf;
  const b = S.playing && (S.ctrlKind !== CTRL.RIDER || cuffed) && !(S.me && S.me.ride) ? walkInAt(sp.x, sp.y) : null;
  S.roofFade ??= {};
  for (const id of S.map.walkIns || []) {
    const want = b && b.id === id ? 1 : 0;
    const cur = S.roofFade[id] || 0;
    if (!want && cur < 0.01) continue;
    S.roofFade[id] = cur + (want - cur) * 0.15;
    art.push(id); // its floor plan is drawn: the lifted building above it fades out
  }
  return b;
}
// shop sliding doors open as people come and go
function doorsTick(view, peds, dt) {
  S.doorAnim ??= {};
  for (const id of S.map.walkIns || []) {
    const b = S.map.buildings[id];
    const x0 = b.tx * TILE, y0 = b.ty * TILE, x1 = x0 + b.tw * TILE, y1 = y0 + b.th * TILE;
    if (x1 < view.x0 || x0 > view.x1 || y1 < view.y0 || y0 > view.y1) continue;
    for (let i = 0; i < b.walkIn.units.length; i++) {
      const u = b.walkIn.units[i];
      const dx = (u.door.tx + u.door.w / 2) * TILE, dy = (u.door.ty + 0.5) * TILE;
      const near = peds.some((p) => !(p.flags & PF.INVEH) && Math.hypot(p.rx - dx, p.ry - dy) < 56);
      const key = id * 16 + i;
      S.doorAnim[key] = (S.doorAnim[key] || 0) + ((near ? 1 : 0) - (S.doorAnim[key] || 0)) * (1 - Math.exp(-9 * dt));
    }
  }
}
function coverWalkIns(view) {
  for (const id of S.map.walkIns || []) {
    const b = S.map.buildings[id];
    const x0 = b.tx * TILE, y0 = b.ty * TILE, x1 = x0 + b.tw * TILE, y1 = y0 + b.th * TILE;
    if (x1 < view.x0 || x0 > view.x1 || y1 < view.y0 || y0 > view.y1) continue;
    for (let i = 0; i < b.walkIn.units.length; i++) drawShopDoor(g, b.walkIn.units[i], b.walkIn.south, S.doorAnim[id * 16 + i] || 0);
  }
}

// Inside a police station: the lobby / armory art covers the city view while the menu is used.
let intShown = null, intDrawnAt = 0;
const DOWN_PULL = 1.42; // (server/view.js DOWN_ZOOM_OUT keeps a little more in view than this)
function tickInterior() {
  const kind = S.playing && S.me && !S.me.dead ? S.me.interior : null;
  const el = $('interior');
  if (kind !== intShown) {
    intShown = kind;
    el.classList.toggle('hidden', !kind);
    intDrawnAt = 0;
    if (kind) { $('int-open').textContent = kind === 'armory' ? '▲ Armory' : '▲ Front desk'; loadInteriorArt('assets/'); }
    $('int-open').style.display = kind === 'jail' ? 'none' : '';   // (a cell: the jail panel instead - hud.js)
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
function gatesTick(view, dt) {
  const list = S.map.gates || [];
  for (let i = 0; i < list.length; i++) {
    const gt = list[i];
    if (Math.abs(gt.x - (view.x0 + view.x1) / 2) > (view.x1 - view.x0) / 2 + 250 || Math.abs(gt.y - (view.y0 + view.y1) / 2) > (view.y1 - view.y0) / 2 + 250) continue;
    const want = S.gateOpen[i] ? 1 : 0;
    S.gateAnim[i] = (S.gateAnim[i] ?? want) + (want - (S.gateAnim[i] ?? want)) * (1 - Math.exp(-4 * dt));
  }
}
function drawGates(view) {
  const list = S.map.gates || [];
  for (let i = 0; i < list.length; i++) {
    const gt = list[i];
    if (Math.abs(gt.x - (view.x0 + view.x1) / 2) > (view.x1 - view.x0) / 2 + 250 || Math.abs(gt.y - (view.y0 + view.y1) / 2) > (view.y1 - view.y0) / 2 + 250) continue;
    const k = S.gateAnim[i] ?? (S.gateOpen[i] ? 1 : 0);
    if (gt.club) { drawClubShutter(gt, k); continue; }
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
// A club's roller shutter: rolls up into its box over the door at dusk, down again at dawn;
// "CLOSED - OPENS AT DUSK" while it's down.
function drawClubShutter(gt, k) {
  const w = gt.w, x0 = gt.x - w / 2, y0 = gt.y - 12;
  const h = 24 * (1 - k);
  g.save();
  g.fillStyle = '#3a3d44'; g.fillRect(x0 - 2, y0 - 6, w + 4, 6); // the shutter box
  if (h > 1) {
    g.fillStyle = '#8a8d94'; g.fillRect(x0, y0, w, h);
    g.fillStyle = 'rgba(0,0,0,.25)'; for (let yy = 2; yy < h; yy += 3) g.fillRect(x0, y0 + yy, w, 1);
    if (k < 0.2) { g.fillStyle = '#ff4fd8'; g.font = 'bold 7px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('OPENS AT DUSK', gt.x, gt.y); }
  }
  g.restore();
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
}
// the rumble of a moving train
function trainsTick(cars, riders) {
  if (!cars.length && !riders.length) return;
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
function crossingsTick(view, dt) {
  const xs = (S.map.rail && S.map.rail.crossings) || [];
  xs.forEach((c, i) => {
    const st = S.xing[i] || { d: 0, b: [0, 0] };
    const a = S.xingAnim[i] ?? 0;
    S.xingAnim[i] = a + ((st.d ? 1 : 0) - a) * (1 - Math.exp(-3.5 * dt));
    if (c.x < view.x0 - 260 || c.x > view.x1 + 260 || c.y < view.y0 - 260 || c.y > view.y1 + 260) return;
    if (st.d) sfx('bell', distVol(c.x, c.y) * 0.7);
  });
}
function drawCrossings(view, now) {
  const xs = (S.map.rail && S.map.rail.crossings) || [];
  xs.forEach((c, i) => {
    const st = S.xing[i] || { d: 0, b: [0, 0] };
    if (c.x < view.x0 - 260 || c.x > view.x1 + 260 || c.y < view.y0 - 260 || c.y > view.y1 + 260) return;
    drawCrossing(g, c, S.xingAnim[i] ?? 0, st.b || [0, 0], !!st.d, now);
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

// ---- golf (shared/golf.js; the server: server/systems/golf.js) ------------------------------------------------------
// The swing as this page sees it, one fixed step at a time exactly as the server counts it: S.golfHold is how long
// the attack button has been held by your ball (the meter: swingMeter), -1 when it isn't; the last swing's meter
// lingers on screen a moment (S.golfShown). Each new shot starts aimed at the flag (the server takes your aim from
// the last input, so a pad or touch player who doesn't touch the aim stick hits straight at the pin).
function golfSwingStep(inp) {
  const G = S.me && S.me.golf, Hh = S.me && S.me.hoops;
  if (!(G && G.near) && !(Hh && Hh.ready)) { if (S.golfHold >= 0) S.golfHold = -1; return; }
  if (!G) { if (inp.bits & IN.FIRE) S.golfHold = S.golfHold >= 0 ? S.golfHold + DT : 0; else if (S.golfHold >= 0) { S.golfShown = { p: swingMeter(S.golfHold), until: performance.now() + 900 }; S.golfHold = -1; } return; }
  const key = `${G.ball}:${G.s}`;
  if (S.golfAimFor !== key && G.pin) {
    const b = S.ents.get(G.ball);
    if (b && b.rx !== undefined) { S.lastAim = Math.atan2(G.pin.y - b.ry, G.pin.x - b.rx); S.golfAimFor = key; }
  }
  if (inp.bits & IN.FIRE) S.golfHold = S.golfHold >= 0 ? S.golfHold + DT : 0;
  else if (S.golfHold >= 0) { S.golfShown = { p: swingMeter(S.golfHold), until: performance.now() + 900 }; S.golfHold = -1; }
}
// where the swing points now: the mouse from your character, else the last aim (the pad's right stick, the aim stick)
function golfAimNow() {
  if (input.device === 'keyboard') { const sp = worldToScreen(selfPos()), m = mouseScreen(); if (sp && m) return Math.atan2(m.y - sp.y, m.x - sp.x); }
  return S.lastAim || 0;
}
// shooting hoops: the meter beside you, with the band that drops it in from where you stand
function drawHoops(g, z) {
  const Hh = S.me && S.me.hoops;
  if (!Hh || S.me.dead) return;
  const holding = S.golfHold >= 0, shown = !holding && S.golfShown && performance.now() < S.golfShown.until ? S.golfShown.p : null;
  if (!Hh.ready && shown === null) return;
  const hp = courtHoops(S.map)[Hh.k], sp = selfPos();
  if (!hp) return;
  const d = Math.hypot(hp.rim.x - sp.x, hp.rim.y - sp.y), ideal = idealPower(d), win = shotWindow(d), p = holding ? swingMeter(S.golfHold) : shown ?? 0;
  const x = sp.x + 18, y = sp.y - 34, h = 40, w = 6;
  g.save(); g.globalAlpha = 0.95;
  g.fillStyle = 'rgba(0,0,0,.7)'; g.fillRect(x - 1 / z, y - 1 / z, w + 2 / z, h + 2 / z);
  g.fillStyle = 'rgba(80,220,110,.55)'; g.fillRect(x, y + h * (1 - Math.min(1, ideal + win)), w, h * (Math.min(1, ideal + win) - Math.max(0, ideal - win)));
  if (holding || shown !== null) { g.fillStyle = Math.abs(p - ideal) <= win ? '#7dff7a' : '#ff8a3a'; g.fillRect(x + 1 / z, y + h * (1 - p) - 1.5 / z, w - 2 / z, 3 / z); }
  g.restore();
}
// your ball ringed; by it, the aim line out as far as the swing would carry and the meter beside you
function drawGolf(g, z, now) {
  const G = S.me && S.me.golf, b = G && S.ents.get(G.ball);
  if (!G || !b || b.rx === undefined || S.me.dead) return;
  const bz = (b.extra || 0) * 2, by = b.ry - bz - 2;
  g.save();
  g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 1.5 / z;
  g.beginPath(); g.arc(b.rx, by, 7 + Math.sin(now * 5) * 1.5, 0, 6.28); g.stroke();
  if (G.near) {
    const holding = S.golfHold >= 0, shown = !holding && S.golfShown && performance.now() < S.golfShown.until ? S.golfShown.p : null;
    const p = holding ? swingMeter(S.golfHold) : shown ?? 1, a = golfAimNow(), d = golfCarry(G.club, p);
    g.globalAlpha = holding ? 0.95 : 0.5; g.setLineDash([6 / z, 5 / z]); g.strokeStyle = '#fff8c0'; g.lineWidth = 2 / z;
    g.beginPath(); g.moveTo(b.rx, by); g.lineTo(b.rx + Math.cos(a) * d, by + Math.sin(a) * d); g.stroke(); g.setLineDash([]);
    g.beginPath(); g.arc(b.rx + Math.cos(a) * d, by + Math.sin(a) * d, 5 / z, 0, 6.28); g.stroke();
    if (holding || shown !== null) {   // the meter: a bar beside you, green to the top, red past it
      const sp = selfPos(), x = sp.x + 18, y = sp.y - 34, h = 40, w = 6;
      g.globalAlpha = 0.95; g.fillStyle = 'rgba(0,0,0,.7)'; g.fillRect(x - 1 / z, y - 1 / z, w + 2 / z, h + 2 / z);
      g.fillStyle = p > 0.92 ? '#7dff7a' : p > 0.6 ? '#ffd400' : '#ff8a3a'; g.fillRect(x, y + h * (1 - p), w, h * p);
    }
  }
  g.restore();
}

// ---- rides (shared/rides.js; the server: server/systems/rides.js) -------------------------------------------------
// What's under way, by id: the kind, the cab, the route and the balloon's colours or the slide and the slider's looks,
// and when it started on this page's clock (the server says how far in it is). The renderer draws them (art2 host.js
// _rides); a rider's camera opens out and follows the cab round, the balloon across the country or you up the slide
// tower and down (rideCam).
function rideOn(r) {
  if (!S.rides) S.rides = new Map();
  S.rides.set(r.id, { id: r.id, ped: r.ped, k: r.k, d: r.d, cab: r.cab, r: r.r, pal: r.pal, sl: r.sl, app: r.app, ar: r.ar, at: performance.now() / 1000 - (r.el || 0) });
}
// how far a rider's camera pulls back (server/view.js RIDE_ZOOM_OUT keeps a little more in view); a slide is short
const RIDE_PULL = 1.42, SLIDE_PULL = 1.12;
const rideTmp = {};
// where the camera looks on my ride, eased in from where I stood and back at the end ([x, y, k] or null)
function rideCam(tx, ty) {
  const mine = S.me && S.me.ride, R = mine && S.rides ? S.rides.get(mine.id) : null;
  if (!R) return null;
  const t = performance.now() / 1000 - R.at, ease = R.k === 'slide' ? 0.6 : 1.4, e = Math.max(0, Math.min(1, t / ease, (R.d - t) / ease)), k = e * e * (3 - 2 * e);
  let x, y;
  if (R.k === 'ferris') {
    const w = ferrisSite(S.map);
    if (!w) return null;
    const c = ferrisCab(w, R.cab, S.loopTime || 0, rideTmp);
    x = w.x + (c.x - w.x) * 0.5; y = w.y - c.z * 0.75 - 20;   // (up with the cab: at the top the view is out over the bay)
  } else if (R.k === 'slide') {
    const site = slideSite(S.map);
    if (!site) return null;
    slideRider(site, R.sl, Math.max(0, Math.min(t, R.d)), rideTmp);
    x = rideTmp.x; y = rideTmp.y - rideTmp.z * 0.8;           // (on you, up the stair and down the slide)
  } else {
    const route = balloonRoutes(S.map)[R.r];
    if (!route) return null;
    balloonAt(route, Math.max(0, Math.min(t, R.d)), R.d, rideTmp);
    x = rideTmp.x; y = rideTmp.y - rideTmp.z * 0.55;          // (the basket a little above the middle, the country all round)
  }
  return [tx + (x - tx) * k, ty + (y - ty) * k, k];
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
// A vehicle's visual state for the frame and what it throws off (once a frame, whichever renderer
// draws it): sinking in the water, leaning on corners, smoke, fire, skid marks, a boat's wake, the
// siren and the horn.
const vehSpeed = (v) => (v.buf.length > 1 ? Math.hypot(v.buf[v.buf.length - 1].x - v.buf[v.buf.length - 2].x, v.buf[v.buf.length - 1].y - v.buf[v.buf.length - 2].y) * 20 : 0);
const vehSinking = (v, def) => def.kind !== 'boat' && WATER_T[S.map.tileAtPx(v.rx, v.ry)] === 1;
function vehVisual(v, now, dt) {
  const def = VEHICLE_BY_INDEX[v.d.m];
  if (!def) return;
  const f = v.flags;
  // a land vehicle in the water is sinking: it settles, darkens and fades, bubbling
  const sinking = vehSinking(v, def);
  v.sinkT = sinking ? (v.sinkT || 0) + dt : 0;
  if (sinking && Math.random() < 0.5) S.fx.splash(v.rx + (Math.random() - 0.5) * def.L * 0.6, v.ry + (Math.random() - 0.5) * def.W * 0.6, 1);
  // leaning out on corners (from how fast it turns at speed)
  const prevA = v.leanA ?? v.ra;
  let dA = v.ra - prevA; while (dA > Math.PI) dA -= Math.PI * 2; while (dA < -Math.PI) dA += Math.PI * 2;
  v.leanA = v.ra;
  const spd = vehSpeed(v);
  const latT = Math.max(-1, Math.min(1, (dA / Math.max(dt, 1e-3)) * spd / 900));
  v.lean = (v.lean || 0) + (latT - (v.lean || 0)) * (1 - Math.exp(-6 * dt));
  // particles: smoke, fire, drift, boat wake, siren audio
  const fwdX = Math.cos(v.ra), fwdY = Math.sin(v.ra);
  if ((f & VF.SMOKE) && Math.random() < ((f & VF.DEAD) ? 0.75 : 0.3)) S.fx.smoke(v.rx + fwdX * def.L * 0.35, v.ry + fwdY * def.L * 0.35, !!(f & (VF.WRECK | VF.DEAD))); // (a dying engine pours black smoke)
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
  // (the engines, sirens, horns and tyres: client/sound/vehicles.js, from soundFrame)
  void now;
}
function drawVehicleEnt(v, now, dt) {
  const def = VEHICLE_BY_INDEX[v.d.m];
  if (!def) return;
  const f = v.flags;
  // a land vehicle in the water is sinking: it settles, darkens and fades, bubbling (vehVisual)
  const sinking = vehSinking(v, def);
  const sk = Math.min(1, (v.sinkT || 0) / 3);
  // 2.5D lift: side walls (the darkened outline stacked up the screen), the top view raised on
  // them, leaning out on corners and nosing down under braking
  const lift = sinking ? 0 : vehLift(def);
  const spd = vehSpeed(v);
  const leanPx = def.kind === 'boat' ? 0 : -(v.lean || 0) * (def.kind === 'bike' ? 2.5 : 1.6), dip = (f & VF.BRAKE) && spd > 60 ? 1 : 0;
  g.save();
  g.translate(v.rx, v.ry);
  if (sinking) { g.globalAlpha = 1 - 0.75 * sk; g.scale(1 - 0.18 * sk, 1 - 0.18 * sk); }
  if (v.blinkUntil > now || driverBlinks(v)) g.globalAlpha *= Math.floor(now * 10) % 2 ? 0.25 : 1; // pulling out of a garage
  if (def.kind !== 'boat' && !sinking) {
    // the shadow falls away from the sun (in the world, not turning with the car), longer when it's low
    const sk = gfx.shadows >= 2 ? S.sky : null, sl = sk ? 3 + 7 * Math.min(1.6, sk.shadowLen) * sk.sun : 4;
    const ox = sk ? sk.sunDir.x * sl : 3, oy = sk ? sk.sunDir.y * sl : 4;
    g.save(); g.translate(ox, oy); g.rotate(v.ra); drawVehicleShadow(g, v.d, def, true); g.restore();
  }
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
  // riders on bikes and jet skis sit in the open: driver up front, a passenger behind
  if (def.kind === 'bike' || def.id === 'jetski') {
    const seats = def.kind === 'bike' ? SEAT_BIKE : SEAT_JETSKI;
    for (const p of S.ents.values()) if (p.kind === K.PED && p.parent === v.id && p.d && !(p.flags & PF.DEAD)) { const pass = (p.flags & PF.PASSENGER) !== 0; drawRider(p, v, def, !pass && def.seat !== undefined ? [def.seat, 0] : seats[pass ? 1 : 0]); }
  }
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
}

// A lost pet: the drawn dog or cat. Top-down art turns to face where it's going; the 3/4 art
// faces the camera and mirrors left / right. A little bob while it trots.
function drawAnimal(p, now) {
  const key = p.d.ar.slice(4).split(':')[0], art = ANIMAL_ART[key];   // (a wild one's ':y' young / ':L' legend: drawn as its kind)
  const sp = p.as || 0;
  // walking / running frames by speed; a pet that has stood still a moment sits down (p.stillSince: pedVisual)
  if (p.stillSince === undefined) p.stillSince = now;
  g.save();
  g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(p.rx + 2, p.ry + 4, 13, 6, 0, 0, 6.28); g.fill();
  if (!art || !atlas.animals) { g.fillStyle = '#a0703a'; g.beginPath(); g.ellipse(p.rx, p.ry, 12, 7, p.ra, 0, 6.28); g.fill(); g.restore(); return; }
  const f = art.f;
  const r = !f ? art.r : sp > 70 ? f.run[Math.floor(now * 14 + p.id) % 4] : sp > 12 ? f.walk[Math.floor(now * 8 + p.id) % 4] : now - p.stillSince > 1.2 ? f.sit : f.idle;
  const [sx, sy, sw, sh] = r, pad = art.pad || 0;
  g.imageSmoothingEnabled = false;
  if (art.view === 'top') {
    g.translate(p.rx, p.ry); g.rotate(p.ra);
    const k = 0.9; g.drawImage(atlas.animals, sx, sy, sw, sh, -sw * k / 2, -sh * k / 2, sw * k, sh * k);
  } else {
    const k = 0.75, flip = Math.cos(p.ra) < -0.2;
    g.translate(p.rx, p.ry + 4); if (flip) g.scale(-1, 1);
    g.drawImage(atlas.animals, sx, sy, sw, sh, -sw * k / 2, -(sh - pad) * k, sw * k, sh * k);
  }
  g.imageSmoothingEnabled = true;
  g.restore();
}

// How a person looks this frame (pure; kept on the entity, no allocation): the pose (pedPose, plus
// being thrown from a vehicle and tumbling along), its animation frame, the move speed level, the hit
// flash, swimming. pedVisual, drawPed and the art v2 renderer all read it.
function pedLook(p, now) {
  const f = p.flags;
  let pose = pedPose(p);
  // thrown from a vehicle: airborne arc, then a roll / faceplant / slide on the back
  const flT = p.flingAt !== undefined ? now - p.flingAt : 99;
  const flying = flT < (p.flingDur || 0);
  const flK = p.flingK;
  const flRecent = flT < (p.flingDur || 0) + 3;
  if (flying) pose = flK === 'roll' ? 'roll' : 'down';
  else if (pose === 'down' && !(f & PF.DEAD) && (p.as || 0) > 70 && !(flRecent && flK !== 'roll')) pose = 'roll'; // tumbling along
  // how they lie: the dead as they fell (the death event: face down, on the back, on the side - else as their last
  // throw landed); the knocked down on the face or the back after a faceplant or a slide, pushing up to get up
  const tL = flT - (p.flingDur || 0);
  // cut down by a blade (the death event's k): a beat or two standing or on the knees before they lie still, turning
  // as they go if they were spun round (the turn stays with the body)
  let seqFr = -1, turn = 0;
  if (pose === 'dead') {
    const k = p.deadK, seq = DEATH_SEQ[k], dT = p.deathAt !== undefined ? now - p.deathAt : 99;
    if (DEATH_TURN[k]) { const sp = DEATH_TURN[k], u = Math.min(1, dT / sp[1]); turn = sp[0] * (p.id & 1 ? 1 : -1) * (1 - (1 - u) * (1 - u)); }
    const step = seq && !flying ? seq.find((s) => dT < s[0]) : null;
    if (step) { pose = step[1]; seqFr = step[2]; }
    else pose = DEAD_POSE[k || (flRecent && FLING_LIE[flK]) || DEAD_BY_ID[p.id % 3]] || 'dead';
  } else if (pose === 'down' && !flying && !(f & PF.STUN) && flRecent && (flK === 'face' || flK === 'slide')) pose = flK === 'face' ? 'downF' : 'downB';
  else if (pose === 'down' && p.d && p.d.cf) pose = 'downF';   // (cuffed and held face down)
  // a hit: a stagger back on the heels (or forward, hit from behind); hurt and walking: a limp
  const rT = p.reactAt !== undefined ? now - p.reactAt : 99, stag = seqFr < 0 && rT < (p.reactD || 0) && STAGGER_FROM.has(pose);
  if (stag) pose = 'stagger';
  else if (pose === 'move' && (f & PF.BLEED) && !(f & PF.SPRINT) && (p.as || 0) < 175) pose = 'limp';
  else if (pose === 'aim' && (p.as || 0) > 14) pose = 'aimw';   // walking while aiming: the legs stride, the gun stays up
  let fr = pose === 'move' || pose === 'carry' || pose === 'limp' || pose === 'aimw' || pose === 'cuffed' ? Math.floor(p.phase || 0) % 8 : pose === 'roll' ? Math.floor(now * 12) % 4 : pose === 'idle' ? Math.floor(now * 1.5 + p.id) % 8 : pose === 'down' && (f & PF.STUN) ? 1
    : pose === 'stagger' ? (Math.cos((p.reactA || 0) - (p.ra || 0)) > 0.2 ? 2 : 0) + (rT > p.reactD * 0.45 ? 1 : 0)
      : pose === 'crawl' ? Math.floor(now * 3.2 + p.id) % 4 : (pose === 'downF' || pose === 'downB') && tL > 0.55 ? 1 : pose === 'sitlow' ? Math.floor(now * 0.22 + p.id * 0.37) % 2 : 0;
  if (pose === 'punch' || pose === 'swing') fr = Math.min(3, Math.floor(((now - p.swingAt) / SWING_TIME) * 4)) + (p.swingSide ? 4 : 0);
  if (seqFr >= 0) fr = seqFr;
  if (pose === 'downF' && p.d && p.d.cf) fr = 0;   // (held flat, not pushing up)
  const L = p._look || (p._look = {});
  L.pose = pose; L.fr = fr; L.flT = flT; L.flying = flying; L.flK = flK; L.flRecent = flRecent; L.turn = turn;
  L.lvl = (p.as || 0) < 62 ? 0 : p.as < 112 ? 1 : p.as < 165 ? 2 : 3;
  L.hitK = p.hitAt !== undefined ? Math.max(0, 1 - (now - p.hitAt) / 0.22) : 0;
  L.swimming = !(f & PF.INVEH) && !!p.swim;
  L.upright = UPRIGHT.has(pose) && !flying;
  return L;
}
// What a person throws off this frame (once a frame, whichever renderer draws them): the thud and dust
// of landing after being thrown, splashes while swimming, blood drips while bleeding, stun sparks; a
// pet that has stood still a moment sits down.
function pedVisual(p, now) {
  const f = p.flags;
  if (f & PF.INVEH) return;
  if (p.smokeUntil && now < p.smokeUntil && Math.random() < 0.05) S.fx.smoke(p.rx + (Math.random() - 0.5) * 12, p.ry + (Math.random() - 0.5) * 6, false);   // (cut in two by the plasma blade: the seared halves smoke a while)
  if (p.d && p.d.ar && p.d.ar.startsWith('pet:')) { if ((p.as || 0) > 12 || p.stillSince === undefined) p.stillSince = now; return; }
  if (p.blink === 3) return; // inside a home
  const L = pedLook(p, now);
  if (!L.flying && L.flRecent && !p.flingLanded && p.flingAt !== undefined) { p.flingLanded = true; S.fx.smoke(p.rx, p.ry, false); S.fx.smoke(p.rx + 6, p.ry + 4, false); sfx('thud', distVol(p.rx, p.ry)); }
  if (L.swimming && (p.as || 0) > 30 && Math.random() < 0.12 && S.map.tileAtPx(p.rx, p.ry) !== T.BRIDGE) S.fx.splash(p.rx, p.ry, 2);
  // lying still (the drawn body on the ground) doesn't drip; standing, the sparks fly round the head
  const lying = !L.upright && LYING.has(L.pose) && !L.flying && !L.swimming && (!!S.art2 || !!lyingSprite(p.d.app, L.pose.startsWith('dead') ? 1 : 0));
  if (!lying && (f & PF.BLEED) && Math.random() < 0.08) S.fx.spawn(1, p.rx, p.ry, 0, 0, 0.3, 2, '#9a0f14');
  if (f & PF.STUN && Math.random() < 0.3) S.fx.spawn(4, p.rx + (Math.random() - 0.5) * 14, p.ry - (L.upright ? 20 : 0) + (Math.random() - 0.5) * 14, 0, 0, 0.15, 2, '#9fdcff');
}
function drawPed(p, now) {
  const f = p.flags;
  if (f & PF.INVEH) return;
  if (p.d && p.d.ar && p.d.ar.startsWith('pet:')) { drawAnimal(p, now); return; }
  if (p.blink === 3) return; // inside a home
  const { pose: pose0, fr, lvl, hitK, flT, flying, flK, flRecent, swimming, turn } = pedLook(p, now);
  const pose = V1_POSE[pose0] || pose0;
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
      g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(p.rx + 2, p.ry + 3, 24, 10, p.ra + turn, 0, 6.28); g.fill();
      g.translate(p.rx, p.ry); g.rotate(p.ra + turn + Math.PI);
      const sc = 1.25;
      g.imageSmoothingEnabled = false;
      if (f & PF.GHOST) g.globalAlpha = 0.45;
      g.drawImage(ly, -LW * sc / 2, -LH * sc / 2, LW * sc, LH * sc);
      if (hitK > 0.4) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = hitK - 0.4; g.drawImage(ly, -LW * sc / 2, -LH * sc / 2, LW * sc, LH * sc); g.globalCompositeOperation = 'source-over'; }
      g.imageSmoothingEnabled = true;
      g.restore();
      return;
    }
  }
  // diving, tumbling or thrown through the air: the drawn body, tucked up and turning over
  const tuck = !swimming ? lyingSprite(p.d.app, pose === 'dead' ? 1 : 0) : null;
  const spr = tuck ? null : pedSprite(p.d.app, pose === 'move' ? 'move' + lvl : pose, fr, p.extra);
  g.save();
  if (swimming) g.globalAlpha = f & PF.DEAD ? 0.5 : 0.72; // body under the surface, head above
  let lift = 0, spin = 0, grow = 1;
  if (tuck && pose === 'roll' && !flying) spin = (now * 15 + p.id) % (Math.PI * 2); // rolling along the ground
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
  g.rotate(p.ra + turn + spin + (hitK ? 0.25 * hitK : 0) + limp * 0.28);
  if (limp) g.translate(0, Math.max(0, limp) * 2.5);
  if (grow !== 1) g.scale(grow, grow);
  if (pose === 'punch' && (fr & 3) === 2) { g.translate(3, 0); }
  if (f & PF.GHOST) g.globalAlpha = 0.45 + 0.2 * Math.sin(now * 8);
  if (p.blink) g.globalAlpha *= Math.floor(now * (p.blink === 1 ? 3 : 10)) % 2 ? 0.18 : 1; // going indoors (slow, then fast) / spawn protection
  const bs = PED_BUILD_SCALE[p.d.app && p.d.app.bd !== undefined ? p.d.app.bd : 1] || 1;
  g.imageSmoothingEnabled = false; // crisp pixel-art characters
  if (tuck) {
    // the lying-down body, squeezed into a ball for a roll, stretched out flat when flung
    g.rotate(Math.PI);
    const sq = pose === 'roll' ? 0.58 : 1;
    g.scale(1.15 * bs * sq, 1.15 * bs);
    g.drawImage(tuck, -LW / 2, -LH / 2, LW, LH);
    if (hitK > 0.4) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = (hitK - 0.4); g.drawImage(tuck, -LW / 2, -LH / 2, LW, LH); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
  } else {
    g.scale(PED_SCALE * bs, PED_SCALE * bs);
    g.drawImage(spr, -PED_BOX / 2, -PED_BOX / 2, PED_BOX, PED_BOX);
    if (hitK > 0.4) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = (hitK - 0.4); g.drawImage(spr, -PED_BOX / 2, -PED_BOX / 2, PED_BOX, PED_BOX); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
  }
  g.imageSmoothingEnabled = true;
  if (pose === 'fish') { g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(24, -6); g.lineTo(44, 0); g.stroke(); }
  g.restore();
  if (f & PF.UMBRELLA) { const u = umbrellaSprite(p.id % UMBRELLA_COLORS.length); g.drawImage(u, p.rx - 18, p.ry - 20, 35, 35); }
}

// Upright 3/4 character: feet on the ground point, mirrored for the east-facing directions.
const UPRIGHT = new Set(['idle', 'move', 'punch', 'swing', 'aim', 'aimw', 'carry', 'fish', 'kneel', 'stagger', 'limp', 'sitlow', 'cuffed']);
const LYING = new Set(['down', 'dead', 'deadF', 'deadS', 'downF', 'downB', 'crawl']); // flat on the ground (art2 people.js poses)
const STAGGER_FROM = new Set(['idle', 'move', 'aim', 'aimw', 'punch', 'swing', 'carry']);
const DEAD_POSE = { face: 'deadF', back: 'dead', side: 'deadS', knees: 'deadF', stab: 'deadF', slump: 'dead', spin: 'deadS', slash: 'deadS', halved: 'dead' }, FLING_LIE = { face: 'face', slide: 'back', roll: 'side' }, DEAD_BY_ID = ['back', 'face', 'side'];
// How the cut down go down (server reactions.js died): [until s after the death, pose, frame] - knocked back then
// sinking to the knees and forward onto the face; doubled over a stab, to the knees, face down; rocked back, sagging
// onto the back; spun round (DEATH_TURN: [radians, over s]) or turned by a slash, onto the side
const DEATH_SEQ = { knees: [[0.22, 'stagger', 0], [0.95, 'kneel', 1]], stab: [[0.3, 'stagger', 2], [0.85, 'kneel', 1]], slump: [[0.35, 'stagger', 0], [0.6, 'stagger', 1]], spin: [[0.55, 'stagger', 0]], slash: [[0.4, 'stagger', 0]] };
const DEATH_TURN = { spin: [4.4, 0.55], slash: [2.2, 0.4] };
// the old renderer's sprites for the poses it doesn't have (the subway view)
const V1_POSE = { stagger: 'idle', limp: 'move', aimw: 'aim', crawl: 'down', downF: 'down', downB: 'down', deadF: 'dead', deadS: 'dead', cuffed: 'move' };
const CSCALE = 1.32; // world px per character art px
function drawUpright(p, pose, fr, hitK, swimming, now) {
  const f = p.flags;
  const d8 = dir8(p.ra + ((p._look && p._look.turn) || 0));   // (spun round as they go down: pedLook's turn)
  // concept-art body (all 8 directions drawn); the procedural painter until it has loaded
  const kneel = pose === 'kneel' || pose === 'sitlow';   // (sitting by a fire: drawn low like a kneel here)
  if (kneel) { pose = 'carry'; fr = 0; } // reaching both hands down to the patient
  const body = bodySprite(p.d.app, d8, pose, fr, p.extra);
  const [d, mirror0] = baseDir(d8);
  const mirror = body ? false : mirror0;
  const spr = body || charSprite(p.d.app, d, pose, fr, p.extra);
  const bs = PED_BUILD_SCALE[p.d.app && p.d.app.bd !== undefined ? p.d.app.bd : 1] || 1;
  const sc = CSCALE * (0.92 + 0.08 * bs) ;
  const limp = p.d && !p.d.pl && p.hp < NPC_CRITICAL && pose.startsWith('move') && !(f & PF.DEAD) ? Math.sin((p.phase || 0) * Math.PI / 4) : 0;
  const fx = p.rx + (hitK ? Math.cos(p.hitA) * 4 * hitK : 0), fy = p.ry + 6 + (hitK ? Math.sin(p.hitA) * 3 * hitK : 0);
  g.save();
  if (!swimming) { // contact shadow, and the body's shadow thrown away from the sun
    const sk = S.sky;
    if (sk && sk.sun > 0.05 && gfx.shadows >= 2) {
      const L = Math.max(0.35, Math.min(1.7, sk.shadowLen * 0.75)) * 30 * bs, dx = sk.sunDir.x, dy = Math.max(0.28, sk.sunDir.y);
      const n = Math.hypot(dx, dy);
      g.fillStyle = `rgba(12,15,34,${(0.36 * sk.sun).toFixed(3)})`;
      g.beginPath(); g.ellipse(fx + dx / n * L * 0.5, fy - 1 + dy / n * L * 0.5, L * 0.55, 5 * bs, Math.atan2(dy, dx), 0, 6.28); g.fill();
    }
    g.fillStyle = 'rgba(0,0,0,.24)'; g.beginPath(); g.ellipse(fx + 1, fy - 1, 9 * bs, 4, 0, 0, 6.28); g.fill();
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
  } else if (kneel) { // down on one knee: the body sinks, the shins fold under (hidden by the thigh line)
    g.drawImage(spr, 0, 0, CW, 34, -CW / 2, -FOOT_Y + 10, CW, 34);
  } else g.drawImage(spr, -CW / 2, -FOOT_Y);
  if (hitK > 0.4) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = hitK - 0.4; g.drawImage(spr, -CW / 2, -FOOT_Y); g.globalCompositeOperation = 'source-over'; }
  g.imageSmoothingEnabled = true;
  g.restore();
  if (pose === 'fish') { const a = p.ra; g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(p.rx + Math.cos(a) * 20, p.ry - 14 + Math.sin(a) * 10); g.lineTo(p.rx + Math.cos(a) * 46, p.ry + Math.sin(a) * 30); g.stroke(); }
  if (f & PF.UMBRELLA) { const u = umbrellaSprite(p.id % UMBRELLA_COLORS.length); g.drawImage(u, p.rx - 20, p.ry - 62, 40, 40); }
}

// Traffic signals on mast arms: a pole on the near-right corner of every approach with an arm
// reaching right across the incoming lanes and a 3-lamp head over each lane, facing the drivers. Cameras sit on poles.
const SIG_COL = { G: '#3ddc84', Y: '#ffc23d', R: '#ff3b3b' };
// Every signal head in view and the colour it shows (next frame's light sources: collectLights runs first).
function signalsTick(view) {
  S.sigHeads = [];
  for (const sg of S.map.signals || []) {
    if (sg.x < view.x0 - 260 || sg.x > view.x1 + 260 || sg.y < view.y0 - 260 || sg.y > view.y1 + 260) continue;
    const n = S.map.nodes[sg.node];
    if (sg.wire) { for (const h of sg.heads) S.sigHeads.push({ x: h.x, y: h.y, c: SIG_COL[signalFor(n, h.edge, S.loopTime)] }); continue; }
    const pr = S.map.props[sg.pi];
    if (pr && pr.broken) continue; // knocked over
    const st = signalFor(n, sg.edge, S.loopTime);
    for (const [x, y] of sg.hs || [[sg.hx, sg.hy]]) S.sigHeads.push({ x, y, c: SIG_COL[st] });
  }
}
function drawSignals(view) {
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
      // a head over every incoming lane: three lamps in a row across the arm, facing the drivers
      for (const [x, y] of sg.hs || [[hx, hy]]) {
        g.save(); g.translate(x, y); g.rotate(Math.atan2(ry, rx));
        g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(-12, -1, 28, 10);
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
  }
  const nowMs = performance.now();
  for (const c of S.map.cameras) {
    if (c.x < view.x0 - 60 || c.x > view.x1 + 60 || c.y < view.y0 - 60 || c.y > view.y1 + 60) continue;
    const alert = (S.camAlert.get(c.id) || 0) > nowMs;
    if (c.toll) { drawTollGantry(c, alert, nowMs); continue; }
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

// Riding the subway: the tunnel lamps sweep past the windows - warm bands of light run back
// along the carriage, one per lamp, faster the faster the train goes, with a faint flicker.
const SUB_LAMP_GAP = 150; // world px between tunnel lamps (render/trains.js drawTunnel)
let subBand = null;
function drawSubwayLights(car, z, dt) {
  const prev = S.subPrev;
  S.subPrev = { x: car.rx, y: car.ry, id: car.id };
  if (!prev || prev.id !== car.id || dt <= 0) return;
  const v = Math.min(900, Math.hypot(car.rx - prev.x, car.ry - prev.y) / dt);
  S.subSpeed = (S.subSpeed || 0) + (v - (S.subSpeed || 0)) * Math.min(1, dt * 4);
  const spd = S.subSpeed;
  S.subPhase = ((S.subPhase || 0) + (spd * dt) / SUB_LAMP_GAP) % 1;
  const k = Math.min(1, spd / 260); // 0 standing at a platform .. 1 at speed
  const ux = Math.cos(car.ra), uy = Math.sin(car.ra);
  const cxs = W / 2, cys = H / 2, gap = SUB_LAMP_GAP * z, reach = Math.hypot(W, H);
  if (!subBand) { // one soft band, drawn once and stretched across the screen for every lamp
    subBand = document.createElement('canvas'); subBand.width = 64; subBand.height = 4;
    const bg = subBand.getContext('2d');
    const gr = bg.createLinearGradient(0, 0, 64, 0);
    gr.addColorStop(0, 'rgba(255,205,130,0)'); gr.addColorStop(0.5, 'rgba(255,205,130,1)'); gr.addColorStop(1, 'rgba(255,205,130,0)');
    bg.fillStyle = gr; bg.fillRect(0, 0, 64, 4);
  }
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = 0.07 + 0.17 * k;
  const w = gap * 0.32, ang = Math.atan2(uy, ux);
  for (let i = -Math.ceil(reach / gap) - 1; i <= Math.ceil(reach / gap) + 1; i++) {
    const d = (i - S.subPhase) * gap; // bands drift backwards along the train
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    g.translate(cxs + ux * d, cys + uy * d); g.rotate(ang);
    g.drawImage(subBand, -w, -reach, w * 2, reach * 2);
  }
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  g.globalAlpha = 1;
  // the whole carriage brightens a touch each time a lamp goes by
  const pulse = Math.pow(Math.max(0, Math.cos(S.subPhase * Math.PI * 2)), 6) * 0.08 * k + (Math.random() < 0.02 * k ? 0.04 : 0);
  if (pulse > 0.002) { g.fillStyle = `rgba(255,220,160,${pulse.toFixed(3)})`; g.fillRect(0, 0, W, H); }
  g.restore();
}

// A subtle green $ hovering over every cash machine (brighter when you have cash on you and are
// close), and a big bouncing one with a light beam over the ATM the phone sent you to.
function drawAtmMarks(view, now) {
  const me = selfPos();
  const cash = S.me && S.me.cash > 0;
  const wp = S.waypoint && S.waypoint.atm ? S.waypoint : null;
  for (const a of S.map.atms || []) {
    if (a.x < view.x0 - 60 || a.x > view.x1 + 60 || a.y < view.y0 - 80 || a.y > view.y1 + 60) continue;
    const target = wp && Math.abs(wp.x - a.x) < 1 && Math.abs(wp.y - a.y) < 1;
    const near = Math.hypot(a.x - me.x, a.y - me.y) < 420;
    const bob = Math.sin(now * 2.6 + a.x * 0.01) * (target ? 6 : 2.5);
    const r = target ? 15 : 8;
    const y = a.y - (target ? 112 : 88) + bob; // above the machine (the POI is where you stand, in front of it)
    g.save();
    g.globalAlpha = target ? 1 : cash && near ? 0.9 : 0.5;
    if (target) {
      const beam = g.createLinearGradient(0, y, 0, a.y);
      beam.addColorStop(0, 'rgba(61,220,132,.0)'); beam.addColorStop(1, 'rgba(61,220,132,.35)');
      g.fillStyle = beam; g.fillRect(a.x - 9, y, 18, a.y - y);
    }
    g.fillStyle = 'rgba(61,220,132,.25)'; g.beginPath(); g.arc(a.x, y, r + 5, 0, 6.28); g.fill();
    g.fillStyle = '#17803f'; g.beginPath(); g.arc(a.x, y, r, 0, 6.28); g.fill();
    g.strokeStyle = '#7ff0a8'; g.lineWidth = target ? 2.5 : 1.5; g.stroke();
    g.fillStyle = '#eafff1'; g.font = `800 ${target ? 20 : 11}px Rubik, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('$', a.x, y + 1);
    g.restore();
  }
}

// Spike strips lying across the road: a black band of steel teeth, yellow tips at the ends.
function spikesTick(nowMs) { for (const [id, s] of S.spikes) if (nowMs > s.until) S.spikes.delete(id); }
function drawSpikes(view) {
  const nowMs = performance.now();
  for (const s of S.spikes.values()) {
    if (nowMs > s.until) continue;
    if (s.x < view.x0 - 100 || s.x > view.x1 + 100 || s.y < view.y0 - 100 || s.y > view.y1 + 100) continue;
    g.save(); g.translate(s.x, s.y); g.rotate(s.a);
    g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(-s.half + 2, -3, s.half * 2, 9);
    g.fillStyle = '#1c1e24'; g.fillRect(-s.half, -4, s.half * 2, 8);
    g.fillStyle = '#d8dde2';
    for (let x = -s.half + 4; x < s.half - 2; x += 7) { g.beginPath(); g.moveTo(x, -4); g.lineTo(x + 3, -8); g.lineTo(x + 6, -4); g.fill(); g.beginPath(); g.moveTo(x, 4); g.lineTo(x + 3, 8); g.lineTo(x + 6, 4); g.fill(); }
    g.fillStyle = '#f2c21b'; g.fillRect(-s.half - 3, -5, 4, 10); g.fillRect(s.half - 1, -5, 4, 10);
    g.restore();
  }
}

// Bridge toll camera: a steel gantry spanning the road with a camera over each direction.
function drawTollGantry(c, alert, nowMs) {
  const nx = -Math.sin(c.a), ny = Math.cos(c.a), ux = Math.cos(c.a), uy = Math.sin(c.a);
  const r = c.hw + 14;
  const ax = c.x - nx * r, ay = c.y - ny * r, bx = c.x + nx * r, by = c.y + ny * r;
  g.strokeStyle = 'rgba(0,0,0,.3)'; g.lineWidth = 7; g.beginPath(); g.moveTo(ax + 6, ay + 8); g.lineTo(bx + 6, by + 8); g.stroke();
  g.strokeStyle = '#3a3f4a'; g.lineWidth = 6; g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
  g.strokeStyle = '#6a7180'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(ax, ay - 2); g.lineTo(bx, by - 2); g.stroke();
  for (const [px, py] of [[ax, ay], [bx, by]]) { g.fillStyle = '#2a2d35'; g.fillRect(px - 5, py - 5, 10, 10); g.fillStyle = '#f2c21b'; g.fillRect(px - 2, py - 2, 4, 4); }
  const on = alert ? Math.floor(nowMs / 120) % 2 : Math.floor(nowMs / 900) % 2;
  for (const s of [-0.45, 0.45]) {
    const hx = c.x + nx * c.hw * s, hy = c.y + ny * c.hw * s, dir = s < 0 ? 1 : -1;
    g.save(); g.translate(hx, hy); g.rotate(c.a + (dir < 0 ? Math.PI : 0));
    g.fillStyle = '#d8dce4'; g.fillRect(-4, -5, 14, 10); g.fillStyle = '#9aa0aa'; g.fillRect(-4, 3, 14, 2);
    g.fillStyle = '#1a1c22'; g.fillRect(10, -3.5, 4, 7);
    g.restore();
    if (on) { g.fillStyle = alert ? '#ff2a2a' : '#3b8aff'; g.beginPath(); g.arc(hx + ux * dir * 12, hy + uy * dir * 12, 2.5, 0, 6.28); g.fill(); }
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

// The golden skull over a player with a bounty on their head (server/systems/bounties.js; descriptor bt), for everyone
// to see - the target too. A little pixel skull, made once and drawn crisp at any zoom, with a slow gold glow.
const SKULL = ['...#####...', '.#########.', '###########', '###########', '##...#...##', '##...#...##', '###########', '.####.####.', '..#######..', '..#.#.#.#..', '..#######..'];
let skullImg = null;
const SKULL_HEAD = 46;   // world px from a standing person's feet to the top of their head (art v2 people)
function skullSprite() {
  if (skullImg) return skullImg;
  const n = SKULL.length, c = document.createElement('canvas');
  c.width = n + 2; c.height = n + 2;
  const k = c.getContext('2d'), on = (x, y) => SKULL[y] && SKULL[y][x] === '#';
  k.fillStyle = '#2a1600';   // the outline (and, inside, the eyes, the nose and between the teeth)
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (on(x, y)) k.fillRect(x, y, 3, 3);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (!on(x, y)) continue;
    k.fillStyle = !on(x - 1, y - 1) || !on(x, y - 1) ? '#ffe795' : !on(x + 1, y + 1) || !on(x, y + 1) ? '#c47f12' : '#f4b929';
    k.fillRect(x + 1, y + 1, 1, 1);
  }
  return (skullImg = c);
}
function drawSkull(x, y, z, now) {
  const s = 26 / z, bob = Math.sin(now * 2.4) * 2 / z;
  const glow = g.createRadialGradient(x, y + bob, 0, x, y + bob, s);
  glow.addColorStop(0, `rgba(255,205,70,${0.32 + 0.14 * Math.sin(now * 3.1)})`); glow.addColorStop(1, 'rgba(255,205,70,0)');
  g.fillStyle = glow; g.fillRect(x - s, y + bob - s, s * 2, s * 2);
  const sm = g.imageSmoothingEnabled;
  g.imageSmoothingEnabled = false;
  g.drawImage(skullSprite(), x - s / 2, y + bob - s / 2, s, s);
  g.imageSmoothingEnabled = sm;
}

function drawWorldLabels(peds, vehs, now, z) {
  const fs = 12 / z;
  g.textAlign = 'center';
  g.font = `bold ${fs}px monospace`;
  for (const p of peds) {
    if (p.flags & PF.INVEH && !p.d.pl) continue;
    const py = p.ry - (p.rz ? liftOf(p.rz) : 0); // drawn up on the deck when on the highway
    // (clear above the head at any zoom: the head's top is ~46 world px up; then a gap and half the skull, in screen px)
    if (p.d.bt && p.blink !== 3 && !(p.flags & PF.DEAD)) drawSkull(p.rx, py - SKULL_HEAD - ((p.flags & PF.FLARE) ? 46 : 21) / z, z, now);
    if (p.flags & PF.FLARE) {
      // GDD §6: 3-second public red exclamation flare above a reported suspect
      const bob = Math.sin(now * 10) * 3 / z;
      g.fillStyle = '#000'; g.font = `bold ${30 / z}px monospace`; g.fillText('!', p.rx + 1.5 / z, py - 30 / z + bob + 1.5 / z);
      g.fillStyle = Math.floor(now * 8) % 2 ? '#ff2020' : '#ff7070'; g.fillText('!', p.rx, py - 30 / z + bob);
      g.font = `bold ${fs}px monospace`;
    }
    if (!p.d.pl && p.barUntil && S.loopClock < p.barUntil && p.hp < 0.999 && !(p.flags & PF.DEAD)) {
      // health bar over whoever you're brawling with; tough/brute builds get a tag so you can size them up
      const y = py - 24 / z, bd = p.d.app ? p.d.app.bd : 1;
      g.fillStyle = 'rgba(0,0,0,.75)'; g.fillRect(p.rx - 16 / z, y, 32 / z, 5 / z);
      g.fillStyle = p.hp < 0.3 ? '#ff4d5e' : '#7fe07f'; g.fillRect(p.rx - 15 / z, y + 1 / z, 30 / z * p.hp, 3 / z);
      if (bd >= 2) { g.fillStyle = bd === 3 ? '#ff9a3a' : '#ffd36b'; g.font = `bold ${11 / z}px monospace`; g.fillText(bd === 3 ? 'BRUTE' : 'TOUGH', p.rx, y - 6 / z); g.font = `bold ${fs}px monospace`; }
    }
    if (p.d.pl && p.d.n && p.id !== S.myPedId) {
      const y = py - 26 / z;
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
  drawGolf(g, z, now);
  drawHoops(g, z);
  if (me && me.job) {
    g.fillStyle = '#ffd400'; g.strokeStyle = '#000'; g.lineWidth = 2 / z;
    const bob = Math.sin(now * 4) * 5;
    g.beginPath(); g.moveTo(me.job.x, me.job.y - 20 + bob); g.lineTo(me.job.x - 10, me.job.y - 40 + bob); g.lineTo(me.job.x + 10, me.job.y - 40 + bob); g.closePath(); g.fill(); g.stroke();
  }
  void vehs;
}

// ---- lighting: every light source of the frame into the light map and the bloom pass -----------
// (render/lighting.js does the compositing). Also returns the light sources the puddles and the rain
// pick up, in world px.
const reflSrc = [], selfLit = [], countryLit = [];
// shadow sizes (height, footprint) of the tall country props
// props that lie flat (or draw their own) and cast nothing
const NO_CAST = new Set(['gravel', 'rubble', 'flowerbed', 'mosaic', 'rwlight', 'painted', 'plamp', 'sigpole', 'atmw', 'plane', 'solar', 'subway_l', 'subway_r', 'roof_ac', 'roof_heli', 'roof_tanks', 'roof_sky', 'roof_access']);
const castList = [];
const RW_COL = { w: LIGHT.head, g: LIGHT.green, r: LIGHT.red, b: LIGHT.blue };
const TALL_SHADOW = { lamp: { h: 34, r: 3 }, turbine: { h: 120, r: 7 }, radiotower: { h: 110, r: 9 }, upole: { h: 36, r: 3 }, flare: { h: 50, r: 4 }, dome: { h: 60, r: 60 }, dscreen: { h: 50, r: 70 }, marquee: { h: 30, r: 26 }, pumpjack: { h: 30, r: 40 }, otank: { h: 60, r: 46 } };
function collectLights(sky, view, vehs, peds, dt) {
  selfLit.length = 0; countryLit.length = 0;
  const L = S.light;
  const night = sky.night, t = S.loopTime;
  const haze = 1 + sky.fog.k * 1.4 + S.rainK * 0.7;
  reflSrc.length = 0;
  S.flashes = S.flashes.filter((f) => (f.t -= dt) > 0);
  const inV = (x, y, m) => x > view.x0 - m && x < view.x1 + m && y > view.y0 - m && y < view.y1 + m;
  // street lamps: they come on one by one at dusk, a few flicker or are out (render/atmos.js)
  const lamps = S.map.lamps;
  for (let i = 0; i < lamps.length; i++) {
    const l = lamps[i];
    if (l.broken || night <= 0.05) { l._lv = 0; continue; }
    if (!inV(l.x, l.y, 220)) continue;
    const lv = lampLevel(i, t, night, l);
    l._lv = lv;
    if (lv <= 0) continue;
    const h = lampHead(l);
    L.add(h.x, h.y, 190, LIGHT.sodium, 1.05 * lv);
    L.glow(h.x, h.y, 22, LIGHT.warm, 0.6 * lv);                 // the bulb
    L.glow(h.x, h.y, 130, LIGHT.sodium, 0.1 * lv * haze);       // light hanging in the air round it
    reflSrc.push({ x: h.x, y: h.y, c: LIGHT.sodium, a: 0.9 * lv });
  }
  if (night > 0.05) {
    // lit windows and shop fronts throw light out onto the pavement
    for (const it of S.buildings.inView(view)) {
      const b = it.b;
      if (b.kind === 'motorpool' || (S.roofFade && (S.roofFade[b.id] || 0) > 0.3)) continue;
      if (hashA(b.id, 5) > (it.flat ? 0.9 : 0.72)) continue; // some are dark
      const k = night * (0.35 + 0.35 * hashA(b.id, 6));
      for (let x = it.x0 + 48; x < it.x1 - 16; x += 110) {
        L.add(x, it.y1 + 18, 85, LIGHT.window, k);
        L.glow(x, it.y1 + 6, 42, LIGHT.window, 0.05 * k * haze);
      }
    }
    // shop doors, ATMs and screens
    for (const p of S.map.pois) {
      if (!inV(p.x, p.y, 120)) continue;
      if (p.kind === 'atm') { L.add(p.x, p.y - 24, 60, LIGHT.cyan, 0.6 * night); L.glow(p.x, p.y - 26, 10, LIGHT.cyan, 0.55 * night); continue; }
      if (p.kind === 'home' || p.kind === 'evidence' || p.kind === 'reception' || p.kind === 'race') continue;   // (a race's start: out on the track or the water)
      L.add(p.x, p.y - 8, 120, LIGHT.warm, 0.55 * night);
      reflSrc.push({ x: p.x, y: p.y, c: LIGHT.warm, a: 0.4 * night });
    }
    const [cx0, cx1, cy0, cy1] = S.chunkView;
    for (let cy = Math.max(0, cy0); cy <= cy1; cy++) for (let cx = Math.max(0, cx0); cx <= cx1; cx++) {
      for (const p of S.ground.lowProps.get(cy * 1000 + cx) || []) {
        if (p.broken) continue;
        if (p.t === 'busstop') { L.add(p.x + 28, p.y, 70, LIGHT.white, 0.5 * night); L.glow(p.x + 28, p.y - 6, 18, LIGHT.warm, 0.25 * night); continue; }
        if (p.t === 'rwlight') { const c = RW_COL[p.c] || LIGHT.white; L.add(p.x, p.y, 34, c, 0.7 * night); L.glow(p.x, p.y, 7, c, 0.9 * night); L.glow(p.x, p.y, 20, c, 0.12 * night * haze); continue; }
        if (!p.t.startsWith('vend')) continue;
        const c = p.t === 'vend_cola' ? LIGHT.red : LIGHT.white;
        L.add(p.x, p.y, 55, c, 0.55 * night); L.glow(p.x, p.y - 6, 14, c, 0.4 * night);
      }
    }
  }
  // out in the country: camp fires and the flare stack burn day and night; beacons, the drive-in's
  // screen and marquee and the observatory light up after dark
  {
    const [cx0, cx1, cy0, cy1] = S.chunkView;
    for (let cy = Math.max(0, cy0); cy <= cy1 + 2; cy++) for (let cx = Math.max(0, cx0 - 1); cx <= cx1 + 1; cx++) for (const p of S.ground.overhead(cx, cy)) {
      if (p.broken || !COUNTRY_TALL[p.t] || p.t === 'upole' || p.t === 'pumpjack' || p.t === 'otank') continue;
      if (!inV(p.x, p.y, 260)) continue;
      const fl = 0.8 + 0.2 * Math.sin(S.loopClock * 17 + p.x) * Math.sin(S.loopClock * 7.3 + p.y);
      if (p.t === 'campfire') {
        if (!p.lit) continue;
        L.add(p.x, p.y - 8, 170, LIGHT.fire, (0.35 + 0.8 * night) * fl);
        L.glow(p.x, p.y - 10, 26, LIGHT.fire, (0.15 + 0.4 * night) * fl);
        reflSrc.push({ x: p.x, y: p.y - 8, c: LIGHT.fire, a: 0.7 * night });
        if (Math.random() < dt * 1.6) S.fx.smoke(p.x + (Math.random() - 0.5) * 4, p.y - 16, false);
        if (night > 0.05) countryLit.push(p);
      } else if (p.t === 'flare') {
        const fy = countryLightY(p, 0.96);
        L.add(p.x, fy + 10, 280, LIGHT.fire, (0.4 + 0.9 * night) * fl);
        L.glow(p.x, fy, 46, LIGHT.fire, (0.2 + 0.4 * night) * fl);
        if (Math.random() < dt * 2) S.fx.smoke(p.x, fy - 14, true);
        if (night > 0.05) countryLit.push(p);
      } else if (night > 0.05) {
        countryLit.push(p);
        if (p.t === 'dscreen') { const sy = countryLightY(p, 0.65); L.add(p.x, sy + 120, 340, LIGHT.white, 0.75 * night); L.glow(p.x, sy, 160, LIGHT.white, 0.06 * night * haze); reflSrc.push({ x: p.x, y: sy + 120, c: LIGHT.white, a: 0.6 * night }); }
        else if (p.t === 'marquee') { L.add(p.x, p.y - 50, 110, LIGHT.warm, 0.8 * night); L.glow(p.x, p.y - 56, 40, LIGHT.amber, 0.12 * night * haze); }
        else if (p.t === 'dome') { L.add(p.x, p.y - 30, 160, LIGHT.window, 0.5 * night); }
        else if (p.t === 'radiotower' || p.t === 'turbine') L.glow(p.x, countryLightY(p, 0.95), 30, LIGHT.red, 0.12 * night * haze);
      }
    }
  }
  // billboards (lit from above) and bus shelters are tall props: they live in the overhead lists
  if (night > 0.05) {
    const [cx0, cx1, cy0, cy1] = S.chunkView;
    for (let cy = Math.max(0, cy0); cy <= cy1 + 1; cy++) for (let cx = Math.max(0, cx0); cx <= cx1; cx++) for (const p of S.ground.overhead(cx, cy)) {
      if (p.broken) continue;
      if (p.t === 'billboard' || p.t === 'busstop') selfLit.push(p);
      if (p.t === 'billboard') { const y = p.y - 26; L.add(p.x, y, 110, LIGHT.white, 0.8 * night); L.glow(p.x, y - 6, 60, LIGHT.white, 0.08 * night * haze); reflSrc.push({ x: p.x, y, c: LIGHT.white, a: 0.6 * night }); }
      else if (p.t === 'busstop') { L.add(p.x + 26, p.y - 4, 75, LIGHT.white, 0.6 * night); L.glow(p.x + 26, p.y - 10, 16, LIGHT.warm, 0.3 * night); }
      else if (p.t === 'phonebox') { L.add(p.x, p.y, 45, LIGHT.warm, 0.5 * night); }
    }
  }
  // traffic signals (last frame's heads: signalsTick runs later in the frame)
  for (const h of S.sigHeads || []) {
    const c = h.rgb || (h.rgb = hexRgb(h.c));
    if (night > 0.05) { L.add(h.x, h.y, 56, c, 0.75 * night); reflSrc.push({ x: h.x, y: h.y, c, a: 0.8 * night }); }
    L.glow(h.x, h.y, 9, c, 0.25 + 0.6 * night);
    L.glow(h.x, h.y, 34, c, (0.04 + 0.1 * night) * haze);
  }
  // vehicles: headlight beams, tail lights, sirens, fires
  for (const v of vehs) {
    const def = VEHICLE_BY_INDEX[v.d.m];
    if (!def) continue;
    const lift = v.rz ? liftOf(v.rz) : 0, vy = v.ry - lift;
    const c = Math.cos(v.ra), sn = Math.sin(v.ra), hl = def.L / 2, hw = def.W / 2;
    if (v.flags & VF.LIGHTS) {
      const fx = v.rx + c * hl, fy = vy + sn * hl;
      L.cone(fx, fy, v.ra, 340, 100, LIGHT.head, 1);
      L.add(v.rx, vy, def.L * 0.9, LIGHT.head, 0.22);
      L.beam(fx, fy, v.ra, 260, 64, LIGHT.head, 0.07 * haze);
      for (const sd of [-1, 1]) {
        const px = fx - sn * hw * 0.62 * sd, py = fy + c * hw * 0.62 * sd;
        L.glow(px, py, 9, LIGHT.white, 0.85);
        const tx = v.rx - c * hl - sn * hw * 0.62 * sd, ty = vy - sn * hl + c * hw * 0.62 * sd;
        const br = v.flags & VF.BRAKE;
        L.add(tx, ty, br ? 60 : 36, LIGHT.red, br ? 0.85 : 0.45);
        L.glow(tx, ty, br ? 12 : 7, LIGHT.red, br ? 0.9 : 0.55);
      }
      reflSrc.push({ x: fx, y: fy, c: LIGHT.head, a: 0.9 });
    } else if (v.flags & VF.BRAKE) {
      for (const sd of [-1, 1]) { const tx = v.rx - c * hl - sn * hw * 0.62 * sd, ty = vy - sn * hl + c * hw * 0.62 * sd; L.glow(tx, ty, 8, LIGHT.red, 0.5); }
    }
    if (v.flags & VF.SIREN) {
      const ph = Math.floor(S.loopClock * 6) % 2, col = ph ? LIGHT.red : LIGHT.blue;
      L.add(v.rx, vy, 260, col, 0.9);
      L.glow(v.rx, vy, 70, col, 0.35 + 0.15 * night);
      reflSrc.push({ x: v.rx, y: vy, c: col, a: 0.9 });
    }
    if (v.flags & VF.BURN) {
      const f = 0.75 + 0.25 * Math.sin(S.loopClock * 23 + v.id);
      L.add(v.rx, vy, 200, LIGHT.fire, 1.1 * f);
      L.glow(v.rx, vy, 70, LIGHT.fire, 0.3 * f);
    }
  }
  // trains: lit carriages, the locomotive's headlight down the line
  for (const c of S.trainCars || []) {
    if (!(c.flags & 8)) continue;
    const def = TRAIN_CARS[c.d.c];
    L.add(c.rx, c.ry, def.L * 0.75, LIGHT.window, 0.6);
    if (c.d.c === 0) { const x = c.rx + Math.cos(c.ra) * def.L / 2, y = c.ry + Math.sin(c.ra) * def.L / 2; L.cone(x, y, c.ra, 460, 100, LIGHT.head, 1); L.beam(x, y, c.ra, 380, 70, LIGHT.head, 0.08 * haze); }
  }
  // flashlights: police on foot carry theirs after dark; a player's shines whenever it's switched on (d.fl in
  // the spawn descriptor - they buy one and switch it on): a soft beam by day, the full cone at night
  for (const p of peds) {
    if ((p.flags & (PF.INVEH | PF.DEAD | PF.DOWN)) || p.swim || p.blink === 3) continue;
    const torch = !!(p.d && p.d.fl), cop = night > 0.35 && !!(p.flags & PF.BADGE);
    if (!torch && !cop) continue;
    const a = p.ra, x = p.rx + Math.cos(a) * 8, y = p.ry - 10 + Math.sin(a) * 8;
    if (night > 0.05) L.cone(x, y, a, torch ? 240 : 200, 62, LIGHT.white, 0.85 * night);
    L.beam(x, y, a, 170, 40, LIGHT.white, torch ? 0.16 * (1 - night) + 0.06 * haze * night : 0.045 * haze * night);
  }
  // the plasma blade gives off its own blue light in the hand
  for (const p of peds) {
    if (p.extra !== PLASMA_I || (p.flags & (PF.INVEH | PF.DEAD)) || p.blink === 3) continue;
    const x = p.rx + Math.cos(p.ra) * 10, y = p.ry - 12 + Math.sin(p.ra) * 10;
    L.add(x, y, 90, LIGHT.blue, 0.3 + 0.6 * night);
    L.glow(x, y, 20, LIGHT.cyan, 0.25 + 0.3 * night);
  }
  if (night > 0.35) {
    const sp = selfPos();
    L.add(sp.x, sp.y - (sp.z ? liftOf(sp.z) : 0), 100, LIGHT.moon, 0.22 * night); // enough to see yourself by
  }
  // gunfire and explosions light everything round them
  for (const f of S.flashes) {
    if (f.kind === 'boom') {
      const e = Math.min(1.6, f.t * 3.2) * (0.8 + 0.2 * Math.sin(S.loopClock * 40));
      L.add(f.x, f.y, f.r * 1.3, LIGHT.fire, e);
      L.glow(f.x, f.y, f.r * 0.55, LIGHT.fire, 0.45 * Math.min(1, e));
      L.glow(f.x, f.y, f.r * 0.22, LIGHT.flash, 0.7 * Math.min(1, e));
    } else if (f.kind === 'plasma') {   // (a flash of blue light: the hooded stranger gone)
      const e = Math.min(1.5, f.t * 5);
      L.add(f.x, f.y, f.r, LIGHT.blue, e);
      L.glow(f.x, f.y, f.r * 0.25, LIGHT.cyan, 0.7 * Math.min(1, e));
    } else {
      const e = Math.min(1.4, f.t * 22);
      L.add(f.x, f.y, f.r || 150, LIGHT.flash, e);
      if (f.a !== undefined) L.beam(f.x, f.y, f.a, 64, 20, LIGHT.flash, 0.9 * Math.min(1, e));
      L.glow(f.x, f.y, 26, LIGHT.flash, 0.8 * Math.min(1, e));
    }
  }
  // anything burning lights its surroundings
  let fires = 0;
  for (const o of S.fx.p) {
    if (!o.on || o.type !== 3 || fires > 26) continue;
    if (!inV(o.x, o.y, 60)) continue;
    fires++;
    L.add(o.x, o.y, 70, LIGHT.fire, 0.35);
  }
  return reflSrc;
}
const hexRgb = (h) => { const n = parseInt(h.slice(1, 7), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const hashA = (a, b) => hashAt(a, b);

// ---- night: lit windows, neon and lobby light from the per-lot emissive layer ------------------
// The lit windows / neon of every lot after dark. Drawn into its own layer first, with the people
// and cars standing in front of it cut out, so the glow lights the street but doesn't wash over
// someone walking past a shopfront.
let glowCv = null, gg2 = null;
function drawNightGlow(dark, peds, vehs) {
  if (!S.worldTf || !S.viewRect) return;
  // (at half resolution: it's light, not detail, and it's bloomed anyway)
  const cw = Math.ceil(g.canvas.width / 2), ch = Math.ceil(g.canvas.height / 2);
  if (!glowCv || glowCv.width !== cw || glowCv.height !== ch) { glowCv = document.createElement('canvas'); glowCv.width = cw; glowCv.height = ch; gg2 = glowCv.getContext('2d'); }
  gg2.setTransform(1, 0, 0, 1, 0, 0);
  gg2.clearRect(0, 0, cw, ch);
  const wt = S.worldTf;
  gg2.setTransform(wt[0] / 2, 0, 0, wt[3] / 2, wt[4] / 2, wt[5] / 2);
  gg2.globalCompositeOperation = 'source-over';
  gg2.imageSmoothingEnabled = true;
  let any = false;
  const t = S.loopTime;
  for (const it of S.buildings.inView(S.viewRect)) {
    if (S.roofFade && (S.roofFade[it.b.id] || 0) > 0.3) continue; // (not over a building you're inside)
    // neon in the rough parts of town misbehaves now and then (render/atmos.js)
    const tier = it.d && it.d.tier;
    gg2.globalAlpha = neonLevel(it.b.id, t, tier === 'low' || tier === 'rough');
    S.buildings.drawGlow(gg2, it); any = true;
  }
  gg2.globalAlpha = 1;
  if (!any) return;
  gg2.globalCompositeOperation = 'destination-out';
  gg2.fillStyle = '#000';
  for (const p of peds || []) {
    if (p.flags & PF.INVEH) continue;
    gg2.beginPath(); gg2.ellipse(p.rx, p.ry - 18, 11, 26, 0, 0, 6.28); gg2.fill(); // an upright figure
  }
  for (const v of vehs || []) {
    const def = v.d ? VEHICLE_BY_INDEX[v.d.m] : null;
    if (!def) continue;
    gg2.save(); gg2.translate(v.rx, v.ry); gg2.rotate(v.ra); gg2.fillRect(-def.L / 2, -def.W / 2, def.L, def.W); gg2.restore();
  }
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = Math.min(1, dark * 0.8);
  g.imageSmoothingEnabled = true;
  g.drawImage(glowCv, 0, 0, g.canvas.width, g.canvas.height);
  g.restore();
  // ...and the neon blooms into the air round it
  S.light.bloom(g, glowCv, Math.min(1, dark));
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
  }
  if (dark > 0.05) {
    for (const l of S.map.lamps) if (!l.broken && (l._lv || 0) > 0.05 && l.x > view.x0 && l.x < view.x1 && l.y > view.y0 - 40 && l.y < view.y1) { const h = lampHead(l); reflect(h.x, h.y + 10, 60, 11, '255,200,110', 0.4 * dark * l._lv); }
    for (const h of S.sigHeads || []) if (h.rgb) reflect(h.x, h.y + 8, 46, 7, h.rgb.join(','), 0.45 * dark);
    for (const p of S.map.pois) if (p.x > view.x0 && p.x < view.x1 && p.y > view.y0 - 40 && p.y < view.y1) reflect(p.x, p.y + 6, 50, 26, '255,190,100', 0.22 * dark);
  }
  g.restore();
  void now; void dt;
}
// wet roads: moving cars throw spray off their back wheels
function tyreSpray(vehs, dt) {
  for (const v of vehs) {
    const def = VEHICLE_BY_INDEX[v.d.m];
    if (!def || def.kind === 'boat') continue;
    const c = Math.cos(v.ra), sn = Math.sin(v.ra), L = def.L / 2 - 3, Wd = def.W / 2 - 6;
    const sp = v._lx !== undefined ? Math.hypot(v.rx - v._lx, v.ry - v._ly) / Math.max(dt, 1e-3) : 0;
    v._lx = v.rx; v._ly = v.ry;
    if (sp > 140 && Math.random() < 0.7) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const tx = v.rx - c * L - sn * Wd * side, ty = v.ry - sn * L + c * Wd * side;
      S.fx.spawn(5, tx, ty, -c * sp * 0.25 + (Math.random() - 0.5) * 40, -sn * sp * 0.25 + (Math.random() - 0.5) * 40, 0.35, 2, '#cfe6ff', 0, 30);
    }
  }
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

function drawRain(dt, sky) {
  // the lights the streaks catch, in screen px
  const ls = [];
  for (const r of reflSrc) {
    if (ls.length >= 28) break;
    const s2 = worldToScreen(r);
    if (s2.x < -150 || s2.y < -150 || s2.x > W + 150 || s2.y > H + 150) continue;
    ls.push({ x: s2.x, y: s2.y, r: 150 * S.cam.zoom, c: r.c, a: r.a });
  }
  // (the new renderer splashes the drops on the world itself - rings on water, splashes on the ground and on car
  // roofs - so the screen-space bursts, which travelled with the camera, are only drawn for the classic renderer)
  S.wx.drawRain(g, W, H, dt, ls, sky, gfx.weather ? gfxQuality() : 0, 0.1 + 0.5 * wind.strength * -wind.dx, !(S.art2 && S.art2.ready));
}

// ---------------------------------------------------------------------------
// The new renderer needs none of the classic art, so the game starts straight away; the classic
// renderer waits for its art first.
// (the bake workers are made now, so their code loads while the city is built: art2/game/pool.js warmPool)
if (ART2_WANTED && worldCv) import('./art2/game/pool.js').then((P) => P.warmPool({ lowMem: LOW_MEM, artPx: /[?&]artpx=1\b/.test(location.search) ? 1 : 2 })).catch(() => {});
if (ART2_WANTED) { connect(); requestAnimationFrame(frame); }
else ensureV1Art().finally(() => { connect(); requestAnimationFrame(frame); });

// expose for automated playtests / debugging in the console
window.CLA = { S, send, WEAPONS, load: LOAD, spectate: (on = true) => (on ? enterSpectate() : exitSpectate()), smash: (i, a = 0) => setPropBroken(i, a, true), wind: (v) => { wind.force = v === undefined || v === null ? null : v; return wind.name; } };
