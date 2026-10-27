import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
