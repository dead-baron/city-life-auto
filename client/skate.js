// Skateboarding on the page (the owner, 2026-10-17 and 18; shared/board.js, shared/skate.js, server/systems/skate.js),
// loaded the first time you have a board or see someone ride one (client/main.js loadSkate) - none of it is in the
// page's first load:
//   - the board's step and its tricks go into the page's prediction (shared/board.js registers them with
//     shared/physics.js: your board rides as the server rides it - the kicks, the flips, the grinds, the manuals, the
//     ramps), and the board's state comes back with each snapshot (boardIn);
//   - how a rider looks (look): kicking - the kick's frames on its phase (your own the prediction's, anyone else's from
//     when they started pushing), rolling, up in an air (an ollie, a kicker's, a quarter pipe's: lifted on its arc), and
//     the tricks' poses (client/art2/people.js skflip, skshove, sktre, skgrab, skgrind, skmanual) - your own from the
//     prediction, anyone else's from the wire (the extra byte: the trick going; the 'ollie' event: an air's length and
//     height; a grind's height from the rail under them);
//   - on the screen while you ride: the combo going (its tricks, its points times how many), what you banked, your score,
//     the special meter, a session's clock, score and goals; at your feet the balance - across the rail on a grind,
//     along the deck in a manual: push the stick away from the dot.
import * as SK from '../shared/skate.js';
import { BOARD, KICK, boardLift, boardIn } from '../shared/board.js';
import { PF } from '../shared/constants.js';

const fmt = (n) => Math.round(n).toLocaleString('en-US');
const FLIP_POSE = { 1: 'skflip', 2: 'skflip', 3: 'skshove', 4: 'sktre' };
// the kick's frame at its phase (people.js skate: 0 rolling on, 1-7 the foot off the deck, reaching, planting, driving
// back, the toe-off, swinging forward, coming down on the tail - shared/board.js KICK)
const KICK_FR = [0.06, 0.12, 0.24, 0.36, 0.46, 0.56, KICK.back];
function kickFrame(kp) { for (let i = 0; i < KICK_FR.length; i++) if (kp < KICK_FR[i]) return i + 1; return 0; }

export class SkateView {
  constructor(S) { this.S = S; this.bank = null; }
  boardIn(st, self) { return boardIn(st, self); }
  // a rider's pose, frame and height off the ground (me: your own prediction's state, for your own ped)
  look(p, f, now, me) {
    const t = this.trick(p, now, me);
    if (t) return t;
    if (me ? me.rollT > 0 : f & PF.ROLL) {   // an air: the crouch, the pop, the landing
      if (p._oa === undefined) p._oa = now;
      const k = me ? 1 - me.rollT / (me.airT || BOARD.ollieT) : Math.min(1, (now - p._oa) / (p._od || BOARD.ollieT));
      return { pose: 'skateair', fr: k < 0.18 ? 0 : k < 0.82 ? 1 : 2, lift: this.airLift(p, now, me) };
    }
    p._oa = p._od = p._oh = p._oh0 = undefined;
    const push = me ? me.kp >= 0 : (f & PF.SPRINT) && (f & PF.MOVING);
    if (!push) p._ks = undefined; else if (p._ks === undefined) p._ks = now;
    return { pose: push ? 'skate' : 'skatec', fr: push ? kickFrame(me ? me.kp : ((now - p._ks) / KICK.T) % 1) : 0, lift: 0 };
  }
  // a trick going (null: none)
  trick(p, now, me) {
    let code;
    if (me) code = me.tk >= SK.PENDING ? 0 : me.tk || 0;
    else code = p.extra & 31;
    if (me && (me.bm === 1 || me.bm === 3) && !code) code = SK.GRIND0;
    if (me && me.bm === 2) code = SK.MANUAL;
    if (!code || code >= SK.PENDING) { p._tc = 0; return null; }
    if (code !== p._tc) { p._tc = code; p._tcAt = now; }
    const t = me ? me.tt || 0 : now - p._tcAt;
    if (code < SK.GRAB0) {   // a flip: its frames over its time; up on the air's arc
      const k = Math.min(0.999, t / SK.TRICKS[code].d), fr = Math.floor(k * 6);
      return { pose: FLIP_POSE[code], fr: code === 2 ? 6 + fr : fr, lift: this.airLift(p, now, me) };
    }
    if (code < SK.GRIND0) return { pose: 'skgrab', fr: code - SK.GRAB0, lift: this.airLift(p, now, me) };
    if (code < SK.MANUAL) return { pose: 'skgrind', fr: code - SK.GRIND0, lift: me ? me.gh || 0 : this.railH(p, now) };
    return { pose: 'skmanual', fr: Math.floor(now * 2.5 + p.id) & 1, lift: 0 };
  }
  airLift(p, now, me) {
    if (me) return boardLift(me);
    if (p._oa === undefined) p._oa = now;
    const k = Math.min(1, (now - p._oa) / (p._od || BOARD.ollieT));
    return (p._oh0 || 0) * (1 - k) + (p._oh ?? 15) * Math.sin(Math.PI * k);
  }
  // how high the rail under someone else is (looked up now and then: they're on it a while)
  railH(p, now) {
    if (p._rhAt !== undefined && now - p._rhAt < 0.4) return p._rh;
    const m = this.S.map, x = p.rx ?? p.x, y = p.ry ?? p.y;
    let h = 12, best = 8;
    if (m) for (const q of SK.nearby(m, x, y)) {
      const t = (x - q.x0) * q.ux + (y - q.y0) * q.uy, d = Math.abs(-(x - q.x0) * q.uy + (y - q.y0) * q.ux);
      if (t >= -4 && t <= q.len + 4 && d < best) { best = d; h = q.h; }
    }
    p._rhAt = now; p._rh = h;
    return h;
  }

