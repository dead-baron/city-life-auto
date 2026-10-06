# Deploying: Oracle Cloud server + deadbaron.com

Two separate pieces:

| Piece | Where | URL |
|---|---|---|
| Game page (HTML/JS/art) | GitHub Pages from this repo | `https://deadbaron.com/city-life-auto/` |
| Game server (Node.js) | Oracle Cloud Always Free instance | `wss://play.deadbaron.com/ws` |

The page reads the server address from `client/config.js` (`PROD_SERVER`). Pages served from deadbaron.com connect to `wss://play.deadbaron.com/ws`. Override for testing with `?server=wss://other-host/ws`.

## 1. GitHub Pages (free, ~2 minutes)

Your main site repo `dead-baron.github.io` already serves `deadbaron.com` (it has the `CNAME`). A project repo with Pages turned on is automatically published under that domain:

1. GitHub → **dead-baron/city-life-auto** → *Settings* → *Pages*.
2. *Source*: **Deploy from a branch**, Branch **main**, folder **/ (root)** → Save.
3. After about a minute the page is live at `https://deadbaron.com/city-life-auto/`. It shows *Connecting…* until the server below exists.

## 2. Oracle Cloud Always Free server

> Oracle halved the Always Free Arm allowance on 15 June 2026: **2 OCPUs + 12 GB RAM total** (it was 4/24). Do not create anything larger: going over the free allowance on an Always Free tenancy disables your Arm instances. Idle instances (CPU under ~20% for 7 days) can be reclaimed, but a server with players on it isn't idle.

1. Sign up at https://www.oracle.com/cloud/free/. A card is required for verification; Always Free resources are not charged. Pick a **home region** near your players; it can't be changed later.
2. *Compute → Instances → Create*: image **Ubuntu 24.04**, shape **VM.Standard.A1.Flex** with **2 OCPU / 12 GB** (or 1/6). If you see *Out of capacity*, retry later or try another availability domain.
3. Download the SSH key. Note the **public IP**.
4. *Networking → your VCN → Security List* → add **Ingress** rules: TCP **80** and TCP **443** from `0.0.0.0/0`.
5. DNS: wherever deadbaron.com's DNS is managed (for GitHub Pages it's usually your registrar), add
   `A  play  →  <instance public IP>`.
6. SSH in and install:
   ```bash
   ssh -i key.pem ubuntu@<public-ip>
   git clone https://github.com/dead-baron/city-life-auto
   cd city-life-auto
   bash deploy/setup-oracle.sh
   ```
   This installs Node 22 and Caddy (automatic HTTPS certificate for play.deadbaron.com), opens 80/443 in the instance firewall (Oracle images block them even when the VCN allows them), registers the systemd service (auto-restart, starts on boot, saves on shutdown), and adds a nightly profile backup.
7. Check: `curl https://play.deadbaron.com/health` → `ok`. Then open `https://deadbaron.com/city-life-auto/`.

## Operating it

| Task | Command |
|---|---|
| Live log | `journalctl -u city-life-auto -f` |
| Stats (players, tick ms, bandwidth) | `curl -s http://127.0.0.1:8080/stats` |
| Update to latest code | `cd ~/city-life-auto && git pull && sudo systemctl restart city-life-auto` |
| Restart (players see "Server restarting", progress saved) | `sudo systemctl restart city-life-auto` |
| Backups | `~/cla-backups/profiles-YYYY-MM-DD.json` (14 days) |

Environment variables (in `deploy/city-life-auto.service`): `PORT`, `HOST`, `CLA_DATA_DIR`, `CLA_ORIGINS` (allowed page origins for WebSockets), `CLA_MAX_PLAYERS`, `CLA_NPC_BUDGET`, `CLA_SECRET`, `CLA_SEED`, `CLA_DEV` (never `1` in production), `CLA_FRESH_ON_UPDATE` (below).

`CLA_FRESH_ON_UPDATE` - what happens to a player the first time they come back after an update (a new build):
- `spawn` (default): a fresh start at a spawn point (their home if they picked one, else a hospital), on foot, not wanted, carrying nothing, full health. Money, items, weapons, homes and cars are kept.
- `all`: the same, and their progress is wiped too (money, bank, items, weapons, EXP, record, cars, homes; name and look are kept). Use it for updates that need everyone to start over.
- `off`: players carry on where they left off.

To change it, uncomment the `#Environment=CLA_FRESH_ON_UPDATE=all` line (or set `off`) in the service file (`/etc/systemd/system/city-life-auto.service`, or `deploy/city-life-auto.service` and re-run `bash deploy/setup-oracle.sh`), then `sudo systemctl daemon-reload && sudo systemctl restart city-life-auto`. The server logs the mode it runs with at startup.

**Why not PM2 cluster mode:** the city is one stateful process. Cluster mode would split players into separate worlds. systemd (or PM2 in *fork* mode) is correct.

## Capacity and moving off free tier

- Measured: 100 spread-out players ≈ 19 ms per tick on one core (a 50 ms budget), ~35 KB/s per player. Plan on **50–100 concurrent** on the free instance.
- Oracle's free egress is 10 TB/month, roughly 75 players online 24/7 at that rate. Real usage is far lower.
- There is no DDoS protection on the free tier. Before a public launch, put Cloudflare (free) in front of `play.deadbaron.com` (WebSockets are supported) or move to a VPS that includes it.
- Moving servers: copy `~/cla-data/` (profiles + `secret.key`, which keeps everyone's guest tokens valid) to the new machine, run the same setup script, and point the `play` DNS record at it.

## Releasing a client update

Run `node tools/stamp-version.mjs` before committing. It hashes every file the browser loads into `version.json`; `client/boot.js` sees the new hash and refreshes the browser's cached copies, so players get the update immediately instead of after GitHub Pages' 10-minute cache.

How an update reaches people who are playing:
1. The game server finds the new `version.json`: at boot after a server update, or within 20 s of `auto-update.sh` pulling a client-only change (no restart). It logs `new build on disk` and tells every page (`{t: 'build'}`). `curl -s http://127.0.0.1:8080/stats` shows the build it runs.
2. Pages on an older build show "Updating to the latest version...", wait until GitHub Pages serves the new build (up to 3 minutes), then clear this game's caches and reload (`client/update.js`). A device that can't get the new build retries at most every 30 s.
3. Players come back on the new build fresh at a spawn point (`CLA_FRESH_ON_UPDATE`). Leaving to reload never drops their things.
