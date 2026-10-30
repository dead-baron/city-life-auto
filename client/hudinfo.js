// The HUD's information (UI-4, the overhaul the owner approved on 2026-10-24; his bar: "information should come and go
// as necessary but not linger and take up visual real estate"). Loaded with the HUD (client/hud.js starts it as the
// game opens), out of the page's first load. What it keeps:
//   - the vitals' numbers, and the status line in plain words: who you are (the faction chip), Samaritan, Criminal XP,
//     what's on your record, what's wearing off (a phone shows only what's happening to you now);
//   - progressive disclosure: the stars only while you're wanted (and a few seconds after), the weapon plate small
//     with your fists out and nothing going on, gone on a phone when there's nothing to switch to;
//   - the job card under the minimap: the job, the call it's on, step N of M, the objective, how far, the time left -
//     big for a few seconds when a step comes in (or on a tap or a click), then a one-line chip; the pay when it's
//     done, then it goes;
//   - the vehicle chip: the name, the speed, the height in the air - only in a vehicle;
//   - the first-time hint strips (driving, flying, a horse, a boat, a board, swimming, the cinematic mode): the keys,
//     the pad's buttons or the touch slots' own names, the first HINT_TIMES times on this device for this character;
//   - on a keyboard or a pad, the prompt kept by you (below you on the screen); on touch it has its slot above the thumbs.
// hud.js calls me(me, prev) with each self record; main.js frame(f) each frame and hint(state) for the cinematic mode.
import { WEAPONS } from '../shared/items.js';
import { VEHICLE_BY_INDEX } from '../shared/vehicles.js';
import { KB, PAD, TOUCH } from '../shared/controls.js';
import { TOUCH_STATES } from '../shared/touchcontrols.js';
import { input } from './input.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
export const PX_PER_M = 32;   // (the world's scale: a tile, 32 px, a metre)
export const fmtDist = (px) => (px >= 1000 * PX_PER_M ? `${(px / 1000 / PX_PER_M).toFixed(1)} KM` : `${Math.max(1, Math.round(px / PX_PER_M / 10) * 10)} M`);
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
export const JOB_BIG_MS = 5000;     // the card stays big this long when a step comes in or it's tapped, then folds to a chip
export const JOB_PAID_MS = 3500;    // the pay shows this long on the card
export const STARS_AFTER_MS = 8000; // the stars stay this long after the police stop looking
export const HINT_TIMES = 3;        // a hint strip shows the first this many times
export const HINT_MS = 7000;        // and stays up this long (or till you stop doing it)

// ---- the status line ---------------------------------------------------------------------------------------------
// [label, value, tone] chips; flag: what's happening to you now (a phone shows only those and the faction when it isn't
// a citizen's); the role chip first
export function statusChips(me) {
  const out = [];
  const role = me.faction === 'enforcer' ? `Police · ${me.rank || 'Officer'}` : { citizen: 'Citizen', criminal: 'Criminal', hunter: 'Bounty hunter' }[me.faction] || 'Citizen';
  out.push({ k: 'role', t: role, cls: me.faction || 'citizen' });
  if (me.faction === 'enforcer' && me.misconduct && me.misconduct.n) out.push({ k: 'flag', t: 'Misconduct', v: `${me.misconduct.n}/${me.misconduct.max}`, cls: me.misconduct.n >= me.misconduct.max ? 'bad' : 'warn' });
  out.push({ k: 'stat', t: 'Samaritan', v: String(me.sam | 0), cls: 'good' });
  out.push({ k: 'stat', t: 'Criminal XP', v: String(me.cexp | 0), cls: 'warn' });
  if (me.felonies > 0 && me.faction !== 'criminal') out.push({ k: 'stat', t: 'Record', v: `${me.felonies} ${me.felonies === 1 ? 'felony' : 'felonies'}`, cls: 'warn' });
  if (me.bleeding) out.push({ k: 'flag', t: 'Bleeding', cls: 'bad' });
  if (me.peak > 0) out.push({ k: 'flag', t: me.disguised ? 'Police remember you (disguised)' : 'Police remember you', v: '★'.repeat(me.peak), cls: 'warn' });   // (PeakWantedLevelMemory: server law.js)
  if (me.bounty > 0) out.push({ k: 'flag', t: 'Bounty', v: money(me.bounty) + (me.btime ? ` · ${Math.max(1, Math.ceil(me.btime.left / 60))}m${me.btime.paused ? ' (paused)' : ''}` : ''), cls: 'bad' });
  const B = me.buffs || {};
  for (const [k, n] of [['coffee', 'Coffee'], ['energy', 'Energy'], ['wine', 'Wine'], ['scent', 'Scent']]) if (B[k] > 0) out.push({ k: 'flag', t: n, v: `${Math.ceil(B[k])}s`, cls: 'good' });
  if (B.hearty > 0) out.push({ k: 'flag', t: 'Well fed', v: `${Math.ceil(B.hearty / 60)}m`, cls: 'good' });
  if (me.light) out.push({ k: 'flag', t: 'Light on', cls: 'good' });
  if (me.ghost) out.push({ k: 'flag', t: 'Ghost', cls: 'info' });
  return out;
}
const chipHtml = (c) => `<span class="hchip ${c.k} ${c.cls}">${esc(c.t)}${c.v ? ` <b>${esc(c.v)}</b>` : ''}</span>`;
export const statusHtml = (me) => statusChips(me).map(chipHtml).join('');

