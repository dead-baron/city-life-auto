// World v3's skeleton (docs/WORLD-V3.md part 4.3 "the skeleton is global, small and made first"; part 9, World v3b):
// the owner's layout of 2026-10-14 (docs/world-v3b/sketch-2026-10-14.png, traced into shared/world3-layout.js) as the
// data the generators build from - the coast and the islands, the biome areas, the rivers and the lakes, the highways,
// the arterials, the main line and its service, the subways, the ferries, the stations, towns and landmarks - and the
// small pure functions that turn it into paths and work out where its lines cross. tools/world3-skeleton.mjs draws
// docs/world-v3b/skeleton.png from it. (WR3's skeleton, parts 1-8, is kept on the branch world-v3-wr3.)
//
// Coordinates are World v3 frame tiles (shared/world3.js: 6552 x 4032, 1 tile = 1 m), integers.
//
// A LINE is { name, pts, tunnels?, bridges?, r? }:
// - `pts` are its control points - for the long lines the points where the straight stretches would meet (a road
//   designer's "points of intersection"), not points on the road: the path runs straight between them and turns each
//   corner on a circular arc of the line's design radius (`r`, else its kind's: RADIUS), cut smaller only where the
//   control points are too close to fit it (linePath() reports each corner's radius).
// - `tunnels` (and `bridges`, where a line names them) are stretches as control-point index pairs [i, j] (i < j): from
//   where the path passes control point i (the middle of its corner's arc, or the point itself at an end) to where it
//   passes j. stretchRanges() turns them into distances along the path. A line's bridges are otherwise found from the
//   land (wetRanges: wherever its path leaves the mainland and the islands, or crosses a lake or a river), so every
//   water crossing is a bridge whatever the control points are.
// Nothing here draws random numbers or uses the transcendental Math functions (CLAUDE.md: the world must come out the same in
// every engine): paths are built with + - * / and Math.sqrt only, and nothing is computed when the module loads but
// plain copies of the layout's arrays.
import { MAINLAND3, ISLANDS3, LAKES3, STREAMS3, GROUND3, HIGHWAYS3, MAIN_LOOP3, SUBWAYS3, FERRIES3 } from './world3-layout.js';

// The design radius (tiles) a kind's curves keep to: highways 250, the main line 300, the subways 120, arterials 50.
export const RADIUS = { hwy: 250, art: 50, main: 300, sub: 120, ferry: 60 };

// ---------------------------------------------------------------------------------------------------------------------
// The land and the water

// The mainland: the owner's one big landmass round the gulf (traced, its rivers filled: they are cut again below).
export const MAINLAND = MAINLAND3;

// The biome areas, painted in this order over the mainland (a later one wins; `polys` is several areas of one biome).
// Willow Valley's meadows are the mainland's own ground (its polygon is MAINLAND): the farm valley north of the mainland
// city and the meadows round the cities - its fields are GROUND3's (shared/world3-land.js paints GROUND3's classes over
// every biome's own). Then Highland Woods (the forest of the north-west and the west and its meadows, north of the
// western city and the marsh), Granite Peaks (the high north-west and the mountains there), the Sandpiper Coast (the
// south-east coast outside the desert: before the desert, so the desert wins where they meet), the Red Rock Desert
// (GROUND3's desert), the Egret Coast (the south-west marsh peninsula) and the Northshore Beaches (the north coast strip).
// The North Ridge (WR3's) has no area here.
const MOUNT_NW = GROUND3.mount.filter((p) => p.every(([x, y]) => x < 2600 && y < 1950));
export const BIOMES = [
  { key: 'valley', name: 'Willow Valley', ground: 'meadows, the farm valley round its lake', poly: MAINLAND },
  { key: 'woods', name: 'Highland Woods', ground: 'redwood and pine forest, meadows',
    poly: [[300, 150], [1200, 150], [2100, 200], [2450, 520], [2560, 760], [2590, 1100], [2600, 1480], [2480, 1600], [2400, 1700], [2330, 1820], [2200, 1880],
      [1900, 1880], [1600, 1890], [1300, 1880], [1050, 1890], [800, 1900], [600, 1930], [420, 1940], [300, 1700], [300, 1000]] },
  { key: 'peaks', name: 'Granite Peaks', ground: 'mountains',
    polys: [[[300, 150], [1200, 150], [2100, 200], [2080, 420], [1800, 470], [1500, 470], [1250, 520], [1000, 560], [760, 600], [560, 640], [420, 720], [300, 760]], ...MOUNT_NW] },
  { key: 'sandpiper', name: 'Sandpiper Coast', ground: 'beaches, surf, meadows',
    poly: [[4280, 1640], [4500, 1660], [4800, 1700], [5200, 1760], [5500, 1850], [5800, 1880], [6100, 1880], [6150, 2300], [6100, 2700], [5900, 2780], [5600, 2860], [5300, 3000],
      [5000, 3000], [4800, 2900], [4700, 2700], [4650, 2400], [4500, 2250], [4300, 2150], [4250, 1900]] },
  { key: 'desert', name: 'Red Rock Desert', ground: 'canyons, mesas, the casino city', poly: GROUND3.desert[0] },
  { key: 'egret', name: 'Egret Coast', ground: 'marsh and dunes',
    poly: [[420, 1940], [700, 1920], [1000, 1900], [1250, 1920], [1400, 2000], [1420, 2150], [1330, 2350], [1280, 2600], [1260, 2800], [1300, 3000], [1420, 3100], [1480, 3200],
      [1450, 3330], [1200, 3400], [900, 3450], [600, 3400], [440, 3200], [420, 2800], [420, 2400]] },
  { key: 'northshore', name: 'Northshore Beaches', ground: 'beach towns along the north coast',
    poly: [[2250, 600], [2450, 560], [2650, 560], [2900, 600], [3100, 500], [3350, 320], [3650, 320], [3860, 450], [3860, 640], [3600, 720], [3300, 760], [3000, 770],
      [2700, 790], [2500, 900], [2250, 910]] },
];

