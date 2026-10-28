// A tracked vehicle: its state (updated by every position message) and how it is drawn.
// The state logic is plain JavaScript; drawing methods receive the p5 instance so this module
// also runs in Node for tests.

import { EventType } from '../hfp/events.js';
import { VehicleTrail } from './trail.js';
import * as theme from '../theme.js';

/** Hysteresis so GPS jitter around zero does not flap between STOPPED and DEPARTED. */
export const STOPPED_BELOW_SPEED = 0.5;
export const MOVING_ABOVE_SPEED = 1.5;

export const BASE_RADIUS = 9;
export const DOOR_PULSE_MILLIS = 1500;
export const DOOR_PULSE_RADIUS = 24;

/** Doors open: the circle grows by this factor at once... */
export const DOOR_OPEN_SCALE = 1.2;
/** ...and keeps growing by up to this much more the longer the doors stay open (people boarding). */
export const DOOR_DWELL_SCALE = 1.3;
export const DOOR_DWELL_FULL_MILLIS = 30_000;
export const DOOR_GROW_MILLIS = 300;
export const DOOR_SHRINK_MILLIS = 700;

/** Positions arrive about once per second; glide between them instead of jumping. */
export const GLIDE_MILLIS = 1000;
/** Jumps bigger than this (~1 km) are teleports (new journey, GPS fix) and are not animated. */
export const SNAP_DEGREES = 0.01;

export const TRAIL_MILLIS = 12_000;
export const TRAIL_CAPACITY = 16;

/** The late arc appears at this delay and closes into a full circle at the next. */
export const LATE_FROM_SECONDS = 180;
export const LATE_FULL_SECONDS = 600;
/** Shortest arc drawn, as a share of the circle, so just-late vehicles still get a visible tick. */
export const MIN_LATE_SWEEP = 0.08;

/** Vehicles further than this outside the canvas are not drawn. */
const CULL_MARGIN = 60;

export const TRAFFIC_LIGHT_FLASH_MILLIS = 600;
export const PASSED_STOP_STREAK_MILLIS = 900;
export const PASSED_STOP_STREAK_LENGTH = 36;

export class Vehicle {
  constructor(position, nowMillis) {
    this.key = position.vehicleKey;
    this.mode = position.mode;
    this.position = position;
    this.trail = new VehicleTrail(TRAIL_CAPACITY);
    this.glide = { fromLat: position.latitude, fromLon: position.longitude,
      toLat: position.latitude, toLon: position.longitude, startMillis: nowMillis };
    this.lastSeenMillis = nowMillis;
    this.moving = !Number.isNaN(position.speed) && position.speed > MOVING_ABOVE_SPEED;
    this.doorsOpen = position.doorsOpen === true;
    this.doorsOpenedAtMillis = this.doorsOpen ? nowMillis : 0;
    this.doorsClosedAtMillis = 0;
    this.trafficLightRequestedAtMillis = 0;
    this.trafficLightGrantedAtMillis = 0;
    this.passedStopAtMillis = 0;
  }

  /** Applies a new position and returns the event types it caused. */
  update(next, nowMillis) {
    const events = [];

    const speed = next.speed;
    if (!Number.isNaN(speed)) {
      if (this.moving && speed < STOPPED_BELOW_SPEED) {
        this.moving = false;
        events.push(EventType.STOPPED);
      } else if (!this.moving && speed > MOVING_ABOVE_SPEED) {
        this.moving = true;
        events.push(EventType.DEPARTED);
      }
    }

    if (next.doorsOpen !== null && next.doorsOpen !== this.doorsOpen) {
      this.doorsOpen = next.doorsOpen;
      if (this.doorsOpen) {
        this.doorsOpenedAtMillis = nowMillis;
        events.push(EventType.DOORS_OPENED);
      } else {
        this.doorsClosedAtMillis = nowMillis;
        events.push(EventType.DOORS_CLOSED);
      }
    }

    const previous = this.glide;
    this.trail.add(previous.toLat, previous.toLon, nowMillis);
    const [fromLat, fromLon] = this.displayLatLon(nowMillis);
    const teleport = Math.abs(next.latitude - fromLat) > SNAP_DEGREES || Math.abs(next.longitude - fromLon) > SNAP_DEGREES;
    this.glide = teleport
      ? { fromLat: next.latitude, fromLon: next.longitude, toLat: next.latitude, toLon: next.longitude, startMillis: nowMillis }
      : { fromLat, fromLon, toLat: next.latitude, toLon: next.longitude, startMillis: nowMillis };

    this.position = next;
    this.lastSeenMillis = nowMillis;
    return events;
  }

