// Full-screen weather effects drawn over the map and vehicles: rain streaks, snow flakes, drifting clouds,
// fog banks, lightning and a faint cold/warm tint. Everything drifts with the real wind.
//
// Soft clouds and fog are native canvas radial gradients (smooth, no banding, no slow p5 tint()), and all
// rain or snow particles are batched into one path so a frame costs one stroke()/fill() each.

import { WeatherKind, intensity as weatherIntensity } from '../weather/weather.js';

const MAX_DROPS = 900;
const MAX_FLAKES = 600;
const MAX_BLOBS = 16;
/** Screen pixels per second of drift for each m/s of wind. */
const CLOUD_DRIFT = 5;
const RAIN_WIND = 18;
const SNOW_WIND = 9;

export class WeatherLayer {
  /** @param light phones: half the rain, snow, clouds and fog */
  constructor(p, { light = false } = {}) {
    this.p = p;
    this.share = light ? 0.5 : 1;
    this.lastMillis = 0;
    this.lightningAt = -10_000;
    this.nextLightningAt = 0;
    this.daylight = 0;
    const w = p.width, h = p.height, r = Math.random;
    this.drops = Array.from({ length: MAX_DROPS }, () => ({ x: r() * w, y: r() * h, speed: 0.8 + r() * 0.4, length: 0.7 + r() * 0.6 }));
    this.flakes = Array.from({ length: MAX_FLAKES }, () => ({ x: r() * w, y: r() * h, speed: 35 + r() * 55, size: 2.5 + r() * 3, phase: r() * Math.PI * 2 }));
    this.blobs = Array.from({ length: MAX_BLOBS }, () => ({ x: r() * w, y: r() * h, size: 260 + r() * 380 }));
  }

  /** @param daylight 0 on the dark night map, 1 on the light day map: clouds become shadows, rain and snow darker */
  draw(weather, daylight) {
    const p = this.p;
    const now = p.millis();
    const dt = Math.min((now - this.lastMillis) / 1000, 0.1);
    this.lastMillis = now;
    this.daylight = daylight;
    if (!weather) return;

    // Wind blows *from* windDirection; things drift towards the opposite side. North is up on the map.
    const towards = (weather.windDirection + 180) * Math.PI / 180;
    const windX = Math.sin(towards) * weather.windSpeed;
    const windY = -Math.cos(towards) * weather.windSpeed;
    const intensity = weatherIntensity(weather);

    p.push();
    this.temperatureTint(weather.temperature);
    switch (weather.kind) {
      case WeatherKind.CLEAR:
        break;
      case WeatherKind.PARTLY_CLOUDY:
      case WeatherKind.CLOUDY:
        this.clouds(weather, windX, windY, dt);
        break;
      case WeatherKind.FOG:
        this.fog(intensity, windX, windY, dt);
        break;
      case WeatherKind.DRIZZLE:
        this.clouds(weather, windX, windY, dt);
        this.rain(Math.trunc(MAX_DROPS * 0.35 * intensity), 420, 7, 70, windX, dt);
        break;
      case WeatherKind.RAIN:
        this.clouds(weather, windX, windY, dt);
        this.rain(Math.trunc(MAX_DROPS * intensity), 1000, 18, 105, windX, dt);
        break;
      case WeatherKind.SLEET:
        this.clouds(weather, windX, windY, dt);
        this.rain(Math.trunc(MAX_DROPS * 0.5 * intensity), 800, 12, 90, windX, dt);
        this.snow(Math.trunc(MAX_FLAKES * 0.4 * intensity), windX, dt);
        break;
      case WeatherKind.SNOW:
        this.clouds(weather, windX, windY, dt);
        this.snow(Math.trunc(MAX_FLAKES * intensity), windX, dt);
        break;
      case WeatherKind.THUNDERSTORM:
        this.clouds(weather, windX, windY, dt);
        this.rain(MAX_DROPS, 1300, 22, 120, windX, dt);
        this.lightning(now);
        break;
    }
    p.pop();
  }

  /** Barely-there blue when freezing, amber when hot. */
  temperatureTint(temperature) {
    const p = this.p;
    p.noStroke();
    if (temperature < 0) {
      p.fill(90, 150, 255, Math.min(-temperature * 2, 28));
      p.rect(0, 0, p.width, p.height);
    } else if (temperature > 22) {
      p.fill(255, 170, 80, Math.min((temperature - 22) * 2, 24));
      p.rect(0, 0, p.width, p.height);
    }
  }

