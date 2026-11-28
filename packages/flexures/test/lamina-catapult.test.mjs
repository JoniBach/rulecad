// The catapult: a pusher on a two-leaf spring, caught by a latch, built as a lamina, whole and broken in each of the ways
// the checks must find. Moved here from ../test.mjs, where these three tests took about ten of its minutes (one file's
// tests run one after another; files run side by side, and the test runner can put them in different parts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import jscad from '@jscad/modeling';
import { lamina, flexureMaterial } from '@rulecad/flexures';

const { measureBoundingBox } = jscad.measurements;
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

test('a hand holding a part where a catch takes it lets go: the catch carries the spring\'s load, not the hand, though the part doesn\'t move', async () => {
  const m = await catapult({ set: true });
  const last = m.frames.filter((fr) => fr.forces && fr.from === 'set' && fr.to === 'cocked').at(-1);
  assert.ok(last, 'physics frames from set to cocked');
  const F = (kind, on, by) => last.forces.filter((x) => x.kind === kind && x.on === on && x.by === by).reduce((a, x) => a + Math.hypot(...x.force), 0);
  const hook = F('contact', 'pusher', 'hook'), spring = F('spring', 'ground', 'spring');
  assert.ok(spring > 0.5 && Math.abs(hook / spring - 1) < 0.1, `the hook takes ${hook.toFixed(2)} N, the spring pulls ${spring.toFixed(2)} N: nothing else holds it`);
  assert.deepEqual(fails(m, 'lamina.force'), []);
});
