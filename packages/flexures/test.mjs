import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leaf, leafModel, fixedGuided, fixedGuidedModel, parallelGuide, parallelGuideModel, serpentine, serpentineModel, notchHinge, notchHingeModel, bistable, bistableModel, livingHinge, livingHingeModel, elastica, leafFlexed, compoundGuide, compoundGuideModel, letJoint, letJointModel, constantForce, constantForceCrank, constantForceModel, ellipticalHinge, ellipticalHingeModel, cartwheel, cartwheelModel, snapHook, snapHookModel, ratchetWheel, ratchetPawl, ratchetModel, foldedGuide, foldedGuideModel, printable } from '@rulecad/flexures';
import { grid, analyse } from '@rulecad/fea';
import jscad from '@jscad/modeling';
import { shape as pieces } from '@rulecad/printcheck';

const { measureVolume, measureBoundingBox } = jscad.measurements;
const onePiece = (g) => pieces(jscad.geometries.geom3.toPolygons(g).map((p) => p.vertices)).pieces.length === 1;
const pla = { E: 2680, nu: 0.36, strainLimit: 0.02, name: 'PLA' };

// A leaf as a 2D plane-stress beam in @rulecad/fea: cells of h, its width as the thickness, fixed along x = 0, a load
// at the tip (spread over the tip's nodes); with guided, the tip is held from turning (its x fixed) and the load is
// shared over its nodes
function beam({ length, thickness, width }, { E, nu }, h, { guided = false } = {}) {
  const nx = Math.round(length / h), ny = Math.round(thickness / h), g = grid({ nx, ny, h }), fixed = new Uint8Array(g.dofs), f = new Float64Array(g.dofs);
  for (let j = 0; j <= ny; j++) { fixed[2 * g.node(0, j)] = 1; fixed[2 * g.node(0, j) + 1] = 1; if (guided) fixed[2 * g.node(nx, j)] = 1; }
  for (let j = 0; j <= ny; j++) f[2 * g.node(nx, j) + 1] = -1 / (ny + 1);
  const a = analyse({ grid: g, density: new Float64Array(g.cells).fill(1), material: { E, nu }, thickness: width, fixed, loads: [f] });
  return 1 / a.compliance[0]; // a unit load: the stiffness along it
}

test('a leaf spring is a cantilever: its stiffness agrees with finite elements within 5%, and its strain round-trips', () => {
  const p = { length: 40, thickness: 2, width: 8 }, m = leafModel(p, pla);
  const fea = beam(p, pla, 0.25);
  assert.ok(Math.abs(m.stiffness / fea - 1) < 0.05, `beam theory ${m.stiffness.toFixed(3)} N/mm, finite elements ${fea.toFixed(3)}`);
  assert.ok(Math.abs(m.strain(m.travel(0.02)) - 0.02) < 1e-12);
  assert.ok(Math.abs(m.stress(1) - pla.E * m.strain(1)) < 1e-9);
  const box = measureBoundingBox(leaf(p));
  assert.deepEqual(box.map((v) => v.map(Math.round)), [[0, -1, 0], [40, 1, 8]], 'drawn along x from the root, bending along y, its width up z');
});

test('a fixed-guided beam is four times as stiff as a leaf: within 8% of finite elements with the tip held from turning', () => {
  const p = { length: 40, thickness: 2, width: 8 }, m = fixedGuidedModel(p, pla);
  assert.ok(Math.abs(m.stiffness / leafModel(p, pla).stiffness - 4) < 1e-9);
  const fea = beam(p, pla, 0.25, { guided: true });
  assert.ok(Math.abs(m.stiffness / fea - 1) < 0.08, `beam theory ${m.stiffness.toFixed(3)} N/mm, finite elements ${fea.toFixed(3)}`);
  assert.ok(m.travel(0.02) < leafModel(p, pla).travel(0.02), 'stiffer, it travels less before the same strain');
});

test('a parallel guide is two fixed-guided leaves: twice the stiffness, a shuttle that drops a little, drawn as one piece', () => {
  const p = { length: 30, thickness: 1.26, width: 10, gap: 12 }, m = parallelGuideModel(p, pla);
  assert.ok(Math.abs(m.stiffness / fixedGuidedModel(p, pla).stiffness - 2) < 1e-9);
  assert.ok(Math.abs(m.drop(3) - (3 * 9) / (5 * 30)) < 1e-12);
  const shape = parallelGuide(p), box = measureBoundingBox(shape);
  assert.ok(measureVolume(shape) > 2 * 30 * 1.26 * 10, 'two leaves and their blocks');
  assert.ok(box[1][0] > 30 && box[0][0] < 0, 'the base before the leaves, the shuttle after');
});

