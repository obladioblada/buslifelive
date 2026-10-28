# How BusLife (web) works

This document explains the web version from the outside in: what is on screen, where the data comes
from, how one message from a bus becomes a dot, a glow and a note, and why the code is laid out the way
it is. The last section records the architecture decisions made while porting from Java, in order.

## 1. The picture

Four layers are stacked on the page, bottom to top:

```
 ┌──────────────────────────────────────────────────────────────┐
 │ #start   "Click to start the sound" card (HTML, hidden later)│
 │ #controls Mute / Hide panels buttons (HTML, always visible)  │
 │ #sketch  p5.js canvas, transparent, pointer-events: none     │
 │          dimming · sky glow · trails · vehicles · weather    │
 │          · stats panel · clock · weather card · legend       │
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
      mqttClient.js     MQTT over wss, subscribe, prune silent vehicles      ← HslMqttClient
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
    music/
      harmony.js        key of D, I–V–vi–IV / i–VI–III–VII, degree -> pitch  ← music/Harmony
      groove.js         16-step drum patterns, bass riffs                    ← music/Groove
      motif.js          2-bar looping melody                                 ← music/Motif
      mood.js           city + weather + sky -> tempo, energy, key           ← music/Mood
      rng.js            seedable random (reproducible melodies in tests)     (java.util.Random)
      instruments.js    the synthesized band (Tone.js)                       (Gervill GM channels)
      engine.js         the 16th-note scheduler and city voices              ← music/MusicEngine, Cue
    ui/
      overlay.js        card style, fonts, number formatting                 ← ui/Overlay, Fonts
      statsPanel.js     top-left: live numbers                               ← ui/StatsPanel
      clock.js          top-centre: big Helsinki and local time              (web only)
      weatherCard.js    top-right: weather                                   ← ui/WeatherCard
      weatherIcon.js    shape-drawn icons                                    ← ui/WeatherIcon
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
   marimba note (bus; tram = vibraphone, train = strings, ferry = bells) on a tone of the current chord,
   and the sound panel lights up the bus dot at the moment the note sounds.

## 5. The frame, in order

`p.draw()` in `main.js`, roughly 60 times a second:

1. drain vehicle events → counters and music engine; once a second: snapshot → stats panel and music mood;
2. compute the sky (real sun, or a `T` preview) → set the map's day-layer opacity;
3. `p.clear()`, then dim the map (stronger at night);
4. sky layer: deep-blue night tint, sunrise/sunset glow from the sun's side of the screen;
5. all trails, then all vehicles;
6. weather layer: clouds or fog, rain or snow, lightning, cold/warm tint;
7. panels (unless hidden with `H`): stats, big Helsinki/local clock, weather card, legend, sound panel;
   then the credit line. The Mute / Hide panels buttons are HTML above the canvas, so they are not part
   of the frame and stay visible when the panels are hidden.

## 6. The music

The engine (`music/engine.js`) is a small band that the city plays along with.

- **Clock.** Tone.js calls `tick(time)` every sixteenth note with an exact future audio timestamp. All
  notes are scheduled at that time, so rhythm stays tight even when drawing stutters.
- **Every bar** (16 steps) the engine reads the latest **mood** (`music/mood.js`):
  - tempo 90–124 BPM from the share of vehicles moving (eased, never jumping);
  - energy 0..1 from the number of vehicles on the road → how busy the drums and bass are;
  - **minor key** when the average delay exceeds 2 minutes (back to major below 90 s);
  - night → sparse rim-shot groove, simple bass, softer, more reverb;
  - sunrise/sunset → louder, more chorused pad;
  - weather → rain adds shaker and sixteenth hats, storms crashes and tom fills, snow switches the
    melody to celesta, fog drowns everything in reverb.
- **The band** (`music/instruments.js`), all synthesized: membrane kick and toms, noise snare/clap/shaker,
  metal hats and crash, square rim, sine claves, FM triangle; sawtooth mono bass; detuned-saw pad through a
  chorus; FM electric piano and celesta; FM marimba, vibraphone with tremolo, saw strings, FM bells.
- **Harmony** (`music/harmony.js`): D major I–V–vi–IV (D A Bm G), or D minor i–VI–III–VII (Dm B♭ F C),
  one chord per bar. Notes are written as scale degrees relative to the chord root, so the same pattern
  follows the progression and never clashes.
- **Melody** (`music/motif.js`): a two-bar motif with chord tones on strong beats and small steps
  between notes; it loops (that's what makes it catchy), changes one weak-beat note every 4 bars and is
  regenerated every 16. It plays every other 8 bars, always when the city is busy, rarely at night.
- **The city's voices.** Door openings are quantized to eighth notes (at most two per eighth, dropped if
  older than 1.5 s), granted traffic lights play claves, skipped stops a triangle (at most one per beat).
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
8. **Browser rules.** Sound starts after a click or key press (start card), fullscreen is on `F`, and the
   CARTO key moves to a URL parameter.
9. **Fixes found while testing in the browser:**
   - MapLibre measured its container too early and drew into a 400×300 canvas: it is now resized on load
     and on window resize.
   - p5 wraps the font family in quotes, so a CSS list like `"Segoe UI", Arial` became an invalid font
     and every size fell back to 12 px. `ui/overlay.js` picks the first installed family with
     `document.fonts.check` instead, like Java's `Fonts` class.
   - p5's `arc()` defaults to pie mode, which would draw the radii of the late arc: it uses `OPEN`.

## 10. Extending it

- **New vehicle effect:** add state to `Vehicle.update`/`onSignal` and draw it in `drawBody`; add a legend
  row in `ui/legend.js`.
- **New HFP event type:** subscribe in `mqttClient.js` (`EVENT_TYPES`), parse it in `parser.js`, add an
  `EventType`, and react in `registry.acceptSignal` / the music engine's `onVehicleEvent`.
- **Different sounds:** change the patches in `music/instruments.js`; the engine only calls
  `band.note(voice, midi, velocity, seconds, time)` and `band.drum(name, velocity, time)`.
- **Different music rules:** `music/mood.js` (what the city means musically), `music/groove.js`
  (patterns) and `music/harmony.js` (key and chords).
