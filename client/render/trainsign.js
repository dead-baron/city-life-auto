// The front car's sign (loaded the first time a train comes near you: client/main.js drawTrainSigns).
import { TRAIN_CARS } from '../../shared/mapcore.js';

// The sign (the owner, 10-16: "show the next station on a sign on the train"): an LED board over its front
// end with where it stops next - the station it's in at while its doors are open, the next one on its line - so from a
// platform you can see where a train goes before getting on. e.d.l: its line (the map's rails; -1 the old city's one
// line), e.extra: the station it's at or running to (server/net.js). k: how much to show (0..1, by how near it is).
export function trainSignText(map, e) {
  const rail = e.d.l >= 0 && map.rails ? map.rails[e.d.l] : map.rail, sts = rail && rail.stations;
  if (!sts || !sts.length) return null;
  const at = (e.extra || 0) % sts.length, st = e.flags & 2 ? sts[(at + 1) % sts.length] : sts[at];
  return st ? st.name.replace(/ Station$/, '').toUpperCase() : null;
}
export const TRAIN_SIGN = { near: 260, far: 520, lift: 54 };
export function drawTrainSign(g, e, map, now, k = 1) {
  const def = TRAIN_CARS[e.d.c], text = def && trainSignText(map, e);
  if (!text) return;
  const f = def.L / 2 - 24, x = e.rx + Math.cos(e.ra) * f, y = e.ry + Math.sin(e.ra) * f - TRAIN_SIGN.lift;
  g.save();
  g.globalAlpha = k;
  g.font = 'bold 9px monospace';
  const tw = Math.ceil(g.measureText(text).width), w = Math.max(64, tw + 14), h = 24;
  g.translate(Math.round(x), Math.round(y));
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(-w / 2 + 2, -h / 2 + 2, w, h);
  g.fillStyle = '#16181c'; g.fillRect(-w / 2, -h / 2, w, h);                 // housing
  g.fillStyle = '#050607'; g.fillRect(-w / 2 + 2, -h / 2 + 2, w - 4, h - 4);   // screen
  g.fillStyle = 'rgba(255,176,32,.1)'; g.fillRect(-w / 2 + 2, -h / 2 + 2, w - 4, h - 4);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#8a8f99'; g.font = 'bold 6px sans-serif'; g.fillText(e.flags & 2 ? 'NEXT STOP' : 'NOW TO', 0, -5);
  g.fillStyle = Math.floor(now * 1.5) % 4 ? '#ffb020' : '#ffc650'; g.font = 'bold 9px monospace'; g.fillText(text, 0, 5);
  g.restore();
}