  /** Records a one-off event (traffic light, passed stop) for its visual effect. */
  onSignal(type, nowMillis) {
    if (type === EventType.TRAFFIC_LIGHT_REQUESTED) this.trafficLightRequestedAtMillis = nowMillis;
    else if (type === EventType.TRAFFIC_LIGHT_GRANTED) this.trafficLightGrantedAtMillis = nowMillis;
    else if (type === EventType.PASSED_STOP) this.passedStopAtMillis = nowMillis;
  }

  /** Where to draw the vehicle: glides from the previous position to the latest one over GLIDE_MILLIS. */
  displayLatLon(now) {
    const g = this.glide;
    const t = ease((now - g.startMillis) / GLIDE_MILLIS);
    return [g.fromLat + (g.toLat - g.fromLat) * t, g.fromLon + (g.toLon - g.fromLon) * t];
  }

  /** 0 = less than LATE_FROM_SECONDS late, 1 = LATE_FULL_SECONDS or more behind schedule. */
  lateness() {
    const offset = this.position.scheduleOffsetSeconds;
    if (offset === null) return 0;
    return clamp((-offset - LATE_FROM_SECONDS) / (LATE_FULL_SECONDS - LATE_FROM_SECONDS));
  }

  color() {
    return theme.forMode(this.mode);
  }

  /**
   * Extra size from open doors, as a fraction of the normal radius: eases in when the doors open, grows
   * with how long they have been open, and eases back to 0 after they close.
   */
  doorScale(now) {
    if (this.doorsOpen) {
      const open = now - this.doorsOpenedAtMillis;
      return ease(open / DOOR_GROW_MILLIS) * openScale(open);
    }
    const sinceClosed = now - this.doorsClosedAtMillis;
    if (this.doorsClosedAtMillis === 0 || sinceClosed >= DOOR_SHRINK_MILLIS) return 0;
    const dwell = Math.max(this.doorsClosedAtMillis - this.doorsOpenedAtMillis, 0);
    return (1 - ease(sinceClosed / DOOR_SHRINK_MILLIS)) * openScale(dwell);
  }

  // ---------------------------------------------------------------- drawing

  /** @param daylight 0 on the dark night map, 1 on the light day map (adds outlines, darkens white effects) */
  drawBody(p, project, now, daylight) {
    const [x, y] = project(...this.displayLatLon(now));
    // Off screen (with room for the largest halo): nothing to draw.
    if (x < -CULL_MARGIN || y < -CULL_MARGIN || x > p.width + CULL_MARGIN || y > p.height + CULL_MARGIN) return;
    const ctx = p.drawingContext;
    const color = this.color();
    const doorScale = this.doorScale(now);
    const radius = this.radius() * (1 + doorScale);

    if (doorScale > 0) {
      // Soft halo around a vehicle while people get on and off.
      p.noStroke();
      p.fill(color[0], color[1], color[2], 50 * Math.min(doorScale, 1));
      p.ellipse(x, y, radius * 1.8, radius * 1.8);
    }

    const sinceDoorsOpened = now - this.doorsOpenedAtMillis;
    if (this.doorsOpen && sinceDoorsOpened < DOOR_PULSE_MILLIS) {
      const progress = sinceDoorsOpened / DOOR_PULSE_MILLIS;
      p.noFill();
      p.strokeWeight(1.5);
      p.stroke(color[0], color[1], color[2], 255 * (1 - progress));
      const pulse = radius + progress * DOOR_PULSE_RADIUS;
      p.ellipse(x, y, pulse, pulse);
    }

    this.drawLateArc(ctx, x, y, radius);
    const signal = theme.signal(daylight);
    this.drawPassedStop(p, x, y, now, signal);
    this.drawTrafficLight(p, x, y, radius, now, signal);

    // The dot itself, drawn straight on the canvas: thousands per frame, so p5's per-call colour parsing
    // would dominate the frame time.
    const active = this.moving || doorScale > 0;
    ctx.fillStyle = rgba(color, active ? color[3] : color[3] / 2);
    ctx.beginPath();
    ctx.arc(x, y, radius / 2, 0, Math.PI * 2);
    ctx.fill();
    if (daylight > 0) {
      const o = theme.OUTLINE_DAY;
      ctx.lineWidth = 1;
      ctx.strokeStyle = rgba(o, o[3] * daylight);
      ctx.stroke();
    }
  }