  // what the server said: a combo banked (the points over the rider), one lost
  onEvent(ev, fx) {
    if (ev.e === 'skbank' && fx) fx.floatText(ev.x, ev.y - 44, `+${fmt(ev.n)}`, '#ffd34a');
    else if (ev.e === 'skbail' && fx) fx.floatText(ev.x, ev.y - 40, 'BAIL!', '#ff6a5a');
  }

  // the balance at your feet (world space: g under the world's transform; sp where you're drawn)
  drawWorld(g, sp, me) {
    if (!me || !(me.bm === 1 || me.bm === 2 || me.bm === 3)) return;
    // (a grind's bar runs across the rail, the dot to the left of the way you go as it tips that way; a manual's along the
    // deck, the dot toward the tail as it tips back - push the stick away from the dot: shared/skate.js balance)
    const grind = me.bm !== 2, a = me.a + (grind ? -Math.PI / 2 : Math.PI), L = 26, b = Math.max(-1, Math.min(1, me.bb || 0));
    const ux = Math.cos(a), uy = Math.sin(a);
    const cx = sp.x, cy = sp.y - (me.gh || 0) - 46;
    g.save();
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 6; g.beginPath(); g.moveTo(cx - ux * L, cy - uy * L); g.lineTo(cx + ux * L, cy + uy * L); g.stroke();
    const hot = Math.abs(b) > 0.7;
    g.strokeStyle = hot ? '#ff5a4a' : Math.abs(b) > 0.4 ? '#ffd34a' : '#7fe07f'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(cx - ux * L, cy - uy * L); g.lineTo(cx + ux * L, cy + uy * L); g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(cx + ux * L * b, cy + uy * L * b, 4, 0, 6.2832); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(cx - uy * 5, cy + ux * 5); g.lineTo(cx + uy * 5, cy - ux * 5); g.stroke();
    g.restore();
  }

  // the combo, the score, the special meter, a session (screen space, CSS px)
  drawHud(g, W, H, sk, now) {
    if (!sk) { this.bank = null; return; }
    g.save();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const cx = W / 2, top = Math.max(64, H * 0.14);
    const shadow = (txt, x, y, col) => { g.fillStyle = 'rgba(0,0,0,.6)'; g.fillText(txt, x + 1.5, y + 1.5); g.fillStyle = col; g.fillText(txt, x, y); };
    if (sk.c && sk.c.n) {
      g.font = '700 13px system-ui, sans-serif';
      const names = sk.c.l.join(' + ');
      shadow(names.length > 70 ? '... ' + names.slice(-66) : names, cx, top, '#fff');
      g.font = '800 20px system-ui, sans-serif';
      shadow(`${fmt(sk.c.p)} x ${sk.c.n}`, cx, top + 22, sk.on ? '#ff9af2' : '#ffd34a');
    } else if (sk.last) {
      if (!this.bank || this.bank.pts !== sk.last) this.bank = { pts: sk.last, at: now };
      const k = Math.min(1, (now - this.bank.at) / 1.6);
      g.globalAlpha = 1 - k * k;
      g.font = '800 22px system-ui, sans-serif';
      shadow(`+${fmt(sk.last)}`, cx, top + 10 - k * 14, '#7fe07f');
      g.globalAlpha = 1;
    }
    // the score and the special meter (top right, under the money)
    const rx = W - 16, ry = Math.max(96, H * 0.2);
    g.textAlign = 'right'; g.font = '700 12px system-ui, sans-serif';
    shadow(`SCORE ${fmt(sk.s)}   BEST COMBO ${fmt(sk.b)}`, rx, ry, '#fff');
    const bw = 120, bx = rx - bw, by = ry + 12;
    g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(bx - 1, by - 1, bw + 2, 7);
    g.fillStyle = sk.on ? `hsl(${(now * 160) % 360},90%,62%)` : '#58b8ff'; g.fillRect(bx, by, bw * Math.min(1, sk.sp), 5);
    g.font = '700 10px system-ui, sans-serif';
    shadow(sk.on ? `SPECIAL ${sk.on}s` : 'SPECIAL', bx - 6, by + 3, sk.on ? '#ffb0f4' : '#bcd');
    // a session at a skate spot: its clock, its score, its goals
    if (sk.ses) {
      const X = sk.ses, mm = Math.floor(X.t / 60), ss = String(X.t % 60).padStart(2, '0');
      g.textAlign = 'left'; g.font = '700 12px system-ui, sans-serif';
      const lx = 16, ly = Math.max(150, H * 0.3);
      shadow(`SESSION · ${X.spot} · ${mm}:${ss} · ${fmt(X.s)}`, lx, ly, '#fff');
      g.font = '600 11px system-ui, sans-serif';
      X.g.forEach(([label, done], i) => shadow(`${done ? '✓' : '○'} ${label}`, lx, ly + 16 + i * 14, done ? '#7fe07f' : '#dde'));
    }
    g.restore();
  }
}
