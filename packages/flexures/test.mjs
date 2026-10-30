import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leaf, leafModel, fixedGuided, fixedGuidedModel, parallelGuide, parallelGuideModel, serpentine, serpentineModel, notchHinge, notchHingeModel, bistable, bistableModel, livingHinge, livingHingeModel, elastica, leafFlexed, printable } from '@rulecad/flexures';
import { grid, analyse } from '@rulecad/fea';
import jscad from '@jscad/modeling';

const { measureVolume, measureBoundingBox } = jscad.measurements;
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