// The islands (ISLANDS3): the gulf's four city islands (the big Gulf Island with downtown, the east island, the
// south-west and the south-east ones), the ferry island (Gull Harbor), the quiet key (Coral Cay), Prison Island, and the
// rocks and islets. No `picture` and no `placement` any more: today's districts are not moved whole - the city generator
// (shared/world3-city.js) lays the city's districts anew on the land.
export const ISLANDS = ISLANDS3.map((I) => ({ key: I.key, name: I.name, box: I.box, poly: I.poly }));
// The container port (Port Westport): the western city's gulf shore, its quay facing east (the city generator lays it
// out; the generator's container yard - shared/world3-passes.js quays - is built on this rectangle of land).
export const PORT_WESTPORT = { name: 'Port Westport (the container port)', rect: [2050, 2150, 2400, 2600], faces: 'east' };
// Today's places on the mainland, moved whole (WR3's Westport and Northshore): none in World v3b.
export const PIECES = [];
// WR3's canal through Metro City: none in World v3b (every use guards it).
export const CANAL = null;

// The rivers and creeks (STREAMS3: centre lines with their widths, tiles), the tiny traced fragments (under 40 tiles)
// left out. RIVER: the navigable river from the farm valley's lake (Kestrel Lake) down through the mainland city to the
// gulf - the lake's outflow and its channel, joined.
export const STREAMS = STREAMS3.filter((s) => {
  let l = 0;
  for (let i = 1; i < s.pts.length; i++) l += Math.sqrt((s.pts[i][0] - s.pts[i - 1][0]) ** 2 + (s.pts[i][1] - s.pts[i - 1][1]) ** 2);
  return l >= 40;
}).map((s, k) => ({ name: `Creek ${k + 1}`, width: s.width, pts: s.pts }));
export const RIVER = { name: 'The Long Reach', width: 46, pts: [[3592, 1178], [3646, 1230], [3736, 1300], [3770, 1316], [3830, 1360], [3880, 1420], [3920, 1500], [3964, 1560], [3964, 1666], [3952, 1708], [3964, 1760], [3958, 1830], [3956, 1900]] };
// The lakes: the farm valley's (Kestrel Lake, its island is shared/world3-water.js's), the downtown park's pond.
export const LAKES = LAKES3.map((l, k) => ({ name: k === 0 ? 'Kestrel Lake' : 'Greenfield Pond', poly: l.poly }));

// ---------------------------------------------------------------------------------------------------------------------
// Highways (orange on the sketch, HIGHWAYS3). Two lanes each way, grade-separated: they cross nothing at grade. The Gulf
// Loop round the mainland city and through the gulf's islands (a closed loop: its first point is its last, the Casino
// Interchange), the West Loop round the western city and the airport, the East Island Link on to the east island, the
// East Highway out to the south-east town, the Casino Highway across the desert and the North Spur to the north coast.
// Every stretch over water is a bridge (wetRanges), the land's.
export const HIGHWAYS = HIGHWAYS3.map((h) => ({ ...h }));
// Where highways meet (every highway end is at one of these).
export const INTERCHANGES = [
  { name: 'Westgate Interchange', at: [2781, 2055], kind: 'trumpet', note: 'the Gulf Loop and the West Loop, north' },
  { name: 'Sunset Interchange', at: [2727, 2887], kind: 'trumpet', note: 'the Gulf Loop and the West Loop, south' },
  { name: 'Bayside Interchange', at: [3657, 2913], kind: 'trumpet', note: 'the Gulf Loop and the East Island Link' },
  { name: 'Lakes Interchange', at: [3967, 2305], kind: 'trumpet', note: 'the Gulf Loop and the East Island Link' },
  { name: 'East Highway Interchange', at: [3967, 2513], kind: 'trumpet', note: 'the East Island Link and the East Highway' },
  { name: 'Casino Interchange', at: [4231, 1561], kind: 'trumpet', note: 'the Gulf Loop and the Casino Highway' },
  { name: 'North Spur Interchange', at: [3015, 1527], kind: 'trumpet', note: 'the Gulf Loop and the North Spur' },
];
// The highways that run off the map end at a closed tunnel mouth: none in World v3b (the land has sea round it).
export const CLOSURES = [];

