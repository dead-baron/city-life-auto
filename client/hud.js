// DOM HUD: health/stamina, money, wanted stars, chrono clock, faction, toasts, prompt,
// job tracker, weapon panel, shop menus, death screen, radar + big map.
import { logNote, noteLine, promptWords, promptFades } from './notelog.js';
import { WEAPONS, ITEMS, PACK_TIERS } from '../shared/items.js';
import { T, TILE, gameClock, WEATHER } from '../shared/constants.js';
import { glyph, formatPrompt, localizeText, keyName } from './glyphs.js';
import { input } from './input.js';
import { EVENT_KINDS } from '../shared/worldevents.js';
import { DISTRICTS } from '../shared/mapcore.js';
import { weaponIcon } from './render/peds.js';
import { icon, paintIcons, drawIcon, glyph as monoGlyph, glyphOfWeapon, setActKind, iconOf, setMelee } from './touchicons.js';
import { CALM_PROMPT_S, CALM_HUD_S, SAFETY_CONFIRM_S, PROMPT_FADE_S } from '../shared/rules-page.js';

const $ = (id) => document.getElementById(id);
// what Act would do is a crime (1) or a felony (2), on the prompt's plate and on the touch button it pulses (style.css)
// the action button's glyph for the kind of what it offers (client/touchicons.js actKind; touchslots.js draws the same
// when it places the button): swapped only when the kind changes
function actGlyph(kind) {
  const b = document.querySelector('#tbtns [data-b="action"]');
  if (!b || b.dataset.kind === kind) return;
  b.dataset.kind = kind;
  const g = b.querySelector('svg.gl');
  if (g) g.outerHTML = monoGlyph(iconOf('action'));
}
export function crimeMarks(el, pcr) { el.classList.toggle('crime', pcr > 0); el.classList.toggle('felony', pcr === 2); }
// what's faded by a campfire (#375), from when you sat down and last did anything (ms): { prompt, hud }
export function calmState(sitAt, activeAt, now) {
  const idle = sitAt ? (now - Math.max(sitAt, activeAt || 0)) / 1000 : 0;
  return { prompt: idle > CALM_PROMPT_S, hud: idle > CALM_HUD_S };
}
const thumbs = new Map();
function weaponThumb(i) { if (!thumbs.has(i)) thumbs.set(i, weaponIcon(i).toDataURL()); return thumbs.get(i); }
// a shop's rows (UI-10, UIC-18): a gun's damage and range as eight steps, from the weapons' own numbers; the kind of each
// row for a gun store's tabs; the face beside a conversation (the place's icon: there are no portraits yet)
const WEAPON_BY_I = new Map(Object.values(WEAPONS).map((w) => [w.i, w]));
const LONG = new Set(['shotgun', 'rifle', 'smg', 'prifle', 'psniper', 'passault', 'pshotgun', 'huntrifle', 'varmint', 'arifle']);
const steps = (v) => Math.max(1, Math.min(8, Math.round(v * 8)));
const gunDmg = (w) => steps((w.dmg * (w.pellets || 1)) / (w.cd || 1) / 150);
const gunRng = (w) => steps((w.range || 0) / 1050);
const statBar = (k, v) => `<i>${k}<b>${'<u></u>'.repeat(v)}${'<s></s>'.repeat(8 - v)}</b></i>`;
function optKind(o) {
  const [t, id] = String(o.id).split(':');
  if (t === 'a') return 'ammo';
  if (t !== 'w' || !WEAPONS[id]) return 'gear';
  const ty = WEAPONS[id].type;
  return ty === 'melee' ? 'melee' : ty === 'grenade' || ty === 'deploy' ? 'throw' : LONG.has(id) || ty === 'rocket' || ty === 'bow' || ty === 'flame' ? 'rifles' : 'pistols';
}
const KIND_NAME = { pistols: 'PISTOLS', rifles: 'RIFLES', melee: 'MELEE', throw: 'THROWABLES', ammo: 'AMMO', gear: 'GEAR' };
const MENU_FACE = { police: 'police', hospital: 'hospital', bank: 'bank', atm: 'atm', gang: 'gang', smuggler: 'gang', garage: 'garage', dealer: 'car', marina: 'boat', home: 'home', bathhouse: 'bathhouse', arcade: 'arcade', courthouse: 'legal', warehouse: 'jobs', farm: 'jobs' };
const WEAPON_BY_ID = WEAPONS;
export const WQ_MS = 4000;   // the quick weapons stay this long after a switch (UI-9)
// a note's icon (UIK-00 6A/B): money in, a tick, a warning, an alarm, or the info mark
const toastIcon = (tone, msg) => (/^\+\$|\bpaid\b|\+\$\d/i.test(msg) && tone !== 'bad' ? 'money' : tone === 'good' ? 'check' : tone === 'warn' ? 'warn' : tone === 'bad' ? 'alert' : 'info');
// the minimap's own marks (U17): your home a house, the job a $, your vehicle a car, the waypoint a pink dot
function mapIcon(g, k, x, y, big) {
  // (UI-9: the kit's map icons, UIK-00 7 - client/touchicons.js)
  const PIX = { home: 'home', job: 'jobmap', car: 'car', wp: 'wp' };
  if (PIX[k]) { drawIcon(g, PIX[k], x, y, big ? 30 : 20); return; }
  g.save(); g.translate(Math.round(x), Math.round(y)); if (big) g.scale(1.6, 1.6);
  g.lineWidth = 1.5; g.strokeStyle = '#070b16'; g.lineJoin = 'round';
  if (k === 'home') {
    g.fillStyle = '#ffb43c'; g.beginPath(); g.moveTo(0, -7); g.lineTo(7, -0.5); g.lineTo(5, -0.5); g.lineTo(5, 6); g.lineTo(-5, 6); g.lineTo(-5, -0.5); g.lineTo(-7, -0.5); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#5a2e08'; g.fillRect(-1.5, 1.5, 3, 4.5);
  } else if (k === 'job') {
    g.font = '700 16px "CLA Pixel", "Barlow Condensed", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 3;
    g.strokeText('$', 0, 1); g.fillStyle = '#3ddc5a'; g.fillText('$', 0, 1);
  } else if (k === 'car') {
    g.fillStyle = '#45b8ff'; g.beginPath(); g.moveTo(-7, 4); g.lineTo(-7, 0); g.lineTo(-5, -1); g.lineTo(-3.5, -5); g.lineTo(3.5, -5); g.lineTo(5, -1); g.lineTo(7, 0); g.lineTo(7, 4); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#d8f0ff'; g.fillRect(-2.8, -4, 5.6, 2.6); g.fillStyle = '#070b16'; g.fillRect(-6, 4, 3, 2); g.fillRect(3, 4, 3, 2);
  } else {
    g.fillStyle = '#ff4fa8'; g.beginPath(); g.arc(0, 0, 4.5, 0, 6.28); g.fill(); g.stroke();
    g.strokeStyle = 'rgba(255,190,225,.7)'; g.lineWidth = 1; g.beginPath(); g.arc(0, 0, 6.5, 0, 6.28); g.stroke();
  }
  g.restore();
}

export class HUD {
  constructor(map, sendMenu, closeMenu) {
    this.map = map;
    this.sendMenu = sendMenu;
    this.closeMenuCb = closeMenu;
    this.me = null;
    this.menu = null;
    this.menuFocus = 0;
    this.radarCtx = $('radar').getContext('2d');
    this.mini = buildMinimap(map);
    this.toastEls = [];
    $('m-close').onclick = () => this.closeMenu();
    // tapping (or clicking) anywhere off the menu panel backs out of it too - no hunting for the ✕
    $('menu').addEventListener('pointerdown', (e) => { if (this.menuOpen && !e.target.closest('.panel')) { e.preventDefault(); this.closeMenu(); } });
    this.lastStars = 0;
    this.dp = { at: 0, fold: false };   // (the death screen's: client/deathscreen.js)
    // (the HUD faded by a campfire: the first touch only wakes it, so it can't press a button you couldn't see)
    addEventListener('touchstart', (e) => { if (this.calmH) { this.calm(true, input.activeAt = performance.now()); e.preventDefault(); e.stopPropagation(); } }, { passive: false, capture: true });
    // the HUD's information - the status line, the job card, the vehicle chip, the hint strips (UI-4): client/hudinfo.js,
    // fetched as the game opens rather than with the page
    this.infoP = import('./hudinfo.js').then((m) => { this.info = m.createInfo(this); if (this.infoCtx) this.info.setCtx(this.infoCtx); if (this.me) this.info.me(this.me, null); }).catch((e) => { this.infoP = null; console.warn('[hudinfo]', e); });
    // a note cut short: a tap (or a click) opens the phone's Log with the whole of it
    $('toasts').addEventListener('click', (e) => { if (e.target.closest('.toast.more')) this.openLog?.(); });
    // the HUD's pixel icons (UI-9: the owner's icon sheet, client/touchicons.js) into index.html's [data-ic]
    paintIcons(document);
    // the prompt's feedback (UI-9, the motion sheet UIC-20 06): the key's ring fills as Act is pressed, and a tick when
    // what it offered is done (the prompt goes or changes straight after)
    const pressed = () => { const pr = $('helpbox'); if (!pr || pr.classList.contains('off')) return; this.pressAt = performance.now(); pr.classList.remove('hit'); void pr.offsetWidth; pr.classList.add('hit'); };
    addEventListener('keydown', (e) => { if (!e.repeat && e.code === 'KeyE') pressed(); });
    document.querySelector('#tbtns [data-b="action"]')?.addEventListener('touchstart', pressed, { passive: true });
  }
  // the prompt's tick: what Act offered is done (it went, or changed, within a moment of the press)
  promptDone(pr) {
    if (!(this.pressAt && performance.now() - this.pressAt < 900)) return false;
    this.pressAt = 0;
    pr.classList.remove('hit'); pr.classList.add('done');
    pr.querySelector('.pr-tick')?.remove();
    pr.insertAdjacentHTML('afterbegin', `<i class="ic pr-tick">${icon('check')}</i>`);
    clearTimeout(this.doneT); this.doneT = setTimeout(() => { pr.classList.remove('done'); pr.querySelector('.pr-tick')?.remove(); }, 700);
    return true;
  }
  setInfoCtx(c) { this.infoCtx = c; this.info?.setCtx(c); }
  hint(k) { return !!this.info && this.info.hint(k); }

