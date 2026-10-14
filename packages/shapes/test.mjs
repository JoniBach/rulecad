import { test } from 'node:test';
import assert from 'node:assert/strict';
import { text, anchor, size } from '@rulecad/shapes';

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
