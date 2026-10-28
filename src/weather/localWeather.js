// The visitor's own weather, next to Helsinki's. The browser asks the visitor for permission; the
// coordinates are rounded to about 1 km and only ever sent to Open-Meteo.

import { WeatherClient } from './weatherClient.js';

export class LocalWeather {
  constructor(geolocation = globalThis.navigator?.geolocation) {
    this.geolocation = geolocation;
    /** idle -> asking -> ready | denied; unavailable when the browser has no geolocation. */
    this.status = geolocation ? 'idle' : 'unavailable';
    this.client = null;
  }

  /** Shows the browser's location prompt (once). Call it from a click or key press. */
  request() {
    if (this.status !== 'idle') return;
    this.status = 'asking';
    this.geolocation.getCurrentPosition(
      position => {
        const round = value => Math.round(value * 100) / 100;
        this.client = new WeatherClient({
          latitude: round(position.coords.latitude),
          longitude: round(position.coords.longitude),
          timezone: 'auto',
          label: 'local',
        });
        this.client.start();
        this.status = 'ready';
      },
      () => {
        this.status = 'denied';
      },
      { maximumAge: 60 * 60_000, timeout: 30_000 },
    );
  }

  /** Latest local weather, or null. */
  get current() {
    return this.client?.current ?? null;
  }
}
