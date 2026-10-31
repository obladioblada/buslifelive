// Draws every vehicle's trail in a handful of canvas strokes.
//
// A trail is a fading line through the last TRAIL_MILLIS of positions. Drawing each segment with its own
// colour costs one stroke per segment (~20,000 per frame in the day). Instead, segments are grouped by
// transport mode and by age into FADE_STEPS buckets; each group is one path and one stroke, so a frame
// costs about modes × FADE_STEPS strokes. Six fade steps are indistinguishable from a smooth fade at 3 px.

import { TRAIL_MILLIS } from './vehicle.js';

const FADE_STEPS = 6;
const MAX_ALPHA = 170;

/** @param trailMillis how far back trails reach (shorter on phones) */
export function drawTrails(ctx, vehicles, project, now, trailMillis = TRAIL_MILLIS) {
  const paths = new Map(); // "mode|step" -> { path, color, step }
  const pathFor = (vehicle, age) => {
    const step = Math.min(FADE_STEPS - 1, Math.floor(age / trailMillis * FADE_STEPS));
    const key = vehicle.mode + '|' + step;
    let entry = paths.get(key);
    if (!entry) {
      entry = { path: new Path2D(), color: vehicle.color(), step };
      paths.set(key, entry);
    }
    return entry.path;
  };

  for (const vehicle of vehicles) {
    const points = vehicle.trail.since(now - trailMillis);
    if (points.length === 0) continue;
    let previous = null;
    for (const point of points) {
      const current = project(point.latitude, point.longitude);
      if (previous) segment(pathFor(vehicle, now - point.timeMillis), previous, current);
      previous = current;
    }
    segment(pathFor(vehicle, 0), previous, project(...vehicle.displayLatLon(now)));
  }

  ctx.save();
  ctx.lineWidth = 3;
  ctx.lineCap = 'butt';
  for (const { path, color, step } of paths.values()) {
    const alpha = MAX_ALPHA * (1 - (step + 0.5) / FADE_STEPS) / 255;
    ctx.strokeStyle = `rgba(${color[0]},${color[1]},${color[2]},${alpha})`;
    ctx.stroke(path);
  }
  ctx.restore();
}

function segment(path, [x1, y1], [x2, y2]) {
  if (x1 === x2 && y1 === y2) return;
  path.moveTo(x1, y1);
  path.lineTo(x2, y2);
}
