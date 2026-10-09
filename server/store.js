// Environment-neutral profile store facade. The Node server plugs in the persistent
// FileStore (server/file-store.js); offline practice and tests use this in-memory store.
import { WORLD_VERSION } from '../shared/constants.js';

export function defaultProfile(pid) {
  return {
    pid,
    wv: WORLD_VERSION, // the world layout this profile's homes and position belong to (homes.checkWorld)
    name: 'Guest' + String(Math.floor(1000 + Math.random() * 9000)),
    created: Date.now(),
    lastSeen: Date.now(),
    cash: 200,
    bank: 500,
    criminalExp: 0,
    samaritan: 0,
    felonies: 0,
    peakWanted: 0,
    peakWantedAt: 0,
    firedUntil: 0,
    weapons: { fists: 0 },
    inventory: { bandage: 1 },
    look: null,      // the look's code (shared/look.js; server/systems/looks.js)
    looks: [],       // saved looks [{ n, c }]
    vehicles: [],
    homes: [],
    deeds: {},       // home id -> what was paid for it (bought back at that when the world changes)
    spawnHome: null,
    lastSpawn: null, // the death screen's wake-up spot you last woke at ('h:<i>' | 'home:<id>'): the next one's default
    pos: null,
    stats: { kills: 0, deaths: 0, arrests: 0, deliveries: 0, fish: 0 },
  };
}

export class MemoryStore {
  constructor() { this.profiles = new Map(); this.dirty = false; }
  get(pid) { return this.profiles.get(pid) || null; }
  create(pid) { const p = defaultProfile(pid); this.profiles.set(pid, p); return p; }
  touch() { this.dirty = true; }
  async flush() { this.dirty = false; }
  flushSync() { this.dirty = false; }
  all() { return this.profiles.values(); }
  get count() { return this.profiles.size; }
}

let impl = new MemoryStore();
export function useStore(s) { impl = s; }
export const store = {
  get: (pid) => impl.get(pid),
  create: (pid) => impl.create(pid),
  touch: () => impl.touch(),
  flush: () => impl.flush(),
  flushSync: () => impl.flushSync(),
  all: () => impl.all(),
  get count() { return impl.count; },
};
