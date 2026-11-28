// cad's tests of building it: the build order, plates, kits, parts in hand and printing in place. The shared helpers are in ./helpers.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { workspace } from './helpers.mjs';

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
    const check = () => cad.json('check', 'home/pile', '--json').findings;
    assert.equal(check().find((x) => x.code === 'assembly.order').level, 'pass', 'found by cad check');
    // A wall over the screw, fastened on before the screw can go in: no order reaches it. The screw's anchor points up.
    write('walled', { title: 'Walled', kind: 'fit', uses: [], items: [{ id: 'base', object: 'block', set: { long: 60, tall: 10 } }, { id: 'clip', object: 'block', set: { long: 20, tall: 10 }, at: [10, 0, 10] }, { id: 'stud', object: 'block', set: { long: 20, tall: 10 }, at: [10, 0, 20] }, { id: 'wall', object: 'block', set: { long: 60, tall: 10 }, at: [0, 0, 30] }],
      fits: [{ a: 'wall', b: 'base', fastens: true, min: 0, note: 'The wall' }, { a: 'stud', b: 'wall', fastens: true, min: 0, note: 'The stud' }, { a: 'clip', b: 'stud', fastens: true, min: 0, note: 'The clip, to the stud', access: 'clip.head' }] });
    const stuck = cad.findings('check', 'home/walled', '--json').find((x) => x.code === 'assembly.order');
    assert.equal(stuck.level, 'fail'); assert.match(stuck.text, /screw of "The clip, to the stud" can't be reached in any order: wall stands over it/); assert.equal(stuck.refs.wall, 'wall');
    // A part in a sealed box: nothing can reach it, and the finding names it
    object('shell', 'export function main (v) { return subtract(cuboid({ size: [40, 40, 40], center: [0, 0, 20] }), cuboid({ size: [30, 30, 30], center: [0, 0, 20] })) }', { variables: { deep: v(1) } });
    write('sealed', { title: 'Sealed', kind: 'fit', uses: [], items: [{ id: 'shell', object: 'shell' }, { id: 'loose', object: 'block', set: { long: 10, tall: 5 }, at: [-5, 0, 10] }], fits: [{ a: 'loose', b: 'shell', fastens: true, min: 0 }] });
    const sealed = JSON.parse(cad.refused('"stuck"', 'order', 'home/sealed', '--json'));
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
    const big = cad.run('plates', 'home/kit', '--json');
    assert.equal(big.status, 1); assert.match(big.stdout, /c \(block\) is 400 × 20 mm: bigger than the 256 mm bed/);
    assert.equal(JSON.parse(big.stdout).findings[0].code, 'plate.bed');
  } finally { done(); }
});

