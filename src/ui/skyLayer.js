// Colours the basemap by time of day: a warm glow from the sun's side of the screen around sunrise and
// sunset, and a deep-blue tint at night. Drawn over the map but under the vehicles.
//
// Java computed the glow into a 64x40 image and stretched it; a canvas linear gradient along the sun's
// direction gives the same picture directly.

// Near the sun / far from the sun, for each time of day.
const SUNRISE_NEAR = [255, 165, 105], SUNRISE_FAR = [140, 120, 210];
const SUNSET_NEAR = [255, 105, 40], SUNSET_FAR = [160, 55, 140];
const NEAR_ALPHA = 125, FAR_ALPHA = 22;
const STOPS = 8;

export function drawSky(p, sky) {
  p.push();
  p.noStroke();
  if (sky.night > 0) {
    p.fill(10, 22, 70, 45 * sky.night);
    p.rect(0, 0, p.width, p.height);
  }
  if (sky.golden > 0) glow(p, sky);
  p.pop();
}

function glow(p, sky) {
  const near = sky.rising ? SUNRISE_NEAR : SUNSET_NEAR;
  const far = sky.rising ? SUNRISE_FAR : SUNSET_FAR;
  // North is up on the map, so the sun's compass direction is also its direction on screen.
  const azimuth = sky.sun.azimuth * Math.PI / 180;
  const dx = Math.sin(azimuth), dy = -Math.cos(azimuth);
  // Half the screen's extent along that direction: the gradient runs from the far edge to the near edge.
  const reach = 0.5 * (Math.abs(dx) * p.width + Math.abs(dy) * p.height);
  const cx = p.width / 2, cy = p.height / 2;

  const ctx = p.drawingContext;
  const gradient = ctx.createLinearGradient(cx - dx * reach, cy - dy * reach, cx + dx * reach, cy + dy * reach);
  for (let i = 0; i <= STOPS; i++) {
    // t: 0 on the side facing away from the sun, 1 on the edge facing it; alpha grows with t².
    const t = i / STOPS;
    const c = near.map((v, k) => Math.round(far[k] + (v - far[k]) * t));
    const alpha = sky.golden * (FAR_ALPHA + (NEAR_ALPHA - FAR_ALPHA) * t * t) / 255;
    gradient.addColorStop(t, `rgba(${c[0]},${c[1]},${c[2]},${alpha})`);
  }
  ctx.save();
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, p.width, p.height);
  ctx.restore();
}
