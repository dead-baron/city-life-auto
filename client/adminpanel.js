// The in-game admin panel (the owner, 11-16: "an owner founder dev admin kind of account that I can fix things, observe,
// test, gift things to people, TP people around for fun, interact and help with the players"): a page of the debug menu
// (client/devmenu.js 'admin' - admin mode, admins and the owner only), laid out by the debug menu's own classes for touch,
// a pad and keys. Loaded the first time it's opened. Everything it does is a staff command on the server (server/admin.js:
// roster, watch, tpto, bring, send, heal, revive, rescue, endjob, gift, mute, kick, ban, prison, founder) - the role checked
// there for every one, each one in the admin log; the page only asks.
//   - the founder's switch (the owner): his Dead Baron look on or off while he's in admin mode (server/founder.js);
//   - the console (/admin/, a one-time link), the free camera, Stop watching;
//   - everyone online, a card each: who, where, what they're doing, down / wanted / in custody; tap a card for its actions:
//     Watch, Go to, Bring, Send to a place, Heal or Revive, Unstick, End job, Gift, and the moderation ones (Mute, Kick,
//     Prison, Ban - the harsh ones ask again on a second press).
const CSS = `#dev .adm-top { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 6px; margin: 4px 0 8px; }
#dev .adm-watch { padding: 8px 10px; margin: 4px 0 8px; border: 2px solid var(--info); border-radius: var(--r2); color: var(--info-hi); font: 700 var(--fs-2) var(--ui); display: flex; align-items: center; gap: 10px; }
#dev .adm-watch button { width: auto !important; margin: 0 0 0 auto !important; }
#dev .adm-p { margin: 6px 0; padding: 8px 10px; border: 1px solid var(--edge); border-radius: var(--r2); background: rgba(7, 11, 22, .35); }
#dev .adm-p.open { border-color: var(--gold); }
#dev .adm-p > button.adm-who { display: flex !important; align-items: center; gap: 8px; margin: 0 !important; min-height: 44px; text-align: left; background: transparent !important; border: 0 !important; padding: 0 !important; }
#dev .adm-who b { font: 700 var(--fs-3) var(--ui); color: var(--cream); }
#dev .adm-who b.gu { color: #a3a8b0; font-weight: 600; }
#dev .adm-who .cr { color: var(--gold); }
#dev .adm-who small { display: block; color: var(--dim); font: 500 var(--fs-1) var(--ui); }
#dev .adm-who em { font-style: normal; font: 700 var(--fs-1) var(--ui); padding: 0 6px; border-radius: 8px; background: var(--navy3); color: var(--dim); margin-left: 4px; }
#dev .adm-who em.bad { background: #4a1d18; color: #ffb3a8; } #dev .adm-who em.gd { background: #3a2f12; color: var(--gold-hi); }
#dev .adm-acts { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 6px; margin-top: 8px; }
#dev .adm-acts button { margin: 0 !important; }
#dev .adm-acts .warn { border-color: var(--heat) !important; } #dev .adm-acts .danger { border-color: var(--danger) !important; color: var(--danger-hi) !important; }
#dev .adm-acts .danger.armed { background: var(--danger) !important; color: var(--ink) !important; }
#dev .adm-sheet { margin-top: 8px; padding: 8px; border-top: 1px solid var(--line); display: grid; gap: 6px; }
#dev .adm-sheet .row { display: flex; gap: 6px; flex-wrap: wrap; }
#dev .adm-sheet .row > * { flex: 1 1 120px; min-height: 40px; }
#dev .adm-sheet select, #dev .adm-sheet input { background: var(--navy); color: var(--cream); border: 1px solid var(--gold-a); border-radius: var(--r1); font: 600 var(--fs-2) var(--ui); padding: 6px 8px; }
#dev .adm-note { color: var(--dim); font: 500 var(--fs-1) var(--ui); margin: 2px 0; }`;
let styled = false;
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ST = { open: null, sheet: null, data: null, armed: null, armT: 0 };

// fill the debug menu's body with the panel. ctx: { S, send, admin(a, args) -> Promise<reply>, staffPage(page), toast(t, tone),
// spectate(), places() -> [{ name, x, y, group }], close(), rerender() }
export function fill(body, ctx) {
  if (!styled && typeof document !== 'undefined') { document.head.appendChild(Object.assign(document.createElement('style'), { textContent: CSS })); styled = true; }
  body.innerHTML = '<div class="adm-note">Loading who\'s online…</div>';
  ctx.admin('roster').then((r) => {
    if (!body.isConnected) return;
    if (!r || !r.ok) { body.innerHTML = `<div class="adm-note">${esc((r && r.err) || 'No answer from the server.')}</div>`; return; }
    ST.data = r.data;
    draw(body, ctx);
  });
}

