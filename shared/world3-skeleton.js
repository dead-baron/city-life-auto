// World v3's skeleton (docs/WORLD-V3.md part 4.3 "the skeleton is global, small and made first"; part 6): the owner's
// marked-up layout (docs/world-v3-markup-2026-10-10.png, with the rulings of part 5) as data - the coast and the
// islands, the biome areas, the river and the lakes, the highways, the arterials, the main line and its services, the
// subways, the ferries, the stations, towns and landmarks - and the small pure functions that turn it into paths and
// work out where its lines cross. Nothing live imports it yet: the region generators will build from it, and
// tools/world3-skeleton.mjs draws docs/world-v3-layout-v2.png from it.
//
// Coordinates are World v3 frame tiles (shared/world3.js: 5040 x 4032, 1 tile = 1 m), integers.
//
// A LINE is { name, pts, tunnels?, bridges?, r? }:
// - `pts` are its control points - for the long lines the points where the straight stretches would meet (a road
//   designer's "points of intersection"), not points on the road: the path runs straight between them and turns each
//   corner on a circular arc of the line's design radius (`r`, else its kind's: RADIUS), cut smaller only where the
//   control points are too close to fit it (linePath() reports each corner's radius; the tests hold every line to its
//   kind's radius).
// - `tunnels` and `bridges` are stretches as control-point index pairs [i, j] (i < j): from where the path passes
//   control point i (the middle of its corner's arc, or the point itself at an end) to where it passes j. So a
//   stretch survives moving a point, and a tunnel mouth is simply a control point. stretchRanges() turns them into
//   distances along the path.
// Nothing here draws random numbers or uses the transcendental Math functions (CLAUDE.md: the world must come out the same in
// every engine): paths are built with + - * / and Math.sqrt only, and nothing is computed when the module loads.

// The design radius (tiles) a kind's curves keep to: highways 250, the main line 300, the subways 120, arterials 50.
export const RADIUS = { hwy: 250, art: 50, main: 300, sub: 120, ferry: 60 };

// ---------------------------------------------------------------------------------------------------------------------
// The land and the water

// The mainland round three sides of the gulf: north, with an arm down the west (Highland Woods, Westport - joined on, the
// owner 12:52: "Westport actually stretches in and connects to the mainland" - and the Egret Coast beyond the West
// Channel) and one down the east (the Sandpiper Coast, with Toll Point's headland reaching out towards Cedar Isle).
// Traced from the land drawn at 1 tile and simplified to within 4 tiles (scratchpad/urban/gulfland.py).
export const MAINLAND = [
  [0, 0], [0, 760], [131, 821], [250, 980], [330, 1179], [290, 1417], [360, 1639], [330, 1901],
  [470, 2329], [520, 2561], [589, 2778], [702, 2961], [791, 2992], [901, 3040], [979, 3001], [1039, 2902],
  [1080, 2692], [1099, 2407], [1110, 2049], [1189, 2050], [1189, 2400], [1327, 2407], [1343, 2386], [1379, 2385],
  [1388, 2401], [1409, 2418], [1415, 2435], [1440, 2449], [1446, 2467], [1474, 2478], [1484, 2497], [1505, 2512],
  [1513, 2533], [1528, 2547], [1515, 2574], [1562, 2626], [1599, 2700], [1566, 2790], [1461, 2839], [1339, 2831],
  [1284, 2816], [1270, 2845], [1330, 2878], [1481, 2885], [1615, 2825], [1665, 2699], [1640, 2600], [1574, 2547],
  [1586, 2527], [1573, 2509], [1575, 2471], [1601, 2450], [1614, 2411], [1627, 2404], [1629, 2386], [1642, 2377],
  [1663, 2345], [1659, 2322], [1670, 2309], [1664, 2293], [1650, 2285], [1650, 2272], [1676, 2246], [1674, 2224],
  [1681, 2221], [1681, 2205], [1667, 2203], [1663, 2180], [1644, 2175], [1637, 2167], [1637, 2154], [1650, 2143],
  [1649, 2127], [1664, 2113], [1664, 2011], [1655, 1993], [1700, 1990], [1746, 1889], [1760, 1889], [1762, 1899],
  [1906, 1879], [2145, 1858], [2388, 1848], [2858, 1854], [3421, 1880], [3443, 1891], [3602, 1922], [3690, 1990],
  [3750, 2110], [3760, 2302], [3735, 2431], [3760, 2520], [3880, 2600], [4062, 2620], [4217, 2649], [4379, 2720],
  [4520, 2700], [4881, 2419], [5039, 2330], [5039, 0],
];

