// Movable panels: snapping to screen edges and staying on screen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keepOnScreen, snap } from '../src/ui/layout.js';

const W = 1600, H = 1000, w = 400, h = 300;

test('panels dropped near an edge snap to the 16 px margin', () => {
  assert.deepEqual(snap({ x: 30, y: 25 }, w, h, W, H), { x: 16, y: 16 }, 'top-left corner');
  assert.deepEqual(snap({ x: W - w - 40, y: H - h - 10 }, w, h, W, H), { x: W - w - 16, y: H - h - 16 }, 'bottom-right corner');
});

test('panels dropped away from the edges stay where they were dropped', () => {
  assert.deepEqual(snap({ x: 500, y: 320 }, w, h, W, H), { x: 500, y: 320 });
});

test('panels are kept fully on screen', () => {
  assert.deepEqual(keepOnScreen({ x: -50, y: 2000 }, w, h, W, H), { x: 0, y: H - h });
  assert.deepEqual(keepOnScreen({ x: 1500, y: 10 }, w, h, 1200, 800), { x: 800, y: 10 }, 'after the window got smaller');
});
