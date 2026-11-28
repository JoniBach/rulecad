// cad's tests of printed beams: weighed, their ends, and whether they can be printed. The shared helpers are in ./helpers.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { workspace, BIN } from './helpers.mjs';

test('a printed beam in an assembly: a printed part weighed by its walls and infill, off the cut list, laid on a plate as it prints, its tapped end an insert', () => {
  const { ws, cad, done } = workspace();
  try {
    fs.mkdirSync(path.join(ws, 'projects/frame/assemblies'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'projects/frame/project.json'), JSON.stringify({ name: 'frame', material: 'PLA', objects: [] }));
    // a printed 2020 240 mm long beside a bought one, its end a tapped: printed, an M4 heat-set insert
    const file = path.join(ws, 'projects/frame/assemblies/frame.json'), a = { title: 'Frame', kind: 'fit', items: [
      { id: 'x1', beam: { profile: '2020-printed', printed: true, ops: [{ op: 'tap', at: 'a' }] }, from: [0, 0, 0], to: [240, 0, 0] },
      { id: 'y1', beam: { profile: '2020-misumi-hfs5' }, from: [0, 100, 0], to: [240, 100, 0] }] };
    fs.writeFileSync(file, JSON.stringify(a));
    const check = cad('check', 'frame/frame');
    assert.match(check, /✓ x1: profile-2020-printed x 240, printed lying down on its bottom face: its layers run along it/, check);
    assert.match(check, /✓ x1: .*end a takes M4 in a heat-set insert/);
    // on the list: x1 printed, by the plastic its walls and infill lay (PLA 1.26 g/cm³: 204.2 mm² x 240 mm = 61.8 g), y1 bought and cut
    const list = cad('list', 'frame/frame');
    assert.match(list, /6\d\.\d+ g\s+about \d+ min\s+x1/, list);
    assert.match(list, /1 ×\s+profile-2020-misumi-hfs5 x 240 mm\s+a beam/);
    assert.doesNotMatch(list, /profile-2020-printed x 240 mm\s+a beam/);
    // on a plate, laid as it prints: on its bottom face, along x
    const plates = cad('plates', 'frame/frame');
    assert.match(plates, /frame-base-1: pla, base, 1 part, [\d.]+ g, about \d+ min: x1\n\s+frame-base-1: prints clean/, plates);
    const plate = JSON.parse(fs.readFileSync(path.join(ws, 'projects/frame/assemblies/frame-base-1.json'), 'utf8'));
    assert.deepEqual(plate.items.map((it) => [it.beam?.profile, it.beam?.laid, it.beam?.length]), [['2020-printed', true, 240]]);
    // refused by name: printed as a word
    a.items[0].beam.printed = { pose: 'upside-down' }; fs.writeFileSync(file, JSON.stringify(a));
    cad.refused(/item x1: printed.pose is lying \(on its bottom face, layers along the beam\) or standing/, 'check', 'frame/frame');
  } finally { done(); }
});

