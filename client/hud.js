// DOM HUD: health/stamina, money, wanted stars, chrono clock, faction, toasts, prompt,
// job tracker, weapon panel, fishing cue, shop menus, death screen, radar + big map.
import { WEAPONS, ITEMS } from '../shared/items.js';
import { T, TILE, MAP_W, MAP_H, gameClock, WEATHER, WORLD_VERSION } from '../shared/constants.js';
import { glyph, formatPrompt, localizeText, keyName } from './glyphs.js';
import { input } from './input.js';
import { EVENT_KINDS } from '../shared/worldevents.js';
import { DISTRICTS } from '../shared/map.js';
import { weaponIcon } from './render/peds.js';

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
    if (me.bounty > 0) st.push(`<span class="bad">BOUNTY $${me.bounty}</span>`);
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
    const tb = $('trainbar'), tr = me.train;
    if (tr && !me.dead) {
      // the mail guards' warning: at the door ('door'), then the seconds left to get out (0: they're shooting)
      const warn = tr.warn ?? null;
      tb.classList.remove('hidden'); tb.classList.toggle('sub', !!tr.sub); tb.classList.toggle('warn', warn === 'door'); tb.classList.toggle('alarm', warn !== null && warn !== 'door');
      $('tb-where').textContent = warn === 'door' ? 'MAIL CAR AHEAD' : tr.car === 'mail' ? 'MAIL CAR' : tr.sub ? 'SUBWAY' : tr.rural ? 'RURAL RUN' : 'ON THE TRAIN';
      $('tb-next').textContent = warn === 'door' ? 'Armed guards - staff only! Walk in and they shoot.'
        : warn !== null ? (warn > 0 ? `GUARDS: "GET OUT!" - ${warn}` : 'The guards are shooting!')
          : tr.at ? `At ${tr.next} - F to get off` : `Next: ${tr.next} · ${tr.eta}s`;
      $('tb-crack').classList.toggle('hidden', tr.crack === null);
      if (tr.crack !== null) $('tb-fill').style.width = Math.round(tr.crack * 100) + '%';
    } else tb.classList.add('hidden');
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
    $('w-ammo').textContent = w.mag ? (me.reloading ? 'RELOADING' : `${ow ? ow.mag : 0} | ${ow ? Math.max(0, ow.ammo - ow.mag) : 0}`) : (me.weapons.length > 1 ? (input.device === 'touch' ? 'tap to switch' : `${keyName('nextw')} to switch`) : '');
    const wi = $('w-icon');
    if (wi.dataset.w !== String(w.i)) { wi.dataset.w = String(w.i); wi.innerHTML = ''; wi.appendChild(weaponIcon(w.i)); }
    document.body.classList.toggle('armed', w.type !== 'melee' && w.type !== 'tool');
    const inv = Object.entries(me.inv).filter(([k]) => ITEMS[k]).map(([k, n]) => `${ITEMS[k].name} x${n}`);
    $('w-carry').textContent = (me.carrying ? `Carrying ${['', 'Wood Box', 'Steel Barrel', 'Iron Vault', 'Carbon-Gold Case'][me.carrying]} · ` : '') + (inv.length ? inv.slice(0, 3).join(', ') : '');
    // fishing
    const fb = $('fishbar');
    if (me.fishing) { fb.classList.remove('hidden'); fb.classList.toggle('bite', me.fishing.bite); fb.innerHTML = me.fishing.bite ? `BITE! ${glyph('action')}` : 'Waiting for a bite...'; } else fb.classList.add('hidden');
    // death
    const d = $('death');
    if (me.dead) {
      d.classList.remove('hidden');
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
      const btns = !dn || dn.finished ? [] : !dn.help
        ? [['help', `<b class="medic">✚</b> Call for Help${k('H', 'X')}`, 'help']]
        : [['help', `<b class="medic">✚</b> Call again${k('H', 'X')}`, 'help'],
          dn.amb ? ['ambx', `🚑 Cancel ambulance${k('J', 'Y')}`, 'amb on'] : ['amb', `🚑 Ambulance $${dn.fee}${dn.ambUsed ? ' (used)' : ''}${k('J', 'Y')}`, dn.canAmb ? 'amb' : 'amb off'],
          ['cancel', `✕ Cancel request & wake up${k('C', 'B')}`, 'cancel']];
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
        if (dn && dn.help && !dn.canAmb && !dn.amb && !dn.ambUsed) { const n = document.createElement('small'); n.textContent = `(ambulance needs $${dn.fee} in the bank)`; hb.appendChild(n); }
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
    } else d.classList.add('hidden');
    void prev;
  }

  setClock(loopTime, weather) {
    const c = gameClock(loopTime);
    const h = Math.floor(c.minutes / 60), m = Math.floor(c.minutes % 60);
    $('clock').textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} ${c.isNight ? '☾' : '☀'}${weather === WEATHER.RAIN ? ' ☂ RAIN' : ''}`;
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

  // ---- world map (full city) ------------------------------------------------------------
  // The baked city image (assets/worldmap.webp, rendered by the game's own chunk baker) with
  // district names, places, your homes and job on top. On duty, it becomes the police dispatch
  // map: reported crimes, live suspects you can currently see, and last-known search areas.
  // Map zoom: factor k about a point on the canvas (CSS px; default its middle), clamped 1x-8x.
  zoomMap(k, sx, sy) {
    const V = this.mapView, sc = this.bigmapScale;
    if (!V || !sc) return;
    const c = $('bigmap-c'), cw = c.clientWidth, ch = c.clientHeight;
    if (sx === undefined) { sx = cw / 2; sy = ch / 2; }
    const [ox, oy] = this.bigmapOrigin;
    const wx = ox + sx / sc, wy = oy + sy / sc; // the world point under the finger stays put
    const z = Math.max(1, Math.min(8, V.z * k));
    const ns = this.bigmapFit * z;
    V.z = z; V.cx = wx - sx / ns + cw / ns / 2; V.cy = wy - sy / ns + ch / ns / 2;
  }
  panMap(dx, dy) { const V = this.mapView, sc = this.bigmapScale; if (!V || !sc) return; V.cx -= dx / sc; V.cy -= dy / sc; }
  centerMap(x, y) { if (this.mapView) { this.mapView.cx = x; this.mapView.cy = y; } }
  resetMap() { if (this.mapView) this.mapView.z = 1; }

  drawBigMap(cx, cy, heading) {
    const c = $('bigmap-c');
    const me = this.me;
    const police = !!(me && me.faction === 'enforcer');
    const [fx0, fy0, fx1, fy1] = MAP_FRAME;
    const WW = fx1 - fx0, WH = fy1 - fy0;
    const panel = $('bm-panel'), portrait = innerHeight > innerWidth;
    const maxW = (innerWidth - (portrait ? 0 : (panel ? panel.offsetWidth + 24 : 0))) * 0.96, maxH = (innerHeight - (portrait && panel ? panel.offsetHeight + 16 : 0)) * 0.86;
    const fit = Math.min(maxW / WW, maxH / WH);
    const w = Math.round(WW * fit), h = Math.round(WH * fit);
    // zoomed in, the canvas shows a window of the frame round the view centre (clamped to it)
    const V = this.mapView || (this.mapView = { z: 1, cx: (fx0 + fx1) / 2, cy: (fy0 + fy1) / 2 });
    const vw = WW / V.z, vh = WH / V.z;
    V.cx = Math.max(fx0 + vw / 2, Math.min(fx1 - vw / 2, V.cx)); V.cy = Math.max(fy0 + vh / 2, Math.min(fy1 - vh / 2, V.cy));
    const ox = V.cx - vw / 2, oy = V.cy - vh / 2;
    const sc = fit * V.z;
    this.bigmapScale = sc; this.bigmapOrigin = [ox, oy]; this.bigmapFit = fit;
    const dpr = Math.min(2, devicePixelRatio || 1);
    if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); c.style.width = w + 'px'; c.style.height = h + 'px'; }
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const img = worldMapImage(this.map);
    // the framed part of the world (the outer wild islands lie beyond it)
    g.clearRect(0, 0, w, h);
    const crop = (im) => { const kx = im.width / (MAP_W * TILE), ky = im.height / (MAP_H * TILE); g.drawImage(im, ox * kx, oy * ky, vw * kx, vh * ky, 0, 0, w, h); };
    if (img) { g.imageSmoothingEnabled = true; crop(img); }
    else { g.imageSmoothingEnabled = false; crop(this.mini); }
    if (police) { g.fillStyle = 'rgba(8,16,40,.35)'; g.fillRect(0, 0, w, h); }
    const P = (x, y) => [(x - ox) * sc, (y - oy) * sc];
    const now = performance.now();
    // district names
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const fs = Math.max(9, Math.min(15, w / 70));
    g.font = `${fs}px Anton, Impact, sans-serif`;
    const taken = [];   // the labels drawn so far (screen boxes): a place's name only goes where it doesn't cover another
    const free = (x, y, tw, th) => { const b = [x - tw / 2 - 2, y - th / 2 - 1, x + tw / 2 + 2, y + th / 2 + 1]; if (taken.some((q) => b[0] < q[2] && b[2] > q[0] && b[1] < q[3] && b[3] > q[1])) return false; taken.push(b); return true; };
    for (const d of districtCentroids(this.map)) {
      const [x, y] = P(d.x, d.y);
      taken.push([x - g.measureText(d.name.toUpperCase()).width / 2 - 2, y - fs / 2 - 1, x + g.measureText(d.name.toUpperCase()).width / 2 + 2, y + fs / 2 + 1]);
      g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.8)'; g.strokeText(d.name.toUpperCase(), x, y);
      g.fillStyle = d.turf ? '#ff8a7a' : '#fff4c8'; g.fillText(d.name.toUpperCase(), x, y);
    }
    // the places (landmarks, and the painted ones): zoom in and the crowded ones show too
    const lfs = Math.max(8, fs - 3);
    g.font = `${lfs}px Anton, Impact, sans-serif`;
    const named = new Set();
    for (const pt of (this.map.paintings || []).concat(this.map.landmarks || [])) {
      if (!pt.name || named.has(pt.name)) continue;   // (a painted place laid out again as a designed one: its name once)
      const [x, y] = P(pt.x + pt.w / 2, pt.y + pt.h + 40), label = pt.name.toUpperCase();
      if (x < -200 || y < -50 || x > w + 200 || y > h + 50 || !free(x, y, g.measureText(label).width, lfs)) continue;
      named.add(pt.name);
      g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.8)'; g.strokeText(label, x, y);
      g.fillStyle = '#bfe9ff'; g.fillText(label, x, y);
    }
    // the railway: a dark line with white ties, round the whole loop (drawn under the district names' level of detail)
    if (this.map.rail) {
      const rp = this.map.rail.pts;
      g.lineCap = 'round'; g.lineJoin = 'round';
      for (const [lw, col, dash] of [[3.6, 'rgba(20,16,12,.9)', []], [1.4, '#e8e0cc', [2, 4]]]) {
        g.lineWidth = lw; g.strokeStyle = col; g.setLineDash(dash);
        g.beginPath();
        for (let i = 0; i < rp.length; i += 4) { const [x, y] = P(rp[i].x, rp[i].y); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
        g.closePath(); g.stroke();
      }
      g.setLineDash([]);
    }
    // the elevated ring highway and its ramps
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const [wd, colr] of [[2.5, 'rgba(0,0,0,.6)'], [0, '#f0c050']]) {
      for (const e of this.map.edges || []) {
        if (e.lvl === 0) continue;
        g.lineWidth = Math.min(7, Math.max(1.5, e.w * sc * (e.lvl === 1 ? 0.8 : 0.9))) + wd; // thin when zoomed in: the baked map shows the deck itself
        g.strokeStyle = colr;
        g.beginPath();
        e.pts.forEach((p, i) => { const [x, y] = P(p.x, p.y); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
        g.stroke();
      }
    }
    // the railway loop (dashed where it runs underground) - every station is a stop
    if (this.map.rail) {
      const pts = this.map.rail.pts;
      for (const [under, col, wd] of [[false, 'rgba(0,0,0,.55)', 4], [false, '#e0b070', 2], [true, '#e0b070', 2]]) {
        g.strokeStyle = col; g.lineWidth = wd; g.setLineDash(under ? [4, 4] : []);
        g.beginPath();
        for (let i = 0; i <= pts.length; i++) {
          const a = pts[i % pts.length], b = pts[(i + 1) % pts.length];
          if (!!a.under !== under || i === pts.length) continue;
          const [x1, y1] = P(a.x, a.y), [x2, y2] = P(b.x, b.y);
          g.moveTo(x1, y1); g.lineTo(x2, y2);
        }
        g.stroke();
      }
      g.setLineDash([]);
    }
    // places
    const ic = Math.max(11, Math.min(16, w / 60));
    g.font = `bold ${ic - 3}px monospace`;
    const skipIc = iconSkip(this.map);
    for (const p of this.map.pois) {
      const icon = POI_ICON[p.kind];
      if (!icon || skipIc.has(p.id)) continue;
      const [x, y] = P(p.x, p.y);
      g.fillStyle = '#000'; g.fillRect(x - ic / 2, y - ic / 2, ic, ic);
      g.fillStyle = icon[1]; g.fillText(icon[0], x, y + 1);
    }
    if (me) {
      for (const hm of me.homes || []) { const [x, y] = P(hm.x, hm.y); g.fillStyle = '#000'; g.fillRect(x - ic / 2, y - ic / 2, ic, ic); g.fillStyle = '#3ddc84'; g.fillText('⌂', x, y + 1); }
      if (me.rumor) { const [x, y] = P(me.rumor.x, me.rumor.y); g.strokeStyle = '#ffd36b'; g.lineWidth = 2; g.setLineDash([5, 4]); g.beginPath(); g.arc(x, y, me.rumor.r * sc, 0, 6.28); g.stroke(); g.setLineDash([]); }
      if (me.cruiser && me.cruiser.s !== 'none' && me.cruiser.s !== 'in') { const [x, y] = P(me.cruiser.x, me.cruiser.y); g.fillStyle = '#3b6bff'; g.strokeStyle = '#fff'; g.lineWidth = 2; g.fillRect(x - 7, y - 7, 14, 14); g.strokeRect(x - 7, y - 7, 14, 14); }
      for (const ev of me.happen || []) { const kind = EVENT_KINDS[ev.k]; if (!kind) continue; const [x, y] = P(ev.x, ev.y); g.fillStyle = kind.color; g.strokeStyle = '#000'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 7, 0, 6.28); g.fill(); g.stroke(); g.font = '600 12px Rubik, sans-serif'; g.textAlign = 'center'; g.fillStyle = '#fff'; g.fillText(kind.label, x, y - 12); }
      // places of the category picked in the waypoint panel: numbered pins
      if (this.mapFilter) {
        g.font = '700 10px Rubik, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        this.mapFilter.forEach((p, i) => {
          const [x, y] = P(p.x, p.y);
          g.fillStyle = '#ffd400'; g.strokeStyle = '#000'; g.lineWidth = 2;
          g.beginPath(); g.arc(x, y, 8, 0, 6.28); g.fill(); g.stroke();
          g.fillStyle = '#111'; g.fillText(String(i + 1), x, y + 0.5);
        });
      }
      if (this.waypoint) { const [x, y] = P(this.waypoint.x, this.waypoint.y); g.fillStyle = '#4fd6ff'; g.strokeStyle = '#000'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y - 9); g.lineTo(x + 7, y); g.lineTo(x, y + 9); g.lineTo(x - 7, y); g.closePath(); g.fill(); g.stroke(); g.font = '600 12px Rubik, sans-serif'; g.textAlign = 'center'; g.fillStyle = '#fff'; g.fillText(this.waypoint.label, x, y - 14); }
      // other players (positions only reach devs; everyone else gets the list with districts)
      for (const q of this.plist || []) {
        if (q.me || q.x === undefined) continue;
        const [x, y] = P(q.x, q.y);
        g.fillStyle = q.dead ? '#888' : '#5dff9a'; g.strokeStyle = '#000'; g.lineWidth = 2;
        g.beginPath(); g.arc(x, y, 5, 0, 6.28); g.fill(); g.stroke();
        g.font = '600 11px Rubik, sans-serif'; g.textAlign = 'center'; g.fillStyle = '#c8ffd8'; g.fillText(q.n, x, y - 11);
      }
      if (me.job) { const [x, y] = P(me.job.x, me.job.y); g.fillStyle = '#ffd400'; g.strokeStyle = '#000'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 7, 0, 6.28); g.fill(); g.stroke(); }
      // police / bounty intel (server already applies the visibility rules)
      for (const r of me.radar || []) {
        const [x, y] = P(r.x, r.y);
        if (r.k === 'search') {
          g.fillStyle = 'rgba(255,60,60,.16)'; g.strokeStyle = '#ff5a5a'; g.lineWidth = 1.5; g.setLineDash([4, 3]);
          g.beginPath(); g.arc(x, y, Math.max(6, r.r * sc), 0, 6.28); g.fill(); g.stroke(); g.setLineDash([]);
          label(g, x, y - Math.max(6, r.r * sc) - 8, `LAST SEEN ${'★'.repeat(r.s)}`, '#ff9a9a');
        } else if (r.k === 'wanted') {
          g.fillStyle = (now / 200 | 0) % 2 ? '#ff3b3b' : '#3b6bff'; g.beginPath(); g.arc(x, y, 6, 0, 6.28); g.fill();
          g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke();
          label(g, x, y - 13, `SUSPECT ${'★'.repeat(r.s)}`, '#ffffff');
        } else if (r.k === 'bounty') {
          g.strokeStyle = '#ffc23d'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, Math.max(6, r.r * sc), 0, 6.28); g.stroke();
          label(g, x, y - Math.max(6, r.r * sc) - 8, `${r.n} $${r.b}`, '#ffc23d');
        }
      }
      if (police) for (const d of me.dispatch || []) {
        const [x, y] = P(d.x, d.y);
        const fresh = d.age < 30;
        const pulse = fresh ? 4 + 4 * ((now / 600) % 1) : 0;
        g.globalAlpha = Math.max(0.35, 1 - d.age / 400);
        g.fillStyle = '#ff9a2a'; g.strokeStyle = '#000'; g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(x, y - 7); g.lineTo(x + 6, y + 5); g.lineTo(x - 6, y + 5); g.closePath(); g.fill(); g.stroke();
        if (pulse) { g.strokeStyle = '#ff9a2a'; g.beginPath(); g.arc(x, y, 8 + pulse, 0, 6.28); g.stroke(); }
        label(g, x, y + 14, `${d.l} · ${d.age < 60 ? d.age + 's' : Math.round(d.age / 60) + 'm'} ago`, '#ffd0a0');
        g.globalAlpha = 1;
      }
    }
    // you
    const [px, py] = P(cx, cy);
    g.save(); g.translate(px, py); g.rotate(heading);
    g.fillStyle = '#ff3e8a'; g.strokeStyle = '#fff'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(11, 0); g.lineTo(-7, -7); g.lineTo(-3, 0); g.lineTo(-7, 7); g.closePath(); g.fill(); g.stroke();
    g.restore();
    // header
    const title = (police ? `POLICE DISPATCH · ${(me.rank || 'Officer').toUpperCase()}` : 'CITY MAP') + (V.z > 1.01 ? `  ·  ${V.z.toFixed(1)}x` : '');
    g.font = `${Math.max(14, w / 38)}px Anton, Impact, sans-serif`; g.textAlign = 'left'; g.textBaseline = 'top';
    g.lineWidth = 4; g.strokeStyle = '#000'; g.strokeText(title, 10, 8);
    g.fillStyle = police ? '#7ab0ff' : '#ffffff'; g.fillText(title, 10, 8);
    if (police) {
      const n = (me.dispatch || []).length, sus = (me.radar || []).filter((r) => r.k === 'wanted' || r.k === 'search').length;
      g.font = 'bold 12px monospace'; g.fillStyle = '#ffd0a0';
      g.fillText(`${n} report${n === 1 ? '' : 's'} · ${sus} active suspect${sus === 1 ? '' : 's'} (only what witnesses, cameras and officers can see)`, 10, 8 + Math.max(14, w / 38) + 6);
    }
  }

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

function label(g, x, y, text, color) {
  g.font = 'bold 11px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.85)'; g.strokeText(text, x, y);
  g.fillStyle = color; g.fillText(text, x, y);
}

// The part of the world the city map shows (px): every island, trimmed of open sea at the edges.
export const MAP_FRAME = [24 * TILE, 10 * TILE, 1304 * TILE, 1170 * TILE];

// baked city image (only valid for the world it was rendered from: assets/worldmap.webp is the old world,
// so World v2 draws the map from its data until a new image is baked)
let wmImg = null, wmState = 0;
const WORLDMAP_FOR = 1; // the world version assets/worldmap.webp shows
function worldMapImage(map) {
  if (map.seed !== 1337 || WORLD_VERSION !== WORLDMAP_FOR) return null;
  if (wmState === 0) { wmState = 1; wmImg = new Image(); wmImg.onload = () => { wmState = 2; }; wmImg.onerror = () => { wmState = 3; }; wmImg.src = 'assets/worldmap.webp'; }
  return wmState === 2 && Math.abs(wmImg.width / wmImg.height - MAP_W / MAP_H) < 0.02 ? wmImg : null; // a stale bake (old map size) falls back to the minimap
}
let centroids = null;
function districtCentroids(map) {
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
function iconSkip(map) {
  if (map._iconSkip) return map._iconSkip;
  const skip = new Set(), kept = [];
  for (const p of map.pois) {
    if (!POI_ICON[p.kind]) continue;
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
