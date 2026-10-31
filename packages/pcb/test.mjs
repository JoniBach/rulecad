import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from '@rulecad/variables';
import { createRequire } from 'node:module';
const loadRuleSet = (name) => createRequire(import.meta.url)(`@rulecad/rules/${name}.json`); // the published sets, read as they are
import { grid, keyboard, render, checks, fabFiles, kicadFiles, views, light, part, header, xiao, qwiic, jstph, shape, parts, solids, outputs, fromKicadPcb, clone, sameCircuit } from '@rulecad/pcb';
import { layerChanges } from './circuit.mjs';

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
  assert.deepEqual(k.notes.map((n) => n.split(' ').slice(0, 3).join(' ')), ['castellated pads left', 'oval pads drawn', 'holes set off-centre'], 'B is filled on an outer layer only: still routed');
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
