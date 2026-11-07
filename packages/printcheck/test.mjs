import { test } from 'node:test';
import assert from 'node:assert/strict';
import { check, seams, bounds, shape, islands } from '@rulecad/printcheck';
import { box } from '../../test/box.mjs';
import { tri, union, translate, cuboid } from '../../test/jscad.mjs';
import jscad from '@jscad/modeling';

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

test('bridges past the printer\'s limit are a warning; an underside held on one side only is a ledge, however short the reach past a line', () => {
  const bridge = (span) => tri(union(translate([-span / 2 - 1, 0, 5], cuboid({ size: [2, 4, 10] })), translate([span / 2 + 1, 0, 5], cuboid({ size: [2, 4, 10] })), translate([0, 0, 11], cuboid({ size: [span + 4, 4, 2] }))));
  assert.equal(level(check(bridge(8), printer), /bridge/), 'warn'); // 8 mm between the posts
  assert.equal(level(check(bridge(4), printer), /bridge/), 'pass'); // 4 mm
  const tee = (reach) => tri(union(translate([0, 0, 5], cuboid({ size: [4, 4, 10] })), translate([0, 0, 11], cuboid({ size: [2 * reach, 4, 2] }))));
  const f = check(tee(10), printer).find((x) => x.code === 'print.ledge');
  assert.ok(f && f.level === 'warn' && Math.abs(f.values.reach - 8) < 0.2, `arms reaching 8 mm out from the post are ledges: ${f?.text}`); // not a 16 mm bridge
  assert.equal(level(check(tee(2.6), printer), /ledge/), 'warn'); // 0.6 mm out: past a line, drooping
  assert.equal(level(check(tee(2.2), printer), /ledge/), undefined); // 0.2 mm: within a line, held by the one beside it
});

test('breakaway supports pass; parts that start in mid-air are caught', () => {
  const pillar = box([-3, -3, 0], [3, 3, 0.8]);
  assert.equal(level(check([...pillar, ...box([-2, -2, 1], [2, 2, 5])], printer), /breakaway/), 'pass'); // one 0.2 mm gap
  assert.equal(level(check([...pillar, ...box([-2, -2, 4], [2, 2, 8])], printer), /mid-air/), 'warn');
});

test('an underside narrower than a print line is a sliver, not a start in mid-air', () => {
  const post = box([-2, -2, 0], [2, 2, 10]);
  assert.equal(level(check([...post, ...box([2, -1, 6], [2.3, 1, 10])], printer), /underside.*mid-air/), undefined); // a 0.3 mm tab on the side
  assert.equal(level(check([...post, ...box([2, -1, 6], [3, 1, 10])], printer), /underside.*mid-air/), 'warn'); // a 1 mm one hangs
});

test('a slope cut in layers is steps no wider than a line: an overhang, not bridges; and two undersides at one height are measured apart', () => {
  // A block on two feet, its underside between them stepping in at 45° from each foot, a layer in for each layer up
  // (how a lamina roofs a pocket): a stair of 0.2 mm treads, none a bridge
  const block = translate([0, 0, 4.5], cuboid({ size: [16, 10, 9] })), gap = [translate([0, 0, 2], cuboid({ size: [8, 10, 4] }))];
  for (let k = 0; k < 20; k++) gap.push(translate([0, 0, 4.1 + k * 0.2], cuboid({ size: [8 - 0.4 * (k + 1), 10, 0.2] }))); // the gap closes 0.2 mm a side each layer up
  const f = check(tri(jscad.booleans.subtract(block, union(...gap))), printer);
  assert.equal(f.filter((x) => /bridge|mid-air/.test(x.text) && x.level !== 'pass').map((x) => x.text).join('; '), '', 'no bridge past the limit, nothing in mid-air');
  // At one height, a 4 mm bridge between its posts and, 40 mm off, a slab held by nothing: the slab starts in mid-air,
  // not a 40 mm bridge to the other's posts
  const span = union(translate([-23, 0, 5], cuboid({ size: [2, 4, 10] })), translate([-17, 0, 5], cuboid({ size: [2, 4, 10] })), translate([-20, 0, 9], cuboid({ size: [8, 4, 2] })));
  const two = check(tri(union(span, translate([20, 0, 9], cuboid({ size: [8, 4, 2] })))), printer).filter((x) => x.code === 'print.bridge' || x.code === 'print.mid-air');
  assert.deepEqual(two.map((x) => [x.level, x.values.span == null ? null : +x.values.span.toFixed(2)]), [['pass', 4], ['warn', null]], two.map((x) => x.text).join('; '));
});