// ---------------------------------------------------------------------------------------------------------------------
// Arterials (the sketch's light grey roads outside the city areas: tools/world3b/lines.json's `road` chains joined and
// simplified, named; the north-west forest's own by hand) - the county roads through the forest and the north-west,
// round the farm valley, across the desert to the casino city and the desert towns, along the coasts, the marsh's coast
// road, the north coast road - and the city islands' road bridges and footbridges. Inside the city areas the streets are
// the city generator's (shared/world3-city.js): it meets these bridges' ends and the highways' ramps.
export const ARTERIALS = [
  { name: 'Timber Bend Road', pts: [[1225, 1955], [1241, 1891], [1227, 1789], [1255, 1717], [1355, 1661], [1367, 1573], [1393, 1539], [1439, 1519], [1589, 1523], [1643, 1437], [1687, 1411]] },
  { name: 'Marsh Road', pts: [[1411, 2167], [1289, 2181], [1271, 2347], [1171, 2357], [1141, 2449], [925, 2447], [857, 2513]] },
  { name: 'Northwoods Road', pts: [[1823, 1373], [1819, 1245], [1845, 1171], [1919, 1113], [2075, 1067], [2201, 929], [2283, 903]] },
  { name: 'Egret Coast Road', pts: [[1937, 1885], [1837, 1889], [1707, 1963], [1601, 1989], [1331, 1985], [1183, 1957], [1145, 1973], [1073, 2071], [997, 2095], [979, 2141], [857, 2177], [789, 2223], [777, 2465], [855, 2515], [825, 2671], [735, 2757], [749, 2999], [813, 3065], [825, 3151], [871, 3209], [1091, 3221]] },
  { name: 'Gull Harbor Loop', pts: [[1875, 3401], [1835, 3375], [1689, 3373], [1657, 3347], [1545, 3351], [1507, 3405], [1415, 3433], [1407, 3523], [1463, 3585], [1549, 3599], [1923, 3593], [1989, 3557], [1991, 3509], [2159, 3507]] },
  { name: 'North Coast Road', pts: [[2317, 905], [2627, 907], [2825, 771], [2997, 751], [4373, 759], [4525, 819], [4669, 837], [4755, 823], [4899, 743], [5007, 713], [5227, 699], [5401, 717], [5487, 749], [5513, 801]] },
  { name: 'Valley West Road', pts: [[2625, 909], [2617, 1377]] },
  { name: 'Barn Road', pts: [[2993, 1209], [2647, 1209]] },
  { name: 'Willow Road', pts: [[2993, 1413], [2615, 1417], [2379, 1463], [2165, 1465], [2119, 1417], [1993, 1405]] },
  { name: 'Lakeshore Drive', pts: [[3481, 1367], [3487, 1179], [3537, 1177], [3615, 1125], [3619, 795]] },
  { name: 'Valley Parkway', pts: [[3031, 1415], [4131, 1417]] },
  { name: 'Cedar Farms Road', pts: [[3769, 881], [3023, 881]] },
  { name: 'Valley East Road', pts: [[4133, 1369], [4129, 759]] },
  { name: 'Orchard Road', pts: [[4131, 1371], [3025, 1369]] },
  { name: 'Sandpiper Road', pts: [[4235, 1931], [4689, 1929], [4723, 1945], [4745, 2009], [4843, 2041], [4911, 2127], [4971, 2137], [5061, 2107], [5131, 2119]] },
  { name: 'Mesa Road', pts: [[4745, 1119], [4757, 1055], [4843, 973], [4829, 893], [4757, 825]] },
  { name: 'Copper Road', pts: [[4967, 1337], [4841, 1193], [4743, 1161]] },
  { name: 'Sandpiper Bay Road', pts: [[4987, 2517], [5067, 2459], [5067, 2287], [5079, 2235], [5155, 2163], [5133, 2119]] },
  { name: 'Mesa Flats Road', pts: [[5317, 489], [5495, 489], [5499, 541], [5749, 545], [5751, 571]] },
  { name: 'Route 9', pts: [[5147, 1613], [5031, 1657], [4995, 1725], [4891, 1749], [4683, 1695], [4469, 1769], [4255, 1773]] },
  { name: 'Canyon Road', pts: [[5279, 2663], [5265, 2463], [5381, 2455], [5487, 2361], [5683, 2297], [5739, 2229], [5739, 2171], [5709, 2111], [5827, 2019], [5817, 1953], [5751, 1877], [5621, 1871], [5529, 1817], [5517, 1767]] },
  { name: 'Airstrip Road', pts: [[5625, 577], [5619, 931]] },
  { name: 'Red Rock Road', pts: [[5755, 671], [5811, 715], [5857, 795], [5931, 845], [5963, 975], [6013, 1057], [5979, 1153], [5883, 1245], [5881, 1421], [5749, 1457], [5659, 1575], [5543, 1627], [5517, 1767], [5241, 1747], [5191, 1707], [5185, 1527], [5233, 1405], [5309, 1325], [5249, 1271]] },
  { name: 'Copper Gulch Road', pts: [[5585, 827], [5517, 823], [5511, 917], [5369, 911], [5319, 937], [5305, 1107], [5241, 1157], [5181, 1257], [5019, 1305], [4969, 1337], [4865, 1471], [4765, 1501], [4731, 1533], [4545, 1543]] },
  { name: 'Butte Road', pts: [[5521, 957], [5513, 1029], [5533, 1067], [5625, 1121], [5799, 1175], [5881, 1245]] },
  { name: 'Dusty Hollow Road', pts: [[5743, 1461], [5529, 1465], [5351, 1603], [5193, 1613]] },
  { name: 'Coyote Road', pts: [[5707, 2105], [5597, 2037], [5281, 1949], [5195, 1843]] },
  { name: 'Arroyo Road', pts: [[5705, 2111], [5655, 2147], [5539, 2155], [5105, 2001], [5079, 1919]] },
  { name: 'Highland Road', pts: [[1060, 1690], [940, 1560], [960, 1300], [1010, 1150], [1130, 1100], [1300, 1180], [1460, 1250], [1700, 1410]] },
  { name: 'Timber Trail', pts: [[1010, 1150], [900, 950], [890, 770], [1000, 660], [1200, 610], [1400, 650], [1560, 720]] },
  { name: 'Lookout Road', pts: [[1830, 1200], [1890, 1000], [1960, 830], [2060, 760], [2160, 830]] },
  // the islands' road bridges (the sketch's light grey across the channels: several per channel)
  { name: 'Westport Bridge', pts: [[2547, 2321], [2129, 2319]] },
  { name: 'Old Town Bridge', pts: [[2415, 1891], [2645, 1887]] },
  { name: 'Sunset Bridge', pts: [[2681, 2687], [2681, 2905]] },
  { name: 'Midtown Bridge', pts: [[2977, 1973], [2975, 2183]] },
  { name: 'Lake District Bridge', pts: [[3571, 2333], [3951, 2331]] },
  { name: 'Egret Shore Road', pts: [[855, 2515], [825, 2671], [767, 2709], [735, 2757], [755, 2877], [749, 2999], [813, 3065], [825, 3151], [871, 3209], [921, 3221], [1091, 3221]] },
  { name: 'Pine Hills Bridge', pts: [[2979, 2990], [2973, 2777]] },
  { name: 'Civic Bridge', pts: [[3163, 1975], [3161, 2183]] },
  { name: 'Yards Bridge', pts: [[3985, 1905], [3783, 1903]] },
  { name: 'Pelican Bridge', pts: [[4127, 2929], [4135, 2607]] },
  { name: 'Arts Bridge', pts: [[2681, 2241], [2685, 2109]] },
  { name: 'Falls Bridge', pts: [[3947, 2519], [3735, 2523], [3623, 2499]] },
  { name: 'Southside Bridge', pts: [[3459, 2941], [3457, 3137]] },
  { name: 'Bayside Bridge', pts: [[3689, 2723], [3993, 2883]] },
  // footbridges between the islands and the mainland (the owner: "some footbridges")
  { name: 'Harbor Footbridge', foot: true, pts: [[3350, 2020], [3350, 2170]] },
  { name: 'Strand Footbridge', foot: true, pts: [[2860, 2820], [2860, 2950]] },
  { name: 'Lakes Footbridge', foot: true, pts: [[3735, 2560], [3870, 2560]] },
  { name: 'Gulf Footbridge', foot: true, pts: [[2290, 2760], [2475, 2760]] },
];

