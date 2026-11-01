import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from '@rulecad/variables';
import { createRequire } from 'node:module';
const loadRuleSet = (name) => createRequire(import.meta.url)(`@rulecad/rules/${name}.json`); // the published sets, read as they are
import { grid, keyboard, render, checks, fabFiles, kicadFiles, views, light, part, header, xiao, qwiic, jstph, shape, parts, solids, outputs, fromKicadPcb, clone, sameCircuit, learnPlacement, arrange, placementChecks, padsOnBoard, withFootprint, moveGroup, wrlMesh, stepBounds, partModels } from '@rulecad/pcb';
import { layerChanges, routeInput, neckDown } from './circuit.mjs';

// A board's values as a design gets them: the published rule sets and the board's own variables
const values = (variables) => resolve({ uses: ['mx', 'pico', 'sod123', 'm2', 'jlcpcb'], variables: {
  track: { value: 'jlcpcb.track_min * 2.5' }, clear: { value: 'jlcpcb.gap_min * 2.5' }, thickness: { value: 'jlcpcb.thickness' },
  margin: { value: 5 }, mcu_gap: { value: 2 }, mcu_side: { value: 'left', choice: ['left', 'right'] }, mcu_row: { value: 0 }, mount_holes: { value: 1 },
  ...variables } }, { load: loadRuleSet }).values;
const build = async (v, rows, cols) => { const { board, matrix } = keyboard(v, grid(rows, cols, v.mx.pitch)); return { json: await render(board), matrix }; };
const failures = (found) => found.filter((f) => f.level === 'fail').map((f) => f.text);

