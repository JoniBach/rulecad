import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leaf, leafModel, fixedGuided, fixedGuidedModel, parallelGuide, parallelGuideModel, serpentine, serpentineModel, notchHinge, notchHingeModel, bistable, bistableModel, livingHinge, livingHingeModel, elastica, leafFlexed, compoundGuide, compoundGuideModel, letJoint, letJointModel, constantForce, constantForceCrank, constantForceModel, ellipticalHinge, ellipticalHingeModel, cartwheel, cartwheelModel, snapHook, snapHookModel, ratchetWheel, ratchetPawl, ratchetModel, foldedGuide, foldedGuideModel, pinJoint, pinJointCheck, snapPin, snapSocket, snapPinModel, travelStop, angleStop, contactLeaf, contactLeafModel, parallelogram, parallelogramModel, tweezers, tweezersModel, curvedLeaf, curvedLeafModel, ports, size, report, printable } from '@rulecad/flexures';
import { grid, analyse } from '@rulecad/fea';
import jscad from '@jscad/modeling';
import { shape as pieces, check as printCheck } from '@rulecad/printcheck';

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

test('a pin joint printed in place: two pieces a support gap apart, breaking free rather than hanging; the check reads the printer\'s fit', () => {
  const p = { pin: 4, width: 6, arm: 20 }, shape = pinJoint(p), polys = jscad.geometries.geom3.toPolygons(shape).map((q) => q.vertices);
  assert.equal(pieces(polys).pieces.length, 2, 'the pin with its base and cap, and the ring with its arm');
  const printer = { bed: 256, overhang: 45, layer: 0.2, support_gap: 0.2, bridge: 5, fit: 0.2 }, found = printCheck(polys, printer);
  assert.ok(found.some((r) => r.code === 'print.breakaway' && r.level === 'pass'), 'the ring rests on a breakaway support');
  assert.ok(!found.some((r) => r.code === 'print.mid-air' || r.code === 'print.overhang' && r.level !== 'pass'), JSON.stringify(found.filter((r) => r.level !== 'pass')));
  const box = measureBoundingBox(shape);
  assert.ok(Math.abs(box[1][2] - (2 + 0.2 + 6 + 0.2 + 2)) < 1e-6 && Math.abs(box[1][0] - (2 + 0.2 + 20 + 3)) < 1e-6, 'the cap two lips above the ring; the arm past the ring');
  const checks = pinJointCheck(p, printer);
  assert.ok(checks.every((r) => r.level === 'pass') && pinJointCheck({ ...p, clearance: 0.1 }, printer)[0].level === 'warn' && pinJointCheck({ ...p, lift: 0.5 }, printer)[1].level === 'warn');
});

test('a snap pin and its socket: a barbed, slotted peg modelled as two hooks; the default barb prints standing without overhang', () => {
  const p = { diameter: 4, length: 6 }, pin = snapPin(p), socket = snapSocket({ diameter: 4, depth: 6 }), m = snapPinModel(p, pla);
  assert.ok(onePiece(pin) && onePiece(socket));
  const box = measureBoundingBox(pin);
  assert.ok(Math.abs(box[1][0] - 4) < 1e-6 && box[1][2] > 8 + 0.4, 'a flange the diameter again, the barb above the shaft');
  assert.ok(m.strain(0.4) < 0.01 && m.insertion > m.force && m.insertion < 15 && !m.holds, `${m.insertion} N to push in, strain ${m.strain(0.4)}`);
  assert.ok(snapPinModel({ ...p, back: 90 }, pla).holds);
  const printer = { bed: 256, overhang: 45, layer: 0.2, support_gap: 0.2, bridge: 5 }, found = printCheck(jscad.geometries.geom3.toPolygons(pin).map((q) => q.vertices), printer);
  assert.ok(!found.some((r) => r.level === 'fail') && !found.some((r) => r.code === 'print.overhang' && r.level !== 'pass'), JSON.stringify(found.filter((r) => r.level !== 'pass')));
  const hole = measureBoundingBox(socket);
  assert.ok(Math.abs(hole[1][0] - 5.2) < 1e-6 && measureVolume(socket) < 10.4 * 10.4 * 6 - Math.PI * 2.2 * 2.2 * 6 + 1, 'a hole the peg plus clearance through a block');
});

test('a travel stop stands where the strain limit says, less a margin; printable warns of a flexure with no stop and checks one past the limit', () => {
  const p = { length: 40, thickness: 0.84, width: 8 }, m = leafModel(p, pla), stop = travelStop(p, pla);
  assert.ok(Math.abs(stop.limit - m.travel(0.02)) < 1e-9 && Math.abs(stop.at - 0.8 * stop.limit) < 1e-9);
  const box = measureBoundingBox(stop.shape);
  assert.ok(Math.abs(box[1][0] - 40) < 1e-9 && Math.abs(box[1][1] - (0.42 + stop.at + 3)) < 1e-9, 'posts at the tip, a stop\'s travel off the leaf');
  const printer = { line: 0.42, layer: 0.2 };
  assert.equal(printable({ ...p, stop: false }, printer, pla, m).find((r) => r.code === 'flexure.stop')?.level, 'warn');
  assert.equal(printable({ ...p, stop: stop.at }, printer, pla, m).find((r) => r.code === 'flexure.stop')?.level, 'pass');
  assert.equal(printable({ ...p, stop: 30 }, printer, pla, m).find((r) => r.code === 'flexure.stop')?.level, 'fail');
  assert.ok(!printable(p, printer, pla, m).some((r) => r.code === 'flexure.stop'), 'nothing said when no stop is given');
});

