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

test('features: holes, pockets and ribs that print without supports in a part lying as drawn', async () => {
  const { check } = await import('@rulecad/printcheck');
  const { countersink, teardropHole, nutPocket, crushRibs, wallOpening } = await import('@rulecad/shapes');
  const { cuboid } = jscad.primitives, { translate } = jscad.transforms, { subtract, union } = jscad.booleans, { geom3 } = jscad.geometries;
  const printer = { bed: 256, overhang: 45, layer: 0.2, bridge: 5, support_gap: 0.2 };
  const block = (z) => translate([0, 0, z / 2], cuboid({ size: [30, 30, z] }));
  const ok = (g, what) => {
    const bad = check(geom3.toPolygons(g).map((p) => p.vertices), printer).filter((f) => f.level !== 'pass');
    assert.deepEqual(bad.map((f) => f.text), [], what);
  };
  const m3 = { hole: 3.5, head: 6.2, flats: 5.6, nut: 2.4 };
  ok(subtract(block(10), countersink({ hole: m3.hole, head: m3.head, length: 10, at: [0, 0, 10], into: '-z' })), 'a countersink from the top');
  ok(subtract(block(10), countersink({ hole: m3.hole, head: m3.head, length: 31, at: [15, 0, 5], into: '-x' })), 'a countersink from the side, teardrop');
  ok(subtract(block(10), teardropHole({ d: 3.5, length: 31, at: [-15, 0, 5], into: '+x' })), 'a hole across');
  ok(subtract(block(4), nutPocket({ flats: m3.flats, height: m3.nut, hole: m3.hole, at: [0, 0, 0], into: '+z' }), translate([0, 0, 2], jscad.primitives.cylinder({ radius: m3.hole / 2, height: 4 }))), 'a nut pocket up from the bed');
  ok(subtract(block(10), nutPocket({ flats: m3.flats, height: m3.nut, hole: m3.hole, at: [15, 0, 5], into: '-x' }), teardropHole({ d: m3.hole, length: 31, at: [15, 0, 5], into: '-x' })), 'a nut pocket across');
  ok(subtract(block(10), nutPocket({ flats: m3.flats, height: m3.nut, hole: m3.hole, at: [0, 0, 10], into: '-z' })), 'a nut pocket down from the top');
  ok(subtract(translate([0, 0, 5], cuboid({ size: [30, 3, 10] })), wallOpening({ width: 12, height: 4, depth: 3.1, at: [0, 1.5, 4], into: '-y', bridge: printer.bridge })), 'an opening through a wall');
  const ribs = crushRibs({ at: [[-5, 0], [5, 0]], into: [[1, 0], [-1, 0]], z: [0, 4], radius: 0.8, protrude: 0.3 });
  // Each rib's centre is behind the wall, so it stands protrude (0.3) into the pocket: from x = -6.3 to -4.7, and mirrored
  const [lo, hi] = jscad.measurements.measureBoundingBox(ribs);
  assert.ok(Math.abs(lo[0] + 6.3) < 0.01 && Math.abs(hi[0] - 6.3) < 0.01 && Math.abs(lo[2]) < 1e-6 && Math.abs(hi[2] - 4) < 1e-6);
  const one = crushRibs({ at: [[-5, 0]], into: [[1, 0]], z: [0, 4], radius: 0.8, protrude: 0.3 });
  assert.ok(Math.abs(jscad.measurements.measureBoundingBox(one)[1][0] - (-5 + 0.3)) < 0.01, 'stands 0.3 into the pocket');
});
