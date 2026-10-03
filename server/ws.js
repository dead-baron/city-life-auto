// Minimal RFC 6455 WebSocket server (no dependencies). Supports text/binary frames,
// fragmentation, ping/pong keepalive, close handshake and send backpressure checks.

import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_PAYLOAD = 64 * 1024;

export class WSConnection extends EventEmitter {
  constructor(socket, req) {
    super();
    this.socket = socket;
    this.req = req;
    this.open = true;
    this.buffer = Buffer.alloc(0);
    this.fragments = [];
    this.fragOpcode = 0;
    this.lastPong = Date.now();
    this.remoteAddress = req.headers['x-forwarded-for']?.split(',')[0].trim() || socket.remoteAddress;
    socket.setNoDelay(true);
    socket.on('data', (d) => this._onData(d));
    socket.on('close', () => this._closed());
    socket.on('error', () => this._closed());
  }

  get buffered() { return this.socket.writableLength; }

  _onData(chunk) {
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
    while (this.open) {
      const b = this.buffer;
      if (b.length < 2) return;
      const fin = (b[0] & 0x80) !== 0;
      const opcode = b[0] & 0x0f;
      const masked = (b[1] & 0x80) !== 0;
      let len = b[1] & 0x7f;
      let off = 2;
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
      else if (len === 127) {
        if (b.length < 10) return;
        const hi = b.readUInt32BE(2), lo = b.readUInt32BE(6);
        if (hi !== 0) return this.close(1009, 'too big');
        len = lo; off = 10;
      }
      if (len > MAX_PAYLOAD) return this.close(1009, 'too big');
      if (!masked) return this.close(1002, 'unmasked');
      if (b.length < off + 4 + len) return;
      const mask = b.subarray(off, off + 4);
      off += 4;
      const payload = Buffer.allocUnsafe(len);
      for (let i = 0; i < len; i++) payload[i] = b[off + i] ^ mask[i & 3];
      this.buffer = b.subarray(off + len);
      this._onFrame(fin, opcode, payload);
    }
  }

  _onFrame(fin, opcode, payload) {
    if (opcode === 0x8) { this.close(1000); return; }
    if (opcode === 0x9) { this._send(0xA, payload); return; }
    if (opcode === 0xA) { this.lastPong = Date.now(); return; }
    if (opcode === 0x0) {
      this.fragments.push(payload);
      if (fin) {
        const full = Buffer.concat(this.fragments);
        this.fragments = [];
        this._deliver(this.fragOpcode, full);
      }
      return;
    }
    if (!fin) { this.fragOpcode = opcode; this.fragments = [payload]; return; }
    this._deliver(opcode, payload);
  }

  _deliver(opcode, payload) {
    this.lastPong = Date.now();
    if (opcode === 0x1) this.emit('message', payload.toString('utf8'), false);
    else if (opcode === 0x2) this.emit('message', payload, true);
  }

  _send(opcode, data) {
    if (!this.open) return false;
    const len = data.length;
    let header;
    if (len < 126) { header = Buffer.allocUnsafe(2); header[1] = len; }
    else if (len < 65536) { header = Buffer.allocUnsafe(4); header[1] = 126; header.writeUInt16BE(len, 2); }
    else { header = Buffer.allocUnsafe(10); header[1] = 127; header.writeUInt32BE(0, 2); header.writeUInt32BE(len, 6); }
    header[0] = 0x80 | opcode;
    try {
      this.socket.cork();
      this.socket.write(header);
      this.socket.write(data);
      this.socket.uncork();
    } catch { this._closed(); return false; }
    return true;
  }

  sendText(str) { return this._send(0x1, Buffer.from(str, 'utf8')); }
  sendBinary(u8) { return this._send(0x2, Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength)); }
  sendJSON(obj) { return this.sendText(JSON.stringify(obj)); }
  ping() { this._send(0x9, Buffer.alloc(0)); }

  close(code = 1000, reason = '') {
    if (!this.open) return;
    const r = Buffer.from(reason);
    const p = Buffer.alloc(2 + r.length);
    p.writeUInt16BE(code, 0);
    r.copy(p, 2);
    this._send(0x8, p);
    this.open = false;
    setTimeout(() => this.socket.destroy(), 100);
    this.emit('close');
  }

  _closed() {
    if (!this.open && this._emittedClose) return;
    const wasOpen = this.open;
    this.open = false;
    this._emittedClose = true;
    try { this.socket.destroy(); } catch { /* already closed */ }
    if (wasOpen) this.emit('close');
  }
}

export function attachWebSocketServer(httpServer, { path = '/ws', onConnection, allowOrigin = () => true }) {
  const clients = new Set();
  httpServer.on('upgrade', (req, socket) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname !== path || (req.headers.upgrade || '').toLowerCase() !== 'websocket') {
      socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
      return;
    }
    const origin = req.headers.origin || '';
    if (!allowOrigin(origin)) {
      socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
      return;
    }
    const key = req.headers['sec-websocket-key'];
    if (!key) { socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'); return; }
    const accept = createHash('sha1').update(key + GUID).digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
    const conn = new WSConnection(socket, req);
    clients.add(conn);
    conn.on('close', () => clients.delete(conn));
    onConnection(conn, req);
  });
  // keepalive: ping every 15s, drop if silent for 45s
  const timer = setInterval(() => {
    const now = Date.now();
    for (const c of clients) {
      if (now - c.lastPong > 45000) c._closed();
      else c.ping();
    }
  }, 15000);
  timer.unref();
  return { clients };
}