test('a contact-aided leaf: the leaf\'s rate until the beam meets the stop, a shorter leaf\'s after; the contact travel from the cantilever\'s shape', () => {
  const p = { length: 40, thickness: 0.84, width: 8, stop: 20, gap: 2 }, m = contactLeafModel(p, pla), one = leafModel(p, pla), rest = leafModel({ ...p, length: 20 }, pla);
  assert.ok(m.first === one.stiffness && m.second === rest.stiffness && m.second > 7 * m.first);
  assert.ok(Math.abs(m.contact - (2 * 2 * 40 ** 3) / (3 * 40 * 400 - 8000)) < 1e-9, 'the tip travel when the beam at the stop has dropped the gap');
  assert.ok(Math.abs(m.force(m.contact) - one.stiffness * m.contact) < 1e-9 && Math.abs(m.force(m.contact + 1) - m.force(m.contact) - rest.stiffness) < 1e-9);
  assert.ok(m.strain(m.contact) === one.strain(m.contact) && m.travel(0.02) > m.contact && Math.abs(m.strain(m.travel(0.02)) - 0.02) < 1e-9);
  assert.ok(onePiece(contactLeaf(p)), 'the stop bar grows from the root');
});

test('a parallelogram four-bar: four notch hinges, the coupler\'s stiffness 4K / L², rising as it moves; one piece', () => {
  const p = { link: 30, apart: 40, width: 8, radius: 3, neck: 0.84 }, m = parallelogramModel(p, pla), h = notchHingeModel({ radius: 3, neck: 0.84, width: 8 }, pla);
  assert.ok(Math.abs(m.stiffness - (4 * h.stiffness) / 900) < 1e-9 && Math.abs(m.travel(0.02) - 30 * Math.sin(h.angle(0.02))) < 1e-9);
  assert.ok(m.rise(3) > 0 && m.rise(3) < 0.2 && Math.abs(m.strain(m.travel(0.01)) - 0.01) < 1e-9);
  const shape = parallelogram(p), box = measureBoundingBox(shape);
  assert.ok(onePiece(shape) && Math.abs(box[1][1] - (30 + 2 * 3 + 6 + 3)) < 1e-9, 'the coupler bar above the links and hinges');
});

test('tweezers: a fixed-guided spring between two arms; the squeeze that closes them is the opening, and the strain is the spring\'s', () => {
  const p = { spring: 40, thickness: 0.84, width: 8, arm: 50, open: 10 }, m = tweezersModel(p, pla), s = fixedGuidedModel({ length: 40, thickness: 0.84, width: 8 }, pla);
  assert.ok(m.stiffness === s.stiffness && m.close === 10 && m.squeeze(4) === 4 && m.grip(12) > 0 && m.grip(8) === 0);
  assert.ok(m.strain(10) < 0.02, `${m.strain(10)} at a full close`);
  const shape = tweezers(p), box = measureBoundingBox(shape);
  assert.ok(onePiece(shape) && box[1][0] > 50 && box[1][1] - box[0][1] > 40, 'arms past the spring, wider than the spring');
});

test('ports: every generator names its root, its moving end and what moves there, in the shape\'s own frame', () => {
  const leaf = ports('leaf', { length: 40, thickness: 0.84, width: 8 });
  assert.deepEqual(leaf.end.at, [40, 0, 4]); assert.equal(leaf.moves, 'y');
  const guide = ports('compoundGuide', { length: 30, thickness: 1.26, width: 8, gap: 12 }), box = measureBoundingBox(compoundGuide({ length: 30, thickness: 1.26, width: 8, gap: 12 }));
  assert.ok(Math.abs(guide.root.at[0] - box[0][0]) < 1e-9 && guide.shuttle.at[0] === -3, 'the root at the base\'s back, the shuttle a block from the leaves');
  const hinge = ports('notchHinge', { radius: 3, neck: 0.84, width: 8 });
  assert.ok(hinge.moves === 'turn' && hinge.pivot.at[0] === 15 && hinge.end.at[0] === 30);
  for (const kind of ['fixedGuided', 'parallelGuide', 'foldedGuide', 'serpentine', 'ellipticalHinge', 'cartwheel', 'livingHinge', 'letJoint', 'bistable', 'constantForce', 'contactLeaf', 'parallelogram', 'tweezers', 'snapHook']) {
    const p = { length: 30, thickness: 1.26, width: 8, gap: 10, turns: 4, radius: 3, neck: 0.84, along: 6, across: 3, spoke: 10, flex: 2, bar: 2, slot: 1.2, bridge: 2.5, rise: 3, leaf: 40, stop: 15, link: 30, apart: 40, spring: 40, arm: 50, open: 10, undercut: 1.5 };
    const q = ports(kind, p); assert.ok(q.root && q.end && q.moves, kind);
  }
  assert.throws(() => ports('spring', {}), /no ports/);
});

