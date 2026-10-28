// Ported from the Java HfpParserTest and VehicleRegistryTest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventType, parsePosition, parseSignal } from '../src/hfp/parser.js';
import { EventType } from '../src/hfp/events.js';
import { VehicleRegistry, EMPTY_SNAPSHOT, movingShare } from '../src/hfp/registry.js';

// Captured from mqtt.hsl.fi on 2026-10-14.
const BUS_TOPIC = '/hfp/v2/journey/ongoing/vp/bus/0012/02227/4731/2/Hakaniemi/16:48/4960217/5/60;25/21/90/71';
const BUS_PAYLOAD = '{"VP":{"desi":"731","dir":"2","oper":12,"veh":2227,"tst":"2026-10-14T14:13:10.661Z","tsi":1791987190,'
  + '"spd":1.05,"hdg":196,"lat":60.297357,"long":25.101913,"acc":-0.98,"dl":119,"odo":12153,"drst":0,'
  + '"oday":"2026-10-14","jrn":1395,"line":360,"start":"16:48","loc":"GPS","stop":4960217,"route":"4731","occu":0}}';

test('parses a bus position', () => {
  const p = parsePosition(BUS_TOPIC, BUS_PAYLOAD);
  assert.equal(p.vehicleKey, '0012/02227');
  assert.equal(p.mode, 'bus');
  assert.equal(p.routeId, '4731');
  assert.equal(p.designation, '731');
  assert.equal(p.direction, 2);
  assert.equal(p.latitude, 60.297357);
  assert.equal(p.longitude, 25.101913);
  assert.equal(p.speed, 1.05);
  assert.equal(p.heading, 196);
  assert.equal(p.acceleration, -0.98);
  assert.equal(p.scheduleOffsetSeconds, 119);
  assert.equal(p.doorsOpen, false);
  assert.equal(p.occupancy, 0);
  assert.equal(p.timestamp, Date.parse('2026-10-14T14:13:10.661Z'));
});

test('missing optional fields become NaN or null', () => {
  const p = parsePosition('/hfp/v2/journey/ongoing/vp/metro/0050/00171/31M1/1/x',
    '{"VP":{"desi":"M1","dir":"1","lat":60.17,"long":24.77,"spd":18.7,"hdg":90,"acc":null,"dl":null,"drst":null,"occu":0}}');
  assert.equal(p.mode, 'metro');
  assert.ok(Number.isNaN(p.acceleration));
  assert.equal(p.scheduleOffsetSeconds, null);
  assert.equal(p.doorsOpen, null);
});

test('implausible schedule offsets become unknown', () => {
  // Captured: a parked commuter train reporting a six-hour "delay".
  assert.equal(parsePosition(BUS_TOPIC, BUS_PAYLOAD.replace('"dl":119', '"dl":-21755')).scheduleOffsetSeconds, null);
  assert.equal(parsePosition(BUS_TOPIC, BUS_PAYLOAD.replace('"dl":119', '"dl":-1500')).scheduleOffsetSeconds, -1500);
});

test('skips positions without coordinates and other event types', () => {
  assert.equal(parsePosition(BUS_TOPIC, '{"VP":{"desi":"731","lat":null,"long":null}}'), null);
  assert.equal(parsePosition(BUS_TOPIC.replace('/vp/', '/doo/'), BUS_PAYLOAD.replace('"VP"', '"DOO"')), null);
  assert.equal(parsePosition(BUS_TOPIC.replace('/bus/', '/hovercraft/'), BUS_PAYLOAD).mode, 'unknown');
});

