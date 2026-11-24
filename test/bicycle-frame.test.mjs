// The bicycle frame example (examples/bicycle-frame): a layout from @rulecad/fea/layout, its tubes sized from bought
// sizes, and its joints handed on as problems the voxel optimiser reads (cad's problem schema).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bicycle, problem } from '../examples/bicycle-frame/bicycle.mjs';
import { schema, validate } from '../packages/cad/lib/schema.mjs';

test('the bicycle frame example: a layout, tube sizes and its joints as problems', () => {
  const { layout, sizing, joints } = bicycle();
  assert.equal(layout.cases.length, 3, 'seated, pedalling, braking');
  assert.ok(layout.strain <= 1 + 1e-5, 'the least volume over every candidate');
  // the diamond frame's tubes are among those the layout keeps: chainstay, seat stay, seat tube, top tube, down tube, head tube
  const ids = new Set(layout.members.map((m) => m.id));
  for (const id of ['rear-bb', 'rear-seat', 'bb-seat', 'seat-head', 'bb-head', 'head-bars']) assert.ok(ids.has(id), `${id} is kept`);
  // every tube is a bought size that meets the limits, and the fully stressed layout is lighter than the sized frame
  assert.ok(sizing.ok, `the limits are met (worst: ${sizing.worst?.limit} at ${sizing.worst?.where})`);
  assert.equal(sizing.groups.length, layout.members.length);
  for (const g of sizing.groups) assert.match(g.choice, /^[\d.]+ x [\d.]+$/);
  assert.ok(layout.mass < sizing.total, `${layout.mass} kg fully stressed, ${sizing.total} kg as bought`);
  // the joints: one problem each, valid against cad's problem schema, each joint in balance under the frame's axial
  // forces to within a hundredth of the largest (the frame's joints are welded, so its tubes carry a little shear too,
  // which the joint's held stub takes)
  assert.deepEqual(joints.map((j) => j.node), ['bb', 'seat', 'head']);
  for (const j of joints) {
    assert.deepEqual(validate(j.problem, schema('problem')), [], `joint ${j.node}'s problem reads as a problem file`);
    problem.cases.forEach((c, k) => {
      const outside = c.loads.filter((l) => l.node === j.node).reduce((t, l) => [t[0] + l.force[0], t[1] + l.force[1]], [0, 0]);
      const sum = [0, 1].map((d) => j.members.reduce((t, e) => t + e.direction[d] * e.forces[k], outside[d]));
      const support = Object.keys(problem.supports).includes(j.node);
      if (!support) assert.ok(Math.hypot(...sum) < 1e-2 * Math.max(1, ...j.members.map((e) => Math.abs(e.forces[k]))), `joint ${j.node} in balance in ${c.label} (${sum})`);
    });
  }
});
