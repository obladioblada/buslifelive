// Bottom-right "How to listen" card: what each sound means, the live tempo, key and groove, and rows that
// light up when their sound plays (doors, green lights, skipped stops, the beat) or their condition is
// active (night, rain, storm, snow, fog).

import { Cue } from '../music/engine.js';
import { WeatherKind } from '../weather/weather.js';
import { LATE, forMode } from '../theme.js';
import { drawWeatherIcon } from './weatherIcon.js';
import { card, fillColor, font, muted, PADDING, title } from './overlay.js';

export const SOUND_WIDTH = 380;
const HEADER = 16, GAP = 14, LIVE = 50, ROW = 25, SUBROW = 18, PROMPT = 30;
const GLYPH_WIDTH = 54;
/** How long a row stays lit after its sound plays. */
const GLOW_MILLIS = 700;
const DOT = 9;
const TAP = globalThis.matchMedia?.('(pointer: coarse)').matches ?? false;

const DOOR_MODES = ['bus', 'tram', 'train', 'ferry'];
const DOOR_CUES = [Cue.BUS_DOORS, Cue.TRAM_DOORS, Cue.TRAIN_DOORS, Cue.FERRY_DOORS];

/** Rows whose glyph is a weather icon and which are lit while their condition holds. */
const CONDITIONS = [
  ['Night: softer and sparser', WeatherKind.CLEAR, false, s => s.night > 0.5],
  ['Rain: shaker and quick hi-hats', WeatherKind.RAIN, true, s => s.weather === WeatherKind.RAIN || s.weather === WeatherKind.DRIZZLE],
  ['Storm: distant rumbling drums', WeatherKind.THUNDERSTORM, true, s => s.weather === WeatherKind.THUNDERSTORM],
  ['Snow: the melody turns to celesta', WeatherKind.SNOW, true, s => s.weather === WeatherKind.SNOW || s.weather === WeatherKind.SLEET],
  ['Fog: everything echoes', WeatherKind.FOG, true, s => s.weather === WeatherKind.FOG],
];

/** Before the sound starts the panel has one more line: the invitation to start it. */
export function soundPanelHeight(started = true) {
  return PADDING * 2 + HEADER + GAP + LIVE + GAP + ROW * 6 + SUBROW + ROW * CONDITIONS.length + (started ? 0 : PROMPT);
}

/** Draws the card with its bottom-right corner at (right, bottom); returns where it drew: { x, y, w, h }. */
export function drawSoundPanel(p, right, bottom, music) {
  const now = Date.now();
  const status = music.status();
  const height = soundPanelHeight(status.started);
  const x = right - SOUND_WIDTH, top = bottom - height;

  p.push();
  card(p, x, top, SOUND_WIDTH, height);
  const left = x + PADDING, inner = right - PADDING;
  let y = top + PADDING;

  title(p, 'How to listen', left, y);
  // Only say something when the sound is not playing; the round buttons cover muting.
  font(p, 11);
  p.textAlign(p.RIGHT, p.TOP);
  p.fill(255, 200, 80);
  // Left of the minimize control in the corner.
  if (status.started && status.muted) p.text('Muted', inner - 26, y);
  y += HEADER + GAP;

  // Tempo, key and groove are shown before the sound starts too: what the city is about to play.
  live(p, left, inner, y, status);
  y += LIVE + GAP;
  if (!status.started) {
    startPrompt(p, left, inner, y);
    y += PROMPT;
  }

  // Doors: one dot per mode, each glowing when that mode's note plays.
  const doorsGlow = Math.max(...DOOR_CUES.map(cue => glow(music, cue, now)));
  rowBackground(p, left, inner, y, doorsGlow);
  DOOR_MODES.forEach((mode, i) => {
    const g = glow(music, DOOR_CUES[i], now);
    const cx = left + 4 + i * 11, cy = y + ROW / 2;
    const color = forMode(mode);
    if (g > 0) {
      fillColor(p, color, 90 * g);
      p.ellipse(cx, cy, DOT + 8 * g, DOT + 8 * g);
    }
    fillColor(p, color, 255);
    p.ellipse(cx, cy, DOT, DOT);
  });
  caption(p, 'Doors open: a note plays', left, y, doorsGlow);
  y += ROW;
  font(p, 11);
  p.textAlign(p.LEFT, p.CENTER);
  muted(p);
  p.text('bus marimba · tram vibes · train whistle · ferry bells', left + GLYPH_WIDTH, y + SUBROW / 2 - 2);
  y += SUBROW;

  // Green light: a two-note chime, drawn as two crossed sticks.
  const green = glow(music, Cue.GREEN_LIGHT, now);
  rowBackground(p, left, inner, y, green);
  p.stroke(255, 200 + 55 * green);
  p.strokeWeight(2.5);
  p.strokeCap(p.ROUND);
  const gx = left + GLYPH_WIDTH / 2 - 6, gy = y + ROW / 2;
  p.line(gx - 9, gy + 4, gx + 7, gy - 4);
  p.line(gx - 9, gy - 4, gx + 7, gy + 4);
  p.noStroke();
  caption(p, 'Green light for a bus or tram: a cheerful ding', left, y, green);
  y += ROW;

  // Skipped stop: triangle.
  const skipped = glow(music, Cue.SKIPPED_STOP, now);
  rowBackground(p, left, inner, y, skipped);
  p.noFill();
  p.stroke(255, 200 + 55 * skipped);
  p.strokeWeight(1.8);
  const tx = left + GLYPH_WIDTH / 2 - 6, ty = y + ROW / 2;
  p.triangle(tx, ty - 7, tx - 7, ty + 6, tx + 7, ty + 6);
  p.noStroke();
  caption(p, 'Skipped stop, nobody waiting: a little sparkle', left, y, skipped);
  y += ROW;

  // Tempo: a dot pulsing on every beat.
  const beat = glow(music, Cue.BEAT, now);
  p.fill(255, 120 + 135 * beat);
  const pulse = 7 + 5 * beat;
  p.ellipse(left + GLYPH_WIDTH / 2 - 6, y + ROW / 2, pulse, pulse);
  caption(p, 'Tempo: how fast the vehicles in view move', left, y, 0);
  y += ROW;

  // Key: a note head and stem.
  p.fill(255, 220);
  const nx = left + GLYPH_WIDTH / 2 - 8, ny = y + ROW / 2 + 3;
  p.ellipse(nx, ny, 8, 6);
  p.stroke(255, 220);
  p.strokeWeight(1.5);
  p.line(nx + 4, ny, nx + 4, ny - 11);
  p.noStroke();
  caption(p, 'Major key: on time  ·  dreamy minor: running late', left, y, 0);
  y += ROW;

  // Drums: three bars filled by how busy the groove is.
  for (let i = 0; i < 3; i++) {
    const h = 5 + i * 4;
    p.fill(255, status.energy > i / 3 ? 230 : 60);
    p.rect(left + 6 + i * 6, y + ROW / 2 + 7 - h, 4, h, 1);
  }
  caption(p, 'Drums get busier with more vehicles', left, y, 0);
  y += ROW;

  // Conditions: lit while they hold, dimmed otherwise.
  for (const [text, icon, day, active] of CONDITIONS) {
    const on = status.started && active(status);
    // Inactive rows are drawn faint (the card is translucent, so covering them would leave dark patches).
    const ctx = p.drawingContext;
    ctx.save();
    if (!on) ctx.globalAlpha = 0.35;
    drawWeatherIcon(p, icon, day, left + GLYPH_WIDTH / 2 - 6, y + ROW / 2, 20);
    caption(p, text, left, y, on ? 1 : 0);
    ctx.restore();
    y += ROW;
  }
  p.pop();
  return { x, y: top, w: SOUND_WIDTH, h: height };
}

