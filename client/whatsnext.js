// The "What's next" app on the phone (the server decides it all: server/systems/whatsnext.js, goals.js, careers.js) -
// loaded the first time it opens (client/phone.js), never with the page; its styles come with it.
//   the careers  each career's rank, its bar to the next and what that unlocks (coming ones marked); tap one to lead with it
//   the cards    three: your main career's, a daily goal's, a happening near you - one button each (waypoint, call the
//                contact, accept), a small x to skip one (twice and it's gone for the day)
//   the goals    today's three with their bars and rewards, one free reroll, the streak, the weekly
//   the season   a header line: the season, its theme, the days left; Boards opens the season's leaderboards (each
//                career's and the side boards: the top 10 and your place - server seasons.js, worked out every few minutes)
// ctx: { send, setWaypoint, toast, close, refocus }
import { icon as pix } from './touchicons.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
const SLOT = { career: 'MAIN CAREER', goal: "TODAY'S GOAL", near: 'NEAR YOU' };
const C_ICON = { crime: 'rob', police: 'siren', business: 'money', side: 'star' };
const hm = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h} h ${m} min` : `${m} min`; };

const CSS = `
.wn-car{display:flex;align-items:center;gap:10px;width:100%;margin:0 0 6px;padding:8px 10px;border-radius:var(--r2);border:1px solid var(--edge);background:var(--navy2);color:var(--cream);text-align:left;cursor:pointer;font:600 var(--fs-2) var(--ui)}
.wn-car.main{border-color:var(--gold);box-shadow:inset 0 0 0 1px var(--gold-a)}
.wn-car .ic{flex:none;width:28px;height:28px}
.wn-car .nm{flex:1;min-width:0}
.wn-car .t{display:flex;justify-content:space-between;gap:6px}
.wn-car .t b{font:700 var(--fs-2) var(--pixel);color:var(--gold);letter-spacing:1px;text-transform:uppercase}
.wn-car .t i{font-style:normal;color:var(--dim);font-size:var(--fs-1)}
.wn-car .pbar{margin:4px 0 3px;height:8px}
.wn-car small{display:block;color:var(--dim);font-size:var(--fs-1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wn-car small em{font-style:normal;color:var(--heat)}
.wn-cards{display:grid;gap:8px;margin:10px 0}
.wn-card{position:relative;padding:10px 12px;border-radius:var(--r2);background:var(--navy2);border-left:3px solid var(--gold)}
.wn-card.goal{border-left-color:var(--money)}.wn-card.near{border-left-color:var(--info)}
.wn-card .sl{display:flex;gap:6px;align-items:center;font:700 var(--fs-1) var(--pixel);letter-spacing:1px;color:var(--dim);padding-right:34px}
.wn-card .sl .new{color:var(--ink);background:var(--heat);border-radius:var(--r1);padding:0 4px}
.wn-card b{display:block;margin:4px 0 2px;font:700 var(--fs-3) var(--ui);color:var(--cream)}
.wn-card small{display:block;color:var(--dim);font-size:var(--fs-1)}
.wn-card .meta{display:flex;gap:10px;margin-top:4px;font-size:var(--fs-1);color:var(--cream)}
.wn-card .meta .pay{color:var(--money);font-weight:700}
.wn-card .go{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;margin-top:8px;min-height:40px;border-radius:var(--r2);border:2px solid var(--gold);background:var(--gold);color:var(--ink);font:700 var(--fs-2) var(--ui);cursor:pointer}
.touch .wn-card .go{min-height:var(--tap)}
.wn-card .skip{position:absolute;right:6px;top:6px;width:30px;height:30px;padding:0;border-radius:var(--r2);border:1px solid var(--edge);background:var(--navy);color:var(--dim);font-size:var(--fs-3);cursor:pointer}
.wn-goal{display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--edge)}
.wn-goal .nm{flex:1;min-width:0;font-size:var(--fs-2)}
.wn-goal .nm small{display:block;color:var(--dim);font-size:var(--fs-1)}
.wn-goal .pbar{margin-top:4px;height:6px}
.wn-goal.done .nm{color:var(--money)}
.wn-goal button{flex:none;min-height:32px;padding:0 8px;border-radius:var(--r2);border:1px solid var(--gold);background:var(--navy);color:var(--cream);font:600 var(--fs-1) var(--ui);cursor:pointer}
.wn-strk{display:flex;justify-content:space-between;margin:6px 0;color:var(--dim);font-size:var(--fs-1)}
.wn-strk b{color:var(--heat)}
.wn-call{margin:6px 0;padding:8px 10px;border-radius:var(--r2);background:var(--navy3);font-size:var(--fs-1);color:var(--cream)}
.wn-call b{color:var(--gold)}
.wn-ssn{display:flex;align-items:center;gap:8px;margin:0 0 8px;font-size:var(--fs-1);color:var(--dim)}
.wn-ssn span{flex:1;min-width:0}
.wn-ssn b{font:700 var(--fs-1) var(--pixel);letter-spacing:1px;color:var(--gold);text-transform:uppercase}
.wn-ssn button{flex:none;min-height:32px;padding:0 10px;border-radius:var(--r2);border:1px solid var(--gold);background:var(--navy);color:var(--cream);font:600 var(--fs-1) var(--ui);cursor:pointer}
.wn-bd{display:flex;gap:8px;padding:4px 0;border-bottom:1px solid var(--edge);font-size:var(--fs-1);color:var(--cream)}
.wn-bd i{flex:none;width:22px;font-style:normal;color:var(--dim);text-align:right}
.wn-bd span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wn-bd em{flex:none;font-style:normal;color:var(--dim)}
.wn-bd.me{color:var(--gold)}.wn-bd.me em{color:var(--gold)}
`;
let styled = false;
function style() {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.id = 'wn-css'; s.textContent = CSS;
  document.head.appendChild(s);
}

function careerRow(c, main) {
  const pct = c.hi ? Math.max(0, Math.min(100, Math.round((100 * (c.xp - c.lo)) / (c.hi - c.lo)))) : 100;
  const nx = c.next ? `Next: ${esc(c.next.name)}${c.next.unlocks.length ? ' · ' + c.next.unlocks.map((u) => (u.soon ? `${esc(u.name)} <em>(coming)</em>` : esc(u.name))).join(' · ') : ''}` : 'The top of the ladder';
  return `<button class="wn-car${c.k === main ? ' main' : ''}" data-nxmain="${c.k}" aria-label="${esc(c.name)}: ${esc(c.title)}${c.k === main ? ' (your main career)' : ' - lead with it'}">`
    + `<span class="ic">${pix(C_ICON[c.k] || 'star')}</span><span class="nm"><span class="t"><b>${esc(c.title)}</b><i>${esc(c.name)}${c.k === main ? ' ★' : ''} · ${c.rank + 1}/8</i></span>`
    + `<i class="pbar"><i style="width:${pct}%"></i></i><small>${c.hi ? `${c.xp.toLocaleString('en-US')} / ${c.hi.toLocaleString('en-US')} XP · ` : ''}${nx}</small></span></button>`;
}
function cardHtml(c, i, all) {
  // (a slot with nothing of its own takes another card - whatsnext.js pick: the second of a kind says so)
  const again = all && all.slice(0, i).some((q) => q.slot === c.slot);
  const meta = [c.d ? `<span>${esc(c.d)}</span>` : '', c.pay && c.slot !== 'goal' ? `<span class="pay">~${money(c.pay)}</span>` : '', c.who && !c.title.includes(c.who) ? `<span>${esc(c.who)}</span>` : ''].filter(Boolean).join('');   // (a goal's pay is in its line; a contact named in the title once)
  const ic = c.btn.k === 'call' ? 'talk' : c.btn.k === 'accept' ? 'job' : 'pin';
  return `<div class="wn-card ${esc(c.slot)}"><div class="sl">${again ? 'ALSO ON OFFER' : SLOT[c.slot] || ''}${c.novel ? '<span class="new">NEW</span>' : ''}</div>`
    + `<button class="skip" data-nxskip="${esc(c.id)}" aria-label="Not now">&times;</button>`
    + `<b>${esc(c.title)}</b>${c.sub ? `<small>${esc(c.sub)}</small>` : ''}${meta ? `<div class="meta">${meta}</div>` : ''}`
    + `<button class="go" data-nxgo="${esc(c.id)}">${pix(ic)}${esc(c.btn.label)}</button></div>`;
}
function goalsHtml(G) {
  if (!G) return '';
  const row = (g) => `<div class="wn-goal${g.done ? ' done' : ''}"><span class="nm">${g.done ? '✓ ' : ''}${esc(g.t)}<small>${g.money ? `${money(g.got)} / ${money(g.n)}` : `${g.got} / ${g.n}`} · +${money(g.cash)}, +${g.xp} XP</small><i class="pbar"><i style="width:${Math.round((100 * g.got) / Math.max(1, g.n))}%"></i></i></span>`
    + (!g.done && G.rr > 0 ? `<button data-nxreroll="${g.i}" aria-label="Reroll this goal">Reroll</button>` : '') + '</div>';
  const W = G.weekly;
  return `<h3>Today</h3>${G.daily.map(row).join('')}`
    + `<div class="wn-strk"><span>All three: +${money(G.allCash * G.mult)}${G.streak ? ` · streak <b>${G.streak} day${G.streak === 1 ? '' : 's'}</b>` : ''}</span><span>new goals in ${hm(G.resetS)}</span></div>`
    + (W ? `<h3>This week</h3><div class="wn-goal${W.done ? ' done' : ''}"><span class="nm">${W.done ? '✓ ' : ''}${esc(W.t)}<small>${W.got} / ${W.n} · ${esc(W.crate)}'s worth (${money(W.cash)}) + a cosmetic token${G.tok ? ` · tokens: ${G.tok}` : ''}</small><i class="pbar"><i style="width:${Math.round((100 * W.got) / Math.max(1, W.n))}%"></i></i></span></div>` : '');
}

