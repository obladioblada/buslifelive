// The song form: a 16-bar cycle (about 35 s) that keeps the music moving, and the choices that change
// between cycles (drum pattern, bass riff, lead voice, chord progression, now and then the key).
//
//   bars  0–1   intro      pad and bass only
//   bars  2–7   groove     + drums, + the layer of the vehicle types in view
//   bars  8–13  full       + melody
//   bars 14–15  breakdown  drums and bass drop out: pad, melody and the city voices
//
// The last bar before "full" and before the breakdown ends with a drum fill. A big change of view jumps
// ahead to the next section (nextSectionBar). Parts fade in and out (engine), so entries are not abrupt.

import { nextInt } from './rng.js';
import { makeKey, PROGRESSIONS, TONICS } from './harmony.js';

export const CYCLE_BARS = 16;
export const PATTERN_COUNT = 4;
export const RIFF_COUNT = 4;
export const LEADS = ['musicBox', 'kalimba', 'softSquare'];

const SECTIONS = [
  { name: 'intro', from: 0, drums: false, bass: true, pad: true, lead: false, layer: false },
  { name: 'groove', from: 2, drums: true, bass: true, pad: true, lead: false, layer: true },
  { name: 'full', from: 8, drums: true, bass: true, pad: true, lead: true, layer: true },
  { name: 'breakdown', from: 14, drums: false, bass: false, pad: true, lead: true, layer: true },
];

/** The section a bar belongs to, with `fill` set on the bar that leads into "full" and "breakdown". */
export function section(bar) {
  const inCycle = ((bar % CYCLE_BARS) + CYCLE_BARS) % CYCLE_BARS;
  let current = SECTIONS[0];
  for (const s of SECTIONS) if (inCycle >= s.from) current = s;
  return { ...current, fill: inCycle === 7 || inCycle === 13, first: inCycle === current.from };
}

/** First bar of the section after the one `bar` is in; after the breakdown, the next cycle's groove. */
export function nextSectionBar(bar) {
  const cycle = Math.floor(bar / CYCLE_BARS) * CYCLE_BARS, inCycle = bar - cycle;
  const next = SECTIONS.find(s => s.from > inCycle);
  return next ? cycle + next.from : cycle + CYCLE_BARS + SECTIONS[1].from;
}

/** Choices for a new cycle, avoiding an immediate repeat of the drum pattern and progression. */
export function nextChoices(previous, random, { minor, changeKey }) {
  const pick = (count, avoid) => {
    let n = nextInt(random, count);
    if (count > 1 && n === avoid) n = (n + 1 + nextInt(random, count - 1)) % count;
    return n;
  };
  const progressions = (minor ? PROGRESSIONS.minor : PROGRESSIONS.major).length;
  const progressionIndex = pick(progressions, previous?.key.progressionIndex);
  let tonic = previous?.key.tonic ?? TONICS[0];
  if (changeKey) tonic = TONICS[pick(TONICS.length, TONICS.indexOf(tonic))];
  return {
    pattern: pick(PATTERN_COUNT, previous?.pattern),
    riff: pick(RIFF_COUNT, previous?.riff),
    lead: LEADS[pick(LEADS.length, LEADS.indexOf(previous?.lead))],
    key: makeKey(tonic, minor, progressionIndex),
  };
}
