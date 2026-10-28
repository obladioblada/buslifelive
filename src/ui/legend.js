// Bottom-left "How to read the map" card for visitors: each row pairs a small drawing with a caption.

import { LATE, SIGNAL, forMode } from '../theme.js';
import { STATS_WIDTH } from './statsPanel.js';
import { card, fillColor, font, PADDING, title } from './overlay.js';

const ROW_HEIGHT = 28;
const GLYPH_WIDTH = 44;
const DOT = 9;
const MODES = ['bus', 'tram', 'metro', 'train', 'ferry'];

const bus = forMode('bus');
const ferry = forMode('ferry');

const ROWS = [
  ['Size: doors open, grows with stop time', (p, x, y) => {
    fillColor(p, bus, 230);
    p.ellipse(x - 14, y, DOT, DOT);
    fillColor(p, bus, 50);
    p.ellipse(x + 6, y, 26, 26);
    fillColor(p, bus, 230);
    p.ellipse(x + 6, y, 16, 16);
  }],
  ['Ferries: size = how full', (p, x, y) => {
    fillColor(p, ferry, 230);
    p.ellipse(x - 10, y, DOT, DOT);
    p.ellipse(x + 8, y, 16, 16);
  }],
  ['Red arc: late, full circle = 10+ min', (p, x, y) => {
    p.strokeCap(p.ROUND);
    p.strokeWeight(1.5);
    [0.15, 0.5, 1].forEach((sweep, i) => {
      const cx = x - 14 + i * 14;
      p.noStroke();
      fillColor(p, bus, 230);
      p.ellipse(cx, y, DOT - 2, DOT - 2);
      p.noFill();
      p.stroke(LATE[0], LATE[1], LATE[2], 140 + 90 * sweep);
      p.arc(cx, y, DOT + 4, DOT + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * sweep, p.OPEN);
    });
  }],
  ['Trail: moving, longer = faster', (p, x, y) => {
    p.strokeWeight(2.5);
    for (let i = 0; i < 4; i++) {
      p.stroke(bus[0], bus[1], bus[2], 30 + i * 25);
      p.line(x - 20 + i * 6, y, x - 14 + i * 6, y);
    }
    p.noStroke();
    fillColor(p, bus, 230);
    p.ellipse(x + 10, y, DOT, DOT);
  }],
  ['Faded: standing still', (p, x, y) => {
    fillColor(p, bus, 140);
    p.ellipse(x, y, DOT, DOT);
  }],
  ['White flash: asks a traffic light for green', (p, x, y) => {
    fillColor(p, SIGNAL, 140);
    p.ellipse(x, y, 22, 22);
    fillColor(p, bus, 230);
    p.ellipse(x, y, DOT, DOT);
  }],
  ['White streak: skipped a stop, nobody waiting', (p, x, y) => {
    p.strokeWeight(1.5);
    p.stroke(255, 200);
    p.line(x - 20, y, x, y);
    p.noStroke();
    fillColor(p, bus, 230);
    p.ellipse(x, y, DOT, DOT);
  }],
];

/** Draws the card with its bottom-left corner at (x, bottom); returns where it drew: { x, y, w, h }. */
/** Size of the card: as wide as its longest caption, at least as wide as the statistics panel. */
export function legendSize(p) {
  p.push();
  font(p, 13);
  const textWidth = Math.max(...ROWS.map(([caption]) => p.textWidth(caption)));
  p.pop();
  return { w: Math.max(GLYPH_WIDTH + textWidth + PADDING * 2, STATS_WIDTH), h: PADDING * 2 + ROW_HEIGHT * (ROWS.length + 2) };
}

export function drawLegend(p, x, bottom) {
  const { w: width, h: height } = legendSize(p);
  p.push();
  font(p, 13);
  p.textAlign(p.LEFT, p.CENTER);
  const top = bottom - height;

  card(p, x, top, width, height);
  const left = x + PADDING;
  let y = top + PADDING + ROW_HEIGHT / 2;
  title(p, 'How to read the map', left, y - 6);
  font(p, 13);
  p.textAlign(p.LEFT, p.CENTER);
  y += ROW_HEIGHT;

  // One coloured dot per transport mode.
  let modeX = left;
  for (const mode of MODES) {
    p.noStroke();
    fillColor(p, forMode(mode), 255);
    p.ellipse(modeX + DOT / 2, y, DOT, DOT);
    p.fill(255, 200);
    p.text(mode, modeX + DOT + 5, y);
    modeX += DOT + 5 + p.textWidth(mode) + 16;
  }
  y += ROW_HEIGHT;

  for (const [caption, glyph] of ROWS) {
    p.push();
    p.noStroke();
    glyph(p, left + GLYPH_WIDTH / 2 - 4, y);
    p.pop();
    p.fill(255, 220);
    p.text(caption, left + GLYPH_WIDTH, y);
    y += ROW_HEIGHT;
  }
  p.pop();
  return { x, y: top, w: width, h: height };
}
