// Security audit (report only): a scripted page in a struggle with the police (struggle.js). The attack-button presses are
// capped by the server's clock (PRESS_GAP) but the held button and the stick count per input step (dt each), and a page
// sending two inputs a tick is stepped twice (players.js inputsOf). How often does a bot throw the officer off, by stars,
// next to the human thumb the tests model (test/struggle.test.js thumbOdds: ~7 taps a second, the stick pushed one way)?
//   node --max-old-space-size=3072 tools/audit/sec-play-struggle.mjs
import { makeWorld, joinPlayer, teleport } from '../../test/helpers.js';
import { STAR_HEAT } from '../../shared/rules.js';
import { IN } from '../../shared/input.js';
import { mulberry32 } from '../../shared/rng.js';
import * as players from '../../server/systems/players.js';
import * as struggle from '../../server/systems/struggle.js';
import { spawnNpc } from '../../server/systems/npc.js';

const DT = 0.05;
const w = makeWorld({ rand: mulberry32(7) });
const { p } = joinPlayer(w);
const c0 = w.map.nodes.find((q) => q.lvl === 0 && Math.hypot(q.x - 26000, q.y - 17000) < 2500);
teleport(w, p.ped, c0.x + 32, c0.y + 32);

// mode: 'thumb' (7 taps/s, stick one way, 1 input a tick), 'bot1' (press every other tick, held between, the stick swung
// round every 3 ticks: 1 input a tick), 'bot2' (the same, 2 inputs a tick)
function odds(stars, mode, n = 60, seed = 1) {
  const r = mulberry32(seed);
  let free = 0, seq = p.ack;
  for (let k = 0; k < n; k++) {
    p.wanted = stars; p.heat = STAR_HEAT[stars] + 2;
    p.ped.hp = 100; p.ped.downUntil = w.time + 2.5; p.ped.graceUntil = 0; p.ped.stunUntil = 0;
    const c = spawnNpc(w, 'cop', p.ped.x + 18, p.ped.y, 'cop'); c.npc.unit = 1;
    struggle.grab(w, c, p.ped);
    let down = false, next = 100 + r() * 200;
    for (let i = 1; i < 200 && p.struggle; i++) {
      const ang = Math.floor(i / 3) * 2.2, mx = Math.cos(ang), my = Math.sin(ang);
      if (mode === 'thumb') {
        const ms = i * 50; let tapped = false;
        while (next <= ms) { down = !down; if (down) tapped = true; next += down ? 40 + r() * 50 : Math.max(20, 1000 / 7 - 65 + (r() - 0.5) * 60); }
        p.inputQ.push({ seq: ++seq, bits: down || tapped ? IN.FIRE : 0, mx: 1, my: 0, aim: 0 });
      } else if (mode === 'bot1') {
        p.inputQ.push({ seq: ++seq, bits: i % 2 ? IN.FIRE : 0, mx, my, aim: 0 });
      } else {
        // even ticks: let go then press (a fresh press); odd ticks: held twice - with the queue kept over 3, both stepped
        while (p.inputQ.length < 4) p.inputQ.push({ seq: ++seq, bits: IN.FIRE, mx, my, aim: 0 });
        p.inputQ.push({ seq: ++seq, bits: i % 2 ? IN.FIRE : 0, mx, my, aim: 0 }, { seq: ++seq, bits: IN.FIRE, mx, my, aim: 0 });
      }
      w.time += DT; w.tick++;
      players.processInputs(w, DT);
      struggle.update(w, DT);
    }
    if (!p.custody) free++;
    p.custody = null; p.ped.cuffed = false; p.struggle = null; p.ped.downUntil = 0; p.inputQ.length = 0; seq = p.ack;
    w.remove(c);
  }
  return Math.round(free / n * 100) + '%';
}
for (const stars of [3, 4, 5]) console.log(`${stars} stars, one cop: human thumb ${odds(stars, 'thumb', 60, stars)}, bot 1 input/tick ${odds(stars, 'bot1', 60, stars + 10)}, bot 2 inputs/tick ${odds(stars, 'bot2', 60, stars + 20)}`);
