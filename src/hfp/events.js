// Transport modes as they appear in the HFP topic, and the vehicle events the app reacts to.

export const MODES = ['bus', 'tram', 'metro', 'train', 'ferry', 'ubus', 'robot'];

export function modeFromTopicName(name) {
  return MODES.includes(name) ? name : 'unknown';
}

/** Something that happened to one vehicle; the hook for sounds and animations. */
export const EventType = Object.freeze({
  /** First message from a vehicle. */
  APPEARED: 'appeared',
  /** No message for a while; the vehicle was removed. */
  DISAPPEARED: 'disappeared',
  DOORS_OPENED: 'doorsOpened',
  DOORS_CLOSED: 'doorsClosed',
  /** Speed rose above the moving threshold. */
  DEPARTED: 'departed',
  /** Speed dropped below the stopped threshold. */
  STOPPED: 'stopped',
  /** Asked a traffic light for priority (HFP "tlr"). */
  TRAFFIC_LIGHT_REQUESTED: 'trafficLightRequested',
  /** The light accepted the request (HFP "tla" with decision ACK). */
  TRAFFIC_LIGHT_GRANTED: 'trafficLightGranted',
  /** The light refused the request ("tla" with any other decision). */
  TRAFFIC_LIGHT_REFUSED: 'trafficLightRefused',
  /** Drove past a stop without stopping: nobody waiting, nobody getting off (HFP "pas"). */
  PASSED_STOP: 'passedStop',
});
