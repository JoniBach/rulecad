// cad's tests of cad machine and its machines: wires, tasks, loads, gaits, grippers, services and controllers. The shared helpers are in ./helpers.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { workspace, BIN, ROOT_MODULES, CAD } from './helpers.mjs';

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
    const check = cad.run('check', 'home/arm', '--json').json.findings.filter((x) => x.code.startsWith('wire.'));
    const len = check.find((x) => x.code === 'wire.length' && x.refs.wire === 'm1');
    assert.equal(len.values.length, Math.ceil(len.values.longest + 40), 'its longest, and the loop');
    assert.ok(len.values.longest > len.values.shortest + 50, 'it changes as the arm swings');
    assert.equal(check.find((x) => x.code === 'wire.gauge' && x.refs.wire === 'm1').level, 'pass');
    const thin = check.find((x) => x.code === 'wire.gauge' && x.refs.wire === 'thin');
    assert.equal(thin.level, 'fail'); assert.match(thin.text, /awg28 carries 0\.81 A at most, and this carries 2 A/);
    a.wires = [{ from: 'arm.nothing', to: 'base.tip' }]; fs.writeFileSync(path.join(ws, 'projects/home/assemblies/arm.json'), JSON.stringify(a));
    cad.refused(/wire w1: no anchor "arm\.nothing" .*arm has base, tip/, 'check', 'home/arm');
    a.wires = [{ from: 'arm.tip', to: 'base.tip', gauge: 'thick' }]; fs.writeFileSync(path.join(ws, 'projects/home/assemblies/arm.json'), JSON.stringify(a));
    cad.refused(/wire 1: gauge is awg and a number/, 'check', 'home/arm');
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
    const check = () => { const r = cad.run('check', 'home/arm', '--json').json; assert.ok(r.findings, JSON.stringify(r.error)); return r.findings; };
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
    write(asm()); cad.refused(/joint shoulder has no stepper driving it/, 'machine', 'home/arm');
    const two = asm(); two.items.push({ id: 'm0', motor: { model: 'nema17', drives: 'shoulder', speed: 300, microsteps: 16 }, at: [0, 0, 0] }); two.fits.push({ a: 'm0', b: 'upper', min: -1000, silent: true }, { a: 'm1', b: 'fore', min: -1000, silent: true });
    two.items[3].motor.driver = undefined; write(two);
    const machine = JSON.parse(cad('machine', 'home/arm', '--json'));
    assert.equal(machine.kinematics, 'scara'); assert.equal(machine.axes.length, 2);
    assert.ok(Math.abs(machine.axes[0].stepsPerUnit - (200 * 16) / 360) < 1e-5); assert.equal(machine.task.speed, 50);
    assert.match(machine.axes[0]._why.microsteps, /resolution only/);
    // a drawing, planned and replayed; one bigger than the sheet refused at the stroke that leaves it
    fs.writeFileSync(path.join(ws, 'square.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="148mm" height="210mm" viewBox="0 0 148 210"><rect id="sq" x="24" y="55" width="100" height="100" fill="none"/><circle id="c" cx="74" cy="105" r="20" fill="none"/></svg>');
    const plotted = cad.run('plot', 'home/arm', 'square.svg', '--json'), p = JSON.parse(plotted.stdout);
    assert.equal(p.ok, true, plotted.stdout.slice(0, 400)); assert.equal(plotted.status, 0);
    const steps = JSON.parse(fs.readFileSync(p.file, 'utf8'));
    assert.equal(steps.format, 'rulecad.steps/1'); assert.ok(steps.drawn.length >= 2 && steps.drawn[0].error, 'lines carry their predicted error');
    assert.match(fs.readFileSync(path.join(ws, '.preview/home/arm-square-plot.svg'), 'utf8'), /<animate attributeName="points"/);
    const { replay, chainFromMotion } = await import('@rulecad/robots');
    const send = await import(pathToFileURL(fileURLToPath(new URL('../../examples/bench/projects/arm/send.mjs', CAD))).href), lines = send.linesOf(steps), dry = send.dryRun(['e', ...lines, 'd']);
    assert.ok(dry.m > 50 && dry.p > 1, 'the sender takes it'); assert.throws(() => send.linesOf({ format: 'x' }), /not a step file/);
    fs.writeFileSync(path.join(ws, 'big.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="400mm" height="400mm" viewBox="0 0 400 400"><rect id="huge" x="10" y="10" width="380" height="380" fill="none"/></svg>');
    const big = cad.run('plot', 'home/arm', 'big.svg');
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
    const check = () => { const r = cad.run('check', 'home/arm', '--json').json; assert.ok(r.findings, JSON.stringify(r.error)); return r.findings; };
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
    const clipped = check(), clip = by(clipped, 'joint.moment'); assert.match(clip.text, /3 printed clips, the worst \(c\d\) at [\d.]+ MPa/); assert.ok(clip.values.stress > 0);
    assert.equal(clip.level, 'fail', clip.text); assert.match(clip.text, /FE on 0\.5 mm cells/);
    // The clips' cell is theirs alone: each link keeps its own, a third of its thinnest side, 8 / 3 = 2.67 mm (the link
    // is 170 x 12 x 8 mm). At the clips' 0.5 mm the link was 340 x 24 x 16 = 130 560 cells: 3 GB and over ten minutes.
    assert.deepEqual(by(clipped, 'link.deflection').values.rows.map((x) => +x.cell.toFixed(3)), [2.667, 2.667]);
    write(asm({ clips: ['c1', 'c2', 'c3'], pitch: 40, cell: 0.5, linkCell: 2 }, 0.5));
    // linkCell is the shoulder's, so it sets the upper link alone; the forearm, beyond the elbow, keeps its 2.67 mm
    const fine = by(check(), 'link.deflection'); assert.deepEqual(fine.values.rows.map((x) => +x.cell.toFixed(3)), [2, 2.667]); assert.match(fine.text, /a person can refine with "linkCell" on the joint's support/);
    write(asm(undefined)); assert.equal(by(check(), 'joint.moment').level, 'warn');
  } finally { done(); }
});

