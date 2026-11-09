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

test('ops: the same booleans by JSCAD and by Manifold (faster, watertight)', async (t) => {
  const { ops } = await import('@rulecad/shapes');
  const { cuboid, sphere } = jscad.primitives;
  const a = cuboid({ size: [20, 20, 20] }), b = sphere({ radius: 12, segments: 64 }), c = cuboid({ size: [4, 40, 4] });
  const time = {}, vol = {};
  for (const e of ['jscad', 'manifold']) {
    const o = await ops(e), t0 = performance.now();
    const r = o.union(o.subtract(a, b), c);
    time[e] = performance.now() - t0; vol[e] = volume(r);
    assert.equal(o.stats.fallbacks, 0);
    assert.ok(o.intersect(a, c) && o.stats.ops === 3);
  }
  assert.ok(Math.abs(vol.jscad - vol.manifold) / vol.jscad < 1e-3, `volumes agree: ${vol.jscad} vs ${vol.manifold}`);
  t.diagnostic(`JSCAD ${time.jscad.toFixed(0)} ms, Manifold ${time.manifold.toFixed(0)} ms`);
  await assert.rejects(ops('nope'), /no boolean engine "nope"/);
});

test('solidRegion: a teardrop points any way across its axis, 45° to a point r√2 out', async () => {
  const { solidRegion } = await import('@rulecad/shapes');
  const { measureBoundingBox } = jscad.measurements;
  for (const [axis, teardrop] of [['x', '+z'], ['y', '-z'], ['z', '+y'], ['z', '-x'], ['x', '-y']]) {
    const [lo, hi] = measureBoundingBox(solidRegion({ at: [1, 2, 3], r: 2, length: 6, axis, teardrop })), q = 'xyz'.indexOf(teardrop[1]), a = 'xyz'.indexOf(axis);
    const reach = teardrop[0] === '-' ? [1, 2, 3][q] - lo[q] : hi[q] - [1, 2, 3][q];
    assert.ok(reach > 2 * Math.SQRT2 - 0.01 && reach < 2 * Math.SQRT2 + 0.05, `${axis} ${teardrop}: reaches ${reach}`);
    assert.ok(Math.abs(hi[a] - lo[a] - 6) < 1e-6, `${axis} ${teardrop}: its length`);
  }
});

test('cut: a with b taken out, near faces only; b wholly inside a leaves a cavity', async () => {
  const { cut } = await import('@rulecad/shapes');
  const { cuboid } = jscad.primitives, block = cuboid({ size: [20, 20, 20] });
  assert.ok(Math.abs(volume(cut(block, cuboid({ size: [4, 4, 4] }))) - (8000 - 64)) < 1e-6, 'a cavity inside: 8000 - 64 mm³');
  assert.ok(Math.abs(volume(cut(block, cuboid({ size: [4, 4, 40] }))) - (8000 - 320)) < 1e-6, 'a hole through');
  assert.ok(Math.abs(volume(cut(block, cuboid({ size: [4, 4, 4], center: [50, 0, 0] }))) - 8000) < 1e-6, 'clear of it: unchanged');
});

test('features refuse sizes that aren\'t sizes, by name; a through hole as long as its wall leaves no skin', async () => {
  const { teardropHole, nutPocket, wallOpening, countersink } = await import('@rulecad/shapes');
  assert.throws(() => teardropHole({ d: 0, length: 5 }), /teardropHole: d is a size above 0 mm \(got 0\)/);
  assert.throws(() => nutPocket({ flats: 5.5, height: -1, hole: 3 }), /nutPocket: height is a size above 0 mm/);
  assert.throws(() => wallOpening({ width: 10, height: 5 }), /wallOpening: depth is a size above 0 mm \(got undefined\)/);
  assert.throws(() => countersink({ hole: 3, head: 6 }), /countersink: length/);
  assert.throws(() => slab({ width: 10, height: 10, depth: 0 }), /slab: depth is a size above 0 mm/);
  // A 4 mm wall, a hole exactly 4 mm long: through, it comes out of the far face cleanly (a closed solid)
  const { check } = await import('@rulecad/printcheck');
  const wall = jscad.primitives.cuboid({ size: [4, 20, 20], center: [2, 0, 10] });
  const holed = (through) => jscad.booleans.subtract(wall, teardropHole({ d: 4, length: 4, at: [0, 0, 10], into: '+x', through }));
  const closed = (g) => check(jscad.geometries.geom3.toPolygons(g).map((p) => p.vertices.map((v) => [...v])), { bed: 256, overhang: 45 }).find((f) => f.code === 'print.closed');
  assert.equal(closed(holed(true)).level, 'pass', closed(holed(true)).text);
});

