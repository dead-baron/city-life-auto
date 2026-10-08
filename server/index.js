// City Life Auto authoritative server entry point.
// Serves the static client, accepts WebSocket players, runs the 20 Hz world tick and
// persists profiles. Zero third-party dependencies: `node server/index.js`.
import { createServer } from 'node:http';
import { reportsText } from './perfreports.js';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync, existsSync, unlinkSync } from 'node:fs';
import { join, normalize, extname } from 'node:path';
import { config } from './config.js';
import { attachWebSocketServer, wsStats } from './ws.js';
import { createLimits, clientIp } from './limits.js';
import { issueToken, verifyToken, newPlayerId } from './auth.js';
import { store, useStore } from './store.js';
import { FileStore } from './file-store.js';
import { createSession } from './session.js';
import { World } from './world.js';
import * as players from './systems/players.js';
import { readBuild, watchBuild } from './build.js';
import { createArtCdn } from './artcdn.js';
import { generateCity } from '../shared/map.js';
import { ferryRoutes } from './systems/ferries.js';
import { TICK_MS } from '../shared/constants.js';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8',
};
// server/ is served so the offline practice worker can run the simulation in the browser
const STATIC_ROOTS = ['client/', 'shared/', 'assets/', 'server/'];

useStore(new FileStore());
const map = generateCity(config.seed);
// the build we run (version.json): players coming back from an older one start fresh (CLA_FRESH_ON_UPDATE)
const BUILD_FILE = join(config.root, 'version.json');
const bootBuild = readBuild(BUILD_FILE);
const world = new World(map, { dev: config.dev, npcBudget: config.npcBudget, build: bootBuild && bootBuild.v, buildAt: bootBuild && bootBuild.at, freshOnUpdate: config.freshOnUpdate });
console.log(`[server] build ${bootBuild ? bootBuild.v : '(no version.json)'} · fresh start on update: ${config.freshOnUpdate}`);
// the ferries' routes, worked out now rather than on the first tick (a few hundred ms: server/systems/ferries.js)
{ const t0 = Date.now(), fr = ferryRoutes(world); console.log(`[server] ferries: ${fr.map((r) => `${r.name} (${r.mainland} - ${r.island}, ${Math.round(r.len / 32)} m)`).join(', ') || 'none'} in ${Date.now() - t0} ms`); }
// the art from the server: the world's chunks baked here and downloaded by the pages (server/artcdn.js)
let artCdn = null;
try { artCdn = createArtCdn({ map, root: config.root, dataDir: config.dataDir, seed: config.seed, onBytes: (n) => { if (limits) limits.addBytes(n); } }); } catch (e) { console.error('[art] not serving chunks:', e); }
// Client-only updates arrive without a restart (deploy/auto-update.sh pulls them): look at version.json
// every 20 s and tell every page about a new build, so they reload into it (client/update.js).
watchBuild(BUILD_FILE, 20000, (b) => {
  console.log(`[server] new build on disk: ${b.v} (was ${world.build || 'none'}) - telling players to update`);
  players.announceBuild(world, b);
  if (artCdn) artCdn.rebuild();   // (a new build of the art: its chunks baked afresh)
}, bootBuild && bootBuild.v);
const startedAt = Date.now();
// always on for metering; each limit only acts when configured (see config.js)
const limits = createLimits({ dataDir: config.dataDir, monthlyGB: config.monthlyGB, maxPerIp: config.maxPerIp, connPerMinute: config.connPerMinute, httpPerMinute: config.httpPerMinute });

const QUOTA_MSG = 'The city is closed for the rest of the month (monthly data limit reached). It reopens on the 1st!';

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  let path = decodeURIComponent(url.pathname);
  // (baked chunks: many small requests a second while moving - counted in the monthly data, not the per-address rate)
  if (artCdn && path.startsWith('/art/')) { if (limits && limits.state() === 'over') { res.writeHead(503); res.end(); return; } if (artCdn.handle(path + (url.search || ''), req, res)) return; }
  if (limits && path !== '/health') {
    const why = limits.checkHttp(clientIp(req, config.trustProxy));
    if (why) { res.writeHead(why === 'quota' ? 503 : 429, { 'content-type': 'text/plain', 'retry-after': '60' }); res.end(why === 'quota' ? QUOTA_MSG : 'Too many requests'); return; }
  }
  if (path === '/health') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok'); return; }
  if (path === '/perf') {   // how players' devices loaded and ran the game (server/perfreports.js)
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'no-store' });
    res.end(reportsText(world));
    return;
  }
  if (path === '/stats') {
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    res.end(JSON.stringify(statsSnapshot()));
    return;
  }
  if (path === '/' || path === '') path = '/index.html';
  const rel = normalize(path).replace(/^([/\\])+/, '');
  // (version.json too: a page played straight off this server checks it for updates - client/boot.js, update.js)
  if (rel.includes('..') || rel.startsWith('server/config') || rel.startsWith('server/auth') || !(rel === 'index.html' || rel === 'version.json' || STATIC_ROOTS.some((r) => rel.startsWith(r)))) {
    res.writeHead(404); res.end('not found'); return;
  }
  const file = join(config.root, rel);
  try {
    const st = await stat(file);
    if (!st.isFile()) throw new Error('not file');
    const body = await readFile(file);
    if (limits) limits.addBytes(body.length + 300); // + headers
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': config.dev || rel === 'version.json' ? 'no-cache' : 'public, max-age=300' });
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
  allowUpgrade(req) {
    if (!limits) return null;
    const why = limits.checkUpgrade(clientIp(req, config.trustProxy));
    return why === 'quota' ? [503, 'Monthly Data Limit Reached'] : why ? [429, 'Too Many Connections'] : null;
  },
  onConnection(conn, req) {
    const ip = clientIp(req, config.trustProxy);
    if (limits) { limits.track(ip); conn.on('close', () => limits.untrack(ip)); }
    const session = createSession(world, conn, {
      seed: config.seed, dev: config.dev, maxPlayers: config.maxPlayers, label: 'City Life Auto 0.8',
      closedReason: () => (limits && limits.state() !== 'ok' ? QUOTA_MSG : null),
      login(token) {
        const v = verifyToken(token);
        let profile = v ? store.get(v.pid) : null;
        if (profile) return { profile, token };
        const pid = v ? v.pid : newPlayerId();
        profile = store.get(pid) || store.create(pid);
        return { profile, token: issueToken(pid) };
      },
    });
    conn.on('message', (data, isBinary) => session.onMessage(data, isBinary));
    conn.on('close', () => session.onClose());
  },
});

