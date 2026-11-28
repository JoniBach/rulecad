// Solids that overlap while sharing face planes (boxes side by side on one plane, a part placed twice, a bar flush
// with the end of a block): no edge of one passes through a face of the other and no corner is strictly inside it,
// yet they share real volume. fit must still call that an overlap, and still call face-to-face contact a touch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import jscad from '@jscad/modeling';
import { closestAt, overlapAt } from '@rulecad/fit';
import { box } from '../../../test/box.mjs';

const faces = (g) => jscad.geometries.geom3.toPolygons(g).map((p) => p.vertices.map((v) => [...v]));
const overlaps = (a, b, why) => {
  assert.ok(overlapAt(a, b), `${why}: overlapAt finds it`);
  assert.ok(overlapAt(b, a), `${why}: overlapAt finds it the other way round`);
  const r = closestAt(a, b);
  assert.equal(r.gap, 0, why); assert.equal(r.overlap, true, `${why}: closestAt says overlap`);
};
const touches = (a, b, why) => {
  assert.equal(overlapAt(a, b), null, `${why}: not an overlap`);
  assert.equal(overlapAt(b, a), null, `${why}: not an overlap the other way round`);
  const r = closestAt(a, b);
  assert.equal(r.gap, 0, why); assert.equal(r.overlap, undefined, `${why}: closestAt says no overlap`);
};

test('flush overlaps: half-shifted cubes, a cube placed twice, a cylinder placed twice and a flush-ended bar overlap', () => {
  const cube = box([0, 0, 0], [10, 10, 10]);
  overlaps(cube, box([5, 0, 0], [15, 10, 10]), 'cubes sharing half their volume, flush on four sides');
  overlaps(cube, box([5, 5, 0], [15, 15, 10]), 'cubes on one plane, offset in x and y (250 mm³ shared)');
  overlaps(cube, box([8, 0, 0], [18, 10, 10]), 'cubes overlapping 2 mm, flush in y and z');
  overlaps(cube, box([0, 0, 0], [10, 10, 10]), 'a cube placed twice');
  overlaps(cube, box([0, 0, 2], [10, 10, 8]), 'a slab inside a cube, flush on four sides');
  const cylinder = () => faces(jscad.primitives.cylinder({ radius: 5, height: 10, segments: 32 }));
  overlaps(cylinder(), cylinder(), 'a cylinder placed twice');
  overlaps(cube, box([6, 4, 0], [14, 6, 10]), 'a bar flush with the bottom and top of a block, its end 4 mm in');
  overlaps(cube, box([2, 2, 0], [8, 8, 10]), 'a post through a block, flush top and bottom');
  // made by JSCAD (polygons of four corners, not triangles), with a thin part: a 0.2 mm skin flush with a block
  overlaps(faces(jscad.primitives.cuboid({ size: [10, 10, 10], center: [5, 5, 5] })), faces(jscad.primitives.cuboid({ size: [20, 10, 0.2], center: [10, 5, 0.1] })), 'a 0.2 mm skin lying flush in a block');
});

test('face-to-face contact is still a touch, not an overlap: cubes side by side, stacked, edge to edge, and a cylinder on a block', () => {
  const cube = box([0, 0, 0], [10, 10, 10]);
  touches(cube, box([10, 0, 0], [20, 10, 10]), 'two cubes face to face');
  touches(cube, box([10, 5, 0], [20, 15, 10]), 'two cubes face to face, half offset');
  touches(cube, box([0, 0, 10], [10, 10, 20]), 'one cube on another');
  touches(cube, box([2, 2, 10], [8, 8, 12]), 'a small block on a big one');
  touches(cube, box([10, 10, 0], [20, 20, 10]), 'two cubes meeting along an edge');
  touches(cube, box([10, 10, 10], [20, 20, 20]), 'two cubes meeting at a corner');
  touches(faces(jscad.primitives.cylinder({ radius: 3, height: 4, segments: 24, center: [5, 5, 12] })), cube, 'a cylinder standing on a block');
  assert.ok(Math.abs(closestAt(cube, box([10.3, 0, 0], [20.3, 10, 10])).gap - 0.3) < 1e-9, 'a gap is still a gap');
});

test('a pin in a hole through a plate, both flush top and bottom: the hole\'s own size touches, a bigger pin overlaps; a mesh turned inside out is read the same', () => {
  const { cuboid, cylinder } = jscad.primitives, { subtract } = jscad.booleans;
  // the plate has big faces beside the hole's many small ones
  const plate = faces(subtract(cuboid({ size: [40, 40, 5], center: [0, 0, 2.5] }), cylinder({ radius: 3, height: 5, center: [0, 0, 2.5], segments: 64 })));
  const pin = (r) => faces(cylinder({ radius: r, height: 5, center: [0, 0, 2.5], segments: 64 }));
  touches(plate, pin(3), 'a pin the size of its hole');
  overlaps(plate, pin(3.5), 'a pin 0.5 mm over its hole');
  const cube = box([0, 0, 0], [10, 10, 10]), turned = cube.map((t) => [...t].reverse());
  touches(turned, box([10, 0, 0], [20, 10, 10]), 'inside out, face to face');
  overlaps(turned, box([5, 0, 0], [15, 10, 10]), 'inside out, half into each other');
});
