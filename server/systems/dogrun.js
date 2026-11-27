// The dog runs (the owner, 11-25 00:47: "The dog run area doesnt have any dogs or NPCs walkings dogs or playing fetch with
// dogs"). World v3's dog runs are the fenced places shared/world3-fenceexits.js finds by their DOG RUN sign or their agility
// gear (map.world3.fenceExits.places, kind 'dogrun'); activities.js fills one (its 'dogrun' spot) when someone comes near:
// two or three owners stood about inside, each with a dog off the lead. Here, every tick, what each dog does:
//   roam    trotting about the run, a new spot every few seconds, nosing about
//   chase   its owner has thrown the ball (a tennis ball - a K.BALL, ballKind 'tennis', drawn as the tennis ball: net.js t 6)
//           across the run: it runs for it, flat out
//   carry   the ball in its mouth, back to its owner
//   happy   dropped at the owner's feet: it hops about them, tail going (APOSE.happy on the wire), then off again
// An owner scared off (a fight, gunfire: activities.js takes them off their spot) calls the dog: it's on the lead again and
// trots at their heel (personas.js, the walked dogs). Each dog's own rhythm - how often it's thrown for, where it runs - is
// its own, from the group's random stream; the group's people stay together (the rule for animal groups: the owner, 11-25 -
// "I wouldn't want to ... over-randomize the individual animal behavior").
//   members(s, rng)        the owners of a dog-run spot (activities.js members)
//   begin(world, g, s)     the dogs let off their leads (activities.js fill)
//   step(world, g, rng)    every tick
import { K } from '../../shared/constants.js';
import { APOSE } from '../../shared/fauna.js';
import { pedStep } from '../../shared/physics.js';
import { DOGRUN } from '../../shared/rules.js';
import * as players from './players.js';

// two or three owners stood inside the run, spread out, facing its middle; each with a dog (activities.js fill: m.dog)
export function members(s, rng) {
  const [x0, y0, x1, y1] = s.run, n = rng() < 0.5 ? 2 : 3, out = [];
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n, x = x0 + (x1 - x0) * (0.2 + 0.6 * u), y = y0 + (y1 - y0) * (i % 2 ? 0.3 : 0.7);
    out.push({ x, y, a: Math.atan2(s.y - y, s.x - x), arche: 'casual', dog: true, run: true });
  }
  return out;
}

// the dogs off their leads, each its own game
export function begin(world, g, s) {
  g.run = s.run; g.dogs = [];
  for (const id of g.ids) {
    const d = world.get(id);
    if (d && d.pet && d.pet.walked) { d.pet.run = s.run; g.dogs.push({ dog: id, owner: d.pet.walked, st: 'roam', until: world.time + 1, tx: d.x, ty: d.y, ball: 0 }); }
  }
}

const inRun = (R, x, y) => [Math.max(R[0], Math.min(R[2], x)), Math.max(R[1], Math.min(R[3], y))];
function move(world, dog, tx, ty, speed, dt) {
  const d = Math.hypot(tx - dog.x, ty - dog.y);
  if (d < 4) { dog.vx = dog.vy = 0; return d; }
  const mods = players.pedMods(world, dog); mods.speedMul *= speed; mods.canSwim = false;
  pedStep(dog, { bits: 0, mx: (tx - dog.x) / d, my: (ty - dog.y) / d, aim: 0 }, dt, world.map, mods);
  dog.a = Math.atan2(ty - dog.y, tx - dog.x);
  world.place(dog);
  return d;
}

