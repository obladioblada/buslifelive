// Basemap tiles for MapLibre: a night (dark) and a day (light) style of the same map, stacked as two
// raster layers. Daylight is just the opacity of the day layer.

const ESRI = 'https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/';

/**
 * CARTO Dark Matter / Positron when a key is given as ?carto=KEY (free at https://carto.com/basemaps/apikey;
 * CARTO serves "API KEY REQUIRED" placeholder tiles without one), otherwise the keyless Esri gray canvases.
 */
export function basemapFromUrl(search = globalThis.location?.search ?? '') {
  const key = new URLSearchParams(search).get('carto');
  if (key) {
    const carto = style => `https://basemaps.cartocdn.com/rastertiles/${style}/{z}/{x}/{y}.png?key=${encodeURIComponent(key)}`;
    return { name: 'CARTO', night: carto('dark_all'), day: carto('light_all'),
      attribution: '© OpenStreetMap contributors, © CARTO' };
  }
  return { name: 'Esri Gray Canvas',
    night: ESRI + 'World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    day: ESRI + 'World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Esri, HERE, Garmin, © OpenStreetMap contributors' };
}

export function mapStyle(basemap) {
  const source = url => ({ type: 'raster', tiles: [url], tileSize: 256, maxzoom: 16 });
  return {
    version: 8,
    sources: { night: source(basemap.night), day: source(basemap.day) },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#1b1c1f' } },
      { id: 'night', type: 'raster', source: 'night', paint: { 'raster-fade-duration': 0 } },
      { id: 'day', type: 'raster', source: 'day', paint: { 'raster-opacity': 0, 'raster-fade-duration': 0 } },
    ],
  };
}

/** Crossfades night to day; only touches MapLibre when the value really changes. */
export function setDaylight(map, daylight) {
  const value = Math.round(daylight * 100) / 100;
  if (map.__daylight === value || !map.isStyleLoaded()) return;
  map.__daylight = value;
  map.setPaintProperty('day', 'raster-opacity', value);
}
