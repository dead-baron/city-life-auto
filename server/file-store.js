// Persistent player profiles for the online server (Node only). JSON file with atomic writes (write temp + rename),
// flushed every few seconds when anything changed and on shutdown.
import { existsSync, readFileSync, writeFileSync, renameSync, copyFileSync } from 'node:fs';
import { writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from './config.js';
import { defaultProfile } from './store.js';
import { WORLD_VERSION } from '../shared/constants.js';

const FILE = join(config.dataDir, 'profiles.json');

export class FileStore {
  constructor() {
    this.profiles = new Map();
    this.kept = {};   // the world's own state that outlives a restart (store.kept: the farms' fields - farming.js)
    this.dirty = false;
    this.writing = false;
    if (existsSync(FILE)) {
      try {
        const data = JSON.parse(readFileSync(FILE, 'utf8'));
        for (const p of data.profiles || []) this.profiles.set(p.pid, p);
        if (data.kept && typeof data.kept === 'object') this.kept = data.kept;
      } catch (e) {
        console.error('[store] profiles.json unreadable, backing up and starting fresh:', e.message);
        copyFileSync(FILE, FILE + '.corrupt-' + Date.now());
      }
      // A new world (WORLD_VERSION bumped): keep the profiles as they were before anyone's homes are released
      // (homes.checkWorld, on each join) - restoring this file is the full rollback (WORLD-V3.md 8.23, step 5).
      const before = join(config.dataDir, `profiles-before-world${WORLD_VERSION}.json`);
      try {
        if ([...this.profiles.values()].some((p) => (p.wv ?? 1) !== WORLD_VERSION) && !existsSync(before)) {
          copyFileSync(FILE, before);
          console.log(`[store] world ${WORLD_VERSION}: the profiles as they were are kept in ${before}`);
        }
      } catch (e) { console.error('[store] could not keep the profiles before the new world:', e.message); }
    }
  }
  get(pid) { return this.profiles.get(pid) || null; }
  create(pid) {
    const p = defaultProfile(pid);
    this.profiles.set(pid, p);
    this.dirty = true;
    return p;
  }
  // a profile gone for good (Start fresh: players.js wipeAccount): the next save leaves it out
  remove(pid) { this.dirty = true; return this.profiles.delete(pid); }
  touch() { this.dirty = true; }
  serialize() { return JSON.stringify({ version: 1, saved: Date.now(), profiles: [...this.profiles.values()], kept: this.kept }); }
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
  all() { return this.profiles.values(); }
  get count() { return this.profiles.size; }
}

