import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leaf, leafModel, fixedGuided, fixedGuidedModel, parallelGuide, parallelGuideModel, serpentine, serpentineModel, notchHinge, notchHingeModel, bistable, bistableModel, livingHinge, livingHingeModel, elastica, leafFlexed, compoundGuide, compoundGuideModel, letJoint, letJointModel, constantForce, constantForceCrank, constantForceModel, ellipticalHinge, ellipticalHingeModel, cartwheel, cartwheelModel, snapHook, snapHookModel, ratchetWheel, ratchetPawl, ratchetModel, foldedGuide, foldedGuideModel, pinJoint, pinJointCheck, snapPin, snapSocket, snapPinModel, travelStop, angleStop, contactLeaf, contactLeafModel, parallelogram, parallelogramModel, tweezers, tweezersModel, curvedLeaf, curvedLeafModel, ports, size, report, printable } from '@rulecad/flexures';
import { latticeCell, latticeBlock, latticeBlockModel, latticeFindings } from '@rulecad/flexures';
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
  assert.ok(Math.abs(m.strain(m.angle(0.02)) - 0.02) < 1e-12);
  // against the beam solver, not the formula's own words: four spokes fixed at the rim, the hub turned a milliradian
  for (const [hub, spoke] of [[2, 10], [4, 10], [2, 30]]) {
    const dirs = [45, 135, 225, 315].map((a) => [Math.cos((a * Math.PI) / 180), Math.sin((a * Math.PI) / 180)]);
    const sys = beamSystem({ bodies: { rim: { at: [0, 0], fixed: true }, hub: { at: [0, 0] } }, segments: 16,
      beams: dirs.map(([c, sn], k) => ({ name: `s${k}`, path: [[(hub + spoke) * c, (hub + spoke) * sn], [hub * c, hub * sn]], thickness: 0.84, width: 8, E: 2680, from: 'rim', to: 'hub' })) });
    const th = 1e-3, dof = sys.body.hub.dof, r = equilibrium(sys, { held: new Map([[dof, 0], [dof + 1, 0], [dof + 2, th]]) });
    const solved = r.reaction.get(dof + 2) / th, said = cartwheelModel({ spoke, thickness: 0.84, width: 8, hub }, pla).stiffness;
    assert.ok(Math.abs(said / solved - 1) < 0.01, `hub ${hub}, spokes ${spoke}: the model says ${said.toFixed(0)} N·mm a radian, the solver ${solved.toFixed(0)}`);
  }
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

test('a contact-aided leaf: the leaf\'s rate until the beam meets the stop, then a cantilever propped at the stop; the contact travel from the cantilever\'s shape', () => {
  const p = { length: 40, thickness: 0.84, width: 8, stop: 20, gap: 2 }, m = contactLeafModel(p, pla), one = leafModel(p, pla), clamped = leafModel({ ...p, length: 20 }, pla);
  const EI = (one.stiffness * 40 ** 3) / 3, a = 20, b = 20;
  assert.ok(m.first === one.stiffness && Math.abs(m.second - (12 * EI) / (b * b * (3 * a + 4 * b))) < 1e-12, 'propped: P b² (3a + 4b) / 12EI at the tip');
  assert.ok(Math.abs(clamped.stiffness / m.second - (1 + (3 * a) / (4 * b))) < 1e-9, 'clamped at the stop overstated it by 1 + 3a/4b');
  // the propped form's ends: a stop at the root is a shorter cantilever clamped there; a stop at the tip holds it
  const at = (stop) => contactLeafModel({ ...p, stop }, pla).second, short = (l) => leafModel({ ...p, length: l }, pla).stiffness;
  assert.ok(Math.abs(at(1e-6) / short(40) - 1) < 1e-4 && at(39.999) > 1e6 * m.first);
  assert.ok(Math.abs(m.contact - (2 * 2 * 40 ** 3) / (3 * 40 * 400 - 8000)) < 1e-9, 'the tip travel when the beam at the stop has dropped the gap');
  assert.ok(Math.abs(m.force(m.contact) - one.stiffness * m.contact) < 1e-9 && Math.abs(m.force(m.contact + 1) - m.force(m.contact) - m.second) < 1e-9);
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
  assert.ok(onePiece(shape) && box[0][1] < -6 && box[0][1] > -6.5 && measureVolume(shape) > 40 * 0.84 * 8, 'the arc bows the rise off its chord; an arc is longer than its chord');
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
function catapult({ lead = 30, engage = 1.5, release = 2.6, wall = 7, floorTop = 0.5, fuse = 0, bite = 15, set = false } = {}) {
  const g = 0.3, stroke = 6, L = 46, t = 0.84, round = 1.5, half = 4 + t + round, drop = (q) => (3 * q * q) / (5 * L), under = L - g - drop(7);
  const yL = L - 6, px = 10, len = 22, xc = px + len - 3, hook = engage + g, run = hook / Math.tan((lead * Math.PI) / 180), lean = Math.tan((bite * Math.PI) / 180);
  // The tooth's front face matches the catch's (leaning back by the bite) where the cocked pusher meets it
  const top = L + 0.5, bottom = L - (engage + g + drop(7)), face = (y) => xc + stroke - (y - drop(stroke) - (under - hook)) * lean;
  return lamina({
    height: 6, gap: g, material: petg, printer: fdm, check: { across: false, bite: 0 }, // (its leaves twist out of the plane: the guide test covers that; its hook swings the way the spring pulls, so square is the best it can bite)
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
    states: { drawn: { spring: stroke + 0.6 }, ...(set ? { set: { spring: stroke } } : {}), cocked: { spring: stroke }, released: { spring: stroke, latch: -release }, fired: { latch: -release } },
    sequence: ['rest', 'drawn', ...(set ? ['set'] : []), 'cocked', 'released', 'fired', 'rest'], // (set: the hand brings it on to the hook first, and holds it there)
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
  const out = fails(await catapult({ bite: 0 }), 'lamina.bite');
  assert.ok(out.length && out[0].bite < -10, 'a catch the load pushes towards letting go holds only by friction, which a print can\'t be trusted for');
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
  const spec = {
    height: 6, gap: g, material: { ...petg, density: 1.27 }, printer: fdm, check: { fe: false },
    // The guide moves the pusher along y: the disc sits on it, edge on, between rails that stop the pusher at rest
    ground: [rect(-8, -6, -3 + 0.5, 6), rect(L + 1, half + g, L + 3.3 - g, half + 20), rect(L + 6.7 + g, half + g, L + 9, half + 20)],
    bodies: { pusher: rect(L, -half, L + 10, half) },
    joints: { spring: { kind: 'parallelGuide', params: { length: L, thickness: t, gap: 8, shuttle: 3, base: 3, fillet: 1, into: t }, at: [L, 0], angle: 180, from: 'ground', to: 'pusher' } },
    free: { disc: { shape: rect(L + 3.6, half + g, L + 6.4, half + g + 20), mass: 0.5 } },
    states: { drawn: { spring: stroke } }, sequence: ['rest', 'drawn'],
    fire: { from: 'drawn', disc: 'disc', duration: 0.01 },
  }, m = await lamina(spec);
  const f = m.findings.find((x) => x.code === 'lamina.fire');
  assert.ok(f && f.level !== 'fail' && f.exit && f.exit.energy > 0 && f.exit.energy <= f.stored * 1.02, f?.text);
  assert.ok(!m.findings.some((x) => x.code === 'lamina.fire' && /pressed/.test(x.text)), 'nothing starts pressed into anything');
  const pusherMass = 1.27e-6 * 6 * 10 * (2 * half), most = Math.sqrt((2 * f.stored) / pusherMass); // all the energy in the pusher alone
  assert.ok(f.speeds.pusher > 0.5 * most && f.speeds.pusher <= most * 1.05, `the pusher's ${f.speeds.pusher.toFixed(2)} m/s against at most ${most.toFixed(2)}`);
  // Lying in the plane with nothing over or under it, the disc falls out of it; a roof and a floor along its way hold it
  assert.ok(m.findings.some((x) => x.code === 'lamina.carried' && x.level === 'fail' && x.side === 'under') && m.findings.some((x) => x.code === 'lamina.carried' && x.level === 'fail' && x.side === 'over'), 'nothing holds the disc in the plane');
  const way = rect(L + 1, half + 2, L + 9, half + 20), held = await lamina({ ...spec, bridges: [{ shape: way }, { shape: way, side: 'bottom' }] });
  const c = held.findings.filter((x) => x.code === 'lamina.carried');
  assert.ok(c.length === 1 && c[0].level === 'pass', c.map((x) => x.text).join('; '));
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
  // As a web: solid only round what moves and the edge, the rest windows; lighter, and still free
  const web = await lamina({ ...base, ground: rect(-8, -8, 0, 8), flood: { outline: rect(-60, -30, 45, 30), band: 3 } }), slab = await lamina({ ...base, ground: rect(-8, -8, 0, 8), flood: { outline: rect(-60, -30, 45, 30) } });
  const { measureVolume } = jscad.measurements;
  assert.ok(measureVolume(web.parts.body) < measureVolume(slab.parts.body) * 0.8, 'the web is lighter');
  assert.ok(!web.findings.some((x) => x.code === 'lamina.free' && x.level === 'fail'));
  // A rail 1.5 mm thick standing off the frame at one end only bends: it's found
  const rail = await lamina({ ...base, ground: [rect(-8, -8, 0, 8), rect(0, 6, 25, 7.5)] });
  assert.ok(rail.findings.some((x) => x.code === 'lamina.rigid'), 'a free-ended rail is found');
});

test('a bridge: printed over a moving part on the top layers, the part cut down under it wherever it passes, standing on the frame both sides and no wider than the printer bridges', async () => {
  const base = { height: 6, gap: 0.3, material: petg, printer: { ...fdm, bridge: 5 }, check: { fe: false }, physics: false,
    bodies: { tip: rect(30, -2, 37, 2) }, joints: { leaf: { kind: 'leaf', params: { length: 30, thickness: 0.84, fillet: 1, tip: true, into: 0.84 }, at: [0, 0], from: 'ground', to: 'tip' } },
    states: { bent: { leaf: 1 } }, sequence: ['rest', 'bent', 'rest'], flood: { outline: rect(-8, -12, 45, 12) } };
  const m = await lamina({ ...base, bridges: [{ shape: rect(32, -6, 35, 6) }] });
  const b = m.findings.filter((x) => x.code === 'lamina.bridge');
  assert.ok(b.length && b.every((x) => x.level === 'pass'), b.map((x) => x.level + " " + x.text).join('; '));
  assert.ok(b.some((x) => /tip passes under it/.test(x.text)), 'the tip is cut down under it');
  const { measureVolume } = jscad.measurements, flat = await lamina(base);
  assert.ok(Math.abs(measureVolume(m.parts.body) - measureVolume(flat.parts.body)) > 1, 'the bridge and the cut change the print');
  // Too wide a span, and one standing on nothing, are found
  const wide = await lamina({ ...base, bridges: [{ shape: rect(28, -11, 39, -1) }] });
  assert.ok(wide.findings.some((x) => x.code === 'lamina.bridge' && x.level === 'fail'), 'a bridge too wide, or on one side, fails');
  // A floor under it instead: the tip on its leaf turns as it passes, and a floor's arch is for what slides
  const floor = await lamina({ ...base, bridges: [{ shape: rect(32, -6, 35, 6), side: 'bottom' }] });
  assert.ok(floor.findings.some((x) => x.code === 'lamina.bridge' && x.level === 'fail' && /turns/.test(x.text)), 'a floor under something that turns fails');
});

test('a floor: what slides over it is arched up at 45°, clear of it all along, and the print has no overhang past 45°', async () => {
  const L = 30, t = 0.84;
  const m = await lamina({
    height: 8, gap: 0.3, material: petg, printer: { ...fdm, bridge: 5 }, check: { fe: false }, physics: false,
    bodies: { slider: [rect(L, -4, L + 6, 4), rect(L + 6, -1.5, L + 40, 1.5)] },
    joints: { spring: { kind: 'parallelGuide', params: { length: L, thickness: t, gap: 5, shuttle: 3, base: 3, fillet: 1, into: t }, at: [0, 0], angle: -90, from: 'ground', to: 'slider' } },
    states: { drawn: { spring: 4 } }, sequence: ['rest', 'drawn', 'rest'],
    flood: { outline: rect(-20, -40, L + 50, 12), keep: [] }, bridges: [{ shape: rect(L + 22, -4, L + 26, 4), side: 'bottom' }],
  });
  const b = m.findings.filter((x) => x.code === 'lamina.bridge');
  assert.ok(b.length && b.every((x) => x.level === 'pass') && b.some((x) => /arched up/.test(x.text)), b.map((x) => x.level + " " + x.text).join('; '));
  const { check } = await import('@rulecad/printcheck');
  const found = check(jscad.geometries.geom3.toPolygons(m.parts.body).map((p) => p.vertices), { bed: 256, overhang: 45, layer: 0.2, line: 0.42, bridge: 5 });
  const said = found.find((x) => /overhang/i.test(x.text));
  assert.ok(said && said.level === 'pass', said?.text ?? found.map((x) => x.text).join('; '));
});

test('across the plane: a strip as tall as the print is stiff bending across it, as beam theory says, and soft twisting', async () => {
  const { beamSystem } = await import('@rulecad/flexures'), { outOfPlane } = await import('./outofplane.mjs');
  const E = 1810, L = 40, t = 1.26, h = 10;
  const sys = beamSystem({ bodies: { ground: { at: [0, 0], fixed: true }, tip: { at: [L, 0] } }, beams: [{ name: 'b', path: [[0, 0], [L, 0]], thickness: t, width: h, E, from: 'ground', to: 'tip' }], segments: 20 });
  const lift = outOfPlane(sys, { loads: [{ body: 'tip', at: [L, 0], force: 1 }] }).lift('tip', [L, 0]);
  assert.ok(Math.abs(lift / (L ** 3 / (3 * E * t * h ** 3 / 12)) - 1) < 1e-3);
  const G = E / (2 * 1.38), J = (h * t ** 3) / 3 * (1 - 0.63 * t / h), twist = outOfPlane(sys, { loads: [{ body: 'tip', at: [L, 10], force: 1 }] }).bodies.tip[1];
  assert.ok(Math.abs(twist / ((10 * L) / (G * J)) - 1) < 1e-3, 'it twists as G J says');
  // Held across the plane at its tip (a guide), it hardly moves
  const held = outOfPlane(sys, { loads: [{ body: 'tip', at: [L, 10], force: 1 }], springs: [{ body: 'tip', at: [L, 5], k: 1e3 }, { body: 'tip', at: [L, -5], k: 1e3 }] });
  assert.ok(Math.abs(held.lift('tip', [L, 10])) < 0.01);
  // A guide with play holds nothing until the part has moved across its gap, then holds it there, and only that way
  const free = outOfPlane(sys, { loads: [{ body: 'tip', at: [L, 0], force: 0.01 }] }).lift('tip', [L, 0]);
  const loose = (force) => outOfPlane(sys, { loads: [{ body: 'tip', at: [L, 0], force }], springs: [{ body: 'tip', at: [L, 0], k: 1e3, gap: 0.3 }] }).lift('tip', [L, 0]);
  assert.ok(Math.abs(loose(0.01) - free) < 1e-9, 'within its play, as if it weren\'t there');
  const far = loose(0.01 * (0.6 / free)); // pushed twice as far as the play, unheld
  assert.ok(far > 0.3 && far < 0.31, `stopped just past its play: ${far.toFixed(3)} mm`);
  assert.ok(loose(-0.01 * (0.6 / free)) < -0.3 && loose(-0.01 * (0.6 / free)) > -0.31, 'either way');
});

test('a guide: a ridge on what slides runs in a groove in the frame, flanks at 45°, so it stays in the plane and prints without support', async () => {
  const L = 30, t = 0.84, rod = rect(L + 6, -1.5, L + 40, 1.5);
  const spec = {
    height: 8, gap: 0.3, material: petg, printer: { ...fdm, bridge: 5 }, check: { fe: false },
    bodies: { slider: [rect(L, -4, L + 6, 4), rod] },
    joints: { spring: { kind: 'parallelGuide', params: { length: L, thickness: t, gap: 5, shuttle: 3, base: 3, fillet: 1, into: t }, at: [0, 0], angle: -90, from: 'ground', to: 'slider' } },
    states: { drawn: { spring: 4 } }, sequence: ['rest', 'drawn', 'rest'],
    flood: { outline: rect(-20, -40, L + 50, 12) },
  };
  const free = await lamina(spec), held = await lamina({ ...spec, guides: [{ body: 'slider', shape: rect(L + 26, -8, L + 32, 8) }] });
  const g = held.findings.find((x) => x.code === 'lamina.guide');
  assert.ok(g && g.level === 'pass', g?.text);
  const across = (m) => m.findings.find((x) => x.code === 'lamina.across' && x.body === 'slider').most;
  assert.ok(across(held) < across(free) / 10, `held ${across(held).toFixed(3)} mm against ${across(free).toFixed(3)} free`);
  const { measureVolume } = jscad.measurements;
  assert.ok(Math.abs(measureVolume(held.parts.body) - measureVolume(free.parts.body)) > 0.5, 'the ridge and the groove change the print');
  const { check } = await import('@rulecad/printcheck');
  const said = check(jscad.geometries.geom3.toPolygons(held.parts.body).map((p) => p.vertices), { bed: 256, overhang: 45, layer: 0.2, line: 0.42, bridge: 5 }).find((x) => /overhang/i.test(x.text));
  assert.ok(said && said.level === 'pass', said?.text);
});

test('a curve turned about a point: a straight one turned about its middle bends round evenly, as a moment bends it (EIθ/L, strain tθ/2L)', async () => {
  const { curveSolver, curveModel } = await import('./curves.mjs');
  const m = { E: 1810, strainLimit: 0.0125 }, L = 20, t = 1.2, w = 10, EI = (1810 * w * t ** 3) / 12;
  const p = { points: [[0, 0], [L / 2, 0], [L, 0]], thickness: t, width: w, moves: 'turn', about: [L / 2, 0] };
  const r = curveSolver(p, m).solve(0.01);
  assert.ok(Math.abs(r.force / ((EI * 0.01) / L) - 1) < 0.02, `moment ${r.force.toFixed(3)} N·mm, theory ${((EI * 0.01) / L).toFixed(3)}`);
  assert.ok(Math.abs(r.strain / ((t * 0.01) / (2 * L)) - 1) < 0.03, `strain ${r.strain}`);
  // Further round, turning about a fixed point stretches it too (its tip's arc isn't the bent leaf's): the limit comes
  // sooner than bending alone says
  const most = curveModel(p, m).travel(0.0125);
  assert.ok(most > 0.15 && most < (0.0125 * 2 * L) / t, `the turn the limit allows: ${most.toFixed(3)} rad`);
  // A bent one isn't the same both ways: asked the way it turns, it may go as far as that way allows, never less than
  // the nearer way, which is what it's held to unasked
  const bent = curveModel({ ...p, points: [[0, 0], [L / 2, 3], [L, 0]] }, m), up = bent.travel(0.0125, 1), down = bent.travel(0.0125, -1);
  assert.ok(Math.abs(Math.min(up, down) - bent.travel(0.0125)) < 1e-6 && Math.abs(up - down) > 0.01, `one way ${up.toFixed(3)}, the other ${down.toFixed(3)}`);
});

test('a flooded frame with holes: each in a solid boss no window opens into, and one in the moving parts\' room fails', async () => {
  const base = { height: 6, gap: 0.3, material: petg, printer: fdm, check: { fe: false }, physics: false, bodies: { tip: rect(30, -2, 37, 2) }, joints: { leaf: { kind: 'leaf', params: { length: 30, thickness: 0.84, fillet: 1, tip: true, into: 0.84 }, at: [0, 0], from: 'ground', to: 'tip' } }, states: { bent: { leaf: 3 } }, sequence: ['rest', 'bent', 'rest'], ground: rect(-8, -8, 0, 8) };
  const holes = [{ at: [-50, 22], diameter: 4.1, wall: 3 }, { at: [38, -22], diameter: 4.1, wall: 3 }];
  const m = await lamina({ ...base, flood: { outline: rect(-60, -30, 45, 30), band: 3, holes } });
  const h = m.findings.filter((x) => x.code === 'lamina.holes');
  assert.equal(h.length, 2); assert.ok(h.every((x) => x.level === 'pass'), h.map((x) => x.text).join('; '));
  const g = m.outlines('rest').ground, inside = (l, [x, y]) => l.reduce((c, a, i) => { const b = l[(i + 1) % l.length]; return (a[1] > y) !== (b[1] > y) && x < a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]) ? !c : c; }, false);
  const solidAt = (p) => g.reduce((c, l) => (inside(l, p) ? !c : c), false);
  assert.ok(!solidAt([-50, 22]) && solidAt([-50, 22 + 3.5]) && solidAt([-50 + 3.5, 22]), 'a hole, with solid round it');
  const bad = await lamina({ ...base, flood: { outline: rect(-60, -30, 45, 30), holes: [{ at: [20, 0], diameter: 4.1 }] } });
  assert.ok(bad.findings.some((x) => x.code === 'lamina.holes' && x.level === 'fail'), 'one where the leaf swings is found');
});


test('a curve\'s end is seated: where it ends oblique to its body\'s edge, a block square to it stands out to hold its flare and run on (and says so); a square end in solid is left alone', async () => {
  const base = { height: 6, gap: 0.3, material: petg, printer: fdm, check: { fe: false }, physics: false, ground: rect(-8, -10, 0.5, 10), states: { bent: { hinge: 0.3 } }, sequence: ['rest', 'bent', 'rest'] };
  const curve = (end) => ({ points: [[0, 0], [10, end / 2], [20, end]], thickness: 1, fillet: 1, into: 0.84, lead: 2, start: 0, end: Math.atan2(end, 20) * (180 / Math.PI), moves: 'turn', about: [10, end / 2] });
  // Square: straight along x into a block that covers its end: nothing to add
  const square = await lamina({ ...base, bodies: { arm: rect(20, -5, 30, 5) }, joints: { hinge: { kind: 'curve', params: curve(0), from: 'ground', to: 'arm' } } });
  const s = square.findings.filter((x) => x.code === 'lamina.seat');
  assert.ok(s.length === 1 && s[0].level === 'pass', s.map((x) => x.text).join('; '));
  // Oblique, ending just under the body's top edge: the flare would stick out of it, so a seat stands out there
  const oblique = await lamina({ ...base, bodies: { arm: rect(20, -5, 30, 6.5) }, joints: { hinge: { kind: 'curve', params: curve(6), from: 'ground', to: 'arm' } } });
  const o = oblique.findings.filter((x) => x.code === 'lamina.seat');
  assert.ok(o.some((x) => x.level === 'info' && x.part === 'arm' && x.end === 'end'), o.map((x) => x.text).join('; '));
  const g = oblique.outlines('rest'), inside = (l, [x, y]) => l.reduce((c, a, i) => { const b = l[(i + 1) % l.length]; return (a[1] > y) !== (b[1] > y) && x < a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]) ? !c : c; }, false);
  const solid = (p) => g.arm.reduce((c, l) => (inside(l, p) ? !c : c), false), u = [Math.cos(Math.atan2(6, 20)), Math.sin(Math.atan2(6, 20))];
  const plug = g.hinge.flat().filter(([x, y]) => (x - 20) * u[0] + (y - 6) * u[1] > 0.05);
  assert.ok(plug.length > 0 && plug.every(solid), 'all of its run on inside the arm and its seat');
  assert.ok(solid([20 + u[0] * 1 - u[1] * 1.8, 6 + u[1] * 1 + u[0] * 1.8]), 'the seat stands above the arm\'s top edge, beside the flare');
  assert.ok(!oblique.findings.some((x) => x.level === 'fail' && x.code === 'lamina.free'), 'and nothing else is touched');
  // A frame drawn as it is (a flooded one) isn't given seats, only checked: a root whose flare hangs out of it fails
  const bare = await lamina({ ...base, ground: rect(-8, -10, 0.5, 0.4), groundRounded: true, bodies: { arm: rect(20, -5, 30, 5) }, joints: { hinge: { kind: 'curve', params: curve(0), from: 'ground', to: 'arm' } } });
  assert.ok(bare.findings.some((x) => x.code === 'lamina.seat' && x.level === 'fail' && x.end === 'root'), bare.findings.filter((x) => x.code === 'lamina.seat').map((x) => x.text).join('; '));
});

