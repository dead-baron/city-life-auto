// The places with a sound of their own (shared/map.js walk-ins: a building's walkIn.units, each a POI kind):
// - a nightclub, open after dark: its four-on-the-floor heard through the walls outside (the bass, muffled, from
//   its door) and loud and clear inside - until the server winds it down after sunrise (S.clubLive);
// - some shops play light music inside, the bank and the hospital an elevator-style tune in the lobby;
// - the small shops (shared/doors.js rings: the corner store, the pawn shop, the diner and the cafe, the barber, the
//   hardware store, bait and tackle, the fish market, a bakery) have a little brass bell over the door that rings when
//   anyone - you or one of the city's people - goes in or out (the owner's notes 2, p16: "in some stores (that it would
//   match the vibe of) we can have a bell ring when you walk in");
// - the others' doors as they are drawn (client/art2/game/doorart.js): sliding glass sighs open, a hinged door clicks.
// And it tells the rest whether you're indoors (ambience and distant sounds come through the walls).
import { T, TILE, PF } from '../../shared/constants.js';
import { rings, unitDoor } from '../../shared/doors.js';

export const SONG_FOR = { clothing: 'shop', sports: 'shop', coffee: 'shop', convenience: 'shop', grocery: 'shop', pharmacy: 'shop', gasstation: 'shop', bank: 'lobby', hospital: 'lobby', courthouse: 'lobby', bowling: 'shop', cinema: 'lobby' };
const QUIET_SOME = new Set(['convenience', 'gasstation', 'grocery']);   // (only some of these have the radio on)
const CLUB_HEAR = 820;

const hash = (n) => { let x = (n * 2654435761) >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; x ^= x >>> 13; return (x >>> 0) / 4294967296; };

// the walk-in unit at a world point: { b, u, i } or null
export function unitAt(map, x, y) {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  const t = map.tileAt(tx, ty);
  if (t !== T.FLOOR && t !== T.COUNTER) return null;
  const b = map.buildings[map.bld[map.idx(tx, ty)]];
  if (!b || !b.walkIn) return null;
  const us = b.walkIn.units;
  for (let i = 0; i < us.length; i++) if (tx >= us[i].x0 - 0 && tx <= us[i].x1) return { b, u: us[i], i };
  return null;
}

// what a walk-in's door sounds like going through it: its bell, or as the door is drawn - sliding glass or swinging
export const doorSound = (u) => (rings(u) ? 'doorbell' : unitDoor(u) === 'slide' ? 'slidingdoor' : 'housedoor');