  setMe(me) {
    const prev = this.me;
    this.me = me;
    if (this.held && this.held.length && !$('hud').classList.contains('hidden')) { // notes that came in on the title screen
      const held = this.held; this.held = [];
      for (const t of held) if (performance.now() - t.at < 60000) this.toast(t.text, t.tone, t.short);
    }
    if (prev && !prev.custody && me.custody && !me.dead) this.moment('BUSTED', 'The police have you.', 'bad');   // (UIC-15: cuffed)
    const hpPct = Math.max(0, me.hp / me.maxHp) * 100;
    $('hp-fill').style.width = hpPct + '%';
    $('hp-fill').classList.toggle('low', hpPct < 30);
    this.damage(hpPct);
    this.countCash(me.cash, prev ? prev.cash : me.cash);
    $('bank-n').textContent = `$${me.bank.toLocaleString()}`;
    // an open shop menu's wallet line follows what you spend in it (the fitting room, the barber's chair)
    if (this.menu && (!prev || prev.cash !== me.cash || prev.bank !== me.bank)) $('m-money').textContent = `Wallet $${me.cash.toLocaleString()} · Bank $${me.bank.toLocaleString()}`;
    // hot money: a robbery's takings in the bag, under the cash (server hotmoney.js)
    const hot = $('hot');
    hot.classList.toggle('hidden', !(me.hot > 0));
    if (me.hot > 0) hot.textContent = `HOT $${me.hot.toLocaleString()}`;
    // stars (GTA style: outlined when empty, gold and flashing when fresh)
    const flashing = this.flareUntil && performance.now() < this.flareUntil;
    const ss = `${me.wanted}|${flashing}`;
    if (this.starSig !== ss) {   // (the wanted meter, UIK-00 6E: five pixel stars on a plate, the lit ones gold)
      this.starSig = ss;
      let s = '';
      for (let i = 1; i <= 5; i++) s += `<span class="${i <= me.wanted ? 'on' + (flashing ? ' flash' : '') : ''}">${icon(i <= me.wanted ? 'star' : 'starx')}</span>`;
      $('stars').innerHTML = s;
      $('stars').setAttribute('aria-label', `Wanted: ${me.wanted} of 5 stars`);
    }
    $('stars').classList.toggle('wanted', me.wanted > 0);
    if (me.wanted > this.lastStars) this.flareUntil = performance.now() + 3000;
    this.lastStars = me.wanted;
    // prompt -> GTA help box with the right button for this device; matching touch button pulses
    const pr = $('helpbox');
    const sig = (me.prompt || '') + '|' + (me.pcr | 0) + '|' + input.device;
    if (me.prompt && !me.dead) {
      if (pr.dataset.sig !== sig) {
        if (pr.dataset.sig && !pr.classList.contains('off')) this.promptDone(pr);
        pr.dataset.sig = sig;
        const fp = formatPrompt(promptWords(me.prompt, me.pcr | 0));
        pr.innerHTML = fp.html;
        this.unarm();
        document.querySelectorAll('#tbtns .pulse').forEach((b) => b.classList.remove('pulse', 'crime', 'felony'));
        this.actBtn = fp.action ? document.querySelector(`#tbtns [data-b="${fp.action}"]`) : null;
        this.actBtn?.classList.add('pulse');
        actGlyph(fp.kind);   // (the action button shows what it will do: a door, a speech bubble, coins...)
        // up for PROMPT_FADE_S, then it fades (0.4 s); the touch button it lit stays lit, its long press still names it.
        // A new target, or this one again after leaving it, brings it back; one that counts down or asks stays
        pr.classList.remove('faded'); clearTimeout(this.fadeT);
        const words = me.prompt;
        this.fadeT = setTimeout(() => { if (pr.dataset.sig === sig && promptFades(words, pr.classList.contains('armed'))) pr.classList.add('faded'); }, PROMPT_FADE_S * 1000);
      }
      pr.classList.remove('off');
      // what it would do is a crime (server players.js: me.pcr 1, a felony 2): no warning plate, only the key - the
      // prompt's chip red with a "!" on it, the touch button it pulses red with the "!" (green when it's no crime)
      crimeMarks(pr, me.pcr | 0); if (this.actBtn) crimeMarks(this.actBtn, me.pcr | 0);
    } else if (!pr.classList.contains('off')) {
      if (this.promptDone(pr)) { clearTimeout(this.offT); this.offT = setTimeout(() => { if (pr.dataset.sig === '') pr.classList.add('off'); }, 600); } else pr.classList.add('off');
      pr.dataset.sig = ''; crimeMarks(pr, 0); this.unarm(); clearTimeout(this.fadeT); pr.classList.remove('faded');
      document.querySelectorAll('#tbtns .pulse').forEach((b) => b.classList.remove('pulse', 'crime', 'felony'));
      this.actBtn = null;
      actGlyph(setActKind('interact'));
    }
    document.body.classList.toggle('carrying', !!me.carrying);
    this.info?.me(me, prev);   // (the vitals' numbers, the status line, the stars, the weapon plate, the job card: hudinfo.js)
    const rb = $('rob');
    if (me.rob) {
      // (the bar: the hands going up, then what's left in the till - server robbery.js hudFor)
      const r = me.rob, left = r.full ? Math.max(0, r.left / r.full) : 1;
      rb.classList.remove('hidden'); rb.classList.toggle('alarm', !!r.alarm); rb.classList.toggle('till', r.warm >= 1);
      $('rob-fill').style.width = Math.round((r.warm < 1 ? r.warm : left) * 100) + '%';
      $('rob-take').textContent = r.duck ? `HOT $${r.take} - police outside!` : r.alarm ? `ALARM! HOT $${r.take} - get out!` : r.warm < 1 ? 'Hands up...'
        : r.empty ? `HOT $${r.take} - the till's empty` : `HOT $${r.take} · till $${r.left ?? 0}`;
    } else rb.classList.add('hidden');
    // riding a train: next stop, the tunnel, the strongbox
    const tb = $('trainbar'), tr = me.train, cu = me.custody, fg = me.fight && !me.dead ? me.fight : null;
    tb.classList.toggle('custody', !!((cu && cu.s !== 'cell') || fg) && !me.dead);
    tb.classList.toggle('fight', !!fg);
    if (!!fg !== !!this.fightOn) { this.fightOn = !!fg; document.querySelector('#tbtns [data-b="fire"]')?.classList.toggle('pulse', !!fg); }   // (the touch FIRE button pulses)
    if (fg) {
      // an officer on you, going for the cuffs (server struggle.js): fight back - the meter, and what to mash (and wriggle)
      tb.classList.remove('hidden', 'sub', 'warn', 'alarm', 'bus', 'taxi', 'ferry', 'brk'); tb.style.borderColor = '';
      $('tb-where').textContent = 'FIGHT BACK!';
      $('tb-crack').classList.remove('hidden');
      $('tb-fill').style.width = Math.round(Math.max(0, Math.min(1, fg.m)) * 100) + '%';
      $('tb-next').innerHTML = `Mash ${glyph('fire')} · wriggle ${glyph('move')}${fg.n > 1 ? ' · two of them on you!' : fg.left < 1.5 ? ' · the cuffs are coming out!' : ''}`;
    } else if (cu && cu.s !== 'cell' && !me.dead) {
      // arrested (server custody.js): held on the ground, a car coming, walked to it, the ride to the station
      tb.classList.remove('hidden', 'sub', 'warn', 'alarm', 'bus', 'taxi', 'ferry'); tb.style.borderColor = '';
      $('tb-where').textContent = 'IN CUSTODY';
      // (the action button makes a break for it: on the ground or walked to the car, a try - custody.js breakOut; the car
      // stuck or not coming, it always works - offerBreak, and the bar pulses)
      const brk = cu.brk ? ` · make a break for it [${input.device === 'gamepad' ? 'B' : input.device === 'touch' ? 'ACT' : 'E'}]` : '';
      $('tb-next').textContent = (cu.s === 'held' ? 'Cuffed and held on the ground' : cu.s === 'fetch' ? (cu.stuck ? 'Cuffed · the police car isn\'t coming' : 'Cuffed · a police car is coming to take you in')
        : cu.s === 'escort' ? 'Being walked to the police car' : cu.s === 'walkin' ? `Walked into ${cu.at || 'the station'} - to the cells`
          : cu.stuck ? 'The police car is going nowhere' : `In the back of the police car${cu.at ? ` · to ${cu.at}` : ''}${cu.by ? ` · ${cu.by} driving` : ''}`) + brk;
      tb.classList.toggle('brk', !!cu.stuck);
      $('tb-crack').classList.add('hidden');
    } else if (me.wo && !me.dead) {
      // a set of push-ups or sit-ups (server workout.js): the reps, a press each, steady
      const w = me.wo;
      tb.classList.remove('hidden', 'sub', 'warn', 'alarm', 'bus', 'taxi', 'ferry', 'brk'); tb.style.borderColor = '';
      $('tb-where').textContent = `${w.name.toUpperCase()} ${w.reps}/${w.of}`;
      $('tb-crack').classList.remove('hidden');
      $('tb-fill').style.width = Math.round(100 * w.reps / w.of) + '%';
      $('tb-next').innerHTML = `${glyph('action')} each rep - steady, about one a second · move to get up`;
    } else if (me.prison && !me.dead) {
      // doing time on Prison Island (server prison.js): the time left, the way out over the wall
      const pr = me.prison, s = pr.left;
      tb.classList.remove('hidden', 'sub', 'warn', 'bus', 'taxi', 'ferry', 'brk'); tb.classList.toggle('alarm', !!pr.climb); tb.style.borderColor = '';
      $('tb-where').textContent = pr.climb ? 'OVER THE WALL!' : pr.at.toUpperCase();
      $('tb-next').textContent = pr.climb ? 'Climbing - the towers have seen you' : `Out in ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} · or climb the outer wall (the guards will see)`;
      $('tb-crack').classList.add('hidden');
    } else if (tr && !me.dead) {
      // the mail guards' warning: at the door ('door'), then the seconds left to get out (0: they're shooting)
      const warn = tr.warn ?? null;
      tb.classList.remove('hidden'); tb.classList.toggle('sub', !!tr.sub); tb.classList.toggle('warn', warn === 'door'); tb.classList.toggle('alarm', warn !== null && warn !== 'door');
      $('tb-where').textContent = warn === 'door' ? 'MAIL CAR AHEAD' : tr.car === 'mail' ? 'MAIL CAR' : tr.sub ? 'SUBWAY' : tr.rural ? (tr.rural === 'desert' ? 'DESERT RUN' : 'RURAL RUN') : 'ON THE TRAIN';
      $('tb-next').textContent = warn === 'door' ? 'Armed guards - staff only! Walk in and they shoot.'
        : warn !== null ? (warn > 0 ? `GUARDS: "GET OUT!" - ${warn}` : 'The guards are shooting!')
          : tr.at ? `At ${tr.next} - F to get off` : `Next: ${tr.next} · ${tr.eta}s`;
      $('tb-crack').classList.toggle('hidden', tr.crack === null);
      if (tr.crack !== null) $('tb-fill').style.width = Math.round(tr.crack * 100) + '%';
      tb.classList.remove('bus'); tb.style.borderColor = '';
    } else if (me.bus && me.bus.k === 'ferry' && !me.dead) {
      // on a ferry (server ferries.js): in at a pier (get off, or drive off the deck) and when it leaves, or where to and
      // how long
      const b = me.bus;
      tb.classList.remove('hidden', 'sub', 'warn', 'alarm', 'bus'); tb.classList.add('ferry'); tb.style.borderColor = '';
      $('tb-where').textContent = b.line.toUpperCase();
      $('tb-next').textContent = b.at ? `At ${b.at} · leaves in ${b.eta}s · ${b.car ? `${keyName('action')}: drive off` : `${keyName('vehicle')} to get off`}`
        : `To ${b.next} · ${b.eta}s${b.car ? ' · on the car deck' : ''}`;
      $('tb-crack').classList.add('hidden');
    } else if (me.bus && !me.dead) {
      // riding a bus: the line, then the stop it's waiting at (get off now) or the next one
      const b = me.bus;
      tb.classList.remove('hidden', 'sub', 'warn', 'alarm'); tb.classList.add('bus');
      tb.style.borderColor = b.col || '';
      $('tb-where').textContent = b.line.toUpperCase();
      $('tb-next').textContent = b.at ? `At ${b.at} - ${keyName('vehicle')} to get off` : b.next ? `Next stop: ${b.next}` : 'On the bus';
      $('tb-crack').classList.add('hidden');
    } else if (me.taxi && !me.dead) {
      // a taxi: on its way to you, waiting at the kerb, where to, the meter, there
      const t = me.taxi;
      tb.classList.remove('hidden', 'sub', 'warn', 'alarm', 'bus'); tb.classList.add('taxi'); tb.style.borderColor = '';
      $('tb-where').textContent = 'TAXI';
      $('tb-next').textContent = t.st === 'pickup' ? `On its way · about ${Math.max(5, t.eta)}s (the yellow square on your map)`
        : t.st === 'wait' ? `At the curb · ${keyName('action')} by the cab to get in (${t.wait}s)`
          : t.st === 'dest' ? 'Where to? Set a waypoint (the map or the phone)'
            : t.st === 'ride' ? `To ${t.to} · ${t.m} m · $${t.fare} (~$${t.est})`
              : `${t.to} · $${t.fare} · ${keyName('vehicle')} to get out`;
      $('tb-crack').classList.add('hidden');
    } else tb.classList.add('hidden');
    if (!(me.taxi && !me.dead && !tr && !me.bus)) tb.classList.remove('taxi');
    if (!(me.bus && me.bus.k === 'ferry' && !me.dead && !tr)) tb.classList.remove('ferry');
    // personal police cruiser
    const cr = me.cruiser, ch = $('cruiser-hint'), cb = $('b-cruiser');
    document.body.classList.toggle('can-call', !!(cr && cr.s === 'none' && !me.dead));
    if (cr && !me.dead && cr.s !== 'in') {
      const html = cr.s === 'none' ? (cr.cd > 0 ? `Cruiser lost - dispatch can send another in ${cr.cd}s` : `${glyph('cruiser')} <span>Call in a police cruiser</span>`)
        : cr.s === 'coming' ? 'Cruiser on its way to you - it\'s the blue square on your map' : 'Your cruiser is the blue square on your map';
      if (ch.dataset.h !== html) { ch.dataset.h = html; ch.innerHTML = html; }
      ch.classList.remove('hidden');
    } else ch.classList.add('hidden');
    (cb.querySelector('.l') || cb).textContent = cr && cr.cd > 0 ? `COP CAR ${cr.cd}` : 'COP CAR';   // (the slot's label: client/touchslots.js)
    cb.classList.toggle('cooling', !!(cr && cr.cd > 0));
    if (cr && cr.cd > 0) { this.cdMax = Math.max(this.cdMax || 0, cr.cd); cb.style.setProperty('--cd', String(1 - cr.cd / this.cdMax)); } else this.cdMax = 0;   // (its cooldown ring: style.css)
    // the flashlight's touch button: there while you own one, lit while it's on
    document.body.classList.toggle('has-light', !!(me.inv && (me.inv.flashlight > 0 || me.inv.headlamp > 0 || me.inv.hardhat > 0 || me.inv.lantern > 0) && !me.dead));
    $('b-light')?.classList.toggle('lit', !!me.light);
    // weapon
    const w = WEAPON_BY_ID[me.weapon] || WEAPONS.fists;
    $('w-name').textContent = w.name;
    // reloading, FIRE's ring fills (UIC-10 2, "cooling down"): the weapon's reload time, the button grey under it
    const fb = document.querySelector('#tbtns [data-b="fire"]');
    if (me.reloading && !this.rlAt && fb) {
      const at = this.rlAt = performance.now(), dur = Math.max(200, (w.reload || 1) * 1000);
      fb.classList.add('cooling'); fb.style.setProperty('--cd', '0');
      const tick = () => { if (this.rlAt !== at) return; const k = Math.min(1, (performance.now() - at) / dur); fb.style.setProperty('--cd', k.toFixed(3)); if (k < 1) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    } else if (!me.reloading && this.rlAt) { this.rlAt = 0; fb?.classList.remove('cooling'); }
    const ow = me.weapons.find((x) => x.id === me.weapon);
    $('w-ammo').textContent = w.mag ? (me.reloading ? 'RELOADING' : `${ow ? ow.mag : 0} | ${ow ? Math.max(0, ow.ammo - ow.mag) : 0}`) : '';   // (UI-9: no standing "TAB to switch" - the first-time hints and the README say it)
    const wi = $('w-icon'), wk = `${w.i}|${me.blade | 0}`;   // (the plasma blade in your colour)
    if (wi.dataset.w !== wk) { wi.dataset.w = wk; wi.innerHTML = ''; wi.appendChild(weaponIcon(w.i, me.blade)); }
    const wg = $('w-glyph'), gk = glyphOfWeapon(me.weapon, w.type);   // (on touch the button shows what you hold as a one-color silhouette - the owner, 11-03)
    if (wg && wg.dataset.g !== gk) { wg.dataset.g = gk; wg.innerHTML = monoGlyph(gk); }
    if (this.meleeG !== gk) {   // (the HIT button shows what you hit with: a fist, the knife, the bat... - the owner, 11-05)
      this.meleeG = gk; setMelee(me.weapon, w.type);
      const hg = document.querySelector('#tbtns [data-lbl="HIT"] svg.gl');
      if (hg) hg.outerHTML = monoGlyph(iconOf('fire', 'HIT'));
    }
    // the quick weapons (UIC-11/12: under what you hold, the next ones you carry - their number keys on a keyboard; a
    // click takes one out: client/main.js)
    const qk = me.weapons.map((x, n) => [x, n]).filter(([x]) => x.id !== me.weapon).slice(0, 3), qs = qk.map(([x, n]) => `${x.id}:${n}`).join() + (me.dead ? 'd' : '');
    if ($('w-quick').dataset.q !== qs) {
      $('w-quick').dataset.q = qs;
      $('w-quick').innerHTML = me.dead ? '' : qk.map(([x, n]) => { const d = WEAPON_BY_ID[x.id]; return d ? `<button type="button" class="wq" data-w="${esc(x.id)}" title="${esc(d.name)}${n < 9 ? ` (${n + 1})` : ''}" aria-label="${esc(d.name)}"><img alt="" src="${weaponThumb(d.i)}">${n < 9 ? `<span class="kchip kbm-only">${n + 1}</span>` : ''}</button>` : ''; }).join('');
    }
    // (UI-9, the owner's minimal HUD: the quick weapons show a few seconds after you take one out, and while the pointer is
    // on the plate - not all the time)
    if (this.wqW !== me.weapon) { const first = this.wqW === undefined; this.wqW = me.weapon; if (!first) { $('weapon').classList.add('wq-on'); clearTimeout(this.wqT); this.wqT = setTimeout(() => $('weapon').classList.remove('wq-on'), WQ_MS); } }
    document.body.classList.toggle('multi-wpn', me.weapons.length > 1 && !me.dead);
    document.body.classList.toggle('armed', w.type !== 'melee' && w.type !== 'tool');
    // (UI-9: only what's in your hands - a crate; the bag's contents are the bag's, a tap of I away)
    $('w-carry').textContent = me.carrying ? `Carrying ${['', 'Wood Box', 'Steel Barrel', 'Iron Vault', 'Carbon-Gold Case'][me.carrying]}` : '';
    // in a cell (server custody.js): the time left and the bail
    const jl = $('jail');
    if (cu && cu.s === 'cell' && !me.dead) {
      jl.classList.remove('hidden');
      const left = Math.max(0, cu.left | 0), pad = input.device === 'gamepad', kb = input.device === 'keyboard';
      $('j-at').textContent = cu.at || '';
      $('j-time').textContent = `Out in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
      const bl = `Pay the $${cu.bail} bail${kb ? ' [B]' : pad ? ' (Y)' : ''}`;
      if ($('j-bail').textContent !== bl) $('j-bail').textContent = bl;
      $('j-bail').disabled = !cu.can;
      $('j-note').textContent = cu.can ? 'From your bank, then your cash.' : `You don't have $${cu.bail} - wait it out.`;
    } else jl.classList.add('hidden');
    this.deathScreen(me);
  }

  // the death screen (task #403): client/deathscreen.js, fetched a few seconds into the game (not with the page), so it's
  // there the first time you go down
  deathScreen(me) {
    if (this.DS) { this.DS.draw(this, me); return; }
    this.dsSoon ||= setTimeout(() => this.loadDS(), 6000);
    if (me.dead) this.loadDS();
  }
  loadDS() { this.dsLoad ||= import('./deathscreen.js').then((m) => { this.DS = m; if (this.me) m.draw(this, this.me); }).catch(() => { this.dsLoad = null; }); }
  // sitting by a campfire (task #375): its prompt fades after CALM_PROMPT_S still, the HUD after CALM_HUD_S; anything
  // pressed, moved or touched brings them back at once (a touch then only wakes the screen). still: the prompt alone
  // fades after CALM_PROMPT_S without a touch (inside a home on a phone - the owner, 10-16: the prompt stayed up over the
  // rooms and blocked the view)
  calm(sitting, now, still = false) {
    if (!sitting) this.sitAt = 0; else this.sitAt ||= now;
    if (!still) this.stillAt = 0; else this.stillAt ||= now;
    const { prompt: p0, hud: h } = calmState(this.sitAt, input.activeAt, now), p = p0 || calmState(this.stillAt, input.activeAt, now).prompt;
    if (p !== !!this.calmP) { this.calmP = p; $('helpbox').classList.toggle('calm', p); }
    if (h !== !!this.calmH) { this.calmH = h; document.body.classList.toggle('calm', h); }
  }
  deathBack() { return !!this.DS && this.DS.back(this); }   // (Esc / B: the choices folded away to watch, and back)
  stepSpawn(s, ax) { if (this.DS) this.DS.step(this, s, ax); }   // (ax: the way on the spawn map - 'h', 'v')
  deathWake() { return !!this.DS && this.DS.wake(this); }   // (WAKE UP HERE: Enter, A)

  // the clock in the HUD's top-right column, and on the minimap's plate (a phone held upright: the sun or the moon, the
  // time, a rain cloud when it rains) - written only when the minute or the weather changes
  setClock(loopTime, weather) {
    const c = gameClock(loopTime);
    const h = Math.floor(c.minutes / 60), m = Math.floor(c.minutes % 60);
    const hm = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, rain = weather === WEATHER.RAIN;
    const sig = hm + (c.isNight ? 'n' : 'd') + (rain ? 'r' : '');
    if (sig === this.clockSig) return;
    this.clockSig = sig;
    $('clock').textContent = `${hm} ${c.isNight ? '☾' : '☀'}${rain ? ' ☂ RAIN' : ''}`;
    const tod = c.isNight ? 'moon' : 'sun';
    if (this.rcTod !== tod) { this.rcTod = tod; $('rc-tod').dataset.ic = tod; paintIcons($('rclock')); }
    $('rc-time').textContent = hm;
    $('rc-wx').classList.toggle('hidden', !rain);
    $('rclock').title = `${c.isNight ? 'Night' : 'Day'} · ${rain ? 'rain' : 'clear'}`;
  }

  // Safety mode held back a crime (server safety.js, tone 'safety'): no note (UI-5) - the prompt's key and the touch
  // button blink, "PRESS AGAIN" on the plate's edge, while a second press counts. False with no prompt to mark.
  safetyNudge() {
    const pr = $('helpbox');
    if (!pr || pr.classList.contains('off')) return false;
    this.unarm();
    pr.classList.add('armed'); pr.classList.remove('faded'); this.actBtn?.classList.add('armed');
    this.armT = setTimeout(() => this.unarm(), SAFETY_CONFIRM_S * 1000);
    return true;
  }
  unarm() {
    if (this.armT) { clearTimeout(this.armT); this.armT = 0; }
    $('helpbox')?.classList.remove('armed');
    document.querySelectorAll('#tbtns .armed').forEach((b) => b.classList.remove('armed'));
  }

  // a big moment (UI-10, UIC-15): BUSTED, LEVEL UP, JOB DONE - big in the pixel face over the middle for a moment, then
  // gone by itself (nothing lingers); one at a time, the next waits its turn. WASTED and the knocked-out screen are the
  // death screen's (client/deathscreen.js)
  moment(title, sub = '', tone = 'good') {
    (this.moments ||= []).push([title, sub, tone]);
    if (this.moments.length > 3) this.moments.shift();
    if (!this.momentOn) this.nextMoment();
  }
  nextMoment() {
    const q = this.moments && this.moments.shift();
    let el = $('moment');
    if (!q) { this.momentOn = false; if (el) el.className = 'hidden'; return; }
    if (!el) { el = document.createElement('div'); el.id = 'moment'; el.setAttribute('role', 'status'); $('hud').appendChild(el); }
    this.momentOn = true;
    el.className = '';
    el.innerHTML = `<b>${esc(q[0])}</b>${q[1] ? `<small>${esc(q[1])}</small>` : ''}`;
    void el.offsetWidth;
    el.className = `on ${q[2]}`;
    clearTimeout(this.momentT);
    this.momentT = setTimeout(() => { el.classList.add('out'); this.momentT = setTimeout(() => this.nextMoment(), 420); }, 2600);
  }

  toast(text, tone = 'info', short = '') {
    if (tone === 'safety') { if (!$('hud').classList.contains('hidden')) this.safetyNudge(); return; }
    // still on the title screen (you sign in there, before PLAY): held back and shown once you're in, if
    // it's still fresh - so the welcome (or "fresh start after an update") isn't missed
    if ($('hud').classList.contains('hidden')) {
      (this.held ||= []).push({ text, tone, short, at: performance.now() });
      if (this.held.length > 4) this.held.shift();
      return;
    }
    const msg = localizeText(text);
    if (this.deathRevealed && this.DS && performance.now() - (this.downAsked || 0) < 4000) this.DS.note(this, msg, tone);   // (the answer to a choice on the death panel, which covers the notes: it says it there)
    logNote(msg, tone);   // (kept in full for the phone's Log: client/notelog.js)
    const lv = /^(.+?) up: level (\d+)/.exec(msg);   // (a skill up - server skills.js: the big moment says it, the Log keeps the line)
    if (lv) { this.moment('LEVEL UP', `${lv[1]} - level ${lv[2]}`, 'good'); return; }
    // one line on the screen (UI-4): the server's short line for it, else its first sentence - a long one cut with an
    // ellipsis and a tap away from the Log; two at most, each up a few seconds; the same note again while it's still up
    // isn't stacked: it moves to the front with its time restarted and a count (the user, 2026-10-08)
    const line = short ? localizeText(short) : noteLine(msg);
    let el = this.toastEls.find((x) => x.dataset.msg === msg), shown = line;
    if (el) {
      clearTimeout(el._t);
      const n = (+el.dataset.n || 1) + 1;
      el.dataset.n = String(n);
      shown = `${line} ×${n}`;
      this.toastEls = this.toastEls.filter((x) => x !== el);
    } else {
      el = document.createElement('div');
      el.className = 'toast ' + tone;
      el.dataset.msg = msg;
      el.innerHTML = icon(toastIcon(tone, msg));
      el.appendChild(document.createElement('div')).className = 'tx';
    }
    el.lastChild.textContent = shown;
    el.title = msg;
    $('toasts').prepend(el);   // (the newest on top, the older pushed down: the motion sheet UIC-20 01)
    this.toastEls.push(el);
    while (this.toastEls.length > 2) { const old = this.toastEls.shift(); clearTimeout(old._t); old.remove(); }
    const gone = () => { this.toastEls = this.toastEls.filter((x) => x !== el); el.classList.add('out'); setTimeout(() => el.remove(), 260); };   // (it fades out: style.css .out)
    el._t = setTimeout(gone, Math.min(6000, 2600 + shown.length * 40));
    requestAnimationFrame(() => { const tx = el.lastChild; el.classList.toggle('more', line !== msg || tx.scrollWidth > tx.clientWidth + 1); });
  }

  // the money's count-up (the motion sheet UIC-20 02): the cash counts up (or down) to the new sum over 300 ms, the
  // difference floats up beside it and fades
  countCash(to, from) {
    const el = $('cash'), up = $('cash-up');
    if (this.cashTo === undefined || to === from || document.hidden) { this.cashTo = to; this.cashAt = 0; el.textContent = '$' + to.toLocaleString(); return; }
    if (to === this.cashTo) return;
    const start = this.cashNow ?? from, d = to - from;
    this.cashTo = to; this.cashFrom = start; this.cashAt = performance.now();
    if (up) { up.textContent = `${d > 0 ? '+' : '-'}$${Math.abs(d).toLocaleString()}`; up.classList.toggle('neg', d < 0); up.classList.remove('go'); void up.offsetWidth; up.classList.add('go'); }
    const tick = (now) => {
      const k = Math.min(1, (now - this.cashAt) / 300), v = Math.round(this.cashFrom + (this.cashTo - this.cashFrom) * (1 - (1 - k) * (1 - k)));
      this.cashNow = k < 1 ? v : undefined;
      el.textContent = '$' + v.toLocaleString();
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  // a hit (UIC-20 03): what was lost shows white for a moment, then drains over 400 ms
  damage(pct) {
    const lag = $('hp-lag');
    if (!lag) return;
    const was = this.hpPct ?? pct;
    this.hpPct = pct;
    if (pct >= was) { lag.classList.remove('hit'); lag.style.width = pct + '%'; return; }
    lag.classList.add('hit');
    clearTimeout(this.lagT);
    this.lagT = setTimeout(() => { lag.classList.remove('hit'); lag.style.width = this.hpPct + '%'; }, 60);
  }

  // ---- menu ----
  // (UI-10: docked at the foot. A few lines with no prices are a conversation - UIC-16: who, what they say, the answers
  // numbered as their keys; a shop has your wallet in its head - UIC-18: with guns their damage and range as bars, a tab
  // for each kind, BUY on each row, a line saying why when you can't afford the one you're on)
  openMenu(m) {
    if (!this.menu || this.menu.poi !== m.poi || this.menu.title !== m.title) this.menuTab = null;
    this.menu = m;
    const el = $('menu'), store = m.opts.some((o) => o.price !== undefined), guns = m.opts.some((o) => o.wpn !== undefined);
    const talk = !store && !m.board && m.opts.length <= 4, funds = (m.cash || 0) + (m.bank || 0);
    el.classList.remove('hidden');
    el.classList.toggle('m-talk', talk); el.classList.toggle('m-store', store); el.classList.toggle('m-guns', guns);
    $('m-title').textContent = m.title;
    $('m-sub').textContent = localizeText(m.sub || '');
    const poi = this.map && this.map.pois && this.map.pois[m.poi];
    $('m-face').innerHTML = talk ? icon(MENU_FACE[poi && poi.kind] || 'talk') : '';
    $('m-wallet').innerHTML = store ? `${icon('money')}<b>$${(m.cash || 0).toLocaleString('en-US')}</b><small>bank $${(m.bank || 0).toLocaleString('en-US')}</small>` : '';
    const bd = $('m-board');   // (a casino's table: server casino.js)
    bd.classList.toggle('hidden', !m.board);
    bd.innerHTML = (m.board || []).map((r) => `<div class="brow${r.cls ? ' ' + esc(r.cls) : ''}"><span class="bk">${esc(r.k)}</span><span class="bi">${r.items.map((i) => `<b class="${i.c}">${esc(i.t)}</b>`).join('')}</span><span class="bv">${esc(r.v)}</span></div>`).join('');
    $('m-money').textContent = store || talk ? '' : `Wallet $${m.cash.toLocaleString('en-US')} · Bank $${m.bank.toLocaleString('en-US')}`;
    // a gun store's tabs: each kind it has (pistols, rifles, melee, throwables, ammo, gear)
    const kinds = guns ? [...new Set(m.opts.map(optKind))] : [];
    const tabs = $('m-tabs');
    tabs.classList.toggle('hidden', kinds.length < 2);
    if (kinds.length >= 2) {
      if (!kinds.includes(this.menuTab)) this.menuTab = kinds[0];
      tabs.innerHTML = kinds.map((k) => `<button class="tab${k === this.menuTab ? ' on' : ''}" role="tab" aria-selected="${k === this.menuTab}" data-k="${k}">${KIND_NAME[k]}</button>`).join('');
      for (const b of tabs.querySelectorAll('[data-k]')) b.onclick = () => { this.menuTab = b.dataset.k; this.menuFocus = this.menuShown().find((i) => i >= 0) ?? 0; this.openMenu(this.menu); };
    } else this.menuTab = null;
    const shown = this.menuShown();
    if (!shown.includes(this.menuFocus)) this.menuFocus = shown[0] ?? 0;
    const box = $('m-opts');
    box.innerHTML = '';
    shown.forEach((i, n) => {
      const o = m.opts[i];
      const b = document.createElement('button');
      b.className = 'opt' + (i === this.menuFocus ? ' focus' : '');
      b.disabled = !!o.dis;
      const short = o.price !== undefined && o.price > 0 && o.price > funds;
      const price = o.price === undefined ? '' : o.price < 0 ? `<span class="price sell">+$${(-o.price).toLocaleString('en-US')}</span>` : `<span class="price${short ? ' short' : ''}">$${o.price.toLocaleString('en-US')}</span>`;
      // weapon offers carry a picture (placeholder pixel art until the final weapon art lands), their damage and range
      // (its class's glyph - pistol, rifle, knife...: the top-down sprites read as thin bars at a row's size, 11-04 review)
      const w = o.wpn !== undefined ? WEAPON_BY_I.get(o.wpn) : null;
      const pic = w ? `<span class="wpn">${monoGlyph(glyphOfWeapon(w.id, w.type), 30)}</span>` : '';
      const bars = w ? `<span class="stats">${statBar('DMG', gunDmg(w))}${statBar('RNG', gunRng(w))}</span>` : o.stats ? `<span class="stats">${[['PWR', o.stats.pow], ['RNG', o.stats.rng], ['ACC', o.stats.acc]].map(([k, v]) => statBar(k, Math.round(v * 8 / 5))).join('')}</span>` : '';
      const buy = store && o.price > 0 ? `<span class="buy${o.dis || short ? ' off' : ''}">${o.note === 'owned' ? 'OWNED' : 'BUY'}</span>` : '';
      if (pic) b.classList.add('has-wpn');
      if (o.note && o.label.length + o.note.length > 40) b.classList.add('two');   // (a long row: its note on a line of its own, not run on from a label that wraps)
      const key = n < 9 ? `<span class="okey">${n + 1}</span>` : '';
      b.innerHTML = `${key}${pic}<span class="olab">${esc(o.label)}${o.note && o.note !== 'owned' ? `<span class="note">${esc(o.note)}</span>` : ''}</span>${bars}${price}${buy}`;
      b.onclick = () => this.choose(i);
      box.appendChild(b);
    });
    const f = m.opts[this.menuFocus];
    $('m-foot').textContent = f && f.price > 0 && f.price > funds && !f.dis ? `Not enough cash for ${f.label}.` : '';
    const cue = () => box.classList.toggle('cue-down', box.scrollTop + box.clientHeight < box.scrollHeight - 4);   // (more below: a fade at the foot)
    box.onscroll = cue; requestAnimationFrame(cue);
  }
  // the options on show (the tab's, in a gun store), as indexes into menu.opts
  menuShown() { const m = this.menu; return m ? m.opts.map((o, i) => (!this.menuTab || optKind(o) === this.menuTab ? i : -1)).filter((i) => i >= 0) : []; }
  choose(i) {
    const o = this.menu && this.menu.opts[i];
    if (!o || o.dis) return;
    if (o.id === 'close') { this.closeMenu(); return; }
    this.sendMenu(this.menu.poi, o.id);
    if (o.shut) { this.closeMenu(); return; }   // (an option that's the end of it: the ATM pop-up's "Deposit all")
    if (['hhide', 'hleave', 'armexit', 'sleave', 'htour', 'hi:tout', 'hi:tbuy', 'hi:tmort'].includes(o.id) || o.id.startsWith('hcargo') || /^hu:(in|tour):|^hi:(deco|d(pick|move|put|stay|store|end))/.test(o.id)) this.closeMenu(); // going in blinks you out; stepping out drops you at the door (a look round, a flat in a block: H65); decorating, a piece picked up or put down (H67)
  }
  navMenu(d) {
    if (!this.menu) return;
    const sh = this.menuShown(), k = Math.max(0, sh.indexOf(this.menuFocus));
    this.menuFocus = sh[(k + d + sh.length) % sh.length] ?? 0;
    this.openMenu(this.menu);
  }
  // a number key: the n-th option on show
  pickMenu(n) { const i = this.menuShown()[n]; if (i !== undefined) this.choose(i); }
  closeMenu() {
    const m = this.menu;
    this.menu = null; this.menuFocus = 0;
    $('menu').classList.add('hidden');
    this.closeMenuCb?.(m);
  }
  get menuOpen() { return !!this.menu; }

  // ---- radar ----
  drawRadar(cx, cy, heading, ctx = this.radarCtx, size = 168, range = 1700, big = false) {
    const g = ctx;
    const scale = size / (range * 2);
    g.save();
    g.clearRect(0, 0, size, size);
    if (!big) { g.beginPath(); g.arc(size / 2, size / 2, size / 2, 0, 6.28); g.clip(); }
    g.fillStyle = 'rgb(25,60,130)'; g.fillRect(0, 0, size, size);   // (past the map's edge: the open sea, the minimap's deep water)
    const mx = cx / TILE, my = cy / TILE, tr = range / TILE;
    g.imageSmoothingEnabled = false;
    drawMini(g, this.mini, mx - tr, my - tr, tr * 2, tr * 2, 0, 0, size, size);
    const toR = (x, y) => [(x - cx) * scale + size / 2, (y - cy) * scale + size / 2];
    const me = this.me;
    // the route to your waypoint along the roads (client/route.js): the GPS line
    if (this.route && this.route.pts.length > 1) {
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath(); this.route.pts.forEach((p, i) => { const [x, y] = toR(p.x, p.y); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
      g.strokeStyle = 'rgba(10,15,29,.7)'; g.lineWidth = big ? 7 : 5; g.stroke();
      g.strokeStyle = '#ffd34a'; g.lineWidth = big ? 4 : 2.6; g.stroke();
    }
    // POIs
    g.font = `700 ${big ? 14 : 10}px "CLA Pixel", "Barlow Condensed", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const skipIc = iconSkip(this.map), pois = this.map.pois, rr = (size / 2 + 10) / scale;
    for (const i of poiNear(this.map, cx, cy, big ? Infinity : rr)) {   // (the radar: only the cells round it - a window holds thousands, every frame)
      const p = pois[i], icon = p && POI_ICON[p.kind];
      if (!icon || skipIc.has(p.id)) continue;
      const [x, y] = toR(p.x, p.y);
      if (x < -10 || y < -10 || x > size + 10 || y > size + 10) continue;
      g.fillStyle = '#000'; g.fillRect(x - (big ? 8 : 5), y - (big ? 8 : 5), big ? 16 : 10, big ? 16 : 10);
      g.fillStyle = icon[1]; g.fillText(icon[0], x, y + 1);
    }
    if (me) {
      for (const h of me.homes || []) { const [x, y] = toR(h.x, h.y); mapIcon(g, 'home', x, y, big); }
      // rumor + radar pings
      if (me.rumor) { const [x, y] = toR(me.rumor.x, me.rumor.y); g.strokeStyle = me.rumor.t === 4 ? '#ffd36b' : '#c07aff'; g.lineWidth = 2; g.setLineDash([4, 3]); g.beginPath(); g.arc(x, y, me.rumor.r * scale, 0, 6.28); g.stroke(); g.setLineDash([]); }
      for (const r of me.radar || []) {
        const [x, y] = toR(r.x, r.y);
        if (r.k === 'search') { g.fillStyle = `rgba(255,60,60,${0.12 + 0.2 * r.f})`; g.strokeStyle = '#ff3b3b'; g.lineWidth = 1; g.beginPath(); g.arc(x, y, Math.max(4, r.r * scale), 0, 6.28); g.fill(); g.stroke(); }
        else if (r.k === 'wanted') { g.fillStyle = (performance.now() / 200 | 0) % 2 ? '#ff3b3b' : '#3b6bff'; g.beginPath(); g.arc(x, y, big ? 7 : 4, 0, 6.28); g.fill(); }
        else if (r.k === 'bounty') { g.strokeStyle = '#ffc23d'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, Math.max(5, r.r * scale), 0, 6.28); g.stroke(); if (big) { g.fillStyle = '#ffc23d'; g.fillText(`${r.n} $${r.b}`, x, y - r.r * scale - 8); } }
        else if (r.k === 'pack') packIcon(g, x, y, r, big ? 1.4 : 1);
        else if (r.k === 'crew') { g.fillStyle = r.d ? '#2d6a40' : '#7dffa0'; g.strokeStyle = '#0a0f1d'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, big ? 6 : 3.5, 0, 6.28); g.fill(); g.stroke(); if (big) { g.fillStyle = '#7dffa0'; g.fillText(r.n, x, y - 11); } }   // (a crewmate: crews.js)
      }
      // crimes reported near you (police): pulsing blips, fresher = brighter
      if (me.dispatch) {
        const t = performance.now() / 1000;
        for (const d of me.dispatch) {
          if (d.age > 120) continue;
          const [x, y] = toR(d.x, d.y);
          if ((x - size / 2) ** 2 + (y - size / 2) ** 2 > (size / 2 - 4) ** 2) continue;
          const fresh = 1 - d.age / 120;
          const ph = (t * 1.6 + d.id * 0.37) % 1;
          g.strokeStyle = `rgba(255,70,70,${(0.9 * (1 - ph) * fresh).toFixed(3)})`; g.lineWidth = 2;
          g.beginPath(); g.arc(x, y, 3 + ph * (big ? 16 : 10), 0, 6.28); g.stroke();
          g.fillStyle = `rgba(255,${d.age < 20 ? 220 : 90},70,${(0.45 + 0.55 * fresh).toFixed(3)})`;
          g.beginPath(); g.arc(x, y, big ? 4 : 2.6, 0, 6.28); g.fill();
        }
      }
      // world events: colour-coded pulsing blips (pinned to the rim when out of range)
      for (const ev of me.happen || []) {
        const kind = EVENT_KINDS[ev.k];
        if (!kind) continue;
        let [x, y] = toR(ev.x, ev.y);
        if (ev.r) { g.strokeStyle = kind.color; g.lineWidth = 1.5; g.setLineDash([4, 3]); g.beginPath(); g.arc(x, y, ev.r * scale, 0, 6.28); g.stroke(); g.setLineDash([]); }
        const dx = x - size / 2, dy = y - size / 2, d = Math.hypot(dx, dy), lim = size / 2 - 7;
        if (d > lim && !big) { x = size / 2 + dx / d * lim; y = size / 2 + dy / d * lim; }
        const ph = (performance.now() / 900) % 1;
        g.strokeStyle = kind.color; g.globalAlpha = 1 - ph; g.lineWidth = 2;
        g.beginPath(); g.arc(x, y, 3 + ph * (big ? 14 : 9), 0, 6.28); g.stroke(); g.globalAlpha = 1;
        g.fillStyle = kind.color; g.strokeStyle = '#000'; g.lineWidth = 1.5;
        g.beginPath(); g.arc(x, y, big ? 6 : 4, 0, 6.28); g.fill(); g.stroke();
      }
      if (me.taxi && (me.taxi.st === 'pickup' || me.taxi.st === 'wait')) {   // your taxi on its way: a yellow square
        let [x, y] = toR(me.taxi.x, me.taxi.y);
        const dx = x - size / 2, dy = y - size / 2, d = Math.hypot(dx, dy), lim = size / 2 - 8;
        if (d > lim && !big) { x = size / 2 + dx / d * lim; y = size / 2 + dy / d * lim; }
        const q = big ? 7 : 4.5;
        g.fillStyle = '#ffd21f'; g.strokeStyle = '#000'; g.lineWidth = 1.5; g.fillRect(x - q, y - q, q * 2, q * 2); g.strokeRect(x - q, y - q, q * 2, q * 2);
      }
      if (me.cruiser && me.cruiser.s !== 'none' && me.cruiser.s !== 'in') {
        let [x, y] = toR(me.cruiser.x, me.cruiser.y);
        const dx = x - size / 2, dy = y - size / 2, d = Math.hypot(dx, dy), lim = size / 2 - 8;
        if (d > lim && !big) { x = size / 2 + dx / d * lim; y = size / 2 + dy / d * lim; }
        const q = big ? 7 : 4.5;
        g.fillStyle = '#3b6bff'; g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.fillRect(x - q, y - q, q * 2, q * 2); g.strokeRect(x - q, y - q, q * 2, q * 2);
      }
      // job target (yellow) and phone waypoint (cyan): a blip when in range, an arrow on the rim
      // pointing the way when not
      // (U17's icons: $ the job, a car your vehicle, a pink dot the waypoint - mapIcon)
      const target = (tx, ty, col, icon) => {
        let [x, y] = toR(tx, ty);
        const dx = x - size / 2, dy = y - size / 2, d = Math.hypot(dx, dy), lim = size / 2 - 9;
        g.fillStyle = col; g.strokeStyle = '#000'; g.lineWidth = 1.5;
        if (d > lim && !big) {
          const a = Math.atan2(dy, dx);
          x = size / 2 + Math.cos(a) * lim; y = size / 2 + Math.sin(a) * lim;
          g.save(); g.translate(x, y); g.rotate(a);
          g.beginPath(); g.moveTo(6, 0); g.lineTo(-4, -5); g.lineTo(-2, 0); g.lineTo(-4, 5); g.closePath(); g.fill(); g.stroke();
          g.restore();
        } else if (icon) mapIcon(g, icon, x, y, big);
        else { g.beginPath(); g.arc(x, y, big ? 7 : 4.5, 0, 6.28); g.fill(); g.stroke(); }
      };
      if (me.job && me.job.area) { const [x, y] = toR(me.job.area[0], me.job.area[1]); g.fillStyle = 'rgba(255,170,40,.16)'; g.strokeStyle = '#ffae2a'; g.lineWidth = 1.5; g.setLineDash([4, 3]); g.beginPath(); g.arc(x, y, Math.max(6, me.job.area[2] * scale), 0, 6.28); g.fill(); g.stroke(); g.setLineDash([]); }   // (a rescue call's search circle: sar.js)
      if (me.job) target(me.job.x, me.job.y, '#3ddc5a', 'job');
      if (me.job && me.job.dest) target(me.job.dest[0], me.job.dest[1], '#ff9a2e');   // (picking up: where it goes after)
      if (me.job && me.job.veh) target(me.job.veh[0], me.job.veh[1], '#45b8ff', 'car');   // (the job's truck, until you're in it)
      else if (me.car) target(me.car[0], me.car[1], '#45b8ff', 'car');   // (your starter car, parked: starter.js marker)
      if (this.waypoint) target(this.waypoint.x, this.waypoint.y, '#ff4fa8', 'wp');
    }
    // player arrow
    g.translate(size / 2, size / 2); g.rotate(heading);
    g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(big ? 12 : 7, 0); g.lineTo(big ? -8 : -5, big ? -7 : -4.5); g.lineTo(big ? -4 : -2.5, 0); g.lineTo(big ? -8 : -5, big ? 7 : 4.5); g.closePath(); g.fill(); g.stroke();
    g.restore();
  }

  // ---- world map (full city): client/worldmap.js draws it (loaded the first time the map opens: main.js) ----------
  zoomMap(k, sx, sy) { const c = $('bigmap-c'); if (this.worldmap) this.worldmap.zoom(k, sx, sy, c.clientWidth, c.clientHeight); }
  panMap(dx, dy) { if (this.worldmap) this.worldmap.pan(dx, dy); }
  centerMap(x, y) { if (this.worldmap) this.worldmap.center(x, y); }
  resetMap() { if (this.worldmap) this.worldmap.reset(); }
  // World v3's window moved (client/main.js swapWorld): the minimap paints the new window's part over what it had
  setMap(map) { this.map = map; paintMinimap(this.mini, map, true); this.resetMap(); }
  get mapView() { return this.worldmap ? this.worldmap.view : null; }
  drawBigMap(cx, cy, heading, opts = {}) { if (this.worldmap) this.worldmap.draw($('bigmap-c'), this, cx, cy, heading, opts); }

  setNet(text) { $('net').textContent = text; }

  // GTA-style district title card when you cross into a new part of town
  showDistrict(name, island = '') {
    const el = $('district');
    el.textContent = name;
    if (island && island !== name) { const sub = document.createElement('small'); sub.textContent = island === 'Rural' ? 'Countryside' : `${island} Island`; el.appendChild(sub); }
    fitLine(el);
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }
}

// Big words on one line (UI-7, the owner 2026-10-26: "Some text is on two lines with the same style"): the district's
// card, the warning past the map's edge - as big as they're made, smaller when they'd be wider than the screen less a
// margin (style.css keeps them to one line: nowrap). Its <small> line keeps its own size.
export function fitLine(el, room = innerWidth - 24) {
  el.style.fontSize = '';
  for (let i = 0; i < 3; i++) {
    const w = el.scrollWidth;
    if (!(w > room)) return;
    const f = parseFloat(getComputedStyle(el).fontSize);
    el.style.fontSize = `${Math.max(14, Math.floor(f * room / w))}px`;
    if (f <= 14) return;
  }
}

// The backpack you dropped when you died, on the radar and the map: a little pack in its rarity's colour, blinking in
// its last half minute
export function packIcon(g, x, y, r, k) {
  const T = PACK_TIERS[r.t] || PACK_TIERS[1];
  if (r.s < 30 && (performance.now() / 250 | 0) % 2) return;
  const w = 5 * k, h = 6 * k;
  g.fillStyle = '#000'; g.fillRect(x - w - 1.5, y - h - 1.5, w * 2 + 3, h * 2 + 3);
  g.fillStyle = T.col; g.fillRect(x - w, y - h + 2 * k, w * 2, h * 2 - 2 * k); g.fillRect(x - w + 1.5 * k, y - h, w * 2 - 3 * k, 2 * k);
  g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(x - w + 1.5 * k, y + 1 * k, w * 2 - 3 * k, 3 * k);
}
// The part of the world the city map shows (px): every island, trimmed of open sea at the edges - the world's frame
// (the map's m.frame) less today's margins of open sea. Today's world: MAP_FRAME (tools/build-worldmap2.mjs bakes the
// big map's picture over it).
export const mapFrameOf = (map) => { const F = map.frame; return [24 * TILE, 10 * TILE, (F.w - 8) * TILE, (F.h - 30) * TILE]; };
export const MAP_FRAME = [24 * TILE, 10 * TILE, 1304 * TILE, 1170 * TILE];   // (today's world's: mapFrameOf(map) for the world the server runs)

let centroids = null;
const MIDS = new WeakMap();
export function districtCentroids(map) {
  // (World v3's window: every district's middle, from the index - not the window's, and not kept from the first window)
  if (map.mids) {
    if (!MIDS.has(map)) MIDS.set(map, map.mids.filter(([d, , , here]) => DISTRICTS[d] && (here || DISTRICTS[d].tier !== 'wild')).map(([d, x, y]) => ({ name: DISTRICTS[d].name, turf: DISTRICTS[d].turf, x: (x + 0.5) * TILE, y: (y + 0.5) * TILE })));
    return MIDS.get(map);
  }
  if (centroids) return centroids;
  const acc = new Map();
  for (let ty = Math.ceil(map.y0 / 3) * 3; ty < map.y0 + map.h; ty += 3) for (let tx = Math.ceil(map.x0 / 3) * 3; tx < map.x0 + map.w; tx += 3) {
    const d = map.dist[map.idx(tx, ty)];
    if (d === 13) continue;
    const a = acc.get(d) || acc.set(d, [0, 0, 0]).get(d);
    a[0] += tx; a[1] += ty; a[2]++;
  }
  // a district scattered over many islets has its middle out at sea: no label for it
  centroids = [...acc].filter(([d, [x, y, n]]) => (map.inside(Math.round(x / n), Math.round(y / n)) && map.dist[map.idx(Math.round(x / n), Math.round(y / n))] === d) || DISTRICTS[d].tier !== 'wild')
    .map(([d, [x, y, n]]) => ({ name: DISTRICTS[d].name, turf: DISTRICTS[d].turf, x: (x / n + 0.5) * TILE, y: (y / n + 0.5) * TILE }));
  return centroids;
}

const POI_ICON = {
  hospital: ['H', '#ff5a5a'], police: ['P', '#6aa6ff'], bank: ['$', '#3ddc84'], gunshop: ['G', '#ff9a3a'], pawn: ['¢', '#ffd36b'],
  sports: ['S', '#7de0ff'], hardware: ['T', '#ff9a3a'], pharmacy: ['+', '#3ddc84'], coffee: ['C', '#c89a6a'], garage: ['R', '#ffd400'],
  clothing: ['D', '#e080ff'], dealer: ['V', '#ff5a5a'], warehouse: ['W', '#ffd400'], fence: ['X', '#c07aff'], grocery: ['F', '#3ddc84'],
  fishmarket: ['≈', '#25b8c0'], marina: ['B', '#7de0ff'], rental: ['⛵', '#7de0ff'], farm: ['¥', '#b8e02a'], courthouse: ['J', '#e8d8a8'],
  charter: ['≈', '#7de0ff'], sar: ['✚', '#ff6a4a'], smuggler: ['☠', '#ff5a5a'], convenience: ['¤', '#ffd36b'], gasstation: ['⛽', '#ff9a3a'], station: ['≡', '#f0f0f0'],
  airport: ['✈', '#9fd0ff'], tackle: ['🎣', '#25b8c0'], winery: ['🍷', '#c04a7a'], clubhouse: ['⛳', '#7de07a'], roadhouse: ['🍺', '#ff7a3a'], market: ['🧺', '#e8b060'],
  fruitstand: ['🍎', '#ff6a5a'], farmstand: ['🍯', '#e0b040'], snack: ['🌭', '#ffb060'], salvage: ['⚙', '#c0c8d0'], barber: ['✂', '#f0b0d8'], ride: ['🎡', '#ff9ad0'], race: ['🏁', '#f0f0f0'],
  bowling: ['🎳', '#ff7ad0'],
  cinema: ['🎬', '#ffd27a'], bathhouse: ['♨', '#9ad8f0'],   // (nat5: the bathhouses - shared/regionpack.js lists their doors as one)
  lodge: ['⛺', '#d8a860'], huntcamp: ['⛺', '#d8a860'],   // (the hunting lodges and the outfitters: World v3b's marsh outfitters among them)
};
// one icon for a place with more than one counter (the market's rows of stalls): the same kind within this of
// another is left off the maps
const ICON_MERGE = 640;
// the map's places by 1024 px cell (once per map: a World v3 window, once per swap), and the indices of those within r px
// of (x, y) - every one when r is Infinity (the big map)
const POI_CELL = 1024, POI_GRIDS = new WeakMap(), NEAR = [];
export function poiNear(map, x, y, r) {
  const list = map.pois || [];
  NEAR.length = 0;
  if (!(r < Infinity)) { for (let i = 0; i < list.length; i++) NEAR.push(i); return NEAR; }
  let g = POI_GRIDS.get(map);
  if (!g) {
    POI_GRIDS.set(map, (g = new Map()));
    for (let i = 0; i < list.length; i++) { const p = list[i]; if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue; const k = Math.floor(p.y / POI_CELL) * 4096 + Math.floor(p.x / POI_CELL); let a = g.get(k); if (!a) g.set(k, (a = [])); a.push(i); }
  }
  const gx0 = Math.floor((x - r) / POI_CELL), gx1 = Math.floor((x + r) / POI_CELL), gy0 = Math.floor((y - r) / POI_CELL), gy1 = Math.floor((y + r) / POI_CELL);
  for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) { const a = g.get(gy * 4096 + gx); if (a) for (const i of a) NEAR.push(i); }
  NEAR.sort((a, b) => a - b);   // (drawn in the list's order, as before)
  return NEAR;
}
export function iconSkip(map) {
  if (map._iconSkip) return map._iconSkip;
  const list = map.places || map.pois;   // (World v3's window: the whole world's places, from the index)
  let skip = SKIPS.get(list);
  if (!skip) SKIPS.set(list, (skip = iconMerge(list)));
  Object.defineProperty(map, '_iconSkip', { value: skip, enumerable: false, configurable: true });
  return skip;
}
// the places whose icon a nearer one of the same kind stands for (within ICON_MERGE, the first in the list kept): each
// kept place goes in a grid of ICON_MERGE cells by kind, so a place looks at the 3 x 3 cells round it - it looked at
// every place kept so far, of all kinds (World v3's thousands of places: 0.9 s of the page's start on a phone-slow
// CPU, again at every window swap - tools/phonebench.mjs --profile, hud.js iconSkip)
const SKIPS = new WeakMap();
export function iconMerge(list) {
  const skip = new Set(), byKind = new Map();
  for (const p of list || []) {
    if (!p || p.kind === 'delivery' || p.kind === 'vending' || p.kind === 'reception' || p.kind === 'evidence') continue;   // (no icons)
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;   // (kept, and never near another: as Math.hypot of NaN)
    let G = byKind.get(p.kind);
    if (!G) byKind.set(p.kind, (G = new Map()));
    const cx = Math.floor(p.x / ICON_MERGE), cy = Math.floor(p.y / ICON_MERGE);
    let near = false;
    for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1 && !near; dx++) {
      const cell = G.get(`${cx + dx},${cy + dy}`);
      if (cell) for (const q of cell) if (Math.hypot(q.x - p.x, q.y - p.y) < ICON_MERGE) { near = true; break; }
    }
    if (near) { skip.add(p.id); continue; }
    const k = `${cx},${cy}`, cell = G.get(k);
    if (cell) cell.push(p); else G.set(k, [p]);
  }
  return skip;
}

// World v3's window (a part of the world, docs/WORLD-V3.md 8.12): the minimap is the whole frame coarse - a pixel every
// k tiles: the index's picture of the world (shared/regionpack.js), else the windows painted in as they come; 5 MB of
// pixels at v3, not a frame-sized canvas's 81 - and the window's own picture over it, a pixel a tile (c.win: 9 MB).
function coarseMinimap(c, map) {
  const P = map.picture, k = (c.k = P ? P.k : 4);
  c.width = Math.ceil(map.frame.w / k); c.height = Math.ceil(map.frame.h / k);
  if (P && P.w === c.width && P.h === c.height) {
    const g = c.getContext('2d'), img = g.createImageData(P.w, P.h), col = MINI_COL();
    for (let i = 0; i < P.tiles.length; i++) { const c3 = col[P.tiles[i]] || [0, 0, 0]; img.data[i * 4] = c3[0]; img.data[i * 4 + 1] = c3[1]; img.data[i * 4 + 2] = c3[2]; img.data[i * 4 + 3] = 255; }
    g.putImageData(img, 0, 0);
  }
  paintMinimap(c, map);
  return c;
}
// (a new window: its part of the coarse picture when the index had none - what was seen before stays - and its own)
// sliced: a window swapped in while you play (setMap) has its own picture painted a few ms at a time, between frames - the
// window before's shows meanwhile (11-06: 2.3 million pixels at once was a phone's long task at every region's border)
const SLICE_MS = 4;
function paintMinimap(c, map, sliced = false) {
  if (!c || !c.getContext) return;
  if (sliced && map.picture) { paintWinSliced(c, map); return; }
  const k = c.k || 1, g = c.getContext('2d'), col = MINI_COL();
  if (!map.picture) {
    const x0 = Math.ceil(map.x0 / k), y0 = Math.ceil(map.y0 / k), w = Math.floor((map.x0 + map.w) / k) - x0, h = Math.floor((map.y0 + map.h) / k) - y0;
    if (w > 0 && h > 0) {
      const img = g.createImageData(w, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const tx = Math.min(map.x0 + map.w - 1, (x0 + x) * k + (k >> 1)), ty = Math.min(map.y0 + map.h - 1, (y0 + y) * k + (k >> 1));
        const c3 = col[map.tiles[map.idx(tx, ty)]] || [0, 0, 0], i = (y * w + x) * 4;
        img.data[i] = c3[0]; img.data[i + 1] = c3[1]; img.data[i + 2] = c3[2]; img.data[i + 3] = 255;
      }
      g.putImageData(img, x0, y0);
    }
  }
  g.save(); g.scale(1 / k, 1 / k); g.beginPath(); g.rect(map.x0, map.y0, map.w, map.h); g.clip();
  miniLines(g, map);
  g.restore();
  const W = c.win && c.win.width === map.w && c.win.height === map.h ? c.win : document.createElement('canvas');
  if (W !== c.win) { W.width = map.w; W.height = map.h; }
  W.x0 = map.x0; W.y0 = map.y0;
  const wg = W.getContext('2d'), img = wg.createImageData(map.w, map.h);
  winRows(map, img, map.y0, map.y0 + map.h, col);
  wg.putImageData(img, 0, 0);
  wg.save(); wg.translate(-map.x0, -map.y0); miniLines(wg, map); wg.restore();
  c.win = W;
}
// the window's tiles, a pixel each, rows ty0..ty1 into img
function winRows(map, img, ty0, ty1, col) {
  const d = img.data;
  for (let ty = ty0; ty < ty1; ty++) {
    const row = map.row(ty), o = (ty - map.y0) * map.w;
    for (let tx = map.x0; tx < map.x0 + map.w; tx++) {
      const c3 = col[map.tiles[row + map.col(tx)]] || [0, 0, 0], i = (o + tx - map.x0) * 4;
      d[i] = c3[0]; d[i + 1] = c3[1]; d[i + 2] = c3[2]; d[i + 3] = 255;
    }
  }
}
// ...a slice at a time (SLICE_MS), between frames; a newer window's painting takes over from an older one's
function paintWinSliced(c, map) {
  const job = (c.job = { map }), col = MINI_COL(), W = document.createElement('canvas');
  W.width = map.w; W.height = map.h; W.x0 = map.x0; W.y0 = map.y0;
  const wg = W.getContext('2d'), img = wg.createImageData(map.w, map.h);
  let ty = map.y0, put = 0;
  const step = () => {
    if (c.job !== job) return;
    const t = performance.now();
    if (ty < map.y0 + map.h) {
      while (ty < map.y0 + map.h && performance.now() - t < SLICE_MS) { const n = Math.min(map.y0 + map.h, ty + 64); winRows(map, img, ty, n, col); ty = n; }
      setTimeout(step, 0); return;
    }
    // (the pixels put in a band at a time, then the lines over them)
    if (put < map.h) { const n = Math.min(map.h, put + 384); wg.putImageData(img, 0, 0, 0, put, map.w, n - put); put = n; setTimeout(step, 0); return; }
    const k = c.k || 1, g = c.getContext('2d');
    g.save(); g.scale(1 / k, 1 / k); g.beginPath(); g.rect(map.x0, map.y0, map.w, map.h); g.clip(); miniLines(g, map); g.restore();
    wg.save(); wg.translate(-map.x0, -map.y0); miniLines(wg, map); wg.restore();
    c.win = W; c.job = null;
  };
  setTimeout(step, 0);
}
// the minimap's part (sx, sy, sw, sh: in tiles) drawn into (dx, dy, dw, dh): today's world one canvas, a pixel a tile;
// World v3's window the coarse picture with the window's own over it
export function drawMini(g, c, sx, sy, sw, sh, dx, dy, dw, dh) {
  const k = c.k || 1, W = c.win;
  g.drawImage(c, sx / k, sy / k, sw / k, sh / k, dx, dy, dw, dh);
  if (!W) return;
  const x0 = Math.max(sx, W.x0), y0 = Math.max(sy, W.y0), x1 = Math.min(sx + sw, W.x0 + W.width), y1 = Math.min(sy + sh, W.y0 + W.height);
  if (x1 > x0 && y1 > y0) g.drawImage(W, x0 - W.x0, y0 - W.y0, x1 - x0, y1 - y0, dx + (x0 - sx) * dw / sw, dy + (y0 - sy) * dh / sh, (x1 - x0) * dw / sw, (y1 - y0) * dh / sh);
}
const MINI_COL = () => ({
  [T.ROAD]: [70, 70, 78], [T.BRIDGE]: [90, 90, 98], [T.SIDEWALK]: [150, 150, 145], [T.PLAZA]: [140, 110, 95], [T.LOT]: [80, 80, 86],
  [T.GRASS]: [50, 105, 45], [T.BUILDING]: [190, 160, 120], [T.WATER]: [35, 85, 165], [T.DEEP]: [25, 60, 130], [T.SAND]: [215, 195, 140],
  [T.DOCK]: [140, 95, 55], [T.DIRT]: [140, 105, 65], [T.FIELD]: [125, 155, 45], [T.WALL]: [0, 0, 0],
});
function buildMinimap(map) {
  const c = document.createElement('canvas');
  if (map.w < map.frame.w || map.h < map.frame.h) return coarseMinimap(c, map);   // (World v3's window)
  c.width = map.frame.w; c.height = map.frame.h;   // (the world's picture, one pixel a tile: the map paints its part)
  const g = c.getContext('2d');
  const img = g.createImageData(c.width, c.height);
  const col = {
    [T.ROAD]: [70, 70, 78], [T.BRIDGE]: [90, 90, 98], [T.SIDEWALK]: [150, 150, 145], [T.PLAZA]: [140, 110, 95], [T.LOT]: [80, 80, 86],
    [T.GRASS]: [50, 105, 45], [T.BUILDING]: [190, 160, 120], [T.WATER]: [35, 85, 165], [T.DEEP]: [25, 60, 130], [T.SAND]: [215, 195, 140],
    [T.DOCK]: [140, 95, 55], [T.DIRT]: [140, 105, 65], [T.FIELD]: [125, 155, 45], [T.WALL]: [0, 0, 0],
  };
  for (let ty = map.y0; ty < map.y0 + map.h; ty++) {
    const row = map.row(ty);
    for (let tx = map.x0; tx < map.x0 + map.w; tx++) {
      const c3 = col[map.tiles[row + map.col(tx)]] || [0, 0, 0], i = (ty * c.width + tx) * 4;
      img.data[i] = c3[0]; img.data[i + 1] = c3[1]; img.data[i + 2] = c3[2]; img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  miniLines(g, map);
  return c;
}
// the railway and the elevated roads over the minimap's tiles
function miniLines(g, map) {
  // (World v3's window holds the part of the loop inside it: no line across where it leaves the window)
  const part = map.w < map.frame.w || map.h < map.frame.h, gap = (p, q) => part && Math.abs(q.x - p.x) + Math.abs(q.y - p.y) > 40 * TILE;
  // the railway: a dark line round the loop with cross-ties, a dot at every station
  if (map.rail) {
    const pts = map.rail.pts;
    g.lineWidth = 2; g.strokeStyle = '#2a2420';
    g.beginPath();
    for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; if (gap(p, q)) continue; g.moveTo(p.x / TILE, p.y / TILE); g.lineTo(q.x / TILE, q.y / TILE); }
    g.stroke();
    g.strokeStyle = '#c9c2b0'; g.lineWidth = 0.6; g.setLineDash([1, 3]);
    g.beginPath();
    for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; if (gap(p, q)) continue; g.moveTo(p.x / TILE, p.y / TILE); g.lineTo(q.x / TILE, q.y / TILE); }
    g.stroke(); g.setLineDash([]);
    for (const st of map.rail.stations) { g.fillStyle = '#2a2420'; g.beginPath(); g.arc(st.x / TILE, st.y / TILE, 3.2, 0, 6.28); g.fill(); g.fillStyle = '#f4f0e6'; g.beginPath(); g.arc(st.x / TILE, st.y / TILE, 1.8, 0, 6.28); g.fill(); }
  }
  // the elevated ring highway and its ramps, drawn over whatever is beneath them
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const [w, colr] of [[1, '#1c1d22'], [0, '#e8b84a']]) {
    for (const e of map.edges || []) {
      if (e.lvl === 0) continue;
      g.lineWidth = (e.lvl === 1 ? 7 : 3) + w * 2; g.strokeStyle = colr;
      if (!w && e.lvl !== 1) g.strokeStyle = '#c99a3c';
      g.beginPath(); g.moveTo(e.pts[0].x / TILE, e.pts[0].y / TILE);
      for (const p of e.pts) g.lineTo(p.x / TILE, p.y / TILE);
      g.stroke();
    }
  }
}

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