// The biome areas, painted in this order over the mainland (a later one wins): Highland Woods is the mainland's own
// ground, so it has no polygon of its own beyond MAINLAND. The North Ridge is the raised ground along the north edge
// that the North Highway tunnels under (ruling 1).
export const BIOMES = [
  { key: 'woods', name: 'Highland Woods', ground: 'redwood and pine forest', poly: MAINLAND },
  { key: 'peaks', name: 'Granite Peaks', ground: 'mountains', poly: [[0, 0], [2350, 0], [2300, 220], [2050, 420], [1700, 560], [1250, 700], [800, 720], [420, 640], [150, 700], [0, 760]] },
  { key: 'valley', name: 'Willow Valley', ground: 'farmland, Kestrel Lake', poly: [[2150, 300], [2550, 260], [3000, 240], [3480, 260], [3620, 520], [3640, 900], [3620, 1350], [3560, 1700], [3400, 1800], [3000, 1720], [2650, 1580], [2250, 1500], [1980, 1300], [1950, 900], [2020, 560]] },
  { key: 'desert', name: 'Red Rock Desert', ground: 'canyons, mesas, the casino city', poly: [[3480, 0], [5040, 0], [5040, 2200], [4700, 2160], [4300, 2050], [3980, 1900], [3800, 1700], [3700, 1350], [3700, 900], [3640, 520], [3500, 260]] },
  { key: 'ridge', name: 'North Ridge', ground: 'a raised ridge of rock and scrub along the north edge', poly: [[2180, 0], [4200, 0], [4150, 70], [3900, 110], [3500, 120], [3100, 110], [2700, 100], [2400, 90]] },
  { key: 'sandpiper', name: 'Sandpiper Coast', ground: 'beaches, surf', poly: [[3820, 2080], [3980, 1900], [4300, 2050], [4700, 2160], [5040, 2200], [5040, 2330], [4880, 2420], [4700, 2560], [4520, 2700], [4380, 2720], [4220, 2620], [4060, 2470], [3930, 2280]] },
  { key: 'egret', name: 'Egret Coast', ground: 'marsh and dunes', poly: [[470, 2330], [560, 2250], [760, 2300], [960, 2400], [1095, 2400], [1080, 2700], [1040, 2900], [979, 3001], [901, 3040], [791, 2992], [702, 2961], [589, 2778], [520, 2561]] },
  // Northshore (the owner, 12:50: "less dense"): today's town at today's density, run on along the coast as beach towns
  // between the Coast Highway (moved behind them) and the water
  { key: 'northshore', name: 'Northshore', ground: 'beach towns along the gulf', poly: [[1760, 1890], [1760, 1600], [2000, 1590], [2700, 1585], [3050, 1600], [3300, 1640], [3330, 1878], [3150, 1868], [2900, 1855], [2650, 1852], [2400, 1848], [2150, 1858], [1900, 1872]] },
];