// the season's line, and the leaderboards (kept from the last boards answer: the state that follows doesn't carry them)
let view = 'cards', BD = null;
export function opened() { view = 'cards'; }   // (the app opened again: its cards first - client/phone.js)
function seasonLine(Z) {
  if (!Z) return '';
  return `<div class="wn-ssn"><span><b>${esc(Z.name)}</b>${Z.theme ? ` · ${esc(Z.theme)}` : ''} · ${esc(Z.note)}</span><button data-nxview aria-label="${view === 'boards' ? 'Back to the cards' : 'The leaderboards'}">${view === 'boards' ? 'Back' : 'Boards'}</button></div>`;
}
function boardsHtml(B) {
  if (!B) return '<p class="ph-empty">Loading…</p>';
  const row = (e) => `<div class="wn-bd${e.me ? ' me' : ''}"><i>${e.i}</i><span>${esc(e.n)}</span><em>${esc(e.s)}</em></div>`;
  return `<p class="ph-hint">This season's best, worked out every few minutes${B.at > 60 ? ` (${Math.round(B.at / 60)} min ago)` : ''}. The top ${B.top} of each career's board get a gold plate for good when the season ends.</p>`
    + B.boards.map((b) => `<h3>${esc(b.t)}</h3>` + (b.top.length ? b.top.map(row).join('') : '<p class="ph-empty">Nobody yet - it could be you.</p>')
      + (b.me && !b.top.some((e) => e.me) ? row({ i: b.me.i, n: 'You', s: b.me.s, me: 1 }) : !b.me && b.top.length ? '<p class="ph-hint">You\'re not on it yet.</p>' : '')).join('');
}

