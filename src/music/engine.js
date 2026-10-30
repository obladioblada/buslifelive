// Generative band driven by what is in view. Tone.js calls tick(time) every sixteenth note with an exact
// audio timestamp. Each bar follows a 16-bar song form (intro, groove, full, breakdown; see
// arrangement.js) with drums, bass, a pad, a looping melody and a layer chosen by the vehicle types in
// view. Each part fades in and out over about a beat; energy and zoom are smoothed over a couple of
// seconds and read every beat, the tempo glides across each bar, and a big change of view jumps to the
// next section after a drum fill. The city joins in on the beat: doors opening play notes per transport mode, panned to where the
// vehicle is on screen and pitched higher in the north; granted traffic lights and skipped stops add
// percussion. Tempo, density, key and colour follow the view, weather, sky and zoom.

import { EventType } from '../hfp/events.js';
import { chord7, chordRoot, keyName, makeKey, pentatonic, pitch, triad } from './harmony.js';
import { bass, Drum, drums, STEPS } from './groove.js';
import { generateMotif, motifAt, varyMotif } from './motif.js';
import { FAST_BPM, FEEL_MARGIN, moodFrom, QUIET, SLOW_BPM, snowy, TempoScale, tempoScore } from './mood.js';
import { CYCLE_BARS, nextChoices, nextSectionBar, section } from './arrangement.js';
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
/** Every this many bars the key may move (half the time). */
const KEY_CHANGE_BARS = 32;
/** Energy and zoom follow the view with this time constant, so the band changes smoothly but soon. */
const SMOOTH_SECONDS = 2;
/** Share of the way a part's level moves towards on/off every sixteenth: about a beat to fade. */
const FADE_PER_STEP = 0.25;
/** Below this level a fading part is silent. */
const AUDIBLE = 0.05;
/** Share of the way the tempo moves towards the view's every beat (there in about a bar), gliding. */
const TEMPO_FOLLOW = 0.5;
/** A bigger gap than this (BPM), e.g. after a jump across the map, closes almost at once. */
const TEMPO_LEAP = 10, TEMPO_LEAP_FOLLOW = 0.85;
/** At most one view-change transition per this many bars. */
const JUMP_EVERY_BARS = 4;
const PARTS = ['drums', 'bass', 'pad', 'lead', 'layer'];
/** Off-beat sixteenths are played this share of a sixteenth late: a light swing. */
const SWING = 0.28;
/** Melodic fill on the last beat of a fill bar: chord tones going up. */
const FILL_RUN = [0, 2, 4, 7];

export class MusicEngine {
  /** @param light lighter band for phones (see instruments.js) */
  constructor(Tone = globalThis.Tone, { light = false } = {}) {
    this.Tone = Tone;
    this.light = light;
    this.started = false;
    /** The pending start, shared by every caller until it succeeds or fails. */
    this.starting = null;
    this.muted = false;
    this.mood = QUIET;
    this.barMood = QUIET;
    this.beatMood = QUIET;
    /** Smoothed energy and zoom. */
    this.live = { energy: QUIET.energy, zoomIn: QUIET.zoomIn };
    /** Fading level per part, 0..1. */
    this.levels = Object.fromEntries(PARTS.map(part => [part, 0]));
    /** Position in the song form; jumps ahead on a big view change. */
    this.formBar = 0;
    this.jumpPending = false;
    this.lastJumpBar = -JUMP_EVERY_BARS;
    this.lastKeyChangeBar = 0;
    this.bpm = QUIET.bpm;
    this.tempoScale = new TempoScale();
    /** 'slow', 'mid' or 'fast', from the tempo; changes on bar lines. */
    this.feel = 'mid';
    this.motif = null;
    this.step = 0;
    this.cityHits = [];
    this.lastPlayed = new Map();
    this.lastPassedStopStep = -100;
    this.random = Math.random;
    this.choices = { pattern: 0, riff: 0, lead: 'piano', key: makeKey() };
    this.section = section(0);
  }

  /**
   * Starts the audio. Must be called directly from a tap, click or key press: phones only unlock audio
   * inside a completed gesture. If the browser refuses, the next call tries again.
   */
  start() {
    if (this.started) return Promise.resolve();
    this.starting ??= this.startOnce().catch(error => {
      this.starting = null;
      throw error;
    });
    return this.starting;
  }

