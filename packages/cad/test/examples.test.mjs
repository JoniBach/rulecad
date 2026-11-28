// cad's tests of the documents replayed: TUTORIAL.md and EXAMPLES.md run as written, and the docs agree with the schema. The shared helpers are in ./helpers.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { run, replay, CAD } from './helpers.mjs';

test('the tutorial: every file and command in TUTORIAL.md works as written, in a workspace npm create rulecad makes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tutorial-')), ws = path.join(root, 'my-designs');
  try {
    const { text, files, commands } = replay(fileURLToPath(new URL('./TUTORIAL.md', CAD)), ws);
    assert.ok(files >= 5 && commands >= 10, `${files} files, ${commands} commands`);
    assert.match(run(ws, ['check', 'home/hook-on-screw']).out, /The screw in its hole: closest gap 0\.\d+ mm/);
    // and the mistakes it lists are reported in the words it gives
    const js = path.join(ws, 'projects/home/objects/hook.js'), good = fs.readFileSync(js, 'utf8');
    for (const [from, to, said] of [['v.plate / 2 / 2', 'v.plate / 4', 'numbers in hook.js that should be variables: line 10: 4'], ['v.thick / 2', 'v.thik / 2', 'v.thik: the design has no variable "thik" (did you mean "thick"?)'], ['return v.ops', 'v.ops', 'main() returned no shape: return a JSCAD solid, or named parts']]) {
      fs.writeFileSync(js, good.replace(from, to));
      const out = run(ws, ['check', 'home/hook']).out;
      assert.ok(out.includes(said), `${to}: ${out}`);
      assert.ok(text.includes(said), `the tutorial's table says: ${said}`);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('the worked examples: every file and command in EXAMPLES.md works as written, parts to a mechanism', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'examples-')), ws = path.join(root, 'my-designs');
  const trustedBefore = process.env.CAD_TRUSTED;
  process.env.CAD_TRUSTED = path.join(root, '.trusted.json'); // (chapter 6's cad trust, for its board, goes in a list of the test's own, not the user's)
  try {
    const { files, commands } = replay(fileURLToPath(new URL('./EXAMPLES.md', CAD)), ws);
    assert.ok(files >= 14 && commands >= 16, `${files} files, ${commands} commands`);
    // What each example promises
    assert.ok(fs.existsSync(path.join(ws, 'exports/home/tag@0.1.0.3mf')), 'the tag exported with its parts');
    assert.match(run(ws, ['check', 'home/tag:long']).out, /88 × 28 × [\d.]+ mm/, 'the long variant: 80 mm with its brim');
    assert.match(run(ws, ['check', 'home/box']).out, /2 poses checked: shut, open/);
    const rules = JSON.parse(fs.readFileSync(path.join(ws, 'rules/basemodel.json'), 'utf8')).rules;
    assert.equal(rules.size_x?.kind, 'derived', 'the measured model became draft rules');
    assert.match(run(ws, ['check', 'home/arm']).out, /arm down: moves [\d.]+ mm under 10 N/);
    assert.match(run(ws, ['check', 'home/pad']).out, /matrix: 4 keys on 2 rows × 2 columns/);
    // the pad in its case (chapter 6): the board's own M2 holes followed into insert bosses from v.fixings, and the screws on the list
    const cased = run(ws, ['check', 'home/padcase']).out;
    assert.match(cased, /4 M2 cap screws: pad's hole measures 2\.4 mm, an M2 clearance hole/, cased);
    assert.match(cased, /ends in case, in a heat-set insert's hole: 3\.2 mm as drawn \(m2\.insert_hole/);
    assert.match(cased, /M2x4 cap chosen, the shortest sold that fits/);
    assert.match(run(ws, ['list', 'home/padcase']).out, /4 ×\s+M2x4 cap[\s\S]*4 ×\s+M2 insert/);
    assert.ok(fs.readdirSync(path.join(ws, '.preview/home')).some((f) => f.endsWith('flick-sequence.svg')), 'the mechanism animated');
    const slider = run(ws, ['check', 'home/slider']).out;
    assert.match(slider, /knob drives slide: 43\.98 mm of rack a turn/, 'the gears: travel a turn');
    assert.match(slider, /knob and slide: centre distance 7\.2 mm, as they need/);
    assert.match(run(ws, ['check', 'home/slider', '--sweep', '--steps', '12']).out, /sweep knob, -180 to 180° in 12 steps: nothing collides/);
    const winder = run(ws, ['check', 'home/winder']).out;
    assert.match(winder, /the carrier drives the sun and the planets \(the ring held\): 4 turns of the sun for each turn of the carrier, the same way/, 'the planetary: four turns a crank');
    assert.doesNotMatch(winder, /✗/, winder);
    assert.match(run(ws, ['check', 'home/winder', '--sweep', '--steps', '24']).out, /sweep crank, -180 to 180° in 24 steps: nothing collides/);
    const driven = run(ws, ['check', 'home/driven']).out;
    assert.match(driven, /drive: 28byj48, 30 g, drives pinion, 0\.0879° a step/, 'the motor');
    assert.match(driven, /drive into slide: [\d.]+ N there against 1 N needed .*rests on community figures/, 'the torque, and what it rests on');
    assert.match(driven, /slide holds with the power off/);
    assert.match(driven, /✓ drive on rail: under the motor's 30 g and [\d.]+ N m, the shaft's tip moves [\d.]+ mm/, 'the rail bent under its motor, by FE');
    assert.doesNotMatch(driven, /✗/, driven);
    assert.match(run(ws, ['check', 'home/driven', '--sweep', '--steps', '12']).out, /sweep pinion, -180 to 180° in 12 steps: nothing collides/);
    // The winder, driven: the sun on an N20, the spool on the carrier; enough torque, and an honest unknown when unpowered
    const wound = run(ws, ['check', 'home/winder-driven']).out;
    assert.match(wound, /the sun drives the carrier and the planets \(the ring held\): 0\.25 turns of the carrier for each turn of the sun/);
    assert.match(wound, /The motor's shaft in the sun: 6\.6 mm of the flat in the bore/);
    assert.match(wound, /drive into reel: 0\.45 N m there against 0\.2 N m needed .*2\.25 times over/, 'the 150:1 gearbox, scaled');
    assert.match(wound, /reel: there's no figure for what holds it with the power off/);
    assert.doesNotMatch(wound, /✗/, wound);
    // ...and drawn as the preview draws it: the motor's curve at the working point, the torque through the train
    const drawn = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
      import { buildAssembly } from ${JSON.stringify(pathToFileURL(fileURLToPath(new URL('./lib/assembly.mjs', CAD))).href)};
      import { motorWork, workCurve, trainSvg, workMarks } from ${JSON.stringify(pathToFileURL(fileURLToPath(new URL('./lib/motorsvg.mjs', CAD))).href)};
      import { driveSvg } from ${JSON.stringify(pathToFileURL(fileURLToPath(new URL('./lib/drive.mjs', CAD))).href)};
      const s = await buildAssembly('home/winder-driven'), [w] = motorWork(s);
      console.log(JSON.stringify({ joint: w.joint, margin: w.margin, curve: workCurve(w), train: trainSvg(w), marks: workMarks(s), drive: driveSvg(s) }));`], { cwd: ws, encoding: 'utf8', maxBuffer: 1 << 26 }));
    assert.equal(drawn.joint, 'reel'); assert.ok(Math.abs(drawn.margin - 2.25) < 0.01, String(drawn.margin));
    assert.match(drawn.curve, /n20, through 4:1/); assert.match(drawn.curve, /the load, 0\.2 N m/);
    assert.match(drawn.train, /drive's shaft/); assert.match(drawn.train, /planetary 4:1/); assert.match(drawn.train, /2\.25× the 0\.2/);
    assert.match(drawn.train, /no figure for what holds it/);
    // the check view's labels, at the motor's shaft and at the reel; the drive animated, cut through the gears
    assert.deepEqual(drawn.marks.map((m) => m.text), ['drive: 0.125 N m at the shaft', 'reel: 0.45 N m, 2.25× the load; unpowered unknown']);
    assert.ok(drawn.marks.every((m) => m.at.length === 3));
    assert.match(drawn.drive, /reel turns 90° while sun turns once \(4:1\)/);
    assert.match(drawn.drive, /at [\d.]+ mm: base, ring, sun, reel/);
    assert.ok((drawn.drive.match(/animateTransform/g) || []).length >= 10, 'the sun, the planets and the reel each turn and move');
    assert.ok(drawn.drive.length < 400000, `small: ${drawn.drive.length} bytes`);
    const shoulder = run(ws, ['check', 'home/shoulder']).out;
    assert.match(shoulder, /the second ring turns 0\.02632 of the sun's turn, the other way \(38:1/, 'the compound planetary');
    assert.match(shoulder, /motor into out: 7\.442 N m there against 0\.735 N m needed/, 'the worst of its range, from a mass on the output');
    assert.match(shoulder, /out holds with the power off: the gears/);
    assert.doesNotMatch(shoulder, /✗/, shoulder);
    // The leg (chapter 14): it stands and steps, nothing overlaps (the output ring's phase, a joint whose range leaves out 0), and the motors carry it
    const stand = JSON.parse(run(ws, ['check', 'leg/stand', '--json']).out).findings, of = (c) => stand.filter((x) => x.code === c);
    assert.equal(of('overlap')[0].level, 'pass', of('overlap')[0].text);
    assert.equal(of('gait.clearance')[0].level, 'pass'); assert.equal(of('gait.sweep')[0].level, 'pass');
    assert.ok(stand.some((x) => x.code === 'motor.torque' && /gait: knee needs/.test(x.text) && x.level === 'pass'), JSON.stringify(of('motor.torque')));
    // On the builder's parts, a 17HS4401 at each joint at 0.5 A on 12 V, by hand: 0.4 N m holding, moving 0.4 / √2 =
    // 0.2828 N m, flat to the 12 V corner 60 × 12 / (2 × 0.0042 H × 1.5 A × 200) = 285.7 rpm, so at 200 rpm the whole of
    // it; at 0.5 of 1.5 A, 0.0943 N m; through the compound planetary's 38:1 (4 × 57 / (63 / 57 × 57 − 57) = 4 × 57 / 6)
    // at its efficiency 0.95 / (1 + 0.0975 × ρ / (ρ − 1)), ρ = 54 × 21 / (18 × 57) = 1.1053, so 0.4694: 0.0943 × 38 ×
    // 0.4694 = 1.682 N m at the hip and at the knee alike. The load is what rides the rods, leg.riding 1.01 kg, over the
    // robot's 0.75 kg share; the statics are linear in it, so the knee's 0.451 N m at 0.75 kg (before, on a NEMA 14)
    // becomes 0.451 × 1.01 / 0.75 = 0.607 N m: 1.682 / 0.607 = 2.8 times. The hip's 0.147 becomes 0.198, 8.5 times
    const legTorque = (j) => of('motor.torque').find((x) => x.refs?.joint === j).values;
    assert.ok(Math.abs(legTorque('knee').available - (0.4 / Math.SQRT2) * (0.5 / 1.5) * 38 * 0.95 / (1 + 0.0975 * (1134 / 1026) / (1134 / 1026 - 1))) < 1e-3, JSON.stringify(legTorque('knee')));
    assert.ok(Math.abs(legTorque('knee').available - legTorque('hip').available) < 1e-9, 'the same motor at the same current at each joint');
    assert.ok(Math.abs(legTorque('knee').needed - 0.451 * 1.01 / 0.75) < 0.002, String(legTorque('knee').needed));
    assert.ok(Math.abs(legTorque('knee').margin - 2.77) < 0.02 && Math.abs(legTorque('hip').margin - 8.5) < 0.05, `${legTorque('knee').margin}, ${legTorque('hip').margin}`);
    assert.equal(of('power.supply')[0].level, 'pass'); assert.match(of('power.supply')[0].text, /psu \(supply-12v\): the machine draws [\d.]+ A at 12 V .* the supply gives 1\.5 A/);
    assert.match(of('gait.stable')[0].text, /one leg, on a stand/);
    assert.ok(fs.existsSync(path.join(ws, '.preview/leg/stand-gait.svg')), 'its step animated');
    // The bracket screwed on (chapter 15): each end found where v.fixings drew it, the lengths chosen, the shelf's load carried; a short screw and one the wall hides each fail by name
    const shelf = JSON.parse(run(ws, ['check', 'fix/shelf', '--json']).out).findings, at = (c) => shelf.filter((x) => x.code === c);
    assert.deepEqual(shelf.filter((x) => x.level === 'fail' || x.level === 'warn').map((x) => x.text), []);
    const ends = at('fasten.end').map((x) => x.text).join('\n');
    assert.match(ends, /screw 1 \(bracket\.pilot\): ends in plate, in a pilot .* 2\.9 mm as drawn \(x1c\.pilot_m3, measured\)/);
    assert.match(ends, /screw 2 \(bracket\.insert\): ends in plate, in a heat-set insert's hole: 4 mm as drawn/);
    assert.match(ends, /Back screws, 2 M3 countersunk screws: ends in an M3 hex nut in its seat in bracket, 5\.7 mm across the flats/, 'the nut in its slot, not on the far face');
    assert.deepEqual(at('fasten.length').map((x) => x.text.match(/(M3x\d+ \w+) chosen/)[1]), ['M3x10 cap', 'M3x8 cap', 'M3x16 countersunk']);
    assert.match(at('fasten.seat').map((x) => x.text).join('\n'), /countersunk head sits in a (89\.\d|90)° countersink in plate/);
    assert.deepEqual(at('fasten.load').filter((x) => x.values?.margin != null).map((x) => Math.round(x.values.margin)), [41, 33], 'the margins the chapter gives');
    assert.match(run(ws, ['list', 'fix/shelf']).out, /2 ×\s+M3x16 countersunk[\s\S]*2 ×\s+M3 hex nut[\s\S]*1 ×\s+M3 insert[\s\S]*5\.9 g\s+about \d+ min\s+plate\s+11\.8 g\s+about \d+ min\s+bracket/);
    const short = run(ws, ['check', 'fix/short']);
    assert.equal(short.code, 1); assert.match(short.out, /✗ Front screws, screw 1 \(bracket\.pilot\): M3x6 cap engages 2\.6 mm of thread in pla .* M3x10 cap would do/);
    assert.match(short.out, /✗ Front screws, screw 2 \(bracket\.insert\): M3x6 cap engages 2\.6 mm of thread in the insert.* M3x8 cap would do/);
    const first = run(ws, ['check', 'fix/wall-first']);
    assert.equal(first.code, 1); assert.match(first.out, /✗ Back screws, 2 M3 countersunk screws: a 2 mm hex key cannot reach the head: wall stands over it/);
    assert.match(first.out, /✗ the screw of "Back screws" can't be reached in any order: wall stands over it and goes on first/);
    // The frame (chapter 16): a box of one profile, every end joined or capped, its axis driven within its margins; the
    // cut list from one bar, a sheet per mark and the jigs; its printed fittings on one plate; 37 steps from bars to
    // square; a trapped nut and a plate drawn for another slot spacing each fail by name
    const box = JSON.parse(run(ws, ['check', 'frame/box', '--json']).out).findings, of16 = (c) => box.filter((x) => x.code === c);
    assert.deepEqual(box.filter((x) => x.level === 'fail' || x.level === 'warn').map((x) => x.text), []);
    assert.equal(of16('join.geometry').length, 16); assert.match(of16('join.end')[0].text, /every beam end is joined or capped \(24 ends\)/);
    assert.match(of16('guide.travel')[0].text, /slides 99\.5 mm/); assert.match(of16('guide.coupler')[0].text, /reaches 12\.5 mm into coupler-5-8/);
    assert.equal(+of16('motor.torque')[0].values.margin.toFixed(2), 6.36); assert.match(of16('motor.heat')[0].text, /at 1\.2 A, under PLA's 57 °C/);
    assert.ok(of16('fasten.length').some((x) => /^The board plate, 2 M4 button screws: M4x8 button chosen/.test(x.text)));
    assert.deepEqual([...new Set(of16('frame.nut').map((x) => x.level))], ['pass']); assert.equal(of16('frame.square').length, 4);
    const cut = run(ws, ['list', 'frame/box']).out;
    assert.match(cut, /profile-2020-misumi-hfs5: buy 1 × 4000 mm; kerf 3, trim 10; 1234 mm left over/);
    assert.match(cut, /12 ×\s+M5x12 button[\s\S]*18 ×\s+slot-nut-6-misumi-m4-drop-in/); assert.match(cut, /Total: 124 g printed/);
    // the chapter's fasteners as cad list gives them: the 18 nuts are 16 for the brackets, holders and motor plate and 2 for the board plate
    for (const [n, what] of [[4, 'M3x8 cap'], [4, 'M3x12 button'], [2, 'M4x8 button'], [16, 'M4x10 cap'], [12, 'M5x12 button'], [4, 'M5x16 cap']]) assert.match(cut, new RegExp(`\\n\\s+${n} ×\\s+${what.replace('.', '\\.')}\\s`), what);
    assert.equal((cut.match(/\n\s+18 ×\s+slot-nut-6-misumi-m4-drop-in.*/)[0].match(/The board plate/g) || []).length, 1);
    // what rests on estimates, as the chapter says: the heat scaled by the current squared, the lead nut's friction 0.15
    assert.match(of16('motor.heat')[0].text, /reaches at most [\d.]+ °C at 1\.2 A/);
    assert.ok(box.some((x) => /the nut's friction μ 0\.15 \(estimate\)/.test(x.text)), 'the lead nut\'s friction');
    // one count: cad check's assembly.order counts the build cad order prints
    assert.equal(of16('assembly.order')[0].values.steps, 37);
    for (const m of 'ABCDEFG') assert.ok(fs.existsSync(path.join(ws, `exports/frame/box.beam-${m}.svg`)), `the sheet for mark ${m}`);
    assert.ok(fs.existsSync(path.join(ws, 'exports/frame/box.jigs.3mf')), 'the jigs as one plate');
    const bed = JSON.parse(fs.readFileSync(path.join(ws, 'projects/frame/assemblies/box-base-1.json'), 'utf8'));
    assert.equal(bed.items.length, 17, 'every printed part on one plate'); assert.ok(!fs.existsSync(path.join(ws, 'projects/frame/assemblies/box-base-2.json')));
    assert.equal(run(ws, ['order', 'frame/box']).out.split('\n').filter((l) => /^\s+\d+\. /.test(l)).length, 37);
    const trapped = run(ws, ['check', 'frame/trapped']);
    assert.equal(trapped.code, 1); assert.match(trapped.out, /✗ The board plate: 2 slide-in nuts \(slot-nut-6-misumi-m4-slide-in\) go into x1's top slot at 105 and 155 mm, between .* which close it at both ends: .* give "nut": "drop-in"/);
    const shut = run(ws, ['order', 'frame/trapped']);
    assert.equal(shut.code, 1); assert.match(shut.out, /would be shut in between the blind join of x1\.a to p1\.back@30 and the blind join of x1\.b to p2\.front@30/);
    const wide = run(ws, ['check', 'frame/spacing']);
    assert.equal(wide.code, 1); assert.equal((wide.out.match(/✗ The board plate, screw [12] \(hole at -?15, 0, 1\.5\): plate's hole is 5 mm off the centre line of x1's top\.[12] slot/g) || []).length, 2, wide.out);
    // The case of printed beams (chapter 17): drawn in aluminium, every beam could be printed in PETG; printed (posts and
    // rails standing, the cross beam lying), it checks clean, its posts' ends an M3 captive nut each; the sag under the
    // board for both; a rail longer than the bed refused and spliced; a foot for the aluminium post refused by name; the kit
    const al = JSON.parse(run(ws, ['check', 'case/aluminium', '--json']).out).findings, pr = JSON.parse(run(ws, ['check', 'case/printed', '--json']).out).findings;
    for (const f of [al, pr]) assert.deepEqual(f.filter((x) => x.level === 'fail' || x.level === 'warn').map((x) => x.text), []);
    const each = al.filter((x) => x.code === 'beam.printable' && x.refs?.beam), all17 = al.find((x) => x.code === 'beam.printable' && x.refs?.printable && !x.refs.beam);
    assert.equal(each.length, 13); assert.ok(each.every((x) => x.level === 'pass' && x.refs.printable && x.values.margin > 50), JSON.stringify(each.map((x) => [x.refs.beam, x.values.margin])));
    assert.match(all17.text, /^every beam of the frame can be printed in PETG \(13\), printed together and solved once more: the least margin is [\d.]+ on sag as it creeps/);
    // the sag under the board, both ways. By hand, m1 alone (PETG lying, E 1810 MPa, I 7604.94 mm⁴ from the printed
    // section, 130 mm): held fixed at its ends, the board and its mount, (0.05 + 0.0271) kg x 9.80665 = 0.756 N at the
    // middle, and its own 33.8 g (w = 0.00255 N/mm): F L³ / (192 E I) + w L⁴ / (384 E I) = 0.00063 + 0.00014 = 0.00077 mm,
    // the least the frame's rigid figure can be (it adds x1 and x2 bending under m1's ends). Each printed beam is 38
    // (m1: 69972 x 7420 / (1810 x 7604.94)) to 48 times (standing: / (1540 x 7066.7)) as soft as its aluminium one, and
    // the printed brackets' springs are the same in both, so the printed sag is more than 10 and less than 48 times the
    // aluminium one
    const sag17 = (f) => f.find((x) => x.code === 'frame.deflection' && /^m1 at m1\.top@50%/.test(x.text)).values;
    const sAl = sag17(al), sPr = sag17(pr);
    assert.ok(sAl.sag > 0 && sAl.sag < 0.001, `aluminium ${sAl.sag} mm`); assert.ok(sPr.rigid >= 0.00077 && sPr.sag < sPr.limit, JSON.stringify(sPr));
    assert.ok(sPr.sag / sAl.sag > 10 && sPr.sag / sAl.sag < 48, `printed ${sPr.sag} mm against aluminium ${sAl.sag} mm`);
    assert.equal(sPr.limit, 0.361);
    const ofPr = (c) => pr.filter((x) => x.code === c);
    assert.equal(ofPr('beam.end').filter((x) => /end a takes M3 in a captive nut .* in its 4\.2 mm bore's place/.test(x.text)).length, 4);
    assert.equal(ofPr('fasten.end').filter((x) => /^Foot \d, .*ends in an M3 hex nut in its seat in p\d/.test(x.text)).length, 4);
    assert.ok(ofPr('frame.rack').length === 2 && ofPr('frame.rack').every((x) => x.level === 'pass'));
    assert.equal(ofPr('assembly.order')[0].values.steps, 47);
    assert.ok(ofPr('beam.printable').every((x) => x.level === 'pass') && ofPr('beam.printable').length === 13, 'every beam prints, standing or lying');
    // the gussets' screws into m1's printable slot: its lips slope 45° underneath, so the drop-in nut (10 mm wide, its
    // tongue 0.8) seats 2 + (10 - 6.1) / 2 = 3.95 mm down and its thread starts at 3.15; the gusset, MISUMI's slot under
    // its other arm, is 4.6 mm thick so M4x12 (its tip 12 - 4.6 = 7.4 mm in) has the 3.2 mm a hex nut asks, where
    // M4x10 through 4.4 mm reached 5.6 and had 2.45. Every screw into a nut has its thread
    const intoM1 = ofPr('fasten.length').filter((x) => /the gusset into m1/.test(x.text));
    assert.equal(intoM1.length, 2); assert.ok(intoM1.every((x) => /M4x12 cap chosen, the shortest sold that fits: 8\.55 mm under its head \(m1-x\d-gusset and the 3\.95 mm down to its nut's seat/.test(x.text)), intoM1.map((x) => x.text).join('\n'));
    assert.ok(ofPr('fasten.engagement').length > 40 && ofPr('fasten.engagement').every((x) => x.level === 'pass'));
    const spliced = JSON.parse(run(ws, ['check', 'case/spliced', '--json']).out).findings;
    assert.deepEqual(spliced.filter((x) => x.level === 'fail' || x.level === 'warn').map((x) => x.text), []);
    assert.deepEqual(spliced.filter((x) => x.code === 'fasten.engagement').map((x) => [x.level, x.values.engaged]), [['pass', 4.1], ['pass', 4.1]]);
    const longRail = run(ws, ['check', 'case/long']);
    assert.equal(longRail.code, 1); assert.match(longRail.out, /✗ r1: profile-2020-printed x 300, printed lying down: 300 mm long, and x1c's bed is 256 mm: splice it in two/);
    const foot17 = run(ws, ['check', 'case/foot']);
    assert.equal(foot17.code, 1); assert.match(foot17.out, /✗ Foot 1, an M5 cap screw: p1's end a is printed with an M3 captive nut in place of a tap, and the screw is M5: use an M3 screw/);
    // the kit: no bars, no sheets, one plate that prints clean
    const kit = path.join(ws, 'exports/case/printed-kit');
    assert.deepEqual(fs.readdirSync(kit).sort(), ['README.md', 'buy.csv', 'print']); assert.deepEqual(fs.readdirSync(path.join(kit, 'print')), ['printed-base-1.3mf']);
    const page = fs.readFileSync(path.join(kit, 'README.md'), 'utf8');
    const row = page.split('\n').find((l) => l.startsWith('| print/printed-base-1.3mf | PETG |'));
    assert.equal(row.split(' | ')[2].split(', ').length, 73, 'every printed part on the one plate'); assert.match(row, /\| [\d.]+ \| [\d.]+ \| clean \|$/);
    assert.match(page, /^\| 1 \| rpi4 \| board \|/m);
  } finally { if (trustedBefore === undefined) delete process.env.CAD_TRUSTED; else process.env.CAD_TRUSTED = trustedBefore; fs.rmSync(root, { recursive: true, force: true }); }
});

test('docs: the key a joint support takes to refine link.deflection is the one the finding names, in the schema, the worked examples and the changelog', () => {
  const read = (f) => fs.readFileSync(fileURLToPath(new URL(f, CAD)), 'utf8').replace(/\r\n/g, '\n');
  // the finding tells a person which key refines it; that key is the one the code reads
  const loads = read('./lib/loads.mjs'), key = loads.match(/a person can refine with "(\w+)" on the joint's support/)?.[1];
  assert.equal(key, 'linkCell'); assert.match(loads, new RegExp(`sup\\?\\.${key} != null`));
  const support = JSON.parse(read('./schemas/assembly.schema.json')).$defs.joint.properties.support.properties;
  assert.ok(support[key], `support.${key} is in the schema`); assert.match(support.cell.description, /clips/);
  // EXAMPLES.md: every place that tells a reader to refine link.deflection by finer cells names that key
  const advice = read('./EXAMPLES.md').split('\n').filter((l) => /link\.deflection/.test(l) && /finer cells/.test(l));
  assert.ok(advice.length >= 1, 'the upright arm chapter says how to refine link.deflection');
  for (const l of advice) { assert.match(l, new RegExp(`\`"${key}": [\\d.]+\` on the joint's \`support\``)); assert.doesNotMatch(l, /`"cell": [\d.]+` on the joint's `support`/); }
  // the changelog's section for the release that made the change (a later release's section may come above it) says
  // the support's "cell" stopped refining the link, and names the new key, in that one section
  const log = read('./CHANGELOG.md'), said = new RegExp(`"cell"\`? is its clips' alone\\*\\*[\\s\\S]*\`"${key}"\``);
  assert.ok(log.split('\n## ').slice(1).some((section) => said.test(section)), 'a release\'s section says "cell" is its clips\' alone and names the new key');
});
