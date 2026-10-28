// Shared look for the on-screen panels: frosted card, muted text, divider and fonts.

import { CARD } from '../theme.js';

export const RADIUS = 16;
export const PADDING = 20;

/**
 * p5 quotes the family name it is given, so a CSS list like '"Segoe UI", Arial' becomes an invalid font
 * that the browser silently ignores. Pick the first installed family instead (like Java's Fonts class).
 * Windows has Segoe UI, macOS Helvetica Neue, Android Roboto; Arial is the last resort.
 */
export const FONT = firstInstalled(['Segoe UI', 'Helvetica Neue', 'Roboto', 'Helvetica', 'Arial']) ?? 'Arial';
/** Thin digits for the clock where a light family exists (Windows); otherwise the regular face. */
export const FONT_LIGHT = firstInstalled(['Segoe UI Light', 'Helvetica Neue Light', 'Roboto Light']) ?? FONT;

/**
 * Frosted card: translucent fill with a soft shadow and a faint highlight along the top edge. The canvas
 * cannot blur the map underneath (that is a separate WebGL canvas), so translucency carries the effect.
 * subtle = more see-through, for the clock.
 */
export function card(p, x, y, width, height, { subtle = false } = {}) {
  const ctx = p.drawingContext;
  // Clear the canvas under the card first, so only the map shows through the glass: no other card,
  // vehicle or raindrop behind it (overlapping translucent cards were unreadable).
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, RADIUS);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = `rgba(${CARD[0] + 6}, ${CARD[1] + 6}, ${CARD[2] + 8}, ${subtle ? 0.5 : 0.74})`;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, RADIUS);
  ctx.fill();
  ctx.restore();

  ctx.save();
  const edge = ctx.createLinearGradient(0, y, 0, y + height);
  edge.addColorStop(0, 'rgba(255, 255, 255, 0.18)');
  edge.addColorStop(0.5, 'rgba(255, 255, 255, 0.06)');
  edge.addColorStop(1, 'rgba(255, 255, 255, 0.03)');
  ctx.strokeStyle = edge;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x + 0.5, y + 0.5, width - 1, height - 1, RADIUS);
  ctx.stroke();
  ctx.restore();
  p.noStroke();
}

/** Card title in spaced capitals, matching the Settings menu ("SHOW ON THE MAP"). */
export function title(p, text, x, y, align = 'left') {
  const ctx = p.drawingContext;
  font(p, 11);
  muted(p);
  p.textAlign(align === 'right' ? p.RIGHT : p.LEFT, p.TOP);
  ctx.letterSpacing = '0.9px';
  p.text(text.toUpperCase(), x, y);
  ctx.letterSpacing = '0px';
}

/** Height of a minimized panel: just its title. */
export const BAR_HEIGHT = 40;
/** The corner control ("–" / "+") sits in a square this big in the top-right corner of a card. */
export const CORNER = 30;

/** Width of a minimized panel showing `text`. */
export function barWidth(p, text) {
  const ctx = p.drawingContext;
  font(p, 11);
  ctx.letterSpacing = '0.9px';
  const width = p.textWidth(text.toUpperCase());
  ctx.letterSpacing = '0px';
  return PADDING + width + 12 + CORNER;
}

/** A minimized panel: a slim frosted bar with its title and a faint "+". Returns { x, y, w, h }. */
export function drawBar(p, x, y, text, hovered) {
  const w = barWidth(p, text);
  p.push();
  card(p, x, y, w, BAR_HEIGHT);
  title(p, text, x + PADDING, y + BAR_HEIGHT / 2 - 7);
  cornerGlyph(p, x + w, y + (BAR_HEIGHT - CORNER) / 2, false, hovered);
  p.pop();
  return { x, y, w, h: BAR_HEIGHT };
}

/** The "–" that minimizes a full panel; drawn faint, brighter while the mouse is over the panel. */
export function drawMinimize(p, rect, hovered) {
  p.push();
  cornerGlyph(p, rect.x + rect.w, rect.y + 4, true, hovered);
  p.pop();
}

/** "–" (open panel) or "+" (minimized) centred in the corner square left of `right`. */
function cornerGlyph(p, right, top, open, hovered) {
  const cx = right - CORNER / 2 - 4, cy = top + CORNER / 2;
  p.stroke(255, hovered ? 210 : 70);
  p.strokeWeight(1.5);
  p.strokeCap(p.ROUND);
  p.line(cx - 4.5, cy, cx + 4.5, cy);
  if (!open) p.line(cx, cy - 4.5, cx, cy + 4.5);
  p.noStroke();
}

export function muted(p) {
  p.fill(255, 150);
}

export function divider(p, left, right, y) {
  p.stroke(255, 22);
  p.strokeWeight(1);
  p.line(left, y, right, y);
  p.noStroke();
}

/** Selects the panel font at a size: 'bold' for headline numbers, 'light' for the clock digits. */
export function font(p, size, weight = false) {
  p.textFont(weight === 'light' ? FONT_LIGHT : FONT);
  p.textSize(size);
  p.textStyle(weight === true || weight === 'bold' ? p.BOLD : p.NORMAL);
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

/**
 * document.fonts.check() says "true" even for fonts that are not installed, so measure instead: a family
 * is installed if text set in it differs in width from the generic fallbacks.
 */
function firstInstalled(families) {
  const canvas = globalThis.document?.createElement('canvas');
  const ctx = canvas?.getContext('2d');
  if (!ctx) return null;
  const sample = 'mmmmmmmmmmlli 0123456789';
  const width = font => {
    ctx.font = font;
    return ctx.measureText(sample).width;
  };
  return families.find(family => ['monospace', 'serif', 'sans-serif']
    .some(generic => width(`72px "${family}", ${generic}`) !== width(`72px ${generic}`))) ?? null;
}