test('room: a frame that fills where a spring bends to fails, though it clears the spring at rest; cleared, it passes', async () => {
  const spring = { points: [[0, 0], [10, 0], [20, 0]], thickness: 1, fillet: 1, into: 0.84, lead: 2, start: 0, end: 0, moves: 'y' };
  const base = { height: 6, gap: 0.3, material: petg, printer: fdm, check: { fe: false, frame: false }, bodies: { tip: rect(20, -3, 26, 3) }, joints: { s: { kind: 'curve', params: spring, from: 'ground', to: 'tip' } }, states: { up: { s: 3 } }, sequence: ['rest', 'up', 'rest'] };
  const wall = rect(-8, -10, 0.5, 10);
  const blocked = await lamina({ ...base, ground: [wall, rect(8, 1.1, 12, 4)] }); // (clear of the spring at rest by 0.6 mm; in its way bent up)
  const r = blocked.findings.filter((x) => x.code === 'lamina.room');
  assert.ok(r.some((x) => x.level === 'fail' && x.part === 's'), r.map((x) => x.text).join('; ') || 'no room finding');
  const clear = await lamina({ ...base, ground: wall });
  const c = clear.findings.filter((x) => x.code === 'lamina.room');
  assert.ok(c.length === 1 && c[0].level === 'pass', c.map((x) => x.text).join('; '));
});

test('a pin printed in place: a pawl turns on it, sprung by a curve, the pin carrying the load; a floor joins the post to its body and a cap holds the pawl down', async () => {
  const spring = { points: [[0, 0], [10, 2], [20, 0]], thickness: 0.9, fillet: 1, into: 0.84, lead: 2, start: 0, end: 0, moves: 'y' };
  const base = { height: 8, gap: 0.3, material: petg, printer: { ...fdm, fit: 0.3 }, check: { fe: false, frame: false }, ground: [rect(-8, -10, 0.5, 10), rect(-8, -22, 60, -9)], bodies: { pawl: rect(20, -4, 46, 4) }, grips: { b: [46, 0] }, states: { up: { b: 4 } }, sequence: ['rest', 'up', 'rest'] };
  const pin = { d: 3, at: [32, 0], under: rect(30, -9.5, 34, 0) };
  const r = await lamina({ ...base, joints: { b: { kind: 'curve', params: spring, from: 'ground', to: 'pawl', pin } } });
  const pins = r.findings.filter((x) => x.code === 'lamina.pin');
  assert.ok(pins.length === 2 && pins.every((x) => x.level === 'pass'), pins.map((x) => x.text).join('; '));
  // Turned 4° about the pin: the spring's end, 12 mm from it, rises 0.84 mm; the hand at 14 mm needs a few newtons, not
  // what dragging the pin across the frame would take
  const force = r.findings.find((x) => x.code === 'lamina.force');
  assert.ok(force && /takes up to ([\d.]+) N/.test(force.text) && +force.text.match(/takes up to ([\d.]+) N/)[1] < 10, force?.text);
  assert.ok(r.findings.some((x) => x.code === 'lamina.beams' && x.level === 'pass'), r.findings.filter((x) => x.code === 'lamina.beams').map((x) => x.text).join('; '));
  // Across the plane the cap and the floor hold it within their lift and the pin's play
  const across = r.findings.find((x) => x.code === 'lamina.across' && x.body === 'pawl');
  assert.ok(across.most < 0.5, across.text);
  // In 3D: the post stands the full height, capped; without a floor it isn't joined to anything
  const bb = measureBoundingBox(r.parts.body);
  assert.ok(Math.abs(bb[1][2] - 8) < 1e-6, `top ${bb[1][2]}`);
  const loose = await lamina({ ...base, joints: { b: { kind: 'curve', params: spring, from: 'ground', to: 'pawl', pin: { d: 3, at: [32, 0] } } } });
  assert.ok(loose.findings.some((x) => x.code === 'lamina.pin' && x.level === 'fail'));
});

test('a hand holding a part where a catch takes it lets go: the catch carries the spring\'s load, not the hand, though the part doesn\'t move', async () => {
  const m = await catapult({ set: true });
  const last = m.frames.filter((fr) => fr.forces && fr.from === 'set' && fr.to === 'cocked').at(-1);
  assert.ok(last, 'physics frames from set to cocked');
  const F = (kind, on, by) => last.forces.filter((x) => x.kind === kind && x.on === on && x.by === by).reduce((a, x) => a + Math.hypot(...x.force), 0);
  const hook = F('contact', 'pusher', 'hook'), spring = F('spring', 'ground', 'spring');
  assert.ok(spring > 0.5 && Math.abs(hook / spring - 1) < 0.1, `the hook takes ${hook.toFixed(2)} N, the spring pulls ${spring.toFixed(2)} N: nothing else holds it`);
  assert.deepEqual(fails(m, 'lamina.force'), []);
});

