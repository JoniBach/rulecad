// cad's tests of guides on a frame: rails, carriages, V-wheels, belts and rods. The shared helpers are in ./helpers.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { workspace, BIN, ROOT_MODULES, CAD } from './helpers.mjs';

test('a table fastened to a guide\'s carriage by a fit, but placed where it stands, is said to be left behind by name; placed on the carriage it moves with it and its mass is carried', () => {
  const { ws, cad, done } = workspace();
  try {
    fs.mkdirSync(path.join(ws, 'projects/frame/assemblies'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'projects/frame/project.json'), JSON.stringify({ name: 'frame', material: 'PLA', objects: [] }));
    const beam = (id, from, to) => ({ id, beam: { profile: '2020-misumi-hfs5' }, from, to });
    const write = (at) => fs.writeFileSync(path.join(ws, 'projects/frame/assemblies/table.json'), JSON.stringify({ title: 'Table', kind: 'fit', gravity: [0, 0, -1],
      items: [beam('p1', [-10, 0, -120], [-10, 0, 80]), beam('p2', [310, 0, -120], [310, 0, 80]), beam('x1', [0, 0, 0], [300, 0, 0]), { id: 'table', bought: 'supply-24v', variant: 'LRS-50-24', at }],
      joins: [{ kind: 'blind', a: 'x1.a', b: 'p1.back@120' }, { kind: 'blind', a: 'x1.b', b: 'p2.front@120' }],
      guides: [{ kind: 'rods', on: 'x1.top', from: 50, length: 200, spacing: 40, height: 22.5, nut: 'drop-in' }],
      fits: [{ a: 'table', b: 'g1-carriage-1', fastens: true }] }));
    // placed where it stands: it would stay behind as the carriage slides, its 340 g not carried; said by name
    write([150, 0, 80]);
    const left = cad('check', 'frame/table');
    assert.match(left, /! table is fastened to g1-carriage-1 \(a fit that fastens\), but only g1-carriage-1 moves on g1-1: table is placed where it stands, so it stays there in every pose and its mass is left out of what g1-1 carries \(joint\.moment\)\. Place table on g1-carriage-1 by an anchor or an address/);
    assert.match(left, /g1-carriage-1 on g1: 59 g carried/);
    // placed on the carriage: it moves with it, its mass carried, and nothing is said
    write('g1-carriage-1.top');
    const on = cad('check', 'frame/table');
    assert.doesNotMatch(on, /is fastened to g1-carriage-1/); assert.match(on, /g1-carriage-1 on g1: 399 g carried/);
  } finally { done(); }
});