test('parses traffic light and passed stop signals', () => {
  const tlr = '/hfp/v2/journey/ongoing/tlr/bus/0012/02526/4561/2/Itakeskus(M)/22:29/4500213/4/60;24/29/67/62/3939';
  const tla = '/hfp/v2/journey/ongoing/tla/bus/0012/01219/1069/2/Kamppi/21:54/1040130/4/60;24/19/72/08/110';
  const pas = '/hfp/v2/journey/ongoing/pas/bus/0012/02406/4560/1/Myyrmaki/22:18/1354101/4/60;24/29/52/58';
  assert.deepEqual(parseSignal(tlr, '{"TLR":{}}'), { vehicleKey: '0012/02526', type: EventType.TRAFFIC_LIGHT_REQUESTED });
  assert.deepEqual(parseSignal(pas, '{"PAS":{}}'), { vehicleKey: '0012/02406', type: EventType.PASSED_STOP });
  assert.equal(parseSignal(tla, '{"TLA":{"tlp-requestid":43,"tlp-decision":"ACK"}}').type, EventType.TRAFFIC_LIGHT_GRANTED);
  assert.equal(parseSignal(tla, '{"TLA":{"tlp-decision":"NAK"}}').type, EventType.TRAFFIC_LIGHT_REFUSED);
  assert.equal(parseSignal(BUS_TOPIC, BUS_PAYLOAD), null);
});

test('event type is the fifth topic level', () => {
  assert.equal(eventType(BUS_TOPIC), 'vp');
  assert.equal(eventType(BUS_TOPIC.replace('/vp/', '/tlr/')), 'tlr');
  assert.equal(eventType('/hfp/v2'), '');
});

const position = (key, speed, doorsOpen, dl, mode = 'bus') => ({
  vehicleKey: key, mode, routeId: '1', designation: '1', direction: 1, latitude: 60.17, longitude: 24.94,
  speed, heading: 0, acceleration: 0, scheduleOffsetSeconds: dl, doorsOpen, occupancy: 0, timestamp: 0,
});
const types = events => events.map(e => e.type);

test('first position appears; drain clears the queue', () => {
  const registry = new VehicleRegistry();
  registry.accept(position('a', 0, false, 0));
  assert.deepEqual(types(registry.drainEvents()), [EventType.APPEARED]);
  assert.equal(registry.vehicles.size, 1);
  assert.deepEqual(registry.drainEvents(), []);
});

test('door and speed transitions become events, without flapping', () => {
  const registry = new VehicleRegistry();
  for (const [speed, doors] of [[0, false], [0, true], [0, false], [5, false], [0.2, false]]) registry.accept(position('a', speed, doors, 0));
  assert.deepEqual(types(registry.drainEvents()), [EventType.APPEARED, EventType.DOORS_OPENED, EventType.DOORS_CLOSED, EventType.DEPARTED, EventType.STOPPED]);

  const jitter = new VehicleRegistry();
  for (const speed of [5, 1.0, 1.4, 0.8]) jitter.accept(position('b', speed, false, 0));
  assert.deepEqual(types(jitter.drainEvents()), [EventType.APPEARED]);
});

test('signals for known vehicles become events; silent vehicles are pruned', () => {
  const registry = new VehicleRegistry();
  registry.accept(position('a', 5, false, 0), 1000);
  registry.drainEvents();
  registry.acceptSignal({ vehicleKey: 'a', type: EventType.TRAFFIC_LIGHT_REQUESTED });
  registry.acceptSignal({ vehicleKey: 'unknown', type: EventType.PASSED_STOP });
  assert.deepEqual(types(registry.drainEvents()), [EventType.TRAFFIC_LIGHT_REQUESTED]);
  registry.pruneStale(60_000, 1000 + 60_001);
  assert.equal(registry.vehicles.size, 0);
  assert.deepEqual(types(registry.drainEvents()), [EventType.DISAPPEARED]);
});

test('snapshot aggregates per mode and counts late vehicles', () => {
  const registry = new VehicleRegistry();
  assert.equal(registry.snapshot(), EMPTY_SNAPSHOT);
  registry.accept(position('bus', 10, false, -300));
  registry.accept(position('tram', 0, true, null, 'tram'));
  const city = registry.snapshot();
  assert.deepEqual(city.byMode.get('bus'), { vehicles: 1, moving: 1, averageSpeed: 10, averageDelaySeconds: 300, doorsOpen: 0 });
  assert.deepEqual(city.byMode.get('tram'), { vehicles: 1, moving: 0, averageSpeed: 0, averageDelaySeconds: NaN, doorsOpen: 1 });
  assert.deepEqual([...city.byMode.keys()], ['bus', 'tram'], 'modes in fixed order');
  assert.equal(city.lateShare, 0.5);
  assert.equal(movingShare(city.all), 0.5);
  assert.equal(city.all.averageDelaySeconds, 300, 'dl -300 (late) counts as +300');
});
