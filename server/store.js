// Environment-neutral profile store facade. The Node server plugs in the persistent
// FileStore (server/file-store.js); offline practice and tests use this in-memory store.
import { WORLD_VERSION } from '../shared/constants.js';

// The progress epoch (the owner, 11-04: "every player is reset totally, so everyone goes through the FTUE" - when the
// first-time experience ships). A profile saved under an older epoch is reset to a new character the first time it's
// loaded (resetOldEpochs: FileStore's load, before the world claims anyone's homes or businesses; players.join checks
// again) - the same reset as CLA_FRESH_ON_UPDATE=all (players.js wipeProgress): progress gone, the name, the look, the
// clothes owned and the account (acct: role, sign-ins, passkeys, ban, mute, contacts) kept. A future launch reset is
// this number bumped. 1: everything before the FTUE (profiles with no epoch); 2: the FTUE ships (2026-11-04).
export const PROGRESS_EPOCH = 2;

export function defaultProfile(pid) {
  return {
    pid,
    epoch: PROGRESS_EPOCH,   // the progress epoch this profile's progress belongs to (resetOldEpochs)
    wv: WORLD_VERSION, // the world layout this profile's homes and position belong to (homes.checkWorld)
    name: 'Guest' + String(Math.floor(1000 + Math.random() * 9000)),
    created: Date.now(),
    lastSeen: Date.now(),
    cash: 200,
    bank: 500,
    hot: 0,          // hot money: a robbery's takings in the bag, apart from the cash (server/systems/hotmoney.js)...
    hotAt: null,     // ...and where it was stolen ({ x, y })
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
    loans: {},       // home id -> a mortgage on it { owed, pay, day, missed } (server/systems/mortgage.js; absent on older profiles)
    spawnHome: null,
    lastSpawn: null, // the death screen's wake-up spot you last woke at ('h:<i>' | 'home:<id>'): the next one's default
    pos: null,       // (and inHome: the home you logged off inside, back in it next time - players.savePos; absent when you weren't)
    stats: { kills: 0, deaths: 0, arrests: 0, deliveries: 0, fish: 0 },
    safety: false,   // Safety mode: an act that'd be a crime asks first (server/systems/safety.js) - off unless turned on in Settings (the owner, 11-06)
    safetyOff: 1,    // (the one-time switch-off of Safety mode on profiles from before that has run: migrateSafety)
    ftue: { st: 'new', tips: 1, m: {} },   // the first-time experience (server/systems/ftue.js): a new character's arrival, question and first goal
  };
}

// A profile back to a brand-new character: what's kept (the name, the look and the clothes owned, the account) and a new
// profile for the rest - its FTUE not started (ftue { st: 'new' }: the first car earned by its path - server/systems/
// firstcar.js; no starter car), stamped with this epoch. (players.js wipeProgress: also lets go of its homes in a running world)
export function resetProfile(prof) {
  const keep = { pid: prof.pid, name: prof.name, created: prof.created, look: prof.look, lookPicked: prof.lookPicked, lookIntro: prof.lookIntro, looks: prof.looks, wardrobe: prof.wardrobe };   // (and the clothes they own: looks.js)
  if (prof.acct) { keep.acct = prof.acct; keep.nameAt = prof.nameAt; }   // (the account outlives the progress, as with Start fresh: wipeAccount)
  for (const k of Object.keys(prof)) if (keep[k] === undefined) delete prof[k];
  for (const k of Object.keys(keep)) if (keep[k] === undefined) delete keep[k];
  Object.assign(prof, defaultProfile(keep.pid), keep);
  return prof;
}
// Safety mode off by default (the owner, 11-06: "let's not make the double tap to steal a car ... not have it on by
// default"): profiles made before then had it on as a default, not a choice - switched off once (safetyOff marks it run;
// turned back on in Settings after, it stays on). Run as the store loads (resetOldEpochs) and on joining (players.js).
export function migrateSafety(prof) {
  if (!prof || prof.safetyOff) return false;
  prof.safety = false; prof.safetyOff = 1;
  return true;
}
export const oldEpoch = (prof) => !!prof && (Number(prof.epoch) || 1) < PROGRESS_EPOCH;
// Every profile under an older epoch reset (resetProfile), and what the world keeps for players outside the profiles: the
// crews (store.kept.crews) lose the reset members - a crew left with one is gone - and the fish records board
// (store.kept.fishRecords: the biggest catches, by name) starts again. Idempotent: a profile on this epoch is left alone,
// so a second load resets nothing; a crash before the save just does the same again from the same file. -> how many
export function resetOldEpochs(st) {
  const reset = new Set();
  let safe = 0;
  for (const prof of st.all()) { if (oldEpoch(prof)) { resetProfile(prof); reset.add(prof.pid); } if (migrateSafety(prof)) safe++; }
  if (safe) st.touch();
  if (!reset.size) return 0;
  const kept = st.kept || {};
  if (kept.crews) for (const [id, c] of Object.entries(kept.crews)) {
    c.members = (c.members || []).filter((pid) => !reset.has(pid));
    if (c.names) for (const pid of Object.keys(c.names)) if (reset.has(pid)) delete c.names[pid];
    if (c.members.length < 2) delete kept.crews[id];
    else if (reset.has(c.lead)) c.lead = c.members[0];
  }
  if (kept.fishRecords && kept.epoch !== PROGRESS_EPOCH) kept.fishRecords = {};
  kept.epoch = PROGRESS_EPOCH;
  st.touch();
  return reset.size;
}

export class MemoryStore {
  constructor() { this.profiles = new Map(); this.kept = {}; this.dirty = false; }
  get(pid) { return this.profiles.get(pid) || null; }
  create(pid) { const p = defaultProfile(pid); this.profiles.set(pid, p); return p; }
  remove(pid) { this.dirty = true; return this.profiles.delete(pid); }   // (Start fresh: players.js wipeAccount)
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
  remove: (pid) => impl.remove(pid),
  touch: () => impl.touch(),
  flush: () => impl.flush(),
  flushSync: () => impl.flushSync(),
  all: () => impl.all(),
  get count() { return impl.count; },
  get kept() { return (impl.kept ||= {}); },   // the world's own state kept with the profiles across a restart (the farms' fields)
};