function act(ctx, body, a, args, ok) {
  return ctx.admin(a, args).then((r) => {
    if (r && r.ok) { if (ok) ctx.toast(typeof ok === 'function' ? ok(r) : ok, 'good'); } else ctx.toast((r && r.err) || 'Not done.', 'warn');
    setTimeout(() => { if (body.isConnected) fill(body, ctx); }, 350);
    return r;
  });
}

function draw(body, ctx) {
  const D = ST.data, S = ctx.S;
  body.innerHTML = '';
  const top = document.createElement('div'); top.className = 'adm-top'; body.appendChild(top);
  const btn = (parent, text, cls, run) => { const b = document.createElement('button'); b.textContent = text; if (cls) b.className = cls; b.onclick = run; parent.appendChild(b); return b; };
  if (D.founder) {
    const f = btn(top, D.founder.on ? '♛ Founder look: ON' : '♛ Founder look: off', D.founder.on ? 'on dev-top' : 'dev-top', () => act(ctx, body, 'founder', { on: !D.founder.on }, (r) => (r.data.on ? 'Founder look on - everyone sees the Dead Baron.' : 'Founder look off - your own character.')));
    f.title = 'Your Dead Baron look, while you\'re in admin mode';
  }
  btn(top, '📊 Open the console', '', () => ctx.staffPage('console').then((r) => { if (r && !r.ok) ctx.toast(r.err || 'Not available.', 'warn'); }));
  btn(top, '🎥 Free camera', '', () => ctx.spectate());
  if (S.watch) {
    const w = document.createElement('div'); w.className = 'adm-watch'; w.innerHTML = `<span>👁 Watching ${esc(S.watch.n)}</span>`; body.appendChild(w);
    btn(w, 'Stop watching', '', () => stopWatch(ctx, body));
  }
  const note = document.createElement('div'); note.className = 'adm-note';
  note.textContent = `${D.l.length} online · tap a player for the actions · everything here is logged`;
  body.appendChild(note);
  for (const q of D.l) body.appendChild(card(q, ctx, body, btn));
}

function stopWatch(ctx, body) {
  ctx.S.watch = null;
  return act(ctx, body, 'watch', { id: null }, 'Back to your own character.');
}

function card(q, ctx, body, btn) {
  const el = document.createElement('div');
  el.className = `adm-p${ST.open === q.id ? ' open' : ''}`;
  const tags = [q.me ? '<em>you</em>' : '', q.role ? `<em class="gd">${esc(q.role)}</em>` : '', q.gu ? '<em>guest</em>' : '', q.down ? '<em class="bad">down</em>' : '', q.w ? `<em class="bad">${'★'.repeat(Math.min(5, q.w))}</em>` : '', q.cust ? '<em class="bad">custody</em>' : '', q.muted ? '<em>muted</em>' : ''].join('');
  const who = btn(el, '', 'adm-who', () => { ST.open = ST.open === q.id ? null : q.id; ST.sheet = null; draw(body, ctx); });
  who.innerHTML = `<span><b class="${q.gu ? 'gu' : ''}">${q.fo ? '<span class="cr">♛</span> ' : ''}${esc(q.n)}</b>${tags}<small>${esc(q.d || 'indoors')}${q.job ? ' · ' + esc(q.job) : ''} · ${q.hp}% health · ${q.sess} min on</small></span>`;
  if (ST.open !== q.id) return el;
  const A = document.createElement('div'); A.className = 'adm-acts'; el.appendChild(A);
  const go = (a, label, args = {}, cls = '', ok = null) => btn(A, label, cls, () => act(ctx, body, a, { id: q.id, ...args }, ok || `${label}: done.`));
  if (!q.me) {
    btn(A, '👁 Watch', '', () => ctx.admin('watch', { id: q.id }).then((r) => {
      if (!r || !r.ok) { ctx.toast((r && r.err) || 'Not done.', 'warn'); return; }
      ctx.S.watch = { eid: r.data.eid, n: r.data.n, at: performance.now() };
      ctx.toast(`Watching ${r.data.n} - the debug menu's Admin page stops it.`, 'info');
      ctx.close();
    }));
    go('tpto', '📍 Go to them', {}, '', `You're with ${q.n}.`);
    go('bring', '🧲 Bring to me', {}, '', `${q.n} is with you.`);
  }
  btn(A, '🗺 Send to a place…', '', () => { ST.sheet = ST.sheet === 'send' ? null : 'send'; draw(body, ctx); });
  if (q.down) go('revive', '💉 Revive', {}, '', `${q.n} is back up.`); else go('heal', '❤ Heal', {}, '', `${q.n} is patched up.`);
  go('rescue', '🧭 Unstick (to the street)', {}, '', `${q.n} is out on the street.`);
  if (q.job) go('endjob', `⏹ End: ${q.job}`, {}, 'warn', `${q.n}'s ${q.job} is over.`);
  btn(A, '🎁 Gift…', '', () => { ST.sheet = ST.sheet === 'gift' ? null : 'gift'; draw(body, ctx); });
  if (!q.me) {
    go(q.muted ? 'unmute' : 'mute', q.muted ? '🔈 Unmute chat' : '🔇 Mute chat (1 h)', { hours: 1 }, 'warn');
    harsh(A, btn, ctx, body, q, 'prison', '⛓ Prison (15 min)', { mins: 15, why: 'by an admin' });
    harsh(A, btn, ctx, body, q, 'kick', '👢 Kick', { why: '' });
    harsh(A, btn, ctx, body, q, 'ban', '⛔ Ban (1 day)', { hours: 24, why: 'by an admin' });
  }
  if (ST.sheet === 'gift') el.appendChild(giftSheet(q, ctx, body));
  if (ST.sheet === 'send') el.appendChild(sendSheet(q, ctx, body));
  return el;
}
// the harsh ones ask again: the first press arms it (red) for a few seconds, the second does it
function harsh(A, btn, ctx, body, q, a, label, args) {
  const key = `${q.id}:${a}`, armed = ST.armed === key && performance.now() - ST.armT < 4000;
  const b = btn(A, armed ? `Sure? ${label.replace(/^\S+ /, '')}` : label, `danger${armed ? ' armed' : ''}`, () => {
    if (ST.armed === key && performance.now() - ST.armT < 4000) { ST.armed = null; act(ctx, body, a, { id: q.id, ...args }, `${label.replace(/^\S+ /, '')}: done.`); return; }
    ST.armed = key; ST.armT = performance.now(); draw(body, ctx);
  });
  return b;
}