// The islands. The gulf's (the owner, 12:44-12:52: "a little bit bigger and get them closer and still tuck the airport
// away"): today's places scaled by 1.15 (about 1.3x the area; Metro City also gets a designed east shore where today's
// map cuts it straight at Dry Creek), 200-260 m from their neighbours - to be built new at that size, not moved whole:
// `poly` is the land, `picture` where today's look comes from (today's districts, top-left in the frame, the scale).
// The rest are today's, placed whole (shared/world3.js PLACEMENTS: frame tile = today's tile + offset), and new ones.
export const ISLANDS = [
  { key: 'metro', name: 'Metro City + Southbank', canal: true, picture: { ids: [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 16, 17, 18, 46], at: [1850, 2050], scale: 1.15, from: [559, 301, 1045, 947] },
    poly: [
    [1895, 2237], [1893, 2258], [1865, 2293], [1859, 2330], [1850, 2336], [1850, 2366], [1902, 2410], [1922, 2414],
    [1936, 2441], [1937, 2482], [1959, 2496], [1966, 2511], [1981, 2515], [1982, 2544], [1988, 2549], [2018, 2555],
    [2067, 2552], [2088, 2536], [2105, 2501], [2129, 2484], [2162, 2490], [2179, 2478], [2200, 2479], [2218, 2465],
    [2275, 2457], [2299, 2402], [2334, 2374], [2337, 2362], [2378, 2365], [2378, 2374], [2366, 2382], [2362, 2393],
    [2314, 2398], [2305, 2416], [2299, 2458], [2285, 2477], [2248, 2476], [2223, 2482], [2204, 2499], [2179, 2496],
    [2165, 2504], [2129, 2505], [2102, 2557], [2101, 2579], [2120, 2608], [2143, 2616], [2169, 2636], [2246, 2640],
    [2290, 2669], [2297, 2686], [2325, 2690], [2328, 2703], [2339, 2707], [2338, 2719], [2345, 2728], [2377, 2724],
    [2387, 2734], [2379, 2761], [2388, 2772], [2390, 2800], [2406, 2800], [2426, 2780], [2452, 2662], [2492, 2384],
    [2480, 2229], [2451, 2113], [2410, 2065], [2408, 2050], [2392, 2050], [2362, 2073], [2300, 2074], [2278, 2081],
    [2255, 2101], [2242, 2103], [2229, 2124], [2195, 2131], [2180, 2141], [2138, 2136], [2115, 2154], [2095, 2160],
    [2082, 2191], [2071, 2198], [2011, 2188], [1974, 2217], [1936, 2229], [1912, 2223],
  ] },
  { key: 'cedar', name: 'Cedar Isle', picture: { ids: [35, 36, 37, 38, 40], at: [2670, 2210], scale: 1.15, from: [270, 784, 991, 1158] },
    poly: [
    [2670, 2483], [2670, 2504], [2678, 2508], [2680, 2518], [2701, 2523], [2708, 2532], [2709, 2569], [2736, 2588],
    [2761, 2588], [2779, 2571], [2798, 2579], [2851, 2579], [2855, 2563], [2868, 2561], [2872, 2590], [2884, 2598],
    [2891, 2592], [2892, 2570], [2908, 2571], [2929, 2558], [2933, 2544], [2955, 2545], [2969, 2527], [2988, 2526],
    [2997, 2511], [3016, 2507], [3017, 2540], [3024, 2548], [3045, 2554], [3089, 2607], [3106, 2611], [3115, 2622],
    [3166, 2614], [3202, 2634], [3216, 2632], [3252, 2603], [3274, 2601], [3304, 2603], [3341, 2621], [3357, 2611],
    [3369, 2611], [3395, 2623], [3401, 2639], [3421, 2639], [3427, 2621], [3446, 2605], [3449, 2589], [3476, 2584],
    [3487, 2563], [3498, 2558], [3498, 2537], [3482, 2529], [3476, 2514], [3482, 2487], [3466, 2459], [3474, 2415],
    [3483, 2409], [3483, 2399], [3456, 2396], [3447, 2386], [3443, 2362], [3409, 2348], [3385, 2320], [3339, 2312],
    [3320, 2286], [3276, 2286], [3247, 2263], [3238, 2266], [3235, 2278], [3221, 2281], [3197, 2268], [3196, 2245],
    [3174, 2232], [3132, 2231], [3107, 2238], [3088, 2228], [3067, 2234], [3048, 2227], [3033, 2210], [3011, 2210],
    [2991, 2235], [2960, 2240], [2941, 2234], [2918, 2239], [2902, 2253], [2882, 2250], [2849, 2264], [2835, 2287],
    [2817, 2293], [2796, 2319], [2770, 2324], [2761, 2309], [2746, 2311], [2748, 2336], [2729, 2351], [2730, 2374],
    [2703, 2397], [2688, 2432], [2690, 2450], [2677, 2464], [2676, 2481],
  ] },
  { key: 'airport', name: 'Westport International (tucked into the cove under Westport)', picture: { ids: [27], at: [1250, 2480], scale: 0.65, from: [68, 614, 390, 917] },
    poly: [
    [1272, 2487], [1270, 2497], [1250, 2512], [1250, 2519], [1260, 2520], [1250, 2538], [1281, 2543], [1281, 2580],
    [1273, 2584], [1280, 2597], [1273, 2604], [1286, 2606], [1292, 2622], [1305, 2629], [1312, 2621], [1333, 2621],
    [1337, 2638], [1377, 2636], [1378, 2676], [1386, 2676], [1407, 2624], [1423, 2610], [1458, 2597], [1458, 2586],
    [1433, 2566], [1411, 2534], [1398, 2531], [1390, 2516], [1376, 2508], [1358, 2480], [1335, 2480], [1327, 2494],
  ] },
  { key: 'pelican', name: 'Pelican Key', picture: { ids: [14], at: [2300, 2860], scale: 1.0, from: [542, 305, 682, 403] },
    poly: [
    [2439, 2891], [2401, 2872], [2397, 2860], [2374, 2860], [2365, 2868], [2346, 2866], [2322, 2884], [2315, 2907],
    [2300, 2917], [2300, 2937], [2312, 2957], [2339, 2957], [2340, 2952], [2354, 2952], [2355, 2957], [2423, 2957],
    [2428, 2920], [2439, 2913],
  ] },
  { key: 'gull', name: 'Gull Harbor', placement: 'gull' },
  { key: 'coral', name: 'Coral Cay', placement: 'coral' },
  { key: 'paradise', name: 'Paradise Cay', placement: 'paradise' },
  { key: 'lighthouse', name: 'Lighthouse Rock', placement: 'lighthouse' },
  { key: 'smuggler', name: "Smuggler's Rock", placement: 'smuggler' },
  { key: 'prison', name: 'Prison Island', poly: [[4130, 3170], [4480, 3140], [4560, 3300], [4470, 3450], [4180, 3440], [4100, 3300]] },
  // the six biggest of today's islets, round the bay's mouth and the west coast (top-left corners, as the draft)
  { key: 'islet1', name: 'The Islets', at: [230, 2160] }, { key: 'islet2', name: 'The Islets', at: [1240, 3000] },
  { key: 'islet3', name: 'The Islets', at: [2560, 3420] }, { key: 'islet4', name: 'The Islets', at: [330, 2470] },
  { key: 'islet5', name: 'The Islets', at: [3920, 3050] }, { key: 'islet6', name: 'The Islets', at: [2050, 3560] },
  // the west sea road's stepping stones (ruling 3): new islets the causeway hops between
  { key: 'egret1', name: 'Egret Rocks', poly: [[150, 2180], [230, 2170], [250, 2250], [190, 2280], [140, 2240]] },
  { key: 'egret2', name: 'Egret Rocks', poly: [[250, 2520], [330, 2510], [350, 2590], [290, 2620], [240, 2580]] },
  { key: 'egret3', name: 'Egret Rocks', poly: [[430, 2920], [510, 2910], [530, 2990], [470, 3020], [420, 2980]] },
  { key: 'egret4', name: 'Egret Rocks', poly: [[590, 3150], [670, 3140], [690, 3220], [630, 3250], [580, 3210]] },
];
export const PORT_WESTPORT = { name: 'Port Westport (the container port)', rect: [1189, 2056, 1262, 2400], faces: 'west', note: 'new ground: a straight quay with cranes on the West Channel; Westport Freight moves here' };
// Today's places that are on the mainland now (Westport is joined on; Northshore was always there): where their look
// comes from, as the islands' `picture`.
export const PIECES = [
  { key: 'westport', name: 'Westport', onMainland: true, picture: { ids: [23, 24, 25, 28, 30], at: [1150, 1950], scale: 1.15, from: [34, 237, 497, 778] } },
  { key: 'northshore', name: 'Northshore', onMainland: true, picture: { ids: [31, 32, 34], at: [2000, 1600], scale: 1.0, from: [748, 29, 1207, 279] } },
];
// The canal through Metro City + Southbank (the owner: "a narrower yet still boatable waterway that splits the large
// island up in two, not necessarily splitting the districts up perfectly, but there are lots of bridges"): from
// today's inlet between The Yards and Pine Hills on across to the east shore. Metro City north of it, Southbank south.
export const CANAL = { name: 'The Canal', width: 55, pts: [[2050, 2610], [2095, 2535], [2180, 2490], [2280, 2455], [2380, 2470], [2470, 2500], [2530, 2510]] };

