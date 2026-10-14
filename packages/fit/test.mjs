import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closest } from '@rulecad/fit';
import { box } from '../../test/box.mjs';

test('closest: the gap between two boxes', () => {
  const a = box([0, 0, 0], [10, 10, 10]), b = box([10.3, 0, 0], [20.3, 10, 10]);
  assert.ok(Math.abs(closest(a, b) - 0.3) < 1e-9);
});

test('closest: touching is 0, far apart is Infinity', () => {
  assert.equal(closest(box([0, 0, 0], [1, 1, 1]), box([1, 0, 0], [2, 1, 1])), 0);
  assert.equal(closest(box([0, 0, 0], [1, 1, 1]), box([50, 0, 0], [51, 1, 1])), Infinity);
});
