// Ported from the Java MusicTest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chord7, keyName, makeKey, pentatonic, pitch, triad } from '../src/music/harmony.js';
import { CYCLE_BARS, LEADS, nextChoices, nextSectionBar, section } from '../src/music/arrangement.js';
import { bass, Drum, drums } from '../src/music/groove.js';
import { generateMotif, MOTIF_LENGTH, varyMotif } from '../src/music/motif.js';
import { moodFrom, TempoScale, tempoScore, MIN_BPM, MAX_BPM } from '../src/music/mood.js';
import { seededRandom } from '../src/music/rng.js';
import { modeStats } from '../src/hfp/registry.js';

const mood = (energy, night = 0, weather = 'clear') => ({ bpm: 110, energy, minor: false, night, golden: 0, weather });
const notes = hits => hits.map(h => h.drum);
const city = (vehicles, share, delay, speed = 7) => {
  const all = modeStats(vehicles, Math.round(vehicles * share), speed, delay, 10);
  return { all, byMode: new Map([['bus', all]]), lateShare: 0, doorOpeningsPerSecond: 1 };
};

test('progression is I-V-vi-IV in D, and the Dorian minor uses the same tonic', () => {
  const D = makeKey(50, false, 0), Dm = makeKey(50, true, 0);
  assert.deepEqual(triad(0, D, 0), [50, 54, 57], 'D');
  assert.deepEqual(triad(1, D, 0), [57, 61, 64], 'A');
  assert.deepEqual(triad(2, D, 0), [59, 62, 66], 'Bm');
  assert.deepEqual(triad(3, D, 0), [55, 59, 62], 'G');
  assert.deepEqual(triad(4, D, 0), triad(0, D, 0));
  assert.deepEqual(triad(0, Dm, 0), [50, 53, 57], 'Dm');
  assert.deepEqual(triad(1, Dm, 0), [55, 59, 62], 'G (Dorian IV)');
  assert.deepEqual(chord7(0, D, 0), [50, 54, 57, 61], 'Dmaj7');
  assert.deepEqual(chord7(0, Dm, 0), [50, 53, 57, 60], 'Dm7');
  assert.equal(pitch(7, D, 0), 62);
  assert.equal(pitch(-1, D, 0), 49);
  assert.equal(keyName(D), 'D major');
  assert.equal(keyName(makeKey(53, true, 0)), 'F minor');
});

test('other progressions and keys', () => {
  assert.deepEqual(triad(0, makeKey(50, false, 1), 0), [59, 62, 66], 'vi first');
  assert.deepEqual(triad(0, makeKey(48, false, 0), 0), [48, 52, 55], 'C major');
  assert.equal(makeKey(50, false, 5).progression, makeKey(50, false, 1).progression, 'index wraps');
});

test('arrangement: intro, groove, full, breakdown, with fills before full and breakdown', () => {
  assert.equal(section(0).name, 'intro');
  assert.equal(section(0).drums, false);
  assert.equal(section(2).name, 'groove');
  assert.ok(section(7).fill && section(13).fill && !section(6).fill);
  assert.equal(section(8).name, 'full');
  assert.ok(section(8).lead && section(8).first);
  assert.equal(section(14).name, 'breakdown');
  assert.ok(!section(14).drums && !section(14).bass && section(14).lead);
  assert.equal(section(CYCLE_BARS).name, 'intro', 'the cycle repeats');
});

test('a view change jumps to the next section; after the breakdown to the next groove', () => {
  assert.equal(nextSectionBar(0), 2);
  assert.equal(nextSectionBar(5), 8);
  assert.equal(nextSectionBar(9), 14);
  assert.equal(nextSectionBar(15), CYCLE_BARS + 2);
  assert.equal(nextSectionBar(CYCLE_BARS + 3), CYCLE_BARS + 8);
});

test('extra drum hits grow in with energy instead of switching on', () => {
  const ghost = energy => drums(15, 0, mood(energy), 2).filter(h => h.drum === Drum.SNARE)[0]?.velocity ?? 0;
  assert.equal(ghost(0.1), 0);
  assert.ok(ghost(0.35) > 0 && ghost(0.35) < ghost(0.6));
});

test('arrangement: each cycle changes pattern and progression; the key only when asked', () => {
  const random = seededRandom(7);
  let previous = nextChoices(null, random, { minor: false, changeKey: false });
  for (let i = 0; i < 50; i++) {
    const changeKey = i % 5 === 0;
    const next = nextChoices(previous, random, { minor: false, changeKey });
    assert.notEqual(next.pattern, previous.pattern);
    assert.notEqual(next.key.progressionIndex, previous.key.progressionIndex);
    assert.ok(LEADS.includes(next.lead));
    if (changeKey) assert.notEqual(next.key.tonic, previous.key.tonic);
    else assert.equal(next.key.tonic, previous.key.tonic);
    previous = next;
  }
});