// The river channel, the Long Reach: navigable from the bay's north-east corner up to Kestrel Lake (50-80 m wide).
export const RIVER = { name: 'The Long Reach', width: 70, pts: [[3375, 1890], [3360, 1700], [3300, 1500], [3320, 1300], [3250, 1110], [3120, 960], [2960, 840], [2800, 720]] };
export const STREAMS = [
  { name: 'Kestrel Creek', width: 26, pts: [[2560, 445], [2480, 300], [2520, 150], [2440, 0]] },
  { name: 'Silver Thread Creek', width: 18, pts: [[1110, 690], [1180, 900], [1150, 1150], [1300, 1500], [1500, 1700], [1600, 1915]] },
];
export const LAKES = [
  { name: 'Kestrel Lake', poly: [[2380, 560], [2520, 440], [2760, 450], [2880, 560], [2840, 700], [2640, 760], [2440, 700]] },
  { name: 'Red Rock Reservoir', poly: [[4020, 520], [4120, 470], [4240, 500], [4220, 600], [4080, 610]] },
];

// ---------------------------------------------------------------------------------------------------------------------
// Highways (orange on the markup; ruling 1). Two lanes each way, grade-separated: they cross nothing at grade.
// Three loops and more: the west (Coast - Granite Peaks - Highland), the middle (Highland - Valley - Coast), the
// big north-east one (Valley - North - Desert - Coast), and the Bay Ring's two through the islands.
export const HIGHWAYS = [
  // behind Northshore's beach towns (the gulf: the waterfront is beaches, not highway), over the Long Reach upriver
  { name: 'Coast Highway', pts: [[520, 1150], [760, 1420], [1080, 1640], [1410, 1745], [1650, 1700], [1950, 1590], [2300, 1570], [2700, 1570], [3050, 1580], [3260, 1600], [3400, 1640], [3620, 1810], [3800, 1900], [4150, 2200], [4450, 2330], [4800, 2320], [4940, 2288], [5040, 2262]],
    bridges: [[9, 10]], tunnels: [[16, 17]] },  // the Long Reach Bridge; east: a closed tunnel mouth
  { name: 'Granite Peaks Highway', pts: [[520, 1150], [430, 960], [355, 700], [330, 520], [380, 400], [520, 320], [760, 304], [1000, 300], [1240, 262], [1440, 330], [1610, 460]],
    tunnels: [[1, 2], [4, 6]] },   // the Redwood Tunnel, then the Peaks Tunnel into the mountains
  { name: 'Highland Highway', pts: [[1410, 1745], [1230, 1450], [1160, 1180], [1230, 900], [1430, 640], [1610, 460], [1820, 350], [2110, 290]],
    bridges: [[3, 4]] },   // the Gorge Bridge
  { name: 'Valley Highway', pts: [[2300, 1570], [2440, 1350], [2300, 760], [2160, 400], [2110, 290], [2160, 90], [2190, 0]],
    tunnels: [[5, 6]] },   // north: into the North Ridge to a closed tunnel mouth at the map edge
  { name: 'North Highway', pts: [[2110, 290], [2400, 170], [2800, 112], [3200, 150], [3560, 140], [3800, 170], [4100, 180], [4380, 90], [4560, 90], [4632, 170]],
    tunnels: [[1, 3], [5, 6]] },   // under the North Ridge (ruling 1), twice
  { name: 'Desert Highway', pts: [[3620, 1810], [3720, 1600], [3790, 1230], [3880, 900], [4080, 720], [4440, 560], [4600, 400], [4632, 170], [4640, 0]],
    tunnels: [[7, 8]] },   // north: a closed tunnel mouth at the map edge
  // The Bay Ring (the gulf): from the Coast Highway at the Westport Interchange south through Westport (on the mainland
  // now) to the Harbor Bridge, across Metro City on its ring, over the Cedar Bridge, across Cedar Isle and over the East
  // Toll Bridge to Toll Point and the Sandpiper interchange. Bridges of 200-260 m now, not a kilometre.
  { name: 'Bay Ring', r: 120, existing: true,
    pts: [[1650, 1700], [1600, 1950], [1590, 2150], [1600, 2300], [1900, 2300], [2290, 2300], [2460, 2390], [2780, 2400], [3100, 2420], [3460, 2405], [3770, 2405], [3990, 2350], [4150, 2200]],
    bridges: [[3, 4], [6, 7], [9, 10]] },   // the Harbor Bridge, the Cedar Bridge, the East Toll Bridge
  // the Bay Bridge: from the Northshore Interchange over the north channel to Metro City's ring; the main line and
  // subway line 1 cross beside it
  { name: 'Bay Bridge', r: 120, existing: true, pts: [[2300, 1570], [2410, 1835], [2410, 2090], [2290, 2300]],
    bridges: [[1, 2]] },
];
// Where highways meet (the interchanges; every highway end is at one of these or at a map-edge closure).
export const INTERCHANGES = [
  { name: 'Redwood Junction', at: [520, 1150], kind: 'fork', note: 'the Coast Highway runs on into the Granite Peaks Highway' },
  { name: 'Westport Junction', at: [1410, 1745], kind: 'trumpet' },
  { name: 'Westport Interchange', at: [1650, 1700], kind: 'trumpet', note: 'the Bay Ring south through Westport' },
  { name: 'Northshore Interchange', at: [2300, 1570], kind: 'cloverleaf', note: 'the Coast and Valley highways and the Bay Bridge' },
  { name: 'Dry Creek Interchange', at: [3620, 1810], kind: 'trumpet' },
  { name: 'Sandpiper Interchange', at: [4150, 2200], kind: 'trumpet' },
  { name: 'Gorge Junction', at: [1610, 460], kind: 'fork', note: 'the Granite Peaks Highway joins the Highland Highway' },
  { name: 'Kestrel Pass Interchange', at: [2110, 290], kind: 'four-level stack', note: 'Highland, Valley, North (and by the Gorge Junction the Granite Peaks Highway): ruling 1\'s one interchange near the top middle' },
  { name: 'North Mesa Interchange', at: [4632, 170], kind: 'trumpet' },
  { name: 'Metro Ring Interchange', at: [2290, 2300], kind: 'ramps', note: "the Bay Bridge onto Metro City's ring" },
];
// The highways that run off the map end at a closed tunnel mouth (the owner, part 5): the world can grow there later.
export const CLOSURES = [
  { name: 'Valley Highway north portal', line: 'Valley Highway', at: [2190, 0] },
  { name: 'Desert Highway north portal', line: 'Desert Highway', at: [4640, 0] },
  { name: 'Coast Highway east portal', line: 'Coast Highway', at: [5040, 2262] },
];

