# BusLife (web)

BusLife in the browser: every bus, tram, metro, train and ferry in Helsinki, live, drawn as animated dots
on a map that follows the real sun and weather, playing generative music that the city performs.

It is a port of the Java/Processing app in this repository to **p5.js**, with the same visuals, panels,
data mapping and music. It is a static site: no server, no build step, no API keys. Each visitor's browser
connects directly to HSL's live feed and to Open-Meteo.

How it works inside: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Run it locally

ES modules need to be served over HTTP (opening `index.html` as a file does not work). From this folder:

```bash
python -m http.server 8765
```

Then open <http://localhost:8765>. Click, tap or press any key to start the sound; browsers do not allow
audio before a user gesture. On an iPhone the sound plays even with the silent switch on (Safari 17+).

Any static server works the same way (`npx serve`, VS Code Live Server, …).

## Keys

| Key | Action |
|---|---|
| `H` | hide or show all panels |
| `W` | cycle weather previews (clear → … → thunderstorm → live) |
| `T` | cycle time-of-day previews (sunrise → day → sunset → night → live) |
| `M` | mute / unmute the music |
| `F` | toggle fullscreen |

Mouse: drag to pan, scroll to zoom. Touch: drag and pinch. The map stays inside the HSL service area
(Kirkkonummi to Sipoo, the coast to Kerava) and zooms out no further than about the whole city.

**What you see is what you hear.** Only the vehicles in view (plus half a screen around it, so panning
shows them at once) are received, drawn and counted: the statistics, the tempo, the groove and the city
voices all describe the part of the city on screen. Zoomed in on a few streets the band thins out and
each vehicle's notes stand out, panned left or right to where it is and higher near the top of the screen.

**On phones** the panels shrink to fit the screen and the band uses lighter instruments (an echo instead
of a reverb, fewer voices) so it plays without crackling. The page draws at 30 fps with shorter trails
and less weather, keeps the screen awake while the music plays, and resumes the sound after a call,
a screen lock or another app (or shows "Tap to resume the sound" when the phone insists on a tap).

Add `?debug` to the address (e.g. `https://obladioblada.github.io/buslifelive/?debug`) to see fps,
drawing time, audio state, messages per second and the last error on screen.

The **Mute** button at the bottom centre does the same as `M` and works on touch screens.

**⚙ Settings** next to it chooses which panels to show: clock and weather (big Helsinki and local time,
with local weather if the visitor allows location), statistics, how to read the map, and how to listen. All start hidden; each visitor's choice is remembered in their browser.

## Map style

Without configuration the map uses the keyless Esri dark and light gray canvases. To use CARTO
Dark Matter / Positron instead, get a free key at <https://carto.com/basemaps/apikey> and add it to the
URL: `http://localhost:8765/?carto=YOUR_KEY`. (CARTO keys are meant for browsers; restrict yours to your
site's domain in the CARTO dashboard.)

## Tests

The data, sky, weather and music logic are plain JavaScript modules, tested with Node's built-in test
runner (Node 20+, no dependencies to install):

```bash
npm test
```

## Deploy

The `web/` folder is the whole site. Copy it to any static host:

- **GitHub Pages:** Pages can only publish the repository root or `/docs`, so either publish this folder
  with a small GitHub Actions workflow (`actions/upload-pages-artifact` with `path: web`), or copy its
  contents to a branch/folder Pages serves.
- **Netlify / Vercel / Cloudflare Pages:** set the publish directory to `web`, no build command.

## Libraries

Loaded from the jsDelivr CDN in `index.html`, pinned to exact versions:

| Library | Version | Used for |
|---|---|---|
| [p5.js](https://p5js.org) | 1.11.13 | drawing (the browser sibling of Processing) |
| [MapLibre GL JS](https://maplibre.org) | 5.24.0 | map tiles, pan and zoom |
| [MQTT.js](https://github.com/mqttjs/MQTT.js) | 5.16.0 | HSL live feed over WebSockets |
| [Tone.js](https://tonejs.github.io) | 15.1.22 | synthesized instruments and the music clock |

## Data and credits

- Vehicle positions: [HSL High-frequency positioning](https://digitransit.fi/en/developers/apis/5-realtime-api/vehicle-positions/high-frequency-positioning/),
  `wss://mqtt.hsl.fi` (public, no key).
- Weather: [Open-Meteo](https://open-meteo.com), CC BY 4.0.
- Map tiles: Esri, HERE, Garmin, © OpenStreetMap contributors (or © CARTO).

The credit line in the bottom-right corner is required by these providers; keep it visible.
