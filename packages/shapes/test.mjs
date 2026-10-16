import { test } from 'node:test';
import assert from 'node:assert/strict';
import { text, anchor, size, outline, slab, shell, lid, dovetail, gabled, diamond } from '@rulecad/shapes';
import jscad from '@jscad/modeling';
const box = (g) => { const [lo, hi] = jscad.measurements.measureBoundingBox(g); return hi.map((h, i) => +(h - lo[i]).toFixed(3)); };
const volume = (g) => jscad.measurements.measureVolume(g);

const measure = (t, h = 4) => size(text({ text: t, height: h, stroke: 0.84 }));

test('text: one scale for all, punctuation stays small, arrows are drawn', () => {
  assert.ok(Math.abs(measure('H')[1] - 4.84) < 0.01, 'a capital is the height, plus a stroke');
  assert.ok(measure('.')[0] < 2 && measure('-')[1] < 1);
  for (const a of ['↑', '↓', '←', '→']) assert.ok(measure(a).every((x) => x > 1), `${a} is drawn`);
});

test('anchor: nine places on a face', () => {
  assert.deepEqual(anchor({ width: 10, depth: 10 }, [2, 2], 'mc'), [0, 0]);
  const [x, y] = anchor({ width: 10, depth: 10 }, [2, 2], 'tl');
  assert.ok(x < 0 && y > 0, 'top left is left and to the back');
  assert.throws(() => anchor({ width: 10, depth: 10 }, [2, 2], 'xx'), /one of tl/);
});

test('enclosure: slabs, shells and lids keep their sizes; slopes come off the edges', () => {
  const o = { width: 72, height: 40, round: 6 };
  assert.deepEqual(box(slab({ ...o, depth: 20 })), [72, 40, 20]);
  const sloped = slab({ ...o, depth: 20, bottom: 0.4, top: 2 });
  assert.deepEqual(box(sloped), [72, 40, 20]);
  assert.ok(volume(sloped) < volume(slab({ ...o, depth: 20 })), 'the slopes take material off');
  const s = shell({ ...o, depth: 20, wall: 2, floor: 1.6, bottom: 0.4 });
  assert.ok(volume(s) < volume(slab({ ...o, depth: 20 })) / 2, 'hollow');
  const l = lid({ ...o, thick: 2.4, edge: 1.2, wall: 2, fit: 0.2, lip: 2, ring: 1.2 });
  assert.deepEqual(box(l), [72, 40, 4.4], 'plate and lip');
  assert.throws(() => slab({ ...o, depth: 2, top: 2 }), /need more than/);
  assert.throws(() => outline(0, 4), /not a shape/);
  assert.deepEqual(box(slab({ width: 30, height: 20, depth: 5, bevel: 4 })), [30, 20, 5]);
});

test('enclosure: a dovetail slot takes its rail, with the gap all round', () => {
  const rail = size(dovetail({ base: 6, height: 1.6 })), slot = size(dovetail({ base: 6, height: 1.6, gap: 0.2 }));
  assert.deepEqual(rail.map((x) => +x.toFixed(3)), [9.2, 1.6]);
  assert.ok(slot[0] > rail[0] + 0.4 - 1e-9);
  assert.deepEqual(box(gabled([0, 10], [0, 3], [0, 4])), [10, 3, 9]);
  assert.ok(Math.abs(box(diamond(2, 'y'))[0] - 2) < 1e-9);
});
