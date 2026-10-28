// Ported from the Java MusicTest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pitch, triad } from '../src/music/harmony.js';
import { bass, Drum, drums } from '../src/music/groove.js';
import { generateMotif, MOTIF_LENGTH, varyMotif } from '../src/music/motif.js';
import { moodFrom } from '../src/music/mood.js';
import { seededRandom } from '../src/music/rng.js';
import { modeStats } from '../src/hfp/registry.js';

const mood = (energy, night = 0, weather = 'clear') => ({ bpm: 110, energy, minor: false, night, golden: 0, weather });
const notes = hits => hits.map(h => h.drum);
const city = (vehicles, share, delay) => {
  const all = modeStats(vehicles, Math.round(vehicles * share), 7, delay, 10);
  return { all, byMode: new Map([['bus', all]]), lateShare: 0, doorOpeningsPerSecond: 1 };
};

test('progression is I-V-vi-IV in D, and minor uses the same tonic', () => {
  assert.deepEqual(triad(0, false, 0), [50, 54, 57], 'D');
  assert.deepEqual(triad(1, false, 0), [57, 61, 64], 'A');
  assert.deepEqual(triad(2, false, 0), [59, 62, 66], 'Bm');
  assert.deepEqual(triad(3, false, 0), [55, 59, 62], 'G');
  assert.deepEqual(triad(4, false, 0), triad(0, false, 0));
  assert.deepEqual(triad(0, true, 0), [50, 53, 57], 'Dm');
  assert.deepEqual(triad(1, true, 0), [58, 62, 65], 'Bb');
  assert.equal(pitch(7, false, 0), 62);
  assert.equal(pitch(-1, false, 0), 49);
});

test('groove: backbeat always, busier with energy, sparse at night', () => {
  assert.ok(notes(drums(0, 0, mood(0.1))).includes(Drum.KICK));
  assert.ok(notes(drums(4, 0, mood(0.1))).includes(Drum.SNARE));
  assert.ok([Drum.KICK, Drum.SNARE, Drum.CLAP].every(d => notes(drums(4, 0, mood(0.9))).includes(d)));
  assert.ok(notes(drums(3, 0, mood(0.9))).includes(Drum.CLOSED_HAT), 'sixteenth hats');
  assert.ok(!notes(drums(3, 0, mood(0.3))).includes(Drum.CLOSED_HAT));
  assert.ok(notes(drums(4, 0, mood(0.9, 1))).includes(Drum.RIM));
  assert.equal(bass(mood(0.9, 1)).length, 2, 'just roots at night');
});

test('weather changes the groove', () => {
  assert.ok(notes(drums(2, 0, mood(0.3, 0, 'rain'))).includes(Drum.SHAKER));
  assert.ok(notes(drums(0, 4, mood(0.3, 0, 'thunderstorm'))).includes(Drum.CRASH));
  assert.ok(notes(drums(15, 3, mood(0.3, 0, 'thunderstorm'))).includes(Drum.LOW_TOM));
});

test('motif: two bars, chord tones on strong beats, variations move at most one note', () => {
  for (let seed = 0; seed < 50; seed++) {
    const motif = generateMotif(seededRandom(seed));
    for (const note of motif) {
      assert.ok(note.step >= 0 && note.step < MOTIF_LENGTH);
      if (note.step % 4 === 0) assert.ok([0, 2, 4, 7].includes(note.degree));
    }
    const varied = varyMotif(motif, seededRandom(seed + 1000));
    assert.equal(varied.length, motif.length);
    assert.ok(motif.filter((n, i) => n.degree !== varied[i].degree).length <= 1);
  }
});

test('mood follows the city, with minor-key hysteresis', () => {
  const busy = moodFrom(city(1100, 0.95, 150), null, null, false);
  const quiet = moodFrom(city(200, 0.2, 10), null, null, false);
  assert.ok(busy.energy > 0.8 && quiet.energy < 0.1);
  assert.ok(busy.bpm > 115 && quiet.bpm < 100);
  assert.equal(busy.minor, true);
  assert.equal(quiet.minor, false);
  assert.equal(moodFrom(city(800, 0.7, 100), null, null, true).minor, true, 'stays minor above 90 s');
  assert.equal(moodFrom(city(800, 0.7, 100), null, null, false).minor, false, 'needs 120 s to turn minor');
  assert.equal(moodFrom(city(800, 0.7, NaN), null, null, true).minor, true, 'unknown delay keeps the key');
});
