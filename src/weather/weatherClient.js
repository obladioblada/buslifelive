// Polls Open-Meteo (free, no key, CC BY 4.0: credit "Weather data by Open-Meteo.com") for the current
// weather in central Helsinki, or at any other place (the visitor's local weather). The model updates
// every 15 minutes, so polling every 10 is plenty.

import { parseWeather } from './weather.js';

export const WEATHER_ATTRIBUTION = 'Weather data by Open-Meteo.com';
const CURRENT = 'temperature_2m,apparent_temperature,precipitation,weather_code,cloud_cover,'
  + 'wind_speed_10m,wind_direction_10m,wind_gusts_10m,is_day,visibility';
const POLL_MILLIS = 10 * 60_000;

export const HELSINKI_WEATHER = { latitude: 60.17, longitude: 24.94, timezone: 'Europe/Helsinki', label: 'Helsinki' };

export class WeatherClient {
  /** @param place { latitude, longitude, timezone ('auto' = the place's own), label for the log } */
  constructor(place = HELSINKI_WEATHER) {
    this.place = place;
    this.url = 'https://api.open-meteo.com/v1/forecast'
      + `?latitude=${place.latitude}&longitude=${place.longitude}`
      + `&current=${CURRENT}&wind_speed_unit=ms&timezone=${encodeURIComponent(place.timezone)}`;
    /** Latest weather, or null until the first successful request. */
    this.current = null;
  }

  start() {
    this.poll();
    this.timer = setInterval(() => this.poll(), POLL_MILLIS);
  }

  async poll() {
    try {
      const response = await fetch(this.url);
      if (!response.ok) {
        console.warn('Weather request failed: HTTP', response.status);
        return;
      }
      this.current = parseWeather(await response.json());
      console.info(`Weather (${this.place.label}):`, this.current.kind, this.current.temperature + '°C');
    } catch (error) {
      // Keep the last known weather; the next poll will try again.
      console.warn('Weather request failed:', error.message);
    }
  }

  close() {
    clearInterval(this.timer);
  }
}
