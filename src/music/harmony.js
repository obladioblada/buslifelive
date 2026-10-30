// Keys, scales and chord progressions. Pitches are MIDI note numbers; degrees count steps of the
// seven-note scale from the tonic (0 = tonic, 4 = fifth, 7 = tonic an octave up, -1 = leading tone below).
//
// A key is { tonic (MIDI note), minor (boolean), progression (array of chord-root degrees, one per bar) }.

export const MAJOR = [0, 2, 4, 5, 7, 9, 11];
/** "Running late" is Dorian: a minor mode with a raised sixth, dreamy rather than sad. */
export const MINOR = [0, 2, 3, 5, 7, 9, 10];
/** Scale degrees left out of the pentatonic melody (fourth and seventh in major, second and sixth in Dorian). */
const AVOID = { major: [3, 6], minor: [1, 5] };

/** Familiar progressions; the arrangement rotates between them. Index 0 is the classic of each mode. */
export const PROGRESSIONS = {
  major: [
    [0, 4, 5, 3], // I – V – vi – IV
    [5, 3, 0, 4], // vi – IV – I – V
    [0, 5, 3, 4], // I – vi – IV – V
    [3, 4, 2, 5], // IV – V – iii – vi
  ],
  minor: [
    [0, 3, 6, 3], // i – IV – VII – IV (Dorian)
    [0, 6, 2, 3], // i – VII – III – IV
    [0, 4, 6, 3], // i – v – VII – IV
    [0, 2, 3, 6], // i – III – IV – VII
  ],
};

/** Keys the music moves between now and then: D, F, C, G (all comfortable for bass and melody). */
export const TONICS = [50, 53, 48, 55];

const NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

export function makeKey(tonic = TONICS[0], minor = false, progressionIndex = 0) {
  const list = minor ? PROGRESSIONS.minor : PROGRESSIONS.major;
  return { tonic, minor, progressionIndex, progression: list[progressionIndex % list.length] };
}

export function scale(minor) {
  return minor ? MINOR : MAJOR;
}

/** "D major", "F minor"… */
export function keyName(key) {
  return `${NAMES[key.tonic % 12]} ${key.minor ? 'minor' : 'major'}`;
}

/** Degree of the chord root for a bar. */
export function chordRoot(bar, key) {
  return key.progression[floorMod(bar, key.progression.length)];
}

/** MIDI pitch of a scale degree, `octave` octaves above the tonic. */
export function pitch(degree, key, octave) {
  const s = scale(key.minor);
  return key.tonic + 12 * (octave + Math.floor(degree / s.length)) + s[floorMod(degree, s.length)];
}

/** Root, third and fifth of the bar's chord. */
export function triad(bar, key, octave) {
  const root = chordRoot(bar, key);
  return [pitch(root, key, octave), pitch(root + 2, key, octave), pitch(root + 4, key, octave)];
}

/** The chord with its seventh on top: soft major-seventh and minor-seventh colours for the pad. */
export function chord7(bar, key, octave) {
  const root = chordRoot(bar, key);
  return [...triad(bar, key, octave), pitch(root + 6, key, octave)];
}

/**
 * A melody degree (relative to the chord root) moved onto the pentatonic scale, which never sounds wrong:
 * the two left-out notes step down to their neighbour.
 */
export function pentatonic(degree, root, key) {
  const avoid = key.minor ? AVOID.minor : AVOID.major;
  return avoid.includes(floorMod(root + degree, 7)) ? degree - 1 : degree;
}

function floorMod(a, n) {
  return ((a % n) + n) % n;
}
