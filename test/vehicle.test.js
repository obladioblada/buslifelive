// Ported from the Java HslVehicleTest and VehicleTrailTest, plus a projection check.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as V from '../src/map/vehicle.js';
import { VehicleTrail } from '../src/map/trail.js';
import { projector } from '../src/map/projection.js';
import { forMode } from '../src/theme.js';

const T0 = 1_000_000;
const at = (lat, lon, extra = {}) => ({ vehicleKey: 'v', mode: 'bus', latitude: lat, longitude: lon, speed: 5, heading: 0,
  acceleration: 0, scheduleOffsetSeconds: 0, doorsOpen: false, occupancy: 0, timestamp: 0, ...extra });
const doors = open => at(60.17, 24.94, { speed: 0, doorsOpen: open });

test('open doors grow, keep growing with dwell time, and are capped', () => {
  const v = new V.Vehicle(doors(false), T0);
  assert.equal(v.doorScale(T0 + 5000), 0);
  v.update(doors(true), T0);
  assert.equal(v.doorScale(T0), 0);
  assert.ok(Math.abs(v.doorScale(T0 + V.DOOR_GROW_MILLIS) - V.DOOR_OPEN_SCALE) < 0.02);
  assert.ok(v.doorScale(T0 + V.DOOR_DWELL_FULL_MILLIS) > v.doorScale(T0 + 10_000));
  assert.ok(Math.abs(v.doorScale(T0 + 120_000) - (V.DOOR_OPEN_SCALE + V.DOOR_DWELL_SCALE)) < 1e-9);
});

test('closing shrinks back from the size it reached, without a jump', () => {
  const v = new V.Vehicle(doors(false), T0);
  v.update(doors(true), T0);
  const closedAt = T0 + 10_000;
  const size = v.doorScale(closedAt);
  v.update(doors(false), closedAt);
  assert.ok(Math.abs(v.doorScale(closedAt) - size) < 1e-9);
  const halfway = v.doorScale(closedAt + V.DOOR_SHRINK_MILLIS / 2);
  assert.ok(halfway > 0 && halfway < size);
  assert.equal(v.doorScale(closedAt + V.DOOR_SHRINK_MILLIS), 0);
});

test('glides to new positions, snaps on big jumps', () => {
  const v = new V.Vehicle(at(60.1700, 24.94), T0);
  v.update(at(60.1710, 24.94), T0);
  assert.equal(v.displayLatLon(T0)[0], 60.17);
  const halfway = v.displayLatLon(T0 + V.GLIDE_MILLIS / 2)[0];
  assert.ok(halfway > 60.17 && halfway < 60.171);
  assert.ok(Math.abs(v.displayLatLon(T0 + V.GLIDE_MILLIS)[0] - 60.171) < 1e-9);

  const jump = new V.Vehicle(at(60.17, 24.94), T0);
  jump.update(at(60.25, 24.94), T0);
  assert.equal(jump.displayLatLon(T0)[0], 60.25);
});

test('lateness ramps between the thresholds; late vehicles keep their colour', () => {
  const late = dl => new V.Vehicle(at(60.17, 24.94, { scheduleOffsetSeconds: dl }), T0);
  assert.equal(late(30).lateness(), 0);
  assert.equal(late(-V.LATE_FROM_SECONDS).lateness(), 0);
  assert.ok(Math.abs(late(-(V.LATE_FROM_SECONDS + V.LATE_FULL_SECONDS) / 2).lateness() - 0.5) < 1e-9);
  assert.equal(late(-900).lateness(), 1);
  assert.equal(late(null).lateness(), 0, 'metro reports no delay');
  assert.deepEqual(late(-600).color(), forMode('bus'));
});

test('trail keeps the newest points, oldest first, within the window', () => {
  const trail = new VehicleTrail(3);
  for (let i = 1; i <= 5; i++) trail.add(i, i, i * 100);
  assert.deepEqual(trail.since(0).map(p => p.latitude), [3, 4, 5]);
  assert.equal(trail.since(350).length, 2);
});

test('projection puts the centre in the middle and north up', () => {
  const project = projector(60.19, 24.94, 12, 1000, 800);
  assert.deepEqual(project(60.19, 24.94).map(Math.round), [500, 400]);
  const [, yNorth] = project(60.2, 24.94);
  const [xEast] = project(60.19, 24.95);
  assert.ok(yNorth < 400, 'north is up');
  assert.ok(xEast > 500, 'east is right');
});
