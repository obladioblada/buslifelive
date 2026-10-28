// Movable, minimizable widgets. The panels are drawn on the p5 canvas, which ignores the mouse so the map
// can be dragged. Each visible panel therefore gets an invisible HTML handle laid exactly over it:
// dragging the handle moves the panel, and a small button in its top-right corner minimizes it to a title
// bar (click the bar to open it again). Positions (top-left corners), stacking order and minimized panels
// are remembered in the visitor's browser; a panel that was never moved stays at its default corner.

const POSITIONS_KEY = 'buslife.layout';
const ORDER_KEY = 'buslife.layout.order';
const MINIMIZED_KEY = 'buslife.layout.minimized';
/** Distance from the screen edge that panels snap to... */
const MARGIN = 16;
/** ...when dropped this close to it. */
const SNAP = 28;
/** A press that moves less than this is a click, not a drag. */
const DRAG_THRESHOLD = 4;

export class Layout {
  constructor(container = document.body) {
    this.container = container;
    this.positions = load(POSITIONS_KEY, {});
    /** Drawing order, back to front: the panel moved last is drawn on top. */
    this.order = load(ORDER_KEY, []);
    this.minimized = new Set(load(MINIMIZED_KEY, []));
    /** name -> { full: { w, h }, bar: { w, h } } */
    this.sizes = {};
    /** name -> { element, button, rect (where the panel was drawn last frame) } */
    this.panels = new Map();
    this.dragging = null;
    /** The panel under the mouse, so its minimize button can be drawn brighter. */
    this.hovered = null;
    window.addEventListener('pointerup', event => this.endDrag(event));
  }

  /**
   * Where to draw a panel this frame, given the size it will have: its saved top-left corner kept on
   * screen, or null for the default position.
   */
  position(name, w, h, screenWidth, screenHeight) {
    const saved = this.positions[name];
    return saved ? keepOnScreen(saved, w, h, screenWidth, screenHeight) : null;
  }

  /** The panel's size open ('full') and minimized ('bar'), reported every frame before drawing. */
  setSizes(name, sizes) {
    this.sizes[name] = sizes;
  }

  isMinimized(name) {
    return this.minimized.has(name);
  }

  /**
   * Opens or minimizes a panel without it jumping: a moved panel keeps the edge nearest to the screen
   * edge (in the lower half it keeps its bottom edge and grows upwards; on the right it keeps its right
   * edge), so opening and closing feels anchored to its corner.
   */
  toggleMinimized(name) {
    const minimizing = !this.minimized.has(name);
    const sizes = this.sizes[name];
    const saved = this.positions[name];
    if (saved && sizes) {
      const from = minimizing ? sizes.full : sizes.bar, to = minimizing ? sizes.bar : sizes.full;
      const W = window.innerWidth, H = window.innerHeight;
      const x = saved.x + from.w / 2 > W / 2 ? saved.x + from.w - to.w : saved.x;
      const y = saved.y + from.h / 2 > H / 2 ? saved.y + from.h - to.h : saved.y;
      this.positions[name] = keepOnScreen({ x, y }, to.w, to.h, W, H);
      save(POSITIONS_KEY, this.positions);
    }
    if (minimizing) this.minimized.add(name);
    else this.minimized.delete(name);
    save(MINIMIZED_KEY, [...this.minimized]);
  }

  /** Panel names sorted back to front (panels never moved keep the given default order). */
  sorted(names) {
    const rank = name => this.order.indexOf(name);
    return [...names].sort((a, b) => rank(a) - rank(b));
  }

  /** Call after drawing a panel with the rectangle it used, or null when it is hidden. */
  placed(name, rect) {
    let panel = this.panels.get(name);
    if (!panel) {
      panel = this.createHandle(name);
      this.panels.set(name, panel);
    }
    panel.rect = rect;
    const style = panel.element.style;
    if (!rect) {
      if (style.display !== 'none') style.display = 'none';
      return;
    }
    const value = (key, v) => {
      const px = `${Math.round(v)}px`;
      if (style[key] !== px) style[key] = px;
    };
    if (style.display === 'none') style.display = '';
    value('left', rect.x);
    value('top', rect.y);
    value('width', rect.w);
    value('height', rect.h);
    const label = this.isMinimized(name) ? 'Expand' : 'Minimize';
    if (panel.button.getAttribute('aria-label') !== label) {
      panel.button.setAttribute('aria-label', label);
      panel.button.title = label;
    }
  }

