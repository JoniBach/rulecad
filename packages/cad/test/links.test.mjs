// cad's tests of cad link: model links, short or too long, and what a machine's link carries. The shared helpers are in ./helpers.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { workspace, object } from './helpers.mjs';

test('a link too long for chat says so, and how to get short ones', () => {
  const { ws, cad, done } = workspace();
  try {
    object(ws, 'demo/ball', { variables: { r: { value: 10, unit: 'mm', rule: 'Radius' }, n: { value: 256, unit: 'segments', rule: 'Smooth' } } },
      "import jscad from '@jscad/modeling'\nexport function main (v) { return jscad.transforms.translate([0, 0, v.r], jscad.primitives.sphere({ radius: v.r, segments: v.n })) }\n");
    const r = cad.run('link', 'demo/ball', '--md'); assert.equal(r.status, 0, r.out);
    assert.ok(/too long for chat or email\. For short links, add "shorten": "gist"/.test(r.stderr), 'the warning is on stderr'); // (no regex match: the link is huge)
    assert.equal(r.stdout.trim().split('\n').length, 1, '--md still prints one line');
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
    assert.equal(cad.run('plot', 'home/arm', 'square.svg').status, 0);
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
    cad.refused(/for joints other, elbow, and this machine's are shoulder, elbow: plot it again/, 'link', 'home/arm', '--steps', 'wrong.steps.json');
    assert.match(cad('preview', 'home/arm').trim(), /arm\.png$/, 'a preview takes the wires too');
    const { check } = await import('@rulecad/model-link');
    assert.equal(check({ q: 1, p: [], t: [], task: { tool: 1 } })[0].text, 'broken task', 'a link with bad task data is turned away');
    assert.equal(check({ q: 1, p: [], t: [], steps: { names: ['a'], spu: [1], start: [0], b: [[0, 1, 0, 'x']], drawn: [] } })[0].text, 'broken step file');
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
