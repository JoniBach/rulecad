import { test } from 'node:test';
import assert from 'node:assert/strict';
import { check, seams, bounds } from '@rulecad/printcheck';
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
