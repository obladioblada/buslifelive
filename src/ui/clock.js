// Top-centre clock: big Helsinki and local time side by side, readable from across the room.
// Local is the visitor's own time zone, which differs from Helsinki for anyone outside Finland.

import { card, font, muted, PADDING } from './overlay.js';

const TIME = { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' };
const CLOCKS = [
  { label: 'HELSINKI', format: new Intl.DateTimeFormat('en-GB', { ...TIME, timeZone: 'Europe/Helsinki' }) },
  { label: 'LOCAL', format: new Intl.DateTimeFormat('en-GB', TIME) },
];

const DIGITS = 56, SECONDS = 22, LABEL = 11;
const GAP_SECONDS = 6, COLUMN_GAP = 36, LABEL_GAP = 8;
const HEIGHT = PADDING * 2 + DIGITS + LABEL_GAP + LABEL;

/**
 * Draws the clock centred on centerX at the top, fitted between left and right (the panels beside it);
 * it scales down when there is not enough room.
 */
export function drawClock(p, centerX, top, left, right) {
  const date = new Date();
  const times = CLOCKS.map(({ label, format }) => {
    const [hours, minutes, seconds] = format.format(date).split(':');
    return { label, main: `${hours}:${minutes}`, seconds: `:${seconds}` };
  });

  p.push();
  // Every column is as wide as the widest possible time, so the layout never jiggles as digits change.
  font(p, DIGITS, true);
  const mainWidth = p.textWidth('00:00');
  font(p, SECONDS, true);
  const secondsWidth = p.textWidth(':00');
  const columnWidth = mainWidth + GAP_SECONDS + secondsWidth;
  const width = PADDING * 2 + columnWidth * times.length + COLUMN_GAP * (times.length - 1);

  const room = right - left - 2 * 16;
  const scale = Math.min(1, room / width);
  p.translate(centerX, top);
  p.scale(scale);

  const x = -width / 2;
  card(p, x, 0, width, HEIGHT);
  times.forEach((time, i) => {
    const cx = x + PADDING + i * (columnWidth + COLUMN_GAP);
    if (i > 0) {
      // Thin divider between the two clocks.
      p.stroke(255, 30);
      p.strokeWeight(1);
      p.line(cx - COLUMN_GAP / 2, PADDING, cx - COLUMN_GAP / 2, HEIGHT - PADDING);
      p.noStroke();
    }
    p.textAlign(p.LEFT, p.TOP);
    p.fill(255);
    font(p, DIGITS, true);
    p.text(time.main, cx, PADDING - 8);
    font(p, SECONDS, true);
    p.fill(255, 170);
    p.text(time.seconds, cx + mainWidth + GAP_SECONDS, PADDING + 4);
    font(p, LABEL);
    muted(p);
    p.text(time.label, cx + 2, PADDING + DIGITS + LABEL_GAP);
  });
  p.pop();
}
