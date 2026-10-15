// World v3 (docs/WORLD-V3.md 8.19): today's wild land's designed places brought into the whole-world build. Today's
// Highland Woods (district 29), Granite Peaks (33) and Dry Creek (9, 41, 42) are no piece of the v3 world (8.6: their
// positions go off the frame), but part 1.5 moves their places into the new regions and the owner split Dry Creek
// between Willow Valley and the Red Rock Desert (part 5). This step brings their country sites (shared/countryside.js
// SITES: the campgrounds, the roadside stops, the masts, the quarry, the observatory, the wind farms, the oil field, the
// solar farm, the drive-in, The Rusty Spur) to spots in their v3 region (WILD_SITES, the placement table), each placed
// by today's rules round its spot - open ground of its region, clear of the skeleton's roads, the main line, the
// stations, the towns and the desert's places - with its own access road to the nearest road it may join (never a
// highway: they cross nothing at grade). For the whole-world build only (shared/world3-world.js calls wildSites3 from
// its lines hook, after the skeleton's roads and the towns' streets; the page and the city worker never import this
// module). map.js's buildCountryside builds what stands on each lot, as today's.
import { TILE, T } from './constants.js';
import { rounded, measure, segX } from './geom.js';
import { skeletonLines, STATIONS, nearestOnPath } from './world3-skeleton.js';
import { SITES } from './countryside.js';
import { D3, peakHeight, SNOW_LINE } from './world3-biomes.js';
import { landHeight3, tableSpots3, reliefNoise } from './world3-relief.js';   // (H50: the tracks laid along the land)
import { TERRAIN3 } from './world3-land.js';
import { DESERT, HOLLOW, GULCH } from './world3-desert.js';
import { stamp } from './world3-towns.js';

