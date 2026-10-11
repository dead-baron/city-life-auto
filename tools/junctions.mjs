// The junctions of the world a game server runs - today's, or World v3's (CLA_WORLD=v3) - for tools/bots.js --spread:
// read from the server's region files' index (server/worldcdn.js: the road graph is whole in it; /stats says the
// world's key and seed), waited for while the server is still writing its files (up to waitMs); else today's world,
// built here from the seed (a server that serves no index).
import { gunzipSync } from 'node:zlib';
import { readPack, PACK_VERSION } from '../shared/regionpack.js';

export async function junctions(http, { fetchFn = fetch, waitMs = 60000, say = console.log, seed = Number(process.env.CLA_SEED || 1337) } = {}) {
  const until = Date.now() + waitMs;
  for (;;) {
    let w = null;
    try { w = (await (await fetchFn(`${http}/stats`)).json()).world; } catch { w = null; }
    if (w && w.world && w.state === 'ready') {
      try {
        const r = await fetchFn(`${http}/world/${w.world}/${w.seed}/index.bin?v=${PACK_VERSION}`);
        if (r.ok) {
          const { d } = readPack(new Uint8Array(gunzipSync(Buffer.from(await r.arrayBuffer()))));
          const nodes = ((d.root && d.root.nodes) || []).filter((n) => n && Number.isFinite(n.x) && Number.isFinite(n.y) && !n.island);
          if (nodes.length) { say(`spreading over ${nodes.length} junctions of the server's world ${w.world}`); return nodes; }
        }
      } catch (e) { say(`the server's index didn't read (${(e && e.message) || e})`); break; }
    }
    if (!w || w.state !== 'packing' || Date.now() > until) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  say('the server serves no index: spreading over today\'s world, built here');
  const { generateCity } = await import('../shared/map.js');
  return generateCity(seed).nodes.filter((n) => !n.island);
}