test('text: arrows among letters, in line with them', () => {
  const [w, h] = measure('A↑B'), [wa] = measure('AB');
  assert.ok(w > wa + 2 && h < 5.5, `the arrow takes its own room in the line: ${w} × ${h} against AB's ${wa}`);
  assert.throws(() => text({ text: 'A', height: 0, stroke: 0.84 }), /height and stroke are sizes above 0/);
});

test('seats: a bearing pocket to the printer\'s fit, ledge and relief, printing unsupported each way it goes in', async () => {
  const { seatSize, bearingSeat, plainBearing, shaftShoulder, clipGroove, ops } = await import('@rulecad/shapes');
  const { check } = await import('@rulecad/printcheck');
  const { cuboid } = jscad.primitives, { translate } = jscad.transforms, { subtract, union } = jscad.booleans, { geom3 } = jscad.geometries;
  const printer = { bed: 256, overhang: 45, layer: 0.2, support_gap: 0.2, bridge: 5, line: 0.42, print_gap: 0.3, foot: 0.15 };
  const x1c = { hole_comp: 0.1, fit: 0.2, press: 0.05, slip: 0.1 }, b608 = { bore: 8, outer_diameter: 22, width: 7 };
  const tris = (g) => geom3.toPolygons(g).flatMap((p) => p.vertices.slice(1, -1).map((_, i) => [p.vertices[0], p.vertices[i + 1], p.vertices[i + 2]].map((v) => [...v])));
  const ok = (g, what) => { const bad = check(tris(g), printer).filter((f) => f.level === 'fail' || /support|mid-air|ledge/.test(f.text) && f.level === 'warn'); assert.deepEqual(bad, [], what); };

  const s = seatSize(b608, { printer: x1c });
  assert.equal(s.pocket, 22.05, 'the outside, plus what a hole prints small, less the press');
  assert.equal(s.clearance, -0.05);
  assert.equal(s.relief, 22.05 - 2 * 1.75);
  assert.equal(seatSize(b608, { fit: 'slip', printer: x1c }).pocket, 22.2);
  assert.equal(seatSize(b608, { fit: 0.3, printer: x1c }).clearance, 0.3);

  const block = (h) => translate([0, 0, h / 2], cuboid({ size: [34, 34, h] }));
  const down = bearingSeat(b608, { printer: x1c, at: [0, 0, 12], into: '-z', through: true, relief: 5 });
  assert.equal(down.seat.pocket, 22.05, 'the cutter says what it was drawn to');
  ok(subtract(block(12), down), 'going down from the top, through');
  ok(subtract(block(12), bearingSeat(b608, { printer: x1c, at: [0, 0, 12], into: '-z' })), 'going down, blind: the floor is on the bed side');
  ok(subtract(block(16), bearingSeat(b608, { printer: x1c, at: [0, 0, 0], into: '+z' })), 'up from the bed: a cone, no ceiling');
  ok(subtract(translate([0, 0, 15], cuboid({ size: [14, 34, 30] })), bearingSeat(b608, { printer: x1c, at: [-7, 0, 15], into: '+x', through: true, relief: 8 })), 'across a part: a teardrop');

  const bore = plainBearing(8, { length: 10, printer: x1c, at: [0, 0, 10], into: '-z', through: true });
  assert.equal(bore.bore, 8.5, 'the shaft, the fit each side, the compensation');
  ok(subtract(block(10), bore), 'a plain bore up and down');
  ok(subtract(translate([0, 0, 10], cuboid({ size: [14, 34, 20] })), plainBearing(5, { length: 14, printer: x1c, at: [-7, 0, 10], into: '+x', through: true })), 'a plain bore across');
  ok(plainBearing(8, { length: 10, wall: 2, printer: x1c }), 'a bush, standing up');

  const shaft = translate([0, 0, 20], jscad.primitives.cylinder({ radius: 4, height: 40, segments: 64 }));
  const collar = shaftShoulder(8, { shoulder: 12, height: 3, at: [0, 0, 20] });
  ok(union(shaft, collar), 'a collar: its underside at 45°');
  ok(subtract(shaft, clipGroove(8, { width: 1, depth: 0.5, at: [0, 0, 30] })), 'a groove: its top sloped');

  // Refusals by name
  assert.throws(() => bearingSeat(b608, {}), /bearingSeat: give the printer's rules/);
  assert.throws(() => seatSize({ bore: 22, outer_diameter: 8, width: 7 }, { printer: x1c }), /outer diameter \(8\) is above the bore \(22\)/);
  assert.throws(() => seatSize(b608, { lip: 4, printer: x1c }), /reaches the inner race/);
  assert.throws(() => seatSize(b608, { fit: 'tight', printer: x1c }), /fit is press or slip/);
  assert.throws(() => plainBearing(8, { length: 10, wall: 2, printer: x1c, into: '+x' }), /prints standing up/);
  assert.throws(() => shaftShoulder(8, { shoulder: 6, height: 3 }), /stands proud/);
  assert.throws(() => clipGroove(8, { width: 1, depth: 3 }), /too little of a 8 mm shaft/);
});

test('seats for a Z axis: a linear bearing, a lead-screw nut, a pulley bore and a belt grip, printing unsupported', async () => {
  const { lm8uuPocket, nutTrap, pulleyBore, beltClamp } = await import('@rulecad/shapes');
  const { check } = await import('@rulecad/printcheck');
  const { cuboid } = jscad.primitives, { translate } = jscad.transforms, { subtract } = jscad.booleans, { geom3 } = jscad.geometries;
  const printer = { bed: 256, overhang: 45, layer: 0.2, support_gap: 0.2, bridge: 5, line: 0.42, print_gap: 0.3, foot: 0.15 };
  const x1c = { hole_comp: 0.1, fit: 0.2, press: 0.05, slip: 0.1 }, tris = (g) => geom3.toPolygons(g).flatMap((p) => p.vertices.slice(1, -1).map((_, i) => [p.vertices[0], p.vertices[i + 1], p.vertices[i + 2]].map((v) => [...v])));
  const ok = (g, what) => assert.deepEqual(check(tris(g), printer).filter((f) => f.level === 'fail' || (f.level === 'warn' && /support|mid-air|ledge/.test(f.text))), [], what);
  const block = (h) => translate([0, 0, h / 2], cuboid({ size: [40, 40, h] }));
  const lm = { bore: 8, outer_diameter: 15, length: 24 }, pocket = lm8uuPocket(lm, { printer: x1c, at: [0, 0, 30], into: '-z', through: true });
  assert.equal(pocket.pocket, 15.05); ok(subtract(block(30), pocket), 'stood up, through');
  ok(subtract(translate([0, 0, 25], cuboid({ size: [30, 30, 50] })), lm8uuPocket(lm, { printer: x1c, at: [-15, 0, 25], into: '+x', through: true })), 'across, a teardrop');
  const nut = { flange_diameter: 22, flange_thickness: 3.5, body_diameter: 10.2, length: 15, hole_circle: 16, hole_count: 4 };
  const trap = nutTrap(nut, { printer: x1c, at: [0, 0, 20] }); assert.ok(trap.flange > 22.3); ok(subtract(block(20), trap), 'a nut, from the top');
  assert.throws(() => nutTrap({ ...nut, hole_circle: 11 }, { printer: x1c }), /don't fall between/);
  assert.equal(pulleyBore({ bore: 5 }, { length: 12, printer: x1c, at: [0, 0, 12], through: true }).bore, 5.3);
  ok(beltClamp({ pitch: 2, width: 6 }, { length: 20, height: 5, wall: 2 }), 'a belt grip, teeth up');
  assert.throws(() => beltClamp({ pitch: 0, width: 6 }, { length: 20, height: 5, wall: 2 }), /beltClamp: pitch is a size/);
});
