// cad's tests of gears in an assembly: spur, planetary, worm and bevel. The shared helpers are in ./helpers.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { workspace, object } from './helpers.mjs';

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
    cad.refused(/sweep drive, -90 to 90° in 18 steps: .*pinion\.body hits wheel\.body/, 'check', 'demo/train', '--sweep', '--steps', '18');
    // axes too close: more than the backlash allows, said between them
    train(23.7, meshed);
    const close = JSON.parse(cad.refused('"mesh.centre"', 'check', 'demo/train', '--json')).findings.find((x) => x.code === 'mesh.centre' && x.text.startsWith('drive and wheel'));
    assert.equal(close.level, 'fail'); assert.match(close.text, /0\.3 mm closer than these gears need \(24 mm\): more than their 0\.15 mm of backlash allows, and the teeth jam/);
    assert.deepEqual(close.between.map((p) => p.map((x) => +x.toFixed(6))), [[0, 0, 2], [0, 23.7, 2]]);
    // what isn't a mesh
    train(24, { mesh: { with: 'nothing', module: 1, teeth: [18, 30] } });
    cad.refused(/joint wheel: mesh: "with" names the driving joint/, 'check', 'demo/train');
    train(24, { mesh: { with: 'drive', module: 1, teeth: [12, 30] } });
    cad.refused(/joint wheel: mesh: gearModel: 12 teeth at 20° are undercut/, 'check', 'demo/train');
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
    cad.refused(/✗ planet p2 can't mesh with the sun and the ring at once where it is/, 'check', 'box/gearbox');
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
    cad.refused(/worm\.body hits wheel\.body/, 'check', 'drive/box', '--sweep', '--steps', '16');
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
    cad.refused(/✗ .*the cones' apexes are 1 mm apart/, 'check', 'corner/pair');
  } finally { done(); }
});

test('a compound planetary whose planets mesh the output ring a tooth of their first step on: each planet takes the tooth that meshes both rings', () => {
  const { ws, cad, done } = workspace();
  const write = (f, x) => { fs.mkdirSync(path.dirname(path.join(ws, f)), { recursive: true }); fs.writeFileSync(path.join(ws, f), typeof x === 'string' ? x : JSON.stringify(x)); };
  try {
    // Sun 18, planets 21 on it and the held ring of 60, 18 on the output ring of 57 (the print-in-place shoulder's
    // teeth). With both steps drawn alike, a planet 120° round meshes the output ring only if
    // 120° × (1 + P2 S / (P1 R2)) is a whole number of the ring's pitches: 120 × (1 + 18 × 18 / (21 × 57)) = 152.48°,
    // 24.14 pitches of 6.316°. A tooth of the first step on (360 / 21 = 17.143°) turns the second step's phase by
    // (18 / 57) × 17.143 = 5.414°, which the 0.902° left over needs: 5.414 + 0.902 = 6.316, one pitch
    write('projects/home/project.json', { name: 'home', material: 'PLA', objects: ['sun', 'planet', 'held', 'out', 'speck'] });
    const gear = (name, js, anchors = { axis: { at: [0, 0, 0], axis: [0, 0, 1] } }, extra = {}) => { write(`projects/home/objects/${name}.json`, { name, version: '0.1.0', anchors, variables: { w: { value: 4, unit: 'mm', rule: 'Face' }, up: { value: 5, unit: 'mm', rule: 'The second stage' }, turn: { value: 9, unit: 'deg', rule: 'The held ring, in phase' }, rim: { value: 70, unit: 'mm', rule: 'Rim' }, c: { value: 19.5, unit: 'mm', rule: 'Centre' }, s: { value: 60, unit: 'deg', rule: 'Planets' } }, ...extra }); write(`projects/home/objects/${name}.js`, `import jscad from '@jscad/modeling'\nconst { translate } = jscad.transforms\nexport function main (v) { return ${js} }\n`); };
    gear('sun', 'v.gears.spur({ module: 1, teeth: 18, width: v.w })');
    gear('planet', 'v.ops.union(v.gears.spur({ module: 1, teeth: 21, width: v.w }), translate([0, 0, v.up], v.gears.spur({ module: 1, teeth: 18, width: v.w })))');
    gear('held', 'v.gears.internal({ module: 1, teeth: 60, width: v.w, rim: v.rim })', { axis: { at: [0, 0, 0], axis: [0, 0, 1], ref: ['cosd(turn)', '0 - sind(turn)', 0] } });
    gear('out', 'translate([0, 0, v.up], v.gears.internal({ module: 1, teeth: 57, width: v.w, rim: v.rim }))');
    gear('speck', 'jscad.primitives.sphere({ radius: 0.2, center: [0, 0, 0 - v.rim] })', { axis: { at: [0, 0, 0], axis: [0, 0, 1] }, a: { at: ['c', 0, 0], axis: [0, 0, 1] }, b: { at: ['0 - c / 2', 'c * sind(s)', 0], axis: [0, 0, 1] }, c: { at: ['0 - c / 2', '0 - c * sind(s)', 0], axis: [0, 0, 1] } }, { role: 'reference' });
    const box = (extra = {}) => ({ title: 'Compound', kind: 'fit', items: [{ id: 'held', object: 'held' }, { id: 'sun', object: 'sun' }, { id: 'carrier', object: 'speck' }, { id: 'p1', object: 'planet' }, { id: 'p2', object: 'planet' }, { id: 'p3', object: 'planet' }, { id: 'out', object: 'out' }],
      joints: [{ id: 'drive', type: 'revolute', parent: 'held.axis', child: 'sun.axis' }, { id: 'turn', type: 'revolute', parent: 'held.axis', child: 'carrier.axis' }, { id: 's1', type: 'revolute', parent: 'carrier.a', child: 'p1.axis' }, { id: 's2', type: 'revolute', parent: 'carrier.b', child: 'p2.axis' }, { id: 's3', type: 'revolute', parent: 'carrier.c', child: 'p3.axis' }, { id: 'o', type: 'revolute', parent: 'held.axis', child: 'out.axis' }],
      planetary: [{ sun: 'sun', carrier: 'carrier', ring: 'held', planets: ['p1', 'p2', 'p3'], drive: 'sun', module: 1, teeth: [18, 21, 60], output: { ring: 'out', planet: 18, teeth: 57 } }], poses: { home: { drive: 0 } }, ...extra });
    write('projects/home/assemblies/box.json', box());
    const r = JSON.parse(cad('check', 'home/box', '--json')), of = (c) => r.findings.filter((x) => x.code === c);
    assert.deepEqual(of('planetary.phase').filter((x) => x.level === 'fail').map((x) => x.text), [], 'every planet meshes both rings');
    assert.ok(!r.findings.some((x) => x.level === 'fail' && /overlap/.test(x.text)), r.findings.filter((x) => x.level === 'fail').map((x) => x.text).join('\n'));
    // printInPlace names items printed together; a name that isn't one is refused
    write('projects/home/assemblies/box.json', box({ printInPlace: ['held', 'sun', 'nope'] }));
    cad.refused(/printInPlace names "nope", which isn't an item \(held, sun, carrier, p1, p2, p3, out\)/, 'check', 'home/box');
  } finally { done(); }
});
