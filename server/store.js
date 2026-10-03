// Persistent player profiles. JSON file with atomic writes (write temp + rename),
// flushed every few seconds when anything changed and on shutdown.
import { existsSync, readFileSync, writeFileSync, renameSync, copyFileSync } from 'node:fs';
import { writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from './config.js';

const FILE = join(config.dataDir, 'profiles.json');

export function defaultProfile(pid) {
  return {
    pid,
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
    outfit: null,
    vehicles: [],
    pos: null,
    stats: { kills: 0, deaths: 0, arrests: 0, deliveries: 0, fish: 0 },
  };
}

class ProfileStore {
  constructor() {
    this.profiles = new Map();
    this.dirty = false;
    this.writing = false;
    if (existsSync(FILE)) {
      try {
        const data = JSON.parse(readFileSync(FILE, 'utf8'));
        for (const p of data.profiles || []) this.profiles.set(p.pid, p);
      } catch (e) {
        console.error('[store] profiles.json unreadable, backing up and starting fresh:', e.message);
        copyFileSync(FILE, FILE + '.corrupt-' + Date.now());
      }
    }
  }
  get(pid) { return this.profiles.get(pid) || null; }
  create(pid) {
    const p = defaultProfile(pid);
    this.profiles.set(pid, p);
    this.dirty = true;
    return p;
  }
  touch() { this.dirty = true; }
  serialize() { return JSON.stringify({ version: 1, saved: Date.now(), profiles: [...this.profiles.values()] }); }
  async flush() {
    if (!this.dirty || this.writing) return;
    this.dirty = false;
    this.writing = true;
    try {
      await writeFile(FILE + '.tmp', this.serialize());
      await rename(FILE + '.tmp', FILE);
    } catch (e) {
      this.dirty = true;
      console.error('[store] save failed:', e.message);
    } finally { this.writing = false; }
  }
  flushSync() {
    writeFileSync(FILE + '.tmp', this.serialize());
    renameSync(FILE + '.tmp', FILE);
    this.dirty = false;
  }
  get count() { return this.profiles.size; }
}

export const store = new ProfileStore();