// ---------------------------------------------------------------------------------------------------------------------
// The main line (MAIN_LOOP3; the owner: "one main train that goes around almost the entire map ... a scenic route"):
// one closed loop, double track (one track each way), one service - the Grand Loop - running both ways. Modelled as the
// main line's graph with one segment from its one junction back to it: the junction (where the loop is closed) is on
// the straight along the north coast, between the layout's points 1 and 2, so its corners are all the line's own.
// Underground through the dense mainland city (`tunnels`, by control point: the layout's 51-55 and 56-58), with its
// one `elevated` stretch (Midtown, the layout's 55-56) on a viaduct above the street grid; at ground level (and on
// bridges over the water) elsewhere. In the city it never crosses a street at grade.
export const MAIN_LINE_TRACKS = 2;   // everywhere, one each way
// The loop's control points (MAIN_LOOP3's, started at the junction; its last is its first).
const MAIN_PTS = [[2700, 738], [3000, 732], [4320, 732], [5200, 712], [5540, 720], [5588, 860], [5360, 1048], [5200, 1320], [5172, 1572], [5020, 1920], [4980, 2000], [5200, 2300], [5240, 2600], [5180, 2740], [5000, 2700], [4800, 2600], [4400, 2580], [4200, 2620], [4140, 2800], [4120, 2960], [4040, 3000], [3840, 2960], [3720, 2880], [3600, 2860], [3320, 2860], [3140, 2752], [2940, 2752], [2890, 2800], [2890, 2960], [2800, 3000], [2720, 3000], [2600, 2980], [2480, 2900], [2280, 2820], [2180, 2820], [1880, 2900], [1760, 2920], [1380, 2920], [1332, 2860], [1320, 2440], [1380, 2380], [1600, 2360], [1640, 2240], [1720, 2120], [1820, 2092], [2020, 2080], [2120, 2020], [2192, 1880], [2220, 1740], [2440, 1760], [2560, 1780], [2760, 1760], [2840, 1640], [2900, 1620], [3200, 1668], [3600, 1660], [3800, 1700], [4000, 1800], [4160, 1860], [4188, 1712], [4188, 1480], [4120, 1392], [3600, 1388], [2880, 1380], [2400, 1380], [2320, 1340], [2312, 1100], [2312, 848], [2400, 744], [2700, 738]];
export const MAIN_JUNCTIONS = [{ name: 'Grand Loop Junction', at: MAIN_PTS[0] }];
export const MAIN_LINE = [
  { name: 'Grand Loop', from: 'Grand Loop Junction', to: 'Grand Loop Junction', r: MAIN_LOOP3.r, pts: MAIN_PTS, tunnels: [[50, 54], [55, 57]], elevated: [[54, 55]] },
];
// The service, both ways, and its stops (MAIN_STATIONS3, in loop order from the junction).
export const SERVICES = [
  { name: 'Grand Loop', note: 'round almost the whole map: the north coast, the casino city, the desert, the south-east, the gulf\'s islands, the western city, the valley',
    run: [['Grand Loop', 1]],
    stops: ['Northshore', 'Lucky Mesa', 'Red Rock', 'Sandpiper Bay', 'Southside', 'Metro Central', 'Sunset Beach', 'Airport', 'Westport Center', 'Old Quarter', 'Midtown', 'Northgate', 'Willow Valley'] },
];

// ---------------------------------------------------------------------------------------------------------------------
// The subways (SUBWAYS3, the owner's pink and yellow lines): two closed loops, each double track (one track each way),
// below ground beneath the land, up on viaducts and bridges where they cross the water (shared/world3-subway.js). The
// Pink Line's stretch beside the Yellow Line under the mainland city is moved 30 tiles east (x 3161), so the two lines'
// tracks run apart there; they meet at Union Square, the interchange.
const PINK_PTS = [[3589, 1645], [3763, 1645], [3867, 1621], [4021, 1635], [4049, 1697], [4049, 1915], [4131, 2005], [3999, 2373], [4023, 2433], [4105, 2499], [4101, 2929], [4077, 2973], [3883, 2985], [3737, 3193], [3549, 3191], [3431, 3145], [3389, 3097], [3369, 2781], [3309, 2719], [2919, 2707], [2889, 2689], [2865, 2639], [2875, 2379], [2917, 2353], [3101, 2353], [3161, 2327], [3161, 1779], [3151, 1649], [3589, 1645]];
export const SUBWAYS = SUBWAYS3.map((s) => ({ name: s.name, color: s.color, loop: true, pts: s.name === 'Pink Line' ? PINK_PTS : s.pts }));

// ---------------------------------------------------------------------------------------------------------------------
// Ferries (FERRIES3; shared/world3-ferries.js finds the routes between the piers, so these are where the piers go):
// the car ferry to the ferry island (its only link), the prison boat, the gulf's water bus loop and the key's.
export const FERRIES = FERRIES3.map((f) => ({ name: f.name, loop: !!f.loop, pts: f.pts }));

