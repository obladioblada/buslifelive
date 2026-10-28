// Key, scales and the chord progression. Pitches are MIDI note numbers; degrees count steps of the
// seven-note scale from the tonic (0 = tonic, 4 = fifth, 7 = tonic an octave up, -1 = leading tone below).

export const MAJOR = [0, 2, 4, 5, 7, 9, 11];
export const MINOR = [0, 2, 3, 5, 7, 8, 10];

/** I - V - vi - IV: the most familiar pop progression. One chord per bar. */
export const MAJOR_PROGRESSION = [0, 4, 5, 3];
/** i - VI - III - VII: its minor-key counterpart, used when the city runs late. */
export const MINOR_PROGRESSION = [0, 5, 2, 6];

/** D: comfortable for the bass, bright for the melody. */
export const TONIC = 50;

export function scale(minor) {
  return minor ? MINOR : MAJOR;
}

/** Degree of the chord root for a bar. */
export function chordRoot(bar, minor) {
  const progression = minor ? MINOR_PROGRESSION : MAJOR_PROGRESSION;
  return progression[floorMod(bar, progression.length)];
}

/** MIDI pitch of a scale degree, `octave` octaves above the tonic. */
export function pitch(degree, minor, octave) {
  const s = scale(minor);
  return TONIC + 12 * (octave + Math.floor(degree / s.length)) + s[floorMod(degree, s.length)];
}

/** Root, third and fifth of the bar's chord. */
export function triad(bar, minor, octave) {
  const root = chordRoot(bar, minor);
  return [pitch(root, minor, octave), pitch(root + 2, minor, octave), pitch(root + 4, minor, octave)];
}

function floorMod(a, n) {
  return ((a % n) + n) % n;
}