test('sizing: the thinnest whole-line leaf for a force at a travel within the strain margin; null when nothing reaches; a serpentine in a box', () => {
  const printer = { line: 0.42, layer: 0.2 }, s = size.leaf({ travel: 8, force: 2, width: 8, material: pla }, printer);
  assert.ok(s && Math.abs(s.stiffness * 8 - 2) < 0.05 && s.strain <= 0.016 && Math.abs(s.thickness / 0.42 - Math.round(s.thickness / 0.42)) < 1e-9, JSON.stringify(s));
  assert.equal(size.leaf({ travel: 40, force: 50, width: 8, material: pla, maxLength: 30 }, printer), null);
  const z = size.serpentine({ travel: 10, force: 3, width: 8, material: pla, box: 25 }, printer);
  assert.ok(z && z.length <= 25 && Math.abs(z.stiffness * 10 - 3) / 3 < 0.05 && z.strain <= 0.016);
  assert.equal(size.notchHinge({ angle: (5 * Math.PI) / 180, width: 8, material: pla }, printer), null, 'no notch turns 5° in PLA');
  assert.ok(size.livingHinge({ angle: (30 * Math.PI) / 180, width: 8, material: pla }, printer).strain <= 0.016);
  const c = size.constantForce({ force: 10, stroke: 8, width: 8, material: pla }, printer);
  assert.ok(c && c.flat.to >= 8 && c.force >= 10 && c.strain <= 0.016);
});

test('a mechanism report: each flexure\'s findings and strain at its pose, the worst named, a fail when one is over', () => {
  const printer = { line: 0.42, layer: 0.2 }, parts = [
    { name: 'trigger', kind: 'constantForce', params: { leaf: 40, thickness: 1.26, width: 8 }, travel: 8, stop: 10 },
    { name: 'sear pivot', kind: 'notchHinge', params: { radius: 3, neck: 0.84, width: 8 }, angle: 0.05 },
    { name: 'magazine', kind: 'serpentine', params: { length: 20, thickness: 1.26, width: 8, turns: 5 }, travel: 12, stop: false },
  ];
  const r = report(parts, printer, pla);
  assert.ok(!r.ok && r.worst.part === 'magazine' && r.worst.strain > 0.02);
  assert.ok(r.findings.some((f) => f.part === 'magazine' && f.code === 'flexure.stop' && f.level === 'warn') && r.findings.some((f) => f.part === 'sear pivot' && f.code === 'flexure.strain' && f.level === 'pass'));
  assert.ok(report(parts.slice(0, 2), printer, pla).ok && report(parts.slice(0, 2), printer, pla).worst.part === 'sear pivot');
});

test('a pre-curved leaf: an arc of the leaf\'s length, the straight leaf\'s stiffness, a range each way about its rest, and the strain the curve already holds', () => {
  const p = { length: 40, thickness: 0.84, width: 8, rise: 6 }, m = curvedLeafModel(p, pla), s = leafModel(p, pla);
  assert.ok(m.stiffness === s.stiffness && m.range(0.02)[1] === s.travel(0.02) && m.range(0.02)[0] === -s.travel(0.02));
  assert.ok(Math.abs(m.preset - 0.84 / (2 * ((1600 + 144) / 48))) < 1e-12, 't / 2ρ');
  const shape = curvedLeaf(p), box = measureBoundingBox(shape);
  assert.ok(onePiece(shape) && box[1][1] > 6 && box[1][1] < 6.5 && measureVolume(shape) > 40 * 0.84 * 8, 'the tip sits the rise off the chord; an arc is longer than its chord');
});

test('stops for any flexure: a travel stop placed by a guide\'s model at its shuttle, an angle stop at a pivot\'s arm', () => {
  const g = { length: 30, thickness: 1.26, width: 8, gap: 12 }, gm = compoundGuideModel(g, pla), ts = travelStop(g, pla, { model: gm, end: [-3, 0] });
  assert.ok(Math.abs(ts.at - 0.8 * gm.travel(0.02)) < 1e-9 && Math.abs(measureBoundingBox(ts.shape)[1][0] + 3) < 1e-9);
  const hm = notchHingeModel({ radius: 3, neck: 0.84, width: 8 }, pla), as = angleStop({ width: 8 }, pla, { model: hm, pivot: [23, 0], arm: 23 });
  assert.ok(Math.abs(as.angle - 0.8 * hm.angle(0.02)) < 1e-9 && Math.abs(as.travel - 23 * Math.sin(as.angle)) < 1e-9 && Math.abs(measureBoundingBox(as.shape)[1][0] - 46) < 1e-9);
});


