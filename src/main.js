// Entry point: wires the data clients, the MapLibre map, the p5 overlay sketch and the music.
//
// Each frame (p5 draw): drain vehicle events (-> music) -> once per second take a city snapshot (-> music)
// -> crossfade the map by daylight -> on the transparent canvas draw dimming, sky glow, trails, vehicles,
// weather and panels.

import { VehicleRegistry, EMPTY_SNAPSHOT } from './hfp/registry.js';
import { HslMqttClient } from './hfp/mqttClient.js';
import { basemapFromUrl, mapStyle, setDaylight } from './map/basemap.js';
import { mapProjector } from './map/projection.js';
import { drawTrails } from './map/trails.js';
import { nextSkyPreview, skyNow, skyPreview } from './sky/sky.js';
import { WeatherClient, WEATHER_ATTRIBUTION } from './weather/weatherClient.js';
import { kindLabel, nextWeatherPreview, previewWeather } from './weather/weather.js';
import { MusicEngine } from './music/engine.js';
import { drawStatsPanel, STATS_WIDTH } from './ui/statsPanel.js';
import { drawClock } from './ui/clock.js';
import { drawLegend } from './ui/legend.js';
import { drawWeatherCard, WEATHER_WIDTH } from './ui/weatherCard.js';
import { drawSoundPanel } from './ui/soundPanel.js';
import { drawSky } from './ui/skyLayer.js';
import { WeatherLayer } from './ui/weatherLayer.js';
import { font } from './ui/overlay.js';
import { CARD } from './theme.js';

const HELSINKI = { lat: 60.192059, lon: 24.945831 };
/** Java's Unfolding zoom 13 on 256 px tiles = MapLibre zoom 12 (512 px tiles). */
const ZOOM = 12, MIN_ZOOM = 2, MAX_ZOOM = 14;
/** Like Unfolding's panning restriction: the map centre stays within this distance of Helsinki. */
const MAX_PAN_KM = 10;
const MAP_DIM_NIGHT = 110, MAP_DIM_DAY = 25;
const SNAPSHOT_EVERY_MILLIS = 1000;

// ------------------------------------------------------------------ data

const registry = new VehicleRegistry();
const mqttClient = new HslMqttClient(registry);
mqttClient.start();
const weatherClient = new WeatherClient();
weatherClient.start();
const music = new MusicEngine();

// ------------------------------------------------------------------ map

const basemap = basemapFromUrl();
const map = new maplibregl.Map({
  container: 'map',
  style: mapStyle(basemap),
  center: [HELSINKI.lon, HELSINKI.lat],
  zoom: ZOOM,
  minZoom: MIN_ZOOM,
  maxZoom: MAX_ZOOM,
  attributionControl: false, // credits are drawn by the sketch, like the Java app
  dragRotate: false,
  pitchWithRotate: false,
  touchPitch: false,
});
map.touchZoomRotate.disableRotation();
map.on('moveend', () => keepNearHelsinki(map));
// MapLibre measures its container once at creation; keep its canvas in step with the window.
map.on('load', () => map.resize());
window.addEventListener('resize', () => map.resize());

// ------------------------------------------------------------------ sketch state

const state = {
  city: EMPTY_SNAPSHOT,
  eventCounts: new Map(),
  eventRates: new Map(),
  messageRate: 0,
  lastMessageCount: 0,
  lastSnapshotAt: 0,
  nextSnapshotAt: 0,
  showHud: true,
  /** Set with W to preview each weather effect; null shows the live weather. */
  weatherPreview: null,
  /** Set with T to preview sunrise, day, sunset and night; null follows the real sun. */
  skyPreview: null,
  sky: skyNow(),
};

/** The weather to show: a preview while one is selected with W, otherwise the latest from Open-Meteo. */
function weather() {
  return state.weatherPreview ? previewWeather(state.weatherPreview) : weatherClient.current;
}

// Handy from the browser console when debugging.
window.buslife = { map, registry, music, state };

new p5(p => {
  let weatherLayer;

  p.setup = () => {
    p.createCanvas(p.windowWidth, p.windowHeight);
    weatherLayer = new WeatherLayer(p);
  };

  p.windowResized = () => p.resizeCanvas(p.windowWidth, p.windowHeight);

  p.draw = () => {
    updateData(p.millis());
    state.sky = state.skyPreview ? skyPreview(state.skyPreview) : skyNow();
    const daylight = state.sky.daylight;
    setDaylight(map, daylight);

    p.clear();
    drawMap(p, daylight);
    weatherLayer.draw(weather(), daylight);
    if (state.showHud) {
      drawStatsPanel(p, 16, 16, state.city, state.eventRates, state.messageRate, basemap.name);
      drawWeatherCard(p, p.width - 16, 16, weather(), state.sky);
      // Big Helsinki and local time, between the stats panel and the weather card.
      const clockLeft = 16 + STATS_WIDTH, clockRight = p.width - 16 - WEATHER_WIDTH;
      drawClock(p, (clockLeft + clockRight) / 2, 16, clockLeft, clockRight);
      drawLegend(p, 16, p.height - 16);
      // Bottom right, above the credit line.
      drawSoundPanel(p, p.width - 16, p.height - 32, music);
    }
    drawAttribution(p);
  };

  // 'h' hides every overlay, 'w' cycles weather previews, 't' time-of-day previews, 'm' mutes,
  // 'f' toggles fullscreen.
  p.keyPressed = () => {
    const key = p.key.toLowerCase();
    if (key === 'h') {
      toggleHud();
    } else if (key === 'w') {
      state.weatherPreview = nextWeatherPreview(state.weatherPreview);
      console.info('Weather preview:', state.weatherPreview ? kindLabel(state.weatherPreview) : 'off (live)');
    } else if (key === 't') {
      state.skyPreview = nextSkyPreview(state.skyPreview);
      console.info('Time of day preview:', state.skyPreview ? state.skyPreview.label : 'off (live)');
    } else if (key === 'm') {
      toggleMute();
    } else if (key === 'f') {
      p.fullscreen(!p.fullscreen());
    }
  };
}, document.getElementById('sketch'));