test('melody notes between the beats stay pentatonic', () => {
  const D = makeKey(50, false, 0), Dm = makeKey(50, true, 0);
  assert.equal(pentatonic(3, 0, D), 2, 'G steps down to F#');
  assert.equal(pentatonic(1, 5, D), 0, 'C# over Bm steps down to B');
  assert.equal(pentatonic(1, 0, D), 1, 'E stays');
  assert.equal(pentatonic(1, 0, Dm), 0, 'E is left out of D minor pentatonic');
});

test('groove: backbeat always, busier with energy, sparse at night', () => {
  assert.ok(notes(drums(0, 0, mood(0.1))).includes(Drum.KICK));
  assert.ok(notes(drums(4, 0, mood(0.1))).includes(Drum.SNARE));
  assert.ok([Drum.KICK, Drum.SNARE].every(d => notes(drums(8, 0, mood(0.9))).concat(notes(drums(4, 0, mood(0.9)))).includes(d)));
  assert.ok(notes(drums(3, 0, mood(0.9))).includes(Drum.CLOSED_HAT), 'sixteenth hats');
  assert.ok(!notes(drums(3, 0, mood(0.3))).includes(Drum.CLOSED_HAT));
  assert.ok(notes(drums(4, 0, mood(0.9, 1))).includes(Drum.RIM));
  assert.equal(bass(mood(0.9, 1)).length, 2, 'just roots at night');
});

test('weather changes the groove', () => {
  assert.ok(notes(drums(2, 0, mood(0.3, 0, 'rain'))).includes(Drum.SHAKER));
  assert.ok(notes(drums(15, 3, mood(0.3, 0, 'thunderstorm'))).includes(Drum.LOW_TOM));
  assert.ok(!notes(drums(0, 4, mood(0.3, 0, 'thunderstorm'))).includes(Drum.CRASH), 'no crashes in the cozy kit');
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
  // Energy counts the vehicles in view: about 220 is a busy screen.
  const busy = moodFrom(city(300, 0.95, 150, 9), null, null, false);
  const quiet = moodFrom(city(10, 0.2, 10, 1), null, null, false);
  assert.ok(busy.energy > 0.8 && quiet.energy < 0.1);
  assert.ok(busy.bpm > 100 && quiet.bpm < 85, 'relaxed tempo range');
  assert.equal(busy.minor, true);
  assert.equal(quiet.minor, false);
  assert.equal(moodFrom(city(800, 0.7, 100), null, null, true).minor, true, 'stays minor above 90 s');
  assert.equal(moodFrom(city(800, 0.7, 100), null, null, false).minor, false, 'needs 120 s to turn minor');
  assert.equal(moodFrom(city(800, 0.7, NaN), null, null, true).minor, true, 'unknown delay keeps the key');
});

test('zooming in thins the band; the mix follows the modes in view', () => {
  const view = (zoom) => moodFrom(city(100, 0.5, 10), null, null, false, { zoom });
  assert.equal(view(11).zoomIn, 0);
  assert.equal(view(14).zoomIn, 1);
  assert.ok(view(12.75).zoomIn > 0.4 && view(12.75).zoomIn < 0.6);
  const all = modeStats(10, 5, 7, 0, 0);
  const mixed = { all: modeStats(20, 10, 7, 0, 0), byMode: new Map([['bus', all], ['tram', all]]), lateShare: 0, doorOpeningsPerSecond: 0 };
  const mix = moodFrom(mixed, null, null, false).mix;
  assert.equal(mix.bus, 0.5);
  assert.equal(mix.tram, 0.5);
  assert.equal(mix.rail, 0);
});

test('tempo follows speed, placed on the range of recent views', () => {
  assert.ok(tempoScore(city(50, 0.8, 0, 10)) > tempoScore(city(50, 0.8, 0, 3)), 'faster vehicles, higher score');
  assert.ok(Number.isNaN(tempoScore(city(0, 0, 0))));
  const scale = new TempoScale(60_000);
  scale.add(0.3, 0);
  scale.add(0.5, 1000);
  assert.equal(scale.position(0.3), 0);
  assert.equal(scale.position(0.5), 1);
  assert.ok(Math.abs(scale.position(0.4) - 0.5) < 1e-9);
  scale.add(0.45, 70_000);
  assert.equal(scale.samples.length, 1, 'old views are forgotten');
  assert.equal(scale.position(0.45), 0.5, 'a narrow range is widened around its middle');
  assert.equal(moodFrom(city(50, 0.5, 0), null, null, false, { tempo: 0 }).bpm, MIN_BPM);
  assert.equal(moodFrom(city(50, 0.5, 0), null, null, false, { tempo: 1 }).bpm, MAX_BPM);
});

test('tempo feel: half-time when slow, sixteenths and bouncy bass when fast', () => {
  const feel = (f, step) => notes(drums(step, 0, { ...mood(0.3), feel: f }, 0));
  assert.ok(!feel('slow', 4).includes(Drum.SNARE) && feel('slow', 8).includes(Drum.SNARE), 'half-time backbeat');
  assert.ok(feel('fast', 3).includes(Drum.CLOSED_HAT));
  assert.ok(!feel('mid', 3).includes(Drum.CLOSED_HAT));
  assert.equal(bass({ ...mood(0.1), feel: 'fast' }).length, 8, 'octave bounce');
});
