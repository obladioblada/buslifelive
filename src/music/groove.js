// Drum and bass patterns on a 16-step bar (sixteenth notes).

import { WeatherKind } from '../weather/weather.js';
import { rainy } from './mood.js';

export const Drum = Object.freeze({
  KICK: 'kick', RIM: 'rim', SNARE: 'snare', CLAP: 'clap', CLOSED_HAT: 'closedHat', OPEN_HAT: 'openHat',
  LOW_TOM: 'lowTom', MID_TOM: 'midTom', HIGH_TOM: 'highTom', CRASH: 'crash', SHAKER: 'shaker',
  CLAVES: 'claves', TRIANGLE: 'triangle',
});

export const STEPS = 16;

/** Drum hits ({ drum, velocity 0-127 }) for one step of a bar. */
export function drums(step, bar, mood) {
  const hits = [];
  const night = mood.night > 0.5;
  const energy = night ? Math.min(mood.energy, 0.3) : mood.energy;
  const hit = (drum, velocity) => hits.push({ drum, velocity });

  // Kick: on 1 and 3, four-on-the-floor when busy, plus a syncopated push in between.
  if (step === 0 || step === 8) hit(Drum.KICK, 110);
  else if (energy > 0.65 && (step === 4 || step === 12)) hit(Drum.KICK, 95);
  else if (energy > 0.4 && step === 10) hit(Drum.KICK, 85);

  // Backbeat on 2 and 4: a soft rim at night, snare plus clap when busy.
  if (step === 4 || step === 12) {
    if (night) {
      hit(Drum.RIM, 70);
    } else {
      hit(Drum.SNARE, 100);
      if (energy > 0.5) hit(Drum.CLAP, 80);
    }
  }

  // Hats: eighths, sixteenths when busy or raining; an open hat closes every other bar.
  const sixteenths = (energy > 0.75 || rainy(mood)) && !night;
  if (step === 14 && bar % 2 === 1 && !night) hit(Drum.OPEN_HAT, 75);
  else if (step % 2 === 0) hit(Drum.CLOSED_HAT, step % 4 === 0 ? 80 : 60);
  else if (sixteenths) hit(Drum.CLOSED_HAT, 42);

  // Rain: shaker on the off-beats.
  if (rainy(mood) && step % 4 === 2) hit(Drum.SHAKER, 60);

  // Thunderstorm: crash every four bars and a tom fill closing each phrase.
  if (mood.weather === WeatherKind.THUNDERSTORM) {
    if (step === 0 && bar % 4 === 0) hit(Drum.CRASH, 100);
    if (bar % 4 === 3 && step >= 12) hit([Drum.HIGH_TOM, Drum.HIGH_TOM, Drum.MID_TOM, Drum.LOW_TOM][step - 12], 95);
  }
  return hits;
}

/** The bass riff for one bar: [{ step, degree (relative to the chord root), length in steps }]. */
export function bass(mood) {
  if (mood.night > 0.5) return [note(0, 0, 7), note(8, 0, 6)];
  if (mood.energy < 0.35) return [note(0, 0, 5), note(6, 4, 2), note(8, 0, 6)];
  // Root, syncopated root, fifth, octave, root, fifth, and a passing note into the next chord.
  return [note(0, 0, 3), note(3, 0, 2), note(6, 4, 2), note(8, 7, 2), note(10, 0, 2), note(12, 4, 2), note(14, 6, 2)];
}

function note(step, degree, length) {
  return { step, degree, length };
}