// The placement table: each of today's country sites of the wild land, by name, at its spot in its v3 region (tiles; the
// lot is looked for within 60 tiles of it). (v3b, docs/WORLD-V3.md part 9: re-anchored on the owner's map - the woods'
// hamlets on the sketch's small grey patches (Pine Ridge by the western falls' creek, the Highland stop by the woods'
// south edge), the peaks' places in the north-west mountains (GROUND3.mount), the desert's along its west and north
// edges off Mine Road, Mesa Road and the Casino Highway, the Route 9 stop on the desert's east side.) Highland Woods'
// in the woods: Pine Ridge Campground by Highland Road's south end (the skeleton's "Redwood campgrounds"), the Highland
// stop on the woods' south edge above the western city, the radio mast on the rise by Highland Road; Granite Peaks' up
// in the north-west mountains (GROUND3.mount) on the wild places' country roads (world3-skeleton.js ARTERIALS): the
// quarry off Timber Trail, the observatory at the top of Summit Road, the campground and the wind farm on the west
// headland above Windy Point Road (North Cape Light at its tip), the mast on the north-east peaks at the end of North
// Ridge Road; Dry Creek's desert places in the Red Rock Desert's west, off Mine Road, the North Coast Road, Copper Road
// and Route 9 (the Route 9 stop at the skeleton's Route 9 point, The Rusty Spur by the Casino Highway at Mine Road's
// crossing, the drive-in by Copper Gulch).
export const WILD_SITES = [
  { name: 'Pine Ridge Campground', d: D3.WOODS, near: [1110, 1690] },
  { name: 'Highland', d: D3.WOODS, near: [1939, 1619] },
  { name: 'Highland Radio Mast', d: D3.WOODS, near: [1349, 1125] },
  { name: 'Granite Quarry', d: D3.PEAKS, near: [1200, 560] },
  { name: 'Granite Peak Observatory', d: D3.PEAKS, near: [960, 400] },
  { name: 'Granite Cove Campground', d: D3.PEAKS, near: [690, 850] },
  { name: 'Windy Point Wind Farm', d: D3.PEAKS, near: [560, 860] },
  { name: 'North Ridge Mast', d: D3.PEAKS, near: [1920, 500] },
  { name: 'Dry Creek Oil Field', d: D3.DESERT, near: [4420, 1027] },
  { name: 'Sunfield Solar Farm', d: D3.DESERT, near: [4420, 1300] },
  { name: 'Starlite Drive-In', d: D3.DESERT, near: [4596, 1595] },
  { name: 'Route 9', d: D3.DESERT, near: [5960, 1100] },
  { name: 'Mesa Radio Mast', d: D3.DESERT, near: [4560, 760] },
  { name: 'Dry Creek Wind Farm', d: D3.DESERT, near: [4640, 720] },
  { name: 'The Rusty Spur', d: D3.DESERT, near: [4420, 1360] },
];
// (H51) Dry Creek's farmland in Willow Valley's east side (part 5: the owner split Dry Creek between the valley and the
// desert): today's farm moved whole by one offset, d (tiles: today's + d) - its fields, the co-op that takes harvests,
// the farmhouses and cottages for sale (wildFarm3, map.js buildFarm's hook), the Willow River Orchard and Vineyard (MOVED,
// their anchors), and its roads: the Farm Road, the County Road across it and the winery's lane (wildFarmRoads3, laid
// with the sites' roads and joined to the network).
export const FARM = { d: [1750, 510], region: D3.VALLEY };   // (v3b: its box 2780-2956, 860-1210 - the sketch's fields west of the farm valley's lake, between the main line's two valley stretches, west of the North Spur's room)
const farmAt = (x, y) => [x + FARM.d[0], y + FARM.d[1]];
// The nature sites moved whole (shared/naturesites.js builds them round their anchor of today's world, placed: its
// PXs / PYs, and its district through DS - the world build's `world.dist`): a square of today's tiles round each anchor
// goes to its v3 spot at scale 1 (map.js pin: shared/world3-world.js `pick` asks movedAt for a position no piece builds).
// Pine Lake between the Highland stop and Pine Ridge Campground as today's; Summit Tarn (its lake: islands.js LAKES),
// its falls, creek and cabin meadow, Granite Hot Springs above Summit Road's first bend (the road 24 tiles below its
// middle, its pools clear of the road's edge: naturesites.js looks for it straight down) and The Sentinel Stones above
// its ridge stretch on the peaks; Dry
// Creek's boneyard, mission ruins (above the North Coast Road) and balloon field (south-east of the Casino Highway, its
// track from Copper Road) in the desert's west.
export const MOVED = [
  { name: 'Pine Lake', anchor: [136, 216], to: [1300, 1500], r: 40, d: D3.WOODS },
  { name: 'Summit Tarn', anchor: [575, 82], to: [1150, 400], r: 35, d: D3.PEAKS },
  { name: 'Granite Hot Springs', anchor: [603, 125], to: [818, 594], r: 25, d: D3.PEAKS },
  { name: 'The Sentinel Stones', anchor: [744, 31], to: [900, 450], r: 20, d: D3.PEAKS },
  // Dry Creek's desert places in the Red Rock Desert's west, between the Desert Highway and Canyon Road (r: just the
  // anchor - nothing else of today's round it moves)
  // (keep: the box round `to`, tiles, the desert's dry washes are kept out of - world3-biomes.js paints them first)
  { name: 'Dry Creek Boneyard', anchor: [1248, 632], to: [4440, 1120], r: 4, d: D3.DESERT, keep: [-4, -4, 36, 76] },
  { name: 'Old Mission Ruins', anchor: [1190, 405], to: [4700, 806], r: 4, d: D3.DESERT, keep: [-24, -24, 24, 24] },
  { name: 'Dry Creek Balloon Field', anchor: [1150, 463], to: [4630, 1212], r: 4, d: D3.DESERT, keep: [-4, -4, 32, 27] },
  // (H47) Highland Woods' Redwood Creek - its falls, pool, camp and the trapper's beaver pond upstream - where Highland
  // Road runs straight through the redwoods (naturesites.js finds the road by the moved spot: within 12 tiles of it),
  // Giants Loop and the hunting lodge on Timber Road's north side west of Timber Bend (a road within 8 tiles of the
  // spot), Fern Gorge south of Timber Road east of the town (its trailhead on it: within 24 tiles of the gorge's west
  // side); Granite Peaks' Old Granite Mine above Timber Trail (its seams mined as today's: the cave world stays under
  // Copper Gulch Mine's adit); the desert's Red Rock Canyon (the painting, its oasis and wash) off Copper Gulch Road,
  // Mirage Lake and its camp in the open desert south of the North Coast Road (its track from it), Splash Canyon Water
  // Park by Mine Road where it enters the desert (its top-left corner; on the desert's ground, east of the valley's)
  { name: 'Redwood Creek', anchor: [210, 189], to: [1560, 1317], r: 30, d: D3.WOODS },
  { name: 'Giants Loop', anchor: [173, 131], to: [1610, 1420], r: 3, d: D3.WOODS },
  { name: 'Fern Gorge', anchor: [309, 172], to: [2000, 1440], r: 3, d: D3.WOODS },   // (south of Timber Road, its trailhead on it; clear of the main line's room)
  { name: 'Old Granite Mine', anchor: [537, 106], to: [1040, 620], r: 3, d: D3.PEAKS },
  { name: 'Canyon Oasis', anchor: [1190, 800], to: [5300, 980], r: 3, d: D3.DESERT, keep: [-31, -22, 31, 22] },
  { name: 'Mirage Camp', anchor: [1092, 782], to: [4470, 915], r: 12, d: D3.DESERT, keep: [-16, -36, 16, 20] },
  { name: 'Splash Canyon Water Park', anchor: [1054, 850], to: [4314, 1096], r: 3, d: D3.DESERT, keep: [-3, -3, 47, 25] },
  // (H51) the farm's orchard and vineyard by its offset (FARM); Redwood Cove on the Redwood Coast (the woods' west
  // coast: a sandy beach of the woods' own, north of 8.20's three coves), Granite Cove on Kestrel Lake's north-east
  // shore (v3b: the lake's shore 8 tiles below the beach, its bay open south to the lake)
  { name: 'Willow River Orchard', anchor: [1100, 438], to: farmAt(1100, 438), r: 3, d: D3.VALLEY },
  { name: 'Willow River Vineyard', anchor: [1121, 369], to: farmAt(1121, 369), r: 3, d: D3.VALLEY },
  { name: 'Redwood Cove', anchor: [58, 283], to: [520, 1100], r: 3, d: D3.WOODS },
  { name: 'Granite Cove', anchor: [555, 225], to: [3450, 962], r: 3, d: D3.VALLEY },   // (the peaks reach no sea: Kestrel Lake's north-east shore, the bay open south to the lake)
];
// The tracks today's nature sites look for by name (H47), laid to their moved places from the nearest road they may
// join: the Ridge Trail up to Summit Tarn from Summit Road's end (the fire lookout on its high stretch, the hunting
// camp by it), the Canyon Track into Red Rock Canyon from Copper Gulch Road (the oasis's turnaround at its end, the
// hunting camp), the Mirage Track down to Mirage Lake from the North Coast Road (the camp at its end). end: the track's
// far end (tiles); avoid: a box it keeps out of (the canyon painting's, the mission's: placed after the roads).
export const WILD_TRACKS = [
  { name: 'Ridge Trail', end: [1180, 440], d: D3.PEAKS },
  { name: 'Canyon Track', end: [5238, 972], d: D3.DESERT, avoid: [5250, 940, 5314, 1004] },   // (v3b: from Copper Gulch Road round the painting's spot - west of the road - to its west side, where the oasis's own track leaves it)
  { name: 'Mirage Track', end: [4476, 893], d: D3.DESERT },
  // the ways in to the moved sites that had none: the stones (from Summit Road), the boneyard (from Mine Road), the
  // balloon field (from Copper Road, to its south side) and the mission ruins (from the North Coast Road round the
  // ruins to their north side)
  { name: 'Sentinel Trail', end: [894, 438], d: D3.PEAKS, avoid: [894, 445, 906, 455] },   // (round the ring - its stones' open ground - to the point)
  { name: 'Boneyard Track', end: [4455, 1117], d: D3.DESERT },
  { name: 'Balloon Field Track', end: [4644, 1238], d: D3.DESERT },
  { name: 'Mission Track', end: [4700, 788], d: D3.DESERT, avoid: [4692, 798, 4708, 815] },
  // (H51) the ways down to the coves: from the nearest road to the top of each (the cove's own trail on down; Redwood
  // Cove's from Windy Point Road's end)
  { name: 'Redwood Cove Track', end: [534, 1090], d: D3.WOODS },
  { name: 'Granite Cove Track', end: [3452, 946], d: D3.VALLEY, reach: 420 },   // (from Cedar Farms Road, north of the lake)
];
// (v3b, the owner 2026-10-14) the crop dusters' grass airstrips in the farm valley's open fields, and Lucky Mesa's
// desert strip east of the town (the sketch's): runway [x0, y0, x1, y1) (mown grass in the valley, packed dirt in the
// desert; the valley's run east-west, 200 x 18), the hangar [x, y, w, h], the windsock and the fuel tank (tiles), the
// dirt track to the road. Built by shared/world3-airstrips.js (on open ground round the planned spot; the track to the
// nearest road) and listed in m.natureSites (kind 'airstrip', with the strip's rectangle: shared/flight.js).
export const AIRSTRIPS3 = [
  { name: 'Willow Valley Airstrip', d: D3.VALLEY, surface: 'grass', runway: [3990, 1180, 4190, 1198], hangar: [3972, 1202, 14, 10], windsock: [3984, 1175], tank: [3990, 1208], track: [[4240, 1189], [4250, 1189], [4250, 1112]] },
  { name: 'Brightwater Airstrip', d: D3.VALLEY, surface: 'grass', runway: [3280, 1460, 3480, 1478], hangar: [3262, 1482, 14, 10], windsock: [3274, 1455], tank: [3280, 1488], track: [[3530, 1469], [3720, 1469]] },
  { name: 'Lucky Mesa Airstrip', d: D3.DESERT, surface: 'dirt', runway: [5751, 740, 5769, 900], hangar: [5774, 800, 14, 10], windsock: [5774, 745], tank: [5776, 815], track: [[5774, 900], [5740, 936]] },
];
// today's wild districts -> the v3 region they move to (Highland Woods, Granite Peaks; Dry Creek's farmland the valley,
// its desert the Red Rock Desert)
const DIST3 = { 29: D3.WOODS, 33: D3.PEAKS, 9: D3.VALLEY, 42: D3.VALLEY, 41: D3.DESERT };
export const wildDist = (d) => DIST3[d] ?? d;
const MOVED_PIECES = MOVED.map((q, k) => {
  const fx = q.anchor[0] - q.r, fy = q.anchor[1] - q.r, ax = q.to[0] - q.r, ay = q.to[1] - q.r;
  return { key: `moved-${k}`, name: q.name, at: [ax, ay], from: [fx, fy], s: 1, dx: ax - fx, dy: ay - fy, ids: null, rect: [fx, fy, q.anchor[0] + q.r, q.anchor[1] + q.r], k: -2 - k };
});
// the moved piece holding today's position (x, y), or null
export function movedAt(x, y) {
  for (const p of MOVED_PIECES) if (x >= p.rect[0] && y >= p.rect[1] && x < p.rect[2] && y < p.rect[3]) return p;
  return null;
}
// the pictures' views (tools/world3-world-map.mjs --towns --only <keys>: docs/world-v3-town-<key>.png)
export const WILD_VIEWS = [
  { key: 'pinelake', name: 'Pine Lake, the Highland stop, Pine Ridge Campground and the radio mast', box: [1050, 1080, 1990, 1760] },
  { key: 'tarn', name: 'Summit Tarn, its falls and the cabin meadow', box: [1100, 360, 1210, 450] },
  { key: 'summit', name: 'Granite Hot Springs, The Sentinel Stones and the observatory on Summit Road', box: [700, 370, 1100, 710] },
  { key: 'quarry', name: 'The Granite Quarry off Timber Trail', box: [1130, 470, 1270, 620] },
  { key: 'windypoint', name: 'Granite Cove Campground and Windy Point Wind Farm above Windy Point Road; Redwood Cove\'s track', box: [480, 820, 910, 1100] },
  { key: 'northridge', name: 'North Ridge Mast at the end of North Ridge Road', box: [1880, 470, 2020, 810] },
  { key: 'drycreek', name: 'The oil field, The Rusty Spur, the boneyard and the balloon field by the Casino Highway', box: [4360, 980, 4680, 1420] },
  { key: 'mission', name: 'The Old Mission Ruins, the Dry Creek Wind Farm and the Mesa Radio Mast by the North Coast Road', box: [4540, 730, 4770, 850] },
  { key: 'route9', name: 'The Route 9 stop, the solar farm and the drive-in on Route 9', box: [4400, 1060, 6000, 1620] },
  // (H47)
  { key: 'redwoods', name: 'Redwood Creek, its falls and the beaver pond; Giants Loop, the hunting lodge and Fern Gorge on Timber Road', box: [1540, 1200, 2060, 1540] },
  { key: 'ridge', name: 'The Ridge Trail up to Summit Tarn: the fire lookout, the hunting camp', box: [1100, 340, 1260, 500] },   // (H50: east to its start on Summit Road)
  { key: 'oldmine', name: 'The Old Granite Mine above Timber Trail', box: [980, 570, 1110, 680] },
  { key: 'canyon', name: 'Red Rock Canyon and its oasis off Copper Gulch Road', box: [5220, 930, 5340, 1030] },
  { key: 'mirage', name: 'Mirage Lake and its camp at the end of the Mirage Track', box: [4430, 800, 4530, 950] },
  { key: 'splash', name: 'Splash Canyon Water Park on Mine Road', box: [4290, 1080, 4380, 1170] },
  // (H51)
  { key: 'farm', name: 'Dry Creek\'s farm in Willow Valley: the fields, the co-op, the farmhouses, the orchard and the vineyard', box: [...farmAt(1030, 350), ...farmAt(1206, 700)] },
  { key: 'redwoodcove', name: 'Redwood Cove on the Redwood Coast', box: [470, 1060, 570, 1140] },
  { key: 'granitecove', name: 'Granite Cove on Kestrel Lake\'s north-east shore', box: [3400, 870, 3500, 1000] },
  // (H50) the land's looks: the hillshade under Lookout Hill's orchard
  { key: 'lookouthill', name: 'Lookout Hill above Kestrel Lake: the hillshade under its orchard', box: [3300, 440, 3440, 560] },
];
// the room kept round the skeleton's lines (tiles): the highways', the main line's and its stations' as the desert's
// places keep (world3-desert.js), a road's own few tiles
export const WILD_ROOM = { hwy: 24, main: 18, station: 30, road: 4, place: 12 };
// what each kind of access road may join (countryside.js ACCESS_TO, without the highways: v3's are grade-separated)
const ACCESS = { dirt: new Set(['rural', 'dirt', 'art', 'st', 'drive', 'minor']), rural: new Set(['rural', 'dirt', 'art', 'ave', 'st', 'drive']) };
const GROUND = new Set([T.GRASS, T.DIRT, T.SAND]);
const R = 60, REACH = 90, M = 2;
// the distance from (x, y) to a polyline of [x, y] points (tiles)
function dPoly(P, x, y) {
  let best = Infinity;
  for (let j = 1; j < P.length; j++) {
    const ax = P[j - 1][0], ay = P[j - 1][1], dx = P[j][0] - ax, dy = P[j][1] - ay, L2 = dx * dx + dy * dy;
    const w = L2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2)) : 0, qx = ax + dx * w - x, qy = ay + dy * w - y;
    best = Math.min(best, qx * qx + qy * qy);
  }
  return Math.sqrt(best);
}

