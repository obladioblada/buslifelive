// Latitude/longitude -> canvas pixels, matching MapLibre's Web Mercator view (rotation and tilt are off).
// Computing the view once per frame is far cheaper than calling map.project() for ~13,000 points.

/** MapLibre zoom is defined on 512 px tiles. */
const TILE_SIZE = 512;

export function mercatorX(lon) {
  return (lon + 180) / 360;
}

export function mercatorY(lat) {
  const phi = lat * Math.PI / 180;
  return (1 - Math.log(Math.tan(Math.PI / 4 + phi / 2)) / Math.PI) / 2;
}

/** A projector for the view described by centre, zoom and size: (lat, lon) -> [x, y]. */
export function projector(centerLat, centerLon, zoom, width, height) {
  const world = TILE_SIZE * 2 ** zoom;
  const cx = mercatorX(centerLon) * world, cy = mercatorY(centerLat) * world;
  const hw = width / 2, hh = height / 2;
  return (lat, lon) => [mercatorX(lon) * world - cx + hw, mercatorY(lat) * world - cy + hh];
}

export function mapProjector(map) {
  const center = map.getCenter();
  const canvas = map.getContainer();
  return projector(center.lat, center.lng, map.getZoom(), canvas.clientWidth, canvas.clientHeight);
}
