// Top-right card: drawn weather icon, temperature and the numbers behind the weather effects.

import { WeatherKind, kindLabel, windFrom } from '../weather/weather.js';
import { drawWeatherIcon } from './weatherIcon.js';
import { card, divider, font, muted, PADDING } from './overlay.js';

export const WEATHER_WIDTH = 270;
const HEIGHT = 266;

/** Draws the card with its top-right corner at (right, top). */
export function drawWeatherCard(p, right, top, weather, sky) {
  const x = right - WEATHER_WIDTH;
  p.push();
  card(p, x, top, WEATHER_WIDTH, HEIGHT);
  const left = x + PADDING, inner = right - PADDING;
  let y = top + PADDING;

  font(p, 11);
  p.textAlign(p.LEFT, p.TOP);
  muted(p);
  p.text('WEATHER  ·  HELSINKI', left, y);
  p.textAlign(p.RIGHT, p.TOP);
  if (sky.preview || weather?.preview) {
    p.fill(255, 200, 80);
    p.text(sky.preview ? 'PREVIEW: ' + sky.preview.label.toUpperCase() : 'PREVIEW', inner, y);
  } else if (weather) {
    p.text(weather.observedAt, inner, y);
  }
  y += 28;

  if (!weather) {
    font(p, 13);
    p.textAlign(p.LEFT, p.TOP);
    muted(p);
    p.text('Loading…', left, y);
    p.pop();
    return;
  }

  drawWeatherIcon(p, weather.kind, sky.daylight > 0.5, left + 24, y + 22, 48);
  p.textAlign(p.LEFT, p.TOP);
  font(p, 30, true);
  p.fill(255);
  p.text(`${Math.round(weather.temperature)}°`, left + 62, y - 4);
  font(p, 13);
  p.text(kindLabel(weather.kind), left + 62, y + 32);
  p.textAlign(p.RIGHT, p.TOP);
  muted(p);
  p.text(`feels ${Math.round(weather.feelsLike)}°`, inner, y + 32);
  y += 62;

  divider(p, left, inner, y);
  y += 12;

  const column = (inner - left) / 2;
  stat(p, left, y, 'WIND', `${weather.windSpeed.toFixed(1)} m/s ${windFrom(weather)}`);
  stat(p, left + column, y, weather.kind === WeatherKind.SNOW ? 'SNOW' : 'RAIN', `${weather.precipitationPerHour.toFixed(1)} mm/h`);
  y += 38;
  stat(p, left, y, 'CLOUDS', `${weather.cloudCover}%`);
  stat(p, left + column, y, 'VISIBILITY', Number.isNaN(weather.visibility) ? '–'
    : weather.visibility >= 1000 ? `${Math.round(weather.visibility / 1000)} km` : `${Math.round(weather.visibility)} m`);
  y += 38;
  stat(p, left, y, 'SUNRISE', sky.sunrise ?? '–');
  stat(p, left + column, y, 'SUNSET', sky.sunset ?? '–');
  y += 38;

  font(p, 11);
  p.textAlign(p.LEFT, p.TOP);
  p.fill(255, 90);
  p.text('Open-Meteo  ·  W: weather  ·  T: time of day', left, y);
  p.pop();
}

function stat(p, x, y, label, value) {
  p.textAlign(p.LEFT, p.TOP);
  font(p, 11);
  muted(p);
  p.text(label, x, y);
  font(p, 13);
  p.fill(255);
  p.text(value, x, y + 15);
}