export function render(el, S, ctx) {
  style();
  if (!S) { el.innerHTML = '<p class="ph-empty">Loading…</p>'; return; }
  if (!S.on) { el.innerHTML = '<p class="ph-empty">Finish your first goal, then this is where the city tells you what\'s next.</p>'; return; }
  if (S.boards) BD = S.boards;
  if (view === 'boards') { el.innerHTML = seasonLine(S.season) + boardsHtml(BD); wire(el, S, ctx); return; }
  const call = S.calls && S.calls[0] && S.calls[0].ago < 3600 ? `<div class="wn-call"><b>${esc(S.calls[0].who)}:</b> "${esc(S.calls[0].text)}"</div>` : '';
  el.innerHTML = seasonLine(S.season) + S.careers.map((c) => careerRow(c, S.main)).join('')
    + (S.picked ? '' : '<p class="ph-hint">Tap a career to lead with it - your main career picks the first card.</p>')
    + call
    + `<div class="wn-cards">${S.cards.length ? S.cards.map(cardHtml).join('') : '<p class="ph-empty">Nothing right now - take a look around.</p>'}</div>`
    + goalsHtml(S.goals);
  wire(el, S, ctx);
}
function wire(el, S, ctx) {
  for (const b of el.querySelectorAll('[data-nxgo]')) b.onclick = () => { b.disabled = true; ctx.send({ t: 'phone', a: 'nextgo', id: b.dataset.nxgo }); };
  for (const b of el.querySelectorAll('[data-nxskip]')) b.onclick = () => { b.disabled = true; ctx.send({ t: 'phone', a: 'nextskip', id: b.dataset.nxskip }); };
  for (const b of el.querySelectorAll('[data-nxmain]')) b.onclick = () => { if (b.dataset.nxmain !== S.main || !S.picked) ctx.send({ t: 'phone', a: 'nextmain', c: b.dataset.nxmain }); };
  for (const b of el.querySelectorAll('[data-nxview]')) b.onclick = () => { view = view === 'boards' ? 'cards' : 'boards'; if (view === 'boards') { BD = null; ctx.send({ t: 'phone', a: 'boards' }); } render(el, S, ctx); };
  for (const b of el.querySelectorAll('[data-nxreroll]')) b.onclick = () => { b.disabled = true; ctx.send({ t: 'phone', a: 'reroll', i: Number(b.dataset.nxreroll) }); };
  ctx.refocus && ctx.refocus();
}
// the server's answer to a button: a waypoint to set (and the phone away), a refusal to show
export function onAnswer(S, ctx) {
  if (S.err) ctx.toast(S.err, 'warn');
  if (S.way) { ctx.setWaypoint({ x: S.way.x, y: S.way.y, label: S.way.label }); ctx.toast(`Waypoint set: ${S.way.label}`, 'info'); }
  if (S.close) ctx.close();
}