// ---------------------------------------------------------------------------------------------------------------------
// Arterials (white on the markup; ruling 2): Granite Peaks thinned to three (Summit Road, Falls Pass Road, Lookout
// Road), big roadless areas left in the forest and the eastern desert. Smaller roads branch off these and aren't here.
export const ARTERIALS = [
  // Granite Peaks: the scenic road along the top (with its tunnel), the pass by Silver Thread Falls, the lookout road
  { name: 'Summit Road', pts: [[90, 600], [110, 420], [190, 190], [400, 140], [620, 130], [800, 86], [900, 80], [1040, 76], [1200, 90], [1400, 230], [1600, 410], [1720, 580], [1720, 830]],
    tunnels: [[5, 7]] },
  { name: 'Falls Pass Road', pts: [[1240, 120], [1240, 330], [1150, 520], [1080, 690], [1140, 860], [1170, 1070]] },
  { name: 'Lookout Road', pts: [[160, 700], [320, 640], [460, 560], [620, 510], [820, 440]] },
  // Highland Woods
  { name: 'Redwood Coast Road', pts: [[90, 600], [160, 700], [300, 820], [400, 960], [420, 1250], [440, 1550], [490, 1820], [600, 2100], [780, 2420], [860, 2650]] },
  { name: 'Timber Road', pts: [[420, 1150], [800, 1110], [1170, 1070]] },
  { name: 'Gorge Road', pts: [[1170, 1070], [1460, 1090], [1480, 900], [1560, 830], [1860, 830], [1960, 920], [2040, 1000]] },
  { name: 'Woods Road', pts: [[1170, 1070], [1490, 1130], [1490, 1240], [1380, 1320], [1080, 1400], [960, 1500], [940, 1700], [940, 1850]] },
  // the bay's north shore
  { name: 'Shore Road', pts: [[940, 1850], [1250, 1890], [1700, 1870], [2050, 1835], [2400, 1830], [2800, 1835], [3240, 1830], [3432, 1810]] },   // Northshore's waterfront boulevard
  // Willow Valley
  { name: 'Valley Road North', pts: [[2040, 1000], [2800, 1000], [3220, 1010], [3330, 1110], [3390, 1270]] },
  { name: 'Valley Road', pts: [[1940, 1760], [1930, 1260], [2800, 1250], [3390, 1270]] },
  { name: 'County Road 7', pts: [[2712, 790], [2712, 1250], [2740, 1600], [2760, 1830]] },
  { name: 'Willow Road', pts: [[3432, 1810], [3420, 1500], [3390, 1270], [3330, 1110], [3160, 940], [2940, 790]] },
  { name: 'Lake Road', pts: [[2350, 700], [2460, 800], [2712, 790], [2940, 790]] },
  { name: 'Kestrel Road', pts: [[2940, 790], [3060, 560], [3090, 300], [3100, 150]] },
  // the Red Rock Desert
  { name: 'Route 9', pts: [[3720, 1600], [3880, 1480], [4100, 1560], [4500, 1640], [4880, 1640], [4910, 1300], [4900, 900], [4960, 720], [4920, 470], [4720, 390], [4600, 400]] },
  { name: 'Mine Road', pts: [[3390, 1270], [3560, 1240], [3720, 1190], [4100, 1210], [4400, 1210], [4690, 1180]] },
  { name: 'Mesa Road', pts: [[3088, 430], [3400, 400], [3640, 360], [3840, 450], [4120, 340], [4360, 380], [4600, 400]] },
  { name: 'Canyon Road', pts: [[3990, 820], [4060, 700], [4130, 630]] },   // up to Red Rock Dam
  { name: 'Hollow Road', pts: [[4100, 1210], [4200, 1040]] },
  // the Sandpiper Coast
  { name: 'Sandpiper Drive', pts: [[4440, 1640], [4450, 1920], [4100, 1920], [3930, 2100], [3950, 2250], [4260, 2500], [4480, 2580], [4800, 2460], [5000, 2330]] },
  { name: 'Dune Road', pts: [[4260, 2500], [4300, 2240], [4520, 2120], [4800, 2200], [5000, 2330]] },
  // the Egret Coast: the west sea road, an island-hopping causeway to Gull Harbor (ruling 3: low bridges from islet to
  // islet, not an undersea tunnel; `mayBeTunnel` - the owner may yet prefer one)
  { name: 'West Sea Road', mayBeTunnel: true, pts: [[440, 1800], [350, 1822], [190, 1990], [190, 2220], [300, 2560], [480, 2960], [640, 3200], [820, 3260], [990, 3170]],
    bridges: [[1, 3], [3, 4], [4, 5], [5, 6], [6, 8]] },
  // The gulf's crossings (the owner: "plenty of bridges that lead off these urban islands onto the mainland as well so
  // entry and exit points can't just be camped by players ... Some walking bridges too"): besides the Bay Ring's and the
  // Bay Bridge, three more to the mainland (a lift bridge, the Harbor Tunnel, Cedar North Bridge and Toll Point Bridge),
  // two more across each channel between the islands, footbridges, the canal's six, the airport's two.
  { name: 'Union Bridge', pts: [[1640, 2240], [1920, 2240]], bridges: [[0, 1]] },                 // Westport - Metro City
  { name: 'Harbor Footbridge', foot: true, pts: [[1630, 2360], [1880, 2360]], bridges: [[0, 1]] },
  { name: 'Northshore Lift Bridge', lift: true, pts: [[2200, 1835], [2200, 2140]], bridges: [[0, 1]] },   // it lifts for tall boats
  { name: 'Harbor Tunnel', pts: [[2470, 2200], [2600, 1820]], tunnels: [[0, 1]] },               // under the north channel
  { name: 'Eastgate Bridge', pts: [[2470, 2340], [2760, 2350]], bridges: [[0, 1]] },              // Metro City - Cedar Isle
  { name: 'Southbank Walk', foot: true, pts: [[2450, 2570], [2730, 2570]], bridges: [[0, 1]] },   // Southbank - Cedar Isle
  { name: 'Cedar North Bridge', pts: [[3060, 1840], [3060, 2250]], bridges: [[0, 1]] },            // high: the boats for the Long Reach pass under
  { name: 'Toll Point Bridge', pts: [[3480, 2540], [3840, 2560]], bridges: [[0, 1]] },
  { name: 'Port Bridge', lift: true, pts: [[1090, 2300], [1215, 2300]], bridges: [[0, 1]] },     // over the West Channel to the Egret Coast
  { name: 'Airport Road', pts: [[1400, 2410], [1400, 2560]], bridges: [[0, 1]] },
  { name: 'Runway Road', pts: [[1330, 2380], [1330, 2540]], bridges: [[0, 1]] },
  { name: 'Westport Avenue', pts: [[1215, 2300], [1420, 2200], [1640, 2240]] },                  // Port Westport - Union Bridge, across town
  { name: 'Southbank Avenue', pts: [[2120, 2575], [2300, 2620], [2450, 2570]] },
  { name: 'Pelican Walk', foot: true, pts: [[2420, 2770], [2370, 2890]], bridges: [[0, 1]] },
  { name: 'Canal Bridge 1', pts: [[2123, 2464], [2169, 2552]], bridges: [[0, 1]] },
  { name: 'Canal Footbridge 2', foot: true, pts: [[2208, 2427], [2242, 2521]], bridges: [[0, 1]] },
  { name: 'Canal Bridge 3', pts: [[2302, 2408], [2288, 2507]], bridges: [[0, 1]] },
  { name: 'Canal Bridge 4', pts: [[2362, 2417], [2348, 2516]], bridges: [[0, 1]] },
  { name: 'Canal Footbridge 5', foot: true, pts: [[2441, 2438], [2409, 2532]], bridges: [[0, 1]] },
  { name: 'Canal Bridge 6', pts: [[2484, 2452], [2468, 2550]], bridges: [[0, 1]] },
];

