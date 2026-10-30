// HSL's location codes in HFP topics. After the event type a topic has nine levels (mode, operator,
// vehicle, route, direction, headsign, start time, next stop, geohash level), then the position:
//
//   .../60;24/19/51/05      60;24 = whole degrees (lat;lon), then one level per decimal place,
//                            each level = lat digit + lon digit: 19 -> 60.1x, 24.9x; 51 -> 60.15x, 24.91x
//
// So "60;24/19/#" matches every vehicle between 60.1–60.2 N and 24.9–25.0 E (checked live on
// 2026-10-30). The view is covered with these 0.1° cells (~11 km × 5.5 km).

const WILDCARDS = '+/+/+/+/+/+/+/+/+/';
/** Above this many 0.1° cells, subscribe to whole-degree cells instead. */
const MAX_FINE_CELLS = 48;

/** Position topics (`prefix` = ".../vp/") covering an area { south, west, north, east }. */
export function areaTopics({ south, west, north, east }, prefix) {
  const fine = cells(south, west, north, east, 0.1);
  if (fine.length <= MAX_FINE_CELLS) {
    return fine.map(([lat, lon]) => `${prefix}${WILDCARDS}${cellCode(lat, lon)}/#`);
  }
  return cells(south, west, north, east, 1).map(([lat, lon]) => `${prefix}${WILDCARDS}${Math.floor(lat)};${Math.floor(lon)}/#`);
}

/** "60;24/19" for the 0.1° cell whose south-west corner is (lat, lon). */
export function cellCode(lat, lon) {
  const degLat = Math.floor(lat + 1e-9), degLon = Math.floor(lon + 1e-9);
  const tenthLat = Math.floor((lat - degLat) * 10 + 1e-9), tenthLon = Math.floor((lon - degLon) * 10 + 1e-9);
  return `${degLat};${degLon}/${tenthLat}${tenthLon}`;
}

/** South-west corners of the `size`° cells overlapping the area. */
function cells(south, west, north, east, size) {
  const out = [];
  const start = v => Math.floor(v / size + 1e-9) * size;
  for (let lat = start(south); lat < north; lat = round(lat + size)) {
    for (let lon = start(west); lon < east; lon = round(lon + size)) out.push([round(lat), round(lon)]);
  }
  return out;
}

function round(v) {
  return Math.round(v * 1000) / 1000;
}
