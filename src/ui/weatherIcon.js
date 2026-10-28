// Weather icons drawn with shapes, so they need no image files or emoji font.

import { WeatherKind } from '../weather/weather.js';
import { CARD } from '../theme.js';

const SUN = [255, 210, 63], MOON = [230, 233, 242], CLOUD = [213, 218, 227], RAIN = [127, 178, 255], BOLT = [255, 210, 63];

/** Draws an icon centred on (x, y) fitting a size x size square. */
export function drawWeatherIcon(p, kind, day, x, y, size) {
  p.push();
  const s = size / 48;
  switch (kind) {
    case WeatherKind.CLEAR:
      sky(p, day, x, y, s, 1);
      break;
    case WeatherKind.PARTLY_CLOUDY:
      sky(p, day, x - 7 * s, y - 7 * s, s, 0.75);
      cloud(p, x + 3 * s, y + 5 * s, s * 0.85);
      break;
    case WeatherKind.CLOUDY:
      cloud(p, x, y, s);
      break;
    case WeatherKind.FOG:
      p.stroke(...CLOUD);
      p.strokeCap(p.ROUND);
      p.strokeWeight(3.5 * s);
      for (let i = -1; i <= 1; i++) {
        const offset = (i === 0 ? -4 : 3) * s;
        p.line(x - 16 * s + offset, y + i * 10 * s, x + 16 * s + offset, y + i * 10 * s);
      }
      break;
    case WeatherKind.DRIZZLE:
      cloud(p, x, y - 5 * s, s);
      drops(p, x, y, s, 0.5);
      break;
    case WeatherKind.RAIN:
      cloud(p, x, y - 5 * s, s);
      drops(p, x, y, s, 1);
      break;
    case WeatherKind.SLEET:
      cloud(p, x, y - 5 * s, s);
      drops(p, x - 6 * s, y, s, 0.8);
      flakes(p, x + 8 * s, y, s);
      break;
    case WeatherKind.SNOW:
      cloud(p, x, y - 5 * s, s);
      flakes(p, x, y, s);
      break;
    case WeatherKind.THUNDERSTORM:
      cloud(p, x, y - 5 * s, s);
      p.noStroke();
      p.fill(...BOLT);
      p.beginShape();
      [[1, 4], [-6, 15], [-1, 15], [-4, 24], [6, 11], [1, 11], [4, 4]].forEach(([vx, vy]) => p.vertex(x + vx * s, y + vy * s));
      p.endShape(p.CLOSE);
      break;
  }
  p.pop();
}

function sky(p, day, x, y, s, scale) {
  const r = 11 * s * scale;
  if (day) {
    p.stroke(...SUN);
    p.strokeCap(p.ROUND);
    p.strokeWeight(2.5 * s * scale);
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      p.line(x + Math.cos(a) * r * 1.45, y + Math.sin(a) * r * 1.45, x + Math.cos(a) * r * 1.9, y + Math.sin(a) * r * 1.9);
    }
    p.noStroke();
    p.fill(...SUN);
    p.ellipse(x, y, r * 2, r * 2);
  } else {
    // Crescent: a full moon with a card-coloured disc cut out of it.
    p.noStroke();
    p.fill(...MOON);
    p.ellipse(x, y, r * 2.2, r * 2.2);
    p.fill(...CARD);
    p.ellipse(x + r * 0.7, y - r * 0.45, r * 1.9, r * 1.9);
  }
}

function cloud(p, x, y, s) {
  p.noStroke();
  p.fill(...CLOUD);
  p.ellipse(x - 9 * s, y + 3 * s, 18 * s, 15 * s);
  p.ellipse(x + 2 * s, y - 3 * s, 22 * s, 21 * s);
  p.ellipse(x + 11 * s, y + 3 * s, 16 * s, 14 * s);
  p.rect(x - 9 * s, y + 2 * s, 20 * s, 8.5 * s);
}

function drops(p, x, y, s, length) {
  p.stroke(...RAIN);
  p.strokeCap(p.ROUND);
  p.strokeWeight(2.5 * s);
  for (let i = -1; i <= 1; i++) {
    const dx = x + i * 8 * s;
    p.line(dx, y + 12 * s, dx - 3 * s * length, y + 12 * s + 9 * s * length);
  }
}

function flakes(p, x, y, s) {
  p.noStroke();
  p.fill(255);
  for (let i = -1; i <= 1; i++) {
    p.ellipse(x + i * 8 * s, y + 15 * s + (i === 0 ? 5 : 0) * s, 5 * s, 5 * s);
  }
}
