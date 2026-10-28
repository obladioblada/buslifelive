// Fixed-size history of where a vehicle has been.

export class VehicleTrail {
  constructor(capacity) {
    this.points = new Array(capacity);
    this.next = 0;
    this.size = 0;
  }

  add(latitude, longitude, timeMillis) {
    this.points[this.next] = { latitude, longitude, timeMillis };
    this.next = (this.next + 1) % this.points.length;
    this.size = Math.min(this.size + 1, this.points.length);
  }

  /** Points recorded after sinceMillis, oldest first. */
  since(sinceMillis) {
    const result = [];
    const n = this.points.length;
    for (let i = 0; i < this.size; i++) {
      const point = this.points[(this.next - this.size + i + n) % n];
      if (point.timeMillis > sinceMillis) result.push(point);
    }
    return result;
  }
}