test('a serpentine spring is n leaves in series: stiffness over n, each leaf taking its share of the travel', () => {
  const p = { length: 20, thickness: 0.84, width: 6, turns: 5 }, m = serpentineModel(p, pla), one = fixedGuidedModel(p, pla);
  assert.ok(Math.abs(m.stiffness * 5 - one.stiffness) < 1e-9);
  assert.ok(Math.abs(m.travel(0.02) - 5 * one.travel(0.02)) < 1e-9);
  const box = measureBoundingBox(serpentine(p));
  assert.ok(box[1][1] - box[0][1] > 4 * 3 * 0.84, 'five leaves stacked along y');
});

test('a notch hinge: Paros and Weisbord stiffness, and the angle a strain limit allows', () => {
  const p = { radius: 3, neck: 0.84, width: 8 }, m = notchHingeModel(p, pla);
  const expected = (2 * pla.E * 8 * 0.84 ** 2.5) / (9 * Math.PI * Math.sqrt(3));
  assert.ok(Math.abs(m.stiffness - expected) < 1e-9);
  assert.ok(Math.abs(m.strain(m.angle(0.02)) - 0.02) < 1e-12);
  assert.ok(m.angle(0.02) > 0.05 && m.angle(0.02) < 0.3, `turns ${(m.angle(0.02) * 180 / Math.PI).toFixed(1)}° before 2% strain`);
  const shape = notchHinge(p), bar = 2 * 12 + 6;
  assert.ok(measureVolume(shape) < bar * (0.84 + 6) * 8, 'the notches are cut');
});

test('how a flexure prints: thickness in whole lines and at least two, width in whole layers, strain against the limit', () => {
  const x1c = { line: 0.42, layer: 0.2, wall_min: 0.84 };
  const p = { length: 40, thickness: 1.26, width: 8, travel: 5 }, m = leafModel(p, pla);
  const ok = printable(p, x1c, pla, m);
  assert.deepEqual(ok.map((f) => f.level), ['pass', 'pass']);
  assert.match(ok[0].text, /3 lines/);
  const thin = printable({ thickness: 0.5, width: 8 }, x1c);
  assert.equal(thin[0].level, 'fail');
  const odd = printable({ thickness: 1.5, width: 8.1 }, x1c);
  assert.deepEqual(odd.map((f) => f.code), ['flexure.lines', 'flexure.layers']);
  assert.ok(odd.every((f) => f.level === 'warn'));
  const far = printable({ ...p, travel: 40 }, x1c, pla, m);
  assert.equal(far.at(-1).level, 'fail');
  assert.match(far.at(-1).text, /at most [\d.]+ mm/);
});

test('a bistable beam: bistable past a rise of 2.31 thicknesses, snapping about twice the rise, drawn as two arched beams joined in the middle', () => {
  const p = { length: 40, rise: 3, thickness: 0.84, width: 6 }, m = bistableModel(p, pla);
  assert.ok(m.bistable && m.Q > 3.5);
  assert.ok(!bistableModel({ ...p, rise: 1.5 }, pla).bistable, 'too shallow to stay over');
  assert.ok(Math.abs(m.travel - 6) < 1e-9);
  assert.ok(Math.abs(m.strain - (2 * Math.PI * Math.PI * 3 * 0.84) / 1600) < 1e-12);
  assert.ok(Math.abs(m.stiffness - (384 * pla.E * (6 * 0.84 ** 3 / 12)) / 40 ** 3) < 1e-9);
  const shape = bistable(p), box = measureBoundingBox(shape);
  assert.ok(box[1][1] - box[0][1] > 2 * 3 && measureVolume(shape) > 2 * 40 * 0.84 * 6, 'two beams, arched, with their ends and middle');
});

test('a living hinge: strain t θ / 2l, so a longer strip folds further; stiffness EI / l', () => {
  const p = { flex: 2, thickness: 0.84, width: 10 }, m = livingHingeModel(p, pla);
  assert.ok(Math.abs(m.strain(m.angle(0.02)) - 0.02) < 1e-12);
  assert.ok(Math.abs(m.angle(0.02) - (2 * 2 * 0.02) / 0.84) < 1e-12);
  assert.ok(livingHingeModel({ ...p, flex: 4 }, pla).angle(0.02) > 1.9 * m.angle(0.02), 'twice the strip, nearly twice the fold');
  assert.ok(Math.abs(m.stiffness - (pla.E * (10 * 0.84 ** 3 / 12)) / 2) < 1e-9);
  const box = measureBoundingBox(livingHinge(p));
  assert.ok(box[1][0] - box[0][0] > 20, 'two arms and the strip between');
});