// ---------------------------------------------------------------------------------------------------------------------
// Stations (named): `line` is 'main' or a subway's name. The main line's on straight track near the layout's station
// marks (MAIN_STATIONS3); the subways' every 350-600 m along each loop at the districts they serve (part 9.3), with
// Union Square the two lines' interchange.
export const STATIONS = [
  { name: 'Northshore', line: 'main', at: [3020, 732] },
  { name: 'Lucky Mesa', line: 'main', at: [5507, 927] },
  { name: 'Red Rock', line: 'main', at: [5146, 1631] },
  { name: 'Sandpiper Bay', line: 'main', at: [5231, 2532] },
  { name: 'Southside', line: 'main', at: [3972, 2986] },
  { name: 'Metro Central', line: 'main', at: [3051, 2752] },
  { name: 'Sunset Beach', line: 'main', at: [2537, 2938] },
  { name: 'Airport', line: 'main', at: [1330, 2795] },
  { name: 'Westport Center', line: 'main', at: [1872, 2089] },
  { name: 'Old Quarter', line: 'main', at: [2196, 1861] },
  { name: 'Midtown', line: 'main', at: [3248, 1667] },
  { name: 'Northgate', line: 'main', at: [4188, 1668] },
  { name: 'Willow Valley', line: 'main', at: [2876, 1380] },
  { name: 'Stadium District', line: 'Pink Line', at: [3997, 1637] },
  { name: 'The Yards', line: 'Pink Line', at: [4112, 2051] },
  { name: 'Lake District', line: 'Pink Line', at: [4104, 2571] },
  { name: 'Southside', line: 'Pink Line', at: [3968, 2980] },
  { name: 'Pelican Key', line: 'Pink Line', at: [3547, 3188] },
  { name: 'Bayside Heights', line: 'Pink Line', at: [3357, 2773] },
  { name: 'Downtown', line: 'Pink Line', at: [2880, 2671] },
  { name: 'Greenfield Park', line: 'Pink Line', at: [3090, 2353] },
  { name: 'Union Square', line: 'Pink Line', at: [3161, 1880] },
  { name: 'Northgate', line: 'Pink Line', at: [3490, 1646] },
  { name: 'Westport Center', line: 'Yellow Line', at: [1797, 2358] },
  { name: 'Old Quarter', line: 'Yellow Line', at: [2026, 2012] },
  { name: 'Riverside', line: 'Yellow Line', at: [2454, 1870] },
  { name: 'Old Town', line: 'Yellow Line', at: [2847, 1613] },
  { name: 'Union Square', line: 'Yellow Line', at: [3124, 1881] },
  { name: 'The Pink Mile', line: 'Yellow Line', at: [2948, 2257] },
  { name: 'Arts District', line: 'Yellow Line', at: [2555, 2478] },
  { name: 'Pine Hills', line: 'Yellow Line', at: [2821, 2942] },
  { name: 'Pine Hills North', line: 'Yellow Line', at: [2511, 2971] },
  { name: 'Port Westport', line: 'Yellow Line', at: [2086, 2749] },
  { name: 'Westport International', line: 'Yellow Line', at: [1634, 2630] },
];

// Towns (points; today's places where they went, and the new ones) and landmarks.
export const TOWNS = [
  { name: 'Metro City', at: [2150, 2300], today: true }, { name: 'Westport', at: [1420, 2200], today: true },
  { name: 'Northshore', at: [2300, 1720], today: true }, { name: 'Cedar Falls', at: [3150, 2450], today: true },
  { name: 'Southbank', at: [2300, 2620], today: true },
  { name: 'Dry Creek', at: [3700, 1620], today: true }, { name: 'Gull Harbor', at: [1040, 3200], today: true },
  { name: 'Timber Bend', at: [1170, 1060] }, { name: 'Willow Crossing', at: [3360, 1290] },
  { name: 'Lucky Mesa', at: [4600, 420] }, { name: 'Copper Gulch', at: [4560, 1230] },
  { name: 'Dusty Hollow', at: [4250, 1000], note: 'ghost town' }, { name: 'Sandpiper Bay', at: [4480, 2540] },
  { name: 'Route 9', at: [3800, 1520] }, { name: 'Egret Point', at: [850, 2700] },
];
export const LANDMARKS = [
  { name: 'North Cape Light', kind: 'light', at: [300, 900] }, { name: 'Egret Point Light', kind: 'light', at: [905, 3010] },
  { name: 'Sandpiper Point Light', kind: 'light', at: [4440, 2700] }, { name: 'Silver Thread Falls', kind: 'falls', at: [1110, 690] },
  { name: 'Lookout Hill', kind: 'lookout', at: [2600, 410] }, { name: 'Granite Lookout', kind: 'lookout', at: [820, 440] },
  { name: 'Copper Gulch Mine', kind: 'mine', at: [4690, 1180] }, { name: 'Red Rock Dam', kind: 'dam', at: [4130, 610] },
  { name: 'Granite Peaks', kind: 'peak', at: [760, 140] }, { name: 'Redwood campgrounds', kind: 'camp', at: [900, 1500] },
  { name: 'Lakeside campground', kind: 'camp', at: [2050, 520] }, { name: 'Mesa camp', kind: 'camp', at: [4800, 1700] },
  { name: 'Toll plaza and marina (Toll Point)', kind: 'place', at: [3820, 2470] }, { name: 'Westport International', kind: 'airport', at: [1350, 2580] },
  { name: 'Prison', kind: 'prison', at: [4330, 3300] },
];

// ---------------------------------------------------------------------------------------------------------------------
// Paths: straight stretches between the control points, each corner turned on a circular arc.

const STEP = 12;   // arc samples about every STEP tiles

