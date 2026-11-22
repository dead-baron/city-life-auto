# Task: the security and exploit audit (find and report - change no game code)

City Life Auto is about to open a public beta to strangers. Find how players could cheat, break, crash or abuse it.
The server (`server/`) is authoritative; the page (`client/`) is a "dumb window" - but check that this holds.
Earlier audits: `docs/audit/REPORT.md`, `REPORT2.md` (don't repeat them).

## Rules (all tasks)
- Read `CLAUDE.md` and `docs/DECISIONS.md` first and follow them.
- Work only on this branch; commit as you go (small commits). **Never push to `main` and never merge into it** (pushing
  main deploys the live game). This shell has no GitHub login: do not try to push; the owner pushes the branch.
- This is a Windows checkout: `tools/stamp-version.mjs` and some tests fail here for Windows-only reasons (paths,
  line endings) - skip stamping (Claude stamps on merge) and judge tests by the ones your change touches.
- Heavy commands (building World v3, the full test suite) one at a time, `node --max-old-space-size=3072`. A local
  server only on 127.0.0.1, never a public port. Be economical: this runs on a fixed budget.
- Finish with a short summary: what you did, what you left, and anything the owner must decide.

## Check
1. **Trusting the client:** every message the server accepts (`server/net.js`, `server/session.js`, each
   `server/systems/*.js` handler): can a modified page send positions, speeds, hits, damage, money, item ids,
   prices, quantities, timers or targets the server takes without checking? Teleporting, speed hacks, hitting from
   across the map, firing faster, buying for less, selling for more, using items you don't have, entering places
   you can't, acting while dead / jailed / in a menu. Look at the anti-cheat (`anticheat`, input steps) for gaps.
2. **Duplication and money:** races between two messages (buy twice, sell twice, drop and pick up, trade, crate
   delivery, bank / ATM, homes and garages, death drops, disconnect mid-action, two tabs on one account); negative or
   huge numbers; integer / float tricks; anything that sells for more than it costs; loops that print money.
3. **Accounts and safety:** guest vs signed-in limits, bans / mutes / strikes and whether a new guest token gets round
   them; the age gate and consent; renames and the name filter; chat filter and contact masking bypasses (spacing,
   unicode look-alikes, zero-width characters); private data in messages to other players (ids, emails, IPs - never
   allowed); the admin / helper powers and the admin log (can a non-admin reach them? dev mode leftovers -
   `CLA_DEV_OPEN`, debug commands reachable on the live server?).
4. **Denial of service:** message size and rate limits, unbounded arrays / maps a player can grow, expensive requests
   (pathfinding, world queries, art chunks) a player can spam, the join line (`CLA_MAX_PLAYERS`, `CLA_LINE_MAX`),
   reconnect storms, the HTTP endpoints (`/stats`, `/perf`, `/clienterrors`, the art CDN, uploads, webhooks).
5. **Secrets and config:** keys or tokens in the repo, in client code or in logs; webhooks callable by anyone.

## Report
`docs/audit/SECURITY.md`: a table first (issue / severity: critical, high, medium, low / how a player does it /
file:line / suggested fix), critical ones first; then details; then "checked and fine". Where you can show an exploit
with a small test that only reports (no fix), add it under `tools/audit/`. Commit it all on this branch.