test('the first layer: two parts printed in place nearer than the gap plus the spread each side print as one; apart, or one lifted off the bed, they don\'t', () => {
  const squash = { ...printer, line: 0.42, print_gap: 0.3, foot: 0.15 }; // needs 0.6 mm on the bed
  const pair = (gap, lift = 0) => tri(union(translate([-2 - gap / 2, 0, 5], cuboid({ size: [4, 4, 10] })), translate([2 + gap / 2, 0, 5 + lift], cuboid({ size: [4, 4, 10] }))));
  const f = (polys) => check(polys, squash).find((x) => x.code === 'print.first-layer');
  assert.equal(f(pair(0.4)).level, 'warn', '0.4 mm apart on the bed: they print as one');
  assert.ok(Math.abs(f(pair(0.4)).values.gap - 0.4) <= 0.15, `about 0.4 mm, to a pixel: ${f(pair(0.4)).text}`);
  assert.equal(f(pair(0.8)).level, 'pass', '0.8 mm apart: they print apart');
  assert.equal(f(pair(0.4, 1)).level, 'pass', '0.4 mm apart but one a millimetre off the bed: nothing to squash together');
  assert.equal(check(pair(0.4), printer).find((x) => x.code === 'print.first-layer'), undefined, 'a printer with no spread given: not checked');
});

