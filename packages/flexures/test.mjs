import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leaf, leafModel, fixedGuided, fixedGuidedModel, parallelGuide, parallelGuideModel, serpentine, serpentineModel, notchHinge, notchHingeModel, printable } from '@rulecad/flexures';
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