// The desert's places (world3-desert.js, built later in the dress hook) and the towns' boxes: no lot there.
function placeBoxes() {
  const out = [GULCH.box, HOLLOW.box, DESERT.pit, DESERT.motel, DESERT.freight];
  for (const [x, y, r] of [[...DESERT.camp, 40], [...DESERT.lookout, 50], [...DESERT.arch, 40]]) out.push([x - r, y - r, x + r, y + r]);
  out.push([DESERT.dam[0], 560, DESERT.dam[1], 720]);
  return out;
}

export function wildSites3(lines, m, L, snowAt) {
  const W = m.w, H = m.h, out = { placed: [], missed: [] };
  const SK = skeletonLines(), hwys = SK.filter((l) => l.kind === 'hwy'), mains = SK.filter((l) => l.kind === 'main');
  const tunnels = (m.world3?.roads?.tunnels || []).map((t) => ({ pts: t.pts.map((p) => (Array.isArray(p) ? p : [p.x / TILE, p.y / TILE])) }));
  const boxes = placeBoxes();
  const claimed = [];   // (the lots placed so far and their roads: tile rects)
  const byName = new Map(SITES.map((S) => [S.name, S]));
  const asPath = (l) => ({ pts: l.pts.map((p) => [p.x / TILE, p.y / TILE]) });
  const hwyLines = lines.filter((l) => l.kind === 'hwy' || l.kind === 'ramp');
  for (const P of WILD_SITES) {
    const S = byName.get(P.name);
    if (!S) { out.missed.push(P.name); continue; }
    const wx0 = P.near[0] - R - S.w - 8, wy0 = P.near[1] - R - S.h - 8, wx1 = P.near[0] + R + S.w + 8, wy1 = P.near[1] + R + S.h + 8;
    const box = [wx0, wy0, wx1, wy1], BW = wx1 - wx0, BH = wy1 - wy0;
    // the window's bad ground: not open ground of the site's region, water, reserved; the room round every line laid so
    // far, the skeleton's highways, main line and stations, the places' boxes and the lots claimed
    const bad = new Uint8Array(BW * BH);
    for (let y = wy0; y < wy1; y++) for (let x = wx0; x < wx1; x++) {
      const j = (y - wy0) * BW + x - wx0;
      if (x < 0 || y < 0 || x >= W || y >= H) { bad[j] = 1; continue; }
      const i = y * W + x;
      if (!m.land[i] || m.river[i] || m.lake[i] || m.dist[i] !== P.d || !GROUND.has(m.tiles[i]) || m.reserve[i]) bad[j] = 1;
    }
    for (const l of lines) {
      let hit = false;
      for (const p of l.pts) if (p.x / TILE > wx0 - 30 && p.x / TILE < wx1 + 30 && p.y / TILE > wy0 - 30 && p.y / TILE < wy1 + 30) { hit = true; break; }
      if (hit) stamp(bad, box, asPath(l), l.kind === 'hwy' || l.kind === 'ramp' ? WILD_ROOM.hwy : WILD_ROOM.road);
    }
    for (const h of hwys) stamp(bad, box, h.path, WILD_ROOM.hwy);
    for (const r of mains) stamp(bad, box, r.path, WILD_ROOM.main);
    for (const s of STATIONS) if (s.line === 'main') stamp(bad, box, { pts: [s.at, s.at] }, WILD_ROOM.station);
    for (const [a, b, c, d] of [...boxes.map(([a, b, c, d]) => [a - WILD_ROOM.place, b - WILD_ROOM.place, c + WILD_ROOM.place, d + WILD_ROOM.place]), ...claimed]) {
      for (let y = Math.max(wy0, b); y < Math.min(wy1, d); y++) for (let x = Math.max(wx0, a); x < Math.min(wx1, c); x++) bad[(y - wy0) * BW + x - wx0] = 1;
    }
    const sat = new Int32Array((BW + 1) * (BH + 1));
    for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) sat[(y + 1) * (BW + 1) + x + 1] = bad[y * BW + x] + sat[y * (BW + 1) + x + 1] + sat[(y + 1) * (BW + 1) + x] - sat[y * (BW + 1) + x];
    const badIn = (x, y, w, h) => {
      x -= wx0; y -= wy0;
      if (x < 0 || y < 0 || x + w > BW || y + h > BH) return 1;
      return sat[(y + h) * (BW + 1) + x + w] - sat[y * (BW + 1) + x + w] - sat[(y + h) * (BW + 1) + x] + sat[y * (BW + 1) + x];
    };
    // the points an access road may join: on the ground-level roads of a kind it may meet, on land, off the highways
    // (14 tiles: the streets are cut back from them), out of the tunnels
    const ok = ACCESS[S.road], samples = [];
    for (const l of lines) {
      if (l.lvl !== 0 || !ok.has(l.kind) || l.foot || (l.culdesac && (l.kind === 'rural' || l.kind === 'dirt'))) continue;
      for (let k = 0; k + 1 < l.pts.length; k++) {
        const a = l.pts[k], b = l.pts[k + 1], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (2 * TILE)));
        for (let j = 0; j < n; j++) {
          const x = (a.x + (b.x - a.x) * (j / n)) / TILE, y = (a.y + (b.y - a.y) * (j / n)) / TILE;
          if (Math.abs(x - P.near[0]) > R + REACH || Math.abs(y - P.near[1]) > R + REACH) continue;
          const tx = Math.floor(x), ty = Math.floor(y);
          if (tx < 0 || ty < 0 || tx >= W || ty >= H || !m.land[ty * W + tx] || m.river[ty * W + tx]) continue;
          if (hwys.some((h) => nearestOnPath(h.path, x, y).d < 14) || tunnels.some((t) => dPoly(t.pts, x, y) < 12)) continue;
          samples.push({ x, y });
        }
      }
    }
    const nearest = (ex, ey) => { let bq = null, bd = Infinity; for (const q of samples) { const d = Math.hypot(q.x - ex, q.y - ey); if (d < bd) { bd = d; bq = q; } } return [bq, bd]; };
    const cands = [];
    for (let dy = -R; dy <= R; dy += 2) for (let dx = -R; dx <= R; dx += 2) {
      const x = P.near[0] + dx - (S.w >> 1), y = P.near[1] + dy - (S.h >> 1);
      if (badIn(x - M, y - M, S.w + 2 * M, S.h + 2 * M)) continue;
      const [q, qd] = nearest(x + S.w / 2, y + S.h);
      if (!q || qd > REACH) continue;
      cands.push({ x, y, q, score: Math.hypot(dx, dy) + qd * 0.6 + (q.y < y + S.h * 0.5 ? 30 : 0) });
    }
    cands.sort((a, b) => a.score - b.score || a.y - b.y || a.x - b.x);
    // the way in (countryside.js's): out of the bottom of the lot, round its side if the road is behind it - over dry
    // open ground, across no highway and clear of the main line
    const route = (x, y, q) => {
      const cx = x + S.w / 2, by = y + S.h, c = [[cx, by - 2], [cx, by + 3]];
      if (q.y < by + 1) { const sx = q.x < cx ? x - 4 : x + S.w + 4; c.push([sx, by + 3]); if (Math.abs(q.y - (by + 3)) > 6) c.push([sx, q.y + (q.y < by ? 4 : -4)]); }
      c.push([q.x, q.y]);
      return c.map(([a, b]) => ({ x: a * TILE, y: b * TILE }));
    };
    const fine = (pts) => {
      for (let k = 0; k + 1 < pts.length; k++) {
        const a = pts[k], b = pts[k + 1], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / TILE));
        for (let j = 0; j <= n; j++) {
          const x = (a.x + (b.x - a.x) * (j / n)) / TILE, y = (a.y + (b.y - a.y) * (j / n)) / TILE, tx = Math.floor(x), ty = Math.floor(y);
          if (tx < 0 || ty < 0 || tx >= W || ty >= H || !m.land[ty * W + tx] || m.river[ty * W + tx] || m.lake[ty * W + tx]) return false;
          if (mains.some((r) => nearestOnPath(r.path, x, y).d < 10)) return false;
        }
        for (const h of hwyLines) for (let j = 0; j + 1 < h.pts.length; j++) if (segX(a, b, h.pts[j], h.pts[j + 1])) return false;
      }
      return true;
    };
    let best = null;
    for (const c of cands.slice(0, 40)) { const r = route(c.x, c.y, c.q); if (fine(r)) { best = { ...c, r }; break; } }
    if (!best) { out.missed.push(P.name); continue; }
    const { x, y } = best;
    const site = { ...S, near: [P.near[0], P.near[1]], x, y, d: m.dist[(y + (S.h >> 1)) * W + x + (S.w >> 1)], hx: x - (P.near[0] - S.near[0]), hy: y - (P.near[1] - S.near[1]), v3: true };
    m.countrySites.push(site);
    for (let ty = y - 1; ty < y + S.h + 1; ty++) for (let tx = x - 1; tx < x + S.w + 1; tx++) m.reserve[ty * W + tx] |= 32;
    claimed.push([x - 3, y - 3, x + S.w + 3, y + S.h + 3]);
    const pts = rounded(best.r, 4 * TILE, false, 8);
    measure(pts);
    const name = `${S.name} Road`.replace(' Road Road', ' Road');
    lines.push({ pts, kind: S.road, lvl: 0, name, culdesac: true });
    for (const p of pts) claimed.push([Math.floor(p.x / TILE) - 3, Math.floor(p.y / TILE) - 3, Math.floor(p.x / TILE) + 4, Math.floor(p.y / TILE) + 4]);
    out.placed.push({ name: S.name, type: S.type, x, y, w: S.w, h: S.h, d: site.d, road: name, joins: [Math.round(best.q.x), Math.round(best.q.y)] });
  }
  out.farm = wildFarmRoads3(lines, m, hwys, mains, hwyLines, tunnels);   // (H51: Dry Creek's farm roads)
  const n0 = lines.length;
  out.tracks = wildTracks3(lines, m, hwys, mains, hwyLines, tunnels, L, snowAt);
  for (let k = n0; k < lines.length; k++) lines[k].notraffic = true;   // (H51: the tracks are dirt cul-de-sacs the traffic keeps off - its edges' flag, server/systems/traffic.js)
  // the desert's dry washes (the biomes' gravel bars, reserve 128) kept off the moved desert sites: their ground plain,
  // and each wash ending 6-14 tiles short of the box (H50: they read as running under the sites)
  for (const q of MOVED) if (q.keep) {
    const a = q.to[0] + q.keep[0], b = q.to[1] + q.keep[1], c = q.to[0] + q.keep[2], d = q.to[1] + q.keep[3];
    for (let y = Math.max(0, b - 14); y < Math.min(H, d + 14); y++) for (let x = Math.max(0, a - 14); x < Math.min(W, c + 14); x++) {
      const i = y * W + x, ox = Math.max(a - x, 0, x - c + 1), oy = Math.max(b - y, 0, y - d + 1);
      if ((ox || oy) && Math.sqrt(ox * ox + oy * oy) >= 6 + 8 * reliefNoise(x, y, 9, 7611)) continue;
      if (m.reserve[i] & 128 && m.dist[i] === D3.DESERT) { m.reserve[i] &= ~128; m.tiles[i] = T.DIRT; }
    }
  }
  return out;
}

