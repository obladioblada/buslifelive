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
import { LocalWeather } from './weather/localWeather.js';
import { kindLabel, nextWeatherPreview, previewWeather } from './weather/weather.js';
import { MusicEngine } from './music/engine.js';
import { drawStatsPanel, STATS_WIDTH, statsHeight } from './ui/statsPanel.js';
import { clockSize, drawClock } from './ui/clock.js';
import { Layout } from './ui/layout.js';
import { MovableButtons } from './ui/movableButtons.js';
import { drawLegend, legendSize } from './ui/legend.js';
import { drawSoundPanel, SOUND_WIDTH, soundPanelHeight } from './ui/soundPanel.js';
import { drawSky } from './ui/skyLayer.js';
import { WeatherLayer } from './ui/weatherLayer.js';
import { BAR_HEIGHT, barWidth, drawBar, drawMinimize, font } from './ui/overlay.js';
import { CARD } from './theme.js';

const HELSINKI = { lat: 60.192059, lon: 24.945831 };
/** Java's Unfolding zoom 13 on 256 px tiles = MapLibre zoom 12 (512 px tiles). */
const ZOOM = 12, MIN_ZOOM = 8, MAX_ZOOM = 14;
/**
 * The HSL service area (Kirkkonummi to Sipoo, the coast to Kerava). MapLibre keeps the view inside it, so
 * you cannot pan away or zoom out past the whole region. (A hand-made "pull back to Helsinki" that called
 * easeTo() from a moveend handler re-entered MapLibre's render loop and froze the page on zoom-out.)
 */
const MAX_BOUNDS = [[24.3, 59.95], [25.6, 60.45]];
const MAP_DIM_NIGHT = 110, MAP_DIM_DAY = 25;
const SNAPSHOT_EVERY_MILLIS = 1000;
/** Panels the Settings menu can show; the choice is remembered under this localStorage key. */
const PANEL_NAMES = ['clock', 'stats', 'legend', 'sound'];
const PANELS_KEY = 'buslife.panels';
/** Titles shown on minimized panels. */
const PANEL_TITLES = { stats: 'Live traffic', clock: 'Clock and weather', legend: 'How to read the map', sound: 'How to listen' };
/** Mute button icons: speaker with sound waves, and speaker with a cross. */
const SPEAKER_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6.5 9H3v6h3.5L11 19z"/>'
  + '<path d="M15.5 8.8a4.5 4.5 0 0 1 0 6.4M18.4 6a8.5 8.5 0 0 1 0 12"/></svg>';
const MUTED_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6.5 9H3v6h3.5L11 19z"/>'
  + '<path d="m16 9.5 5 5M21 9.5l-5 5"/></svg>';

// ------------------------------------------------------------------ data

const registry = new VehicleRegistry();
const mqttClient = new HslMqttClient(registry);
mqttClient.start();
const weatherClient = new WeatherClient();
weatherClient.start();
/** The visitor's weather; the browser asks for their location on the first click or key press. */
const localWeather = new LocalWeather();
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
  maxBounds: MAX_BOUNDS,
  attributionControl: false, // credits are drawn by the sketch, like the Java app
  dragRotate: false,
  pitchWithRotate: false,
  touchPitch: false,
});
map.touchZoomRotate.disableRotation();
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
  /** The H key hides every panel at once without changing which ones are chosen. */
  showHud: true,
  /** Which panels are chosen in Settings; all start hidden for a clean map. */
  panels: loadPanels(),
  /** Set with W to preview each weather effect; null shows the live weather. */
  weatherPreview: null,
  /** Set with T to preview sunrise, day, sunset and night; null follows the real sun. */
  skyPreview: null,
  sky: skyNow(),
};

/** Weather lines under the clocks: Helsinki (as shown on the map, previews included) and the visitor's. */
function clockWeather() {
  const helsinki = weather();
  const local = localWeather.current;
  const messages = {
    idle: 'Click to see your weather',
    asking: 'Allow location to see your weather',
    denied: 'Location not shared',
    unavailable: 'Location not available',
    ready: 'Loading…',
  };
  return [
    helsinki ? { weather: helsinki, day: state.sky.daylight > 0.5 } : { message: 'Loading…' },
    local ? { weather: local, day: local.day } : { message: messages[localWeather.status] },
  ];
}

