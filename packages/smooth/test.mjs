import { test } from 'node:test';
import assert from 'node:assert/strict';
import { smooth, smoothCircuit } from '@rulecad/smooth';

const wire = (x, y, layer = 'top', width = 0.15) => ({ route_type: 'wire', x, y, width, layer });
const via = (x, y) => ({ route_type: 'via', x, y, from_layer: 'top', to_layer: 'bottom' });

test('a wiggle and a doubling-back are pulled straight; the ends stay', () => {
  const route = [wire(0, 0), wire(1, 0.1), wire(2, -0.1), wire(2.5, 0), wire(2.2, 0), wire(3, 0), wire(5, 0)];
  const [out] = smooth([{ route }], []);
  assert.deepEqual(out, [route[0], route.at(-1)]);
});

test('a straight run that would pass too close to something keeps a bend round it', () => {
  const route = [wire(0, 0), wire(2, 1), wire(4, 0)];
  const pad = { layer: 'top', net: 'B', shape: { circle: { x: 2, y: 0, r: 0.3 } } };
  assert.equal(smooth([{ route, net: 'A' }], [pad])[0].length, 3); // straight would cross the pad
  assert.equal(smooth([{ route, net: 'B' }], [pad])[0].length, 2); // its own net's pad isn't in the way
  assert.equal(smooth([{ route, net: 'A' }], [{ ...pad, layer: 'bottom' }])[0].length, 2); // nor one on the other layer
  const near = { layer: '*', net: 'B', shape: { circle: { x: 2, y: 0.25, r: 0.1 } } }; // 0.075 mm from the straight run's copper: under 0.1
  assert.equal(smooth([{ route, net: 'A' }], [near], { clearance: 0.1 })[0].length, 3);
});

test('a spike out and back is cut off; a hook round something is cut across as far as it can be', () => {
  const sharp = (route) => route.some((b, i) => i > 0 && i + 1 < route.length && ((route[i - 1].x - b.x) * (route[i + 1].x - b.x) + (route[i - 1].y - b.y) * (route[i + 1].y - b.y)) > 1e-9);
  // out to x 3, back to x 2, then on up: a pad beside the straight run keeps every point, so only a cut can help
  const spike = [wire(0, 0), wire(3, 0), wire(2, 0), wire(2, 2)];
  const pad = { layer: 'top', net: 'B', shape: { circle: { x: 1, y: 0.6, r: 0.2 } } };
  const [s1] = smooth([{ route: spike, net: 'A' }], [pad]);
  assert.ok(!sharp(s1), JSON.stringify(s1.map((p) => [p.x, p.y])));
  assert.ok(s1.every((p) => p.x <= 2 + 1e-9), 'the spike is gone');
  // a hairpin with something between its ends: cut across as far back as that allows, and no sharper than 90° after
  const hook = [wire(0, 0), wire(4, 0.5), wire(0, 1)];
  const inBend = { layer: 'top', net: 'B', shape: { circle: { x: 2.5, y: 0.5, r: 0.1 } } }, between = { ...inBend, shape: { circle: { x: 0.3, y: 0.5, r: 0.2 } } };
  const [s2] = smooth([{ route: hook, net: 'A' }], [inBend, between], { clearance: 0.1 });
  assert.ok(s2.length === 4 && !sharp(s2), JSON.stringify(s2.map((p) => [+p.x.toFixed(2), +p.y.toFixed(2)])));
  assert.ok(Math.abs(s2[1].x - 0.675) < 0.01 && Math.abs(s2[2].x - 0.675) < 0.01, 'cut just clear of what lies between: its edge at 0.5, the clearance and half the track');
  assert.deepEqual([s2[0], s2.at(-1)], [hook[0], hook[2]], 'the ends stay');
});

