// Security audit (report only - changes nothing): server/ws.js answers every ping frame with a pong carrying the same
// payload, of any size up to MAX_PAYLOAD (64 KB; RFC 6455 caps control frames at 125 bytes), and pings never reach the
// session's flood guard (session.js counts messages, not control frames). So a client makes the server send back as
// many bytes as it uploads - metered against the month's data cap (limits.js) - with no rate limit and no hello.
//   node tools/audit/sec-ws-ping.mjs          (a local server on 127.0.0.1 only)
import http from 'node:http';
import net from 'node:net';
import { randomBytes } from 'node:crypto';
import { attachWebSocketServer, wsStats } from '../../server/ws.js';

const server = http.createServer((q, s) => s.end());
attachWebSocketServer(server, { path: '/ws', onConnection: (c) => { c.on('message', () => { msgs++; }); } });
let msgs = 0;
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const sock = net.connect(port, '127.0.0.1');
await new Promise((r) => sock.once('connect', r));
sock.write(`GET /ws HTTP/1.1\r\nHost: 127.0.0.1\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${randomBytes(16).toString('base64')}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
let got = 0, upgraded = false;
sock.on('data', (d) => { if (!upgraded) { upgraded = true; const i = d.indexOf('\r\n\r\n'); got += d.length - i - 4; } else got += d.length; });
await new Promise((r) => setTimeout(r, 100));

// a masked ping frame with a 60,000-byte payload (opcode 0x9, len 126 -> 16-bit length)
function ping(n) {
  const h = Buffer.alloc(8); h[0] = 0x89; h[1] = 0x80 | 126; h.writeUInt16BE(n, 2);
  const mask = randomBytes(4); mask.copy(h, 4);
  const p = randomBytes(n);
  return Buffer.concat([h, p]);
}
const N = 200, SIZE = 60000;
const before = wsStats.bytesOut;
for (let i = 0; i < N; i++) sock.write(ping(SIZE));
await new Promise((r) => setTimeout(r, 1500));
const sentUp = N * (SIZE + 8);
console.log(`client uploaded ${(sentUp / 1e6).toFixed(1)} MB of ping frames (${N} x ${SIZE} B, RFC limit 125 B)`);
console.log(`server wrote back ${((wsStats.bytesOut - before) / 1e6).toFixed(1)} MB (wsStats.bytesOut), client received ${(got / 1e6).toFixed(1)} MB`);
console.log(`messages that reached the session (flood guard): ${msgs}`);
console.log(wsStats.bytesOut - before >= sentUp * 0.9 ? 'RESULT: every ping echoed in full - an unthrottled 1:1 reflector against the data cap' : 'RESULT: pings not echoed in full');
sock.destroy(); server.close(); process.exit(0);
