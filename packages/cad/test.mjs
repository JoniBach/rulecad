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
  const cad = (...a) => { try { return execFileSync(process.execPath, [BIN, ...a], { cwd: ws, encoding: 'utf8', stdio: 'pipe' }); } catch (e) { return `${e.stdout}${e.stderr}`; } };
  return { ws, cad, done: () => fs.rmSync(ws, { recursive: true, force: true }) };
}

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

test('cad agents: AGENTS.md for AI agents, included from CLAUDE.md without losing what was there', () => {
  const { ws, cad, done } = workspace();
  try {
    fs.writeFileSync(path.join(ws, 'CLAUDE.md'), 'Our own notes.\n');
    assert.match(cad('agents'), /wrote AGENTS\.md/);
    assert.match(fs.readFileSync(path.join(ws, 'AGENTS.md'), 'utf8'), /Rules first/);
    assert.equal(fs.readFileSync(path.join(ws, 'CLAUDE.md'), 'utf8'), 'Our own notes.\n\n@AGENTS.md\n');
    cad('agents');
    assert.equal(fs.readFileSync(path.join(ws, 'CLAUDE.md'), 'utf8'), 'Our own notes.\n\n@AGENTS.md\n', 'only once');
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
    assert.match(cad('set', 'bathroom/soap-tray', `${name}=7`), new RegExp(`set ${name}`));
    assert.equal(JSON.parse(fs.readFileSync(f, 'utf8')).variables[name].value, 7);
    assert.match(cad('set', 'bathroom/soap-tray', `${name}=x1c.nope`), /not changed: .*no rule "nope"/);
    assert.equal(JSON.parse(fs.readFileSync(f, 'utf8')).variables[name].value, 7, 'a bad edit leaves the file as it was');
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
    assert.match(tryIt('trusted', "import fs from 'node:fs'"), /fits the bed/, 'a workspace can trust its own designs');
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
    assert.match(cad('check', 'demo/flick:fused'), /✗ the ground and tip are 0\.1 mm apart at rest: under the 0\.3 mm gap, they print as one/);
    const out = cad('animate', 'demo/flick').trim();
    assert.ok(out.endsWith('flick-sequence.svg') && /<svg[\s\S]*<animate attributeName="display"[\s\S]*rest to bent/.test(fs.readFileSync(out, 'utf8')));
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