test('the bed is a support: an underside within a breakaway gap of it is laid down with the first layer; and many undersides at one height are said once', () => {
  // A block with a base of 0.25 mm pads of its own at 0.3 mm (a smoothed base's facets a hair up)
  const block = translate([0, 0, 5.15], cuboid({ size: [10, 10, 9.7] })), feet = [translate([-3, -3, 0.15], cuboid({ size: [2, 2, 0.3] })), translate([3, 3, 0.15], cuboid({ size: [2, 2, 0.3] }))];
  const f = check(tri(union(block, ...feet)), printer);
  assert.equal(f.find((x) => x.code === 'print.bed-near')?.level, 'pass', f.map((x) => x.text).join('; '));
  assert.ok(!f.some((x) => x.code === 'print.mid-air' && x.level === 'warn'), 'nothing in mid-air: the base is within a gap of the bed');
  // Three slabs floating at one height: one finding, counting them
  const three = check(tri(union(translate([20, 0, 1], cuboid({ size: [4, 4, 2] })), ...[-10, 0, 10].map((x) => translate([x, 0, 5], cuboid({ size: [4, 4, 2] }))))), printer).filter((x) => x.code === 'print.mid-air');
  assert.equal(three.length, 1); assert.match(three[0].text, /^3 undersides \([\d.]+ mm²\) at z 4 start in mid-air/);
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

test('islands: a layer with nothing under it within the overhang reach is an island; a 45° wall and a cube are not', () => {
  const printer = { layer: 0.2, overhang: 45, line: 0.42 };
  assert.equal(islands(box([-5, -5, 0], [5, 5, 10]), printer).islands.length, 0);
  // A block floating beside a post: an island at its first layer
  const post = box([-2, -2, 0], [2, 2, 10]), blob = box([6, -1, 4], [8, 1, 6]), found = islands([...post, ...blob], printer);
  assert.equal(found.islands.length, 1); assert.ok(Math.abs(found.islands[0].z - 4.1) < 0.11 && found.islands[0].area > 3 && found.islands[0].at[0] > 6);
  // A 45° cone point-up on the bed steps out a layer at a time: held all the way
  const cone = tri(jscad.primitives.cylinderElliptic({ height: 8, startRadius: [8, 8], endRadius: [0.5, 0.5], center: [0, 0, 4], segments: 32 }));
  assert.equal(islands(cone, printer).islands.length, 0);
  // The check reports it
  assert.equal(level(check([...post, ...blob], { bed: 256, overhang: 45, layer: 0.2, support_gap: 0.2, bridge: 5, line: 0.42 }), /island/), 'warn');
});


// A slab leaning `deg` from upright over `h` mm: 10 wide at the bed, 20 long
const leaning = (deg, h = 10) => { const d = h * Math.tan((deg * Math.PI) / 180), v = [[0, 0, 0], [10, 0, 0], [10, 20, 0], [0, 20, 0], [d, 0, h], [10 + d, 0, h], [10 + d, 20, h], [d, 20, h]]; return [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]].map((face) => face.map((i) => v[i])); };

test('overhangs by angle: a wall at the limit passes, one that leans on past it warns, a short ledge is let be', () => {
  const sliced = (model, printer = { bed: 256, overhang: 45, layer: 0.2 }) => check(model, printer).find((x) => x.code === 'print.overhang.sliced').level;
  for (const deg of [30, 45, 47]) assert.equal(sliced(leaning(deg)), 'pass', `${deg}°`);
  // (each layer has a line's grace over the one below, for a ledge; taken every layer it let a 70° lean through)
  for (const deg of [50, 60, 70]) assert.equal(sliced(leaning(deg)), 'warn', `${deg}°`);
  assert.equal(sliced(leaning(60, 0.8)), 'pass', 'four layers of ledge');
  // the limit is the printer's, measured from upright
  assert.equal(sliced(leaning(60), { bed: 256, overhang: 60, layer: 0.2 }), 'pass');
  assert.equal(sliced(leaning(70), { bed: 256, overhang: 60, layer: 0.2 }), 'warn');
  assert.equal(check(leaning(60), { bed: 256, overhang: 45 }).find((x) => x.code === 'print.overhang').level, 'warn', 'and by its faces, when it isn\'t sliced');
});

test('what can\'t be checked is said plainly: no faces, no printer, a limit that isn\'t a number', () => {
  const cube = leaning(0);
  assert.deepEqual(check([], { bed: 256, overhang: 45 }).map((x) => x.code), ['print.empty']);
  assert.throws(() => check(cube), /the printer's "bed" is needed/);
  assert.throws(() => check(cube, {}), /the printer's "bed" is needed/);
  assert.throws(() => check(cube, { bed: 256 }), /the printer's "overhang" is needed/);
  assert.throws(() => check(cube, { bed: 256, overhang: 45, layer: 0 }), /"layer" must be a number above 0/);
  // off the bed: one finding says so, and none says it sits flat on it
  const raised = cube.map((face) => face.map(([x, y, z]) => [x, y, z + 5])), found = check(raised, { bed: 256, overhang: 45, layer: 0.2 });
  assert.ok(found.some((x) => x.code === 'print.off-bed' && x.level === 'fail'));
  assert.ok(!found.some((x) => x.code === 'print.base' && x.level === 'pass'));
});

test('slicing is quick on a part of upright walls: layers the same as the one below are passed over', () => {
  const s = 80, v = [[0, 0, 0], [s, 0, 0], [s, s, 0], [0, s, 0], [0, 0, s], [s, 0, s], [s, s, s], [0, s, s]];
  const cube = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]].map((face) => face.map((i) => v[i]));
  const t0 = Date.now(), found = check(cube, { bed: 256, overhang: 45, layer: 0.2 });
  assert.ok(found.every((x) => x.level === 'pass'), JSON.stringify(found.filter((x) => x.level !== 'pass')));
  assert.ok(Date.now() - t0 < 20000, `an 80 mm cube took ${Date.now() - t0} ms (it took a minute before)`);
});

test('slice: false leaves the slow layer checks out, and says so', () => {
  const f = check(box([0, 0, 0], [10, 10, 10]), printer, { slice: false });
  assert.ok(f.some((x) => x.code === 'print.unsliced') && !f.some((x) => x.code === 'print.islands'));
  assert.ok(check(box([0, 0, 0], [10, 10, 10]), printer).some((x) => x.code === 'print.islands'), 'sliced by default');
});

test('a mesh turned inside out is named as that, not as the bridges and bed it seems to have', () => {
  const cube = box([0, 0, 0], [10, 10, 10]), inverted = cube.map((p) => [...p].reverse());
  const f = check(inverted, printer);
  assert.equal(f.find((x) => x.code === 'print.inside-out')?.level, 'fail');
  assert.ok(!f.some((x) => /bridge|flat on the bed/.test(x.text)), f.map((x) => x.text).join('; '));
  assert.ok(!check(cube, printer).some((x) => x.code === 'print.inside-out'), 'the right way out: not said');
});