test('a strap from a moving body: over and under another, to a post of its own in a slot there, a clevis; what passes it is cut back, and it joins its body to its post', async () => {
  const spring = { points: [[0, 0], [10, 0], [20, 0]], thickness: 1, fillet: 1, into: 0.84, lead: 2, start: 0, end: 0, moves: 'y' };
  // A tab on a spring, rising 3 mm; a slotted bar beside it on its own spring; the tab's post rides in the bar's slot
  const disc = (c, r) => jscad.primitives.circle({ radius: r, center: c, segments: 32 });
  const r = await lamina({ height: 8, gap: 0.3, material: petg, printer: { ...fdm, bridge: 10 }, check: { fe: false, frame: false },
    ground: [rect(-8, -20, 0.5, 20)],
    bodies: { tab: [rect(20, -3, 26, 3), disc([34, 0], 1.5)], bar: jscad.booleans.subtract(rect(30, -3, 40, 3.5 + 30), rect(32.5, -2, 35.5, 5)) },
    joints: { s: { kind: 'curve', params: spring, from: 'ground', to: 'tab' } , t: { kind: 'curve', params: { ...spring, points: [[0, 12], [10, 12], [20, 12]] }, from: 'ground', to: 'bar' } },
    bridges: [{ body: 'tab', shape: rect(22, -1, 35, 1) }, { body: 'tab', shape: rect(22, -1, 35, 1), side: 'bottom' }],
    states: { up: { s: 2 } }, sequence: ['rest', 'up', 'rest'] });
  const br = r.findings.filter((x) => x.code === 'lamina.bridge');
  assert.ok(br.length >= 4 && br.every((x) => x.level === 'pass'), br.map((x) => `${x.level} ${x.text}`).join('; '));
  assert.ok(br.some((x) => /tab's upper strap stands on tab on both sides/.test(x.text)) && br.some((x) => /bar passes over it/.test(x.text)), br.map((x) => x.text).join('; '));
  // In 3D, through the upper strap's layers: the strap and the bar either side of it are apart, by the gap round it
  const polys = jscad.geometries.geom3.toPolygons(r.parts.body), z = 8 - 0.4, near = [];
  for (const q of polys) { const zs = q.vertices.map((v) => v[2]); if (Math.min(...zs) < z && Math.max(...zs) > z && Math.max(...zs) - Math.min(...zs) > 0.5) for (const v of q.vertices) if (v[0] > 21 && v[0] < 36 && Math.abs(v[1]) < 3.5) near.push(Math.abs(v[1])); }
  const edges = [...new Set(near.map((y) => +y.toFixed(2)))].sort((a, b) => a - b);
  assert.ok(edges.some((y) => Math.abs(y - 1) < 0.03) && edges.some((y) => Math.abs(y - 1.6) < 0.03), `walls at |y| ${edges.join(', ')}: the strap's side at 1, the bar's cut back a gap from it, at 1.6`);
});

// ---------- from the library review ----------
import { curvePath } from '@rulecad/flexures';

test('the beam solver balances a small load on a fine mesh (its tolerance follows the forces at work, not only the mesh)', () => {
  const E = 2680, w = 8, t = 1, L = 40, I = (w * t ** 3) / 12, P = 0.1;
  for (const segments of [16, 64, 200]) {
    const sys = beamSystem({ bodies: { g: { at: [0, 0], fixed: true }, tip: { at: [L, 0] } }, segments, beams: [{ name: 'b', path: [[0, 0], [L, 0]], thickness: t, width: w, E, from: 'g', to: 'tip' }] });
    const dof = sys.body.tip.dof, r = equilibrium(sys, { loads: new Map([[dof + 1, P]]) });
    assert.ok(r.converged && r.iterations > 0, `${segments} segments: ${r.iterations} iterations`);
    assert.ok(Math.abs(r.q[dof + 1] / ((P * L ** 3) / (3 * E * I)) - 1) < 0.01, `${segments} segments: the tip moves ${r.q[dof + 1].toFixed(4)} mm, theory ${((P * L ** 3) / (3 * E * I)).toFixed(4)}`);
  }
});

test('every hinge answers travel(strain) as well as angle(strain), so a hinge in a lamina or a report is checked, not a crash', async () => {
  for (const [model, p] of [[notchHingeModel, { radius: 3, neck: 0.84, width: 8 }], [livingHingeModel, { flex: 2, thickness: 0.84, width: 8 }], [cartwheelModel, { spoke: 10, thickness: 0.84, width: 8 }]]) {
    const m = model(p, pla);
    assert.equal(m.travel(0.01), m.angle(0.01));
  }
  const r = report([{ name: 'hinge', kind: 'notchHinge', params: { radius: 3, neck: 0.84, width: 8 }, angle: 0.05, stop: 0.1 }], { line: 0.42, layer: 0.2 }, pla);
  assert.ok(r.findings.some((x) => x.code === 'flexure.stop'), JSON.stringify(r.findings));
  assert.equal(report([{ name: 'odd', kind: 'no-such-kind', params: {} }], { line: 0.42, layer: 0.2 }, pla).findings[0].code, 'flexure.kind');
  const rect = (x0, y0, x1, y1) => jscad.primitives.polygon({ points: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] });
  const made = await lamina({ height: 6, gap: 0.3, material: { E: 2680, strainLimit: 0.012 }, physics: false, ground: rect(-20, -5, -9.5, 5), bodies: { arm: rect(11.5, -3, 30, 3) },
    joints: { h: { kind: 'livingHinge', params: { flex: 2, thickness: 0.84 }, at: [0, 0], from: 'ground', to: 'arm' } }, states: { bent: { h: 10 } }, sequence: ['rest', 'bent'] });
  assert.ok(made.findings.some((x) => x.code === 'lamina.strain'), made.findings.map((x) => x.code).join(', '));
});

test('a curve whose points repeat, or aren\'t numbers, is refused by name (it drew NaN)', () => {
  assert.throws(() => curvePath({ points: [[0, 0], [10, 0], [10, 0], [20, 0]], thickness: 1 }), /points 2 and 3 are the same place/);
  assert.throws(() => curvePath({ points: [[0, 0], [10, NaN]], thickness: 1 }), /point 2 isn't a place/);
  assert.ok(curvePath({ points: [[0, 0], [10, 2], [20, 0]], thickness: 1 }).path.every((q) => q.every(Number.isFinite)));
});

test('a placed module takes its curve and its pin with it; the README\'s first numbers are the code\'s', async () => {
  const { place } = await import('@rulecad/flexures');
  const placed = place({ joints: { a: { kind: 'curve', params: { points: [[0, 0], [10, 2], [20, 0]], thickness: 0.84 }, pin: { d: 3, at: [5, 5] }, from: 'ground', to: 'arm' } } }, { name: 'm', at: [100, 0], angle: 90 });
  const j = placed.joints['m.a'];
  assert.deepEqual(j.at.map((x) => Math.round(x * 1e6) / 1e6), [100, 0], 'moved, though it gave no place of its own');
  assert.equal(j.angle, 90);
  assert.deepEqual(j.pin.at.map((x) => Math.round(x * 1e6) / 1e6), [95, 5], 'its pin turned and moved with it');
  const readme = (await import('node:fs')).readFileSync(new URL('./README.md', import.meta.url), 'utf8');
  const m = leafModel({ length: 40, thickness: 1.26, width: 8 }, { E: 2680, strainLimit: 0.02 });
  assert.ok(readme.includes(`m.stiffness;        // ${m.stiffness.toFixed(2)} N/mm`), `the README's leaf stiffness should read ${m.stiffness.toFixed(2)}`);
  const e = elastica({ length: 40, thickness: 0.84, width: 8 }, { E: 2680 }, { travel: 20 });
  assert.ok(readme.includes(`force: ${e.force.toFixed(2)}, travel: 20, shortening: ${e.shortening.toFixed(1)}, angle: ${e.angle.toFixed(2)}, strain: ${e.strain.toFixed(3)}, stiffness: ${e.stiffness.toFixed(3)}`), 'the README\'s elastica example');
});

test('the frame\'s straps: from the frame to a post of its own in a slot in what slides, over it and under it; the slider is cut back a gap round each, its ceiling over the lower slanted, and held in the plane', async () => {
  const spring = { points: [[0, 0], [10, 0], [20, 0]], thickness: 1, fillet: 1, into: 0.84, lead: 2, start: 0, end: 0, moves: 'x' };
  const disc = (c, r) => jscad.primitives.circle({ radius: r, center: c, segments: 32 });
  // A bar on a spring slides 6 mm along x; a post of the frame stands in a slot up the bar, hung between two straps
  // from a block of frame beyond the bar's end
  const bar = jscad.booleans.subtract(rect(20, -4, 50, 4), rect(34, -2, 46, 2));
  const strap = rect(44, -1.5, 58, 1.5); // (the bar moves away from the block: the post is at the slot's front end at rest, at its back end moved out)
  const r = await lamina({ height: 8, gap: 0.3, material: petg, printer: { ...fdm, bridge: 10 }, check: { fe: false, frame: false }, physics: false,
    ground: [rect(-8, -20, 0.5, 20), disc([44, 0], 1.5), rect(57, -6, 62, 6)],
    bodies: { bar }, joints: { s: { kind: 'curve', params: spring, from: 'ground', to: 'bar' } },
    bridges: [{ strap: true, shape: strap }, { strap: true, shape: strap, side: 'bottom' }],
    states: { out: { s: 6 } }, sequence: ['rest', 'out', 'rest'] });
  const br = r.findings.filter((x) => x.code === 'lamina.bridge');
  assert.ok(br.length >= 5 && br.every((x) => x.level === 'pass'), br.map((x) => `${x.level} ${x.text}`).join('; '));
  for (const said of [/the frame's upper strap stands on the frame on both sides/, /the frame's lower strap stands on the frame on both sides/, /the frame's upper strap: bar passes under it, cut down to/, /the frame's lower strap: bar passes over it, cut up to 1\.80 mm there, its ceiling slanting in at 45° from the walls to 3\.80 mm/]) assert.ok(br.some((x) => said.test(x.text)), `${said}: ${br.map((x) => x.text).join('; ')}`);
  // In 3D, up through the bar where the straps cross it: strap, a gap, the bar, a gap, strap (not an arch over a
  // floor along the travel). Over the lower strap the bar's ceiling slants in from the pocket's walls at 45° (the
  // pocket is 4.2 mm wide: a roof 2 mm tall on its middle line), so it prints without a flat ledge in the air
  const tris = jscad.geometries.geom3.toPolygons(r.parts.body).flatMap((q) => q.vertices.slice(2).map((v, i) => [q.vertices[0], q.vertices[i + 1], v]));
  const inside = ([x, y, z]) => { let n = 0; for (const [a, b, c] of tris) { const d = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]); if (Math.abs(d) < 1e-12) continue; const u = ((x - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (y - a[1])) / d, w = ((b[0] - a[0]) * (y - a[1]) - (x - a[0]) * (b[1] - a[1])) / d; if (u < 0 || w < 0 || u + w > 1) continue; if (a[2] + u * (b[2] - a[2]) + w * (c[2] - a[2]) > z) n++; } return n % 2 === 1; };
  const up = (x, y) => Array.from({ length: 16 }, (_, k) => (inside([x + 0.013, y + 0.017, 0.25 + k * 0.5]) ? '#' : '.')).join('');
  assert.equal(up(48, 0), '##......####..##', 'beyond the slot, on the straps\' line: strap 1.2, gap 0.6, the roof\'s ridge at 3.8, the bar, gap 0.6, strap 1.2');
  assert.equal(up(48, 2), '....########....', 'at the pocket\'s wall the bar begins at 2.0, the gap and the roof\'s first layer, and ends under the upper pocket');
  const roofAt = (y) => { for (let z = 1.8; z < 4; z += 0.1) if (inside([48.013, y + 0.017, z + 0.05])) return +z.toFixed(1); };
  assert.ok(roofAt(1.5) >= 2.2 && roofAt(1.5) <= 2.6 && roofAt(1) >= 2.8 && roofAt(1) <= 3.2, `the roof rises at 45° from the wall: ${roofAt(1.5)} mm at 0.6 in, ${roofAt(1)} mm at 1.1 in`);
  assert.equal(up(48, 3), '################', 'beside the straps, the bar stands on the bed, whole');
  assert.equal(up(44, 0), '################', 'the post, from the bed to the top');
  assert.ok(!r.findings.some((x) => x.level === 'fail' && /runs into/.test(x.text)), r.findings.filter((x) => /runs into/.test(x.text)).map((x) => x.text).join('; '));
});

import { laminaCache } from '@rulecad/flexures';
test('a lamina\'s slow stages are kept in the store it is given, keyed by their inputs and the salt: the second build reads them back and finds the same, a new salt or a change in what they are made from misses', async () => {
  const spring = { points: [[0, 0], [10, 0], [20, 0]], thickness: 1, fillet: 1, into: 0.84, lead: 2, start: 0, end: 0, moves: 'x' };
  const bar = rect(20, -4, 50, 4);
  const spec = (height) => ({ height, gap: 0.3, material: petg, printer: fdm, check: { fe: false, frame: false }, ground: [rect(-8, -6, 0.5, 6)], bodies: { bar }, joints: { s: { kind: 'curve', params: spring, from: 'ground', to: 'bar' } }, states: { out: { s: 6 } }, sequence: ['rest', 'out', 'rest'], flood: { outline: rect(-8, -12, 68, 12) } });
  const files = new Map(), log = [], store = (salt) => ({ salt, get: (k) => { log.push(files.has(k) ? `hit ${k.split('-')[0]}` : `miss ${k.split('-')[0]}`); return files.get(k); }, put: (k, text) => { files.set(k, text); } });
  const strip = (r) => ({ findings: r.findings.map((x) => [x.level, x.text]), energy: r.energy, frames: r.frames.length, ground: r.outlines('rest').ground });
  try {
    laminaCache(store('a'));
    const first = strip(await lamina(spec(8)));
    assert.deepEqual(log.filter((x) => x.startsWith('hit')), [], 'a cold store: every stage computed');
    assert.ok(log.includes('miss flood probe') && log.includes('miss physics') && log.includes('miss kinematics'), log.join('; '));
    assert.ok([...files.values()].every((t) => typeof t === 'string' && JSON.parse(t)), 'what is kept is JSON');
    log.length = 0;
    const again = strip(await lamina(spec(8)));
    assert.deepEqual(again, first, 'the same from the store as computed');
    assert.ok(log.includes('hit flood probe') && log.includes('hit physics') && log.includes('hit kinematics') && !log.some((x) => x.startsWith('miss')), `all hits: ${log.join('; ')}`);
    // The frame's finite elements too, when they're on (the sequence's findings are the same read back as made)
    log.length = 0;
    const withFrame = { ...spec(8), check: { fe: false, frame: true } }, made = strip(await lamina(withFrame));
    assert.ok(log.includes('miss frame'), log.join('; ')); log.length = 0;
    assert.deepEqual(strip(await lamina(withFrame)), made);
    assert.ok(log.includes('hit frame') && log.includes('hit kinematics'), log.join('; '));
    log.length = 0;
    await lamina(spec(9)); // taller: the physics and the probe are made from the height
    assert.ok(!log.some((x) => x.startsWith('hit')), `another height misses: ${log.join('; ')}`);
    laminaCache(store('b')); log.length = 0;
    await lamina(spec(8));
    assert.ok(!log.some((x) => x.startsWith('hit')), `another salt (the library changed) misses: ${log.join('; ')}`);
  } finally { laminaCache(null); }
});

test('a flooded frame keeps a post: a pin of the frame\'s in a slot in what slides is an island in the plane, kept for its straps to join, and the rest is flooded as if it weren\'t there', async () => {
  const spring = { points: [[0, 0], [10, 0], [20, 0]], thickness: 1, fillet: 1, into: 0.84, lead: 2, start: 0, end: 0, moves: 'x' };
  const disc = (c, r) => jscad.primitives.circle({ radius: r, center: c, segments: 32 });
  const bar = jscad.booleans.subtract(rect(20, -4, 50, 4), rect(34, -2, 43.6, 2)), strap = rect(41.8, -1.5, 62, 1.5); // the slot: the 6 mm travel, the 3 mm pin and a gap at each end
  const base = { height: 8, gap: 0.3, material: petg, printer: { ...fdm, bridge: 10 }, check: { fe: false, frame: false }, physics: false,
    ground: [rect(-8, -6, 0.5, 6)], bodies: { bar }, joints: { s: { kind: 'curve', params: spring, from: 'ground', to: 'bar' } }, states: { out: { s: 6 } }, sequence: ['rest', 'out', 'rest'] };
  const area = (loops) => loops.reduce((s, l) => s + l.reduce((a, p, i) => { const q = l[(i + 1) % l.length]; return a + (p[0] * q[1] - q[0] * p[1]) / 2; }, 0), 0);
  const plain = await lamina({ ...base, flood: { outline: rect(-8, -12, 68, 12) } });
  const posted = await lamina({ ...base, flood: { outline: rect(-8, -12, 68, 12), posts: [disc([41.8, 0], 1.5)] }, bridges: [{ strap: true, shape: strap }, { strap: true, shape: strap, side: 'bottom' }] });
  const more = area(posted.outlines('rest').ground) - area(plain.outlines('rest').ground);
  assert.ok(more > 5 && more < 9, `the post adds its own ${(Math.PI * 1.5 ** 2).toFixed(1)} mm² or so to the frame and takes nothing from it (${more.toFixed(1)} mm² more)`);
  const br = posted.findings.filter((x) => x.code === 'lamina.bridge');
  assert.ok(br.length >= 5 && br.every((x) => x.level === 'pass'), br.map((x) => `${x.level} ${x.text}`).join('; '));
  assert.ok(!posted.findings.some((x) => x.level === 'fail' && /lamina\.(free|collide|sequence)/.test(x.code)), posted.findings.filter((x) => x.level === 'fail').map((x) => x.text).join('; '));
});

test('lamina findings say where as everywhere in the kit: at a point, box a box, between the two places something comes near itself', async () => {
  const spring = { points: [[0, 0], [10, 0], [20, 0]], thickness: 1, fillet: 1, into: 0.84, lead: 2, start: 0, end: 0, moves: 'x' };
  // a bar pushed into a block of the frame: a collision, said with where
  const r = await lamina({ height: 6, gap: 0.3, material: petg, printer: fdm, check: { fe: false, frame: false }, physics: false,
    ground: [rect(-8, -6, 0.5, 6), rect(52, -6, 56, 6)], bodies: { bar: rect(20, -4, 50, 4) }, joints: { s: { kind: 'curve', params: spring, from: 'ground', to: 'bar' } },
    states: { out: { s: 6 } }, sequence: ['rest', 'out', 'rest'] });
  const placed = r.findings.filter((x) => x.at !== undefined);
  assert.ok(placed.length, r.findings.map((x) => x.text).join('; '));
  for (const x of placed) {
    assert.ok(Array.isArray(x.at) && x.at.every((v) => typeof v === 'number'), `${x.text}: at ${JSON.stringify(x.at)}`);
    if (x.box) assert.ok(x.box.lo && x.box.hi, x.text);
  }
});

test('curveClearance: a mirrored pair is tested arm against arm, so an arm crossing its own mirror line is caught', async () => {
  const { curveClearance } = await import('@rulecad/flexures');
  const arm = (dip) => ({ points: [[0, 5], [10, dip], [20, 5]], thickness: 1, mirror: 0, start: 0, end: 0 });
  const clear = curveClearance(arm(4)), crossed = curveClearance(arm(-2));
  assert.ok(!clear || clear.clear > 1, `arms 8 mm apart at their nearest: ${JSON.stringify(clear)}`);
  assert.ok(crossed && crossed.mirror && crossed.clear < 0, `an arm dipping past y = 0 meets its twin: ${JSON.stringify(crossed)}`);
});

test('models, sizers and lamina states refuse what isn\'t a size or a number, by name', async () => {
  const { size, lamina } = await import('@rulecad/flexures');
  assert.throws(() => leafModel({ length: 0, thickness: 1, width: 5 }, pla), /leafModel: length is a size above 0 \(got 0\)/);
  assert.throws(() => leafModel({ length: -10, thickness: 1, width: 5 }, pla), /length is a size above 0/);
  assert.throws(() => leafModel({ length: 10, thickness: 1, width: 5 }, { E: 0 }), /modulus E above 0/);
  assert.throws(() => size.leaf({ travel: 5, force: 0, width: 5, material: pla }, fdm), /size\.leaf: force is a size above 0/);
  assert.throws(() => notchHingeModel({ radius: 2, neck: NaN, width: 5 }, pla), /neck is a size above 0 \(got null\)/);
  await assert.rejects(lamina({ height: 6, gap: 0.3, material: pla, ground: [rect(-5, -5, 0, 5)], bodies: { tip: rect(20, -2, 24, 2) }, joints: { leaf: { kind: 'leaf', params: { length: 20, thickness: 0.84 }, from: 'ground', to: 'tip' } }, states: { bent: { leaf: NaN } }, sequence: ['rest', 'bent'] }), /state bent: leaf is null, not a number/);
});

test('a constant-force slider in a lamina: its force along x from the linkage, not its leaf\'s torsional stiffness times millimetres', async () => {
  const p = { leaf: 30, thickness: 0.84, width: 6 }, m = constantForceModel(p, pla);
  assert.ok(m.torsional && typeof m.energy === 'function');
  const s = m.stroke / 2, numeric = (m.energy(s + 1e-3) - m.energy(s - 1e-3)) / 2e-3;
  assert.ok(Math.abs(numeric - m.force(s)) < 1e-3 * Math.max(1, m.force(s)), `energy's slope is the force: ${numeric} against ${m.force(s)}`);
  assert.ok(Math.abs(m.stiffness * s - m.force(s)) > 10 * m.force(s), 'K × travel would be wrong by an order or more');
});

test('curvedLeaf is drawn in the frame the others are: its root at the origin, its chord along x, as tall as it is wide', () => {
  const g = curvedLeaf({ length: 30, thickness: 0.84, width: 6, rise: 2 }), [lo, hi] = jscad.measurements.measureBoundingBox(g);
  assert.ok(Math.abs(lo[0]) < 0.5 && Math.abs(hi[0] - 30) < 0.5, `along x from 0 to 30: ${lo[0]} to ${hi[0]}`);
  assert.ok(Math.abs(hi[1] - 0.42) < 0.05 && Math.abs(lo[1] - (-2 - 0.42)) < 0.05, `the chord on y = 0, bowing 2 mm to -y: ${lo[1]} to ${hi[1]}`);
  assert.ok(Math.abs(lo[2]) < 1e-9 && Math.abs(hi[2] - 6) < 1e-9, 'z from 0 to its width');
});

test('snapPin builds with the booleans it is given: on Manifold, a pin Manifold reads as a closed solid', async () => {
  const { ops } = await import('@rulecad/shapes');
  const m = await ops('manifold'), pin = snapPin({ diameter: 2.5, length: 4, lip: 0.3, back: 90 }, m);
  const before = m.stats.fallbacks;
  m.union(pin, jscad.primitives.cuboid({ size: [10, 10, 2], center: [0, 0, -1] }));
  assert.equal(m.stats.fallbacks, before, 'unions with no fall back to JSCAD');
  assert.ok(Math.abs(jscad.measurements.measureVolume(pin) - jscad.measurements.measureVolume(snapPin({ diameter: 2.5, length: 4, lip: 0.3, back: 90 }))) < 0.5, 'the same pin either way');
});

test('snap pins live in @rulecad/fixings: flexures re-exports the very functions, so a pin it drew before is drawn the same', async () => {
  const fixings = await import('@rulecad/fixings'), fs = await import('node:fs');
  assert.equal(snapPin, fixings.snapPin); assert.equal(snapSocket, fixings.snapSocket); assert.equal(snapPinModel, fixings.snapPinModel);
  const pkg = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
  assert.ok(pkg.dependencies['@rulecad/fixings'], 'flexures depends on fixings');
  assert.ok(!JSON.parse(fs.readFileSync(new URL('../fixings/package.json', import.meta.url), 'utf8')).dependencies['@rulecad/flexures'], 'and never the other way');
});

// ---------- gripper jaws (#77) ----------
// A gripper like the arm's (examples/bench arm/jaws, whose leaves are 37 mm with rounds): an SG90's double horn (18 mm
// to the middle of a tip of 2.25), the bars' inner faces 14 mm out, the horn opening to 65°, PETG, leaves 39 x 0.84 x
// 16 (square-ended here, so the guide is the textbook one), 14 apart.
const jawsP = { width: 16, leaf: { length: 39, thickness: 0.84, apart: 14, fillet: 0 }, bar: { inner: 14, width: 5 }, horn: { reach: 18, open: 65 }, jaws: { from: 20, to: 30, gap: 1 } };
const petgJ = { E: 1810, strainLimit: 34 / 1810 / 1.5, density: 1.27, name: 'PETG' };
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} against ${b} (within ${tol})`);

test('gripper jaws: the horn\'s stroke and push, the springs, the grip and what it holds, worked by hand', async () => {
  const { gripperJawsModel } = await import('@rulecad/flexures');
  const m = gripperJawsModel(jawsP, petgJ, { torque: 0.1765, payload: 0.05, accel: 300 });
  // At rest the tip's top touches the bar: 18 sin a + 2.25 = 14, a = asin(11.75 / 18) = 40.751°. Fully open, 65°: the
  // tip's top is at 18 sin 65° + 2.25 = 16.3135 + 2.25, so each bar has moved 18 × 0.906308 - 11.75 = 4.5635 mm.
  near(m.rest, 40.7514, 1e-3, 'rest angle'); near(m.stroke, 4.56354, 1e-4, 'stroke');
  // The push: 60% of 0.1765 N m is 105.9 N mm, half on each arm, over the lever 18 cos a across the push:
  // at rest 105.9 / (2 × 18 × 0.757549) = 3.8831 N; open, 105.9 / (2 × 18 × 0.422618) = 6.9606 N
  near(m.push(m.rest), 3.8831, 1e-3, 'push at rest'); near(m.push(65), 6.9606, 1e-3, 'push open');
  // Each guide: two fixed-guided leaves, 2 E w t³ / L³ = 2 × 1810 × 16 × 0.592704 / 59319 = 0.57872 N/mm. Fully open
  // it pulls back 0.57872 × 4.5635 = 2.6410 N: the servo pushes 6.9606, 2.64 times
  near(m.spring / m.stroke, 0.57872, 1e-4, 'the guide'); near(m.findings.find((f) => f.code === 'gripper.servo').values.margin, 2.6356, 1e-3, 'servo margin');
  // The bar, a cantilever from the fork's front (-(18 + 2.25 + 1) = -21.25) to the jaws' middle (25): 46.25 mm,
  // 3 E I / l³ with I = 16 × 5³ / 12 = 166.67: 905000 / 98931.6 = 9.1478 N/mm. In series with the guide: 0.54428
  near(m.bar, 9.1478, 1e-3, 'bar'); near(m.stiffness, 0.54428, 1e-4, 'jaw stiffness');
  // An 8 mm object in a 1 mm gap holds each jaw 3.5 mm open: 0.54428 × 3.5 = 1.905 N
  near(m.grip(8), 1.905, 1e-3, 'grip at 8 mm'); assert.equal(m.grip(0.8), 0, 'narrower than the gap: nothing');
  // 50 g at 300 mm/s² needs 0.05 × (9.80665 + 0.3) = 0.50533 N; held by friction on two jaws, 2 × 0.4 × grip, twice
  // over: grip >= 1.2633 N, an object 1 + 2 × 1.2633 / 0.54428 = 5.642 mm across or more. The widest that goes in:
  // the gap and both strokes, less the print gap each side, 1 + 9.1271 - 0.6 = 9.527
  near(m.need, 0.505333, 1e-5, 'need'); near(m.rated, 5.642, 1e-3, 'narrowest held twice over'); near(m.widest, 9.5271, 1e-3, 'widest');
  const grip = m.findings.find((f) => f.code === 'gripper.grip');
  assert.equal(grip.level, 'pass'); assert.match(grip.text, /holds 50 g \(0\.505 N with the arm's 300 mm\/s²\) 2 times over on objects 5\.64 to 9\.53 mm across/);
  assert.deepEqual(m.findings.map((f) => f.code), ['gripper.drive', 'gripper.servo', 'gripper.grip', 'gripper.holds', 'gripper.stop', 'flexure.strain', 'gripper.mass']);
  assert.ok(m.findings.every((f) => ['pass', 'warn', 'fail'].includes(f.level) && f.text && f.code), 'the kit\'s one shape');
  assert.ok(m.rests.some((r) => /^friction 0\.4/.test(r)) && m.rests.some((r) => /^share 0\.6/.test(r)), 'the defaults it rests on, by name');
  assert.deepEqual(gripperJawsModel(jawsP, petgJ, { torque: 0.1765, friction: 0.8, share: 0.5, payload: 0.05 }).rests.filter((r) => /friction|share/.test(r)), [], 'given, they are not rested on');
});

test('gripper jaws: the model says when the servo cannot open the springs, when the grip drops the load, and when a stop is short or past the limit', async () => {
  const { gripperJawsModel } = await import('@rulecad/flexures');
  const of = (p, o, code) => gripperJawsModel(p, petgJ, { torque: 0.1765, ...o }).findings.find((f) => f.code === code);
  // leaves twice as thick are eight times as stiff: 4.63 N/mm × 4.56 = 21 N against 6.96: it can't open them
  const thick = of({ ...jawsP, leaf: { ...jawsP.leaf, thickness: 1.68, apart: 16 } }, {}, 'gripper.servo');
  assert.equal(thick.level, 'fail'); assert.match(thick.text, /can't open them fully/);
  assert.equal(of(jawsP, { payload: 0.1, accel: 300 }, 'gripper.grip').level, 'warn', '100 g: held, but not twice over on anything that fits');
  assert.equal(of(jawsP, { payload: 0.3 }, 'gripper.grip').level, 'fail', '300 g: dropped');
  assert.equal(of({ ...jawsP, stop: { open: 4 } }, {}, 'gripper.stop').level, 'fail', 'a stop short of the stroke takes the servo\'s push');
  // the horn driven onto a stop far out: past 0.8 of the leaves' limit with the tongue's give, then past the limit
  assert.equal(of({ ...jawsP, horn: { reach: 18, open: 72 } }, {}, 'gripper.stop').level, 'warn');
  assert.equal(of({ ...jawsP, leaf: { ...jawsP.leaf, length: 30 }, horn: { reach: 18, open: 72 } }, {}, 'gripper.stop').level, 'fail');
  const printed = gripperJawsModel(jawsP, petgJ, { torque: 0.1765, printer: { line: 0.42, layer: 0.2, wall_min: 0.84 } }).findings;
  assert.deepEqual(printed.filter((f) => f.code.startsWith('flexure.')).map((f) => [f.code, f.level]), [['flexure.lines', 'pass'], ['flexure.stop', 'pass'], ['flexure.strain', 'pass']], 'the leaves print in whole lines and layers');
});

test('gripper jaws: a stop takes the servo\'s full stall torque, whatever share of it is counted on to open', async () => {
  const { gripperJawsModel } = await import('@rulecad/flexures');
  const stop = (p, o) => gripperJawsModel(p, petgJ, { torque: 0.1765, ...o }).findings.find((f) => f.code === 'gripper.stop');
  // A servo driven on past its target stalls and pushes with all of its torque, so the share counted on to open
  // changes nothing at the stops
  const s = stop(jawsP, {});
  for (const share of [0.3, 1]) assert.deepEqual(stop(jawsP, { share }), s, `share ${share} leaves the stop as it is`);
  assert.match(s.text, /at its full stall torque \(0\.1765 N m\)/);
});

test('gripper jaws: a stalled servo turns its horn on until the stops hold it, or through to its toggle at 90°, the bars bending between', async () => {
  const { gripperJawsModel } = await import('@rulecad/flexures');
  const stop = (p, o) => gripperJawsModel(p, petgJ, { torque: 0.1765, ...o }).findings.find((f) => f.code === 'gripper.stop');
  // The arm's leaves (37 mm with 1 mm rounds, a 2 mm gap, stops 4.8 open and 0.85 closed), the tongue at its default 6.
  // The guide kg 0.73739 N/mm and the tongue kt 25.1708 N/mm are the model's (the tongue an integral over its width).
  // Each bar a cantilever from the fork's front at x -21.25, 3 E I / l^3 with E I = 1810 x 16 x 5^3 / 12 = 301666.7.
  // The stops hold the horn at 73.904°: cos 0.27725, sin 0.96080, so each tip is 18 x 0.96080 - 11.75 = 5.5444 out.
  // The upper tip meets its bar at x 18 x 0.27725 = 4.99, l 26.240: kb 905000 / 18067 = 50.09 N/mm; its jaw goes
  // (50.09 x 5.5444 + 25.1708 x 4.8) / (50.09 + 0.7374 + 25.1708) = 5.2440 mm, F 0.7374 x 5.2440 + 25.1708 x 0.4440 =
  // 15.044 N. The lower tip meets its bar at x -4.99, l 16.260, kb 210.53: its jaw goes (210.53 x 5.5444 + 120.82) /
  // 236.44 = 5.4478 mm, F 4.017 + 25.1708 x 0.6478 = 20.324 N. The torque asked: (15.044 + 20.324) x 18 x 0.27725 =
  // 176.50 N mm, the SG90's stall torque. The lower jaw goes furthest: 5.4478 / 6.6167 = 82%, past travelStop's 0.8.
  // (Kept at the angle where the tip first meets the stop, and with no bar, the push 12.47 N gave 5.15 mm, 78%.)
  // At 90° both bars are 21.25 long, kb 905000 / 9595.7 = 94.31, and a jaw goes (94.31 x 6.25 + 120.82) / 120.22 = 5.9081 mm
  const arm = { ...jawsP, leaf: { ...jawsP.leaf, length: 37, fillet: 1 }, horn: { reach: 18, tip: 2.25, open: 65 }, jaws: { from: 20, to: 30, gap: 2 }, stop: { open: 4.8, close: 0.85 }, base: 6 };
  const six = stop(arm, {});
  near(six.values.tongue, 25.1708, 1e-3, 'the tongue'); near(six.values.angle, 73.904, 0.01, 'held at'); near(six.values.tip, 5.5444, 1e-3, 'the tip');
  near(six.values.most, 5.4478, 1e-3, 'the lower jaw'); near(six.values.onStop, 25.1708 * (5.4478 - 4.8), 0.01, 'its tongue\'s load'); near(six.values.toggle, 5.9081, 1e-3, 'at the toggle');
  assert.ok(six.values.held && six.values.resists > 1 && six.values.resists < 1.1, 'it stalls, but only just: 1.05 times');
  assert.equal(six.level, 'warn'); assert.match(six.text, /turns to 73\.9°, where the stops hold it .* its jaw goes to 5\.45 mm.*: 82% of the leaves' limit of 6\.62 mm, past the 0\.8 travelStop allows; but they hold it under 2 times, and a servo that drove through to 90° would take a jaw to 5\.91 mm, 89%/);
  // the tongue at 8 (57.6 N/mm): held at 76%, inside 0.8, but the stops resist only 1.75 times the stall torque, and
  // driven through a jaw would reach 86%: a warning; asked for 1.5 times, it passes
  const eight = { ...arm, stop: { ...arm.stop, tongue: 8 } };
  assert.equal(stop(eight, {}).level, 'warn'); assert.ok(stop(eight, {}).values.most < 0.8 * six.values.limit);
  assert.equal(stop(eight, { margin: 1.5 }).level, 'pass');
  // the tongue at 10 (83.69 N/mm): held at 68.974°, cos 0.35879, sin 0.93342, tip 5.0515; upper l 27.708, kb 42.54,
  // jaw 4.8564, F 8.301; lower l 14.792, kb 279.64, jaw (279.64 x 5.0515 + 83.6934 x 4.8) / 364.07 = 4.9835, F 19.029;
  // (8.301 + 19.029) x 18 x 0.35879 = 176.50 N mm. 4.9835 / 6.6167 = 75%, and the stops resist 2.16 times
  const ten = stop({ ...arm, stop: { ...arm.stop, tongue: 10 } }, {});
  near(ten.values.angle, 68.974, 0.01, 'held at'); near(ten.values.most, 4.9835, 1e-3, 'the lower jaw');
  assert.equal(ten.level, 'pass'); assert.ok(ten.values.resists >= 2, `resists ${ten.values.resists}`);
  // leaves too soft for the stops to hold the servo: it drives through to 90°, a jaw at 5.96 mm; on 40 mm leaves
  // (a limit of 7.75 mm) that is still inside 0.8, so it passes whatever the servo
  const through = stop({ ...arm, leaf: { ...arm.leaf, length: 40 } }, {});
  assert.equal(through.values.held, false); assert.equal(through.level, 'pass'); near(through.values.most, through.values.toggle, 1e-9, 'the toggle');
  assert.match(through.text, /drives through to 90°, its toggle: the stops resist at most 0\.87 times that .*the tip goes 6\.25 mm out and a jaw to 5\.96 mm/);
});

test('gripper jaws: bad input is refused by name, before any sums', async () => {
  const { gripperJaws, gripperJawsModel } = await import('@rulecad/flexures');
  const bad = (p, re) => { assert.throws(() => gripperJaws(p), re); assert.throws(() => gripperJawsModel(p, petgJ, { torque: 0.1765 }), re); };
  bad({ ...jawsP, leaf: undefined }, /leaf is an object/);
  bad({ ...jawsP, width: 0 }, /width is a size above 0/);
  bad({ ...jawsP, horn: { reach: 18, open: 30 } }, /horn\.open is the arm's angle with the jaws open, between its rest angle 40\.8°/);
  bad({ ...jawsP, horn: { reach: 10, open: 80 } }, /doesn't get its tip to the bar at 14: a reach over 11\.75 mm/);
  bad({ ...jawsP, jaws: { from: 12, to: 30, gap: 1 } }, /the jaws start at x 12, in the horn's sweep/);
  bad({ ...jawsP, jaws: { from: 20, to: 30, gap: 0.1 } }, /under the print gap 0\.3: the jaws would print fused/);
  bad({ ...jawsP, leaf: { ...jawsP.leaf, apart: 8 } }, /leaf\.apart 8 leaves no room for the stop's tongue/);
  bad({ ...jawsP, bar: { inner: 6, width: 5 }, horn: { reach: 18, open: 25 }, jaws: { from: 22, to: 30, gap: 1 } }, /the two guides meet in the middle/);
  bad({ ...jawsP, guide: { end: -10 } }, /guide\.end -10 is in the horn's sweep/);
  assert.throws(() => gripperJaws(jawsP, { part: 'finger' }), /part is all, ground, upper or lower/);
  assert.throws(() => gripperJawsModel(jawsP, petgJ), /give the servo \{ torque \}/);
  assert.throws(() => gripperJawsModel(jawsP, { E: 1810 }, { torque: 0.1765 }), /needs a strainLimit/);
  for (const [o, re] of [[{ torque: 0 }, /torque is the servo's stall torque/], [{ torque: 0.1765, share: 1.5 }, /share is the part/], [{ torque: 0.1765, friction: 0 }, /friction is the friction/], [{ torque: 0.1765, payload: -1 }, /payload is the object's mass/], [{ torque: 0.1765, margin: 0.5 }, /margin is the margin asked, 1 or more/]]) assert.throws(() => gripperJawsModel(jawsP, petgJ, o), re);
});

test('gripper jaws: drawn flat at rest, the stops stop where the model says, the leaves bent to the stops clear the tongue, and every inside corner of a jaw is rounded', async () => {
  const { gripperJaws, gripperJawsModel } = await import('@rulecad/flexures');
  const { ready, flat, intersect, area, moved, shift } = await import('./plane.mjs');
  await ready();
  const p = { ...jawsP, leaf: { ...jawsP.leaf, fillet: 1 } }, m = gripperJawsModel(p, petgJ, { torque: 0.1765 });
  const all = gripperJaws(p), box = measureBoundingBox(all);
  near(box[1][2], 16, 1e-6, 'as tall as the leaves are wide'); near(box[0][2], 0, 1e-6, 'on the bed');
  near(box[1][0], 30, 1e-3, 'the jaws end at jaws.to'); near(box[0][0], m.at.back, 1e-3, 'the root blocks are the back');
  near(measureBoundingBox(gripperJaws(p, { part: 'upper' }))[0][1], 0.5, 1e-3, 'the upper jaw\'s face at half the gap');
  near(measureVolume(all), measureVolume(gripperJaws(p, { part: 'ground' })) + 2 * measureVolume(gripperJaws(p, { part: 'upper' })), 200, 'the three pieces make the whole (the leaves run 1 mm into the roots)');
  assert.equal(pieces(jscad.geometries.geom3.toPolygons(all).map((q) => q.vertices)).pieces.length, 2, 'two halves, each a jaw on its root, until a palm joins the roots');
  // the fork against the ground, moved as the guide moves it (out d, back 3d²/5L), away from the leaves' ends
  const ground = flat(gripperJaws(p, { part: 'ground' })), fork = intersect(flat(gripperJaws(p, { part: 'upper' })), [[[m.at.fork[0] + 1.05, 0], [m.at.fork[1], 0], [m.at.fork[1], 40], [m.at.fork[0] + 1.05, 40]]]);
  const hit = (d) => area(intersect(ground, moved(shift([-(3 * d * d) / (5 * p.leaf.length), d]), fork)));
  assert.equal(hit(m.stop.open - 0.05), 0, 'open to just short of the stop: free'); assert.ok(hit(m.stop.open + 0.1) > 0.01, 'just past it: the slot meets the pin');
  assert.equal(hit(-(m.stop.close - 0.05)), 0, 'closed to just short of the stop: free'); assert.ok(hit(-(m.stop.close + 0.1)) > 0.01, 'past it: the pin');
  // each leaf bent as a guided beam to its stop (the inner one opening, the outer closing) clears the tongue
  const bent = (y0, d) => { const pts = [], back = []; for (let i = 0; i <= 80; i++) { const s = (p.leaf.length * i) / 80, u = s / p.leaf.length, y = y0 + d * (3 * u * u - 2 * u ** 3); pts.push([m.at.root + s, y - 0.42]); back.push([m.at.root + s, y + 0.42]); } return [[...pts, ...back.reverse()]]; };
  const away = (a) => intersect(a, [[[m.at.root + 1.2, -60], [m.at.fork[0], -60], [m.at.fork[0], 60], [m.at.root + 1.2, 60]]]); // past the leaves' rounds at the root
  assert.equal(area(away(intersect(ground, bent(m.at.guide - 7, m.stop.open)))), 0, 'the inner leaf, opened to the stop');
  assert.equal(area(away(intersect(ground, bent(m.at.guide + 7, -m.stop.close)))), 0, 'the outer leaf, closed to the stop');
  assert.ok(area(away(intersect(ground, bent(m.at.guide - 7, m.stop.open + 1)))) > 0, 'a millimetre further, it would touch: the tongue is as wide as it may be');
  // three inside corners on a jaw (fork to bar, both sides, and jaw to bar), each r² (1 - π/4) filled, 16 mm tall
  near(measureVolume(gripperJaws({ ...p, round: 1.5 }, { part: 'upper' })) - measureVolume(gripperJaws({ ...p, round: 0 }, { part: 'upper' })), 3 * 2.25 * (1 - Math.PI / 4) * 16, 0.3, 'the rounds');
});

test('gripper jaws: the arm\'s jaws (examples/bench arm/jaws) sit on the yoke block where the design says, and hold the upright arm\'s 100 g twice over', async () => {
  const { gripperJaws, gripperJawsModel, flexureMaterial } = await import('@rulecad/flexures'), fs = await import('node:fs');
  const read = (rel) => JSON.parse(fs.readFileSync(new URL(`../../examples/bench/${rel}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n'));
  const v = Object.fromEntries(Object.entries(read('projects/arm/objects/jaws.json').variables).map(([k, x]) => [k, x.value]));
  const lift = read('rules/lift.json').rules;
  const p = { width: v.width, leaf: { length: v.leaf_l, thickness: v.leaf_t, apart: v.apart, fillet: v.fillet }, bar: { inner: v.bar_in, width: v.bar_w }, horn: { reach: v.reach, tip: v.tip, open: v.open_a }, jaws: { from: v.jaw_from, to: v.jaw_to, gap: v.jaw_gap }, stop: { open: v.stop_open, close: v.stop_close, tongue: v.stop_tongue }, base: v.base };
  // PETG as the bench has it: E 1810 MPa, 34 MPa, a strain limit of 34 / 1810 / 1.5; the SG90's stall torque 0.1765 N m
  const petg = flexureMaterial({ modulus: 1810, strength: 34, name: 'PETG', density: 1.27 });
  const m = gripperJawsModel(p, petg, { torque: 0.1765, payload: lift.payload.value, accel: 300, printer: { line: 0.42, layer: 0.2, wall_min: 0.84 } });
  assert.deepEqual(m.findings.filter((f) => f.level !== 'pass').map((f) => f.code), [], 'every finding passes');
  // the root blocks start at the yoke block's front: xs = block_x - back (8 + 71.92)
  near(v.xs, v.block_x - m.at.back, 0.01, 'xs'); near(measureBoundingBox(gripperJaws(p, { part: 'ground' }))[0][0] + v.xs, v.block_x, 0.01, 'the drawn back');
  // the rest angle the anchors use is the model's: asin((14 - 2.25) / 18) = 40.75°
  near(v.rest_a, m.rest, 0.01, 'rest_a');
  // 100 g at 300 mm/s²: 0.1 × (9.80665 + 0.3) = 1.0107 N; twice over by friction 0.4 on two jaws needs
  // 2 × 1.0107 / (2 × 0.4) = 2.5267 N a jaw; at k 0.6824 N/mm that is (w - 2) / 2 × 0.6824 >= 2.5267, w >= 9.405.
  // The widest that goes in: 2 + 2 × 4.5635 - 2 × 0.3 = 10.527
  near(m.rated, 9.41, 0.01, '100 g held twice over from 9.41 mm'); near(m.widest, 10.53, 0.01, 'up to 10.53 mm');
  // the opening stop at 4.8 mm and the tongue at 10 mm: the SG90 driven on at its full stall torque turns the horn to
  // 68.97°, where the stops hold it (worked by hand in the test above): the lower jaw at 4.98 mm, 75% of the leaves'
  // 6.62 mm limit, and the stops resist 2.16 times the stall torque, so a stronger servo still stalls on them
  const st = m.findings.find((f) => f.code === 'gripper.stop');
  near(st.values.most, 4.9835, 1e-3, 'the lower jaw'); assert.ok(st.values.held && st.values.resists >= 2); assert.match(st.text, /jaw goes to 4\.98 mm.*: 75% of the leaves' limit of 6\.62 mm$/);
  // the words say what the figures are: the gap at rest, and the horn's plane (width + 0.3 - 4.3 = 12) above the
  // middle of the 16 mm print (8), so 4 mm
  const jj = read('projects/arm/objects/jaws.json'), js = fs.readFileSync(new URL('../../examples/bench/projects/arm/objects/jaws.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(jj.variables.horn_z.value, 'width + 0.3 - 4.3', 'the horn\'s plane as worked out below');
  for (const text of [jj.description, js]) assert.ok(text.includes(`closed on a ${v.jaw_gap} mm gap`), `the gap at rest is ${v.jaw_gap} mm`);
  assert.ok(js.includes(`${v.width + 0.3 - 4.3 - v.width / 2} mm above the middle`), 'the horn\'s plane above the middle');
  // the posts between the forks: they close to 7.58 - 0.85 = 6.73 at their stops, the posts are 5.9 each side
  assert.ok(m.at.guide - (p.leaf.apart / 2 + p.leaf.thickness / 2 + p.leaf.fillet + 0.5) - v.stop_close - v.post_y >= 0.3, 'the posts clear the closed forks by a print gap');
  // the README's example is these jaws: its figures are the code's
  const readme = fs.readFileSync(new URL('./README.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.ok(readme.includes(`stalls at ${Math.round(st.values.angle)}° with a jaw at ${st.values.most.toFixed(2)} mm, which bends the leaves to ${Math.round((st.values.most / m.limit) * 100)}% of their strain limit; the stops resist ${st.values.resists.toFixed(2)} times`), 'the README\'s stop is the model\'s');
  assert.ok(readme.includes(`${m.grams.toFixed(1)} g of jaws and stops`), 'the README\'s jaws weigh what the model says');
  assert.ok(readme.includes(`stop: { open: ${v.stop_open}, close: ${v.stop_close}, tongue: ${v.stop_tongue} }`), 'the README\'s example has the arm\'s stops');
  for (const line of [`m.stroke;     // ${m.stroke.toFixed(2)} mm`, `m.grip(10);   // ${m.grip(10).toFixed(2)} N`, `m.rated;      // ${m.rated.toFixed(2)}:`]) assert.ok(readme.includes(line), `the README should read ${line}`);
});

const rad = (d) => (d * Math.PI) / 180, deg = (r) => (r * 180) / Math.PI;

test('LET arrays: joints in series share the fold, in parallel the moment; the pinch and the folded gap are the hand sums', async () => {
  const { letArray, letArrayModel, letJointModel } = await import('@rulecad/flexures');
  const j = { width: 12, thickness: 1.2, bar: 1, slot: 1, bridge: 1.5 }, petg = { E: 1810, nu: 0.38 };
  const one = letJointModel(j, petg), m = letArrayModel({ ...j, series: 3, parallel: 2 }, petg);
  near(m.stiffness, (2 * one.stiffness) / 3, 1e-9, 'm k / n'); near(m.strain(0.9), one.strain(0.3), 1e-12, 'each joint turns a third');
  near(m.angle(0.01), 3 * one.angle(0.01), 1e-9, 'three times the fold for a strain'); assert.equal(m.joints, 6);
  // c = slot / 2 + bar + slot = 2.5 from a joint's centre to its outer slot's far side; the land max(2 bar, 2) = 2, so
  // the pitch is 2c + 2 = 7, three joints span 3 × 5 + 2 × 2 = 19 across, two bands 2 × 12 + 1 = 25 along
  near(m.pitch, 7, 1e-12, 'pitch'); near(m.across, 19, 1e-12, 'across'); near(m.along, 25, 1e-12, 'along');
  // one joint: the bodies end 2.5 from the pin, their corners 0.6 above it, so they meet at 180 - 2 atan(0.6 / 2.5) = 153.009°
  near(deg(letArrayModel(j, petg).pinch), 180 - 2 * deg(Math.atan(0.6 / 2.5)), 1e-9, 'pinch'); near(deg(letArrayModel(j, petg).pinch), 153.009, 1e-3, 'pinch, by hand');
  // folded flat (180°): one joint lays the panels on each other (0 - 1.2 = -1.2), two hold them a pitch apart
  // (7 sin 90° - 1.2 = 5.8), three 7 (sin 60° + sin 120°) - 1.2 = 10.924
  near(letArrayModel(j, petg).gap(Math.PI), -1.2, 1e-9, 'one joint'); near(letArrayModel({ ...j, series: 2 }, petg).gap(Math.PI), 5.8, 1e-9, 'two'); near(letArrayModel({ ...j, series: 3 }, petg).gap(Math.PI), 10.924, 1e-3, 'three');
  // drawn: between two 10 mm panels, one piece, on the bed
  const g = letArray({ ...j, series: 3, parallel: 2, panel: 10 }), box = measureBoundingBox(g);
  assert.deepEqual(box.map((v) => v.map((x) => +x.toFixed(6))), [[-19.5, -12.5, 0], [19.5, 12.5, 1.2]]); assert.ok(onePiece(g), 'one piece');
  assert.ok(measureVolume(g) < 39 * 25 * 1.2 - 2 * 19 * 1, 'the slot between the two bands is cut');
});

test('a folding sheet: drawn flat in one piece and folded where its pins put it; the fold check finds the pinch and the clash by the hand sums', async () => {
  const { foldSheet, foldSheetModel, foldCheck } = await import('@rulecad/flexures');
  const j = { width: 12, bar: 1, slot: 1, bridge: 1.5 }, h = 1.2, petg = { E: 1810, nu: 0.38 };
  const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  // two panels on one LET joint: at a fold φ the nearest corners (2.5 along, 0.6 above the pin: r = 2.5709, 13.496° off
  // the mid-plane) are 2 r cos(13.496° + φ / 2) apart: at 140°, 5.1419 cos 83.496° = 0.5824 mm; past 153.009° they overlap
  const two = (let_) => ({ thickness: h, panels: { a: rect(-20, -6, 0, 6), b: rect(0, -6, 20, 6) }, hinges: [{ name: 'fold', from: 'a', to: 'b', at: [[0, -6], [0, 6]], let: let_ }] });
  const r = Math.hypot(2.5, 0.6), at = (phi) => 2 * r * Math.cos(Math.atan(0.6 / 2.5) + rad(phi) / 2);
  let c = await foldCheck(two(j), petg, { poses: { up: { fold: 140 } } });
  near(c.poses.up.gap, at(140), 1e-3, 'at 140°'); near(c.poses.up.gap, 0.5824, 1e-3, 'by hand'); assert.ok(c.ok, 'clear'); assert.deepEqual(c.poses.up.between, ['a', 'b']);
  c = await foldCheck(two(j), petg, { poses: { up: { fold: 156 } } });
  assert.ok(!c.ok); assert.deepEqual(c.findings.map((f) => f.code).sort(), ['fold.clash', 'fold.pinch'], 'past the pinch: the panels overlap');
  // the fold lifts the `to` panel off the bed: its far end's middle (20, 0, 0.6) turns 140° about the pin (0, 0.6):
  // to (20 cos 140°, 0.6 + 20 sin 140°) = (-15.321, 13.456)
  const B = foldSheetModel(two(j), petg).bodies({ fold: 140 }).b, end = [B.R[0] * 20 + B.R[2] * 0.6 + B.t[0], B.R[6] * 20 + B.R[8] * 0.6 + B.t[2]];
  near(end[0], 20 * Math.cos(rad(140)), 1e-9, 'over'); near(end[1], 0.6 + 20 * Math.sin(rad(140)), 1e-9, 'up off the bed'); near(end[1], 13.456, 1e-3, 'by hand');
  // two joints at 180°: each land stands upright, its corners 2r cos(13.496° + 45°) = 2.6866 from a panel's; the panels
  // themselves lie 7 - 1.2 = 5.8 apart, so the nearest pair is a panel and the land
  c = await foldCheck(two({ ...j, series: 2 }), petg, { poses: { flat: { fold: 180 } }, clearance: 5 });
  near(c.poses.flat.gap, 2 * r * Math.cos(Math.atan(0.6 / 2.5) + rad(45)), 1e-3, 'panel to land'); near(c.poses.flat.gap, 2.6866, 1e-3, 'by hand');
  assert.ok(c.poses.flat.between.includes('fold.land1'));
  // a box's two walls on one joint each, standing at 90°: each wall stands 1.2 thick on its edge (19.4 to 20.6), from
  // 0.6 + 2.5 = 3.1 to 0.6 + 15 = 15.6 up. Walls the base's 40 overlap at the corner, 0.6 × 0.6 × 12.5 = 4.5 mm³;
  // walls of 38 clear it by √2 (19.4 - 19) = 0.5657 (corner to corner)
  const box = (bw) => ({ thickness: h, panels: { base: rect(-20, -20, 20, 20), east: rect(20, -bw / 2, 35, bw / 2), north: rect(-bw / 2, 20, bw / 2, 35) },
    hinges: [{ name: 'e', from: 'base', to: 'east', at: [[20, -bw / 2], [20, bw / 2]], let: j }, { name: 'n', from: 'base', to: 'north', at: [[-bw / 2, 20], [bw / 2, 20]], let: j }] });
  c = await foldCheck(box(40), petg, { poses: { standing: { e: 90, n: 90 } } });
  near(-c.poses.standing.gap, 4.5, 1e-3, 'the corner overlap'); assert.deepEqual(c.poses.standing.between, ['east', 'north']);
  assert.equal(c.findings.find((f) => f.code === 'fold.clash').values.at, 1, 'in the pose, not on the way');
  c = await foldCheck(box(38), petg, { poses: { standing: { e: 90, n: 90 } } });
  near(c.poses.standing.gap, Math.SQRT2 * 0.4, 1e-3, 'walls of 38'); assert.ok(c.ok);
  // drawn: flat, one piece on the bed; standing, the walls where the sums put them
  const flatBox = await foldSheet(box(38)), up = measureBoundingBox(await foldSheet(box(38), { e: 90, n: 90 }));
  // walls of 38 leave the base a corner 20 - 19.001 square past both bands' ends, which no hinge holds: left out, and said
  assert.ok(onePiece(flatBox), 'one print, no loose corner'); const loose = c.findings.find((f) => f.code === 'fold.loose');
  assert.equal(loose.values.panel, 'base'); near(loose.values.area, 0.999 ** 2, 1e-6, 'the corner left out'); near(measureBoundingBox(flatBox)[1][2], 1.2, 1e-5, 'flat');
  near(up[1][0], 20.6, 1e-5, 'the east wall\'s outer face'); near(up[1][2], 15.6, 1e-5, 'its top');
  // a living hinge (web 0.4 on the bed, 2 wide, panels 1.6 sloped back 45°): strain t θ / 2l, and its pinch from the
  // steeper of the web's edge (atan(0.2 / 1) = 11.31°) and the panel's top (atan(1.4 / 2.2) = 32.47°): 115.06°
  const liv = { thickness: 1.6, panels: { a: rect(-20, -6, 0, 6), b: rect(0, -6, 20, 6) }, hinges: [{ name: 'fold', from: 'a', to: 'b', at: [[0, -6], [0, 6]], living: { flex: 2, thickness: 0.4 } }] };
  const lm = foldSheetModel(liv, petg).hinges.fold;
  near(lm.strain(1), 0.4 / 4, 1e-12, 'strain'); near(deg(lm.pinch), 180 - 2 * deg(Math.atan(1.4 / 2.2)), 1e-9, 'pinch'); near(deg(lm.pinch), 115.06, 0.01, 'pinch, by hand');
  // the check's bodies are the drawn ones: the panels' top corners sit 2.2 across and 1.4 above the pin (r = √(2.2² +
  // 1.4²) = 2.6077), so folded θ they are 2 r cos(32.47° + θ / 2) apart: at 113°, 5.2154 × cos(88.97°) = 0.0936 mm;
  // at the pinch they touch, and a degree past it they overlap (the clash found by the geometry, not only the pinch)
  const short = await foldCheck(liv, petg, { poses: { up: { fold: 113 } }, clearance: 0 });
  assert.ok(short.ok, 'just short of the pinch: clear'); near(short.poses.up.gap, 2 * Math.hypot(2.2, 1.4) * Math.cos(Math.atan(1.4 / 2.2) + rad(113) / 2), 1e-3, 'the gap, by hand');
  near((await foldCheck(liv, petg, { poses: { up: { fold: deg(lm.pinch) } }, clearance: 0 })).poses.up.gap, 0, 1e-3, 'at the pinch the corners touch');
  const past = await foldCheck(liv, petg, { poses: { up: { fold: 117 } }, clearance: 0 });
  assert.ok(!past.ok, 'just past it: the panels meet'); assert.ok(past.findings.some((f) => f.code === 'fold.clash' && f.level === 'fail'), 'and the geometry overlaps: a clash, not only the pinch');
  assert.ok(onePiece(await foldSheet(liv)), 'the web joins the panels');
  // with a strain limit, a hinge that folds too far for it fails by name and says how far it may go: the strain is
  // linear in the fold, 9.365% at 90°, so PETG's 34 / 1810 / 1.5 = 1.2523% allows 90 × 1.2523 / 9.365 = 12.03°
  c = await foldCheck(two(j), { ...petg, strainLimit: 34 / 1810 / 1.5 }, { poses: { up: { fold: 90 } } });
  const st = c.findings.find((f) => f.code === 'fold.strain');
  assert.equal(st.level, 'fail'); assert.match(st.text, /sees 9\.37% strain, over the limit of 1\.25%: it folds 12° at most/); near(st.values.strain, 0.09365, 1e-5, 'the strain at 90°');
});

test('a Miura sheet folds rigidly: its facets keep their sides and angle at every fold, its creases turn as the hand sums say, and its webs set how far it folds', async () => {
  const { miura, miuraModel } = await import('@rulecad/flexures');
  const p = { a: 10, b: 12, angle: 60, rows: 3, columns: 4 }, m = miuraModel(p), len = (u, w) => Math.hypot(...u.map((x, i) => x - w[i]));
  for (const fold of [0, 20, 45, 70, 89]) {
    const v = m.at(fold).vertices;
    for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) {
      const e1 = v[j][i + 1].map((x, k) => x - v[j][i][k]), e2 = v[j + 1][i].map((x, k) => x - v[j][i][k]);
      near(len(v[j][i + 1], v[j][i]), 10, 1e-9, `side a at ${fold}°`); near(len(v[j + 1][i], v[j][i]), 12, 1e-9, `side b at ${fold}°`);
      const c = Math.abs(e1.reduce((s, x, k) => s + x * e2[k], 0)) / 120; near(c, Math.cos(rad(60)), 1e-9, `the angle at ${fold}°`);
    }
  }
  // a = b = 1, γ 60°, tilted 30°: H = sin 30° sin 60° = 0.43301, L = √(1 - H²) = 0.90139, V = cos 60° / L = 0.55470,
  // S = √(1 - V²) = 0.83205. The creases between columns turn 2θ = 60°; between rows acos((H²S² - H²V² + L²S²) /
  // (H² + L²S²)) = acos((0.12981 - 0.05769 + 0.5625) / 0.75) = acos(0.84615) = 32.204°, alternately closing the top
  const u = miuraModel({ a: 1, b: 1, angle: 60, rows: 2, columns: 3 }).at(30);
  near(u.cell.H, 0.43301, 1e-5, 'H'); near(u.cell.L, 0.90139, 1e-5, 'L'); near(u.cell.V, 0.55470, 1e-5, 'V'); near(u.cell.S, 0.83205, 1e-5, 'S');
  for (const c of u.creases.filter((x) => x.kind === 'across')) near(c.turn, 60, 1e-9, 'across');
  const along = u.creases.filter((x) => x.kind === 'along');
  for (const c of along) near(c.turn, 32.204, 1e-3, 'along');
  assert.deepEqual(along.map((c) => c.top), [true, false, true], 'mountain, valley, mountain');
  const across = u.creases.filter((x) => x.kind === 'across' && x.between[0][1] === 0).map((c) => c.top);
  assert.deepEqual(across, [false, true], 'and the zigzag creases alternate too');
  // flat it is the sheet; folded flat (near 90°) it packs to L = a cos γ across, S → 0 along
  assert.deepEqual(m.at(0).size.map((x) => +x.toFixed(9)), [40 + 12 * 0.5, 3 * 12 * Math.sin(rad(60)), 0].map((x) => +x.toFixed(9)));
  near(m.at(89.99).cell.L, 10 * Math.cos(rad(60)), 1e-4, 'folded flat across');
  // printed with webs: a crease of web t on l wide strains t ψ / 2l. The zigzag creases turn most (2θ), so PETG at
  // 34 / 1810 / 1.5 = 1.2523% on a 0.4 mm web 2 mm wide folds to θ = e l / t = 0.012523 × 2 / 0.4 = 0.0626 rad, 3.588°
  const petg = { E: 1810, strainLimit: 34 / 1810 / 1.5 }, web = { ...p, thickness: 1.6, hinge: { flex: 2, thickness: 0.4 } }, w = miuraModel(web, petg);
  near(w.fold, deg((petg.strainLimit * 2) / 0.4), 1e-6, 'the furthest fold'); near(w.fold, 3.588, 1e-3, 'by hand'); assert.equal(w.limit, 'strain');
  // a material that stretches further (10%, as a TPU might: an example, not a rule set) on a web 6 mm wide strains
  // to its limit at θ = 0.1 × 6 / 0.4 = 1.5 rad, past where the panels meet: the top-closing creases pinch at
  // 180 - 2 max(atan(0.4 / 6), atan(1.4 / (3 + 1.2))) = 180 - 2 × 18.435 = 143.13°, which a zigzag crease turns at θ = 71.565°
  const t = miuraModel({ ...web, hinge: { flex: 6, thickness: 0.4 } }, { E: 26, strainLimit: 0.1 }); assert.equal(t.limit, 'pinch');
  near(t.fold, (180 - 2 * deg(Math.atan(1.4 / 4.2))) / 2, 1e-6, 'the pinch, a zigzag crease turning 2θ'); near(t.fold, 71.565, 1e-3, 'by hand');
  // printed flat: one piece, the web the whole sheet on the bed, the panels up to the sheet's thickness
  const g = miura(web), b = measureBoundingBox(g);
  assert.ok(onePiece(g), 'one piece'); near(b[0][2], 0, 1e-9, 'on the bed'); near(b[1][2], 1.6, 1e-9, 'the panels'); near(b[1][0], 46, 1e-9, 'as wide as the sheet');
  // its volume: the web (the sheet's area, 12 parallelograms of 10 × 12 sin 60°, by 0.4) and each panel a frustum
  // from the web's top to 1.6, so at least the web and less than the whole sheet at full thickness
  const sheet = 12 * 10 * 12 * Math.sin(rad(60));
  assert.ok(measureVolume(g) > sheet * 0.4 && measureVolume(g) < sheet * 1.6, `volume ${measureVolume(g)}`);
  assert.ok(measureBoundingBox(miura(web, 40))[1][2] > 5, 'drawn folded, it stands up off the bed');
});

