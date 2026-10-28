// Generative band driven by the city. Tone.js calls tick(time) every sixteenth note with an exact audio
// timestamp (the Java version used its own clock thread). Each tick plays drums, bass, a pad and a
// looping melody; the city joins in on the beat: doors opening play notes per transport mode, granted
// traffic lights and skipped stops add percussion. Tempo, density, key and colour follow the city,
// weather and sky.

import { EventType } from '../hfp/events.js';
import { chordRoot, pitch, triad } from './harmony.js';
import { bass, Drum, drums, STEPS } from './groove.js';
import { generateMotif, motifAt, varyMotif } from './motif.js';
import { moodFrom, QUIET, snowy } from './mood.js';
import { createBand } from './instruments.js';
import { WeatherKind } from '../weather/weather.js';

/** Sounds the sound panel can light up when they play. */
export const Cue = Object.freeze({
  BUS_DOORS: 'busDoors', TRAM_DOORS: 'tramDoors', TRAIN_DOORS: 'trainDoors', FERRY_DOORS: 'ferryDoors',
  GREEN_LIGHT: 'greenLight', SKIPPED_STOP: 'skippedStop', BEAT: 'beat',
});

const MAX_QUEUED = 64;
/** City notes older than this are dropped rather than played late. */
const CITY_HIT_MAX_AGE_MILLIS = 1500;

export class MusicEngine {
  constructor(Tone = globalThis.Tone) {
    this.Tone = Tone;
    this.started = false;
    /** The pending start, shared by every caller. */
    this.starting = null;
    this.muted = false;
    this.mood = QUIET;
    this.barMood = QUIET;
    this.bpm = QUIET.bpm;
    this.motif = null;
    this.step = 0;
    this.cityHits = [];
    this.lastPlayed = new Map();
    this.lastPassedStopStep = -100;
    this.random = Math.random;
  }

  /**
   * Starts the audio; must be called from a click or key press. Safe to call repeatedly: a click fires
   * both pointerdown and click, and both would otherwise build the band and the clock twice.
   */
  start() {
    this.starting ??= this.startOnce();
    return this.starting;
  }

  async startOnce() {
    const Tone = this.Tone;
    await Tone.start();
    // A visitor may have pressed Mute before the sound started.
    Tone.getDestination().mute = this.muted;
    this.band = createBand(Tone);
    const transport = Tone.getTransport();
    transport.bpm.value = this.bpm;
    transport.scheduleRepeat(time => this.tick(time), '16n');
    transport.start('+0.1');
    this.started = true;
    console.info('Music started');
  }

  /** Call about once per second with the latest city, weather and sky. */
  update(city, weather, sky) {
    this.mood = moodFrom(city, weather, sky, this.mood.minor);
  }

  /** Call for every vehicle event; the notes it causes are played on the next beat subdivision. */
  onVehicleEvent(event) {
    if (!this.started || this.muted) return;
    if (event.type !== EventType.DOORS_OPENED && event.type !== EventType.TRAFFIC_LIGHT_GRANTED
      && event.type !== EventType.PASSED_STOP) return;
    if (this.cityHits.length < MAX_QUEUED) {
      this.cityHits.push({ type: event.type, mode: event.vehicle.mode, timeMillis: event.timeMillis });
    }
  }

  /** Toggles mute and returns the new state; works before start too (applied once the sound starts). */
  toggleMute() {
    this.muted = !this.muted;
    if (this.started) this.Tone.getDestination().mute = this.muted;
    this.cityHits = [];
    console.info('Music', this.muted ? 'muted' : 'unmuted');
    return this.muted;
  }

  /**
   * What the music is doing right now, for display. Before the sound starts it shows what the city would
   * play (the mood is calculated from the live data either way).
   */
  status() {
    const m = this.started ? this.barMood : this.mood;
    return { started: this.started, bpm: this.started ? this.bpm : m.bpm, minor: m.minor, energy: m.energy,
      night: m.night, weather: m.weather, muted: this.muted };
  }

  /** Epoch millis when a cue last sounded, 0 if never. */
  lastPlayedAt(cue) {
    return this.lastPlayed.get(cue) ?? 0;
  }

