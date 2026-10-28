// Colours shared by the map, the panels and the legend. RGBA arrays, 0-255.

// One hue per transport mode, kept clear of red so the "late" arc always stands out.
const MODE_COLORS = {
  bus: [61, 139, 255, 230],
  tram: [43, 209, 138, 230],
  metro: [255, 210, 63, 230],
  train: [180, 140, 255, 230],
  ferry: [79, 227, 240, 230],
  ubus: [143, 163, 191, 230],
};
const DEFAULT_COLOR = [255, 255, 255, 200];

/** Arc around vehicles running behind schedule. */
export const LATE = [255, 59, 92, 255];
/** Traffic light and passed-stop effects: white on the night map, dark slate on the day map. */
export const SIGNAL = [255, 255, 255, 255];
export const SIGNAL_DAY = [35, 40, 55, 255];
/** Outline around vehicles on the light day map. */
export const OUTLINE_DAY = [20, 24, 34, 170];
/** Background of every panel. */
export const CARD = [12, 14, 20];

export function forMode(mode) {
  return MODE_COLORS[mode] ?? DEFAULT_COLOR;
}

/** Linear blend from a (t = 0) to b (t = 1), alpha included. */
export function lerpColor(a, b, t) {
  if (t <= 0) return a;
  if (t >= 1) return b;
  return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}

export function signal(daylight) {
  return lerpColor(SIGNAL, SIGNAL_DAY, daylight);
}