// The tracks the moved nature sites look for by name (WILD_TRACKS): from a road a dirt track may join (within 160 tiles;
// never a highway, nor within 14 tiles of one, nor in a tunnel) to the track's end - over dry land, across no highway,
// clear of the main line (10 tiles) and of its box. H50: laid along the land, not straight - the cheapest way on a 2-tile
// grid (trackPath) where a step costs its length, more the steeper it climbs (the land's height before anything is
// built: world3-relief.js landHeight3 - a mountain trail zigzags), several times over snow, round the desert's tables
// (their spots, world3-relief.js tableSpots3: the tables are laid after the roads) and with a little wander; the
// straight way as before when no such way is found (or no land is given).
function wildTracks3(lines, m, hwys, mains, hwyLines, tunnels, L, snowAt) {
  const W = m.w, H = m.h, out = [], ok = ACCESS.dirt, TR = 160;
  const fine = (a, b, avoid) => {
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])));
    for (let j = 0; j <= n; j++) {
      const x = a[0] + (b[0] - a[0]) * (j / n), y = a[1] + (b[1] - a[1]) * (j / n), tx = Math.floor(x), ty = Math.floor(y);
      if (tx < 0 || ty < 0 || tx >= W || ty >= H || !m.land[ty * W + tx] || m.river[ty * W + tx] || m.lake[ty * W + tx]) return false;
      if (avoid && x > avoid[0] - 3 && y > avoid[1] - 3 && x < avoid[2] + 3 && y < avoid[3] + 3) return false;
      if (j % 4 === 0 && mains.some((r) => nearestOnPath(r.path, x, y).d < 10)) return false;
    }
    const A = { x: a[0] * TILE, y: a[1] * TILE }, B = { x: b[0] * TILE, y: b[1] * TILE };
    for (const h of hwyLines) for (let j = 0; j + 1 < h.pts.length; j++) if (segX(A, B, h.pts[j], h.pts[j + 1])) return false;
    return true;
  };
  const zAt = L ? landHeight3(W, H, L) : null, spots = L ? tableSpots3(W, H) : [];
  for (const K of WILD_TRACKS) {
    const [ex, ey] = K.end, starts = [];
    for (const l of lines) {
      if (l.lvl !== 0 || !ok.has(l.kind) || l.foot || (l.culdesac && (l.kind === 'rural' || l.kind === 'dirt'))) continue;
      for (let k = 0; k + 1 < l.pts.length; k++) {
        const a = l.pts[k], b = l.pts[k + 1], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (2 * TILE)));
        for (let j = 0; j < n; j++) {
          const x = (a.x + (b.x - a.x) * (j / n)) / TILE, y = (a.y + (b.y - a.y) * (j / n)) / TILE, d = Math.hypot(x - ex, y - ey);
          if (d > (K.reach || TR)) continue;   // (H51: a track may reach further - reach, tiles)
          const tx = Math.floor(x), ty = Math.floor(y);
          if (tx < 0 || ty < 0 || tx >= W || ty >= H || !m.land[ty * W + tx] || m.river[ty * W + tx]) continue;
          if (hwys.some((h) => nearestOnPath(h.path, x, y).d < 14) || tunnels.some((t) => dPoly(t.pts, x, y) < 12)) continue;
          starts.push({ x, y, d });
        }
      }
    }
    starts.sort((a, b) => a.d - b.d || a.x - b.x || a.y - b.y);
    let way = zAt && starts.length ? trackPath(m, K, starts, zAt, spots, mains, hwyLines, lines, L, snowAt) : null;
    if (!way) {
      const s = starts.slice(0, 120).find((q) => fine([q.x, q.y], K.end, K.avoid));
      if (s) way = { from: s, pts: [[s.x, s.y], [(s.x + ex) / 2, (s.y + ey) / 2], [ex, ey]], straight: true };
    }
    if (!way) { out.push({ name: K.name, missed: true }); continue; }
    let pts = rounded(way.pts.map(([x, y]) => ({ x: x * TILE, y: y * TILE })), (way.straight ? 4 : 3) * TILE, false, 8);
    measure(pts);
    if (!way.straight) pts = evenly(pts, 2 * TILE);   // (a point every 2 tiles: what stands 'part way along' it - the fire lookout, a camp - goes by its length)
    lines.push({ pts, kind: 'dirt', lvl: 0, name: K.name, culdesac: true });
    for (let j = 0; j < pts.length; j++) { const i = Math.floor(pts[j].y / TILE) * W + Math.floor(pts[j].x / TILE); if (i >= 0 && i < W * H) m.reserve[i] |= 32; }
    out.push({ name: K.name, from: [Math.round(way.from.x), Math.round(way.from.y)], to: K.end, len: Math.round(pts[pts.length - 1].s / TILE), straight: Math.round(way.from.d), ...(way.straight && { fallback: true }) });
  }
  return out;
}
// The cheapest way from any of the starts to K.end on a 2-tile grid (A*, 8 neighbours): a step costs its length times
// (1 + (grade / 18%)^2) - the land's grade along it - times 20 over snow (the peaks above the snow line), 8 on a desert
// table's spot (its top, rim and talus), 6 on another road (a track leaves its road and keeps off the others),
// 0.55-1.65 by a slow noise (the wander); never over water (nor within 2 tiles of it), within 4 tiles of a highway or a
// ramp, 10 of the main line, in K.avoid. Its corners simplified (1.2 tiles). Returns { from, pts: [[x, y] tiles] } or
// null.
const TG = 2, TPAD = 40, WANDER = 0.55;
function trackPath(m, K, starts, zAt, spots, mains, hwyLines, lines, L, snowAt) {
  const W = m.w, H = m.h, [ex, ey] = K.end;
  let x0 = ex, y0 = ey, x1 = ex, y1 = ey;
  for (const q of starts) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
  x0 = Math.max(0, Math.floor(x0) - TPAD); y0 = Math.max(0, Math.floor(y0) - TPAD); x1 = Math.min(W, Math.ceil(x1) + TPAD); y1 = Math.min(H, Math.ceil(y1) + TPAD);
  const BW = x1 - x0, BH = y1 - y0, box = [x0, y0, x1, y1], no = new Uint8Array(BW * BH);
  for (const r of mains) stamp(no, box, r.path, 10);
  for (const h of hwyLines) stamp(no, box, { pts: h.pts.map((p) => [p.x / TILE, p.y / TILE]) }, 4);
  const rd = new Uint8Array(BW * BH);
  for (const l of lines) if (l.lvl === 0 && l.kind !== 'hwy' && l.kind !== 'ramp') stamp(rd, box, { pts: l.pts.map((p) => [p.x / TILE, p.y / TILE]) }, 2.5);
  const GW = Math.ceil(BW / TG), GH = Math.ceil(BH / TG), NC = GW * GH;
  const cost = new Float32Array(NC), z = new Float32Array(NC);   // (cost: the step multiplier at a cell, 0 where it can't go)
  for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
    const c = gy * GW + gx, tx = Math.min(x1 - 1, x0 + gx * TG + 1), ty = Math.min(y1 - 1, y0 + gy * TG + 1);
    z[c] = zAt(tx, ty);
    if (no[(ty - y0) * BW + tx - x0]) continue;
    if (K.avoid && tx > K.avoid[0] - 3 && ty > K.avoid[1] - 3 && tx < K.avoid[2] + 3 && ty < K.avoid[3] + 3) continue;
    let wet = false;
    for (let dy = -2; dy <= 2 && !wet; dy++) for (let dx = -2; dx <= 2; dx++) { const x = tx + dx, y = ty + dy; if (x < 0 || y < 0 || x >= W || y >= H) continue; const i = y * W + x; if (!m.land[i] || m.river[i] || m.lake[i] || m.tiles[i] === T.WATER || m.tiles[i] === T.DEEP) { wet = true; break; } }
    if (wet) continue;
    const i = ty * W + tx;
    let k = WANDER + 1.1 * reliefNoise(tx, ty, 28, 7621 + K.end[0]);
    if (snowAt ? snowAt(tx, ty) : m.dist[i] === D3.PEAKS && (L.terrain[i] === TERRAIN3.ROCK || L.terrain[i] === TERRAIN3.SCRUB) && peakHeight(tx, ty) >= SNOW_LINE) k *= 20;   // (the snow: the bare peaks above the snow line - world3-world.js's SNOW_CLS, from the world build)
    if (rd[(ty - y0) * BW + tx - x0]) k *= 6;
    for (const t of spots) if (((tx - t.x) / (t.rx + 18)) ** 2 + ((ty - t.y) / (t.ry + 18)) ** 2 < 1) { k *= 8; break; }
    cost[c] = k;
  }
  const cell = (x, y) => { const gx = Math.floor((x - x0) / TG), gy = Math.floor((y - y0) / TG); return gx < 0 || gy < 0 || gx >= GW || gy >= GH ? -1 : gy * GW + gx; };
  const goal = cell(ex, ey);
  if (goal < 0) return null;
  cost[goal] = cost[goal] || 1;   // (its end is where the site is: reached whatever stands round it)
  const g = new Float32Array(NC).fill(Infinity), from = new Int32Array(NC).fill(-1), src = new Int32Array(NC).fill(-1), shut = new Uint8Array(NC);
  // a binary heap of [f, cell]
  const hf = [], hc = [];
  const push = (f, c) => { let j = hf.length; hf.push(f); hc.push(c); while (j) { const p = (j - 1) >> 1; if (hf[p] <= hf[j]) break; [hf[p], hf[j]] = [hf[j], hf[p]]; [hc[p], hc[j]] = [hc[j], hc[p]]; j = p; } };
  const pop = () => { const c = hc[0], lf = hf.pop(), lc = hc.pop(); if (hf.length) { hf[0] = lf; hc[0] = lc; let j = 0; for (;;) { const a = 2 * j + 1, b = a + 1; let q = j; if (a < hf.length && hf[a] < hf[q]) q = a; if (b < hf.length && hf[b] < hf[q]) q = b; if (q === j) break; [hf[q], hf[j]] = [hf[j], hf[q]]; [hc[q], hc[j]] = [hc[j], hc[q]]; j = q; } } return c; };
  const gxOf = (c) => c % GW, gyOf = (c) => (c / GW) | 0;
  const hEst = (c) => WANDER * TG * Math.hypot(gxOf(c) - gxOf(goal), gyOf(c) - gyOf(goal));
  starts.forEach((q, j) => { const c = cell(q.x, q.y); if (c < 0 || !cost[c] || g[c] <= 0) return; g[c] = 0; src[c] = j; push(hEst(c), c); });
  const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  let found = false;
  while (hf.length) {
    const c = pop();
    if (shut[c]) continue;
    shut[c] = 1;
    if (c === goal) { found = true; break; }
    const cx = gxOf(c), cy = gyOf(c);
    for (const [dx, dy] of NB) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
      const n = ny * GW + nx;
      if (shut[n] || !cost[n]) continue;
      const len = TG * (dx && dy ? 1.4142 : 1), grade = Math.abs(z[n] - z[c]) / len / 0.18;
      const gn = g[c] + len * (1 + grade * grade) * (cost[c] + cost[n]) / 2;
      if (gn < g[n]) { g[n] = gn; from[n] = c; src[n] = src[c]; push(gn + hEst(n), n); }
    }
  }
  if (!found) return null;
  const P = [];
  for (let c = goal; c >= 0; c = from[c]) P.push([x0 + gxOf(c) * TG + 1, y0 + gyOf(c) * TG + 1]);
  P.reverse();
  const s0 = starts[src[goal]];
  P[0] = [s0.x, s0.y]; P[P.length - 1] = [ex, ey];
  return { from: s0, pts: simplify(P, 1.2) };
}
// a measured polyline again with a point every `step` px along it (its first and last kept), measured
function evenly(P, step) {
  const L = P[P.length - 1].s, out = [{ x: P[0].x, y: P[0].y }];
  for (let s = step, k = 1; s < L - step / 2; s += step) {
    while (k < P.length - 1 && P[k].s < s) k++;
    const a = P[k - 1], b = P[k], f = (s - a.s) / ((b.s - a.s) || 1);
    out.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
  }
  out.push({ x: P[P.length - 1].x, y: P[P.length - 1].y });
  measure(out);
  return out;
}
// Douglas-Peucker: the polyline's points within eps (tiles) of the line between the kept ones dropped
function simplify(P, eps) {
  if (P.length < 3) return P;
  const keep = new Uint8Array(P.length); keep[0] = keep[P.length - 1] = 1;
  const st = [[0, P.length - 1]];
  while (st.length) {
    const [a, b] = st.pop();
    let best = -1, bd = eps;
    for (let j = a + 1; j < b; j++) { const d = dPoly([P[a], P[b]], P[j][0], P[j][1]); if (d > bd) { bd = d; best = j; } }
    if (best >= 0) { keep[best] = 1; st.push([a, best], [best, b]); }
  }
  return P.filter((_, j) => keep[j]);
}

