// Where the sun is over Helsinki, from the low-precision formulas in the Astronomical Almanac
// (good to about 0.01°, far more than a map tint needs).

export const HELSINKI_LAT = 60.17;
export const HELSINKI_LON = 24.94;
export const HELSINKI_ZONE = 'Europe/Helsinki';
/** Elevation of the sun's centre at sunrise/sunset: refraction plus the sun's radius. */
const HORIZON = -0.833;

/** { elevation: degrees above the horizon, azimuth: degrees clockwise from north } at epoch millis. */
export function sunPosition(timeMillis, latitude = HELSINKI_LAT, longitude = HELSINKI_LON) {
  const rad = Math.PI / 180;
  const n = timeMillis / 86_400_000 + 2440587.5 - 2451545.0; // days since J2000
  const meanLongitude = mod(280.460 + 0.9856474 * n, 360);
  const meanAnomaly = mod(357.528 + 0.9856003 * n, 360) * rad;
  const eclipticLongitude = (meanLongitude + 1.915 * Math.sin(meanAnomaly) + 0.020 * Math.sin(2 * meanAnomaly)) * rad;
  const obliquity = (23.439 - 0.0000004 * n) * rad;

  const rightAscension = Math.atan2(Math.cos(obliquity) * Math.sin(eclipticLongitude), Math.cos(eclipticLongitude));
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLongitude));

  const siderealHours = mod(18.697374558 + 24.06570982441908 * n, 24);
  const hourAngle = (siderealHours * 15 + longitude) * rad - rightAscension;
  const lat = latitude * rad;

  const elevation = Math.asin(Math.sin(lat) * Math.sin(declination)
    + Math.cos(lat) * Math.cos(declination) * Math.cos(hourAngle));
  const azimuth = Math.atan2(-Math.sin(hourAngle) * Math.cos(declination),
    Math.cos(lat) * Math.sin(declination) - Math.sin(lat) * Math.cos(declination) * Math.cos(hourAngle));
  return { elevation: elevation / rad, azimuth: mod(azimuth / rad, 360) };
}

/** Helsinki local date { year, month (1-12), day } for epoch millis. */
export function helsinkiDate(timeMillis) {
  const parts = partsIn(timeMillis);
  return { year: parts.year, month: parts.month, day: parts.day };
}

/** Local "HH:MM" the sun rises on a Helsinki date, or null when it doesn't (midsummer/midwinter). */
export function sunrise(date) {
  return crossing(date, true);
}

export function sunset(date) {
  return crossing(date, false);
}

/** Scans the day minute by minute for the horizon crossing; cheap enough to run once per day. */
function crossing({ year, month, day }, rising) {
  const start = helsinkiMidnight(year, month, day);
  let previous = sunPosition(start).elevation - HORIZON;
  for (let minute = 1; minute <= 24 * 60; minute++) {
    const time = start + minute * 60_000;
    const current = sunPosition(time).elevation - HORIZON;
    if (rising ? previous < 0 && current >= 0 : previous >= 0 && current < 0) {
      const p = partsIn(time);
      return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
    }
    previous = current;
  }
  return null;
}

/** Epoch millis of local midnight in Helsinki, accounting for summer time. */
function helsinkiMidnight(year, month, day) {
  const guess = Date.UTC(year, month - 1, day);
  const local = partsIn(guess);
  const offset = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute) - guess;
  return guess - offset;
}

const FORMAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: HELSINKI_ZONE, year: 'numeric', month: 'numeric', day: 'numeric',
  hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
});

function partsIn(timeMillis) {
  const out = {};
  for (const part of FORMAT.formatToParts(new Date(timeMillis))) {
    if (part.type !== 'literal') out[part.type] = Number(part.value);
  }
  return out;
}

function mod(value, modulus) {
  return ((value % modulus) + modulus) % modulus;
}
