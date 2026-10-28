// The round Mute and Settings buttons can each be dragged anywhere. A short press is still a click; only a
// real drag (more than a few pixels) moves the button, snaps it to the screen edges and remembers where
// it was dropped. Buttons never moved sit at their default place (a pair at the bottom centre).

import { keepOnScreen, load, save, snap } from './layout.js';

const STORAGE_KEY = 'buslife.buttons';
const DRAG_THRESHOLD = 4;

export class MovableButtons {
  /**
   * @param defaults name -> () => { x, y }: default top-left corner for the current window size
   * @param onMoved called after a button moved (e.g. to keep the Settings menu next to its button)
   */
  constructor(defaults, onMoved = () => {}) {
    this.defaults = defaults;
    this.onMoved = onMoved;
    this.positions = load(STORAGE_KEY, {});
    this.elements = new Map();
    this.dragging = null;
    this.suppressClickOn = null;
    // After a drag, swallow the click the browser sends on release, so a move never mutes or opens Settings.
    window.addEventListener('click', event => {
      if (this.suppressClickOn && this.suppressClickOn.contains(event.target)) {
        event.stopImmediatePropagation();
        event.preventDefault();
      }
      this.suppressClickOn = null;
    }, true);
    window.addEventListener('resize', () => this.place());
  }

  add(name, element) {
    this.elements.set(name, element);
    element.addEventListener('pointerdown', event => {
      if (event.button > 0) return;
      const rect = element.getBoundingClientRect();
      this.dragging = { name, element, startX: event.clientX, startY: event.clientY, from: { x: rect.left, y: rect.top },
        size: rect, moved: false, pointerId: event.pointerId };
    });
    element.addEventListener('pointermove', event => this.move(event));
    element.addEventListener('pointerup', event => this.end(event));
    element.addEventListener('pointercancel', event => this.end(event));
    this.place();
  }

  move(event) {
    const d = this.dragging;
    if (!d) return;
    const dx = event.clientX - d.startX, dy = event.clientY - d.startY;
    if (!d.moved) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      d.moved = true;
      d.element.setPointerCapture(d.pointerId);
      d.element.classList.add('moving');
    }
    this.positions[d.name] = keepOnScreen({ x: d.from.x + dx, y: d.from.y + dy },
      d.size.width, d.size.height, window.innerWidth, window.innerHeight);
    this.place();
  }

  end(event) {
    const d = this.dragging;
    if (!d) return;
    this.dragging = null;
    if (!d.moved) return;
    this.move(event);
    d.element.classList.remove('moving');
    this.positions[d.name] = snap(this.positions[d.name], d.size.width, d.size.height, window.innerWidth, window.innerHeight);
    save(STORAGE_KEY, this.positions);
    this.suppressClickOn = d.element;
    this.place();
  }

  /** Puts every button at its saved place (kept on screen) or its default place. */
  place() {
    for (const [name, element] of this.elements) {
      const size = element.getBoundingClientRect();
      const saved = this.positions[name];
      const { x, y } = saved
        ? keepOnScreen(saved, size.width, size.height, window.innerWidth, window.innerHeight)
        : this.defaults[name]();
      element.style.left = `${Math.round(x)}px`;
      element.style.top = `${Math.round(y)}px`;
    }
    this.onMoved();
  }
}
