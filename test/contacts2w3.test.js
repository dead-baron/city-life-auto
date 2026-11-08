// The contacts' places on World v3's map (the live world; test/contacts2.test.js has the chains on today's city): each is
// the real place by name and district - Park West Motors (Greenfield Park), Westport Freight on the Port Westport docks,
// the Midtown precinct, Union Trust Tower downtown - the dock shipment's quay is Port Westport's, Victor's share is in
// his own tower, and Deacon's hideout is the one on the docks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { joinPlayer } from './helpers.js';
import { World } from '../server/world.js';
import { buildWorld3 } from '../server/world3.js';
import { CONTACTS } from '../shared/rules-contacts.js';
const contacts = await import('../server/systems/contacts.js');
const calendar = await import('../server/systems/calendar.js');
const biz = await import('../server/systems/biz.js');

const { map: M } = await buildWorld3(1337, { log: () => {} });

test('World v3: every contact\'s place is the real one, by name, in the district they name', () => {
  const w = new World(M, { npcBudget: 0, throwErrors: true });
  const want = { rosa: 'Crown Pawn', okafor: 'Midtown 9th Precinct', mae: 'Park West Motors', deacon: 'Westport Freight', reyes: 'Midtown 9th Precinct', lin: 'Union Trust Tower' };
  for (const [id, label] of Object.entries(want)) {
    const C = CONTACTS[id], q = contacts.placeOf(w, C);
    assert.equal(q && q.label, label, id);
    assert.equal(M.districtAt(q.x, q.y).name, C.place.district, `${id}: in ${C.place.district}`);
  }
  assert.equal(calendar.dockSite(w).name, 'Port Westport');
  assert.equal(contacts.towerFor(w, CONTACTS.lin), 'Union Trust Tower');
  // the Port job's case lands by the ship, in Port Westport
  const { p } = joinPlayer(w, { ftue: { st: 'done', tips: 0, m: {} } });
  const c = contacts.portCase(w, p, CONTACTS.deacon, contacts.rec(p.profile, 'deacon'));
  assert.equal(M.districtAt(c.x, c.y).name, 'Port Westport');
  // Deacon's hideout: the one on the docks
  const dea = contacts.placeOf(w, CONTACTS.deacon);
  const near = biz.sites(w).filter((s) => s.t === 'hideout').sort((a, b) => Math.hypot(a.x - dea.x, a.y - dea.y) - Math.hypot(b.x - dea.x, b.y - dea.y))[0];
  assert.equal(near.d, 'Port Westport');
});