/** The weather to show: a preview while one is selected with W, otherwise the latest from Open-Meteo. */
function weather() {
  return state.weatherPreview ? previewWeather(state.weatherPreview) : weatherClient.current;
}

/** Where visitors dragged the panels; handles go in their own layer above the canvas. */
const layout = new Layout(document.getElementById('handles'));

// Handy from the browser console when debugging.
window.buslife = { map, registry, music, state, layout };

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
    drawPanels(p);
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

// Buttons for the two things every visitor should find: muting (also the M key) and choosing which panels
// to show. They work on touch screens. The H key still hides every panel at once.
const muteButton = document.getElementById('mute-button');
const settingsButton = document.getElementById('settings-button');
const settingsMenu = document.getElementById('settings-menu');
muteButton.addEventListener('click', () => toggleMute());

// Settings: one switch per panel.
settingsButton.addEventListener('click', () => setMenuOpen(!isMenuOpen()));
for (const box of settingsMenu.querySelectorAll('input[data-panel]')) {
  box.checked = state.panels[box.dataset.panel];
  box.addEventListener('change', () => {
    state.panels[box.dataset.panel] = box.checked;
    // Choosing a panel while H has hidden everything brings the panels back.
    if (box.checked) state.showHud = true;
    savePanels(state.panels);
    refreshControls();
  });
}
// Close the menu on Escape or a click elsewhere.
window.addEventListener('keydown', event => {
  if (event.key === 'Escape') setMenuOpen(false);
});
window.addEventListener('pointerdown', event => {
  if (isMenuOpen() && !settingsMenu.contains(event.target) && !settingsButton.contains(event.target)) setMenuOpen(false);
});
refreshControls();

// Both buttons can be dragged anywhere; by default they sit as a pair at the bottom centre.
const BUTTON_SIZE = 52, BUTTON_GAP = 12;
const movableButtons = new MovableButtons({
  mute: () => ({ x: innerWidth / 2 - BUTTON_GAP / 2 - BUTTON_SIZE, y: innerHeight - 22 - BUTTON_SIZE }),
  settings: () => ({ x: innerWidth / 2 + BUTTON_GAP / 2, y: innerHeight - 22 - BUTTON_SIZE }),
}, () => placeMenu());
movableButtons.add('mute', muteButton);
movableButtons.add('settings', settingsButton);

/** Opens the menu next to its button: above it, or below it when the button is near the top. */
function placeMenu() {
  const button = settingsButton.getBoundingClientRect();
  const width = settingsMenu.offsetWidth, height = settingsMenu.offsetHeight, gap = 12;
  const left = Math.max(8, Math.min(button.left + button.width / 2 - width / 2, innerWidth - width - 8));
  const above = button.top - gap - height;
  const top = above >= 8 ? above : Math.min(button.bottom + gap, innerHeight - height - 8);
  settingsMenu.style.left = `${Math.round(left)}px`;
  settingsMenu.style.top = `${Math.round(top)}px`;
}

function isMenuOpen() {
  return settingsMenu.dataset.open === 'true';
}

/** The menu fades and slides in and out (see style.css), so it is toggled with data-open, not hidden. */
function setMenuOpen(open) {
  if (open) placeMenu();
  settingsMenu.dataset.open = String(open);
  settingsButton.setAttribute('aria-expanded', String(open));
}

function toggleMute() {
  music.toggleMute();
  refreshControls();
}

function toggleHud() {
  state.showHud = !state.showHud;
  refreshControls();
}

function refreshControls() {
  const muted = music.muted;
  muteButton.innerHTML = muted ? MUTED_ICON : SPEAKER_ICON;
  muteButton.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
  muteButton.setAttribute('aria-pressed', String(muted));
  muteButton.dataset.tip = muted ? 'Unmute · M' : 'Mute · M';
}

