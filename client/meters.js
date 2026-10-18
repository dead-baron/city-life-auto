// The swing meters, out of the page's first load (client/main.js loadMeters: loaded once you're by your golf ball, at a
// hoop with the ball or on a lane with a bowling ball - the server: server/systems/golf.js, hoops.js, bowling.js):
//   - step(inp): the swing as this page sees it, one fixed step at a time exactly as the server counts it: S.golfHold is
//     how long the attack button has been held (the meter: swingMeter), -1 when it isn't; the last swing's meter lingers
//     on screen a moment (S.golfShown). Each new golf shot starts aimed at the flag (the server takes your aim from the
//     last input, so a pad or touch player who doesn't touch the aim stick hits straight at the pin). The bowling view
//     (client/bowling.js) reads the same S.golfHold;
//   - drawGolf: your ball ringed; by it, the aim line out as far as the swing would carry and the meter beside you;
//   - drawHoops: the meter beside you, with the band that drops it in from where you stand.
import { swingMeter, carry as golfCarry } from '../shared/golf.js';
import { courtHoops, idealPower, shotWindow } from '../shared/hoops.js';
import { IN } from '../shared/input.js';
import { DT } from '../shared/constants.js';
import { input, mouseScreen } from './input.js';

export function makeMeters(S, { worldToScreen, selfPos }) {
  // where the swing points now: the mouse from your character, else the last aim (the pad's right stick, the aim stick)
  const aimNow = () => {
    if (input.device === 'keyboard') { const sp = worldToScreen(selfPos()), m = mouseScreen(); if (sp && m) return Math.atan2(m.y - sp.y, m.x - sp.x); }
    return S.lastAim || 0;
  };
  const shownNow = (holding) => (!holding && S.golfShown && performance.now() < S.golfShown.until ? S.golfShown.p : null);
  return {
    step(inp) {
      const G = S.me && S.me.golf, Hh = S.me && S.me.hoops, Bw = S.me && S.me.bowl;
      if (!(G && G.near) && !(Hh && Hh.ready) && !(Bw && Bw.ball && Bw.mine && !Bw.rolling)) { if (S.golfHold >= 0) S.golfHold = -1; return; }
      if (G) {
        const key = `${G.ball}:${G.s}`;
        if (S.golfAimFor !== key && G.pin) {
          const b = S.ents.get(G.ball);
          if (b && b.rx !== undefined) { S.lastAim = Math.atan2(G.pin.y - b.ry, G.pin.x - b.rx); S.golfAimFor = key; }
        }
      }
      if (inp.bits & IN.FIRE) S.golfHold = S.golfHold >= 0 ? S.golfHold + DT : 0;
      else if (S.golfHold >= 0) { S.golfShown = { p: swingMeter(S.golfHold), until: performance.now() + 900 }; S.golfHold = -1; }
    },
    drawHoops(g, z) {
      const Hh = S.me && S.me.hoops;
      if (!Hh || S.me.dead) return;
      const holding = S.golfHold >= 0, shown = shownNow(holding);
      if (!Hh.ready && shown === null) return;
      const hp = courtHoops(S.map)[Hh.k], sp = selfPos();
      if (!hp) return;
      const d = Math.hypot(hp.rim.x - sp.x, hp.rim.y - sp.y), ideal = idealPower(d), win = shotWindow(d), p = holding ? swingMeter(S.golfHold) : shown ?? 0;
      const x = sp.x + 18, y = sp.y - 34, h = 40, w = 6;
      g.save(); g.globalAlpha = 0.95;
      g.fillStyle = 'rgba(0,0,0,.7)'; g.fillRect(x - 1 / z, y - 1 / z, w + 2 / z, h + 2 / z);
      g.fillStyle = 'rgba(80,220,110,.55)'; g.fillRect(x, y + h * (1 - Math.min(1, ideal + win)), w, h * (Math.min(1, ideal + win) - Math.max(0, ideal - win)));
      if (holding || shown !== null) { g.fillStyle = Math.abs(p - ideal) <= win ? '#7dff7a' : '#ff8a3a'; g.fillRect(x + 1 / z, y + h * (1 - p) - 1.5 / z, w - 2 / z, 3 / z); }
      g.restore();
    },
    drawGolf(g, z, now) {
      const G = S.me && S.me.golf, b = G && S.ents.get(G.ball);
      if (!G || !b || b.rx === undefined || S.me.dead) return;
      const bz = (b.extra || 0) * 2, by = b.ry - bz - 2;
      g.save();
      g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 1.5 / z;
      g.beginPath(); g.arc(b.rx, by, 7 + Math.sin(now * 5) * 1.5, 0, 6.28); g.stroke();
      if (G.near) {
        const holding = S.golfHold >= 0, shown = shownNow(holding);
        const p = holding ? swingMeter(S.golfHold) : shown ?? 1, a = aimNow(), d = golfCarry(G.club, p);
        g.globalAlpha = holding ? 0.95 : 0.5; g.setLineDash([6 / z, 5 / z]); g.strokeStyle = '#fff8c0'; g.lineWidth = 2 / z;
        g.beginPath(); g.moveTo(b.rx, by); g.lineTo(b.rx + Math.cos(a) * d, by + Math.sin(a) * d); g.stroke(); g.setLineDash([]);
        g.beginPath(); g.arc(b.rx + Math.cos(a) * d, by + Math.sin(a) * d, 5 / z, 0, 6.28); g.stroke();
        if (holding || shown !== null) {   // the meter: a bar beside you, green to the top, red past it
          const sp = selfPos(), x = sp.x + 18, y = sp.y - 34, h = 40, w = 6;
          g.globalAlpha = 0.95; g.fillStyle = 'rgba(0,0,0,.7)'; g.fillRect(x - 1 / z, y - 1 / z, w + 2 / z, h + 2 / z);
          g.fillStyle = p > 0.92 ? '#7dff7a' : p > 0.6 ? '#ffd400' : '#ff8a3a'; g.fillRect(x, y + h * (1 - p), w, h * p);
        }
      }
      g.restore();
    },
  };
}