  /** Soft cloud banks drifting with the wind; how many depends on cloud cover. */
  clouds(weather, windX, windY, dt) {
    const p = this.p;
    const cover = weather.cloudCover / 100;
    const count = Math.round(MAX_BLOBS * cover * this.share);
    this.moveBlobs(count, windX * CLOUD_DRIFT, windY * CLOUD_DRIFT, dt);
    // Overcast: a faint veil over everything, so the whole city feels greyer.
    p.noStroke();
    p.fill(this.mix(150, 30), this.mix(160, 35), this.mix(175, 50), 8 * cover);
    p.rect(0, 0, p.width, p.height);
    for (let i = 0; i < count; i++) {
      // Pale cloud tops seen at night; at day the light map shows their shadows instead.
      const b = this.blobs[i];
      this.softBlob(b.x, b.y, b.size, this.mix(200, 40), this.mix(205, 45), this.mix(215, 60), 34);
    }
  }

  fog(intensity, windX, windY, dt) {
    const p = this.p;
    const count = Math.round(MAX_BLOBS * this.share);
    this.moveBlobs(count, windX * CLOUD_DRIFT * 0.5, windY * CLOUD_DRIFT * 0.5, dt);
    p.noStroke();
    p.fill(this.mix(170, 235), this.mix(175, 238), this.mix(185, 242), 25 + 40 * intensity);
    p.rect(0, 0, p.width, p.height);
    for (const b of this.blobs.slice(0, count)) {
      this.softBlob(b.x, b.y, b.size * 1.4, this.mix(190, 245), this.mix(195, 247), this.mix(205, 250), 30 + 30 * intensity);
    }
  }

  rain(count, speed, length, alpha, windX, dt) {
    const p = this.p, ctx = p.drawingContext;
    const drift = windX * RAIN_WIND;
    count = Math.round(count * this.share);
    ctx.save();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = `rgba(${this.mix(185, 60)},${this.mix(210, 85)},${this.mix(255, 135)},${alpha / 255})`;
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const d = this.drops[i];
      const v = speed * d.speed;
      d.y += v * dt;
      d.x += drift * dt;
      if (d.y > p.height + 30) {
        d.y = -30;
        d.x = Math.random() * p.width;
      }
      d.x = wrap(d.x, p.width, 0);
      const len = length * d.length;
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - drift / v * len, d.y - len);
    }
    ctx.stroke();
    ctx.restore();
  }

  snow(count, windX, dt) {
    const p = this.p, ctx = p.drawingContext;
    const t = p.millis() / 1000;
    count = Math.round(count * this.share);
    ctx.save();
    ctx.fillStyle = `rgba(${this.mix(255, 120)},${this.mix(255, 135)},${this.mix(255, 160)},${225 / 255})`;
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const f = this.flakes[i];
      f.y += f.speed * dt;
      f.x += (windX * SNOW_WIND + Math.sin(t * 1.3 + f.phase) * 18) * dt;
      if (f.y > p.height + 10) {
        f.y = -10;
        f.x = Math.random() * p.width;
      }
      f.x = wrap(f.x, p.width, 0);
      ctx.moveTo(f.x + f.size / 2, f.y);
      ctx.arc(f.x, f.y, f.size / 2, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.restore();
  }

  /** A double flicker every 5-15 seconds. */
  lightning(now) {
    const p = this.p;
    if (now >= this.nextLightningAt) {
      this.lightningAt = now;
      this.nextLightningAt = now + 5_000 + Math.floor(Math.random() * 10_000);
    }
    const t = now - this.lightningAt;
    let alpha;
    if (t < 70) alpha = 170;
    else if (t < 130) alpha = 20;
    else if (t < 190) alpha = 130;
    else if (t < 500) alpha = 130 * (1 - (t - 190) / 310);
    else return;
    p.noStroke();
    p.fill(235, 240, 255, alpha);
    p.rect(0, 0, p.width, p.height);
  }

  moveBlobs(count, vx, vy, dt) {
    for (let i = 0; i < count; i++) {
      const b = this.blobs[i];
      b.x = wrap(b.x + vx * dt, this.p.width, b.size);
      b.y = wrap(b.y + vy * dt, this.p.height, b.size);
    }
  }

  /** One soft-edged oval with the same falloff as the Java sprite; alpha (0-255) is the centre opacity. */
  softBlob(x, y, size, r, g, b, alpha) {
    const ctx = this.p.drawingContext;
    const radius = size / 2;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, 0.62);
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
    for (const stop of FALLOFF) gradient.addColorStop(stop.at, `rgba(${r},${g},${b},${(alpha / 255) * stop.alpha})`);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Colour channel blended from its night value to its day value. */
  mix(night, day) {
    return Math.round(night + (day - night) * this.daylight);
  }
}

/** Gradient stops for alpha = (1 - smoothstep(d))², the Java sprite's falloff. */
const FALLOFF = Array.from({ length: 9 }, (_, i) => {
  const d = i / 8;
  const falloff = 1 - d * d * (3 - 2 * d);
  return { at: d, alpha: falloff * falloff };
});

function wrap(value, size, margin) {
  const span = size + margin * 2;
  return ((((value + margin) % span) + span) % span) - margin;
}
