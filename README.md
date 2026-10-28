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

Then open <http://localhost:8765>. Click (or press any key) to start the sound; browsers do not allow
audio before a user gesture.

Any static server works the same way (`npx serve`, VS Code Live Server, …).

## Keys

| Key | Action |
|---|---|
| `H` | hide or show all panels |
| `W` | cycle weather previews (clear → … → thunderstorm → live) |
| `T` | cycle time-of-day previews (sunrise → day → sunset → night → live) |
| `M` | mute / unmute the music |
| `F` | toggle fullscreen |

Mouse: drag to pan, scroll to zoom. The map stays within 10 km of central Helsinki.

The **Mute** and **Hide panels** buttons at the bottom centre do the same as `M` and `H`. They stay
visible when the panels are hidden (as **Show panels**), and they work on touch screens.

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