// (H51) Dry Creek's farm roads at the farm's offset: the Farm Road down the middle (its head by the orchard), the County
// Road across it and the winery's lane round the vineyard's east side to the road above the winery; the Farm Road's
// south end joined to the nearest road it may meet (rural: never a highway, nor within 14 tiles of one, nor a tunnel) -
// straight, over dry land, across no highway, clear of the main line.
const FARM_ROADS = [
  { name: 'Farm Road', pts: [[1140, 452], [1140, 650]], join: true },
  { name: 'County Road', pts: [[1036, 528], [1140, 528], [1200, 514]] },
  { name: 'Winery Road', pts: [[1140, 452], [1176, 448], [1176, 358], [1100, 358]] },
];
function wildFarmRoads3(lines, m, hwys, mains, hwyLines, tunnels) {
  const W = m.w, H = m.h, out = [], ok = ACCESS.rural, TR = 220;
  const dry = (x, y) => { const tx = Math.floor(x), ty = Math.floor(y); return tx >= 0 && ty >= 0 && tx < W && ty < H && !!m.land[ty * W + tx] && !m.river[ty * W + tx] && !m.lake[ty * W + tx]; };
  const fine = (a, b) => {
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])));
    for (let j = 0; j <= n; j++) {
      const x = a[0] + (b[0] - a[0]) * (j / n), y = a[1] + (b[1] - a[1]) * (j / n);
      if (!dry(x, y)) return false;
      if (j % 4 === 0 && mains.some((r) => nearestOnPath(r.path, x, y).d < 10)) return false;
    }
    const A = { x: a[0] * TILE, y: a[1] * TILE }, B = { x: b[0] * TILE, y: b[1] * TILE };
    for (const h of hwyLines) for (let j = 0; j + 1 < h.pts.length; j++) if (segX(A, B, h.pts[j], h.pts[j + 1])) return false;
    return true;
  };
  for (const R of FARM_ROADS) {
    const P = R.pts.map(([x, y]) => farmAt(x, y));
    if (R.join) {
      const [ex, ey] = P[P.length - 1], starts = [];
      for (const l of lines) {
        if (l.lvl !== 0 || !ok.has(l.kind) || l.foot || l.culdesac) continue;
        for (let k = 0; k + 1 < l.pts.length; k++) {
          const a = l.pts[k], b = l.pts[k + 1], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (2 * TILE)));
          for (let j = 0; j < n; j++) {
            const x = (a.x + (b.x - a.x) * (j / n)) / TILE, y = (a.y + (b.y - a.y) * (j / n)) / TILE, d = Math.hypot(x - ex, y - ey);
            if (d > TR || !dry(x, y)) continue;
            if (hwys.some((h) => nearestOnPath(h.path, x, y).d < 14) || tunnels.some((t) => dPoly(t.pts, x, y) < 12)) continue;
            starts.push({ x, y, d });
          }
        }
      }
      starts.sort((a, b) => a.d - b.d || a.x - b.x || a.y - b.y);
      const s = starts.slice(0, 160).find((q) => fine([ex, ey], [q.x, q.y]));
      if (s) P.push([s.x, s.y]);
      out.push({ name: R.name, joins: s ? [Math.round(s.x), Math.round(s.y)] : null });
    }
    // (over dry land only: a stretch that isn't is left out)
    let run = [];
    const flush = () => { if (run.length > 1) { const pts = rounded(run.map(([x, y]) => ({ x: x * TILE, y: y * TILE })), 10 * TILE, false, 8); measure(pts); lines.push({ pts, kind: 'rural', lvl: 0, name: R.name }); } run = []; };
    for (let k = 0; k < P.length; k++) { if (dry(P[k][0], P[k][1])) run.push(P[k]); else flush(); }
    flush();
  }
  return out;
}

