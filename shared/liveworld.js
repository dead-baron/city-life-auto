// The world the live game runs: 'today' (World v2's frame, shared/map.js generateCity) or 'v3' (World v3's whole world,
// server/world3.js). The deployed server (NODE_ENV=production) runs it unless CLA_WORLD says otherwise (server/config.js);
// tests and local runs keep today's unless CLA_WORLD=v3. The stamp writes it into version.json (`live`), so a page that
// hasn't been told which world the server runs builds the right one from the start (client/boot.js).
// Switching it is the switch (docs/WORLD-V3.md 8.23's runbook): bump WORLD_VERSION with it and stamp.
export const LIVE_WORLD = 'today';
