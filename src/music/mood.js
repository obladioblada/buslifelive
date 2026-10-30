// What the music should feel like, derived from what is in view, the weather and the sky.
//
// bpm     target tempo from how fast the vehicles in view move (speed and moving share), placed on the
//         range of the views seen in the last few minutes (TempoScale), so every change is audible
// energy  0..1, how busy the groove is: grows with the number of vehicles in view
// minor   true when the vehicles in view run late on average
// night   0..1, sparser and softer at night
// golden  0..1, warmer pad around sunrise and sunset
// zoomIn  0..1, 0 = zoomed out over the city (full band), 1 = zoomed in on a few streets (sparse band,
//         louder vehicles)
// mix     share of the vehicles in view per kind: { bus, tram, rail (train + metro), ferry }

import { movingShare } from '../hfp/registry.js';
import { WeatherKind } from '../weather/weather.js';

export const MIN_BPM = 65, MAX_BPM = 125;
/** Average speed (km/h) counted as fully fast in tempoScore. */
export const FAST_KMH = 40;
/** How long TempoScale remembers views, and the smallest range it stretches over. */
export const TEMPO_MEMORY_MILLIS = 3 * 60_000, MIN_TEMPO_SPAN = 0.08;
/** Tempo feel: below SLOW_BPM half-time and long notes, above FAST_BPM busier; a margin stops flapping. */
export const SLOW_BPM = 85, FAST_BPM = 100, FEEL_MARGIN = 3;
/** Average delay (s) that turns the music minor, and the lower one that turns it back (no flapping). */
export const MINOR_FROM = 120, MAJOR_BELOW = 90;
/** Vehicles in view for a full-energy groove (a busy part of the centre at the default zoom). */
export const BUSY_VIEW = 220;
/** Zoom levels mapped to zoomIn 0 and 1. */
export const ZOOMED_OUT = 11.5, ZOOMED_IN = 14;

export const QUIET = Object.freeze({
  bpm: 95, energy: 0.2, minor: false, night: 0, golden: 0, weather: WeatherKind.CLEAR,
  zoomIn: 0, mix: { bus: 1, tram: 0, rail: 0, ferry: 0 },
});

/**
 * How fast the view moves, 0..1: 60% average speed (0 to FAST_KMH), 40% share of vehicles moving.
 * NaN when nothing is in view.
 */
export function tempoScore(city) {
  if (city.all.vehicles === 0) return NaN;
  const kmh = city.all.averageSpeed * 3.6;
  return 0.6 * clamp(kmh / FAST_KMH) + 0.4 * clamp(movingShare(city.all));
}

/**
 * Remembers tempo scores of the last few minutes and places a new one on their range: the slowest view
 * recently seen plays at MIN_BPM, the fastest at MAX_BPM.
 */
export class TempoScale {
  constructor(memoryMillis = TEMPO_MEMORY_MILLIS) {
    this.memoryMillis = memoryMillis;
    this.samples = [];
  }

  add(score, now = Date.now()) {
    if (!Number.isNaN(score)) this.samples.push({ score, time: now });
    while (this.samples.length && now - this.samples[0].time > this.memoryMillis) this.samples.shift();
  }

  /** 0..1 within the remembered range (0.5 with nothing remembered). */
  position(score) {
    if (Number.isNaN(score) || this.samples.length === 0) return 0.5;
    let low = Infinity, high = -Infinity;
    for (const { score: s } of this.samples) {
      low = Math.min(low, s);
      high = Math.max(high, s);
    }
    // A narrow range is widened around its middle, so tiny wobbles don't swing the tempo.
    if (high - low < MIN_TEMPO_SPAN) {
      const middle = (high + low) / 2;
      low = middle - MIN_TEMPO_SPAN / 2;
      high = middle + MIN_TEMPO_SPAN / 2;
    }
    return clamp((score - low) / (high - low));
  }
}

/**
 * @param view { zoom } of the map, and optionally { tempo } 0..1 from a TempoScale (otherwise the absolute
 * tempoScore is used); the city snapshot already describes only the vehicles in view.
 */
export function moodFrom(city, weather, sky, wasMinor, view = {}) {
  const delay = city.all.averageDelaySeconds;
  const minor = Number.isNaN(delay) ? wasMinor : wasMinor ? delay > MAJOR_BELOW : delay > MINOR_FROM;
  const share = movingShare(city.all);
  const busy = clamp(city.all.vehicles / BUSY_VIEW);
  return {
    bpm: MIN_BPM + (MAX_BPM - MIN_BPM) * clamp(view.tempo ?? (Number.isNaN(tempoScore(city)) ? 0.5 : tempoScore(city))),
    energy: busy * (0.5 + 0.5 * share),
    minor,
    night: sky ? sky.night : 0,
    golden: sky ? sky.golden : 0,
    weather: weather ? weather.kind : WeatherKind.CLEAR,
    zoomIn: view.zoom === undefined ? 0 : clamp((view.zoom - ZOOMED_OUT) / (ZOOMED_IN - ZOOMED_OUT)),
    mix: modeMix(city),
  };
}

/** Share of the vehicles in view per kind. */
export function modeMix(city) {
  const total = Math.max(city.all.vehicles, 1);
  const count = mode => city.byMode.get(mode)?.vehicles ?? 0;
  return {
    bus: (count('bus') + count('ubus')) / total,
    tram: count('tram') / total,
    rail: (count('train') + count('metro')) / total,
    ferry: count('ferry') / total,
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