// ---------------------------------------------------------------------------------------------------------------------
// The main line (green; ruling 4): double track everywhere (one track each way), junctions guarded by signals. A graph
// of segments between junctions; three services run over it, each both ways.
export const MAIN_LINE_TRACKS = 2;   // everywhere, one each way; every junction is guarded by signals
export const MAIN_JUNCTIONS = [
  { name: 'Westport Junction', at: [1640, 1700] },
  { name: 'Northshore Junction', at: [2440, 1700] },
  { name: 'Route 9 Junction', at: [3950, 1420] },
  { name: 'Metro Junction', at: [2250, 2330] },
];
export const MAIN_LINE = [
  { name: 'Coast West', from: 'Westport Junction', to: 'Northshore Junction', pts: [[1640, 1700], [2040, 1700], [2440, 1700]] },
  { name: 'Coast East', from: 'Northshore Junction', to: 'Route 9 Junction',
    pts: [[2440, 1700], [2900, 1708], [3300, 1720], [3440, 1724], [3600, 1730], [3800, 1600], [3950, 1420]], bridges: [[2, 3]] },   // the swing bridge over the channel mouth
  // the Grand Loop's long way round: up to Copper Gulch and Lucky Mesa, along the north edge, down into the valley,
  // across it, up through the Gorge into the peaks, round Granite Peaks and down through Timber Bend to the coast
  { name: 'The Mountains and the Desert', from: 'Route 9 Junction', to: 'Westport Junction',
    pts: [[3950, 1420], [4300, 1220], [4620, 1100], [4700, 800], [4600, 560], [4760, 250], [4560, 40], [4200, 70], [3800, 130], [3700, 560], [3560, 860], [3300, 960], [3120, 1030], [2400, 1030], [1700, 1060], [1640, 650], [1500, 500], [1100, 480], [780, 600], [560, 780], [580, 1000], [760, 1180], [1260, 1060], [1320, 1560], [1640, 1700]],
    // under the North Ridge, under the Long Reach (boats pass over), through the peaks, round the mountain's foot
    tunnels: [[7, 8], [11, 12], [16, 17], [18, 19]] },
  // in the gulf the main line crosses beside the highways (the Bay Bridge, the Harbor Bridge, the Cedar and East Toll
  // bridges) and under Metro City's core; its curves there are tighter (r 200)
  { name: 'Bay Bridge Line', from: 'Northshore Junction', to: 'Metro Junction', r: 200, urban: true,
    pts: [[2440, 1700], [2440, 1830], [2420, 2100], [2250, 2330]], bridges: [[1, 2]], tunnels: [[2, 3]] },   // beside the Bay Bridge; the tunnel under the core
  { name: 'Harbor Line', from: 'Metro Junction', to: 'Westport Junction', r: 200, urban: true,
    pts: [[2250, 2330], [1930, 2318], [1520, 2318], [1540, 1950], [1640, 1700]], bridges: [[1, 2]] },   // beside the Harbor Bridge
  { name: 'Cedar Line', from: 'Metro Junction', to: 'Route 9 Junction', r: 200, urban: true,
    pts: [[2250, 2330], [2310, 2353], [2390, 2384], [2460, 2412], [2780, 2420], [3100, 2440], [3460, 2425], [3770, 2425], [3990, 2350], [4150, 2200], [4160, 2100], [4100, 1820], [3990, 1600], [3950, 1420]],
    bridges: [[1, 2], [3, 4], [6, 7]], tunnels: [[10, 11]] },   // over Metro City's lagoon, the Cedar Bridge, the East Toll Bridge
];
// The services, each both ways (ruling 4): its route as [segment, direction] (+1 from -> to, -1 back), and its stops.
export const SERVICES = [
  { name: 'Grand Loop', note: 'the mountains, the valley, the desert',
    run: [['Coast West', 1], ['Coast East', 1], ['The Mountains and the Desert', 1]],
    stops: ['Westport Junction', 'Northshore', 'Dry Creek', 'Route 9', 'Copper Gulch', 'Lucky Mesa', 'Red Rock', 'Willow Valley', 'Gorge', 'Granite Peaks', 'Timber Bend'] },
  { name: 'Bay Loop', note: 'Northshore, Metro City, Cedar Isle, Sandpiper',
    run: [['Bay Bridge Line', 1], ['Cedar Line', 1], ['Coast East', -1]],
    stops: ['Northshore', 'Old Town', 'Metro Central', 'The Yards', 'Cedar Falls', 'Sandpiper Bay', 'Route 9', 'Dry Creek'] },
  { name: 'Harbor Line', note: 'Westport, Metro City, Northshore',
    run: [['Harbor Line', -1], ['Bay Bridge Line', -1], ['Coast West', -1]],
    stops: ['Westport Junction', 'Lakeview', 'Westport Center', 'Metro Central', 'Old Town', 'Northshore'] },
];