test('a lead-in the track turns back on is cut back, never its first segment; one it carries on from stays', () => {
  // a stub from a pin at (0, 0) down to (0, -2), then 3 mm left; the track starts there and heads right
  const lead = [{ x: 0, y: 0 }, { x: 0, y: -2 }, { x: -3, y: -2 }];
  const t = { route: [wire(-3, -2), wire(2, -3)], net: 'A', leads: { start: lead } };
  const [out] = smooth([t], []);
  assert.deepEqual([out[0].x, out[0].y], [0, -2], 'the track now leaves from the stub\'s corner');
  assert.deepEqual(t.trimmed.start, lead.slice(0, 2));
  // something in the way of leaving from the corner: cut back only part of the way
  const block = { layer: 'top', net: 'B', shape: { circle: { x: 1, y: -2.3, r: 0.1 } } };
  const t2 = { route: [wire(-3, -2), wire(2, -3)], net: 'A', leads: { start: lead } };
  const [out2] = smooth([t2], [block]);
  assert.ok(out2[0].x < 0 && out2[0].x > -3 && out2[0].y === -2, JSON.stringify(out2[0]));
  assert.equal(t2.trimmed.start.length, 3);
  assert.equal(t2.trimmed.start[2].x, out2[0].x);
  // heading on the way the stub goes: nothing cut
  const t3 = { route: [wire(-3, -2), wire(-5, -2.5)], net: 'A', leads: { start: lead } };
  smooth([t3], []);
  assert.equal(t3.trimmed.start, undefined);
});

test('vias, layer changes and width changes are kept, each run pulled on its own', () => {
  const route = [wire(0, 0), wire(1, 0.2), wire(2, 0), via(2, 0), wire(2, 0, 'bottom'), wire(3, 0.3, 'bottom'), wire(4, 0, 'bottom'), wire(5, 0, 'bottom', 0.1), wire(6, 0.1, 'bottom', 0.1), wire(7, 0, 'bottom', 0.1)];
  const [out] = smooth([{ route }], []);
  assert.deepEqual(out.map((p) => [p.x, p.route_type, p.layer, p.width]), [[0, 'wire', 'top', 0.15], [2, 'wire', 'top', 0.15], [2, 'via', undefined, undefined],
    [2, 'wire', 'bottom', 0.15], [4, 'wire', 'bottom', 0.15], [5, 'wire', 'bottom', 0.1], [7, 'wire', 'bottom', 0.1]]);
});

test('tracks keep clear of each other as they are pulled, and of the board edge; never closer to anything than they were', () => {
  const a = [wire(0, 0), wire(2, 1), wire(4, 0)], b = [wire(2, 0.5), wire(2, -1)];
  const [pa] = smooth([{ route: a, net: 'A' }, { route: b, net: 'B' }], []);
  assert.equal(pa.length, 3); // b crosses where a's straight run would go
  // a tooth of the board's edge reaching up under the middle of the straight run
  const tooth = (top) => [{ x: -1, y: -1 }, { x: 1.7, y: -1 }, { x: 1.7, y: top }, { x: 2.3, y: top }, { x: 2.3, y: -1 }, { x: 5, y: -1 }, { x: 5, y: 3 }, { x: -1, y: 3 }];
  const r = [wire(0, 0), wire(2, 1), wire(4, 0)];
  assert.equal(smooth([{ route: r }], [], { outline: tooth(-0.1), edge: 0.2 })[0].length, 3); // 0.1 mm over the tooth: under 0.2 plus half its width
  assert.equal(smooth([{ route: r }], [], { outline: tooth(-0.4), edge: 0.2 })[0].length, 2);
});

test('Circuit JSON: only the tracks picked move; pads, vias and other tracks are kept clear of', async () => {
  const json = [
    { type: 'pcb_board', pcb_board_id: 'b', center: { x: 2, y: 0 }, width: 10, height: 6, min_trace_to_pad_edge_clearance: 0.1 },
    { type: 'pcb_smtpad', pcb_smtpad_id: 'p1', shape: 'rect', x: 2, y: 0, width: 0.6, height: 0.6, layer: 'top' },
    { type: 'pcb_trace', pcb_trace_id: 't1', route: [wire(0, 0), wire(2, 1), wire(4, 0)], routed: true },
    { type: 'pcb_trace', pcb_trace_id: 't2', route: [wire(0, -2), wire(2, -1.5), wire(4, -2)], routed: true },
    { type: 'pcb_trace', pcb_trace_id: 't3', route: [wire(0, 2), wire(2, 2.4), wire(4, 2)] }];
  const { json: out, routes, changed } = smoothCircuit(json, { movable: (e) => e.routed });
  assert.equal(changed, 1);
  assert.deepEqual([...routes.keys()], ['t2']); // t1 bends round the pad; t3 isn't picked
  assert.equal(out.find((e) => e.pcb_trace_id === 't2').route.length, 2);
  assert.equal(out.find((e) => e.pcb_trace_id === 't3'), json[4]);
});