test('folding sheets and Miura sheets: bad input is refused by name, before any sums', async () => {
  const { letArray, letArrayModel, foldSheet, foldCheck, miura, miuraModel } = await import('@rulecad/flexures');
  const j = { width: 12, thickness: 1.2, bar: 1, slot: 1, bridge: 1.5 }, petg = { E: 1810, nu: 0.38 };
  const code = async (fn, c) => { let e = null; try { await fn(); } catch (x) { e = x; } assert.ok(e, `refused (${c})`); assert.equal(e.code, c, e.message); };
  const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], let_ = { width: 12, bar: 1, slot: 1, bridge: 1.5 };
  const panels = { a: rect(-20, -6, 0, 6), b: rect(0, -6, 20, 6), c: rect(0, 6, 20, 26) };
  await code(() => letArray({ ...j, width: 4 }), 'let.bridge');
  await code(() => letArrayModel({ ...j, series: 0 }, petg), 'let.count');
  await code(() => letArray({ ...j, slot: 0 }), 'let.size');
  await code(() => foldSheet({ thickness: 0, panels, hinges: [] }), 'fold.thickness');
  await code(() => foldSheet({ thickness: 1.2, panels: { a: [[0, 0], [1, 0]] }, hinges: [] }), 'fold.panels');
  await code(() => foldSheet({ thickness: 1.2, panels, hinges: [{ name: 'h', from: 'a', to: 'b', at: [[0, -6], [0, 6]], let: let_ }] }), 'fold.tree');
  await code(() => foldSheet({ thickness: 1.2, panels, hinges: [{ name: 'h', from: 'a', to: 'b', at: [[0, -6], [0, 6]], let: let_ }, { name: 'i', from: 'b', to: 'c', at: [[0, 6], [20, 6]], let: let_ }, { name: 'k', from: 'a', to: 'c', at: [[0, 6], [0, 26]], let: let_ }] }), 'fold.loop');
  await code(() => foldSheet({ thickness: 1.2, panels: { a: panels.a, b: panels.b }, hinges: [{ name: 'h', from: 'a', to: 'b', at: [[0, -6], [0, 6]], let: let_, living: { flex: 2, thickness: 0.4 } }] }), 'fold.kind');
  await code(() => foldSheet({ thickness: 1.2, panels: { a: panels.a, b: panels.b }, hinges: [{ name: 'h', from: 'a', to: 'b', at: [[0, -6], [0, 6]], let: { ...let_, width: 30 } }] }), 'fold.width');
  await code(() => foldSheet({ thickness: 1.2, panels: { a: panels.a, b: panels.b }, hinges: [{ name: 'h', from: 'a', to: 'b', at: [[0, -6], [0, 6]], living: { flex: 2, thickness: 1.2 } }] }), 'fold.web');
  const two = { thickness: 1.2, panels: { a: panels.a, b: panels.b }, hinges: [{ name: 'h', from: 'a', to: 'b', at: [[0, -6], [0, 6]], let: let_ }] };
  await code(() => foldSheet(two, { nope: 10 }), 'fold.pose');
  // a box whose two edges' joints (12 wide, so 6 either side of each edge's middle) meet at the corner of a 10 mm base:
  // its bands leave 10 - 5 = 5 mm between them, under the joints' 12 and their laps
  const corner = { thickness: 1.2, panels: { base: rect(-5, -5, 5, 5), e: rect(5, -5, 15, 5), n: rect(-5, 5, 5, 15) }, hinges: [{ name: 'e', from: 'base', to: 'e', at: [[5, -5], [5, 5]], let: { ...let_, width: 10, bridge: 1 } }, { name: 'n', from: 'base', to: 'n', at: [[-5, 5], [5, 5]], let: { ...let_, width: 10, bridge: 1 } }] };
  await code(() => foldSheet(corner), 'fold.strips');
  await code(() => foldCheck(two, petg, {}), 'fold.pose');
  await code(() => foldCheck(two, petg, { poses: { up: { h: 30 } }, clearance: -1 }), 'fold.clearance');
  await code(() => miuraModel({ a: 10, b: 10, angle: 90, rows: 2, columns: 2 }), 'miura.angle');
  await code(() => miuraModel({ a: 10, b: 10, angle: 60, rows: 1.5, columns: 2 }), 'miura.count');
  await code(() => miuraModel({ a: 10, b: 10, angle: 60, rows: 2, columns: 2 }).at(90), 'miura.fold');
  await code(() => miura({ a: 10, b: 10, angle: 60, rows: 2, columns: 2, thickness: 1.6 }), 'miura.web');
  await code(() => miura({ a: 10, b: 10, angle: 60, rows: 2, columns: 2, thickness: 0.4, hinge: { flex: 2, thickness: 0.4 } }), 'miura.web');
});

