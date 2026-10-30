// A two-bar melody that repeats, which is what makes it catchy. Notes are scale degrees relative to the
// current chord root, so the same shape follows the progression. Strong beats use chord tones (0, 2, 4)
// so the melody never clashes with the harmony.

import { STEPS } from './groove.js';
import { nextInt } from './rng.js';

export const MOTIF_LENGTH = 2 * STEPS;

/** Rhythms that sound good looped; one is picked per motif. */
const RHYTHMS = [
  [0, 3, 6, 8, 12, 16, 19, 22, 24],
  [0, 2, 4, 7, 10, 16, 18, 20, 26],
  [0, 4, 6, 10, 12, 16, 20, 22, 28],
  [0, 6, 8, 14, 16, 22, 24, 28], // long, singing notes
  [0, 1, 2, 4, 8, 16, 17, 18, 20, 24], // short bursts
  [2, 4, 6, 12, 18, 20, 22, 28], // off the beat
  [0, 2, 3, 4, 8, 10, 16, 20, 24], // hop-hop-hop, then an answer
  [0, 3, 4, 7, 8, 12, 14, 24, 28], // bouncy question, short reply
];
const CHORD_TONES = [0, 2, 4, 7];
const PASSING = [1, 3, 5, 6];

/** A motif is an array of { step (0..31), degree, length (steps), velocity (0-127) }. */
export function generateMotif(random) {
  const rhythm = RHYTHMS[nextInt(random, RHYTHMS.length)];
  const notes = [];
  let previous = 2;
  rhythm.forEach((step, i) => {
    const next = i + 1 < rhythm.length ? rhythm[i + 1] : MOTIF_LENGTH;
    const strong = step % 4 === 0;
    const degree = nearest(strong ? CHORD_TONES : PASSING, previous, random);
    notes.push({ step, degree, length: Math.max(1, Math.min(next - step, 4)), velocity: strong ? 92 : 76 });
    previous = degree;
  });
  return notes;
}

/** The same motif with one weak-beat note moved: familiar, but not mechanical. */
export function varyMotif(motif, random) {
  const weak = motif.map((note, i) => (note.step % 4 !== 0 ? i : -1)).filter(i => i >= 0);
  if (weak.length === 0) return motif;
  const index = weak[nextInt(random, weak.length)];
  return motif.map((note, i) => (i === index ? { ...note, degree: PASSING[nextInt(random, PASSING.length)] } : note));
}

/** Notes starting at a step (0..31). */
export function motifAt(motif, step) {
  return motif.filter(note => note.step === step);
}

/** Prefers small steps from the previous note, so the line sings instead of jumping around. */
function nearest(options, previous, random) {
  let best = options[0], bestScore = Infinity;
  for (const option of options) {
    const score = Math.abs(option - previous) + random() * 2.5;
    if (score < bestScore) {
      bestScore = score;
      best = option;
    }
  }
  return best;
}