// A line's path: { pts: [[x, y], ...] (the sampled path), s: [...] (distance along it at each point), at: [...] (the
// distance where it passes each control point), corners: [{ i, r }] (each corner's radius), length }.
export function linePath(line, radius) {
  const R = line.r || radius || 0, P = line.pts, n = P.length;
  const out = [[P[0][0], P[0][1]]], at = [0], corners = [];
  // each corner's tangent length at the design radius; where two corners want more of the straight between them than
  // it has, they share it in proportion (so a gentle corner leaves its sharp neighbour the room)
  const seg = [], want = [0];
  for (let i = 0; i < n - 1; i++) seg.push(Math.sqrt((P[i + 1][0] - P[i][0]) ** 2 + (P[i + 1][1] - P[i][1]) ** 2));
  for (let i = 1; i < n - 1; i++) {
    const ux = (P[i][0] - P[i - 1][0]) / seg[i - 1], uy = (P[i][1] - P[i - 1][1]) / seg[i - 1];
    const vx = (P[i + 1][0] - P[i][0]) / seg[i], vy = (P[i + 1][1] - P[i][1]) / seg[i];
    const cross = ux * vy - uy * vx, dot = ux * vx + uy * vy;
    want.push(Math.abs(cross) < 1e-9 && dot > 0 ? 0 : R * Math.abs(cross) / (1 + dot));
  }
  want.push(0);
  const share = (i, j, L) => (want[i] + want[j] > L ? L * want[i] / (want[i] + want[j]) : want[i]);
  for (let i = 1; i < n - 1; i++) {
    const A = P[i - 1], B = P[i], C = P[i + 1];
    let ux = B[0] - A[0], uy = B[1] - A[1], vx = C[0] - B[0], vy = C[1] - B[1];
    const lu = seg[i - 1], lv = seg[i];
    ux /= lu; uy /= lu; vx /= lv; vy /= lv;
    const cross = ux * vy - uy * vx, dot = ux * vx + uy * vy;
    if (R <= 0 || want[i] === 0) { at.push(out.length); out.push([B[0], B[1]]); continue; }
    const tanHalf = Math.abs(cross) / (1 + dot);
    const t = Math.min(share(i, i - 1, lu), share(i, i + 1, lv)), r = t / tanHalf;
    const t1x = B[0] - ux * t, t1y = B[1] - uy * t, t2x = B[0] + vx * t, t2y = B[1] + vy * t;
    const sg = cross > 0 ? 1 : -1, cx = t1x - uy * r * sg, cy = t1y + ux * r * sg;
    const ax = (t1x - cx) / r, ay = (t1y - cy) / r, bx = (t2x - cx) / r, by = (t2y - cy) / r;
    const k = Math.max(4, Math.ceil(2 * t / STEP)), mid = k >> 1;
    for (let j = 0; j <= k; j++) {
      const w = j / k, px = ax * (1 - w) + bx * w, py = ay * (1 - w) + by * w, l = Math.sqrt(px * px + py * py);
      if (j === mid) at.push(out.length);
      out.push([cx + r * px / l, cy + r * py / l]);
    }
    corners.push({ i, r });
  }
  at.push(out.length);
  out.push([P[n - 1][0], P[n - 1][1]]);
  const s = [0];
  for (let j = 1; j < out.length; j++) s.push(s[j - 1] + Math.sqrt((out[j][0] - out[j - 1][0]) ** 2 + (out[j][1] - out[j - 1][1]) ** 2));
  return { pts: out, s, at: at.map((j) => s[j]), corners, length: s[s.length - 1] };
}

// A line's tunnel or bridge stretches as distance ranges [s0, s1] along its path.
export const stretchRanges = (path, stretches) => (stretches || []).map(([i, j]) => [path.at[i], path.at[j]]);
export const inRanges = (ranges, s, pad = 0) => ranges.some(([a, b]) => s >= a - pad && s <= b + pad);

// The point at distance s along a path.
export function pointAt(path, s) {
  const S = path.s, P = path.pts;
  if (s <= 0) return P[0].slice();
  if (s >= path.length) return P[P.length - 1].slice();
  let lo = 0, hi = S.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] <= s) lo = m; else hi = m; }
  const w = (s - S[lo]) / (S[hi] - S[lo] || 1);
  return [P[lo][0] + (P[hi][0] - P[lo][0]) * w, P[lo][1] + (P[hi][1] - P[lo][1]) * w];
}

// The nearest point of a path to (x, y): { d, s } (distance to it, and where along the path it is).
export function nearestOnPath(path, x, y) {
  let best = Infinity, bs = 0;
  const P = path.pts, S = path.s;
  for (let j = 1; j < P.length; j++) {
    const ax = P[j - 1][0], ay = P[j - 1][1], dx = P[j][0] - ax, dy = P[j][1] - ay, L2 = dx * dx + dy * dy;
    let w = L2 ? ((x - ax) * dx + (y - ay) * dy) / L2 : 0;
    w = w < 0 ? 0 : w > 1 ? 1 : w;
    const qx = ax + dx * w - x, qy = ay + dy * w - y, d = qx * qx + qy * qy;
    if (d < best) { best = d; bs = S[j - 1] + (S[j] - S[j - 1]) * w; }
  }
  return { d: Math.sqrt(best), s: bs };
}

// The smallest radius along a path, measured on its points (the circle through each three in a row).
export function minRadius(path) {
  const P = path.pts;
  let min = Infinity, where = null;
  for (let j = 1; j < P.length - 1; j++) {
    const [ax, ay] = P[j - 1], [bx, by] = P[j], [cx, cy] = P[j + 1];
    const a = Math.sqrt((bx - cx) ** 2 + (by - cy) ** 2), b = Math.sqrt((ax - cx) ** 2 + (ay - cy) ** 2), c = Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
    const area2 = Math.abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
    if (area2 < 1e-6 || a < 0.5 || c < 0.5) continue;
    const R = (a * b * c) / (2 * area2);
    if (R < min) { min = R; where = [Math.round(bx), Math.round(by)]; }
  }
  return { r: min, at: where };
}

// ---------------------------------------------------------------------------------------------------------------------
// The skeleton's lines in one list, each with its kind and its path (built on call, never at load). A line's bridges
// are its own `bridges` where it names them, else the stretches of its path over water (wetRanges).
export function skeletonLines() {
  const out = [];
  const add = (kind, line, extra) => {
    const path = linePath(line, RADIUS[kind]);
    const bridges = line.bridges ? stretchRanges(path, line.bridges) : kind === 'ferry' ? [] : wetRanges(path);
    out.push({ kind, name: line.name, line, path, tunnels: stretchRanges(path, line.tunnels), bridges, ...extra });
  };
  for (const l of HIGHWAYS) add('hwy', l);
  for (const l of ARTERIALS) add('art', l);
  for (const l of MAIN_LINE) add('main', l);
  for (const l of SUBWAYS) add('sub', l);
  for (const l of FERRIES) add('ferry', l);
  return out;
}

// In the canal (WR3's: World v3b has none).
export const inCanal = () => false;

