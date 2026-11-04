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

test('vias, layer changes and width changes are kept, each run pulled on its own', () => {
  const route = [wire(0, 0), wire(1, 0.2), wire(2, 0), via(2, 0), wire(2, 0, 'bottom'), wire(3, 0.3, 'bottom'), wire(4, 0, 'bottom'), wire(5, 0, 'bottom', 0.1), wire(6, 0.1, 'bottom', 0.1), wire(7, 0, 'bottom', 0.1)];
  const [out] = smooth([{ route }], []);
  assert.deepEqual(out.map((p) => [p.x, p.route_type, p.layer, p.width]), [[0, 'wire', 'top', 0.15], [2, 'wire', 'top', 0.15], [2, 'via', undefined, undefined],
    [2, 'wire', 'bottom', 0.15], [4, 'wire', 'bottom', 0.15], [5, 'wire', 'bottom', 0.1], [7, 'wire', 'bottom', 0.1]]);
});

test('tracks keep clear of each other as they are pulled, and of the board edge', () => {
  const a = [wire(0, 0), wire(2, 1), wire(4, 0)], b = [wire(2, 0.5), wire(2, -1)];
  const [pa] = smooth([{ route: a, net: 'A' }, { route: b, net: 'B' }], []);
  assert.equal(pa.length, 3); // b crosses where a's straight run would go
  const r = [wire(0, 0.5), wire(2, 1), wire(4, 0.5)], board = (y) => [{ x: -1, y }, { x: 5, y }, { x: 5, y: 3 }, { x: -1, y: 3 }];
  assert.equal(smooth([{ route: r }], [], { outline: board(0.3), edge: 0.2 })[0].length, 3); // straight, 0.2 mm from the edge: under 0.2 plus half its width
  assert.equal(smooth([{ route: r }], [], { outline: board(0), edge: 0.2 })[0].length, 2);
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