test('a printed beam\'s end in a frame: a post printed standing takes a foot\'s screw in a captive nut in its bore\'s place, a screw of another thread is refused by name, a nut on a printed slot\'s sloped lips is said and passes, and a stiff frame\'s sag is given to three figures', async () => {
  const { ws, cad, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/frame', f);
    fs.mkdirSync(at('assemblies'), { recursive: true });
    fs.writeFileSync(at('project.json'), JSON.stringify({ name: 'frame', material: 'PETG', objects: [] }));
    const findings = (name) => cad.findings('check', `frame/${name}`, '--json');
    // a post of MISUMI's 2020 printed standing (its four slots kept), a rail of the kit's printable 2020 lying down,
    // a printed bracket on drop-in nuts between them, and a printed foot under the post screwed into its end
    const post = { id: 'p1', beam: { profile: '2020-misumi-hfs5', material: 'petg', printed: { pose: 'standing', pull: 50, end: 'nut' }, ops: [{ op: 'tap', at: 'a' }] }, from: [10, 10, 0], to: [10, 10, 120] };
    const frame = (foot, screw) => ({ title: 'Post', kind: 'fit', items: [post, { id: 'x1', beam: { profile: '2020-printed', material: 'petg', printed: true }, from: [20, 10, 10], to: [160, 10, 10] },
      { id: 'foot1', fitting: { kind: 'foot', profile: '2020-misumi-hfs5', ...foot }, at: 'p1.a' }, { id: 'cap1', fitting: { kind: 'end-cap', profile: '2020-misumi-hfs5' }, at: 'p1.b' }],
      joins: [{ kind: 'bracket', a: 'x1.a', b: 'p1.back@10', fitting: 'printed', nut: 'drop-in' }],
      fasten: [{ screw: screw, through: ['foot1'], into: 'p1', at: ['foot1.b1'], note: 'Foot 1' }] });
    fs.writeFileSync(at('assemblies/post.json'), JSON.stringify(frame({ thread: 'M3' }, 'M3 cap')));
    const f = findings('post'), said = (code, re) => f.filter((x) => x.code === code && re.test(x.text));
    // the post's end: its 4.2 mm bore leaves 4 mm of plastic round its middle, so an M3 nut (5.5 mm across the flats,
    // 5.5 / cos 30° = 6.35 mm across its corners, half 3.18, and a 0.42 mm line: 3.6 mm) fits, and its screw passes the bore
    assert.equal(said('beam.end', /^p1: profile-2020-misumi-hfs5 x 120, printed standing up: end a takes M3 in a captive nut/).length, 1);
    const end = said('fasten.end', /^Foot 1/)[0];
    assert.equal(end.level, 'pass', end.text); assert.match(end.text, /ends in an M3 hex nut in its seat in p1, [\d.]+ mm across the flats for the nut's 5\.5 mm, past a 3\.5 mm clearance hole/);
    assert.deepEqual(f.filter((x) => x.code === 'overlap' && x.level !== 'pass').map((x) => x.text), [], 'the nut in its slot in the post as drawn');
    // the bracket's nut in the printed rail's top slot: the sloped lips said, and no warning for it
    const nut = said('fasten.end', /the bracket into x1/)[0];
    assert.equal(nut.level, 'pass', nut.text); assert.match(nut.text, /slot-6-printed-2020's lips slope underneath at 45°, so it seats 3\.95 mm under the face/);
    // and its thread is counted from that seat, not from under the lips: the drop-in nut (10 mm wide, 3.3 high, its
    // tongue 0.8) in the 6.1 mm opening with 2 mm lips sloped 45°, seat = 2 + (10 - 6.1) / 2 x tan 45° = 3.95 mm, so its
    // thread runs from 3.95 - 0.8 = 3.15 to 3.15 + 3.3 + 0.8 = 7.25 mm under the face (from under the lips it would read
    // 1.2 to 5.3, and a screw whose tip is 5.6 mm in would pass with 2.45 mm engaged, under the 3.2 mm a hex nut asks)
    assert.match(nut.text, /4\.1 mm of M4 thread from 3\.15 to 7\.25 mm under the face/);
    const len = said('fasten.length', /the bracket into x1/)[0], eng = said('fasten.engagement', /the bracket into x1/)[0];
    // the bracket's 5.2 mm under the head and the 3.95 mm to the seat: 9.15 mm; M4x12's tip 12 - 5.2 = 6.8 mm in, so
    // 6.8 - 3.15 = 3.65 mm engaged (M4x10's would be 1.65), its floor 7.85 mm down, 1.05 mm past the tip
    assert.equal(len.level, 'pass', len.text); assert.match(len.text, /M4x12 cap chosen, the shortest sold that fits: 9\.15 mm under its head \(x1-p1-bracket and the 3\.95 mm down to its nut's seat under the slot's sloped 2 mm lips\), 3\.65 mm into its nut, its tip 6\.8 mm into the slot and 1\.05 mm short of its floor/);
    assert.equal(eng.level, 'pass', eng.text); assert.equal(eng.values.engaged, 3.65);
    // a foot drawn for the aluminium post's M5 tap: its screw refused by name, with the thread the printed end takes
    fs.writeFileSync(at('assemblies/post.json'), JSON.stringify(frame({}, 'M5 cap')));
    const m5 = findings('post').find((x) => x.code === 'fasten.end' && /^Foot 1/.test(x.text));
    assert.equal(m5.level, 'fail'); assert.match(m5.text, /p1's end a is printed with an M3 captive nut in place of a tap, and the screw is M5: use an M3 screw \(a printed foot takes it as "thread": "M3"\)/);
    // a stiff frame's sag, where three places read 0: a 100 mm aluminium 2020 held fixed at both ends, under its own weight
    // Hand: w = 0.5 kg/m x 9.80665 / 1000 = 0.0049033 N/mm (the sheet's mass per metre), E I = 69972 x 7420 N mm²
    // (al6n01-t5 and the sheet's second moment, both read from the beam's model below); fixed at both ends,
    // sag = w L⁴ / (384 E I) = 0.0049033 x 100⁴ / (384 x 69972 x 7420) = 2.46e-6 mm, given to three figures
    const { beamModel } = await import('@rulecad/frames'), m = beamModel('2020-misumi-hfs5', { length: 100 });
    fs.writeFileSync(at('assemblies/stiff.json'), JSON.stringify({ title: 'Stiff', kind: 'fit', items: [{ id: 'x1', beam: { profile: '2020-misumi-hfs5' }, from: [0, 0, 10], to: [100, 0, 10] }],
      frame: { supports: { 'x1.a': 'fixed', 'x1.b': 'fixed' }, points: ['x1.top@50%'] } }));
    const sag = findings('stiff').find((x) => x.code === 'frame.deflection'), w = (m.figures.massPerMetre.value * 9.80665) / 1000, EI = m.material.modulus * m.figures.inertiaX.value;
    const hand = (w * 100 ** 4) / (384 * EI);
    assert.ok(sag.values.sag > 0 && Math.abs(sag.values.sag - hand) / hand < 0.05, `${sag.values.sag} mm against the hand's ${hand}`);
    assert.match(sag.text, /^x1 at x1\.top@50% sags \d\.\d+e-\d mm|^x1 at x1\.top@50% sags 0\.00000\d+ mm/);
  } finally { done(); }
});

test('beam.printable: every beam of a case-sized frame can be printed in PETG; a 400 mm gantry beam needs aluminium, by the margin it misses by; a printed beam in the frame checked at its pose\'s strength, with its creep', async () => {
  const { ws, done } = workspace();
  try {
    const { beamModel } = await import('@rulecad/frames');
    const at = (f) => path.join(ws, 'projects/frame', f);
    fs.mkdirSync(at('assemblies'), { recursive: true });
    fs.writeFileSync(at('project.json'), JSON.stringify({ name: 'frame', material: 'PLA', objects: [] }));
    const P = '2020-misumi-hfs5', beam = (id, from, to) => ({ id, beam: { profile: P }, from, to });
    const write = (name, x) => fs.writeFileSync(at(`assemblies/${name}.json`), JSON.stringify(x));
    const probe = (name) => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
      const { buildAssembly, checkAssembly } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/assembly.mjs')).href)});
      const s = await buildAssembly('frame/${name}');
      console.log(JSON.stringify(checkAssembly(s).filter((f) => /^(beam\\.(printable|creep)|frame\\.(solve|deflection|stress))$/.test(f.code)).map(({ level, code, text, values, refs }) => ({ level, code, text, values, refs }))));
    `], { cwd: ws, encoding: 'utf8', env: { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') } }));

    // 1. a case: four 2020 legs 250 mm tall, rings of four 240 mm beams joined blind 240 and 10 mm up, 2 kg on the
    // middle of a top beam, every beam tried printed in PETG ("frame": { "printed": "petg" })
    const ring = (n, h) => [beam(`x${n}`, [10, 0, h], [250, 0, h]), beam(`x${n + 1}`, [10, 260, h], [250, 260, h]), beam(`y${n}`, [0, 10, h], [0, 250, h]), beam(`y${n + 1}`, [260, 10, h], [260, 250, h])];
    const joins = (n, h) => [[`x${n}.a`, 'z1.back'], [`x${n}.b`, 'z2.front'], [`x${n + 1}.a`, 'z3.back'], [`x${n + 1}.b`, 'z4.front'], [`y${n}.a`, 'z1.top'], [`y${n}.b`, 'z3.bottom'], [`y${n + 1}.a`, 'z2.top'], [`y${n + 1}.b`, 'z4.bottom']].map(([a, b]) => ({ kind: 'blind', a, b: `${b}@${h}` }));
    const box = { title: 'Case', kind: 'fit', items: [beam('z1', [0, 0, 0], [0, 0, 250]), beam('z2', [260, 0, 0], [260, 0, 250]), beam('z3', [0, 260, 0], [0, 260, 250]), beam('z4', [260, 260, 0], [260, 260, 250]), ...ring(1, 240), ...ring(3, 10)],
      joins: [...joins(1, 240), ...joins(3, 10)], loads: [{ mass: 2, at: 'x1.top@50%' }], frame: { printed: 'petg' } };
    write('case', box);
    let r = probe('case');
    const each = r.filter((x) => x.code === 'beam.printable' && x.refs.beam), all = r.find((x) => x.code === 'beam.printable' && !x.refs.beam);
    assert.equal(each.length, 12);
    assert.ok(each.every((x) => x.level === 'pass' && x.refs.printable && x.values.margin >= 1 && x.refs.profile === 'profile-2020-printed'), JSON.stringify(each.map((x) => [x.refs.beam, x.values.margin])));
    // the most loaded, x1 (2 kg at its middle): its own sag, stress, creep and Euler's load each a margin, the least its creep sag
    const x1 = each.find((x) => x.refs.beam === 'x1');
    assert.deepEqual(Object.keys(x1.values.margins).sort(), ['buckling', 'creep', 'creepSag', 'deflection', 'stress']);
    assert.ok(x1.values.margins.creepSag < x1.values.margins.deflection, 'it sags more as it creeps');
    assert.match(x1.text, /^x1 can be printed in PETG, lying down \(profile-2020-printed, 62\.2 g\): its least margin is [\d.]+ times, its sag as it creeps\. .* It rests on the printed section's walls and infill, its plastic's figures and the creep shares \(estimates until the beam coupon is measured\), and 16 joins' springs .* as they are, made for metal beams$/);
    // its blind joins screw into its ends, where a printed beam has inserts: said, to be changed to a bracket or a gusset
    assert.equal(x1.refs.joins.length, 2);
    assert.match(x1.text, /Its joins as drawn need changing to print it: blind join of x1\.a to z1\.back@240 screws into its end a, where a printed beam has an insert, no bore to tap or pocket; .*A bracket or a gusset on its top slot takes it/);
    // all twelve printed together and solved once more: still within every limit
    assert.equal(all.level, 'pass');
    assert.deepEqual([all.values.printable, all.values.beams, all.refs.metal, all.refs.restsOn], [12, 12, [], 'estimate']);
    assert.ok(all.values.margin >= 1 && all.values.margin < Math.min(...each.map((x) => x.values.margin)), 'printed together, the frame is softer than with any one printed');
    assert.match(all.text, /^every beam of the frame can be printed in PETG \(12\), printed together and solved once more: the least margin is [\d.]+ on sag as it creeps \([\d.]+ mm at x1\.top@50%\); \d+ g of PETG in all\. 16 of its joins need changing to a bracket or a gusset/);
    // refused by name
    write('case', { ...box, frame: { printed: { material: 'petg', colour: 'red' } } });
    assert.deepEqual(probe('case').filter((x) => x.code === 'frame.solve').map((x) => x.text), ['frame: frame.printed has no "colour": it takes material, walls, infill, pose']);

    // 2. a gantry beam: 2020, 400 mm, held fixed at both ends, a carriage (a 608 standing in for it, 2 kg on it) on a
    // slide along it, the sag allowed 0.1 mm (the gantry's accuracy, frame.limit). In aluminium it passes; printed in
    // PETG it is longer than the X1C's 256 mm bed, so it lies down spliced, and it misses.
    // Hand calculation, the carriage at mid-span (as drawn), a beam fixed at both ends:
    //   F = (2 + 0.012) kg x 9.80665 = 19.73 N (2 kg and the 608's 12 g); w its own weight per mm
    //   sag = F L³ / (192 E I) + w L⁴ / (384 E I), L = 400, E = 1810 MPa (PETG HF along its layers), I the printed
    //   2020's second moment from its walls and infill (printedSection, read from beamModel here)
    //   aluminium: E I = 69972 x 7420: 19.73 x 400³ / (192 x 69972 x 7420) = 0.0127 mm, under 0.1: it passes
    //   printed: the misses-by figure is the sag as it creeps over 0.1 mm: sag / 0.5 (PRINTED_DEFAULTS.creep_modulus) / 0.1
    const gantry = { title: 'Gantry', kind: 'fit', items: [beam('x1', [0, 0, 300], [400, 0, 300]), { id: 'cart', bought: 'bearing-608' }],
      joints: [{ id: 'slide', type: 'prismatic', parent: { item: 'x1', at: [0, 10, 200], axis: [0, 0, 1] }, child: { item: 'cart', at: [0, 0, 0], axis: [0, 0, 1] }, min: -150, max: 150 }],
      loads: [{ mass: 2, at: 'cart.bore' }], frame: { supports: { 'x1.a': 'fixed', 'x1.b': 'fixed' }, limit: 0.1, printed: 'petg' } };
    write('gantry', gantry);
    r = probe('gantry');
    const g = r.find((x) => x.code === 'beam.printable' && x.refs.beam === 'x1'), gAll = r.find((x) => x.code === 'beam.printable' && !x.refs.beam);
    assert.equal(r.find((x) => x.code === 'frame.deflection').level, 'pass', 'in aluminium it holds');
    const pm = beamModel('profile-2020-printed', { length: 400, material: 'petg', printed: true }), EI = 1810 * pm.figures.inertiaX.value, w = (pm.mass / 400) * 9.80665 / 1000;
    const sag = (19.73 * 400 ** 3) / (192 * EI) + (w * 400 ** 4) / (384 * EI);
    assert.ok(Math.abs(g.values.sag - sag) / sag < 0.02, `solved ${g.values.sag} mm against the hand's ${sag}`);
    assert.ok(Math.abs(g.values.misses - (sag / 0.5) / 0.1) / g.values.misses < 0.02, `misses by ${g.values.misses} against ${(sag / 0.5) / 0.1}`);
    assert.deepEqual([g.level, g.refs.printable, g.refs.governs, g.refs.spliced, g.refs.alloy, g.values.strength], ['info', false, 'creepSag', true, 'al6n01-t5', 17]);
    assert.match(g.text, new RegExp(`^x1 needs al6n01-t5: printed in PETG, lying down, spliced \\(400 mm, longer than the bed\\) \\(profile-2020-printed\\), it misses by ${g.values.misses.toFixed(2).replace('.', '\\.')} times on its sag as it creeps\\. [\\d.]+ on sag as it creeps \\([\\d.]+ mm at cart\\.bore\\); [\\d.]+ on sag \\([\\d.]+ mm at cart\\.bore against 0\\.1 mm, the assembly's frame\\.limit\\)`));
    assert.match(g.text, /on stress \([\d.]+ MPa against 17 MPa as spliced/, 'a splice carries half: 0.5 x 34 MPa');
    assert.deepEqual([gAll.level, gAll.refs.printable, gAll.refs.metal], ['info', [], ['x1']]);
    assert.match(gAll.text, /^0 of the frame's 1 beams can be printed in PETG; x1 stays as it is/);

    // 3. the material on a beam: a 240 mm gantry beam printed in PETG standing up, in the frame as it is. Its stress is
    // held to PETG's 23 MPa across its layers (strength_z), not 34 along them, and its creep is checked
    write('gantry', { ...gantry, items: [{ id: 'x1', beam: { profile: 'profile-2020-printed', material: 'petg', printed: { pose: 'standing' } }, from: [0, 0, 300], to: [240, 0, 300] }, gantry.items[1]],
      joints: [{ ...gantry.joints[0], parent: { ...gantry.joints[0].parent, at: [0, 10, 120] }, min: -100, max: 100 }], frame: { supports: gantry.frame.supports, limit: 1 } });
    r = probe('gantry');
    const creep = r.find((x) => x.code === 'beam.creep'), stress = r.find((x) => x.code === 'frame.stress');
    assert.deepEqual([creep.level, creep.refs.beam, creep.refs.pose, creep.values.strength, creep.values.limit], ['pass', 'x1', 'standing', 23, 3.45]);
    assert.match(creep.text, /^x1: a sustained [\d.]+ MPa against the 3\.45 MPa it may hold for months \(0\.15 of its 23 MPa across its layers/);
    assert.deepEqual([stress.level, stress.values.strength], ['pass', 23]);
    assert.match(stress.text, /against petg's 23 MPa/);
    // (its own beam.printable says how it prints; the frame's, with refs.printable, only where frame.printed asks)
    assert.ok(!r.some((x) => x.code === 'beam.printable' && x.refs?.printable !== undefined), 'beam.printable across the frame only where frame.printed asks');

    // 4. a sag the frame as drawn already misses is no fault of printing. A 300 x 200 x 180 case, 1.5 kg at 30% of a top
    // beam, the sag allowed 0.0075 mm: in aluminium it already sags about 0.0083 mm there (frame.deflection fails). A
    // printed beam is held there to the drawn frame's own sag and 2% more (DRAWN_SLACK): y3, a side beam far from the
    // load, leaves that sag as it is (0.00833 mm printed against 0.0085 = 1.02 x 0.00833), so it can be printed; z3, the
    // leg under the loaded beam's nearer end, nearly doubles it (about 0.014 mm), and x2, the loaded beam, sags many
    // times more, so both still need aluminium. Before, every beam was held to the 0.0075 mm the drawn frame misses, and
    // all twelve were reported as needing aluminium.
    {
      const W = 300, D = 200, H = 180;
      const ring2 = (n, h) => [beam(`x${n}`, [10, 0, h], [W - 10, 0, h]), beam(`x${n + 1}`, [10, D, h], [W - 10, D, h]), beam(`y${n}`, [0, 10, h], [0, D - 10, h]), beam(`y${n + 1}`, [W, 10, h], [W, D - 10, h])];
      write('tight', { title: 'Tight case', kind: 'fit', items: [beam('z1', [0, 0, 0], [0, 0, H]), beam('z2', [W, 0, 0], [W, 0, H]), beam('z3', [0, D, 0], [0, D, H]), beam('z4', [W, D, 0], [W, D, H]), ...ring2(1, H - 10), ...ring2(3, 10)],
        joins: [...joins(1, H - 10), ...joins(3, 10)], loads: [{ mass: 1.5, at: 'x2.top@30%' }], frame: { printed: 'petg', limit: 0.0075 } });
      r = probe('tight');
      const deflection = r.find((x) => x.code === 'frame.deflection' && x.level === 'fail');
      assert.ok(deflection, 'in aluminium the frame already misses its sag');
      const one = (id) => r.find((x) => x.code === 'beam.printable' && x.refs.beam === id), sum = r.find((x) => x.code === 'beam.printable' && !x.refs.beam);
      const y3 = one('y3'), z3 = one('z3'), x2 = one('x2');
      assert.deepEqual([y3.level, y3.refs.printable], ['pass', true], y3.text);
      assert.ok(y3.values.drawnSag > 0.0075 && Math.abs(y3.values.margins.deflection - 1.02) < 0.005, `y3 held to the drawn ${y3.values.drawnSag} mm and 2%: ${y3.values.margins.deflection}`);
      assert.match(y3.text, /on sag \([\d.]+ mm at x2\.top@30% against [\d.]+ mm, the frame as drawn \([\d.]+ mm, already past its 0\.0075 mm there, printed or not\) and 2% more\)/);
      for (const b of [z3, x2]) assert.deepEqual([b.level, b.refs.printable], ['info', false], b.text);
      assert.ok(z3.values.sag > 1.5 * z3.values.drawnSag, 'printing z3 makes the sag much worse');
      assert.ok(sum.values.printable > 0 && sum.refs.printable.includes('y3') && !sum.refs.printable.includes('x2'), sum.text);
      assert.deepEqual(sum.refs.missed, ['x2.top@30%', 'x2 along its length']);
      assert.match(sum.text, /As drawn, unprinted, the frame already misses [\d.]+ mm at x2\.top@30% \(against 0\.0075 mm\).*\(frame\.deflection says so\): there a printed beam is held to the frame as drawn, within 2%, and blamed only where printing it makes that sag worse/);
    }
  } finally { done(); }
});

test('beam.printable with a stalled motor (#302): a printed beam\'s options take the motor\'s stall against its stop, as frame.stress does, by the hand moment', async () => {
  const { ws, done } = workspace();
  try {
    const { beamModel } = await import('@rulecad/frames');
    const at = (f) => path.join(ws, 'projects/frame', f);
    fs.mkdirSync(at('assemblies'), { recursive: true });
    fs.writeFileSync(at('project.json'), JSON.stringify({ name: 'frame', material: 'PLA', objects: [] }));
    const P = '2020-misumi-hfs5';
    const probe = (name, m) => {
      fs.writeFileSync(at(`assemblies/${name}.json`), JSON.stringify({ title: 'Arm', kind: 'fit', items: [{ id: 'x1', beam: { profile: P }, from: [0, 0, 300], to: [600, 0, 300] }, { id: 'p', beam: { profile: P, length: 100 } }, { id: 'm1', motor: m, at: 'x1.top@300' }],
        joints: [{ id: 'press', type: 'prismatic', parent: { item: 'x1', at: [0, 10, 600], axis: [0, 1, 0] }, child: { item: 'p', at: [0, 0, 0], axis: [0, 0, 1] }, min: 0, max: 40 }], frame: { supports: { 'x1.a': 'fixed' }, points: ['x1.top@600'], printed: 'petg' } }));
      return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
        const { buildAssembly, checkAssembly } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/assembly.mjs')).href)});
        const s = await buildAssembly('frame/${name}');
        console.log(JSON.stringify(checkAssembly(s).filter((f) => /^(beam\\.printable|frame\\.stress)$/.test(f.code)).map(({ level, code, text, values, refs }) => ({ level, code, text, values, refs }))));
      `], { cwd: ws, encoding: 'utf8', env: { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') } })).find((x) => x.code === 'beam.printable' && x.refs.beam === 'x1');
    };
    // The arm of the #302 test, every beam tried printed in PETG. The NEMA 17 on x1 at 300 mm, stalled against the
    // press's stop at the tip through its 8 mm lead screw, pushes F = 2 pi x 590 x 0.5748 / 8 = 266.46 N square to the
    // beam at 600 mm and back at its mount at 300 mm: the moment at the mount is F x 300 = 79,939 N mm. Over the printed
    // 2020's section modulus about that axis (modulusX, 717.6 mm^3, read from beamModel) that is 111.40 MPa. The beam's
    // own weight and the motor's add their small share (the bench case: the same motor driving nothing, 2.65 MPa)
    const stalled = probe('stall', { model: 'nema17', drives: 'press', leadscrew: { lead: 8, diameter: 8, friction: 0.2 } }), bench = probe('bench', { model: 'nema17' });
    const pm = beamModel('profile-2020-printed', { length: 600, material: 'petg', printed: { pose: 'lying' } });
    const eta = Math.tan(Math.atan(8 / (Math.PI * 8))) / Math.tan(Math.atan(8 / (Math.PI * 8)) + Math.atan(0.2)), F = (2 * Math.PI * 590 * eta) / 8, hand = (F * 300) / pm.figures.modulusX.value;
    const stressOf = (r) => Number(r.text.match(/on stress \(([\d.]+) MPa against/)[1]);
    const benchStress = stressOf(bench), stallStress = stressOf(stalled);
    assert.ok(benchStress < 5, `the bench case is the weights only: ${benchStress} MPa`);
    assert.ok(stallStress >= hand * 0.99 && stallStress <= hand + benchStress + 0.5, `printed x1 with the stall: ${stallStress} MPa against ${hand} MPa from the stall alone`);
    assert.ok(Math.abs(stalled.values.margins.stress / (17 / stallStress / 2) - 1) < 0.05, `its stress margin, 17 MPa spliced over its stress over 2: ${stalled.values.margins.stress}`);
    assert.equal(stalled.refs.printable, false);
  } finally { done(); }
});