test('a keyboard board with no framework: every track drawn by rule, the checks pass, the fab files and drawings come out', async () => {
  const v = values({ controller: { value: 'beside', choice: ['beside', 'under'] } });
  const { json, matrix } = await build(v, 3, 3);
  assert.deepEqual(failures(await checks(json, v, matrix)), []);
  const count = (t) => json.filter((e) => e.type === t).length;
  assert.equal(count('pcb_trace'), count('source_trace'), 'every connection has a track');
  assert.equal(count('pcb_via'), 0, 'drawn by rule: no vias');
  const fab = await fabFiles(json, 'pad');
  for (const f of ['pad.GTL', 'pad.GBL', 'pad.GKO', 'pad-PTH.DRL', 'pad-bom.csv', 'pad-cpl.csv']) assert.ok(fab[f]?.length > 50, f);
  assert.match(fab['pad-bom.csv'], /"1N4148W","D1,D2,D3,D4,D5,D6,D7,D8,D9","SOD-123"/);
  const kicad = await kicadFiles(json, 'pad');
  assert.match(kicad['pad.kicad_pcb'], /^\(kicad_pcb/);
  const drawn = await views(json);
  assert.ok(drawn.every(([, svg]) => svg.startsWith('<svg')), 'board and schematic drawings');
});

const node22 = Number(process.versions.node.split('.')[0]) >= 22;
test('the Pico under the board: its connections autorouted around the drawn tracks, cleanly', { skip: !node22 && 'the autorouter needs Node 22' }, async () => {
  const v = values({ controller: { value: 'under', choice: ['beside', 'under'] }, margin: { value: -2 }, mount_holes: { value: 0 } });
  const { json, matrix } = await build(v, 4, 6);
  assert.deepEqual(failures(await checks(json, v, matrix)), []);
  const routed = json.filter((e) => e.type === 'pcb_trace').length;
  assert.equal(routed, json.filter((e) => e.type === 'source_trace').length, 'every connection is routed');
  for (const via of json.filter((e) => e.type === 'pcb_via')) assert.ok(json.some((t) => t.pcb_trace_id === via.pcb_trace_id && t.type === 'pcb_trace'), 'each via belongs to a track');
});

test('on Node 20, routing says what it needs instead of failing inside the router', { skip: node22 && 'Node 22 or newer' }, async () => {
  const v = values({ controller: { value: 'under', choice: ['beside', 'under'] }, margin: { value: -2 }, mount_holes: { value: 0 } });
  await assert.rejects(build(v, 4, 6), /needs Node 22 or newer/);
});

// ---------- any board ----------
const node = (uses, variables = {}) => resolve({ uses, variables }, { load: loadRuleSet }).values;
const board = (parts, more = {}) => ({ center: { x: 0, y: 0 }, width: 60, height: 40, thickness: 1.6, parts, traces: [], silk: [], track: 0.3, ...more });
const near = (a, b) => Math.abs(a - b) < 1e-9;
const padsOf = (json, name) => {
  const comp = json.find((e) => e.type === 'source_component' && e.name === name), pc = json.find((e) => e.type === 'pcb_component' && e.source_component_id === comp.source_component_id);
  return json.filter((e) => (e.type === 'pcb_smtpad' || e.type === 'pcb_plated_hole') && e.pcb_component_id === pc.pcb_component_id);
};

test('parts turn in quarter turns: pads move and their sides swap, exactly; other angles say what they need', async () => {
  const json = await render(board([part('J1', 'jst4_sh', 10, 0, { rotation: 90 })]));
  const pin1 = padsOf(json, 'J1').find((e) => e.port_hints[0] === '1'); // (-1.5, -1.325) in the footprint
  assert.ok(near(pin1.x, 10 + 1.325) && near(pin1.y, -1.5), `pin 1 at ${pin1.x}, ${pin1.y}`);
  assert.deepEqual([pin1.width, pin1.height], [1.55, 0.6]);
  assert.equal(json.find((e) => e.type === 'pcb_component').rotation, 90);
  await assert.rejects(render(board([part('J1', 'jst4_sh', 0, 0, { rotation: 45 })])), /0, 90, 180 or 270/);
});

test('through-hole footprints and any footprint on any part, with pins named by label or number', async () => {
  const json = await render(board([part('J1', 'pinrow4', 0, 0, { labels: { pin1: 'GND', pin2: 'VCC' } })]));
  assert.equal(padsOf(json, 'J1').filter((e) => e.type === 'pcb_plated_hole').length, 4);
  const names = json.filter((e) => e.type === 'source_port').map((e) => e.name);
  assert.deepEqual(names, ['GND', 'VCC', 'pin3', 'pin4']);
});

test('a net joins its pins by the shortest links, not in the order written, and labels the schematic with its name', async () => {
  const pins = [-15, 15, 0, 5].map((x, i) => part(`R${i + 1}`, '0603', x, 0));
  const json = await render(board(pins, { nets: { SIG: ['R1.1', 'R2.1', 'R3.1', 'R4.1'] }, autoroute: true }), { route: async () => ({ traces: [] }) });
  const links = json.filter((e) => e.type === 'source_trace').map((e) => e.display_name);
  assert.equal(links.length, 3);
  assert.ok(!links.some((l) => l.includes('R1') && l.includes('R2')), 'never the long way from one end to the other');
  assert.ok(json.some((e) => e.type === 'schematic_net_label' && e.text === 'SIG'));
  await assert.rejects(render(board(pins, { nets: { SIG: ['R1'] }, autoroute: true })), /part and a pin, like U1.GND/);
});

test('parts from rule sets: a XIAO, two Qwiic sockets (one turned), a JST PH socket and a diode, joined by nets', { skip: !node22 && 'the autorouter needs Node 22' }, async () => {
  const v = node(['xiao', 'qwiic', 'jstph', 'jlcpcb']);
  const parts = [
    xiao('U1', -12, 0, v.xiao),
    qwiic('J1', 6, 8, v.qwiic),
    qwiic('J2', 15, -2, v.qwiic, { rotation: 270 }), // plug in from the right edge
    jstph('J3', 4, -7, v.jstph, { labels: { pin1: 'BAT', pin2: 'BATGND' } }),
    { name: 'D1', ftype: 'simple_diode', footprint: 'sod123', mpn: 'B5819W', x: 4, y: -2, layer: 'top', sch: { x: 2, y: -1 } }
  ];
  const nets = { GND: ['U1.GND', 'J1.GND', 'J2.GND', 'J3.BATGND'], '3V3': ['U1.3V3', 'J1.3V3', 'J2.3V3'], SDA: ['U1.D4', 'J1.SDA', 'J2.SDA'], SCL: ['U1.D5', 'J1.SCL', 'J2.SCL'],
    VBAT: ['J3.BAT', 'D1.anode'], VIN: ['D1.cathode', 'U1.5V'] };
  const json = await render(board(parts, { width: 44, height: 28, center: { x: -1, y: 0 }, nets, autoroute: true, track: 0.3 }));
  assert.deepEqual(failures(await checks(json, { jlcpcb: v.jlcpcb, track: 0.3, clear: 0.25 })), []);
  const count = (t) => json.filter((e) => e.type === t).length;
  assert.equal(count('source_trace'), 3 + 2 + 2 + 2 + 1 + 1, 'each net joined by one fewer link than it has pins');
  assert.equal(count('pcb_trace'), count('source_trace'), 'every link routed');
  const bom = (await fabFiles(json, 'node'))['node-bom.csv'];
  assert.match(bom, /JST SM04B-SRSS-TB/);
  assert.match(bom, /Seeed Studio XIAO/);
});

test('drawings for links are lighter and look the same: coordinates rounded, labels and elements kept', () => {
  const svg = '<svg width="800"><path class="t" d="M 21.310602024507205 570.6446457112413 L 1.5 2" data-type="pcb_trace" data-pcb-layer="top"/><style></style><text x="10.123456">0.30000000000000004 mm</text></svg>';
  assert.equal(light(svg), '<svg width="800"><path class="t" d="M 21.31 570.64 L 1.5 2" data-pcb-layer="top"/><text x="10.12">0.30000000000000004 mm</text></svg>');
});

test('a shaped board: a round one routes inside its outline, mills to its shape, and tells a case where its parts are', { skip: !node22 && 'the autorouter needs Node 22' }, async () => {
  const outline = shape.circle(30, { segments: 48 });
  const json = await render({ outline, thickness: 1.6, track: 0.3, autoroute: true,
    parts: [part('R1', '0603', -6, 0), part('R2', '0603', 6, 0)], nets: { A: ['R1.1', 'R2.1'], B: ['R1.2', 'R2.2'] } });
  const b = json.find((e) => e.type === 'pcb_board');
  assert.equal(b.outline.length, 48);
  assert.ok(Math.abs(b.width - 30) < 1e-9 && Math.abs(b.center.x) < 1e-9, 'centre and size from the outline');
  const found = await checks(json, { jlcpcb: values({}).jlcpcb, track: 0.3 });
  assert.deepEqual(failures(found), []);
  assert.ok(found.some((f) => f.level === 'pass' && /shaped board \(48 points\)/.test(f.text)), 'pads inside');
  assert.equal(json.filter((e) => e.type === 'pcb_trace').length, 2, 'both nets routed');
  assert.match((await fabFiles(json, 'disc'))['disc.GKO'], /X/, 'an edge cut');
  assert.equal(outputs(json).board_outline.length, 48);
  assert.deepEqual(Object.keys(parts(json)).sort(), ['R1', 'R2']);
  assert.ok(Math.abs(parts(json).R2.x - 6) < 1e-9);
  const { board } = solids(json, { thickness: 1.6 });
  assert.ok(board.polygons.length > 48, 'a round solid');
});

test('board shapes: rounded and bevelled outlines keep their size', () => {
  const r = shape.rounded(40, 20, 4), w = Math.max(...r.map((p) => p.x)) - Math.min(...r.map((p) => p.x));
  assert.ok(Math.abs(w - 40) < 1e-9 && r.length === 36);
  assert.equal(shape.bevelled(40, 20, 3, { at: [1, 2] })[0].x, -16);
});

// ---------- clones: a board from KiCad ----------
// A small KiCad 6 board, written by hand for these tests: 20 × 10 mm; R1 turned 90° on top, R2 and R3 on the back (R3
// turned 90°), R4 at 45°, a header J1 with a castellated pad and an oval one (its hole off-centre), a mounting hole, and
// net B filled on the back. In KiCad's frame y is down; the expected places below are worked out by hand from it.
const KICAD = `(kicad_pcb (version 20211014) (generator pcbnew)
  (general (thickness 1.2))
  (layers (0 "F.Cu" signal) (31 "B.Cu" signal) (44 "Edge.Cuts" user))
  (net 0 "") (net 1 "A") (net 2 "B") (net 3 "C")
  (footprint "R:R_0402" (layer "F.Cu") (at 5 5 90) (property "Reference" "R1") (property "Value" "10k") (property "LCSC" "C25744")
    (pad "1" smd roundrect (at -0.5 0 90) (size 0.6 0.5) (layers "F.Cu" "F.Paste" "F.Mask") (net 1 "A"))
    (pad "2" smd roundrect (at 0.5 0 90) (size 0.6 0.5) (layers "F.Cu" "F.Paste" "F.Mask") (net 2 "B")))
  (footprint "R:R_0402" (layer "B.Cu") (at 15 5) (property "Reference" "R2")
    (pad "1" smd rect (at -0.5 0) (size 0.6 0.5) (layers "B.Cu") (net 2 "B"))
    (pad "2" smd rect (at 0.5 0) (size 0.6 0.5) (layers "B.Cu") (net 1 "A")))
  (footprint "R:R_0402" (layer "B.Cu") (at 15 8 90) (property "Reference" "R3")
    (pad "1" smd rect (at -0.5 0 90) (size 0.6 0.5) (layers "B.Cu") (net 2 "B"))
    (pad "2" smd rect (at 0.5 0 90) (size 0.6 0.5) (layers "B.Cu") (net 3 "C")))
  (footprint "R:R_0402" (layer "F.Cu") (at 10 5 45) (property "Reference" "R4")
    (pad "1" smd rect (at -0.5 0 45) (size 0.6 0.5) (layers "F.Cu") (net 2 "B"))
    (pad "2" smd rect (at 0.5 0 45) (size 0.6 0.5) (layers "F.Cu") (net 3 "C")))
  (footprint "J:Pin" (layer "F.Cu") (at 3 9.15) (fp_text reference "J1" (at 0 0) (layer "F.SilkS"))
    (pad "1" thru_hole circle (at 0 0.85) (size 1.7 1.7) (drill 1) (property pad_prop_castellated) (layers *.Cu *.Mask) (net 1 "A"))
    (pad "1" thru_hole oval (at 0 -0.55) (size 1.7 3) (drill 1 (offset 0 0.7)) (layers *.Cu *.Mask) (net 1 "A")))
  (footprint "H:Hole" (layer "F.Cu") (at 10 2) (property "Reference" "H1")
    (pad "" np_thru_hole circle (at 0 0) (size 2 2) (drill 2) (layers *.Cu)))
  (gr_line (start 0 0) (end 20 0) (layer "Edge.Cuts") (width 0.1))
  (gr_line (start 20 0) (end 20 10) (layer "Edge.Cuts") (width 0.1))
  (gr_line (start 0 10) (end 20 10) (layer "Edge.Cuts") (width 0.1))
  (gr_line (start 0 10) (end 0 0) (layer "Edge.Cuts") (width 0.1))
  (segment (start 4.5 5) (end 10 5) (width 0.2) (layer "F.Cu") (net 1))
  (zone (net 2) (net_name "B") (layer "B.Cu") (hatch edge 0.5))
)`;
const stub = { route: async () => ({ traces: [] }) }; // the board without its tracks: the circuit, not the routing

test('a KiCad board read as a circuit: parts where the source put them, nets, planes, outline and holes', () => {
  const c = fromKicadPcb(KICAD);
  assert.deepEqual([c.layers, c.width, c.height, c.thickness], [2, 20, 10, 1.2]);
  assert.equal(c.outline.length, 4);
  assert.ok(c.outline.reduce((s, p, i) => { const q = c.outline[(i + 1) % 4]; return s + p.x * q.y - q.x * p.y; }, 0) > 0, 'counter-clockwise');
  assert.deepEqual(c.parts.map((p) => p.ref), ['R1', 'R2', 'R3', 'R4', 'J1'], 'a part with no pads (the hole) is left out');
  assert.deepEqual(c.nets, { A: ['R1.1', 'R2.2', 'J1.1'], B: ['R1.2', 'R2.1', 'R3.1', 'R4.1'], C: ['R3.2', 'R4.2'] });
  assert.deepEqual(c.planes, { B: ['B.Cu'] });
  assert.deepEqual(c.holes, [{ x: 0, y: 3, d: 2 }], 'centred on the outline, y up');
  const r1 = c.parts[0], j1 = c.parts.at(-1);
  assert.deepEqual([r1.x, r1.y, r1.rotation, r1.layer, r1.value, r1.lcsc], [-5, 0, 90, 'top', '10k', 'C25744']);
  assert.deepEqual([c.parts[2].rotation, c.parts[2].layer], [270, 'bottom'], 'a part on the back turns the other way, seen from its side');
  assert.equal(j1.pads[0].castellated, true);
  assert.deepEqual(j1.pads[1].hole_offset, [0, -0.7]);
  assert.deepEqual([c.source.tracks, c.source.vias], [1, 0]);
  assert.throws(() => fromKicadPcb('(kicad_pcb (version 4) (module "x"))'), /KiCad 6 or later/);
  assert.throws(() => fromKicadPcb('(kicad_pcb (footprint "x"'), /never closed/);
});

test('a clone puts every pad where the source has it: turned, on the back, at 45°', async () => {
  const c = fromKicadPcb(KICAD), k = clone(c);
  const json = await render({ outline: k.outline, thickness: 1.2, track: 0.2, autoroute: true, parts: k.parts, nets: k.nets, holes: k.holes }, stub);
  const comp = new Map(json.filter((e) => e.type === 'source_component').map((e) => [e.source_component_id, e.name]));
  const port = new Map(json.filter((e) => e.type === 'source_port').map((e) => [e.source_port_id, `${comp.get(e.source_component_id)}.${e.name}`]));
  const pcbPort = new Map(json.filter((e) => e.type === 'pcb_port').map((e) => [e.pcb_port_id, port.get(e.source_port_id)]));
  const pad = (name) => json.find((e) => e.type === 'pcb_smtpad' && pcbPort.get(e.pcb_port_id) === name);
  // KiCad: R1 at (5, 5) turned 90°, its pad 1 at (-0.5, 0) -> (5, 5.5) on the board; centred and y up: (-5, -0.5)
  const at = (name) => { const p = pad(name); return p.points ? [p.points.reduce((s, q) => s + q.x, 0) / 4, p.points.reduce((s, q) => s + q.y, 0) / 4] : [p.x, p.y]; };
  const is = (name, x, y) => { const [px, py] = at(name); assert.ok(Math.abs(px - x) < 1e-4 && Math.abs(py - y) < 1e-4, `${name} at ${px}, ${py}: expected ${x}, ${y}`); };
  is('R1.pin1', -5, -0.5);
  assert.deepEqual([pad('R1.pin1').width, pad('R1.pin1').height], [0.5, 0.6], 'turned a quarter: sides swapped');
  is('R2.pin1', 4.5, 0); // on the back at (15, 5): pad 1 at (14.5, 5)
  is('R3.pin1', 5, -3.5); // on the back at (15, 8), turned 90°: pad 1 at (15, 8.5)
  is('R4.pin1', -Math.SQRT1_2 / 2, -Math.SQRT1_2 / 2); // at (10, 5), 45°: pad 1 at (9.646, 5.354)
  assert.equal(pad('R2.pin1').layer, 'bottom');
  assert.deepEqual(sameCircuit(json, c).map((f) => f.level), ['pass']);
  assert.deepEqual(k.notes.map((n) => n.split(' ').slice(0, 3).join(' ')), ['castellated pads on'], 'B is filled on an outer layer only: still routed');
  assert.deepEqual(Object.keys(clone(c, { planes: ['B'] }).nets), ['A', 'C']);
});

test('sameCircuit: a board that joins other pins than the source says which', async () => {
  const c = fromKicadPcb(KICAD), k = clone(c);
  const board = (nets) => render({ outline: k.outline, thickness: 1.2, track: 0.2, autoroute: true, parts: k.parts, nets, holes: k.holes }, stub);
  const moved = await board({ ...k.nets, A: k.nets.A.slice(0, 2), C: [...k.nets.C, 'J1.pin1'] }); // J1's pad moved from A to C
  const found = failures(sameCircuit(moved, c)).join(' | ');
  assert.match(found, /J1\.pin1 in C/);
  assert.match(found, /pins the board doesn't have|split/);
  const missing = await board({ ...k.nets, B: k.nets.B.slice(0, 3) }); // R4's pad left out of B
  assert.match(failures(sameCircuit(missing, c)).join(' | '), /split in two or more on the board: B/);
});

test('a route that changes layer inside a plated hole becomes two routes; through anything else, an error', () => {
  const hole = { type: 'pcb_plated_hole', x: 0, y: 0, outer_diameter: 1.7 };
  const route = [{ route_type: 'wire', x: -3, y: 0, width: 0.2, layer: 'bottom' }, { route_type: 'wire', x: -0.5, y: 0, width: 0.2, layer: 'bottom' },
    { route_type: 'through_obstacle', start: { x: -0.5, y: 0 }, end: { x: -0.5, y: 0 }, from_layer: 'bottom', to_layer: 'top', width: 0.2 },
    { route_type: 'wire', x: 3, y: 0, width: 0.2, layer: 'top' }];
  const pieces = layerChanges(route, [hole]);
  assert.equal(pieces.length, 2);
  assert.deepEqual(pieces.map((p) => [p[0].layer, p.at(-1).layer]), [['bottom', 'bottom'], ['top', 'top']]);
  assert.deepEqual([pieces[0].at(-1).x, pieces[1][0].x], [-0.5, -0.5], 'both end in the hole');
  assert.throws(() => layerChanges(route, [{ ...hole, x: 5 }]), /through a part at \(-0\.50, 0\.00\)/);
});

test('placement learnt from the source: small parts by the pins they serve, moved with them, checked', () => {
  // U1 a 4-pad chip; C1 decouples its pin 1 (net V, with GND); C2 on pin 3's own net Q, and nearer pin 2 on GND
  const pad = (pin, x, y, net) => ({ pin, x, y, w: 0.5, h: 0.5, angle: 0, smd: true, net });
  const c = { nets: { V: ['U1.1', 'C1.1'], Q: ['U1.3', 'C2.1'], GND: ['U1.2', 'C1.2', 'C2.2', 'U1.4'] }, parts: [
    { ref: 'U1', x: 0, y: 0, rotation: 0, layer: 'top', pads: [pad('1', -1, 1, 'V'), pad('2', -1, -1, 'GND'), pad('3', 1, -1, 'Q'), pad('4', 1, 1, 'GND')] },
    { ref: 'C1', x: -1, y: 2.5, rotation: 0, layer: 'top', pads: [pad('1', 0, -0.5, 'V'), pad('2', 0, 0.5, 'GND')] },
    { ref: 'C2', x: 0, y: -2.5, rotation: 90, layer: 'bottom', pads: [pad('1', 0, -0.5, 'Q'), pad('2', 0, 0.5, 'GND')] }] };
  const rules = learnPlacement(c);
  assert.deepEqual(rules.map((r) => [r.part, r.anchor, r.pin, r.net]), [['C1', 'U1', '1', 'V'], ['C2', 'U1', '3', 'Q']], 'by the most particular net, not GND');
  assert.deepEqual([rules[0].source, rules[0].max], [1, 1.5], 'a quarter more, at least 0.5 mm');
  const turned = arrange(c, { U1: { x: 10, y: 0, rotation: 90 } }, rules), [u, c1, c2] = turned.parts;
  assert.deepEqual([u.x, u.y, u.rotation], [10, 0, 90]);
  assert.deepEqual([c1.x, c1.y, c1.rotation], [7.5, -1, 90], 'C1 swung round U1 with it');
  assert.deepEqual([c2.x, c2.y, c2.rotation], [12.5, 0, 0], 'on the back: turned the other way, seen from its side');
  assert.deepEqual(padsOnBoard(c1).map((q) => [q.bx, q.by]), [[8, -1], [7, -1]]);
  assert.deepEqual(placementChecks(turned, rules).map((f) => f.level), ['pass']);
  const far = placementChecks(arrange(c, { C1: { x: -1, y: 6 } }, rules), rules);
  assert.deepEqual(far.map((f) => f.text), ['placement: C1 is 4.5 mm from U1 pin 1 (V): at most 1.5 (1 on the source)']);
  assert.throws(() => arrange(c, { U9: { x: 0 } }), /no part U9/);
});

test('4 layers: a plane net reaches its inner layer through a via per pad, its copper poured round the others, all checked', async () => {
  const c = fromKicadPcb(KICAD), k = clone(c, { layers: 4, planes: ['B'] });
  assert.deepEqual(k.planes, { B: { layer: 'inner1', pins: ['R1.pin2', 'R2.pin1', 'R3.pin1', 'R4.pin1'] } });
  assert.match(k.notes.join(' | '), /planes on inner layers: B on inner1 \(4 pads\)/);
  const json = await render({ outline: k.outline, thickness: 1.2, track: 0.2, autoroute: true, layers: 4, planes: k.planes, parts: k.parts, nets: k.nets, holes: k.holes }, stub);
  const count = (t) => json.filter((e) => e.type === t).length;
  assert.equal(json.find((e) => e.type === 'pcb_board').num_layers, 4);
  assert.equal(count('pcb_via'), 4, 'a via for each SMD pad of B');
  assert.ok(json.filter((e) => e.type === 'pcb_via').every((v) => v.layers.length === 4), 'through every layer');
  const pour = json.filter((e) => e.type === 'pcb_copper_pour');
  assert.ok(pour.length >= 1 && pour.every((p) => p.layer === 'inner1' && p.shape === 'brep'));
  assert.deepEqual(sameCircuit(json, c).map((f) => f.level), ['pass']);
  const found = await checks(json, { jlcpcb: loadRuleSet('jlcpcb').rules ? Object.fromEntries(Object.entries(loadRuleSet('jlcpcb').rules).map(([n, r]) => [n, r.value])) : {}, track: 0.2 });
  assert.match(found.map((f) => `${f.level}: ${f.text}`).join(' | '), /pass: plane B on inner1: all 4 pads reach it \(4 vias and holes inside its copper\)/);
  const fab = await fabFiles(json, 'clone');
  assert.ok(fab['clone.G1']?.length > 50, 'the inner layer has its own Gerber');
  assert.throws(() => clone(c, { layers: 2, planes: ['B'] }).planes.B, /Cannot read/, 'on 2 layers, no planes');
  await assert.rejects(render({ outline: k.outline, thickness: 1.2, track: 0.2, autoroute: true, planes: k.planes, parts: k.parts, nets: k.nets }, stub), /planes need a board of 4 layers/);
});

test('castellated and oval pads: a half hole on the edge, checked by the fab\'s rules; an oval pad round an off-centre hole', async () => {
  const c = fromKicadPcb(KICAD), k = clone(c);
  const json = await render({ outline: k.outline, thickness: 1.2, track: 0.2, autoroute: true, parts: k.parts, nets: k.nets, holes: k.holes }, stub);
  const holes = json.filter((e) => e.type === 'pcb_plated_hole');
  const half = holes.find((e) => e.port_hints.includes('castellated')), oval = holes.find((e) => e.shape === 'circular_hole_with_rect_pad');
  assert.deepEqual([half.x, half.y, half.hole_diameter], [-7, -5, 1], 'its centre on the bottom edge');
  assert.equal(json.find((e) => e.type === 'pcb_port' && e.pcb_port_id === half.pcb_port_id).y, -4.15, 'tracks join it at its inner edge');
  assert.deepEqual([oval.rect_pad_width, oval.rect_pad_height, oval.rect_border_radius, oval.hole_offset_x, oval.hole_offset_y], [1.7, 3, 0.85, 0, -0.7]);
  const jlc = Object.fromEntries(Object.entries(loadRuleSet('jlcpcb').rules).map(([n, r]) => [n, r.value]));
  const text = (await checks(json, { jlcpcb: jlc, track: 0.2 })).map((f) => `${f.level}: ${f.text}`).join(' | ');
  assert.match(text, /pass: 1 castellated holes on the edge, 1 mm or more/);
  assert.doesNotMatch(text, /outside the board's outline/, 'a half hole is meant to be on the edge');
  const small = json.map((e) => (e === half ? { ...e, hole_diameter: 0.5 } : e));
  assert.match((await checks(small, { jlcpcb: jlc, track: 0.2 })).map((f) => f.text).join(' | '), /castellated holes: 1 under JLCPCB's 0.6 mm/);
});

test('reshaping a clone: a part on new pads keeps its nets; a block of parts moves as one; a part keeps its own holes', () => {
  const c = fromKicadPcb(KICAD), j1 = c.parts.find((p) => p.ref === 'J1');
  const moved = withFootprint(c, 'J1', [{ pin: '1', x: 0, y: 0, w: 1.7, h: 1.7, hole: 1 }]);
  assert.equal(moved.parts.find((p) => p.ref === 'J1').pads[0].net, 'A', 'the pin keeps its net');
  assert.deepEqual(moved.nets, c.nets);
  assert.throws(() => withFootprint(c, 'J1', [{ pin: '2', x: 0, y: 0, w: 1, h: 1 }]), /missing 1; not on J1: 2/);
  assert.equal(j1.pads.length, 2);
  const g = moveGroup(c, ['R1', 'R2'], { turn: 90, dx: 1, dy: 2 }), [r1, r2] = g.parts;
  assert.deepEqual([r1.x, r1.y, r1.rotation], [1, -3, 180], 'R1 at (-5, 0), turned 90: (0, -5), moved (1, 2)');
  assert.deepEqual([r2.x, r2.y, r2.rotation], [1, 7, 270], 'R2 at (5, 0) on the back: to (0, 5), moved; turned the other way');
  assert.throws(() => moveGroup(c, ['R1'], { turn: 45 }), /quarter turns/);
  const pegged = fromKicadPcb(`(kicad_pcb (version 20211014) (layers (0 "F.Cu" signal) (31 "B.Cu" signal))
    (footprint "U:USB" (layer "F.Cu") (at 5 5) (property "Reference" "J9")
      (pad "1" smd rect (at 0 0) (size 1 1) (layers "F.Cu") (net 1 "V")) (pad "" np_thru_hole circle (at 2 1) (size 0.8 0.8) (drill 0.8) (layers *.Cu)))
    (gr_rect (start 0 0) (end 10 10) (layer "Edge.Cuts")))`);
  assert.deepEqual([pegged.parts[0].holes, pegged.holes], [[{ x: 2, y: -1, d: 0.8 }], []], 'a socket\'s pegs go with it');
  assert.deepEqual(clone(pegged).parts[0].holes, [{ x: 2, y: -1, d: 0.8 }]);
});

test('a clone\'s edge findings that the source has too are said, not failed; new ones fail', async () => {
  // R1's pad 1 is 0.1 mm from the left edge on the source
  const src = fromKicadPcb(`(kicad_pcb (version 20211014) (layers (0 "F.Cu" signal) (31 "B.Cu" signal))
    (footprint "R:R" (layer "F.Cu") (at 0.9 5) (property "Reference" "R1")
      (pad "1" smd rect (at -0.5 0) (size 0.6 0.5) (layers "F.Cu") (net 1 "A")) (pad "2" smd rect (at 0.5 0) (size 0.6 0.5) (layers "F.Cu") (net 2 "B")))
    (footprint "R:R" (layer "F.Cu") (at 5 5) (property "Reference" "R2")
      (pad "1" smd rect (at -0.5 0) (size 0.6 0.5) (layers "F.Cu") (net 1 "A")) (pad "2" smd rect (at 0.5 0) (size 0.6 0.5) (layers "F.Cu") (net 2 "B")))
    (gr_rect (start 0 0) (end 10 10) (layer "Edge.Cuts")))`);
  const jlc = Object.fromEntries(Object.entries(loadRuleSet('jlcpcb').rules).map(([n, r]) => [n, r.value]));
  const build = async (c) => { const k = clone(c); return render({ outline: k.outline, thickness: 1.6, track: 0.2, autoroute: true, parts: k.parts, nets: k.nets }, stub); };
  const text = async (c) => (await checks(await build(c), { jlcpcb: jlc, track: 0.2 }, null, { circuit: src, arranged: c })).map((f) => `${f.level}: ${f.text}`).join(' | ');
  const kept = await text(src);
  assert.match(kept, /info: as the source has them, so not failed: SMT pad R1\.pin1 violates copper-to-board-edge clearance/);
  assert.doesNotMatch(kept, /fail: [^|]*R1\.pin1 violates copper-to-board-edge/);
  const fresh = await text(arrange(src, { R2: { x: 4.4, y: 4.1 } })); // R2 now against the top right corner: new
  assert.match(fresh, /fail: [^|]*R2\.pin\d violates copper-to-board-edge clearance/);
});

test('keeping the source\'s routing: copper wholly within a moved block comes with it; nothing routes it again', async () => {
  const src = fromKicadPcb(`(kicad_pcb (version 20211014) (layers (0 "F.Cu" signal) (1 "In1.Cu" signal) (2 "In2.Cu" signal) (31 "B.Cu" signal))
    (net 0 "") (net 1 "A") (net 2 "GND") (net 3 "B")
    (footprint "R:R" (layer "F.Cu") (at 3 5) (property "Reference" "R1")
      (pad "1" smd rect (at -0.5 0) (size 0.6 0.5) (layers "F.Cu") (net 1 "A")) (pad "2" smd rect (at 0.5 0) (size 0.6 0.5) (layers "F.Cu") (net 2 "GND")))
    (footprint "R:R" (layer "F.Cu") (at 3 8) (property "Reference" "R2")
      (pad "1" smd rect (at -0.5 0) (size 0.6 0.5) (layers "F.Cu") (net 1 "A")) (pad "2" smd rect (at 0.5 0) (size 0.6 0.5) (layers "F.Cu") (net 3 "B")))
    (footprint "R:R" (layer "F.Cu") (at 15 8) (property "Reference" "R3")
      (pad "1" smd rect (at -0.5 0) (size 0.6 0.5) (layers "F.Cu") (net 3 "B")) (pad "2" smd rect (at 0.5 0) (size 0.6 0.5) (layers "F.Cu") (net 2 "GND")))
    (segment (start 2.5 5) (end 2.5 8) (width 0.2) (layer "F.Cu") (net 1))
    (segment (start 3.5 5) (end 4.5 5) (width 0.2) (layer "F.Cu") (net 2)) (via (at 4.5 5) (size 0.5) (drill 0.25) (layers "F.Cu" "B.Cu") (net 2))
    (segment (start 3.5 8) (end 14.5 8) (width 0.2) (layer "F.Cu") (net 3))
    (zone (net 2) (net_name "GND") (layer "In1.Cu"))
    (gr_rect (start 0 0) (end 20 12) (layer "Edge.Cuts")))`);
  assert.deepEqual([src.routing.tracks.length, src.routing.vias.length], [3, 1]);
  assert.deepEqual(src.routing.tracks[0], { a: { x: -7.5, y: 1 }, b: { x: -7.5, y: -2 }, width: 0.2, layer: 'top', net: 'A' });
  const moved = moveGroup(src, ['R1', 'R2'], { turn: 90, dx: 1 }, { keep: true });
  assert.deepEqual(moved.kept.islands.map((k) => [k.net, k.pins, k.via]), [['A', ['R1.1', 'R2.1'], false], ['GND', ['R1.2'], true]], 'B runs to R3, which stays: left to routing');
  assert.deepEqual(moved.kept.tracks.find((g) => g.net === 'A').a, { x: 0, y: -7.5 }, 'turned and moved with the block');
  const k = clone(moved, { layers: 4 });
  const json = await render({ outline: k.outline, thickness: 1.6, track: 0.2, autoroute: true, layers: 4, planes: k.planes, copper: k.copper, parts: k.parts, nets: k.nets }, stub);
  const st = json.filter((e) => e.type === 'source_trace');
  assert.ok(st.some((t) => /source's own copper/.test(t.display_name) && t.connected_source_port_ids.length === 2), 'A: joined by its kept track');
  assert.equal(st.filter((t) => !t.connected_source_net_ids?.length && !/own copper/.test(t.display_name)).length, 1, 'only B is left to route');
  const viasBy = (n) => json.filter((e) => e.type === 'pcb_via').length;
  assert.equal(viasBy(), 2, 'R1.2 reaches GND by its kept via; R3.2 gets one');
  assert.deepEqual(sameCircuit(json, src).map((f) => f.level), ['pass']);
  assert.match(k.notes.join(' | '), /the source's own routing kept: 3 tracks and 1 vias in 2 pieces, and 1 escapes routed on from where they leave/, 'B kept from R2 to the block\'s edge');
  assert.deepEqual(k.copper.stubs.map((b) => b.pin), ['R2.pin2']);
  assert.equal(arrange(moved, { R2: { x: 0, y: 0 } }).kept.islands.length, 1, 'R2 moved apart: the A track is left to routing');
});

test('round and rounded pads keep their shape: a test point is a circle, a rounded pad has its corners', async () => {
  const c = fromKicadPcb(`(kicad_pcb (version 20211014) (layers (0 "F.Cu" signal) (31 "B.Cu" signal))
    (footprint "T:TP" (layer "F.Cu") (at 3 5) (property "Reference" "TP1") (pad "1" smd circle (at 0 0) (size 1 1) (layers "F.Cu") (net 1 "A")))
    (footprint "R:R" (layer "F.Cu") (at 6 5) (property "Reference" "R1")
      (pad "1" smd roundrect (at -0.5 0) (size 0.6 0.5) (layers "F.Cu") (roundrect_rratio 0.25) (net 1 "A")) (pad "2" smd rect (at 0.5 0) (size 0.6 0.5) (layers "F.Cu") (net 2 "B")))
    (gr_rect (start 0 0) (end 10 10) (layer "Edge.Cuts")))`);
  assert.equal(c.parts[1].pads[0].corner, 0.125, 'a quarter of the shorter side');
  const k = clone(c), json = await render({ outline: k.outline, thickness: 1.6, track: 0.2, autoroute: true, parts: k.parts, nets: k.nets }, stub);
  const pads = json.filter((e) => e.type === 'pcb_smtpad');
  assert.deepEqual([pads[0].shape, pads[0].radius], ['circle', 0.5]);
  assert.deepEqual([pads[1].shape, pads[1].corner_radius, pads[2].corner_radius], ['rect', 0.125, undefined]);
});

test('kept copper joins as KiCad joins it: a track ending short of a pad by less than its half-width, two pieces meeting at a pad', async () => {
  // A: R1.1 to R2.1 by a track stopping 0.05 mm short of R2's pad; R2.1 on to R3.1 by a second piece from the pad's far side
  const src = fromKicadPcb(`(kicad_pcb (version 20211014) (layers (0 "F.Cu" signal) (31 "B.Cu" signal)) (net 0 "") (net 1 "A") (net 2 "B")
    (footprint "R:R" (layer "F.Cu") (at 3 5) (property "Reference" "R1")
      (pad "1" smd rect (at 0.5 0) (size 0.6 0.5) (layers "F.Cu") (net 1 "A")) (pad "2" smd rect (at -0.5 0) (size 0.6 0.5) (layers "F.Cu") (net 2 "B")))
    (footprint "R:R" (layer "F.Cu") (at 7 5) (property "Reference" "R2")
      (pad "1" smd rect (at 0 0) (size 0.6 0.5) (layers "F.Cu") (net 1 "A")) (pad "2" smd rect (at 0 2) (size 0.6 0.5) (layers "F.Cu") (net 2 "B")))
    (footprint "R:R" (layer "F.Cu") (at 11 5) (property "Reference" "R3")
      (pad "1" smd rect (at 0 0) (size 0.6 0.5) (layers "F.Cu") (net 1 "A")) (pad "2" smd rect (at 0 2) (size 0.6 0.5) (layers "F.Cu") (net 2 "B")))
    (segment (start 3.5 5) (end 6.65 5) (width 0.2) (layer "F.Cu") (net 1))
    (segment (start 7.2 5) (end 11 5) (width 0.2) (layer "F.Cu") (net 1))
    (gr_rect (start 0 0) (end 14 10) (layer "Edge.Cuts")))`);
  const moved = moveGroup(src, ['R1', 'R2', 'R3'], {}, { keep: true });
  assert.deepEqual(moved.kept.islands.map((k) => k.pins), [['R1.1', 'R2.1'], ['R2.1', 'R3.1']], 'the short track still reaches R2.1');
  const k = clone(moved);
  let asked;
  await render({ outline: k.outline, thickness: 1.6, track: 0.2, autoroute: true, copper: k.copper, parts: k.parts, nets: k.nets },
    { route: async (json, toRoute) => { asked = toRoute.map(({ a, b }) => [a.source.name, b.source.name]); return { traces: [] }; } });
  assert.deepEqual(asked, [['pin2', 'pin2'], ['pin2', 'pin2']], 'only B (three pins, two joins) is routed: A is joined by its kept pieces');
});

test('the router sees existing vias at their real size, and keeps a board\'s own clearance', async () => {
  const c = fromKicadPcb(KICAD), k = clone(moveGroup(c, ['R1', 'R2', 'R3', 'R4', 'J1'], {}, { keep: true }), { layers: 4, planes: ['B'] });
  let srj;
  await render({ outline: k.outline, thickness: 1.2, track: 0.2, autoroute: true, layers: 4, planes: k.planes, parts: k.parts, nets: k.nets, via_pad: 0.5, via_hole: 0.25, clearance: 0.15 },
    { route: async (json, toRoute, board) => { srj = await routeInput(json, toRoute, board); return { traces: [] }; } });
  assert.equal(srj.defaultObstacleMargin, 0.15);
  assert.ok(srj.obstacles.some((o) => o.width === 0.5 && o.height === 0.5), 'a plane via, 0.5 mm, not the board\'s smallest');
});

test('necking: two routed tracks a little too close are narrowed where they pass, to the fab\'s smallest track', async () => {
  // Two straight connections 0.214 mm apart, centre to centre, at 0.15 mm wide: a 0.064 mm gap
  const pad = (pin) => ({ pin, smd: true, hint: pin, x: 0, y: 0, w: 0.4, h: 0.4 });
  const part = (name, x, y) => ({ name, ftype: 'simple_chip', x, y, layer: 'top', rotation: 0, pads: [pad('pin1')] });
  let json;
  await render({ center: { x: 0, y: 0 }, width: 20, height: 10, thickness: 1.6, track: 0.15, autoroute: true,
    parts: [part('A1', -4, 0), part('A2', 4, 0), part('B1', -4, 0.214), part('B2', 4, 0.214)], nets: { A: ['A1.pin1', 'A2.pin1'], B: ['B1.pin1', 'B2.pin1'] } },
  { route: async (j) => { json = j; return { traces: [] }; } });
  const line = (id, y) => ({ source_trace_id: id, route: [{ route_type: 'wire', x: -4, y, width: 0.15, layer: 'top' }, { route_type: 'wire', x: 4, y, width: 0.15, layer: 'top' }], vias: [] });
  const necked = await neckDown(json, [line('source_trace_0', 0), line('source_trace_1', 0.214)], 0.1);
  assert.deepEqual(necked.map((t) => t.route.map((p) => p.width)), [[0.1, 0.1], [0.1, 0.1]], 'both narrowed: a 0.114 mm gap');
});

test('parts the source keeps off its BOM and placement files (edge pads, test points) stay off them', async () => {
  const c = fromKicadPcb(`(kicad_pcb (version 20211014) (layers (0 "F.Cu" signal) (31 "B.Cu" signal))
    (footprint "R:R" (layer "F.Cu") (at 3 5) (property "Reference" "R1") (property "LCSC" "C25744") (attr smd)
      (pad "1" smd rect (at -0.5 0) (size 0.6 0.5) (layers "F.Cu") (net 1 "A")) (pad "2" smd rect (at 0.5 0) (size 0.6 0.5) (layers "F.Cu") (net 2 "B")))
    (footprint "T:TP" (layer "F.Cu") (at 7 5) (property "Reference" "TP1") (attr exclude_from_pos_files exclude_from_bom)
      (pad "1" smd circle (at 0 0) (size 1 1) (layers "F.Cu") (net 1 "A")))
    (gr_rect (start 0 0) (end 10 10) (layer "Edge.Cuts")))`);
  assert.deepEqual(c.parts.map((p) => [p.ref, p.bom, p.place]), [['R1', undefined, undefined], ['TP1', false, false]]);
  const k = clone(c), json = await render({ outline: k.outline, thickness: 1.6, track: 0.2, autoroute: true, parts: k.parts, nets: k.nets }, stub);
  const fab = await fabFiles(json, 'x');
  assert.match(fab['x-bom.csv'], /R1/);
  assert.doesNotMatch(fab['x-bom.csv'], /TP1/);
  assert.doesNotMatch(fab['x-cpl.csv'], /TP1/);
});

test('3D models: KiCad\'s VRML read in mm, a STEP file measured, each model placed on its part (turned, or under the board on the back)', async () => {
  // A square face 0.2 x 0.2 tenths of an inch (0.508 mm), 0.1 up: two triangles
  const tris = wrlMesh('Shape { geometry IndexedFaceSet { coordIndex [0,1,2,3,-1] coord Coordinate { point [0 0 0.1,0.2 0 0.1,0.2 0.2 0.1,0 0.2 0.1] } } }');
  assert.equal(tris.length, 2);
  assert.deepEqual(tris[0][1].map((n) => Math.round(n * 1000) / 1000), [0.508, 0, 0.254]);
  const step = "ISO-10303-21; DATA; #1=SI_UNIT(.MILLI.,.METRE.); #2=CARTESIAN_POINT('',(-1.,0.,0.)); #3=CARTESIAN_POINT('',(2.,3.,1.5)); ENDSEC;";
  assert.deepEqual(stepBounds(step), { min: [-1, 0, 0], max: [2, 3, 1.5] });
  assert.deepEqual(stepBounds(step.replace('SI_UNIT(.MILLI.,.METRE.)', "CONVERSION_BASED_UNIT('INCH')")).max, [50.8, 76.2, 38.1], 'inches');
  // A 1 x 2 x 1 box model on a part turned 90 at (10, 0) on top, and the same on the back at (-10, 0)
  const model = (x, layer, rotation) => ({ type: 'cad_component', rulecad_model: { box: { min: [0, 0, 0], max: [1, 2, 1] }, scale: [1, 1, 1], rotate: [0, 0, 0], offset: [0, 0, 0], turn: 0, x, y: 0, rotation, layer } });
  const bounds = (t) => { const p = t.flat(); return [0, 1, 2].map((i) => [Math.min(...p.map((v) => v[i])), Math.max(...p.map((v) => v[i]))]); };
  assert.deepEqual(bounds(partModels([model(10, 'top', 90)], { thickness: 1.6 })), [[8, 10], [0, 1], [1.6, 2.6]], 'turned a quarter, on the board\'s top');
  assert.deepEqual(bounds(partModels([model(-10, 'bottom', 0)], { thickness: 1.6 })), [[-10, -9], [-2, 0], [-1, 0]], 'on the back: turned over top to bottom (as KiCad flips a footprint), hanging below');
});
