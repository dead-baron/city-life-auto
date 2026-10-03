// City Life Auto authoritative server entry point.
// Serves the static client, accepts WebSocket players, runs the 20 Hz world tick and
// persists profiles. Zero third-party dependencies: `node server/index.js`.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';
import { config } from './config.js';
import { attachWebSocketServer } from './ws.js';
import { issueToken, verifyToken, newPlayerId } from './auth.js';
import { store } from './store.js';
import { World } from './world.js';
import { generateCity } from '../shared/map.js';
import { TICK_MS } from '../shared/constants.js';
import { decodeInput, MSG_INPUT } from '../shared/protocol.js';
import * as players from './systems/players.js';
import * as combat from './systems/combat.js';
import * as economy from './systems/economy.js';
import * as dev from './dev.js';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8',
};
const STATIC_ROOTS = ['client/', 'shared/', 'assets/'];

const map = generateCity(config.seed);
const world = new World(map, { dev: config.dev, npcBudget: config.npcBudget });
const startedAt = Date.now();

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  let path = decodeURIComponent(url.pathname);
  if (path === '/health') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok'); return; }
  if (path === '/stats') {
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    res.end(JSON.stringify(statsSnapshot()));
    return;
  }
  if (path === '/' || path === '') path = '/index.html';
  const rel = normalize(path).replace(/^([/\\])+/, '');
  if (rel.includes('..') || !(rel === 'index.html' || STATIC_ROOTS.some((r) => rel.startsWith(r)))) {
    res.writeHead(404); res.end('not found'); return;
  }
  const file = join(config.root, rel);
  try {
    const st = await stat(file);
    if (!st.isFile()) throw new Error('not file');
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': config.dev ? 'no-cache' : 'public, max-age=300' });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('not found');
  }
});

function originAllowed(origin) {
  if (config.allowedOrigins.includes('*')) return true;
  return !origin || config.allowedOrigins.includes(origin);
}

attachWebSocketServer(server, {
  path: '/ws',
  allowOrigin: originAllowed,
  onConnection(conn) {
    let player = null;
    let msgBudget = 0, budgetAt = Date.now();
    conn.on('message', (data, isBinary) => {
      // simple flood guard: 120 messages/sec
      const t = Date.now();
      if (t - budgetAt > 1000) { budgetAt = t; msgBudget = 0; }
      if (++msgBudget > 120) return;
      if (isBinary) {
        if (!player || data.length < 11) return;
        const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
        if (dv.getUint8(0) === MSG_INPUT) players.queueInput(player, decodeInput(dv));
        return;
      }
      let msg;
      try { msg = JSON.parse(data); } catch { return; }
      if (!msg || typeof msg !== 'object') return;
      if (msg.t === 'hello') {
        if (player) return;
        const online = [...world.players.values()].filter((p) => p.conn).length;
        if (online >= config.maxPlayers) { conn.sendJSON({ t: 'full', max: config.maxPlayers }); conn.close(4001, 'full'); return; }
        let profile = null, token = msg.token;
        const v = verifyToken(token);
        if (v) profile = store.get(v.pid);
        if (!profile) { const pid = v ? v.pid : newPlayerId(); profile = store.get(pid) || store.create(pid); token = issueToken(pid); }
        conn.sendJSON({ t: 'welcome', token, pid: profile.pid, name: profile.name, seed: config.seed, tick: world.tick, dev: config.dev, server: 'City Life Auto 0.8' });
        player = players.join(world, conn, profile);
        return;
      }
      if (!player) return;
      if (msg.t === 'ping') { conn.sendJSON({ t: 'pong', ts: msg.ts }); return; }
      if (msg.t === 'menu') { economy.handleMenu(world, player, Number(msg.poi), String(msg.opt || '')); return; }
      if (msg.t === 'weapon' && player.ped && !player.ped.dead) { combat.selectWeapon(world, player.ped, String(msg.id)); return; }
      if (msg.t === 'dev' && config.dev) { dev.command(world, player, String(msg.c || ''), msg); return; }
    });
    conn.on('close', () => { if (player && player.conn === conn) players.leave(world, player); });
  },
});

function statsSnapshot() {
  let npc = 0, veh = 0;
  for (const e of world.entities.values()) { if (e.npc) npc++; if (e.def) veh++; }
  return {
    uptimeS: Math.round((Date.now() - startedAt) / 1000),
    online: [...world.players.values()].filter((p) => p.conn).length,
    ghosts: [...world.players.values()].filter((p) => !p.conn).length,
    profiles: store.count,
    entities: world.entities.size, npcPeds: npc, vehicles: veh,
    tickMsAvg: +world.stats.tickMs.toFixed(2), tickMsMax: +world.stats.tickMax.toFixed(2),
    kbOutPerSec: +((world.stats.bytesOut / Math.max(1, (Date.now() - startedAt) / 1000)) / 1024).toFixed(1),
    weather: world.weather, clock: Math.round(world.clock.minutes), droppedSnapshots: world.stats.dropped || 0,
    systemMs: world.profile(),
  };
}

// fixed-step loop with catch-up (max 3 steps per wake)
let next = performance.now();
function loop() {
  const now = performance.now();
  let steps = 0;
  while (now >= next && steps < 3) {
    try { world.step(); } catch (e) { console.error('[tick] error', e); }
    next += TICK_MS;
    steps++;
  }
  if (now - next > TICK_MS * 10) next = now; // way behind: skip ahead
  setTimeout(loop, Math.max(0, next - performance.now()));
}

setInterval(() => store.flush(), config.saveIntervalMs).unref();
setInterval(() => {
  const s = statsSnapshot();
  console.log(`[stats] online=${s.online} ghosts=${s.ghosts} ents=${s.entities} npc=${s.npcPeds} veh=${s.vehicles} tick=${s.tickMsAvg}ms (max ${s.tickMsMax}) out=${s.kbOutPerSec}KB/s`);
  world.stats.tickMax = 0;
}, 30000).unref();

function shutdown(sig) {
  console.log(`[server] ${sig} received - saving and shutting down`);
  for (const p of world.players.values()) {
    if (p.ped && !p.ped.dead) p.profile.pos = { x: p.ped.x, y: p.ped.y };
    if (p.conn) { try { p.conn.sendJSON({ t: 'kicked', reason: 'Server restarting - your progress is saved. Reconnecting...' }); } catch { /* closed */ } }
  }
  try { store.flushSync(); } catch (e) { console.error('[server] final save failed', e); }
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

server.listen(config.port, config.host, () => {
  console.log(`[server] City Life Auto listening on http://${config.host}:${config.port}  (dev=${config.dev}, seed=${config.seed})`);
  loop();
});

export { world, server };
