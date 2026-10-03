// Offline practice: runs the full authoritative city simulation inside a Web Worker on the
// player's own device. Nothing is saved and nothing touches the online account.
import { World } from '../server/world.js';
import { createSession } from '../server/session.js';
import { generateCity } from '../shared/map.js';
import { TICK_MS } from '../shared/constants.js';

const SEED = 1337;
const world = new World(generateCity(SEED), { dev: true, npcBudget: 400 });

const conn = {
  open: true,
  buffered: 0,
  sendJSON(o) { postMessage(JSON.stringify(o)); },
  sendText(s) { postMessage(s); },
  sendBinary(u8) { const b = u8.slice().buffer; postMessage(b, [b]); },
  close() { this.open = false; },
};

const session = createSession(world, conn, {
  seed: SEED, dev: true, practice: true, maxPlayers: 1, label: 'Offline practice',
  login() {
    let pid = '';
    for (let i = 0; i < 24; i++) pid += Math.floor(Math.random() * 16).toString(16);
    const profile = world.practiceStore ? world.practiceStore.create(pid) : null;
    return { profile, token: null };
  },
});

// practice profiles live only in this worker's memory
import('../server/store.js').then(({ store }) => {
  world.practiceStore = {
    create(pid) {
      const p = store.create(pid);
      p.name = 'Practice';
      p.cash = 2000;
      p.bank = 5000;
      return p;
    },
  };
  onmessage = (e) => session.onMessage(e.data, typeof e.data !== 'string');
  postMessage(JSON.stringify({ t: 'ready' }));
});

let next = performance.now();
function loop() {
  const now = performance.now();
  let steps = 0;
  while (now >= next && steps < 3) {
    try { world.step(); } catch (e) { console.error('[practice tick]', e); }
    next += TICK_MS;
    steps++;
  }
  if (now - next > TICK_MS * 10) next = now;
  setTimeout(loop, Math.max(0, next - performance.now()));
}
loop();