test('the elastica: beam theory at small loads, Bisshopp and Drucker at large ones, and the force a travel needs', () => {
  const p = { length: 40, thickness: 1, width: 8 }, m = { E: 2000 }, I = (8 * 1 ** 3) / 12, EI = m.E * I;
  // A small load: within 1% of the cantilever formula
  const small = elastica(p, m, { force: 0.01 }), linear = leafModel(p, m);
  assert.ok(Math.abs(small.travel * linear.stiffness / 0.01 - 1) < 0.01, `small load: ${small.travel} against ${0.01 / linear.stiffness}`);
  assert.ok(Math.abs(small.strain - linear.strain(small.travel)) < 1e-3 * linear.strain(small.travel));
  // Large loads, by the load parameter PL²/EI: tip travel over length 0.3017 at 1, 0.4935 at 2 (Bisshopp and Drucker 1945)
  for (const [alpha, ratio] of [[1, 0.3017], [2, 0.4935]]) {
    const r = elastica(p, m, { force: (alpha * EI) / (40 * 40) });
    assert.ok(Math.abs(r.travel / 40 - ratio) < 0.004, `at PL²/EI = ${alpha}: travel/L ${(r.travel / 40).toFixed(4)} against ${ratio}`);
    assert.ok(r.shortening > 0 && r.angle > 0, 'the tip comes nearer and turns');
  }
  // Stiffer than beam theory says once it curls: the secant stiffness grows with the load
  const big = elastica(p, m, { force: (2 * EI) / 1600 });
  assert.ok(big.stiffness > linear.stiffness * 1.1, 'a curled leaf is stiffer than the straight-beam formula');
  // The other way round: the force for a travel, and the same answer back
  const byTravel = elastica(p, m, { travel: 15 });
  assert.ok(Math.abs(byTravel.travel - 15) < 1e-6 && Math.abs(elastica(p, m, { force: byTravel.force }).travel - 15) < 1e-6);
  assert.throws(() => elastica(p, m, { travel: 50 }), /can't travel/);
  // Drawn bent: as long as the leaf along its curve, its tip at the travel
  const bent = leafFlexed(p, m, { travel: 15 }), box = measureBoundingBox(bent);
  assert.ok(box[1][1] > 15 && box[1][1] < 16, `the bent leaf's tip reaches ${box[1][1]}`);
  assert.ok(box[1][0] < 40 && box[1][0] > 30, 'and comes nearer along x');
  assert.ok(Math.abs(box[1][2] - 8) < 1e-9);
});

test('a compound guide is two parallel guides in series: half the stiffness, twice the travel, no drop, one piece with room to move', () => {
  const p = { length: 30, thickness: 1.26, width: 8, gap: 12 }, one = parallelGuideModel(p, pla), two = compoundGuideModel(p, pla);
  assert.ok(Math.abs(two.stiffness - one.stiffness / 2) < 1e-9 && Math.abs(two.travel(0.02) - 2 * one.travel(0.02)) < 1e-9);
  assert.ok(Math.abs(two.strain(4) - one.strain(2)) < 1e-12 && two.drop(4) === 0);
  const shape = compoundGuide(p), box = measureBoundingBox(shape);
  assert.ok(box[0][0] < -6 && box[1][0] > 30 && Math.abs(box[1][1] + box[0][1]) < 1e-9, 'a base behind the shuttle, an intermediate block past the leaves, symmetric about x');
  // Four leaves and five blocks, as one solid: more than the leaves alone, less than the box, and all joined
  const vol = measureVolume(shape), leaves = 4 * 30 * 1.26 * 8;
  assert.ok(vol > leaves && vol < (box[1][0] - box[0][0]) * (box[1][1] - box[0][1]) * 8 * 0.6, `${vol} mm³`);
  assert.ok(onePiece(shape), 'the base reaches its arms');
});

test('a LET joint: two paths of a half-bar, an end bridge and a half-bar; stiff bridges leave the bars\' torsion; the angle a strain allows', () => {
  const p = { width: 30, thickness: 1.2, bar: 2, slot: 1.2, bridge: 2.5 }, m = letJointModel(p, pla);
  assert.ok(m.stiffness > 0 && Math.abs(2 * m.twist(0.1) + m.bend(0.1) - 0.1) < 1e-9, 'each path\'s angles add up to the joint\'s');
  const stiffBridges = letJointModel({ ...p, bridge: 2.5, thickness: 1.2, slot: 0.01 }, pla); // a bridge too short to bend
  assert.ok(stiffBridges.stiffness > m.stiffness && stiffBridges.bend(0.1) < 0.1 * m.bend(0.1));
  const a = m.angle(0.02);
  assert.ok(a > 0.3 && a < 1.2 && Math.abs(m.strain(a) - 0.02) < 1e-9, `${(a * 180) / Math.PI}° at 2%`);
  const shape = letJoint(p), box = measureBoundingBox(shape);
  assert.ok(Math.abs(box[1][2] - 1.2) < 1e-9 && Math.abs(box[1][1] - 15) < 1e-9 && box[1][0] > 30, 'a sheet of the given thickness, the panels either side');
  const sheet = (box[1][0] - box[0][0]) * 30 * 1.2, slots = (1.2 * (30 - 5) + 4 * 1.2 * ((30 - 2.5) / 2)) * 1.2;
  assert.ok(Math.abs(measureVolume(shape) - (sheet - slots)) < 1, 'the H of slots, cut through');
});

test('a constant-force mechanism: the force stays within 5% over a quarter of the leaf and the leaf stays under 2% strain; pins in the parts', () => {
  const p = { leaf: 40, thickness: 1.26, width: 8 }, m = constantForceModel(p, pla);
  assert.ok(m.flat.to - m.flat.from > 8 && m.flat.from < 2, `flat from ${m.flat.from} to ${m.flat.to} mm`); // about a quarter of the leaf
  for (const s of [2, 5, 8]) assert.ok(Math.abs(m.force(s) / m.flat.force - 1) <= 0.05, `${m.force(s)} N at ${s} mm against ${m.flat.force}`);
  assert.ok(m.strain(m.flat.to) < 0.02 && m.travel(0.02) > m.flat.to && Math.abs(m.strain(m.travel(0.015)) - 0.015) < 1e-6);
  assert.ok(m.force(0) === 0 && m.force(0.5) > 0.8 * m.flat.force, 'the force is there from the first half-millimetre: the leaf starts straight');
  // Thicker: the force scales with t³, the flat range stays
  const thick = constantForceModel({ ...p, thickness: 2.52 }, pla);
  assert.ok(Math.abs(thick.flat.force / m.flat.force - 8) < 0.5 && Math.abs(thick.flat.to - m.flat.to) < 1, `${thick.flat.force / m.flat.force}× at ${thick.flat.to}`);
  assert.ok(Math.abs(m.offset - 20 * Math.sin(Math.PI / 36)) < 1e-9 && Math.abs(m.reach - 20 * Math.cos(Math.PI / 36)) < 1e-9, 'the ground pin beside the line');
  const coupler = constantForce(p), crank = constantForceCrank(p);
  assert.ok(onePiece(coupler) && onePiece(crank) && onePiece(letJoint({ width: 30, thickness: 1.2, bar: 2, slot: 1.2, bridge: 2.5 })));
  assert.ok(measureBoundingBox(coupler)[1][0] > 40 && Math.abs(measureBoundingBox(crank)[1][0] - 23) < 1e-6, 'a boss past the leaf\'s tip; the crank half the leaf, boss to boss');
  assert.ok(measureVolume(crank) < 20 * 6 * 8 + 2 * Math.PI * 9 * 8, 'holes through the bosses');
});

test('an elliptical hinge: with equal axes it is the circular notch within a few per cent of Paros and Weisbord; longer along the beam, softer and further at a strain', () => {
  const circle = ellipticalHingeModel({ along: 3, across: 3, neck: 0.84, width: 8 }, pla), pw = notchHingeModel({ radius: 3, neck: 0.84, width: 8 }, pla);
  assert.ok(Math.abs(circle.stiffness / pw.stiffness - 1) < 0.06, `${circle.stiffness} against ${pw.stiffness}`);
  const long = ellipticalHingeModel({ along: 6, across: 3, neck: 0.84, width: 8 }, pla);
  assert.ok(long.stiffness < circle.stiffness / 1.8 && long.angle(0.02) > 1.8 * circle.angle(0.02) && Math.abs(long.strain(long.angle(0.02)) - 0.02) < 1e-12);
  const shape = ellipticalHinge({ along: 6, across: 3, neck: 0.84, width: 8 }), box = measureBoundingBox(shape);
  assert.ok(onePiece(shape) && Math.abs(box[1][1] - box[0][1] - 6.84) < 1e-6 && Math.abs(box[1][0] - 60) < 1e-6, 'two arms of 24 and the notches between');
});

test('a cartwheel pivot: four spokes bent by the hub\'s turn, stiffer with a bigger hub; one piece with the arm out through the rim', () => {
  const p = { spoke: 10, thickness: 0.84, width: 8 }, m = cartwheelModel(p, pla), I = (8 * 0.84 ** 3) / 12;
  assert.ok(Math.abs(m.stiffness - (16 * 2680 * I * (1 + 1.5 * 2 / 10)) / 10) < 1e-9 && Math.abs(m.strain(m.angle(0.02)) - 0.02) < 1e-12);
  assert.ok(cartwheelModel({ ...p, hub: 4 }, pla).stiffness > m.stiffness);
  const shape = cartwheel(p), box = measureBoundingBox(shape);
  assert.ok(onePiece(shape) && Math.abs(box[0][0] + 15) < 1e-6 && Math.abs(box[1][0] - 35) < 1e-6, 'a rim of radius 15 and an arm 20 past it');
});

test('a snap-fit hook: the leaf\'s force at the undercut, insertion along the lead, a square back holds and a sloped one lets go', () => {
  const p = { length: 15, thickness: 1.26, width: 8, undercut: 1.5 }, m = snapHookModel(p, pla), leafM = leafModel(p, pla);
  assert.ok(Math.abs(m.force - leafM.stiffness * 1.5) < 1e-9 && Math.abs(m.strain(1.5) - 0.0126) < 1e-4);
  assert.ok(m.insertion > m.force && m.insertion < 1.2 * m.force && m.removal === Infinity && m.holds, 'at 30° with μ 0.3, a little over the deflection force; square holds');
  const sloped = snapHookModel({ ...p, back: 60 }, pla);
  assert.ok(sloped.removal > 3 * sloped.insertion && !sloped.holds, `${sloped.removal} to pull out against ${sloped.insertion} to push in`);
  assert.ok(m.undercut(0.02) > 1.5 && m.undercut(0.01) < 1.5);
  const shape = snapHook(p), box = measureBoundingBox(shape);
  assert.ok(onePiece(shape) && Math.abs(box[1][1] - (0.63 + 1.5)) < 1e-6 && Math.abs(box[1][0] - 15) < 1e-6, 'the hook stands the undercut above the beam at its tip');
});

test('a ratchet: the pawl lifts a tooth height each click, the click force from the ramp\'s angle; the wheel a polygon of teeth round a pin hole', () => {
  const wheel = { teeth: 24, radius: 12, height: 1.2, width: 8 }, pawl = { length: 20, thickness: 0.84, width: 8 }, m = ratchetModel(wheel, pawl, pla);
  assert.ok(Math.abs(m.pitch - Math.PI) < 1e-9 && Math.abs(m.ramp - Math.atan2(1.2, Math.PI)) < 1e-12 && m.holds);
  assert.ok(Math.abs(m.lift - leafModel(pawl, pla).stiffness * 1.2) < 1e-9 && m.click > 0 && Math.abs(m.click - (m.lift * (0.3 + Math.tan(m.ramp))) / (1 - 0.3 * Math.tan(m.ramp))) < 1e-9);
  assert.ok(m.strain(1.2) < 0.01, 'a tooth is well within the pawl\'s strain');
  const w = ratchetWheel(wheel), box = measureBoundingBox(w);
  assert.ok(onePiece(w) && Math.abs(box[1][0] - 12) < 1e-6 && measureVolume(w) < Math.PI * 144 * 8 && measureVolume(w) > Math.PI * 10.8 * 10.8 * 8 - Math.PI * 1 * 8, 'teeth between the root and tip circles, a hole in the middle');
  assert.ok(onePiece(ratchetPawl(pawl)));
});

test('a folded-beam guide: a compound guide\'s stiffness and travel in a shorter box, drawn as one piece with a floating truss each side', () => {
  const p = { length: 25, thickness: 1.26, width: 8, gap: 10 }, m = foldedGuideModel(p, pla), two = compoundGuideModel(p, pla);
  assert.ok(m.stiffness === two.stiffness && m.travel(0.02) === two.travel(0.02) && m.drop(3) === 0);
  const shape = foldedGuide(p), box = measureBoundingBox(shape);
  assert.ok(onePiece(shape) && Math.abs(box[1][0] - box[0][0] - 2 * (1.5 + 5 + 3 + 25 + 3)) < 1e-6, `${box[1][0] - box[0][0]} wide: shuttle, clearances, posts, beams and trusses`);
  assert.ok(box[1][1] - box[0][1] < 2 * (10 + 2 * 1.26) + 5 + 3, 'and no taller than the gap, the beams, the clearance and the base');
});

