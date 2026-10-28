// Parses HSL High-frequency positioning (HFP v2) messages.
// Topic: /hfp/v2/journey/ongoing/<event>/<mode>/<operator>/<vehicle>/<route>/<direction>/...
// See https://digitransit.fi/en/developers/apis/5-realtime-api/vehicle-positions/high-frequency-positioning/

import { EventType, modeFromTopicName } from './events.js';

const EVENT_LEVEL = 5;
const MODE_LEVEL = 6;
const OPERATOR_LEVEL = 7;
const VEHICLE_LEVEL = 8;
const ROUTE_LEVEL = 9;

/**
 * Parked and depot vehicles (e.g. trains on line "X") report schedule offsets of hours from long-finished
 * journeys. Anything beyond this is treated as unknown rather than as a real delay.
 */
export const MAX_PLAUSIBLE_OFFSET_SECONDS = 30 * 60;

/** The HFP event type of a topic ("vp", "tlr", "pas", ...), or "" if the topic is too short. */
export function eventType(topic) {
  const levels = topic.split('/', EVENT_LEVEL + 1);
  return levels.length > EVENT_LEVEL ? levels[EVENT_LEVEL] : '';
}

/**
 * Parses a "vp" (vehicle position) message. Returns null for other event types and for positions
 * without coordinates. Missing numbers become NaN, missing flags null.
 *
 * Position fields: speed m/s, heading degrees clockwise from north, acceleration m/s²,
 * scheduleOffsetSeconds (HFP "dl": negative = behind schedule), doorsOpen, occupancy 0..100.
 */
export function parsePosition(topic, payload) {
  const levels = topic.split('/');
  if (levels.length <= VEHICLE_LEVEL || levels[EVENT_LEVEL] !== 'vp') return null;

  const vp = JSON.parse(payload).VP;
  if (!vp || missing(vp.lat) || missing(vp.long)) return null;

  return {
    vehicleKey: `${levels[OPERATOR_LEVEL]}/${levels[VEHICLE_LEVEL]}`,
    mode: modeFromTopicName(levels[MODE_LEVEL]),
    routeId: levels.length > ROUTE_LEVEL ? levels[ROUTE_LEVEL] : '',
    designation: missing(vp.desi) ? '' : String(vp.desi),
    direction: missing(vp.dir) ? 0 : Number(vp.dir),
    latitude: Number(vp.lat),
    longitude: Number(vp.long),
    speed: number(vp.spd),
    heading: number(vp.hdg),
    acceleration: number(vp.acc),
    scheduleOffsetSeconds: plausibleOffset(vp.dl),
    doorsOpen: missing(vp.drst) ? null : Number(vp.drst) === 1,
    occupancy: missing(vp.occu) ? null : Number(vp.occu),
    timestamp: missing(vp.tst) ? Date.now() : Date.parse(vp.tst) || Date.now(),
  };
}

/**
 * Parses traffic light ("tlr", "tla") and passed-stop ("pas") messages into { vehicleKey, type }.
 * Returns null for every other event type.
 */
export function parseSignal(topic, payload) {
  const levels = topic.split('/');
  if (levels.length <= VEHICLE_LEVEL) return null;
  let type;
  switch (levels[EVENT_LEVEL]) {
    case 'tlr':
      type = EventType.TRAFFIC_LIGHT_REQUESTED;
      break;
    case 'pas':
      type = EventType.PASSED_STOP;
      break;
    case 'tla': {
      const tla = JSON.parse(payload).TLA;
      type = tla && tla['tlp-decision'] === 'ACK' ? EventType.TRAFFIC_LIGHT_GRANTED : EventType.TRAFFIC_LIGHT_REFUSED;
      break;
    }
    default:
      return null;
  }
  return { vehicleKey: `${levels[OPERATOR_LEVEL]}/${levels[VEHICLE_LEVEL]}`, type };
}

function plausibleOffset(dl) {
  if (missing(dl)) return null;
  const offset = Math.trunc(Number(dl));
  return Math.abs(offset) > MAX_PLAUSIBLE_OFFSET_SECONDS ? null : offset;
}

function missing(value) {
  return value === undefined || value === null;
}

function number(value) {
  return missing(value) ? NaN : Number(value);
}