// ---------- lamina mechanisms ----------
import { lamina, flexureMaterial } from '@rulecad/flexures';
const petg = flexureMaterial({ modulus: 1810, strength: 34, name: 'PETG' }), fdm = { line: 0.42, layer: 0.2 };
const rect = (x0, y0, x1, y1) => jscad.primitives.polygon({ points: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] });
// A pusher on a two-leaf spring standing up (it moves back, -x, as the spring's travel grows), caught when cocked by a
// hook on a leaf latch: the pusher's tooth rides down the hook's ramp and the hook springs up behind it. A state lowers
// the latch to let it go. Options break it one way at a time.
function catapult({ lead = 30, engage = 1.5, release = 2.6, wall = 7, floorTop = 0.5, fuse = 0, bite = 15 } = {}) {
  const g = 0.3, stroke = 6, L = 46, t = 0.84, round = 1.5, half = 4 + t + round, drop = (q) => (3 * q * q) / (5 * L), under = L - g - drop(7);
  const yL = L - 6, px = 10, len = 22, xc = px + len - 3, hook = engage + g, run = hook / Math.tan((lead * Math.PI) / 180), lean = Math.tan((bite * Math.PI) / 180);
  // The tooth's front face matches the catch's (leaning back by the bite) where the cocked pusher meets it
  const top = L + 0.5, bottom = L - (engage + g + drop(7)), face = (y) => xc + stroke - (y - drop(stroke) - (under - hook)) * lean;
  return lamina({
    height: 6, gap: g, material: petg, printer: fdm,
    ground: [
      rect(-20, -6, 40, -3 + floorTop), // the floor, run into the spring's base block
      rect(-half - wall - 3, -6, -half - wall, L + 3), // the back wall: the spring's stop
      rect(px - 3, -6, px, yL + 2), // the latch's post
      rect(xc - 2, -6, xc + 6, yL - t / 2 - 3), // the latch's stop, under the hook
      ...(fuse ? [rect(4 + t + fuse, 5, 4 + t + fuse + 2, 20)] : []), // a block beside the front leaf
    ],
    bodies: {
      pusher: [rect(-half, L, xc + 10, L + 6), jscad.primitives.polygon({ points: [[face(top) - 1.2, top], [face(bottom) - 1.2, bottom], [face(bottom), bottom], [face(top), top]] })],
      hook: jscad.primitives.polygon({ points: [[xc, yL - t / 2], [xc + 1 + run, yL - t / 2], [xc + 1 + run, under - hook], [xc + 1, under], [xc - hook * lean, under], [xc, under - hook]] }),
    },
    joints: {
      spring: { kind: 'parallelGuide', params: { length: L, thickness: t, gap: 8, shuttle: 3, base: 3, fillet: round, into: t }, at: [0, 0], angle: 90, from: 'ground', to: 'pusher' },
      latch: { kind: 'leaf', params: { length: len, thickness: t, fillet: 1, into: t }, at: [px, yL], angle: 0, from: 'ground', to: 'hook' },
    },
    follows: { latch: { by: ['pusher'], give: -1 }, spring: { by: ['hook'], give: 1 } }, // the hook rides down the tooth; lowered, it presses the pusher back a little
    states: { drawn: { spring: stroke + 0.6 }, cocked: { spring: stroke }, released: { spring: stroke, latch: -release }, fired: { latch: -release } },
    sequence: ['rest', 'drawn', 'cocked', 'released', 'fired', 'rest'],
    holds: { cocked: [['spring', 'hook']] },
  });
}
const fails = (m, code) => m.findings.filter((f) => f.level === 'fail' && (!code || f.code === code));

test('a lamina mechanism: prints free, every step clear, the latch rides its ramp and holds, the springs stopped before they break', async () => {
  const m = await catapult();
  assert.deepEqual(fails(m), [], fails(m).map((f) => f.text).join('; '));
  const holds = m.findings.find((f) => f.code === 'lamina.holds');
  assert.ok(holds.level === 'pass' && holds.release > 1.5 && holds.release < 3, `the hook lets go once lowered past its catch: ${holds.text}`);
  assert.ok(m.findings.filter((f) => f.code === 'lamina.stop').every((f) => f.level === 'pass') && m.findings.filter((f) => f.code === 'lamina.stop').length === 2);
  assert.ok(m.energy.cocked > 0.002 && m.energy.rest === 0, 'the spring stores energy cocked, none at rest');
  assert.ok(m.frames.length > 40 && m.frames[0].parts.pusher.length && m.frames.some((fr) => fr.from === 'rest' && fr.to === 'drawn' && fr.t > 0));
  const box = measureBoundingBox(m.parts.body);
  assert.ok(Math.abs(box[0][2]) < 1e-9 && Math.abs(box[1][2] - 6) < 1e-9, 'one height, standing on the bed');
});

