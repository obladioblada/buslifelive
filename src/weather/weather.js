// Current weather in Helsinki: kinds grouped from WMO codes, the Open-Meteo parser and preview examples.
//
// Weather fields: kind, wmoCode, temperature °C, feelsLike °C, precipitationPerHour mm/h, cloudCover 0..100,
// windSpeed m/s, windGusts m/s, windDirection (degrees the wind blows FROM), day, visibility m (NaN if
// unknown), observedAt ("HH:MM" local), preview (true for made-up weather used to preview an effect).

export const WeatherKind = Object.freeze({
  CLEAR: 'clear',
  PARTLY_CLOUDY: 'partlyCloudy',
  CLOUDY: 'cloudy',
  FOG: 'fog',
  DRIZZLE: 'drizzle',
  RAIN: 'rain',
  SLEET: 'sleet',
  SNOW: 'snow',
  THUNDERSTORM: 'thunderstorm',
});

/** Preview order for the W key. */
export const WEATHER_KINDS = Object.values(WeatherKind);

const LABELS = {
  clear: 'Clear', partlyCloudy: 'Partly cloudy', cloudy: 'Overcast', fog: 'Fog', drizzle: 'Drizzle',
  rain: 'Rain', sleet: 'Sleet', snow: 'Snow', thunderstorm: 'Thunderstorm',
};

export function kindLabel(kind) {
  return LABELS[kind];
}

/** See the WMO code table at https://open-meteo.com/en/docs ("WMO Weather interpretation codes"). */
export function kindFromWmoCode(code) {
  if (code === 0) return WeatherKind.CLEAR;
  if (code === 1 || code === 2) return WeatherKind.PARTLY_CLOUDY;
  if (code === 3) return WeatherKind.CLOUDY;
  if (code === 45 || code === 48) return WeatherKind.FOG;
  if ([51, 53, 55, 56, 57].includes(code)) return WeatherKind.DRIZZLE;
  if ([61, 63, 65, 80, 81, 82].includes(code)) return WeatherKind.RAIN;
  if (code === 66 || code === 67) return WeatherKind.SLEET;
  if ([71, 73, 75, 77, 85, 86].includes(code)) return WeatherKind.SNOW;
  if ([95, 96, 99].includes(code)) return WeatherKind.THUNDERSTORM;
  return WeatherKind.CLOUDY;
}

/** Next kind in preview order, wrapping to null (= live weather) after the last. */
export function nextWeatherPreview(current) {
  if (!current) return WEATHER_KINDS[0];
  const index = WEATHER_KINDS.indexOf(current);
  return index + 1 < WEATHER_KINDS.length ? WEATHER_KINDS[index + 1] : null;
}

/** Parses the "current" block of an Open-Meteo forecast response. */
export function parseWeather(json) {
  const current = (typeof json === 'string' ? JSON.parse(json) : json).current;
  const num = (key, fallback) => (current[key] === undefined || current[key] === null ? fallback : Number(current[key]));
  const code = Number(current.weather_code);
  // "precipitation" is the sum over the preceding interval (normally 15 min); scale it to mm per hour.
  const interval = num('interval', 900);
  return {
    kind: kindFromWmoCode(code),
    wmoCode: code,
    temperature: num('temperature_2m', NaN),
    feelsLike: num('apparent_temperature', NaN),
    precipitationPerHour: num('precipitation', 0) * 3600 / interval,
    cloudCover: Math.trunc(num('cloud_cover', 0)),
    windSpeed: num('wind_speed_10m', 0),
    windGusts: num('wind_gusts_10m', 0),
    windDirection: num('wind_direction_10m', 0),
    day: num('is_day', 1) === 1,
    visibility: num('visibility', NaN),
    observedAt: String(current.time).slice(11, 16),
    preview: false,
  };
}

/** How strong the effect should be, 0..1: rain and snow by mm/h, fog by visibility, clouds by cover. */
export function intensity(weather) {
  switch (weather.kind) {
    case WeatherKind.CLEAR: return 0;
    case WeatherKind.PARTLY_CLOUDY:
    case WeatherKind.CLOUDY: return weather.cloudCover / 100;
    case WeatherKind.FOG: return Number.isNaN(weather.visibility) ? 0.7 : clamp(1 - weather.visibility / 2000, 0.4, 1);
    // Even "0.0 mm" rain codes get a visible drizzle; 4 mm/h and more is a downpour.
    default: return clamp(0.3 + 0.7 * weather.precipitationPerHour / 4, 0.3, 1);
  }
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/** Wind direction as a compass point, e.g. "SW". */
export function windFrom(weather) {
  const degrees = ((weather.windDirection % 360) + 360) % 360;
  return COMPASS[Math.round(degrees / 45) % 8];
}

/** A typical example of each kind, for previewing the effects when the real sky is boring. */
export function previewWeather(kind) {
  const examples = {
    clear: [0, 14, 0, 0, 3, 120], partlyCloudy: [2, 12, 0, 45, 5, 200], cloudy: [3, 9, 0, 100, 6, 220],
    fog: [45, 4, 0, 100, 1.5, 180], drizzle: [53, 7, 0.4, 100, 4, 240], rain: [63, 9, 3.5, 100, 7, 230],
    sleet: [66, 0.5, 1.5, 100, 6, 300], snow: [73, -4, 1.2, 100, 4, 320], thunderstorm: [95, 19, 6, 100, 11, 210],
  };
  const [code, temperature, mmPerHour, cloudCover, wind, windFromDegrees] = examples[kind];
  return {
    kind, wmoCode: code, temperature, feelsLike: temperature - wind * 0.7, precipitationPerHour: mmPerHour,
    cloudCover, windSpeed: wind, windGusts: wind * 1.6, windDirection: windFromDegrees, day: true,
    visibility: kind === WeatherKind.FOG ? 300 : 20_000, observedAt: '', preview: true,
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
