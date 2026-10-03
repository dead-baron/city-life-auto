// Load-test / simulation bots. Each bot is a real WebSocket client that logs in as a guest,
// walks around, enters vehicles and drives, then reports server tick time + bandwidth.
//
// Usage: node tools/bots.js [count=20] [seconds=60] [url=ws://localhost:8080/ws] [--spread]
//   --spread  (dev servers only) teleports each bot to a random intersection so the load
//             resembles a real city instead of everyone standing at the hospital.
// Writes a timestamped log to logs/bots-<time>.log
import { mkdirSync, appendFileSync } from 'node:fs';
import { encodeInput, decodeSnapshot, MSG_SNAPSHOT, CTRL } from '../shared/protocol.js';
import { IN, quantizeAngle, quantizeAxis } from '../shared/input.js';

const COUNT = Number(process.argv.slice(2).filter((a) => !a.startsWith('--'))[0] || 20);
const SECONDS = Number(process.argv.slice(2).filter((a) => !a.startsWith('--'))[1] || 60);
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const SPREAD = process.argv.includes('--spread');
const URL_WS = args[2] || 'ws://localhost:8080/ws';
const HTTP = URL_WS.replace(/^ws/, 'http').replace(/\/ws$/, '');

mkdirSync('logs', { recursive: true });
const LOG = `logs/bots-${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
const log = (s) => { const line = `[${new Date().toISOString()}] ${s}`; console.log(line); appendFileSync(LOG, line + '\n'); };

const totals = { bytes: 0, snaps: 0, welcomed: 0, errors: 0, entitiesSeen: 0, inVehicle: 0 };

function startBot(i) {
  const ws = new WebSocket(URL_WS);
  ws.binaryType = 'arraybuffer';
  let seq = 0, timer = null, ctrl = 0, mode = 'walk', heading = Math.random() * 6.28, tAcc = 0;
  ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', token: null }));
  ws.onmessage = (ev) => {
    if (typeof ev.data === 'string') {
      totals.bytes += ev.data.length;
      const m = JSON.parse(ev.data);
      if (m.t === 'welcome') {
        totals.welcomed++;
        if (SPREAD) {
          // ROAD_X / ROAD_Y grid from shared/map.js: random intersection, offset onto the sidewalk
          const rx = [4, 28, 52, 76, 100, 124, 148, 172], ry = [4, 28, 52, 76, 100, 124, 148, 172, 196];
          const x = (rx[Math.floor(Math.random() * rx.length)] + 5) * 32, y = (ry[Math.floor(Math.random() * ry.length)] + 5) * 32;
          ws.send(JSON.stringify({ t: 'dev', c: 'tp', x, y }));
        }
        timer = setInterval(tick, 50);
      }
      return;
    }
    totals.bytes += ev.data.byteLength;
    const dv = new DataView(ev.data);
    if (dv.getUint8(0) === MSG_SNAPSHOT) {
      const s = decodeSnapshot(dv);
      totals.snaps++;
      totals.entitiesSeen += s.ents.length;
      ctrl = s.ctrlKind;
    }
  };
  ws.onerror = () => { totals.errors++; };
  ws.onclose = () => clearInterval(timer);
  function tick() {
    tAcc += 0.05;
    if (Math.random() < 0.02) heading += (Math.random() - 0.5) * 2;
    let bits = 0, mx = Math.cos(heading), my = Math.sin(heading);
    if (ctrl === CTRL.DRIVER) { mx = Math.sin(tAcc * 0.7 + i) * 0.6; my = -0.8; }
    if (Math.random() < 0.01) bits |= IN.VEHICLE;            // try to enter / exit vehicles
    if (Math.random() < 0.05) bits |= IN.SPRINT;
    if (Math.random() < 0.005) bits |= IN.DIVE;
    if (mode === 'walk' && Math.random() < 0.002) mode = 'idle';
    if (mode === 'idle') { mx = 0; my = 0; if (Math.random() < 0.02) mode = 'walk'; }
    seq++;
    ws.send(encodeInput(seq, bits, quantizeAxis(mx), quantizeAxis(my), quantizeAngle(heading)));
  }
  return ws;
}

const bots = [];
log(`starting ${COUNT} bots for ${SECONDS}s against ${URL_WS}`);
for (let i = 0; i < COUNT; i++) setTimeout(() => bots.push(startBot(i)), i * 60);

let last = { bytes: 0, snaps: 0 };
const iv = setInterval(async () => {
  let stats = {};
  try { stats = await (await fetch(HTTP + '/stats')).json(); } catch { /* server stats unavailable */ }
  const kb = (totals.bytes - last.bytes) / 1024 / 5;
  const sn = (totals.snaps - last.snaps) / 5;
  last = { bytes: totals.bytes, snaps: totals.snaps };
  log(`bots=${totals.welcomed}/${COUNT} recv=${kb.toFixed(1)}KB/s total (${(kb / Math.max(1, totals.welcomed)).toFixed(2)} KB/s per bot) snaps/s=${sn.toFixed(0)} | server tick avg=${stats.tickMsAvg}ms max=${stats.tickMsMax}ms ents=${stats.entities} npc=${stats.npcPeds} veh=${stats.vehicles} errors=${totals.errors}`);
}, 5000);

setTimeout(() => {
  clearInterval(iv);
  const avgEnts = totals.entitiesSeen / Math.max(1, totals.snaps);
  log(`DONE. snapshots=${totals.snaps} avg entities per snapshot=${avgEnts.toFixed(1)} total received=${(totals.bytes / 1048576).toFixed(2)}MB errors=${totals.errors}`);
  log(`log written to ${LOG}`);
  for (const b of bots) try { b.close(); } catch { /* closing */ }
  setTimeout(() => process.exit(0), 300);
}, SECONDS * 1000);
