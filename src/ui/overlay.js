// Shared look for the on-screen panels: card, muted text, divider and fonts.

import { CARD } from '../theme.js';

export const RADIUS = 10;
export const PADDING = 18;
/**
 * p5 quotes the family name it is given, so a CSS list like '"Segoe UI", Arial' becomes an invalid font
 * that the browser silently ignores. Pick the first installed family instead (like Java's Fonts class).
 */
const PREFERRED = ['Segoe UI', 'Helvetica Neue', 'Helvetica', 'Arial'];
export const FONT = PREFERRED.find(family => globalThis.document?.fonts?.check(`12px "${family}"`)) ?? 'Arial';

/** Dark translucent card with a faint border. */
export function card(p, x, y, width, height) {
  p.stroke(255, 28);
  p.strokeWeight(1);
  p.fill(CARD[0], CARD[1], CARD[2], 242);
  p.rect(x, y, width, height, RADIUS);
  p.noStroke();
}

export function muted(p) {
  p.fill(255, 140);
}

export function divider(p, left, right, y) {
  p.stroke(255, 30);
  p.strokeWeight(1);
  p.line(left, y, right, y);
  p.noStroke();
}

/** Selects the panel font at a size; bold for headline numbers. */
export function font(p, size, bold = false) {
  p.textFont(FONT);
  p.textSize(size);
  p.textStyle(bold ? p.BOLD : p.NORMAL);
}

export function fillColor(p, color, alpha = color[3] ?? 255) {
  p.fill(color[0], color[1], color[2], alpha);
}

export function percent(share) {
  return `${Math.round(share * 100)}%`;
}

/** "+48s", "-1.5m", or "–" when unknown. */
export function delay(seconds) {
  if (Number.isNaN(seconds)) return '–';
  const sign = seconds >= 0 ? '+' : '-';
  if (Math.abs(seconds) >= 90) return `${sign}${(Math.abs(seconds) / 60).toFixed(1)}m`;
  return `${sign}${Math.round(Math.abs(seconds))}s`;
}