/** The visitor's panel choices from an earlier visit; all hidden the first time. */
function loadPanels() {
  const panels = Object.fromEntries(PANEL_NAMES.map(name => [name, false]));
  try {
    const saved = JSON.parse(localStorage.getItem(PANELS_KEY) ?? '{}');
    for (const name of PANEL_NAMES) if (typeof saved[name] === 'boolean') panels[name] = saved[name];
  } catch {
    // Storage blocked (private window, strict settings): keep the defaults.
  }
  return panels;
}

function savePanels(panels) {
  try {
    localStorage.setItem(PANELS_KEY, JSON.stringify(panels));
  } catch {
    // Not remembered this time; the choice still applies until the page is closed.
  }
}

// Browsers only allow sound after a user gesture: the first click or key press starts the music.
const startCard = document.getElementById('start');
const liveCount = document.getElementById('live-count');
const startSound = () => {
  // Fade the start screen out, then take it out of the page.
  startCard.classList.add('leaving');
  setTimeout(() => { startCard.hidden = true; }, 500);
  localWeather.request();
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
    if (!startCard.hidden) liveCount.textContent = `${state.city.all.vehicles} vehicles on the road now`;
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

/**
 * The panels chosen in Settings, each at the place the visitor dragged it to, or at its default corner.
 * Every panel reports where it drew so its invisible drag handle can follow it.
 */
function drawPanels(p) {
  const show = state.showHud ? state.panels : {};
  const W = p.width, H = p.height;
  const started = music.status().started;
  // Exact sizes before drawing, so a panel is in the right place on its very first frame (opening or
  // minimizing used to show one frame drawn with the other state's size: a visible jump).
  const full = {
    stats: { w: STATS_WIDTH, h: statsHeight(state.city) },
    clock: clockSize(p),
    legend: legendSize(p),
    sound: { w: SOUND_WIDTH, h: soundPanelHeight(started) },
  };
  // Default top-left corners for a panel of a given size.
  const corner = {
    stats: () => ({ x: 16, y: 16 }),
    clock: size => ({ x: (W - size.w) / 2, y: 16 }),
    legend: size => ({ x: 16, y: H - 16 - size.h }),
    sound: size => ({ x: W - 16 - size.w, y: H - 32 - size.h }),
  };

  // Back to front: the panel moved last is drawn on top.
  for (const name of layout.sorted(Object.keys(full))) {
    if (!show[name]) {
      layout.placed(name, null);
      continue;
    }
    const sizes = { full: full[name], bar: { w: barWidth(p, PANEL_TITLES[name]), h: BAR_HEIGHT } };
    layout.setSizes(name, sizes);
    const hovered = layout.hovered === name;

    if (layout.isMinimized(name)) {
      const pos = layout.position(name, sizes.bar.w, sizes.bar.h, W, H) ?? corner[name](sizes.bar);
      layout.placed(name, drawBar(p, pos.x, pos.y, PANEL_TITLES[name], hovered));
      continue;
    }

    const size = sizes.full;
    const moved = layout.position(name, size.w, size.h, W, H);
    const pos = moved ?? corner[name](size);
    let rect;
    switch (name) {
      case 'stats':
        rect = drawStatsPanel(p, pos.x, pos.y, state.city, state.eventRates, state.messageRate, basemap.name);
        break;
      case 'clock': {
        // By default centred in the space the statistics panel leaves (scaling down if it is narrow);
        // once moved, it keeps its own place.
        const left = moved ? 0 : show.stats && !layout.positions.stats ? 16 + STATS_WIDTH : 0;
        const centerX = moved ? pos.x + size.w / 2 : (left + W) / 2;
        rect = drawClock(p, centerX, pos.y, left, W, clockWeather());
        break;
      }
      case 'legend':
        rect = drawLegend(p, pos.x, pos.y + size.h);
        break;
      case 'sound':
        rect = drawSoundPanel(p, pos.x + size.w, pos.y + size.h, music);
        break;
    }
    drawMinimize(p, rect, hovered);
    layout.placed(name, rect);
  }
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
