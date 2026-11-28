// cad's tests of beams in an assembly: placed by their ends, operations, joins, cut lists, jigs, slot nuts, the build, heat and squareness. The shared helpers are in ./helpers.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { workspace, object, BIN, ROOT_MODULES } from './helpers.mjs';

test('beams in an assembly: four placed by their ends make a rectangle, a plate at x1.top@50% sits on the slot\'s centre line, and an address past the end is refused with the length', () => {
  const { ws, cad, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/frame', f), file = at('assemblies/frame.json');
    fs.mkdirSync(at('objects'), { recursive: true }); fs.mkdirSync(at('assemblies'), { recursive: true });
    fs.writeFileSync(at('project.json'), JSON.stringify({ name: 'frame', material: 'PLA', objects: ['plate'] }));
    fs.writeFileSync(at('objects/plate.json'), JSON.stringify({ name: 'plate', title: 'Plate', version: '0.1.0', uses: ['x1c'], anchors: { centre: { at: [0, 0, 0], axis: [0, 0, 1] } }, variables: { side: { value: 40, unit: 'mm', rule: 'Side' }, thick: { value: 3, unit: 'mm', rule: 'Thick' } } }));
    // v.frames in a design: the tab is the slot's opening, read from the profile's slot family (through the sandbox)
    fs.writeFileSync(at('objects/plate.js'), "import jscad from '@jscad/modeling'\nconst { cuboid } = jscad.primitives\nexport function main (v) {\n  const p = v.frames.profileModel('2020-misumi-hfs5'), slot = p.slots[p.faces.top[0].slot]\n  return v.ops.union(cuboid({ size: [v.side, v.side, v.thick], center: [0, 0, v.thick / 2] }), cuboid({ size: [v.side / 2, slot.opening, v.thick], center: [0, 0, -v.thick / 2] }))\n}\n");
    const B = (id, from, to, beam = {}) => ({ id, beam: { profile: '2020-misumi-hfs5', ...beam }, from, to });
    const a = { title: 'Frame', kind: 'fit', items: [B('x1', [0, 0, 0], [300, 0, 0]), B('x2', [0, 200, 0], [300, 200, 0], { length: 'x1.length' }),
      B('y1', [-10, -10, 0], [-10, 210, 0]), B('y2', [310, -10, 0], [310, 210, 0]), { id: 'plate', object: 'plate', at: 'x1.top@50%' }],
      fits: [{ a: 'plate', b: 'x1', min: -1000, note: 'the tab in the slot' }, { a: 'plate', b: 'x1.top@50%', min: -1000, max: 0.01, note: 'on the face' }], loops: [{ a: 'plate.centre', b: 'x1.top@50%', label: 'on the centre line' }, { a: 'plate.centre', b: 'x1.top@-20', label: 'not at b' }] };
    const write = () => fs.writeFileSync(file, JSON.stringify(a));
    write();
    // where every part is: each beam's box, and the plate's
    const probe = () => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
      const { buildAssembly, checkAssembly } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/assembly.mjs')).href)});
      const { bounds } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../../printcheck/printcheck.mjs')).href)});
      const s = await buildAssembly('frame/frame'), r = (v) => v.map((x) => Math.round(x * 100) / 100);
      console.log(JSON.stringify({ parts: Object.fromEntries(s.parts.map((p) => { const b = bounds(p.triangles); return [p.name, [r(b.lo), r(b.hi), p.role]]; })), findings: checkAssembly(s).map(({ level, code, text }) => ({ level, code, text })) }));
    `], { cwd: ws, encoding: 'utf8', env: { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') } }));
    let r = probe();
    // a rectangle 340 by 220 of 20 mm beams: the long sides 300 between the short ones, all on z = 0
    assert.deepEqual(r.parts['x1.body'], [[0, -10, -10], [300, 10, 10], 'reference']);
    assert.deepEqual(r.parts['x2.body'], [[0, 190, -10], [300, 210, 10], 'reference']);
    assert.deepEqual(r.parts['y1.body'], [[-20, -10, -10], [0, 210, 10], 'reference']);
    assert.deepEqual(r.parts['y2.body'], [[300, -10, -10], [320, 210, 10], 'reference']);
    // the plate on the top face, centred on the slot's centre line (y = 0) half way along, its tab down in the slot
    assert.deepEqual(r.parts['plate.body'], [[130, -20, 7], [170, 20, 13], 'part']);
    const by = (code) => r.findings.filter((x) => x.code === code);
    assert.equal(by('overlap')[0].level, 'pass', JSON.stringify(by('overlap'))); // beams meet face to face; the tab is allowed in by its fit
    assert.match(by('fit').find((x) => /on the face/.test(x.text)).text, /on the face: press fit/); // (the faces near the address: the tab is in the beam's envelope)
    assert.deepEqual(by('loop').map((x) => [x.level, x.text]), [['pass', 'on the centre line: closed (0 mm, axes 0° apart)'], ['fail', 'not at b: apart (130 mm, axes 0° apart)']]);
    assert.match(by('beam.mass')[0].text, /^x1: profile-2020-misumi-hfs5 x 300: 147\.82 g/);
    assert.equal(by('bought.item').length, 4);
    // on the list by profile and length, weighed by the sheet's 0.5 kg/m
    const list = cad('list', 'frame/frame');
    assert.match(list, /2 ×\s+profile-2020-misumi-hfs5 x 300 mm\s+a beam\s+150 g each\s+x1, x2/);
    assert.match(list, /2 ×\s+profile-2020-misumi-hfs5 x 220 mm\s+a beam\s+110 g each\s+y1, y2/);
    // turned about its axis: an upright 2040 at roll 90 has its top toward -x, and the plate goes with it
    a.items.splice(0, 4, { id: 'x1', beam: { profile: '2040-misumi-hfs5' }, from: [0, 0, 0], to: [0, 0, 100], roll: 90 }); a.fits = []; a.loops = []; write();
    r = probe();
    assert.deepEqual(r.parts['x1.body'], [[-10, -20, 0], [10, 20, 100], 'reference']);
    assert.deepEqual(r.parts['plate.body'], [[-13, -30, 30], [-7, 10, 70], 'part']);
    // refused by name: past the end (with the length), a length that disagrees with the ends, a printed beam
    const refused = (change, pattern) => { const b = JSON.parse(JSON.stringify(a)); change(b); fs.writeFileSync(file, JSON.stringify(b)); cad.refused(pattern, 'check', 'frame/frame'); };
    refused((b) => { b.items[1].at = 'x1.top@120'; }, /item plate: at: x1: "top@120" is past the end of profile-2040-misumi-hfs5 x 100: it is 100 mm long/);
    refused((b) => { b.items[1].at = 'x1.top@-101'; }, /"top@-101" is past the end of .* it is 100 mm long/);
    refused((b) => { b.loops = [{ a: 'plate.centre', b: 'x1.side@20' }]; }, /x1: profile-2040-misumi-hfs5 x 100 has no "side@20": it has a, b, a\.1/);
    refused((b) => { b.items[0].beam.length = 120; }, /item x1: its length is 120 mm, and its ends are 100 mm apart/);
    refused((b) => { b.items[0].beam.printed = 'yes'; }, /item x1: beam.printed is true, false, or how it prints/);
    refused((b) => { b.items[0].beam.colour = 'red'; }, /item x1: a beam has no "colour": it takes profile, length, printed, material/);
    refused((b) => { delete b.items[0].from; delete b.items[0].to; delete b.items[0].roll; }, /item x1: give the beam a length, or place it by its ends/);
    // cad add beam: one placed by its ends, kept to the schema
    write();
    assert.match(cad('add', 'beam', 'frame/frame', '--id', 'z1', '--profile', '2020-misumi-hfs5', '--from', '30,0,0', '--to', '30,0,100', '--roll', '90'), /added a beam/);
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).items.at(-1), { id: 'z1', beam: { profile: '2020-misumi-hfs5' }, from: [30, 0, 0], to: [30, 0, 100], roll: 90 });
    assert.match(cad('add', 'item', 'frame/frame', '--id', 'p2', '--object', 'plate', '--at', 'z1.front@50%'), /added an item/);
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).items.at(-1).at, 'z1.front@50%');
  } finally { done(); }
});

test('beam operations in an assembly: an end tapped M5 and an access hole by expression, cut into the solid; beam.op findings; a tap with no end bore refused by name', () => {
  const { ws, cad, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/frame', f), file = at('assemblies/ops.json');
    fs.mkdirSync(at('assemblies'), { recursive: true });
    fs.writeFileSync(at('project.json'), JSON.stringify({ name: 'frame', material: 'PLA', objects: [] }));
    const a = { title: 'Ops', kind: 'fit', items: [{ id: 'x1', beam: { profile: '2020-misumi-hfs5', length: 300,
      ops: [{ op: 'tap', at: 'a', thread: 'M5' }, { op: 'access', at: 'top@-10', thread: 'M5', depth: '2 * 3.95' }, { op: 'mitre', at: 'b', angle: 45, about: 'top' }] }, from: [0, 0, 0], to: [300, 0, 0] }] };
    const write = (x = a) => fs.writeFileSync(file, JSON.stringify(x));
    write();
    const probe = () => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
      const { buildAssembly, checkAssembly } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/assembly.mjs')).href)});
      const s = await buildAssembly('frame/ops'), o = s.objects.find((x) => x.id === 'x1'), p = s.parts.find((x) => x.name === 'x1.body');
      console.log(JSON.stringify({ ops: o.beam.ops.map((x) => [x.op, x.at, x.distance, x.depth ?? null]), lines: o.beam.ops.map((x) => x.line), triangles: p.triangles.length, collide: p.collide ? 1 : 0, findings: checkAssembly(s).filter((f) => /^beam\\./.test(f.code)).map(({ level, code, text }) => ({ level, code, text })) }));
    `], { cwd: ws, encoding: 'utf8', env: { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') } }));
    const r = probe();
    assert.deepEqual(r.ops, [['tap', 'a', 0, 10], ['cut', 'a', 0, null], ['access', 'top@-10', 290, 7.9], ['mitre', 'b', 300, null]]);
    assert.match(r.lines[2], /access hole Ø5\.3 mm in top\.1, 290 mm from end a \(10 from end b\)/);
    assert.ok(r.triangles > 872, `the solid has the tap, the hole and the mitre cut in (${r.triangles} triangles)`);
    assert.ok(r.findings.some((f) => f.level === 'info' && /x1: .*its 300 mm is measured on the long side, back; mitred, the front is 280 mm/.test(f.text)), JSON.stringify(r.findings));
    // a hole across the tapped thread is a beam.op failure on cad check, named by item
    a.items[0].beam.ops.push({ op: 'drill', at: 'top@8', diameter: 3 }); write();
    cad.refused(/x1: profile-2020-misumi-hfs5 x 300: the drill at top@8 \(Ø3 mm, 8 mm from end a\) crosses the M5 thread tapped 10 mm into a\.1/, 'check', 'frame/ops');
    // refused by name: a tap in a tube, with no end bore; an operation the kit does not have
    const refused = (change, pattern) => { const b = JSON.parse(JSON.stringify(a)); change(b); write(b); cad.refused(pattern, 'check', 'frame/ops'); };
    refused((b) => { b.items[0].beam.profile = 'tube-al-20x20x2'; b.items[0].beam.ops = [{ op: 'tap', at: 'a', thread: 'M5' }]; }, /item x1: profile-tube-al-20x20x2 x 300: ops\[0\] \(tap\): profile-tube-al-20x20x2 has no bore in its ends to tap/);
    refused((b) => { b.items[0].beam.ops = [{ op: 'weld', at: 'a' }]; }, /no operation "weld": there are cut, mitre, tap/);
    refused((b) => { b.items[0].beam.laid = true; }, /item x1: beam.laid draws a printed beam as it prints: true or false, with printed \(got true on a bought beam\)/);
  } finally { done(); }
});

test('joins between beams: a blind join taps one end and drills an access hole across the other beam in line with it, counts one button-head screw, and a beam 2 mm off the face fails join.geometry with the gap', () => {
  const { ws, cad, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/frame', f), file = at('assemblies/tee.json');
    fs.mkdirSync(at('assemblies'), { recursive: true });
    fs.writeFileSync(at('project.json'), JSON.stringify({ name: 'frame', material: 'PLA', objects: [] }));
    // y1 stands on x1's back face 120 mm from its end a, on the slot's centre line; the join says how they are held
    const a = { title: 'Tee', kind: 'fit', items: [{ id: 'x1', beam: { profile: '2020-misumi-hfs5' }, from: [0, 0, 0], to: [300, 0, 0] }, { id: 'y1', beam: { profile: '2020-misumi-hfs5' }, from: [120, 10, 0], to: [120, 210, 0] }],
      joins: [{ kind: 'blind', a: 'y1.a', b: 'x1.back@120' }] };
    const write = (x = a) => fs.writeFileSync(file, JSON.stringify(x));
    write();
    const probe = () => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
      const { buildAssembly, checkAssembly } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/assembly.mjs')).href)});
      const s = await buildAssembly('frame/tee'), ops = Object.fromEntries(s.objects.filter((o) => o.beam).map((o) => [o.id, o.beam.ops.filter((x) => !x.implied).map((x) => [x.op, x.at, x.distance, x.depth ?? null, x.diameter ?? x.long ?? null])]));
      console.log(JSON.stringify({ ops, hardware: s.hardware.map((h) => [h.kind, h.name, h.head]), findings: checkAssembly(s).filter((f) => /^(join|fasten|overlap)/.test(f.code)).map(({ level, code, text, values }) => ({ level, code, text, values })) }));
    `], { cwd: ws, encoding: 'utf8', env: { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') } }));
    let r = probe();
    const by = (code) => r.findings.filter((x) => x.code === code);
    // a tapped end on y1, 18.5 mm deep (aluminium's 10 mm of M5 engaged, tip room, 1.5 diameters more), and on x1 an access
    // hole across from the back face at the same 120 mm, from the front face through to the back slot (14 mm)
    assert.deepEqual(r.ops, { x1: [['access', 'front.1@120', 120, 14, 5.3]], y1: [['tap', 'a.1', 0, 18.5, null]] });
    // one button-head screw, its head in x1's back slot under the lips, into y1's thread, its key through the access hole
    assert.deepEqual(r.hardware, [['screw', 'M5x12 button', 'button']]);
    for (const code of ['fasten.holes', 'fasten.clearance', 'fasten.end', 'fasten.length', 'fasten.engagement', 'fasten.seat', 'fasten.access', 'overlap']) assert.deepEqual(by(code).map((x) => x.level), ['pass'], `${code}: ${JSON.stringify(by(code))}`);
    assert.match(by('fasten.seat')[0].text, /the head, 9\.5 mm across, bears on the lips of x1's slot \(slot-6-misumi\) from inside, in its 12 mm cavity/);
    assert.match(by('fasten.end')[0].text, /ends in y1's own M5 thread, tapped 18\.5 mm into its end bore a\.1/);
    assert.match(by('fasten.access')[0].text, /a 3 mm hex key reaches the head along its axis/);
    assert.deepEqual(by('join.geometry').map((x) => [x.level, x.text]), [['pass', 'blind join of y1.a to x1.back@120: y1\'s end a meets x1\'s back.1 face square and flush at 120 mm from x1\'s end a, on the slot\'s centre line']]);
    assert.deepEqual(by('join.stiffness').map((x) => [x.level, x.values]), [['info', { bending: 1.5e6, twist: 3e5 }]]);
    assert.match(by('join.stiffness')[0].text, /an estimate, until the joint rig \(issue 264\) measures it/);
    assert.deepEqual(by('join.end').map((x) => [x.level, x.text.split(':')[0]]), [['warn', '3 beam ends are neither joined nor capped']]);
    // counted on the list once, as one screw of the join
    assert.match(cad('list', 'frame/tee'), /1 ×\s+M5x12 button\s+.*blind join of y1\.a to x1\.back@120/);
    assert.match(cad('list', 'frame/tee'), /access Ø5\.3 at front\.1@120\.0\s+x1/);
    // y1 moved 2 mm off the face: join.geometry fails with the gap
    a.items[1].from = [120, 12, 0]; a.items[1].to = [120, 212, 0]; write();
    r = probe();
    assert.deepEqual(by('join.geometry').map((x) => [x.level, x.values.gap]), [['fail', 2]]);
    assert.match(by('join.geometry')[0].text, /y1's end a stands 2 mm off x1's back\.1 face: a gap of 2 mm, where it meets flush\. Move y1 2 mm toward x1/);
    // 5 mm along: where the join says and where the beam is disagree, and it says which address would do
    a.items[1].from = [125, 10, 0]; a.items[1].to = [125, 210, 0]; write();
    assert.match(probe().findings.find((x) => x.code === 'join.geometry').text, /y1's end a is 5 mm toward x1's end b from x1\.back@120: it meets x1 125 mm from its end a, so the join says x1\.back@125, or y1 moves/);
    // an end-tap join: a clearance hole right through x1, a cap screw on the front slot's lips
    a.items[1].from = [120, 10, 0]; a.items[1].to = [120, 210, 0]; a.joins[0].kind = 'end-tap'; write();
    r = probe();
    assert.deepEqual([r.ops.x1, r.hardware], [[['drill', 'front.1@120', 120, 14, 5.5]], [['screw', 'M5x35 cap', 'cap']]]);
    assert.deepEqual(r.findings.filter((x) => /^(fasten|overlap|join\.geometry)/.test(x.code) && x.level !== 'pass'), []);
    // a kind whose fitting comes later: checked where it meets, nothing drilled, and it says so
    a.joins[0] = { kind: 'bracket', a: 'y1.a', b: 'x1.back@120', fitting: 'bought' }; write();
    r = probe();
    assert.deepEqual([r.ops, r.hardware, by('join.fitting').map((x) => x.level), by('join.geometry').map((x) => x.level)], [{ x1: [], y1: [] }, [], ['warn'], ['pass']]);
    // a mitre: each end cut at 45° about the face the corner lies in, the length on the outside of the corner
    const ell = { title: 'Ell', kind: 'fit', items: [{ id: 'x1', beam: { profile: '2020-misumi-hfs5' }, from: [-10, 0, 0], to: [290, 0, 0] }, { id: 'y1', beam: { profile: '2020-misumi-hfs5' }, from: [0, -10, 0], to: [0, 290, 0] }], joins: [{ kind: 'mitre', a: 'x1.a', b: 'y1.a' }] };
    write(ell); r = probe();
    assert.deepEqual(r.ops, { x1: [['mitre', 'a', 0, null, 'front']], y1: [['mitre', 'a', 0, null, 'back']] });
    assert.deepEqual([by('join.geometry').map((x) => [x.level, x.values.miss]), by('join.fitting').map((x) => x.level)], [[['pass', 0]], ['warn']]);
    assert.match(by('join.fitting')[0].text, /The mitres are cut; the corner key or plate comes with a later release/);
    ell.items[1].from = [300, 0, 0]; ell.items[1].to = [500, 0, 0]; write(ell);
    cad.refused(/join 1: x1 and y1 lie along one line, so there is no corner to mitre: a splice joins them end to end/, 'check', 'frame/tee');
    // refused by name: a join on an item that is not a beam, a key a join does not take; cad add join kept to the beams
    const refused = (change, pattern) => { const b = JSON.parse(JSON.stringify(a)); change(b); write(b); cad.refused(pattern, 'check', 'frame/tee'); };
    refused((b) => { b.joins = [{ kind: 'blind', a: 'z1.a', b: 'x1.back@120' }]; }, /join 1: a is on a beam item of this assembly, and z1 is not an item \(beams: x1, y1\)/);
    refused((b) => { b.joins = [{ kind: 'blind', a: 'y1.a', b: 'x1.back@120', glue: true }]; }, /join 1: a join has no "glue": it takes kind, a, b, fitting, screw, brace, load, nut, face, shape, note/);
    refused((b) => { b.joins = [{ kind: 'blind', a: 'y1.a', b: 'y1.back@120' }]; }, /join 1: a and b are on one beam, y1/);
    write({ ...a, joins: [] });
    assert.match(cad('add', 'join', 'frame/tee', '--kind', 'blind', '--a', 'y1.a', '--b', 'x1.back@120'), /added a join/);
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).joins, [{ kind: 'blind', a: 'y1.a', b: 'x1.back@120' }]);
    cad.refused(/join a: no beam "q1" in frame\/tee \(beams: x1, y1\)/, 'add', 'join', 'frame/tee', '--kind', 'blind', '--a', 'q1.a', '--b', 'x1.back@120');
    assert.match(cad('check', 'frame/tee'), /files match their schemas/);
  } finally { done(); }
});

test('beam cut list and sheets: a box of twelve beams lists three lengths, the bars to buy and their offcuts; cad beams writes a sheet per mark, the access hole at 207.5 mm', () => {
  const { ws, cad, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/frame', f);
    fs.mkdirSync(at('assemblies'), { recursive: true });
    fs.writeFileSync(at('project.json'), JSON.stringify({ name: 'frame', material: 'PLA', objects: [] }));
    // four of each length, apart from each other; z1 has its end tapped and an access hole 12.5 mm from end b
    const items = [];
    for (let i = 0; i < 4; i++) items.push({ id: `x${i + 1}`, beam: { profile: '2020-misumi-hfs5' }, from: [0, i * 40, 0], to: [300, i * 40, 0] });
    for (let i = 0; i < 4; i++) items.push({ id: `y${i + 1}`, beam: { profile: '2020-misumi-hfs5' }, from: [400 + i * 40, 0, 0], to: [400 + i * 40, 260, 0] });
    for (let i = 0; i < 4; i++) items.push({ id: `z${i + 1}`, beam: { profile: '2020-misumi-hfs5', ...(i === 0 ? { ops: [{ op: 'tap', at: 'a', thread: 'M5' }, { op: 'access', at: 'top@-12.5', thread: 'M5' }] } : {}) }, from: [700 + i * 40, 0, 0], to: [700 + i * 40, 0, 220] });
    fs.writeFileSync(at('assemblies/box.json'), JSON.stringify({ title: 'Box', kind: 'fit', items }));
    const list = cad('list', 'frame/box');
    assert.match(list, /Cut list \(kerf 3 mm, trim 10 mm; a sheet for each mark: cad beams frame\/box\)/);
    assert.match(list, /A\s+4 ×\s+profile-2020-misumi-hfs5 x 300 mm\s+150 g each\s+cut square\s+x1, x2, x3, x4/);
    assert.match(list, /D\s+1 ×\s+profile-2020-misumi-hfs5 x 220 mm\s+110 g each\s+tap M5 x 10 at a; access Ø5\.3 at top\.1@207\.5\s+z1/);
    assert.match(list, /profile-2020-misumi-hfs5: 3 lengths, 4 × 300, 4 × 260, 4 × 220 mm/);
    assert.match(list, /profile-2020-misumi-hfs5: buy 1 × 4000 mm; kerf 3, trim 10; 834 mm left over/);
    assert.match(list, /bar 1, 4000 mm: trim 10, A 300 \(x1\), A 300 \(x2\), .*; offcut 834/);
    const json = JSON.parse(cad('list', 'frame/box', '--json'));
    assert.deepEqual(json.cut.stock[0].buy, [{ length: 4000, count: 1 }]); assert.equal(json.cut.totals.offcut, 834); assert.equal(json.cut.marks[0].beam, undefined);
    // a sheet per mark in exports/, the access hole dimensioned 207.5 from end a, the tap's thread and depth, the face up
    assert.match(cad('beams', 'frame/box'), /mark D \(z1\), 1:2: exports[\\/]frame[\\/]box\.beam-D\.svg/);
    assert.deepEqual(fs.readdirSync(path.join(ws, 'exports/frame')).filter((f) => f.endsWith('.svg')).sort(), ['box.beam-A.svg', 'box.beam-B.svg', 'box.beam-C.svg', 'box.beam-D.svg']);
    const svg = fs.readFileSync(path.join(ws, 'exports/frame/box.beam-D.svg'), 'utf8');
    for (const t of ['>207.5<', '>Mark D: profile-2020-misumi-hfs5 x 220.0 mm<', '>(4) a.1: tap M5 x 10 deep<', '>top face up: seen from the top, end a on the left<']) assert.ok(svg.includes(t), `the sheet shows ${t}`);
    // each beam's mark in its label, the cut list's findings on cad check, and the sheets on the build page
    const r = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
      const { buildAssembly, checkAssembly } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/assembly.mjs')).href)});
      const { buildData } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/buildpage.mjs')).href)});
      const s = await buildAssembly('frame/box');
      console.log(JSON.stringify({ labels: s.parts.filter((p) => /^[xz]1\\./.test(p.name)).map((p) => p.label), marks: s.objects.map((o) => o.mark).join(''), cut: checkAssembly(s).filter((f) => f.code === 'frame.cut').map((f) => f.level + ' ' + f.text), build: (await buildData(s)).build.beams }));
    `], { cwd: ws, encoding: 'utf8', env: { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') } }));
    assert.deepEqual(r.labels, ['x1: mark A, profile-2020-misumi-hfs5 x 300 mm', 'z1: mark D, profile-2020-misumi-hfs5 x 220 mm']);
    assert.equal(r.marks, 'AAAABBBBDCCC');
    assert.ok(r.cut.some((t) => /^info mark A \(x1, x2, x3, x4\): 4 beams of 300 mm, each cut to ±0\.5 mm/.test(t)), r.cut.join('\n'));
    assert.deepEqual(r.build.sheets.find((x) => x.mark === 'D'), { mark: 'D', items: ['z1'], file: 'exports/frame/box.beam-D.svg', written: true });
    // a beam longer than any length sold fails on cad check
    items[0].to = [4100, 0, 0]; fs.writeFileSync(at('assemblies/box.json'), JSON.stringify({ title: 'Box', kind: 'fit', items }));
    cad.refused(/x1: 4100 mm of profile-2020-misumi-hfs5 is longer than any length it is sold in \(1000, 4000 mm\)/, 'check', 'frame/box');
  } finally { done(); }
});

test('jigs: a box\'s sixteen blind joins give its drill guides, a tap guide, a cut-length stop per length and a squaring corner of each hand, each lying whole on its beams where the assembly puts it, each marked, printing without supports, each guide\'s bush where the beam\'s sheet puts the hole', () => {
  const { ws, cad, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/frame', f);
    fs.mkdirSync(at('assemblies'), { recursive: true });
    fs.writeFileSync(at('project.json'), JSON.stringify({ name: 'frame', material: 'PLA', objects: [] }));
    // a box: four 300 mm posts; between them x beams at z 30 and 270 and y beams at z 10 and 290, every end blind-joined
    // into a post's face (so each post has an access hole 10 and 30 mm from each end, each beam both ends tapped)
    const P = { profile: '2020-misumi-hfs5' }, items = [], joins = [];
    [[10, 10], [290, 10], [290, 250], [10, 250]].forEach(([x, y], i) => items.push({ id: `p${i + 1}`, beam: P, from: [x, y, 0], to: [x, y, 300] }));
    for (const [n, y, pa, pb, z] of [['x1', 10, 'p1', 'p2', 30], ['x2', 250, 'p4', 'p3', 30], ['x3', 10, 'p1', 'p2', 270], ['x4', 250, 'p4', 'p3', 270]]) {
      items.push({ id: n, beam: P, from: [20, y, z], to: [280, y, z] });
      joins.push({ kind: 'blind', a: `${n}.a`, b: `${pa}.back@${z}` }, { kind: 'blind', a: `${n}.b`, b: `${pb}.front@${z}` });
    }
    for (const [n, x, pa, pb, z] of [['y1', 10, 'p1', 'p4', 10], ['y2', 290, 'p2', 'p3', 10], ['y3', 10, 'p1', 'p4', 290], ['y4', 290, 'p2', 'p3', 290]]) {
      items.push({ id: n, beam: P, from: [x, 20, z], to: [x, 240, z] });
      joins.push({ kind: 'blind', a: `${n}.a`, b: `${pa}.top@${z}` }, { kind: 'blind', a: `${n}.b`, b: `${pb}.bottom@${z}` });
    }
    fs.writeFileSync(at('assemblies/box.json'), JSON.stringify({ title: 'Box', kind: 'fit', items, joins }));
    const r = JSON.parse(cad('beams', 'frame/box', '--jigs', '--json'));
    const of = (kind) => r.jigs.filter((x) => x.kind === kind);
    // from the assembly: one drill guide per distinct hole (10 and 30 mm from an end), one tap guide for every tapped
    // end, a stop for each of the three lengths, and a squaring corner of each hand (right and left) for all sixteen joins
    assert.deepEqual(r.jigs.map((x) => [x.kind, x.name, x.mark]), [
      ['drill-guide', 'drill-guide-2020-misumi-hfs5-5.3-at-10', 'ABCD'], ['drill-guide', 'drill-guide-2020-misumi-hfs5-5.3-at-30', 'ABCD'],
      ['length-stop', 'length-stop-2020-misumi-hfs5-300', 'ABCD 300'], ['tap-guide', 'tap-guide-2020-misumi-hfs5-M5', 'EF'],
      ['length-stop', 'length-stop-2020-misumi-hfs5-260', 'E 260'], ['length-stop', 'length-stop-2020-misumi-hfs5-220', 'F 220'],
      ['square-corner', 'square-corner-2020-misumi-hfs5', 'ABCDEF'], ['square-corner', 'square-corner-2020-misumi-hfs5-left', 'ABCDEF']]);
    assert.equal(of('tap-guide')[0].for.length, 4);
    // a squaring corner's arm b runs one way along b: at a post's end only one hand lies on the post, so the box takes both,
    // each for the eight joins whose post runs its way from the beam, every tongue whole on its beam (58 and 78 mm)
    assert.deepEqual(of('square-corner').map((x) => [x.for.length, [...new Set(x.for.map((w) => w.hand))]]), [[8, ['right']], [8, ['left']]]);
    assert.deepEqual(of('square-corner')[1].for.map((w) => w.text).sort(), ['blind join of x1.b to p2.front@30', 'blind join of x2.a to p4.back@30', 'blind join of x3.a to p1.back@270', 'blind join of x4.b to p3.front@270',
      'blind join of y1.a to p1.top@10', 'blind join of y2.b to p3.bottom@10', 'blind join of y3.b to p4.bottom@290', 'blind join of y4.a to p2.top@290']);
    for (const w of of('square-corner').flatMap((x) => x.for)) assert.deepEqual(w.on, { a: 58, b: 78 }, w.text);
    // measured on the solids, each corner fitted where the assembly puts it: its tongues lie whole on their beams (none of
    // either inside the beam's envelope made 400 mm longer past an end; for a, past its far end, as b's tongue crosses the
    // line of a beyond the end that meets b), its plate meets no beam; the other hand, put
    // on the joins given the left, would hang its b tongue past the post's end
    const fitted = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
      const { buildAssembly } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/assembly.mjs')).href)});
      const { jigsOf } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/jigs.mjs')).href)});
      const { squareCorner, squareCornerModel, beam } = await import(${JSON.stringify(import.meta.resolve('@rulecad/frames'))});
      const { placeItems } = await import(${JSON.stringify(import.meta.resolve('@rulecad/model-link'))});
      const jscad = (await import(${JSON.stringify(import.meta.resolve('@jscad/modeling'))})).default;
      const { intersect } = jscad.booleans, { measureVolume, measureBoundingBox } = jscad.measurements, { transform } = jscad.transforms, { cuboid } = jscad.primitives;
      const s = await buildAssembly('frame/box'), { jigs } = jigsOf(s), placed = placeItems(s.motion, s.jointValues);
      const col = (W) => [W[0], W[4], W[8], 0, W[1], W[5], W[9], 0, W[2], W[6], W[10], 0, W[3], W[7], W[11], 1];
      const mul = (P, Q) => Array.from({ length: 16 }, (_, i) => { const c = Math.floor(i / 4), r = i % 4; return P[r] * Q[4 * c] + P[4 + r] * Q[4 * c + 1] + P[8 + r] * Q[4 * c + 2] + P[12 + r] * Q[4 * c + 3]; });
      const items = s.objects.filter((o) => o.beam).map((o) => { const W = col(placed[s.motion.items.findIndex((x) => x[0] === o.id)]), B = o.beam;
        const longer = (z0, z1) => transform(W, cuboid({ size: [B.profile.width, B.profile.height, z1 - z0], center: [0, 0, (z0 + z1) / 2] }));
        return { id: o.id, B, W, env: transform(W, beam(B, { display: 'link' })), longer: longer(-400, B.length + 400), past: { a: longer(0, B.length + 400), b: longer(-400, B.length) } }; });
      const over = (g, h) => { const [a0, a1] = measureBoundingBox(g), [b0, b1] = measureBoundingBox(h); return [0, 1, 2].every((k) => a0[k] < b1[k] && b0[k] < a1[k]); };
      const vol = (g, h) => (over(g, h) ? measureVolume(intersect(g, h)) : 0), hang = (g, x, far) => vol(g, far ? x.past[far] : x.longer) - vol(g, x.env);
      const out = [];
      for (const j of jigs.filter((x) => x.kind === 'square-corner')) for (const w of j.for) {
        const g = transform(w.fit, squareCorner(j.model)), [A, B] = w.items.map((id) => items.find((x) => x.id === id));
        const row = { text: w.text, hand: w.hand, inA: vol(g, A.env), inB: vol(g, B.env), hangA: hang(g, A, w.end), hangB: hang(g, B), others: items.filter((x) => !w.items.includes(x.id)).map((x) => vol(g, x.env)).reduce((t, v) => t + v, 0) };
        if (w.hand === 'left') { const m = squareCornerModel({ profile: A.B.profile, face: w.faces[0], end: w.end, length: A.B.length }, { profile: B.B.profile, face: w.faces[1], edge: w.edge }, { hand: 'right' }); row.rightHangs = hang(transform(mul(A.W, m.fit), squareCorner(m)), B); }
        out.push(row);
      }
      // a tapped end no guide can be drawn for (its bore gone) is a jig.tap warning, the other jigs still made
      for (const o of s.objects) if (o.beam) for (const x of o.beam.ops) if (x.op === 'tap') x.bores = [x.end + '.9'];
      const t = jigsOf(s);
      console.log(JSON.stringify({ rows: out, tap: { kinds: [...new Set(t.jigs.map((x) => x.kind))], findings: t.findings.map((f) => f.level + ' ' + f.code + ' ' + f.text) } }));
    `], { cwd: ws, encoding: 'utf8', env: { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') } }));
    assert.equal(fitted.rows.length, 16);
    assert.deepEqual(fitted.tap.kinds, ['drill-guide', 'length-stop', 'square-corner']);
    assert.equal(fitted.tap.findings.length, 4);
    assert.match(fitted.tap.findings[0], /^warn jig\.tap mark E \(x1, x2, x3, x4\), operation \d+: no tap guide: profile-2020-misumi-hfs5 x 260's op \d+ \(tap at a\.1\) taps bore a\.9, which profile-2020-misumi-hfs5 x 260 does not have: end a has a\.1/);
    for (const f of fitted.rows) {
      assert.ok(f.inA > 100 && f.inB > 100, `${f.text}: its tongues in the slots (${f.inA}, ${f.inB} mm³)`);
      assert.ok(f.hangA < 0.01 && f.hangB < 0.01, `${f.text}: ${f.hangA} and ${f.hangB} mm³ of tongue past the beams' ends`);
      assert.ok(f.others < 0.01, `${f.text}: it meets ${f.others} mm³ of the other beams`);
      if (f.hand === 'left') assert.ok(f.rightHangs > 100, `${f.text}: the right-handed corner would hang ${f.rightHangs} mm³ past the post's end`);
    }
    // every guide's bush where the sheet dimensions its hole, for all 16 access holes in the posts, from whichever end is nearer
    const holes = of('drill-guide').flatMap((x) => x.for);
    assert.equal(holes.length, 16);
    for (const w of holes) { assert.equal(w.bush, w.sheet, `${w.label}: the bush at ${w.bush}, the sheet at ${w.sheet}`); assert.equal(w.distance, Math.min(w.sheet, 300 - w.sheet)); }
    assert.deepEqual([...new Set(holes.map((w) => w.sheetText))].sort(), ['10.0', '270.0', '290.0', '30.0']);
    // each prints without supports, and says its grams and margin
    for (const x of r.jigs) { assert.deepEqual(x.checks.flatMap((c) => c.issues), [], x.name); assert.ok(x.margin >= 2 && x.grams > 1, `${x.name}: ${x.grams} g at ${x.margin}×`); assert.ok(x.findings.some((f) => f.code === 'fitting.mass')); }
    for (const x of of('square-corner')) assert.ok(x.findings.some((f) => f.code === 'jig.square' && f.level === 'pass'), x.name);
    // laid out as one plate: 8 jigs, three of the stops with a gauge in two pieces
    assert.deepEqual(r.plates.map((p) => [p.file.replace(/\\/g, '/'), p.parts.length]), [['exports/frame/box.jigs.3mf', 13]]);
    assert.ok(fs.statSync(path.join(ws, 'exports/frame/box.jigs.3mf')).size > 1000);
    assert.deepEqual(r.findings, []);
    // the text form; a hole too far from both ends for one print is a warning in place of a guide
    assert.match(cad('beams', 'frame/box', '--jigs'), /drill-guide-2020-misumi-hfs5-5\.3-at-30 \[ABCD\]: 11\.\d+ g, 6\.66× at its load, prints clean: for A4 \(p2: access hole Ø5\.3 mm in back\.1, 30 mm from end a/);
    fs.writeFileSync(at('assemblies/long.json'), JSON.stringify({ title: 'Long', kind: 'fit', items: [{ id: 'l1', beam: { ...P, ops: [{ op: 'access', at: 'top@500', thread: 'M5' }] }, from: [0, 0, 0], to: [1000, 0, 0] }] }));
    const l = JSON.parse(cad('beams', 'frame/long', '--jigs', '--json'));
    assert.deepEqual(l.jigs.map((x) => x.kind), ['length-stop']);
    assert.match(l.findings[0].text, /mark A \(l1\), operation 3: no drill guide: .* is 500 mm from end a and 500 mm from end b: a guide that reaches it is [\d.]+ mm long, more than the 236 mm the printer's 256 mm bed takes\. Mark this hole from the sheet/);
  } finally { done(); }
});

test('slot nuts: a plate on a beam between two joins with slide-in nuts fails frame.nut and passes with drop-ins; another slot\'s two nuts are loaded before its corner is closed; fasten.slot catches a plate drawn for another slot spacing', () => {
  const { ws, cad, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/frame', f), file = at('assemblies/frame.json');
    fs.mkdirSync(at('assemblies'), { recursive: true });
    const t = (value, rule, min, max) => ({ value, unit: 'mm', rule, tweak: { min, max } });
    // a plate with two M4 clearance holes, pitch apart along its length; a cap for a beam's end
    object(ws, 'frame/plate', { uses: ['x1c'], variables: { pitch: t(20, 'Between the holes', 5, 60), thick: t(3, 'The plate', 2, 10), length: t(40, 'Its length', 20, 100) } }, `import jscad from '@jscad/modeling'
const { cuboid } = jscad.primitives
export function main (v) {
  const plate = cuboid({ size: [v.length, 20, v.thick], center: [0, 0, v.thick / 2] })
  return v.ops.subtract(plate, ...[-1, 1].map((s) => v.fixings.hole('M4', { depth: v.thick, at: [s * v.pitch / 2, 0, v.thick] })))
}
`);
    object(ws, 'frame/cap', {}, `import jscad from '@jscad/modeling'
const { cuboid } = jscad.primitives
export function main () { return cuboid({ size: [20, 20, 3], center: [0, 0, 1.5] }) }
`);
    const pj = JSON.parse(fs.readFileSync(at('project.json'), 'utf8')); fs.writeFileSync(at('project.json'), JSON.stringify({ ...pj, material: 'PLA' }));
    // x1 runs between two posts, a blind join at each end, so both ends of its slots are closed; y1 stands on p1's top
    // face at a corner (its end a joined) and is capped at end b by a foot. A plate on each, on two M4 screws.
    const beam = (id, from, to) => ({ id, beam: { profile: '2020-misumi-hfs5' }, from, to });
    const a = { title: 'Frame', kind: 'fit', items: [beam('p1', [-10, 0, -120], [-10, 0, 80]), beam('p2', [310, 0, -120], [310, 0, 80]), beam('x1', [0, 0, 0], [300, 0, 0]), beam('y1', [-10, 10, 50], [-10, 210, 50]),
      { id: 'foot', object: 'cap', at: 'y1.b' }, { id: 'plate', object: 'plate', at: [150, 0, 10] }, { id: 'plate2', object: 'plate', at: [-10, 110, 60], rotate: [0, 0, 90] }],
      joins: [{ kind: 'blind', a: 'x1.a', b: 'p1.back@120' }, { kind: 'blind', a: 'x1.b', b: 'p2.front@120' }, { kind: 'blind', a: 'y1.a', b: 'p1.top@170' }],
      fasten: [{ screw: 'M4 button', through: ['plate'], into: 'x1.top', holes: 'plate.body', nut: 'slide-in' }, { screw: 'M4 button', through: ['plate2'], into: 'y1.top', holes: 'plate2.body', nut: 'slide-in' }] };
    const write = (x = a) => fs.writeFileSync(file, JSON.stringify(x));
    write();
    const probe = (order = false) => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
      const { buildAssembly, checkAssembly } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/assembly.mjs')).href)});
      const s = await buildAssembly('frame/frame'), out = { hardware: s.hardware.map((h) => [h.fasten, h.kind, h.name]), findings: checkAssembly(s).filter((f) => /^(fasten|frame\\.(nut|preload)|join\\.geometry|overlap)/.test(f.code)).map(({ level, code, text, values, refs }) => ({ level, code, text, values, refs })) };
      if (${order}) { const { withPreload } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/slotnuts.mjs')).href)}), { orderOf } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/order.mjs')).href)}); out.order = withPreload(s, orderOf(s)); }
      console.log(JSON.stringify(out));
    `], { cwd: ws, encoding: 'utf8', env: { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') } }));
    let r = probe(true);
    const by = (code, fasten) => r.findings.filter((x) => x.code === code && (fasten == null || x.refs?.fasten === fasten));
    // into a slot: the nut is the one made for the slot and thread, of the kind asked, two per plate with an M4x8 each
    assert.deepEqual(r.hardware.filter((h) => h[0] < 2), [[0, 'screw', 'M4x8 button'], [0, 'nut', 'slot-nut-6-misumi-m4-slide-in'], [0, 'screw', 'M4x8 button'], [0, 'nut', 'slot-nut-6-misumi-m4-slide-in'],
      [1, 'screw', 'M4x8 button'], [1, 'nut', 'slot-nut-6-misumi-m4-slide-in'], [1, 'screw', 'M4x8 button'], [1, 'nut', 'slot-nut-6-misumi-m4-slide-in']]);
    for (const code of ['fasten.holes', 'fasten.slot', 'fasten.clearance', 'fasten.end', 'fasten.length', 'fasten.engagement', 'fasten.seat', 'fasten.access', 'overlap', 'join.geometry']) assert.deepEqual([...new Set(by(code).map((x) => x.level))], ['pass'], `${code}: ${JSON.stringify(by(code).filter((x) => x.level !== 'pass'))}`);
    assert.deepEqual(by('fasten.slot', 0).map((x) => [x.values.distance, x.values.play, x.values.along]), [[0, 0.3, 140], [0, 0.3, 160]]);
    assert.match(by('fasten.end', 0)[0].text, /ends in a slide-in nut under the lips of x1's top slot: slot-nut-6-misumi-m4-slide-in, 4\.1 mm of M4 thread from 1\.2 to 5\.3 mm under the face, the slot's floor at 6 mm/);
    // the length: 3 mm of plate and the 2 mm lip under the head, a hex nut's height of thread (3.2 mm), the tip off the floor
    assert.match(by('fasten.length', 0)[0].text, /M4x8 button chosen, the shortest sold that fits: 5 mm under its head \(plate and the slot's 2 mm lip\), 3\.8 mm into its nut, its tip 5 mm into the slot and 1 mm short of its floor/);
    assert.deepEqual(by('fasten.engagement', 0).map((x) => x.values), [{ engaged: 3.8, need: 3.2, turns: 5.4 }]);
    // x1's slot is closed at both ends by joins: the slide-in nuts fail frame.nut, which names the drop-in
    assert.deepEqual(by('frame.nut', 0).map((x) => [x.level, x.refs.joins, x.refs.alternative]), [['fail', [0, 1], 'slot-nut-6-misumi-m4-drop-in']]);
    assert.match(by('frame.nut', 0)[0].text, /2 slide-in nuts \(slot-nut-6-misumi-m4-slide-in\) go into x1's top slot at 140 and 160 mm, between x1's end a \(the blind join of x1\.a to p1\.back@120\) and x1's end b \(the blind join of x1\.b to p2\.front@120\), which close it at both ends: a slide-in nut goes in only from an open end\. slot-nut-6-misumi-m4-drop-in \(an M4 drop-in nut\) goes in through the opening anywhere: give "nut": "drop-in"/);
    // y1's slot: closed at its corner by a join and capped at the other end, so its two nuts go in before the corner is made
    assert.deepEqual(by('frame.nut', 1).map((x) => x.level), ['pass']);
    assert.deepEqual(by('frame.preload').map((x) => [x.level, x.values.nuts, x.refs.item, x.refs.join, x.refs.end]), [['info', 2, 'y1', 2, 'a']]);
    const load = 'load 2 × slot-nut-6-misumi-m4-slide-in into y1\'s top slot through its end a, for plate2, before the blind join of y1.a to p1.top@170 closes it (or through end b before foot goes on)';
    assert.equal(by('frame.preload')[0].text, `plate2 to y1.top: ${load}`);
    // the assembly order lists them at the step that makes that join: before y1 goes on (a frame's build page shows the frame's build instead)
    assert.deepEqual(r.order.steps.filter((st) => st.load).map((st) => [st.items, st.load]), [[['y1'], [load]]]);
    // cad order, a frame's build: x1's nuts would be shut in by its second join, so it is refused with the slot and the join
    cad.refused(/frame\/frame: x1's top slot: 2 slide-in nuts \(slot-nut-6-misumi-m4-slide-in\) for plate would be shut in between the blind join of x1\.a to p1\.back@120 and the blind join of x1\.b to p2\.front@120: whichever of the two is made second shuts them in/, 'order', 'frame/frame');
    // with drop-ins, x1's plate passes frame.nut: they go in through the opening; cad list counts the nuts by name
    a.fasten[0].nut = 'drop-in'; write();
    r = probe();
    assert.deepEqual(by('frame.nut').map((x) => [x.refs.fasten, x.level]), [[0, 'pass'], [1, 'pass']]);
    assert.match(by('frame.nut', 0)[0].text, /2 drop-in nuts \(slot-nut-6-misumi-m4-drop-in\) go into x1's top slot through its opening, anywhere along it/);
    assert.match(cad('list', 'frame/frame'), /2 ×\s+slot-nut-6-misumi-m4-drop-in\s+.*plate to x1\.top/);
    // and with them, cad order loads y1's nuts on the step before the join that closes their slot
    assert.match(cad('order', 'frame/frame'), new RegExp(`\\d+\\. Load${load.slice(4).replace(/[().@×]/g, '\\$&')}: the next step makes that join\\n\\s+\\d+\\. y1 goes on, joined to p1`));
    // into a slot at a distance places the screws as a group: the plate's two screws at 140 and 160 mm, their middle at
    // 150, pass x1.top@150 (each held to it alone, both failed); 20 mm away fails once, with both screws' spread
    const placed = JSON.parse(JSON.stringify(a)); placed.fasten[0].nut = 'drop-in'; placed.fasten[0].into = 'x1.top@150'; write(placed); r = probe();
    assert.deepEqual(by('fasten.slot', 0).map((x) => x.level), ['pass', 'pass', 'pass']);
    assert.ok(by('fasten.slot', 0).some((x) => /the middle of its 2 screws \(140 to 160 mm from x1's end a\) is 150 mm along x1's top slot, where into says x1\.top@150$/.test(x.text)));
    placed.fasten[0].into = 'x1.top@170'; write(placed); r = probe();
    assert.deepEqual(by('fasten.slot', 0).filter((x) => x.level === 'fail').map((x) => [x.values.along, x.values.wanted, x.values.distance]), [[150, 170, 20]]);
    assert.match(by('fasten.slot', 0).find((x) => x.level === 'fail').text, /the middle of its 2 screws \(140 to 160 mm from x1's end a\) is 150 mm along x1's top slot, and into says x1\.top@170, 170 mm: 20 mm apart, where their holes give 0\.3 mm\. Move plate 20 mm along x1/);
    // one place written two ways: p1's own access hole at front@120 and the join's at front.1@120 are one hole, sized for
    // the button head's 3 mm key (m5.button_key), not a cap screw's 4 mm
    const twice = JSON.parse(JSON.stringify(a)); twice.fasten[0].nut = 'drop-in'; twice.items[0].beam.ops = [{ op: 'access', at: 'front@120', thread: 'M5', head: 'button', through: 'beam' }]; write(twice);
    assert.equal((cad('list', 'frame/frame').split('\n').find((l) => /\sp1$/.test(l)).match(/access Ø[\d.]+ at front/g) || []).length, 1);
    const sheetOf = cad('beams', 'frame/frame').match(/mark \w+ \([^)]*\bp1\b[^)]*\), 1:\d+: (\S+)/)[1], sheet = fs.readFileSync(path.join(ws, sheetOf), 'utf8');
    assert.match(sheet, /access hole Ø5\.3 mm in front\.1, 120 mm from end a \(80 from end b\), 14 mm deep \(through to the far side\) for a 3 mm key/);
    assert.doesNotMatch(sheet, /4 mm key/);
    // a plate 2.999 mm thick: the stack is said to a hundredth, never "4.999 mm under its head"
    const fine = JSON.parse(JSON.stringify(a)); fine.fasten[0].nut = 'drop-in'; fine.items[5].set = { thick: 2.999 }; write(fine); r = probe();
    assert.match(by('fasten.length', 0)[0].text, /M4x8 button chosen, the shortest sold that fits: 5 mm under its head \(plate and the slot's 2 mm lip\), 3\.8 mm into its nut/);
    // a plate drawn for slots 30 mm apart across a 2040's top face, whose slots are 20 mm apart: each screw 5 mm off
    const wide = JSON.parse(JSON.stringify(a));
    wide.items[2].beam.profile = '2040-misumi-hfs5'; wide.items[2].from = [0, 0, 10]; wide.items[2].to = [300, 0, 10]; wide.joins = [];
    wide.items[5] = { id: 'plate', object: 'plate', at: [150, 0, 20], rotate: [0, 0, 90], set: { pitch: 30 } };
    write(wide); r = probe();
    assert.deepEqual(by('fasten.slot', 0).map((x) => [x.level, x.values.distance, x.values.play]), [['fail', 5, 0.3], ['fail', 5, 0.3]]);
    assert.match(by('fasten.slot', 0)[0].text, /plate's hole is 5 mm off the centre line of x1's top\.[12] slot, where its 4\.6 mm hole lets an M4 screw move 0\.3 mm: the screw meets the face beside the slot, not its nut\. x1's top slots are 20 mm apart/);
    // a 4 mm plate: no sold M4 length has a nut's height of thread and stops short of the floor
    const thick = JSON.parse(JSON.stringify(a)); thick.items[5].set = { thick: 4 }; thick.items[5].at = [150, 0, 10]; thick.fasten.length = 1; write(thick);
    r = probe();
    assert.deepEqual(by('fasten.length', 0).map((x) => x.level), ['fail']);
    assert.match(by('fasten.length', 0)[0].text, /no M4 button screw is sold from 8\.4 to 9\.7 mm long, what 6 mm under its head \(plate and the slot's 2 mm lip\) leaves: 3\.2 mm in the nut and 0\.3 mm kept off the slot's floor \(M4x8 engages too little, M4x10 reaches the floor\)/);
    // M4x10 given: it reaches the floor
    thick.fasten[0].screw = 'M4x10 button'; write(thick); r = probe();
    assert.match(by('fasten.length', 0)[0].text, /M4x10 button reaches the slot's floor: with 6 mm under its head its tip goes 6 mm into x1's top slot, whose floor is 6 mm under the face/);
    // refused by name: a slot the face has not got, a kind not made for the thread, a slot nut's kind into a part
    const refused = (change, pattern) => { const b = JSON.parse(JSON.stringify(a)); change(b); write(b); cad.refused(pattern, 'check', 'frame/frame'); };
    refused((b) => { b.fasten[0].into = 'x1.top.2'; }, /fasten 1: x1's top face has 1 slot: into names x1\.top\.1/);
    refused((b) => { b.fasten[0].screw = 'M5 button'; b.fasten[0].nut = 'drop-in'; }, /fasten 1: no M5 drop-in nut is made for profile-2020-misumi-hfs5's top face/);
    refused((b) => { b.fasten[0].nut = 'wing'; }, /fasten 1: into a slot, "nut" is the slot nut's kind, slide-in, drop-in/);
    refused((b) => { b.fasten[0].into = 'plate2'; }, /fasten 1: "nut" is true \(a hexagon nut\) or hex, square, lock \(got "drop-in"\): a drop-in nut goes in a beam's slot, so "into" names the slot \(x1\.top\)/);
    refused((b) => { b.fasten[0].into = 'x1.top@400'; }, /fasten 1: "top\.1@400" is past the end of/);
    write(); assert.match(cad('check', 'frame/frame'), /files match their schemas/);
  } finally { done(); }
});

test('a frame\'s build: a box goes from bars to square in numbered steps, its two sides built flat and squared by their diagonals, a slot\'s nuts loaded before the join that closes it, each join\'s torque; a nut two joins would shut in is refused with the slot and the join', () => {
  const { ws, cad, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/frame', f), file = at('assemblies/box.json');
    fs.mkdirSync(at('assemblies'), { recursive: true });
    const t = (value, rule, min, max) => ({ value, unit: 'mm', rule, tweak: { min, max } });
    object(ws, 'frame/plate', { uses: ['x1c'], variables: { pitch: t(20, 'Between the holes', 5, 60), thick: t(3, 'The plate', 2, 10), length: t(40, 'Its length', 20, 100) } }, `import jscad from '@jscad/modeling'
const { cuboid } = jscad.primitives
export function main (v) {
  const plate = cuboid({ size: [v.length, 20, v.thick], center: [0, 0, v.thick / 2] })
  return v.ops.subtract(plate, ...[-1, 1].map((s) => v.fixings.hole('M4', { depth: v.thick, at: [s * v.pitch / 2, 0, v.thick] })))
}
`);
    object(ws, 'frame/cap', {}, `import jscad from '@jscad/modeling'
const { cuboid } = jscad.primitives
export function main () { return cuboid({ size: [20, 20, 3], center: [0, 0, 1.5] }) }
`);
    const pj = JSON.parse(fs.readFileSync(at('project.json'), 'utf8')); fs.writeFileSync(at('project.json'), JSON.stringify({ ...pj, material: 'PLA' }));
    // a 300 mm box of 2020, the kind chapter 16 builds: four posts, x rails at z 30 and 250, y rails at z 10 and 290,
    // every end blind-joined into a post; a foot and a cap on each post; a bracket on p1's back face above x3, on
    // slide-in nuts, and a plate on x1's top on drop-in nuts
    const P = { profile: '2020-misumi-hfs5' }, items = [], joins = [];
    [[10, 10], [290, 10], [290, 250], [10, 250]].forEach(([x, y], i) => items.push({ id: `p${i + 1}`, beam: P, from: [x, y, 0], to: [x, y, 300] }));
    for (const [n, y, pa, pb, z] of [['x1', 10, 'p1', 'p2', 30], ['x2', 250, 'p4', 'p3', 30], ['x3', 10, 'p1', 'p2', 250], ['x4', 250, 'p4', 'p3', 250]]) {
      items.push({ id: n, beam: P, from: [20, y, z], to: [280, y, z] });
      joins.push({ kind: 'blind', a: `${n}.a`, b: `${pa}.back@${z}` }, { kind: 'blind', a: `${n}.b`, b: `${pb}.front@${z}` });
    }
    for (const [n, x, pa, pb, z] of [['y1', 10, 'p1', 'p4', 10], ['y2', 290, 'p2', 'p3', 10], ['y3', 10, 'p1', 'p4', 290], ['y4', 290, 'p2', 'p3', 290]]) {
      items.push({ id: n, beam: P, from: [x, 20, z], to: [x, 240, z] });
      joins.push({ kind: 'blind', a: `${n}.a`, b: `${pa}.top@${z}` }, { kind: 'blind', a: `${n}.b`, b: `${pb}.bottom@${z}` });
    }
    for (let i = 1; i <= 4; i++) items.push({ id: `foot${i}`, object: 'cap', at: `p${i}.a` }, { id: `cap${i}`, object: 'cap', at: `p${i}.b` });
    items.push({ id: 'plate', object: 'plate', at: [150, 10, 40] }, { id: 'bracket', object: 'plate', at: [20, 10, 280], rotate: [0, 90, 0], set: { pitch: 16, length: 30 } });
    const fasten = [{ screw: 'M4 button', through: ['plate'], into: 'x1.top', holes: 'plate.body', nut: 'drop-in' }, { screw: 'M4 button', through: ['bracket'], into: 'p1.back', holes: 'bracket.body', nut: 'slide-in' }];
    const write = (nut = 'drop-in') => { fasten[0].nut = nut; fs.writeFileSync(file, JSON.stringify({ title: 'Box', kind: 'fit', items, joins, fasten })); };
    write();
    const text = cad('order', 'frame/box'), steps = text.split('\n').filter((l) => /^\s+\d+\. /.test(l)).map((l) => l.trim());
    // from bars to square: cut, drill and tap, side 1 flat, squared; side 2 flat, squared; the y rails on side 1; side 2
    // on as one; the other two bays squared; then the rest. The bracket's nuts (272 and 288 mm up p1's back slot) go in
    // through end b once x3 is on: loaded through end a before x1, they would leave x3's head at 250 mm no way in, x1's
    // head at 30 mm closing end a and the nuts end b
    assert.match(text, /^frame\/box: from bars to a square frame\n/);
    assert.match(steps[0], /^1\. Cut the beams: .*4 × E at 260 mm, 4 × F at 220 mm \(kerf 3 mm, 10 mm off each bar's first end; cut each mark against one stop\)$/);
    assert.match(text, /profile-2020-misumi-hfs5: buy 1 × 4000 mm\n\s+bar 1, 4000 mm: .*; offcut 834/);
    assert.match(steps[1], /^2\. Drill and tap each mark as its sheet shows/);
    assert.match(text, /E \(x1, x2, x3, x4\): tap M5 x 18\.5 at a; tap M5 x 18\.5 at b: exports\/frame\/box\.beam-E\.svg/);
    assert.deepEqual(steps.slice(2, 8).map((l) => l.replace(/: (?!the next).*$/, '')), ['3. Side 1 (p1, p2, x1 and x3), built flat on the bench',
      '4. Side 1 (p1, p2, x1 and x3)', '5. Side 1 (p1, p2, x1 and x3)', '6. Side 1 (p1, p2, x1 and x3)',
      '7. Load 2 × slot-nut-6-misumi-m4-slide-in into p1\'s back slot through its end b, for bracket, before cap1 goes on', '8. Square side 1, then tighten its joins']);
    assert.match(steps[3], /x1 goes on, joined to p1$/); assert.match(steps[5], /x3 goes on, joined to p1 and p2$/);
    // side 1's 260 × 200 opening (d = 328.024): x1 and x3 butt the posts, so their cuts set the width, 0.5 × 260 / d =
    // 0.39631 each; four blind joins land on the posts, 0.1 mm of play each along the height, 0.1 × 200 / d = 0.06097.
    // Worst 2 × 0.39631 + 4 × 0.06097 = 1.0365 -> 1.04; rss √(2 × 0.39631² + 4 × 0.06097²) = 0.5736 -> 0.57
    assert.match(steps[7], /measure both diagonals, inside corner to inside corner: each 328\.02 mm across the 260 × 200 mm opening; accept a difference of up to 1\.04 mm \(beams cut to ±0\.5 mm and the play of 4 joins, stacked worst case, every corner square; 0\.57 mm root-sum-square\), about 0\.19° of lean\. Push the corners of the long diagonal together until the two are within that, then tighten each join to its torque and measure again$/);
    assert.match(steps[12], /^13\. Square side 2, then tighten its joins: /); assert.match(steps[17], /^18\. Side 2 goes on as one, joined to y2, y4, y1 and y3$/);
    assert.match(steps[18], /^19\. Square the frame, then tighten its joins: .*then tighten each join to its torque and measure again$/);
    // the 220 × 260 bays (d = 340.588): y1 and y3 butt the posts and set the 220 mm width, 2 × 0.5 × 220 / d = 0.64592;
    // four joins' play along the 260 mm posts, 4 × 0.1 × 260 / d = 0.30535: 0.9513 -> 0.95 (the posts' own cuts set nothing)
    assert.match(text, /p1, p4, y1 and y3: measure both diagonals, inside corner to inside corner: each 340\.59 mm across the 220 × 260 mm opening; accept a difference of up to 0\.95 mm/);
    assert.deepEqual(steps.slice(19).map((l) => l.replace(/^\d+\. /, '')), ['foot1, cap1 (cap) go on', 'bracket (plate) goes on', 'plate goes on', 'foot2, cap2, foot4, cap4, foot3, cap3 (cap) go on']);
    // each join's screw with its key and torque: the lips of the post's slot under the head take 3677 N on 17.9 mm²
    assert.match(text, /4\. Side 1 \(p1, p2, x1 and x3\): x1 goes on, joined to p1\n\s+blind join of x1\.a to p1\.back@30 \(1 × M5x12 button\) with a 3 mm hex key, to 3\.68 N m at most \(what the seat takes\)\n\s+Snug for now: tightened to its torque at step 8, once square\n/);
    assert.match(text, /Tightening, by kind of join:\n\s+blind \(16 joins, M5x12 button with a 3 mm hex key\): 3\.68 N m, at most/);
    const json = JSON.parse(cad('order', 'frame/box', '--json'));
    assert.deepEqual(json.frame.steps.map((x) => x.kind).join(' '), 'cut drill side join join join load square side join join join square join join join join join square mount mount mount mount');
    // x3 slides down the posts from their end b (z up), its heads clear of the nuts, which are not in yet
    assert.deepEqual(json.frame.steps[5].dir, [0, 0, 1]);
    // what each step shows: side 2 on the bench away from side 1, then the whole frame as side 2 goes on as one, along its posts
    const st = json.frame.steps;
    assert.deepEqual([st[0].shown, st[9].shown.sort(), st[9].now, st[12].shown.sort(), st[17].now, st[17].shown.length, st[17].dir.map(Math.abs)], [[], ['p3', 'x2'], ['x2'], ['p3', 'p4', 'x2', 'x4'], ['p3', 'p4', 'x2', 'x4'], 12, [0, 0, 1]]);
    assert.deepEqual(json.frame.notFlat, []);
    assert.deepEqual(json.frame.sides.map((x) => x.beams), [['p1', 'p2', 'x1', 'x3'], ['p3', 'p4', 'x2', 'x4']]);
    assert.deepEqual(json.frame.bays.map((x) => [x.beams.join(), x.width, x.height, x.square.diagonal, x.square.accept]), [['p1,p2,x1,x3', 260, 200, 328.02, 1.04], ['p1,p4,y1,y3', 220, 260, 340.59, 0.95], ['p2,p3,y2,y4', 220, 260, 340.59, 0.95], ['p3,p4,x2,x4', 260, 200, 328.02, 1.04]]);
    assert.deepEqual(json.frame.torques.map((x) => [x.kind, x.joins, x.torque]), [['blind', 16, 3.68]]);
    // on cad check: frame.square for each bay, and the seat under a blind join's head with what its lips take
    const r = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
      const { buildAssembly, checkAssembly } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/assembly.mjs')).href)});
      const { buildData } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/buildpage.mjs')).href)});
      const { frameBuild, frameStepPictures } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/framebuild.mjs')).href)});
      const s = await buildAssembly('frame/box'), f = checkAssembly(s), page = (await buildData(s)).build, b = page.frame, pics = frameStepPictures(s, frameBuild(s));
      console.log(JSON.stringify({ order: page.order, pictures: pics.map((p) => p.n).join(), bench: [...new Set(pics.find((p) => p.n === 10).parts.map((p) => p.item))].sort(), moving: [...new Set(pics.find((p) => p.n === 10).parts.filter((p) => p.role === 'part').map((p) => p.item))], square: f.filter((x) => x.code === 'frame.square').map((x) => [x.level, x.refs.beams.join(), x.values.accept]), nut: f.find((x) => x.code === 'frame.nut' && /bracket/.test(x.text)).text, preload: f.find((x) => x.code === 'frame.preload').refs, steps: f.find((x) => x.code === 'assembly.order').values.steps, seat: f.find((x) => x.code === 'fasten.seat' && /x1\\.a/.test(x.text)), page: { steps: b.steps.length, bays: b.bays.map((x) => x.diagonal), torques: b.torques.length, stuck: b.stuck } }));
    `], { cwd: ws, encoding: 'utf8', env: { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') } }));
    // frame.nut and frame.preload name every closure on the nuts' way: both heads, and foot1 at end a beyond them
    assert.match(r.nut, /go into p1's back slot before a join closes its way, from end a, past 30 and 250 mm \(foot1 off until then\), before the first made of the blind join of x1\.a to p1\.back@30 and the blind join of x3\.a to p1\.back@250, each of which closes that way \(or through end b before cap1 goes on\) \(frame\.preload\)$/);
    assert.deepEqual([r.preload.joins, r.preload.way], [[4, 0], 'a']);
    assert.equal(r.steps, 23, 'cad check counts the frame build\'s steps');
    assert.deepEqual(r.square, [['info', 'p1,p2,x1,x3', 1.04], ['info', 'p1,p4,y1,y3', 0.95], ['info', 'p2,p3,y2,y4', 0.95], ['info', 'p3,p4,x2,x4', 1.04]]);
    assert.deepEqual([r.seat.level, r.seat.values.area, r.seat.values.limit, r.seat.values.torque], ['pass', 17.94, 205, 3.68]);
    assert.match(r.seat.text, /on al6n01-t5 \(205 MPa\) the 17\.9 mm² either side of the opening takes 3677 N, a tightening of 3\.68 N m \(the lips' bending not counted: an estimate\)/);
    assert.deepEqual(r.page, { steps: 23, bays: [328.02, 340.59, 340.59, 328.02], torques: 1, stuck: null });
    // the build page gives the frame's build as its one sequence (no assembly order beside it), and the pictures of cad
    // order --preview are numbered as its steps are: step 10 shows side 2 on the bench, x2 going on to p3
    assert.equal(r.order, null);
    assert.equal(r.pictures, '3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23');
    assert.deepEqual([r.bench, r.moving], [['p3', 'x2'], ['x2']]);
    // the plate on slide-in nuts: x1's slot is closed by a join at each end, so whichever is made second shuts them in
    write('slide-in');
    const refused = cad.run('order', 'frame/box');
    assert.equal(refused.status, 1);
    assert.equal(refused.stdout.trim(), 'frame/box: x1\'s top slot: 2 slide-in nuts (slot-nut-6-misumi-m4-slide-in) for plate would be shut in between the blind join of x1.a to p1.back@30 and the blind join of x1.b to p2.front@30: whichever of the two is made second shuts them in, and a nut loaded before it can never be taken out or replaced: give "nut": "drop-in" (slot-nut-6-misumi-m4-drop-in), which goes in through the opening anywhere');
    const stuck = JSON.parse(cad.refused('"stuck"', 'order', 'frame/box', '--json')).frame.stuck;
    assert.deepEqual([stuck.item, stuck.place, stuck.joins, stuck.alternative], ['x1', 'top.1', [0, 1], 'slot-nut-6-misumi-m4-drop-in']);
    // every screw reached in the frame's own order: with x3 lowered to 70 mm it stands 15 mm over the plate's screws on
    // x1, so the plate goes on while side 1 is built, before x3, not with the rest at the end
    write();
    const base = JSON.parse(fs.readFileSync(file, 'utf8')), low = JSON.parse(JSON.stringify(base)), x3 = low.items.find((i) => i.id === 'x3');
    x3.from[2] = x3.to[2] = 70; low.joins = low.joins.map((j) => (j.a.startsWith('x3.') ? { ...j, b: j.b.replace('@250', '@70') } : j));
    fs.writeFileSync(file, JSON.stringify(low));
    const lowSteps = cad('order', 'frame/box').split('\n').filter((l) => /^\s+\d+\. /.test(l)).map((l) => l.trim().replace(/^\d+\. /, ''));
    assert.match(lowSteps[lowSteps.findIndex((l) => /^plate goes on$/.test(l)) + 1], /^Side 1 \(p1, p2, x1 and x3\): x3 goes on, joined to p1 and p2$/);
    // cad check counts the frame's build, and fasten.access names x3's step as cad order numbers it; where the build is
    // refused (the plate on slide-in nuts), it names no step of a build that is never printed
    const lowCheck = cad('check', 'frame/box'), x3Step = lowSteps.findIndex((l) => /x3 goes on/.test(l)) + 1;
    assert.match(lowCheck, new RegExp(`✓ goes together in ${lowSteps.length} steps from bars to a square frame \\(cad order\\), p1 first`));
    assert.match(lowCheck, new RegExp(`plate to x1\\.top, 2 M4 button screws: a 2\\.5 mm hex key reaches the head before x3 \\(step ${x3Step}\\) goes on over it`));
    low.fasten[0].nut = 'slide-in'; fs.writeFileSync(file, JSON.stringify(low));
    const lowRefused = cad.refused('✗ no build from bars to a square frame', 'check', 'frame/box');
    assert.match(lowRefused, /plate to x1\.top, 2 M4 button screws: a 2\.5 mm hex key reaches the head before x3 goes on over it/);
    assert.match(lowRefused, /✗ no build from bars to a square frame: x1's top slot: 2 slide-in nuts/);
    // a side goes on as one only where its joins let it: a middle rail m from x3 to x4 puts a head in x4's slot, which runs
    // across the posts' slots that the y rails' heads slide along, so side 2 is built on the frame beam by beam, and says why
    const mid = JSON.parse(JSON.stringify(base));
    mid.items.push({ id: 'm', beam: P, from: [150, 20, 250], to: [150, 240, 250] });
    mid.joins.push({ kind: 'blind', a: 'm.a', b: 'x3.back@130' }, { kind: 'blind', a: 'm.b', b: 'x4.front@130' });
    fs.writeFileSync(file, JSON.stringify(mid));
    const midText = cad('order', 'frame/box'), midJson = JSON.parse(cad('order', 'frame/box', '--json')).frame;
    assert.deepEqual(midJson.sides.map((x) => x.beams), [['p1', 'p2', 'x1', 'x3']]);
    assert.deepEqual(midJson.notFlat.map((x) => x.beams), [['p3', 'p4', 'x2', 'x4']]);
    assert.match(midJson.notFlat[0].why, /^the heads of its joins to the frame go into slots that run different ways \(the blind join of \w+\.b to p\d\.bottom@\d+ along p\d, the blind join of m\.b to x4\.front@130 along x4\), so they can't all slide in as it goes on$/);
    assert.match(midText, /The bay of p3, p4, x2 and x4 is built on the frame, not flat: the heads/);
    // m's heads go into x3's and x4's slots, each closed at both ends once its beam is joined: each screw is slid into its
    // slot from an end before that beam goes on, and m's join made with it in place (x4's slot runs across the way x4
    // goes on, down p4's slot, too)
    assert.match(midText, /\d+\. Slide an M5x12 button screw into x3's back slot head first, through its end a, to 130 mm, for the blind join of m\.a to x3\.back@130, before the blind join of x3\.a to p1\.back@250 is made: that join is made with it in place, the screw turned into m's end through the access hole\n\s+\d+\. Side 1 \(p1, p2, x1 and x3\): x3 goes on/);
    const midSteps = midText.split('\n').filter((l) => /^\s+\d+\. /.test(l)).map((l) => l.trim().replace(/^\d+\. /, '')), x4At = midSteps.indexOf('x4 goes on, joined to p4 and m');
    assert.match(midSteps[x4At - 1], /^Slide an M5x12 button screw into x4's front slot head first, through its end a, to 130 mm, for the blind join of m\.b to x4\.front@130, /);
    assert.doesNotMatch(midText, /Side 2/);
  } finally { done(); }
});

test('frame.heat: a frame grows with the air it runs in by its alloy\'s expansion, and a printed fitting near a heater is held to its plastic\'s softening point', () => {
  const { ws, cad, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/frame', f);
    fs.mkdirSync(at('assemblies'), { recursive: true });
    fs.writeFileSync(at('project.json'), JSON.stringify({ name: 'frame', material: 'PLA', objects: [] }));
    // one side of a 2020 box (posts 300 mm at x 10 and 290, rails at 30 and 250 mm), a printed PLA foot on p1 and a
    // printed end cap on p2's top; a heated bed's edge 30 mm under p1's foot
    const P = { profile: '2020-misumi-hfs5' }, items = [{ id: 'p1', beam: P, from: [10, 10, 0], to: [10, 10, 300] }, { id: 'p2', beam: P, from: [290, 10, 0], to: [290, 10, 300] }], joins = [];
    for (const [n, z] of [['x1', 30], ['x3', 250]]) { items.push({ id: n, beam: P, from: [20, 10, z], to: [280, 10, z] }); joins.push({ kind: 'blind', a: `${n}.a`, b: `p1.back@${z}` }, { kind: 'blind', a: `${n}.b`, b: `p2.front@${z}` }); }
    items.push({ id: 'foot1', fitting: { kind: 'foot', profile: '2020-misumi-hfs5' }, at: 'p1.a' }, { id: 'cap2', fitting: { kind: 'end-cap', profile: '2020-misumi-hfs5' }, at: 'p2.b' });
    const write = (name, heat) => fs.writeFileSync(at(`assemblies/${name}.json`), JSON.stringify({ title: 'Warm', kind: 'fit', items, joins, frame: { heat } }));
    const bed = { name: 'bed', at: [10, 10, -30], temperature: 60, reach: 30 };
    write('warm', { air: 45, heaters: [bed] }); write('warmer', { air: 50 }); write('none', {}); write('bad', { air: 45, heaters: [{ ...bed, reach: 0 }] });
    const check = (name) => { const r = cad.run('check', `frame/${name}`, '--json'); const j = JSON.parse(r.stdout); assert.ok(j.findings, r.stdout); return j.findings.filter((x) => x.code === 'frame.heat'); };
    const warm = check('warm'), grow = warm.find((x) => x.values?.grows);
    // growth by hand, ΔT = 45 - 20 = 25 °C, α = 23.4e-6 /K (FRAME_HEAT.expansion, a community figure): the beams span
    // 280 mm in x (axis to axis), 300 mm in z: 23.4e-6 × 280 × 25 = 0.1638 mm and 23.4e-6 × 300 × 25 = 0.1755 mm
    assert.deepEqual([grow.values.change, grow.values.size, grow.values.grows], [25, [280, 0, 300], [0.1638, 0, 0.1755]]);
    assert.match(grow.text, /^at 45 °C the frame is 25 °C warmer than the 20 °C it was built in, so it grows by 0\.164 mm over the 280 mm its beams span in x, 0\.176 mm over the 300 mm its beams span in z; the longest beam, p1 \(300 mm\), by 0\.176 mm/);
    assert.deepEqual(grow.refs.expansion, ['FRAME_HEAT.expansion']);
    // the foot is within the bed's reach, so at 60 °C, over PLA's 57 °C (its heat deflection temperature); the cap is in
    // the 45 °C air, 12 °C under, past the 10 °C margin
    const foot = warm.find((x) => x.refs?.item === 'foot1');
    assert.equal(foot.level, 'fail'); assert.deepEqual([foot.values.temperature, foot.values.softening, foot.values.spare], [60, 57, -3]);
    assert.match(foot.text, /^foot1 \(foot-2020-misumi-hfs5, PLA\) works at 60 °C \(bed, [\d.]+ mm away\), 3 °C over its 57 °C softening point/);
    const pass = warm.find((x) => x.level === 'pass');
    assert.match(pass.text, /^1 printed fitting stays at least 10 °C under its plastic's softening point: the nearest is cap2 \(PLA\), 45 °C \(the air\) against 57 °C/);
    // at 50 °C both are within 10 °C of softening: each warned
    assert.deepEqual(check('warmer').filter((x) => x.refs?.item).map((x) => [x.level, x.refs.item, x.values?.spare]), [['warn', 'foot1', 7], ['warn', 'cap2', 7]]);
    // refused by name
    assert.match(check('none')[0].text, /frame\.heat gives neither air nor heaters/);
    assert.match(check('bad')[0].text, /frame\.heat\.heaters 1: reach is how far from its middle a part is taken at its temperature, mm above 0 \(got 0\)/);
  } finally { done(); }
});

test('frame.square: a bay\'s diagonals stack its cuts and its joins\' play, loosening the cut tolerance widens it by the hand stack, and cad measured takes the difference measured', () => {
  const { ws, cad, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/frame', f);
    fs.mkdirSync(at('assemblies'), { recursive: true });
    // one side of a 2020 box: posts p1 and p2 300 mm tall at x 10 and 290, rails x1 and x3 at z 30 and 250 blind-joined
    // into them. The opening is 260 × 200 mm (d = √(260² + 200²) = 328.024 mm)
    const P = { profile: '2020-misumi-hfs5' }, items = [{ id: 'p1', beam: P, from: [10, 10, 0], to: [10, 10, 300] }, { id: 'p2', beam: P, from: [290, 10, 0], to: [290, 10, 300] }], joins = [];
    for (const [n, z] of [['x1', 30], ['x3', 250]]) { items.push({ id: n, beam: P, from: [20, 10, z], to: [280, 10, z] }); joins.push({ kind: 'blind', a: `${n}.a`, b: `p1.back@${z}` }, { kind: 'blind', a: `${n}.b`, b: `p2.front@${z}` }); }
    const write = (name, frame) => fs.writeFileSync(at(`assemblies/${name}.json`), JSON.stringify({ title: 'Side', kind: 'fit', items, joins, ...(frame ? { frame } : {}) }));
    write('side'); write('loose', { cut: { tolerance: 1 } }); write('bad', { cut: { tolerance: -1 } });
    const check = (name, code = 'frame.square') => { const r = cad.run('check', `frame/${name}`, '--json'); const j = JSON.parse(r.stdout); assert.ok(j.findings, r.stdout); return j.findings.filter((x) => x.code === code); };
    const [side] = check('side'), [loose] = check('loose');
    // Hand stack, MISUMI's ±0.5 mm cut (its set's cut_tolerance): x1 and x3 butt the posts, so their cut lengths set the
    // 260 mm width, each 0.5 × 260 / 328.024 = 0.39631 mm of diagonal difference; the four blind joins land on the posts,
    // each 0.1 mm of play (JOIN_PLAY.blind, an estimate) along the 200 mm height, 0.1 × 200 / 328.024 = 0.06097 mm.
    // Worst: 2 × 0.39631 + 4 × 0.06097 = 1.03651 mm. The posts' own cut lengths set no opening, so they add nothing.
    assert.equal(side.values.accept, 1.04); assert.equal(side.predict.value, 1.04); assert.equal(side.predict.name, 'frame.square.p1-p2-x1-x3');
    assert.deepEqual(side.values.terms.map((x) => [x.term, x.value, x.kind]), [['x1 cut', 0.396, 'spec'], ['x3 cut', 0.396, 'spec'], ['join 1 (blind) play', 0.061, 'estimate'], ['join 2 (blind) play', 0.061, 'estimate'], ['join 3 (blind) play', 0.061, 'estimate'], ['join 4 (blind) play', 0.061, 'estimate']]);
    assert.deepEqual(side.refs.tolerance, ['profile-2020-misumi-hfs5.cut_tolerance']);
    assert.match(side.text, /It rests on estimates \(join 1 \(blind\) play, .*\): measure the diagonals once it is squared and tightened, and give their difference to cad measured frame\/side frame\.square\.p1-p2-x1-x3=<mm>/);
    // loosened to ±1 mm (a hand saw, frame.cut.tolerance): the two cut terms double, 2 × 1 × 260 / 328.024 = 1.58524, so
    // the accepted difference widens by 2 × 0.5 × 260 / 328.024 = 0.79262 mm, to 1.03651 + 0.79262 = 1.82913 -> 1.83
    assert.equal(loose.values.accept, 1.83); assert.ok(Math.abs(loose.values.accept - side.values.accept - 0.79262) < 0.011);
    assert.deepEqual(loose.values.terms.slice(0, 2).map((x) => [x.value, x.kind]), [[0.793, 'given'], [0.793, 'given']]);
    assert.deepEqual(loose.refs.tolerance, ['the assembly\'s frame.cut.tolerance']);
    // the cut list takes the workshop's tolerance too
    assert.ok(check('loose', 'frame.cut').some((x) => /mark C \(x1, x3\): 2 beams of 260 mm, each cut to ±1 mm, may differ by up to 2 mm/.test(x.text)));
    // refused by name
    const bad = cad.run('check', 'frame/bad', '--json');
    assert.match(JSON.parse(bad.stdout).error.message, /frame\.cut\.tolerance is how far a cut may be from the length asked, either way, a number of mm, 0 or more \(got -1\)/);
    // measured: 0.6 mm is within, so it passes; 1.5 mm is more than its parts allow, so it leans
    assert.match(cad('measured', 'frame/side', 'frame.square.p1-p2-x1-x3=0.6', '--source', 'tape, inside corners'), /frame\.square\.p1-p2-x1-x3: measured 0\.6 mm, predicted 1\.04/);
    let [m] = check('side');
    assert.equal(m.level, 'pass'); assert.equal(m.values.measured, 0.6); assert.match(m.text, /Measured 0\.6 mm \(\d{4}-\d\d-\d\d\): within what its cuts and joins allow\./);
    cad('measured', 'frame/side', 'frame.square.p1-p2-x1-x3=1.5');
    [m] = check('side');
    assert.equal(m.level, 'warn'); assert.match(m.text, /Measured 1\.5 mm \(\d{4}-\d\d-\d\d\): 1\.44 times what its cuts and joins allow, so it leans: loosen its joins/);
    // the ledger keeps both, predicted against measured
    const ledger = fs.readFileSync(at('ledger.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.deepEqual(ledger.map((e) => [e.name, e.predicted, e.measured]), [['frame.square.p1-p2-x1-x3', 1.04, 0.6], ['frame.square.p1-p2-x1-x3', 1.04, 1.5]]);
    // a difference recorded the other way round (d1 - d2 with d2 the longer) is the same lean: its size is what counts.
    // -3 mm is 3 / 1.04 = 2.885 times what its parts allow, so it leans; -0.6 mm is within, so it passes
    cad('measured', 'frame/side', 'frame.square.p1-p2-x1-x3=-3');
    [m] = check('side');
    assert.equal(m.level, 'warn'); assert.equal(m.values.measured, -3); assert.match(m.text, /Measured -3 mm \(\d{4}-\d\d-\d\d, 3 mm either way\): 2\.88 times what its cuts and joins allow, so it leans/);
    cad('measured', 'frame/side', 'frame.square.p1-p2-x1-x3=-0.6');
    [m] = check('side');
    assert.equal(m.level, 'pass'); assert.match(m.text, /Measured -0\.6 mm \(\d{4}-\d\d-\d\d, 0\.6 mm either way\): within what its cuts and joins allow\./);
  } finally { done(); }
});

test('v.frames reads the workspace\'s own profile sets before the kit\'s, and a beam item takes one by name', async () => {
  const { ws, cad, done } = workspace();
  try {
    const { framesContext, designFrames } = await import(pathToFileURL(path.join(path.dirname(BIN), '../lib/frames.mjs')).href);
    const kit = JSON.parse(fs.readFileSync(path.join(ROOT_MODULES, '@rulecad/rules/profile-2020-misumi-hfs5.json'), 'utf8'));
    const own = { ...kit, name: 'profile-2020-mine', rules: { ...kit.rules, width: { ...kit.rules.width, value: 21 }, height: { ...kit.rules.height, value: 21 } } };
    fs.mkdirSync(path.join(ws, 'rules'), { recursive: true }); fs.writeFileSync(path.join(ws, 'rules/profile-2020-mine.json'), JSON.stringify(own));
    const context = framesContext(path.join(ws, 'rules'));
    assert.deepEqual(Object.keys(context.sets), ['profile-2020-mine']);
    const v = designFrames(context);
    assert.equal(v.profileModel('2020-mine').width, 21);
    assert.equal(v.profileModel('2020-misumi-hfs5').width, 20); // the kit's, as before
    assert.equal(v.beamModel('2020-mine', { length: 100 }).profile.width, 21);
    assert.throws(() => designFrames({}).profileModel('2020-mine'), /no profile "2020-mine"/);
    const before = context.hash; fs.writeFileSync(path.join(ws, 'rules/profile-2020-mine.json'), JSON.stringify({ ...own, title: 'changed' }));
    assert.notEqual(framesContext(path.join(ws, 'rules')).hash, before); // (a build that reads it is made again)
    fs.mkdirSync(path.join(ws, 'projects/frame/assemblies'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'projects/frame/assemblies/one.json'), JSON.stringify({ title: 'One', kind: 'fit', items: [{ id: 'x1', beam: { profile: '2020-mine' }, from: [0, 0, 0], to: [0, 250, 0] }] }));
    assert.match(cad('list', 'frame/one'), /1 ×\s+profile-2020-mine x 250 mm\s+a beam/);
  } finally { done(); }
});
