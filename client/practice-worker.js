// Offline practice: runs the full authoritative city simulation inside a Web Worker on the
// player's own device. Nothing is saved and nothing touches the online account.
//
// The city it runs is today's world - shared/map.js generateCity(seed) with no options, the city as it was before
// World v3 - not the live World v3 (2026-10-18). The simulation needs the whole world in memory, and World v3's whole
// world is more than a phone can hold or build: server/world3.js builds it in about 47 s here and peaks at 1.6 GB, the
// World running on it 1.35 GB, where today's city takes about 5 s and 0.3 GB. (The page itself never holds World v3
// whole either: only the window round the player, downloaded from the game server - client/worldgen.js - which practice,
// offline, hasn't got.)
// The page plays the city this worker built: a copy of it goes to the page first ({ city }: client/main.js
// WorkerSocket, practiceWorld), before the welcome, so the page doesn't build it a second time, nor take the online
// city it may have - World v3's window, which is another world with the same seed.
import { World } from '../server/world.js';
import { createSession } from '../server/session.js';
import { generateCity, cityData } from '../shared/map.js';
import { TICK_MS } from '../shared/constants.js';

const SEED = 1337;
const t0 = performance.now();
const map = generateCity(SEED);
// (copied now, as generated: the World changes the map once it runs - smashed props, open gates - as the server's cut
// is taken before it runs, server/worldcdn.js. The copy is about 37 MB, made in a fraction of a second)
postMessage({ city: cityData(map), ms: Math.round(performance.now() - t0) });
const world = new World(map, { dev: true, npcBudget: 400 });

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
