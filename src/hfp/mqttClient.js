// Streams HSL High-frequency positioning (HFP) messages into a VehicleRegistry.
// Browsers cannot open raw TCP, so this uses MQTT over secure WebSockets (wss://mqtt.hsl.fi),
// which HSL offers next to the TCP port the Java app uses. Public broker, no credentials.

import { eventType, parsePosition, parseSignal } from './parser.js';

export const BROKER_URL = 'wss://mqtt.hsl.fi:443/';
const TOPIC_PREFIX = '/hfp/v2/journey/ongoing/';
/** Positions plus the one-off events we visualise: traffic light request/answer and passed stops. */
const EVENT_TYPES = ['vp', 'tlr', 'tla', 'pas'];
const STALE_AFTER_MILLIS = 60_000;

export class HslMqttClient {
  /** @param mqttLib the mqtt.js browser build (global `mqtt` from index.html) */
  constructor(registry, mqttLib = globalThis.mqtt) {
    this.registry = registry;
    this.mqtt = mqttLib;
    this.messageCount = 0;
    this.decoder = new TextDecoder();
  }

  start() {
    this.client = this.mqtt.connect(BROKER_URL, {
      clientId: 'buslife-web-' + Math.random().toString(16).slice(2, 10),
      clean: true,
      keepalive: 30,
      reconnectPeriod: 5000,
    });
    this.client.on('connect', () => {
      console.info('MQTT connected, subscribing to', EVENT_TYPES.join(', '));
      this.client.subscribe(EVENT_TYPES.map(type => TOPIC_PREFIX + type + '/#'), { qos: 0 });
    });
    this.client.on('reconnect', () => console.info('MQTT reconnecting'));
    this.client.on('error', error => console.warn('MQTT error', error.message));
    this.client.on('message', (topic, payload) => this.onMessage(topic, payload));
    this.pruneTimer = setInterval(() => this.registry.pruneStale(STALE_AFTER_MILLIS), 5000);
  }

  onMessage(topic, payload) {
    this.messageCount++;
    try {
      const text = this.decoder.decode(payload);
      if (eventType(topic) === 'vp') {
        const position = parsePosition(topic, text);
        if (position) this.registry.accept(position);
      } else {
        const signal = parseSignal(topic, text);
        if (signal) this.registry.acceptSignal(signal);
      }
    } catch {
      // Skip malformed messages.
    }
  }

  close() {
    clearInterval(this.pruneTimer);
    this.client?.end(true);
  }
}