test('cad plates and cad kit: plates by material, a frame\'s jigs and its feet\'s pads beside its fittings, and one folder to build a generated box from without the model', () => {
  const { ws, cad, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/frame', f), file = (n) => at(`assemblies/${n}.json`);
    fs.mkdirSync(at('assemblies'), { recursive: true });
    fs.writeFileSync(at('project.json'), JSON.stringify({ name: 'frame', material: 'PLA', objects: [] }));
    const write = (n, x) => fs.writeFileSync(file(n), JSON.stringify({ title: n, kind: 'fit', ...x }));
    // 1. One plate is one plastic: a printed beam in PETG in a PLA project goes on a plate of its own, named for it
    write('mix', { items: [{ id: 'p1', beam: { profile: '2020-printed', length: 120, printed: true, material: 'petg' }, from: [0, 0, 0], to: [120, 0, 0] }, { id: 'br', fitting: { kind: 'bracket', profile: '2020-misumi-hfs5' }, at: [0, 80, 0] }] });
    const mix = cad('plates', 'frame/mix');
    assert.match(mix, /mix-base-1: pla, base, 1 part, [\d.]+ g, about \d+ min: br\n/, mix);
    assert.match(mix, /mix-petg-base-1: petg, base, 1 part, [\d.]+ g, about \d+ min: p1\n/, mix);
    assert.deepEqual(JSON.parse(fs.readFileSync(file('mix-petg-base-1'), 'utf8')).packed.material, 'petg');
    // 2. A generated box 200 x 200 x 200 in 2020 joined blind on printed levelling feet. Hand: each foot's M5 cap screw
    // seats on the body's 5 mm floor and needs 2 diameters, 10 mm, of thread in aluminium, so M5x16 (5 + 11) is the
    // shortest sold and M5x12 (5 + 7) too short; the tap is 18.5 mm, so the bottom ring rises 18.5 mm and the uprights
    // are 200 + 2 x 20 + 18.5 = 258.5 mm. The plates hold the bodies, the caps and the four pads the bodies screw onto
    // (printed, not placed); the jigs go on plates of their own
    write('box', { frame: { kind: 'box', inside: [200, 200, 200], profile: '2020-misumi-hfs5', join: 'blind', feet: 'levelling' } });
    const plates = cad('plates', 'frame/box');
    assert.match(plates, /box-base-1: pla, base, 12 parts, [\d.]+ g, about \d+ min: (?=.*foot-z1-pad)(?=.*cap-z4-b)(?=.*foot-z4)/, plates);
    assert.match(plates, /frame\/box: \d+ jigs for its beams, [\d.]+ g, on 1 plate of their own \(cad beams frame\/box --jigs says what each is for\)\n\s+exports[\\/]frame[\\/]box\.jigs\.3mf: pla, \d+ parts/, plates);
    assert.match(cad('list', 'frame/box'), /foot-z1-pad \(comes with foot-z1: printed beside it, screwed into it by hand\)/);
    assert.doesNotMatch(cad('plates', 'frame/box', '--no-jigs'), /jigs/);
    // 3. The kit: one folder, written only for a design that checks clean. Laying out its plates reads the printer's
    // rule set: in a workspace without its own copy, the kit copies x1c into rules/ and says so (once)
    fs.rmSync(path.join(ws, 'rules/x1c.json'), { force: true });
    const k = JSON.parse(cad('kit', 'frame/box', '--json')), dir = path.join(ws, k.dir);
    assert.deepEqual(k.copied, ['rules/x1c.json']); assert.ok(fs.existsSync(path.join(ws, 'rules/x1c.json')));
    assert.match(cad('kit', 'frame/box'), /frame\/box: the kit to build it from/); assert.doesNotMatch(cad('kit', 'frame/box'), /and copied rules/);
    assert.equal(k.dir.split(path.sep).join('/'), 'exports/frame/box-kit');
    assert.deepEqual(k.files, ['README.md', 'buy.csv', 'print/box-base-1.3mf', 'print/box.jigs.3mf', 'sheets/beam-A.svg', 'sheets/beam-B.svg', 'sheets/beam-C.svg', 'sheets/beam-D.svg', 'sheets/beam-E.svg']);
    for (const f of k.files.filter((x) => x.endsWith('.3mf'))) assert.equal(fs.readFileSync(path.join(dir, f)).subarray(0, 2).toString(), 'PK', `${f} is a 3MF (a zip)`);
    assert.match(fs.readFileSync(path.join(dir, 'sheets/beam-A.svg'), 'utf8'), /^<svg[^>]*width="[\d.]+mm"/, 'a sheet to scale');
    const readme = fs.readFileSync(path.join(dir, 'README.md'), 'utf8'), buy = fs.readFileSync(path.join(dir, 'buy.csv'), 'utf8');
    for (const h of ['# box: the kit', '## In this folder', '## What the checks say', '## What to buy', '### Bars', '### Screws, nuts and inserts', '## What to print', '### Jigs', '## Cut', '## Drill and tap', '## Build', '### Tightening, by kind of join', '### Diagonals']) assert.ok(readme.includes(`\n${h}\n`) || readme.startsWith(`${h}\n`), h);
    // it counts what cad check counts, the files' schema check included
    const passing = JSON.parse(cad('check', 'frame/box', '--json')).findings.filter((f) => f.level === 'pass').length;
    assert.match(readme, new RegExp(`\`cad check frame/box\`: ${passing} checks pass, none fail, none warn\\.`));
    // where each upright stands, without the pictures: a plan of the corners. Hand: the box is 200 + 2 x 20 = 240 mm
    // outside, so the uprights' centre lines stand 10 mm in from each side, at x and y of 10 and 230
    assert.match(readme, /## Where the uprights stand\n\nSeen from above, x to the right and y away from you: the front is the side nearest you \(least y\), the left the side of least x\. Each upright stands with its end a down\./);
    assert.match(readme, /\| z1 \| front left \| 10, 10 \| [A-Z] \|\n\| z2 \| front right \| 230, 10 \| [A-Z] \|\n\| z3 \| back left \| 10, 230 \| [A-Z] \|\n\| z4 \| back right \| 230, 230 \| [A-Z] \|/);
    assert.match(readme, /\| C \| 1 \| profile-2020-misumi-hfs5 \| 258\.5 \| z1 \|/);
    assert.match(readme, /\| C \| tap M5 x 18\.5 at a; access Ø5\.3 at front\.1@28\.5;[^|]*\| sheets\/beam-C\.svg \|/);
    assert.match(readme, /\| 4 \| M5x16 cap \| 1 pack of 10, 6 spare \| foot-z1 screwed into z1's end a;/);
    assert.match(readme, /foot-z1 \(fitting:levelling-foot-2020-misumi-hfs5-printed-m12-body\) goes on\n {3}- foot-z1 screwed into z1's end a \(1 × M5x16 cap\) with a 4 mm hex key[^\n]*\n {3}- Then screw foot-z1-pad \(printed beside it\) into foot-z1 by hand/);
    assert.match(readme, /: sheets\/beam-A\.svg\n/, 'a step names the sheet in the kit');
    assert.doesNotMatch(readme, /exports[\\/]|—/, 'nothing points outside the folder; no em dashes');
    assert.match(buy, /^kind,quantity,what,buy,for\n/);
    assert.match(buy, /\nscrew,4,M5x16 cap,1 pack of 10,foot-z1 screwed into z1's end a;/);
    // 4. Refused by name: a design that fails its check, and an object that is not an assembly
    write('bad', { items: [{ id: 'a1', beam: { profile: '2020-misumi-hfs5' }, from: [0, 0, 0], to: [100, 0, 0] }, { id: 'a2', beam: { profile: '2020-misumi-hfs5' }, from: [50, 0, 0], to: [150, 0, 0] }] });
    cad.refused(/frame\/bad: cad check fails 1 check \(a1\.body and a2\.body overlap[^)]*\), and a kit is written only for a design that checks with nothing failing: cad check frame\/bad/, 'kit', 'frame/bad');
    assert.ok(!fs.existsSync(path.join(ws, 'exports/frame/bad-kit')));
    cad.refused(/cad kit works on an assembly \(<project>\/<assembly>\), and there is no "frame\/none"/, 'kit', 'frame/none');
  } finally { done(); }
});

test('"have": a bought part or motor in hand is listed apart from what is to buy, on cad list, its JSON and the kit\'s buy.csv; a printed item cannot be had', () => {
  const { ws, cad, done } = workspace();
  const write = (f, x) => { fs.mkdirSync(path.dirname(path.join(ws, f)), { recursive: true }); fs.writeFileSync(path.join(ws, f), typeof x === 'string' ? x : JSON.stringify(x)); };
  try {
    write('projects/home/project.json', { name: 'home', material: 'PLA', objects: ['block'] });
    write('projects/home/objects/block.json', { name: 'block', version: '0.1.0', variables: { long: { value: 30, unit: 'mm', rule: 'The block' } } });
    write('projects/home/objects/block.js', "import jscad from '@jscad/modeling'\nconst { cuboid } = jscad.primitives\nexport function main (v) { return cuboid({ size: [v.long, 20, 10], center: [0, 0, 5] }) }\n");
    const items = (have) => [{ id: 'block', object: 'block' }, { id: 'm', motor: { model: '17HS4401' }, at: [200, 0, 0], ...(have ? { have: true } : {}) },
      { id: 'b1', bought: 'bearing-608', at: [0, 100, 0], ...(have ? { have: true } : {}) }, { id: 'b2', bought: 'bearing-608', at: [0, 150, 0] }];
    write('projects/home/assemblies/none.json', { title: 'None in hand', kind: 'fit', items: items(false) });
    write('projects/home/assemblies/some.json', { title: 'Some in hand', kind: 'fit', items: items(true) });
    // nothing in hand: the list as it always was, one Bought heading, the two bearings on one line
    const none = cad('list', 'home/none');
    assert.match(none, /\nBought\n/); assert.doesNotMatch(none, /in hand/); assert.match(none, /2 ×\s+bearing-608/);
    assert.match(none, /1 ×\s+nema17 \(17HS4401\)\s+a motor/, 'the motor by its variant');
    // in hand: what is to buy first, then what is in hand, the bearing had and the one to buy on lines of their own
    const some = cad('list', 'home/some'), toBuy = some.indexOf('Bought, to buy'), had = some.indexOf('Bought, in hand');
    assert.ok(toBuy > 0 && had > toBuy, some);
    assert.match(some.slice(toBuy, had), /1 ×\s+bearing-608\s+a bearing.*b2/); assert.doesNotMatch(some.slice(toBuy, had), /nema17|b1/);
    assert.match(some.slice(had), /1 ×\s+bearing-608\s+a bearing.*b1/); assert.match(some.slice(had), /1 ×\s+nema17 \(17HS4401\)/);
    const l = JSON.parse(cad('list', 'home/some', '--json'));
    assert.deepEqual(l.bought.map((b) => [b.set, b.variant ?? null, b.qty, b.have ?? false, b.items]).sort(), [['bearing-608', null, 1, false, ['b2']], ['bearing-608', null, 1, true, ['b1']], ['nema17', '17HS4401', 1, true, ['m']]].sort());
    // the kit's buy.csv says which rows are in hand, and its build page puts them under their own heading
    const k = JSON.parse(cad('kit', 'home/some', '--json')), dir = path.join(ws, k.dir);
    const csv = fs.readFileSync(path.join(dir, 'buy.csv'), 'utf8').replace(/\r\n/g, '\n');
    assert.match(csv, /\nin hand,1,bearing-608,none: in hand,b1\n/); assert.match(csv, /\nbought,1,bearing-608,,b2\n/); assert.match(csv, /\nin hand,1,nema17 \(17HS4401\),none: in hand,m\n/);
    const page = fs.readFileSync(path.join(dir, 'README.md'), 'utf8').replace(/\r\n/g, '\n');
    assert.ok(page.indexOf('### Bought parts') < page.indexOf('### In hand'), 'to buy, then in hand');
    // a printed part is never in hand: refused by name, with what can be
    write('projects/home/assemblies/bad.json', { title: 'Bad', kind: 'fit', items: [{ id: 'block', object: 'block', have: true }] });
    cad.refused(/item block: "have" marks a bought part or a motor as in hand, and block is printed \(object block\)/, 'check', 'home/bad');
    // "have" holds on a repeat's copies (r-0, r-1) and on a component's parts (k.s): all three bearings in hand, none to buy
    write('projects/home/assemblies/sub.json', { title: 'Sub', kind: 'fit', items: [{ id: 's', bought: 'bearing-608', have: true }] });
    write('projects/home/assemblies/top.json', { title: 'Top', kind: 'fit', items: [{ id: 'k', assembly: 'sub', at: [0, 200, 0] },
      { id: 'r', bought: 'bearing-608', have: true, at: [0, 0, 0], repeat: { x: { count: 2, step: 40 } } }, { id: 'b', bought: 'bearing-608', at: [0, 100, 0] }] });
    const top = JSON.parse(cad('list', 'home/top', '--json'));
    assert.deepEqual(top.bought.map((b) => [b.set, b.qty, b.have ?? false, [...b.items].sort()]).sort(), [['bearing-608', 1, false, ['b']], ['bearing-608', 3, true, ['k.s', 'r-0', 'r-1']]].sort());
    const topText = cad('list', 'home/top');
    assert.match(topText.slice(topText.indexOf('Bought, in hand')), /3 ×\s+bearing-608/, topText);
  } finally { done(); }
});

test('printed in place: each part on the bed, every two the print gap apart by Manifold, nothing needing a support', () => {
  const { ws, cad, done } = workspace();
  try {
    fs.mkdirSync(path.join(ws, 'projects/demo/objects'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'projects/demo/project.json'), JSON.stringify({ name: 'demo', material: 'PLA', objects: ['pair'] }));
    // Two blocks side by side, gap apart; a cube that may be lifted off the bed; a table whose top spans span
    fs.writeFileSync(path.join(ws, 'projects/demo/objects/pair.json'), JSON.stringify({ name: 'pair', title: 'Parts printed in place', version: '0.1.0', uses: ['x1c'], engine: 'manifold', printInPlace: true,
      parts: { left: {}, right: {}, hat: {}, table: {} },
      variables: { side: { value: 10, unit: 'mm', rule: 'Each block' }, high: { value: 5, unit: 'mm', rule: 'Each block' }, gap: { value: 0.7, unit: 'mm', rule: 'Between the blocks' },
        lift: { value: 0, unit: 'mm', rule: 'The cube off the bed' }, cube: { value: 4, unit: 'mm', rule: 'The cube' }, at: { value: 30, unit: 'mm', rule: 'Where the cube and the table stand' },
        span: { value: 4, unit: 'mm', rule: 'Under the table top' }, leg: { value: 2, unit: 'mm', rule: 'Each leg' }, top: { value: 1, unit: 'mm', rule: 'The table top' } } }));
    fs.writeFileSync(path.join(ws, 'projects/demo/objects/pair.js'), `import jscad from '@jscad/modeling'
const { cuboid } = jscad.primitives
const box = (x0, x1, y0, y1, z0, z1) => cuboid({ size: [x1 - x0, y1 - y0, z1 - z0], center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2] })
export function main (v) {
  const left = box(0, v.side, 0, v.side, 0, v.high), right = box(v.side + v.gap, 2 * v.side + v.gap, 0, v.side, 0, v.high)
  const hat = box(v.at, v.at + v.cube, 0, v.cube, v.lift, v.lift + v.cube)
  const x = v.at + v.at, w = 2 * v.leg + v.span
  const table = v.ops.union(box(x, x + v.leg, 0, v.cube, 0, v.high), box(x + v.leg + v.span, x + w, 0, v.cube, 0, v.high), box(x, x + w, 0, v.cube, v.high, v.high + v.top))
  return { left, right, hat, table }
}
`);
    const run = () => { const found = cad.findings('check', 'demo/pair', '--json'); return { of: (code) => found.filter((x) => x.code === code) }; };
    // Apart by 0.7 mm, all on the bed, a 4 mm bridge (the X1C spans 5): every check passes
    let r = run();
    assert.equal(r.of('inplace.bed')[0].level, 'pass'); assert.equal(r.of('inplace.support')[0].level, 'pass');
    const g = r.of('inplace.gap')[0];
    assert.equal(g.level, 'pass'); assert.ok(Math.abs(g.values.gap - 0.7) < 1e-4, `the nearest, ${g.values.gap}`); assert.equal(g.values.need, 0.3, 'the X1C\'s print_gap'); assert.deepEqual(g.refs.parts, ['left', 'right']);
    // the first layer needs the print gap and the X1C's 0.15 mm foot each side: 0.3 + 2 × 0.15 = 0.6 mm
    assert.equal(r.of('inplace.first-layer')[0].level, 'pass'); assert.ok(Math.abs(r.of('inplace.first-layer')[0].values.need - 0.6) < 1e-9);
    // 0.45 mm apart: clear of each other above, but on the bed the first layer spreads them into one
    cad('set', 'demo/pair', 'gap=0.45');
    r = run();
    assert.equal(r.of('inplace.gap')[0].level, 'pass');
    const first = r.of('inplace.first-layer')[0];
    assert.equal(first.level, 'fail'); assert.ok(Math.abs(first.values.gap - 0.45) < 1e-4, `${first.values.gap}`); assert.deepEqual(first.refs.parts, ['left', 'right']);
    // 0.2 mm apart: under the 0.3 mm print gap, they fuse
    cad('set', 'demo/pair', 'gap=0.2');
    r = run();
    const near = r.of('inplace.gap')[0];
    assert.equal(near.level, 'fail'); assert.ok(Math.abs(near.values.gap - 0.2) < 1e-4, `${near.values.gap}`); assert.deepEqual(near.refs.parts, ['left', 'right']); assert.ok(near.at && near.box, 'where');
    // the cube 2 mm up: off the bed, and its underside in mid-air
    cad('set', 'demo/pair', 'gap=0.7', 'lift=2');
    r = run();
    const bed = r.of('inplace.bed');
    assert.deepEqual(bed.map((x) => [x.level, x.refs.part]), [['fail', 'hat']]); assert.match(bed[0].text, /its lowest point is 2 mm up/);
    assert.ok(r.of('inplace.support').some((x) => x.level === 'fail' && x.values.was === 'print.mid-air'), 'a support it cannot have');
    // the table's top over 8 mm: a bridge the printer can't span, which no support can come out from under
    cad('set', 'demo/pair', 'lift=0', 'span=8');
    r = run();
    const s = r.of('inplace.support');
    assert.deepEqual(s.map((x) => [x.level, x.values.was]), [['fail', 'print.bridge']]); assert.ok(Math.abs(s[0].values.span - 8) < 0.05, `${s[0].values.span}`);
    // not printed in place: none of these
    const o = JSON.parse(fs.readFileSync(path.join(ws, 'projects/demo/objects/pair.json'), 'utf8')); delete o.printInPlace;
    fs.writeFileSync(path.join(ws, 'projects/demo/objects/pair.json'), JSON.stringify(o));
    r = run();
    assert.equal(r.of('inplace.gap').length + r.of('inplace.bed').length + r.of('inplace.support').length + r.of('inplace.first-layer').length, 0);
  } finally { done(); }
});
