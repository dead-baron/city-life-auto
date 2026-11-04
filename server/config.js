// Server configuration from environment variables (see docs/DEPLOY.md).
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LIVE_WORLD } from '../shared/liveworld.js';

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
  // The world the server runs: today's or 'v3', World v3's whole world built here (server/world3.js: about a minute and
  // 1-2 GB more at start; docs/WORLD-V3.md 8.23). CLA_WORLD says which; without it the deployed server
  // (NODE_ENV=production) runs the live world (shared/liveworld.js) and everything else - tests, local runs - today's.
  world: (process.env.CLA_WORLD || (process.env.NODE_ENV === 'production' ? LIVE_WORLD : 'today')) === 'v3' ? 'v3' : 'today',
  // What happens to a player the first time they come back after an update (a new build: version.json,
  // stamped on every commit): 'spawn' (default) - a fresh start at a spawn point (their home if they
  // picked one, else a hospital): on foot, not wanted, nothing carried, full health, progress kept;
  // 'all' - the same, and their progress is wiped too (money, bank, items, weapons, EXP, homes, cars...);
  // 'off' - they carry on where they left off.
  freshOnUpdate: ['off', 'spawn', 'all'].includes(process.env.CLA_FRESH_ON_UPDATE) ? process.env.CLA_FRESH_ON_UPDATE : 'spawn',
};
// The launch foundation (docs/LAUNCH-SETUP.md): sign-ins, roles, chat, anti-cheat, analytics. Every secret comes from the
// environment and is never logged; a provider whose keys aren't set is switched off (its button hidden on the page).
const env = (k, d = '') => (process.env[k] === undefined ? d : String(process.env[k]).trim());
const list = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);
config.launch = {
  // the open debug mode (Options -> Dev Debug Mode, anyone): on while testing; CLA_DEV_OPEN=0 at launch, then only
  // accounts with the admin (or owner) role get the debug powers (server/roles.js)
  devOpen: env('CLA_DEV_OPEN', '1') !== '0',
  // the server's own public address (OAuth redirect URIs and magic links point here), and the pages that may sign in
  publicUrl: env('CLA_PUBLIC_URL', 'https://play.deadbaron.com').replace(/\/+$/, ''),
  pageOrigins: list(env('CLA_PAGE_ORIGINS', 'https://deadbaron.com,https://www.deadbaron.com,https://dead-baron.github.io')),
  // passkeys (WebAuthn): the relying party id - the page's registrable domain - and its display name
  rpId: env('CLA_RP_ID', 'deadbaron.com'),
  rpName: env('CLA_RP_NAME', 'City Life Auto'),
  google: { id: env('GOOGLE_CLIENT_ID'), secret: env('GOOGLE_CLIENT_SECRET') },
  discord: { id: env('DISCORD_CLIENT_ID'), secret: env('DISCORD_CLIENT_SECRET') },
  reddit: { id: env('REDDIT_CLIENT_ID'), secret: env('REDDIT_CLIENT_SECRET') },
  email: { key: env('RESEND_API_KEY'), from: env('CLA_EMAIL_FROM', 'City Life Auto <login@deadbaron.com>') },
  // the owner's account: its id (Settings -> Account shows it), or none - then a one-time claim code is printed at start
  ownerId: env('CLA_OWNER_ID'),
  // the 17+ gate: when on, a page that hasn't confirmed the age floor isn't let into the city (the gate lives on the page)
  requireAge: env('CLA_REQUIRE_AGE', '0') === '1',
  // new guest characters an hour from one address (0 = no limit - the default: a school or a phone network's shared
  // address would hit a low one at launch), and whether a banned device marker stops new guests
  guestPerHour: Number(env('CLA_GUESTS_PER_HOUR', '0')) || 0,
  blockBannedDevices: env('CLA_BLOCK_BANNED_DEVICES', '1') !== '0',
  // Google Analytics 4: the measurement id is public (served to the page); the Measurement Protocol secret is not
  gaMeasurementId: /^G-[A-Z0-9]{4,16}$/.test(env('GA_MEASUREMENT_ID')) ? env('GA_MEASUREMENT_ID') : '',
  gaApiSecret: env('GA_API_SECRET'),
};
// Only trust X-Forwarded-For when a local proxy (Caddy) is the only thing that can reach us.
config.trustProxy = process.env.CLA_TRUST_PROXY ? process.env.CLA_TRUST_PROXY === '1' : (config.host === '127.0.0.1' || config.host === 'localhost');
