// The band, synthesized with Tone.js: every General MIDI voice of the Java version (Gervill) becomes a
// small synth patch. Drums are built from membranes (kick, toms), noise (snare, clap, shaker) and metal
// (hats, crash); tuned voices from FM and subtractive synths.
//
// Routing: each voice -> dry output, and (except the bass) -> a shared reverb send.

import { Drum } from './groove.js';

/** Builds every voice. Call after Tone.start() (browsers need a user gesture). */
export function createBand(Tone) {
  const reverb = new Tone.Reverb({ decay: 3.2, wet: 1 }).toDestination();
  const reverbSend = new Tone.Gain(0.3).connect(reverb);
  const out = node => {
    node.toDestination();
    node.connect(reverbSend);
    return node;
  };

  // ---- drums
  const kick = new Tone.MembraneSynth({ pitchDecay: 0.045, octaves: 6, envelope: { attack: 0.001, decay: 0.42, sustain: 0, release: 0.1 } }).toDestination();
  kick.volume.value = -4;
  const snareFilter = out(new Tone.Filter(1400, 'highpass'));
  const snare = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.17, sustain: 0 } }).connect(snareFilter);
  snare.volume.value = -10;
  const snareBody = out(new Tone.MembraneSynth({ pitchDecay: 0.02, octaves: 2, envelope: { attack: 0.001, decay: 0.09, sustain: 0 } }));
  snareBody.volume.value = -14;
  const clapFilter = out(new Tone.Filter({ frequency: 1500, type: 'bandpass', Q: 1.2 }));
  const clap = new Tone.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 0.002, decay: 0.13, sustain: 0 } }).connect(clapFilter);
  clap.volume.value = -8;
  const hat = out(new Tone.MetalSynth({ envelope: { attack: 0.001, decay: 0.05, release: 0.01 }, harmonicity: 5.1, modulationIndex: 32, resonance: 4200, octaves: 1.5 }));
  hat.volume.value = -26;
  const openHat = out(new Tone.MetalSynth({ envelope: { attack: 0.001, decay: 0.32, release: 0.05 }, harmonicity: 5.1, modulationIndex: 32, resonance: 4200, octaves: 1.5 }));
  openHat.volume.value = -27;
  const crash = out(new Tone.MetalSynth({ envelope: { attack: 0.001, decay: 1.6, release: 0.4 }, harmonicity: 4.1, modulationIndex: 40, resonance: 3000, octaves: 2 }));
  crash.volume.value = -24;
  const toms = out(new Tone.MembraneSynth({ pitchDecay: 0.08, octaves: 3, envelope: { attack: 0.001, decay: 0.35, sustain: 0 } }));
  toms.volume.value = -8;
  const rim = out(new Tone.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.01 } }));
  rim.volume.value = -22;
  const shakerFilter = out(new Tone.Filter(6500, 'highpass'));
  const shaker = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.004, decay: 0.06, sustain: 0 } }).connect(shakerFilter);
  shaker.volume.value = -18;
  const claves = out(new Tone.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.001, decay: 0.06, sustain: 0, release: 0.02 } }));
  claves.volume.value = -12;
  const triangle = out(new Tone.FMSynth({ harmonicity: 3.5, modulationIndex: 2, envelope: { attack: 0.001, decay: 0.9, sustain: 0, release: 0.4 } }));
  triangle.volume.value = -22;

  // ---- tuned voices
  const bass = new Tone.MonoSynth({
    oscillator: { type: 'sawtooth' },
    filter: { Q: 2, type: 'lowpass', rolloff: -24 },
    envelope: { attack: 0.005, decay: 0.25, sustain: 0.45, release: 0.08 },
    filterEnvelope: { attack: 0.003, decay: 0.2, sustain: 0.25, release: 0.1, baseFrequency: 160, octaves: 2.6 },
  }).toDestination();
  bass.volume.value = -9;

  const chorus = new Tone.Chorus(3.5, 2.5, 0.5).start();
  const padFilter = out(new Tone.Filter(1300, 'lowpass'));
  chorus.connect(padFilter);
  const pad = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'fatsawtooth', count: 3, spread: 28 },
    envelope: { attack: 0.6, decay: 0.4, sustain: 0.65, release: 1.6 },
  }).connect(chorus);
  pad.volume.value = -24;

  // Electric piano (normal lead) and celesta (lead in snow).
  const piano = out(new Tone.PolySynth(Tone.FMSynth, {
    harmonicity: 3, modulationIndex: 9,
    envelope: { attack: 0.002, decay: 1.1, sustain: 0.15, release: 0.9 },
    modulationEnvelope: { attack: 0.002, decay: 0.35, sustain: 0, release: 0.2 },
  }));
  piano.volume.value = -14;
  const celesta = out(new Tone.PolySynth(Tone.FMSynth, {
    harmonicity: 7, modulationIndex: 3.5,
    envelope: { attack: 0.001, decay: 0.9, sustain: 0, release: 0.8 },
    modulationEnvelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.2 },
  }));
  celesta.volume.value = -15;

  // City voices: bus marimba, tram vibraphone, train strings, ferry bells.
  const marimba = out(new Tone.PolySynth(Tone.FMSynth, {
    harmonicity: 4, modulationIndex: 1.6,
    envelope: { attack: 0.001, decay: 0.32, sustain: 0, release: 0.2 },
    modulationEnvelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.05 },
  }));
  marimba.volume.value = -11;
  const tremolo = out(new Tone.Tremolo(5.5, 0.45).start());
  const vibraphone = new Tone.PolySynth(Tone.FMSynth, {
    harmonicity: 3.01, modulationIndex: 1.2,
    envelope: { attack: 0.002, decay: 1.8, sustain: 0, release: 1.2 },
  }).connect(tremolo);
  vibraphone.volume.value = -14;
  const stringsFilter = out(new Tone.Filter(1900, 'lowpass'));
  const strings = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'fatsawtooth', count: 3, spread: 20 },
    envelope: { attack: 0.25, decay: 0.3, sustain: 0.7, release: 1.2 },
  }).connect(stringsFilter);
  strings.volume.value = -22;
  const bells = out(new Tone.PolySynth(Tone.FMSynth, {
    harmonicity: 5.07, modulationIndex: 14,
    envelope: { attack: 0.001, decay: 2.4, sustain: 0, release: 1.8 },
    modulationEnvelope: { attack: 0.001, decay: 1.5, sustain: 0, release: 1 },
  }));
  bells.volume.value = -20;

  const frequency = midi => Tone.Frequency(midi, 'midi').toFrequency();
  const voices = { bass, pad, piano, celesta, marimba, vibraphone, strings, bells };

  return {
    /** Plays a tuned note. velocity 0-127, duration in seconds. */
    note(voice, midi, velocity, duration, time) {
      voices[voice].triggerAttackRelease(frequency(midi), duration, time, velocity / 127);
    },

    /** Plays a drum. velocity 0-127. */
    drum(drum, velocity, time) {
      const v = velocity / 127;
      switch (drum) {
        case Drum.KICK: kick.triggerAttackRelease('C1', 0.3, time, v); break;
        case Drum.SNARE:
          snare.triggerAttackRelease(0.15, time, v);
          snareBody.triggerAttackRelease(190, 0.08, time, v);
          break;
        case Drum.CLAP: clap.triggerAttackRelease(0.12, time, v); break;
        case Drum.CLOSED_HAT: hat.triggerAttackRelease(420, 0.04, time, v); break;
        case Drum.OPEN_HAT: openHat.triggerAttackRelease(420, 0.3, time, v); break;
        case Drum.CRASH: crash.triggerAttackRelease(300, 1.4, time, v); break;
        case Drum.LOW_TOM: toms.triggerAttackRelease('G2', 0.3, time, v); break;
        case Drum.MID_TOM: toms.triggerAttackRelease('C3', 0.3, time, v); break;
        case Drum.HIGH_TOM: toms.triggerAttackRelease('E3', 0.3, time, v); break;
        case Drum.RIM: rim.triggerAttackRelease(1700, 0.03, time, v); break;
        case Drum.SHAKER: shaker.triggerAttackRelease(0.05, time, v); break;
        case Drum.CLAVES: claves.triggerAttackRelease(2500, 0.05, time, v); break;
        case Drum.TRIANGLE: triangle.triggerAttackRelease(2400, 0.8, time, v); break;
      }
    },

    /** reverb 0..127 (like the MIDI reverb send), chorus 0..127 for the pad. */
    setColour(reverbAmount, chorusAmount, time) {
      reverbSend.gain.setValueAtTime(0.6 * reverbAmount / 127, time);
      chorus.wet.setValueAtTime(chorusAmount / 127, time);
    },
  };
}
