# How BusLife (web) works

This document explains the web version from the outside in: what is on screen, where the data comes
from, how one message from a bus becomes a dot, a glow and a note, and why the code is laid out the way
it is. The last section records the architecture decisions made while porting from Java, in order.

## 1. The picture

Four layers are stacked on the page, bottom to top:

```
 ┌──────────────────────────────────────────────────────────────┐
 │ #start   "Click / tap to start the sound" card (HTML, hidden) │
 │ #controls Mute / Settings buttons (HTML, always shown)       │
 │ #settings-menu  one switch per panel (HTML)                  │
 │ #sketch  p5.js canvas, transparent, pointer-events: none     │
 │          dimming · sky glow · trails · vehicles · weather    │
 │          · stats panel · clock and weather · legend          │
 │          · sound panel                                       │
 │ #map     MapLibre GL: night tiles + day tiles (opacity)      │
 └──────────────────────────────────────────────────────────────┘
```

- **MapLibre** only draws map tiles and handles pan and zoom. It has two raster layers, a dark (night)
  and a light (day) one; the day layer's opacity is the current daylight, so the map crossfades through
  dawn and dusk.
- **p5.js** draws everything else on a transparent canvas laid exactly over the map. The canvas ignores
  the mouse (`pointer-events: none`), so dragging and scrolling reach MapLibre underneath.
- Every frame, p5 asks MapLibre for its current centre and zoom and converts each vehicle's latitude and
  longitude to pixels with the same Web Mercator maths MapLibre uses (`src/map/projection.js`).

## 2. Where the data comes from

| Source | How | What |
|---|---|---|
| HSL High-frequency positioning | MQTT over WebSockets, `wss://mqtt.hsl.fi:443` | ~1,400 messages/s in the day: positions (`vp`) about once a second per vehicle, traffic light requests (`tlr`) and answers (`tla`), passed stops (`pas`) |
| Open-Meteo | `fetch()` every 10 minutes | temperature, rain/snow, cloud cover, wind, visibility, WMO weather code |
| Browser location (optional) | `navigator.geolocation`, asked on the first click or key press | the visitor's position, rounded to ~1 km and sent only to Open-Meteo for their local weather |
| The sun | computed locally (`src/sky/sun.js`) | elevation and compass direction of the sun over Helsinki, sunrise and sunset |

Nothing runs on a server. Both remote services allow browser connections from any website.

## 3. Module map

Each JavaScript module corresponds to a Java class or package of the original app.

```
web/
  index.html            page: map div, canvas div, start card, library <script>s, src/main.js
  style.css             stacking and the start card
  src/
    main.js             wiring + the p5 sketch (draw loop, keys)            ← Sketch.java
    theme.js            colours per mode, late/signal colours               ← theme/ThemeColors
    hfp/
      events.js         transport modes, event types                         ← TransportMode, VehicleEvent
      parser.js         topic + JSON -> position or signal                   ← HfpParser
      registry.js       live vehicles, event queue, city snapshot            ← VehicleRegistry, CitySnapshot
      mqttClient.js     MQTT over wss, subscribe by area, prune silent       ← HslMqttClient
      geohash.js        map area -> HFP topic geohash cells                  (new)
    map/
      vehicle.js        one vehicle: state machine + drawing                 ← HslVehicle
      trail.js          ring buffer of recent positions                      ← VehicleTrail
      basemap.js        tile URLs (Esri / CARTO), day+night style, crossfade ← Basemaps
      projection.js     lat/lon -> pixels for the current map view           (Unfolding did this)
    sky/
      sun.js            sun position, sunrise, sunset                        ← sky/Sun
      sky.js            daylight / golden / night / previews                 ← sky/Sky
    weather/
      weather.js        kinds, parser, intensity, compass, previews          ← Weather, WeatherKind, WeatherParser
      weatherClient.js  Open-Meteo polling                                   ← WeatherClient
      localWeather.js   visitor's weather: browser location (rounded ~1 km) -> Open-Meteo (web only)
    music/
      harmony.js        keys, four progressions per mode, degree -> pitch    ← music/Harmony
      arrangement.js    32-bar song form, choices that change every cycle    (new)
      groove.js         16-step drum patterns, bass riffs                    ← music/Groove
      motif.js          2-bar looping melody                                 ← music/Motif
      mood.js           view + weather + sky -> tempo, energy, key, mix      ← music/Mood
      rng.js            seedable random (reproducible melodies in tests)     (java.util.Random)
      instruments.js    the synthesized band (Tone.js)                       (Gervill GM channels)
      engine.js         the 16th-note scheduler and city voices              ← music/MusicEngine, Cue
    ui/
      overlay.js        card style, fonts, number formatting                 ← ui/Overlay, Fonts
      statsPanel.js     top-left: live numbers                               ← ui/StatsPanel
      clock.js          top-centre: big Helsinki and local time              (web only)
      weatherIcon.js    shape-drawn icons (clock card, sound panel)          ← ui/WeatherIcon
      legend.js         bottom-left: how to read the map                     ← ui/Legend
      soundPanel.js     bottom-right: how to listen                          ← ui/SoundPanel
      weatherLayer.js   rain, snow, clouds, fog, lightning                   ← ui/WeatherLayer
      skyLayer.js       sunrise/sunset glow, night tint                      ← ui/SkyLayer
  test/                 Node tests for the pure modules (npm test)
```

