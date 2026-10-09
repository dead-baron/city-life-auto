// DOM HUD: health/stamina, money, wanted stars, chrono clock, faction, toasts, prompt,
// job tracker, weapon panel, fishing cue, shop menus, death screen, radar + big map.
import { WEAPONS, ITEMS, PACK_TIERS } from '../shared/items.js';
import { T, TILE, MAP_W, MAP_H, gameClock, WEATHER } from '../shared/constants.js';
import { glyph, formatPrompt, localizeText, keyName } from './glyphs.js';
import { input } from './input.js';
import { EVENT_KINDS } from '../shared/worldevents.js';
import { DISTRICTS } from '../shared/map.js';
import { weaponIcon } from './render/peds.js';
import { DEATH_REVEAL_S } from '../shared/rules.js';
import { iconURL } from './pixicons.js';

const $ = (id) => document.getElementById(id);
const thumbs = new Map();
function weaponThumb(i) { if (!thumbs.has(i)) thumbs.set(i, weaponIcon(i).toDataURL()); return thumbs.get(i); }
const WEAPON_BY_ID = WEAPONS;

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
  }

  setMe(me) {
    const prev = this.me;
    this.me = me;
    if (this.held && this.held.length && !$('hud').classList.contains('hidden')) { // notes that came in on the title screen
      const held = this.held; this.held = [];
      for (const t of held) if (performance.now() - t.at < 60000) this.toast(t.text, t.tone);
    }
    const hpPct = Math.max(0, me.hp / me.maxHp) * 100;
    $('hp-fill').style.width = hpPct + '%';
    $('hp-fill').classList.toggle('low', hpPct < 30);
    $('cash').textContent = '$' + me.cash.toLocaleString();
    $('bank').textContent = `BANK $${me.bank.toLocaleString()}`;
    const st = [];
    if (me.bleeding) st.push('<span class="bad">BLEEDING</span>');
    if (me.peak > 0) st.push(`RECORD ${'★'.repeat(me.peak)}${me.disguised ? ' (DISGUISED)' : ''}`);
    // (btime: the bounty placed on you - its clock only runs while you're out in the city: server/systems/bounties.js)
    if (me.bounty > 0) st.push(`<span class="bad">💀 BOUNTY $${me.bounty.toLocaleString('en-US')}${me.btime ? ` · ${Math.max(1, Math.ceil(me.btime.left / 60))}m${me.btime.paused ? ' (paused)' : ''}` : ''}</span>`);
    if (me.buffs?.coffee > 0) st.push(`COFFEE ${Math.ceil(me.buffs.coffee)}s`);
    if (me.buffs?.energy > 0) st.push(`ENERGY ${Math.ceil(me.buffs.energy)}s`);
    if (me.buffs?.wine > 0) st.push(`WINE ${Math.ceil(me.buffs.wine)}s`);
    if (me.buffs?.hearty > 0) st.push(`HEARTY ${Math.ceil(me.buffs.hearty / 60)}m`);
    if (me.buffs?.scent > 0) st.push(`SCENT ${Math.ceil(me.buffs.scent)}s`);
    if (me.light) st.push('🔦 ON');
    if (me.ghost) st.push('GHOST');
    st.push(`<span class="dim">EXP ${me.cexp} · SAM ${me.sam}</span>`);
    $('status').innerHTML = st.join(' · ');
    // stars (GTA style: outlined when empty, gold and flashing when fresh)
    const flashing = this.flareUntil && performance.now() < this.flareUntil;
    let s = '';
    for (let i = 1; i <= 5; i++) s += `<span class="${i <= me.wanted ? 'on' + (flashing ? ' flash' : '') : ''}">★</span>`;
    $('stars').innerHTML = s;
    $('stars').classList.toggle('wanted', me.wanted > 0);
    if (me.wanted > this.lastStars) this.flareUntil = performance.now() + 3000;
    this.lastStars = me.wanted;
    const f = $('faction');
    f.className = me.faction;
    f.innerHTML = me.faction === 'enforcer' ? `POLICE · ${(me.rank || 'Officer').toUpperCase()}${me.misconduct && me.misconduct.n ? ` · <span class="misc${me.misconduct.n >= me.misconduct.max ? ' last' : ''}">MISCONDUCT ${me.misconduct.n}/${me.misconduct.max}</span>` : ''}` : { citizen: 'CITIZEN', criminal: 'CRIMINAL', hunter: 'BOUNTY HUNTER' }[me.faction] + (me.felonies > 0 && me.faction !== 'criminal' ? ` · ${me.felonies} FELON${me.felonies === 1 ? 'Y' : 'IES'}` : '');
    // prompt -> GTA help box with the right button for this device; matching touch button pulses
    const pr = $('helpbox');
    const sig = (me.prompt || '') + '|' + input.device;
    if (me.prompt && !me.dead) {
      if (pr.dataset.sig !== sig) {
        pr.dataset.sig = sig;
        const fp = formatPrompt(me.prompt);
        pr.innerHTML = fp.html;
        document.querySelectorAll('#tbtns .pulse').forEach((b) => b.classList.remove('pulse'));
        if (fp.action) document.querySelector(`#tbtns [data-b="${fp.action}"]`)?.classList.add('pulse');
      }
      pr.classList.remove('hidden');
    } else if (!pr.classList.contains('hidden')) {
      pr.classList.add('hidden'); pr.dataset.sig = '';
      document.querySelectorAll('#tbtns .pulse').forEach((b) => b.classList.remove('pulse'));
    }
    document.body.classList.toggle('carrying', !!me.carrying);
    // job
    const jb = $('job');
    if (me.job) { jb.textContent = '▶ ' + me.job.text; jb.classList.remove('hidden'); } else jb.classList.add('hidden');
    const rb = $('rob');
    if (me.rob) {
      rb.classList.remove('hidden'); rb.classList.toggle('alarm', !!me.rob.alarm);
      $('rob-fill').style.width = Math.round(me.rob.warm * 100) + '%';
      $('rob-take').textContent = me.rob.alarm ? `ALARM! $${me.rob.take} - get out!` : me.rob.warm < 1 ? 'Hands up...' : `$${me.rob.take}`;
    } else rb.classList.add('hidden');
    // riding a train: next stop, the tunnel, the strongbox
    const tb = $('trainbar'), tr = me.train, cu = me.custody;
    tb.classList.toggle('custody', !!(cu && cu.s !== 'cell' && !me.dead));
    if (cu && cu.s !== 'cell' && !me.dead) {
      // arrested (server custody.js): held on the ground, a car coming, walked to it, the ride to the station
      tb.classList.remove('hidden', 'sub', 'warn', 'alarm', 'bus', 'taxi', 'ferry'); tb.style.borderColor = '';
      $('tb-where').textContent = 'IN CUSTODY';
      // (the car stuck or not coming: the action button makes a break for it - custody.js offerBreak)
      const brk = cu.brk ? ` · make a break for it [${input.device === 'gamepad' ? 'B' : input.device === 'touch' ? 'ACT' : 'E'}]` : '';
      $('tb-next').textContent = (cu.s === 'held' ? 'Cuffed and held on the ground' : cu.s === 'fetch' ? (cu.brk ? 'Cuffed · the police car isn\'t coming' : 'Cuffed · a police car is coming to take you in')
        : cu.s === 'escort' ? 'Being walked to the police car' : cu.brk ? 'The police car is going nowhere' : `In the back of the police car${cu.at ? ` · to ${cu.at}` : ''}${cu.by ? ` · ${cu.by} driving` : ''}`) + brk;
      tb.classList.toggle('brk', !!cu.brk);
      $('tb-crack').classList.add('hidden');
    } else if (tr && !me.dead) {
      // the mail guards' warning: at the door ('door'), then the seconds left to get out (0: they're shooting)
      const warn = tr.warn ?? null;
      tb.classList.remove('hidden'); tb.classList.toggle('sub', !!tr.sub); tb.classList.toggle('warn', warn === 'door'); tb.classList.toggle('alarm', warn !== null && warn !== 'door');
      $('tb-where').textContent = warn === 'door' ? 'MAIL CAR AHEAD' : tr.car === 'mail' ? 'MAIL CAR' : tr.sub ? 'SUBWAY' : tr.rural ? 'RURAL RUN' : 'ON THE TRAIN';
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
        : t.st === 'wait' ? `At the kerb · ${keyName('action')} by the cab to get in (${t.wait}s)`
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
    cb.textContent = cr && cr.cd > 0 ? `COP CAR ${cr.cd}` : 'COP CAR';
    cb.classList.toggle('cooling', !!(cr && cr.cd > 0));
    // the flashlight's touch button: there while you own one, lit while it's on
    document.body.classList.toggle('has-light', !!(me.inv && me.inv.flashlight > 0 && !me.dead));
    $('b-light')?.classList.toggle('lit', !!me.light);
    // weapon
    const w = WEAPON_BY_ID[me.weapon] || WEAPONS.fists;
    $('w-name').textContent = w.name;
    const ow = me.weapons.find((x) => x.id === me.weapon);
    $('w-ammo').textContent = w.mag ? (me.reloading ? 'RELOADING' : `${ow ? ow.mag : 0} | ${ow ? Math.max(0, ow.ammo - ow.mag) : 0}`) : (me.weapons.length > 1 ? (input.device === 'touch' ? 'tap: next · hold: pick' : `${keyName('nextw')} to switch`) : '');
    const wi = $('w-icon');
    if (wi.dataset.w !== String(w.i)) { wi.dataset.w = String(w.i); wi.innerHTML = ''; wi.appendChild(weaponIcon(w.i)); }
    // the touch WPN button shows what's in your hands (tap: the next one, hold: the picker)
    const bwi = $('b-wpn')?.querySelector('.wi');
    if (bwi && bwi.dataset.w !== String(w.i)) { bwi.dataset.w = String(w.i); bwi.innerHTML = ''; bwi.appendChild(weaponIcon(w.i)); }
    document.body.classList.toggle('multi-wpn', me.weapons.length > 1 && !me.dead);
    document.body.classList.toggle('armed', w.type !== 'melee' && w.type !== 'tool');
    const inv = Object.entries(me.inv).filter(([k]) => ITEMS[k]).map(([k, n]) => `${ITEMS[k].name} x${n}`);
    $('w-carry').textContent = (me.carrying ? `Carrying ${['', 'Wood Box', 'Steel Barrel', 'Iron Vault', 'Carbon-Gold Case'][me.carrying]} · ` : '') + (inv.length ? inv.slice(0, 3).join(', ') : '');
    // fishing
    const fb = $('fishbar');
    if (me.fishing) { fb.classList.remove('hidden'); fb.classList.toggle('bite', me.fishing.bite); fb.innerHTML = me.fishing.bite ? `BITE! ${glyph('action')}` : 'Waiting for a bite...'; } else fb.classList.add('hidden');
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
    // death
    const d = $('death');
    if (me.dead) {
      d.classList.remove('hidden');
      // first the scene where it happened, the camera pulling back (main.js), then the choices (the user, 2026-10-08)
      const nowMs = performance.now();
      this.deadSince ||= nowMs;
      this.deathRevealed = nowMs - this.deadSince >= DEATH_REVEAL_S * 1000;
      d.classList.toggle('reveal', this.deathRevealed);
      $('d-cause').textContent = me.deathCause || '';
      const opts = me.spawnOpts || [];
      const chosen = opts.find((o) => o.id === me.spawnChoice);
      const dn = me.down;
      $('d-title').textContent = dn && !dn.finished ? 'DOWN' : 'WASTED';
      const left = Math.ceil(me.respawnIn);
      $('d-timer').textContent = me.respawnIn > 0 ? (dn && !dn.finished
        ? `${dn.help ? 'Waiting for help' : 'You can still be revived'} · waking up${chosen ? ' at ' + chosen.label : ''} in ${left >= 60 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : left + 's'}`
        : `Waking up${chosen ? ' at ' + chosen.label : ''} in ${left}...`) : '';
      // downed: call for help (again: re-alert), the ambulance, give up and wake up now
      const hb = $('d-help');
      const pad = input.device === 'gamepad', kb = input.device === 'keyboard';
      const k = (key, padBtn) => (kb ? ` <i>${key}</i>` : pad ? ` <i>${padBtn}</i>` : '');
      const amb = dn && dn.amb ? ['ambx', `🚑 Cancel ambulance${k('J', 'Y')}`, 'amb on'] : ['amb', `🚑 Call an ambulance $${dn ? dn.fee : ''}${dn && dn.ambUsed ? ' (used)' : ''}${k('J', 'Y')}`, dn && dn.canAmb ? 'amb' : 'amb off'];
      const btns = !dn || dn.finished ? [] : !dn.help
        ? [['help', `<b class="medic">✚</b> Call for help${k('H', 'X')}`, 'help'], amb]
        : [['help', `<b class="medic">✚</b> Call again${k('H', 'X')}`, 'help'], amb,
          ['cancel', `✕ Cancel request${k('C', 'B')}`, 'cancel']];
      const hsig = btns.map((b) => b[1] + b[2]).join('|');
      if (hb.dataset.sig !== hsig) {
        hb.dataset.sig = hsig; hb.innerHTML = '';
        for (const [a, html, cls] of btns) {
          const b = document.createElement('button');
          b.className = 'help-btn ' + cls; b.innerHTML = html; b.dataset.a = a;
          b.disabled = cls.endsWith('off');
          b.onclick = () => this.onDown?.(a);
          hb.appendChild(b);
        }
        if (dn && !dn.finished && !dn.canAmb && !dn.amb && !dn.ambUsed) { const n = document.createElement('small'); n.textContent = `(an ambulance needs $${dn.fee} in the bank)`; hb.appendChild(n); }
      }
      const box = $('d-spawn');
      const sig = opts.map((o) => o.id).join() + '|' + me.spawnChoice + '|' + input.device;
      if (box.dataset.sig !== sig) {
        box.dataset.sig = sig;
        box.innerHTML = opts.length ? '<div class="d-lbl">Wake up at:</div>' : '';
        for (const o of opts) {
          const b = document.createElement('button');
          b.className = 'spawn-opt' + (o.id === me.spawnChoice ? ' on' : '');
          b.textContent = (o.kind === 'home' ? '⌂ ' : '✚ ') + o.label;
          b.onclick = () => { box.querySelectorAll('.spawn-opt').forEach((x) => x.classList.remove('on')); b.classList.add('on'); this.onRespawn?.(o.id); };
          box.appendChild(b);
        }
      }
    } else { d.classList.add('hidden'); d.classList.remove('reveal'); this.deadSince = 0; this.deathRevealed = false; }
    void prev;
  }

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
    if (this.rcTod !== tod) { this.rcTod = tod; $('rc-tod').src = iconURL(tod); }
    $('rc-time').textContent = hm;
    const wx = $('rc-wx');
    if (rain && !wx.getAttribute('src')) wx.src = iconURL('rain');
    wx.classList.toggle('hidden', !rain);
    $('rclock').title = `${c.isNight ? 'Night' : 'Day'} · ${rain ? 'rain' : 'clear'}`;
  }

  toast(text, tone = 'info') {
    // still on the title screen (you sign in there, before PLAY): held back and shown once you're in, if
    // it's still fresh - so the welcome (or "fresh start after an update") isn't missed
    if ($('hud').classList.contains('hidden')) {
      (this.held ||= []).push({ text, tone, at: performance.now() });
      if (this.held.length > 4) this.held.shift();
      return;
    }
    const el = document.createElement('div');
    el.className = 'toast ' + tone;
    el.textContent = localizeText(text);
    $('toasts').appendChild(el);
    this.toastEls.push(el);
    while (this.toastEls.length > 5) this.toastEls.shift().remove();
    setTimeout(() => { el.remove(); this.toastEls = this.toastEls.filter((x) => x !== el); }, 6500);
  }

  // ---- menu ----
  openMenu(m) {
    this.menu = m;
    $('menu').classList.remove('hidden');
    $('m-title').textContent = m.title;
    $('m-sub').textContent = localizeText(m.sub || '');
    $('m-money').textContent = `Wallet $${m.cash.toLocaleString()} · Bank $${m.bank.toLocaleString()}`;
    const box = $('m-opts');
    box.innerHTML = '';
    m.opts.forEach((o, i) => {
      const b = document.createElement('button');
      b.className = 'opt' + (i === this.menuFocus ? ' focus' : '');
      b.disabled = !!o.dis;
      const price = o.price === undefined ? '' : o.price < 0 ? `<span class="price sell">+$${-o.price}</span>` : `<span class="price">$${o.price.toLocaleString()}</span>`;
      // weapon offers carry a picture (placeholder pixel art until the final weapon art lands) and,
      // in the armory, rough stat bars
      const pic = o.wpn !== undefined ? `<img class="wpn" alt="" src="${weaponThumb(o.wpn)}">` : '';
      const bars = o.stats ? `<span class="stats">${[['PWR', o.stats.pow], ['RNG', o.stats.rng], ['ACC', o.stats.acc]].map(([k, v]) => `<i>${k}<b style="width:${v * 8}px"></b></i>`).join('')}</span>` : '';
      if (pic) b.classList.add('has-wpn');
      b.innerHTML = `${pic}<span>${esc(o.label)}${o.note ? `<span class="note">${esc(o.note)}</span>` : ''}${bars}</span>${price}`;
      b.onclick = () => this.choose(i);
      box.appendChild(b);
    });
    if (this.menuFocus >= m.opts.length) this.menuFocus = 0;
  }
  choose(i) {
    const o = this.menu && this.menu.opts[i];
    if (!o || o.dis) return;
    if (o.id === 'close') { this.closeMenu(); return; }
    this.sendMenu(this.menu.poi, o.id);
    if (['hhide', 'hleave', 'armexit', 'sleave'].includes(o.id) || o.id.startsWith('hcargo')) this.closeMenu(); // going in blinks you out; stepping out drops you at the door
  }
  navMenu(d) {
    if (!this.menu) return;
    this.menuFocus = (this.menuFocus + d + this.menu.opts.length) % this.menu.opts.length;
    this.openMenu(this.menu);
  }
  closeMenu() {
    this.menu = null; this.menuFocus = 0;
    $('menu').classList.add('hidden');
    this.closeMenuCb?.();
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
    g.drawImage(this.mini, mx - tr, my - tr, tr * 2, tr * 2, 0, 0, size, size);
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
    g.font = `bold ${big ? 14 : 9}px monospace`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const skipIc = iconSkip(this.map);
    for (const p of this.map.pois) {
      const icon = POI_ICON[p.kind];
      if (!icon || skipIc.has(p.id)) continue;
      const [x, y] = toR(p.x, p.y);
      if (x < -10 || y < -10 || x > size + 10 || y > size + 10) continue;
      g.fillStyle = '#000'; g.fillRect(x - (big ? 8 : 5), y - (big ? 8 : 5), big ? 16 : 10, big ? 16 : 10);
      g.fillStyle = icon[1]; g.fillText(icon[0], x, y + 1);
    }
    if (me) {
      for (const h of me.homes || []) {
        const [x, y] = toR(h.x, h.y);
        g.fillStyle = '#000'; g.fillRect(x - (big ? 8 : 5), y - (big ? 8 : 5), big ? 16 : 10, big ? 16 : 10);
        g.fillStyle = '#3ddc84'; g.fillText('⌂', x, y + 1);
      }
      // rumor + radar pings
      if (me.rumor) { const [x, y] = toR(me.rumor.x, me.rumor.y); g.strokeStyle = me.rumor.t === 4 ? '#ffd36b' : '#c07aff'; g.lineWidth = 2; g.setLineDash([4, 3]); g.beginPath(); g.arc(x, y, me.rumor.r * scale, 0, 6.28); g.stroke(); g.setLineDash([]); }
      for (const r of me.radar || []) {
        const [x, y] = toR(r.x, r.y);
        if (r.k === 'search') { g.fillStyle = `rgba(255,60,60,${0.12 + 0.2 * r.f})`; g.strokeStyle = '#ff3b3b'; g.lineWidth = 1; g.beginPath(); g.arc(x, y, Math.max(4, r.r * scale), 0, 6.28); g.fill(); g.stroke(); }
        else if (r.k === 'wanted') { g.fillStyle = (performance.now() / 200 | 0) % 2 ? '#ff3b3b' : '#3b6bff'; g.beginPath(); g.arc(x, y, big ? 7 : 4, 0, 6.28); g.fill(); }
        else if (r.k === 'bounty') { g.strokeStyle = '#ffc23d'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, Math.max(5, r.r * scale), 0, 6.28); g.stroke(); if (big) { g.fillStyle = '#ffc23d'; g.fillText(`${r.n} $${r.b}`, x, y - r.r * scale - 8); } }
        else if (r.k === 'pack') packIcon(g, x, y, r, big ? 1.4 : 1);
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
      const target = (tx, ty, col) => {
        let [x, y] = toR(tx, ty);
        const dx = x - size / 2, dy = y - size / 2, d = Math.hypot(dx, dy), lim = size / 2 - 9;
        g.fillStyle = col; g.strokeStyle = '#000'; g.lineWidth = 1.5;
        if (d > lim && !big) {
          const a = Math.atan2(dy, dx);
          x = size / 2 + Math.cos(a) * lim; y = size / 2 + Math.sin(a) * lim;
          g.save(); g.translate(x, y); g.rotate(a);
          g.beginPath(); g.moveTo(6, 0); g.lineTo(-4, -5); g.lineTo(-2, 0); g.lineTo(-4, 5); g.closePath(); g.fill(); g.stroke();
          g.restore();
        } else { g.beginPath(); g.arc(x, y, big ? 7 : 4.5, 0, 6.28); g.fill(); g.stroke(); }
      };
      if (me.job) target(me.job.x, me.job.y, '#ffd400');
      if (this.waypoint) target(this.waypoint.x, this.waypoint.y, '#4fd6ff');
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
  get mapView() { return this.worldmap ? this.worldmap.view : null; }
  drawBigMap(cx, cy, heading, opts = {}) { if (this.worldmap) this.worldmap.draw($('bigmap-c'), this, cx, cy, heading, opts); }

  setNet(text) { $('net').textContent = text; }

  // GTA-style district title card when you cross into a new part of town
  showDistrict(name, island = '') {
    const el = $('district');
    el.textContent = name;
    if (island && island !== name) { const sub = document.createElement('small'); sub.textContent = island === 'Rural' ? 'Countryside' : `${island} Island`; el.appendChild(sub); }
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
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
// The part of the world the city map shows (px): every island, trimmed of open sea at the edges.
export const MAP_FRAME = [24 * TILE, 10 * TILE, 1304 * TILE, 1170 * TILE];

let centroids = null;
export function districtCentroids(map) {
  if (centroids) return centroids;
  const acc = new Map();
  for (let ty = 0; ty < MAP_H; ty += 3) for (let tx = 0; tx < MAP_W; tx += 3) {
    const d = map.dist[ty * MAP_W + tx];
    if (d === 13) continue;
    const a = acc.get(d) || acc.set(d, [0, 0, 0]).get(d);
    a[0] += tx; a[1] += ty; a[2]++;
  }
  // a district scattered over many islets has its middle out at sea: no label for it
  centroids = [...acc].filter(([d, [x, y, n]]) => map.dist[Math.round(y / n) * MAP_W + Math.round(x / n)] === d || DISTRICTS[d].tier !== 'wild')
    .map(([d, [x, y, n]]) => ({ name: DISTRICTS[d].name, turf: DISTRICTS[d].turf, x: (x / n + 0.5) * TILE, y: (y / n + 0.5) * TILE }));
  return centroids;
}

const POI_ICON = {
  hospital: ['H', '#ff5a5a'], police: ['P', '#6aa6ff'], bank: ['$', '#3ddc84'], gunshop: ['G', '#ff9a3a'], pawn: ['¢', '#ffd36b'],
  sports: ['S', '#7de0ff'], hardware: ['T', '#ff9a3a'], pharmacy: ['+', '#3ddc84'], coffee: ['C', '#c89a6a'], garage: ['R', '#ffd400'],
  clothing: ['D', '#e080ff'], dealer: ['V', '#ff5a5a'], warehouse: ['W', '#ffd400'], fence: ['X', '#c07aff'], grocery: ['F', '#3ddc84'],
  fishmarket: ['≈', '#25b8c0'], marina: ['B', '#7de0ff'], rental: ['⛵', '#7de0ff'], farm: ['¥', '#b8e02a'], courthouse: ['J', '#e8d8a8'],
  charter: ['≈', '#7de0ff'], smuggler: ['☠', '#ff5a5a'], convenience: ['¤', '#ffd36b'], gasstation: ['⛽', '#ff9a3a'], station: ['≡', '#f0f0f0'],
  airport: ['✈', '#9fd0ff'], tackle: ['🎣', '#25b8c0'], winery: ['🍷', '#c04a7a'], clubhouse: ['⛳', '#7de07a'], market: ['🧺', '#e8b060'],
  fruitstand: ['🍎', '#ff6a5a'], farmstand: ['🍯', '#e0b040'], snack: ['🌭', '#ffb060'], salvage: ['⚙', '#c0c8d0'], ride: ['🎡', '#ff9ad0'], race: ['🏁', '#f0f0f0'],
};
// one icon for a place with more than one counter (the market's rows of stalls): the same kind within this of
// another is left off the maps
const ICON_MERGE = 640;
export function iconSkip(map) {
  if (map._iconSkip) return map._iconSkip;
  const skip = new Set(), kept = [];
  for (const p of map.pois) {
    if (p.kind === 'delivery' || p.kind === 'vending' || p.kind === 'reception' || p.kind === 'evidence') continue;   // (no icons)
    if (kept.some((q) => q.kind === p.kind && Math.hypot(q.x - p.x, q.y - p.y) < ICON_MERGE)) skip.add(p.id); else kept.push(p);
  }
  Object.defineProperty(map, '_iconSkip', { value: skip, enumerable: false, configurable: true });
  return skip;
}

function buildMinimap(map) {
  const c = document.createElement('canvas');
  c.width = MAP_W; c.height = MAP_H;
  const g = c.getContext('2d');
  const img = g.createImageData(MAP_W, MAP_H);
  const col = {
    [T.ROAD]: [70, 70, 78], [T.BRIDGE]: [90, 90, 98], [T.SIDEWALK]: [150, 150, 145], [T.PLAZA]: [140, 110, 95], [T.LOT]: [80, 80, 86],
    [T.GRASS]: [50, 105, 45], [T.BUILDING]: [190, 160, 120], [T.WATER]: [35, 85, 165], [T.DEEP]: [25, 60, 130], [T.SAND]: [215, 195, 140],
    [T.DOCK]: [140, 95, 55], [T.DIRT]: [140, 105, 65], [T.FIELD]: [125, 155, 45], [T.WALL]: [0, 0, 0],
  };
  for (let i = 0; i < MAP_W * MAP_H; i++) {
    const c3 = col[map.tiles[i]] || [0, 0, 0];
    img.data[i * 4] = c3[0]; img.data[i * 4 + 1] = c3[1]; img.data[i * 4 + 2] = c3[2]; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // the railway: a dark line round the loop with cross-ties, a dot at every station
  if (map.rail) {
    const pts = map.rail.pts;
    g.lineWidth = 2; g.strokeStyle = '#2a2420';
    g.beginPath();
    for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; g.moveTo(p.x / TILE, p.y / TILE); g.lineTo(q.x / TILE, q.y / TILE); }
    g.stroke();
    g.strokeStyle = '#c9c2b0'; g.lineWidth = 0.6; g.setLineDash([1, 3]);
    g.beginPath();
    for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; g.moveTo(p.x / TILE, p.y / TILE); g.lineTo(q.x / TILE, q.y / TILE); }
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
  return c;
}

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
