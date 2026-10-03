// Server configuration from environment variables (see docs/DEPLOY.md).
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = process.env.CLA_DATA_DIR || join(ROOT, 'data');
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

function loadSecret() {
  if (process.env.CLA_SECRET) return process.env.CLA_SECRET;
  const p = join(DATA_DIR, 'secret.key');
  if (existsSync(p)) return readFileSync(p, 'utf8').trim();
  const s = randomBytes(32).toString('hex');
  writeFileSync(p, s, { mode: 0o600 });
  return s;
}

export const config = {
  root: ROOT,
  dataDir: DATA_DIR,
  port: Number(process.env.PORT || 8080),
  host: process.env.HOST || '0.0.0.0',
  seed: Number(process.env.CLA_SEED || 1337),
  dev: process.env.CLA_DEV === '1',
  secret: loadSecret(),
  maxPlayers: Number(process.env.CLA_MAX_PLAYERS || 150),
  // Comma-separated list of allowed page origins for WebSocket connections ('*' = any).
  allowedOrigins: (process.env.CLA_ORIGINS || '*').split(',').map((s) => s.trim()).filter(Boolean),
  saveIntervalMs: 5000,
  npcBudget: Number(process.env.CLA_NPC_BUDGET || 700),
};
