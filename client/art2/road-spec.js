// Road and pavement widths for World v2 (art v2 and, when the world is rebuilt, the road network).
// One table, so the art kits and the driving physics read the same numbers. World px: 1 px ~ 4.5 cm;
// a sedan is 100 x 48. A lane is ~1.7 car widths (about a real 3.6 m lane), so cars can weave and pass.
//
// The live map still uses ROAD in shared/roads.js. This table moves to shared/ (and the server reads
// it) when World v2 is built; it lives here until then so it does not restart the live server.
export const CAR_W = 48;
export const LANE = 80;              // one traffic lane
export const PARKING_LANE = 56;      // kerbside parking strip
export const MEDIAN = 24;            // painted or raised median on avenues
export const KERB_RADIUS = 22;       // kerb return at block corners

// carriageway widths (kerb to kerb)
export const ROAD_V2 = {
  alley: 96,                         // one lane, two cars wide: you can still squeeze past
  oneway: 2 * LANE,                  // one-way street, two lanes
  street: 2 * LANE + 32,             // two-lane street (one each way) with a little shoulder: 192
  streetParked: 2 * LANE + 2 * PARKING_LANE + 8, // two-lane street with parking both sides: 280
  avenue: 4 * LANE + MEDIAN,         // four lanes and a median: 344
  boulevard: 4 * LANE + 64,          // four lanes round a planted median: 384
  highwayLane: 88,
  rural: 2 * LANE,                   // county road
  dirt: 120,
};
// sidewalk widths (kerb to building line)
export const SIDEWALK_V2 = { residential: 64, commercial: 96, downtown: 112, plaza: 128, none: 0 };