function giftSheet(q, ctx, body) {
  const G = ST.data.gifts, el = document.createElement('div'); el.className = 'adm-sheet';
  const kinds = [['money', 'Money'], ['item', 'Item'], ['weapon', 'Weapon'], ['color', 'Name color'], ['plate', 'Title plate']];
  const opts = (L) => L.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('');
  el.innerHTML = `<div class="row"><select class="g-kind">${opts(kinds)}</select><select class="g-what"></select><input class="g-n" type="number" min="1" value="1" inputmode="numeric"></div><div class="row"><button class="dev-qg-go g-go">🎁 Send the gift</button></div><div class="adm-note">It lands in their bank, bag or style counter, with a note from you.</div>`;
  const kind = el.querySelector('.g-kind'), what = el.querySelector('.g-what'), n = el.querySelector('.g-n');
  const sync = () => {
    const k = kind.value;
    what.innerHTML = k === 'money' ? opts(G.money.map((m) => [String(m), `$${m.toLocaleString('en-US')}`])) : opts(k === 'item' ? G.items : k === 'weapon' ? G.weapons : k === 'color' ? G.colors : G.plates);
    n.style.display = k === 'item' || k === 'weapon' ? '' : 'none';
    n.placeholder = k === 'weapon' ? 'magazines' : 'how many';
  };
  kind.onchange = sync; sync();
  el.querySelector('.g-go').onclick = () => {
    const k = kind.value, args = k === 'money' ? { kind: k, n: Number(what.value) } : { kind: k, what: what.value, n: Number(n.value) || 1 };
    ST.sheet = null;
    act(ctx, body, 'gift', { id: q.id, ...args }, (r) => `Gift sent to ${q.n}: ${r.data.label}.`);
  };
  return el;
}

function sendSheet(q, ctx, body) {
  const el = document.createElement('div'); el.className = 'adm-sheet';
  const P = ctx.places();
  el.innerHTML = `<div class="row"><select class="s-to">${P.map((p, i) => `<option value="${i}">${esc(p.group ? `${p.group}: ` : '')}${esc(p.name)}</option>`).join('')}</select></div><div class="row"><button class="dev-qg-go s-go">🗺 Send ${esc(q.n)} there</button></div>`;
  el.querySelector('.s-go').onclick = () => {
    const p = P[Number(el.querySelector('.s-to').value)];
    if (!p) return;
    ST.sheet = null;
    act(ctx, body, 'send', { id: q.id, place: p.name, x: Math.round(p.x), y: Math.round(p.y) }, (r) => `${q.n} is at ${r.data.place}.`);
  };
  return el;
}