The modules under `hfp/`, `map/vehicle.js`, `sky/`, `weather/weather.js` and `music/` (except
`instruments.js` and `engine.js`) use no browser APIs, so Node can test them directly.

## 4. From one bus message to a dot, a glow and a note

Follow one position message from bus 731 through the app:

1. **Arrive.** mqtt.js receives `/hfp/v2/journey/ongoing/vp/bus/0012/02227/4731/...` with a JSON payload.
   `HslMqttClient.onMessage` decodes it and calls `parsePosition` (`hfp/parser.js`), which returns a
   plain object: vehicle key `0012/02227`, mode `bus`, position, speed (m/s), heading, delay (`dl`,
   negative when late, delays over 30 minutes treated as unknown), door state, occupancy.
2. **Update state.** `VehicleRegistry.accept` finds or creates the `Vehicle` (`map/vehicle.js`) and calls
   `vehicle.update(position, now)`. The vehicle compares old and new state and returns events:
   - speed rising above 1.5 m/s → `departed`; falling below 0.5 m/s → `stopped` (the gap stops GPS jitter
     from flapping);
   - door flag changing → `doorsOpened` / `doorsClosed`.

   It also records the previous position in its trail and starts a one-second **glide** from where it is
   drawn now to the new position, so movement is smooth even though positions arrive once a second.
3. **Queue events.** The registry appends `{ type, vehicle, timeMillis }` to its event queue (capped at
   10,000; the oldest are dropped if nobody drains it).
4. **Next frame.** `main.js` drains the queue: it counts events per type (for the "every second" figures)
   and hands each one to the music engine. Once per second it also takes a **city snapshot**: vehicles per
   mode, share moving, average speed and delay, doors open, share more than 3 minutes late.
5. **Draw.** `vehicle.drawBody` draws the dot at its glided position:
   - colour by mode; half transparent when standing still;
   - while the doors are open the dot grows (×2.2 at once, up to ×3.5 after 30 s of dwell time) with a
     halo and a ring when they first open; it shrinks back smoothly when they close;
   - a thin red clock-hand arc when late: a tick at 3 minutes, a full circle at 10;
   - a white flash for a granted traffic light, a thin ring for a request, a white streak behind the
     vehicle when it skips a stop;
   - on the light day map: a thin dark outline, and the white effects turn dark slate.

   `vehicle.drawTrail` draws the fading line through the last 12 seconds of positions. All trails are
   drawn before any vehicle so a trail never covers another vehicle.
6. **Play.** The music engine put the door event in its city queue. On the next eighth note it plays a
   marimba note (bus; tram = vibraphone, train = whistle, ferry = bells) on a tone of the current chord,
   and the sound panel lights up the bus dot at the moment the note sounds.

