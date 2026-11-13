import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('./bin/cad.mjs', import.meta.url));
const ROOT_MODULES = fileURLToPath(new URL('../../node_modules', import.meta.url)); // stands in for npm install @jscad/modeling

// A fresh workspace, as the README's quick start makes one
function workspace(config) {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'rulecad-'));
  fs.writeFileSync(path.join(ws, 'package.json'), JSON.stringify({ type: 'module' }));
  if (config) fs.writeFileSync(path.join(ws, 'cad.config.json'), JSON.stringify(config));
  fs.symlinkSync(ROOT_MODULES, path.join(ws, 'node_modules'), 'junction');
  const env = { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') }; // (the user's own trust list, kept out of their home)
  const cad = (...a) => { try { return execFileSync(process.execPath, [BIN, ...a], { cwd: ws, encoding: 'utf8', stdio: 'pipe', env }); } catch (e) { return `${e.stdout}${e.stderr}`; } };
  return { ws, cad, done: () => fs.rmSync(ws, { recursive: true, force: true }) };
}

test('cad rules check, draw and draft: a set held to its rules, drawn from them, and a datasheet\'s figures offered, never trusted', () => {
  const { ws, cad, done } = workspace();
  try {
    assert.match(cad('rules', 'check', 'nema17'), /1 of 1 rule sets pass/);
    fs.mkdirSync(path.join(ws, 'rules'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'rules/bad.json'), JSON.stringify({ name: 'bad', rules: { width: { value: 3, unit: 'mm', rule: 'A width in mm', kind: 'guess', checked: 'soon' } } }));
    const r = spawnSync('node', [BIN, 'rules', 'check', 'bad'], { cwd: ws, encoding: 'utf8' });
    assert.equal(r.status, 1); assert.match(r.stdout, /kind "guess"/); assert.match(r.stdout, /has no source/); assert.match(r.stdout, /YYYY-MM-DD/);
    const check = JSON.parse(cad('rules', 'check', 'pico', '--json'));
    assert.deepEqual(check, [{ name: 'pico', findings: [] }]);
    // drawn from its figures; a set that says nothing of its shape is refused, not drawn wrong
    cad('rules', 'draw', 'nema17');
    const svg = fs.readFileSync(path.join(ws, 'nema17.svg'), 'utf8');
    for (const t of ['42.3', 'holes 31', 'boss Ø22', 'shaft 24', 'flat 15', '4 × M3, 4.5 deep']) assert.ok(svg.includes(t), `the drawing shows ${t}`);
    assert.equal(spawnSync('node', [BIN, 'rules', 'draw', 'x1c'], { cwd: ws, encoding: 'utf8' }).status, 1);
    // a small PDF with figures in its text, and one with none (a scan): only ever estimates
    const pdf = (body) => Buffer.from(`%PDF-1.4\n1 0 obj<<>>stream\n${body}\nendstream\nendobj\n`, 'latin1');
    fs.writeFileSync(path.join(ws, 'sheet.pdf'), pdf('BT (Shaft 5 mm, torque 0.59 N m) Tj ET'));
    assert.match(cad('rules', 'draft', 'mine', '--from', 'sheet.pdf'), /2 figures/);
    const draft = JSON.parse(fs.readFileSync(path.join(ws, 'rules/mine.json'), 'utf8'));
    assert.deepEqual(Object.values(draft.rules).map((x) => [x.value, x.kind]), [[5, 'estimate'], [0.59, 'estimate']]);
    fs.writeFileSync(path.join(ws, 'scan.pdf'), pdf('q 1 0 0 1 0 0 cm /Im0 Do Q'));
    assert.match(cad('rules', 'draft', 'scan', '--from', 'scan.pdf'), /read it by eye/);
    assert.ok(!fs.existsSync(path.join(ws, 'rules/scan.json')));
    // the drawings in the rules package are what the sets say today
    for (const f of fs.readdirSync(new URL('../rules/drawings/', import.meta.url))) { cad('rules', 'draw', f.slice(0, -4), '--out', 'x.svg'); assert.equal(fs.readFileSync(path.join(ws, 'x.svg'), 'utf8'), fs.readFileSync(new URL(`../rules/drawings/${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n'), `${f} is stale: cad rules draw it again`); } // (git on Windows checks it out with CRLF)
  } finally { done(); }
});

test('the quick start: new, check, tweak, export, link, with the printer rules copied in', () => {
  const { ws, cad, done } = workspace();
  try {
    assert.match(cad('new', 'bathroom/soap-tray'), /made projects\/bathroom\/objects\/soap-tray/);
    const checked = cad('check', 'bathroom/soap-tray');
    assert.match(checked, /every measurement is a variable/);
    assert.match(checked, /fits the bed/);
    assert.ok(fs.existsSync(path.join(ws, 'rules/x1c.json')), 'the printer rules are the workspace\'s own copy');
    assert.match(cad('check', 'bathroom/soap-tray', '--set', 'width=60'), /60 × 30 × 10 mm/);
    assert.match(cad('check', 'bathroom/soap-tray', '--set', 'width=999'), /from 10 to 200/);
    assert.match(cad('export', 'bathroom/soap-tray'), /soap-tray@0\.1\.0\.3mf/);
    assert.match(cad('link', 'bathroom/soap-tray', '--md'), /\[View and download\]\(https:\/\/.*#m=1\./);
  } finally { done(); }
});

test('a raw number in a design fails the check', () => {
  const { ws, cad, done } = workspace();
  try {
    cad('new', 'demo/block');
    const js = path.join(ws, 'projects/demo/objects/block.js');
    fs.writeFileSync(js, fs.readFileSync(js, 'utf8').replace('export function main', 'const sneaky = 17\nexport function main'));
    assert.match(cad('check', 'demo/block'), /should be variables: line \d+: 17/);
  } finally { done(); }
});

test('your own printer, and no extras configured', () => {
  const { ws, cad, done } = workspace({ printer: 'tiny' });
  try {
    fs.mkdirSync(path.join(ws, 'rules'));
    fs.writeFileSync(path.join(ws, 'rules/tiny.json'), JSON.stringify({ name: 'tiny', rules: { bed: { value: 5 }, overhang: { value: 45 }, layer: { value: 0.2 } } }));
    cad('new', 'demo/block');
    assert.match(cad('check', 'demo/block'), /bigger than the 5 mm bed/);
    assert.match(cad('show', 'demo/block'), /no "show" target/);
  } finally { done(); }
});

test('"display" settings and parts are read as the on-screen copy ("mirror", the old name, too)', async () => {
  const { readObject } = await import('./lib/design.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'display-')), json = path.join(dir, 'x.json');
  try {
    fs.writeFileSync(json, JSON.stringify({ display: { smooth: 8 }, parts: { legend: { display: false }, cap: {} } }));
    const o = readObject({ json });
    assert.deepEqual(o.mirror, { smooth: 8 });
    assert.equal(o.parts.legend.mirror, false);
    assert.equal(o.parts.cap.mirror, undefined);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('import-kle: a keyboard-layout-editor.com layout into the project, with notes on what it had to change', () => {
  const { ws, cad, done } = workspace();
  try {
    fs.writeFileSync(path.join(ws, 'kle.json'), JSON.stringify([['Esc', { x: 0.5 }, 'F1'], [{ w: 1.5 }, 'Tab', { r: 10 }, 'Q']]));
    const out = cad('import-kle', 'kle.json', 'keys/mine');
    assert.match(out, /made projects[\\/]keys[\\/]layouts[\\/]mine\.json: 2 rows, 4 keys/); // \ on Windows
    assert.match(out, /note: rotated keys/);
    const layout = JSON.parse(fs.readFileSync(path.join(ws, 'projects/keys/layouts/mine.json'), 'utf8'));
    assert.deepEqual(layout.rows[0], ['Esc', { gap: 0.5 }, 'F1']);
    assert.match(cad('import-kle', 'kle.json', 'keys/mine'), /already exists/);
  } finally { done(); }
});

test('cad clone: a published KiCad board into a rule set, its source and licence kept, what boards here can\'t carry said', async () => {
  const { ws, cad, done } = workspace();
  try {
    const board = `(kicad_pcb (version 20211014) (generator pcbnew) (general (thickness 1.6))
      (layers (0 "F.Cu" signal) (1 "In1.Cu" signal) (2 "In2.Cu" signal) (31 "B.Cu" signal))
      (footprint "R:R_0402" (layer "F.Cu") (at 5 5) (property "Reference" "R1")
        (pad "1" smd rect (at -0.5 0) (size 0.6 0.5) (layers "F.Cu") (net 1 "A")) (pad "2" smd rect (at 0.5 0) (size 0.6 0.5) (layers "F.Cu") (net 2 "GND")))
      (footprint "J:Pin" (layer "F.Cu") (at 9 5) (property "Reference" "J1")
        (pad "1" thru_hole circle (at 0 0) (size 1.7 1.7) (drill 1) (property pad_prop_castellated) (layers *.Cu) (net 1 "A"))
        (pad "2" thru_hole circle (at 0 -2.54) (size 1.7 1.7) (drill 1) (layers *.Cu) (net 2 "GND")))
      (gr_rect (start 0 0) (end 10 10) (layer "Edge.Cuts"))
      (zone (net 2) (net_name "GND") (layers "In1.Cu" "B.Cu")))`;
    fs.writeFileSync(path.join(ws, 'tiny.kicad_pcb'), board);
    const out = cad('clone', 'tiny.kicad_pcb', 'tiny', '--source', 'https://example.org/tiny', '--licence', 'CERN-OHL-S-2.0');
    assert.match(out, /made rules[\\/]tiny\.json: 2 parts, 2 nets, 10 × 10 mm, 4 copper layers, planes GND/);
    assert.match(out, /note: planes on inner layers: GND on inner1 \(2 pads\)/);
    assert.match(out, /note: castellated pads on 1 part \(J1\)/);
    assert.match(out, /placement: 0 small parts kept near the pins they serve/);
    assert.match(out, /is reciprocal: boards made from this must be shared under it too/);
    const set = JSON.parse(fs.readFileSync(path.join(ws, 'rules/tiny.json'), 'utf8'));
    assert.equal(set.licence, 'CERN-OHL-S-2.0');
    assert.deepEqual(set.rules.width, { value: 10, unit: 'mm', rule: set.rules.width.rule, kind: 'derived', source: 'https://example.org/tiny', licence: 'CERN-OHL-S-2.0', checked: set.rules.width.checked });
    assert.equal(set.rules.layers.value, 4);
    assert.deepEqual(set.circuit.nets, { A: ['R1.1', 'J1.1'], GND: ['R1.2', 'J1.2'] });
    assert.equal(set.circuit.source.from, 'https://example.org/tiny');
    const { schemaFindings } = await import('./lib/schema.mjs');
    assert.deepEqual(schemaFindings(set, 'rules', 'rules/tiny.json'), [], 'a valid rule set');
    const { resolve } = await import('@rulecad/variables');
    const v = resolve({ uses: ['tiny'], variables: {} }, { load: () => set }).values;
    assert.deepEqual(v.tiny.circuit.nets, set.circuit.nets, 'a design gets the circuit');
    assert.match(cad('clone', 'tiny.kicad_pcb', 'tiny'), /already exists/);
    assert.match(cad('clone', 'tiny.kicad_pcb', 'tiny2'), /no licence given/);
    assert.match(cad('clone', 'tiny.kicad_pcb', 'Tiny'), /usage: cad clone/);
    assert.match(cad('clone', 'missing.kicad_pcb', 'x'), /no file missing\.kicad_pcb/);
  } finally { done(); }
});

test('cad clone keeps each part\'s 3D model: a mesh beside a board read from a file, a box for a STEP-only one', () => {
  const { ws, cad, done } = workspace();
  try {
    fs.mkdirSync(path.join(ws, 'lib'));
    fs.writeFileSync(path.join(ws, 'lib/r.wrl'), 'Shape { geometry IndexedFaceSet { coordIndex [0,1,2,-1] coord Coordinate { point [0 0 0,0.2 0 0,0 0.2 0.1] } } }');
    fs.writeFileSync(path.join(ws, 'lib/sock.step'), "DATA; #1=SI_UNIT(.MILLI.,.METRE.); #2=CARTESIAN_POINT('',(-4.,0.,-1.)); #3=CARTESIAN_POINT('',(4.,7.,1.)); ENDSEC;");
    const pad = (n, x) => `(pad "${n}" smd rect (at ${x} 0) (size 0.6 0.5) (layers "F.Cu") (net ${n} "N${n}"))`;
    fs.writeFileSync(path.join(ws, 'b.kicad_pcb'), `(kicad_pcb (version 20211014) (layers (0 "F.Cu" signal) (31 "B.Cu" signal))
      (footprint "R" (layer "F.Cu") (at 3 5) (property "Reference" "R1") ${pad(1, -0.5)} ${pad(2, 0.5)} (model "\${KIPRJMOD}/lib/r.wrl" (offset (xyz 0 0 0)) (scale (xyz 1 1 1)) (rotate (xyz 0 0 0))))
      (footprint "J" (layer "F.Cu") (at 7 5) (property "Reference" "J1") ${pad(1, -1)} ${pad(2, 1)} (model "\${KIPRJMOD}/lib/sock.step" (offset (xyz 0 0 0)) (scale (xyz 1 1 1)) (rotate (xyz 0 0 0))))
      (gr_rect (start 0 0) (end 10 10) (layer "Edge.Cuts")))`);
    const out = cad('clone', 'b.kicad_pcb', 'b', '--licence', 'MIT');
    assert.match(out, /3D models: 1 as meshes \(in models\/\), 1 as boxes the size of the part/);
    const set = JSON.parse(fs.readFileSync(path.join(ws, 'rules/b.json'), 'utf8')), models = set.circuit.models;
    assert.equal(models['${KIPRJMOD}/lib/r.wrl'].mesh, 'models/source/r.json');
    assert.equal(JSON.parse(fs.readFileSync(path.join(ws, 'models/source/r.json'), 'utf8')).triangles.length, 1);
    assert.deepEqual(models['${KIPRJMOD}/lib/sock.step'].box, { min: [-4, 0, -1], max: [4, 7, 1] });
    assert.doesNotMatch(cad('clone', 'b.kicad_pcb', 'b2', '--licence', 'MIT', '--no-models'), /3D models/);
  } finally { done(); }
});

test('cad agents: AGENTS.md for AI agents, included from CLAUDE.md without losing what was there', () => {
  const { ws, cad, done } = workspace();
  try {
    fs.writeFileSync(path.join(ws, 'CLAUDE.md'), 'Our own notes.\n');
    assert.match(cad('agents'), /wrote AGENTS\.md/);
    assert.match(fs.readFileSync(path.join(ws, 'AGENTS.md'), 'utf8'), /Rules first/);
    assert.equal(fs.readFileSync(path.join(ws, 'CLAUDE.md'), 'utf8'), 'Our own notes.\n\n@AGENTS.md\n');
    cad('agents');
    assert.equal(fs.readFileSync(path.join(ws, 'CLAUDE.md'), 'utf8'), 'Our own notes.\n\n@AGENTS.md\n', 'only once');
    // An AGENTS.md edited here is kept, unless --force
    fs.appendFileSync(path.join(ws, 'AGENTS.md'), '\n## Our house rules\n');
    assert.match(cad('agents'), /AGENTS\.md here has been edited .*: it is kept as it is \(cad agents --force replaces it\)/);
    assert.match(fs.readFileSync(path.join(ws, 'AGENTS.md'), 'utf8'), /Our house rules/);
    cad('agents', '--force');
    assert.doesNotMatch(fs.readFileSync(path.join(ws, 'AGENTS.md'), 'utf8'), /Our house rules/);
  } finally { done(); }
});

test('cad set refuses a value outside its range, cad add fit a part that isn\'t there; --json is JSON for rules, variants, history and export', () => {
  const { ws, cad, done } = workspace();
  try {
    cad('new', 'home/tray');
    assert.match(cad('set', 'home/tray', 'width=-5'), /not changed: width = -5 is outside its range/);
    assert.match(cad('set', 'home/tray', 'width=50'), /set width/);
    fs.mkdirSync(path.join(ws, 'projects/home/assemblies'));
    fs.writeFileSync(path.join(ws, 'projects/home/assemblies/pair.json'), JSON.stringify({ title: 'Pair', kind: 'fit', items: [{ id: 'a', object: 'tray' }, { id: 'b', object: 'tray', at: [100, 0, 0] }] }));
    assert.match(cad('add', 'fit', 'home/pair', '--a', 'a.lid', '--b', 'b.body', '--min', '0', '--max', '1'), /fit a: tray has no part "lid" \(parts: body\)/);
    assert.match(cad('add', 'fit', 'home/pair', '--a', 'c.body', '--b', 'b.body', '--min', '0', '--max', '1'), /fit a: no item "c" in home\/pair/);
    assert.match(cad('add', 'fit', 'home/pair', '--a', 'a.body', '--b', 'b.body', '--min', '0', '--max', '1'), /added a fit/);
    for (const args of [['rules', 'home/tray'], ['variants', 'home/tray'], ['history', 'home/tray'], ['export', 'home/tray']]) {
      const out = cad(...args, '--json');
      assert.doesNotThrow(() => JSON.parse(out), `${args.join(' ')} --json: ${out}`);
    }
    assert.ok(JSON.parse(cad('export', 'home/tray', '--json')).file.endsWith('.3mf'));
  } finally { done(); }
});

// Write an object (its .json and .js) into a workspace
const object = (ws, ref, json, js) => {
  const [project, name] = ref.split('/'), dir = path.join(ws, 'projects', project, 'objects');
  fs.mkdirSync(dir, { recursive: true });
  const pj = path.join(ws, 'projects', project, 'project.json');
  const p = fs.existsSync(pj) ? JSON.parse(fs.readFileSync(pj, 'utf8')) : { name: project, objects: [] };
  if (!p.objects.includes(name)) p.objects.push(name);
  fs.writeFileSync(pj, JSON.stringify(p));
  fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify({ name, title: name, version: '0.1.0', ...json }));
  fs.writeFileSync(path.join(dir, `${name}.js`), js);
};
const BOX = `import jscad from '@jscad/modeling'
const { cuboid } = jscad.primitives, { translate } = jscad.transforms
export function main (v) { return translate([0, 0, v.h / 2], cuboid({ size: [v.w, v.d, v.h] })) }
`;

test('a link too long for chat says so, and how to get short ones', () => {
  const { ws, cad, done } = workspace();
  try {
    object(ws, 'demo/ball', { variables: { r: { value: 10, unit: 'mm', rule: 'Radius' }, n: { value: 256, unit: 'segments', rule: 'Smooth' } } },
      "import jscad from '@jscad/modeling'\nexport function main (v) { return jscad.transforms.translate([0, 0, v.r], jscad.primitives.sphere({ radius: v.r, segments: v.n })) }\n");
    const r = spawnSync(process.execPath, [BIN, 'link', 'demo/ball', '--md'], { cwd: ws, encoding: 'utf8' });
    assert.ok(/too long for chat or email\. For short links, add "shorten": "gist"/.test(r.stderr), 'the warning is on stderr'); // (no regex match: the link is huge)
    assert.equal(r.stdout.trim().split('\n').length, 1, '--md still prints one line');
  } finally { done(); }
});

test('objects read each other: a frame sized from a plate follows it, versions are checked, and loops are named', () => {
  const { ws, cad, done } = workspace();
  try {
    object(ws, 'demo/plate', { variables: { w: { value: 40, unit: 'mm', rule: 'Plate width' }, d: { value: 20, unit: 'mm', rule: 'Depth' }, h: { value: 2, unit: 'mm', rule: 'Height' } } }, BOX);
    object(ws, 'demo/frame', { uses: ['demo/plate@^0.1.0'], variables: {
      w: { value: 'plate.w + 2', unit: 'mm', rule: 'Round the plate' }, d: { value: 'plate.d + 2', unit: 'mm', rule: 'Round the plate' }, h: { value: 'plate.h', unit: 'mm', rule: 'As thick' } } }, BOX);
    assert.match(cad('check', 'demo/frame'), /42 × 22 × 2 mm/);
    assert.match(cad('rules', 'demo/frame'), /plate\.w.*demo\/plate@0\.1\.0/);
    const pj = path.join(ws, 'projects/demo/objects/plate.json'), plate = JSON.parse(fs.readFileSync(pj, 'utf8'));
    fs.writeFileSync(pj, JSON.stringify({ ...plate, variables: { ...plate.variables, w: { ...plate.variables.w, value: 50 } } }));
    assert.match(cad('check', 'demo/frame'), /52 × 22 × 2 mm/, 'the frame follows the plate');
    fs.writeFileSync(pj, JSON.stringify({ ...plate, version: '1.0.0' }));
    assert.match(cad('check', 'demo/frame'), /uses demo\/plate \^0\.1\.0, but demo\/plate is 1\.0\.0/);
    fs.writeFileSync(pj, JSON.stringify({ ...plate, uses: ['demo/frame'] }));
    assert.match(cad('check', 'demo/frame'), /read each other's numbers/);
  } finally { done(); }
});

test('a holes fit follows a board\'s mounting holes into what they screw into: inserts under them pass, moved ones fail', () => {
  const { ws, cad, done } = workspace();
  try {
    fs.mkdirSync(path.join(ws, 'rules'));
    fs.writeFileSync(path.join(ws, 'rules/demo.json'), JSON.stringify({ name: 'demo', rules: { insert: { value: 3, unit: 'mm', rule: 'Insert depth', kind: 'spec' } } }));
    object(ws, 'demo/board', { engine: 'pcb', role: 'board', uses: ['jlcpcb'], parts: { board: { label: 'PCB' } }, variables: {
      w: { value: 30, unit: 'mm', rule: 'Width' }, d: { value: 20, unit: 'mm', rule: 'Depth' }, thickness: { value: 'jlcpcb.thickness', unit: 'mm', rule: 'Standard' },
      hx: { value: 11, unit: 'mm', rule: 'Hole from the centre' }, hd: { value: 2.4, unit: 'mm', rule: 'M2 clearance' } } },
    'export function main (v) { return { center: { x: 0, y: 0 }, width: v.w, height: v.d, thickness: v.thickness, parts: [], traces: [], silk: [], holes: [-1, 1].map((s) => ({ x: s * v.hx, y: 0, d: v.hd })) } }\n');
    const block = (offset) => `import jscad from '@jscad/modeling'
const { cuboid, cylinder } = jscad.primitives, { translate } = jscad.transforms, { subtract } = jscad.booleans
export function main (v) {
  const holes = v.board.board_holes.map((h) => translate([h.x + v.shift, h.y, v.h - v.demo.insert / 2], cylinder({ radius: v.r, height: v.demo.insert })))
  return subtract(translate([0, 0, -v.h / 2], cuboid({ size: [v.board.board_w, v.board.board_d, v.h] })), ...holes.map((c) => translate([0, 0, -v.h], c)))
}
`;
    const vars = { h: { value: 6, unit: 'mm', rule: 'Block height' }, r: { value: 1.6, unit: 'mm', rule: 'Insert hole radius' }, shift: { value: 0, unit: 'mm', rule: 'Holes moved by' } };
    object(ws, 'demo/block', { uses: ['demo', 'demo/board'], variables: vars }, block());
    fs.mkdirSync(path.join(ws, 'projects/demo/assemblies'));
    fs.writeFileSync(path.join(ws, 'projects/demo/assemblies/stack.json'), JSON.stringify({ title: 'Board on block', kind: 'fit', uses: ['demo'], items: [{ id: 'blk', object: 'block' }, { id: 'pcb', object: 'board' }],
      fits: [{ holes: 'pcb.board', into: 'blk.body', depth: 'demo.insert', label: 'Screws find their inserts' }, { a: 'pcb.board', b: 'blk.body', min: 0, max: 0.2, label: 'Board on block' }] }));
    assert.match(cad('check', 'demo/stack'), /Screws find their inserts: 2 of 2 holes clear for 3 mm, with material around each/);
    const bj = path.join(ws, 'projects/demo/objects/block.json'), b = JSON.parse(fs.readFileSync(bj, 'utf8'));
    fs.writeFileSync(bj, JSON.stringify({ ...b, variables: { ...vars, shift: { ...vars.shift, value: 4 } } }));
    const moved = cad('check', 'demo/stack');
    assert.match(moved, /Screws find their inserts: hole at -11, 0 mm: solid/, 'moved inserts: the screws hit solid');
    assert.match(moved, /pcb\.board \/ blk\.body: closest gap 0 mm/, 'while the gap fit alone still passes');
  } finally { done(); }
});

// A rail-like test part: a plate with a key standing on part of it, and a notch in the key's top
async function railPart() {
  const { primitives: { cuboid }, booleans: { union, subtract }, transforms: { translate } } = (await import('@jscad/modeling')).default;
  const box = (lo, size) => translate(lo.map((a, i) => a + size[i] / 2), cuboid({ size }));
  const g = subtract(union(box([0, -5, 0], [40, 10, 2]), box([10, -2, 2], [20, 4, 3])), box([18, -3, 3.5], [4, 6, 2]));
  const { polygons } = await import('./lib/design.mjs');
  return polygons(g, { triangulate: true }).flatMap((p) => p.slice(1, -1).map((_, i) => [p[0], p[i + 1], p[i + 2]]));
}

test('mesh: the stretches with the same section, lines along a part, and STL and 3MF files read back', async () => {
  const m = await import('./lib/mesh.mjs');
  const tris = await railPart();
  const runs = m.profiles(tris, 0).map((r) => [r.from, r.to, r.shape]);
  assert.deepEqual(runs, [[0, 10, 0], [10, 18, 1], [18, 22, 2], [22, 30, 1], [30, 40, 0]], 'plate, key, notch, key, plate: the same sections numbered alike');
  const key = m.profiles(tris, 0)[1];
  assert.deepEqual(key.bands.map((b) => [b.from, b.to, b.pieces]), [[0, 2, 1], [2, 5, 1]], 'a step where the key stands on the plate splits the bands');
  assert.deepEqual(m.spans(tris, 0, [0, 4]).map(([a, b]) => [Math.round(a * 100) / 100, Math.round(b * 100) / 100]), [[10, 18], [22, 30]]);
  // binary STL, ASCII STL and our own 3MF, read back
  const bin = Buffer.alloc(84 + tris.length * 50);
  bin.writeUInt32LE(tris.length, 80);
  tris.forEach((t, i) => t.forEach((v, j) => v.forEach((x, k) => bin.writeFloatLE(x, 84 + i * 50 + 12 + j * 12 + k * 4))));
  const ascii = `solid t\n${tris.map((t) => `facet normal 0 0 0\nouter loop\n${t.map((v) => `vertex ${v.join(' ')}`).join('\n')}\nendloop\nendfacet`).join('\n')}\nendsolid t\n`;
  const { threemf } = await import('./lib/threemf.mjs');
  const zip = Buffer.from(await threemf([{ name: 'rail', parts: [{ name: 'body', triangles: tris, slot: 1 }] }]));
  for (const read of [m.readStl(bin), m.readStl(Buffer.from(ascii)), m.read3mf(zip)]) {
    assert.equal(read.length, tris.length);
    assert.deepEqual(m.bounds(read).size.map((x) => Math.round(x * 100) / 100), [40, 10, 5]);
  }
  // laid back over itself after a quarter turn and a shift
  const moved = m.turn(tris, m.parsePlacement('rz90').M, [5, -7, 3]);
  assert.ok(m.align(moved, tris).score < 0.01, 'found the turn and shift back');
});

test('cad measure and cad match: a model measured into draft rules, and a design checked against it both ways', () => {
  const { ws, cad, done } = workspace();
  try {
    cad('new', 'bathroom/soap-tray');
    cad('export', 'bathroom/soap-tray');
    const file = 'exports/bathroom/soap-tray@0.1.0.3mf';
    const same = cad('match', 'bathroom/soap-tray', file, '--no-pictures', '--samples', '3000');
    assert.match(same, /✓ the design's surface: 95% within 0 mm/);
    assert.match(same, /✓ the reference's surface/);
    const wider = cad('match', 'bathroom/soap-tray', file, '--no-pictures', '--samples', '3000', '--set', 'width=60');
    assert.match(wider, /✗ the design's surface/);
    assert.match(wider, /outside the reference \(extra material\)/);
    const measured = cad('measure', file, '--no-pictures', '--rules', 'tray', '--licence', 'CC BY-NC-SA 4.0', '--line', '0,1');
    assert.match(measured, /a closed solid/);
    assert.match(measured, /40 × 30 × 10 mm/);
    assert.match(measured, /licence "CC BY-NC-SA 4.0" limits reuse/);
    const rules = JSON.parse(fs.readFileSync(path.join(ws, 'rules/tray.json'), 'utf8')).rules;
    assert.equal(rules.size_x.value, 40);
    assert.equal(rules.size_x.kind, 'derived');
    assert.equal(rules.size_x.licence, 'CC BY-NC-SA 4.0');
    assert.match(cad('measure', file, '--no-pictures', '--rules', 'tray'), /already exists/);
  } finally { done(); }
});

test('a pose that sets an item\'s variables: the part drawn that way in that pose, as printed in the others', () => {
  const { ws, cad, done } = workspace();
  try {
    const vars = { w: { value: 40, unit: 'mm', rule: 'Width' }, d: { value: 20, unit: 'mm', rule: 'Depth' }, h: { value: 2, unit: 'mm', rule: 'Height' } };
    object(ws, 'demo/base', { variables: vars }, BOX);
    object(ws, 'demo/post', { variables: { ...vars, h: { value: 10, unit: 'mm', rule: 'Height', tweak: { min: 1, max: 30 } } } }, BOX);
    fs.mkdirSync(path.join(ws, 'projects/demo/assemblies'));
    // The post stands on the base; a block 8 mm up only clears it while the post is pressed down to 5 mm
    const write = (poses) => fs.writeFileSync(path.join(ws, 'projects/demo/assemblies/press.json'), JSON.stringify({ title: 'Press', kind: 'fit',
      items: [{ id: 'base', object: 'base' }, { id: 'post', object: 'post', at: [0, 0, 'base.h'] }, { id: 'stop', object: 'base' }],
      joints: [{ id: 'slide', type: 'prismatic', parent: { at: [0, 0, 8], axis: [0, 0, 1] }, child: { item: 'stop', at: [0, 0, 0], axis: [0, 0, 1] }, min: 0, max: 50 }], poses }));
    write({ pressed: { slide: 0, 'post.h': 5 }, free: { slide: 0 } });
    const out = cad('check', 'demo/press');
    assert.match(out, /2 poses checked: pressed, free/);
    assert.match(out, /free: post\.body and stop\.body overlap/, 'as printed, the post reaches the stop');
    assert.doesNotMatch(out, /pressed: post\.body and stop\.body overlap/, 'pressed, it clears it');
    assert.match(cad('check', 'demo/press', '--pose', 'pressed'), /no parts overlap/);
    write({ pressed: { slide: 0, 'post.h': 'base.h * 2' } }); // an expression in the assembly's names
    assert.match(cad('check', 'demo/press'), /no parts overlap/);
    // Its link opens free, and carries the post's pressed shape for the page to swap in when the pose is picked
    write({ free: { slide: 0 }, pressed: { slide: 0, 'post.h': 5 } });
    const lib = path.join(path.dirname(BIN), '../lib/');
    const out2 = execFileSync(process.execPath, ['--input-type=module', '-e', `
      import { buildAssembly } from ${JSON.stringify(pathToFileURL(lib + 'assembly.mjs').href)};
      import { assemblyModel } from ${JSON.stringify(pathToFileURL(lib + 'links.mjs').href)};
      import { encode, decode, partsOf, posesOf } from '@rulecad/model-link';
      const m = await decode(await encode(await assemblyModel(await buildAssembly('demo/press'), { title: 'Press' })));
      console.log(JSON.stringify({ parts: partsOf(m).map((p) => p[0]), poses: posesOf(m).map((x) => x.part[0]), swap: m.motion.swap, pose: m.motion.pose }));`], { cwd: ws, encoding: 'utf8' });
    assert.deepEqual(JSON.parse(out2), { parts: ['base.body', 'post.body', 'stop.body'], poses: ['post.body@pressed'], swap: { pressed: [[1, 3]] }, pose: 'free' });
  } finally { done(); }
});

test('joints: a lid on a hinge, checked in each pose, swept for collisions, with a follower closing a loop', () => {
  const { ws, cad, done } = workspace();
  try {
    const vars = { w: { value: 40, unit: 'mm', rule: 'Width' }, d: { value: 20, unit: 'mm', rule: 'Depth' }, h: { value: 2, unit: 'mm', rule: 'Height' } };
    object(ws, 'demo/base', { variables: vars, anchors: { hinge: { at: [0, 'd / 2', 'h'], axis: [1, 0, 0] } } }, BOX);
    object(ws, 'demo/lid', { variables: vars, anchors: { hinge: { at: [0, 'd / 2', 0], axis: [1, 0, 0] } } }, BOX);
    fs.mkdirSync(path.join(ws, 'projects/demo/assemblies'));
    const box = (extra = {}, fits = []) => fs.writeFileSync(path.join(ws, 'projects/demo/assemblies/box.json'), JSON.stringify({ title: 'Box', kind: 'fit', fits,
      items: [{ id: 'base', object: 'base' }, { id: 'lid', object: 'lid' }, { id: 'tab', object: 'lid' }, { id: 'spare', assembly: 'spare', at: [100, 0, 0] }],
      joints: [{ id: 'hinge', type: 'revolute', parent: 'base.hinge', child: 'lid.hinge', min: -180, max: 30, label: 'Lid' },
        { id: 'tab', type: 'revolute', parent: { item: 'base', at: ['base.w', 'base.d / 2', 'base.h'], axis: [1, 0, 0] }, child: 'tab.hinge', min: -180, max: 30, follow: 'hinge', ...extra }],
      loops: [{ a: { item: 'lid', at: ['lid.w', '-lid.d / 2', 0], axis: [1, 0, 0] }, b: { item: 'tab', at: [0, '-tab.d / 2', 0], axis: [1, 0, 0] }, label: 'Lid and tab line up' }],
      poses: { closed: { hinge: 0 }, open: { hinge: -90 } } }));
    // A component with no poses of its own: the box's poses still apply (--pose isn't asked of the component)
    fs.writeFileSync(path.join(ws, 'projects/demo/assemblies/spare.json'), JSON.stringify({ title: 'Spare', kind: 'fit', items: [{ id: 'lid', object: 'lid' }] }));
    box();
    const checked = cad('check', 'demo/box');
    assert.match(checked, /no parts overlap/);
    assert.match(checked, /2 poses checked: closed, open/);
    assert.match(checked, /Lid and tab line up: closed/);
    assert.doesNotMatch(checked, /✗|fail/i);
    assert.match(cad('check', 'demo/box', '--sweep', '--steps', '7'), /sweep hinge, -180 to 30° in 7 steps: at 30°: base\.body hits lid\.body/);
    assert.match(cad('check', 'demo/box', '--pose', 'open'), /Box \(open\)/);
    // A fit near an anchor (only the faces within 3 mm of base@hinge), and findings that say which anchor they're near
    box({}, [{ a: 'base@hinge', b: 'lid', within: 3, min: 5, note: 'Lid clear of the hinge' }]);
    const nearOut = cad('check', 'demo/box', '--pose', 'closed', '--json'), near = JSON.parse(nearOut).findings?.find((x) => x.text.startsWith('Lid clear of the hinge'));
    assert.ok(near, nearOut);
    assert.equal(near.level, 'warn'); assert.equal(near.refs.near.endsWith('@hinge'), true); assert.ok(near.at);
    box();
    assert.match(cad('check', 'demo/box', '--pose', 'wide'), /no pose "wide"/);
    // The library, as a program uses it: progress while it builds and sweeps, and the joints' data for the page
    const lib = path.join(path.dirname(BIN), '../lib/assembly.mjs');
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', `
      import { buildAssembly, sweep, motionData } from ${JSON.stringify(pathToFileURL(lib).href)};
      const seen = [];
      const s = await buildAssembly('demo/box', [], {}, { progress: (e) => seen.push(e.stage) });
      sweep(s, { steps: 4, progress: (e) => seen.push(e.stage) });
      const m = motionData(s);
      console.log(JSON.stringify({ build: seen.filter((x) => x === 'build').length, sweep: seen.filter((x) => x === 'sweep').length, joints: m.motion.joints.length }));`], { cwd: ws, encoding: 'utf8' });
    assert.deepEqual(JSON.parse(out), { build: 5, sweep: 5, joints: 2 }); // four items, and the spare component's own one
    box({ ratio: 2 }); // the tab turns twice as far: the loop comes apart once open
    assert.match(cad('check', 'demo/box'), /open: .*Lid and tab line up: apart/);
    box({ type: 'ball' });
    assert.match(cad('check', 'demo/box'), /joint tab \(ball\) takes 3 values, but follows hinge \(revolute\), which takes 1/);
  } finally { done(); }
});

test('findings as data (--json), values, and why a value is what it is', () => {
  const { ws, cad, done } = workspace();
  try {
    cad('new', 'bathroom/soap-tray');
    const j = JSON.parse(cad('check', 'bathroom/soap-tray', '--json'));
    assert.equal(j.object, 'bathroom/soap-tray');
    assert.ok(j.findings.some((f) => f.code === 'print.bed' && f.level === 'pass' && f.values.size.length === 3));
    assert.ok(j.findings.every((f) => f.code), 'every finding has a code');
    const v = JSON.parse(cad('values', 'bathroom/soap-tray', 'width', '--json'));
    assert.equal(v.values.length, 1); assert.equal(v.values[0].name, 'width');
    const all = JSON.parse(cad('values', 'bathroom/soap-tray', '--json')).values, w = all.find((x) => /x1c\./.test(x.expr || ''));
    const tree = JSON.parse(cad('why', `bathroom/soap-tray.${w.name}`, '--json'));
    assert.equal(tree.name, w.name);
    const rules = (n) => [n, ...(n.reads || []).flatMap(rules)];
    assert.ok(rules(tree).some((n) => n.name.startsWith('x1c.') && n.kind), 'down to the printer rules, with their kind');
    assert.match(cad('why', `bathroom/soap-tray.${w.name}`), new RegExp(`^${w.name} = `));
    const err = JSON.parse(cad('values', 'bathroom/soap-tray', 'nope', '--json'));
    assert.equal(err.error.code, 'var.unknown');
  } finally { done(); }
});

test('schemas: every format checked up front, a typo named with its path', async () => {
  const { validate, schema } = await import('./lib/schema.mjs');
  const ok = { variables: { w: { value: 10, unit: 'mm', rule: 'Width' } } };
  assert.deepEqual(validate(ok, schema('object')), []);
  const bad = validate({ variables: { w: { value: 10, unti: 'mm' } }, varibles: {} }, schema('object'));
  assert.ok(bad.some((x) => x.path === 'variables.w.unti' && /did you mean "unit"/.test(x.message)));
  assert.ok(bad.some((x) => x.path === 'varibles' && /did you mean "variables"/.test(x.message)));
  assert.deepEqual(validate({ items: [{ id: 'a', object: 'a' }], joints: [{ id: 'j', type: 'revolute', parent: 'a.p', child: { item: 'b', at: [0, 0, 'h'] } }] }, schema('assembly')), []);
  assert.ok(validate({ items: [], fits: [{ a: 'x' }] }, schema('assembly')).some((x) => x.path === 'fits[0]' && /needs "b"/.test(x.message)));
  assert.deepEqual(validate({ rows: [['Esc', ['Tab', 1.5], { label: 'F', homing: true }, { gap: 0.25 }]] }, schema('layout')), []);
  assert.deepEqual(validate({ name: 'p', rules: { line: { value: 0.42, unit: 'mm', rule: 'Line', kind: 'spec', source: 'x' } } }, schema('rules')), []);
  const { ws, cad, done } = workspace();
  try {
    cad('new', 'bathroom/soap-tray');
    assert.match(cad('check', 'bathroom/soap-tray'), /files match their schemas/);
    const f = path.join(ws, 'projects/bathroom/objects/soap-tray.json'), j = JSON.parse(fs.readFileSync(f, 'utf8'));
    j.orientaton = 'typo'; fs.writeFileSync(f, JSON.stringify(j));
    assert.match(cad('check', 'bathroom/soap-tray'), /orientaton: not allowed here \(did you mean "orientation"\?\)/);
  } finally { done(); }
});

test('cad set and cad add: edits that keep the file as it was, and refuse to break it', async () => {
  const { setAt, appendAt } = await import('./lib/jsonedit.mjs');
  const t = '{\n  "variables": {\n    "w": { "value": 10, "unit": "mm" },\n    "r": {\n      "value": 2,\n      "rule": "Two × one"\n    }\n  },\n  "fits": []\n}\n';
  const u = setAt(t, ['variables', 'w', 'value'], 12);
  assert.equal(u, t.replace('"value": 10', '"value": 12'), 'only the value changes');
  assert.match(appendAt(setAt(t, ['variables', 'h'], { value: 3, unit: 'mm', rule: 'Height' }), ['fits'], { a: 'a', b: 'b', poses: ['x'] }),
    /"h": \{\n      "value": 3,[\s\S]*"fits": \[\n    \{\n      "a": "a",\n      "b": "b",\n      "poses": \["x"\]\n    \}\n  \]/);
  const { ws, cad, done } = workspace();
  try {
    cad('new', 'bathroom/soap-tray');
    const f = path.join(ws, 'projects/bathroom/objects/soap-tray.json'), before = fs.readFileSync(f, 'utf8');
    const name = JSON.parse(cad('values', 'bathroom/soap-tray', '--json')).values.find((v) => typeof v.value === 'number' && !v.expr).name;
    const tw = JSON.parse(before).variables[name].tweak, to = tw ? Math.min(tw.max, Math.max(tw.min, 7)) : 7; // (within its range: a value outside it is refused)
    assert.match(cad('set', 'bathroom/soap-tray', `${name}=${to}`), new RegExp(`set ${name}`));
    assert.equal(JSON.parse(fs.readFileSync(f, 'utf8')).variables[name].value, to);
    assert.match(cad('set', 'bathroom/soap-tray', `${name}=x1c.nope`), /not changed: .*no rule "nope"/);
    assert.equal(JSON.parse(fs.readFileSync(f, 'utf8')).variables[name].value, to, 'a bad edit leaves the file as it was');
    assert.match(cad('set', 'bathroom/soap-tray', 'extra=1'), /has no variable "extra" \(add it with --new/);
    assert.match(cad('set', 'bathroom/soap-tray', 'extra=1', '--new', '--unit', 'mm', '--rule', 'A test'), /set extra/);
    assert.equal(fs.readFileSync(f, 'utf8').split('\n').slice(0, 3).join('\n'), before.split('\n').slice(0, 3).join('\n'), 'the rest of the file is untouched');
    fs.mkdirSync(path.join(ws, 'projects/bathroom/assemblies'));
    fs.writeFileSync(path.join(ws, 'projects/bathroom/assemblies/two.json'), JSON.stringify({ title: 'Two', items: [{ id: 'a', object: 'soap-tray' }] }, null, 2));
    assert.match(cad('add', 'item', 'bathroom/two', '--id', 'b', '--object', 'soap-tray', '--at', '100,0,0'), /added an item/);
    assert.match(cad('add', 'fit', 'bathroom/two', '--a', 'a', '--b', 'b', '--min', '1', '--note', 'Apart'), /added a fit/);
    assert.match(cad('add', 'fit', 'bathroom/two', '--a', 'a', '--min', '1'), /fits\[1\]: needs "b"/);
    assert.match(cad('check', 'bathroom/two'), /Apart: not near each other/);
  } finally { done(); }
});

test('sandbox: a design can make shapes, but not read or write files, reach the network or start programs', () => {
  const { ws, cad, done } = workspace();
  try {
    const vars = { w: { value: 10, unit: 'mm', rule: 'Width' } };
    const tryIt = (name, body) => {
      object(ws, `demo/${name}`, { variables: vars }, `import jscad from '@jscad/modeling'\n${body}\nexport function main (v) { return jscad.primitives.cuboid({ size: [v.w, v.w, v.w], center: [0, 0, v.w / 2] }) }\n`);
      return cad('check', `demo/${name}`);
    };
    assert.match(tryIt('fine', ''), /fits the bed/);
    assert.match(tryIt('fs', "import fs from 'node:fs'"), /designs can't import "node:fs"/);
    assert.match(tryIt('net', "await fetch('https://example.com')"), /fetch is not defined/);
    assert.match(tryIt('dyn', "await import('node:child_process')"), /designs can't import "node:child_process"/);
    assert.match(tryIt('outside', "await import('../../../../x.mjs')"), /can't import|outside|Cannot find/);
    assert.match(tryIt('write', "process.binding('fs')"), /restricted|denied|not allowed|binding/i);
    assert.ok(!fs.existsSync(path.join(ws, 'pwned')));
    fs.writeFileSync(path.join(ws, 'cad.config.json'), JSON.stringify({ sandbox: false }));
    assert.match(tryIt('untrusted', "import fs from 'node:fs'"), /designs can't import "node:fs"/, 'a workspace that turns the sandbox off isn\'t believed until its user trusts it');
    assert.match(cad('trust'), /trusted .* for designs run outside the sandbox/);
    assert.match(tryIt('trusted', "import fs from 'node:fs'"), /fits the bed/, 'a workspace can trust its own designs, once its user says so');
    fs.writeFileSync(path.join(ws, 'cad.config.json'), JSON.stringify({ sandbox: false, targets: { show: 'mine/show.mjs' } }));
    assert.match(cad('show', 'demo/fine'), /asks for designs run outside the sandbox and the show target mine\/show\.mjs .* run cad trust once/, 'asking for more is asked again'); // (a design that builds in the sandbox too: this one's about the target, whether or not its build is cached)
  } finally { done(); }
});

test('a lamina mechanism: its own checks in cad check (through the sandbox and the cache), its sequence as an animated SVG', () => {
  const { ws, cad, done } = workspace();
  try {
    const n = (value, rule) => ({ value, unit: 'mm', rule });
    const variables = { len: n(30, 'The leaf'), t: n(0.84, 'Its thickness'), h: n(6, 'The print\'s height'), gap: n(0.3, 'The gap that prints apart'),
      post: { ...n(0.42, 'How far the stop post stands from the tip block'), tweak: { min: 0.05, max: 2 } }, bend: n(0.3, 'How far the state bends it'), block: n(4, 'The tip block and the root') };
    object(ws, 'demo/flick', { uses: ['pla'], variables, variants: { fused: { post: 0.1 } } }, `import jscad from '@jscad/modeling'
const rect = (x0, y0, x1, y1) => jscad.primitives.polygon({ points: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] })
export function main (v) {
  const f = v.flexures, b = v.block, tipTop = b / 2
  return f.lamina({
    height: v.h, gap: v.gap, material: f.flexureMaterial({ modulus: v.pla.modulus, strength: v.pla.strength }),
    ground: [rect(0 - b, 0 - b, 0, b), rect(v.len, tipTop + v.post, v.len + b, tipTop + v.post + b)],
    bodies: { tip: rect(v.len - b / 2, 0 - b / 2, v.len + b, tipTop) },
    joints: { leaf: { kind: 'leaf', params: { length: v.len, thickness: v.t }, at: [0 - 1, 0], from: 'ground', to: 'tip' } },
    states: { bent: { leaf: v.bend } }, sequence: ['rest', 'bent', 'rest'],
  })
}
`);
    const ok = cad('check', 'demo/flick');
    assert.match(ok, /✓ everything clears what it isn't joined to by 0\.3 mm/);
    assert.match(ok, /✓ leaf: stopped by the ground at [\d.]+ mm, before its limit/);
    assert.match(ok, /✓ rest to bent: clear all the way/);
    assert.match(cad('check', 'demo/flick'), /✓ rest to bent: clear all the way/, 'the same from the cache');
    // The physics, the slow stage, is kept apart (.cache/stages): the sandbox handed it back and the tool wrote it
    const stages = path.join(ws, '.cache', 'stages'), kept = fs.readdirSync(stages);
    assert.ok(kept.some((f) => f.startsWith('physics-')) && JSON.parse(fs.readFileSync(path.join(stages, kept.find((f) => f.startsWith('physics-'))), 'utf8')).transitions, `the physics kept as JSON: ${kept.join(', ')}`);
    // A rule's words aren't what a build is made from: the build is found in the cache, and so is the physics
    const file = path.join(ws, 'projects', 'demo', 'objects', 'flick.json'), json = JSON.parse(fs.readFileSync(file, 'utf8'));
    json.variables.len.rule = 'The leaf, reworded'; fs.writeFileSync(file, JSON.stringify(json, null, 2));
    const before = kept.length;
    assert.match(cad('check', 'demo/flick'), /✓ rest to bent: clear all the way/);
    assert.equal(fs.readdirSync(stages).length, before, 'reworded: nothing computed again');
    json.variables.bend.value = 0.2; fs.writeFileSync(file, JSON.stringify(json, null, 2));
    assert.match(cad('check', 'demo/flick'), /✓ rest to bent: clear all the way/);
    assert.ok(fs.readdirSync(stages).length > before, 'a value changed: the physics made again');
    assert.match(cad('check', 'demo/flick:fused'), /✗ the ground and tip are 0\.1 mm apart at rest: under the 0\.3 mm gap, they print as one/);
    const outs = cad('animate', 'demo/flick').trim().split('\n'), out = outs.find((l) => l.endsWith('.svg'));
    assert.ok(out.endsWith('flick-sequence.svg') && /<svg[\s\S]*<animate attributeName="display"[\s\S]*rest to bent/.test(fs.readFileSync(out, 'utf8')));
    // and as data, every frame's shapes and what acts on them, with a page that plays it
    const data = JSON.parse(fs.readFileSync(outs.find((l) => l.endsWith('-sequence.json')), 'utf8'));
    assert.ok(data.frames.length > 2 && data.ground.length && data.kinds.ground === 'ground', 'the frames and the frame');
    assert.ok(data.frames.some((fr) => fr.forces?.some((f) => f.kind === 'hand') && fr.energy && fr.strain), 'what acts each frame: the hand, the energy and strain in each flexure');
    const page = fs.readFileSync(outs.find((l) => l.endsWith('-player.html')), 'utf8');
    assert.ok(/<canvas id="view">/.test(page) && page.includes('"frames":'), 'a page that plays it, its data inside');
    object(ws, 'demo/cube', { variables: { w: n(10, 'Width') } }, "import jscad from '@jscad/modeling'\nexport function main (v) { return jscad.primitives.cuboid({ size: [v.w, v.w, v.w], center: [0, 0, v.w / 2] }) }\n");
    assert.match(cad('animate', 'demo/cube'), /isn't a lamina mechanism/);
  } finally { done(); }
});

test('engines: a design using v.ops builds the same shape with JSCAD and with Manifold, watertight', () => {
  const { ws, cad, done } = workspace();
  try {
    const vars = { w: { value: 20, unit: 'mm', rule: 'Width', tweak: { min: 5, max: 50 } }, r: { value: 'w * 0.6', unit: 'mm', rule: 'Radius' }, n: { value: 64, unit: '', rule: 'Segments' } };
    object(ws, 'demo/cut', { variables: vars }, `import jscad from '@jscad/modeling'
const { cuboid, sphere } = jscad.primitives
export function main (v) {
  return v.ops.subtract(cuboid({ size: [v.w, v.w, v.w], center: [0, 0, v.w / 2] }), sphere({ radius: v.r, center: [0, 0, v.w], segments: v.n }))
}
`);
    const j = JSON.parse(cad('check', 'demo/cut', '--json')), m = JSON.parse(execFileSync(process.execPath, [BIN, 'check', 'demo/cut', '--json'], { cwd: ws, encoding: 'utf8', env: { ...process.env, CAD_ENGINE: 'manifold' } }));
    const size = (r) => r.findings.find((f) => f.code === 'print.bed').values.size, base = (r) => r.findings.find((f) => f.code === 'print.base').values.area;
    assert.deepEqual(size(j).map((x) => x.toFixed(2)), size(m).map((x) => x.toFixed(2)));
    assert.ok(Math.abs(base(j) - base(m)) < 0.5, 'the same footprint');
    const closed = m.findings.find((f) => f.code === 'print.closed');
    assert.equal(closed.level, 'pass'); assert.equal(closed.values.tjunctions, 0, 'Manifold leaves no T-junctions');
  } finally { done(); }
});

test('host: the core builds and checks a design from a workspace in memory, writing nothing to disk', () => {
  const lib = (f) => JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib', f)).href);
  const root = path.resolve('/rulecad-memory-test');
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', `
    import fs from 'node:fs';
    import { useHost, memoryHost } from ${lib('host.mjs')};
    const h = memoryHost({
      'cad.config.json': '{}',
      'projects/demo/project.json': JSON.stringify({ name: 'demo', objects: ['box'] }),
      'projects/demo/objects/box.json': JSON.stringify({ name: 'box', version: '0.1.0', uses: ['x1c'], variables: { w: { value: 'x1c.line * 40', unit: 'mm', rule: 'Width' } } }),
      'projects/demo/objects/box.js': "import jscad from '@jscad/modeling'\\nexport function main (v) { return jscad.primitives.cuboid({ size: [v.w, v.w, v.w], center: [0, 0, v.w / 2] }) }\\n",
    }, { root: ${JSON.stringify(root)} });
    useHost(h);
    const { build, locate, printer } = await import(${lib('design.mjs')});
    const { check } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../../printcheck/printcheck.mjs')).href)});
    const d = locate('demo/box'), b = await build(d);
    const found = check(b.triangles, printer(b, d));
    console.log(JSON.stringify({ size: found.find((f) => f.code === 'print.bed').values.size.map((x) => +x.toFixed(2)),
      onDisk: fs.existsSync(${JSON.stringify(root)}), cached: [...h.files.keys()].some((k) => k.includes('.cache')), rules: [...h.files.keys()].some((k) => k.endsWith('x1c.json')) }));
  `], { cwd: os.tmpdir(), encoding: 'utf8', env: { ...process.env, CAD_WORKSPACE: root } });
  assert.deepEqual(JSON.parse(out), { size: [16.8, 16.8, 16.8], onDisk: false, cached: true, rules: true });
});

test('optimising a problem: cad optimise draws it and caches it, a design builds from it, cad check analyses it', () => {
  const { ws, cad, done } = workspace();
  try {
    const project = path.join(ws, 'projects', 'beam');
    fs.mkdirSync(path.join(project, 'problems'), { recursive: true });
    fs.mkdirSync(path.join(project, 'objects'), { recursive: true });
    fs.writeFileSync(path.join(project, 'project.json'), JSON.stringify({ name: 'beam', objects: ['arm'] }));
    fs.writeFileSync(path.join(project, 'problems', 'arm.json'), JSON.stringify({
      title: 'A short arm', uses: ['x1c'], material: 'pla', thickness: 4, cell: 1, volume: 0.5, filter: 1.5,
      variables: { side: { value: 0, tweak: { min: 0, max: 1 } } }, variants: { both: { side: 1 } },
      space: { at: [12, 0], size: [30, 12] }, keep: [{ at: [0, 0], r: 4 }, { at: [24, 0], r: 3 }], avoid: [{ at: [0, 0], r: 1.6 }, { at: [24, 0], r: 1.2 }],
      supports: [{ at: [0, 0], r: 1.6 }], loads: [{ at: [24, 0], r: 1.2, force: [0, -10], case: 'down' }, { at: [24, 0], r: 1.2, force: [10, 0], case: 'side' }], cases: { side: 'side' },
    }));
    fs.writeFileSync(path.join(project, 'objects', 'arm.json'), JSON.stringify({ name: 'arm', version: '0.1.0', uses: ['x1c'],
      variables: { problem: { type: 'problem', value: 'arm', choice: ['arm', 'arm:both'] }, t: { value: 4, unit: 'mm' } },
      analysis: [{ problem: 'arm', max_deflection: 1, volume: 760, tolerance: 0.05 }] }));
    fs.writeFileSync(path.join(project, 'objects', 'arm.js'), "import jscad from '@jscad/modeling'\nexport function main (v) { return jscad.extrusions.extrudeLinear({ height: v.t }, v.shapes.optimisedOutline(v.problems[v.problem])) }\n");
    const first = cad('optimise', 'beam/arm');
    assert.match(first, /down: moves [\d.]+ mm along its load, [\d.]+ N\/mm/);
    assert.match(first, /settled/);
    assert.ok(fs.existsSync(path.join(ws, '.preview', 'beam', 'arm-optimised.svg')));
    assert.match(cad('optimise', 'beam/arm'), /\(cached\)/);
    assert.match(cad('optimise', 'beam/arm:nope'), /no variant "nope"/);
    const checked = cad('check', 'beam/arm');
    assert.match(checked, /✓ arm down: moves [\d.]+ mm under 10 N/);
    assert.ok(!/under 4 cells/.test(checked) || /! arm: [\d.]+% of the part is in members under 4 cells \([\d.]+ mm\) thick/.test(checked), 'thin members, if any, are a warning with the cell to use');
    assert.match(checked, /· arm side|✓ arm side/);
    assert.match(checked, /✓ volume [\d.]+ mm³/);
    assert.ok(fs.existsSync(path.join(ws, '.preview', 'beam', 'arm-analysis-arm.svg')));
    assert.match(cad('check', 'beam/arm', '--set', 'problem=arm:both'), /optimising arm:both|arm down/);
    // A stress limit instead of a volume: the lightest arm that keeps to it
    fs.writeFileSync(path.join(project, 'problems', 'light.json'), JSON.stringify({ ...JSON.parse(fs.readFileSync(path.join(project, 'problems', 'arm.json'), 'utf8')),
      title: 'A light arm', volume: undefined, stress: 'pla.strength / 3', cases: {}, loads: [{ at: [24, 0], r: 1.2, force: [0, -10], case: 'down' }], variables: {}, variants: {} }));
    const light = cad('optimise', 'beam/light');
    assert.match(light, /peak stress [\d.]+ MPa, the limit 13 MPa\n/);
  } finally { done(); }
});

test('3D: a problem whose space is another design\'s part, optimised, built as a solid and analysed', () => {
  const { ws, cad, done } = workspace();
  try {
    const project = path.join(ws, 'projects', 'post');
    for (const d of ['problems', 'objects']) fs.mkdirSync(path.join(project, d), { recursive: true });
    fs.writeFileSync(path.join(project, 'project.json'), JSON.stringify({ name: 'post', objects: ['envelope', 'post'] }));
    // The envelope: a block 12 × 12 × 24 mm standing on the bed
    fs.writeFileSync(path.join(project, 'objects', 'envelope.json'), JSON.stringify({ name: 'envelope', version: '0.1.0', variables: { w: { value: 12, unit: 'mm' }, h: { value: 24, unit: 'mm' } } }));
    fs.writeFileSync(path.join(project, 'objects', 'envelope.js'), "import jscad from '@jscad/modeling'\nexport function main (v) { return jscad.primitives.cuboid({ center: [0, 0, v.h / 2], size: [v.w, v.w, v.h] }) }\n");
    fs.writeFileSync(path.join(project, 'problems', 'post.json'), JSON.stringify({
      title: 'A post', material: 'pla', cell: 2, volume: 0.3, filter: 3, steps: 30, overhang: '+z',
      space: { part: 'envelope.body' }, keep: [{ at: [0, 0, 22], r: 4, length: 4, axis: 'z' }],
      supports: [{ at: [0, 0, 1], size: [12, 12, 2] }], loads: [{ at: [0, 0, 23], r: 3, length: 2, axis: 'z', force: [10, 0, 0], case: 'push' }],
    }));
    fs.writeFileSync(path.join(project, 'objects', 'post.json'), JSON.stringify({ name: 'post', version: '0.1.0', engine: 'manifold',
      variables: { problem: { type: 'problem', value: 'post', choice: ['post', 'none'] }, side: { value: 0, choice: [0, 1] }, lift: { value: 6, unit: 'mm' } }, variants: { lying: { side: 1 }, plain: { problem: 'none' } },
      // Lying: drawn on its side, and turned back for the analysis
      analysis: [{ problem: 'post', rotate: [0, '0 - 90 * side', 0], move: ['lift * side', 0, 0] }] }));
    fs.writeFileSync(path.join(project, 'objects', 'post.js'), "import jscad from '@jscad/modeling'\nconst { rotateY, translate } = jscad.transforms\nexport function main (v) { const s = v.problems ? v.shapes.optimisedSolid(v.problems[v.problem], { ops: v.ops }) : jscad.primitives.cuboid({ size: [12, 12, 24], center: [0, 0, 12] }); return v.side ? translate([0, 0, v.lift], rotateY(Math.PI / 2, s)) : s }\n");
    const out = cad('optimise', 'post/post');
    assert.match(out, /push: moves [\d.e-]+ mm along its load/);
    assert.match(out, /printable built \+z/);
    assert.ok(fs.existsSync(path.join(ws, '.preview', 'post', 'post-optimised.png')), 'a preview of the surface');
    const checked = cad('check', 'post/post');
    assert.match(checked, /closed solid/);
    assert.match(checked, /post push: moves [\d.e-]+ mm under 10 N/);
    const stiffness = (out) => Number(out.match(/post push: moves [\d.e-]+ mm under 10 N, ([\d.e+-]+) N\/mm/)[1]);
    const lying = cad('check', 'post/post:lying');
    assert.match(lying, /24 × [\d.]+ × 12 mm, fits the bed/, 'drawn lying down');
    assert.ok(Math.abs(stiffness(lying) / stiffness(checked) - 1) < 0.02, `turned back, it analyses as it stands: ${stiffness(lying)} against ${stiffness(checked)} N/mm`);
    // A variant with no problem builds without the optimiser: a rig, or the regions a problem reads
    const plain = cad('check', 'post/post:plain');
    assert.match(plain, /12 × 12 × 24 mm, fits the bed/, 'drawn without the result');
    assert.doesNotMatch(plain, /optimising/);
    // Verified: on finer cells, checked against cells a quarter bigger, with a report; safety-critical, it's
    // unverified until a test is recorded
    const problemFile = path.join(project, 'problems', 'post.json'), objectFile = path.join(project, 'objects', 'post.json');
    fs.writeFileSync(problemFile, JSON.stringify({ ...JSON.parse(fs.readFileSync(problemFile, 'utf8')), critical: true }));
    const o = JSON.parse(fs.readFileSync(objectFile, 'utf8'));
    o.analysis = [{ problem: 'post', cell: 1, min_safety: 2 }];
    fs.writeFileSync(objectFile, JSON.stringify(o));
    const verified = cad('check', 'post/post');
    assert.match(verified, /post push: stiffness [+-][\d.]+% from 1.25 mm cells/);
    assert.match(verified, /✓ post push: peak stress [\d.]+ MPa at \([\d., -]+\): [\d.]+× under pla's strength \(at least 2×\)/);
    assert.match(verified, /post is safety-critical and unverified/);
    const report = fs.readFileSync(path.join(ws, '.preview', 'post', 'post-report-post.md'), 'utf8');
    assert.match(report, /12 × 12 × 24 cells of 1 mm/);
    assert.match(report, /\*\*Unverified\.\*\*/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(ws, '.preview', 'post', 'post-report-post.json'), 'utf8')).cases[0].name, 'push');
    o.verification = [{ kind: 'test', date: '2026-10-28', summary: 'Pushed with 10 N three times: moved 0.03 mm' }];
    fs.writeFileSync(objectFile, JSON.stringify(o));
    assert.match(cad('check', 'post/post'), /post is safety-critical: verified by test \(2026-10-28\)/);
  } finally { done(); }
});

test('a solid part fills each cube by the share of it inside, so its volume is right on any cells', async () => {
  const { solidFill } = await import('./lib/optimise.mjs');
  // A box 5.3 × 3.7 × 6.1 mm, off the cells' corners
  const lo = [0.4, 0.7, 0.2], hi = [5.7, 4.4, 6.3], c = [0, 1, 2, 3, 4, 5, 6, 7].map((n) => [n & 1 ? hi[0] : lo[0], n & 2 ? hi[1] : lo[1], n & 4 ? hi[2] : lo[2]]);
  const quads = [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [1, 3, 7, 5], [0, 4, 6, 2]];
  const triangles = quads.flatMap(([a, b, d, e]) => [[c[a], c[b], c[d]], [c[a], c[d], c[e]]]);
  for (const h of [1, 2]) {
    const n = Math.ceil(7 / h), d = solidFill(triangles, { nx: n, ny: n, nz: n, h }, [0, 0, 0]);
    // Exact up the column; across it, each side to within half the rays' spacing (h / 8)
    const filled = d.reduce((s, x) => s + x, 0) * h ** 3, e = h / 8, most = (5.3 + 2 * e) * (3.7 + 2 * e) * 6.1, least = (5.3 - 2 * e) * (3.7 - 2 * e) * 6.1;
    assert.ok(filled >= least - 1e-9 && filled <= most + 1e-9, `on ${h} mm cells: ${filled} mm³, not between ${least} and ${most}`);
    assert.ok(d.every((x) => x >= 0 && x <= 1));
  }
});

test('the live view: serves its page, streams each step, and its stop button sets the flag the run reads', async () => {
  const { liveView } = await import('./lib/live.mjs');
  const view = await liveView({ port: 0, title: 'a test run' });
  try {
    assert.match(await (await fetch(view.url)).text(), /a test run/);
    view.step({ step: 3, steps: 10, compliance: 12.5, change: 0.1, beta: 1, grid: { nx: 2, ny: 2, nz: 2 }, density: Float64Array.from([0, 1, 0, 0, 0, 0, 0.5, 0]) });
    const events = await fetch(new URL('events', view.url)), reader = events.body.getReader();
    let text = '';
    while (!text.includes('"frame"')) text += new TextDecoder().decode((await reader.read()).value);
    const m = JSON.parse(text.split('data: ').at(-1));
    assert.equal(m.frame.step, 3);
    // Three views, each pixel the densest cell along its line of sight
    assert.deepEqual(m.frame.views.map((v) => [v.name, ...Buffer.from(v.image, 'base64')]), [['along y', 0, 255, 128, 0], ['along x', 255, 0, 0, 128], ['along z', 0, 255, 128, 0]]);
    assert.equal((await (await fetch(new URL('frame/0', view.url))).json()).step, 3); // every step kept, for the scrubber
    // A 3D step's surface, drawn when asked for: vertex and face counts, then the vertices and faces
    const mesh = new DataView(await (await fetch(new URL('mesh/0', view.url))).arrayBuffer());
    assert.ok(mesh.getUint32(0, true) > 0 && mesh.getUint32(4, true) > 0);
    assert.equal(mesh.byteLength, 8 + mesh.getUint32(0, true) * 12 + mesh.getUint32(4, true) * 12);
    assert.match(await (await fetch(new URL('three/three.module.js', view.url))).text(), /WebGLRenderer/);
    assert.equal(view.stopped(), false);
    const foreign = await fetch(new URL('stop', view.url), { method: 'POST', headers: { Origin: 'http://elsewhere.example' } });
    assert.equal(foreign.status, 403, 'another site\'s page can\'t stop the run');
    assert.equal(view.stopped(), false);
    await fetch(new URL('stop', view.url), { method: 'POST' });
    assert.equal(view.stopped(), true);
    reader.cancel();
    // Finished, it keeps showing the end for a while
    const closing = view.close('finished', { hold: 500 });
    await new Promise((r) => setTimeout(r, 100));
    assert.match(await (await fetch(view.url)).text(), /a test run/);
    await closing;
    await assert.rejects(fetch(view.url));
  } catch (e) { await view.close(); throw e; }
});

test('an optimised part keeps only pieces touching a support, a load or a kept region', async () => {
  const { anchored } = await import('./lib/optimise.mjs');
  const cube = (x, s, base) => { // a closed cube as indexed triangles
    const v = [0, 1].flatMap((k) => [0, 1].flatMap((j) => [0, 1].map((i) => [x + i * s, j * s, k * s])));
    const q = [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]];
    return { v, f: q.flatMap(([a, b, c, d]) => [[a, b, c], [a, c, d]]).map((t) => t.map((i) => i + base)) };
  };
  const main = cube(0, 10, 0), speck = cube(30, 2, 8);
  const mesh = { vertices: [...main.v, ...speck.v], faces: [...main.f, ...speck.f] };
  const out = anchored(mesh, [[0, 0, 0, 10, 10, 1]], 1); // a support on the main cube's floor
  assert.equal(out.faces.length, 12);
  assert.equal(out.vertices.length, 8);
  assert.deepEqual(out.dropped.map(Math.abs), [8]);
  assert.equal(anchored(mesh, [[0, 0, 0, 40, 10, 1]], 1).dropped.length, 0); // both touch it
});

test('a mechanism problem: cad optimise reports how far the output moves its way, and the live view gets the travel', () => {
  const { ws, cad, done } = workspace();
  try {
    const project = path.join(ws, 'projects', 'mech');
    fs.mkdirSync(path.join(project, 'problems'), { recursive: true });
    fs.writeFileSync(path.join(project, 'project.json'), JSON.stringify({ name: 'mech', objects: [] }));
    fs.writeFileSync(path.join(project, 'problems', 'inverter.json'), JSON.stringify({
      title: 'A force inverter', uses: ['x1c'], material: 'pla', thickness: 4, cell: 1, volume: 0.3, filter: 1.5, steps: 40,
      variables: { k: { value: 0.5, unit: 'N/mm', rule: 'the springs' } },
      space: { at: [20, 10], size: [40, 20] }, supports: [{ at: [0.5, 0.5], size: [1, 1] }, { at: [0.5, 19.5], size: [1, 1] }],
      loads: [{ at: [0.5, 10], size: [1, 2], force: [10, 0] }], input_spring: 'k',
      output: { at: [39.5, 10], size: [1, 2], direction: [-1, 0], spring: 'k', label: 'the right end, moving left' },
    }));
    const out = cad('optimise', 'mech/inverter');
    assert.match(out, /the output moves [\d.e-]+ mm its way for [\d.e-]+ mm of push: an advantage of [\d.e-]+/);
    assert.match(out, /% of the space filled/);
    assert.match(out, /40 × 20 cells of 1 mm/);
  } finally { done(); }
});

// ---------- what a newcomer meets ----------
// A run of the command with its exit status kept (cad() above gives the output only)
const run = (ws, a, env = {}) => { const r = spawnSync(process.execPath, [BIN, ...a], { cwd: ws, encoding: 'utf8', env: { ...process.env, ...env } }); return { out: `${r.stdout}${r.stderr}`, stdout: r.stdout, code: r.status }; };

test('a mistake in a design is named, with its file and line: a misspelt variable, no shape returned, a syntax error, broken JSON', () => {
  const { ws, cad, done } = workspace();
  try {
    const vars = { width: { value: 10, unit: 'mm', rule: 'Width' } };
    const shape = (expr) => `import jscad from '@jscad/modeling'\nexport function main (v) {\n  ${expr}\n}\n`;
    for (const trust of [{}, { CAD_TRUST: '1' }]) { // in the sandbox, and in the tool's own process
      const tryIt = (name, js) => { object(ws, `demo/${name}`, { variables: vars }, js); return run(ws, ['check', `demo/${name}`], { ...trust, CAD_NO_CACHE: '1' }); }; // (each run afresh: a kept build doesn't run the design)
      const typo = tryIt('typo', shape('return jscad.primitives.cuboid({ size: [v.widht, v.width, v.width] })'));
      assert.match(typo.out, /v\.widht: the design has no variable "widht" \(did you mean "width"\?\).*typo\.js:3\)/, 'not undefined, and another shape drawn');
      assert.doesNotMatch(typo.out, /Warning/, 'Node\'s notes on the sandbox\'s own flags stay out of it');
      assert.equal(typo.code, 1);
      assert.match(tryIt('nothing', shape('jscad.primitives.cuboid({ size: [v.width, v.width, v.width] })')).out, /main\(\) returned no shape.*nothing\.js/);
      assert.match(tryIt('syntax', shape('retrun jscad.primitives.cuboid({ size: [v.width, v.width, v.width] })')).out, /Unexpected identifier.*retrun.*syntax\.js:3\)/);
      assert.match(tryIt('runtime', shape('return v.width.nope.deeper')).out, /reading 'deeper'.*runtime\.js:3\)/);
      const said = tryIt('says', shape("console.log('width is', v.width)\n  return jscad.primitives.cuboid({ size: [v.width, v.width, v.width], center: [0, 0, v.width / 2] })"));
      assert.match(said.out, /width is 10/, 'a design may print what it wants to see');
      assert.match(said.out, /fits the bed/);
    }
    // a name only the on-screen copy sets may be asked for when it isn't there
    object(ws, 'demo/shown', { variables: vars, display: { smooth: 8 } }, shape('return jscad.primitives.cylinder({ radius: v.width, height: v.width, center: [0, 0, v.width / 2], ...(v.smooth ? { segments: v.smooth } : {}) })'));
    assert.match(cad('check', 'demo/shown'), /fits the bed/);
    fs.writeFileSync(path.join(ws, 'projects/demo/objects/typo.json'), '{ "name": "typo", ');
    assert.match(run(ws, ['check', 'demo/typo']).out, /not valid JSON: .*\(projects[\\/]demo[\\/]objects[\\/]typo\.json\)/);
    assert.match(run(ws, ['set', 'demo/typo', 'width=5']).out, /not valid JSON/, 'and an edit says so too, at once');
    fs.writeFileSync(path.join(ws, 'cad.config.json'), '{ "printer": ');
    const cfg = run(ws, ['check', 'demo/shown']);
    assert.match(cfg.out, /^not valid JSON: .*\(cad\.config\.json\)\s*$/, 'in one line, not a stack trace');
  } finally { done(); }
});

test('the command line: its version, a misspelt command or option named, options before or after names, flags that take no value', () => {
  const { ws, cad, done } = workspace();
  try {
    cad('new', 'demo/block');
    assert.match(run(ws, ['--version']).out, /^\d+\.\d+\.\d+\s*$/);
    for (const h of ['--help', '-h', 'help']) assert.match(run(ws, [h]).out, /^cad: JSCAD designs/);
    const wrong = run(ws, ['chekc', 'demo/block']);
    assert.match(wrong.out, /^no command "chekc" \(did you mean "check"\?\)/); assert.equal(wrong.code, 1);
    const odd = run(ws, ['check', 'demo/block', '--jsno']);
    assert.match(odd.out, /^no option --jsno \(did you mean --json\?\)/); assert.equal(odd.code, 1);
    assert.equal(JSON.parse(run(ws, ['check', '--json', 'demo/block']).stdout).object, 'demo/block', 'options first');
    assert.match(run(ws, ['check', 'demo/block', '--set']).out, /--set needs a value/);
    assert.match(run(ws, ['add']).out, /usage: cad add fit\|joint\|item\|loop\|pose/);
    assert.match(run(ws, ['add', 'fit']).out, /usage: cad add fit\|joint\|item\|loop\|pose/);
    // --new takes no value: what follows it is the next variable, not lost
    assert.match(run(ws, ['set', 'demo/block', '--new', 'lip=3', '--unit', 'mm', '--rule', 'A lip']).out, /set lip/);
    const vars = () => JSON.parse(fs.readFileSync(path.join(ws, 'projects/demo/objects/block.json'), 'utf8')).variables;
    assert.equal(vars().lip.value, 3);
    const rule = vars().width.rule;
    assert.match(run(ws, ['set', 'demo/block', 'width=50', '--new', 'rim=2', '--rule', 'A rim']).out, /--rule describes one variable/);
    assert.equal(vars().width.rule, rule, 'no rule written over');
    // a value in a file name can't name another folder
    assert.match(run(ws, ['export', 'demo/block', '--set', 'width=50']).out, /block@0\.1\.0-width=50\.3mf/);
    // projects: a stray file among them is passed over, a missing one named
    fs.writeFileSync(path.join(ws, 'projects/.DS_Store'), '');
    assert.match(run(ws, ['status']).out, /^demo\n\s+block\s+unreleased/);
    assert.match(run(ws, ['status', 'nope']).out, /^no project "nope" \(projects: demo\)/);
    // a preview whose Chrome can't run says so, and leaves no earlier picture to pass for it
    const png = path.join(ws, '.preview/demo/block.png');
    fs.mkdirSync(path.dirname(png), { recursive: true }); fs.writeFileSync(png, 'an earlier picture');
    const shot = run(ws, ['preview', 'demo/block'], { CAD_CHROME: path.join(ws, 'no-chrome-here') });
    assert.match(shot.out, /^couldn't start Chrome for the preview/); assert.equal(shot.code, 1);
    assert.ok(!fs.existsSync(png));
  } finally { done(); }
});

test('sandbox: the roads round the import hook are shut too, and the design sees none of the environment', () => {
  const { ws, done } = workspace();
  try {
    const vars = { w: { value: 10, unit: 'mm', rule: 'Width' } };
    const tryIt = (name, top, body) => {
      object(ws, `demo/${name}`, { variables: vars }, `import jscad from '@jscad/modeling'\n${top}\nexport function main (v) {\n  ${body}\n  return jscad.primitives.cuboid({ size: [v.w, v.w, v.w], center: [0, 0, v.w / 2] })\n}\n`);
      return run(ws, ['check', `demo/${name}`], { SECRET_TOKEN: 'tok123' }).out;
    };
    assert.match(tryIt('builtin', '', "process.getBuiltinModule('node:fs')"), /getBuiltinModule is not a function/);
    assert.match(tryIt('env', '', "if (process.env.SECRET_TOKEN || process.env.HOME) throw new Error('the environment leaked')"), /fits the bed/);
    assert.match(tryIt('kill', '', "if (process.kill || process.binding) throw new Error('process can still reach out')"), /fits the bed/);
    // a node_modules folder inside the project is the design's own code, held to the same imports
    fs.mkdirSync(path.join(ws, 'projects/demo/node_modules'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'projects/demo/node_modules/helper.mjs'), "export * as http from 'node:http'\n");
    assert.match(tryIt('own-modules', "import * as h from '../node_modules/helper.mjs'", ''), /designs can't import "node:http"/);
    // and a path out of the project is refused wherever it leads, the workspace's packages included
    assert.match(tryIt('leaves', "import * as ts from '../../../node_modules/typescript/lib/typescript.js'", ''), /it is outside the project/);
    fs.writeFileSync(path.join(ws, 'projects/demo/objects/half.js'), 'export const half = (x) => x / (1 + 1)\n');
    assert.match(tryIt('own-file', "import { half } from './half.js'", 'half(v.w)'), /fits the bed/, 'its own files are still its own');
  } finally { done(); }
});

test('edits to JSON keep its line endings and indentation, and say when it isn\'t JSON', async () => {
  const { setAt } = await import('./lib/jsonedit.mjs');
  const crlf = '{\r\n\t"name": "x",\r\n\t"variables": {\r\n\t\t"w": { "value": 1 }\r\n\t}\r\n}\r\n';
  const out = setAt(crlf, ['variables', 'd'], { value: 3, deep: { a: 1 } });
  assert.equal(out, '{\r\n\t"name": "x",\r\n\t"variables": {\r\n\t\t"w": { "value": 1 },\r\n\t\t"d": {\r\n\t\t\t"value": 3,\r\n\t\t\t"deep": {\r\n\t\t\t\t"a": 1\r\n\t\t\t}\r\n\t\t}\r\n\t}\r\n}\r\n');
  assert.throws(() => setAt('{ "name": "hook", ', ['a'], 1), /not valid JSON/, 'not a scan that never ends');
});

// A document replayed: its fenced blocks in turn, in a workspace npm create rulecad makes. A block named for a file
// is written there; a sh block's cad commands are run (previews need Chrome, so they're passed over), each to pass
// with no failing or warning finding. Returns { ws, files, commands } with the workspace for more checks; rm it after
function replay(doc, ws) {
  const text = fs.readFileSync(doc, 'utf8').replace(/\r\n/g, '\n'); // (a Windows checkout has its own line endings)
  execFileSync(process.execPath, [fileURLToPath(new URL('../create-rulecad/index.mjs', import.meta.url)), ws, '--no-install'], { encoding: 'utf8' });
  fs.symlinkSync(ROOT_MODULES, path.join(ws, 'node_modules'), 'junction'); // stands in for npm install
  let files = 0, commands = 0;
  for (const [, info, body] of text.matchAll(/^```(\S*(?: \S+)?)\n([\s\S]*?)^```$/gm)) {
    const [lang, file] = info.split(' ');
    if (file) { fs.mkdirSync(path.dirname(path.join(ws, file)), { recursive: true }); fs.writeFileSync(path.join(ws, file), body); files++; continue; }
    if (lang !== 'sh') continue;
    for (const line of body.split('\n').map((l) => l.replace(/\s+#.*$/, '').trim()).filter((l) => l.startsWith('npx cad ') && !l.startsWith('npx cad preview'))) {
      const a = [...line.slice('npx cad '.length).matchAll(/"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2]);
      const r = run(ws, a);
      assert.equal(r.code, 0, `${line}\n${r.out}`);
      assert.doesNotMatch(r.out, /^\s+[✗!] /m, `${line}\n${r.out}`);
      commands++;
    }
  }
  return { text, files, commands };
}

test('a motor in an assembly: on the axis of its joint, torque reaching a load, holding on and off, a shaft read from its bore', () => {
  const { ws, cad, done } = workspace();
  const write = (f, x) => { fs.mkdirSync(path.dirname(path.join(ws, f)), { recursive: true }); fs.writeFileSync(path.join(ws, f), typeof x === 'string' ? x : JSON.stringify(x)); };
  const findings = (a) => { const out = cad('check', `home/${a}`, '--json'), r = JSON.parse(out); assert.ok(r.findings, out); return r.findings.filter((x) => /^(motor|shaft)\./.test(x.code)); };
  const code = (list, c) => list.filter((x) => x.code === c);
  try {
    write('projects/home/project.json', { name: 'home', material: 'PLA', objects: ['arm', 'hub'] });
    write('projects/home/objects/arm.json', { name: 'arm', version: '0.1.0', anchors: { axis: { at: [0, 0, 0], axis: [0, 0, 1] }, tip: { at: [100, 0, 0], axis: [0, 0, 1] } }, variables: { long: { value: 110, unit: 'mm', rule: 'The arm' } } });
    write('projects/home/objects/arm.js', "import jscad from '@jscad/modeling'\nconst { cuboid } = jscad.primitives\nexport function main (v) { return cuboid({ size: [v.long, 6, 4], center: [v.long / 2 + 12, 0, 40] }) }\n");
    write('projects/home/objects/hub.json', { name: 'hub', version: '0.1.0', engine: 'manifold', anchors: { axis: { at: [0, 0, 0], axis: [0, 0, 1] } }, variables: { wall: { value: 4, unit: 'mm', rule: 'The wall', tweak: { min: 1, max: 20 } }, depth: { value: 12, unit: 'mm', rule: 'The bore' }, flat: { value: 1, rule: 'Cut the flat', tweak: { min: 0, max: 1 } }, press: { value: 0, rule: 'Press fit', tweak: { min: 0, max: 1 } }, comp: { value: 0.1, unit: 'mm', rule: 'How much the printed hole shrinks', tweak: { min: -0.2, max: 0.2 } } } });
    write('projects/home/objects/hub.js', "import jscad from '@jscad/modeling'\nconst { cylinder } = jscad.primitives\nexport function main (v) {\n  const m = v.motors.motorModel('nema17'), hole = v.flat ? v.motors.bore(m, { depth: v.depth, tip: v.depth, fit: v.press ? 'press' : 'slide', printer: { hole_comp: v.comp } }, v.ops) : cylinder({ radius: 2.65, height: v.depth + 1, center: [0, 0, v.depth / 2], segments: 48 })\n  return v.ops.subtract(cylinder({ radius: 2.5 + v.wall, height: v.depth, center: [0, 0, v.depth / 2], segments: 48 }), hole)\n}\n");
    const arm = (motor, extra = {}) => ({ title: 'Arm', kind: 'fit', items: [{ id: 'm', motor: { model: 'nema17', drives: 'j', ...motor }, at: [0, 0, 0], rotate: [-90, 0, 0] }, { id: 'arm', object: 'arm' }], joints: [{ id: 'j', type: 'revolute', parent: { at: [0, 0, 0], axis: [0, 1, 0] }, child: 'arm.axis' }], ...extra });
    // on the axis, or said not to be
    write('projects/home/assemblies/off.json', { ...arm({}), items: [{ id: 'm', motor: { model: 'nema17', drives: 'j' }, at: [3, 0, 0], rotate: [-90, 0, 0] }, { id: 'arm', object: 'arm' }] });
    assert.equal(code(findings('off'), 'motor.axis')[0].level, 'fail');
    // a kilogram 100 mm out is 0.98 N m, more than the motor's 0.417 moving: failed, with the ratio that would do
    write('projects/home/assemblies/heavy.json', arm({}, { loads: [{ mass: 1, at: 'arm.tip' }] }));
    const heavy = findings('heavy'), t = code(heavy, 'motor.torque')[0];
    assert.equal(t.level, 'fail'); assert.match(t.text, /A ratio of [\d.]+:1 would give it 2 times/);
    assert.ok(Math.abs(t.values.needed - 0.980665) < 0.01, `${t.values.needed} N m at the worst angle`);
    assert.ok(code(heavy, 'motor.holds').some((x) => x.level === 'fail'), 'it slips with the power on, too');
    // a tenth of that passes; it holds powered, and says it drops unpowered, past the detent torque
    write('projects/home/assemblies/light.json', arm({}, { loads: [{ mass: 0.15, at: 'arm.tip' }] }));
    const light = findings('light'), h = code(light, 'motor.holds');
    assert.equal(code(light, 'motor.torque')[0].level, 'pass');
    assert.ok(h.some((x) => x.level === 'warn' && /drops with the power off/.test(x.text)), h.map((x) => x.text).join('\n'));
    assert.ok(h.some((x) => x.level === 'pass' && /holds with the power on/.test(x.text)));
    // a brake on the joint holds it
    write('projects/home/assemblies/braked.json', { ...arm({}, { loads: [{ mass: 0.15, at: 'arm.tip' }] }), joints: [{ id: 'j', type: 'revolute', parent: { at: [0, 0, 0], axis: [0, 1, 0] }, child: 'arm.axis', brake: 'a ratchet and pawl' }] });
    assert.ok(code(findings('braked'), 'motor.holds').some((x) => x.level === 'pass' && /a ratchet and pawl/.test(x.text)));
    // heat: a stepper's 105 °C against PLA's 57, and the current to set
    assert.match(code(light, 'motor.heat')[0].text, /Set the driver to [\d.]+ A/);
    // a shaft read from its bore
    const hub = (name, set, fit = true) => write(`projects/home/assemblies/${name}.json`, { title: 'Hub', kind: 'fit', items: [{ id: 'm', motor: { model: 'nema17', drives: 'j' } }, { id: 'hub', object: 'hub', set }], joints: [{ id: 'j', type: 'revolute', parent: { at: [0, 0, 12], axis: [0, 0, 1] }, child: 'hub.axis' }], fits: [{ a: 'm', b: 'hub', shaft: fit }] });
    hub('good', {});
    assert.ok(code(findings('good'), 'shaft.grip').some((x) => x.level === 'pass'), JSON.stringify(findings('good')));
    hub('round', { flat: 0 });
    assert.match(code(findings('round'), 'shaft.flat')[0].text, /bore is round and the shaft has a flat/);
    hub('thin', { wall: 1, press: 1, comp: -0.1 }, 'press');
    assert.ok(code(findings('thin'), 'shaft.hoop').some((x) => x.level === 'fail'), JSON.stringify(findings('thin')));
    hub('thick', { wall: 4, press: 1 }, 'press');
    assert.ok(code(findings('thick'), 'shaft.hoop').some((x) => x.level === 'pass'), JSON.stringify(findings('thick')));
    // refusals by name
    write('projects/home/assemblies/nojoint.json', arm({ drives: 'nope' }));
    assert.match(cad('check', 'home/nojoint'), /drives "nope", which isn't a joint/);
    write('projects/home/assemblies/two.json', { ...arm({}), items: [{ id: 'm', motor: { model: 'nema17', drives: 'j' } }, { id: 'n', motor: { model: 'nema17', drives: 'j' } }, { id: 'arm', object: 'arm' }] });
    assert.match(cad('check', 'home/two'), /driven by m already/);
    write('projects/home/assemblies/nomotor.json', arm({ model: 'nema99' }));
    assert.match(cad('check', 'home/nomotor'), /no motor "nema99"/);
  } finally { done(); }
});

test('a motor\'s mount bent by FE: a NEMA 17 on a 2 mm PLA plate fails on deflection and warns on heat, a 6 mm plate held close passes', () => {
  const { ws, cad, done } = workspace();
  const write = (f, x) => { fs.mkdirSync(path.dirname(path.join(ws, f)), { recursive: true }); fs.writeFileSync(path.join(ws, f), typeof x === 'string' ? x : JSON.stringify(x)); };
  const findings = (a) => { const out = cad('check', `home/${a}`, '--json'), r = JSON.parse(out); assert.ok(r.findings, out); return r.findings.filter((x) => /^motor\./.test(x.code)); };
  try {
    write('projects/home/project.json', { name: 'home', material: 'PLA', objects: ['plate', 'wall', 'arm'] });
    // A plate standing out 45 mm from a wall, the motor hung under it, its shaft up through the plate
    write('projects/home/objects/plate.json', { name: 'plate', version: '0.1.0', engine: 'manifold', variables: { thick: { value: 2, unit: 'mm', rule: 'The plate', tweak: { min: 1, max: 10 } }, reach: { value: 60, unit: 'mm', rule: 'Out to the wall', tweak: { min: 25, max: 100 } } } });
    write('projects/home/objects/plate.js', "import jscad from '@jscad/modeling'\nconst { cuboid } = jscad.primitives\nexport function main (v) {\n  const m = v.motors.motorModel('nema17')\n  return v.ops.subtract(cuboid({ size: [v.reach + 22, 42.3, v.thick], center: [(v.reach - 22) / 2, 0, v.thick / 2] }), v.motors.mount(m, { plate: v.thick }, v.ops))\n}\n");
    write('projects/home/objects/wall.json', { name: 'wall', version: '0.1.0', variables: { at: { value: 45, unit: 'mm', rule: 'Where the wall starts', tweak: { min: 20, max: 100 } }, reach: { value: 60, unit: 'mm', rule: 'As the plate', tweak: { min: 25, max: 100 } } } });
    write('projects/home/objects/wall.js', "import jscad from '@jscad/modeling'\nconst { cuboid } = jscad.primitives\nexport function main (v) { return cuboid({ size: [v.reach + 10 - v.at, 50, 30], center: [(v.reach + 10 + v.at) / 2, 0, -15] }) }\n");
    write('projects/home/objects/arm.json', { name: 'arm', version: '0.1.0', anchors: { axis: { at: [0, 0, 0], axis: [0, 0, 1] } }, variables: { long: { value: 60, unit: 'mm', rule: 'The arm' } } });
    write('projects/home/objects/arm.js', "import jscad from '@jscad/modeling'\nconst { cuboid } = jscad.primitives\nexport function main (v) { return cuboid({ size: [v.long, 6, 4], center: [v.long / 2 + 12, 0, 40] }) }\n");
    const bracket = (name, set, wall = {}) => write(`projects/home/assemblies/${name}.json`, { title: 'Bracket', kind: 'fit',
      items: [{ id: 'wall', object: 'wall', set: wall }, { id: 'plate', object: 'plate', set }, { id: 'm', motor: { model: 'nema17', drives: 'j' } }, { id: 'arm', object: 'arm' }],
      joints: [{ id: 'j', type: 'revolute', parent: { at: [0, 0, 0], axis: [0, 0, 1] }, child: 'arm.axis' }],
      fits: [{ a: 'm', b: 'plate', fastens: true, min: 0 }, { a: 'plate', b: 'wall', fastens: true, min: 0 }], loads: [{ joint: 'j', torque: 0.05 }] });
    bracket('thin', {});
    const thin = findings('thin'), bent = thin.find((x) => x.code === 'motor.mount' && x.values?.deflection != null);
    assert.equal(bent.level, 'fail', bent.text);
    assert.ok(bent.values.deflection > 2 * bent.values.limit, `${bent.values.deflection} mm at the shaft's tip`);
    assert.match(bent.text, /shaft's tip moves [\d.]+ mm, [\d.]+ times the 0\.2 mm fit/);
    assert.match(bent.text, /A plate about [\d.]+ mm thick where it bends \(2 mm at the screws now\), or ribs under it, or a stiffer material/, 'what fixes it');
    assert.match(bent.text, /FE on [\d.]+ mm cubes, 2 across the plate, held where it is fastened/, 'how far to trust it');
    const heat = thin.find((x) => x.code === 'motor.heat');
    assert.equal(heat.level, 'warn'); assert.match(heat.text, /past where PLA softens .* Set the driver to [\d.]+ A/, 'and what fixes the heat');
    // thicker, and held right beside the motor: it passes, the stress against PLA's strength with a margin
    bracket('thick', { thick: 6, reach: 30 }, { at: 22, reach: 30 });
    const ok = findings('thick').find((x) => x.code === 'motor.mount' && x.values?.deflection != null);
    assert.equal(ok.level, 'pass', ok.text);
    assert.ok(ok.values.deflection < bent.values.deflection / 5 && ok.values.margin >= 2 && ok.values.stress > 0, JSON.stringify(ok.values));
  } finally { done(); }
});

test('a motor drives a joint in its own steps; a servo brings its range, and refuses more', async () => {
  const { motorDrives } = await import('./lib/motors.mjs'), { motorModel } = await import('@rulecad/motors');
  const item = (model, drives) => [{ motor: { model, drives } }, { id: 'm', src: { motor: motorModel(model) } }];
  const stepper = { id: 'j', type: 'revolute', dofs: [[-180, 180, 0]] };
  motorDrives({ joints: [{ id: 'j' }] }, [item('28byj48', 'j')], [stepper], (x) => x);
  assert.equal(stepper.step, 5.625 / 64);
  const servo = { id: 'j', type: 'revolute', dofs: [[-180, 180, 0]] };
  motorDrives({ joints: [{ id: 'j' }] }, [item('sg90', 'j')], [servo], (x) => x);
  assert.deepEqual(servo.dofs[0], [-90, 90, 0]);
  assert.throws(() => motorDrives({ joints: [{ id: 'j', min: -120, max: 120 }] }, [item('sg90', 'j')], [{ id: 'j', type: 'revolute', dofs: [[-120, 120, 0]] }], (x) => x), /turns 180°/);
  assert.throws(() => motorDrives({ joints: [{ id: 'j' }] }, [item('sg90', 'j')], [{ id: 'j', type: 'prismatic', dofs: [[0, 1, 0]] }], (x) => x), /a motor turns a revolute/);
  assert.throws(() => motorDrives({ joints: [{ id: 'j' }] }, [item('sg90', 'j')], [{ id: 'j', type: 'revolute', follow: ['k', 1, 0], dofs: [[0, 1, 0]] }], (x) => x), /leads the train/);
});

test('the tutorial: every file and command in TUTORIAL.md works as written, in a workspace npm create rulecad makes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tutorial-')), ws = path.join(root, 'my-designs');
  try {
    const { text, files, commands } = replay(fileURLToPath(new URL('./TUTORIAL.md', import.meta.url)), ws);
    assert.ok(files >= 5 && commands >= 10, `${files} files, ${commands} commands`);
    assert.match(run(ws, ['check', 'home/hook-on-screw']).out, /The screw in its hole: closest gap 0\.\d+ mm/);
    // and the mistakes it lists are reported in the words it gives
    const js = path.join(ws, 'projects/home/objects/hook.js'), good = fs.readFileSync(js, 'utf8');
    for (const [from, to, said] of [['v.plate / 2 / 2', 'v.plate / 4', 'numbers in hook.js that should be variables: line 10: 4'], ['v.thick / 2', 'v.thik / 2', 'v.thik: the design has no variable "thik" (did you mean "thick"?)'], ['return v.ops', 'v.ops', 'main() returned no shape: return a JSCAD solid, or named parts']]) {
      fs.writeFileSync(js, good.replace(from, to));
      const out = run(ws, ['check', 'home/hook']).out;
      assert.ok(out.includes(said), `${to}: ${out}`);
      assert.ok(text.includes(said), `the tutorial's table says: ${said}`);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('the worked examples: every file and command in EXAMPLES.md works as written, parts to a mechanism', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'examples-')), ws = path.join(root, 'my-designs');
  try {
    const { files, commands } = replay(fileURLToPath(new URL('./EXAMPLES.md', import.meta.url)), ws);
    assert.ok(files >= 14 && commands >= 16, `${files} files, ${commands} commands`);
    // What each example promises
    assert.ok(fs.existsSync(path.join(ws, 'exports/home/tag@0.1.0.3mf')), 'the tag exported with its parts');
    assert.match(run(ws, ['check', 'home/tag:long']).out, /88 × 28 × [\d.]+ mm/, 'the long variant: 80 mm with its brim');
    assert.match(run(ws, ['check', 'home/box']).out, /2 poses checked: shut, open/);
    const rules = JSON.parse(fs.readFileSync(path.join(ws, 'rules/basemodel.json'), 'utf8')).rules;
    assert.equal(rules.size_x?.kind, 'derived', 'the measured model became draft rules');
    assert.match(run(ws, ['check', 'home/arm']).out, /arm down: moves [\d.]+ mm under 10 N/);
    assert.match(run(ws, ['check', 'home/pad']).out, /matrix: 4 keys on 2 rows × 2 columns/);
    assert.ok(fs.readdirSync(path.join(ws, '.preview/home')).some((f) => f.endsWith('flick-sequence.svg')), 'the mechanism animated');
    const slider = run(ws, ['check', 'home/slider']).out;
    assert.match(slider, /knob drives slide: 43\.98 mm of rack a turn/, 'the gears: travel a turn');
    assert.match(slider, /knob and slide: centre distance 7\.2 mm, as they need/);
    assert.match(run(ws, ['check', 'home/slider', '--sweep', '--steps', '12']).out, /sweep knob, -180 to 180° in 12 steps: nothing collides/);
    const winder = run(ws, ['check', 'home/winder']).out;
    assert.match(winder, /the carrier drives the sun and the planets \(the ring held\): 4 turns of the sun for each turn of the carrier, the same way/, 'the planetary: four turns a crank');
    assert.doesNotMatch(winder, /✗/, winder);
    assert.match(run(ws, ['check', 'home/winder', '--sweep', '--steps', '24']).out, /sweep crank, -180 to 180° in 24 steps: nothing collides/);
    const driven = run(ws, ['check', 'home/driven']).out;
    assert.match(driven, /drive: 28byj48, 30 g, drives pinion, 0\.0879° a step/, 'the motor');
    assert.match(driven, /drive into slide: [\d.]+ N there against 1 N needed .*rests on community figures/, 'the torque, and what it rests on');
    assert.match(driven, /slide holds with the power off/);
    assert.match(driven, /✓ drive on rail: under the motor's 30 g and [\d.]+ N m, the shaft's tip moves [\d.]+ mm/, 'the rail bent under its motor, by FE');
    assert.doesNotMatch(driven, /✗/, driven);
    assert.match(run(ws, ['check', 'home/driven', '--sweep', '--steps', '12']).out, /sweep pinion, -180 to 180° in 12 steps: nothing collides/);
    const shoulder = run(ws, ['check', 'home/shoulder']).out;
    assert.match(shoulder, /the second ring turns 0\.02632 of the sun's turn, the other way \(38:1/, 'the compound planetary');
    assert.match(shoulder, /motor into out: 7\.442 N m there against 0\.735 N m needed/, 'the worst of its range, from a mass on the output');
    assert.match(shoulder, /out holds with the power off: the gears/);
    assert.doesNotMatch(shoulder, /✗/, shoulder);
    // The leg (chapter 14): it stands and steps, nothing overlaps (the output ring's phase, a joint whose range leaves out 0), and the motors carry it
    const stand = JSON.parse(run(ws, ['check', 'leg/stand', '--json']).out).findings, of = (c) => stand.filter((x) => x.code === c);
    assert.equal(of('overlap')[0].level, 'pass', of('overlap')[0].text);
    assert.equal(of('gait.clearance')[0].level, 'pass'); assert.equal(of('gait.sweep')[0].level, 'pass');
    assert.ok(stand.some((x) => x.code === 'motor.torque' && /gait: knee needs/.test(x.text) && x.level === 'pass'), JSON.stringify(of('motor.torque')));
    assert.match(of('gait.stable')[0].text, /one leg, on a stand/);
    assert.ok(fs.existsSync(path.join(ws, '.preview/leg/stand-gait.svg')), 'its step animated');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('releases: a design released as a git tag, its history, a change bumped, an earlier release rebuilt and compared (paths in git\'s terms on every system)', () => {
  const { ws, cad, done } = workspace();
  const git = (...a) => execFileSync('git', a, { cwd: ws, encoding: 'utf8', stdio: 'pipe' });
  try {
    git('init', '-q', '-b', 'main'); git('config', 'user.email', 'test@example.com'); git('config', 'user.name', 'Test'); git('config', 'commit.gpgsign', 'false'); git('config', 'tag.gpgsign', 'false');
    fs.writeFileSync(path.join(ws, '.gitignore'), 'node_modules\n.cache\nexports\n.preview\n.versions\n');
    cad('new', 'home/tray');
    git('add', '-A'); git('commit', '-q', '-m', 'A tray');
    assert.match(cad('release', 'home/tray', '-m', 'First tray', '--dry-run'), /home\/tray@0\.1\.0/);
    assert.match(cad('release', 'home/tray', '-m', 'First tray'), /tagged home\/tray@0\.1\.0/);
    assert.match(git('tag', '-l'), /home\/tray@0\.1\.0/);
    assert.match(cad('history', 'home/tray'), /0\.1\.0 +\d{4}-\d\d-\d\d +first +First tray/);
    // A change: wider, inside its range. Its bump is said, then made; the earlier release still builds from its tag
    const w = JSON.parse(fs.readFileSync(path.join(ws, 'projects/home/objects/tray.json'), 'utf8')).variables.width, to = Math.min(w.tweak?.max ?? w.value + 5, w.value + 5);
    cad('set', 'home/tray', `width=${to}`);
    assert.match(cad('release', 'home/tray', '-m', 'Wider', '--dry-run'), /home\/tray@0\.1\.1 \(patch, from 0\.1\.0\)/);
    assert.match(cad('release', 'home/tray', '-m', 'Wider'), /tagged home\/tray@0\.1\.1/);
    assert.match(cad('export', 'home/tray@0.1.0'), /tray@0\.1\.0/);
    assert.ok(fs.existsSync(path.join(ws, 'exports', 'home', 'tray@0.1.0.3mf')), 'the earlier release, rebuilt from its tag');
    assert.match(cad('diff', 'home/tray', '0.1.0', '0.1.1'), /width/);
    assert.match(fs.readFileSync(path.join(ws, 'projects/home/CHANGELOG.md'), 'utf8'), /tray 0\.1\.1 \(patch[\s\S]*Wider/);
  } finally { done(); }
});

test('a check reads the object against its schema first; a measurement with no rule, and an object with no name, are warnings', () => {
  const { ws, cad, done } = workspace();
  try {
    object(ws, 'demo/plain', { variables: { w: { value: 10, unit: 'mm' } } }, BOX.replace(/v\.(d|h)\b/g, 'v.w'));
    const out = cad('check', 'demo/plain');
    assert.match(out, /! a variable has no rule saying why it is what it is: w/);
    const file = path.join(ws, 'projects/demo/objects/plain.json'), j = JSON.parse(fs.readFileSync(file, 'utf8'));
    j.variables.w.value = null; fs.writeFileSync(file, JSON.stringify(j));
    assert.match(cad('check', 'demo/plain'), /variables\.w\.value: should be number or string or boolean or array or object, not null/);
  } finally { done(); }
});

test('a node_modules link spelled through another link: the sandbox names the link it was refused, and the remedy', { skip: process.platform === 'win32' && 'linked folders need privileges on Windows' }, () => {
  const { ws, cad, done } = workspace();
  // a folder outside the workspace, reached through a link beside it: the way macOS spells /var/folders through /var
  const real = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'rulecad-alias-'))), alias = `${real}-link`;
  try {
    fs.symlinkSync(real, alias, 'dir'); fs.symlinkSync(ROOT_MODULES, path.join(real, 'node_modules'), 'dir');
    fs.rmSync(path.join(ws, 'node_modules')); fs.symlinkSync(path.join(alias, 'node_modules'), path.join(ws, 'node_modules'), 'dir');
    cad('new', 'home/tray');
    const out = cad('check', 'home/tray');
    assert.match(out, new RegExp(`sandbox was refused ${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}, a link to ${real.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), out);
    assert.match(out, /Make that link with its real path/);
  } finally { done(); fs.rmSync(alias, { force: true }); fs.rmSync(real, { recursive: true, force: true }); }
});

test('gears in an assembly: mesh turns a joint into its mate\'s follower in phase, the centre distance is checked, and the sweep proves it turns', () => {
  const { ws, cad, done } = workspace();
  try {
    const gear = (teeth) => ({ variables: { module: { value: 1, unit: 'mm', rule: 'Tooth size' }, teeth: { value: teeth, rule: 'Teeth' }, width: { value: 6, unit: 'mm', rule: 'Face width' }, bore: { value: 3, unit: 'mm', rule: 'Shaft' } },
      anchors: { axis: { at: [0, 0, 0], axis: [0, 0, 1] } } });
    const GEAR = 'export function main (v) { return v.gears.spur({ module: v.module, teeth: v.teeth, width: v.width, bore: v.bore }) }\n';
    object(ws, 'demo/pinion', gear(18), GEAR);
    object(ws, 'demo/wheel', gear(30), GEAR);
    object(ws, 'demo/bar', { variables: { module: { value: 1, unit: 'mm', rule: 'Tooth size' }, teeth: { value: 20, rule: 'Teeth' }, width: { value: 6, unit: 'mm', rule: 'Face width' } }, anchors: { slide: { at: [0, 0, 0], axis: [1, 0, 0] } } },
      'export function main (v) { return v.gears.rack({ module: v.module, teeth: v.teeth, width: v.width }) }\n');
    object(ws, 'demo/plate', { variables: { t: { value: 2, unit: 'mm', rule: 'Plate' } } }, "import jscad from '@jscad/modeling'\nexport function main (v) { return jscad.primitives.cuboid({ size: [40, 30, v.t], center: [0, -40, v.t / 2] }) }\n");
    fs.mkdirSync(path.join(ws, 'projects/demo/assemblies'));
    const train = (wheelAt, wheel = {}) => fs.writeFileSync(path.join(ws, 'projects/demo/assemblies/train.json'), JSON.stringify({ title: 'Train', kind: 'fit',
      items: [{ id: 'plate', object: 'plate' }, { id: 'pinion', object: 'pinion' }, { id: 'wheel', object: 'wheel' }, { id: 'bar', object: 'bar' }],
      joints: [
        { id: 'drive', type: 'revolute', parent: { item: 'plate', at: [0, 0, 'plate.t'], axis: [0, 0, 1] }, child: 'pinion.axis', min: -90, max: 90, label: 'Crank' },
        { id: 'wheel', type: 'revolute', parent: { item: 'plate', at: [0, wheelAt, 'plate.t'], axis: [0, 0, 1] }, child: 'wheel.axis', min: -360, max: 360, ...wheel },
        // the rack under the pinion: its pitch line 9 mm below the pinion's centre (the pitch radius), along x
        { id: 'slide', type: 'prismatic', parent: { item: 'plate', at: [-31.4, -9, 'plate.t'], axis: [1, 0, 0] }, child: 'bar.slide', min: -40, max: 40, mesh: { with: 'drive', module: 'pinion.module', teeth: ['pinion.teeth', 'bar.teeth'] } }],
    }));
    const meshed = { mesh: { with: 'drive', module: 'pinion.module', teeth: ['pinion.teeth', 'wheel.teeth'] } };
    train(24, meshed);
    const checked = cad('check', 'demo/train');
    assert.match(checked, /drive drives wheel: 0\.6 turns of the second for each turn of the first \(18:30\), turning opposite ways/);
    assert.match(checked, /drive and wheel: centre distance 24 mm, as they need: 0\.15 mm of backlash/);
    assert.match(checked, /drive and slide: centre distance 9 mm, as they need/);
    assert.match(checked, /drive and wheel: as drawn, 0\.1[45]\d* (to 0\.1[45]\d* )?mm of play at the pitch circle/, 'measured from the drawn teeth');
    assert.match(checked, /drive drives slide: 56\.55 mm of rack a turn/);
    assert.match(checked, /no parts overlap/);
    const swept = cad('check', 'demo/train', '--sweep', '--steps', '18');
    assert.match(swept, /sweep drive, -90 to 90° in 18 steps: nothing collides/, swept);
    // the same follow without the phase: the teeth meet
    train(24, { follow: 'drive', ratio: -0.6, offset: 0 });
    assert.match(cad('check', 'demo/train', '--sweep', '--steps', '18'), /sweep drive, -90 to 90° in 18 steps: .*pinion\.body hits wheel\.body/);
    // axes too close: more than the backlash allows, said between them
    train(23.7, meshed);
    const close = JSON.parse(cad('check', 'demo/train', '--json')).findings.find((x) => x.code === 'mesh.centre' && x.text.startsWith('drive and wheel'));
    assert.equal(close.level, 'fail'); assert.match(close.text, /0\.3 mm closer than these gears need \(24 mm\): more than their 0\.15 mm of backlash allows, and the teeth jam/);
    assert.deepEqual(close.between.map((p) => p.map((x) => +x.toFixed(6))), [[0, 0, 2], [0, 23.7, 2]]);
    // what isn't a mesh
    train(24, { mesh: { with: 'nothing', module: 1, teeth: [18, 30] } });
    assert.match(cad('check', 'demo/train'), /joint wheel: mesh: "with" names the driving joint/);
    train(24, { mesh: { with: 'drive', module: 1, teeth: [12, 30] } });
    assert.match(cad('check', 'demo/train'), /joint wheel: mesh: gearModel: 12 teeth at 20° are undercut/);
  } finally { done(); }
});

test('a planetary gearbox in an assembly: the carrier drives, the sun and every planet follow in phase, and the sweep proves it turns', () => {
  const { ws, cad, done } = workspace();
  try {
    const gear = (teeth) => ({ variables: { module: { value: 1, unit: 'mm', rule: 'Tooth size' }, teeth: { value: teeth, rule: 'Teeth' }, width: { value: 6, unit: 'mm', rule: 'Face width' }, bore: { value: 3, unit: 'mm', rule: 'Shaft' } },
      anchors: { axis: { at: [0, 0, 0], axis: [0, 0, 1] } } });
    const GEAR = 'export function main (v) { return v.gears.spur({ module: v.module, teeth: v.teeth, width: v.width, bore: v.bore }) }\n';
    object(ws, 'box/sun', gear(18), GEAR);
    object(ws, 'box/planet', gear(27), GEAR);
    object(ws, 'box/ring', { variables: { module: { value: 1, unit: 'mm', rule: 'Tooth size' }, teeth: { value: 72, rule: 'Teeth' }, width: { value: 6, unit: 'mm', rule: 'Face width' } } },
      'export function main (v) { return v.gears.internal({ module: v.module, teeth: v.teeth, width: v.width }) }\n');
    // the carrier: a disc over the gears, inside the ring's tips, holding the planets' axles below it
    const at = (deg) => [22.5 * Math.cos((deg * Math.PI) / 180), 22.5 * Math.sin((deg * Math.PI) / 180), '0 - drop'];
    object(ws, 'box/carrier', { variables: { a: { value: 22.5, unit: 'mm', rule: 'Sun to planet: m (S + P) / 2' }, drop: { value: 6.4, unit: 'mm', rule: 'A planet\'s width and a gap' }, r: { value: 28, unit: 'mm', rule: 'Inside the ring\'s tips' }, t: { value: 2, unit: 'mm', rule: 'Plate' } },
      anchors: { axis: { at: [0, 0, 0], axis: [0, 0, 1] }, p0: { at: at(0), axis: [0, 0, 1] }, p1: { at: at(120), axis: [0, 0, 1] }, p2: { at: at(240), axis: [0, 0, 1] } } },
      "import jscad from '@jscad/modeling'\nexport function main (v) { return jscad.primitives.cylinder({ radius: v.r, height: v.t, center: [0, 0, v.t / 2] }) }\n");
    object(ws, 'box/case', { variables: { t: { value: 2, unit: 'mm', rule: 'Base' } } }, "import jscad from '@jscad/modeling'\nexport function main (v) { return jscad.primitives.cylinder({ radius: 45, height: v.t, center: [0, 0, v.t / 2] }) }\n");
    fs.mkdirSync(path.join(ws, 'projects/box/assemblies'));
    const box = (third = 240) => fs.writeFileSync(path.join(ws, 'projects/box/assemblies/gearbox.json'), JSON.stringify({ title: 'Gearbox', kind: 'fit',
      items: ['case', 'sun', 'carrier', 'planet', 'planet', 'planet'].map((o, i) => ({ id: i >= 3 ? `p${i - 3}` : o, object: o })).concat([{ id: 'ring', object: 'ring', at: [0, 0, 2.4] }]),
      joints: [
        { id: 'sun', type: 'revolute', parent: { item: 'case', at: [0, 0, 2.4], axis: [0, 0, 1] }, child: 'sun.axis', min: -1000, max: 1000 },
        { id: 'carrier', type: 'revolute', parent: { item: 'case', at: [0, 0, 8.8], axis: [0, 0, 1] }, child: 'carrier.axis', min: -60, max: 60, label: 'Carrier' },
        ...[0, 1, 2].map((k) => ({ id: `p${k}`, type: 'revolute', parent: k === 2 ? { item: 'carrier', at: [22.5 * Math.cos((third * Math.PI) / 180), 22.5 * Math.sin((third * Math.PI) / 180), '0 - carrier.drop'], axis: [0, 0, 1] } : `carrier.p${k}`, child: `p${k}.axis`, min: -1000, max: 1000 })),
      ],
      planetary: [{ sun: 'sun', carrier: 'carrier', ring: 'ring', planets: ['p0', 'p1', 'p2'], drive: 'carrier', module: 1, teeth: ['sun.teeth', 'p0.teeth', 'ring.teeth'] }],
      poses: { rest: { carrier: 0 }, back: { carrier: -15 } },
    }));
    box();
    const checked = cad('check', 'box/gearbox');
    assert.match(checked, /the carrier drives the sun and the planets \(the ring held\): 5 turns of the sun for each turn of the carrier, the same way/, checked);
    // the ring only placed on the case, nothing fastening it: said
    assert.match(checked, /! ring is placed, but nothing holds it: give it a joint, or fasten it/);
    assert.match(checked, /sun and p2: centre distance 22\.5 mm, as they need/);
    assert.match(checked, /sun and p0: as drawn, [\d.]+ (to [\d.]+ )?mm of play/); assert.match(checked, /p0 and the ring: as drawn, [\d.]+ (to [\d.]+ )?mm of play/);
    assert.match(checked, /no parts overlap/);
    assert.doesNotMatch(checked, /✗/);
    // at −15° JSCAD's intersection read the sun 2.7 mm³ into a planet 0.07 mm from it; measured with Manifold, clear
    assert.match(cad('check', 'box/gearbox', '--pose', 'back'), /Gearbox \(back\)[\s\S]*✓ no parts overlap/);
    const swept = cad('check', 'box/gearbox', '--sweep', '--steps', '16');
    assert.match(swept, /sweep carrier, -60 to 60° in 16 steps: nothing collides/, swept);
    // a planet out of place: it can't mesh with both
    box(250);
    assert.match(cad('check', 'box/gearbox'), /✗ planet p2 can't mesh with the sun and the ring at once where it is/);
  } finally { done(); }
});

test('a worm and its wheel in an assembly: the wheel follows a tooth a turn, in phase, and the sweep proves it', () => {
  const { ws, cad, done } = workspace();
  try {
    const vars = { module: { value: 1, unit: 'mm', rule: 'Tooth size' }, bore: { value: 3, unit: 'mm', rule: 'Shaft' } };
    object(ws, 'drive/worm', { variables: { ...vars, length: { value: 24, unit: 'mm', rule: 'Thread length' } }, anchors: { axis: { at: [0, 0, 0], axis: [0, 0, 1] } } },
      'export function main (v) { return v.gears.worm({ module: v.module, length: v.length, bore: v.bore }) }\n');
    object(ws, 'drive/wheel', { variables: { ...vars, teeth: { value: 30, rule: 'Teeth' }, width: { value: 6, unit: 'mm', rule: 'Face width' } }, anchors: { axis: { at: [0, 0, 0], axis: [0, 0, 1] } } },
      'export function main (v) { return v.gears.wormWheel({ module: v.module }, { teeth: v.teeth, width: v.width, bore: v.bore }) }\n');
    fs.mkdirSync(path.join(ws, 'projects/drive/assemblies'));
    const drive = (wheel) => fs.writeFileSync(path.join(ws, 'projects/drive/assemblies/box.json'), JSON.stringify({ title: 'Worm drive', kind: 'fit',
      items: [{ id: 'worm', object: 'worm' }, { id: 'wheel', object: 'wheel' }],
      // the worm along x, 20 mm over the wheel's axis (along y), the wheel's middle on the worm's axis
      joints: [{ id: 'turn', type: 'revolute', parent: { at: [-12, 0, 20], axis: [1, 0, 0] }, child: 'worm.axis', min: -720, max: 720, label: 'Worm' },
        { id: 'wheel', type: 'revolute', parent: { at: [0, -3, 0], axis: [0, 1, 0] }, child: 'wheel.axis', min: -720, max: 720, ...wheel }],
    }));
    drive({ mesh: { with: 'turn', module: 'worm.module', teeth: [1, 'wheel.teeth'], worm: true } });
    const checked = cad('check', 'drive/box');
    assert.match(checked, /turn drives wheel: a worm of 1 start, 30 turns of the worm for one of the wheel/, checked);
    assert.match(checked, /it locks: the lead angle \(5\.71°\) is under the friction angle/);
    assert.match(checked, /centre distance 15 mm, as they need/, 'the wheel\'s centre its pitch radius (15 mm) from the worm\'s pitch cylinder');
    assert.match(checked, /no parts overlap/);
    assert.match(cad('check', 'drive/box', '--sweep', '--steps', '16'), /sweep turn, -720 to 720° in 16 steps: nothing collides/);
    // the same ratio with no phase: the thread runs into the teeth
    drive({ follow: 'turn', ratio: 1 / 30, offset: 0 });
    assert.match(cad('check', 'drive/box', '--sweep', '--steps', '16'), /worm\.body hits wheel\.body/);
  } finally { done(); }
});

test('bevel gears in an assembly: cones that share their apex mesh in phase at 90°, and the sweep proves it', () => {
  const { ws, cad, done } = workspace();
  try {
    const gear = (teeth, mate) => ({ variables: { module: { value: 1.5, unit: 'mm', rule: 'Tooth size' }, teeth: { value: teeth, rule: 'Teeth' }, mate: { value: mate, rule: 'Its mate' }, bore: { value: 4, unit: 'mm', rule: 'Shaft' } }, anchors: { axis: { at: [0, 0, 0], axis: [0, 0, 1] } } });
    const BEVEL = 'export function main (v) { return v.gears.bevel({ module: v.module, teeth: v.teeth, mate: v.mate, bore: v.bore }) }\n';
    object(ws, 'corner/small', gear(20, 30), BEVEL);
    object(ws, 'corner/large', gear(30, 20), BEVEL);
    fs.mkdirSync(path.join(ws, 'projects/corner/assemblies'));
    // the small gear up z, its apex 22.5 mm over its back (R cos δ = the large gear's pitch radius); the large one
    // pointing back along −x at that apex, its back end 15 mm from it
    const pair = (at, mesh = { mesh: { with: 'input', module: 1.5, teeth: [20, 30], bevel: true } }) => fs.writeFileSync(path.join(ws, 'projects/corner/assemblies/pair.json'), JSON.stringify({ title: 'Corner drive', kind: 'fit',
      items: [{ id: 'small', object: 'small' }, { id: 'large', object: 'large' }],
      joints: [{ id: 'input', type: 'revolute', parent: { at: [0, 0, 0], axis: [0, 0, 1] }, child: 'small.axis', min: -90, max: 90, label: 'Input' },
        { id: 'output', type: 'revolute', parent: { at, axis: [-1, 0, 0] }, child: 'large.axis', min: -360, max: 360, ...mesh }],
    }));
    pair([15, 0, 22.5]);
    const checked = cad('check', 'corner/pair');
    assert.match(checked, /bevel gears at 90°, 0\.6667 turns of the second for each of the first \(cones of 33\.69° and 56\.31°\)/, checked);
    assert.match(checked, /no parts overlap/); assert.doesNotMatch(checked, /✗/);
    assert.match(cad('check', 'corner/pair', '--sweep', '--steps', '16'), /sweep input, -90 to 90° in 16 steps: nothing collides/);
    // the cones' apexes apart: said
    pair([16, 0, 22.5]);
    assert.match(cad('check', 'corner/pair'), /✗ .*the cones' apexes are 1 mm apart/);
  } finally { done(); }
});

test('engage: a sleeve seated over a post passes; resting on the post\'s end, touching and not overlapping, it fails', () => {
  const { ws, cad, done } = workspace();
  try {
    object(ws, 'shaft/post', { variables: { r: { value: 2, unit: 'mm', rule: 'Post' }, h: { value: 10, unit: 'mm', rule: 'Post' } }, anchors: { top: { at: [0, 0, 'h'], axis: [0, 0, 1] } } },
      "import jscad from '@jscad/modeling'\nexport function main (v) { return jscad.primitives.cylinder({ radius: v.r, height: v.h, center: [0, 0, v.h / 2] }) }\n");
    const sleeve = (anchorAt) => object(ws, 'shaft/sleeve', { variables: { r: { value: 4, unit: 'mm', rule: 'Sleeve' }, hole: { value: 2.2, unit: 'mm', rule: 'Round the post' }, t: { value: 4, unit: 'mm', rule: 'Sleeve' } }, anchors: { seat: { at: [0, 0, anchorAt], axis: [0, 0, 1] } } },
      "import jscad from '@jscad/modeling'\nconst { cylinder } = jscad.primitives\nexport function main (v) { return jscad.booleans.subtract(cylinder({ radius: v.r, height: v.t, center: [0, 0, v.t / 2] }), cylinder({ radius: v.hole, height: v.t, center: [0, 0, v.t / 2] })) }\n");
    fs.mkdirSync(path.join(ws, 'projects/shaft/assemblies'));
    fs.writeFileSync(path.join(ws, 'projects/shaft/assemblies/pair.json'), JSON.stringify({ title: 'Sleeve on a post', kind: 'fit',
      items: [{ id: 'post', object: 'post' }, { id: 'sleeve', object: 'sleeve' }],
      joints: [{ id: 'on', type: 'fixed', parent: 'post.top', child: 'sleeve.seat' }],
      fits: [{ a: 'sleeve', b: 'post', engage: 'sleeve.t', note: 'Sleeve over the post' }] }));
    sleeve(0); // its anchor on its bottom face: it stands on the post's end
    const resting = cad('check', 'shaft/pair');
    assert.match(resting, /no parts overlap/, 'touching end to end overlaps nothing');
    assert.match(resting, /✗ Sleeve over the post: not on at all \(end to end\) along their joint, where it should go 4 mm on/);
    sleeve('t'); // its anchor on its top face: it goes down over the post
    assert.match(cad('check', 'shaft/pair'), /✓ Sleeve over the post: 4 mm on along their joint/);
  } finally { done(); }
});

test('joint.running: a child turning on a printed pin, against the printer\'s fit, less what a bore prints small by', async () => {
  const { runningGap } = await import('./lib/seats.mjs');
  const jscad = (await import('@jscad/modeling')).default, { cylinder } = jscad.primitives, { subtract } = jscad.booleans, { geom3 } = jscad.geometries;
  const tris = (g) => geom3.toPolygons(g).flatMap((p) => p.vertices.slice(1, -1).map((_, i) => [p.vertices[0], p.vertices[i + 1], p.vertices[i + 2]].map((v) => [...v])));
  const pin = (d, z0 = 0, z1 = 8) => tris(cylinder({ radius: d / 2, height: z1 - z0, center: [0, 0, (z0 + z1) / 2], segments: 64 }));
  const ring = (bore, od, z0, z1) => tris(subtract(cylinder({ radius: od / 2, height: z1 - z0, center: [0, 0, (z0 + z1) / 2], segments: 64 }), cylinder({ radius: bore / 2, height: z1 - z0 + 2, center: [0, 0, (z0 + z1) / 2], segments: 64 })));
  const g = runningGap(pin(2.79), ring(3, 12, 1, 6));
  assert.ok(Math.abs(g.gap - 0.105) < 0.005, `the gear card's pegs: ${g.gap}`);
  assert.equal(g.pinOn, 'a');
  assert.ok(Math.abs(g.length - 5) < 1, 'as far as they share');
  const round = runningGap(ring(3, 12, 1, 6), pin(2.79));
  assert.equal(round.pinOn, 'b', 'either way round');
  assert.equal(runningGap(pin(2.79), ring(8, 12, 1, 6)), null, 'room, not a running fit');
  assert.equal(runningGap(pin(2.79, 0, 1), ring(3, 12, 2, 6)), null, 'nothing shared along the axis');
  assert.equal(runningGap(ring(3, 12, 0, 5), ring(3, 12, 0, 5)), null, 'two bores: nothing turns on a pin');
});

test('cad measured: a measurement where the estimate was, what moved, the ledger, and the table of what is still assumed', () => {
  const { ws, cad, done } = workspace();
  try {
    fs.mkdirSync(path.join(ws, 'projects/home/objects'), { recursive: true }); fs.mkdirSync(path.join(ws, 'projects/home/assemblies'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'projects/home/project.json'), JSON.stringify({ name: 'home', material: 'PLA', objects: ['block'] }));
    fs.writeFileSync(path.join(ws, 'projects/home/objects/block.json'), JSON.stringify({ name: 'block', title: 'Block', version: '0.1.0', uses: ['x1c'], engine: 'manifold', variables: { side: { value: '200 * x1c.press', unit: 'mm', rule: 'A side, from the press' } } }));
    fs.writeFileSync(path.join(ws, 'projects/home/objects/block.js'), "import jscad from '@jscad/modeling'\nconst { cuboid } = jscad.primitives\nexport function main (v) { return cuboid({ size: [v.side, v.side, v.side], center: [v.side / 2, v.side / 2, v.side / 2] }) }\n");
    fs.writeFileSync(path.join(ws, 'projects/home/assemblies/one.json'), JSON.stringify({ title: 'One', kind: 'fit', items: [{ id: 'a', object: 'block' }, { id: 'b', object: 'block', at: [20, 0, 0] }], fits: [{ a: 'a', b: 'b', min: 0, max: 100, note: 'apart' }] }));
    const first = cad('check', 'home/one');
    assert.match(first, /uses estimates, not measurements: x1c\.press/); assert.match(first, /cad measured home\/one <name>=<value>/);
    assert.match(cad('measured', 'home/one', '--table'), /\| `x1c\.press` \| .*\| `cad measured home\/one x1c\.press=<value>` \|/);
    const out = cad('measured', 'home/one', 'x1c.press=0.08', '--source', 'seats coupon');
    assert.match(out, /x1c\.press: measured 0\.08 mm, predicted 0\.05 \(estimate\), ratio 1\.6/); assert.match(out, /apart: closest gap 4 mm/);
    const rule = JSON.parse(fs.readFileSync(path.join(ws, 'rules/x1c.json'), 'utf8')).rules.press;
    assert.equal(rule.value, 0.08); assert.equal(rule.kind, 'measured'); assert.equal(rule.source, 'seats coupon');
    assert.doesNotMatch(cad('check', 'home/one'), /x1c\.press\. /, 'no longer an estimate');
    assert.match(cad('history', 'home/one'), /x1c\.press: measured 0\.08/);
    assert.match(cad('history', 'home'), /ratio 1\.6/);
    assert.match(cad('measured', 'home/one', 'x1c.nothing=1'), /x1c has no rule "nothing"/);
    assert.match(cad('measured', 'home/one', 'x1c.press=2', '--unit', 'in'), /is in mm, and this is in in/);
    assert.match(cad('measured', 'home/none', 'x1c.press=2'), /no assembly "home\/none"/);
  } finally { done(); }
});

test('wires: longest through the poses, a gauge against what it carries, the sheet; a bad route refused by name', async () => {
  const { ws, cad, done } = workspace();
  try {
    fs.mkdirSync(path.join(ws, 'projects/home/objects'), { recursive: true }); fs.mkdirSync(path.join(ws, 'projects/home/assemblies'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'projects/home/project.json'), JSON.stringify({ name: 'home', material: 'PLA', objects: ['link'] }));
    fs.writeFileSync(path.join(ws, 'projects/home/objects/link.json'), JSON.stringify({ name: 'link', title: 'Link', version: '0.1.0', engine: 'manifold', anchors: { base: { at: [0, 0, 0], axis: [0, 0, 1] }, tip: { at: [100, 0, 0], axis: [0, 0, 1] } }, variables: { long: { value: 100, unit: 'mm', rule: 'Long' }, thick: { value: 5, unit: 'mm', rule: 'Thick' } } }));
    fs.writeFileSync(path.join(ws, 'projects/home/objects/link.js'), "import jscad from '@jscad/modeling'\nconst { cuboid } = jscad.primitives\nexport function main (v) { return cuboid({ size: [v.long, v.thick, v.thick], center: [v.long / 2, 0, v.thick / 2] }) }\n");
    const a = { title: 'Arm', kind: 'fit', items: [{ id: 'base', object: 'link' }, { id: 'arm', object: 'link' }, { id: 'stepper', motor: { model: 'nema17' }, at: [0, 60, 40] }],
      joints: [{ id: 'j', type: 'revolute', parent: 'base.tip', child: 'arm.base', min: -90, max: 90 }], fits: [{ a: 'arm', b: 'base', min: -1000, silent: true }],
      wires: [{ id: 'm1', from: 'stepper.connector', to: 'arm.tip', gauge: 'awg22' }, { id: 'thin', from: 'stepper.connector', to: 'arm.tip', gauge: 'awg28' }] };
    fs.writeFileSync(path.join(ws, 'projects/home/assemblies/arm.json'), JSON.stringify(a));
    const check = JSON.parse(spawnSync(process.execPath, [BIN, 'check', 'home/arm', '--json'], { cwd: ws, encoding: 'utf8' }).stdout).findings.filter((x) => x.code.startsWith('wire.'));
    const len = check.find((x) => x.code === 'wire.length' && x.refs.wire === 'm1');
    assert.equal(len.values.length, Math.ceil(len.values.longest + 40), 'its longest, and the loop');
    assert.ok(len.values.longest > len.values.shortest + 50, 'it changes as the arm swings');
    assert.equal(check.find((x) => x.code === 'wire.gauge' && x.refs.wire === 'm1').level, 'pass');
    const thin = check.find((x) => x.code === 'wire.gauge' && x.refs.wire === 'thin');
    assert.equal(thin.level, 'fail'); assert.match(thin.text, /awg28 carries 0\.81 A at most, and this carries 2 A/);
    a.wires = [{ from: 'arm.nothing', to: 'base.tip' }]; fs.writeFileSync(path.join(ws, 'projects/home/assemblies/arm.json'), JSON.stringify(a));
    assert.match(cad('check', 'home/arm'), /wire w1: no anchor "arm\.nothing" .*arm has base, tip/);
    a.wires = [{ from: 'arm.tip', to: 'base.tip', gauge: 'thick' }]; fs.writeFileSync(path.join(ws, 'projects/home/assemblies/arm.json'), JSON.stringify(a));
    assert.match(cad('check', 'home/arm'), /wire 1: gauge is awg and a number/);
  } finally { done(); }
});

test('a bought bearing: placed from its set, turning a shaft, its printed seat read as drawn; an unknown part refused by name', async () => {
  const { ws, cad, done } = workspace();
  try {
    fs.mkdirSync(path.join(ws, 'projects/home/objects'), { recursive: true }); fs.mkdirSync(path.join(ws, 'projects/home/assemblies'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'projects/home/project.json'), JSON.stringify({ name: 'home', material: 'PLA', objects: ['housing'] }));
    fs.writeFileSync(path.join(ws, 'projects/home/objects/housing.json'), JSON.stringify({ name: 'housing', title: 'Housing', version: '0.1.0', uses: ['x1c'], engine: 'manifold', anchors: { seat: { at: [0, 0, 'tall - depth'], axis: [0, 0, 1] } }, variables: { tall: { value: 12, unit: 'mm', rule: 'Tall' }, depth: { value: 7, unit: 'mm', rule: 'Depth' }, off: { value: 0, unit: 'mm', rule: 'How far the pocket is from its fit', tweak: { min: -1, max: 1 } } } }));
    fs.writeFileSync(path.join(ws, 'projects/home/objects/housing.js'), "import jscad from '@jscad/modeling'\nconst { cuboid } = jscad.primitives\nconst bearing = { bore: 8, outer_diameter: 22, width: 7 }\nexport function main (v) {\n  const seat = v.shapes.bearingSeat(bearing, { fit: v.off ? -0.05 + v.off : 'press', printer: v.x1c, at: [0, 0, v.tall], into: '-z', relief: 2, through: true })\n  return v.ops.subtract(cuboid({ size: [34, 34, v.tall], center: [0, 0, v.tall / 2] }), seat)\n}\n");
    const a = { title: 'Seat', kind: 'fit', items: [{ id: 'housing', object: 'housing' }, { id: 'b1', bought: 'bearing-608', at: [0, 0, 5] }], fits: [{ a: 'b1', b: 'housing', seat: 'press', fastens: true }] };
    fs.writeFileSync(path.join(ws, 'projects/home/assemblies/seat.json'), JSON.stringify(a));
    const check = (o) => { const r = JSON.parse(spawnSync(process.execPath, [BIN, 'check', 'home/seat', ...(o ?? []), '--json'], { cwd: ws, encoding: 'utf8' }).stdout); assert.ok(r.findings, JSON.stringify(r.error)); return r.findings; };
    let f = check();
    assert.deepEqual(f.filter((x) => x.level === 'fail').map((x) => x.text), []);
    const seat = f.filter((x) => x.code === 'fit.seat');
    assert.equal(seat[0].level, 'pass'); assert.match(seat[0].text, /bearing-608 \(22 mm\) in a pocket drawn 22\.0\d+ mm, a press fit/);
    assert.equal(seat[1].level, 'pass'); assert.match(seat[1].text, /lip stops the outer race/);
    assert.equal(f.find((x) => x.code === 'bought.item').refs.set, 'bearing-608');
    a.items[0].set = { off: -0.3 }; fs.writeFileSync(path.join(ws, 'projects/home/assemblies/seat.json'), JSON.stringify(a));
    f = check().filter((x) => x.code === 'fit.seat');
    assert.equal(f[0].level, 'fail'); assert.match(f[0].text, /0\.3\d? mm too small: it will not press in/);
    assert.match(cad('list', 'home/seat'), /1 ×\s+bearing-608\s+a bearing/);
    a.items[1].bought = 'bearing-999'; fs.writeFileSync(path.join(ws, 'projects/home/assemblies/seat.json'), JSON.stringify(a));
    assert.match(cad('check', 'home/seat'), /no bought part "bearing-999" \(.*bearing-608/);
  } finally { done(); }
});

test('a task: reach and speed over a sheet, the error budget moved by a measurement, a machine, a drawing planned and refused', async () => {
  const { ws, cad, done } = workspace();
  try {
    fs.mkdirSync(path.join(ws, 'projects/home/objects'), { recursive: true }); fs.mkdirSync(path.join(ws, 'projects/home/assemblies'), { recursive: true }); fs.mkdirSync(path.join(ws, 'rules'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'projects/home/project.json'), JSON.stringify({ name: 'home', material: 'PLA', objects: ['link'] }));
    fs.writeFileSync(path.join(ws, 'rules/armrig.json'), JSON.stringify({ name: 'armrig', rules: { play: { value: 0.05, unit: '°', rule: 'Shoulder play', kind: 'estimate', source: 'a guess', checked: '2026-11-09' } } }));
    fs.writeFileSync(path.join(ws, 'projects/home/objects/link.json'), JSON.stringify({ name: 'link', title: 'Link', version: '0.1.0', engine: 'manifold', anchors: { base: { at: [0, 0, 0], axis: [0, 0, 1] }, tip: { at: ['long', 0, 0], axis: [0, 0, 1] } }, variables: { long: { value: 150, unit: 'mm', rule: 'Long', tweak: { min: 20, max: 400 } }, thick: { value: 5, unit: 'mm', rule: 'Thick' } } }));
    fs.writeFileSync(path.join(ws, 'projects/home/objects/link.js'), "import jscad from '@jscad/modeling'\nconst { cuboid } = jscad.primitives\nexport function main (v) { return cuboid({ size: [v.long, v.thick, v.thick], center: [v.long / 2, 0, v.thick / 2] }) }\n");
    const task = { tool: 'fore.tip', sheet: { size: 'a5', at: [180, 0, 30] }, speed: 50, accuracy: 0.6 };
    const asm = () => ({ title: 'Arm', kind: 'fit', uses: ['armrig'], items: [{ id: 'upper', object: 'link', set: { long: 150 } }, { id: 'fore', object: 'link', set: { long: 150 } }, { id: 'link0', object: 'link', at: [0, 0, 20] }, { id: 'm1', motor: { model: 'nema17', drives: 'elbow', speed: 300, driver: 'd1', microsteps: 16 }, at: [0, 0, -50] }, { id: 'd1', bought: 'drv8825', at: [0, 80, 0] }, { id: 'psu', bought: 'supply-12v', variant: 'LRS-50-12', set: { output_current: 1 }, at: [200, 200, 0] }],
      joints: [{ id: 'shoulder', type: 'revolute', parent: { at: [0, 0, 30] }, child: 'upper.base', min: -130, max: 130 }, { id: 'elbow', type: 'revolute', parent: 'upper.tip', child: 'fore.base', min: -150, max: 150, errors: { play: 'armrig.play' } }],
      fits: [{ a: 'upper', b: 'fore', min: -1000, silent: true }], task });
    const write = (a) => fs.writeFileSync(path.join(ws, 'projects/home/assemblies/arm.json'), JSON.stringify(a));
    const check = () => { const r = JSON.parse(spawnSync(process.execPath, [BIN, 'check', 'home/arm', '--json'], { cwd: ws, encoding: 'utf8' }).stdout); assert.ok(r.findings, JSON.stringify(r.error)); return r.findings; };
    const by = (list, code) => list.find((x) => x.code === code);
    write(asm());
    let f = check();
    assert.equal(by(f, 'task.reach').level, 'pass', by(f, 'task.reach').text);
    assert.match(by(f, 'task.speed').text, /nothing says how fast shoulder/, 'one joint has no motor');
    assert.ok(by(f, 'task.reach').values.samples.length > 50, 'the samples, for other programs');
    assert.ok(fs.existsSync(path.join(ws, '.preview/home/arm-reach.svg')) && fs.existsSync(path.join(ws, '.preview/home/arm-error.svg')));
    const before = by(f, 'task.accuracy').values.worst;
    assert.match(by(f, 'task.accuracy').text, /Rests on estimates \(elbow's play/);
    assert.match(by(f, 'power.supply').text, /draws 1\.25 A at 12 V .* and the supply gives 1 A/); assert.equal(by(f, 'power.supply').level, 'fail');
    assert.ok(f.some((x) => x.code === 'motor.driver' && x.level === 'warn' && /heat sink/.test(x.text)), 'over the bare rating'); assert.ok(f.some((x) => x.code === 'motor.driver' && /set the trimmer to 1 V for 2 A per coil/.test(x.text)));
    // A measurement moves the budget, and the ledger says so
    const m = cad('measured', 'home/arm', 'armrig.play=0.02', '--source', 'bench test 14');
    assert.match(m, /armrig\.play: measured 0\.02 °?, ?predicted 0\.05|armrig\.play: measured 0\.02/); assert.match(m, /fore\.tip error at its worst point: [\d.]+ mm to [\d.]+ mm/);
    assert.ok(by(check(), 'task.accuracy').values.worst < before, 'less play, less error at the pen');
    // A sheet moved further than the arm goes fails at a named corner, by how much
    write({ ...asm(), task: { ...task, sheet: { size: 'a5', at: [290, 0, 30] } } });
    f = check(); assert.equal(by(f, 'task.reach').level, 'fail'); assert.match(by(f, 'task.reach').text, /the (upper|lower) right corner of the sheet can't be reached: fore\.tip misses it by [\d.]+ mm/);
    assert.ok(by(f, 'task.reach').at, 'it says where');
    // a machine needs steppers on every joint of the chain, and says which is missing
    write(asm()); assert.match(cad('machine', 'home/arm'), /joint shoulder has no stepper driving it/);
    const two = asm(); two.items.push({ id: 'm0', motor: { model: 'nema17', drives: 'shoulder', speed: 300, microsteps: 16 }, at: [0, 0, 0] }); two.fits.push({ a: 'm0', b: 'upper', min: -1000, silent: true }, { a: 'm1', b: 'fore', min: -1000, silent: true });
    two.items[3].motor.driver = undefined; write(two);
    const machine = JSON.parse(cad('machine', 'home/arm', '--json'));
    assert.equal(machine.kinematics, 'scara'); assert.equal(machine.axes.length, 2);
    assert.ok(Math.abs(machine.axes[0].stepsPerUnit - (200 * 16) / 360) < 1e-5); assert.equal(machine.task.speed, 50);
    assert.match(machine.axes[0]._why.microsteps, /resolution only/);
    // a drawing, planned and replayed; one bigger than the sheet refused at the stroke that leaves it
    fs.writeFileSync(path.join(ws, 'square.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="148mm" height="210mm" viewBox="0 0 148 210"><rect id="sq" x="24" y="55" width="100" height="100" fill="none"/><circle id="c" cx="74" cy="105" r="20" fill="none"/></svg>');
    const plotted = spawnSync(process.execPath, [BIN, 'plot', 'home/arm', 'square.svg', '--json'], { cwd: ws, encoding: 'utf8' }), p = JSON.parse(plotted.stdout);
    assert.equal(p.ok, true, plotted.stdout.slice(0, 400)); assert.equal(plotted.status, 0);
    const steps = JSON.parse(fs.readFileSync(p.file, 'utf8'));
    assert.equal(steps.format, 'rulecad.steps/1'); assert.ok(steps.drawn.length >= 2 && steps.drawn[0].error, 'lines carry their predicted error');
    assert.match(fs.readFileSync(path.join(ws, '.preview/home/arm-square-plot.svg'), 'utf8'), /<animate attributeName="points"/);
    const { replay, chainFromMotion } = await import('@rulecad/robots');
    const send = await import(pathToFileURL(fileURLToPath(new URL('../../examples/bench/projects/arm/send.mjs', import.meta.url))).href), lines = send.linesOf(steps), dry = send.dryRun(['e', ...lines, 'd']);
    assert.ok(dry.m > 50 && dry.p > 1, 'the sender takes it'); assert.throws(() => send.linesOf({ format: 'x' }), /not a step file/);
    fs.writeFileSync(path.join(ws, 'big.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="400mm" height="400mm" viewBox="0 0 400 400"><rect id="huge" x="10" y="10" width="380" height="380" fill="none"/></svg>');
    const big = spawnSync(process.execPath, [BIN, 'plot', 'home/arm', 'big.svg'], { cwd: ws, encoding: 'utf8' });
    assert.equal(big.status, 1); assert.match(big.stdout, /stroke huge leaves the 148 × 210 mm sheet/);
  } finally { done(); }
});

test('loads on an upright arm: a tipping moment on its bearing, or printed clips by FE; the links bending; acceleration', async () => {
  const { ws, cad, done } = workspace();
  try {
    fs.mkdirSync(path.join(ws, 'projects/home/objects'), { recursive: true }); fs.mkdirSync(path.join(ws, 'projects/home/assemblies'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'projects/home/project.json'), JSON.stringify({ name: 'home', material: 'PLA', objects: ['link', 'clip'] }));
    fs.writeFileSync(path.join(ws, 'projects/home/objects/link.json'), JSON.stringify({ name: 'link', title: 'Link', version: '0.1.0', engine: 'manifold', anchors: { base: { at: [0, 0, 0], axis: [0, 1, 0] }, tip: { at: ['long', 0, 0], axis: [0, 1, 0] } }, variables: { long: { value: 150, unit: 'mm', rule: 'Long', tweak: { min: 20, max: 400 } }, wide: { value: 12, unit: 'mm', rule: 'Wide', tweak: { min: 2, max: 30 } }, thick: { value: 8, unit: 'mm', rule: 'Thick' } } }));
    fs.writeFileSync(path.join(ws, 'projects/home/objects/link.js'), "import jscad from '@jscad/modeling'\nconst { cuboid } = jscad.primitives\nexport function main (v) { return cuboid({ size: [v.long + 20, v.wide, v.thick], center: [v.long / 2, 0, 0] }) }\n");
    fs.writeFileSync(path.join(ws, 'projects/home/objects/clip.json'), JSON.stringify({ name: 'clip', title: 'Clip', version: '0.1.0', engine: 'manifold', variables: { side: { value: 2, unit: 'mm', rule: 'Side' }, tall: { value: 8, unit: 'mm', rule: 'Tall' } } }));
    fs.writeFileSync(path.join(ws, 'projects/home/objects/clip.js'), "import jscad from '@jscad/modeling'\nconst { cuboid } = jscad.primitives\nexport function main (v) { return cuboid({ size: [v.side, v.side, v.tall], center: [0, 0, v.tall / 2] }) }\n");
    const asm = (support, payload = 0.1, wide = 12) => ({ title: 'Arm', kind: 'fit', gravity: [0, 0.7, -1], items: [{ id: 'base', object: 'clip', at: [0, 0, -200] }, { id: 'upper', object: 'link', set: { wide } }, { id: 'fore', object: 'link', set: { wide } }, { id: 'b1', bought: 'bearing-6800', at: [0, 30, 0], rotate: [90, 0, 0] }, { id: 'c1', object: 'clip', at: [20, 0, -100] }, { id: 'c2', object: 'clip', at: [-20, 0, -100] }, { id: 'c3', object: 'clip', at: [0, 20, -100] }, { id: 'm0', motor: { model: 'nema17', drives: 'shoulder', speed: 200 }, at: [0, 60, 0], rotate: [90, 0, 0] }, { id: 'm1', motor: { model: 'nema17', drives: 'elbow', speed: 200 }, at: [150, 60, 0], rotate: [90, 0, 0] }],
      joints: [{ id: 'shoulder', type: 'revolute', parent: { at: [0, 0, 0], axis: [0, 1, 0] }, child: 'upper.base', min: -130, max: 130, support }, { id: 'elbow', type: 'revolute', parent: 'upper.tip', child: 'fore.base', min: -150, max: 150 }], fits: [{ a: 'upper', b: 'fore', min: -1000, silent: true }, { a: 'm0', b: 'upper', min: -1000, silent: true }, { a: 'm1', b: 'fore', min: -1000, silent: true }, { a: 'b1', b: 'upper', min: -1000, silent: true }, { a: 'm0', b: 'b1', min: -1000, silent: true }],
      task: { tool: 'fore.tip', sheet: { size: [60, 60], at: [200, 0, 80], normal: [0, 1, 0] }, speed: 20, payload } });
    const write = (a) => fs.writeFileSync(path.join(ws, 'projects/home/assemblies/arm.json'), JSON.stringify(a));
    const check = () => { const r = JSON.parse(spawnSync(process.execPath, [BIN, 'check', 'home/arm', '--json'], { cwd: ws, encoding: 'utf8' }).stdout); assert.ok(r.findings, JSON.stringify(r.error)); return r.findings; };
    const by = (list, code, n = 0) => list.filter((x) => x.code === code)[n];
    write(asm({ bearings: ['b1'] }));
    let f = check();
    assert.equal(by(f, 'task.reach').level, 'pass', by(f, 'task.reach').text);
    const m = by(f, 'joint.moment'); assert.match(m.text, /shoulder: \d+ g carried: .* N m tipping/); assert.match(m.text, /b1 take [\d.]+ N equivalent against \d+ N static/); assert.ok(m.values.margin > 1 && m.values.tipping > 0);
    const heavy = by(f, 'joint.moment', 0).values.tipping;
    assert.ok(by(f, 'link.deflection').values.total > 0.01, JSON.stringify(by(f, 'link.deflection')));
    assert.equal(by(f, 'link.deflection').predict.name, 'link.deflection');
    assert.match(by(f, 'assembly.frequency').text, /lowest mode is about \d+ Hz/);
    assert.ok(by(f, 'motor.accel').values.alpha > 0); assert.match(by(f, 'task.time').text, /a move across the task/);
    const stiffer = (write(asm({ bearings: ['b1'] }, 0.1, 24)), check());
    assert.ok(by(stiffer, 'link.deflection').values.total < by(f, 'link.deflection').values.total, 'a wider arm bends less');
    write(asm({ bearings: ['b1'] }, 0.14)); assert.ok(by(check(), 'motor.accel').values.alpha < by(f, 'motor.accel').values.alpha, 'more payload, less acceleration');
    write(asm({ bearings: ['b1'] }, 2)); const stall = by(check(), 'motor.accel'); assert.equal(stall.level, 'fail'); assert.match(stall.text, /shoulder stalls/);
    write(asm({ clips: ['c1', 'c2', 'c3'], pitch: 40, cell: 0.5 }, 0.5));
    const clip = by(check(), 'joint.moment'); assert.match(clip.text, /3 printed clips, the worst \(c\d\) at [\d.]+ MPa/); assert.ok(clip.values.stress > 0);
    assert.equal(clip.level, 'fail', clip.text);
    write(asm(undefined)); assert.equal(by(check(), 'joint.moment').level, 'warn');
  } finally { done(); }
});

test('a gait in an assembly: a crawl checked through its cycle, motors against its torque, and legs that collide found', async () => {
  const { ws, done } = workspace();
  try {
    fs.mkdirSync(path.join(ws, 'projects/home/objects'), { recursive: true }); fs.mkdirSync(path.join(ws, 'projects/home/assemblies'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'projects/home/project.json'), JSON.stringify({ name: 'home', material: 'PLA', objects: ['link', 'body'] }));
    fs.writeFileSync(path.join(ws, 'projects/home/objects/link.json'), JSON.stringify({ name: 'link', title: 'Link', version: '0.1.0', engine: 'manifold', anchors: { base: { at: [0, 0, 0], axis: [0, 1, 0] }, tip: { at: ['long', 0, 0], axis: [0, 1, 0] } }, variables: { long: { value: 90, unit: 'mm', rule: 'Long' }, side: { value: 6, unit: 'mm', rule: 'Side' } } }));
    fs.writeFileSync(path.join(ws, 'projects/home/objects/link.js'), "import jscad from '@jscad/modeling'\nconst { cuboid } = jscad.primitives\nexport function main (v) { return cuboid({ size: [v.long, v.side, v.side], center: [v.long / 2, 0, 0] }) }\n");
    fs.writeFileSync(path.join(ws, 'projects/home/objects/body.json'), JSON.stringify({ name: 'body', title: 'Body', version: '0.1.0', engine: 'manifold', variables: { long: { value: 140, unit: 'mm', rule: 'Long' }, wide: { value: 80, unit: 'mm', rule: 'Wide' }, thick: { value: 10, unit: 'mm', rule: 'Thick' } } }));
    fs.writeFileSync(path.join(ws, 'projects/home/objects/body.js'), "import jscad from '@jscad/modeling'\nconst { cuboid } = jscad.primitives\nexport function main (v) { return cuboid({ size: [v.long, v.wide, v.thick] }) }\n");
    const legs = [['fl', 100, 60], ['fr', 100, -60], ['bl', -100, 60], ['br', -100, -60]], items = [{ id: 'body', object: 'body' }], joints = [], fits = [];
    for (const [n, x, y] of legs) {
      items.push({ id: `${n}u`, object: 'link' }, { id: n, object: 'link' }, { id: `${n}m`, motor: { model: 'nema17', drives: `${n}h`, speed: 100 }, at: [x, y + 60 * Math.sign(y), 40], rotate: [Math.sign(y) * 90, 0, 0] });
      joints.push({ id: `${n}h`, type: 'revolute', parent: { at: [x, y, 0], axis: [0, 1, 0] }, child: `${n}u.base`, min: 0, max: 180, value: 90 }, { id: `${n}k`, type: 'revolute', parent: `${n}u.tip`, child: `${n}.base`, min: -150, max: 0, value: -30 });
      fits.push({ a: `${n}u`, b: n, min: -1000, silent: true }, { a: `${n}m`, b: `${n}u`, min: -1000, silent: true });
    }
    const a = { title: 'Quad', kind: 'fit', items, joints, fits, gait: { legs: legs.map(([n]) => `${n}.tip`), pattern: 'crawl', stride: 30, lift: 12, period: 4, height: 150, mass: 1.5 } };
    const write = (x) => fs.writeFileSync(path.join(ws, 'projects/home/assemblies/quad.json'), JSON.stringify(x));
    const check = () => { const r = JSON.parse(spawnSync(process.execPath, [BIN, 'check', 'home/quad', '--json'], { cwd: ws, encoding: 'utf8' }).stdout); assert.ok(r.findings, JSON.stringify(r.error)); return r.findings; };
    write(a);
    let f = check();
    assert.match(f.find((x) => x.code === 'gait.stable').text, /gait: statically stable: the least margin is/);
    assert.equal(f.find((x) => x.code === 'gait.clearance').level, 'pass');
    assert.equal(f.find((x) => x.code === 'gait.sweep').level, 'pass', f.find((x) => x.code === 'gait.sweep').text);
    assert.ok(f.filter((x) => x.code === 'motor.torque' && /gait: flh needs/.test(x.text)).length === 1);
    assert.ok(f.some((x) => x.code === 'gait.torque' && x.level === 'warn' && /nothing drives flk/.test(x.text)));
    write({ ...a, gait: { ...a.gait, stride: 500 } });
    f = check(); assert.equal(f.find((x) => x.code === 'gait.reach').level, 'fail'); assert.match(f.find((x) => x.code === 'gait.reach').text, /can't reach its foot/);
    write({ ...a, gait: { ...a.gait, legs: ['fl.nowhere'] } });
    const bad = JSON.parse(spawnSync(process.execPath, [BIN, 'check', 'home/quad', '--json'], { cwd: ws, encoding: 'utf8' }).stdout); assert.match(bad.error.message, /gait: no anchor "fl\.nowhere"/);
  } finally { done(); }
});

test('a motor driving a slide: through a lead screw that holds, or a belt that does not, with steps per mm and the belt in the budget', async () => {
  const { ws, cad, done } = workspace();
  try {
    fs.mkdirSync(path.join(ws, 'projects/home/objects'), { recursive: true }); fs.mkdirSync(path.join(ws, 'projects/home/assemblies'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'projects/home/project.json'), JSON.stringify({ name: 'home', material: 'PLA', objects: ['block'] }));
    fs.writeFileSync(path.join(ws, 'projects/home/objects/block.json'), JSON.stringify({ name: 'block', title: 'Block', version: '0.1.0', engine: 'manifold', anchors: { tip: { at: [20, 0, 0], axis: [0, 0, 1] }, base: { at: [0, 0, 0], axis: [0, 0, 1] } }, variables: { side: { value: 10, unit: 'mm', rule: 'Side' } } }));
    fs.writeFileSync(path.join(ws, 'projects/home/objects/block.js'), "import jscad from '@jscad/modeling'\nconst { cuboid } = jscad.primitives\nexport function main (v) { return cuboid({ size: [v.side, v.side, v.side], center: [0, 0, v.side / 2] }) }\n");
    const asm = (motor) => ({ title: 'Z', kind: 'fit', items: [{ id: 'carriage', object: 'block' }, { id: 'm', motor: { model: 'nema17', drives: 'z', speed: 200, ...motor }, at: [0, 0, -60] }],
      joints: [{ id: 'z', type: 'prismatic', parent: { at: [0, 0, 0], axis: [0, 0, 1] }, child: 'carriage.base', min: 0, max: 50 }], fits: [{ a: 'm', b: 'carriage', min: -1000, silent: true }],
      loads: [{ joint: 'z', force: 10 }], task: { tool: 'carriage.tip', volume: { x: [20, 20], y: [0, 0], z: [0, 40] }, speed: 20 } });
    const write = (a) => fs.writeFileSync(path.join(ws, 'projects/home/assemblies/z.json'), JSON.stringify(a));
    const check = () => JSON.parse(spawnSync(process.execPath, [BIN, 'check', 'home/z', '--json'], { cwd: ws, encoding: 'utf8' }).stdout).findings;
    write(asm({ leadscrew: { lead: 2 } }));
    let f = check();
    const holds = f.filter((x) => x.code === 'motor.holds');
    assert.ok(holds.some((x) => x.level === 'pass' && /holds with the power off: the lead screw \(its [\d.]+° lead/.test(x.text)), holds.map((x) => x.text).join(' / '));
    const machine = JSON.parse(cad('machine', 'home/z', '--json')); assert.equal(machine.axes[0].unit, 'mm'); assert.equal(machine.axes[0].stepsPerUnit, (200 * 16) / 2);
    write(asm({ belt: { teeth: 20, stiffness: 20, width: 6, length: 400, load: 5 } }));
    f = check();
    assert.ok(f.some((x) => x.code === 'motor.holds' && /drops with the power off/.test(x.text)), f.filter((x) => x.code === 'motor.holds').map((x) => x.text).join(' / '));
    assert.equal(JSON.parse(cad('machine', 'home/z', '--json')).axes[0].stepsPerUnit, (200 * 16) / 40, 'mm per turn: teeth × pitch');
  } finally { done(); }
});

test('building it: the order worked out and refused when nothing reaches a part; plates by filament, re-packed only where a part changed', async () => {
  const { ws, cad, done } = workspace();
  try {
    const dirs = ['projects/home/objects', 'projects/home/assemblies', 'rules'];
    for (const d of dirs) fs.mkdirSync(path.join(ws, d), { recursive: true });
    fs.writeFileSync(path.join(ws, 'projects/home/project.json'), JSON.stringify({ name: 'home', material: 'PLA', objects: ['block', 'badge', 'cup', 'lid'], filaments: { base: { slot: 1 }, legend: { slot: 2 } } }));
    const object = (name, js, json) => { fs.writeFileSync(path.join(ws, `projects/home/objects/${name}.json`), JSON.stringify({ name, title: name, version: '0.1.0', engine: 'manifold', ...json })); fs.writeFileSync(path.join(ws, `projects/home/objects/${name}.js`), `import jscad from '@jscad/modeling'\nconst { cuboid } = jscad.primitives\nconst { subtract, union } = jscad.booleans\n${js}\n`); };
    const v = (val, rule = 'A size') => ({ value: val, unit: 'mm', rule, tweak: { min: 1, max: 500 } });
    object('block', 'export function main (v) { return cuboid({ size: [v.long, 20, v.tall], center: [v.long / 2, 0, v.tall / 2] }) }', { anchors: { base: { at: [0, 0, 'tall'], axis: [0, 0, 1] }, tip: { at: ['long', 0, 'tall'], axis: [0, 0, 1] }, head: { at: ['long / 2', 0, 'tall'], axis: [0, 0, 1] } }, variables: { long: v(60), tall: v(10) } });
    object('badge', 'export function main (v) { return { body: cuboid({ size: [v.long, 20, 4], center: [v.long / 2, 0, 2] }), legend: cuboid({ size: [10, 8, 1], center: [v.long / 2, 0, 4.5] }) } }', { parts: { body: { label: 'Body' }, legend: { label: 'Legend', filament: 'legend' } }, variables: { long: v(30) } });
    object('cup', 'export function main (v) { return subtract(cuboid({ size: [40, 40, 20], center: [0, 0, 10] }), cuboid({ size: [30, 30, 40], center: [0, 0, 22] })) }', { variables: { deep: v(1) } });
    object('lid', 'export function main (v) { return cuboid({ size: [40, 40, 3], center: [0, 0, 1.5] }) }', { variables: { deep: v(1) } });
    // A cup, a nut in it, and a lid that stops the nut coming out: the lid is written first, and must go on last
    const pile = { title: 'Pile', kind: 'fit', uses: [], items: [{ id: 'cup', object: 'cup' }, { id: 'lid', object: 'lid', at: [0, 0, 22] }, { id: 'nut', object: 'block', set: { long: 12, tall: 6 }, at: [-6, 0, 10.5] }],
      fits: [{ a: 'lid', b: 'cup', fastens: true, min: 0, note: 'The lid, on two screws', fastener: 'M3x10', count: 2 }, { a: 'nut', b: 'cup', fastens: true, min: 0, note: 'The nut, dropped in its pocket' }] };
    const write = (name, a) => fs.writeFileSync(path.join(ws, `projects/home/assemblies/${name}.json`), JSON.stringify(a));
    write('pile', pile);
    const order = JSON.parse(cad('order', 'home/pile', '--json'));
    const pictures = cad('order', 'home/pile', '--preview');
    if (!/no Chrome|Chrome took|Chrome made/.test(pictures)) { assert.match(pictures, /pile-step-03\.png/, pictures); assert.ok(fs.existsSync(path.join(ws, '.preview/home/pile-step-01.png')), 'each step an exploded picture'); }
    assert.deepEqual(order.steps.map((x) => x.items[0]), ['cup', 'nut', 'lid'], JSON.stringify(order.steps));
    assert.match(order.steps[2].text, /The lid, on two screws \(2 × M3x10\)/, 'its fasteners named from the fit');
    assert.deepEqual(order.steps[2].dir, [0, 0, 1], 'and it comes down from above');
    const check = () => JSON.parse(spawnSync(process.execPath, [BIN, 'check', 'home/pile', '--json'], { cwd: ws, encoding: 'utf8' }).stdout).findings;
    assert.equal(check().find((x) => x.code === 'assembly.order').level, 'pass', 'found by cad check');
    // A wall over the screw, fastened on before the screw can go in: no order reaches it. The screw's anchor points up.
    write('walled', { title: 'Walled', kind: 'fit', uses: [], items: [{ id: 'base', object: 'block', set: { long: 60, tall: 10 } }, { id: 'clip', object: 'block', set: { long: 20, tall: 10 }, at: [10, 0, 10] }, { id: 'stud', object: 'block', set: { long: 20, tall: 10 }, at: [10, 0, 20] }, { id: 'wall', object: 'block', set: { long: 60, tall: 10 }, at: [0, 0, 30] }],
      fits: [{ a: 'wall', b: 'base', fastens: true, min: 0, note: 'The wall' }, { a: 'stud', b: 'wall', fastens: true, min: 0, note: 'The stud' }, { a: 'clip', b: 'stud', fastens: true, min: 0, note: 'The clip, to the stud', access: 'clip.head' }] });
    const stuck = JSON.parse(spawnSync(process.execPath, [BIN, 'check', 'home/walled', '--json'], { cwd: ws, encoding: 'utf8' }).stdout).findings.find((x) => x.code === 'assembly.order');
    assert.equal(stuck.level, 'fail'); assert.match(stuck.text, /screw of "The clip, to the stud" can't be reached in any order: wall stands over it/); assert.equal(stuck.refs.wall, 'wall');
    // A part in a sealed box: nothing can reach it, and the finding names it
    object('shell', 'export function main (v) { return subtract(cuboid({ size: [40, 40, 40], center: [0, 0, 20] }), cuboid({ size: [30, 30, 30], center: [0, 0, 20] })) }', { variables: { deep: v(1) } });
    write('sealed', { title: 'Sealed', kind: 'fit', uses: [], items: [{ id: 'shell', object: 'shell' }, { id: 'loose', object: 'block', set: { long: 10, tall: 5 }, at: [-5, 0, 10] }], fits: [{ a: 'loose', b: 'shell', fastens: true, min: 0 }] });
    const sealed = JSON.parse(cad('order', 'home/sealed', '--json'));
    assert.match(sealed.stuck.text, /shell can't be reached in any order|loose can't be reached in any order/, JSON.stringify(sealed));
    // A bearing pressed in before the shaft goes through it, whichever order they're written in; the shaft is listed first
    write('spindle', { title: 'Spindle', kind: 'fit', uses: [], items: [{ id: 'pin', object: 'block', set: { long: 5, tall: 40 }, at: [-2.5, 0, 45] }, { id: 'brg', bought: 'bearing-608', at: [0, 0, 30] }, { id: 'housing', object: 'block', set: { long: 60, tall: 10 }, at: [-30, 0, 0] }],
      fits: [{ a: 'brg', b: 'housing', seat: 'press' }, { a: 'pin', b: 'brg', engage: 5, min: -1000 }] });
    const spindle = JSON.parse(cad('order', 'home/spindle', '--json')).steps.flatMap((x) => x.items);
    assert.ok(spindle.indexOf('brg') < spindle.indexOf('pin'), `the bearing before its shaft: ${spindle}`);
    assert.ok(spindle.indexOf('housing') < spindle.indexOf('brg'), 'and the bearing into its housing');
    // Plates: one for the base filament, the two-coloured badge on its own, the gap the first layer's rule, on the bed
    write('kit', { title: 'Kit', kind: 'fit', uses: [], items: [{ id: 'a', object: 'block', set: { long: 100 }, at: [0, 0, 0] }, { id: 'b', object: 'block', set: { long: 100 }, at: [0, 50, 0] }, { id: 'c', object: 'block', set: { long: 200 }, at: [0, 100, 0] }, { id: 'e', object: 'badge', at: [0, 150, 0] }, { id: 'motor', motor: { model: 'nema17' }, at: [300, 0, 0] }] });
    const first = JSON.parse(cad('plates', 'home/kit', '--json'));
    assert.deepEqual(first.plates.map((x) => [x.name, x.filament, x.parts.length]), [['kit-base-1', 'base', 3], ['kit-base-legend-1', 'base+legend', 1]], JSON.stringify(first.plates));
    assert.equal(first.gap, 0.84, "the first layer's rule: 0.3 + 2 × 0.15 up to whole lines");
    assert.deepEqual(first.checks.flatMap((x) => x.findings.filter((y) => y.level === 'fail').map((y) => y.text)), [], 'the plates print clean');
    assert.ok(first.plates[0].parts.every((p) => p.x > 0 && p.x + p.w < 256 && p.y > 0 && p.y + p.d < 256), 'all on the bed');
    const sheet = JSON.parse(fs.readFileSync(path.join(ws, 'projects/home/assemblies/kit-base-1.json'), 'utf8'));
    assert.equal(sheet.kind, 'plate'); assert.ok(sheet.packed.parts.a, 'it remembers what is on it');
    assert.match(cad('export', 'home/kit-base-1'), /kit-base-1\.3mf/, 'exports as a print');
    assert.ok(fs.existsSync(path.join(ws, 'exports/home/kit-base-1.3mf')));
    // A changed part re-packs only its plate: the other file is left exactly as it was
    const stood = fs.readFileSync(path.join(ws, 'projects/home/assemblies/kit-base-legend-1.json'), 'utf8'), asm = JSON.parse(fs.readFileSync(path.join(ws, 'projects/home/assemblies/kit.json'), 'utf8'));
    asm.items[2].set = { long: 180 }; write('kit', asm);
    const again = JSON.parse(cad('plates', 'home/kit', '--json'));
    assert.deepEqual(again.repacked, ['kit-base-1'], 'only the plate with the changed part'); assert.equal(fs.readFileSync(path.join(ws, 'projects/home/assemblies/kit-base-legend-1.json'), 'utf8'), stood);
    assert.equal(again.plates.find((x) => x.name === 'kit-base-1').parts.find((p) => p.id === 'c').w, 180, 'with its new size');
    assert.equal(again.plates.find((x) => x.name === 'kit-base-legend-1').stood, true);
    // Too big for the bed, by name
    asm.items[2].set = { long: 400 }; write('kit', asm);
    const big = spawnSync(process.execPath, [BIN, 'plates', 'home/kit', '--json'], { cwd: ws, encoding: 'utf8' });
    assert.equal(big.status, 1); assert.match(big.stdout, /c \(block\) is 400 × 20 mm: bigger than the 256 mm bed/);
    assert.equal(JSON.parse(big.stdout).findings[0].code, 'plate.bed');
  } finally { done(); }
});

test('a machine\'s link: the task, the step file, the wires and the build page travel with the model, small and data only; the ledger in the rules', async () => {
  const { ws, cad, done } = workspace();
  try {
    for (const d of ['projects/home/objects', 'projects/home/assemblies', 'rules']) fs.mkdirSync(path.join(ws, d), { recursive: true });
    fs.writeFileSync(path.join(ws, 'projects/home/project.json'), JSON.stringify({ name: 'home', material: 'PLA', objects: ['link'] }));
    fs.writeFileSync(path.join(ws, 'rules/armrig.json'), JSON.stringify({ name: 'armrig', rules: { play: { value: 0.05, unit: '°', rule: 'Shoulder play', kind: 'estimate', source: 'a guess', checked: '2026-11-09' } } }));
    fs.writeFileSync(path.join(ws, 'projects/home/objects/link.json'), JSON.stringify({ name: 'link', title: 'Link', version: '0.1.0', engine: 'manifold', anchors: { base: { at: [0, 0, 0], axis: [0, 0, 1] }, tip: { at: ['long', 0, 0], axis: [0, 0, 1] }, connector: { at: [10, 0, 'thick'], axis: [0, 0, 1] } }, variables: { long: { value: 150, unit: 'mm', rule: 'Long', tweak: { min: 20, max: 400 } }, thick: { value: 5, unit: 'mm', rule: 'Thick' } } }));
    fs.writeFileSync(path.join(ws, 'projects/home/objects/link.js'), "import jscad from '@jscad/modeling'\nconst { cuboid } = jscad.primitives\nexport function main (v) { return cuboid({ size: [v.long, v.thick, v.thick], center: [v.long / 2, 0, v.thick / 2] }) }\n");
    const task = { tool: 'fore.tip', sheet: { size: 'a5', at: [180, 0, 30] }, speed: 50, accuracy: 0.6 };
    const asm = { title: 'Arm', kind: 'fit', uses: ['armrig'], items: [{ id: 'upper', object: 'link', set: { long: 150 } }, { id: 'fore', object: 'link', set: { long: 150 } }, { id: 'm0', motor: { model: 'nema17', drives: 'shoulder', speed: 300, microsteps: 16 }, at: [0, 0, -50] }, { id: 'm1', motor: { model: 'nema17', drives: 'elbow', speed: 300, microsteps: 16 }, at: [150, 0, -50] }],
      joints: [{ id: 'shoulder', type: 'revolute', parent: { at: [0, 0, 30] }, child: 'upper.base', min: -130, max: 130 }, { id: 'elbow', type: 'revolute', parent: 'upper.tip', child: 'fore.base', min: -150, max: 150, errors: { play: 'armrig.play' } }],
      fits: [{ a: 'upper', b: 'fore', min: -1000, silent: true }, { a: 'm0', b: 'upper', min: -1000, silent: true }, { a: 'm1', b: 'fore', min: -1000, silent: true }], loads: [{ joint: 'elbow', torque: 0.05 }],
      wires: [{ id: 'elbow-motor', from: 'upper.connector', to: 'fore.connector', gauge: 'awg22' }], task };
    fs.writeFileSync(path.join(ws, 'projects/home/assemblies/arm.json'), JSON.stringify(asm));
    assert.match(cad('wires', 'home/arm'), /elbow-motor/);
    const sheetFile = path.join(ws, 'exports/home/arm.wiring.md');
    assert.match(fs.readFileSync(sheetFile, 'utf8'), /\| elbow-motor \| upper\.connector \| fore\.connector \|/, 'the wiring sheet in the exports');
    fs.writeFileSync(path.join(ws, 'square.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="148mm" height="210mm" viewBox="0 0 148 210"><rect id="sq" x="24" y="55" width="100" height="100" fill="none"/></svg>');
    assert.equal(spawnSync(process.execPath, [BIN, 'plot', 'home/arm', 'square.svg'], { cwd: ws, encoding: 'utf8' }).status, 0);
    cad('measured', 'home/arm', 'task.accuracy=0.4', '--source', 'bench');
    const out = cad('link', 'home/arm', '--long');
    assert.match(out, /carries the drawing arm-square/);
    const url = out.match(/view\s+(\S+)/)[1], token = url.split('#m=')[1], { decode } = await import('@rulecad/model-link');
    const m = await decode(token);
    assert.equal(m.task.tool, 'fore.tip'); assert.equal(m.task.plane.width, 148); assert.ok(m.task.torque.length && m.task.elbow, JSON.stringify(m.task).slice(0, 300));
    assert.ok(m.steps.b.length && m.steps.drawn[0][2].length, 'the drawing with its predicted errors'); assert.equal(m.wires[0][0], 'elbow-motor');
    assert.ok(m.build.list.bought.length && m.build.plates.plates.length && m.build.wires[0].length && m.build.machine.axes.length === 2, 'the whole project');
    const ledger = m.sheet.filter((r) => r[0] === 'Predicted against measured'); assert.ok(ledger.find((r) => r[1] === 'task.accuracy' && r[2] === '0.4' && /predicted/.test(r[4])), JSON.stringify(ledger));
    assert.ok(token.length < 200000, `the machine's data is small (${token.length} chars)`);
    // The wire is drawn, faint, with the model, and goes in no check: it is not one of the parts
    assert.ok(!m.parts.some((p) => /wire/.test(p[0])), 'never a part');
    // A step file for another machine's joints is refused by name
    const steps = path.join(ws, 'exports/home/arm-square.steps.json'), data = JSON.parse(fs.readFileSync(steps, 'utf8'));
    data.axes[0].name = 'other'; fs.writeFileSync(path.join(ws, 'wrong.steps.json'), JSON.stringify(data));
    assert.match(cad('link', 'home/arm', '--steps', 'wrong.steps.json'), /for joints other, elbow, and this machine's are shoulder, elbow: plot it again/);
    assert.match(cad('preview', 'home/arm').trim(), /arm\.png$/, 'a preview takes the wires too');
    const { check } = await import('@rulecad/model-link');
    assert.equal(check({ q: 1, p: [], t: [], task: { tool: 1 } })[0].text, 'broken task', 'a link with bad task data is turned away');
    assert.equal(check({ q: 1, p: [], t: [], steps: { names: ['a'], spu: [1], start: [0], b: [[0, 1, 0, 'x']], drawn: [] } })[0].text, 'broken step file');
  } finally { done(); }
});

test('tool.grip: a servo closing compliant fingers on a payload, with the leaves\' strain and a stiff leaf refused', async () => {
  const { gripChecks } = await import('./lib/grip.mjs');
  const servo = { id: 's', model: { type: 'servo', figures: { stall_torque: { value: 0.1765 } } } }, run = (grip, payload = 0.05) => { const out = []; gripChecks({ a: { task: { grip } }, motion: { drives: [servo] }, task: { payload, accel: 500 }, num: (x) => x, project: 'x' }, (level, text, card, extra) => out.push({ level, text, ...extra })); return out; };
  const good = run({ servo: 's', horn: 12, leaf: { length: 30, thickness: 1, width: 8 }, travel: 5, friction: 0.4 });
  const g = good.find((x) => x.code === 'tool.grip'); assert.equal(g.level, 'pass', g.text); assert.ok(g.values.margin >= 2);
  assert.equal(run({ servo: 's', horn: 12, leaf: { length: 30, thickness: 1, width: 8 }, travel: 5, friction: 0.4 }, 2).find((x) => x.code === 'tool.grip').level, 'fail');
  const stiff = run({ servo: 's', horn: 12, leaf: { length: 10, thickness: 3, width: 8 }, travel: 5, friction: 0.4 }); assert.match(stiff.find((x) => x.code === 'tool.grip').text, /can't close them/); assert.equal(stiff.find((x) => x.code === 'tool.strain').level, 'fail');
  assert.throws(() => run({ servo: 'none', horn: 12, leaf: {}, travel: 5 }), /task\.grip: servo "none" isn't a motor item/);
});

test('a gait of one leg: its foot out of the hip anchor\'s plane, a joint behind a gearbox moved by the motor it follows, and played', async () => {
  const { ws, cad, done } = workspace();
  const asm = { title: 'Leg', kind: 'fit', items: [{ id: 'shaft', object: 'link' }, { id: 'thigh', object: 'link' }, { id: 'shin', object: 'shin' }],
    joints: [{ id: 'd', type: 'revolute', parent: { at: [0, -60, 0], axis: [0, 1, 0] }, child: 'shaft.base', min: -10, max: 10 },
      { id: 'h', type: 'revolute', parent: { at: [0, 0, 0], axis: [0, 1, 0] }, child: 'thigh.base', follow: 'd', ratio: 0.5, offset: 90, min: 40, max: 140 },
      { id: 'k', type: 'revolute', parent: 'thigh.tip', child: 'shin.base', min: -150, max: 0, value: -30 }],
    fits: [{ a: 'thigh', b: 'shin', min: -1000 }, { a: 'shaft', b: 'thigh', min: -1000 }], gait: { legs: ['shin.tip'], pattern: { duty: 0.6, phase: [0] }, stride: 20, lift: 10, period: 2, height: 120, mass: 0.75, clearance: 8 } };
  const write = (f, x) => { fs.mkdirSync(path.dirname(path.join(ws, f)), { recursive: true }); fs.writeFileSync(path.join(ws, f), typeof x === 'string' ? x : JSON.stringify(x)); };
  try {
    write('projects/home/project.json', { name: 'home', material: 'PLA', objects: ['link', 'shin'] });
    const LINK = "import jscad from '@jscad/modeling'\nconst { cuboid } = jscad.primitives\nexport function main (v) { return cuboid({ size: [v.long, 6, 6], center: [v.long / 2, 0, 0] }) }\n";
    write('projects/home/objects/link.json', { name: 'link', title: 'Link', version: '0.1.0', engine: 'manifold', anchors: { base: { at: [0, 0, 0], axis: [0, 1, 0] }, tip: { at: ['long', 0, 0], axis: [0, 1, 0] } }, variables: { long: { value: 80, unit: 'mm', rule: 'Long' } } });
    write('projects/home/objects/link.js', LINK);
    // The shin's foot is 8 mm out of the plane of the hip's anchor, as a real leg's is, its gearbox beside its links
    write('projects/home/objects/shin.json', { name: 'shin', title: 'Shin', version: '0.1.0', engine: 'manifold', anchors: { base: { at: [0, 0, 0], axis: [0, 1, 0] }, tip: { at: ['long', 8, 0], axis: [0, 1, 0] } }, variables: { long: { value: 80, unit: 'mm', rule: 'Long' } } });
    write('projects/home/objects/shin.js', LINK);
    write('projects/home/assemblies/leg.json', asm);
    const r = JSON.parse(spawnSync(process.execPath, [BIN, 'check', 'home/leg', '--json'], { cwd: ws, encoding: 'utf8' }).stdout), f = r.findings;
    assert.ok(f, JSON.stringify(r.error));
    assert.ok(!f.some((x) => x.code === 'gait.reach'), JSON.stringify(f.filter((x) => x.code?.startsWith('gait')))); // reached: the foot stays in its own plane
    assert.equal(f.find((x) => x.code === 'gait.clearance').level, 'pass');
    assert.match(f.find((x) => x.code === 'gait.stable').text, /one leg, on a stand/);
    assert.equal(f.find((x) => x.code === 'gait.sweep').level, 'pass');
    assert.match(cad('animate', 'home/leg'), /leg-gait\.svg/);
    assert.ok(fs.readFileSync(path.join(ws, '.preview/home/leg-gait.svg'), 'utf8').includes('<animate'));
    // In the link: the joints that lead, the motor's shaft in place of what follows it, at the motor's values
    const out = cad('link', 'home/leg', '--long'), token = out.match(/view\s+(\S+)/)[1].split('#m=')[1], { decode } = await import('@rulecad/model-link');
    const m = await decode(token), seq = m.motion.sequence;
    assert.deepEqual(seq.names, ['d', 'k']);
    const hip = (seq.q[0][0] * 0.5) + 90;
    assert.ok(Math.abs(seq.q[0][1]) > 1 && hip > 40 && hip < 140, `${seq.q[0]}`);
    assert.equal(seq.period, 2);
    const { check } = await import('@rulecad/model-link');
    assert.equal(check({ q: 1, p: [], t: [], motion: { items: [['a']], joints: [], part: [], sequence: { period: 2, names: ['nope'], q: [[0]] } } })[0].text, 'broken motion', 'a sequence is data, checked');
  } finally { done(); }
});

test('a rod and a linear bushing are bought items, cut to the length set on the item', () => {
  const { ws, cad, done } = workspace();
  try {
    fs.mkdirSync(path.join(ws, 'projects/home/assemblies'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'projects/home/assemblies/rod.json'), JSON.stringify({ title: 'Rod', kind: 'fit', items: [{ id: 'rod', bought: 'rod-8', set: { length: 123 } }, { id: 'bush', bought: 'lm8uu', at: [0, 0, 10] }], fits: [{ a: 'rod', b: 'bush', fastens: true, min: -1000 }] }));
    const out = cad('list', 'home/rod');
    assert.match(out, /rod-8/); assert.match(out, /lm8uu/);
    assert.match(cad('check', 'home/rod'), /123 mm|rod-8/);
  } finally { done(); }
});

test('tool.grip reads the finger\'s own material when it names one; a link bends as everything bolted to its joint, and a gearbox output joins the chain through its motor', async () => {
  const { gripChecks } = await import('./lib/grip.mjs');
  const servo = { id: 's', model: { type: 'servo', figures: { stall_torque: { value: 0.1765 } } } }, spec = { servo: 's', horn: 12, leaf: { length: 40, thickness: 1, width: 12 }, travel: 3, friction: 0.4 };
  const run = (grip) => { const out = []; gripChecks({ a: { task: { grip } }, motion: { drives: [servo] }, task: { payload: 0.05, accel: 300 }, num: (x) => x, project: 'x' }, (level, text, card, extra) => out.push({ level, text, ...extra })); return out; };
  assert.match(run({ ...spec, material: 'petg' }).find((x) => x.code === 'tool.strain').text, /in a PETG leaf/);
  assert.doesNotMatch(run(spec).find((x) => x.code === 'tool.strain').text, /PETG/, 'the project\'s material when it names none');
  const { ws, done } = workspace();
  const write = (f, x) => { fs.mkdirSync(path.join(ws, path.dirname(f)), { recursive: true }); fs.writeFileSync(path.join(ws, f), typeof x === 'string' ? x : JSON.stringify(x)); };
  const obj = (name, size, anchors) => { write(`projects/home/objects/${name}.json`, { name, version: '0.1.0', engine: 'manifold', anchors, variables: { x: { value: size[0], unit: 'mm', rule: 'Long' }, y: { value: size[1], unit: 'mm', rule: 'Wide' }, z: { value: size[2], unit: 'mm', rule: 'Thick' } } }); write(`projects/home/objects/${name}.js`, "import jscad from '@jscad/modeling'\nconst { cuboid } = jscad.primitives\nexport function main (v) { return cuboid({ size: [v.x, v.y, v.z], center: [v.x / 2, 0, v.z / 2] }) }\n"); };
  try {
    write('projects/home/project.json', { name: 'home', material: 'PLA', objects: ['hub', 'bar'] });
    obj('hub', [8, 10, 6], { base: { at: [0, 0, 3], axis: [0, 0, 1], ref: [1, 0, 0] }, out: { at: [8, 0, 3], axis: [1, 0, 0], ref: [0, 1, 0] } });
    obj('bar', [100, 10, 6], { in: { at: [0, 0, 3], axis: [1, 0, 0], ref: [0, 1, 0] }, tip: { at: [100, 0, 3], axis: [0, 0, 1], ref: [1, 0, 0] } });
    const a30 = Math.PI / 6, r = 108;
    write('projects/home/assemblies/lift.json', { title: 'A link', kind: 'fit', gravity: [0, 0, -1], items: [{ id: 'hub', object: 'hub' }, { id: 'bar', object: 'bar' }, { id: 'turn', object: 'hub' }],
      joints: [{ id: 'drive', type: 'revolute', parent: { at: [-200, 0, 0], axis: [0, 0, 1] }, child: 'turn.base', min: -360, max: 360 }, { id: 'j', type: 'revolute', parent: { at: [0, 0, 0], axis: [0, 0, 1] }, child: 'hub.base', follow: 'drive', ratio: 0.5, min: -90, max: 90 }, { id: 'bolted', type: 'fixed', parent: 'hub.out', child: 'bar.in' }],
      task: { tool: 'bar.tip', volume: { x: [r * Math.cos(a30), r * Math.cos(a30)], y: [r * Math.sin(a30), r * Math.sin(a30)], z: [0, 0] }, payload: 0.1, accel: 100 } });
    const res = spawnSync(process.execPath, [BIN, 'check', 'home/lift', '--json'], { cwd: ws, encoding: 'utf8' }), json = JSON.parse(res.stdout);
    const link = json.findings.find((x) => x.code === 'link.deflection');
    assert.ok(link, json.findings.map((x) => x.code).join(', '));
    assert.ok(link.values.total > 0.05 && link.values.total < 5, `the bar, bolted to the joint's hub, bends as a cantilever (${link.values.total} mm)`);
    assert.equal(link.values.rows[0].link, 'hub');
  } finally { done(); }
});

test('a link for a machine working in a volume: flat along any axis, or a single point', async () => {
  const { ws, cad, done } = workspace();
  try {
    fs.mkdirSync(path.join(ws, 'projects/home/objects'), { recursive: true }); fs.mkdirSync(path.join(ws, 'projects/home/assemblies'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'projects/home/project.json'), JSON.stringify({ name: 'home', material: 'PLA', objects: ['link'] }));
    fs.writeFileSync(path.join(ws, 'projects/home/objects/link.json'), JSON.stringify({ name: 'link', title: 'Link', version: '0.1.0', engine: 'manifold', anchors: { base: { at: [0, 0, 0], axis: [0, 1, 0] }, tip: { at: [100, 0, 0], axis: [0, 1, 0] } }, variables: { side: { value: 6, unit: 'mm', rule: 'Side' } } }));
    fs.writeFileSync(path.join(ws, 'projects/home/objects/link.js'), "import jscad from '@jscad/modeling'\nconst { cuboid } = jscad.primitives\nexport function main (v) { return cuboid({ size: [100, v.side, v.side], center: [50, 0, 0] }) }\n");
    const asm = (volume) => JSON.stringify({ title: 'A', kind: 'fit', items: [{ id: 'arm', object: 'link' }], joints: [{ id: 'j', type: 'revolute', parent: { at: [0, 0, 0], axis: [0, 1, 0] }, child: 'arm.base', min: -90, max: 90 }], task: { tool: 'arm.tip', volume } });
    for (const volume of [{ x: [60, 90], y: [0, 0], z: [-40, 40] }, { x: [100, 100], y: [0, 0], z: [0, 0] }]) {
      fs.writeFileSync(path.join(ws, 'projects/home/assemblies/a.json'), asm(volume));
      assert.doesNotMatch(cad('link', 'home/a', '--md', '--long'), /broken task/);
    }
  } finally { done(); }
});
