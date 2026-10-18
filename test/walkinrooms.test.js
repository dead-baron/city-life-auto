// A walk-in's room is a compact space just inside its door (shared/map.js roomDepth; the owner's 2026-10-17 report of a
// records store thirty tiles deep, one long empty corridor to the counter at the far end): about as deep as the shop is
// wide, walled all round; the rest of a deep footprint is its back rooms - solid, nobody inside, and still roofed over
// from inside (art v2's cutaway keeps the building as it stands behind the room's back wall).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld } from './helpers.js';
import { T, TILE } from '../shared/constants.js';
import { PED_BLOCK, roomDepth, WALKIN_ROOM } from '../shared/map.js';
import { walkInAt } from '../server/systems/npc.js';

const w = makeWorld(), m = w.map;
const OWN = new Set(['bowling', 'cinema']);   // (Pinwheel Lanes and the Grand Theatre lay their halls out themselves)
const rooms = m.walkIns.map((id) => m.buildings[id]).filter((b) => b && b.walkIn && !b.walkIn.units.some((u) => OWN.has(u.kind)));
const deep = rooms.filter((b) => b.walkIn.south && b.walkIn.y0 - 1 > b.ty);

test('the room\'s depth: about as deep as the shop is wide, the big public rooms a little more; a footprint barely deeper keeps it all', () => {
  assert.equal(roomDepth(['delivery'], 3, 31), WALKIN_ROOM.min, 'a narrow shop thirty rows deep: the least room');
  assert.equal(roomDepth(['convenience'], 6, 31), 7, 'six wide: seven deep');
  assert.equal(roomDepth(['convenience'], 28, 31), WALKIN_ROOM.max, 'a wide one: no deeper than the most');
  assert.equal(roomDepth(['convenience'], 4, WALKIN_ROOM.min + WALKIN_ROOM.slack), WALKIN_ROOM.min + WALKIN_ROOM.slack, 'barely deeper than its room: the whole of it');
  assert.equal(roomDepth(['convenience'], 4, 5), 5, 'a shallow one: all it has');
  assert.equal(roomDepth(['coffee'], 4, 31), 8, 'a food place: room for its tables');
  assert.equal(roomDepth(['police'], 24, 31), 12, 'a police station: room for the cells along the back');
  assert.equal(roomDepth(['club'], 20, 39), 12, 'a club: a dance floor');
  assert.equal(roomDepth(['gunshop', 'sports', 'hardware'], 9, 13), 10, 'a strip mall: as deep as its widest unit wants');
});

test('every walk-in\'s room is just inside its door, walled all round; the back rooms are solid and nobody is in them', () => {
  assert.ok(rooms.length > 50, `walk-ins (${rooms.length})`);
  assert.ok(deep.length >= 3, `deep ones with back rooms behind the room (${deep.length})`);
  for (const b of rooms) {
    const wi = b.walkIn, name = `${b.kind} #${b.id} (${wi.units.map((u) => u.kind).join(', ')})`, depth = wi.y1 - wi.y0 + 1;
    const wide = Math.max(...wi.units.map((u) => u.x1 - u.x0 + 1));
    assert.equal(depth, roomDepth(wi.units.map((u) => u.kind), wide, b.th - 2), `${name}: as deep as roomDepth says`);
    assert.ok(depth <= Math.max(12, WALKIN_ROOM.min + WALKIN_ROOM.slack) || depth === b.th - 2, `${name}: a compact room (${depth} deep)`);
    if (wi.south) assert.equal(wi.y1, b.ty + b.th - 2, `${name}: the room runs up to the front wall`);
    else assert.equal(wi.y0, b.ty + 1, `${name}: the room runs up to the front wall`);
    const fy = wi.south ? b.ty + b.th - 1 : b.ty;
    for (let ty = b.ty; ty < b.ty + b.th; ty++) for (let tx = b.tx; tx < b.tx + b.tw; tx++) {
      const t = m.tileAt(tx, ty), inRoom = tx >= wi.x0 && tx <= wi.x1 && ty >= wi.y0 && ty <= wi.y1;
      if (t === T.FLOOR || t === T.COUNTER) assert.ok(inRoom || (ty === fy && wi.units.some((u) => tx >= u.door.tx && tx < u.door.tx + u.door.w)), `${name}: floor at ${tx}, ${ty} is in the room or its doorway`);
      else if (!inRoom) assert.ok(PED_BLOCK[t], `${name}: ${tx}, ${ty} outside the room is solid`);
    }
    const backRow = wi.south ? wi.y0 - 1 : wi.y1 + 1;
    for (let tx = b.tx; tx < b.tx + b.tw; tx++) assert.ok(PED_BLOCK[m.tileAt(tx, backRow)], `${name}: the room's back wall is a wall at ${tx}`);
    for (const u of wi.units) {
      assert.ok(u.counterRow >= wi.y0 && u.counterRow <= wi.y1, `${name}: the counter in the room`);
      const poi = m.pois[u.poi], cy = Math.floor(u.clerk.y / TILE), py = Math.floor(poi.y / TILE);
      assert.ok(cy >= wi.y0 && cy <= wi.y1 && !PED_BLOCK[m.tileAtPx(u.clerk.x, u.clerk.y)], `${name}: the clerk behind the counter, on the floor`);
      assert.ok(py >= wi.y0 && py <= wi.y1 && walkInAt(m, poi.x, poi.y)?.u === u, `${name}: the spot in front of the counter is in the room`);
    }
    if (deep.includes(b)) {
      const tx = Math.floor((wi.x0 + wi.x1) / 2), ty = Math.floor((b.ty + wi.y0 - 1) / 2);
      assert.equal(walkInAt(m, (tx + 0.5) * TILE, (ty + 0.5) * TILE), null, `${name}: the back rooms aren't inside the shop`);
    }
  }
});

test('from inside, the room is cut away and the back rooms keep their roof (art v2)', async () => {
  const { staticItems, makeStatic } = await import('../client/art2/game/statics.js');
  const CH = 768;
  for (const b of deep.slice(0, 4)) {
    const bi = m.buildings.indexOf(b), wi = b.walkIn, seen = new Map();
    for (let cy = Math.floor(b.ty * TILE / CH); cy <= Math.floor((b.ty + b.th) * TILE / CH); cy++) for (let cx = Math.floor(b.tx * TILE / CH); cx <= Math.floor((b.tx + b.tw) * TILE / CH); cx++)
      for (const it of staticItems(m, cx, cy, { cutaway: bi })) if (it.b === bi && it.recipe && it.recipe.t === 'cut') seen.set(it.key, it);
    assert.ok(seen.size >= 1, `#${b.id}: cut away`);
    for (const it of seen.values()) {
      const r = it.recipe, G = makeStatic(r), oy = G.ay - r.d;
      assert.ok(r.back, `#${b.id}: the back rooms ride in the recipe`);
      let roof = 0, over = 0;
      for (let row = 0; row < G.h; row++) for (let x = 0; x < G.w; x++) {
        const i = row * G.w + x;
        if (!G.col[i * 4 + 3]) continue;
        const Y = row - oy + G.z[i];   // (the ground point under the pixel: screen y = Y - z)
        if (Y < r.inY0 && G.z[i] >= r.H - 8) roof++;
        if (Y > r.inY0 + 14 && Y < r.inY1 && G.z[i] > 64) over++;
      }
      assert.ok(roof > (r.inY0 - 32) * 4, `#${b.id}: the back rooms' roof stands behind the room (${roof} px)`);
      assert.equal(over, 0, `#${b.id}: nothing roofs the room you're in`);
    }
  }
});
