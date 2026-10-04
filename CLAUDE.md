# City Life Auto - working notes

- Authoritative Node server (`server/`), "dumb window" client (`client/`), shared code in `shared/`. Zero runtime dependencies.
- **Pushing to `main` deploys live:** the Oracle server (play.deadbaron.com) pulls `main` every 2 minutes (`deploy/auto-update.sh`, `cla-update.timer`) and restarts when `server/` or `shared/` changed - online players get a brief reconnect. Only push when tests pass, and batch server changes. A version that fails its health check is rolled back automatically. GitHub Pages serves the client.
- Tests: `npm test` (runs `node --test test/*.test.js`). Run `node tools/stamp-version.mjs` before every commit (cache-busting build id).
- Docs: add a `docs/DEVLOG.md` entry for each feature; keep the README controls table current.

## Keep the tutorial in sync (standing rule)
The city tour lives in `shared/tutorial.js` and is played by `client/tutorial.js` over the live map.
- Whenever gameplay, rules, controls, places or the map change, update the tour in the same change.
- Places are referenced by POI kind / district / island, never coordinates; `{{kind}}` / `{{kind:where}}` resolve to live names and districts, and island stops list their places from the map automatically.
- Player-facing numbers belong in `shared/rules.js` (server and tutorial both import them); controls belong in `shared/controls.js`.
- `test/tutorial.test.js` fails if a place type, island, turf, control action or rule is missing from the tour, or if any stop no longer resolves on the map. Don't silence it - teach the new thing.
- Bump `TUTORIAL_VERSION` when the tour changes meaningfully, so returning players are offered the updated tour.
