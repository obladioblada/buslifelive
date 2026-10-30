// Receiving and keeping only the vehicles around the view.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { areaTopics, cellCode } from '../src/hfp/geohash.js';
import { parsePosition } from '../src/hfp/parser.js';
import { EventType } from '../src/hfp/events.js';
import { inArea, VehicleRegistry } from '../src/hfp/registry.js';

const PREFIX = '/hfp/v2/journey/ongoing/vp/';
const TOPIC = '/hfp/v2/journey/ongoing/vp/bus/0012/0VEH/4731/2/Hakaniemi/16:48/4960217/5/60;25/21/90/71';
const position = (vehicle, lat, lon, mode = 'bus') => parsePosition(
  TOPIC.replace('/bus/', `/${mode}/`).replace('0VEH', vehicle),
  `{"VP":{"desi":"731","dir":"2","oper":12,"veh":1,"tst":"2026-10-14T14:13:10.661Z","spd":5,"hdg":0,`
  + `"lat":${lat},"long":${lon},"dl":0,"drst":0,"route":"4731"}}`);

test('cell codes: whole degrees, then a lat digit and a lon digit per decimal', () => {
  assert.equal(cellCode(60.1, 24.9), '60;24/19');
  assert.equal(cellCode(60.297, 25.101), '60;25/21');
  assert.equal(cellCode(60.0, 25.0), '60;25/00');
});

test('area topics cover the view with 0.1 degree cells', () => {
  const topics = areaTopics({ south: 60.15, west: 24.85, north: 60.25, east: 25.05 }, PREFIX);
  assert.equal(topics.length, 2 * 3);
  assert.ok(topics.includes(`${PREFIX}+/+/+/+/+/+/+/+/+/60;24/19/#`));
  assert.ok(topics.includes(`${PREFIX}+/+/+/+/+/+/+/+/+/60;25/20/#`));
  assert.ok(topics.includes(`${PREFIX}+/+/+/+/+/+/+/+/+/60;24/28/#`));
});

test('a large area falls back to whole-degree cells', () => {
  const topics = areaTopics({ south: 59.9, west: 24.2, north: 60.6, east: 25.6 }, PREFIX);
  assert.deepEqual(topics.sort(), [59, 60].flatMap(lat => [24, 25].map(lon => `${PREFIX}+/+/+/+/+/+/+/+/+/${lat};${lon}/#`)).sort());
});

test('vehicles leaving the area are removed; snapshots can count only the view', () => {
  const registry = new VehicleRegistry();
  registry.accept(position('00001', 60.17, 24.94), 1000);
  registry.accept(position('00002', 60.30, 25.10), 1000);
  registry.accept(position('00003', 60.18, 24.95, 'tram'), 1000);
  registry.drainEvents();

  const view = { south: 60.1, west: 24.8, north: 60.2, east: 25.0 };
  assert.ok(inArea(registry.vehicles.get('0012/00001'), view));
  assert.ok(!inArea(registry.vehicles.get('0012/00002'), view));
  const inView = registry.snapshot(1000, vehicle => inArea(vehicle, view));
  assert.equal(inView.all.vehicles, 2);
  assert.deepEqual([...inView.byMode.keys()], ['bus', 'tram']);
  assert.equal(registry.snapshot(1000).all.vehicles, 3);

  registry.removeOutside(view, 2000);
  assert.equal(registry.vehicles.size, 2);
  assert.deepEqual(registry.drainEvents().map(e => e.type), [EventType.DISAPPEARED]);
});
