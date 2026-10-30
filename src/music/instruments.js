// The band, synthesized with Tone.js, in a cozy game style: soft round sounds, nothing harsh. Drums are a
// light kit (soft kick, finger snap, wooden tock, brushed hats, shaker, soft toms); tuned voices are a
// round bass, a warm filtered pad, music box / kalimba / soft square leads, and the city voices
// (marimba, vibraphone, whistle, bells) plus a chime for little game-like effects.
//
// Routing: every voice -> a warm master (gentle low-pass and compressor), and (except bass and kick) -> a
// shared ambience send: a short soft echo plus a small room (on phones only the echo). The city voices
// each go through a stereo panner, so a note sounds from where its vehicle is on screen.
//
// light = true (phones): same band with cheaper parts: no reverb, no chorus, plainer oscillators and
// fewer simultaneous notes, so small CPUs don't crackle.

import { Drum } from './groove.js';

/** Builds every voice. Call after Tone.start() (browsers need a user gesture). */
export function createBand(Tone, { light = false } = {}) {
  // Warm master: rounds off the highs, evens out the peaks, a little quieter overall.
  const master = new Tone.Gain(0.8);
  if (light) {
    master.chain(new Tone.Filter(7500, 'lowpass'), Tone.getDestination());
  } else {
    master.chain(new Tone.Filter(7500, 'lowpass'), new Tone.Compressor(-18, 2.5), Tone.getDestination());
  }
  const echo = new Tone.FeedbackDelay({ delayTime: 0.32, feedback: 0.28, wet: 1 });
  const echoFilter = new Tone.Filter(2600, 'lowpass');
  echo.chain(echoFilter, master);
  const ambienceSend = new Tone.Gain(0.3).connect(echo);
  if (!light) ambienceSend.connect(new Tone.Reverb({ decay: 1.8, wet: 1 }).connect(master));

  const out = node => {
    node.connect(master);
    node.connect(ambienceSend);
    return node;
  };
  /** City voices are panned left/right by where the vehicle is on screen. */
  const panned = () => out(new Tone.Panner(0));
  const poly = (Voice, options) => {
    const synth = new Tone.PolySynth(Voice, options);
    synth.maxPolyphony = light ? 6 : 24;
    return synth;
  };

  // ---- drums: a light kit
  const kickFilter = new Tone.Filter(900, 'lowpass').connect(master);
  const kick = new Tone.MembraneSynth({ pitchDecay: 0.03, octaves: 4, envelope: { attack: 0.002, decay: 0.32, sustain: 0, release: 0.1 } }).connect(kickFilter);
  kick.volume.value = -9;
  // Snare = a soft finger snap.
  const snapFilter = out(new Tone.Filter({ frequency: 2400, type: 'bandpass', Q: 0.9 }));
  const snap = new Tone.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 0.001, decay: 0.07, sustain: 0 } }).connect(snapFilter);
  snap.volume.value = -13;
  // Rim = a wooden tock.
  const tock = out(new Tone.MembraneSynth({ pitchDecay: 0.008, octaves: 1.5, envelope: { attack: 0.001, decay: 0.06, sustain: 0, release: 0.02 } }));
  tock.volume.value = -16;
  // Hats = brushes.
  const brushFilter = out(new Tone.Filter(6500, 'highpass'));
  const brush = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.004, decay: 0.035, sustain: 0 } }).connect(brushFilter);
  brush.volume.value = -27;
  const openBrush = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.01, decay: 0.16, sustain: 0 } }).connect(brushFilter);
  openBrush.volume.value = -30;
  const toms = out(new Tone.MembraneSynth({ pitchDecay: 0.06, octaves: 2, envelope: { attack: 0.002, decay: 0.3, sustain: 0 } }));
  toms.volume.value = -15;
  const shakerFilter = out(new Tone.Filter(5500, 'highpass'));
  const shaker = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.008, decay: 0.05, sustain: 0 } }).connect(shakerFilter);
  shaker.volume.value = -22;

  // ---- tuned voices
  const bassFilter = new Tone.Filter(650, 'lowpass').connect(master);
  const bass = new Tone.MonoSynth({
    oscillator: { type: 'triangle' },
    filter: { Q: 1, type: 'lowpass', rolloff: -12 },
    envelope: { attack: 0.006, decay: 0.28, sustain: 0.3, release: 0.12 },
    filterEnvelope: { attack: 0.004, decay: 0.15, sustain: 0.4, release: 0.1, baseFrequency: 220, octaves: 1.8 },
  }).connect(bassFilter);
  bass.volume.value = -5;

  const padFilter = out(new Tone.Filter(900, 'lowpass'));
  const chorus = light ? null : new Tone.Chorus(2.5, 2, 0.4).start().connect(padFilter);
  const pad = poly(Tone.Synth, {
    oscillator: light ? { type: 'triangle' } : { type: 'fattriangle', count: 3, spread: 18 },
    envelope: { attack: 1.1, decay: 0.6, sustain: 0.7, release: 2.4 },
  }).connect(chorus ?? padFilter);
  pad.volume.value = -21;

  // Leads, rotated by the arrangement: music box, kalimba, soft square; celesta when it snows.
  const musicBox = out(poly(Tone.FMSynth, {
    harmonicity: 4, modulationIndex: 1.4,
    envelope: { attack: 0.001, decay: 1.3, sustain: 0, release: 1 },
    modulationEnvelope: { attack: 0.001, decay: 0.25, sustain: 0, release: 0.2 },
  }));
  musicBox.volume.value = -15;
  const kalimba = out(poly(Tone.FMSynth, {
    harmonicity: 5.4, modulationIndex: 2.5,
    envelope: { attack: 0.001, decay: 0.9, sustain: 0, release: 0.7 },
    modulationEnvelope: { attack: 0.001, decay: 0.06, sustain: 0, release: 0.05 },
  }));
  kalimba.volume.value = -12;
  const squareFilter = out(new Tone.Filter(1700, 'lowpass'));
  const squareVibrato = light ? squareFilter : new Tone.Vibrato(5, 0.08).connect(squareFilter);
  const softSquare = poly(Tone.Synth, {
    oscillator: { type: 'square' },
    envelope: { attack: 0.01, decay: 0.25, sustain: 0.3, release: 0.35 },
  }).connect(squareVibrato);
  softSquare.volume.value = -22;
  const celesta = out(poly(Tone.FMSynth, {
    harmonicity: 7, modulationIndex: 3,
    envelope: { attack: 0.001, decay: 0.9, sustain: 0, release: 0.8 },
    modulationEnvelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.2 },
  }));
  celesta.volume.value = -15;
  // Chime: the little game-like effects (green light, skipped stop, section openings).
  const chime = out(poly(Tone.FMSynth, {
    harmonicity: 2, modulationIndex: 1.2,
    envelope: { attack: 0.001, decay: 0.6, sustain: 0, release: 0.5 },
    modulationEnvelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.1 },
  }));
  chime.volume.value = -17;

  // City voices: bus marimba, tram vibraphone, train whistle, ferry bells, each with its own panner.
  const pans = { marimba: panned(), vibraphone: panned(), strings: panned(), bells: panned() };
  const marimba = poly(Tone.FMSynth, {
    harmonicity: 4, modulationIndex: 1.1,
    envelope: { attack: 0.001, decay: 0.35, sustain: 0, release: 0.25 },
    modulationEnvelope: { attack: 0.001, decay: 0.06, sustain: 0, release: 0.05 },
  }).connect(pans.marimba);
  marimba.volume.value = -13;
  const tremolo = new Tone.Tremolo(4.5, 0.35).start().connect(pans.vibraphone);
  const vibraphone = poly(Tone.FMSynth, {
    harmonicity: 3.01, modulationIndex: 0.9,
    envelope: { attack: 0.002, decay: 1.6, sustain: 0, release: 1.1 },
  }).connect(tremolo);
  vibraphone.volume.value = -16;
  // Trains and metro: a soft whistle (sine with a little vibrato) instead of strings.
  const whistleVibrato = light ? pans.strings : new Tone.Vibrato(5.5, 0.06).connect(pans.strings);
  const strings = poly(Tone.Synth, {
    oscillator: { type: 'sine' },
    envelope: { attack: 0.12, decay: 0.3, sustain: 0.6, release: 0.9 },
  }).connect(whistleVibrato);
  strings.volume.value = -22;
  const bells = poly(Tone.FMSynth, {
    harmonicity: 3.5, modulationIndex: 4,
    envelope: { attack: 0.001, decay: 2.2, sustain: 0, release: 1.6 },
    modulationEnvelope: { attack: 0.001, decay: 0.8, sustain: 0, release: 0.6 },
  }).connect(pans.bells);
  bells.volume.value = -21;

  const frequency = midi => Tone.Frequency(midi, 'midi').toFrequency();
  const voices = { bass, pad, musicBox, kalimba, softSquare, celesta, chime, marimba, vibraphone, strings, bells };

  return {
    /** Plays a tuned note. velocity 0-127, duration in seconds, pan -1 (left) .. 1 (right) for city voices. */
    note(voice, midi, velocity, duration, time, pan = 0) {
      pans[voice]?.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), time);
      voices[voice].triggerAttackRelease(frequency(midi), duration, time, velocity / 127);
    },

    /** Plays a drum. velocity 0-127. Claps, crashes and triangles map to the soft kit. */
    drum(drum, velocity, time) {
      const v = velocity / 127;
      switch (drum) {
        case Drum.KICK: kick.triggerAttackRelease('C1', 0.25, time, v); break;
        case Drum.SNARE:
        case Drum.CLAP: snap.triggerAttackRelease(0.06, time, v); break;
        case Drum.RIM:
        case Drum.CLAVES: tock.triggerAttackRelease('G5', 0.05, time, v); break;
        case Drum.CLOSED_HAT: brush.triggerAttackRelease(0.03, time, v); break;
        case Drum.OPEN_HAT:
        case Drum.CRASH: openBrush.triggerAttackRelease(0.15, time, v); break;
        case Drum.LOW_TOM: toms.triggerAttackRelease('G2', 0.3, time, v); break;
        case Drum.MID_TOM: toms.triggerAttackRelease('C3', 0.3, time, v); break;
        case Drum.HIGH_TOM: toms.triggerAttackRelease('E3', 0.3, time, v); break;
        case Drum.SHAKER: shaker.triggerAttackRelease(0.045, time, v); break;
        case Drum.TRIANGLE: chime.triggerAttackRelease(frequency(96), 0.4, time, v); break;
      }
    },

    /** ambience 0..127 (like the MIDI reverb send), chorus 0..127 for the pad. */
    setColour(ambienceAmount, chorusAmount, time) {
      ambienceSend.gain.setValueAtTime(0.6 * ambienceAmount / 127, time);
      chorus?.wet.setValueAtTime(chorusAmount / 127, time);
    },
  };
}