  /**
   * Thin red arc around a late vehicle, filling clockwise from 12 o'clock like a clock hand: a short tick
   * at LATE_FROM_SECONDS, a full circle at LATE_FULL_SECONDS. The vehicle keeps its colour.
   */
  drawLateArc(ctx, x, y, radius) {
    const offset = this.position.scheduleOffsetSeconds;
    if (offset === null || -offset < LATE_FROM_SECONDS) return;
    const lateness = this.lateness();
    const sweep = Math.max(lateness, MIN_LATE_SWEEP) * Math.PI * 2;
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = rgba(theme.LATE, 120 + 100 * lateness);
    ctx.beginPath();
    ctx.arc(x, y, (radius + 7) / 2, -Math.PI / 2, -Math.PI / 2 + sweep);
    ctx.stroke();
  }

  /** A line shooting out behind the vehicle: it drove past a stop where nobody was waiting. */
  drawPassedStop(p, x, y, now, c) {
    const since = now - this.passedStopAtMillis;
    const heading = this.position.heading;
    if (this.passedStopAtMillis === 0 || since >= PASSED_STOP_STREAK_MILLIS || Number.isNaN(heading)) return;
    const progress = since / PASSED_STOP_STREAK_MILLIS;
    const radians = heading * Math.PI / 180;
    // Heading is clockwise from north; screen y grows downwards.
    const dx = -Math.sin(radians), dy = Math.cos(radians);
    const length = PASSED_STOP_STREAK_LENGTH * (0.4 + 0.6 * ease(progress * 2));
    p.strokeWeight(1.5);
    p.stroke(c[0], c[1], c[2], 220 * (1 - progress));
    p.line(x, y, x + dx * length, y + dy * length);
  }

  /** Flash: the vehicle asked a traffic light for green (thin ring) and got it (bright burst). */
  drawTrafficLight(p, x, y, radius, now, c) {
    const sinceGranted = now - this.trafficLightGrantedAtMillis;
    if (this.trafficLightGrantedAtMillis !== 0 && sinceGranted < TRAFFIC_LIGHT_FLASH_MILLIS) {
      const progress = sinceGranted / TRAFFIC_LIGHT_FLASH_MILLIS;
      p.noStroke();
      p.fill(c[0], c[1], c[2], 200 * (1 - progress));
      const flash = radius + 6 + 14 * ease(progress);
      p.ellipse(x, y, flash, flash);
      return;
    }
    const sinceRequested = now - this.trafficLightRequestedAtMillis;
    if (this.trafficLightRequestedAtMillis !== 0 && sinceRequested < TRAFFIC_LIGHT_FLASH_MILLIS) {
      const progress = sinceRequested / TRAFFIC_LIGHT_FLASH_MILLIS;
      p.noFill();
      p.strokeWeight(1);
      p.stroke(c[0], c[1], c[2], 160 * (1 - progress));
      const ring = radius + 4 + 8 * progress;
      p.ellipse(x, y, ring, ring);
    }
  }

  /** Occupancy is only real for Suomenlinna ferries: 0 = normal size, 100 = twice as big. */
  radius() {
    const occupancy = this.position.occupancy;
    return occupancy === null ? BASE_RADIUS : BASE_RADIUS * (1 + occupancy / 100);
  }
}

/** CSS colour from an RGB array and an alpha on p5's 0-255 scale. */
function rgba(c, alpha) {
  return `rgba(${c[0]},${c[1]},${c[2]},${alpha / 255})`;
}

function openScale(openMillis) {
  const dwell = Math.min(openMillis / DOOR_DWELL_FULL_MILLIS, 1);
  return DOOR_OPEN_SCALE + DOOR_DWELL_SCALE * dwell;
}

export function clamp(t) {
  return Math.max(0, Math.min(1, t));
}

/** Smoothstep on 0..1. */
export function ease(t) {
  t = clamp(t);
  return t * t * (3 - 2 * t);
}
