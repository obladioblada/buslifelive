// How the sky should look right now, derived from the sun's position.
//
// daylight 0 = night map, 1 = day map (crossfades through civil twilight, -4..+4 degrees)
// golden   0..1 sunrise/sunset glow, strongest with the sun at the horizon
// night    0..1 deep-blue night tint after dusk
// rising   true in the morning (sunrise colours), false in the evening (sunset colours)

import { helsinkiDate, sunPosition, sunrise, sunset } from './sun.js';

/** Fixed suns for showing each look on demand (key T). Azimuths are typical for Helsinki in autumn. */
export const SKY_PREVIEWS = [
  { id: 'sunrise', label: 'Sunrise', elevation: 0.5, azimuth: 105, rising: true },
  { id: 'day', label: 'Day', elevation: 25, azimuth: 180, rising: true },
  { id: 'sunset', label: 'Sunset', elevation: 0.5, azimuth: 255, rising: false },
  { id: 'night', label: 'Night', elevation: -25, azimuth: 0, rising: false },
];

/** Next preview, wrapping to null (= real sky) after the last. */
export function nextSkyPreview(current) {
  if (!current) return SKY_PREVIEWS[0];
  const index = SKY_PREVIEWS.indexOf(current);
  return index + 1 < SKY_PREVIEWS.length ? SKY_PREVIEWS[index + 1] : null;
}

export function skyNow(now = Date.now()) {
  const sun = sunPosition(now);
  // Morning while the sun is in the eastern half of the sky.
  return skyOf(sun, sun.azimuth < 180, null, now);
}

export function skyPreview(preview, now = Date.now()) {
  return skyOf({ elevation: preview.elevation, azimuth: preview.azimuth }, preview.rising, preview, now);
}

function skyOf(sun, rising, preview, now) {
  const e = sun.elevation;
  const times = sunTimes(now);
  return {
    sun,
    daylight: smoothstep(-4, 4, e),
    golden: Math.max(0, 1 - Math.abs(e - 1) / 9),
    night: 1 - smoothstep(-12, -4, e),
    rising,
    sunrise: times.sunrise,
    sunset: times.sunset,
    preview,
  };
}

export function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// Today's sunrise and sunset only change once a day.
let cachedDay = null;
let cachedTimes = null;

function sunTimes(now) {
  const date = helsinkiDate(now);
  const key = `${date.year}-${date.month}-${date.day}`;
  if (key !== cachedDay) {
    cachedDay = key;
    cachedTimes = { sunrise: sunrise(date), sunset: sunset(date) };
  }
  return cachedTimes;
}