test('a lamina mechanism, broken: a steep ramp jams, a short release jams, a near neighbour fuses, an edge join comes apart, a spring with no stop breaks', async () => {
  assert.ok(fails(await catapult({ lead: 80 }), 'lamina.jam').some((f) => f.from === 'rest' && f.to === 'drawn'), 'cocking jams on a steep face');
  assert.ok(fails(await catapult({ release: 0.8 })).some((f) => f.from === 'released' && f.to === 'fired'), 'a latch lowered less than its catch holds on');
  assert.ok(fails(await catapult({ bite: -10 }), 'lamina.holds').length, 'a catch leaning the wrong way slips under load');
  assert.ok(fails(await catapult({ fuse: 0.1 }), 'lamina.free').length, 'a block 0.1 mm from a leaf prints fused to it');
  assert.ok(fails(await catapult({ floorTop: 0 }), 'lamina.attached').length, 'a spring that only touches the floor along an edge');
  assert.ok(fails(await catapult({ wall: 20 }), 'lamina.stop').some((f) => f.joint === 'spring'), 'nothing stops the spring before its strain limit');
});

test('displacement-first sizing: the travel and strain limit set the length, the force is set by the width (or, at a fixed width, the thickness)', () => {
  const free = size.forTravel('leaf', { travel: 10, energy: 20, material: petg }, fdm);
  assert.ok(Math.abs(free.strain - 0.8 * petg.strainLimit) < 1e-3 * petg.strainLimit && Math.abs(free.energy - 20) / 20 < 0.05, `at the limit, storing the energy: ${JSON.stringify(free)}`);
  assert.ok(Math.abs(free.width / fdm.layer - Math.round(free.width / fdm.layer)) < 1e-6, 'whole layers wide');
  const fixed = size.forTravel('parallelGuide', { travel: 12, force: 8, width: 14, material: petg }, fdm);
  assert.ok(Math.abs(fixed.force - 8) < 1e-6 && fixed.strain <= 0.8 * petg.strainLimit + 1e-9 && fixed.width === 14);
  assert.equal(size.forTravel('leaf', { travel: 10, energy: 20, material: petg, maxLength: 10 }, fdm), null, 'too short to bend that far');
  const pla = flexureMaterial({ modulus: 2680, strength: 39 });
  assert.ok(Math.abs(pla.yieldStrain - 39 / 2680) < 1e-12 && Math.abs(pla.strainLimit - pla.yieldStrain / 1.5) < 1e-12 && petg.yieldStrain > pla.yieldStrain, 'PETG bends further than PLA before it yields');
});

test('shaped beams: their models are the bar\'s formulas when plain, and a taper bends further and stores more at the same strain', () => {
  const p = { length: 40, thickness: 1.26, width: 8 }, plain = leafModel(p, petg), nearly = leafModel({ ...p, taper: 1e-6 }, petg);
  assert.ok(Math.abs(nearly.stiffness / plain.stiffness - 1) < 0.01 && Math.abs(nearly.strain(5) / plain.strain(5) - 1) < 0.01, 'the numeric model agrees with E w t³ / 4L³ and 3tδ / 2L²');
  const g = fixedGuidedModel(p, petg), gn = fixedGuidedModel({ ...p, taper: 1e-6 }, petg);
  assert.ok(Math.abs(gn.stiffness / g.stiffness - 1) < 0.01 && Math.abs(gn.strain(5) / g.strain(5) - 1) < 0.01, 'and a guided beam\'s with E w t³ / L³ and 3tδ / L²');
  for (const model of [leafModel, fixedGuidedModel]) {
    const bar = model(p, petg), shaped = model({ ...p, taper: 1, least: 0.84 }, petg), lim = petg.strainLimit;
    assert.ok(shaped.travel(lim) > 1.5 * bar.travel(lim) && shaped.energy(shaped.travel(lim)) > 1.5 * bar.stiffness * bar.travel(lim) ** 2 / 2, 'uniform strength: further, and more energy, before the limit');
  }
  const solid = parallelGuide({ length: 40, thickness: 1.26, width: 6, gap: 8, taper: 0.8, fillet: 2, least: 0.84, into: 0.84 });
  assert.ok(onePiece(solid) && measureBoundingBox(solid)[0][0] < -2.9, 'beams and blocks in one piece, the blocks wide enough to take the rounds');
});

// A leaf growing from a block into a tip, bent by a state; with a square root or a rounded one
async function flick({ fillet = 0 } = {}) {
  return lamina({
    height: 6, gap: 0.3, material: petg, printer: fdm,
    ground: [rect(-8, -8, 0, 8), rect(31.5, 2.42, 37, 6)],
    bodies: { tip: rect(30, -2, 37, 2) },
    joints: { leaf: { kind: 'leaf', params: { length: 30, thickness: 0.84, ...(fillet ? { fillet, tip: true, into: 0.84 } : {}) }, at: fillet ? [0, 0] : [-1, 0], from: 'ground', to: 'tip' } },
    states: { bent: { leaf: 2 } }, sequence: ['rest', 'bent', 'rest'],
  });
}