  async startOnce() {
    const Tone = this.Tone;
    // iPhones mute web audio with the silent switch unless the page asks to be a media player
    // (Safari 16.4+). Set before resuming the audio, still inside the gesture.
    try {
      if (globalThis.navigator?.audioSession) navigator.audioSession.type = 'playback';
    } catch {
      // Not supported: nothing to do.
    }
    await Tone.start();
    if (Tone.getContext().state !== 'running') throw new Error('audio is still locked by the browser');
    // A visitor may have pressed Mute before the sound started.
    Tone.getDestination().mute = this.muted;
    this.band ??= createBand(Tone, { light: this.light });
    const transport = Tone.getTransport();
    transport.bpm.value = this.bpm;
    transport.scheduleRepeat(time => this.tick(time), '16n');
    transport.start('+0.1');
    this.started = true;
    console.info('Music started', this.light ? '(light band)' : '');
  }

  /**
   * Call about once per second with the figures for the vehicles in view, the weather, the sky and the
   * view itself ({ zoom }).
   */
  update(city, weather, sky, view = {}) {
    const score = tempoScore(city);
    this.tempoScale.add(score);
    // An empty view (open sea, say) keeps the last tempo instead of falling to the middle.
    if (!Number.isNaN(score)) this.tempo = this.tempoScale.position(score);
    this.mood = moodFrom(city, weather, sky, this.mood.minor, { ...view, tempo: this.tempo ?? 0.5 });
  }

  /**
   * Call when the view changed a lot (zoomed a level or more, or moved to another area): the current bar
   * ends with a drum fill and the next section starts on the next bar, with fresh choices.
   */
  viewChanged() {
    if (!this.started) return;
    if (Math.floor(this.step / STEPS) - this.lastJumpBar >= JUMP_EVERY_BARS) this.jumpPending = true;
  }

