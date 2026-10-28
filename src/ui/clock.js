// Top-centre clock: big Helsinki and local time side by side, readable from across the room, each with
// its weather underneath. Local is the visitor's own time zone and (if they allow it) their weather.

import { kindLabel } from '../weather/weather.js';
import { drawWeatherIcon } from './weatherIcon.js';
import { card, font, muted, PADDING } from './overlay.js';

const TIME = { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' };
const CLOCKS = [
  { label: 'HELSINKI', format: new Intl.DateTimeFormat('en-GB', { ...TIME, timeZone: 'Europe/Helsinki' }) },
  { label: 'LOCAL', format: new Intl.DateTimeFormat('en-GB', TIME) },
];

const DIGITS = 64, SECONDS = 22, LABEL = 11;
const GAP_SECONDS = 6, COLUMN_GAP = 36, LABEL_GAP = 8, WEATHER_GAP = 10, WEATHER_LINE = 18, ICON = 20;
const HEIGHT = PADDING * 2 + DIGITS + LABEL_GAP + LABEL + WEATHER_GAP + WEATHER_LINE;

/**
 * Draws the clock centred on centerX at the top, fitted between left and right (the panels beside it);
 * it scales down when there is not enough room. Returns where it drew: { x, y, w, h }.
 *
 * @param weather one line per clock, Helsinki then local: { weather, day } or { message } when there is
 *                no weather to show (e.g. "Location not shared")
 */
/** Column widths and the full (unscaled) size of the clock card. */
function measure(p) {
  // Every column is as wide as the widest possible time, so the layout never jiggles as digits change.
  p.push();
  font(p, DIGITS, 'light');
  const mainWidth = p.textWidth('00:00');
  font(p, SECONDS, 'light');
  const secondsWidth = p.textWidth(':00');
  p.pop();
  const columnWidth = mainWidth + GAP_SECONDS + secondsWidth;
  return { mainWidth, columnWidth, width: PADDING * 2 + columnWidth * CLOCKS.length + COLUMN_GAP * (CLOCKS.length - 1) };
}

/** Full size of the clock card at scale 1. */
export function clockSize(p) {
  return { w: measure(p).width, h: HEIGHT };
}

export function drawClock(p, centerX, top, left, right, weather) {
  const date = new Date();
  const times = CLOCKS.map(({ label, format }) => {
    const [hours, minutes, seconds] = format.format(date).split(':');
    return { label, main: `${hours}:${minutes}`, seconds: `:${seconds}` };
  });

  const { mainWidth, columnWidth, width } = measure(p);
  p.push();

  const room = right - left - 2 * 16;
  const scale = Math.min(1, room / width);
  p.translate(centerX, top);
  p.scale(scale);

  const x = -width / 2;
  card(p, x, 0, width, HEIGHT, { subtle: true });
  times.forEach((time, i) => {
    const cx = x + PADDING + i * (columnWidth + COLUMN_GAP);
    if (i > 0) {
      // Thin divider between the two clocks.
      p.stroke(255, 22);
      p.strokeWeight(1);
      p.line(cx - COLUMN_GAP / 2, PADDING, cx - COLUMN_GAP / 2, HEIGHT - PADDING);
      p.noStroke();
    }
    p.textAlign(p.LEFT, p.TOP);
    p.fill(255);
    font(p, DIGITS, 'light');
    p.text(time.main, cx, PADDING - 10);
    // Seconds follow the actual digits (light digits are not all the same width).
    const actualWidth = p.textWidth(time.main);
    font(p, SECONDS, 'light');
    p.fill(255, 150);
    p.text(time.seconds, cx + actualWidth + GAP_SECONDS, PADDING + 6);
    font(p, LABEL);
    muted(p);
    p.text(time.label, cx + 2, PADDING + DIGITS + LABEL_GAP);
    weatherLine(p, cx + 2, PADDING + DIGITS + LABEL_GAP + LABEL + WEATHER_GAP, weather[i]);
  });
  p.pop();
  return { x: centerX - width * scale / 2, y: top, w: width * scale, h: HEIGHT * scale };
}

/** Small icon, temperature and condition, or a muted message. */
function weatherLine(p, x, y, line) {
  const mid = y + WEATHER_LINE / 2;
  p.textAlign(p.LEFT, p.CENTER);
  if (!line.weather) {
    font(p, 12);
    muted(p);
    p.text(line.message, x, mid);
    return;
  }
  drawWeatherIcon(p, line.weather.kind, line.day, x + ICON / 2, mid, ICON);
  font(p, 14, true);
  p.fill(255);
  const temperature = `${Math.round(line.weather.temperature)}°`;
  p.text(temperature, x + ICON + 8, mid);
  const tx = x + ICON + 8 + p.textWidth(temperature) + 7;
  font(p, 13);
  p.fill(255, 200);
  p.text(kindLabel(line.weather.kind), tx, mid);
}