test('the peak strain by finite elements: a square root is a sharp corner and fails, a rounded one agrees with beam theory', async () => {
  const square = (await flick()).findings.find((f) => f.code === 'lamina.peak'), round = (await flick({ fillet: 1 })).findings.find((f) => f.code === 'lamina.peak');
  assert.ok(square.level === 'fail' && square.sharp && Math.abs(square.at[0]) < 0.5, `the square corner where the leaf meets the block: ${square.text}`);
  assert.ok(round.level === 'pass' && round.ratio > 0.8 && round.ratio < 1.3, `a round brings it to about beam theory's: ${round.text}`);
});

// ---------- beams that bend as far as they bend ----------
import { beamSystem, equilibrium } from '@rulecad/flexures';

test('the beam solver: a cantilever as beam theory says at small loads and as the elastica at large ones, a guided beam, a parallel guide and its drop, and a column that buckles at the Euler load', () => {
  const E = 1810, L = 40, t = 1.26, w = 8, I = (w * t ** 3) / 12, ground = { at: [0, 0], fixed: true };
  const leafSys = beamSystem({ bodies: { ground }, beams: [{ name: 'leaf', path: [[0, 0], [L, 0]], thickness: t, width: w, E, from: 'ground' }] }), tip = leafSys.nodes.at(-1).dof;
  const small = equilibrium(leafSys, { loads: new Map([[tip + 1, 0.01]]) });
  assert.ok(Math.abs(small.q[tip + 1] / ((0.01 * L ** 3) / (3 * E * I)) - 1) < 0.002, 'FL³/3EI');
  for (const k of [1, 2]) { // PL²/EI of 1 and 2: the tip at 0.3017 and 0.4935 of the length (Bisshopp and Drucker)
    const r = equilibrium(leafSys, { loads: new Map([[tip + 1, (k * E * I) / L ** 2]]) });
    assert.ok(r.converged && Math.abs(r.q[tip + 1] / L - [0, 0.3017, 0.4935][k]) < 0.002, `PL²/EI = ${k}: ${(r.q[tip + 1] / L).toFixed(4)}`);
  }
  const guided = beamSystem({ bodies: { ground, tip: { at: [L, 0] } }, beams: [{ name: 'b', path: [[0, 0], [L, 0]], thickness: t, width: w, E, from: 'ground', to: 'tip' }] }), d = guided.body.tip.dof;
  assert.ok(Math.abs(equilibrium(guided, { held: new Map([[d + 1, 1], [d + 2, 0]]) }).reaction.get(d + 1) / ((12 * E * I) / L ** 3) - 1) < 0.005, '12EI/L³');
  const pair = beamSystem({ bodies: { ground, shuttle: { at: [L, 0] } }, beams: [-5, 5].map((y, i) => ({ name: `b${i}`, path: [[0, y], [L, y]], thickness: t, width: w, E, from: 'ground', to: 'shuttle' })) }), s = pair.body.shuttle.dof;
  const r = equilibrium(pair, { held: new Map([[s + 1, 6]]) }), m = parallelGuideModel({ length: L, thickness: t, width: w }, { E });
  assert.ok(Math.abs(r.reaction.get(s + 1) / (m.stiffness * 6) - 1) < 0.02 && Math.abs(-r.q[s] / m.drop(6) - 1) < 0.02, 'the guide\'s stiffness and its drop, 3δ²/5L');
  const col = beamSystem({ bodies: { ground }, beams: [{ name: 'c', path: [[0, 0], [0, L]], thickness: t, width: w, E, from: 'ground' }] }), top = col.nodes.at(-1).dof, Pcr = (Math.PI ** 2 * E * I) / (4 * L * L);
  const below = equilibrium(col, { loads: new Map([[top + 1, -0.95 * Pcr], [top, 1e-4 * Pcr]]) }), above = equilibrium(col, { loads: new Map([[top + 1, -1.05 * Pcr], [top, 1e-4 * Pcr]]), start: below.q });
  assert.ok(Math.abs(below.q[top]) < 0.1 && Math.abs(above.q[top]) > 5, 'stands under the Euler load, bows over it');
});