// Is (x, y) land by the skeleton (the mainland and the islands, less the lakes, the river and the streams)? The
// islands and the lakes are tested within their boxes first; the river and the streams by their centre lines.
let wetIndex = null;
function wetData() {
  if (wetIndex) return wetIndex;
  const box = (poly) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of poly) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; } return [x0, y0, x1, y1]; };
  const isles = ISLANDS.map((I) => ({ poly: I.poly, box: box(I.poly) }));
  const lakes = LAKES.map((L) => ({ poly: L.poly, box: box(L.poly) }));
  const rivers = [RIVER, ...STREAMS].filter(Boolean).map((r) => ({ hw: r.width / 2, pts: r.pts, box: box(r.pts).map((v, k) => v + (k < 2 ? -r.width : r.width)) }));
  return (wetIndex = { main: MAINLAND, mainBox: box(MAINLAND), isles, lakes, rivers });
}
const inBox = (b, x, y) => x >= b[0] && y >= b[1] && x <= b[2] && y <= b[3];
export function landAt(x, y) {
  const D = wetData();
  let land = inBox(D.mainBox, x, y) && inPoly(D.main, x, y);
  if (!land) for (const I of D.isles) if (inBox(I.box, x, y) && inPoly(I.poly, x, y)) { land = true; break; }
  if (!land) return false;
  for (const L of D.lakes) if (inBox(L.box, x, y) && inPoly(L.poly, x, y)) return false;
  for (const R of D.rivers) {
    if (!inBox(R.box, x, y)) continue;
    for (let j = 1; j < R.pts.length; j++) {
      const [ax, ay] = R.pts[j - 1], dx = R.pts[j][0] - ax, dy = R.pts[j][1] - ay, L2 = dx * dx + dy * dy;
      let w = L2 ? ((x - ax) * dx + (y - ay) * dy) / L2 : 0;
      w = w < 0 ? 0 : w > 1 ? 1 : w;
      const qx = ax + dx * w - x, qy = ay + dy * w - y;
      if (qx * qx + qy * qy < R.hw * R.hw) return false;
    }
  }
  return true;
}
// The stretches of a path over water (distance ranges along it): sampled every 4 tiles, each run of wet samples one
// stretch from the last dry sample before it to the first after it (so a bridge reaches the banks).
export function wetRanges(path, step = 4) {
  const out = [];
  let start = -1, lastDry = 0;
  for (let s = 0; s <= path.length + step - 1; s += step) {
    const t = Math.min(s, path.length), [x, y] = pointAt(path, t), wet = !landAt(x, y);
    if (wet && start < 0) start = lastDry;
    if (!wet) { if (start >= 0) { out.push([start, t]); start = -1; } lastDry = t; }
    if (t >= path.length) break;
  }
  if (start >= 0) out.push([start, path.length]);
  return out;
}