  /**
   * Call for every vehicle event in view; the notes it causes are played on the next beat subdivision.
   * @param where { pan: -1..1 (left..right on screen), height: 0..1 (top..bottom) }
   */
  onVehicleEvent(event, where = { pan: 0, height: 0.5 }) {
    if (!this.started || this.muted) return;
    if (event.type !== EventType.DOORS_OPENED && event.type !== EventType.TRAFFIC_LIGHT_GRANTED
      && event.type !== EventType.PASSED_STOP) return;
    if (this.cityHits.length < MAX_QUEUED) {
      this.cityHits.push({ type: event.type, mode: event.vehicle.mode, timeMillis: event.timeMillis, ...where });
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
   * What the music is doing right now, for display. Before the sound starts it shows what the view would
   * play (the mood is calculated from the live data either way).
   */
  status() {
    const m = this.started ? this.barMood : this.mood;
    const key = makeKey(this.choices.key.tonic, m.minor, this.choices.key.progressionIndex);
    const energy = this.started ? this.live.energy : m.energy;
    return { started: this.started, bpm: this.started ? this.bpm : m.bpm, minor: m.minor, energy,
      night: m.night, weather: m.weather, muted: this.muted, keyName: keyName(key), section: this.section.name };
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
    if (s % 4 === 0) this.startBeat(time);
    this.fadeParts();
    if (this.muted) return;
    if (s % 4 === 0) this.mark(Cue.BEAT, time);
    // Swing: every off-beat sixteenth a little late.
    if (s % 2 === 1) time += SWING * 15 / this.bpm;

    const m = this.beatMood, sec = this.section, key = this.key, level = this.levels;
    const fill = sec.fill || this.jumpPending;
    if (fill && s >= 12 && level.drums > AUDIBLE) {
      this.play('marimba', pitch(chordRoot(bar, key) + FILL_RUN[s - 12], key, 1), 60 * level.drums, 1, time);
    }
    for (const hit of drums(s, bar, m, this.choices.pattern, { drums: level.drums > AUDIBLE, fill })) {
      // The rain shaker keeps playing while the drums rest.
      const fade = hit.drum === Drum.SHAKER ? 1 : level.drums;
      this.drum(hit.drum, hit.velocity * this.drumLevel(m) * fade, time);
    }
    if (level.bass > AUDIBLE) {
      for (const note of bass(m, this.choices.riff)) {
        if (note.step === s) this.play('bass', pitch(chordRoot(bar, key) + note.degree, key, -1), 100 * level.bass, note.length, time);
      }
    }
    if (level.lead > AUDIBLE && this.leadPlays(bar, m)) {
      const voice = snowy(m) ? 'celesta' : this.choices.lead;
      const root = chordRoot(bar, key);
      for (const note of motifAt(this.motif, (bar % 2) * STEPS + s)) {
        // Slow tempo: only the notes on eighths, held twice as long.
        if (m.feel === 'slow' && note.step % 2 !== 0) continue;
        const length = m.feel === 'slow' ? Math.min(note.length * 2, 8) : note.length;
        // Strong beats are chord tones; the notes in between keep to the pentatonic scale.
        const degree = note.step % 4 === 0 ? note.degree : pentatonic(note.degree, root, key);
        const velocity = note.velocity * level.lead * 0.85;
        this.play(voice, pitch(root + degree, key, 1), velocity, length, time);
        // Fast tempo: a long note gets a quick neighbour an eighth later.
        if (m.feel === 'fast' && note.length >= 3) {
          const extra = pentatonic(degree + 1, root, key);
          this.play(voice, pitch(root + extra, key, 1), velocity * 0.7, 1, time + 30 / this.bpm);
        }
      }
    }
    if (level.layer > AUDIBLE) this.playLayer(s, bar, m, time, level.layer);
    this.playCityHits(s, bar, m, time);
  }

  /**
   * Every beat: the tempo glides towards the view's (about a bar to get there, a beat for a big leap);
   * energy and zoom move a little towards the view's; the rest of the mood is current.
   */
  startBeat(time) {
    const beatSeconds = 60 / this.bpm;
    const gap = this.mood.bpm - this.bpm;
    this.bpm += gap * (Math.abs(gap) > TEMPO_LEAP ? TEMPO_LEAP_FOLLOW : TEMPO_FOLLOW);
    this.Tone.getTransport().bpm.rampTo(this.bpm, beatSeconds * 0.9, time);

    const k = 1 - Math.exp(-beatSeconds / SMOOTH_SECONDS);
    this.live.energy += (this.mood.energy - this.live.energy) * k;
    this.live.zoomIn += (this.mood.zoomIn - this.live.zoomIn) * k;
    this.beatMood = { ...this.mood, minor: this.barMood.minor, ...this.live, feel: this.feel };
  }

  /** The tempo's feel, with a margin so it doesn't flip back and forth around a boundary. */
  nextFeel() {
    const bpm = this.bpm, m = FEEL_MARGIN;
    if (this.feel === 'slow') return bpm > SLOW_BPM + m ? (bpm > FAST_BPM ? 'fast' : 'mid') : 'slow';
    if (this.feel === 'fast') return bpm < FAST_BPM - m ? (bpm < SLOW_BPM ? 'slow' : 'mid') : 'fast';
    return bpm < SLOW_BPM - m ? 'slow' : bpm > FAST_BPM + m ? 'fast' : 'mid';
  }

  /** Every sixteenth: each part's level moves towards on or off for the current section. */
  fadeParts() {
    for (const part of PARTS) {
      const target = this.section[part] ? 1 : 0;
      this.levels[part] += (target - this.levels[part]) * FADE_PER_STEP;
    }
  }

  startBar(bar, time) {
    this.barMood = this.mood;
    const m = this.barMood;
    this.feel = this.nextFeel();

    // A big view change (after its fill) jumps to the next section with fresh choices.
    const jumped = this.jumpPending && bar > 0;
    if (jumped) {
      this.formBar = nextSectionBar(this.formBar);
      this.jumpPending = false;
      this.lastJumpBar = bar;
    }
    // A new cycle or a jump: new drum pattern, bass riff, lead voice and progression; sometimes a new key.
    if (jumped || this.formBar % CYCLE_BARS === 0) {
      const changeKey = !jumped && bar - this.lastKeyChangeBar >= KEY_CHANGE_BARS && this.random() < 0.5;
      if (changeKey) this.lastKeyChangeBar = bar;
      this.choices = nextChoices(bar === 0 ? null : this.choices, this.random, { minor: m.minor, changeKey });
      this.motif = generateMotif(this.random);
    } else if (this.formBar % 4 === 0) {
      this.motif = varyMotif(this.motif, this.random);
    }
    // The key's mode follows the view's punctuality at every bar; the progression keeps its place.
    this.key = makeKey(this.choices.key.tonic, m.minor, this.choices.key.progressionIndex);
    this.section = section(this.formBar);
    this.formBar++;

    const live = this.beatMood;
    const ambience = m.weather === WeatherKind.FOG ? 110 : 45 + 50 * m.night + 20 * live.zoomIn;
    this.band.setColour(Math.min(127, ambience), 30 + 70 * m.golden, time);

    if (this.muted) return;
    // A little sparkle opens the full section, or marks a jump.
    const opens = (this.section.name === 'full' && this.section.first) || jumped;
    if (opens && m.night < 0.5) this.sparkle(bar, 55, time);
    if (this.section.pad) {
      const velocity = (40 + 25 * m.golden) * (1 - 0.3 * live.zoomIn);
      for (const p of chord7(bar, this.key, 0)) this.play('pad', p + 12, velocity, STEPS, time);
    }
  }

  /** Quieter drums when zoomed in, so single vehicles stand out. */
  drumLevel(m) {
    return 1 - 0.35 * m.zoomIn;
  }

  /** Rarely at night; otherwise whenever the section has a melody. */
  leadPlays(bar, m) {
    if (m.night > 0.5) return Math.floor(bar / 16) % 2 === 1;
    return true;
  }

  /**
   * The layer of the vehicle types in view: trams -> vibraphone arpeggios, trains and metro -> long string
   * chords, buses -> marimba off-beat stabs; ferries add a bell now and then. Only the dominant kind plays.
   */
  playLayer(s, bar, m, time, level = 1) {
    // Fades out as the view empties instead of stopping at a threshold.
    const v = level * Math.min(1, m.energy / 0.15);
    if (v < AUDIBLE) return;
    const { bus, tram, rail, ferry } = m.mix;
    const chord = triad(bar, this.key, 1);
    if (ferry > 0.04 && s === 0 && bar % 4 === 0) this.play('bells', chord[0], 50 * v, 8, time);
    if (tram >= rail && tram >= bus && tram > 0.2) {
      if (s % 2 === 0) this.play('vibraphone', chord[(s / 2) % 3] + (s >= 8 ? 12 : 0), 42 * v, 2, time);
    } else if (rail >= bus && rail > 0.2) {
      if (s === 0) for (const p of triad(bar, this.key, 0)) this.play('strings', p, 38 * v, STEPS, time);
    } else if (s % 4 === 2) {
      for (const p of chord) this.play('marimba', p, 34 * v, 1, time);
    }
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
          this.ding(bar, hit.pan, time);
          this.mark(Cue.GREEN_LIGHT, time);
          accentPlayed = true;
        }
      } else if (hit.type === EventType.PASSED_STOP) {
        if (this.step - this.lastPassedStopStep >= 4) {
          this.sparkle(bar, 45, time);
          this.mark(Cue.SKIPPED_STOP, time);
          this.lastPassedStopStep = this.step;
        }
      } else if (s % 2 !== 0 || played >= 2) {
        keep.push(hit); // doors wait for the next eighth note
      } else {
        this.playDoorNote(hit, bar, m, time);
        played++;
      }
    }
    this.cityHits = keep;
  }

  /** Green light: a cheerful two-note ding (root, then the fifth above). */
  ding(bar, pan, time) {
    const [root, , fifth] = triad(bar, this.key, 2);
    const gap = 15 / this.bpm; // a sixteenth
    this.play('chime', root, 60, 1, time);
    this.play('chime', fifth, 55, 2, time + gap);
  }

  /** A tiny upward sparkle: the chord's notes, high and quick. */
  sparkle(bar, velocity, time) {
    const gap = 7.5 / this.bpm; // a thirty-second
    triad(bar, this.key, 3).forEach((p, i) => this.play('chime', p, velocity - i * 6, 1, time + i * gap));
  }

  /** Pitched higher for vehicles in the north of the view, panned to their side of the screen. */
  playDoorNote(hit, bar, m, time) {
    const chord = triad(bar, this.key, 0);
    const note = chord[Math.floor(this.random() * chord.length)];
    const octave = hit.height < 0.33 ? 12 : hit.height > 0.66 ? -12 : 0;
    // Zoomed in, each vehicle is louder and rings longer.
    const boost = 15 * m.zoomIn - 10, longer = 1 + m.zoomIn;
    switch (hit.mode) {
      case 'tram': this.play('vibraphone', note + 24 + octave, 80 + boost, 4 * longer, time, hit.pan); this.mark(Cue.TRAM_DOORS, time); break;
      case 'train':
      case 'metro': this.play('strings', note + Math.min(octave, 0), 60 + boost, 8 * longer, time, hit.pan); this.mark(Cue.TRAIN_DOORS, time); break;
      case 'ferry': this.play('bells', note + 12 + octave, 75 + boost, 8 * longer, time, hit.pan); this.mark(Cue.FERRY_DOORS, time); break;
      default: this.play('marimba', note + 12 + octave, 85 + boost, 2 * longer, time, hit.pan); this.mark(Cue.BUS_DOORS, time);
    }
  }

  play(voice, midi, velocity, lengthSteps, time, pan = 0) {
    const duration = lengthSteps * 60 / this.bpm / 4;
    this.band.note(voice, midi, this.humanize(velocity), duration, time, pan);
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