// ------------------------------------------------------------------ controls

// Buttons for the two things every visitor should find: muting and hiding the graphics. They mirror the
// M and H keys and work on touch screens.
const muteButton = document.getElementById('mute-button');
const hudButton = document.getElementById('hud-button');
muteButton.addEventListener('click', () => toggleMute());
hudButton.addEventListener('click', () => toggleHud());
refreshControls();

function toggleMute() {
  music.toggleMute();
  refreshControls();
}

function toggleHud() {
  state.showHud = !state.showHud;
  refreshControls();
}

function refreshControls() {
  muteButton.innerHTML = `${music.muted ? '🔇 Unmute' : '🔊 Mute'} <kbd>M</kbd>`;
  hudButton.innerHTML = `${state.showHud ? 'Hide panels' : 'Show panels'} <kbd>H</kbd>`;
}

// Browsers only allow sound after a user gesture: the first click or key press starts the music.
const startCard = document.getElementById('start');
const startSound = () => {
  startCard.hidden = true;
  music.start().catch(error => console.warn('Music unavailable:', error.message));
};
startCard.addEventListener('click', startSound, { once: true });
window.addEventListener('keydown', startSound, { once: true });
window.addEventListener('pointerdown', startSound, { once: true });

// ------------------------------------------------------------------ per frame

function updateData(now) {
  for (const event of registry.drainEvents()) {
    state.eventCounts.set(event.type, (state.eventCounts.get(event.type) ?? 0) + 1);
    music.onVehicleEvent(event);
  }
  if (now >= state.nextSnapshotAt) {
    state.city = registry.snapshot();
    const seconds = Math.max(now - state.lastSnapshotAt, 1) / 1000;
    state.eventRates = new Map([...state.eventCounts].map(([type, count]) => [type, count / seconds]));
    state.eventCounts.clear();
    state.messageRate = (mqttClient.messageCount - state.lastMessageCount) / seconds;
    state.lastMessageCount = mqttClient.messageCount;
    state.lastSnapshotAt = now;
    state.nextSnapshotAt = now + SNAPSHOT_EVERY_MILLIS;
    music.update(state.city, weather(), state.sky);
  }
}

/** Dims the basemap, adds the sky colours, then draws every trail before any vehicle. */
function drawMap(p, daylight) {
  p.noStroke();
  p.fill(0, p.lerp(MAP_DIM_NIGHT, MAP_DIM_DAY, daylight));
  p.rect(0, 0, p.width, p.height);
  drawSky(p, state.sky);
  const project = mapProjector(map);
  const now = Date.now();
  const vehicles = [...registry.vehicles.values()];
  drawTrails(p.drawingContext, vehicles, project, now);
  for (const vehicle of vehicles) vehicle.drawBody(p, project, now, daylight);
}

/** Required by the tile and weather providers' terms; keep it visible. */
function drawAttribution(p) {
  p.push();
  font(p, 12);
  p.textAlign(p.RIGHT, p.BOTTOM);
  const credit = `${basemap.attribution}  ·  ${WEATHER_ATTRIBUTION}`;
  // A small dark pill keeps it readable on the night map, the day map and everything in between.
  const w = p.textWidth(credit) + 12, h = 18;
  p.noStroke();
  p.fill(CARD[0], CARD[1], CARD[2], 150);
  p.rect(p.width - w - 4, p.height - h - 4, w, h, 4);
  p.fill(255, 170);
  p.text(credit, p.width - 10, p.height - 7);
  p.pop();
}

function keepNearHelsinki(m) {
  const center = m.getCenter();
  const kmPerDegLat = 111.32, kmPerDegLon = 111.32 * Math.cos(HELSINKI.lat * Math.PI / 180);
  const dy = (center.lat - HELSINKI.lat) * kmPerDegLat, dx = (center.lng - HELSINKI.lon) * kmPerDegLon;
  const distance = Math.hypot(dx, dy);
  if (distance <= MAX_PAN_KM) return;
  const scale = MAX_PAN_KM / distance;
  m.easeTo({ center: [HELSINKI.lon + dx * scale / kmPerDegLon, HELSINKI.lat + dy * scale / kmPerDegLat], duration: 300 });
}
