// cad's tests of motors in an assembly: mounts, drives, slides and supplies. The shared helpers are in ./helpers.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { workspace, BIN } from './helpers.mjs';

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
    // set to that, the case runs cool enough (its rise goes as the current squared)
    const advised = /Set the driver to ([\d.]+) A/.exec(code(light, 'motor.heat')[0].text)[1];
    write('projects/home/assemblies/cool.json', arm({ current: Number(advised) }, { loads: [{ mass: 0.15, at: 'arm.tip' }] }));
    const cool = code(findings('cool'), 'motor.heat')[0];
    assert.equal(cool.level, 'pass', cool.text); assert.match(cool.text, new RegExp(`at ${advised.replace('.', '\\.')} A, under PLA's`));
    // and says the case's temperature is an estimate, the maker's rise scaled by the current squared
    assert.match(cool.text, /\(an estimate: nema17's [\d.]+ °C rise at rated current, scaled by the current squared \(its copper loss\), over a 25 °C room\)$/, cool.text);
    assert.match(code(light, 'motor.heat')[0].text, /°C at rated current \(an estimate: nema17's [\d.]+ °C rise at rated current, over a 25 °C room\), past where PLA softens/);
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
    // a slide fit, as a part printed in place needs: bore() draws a slide 5 + 2 × 0.05 + 0.1 = 5.2 mm across, 0.1 mm a
    // side; printed 0.1 mm smaller across (hole_comp), 0.05 mm a side is left. Its press bore, 5 − 2 × 0.02 + 0.1 =
    // 5.06 mm, 0.03 mm a side drawn, prints 0.02 mm a side tighter than the shaft: no slide, and no hoop check either
    hub('slid', {}, 'slide');
    const slid = code(findings('slid'), 'shaft.slide')[0];
    assert.equal(slid.level, 'pass', slid.text); assert.ok(Math.abs(slid.values.printed - 0.05) < 0.01, `${slid.values.printed}`); assert.equal(slid.values.holeComp, 0.1);
    hub('stuck', { press: 1 }, 'slide');
    const stuck = findings('stuck');
    assert.equal(code(stuck, 'shaft.slide')[0].level, 'fail'); assert.ok(Math.abs(code(stuck, 'shaft.slide')[0].values.printed + 0.02) < 0.01, JSON.stringify(code(stuck, 'shaft.slide')[0].values));
    assert.equal(code(stuck, 'shaft.hoop').length, 0, 'a slide is never pressed on');
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
    // fasten.count: the motor's four mounting screws on the shopping list, through its fit that fastens, a length sold that stays out of the motor's own thread
    const listed = cad('list', 'home/thin'); assert.match(listed, /\n\s+4 ×\s+M3x6 cap\s+[\d.]+ g each, [\d.]+ g\s+1 pack of 10, 6 spare\s+m on plate \(its mount, a fit that fastens\)/, listed);
    // thicker, and held right beside the motor: it passes, the stress against PLA's strength with a margin
    bracket('thick', { thick: 6, reach: 30 }, { at: 22, reach: 30 });
    const ok = findings('thick').find((x) => x.code === 'motor.mount' && x.values?.deflection != null);
    assert.equal(ok.level, 'pass', ok.text);
    assert.ok(ok.values.deflection < bent.values.deflection / 5 && ok.values.margin >= 2 && ok.values.stress > 0, JSON.stringify(ok.values));
    // the screws' engagement in the motor's tapped holes, for the screws as bought; in the order, counted, with the key that turns them
    const engaged = (a) => findings(a).filter((x) => x.code === 'motor.mount' && x.values?.engaged != null);
    const fine = engaged('thick'); assert.equal(fine.length, 1); assert.equal(fine[0].level, 'pass', fine[0].text);
    assert.match(fine[0].text, /^m on plate: 4 M3x10 cap screws through 6 mm of plate engage 4 mm of the motor's 4\.5 mm of M3 thread \(nema17\.mount_hole_depth\)/);
    assert.match(cad('order', 'home/thin'), /m to plate \(4 × M3x6 cap\) with a 2\.5 mm hex key/);
    // "screw": "M3x6" on the motor item: through 6 mm of plate it does not reach the motor's thread, and fails by name
    const short = JSON.parse(fs.readFileSync(path.join(ws, 'projects/home/assemblies/thick.json'), 'utf8'));
    short.items.find((x) => x.id === 'm').motor.screw = 'M3x6'; write('projects/home/assemblies/short.json', short);
    const bad = engaged('short'); assert.equal(bad.length, 1); assert.equal(bad[0].level, 'fail');
    assert.match(bad[0].text, /^m on plate: 4 M3x6 cap screws through 6 mm of plate do not reach the motor's thread: M3x6 cap ends at its face\. An M3x10 cap would engage 4 mm/);
    assert.match(cad('list', 'home/short'), /4 ×\s+M3x6 cap/, 'the screw the item names is the one listed');
    // "screw": "M3x10 hex": hexagon heads, bought and fitted as named, turned with a spanner on their 5.5 mm flats (ISO 4017's M3), not a hex key
    const hex = JSON.parse(fs.readFileSync(path.join(ws, 'projects/home/assemblies/thick.json'), 'utf8'));
    hex.items.find((x) => x.id === 'm').motor.screw = 'M3x10 hex'; write('projects/home/assemblies/hexhead.json', hex);
    assert.match(cad('list', 'home/hexhead'), /4 ×\s+M3x10 hex\s/);
    const hexOrder = cad('order', 'home/hexhead');
    assert.match(hexOrder, /m to plate \(4 × M3x10 hex\) with a 5\.5 mm socket or spanner/, hexOrder); assert.doesNotMatch(hexOrder, /hex key/);
    // printInPlace: the wall and the arm come off the bed as one print, so the order fits them as one step, first, and
    // the list gives them one row, their grams and minutes added (each part's own, summed: one print's)
    const alone = JSON.parse(cad('list', 'home/thick', '--json')).printed;
    write('projects/home/assemblies/pip.json', { ...hex, printInPlace: ['wall', 'arm'] });
    const steps = JSON.parse(cad('order', 'home/pip', '--json')).steps;
    assert.deepEqual(steps[0].items, ['wall', 'arm'], JSON.stringify(steps.map((x) => x.items)));
    assert.equal(steps.filter((x) => x.items.includes('wall') || x.items.includes('arm')).length, 1, 'one step for the one print');
    assert.match(cad('order', 'home/pip'), /1\. wall, arm, printed together in place \(one print\), first/);
    const rows = JSON.parse(cad('list', 'home/pip', '--json')).printed, row = rows.find((x) => x.inPlace);
    assert.deepEqual(row.inPlace, ['wall', 'arm']); assert.equal(rows.length, alone.length - 1, 'two rows become one');
    const sum = (k) => alone.filter((x) => x.id === 'wall' || x.id === 'arm').reduce((t, x) => t + x[k], 0);
    assert.ok(Math.abs(row.grams - sum('grams')) < 0.1, `${row.grams} g against ${sum('grams')}`); assert.ok(Math.abs(row.minutes - sum('minutes')) <= 1);
    assert.match(cad('list', 'home/pip'), /about \d+ min\s+wall, arm \(printed together in place: one print\)/);
  } finally { done(); }
});

test('a motor drives a joint in its own steps; a servo brings its range, and refuses more', async () => {
  const { motorDrives } = await import('../lib/motors.mjs'), { motorModel } = await import('@rulecad/motors');
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

test('a stepper on a supply: its torque at speed follows the supply\'s volts, not the 24 V default, and the working speed with it', () => {
  const { ws, cad, done } = workspace();
  const write = (f, x) => { fs.mkdirSync(path.dirname(path.join(ws, f)), { recursive: true }); fs.writeFileSync(path.join(ws, f), typeof x === 'string' ? x : JSON.stringify(x)); };
  const torque = (a) => { const r = JSON.parse(cad('check', `home/${a}`, '--json')); assert.ok(r.findings, JSON.stringify(r)); return r.findings.find((x) => x.code === 'motor.torque' && x.values); };
  try {
    write('projects/home/project.json', { name: 'home', material: 'PLA', objects: ['arm'] });
    write('projects/home/objects/arm.json', { name: 'arm', version: '0.1.0', anchors: { axis: { at: [0, 0, 0], axis: [0, 0, 1] }, tip: { at: [100, 0, 0], axis: [0, 0, 1] } }, variables: { long: { value: 110, unit: 'mm', rule: 'The arm' } } });
    write('projects/home/objects/arm.js', "import jscad from '@jscad/modeling'\nconst { cuboid } = jscad.primitives\nexport function main (v) { return cuboid({ size: [v.long, 6, 4], center: [v.long / 2 + 12, 0, 40] }) }\n");
    const arm = (motor, more = []) => ({ title: 'Arm', kind: 'fit', items: [{ id: 'm', motor: { model: '17HS4401', drives: 'j', current: 0.5, ...motor }, at: [0, 0, 0], rotate: [-90, 0, 0] }, { id: 'arm', object: 'arm' }, ...more],
      joints: [{ id: 'j', type: 'revolute', parent: { at: [0, 0, 0], axis: [0, 1, 0] }, child: 'arm.axis' }], loads: [{ joint: 'j', torque: 0.02 }] });
    const psu = { id: 'psu', bought: 'supply-12v', set: { output_current: 1.5 }, at: [400, 400, 0] };
    // The 17HS4401 (nema17's variant): 0.4 N m holding, 4.2 mH, 1.5 A, 200 full steps a turn. Moving, 0.4 / √2 = 0.2828 N m,
    // flat to the corner speed 60 V / (2 L I 200): at 24 V 60 × 24 / (2 × 0.0042 × 1.5 × 200) = 571.4 rpm, at 12 V 285.7 rpm.
    // At 300 rpm on 24 V it is still flat: 0.2828 × 0.5 / 1.5 = 0.0943 N m at 0.5 A. On 12 V it is past the corner:
    // 0.2828 × 285.7 / 300 = 0.2694 N m, × 0.5 / 1.5 = 0.0898 N m
    write('projects/home/assemblies/no-supply.json', arm({ speed: 300 }));
    write('projects/home/assemblies/on-12v.json', arm({ speed: 300 }, [psu]));
    const at24 = torque('no-supply'), at12 = torque('on-12v');
    assert.ok(Math.abs(at24.values.available - 0.4 / Math.SQRT2 / 3) < 1e-6, `${at24.values.available}: the default 24 V, flat at 300 rpm`);
    assert.equal(at24.values.supply, undefined); assert.doesNotMatch(at24.text, /supply's/);
    assert.ok(Math.abs(at12.values.available - (0.4 / Math.SQRT2) * (285.714 / 300) / 3) < 1e-5, `${at12.values.available}: past the 12 V corner`);
    assert.equal(at12.values.supply, 12); assert.match(at12.text, /at 300 rpm on its supply's 12 V/);
    // with no speed given, a stepper works at its corner speed, which is the supply's: 285.7 rpm on 12 V, not 571.4
    write('projects/home/assemblies/corner.json', arm({}, [psu]));
    const corner = torque('corner');
    assert.ok(Math.abs(corner.values.rpm - 60 * 12 / (2 * 0.0042 * 1.5 * 200)) < 0.01, String(corner.values.rpm));
    assert.ok(Math.abs(corner.values.available - 0.4 / Math.SQRT2 / 3) < 1e-6, 'flat to the corner, so the whole running torque there');
  } finally { done(); }
});