test('a pivot pair turns about the point its leaves\' lines meet, and its model agrees with the beam solver', async () => {
  const L = 16, near = 8, a = 2.5, into = 0.84, angles = [235, 270], dirs = angles.map((d) => [Math.cos((d * Math.PI) / 180), Math.sin((d * Math.PI) / 180)]);
  const disc = (c, r) => jscad.primitives.circle({ center: c, radius: r, segments: 32 }), along = (r) => dirs.map(([c, s]) => [c * r, s * r]);
  const m = await lamina({
    height: 14, gap: 0.3, material: petg, printer: fdm, check: { fe: false },
    ground: [jscad.hulls.hull(...along(near + L + a - into).map((p) => disc(p, a)))],
    bodies: { arm: [jscad.hulls.hull(...along(near - a + into).map((p) => disc(p, a)), disc([10, -4], 2))] },
    joints: { pair: { kind: 'pivotPair', params: { length: L, thickness: 0.84, angles, near }, at: [0, 0], from: 'ground', to: 'arm' } },
    states: { turned: { pair: -4 } }, sequence: ['rest', 'turned', 'rest'],
  });
  const model = m.findings.find((f) => f.code === 'lamina.strain' && f.joint === 'pair').strain, beams = m.findings.find((f) => f.code === 'lamina.beams' && f.joint === 'pair').strain;
  assert.ok(Math.abs(beams / model - 1) < 0.1, `model ${(model * 100).toFixed(3)}%, beams ${(beams * 100).toFixed(3)}%`);
});

test('firing: let go, a pusher on a spring throws a loose disc, never with more energy than was stored', async () => {
  const L = 30, t = 0.84, half = 4 + t + 1, stroke = 5, g = 0.3;
  const m = await lamina({
    height: 6, gap: g, material: { ...petg, density: 1.27 }, printer: fdm, check: { fe: false },
    // The guide moves the pusher along y: the disc sits on it, edge on, between rails that stop the pusher at rest
    ground: [rect(-8, -6, -3 + 0.5, 6), rect(L + 1, half + g, L + 3.3 - g, half + 20), rect(L + 6.7 + g, half + g, L + 9, half + 20)],
    bodies: { pusher: rect(L, -half, L + 10, half) },
    joints: { spring: { kind: 'parallelGuide', params: { length: L, thickness: t, gap: 8, shuttle: 3, base: 3, fillet: 1, into: t }, at: [L, 0], angle: 180, from: 'ground', to: 'pusher' } },
    free: { disc: { shape: rect(L + 3.6, half + g, L + 6.4, half + g + 20), mass: 0.5 } },
    states: { drawn: { spring: stroke } }, sequence: ['rest', 'drawn'],
    fire: { from: 'drawn', disc: 'disc', duration: 0.01 },
  });
  const f = m.findings.find((x) => x.code === 'lamina.fire');
  assert.ok(f && f.level !== 'fail' && f.exit && f.exit.energy > 0 && f.exit.energy <= f.stored * 1.02, f?.text);
  assert.ok(!m.findings.some((x) => x.code === 'lamina.fire' && /pressed/.test(x.text)), 'nothing starts pressed into anything');
  const pusherMass = 1.27e-6 * 6 * 10 * (2 * half), most = Math.sqrt((2 * f.stored) / pusherMass); // all the energy in the pusher alone
  assert.ok(f.speeds.pusher > 0.5 * most && f.speeds.pusher <= most * 1.05, `the pusher's ${f.speeds.pusher.toFixed(2)} m/s against at most ${most.toFixed(2)}`);
});

test('a wave spring: round bends, and pressed past solid its legs meet (self-contact), so its force climbs steeply', async () => {
  const p = { span: 14, pitch: 2.4, turns: 5, thickness: 0.84, smooth: 8 }, top = (p.turns - 1) * p.pitch, R = p.pitch / 2;
  const make = async (press) => lamina({
    height: 6, gap: 0.3, material: petg, printer: fdm, kinematic: false, check: { fe: false },
    ground: [rect(-4, -R - 3, p.span + 4, -R - 0.6), rect(0, -R - 3, p.span - 2 * R, 0.42), rect(-4, -R - 3, -R - 1.5, top + 6), rect(p.span + R + 1.5, -R - 3, p.span + 4, top + 6)],
    bodies: { cap: [rect(2 * R, top - 0.42, p.span, top + R + 1), rect(-R - 1.2, top + R + 1, p.span + R + 1.2, top + 4)] },
    joints: { spring: { kind: 'waveSpring', params: p, at: [0, 0], from: 'ground', to: 'cap' } },
    states: { pressed: { spring: -press } }, sequence: ['rest', 'pressed'],
  });
  const force = (m) => m.findings.find((f) => f.code === 'lamina.force').peak;
  const soft = force(await make(3)), solid = force(await make(8.5)); // the legs' gaps close at about 4 × (2.4 − 0.84) = 6.2 mm
  assert.ok(solid > (soft * 8.5) / 3 * 2, `past solid it should be far stiffer than its linear rise: ${soft.toFixed(2)} N at 3 mm, ${solid.toFixed(2)} N at 8.5 mm`);
});

