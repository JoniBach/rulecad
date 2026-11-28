// cad's tests of fittings on a frame: printed and bought brackets, panels, doors, ends and feet. The shared helpers are in ./helpers.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { workspace, BIN, ROOT_MODULES, CAD } from './helpers.mjs';

test('printed fittings: a bracket join with "fitting": "printed" adds a printed corner bracket on the side with room, its two screws into slot nuts, its grams on the list and its own stiffness', () => {
  const { ws, cad, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/frame', f), file = at('assemblies/corner.json');
    fs.mkdirSync(at('assemblies'), { recursive: true });
    fs.writeFileSync(at('project.json'), JSON.stringify({ name: 'frame', material: 'PLA', objects: [] }));
    // y1 stands on x1's top face 100 mm from its end a; a printed bracket holds it
    const a = { title: 'Corner', kind: 'fit', items: [{ id: 'x1', beam: { profile: '2020-misumi-hfs5' }, from: [0, 0, 0], to: [300, 0, 0] }, { id: 'y1', beam: { profile: '2020-misumi-hfs5' }, from: [100, 0, 10], to: [100, 0, 210] }],
      joins: [{ kind: 'bracket', a: 'y1.a', b: 'x1.top@100', fitting: 'printed' }] };
    const write = (x = a) => fs.writeFileSync(file, JSON.stringify(x));
    write();
    const probe = () => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
      const { buildAssembly, checkAssembly } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/assembly.mjs')).href)});
      const s = await buildAssembly('frame/corner'), id = s.items.find((i) => i.fitting)?.id, br = s.parts.filter((p) => p.item === id), o = s.objects.find((x) => x.id === id);
      const lo = [0, 1, 2].map((k) => Math.min(...br.flatMap((p) => p.triangles.flat().map((v) => v[k])))), hi = [0, 1, 2].map((k) => Math.max(...br.flatMap((p) => p.triangles.flat().map((v) => v[k]))));
      console.log(JSON.stringify({ items: s.items.map((i) => [i.id, i.role]), box: [lo, hi].map((v) => v.map((x) => +x.toFixed(2))), fitting: o && { name: o.fitting.name, thickness: o.fitting.thickness, leg: o.fitting.leg, bending: o.fitting.stiffness.bending, grams: o.fitting.grams, margin: o.fitting.margin },
        hardware: s.hardware.map((h) => [h.fasten, h.kind, h.name]), findings: checkAssembly(s).filter((f) => /^(join|fasten|overlap|frame|fitting)/.test(f.code)).map(({ level, code, text, values, refs }) => ({ level, code, text, values, refs })) }));
    `], { cwd: ws, encoding: 'utf8', env: { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') } }));
    let r = probe();
    const by = (code) => r.findings.filter((x) => x.code === code);
    assert.deepEqual(by('fitting.margin').map((x) => [x.level, x.values.load, x.refs.item]), [['pass', 100, 'y1-x1-bracket']]);
    // the bracket is an item of its own, a printed part, on the side of y1 with more of x1 (toward x1's end b)
    assert.deepEqual(r.items, [['x1', 'reference'], ['y1', 'reference'], ['y1-x1-bracket', 'part']]);
    assert.deepEqual(r.fitting, { name: 'bracket-2020-misumi-hfs5-m5', thickness: 6.4, leg: 24, bending: r.fitting.bending, grams: r.fitting.grams, margin: r.fitting.margin });
    assert.ok(r.fitting.margin >= 2 && r.fitting.grams > 0 && r.fitting.bending > 0);
    // its corner on y1's back face (x = 110) and x1's top (z = 10), its legs 24 mm along each, its tongues 1 mm into the slots
    assert.deepEqual(r.box, [[109, -10, 9], [134, 10, 34]]);
    // two screws, one into each beam's slot, each into a slide-in nut, the length it was thickened for
    assert.deepEqual(r.hardware, [[0, 'screw', 'M5x12 cap'], [0, 'nut', 'slot-nut-6-misumi-m5-slide-in'], [1, 'screw', 'M5x12 cap'], [1, 'nut', 'slot-nut-6-misumi-m5-slide-in']]);
    for (const code of ['fasten.holes', 'fasten.slot', 'fasten.clearance', 'fasten.end', 'fasten.length', 'fasten.engagement', 'fasten.seat', 'fasten.access', 'overlap', 'join.geometry', 'frame.nut']) assert.deepEqual([...new Set(by(code).map((x) => x.level))], ['pass'], `${code}: ${JSON.stringify(by(code).filter((x) => x.level !== 'pass'))}`);
    assert.deepEqual(by('fasten.slot').map((x) => x.values.along), [128.05, 18.05]);
    assert.match(by('fasten.length')[0].text, /M5x12 cap chosen, the shortest sold that fits: 8\.4 mm under its head \(y1-x1-bracket and the slot's 2 mm lip\), 4\.1 mm into its nut, its tip 5\.6 mm into the slot and 0\.4 mm short of its floor/);
    // the join's stiffness is the bracket's own by finite elements now, and still says what it leaves out
    assert.deepEqual(by('join.stiffness').map((x) => [x.values.bending, x.refs.item]), [[r.fitting.bending, 'y1-x1-bracket']]);
    assert.match(by('join.stiffness')[0].text, /y1-x1-bracket's own by finite elements \(\d+(\.\d+)? N\/mm at its screw under 100 N, [\d.]+ times under its plastic's strength, [\d.]+ g\).*until the joint rig \(issue 264\) measures it/);
    assert.deepEqual(by('join.fitting'), []);
    // cad check says the bracket's own findings too: its margin at the named load, its mass, the screw it was thickened for
    const check = cad('check', 'frame/corner');
    assert.match(check, /y1-x1-bracket: under 100 N across beam a at the upright's screw, 18\.05 mm from the corner, opening or closing it, the stress peaks at [\d.]+ MPa away from the screws, [\d.]+ times under PLA's 39 MPa \(within the 2× asked\)/);
    assert.match(check, /y1-x1-bracket: it weighs [\d.]+ g of pla/); assert.match(check, /y1-x1-bracket: M5x12 cap: through 6\.4 mm of fitting/);
    // cad list: the printed bracket by its grams, the two screws and nuts
    const list = cad('list', 'frame/corner');
    assert.match(list, /Printed \(pla\)\s+[\d.]+ g\s+about \d+ min\s+y1-x1-bracket \(fitting:bracket-2020-misumi-hfs5-m5\)/);
    assert.match(list, /2 ×\s+M5x12 cap/); assert.match(list, /2 ×\s+slot-nut-6-misumi-m5-slide-in/);
    // y1 near x1's end b: the bracket goes on y1's other side, toward x1's end a
    a.items[1].from = [250, 0, 10]; a.items[1].to = [250, 0, 210]; a.joins[0].b = 'x1.top@250'; write();
    r = probe();
    assert.deepEqual(r.box, [[216, -10, 9], [241, 10, 34]]);
    assert.deepEqual(r.findings.filter((x) => x.level === 'fail'), []);
    // braced: the same screws, a stiffer bracket, every check still passing
    a.items[1].from = [100, 0, 10]; a.items[1].to = [100, 0, 210]; a.joins[0].b = 'x1.top@100'; a.joins[0].brace = true; write();
    const braced = probe();
    assert.equal(braced.fitting.name, 'bracket-2020-misumi-hfs5-m5-braced'); assert.ok(braced.fitting.bending > 1.5 * r.fitting.bending, `${braced.fitting.bending} against ${r.fitting.bending}`);
    assert.deepEqual(braced.findings.filter((x) => x.level === 'fail').map((x) => x.text), []);
    // the same join on 4040: the same generator, M8 into roll-in nuts; each head's seat whole out to its 13 mm (the
    // hole under it is round to its top, its roof cut flat), every check passing
    write({ ...a, items: [{ id: 'x1', beam: { profile: '4040-item-8' }, from: [0, 0, 0], to: [300, 0, 0] }, { id: 'y1', beam: { profile: '4040-item-8' }, from: [100, 0, 20], to: [100, 0, 220] }], joins: [{ kind: 'bracket', a: 'y1.a', b: 'x1.top@100', fitting: 'printed' }] });
    const big = probe();
    assert.deepEqual([big.fitting.name, big.hardware.map((h) => h[2])], ['bracket-4040-item-8-m8', ['M8x20 cap', 'slot-nut-8-i-motedis-m8-roll-in', 'M8x20 cap', 'slot-nut-8-i-motedis-m8-roll-in']]);
    assert.deepEqual(big.findings.filter((x) => x.level === 'fail').map((x) => x.text), []);
    assert.deepEqual(big.findings.filter((x) => x.code === 'fasten.seat').map((x) => x.level), ['pass', 'pass']);
    // a bought bracket still waits for its release, and says the printed one is there
    write({ ...a, joins: [{ kind: 'bracket', a: 'y1.a', b: 'x1.top@100', fitting: 'bought' }] });
    r = probe();
    assert.deepEqual([r.items.length, r.hardware, by('join.fitting').map((x) => x.level)], [2, [], ['warn']]);
    assert.match(by('join.fitting')[0].text, /A printed one is drawn now: give "fitting": "printed"/);
    // refused by name: a brace on a join with no printed fitting, a bracket with no room on a short beam
    const refused = (change, pattern) => { const b = JSON.parse(JSON.stringify(a)); change(b); write(b); cad.refused(pattern, 'check', 'frame/corner'); };
    refused((b) => { b.joins = [{ kind: 'blind', a: 'y1.a', b: 'x1.top@100', brace: true }]; }, /join 1: brace is for a printed fitting: give "fitting": "printed" on a bracket, gusset, splice join, or leave brace out/);
    refused((b) => { b.items[0].to = [40, 0, 0]; b.items[1].from = [20, 0, 10]; b.items[1].to = [20, 0, 210]; b.joins[0] = { kind: 'bracket', a: 'y1.a', b: 'x1.top@20', fitting: 'printed' }; }, /join 1: a printed bracket's 24 mm leg runs 14 mm past x1's end b: it goes on the side of y1 with more of x1, and there is only 10 mm there/);
    write();
    assert.match(cad('check', 'frame/corner'), /files match their schemas/);
  } finally { done(); }
});

test('printed fittings: a gusset join puts an L plate on a corner and a T where b runs on both sides, a splice join a plate across two ends, each screwed into both beams\' slots', () => {
  const { ws, cad, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/frame', f), file = at('assemblies/plates.json');
    fs.mkdirSync(at('assemblies'), { recursive: true });
    fs.writeFileSync(at('project.json'), JSON.stringify({ name: 'frame', material: 'PLA', objects: [] }));
    const beam = (id, from, to) => ({ id, beam: { profile: '2020-misumi-hfs5' }, from, to });
    // y1 stands on x1's top face at its end a: a corner, so an L gusset on the faces that look along -y
    const a = { title: 'Plates', kind: 'fit', items: [beam('x1', [0, 0, 0], [300, 0, 0]), beam('y1', [10, 0, 10], [10, 0, 210])], joins: [{ kind: 'gusset', a: 'y1.a', b: 'x1.top@10', fitting: 'printed' }] };
    const write = (x = a) => fs.writeFileSync(file, JSON.stringify(x));
    const probe = () => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
      const { buildAssembly, checkAssembly } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/assembly.mjs')).href)});
      const s = await buildAssembly('frame/plates'), o = s.objects.find((x) => x.fitting), br = s.parts.filter((p) => p.item === o.id);
      const lo = [0, 1, 2].map((k) => Math.min(...br.flatMap((p) => p.triangles.flat().map((v) => v[k])))), hi = [0, 1, 2].map((k) => Math.max(...br.flatMap((p) => p.triangles.flat().map((v) => v[k]))));
      console.log(JSON.stringify({ id: o.id, fitting: { name: o.fitting.name, shape: o.fitting.shape, thickness: o.fitting.thickness, arm: o.fitting.arm }, box: [lo, hi].map((v) => v.map((x) => +x.toFixed(2))),
        hardware: s.hardware.map((h) => h.kind + ' ' + h.name), findings: checkAssembly(s).filter((f) => /^(join|fasten|overlap|frame)/.test(f.code)).map(({ level, code, text, values }) => ({ level, code, text, values })) }));
    `], { cwd: ws, encoding: 'utf8', env: { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') } }));
    const clean = (r) => r.findings.filter((x) => x.level === 'fail').map((x) => x.text);
    write(); let r = probe();
    assert.deepEqual([r.id, r.fitting.shape, r.fitting.name], ['y1-x1-gusset', 'L', 'gusset-l-2020-misumi-hfs5-m5']);
    assert.deepEqual(clean(r), []);
    // on the -y faces of both (x1's front, y1's bottom), the corner square over where they meet (x 0 to 20, z -10 to 10),
    // an arm along each, its tongues 1 mm into the slots
    assert.deepEqual(r.box, [[0, -10 - r.fitting.thickness, -10], [20 + r.fitting.arm, -9, 10 + r.fitting.arm]]);
    assert.equal(r.hardware.filter((h) => h.startsWith('screw')).length, 4); assert.equal(r.hardware.filter((h) => h.startsWith('nut')).length, 4);
    for (const code of ['fasten.holes', 'fasten.slot', 'fasten.length', 'fasten.engagement', 'overlap', 'join.geometry']) assert.ok(r.findings.some((x) => x.code === code && x.level === 'pass'), code);
    // in the middle of x1, a T: three arms, six screws
    a.items[1] = beam('y1', [150, 0, 10], [150, 0, 210]); a.joins[0].b = 'x1.top@150'; write(); r = probe();
    assert.deepEqual([r.fitting.shape, r.hardware.filter((h) => h.startsWith('screw')).length, clean(r)], ['T', 6, []]);
    // a splice: two beams end to end, a plate across the joint, two screws into each
    write({ title: 'Plates', kind: 'fit', items: [beam('x1', [0, 0, 0], [150, 0, 0]), beam('x2', [150, 0, 0], [300, 0, 0])], joins: [{ kind: 'splice', a: 'x2.a', b: 'x1.b', fitting: 'printed' }] }); r = probe();
    assert.deepEqual([r.id, r.fitting.name, r.hardware.filter((h) => h.startsWith('screw')).length, clean(r)], ['x2-x1-splice', 'splice-2020-misumi-hfs5-m5', 4, []]);
    assert.equal(r.box[0][0], 150 - r.fitting.arm); assert.equal(r.box[1][0], 150 + r.fitting.arm);
    // refused by name: a gusset with no room on a short beam
    write({ ...a, items: [beam('x1', [0, 0, 0], [30, 0, 0]), beam('y1', [10, 0, 10], [10, 0, 210])], joins: [{ kind: 'gusset', a: 'y1.a', b: 'x1.top@10', fitting: 'printed' }] });
    cad.refused(/join 1: a printed gusset's [\d.]+ mm arm runs past x1's ends: there is 10 mm beside y1, and it needs [\d.]+\. A bracket will do/, 'check', 'frame/plates');
  } finally { done(); }
});

test('panels and doors: a bay closed with a 3 mm panel lists the panel\'s size and its clips; a door on two hinges opens as a joint without hitting the frame', () => {
  const { ws, cad, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/frame', f);
    fs.mkdirSync(at('assemblies'), { recursive: true });
    fs.writeFileSync(at('project.json'), JSON.stringify({ name: 'frame', material: 'PLA', objects: [] }));
    const beam = (id, from, to) => ({ id, beam: { profile: '2020-misumi-hfs5' }, from, to });
    // a 400 x 300 mm bay in the x-z plane, its slotted faces looking along -y
    const frame = [beam('x1', [0, 0, 0], [400, 0, 0]), beam('x2', [0, 0, 300], [400, 0, 300]), beam('z1', [10, 0, 10], [10, 0, 290]), beam('z2', [390, 0, 10], [390, 0, 290])];
    const write = (name, panel) => fs.writeFileSync(at(`assemblies/${name}.json`), JSON.stringify({ title: name, kind: 'fit', items: [...frame, { id: name === 'bay' ? 'front' : 'door', panel: { sheet: 'acrylic', thickness: 3, bay: ['x1', 'z2', 'x2', 'z1'], out: [0, -1, 0], ...panel } }] }));
    const probe = (name) => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
      const { buildAssembly, checkAssembly } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/assembly.mjs')).href)});
      const s = await buildAssembly('frame/${name}'), box = (id) => { const br = s.parts.filter((p) => p.item === id); return [0, 1, 2].map((k) => [Math.min(...br.flatMap((p) => p.triangles.flat().map((v) => v[k]))), Math.max(...br.flatMap((p) => p.triangles.flat().map((v) => v[k])))].map((x) => +x.toFixed(2))); };
      console.log(JSON.stringify({ panels: s.panels.map((p) => ({ id: p.id, size: p.size, items: p.items, grams: p.model.grams, holes: p.model.holes.length })), boxes: Object.fromEntries(s.items.filter((i) => i.fitting || i.panel).map((i) => [i.id, box(i.id)])),
        joints: s.motion.joints.filter((j) => j.type !== 'fixed').map((j) => [j.id, j.type, j.dofs[0]]), poses: Object.keys(s.motion.poses), hardware: s.hardware.map((h) => h.kind + ' ' + h.name),
        findings: checkAssembly(s).filter((f) => f.level === 'fail' || f.level === 'warn').map((f) => f.code + ': ' + f.text) }));
    `], { cwd: ws, encoding: 'utf8', env: { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') } }));
    // the bay closed: the panel cut to it, 6.5 mm in from each slot's line (the clip's edge), 14 clips at no more than 150 mm
    write('bay', {});
    let r = probe('bay');
    assert.deepEqual(r.panels.map((p) => [p.id, p.size, p.items.length]), [['front', [367, 287], 14]]);
    assert.deepEqual(r.findings, []);
    assert.deepEqual(r.boxes.front, [[16.5, 383.5], [-13, -10], [6.5, 293.5]], 'on the faces, 3 mm thick');
    assert.deepEqual(r.boxes['front-clip'], [[24.5, 44.5], [-14.4, -9], [-6, 12.5]], 'a clip over its edge, keyed 1 mm into x1\'s slot');
    assert.equal(r.hardware.filter((h) => h === 'screw M5x10 button').length, 14);
    const list = cad('list', 'frame/bay');
    assert.match(list, /1 ×\s+acrylic sheet, 3 mm cut 367 x 287 mm\s+a panel\s+376 g each\s+front/);
    assert.match(list, /14 ×\s+M5x10 button/); assert.match(list, /14 ×\s+slot-nut-6-misumi-m5-slide-in/);
    assert.match(list, /1\.5 g\s+about \d+ min\s+front-clip-14 \(fitting:panel-clip-2020-misumi-hfs5-m5-3mm\)/);
    const checked = cad('check', 'frame/bay');
    assert.match(checked, /front: 367 x 287 mm of 3 mm cast acrylic \(PMMA\) sheet, its corners rounded 1 mm: 376\.02 g; held by 14 clips/);
    assert.match(checked, /files match their schemas/);
    // a wider pitch, fewer clips
    write('bay', { pitch: 400 }); r = probe('bay');
    assert.equal(r.panels[0].items.length, 8);
    // the door: on two hinges along z1, a revolute from shut to 120°, standing 10.2 mm off the faces
    write('door', { door: { hinge: 'z1' } });
    r = probe('door');
    assert.deepEqual(r.findings, []);
    assert.deepEqual(r.joints, [['door-hinge', 'revolute', [0, 120, 0]]]); assert.deepEqual(r.poses, ['door-shut', 'door-open']);
    assert.deepEqual(r.panels[0].items, ['door-hinge-1', 'door-leaf-1', 'door-hinge-2', 'door-leaf-2', 'door-handle', 'door-catch']);
    assert.deepEqual([r.panels[0].size, r.panels[0].holes], [[377.9, 286], 6]);
    assert.deepEqual(r.boxes.door[1], [-23.2, -20.2], 'the door 10.2 mm off the faces');
    const swept = cad('check', 'frame/door', '--sweep', '--steps', '24');
    assert.match(swept, /sweep door-hinge, 0 to 120° in 24 steps: nothing collides/);
    assert.doesNotMatch(swept, /✗/);
    const dl = cad('list', 'frame/door');
    assert.match(dl, /2 ×\s+M4x40 cap/); assert.match(dl, /2 ×\s+M4 lock nut/); assert.match(dl, /1 ×\s+disc magnet 10x3 N35/); assert.match(dl, /acrylic sheet, 3 mm cut 377\.9 x 286 mm/);
    // with its turn-button latch shut over the door, the sweep finds the door can't open: it lifts into the tab within
    // its first degree, so the sweep also tries it 0.5° off shut, finer than its 5° steps (which jump past the tab)
    write('door', { door: { hinge: 'z1', latch: true } });
    cad.refused(/✗ sweep door-hinge, 0 to 120° in 24 steps \(door-latch shut over door: also tried 0\.5° off shut\): at 0\.5°: door\.body hits door-latch\.body/, 'check', 'frame/door', '--sweep', '--steps', '24');
    write('door', { door: { hinge: 'z1', latch: true, open: 4 } });
    cad.refused(/sweep door-hinge, 0 to 4° in 8 steps \(door-latch shut over door: also tried 0\.5° off shut\): 0\.5 to 1°: door\.body hits door-latch\.body/, 'check', 'frame/door', '--sweep', '--steps', '8');
    // refused by name
    write('door', { door: { hinge: 'y9' } });
    cad.refused(/door\.hinge is the beam of the bay its hinges go on, one of x1, z2, x2, z1 \(got "y9"\)/, 'check', 'frame/door');
    write('bay', { out: [0, 0, 1] });
    cad.refused(/z2 runs across the bay's plane, not in it: its beams lie square to out/, 'check', 'frame/bay');
    fs.writeFileSync(at('assemblies/bay.json'), JSON.stringify({ title: 'bay', kind: 'fit', items: [...frame, { id: 'front', panel: { sheet: 'acrylic', thickness: 3, bay: ['x1', 'z2', 'x2', 'x2'], out: [0, -1, 0] } }] }));
    cad.refused(/bay is four different beams/, 'check', 'frame/bay');
  } finally { done(); }
});

test('printed fittings in a project of another plastic: refused by name where no rule set gives its strength, modulus and density, and sized from it where one does', () => {
  const { ws, cad, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/frame', f);
    fs.mkdirSync(at('assemblies'), { recursive: true });
    fs.writeFileSync(at('project.json'), JSON.stringify({ name: 'frame', material: 'PC', objects: [] }));
    fs.writeFileSync(at('assemblies/clip.json'), JSON.stringify({ title: 'clip', kind: 'fit', items: [{ id: 'rail', beam: { profile: '2020-misumi-hfs5' }, from: [0, 0, 0], to: [200, 0, 0] }, { id: 'c', fitting: { kind: 'cable-clip', profile: '2020-misumi-hfs5' }, at: 'rail.top@100' }] }));
    // once sized as PLA without a word; now refused by name, with what would do: every plastic the kit has a rule set
    // for (one with strength, modulus, density and modulus_z, the modulus across the layers), not only pla and petg
    cad.refused(/project frame: its material is "PC", and printed fittings are sized from their plastic's strength, modulus and density: the kit and this workspace have rule sets for abs, asa, asa-polylite, pa_cf, petg, petg-polylite, pla, pla-prusament, and there is no rules\/pc\.json\. Give rules\/pc\.json with all three, or set the material to one of abs, asa, asa-polylite, pa_cf, petg, petg-polylite, pla, pla-prusament/, 'check', 'frame/clip');
    fs.mkdirSync(path.join(ws, 'rules'), { recursive: true });
    const pla = JSON.parse(fs.readFileSync(path.join(ROOT_MODULES, '@rulecad/rules/pla.json'), 'utf8'));
    fs.writeFileSync(path.join(ws, 'rules/pc.json'), JSON.stringify({ name: 'pc', rules: { strength: pla.rules.strength } }));
    cad.refused(/rules\/pc\.json gives no modulus, density/, 'check', 'frame/clip');
    fs.writeFileSync(path.join(ws, 'rules/pc.json'), JSON.stringify({ name: 'pc', rules: { ...pla.rules, density: { ...pla.rules.density, value: 1.04 } } }));
    assert.match(cad('check', 'frame/clip'), /c: it weighs 0\.43 g of pc/);
    // a set the workspace gives is one of its plastics from then on: another missing plastic's refusal names it too
    fs.writeFileSync(at('project.json'), JSON.stringify({ name: 'frame', material: 'nylon', objects: [] }));
    cad.refused(/the kit and this workspace have rule sets for abs, asa, asa-polylite, pa_cf, pc, petg, petg-polylite, pla, pla-prusament, and there is no rules\/nylon\.json/, 'check', 'frame/clip');
    // and a plastic the kit gives a set for (#27's abs) is sized from it, with no set of the workspace's own
    fs.writeFileSync(at('project.json'), JSON.stringify({ name: 'frame', material: 'ABS', objects: [] }));
    assert.match(cad('check', 'frame/clip'), /c: it weighs [\d.]+ g of abs/);
  } finally { done(); }
});

test('bought fittings: the hinge set gives its screws, an anchor at each (b1, b2 the frame leaf\'s, a1, a2 the door leaf\'s), so a fasten screws its frame leaf into a slot and the list counts them', () => {
  const { ws, cad, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/frame', f);
    fs.mkdirSync(at('assemblies'), { recursive: true });
    fs.writeFileSync(at('project.json'), JSON.stringify({ name: 'frame', material: 'PLA', objects: [] }));
    // the frame leaf's two holes over x1's top slot line, the pin 11.5 mm off it
    fs.writeFileSync(at('assemblies/hinge.json'), JSON.stringify({ title: 'hinge', kind: 'fit', items: [{ id: 'x1', beam: { profile: '2020-motedis-b6' }, from: [0, 0, 0], to: [300, 0, 0] }, { id: 'h', bought: 'fitting-motedis-hinge-20', at: [100, -11.5, 10], rotate: [0, 0, 90] }],
      fasten: [{ screw: 'M4 button', through: ['h'], into: 'x1.top', at: ['h.b1', 'h.b2'], nut: 'hammer' }] }));
    const c = cad('check', 'frame/hinge');
    assert.doesNotMatch(c, /^\s+✗ /m);
    assert.match(c, /h to x1\.top, 2 M4 button screws: M4x10 button chosen, the shortest sold that fits/);
    assert.match(c, /h to x1\.top, 2 M4 button screws: h's hole measures 4\.5 mm, an M4 clearance hole as drawn/);
    const l = cad('list', 'frame/hinge');
    assert.match(l, /2 ×\s+M4x10 button/); assert.match(l, /2 ×\s+slot-nut-6-motedis-m4-hammer/); assert.match(l, /1 ×\s+fitting-motedis-hinge-20\s+a fitting/);
  } finally { done(); }
});

test('panels and ends as items by hand: an end cap (its pegs left out of the overlap check) and a foot at a beam\'s ends, a panel corner on a face, and an in-slot panel edge and a slot cover, whose share in the slot the overlap check leaves out', () => {
  const { ws, cad, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/frame', f);
    fs.mkdirSync(at('assemblies'), { recursive: true });
    fs.writeFileSync(at('project.json'), JSON.stringify({ name: 'frame', material: 'PLA', objects: [] }));
    const P = '2020-misumi-hfs5';
    fs.writeFileSync(at('assemblies/ends.json'), JSON.stringify({ title: 'ends', kind: 'fit', items: [{ id: 'x1', beam: { profile: P }, from: [0, 0, 0], to: [300, 0, 0] },
      { id: 'cap', fitting: { kind: 'end-cap', profile: P }, at: 'x1.a' }, { id: 'ft', fitting: { kind: 'foot', profile: P }, at: 'x1.b' },
      { id: 'pc', fitting: { kind: 'panel-corner', profile: P, sheet: 3 }, at: 'x1.top@100' },
      { id: 'pe', fitting: { kind: 'panel-edge', profile: P, sheet: 3, length: 100 }, at: 'x1.front@150' }, { id: 'sc', fitting: { kind: 'slot-cover', profile: P, length: 100 }, at: 'x1.back@20' }] }));
    // nothing overlaps: the end cap's pegs stand in x1's slots and bore (fittings.mjs TONGUED: without it they overlap
    // the beam's envelope), the edge and the cover lie in the slots, measured above the face alone
    const c = cad('check', 'frame/ends');
    assert.match(c, /✓ no parts overlap \(6 object instances\)/); assert.doesNotMatch(c, /^\s+✗ /m);
    assert.match(c, /cap: it weighs [\d.]+ g of pla/); assert.match(c, /ft: M5x16 cap into the end's tapped bore/); assert.match(c, /pe: printed in-slot edge for a 3 mm sheet/);
  } finally { done(); }
});

test('bought fittings: the same frame with a printed and with a cast bracket lists different parts and reports different joint stiffness, each saying what it rests on', () => {
  const { ws, cad, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/frame', f), file = at('assemblies/corner.json');
    fs.mkdirSync(at('assemblies'), { recursive: true });
    fs.writeFileSync(at('project.json'), JSON.stringify({ name: 'frame', material: 'PLA', objects: [] }));
    // y1 stands on x1's top face 100 mm from its end a, both Motedis' 20 mm B-type profile
    const frame = (fitting) => ({ title: 'Corner', kind: 'fit', items: [{ id: 'x1', beam: { profile: '2020-motedis-b6' }, from: [0, 0, 0], to: [300, 0, 0] }, { id: 'y1', beam: { profile: '2020-motedis-b6' }, from: [100, 0, 10], to: [100, 0, 210] }],
      joins: [{ kind: 'bracket', a: 'y1.a', b: 'x1.top@100', fitting }] });
    const probe = (fitting) => {
      fs.writeFileSync(file, JSON.stringify(frame(fitting)));
      return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
        const { buildAssembly, checkAssembly } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/assembly.mjs')).href)});
        const { shoppingList } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/list.mjs')).href)});
        const s = await buildAssembly('frame/corner'), l = shoppingList(s);
        console.log(JSON.stringify({ items: s.items.map((i) => [i.id, i.role]), hardware: s.hardware.map((h) => [h.fasten, h.kind, h.name]), list: { bought: l.bought, printed: l.printed.map((p) => p.id), cost: l.cost },
          findings: checkAssembly(s).filter((f) => /^(join|fasten|overlap|frame|fitting)/.test(f.code)).map(({ level, code, text, values, refs }) => ({ level, code, text, values, refs })) }));
      `], { cwd: ws, encoding: 'utf8', env: { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') } }));
    };
    const printed = probe('printed'), cast = probe('fitting-motedis-bracket-20-b6');
    const by = (r, code) => r.findings.filter((x) => x.code === code);
    // different parts: a printed bracket (a part, by its grams) against a bought one (a reference, by its set and price)
    assert.deepEqual([printed.items[2], cast.items[2]], [['y1-x1-bracket', 'part'], ['y1-x1-bracket', 'reference']]);
    const fittings = (r) => r.list.bought.filter((b) => b.part === 'fitting').map((b) => [b.qty, b.set, b.cost, b.currency, b.items]);
    assert.deepEqual([printed.list.printed, fittings(printed)], [['y1-x1-bracket'], []]);
    assert.deepEqual([cast.list.printed, fittings(cast)], [[], [[1, 'fitting-motedis-bracket-20-b6', 0.36, 'EUR', ['y1-x1-bracket']]]]);
    // the cast bracket's own screws and nuts, as its set lists them: an M4x8 cap into a hammer nut on each leg
    assert.deepEqual(cast.hardware, [[0, 'screw', 'M4x8 cap'], [0, 'nut', 'slot-nut-6-motedis-m4-hammer'], [1, 'screw', 'M4x8 cap'], [1, 'nut', 'slot-nut-6-motedis-m4-hammer']]);
    assert.notDeepEqual(printed.hardware.map((h) => h[2]), cast.hardware.map((h) => h[2]));
    // what each costs: the bought bracket's price, the printed one's plastic at PLA's price a kilogram
    assert.deepEqual([cast.list.cost.bought, cast.list.cost.currency, cast.list.cost.printed, cast.list.cost.unpriced], [0.36, 'EUR', null, ['profile-2020-motedis-b6']]);
    assert.deepEqual([printed.list.cost.bought, printed.list.cost.printedUnit], [null, 'EUR']);
    assert.ok(printed.list.cost.printed > 0 && printed.list.cost.printed < 0.36, `${printed.list.cost.printed} EUR of plastic`);
    assert.match(printed.list.cost.printedRule, /g of pla at 13\.99 EUR\/kg: the plastic alone/);
    // different joint stiffness, each saying what it rests on
    const [kp] = by(printed, 'join.stiffness'), [kc] = by(cast, 'join.stiffness');
    assert.deepEqual([kc.values.bending, kc.values.twist, kc.refs.set, kc.refs.kind_of_value], [3e6, 1e6, 'fitting-motedis-bracket-20-b6', 'estimate']);
    assert.ok(kp.values.bending > 0 && Math.abs(kp.values.bending - kc.values.bending) > 1e5, `${kp.values.bending} against ${kc.values.bending}`);
    assert.match(kp.text, /y1-x1-bracket's own by finite elements .*until the joint rig \(issue 264\) measures it/);
    assert.match(kc.text, /fitting-motedis-bracket-20-b6's own figures from its rule set \(estimate: .*JOIN_STIFFNESS\.bracket.*\): an estimate, until the joint rig \(issue 264\) measures it/);
    assert.match(kc.refs.rests[0].source, /^fitting-motedis-bracket-20-b6\.bending_stiffness: A working guess/);
    // the cast bracket is placed and screwed as the printed one is: on y1's side with room, every check passing
    assert.deepEqual(cast.findings.filter((x) => x.level === 'fail').map((x) => x.text), []);
    for (const code of ['fasten.holes', 'fasten.slot', 'fasten.length', 'fasten.engagement', 'fasten.seat', 'join.geometry']) assert.deepEqual([...new Set(by(cast, code).map((x) => x.level))], ['pass'], code);
    // its holes are slots 5.2 mm wide (its lugs place it, not its screws): wider than M4's loosest hole, and said so
    assert.deepEqual(by(cast, 'fasten.clearance').filter((x) => x.level === 'warn').map((x) => x.values?.hole ?? x.text.match(/measures ([\d.]+) mm/)[1]), ['5.2', '5.2']);
    assert.deepEqual(by(cast, 'join.fitting'), []);
    // cad list says each line's price and the total; on another maker's profile the cast bracket does not fit, and says so
    const list = cad('list', 'frame/corner');
    assert.match(list, /1 ×\s+fitting-motedis-bracket-20-b6\s+a fitting\s+mass not given\s+0\.36 EUR each\s+y1-x1-bracket/);
    assert.match(list, /Cost: 0\.36 EUR bought \(no price given for profile-2020-motedis-b6\); fixings and bars are not priced/);
    const other = frame('fitting-motedis-bracket-20-b6'); for (const it of other.items) it.beam.profile = '2020-misumi-hfs5';
    fs.writeFileSync(file, JSON.stringify(other));
    cad.refused(/fitting-motedis-bracket-20-b6 is made for slot-6-motedis \(nut family slot-6-bosch\), and 2020-misumi-hfs5's slots are slot-6-misumi/, 'check', 'frame/corner');
  } finally { done(); }
});

test('bought fittings: a T plate, an inner connector and an anchor in joins, an end cap and a levelling foot on beam ends, each checked against its beam and listed with its price', () => {
  const { ws, cad, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/frame', f), file = at('assemblies/bought.json');
    fs.mkdirSync(at('assemblies'), { recursive: true });
    fs.writeFileSync(at('project.json'), JSON.stringify({ name: 'frame', material: 'PLA', objects: [] }));
    const beam = (id, from, to, profile = '2020-motedis-b6') => ({ id, beam: { profile }, from, to });
    const probe = (a) => {
      fs.writeFileSync(file, JSON.stringify({ title: 'Bought', kind: 'fit', ...a }));
      return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
        const { buildAssembly, checkAssembly } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/assembly.mjs')).href)});
        const { shoppingList } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/list.mjs')).href)});
        const s = await buildAssembly('frame/bought'), l = shoppingList(s);
        const box = (id) => { const br = s.parts.filter((p) => p.item === id); return [0, 1, 2].map((k) => [Math.min(...br.flatMap((p) => p.triangles.flat().map((v) => v[k]))), Math.max(...br.flatMap((p) => p.triangles.flat().map((v) => v[k])))].map((x) => +x.toFixed(2))); };
        console.log(JSON.stringify({ items: s.items.map((i) => i.id), boxes: Object.fromEntries(s.items.filter((i) => i.role === 'reference' && !/^[xy]\\d$/.test(i.id)).map((i) => [i.id, box(i.id)])), hardware: s.hardware.map((h) => h.kind + ' ' + h.name),
          ops: Object.fromEntries(s.objects.filter((o) => o.beam).map((o) => [o.id, o.beam.ops.filter((x) => !x.implied).map((x) => x.line)])), cost: l.cost, bought: l.bought.filter((b) => b.part === 'fitting').map((b) => [b.qty, b.set, b.cost]),
          findings: checkAssembly(s).filter((f) => /^(join|fasten|overlap|frame|fitting)/.test(f.code)).map(({ level, code, text, values, refs }) => ({ level, code, text, values, refs })) }));
      `], { cwd: ws, encoding: 'utf8', env: { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') } }));
    };
    const fails = (r) => r.findings.filter((x) => x.level === 'fail').map((x) => x.text), by = (r, code) => r.findings.filter((x) => x.code === code);
    // a T plate where y1 meets x1 along its length: its three screws in x1, two in y1, each into a hammer nut
    let r = probe({ items: [beam('x1', [0, 0, 0], [300, 0, 0]), beam('y1', [150, 0, 10], [150, 0, 210])], joins: [{ kind: 'gusset', a: 'y1.a', b: 'x1.top@150', fitting: 'fitting-motedis-plate-t-20' }] });
    assert.deepEqual(fails(r), []);
    assert.deepEqual([r.hardware.filter((h) => h === 'screw M5x8 cap').length, r.hardware.filter((h) => h === 'nut slot-nut-6-motedis-m5-hammer').length], [5, 5]);
    assert.deepEqual(r.boxes['y1-x1-gusset'], [[121, 179], [-13, -10], [-9, 49]]); // (58 mm along x1, 3 mm thick on the faces at y = -10, from 9 mm under x1's axis to 49 above)
    for (const code of ['fasten.holes', 'fasten.slot', 'join.geometry']) assert.deepEqual([...new Set(by(r, code).map((x) => x.level))], ['pass'], code);
    assert.deepEqual([by(r, 'join.stiffness')[0].values.bending, r.bought, r.cost.bought], [6e6, [[1, 'fitting-motedis-plate-t-20', 1.21]], 1.21]);
    // an inner connector: in the slots, out of sight, its grub screws part of it; no nuts, no machining, no overlap
    r = probe({ items: [beam('x1', [0, 0, 0], [300, 0, 0]), beam('y1', [150, 0, 10], [150, 0, 210])], joins: [{ kind: 'hidden', a: 'y1.a', b: 'x1.top@150', fitting: 'fitting-motedis-inner-20-b6' }] });
    assert.deepEqual([fails(r), r.hardware, r.ops, by(r, 'join.stiffness')[0].values.bending], [[], [], { x1: [], y1: [] }, 1.5e6]);
    assert.deepEqual([...new Set(by(r, 'overlap').map((x) => x.level))], ['pass']);
    assert.deepEqual(by(r, 'join.fitting'), []);
    // MISUMI's centre joint on its own profile: the hole for its guide drilled across y1, 10 mm from its end, on the cut list
    r = probe({ items: [beam('x1', [0, 0, 0], [300, 0, 0], '2020-misumi-hfs5'), beam('y1', [150, 0, 10], [150, 0, 210], '2020-misumi-hfs5')], joins: [{ kind: 'anchor', a: 'y1.a', b: 'x1.top@150', fitting: 'fitting-misumi-hmj5' }] });
    assert.deepEqual(fails(r), []);
    assert.equal(r.ops.y1.length, 1); assert.match(r.ops.y1[0], /Ø7\.1 mm .*10 mm from end a/);
    assert.deepEqual([by(r, 'join.stiffness')[0].values.bending, r.bought, r.cost ?? null], [2e6, [[1, 'fitting-misumi-hmj5', null]], null]); // (MISUMI prints no price, and nothing is printed)
    // on a beam's ends: an end cap and a levelling foot, each a bought item at the end, which covers it
    const ends = { items: [beam('x1', [0, 0, 0], [300, 0, 0]), { id: 'cap', bought: 'fitting-motedis-end-cap-20-b6', at: 'x1.b' }, { id: 'foot', bought: 'fitting-motedis-foot-m6-d19', at: 'x1.a' }] };
    r = probe(ends);
    assert.deepEqual([fails(r), by(r, 'fitting.fit').map((x) => [x.level, x.refs.item]), by(r, 'join.end')], [[], [['pass', 'cap'], ['pass', 'foot']], []]);
    assert.deepEqual([r.bought, r.cost.bought], [[[1, 'fitting-motedis-end-cap-20-b6', 0.07], [1, 'fitting-motedis-foot-m6-d19', 2]], 2.07]);
    // the same foot on MISUMI's profile, whose end bore is tapped M5: it does not fit, and says so
    ends.items[0].beam.profile = '2020-misumi-hfs5'; r = probe(ends);
    assert.deepEqual(fails(r).map((t) => t.replace(/^\w+: /, '')), ["fitting-motedis-end-cap-20-b6 is made for slot-6-motedis (nut family slot-6-bosch), and 2020-misumi-hfs5's slots are slot-6-misumi (slot-6-misumi): its lugs and nuts are not promised to fit. Choose a fitting made for slot-6-misumi, or \"fitting\": \"printed\"", "fitting-motedis-foot-m6-d19's stem is M6, and 2020-misumi-hfs5's end bore is tapped M5: choose a foot with an M5 stem"]);
    // slide-in nuts in a slot whose two ends are closed by bought items (a cap and a foot), not by joins: they go in
    // before either, and nothing has to be loaded before a join (this once failed to read the items' join)
    r = probe({ items: [beam('x1', [0, 0, 0], [300, 0, 0]), beam('y1', [150, 0, 10], [150, 0, 210]), { id: 'cap', bought: 'fitting-motedis-end-cap-20-b6', at: 'x1.b' }, { id: 'foot', bought: 'fitting-motedis-foot-m6-d19', at: 'x1.a' }],
      joins: [{ kind: 'bracket', a: 'y1.a', b: 'x1.top@150', fitting: 'printed' }] });
    assert.deepEqual([fails(r), by(r, 'frame.preload').map((x) => x.level)], [[], ['pass']]);
    assert.match(by(r, 'frame.nut').find((x) => x.refs.item === 'x1').text, /slide-in nut .*into x1's top slot from an end before (foot and cap|cap and foot) go on$/); // (both ends capped: each named)
    // refused by name: a set the join does not take
    fs.writeFileSync(file, JSON.stringify({ title: 'Bought', kind: 'fit', items: [beam('x1', [0, 0, 0], [300, 0, 0]), beam('y1', [150, 0, 10], [150, 0, 210])], joins: [{ kind: 'hidden', a: 'y1.a', b: 'x1.top@150', fitting: 'fitting-motedis-plate-t-20' }] }));
    cad.refused(/join 1: .*fitting-motedis-plate-t-20 is a joining plate, and a hidden join takes an inner connector: fitting-motedis-plate-t-20 goes in a gusset or splice join/, 'check', 'frame/bought');
  } finally { done(); }
});

test('a kit of fittings alone for a named profile (examples/bench fittings/kit-2020): brackets, levelling feet, end caps, panel clips and nut carriers check clean, list the nuts the carriers hold and go on one plate', () => {
  const { ws, cad, done } = workspace();
  try {
    fs.cpSync(fileURLToPath(new URL('../../examples/bench/projects/fittings/', CAD)), path.join(ws, 'projects/fittings'), { recursive: true });
    const r = JSON.parse(cad('check', 'fittings/kit-2020', '--json'));
    assert.ok(r.findings, JSON.stringify(r.error ?? r));
    assert.deepEqual(r.findings.filter((x) => x.level === 'fail' || x.level === 'warn').map((x) => x.text), []);
    // a carrier for an M3 nut in MISUMI's 6 mm slot: 11 mm long, it holds about 794 N (the 1.85 mm over the nut shears
    // first: @rulecad/frames' README table), over twice the 100 N it is sized for
    assert.match(r.findings.find((x) => x.code === 'carrier.hold' && /^carrier-1:/.test(x.text)).text, /each nut holds about 794 N/);
    assert.equal(r.findings.filter((x) => x.code === 'carrier.printable' && x.level === 'pass').length, 8);
    assert.match(cad('list', 'fittings/kit-2020'), /8 ×\s+M3 hex nut\s+1 pack of 10, 2 spare\s+carrier-1 \(held in the carrier, slid in from the side\)/);
    assert.match(cad('plates', 'fittings/kit-2020'), /kit-2020-base-1: pla, base, 32 parts, [\d.]+ g, about \d+ min: (?=.*carrier-8)(?=.*foot-4-pad)(?=.*bracket-1)(?=.*clip-8)/);
    // refused by name: an M5 nut is too big for a carrier in a 6 mm slot
    const a = JSON.parse(fs.readFileSync(path.join(ws, 'projects/fittings/assemblies/kit-2020.json'), 'utf8'));
    fs.writeFileSync(path.join(ws, 'projects/fittings/assemblies/m5.json'), JSON.stringify({ title: 'm5', kind: 'fit', items: [{ id: 'c', fitting: { ...a.items.find((x) => x.id === 'carrier-1').fitting, thread: 'M5' } }] }));
    cad.refused(/item c: .*M5/, 'check', 'fittings/m5');
  } finally { done(); }
});

test('printed fittings in TPU: refused by name as a rubber, and left out of the plastics another refusal names', () => {
  const { ws, cad, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/frame', f);
    fs.mkdirSync(at('assemblies'), { recursive: true });
    fs.writeFileSync(at('assemblies/clip.json'), JSON.stringify({ title: 'clip', kind: 'fit', items: [{ id: 'rail', beam: { profile: '2020-misumi-hfs5' }, from: [0, 0, 0], to: [200, 0, 0] }, { id: 'c', fitting: { kind: 'cable-clip', profile: '2020-misumi-hfs5' }, at: 'rail.top@100' }] }));
    // the kit's tpu.json has strength, modulus, density and modulus_z, as a plastic's set does; but 29.6 / 9.2 = 3.22,
    // a strain where a stiff plastic would long have yielded: the clip's sums are not for it
    fs.writeFileSync(at('project.json'), JSON.stringify({ name: 'frame', material: 'TPU', objects: [] }));
    cad.refused(/project frame: its material is "TPU", a rubber \(its strength over its modulus is 3\.22, a strain far past where its stiffness holds\), and printed fittings are sized with sums for a stiff plastic that do not hold for it\. Set the material to one of abs, asa, asa-polylite, pa_cf, petg, petg-polylite, pla, pla-prusament$/m, 'check', 'frame/clip');
    fs.writeFileSync(at('project.json'), JSON.stringify({ name: 'frame', material: 'PC', objects: [] }));
    cad.refused(/the kit and this workspace have rule sets for abs, asa, asa-polylite, pa_cf, petg, petg-polylite, pla, pla-prusament, and there is no rules\/pc\.json/, 'check', 'frame/clip');
  } finally { done(); }
});
