// cad's tests of frame checks: sag, stiffness, loads carried into the frame, and the frame in a machine's error budget. The shared helpers are in ./helpers.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { workspace, BIN } from './helpers.mjs';

test('the frame in a machine\'s error budget: an axis on a beam carries the beam\'s sag, solved with the frame, its straightness and its twist into task.accuracy as named terms', () => {
  const { ws, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/slide', f);
    fs.mkdirSync(at('assemblies'), { recursive: true });
    fs.writeFileSync(at('project.json'), JSON.stringify({ name: 'slide', material: 'PLA', objects: [] }));
    // a 600 mm 2020 beam 300 mm up, held fixed at both ends, an MGN12 rail 500 mm long on its top with an MGN12H
    // carriage carrying 2 kg; the task: the carriage's top along x, 0.4 mm either side of 4 mm allowed
    const a = { title: 'Axis', kind: 'fit', items: [{ id: 'x1', beam: { profile: '2020-misumi-hfs5' }, from: [0, 0, 300], to: [600, 0, 300] }],
      guides: [{ kind: 'rail', rail: 'rail-mgn12', carriage: 'MGN12H', on: 'x1.top', from: 50, length: 500 }], loads: [{ mass: 2, at: { item: 'g1-carriage-1', at: [0, 0, 13] } }],
      frame: { supports: { 'x1.a': 'fixed', 'x1.b': 'fixed' } }, task: { tool: 'g1-carriage-1.top', volume: { x: [100, 500], y: [0, 0], z: [323, 323] }, accuracy: 4 } };
    const { frame, ...loose } = a;
    fs.writeFileSync(at('assemblies/axis.json'), JSON.stringify(a)); fs.writeFileSync(at('assemblies/held.json'), JSON.stringify(loose));
    const probe = (name) => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
      const { buildAssembly, checkAssembly } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/assembly.mjs')).href)});
      const s = await buildAssembly('slide/${name}');
      console.log(JSON.stringify(checkAssembly(s).filter((f) => /^(task\\.accuracy|frame\\.deflection)$/.test(f.code)).map(({ level, code, text, values, refs }) => ({ level, code, text, values, refs }))));
    `], { cwd: ws, encoding: 'utf8', env: { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') } }));
    const r = probe('axis'), acc = r.find((x) => x.code === 'task.accuracy'), guide = r.find((x) => x.code === 'frame.deflection' && x.refs.where === 'g1'), load = r.find((x) => x.code === 'frame.deflection' && x.refs.where !== 'g1');
    const term = (f, name) => f.values.terms.find((x) => x.term === name);
    // the beam's sag is a named term, the frame's own figure along the rail, at the slide's middle (227.1 of its 454.2 mm
    // travel puts the carriage at x = 300, mid-span), where the frame checks solved it worst
    assert.equal(guide.refs.pose, 'g1-1 at 227.1');
    assert.deepEqual([term(acc, 'beam sag').mm, term(acc, 'beam sag').kind], [guide.values.sag, 'derived']);
    assert.match(term(acc, 'beam sag').note, /^x1 under g1, solved with the frame, g1-1 at 227\.1: [\d.]+ mm with its joins rigid$/);
    // the 2 kg's own share, by hand: a beam fixed at both ends with a load P at its middle sags P L³ / (192 E I)
    // (Roark, table 8.1, case 1d): 2 × 9.80665 × 600³ / (192 × 69972 × 7420) = 19.6133 × 2.16e8 / 9.9683e10 = 0.0425 mm
    assert.ok(Math.abs(load.values.alone - 0.0425) < 0.001, `${load.values.alone}`);
    // twist: 3.33° a metre (the profile's JIS figure) over the 500 mm rail is 1.665°, turning the carriage about x1's axis;
    // its top is 23 mm from that axis (10 to the beam's face, 13 to the carriage's top): 1.665 × π / 180 × 23 = 0.6684 mm
    assert.deepEqual([term(acc, 'beam twist').mm, term(acc, 'beam twist').kind], [0.6684, 'spec']);
    // straightness from the rail's own terms (4.33 mm a metre over 500 mm), and the worst case is every term summed
    assert.equal(term(acc, 'beam straightness').mm, 2.165);
    assert.ok(Math.abs(acc.values.worst - acc.values.terms.reduce((t, x) => t + x.mm, 0)) < 1e-9);
    assert.deepEqual(acc.values.terms.map((x) => x.term), ['rail parallelism', 'carriage play', 'beam straightness', 'beam sag', 'beam twist']);
    assert.match(acc.text, /Biggest: g1-1's beam straightness, 2\.165 mm\./); // (mm on a slide, not degrees)
    // with no frame to solve (no joins, no frame key) the rail's own estimate stands: pinned ends, its own and the
    // carriage's weight only (railTerms), so it neither knows the 2 kg nor how the beam is held
    const held = probe('held'), hacc = held.find((x) => x.code === 'task.accuracy');
    assert.equal(held.filter((x) => x.code === 'frame.deflection').length, 0);
    assert.equal(term(hacc, 'beam sag').kind, 'estimate'); assert.match(term(hacc, 'beam sag').note, /pinned at its ends/); assert.notEqual(term(hacc, 'beam sag').mm, guide.values.sag);
  } finally { done(); }
});

test('frame checks: a shelf frame with 5 kg at mid-span sags as a hand calculation says with rigid joins, more on the joins\' estimated springs, and says which it rests on; its supports, limit, stress and buckling', () => {
  const { ws, cad, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/frame', f), file = at('assemblies/shelf.json');
    fs.mkdirSync(at('assemblies'), { recursive: true });
    fs.writeFileSync(at('project.json'), JSON.stringify({ name: 'frame', material: 'PLA', objects: [] }));
    // four legs 400 mm tall (z), a front and a back beam 600 mm long between them (x1, x2), two sides 300 mm long
    // (y1, y2), all 2020, each end joined blind to a leg's face 390 mm up; 5 kg on x1's top at mid-span
    const P = '2020-misumi-hfs5', beam = (id, from, to) => ({ id, beam: { profile: P }, from, to }), H = 390;
    const shelf = { title: 'Shelf', kind: 'fit', items: [beam('z1', [0, 0, 0], [0, 0, 400]), beam('z2', [620, 0, 0], [620, 0, 400]), beam('z3', [0, 320, 0], [0, 320, 400]), beam('z4', [620, 320, 0], [620, 320, 400]),
      beam('x1', [10, 0, H], [610, 0, H]), beam('x2', [10, 320, H], [610, 320, H]), beam('y1', [0, 10, H], [0, 310, H]), beam('y2', [620, 10, H], [620, 310, H])],
    joins: [['x1.a', 'z1.back'], ['x1.b', 'z2.front'], ['x2.a', 'z3.back'], ['x2.b', 'z4.front'], ['y1.a', 'z1.top'], ['y1.b', 'z3.bottom'], ['y2.a', 'z2.top'], ['y2.b', 'z4.bottom']].map(([a, b]) => ({ kind: 'blind', a, b: `${b}@390` })),
    loads: [{ mass: 5, at: 'x1.top@50%', note: '5 kg at mid-span' }] };
    const write = (x) => fs.writeFileSync(file, JSON.stringify(x));
    const probe = () => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
      const { buildAssembly, checkAssembly } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/assembly.mjs')).href)});
      const s = await buildAssembly('frame/shelf');
      console.log(JSON.stringify(checkAssembly(s).filter((f) => /^frame\\.(solve|deflection|stress|buckling)$/.test(f.code)).map(({ level, code, text, values, refs, at }) => ({ level, code, text, values, refs, at }))));
    `], { cwd: ws, encoding: 'utf8', env: { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') } }));
    write(shelf);
    let r = probe();
    const by = (code) => r.filter((x) => x.code === code), sag = () => by('frame.deflection')[0];
    // the model: 8 beams, the four leg feet the lowest ends, held pinned; every join's spring an estimate
    assert.match(by('frame.solve')[0].text, /8 beams on 21 nodes, held at z1\.a \(pinned, a lowest end\), z2\.a \(pinned, a lowest end\), z3\.a \(pinned, a lowest end\), z4\.a \(pinned, a lowest end\)/);
    assert.match(by('frame.solve')[0].text, /8 joins' springs \(8 blind: an estimate\), 8 of them an estimate until the joint rig \(issue 264\) measures it/);
    // The hand calculation, the 5 kg alone. x1 spans L = 600 mm between the legs' faces, each end on a rigid offset
    // e = 10 mm from a leg's axis; P = 5 × 9.80665 = 49.03 N at mid-span. 2020 HFS5: I = 7420 mm⁴, A = 183 mm²,
    // J = 809.3 mm⁴ (worked out from the outline); A6N01: E = 69972 MPa, G = E / 2(1 + 0.33) = 26305 MPa.
    // Each front corner turns by θ (the load is symmetric, so the corners turn equally and nothing sways). What holds
    // a corner from turning, K: the leg, pinned at its foot h = 390 mm below, 3EI/h = 3.994e6 N·mm/rad; and the side
    // beam twisting (GJ/Ls = 26305 × 809.3 / 300 = 7.096e4) in series with the back corner, which its leg (3EI/h) and
    // the back beam (2EI/L = 1.731e6, turned the same way at both ends) hold: 1 / (1/7.096e4 + 1/5.725e6) = 7.009e4.
    // K = 3.994e6 + 7.009e4 = 4.064e6 N·mm/rad.
    // x1 as a beam fixed at both ends that turn by θ: its end moment M = PL/8 − (2EI/L) θ; the corner carries M and
    // the end shear P/2 on the offset e: M + Pe/2 = K θ, so θ = (PL/8 + Pe/2) / (K + 2EI/L)
    //   = (3677.5 + 245.2) / (4.064e6 + 1.731e6) = 6.770e-4 rad, and M = 3677.5 − 1.731e6 × 6.770e-4 = 2505.9 N·mm.
    // Mid-span sag: the offset's drop e θ, the simply supported beam's PL³/48EI less the end moments' M L²/8EI, and the
    // leg's shortening (P/2) h / EA:
    //   0.00677 + 0.42498 − 0.21719 + 0.00075 = 0.2153 mm, joins rigid.
    // With each join a spring k = 1.5e6 N·mm/rad (blind, an estimate) at the beam's end, in series: the beam's end turns
    // θ + M/k. With r = (2EI/L)/k = 1.154: M = (PL/8 − (2EI/L) θ) / (1 + r), and the corner's θ = (PL/8 / (1 + r) +
    // Pe/2) / (K' + (2EI/L) / (1 + r)), K' the same with the side beam's two twist springs (3e5 each) and the back beam's
    // two bending springs in its chain: θ = 4.030e-4, M = 1383.6 N·mm, sag = 0.3098 mm.
    const hand = { rigid: 0.21531, spring: 0.30984 };
    const v = sag().values;
    assert.ok(Math.abs(v.aloneRigid - hand.rigid) / hand.rigid < 0.01, `rigid joins: ${v.aloneRigid} mm against the hand's ${hand.rigid}`);
    assert.ok(Math.abs(v.alone - hand.spring) / hand.spring < 0.01, `the joins' springs: ${v.alone} mm against the hand's ${hand.spring}`);
    assert.ok(v.alone > v.aloneRigid * 1.3, 'the estimated springs give the larger sag');
    // with the frame's own weight beside the 5 kg: a little more, both ways; under span / 360 = 1.667 mm, and it says
    // which figure rests on what
    assert.deepEqual([sag().level, v.limit, v.sag > v.alone, v.rigid > v.aloneRigid], ['pass', 1.667, true, true]);
    assert.match(sag().text, /^x1 at x1\.top@50% sags 0\.3\d\d mm, with the joins' springs; 0\.2\d\d mm with the joins rigid \(of these, 0\.31 and 0\.215 mm from the 5 kg there alone\)\. The first rests on 8 joins' springs \(8 blind: an estimate\), so the true sag lies near it, and the rigid figure is the least it can be: against 1\.667 mm, x1's span, 600 mm, over 360/);
    assert.equal(sag().refs.restsOn, 'estimate');
    assert.deepEqual(sag().at.map(Math.round), [310, 0, 390]);
    // stress: x1 the most stressed, far under A6N01's 205 MPa; the blind joins' moments said, with no strength to
    // check them against; buckling: the legs in compression, the most loaded carrying about half the 5 kg and its share of the weight
    const st = by('frame.stress');
    assert.match(st.find((x) => x.level === 'pass').text, /every beam stays under its alloy's strength with 2 times to spare: the most stressed is x1, 8\.\d+ MPa against 205 MPa/);
    assert.match(st.find((x) => x.level === 'info').text, /8 joins \(blind\) have no strength in the kit to check against: the largest moment is 2\.\d+ N·m bending/);
    const legs = by('frame.buckling').find((x) => x.values.compression);
    assert.ok(legs.values.compression > 24.5 && legs.values.compression < 30, JSON.stringify(legs.values));
    assert.match(by('frame.buckling').find((x) => x.values.factor).text, /the whole frame, with the joins' springs, buckles first at \d+(\.\d)? times its load as drawn/);

    // measured joins: the workspace's joins set with blind's springs measured on the joint rig: the same figures, and
    // the finding says it rests on measured joins
    fs.mkdirSync(path.join(ws, 'rules'), { recursive: true });
    const rule = (value) => ({ value, unit: 'N mm/rad', rule: 'measured on the joint rig', kind: 'measured', source: 'the joint rig', checked: '2026-11-17' });
    fs.writeFileSync(path.join(ws, 'rules/joins.json'), JSON.stringify({ name: 'joins', part: 'joins', rules: { blind_bending: rule(1.5e6), blind_twist: rule(3e5) } }));
    r = probe();
    assert.match(sag().text, /It rests on 8 joins' springs \(8 blind: measured\): against/);
    assert.equal(sag().refs.restsOn, 'measured');
    fs.rmSync(path.join(ws, 'rules/joins.json'));

    // feet: a foot on each leg's end a holds the frame there; fixed supports (said in "frame") hold it more stiffly;
    // a limit of 0.2 mm fails it, saying by how much; 300 kg fails x1's alloy
    write({ ...shelf, items: [...shelf.items, ...['z1', 'z2', 'z3', 'z4'].map((z, i) => ({ id: `f${i + 1}`, fitting: { kind: 'foot', profile: P }, at: `${z}.a` }))] });
    r = probe();
    assert.match(by('frame.solve')[0].text, /held at z1\.a \(pinned, f1, a foot\), z2\.a \(pinned, f2, a foot\)/);
    const pinned = sag().values.alone;
    write({ ...shelf, frame: { supports: { 'z1.a': 'fixed', 'z2.a': 'fixed', 'z3.a': 'fixed', 'z4.a': 'fixed' }, limit: 0.2 } });
    r = probe();
    assert.match(by('frame.solve')[0].text, /held at z1\.a \(fixed, frame\.supports\)/);
    assert.ok(sag().values.alone < pinned, `fixed feet ${sag().values.alone} mm, pinned ${pinned}`);
    assert.equal(sag().level, 'fail');
    assert.match(sag().text, /against 0\.2 mm, the assembly's frame\.limit: 1\.\d+ times over\. Stiffen the beam/);
    write({ ...shelf, loads: [{ mass: 300, at: 'x1.top@50%' }] });
    r = probe();
    const x1 = by('frame.stress').find((x) => x.refs.beam === 'x1');
    assert.equal(x1.level, 'fail');
    assert.match(x1.text, /^x1: \d+\.\d+ MPa at worst .* against al6n01-t5's 205 MPa: 0\.\d+ times under it, where about 2 is wanted/);
    // a moving mass: a cart sliding along x2 (a bearing standing in for it, 2 kg on it), from 50 to 300 mm along: solved
    // at each end of its travel and its quarters between (frame.sweep) and as drawn, the worst named; and a named point, x2's middle
    write({ ...shelf, items: [...shelf.items, { id: 'cart', bought: 'bearing-608' }], joints: [{ id: 'slide', type: 'prismatic', parent: { item: 'x2', at: [0, 10, 50], axis: [0, 0, 1] }, child: { item: 'cart', at: [0, 0, 0], axis: [0, 0, 1] }, min: 0, max: 250 }],
      loads: [...shelf.loads, { mass: 2, at: 'cart.bore' }], frame: { points: ['x2.top@50%'] } });
    r = probe();
    assert.match(by('frame.solve')[0].text, /1 item mounted on it and 2 loads, in 6 poses/);
    const cart = by('frame.deflection').find((x) => x.refs.where === 'cart.bore'), mid = by('frame.deflection').find((x) => x.refs.where === 'x2.top@50%');
    assert.deepEqual([cart.refs.pose, mid.refs.pose, Math.round(cart.at[0])], ['slide at 250', 'slide at 250', 310]);
    assert.ok(cart.values.alone > 0.05 && cart.values.sag > cart.values.alone, JSON.stringify(cart.values));
    // refused by name: a support on what is not a beam of the frame
    write({ ...shelf, frame: { supports: { 'q9.a': 'pinned' } } });
    r = probe();
    assert.deepEqual(by('frame.solve').map((x) => [x.level, x.text]), [['fail', 'frame: frame.supports: "q9.a" is on a beam of the frame, as z1.a or x1.bottom@50% (beams: z1, z2, z3, z4, x1, x2, y1, y2)']]);
    // the check view: cad beams draws the sag, scaled and saying so
    write(shelf);
    assert.match(cad('beams', 'frame/shelf'), /the frame's sag, drawn [\d.]+ times its size \(a check view\): exports[\\/]frame[\\/]shelf\.frame-sag\.svg/);
    assert.match(fs.readFileSync(path.join(ws, 'exports/frame/shelf.frame-sag.svg'), 'utf8'), /deflection drawn [\d.]+ times its size \(scaled\): 0\.3\d\d mm at most/);
  } finally { done(); }
});

test('frame checks: a figure on estimated joins says so even where the springs change nothing, and a beam riding a moving joint weighs on the frame', () => {
  const { ws, cad, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/frame', f), file = at('assemblies/portal.json');
    fs.mkdirSync(at('assemblies'), { recursive: true });
    fs.writeFileSync(at('project.json'), JSON.stringify({ name: 'frame', material: 'PLA', objects: [] }));
    // a portal: two 2020 legs 400 mm tall, fixed at their feet, a 600 mm beam x1 joined blind between them 390 mm up
    const P = '2020-misumi-hfs5', beam = (id, from, to) => ({ id, beam: { profile: P }, from, to });
    const portal = { title: 'Portal', kind: 'fit', items: [beam('z1', [0, 0, 0], [0, 0, 400]), beam('z2', [620, 0, 0], [620, 0, 400]), beam('x1', [10, 0, 390], [610, 0, 390])],
      joins: [{ kind: 'blind', a: 'x1.a', b: 'z1.back@390' }, { kind: 'blind', a: 'x1.b', b: 'z2.front@390' }], frame: { supports: { 'z1.a': 'fixed', 'z2.a': 'fixed' } } };
    const write = (x) => fs.writeFileSync(file, JSON.stringify(x));
    const probe = () => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
      const { buildAssembly, checkAssembly } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/assembly.mjs')).href)});
      const s = await buildAssembly('frame/portal');
      console.log(JSON.stringify(checkAssembly(s).filter((f) => /^frame\\.(solve|deflection)$/.test(f.code)).map(({ level, code, text, values, refs }) => ({ level, code, text, values, refs }))));
    `], { cwd: ws, encoding: 'utf8', env: { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') } }));
    let r;
    const by = (code) => r.filter((x) => x.code === code), point = (where) => by('frame.deflection').find((x) => x.refs.where === where);

    // 1. the middle of leg z1 hardly sags at all, with the joins' springs or rigid: the two figures match, yet both
    // rest on the two blind joins' estimated springs, and refs.restsOn says so
    write({ ...portal, loads: [{ mass: 5, at: 'x1.top@50%' }], frame: { ...portal.frame, points: ['z1.top@50%'] } });
    r = probe();
    const leg = point('z1.top@50%');
    assert.match(leg.text, /It rests on 2 joins' springs \(2 blind: an estimate\)/);
    assert.equal(leg.refs.restsOn, 'estimate');
    assert.equal(point('x1.top@50%').refs.restsOn, 'estimate');

    // 2. a 2 m beam g rides a slide along x1 (from 100 to 400 mm along it), its middle on the slide: g is not part of
    // the frame, and its whole weight hangs on x1 where the slide is. The hand check is superposition: x1 is linear,
    // so x1's sag 400 mm along with g where it sags it most equals its sag with g's mass set down as a load there
    // (its centre straight above the node: no moment, the force alone), within 1%
    const ride = { ...portal, items: [...portal.items, { id: 'g', beam: { profile: P, length: 2000 } }],
      joints: [{ id: 'slide', type: 'prismatic', parent: { item: 'x1', at: [0, 10, 100], axis: [0, 0, 1] }, child: { item: 'g', at: [0, 0, 1000], axis: [0, 0, 1] }, min: 0, max: 300 }],
      frame: { ...portal.frame, points: ['x1.top@400'] } };
    write(ride);
    r = probe();
    const solve = by('frame.solve')[0], g = solve.refs.riding.find((x) => x.id === 'g');
    assert.doesNotMatch(solve.text, /Left out/);
    assert.match(solve.text, /g rides on slide, its [\d.]+ kg weighed on the frame/);
    // 2020 HFS5 weighs about 0.5 kg/m (its sheet's mass per metre): 2 m of it about 1 kg
    assert.ok(g.kg > 0.8 && g.kg < 1.3, JSON.stringify(g));
    // The slide is swept through its travel in quarters (frame.sweep, issue 302), and the worst place for the sag at
    // 400 mm is not its far end: on a simple span L the sag at x from a load at a < x goes as a (2 L x - x^2 - a^2),
    // greatest at a = sqrt((2 L x - x^2) / 3) = sqrt((2 x 600 x 400 - 400^2) / 3) = 327 mm along it. The slide's
    // quarter at 225 puts g's middle at 325 mm, the sweep's step nearest that
    const riding = point('x1.top@400');
    assert.equal(riding.refs.pose, 'slide at 225');
    write({ ...portal, loads: [{ mass: g.kg, at: 'x1.top@325' }], frame: { ...portal.frame, points: ['x1.top@400'] } });
    r = probe();
    const set = point('x1.top@400');
    assert.ok(Math.abs(riding.values.sag - set.values.sag) / set.values.sag < 0.01, `riding ${riding.values.sag} mm, set down ${set.values.sag} mm`);
    assert.ok(Math.abs(riding.values.rigid - set.values.rigid) / set.values.rigid < 0.01, `rigid: riding ${riding.values.rigid} mm, set down ${set.values.rigid} mm`);
    // and without g at all, x1 sags less: its weight was not dropped
    write({ ...portal, frame: { ...portal.frame, points: ['x1.top@400'] } });
    r = probe();
    assert.ok(point('x1.top@400').values.sag < riding.values.sag * 0.8, `bare ${point('x1.top@400').values.sag} mm, with g ${riding.values.sag} mm`);
  } finally { done(); }
});

test('frame checks: a portal in one plane on pinned feet and a beam pinned at both ends solve, held where nothing holds them, and the portal sags as slope-deflection says; a push across the portal finds it free, it tips over rather than buckles, and its lowest mode is 0 Hz', () => {
  const { ws, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/frame', f), file = at('assemblies/portal.json');
    fs.mkdirSync(at('assemblies'), { recursive: true });
    fs.writeFileSync(at('project.json'), JSON.stringify({ name: 'frame', material: 'PLA', objects: [] }));
    const P = '2020-misumi-hfs5', beam = (id, from, to) => ({ id, beam: { profile: P }, from, to });
    const write = (x) => fs.writeFileSync(file, JSON.stringify(x));
    const probe = () => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
      const { buildAssembly, checkAssembly } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/assembly.mjs')).href)});
      const s = await buildAssembly('frame/portal');
      console.log(JSON.stringify(checkAssembly(s).filter((f) => /^frame\\.(solve|deflection|rack|buckling|frequency)$/.test(f.code)).map(({ level, code, text, values, refs }) => ({ level, code, text, values, refs }))));
    `], { cwd: ws, encoding: 'utf8', env: { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') } }));
    // 1. two 2020 posts 400 mm tall on pinned feet, a 600 mm rail x1 joined blind between them 390 mm up, 5 kg at its
    // middle. Out of the frame's plane nothing holds it (both posts lean about their feet together); in it, the hand
    // figure for the 5 kg alone with the joins rigid, by slope-deflection (symmetric, so no sway; the corner turns θ):
    //   E = 69972 MPa, I = 7420 mm⁴ (the profile's figures), A = 183 mm², P = 5 × 9.80665 = 49.03 N, the rail's span
    //   l = 600 mm, a rigid link e = 10 mm from each post's axis to the rail's end, the post h = 390 mm to the join.
    //   Post, foot pinned:  M = 3 E I θ / h.   Rail, ends turning θ and −θ:  M_end = P l / 8 − 2 E I θ / l.
    //   At the post's node the rail's end moment and its shear P/2 on the link:  3 E I θ / h = M_end + P e / 2,
    //   so θ = (P l / 8 + P e / 2) / (3 E I / h + 2 E I / l) = 3922.7 / (3.9937e6 + 1.7307e6) = 6.853e-4 rad,
    //   M_end = 3677.5 − 1185.9 = 2491.6 N·mm.
    //   Sag:  P l³ / 48 E I − M_end l² / 8 E I = 0.4250 − 0.2160 = 0.2090 mm, plus the link's drop θ e = 0.0069 mm
    //   and the post's shortening (P/2) h / E A = 0.0007 mm: 0.2166 mm.
    //   With the joins' springs (1.5e6 N·mm/rad in bending, the blind join's estimate) between the rail's end turning
    //   θb and the post's node turning θp:  P l / 8 − 2 E I θb / l = k (θb − θp)  and  k (θb − θp) + P e / 2 = 3 E I θp / h
    //   give θb = 1.3273e-3, θp = 4.070e-4, M_end = 1380.4 N·mm, and a sag of 0.4250 − 0.1197 + 0.0041 + 0.0007 = 0.3102 mm.
    const portal = { title: 'Portal', kind: 'fit', items: [beam('z1', [0, 0, 0], [0, 0, 400]), beam('z2', [620, 0, 0], [620, 0, 400]), beam('x1', [10, 0, 390], [610, 0, 390])],
      joins: [{ kind: 'blind', a: 'x1.a', b: 'z1.back@390' }, { kind: 'blind', a: 'x1.b', b: 'z2.front@390' }], loads: [{ mass: 5, at: 'x1.top@50%' }], frame: { supports: { 'z1.a': 'pinned', 'z2.a': 'pinned' } } };
    write(portal);
    let r = probe();
    const solve = r.find((x) => x.code === 'frame.solve'), sag = r.find((x) => x.code === 'frame.deflection');
    assert.equal(solve.level, 'info', solve.text);
    // said as how it moves, not as a freedom at a node (issue 304): the posts lean about their feet, the top along y
    assert.match(solve.text, /Nothing holds it one way: the frame tips over along y \(free at z2\.b: rx\), with nothing resisting\. Its loads do not move it that way/);
    assert.deepEqual(solve.refs.how, ['the frame tips over along y']);
    assert.deepEqual(solve.refs.held, [{ node: 'z2.b', freedom: 'rx' }]);
    assert.ok(sag, 'the sag is solved, not left to estimates');
    assert.ok(Math.abs(sag.values.aloneRigid / 0.2166 - 1) < 0.01, `rigid ${sag.values.aloneRigid} mm against 0.2166 by hand`);
    assert.ok(Math.abs(sag.values.alone / 0.3102 - 1) < 0.01, `springs ${sag.values.alone} mm against 0.3102 by hand`);
    const rack = r.filter((x) => x.code === 'frame.rack'), across = rack.find((x) => x.refs.direction === 'along y');
    assert.ok(rack.find((x) => x.refs.direction === 'along x').values.stiffness > 0, 'racked in its plane, it has a stiffness');
    assert.equal(across.level, 'warn');
    assert.match(across.text, /racked along y: nothing holds the frame that way, the frame tips over along y \(free at z2\.b: rx\), so 20 N pushed at the top \(frame\.push, an estimate\) moves it with nothing resisting/);
    // Out of its plane the frame turns about the line through its feet, and its posts are squeezed (each carries half
    // the rail and the 5 kg): turned by θ, each post's compression N does N θ² h of work leaning it further, so
    // nothing in the frame stops it at any share of its load. It tips over: factor 0 (held at the post's top it read
    // 2.5, a support the frame has not). Its lowest mode is 0 Hz, that same lean; the next is its own, in its plane.
    const whole = r.find((x) => x.code === 'frame.buckling' && /whole frame/.test(x.text));
    assert.equal(whole.level, 'fail', whole.text);
    assert.equal(whole.values.factor, 0);
    assert.match(whole.text, /the whole frame tips over under its load as drawn before anything buckles: nothing holds it one way, the frame tips over along y \(free at z2\.b: rx\)/);
    assert.deepEqual(whole.refs.tipped, [{ node: 'z2.b', freedom: 'rx' }]);
    const mode = r.find((x) => x.code === 'frame.frequency');
    assert.equal(mode.level, 'warn', mode.text);
    assert.equal(mode.values.Hz, 0); assert.equal(mode.values.free, 1);
    assert.match(mode.text, /the lowest mode is 0 Hz: nothing holds the frame one way, the frame tips over along y \(free at z2\.b: rx\), so it moves that way with nothing resisting/);
    assert.ok(mode.values.modes[1] > 1, JSON.stringify(mode.values.modes));
    assert.match(solve.text, /its modes and buckling count it free \(frame\.frequency, frame\.buckling\)/);
    // with no supports said, its lowest ends are guessed: pinned would leave it free, so each post stands on its end
    // face, held from turning (fixed), and nothing is held, tips or rings at 0 Hz
    write({ ...portal, frame: undefined });
    const guessed = probe(), gs = guessed.find((x) => x.code === 'frame.solve');
    assert.match(gs.text, /held at z1\.a \(fixed, a lowest end, standing on its end face\), z2\.a \(fixed, a lowest end, standing on its end face\)/);
    assert.deepEqual(gs.refs.held, []);
    assert.equal(guessed.find((x) => x.code === 'frame.buckling' && /whole frame/.test(x.text)).level, 'pass');
    assert.ok(guessed.find((x) => x.code === 'frame.frequency').values.Hz > 1);
    // and the guess is said: nobody gave those fixed ends, and on pinned feet the portal is free out of its plane (the
    // tip-over above), so the solve warns and every figure that rests on them says so. Racked along x it sways 0.259 mm
    // here where pinned feet gave 1.669 mm and a warning, and along y it passes at 0.411 mm though pinned feet leave it free
    assert.equal(gs.level, 'warn', gs.text);
    assert.match(gs.text, /Its supports are guessed: nothing says where it is held \(no feet, no "frame": \{ "supports" \}\), and on its lowest ends pinned, as a foot stands on a floor, nothing would hold it: the frame tips over along y \(free at z2\.b: rx\)\. So it is solved with z1\.a and z2\.a fixed, standing on their end faces, and every sag, rack, buckling and frequency figure rests on those ends held from turning, which nothing in the assembly gives\. Give it feet, or say how it is held in "frame": \{ "supports" \}/);
    assert.deepEqual([gs.refs.guessed, gs.refs.free], [['z1.a', 'z2.a'], [{ node: 'z2.b', freedom: 'rx' }]]);
    const onGuess = guessed.filter((x) => ['frame.rack', 'frame.buckling', 'frame.frequency'].includes(x.code));
    assert.deepEqual([...new Set(onGuess.map((x) => x.code))].sort(), ['frame.buckling', 'frame.frequency', 'frame.rack']);
    for (const x of onGuess) {
      assert.match(x.text, /\. This rests on supports guessed, not given: z1\.a and z2\.a fixed, standing on their end faces, where on pinned feet nothing would hold it: the frame tips over along y \(free at z2\.b: rx\)$/, x.text);
      assert.deepEqual(x.refs.guessed, ['z1.a', 'z2.a'], x.code);
    }
    assert.deepEqual(guessed.filter((x) => x.code === 'frame.rack').map((x) => [x.refs.direction, x.values.sway]), [['along x', 0.259], ['along y', 0.411]]);
    // supports given (the pinned feet above) are no guess: nothing of it is said
    assert.ok(r.every((x) => !/supports guessed/.test(x.text) && x.refs?.guessed == null));
    // 2. a lone beam pinned at both ends spins on its axis with nothing resisting: held, it sags as a simple span
    write({ title: 'Lone', kind: 'fit', items: [beam('x1', [0, 0, 300], [600, 0, 300])], loads: [{ mass: 3, at: 'x1.top@50%' }], frame: { supports: { 'x1.a': 'pinned', 'x1.b': 'pinned' } } });
    r = probe();
    assert.match(r.find((x) => x.code === 'frame.solve').text, /Nothing holds it one way: x1 spins on its own axis \(free at x1\.b: rx\)/);
    // the 3 kg alone: P l³ / 48 E I = 29.42 × 600³ / (48 × 69972 × 7420) = 0.2550 mm
    assert.ok(Math.abs(r.find((x) => x.code === 'frame.deflection').values.alone / 0.2550 - 1) < 0.01);
  } finally { done(); }
});

test('frame checks: a lid across the top of a corner-post box is a shear web on its bay, weighed at its corners; a panel on beams that make no bay is weighed along them, never dropped', () => {
  const { ws, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/frame', f), file = at('assemblies/box.json');
    fs.mkdirSync(at('assemblies'), { recursive: true });
    fs.writeFileSync(at('project.json'), JSON.stringify({ name: 'frame', material: 'PLA', objects: [] }));
    // a 400 x 300 x 350 box of 2020: four posts, and at the top and the bottom two rails each way joined blind to the
    // posts (not to each other), as a corner-post box is built
    const P = { profile: '2020-misumi-hfs5' }, W = 400, D = 300, H = 350, items = [], joins = [];
    [[0, 0], [W, 0], [0, D], [W, D]].forEach(([x, y], i) => items.push({ id: `z${i + 1}`, beam: P, from: [x, y, 0], to: [x, y, H] }));
    for (const [o, z] of [[0, H - 10], [2, 10]]) {
      items.push({ id: `x${o + 1}`, beam: P, from: [10, 0, z], to: [W - 10, 0, z] }, { id: `x${o + 2}`, beam: P, from: [10, D, z], to: [W - 10, D, z] }, { id: `y${o + 1}`, beam: P, from: [0, 10, z], to: [0, D - 10, z] }, { id: `y${o + 2}`, beam: P, from: [W, 10, z], to: [W, D - 10, z] });
      joins.push({ kind: 'blind', a: `x${o + 1}.a`, b: `z1.back@${z}` }, { kind: 'blind', a: `x${o + 1}.b`, b: `z2.front@${z}` }, { kind: 'blind', a: `x${o + 2}.a`, b: `z3.back@${z}` }, { kind: 'blind', a: `x${o + 2}.b`, b: `z4.front@${z}` },
        { kind: 'blind', a: `y${o + 1}.a`, b: `z1.top@${z}` }, { kind: 'blind', a: `y${o + 1}.b`, b: `z3.bottom@${z}` }, { kind: 'blind', a: `y${o + 2}.a`, b: `z2.top@${z}` }, { kind: 'blind', a: `y${o + 2}.b`, b: `z4.bottom@${z}` });
    }
    const lid = { id: 'lid', panel: { sheet: 'acrylic', thickness: 3, bay: ['x1', 'y2', 'x2', 'y1'], out: [0, 0, 1] } };
    const write = (x) => fs.writeFileSync(file, JSON.stringify(x));
    const probe = () => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
      const { buildAssembly, checkAssembly } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/assembly.mjs')).href)});
      const s = await buildAssembly('frame/box');
      console.log(JSON.stringify(checkAssembly(s).filter((f) => /^(frame\\.(solve|deflection|frequency)|panel\\.size)$/.test(f.code)).map(({ level, code, text, values, refs }) => ({ level, code, text, values, refs }))));
    `], { cwd: ws, encoding: 'utf8', env: { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') } }));
    const box = { title: 'Box', kind: 'fit', items, joins, frame: { points: ['x1.top@50%'] } };
    write(box);
    const bare = probe(), carriedOf = (r) => r.find((x) => x.code === 'frame.frequency').values.carried, sagOf = (r) => r.find((x) => x.code === 'frame.deflection').values.rigid;
    // 1. the lid on the top: its rails join the posts, so its bay's corners are the posts' nodes at the rails' height;
    // it is a shear web there, and its weight is carried (its clips were the only mass weighed before)
    write({ ...box, items: [...items, lid] });
    let r = probe();
    const solve = r.find((x) => x.code === 'frame.solve');
    assert.match(solve.text, /lid is a shear web on its bay, \d+ N\/mm along its diagonal/);
    assert.doesNotMatch(solve.text, /not weighed on the frame: lid/);
    const grams = /([\d.]+) g/.exec(r.find((x) => x.code === 'panel.size').text)?.[1];
    // the lid's own mass is in what the frame carries: the carried mass grows by at least the sheet's grams
    const kg = carriedOf(r) - carriedOf(bare);
    assert.ok(kg > 0.3 && (!grams || kg >= Number(grams) / 1000 - 1e-3), `carried grew by ${kg} kg, the lid ${grams} g`);
    // (a web's weight is set at its bay's corners, on the posts, so the rails between carry none of it)
    // 2. the same lid with the side rails y1 and y2 joined to nothing (left out of the frame): x1 and x2 make no bay,
    // and the lid lies on them, its weight spread along both
    write({ ...box, items: [...items, lid], joins: joins.filter((j) => !/^y[12]\./.test(j.a)) });
    r = probe();
    const laid = r.find((x) => x.code === 'frame.solve');
    assert.match(laid.text, /lid lies on x1, x2, which are not joined round it as a bay: its [\d.]+ kg is spread along them, and it is no shear web/);
    assert.deepEqual(laid.refs.laid.map((p) => p.beams), [['x1', 'x2']]);
    assert.ok(laid.refs.laid[0].kg > 0.3 && !laid.refs.loose.includes('lid'), JSON.stringify(laid.refs));
    // laid along x1, half its weight on x1: x1's middle sags more than with the same rails bare. A sag this small is
    // given to three figures (it read 0.001 to three places, one figure)
    const without = (write({ ...box, joins: joins.filter((j) => !/^y[12]\./.test(j.a)) }), probe());
    assert.ok(sagOf(r) > sagOf(without) * 1.05, `x1 under half the lid ${sagOf(r)} mm, bare ${sagOf(without)} mm`);
    assert.ok(sagOf(without) < 0.1 && String(sagOf(without)).replace(/^0\.0*/, '').length >= 3, `three figures: ${sagOf(without)}`);
  } finally { done(); }
});

test('frame checks: a gantry beam\'s weight is shared between the two side beams it lies on; what rides a beam left out is named as not weighed; frame.limit holds every sag; the Euler check says what it rests on', async () => {
  const { ws, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/frame', f), file = at('assemblies/g.json');
    fs.mkdirSync(at('assemblies'), { recursive: true });
    fs.writeFileSync(at('project.json'), JSON.stringify({ name: 'frame', material: 'PLA', objects: [] }));
    const write = (x) => fs.writeFileSync(file, JSON.stringify(x));
    const probe = () => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
      const { buildAssembly, checkAssembly } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/assembly.mjs')).href)});
      const s = await buildAssembly('frame/g');
      console.log(JSON.stringify(checkAssembly(s).filter((f) => /^frame\\.(solve|deflection)$/.test(f.code)).map(({ level, code, text, values, refs }) => ({ level, code, text, values, refs }))));
    `], { cwd: ws, encoding: 'utf8', env: { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') } }));
    // 1. a generated gantry: g (340 mm) lies across the top side beams y3 and y4, its joint on y3 10 mm from g's end a
    // and y4's axis 330 mm along it. By the lever rule g's weight at its middle (170 mm) goes (330 − 170) / 320 = 50%
    // to each; with its joint's beam carrying it all, y4 under g sagged by its own weight alone
    write({ title: 'Gantry', kind: 'fit', frame: { kind: 'gantry', inside: [300, 400, 200], profile: '2020-misumi-hfs5', join: 'blind', points: ['y3.top@50%', 'y4.top@50%'] } });
    let r = probe();
    const solve = r.find((x) => x.code === 'frame.solve'), g = solve.refs.riding.find((x) => x.id === 'g');
    assert.match(solve.text, /g rides on gantry, its [\d.]+ kg weighed on the frame, shared as it lies: 50% on y3, 50% on y4/);
    assert.deepEqual(g.on.map((x) => [x.beam, +x.share.toFixed(3)]), [['y3', 0.5], ['y4', 0.5]]);
    const sag = (w) => r.find((x) => x.code === 'frame.deflection' && x.refs.where === w).values.rigid;
    assert.ok(Math.abs(sag('y4.top@50%') / sag('y3.top@50%') - 1) < 0.1, `the two side beams sag alike: y3 ${sag('y3.top@50%')}, y4 ${sag('y4.top@50%')} mm`);
    // 2. a beam g riding a slide on y5, which no join holds to the frame: y5 is left out, and g and the load on y5 with it,
    // each named as not weighed
    const P = { profile: '2020-misumi-hfs5' };
    const portal = { title: 'Off', kind: 'fit', items: [{ id: 'z1', beam: P, from: [0, 0, 0], to: [0, 0, 400] }, { id: 'z2', beam: P, from: [620, 0, 0], to: [620, 0, 400] }, { id: 'x1', beam: P, from: [10, 0, 390], to: [610, 0, 390] }, { id: 'y5', beam: P, from: [0, 300, 500], to: [600, 300, 500] }, { id: 'g', beam: { ...P, length: 300 } }],
      joints: [{ id: 'slide', type: 'prismatic', parent: { item: 'y5', at: [0, 10, 100], axis: [0, 0, 1] }, child: { item: 'g', at: [0, 0, 150], axis: [0, 0, 1] }, min: 0, max: 200 }],
      joins: [{ kind: 'blind', a: 'x1.a', b: 'z1.back@390' }, { kind: 'blind', a: 'x1.b', b: 'z2.front@390' }], loads: [{ mass: 2, at: 'y5.top@50%' }, { mass: 1, at: 'x1.top@50%' }], frame: { supports: { 'z1.a': 'fixed', 'z2.a': 'fixed' }, limit: 0.05 } };
    write(portal);
    r = probe();
    const off = r.find((x) => x.code === 'frame.solve');
    assert.match(off.text, /Not weighed on the frame, as the beam carrying it is left out: g \(on y5\), load 1 at y5\.top@50% \(on y5\)/);
    assert.deepEqual(off.refs.off.map((x) => x.id), ['g', 'load 1 at y5.top@50%']);
    // 3. frame.limit holds the sag at a load's point too, not a named point's alone
    const load = r.find((x) => x.code === 'frame.deflection' && x.refs.where === 'x1.top@50%');
    assert.equal(load.values.limit, 0.05);
    assert.equal(load.refs.limit, 'the assembly\'s frame.limit');
    const { schema } = await import('../lib/schema.mjs');
    const limitSays = JSON.stringify(schema('assembly')).match(/"limit":\{"\$ref":"#\/\$defs\/expr","description":"([^"]*)"/)?.[1] ?? '';
    assert.match(limitSays, /every frame\.deflection finding/);
    // 4. the Euler check's rule says it rests on ends held from moving sideways, and where a sway frame's posts are checked
    const { FRAME_CHECK } = await import('../lib/framecheck.mjs');
    assert.match(FRAME_CHECK.euler.rule, /held from moving sideways/);
    assert.match(FRAME_CHECK.euler.rule, /free to sway .* whole frame's own buckling factor/);
  } finally { done(); }
});

test('frame checks: an open cube racks with a low stiffness and one brace stiffens it many times, gussets and a panel solved beside it; a gantry beam\'s frequency with its carriage at mid-span agrees with the formula for a loaded beam; the mode drawn', () => {
  const { ws, cad, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/frame', f);
    fs.mkdirSync(at('assemblies'), { recursive: true });
    fs.writeFileSync(at('project.json'), JSON.stringify({ name: 'frame', material: 'PLA', objects: [] }));
    const P = '2020-misumi-hfs5', beam = (id, from, to) => ({ id, beam: { profile: P }, from, to });
    const write = (name, x) => fs.writeFileSync(at(`assemblies/${name}.json`), JSON.stringify(x));
    const probe = (name) => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
      const { buildAssembly, checkAssembly } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/assembly.mjs')).href)});
      const s = await buildAssembly('frame/${name}');
      console.log(JSON.stringify(checkAssembly(s).filter((f) => /^frame\\.(solve|rack|frequency|buckling)$/.test(f.code)).map(({ level, code, text, values, refs }) => ({ level, code, text, values, refs }))));
    `], { cwd: ws, encoding: 'utf8', env: { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') } }));
    let r;
    const by = (code) => r.filter((x) => x.code === code), rack = (dir) => by('frame.rack').find((x) => x.refs.direction === dir);

    // 1. an open cube: four 2020 legs 400 mm tall, a ring of four beams joined blind to them 390 mm up and another 10 mm
    // up, the lowest ends pinned. Four upright bays, two each way, none braced.
    const ring = (n, h) => [beam(`x${n}`, [10, 0, h], [410, 0, h]), beam(`x${n + 1}`, [10, 420, h], [410, 420, h]), beam(`y${n}`, [0, 10, h], [0, 410, h]), beam(`y${n + 1}`, [420, 10, h], [420, 410, h])];
    const joins = (n, h) => [[`x${n}.a`, 'z1.back'], [`x${n}.b`, 'z2.front'], [`x${n + 1}.a`, 'z3.back'], [`x${n + 1}.b`, 'z4.front'], [`y${n}.a`, 'z1.top'], [`y${n}.b`, 'z3.bottom'], [`y${n + 1}.a`, 'z2.top'], [`y${n + 1}.b`, 'z4.bottom']].map(([a, b]) => ({ kind: 'blind', a, b: `${b}@${h}` }));
    const cube = { title: 'Cube', kind: 'fit', items: [beam('z1', [0, 0, 0], [0, 0, 400]), beam('z2', [420, 0, 0], [420, 0, 400]), beam('z3', [0, 420, 0], [0, 420, 400]), beam('z4', [420, 420, 0], [420, 420, 400]), ...ring(1, 390), ...ring(3, 10)],
      joins: [...joins(1, 390), ...joins(3, 10)] };
    write('cube', cube);
    r = probe('cube');
    // the default push, 20 N (an estimate) shared among the four top corners: the cube sways within its height over 400,
    // but its stiffness is low: the open bays hold the push by the blind joins' bending alone (16 estimated springs). The
    // rigid joins bound it from the stiff side. A brace in each of the two bays that way makes it many times stiffer.
    const x = rack('along x'), open = x.values.stiffness;
    assert.equal(x.level, 'pass');
    assert.match(x.text, /^racked along x: 20 N pushed at the top \(frame\.push, an estimate\) sways it 0\.\d+ mm with the joins' springs, \d+(\.\d)? N\/mm \(low: its open bays hold the push by their joins' bending alone\); 0\.\d+ mm, \d+ N\/mm, with the joins rigid\. It rests on 16 joins' springs \(16 blind: an estimate\): against 0\.975 mm, its height, 390 mm, over 400 \(frame\.sway\)/);
    assert.ok(open > 20 && open < 150 && x.values.rigidStiffness > open * 2, JSON.stringify(x.values));
    const option = (kind, every) => x.values.options.find((o) => o.kind === kind && o.every === every);
    // one brace: the gain, said and solved; every bay that way braced: the cube is a truss that way, far stiffer still
    assert.ok(option('brace', false).gain > 2, JSON.stringify(option('brace', false)));
    assert.match(x.text, new RegExp(`one diagonal brace in [xyz\\d-]+ makes it [\\d.]+ N/mm \\(${option('brace', false).gain.toFixed(1).replace('.', '\\.')} times\\)`));
    assert.ok(option('brace', true).gain > 50, JSON.stringify(option('brace', true)));
    // gussets and a panel, each solved: both stiffen it, gussets least (they stiffen the corners, not the bay's shear)
    assert.ok(option('gusset', false).gain > 1.1 && option('gusset', false).gain < option('brace', false).gain, JSON.stringify(x.values.options));
    assert.ok(option('panel', true).gain > option('gusset', true).gain, JSON.stringify(x.values.options));
    assert.equal(rack('along y').values.stiffness, open, 'the cube is the same both ways');
    // within its limit, it advises nothing: the options are solved and said, but no change is named in refs
    assert.match(x.text, /It stands within the limit as it is$/);
    assert.equal(x.refs.advise, null);

    // a heavier push, 100 N: over the limit, and the cheapest change that brings it under is advised by name. The
    // sway is linear in the push, so it is 5 times the 20 N figure (each rounded to 3 places) and the stiffness the same
    write('cube', { ...cube, frame: { rack: { load: 100 } } });
    r = probe('cube');
    const heavy = rack('along x');
    assert.equal(heavy.level, 'warn');
    assert.ok(Math.abs(heavy.values.sway - 5 * x.values.sway) < 0.005 && Math.abs(heavy.values.stiffness - open) < 0.01, `${heavy.values.sway} against 5 × ${x.values.sway}`);
    const pick = heavy.values.options.filter((o) => !o.every).concat(heavy.values.options.filter((o) => o.every)).find((o) => o.sway <= heavy.values.limit);
    assert.deepEqual(heavy.refs.advise, { kind: pick.kind, bays: pick.bays });
    assert.match(heavy.text, /times over\. Solved with each change: .*The cheapest that brings it under the limit: /);
    // refused by name
    write('cube', { ...cube, frame: { rack: { push: 100 } } });
    r = probe('cube');
    assert.deepEqual(by('frame.solve').map((q) => q.text), ['frame: frame.rack has no "push": it takes load (N) and limit (mm)']);

    // a panel on the front bay is a shear web of the frame: frame.solve says so with its clips' grip an estimate, and
    // racking along x the frame is stiffer than open, and no longer offers that bay
    write('cube', { ...cube, items: [...cube.items, { id: 'front', panel: { sheet: 'acrylic', thickness: 3, bay: ['x1', 'z2', 'x3', 'z1'], out: [0, -1, 0] } }] });
    r = probe('cube');
    assert.match(by('frame.solve')[0].text, /front is a shear web on its bay, \d+ N\/mm along its diagonal \(\d+ clips, their grip an estimate\)/);
    const paneled = rack('along x');
    assert.ok(paneled.values.stiffness > open * 1.5, `${paneled.values.stiffness} against ${open} N/mm`);
    assert.ok(paneled.values.options.every((o) => !o.bays.some((b) => ['x1', 'z1', 'z2', 'x3'].every((id) => b.split('-').includes(id)))), JSON.stringify(paneled.values.options));
    assert.equal(paneled.refs.panels[0].rests[0].kind, 'spec');
    // the web is split into pieces for the modes and the whole-frame buckling (subdivide), and still holds: one end a
    // ball, the other pinned, so nothing inside it spins free. The modes, the buckling factor and the mode view are found
    const pf = by('frame.frequency')[0], pb = by('frame.buckling').find((q) => /whole frame/.test(q.text));
    assert.match(pf.text, /^the lowest mode is \d+(\.\d)? Hz/);
    assert.ok(pf.values.Hz > 5 && pf.values.carried > 0.5, JSON.stringify(pf.values));
    assert.ok(pb && pb.values.factor > 1, JSON.stringify(by('frame.buckling')));
    assert.match(cad('beams', 'frame/cube'), /the frame's lowest mode, \d+(\.\d+)? Hz, animated \(a check view\): exports[\\/]frame[\\/]cube\.frame-mode\.svg/);

    // 2. a gantry beam: 2020, 600 mm, held fixed at both ends, with a carriage at mid-span (a 608 bearing standing in for
    // it, 2 kg carried on it), on a slide 200 mm either way. The lowest mode is with it at mid-span (as drawn).
    // The hand calculation: a beam fixed at both ends with a mass M at its middle, by Rayleigh's method with the static
    // shape (Blevins, Formulas for Natural Frequency and Mode Shape, 1979, table 8-8: M + 0.375 m of the beam's own m):
    //   k = 192 E I / L³ = 192 × 69972 × 7420 / 600³ = 461.50 N/mm (2020 HFS5, I = 7420 mm⁴; A6N01, E = 69972 MPa)
    //   f = (1 / 2π) √(1000 k / (M + 0.375 m)), with M ≈ 2.01 kg (2 kg and the bearing) and m ≈ 0.3 kg (0.5 kg/m):
    //   √(461500 / 2.1225) / 2π = 74.2 Hz. The test takes M and m as the finding says them.
    const gantry = { title: 'Gantry', kind: 'fit', items: [beam('x1', [0, 0, 300], [600, 0, 300]), { id: 'cart', bought: 'bearing-608' }],
      joints: [{ id: 'slide', type: 'prismatic', parent: { item: 'x1', at: [0, 10, 300], axis: [0, 0, 1] }, child: { item: 'cart', at: [0, 0, 0], axis: [0, 0, 1] }, min: -200, max: 200 }],
      loads: [{ mass: 2, at: 'cart.bore' }], frame: { supports: { 'x1.a': 'fixed', 'x1.b': 'fixed' } } };
    write('gantry', gantry);
    r = probe('gantry');
    const fq = by('frame.frequency')[0], v = fq.values, hand = Math.sqrt((1000 * 192 * 69972 * 7420) / 600 ** 3 / (v.carried + 0.375 * v.beams)) / (2 * Math.PI);
    assert.ok(v.carried > 2 && v.carried < 2.1 && v.beams > 0.25 && v.beams < 0.35, JSON.stringify(v));
    assert.ok(Math.abs(v.Hz - hand) / hand < 0.01, `solved ${v.Hz} Hz against the formula's ${hand}`);
    assert.equal(fq.refs.pose, 'as drawn');
    assert.equal(fq.level, 'info');
    assert.match(fq.text, /^the lowest mode is 7\d\.\d Hz, worst as drawn, x1 moving most\. Its next: .* Nothing named excites it/);
    // with the carriage at the end of its travel, 100 mm from a support, the beam rings higher
    write('gantry', { ...gantry, joints: [{ ...gantry.joints[0], min: -200, max: -200 }] });
    r = probe('gantry');
    assert.ok(by('frame.frequency')[0].values.Hz > v.Hz * 1.5, JSON.stringify(by('frame.frequency')[0].values));

    // 3. what the machine excites, read as the task and the drives give it (set on the built assembly here, as a task
    // needs a whole machine): a task's moves ramping to 100 mm/s, and a stepper's full-step rate at its working speed.
    // A ramp of 50 ms (20 Hz) passes at 3.7 times; one of 20 ms (50 Hz) warns, under twice; one of 10 ms (100 Hz,
    // over the mode itself) fails, each saying how much stiffer the beam must be. A NEMA 17 (1.8°, 200 full steps a
    // turn) at 22.3 rpm steps at 22.3 / 60 × 200 = 74.3 Hz, on the mode: it warns that the frame rings at that speed
    write('gantry', gantry);
    const excite = (task, drives) => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
      const { buildAssembly } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/assembly.mjs')).href)});
      const { frameChecks } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/framecheck.mjs')).href)});
      const { placeItems, jointValues, mul } = await import('@rulecad/model-link');
      const s = await buildAssembly('frame/gantry'), out = [];
      s.task = ${JSON.stringify(task)}; s.motion.drives = ${JSON.stringify(drives)};
      frameChecks(s, (level, text, card, extra) => out.push({ level, text, ...extra }), { placeItems, jointValues, mul });
      console.log(JSON.stringify(out.filter((x) => x.code === 'frame.frequency')));
    `], { cwd: ws, encoding: 'utf8', env: { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') } }))[0];
    assert.deepEqual(['pass', 'warn', 'fail'].map((_, i) => excite({ speed: 100, accel: [2000, 5000, 10000][i] }, []).level), ['pass', 'warn', 'fail']);
    const slow = excite({ speed: 100, accel: 2000 }, []), fast = excite({ speed: 100, accel: 10000 }, []);
    assert.match(slow.text, /The machine excites: the task's moves, ramping to 100 mm\/s in 0\.05 s, 20 Hz\. 3\.7 times over the moves' 20 Hz, where 2 is wanted$/);
    assert.match(fast.text, /under 2 times the moves' 100 Hz\. To lift it to 200 Hz takes about 7\.\d+ times the stiffness where x1 moves/);
    const stepped = excite(null, [{ id: 'm', model: { name: 'nema17', stepAngle: 1.8 }, spec: { speed: 22.3 } }]);
    assert.equal(stepped.level, 'warn');
    assert.match(stepped.text, /m's full steps at 22\.3 rpm, 74\.3 Hz\. A mode within 20% of m's full steps at 22\.3 rpm \(the mode at 7\d\.\d Hz\): it rings while the motor runs at that speed/);
    assert.equal(stepped.refs.excites[0].from, 'the motor item\'s speed');
    assert.match(cad('beams', 'frame/gantry'), /the frame's lowest mode, 7\d\.?\d* Hz, animated \(a check view\): exports[\\/]frame[\\/]gantry\.frame-mode\.svg/);
    const svg = fs.readFileSync(path.join(ws, 'exports/frame/gantry.frame-mode.svg'), 'utf8');
    assert.match(svg, /<animate attributeName="points"/);
    assert.match(svg, /lowest mode 7\d\.\d Hz, as drawn, x1 moving most/);
  } finally { done(); }
});

test('frame checks: a force on a slide and a torque on a hinge are carried into the beam the joint is mounted on, each way, as hand formulas say; a frame stood on guessed lowest ends warns, and empty supports are refused by name', () => {
  const { ws, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/frame', f), file = at('assemblies/arm.json');
    fs.mkdirSync(at('assemblies'), { recursive: true });
    fs.writeFileSync(at('project.json'), JSON.stringify({ name: 'frame', material: 'PLA', objects: [] }));
    const write = (x) => fs.writeFileSync(file, JSON.stringify(x));
    const probe = () => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
      const { buildAssembly, checkAssembly } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/assembly.mjs')).href)});
      const s = await buildAssembly('frame/arm');
      console.log(JSON.stringify(checkAssembly(s).filter((f) => /^frame\\.(solve|deflection)$/.test(f.code)).map(({ level, code, text, values, refs }) => ({ level, code, text, values, refs }))));
    `], { cwd: ws, encoding: 'utf8', env: { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') } }));
    // A 600 mm 2020 beam x1 held fixed at its end a, level, its end b free. At b, on x1's top: a press, a slide
    // straight up and down (its axis x1's top, world z) carrying a 100 mm 2020 stub p, and a hinge turning about x1's
    // side (world y) carrying a stub h lying along that axis, so neither stub's weight moves as its joint does.
    const P = '2020-misumi-hfs5', base = { title: 'Arm', kind: 'fit',
      items: [{ id: 'x1', beam: { profile: P }, from: [0, 0, 300], to: [600, 0, 300] }, { id: 'p', beam: { profile: P, length: 100 } }, { id: 'h', beam: { profile: P, length: 100 } }],
      joints: [{ id: 'press', type: 'prismatic', parent: { item: 'x1', at: [0, 10, 600], axis: [0, 1, 0] }, child: { item: 'p', at: [0, 0, 0], axis: [0, 0, 1] }, min: 0, max: 40 },
        { id: 'hinge', type: 'revolute', parent: { item: 'x1', at: [0, 10, 600], axis: [1, 0, 0] }, child: { item: 'h', at: [0, 0, 50], axis: [0, 0, 1] }, min: 0, max: 90 }],
      frame: { supports: { 'x1.a': 'fixed' }, points: ['x1.top@600'] } };
    const tip = (loads) => { write({ ...base, loads }); const r = probe(); return { r, solve: r.find((x) => x.code === 'frame.solve'), sag: r.find((x) => x.code === 'frame.deflection' && x.refs.where === 'x1.top@600') }; };
    // Hand, a cantilever L = 600 mm, E = 69972 MPa, I = 7420 mm^4 (2020 HFS5's figures), so E I = 5.192e8 N mm^2:
    //   100 N along the slide at the tip:   F L^3 / 3 E I = 100 x 600^3 / (3 x 5.192e8) = 13.868 mm
    //   10 N m about the hinge at the tip:  T L^2 / 2 E I = 10 000 x 600^2 / (2 x 5.192e8) = 3.467 mm
    // Each is solved one way and then the other, and the worse (down, with the weight) is the figure: the sag with the
    // load less the sag without it is the load's own share. A torque on a hinge about the beam's own axis would twist
    // it and move no node on its axis, so the hinge turns about the side.
    const EI = 69972 * 7420, none = tip([]), force = tip([{ joint: 'press', force: 100 }]), torque = tip([{ joint: 'hinge', torque: 10 }]);
    assert.doesNotMatch(none.solve.text, /carried into/);
    assert.ok(Math.abs((force.sag.values.sag - none.sag.values.sag) / ((100 * 600 ** 3) / (3 * EI)) - 1) < 0.01, `force: ${force.sag.values.sag} less ${none.sag.values.sag} mm against ${(100 * 600 ** 3) / (3 * EI)}`);
    assert.ok(Math.abs((torque.sag.values.sag - none.sag.values.sag) / ((10000 * 600 ** 2) / (2 * EI)) - 1) < 0.01, `torque: ${torque.sag.values.sag} less ${none.sag.values.sag} mm against ${(10000 * 600 ** 2) / (2 * EI)}`);
    // Each joint is swept in quarters (frame.sweep): as drawn, then the press at 0 and 40 and the three steps between,
    // and the hinge at 0 and 90 and the three between: 11 poses; then the two together (frame.together), every
    // combination of their 5 places, 25, of which 9 are among those (the press at 0 with each hinge place, and the
    // hinge at 0 with each press place): 27 poses, each one way and the other
    assert.match(force.solve.text, /with 100 N on press carried into x1 through its joint, one way and then the other, in 27 poses \(press, hinge each swept and then together: every combination of their 5 places each\) \(54 cases\)/);
    assert.match(torque.solve.text, /with 10 N m on hinge carried into x1 through its joint, one way and then the other/);
    assert.deepEqual(force.solve.refs.onJoints, [{ joint: 'press', value: 100, unit: 'N', beam: 'x1', note: null }]);
    assert.match(force.sag.refs.pose, /joint loads -$/);
    // 2. A frame stood on its lowest ends, guessed and left pinned (four legs and a ring of rails, which pinned feet
    // hold), warns that nothing says where it stands; given supports, nothing of the guess is said
    const leg = (id, x, y) => ({ id, beam: { profile: P }, from: [x, y, 0], to: [x, y, 400] }), rail = (id, from, to) => ({ id, beam: { profile: P }, from, to });
    const table = { title: 'Table', kind: 'fit', items: [leg('z1', 0, 0), leg('z2', 620, 0), leg('z3', 0, 320), leg('z4', 620, 320), rail('x1', [10, 0, 390], [610, 0, 390]), rail('x2', [10, 320, 390], [610, 320, 390]), rail('y1', [0, 10, 390], [0, 310, 390]), rail('y2', [620, 10, 390], [620, 310, 390])],
      joins: [['x1.a', 'z1.back'], ['x1.b', 'z2.front'], ['x2.a', 'z3.back'], ['x2.b', 'z4.front'], ['y1.a', 'z1.top'], ['y1.b', 'z3.bottom'], ['y2.a', 'z2.top'], ['y2.b', 'z4.bottom']].map(([a, b]) => ({ kind: 'blind', a, b: `${b}@390` })) };
    write(table);
    let s = probe().find((x) => x.code === 'frame.solve');
    assert.equal(s.level, 'warn', s.text);
    assert.match(s.text, /Its supports are guessed: nothing says where it is held \(no feet, no "frame": \{ "supports" \}\), so it stands on its lowest ends, z1\.a, z2\.a, z3\.a and z4\.a, pinned, as feet stand on a floor, and every figure rests on that/);
    assert.deepEqual(s.refs.guessed, ['z1.a', 'z2.a', 'z3.a', 'z4.a']);
    write({ ...table, frame: { supports: { 'z1.a': 'pinned', 'z2.a': 'pinned', 'z3.a': 'pinned', 'z4.a': 'pinned' } } });
    s = probe().find((x) => x.code === 'frame.solve');
    assert.equal(s.level, 'info', s.text);
    assert.ok(s.refs.guessed == null && !/guessed/.test(s.text));
    // 3. "supports": {} names nowhere the frame is held: refused by name, not stood on nothing
    write({ ...table, frame: { supports: {} } });
    s = probe().find((x) => x.code === 'frame.solve');
    assert.equal(s.level, 'fail');
    assert.match(s.text, /frame\.supports names no support: give at least one place the frame is held, as \{ "z1\.a": "pinned" \}, or leave supports out/);
  } finally { done(); }
});

test('frame checks (#302): joints mounted on the frame are swept together; a motor stalled against a hard stop pushes the stop and its own mount apart, and a motor turning a hinge holds its torque at its mount, each as hand formulas say', () => {
  const { ws, done } = workspace();
  try {
    const at = (f) => path.join(ws, 'projects/frame', f);
    fs.mkdirSync(at('assemblies'), { recursive: true });
    fs.writeFileSync(at('project.json'), JSON.stringify({ name: 'frame', material: 'PLA', objects: [] }));
    const probe = (name, a) => {
      fs.writeFileSync(at(`assemblies/${name}.json`), JSON.stringify(a));
      return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
        const { buildAssembly, checkAssembly } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib/assembly.mjs')).href)});
        const s = await buildAssembly('frame/${name}');
        console.log(JSON.stringify(checkAssembly(s).filter((f) => /^frame\\.(solve|deflection)$/.test(f.code)).map(({ level, code, text, values, refs }) => ({ level, code, text, values, refs }))));
      `], { cwd: ws, encoding: 'utf8', env: { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') } }));
    };
    const P = '2020-misumi-hfs5', EI = 69972 * 7420, G = 9.80665, sagAt = (r, where) => r.find((x) => x.code === 'frame.deflection' && x.refs.where === where);
    // 1. Swept together. A 600 mm 2020 held fixed at both ends, two slides along it, each from 0 to 580 mm, each a
    // 20 mm stub carrying 2 kg, both drawn at 0 (over the support). One at a time, the other stays at 0; together, both
    // stand at the middle at once. Fixed-fixed with P at the middle, the sag there is P L^3 / 192 E I (Roark, table 8.1,
    // case 1d), so the two together sag 2 x 19.613 x 600^3 / (192 x 5.192e8) = 0.0850 mm, twice what one alone does
    const slide = (id) => ({ id, type: 'prismatic', parent: { item: 'x1', at: [0, 10, 0], axis: [0, 0, 1] }, child: { item: id, at: [0, 0, 0], axis: [0, 0, 1] }, min: 0, max: 580 });
    const two = (loads) => ({ title: 'Two', kind: 'fit', items: [{ id: 'x1', beam: { profile: P }, from: [0, 0, 300], to: [600, 0, 300] }, { id: 'c1', beam: { profile: P, length: 20 } }, { id: 'c2', beam: { profile: P, length: 20 } }],
      joints: [slide('c1'), slide('c2')], loads, frame: { supports: { 'x1.a': 'fixed', 'x1.b': 'fixed' }, points: ['x1.top@300'] } });
    const loaded = probe('two', two([{ mass: 2, at: { item: 'c1', at: [0, 0, 10] } }, { mass: 2, at: { item: 'c2', at: [0, 0, 10] } }])), bare = probe('bare', two([]));
    const mid = sagAt(loaded, 'x1.top@300'), share = mid.values.sag - sagAt(bare, 'x1.top@300').values.sag, hand = (2 * 2 * G * 600 ** 3) / (192 * EI);
    assert.match(mid.refs.pose, /^c1 at 290, c2 at 290$/, 'the worst pose has both carriages at the middle (their stubs\' 2 kg at 290 + 10 = 300 mm)');
    assert.ok(Math.abs(share / hand - 1) < 0.01, `both at the middle: ${share} against ${hand}`);
    assert.match(loaded.find((x) => x.code === 'frame.solve').text, /in 27 poses \(c1, c2 each swept and then together: every combination of their 5 places each\)/);
    // 2. A stall against a hard stop. A 600 mm 2020 fixed at its end a, a press at its end b sliding square to it (world
    // z), driven through an 8 mm lead screw (8 mm across, friction 0.2) by a NEMA 17 mounted on the beam at 300 mm.
    // Its holding torque, 0.59 N m, through the screw's efficiency, tan(l) / tan(l + f) with l = atan(8 / (pi x 8)) =
    // 17.657 deg and f = atan(0.2) = 11.310 deg: 0.31831 / 0.55375 = 0.5748, pushes 2 pi x 590 x 0.5748 / 8 = 266.4 N at
    // the stop. The stop takes it at the tip, the motor's mount 300 mm in takes it back along the same line, so only the
    // outer 300 mm bends: the tip moves F a^3 / 3 E I = 266.4 x 300^3 / (3 x 5.192e8) = 4.619 mm. A motor on the bench
    // (drives nothing) weighs the same, so the difference is the stall's own share
    const arm = (m) => ({ title: 'Arm', kind: 'fit', items: [{ id: 'x1', beam: { profile: P }, from: [0, 0, 300], to: [600, 0, 300] }, { id: 'p', beam: { profile: P, length: 100 } }, { id: 'm1', motor: m, at: 'x1.top@300' }],
      joints: [{ id: 'press', type: 'prismatic', parent: { item: 'x1', at: [0, 10, 600], axis: [0, 1, 0] }, child: { item: 'p', at: [0, 0, 0], axis: [0, 0, 1] }, min: 0, max: 40 }], frame: { supports: { 'x1.a': 'fixed' }, points: ['x1.top@600'] } });
    const stalled = probe('stall', arm({ model: 'nema17', drives: 'press', leadscrew: { lead: 8, diameter: 8, friction: 0.2 } })), bench = probe('bench', arm({ model: 'nema17' }));
    const eta = Math.tan(Math.atan(8 / (Math.PI * 8))) / Math.tan(Math.atan(8 / (Math.PI * 8)) + Math.atan(0.2)), F = (2 * Math.PI * 590 * eta) / 8;
    const solve = stalled.find((x) => x.code === 'frame.solve'), st = solve.refs.stalls;
    assert.deepEqual(st.map((x) => [x.joint, x.motor, x.end, x.unit, x.hold, x.stop, x.mount]), [['press', 'm1', 0, 'N', 0.59, 'x1', 'x1'], ['press', 'm1', 40, 'N', 0.59, 'x1', 'x1']]);
    assert.ok(Math.abs(st[0].value / F - 1) < 0.001, `stall push ${st[0].value} against ${F}`);
    assert.match(solve.text, /m1 stalled against press's stop at each end of its travel \(266\.\d+ N from its 0\.59 N m holding torque, on the stop and back on its mount on x1\)/);
    const tip = sagAt(stalled, 'x1.top@600'), push = tip.values.sag - sagAt(bench, 'x1.top@600').values.sag;
    assert.match(tip.refs.pose, /m1 stalled against its stop$/);
    assert.ok(Math.abs(push / ((F * 300 ** 3) / (3 * EI)) - 1) < 0.01, `stall: ${push} against ${(F * 300 ** 3) / (3 * EI)}`);
    // 3. A motor turning a hinge at the tip, mounted there too: the arm's inertia pushes its most torque back through its
    // mount, so the tip takes that torque each way: T L^2 / 2 E I. Its stall at a stop on the same node cancels
    const hinge = (m) => ({ title: 'Hinge', kind: 'fit', items: [{ id: 'x1', beam: { profile: P }, from: [0, 0, 300], to: [600, 0, 300] }, { id: 'h', beam: { profile: P, length: 100 } }, { id: 'm2', motor: m, at: 'x1.top@600' }],
      joints: [{ id: 'hinge', type: 'revolute', parent: { item: 'x1', at: [0, 10, 600], axis: [1, 0, 0] }, child: { item: 'h', at: [0, 0, 50], axis: [0, 0, 1] }, min: 0, max: 90 }], frame: { supports: { 'x1.a': 'fixed' }, points: ['x1.top@600'] } });
    const turned = probe('turned', hinge({ model: 'nema17', drives: 'hinge' })), still = probe('still', hinge({ model: 'nema17' }));
    const r = turned.find((x) => x.code === 'frame.solve').refs.onJoints[0], T = r.value * 1000;
    assert.deepEqual([r.joint, r.unit, r.beam], ['hinge', 'N m', 'x1']); assert.match(r.note, /^m2's reaction, the most torque it turns hinge with$/);
    assert.ok(r.value > 0 && r.value <= 0.59, `its torque at its working speed, ${r.value} N m, is no more than its holding torque`);
    const turn = sagAt(turned, 'x1.top@600').values.sag - sagAt(still, 'x1.top@600').values.sag;
    assert.ok(Math.abs(turn / ((T * 600 ** 2) / (2 * EI)) - 1) < 0.01, `reaction: ${turn} against ${(T * 600 ** 2) / (2 * EI)}`);
  } finally { done(); }
});
