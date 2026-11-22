// Security audit (accounts / HTTP side), report-only: does one request with a bad percent-escape stop the server?
// server/index.js:97 runs decodeURIComponent(url.pathname) in the async request handler with no try/catch, and nothing
// registers process.on('unhandledRejection'): a rejected handler promise ends the process (Node >= 15).
// Caddy (Go) passes "%FF" on - it is a valid %XX escape, only not valid UTF-8 - so this reaches the live server.
// Runs a private server on 127.0.0.1 (today's city, no art threads, a temp data dir), sends GET /health, then GET /%FF,
// then GET /health again, and prints what happened. Never asserts, never fixes.
//   node --max-old-space-size=3072 tools/audit/sec-acct-badpath.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 18000 + Math.floor(Math.random() * 1000);
const dataDir = mkdtempSync(join(tmpdir(), 'cla-sec-badpath-'));
const env = { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', CLA_DATA_DIR: dataDir, CLA_ART_THREADS: '0', CLA_SECRET: 'audit-secret', CLA_WORLD: 'today' };
delete env.NODE_ENV;
const srv = spawn(process.execPath, ['--max-old-space-size=3072', join(ROOT, 'server', 'index.js')], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
let out = '', exited = null;
srv.stdout.on('data', (d) => { out += d; });
srv.stderr.on('data', (d) => { out += d; });
srv.on('exit', (code, sig) => { exited = { code, sig }; });

const get = (path) => new Promise((ok) => {
  const r = http.request({ host: '127.0.0.1', port: PORT, path, method: 'GET', timeout: 5000 }, (res) => { let b = ''; res.on('data', (d) => { b += d; }); res.on('end', () => ok({ status: res.statusCode, body: b.slice(0, 60) })); });
  r.on('error', (e) => ok({ error: e.code || e.message }));
  r.on('timeout', () => { r.destroy(); ok({ error: 'timeout' }); });
  r.end();
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const t0 = Date.now();
while (!/listening on/.test(out) && !exited && Date.now() - t0 < 240e3) await sleep(500);
if (!/listening on/.test(out)) { console.log('server did not come up:', exited, out.slice(-800)); srv.kill(); process.exit(0); }
console.log(`server up on 127.0.0.1:${PORT} after ${((Date.now() - t0) / 1000).toFixed(1)} s`);
console.log('GET /health          ->', await get('/health'));
console.log('GET /%FF             ->', await get('/%FF'));
await sleep(1500);
console.log('server process after /%FF:', exited ? `EXITED (code ${exited.code}, signal ${exited.sig})` : 'still running');
console.log('GET /health again    ->', await get('/health'));
const tail = out.split('\n').filter((l) => /URIError|malformed|Unhandled|at .*index\.js/.test(l)).slice(0, 6);
if (tail.length) console.log('server output:\n  ' + tail.join('\n  '));
if (!exited) srv.kill();