// ---- the job card ------------------------------------------------------------------------------------------------
// the card's words for the self record's job (server phone.js jobCardInfo): { head, obj, step }
export function jobWords(j) {
  if (!j) return null;
  let obj = String(j.text || '').replace(/^▶\s*/, '');
  if (j.k) obj = obj.replace(/^[A-Za-z&' -]{2,24}:\s+/, '');   // ("Taxi: cruising for a fare" under TAXI: "Cruising for a fare")
  obj = obj.charAt(0).toUpperCase() + obj.slice(1);
  const head = [j.k ? j.k.toUpperCase() : '', j.n ? `${String(j.u || 'Call').toUpperCase()} ${j.n}` : ''].filter(Boolean).join(' · ');
  return { head, obj, step: j.step ? `STEP ${j.step[0]} OF ${j.step[1]}` : '' };
}
// what makes a new step (the card comes up big and says so)
// the card's markup: o { big, done, dist ('640 M'), time ('SHIFT 9:58'), paid (the pay, $) }
export function jobHtml(j, o = {}) {
  const w = jobWords(j), paid = o.paid > 0 ? `<span class="jc-paid">${o.done ? 'DONE · ' : 'PAID '}+${money(o.paid)}</span>` : '';
  return o.big
    ? `<div class="jc-h"><span>${esc(w.head || 'THE JOB')}</span>${o.time ? `<span class="jc-t">${o.time}</span>` : ''}</div><div class="jc-o">${esc(o.done ? 'Job done' : w.obj)}</div>${o.dist || paid || w.step ? `<div class="jc-d"><span>${o.dist || ''}</span>${paid || (w.step && !o.done ? `<span class="jc-s">${w.step}</span>` : '')}</div>` : ''}`
    : `<i class="jc-dot"></i>${o.clock && o.time ? `<span class="jc-t">${o.time}</span>` : ''}<span class="jc-o">${esc(w.obj)}</span>${o.dist ? `<span class="jc-d">${o.dist}</span>` : ''}${paid}`;   // (a run against the clock: its clock on the chip too - Crazy Taxi)
}
export const jobKey = (j) => (j ? `${j.k || ''}|${j.n || 0}|${j.step ? j.step.join('/') : j.stage || ''}|${j.text || ''}` : '');

// ---- the hint strips ---------------------------------------------------------------------------------------------
// each state's: [action, what it does] - the action named as shared/controls.js names it; per device where it differs
export const HINTS = {
  drive: { all: [['move', 'steer and drive'], ['dive', 'handbrake'], ['horn', 'horn'], ['vehicle', 'get out']], pad: [['steer', 'steer'], ['gas', 'gas'], ['brake', 'brake'], ['vehicle', 'get out']] },
  air: { all: [['move', 'fly'], ['climb', 'climb'], ['descend', 'down'], ['vehicle', 'get out once landed']] },
  horse: { all: [['move', 'ride'], ['sprint', 'gallop'], ['dive', 'stop'], ['vehicle', 'get off']] },
  boat: { all: [['move', 'steer'], ['dive', 'brake'], ['horn', 'horn'], ['vehicle', 'get off at a dock']], pad: [['steer', 'steer'], ['gas', 'gas'], ['brake', 'brake'], ['vehicle', 'get off']] },
  board: { all: [['move', 'push and steer'], ['dive', 'ollie'], ['trick', 'tricks'], ['vehicle', 'step off']] },
  swim: { all: [['move', 'swim for the shore'], ['vehicle', 'climb into a boat']] },
  cine: { kbm: [['F2', 'the HUD back'], ['F4', 'the camera panel'], ['F8', 'a picture'], ['ESC', 'back to you']], pad: [['Y', 'the camera panel'], ['X', 'a picture'], ['B', 'back to you']], touch: [['TAP', 'the camera bar'], ['MENU', 'leave the cinematic mode']] },
};
export const HINT_STATES = Object.keys(HINTS);
const TOUCH_STATE_OF = { drive: 'drive', air: 'air', horse: 'horse', boat: 'boat', board: 'board', swim: 'swim' };
// the strip for a state on a device ('kbm' | 'pad' | 'touch'): [[glyph, words, kind]] - kind 'key' | 'pad' | 'touch'
export function hintStrip(state, dev) {
  const H = HINTS[state];
  if (!H) return [];
  const kind = dev === 'pad' ? 'pad' : dev === 'touch' ? 'touch' : 'key';
  const list = H[dev] || H.all;
  if (!list) return [];
  if (state === 'cine') return list.map(([g, w]) => [g, w, kind]);
  const slots = TOUCH_STATES[TOUCH_STATE_OF[state]] || {};
  const touchName = (a) => { for (const k in slots) if (slots[k][0] === a) return slots[k][1]; return TOUCH[a] || a.toUpperCase(); };
  // (on touch the move stick goes without saying in a vehicle or on a board: the slots' own names, what each does)
  const L = dev === 'touch' && ['drive', 'air', 'horse', 'boat', 'board'].includes(state) ? list.filter(([a]) => a !== 'move') : list;
  return L.map(([a, w]) => [dev === 'pad' ? (PAD[a] || [a.toUpperCase()])[0] : dev === 'touch' ? (a === 'move' ? 'LEFT THUMB' : touchName(a)) : (KB[a] || a.toUpperCase()), w, kind]);
}
// how many times each strip has shown, per character, on this device (localStorage - a convenience: none in a private
// window, and the strips just show again)
const HKEY = 'cla.hints';
export function hintCounts(store, pid) {
  try { const v = JSON.parse(store.getItem(HKEY) || '{}'); return (v && v[pid]) || {}; } catch { return {}; }
}
export function hintDue(store, pid, state, times = HINT_TIMES) { return HINTS[state] ? (hintCounts(store, pid)[state] || 0) < times : false; }
export function hintSeen(store, pid, state) {
  try {
    const v = JSON.parse(store.getItem(HKEY) || '{}') || {}, c = (v[pid] ||= {});
    c[state] = (c[state] || 0) + 1;
    store.setItem(HKEY, JSON.stringify(v));
  } catch { /* storage blocked */ }
}
export const hintHtml = (list) => list.map(([g, w, k]) => `<span class="hint"><span class="${k === 'pad' ? 'g-pad g-sys' : k === 'touch' ? 'g-touch' : 'g-key'}">${esc(g)}</span>${esc(w)}</span>`).join('');
const dev = () => (input.device === 'gamepad' ? 'pad' : input.device === 'touch' ? 'touch' : 'kbm');
let store = null;
try { store = globalThis.localStorage || null; } catch { store = null; }
const memStore = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };

// ---- the HUD's information ---------------------------------------------------------------------------------------
// H: the HUD (client/hud.js); ctx (main.js, once it's in): { pos() your place in the world, self() yours on the screen,
// pid(), openLog() }
export function createInfo(H) {
  const st = store || memStore();
  const I = { ctx: null, sig: '', wantedAt: 0, job: { key: '', at: 0, bigUntil: 0, j: null, paid: 0, paidUntil: 0, left: 0, leftAt: 0, gone: false }, veh: { sig: '', at: 0, lx: 0, ly: 0, lt: 0, v: 0 }, hint: { state: '', until: 0 }, stN: -1, pr: { x: -1, y: -1 } };
  const jobEl = $('job');
  if (jobEl) {
    jobEl.setAttribute('role', 'button');
    jobEl.addEventListener('click', () => { const J = I.job; J.bigUntil = jobEl.classList.contains('big') ? 0 : performance.now() + JOB_BIG_MS; drawJob(performance.now()); });
  }

  function me(me, prev) {
    const now = performance.now();
    // the vitals' numbers
    const hn = $('hp-n'); if (hn) { const v = String(Math.max(0, Math.round(me.hp))); if (hn.textContent !== v) hn.textContent = v; }
    // the status line
    const chips = statusChips(me), sig = chips.map(chipHtml).join('');
    if (sig !== I.sig) { I.sig = sig; const s = $('status'); if (s) s.innerHTML = sig; }
    // the stars: while wanted, and a few seconds after
    if (me.wanted > 0) I.wantedAt = now;
    const stars = $('stars');
    if (stars) { stars.classList.toggle('recent', !(me.wanted > 0) && I.wantedAt > 0 && now - I.wantedAt < STARS_AFTER_MS); }
    // the weapon plate: small with your fists out and nothing going on; on a phone gone with nothing to switch to
    const w = WEAPONS[me.weapon] || WEAPONS.fists, calm = me.weapon === 'fists' && !(me.wanted > 0) && !me.fight;
    const wp = $('weapon');
    if (wp) { wp.classList.toggle('compact', calm); wp.classList.toggle('none', calm && (me.weapons || []).length <= 1); wp.classList.toggle('gun', w.type === 'gun'); }
    // the job card: a new step comes up big; the pay on it once it's done
    const J = I.job, j = me.job && !me.dead ? me.job : null, key = jobKey(j);
    const paidNow = prev && me.cash > prev.cash && (key !== J.key || (J.key && !j)) ? me.cash - prev.cash : 0;
    if (paidNow > 0 && J.key) { J.paid = paidNow; J.paidUntil = now + JOB_PAID_MS; }
    if (key !== J.key) {
      const was = J.key;
      J.key = key;
      if (j) { J.bigUntil = now + JOB_BIG_MS; J.at = now; J.isNew = !!was; }
    }
    if (j) { J.j = j; if (j.left !== undefined) { J.left = j.left; J.leftAt = now; } }
    else if (!(J.paidUntil > now)) J.j = null;
    drawJob(now);
  }

  function drawJob(now) {
    const el = $('job'), J = I.job;
    if (!el) return;
    if (!J.key && !(J.paidUntil > now)) J.j = null;   // (done, and the pay's been shown)
    const j = J.j;
    if (!j) { if (!el.classList.contains('hidden')) { el.classList.add('hidden'); el.innerHTML = ''; el.dataset.sig = ''; } return; }
    const done = !J.key && J.paidUntil > now, big = done || now < J.bigUntil || now < J.paidUntil;
    const w = jobWords(j), ctx = I.ctx;
    let dist = '';
    if (!done && ctx && (j.x || j.y)) { const p = ctx.pos(); if (p) dist = fmtDist(Math.hypot(j.x - p.x, j.y - p.y)); }
    const left = J.left ? Math.max(0, J.left - (now - J.leftAt) / 1000) : 0;
    const run = j.s === 'clock', fl = run && j.fl !== undefined ? Math.max(0, j.fl - Math.floor((now - J.leftAt) / 1000)) : -1;
    const time = left > 0 && !done ? `${j.s === 'shift' && input.device !== 'touch' ? 'SHIFT ' : ''}${clock(left)}${fl >= 0 ? ` · FARE ${fl}s` : ''}` : '';
    const paid = J.paidUntil > now && J.paid > 0 ? J.paid : 0;
    const sig = `${big}|${w.head}|${w.obj}|${dist}|${time}|${paid}|${J.isNew && now - J.at < 1600}`;
    if (el.dataset.sig === sig) return;
    el.dataset.sig = sig;
    el.classList.remove('hidden');
    el.classList.toggle('big', big); el.classList.toggle('chip', !big);
    el.classList.toggle('new', !!(J.isNew && now - J.at < 1600));
    el.classList.toggle('paid', !!paid);
    el.classList.toggle('hot', run && left > 0 && left < 10);
    el.setAttribute('aria-label', big ? 'The job: tap to fold' : 'The job: tap for the details');
    el.innerHTML = jobHtml(j, { big, done, dist, time, paid, clock: run });
  }

  // each frame: f { veh (the vehicle you're in, or null), driver, board, swim, cine, now, pred (S.pred), stam }
  function frame(f) {
    const now = f.now;
    // the stamina's number (its bar: main.js)
    const sn = $('st-n'); if (sn && f.stam !== undefined) { const v = Math.round(f.stam); if (v !== I.stN) { I.stN = v; sn.textContent = String(Math.max(0, v)); } }
    // the vehicle chip
    const V = I.veh, vc = $('vchip');
    if (vc) {
      const e = f.veh, def = e && e.d ? VEHICLE_BY_INDEX[e.d.m] : null;
      if (!def) { if (V.sig) { V.sig = ''; vc.classList.add('hidden'); } }
      else if (now - V.at > 200) {
        let sp = 0;
        if (f.driver && f.pred && f.pred.kind === 'veh') sp = Math.hypot(f.pred.s.vx, f.pred.s.vy);
        else { const dt = (now - V.lt) / 1000; if (V.lt && dt > 0) sp = Math.hypot((e.rx ?? e.x) - V.lx, (e.ry ?? e.y) - V.ly) / dt; V.lx = e.rx ?? e.x; V.ly = e.ry ?? e.y; V.lt = now; }
        V.v += (sp - V.v) * 0.5;
        V.at = now;
        const kmh = Math.round(V.v / PX_PER_M * 3.6), alt = def.kind === 'air' ? Math.round(Math.max(0, (f.driver && f.pred && f.pred.s.alt !== undefined ? f.pred.s.alt : e.ralt || 0)) / PX_PER_M) : null;
        const name = def.horse ? 'Horse' : def.name;
        const sig = `${name}|${kmh}|${alt}`;
        if (sig !== V.sig) {
          V.sig = sig;
          vc.innerHTML = `<b>${esc(name)}</b>${alt !== null ? `<span class="vc-alt">ALT ${alt} M</span>` : ''}<span class="vc-spd">${kmh} KM/H</span>`;
          vc.classList.toggle('air', alt !== null);
          vc.classList.remove('hidden');
        }
      }
    }
    // the job card: its distance and its clock run on; folds to a chip after a few seconds
    if (I.job.j && now - (I.job.drawn || 0) > 250) { I.job.drawn = now; drawJob(now); }
    // the hint strips: the first few times you're doing each
    const vd = f.veh && f.veh.d ? VEHICLE_BY_INDEX[f.veh.d.m] : null;
    const state = f.cine ? 'cine' : !f.veh ? (f.board ? 'board' : f.swim ? 'swim' : '') : !f.driver || !vd ? '' : vd.kind === 'air' ? 'air' : vd.horse ? 'horse' : vd.kind === 'boat' ? 'boat' : 'drive';
    if (state !== I.hint.state) { I.hint.state = state; if (state) hint(state, now); else showStrip(null); }
    else if (I.hint.until && now > I.hint.until) showStrip(null);
    // a keyboard or a pad: the prompt by you, under your feet on the screen
    const pr = $('helpbox');
    if (pr && I.ctx && input.device !== 'touch') {
      const s = I.ctx.self && I.ctx.self();
      if (s) {
        const x = Math.round(Math.max(160, Math.min(innerWidth - 160, s.x))), y = Math.round(Math.max(100, Math.min(innerHeight - 150, s.y + 40)));
        if (Math.abs(x - I.pr.x) > 3 || Math.abs(y - I.pr.y) > 3) { I.pr.x = x; I.pr.y = y; pr.style.left = x + 'px'; pr.style.top = y + 'px'; }
      }
    } else if (pr && I.pr.x >= 0) { I.pr.x = I.pr.y = -1; pr.style.left = pr.style.top = ''; }
  }

  // a hint strip for a state, if it's due (the cinematic mode asks directly: client/director.js)
  function hint(state, now = performance.now()) {
    const pid = (I.ctx && I.ctx.pid && I.ctx.pid()) || 'me';
    if (!hintDue(st, pid, state)) { showStrip(null); return false; }
    hintSeen(st, pid, state);
    showStrip(hintStrip(state, dev()));
    I.hint.until = now + HINT_MS;
    return true;
  }
  function showStrip(list) {
    const el = $('hints');
    if (!el) return;
    if (!list || !list.length) { I.hint.until = 0; if (!el.classList.contains('off')) el.classList.add('off'); return; }
    el.innerHTML = hintHtml(list);
    el.classList.remove('off', 'hidden');
  }

  return { me, frame, hint, showStrip, drawJob, setCtx(c) { I.ctx = c; }, state: I };
}