test('a curve flexure: drawn straight it is a guided beam (the solver agrees with beam theory), and mirrored it is two arms whose energy is twice one', async () => {
  const { curve, curveModel, curvePath, fixedGuidedModel } = await import('@rulecad/flexures');
  const m = { E: 1810, strainLimit: 0.0125 }, p = { points: [[0, 0], [20, 0], [40, 0]], thickness: 1, width: 10, moves: 'y', across: 'free' };
  const c = curveModel(p, m), g = fixedGuidedModel({ length: 40, thickness: 1, width: 10 }, m);
  assert.ok(Math.abs(c.stiffness / g.stiffness - 1) < 0.01, `solver ${c.stiffness.toFixed(4)} N/mm, beam theory ${g.stiffness.toFixed(4)}`);
  assert.ok(Math.abs(c.strain(1) / g.strain(1) - 1) < 0.01);
  // A bowed arm and its mirror, pulled along the mirror line: twice the energy of the arm alone held across
  const bow = { points: [[0, 30], [12, 18], [0, 5]], thickness: [1.2, 1.6, 1.2], width: 10, start: 270, end: -90, moves: 'x' };
  const one = curveModel({ ...bow, across: 'held' }, m), two = curveModel({ ...bow, mirror: 0 }, m);
  assert.ok(Math.abs(two.energy(-3) / one.energy(-3) - 2) < 1e-6);
  // Its path passes through its points and leaves the root the way it's told
  const path = curvePath({ ...bow, smooth: 10 }).path, lead = path[10]; // the lead's far end: ten samples a span
  assert.deepEqual(path[0], [0, 30]); assert.deepEqual(path.at(-1), [0, 5]);
  assert.ok(Math.abs(Math.atan2(lead[1] - path[0][1], lead[0] - path[0][0]) * 180 / Math.PI + 90) < 1, 'it leaves the root going down');
  // Drawn, one piece each arm, extruded the right way out
  const shape = curve({ ...bow, mirror: 0 }), box = measureBoundingBox(shape);
  assert.ok(measureVolume(shape) > 0 && box[0][1] < -29 && box[1][1] > 29);
});

test('shaping a curve: from a meander, to a job, it stores the energy with its strain within the margin, keeps to its room, and picks the height that stores it', async () => {
  const { shapeCurve, meander, curveModel } = await import('@rulecad/flexures');
  assert.throws(() => meander({ root: [20, 30], tip: [0, 5], legs: 4, lo: 8, hi: 28 }), /odd/);
  const material = { E: 1810, strainLimit: 0.0125 }, root = [24, 30], tip = [0, 5];
  const job = { root, tip, start: 270, end: -90, region: { lo: [-6, 5.6], hi: [30, 30] }, gap: 0.3, thickness: [1, 2.5], moves: 'x', travel: -4, energy: 6, mirror: 0, width: [4, 20], margin: 0.8, guess: meander({ root, tip, legs: 3, lo: 9, hi: 27 }) };
  const r = shapeCurve({ ...job, material, evaluations: 300, starts: 4, runs: 1, smooth: 3 });
  assert.ok(r.ok, r.why.join('; '));
  assert.ok(r.strain <= material.strainLimit * 0.8 * 1.001, `${(r.strain * 100).toFixed(2)}%`);
  assert.ok(r.width >= 4 && r.width <= 20);
  // The shape it gives, solved again at its height, stores what it said
  const again = curveModel(r.params, material);
  assert.ok(Math.abs(again.energy(-4) / r.energy - 1) < 0.02, `${again.energy(-4).toFixed(2)} mJ against ${r.energy.toFixed(2)}`);
  assert.ok(r.energy >= job.energy * 0.98 || r.width === 20);
});

test('a flooded frame: solid everywhere but the room the moving parts sweep, so it prints free and stops what it holds; a thin arm tied on at one end is found', async () => {
  const leafJob = { length: 30, thickness: 0.84, fillet: 1, tip: true, into: 0.84 };
  const base = { height: 6, gap: 0.3, material: petg, printer: fdm, check: { fe: false }, physics: false, bodies: { tip: rect(30, -2, 37, 2) }, joints: { leaf: { kind: 'leaf', params: leafJob, at: [0, 0], from: 'ground', to: 'tip' } }, states: { bent: { leaf: 3 } }, sequence: ['rest', 'bent', 'rest'] };
  const m = await lamina({ ...base, ground: rect(-8, -8, 0, 8), flood: { outline: rect(-8, -12, 45, 12) } });
  assert.ok(m.findings.some((x) => x.code === 'lamina.flood'), 'it says the frame is flooded');
  assert.ok(!m.findings.some((x) => x.code === 'lamina.free' && x.level === 'fail'), m.findings.filter((x) => x.code === 'lamina.free').map((x) => x.text).join('; '));
  const g = m.outlines('rest').ground, area = (l) => Math.abs(l.reduce((s, p, i) => { const q = l[(i + 1) % l.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2);
  assert.ok(g.reduce((s, l) => s + area(l), 0) > 53 * 24 * 0.5, 'most of the outline is solid');
  // A rail 1.5 mm thick standing off the frame at one end only bends: it's found
  const rail = await lamina({ ...base, ground: [rect(-8, -8, 0, 8), rect(0, 6, 25, 7.5)] });
  assert.ok(rail.findings.some((x) => x.code === 'lamina.rigid'), 'a free-ended rail is found');
});
