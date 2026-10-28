// What the music should feel like, derived from the city, the weather and the sky.
//
// bpm     target tempo: a city on the move plays faster
// energy  0..1, how busy the groove is: grows with the number of vehicles on the road
// minor   true when the city runs late on average
// night   0..1, sparser and softer at night
// golden  0..1, warmer pad around sunrise and sunset

import { movingShare } from '../hfp/registry.js';
import { WeatherKind } from '../weather/weather.js';

export const MIN_BPM = 90, MAX_BPM = 124;
/** Average delay (s) that turns the music minor, and the lower one that turns it back (no flapping). */
export const MINOR_FROM = 120, MAJOR_BELOW = 90;

export const QUIET = Object.freeze({ bpm: 100, energy: 0.2, minor: false, night: 0, golden: 0, weather: WeatherKind.CLEAR });

export function moodFrom(city, weather, sky, wasMinor) {
  const delay = city.all.averageDelaySeconds;
  const minor = Number.isNaN(delay) ? wasMinor : wasMinor ? delay > MAJOR_BELOW : delay > MINOR_FROM;
  const share = movingShare(city.all);
  const busy = clamp((city.all.vehicles - 150) / 850);
  return {
    bpm: MIN_BPM + (MAX_BPM - MIN_BPM) * clamp(share),
    energy: busy * (0.5 + 0.5 * share),
    minor,
    night: sky ? sky.night : 0,
    golden: sky ? sky.golden : 0,
    weather: weather ? weather.kind : WeatherKind.CLEAR,
  };
}

export function rainy(mood) {
  return mood.weather === WeatherKind.RAIN || mood.weather === WeatherKind.DRIZZLE || mood.weather === WeatherKind.THUNDERSTORM;
}

export function snowy(mood) {
  return mood.weather === WeatherKind.SNOW || mood.weather === WeatherKind.SLEET;
}

function clamp(value) {
  return Math.max(0, Math.min(1, value));
}