export class Places {
  constructor(E, music) {
    this.E = E; this.music = music;
    this.map = null; this.clubs = []; this.peds = new Map(); this.rang = new Map(); this.nextPeds = 0; this.nextGc = 0;
    this.here = null;   // the unit you're in
  }
  index(map) {
    this.map = map; this.clubs = [];
    const poiById = new Map((map.pois || []).filter((p) => p).map((p) => [p.id, p]));   // (filter: World v3's window holds some of the POIs - a sparse list)
    for (const id of map.walkIns || []) {
      const b = map.buildings[id];
      if (!b || !b.walkIn) continue;   // (World v3's window: a building it doesn't hold)
      for (const u of b.walkIn.units) {
        if (u.kind !== 'club') continue;
        const poi = poiById.get(u.poi);
        this.clubs.push({ x: (u.door.tx + u.door.w / 2) * TILE, y: (u.door.ty + 0.5) * TILE, u, gate: poi ? poi.gate : undefined });
      }
    }
  }
  update(F, S, t, scene) {
    if (S.map !== this.map) this.index(S.map);
    const L = this.E.listener, M = this.music;
    // where you are: your own feet (not the camera's look-ahead) - none of it from a car
    const me = S.ents.get(S.myPedId);
    const onFoot = me && !(me.flags & PF.INVEH);
    const at = onFoot ? unitAt(S.map, me.rx, me.ry) : null;
    this.here = at;
    const kind = at ? at.u.kind : null;
    // ---- the song for the room you're in ----
    let song = null;
    if (kind && SONG_FOR[kind] && !(QUIET_SOME.has(kind) && hash(at.u.poi + 7) < 0.35)) song = SONG_FOR[kind];
    M.set('shop', song === 'shop' && scene === 'game' ? 0.5 : 0, 5200);
    M.set('lobby', song === 'lobby' && scene === 'game' ? 0.5 : 0, 6000);
    // ---- the drive-in's score on its speakers (client/drivein.js: how loud and where) ----
    const dn = S.dinSound;
    M.set('drivein', dn && scene === 'game' ? dn.k : 0, dn ? dn.lp : 16000, dn ? dn.pan : 0);
    // ---- the nearest open club ----
    let club = null, cd = CLUB_HEAR;
    for (const c of this.clubs) {
      const d = Math.hypot(c.x - L.x, c.y - L.y);
      if (d >= cd) continue;
      // its music: on while the server says the club's open (S.clubLive: the 'club' event, the welcome's list - nightclubs.js);
      // it stops at the end of the night even while the shutter's still up for the last of them walking out. (A server
      // from before that: by the shutter, else the clock.)
      const open = c.gate !== undefined && S.clubLive ? !!S.clubLive[c.gate] : c.gate !== undefined && S.gateOpen && S.gateOpen[c.gate] !== undefined ? !!S.gateOpen[c.gate] : !!(F.clock && F.clock.isNight);
      if (open) { club = c; cd = d; }
    }
    if (club && scene === 'game') {
      const inside = kind === 'club';
      if (inside) M.set('club', 0.75, 14000, 0);
      else { const k = 1 - cd / CLUB_HEAR; M.set('club', 0.85 * k * k, 160 + 260 * k, Math.max(-0.7, Math.min(0.7, (club.x - L.x) / 500))); }
    } else M.set('club', 0);
    // ---- the shop doors: a bell over the old shops' doors, the others' sliding doors ----
    if (t >= this.nextPeds) { this.nextPeds = t + 0.1; this.doors(F, S, L); }
    if (t >= this.nextGc) { this.nextGc = t + 3; for (const [id, st] of this.peds) if (t - st.seen > 3) this.peds.delete(id); for (const [k, at2] of this.rang) if (t - at2 > 5) this.rang.delete(k); }
    return !!at;
  }
  doors(F, S, L) {
    const t = this.E.ctx.currentTime;
    for (const p of F.peds) {
      if (p.flags & (PF.INVEH | PF.DEAD)) continue;
      if (Math.abs(p.rx - L.x) > 700 || Math.abs(p.ry - L.y) > 700) continue;
      const at = unitAt(S.map, p.rx, p.ry), key = at ? at.b.id * 16 + at.i + 1 : 0;
      let st = this.peds.get(p.id);
      if (!st) { this.peds.set(p.id, { key, seen: t }); continue; }
      st.seen = t;
      if (st.key === key) continue;
      const was = st.key; st.key = key;
      // through a door: in (key set) or out (was set); the unit whose door it was
      const u = at ? at.u : this.unitByKey(S.map, was);
      if (!u) continue;
      const dx = (u.door.tx + u.door.w / 2) * TILE, dy = (u.door.ty + 0.5) * TILE;
      const dk = u.door.tx * 4096 + u.door.ty;   // (a door rings again only after a moment: a busy shop doesn't jangle)
      if (t - (this.rang.get(dk) ?? -9) < 2.5) continue;
      this.rang.set(dk, t);
      if (rings(u)) this.E.play('doorbell', dx, dy, 0.9, { f: 1500 + 500 * hash(u.poi) });
      else if (u.kind !== 'club' && Math.hypot(dx - L.x, dy - L.y) < 420) this.E.play(doorSound(u), dx, dy, 0.7);
    }
  }
  unitByKey(map, key) {
    if (!key) return null;
    const b = map.buildings[Math.floor((key - 1) / 16)];
    return b && b.walkIn ? b.walkIn.units[(key - 1) % 16] : null;
  }
}
