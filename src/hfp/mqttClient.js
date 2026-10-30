// Streams HSL High-frequency positioning (HFP) messages into a VehicleRegistry.
// Browsers cannot open raw TCP, so this uses MQTT over secure WebSockets (wss://mqtt.hsl.fi),
// which HSL offers next to the TCP port the Java app uses. Public broker, no credentials.
//
// Only the area being looked at is received: HFP topics end with a location code ("geohash"), so the
// client subscribes to the positions in the map cells that cover the view plus a margin, and swaps
// subscriptions as the visitor pans and zooms. That cuts the data a phone has to handle from ~1,400
// messages a second (the whole region) to the part of the city on screen.

import { eventType, parsePosition, parseSignal } from './parser.js';
import { areaTopics } from './geohash.js';

export const BROKER_URL = 'wss://mqtt.hsl.fi:443/';
export const TOPIC_PREFIX = '/hfp/v2/journey/ongoing/';
/**
 * One-off events (traffic light request/answer, passed stops) are few, so they are received for the
 * whole region and only applied to vehicles already tracked in the area.
 */
const SIGNAL_TOPICS = ['tlr', 'tla', 'pas'].map(type => TOPIC_PREFIX + type + '/#');
const STALE_AFTER_MILLIS = 60_000;

export class HslMqttClient {
  /** @param mqttLib the mqtt.js browser build (global `mqtt` from index.html) */
  constructor(registry, mqttLib = globalThis.mqtt) {
    this.registry = registry;
    this.mqtt = mqttLib;
    this.messageCount = 0;
    this.decoder = new TextDecoder();
    /** Position topics currently subscribed (one per map cell). */
    this.positionTopics = new Set();
    /** The area wanted, kept until connected. */
    this.wantedTopics = new Set();
  }

  start() {
    this.client = this.mqtt.connect(BROKER_URL, {
      clientId: 'buslife-web-' + Math.random().toString(16).slice(2, 10),
      clean: true,
      keepalive: 30,
      reconnectPeriod: 5000,
    });
    this.client.on('connect', () => {
      // A clean session forgets subscriptions, so (re)subscribe everything on every connect.
      this.positionTopics = new Set();
      this.client.subscribe(SIGNAL_TOPICS, { qos: 0 });
      this.applyArea();
      console.info('MQTT connected');
    });
    this.client.on('reconnect', () => console.info('MQTT reconnecting'));
    this.client.on('error', error => console.warn('MQTT error', error.message));
    this.client.on('message', (topic, payload) => this.onMessage(topic, payload));
    this.pruneTimer = setInterval(() => this.registry.pruneStale(STALE_AFTER_MILLIS), 5000);
  }

  /**
   * Receive positions only inside this area: { south, west, north, east } in degrees. Subscribes to the
   * new map cells and drops the ones no longer needed.
   */
  setArea(area) {
    this.wantedTopics = new Set(areaTopics(area, TOPIC_PREFIX + 'vp/'));
    this.applyArea();
  }

  applyArea() {
    if (!this.client?.connected) return;
    const add = [...this.wantedTopics].filter(t => !this.positionTopics.has(t));
    const drop = [...this.positionTopics].filter(t => !this.wantedTopics.has(t));
    if (drop.length) this.client.unsubscribe(drop);
    if (add.length) this.client.subscribe(add, { qos: 0 });
    this.positionTopics = new Set(this.wantedTopics);
    if (add.length || drop.length) console.info(`MQTT area: ${this.positionTopics.size} map cells (+${add.length} −${drop.length})`);
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