function statsSnapshot() {
  let npc = 0, veh = 0;
  for (const e of world.entities.values()) { if (e.npc) npc++; if (e.def) veh++; }
  return {
    build: world.build,
    uptimeS: Math.round((Date.now() - startedAt) / 1000),
    online: [...world.players.values()].filter((p) => p.conn).length,
    ghosts: [...world.players.values()].filter((p) => !p.conn).length,
    profiles: store.count,
    entities: world.entities.size, npcPeds: npc, vehicles: veh,
    tickMsAvg: +world.stats.tickMs.toFixed(2), tickMsMax: +world.stats.tickMax.toFixed(2),
    kbOutPerSec: +((world.stats.bytesOut / Math.max(1, (Date.now() - startedAt) / 1000)) / 1024).toFixed(1),
    weather: world.weather, clock: Math.round(world.clock.minutes), droppedSnapshots: world.stats.dropped || 0,
    systemMs: world.profile(),
    traffic: limits ? limits.summary() : null,
    art: artCdn ? artCdn.summary() : null,
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
// the art from the server bakes round the players online first (server/artcdn.js focus)
if (artCdn) setInterval(() => { const pts = []; for (const p of world.players.values()) if (p.conn && p.ped) pts.push({ x: p.ped.x, y: p.ped.y }); artCdn.focus(pts); }, 4000).unref();

// Update warning: deploy/auto-update.sh writes the restart time (epoch ms) to <data>/update-at
// a minute before it restarts the server with a new version; everyone online gets a countdown.
const UPDATE_FILE = join(config.dataDir, 'update-at');
try { if (existsSync(UPDATE_FILE)) unlinkSync(UPDATE_FILE); } catch { /* not ours to remove */ } // a fresh start: any old notice is done
const WARN_AT = [60, 30, 10, 5, 3, 2, 1];
let updateAt = 0, warned = new Set();
setInterval(() => {
  let at = 0;
  try { at = existsSync(UPDATE_FILE) ? Number(readFileSync(UPDATE_FILE, 'utf8').trim()) || 0 : 0; } catch { at = 0; }
  if (at !== updateAt) { updateAt = at; warned = new Set(); }
  if (!updateAt) return;
  const left = Math.ceil((updateAt - Date.now()) / 1000);
  for (const s of WARN_AT) {
    if (left > s || warned.has(s) || left < s - 1) continue;
    warned.add(s);
    const text = s >= 10 ? `Server updating in ${s} seconds - your progress is saved, you'll reconnect automatically.` : `Server updating in ${s}...`;
    for (const p of world.players.values()) if (p.conn) world.notify(p, text, 'warn');
  }
}, 500).unref();
// data meter: fold in what the WebSockets sent; at the monthly cap, close the city
let lastWs = 0;
if (limits) {
  setInterval(() => {
    limits.addBytes(wsStats.bytesOut - lastWs); lastWs = wsStats.bytesOut;
    if (limits.state() === 'over') {
      for (const p of world.players.values()) if (p.conn) { try { p.conn.sendJSON({ t: 'kicked', reason: QUOTA_MSG }); p.conn.close(4003, 'quota'); } catch { /* gone */ } }
    }
  }, 1000).unref();
  setInterval(() => { limits.save(); limits.sweep(); }, 30000).unref();
}
setInterval(() => {
  const s = statsSnapshot();
  console.log(`[stats] online=${s.online} ghosts=${s.ghosts} ents=${s.entities} npc=${s.npcPeds} veh=${s.vehicles} tick=${s.tickMsAvg}ms (max ${s.tickMsMax}) out=${s.kbOutPerSec}KB/s`);
  world.stats.tickMax = 0;
}, 30000).unref();

function shutdown(sig) {
  console.log(`[server] ${sig} received - saving and shutting down`);
  if (artCdn) artCdn.stop();
  for (const p of world.players.values()) {
    if (p.ped && !p.ped.dead) players.savePos(p, p.ped);
    if (p.conn) { try { p.conn.sendJSON({ t: 'kicked', reason: 'Server restarting - your progress is saved. Reconnecting...' }); } catch { /* closed */ } }
  }
  try { store.flushSync(); } catch (e) { console.error('[server] final save failed', e); }
  if (limits) { limits.addBytes(wsStats.bytesOut - lastWs); limits.save(); }
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

server.listen(config.port, config.host, () => {
  console.log(`[server] City Life Auto listening on http://${config.host}:${config.port}  (dev=${config.dev}, seed=${config.seed})`);
  loop();
});

export { world, server };