test('guides: an MGN12 rail on a 2020 beam lists its nuts and screws at its pitch, its carriage slides its travel in a sweep, and a carriage loaded past its moment rating fails', () => {
  const { ws, cad, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/slide', f);
    fs.mkdirSync(at('assemblies'), { recursive: true });
    fs.writeFileSync(at('project.json'), JSON.stringify({ name: 'slide', material: 'PLA', objects: [] }));
    const x1 = { id: 'x1', beam: { profile: '2020-misumi-hfs5' }, from: [0, 0, 0], to: [400, 0, 0] };
    const write = (name, a) => fs.writeFileSync(at(`assemblies/${name}.json`), JSON.stringify({ title: name, kind: 'fit', ...a }));
    // a long carriage with 2 kg 100 mm ahead of its middle; the printed jig parked past the rail's end
    write('axis', { items: [x1, { id: 'jig', fitting: { kind: 'rail-jig', profile: '2020-misumi-hfs5', rail: 'rail-mgn12' }, at: 'x1.top@375' }], fits: [{ a: 'jig', b: 'x1', fastens: true, note: 'snapped over x1' }],
      guides: [{ kind: 'rail', rail: 'rail-mgn12', carriage: 'MGN12H', on: 'x1.top', from: 50, length: 300 }], loads: [{ mass: 2, at: { item: 'g1-carriage-1', at: [100, 0, 13] } }] });
    // a standard carriage with 4 kg 400 mm ahead: 15.7 N m against its 13.72 N m pitch rating
    write('heavy', { items: [x1], guides: [{ kind: 'rail', rail: 'rail-mgn12', on: 'x1.top', from: 50, length: 300 }], loads: [{ mass: 4, at: { item: 'g1-carriage-1', at: [400, 0, 13] } }] });
    // an MGN7's M2 screws on a 2020, whose slot nuts start at M3; and an MGN12 run into a beam joined across its face
    write('small', { items: [x1], guides: [{ kind: 'rail', rail: 'rail-mgn7', on: 'x1.top', length: 200, from: 100 }] });
    write('crossed', { items: [x1, { id: 'y1', beam: { profile: '2020-misumi-hfs5' }, from: [300, 0, 10], to: [300, 0, 210] }], joins: [{ kind: 'blind', a: 'y1.a', b: 'x1.top@300' }], guides: [{ kind: 'rail', rail: 'rail-mgn12', on: 'x1.top', from: 20, length: 300 }] });
    const probe = (name) => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
      const lib = (f) => import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib')).href)} + '/' + f);
      const { buildAssembly, checkAssembly, sweep } = await lib('assembly.mjs'), { shoppingList } = await lib('list.mjs'), { terms } = await lib('task.mjs');
      const s = await buildAssembly('slide/${name}'), l = shoppingList(s), centre = (p) => { const t = p.triangles.flat(); return [0, 1, 2].map((k) => t.reduce((a, q) => a + q[k], 0) / t.length); };
      console.log(JSON.stringify({ joints: s.motion.joints.filter((j) => j.type !== 'fixed').map((j) => [j.id, j.type, j.dofs[0]]), poses: Object.keys(s.motion.poses),
        bought: l.bought.map((b) => [b.qty, b.set, b.variant, b.part, b.length ?? null]), fasteners: l.fasteners.map((x) => [x.qty, x.fastener]), printed: l.printed.map((p) => p.id),
        screws: s.parts.filter((p) => /^fasten-\\d+-screw/.test(p.name ?? '')).map((p) => +centre(p)[0].toFixed(2)).sort((a, b) => a - b),
        terms: s.motion.joints.some((j) => j.id === 'g1-1') ? terms(s, { names: ['g1-1'] })[0].terms.map((x) => [x.term, x.kind, x.value]) : [],
        sweep: s.motion.joints.some((j) => j.id === 'g1-1') ? sweep(s, { steps: 12 }).map(({ level, text, values }) => ({ level, text, values })) : [],
        findings: checkAssembly(s).map(({ level, code, text, values, refs }) => ({ level, code, text, values, refs })) }));
    `], { cwd: ws, encoding: 'utf8', env: { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') } }));
    const by = (r, code) => r.findings.filter((x) => x.code === code);
    const axis = probe('axis');
    // the rail and its carriage are bought; twelve M3 screws into twelve of the slot's own M3 nuts, 25 mm apart
    assert.deepEqual(axis.bought.filter((b) => b[1] === 'rail-mgn12'), [[1, 'rail-mgn12', 'MGN12H', 'carriage', null], [1, 'rail-mgn12', null, 'rail', 300]]);
    assert.deepEqual(axis.fasteners, [[12, 'M3x8 cap'], [12, 'slot-nut-6-misumi-m3-slide-in']]);
    assert.equal(axis.screws.length, 12); assert.deepEqual(axis.screws.slice(1).map((x, i) => +(x - axis.screws[i]).toFixed(2)), Array(11).fill(25));
    assert.deepEqual([axis.screws[0], axis.screws[11]], [62.5, 337.5], 'from 50 mm, 12.5 mm in from each end of the rail');
    assert.deepEqual([...new Set(by(axis, 'guide.fit').map((x) => x.level))], ['pass']);
    for (const code of ['fasten.holes', 'fasten.slot', 'fasten.length', 'fasten.engagement', 'fasten.seat']) assert.deepEqual([...new Set(by(axis, code).map((x) => x.level))], ['pass'], code);
    assert.deepEqual(axis.findings.filter((x) => x.level === 'fail' || (x.level === 'warn' && !/^(frame|fasten\.order)/.test(x.code))).map((x) => `${x.code} ${x.text}`), []);
    // its carriage on a sliding joint through the travel the lengths allow, both ends a pose; the sweep is clear
    assert.deepEqual(axis.joints, [['g1-1', 'prismatic', [0, 254.2, 0]]], 'from 0 to its travel, at 0 as drawn'); assert.ok(axis.poses.includes('g1-a') && axis.poses.includes('g1-b'));
    assert.deepEqual(axis.sweep.map((x) => [x.level, x.values.from, x.values.to]), [['pass', 0, 254.2]]);
    assert.match(by(axis, 'guide.travel')[0].text, /1 MGN12H, 45\.8 mm long with its seals, travel 254\.2 mm/);
    // its carriage's loads within its ratings: 2 kg 100 mm out pitches it 1.96 N m
    const [jm] = by(axis, 'joint.moment');
    assert.equal(jm.level, 'pass'); assert.ok(Math.abs(jm.values.moment[1] - 2 * 9.80665 * 0.1) < 0.01, `pitch ${jm.values.moment[1]}`); assert.equal(jm.refs.carriage, 'g1-carriage-1');
    // the rail's terms in the error budget, and the jig printed
    assert.deepEqual(axis.terms.map((x) => x.slice(0, 2)), [['rail parallelism', 'spec'], ['carriage play', 'spec'], ['beam straightness', 'spec'], ['beam sag', 'estimate']]);
    assert.match(by(axis, 'guide.budget')[0].text, /rail parallelism 0\.017 mm \(spec\), carriage play 0\.01 mm \(spec\)/);
    assert.deepEqual(axis.printed, ['jig']); assert.match(by(axis, 'guide.jig').find((x) => x.refs?.guide === 'g1').text, /"kind": "rail-jig"/); assert.match(by(axis, 'guide.jig').find((x) => /^jig/.test(x.text)).text, /centres the rail to within 0.4 mm/);
    // past its moment rating it fails, and says which
    const heavy = by(probe('heavy'), 'joint.moment')[0];
    assert.equal(heavy.level, 'fail'); assert.match(heavy.text, /g1-carriage-1 \(MGN12C\) on g1: .* MP 13\.72 .* past its pitch rating/); assert.ok(heavy.values.margin < 1);
    // a rail whose screws no slot nut takes: guide.fit says so, and no screws are guessed
    const small = probe('small');
    assert.match(by(small, 'guide.fit').find((x) => x.level === 'fail').text, /no M2 slot nut is made for slot-6-misumi: rail-mgn7's holes take M2, and the nuts there take M3, M4, M5/);
    assert.deepEqual(small.fasteners, []);
    // a rail run into a beam joined across its face fails, naming the join
    assert.match(by(probe('crossed'), 'guide.fit').find((x) => x.level === 'fail').text, /runs into y1 joined at x1\.top@300 at 290 to 310 mm/);
    // refused by name
    write('bad', { items: [x1], guides: [{ kind: 'belt', rail: 'rail-mgn12', on: 'x1.top', length: 300 }] });
    cad.refused(/guide 1: a belt guide has no "rail": it takes id, kind, guide, motor|guides\/0/, 'check', 'slide/bad');
    write('bad', { items: [x1], guides: [{ kind: 'chain', on: 'x1.top', length: 300 }] });
    cad.refused(/guide 1: kind is rail \(a miniature linear rail\), wheels .* or belt .*|guides\/0\/kind/, 'check', 'slide/bad');
    write('bad', { items: [x1], guides: [{ kind: 'rail', rail: 'rail-mgn12', on: 'x1.top@20', length: 300 }] });
    cad.refused(/guide 1: on is a beam's slotted face, as x1\.top; where along it is "from"/, 'check', 'slide/bad');
    write('bad', { items: [x1], guides: [{ kind: 'rail', rail: 'rail-mgn12', on: 'x1.top', from: 200, length: 300 }] });
    cad.refused(/guide 1: the rail runs from 200 to 500 mm along x1, which is 400 mm long/, 'check', 'slide/bad');
    write('bad', { items: [x1], guides: [{ kind: 'rail', rail: 'rail-mgn12', carriage: 'MGN12X', on: 'x1.top', length: 300 }] });
    cad.refused(/guide 1: rail-mgn12 has no carriage "MGN12X": it has MGN12C, MGN12H/, 'check', 'slide/bad');
    write('bad', { items: [x1], guides: [{ kind: 'rail', rail: 'rail-mgn12', on: 'x1.top', length: 300, speed: 3 }] });
    cad.refused(/guide 1: a rail guide has no "speed"|guides\/0.*speed/, 'check', 'slide/bad');
  } finally { done(); }
});

test('guides: a carriage on V-wheels for a V-slot 2040 comes from the profile\'s rules, rolls its travel in a sweep clear of the beam, and the same guide on a plain T-slot is refused with why; a printed slider slides its stretch', () => {
  const { ws, cad, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/roll', f);
    fs.mkdirSync(at('assemblies'), { recursive: true });
    fs.writeFileSync(at('project.json'), JSON.stringify({ name: 'roll', material: 'PLA', objects: [] }));
    const beam = (profile) => ({ id: 'x1', beam: { profile }, from: [0, 0, 0], to: [500, 0, 0] });
    const write = (name, a) => fs.writeFileSync(at(`assemblies/${name}.json`), JSON.stringify({ title: name, kind: 'fit', ...a }));
    // four solid wheels under a plate over the top face, rolling along 400 mm of it; 1 kg 20 mm over the plate
    write('wheels', { items: [beam('2040-openbuilds')], guides: [{ kind: 'wheels', wheel: 'v-wheel-solid', on: 'x1.top', from: 50, length: 400 }], loads: [{ mass: 1, at: { item: 'g1-carriage-1', at: [0, 0, 20] } }] });
    // 3 kg held 200 mm out ahead of the plate pitches it past its wheels' ratings
    write('heavy', { items: [beam('2040-openbuilds')], guides: [{ kind: 'wheels', on: 'x1.top', from: 50, length: 400 }], loads: [{ mass: 3, at: { item: 'g1-carriage-1', at: [200, 0, 20] } }] });
    // the same guide on MISUMI's 2040, a plain T-slot; and a printed slider over the V-slot's first top slot
    write('plain', { items: [beam('2040-misumi-hfs5')], guides: [{ kind: 'wheels', wheel: 'v-wheel-solid', on: 'x1.top', from: 50, length: 400 }] });
    write('slider', { items: [beam('2040-openbuilds')], guides: [{ kind: 'slider', on: 'x1.top.1', from: 100, length: 200, size: 40 }] });
    const probe = (name) => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
      const lib = (f) => import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib')).href)} + '/' + f);
      const { buildAssembly, checkAssembly, sweep, overlap } = await lib('assembly.mjs'), { shoppingList } = await lib('list.mjs');
      const { default: jscad } = await import(${JSON.stringify(pathToFileURL(path.join(ROOT_MODULES, '@jscad/modeling/src/index.js')).href)});
      const s = await buildAssembly('roll/${name}'), l = shoppingList(s), j = s.motion.joints.find((x) => x.id === 'g1-1');
      const solidOf = (id) => { const p = s.parts.find((x) => x.item === id); return p && (p.collide ?? p.geometry); }, wh = solidOf('g1-wheel-1');
      const box = (id) => { const t = s.parts.filter((p) => p.item === id).flatMap((p) => p.triangles.flat()); return [0, 1, 2].map((k) => [Math.min(...t.map((q) => q[k])), Math.max(...t.map((q) => q[k]))].map((x) => +x.toFixed(3))); };
      console.log(JSON.stringify({ joints: s.motion.joints.filter((j) => j.type !== 'fixed').map((j) => [j.id, j.type, j.dofs[0]]), poses: Object.keys(s.motion.poses),
        bought: l.bought.map((b) => [b.qty, b.set, b.part]), fasteners: l.fasteners.map((x) => [x.qty, x.fastener]), printed: l.printed.map((p) => [p.id, p.grams]),
        boxes: Object.fromEntries(['g1-carriage-1', 'g1-wheel-1', 'g1-wheel-3'].map((id) => [id, box(id)])),
        sweep: j ? sweep(s, { steps: 12 }).map(({ level, text, values }) => ({ level, text, values })) : [],
        into: wh ? [0, 0.3].map((dy) => +overlap(jscad.transforms.translate([0, dy, 0], wh), solidOf('x1')).toFixed(3)) : null,
        stop: wh ? (() => { const bb = jscad.measurements.measureBoundingBox(wh); return +overlap(wh, jscad.primitives.cuboid({ size: [bb[1][0] - bb[0][0], 1, 4], center: [(bb[0][0] + bb[1][0]) / 2, -19.5, 0] })).toFixed(3); })() : null,
        findings: checkAssembly(s).map(({ level, code, text, values, refs }) => ({ level, code, text, values, refs })) }));
    `], { cwd: ws, encoding: 'utf8', env: { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') } }));
    const by = (r, code) => r.findings.filter((x) => x.code === code);
    const w = probe('wheels');
    // from the profile's rules: the wheels' seats in the tracks of the front and back faces, both passing guide.fit
    assert.deepEqual(by(w, 'guide.fit').map((x) => [x.level, x.values.axle, x.values.depth]), [['pass', 10.32, 1.63], ['pass', 10.32, 1.63]]);
    assert.match(by(w, 'guide.fit')[0].text, /v-wheel-solid runs in slot-6-openbuilds's V track on profile-2040-openbuilds's front face/);
    // the plate is printed, the four wheels bought, their screws, nuts, washers and spacers on the list
    assert.deepEqual(w.printed.map((p) => p[0]), ['g1-carriage-1']); assert.ok(w.printed[0][1] > 5);
    assert.deepEqual(w.bought.filter((b) => b[2] === 'wheel'), [[4, 'v-wheel-solid', 'wheel']]);
    for (const x of [[4, 'M5x30 cap'], [4, 'M5 lock nut'], [2, 'M5 washer'], [2, 'eccentric-6-openbuilds'], [2, 'spacer 10 x 6 mm']]) assert.ok(w.fasteners.some((f) => f[0] === x[0] && f[1] === x[1]), `${x[1]}: ${JSON.stringify(w.fasteners)}`);
    // the wheels stand either side of the 40 mm beam, their axles 20 + 10.32 out, their middles 10 mm under the top face
    const mid = (id, k) => (w.boxes[id][k][0] + w.boxes[id][k][1]) / 2;
    assert.equal(w.boxes['g1-carriage-1'][2][0], 11.5, 'the plate stands 1.5 mm over the top face, at z = 10');
    assert.deepEqual([mid('g1-wheel-1', 1), mid('g1-wheel-3', 1)], [-30.32, 30.32]); assert.equal(mid('g1-wheel-1', 2), 3, 'a fixed wheel from 5.5 under the beam\'s middle up its spacer to the plate');
    // it rolls its travel, from 0 to the stretch less its 63.9 mm over its wheels, both ends a pose; the sweep is clear of the beam
    assert.deepEqual(w.joints, [['g1-1', 'prismatic', [0, 336.1, 0]]]); assert.ok(w.poses.includes('g1-a') && w.poses.includes('g1-b'));
    assert.deepEqual(w.sweep.map((x) => [x.level, x.values.from, x.values.to]), [['pass', 0, 336.1]]);
    // the overlap check sees the whole wheel against the beam's envelope less its tracks: clear where it seats, and 0.3 mm
    // further in (toward the beam, +y for the front side's w1), its rim in the beam
    assert.equal(w.into[0], 0); assert.ok(w.into[1] > 1, `0.3 mm into the beam: ${w.into[1]} mm³`);
    // and a part across the track's line (a block 1 mm into the front face where w1 rolls, as an end cap or a crossing
    // beam would be) is found in the wheel's rim: the rim inside the face is part of what is checked
    assert.ok(w.stop > 1, `a block in the track's line: ${w.stop} mm³`);
    assert.match(by(w, 'guide.travel')[0].text, /a plate on 4 v-wheel-solid wheels over x1's top face, 63\.9 mm long over its wheels, rolls from 50 to 450 mm along x1: travel 336\.1 mm/);
    // its wheels carry what is on it: 1 kg along their axles, a quarter each with the plate's own weight
    const [jm] = by(w, 'joint.moment');
    assert.equal(jm.level, 'pass'); assert.equal(jm.refs.carriage, 'g1-carriage-1'); assert.ok(jm.values.carried > 1 && jm.values.carried < 1.2, `carried ${jm.values.carried}`);
    // the one warning: the seat is 0.94 mm wider than OpenBuilds' own plate, more than the eccentrics' 0.79 mm can take up
    assert.deepEqual(w.findings.filter((x) => x.level === 'fail' || (x.level === 'warn' && !/^(frame|motor\.loads)/.test(x.code))).map((x) => `${x.code} ${x.values?.difference ?? ''}`), ['guide.seat 0.94']);
    // overloaded, it fails and names its most loaded wheel
    const heavy = by(probe('heavy'), 'joint.moment')[0];
    assert.equal(heavy.level, 'fail'); assert.match(heavy.text, /its most loaded wheel, w\d, takes .* past its rating/); assert.ok(heavy.values.margin < 1);
    // the same guide on a plain T-slot is refused, with why
    cad.refused(/guide 1: wheels are refused on profile-2040-misumi-hfs5 under its top face: profile-2040-misumi-hfs5's front face has slot-6-misumi, a plain T-slot with no V track .*: a V-wheel's flanks need a V to run on and centre in/, 'check', 'roll/plain');
    // a printed slider: its clearance the printer's fit, its friction said to rest on a working figure; it slides its stretch less its 40 mm
    const sl = probe('slider');
    assert.deepEqual(sl.joints, [['g1-1', 'prismatic', [0, 160, 0]]]); assert.deepEqual(sl.sweep.map((x) => [x.level, x.values.to]), [['pass', 160]]);
    assert.match(by(sl, 'guide.friction')[0].text, /PLA on anodised aluminium taken as μ 0\.3/); assert.match(by(sl, 'guide.clearance')[0].text, /0\.2 mm clear a side/);
    // refused by name
    write('bad', { items: [beam('2040-openbuilds')], guides: [{ kind: 'wheels', on: 'x1.top.2', length: 400 }] });
    cad.refused(/guide 1: on is the face the plate lies over, as x1\.top/, 'check', 'roll/bad');
    write('bad', { items: [beam('2040-openbuilds')], guides: [{ kind: 'wheels', on: 'x1.top', length: 60 }] });
    cad.refused(/guide 1: its carriage is 63\.9 mm long over its wheels, so a 60 mm stretch leaves it no travel/, 'check', 'roll/bad');
    write('bad', { items: [beam('2040-openbuilds')], guides: [{ kind: 'wheels', rail: 'rail-mgn12', on: 'x1.top', length: 400 }] });
    cad.refused(/guide 1: a wheels guide has no "rail"|guides\/0/, 'check', 'roll/bad');
  } finally { done(); }
});

test('guides: a belt X axis on a 2020 built by the edit commands, an MGN12H carriage on a GT2 belt from a NEMA 17, checks clean; its motor margin, travel a turn and belt length agree with hand sums; a moved idler rubs and a long belt uses up the tensioner, each by name', () => {
  const { ws, cad, done } = workspace();
  try {
    const run = (...a) => { const out = cad(...a); assert.doesNotMatch(out, /✗|exit 1|Error/, `cad ${a.join(' ')}: ${out}`); return out; };
    run('new', 'axes', '--material', 'PLA', '--printer', 'x1c');
    run('new', 'axes/x-belt', '--assembly', '--title', 'A belt X axis on a 2020');
    run('add', 'item', 'axes/x-belt', 'id=x1', 'beam.profile=2020-misumi-hfs5', 'from=[0,0,0]', 'to=[400,0,0]');
    run('add', 'guide', 'axes/x-belt', '--kind', 'rail', 'rail=rail-mgn12', 'carriage=MGN12H', 'on=x1.top', 'from=30', 'length=300');
    run('add', 'guide', 'axes/x-belt', '--kind', 'belt', 'guide=g1', 'motor.model=nema17', 'motor.microsteps=16', 'motor.current=1.2', 'accel=3000');
    run('add', 'load', 'axes/x-belt', 'mass=0.5', 'at=g1-carriage-1.top');
    // the commands write the bench example's file (examples/bench axes/x-belt), line for line (a Windows checkout
    // gives the example CRLF line endings; the commands write LF, as every file the kit writes)
    const benchFile = path.join(path.dirname(ROOT_MODULES), 'examples/bench/projects/axes/assemblies/x-belt.json'), lf = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
    assert.equal(lf(path.join(ws, 'projects/axes/assemblies/x-belt.json')), lf(benchFile));
    // the same axis with its idler moved 12 mm across, and with its belt cut 22 mm long
    const dir = path.join(ws, 'projects/axes/assemblies');
    for (const n of ['x-moved', 'x-long']) fs.copyFileSync(path.join(dir, 'x-belt.json'), path.join(dir, `${n}.json`));
    run('set', 'axes/x-moved', 'g2.across=12'); run('set', 'axes/x-long', 'g2.cut=830');
    // a belt names a rail guide by its id: refused by name, nothing written
    const before = fs.readFileSync(path.join(dir, 'x-belt.json'), 'utf8');
    cad.refused(/no guide "g9"/, 'add', 'guide', 'axes/x-belt', '--kind', 'belt', 'guide=g9', 'motor.model=nema17');
    assert.equal(fs.readFileSync(path.join(dir, 'x-belt.json'), 'utf8'), before);
    // (a file, not node -e: the motor mount's finite elements start worker threads, which hang under -e)
    const probe = (name) => { fs.writeFileSync(path.join(ws, 'probe.mjs'), `
      const lib = (f) => import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib')).href)} + '/' + f);
      const { buildAssembly, checkAssembly } = await lib('assembly.mjs'), { shoppingList } = await lib('list.mjs'), { terms } = await lib('task.mjs'), { motorModel, performance } = await import('@rulecad/motors');
      const s = await buildAssembly('axes/${name}'), findings = checkAssembly(s), l = shoppingList(s);
      console.log(JSON.stringify({ bought: l.bought.map((b) => [b.qty, b.set, b.part, b.length ?? null]), printed: l.printed.map((p) => [p.id, p.grams]), fasteners: l.fasteners.map((x) => [x.qty, x.fastener]),
        terms: terms(s, { names: ['g1-1'] })[0].terms.map((x) => [x.term, x.kind, x.value]), torque600: performance(motorModel('nema17'), { speed: 600 }).motor.torque,
        findings: findings.map(({ level, code, text, values, refs }) => ({ level, code, text, values, refs })) }));
      process.exit(0);
    `); return JSON.parse(execFileSync(process.execPath, [path.join(ws, 'probe.mjs')], { cwd: ws, encoding: 'utf8', maxBuffer: 1 << 26, env: { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') } })); };
    const by = (r, code) => r.findings.filter((x) => x.code === code), bad = (r) => r.findings.filter((x) => x.level === 'fail' || x.level === 'warn').map((x) => `${x.code} ${x.text}`);
    const axis = probe('x-belt');
    assert.deepEqual(bad(axis), [], 'the belt axis checks clean');
    // the parts it placed: the plate, the clamp and the idler block printed; the belt bought by the metre, its pulley and idler
    assert.deepEqual(axis.printed.map((p) => p[0]), ['g2-plate', 'g2-clamp', 'g2-idler-block']);
    assert.deepEqual(axis.bought.filter((b) => ['belt', 'pulley', 'idler', 'motor'].includes(b[2])).map((b) => [b[1], b[3]]), [['gt2-belt-6', 1000], ['idler-gt2-toothed-20', null], ['nema17', null], ['pulley-gt2-20', null]]);
    // (the rail's twelve M3x8 and the clamp's two: 3.2 mm into the carriage's thread, 4.8 under each head)
    for (const f of ['14 × M3x8 cap', '2 × M5x12 cap', '3 × M5x16 cap', '1 × M5 heat-set insert']) assert.ok(axis.fasteners.some(([q, n]) => `${q} × ${n}` === f), `${f}: ${JSON.stringify(axis.fasteners)}`);
    // travel a turn: 20 teeth × 2 mm = 40 mm; at the NEMA 17's working 600 rpm, 600 / 60 × 40 = 400 mm/s
    assert.equal(by(axis, 'guide.drive')[0].values.mmPerTurn, 40);
    assert.match(by(axis, 'motor.speed')[0].text, /moves at 400 mm\/s with g2-motor at 600 rpm/);
    // the motor's margin by hand: it pushes the carriage (54 g), the clamp and the 0.5 kg load at 3000 mm/s²,
    // F = (0.5 + 0.054 + clamp) × 3; the motor gives its torque at 600 rpm, scaled by 1.2 A of its rated 2 A, through the
    // belt's 0.95 at a 40 / 2π = 6.366 mm pitch radius: F_avail = τ × 0.6 × 0.95 × 2π × 1000 / 40
    const clamp = axis.printed.find((p) => p[0] === 'g2-clamp')[1] / 1000, need = ((0.5 + 0.054 + clamp) * 3000) / 1000, give = (axis.torque600 * 0.6 * 0.95 * 2 * Math.PI * 1000) / 40;
    const mt = by(axis, 'motor.torque').find((x) => x.values?.margin != null);
    assert.ok(Math.abs(mt.values.needed - need) < 0.01, `${mt.values.needed} N needed against ${need} by hand`);
    assert.ok(Math.abs((mt.values.available * 2 * Math.PI * 1000) / 40 - give) < 0.05, `${mt.text} against ${give} N by hand`);
    assert.ok(Math.abs(mt.values.margin - give / need) < 0.05 && mt.level === 'pass', mt.text);
    // the belt's length by hand: the runs twice from the pulley at x = -22.15 to the idler at 364, less the 2 mm between
    // its ends in the clamp, half round each 12.73 mm pitch circle: 2 × 386.15 - 2 + π × 12.731 = 810.296 mm; cut 808 mm
    const bl = by(axis, 'belt.length')[0].values;
    assert.ok(Math.abs(bl.path - (2 * (364 + 22.15) - 2 + Math.PI * 12.731)) < 0.01, `${bl.path}`);
    assert.deepEqual([bl.cut, bl.buy], [808, 1000]);
    for (const code of ['belt.tension', 'belt.rub', 'belt.line', 'belt.tensioner', 'motor.axis']) assert.deepEqual([...new Set(by(axis, code).map((x) => x.level))], ['pass'], code);
    // the error budget: a 1.8° step at 1/16 over 40 mm a turn is 1.8 / 16 / 360 × 40 = 0.0125 mm; the belt's stretch is
    // the push over its stiffness, F × span / 16902 (2817 N a unit of strain a mm, 6 mm wide)
    const st = by(axis, 'belt.stretch')[0].values, terms = Object.fromEntries(axis.terms.map(([t, , v]) => [t, v]));
    assert.ok(Math.abs(terms.step - 0.0125) < 1e-9, `${terms.step}`);
    assert.ok(Math.abs(terms['belt stretch'] - (need * st.span) / (2817 * 6)) < 1e-4, `${terms['belt stretch']}`);
    // the idler 12 mm across: off square, and its return run rubs the clamp toward the far end of the travel
    const moved = probe('x-moved');
    assert.deepEqual(by(moved, 'belt.rub').map((x) => [x.level, x.refs.run, x.refs.part]), [['fail', 'the return run', 'the clamp']]);
    assert.equal(by(moved, 'belt.line')[0].level, 'fail');
    // cut 830 mm, the belt reaches its tension only with the block (830 × 1.001479 - 810.296) / 2 = 10.47 mm toward the
    // beam's end, past the 4 mm of slot left there
    const long = probe('x-long'), tn = by(long, 'belt.tensioner')[0];
    assert.equal(tn.level, 'fail'); assert.match(tn.text, /the tensioner's travel is used up; cut the belt/);
    assert.ok(Math.abs(tn.values.offset - (830 * (1 + 25 / 16903) - 810.296) / 2) < 0.01, `${tn.values.offset}`);
  } finally { done(); }
});

test('guides: a belt Z axis adds the push at its acceleration to the weight, in the motor\'s need and the belt\'s spans; an MGN12C clamp on a 16-tooth pulley engages the carriage\'s thread with room; a part on the carriage across the return run rubs by name, and a higher belt clears it', () => {
  const { ws, done } = workspace();
  try {
    const dir = path.join(ws, 'projects/ax');
    fs.mkdirSync(path.join(dir, 'assemblies'), { recursive: true }); fs.mkdirSync(path.join(dir, 'objects'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ name: 'ax', material: 'PLA', printer: 'x1c', objects: ['pad'] }));
    // a 20 × 8 mm pad on the carriage's top, over its free holes' side (y = -9 across, as the belt's frame has it)
    fs.writeFileSync(path.join(dir, 'objects/pad.json'), JSON.stringify({ name: 'pad', title: 'Pad', version: '0.1.0', engine: 'manifold', variables: { thick: { value: 6, unit: 'mm', rule: 'Its thickness', tweak: [1, 20] } } }));
    fs.writeFileSync(path.join(dir, 'objects/pad.js'), "import jscad from '@jscad/modeling'\nconst { cuboid } = jscad.primitives\nexport function main (v) { return cuboid({ size: [20, 8, v.thick], center: [0, -9, v.thick / 2] }) }\n");
    const write = (name, a) => fs.writeFileSync(path.join(dir, `assemblies/${name}.json`), JSON.stringify({ title: name, kind: 'fit', ...a }));
    const beam = (id, from, to, profile = '2020-misumi-hfs5') => ({ id, beam: { profile }, from, to });
    // upright: a 2020 400 mm tall, an MGN12C rail on its front face, 1 kg on the carriage
    for (const accel of [1000, 5000]) write(`z${accel}`, { items: [beam('b1', [0, 0, 0], [0, 0, 400])], guides: [{ kind: 'rail', id: 'r_1', rail: 'rail-mgn12', on: 'b1.front', from: 40, length: 300 }, { kind: 'belt', id: 'zb', guide: 'r_1', motor: { model: 'nema17', current: 1.2 }, accel }], loads: [{ mass: 1, at: 'r_1-carriage-1.top' }] });
    // level: a 2040 along y, an MGN12C rail on top.2, a 16-tooth pulley at 30 N, 1.2 kg on the carriage
    write('y16', { items: [beam('beam_y', [10, 0, 5], [10, 500, 5], '2040-misumi-hfs5')], guides: [{ kind: 'rail', id: 'lin', rail: 'rail-mgn12', carriage: 'MGN12C', on: 'beam_y.top.2', from: 45, length: 350 }, { kind: 'belt', id: 'drv', guide: 'lin', pulley: 'pulley-gt2-16', tension: 30, accel: 2000, motor: { model: 'nema17', current: 1.2 } }], loads: [{ mass: 1.2, at: 'lin-carriage-1.top' }] });
    // the bench's X axis with the pad screwed to the carriage, then with the belt raised to 23 mm
    const x = (belt) => ({ items: [beam('x1', [0, 0, 0], [400, 0, 0]), { id: 'pad', object: 'pad', at: 'g1-carriage-1.top' }], guides: [{ kind: 'rail', rail: 'rail-mgn12', carriage: 'MGN12H', on: 'x1.top', from: 30, length: 300 }, { kind: 'belt', guide: 'g1', motor: { model: 'nema17', microsteps: 16, current: 1.2 }, accel: 3000, ...belt }], loads: [{ mass: 0.5, at: 'g1-carriage-1.top' }], fits: [{ a: 'pad', b: 'g1-carriage-1', fastens: true, note: 'On its free holes' }] });
    write('xpad', x({})); write('xhigh', x({ height: 23 }));
    // (a file, not node -e: the motor mount's finite elements start worker threads, which hang under -e)
    const probe = (name) => { fs.writeFileSync(path.join(ws, 'probe.mjs'), `
      const lib = (f) => import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib')).href)} + '/' + f);
      const { buildAssembly, checkAssembly } = await lib('assembly.mjs');
      const s = await buildAssembly('ax/${name}'), findings = checkAssembly(s);
      console.log(JSON.stringify(findings.map(({ level, code, text, values, refs }) => ({ level, code, text, values, refs }))));
      process.exit(0);
    `); return JSON.parse(execFileSync(process.execPath, [path.join(ws, 'probe.mjs')], { cwd: ws, encoding: 'utf8', maxBuffer: 1 << 26, env: { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') } })); };
    const by = (r, code) => r.filter((x) => x.code === code), bad = (r) => r.filter((x) => x.level === 'fail' || x.level === 'warn').map((x) => `${x.code} ${x.text}`);
    // upright, by hand: the carriage, its clamp and the 1 kg weigh m = W / 9.80665 (W the weight belt.tension reads, about
    // 1.038 kg); the motor lifts all of it and pushes it at a, both the same way at worst: m × 9.80665 + m × a / 1000 N,
    // 10.18 + 5.19 = 15.37 N at 5000 mm/s², 10.18 + 1.04 = 11.22 N at 1000; it grows with a, by m × 4 N between them
    const need = {}, spans = {}; let kg = 0;
    for (const a of [1000, 5000]) {
      const r = probe(`z${a}`), t = by(r, 'belt.tension')[0].values, m = t.weight / 9.80665, mt = by(r, 'motor.torque').find((q) => q.values?.margin != null);
      assert.ok(Math.abs(m - 1.038) < 0.002, `${m} kg carried`);
      assert.ok(Math.abs(t.push - (m * a) / 1000) < 1e-6, `${t.push} N push at ${a}`);
      assert.ok(Math.abs(mt.values.needed - (m * 9.80665 + (m * a) / 1000)) < 0.01, `${mt.text}: ${m * 9.80665 + (m * a) / 1000} N by hand`);
      need[a] = mt.values.needed; spans[a] = [t.slack, t.tight]; kg = m;
      // the spans: 25 N each less and more half the weight and the push, 25 ∓ (W + push) / 2
      assert.ok(Math.abs(t.slack - (25 - (t.weight + t.push) / 2)) < 1e-9 && Math.abs(t.tight - (25 + (t.weight + t.push) / 2)) < 1e-9, JSON.stringify(t));
      assert.ok(Math.abs(by(r, 'belt.stretch')[0].values.force - (t.weight + t.push)) < 1e-9, 'the stretch under the weight and the push');
    }
    assert.ok(Math.abs(need[5000] - 15.37) < 0.02 && Math.abs(need[5000] - need[1000] - kg * 4) < 0.01, JSON.stringify(need));
    assert.ok(Math.abs(spans[5000][0] - 17.32) < 0.02 && Math.abs(spans[5000][1] - 32.68) < 0.02, JSON.stringify(spans));
    // level, MGN12C on a 16-tooth pulley: the clamp's two M3x8 go 3.2 mm into the carriage's 3.5 mm thread, a layer past
    // the 3 mm steel's least asks, and the axis checks clean
    const y = probe('y16'), eg = by(y, 'fasten.engagement').find((q) => /clamp/.test(q.text));
    assert.deepEqual([eg.level, eg.values.engaged], ['pass', 3.2]);
    assert.deepEqual(bad(y), []);
    // the 6 mm pad on the carriage's top (13 to 19 mm over the face) reaches 19 - (19.4 - 3) = 2.6 mm into the return run's
    // band: a fail by name, which says the height that clears it by 1 mm, 19 + 3 + 1 = 23
    const rub = by(probe('xpad'), 'belt.rub');
    assert.deepEqual(rub.map((q) => [q.level, q.refs.run, q.refs.part, q.values.depth, q.values.height]), [['fail', 'the return run', 'pad', 2.6, 23]]);
    assert.match(rub[0].text, /rubs pad, which g1-carriage-1 carries, 2\.6 mm into its box .* Raise the belt over it with "height": 23/);
    // raised to 23 mm: the pad clears the band by 23 - 3 - 19 = 1 mm, the pulley 3.6 mm further up its shaft, all clean
    const high = probe('xhigh'), ok = by(high, 'belt.rub')[0];
    assert.deepEqual([ok.level, ok.values.clearance, ok.values.under, ok.refs.carried], ['pass', 1, 7, ['pad']]);
    assert.deepEqual(bad(high), []);
  } finally { done(); }
});

test('guides: chapter 13\'s Z axis rebuilt on a beam, its rods, screw, motor and endstop all placed by addresses, gives its motor checks the same margin; a screw drives only rods, and an endstop out of reach is refused with where it would go', () => {
  const { ws, cad, done } = workspace();
  try {
    // chapter 13's own Z axis, as EXAMPLES.md writes it: its rules, its frame and carriage, its assembly
    const text = fs.readFileSync(fileURLToPath(new URL('./EXAMPLES.md', CAD)), 'utf8').replace(/\r\n/g, '\n'), want = ['rules/lift.json', 'projects/arm/objects/zframe.js', 'projects/arm/objects/zframe.json', 'projects/arm/objects/zcar.js', 'projects/arm/objects/zcar.json', 'projects/arm/assemblies/arm-z.json'];
    for (const [, info, body] of text.matchAll(/^```(\S*(?: \S+)?)\n([\s\S]*?)^```$/gm)) { const f = info.split(' ')[1]; if (want.includes(f)) { fs.mkdirSync(path.dirname(path.join(ws, f)), { recursive: true }); fs.writeFileSync(path.join(ws, f), body); } }
    for (const f of want) assert.ok(fs.existsSync(path.join(ws, f)), `${f} is in chapter 13`);
    fs.writeFileSync(path.join(ws, 'projects/arm/project.json'), JSON.stringify({ name: 'arm', material: 'PLA', objects: ['zframe', 'zcar'] }));
    // the same axis on a 2020 standing upright: the rods and the carriage a guide on its top face, the screw and motor a
    // guide driving it, the endstop at an address on its front face; the same motor, lead, friction and load
    const write = (name, guides) => fs.writeFileSync(path.join(ws, `projects/arm/assemblies/${name}.json`), JSON.stringify({ title: name, kind: 'fit', uses: ['lift'],
      items: [{ id: 'x1', beam: { profile: '2020-misumi-hfs5' }, from: [0, 0, 0], to: [0, 0, 200] }], guides,
      loads: [{ mass: 'lift.z_mass', at: 'g1-carriage-1.top', note: 'The gripper, servo, payload and carriage, as the screw sees them' }] }));
    const rods = (endstop) => ({ kind: 'rods', on: 'x1.top', from: 60, length: 101, ...(endstop ? { endstop: { at: endstop } } : {}) });
    const screw = { kind: 'screw', guide: 'g1', screw: 't8-screw', motor: { model: '28byj48', microsteps: 1, duty: 0.3 }, friction: 'lift.z_friction' };
    // placed by an address: one beside the holder is refused, saying where the switch's flag would meet its lever
    write('z-far', [rods('x1.front@60'), screw]);
    const said = cad.refused('its mount reaches back over', 'check', 'arm/z-far'), place = /at (x1\.front@[\d.]+) it trips 0 mm from the travel's start/.exec(said);
    assert.match(said, /guide 1: endstop at x1\.front@60: its mount reaches back over g1-holder-a's leg \(to 71\.5 mm along x1\)/); assert.ok(place, said);
    write('z-rods', [rods(`x1.front@${Math.ceil(parseFloat(place[1].split('@')[1]))}`), screw]);
    // (the probe is a file, not node -e: a worker thread the motor's finite elements start takes its parent's -e as its own)
    const probe = (name) => { fs.writeFileSync(path.join(ws, 'probe.mjs'), `
      const lib = (f) => import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib')).href)} + '/' + f);
      const { buildAssembly, checkAssembly, sweep } = await lib('assembly.mjs'), { shoppingList } = await lib('list.mjs');
      const s = await buildAssembly('arm/${name}'), l = shoppingList(s), j = s.motion.joints.find((x) => x.type === 'prismatic');
      console.log(JSON.stringify({ joint: [j.id, j.dofs[0].slice(0, 2), j.slide ? [j.slide.kind, j.slide.mmPerTurn] : null], items: s.a.items.map((it) => [it.id, it.at ?? null]), home: (s.a.joints || []).find((x) => x.id === j.id)?.home ?? null,
        bought: l.bought.map((b) => [b.qty, b.set]), printed: l.printed.map((p) => [p.id, p.grams]), fasteners: l.fasteners.map((x) => [x.qty, x.fastener]),
        sweep: sweep(s, { steps: 8 }).map(({ level, values }) => ({ level, values })),
        findings: checkAssembly(s).map(({ level, code, text, values }) => ({ level, code, text, values: /^(motor|guide)\./.test(code) ? values : null })) }));
      process.exit(0);
    `); return JSON.parse(execFileSync(process.execPath, [path.join(ws, 'probe.mjs')], { cwd: ws, encoding: 'utf8', maxBuffer: 1 << 26, env: { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') } })); };
    const by = (r, code) => r.findings.filter((x) => x.code === code);
    const ch = probe('arm-z'), z = probe('z-rods');
    // the same margin: 15.5 N from the 28BYJ-48 through the 8 mm lead against 2.45 N, 6.32 times over in both
    const [t0] = by(ch, 'motor.torque'), [t1] = by(z, 'motor.torque');
    assert.equal(t1.level, 'pass'); assert.equal(t1.values.margin, t0.values.margin); assert.equal(+t1.values.margin.toFixed(2), 6.32);
    assert.match(t1.text, /15\.5 N there against 2\.45 N needed/);
    assert.deepEqual(z.joint, ['g1-1', [z.joint[1][0], z.joint[1][1]], ['screw', 8]]);
    assert.deepEqual(by(z, 'motor.holds').map((x) => x.level), by(ch, 'motor.holds').map((x) => x.level));
    assert.equal(by(z, 'motor.axis')[0].level, 'pass');
    assert.match(by(z, 'motor.speed')[0].text, /moves at 1\.17 mm\/s/); assert.match(by(ch, 'motor.speed')[0].text, /moves at 1\.17 mm\/s/);
    // all placed by addresses: the holders, the motor plate and the endstop's mount at the beam's; the rods, bearings, motor,
    // coupler, screw, nut and switch at the anchors of the parts they sit in
    const at = Object.fromEntries(z.items);
    assert.deepEqual([at['g1-holder-a'], at['g1-holder-b'], at['g2-plate'], at['g1-endstop-mount']], ['x1.top.1@60', 'x1.top.1@161', 'x1.top.1@30.5', `x1.front@${Math.ceil(parseFloat(place[1].split('@')[1]))}`]);
    assert.deepEqual([at['g1-rod-1'], at['g1-rod-2'], at['g1-bearing-1'], at['g2-motor'], at['g2-coupler'], at['g2-screw'], at['g2-nut'], at['g2-support-a'], at['g2-support-b'], at['g1-endstop']],
      ['g1-holder-a.r1', 'g1-holder-a.r2', 'g1-carriage-1.lm1', 'g2-plate.motor', 'g2-plate.coupler', 'g2-plate.coupler', 'g1-carriage-1.nut', 'g1-holder-a.s1', 'g1-holder-b.s1', 'g1-endstop-mount.switch']);
    // its travel from home to holder b: about chapter 13's 50 mm; the switch homes the joint; the sweep is clear
    const home = by(z, 'guide.endstop')[0].values.home;
    assert.ok(home >= 0 && home < 1, `home ${home}`); assert.deepEqual(z.joint[1], [home, 50.5]); assert.deepEqual(z.home, { endstop: 'g1-endstop.lever', direction: -1 });
    assert.deepEqual(z.sweep.map((x) => x.level), ['pass']);
    // nothing fails or warns but the chapter's own estimate (its nut's friction)
    assert.deepEqual(z.findings.filter((x) => x.level === 'fail' || x.level === 'warn').map((x) => `${x.code} ${x.text}`), ['rules.estimate uses estimates, not measurements: lift.z_friction. Measure each and settle it with cad measured arm/z-rods <name>=<value>']);
    assert.equal(by(z, 'joint.moment')[0].level, 'pass'); assert.match(by(z, 'joint.moment')[0].text, /against lm8uu's 400 N static rating/);
    assert.equal(by(z, 'guide.coupler')[0].level, 'pass');
    // the shopping list: what it takes, printed and bought
    assert.deepEqual(z.printed.map((p) => p[0]).sort(), ['g1-carriage-1', 'g1-endstop-mount', 'g1-holder-a', 'g1-holder-b', 'g2-plate']);
    for (const b of [[2, 'rod-8'], [2, 'lm8uu'], [1, '28byj48'], [1, 'coupler-5-8'], [1, 't8-nut'], [2, 'bearing-608'], [1, 'endstop-10t85']]) assert.ok(z.bought.some((x) => x[0] === b[0] && x[1] === b[1]), `${b[1]}: ${JSON.stringify(z.bought)}`);
    for (const x of [[9, 'M5x12 cap'], [4, 'M3x12 button'], [2, 'M2x12 cap']]) assert.ok(z.fasteners.some((f) => f[0] === x[0] && f[1] === x[1]), `${x[1]}: ${JSON.stringify(z.fasteners)}`);
    // refused by name: a screw on wheels, a screw naming no guide, a belt, a motor plate past the beam's end
    const beam = (profile) => ({ id: 'x1', beam: { profile }, from: [0, 0, 0], to: [0, 0, 300] }), bad = (guides, profile = '2020-misumi-hfs5') => { fs.writeFileSync(path.join(ws, 'projects/arm/assemblies/bad.json'), JSON.stringify({ title: 'bad', kind: 'fit', items: [beam(profile)], guides })); return cad.refused(/guide 2: |guides\/1/, 'check', 'arm/bad'); };
    assert.match(bad([{ kind: 'wheels', on: 'x1.top', length: 200 }, { kind: 'screw', guide: 'g1', motor: { model: '28byj48' } }], '2040-openbuilds'), /guide 2: a screw drives a rods guide's carriage, and g1 is a wheels guide/);
    assert.match(bad([{ kind: 'rods', on: 'x1.top', length: 200 }, { kind: 'screw', guide: 'g9', motor: { model: '28byj48' } }]), /guide 2: guide names the rods guide whose carriage the screw drives, by its id \(got "g9"; guides: g1, g2\)/);
    assert.match(bad([{ kind: 'rods', on: 'x1.top', length: 200 }, { kind: 'belt', guide: 'g1', motor: { model: 'nema17' } }]), /guide 2: a belt drives a rail guide's carriage, and g1 is a rods guide; a rods guide is driven by a screw|guides\/1/);
    assert.match(bad([{ kind: 'rods', on: 'x1.top', length: 200 }, { kind: 'screw', guide: 'g1', motor: { model: '28byj48' } }]), /guide 2: the motor plate and coupler-5-8 take 29\.5 mm before the stretch, and it starts 0 mm along x1: give the rods guide a "from" of at least 29\.5/);
    assert.match(bad([{ kind: 'rods', on: 'x1.top', from: 40, length: 200 }, { kind: 'screw', guide: 'g1', motor: { model: '28byj48', drives: 'z' } }]), /guide 2: motor\.drives comes from the guide: leave it out|guides\/1/);
  } finally { done(); }
});

test('guides on a frame: a rods guide on a beam joined at both ends shuts its holders\' slide-in nuts in, and cad check says so in a mechanism\'s poses; "nut": "drop-in" puts them in through the opening; cad plates lays its printed fittings out as they print', () => {
  const { ws, cad, done } = workspace();
  try {
    fs.mkdirSync(path.join(ws, 'projects/frame/assemblies'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'projects/frame/project.json'), JSON.stringify({ name: 'frame', material: 'PLA', objects: [] }));
    // a beam between two posts, a blind join at each end, so both ends of its slots are closed; two rods along its top,
    // as far apart and as high as a screw between them would set them
    const beam = (id, from, to) => ({ id, beam: { profile: '2020-misumi-hfs5' }, from, to });
    const write = (rods) => fs.writeFileSync(path.join(ws, 'projects/frame/assemblies/frame.json'), JSON.stringify({ title: 'Frame', kind: 'fit',
      items: [beam('p1', [-10, 0, -120], [-10, 0, 80]), beam('p2', [310, 0, -120], [310, 0, 80]), beam('x1', [0, 0, 0], [300, 0, 0])],
      joins: [{ kind: 'blind', a: 'x1.a', b: 'p1.back@120' }, { kind: 'blind', a: 'x1.b', b: 'p2.front@120' }],
      guides: [{ kind: 'rods', on: 'x1.top', from: 50, length: 200, spacing: 40, height: 22.5, ...rods }] }));
    // slide-in, the strongest made for the slot: shut in by the joins, and said in the check of every pose (g1-a, g1-b)
    write({});
    const slide = cad.refused('no build from bars to a square frame', 'check', 'frame/frame');
    assert.match(slide, /2 poses checked: g1-a, g1-b/);
    assert.match(slide, /✗ g1: g1-holder-a's leg into x1's front slot: 1 slide-in nut \(slot-nut-6-misumi-m5-slide-in\) goes into x1's front slot at [\d.]+ mm, between x1's end a \(the blind join of x1\.a to p1\.back@120\) and x1's end b \(the blind join of x1\.b to p2\.front@120\), which close it at both ends/);
    // drop-in: through the opening, anywhere, for the holders' legs on both sides
    write({ nut: 'drop-in' });
    const drop = cad('check', 'frame/frame');
    assert.doesNotMatch(drop, /✗/, drop);
    assert.equal((drop.match(/✓ g1: g1-holder-[ab]'s leg into x1's (front|back) slot: 1 drop-in nut \(slot-nut-6-misumi-m4-drop-in\) goes into x1's (front|back) slot through its opening, anywhere along it/g) || []).length, 4, drop);
    // its printed fittings on a plate: each item's fitting laid as it prints ("pose": "print"), checked as one print
    assert.match(cad('plates', 'frame/frame'), /frame-base-1: pla, base, 3 parts, [\d.]+ g, about \d+ min: (g1-holder-a|g1-holder-b|g1-carriage-1), (g1-holder-a|g1-holder-b|g1-carriage-1), (g1-holder-a|g1-holder-b|g1-carriage-1)\n\s+frame-base-1: prints clean/);
    const plate = JSON.parse(fs.readFileSync(path.join(ws, 'projects/frame/assemblies/frame-base-1.json'), 'utf8'));
    assert.deepEqual(plate.items.map((it) => [it.fitting?.kind, it.fitting?.pose]).sort(), [['rod-carriage', 'print'], ['rod-holder', 'print'], ['rod-holder', 'print']]);
    const onIt = cad('check', 'frame/frame-base-1');
    assert.doesNotMatch(onIt, /[✗!] /, onIt); assert.match(onIt, /no parts overlap \(3 object instances\)/);
  } finally { done(); }
});

test('guides: an MGN7 rail on a 2020 with "nut": "printed" places a printed carrier strip in the slot under it, fastens its M2 screws into the strip\'s hex nuts, lists the strip and each nut once, and checks clean (#308)', () => {
  const { ws, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/slide', f);
    fs.mkdirSync(at('assemblies'), { recursive: true });
    fs.writeFileSync(at('project.json'), JSON.stringify({ name: 'slide', material: 'PLA', objects: [] }));
    const x1 = { id: 'x1', beam: { profile: '2020-misumi-hfs5' }, from: [0, 0, 0], to: [400, 0, 0] };
    fs.writeFileSync(at('assemblies/small.json'), JSON.stringify({ title: 'small', kind: 'fit', items: [x1], guides: [{ kind: 'rail', rail: 'rail-mgn7', on: 'x1.top', length: 200, from: 100, nut: 'printed' }] }));
    const r = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
      const lib = (f) => import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib')).href)} + '/' + f);
      const { buildAssembly, checkAssembly } = await lib('assembly.mjs'), { shoppingList } = await lib('list.mjs');
      const s = await buildAssembly('slide/small'), l = shoppingList(s), centre = (p) => { const t = p.triangles.flat(); return [0, 1, 2].map((k) => t.reduce((a, q) => a + q[k], 0) / t.length); };
      console.log(JSON.stringify({ fasteners: l.fasteners.map((x) => [x.qty, x.fastener]), printed: l.printed.map((p) => [p.id, p.grams]),
        nuts: s.parts.filter((p) => /^fasten-\\d+-nut/.test(p.name ?? '')).map((p) => centre(p).map((c) => +c.toFixed(1))),
        findings: checkAssembly(s).map(({ level, code, text }) => ({ level, code, text })) }));
    `], { cwd: ws, encoding: 'utf8', env: { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') } }));
    // the strip is the printed part, 9.3 g; thirteen M2x8 cap screws, each into one of its thirteen M2 hex nuts (listed
    // once: by the fasten that placed them, not again as the carrier's own hardware)
    assert.deepEqual(r.printed, [['g1-nuts', 9.3]]);
    assert.deepEqual(r.fasteners, [[13, 'M2x8 cap'], [13, 'M2 hex nut']]);
    // the nuts under the rail's holes: from 100 mm, the first 10 mm in, 15 mm apart, in the slot below the top face (x1's
    // axis is at z = 0, so its face at 10): each 1.6 mm nut drawn up against its slot's roof, 3.2 mm down, so its middle
    // 4 mm down, z = 6
    assert.deepEqual(r.nuts.map((c) => c[0]).sort((a, b) => a - b), Array.from({ length: 13 }, (_, i) => 110 + 15 * i));
    assert.deepEqual([...new Set(r.nuts.map((c) => c[2]))], [6], 'each nut in the slot, under the lips');
    const by = (code) => r.findings.filter((x) => x.code === code);
    assert.deepEqual(by('guide.fit').map((x) => x.level), ['pass', 'pass', 'pass']);
    assert.match(by('guide.fit')[1].text, /printed carrier strip in slot-6-misumi \(carrier-6-misumi-m2-nut-x13\)/);
    for (const code of ['fasten.holes', 'fasten.clearance', 'fasten.end', 'fasten.length', 'fasten.engagement', 'fasten.seat', 'overlap', 'carrier.printable', 'carrier.first-layer']) assert.deepEqual([...new Set(by(code).map((x) => x.level))], ['pass'], code);
    assert.match(by('fasten.end')[0].text, /ends in an M2 hex nut in its seat in g1-nuts/);
    // nothing fails, and nothing warns but the rail's own long end holes (guide.end)
    assert.deepEqual(r.findings.filter((x) => x.level === 'fail' || (x.level === 'warn' && x.code !== 'guide.end')).map((x) => `${x.code} ${x.text}`), []);
  } finally { done(); }
});
