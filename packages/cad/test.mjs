import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
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