test('folding: the README\'s figures are the code\'s, and the workspace tray (examples/bench flexures/tray) folds to 90° within PETG\'s limit, its parts clear', async () => {
  const f = await import('@rulecad/flexures'), fs = await import('node:fs'), { pathToFileURL, fileURLToPath } = await import('node:url');
  const readme = fs.readFileSync(new URL('./README.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const petg = { ...f.flexureMaterial({ modulus: 1810, strength: 34, name: 'PETG' }), nu: 0.38 };
  const j = { width: 30, thickness: 1.2, bar: 0.84, slot: 1, bridge: 1.5, series: 4 }, m = f.letArrayModel(j, petg), one = f.letJointModel(j, petg);
  for (const line of [`m.strain(Math.PI / 2); // ${m.strain(Math.PI / 2).toFixed(4)}: ${(m.strain(Math.PI / 2) * 100).toFixed(2)}% at 90°, against PETG's ${(petg.strainLimit * 100).toFixed(2)}%`,
    `m.stiffness;           // ${m.stiffness.toFixed(2)} N·mm a radian: ${(m.stiffness * Math.PI / 2).toFixed(2)} N·mm holds a wall at 90°`, `m.across;              // ${m.across.toFixed(2)} mm`,
    `One such joint folds ${(deg(one.angle(petg.strainLimit))).toFixed(1)}° within PETG's limit, so four in series fold 90° at ${(deg(one.angle(petg.strainLimit)) / 22.5).toFixed(2)} times the margin`]) assert.ok(readme.includes(line), `the README should read ${line}`);
  const mi = f.miuraModel({ a: 12, b: 12, angle: 60, rows: 4, columns: 4, thickness: 1.6, hinge: { flex: 2, thickness: 0.4 } }, petg);
  assert.ok(readme.includes(`On a 0.4 mm web 2 mm wide, PETG folds a Miura sheet only ${mi.fold.toFixed(1)}°`), 'the README\'s Miura limit');
  // the bench tray, built by its own main with its own variables (bar: x1c.line × 2 = 0.84; clearance: x1c.fit = 0.2)
  const dir = new URL('../../examples/bench/projects/flexures/objects/', import.meta.url), json = JSON.parse(fs.readFileSync(new URL('tray.json', dir), 'utf8'));
  assert.equal(json.variables.bar.value, 'x1c.line * 2'); assert.equal(json.variables.clearance.value, 'x1c.fit');
  const v = { ...Object.fromEntries(Object.entries(json.variables).map(([k, x]) => [k, x.value])), bar: 0.84, clearance: 0.2, flexures: f, petg: { modulus: 1810, strength: 34, poisson: 0.38 } };
  const { main } = await import(pathToFileURL(fileURLToPath(new URL('tray.js', dir))).href);
  const made = await main(v), flat = made.parts.tray, folded = (await main({ ...v, fold: 90 })).parts.tray;
  assert.deepEqual(made.findings.filter((x) => x.level !== 'pass').map((x) => x.code), [], 'every fold finding passes');
  for (const x of made.findings.filter((x) => x.code === 'fold.strain')) near(x.values.strain, m.strain(Math.PI / 2), 1e-12, 'the tray\'s joints are the README\'s');
  assert.ok(made.mechanism.poses.folded.gap >= 1.2 - 1e-9, 'its parts stay over 1.2 mm apart'); assert.ok(readme.includes('every two parts stay over 1.2 mm apart'));
  assert.ok(onePiece(flat), 'one print'); const grams = (measureVolume(flat) * 1.27) / 1000;
  assert.ok(readme.includes(`It weighs ${grams.toFixed(1)} g`), `the README's tray weighs ${grams.toFixed(1)} g`);
  // standing: each wall's outer face at the first pin (30 - 1.5 × 6.68 = 19.98) plus the lands at 22.5°, 45° and 67.5°
  // (6.68 × 2.0137 = 13.451) plus half the sheet: 34.031; its top 0.6 + 13.451 + 9.98 (the wall past the last pin, 50 - 40.02) = 24.031
  const b = measureBoundingBox(folded);
  near(b[1][0], 30 - 1.5 * 6.68 + 6.68 * (Math.cos(rad(22.5)) + Math.cos(rad(45)) + Math.cos(rad(67.5))) + 0.6, 1e-4, 'the wall\'s outer face'); near(b[1][0], 34.031, 1e-3, 'by hand');
  near(b[1][2], 0.6 + 6.68 * (Math.sin(rad(22.5)) + Math.sin(rad(45)) + Math.sin(rad(67.5))) + (45 - (25 + 1.5 * 6.68)), 1e-4, 'its top'); near(b[1][2], 24.031, 1e-3, 'by hand');
  assert.ok(readme.includes(`so it stands about ${Math.round(b[1][2] - 0.6 - 6.68 * (Math.sin(rad(22.5)) + Math.sin(rad(45)) + Math.sin(rad(67.5))))} mm above them`), 'the README\'s wall height');
});

// Linkages, amplifiers and bistables (#76, #77): each joint a short flexure, 6 mm long, 0.84 thick, 6 wide in PLA.
// With no rounds its stiffness is EI / l = 2680 × 6 × 0.84³ / 12 / 6 = 132.371 N·mm a radian, and its strain t / 2l =
// 0.07 a radian (Howell 2001, the small-length flexural pivot)
const flex0 = { length: 6, thickness: 0.84, fillet: 0 }, plaG = { ...pla, density: 1.24 };

test('a compliant four-bar: the parallelogram and the crank-rocker against their sums by hand, and the beam solver', async () => {
  const { fourBar, fourBarModel } = await import('@rulecad/flexures');
  // the parallelogram (crank = rocker 20, coupler = ground 30, crank upright): the coupler does not turn, so every
  // joint turns as far as the crank, d; the flexures store 4 × K d² / 2, so the crank needs 4 K d: at 5°,
  // 4 × 132.371 × 0.0872665 = 46.206 N·mm, and the rocker turns 5° too
  const par = fourBarModel({ ground: 30, crank: 20, coupler: 30, rocker: 20, angle: 90, width: 6, flex: flex0 }, plaG);
  assert.equal(par.kind, 'parallelogram');
  near(par.K, 132.371, 1e-3, 'K'); near(par.torque(5), 46.206, 0.01, '4Kd'); near(par.rocker(5), 5, 1e-9, 'the rocker');
  for (const v of Object.values(par.turns(5))) near(Math.abs(v), 5 * Math.PI / 180, 1e-9, 'each joint');
  near(par.strain(5), 0.07 * 0.0872665, 1e-6, 't/2l a radian');
  near(par.swing[1], (0.02 / 0.07) * 180 / Math.PI, 0.01, 'the swing at 2%: 0.02 / 0.07 rad = 16.37°');
  // the crank-rocker: A at 0, D at 40, crank 15 at 60°, coupler 40, rocker 30. BD² = 15² + 40² - 2 × 15 × 40 × cos 60°
  // = 1225, so BD = 35, and the transmission angle at rest is acos((40² + 30² - 35²) / (2 × 40 × 30)) = acos(0.53125)
  // = 57.91°. Shortest + longest 15 + 40 <= 40 + 30, the crank the shortest: a crank-rocker (Grashof)
  const cr = { ground: 40, crank: 15, coupler: 40, rocker: 30, angle: 60, width: 6, flex: { length: 6, thickness: 0.84 } };
  const m = fourBarModel(cr, plaG, { printer: { line: 0.42, layer: 0.2, wall_min: 0.84 } });
  assert.equal(m.kind, 'crank-rocker'); near(m.transmission(0), 57.91, 0.01, 'the transmission angle');
  assert.deepEqual(m.findings.filter((x) => x.level !== 'pass').map((x) => x.code), [], 'every finding passes');
  for (const code of ['linkage.kind', 'linkage.transmission', 'flexure.strain', 'linkage.torque', 'linkage.clear', 'flexure.lines', 'linkage.mass']) assert.ok(m.findings.some((x) => x.code === code), code);
  // the beam solver on the drawn flexures (rounds included) agrees with the pins and springs within 3% at ±10°
  for (const deg of [-10, 10]) { const s = m.solve(deg); assert.ok(s.converged); near(s.torque / m.torque(deg), 1, 0.03, `torque at ${deg}°`); }
  // drawn at rest, one piece, as heavy as the model says
  const g = fourBar(cr);
  assert.ok(onePiece(g)); near((measureVolume(g) / 1000) * 1.24, m.grams, 1e-9, 'grams');
  assert.ok(m.clear.gap >= 0.3);
});

test('a compliant slider-crank: the slider\'s place and rate by hand, the push from virtual work, the guide in the sums', async () => {
  const { sliderCrank, sliderCrankModel, parallelGuideModel } = await import('@rulecad/flexures');
  const p = { crank: 15, coupler: 35, angle: 100, width: 6, flex: flex0, guide: { length: 25, thickness: 0.84 } };
  const m = sliderCrankModel(p, plaG, { torque: 0.2 });
  // x = r cos θ + √(l² - r² sin² θ): at 100°, -2.6047 + √(1225 - 218.21) = 29.1251; at 110°, -5.1303 + 32.0362 =
  // 26.9059, so turning the crank 10° on slides it -2.2192 mm
  near(m.slide(10), -2.2192, 1e-3, 'the slide at 10°');
  // dx/dθ = -r sin θ - r² sin θ cos θ / √(l² - r² sin² θ) = -14.7721 + 38.4777 / 31.7299 = -13.5595 mm a radian;
  // at rest the flexures ask nothing, so 0.2 N m pushes 200 / 13.5595 = 14.750 N
  near(m.rate(0), -13.5595, 1e-3, 'the rate'); near(m.force(0, 0.2), 14.750, 0.01, 'the push at rest');
  // turned on, the flexures and guide take their share: F = (T - torque) / |dx/dθ|
  near(m.force(5, 0.2), (200 - m.torque(5)) / Math.abs(m.rate(5)), 1e-9, 'virtual work');
  const g = parallelGuideModel({ length: 25, thickness: 0.84, width: 6, fillet: 1 }, plaG);
  near(m.guide, g.stiffness, 1e-12, 'the guide');
  // the guide's drop at the stroke's end: 3δ² / 5L
  const end = Math.max(...m.stroke.map(Math.abs)); near(m.drop, (3 * end * end) / (5 * 25), 1e-12, 'the drop');
  assert.deepEqual(m.findings.filter((x) => x.level !== 'pass').map((x) => x.code), []);
  // too little torque to turn it against the flexures fails by name
  assert.equal(sliderCrankModel(p, plaG, { torque: 0.01 }).findings.find((x) => x.code === 'linkage.force').level, 'fail');
  const shape = sliderCrank(p); assert.ok(onePiece(shape)); near((measureVolume(shape) / 1000) * 1.24, m.grams, 1e-9, 'grams');
});

test('displacement amplifiers: the bridge, the rhombus and the lever, by hand and by the beam solver', async () => {
  const { bridgeAmplifierModel, rhombusAmplifierModel, leverAmplifierModel, bridgeAmplifier, rhombusAmplifier, leverAmplifier } = await import('@rulecad/flexures');
  // the bridge, links 20 at 10°: cot 10° = 5.6713 at the start; its input as stiff as 2K / (L² sin² α) = 2 × 132.371
  // / (400 × 0.030154) = 21.949 N/mm
  const b = bridgeAmplifierModel({ link: 20, angle: 10, width: 6, flex: flex0 }, plaG, { input: 0.05 });
  near(b.ratio, 5.6713, 1e-4, 'cot α'); near(b.stiffness, 21.949, 1e-3, 'the input\'s stiffness');
  // the rigid links' output over the stroke: v = 2L (sin α - sin α'), cos α' = cos α + u / 2L
  const a1 = Math.acos(Math.cos(10 * Math.PI / 180) + 0.05 / 40); near(b.output(0.05), 40 * (Math.sin(10 * Math.PI / 180) - Math.sin(a1)), 1e-12, 'the output');
  // the drawn flexures give less than the rigid links (they stretch and shear), but most of it; the solver's input is
  // within 10% of the pins'
  assert.ok(b.solved < b.output(0.05) / 0.05 && b.solved > 0.8 * b.ratio, `the bridge's ratio ${b.solved}`);
  near(b.solvedStiffness / b.stiffness, 1, 0.1, 'the solver\'s input stiffness');
  // the rhombus, steeper: its ratio near cot 30° = 1.7321
  const r = rhombusAmplifierModel({ link: 25, angle: 30, width: 6, flex: flex0 }, plaG, { input: 0.2 });
  near(r.ratio, 1.7321, 1e-4, 'cot 30°'); near(r.solved / (r.output(0.2) / 0.2), 1, 0.03, 'the rhombus\'s ratio');
  // the lever, pushed 10 from its pivot, out to 50: 5 times; its input K / a² = 1.3237 N/mm
  const l = leverAmplifierModel({ input: 10, output: 50, width: 6, flex: flex0 }, plaG, { input: 0.2 });
  near(l.ratio, 5, 1e-12, 'b / a'); near(l.stiffness, 1.3237, 1e-4, 'K / a²'); near(l.solved / 5, 1, 0.05, 'the solver\'s lever');
  for (const x of [b, r, l]) assert.deepEqual(x.findings.filter((f) => f.level !== 'pass').map((f) => f.code), []);
  for (const g of [bridgeAmplifier({ link: 20, angle: 10, width: 6, flex: flex0 }), rhombusAmplifier({ link: 25, angle: 30, width: 6, flex: flex0 }), leverAmplifier({ input: 10, output: 50, width: 6, flex: flex0 })]) assert.ok(onePiece(g));
  // pushed past flat (2L (1 - cos α) = 40 × 0.015192 = 0.6077 mm), the bridge toggles: a fail by name. The rhombus
  // turns its flexures 0.02 / 0.07 = 0.2857 rad at the limit, before it lies flat: there the strain fails
  const flat = bridgeAmplifierModel({ link: 20, angle: 10, width: 6, flex: flex0 }, plaG, { input: 2 }).findings.find((f) => f.code === 'bridge.flat');
  assert.equal(flat.level, 'fail'); assert.match(flat.text, /past the 0\.608 mm that lays the links flat/);
  const over = rhombusAmplifierModel({ link: 25, angle: 30, width: 6, flex: flex0 }, plaG, { input: 6 }).findings.find((f) => f.code === 'flexure.strain');
  assert.equal(over.level, 'fail'); assert.match(over.text, /the input may go \d+\.\d+ mm/);
});

test('a tilted-leaf bistable: stiff as two fixed-guided leaves at rest, snapping over and staying, by the beam solver', async () => {
  const { tiltedBistable, tiltedBistableModel } = await import('@rulecad/flexures');
  // leaves 30 long at 8°, 0.84 × 6, no rounds: A 5.04, I 0.29635; EA/L sin²α = 450.24 × 0.019369 = 8.7207 and
  // 12EI/L³ cos²α = 0.35298 × 0.98063 = 0.34614; two leaves: 2 × 9.0668 = 18.134 N/mm. The rise is 30 sin 8° = 4.1752
  const p = { length: 30, angle: 8, thickness: 0.84, width: 6, fillet: 0 }, m = tiltedBistableModel(p, plaG, { steps: 40 });
  near(m.stiffness, 18.134, 1e-3, 'by hand'); near(m.solvedStiffness / m.stiffness, 1, 0.01, 'the solver at rest'); near(m.rise, 4.1752, 1e-4, 'the rise');
  // it snaps: the push peaks, falls through 0 where the leaves line up (the rise), pulls on, and rests again short of
  // twice the rise (the leaves stay bent over there)
  assert.ok(m.bistable && m.snap.force > 0 && m.back.force < 0);
  near(m.middle, m.rise, 0.05, 'through 0 where the leaves line up');
  assert.ok(m.second > 1.2 * m.rise && m.second < 2 * m.rise, `rests again at ${m.second}`);
  assert.ok(m.strain < 0.02); assert.deepEqual(m.findings.filter((f) => f.level !== 'pass').map((f) => f.code), []);
  // too steep to squeeze: refused by name; one piece as drawn
  assert.throws(() => tiltedBistable({ ...p, angle: 40 }), /angle is the leaves' tilt/);
  assert.ok(onePiece(tiltedBistable({ ...p, fillet: 1 })));
});

test('a buckled-beam switch: squeezed into its frame it bows as the buckled strip does, and switches the same either way', async () => {
  const { buckledSwitch, buckledSwitchModel } = await import('@rulecad/flexures');
  // a strip 50 long, 0.84 × 6, squeezed 0.4, with no rounds: clamped, it buckles at 4π²EI / L² = 4π² × 2680 ×
  // 0.29635 / 49.6² = 12.745 N; its rise is (2/π) √(L s - π²t²/3) for the squeeze left once the frame has given (the
  // model's formula) for a uniform strip. Its rigid 4 mm pad sits where the strip bends most, so it rises a little
  // less (within 5%) and pushes about as the strip less its pad buckles: 12.745 × (49.6 / 45.6)² = 15.08 N (within 3%)
  const p = { length: 50, thickness: 0.84, width: 6, squeeze: 0.4, fillet: 0, base: 12 }, m = buckledSwitchModel(p, plaG, { steps: 40 });
  near(m.euler, 12.745, 1e-3, 'Euler'); near(m.rise / m.formula, 0.975, 0.025, 'the rise'); near(m.load / (m.euler * (49.6 / 45.6) ** 2), 1, 0.03, 'it pushes about its buckling load');
  assert.ok(m.give > 0 && m.give < 0.25 * 0.4, `the frame gives ${m.give}`);
  // its two states are mirrors: it rests again at twice the rise, and the push over equals the pull back within 5%
  assert.ok(m.bistable); near(m.second / (2 * m.rise), 1, 0.01, 'the mirror'); near(-m.back.force / m.snap.force, 1, 0.05, 'the same either way');
  assert.deepEqual(m.findings.filter((f) => f.level !== 'pass').map((f) => f.code), []);
  // two prints, each one piece; the frame's pockets hold the tabs squeeze nearer than the strip's
  const strip = buckledSwitch(p, { part: 'strip' }), frame = buckledSwitch(p, { part: 'frame' });
  assert.ok(onePiece(strip) && onePiece(frame));
  near(measureBoundingBox(strip)[1][0] - measureBoundingBox(strip)[0][0], 50 + 2 * 5, 1e-3, 'the strip and its tabs');
  assert.throws(() => buckledSwitchModel({ ...p, squeeze: 6 }, plaG), /squeeze 6 is a tenth of the length or more/);
  assert.throws(() => buckledSwitch({ ...p, tab: [5] }), /tab is \[along x, across y\]/);
});

test('linkages, amplifiers and bistables refuse what is not a size, by name, before any sums', async () => {
  const f = await import('@rulecad/flexures');
  const cr = { ground: 40, crank: 15, coupler: 40, rocker: 30, angle: 60, width: 6, flex: { length: 6, thickness: 0.84 } };
  assert.throws(() => f.fourBar({ ...cr, coupler: 5 }), /don't close at a crank angle of 60°/);
  assert.throws(() => f.fourBar({ ...cr, flex: { length: 6, thickness: 0.84, fillet: 3 } }), /flex\.fillet 3 leaves no flexure/);
  assert.throws(() => f.fourBar({ ...cr, base: 9 }), /base 9 is wider than the knuckles/);
  assert.throws(() => f.fourBar({ ...cr, width: 0 }), /width is a size above 0/);
  assert.throws(() => f.fourBarModel(cr, { E: 2680 }), /needs a strainLimit/);
  assert.throws(() => f.fourBarModel(cr, plaG, { travel: -1 }), /travel is the input's swing/);
  assert.throws(() => f.sliderCrank({ crank: 15, coupler: 35, angle: 100, width: 6, flex: flex0 }), /guide is an object/);
  assert.throws(() => f.bridgeAmplifier({ link: 20, angle: 95, width: 6, flex: flex0 }), /angle is the links' angle/);
  assert.throws(() => f.rhombusAmplifier({ link: 25, angle: 30, width: 6, flex: flex0, span: 10 }), /takes no span or inner/);
  assert.throws(() => f.leverAmplifier({ input: 10, output: 8, width: 6, flex: flex0 }), /output 8 is not past the input 10/);
  assert.throws(() => f.tiltedBistableModel({ length: 30, angle: 8, thickness: 0.84, width: 6 }, plaG, { steps: 3 }), /steps is a whole number, 10 or more/);
});

test('the README\'s linkages, amplifiers and bistables are the code\'s figures', async () => {
  const f = await import('@rulecad/flexures'), fs = await import('node:fs');
  const readme = fs.readFileSync(new URL('./README.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n'), has = (s) => assert.ok(readme.includes(s), `the README should read: ${s}`);
  const flex = { length: 6, thickness: 0.84 }, x1 = (v) => v.toFixed(1), x2 = (v) => v.toFixed(2);
  const m = f.fourBarModel({ ground: 40, crank: 15, coupler: 40, rocker: 30, angle: 60, width: 6, flex }, plaG);
  has(`m.swing;         // [${m.swing.map(x1).join(', ')}] degrees`); has(`m.torque(10);    // ${x1(m.torque(10))} N·mm at the crank, 10° on (the beam solver: ${x1(m.solve(10).torque)})`);
  has(`each joint ${x1(m.K)} N·mm a radian; swung ±${x1(m.travel)}° (0.8 of the limit) the rocker turns ${x1(m.rocker(m.travel))}° | ${x1(m.grams)} |`);
  const b = f.bridgeAmplifierModel({ link: 20, angle: 10, width: 6, flex }, plaG, { input: 0.1 });
  has(`cot 10° = ${x2(b.ratio)}; over 0.1 mm the rigid links give ${x2(b.output(0.1) / 0.1)} and the drawn flexures ${x2(b.solved)}; the links lie flat at ${b.limit.toFixed(3)} mm of input | ${x1(b.grams)} |`);
  const t = f.tiltedBistableModel({ length: 30, angle: 8, thickness: 0.84, width: 6 }, plaG);
  has(`rises ${x2(t.rise)} mm; ${x2(t.snap.force)} N switches it, ${x2(t.snap.push)} mm in; it rests again ${x2(t.second)} mm down, and ${x2(-t.back.force)} N brings it back (${x2(-t.rigid.back.force)} N on a rigid frame); ${x2(t.strain * 100)}% on the way | ${x1(t.grams)} |`);
  const s = f.buckledSwitchModel({ length: 50, thickness: 0.84, width: 6, squeeze: 0.4, base: 12 }, plaG);
  has(`the frame gives ${s.give.toFixed(3)} mm; the strip pushes its pockets with ${x1(s.load)} N and bows ${x2(s.rise)} mm; ${x2(s.snap.force)} N switches it either way; ${x2(s.strain * 100)}% | ${x1(s.grams)} (strip and frame) |`);
});

test('a tilted-leaf bistable\'s frame bends in the solver: a shallow bar loses the snap, the default keeps most of it', async () => {
  const { tiltedBistableModel } = await import('@rulecad/flexures');
  // leaves 30 at 8°, 0.84 × 6, no rounds; the bar's top at -7.4752 (the rise 4.1752, half the 4 mm shuttle, the 0.3
  // gap and 1), each block's foot 27.441 from the middle. The leaves push each root out with a thrust H at the roots'
  // line, arm a above the bar's middle line; the bar, held square at its middle by the mirror, turns each block
  // H a l / EI, so the root moves out a² l / EI a newton. Base 6: a = 10.475, I = 6 × 6³ / 12 = 108, so
  // 10.475² × 27.441 / (2680 × 108) = 0.010403 mm/N, 96.1 N/mm, softer than a leaf along its length (EA/L = 450.24
  // N/mm): the frame gives most of the squeeze. Base 20: a = 17.475, I = 4000, 0.00078173 mm/N, 1279 N/mm, 2.8 times a leaf
  const p = { length: 30, angle: 8, thickness: 0.84, width: 6, fillet: 0 };
  const thin = tiltedBistableModel({ ...p, base: 6 }, plaG, { steps: 40 });
  assert.ok(thin.rigid.bistable && thin.rigid.back.force < -1.5, `on a rigid frame it snaps over (${thin.rigid.back.force} N back)`);
  assert.equal(thin.bistable, false, 'on the 6 mm bar it springs back');
  const snap = thin.findings.find((x) => x.code === 'bistable.snap');
  assert.equal(snap.level, 'fail'); assert.match(snap.text, /On a rigid frame it would .* the frame's 6 mm bar bends .* a deeper base/);
  // the default bar (20) keeps over half the rigid frame's pull back, and says so; 12 keeps less, and warns
  const deep = tiltedBistableModel(p, plaG, { steps: 40 }), kept = deep.back.force / deep.rigid.back.force;
  assert.ok(deep.bistable && kept >= 0.5 && kept < 1, `the default keeps ${kept}`);
  assert.equal(deep.findings.find((x) => x.code === 'bistable.frame').level, 'pass');
  const mid = tiltedBistableModel({ ...p, base: 12 }, plaG, { steps: 40 }), fr = mid.findings.find((x) => x.code === 'bistable.frame');
  assert.ok(mid.bistable); assert.equal(fr.level, 'warn'); assert.match(fr.text, /A deeper base, or the blocks screwed down flat/);
  assert.ok(mid.back.force > deep.back.force, 'a shallower bar pulls back less');
  assert.match(deep.rests.join(' '), /sat on its two blocks/);
});

test('the slider-crank\'s and four-bar\'s results carry everything their declared types name', async () => {
  const { sliderCrankModel, fourBarModel } = await import('@rulecad/flexures'), fs = await import('node:fs');
  const src = fs.readFileSync(new URL('./linkages.mjs', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  // the names at the top level of the @returns {{ ... }} just above `export function <name>`
  const declared = (name) => {
    const at = src.indexOf(`export function ${name}(`), doc = src.slice(src.lastIndexOf('/**', at), at), from = doc.indexOf('@returns {{') + 10;
    const keys = []; let depth = 0, word = '';
    for (const c of doc.slice(from)) {
      if ('{(['.includes(c)) depth++; else if ('})]'.includes(c)) { depth--; if (depth === 0) break; }
      if (depth === 1 && /[\w$]/.test(c)) word += c; else { if (depth === 1 && c === ':' && word) keys.push(word); if (!/[\w$?]/.test(c)) word = ''; }
    }
    return keys;
  };
  const slider = sliderCrankModel({ crank: 15, coupler: 35, angle: 100, width: 6, flex: flex0, guide: { length: 25, thickness: 0.84 } }, plaG);
  const four = fourBarModel({ ground: 40, crank: 15, coupler: 40, rocker: 30, angle: 60, width: 6, flex: flex0 }, plaG);
  for (const [name, m] of [['sliderCrankModel', slider], ['fourBarModel', four]]) {
    const keys = declared(name);
    assert.ok(keys.length > 10, `${name} declares ${keys}`);
    for (const key of keys) assert.ok(m[key] !== undefined, `${name} declares ${key}, which its result lacks`);
  }
  assert.ok(declared('fourBarModel').includes('solve') && !declared('sliderCrankModel').includes('solve'));
});

test('latticeCell: a honeycomb\'s and a re-entrant honeycomb\'s moduli, Poisson\'s ratios and wall strains are Gibson and Ashby\'s; bad cells are refused by name', () => {
  const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} against ${b}`);
  // A regular honeycomb: l = h = 6, θ = 30°, t = 0.84, E = 1810. t/l = 0.14, (t/l)³ = 0.002744, h/l + sin θ = 1.5.
  //   E1 = E2 = 1810 × 0.002744 × cos 30 / (1.5 × sin² 30) = 1810 × 0.002744 × 2.309401 = 11.4700 MPa; ν = 1
  //   G12 = 1810 × 0.002744 × 1.5 / (1 × 3 × cos 30) = 2.8675; density 0.14 × 3 / (2 cos 30 × 1.5) = 0.161658
  //   a wall's strain for a strain along y: 3 × 0.14 × 1.5 / cos 30 = 0.727461
  //   buckling along y: 1810 × 0.686² π² × 0.002744 / (24 × 1 × cos 30) = 1.10986 MPa (Gibson and Ashby's 0.22 E (t/l)³)
  const pet = { E: 1810 }, reg = latticeCell({ slant: 6, upright: 6, angle: 30, thickness: 0.84, depth: 6 }, pet);
  near(reg.E1, 11.4700, 1e-3, 'E1'); near(reg.E2, 11.4700, 1e-3, 'E2'); near(reg.nu12, 1, 1e-12, 'nu12'); near(reg.nu21, 1, 1e-12, 'nu21');
  near(reg.G12, 2.8675, 1e-3, 'G12'); near(reg.density, 0.161658, 1e-5, 'density'); near(reg.wall2, 0.727461, 1e-5, 'wall2'); near(reg.buckle2, 1.10986, 1e-4, 'buckle2');
  near(reg.buckle2 / (1810 * 0.14 ** 3), 0.2234, 1e-3, 'the 0.22 of a regular cell');
  // Re-entrant: l = 6, h = 9, θ = −30°: h/l + sin θ = 1.5 − 0.5 = 1.
  //   E2 = 1810 × 0.002744 × 1 / cos³ 30 = 7.6466; E1 = 1810 × 0.002744 × cos 30 / (1 × 0.25) = 17.2049
  //   ν12 = cos² 30 / (1 × −0.5) = −1.5; ν21 = −0.5 / 0.75 = −0.6667. E1 ν21 = E2 ν12 (both −11.47), as they must
  const re = latticeCell({ slant: 6, upright: 9, angle: -30, thickness: 0.84, depth: 6 }, pet);
  near(re.E2, 7.6466, 1e-3, 'E2'); near(re.E1, 17.2049, 1e-3, 'E1'); near(re.nu12, -1.5, 1e-12, 'nu12'); near(re.nu21, -2 / 3, 1e-12, 'nu21');
  near(re.E1 * re.nu21, re.E2 * re.nu12, 1e-9, 'reciprocity'); assert.ok(re.reentrant && !reg.reentrant);
  // its narrowest opening: top point to bottom point, 9 − 2 × 6 × 0.5 − 0.84 / cos 30 = 2.03005
  near(re.gap, 2.03005, 1e-4, 'gap');
  const code = (fn) => { try { fn(); } catch (e) { return e.code; } return 'none'; };
  const cell = { slant: 6, upright: 6, angle: 30, thickness: 0.84, depth: 6 };
  assert.equal(code(() => latticeCell({ ...cell, angle: 0 }, pet)), 'lattice.angle');
  assert.equal(code(() => latticeCell({ ...cell, angle: 90 }, pet)), 'lattice.angle');
  assert.equal(code(() => latticeCell({ ...cell, angle: -30, upright: 5 }, pet)), 'lattice.cross', 'uprights under 2 × 6 × sin 30 = 6 let the points cross');
  assert.equal(code(() => latticeCell({ ...cell, thickness: 11 }, pet)), 'lattice.thick');
  assert.equal(code(() => latticeCell({ ...cell, slant: -1 }, pet)), 'lattice.size');
  assert.equal(code(() => latticeCell(cell, {})), 'lattice.material');
  assert.equal(code(() => latticeBlockModel({ ...cell, across: 1.5, rows: 2 }, pet)), 'lattice.count');
  assert.equal(code(() => latticeBlockModel({ ...cell, across: 2, rows: 2, ends: 'glued' }, pet)), 'lattice.ends');
  assert.match(String((() => { try { latticeCell({ ...cell, angle: -30, upright: 5 }, pet); } catch (e) { return e.message; } })()), /over 2 l \|sin θ\| = 6\.000 mm/);
});

test('latticeBlockModel: a wide block between sliding plates comes to Gibson and Ashby\'s E2, Poisson\'s ratio, wall strain and buckling; bonded plates stiffen a short block', () => {
  const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} against ${b}`), pet = { E: 1810 };
  // Thin walls (t / l = 0.033, so the walls' stretch the formulas leave out is small), 32 cells across, plates that
  // press without holding the walls across: the frame of beams is within 2.5% of E2 b W / H, the side edges' half
  // cells taking the rest, and within 1% of ν21 and of the wall strain 3 (t/l)(h/l + sin θ) / cos θ per strain
  for (const [angle, h] of [[30, 6], [-30, 9]]) {
    const m = latticeBlockModel({ slant: 6, upright: h, angle, thickness: 0.2, depth: 10, across: 32, rows: 2, ends: 'sliding' }, pet), H = 2 * (h + 6 * Math.sin((angle * Math.PI) / 180));
    near(m.stiffness / m.estimate, 0.985, 0.012, `${angle}°: the frame's stiffness over Gibson and Ashby's`);
    near(m.poisson, m.cell.nu21, 0.01 * Math.abs(m.cell.nu21), `${angle}°: Poisson's ratio`);
    near((m.strain(0.01) * H) / 0.01 / m.cell.wall2, 1, 0.01, `${angle}°: the walls' strain`);
  }
  // more cells across, less of the side edges: the ratio climbs towards 1
  const r = (n) => { const m = latticeBlockModel({ slant: 6, upright: 6, angle: 30, thickness: 0.2, depth: 10, across: n, rows: 2, ends: 'sliding' }, pet); return m.stiffness / m.estimate; };
  assert.ok(r(8) < r(16) && r(16) < 1);
  // buckling of a regular honeycomb, 4 × 4 cells between sliding plates: Gibson and Ashby's 0.22 E (t/l)³ over the
  // block's face, to 3% (the frame's walls each cut in four)
  const b = latticeBlockModel({ slant: 6, upright: 6, angle: 30, thickness: 0.42, depth: 10, across: 4, rows: 4, ends: 'sliding' }, pet);
  near(b.buckling.force / (b.cell.buckle2 * b.size[0] * 10), 1, 0.03, 'buckling');
  near(b.buckling.travel, b.buckling.force / b.stiffness, 1e-9, 'the travel it buckles at');
  // bonded plates (the default) hold the walls' ends from sliding across: a block 8 cells wide and 2 rows tall, whose
  // cells want to spread (ν = 1), is several times stiffer than the formula says; sliding, it is a little softer
  const wide = { slant: 6, upright: 6, angle: 30, thickness: 0.84, depth: 10, across: 8, rows: 2 };
  const bonded = latticeBlockModel(wide, pet), sliding = latticeBlockModel({ ...wide, ends: 'sliding' }, pet);
  assert.ok(bonded.stiffness / bonded.estimate > 4, `bonded ${bonded.stiffness / bonded.estimate}`);
  near(sliding.stiffness / sliding.estimate, 0.875, 0.01, 'sliding');
  // a re-entrant block draws its sides in; a honeycomb bulges them
  assert.ok(bonded.poisson > 0 && latticeBlockModel({ ...wide, upright: 9, angle: -30 }, pet).poisson < 0);
});

test('latticeBlock: the block\'s shape weighs what its model says, each inside corner rounded, and the bench\'s spring block is sized for its load with twice the margin', async () => {
  const fs = await import('node:fs');
  const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} against ${b}`);
  const petg = { E: 1810, strainLimit: 34 / 1810 / 1.5, density: 1.27, name: 'PETG' };
  // One cell across, two rows (honeycomb l = h = 6, θ = 30, t = 0.84, depth 6): the openings have 4 inside corners
  // of 90° at the plates (the half cells' uprights) and 14 of 120° (3 in each half cell, 4 in each of the two side
  // cells of the middle row, whose outer corners the sides cut off). Rounding a corner of angle φ to r = 0.42 with n
  // chords over its turn α = 180° − φ adds r² (cot(φ/2) − (n/2) sin(α/n)) of wall:
  //   90°, n = 6: 0.1764 × (1 − 3 sin 15°) = 0.1764 × 0.223543 = 0.039433
  //   120°, n = 4: 0.1764 × (0.577350 − 2 sin 15°) = 0.1764 × 0.059712 = 0.010533
  //   (4 × 0.039433 + 14 × 0.010533) × 6 deep = 1.83118 mm³
  const one = { slant: 6, upright: 6, angle: 30, thickness: 0.84, depth: 6, across: 1, rows: 2 };
  const rounded = latticeBlockModel(one, petg), sharp = latticeBlockModel({ ...one, fillet: 0 }, petg);
  near(rounded.volume - sharp.volume, 1.83118, 1e-4, 'the rounds');
  // the bench's block: re-entrant, l 10, h 15, θ −20°, two lines thick, 6 deep, 2 across, 4 rows, 3 mm plates
  const bench = { slant: 10, upright: 15, angle: -20, thickness: 0.84, depth: 6, across: 2, rows: 4, plate: 3 };
  const g = latticeBlock(bench), m = latticeBlockModel(bench, petg), box = measureBoundingBox(g);
  near(measureVolume(g), m.volume, 1e-6 * m.volume, 'the shape\'s volume is the model\'s');
  assert.ok(onePiece(g), 'one piece');
  // its box: x from −l cos 20 − t/2 = −9.8169 to 3 l cos 20 + t/2 = 28.6108; y from −3 to 4 (15 − 10 sin 20) + 3 = 49.3192
  near(box[0][0], -9.8169, 1e-4, 'x0'); near(box[1][0], 28.6108, 1e-4, 'x1'); near(box[0][1], -3, 1e-9, 'y0'); near(box[1][1], 49.3192, 1e-4, 'y1');
  // sized for 5 N: 5.09 N/mm takes it 0.98 mm, and the walls reach PETG's 1.25% at 2.03 mm (2.06 times); they buckle
  // at 30.3 N (6 times the load); its sides draw in 0.45 for each unit it is pressed; 3.72 g
  const travel = 5 / m.stiffness;
  near(m.stiffness, 5.086, 0.005, 'stiffness'); near(m.travel(petg.strainLimit), 2.029, 0.005, 'travel to the limit');
  near(m.travel(petg.strainLimit) / travel, 2.06, 0.01, 'margin'); near(m.buckling.force, 30.3, 0.1, 'buckling');
  near(m.poisson, -0.448, 0.005, 'Poisson'); near(m.grams, 3.72, 0.005, 'grams');
  const printer = { line: 0.42, layer: 0.2, wall_min: 0.84 }, found = latticeFindings({ ...bench, travel }, printer, petg, m), by = (c) => found.find((f) => f.code === c);
  for (const c of ['lattice.lines', 'lattice.gap', 'lattice.direction', 'lattice.strain', 'lattice.buckle']) assert.equal(by(c)?.level, 'pass', c);
  assert.match(by('lattice.strain').text, /pressed 0\.98 mm, the walls see 0\.61% strain, within PETG limit of 1\.25% \(2\.06 times\)/);
  const far = latticeFindings({ ...bench, travel: 3 }, printer, petg, m);
  assert.equal(far.find((f) => f.code === 'lattice.strain').level, 'fail'); assert.match(far.find((f) => f.code === 'lattice.strain').text, /at most 2\.03 mm/);
  assert.equal(latticeFindings({ ...bench, travel: 7 }, printer, petg, m).find((f) => f.code === 'lattice.buckle').level, 'warn');
  assert.equal(latticeFindings({ ...bench, thickness: 0.5 }, printer).find((f) => f.code === 'lattice.lines').level, 'fail');
  assert.equal(latticeFindings({ ...bench, thickness: 1 }, printer).find((f) => f.code === 'lattice.lines').level, 'warn');
  assert.equal(latticeFindings({ ...bench, depth: 6.1 }, printer).find((f) => f.code === 'lattice.layers').level, 'warn');
  assert.equal(latticeFindings({ ...bench, upright: 8 }, printer).find((f) => f.code === 'lattice.gap').level, 'fail', 'the points 8 − 6.840 − 0.894 = 0.266 apart, under two lines');
  // the bench object's rules say the model's figures
  const obj = JSON.parse(fs.readFileSync(new URL('../../examples/bench/projects/flexures/objects/lattice.json', import.meta.url), 'utf8').replace(/\r\n/g, '\n')), V = obj.variables;
  for (const k of ['slant', 'upright', 'angle', 'depth', 'across', 'rows', 'plate']) assert.equal(V[k].value, bench[k], k);
  assert.equal(V.thickness.value, 'x1c.line * 2');
  assert.ok(V.load.rule.includes(`takes it ${travel.toFixed(2)} mm`) && V.load.rule.includes(`go ${m.travel(petg.strainLimit).toFixed(2)} mm`) && V.load.rule.includes(`(${(m.travel(petg.strainLimit) / travel).toFixed(2)} times the margin)`), V.load.rule);
});

test('latticeCell: an ordinary honeycomb\'s narrowest opening runs straight across between its parallel slanted walls, and lattice.gap reads it', () => {
  const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} against ${b}`), pet = { E: 1810 };
  // l 1.8, h 0.2, θ 60, t 0.84. Up y between the points: 0.2 + 2 × 1.8 × 0.8660 − 0.84 / 0.5 = 1.638 mm. Across x
  // between the uprights: 2 × 1.8 × 0.5 − 0.84 = 0.96 mm. Straight across between two opposite slanted walls, along
  // their normal (sin θ, cos θ): cos 60 × (0.2 + 2 × 1.8 × sin 60) − 0.84 = 0.5 × 3.3177 − 0.84 = 0.819 mm, the narrowest,
  // and under two 0.42 mm lines (0.84 mm), so the walls print joined
  const thin = { slant: 1.8, upright: 0.2, angle: 60, thickness: 0.84, depth: 4 };
  near(latticeCell(thin, pet).gap, 0.8188, 1e-3, 'slanted walls set the gap');
  const g = latticeFindings(thin, { line: 0.42, layer: 0.2 }).find((f) => f.code === 'lattice.gap');
  assert.equal(g.level, 'fail'); assert.match(g.text, /0\.82 mm, under two lines/);
  // thin walls (t 0.01): l 5, h 1, θ 60 gives 0.5 × (1 + 10 × 0.8660) − 0.01 = 4.820, under 2 × 2.5 − 0.01 = 4.99;
  // l 5, h 2, θ 45 gives 0.7071 × (2 + 10 × 0.7071) − 0.01 = 6.404, under 2 × 3.5355 − 0.01 = 7.061
  near(latticeCell({ slant: 5, upright: 1, angle: 60, thickness: 0.01, depth: 4 }, pet).gap, 4.820, 1e-3, 'l5 h1 θ60');
  near(latticeCell({ slant: 5, upright: 2, angle: 45, thickness: 0.01, depth: 4 }, pet).gap, 6.4036, 1e-3, 'l5 h2 θ45');
  // a regular cell is the same width each way: 2 × 6 × cos 30 − 0.84 = 9.552
  near(latticeCell({ slant: 6, upright: 6, angle: 30, thickness: 0.84, depth: 6 }, pet).gap, 9.5523, 1e-3, 'regular');
});

test('corner-filleted and hyperbolic hinges: the fillet hinge is a strip EI / l when its rounds are small and the circular notch when its flat is; it turns four times as far as a notch as deep; the hyperbola is the stiff, precise end', async () => {
  const { filletHinge, filletHingeModel, hyperbolicHinge, hyperbolicHingeModel } = await import('@rulecad/flexures');
  // Rounds of 0.001 mm on a 4 mm flat, 0.84 thick, 8 wide: a strip. I = 8 × 0.84³ / 12 = 0.395136 mm⁴, EI / l =
  // 2680 × 0.395136 / 4 = 264.74 N·mm a radian; its strain tθ / 2l times 1.2 for the corners, so 2% at
  // θ = 2 × 4 × 0.02 / (0.84 × 1.2) = 0.1587 rad
  const strip = filletHingeModel({ flex: 4, radius: 0.001, neck: 0.84, width: 8 }, pla);
  near(strip.stiffness, 264.74, 0.3, 'a strip\'s EI / l'); near(strip.angle(0.02), 0.1587, 0.0005, 'a strip\'s angle at 2%');
  // No flat: the neck is two quarter circles, the circular notch of the same radius (the elliptical hinge with equal axes)
  near(filletHingeModel({ flex: 0.001, radius: 1.5, neck: 0.84, width: 8 }, pla).stiffness, ellipticalHingeModel({ along: 1.5, across: 1.5, neck: 0.84, width: 8 }, pla).stiffness, 2, 'no flat is the circle');
  // A 4 mm flat with 1.5 mm rounds against a circular notch 1.5 mm deep: the same bar, four times the angle at 2%
  const fillet = filletHingeModel({ flex: 4, radius: 1.5, neck: 0.84, width: 8 }, pla), notch = notchHingeModel({ radius: 1.5, neck: 0.84, width: 8 }, pla);
  assert.ok(fillet.angle(0.02) > 3.5 * notch.angle(0.02) && fillet.stiffness < notch.stiffness / 3.5, `${fillet.angle(0.02)} rad against ${notch.angle(0.02)}`);
  assert.ok(Math.abs(fillet.strain(fillet.angle(0.02)) - 0.02) < 1e-12 && fillet.travel === fillet.angle);
  // The hyperbola against an ellipse of the same length and depth: stiffer, less angle at the same strain
  const hyp = hyperbolicHingeModel({ along: 4, across: 2, neck: 0.84, width: 8 }, pla), ell = ellipticalHingeModel({ along: 4, across: 2, neck: 0.84, width: 8 }, pla);
  assert.ok(hyp.stiffness > 2 * ell.stiffness && hyp.angle(0.02) < ell.angle(0.02) / 2, `${hyp.stiffness} against ${ell.stiffness}`);
  // Drawn: one piece, the bar t + 2r high, arms of 4r (at least 3) each side; the hyperbola's bar t + 2b
  const a = filletHinge({ flex: 4, radius: 1.5, neck: 0.84, width: 8 }), ba = measureBoundingBox(a);
  assert.ok(onePiece(a) && Math.abs(ba[1][1] - ba[0][1] - 3.84) < 1e-6 && Math.abs(ba[1][0] - 19) < 1e-6, 'arms of 6, a notch of 4 + 2 × 1.5');
  const h = hyperbolicHinge({ along: 4, across: 2, neck: 0.84, width: 8 }), bh = measureBoundingBox(h);
  assert.ok(onePiece(h) && Math.abs(bh[1][1] - bh[0][1] - 4.84) < 1e-6 && Math.abs(bh[1][0] - 40) < 1e-6, 'arms of 16, a notch of 8');
  // The thinnest neck is the neck: no slice of either is thinner than t
  const thinnest = (g) => { const p = jscad.geometries.geom3.toPolygons(g).flatMap((q) => q.vertices).filter((v) => v[1] > 0); return Math.min(...p.map((v) => v[1])); };
  near(thinnest(a), 0.42, 1e-6, 'the fillet hinge\'s neck'); near(thinnest(h), 0.42, 1e-6, 'the hyperbola\'s neck');
  assert.throws(() => filletHingeModel({ flex: 4, radius: 1.5, neck: 0.84, width: 8 }, { ...pla, concentration: 0.5 }), /concentration is a factor of 1 or more/);
  assert.throws(() => hyperbolicHinge({ along: 0, across: 2, neck: 0.84, width: 8 }), /hyperbolicHinge: along is a size above 0/);
});

test('a spiral spring: the model is the beam solver\'s within 1% held at its hub\'s centre or floating, thickened ends, one piece flat with its coils apart', async () => {
  const { spiralSpring, spiralSpringModel, spiralPath, beamSystem, equilibrium } = await import('@rulecad/flexures');
  for (const p of [{ hub: 4, turns: 3, pitch: 2.5, thickness: 0.84, width: 6 }, { hub: 3, turns: 2, pitch: 2, thickness: 0.84, width: 6 }]) {
    // the strip as the solver's beams, span by span at the drawn thickness, its outer end fixed, the hub turned a milliradian
    const sp = spiralPath(p), th = sp.path.slice(1).map((_, i) => (sp.thickness[i] + sp.thickness[i + 1]) / 2);
    const sys = beamSystem({ bodies: { rim: { at: [0, 0], fixed: true }, hub: { at: [0, 0] } }, segments: 1, beams: [{ name: 's', path: sp.path, thickness: th, width: p.width, E: pla.E, from: 'hub', to: 'rim' }] });
    const d = sys.body.hub.dof, held = equilibrium(sys, { held: new Map([[d, 0], [d + 1, 0], [d + 2, 1e-3]]) }), free = equilibrium(sys, { held: new Map([[d + 2, 1e-3]]) });
    const m = spiralSpringModel(p, pla), f = spiralSpringModel({ ...p, floating: true }, pla);
    near(m.stiffness / (held.reaction.get(d + 2) / 1e-3), 1, 0.01, `${p.turns} turns held: the model's stiffness over the solver's`);
    near(m.strain(1e-3) / held.strain.s, 1, 0.01, `${p.turns} turns held: the strain`);
    near(f.stiffness / (free.reaction.get(d + 2) / 1e-3), 1, 0.01, `${p.turns} turns floating: the stiffness`);
    near(f.strain(1e-3) / free.strain.s, 1, 0.01, `${p.turns} turns floating: the strain`);
    assert.ok(m.strain(1) > f.strain(1), 'holding the hub\'s centre bends the strip more on one side');
  }
  // Floating, the moment is even, so the strip's own stiffness is EI / L where it is t thick: L 146.3 mm, EI / L =
  // 2680 × 6 × 0.84³ / 12 / 146.28 = 5.43 N·mm a radian; the thickened ends (2t over a quarter turn each) add 11%
  const p = { hub: 4, turns: 3, pitch: 2.5, thickness: 0.84, width: 6 }, f = spiralSpringModel({ ...p, floating: true }, pla);
  near(f.length, 146.28, 0.05, 'the strip\'s length'); near(f.stiffness / ((pla.E * 6 * 0.84 ** 3) / 12 / f.length), 1.108, 0.01, 'EI / L and the ends');
  // Its strain is the even moment's t θ / 2L where the strip is thinnest: 0.84 / (2 × 146.28) = 0.002871 a radian, times
  // the moment's share there: T / (EI / L) = 1.108
  near(f.strain(1), (1.108 * 0.84) / (2 * 146.28), 2e-5, 'the floating strain a radian');
  // The coils' least gap at rest is by the thickened ends: radially 2.5 - 1.5 × 0.84 = 1.24 mm, and across the coils,
  // which cross a radius on the slant, a little less: 1.2326 mm measured on the outline
  const m = spiralSpringModel(p, pla); near(m.gap, 1.2326, 1e-4, 'the gap');
  const shape = spiralSpring(p), box = measureBoundingBox(shape);
  assert.ok(onePiece(shape), 'hub, strip and boss as one piece');
  near(box[1][2] - box[0][2], 6, 1e-6, 'as tall as its width');
  // the strip's centreline ends at r = 4 + 3 × 2.5 = 11.5 on +x; the boss (radius 2 × 0.84 = 1.68, at least 2) reaches
  // in to its inner face, so out to 11.5 - 0.84 + 2 × 2 = 14.66
  near(box[1][0], 14.66, 0.01, 'the boss outside the last coil');
  assert.throws(() => spiralSpring({ ...p, pitch: 1.2 }), /pitch 1\.2 mm must be more than 1\.5 × the thickness \(1\.26 mm\)/);
  assert.throws(() => spiralSpringModel({ ...p, turns: 0.5 }, pla), /turns is 1\.25 or more/);
  assert.throws(() => spiralSpring({ ...p, hub: 0.5 }), /hub's radius 0\.5 mm must be more than the thickness/);
});

test('a pinned-pinned leaf: a stiff link on two filleted pivots, the beam solver\'s stiffness within 1% and the pseudo-rigid-body 2K / Lp² within 5%; stiff along itself', async () => {
  const { pinnedLeaf, pinnedLeafModel, beamSystem, equilibrium } = await import('@rulecad/flexures');
  const p = { length: 20, flex: 3, thickness: 0.84, width: 8 }, m = pinnedLeafModel(p, pla);
  // the link 3 × 0.84 = 2.52 thick, rounds (2.52 - 0.84) / 2 = 0.84, each pivot 3 + 2 × 0.84 = 4.68 long, 29.36 in all
  const T = 2.52, r = 0.84, piv = 4.68, span = 29.36, N = 400, neck = (x) => { const d = x < r ? r - x : x > r + 3 ? x - r - 3 : 0; return 0.42 + r - Math.sqrt(Math.max(0, r * r - d * d)); };
  const half = (s) => (s < piv ? neck(s) : s <= piv + 20 ? T / 2 : neck(s - piv - 20));
  const path = Array.from({ length: N + 1 }, (_, i) => [(span * i) / N, 0]), tk = Array.from({ length: N }, (_, i) => 2 * half(((i + 0.5) * span) / N));
  const sys = beamSystem({ bodies: { g: { at: [0, 0], fixed: true }, e: { at: [span, 0] } }, segments: 1, beams: [{ name: 'l', path, thickness: tk, width: 8, E: pla.E, from: 'g', to: 'e' }] });
  const d = sys.body.e.dof, res = equilibrium(sys, { held: new Map([[d, 0], [d + 1, 0.01], [d + 2, 0]]) });
  near(m.stiffness / (res.reaction.get(d + 1) / 0.01), 1, 0.01, 'the guided stiffness against the solver');
  near(m.strain(0.01) / res.strain.l, 1, 0.01, 'the strain against the solver');
  // The pseudo-rigid-body model: pivots K 24.68 mm apart (20 + 4.68), the link turning δ / Lp, each pivot through it:
  // k = 2K / Lp² = 2 × 273.7 / 24.68² = 0.899 N/mm, against the integrated 0.873
  near(m.apart, 24.68, 1e-9, 'pivot to pivot'); near(m.stiffness / ((2 * m.pivot) / m.apart ** 2), 1, 0.05, 'the PRBM');
  // Along it: each pivot's 3 mm flat 0.84 × 8 in series with the link 20 × 2.52 × 8 and the rounds: under
  // 1 / (2 × 3 / (2680 × 8 × 0.84) + 20 / (2680 × 8 × 2.52)) = 2122 N/mm, over a thousand times its sideways stiffness
  assert.ok(m.along < 2122 && m.along > 1000 * m.stiffness, `${m.along} N/mm along`);
  const shape = pinnedLeaf(p), box = measureBoundingBox(shape);
  assert.ok(onePiece(shape), 'blocks, pivots and link as one piece');
  near(box[1][0], 3 + 29.36 + 3, 1e-6, 'blocks of 3 either end'); near(box[1][1] - box[0][1], 2.52, 1e-6, 'as high as the link');
  assert.throws(() => pinnedLeafModel({ ...p, link: 1 }, pla), /link \(1 mm\) must be at least 1\.5 × the necks' thickness/);
});

test('an XY stage: two parallel guides in series at right angles, each axis one guide\'s stiffness, each guide\'s drop the other axis\'s stray; one piece', async () => {
  const { xyStage, xyStageModel } = await import('@rulecad/flexures');
  const p = { length: 30, thickness: 1.26, width: 8, gap: 10 }, m = xyStageModel(p, pla);
  // Each axis 2 E w t³ / L³ = 2 × 2680 × 8 × 1.26³ / 30³ = 3.1769 N/mm; along its leaves 2 E w t / L =
  // 2 × 2680 × 8 × 1.26 / 30 = 1800.96 N/mm
  near(m.stiffness[0], 3.1769, 1e-4, 'x'); near(m.stiffness[1], 3.1769, 1e-4, 'y'); near(m.across, 1800.96, 1e-6, 'across');
  // At [2, 1] mm: the second guide drops 3 × 2² / (5 × 30) = 0.08 mm along y, the first 3 × 1² / 150 = 0.02 along x
  const s = m.parasitic([2, 1]); near(s[0], -0.02, 1e-12, 'stray along x'); near(s[1], -0.08, 1e-12, 'stray along y');
  // The strain is the worse axis's: a guided leaf's 3tδ / L², 3 × 1.26 × 2 / 900 = 0.0084 at 2 mm
  near(m.strain([2, -1]), 0.0084, 1e-12, 'the strain at 2 mm');
  const shape = xyStage({ ...p, fillet: 1.26 }), box = measureBoundingBox(shape);
  assert.ok(onePiece(shape), 'both guides and the stage as one piece');
  // The first guide's base at x = -3; its shuttle 10 + 2 × 1.26 + 2 × 1.26 = 15.04 wide at x = 30, so out to 45.04;
  // the second's leaves rise 30 from the shuttle's top (7.52) to the stage, 3 deep: 40.52
  near(box[0][0], -3, 1e-6, 'the base'); near(box[1][0], 45.04, 1e-6, 'the shuttle'); near(box[1][1], 40.52, 1e-6, 'the stage');
  assert.throws(() => xyStage({ ...p, gap: 0 }), /xyStage: gap is a size above 0/);
});

test('a split tube: Saint-Venant torsion of the open section by hand, a hundred times softer than the closed tube, and a warning that its twist shears the layers', async () => {
  const { splitTube, splitTubeModel } = await import('@rulecad/flexures');
  const p = { radius: 5, thickness: 0.84, length: 20, slot: 1 }, m = splitTubeModel(p, pla);
  // G = 2680 / (2 × 1.36) = 985.29 MPa; J = (2π × 5 - 1) × 0.84³ / 3 = 6.0092 mm⁴; k = G J / L = 296.04 N·mm a radian.
  // The peak shear G t θ / L as a tensile strain √3 G t / (L E) = 0.026745 a radian, so 2% at 0.7478 rad (42.8°)
  near(m.stiffness, 296.04, 0.01, 'k'); near(m.strain(1), 0.026745, 1e-6, 'the strain a radian'); near(m.angle(0.02), 0.7478, 1e-4, 'the angle at 2%');
  // Closed, J = 2π r³ t = 659.73 mm⁴: 32,502 N·mm a radian, 110 times as stiff
  near(m.closed, 32501.6, 0.1, 'closed'); assert.ok(m.closed / m.stiffness > 100);
  assert.deepEqual(m.findings.map((f) => [f.level, f.code]), [['warn', 'flexure.layers']]);
  const shape = splitTube(p), box = measureBoundingBox(shape);
  assert.ok(onePiece(shape), 'one piece: the collars join it round the slot');
  near(box[1][2], 26, 1e-6, 'a 20 mm slot between collars of 3'); near(box[1][0], 5.42, 1e-6, 'the wall out to r + t / 2');
  const found = printCheck(jscad.geometries.geom3.toPolygons(shape).map((q) => q.vertices), { bed: 256, overhang: 45, layer: 0.2, support_gap: 0.2, bridge: 5 });
  assert.deepEqual(found.filter((f) => f.level !== 'pass').map((f) => f.code), [], 'it prints standing without support');
  assert.throws(() => splitTubeModel({ ...p, slot: 20 }, pla), /slot \(20 mm\) must be under half the tube's round/);
  assert.throws(() => splitTube({ ...p, thickness: 6 }), /wall \(6 mm\) must be thinner than the tube's mean radius/);
});

test('the new flexures have ports and models by name, so a report checks them and a lamina can place them', async () => {
  const { ports, models, report, lamina } = await import('@rulecad/flexures');
  const kinds = { filletHinge: { flex: 4, radius: 1.5, neck: 0.84, width: 8 }, hyperbolicHinge: { along: 4, across: 2, neck: 0.84, width: 8 }, spiralSpring: { hub: 4, turns: 3, pitch: 2.5, thickness: 0.84, width: 6 }, pinnedLeaf: { length: 20, flex: 3, thickness: 0.84, width: 8 } };
  for (const [kind, p] of Object.entries(kinds)) {
    const q = ports(kind, p); assert.ok(q.root && q.end && q.moves && models[kind], kind);
    const past = models[kind](p, pla).travel(0.03), r = report([{ name: kind, kind, params: p, travel: past, angle: past }], { line: 0.42, layer: 0.2 }, pla);
    assert.ok(r.findings.some((x) => x.level === 'fail' && x.text.includes('% strain')) && !r.ok, `${kind}: past its limit fails`);
  }
  near(ports('filletHinge', kinds.filletHinge).pivot.at[0], 9.5, 1e-9, 'the fillet hinge turns about its flat\'s middle');
  const sp = ports('spiralSpring', kinds.spiralSpring); near(sp.root.at[0], 14.66 - 2, 1e-9, 'the spiral\'s root at its boss'); assert.equal(sp.moves, 'turn');
  // A lamina places a fillet hinge between two bodies, and checks its strain like any hinge
  const rect = (x0, y0, x1, y1) => jscad.primitives.polygon({ points: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] });
  const made = await lamina({ height: 8, gap: 0.3, material: { E: 2680, strainLimit: 0.02 }, physics: false, ground: rect(-20, -5, 3, 5), bodies: { arm: rect(16, -3, 40, 3) },
    joints: { h: { kind: 'filletHinge', params: { flex: 4, radius: 1.5, neck: 0.84, arms: 6 }, from: 'ground', to: 'arm' } }, states: { bent: { h: 20 } }, sequence: ['rest', 'bent'] }); // degrees: past the 11.9° that 2% allows
  assert.ok(made.findings.some((x) => x.code === 'lamina.strain' && x.level === 'fail'), made.findings.filter((x) => x.code === 'lamina.strain').map((x) => x.text).join('; '));
});

test('a spiral spring\'s coils never overlap: under 1.25 turns its thickened ends lie side by side and it is refused; the model\'s gap is the outline\'s; a lamina turns its hub in place', async () => {
  const { spiralSpring, spiralSpringModel, spiralPath, lamina } = await import('@rulecad/flexures');
  // Each end is 2t thick, thinning to t over a quarter turn. At 1 to 1.25 turns the two thickened ends lie a coil apart
  // side by side, so the coils there need the pitch to be over 2t, not 1.5t: 1 turn of 1 mm at a 1.6 mm pitch overlaps
  // by 1.6 - 2 × 1 = -0.4 mm, and 1.2 turns by 0.046 mm. Both pass a pitch over 1.5t, so the turns are refused
  for (const turns of [1, 1.2]) {
    assert.throws(() => spiralSpring({ hub: 4, turns, pitch: 1.6, thickness: 1, width: 6 }), /spiralSpring: turns is 1\.25 or more/);
    assert.throws(() => spiralSpringModel({ hub: 4, turns, pitch: 1.6, thickness: 1, width: 6 }, pla), /spiralSpringModel: turns is 1\.25 or more/);
  }
  // From 1.25 turns the thickened ends no longer lie side by side. At exactly 1.25, a point u of the way along the inner
  // end's quarter turn (thickness t(2 - s(u))) sits a coil inside a point with t(2 - s(1 - u)), and the smooth step has
  // s(u) + s(1 - u) = 1, so the two add to 3t: half each is 1.5t, and the gap radially is pitch - 1.5t = 1.6 - 1.5 =
  // 0.1 mm. The model's gap is checked against every pair of points on the
  // outline, so it is never more than the drawn least gap, and the drawn gap is over 0
  const least = (p) => { const { path, thickness } = spiralPath(p); let g = Infinity; for (let i = 0; i < path.length; i++) for (let j = i + 1; j < path.length; j++) { if (j - i < (path.length - 1) / p.turns / 2) continue; g = Math.min(g, Math.hypot(path[i][0] - path[j][0], path[i][1] - path[j][1]) - (thickness[i] + thickness[j]) / 2); } return g; };
  for (const p of [{ hub: 4, turns: 1.25, pitch: 1.6, thickness: 1, width: 6 }, { hub: 4, turns: 1.5, pitch: 1.6, thickness: 1, width: 6 }, { hub: 4, turns: 3, pitch: 2.5, thickness: 0.84, width: 6 }]) {
    const g = least(p), m = spiralSpringModel(p, pla);
    near(m.gap, g, 1e-6, `${p.turns} turns: the model's gap is the outline's`); assert.ok(g > 0, `${p.turns} turns: the coils are apart (${g})`);
  }
  near(spiralSpringModel({ hub: 4, turns: 1.25, pitch: 1.6, thickness: 1, width: 6 }, pla).gap, 0.1, 1e-3, '1.6 - 1.5 × 1');
  // In a lamina, its hub (a disc on the pivot) turns in place: the finite elements, which push a body along a line,
  // say so instead of failing on a push with no direction, and the coils' closing is a warning for the beam solver
  const rect = (x0, y0, x1, y1) => jscad.primitives.polygon({ points: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] });
  const made = await lamina({ height: 6, gap: 0.3, material: { E: 2680, strainLimit: 0.02 }, physics: false, ground: rect(12.5, -3, 30, 3), bodies: { hub: jscad.primitives.circle({ radius: 4 }) },
    joints: { s: { kind: 'spiralSpring', params: { hub: 4, turns: 3, pitch: 2.5, thickness: 0.84 }, from: 'ground', to: 'hub' } }, states: { wound: { s: 30 } }, sequence: ['rest', 'wound'] });
  const peak = made.findings.find((x) => x.code === 'lamina.peak'), coils = made.findings.find((x) => x.code === 'lamina.coils');
  assert.ok(peak && peak.level === 'info' && /hub turns in place/.test(peak.text), peak?.text);
  assert.ok(coils && coils.level === 'warn' && /1\.23 mm apart at rest/.test(coils.text), coils?.text);
  assert.ok(made.findings.some((x) => x.code === 'lamina.strain' && x.level === 'pass'), 'its strain is the model\'s, within the limit at 30°');
});

test('kirigami: a one-sided neck\'s stiffness and strain are the kit\'s finite elements, re-run here; the rotating-squares sheet turns, stretches and weighs as worked by hand', async () => {
  const f = await import('@rulecad/flexures'), fs = await import('node:fs'), { pathToFileURL, fileURLToPath } = await import('node:url');
  const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} against ${b}`);
  const petg = f.flexureMaterial({ modulus: 1810, strength: 34, name: 'PETG', density: 1.27 });
  // The table's row at r / w = 1 (k 0.04088, strain 0.2967 a radian), solved again on the same grid (25 cells across)
  const fe = f.neckFE(1);
  near(fe.stiffness, 0.04088, 0.0002, 'the stiffness over E b w², as tabulated'); near(fe.strain, 0.2967, 0.003, 'the peak strain a radian, as tabulated');
  assert.ok(fe.strain > 1.2 * fe.flat, `the round side is the notch: ${fe.strain} against ${fe.flat} on the straight side`);
  // A neck 0.84 wide, r 0.84, 2 deep in PETG (E 1810): k = 1810 × 2 × 0.84² × 0.04088 = 3620 × 0.7056 × 0.04088 = 104.42
  // N·mm a radian. Paros and Weisbord's thin neck (a one-sided notch as a two-sided one of radius 2r):
  // 2 E b w^2.5 / (9π √(2r)) = 2 × 1810 × 2 × 0.646695 / (28.2743 × 1.296148) = 127.76, stiffer as it leaves out the roots.
  // PETG's limit 34 / 1810 / 1.5 = 1.2523%, so the neck turns 0.012523 / 0.2967 = 0.042208 rad = 2.418°
  const n = f.neckHingeModel({ neck: 0.84, radius: 0.84, depth: 2 }, petg);
  near(n.stiffness, 104.42, 0.01, 'k by hand'); near(n.thinNeck, 127.76, 0.01, 'the thin-neck formula by hand');
  near(n.limit, 0.042208, 1e-5, 'the turn at the strain limit'); near(n.strain(0.01), 0.002967, 1e-9, 'strain a radian');
  // the thin-neck formula comes nearer as the round end grows: at r / w = 6, 2 / (9π √12) = 0.020418 against 0.01952
  const ratio = (rho) => f.neckHingeModel({ neck: 1, radius: rho, depth: 1 }, { E: 1 }).stiffness / f.neckHingeModel({ neck: 1, radius: rho, depth: 1 }, { E: 1 }).thinNeck;
  near(ratio(6), 0.01952 / 0.020418, 1e-4, 'at r / w = 6'); assert.ok(ratio(1) < ratio(3) && ratio(3) < ratio(6), 'nearer as r grows');
  // between rows, straight in log r and log k: at r / w = √1.5, halfway, √(0.04088 × 0.03507) = 0.037864
  near(f.neckHingeModel({ neck: 1, radius: Math.sqrt(1.5), depth: 1 }, { E: 1 }).stiffness, 0.037864, 1e-6, 'between rows');
  assert.throws(() => f.neckHingeModel({ neck: 0.84, radius: 0.25, depth: 2 }, petg), /kirigami\.radius: .*0\.298.*from 0\.42 to 5\.04 mm/);
  assert.throws(() => f.neckHingeModel({ neck: 0, radius: 1, depth: 2 }, petg), /kirigami\.size: neckHingeModel: neck/);
  // The sheet: pitch 10, necks 0.84, slots 1.68 (r 0.84), 2 thick, 6 by 6. Each square's necks sit d = r + w / 2 = 1.26
  // from its corners, going round, so they make a square of side s = √(8.74² + 1.26²) = √77.9752 = 8.830357, turned
  // α0 = atan(1.26 / 8.74) = 8.2035°; s (cos α0 + sin α0) = 8.74 + 1.26 = 10, the pitch
  const p = { pitch: 10, neck: 0.84, slot: 1.68, depth: 2, across: 6, rows: 6 }, m = f.rotatingSquaresModel(p, petg);
  near(m.side, 8.830357, 1e-6, 's'); near(m.rest, 8.20351, 1e-4, 'α0'); assert.equal(m.necks, 5 * 6 + 6 * 5); assert.equal(m.poisson, -1);
  // Grima and Evans: E = 8K / (s² b (1 - sin 2α0)); sin 2α0 = 2 × 1.26 × 8.74 / 77.9752 = 0.282459, so
  // 8 × 104.4186 / (77.9752 × 2 × 0.717541) = 835.349 / 111.900 = 7.4651 MPa: 242 times softer than PETG
  near(m.E, 7.4651, 1e-3, 'E by hand');
  // pulled by its sides: 60 necks' energy ½ K (2Δα)², width 6 s (cos α + sin α), so at rest 60 × 4K / (36 s² (cos α0 - sin α0)²)
  // = 25060.5 / (36 × (8.74 - 1.26)²) = 25060.5 / 2014.21 = 12.442 N/mm; a large sheet's E b rows / across is 14.93
  near(m.stiffness, 12.442, 1e-3, 'stiffness by hand'); near(m.at(0.001).force / 0.001, m.stiffness, 1e-3, 'the force curve starts at it');
  // the limit: each neck 2.418°, so the squares turn 1.2092° further, to α = 9.4127°: 6 s (cos α + sin α) - 60 =
  // 6 × 8.830357 × 1.150083 - 60 = 0.934 mm, 1.56% of the sheet
  const al = (8.20351 + 2.418322 / 2) * Math.PI / 180;
  near(m.limit.stretch, 6 * 8.830357 * (Math.cos(al) + Math.sin(al)) - 60, 1e-4, 'the stretch at the limit'); near(m.limit.stretch, 0.934, 1e-3, 'by hand');
  near(m.at(m.limit.stretch).strain, petg.strainLimit, 1e-6, 'the necks reach the limit there');
  // grams: the plate less 36 slots, each π r² + 4r (8.32 - 0.84) = 2.2167 + 25.1328 = 27.3495 mm², half where an edge
  // runs through it and a quarter at a corner: 25 + 20 / 2 + 4 / 4 = 36 whole ones, 984.58 mm², so 2615.42 mm²
  near(m.area, 3600 - 36 * (Math.PI * 0.84 ** 2 + 4 * 0.84 * 7.48), 1e-6, 'area'); near(m.area, 2615.42, 0.01, 'by hand');
  const g = f.rotatingSquares(p), box = measureBoundingBox(g);
  near(measureVolume(g) / m.volume, 1, 0.002, 'the shape weighs what the model says'); assert.ok(onePiece(g), 'one print');
  assert.deepEqual(box.map((c) => c.map((x) => +x.toFixed(6) + 0)), [[0, 0, 0], [60, 60, 2]]);
  // findings: the necks and slots in lines, a pull past the limit fails and says how far it may go
  const printer = { line: 0.42, layer: 0.2, wall_min: 0.84 }, by = (list, c) => list.find((x) => x.code === c);
  const ok = f.kirigamiFindings({ ...p, stretch: 0.4 }, printer, petg, m);
  assert.deepEqual(ok.filter((x) => x.level !== 'pass').map((x) => x.code), []);
  assert.match(by(f.kirigamiFindings({ ...p, stretch: 1.2 }, printer, petg, m), 'kirigami.strain').text, /over PETG limit of 1\.25%: at most 0\.93 mm/);
  assert.equal(by(f.kirigamiFindings({ ...p, neck: 0.6, slot: 1.2 }, printer), 'kirigami.neck').level, 'fail');
  assert.equal(by(f.kirigamiFindings({ ...p, slot: 0.8 }, printer), 'kirigami.slot').level, 'fail');
  assert.equal(by(f.kirigamiFindings({ ...p, depth: 2.1 }, printer), 'kirigami.layers').level, 'warn');
  assert.throws(() => f.rotatingSquares({ ...p, pitch: 2.5 }), /kirigami\.pitch: .*over 2\.52 mm/);
  assert.throws(() => f.rotatingSquaresModel({ ...p, rows: 1 }, petg), /kirigami\.count: rotatingSquaresModel: rows/);
  // fully open at 45°: 6 s √2 - 60 = 74.93 - 60 = 14.93 mm
  assert.throws(() => m.at(15), /kirigami\.stretch: .*fully open/);
  // the bench panel (examples/bench flexures/kirigami): built by its own main, sized for its 6 N pull with twice the margin
  const dir = new URL('../../examples/bench/projects/flexures/objects/', import.meta.url), json = JSON.parse(fs.readFileSync(new URL('kirigami.json', dir), 'utf8').replace(/\r\n/g, '\n')), V = json.variables;
  assert.equal(V.neck.value, 'x1c.line * 2'); assert.equal(V.slot.value, 'x1c.line * 4');
  const v = { ...Object.fromEntries(Object.entries(V).map(([k, x]) => [k, x.value])), neck: 0.84, slot: 1.68, flexures: f, petg: { modulus: 1810, strength: 34, density: 1.27 }, x1c: printer };
  const { main } = await import(pathToFileURL(fileURLToPath(new URL('kirigami.js', dir))).href), made = main(v), mech = made.mechanism;
  assert.deepEqual(made.findings.filter((x) => x.level !== 'pass').map((x) => x.code), [], 'every finding passes');
  const margin = by(made.findings, 'kirigami.strain').values.limit / by(made.findings, 'kirigami.strain').values.strain;
  assert.ok(margin >= 1.9 && margin <= 2.5, `about twice the margin: ${margin}`);
  near(by(made.findings, 'kirigami.strain').values.force, V.load.value, 1e-6, 'the stretch is the design pull\'s');
  assert.ok(V.load.rule.includes(`stretches it ${mech.stretch.toFixed(2)} mm`) && V.load.rule.includes(`stretched ${mech.limit.toFixed(2)} mm`) && V.load.rule.includes(`(${margin.toFixed(2)} times the margin)`), V.load.rule);
  assert.ok(onePiece(made.parts.sheet), 'the panel is one print');
  // the README's figures are the code's
  const readme = fs.readFileSync(new URL('./README.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  for (const line of [`m.E;            // ${m.E.toFixed(2)} MPa in its plane, ${Math.round(1810 / m.E)} times softer than PETG`, `m.stiffness;    // ${m.stiffness.toFixed(2)} N/mm pulled by its sides`,
    `m.limit;        // { stretch: ${m.limit.stretch.toFixed(2)} mm, turn: ${m.limit.turn.toFixed(2)}° at each neck, force: ${m.limit.force.toFixed(1)} N, sheet: ${(m.limit.sheet * 100).toFixed(2)}% }`, `m.grams;        // ${m.grams.toFixed(2)}`,
    `1.22 times at r / w = 1`, `turn further (${(petg.strainLimit / 0.1256 * 180 / Math.PI).toFixed(1)}° at r / w = 6)`]) assert.ok(readme.includes(line), `the README should read ${line}`);
  near(n.thinNeck / n.stiffness, 1.22, 0.005, 'the README\'s 1.22');
});

test('cells: a curved-beam cell\'s stiffness turns negative past its snap, Qiu\'s rise over thickness sets whether it stays over, and a spring as stiff cancels it over a range', async () => {
  const { curvedCellModel, balancedCellModel, flexureMaterial } = await import('@rulecad/flexures');
  const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} against ${b}`);
  const petg = flexureMaterial({ modulus: 1810, strength: 34, name: 'PETG' }); // strain limit 34 / 1810 / 1.5 = 1.2523%
  // Qiu, Lang and Slocum: two cosine beams joined at the middle stay over when the rise is over 2.31 thicknesses.
  // 60 mm, 0.84 thick: a rise of 1.5 (Q 1.79) springs back, though its stiffness still turns negative past the snap;
  // a rise of 3 (Q 3.57) stays over, resting again short of the mirror (2 × 3 = 6 mm) and past 1.5 rises
  const low = curvedCellModel({ length: 60, rise: 1.5, thickness: 0.84, width: 6 }, petg), high = curvedCellModel({ length: 60, rise: 3, thickness: 0.84, width: 6 }, petg);
  assert.equal(low.bistable, false); assert.ok(low.negative && low.negative.least < 0, 'Q 1.79: negative past the snap');
  assert.equal(high.bistable, true); assert.ok(high.second > 4.5 && high.second < 6, `rests again at ${high.second}`);
  // the slope is the force curve's own: centred differences between steps
  const c = high.curve, i = 20; near(c[i].slope, (c[i + 1].force - c[i - 1].force) / (c[i + 1].push - c[i - 1].push), 1e-9, 'a centred slope');
  // a rise under a thickness has none to balance: the finding fails and the balanced cell is refused by name
  const flat = curvedCellModel({ length: 60, rise: 0.8, thickness: 0.84, width: 6 }, petg);
  assert.equal(flat.negative, null); assert.equal(flat.findings.find((x) => x.code === 'cell.negative').level, 'fail');
  assert.throws(() => balancedCellModel({ length: 60, rise: 0.8, thickness: 0.84, width: 6 }, petg), /cell\.negative: balancedCellModel/);
  assert.throws(() => curvedCellModel({ length: 60, rise: 13, thickness: 0.84, width: 6 }, petg), /cell\.rise: .*up to 12\.00 mm/);
  assert.throws(() => curvedCellModel({ length: 60, rise: 3, thickness: 0, width: 6 }, petg), /cell\.size: curvedCellModel: thickness/);
  // The balanced cell: 80 mm, rise 2.5, two lines thick, 6 wide. A spring as stiff as the beams' least slope (about
  // -1.32 N/mm at 2.57 mm pushed) cancels it there: the pair's force is the beams' plus k × push, its slope theirs plus k
  const p = { length: 80, rise: 2.5, thickness: 0.84, width: 6 }, b = balancedCellModel(p, petg), k = b.spring;
  near(k, -b.cell.negative.least, 1e-12, 'the spring matches the least slope'); near(k, 1.32, 0.02, 'about 1.32 N/mm');
  const j = 30; near(b.curve[j].force, b.cell.curve[j].force + k * b.cell.curve[j].push, 1e-12, 'forces add'); near(b.curve[j].slope, b.cell.curve[j].slope + k, 1e-12, 'slopes add');
  assert.ok(b.flat && b.flat.from < b.cell.negative.at && b.flat.to > b.cell.negative.at, 'the flat range is round the cancelling point');
  for (const q of b.curve.filter((q) => q.push >= b.flat.from && q.push <= b.flat.to)) assert.ok(Math.abs(q.slope) <= 0.1 * k + 1e-12, `within 10% at ${q.push}`);
  assert.ok(b.flat.span > 1.5, `a range of ${b.flat.span} mm`); assert.equal(b.findings.find((x) => x.code === 'cell.flat').level, 'pass');
  // the printed spring: leaves 0.84 by 6 that stay within half the limit to the range's end δ: l = √(3 t δ / (0.012523 / 2)),
  // each 12 E I / l³ = E w t³ / l³, as many as reach k. With δ = 3.4375 (the solver's): l = √(8.6625 / 0.0062615) = 37.195,
  // each 1810 × 6 × 0.592704 / 37.195³ = 6436.8 / 51458 = 0.12509 N/mm, so ⌈1.3195 / 0.12509⌉ = 11 leaves
  const d = b.flat.to, l = Math.sqrt((3 * 0.84 * d) / (petg.strainLimit / 2));
  near(b.leaves.length, l, 1e-9, 'leaf length'); near(b.leaves.each, (1810 * 6 * 0.84 ** 3) / l ** 3, 1e-12, 'each leaf'); assert.equal(b.leaves.count, Math.ceil(k / b.leaves.each));
  if (Math.abs(d - 3.4375) < 1e-9) { near(l, 37.195, 1e-3, 'by hand'); assert.equal(b.leaves.count, 11); }
  // a spring too soft never cancels: the finding fails and names the stiffness wanted
  const readme = (await import('node:fs')).readFileSync(new URL('./README.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n'), N = b.cell.negative;
  for (const line of [`b.cell.stiffness;  // ${b.cell.stiffness.toFixed(2)} N/mm at rest`, `b.cell.negative;   // { from: ${N.from.toFixed(2)}, to: ${N.to.toFixed(2)}, least: ${N.least.toFixed(3)} N/mm, at: ${N.at.toFixed(2)} } mm pushed`,
    `b.flat;            // { from: ${b.flat.from.toFixed(2)}, to: ${b.flat.to.toFixed(2)}, span: ${b.flat.span.toFixed(2)}, force: ${b.flat.force.toFixed(2)} N }`, `b.leaves;          // { length: ${b.leaves.length.toFixed(1)}, count: ${b.leaves.count} }`,
    `${(b.leaves.count * b.leaves.length).toFixed(0)} mm of leaf against the arches' 160 mm`]) assert.ok(readme.includes(line), `the README should read ${line}`);
  assert.match(balancedCellModel(p, petg, { spring: 0.5 }).findings.find((x) => x.code === 'cell.flat').text, /does not cancel .* a spring nearer 1\.3\d\d N\/mm/);
});

test('developable: a four-bar in a tube\'s wall moves as the rigid linkage, its links leave the surface as worked by hand, and the bench tube is sized with twice the margin', async () => {
  const f = await import('@rulecad/flexures'), fs = await import('node:fs'), { pathToFileURL, fileURLToPath } = await import('node:url');
  const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} against ${b}`);
  const petg = f.flexureMaterial({ modulus: 1810, strength: 34, name: 'PETG', density: 1.27 }), R = 20, th = (5 * Math.PI) / 180;
  // Joints at 210°, 150°, 30° and -30° on a 20 mm radius make a rectangle: input and output R long (60° chords), coupler
  // and ground R√3 = 34.641. A parallelogram: the coupler does not turn, so every hinge turns as far as the input, by
  // turns +, -, +, -. Each hinge EI / l = 1810 × 20 × 0.84³ / 12 / 8 = 223.499 N·mm a radian, so holding 5° takes the four
  // hinges' energy's slope 4 K θ = 4 × 223.499 × 0.087266 = 78.016 N·mm, at strain t θ / 2l = 0.84 × 0.087266 / 16 =
  // 0.45815%; PETG's 1.2523% allows 2 × 8 × 0.012523 / 0.84 = 0.23854 rad = 13.667° each way
  const p = { radius: R, wall: 2.5, height: 20, joints: [210, 150, 30, -30], hinge: { flex: 8, thickness: 0.84 } }, m = f.tubeFourBarModel(p, petg), r = m.at(5);
  near(m.links.input, R, 1e-9, 'input'); near(m.links.coupler, R * Math.sqrt(3), 1e-9, 'coupler'); near(m.hinge.stiffness, 223.4988, 1e-4, 'K by hand');
  r.turns.forEach((q, i) => near(q, [5, -5, 5, -5][i], 1e-9, `hinge ${i + 1}'s turn`));
  near(r.torque, 78.016, 1e-3, 'torque by hand'); near(r.strain, 0.0045815, 1e-7, 'strain by hand'); near(m.travel[1], 13.667, 1e-3, 'travel'); near(m.travel[0], -13.667, 1e-3, 'travel back');
  // The coupler moves without turning, by the input's end's move: B from (−R cos 30°, R sin 30°) about A by θ, so by
  // (−R sin θ, R (cos θ − 1)). A point at φ on its arc then lies √(1 + sin²θ + (cos θ − 1)² − 2 cos φ sin θ + 2 sin φ (cos θ − 1)) R
  // from the axis: the most and least over the arc from 150° to 30° (the model's 49 points) are how far it stands out and in
  const ds = Array.from({ length: 49 }, (_, i) => { const ph = ((150 - (120 * i) / 48) * Math.PI) / 180; return R * Math.sqrt(1 + Math.sin(th) ** 2 + (Math.cos(th) - 1) ** 2 - 2 * Math.cos(ph) * Math.sin(th) + 2 * Math.sin(ph) * (Math.cos(th) - 1)) - R; });
  near(r.out.coupler, Math.max(0, ...ds), 1e-9, 'out, by hand'); near(r.in.coupler, Math.max(0, ...ds.map((x) => -x)), 1e-9, 'in, by hand');
  assert.ok(r.out.coupler > 1 && r.in.coupler > 1, 'it leaves the surface both ways'); near(m.at(0).out.coupler, 0, 1e-9, 'at rest it is the tube');
  // the shape: one piece, the tube's outline, its volume the model's (the pockets measured flat: within half a percent)
  const g = f.tubeFourBar(p), box = measureBoundingBox(g);
  assert.ok(onePiece(g), 'one print'); near(box[1][0], R + 1.25, 0.01, 'outer radius'); near(box[1][2], 20, 1e-9, 'height');
  near(measureVolume(g) / m.volume, 1, 0.005, 'the shape weighs what the model says');
  // findings and refusals by name
  const printer = { line: 0.42, layer: 0.2, wall_min: 0.84 }, by = (list, c) => list.find((x) => x.code === c);
  assert.equal(by(f.tubeFourBarFindings({ ...p, turn: 14 }, printer, petg, m), 'developable.strain').level, 'fail');
  assert.equal(by(f.tubeFourBarFindings({ ...p, turn: 5 }, printer, petg, m), 'developable.strain').level, 'pass');
  assert.equal(by(f.tubeFourBarFindings({ ...p, hinge: { flex: 8, thickness: 0.6 } }, printer), 'developable.web').level, 'fail');
  assert.equal(by(f.tubeFourBarFindings({ ...p, height: 20.1 }, printer), 'developable.layers').level, 'warn');
  assert.throws(() => f.tubeFourBarModel({ ...p, joints: [0, 90, 180] }, petg), /developable\.joints: .*four angles/);
  assert.throws(() => f.tubeFourBarModel({ ...p, joints: [0, 10, 180, 270] }, petg), /developable\.joints: .*the input's arc, 3\.49 mm, is under two hinges' length/);
  // a straight web on a curved wall: 10 mm on 20 mm stands 100 / 160 = 0.625 mm off, over a quarter of the 1.66 mm cut;
  // the longest is √(2 R (w - t)) = √(40 × 1.66) = 8.149 mm
  assert.throws(() => f.tubeFourBar({ ...p, hinge: { flex: 10, thickness: 0.84 } }), /developable\.hinge: .*0\.63 mm.*under 8\.15 mm long/);
  // the bench tube (examples/bench flexures/tube): built by its own main, every finding passes, about twice the margin
  const dir = new URL('../../examples/bench/projects/flexures/objects/', import.meta.url), V = JSON.parse(fs.readFileSync(new URL('tube.json', dir), 'utf8').replace(/\r\n/g, '\n')).variables;
  assert.equal(V.web.value, 'x1c.line * 2');
  const v = { ...Object.fromEntries(Object.entries(V).map(([k, x]) => [k, x.value])), web: 0.84, flexures: f, petg: { modulus: 1810, strength: 34, density: 1.27 }, x1c: { ...printer, fit: 0.2 } };
  const { main } = await import(pathToFileURL(fileURLToPath(new URL('tube.js', dir))).href), made = main(v), at = made.mechanism.at;
  assert.deepEqual(made.findings.filter((x) => x.level !== 'pass' && x.level !== 'info').map((x) => x.code), []);
  const margin = petg.strainLimit / at.strain; assert.ok(margin >= 1.9 && margin <= 2.5, `about twice the margin: ${margin}`);
  assert.ok(V.turn.rule.includes(`stands ${at.out.coupler.toFixed(2)} mm out`) && V.turn.rule.includes(`${at.in.coupler.toFixed(2)} mm in`) && V.turn.rule.includes(`${at.torque.toFixed(1)} N·mm`) && V.turn.rule.includes(`(${margin.toFixed(2)} times the margin)`), V.turn.rule);
  assert.ok(onePiece(made.parts.tube), 'the bench tube is one print');
  // the README's example is the bench tube
  const readme = fs.readFileSync(new URL('./README.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n'), bt = made.mechanism.travel;
  for (const line of [`m.travel;    // [${bt[0].toFixed(1)}, ${bt[1].toFixed(1)}]`, `m.at(4.8);   // turns, strain ${(at.strain * 100).toFixed(2)}%, torque ${at.torque.toFixed(1)} N·mm`, `m.grams;     // ${made.mechanism.grams.toFixed(2)}`]) assert.ok(readme.includes(line), `the README should read ${line}`);
});

test('Kresling: the second stable state is the closed form\'s, the panels stretch between the two, and PETG webs cannot take its folds', async () => {
  const { kreslingModel, flexureMaterial } = await import('@rulecad/flexures');
  const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} against ${b}`), r = (d) => (d * Math.PI) / 180;
  const petg = flexureMaterial({ modulus: 1810, strength: 34, name: 'PETG' });
  // Six sides on R 20 (each 20 mm), standing 30 tall turned 100°: the side B_i T_i a² = 900 + 800 (1 - cos 100°) =
  // 1838.918, a = 42.8826; the diagonal b² = 900 + 800 (1 - cos 40°) = 1087.165, b = 32.9722. The second state turns
  // 180 + 60 - 100 = 140°, at h² = a² - 800 (1 - cos 140°) = 1838.918 - 1412.836 = 426.082, h = 20.6418
  const p = { sides: 6, radius: 20, height: 30, twist: 100, panel: { thickness: 0.6 }, hinge: { flex: 2, thickness: 0.4 } }, k = kreslingModel(p, petg);
  near(k.sides.polygon, 20, 1e-9, 'polygon side'); near(k.sides.side, 42.8826, 1e-4, 'a'); near(k.sides.diagonal, 32.9722, 1e-4, 'b');
  assert.equal(k.bistable, true); near(k.states[1].twist, 140, 1e-9, 'the second twist'); near(k.states[1].height, 20.6418, 1e-4, 'the second height');
  // at the second state every side and diagonal is its length again: the same a and b from the second height and twist
  near(Math.sqrt(k.states[1].height ** 2 + 800 * (1 - Math.cos(r(140)))), k.sides.side, 1e-9, 'a again'); near(Math.sqrt(k.states[1].height ** 2 + 800 * (1 - Math.cos(r(80)))), k.sides.diagonal, 1e-9, 'b again');
  // flat: the top row x0 = (a² - b² + s²) / 2s = (1838.918 - 1087.165 + 400) / 40 = 28.7938 along, √(a² - x0²) = 31.7778 up
  near(k.flat[1][0][0], 28.7938, 1e-4, 'x0'); near(k.flat[1][0][1], 31.7778, 1e-4, 'y0'); assert.equal(k.flat[0].length, 7);
  // both states rest (no stretch, no force); between them the panels stretch and it takes a push to cross
  for (const st of k.states) { const a = k.at(st.height); near(a.stretch, 0, 1e-6, `no stretch at ${st.height}`); near(a.energy, 0, 1e-6, 'no energy'); }
  assert.ok(k.barrier.height < 30 && k.barrier.height > 20.64, 'the barrier lies between'); assert.ok(k.barrier.energy > 0 && k.barrier.force > 0 && k.barrier.stretch > 0.005, JSON.stringify(k.barrier));
  // a crease folded ψ on a web t thick and l wide sees t ψ / 2l: the second state's diagonal folds over 150°, so a 0.4 mm
  // PETG web would want 0.4 × ψ / (2 × 0.012523) mm, over 40 mm, where the panels are 20
  const w = k.web[1]; near(w.strain, (0.4 * r(w.fold)) / 4, 1e-12, 'web strain'); near(w.length, (0.4 * r(w.fold)) / (2 * petg.strainLimit), 1e-9, 'web length'); assert.ok(w.fold > 150 && w.length > 40);
  // too short for a second state: 15 tall at 100° (needs h² over 800 (cos 100° - cos 140°) = 474.0)
  assert.equal(kreslingModel({ sides: 6, radius: 20, height: 15, twist: 100 }).bistable, false);
  assert.equal(kreslingModel({ sides: 6, radius: 20, height: 22, twist: 100 }).bistable, true);
  for (const [bad, code] of [[{ ...p, sides: 2 }, 'kresling.sides'], [{ ...p, twist: 20 }, 'kresling.twist'], [{ ...p, twist: 130 }, 'kresling.twist']]) assert.throws(() => kreslingModel(bad), (e) => e.code === code);
});