/** "▶ Click anywhere to start the sound", gently pulsing so it is noticed. */
function startPrompt(p, left, inner, y) {
  const pulse = 0.75 + 0.25 * Math.sin(Date.now() / 450);
  p.noStroke();
  p.fill(61, 139, 255, 46 * pulse);
  p.rect(left - 6, y - 2, inner - left + 12, PROMPT - 6, 8);
  // Play triangle.
  p.fill(255, 255 * pulse);
  const cy = y + (PROMPT - 6) / 2 - 2;
  p.triangle(left + 4, cy - 6, left + 4, cy + 6, left + 14, cy);
  font(p, 13);
  p.textAlign(p.LEFT, p.CENTER);
  p.fill(255, 235);
  p.text(TAP ? 'Tap anywhere to start the sound' : 'Click anywhere to start the sound', left + 24, cy);
}

/** Tempo, key and a groove meter. */
function live(p, left, inner, y, status) {
  const column = (inner - left) / 3;
  p.textAlign(p.LEFT, p.TOP);
  font(p, 30, 'light');
  p.fill(255);
  const bpm = String(Math.round(status.bpm));
  p.text(bpm, left, y - 7);
  const bpmWidth = p.textWidth(bpm);
  font(p, 11);
  muted(p);
  p.text('BPM', left + bpmWidth + 5, y + 10);
  font(p, 11.5);
  p.text('tempo', left, y + 31);

  font(p, 30, 'light');
  p.fill(255);
  p.text(status.keyName ?? (status.minor ? 'D minor' : 'D major'), left + column, y - 7);
  font(p, 11.5);
  if (status.minor) {
    fillColor(p, LATE, 255);
    p.text('running late', left + column, y + 31);
  } else {
    muted(p);
    p.text('on time', left + column, y + 31);
  }

  const meterX = left + column * 2 + 10, meterW = inner - meterX;
  p.noStroke();
  p.fill(255, 30);
  p.rect(meterX, y + 12, meterW, 5, 2.5);
  p.fill(255, 220);
  p.rect(meterX, y + 12, meterW * Math.max(0.03, status.energy), 5, 2.5);
  muted(p);
  p.text('groove', meterX, y + 31);
}

function rowBackground(p, left, inner, y, glowAmount) {
  if (glowAmount <= 0) return;
  p.fill(255, 26 * glowAmount);
  p.rect(left - 6, y + 1, inner - left + 12, ROW - 2, 5);
}

function caption(p, text, left, y, emphasis) {
  font(p, 13);
  p.textAlign(p.LEFT, p.CENTER);
  p.fill(255, 210 + 45 * emphasis);
  p.text(text, left + GLYPH_WIDTH, y + ROW / 2 - 1);
}

function glow(music, cue, now) {
  const last = music.lastPlayedAt(cue);
  return last === 0 ? 0 : Math.max(0, 1 - (now - last) / GLOW_MILLIS);
}