## 5. The frame, in order

`p.draw()` in `main.js`, roughly 60 times a second:

1. drain vehicle events → counters and music engine (vehicles in view only, with their screen position);
   once a second: snapshot of the vehicles in view → stats panel and music mood;
2. compute the sky (real sun, or a `T` preview) → set the map's day-layer opacity;
3. `p.clear()`, then dim the map (stronger at night);
4. sky layer: deep-blue night tint, sunrise/sunset glow from the sun's side of the screen;
5. all trails, then all vehicles (only those on screen);
6. weather layer: clouds or fog, rain or snow, lightning, cold/warm tint;
7. panels chosen in Settings (unless hidden with `H`): stats, big Helsinki/local clock with weather,
   legend, sound panel;
   then the credit line. The Mute and Settings buttons are HTML above the canvas, so they are not part
   of the frame and stay visible when the panels are hidden.

## 6. The music

The engine (`music/engine.js`) is a small band that the city plays along with.

- **Clock.** Tone.js calls `tick(time)` every sixteenth note with an exact future audio timestamp. All
  notes are scheduled at that time, so rhythm stays tight even when drawing stutters.
- **What's in view.** The mood, the statistics and the door notes only count vehicles on screen, so
  panning and zooming change the music. The registry keeps half a screen more on every side (that's what
  MQTT delivers, see "Receiving only the view" below).
- **Every bar** (16 steps) the engine reads the latest **mood** (`music/mood.js`):
  - tempo 65–125 BPM from how fast the view moves: 60% average speed (0–40 km/h), 40% share moving.
    The score is placed on the range of the views seen in the last 3 minutes (`TempoScale`), so the
    slowest recent view plays at 65 and the fastest at 125: every pan or zoom is audible. The tempo
    glides there every beat (about a bar; a leap of more than 10 BPM within a beat);
  - tempo feel: below 85 BPM half-time drums and long held melody notes, above 100 sixteenth brushes,
    the bouncy octave bass and extra melody notes (changes on bar lines, with a 3 BPM margin);
  - energy 0..1 from the number of vehicles in view (about 220 is a busy screen) → how busy the drums
    and bass are;
  - zoom → zoomed in on a few streets the drums and pad step back and each door note is louder and longer;
  - mix of modes in view → its own layer: tram vibraphone arpeggios, rail string chords, bus marimba
    stabs or a ferry bell;
  - **minor key** when the average delay exceeds 2 minutes (back to major below 90 s);
  - night → sparse rim-shot groove, simple bass, softer, more reverb;
  - sunrise/sunset → louder, more chorused pad;
  - weather → rain adds shaker and sixteenth hats, storms distant rumbling toms, snow switches the
    melody to celesta, fog drowns everything in reverb.
- **The band** (`music/instruments.js`), all synthesized in a cozy game style: a light kit (soft filtered
  kick, finger snap, wooden tock, brushed hats, shaker, soft toms; no claps or crashes), a round triangle
  bass, a warm filtered triangle pad playing seventh chords, leads (music box, kalimba, soft square with
  vibrato; celesta in snow), a chime for effects, and the city voices (marimba, vibraphone, sine whistle,
  bells). Everything goes through a warm master (low-pass, gentle compressor) and a short soft echo
  (plus a small room off phones). Off-beat sixteenths swing a little; drum fills are marimba runs.
- **Song form** (`music/arrangement.js`): a 16-bar cycle (about 35 s): intro (pad and bass), groove
  (+ drums and the mode layer), full (+ melody), breakdown (drums and bass drop out), with drum fills into
  full and breakdown. Every cycle picks a new drum pattern (stroll, lazy, hop, bounce), bass riff,
  lead (music box, kalimba, soft square) and chord progression; every 32 bars the key may move (D, F, C, G).
  A big change of view (a zoom level or more, or half a screen away; at most once per 4 bars) ends the
  bar with a fill and jumps to the next section with fresh choices.
