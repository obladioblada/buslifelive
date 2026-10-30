// Drum and bass patterns on a 16-step bar (sixteenth notes). Four drum patterns and four bass riffs; the
// arrangement picks one of each per cycle, and energy, night, zoom and weather shape them. Extra hits
// grow in gradually with energy (ramp) instead of switching on at a threshold.

import { WeatherKind } from '../weather/weather.js';
import { rainy } from './mood.js';

export const Drum = Object.freeze({
  KICK: 'kick', RIM: 'rim', SNARE: 'snare', CLAP: 'clap', CLOSED_HAT: 'closedHat', OPEN_HAT: 'openHat',
  LOW_TOM: 'lowTom', MID_TOM: 'midTom', HIGH_TOM: 'highTom', CRASH: 'crash', SHAKER: 'shaker',
  CLAVES: 'claves', TRIANGLE: 'triangle',
});

export const STEPS = 16;

/**
 * A light, swung kit (the engine adds the swing). kick: basic kicks; busy: kicks when the view is busy;
 * push: extra syncopation at medium energy; snare: backbeat (a finger snap); ghost: soft snaps;
 * tock: wooden tocks; openHat: steps with a longer brush.
 */
export const PATTERNS = [
  { name: 'stroll', kick: [0, 10], busy: [8], push: [6], snare: [4, 12], ghost: [], tock: [7], openHat: [14] },
  { name: 'lazy', kick: [0], busy: [10], push: [6], snare: [8], ghost: [14], tock: [3, 11], openHat: [] },
  { name: 'hop', kick: [0, 6], busy: [8], push: [11], snare: [4, 12], ghost: [15], tock: [10], openHat: [] },
  { name: 'bounce', kick: [0, 3, 8], busy: [11], push: [14], snare: [4, 12], ghost: [7], tock: [], openHat: [6] },
];

/** Bass riffs: [step, degree relative to the chord root, length in steps]. */
export const RIFFS = [
  [[0, 0, 3], [3, 0, 2], [6, 4, 2], [8, 7, 2], [10, 0, 2], [12, 4, 2], [14, 6, 2]], // root pump with a passing note
  [[0, 0, 2], [2, 7, 2], [4, 0, 2], [6, 7, 2], [8, 0, 2], [10, 7, 2], [12, 0, 2], [14, 7, 2]], // octave bounce
  [[0, 0, 4], [6, 0, 2], [8, 4, 3], [11, 2, 2], [14, 4, 2]], // syncopated
  [[0, 0, 4], [4, 2, 4], [8, 4, 4], [12, 5, 4]], // walking up the chord
];

/**
 * Drum hits ({ drum, velocity 0-127 }) for one step.
 * @param patternIndex which of PATTERNS; @param sec the arrangement section (drums / fill flags)
 */
export function drums(step, bar, mood, patternIndex = 0, sec = { drums: true, fill: false }) {
  const hits = [];
  const hit = (drum, velocity) => hits.push({ drum, velocity });
  // Rain keeps a soft shaker even when the drums rest.
  if (rainy(mood) && step % 4 === 2) hit(Drum.SHAKER, 60);
  if (!sec.drums) return hits;

  const night = mood.night > 0.5;
  // Zoomed in, the groove steps back so single vehicles stand out.
  const zoomIn = mood.zoomIn ?? 0;
  const energy = (night ? Math.min(mood.energy, 0.3) : mood.energy) * (1 - 0.4 * zoomIn);
  // Slow tempo feels half-time ('lazy'); fast tempo adds sixteenth brushes.
  const pattern = night ? PATTERNS[0] : mood.feel === 'slow' ? PATTERNS[1] : PATTERNS[patternIndex % PATTERNS.length];

  // Fills are melodic (a marimba run, played by the engine); the drums just keep a light shuffle.
  if (sec.fill && step >= 12) {
    hit(Drum.SHAKER, 50 + (step - 12) * 8);
    return hits;
  }

  // Extra hits fade in with energy; too soft to hear means not played.
  const soft = (drum, velocity) => {
    if (velocity >= 12) hit(drum, velocity);
  };

  // Kick: the pattern's basic kicks, more when busy.
  if (pattern.kick.includes(step)) hit(Drum.KICK, 110);
  else if (pattern.busy.includes(step)) soft(Drum.KICK, 95 * ramp(energy, 0.5, 0.8));
  else if (pattern.push.includes(step)) soft(Drum.KICK, 85 * ramp(energy, 0.25, 0.55));

  // Backbeat: a wooden tock at night, a finger snap by day, ghost snaps and tocks in between.
  if (pattern.snare.includes(step)) {
    if (night) hit(Drum.RIM, 70);
    else hit(Drum.SNARE, 90);
  } else if (!night && pattern.ghost.includes(step)) {
    soft(Drum.SNARE, 40 * ramp(energy, 0.2, 0.5));
  } else if (!night && pattern.tock.includes(step)) {
    soft(Drum.RIM, 60 * ramp(energy, 0.35, 0.65));
  }

  // Hats: eighths, sixteenths growing in when busy (always when raining); the pattern's open hats.
  const sixteenths = night ? 0 : rainy(mood) || mood.feel === 'fast' ? 1 : ramp(energy, 0.55, 0.85) * ramp(1 - zoomIn, 0.3, 0.6);
  if (!night && pattern.openHat.includes(step) && (pattern.name === 'disco' || bar % 2 === 1)) hit(Drum.OPEN_HAT, 70);
  else if (step % 2 === 0) hit(Drum.CLOSED_HAT, step % 4 === 0 ? 80 : 60);
  else soft(Drum.CLOSED_HAT, 42 * sixteenths);

  // Thunderstorm: distant rumbling toms closing each phrase.
  if (mood.weather === WeatherKind.THUNDERSTORM && bar % 4 === 3 && step >= 12) {
    hit([Drum.HIGH_TOM, Drum.MID_TOM, Drum.LOW_TOM, Drum.LOW_TOM][step - 12], 60 + (step - 12) * 6);
  }
  return hits;
}

/** The bass riff for one bar: [{ step, degree, length }]. Just roots at night, simple when quiet. */
export function bass(mood, riffIndex = 0) {
  if (mood.night > 0.5) return [note(0, 0, 7), note(8, 0, 6)];
  // Fast tempo: the bouncy octave riff; slow tempo: long roots and fifths.
  if (mood.feel === 'fast') return RIFFS[1].map(([step, degree, length]) => note(step, degree, length));
  if (mood.feel === 'slow' || mood.energy < 0.3) return [note(0, 0, 5), note(6, 4, 2), note(8, 0, 6)];
  return RIFFS[riffIndex % RIFFS.length].map(([step, degree, length]) => note(step, degree, length));
}

/** 0 below `from`, 1 above `to`, linear in between. */
function ramp(value, from, to) {
  return Math.max(0, Math.min(1, (value - from) / (to - from)));
}

function note(step, degree, length) {
  return { step, degree, length };
}