  tick(time) {
    const s = this.step % STEPS;
    const bar = Math.floor(this.step / STEPS);
    this.step++;
    if (s === 0) this.startBar(bar, time);
    if (this.muted) return;
    if (s % 4 === 0) this.mark(Cue.BEAT, time);

    const m = this.barMood;
    for (const hit of drums(s, bar, m)) this.drum(hit.drum, hit.velocity, time);
    for (const note of bass(m)) {
      if (note.step === s) this.play('bass', pitch(chordRoot(bar, m.minor) + note.degree, m.minor, -1), 100, note.length, time);
    }
    if (this.leadPlays(bar, m)) {
      for (const note of motifAt(this.motif, (bar % 2) * STEPS + s)) {
        const voice = snowy(m) ? 'celesta' : 'piano';
        this.play(voice, pitch(chordRoot(bar, m.minor) + note.degree, m.minor, 1), note.velocity, note.length, time);
      }
    }
    this.playCityHits(s, bar, m, time);
  }

  startBar(bar, time) {
    this.barMood = this.mood;
    const m = this.barMood;
    this.bpm += (m.bpm - this.bpm) * 0.3; // ease towards the city's tempo instead of jumping
    this.Tone.getTransport().bpm.setValueAtTime(this.bpm, time);

    const reverb = m.weather === WeatherKind.FOG ? 110 : 45 + 50 * m.night;
    this.band.setColour(reverb, 30 + 70 * m.golden, time);

    if (!this.motif || bar % 16 === 0) this.motif = generateMotif(this.random);
    else if (bar % 4 === 0) this.motif = varyMotif(this.motif, this.random);

    if (!this.muted) {
      const velocity = 40 + 25 * m.golden;
      for (const p of triad(bar, m.minor, 0)) this.play('pad', p + 12, velocity, STEPS, time);
    }
  }

  /** The melody takes turns with the groove every 8 bars, plays throughout when the city is busy, rarely at night. */
  leadPlays(bar, m) {
    const section = Math.floor(bar / 8) % 2 === 1;
    if (m.night > 0.5) return section && Math.floor(bar / 16) % 2 === 1;
    return section || m.energy > 0.7;
  }

  /** City notes land on eighth notes, at most two per eighth, always on a tone of the current chord. */
  playCityHits(s, bar, m, time) {
    const now = Date.now();
    let played = 0;
    let accentPlayed = false;
    const keep = [];
    for (const hit of this.cityHits) {
      if (now - hit.timeMillis > CITY_HIT_MAX_AGE_MILLIS) continue;
      if (hit.type === EventType.TRAFFIC_LIGHT_GRANTED) {
        if (!accentPlayed) {
          this.drum(Drum.CLAVES, 70, time);
          this.mark(Cue.GREEN_LIGHT, time);
          accentPlayed = true;
        }
      } else if (hit.type === EventType.PASSED_STOP) {
        if (this.step - this.lastPassedStopStep >= 4) {
          this.drum(Drum.TRIANGLE, 55, time);
          this.mark(Cue.SKIPPED_STOP, time);
          this.lastPassedStopStep = this.step;
        }
      } else if (s % 2 !== 0 || played >= 2) {
        keep.push(hit); // doors wait for the next eighth note
      } else {
        this.playDoorNote(hit.mode, bar, m, time);
        played++;
      }
    }
    this.cityHits = keep;
  }

  playDoorNote(mode, bar, m, time) {
    const chord = triad(bar, m.minor, 0);
    const note = chord[Math.floor(this.random() * chord.length)];
    switch (mode) {
      case 'tram': this.play('vibraphone', note + 24, 80, 4, time); this.mark(Cue.TRAM_DOORS, time); break;
      case 'train': this.play('strings', note, 60, 8, time); this.mark(Cue.TRAIN_DOORS, time); break;
      case 'ferry': this.play('bells', note + 12, 75, 8, time); this.mark(Cue.FERRY_DOORS, time); break;
      default: this.play('marimba', note + 12, 85, 2, time); this.mark(Cue.BUS_DOORS, time);
    }
  }

  play(voice, midi, velocity, lengthSteps, time) {
    const duration = lengthSteps * 60 / this.bpm / 4;
    this.band.note(voice, midi, this.humanize(velocity), duration, time);
  }

  drum(drum, velocity, time) {
    this.band.drum(drum, this.humanize(velocity), time);
  }

  /** ±6 velocity, softer at night. */
  humanize(velocity) {
    const v = Math.round((velocity + Math.floor(this.random() * 13) - 6) * (1 - 0.3 * this.barMood.night));
    return Math.max(1, Math.min(127, v));
  }

  /** Lights the sound panel when the sound actually plays, not when it is scheduled. */
  mark(cue, time) {
    this.Tone.getDraw().schedule(() => this.lastPlayed.set(cue, Date.now()), time);
  }
}
