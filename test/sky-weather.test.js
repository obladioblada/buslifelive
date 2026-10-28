// Ported from the Java SunTest, WeatherTest and WeatherLayerTest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sunPosition, sunrise, sunset } from '../src/sky/sun.js';
import { SKY_PREVIEWS, nextSkyPreview, skyPreview } from '../src/sky/sky.js';
import { intensity, kindFromWmoCode, nextWeatherPreview, parseWeather, previewWeather, WEATHER_KINDS, WeatherKind, windFrom } from '../src/weather/weather.js';

const minutes = hhmm => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const near = (actual, expected) => assert.ok(Math.abs(minutes(actual) - minutes(expected)) <= 5, `expected ~${expected}, was ${actual}`);

test('sunrise and sunset match the almanac within five minutes', () => {
  near(sunrise({ year: 2026, month: 6, day: 21 }), '03:54');
  near(sunset({ year: 2026, month: 6, day: 21 }), '22:51');
  near(sunrise({ year: 2026, month: 12, day: 21 }), '09:24');
  near(sunset({ year: 2026, month: 12, day: 21 }), '15:13');
});

test('midsummer noon sun is high in the south; winter midnight is far below', () => {
  const noon = sunPosition(Date.parse('2026-06-21T10:20:00Z')); // 13:20 Helsinki summer time
  assert.ok(Math.abs(noon.elevation - 53.3) < 0.5);
  assert.ok(Math.abs(noon.azimuth - 180) < 3);
  assert.ok(sunPosition(Date.parse('2026-12-20T22:00:00Z')).elevation < -40);
});

test('sky previews blend day, night and golden hour, then cycle back to live', () => {
  const [sunriseP, day, sunsetP, night] = SKY_PREVIEWS;
  assert.equal(skyPreview(day).daylight, 1);
  assert.equal(skyPreview(day).golden, 0);
  assert.equal(skyPreview(night).daylight, 0);
  assert.equal(skyPreview(night).night, 1);
  assert.ok(Math.abs(skyPreview(sunsetP).daylight - 0.5) < 0.1);
  assert.ok(skyPreview(sunsetP).golden > 0.9);
  assert.equal(skyPreview(sunsetP).rising, false);
  assert.equal(skyPreview(sunriseP).rising, true);
  let p = null;
  for (const expected of SKY_PREVIEWS) assert.equal(p = nextSkyPreview(p), expected);
  assert.equal(nextSkyPreview(p), null);
});

// Captured from api.open-meteo.com for central Helsinki on 2026-10-14.
const RESPONSE = { current: { time: '2026-10-14T23:15', interval: 900, temperature_2m: 11.0, apparent_temperature: 7.6,
  precipitation: 0.0, weather_code: 3, cloud_cover: 100, wind_speed_10m: 5.3, wind_direction_10m: 158,
  wind_gusts_10m: 8.7, is_day: 0, visibility: 13640.0 } };

test('parses the current weather and scales precipitation to mm/h', () => {
  const w = parseWeather(RESPONSE);
  assert.equal(w.kind, WeatherKind.CLOUDY);
  assert.equal(w.temperature, 11);
  assert.equal(w.windSpeed, 5.3);
  assert.equal(w.day, false);
  assert.equal(w.observedAt, '23:15');
  const rain = parseWeather({ current: { ...RESPONSE.current, precipitation: 0.5, weather_code: 63 } });
  assert.equal(rain.kind, WeatherKind.RAIN);
  assert.equal(rain.precipitationPerHour, 2, '0.5 mm in 15 min = 2 mm/h');
});

test('WMO codes group into kinds; intensity and wind follow the weather', () => {
  assert.equal(kindFromWmoCode(0), WeatherKind.CLEAR);
  assert.equal(kindFromWmoCode(48), WeatherKind.FOG);
  assert.equal(kindFromWmoCode(81), WeatherKind.RAIN);
  assert.equal(kindFromWmoCode(67), WeatherKind.SLEET);
  assert.equal(kindFromWmoCode(86), WeatherKind.SNOW);
  assert.equal(kindFromWmoCode(99), WeatherKind.THUNDERSTORM);
  assert.equal(kindFromWmoCode(42), WeatherKind.CLOUDY, 'unknown codes fall back to overcast');
  assert.equal(intensity(previewWeather(WeatherKind.CLEAR)), 0);
  assert.equal(intensity({ ...previewWeather(WeatherKind.RAIN), precipitationPerHour: 0 }), 0.3);
  assert.equal(intensity({ ...previewWeather(WeatherKind.RAIN), precipitationPerHour: 10 }), 1);
  assert.equal(windFrom(parseWeather(RESPONSE)), 'S');
  assert.equal(windFrom({ windDirection: 225 }), 'SW');
});

test('weather preview cycles through every kind then back to live', () => {
  let kind = null;
  for (const expected of WEATHER_KINDS) assert.equal(kind = nextWeatherPreview(kind), expected);
  assert.equal(nextWeatherPreview(kind), null);
});