// (H51) Dry Creek's farm in the world build: map.js buildFarm's hook (G: the generator's own pieces - FARM_FIELDS,
// DRY_CREEK_ESTATES, PREFABS, placePrefab, driveway, offTheRoad, roadAhead, roadBeside, estateHouse), before the biomes'
// dressing - what it lays is reserved, so 8.8's fields, farmsteads and trees keep off it. Today's fields at the farm's
// offset on the valley's open ground - no field over a road (two tiles kept), the river, a lake, the main line's room
// or a town (their own districts); the co-op (the farm that takes harvests, its cargo pad), the drop site, the
// farmhouses and cottages for sale by the County Road and the Farm Road, as today's.
export function wildFarm3(m, rand, G) {
  const W = m.w, out = { fields: 0, tiles: 0, rects: [], coop: null, homes: [] };
  const mains = skeletonLines().filter((l) => l.kind === 'main');
  const nearRoad = (x, y, r) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const t = m.tiles[(y + dy) * W + x + dx]; if (t === T.ROAD || t === T.BRIDGE) return true; } return false; };
  for (const [fx0, fy0, fw, fh] of G.FARM_FIELDS) {
    const [fx, fy] = farmAt(fx0, fy0);
    let n = 0;
    for (let y = fy; y < fy + fh; y++) for (let x = fx; x < fx + fw; x++) {
      const i = y * W + x, t = m.tiles[i];
      if (!m.land[i] || m.river[i] || m.lake[i] || m.dist[i] !== FARM.region || m.reserve[i] || (t !== T.GRASS && t !== T.DIRT && t !== T.SAND)) continue;
      if (nearRoad(x, y, 2) || mains.some((r) => nearestOnPath(r.path, x, y).d < WILD_ROOM.main)) continue;
      m.tiles[i] = T.FIELD; m.reserve[i] |= 4; n++;
    }
    if (n > 200) { m.fields.push({ x: fx * TILE, y: fy * TILE, w: fw * TILE, h: fh * TILE }); out.fields++; out.rects.push([fx, fy, fw, fh]); }
    out.tiles += n;
  }
  // the co-op beside the Farm Road, its yard to the west and its drive north to a road (today's, at the offset)
  const pf = G.PREFABS.house2, [cx, cy] = farmAt(1157, 534);
  const at = G.offTheRoad(m, cx, cy, pf.tw + 4, pf.th, (X, Y) => G.roadAhead(m, X + 6, 2, Y - 2, -1), 40);
  if (at) {
    const fx = at[0] + 3, fy = at[1];
    m.fill(fx - 4, fy - 1, pf.tw + 8, pf.th + 2, T.DIRT);
    G.placePrefab(m, { d: m.dist[fy * W + fx], x: fx, y: fy, w: pf.tw, h: pf.th, face: 'N' }, 'house2', fx, { biz: ['farm'], names: ['Dry Creek Farm Co-op'] }, rand);
    G.driveway(m, fx + 3, 2, fy - 2, -1);
    const farm = m.pois.filter((p) => p.kind === 'farm').pop();   // (the co-op's, just placed)
    if (farm) farm.cargoPad = { x: (fx - 2.5) * TILE, y: (fy + 3) * TILE };
    for (let y = fy - 2; y < fy + pf.th + 2; y++) for (let x = fx - 5; x < fx + pf.tw + 5; x++) m.reserve[y * W + x] |= 4;
    out.coop = [fx, fy];
  }
  const [dx, dy] = farmAt(1176, 760);
  m.dropSites.push({ x: dx * TILE, y: dy * TILE, name: 'the Dry Creek boonies' });
  // the farmhouses and cottages, either side of the County Road (a house and the garage beside it, off the roads, with a
  // road ahead of its front for the driveway)
  for (const [type, key, x0, y0, south] of G.DRY_CREEK_ESTATES) {
    const p = G.PREFABS[key], s = p.rot ? south : true, [ex, ey] = farmAt(x0, y0);
    const q = G.offTheRoad(m, ex, ey, p.tw + 3, p.th, (X, Y) => G.roadAhead(m, X, p.tw, s ? Y + p.th : Y - 1, s ? 1 : -1) || G.roadBeside(m, X, Y, p.tw + 3, p.th, s), 40);
    if (!q) continue;
    const [x, y] = q;
    if (m.dist[(y + (p.th >> 1)) * W + x + (p.tw >> 1)] !== FARM.region) continue;
    m.fill(x - 1, y - 1, p.tw + 6, p.th + 2, T.GRASS);
    G.estateHouse(m, rand, type, key, x, y, south, null, x !== ex || y !== ey);
    for (let ty = y - 2; ty < y + p.th + 2; ty++) for (let tx = x - 2; tx < x + p.tw + 6; tx++) m.reserve[ty * W + tx] |= 4;
    out.homes.push([type, x, y]);
  }
  return out;
}

// Once the world is built: what stands on each lot (map.js buildCountryside), the summary for m.world3.wild.
export function wildDone(m, placed) {
  const names = new Set(WILD_SITES.map((P) => P.name));
  const sites = (m.countrySites || []).filter((s) => s.v3 && names.has(s.name));
  return { ...placed, built: sites.map((s) => s.name), quarries: (m.quarries || []).map((q) => q.name || null) };
}
