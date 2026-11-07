import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closest, inside } from '@rulecad/fit';
import { box } from '../../test/box.mjs';

test('closest: the gap between two boxes', () => {
  const a = box([0, 0, 0], [10, 10, 10]), b = box([10.3, 0, 0], [20.3, 10, 10]);
  assert.ok(Math.abs(closest(a, b) - 0.3) < 1e-9);
});

test('closest: touching is 0, far apart is Infinity', () => {
  assert.equal(closest(box([0, 0, 0], [1, 1, 1]), box([1, 0, 0], [2, 1, 1])), 0);
  assert.equal(closest(box([0, 0, 0], [1, 1, 1]), box([50, 0, 0], [51, 1, 1])), Infinity);
});

test('inside: points in a solid, outside it, and in the gap between two parts of one', () => {
  const b = box([-5, -5, 0], [5, 5, 10]);
  assert.equal(inside([0, 0, 5], b), true);
  assert.equal(inside([20, 0, 5], b), false);
  assert.equal(inside([0, 0, -1], b), false);
  assert.equal(inside([4.99, 4.99, 0.01], b), true, 'near a corner');
  const two = [...box([-5, -5, 0], [-1, 5, 10]), ...box([1, -5, 0], [5, 5, 10])]; // a 2 mm slot between
  assert.equal(inside([0, 0, 5], two), false, 'in the slot');
  assert.equal(inside([3, 0, 5], two), true);
});

test('closestAt says where the gap is; distanceToFace measures to a face, not its corners', async () => {
  const { closestAt, distanceToFace } = await import('@rulecad/fit');
  const square = (z) => [[[-10, -10, z], [10, -10, z], [10, 10, z], [-10, 10, z]]];
  const r = closestAt(square(0), square(1));
  assert.ok(Math.abs(r.gap - 1) < 1e-9 && r.at && (Math.abs(r.at[2]) < 1e-9 || Math.abs(r.at[2] - 1) < 1e-9));
  assert.equal(closestAt(square(0), square(9)).at, null);
  assert.ok(Math.abs(distanceToFace([0, 0, 3], square(0)[0]) - 3) < 1e-9, 'straight above the middle, far from the corners');
});

test('solids that run into each other have no gap: a peg through a plate, a cube inside another; touching faces are not a crossing', async () => {
  const { closestAt, overlapAt } = await import('@rulecad/fit');
  const plate = box([-20, -20, 0], [20, 20, 2]), peg = box([-1, -1, -5], [1, 1, 10]); // the peg's corners are 1 mm from the plate's faces, yet it goes through
  const r = closestAt(plate, peg);
  assert.equal(r.gap, 0); assert.equal(r.overlap, true); assert.ok(r.at && Math.abs(r.at[0]) <= 1 && Math.abs(r.at[1]) <= 1 && r.at[2] >= 0 && r.at[2] <= 2, `where they cross: ${r.at}`);
  const outer = box([0, 0, 0], [10, 10, 10]), inner = box([3, 3, 3], [7, 7, 7]);
  assert.deepEqual([closestAt(outer, inner).gap, closestAt(inner, outer).gap], [0, 0], 'a cube wholly inside another: no surfaces cross, a corner is inside');
  assert.ok(overlapAt(outer, inner), 'overlapAt says where');
  assert.equal(overlapAt(box([0, 0, 0], [1, 1, 1]), box([1, 0, 0], [2, 1, 1])), null, 'touching face to face: not an overlap');
  assert.equal(closestAt(box([0, 0, 0], [1, 1, 1]), box([1, 0, 0], [2, 1, 1])).overlap, undefined);
  assert.ok(Math.abs(closest(box([0, 0, 0], [10, 10, 10]), box([10.3, 0, 0], [20.3, 10, 10])) - 0.3) < 1e-9, 'a gap is still a gap');
});

test('fit refuses what isn\'t faces or a point, by name', async () => {
  const { closestAt } = await import('@rulecad/fit');
  assert.throws(() => closest(null, box([0, 0, 0], [1, 1, 1])), /closestAt: a is a list of faces .* not null/);
  assert.throws(() => closest([[[0, 0, 0], [1, 0, 0]]], box([0, 0, 0], [1, 1, 1])), /a has a face that isn't three or more/);
  assert.throws(() => closestAt(box([0, 0, 0], [1, 1, 1]), box([0, 0, 0], [1, 1, 1]), -1), /reach is a distance above 0/);
  assert.throws(() => inside([0, 0], box([0, 0, 0], [1, 1, 1])), /the point is \[x, y, z\]/);
});
