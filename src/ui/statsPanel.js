// Top-left card: live numbers for the whole city: headline figures, the mix of transport modes and
// what happens per second.

import { EventType } from '../hfp/events.js';
import { LATE_AFTER_SECONDS, movingShare } from '../hfp/registry.js';
import { LATE, forMode } from '../theme.js';
import { card, delay, divider, fillColor, font, muted, PADDING, percent } from './overlay.js';

export const STATS_WIDTH = 400;
const HEADER = 18, GAP = 14, KPI = 44, BAR = 6, ROW = 21, ACTIVITY = 48, FOOTER = 14;
/** Right edges of the table columns, relative to the content's left edge. */
const COLUMNS = [150, 212, 262, 318, 364];

export function drawStatsPanel(p, x, y, city, rates, messageRate, mapName) {
  const modes = city.byMode;
  const height = PADDING * 2 + HEADER + GAP + KPI + GAP + BAR + GAP + ROW * (modes.size + 1)
    + GAP + ACTIVITY + GAP + FOOTER;

  p.push();
  card(p, x, y, STATS_WIDTH, height);
  const left = x + PADDING, right = x + STATS_WIDTH - PADDING;
  const contentWidth = right - left;
  let cy = y + PADDING;

  // Header: title (the time is on the big clock at the top centre).
  font(p, 11);
  p.textAlign(p.LEFT, p.TOP);
  muted(p);
  p.text('HSL  ·  LIVE TRAFFIC', left, cy);
  cy += HEADER + GAP;

  // Headline figures.
  const tile = contentWidth / 4;
  const all = city.all;
  kpi(p, left, cy, String(all.vehicles), 'vehicles');
  kpi(p, left + tile, cy, percent(movingShare(all)), 'moving');
  kpi(p, left + tile * 2, cy, delay(all.averageDelaySeconds), 'avg delay',
    all.averageDelaySeconds > LATE_AFTER_SECONDS ? LATE : null);
  kpi(p, left + tile * 3, cy, String(all.doorsOpen), 'doors open');
  cy += KPI + GAP;

  // Share of vehicles per mode as one stacked bar.
  p.noStroke();
  p.fill(255, 30);
  p.rect(left, cy, contentWidth, BAR, BAR / 2);
  let bx = left;
  for (const [mode, stats] of modes) {
    const w = contentWidth * stats.vehicles / Math.max(all.vehicles, 1);
    fillColor(p, forMode(mode), 255);
    p.rect(bx, cy, w, BAR);
    bx += w;
  }
  cy += BAR + GAP;

  // Per-mode table.
  font(p, 11);
  muted(p);
  p.textAlign(p.LEFT, p.CENTER);
  p.text('MODE', left, cy + ROW / 2);
  p.textAlign(p.RIGHT, p.CENTER);
  ['COUNT', 'MOVING', 'KM/H', 'DELAY', 'DOORS'].forEach((header, i) => p.text(header, left + COLUMNS[i], cy + ROW / 2));
  cy += ROW;

  font(p, 13);
  for (const [mode, stats] of modes) {
    const mid = cy + ROW / 2;
    p.noStroke();
    fillColor(p, forMode(mode), 255);
    p.ellipse(left + 5, mid, 9, 9);
    p.fill(255);
    p.textAlign(p.LEFT, p.CENTER);
    p.text(mode === 'unknown' ? 'other' : mode, left + 18, mid);
    p.textAlign(p.RIGHT, p.CENTER);
    p.text(String(stats.vehicles), left + COLUMNS[0], mid);
    p.text(percent(movingShare(stats)), left + COLUMNS[1], mid);
    p.text(String(Math.round(stats.averageSpeed * 3.6)), left + COLUMNS[2], mid);
    if (stats.averageDelaySeconds > LATE_AFTER_SECONDS) fillColor(p, LATE, 255);
    p.text(delay(stats.averageDelaySeconds), left + COLUMNS[3], mid);
    p.fill(255);
    p.text(String(stats.doorsOpen), left + COLUMNS[4], mid);
    cy += ROW;
  }
  cy += GAP / 2;
  divider(p, left, right, cy);
  cy += GAP / 2;

  // What happens every second.
  font(p, 11);
  muted(p);
  p.textAlign(p.LEFT, p.TOP);
  p.text('EVERY SECOND', left, cy);
  cy += 18;
  activity(p, left, cy, rates.get(EventType.DEPARTED) ?? 0, 'departures');
  activity(p, left + tile, cy, rates.get(EventType.STOPPED) ?? 0, 'stops');
  activity(p, left + tile * 2, cy, rates.get(EventType.TRAFFIC_LIGHT_REQUESTED) ?? 0, 'green requests');
  activity(p, left + tile * 3, cy, rates.get(EventType.PASSED_STOP) ?? 0, 'stops skipped');
  cy += ACTIVITY - 18 + GAP;

  // Footer: data rate and map source.
  font(p, 11);
  p.fill(255, 90);
  p.textAlign(p.LEFT, p.TOP);
  p.text(`${Math.round(messageRate)} messages/s  ·  map: ${mapName}  ·  H: hide  ·  M: mute`, left, cy);
  p.pop();
}

function kpi(p, x, y, value, label, color = null) {
  p.textAlign(p.LEFT, p.TOP);
  font(p, 24, true);
  if (color) fillColor(p, color, 255);
  else p.fill(255);
  p.text(value, x, y - 4);
  font(p, 11);
  muted(p);
  p.text(label, x, y + 28);
}

function activity(p, x, y, perSecond, label) {
  p.textAlign(p.LEFT, p.TOP);
  font(p, 15, true);
  p.fill(255);
  p.text(perSecond < 10 ? perSecond.toFixed(1) : perSecond.toFixed(0), x, y - 2);
  font(p, 11);
  muted(p);
  p.text(label, x, y + 18);
}