- **Smooth, quick changes.** The view reaches the engine twice a second and right after every pan or
  zoom. Energy and zoom are smoothed over about 2 s and read every beat; each part fades in and out over
  about a beat instead of switching; extra drum hits (busy kicks, wooden tocks, ghost snaps, sixteenth brushes)
  grow in with energy; the tempo moves half the way every beat and glides.
- **Harmony** (`music/harmony.js`): four progressions per mode, e.g. I–V–vi–IV or vi–IV–I–V in major and
  i–IV–VII–IV in the "running late" minor, which is Dorian (dreamy rather than sad), one chord per bar. Notes are written as scale degrees relative to the chord root, so the same pattern
  follows the progression and never clashes.
- **Melody** (`music/motif.js`): a two-bar motif with chord tones on strong beats and small steps
  between notes; it loops (that's what makes it catchy), changes one weak-beat note every 4 bars and is
  regenerated every 16. It plays every other 8 bars, always when the city is busy, rarely at night.
- **The city's voices.** Door openings are quantized to eighth notes (at most two per eighth, dropped if
  older than 1.5 s), granted traffic lights play a two-note ding, skipped stops a quick upward sparkle (at most one per
  beat). The melody keeps to the pentatonic scale between chord tones.
  Each door note is panned to the vehicle's place on screen, an octave up in the top third and down in
  the bottom third.
- **Phones.** `new MusicEngine(Tone, { light: true })` builds the same band with an echo instead of a
  convolution reverb, no chorus, plain oscillators and at most 6 notes per instrument.
- **Starting.** Every click, tap (`touchend`, a completed gesture; phones ignore `pointerdown`) or key
  press tries `Tone.start()` until the audio context is really running; a failed try is not remembered.
  `navigator.audioSession.type = 'playback'` lets iPhones play with the silent switch on.
- **Sound panel cues.** `mark(cue, time)` schedules, with `Tone.getDraw()`, the moment the sound really
  plays, and the panel lights the matching row for 700 ms.

## 7. Performance notes

- ~1,100 vehicles in the day, each with up to 16 trail points, means ~15,000 projected points per frame.
  `projection.js` computes the view once per frame instead of calling `map.project()` per point.
- Rain (900 drops) and snow (600 flakes) are batched into one canvas path each.
- Clouds and fog are native canvas radial gradients and the sun glow a linear gradient; p5's `tint()`
  is avoided because it is slow on the 2D renderer.
- MQTT parsing runs on the main thread. If it ever costs frames, move `mqttClient.js` and `parser.js`
  into a Web Worker and post compact vehicle updates to the page.

## 8. Differences from the Java version

| Topic | Java | Web |
|---|---|---|
| Map | Unfolding, tiles drawn by Processing | MapLibre underneath a transparent p5 canvas |
| Zoom | 13 (256 px tiles) | 12 (MapLibre counts 512 px tiles); same view |
| Panning | centre within 10 km of Helsinki | view inside the HSL service area (`maxBounds`) |
| Feed | `tcp://mqtt.hsl.fi:1883` | `wss://mqtt.hsl.fi:443` (browsers cannot open TCP) |
| Threads | MQTT thread, music thread, render thread | one page thread; Tone.js schedules audio ahead on the audio clock |
| Instruments | General MIDI via Gervill (Windows GS sound set) | synthesized with Tone.js: same parts, different timbre |
| Sound start | immediately | after the first click or key press (browser rule) |
| CARTO key | `CARTO_API_KEY` environment variable | `?carto=KEY` in the URL |
| Fullscreen | always | `F` key (browsers require a gesture) |
| Display scaling | 150% Windows scaling made fullscreen too small | handled by the browser (canvas follows the device pixel ratio) |

## 9. Architecture decisions, step by step

These are the decisions in the order they were made while building the port.

