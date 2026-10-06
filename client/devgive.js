// The debug menu's Give section: pick anything from the game's catalogs - a weapon (with magazines of
// ammo), a tool or piece of equipment (the flashlight, the revive kit), medical supplies, drinks, bait, fish,
// loot - how many, and who gets it (you, or anyone online), then Give; or Give all: every weapon and item in
// the game at once. The server checks everything (server/dev.js give) and tells whoever received it.
// Plain selects and buttons, so the debug menu's gamepad / keyboard navigation works here too (up / down to
// move, left / right to change a choice, A / Enter to press); on touch the selects open the phone's picker.
import { WEAPONS, ITEMS, ITEM_CATS, itemCat } from '../shared/items.js';

const QTY = [1, 2, 3, 5, 10, 25, 50, 99];
const CATS = [{ id: 'weapons', name: 'Weapons (with ammo)' }, ...ITEM_CATS];

function things(cat) {
  if (cat === 'weapons') {
    return Object.values(WEAPONS).filter((w) => w.id !== 'fists').sort((a, b) => a.i - b.i)
      .map((w) => ({ kind: 'weapon', id: w.id, name: w.name + (w.police ? ' (police)' : '') }));
  }
  return Object.keys(ITEMS).filter((id) => itemCat(id) === cat).map((id) => ({ kind: 'item', id, name: ITEMS[id].name }));
}

// box: the element to fill; send(msg); press(button, label, run): the debug menu's button press (sound, toast);
// players(): the online list (S.plist.l - devs get ids). Returns { refreshTargets } (call when the list changes).
export function buildGive(box, { send, press, players }) {
  box.innerHTML = '';
  const select = (label) => {
    const l = document.createElement('label');
    const s = document.createElement('span'); s.textContent = label;
    const el = document.createElement('select');
    l.append(s, el); box.appendChild(l);
    return el;
  };
  const catS = select('Category'), itemS = select('Thing'), qtyS = select('How many'), toS = select('Give to');
  for (const c of CATS) catS.add(new Option(c.name, c.id));
  for (const n of QTY) qtyS.add(new Option(String(n), String(n)));
  const note = document.createElement('p'); note.className = 'dev-give-note';
  const fillThings = () => {
    itemS.innerHTML = '';
    for (const t of things(catS.value)) itemS.add(new Option(t.name, `${t.kind}:${t.id}`));
    note.textContent = catS.value === 'weapons' ? 'Guns: how many magazines of ammo (one goes in the gun). Melee weapons: just the weapon.'
      : catS.value === 'tools' ? 'Tools never wear out: you get one.' : '';
  };
  catS.onchange = fillThings;
  fillThings();
  const target = () => toS.value || undefined;
  const row = document.createElement('div'); row.className = 'dev-give-btns';
  const go = document.createElement('button'); go.className = 'dev-give-go'; go.textContent = '🎁 Give';
  const all = document.createElement('button'); all.className = 'dev-give-all'; all.textContent = '🎁 Give all (everything)';
  press(go, 'Give', () => {
    const [kind, id] = itemS.value.split(':');
    if (!id) return;
    send({ t: 'dev', c: 'give', kind, id, n: Number(qtyS.value) || 1, pid: target() });
  });
  press(all, 'Give everything', () => send({ t: 'dev', c: 'give', kind: 'all', n: Number(qtyS.value) || 1, pid: target() }));
  row.append(go, all);
  box.append(row, note);
  // you, then everyone else online (by name; the server gets their id) - rebuilt only when the list changes,
  // so an open picker isn't disturbed by the regular player-list refresh
  let sig = null;
  function refreshTargets() {
    const others = players().filter((q) => !q.me && q.id);
    const s = others.map((q) => q.id + ':' + q.n).join('|');
    if (s === sig) return;
    sig = s;
    const keep = toS.value;
    toS.innerHTML = '';
    toS.add(new Option('Me', ''));
    for (const q of others) toS.add(new Option(q.n, q.id));
    toS.value = [...toS.options].some((o) => o.value === keep) ? keep : '';
  }
  refreshTargets();
  return { refreshTargets };
}