export function step(world, g, rng) {
  const R = g.run, now = world.time, dt = 1 / 20, D = DOGRUN;
  if (!R || !g.dogs) return;
  for (const q of g.dogs) {
    const dog = world.get(q.dog), owner = world.get(q.owner);
    if (!dog || dog.removed || dog.dead) continue;
    const ball = q.ball ? world.get(q.ball) : null;
    // the owner gone or scared off their spot: called back, on the lead (personas.js walks it at their heel)
    if (!owner || owner.removed || owner.dead || !owner.npc || !owner.npc.act || Math.hypot(owner.x - owner.npc.act.x, owner.y - owner.npc.act.y) > 60) {
      dog.pet.run = null; dog.pet.mood = 0;
      if (ball && !ball.removed) world.remove(ball);
      q.ball = 0; q.st = 'off';
      continue;
    }
    if (q.st === 'off') continue;
    if (q.st === 'happy') { if (now >= q.until) { dog.pet.mood = 0; q.st = 'roam'; q.until = now + 1; } continue; }   // (hopping about its owner, the ball dropped)
    if (q.st === 'roam') {
      dog.pet.mood = 0;
      if (now >= q.until) {   // (done nosing about there: the ball thrown, or another spot)
        if (rng() < D.throwChance) {   // (the owner throws: across the run, away from them)
          const a = rng() * Math.PI * 2, dist = D.throwPx[0] + rng() * (D.throwPx[1] - D.throwPx[0]);
          const [lx, ly] = inRun(R, owner.x + Math.cos(a) * dist, owner.y + Math.sin(a) * dist);
          const b = world.add({ id: world.newId(), kind: K.BALL, x: owner.x, y: owner.y, a: 0, z: 22, vx: 0, vy: 0, vz: 0, ballKind: 'tennis', cx: -1, cy: -1 });
          b.fly = { x0: owner.x, y0: owner.y, x1: lx, y1: ly, t0: now, T: D.flightS };
          owner.a = Math.atan2(ly - owner.y, lx - owner.x);
          q.ball = b.id; q.st = 'chase';
          continue;
        }
        [q.tx, q.ty] = inRun(R, dog.x + (rng() - 0.5) * 220, dog.y + (rng() - 0.5) * 160);
        q.until = now + D.roamS[0] + rng() * (D.roamS[1] - D.roamS[0]);
      }
      move(world, dog, q.tx, q.ty, D.trot, dt);
      continue;
    }
    if (!ball || ball.removed) { q.st = 'roam'; q.ball = 0; continue; }
    if (ball.fly) {   // (the ball in the air: along its throw, up and down)
      const u = Math.min(1, (now - ball.fly.t0) / ball.fly.T);
      ball.x = ball.fly.x0 + (ball.fly.x1 - ball.fly.x0) * u; ball.y = ball.fly.y0 + (ball.fly.y1 - ball.fly.y0) * u;
      ball.z = 22 * (1 - u) + 70 * 4 * u * (1 - u);
      if (u >= 1) { ball.fly = null; ball.z = 0; }
      world.place(ball);
    }
    if (q.st === 'chase') {
      const d = move(world, dog, ball.x, ball.y, D.run, dt);
      if (!ball.fly && d < 12) q.st = 'carry';
      continue;
    }
    if (q.st === 'carry') {   // (in its mouth, back to the owner)
      const d = move(world, dog, owner.x, owner.y, D.back, dt);
      ball.x = dog.x + Math.cos(dog.a) * 9; ball.y = dog.y + Math.sin(dog.a) * 9; ball.z = 6; world.place(ball);
      if (d < 20) { world.remove(ball); q.ball = 0; q.st = 'happy'; q.until = now + D.happyS; dog.pet.mood = APOSE.happy; dog.vx = dog.vy = 0; owner.a = Math.atan2(dog.y - owner.y, dog.x - owner.x); }
      continue;
    }
  }
}

// the group emptied (activities.js fillRound): its ball goes with it
export function end(world, g) {
  for (const q of g.dogs || []) if (q.ball) { const b = world.get(q.ball); if (b && !b.removed) world.remove(b); }
}

// ---- the street cats (the owner, 11-25 00:47: "cats on stoops and in alleys"; activities.js 'cat' spots) ----------------
// A stray sat on a walk-up's front step or down an alley by the wall: still, now and then looking about; someone comes too
// close and it darts off a little way (CATS.shyPx, never toward them) and sits again; left in peace a while, it pads back
// to its spot. A cat, not a dog: nobody walks it, nobody's lost it (pets.js leaves it be: no house, no home).
const CAT_ARTS = ['cat_black', 'cat_grey', 'cat_ginger'];
export function spawnCat(world, m, rng) {
  const c = world.spawnPed(m.x, m.y, { hp: 30, archetype: 'pet:' + CAT_ARTS[Math.floor(rng() * CAT_ARTS.length) % CAT_ARTS.length], name: 'a cat', a: m.a, app: { bd: 1 } });
  c.pet = { kind: 'cat', name: 'a cat', stray: true, mood: APOSE.sit, i: 0 };
  return c;
}
export function catStep(world, g, rng) {
  const cat = world.get(g.ids[0]), C = DOGRUN.cats, now = world.time, dt = 1 / 20;
  if (!cat || cat.removed || cat.dead) return;
  const q = (g.cat ||= { st: 'sit', until: now, tx: g.x, ty: g.y });
  // anyone too close (on foot, moving or not): off it goes, away from them
  if (q.st !== 'dart' && world.tick % 4 === 0) {
    for (const e of world.query(cat.x, cat.y, C.shyPx, K.PED)) {
      if (e === cat || e.pet || e.dead || e.vehId) continue;
      const a = Math.atan2(cat.y - e.y, cat.x - e.x) + (rng() - 0.5) * 0.8, d = C.dartPx[0] + rng() * (C.dartPx[1] - C.dartPx[0]);
      q.st = 'dart'; q.tx = cat.x + Math.cos(a) * d; q.ty = cat.y + Math.sin(a) * d; q.until = now + C.dartS; cat.pet.mood = 0;
      break;
    }
  }
  if (q.st === 'dart') {
    if (move(world, cat, q.tx, q.ty, C.run, dt) < 6 || now >= q.until) { q.st = 'sit'; q.until = now + C.calmS; cat.vx = cat.vy = 0; cat.pet.mood = APOSE.sit; }
    return;
  }
  if (q.st === 'sit') {
    cat.vx = cat.vy = 0;
    if (now >= q.until && Math.hypot(g.x - cat.x, g.y - cat.y) > 8) { q.st = 'home'; cat.pet.mood = 0; }
    else if (now >= q.until) { q.until = now + C.calmS; cat.a += (rng() - 0.5) * 1.2; }   // (a look about)
    return;
  }
  if (q.st === 'home' && move(world, cat, g.x, g.y, C.pad, dt) < 6) { q.st = 'sit'; q.until = now + C.calmS; cat.pet.mood = APOSE.sit; cat.vx = cat.vy = 0; }
}
