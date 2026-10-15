// World v3b: every regional place the modules put on the owner's map, as one list (frame tiles) - for the picture
// (tools/world3b/regions_plan.py: `node tools/world3b/regions.mjs > plan.json`) and test/world3regions.test.js.
//   regionPlaces() -> [{ kind: 'box'|'line'|'pt', group, name, b?, p?, pts? }]
import { TOWNS3, TOWN_ROADS3 } from '../../shared/world3-towns.js';
import { MESA } from '../../shared/world3-mesa.js';
import { GULCH, HOLLOW, DESERT } from '../../shared/world3-desert.js';
import { EGRET, WEST } from '../../shared/world3-west.js';
import { PRISON, REACH, KESTREL } from '../../shared/world3-water.js';
import { WILD_SITES, MOVED, WILD_TRACKS, FARM, AIRSTRIPS3 } from '../../shared/world3-wild.js';
import { TOWNS, LANDMARKS } from '../../shared/world3-skeleton.js';
import { LOOKOUT_MESA } from '../../shared/world3-relief.js';

export function regionPlaces() {
  const out = [];
  const box = (group, name, b) => out.push({ kind: 'box', group, name, b: [b[0], b[1], b[2], b[3]] });
  const pt = (group, name, p) => out.push({ kind: 'pt', group, name, p: [p[0], p[1]] });
  const line = (group, name, pts) => out.push({ kind: 'line', group, name, pts: pts.map(([x, y]) => [x, y]) });
  for (const t of [...TOWNS3, MESA, GULCH]) {
    for (const g of Array.isArray(t.ground[0][1]) ? t.ground.flatMap(([, bs]) => bs) : t.ground) box('town', t.name, g);   // (Lucky Mesa's: [district, boxes])
    for (const [n, P] of t.streets) line('street', n, P);
  }
  for (const R of TOWN_ROADS3) line('road', R.name, R.pts);
  box('town', HOLLOW.name, HOLLOW.box);
  box('place', 'Copper Gulch Mine pit', DESERT.pit); pt('place', 'adit', DESERT.adit);
  box('place', 'freight yard', DESERT.freight); box('place', 'Sundowner Motel', DESERT.motel);
  pt('place', 'Mesa Camp', DESERT.camp); pt('place', 'lookout', DESERT.lookout); pt('place', 'arch', DESERT.arch);
  line('place', 'Red Rock Dam', [[DESERT.dam[0], DESERT.damRows[1]], [DESERT.dam[1], DESERT.damRows[1]]]);
  box('relief', 'lookout mesa', [LOOKOUT_MESA.at[0] - LOOKOUT_MESA.rx, LOOKOUT_MESA.at[1] - LOOKOUT_MESA.ry, LOOKOUT_MESA.at[0] + LOOKOUT_MESA.rx, LOOKOUT_MESA.at[1] + LOOKOUT_MESA.ry]);
  box('town', EGRET.name, EGRET.box);
  for (const [n, P] of EGRET.streets) line('street', n, P);
  box('place', 'raceway', WEST.raceway); pt('place', 'Egret Point Light', WEST.light); pt('place', 'bird hide', WEST.hide);
  line('place', 'marsh boardwalk', WEST.boardwalk); pt('place', 'Silver Thread Falls', WEST.falls); pt('place', 'North Cape', WEST.cape);
  box('place', PRISON.name, PRISON.box); pt('place', 'warden', PRISON.warden); pt('place', 'prison light', PRISON.light);
  pt('place', 'lock', [(REACH.lock.a[0] + REACH.lock.b[0]) / 2, REACH.lock.y]);
  for (const [n, p] of REACH.docks) pt('water', n, p);
  pt('place', 'Kestrel island', KESTREL.island.at); pt('place', 'Lookout Hill', KESTREL.lookout); box('place', 'Kestrel campground', KESTREL.camp);
  pt('place', 'boathouse', KESTREL.boathouse);
  for (const [n, p] of KESTREL.fishing) pt('place', n, p);
  for (const s of WILD_SITES) pt('wild', s.name, s.near);
  for (const q of MOVED) pt('moved', q.name, q.to);
  for (const k of WILD_TRACKS) pt('track', k.name, k.end);
  box('place', 'the farm', [1030 + FARM.d[0], 350 + FARM.d[1], 1206 + FARM.d[0], 700 + FARM.d[1]]);
  for (const a of AIRSTRIPS3) { box('airstrip', a.name, a.runway); box('airstrip', `${a.name} hangar`, [a.hangar[0], a.hangar[1], a.hangar[0] + a.hangar[2], a.hangar[1] + a.hangar[3]]); line('track', `${a.name} track`, a.track); }
  for (const t of TOWNS) pt('skeleton-town', t.name, t.at);
  for (const l of LANDMARKS) pt('landmark', l.name, l.at);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) process.stdout.write(JSON.stringify(regionPlaces()));