1. **No build step.** Libraries come from a CDN as classic `<script>`s (globals `maplibregl`, `p5`, `mqtt`,
   `Tone`); the app is native ES modules. The folder can be served or hosted as-is, and the code reads
   like the Java original without tooling in between. Versions are pinned, and stable releases that had
   been out for a while were chosen (Tone.js' 15.5 line was still a pre-release).
2. **Keep the Java layering.** Data (`hfp/`), map objects (`map/`), sky, weather, music and UI stay
   separate, one module per Java class, so either version can be read against the other.
3. **Pure logic first, testable in Node.** Parsing, the registry, the vehicle state machine, the sun,
   weather parsing and the music theory have no browser dependencies. Drawing methods receive the p5
   instance as a parameter instead of using globals (p5 *instance mode*), and randomness that tests need
   to repeat goes through a seedable generator.
4. **Map underneath, canvas on top.** MapLibre does what it is best at (tiles, smooth pan/zoom); p5 does
   what the Java code already did. The only bridge is a projector built each frame from the map's centre
   and zoom. Rotation and tilt are disabled so the projection stays plain Web Mercator. A check in the
   browser showed it matches `map.project()` to 1/100 px.
5. **Day and night as two tile layers.** Instead of two map instances (as in Java), one map with two
   raster layers; daylight is the top layer's opacity.
6. **One thread is enough.** Without Java's threads, MQTT callbacks, drawing and the music share the
   page's main thread. Timing-critical audio is scheduled ahead on the Web Audio clock by Tone.js, so the
   beat stays steady regardless of frame time.
7. **Synthesized band.** Browsers have no General MIDI synth, so every GM program became a Tone.js patch;
   the patterns, harmony and city mapping are unchanged. (Sampled instruments, e.g. via `smplr`, are a
   drop-in alternative inside `instruments.js`.)
8. **Browser rules.** Sound starts after a click, tap or key press (start card), fullscreen is on `F`, and
   the CARTO key moves to a URL parameter.
9. **Fixes found while testing in the browser:**
   - MapLibre measured its container too early and drew into a 400×300 canvas: it is now resized on load
     and on window resize.
   - p5 wraps the font family in quotes, so a CSS list like `"Segoe UI", Arial` became an invalid font
     and every size fell back to 12 px. `ui/overlay.js` picks the first installed family with
     `document.fonts.check` instead, like Java's `Fonts` class.
   - p5's `arc()` defaults to pie mode, which would draw the radii of the late arc: it uses `OPEN`.
   - A hand-made "pull the centre back within 10 km of Helsinki" (Unfolding's panning restriction) called
     `easeTo()` from a `moveend` handler. Zooming out with the wheel moved the centre, the handler
     re-entered MapLibre's render loop ("Attempting to run(), but is already running") and the page froze.
     It is replaced by MapLibre's own `maxBounds` (the HSL service area), which also stops zooming out
     past the region.

10. **Receiving only the view** (mobile and view-driven music). Zoom out is limited to 11 (about the
    city). On every `moveend` the view plus half a screen on every side is covered with 0.1° HFP geohash
    cells (`60;24/19/#` = 60.1–60.2 N, 24.9–25.0 E; whole degrees above 48 cells), the client subscribes to
    the new cells and unsubscribes the old ones, and the registry drops vehicles outside the area.
    Traffic light and passed-stop signals stay city-wide (they are few and only count for tracked
    vehicles). That is roughly 100–300 messages/s instead of 1,400, which phones can handle.
11. **Mobile layout.** Canvas density at most 2×, panels scaled to fit narrow screens, the credit line on
    two lines, no page zoom or scroll (`touch-action: none`, `maximum-scale=1`): the map handles pinch.

## 10. Extending it

- **New vehicle effect:** add state to `Vehicle.update`/`onSignal` and draw it in `drawBody`; add a legend
  row in `ui/legend.js`.
- **New HFP event type:** subscribe in `mqttClient.js` (`EVENT_TYPES`), parse it in `parser.js`, add an
  `EventType`, and react in `registry.acceptSignal` / the music engine's `onVehicleEvent`.
- **Different sounds:** change the patches in `music/instruments.js`; the engine only calls
  `band.note(voice, midi, velocity, seconds, time)` and `band.drum(name, velocity, time)`.
- **Different music rules:** `music/mood.js` (what the city means musically), `music/groove.js`
  (patterns) and `music/harmony.js` (key and chords).