// ---------------------------------------------------------------------------------------------------------------------
// The subways (ruling 5): underground where the markup is dotted, on bridges and viaducts where it is solid.
export const SUBWAYS = [
  { name: 'Subway Line 1', color: 'pink', note: 'Northshore, a viaduct beside the Bay Bridge, under Metro City, under the channel to Cedar Isle, a loop under it',
    pts: [[2360, 1730], [2380, 1835], [2380, 2085], [2330, 2260], [2470, 2370], [2750, 2370], [2950, 2380]],
    tunnels: [[0, 1], [2, 6]], bridges: [[1, 2]] },
  { name: 'Subway Line 1 (Cedar Isle loop)', color: 'pink', loopOf: 'Subway Line 1',
    pts: [[2950, 2380], [2950, 2275], [3230, 2275], [3230, 2525], [2950, 2525], [2950, 2380]], tunnels: [[0, 5]] },
  { name: 'Subway Line 2', color: 'yellow', note: 'the airport over its strait, a loop under Westport, under the channel and Metro City, under the canal to Southbank',
    pts: [[1340, 2560], [1385, 2400], [1510, 2260], [1690, 2190], [1950, 2190], [2130, 2290], [2200, 2470], [2250, 2640], [2380, 2680]],
    tunnels: [[1, 8]], bridges: [[0, 1]] },
  { name: 'Subway Line 2 (Westport loop)', color: 'yellow', loopOf: 'Subway Line 2',
    pts: [[1510, 2260], [1510, 2000], [1250, 2000], [1250, 2260], [1510, 2260]], tunnels: [[0, 4]] },
];

// ---------------------------------------------------------------------------------------------------------------------
// Ferries (the draft's; ferries.js finds its routes from the piers, so these are where the piers go).
export const FERRIES = [
  // the walk-on loop round the gulf's channels: Metro City's harbour, Westport, Northshore's pier, Cedar Isle, Southbank
  { name: 'Bay Ferry', pts: [[1840, 2440], [1700, 2200], [1790, 1990], [2150, 1910], [2600, 1930], [2620, 2150], [2600, 2480], [2580, 2740], [2240, 2800], [2000, 2700], [1840, 2440]] },
  { name: 'River Water Bus', pts: [[2620, 2000], [2900, 1950], [3360, 1900], [3355, 1700], [3300, 1500], [3310, 1300], [3240, 1110], [3110, 960], [2950, 840], [2800, 720], [2700, 600]] },
  { name: 'Gull Harbor Car Ferry', pts: [[1150, 2350], [1150, 2700], [1100, 2950], [1060, 3140]] },   // from Port Westport down the West Channel
  { name: 'Cay Water Bus', pts: [[3000, 2700], [2400, 3420], [1720, 3480], [1390, 3360]] },
  { name: 'Lighthouse Water Bus', pts: [[1150, 2250], [1140, 2800], [1000, 3080], [700, 3100], [350, 2700], [180, 2200], [300, 1760]] },
  { name: 'Prison Boat', pts: [[3480, 2700], [3800, 3250], [4150, 3300]] },
];

