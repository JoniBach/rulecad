import { test } from 'node:test';
import assert from 'node:assert/strict';
import { check, seams, bounds, shape } from '@rulecad/printcheck';
import { box } from '../../test/box.mjs';
import { tri, union, translate, cuboid } from '../../test/jscad.mjs';

const printer = { bed: 256, overhang: 45, layer: 0.2, support_gap: 0.2, bridge: 5 };
const level = (findings, re) => findings.find((f) => re.test(f.text))?.level;

test('a cube on the bed passes everything', () => {
  const found = check(box([-5, -5, 0], [5, 5, 10]), printer);
  assert.ok(found.every((f) => f.level === 'pass'), JSON.stringify(found));
});

test('floating and oversized parts fail', () => {
  assert.equal(level(check(box([-5, -5, 3], [5, 5, 13]), printer), /not on the bed/), 'fail');
  assert.equal(level(check(box([-150, -5, 0], [150, 5, 10]), printer), /bed/), 'fail');
});

test('bridges past the printer\'s limit are a warning', () => {
  const tee = (reach) => tri(union(translate([0, 0, 5], cuboid({ size: [4, 4, 10] })), translate([0, 0, 11], cuboid({ size: [2 * reach, 4, 2] }))));
  assert.equal(level(check(tee(10), printer), /bridge/), 'warn'); // arms reach 8 mm out from the post
  assert.equal(level(check(tee(4), printer), /bridge/), 'pass'); // 2 mm
});

test('breakaway supports pass; parts that start in mid-air are caught', () => {
  const pillar = box([-3, -3, 0], [3, 3, 0.8]);
  assert.equal(level(check([...pillar, ...box([-2, -2, 1], [2, 2, 5])], printer), /breakaway/), 'pass'); // one 0.2 mm gap
  assert.equal(level(check([...pillar, ...box([-2, -2, 4], [2, 2, 8])], printer), /mid-air/), 'warn');
});

test('seams: open edges are holes; a cube is closed', () => {
  assert.equal(seams(box([0, 0, 0], [1, 1, 1])).gaps, 0);
  assert.ok(seams(box([0, 0, 0], [1, 1, 1]).slice(2)).gaps > 0);
});

test('bounds', () => {
  assert.deepEqual(bounds(box([1, 2, 3], [4, 6, 8])).size, [3, 4, 5]);
});

test('pieces and tips: a loose block is a second piece, a cavity is not; a cone hanging point-down starts in mid-air', () => {
  const box = (x0, y0, z0, s) => { // a closed cube as quads, outward
    const v = (i, j, k) => [x0 + i * s, y0 + j * s, z0 + k * s];
    return [[v(0,0,0), v(0,1,0), v(1,1,0), v(1,0,0)], [v(0,0,1), v(1,0,1), v(1,1,1), v(0,1,1)], [v(0,0,0), v(1,0,0), v(1,0,1), v(0,0,1)],
      [v(0,1,0), v(0,1,1), v(1,1,1), v(1,1,0)], [v(0,0,0), v(0,0,1), v(0,1,1), v(0,1,0)], [v(1,0,0), v(1,1,0), v(1,1,1), v(1,0,1)]];
  };
  const printer = { bed: 256, overhang: 45, layer: 0.2 };
  const one = check(box(0, 0, 0, 10), printer), two = check([...box(0, 0, 0, 10), ...box(20, 0, 0, 2)], printer);
  assert.equal(one.find((f) => f.code === 'print.pieces').level, 'pass');
  assert.match(two.find((f) => f.code === 'print.pieces').text, /^2 pieces: 1 loose from the main one \(8 mm³\)/);
  const cavity = [...box(0, 0, 0, 10), ...box(3, 3, 3, 2).map((q) => [...q].reverse())];
  assert.equal(shape(cavity).pieces.length, 1);
  // A block on the bed with a cone hanging under an arm: its point is a tip; the block's floor corners aren't
  const tip = [5, 15, 4], ring = Array.from({ length: 8 }, (_, i) => [5 + 3 * Math.cos(i * Math.PI / 4), 15 + 3 * Math.sin(i * Math.PI / 4), 8]);
  const cone = ring.map((p, i) => [tip, ring[(i + 1) % 8], p]);
  const found = check([...box(0, 0, 0, 10), ...cone], printer).find((f) => f.code === 'print.island');
  assert.equal(found.level, 'warn');
  assert.deepEqual(found.values.points, [tip]);
  assert.equal(check(box(0, 0, 0, 10), printer).find((f) => f.code === 'print.island').level, 'pass');
});