  createHandle(name) {
    const element = document.createElement('div');
    element.className = 'drag-handle';
    element.dataset.panel = name;
    element.title = 'Drag to move';

    // Invisible button over the "–" / "+" the canvas draws in the corner.
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'minimize-button';
    button.addEventListener('click', event => {
      event.stopPropagation();
      this.toggleMinimized(name);
    });
    element.appendChild(button);

    element.addEventListener('pointerdown', event => this.startDrag(name, element, event));
    element.addEventListener('pointermove', event => this.moveDrag(event));
    // A drop must always end the drag, however the browser reports it.
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      element.addEventListener(type, event => this.endDrag(event));
    }
    element.addEventListener('pointerenter', () => { this.hovered = name; });
    element.addEventListener('pointerleave', () => { if (this.hovered === name) this.hovered = null; });
    this.container.appendChild(element);
    element.style.zIndex = String(this.order.indexOf(name) + 2);
    return { element, button, rect: null };
  }

  startDrag(name, element, event) {
    const rect = this.panels.get(name)?.rect;
    if (!rect || event.button > 0 || event.target.closest('.minimize-button')) return;
    element.setPointerCapture(event.pointerId);
    this.dragging = { name, element, startX: event.clientX, startY: event.clientY, from: { x: rect.x, y: rect.y },
      size: rect, moved: false };
    // Bring it to the front.
    this.order = [...this.order.filter(n => n !== name), name];
    this.restack();
    event.preventDefault();
  }

  moveDrag(event) {
    const d = this.dragging;
    if (!d) return;
    const dx = event.clientX - d.startX, dy = event.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (!d.moved) {
      d.moved = true;
      d.element.classList.add('dragging');
    }
    this.positions[d.name] = keepOnScreen({ x: d.from.x + dx, y: d.from.y + dy },
      d.size.w, d.size.h, window.innerWidth, window.innerHeight);
  }

  endDrag(event) {
    const d = this.dragging;
    if (!d) return;
    this.dragging = null;
    d.element.classList.remove('dragging');
    if (d.moved) {
      this.positions[d.name] = snap(this.positions[d.name], d.size.w, d.size.h, window.innerWidth, window.innerHeight);
      save(POSITIONS_KEY, this.positions);
    } else if (event.type === 'pointerup' && this.isMinimized(d.name)) {
      // A click on a minimized bar opens it again.
      this.toggleMinimized(d.name);
    }
    save(ORDER_KEY, this.order);
  }

  /** Handles stack like the panels, so the one on top is the one you grab. */
  restack() {
    for (const [name, panel] of this.panels) panel.element.style.zIndex = String(this.order.indexOf(name) + 2);
  }
}

/** Snaps to the screen edges when dropped within SNAP of them. */
export function snap({ x, y }, w, h, screenWidth, screenHeight) {
  if (x < MARGIN + SNAP) x = MARGIN;
  else if (screenWidth - (x + w) < MARGIN + SNAP) x = screenWidth - w - MARGIN;
  if (y < MARGIN + SNAP) y = MARGIN;
  else if (screenHeight - (y + h) < MARGIN + SNAP) y = screenHeight - h - MARGIN;
  return { x, y };
}

/** Keeps the whole panel on screen (e.g. after the window got smaller). */
export function keepOnScreen({ x, y }, w, h, screenWidth, screenHeight) {
  return {
    x: Math.max(0, Math.min(x, screenWidth - w)),
    y: Math.max(0, Math.min(y, screenHeight - h)),
  };
}

export function load(key, fallback) {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? 'null');
    return saved && typeof saved === 'object' ? saved : fallback;
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not remembered this time; the layout still applies until the page is closed.
  }
}
