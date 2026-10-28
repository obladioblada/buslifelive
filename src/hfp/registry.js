// Store of live vehicles. The MQTT client writes through accept()/acceptSignal(); every frame the sketch
// reads the vehicles, drains the events and (once per second) takes a city snapshot.

import { EventType, MODES } from './events.js';
import { Vehicle } from '../map/vehicle.js';

export const RATE_WINDOW_MILLIS = 10_000;
export const LATE_AFTER_SECONDS = 180;
const MAX_QUEUED_EVENTS = 10_000;

/** Per-mode (or whole-city) figures. averageDelaySeconds: positive = late, NaN if nobody reports delay. */
export function modeStats(vehicles = 0, moving = 0, averageSpeed = 0, averageDelaySeconds = NaN, doorsOpen = 0) {
  return { vehicles, moving, averageSpeed, averageDelaySeconds, doorsOpen };
}

export function movingShare(stats) {
  return stats.vehicles === 0 ? 0 : stats.moving / stats.vehicles;
}

/** Aggregate state of all vehicles: whole city, per mode (in MODES order), late share, door-open rate. */
export const EMPTY_SNAPSHOT = Object.freeze({ all: modeStats(), byMode: new Map(), lateShare: 0, doorOpeningsPerSecond: 0 });

export class VehicleRegistry {
  constructor() {
    this.vehicles = new Map();
    this.events = [];
    this.doorOpenings = [];
  }

  accept(position, now = Date.now()) {
    let vehicle = this.vehicles.get(position.vehicleKey);
    if (!vehicle) {
      vehicle = new Vehicle(position, now);
      this.vehicles.set(position.vehicleKey, vehicle);
      this.publish(EventType.APPEARED, vehicle, now);
      return;
    }
    for (const type of vehicle.update(position, now)) {
      if (type === EventType.DOORS_OPENED) this.doorOpenings.push(now);
      this.publish(type, vehicle, now);
    }
  }

  /** Records a one-off event for a vehicle we already track; signals for unknown vehicles are dropped. */
  acceptSignal(signal, now = Date.now()) {
    const vehicle = this.vehicles.get(signal.vehicleKey);
    if (!vehicle) return;
    vehicle.onSignal(signal.type, now);
    this.publish(signal.type, vehicle, now);
  }

  /** Removes vehicles that have not reported within maxAgeMillis. */
  pruneStale(maxAgeMillis, now = Date.now()) {
    const cutoff = now - maxAgeMillis;
    for (const [key, vehicle] of this.vehicles) {
      if (vehicle.lastSeenMillis < cutoff) {
        this.vehicles.delete(key);
        this.publish(EventType.DISAPPEARED, vehicle, now);
      }
    }
    this.trimDoorOpenings(now);
  }

  /** Returns and clears every event since the last call: [{ type, vehicle, timeMillis }]. */
  drainEvents() {
    const drained = this.events;
    this.events = [];
    return drained;
  }

  snapshot(now = Date.now()) {
    this.trimDoorOpenings(now);
    const all = new StatsAccumulator();
    const byMode = new Map();
    let late = 0;
    for (const vehicle of this.vehicles.values()) {
      all.add(vehicle);
      if (!byMode.has(vehicle.mode)) byMode.set(vehicle.mode, new StatsAccumulator());
      byMode.get(vehicle.mode).add(vehicle);
      const offset = vehicle.position.scheduleOffsetSeconds;
      if (offset !== null && -offset > LATE_AFTER_SECONDS) late++;
    }
    if (all.vehicles === 0) return EMPTY_SNAPSHOT;

    const ordered = new Map();
    for (const mode of [...MODES, 'unknown']) {
      if (byMode.has(mode)) ordered.set(mode, byMode.get(mode).toStats());
    }
    return {
      all: all.toStats(),
      byMode: ordered,
      lateShare: late / all.vehicles,
      doorOpeningsPerSecond: this.doorOpenings.length / (RATE_WINDOW_MILLIS / 1000),
    };
  }

  publish(type, vehicle, now) {
    // Drop the oldest event rather than grow without bound if nobody is draining.
    if (this.events.length >= MAX_QUEUED_EVENTS) this.events.shift();
    this.events.push({ type, vehicle, timeMillis: now });
  }

  trimDoorOpenings(now) {
    const cutoff = now - RATE_WINDOW_MILLIS;
    let drop = 0;
    while (drop < this.doorOpenings.length && this.doorOpenings[drop] < cutoff) drop++;
    if (drop > 0) this.doorOpenings.splice(0, drop);
  }
}

class StatsAccumulator {
  constructor() {
    this.vehicles = 0;
    this.moving = 0;
    this.doorsOpen = 0;
    this.withSpeed = 0;
    this.withDelay = 0;
    this.speedSum = 0;
    this.delaySum = 0;
  }

  add(vehicle) {
    const position = vehicle.position;
    this.vehicles++;
    if (vehicle.moving) this.moving++;
    if (vehicle.doorsOpen) this.doorsOpen++;
    if (!Number.isNaN(position.speed)) {
      this.speedSum += position.speed;
      this.withSpeed++;
    }
    if (position.scheduleOffsetSeconds !== null) {
      // HFP "dl" is negative when late; flip it so positive means late.
      this.delaySum -= position.scheduleOffsetSeconds;
      this.withDelay++;
    }
  }

  toStats() {
    return modeStats(this.vehicles, this.moving,
      this.withSpeed === 0 ? 0 : this.speedSum / this.withSpeed,
      this.withDelay === 0 ? NaN : this.delaySum / this.withDelay,
      this.doorsOpen);
  }
}