// ---------------------------------------------------------------------------------------------------------------------
// Stations (named, at the towns): `line` is 'main' or a subway's name.
export const STATIONS = [
  { name: 'Westport Junction', line: 'main', at: [1700, 1700] },
  { name: 'Northshore', line: 'main', at: [2440, 1700] },   // at the junction: all three services stop
  { name: 'Dry Creek', line: 'main', at: [3559, 1724] },
  { name: 'Route 9', line: 'main', at: [3878, 1506] },
  { name: 'Copper Gulch', line: 'main', at: [4551, 1112] },
  { name: 'Lucky Mesa', line: 'main', at: [4635, 519] },
  { name: 'Red Rock', line: 'main', at: [3659, 649] },
  { name: 'Willow Valley', line: 'main', at: [2720, 1030] },
  { name: 'Gorge', line: 'main', at: [1680, 863] },
  { name: 'Granite Peaks', line: 'main', at: [1240, 487] },
  { name: 'Timber Bend', line: 'main', at: [1177, 1185] },
  { name: 'Old Town', line: 'main', at: [2386, 2146] },
  { name: 'Metro Central', line: 'main', at: [2250, 2330] },
  { name: 'Lakeview', line: 'main', at: [1560, 1900] },
  { name: 'Westport Center', line: 'main', at: [1534, 2060] },
  { name: 'The Yards', line: 'main', at: [2376, 2379] },
  { name: 'Cedar Falls', line: 'main', at: [3100, 2440] },
  { name: 'Sandpiper Bay', line: 'main', at: [4070, 2275] },
  { name: 'Northshore', line: 'Subway Line 1', at: [2360, 1730] },
  { name: 'Northgate', line: 'Subway Line 1', at: [2370, 2120] },
  { name: 'Downtown', line: 'Subway Line 1', at: [2345, 2208] },
  { name: 'Arts District', line: 'Subway Line 1', at: [2600, 2370] },
  { name: 'Cedar Falls', line: 'Subway Line 1', at: [2950, 2380] },
  { name: 'Falls Center', line: 'Subway Line 1', at: [3090, 2275] },
  { name: 'Lake District', line: 'Subway Line 1', at: [3230, 2400] },
  { name: 'Cedar Hills', line: 'Subway Line 1', at: [3090, 2525] },
  { name: 'Airport', line: 'Subway Line 2', at: [1340, 2560] },
  { name: 'Old Quarter', line: 'Subway Line 2', at: [1447, 2330] },
  { name: 'Westport Center', line: 'Subway Line 2', at: [1510, 2260] },
  { name: 'Lakeview', line: 'Subway Line 2', at: [1380, 2000] },
  { name: 'Stadium District', line: 'Subway Line 2', at: [1690, 2190] },
  { name: 'Civic Center', line: 'Subway Line 2', at: [1950, 2190] },
  { name: 'Midtown', line: 'Subway Line 2', at: [2165, 2380] },
  { name: 'Southbank', line: 'Subway Line 2', at: [2225, 2555] },
  { name: 'Southside', line: 'Subway Line 2', at: [2315, 2660] },
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
  { name: 'Sandpiper Point Light', kind: 'light', at: [4440, 2730] }, { name: 'Silver Thread Falls', kind: 'falls', at: [1110, 690] },
  { name: 'Lookout Hill', kind: 'lookout', at: [2560, 445] }, { name: 'Granite Lookout', kind: 'lookout', at: [820, 440] },
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
// The skeleton's lines in one list, each with its kind and its path (built on call, never at load).
export function skeletonLines() {
  const out = [];
  const add = (kind, line, extra) => {
    const path = linePath(line, RADIUS[kind]);
    out.push({ kind, name: line.name, line, path, tunnels: stretchRanges(path, line.tunnels), bridges: stretchRanges(path, line.bridges), ...extra });
  };
  for (const l of HIGHWAYS) add('hwy', l);
  for (const l of ARTERIALS) add('art', l);
  for (const l of MAIN_LINE) add('main', l);
  for (const l of SUBWAYS) add('sub', l);
  for (const l of FERRIES) add('ferry', l);
  return out;
}

// In the canal (its path, its width): water a line must bridge or tunnel.
let canalPath = null;
export function inCanal(x, y) {
  canalPath ||= linePath(CANAL, 60);
  return nearestOnPath(canalPath, x, y).d < CANAL.width / 2;
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
  const town = nearTown(x, y, 260);
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
    frame: [5040, 4032], radius: RADIUS, mainTracks: MAIN_LINE_TRACKS, mainland: MAINLAND, biomes: BIOMES, islands: ISLANDS, port: PORT_WESTPORT, pieces: PIECES, canal: CANAL,
    river: RIVER, streams: STREAMS, lakes: LAKES, interchanges: INTERCHANGES, closures: CLOSURES,
    junctions: MAIN_JUNCTIONS, services: SERVICES, stations: STATIONS, towns: TOWNS, landmarks: LANDMARKS,
    lines: lines.map((L) => ({ kind: L.kind, name: L.name, ctrl: L.line.pts, path: round(L.path.pts), length: Math.round(L.path.length),
      tunnels: L.tunnels.map(([a, b]) => [Math.round(a), Math.round(b)]), bridges: L.bridges.map(([a, b]) => [Math.round(a), Math.round(b)]),
      minRadius: Math.round(minRadius(L.path).r), mayBeTunnel: !!L.line.mayBeTunnel, color: L.line.color || null, foot: !!L.line.foot, lift: !!L.line.lift })),
    crossings: cx.crossings, tunnelled: cx.tunnelled, junctionNodes: cx.junctions, summary: skeletonSummary(lines, cx),
  };
}