test('a gait in an assembly: a crawl checked through its cycle, motors against its torque, and legs that collide found', async () => {
  const { ws, cad, done } = workspace();
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
    const check = () => { const r = cad.run('check', 'home/quad', '--json').json; assert.ok(r.findings, JSON.stringify(r.error)); return r.findings; };
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
    const bad = cad.run('check', 'home/quad', '--json').json; assert.match(bad.error.message, /gait: no anchor "fl\.nowhere"/);
  } finally { done(); }
});

test('tool.grip: a servo closing compliant fingers on a payload, with the leaves\' strain and a stiff leaf refused', async () => {
  const { gripChecks } = await import('../lib/grip.mjs');
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
    const r = cad.json('check', 'home/leg', '--json'), f = r.findings;
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

test('tool.grip reads the finger\'s own material when it names one; a link bends as everything bolted to its joint, and a gearbox output joins the chain through its motor', async () => {
  const { gripChecks } = await import('../lib/grip.mjs');
  const servo = { id: 's', model: { type: 'servo', figures: { stall_torque: { value: 0.1765 } } } }, spec = { servo: 's', horn: 12, leaf: { length: 40, thickness: 1, width: 12 }, travel: 3, friction: 0.4 };
  const run = (grip) => { const out = []; gripChecks({ a: { task: { grip } }, motion: { drives: [servo] }, task: { payload: 0.05, accel: 300 }, num: (x) => x, project: 'x' }, (level, text, card, extra) => out.push({ level, text, ...extra })); return out; };
  assert.match(run({ ...spec, material: 'petg' }).find((x) => x.code === 'tool.strain').text, /in a PETG leaf/);
  assert.doesNotMatch(run(spec).find((x) => x.code === 'tool.strain').text, /PETG/, 'the project\'s material when it names none');
  const { ws, cad, done } = workspace();
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
    const json = cad.json('check', 'home/lift', '--json');
    const link = json.findings.find((x) => x.code === 'link.deflection');
    assert.ok(link, json.findings.map((x) => x.code).join(', '));
    assert.ok(link.values.total > 0.05 && link.values.total < 5, `the bar, bolted to the joint's hub, bends as a cantilever (${link.values.total} mm)`);
    assert.equal(link.values.rows[0].link, 'hub');
  } finally { done(); }
});

test('services: the worked arm\'s shield and supply mount on a rail from their own rule sets, and its power wire runs along a slot, its length and its clips reported', () => {
  const { ws, cad, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/rack', f);
    fs.mkdirSync(at('assemblies'), { recursive: true });
    fs.writeFileSync(at('project.json'), JSON.stringify({ name: 'rack', material: 'PLA', objects: [] }));
    // the arm's own shield, supply and power wire (examples/bench arm/arm), on a 400 mm rail of 2020
    const arm = JSON.parse(fs.readFileSync(path.join(path.dirname(ROOT_MODULES), 'examples/bench/projects/arm/assemblies/arm.json'), 'utf8')), mine = (id) => { const { at: _at, ...it } = arm.items.find((x) => x.id === id); return it; };
    const power = arm.wires.find((w) => w.id === 'power');
    const write = (items, wires = [{ ...power, via: [{ along: 'rail.front', from: 300, to: 60 }] }]) => fs.writeFileSync(at('assemblies/rack.json'), JSON.stringify({ title: 'rack', kind: 'fit',
      items: [{ id: 'rail', beam: { profile: '2020-misumi-hfs5' }, from: [0, 0, 0], to: [400, 0, 0] }, ...items], wires }));
    // (the arm now runs on a 12 V bench supply, which stands on the bench and has no mounting holes: the Mean Well it
    // was drawn with before, an LRS-50-24, is the supply that mounts here)
    write([{ ...mine('shield'), mount: { on: 'rail.top@100' } }, { id: 'psu', bought: 'supply-24v', variant: 'LRS-50-24', mount: { on: 'rail.top@-90' } }]);
    const r = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
      const { buildAssembly, checkAssembly } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/assembly.mjs')).href)});
      const s = await buildAssembly('rack/rack'), f = checkAssembly(s);
      console.log(JSON.stringify({ mounts: s.mounts, runs: s.runs, hardware: s.hardware.map((h) => h.kind + ' ' + h.name), at: Object.fromEntries(s.items.filter((i) => ['shield', 'psu'].includes(i.id)).map((i) => [i.id, i.at])),
        bad: f.filter((x) => x.level === 'fail' || x.level === 'warn').map((x) => x.code + ': ' + x.text), said: f.filter((x) => /^(service\\.mount|wire\\.(run|length)|fitting\\.(device|head))$/.test(x.code) || (/^fasten\\.(end|length|engagement)$/.test(x.code) && /on its mount/.test(x.text))).map((x) => x.code + ': ' + x.text) }));
    `], { cwd: ws, encoding: 'utf8', env: { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') } }));
    // each device on its printed mount at its address, the mount listed just before it, the device placed by the mount
    assert.deepEqual(r.mounts.map((m) => [m.id, m.mount, m.set, m.variant, m.fix, m.holes, m.thread, m.length]), [['shield', 'shield-mount', 'cnc-shield-v3', null, 'through', 4, 'M2.5', 8], ['psu', 'psu-mount', 'supply-24v', 'LRS-50-24', 'tapped', 2, 'M3', 5]]);
    assert.deepEqual(r.at, { shield: 'shield-mount.device', psu: 'psu-mount.device' });
    // the supply: into its own thread no further than Mean Well's L = 3 mm; the board: the Uno's 3.2 mm holes, M2.5 caps whose heads sit whole
    const said = r.said.join('\n');
    assert.match(said, /fasten\.length: psu on its mount, from under it, 2 M3 button screws: M3x5 button chosen, the longest sold that goes no further than its maker allows: 2 mm under its head and 3 mm into psu/);
    assert.match(said, /fasten\.engagement: psu on its mount, from under it, 2 M3 button screws: 3 mm into psu's own thread, 6 turns: as far as its maker allows \(supply-24v\.mount_hole_reach, 3 mm\)/);
    assert.match(said, /fasten\.length: shield on its mount, 4 M2\.5 cap screws: M2\.5x8 cap chosen/);
    assert.match(said, /service\.mount: psu: on a printed mount \(psu-mount\) at rail\.top@-90, held by its 2 tapped M3 holes from supply-24v's rule set/);
    // the wire: 240 mm of it along the front slot, four clips no more than 100 mm apart, its length through them
    assert.deepEqual(r.runs.map((x) => [x.wire, x.along, x.length, x.count, x.pitch]), [['power', 'rail.front.1', 240, 4, 80]]);
    assert.match(said, /wire\.run: power: 240 mm along rail\.front\.1 from 300 to 60 mm, held by 4 cable clips 80 mm apart \(no more than 100\) for a 6 mm bundle/);
    assert.match(said, /wire\.length: power: psu\.terminals to shield\.top, \d+ mm with its 40 mm loop .*; 240 mm of it along rail\.front\.1, held by 4 cable clips/);
    // what is left: one warning, true of the Uno, whose 3.2 mm holes are wide for an M2.5 (an M3's head would overhang its edge)
    assert.deepEqual(r.bad.map((x) => x.split(':')[0]), ['fasten.clearance']); assert.match(r.bad[0], /shield's hole measures 3\.2 mm, wider than the loosest clearance hole for M2\.5, 3\.1 mm as drilled/);
    assert.equal(r.hardware.filter((h) => h === 'screw M5x12 button').length, 4, 'two into the slot for each mount');
    const list = cad('list', 'rack/rack');
    assert.match(list, /4 ×\s+M2\.5x8 cap/); assert.match(list, /2 ×\s+M3x5 button/); assert.match(list, /4 ×\s+slot-nut-6-misumi-m5-slide-in/);
    assert.match(list, /shield-mount \(fitting:device-mount-2020-misumi-hfs5-cnc-shield-v3-m5\)/); assert.match(list, /power-clip-4 \(fitting:cable-clip-6-misumi-6mm\)/);
    assert.match(cad('check', 'rack/rack'), /files match their schemas/);
    // the other service parts as fitting items, each screwed into the slot: nothing fails or warns
    const P = '2020-misumi-hfs5', kinds = [['fan', { kind: 'fan-mount', size: 40 }, 'rail.top@60', 2], ['tie', { kind: 'tie-anchor' }, 'rail.top@150', 1], ['din', { kind: 'din-rail' }, 'rail.top@220', 2], ['spool', { kind: 'spool-holder' }, 'rail.front@320', 1]];
    fs.writeFileSync(at('assemblies/more.json'), JSON.stringify({ title: 'more', kind: 'fit', items: [{ id: 'rail', beam: { profile: P }, from: [0, 0, 0], to: [400, 0, 0] }, ...kinds.map(([id, f, a]) => ({ id, fitting: { profile: P, ...f }, at: a }))],
      fasten: kinds.map(([id, , a, n]) => ({ screw: 'M5 button', through: [id], into: a.split('@')[0], at: Array.from({ length: n }, (_, k) => `${id}.b${k + 1}`) })) }));
    const more = cad('check', 'rack/more');
    assert.doesNotMatch(more, /^\s+(✗|!) /m); assert.match(more, /fan: printed mount for a 40 mm fan on 2020-misumi-hfs5/); assert.match(more, /spool: printed spool holder/);
    // the set's default supply (LRS-100-24) and the four-hole M4 ones: each screw read off the cut plate stops within
    // Mean Well's 3 mm, the mesh's grid allowed (a seat read 0.0002 mm off once failed all of these)
    for (const [variant, says] of [[null, /2 M3 button screws: M3x5 button chosen, the longest sold that goes no further than its maker allows: 2 mm under its head and 3 mm into psu/], ['LRS-200-24', /4 M4 button screws: M4x6 button chosen, the longest sold that goes no further than its maker allows: 3 mm under its head and 3 mm into psu/]]) {
      write([{ id: 'psu', bought: 'supply-24v', ...(variant ? { variant } : {}), mount: { on: 'rail.top@-120' } }], []);
      const c = cad('check', 'rack/rack');
      assert.match(c, says, variant ?? 'the default'); assert.doesNotMatch(c, /^\s+✗ /m, variant ?? 'the default');
    }
    // a run along the slot a mount sits on: no clip under the plate (they overlapped it), one each side, and a warning
    // by name that the wire must go round the mount
    write([{ id: 'psu', bought: 'supply-24v', variant: 'LRS-50-24', mount: { on: 'rail.top@200' } }], [{ ...power, from: 'rail.a', to: 'rail.b', via: [{ along: 'rail.top', from: 20, to: 380 }] }]);
    const round = cad('check', 'rack/rack');
    assert.match(round, /✓ no parts overlap/); assert.doesNotMatch(round, /^\s+✗ /m);
    assert.match(round, /power: 360 mm along rail\.top\.1 from 20 to 380 mm, held by 6 cable clips no more than 100 mm apart but across psu-mount \((\d+(\.\d+)?) mm, a clip each side\), for a 6 mm bundle/);
    assert.match(round, /! power: its run along rail\.top\.1 passes psu-mount \(psu's mount\) from 132\.75 to 267\.25 mm: no clip goes under the plate, so one is set each side of it, and the wire must go round the mount there/);
    write([{ id: 'psu', bought: 'supply-24v', variant: 'LRS-50-24', mount: { on: 'rail.top@200' } }], [{ ...power, from: 'rail.a', to: 'rail.b', via: [{ along: 'rail.top', from: 150, to: 250 }] }]);
    cad.refused(/wire power: a run along rail\.top\.1 from 150 to 250 mm lies under psu-mount: no clip has room there; run it along another face/, 'check', 'rack/rack');
    // refused by name
    write([{ ...mine('shield'), at: [0, 0, 0], mount: { on: 'rail.top@100' } }]); cad.refused(/item shield: a mounted item is placed by its mount: leave out at, rotate and repeat/, 'check', 'rack/rack');
    write([{ id: 'd1', bought: 'drv8825', mount: { on: 'rail.top@100' } }]); cad.refused(/item d1: mount holds a bought board or supply, and drv8825 is a driver/, 'check', 'rack/rack');
    write([{ id: 'p12', bought: 'supply-12v', mount: { on: 'rail.top@100' } }]); cad.refused(/item p12: supply-12v gives no mounting holes \(mount_holes/, 'check', 'rack/rack');
    write([{ ...mine('psu'), mount: { on: 'rail.side@100' } }]); cad.refused(/item psu: on: profile-2020-misumi-hfs5 x 400 has no "side@100": it has a, b, a\.1, b\.1, top\.1, top/, 'check', 'rack/rack');
    write([], [{ ...power, from: 'rail.a', to: 'rail.b', via: [{ along: 'rail.front', from: 0, to: 500 }] }]); cad.refused(/wire power: a run's to is from 0 to 400 mm along rail \(got 500\)/, 'check', 'rack/rack');
    write([], [{ ...power, from: 'rail.a', to: 'rail.b', via: [{ along: 'rail.front', from: 0, to: 100, every: 50 }] }]); cad.refused(/wire power: a run along a slot has no "every": it takes along, from, to, pitch, cable|must NOT have additional properties/, 'check', 'rack/rack');
  } finally { done(); }
});

test('the bench arm on the parts its builder has: a 17HS4401 at each joint on 12 V, DRV8825s at 1/8 step, and a buy list that names nothing in hand', () => {
  const { ws, cad, done } = workspace({ printer: 'x1c' });
  const bench = fileURLToPath(new URL('../../examples/bench/', CAD));
  try {
    for (const d of ['rules', 'projects/arm']) fs.cpSync(path.join(bench, d), path.join(ws, d), { recursive: true });
    const asm = (name) => JSON.parse(fs.readFileSync(path.join(ws, `projects/arm/assemblies/${name}.json`), 'utf8'));
    // what is on the bench (2026-11-20): 17HS4401 steppers, DRV8825s on a CNC Shield V3 with M0 and M1 jumpered (1/8),
    // a 12 V bench supply, one SG90
    for (const [name, currents] of [['arm', [0.5, 0.5]], ['arm-upright', [0.8, 0.5]]]) {
      const a = asm(name), item = (id) => a.items.find((x) => x.id === id);
      assert.deepEqual(['m1', 'm2'].map((id) => [item(id).motor.model, item(id).motor.current, item(id).motor.microsteps, item(id).have]), [['17HS4401', currents[0], 8, true], ['17HS4401', currents[1], 8, true]], name);
      assert.equal(item('psu').bought, 'supply-12v'); assert.ok(item('psu').set.output_current < 2, 'the bench supply\'s limit, under 2 A');
      assert.ok(!a.items.some((x) => x.motor?.model === 'nema14' || x.bought === 'supply-24v'), `${name}: no part the builder lacks`);
      assert.equal(a.items.filter((x) => x.motor?.model === 'sg90').length, 1, `${name}: the one SG90 (the upright arm's gripper takes the pen lift's)`);
    }
    // the buy list: the switches and the bearing to buy, everything on the bench in hand
    const l = JSON.parse(cad('list', 'arm/arm', '--json')), line = (b) => `${b.set}${b.variant ? ` (${b.variant})` : ''} x${b.qty}`;
    assert.deepEqual(l.bought.filter((b) => !b.have).map(line).sort(), ['bearing-6800 x1', 'endstop-10t85 x2']);
    assert.deepEqual(l.bought.filter((b) => b.have).map(line).sort(), ['cnc-shield-v3 x1', 'drv8825 x2', 'nema17 (17HS4401) x2', 'sg90 x1', 'supply-12v x1']);
    assert.ok(l.fasteners.length && l.wires.length, 'screws and wire, which are to buy');
  } finally { done(); }
});

test('the bench leg on the parts its builder has: a 17HS4401 at hip and knee on 12 V, parts in hand marked, and the stand loaded with what rides its rods', () => {
  const { ws, cad, done } = workspace({ printer: 'x1c' });
  const bench = fileURLToPath(new URL('../../examples/bench/', CAD)), template = fileURLToPath(new URL('../create-rulecad/machines/leg/', CAD));
  try {
    for (const d of ['rules', 'projects/leg']) fs.cpSync(path.join(bench, d), path.join(ws, d), { recursive: true });
    const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n'));
    // the stand, here and in the template, on what is on the bench (2026-11-20): 17HS4401s at 0.5 A on DRV8825s at 1/8, a
    // CNC Shield V3, the 12 V bench supply with its current limit at 1.5 A
    for (const file of [path.join(ws, 'projects/leg/assemblies/stand.json'), path.join(template, 'projects/leg/assemblies/stand.json')]) {
      const a = read(file), item = (id) => a.items.find((x) => x.id === id);
      assert.deepEqual(['m1', 'm2'].map((id) => [item(id).motor.model, item(id).motor.current, item(id).motor.microsteps, item(id).have]), [['17HS4401', 0.5, 8, true], ['17HS4401', 0.5, 8, true]], file);
      assert.equal(item('psu').bought, 'supply-12v'); assert.equal(item('psu').set.output_current, 1.5); assert.equal(item('psu').have, true);
      assert.ok(['d1', 'd2', 'shield'].every((id) => item(id).have), 'the drivers and the shield in hand');
      assert.equal(a.gait.mass, 'leg.stand_load');
    }
    // no part the builder lacks in any of the leg's assemblies, the quadruped's and the crawl's knees at 1 A as their hips
    for (const name of ['stand', 'quadruped', 'crawl']) {
      const a = read(path.join(ws, `projects/leg/assemblies/${name}.json`));
      assert.ok(!a.items.some((x) => x.motor?.model === 'nema14' || x.bought === 'supply-24v'), `${name}: no NEMA 14, no 24 V supply`);
      if (name !== 'stand') assert.deepEqual([...new Set(a.items.filter((x) => x.motor).map((x) => `${x.motor.model} ${x.motor.current}`))], ['17HS4401 1'], name);
    }
    for (const f of ['projects/leg/objects/thigh.js', 'rules/leg.json']) assert.equal(fs.readFileSync(path.join(template, f), 'utf8').replace(/\r\n/g, '\n'), fs.readFileSync(path.join(ws, f), 'utf8').replace(/\r\n/g, '\n'), `the template's ${f} is the bench's`);
    assert.doesNotMatch(fs.readFileSync(path.join(ws, 'projects/leg/objects/thigh.js'), 'utf8'), /nema14/);
    // the buy list: the bearings and rods to buy, the motors, drivers, shield and supply in hand
    const l = JSON.parse(cad('list', 'leg/stand', '--json')), line = (b) => `${b.set}${b.variant ? ` (${b.variant})` : ''} x${b.qty}`;
    assert.deepEqual(l.bought.filter((b) => !b.have).map(line).sort(), ['bearing-6800 x1', 'lm8uu x2', 'rod-8 x2']);
    assert.deepEqual(l.bought.filter((b) => b.have).map(line).sort(), ['cnc-shield-v3 x1', 'drv8825 x2', 'nema17 (17HS4401) x2', 'supply-12v x1']);
    // leg.riding is what rides the rods, from this list, by hand: the two 17HS4401s 2 × 280 = 560 g; the leg's prints
    // (housing 31.4, sun 3.2, planets 3 × 5.9, output 28.8, spindle 7.7, bridge 13.1, thigh 97.5, the knee's sun 3.2,
    // planets 17.7, output 28.8, clips 0.9, shin 42.9, pad 2.3) 295.2 g; the 6800 5 g; the carriage 91.6 g; two LM8UU
    // 32 g; the screws 24 g: 1007.8 g, 1.01 kg. Left out: the feet, tie and collars, which stand on the bench
    const fixed = new Set(['foot1', 'foot2', 'tie', 'collar1', 'collar2']), bought = (set) => l.bought.filter((b) => b.set === set).reduce((t, b) => t + b.qty * b.grams, 0);
    const riding = l.printed.filter((p) => !fixed.has(p.id)).reduce((t, p) => t + p.grams, 0) + bought('nema17') + bought('bearing-6800') + bought('lm8uu') + l.totals.fixingsGrams;
    const rules = read(path.join(ws, 'rules/leg.json')).rules;
    assert.ok(Math.abs(riding / 1000 - rules.riding.value) < 0.01, `${riding} g rides the rods; leg.riding is ${rules.riding.value} kg`);
    assert.equal(rules.stand_load.value, 'max(share, riding)');
    // the quadruped's mass: its cad list (eight 17HS4401s) and about 0.4 kg of electronics, an estimate
    const q = JSON.parse(cad('list', 'leg/quadruped', '--json'));
    assert.ok(Math.abs(q.totals.machineGrams / 1000 + 0.4 - rules.robot_mass.value) < 0.05, `${q.totals.machineGrams} g as drawn; leg.robot_mass ${rules.robot_mass.value} kg`);
  } finally { done(); }
});

test('the leg\'s gait as a step file: cad machine and cad plot on the stand, the sender\'s dry run, and the shield\'s wiring held to the streamer\'s axes', async () => {
  const { ws, cad, done } = workspace({ printer: 'x1c' });
  const bench = fileURLToPath(new URL('../../examples/bench/', CAD));
  try {
    for (const d of ['rules', 'projects/leg']) fs.cpSync(path.join(bench, d), path.join(ws, d), { recursive: true });
    // the machine: an axis for each motor's shaft, the hip's on the shield's X and the knee's on Y, as stand.json wires them.
    // A 17HS4401 (1.8°) at 1/8: 200 x 8 / 360 = 4.444444 steps a degree; at its item's 200 rpm, 200 x 1600 / 60 = 5333 steps/s
    const m = JSON.parse(cad('machine', 'leg/stand', '--json'));
    assert.equal(m.kinematics, 'legged');
    assert.deepEqual(m.axes.map((a) => [a.name, a.motor, a.slot, a.stepsPerUnit, a.maxRate, a.homing]), [['hd', 'm1', 'X', 4.444444, 5333, null], ['kd', 'm2', 'Y', 4.444444, 5333, null]]);
    assert.deepEqual([m.gait.legs, m.gait.period, m.gait.frames], [['shin'], 2, 48]);
    // the step file: three cycles from the pose "standing" (hd -5587.7°, kd -2236° of the motors' shafts) and back to it.
    // Start in steps: -5587.7 x 4.444444 = -24834.2, so -24834; -2236 x 4.444444 = -9937.8, so -9938
    const p = JSON.parse(cad('plot', 'leg/stand', '--json'));
    assert.equal(p.ok, true, JSON.stringify(p.findings));
    const f = JSON.parse(fs.readFileSync(path.join(ws, 'exports/leg/stand-gait.steps.json'), 'utf8'));
    assert.deepEqual([f.format, f.kind, f.pose, f.cycles, f.frames, f.start], ['rulecad.steps/1', 'gait', 'standing', 3, 48, [-24834, -9938]]);
    assert.ok(fs.existsSync(path.join(ws, '.preview/leg/stand-gait.svg')), 'the picture of each axis through the run');
    assert.deepEqual([f.blocks[0].kind, f.blocks.at(-1).kind], ['approach', 'return']);
    assert.deepEqual([0, 1].map((k) => f.blocks.reduce((t, b) => t + b.steps[k], 0)), [0, 0], 'it ends where it started');
    // the knee is the axis the gait's period asks too much of: past its 5333 steps/s at a 2 s cycle, so the cycle is
    // stretched and the file says so
    const rate = p.findings.find((x) => x.code === 'steps.rate'), period = p.findings.find((x) => x.code === 'gait.period');
    assert.equal(rate.values.axis, 'kd'); assert.ok(rate.values.asked > 5333, `${rate.values.asked} steps/s asked`);
    assert.equal(period.level, 'warn'); assert.ok(period.values.cycleTime > 2.1 && period.values.cycleTime < 4, `${period.values.cycleTime} s a cycle`);
    assert.ok(Math.abs(f.time - f.blocks.reduce((t, b) => t + b.time, 0)) < 1e-9);
    // no axis faster than its maxRate, and no axis's speed changes by more than maxRate / 8 = 666.6 steps/s between blocks
    const speed = (b, k, end) => (b.rate[end] * b.steps[k]) / b.major;
    for (const b of f.blocks) assert.ok(b.rate.peak <= 5333 + 1e-6, `a block at ${b.rate.peak}`);
    for (let j = 1; j < f.blocks.length; j++) for (const k of [0, 1]) assert.ok(Math.abs(speed(f.blocks[j - 1], k, 'exit') - speed(f.blocks[j], k, 'entry')) <= 5333 / 8 + 1e-6, `junction ${j}, axis ${k}`);
    // the arm's sender takes it as it is: every line answered "ok" in its dry run, held to the streamer's MAX_RATE and the
    // machine's rates, and at the end the streamer would report the axes back at 0, where it started
    const send = await import(pathToFileURL(path.join(bench, 'projects/arm/send.mjs')).href);
    const lines = ['e', ...send.homeLines(m), ...send.linesOf(f), '?', 'd'], r = send.dryRun(lines, { machine: m });
    assert.deepEqual([r.m, r.p, r.h, r.position], [f.blocks.length, 0, 0, [0, 0, 0]]);
    assert.equal(r.said.at(-2), '?  q 0 0 0 0');
    assert.ok(r.axisPeaks[0] <= 5333 && r.axisPeaks[1] <= 5333);
    // the wiring: swapped slots put the knee first; a gap (the knee on Z, nothing on X) is refused by name
    const file = path.join(ws, 'projects/leg/assemblies/stand.json'), a = JSON.parse(fs.readFileSync(file, 'utf8')), wire = (id) => a.wires.find((w) => w.id === id);
    wire('hip_wire').to = 'shield.Y'; wire('knee_wire').to = 'shield.X'; fs.writeFileSync(file, JSON.stringify(a));
    assert.deepEqual(JSON.parse(cad('machine', 'leg/stand', '--json')).axes.map((x) => `${x.name} ${x.slot}`), ['kd X', 'hd Y']);
    wire('knee_wire').to = 'shield.Z'; fs.writeFileSync(file, JSON.stringify(a));
    const bad = cad.run('plot', 'leg/stand', '--json'), out = JSON.parse(bad.stdout);
    assert.equal(bad.status, 1);
    assert.equal(out.findings.find((x) => x.code === 'stream.wiring').text, "hd's motor m1 is wired to the shield's Y, and the streamer steps axis 0 on X");
    // refused by name
    cad.refused(/--cycles is a whole number, 1 or more \(got 0\)/, 'plot', 'leg/stand', '--cycles', '0');
    cad.refused(/--pose sitting: no such pose \(poses: standing\)/, 'plot', 'leg/stand', '--pose', 'sitting');
  } finally { done(); }
});

test('the quadruped\'s eight axes on one controller: cad machine reads the Mega 2560 and follows each motor\'s wire to its breakout and on to the Mega\'s slot', async () => {
  const { controllerOf, slotsOf, CONTROLLERS } = await import('../lib/machine.mjs');
  // the controller is the bought board the streamer runs on; none is the Uno under a CNC shield, as before the Mega
  assert.deepEqual([controllerOf({ items: [] }).board, controllerOf({ items: [] }).item], ['uno', null]);
  assert.deepEqual([controllerOf({ items: [{ id: 'mega', bought: 'arduino-mega-2560' }] }).board, CONTROLLERS['arduino-mega-2560'].slots.length], ['mega', 8]);
  assert.throws(() => controllerOf({ items: [{ id: 'shield', bought: 'cnc-shield-v3' }, { id: 'mega', bought: 'arduino-mega-2560' }] }), /items shield \(cnc-shield-v3\), mega \(arduino-mega-2560\): a machine streams through one controller/);
  // a motor's slot: its own wire straight to a shield's slot; or its wire to a breakout and the breakout's signal wire on to
  // the Mega; or its driver item's signal wire
  const a = { items: [{ id: 'm1', motor: {} }, { id: 'm2', motor: { driver: 'd2' } }, { id: 'm3', motor: {} }], wires: [
    { from: 'm1.connector', to: 'board1.top' }, { from: 'board1.centre', to: 'mega.S3' }, { from: 'd2.header', to: 'mega.S0' }, { from: 'm3.connector', to: 'shield.Y' }] };
  assert.deepEqual(slotsOf(a, CONTROLLERS['arduino-mega-2560']), { m1: 'S3', m2: 'S0' });
  assert.deepEqual(slotsOf(a, CONTROLLERS['cnc-shield-v3']), { m3: 'Y' });
  // the bench quadruped: the Mega, its eight axes in the slots' order, each on its own DRV8825
  const { ws, cad, done } = workspace({ printer: 'x1c' });
  const bench = fileURLToPath(new URL('../../examples/bench/', CAD));
  try {
    for (const d of ['rules', 'projects/leg']) fs.cpSync(path.join(bench, d), path.join(ws, d), { recursive: true });
    const m = JSON.parse(cad('machine', 'leg/quadruped', '--json'));
    assert.deepEqual([m.controller.board, m.controller.set, m.controller.item], ['mega', 'arduino-mega-2560', 'mega']);
    assert.deepEqual(m.axes.map((x) => `${x.name} ${x.slot} ${x.driver}`), ['fl_hd S0 fl_d1', 'fl_kd S1 fl_d2', 'fr_hd S2 fr_d1', 'fr_kd S3 fr_d2', 'bl_hd S4 bl_d1', 'bl_kd S5 bl_d2', 'br_hd S6 br_d1', 'br_kd S7 br_d2']);
    // the stand stays on its shield
    assert.deepEqual(JSON.parse(cad('machine', 'leg/stand', '--json')).controller, { board: 'uno', set: 'cnc-shield-v3', item: 'shield', slots: ['X', 'Y', 'Z'] });
    // the buy list: the Mega, eight breakouts, eight DRV8825s
    const l = JSON.parse(cad('list', 'leg/quadruped', '--json')), qty = (set) => l.bought.filter((b) => b.set === set).reduce((t, b) => t + b.qty, 0);
    assert.deepEqual([qty('arduino-mega-2560'), qty('driver-breakout'), qty('drv8825')], [1, 8, 8]);
  } finally { done(); }
});

test('the wiring sheet names a Mega slot\'s enable pin, not its home switch, on a driver\'s signal wire; a shield\'s axis keeps its limit pin', async () => {
  const { pinsAt } = await import('../lib/wires.mjs');
  const entries = (set, map) => Object.entries(map).map(([k, value]) => ({ name: `${set}.${k}`, value }));
  const mega = { id: 'mega', bought: { part: 'board', set: 'arduino-mega-2560' }, built: { entries: entries('arduino-mega-2560', { step_pin_s0: 'D22', dir_pin_s0: 'D37', limit_pin_s0: 'A8', enable_pin: 'D38' }) } };
  const shield = { id: 'shield', bought: { part: 'board', set: 'cnc-shield-v3' }, built: { entries: entries('cnc-shield-v3', { step_pin_x: 'D2', dir_pin_x: 'D5', limit_pin_x: 'D9', enable_pin: 'D8' }) } };
  const s = { objects: [mega, shield] };
  // a breakout's EN, STEP, DIR and GND go to S0: the switch on A8 is a wire of its own, and EN is D38 for every slot
  assert.equal(pinsAt({ from: 'fl_board1.centre', to: 'mega.S0' }, s), 'step D22, dir D37, enable D38 (every slot\'s)');
  // the shield's X plug carries its limit switch's pin, as before
  assert.equal(pinsAt({ from: 'm0.connector', to: 'shield.X' }, s), 'step D2, dir D5, limit D9');
  assert.equal(pinsAt({ from: 'psu.terminals', to: 'fl_board1.bottom' }, s), null);
});
