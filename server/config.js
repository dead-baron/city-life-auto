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
  // Cost / abuse guards - all OFF by default (0). The monthly data meter runs regardless and
  // shows in /stats. To switch them on see deploy/city-life-auto.service.
  // Outbound data cap per calendar month (GB): Oracle's free tier includes 10 TB/month, so 9000
  // keeps the bill at $0 - near the cap new players are turned away, at it the city closes until the 1st.
  monthlyGB: Number(process.env.CLA_MONTHLY_GB || 0),
  maxPerIp: Number(process.env.CLA_MAX_PER_IP || 0),           // simultaneous game connections from one address (e.g. 6)
  connPerMinute: Number(process.env.CLA_CONN_PER_MIN || 0),    // new game connections a minute from one address (e.g. 20)
  httpPerMinute: Number(process.env.CLA_HTTP_PER_MIN || 0),    // plain HTTP requests a minute from one address (e.g. 300)
  // Comma-separated list of allowed page origins for WebSocket connections ('*' = any).
  allowedOrigins: (process.env.CLA_ORIGINS || '*').split(',').map((s) => s.trim()).filter(Boolean),
  saveIntervalMs: 5000,
  npcBudget: Number(process.env.CLA_NPC_BUDGET || 700),
};
// Only trust X-Forwarded-For when a local proxy (Caddy) is the only thing that can reach us.
config.trustProxy = process.env.CLA_TRUST_PROXY ? process.env.CLA_TRUST_PROXY === '1' : (config.host === '127.0.0.1' || config.host === 'localhost');