// Point in polygon (even-odd).
export function inPoly(poly, x, y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const nearTown = (x, y, d) => TOWNS.some((t) => (t.at[0] - x) ** 2 + (t.at[1] - y) ** 2 <= d * d);

// ---------------------------------------------------------------------------------------------------------------------
// Every place two lines cross, worked out from the data, each with its kind by rule (ruling 1, 2): highway x highway an
// interchange where they meet at a named one, else a flyover; highway x arterial an overpass (an interchange at a
// town); highway x rail a bridge; arterial x rail a level crossing (a bridge in towns); arterial x arterial an
// intersection; rail x rail a flyover. Nothing where either is in a tunnel there. Where a line ends on another (a road
// joining a road, a branch line at its junction) that's a junction, not a crossing - gathered into `junctions` (nodes).
// Subways are grade-separated wherever they're out of their tunnels (a viaduct passes over); ferries cross nothing.
const RAIL = { main: 1, sub: 1 };
export function crossingKind(ka, kb, x, y) {
  const [a, b] = [ka, kb].sort((p, q) => ORDER[p] - ORDER[q]);
  const town = nearTown(x, y, 260) || GROUND3.city.some((p) => inPoly(p, x, y));   // (World v3b: in the city areas the rail crosses streets by bridge)
  if (a === 'hwy' && b === 'hwy') return INTERCHANGES.some((ic) => Math.abs(ic.at[0] - x) + Math.abs(ic.at[1] - y) < 40) ? 'interchange' : 'flyover';
  if (a === 'hwy' && b === 'art') return town ? 'interchange' : 'overpass';
  if (a === 'hwy' && RAIL[b]) return 'bridge';
  if (a === 'art' && b === 'art') return 'intersection';
  if (a === 'art' && b === 'main') return town ? 'bridge' : 'level crossing';
  if (a === 'art' && b === 'sub') return 'bridge';
  return 'flyover';   // rail x rail
}
const ORDER = { hwy: 0, art: 1, main: 2, sub: 3, ferry: 4 };

function segX(ax, ay, bx, by, cx, cy, dx, dy) {
  const rx = bx - ax, ry = by - ay, sx = dx - cx, sy = dy - cy, den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((cx - ax) * sy - (cy - ay) * sx) / den, u = ((cx - ax) * ry - (cy - ay) * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [t, u] : null;
}

export function skeletonCrossings(lines = skeletonLines()) {
  const CELL = 128, grid = new Map(), segs = [];
  lines.forEach((L, li) => {
    if (L.kind === 'ferry') return;
    const P = L.path.pts;
    for (let j = 1; j < P.length; j++) {
      const id = segs.length;
      segs.push([li, j]);
      const x0 = Math.floor(Math.min(P[j - 1][0], P[j][0]) / CELL), x1 = Math.floor(Math.max(P[j - 1][0], P[j][0]) / CELL);
      const y0 = Math.floor(Math.min(P[j - 1][1], P[j][1]) / CELL), y1 = Math.floor(Math.max(P[j - 1][1], P[j][1]) / CELL);
      for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) {
        const k = gy * 1000 + gx;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(id);
      }
    }
  });
  const raw = [], seen = new Set();
  for (const ids of grid.values()) {
    for (let p = 0; p < ids.length; p++) for (let q = p + 1; q < ids.length; q++) {
      const [la, ja] = segs[ids[p]], [lb, jb] = segs[ids[q]];
      if (la === lb) continue;
      const key = ids[p] < ids[q] ? ids[p] * 1e6 + ids[q] : ids[q] * 1e6 + ids[p];
      if (seen.has(key)) continue;
      seen.add(key);
      const A = lines[la].path, B = lines[lb].path;
      const h = segX(A.pts[ja - 1][0], A.pts[ja - 1][1], A.pts[ja][0], A.pts[ja][1], B.pts[jb - 1][0], B.pts[jb - 1][1], B.pts[jb][0], B.pts[jb][1]);
      if (!h) continue;
      const sa = A.s[ja - 1] + (A.s[ja] - A.s[ja - 1]) * h[0], sb = B.s[jb - 1] + (B.s[jb] - B.s[jb - 1]) * h[1];
      raw.push({ a: la, b: lb, sa, sb, x: A.pts[ja - 1][0] + (A.pts[ja][0] - A.pts[ja - 1][0]) * h[0], y: A.pts[ja - 1][1] + (A.pts[ja][1] - A.pts[ja - 1][1]) * h[0] });
    }
  }
  // one crossing per pair of lines per place (a path can touch another twice within a few tiles at a shared point);
  // where a line ends ON the other (a T: a road joining a road, a branch at its junction) it's a junction, below
  raw.sort((p, q) => p.a - q.a || p.b - q.b || p.sa - q.sa);
  const crossings = [];
  const END = 30, ON = 8;
  const endOn = (L, s, M) => {
    if (s >= END && s <= L.path.length - END) return false;
    const e = s < END ? L.path.pts[0] : L.path.pts[L.path.pts.length - 1];
    return family(L.kind) === family(M.kind) && nearestOnPath(M.path, e[0], e[1]).d <= ON;
  };
  for (const c of raw) {
    if (crossings.some((o) => ((o.ai === c.a && o.bi === c.b) || (o.ai === c.b && o.bi === c.a)) && Math.abs(o.x - c.x) + Math.abs(o.y - c.y) < 60)) continue;
    const A = lines[c.a], B = lines[c.b];
    if (endOn(A, c.sa, B) || endOn(B, c.sb, A)) continue;
    const rec = { ai: c.a, bi: c.b, a: A.name, b: B.name, ka: A.kind, kb: B.kind, x: Math.round(c.x), y: Math.round(c.y) };
    if (inRanges(A.tunnels, c.sa, 4) || inRanges(B.tunnels, c.sb, 4)) { rec.kind = 'none (tunnel)'; rec.skip = true; crossings.push(rec); continue; }
    rec.kind = crossingKind(A.kind, B.kind, c.x, c.y);
    crossings.push(rec);
  }
  // the junctions: every place a line ends on another of its family (roads on roads, rail on rail), gathered into
  // nodes (a crossroads of four arterials at a town is one node). Kind: an interchange where a highway is one of them,
  // an intersection of arterials, a rail junction.
  const nodes = [];
  for (const A of lines) {
    if (A.kind === 'ferry') continue;
    for (const end of [A.path.pts[0], A.path.pts[A.path.pts.length - 1]]) {
      for (const B of lines) {
        if (B === A || family(B.kind) !== family(A.kind) || nearestOnPath(B.path, end[0], end[1]).d > ON) continue;
        let n = nodes.find((o) => Math.abs(o.x - end[0]) + Math.abs(o.y - end[1]) < 40);
        if (!n) nodes.push(n = { x: Math.round(end[0]), y: Math.round(end[1]), lines: [], kinds: [] });
        for (const L of [A, B]) if (!n.lines.includes(L.name)) { n.lines.push(L.name); n.kinds.push(L.kind); }
      }
    }
  }
  for (const n of nodes) n.kind = n.kinds.includes('hwy') ? 'interchange' : n.kinds.includes('art') ? 'intersection' : 'junction';
  return { crossings: crossings.filter((c) => !c.skip).map(strip), tunnelled: crossings.filter((c) => c.skip).map(strip), junctions: nodes.map(({ kinds, ...r }) => r) };
}
const family = (k) => (k === 'hwy' || k === 'art' ? 'road' : k);
const strip = ({ ai, bi, skip, ...r }) => r;

// The numbers: km of each kind, tunnels and bridges (count, km), stations, crossings by kind.
export function skeletonSummary(lines = skeletonLines(), cx = skeletonCrossings(lines)) {
  const km = (v) => Math.round(v / 10) / 100;
  const out = { km: {}, tunnels: {}, bridges: {}, stations: {}, crossings: {}, junctions: {} };
  for (const L of lines) {
    out.km[L.kind] = (out.km[L.kind] || 0) + L.path.length;
    for (const [key, list] of [['tunnels', L.tunnels], ['bridges', L.bridges]]) {
      const o = out[key][L.kind] || (out[key][L.kind] = { count: 0, km: 0 });
      for (const [a, b] of list) { o.count++; o.km += b - a; }
    }
  }
  for (const k in out.km) out.km[k] = km(out.km[k]);
  for (const key of ['tunnels', 'bridges']) for (const k in out[key]) out[key][k].km = km(out[key][k].km);
  for (const s of STATIONS) out.stations[s.line] = (out.stations[s.line] || 0) + 1;
  for (const c of cx.crossings) out.crossings[c.kind] = (out.crossings[c.kind] || 0) + 1;
  out.crossings['none (one is in a tunnel)'] = cx.tunnelled.length;
  for (const c of cx.junctions) out.junctions[c.kind] = (out.junctions[c.kind] || 0) + 1;
  return out;
}

// The whole skeleton as plain JSON-able data (the picture's input; tools/world3-skeleton.mjs writes it).
export function skeletonData() {
  const lines = skeletonLines();
  const cx = skeletonCrossings(lines);
  const round = (pts) => pts.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
  return {
    frame: [6552, 4032], radius: RADIUS, mainTracks: MAIN_LINE_TRACKS, mainland: MAINLAND, biomes: BIOMES, islands: ISLANDS, port: PORT_WESTPORT, pieces: PIECES, canal: CANAL,
    river: RIVER, streams: STREAMS, lakes: LAKES, interchanges: INTERCHANGES, closures: CLOSURES,
    junctions: MAIN_JUNCTIONS, services: SERVICES, stations: STATIONS, towns: TOWNS, landmarks: LANDMARKS,
    lines: lines.map((L) => ({ kind: L.kind, name: L.name, ctrl: L.line.pts, path: round(L.path.pts), length: Math.round(L.path.length),
      tunnels: L.tunnels.map(([a, b]) => [Math.round(a), Math.round(b)]), bridges: L.bridges.map(([a, b]) => [Math.round(a), Math.round(b)]),
      minRadius: Math.round(minRadius(L.path).r), mayBeTunnel: !!L.line.mayBeTunnel, color: L.line.color || null, foot: !!L.line.foot, lift: !!L.line.lift })),
    crossings: cx.crossings, tunnelled: cx.tunnelled, junctionNodes: cx.junctions, summary: skeletonSummary(lines, cx),
  };
}
