// DOM HUD: health/stamina, money, wanted stars, chrono clock, faction, toasts, prompt,
// job tracker, weapon panel, fishing cue, shop menus, death screen, radar + big map.
import { WEAPONS, ITEMS } from '../shared/items.js';
import { T, TILE, MAP_W, MAP_H, gameClock, WEATHER } from '../shared/constants.js';
import { glyph, formatPrompt, localizeText, keyName } from './glyphs.js';
import { input } from './input.js';
import { weaponIcon } from './render/peds.js';

const $ = (id) => document.getElementById(id);
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
    this.lastStars = 0;
  }

  setMe(me) {
    const prev = this.me;
    this.me = me;
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
    f.textContent = { citizen: 'CITIZEN', criminal: 'CRIMINAL', enforcer: 'ENFORCER ON DUTY', hunter: 'BOUNTY HUNTER' }[me.faction];
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
      $('d-timer').textContent = me.respawnIn > 0 ? `Waking up${chosen ? ' at ' + chosen.label : ''} in ${Math.ceil(me.respawnIn)}...` : '';
      const box = $('d-spawn');
      const sig = opts.map((o) => o.id).join() + '|' + me.spawnChoice;
      if (box.dataset.sig !== sig) {
        box.dataset.sig = sig;
        box.innerHTML = opts.length ? '<div class="d-lbl">Choose where to wake up:</div>' : '';
        for (const o of opts) {
          const b = document.createElement('button');
          b.className = 'spawn-opt' + (o.id === me.spawnChoice ? ' on' : '');
          b.textContent = (o.kind === 'home' ? '⌂ ' : '✚ ') + o.label;
          b.onclick = () => this.onRespawn?.(o.id);
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
      b.innerHTML = `<span>${esc(o.label)}${o.note ? `<span class="note">${esc(o.note)}</span>` : ''}</span>${price}`;
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
    g.fillStyle = '#0d1a10'; g.fillRect(0, 0, size, size);
    const mx = cx / TILE, my = cy / TILE, tr = range / TILE;
    g.imageSmoothingEnabled = false;
    g.drawImage(this.mini, mx - tr, my - tr, tr * 2, tr * 2, 0, 0, size, size);
    const toR = (x, y) => [(x - cx) * scale + size / 2, (y - cy) * scale + size / 2];
    const me = this.me;
    // POIs
    g.font = `bold ${big ? 14 : 9}px monospace`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const p of this.map.pois) {
      const icon = POI_ICON[p.kind];
      if (!icon) continue;
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
      if (me.job) {
        let [x, y] = toR(me.job.x, me.job.y);
        const dx = x - size / 2, dy = y - size / 2, d = Math.hypot(dx, dy), lim = size / 2 - 8;
        if (d > lim && !big) { x = size / 2 + dx / d * lim; y = size / 2 + dy / d * lim; }
        g.fillStyle = '#ffd400'; g.strokeStyle = '#000'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, big ? 8 : 5, 0, 6.28); g.fill(); g.stroke();
      }
    }
    // player arrow
    g.translate(size / 2, size / 2); g.rotate(heading);
    g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(big ? 12 : 7, 0); g.lineTo(big ? -8 : -5, big ? -7 : -4.5); g.lineTo(big ? -4 : -2.5, 0); g.lineTo(big ? -8 : -5, big ? 7 : 4.5); g.closePath(); g.fill(); g.stroke();
    g.restore();
  }

  drawBigMap(cx, cy, heading) {
    const c = $('bigmap-c');
    const size = Math.min(innerWidth * 0.9, innerHeight * 0.82) | 0;
    if (c.width !== size) { c.width = size; c.height = size; }
    this.drawRadar(MAP_W * TILE / 2, MAP_H * TILE / 2, 0, c.getContext('2d'), size, MAP_W * TILE / 2, true);
    const g = c.getContext('2d');
    const s = size / (MAP_W * TILE);
    g.save(); g.translate(cx * s, cy * s); g.rotate(heading);
    g.fillStyle = '#ff3e8a'; g.strokeStyle = '#fff'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(12, 0); g.lineTo(-8, -8); g.lineTo(-4, 0); g.lineTo(-8, 8); g.closePath(); g.fill(); g.stroke();
    g.restore();
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

const POI_ICON = {
  hospital: ['H', '#ff5a5a'], police: ['P', '#6aa6ff'], bank: ['$', '#3ddc84'], gunshop: ['G', '#ff9a3a'], pawn: ['¢', '#ffd36b'],
  sports: ['S', '#7de0ff'], hardware: ['T', '#ff9a3a'], pharmacy: ['+', '#3ddc84'], coffee: ['C', '#c89a6a'], garage: ['R', '#ffd400'],
  clothing: ['D', '#e080ff'], dealer: ['V', '#ff5a5a'], warehouse: ['W', '#ffd400'], fence: ['X', '#c07aff'], grocery: ['F', '#3ddc84'],
  fishmarket: ['≈', '#25b8c0'], marina: ['B', '#7de0ff'], farm: ['¥', '#b8e02a'], courthouse: ['J', '#e8d8a8'],
};

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
  return c;
}

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
