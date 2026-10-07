// Global chrono loop + rare rain events (GDD §2, §3). The day/night clock itself is the
// world's loopTime; this module rolls weather and announces transitions.
import { WEATHER } from '../../shared/constants.js';

export function init(world) {
  world.weather = WEATHER.CLEAR;
  world.nextWeatherRoll = world.time + 150;
  world.rainUntil = 0;
  world.wasNight = false;
}

export function update(world) {
  const now = world.time;
  if (world.weatherHold) { world.nextWeatherRoll = now + 150; if (world.weatherHold.w === WEATHER.RAIN) world.rainUntil = Math.max(world.rainUntil, now + 60); } // (dev: the weather held as it is)
  if (world.weather === WEATHER.RAIN && now >= world.rainUntil) {
    world.weather = WEATHER.CLEAR;
    world.broadcast({ e: 'toast', text: 'The rain has stopped. Streets are drying out.', tone: 'info' });
  }
  if (now >= world.nextWeatherRoll) {
    world.nextWeatherRoll = now + 150;
    if (world.weather === WEATHER.CLEAR && world.rand() < 0.14) startRain(world, 180 + world.rand() * 180);
  }
  const night = world.clock.isNight;
  if (night !== world.wasNight) {
    world.wasNight = night;
    world.broadcast({ e: 'toast', text: night ? 'Night falls. Witnesses see less... and the shady crowd comes out.' : 'Sunrise over the city.', tone: 'info' });
  }
}

export function startRain(world, seconds) {
  world.weather = WEATHER.RAIN;
  world.rainUntil = world.time + seconds;
  world.broadcast({ e: 'toast', text: 'Rain is falling - roads are slick (-35% grip, double braking distance).', tone: 'warn' });
}

export function stopRain(world) { world.rainUntil = world.time; }
