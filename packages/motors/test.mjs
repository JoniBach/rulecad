import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import jscad from '@jscad/modeling';
import { motorModel, motor, mount, mountModel, bore, boreModel, performance, printable, motors, DEFAULTS } from '@rulecad/motors';

const { measureBoundingBox: bb, measureVolume: vol } = jscad.measurements;
const { intersect, subtract, union } = jscad.booleans;
const { translate, mirrorZ } = jscad.transforms;
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} against ${b} (±${tol})`);
const size = (g) => { const [a, b] = bb(g); return b.map((x, i) => x - a[i]); };

test('each motor is drawn to its datasheet: body, shaft, holes', () => {
  // [name, outer x, outer y, below the face, above the face]
  for (const [n, x, y, low, high] of [['nema17', 42.3, 42.3, 48, 24], ['nema14', 35.2, 35.2, 34, 24], ['28byj48', 42, 28, 19, 10], ['n20', 12, 10, 25, 10], ['sg90', 32.3, 12.2, 17, 16.6], ['mg90s', 32.5, 12, 21, 14.1], ['bldc2204', 27.85, 27.85, 0, 13.1]]) {
    const s = motor(motorModel(n)), [a, b] = bb(s);
    near(b[0] - a[0], x, 0.03, `${n} x`); near(b[1] - a[1], y, 0.03, `${n} y`); near(-a[2], low, 1e-6, `${n} below`); near(b[2], high, 1e-6, `${n} above`);
    assert.ok(vol(s) > 0, n);
  }
  // the 28BYJ-48's shaft is 8 mm from the can's centre, its ears on the can's centre line 35 mm apart
  const b = motorModel('28byj48');
  assert.deepEqual(b.body.centre, [0, -8]); assert.deepEqual(b.mount.holes, [[-17.5, -8], [17.5, -8]]);
  // NEMA 17: 31 mm square of M3, 4.5 deep; the flat
  const n = motorModel('nema17');
  assert.deepEqual(n.mount.holes[2], [15.5, 15.5]); assert.equal(n.mount.thread, 'M3'); assert.equal(n.mount.depth, 4.5); assert.equal(n.shaft.across, 4.5); assert.equal(n.shaft.flatLength, 15);
});

test('every figure says how far to trust it and where it comes from; a variant, a measured figure and another gearbox carry that through', () => {
  for (const n of motors()) for (const [k, f] of Object.entries(motorModel(n).figures)) { assert.ok(f.kind, `${n}.${k}`); assert.ok(f.source, `${n}.${k}`); }
  // a maker's part number finds its motor, with the figures that differ
  const s = motorModel('17HS4401');
  assert.equal(s.name, 'nema17'); assert.equal(s.body.length, 40); assert.equal(s.figures.holding_torque.value, 0.4); assert.equal(s.figures.holding_torque.kind, 'community');
  for (const v of ['NEMA-17', 'nema 17', 'Nema17']) assert.equal(motorModel(v).name, 'nema17');
  assert.equal(motorModel('28BYJ-48').name, '28byj48');
  const m = motorModel('nema17', { holding_torque: { value: 0.5, kind: 'measured', source: 'a scale' } });
  assert.equal(m.figures.holding_torque.value, 0.5); assert.equal(m.figures.holding_torque.kind, 'measured');
  assert.deepEqual(performance(m, {}).rests.includes('measured'), true);
  assert.equal(motorModel('nema17', { body_length: 60 }).figures.body_length.kind, 'given');
  const g = motorModel('n20', { ratio: 50.185 }), base = motorModel('n20');
  near(g.figures.stall_torque.value, base.figures.stall_torque.value / 2, 1e-6, 'half the ratio, half the torque');
  near(g.figures.no_load_speed.value, base.figures.no_load_speed.value * 2, 1e-6, 'and twice the speed');
  assert.equal(g.figures.stall_torque.kind, 'derived');
});

test('a motor of your own is a rule set in the same names', () => {
  const own = JSON.parse(fs.readFileSync(new URL('../rules/nema14.json', import.meta.url), 'utf8'));
  own.name = 'my-stepper'; own.rules.holding_torque.value = 0.3;
  const m = motorModel(own);
  assert.equal(m.name, 'my-stepper'); assert.equal(m.figures.holding_torque.value, 0.3); assert.ok(vol(motor(m)) > 0);
});

test('a plate with a mount takes its motor: the boss in its pocket, the shaft through, nothing touching', () => {
  for (const n of ['nema17', 'nema14', '28byj48', 'n20']) {
    const m = motorModel(n), plate = 5, face = mount(m, { plate }), g = mountModel(m, { plate });
    const blank = jscad.primitives.cuboid({ size: [70, 70, plate], center: [0, 0, plate / 2] }), part = subtract(blank, face);
    const hit = vol(intersect(part, motor(m)));
    assert.ok(hit < 0.01, `${n}: ${hit} mm³ of the motor inside the plate`);
    for (const h of g.holes) { const [x, y] = h.at; const bar = jscad.primitives.cylinder({ radius: h.diameter / 2 - 0.05, height: plate, center: [x, y, plate / 2], segments: 24 }); assert.ok(vol(intersect(part, bar)) < 1e-3, `${n}: a hole at ${x}, ${y}`); }
    assert.ok(g.pocket > m.boss.diameter, n); assert.ok(g.pocketDepth > m.boss.height, n);
  }
});

test('a servo goes through a slot, its tabs on the plate; a recess takes the body and its wires', () => {
  const m = motorModel('sg90'), plate = 3, neg = mount(m, { plate });
  const [a, b] = bb(neg); near(a[2], -3.5, 1e-6, 'through'); near(b[2], 0.5, 1e-6, 'and just past the face');
  const blank = jscad.primitives.cuboid({ size: [60, 40, plate], center: [-5, 0, -plate / 2] }), part = subtract(blank, neg);
  assert.ok(vol(intersect(part, motor(m))) < 0.01, 'the body clears its slot');
  const n = motorModel('nema17'), deep = mount(n, { plate: 4, recess: 10 }); near(bb(deep)[0][2], -10.5, 1e-6, 'the recess');
  near(size(deep)[0], 42.3 + 2 * 0.2, 1e-6, 'with the fit round the body');
});

test('the mount cuts through @rulecad/fixings the solid it always cut: volume and bounds for every motor in the catalogue', () => {
  // Recorded from mount() before its holes and counterbores came from @rulecad/fixings (fixings-3 at 3aff0d8, rules 0.3.13):
  // [motor and case, volume mm³, bounds' low corner, high corner]
  const cases = { 'plate 5': { plate: 5 }, 'plate 6 counterbore': { plate: 6, counterbore: true }, 'plate 4 recess 10': { plate: 4, recess: 10 },
    'plate 8 counterbore, printer': { plate: 8, counterbore: true, printer: { fit: 0.15, hole_comp: 0.2, layer: 0.28 } }, 'plate 3 M2': { plate: 3, screw: 'M2' } };
  const before = [
    ["nema17 plate 5", 1464.5321, [-17.25,-17.25,-0.5], [17.25,17.25,5.5]],
    ["nema17 plate 6 counterbore", 1790.5682, [-18.5,-18.5,-0.5], [18.5,18.5,6.5]],
    ["nema17 plate 4 recess 10", 21669.1767, [-21.35,-29.15,-10.5], [21.35,21.35,4.5]],
    ["nema17 plate 8 counterbore, printer", 1993.1478, [-18.5,-18.5,-0.5], [18.5,18.5,8.5]],
    ["nema14 plate 5", 1464.5321, [-14.75,-14.75,-0.5], [14.75,14.75,5.5]],
    ["nema14 plate 6 counterbore", 1790.5682, [-16,-16,-0.5], [16,16,6.5]],
    ["nema14 plate 4 recess 10", 15831.9117, [-17.8,-25.6,-10.5], [17.8,17.8,4.5]],
    ["nema14 plate 8 counterbore, printer", 1993.1478, [-16,-16,-0.5], [16,16,8.5]],
    ["28byj48 plate 5", 466.6332, [-19.8,-10.3,-0.5], [19.8,4.75,5.5]],
    ["28byj48 plate 6 counterbore", 774.367, [-21.25,-11.75,-0.5], [21.25,4.75,6.5]],
    ["28byj48 plate 4 recess 10", 7594.9847, [-19.8,-25,-10.5], [19.8,6.25,4.5]],
    ["28byj48 plate 8 counterbore, printer", 908.6788, [-21.25,-11.75,-0.5], [21.25,4.75,8.5]],
    ["28byj48 plate 3 M2", 252.4084, [-18.75,-9.25,-0.5], [18.75,4.75,3.5]],
    ["n20 plate 5", 111.7127, [-5.45,-2.25,-0.5], [5.45,2.25,5.5]],
    ["n20 plate 6 counterbore", 157.6981, [-6.25,-2.25,-0.5], [6.25,2.25,6.5]],
    ["n20 plate 4 recess 10", 2289.2298, [-6.2,-13,-10.5], [6.2,5.2,4.5]],
    ["n20 plate 8 counterbore, printer", 197.677, [-6.25,-2.25,-0.5], [6.25,2.25,8.5]],
    ["sg90 plate 5", 1773.5199, [-19.95,-6.3,-5.5], [9.25,6.3,0.5]],
    ["sg90 plate 6 counterbore", 2069.1065, [-19.95,-6.3,-6.5], [9.25,6.3,0.5]],
    ["sg90 plate 4 recess 10", 1477.9332, [-19.95,-6.3,-4.5], [9.25,6.3,0.5]],
    ["sg90 plate 8 counterbore, printer", 2633.1737, [-20,-6.25,-8.5], [9.3,6.25,0.5]],
    ["sg90 plate 3 M2", 1182.3466, [-19.95,-6.3,-3.5], [9.25,6.3,0.5]],
    ["mg90s plate 5", 1730.9199, [-19.85,-6.2,-5.5], [9.35,6.2,0.5]],
    ["mg90s plate 6 counterbore", 2019.4065, [-19.85,-6.2,-6.5], [9.35,6.2,0.5]],
    ["mg90s plate 4 recess 10", 1442.4332, [-19.85,-6.2,-4.5], [9.35,6.2,0.5]],
    ["mg90s plate 8 counterbore, printer", 2569.6337, [-19.9,-6.15,-8.5], [9.4,6.15,0.5]],
    ["mg90s plate 3 M2", 1153.9466, [-19.85,-6.2,-3.5], [9.35,6.2,0.5]],
    ["bldc2204 plate 5", 204.357, [-7.25,-7.25,-0.5], [7.25,7.25,5.5]],
    ["bldc2204 plate 6 counterbore", 334.275, [-8.15,-8.15,-0.5], [8.15,8.15,6.5]],
    ["bldc2204 plate 4 recess 10", 7292.7972, [-14.175,-21.925,-10.5], [14.175,14.175,4.5]],
    ["bldc2204 plate 8 counterbore, printer", 412.7786, [-8.15,-8.15,-0.5], [8.15,8.15,8.5]],
    ["bldc2204 plate 3 M2", 136.238, [-7.25,-7.25,-0.5], [7.25,7.25,3.5]]
  ];
  for (const [k, volume, lo, hi] of before) {
    const [n, ...rest] = k.split(' '), g = mount(motorModel(n), cases[rest.join(' ')]), [a, b] = bb(g);
    near(vol(g), volume, 1e-3, `${k}: volume`);
    for (let i = 0; i < 3; i++) { near(a[i], lo[i], 1e-4, `${k}: low corner`); near(b[i], hi[i], 1e-4, `${k}: high corner`); }
  }
  assert.equal(new Set(before.map(([k]) => k.split(' ')[0])).size, motors().length, 'every motor in the catalogue');
  // the screw is fixings' model, its hole fixings' clearance hole
  const g = mountModel(motorModel('nema17'), { plate: 5, counterbore: true });
  assert.equal(g.screw.model.kind, 'fixing'); assert.equal(g.screw.name, 'M3 cap'); assert.equal(g.screw.clearance, 3.4); assert.equal(g.holes[0].diameter, 3.5); assert.equal(g.head, 6);
});

test('a screw\'s engagement in the motor\'s tapped holes: an M3x6 through 6 mm into a NEMA 17 fails, the length worked out passes, a thread its holes do not take is refused', () => {
  const n17 = motorModel('nema17'), eng = (p, m = n17) => mountModel(m, p).findings.filter((f) => f.code === 'mount.engagement');
  const short = eng({ plate: 6, screw: 'M3x6' });
  assert.equal(short.length, 1); assert.equal(short[0].level, 'fail');
  assert.equal(short[0].text, '4 M3x6 cap screws through 6 mm of plate do not reach the motor\'s thread: M3x6 cap ends at its face. An M3x10 cap would engage 4 mm');
  assert.deepEqual(short[0].values, { engaged: 0, depth: 4.5, least: 3, length: 6, under: 6, count: 4 });
  // 2 mm in: short of a diameter
  const two = eng({ plate: 6, screw: 'M3x8' })[0];
  assert.equal(two.level, 'fail'); assert.match(two.text, /engage 2 mm of the motor's 4\.5 mm of M3 thread \(nema17\.mount_hole_depth\), 0\.67 diameters: less than the 3 mm \(engagement\.steel/);
  // the length mountModel works out, and a counterbore that lets a shorter screw reach
  const own = eng({ plate: 5 })[0]; assert.equal(own.level, 'pass'); assert.match(own.text, /^4 M3x9 cap screws through 5 mm of plate engage 4 mm of the motor's 4\.5 mm of M3 thread/);
  assert.equal(eng({ plate: 6, screw: 'M3x6', counterbore: true })[0].level, 'pass', '3 mm of plate under a sunk head');
  assert.equal(mountModel(n17, { plate: 5 }).engaged, 4);
  // a motor whose holes are plain, and a servo: nothing to engage in the motor
  assert.deepEqual(eng({ plate: 5, screw: 'M3' }, motorModel('28byj48')), []); assert.deepEqual(eng({ plate: 3 }, motorModel('sg90')), []);
  // "M3" keeps working, a whole screw's name too; the wrong thread and something that is not a screw are refused by name
  assert.equal(mountModel(n17, { plate: 5, screw: 'M3' }).screwLength, 9); assert.equal(mountModel(n17, { plate: 5, screw: 'M3x8 button' }).screw.model.head.form, 'button');
  assert.throws(() => mountModel(n17, { plate: 5, screw: 'M4' }), /nema17's holes are tapped M3 \(nema17\.mount_hole_thread\), so an M4 screw does not go in them/);
  assert.throws(() => mountModel(n17, { plate: 5, screw: 'M3 hex nut' }), /screw is a screw's name .* "M3 hex nut" is a nut/);
  assert.throws(() => mountModel(n17, { plate: 5, screw: 3 }), /screw is a screw's name/);
  assert.throws(() => mountModel(motorModel('28byj48'), { plate: 5, screw: 'M7' }), /no thread "M7"/);
});


test('the D-bore takes its shaft, and the flat turns the part: round where the round of the shaft passes', () => {
  for (const n of ['nema17', '28byj48', 'n20']) {
    const m = motorModel(n), depth = Math.min(m.shaft.length, m.shaft.flatLength), hole = bore(m, { depth });
    const hub = subtract(jscad.primitives.cylinder({ radius: 8, height: depth, center: [0, 0, depth / 2], segments: 48 }), hole);
    // shaft tip at the bore's end
    const shaft = translate([0, 0, depth - m.shaft.tip], motor(m));
    assert.ok(vol(intersect(hub, shaft)) < 0.01, `${n}: the shaft fits`);
    // and the flat is there: a plain round shaft of the bore's diameter would not go in
    const round = jscad.primitives.cylinder({ radius: boreModel(m, { depth }).diameter / 2 - 0.01, height: depth, center: [0, 0, depth / 2], segments: 48 });
    assert.ok(vol(intersect(hub, round)) > 0.5, `${n}: the bore has its flat`);
  }
  // deeper than the flat: the mouth is round, so the shaft's round root goes in
  const n = motorModel('nema17'), b = boreModel(n, { depth: 20 });
  assert.equal(b.flatFrom, 5); assert.equal(boreModel(n, { depth: 8, tip: 20 }).flatFrom, 5, 'the tip past the far side'); assert.ok(!b.findings.some((f) => f.code === 'bore.depth'));
  assert.ok(boreModel(n, { depth: 30 }).findings.some((f) => f.code === 'bore.depth'), 'past the shaft');
  assert.ok(boreModel(n, { depth: 3 }).findings.some((f) => f.code === 'bore.grip'), 'too little of it');
  const press = boreModel(n, { depth: 10, fit: 'press' }), slide = boreModel(n, { depth: 10 });
  near(slide.diameter - press.diameter, 2 * (DEFAULTS.fit.value - DEFAULTS.press.value), 1e-9, 'press against slide');
});

test('performance: a stepper flat to its corner, then constant power; a DC motor down its line; a geared stepper; a servo; a brushless', () => {
  const n = motorModel('nema17'), hold = 0.59, run = hold * Math.SQRT1_2, corner = (60 * 24) / (2 * 0.003 * 2 * 200);
  near(corner, 600, 1e-9, 'corner speed');
  near(performance(n, { speed: 0 }).output.torque, run, 1e-9, 'standing');
  near(performance(n, { speed: 600 }).output.torque, run, 1e-9, 'at the corner');
  near(performance(n, { speed: 1200 }).output.torque, run / 2, 1e-9, 'twice the corner speed: half');
  near(performance(n, { speed: 300, supply: 12 }).motor.torque, run, 1e-9, 'corner at 12 V is 300 rpm');
  near(performance(n, { speed: 600, supply: 12 }).motor.torque, run / 2, 1e-9, 'twice it');
  const geared = performance(n, { speed: 10, ratio: 50, efficiency: 0.8 });
  near(geared.motor.speed, 500, 1e-9, 'through the ratio'); near(geared.output.torque, run * 50 * 0.8, 1e-9, 'and the efficiency');
  const dc = motorModel('n20'), half = performance(dc, { speed: 155 });
  near(half.output.torque, 0.1667 / 2, 1e-4, 'half the free speed, half the stall torque');
  const byj = performance(motorModel('28byj48'), { speed: 2 });
  near(byj.output.torque, 0.0343, 1e-9, 'pull-in'); near(byj.limit, (600 / 4096) * 60, 1e-9, 'its 4096 half steps a turn'); assert.ok(byj.rests.includes('community'));
  assert.equal(motorModel('28byj48').stepAngle, 5.625 / 64);
  const s = performance(motorModel('sg90')); near(s.output.torque, 0.1765, 1e-9, 'servo'); near(s.limit, 100, 1e-9, 'a sixth of a turn in 0.1 s is 100 rpm');
  const b = performance(motorModel('bldc2204')); near(b.output.torque, (60 / (2 * Math.PI * 260)) * 0.6, 1e-9, 'Kt I');
  assert.ok(performance(motorModel('sg90'), { speed: 120 }).findings.some((f) => f.code === 'motor.speed'), 'too fast is said');
});

test('bad input is refused by name, before any maths', () => {
  assert.throws(() => motorModel('nema18'), /no motor "nema18" \(did you mean nema17\?\).*nema14/);
  assert.throws(() => motorModel('warp drive'), /no motor "warp drive"\. There are/);
  assert.throws(() => motorModel(42), /give a motor's name/);
  assert.throws(() => motorModel('nema17', { holding_torq: 1 }), /no figure "holding_torq" \(did you mean holding_torque\?\)/);
  const m = motorModel('nema17');
  assert.throws(() => mount(m, {}), /plate is a number above 0/);
  assert.throws(() => mount({}, { plate: 3 }), /give a motor's model/);
  assert.throws(() => bore(m, {}), /depth is a number above 0/);
  assert.throws(() => bore(m, { depth: 5, fit: 'tight' }), /fit is slide or press/);
  assert.throws(() => bore(motorModel('sg90'), { depth: 5 }), /through its horn/);
  assert.throws(() => bore(motorModel('bldc2204'), { depth: 5 }), /bolt to that/);
  assert.throws(() => performance(m, { speed: -1 }), /0 or more/);
  assert.throws(() => performance(m, { ratio: 0 }), /above 0/);
  assert.throws(() => performance(m, { efficiency: 1.5 }), /from 0 to 1/);
  assert.equal(printable(m)[0].level, 'fail');
  assert.equal(mountModel(motorModel('nema17'), { plate: 2 }).findings.some((f) => f.code === 'mount.plate'), true);
});

test('the README\'s example runs as written and prints what the README says', async () => {
  const { execFileSync } = await import('node:child_process');
  const readme = fs.readFileSync(new URL('./README.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n'); // (git on Windows checks it out with CRLF)
  const js = readme.match(/```js\n([\s\S]*?)```/)[1], expected = readme.match(/```text\n([\s\S]*?)```/)[1];
  const file = new URL('./.readme-example.mjs', import.meta.url);
  fs.writeFileSync(file, js);
  try { assert.equal(execFileSync(process.execPath, [(await import('node:url')).fileURLToPath(file)], { encoding: 'utf8' }).replace(/\r\n/g, '\n'), expected); } finally { fs.rmSync(file); }
});

test('the curve is what performance says, with the working point and the load on it', async () => {
  const { curve } = await import('@rulecad/motors/diagram');
  const svg = curve(motorModel('nema17'), { ratio: 38, efficiency: 0.47, at: { speed: 8, load: 0.735 } });
  assert.match(svg, /through 38:1/); assert.match(svg, /the load, 0\.73 N m/); assert.match(svg, /7\.45? N m at 8 rpm/);
  assert.ok(svg.startsWith('<svg')); assert.match(svg, /rests on spec/);
});

test('drivers and the power budget: the trimmer from the sense resistor, refusals by name, a supply too small', async () => {
  const { driver, setting, powerBudget } = await import('@rulecad/motors');
  assert.ok(Math.abs(setting(driver('a4988'), 1.47).vref - 0.8) < 0.01, 'Vref 0.8 V for 1.47 A on a 0.068 ohm board');
  assert.equal(setting(driver('drv8825'), 1).vref, 0.5);
  assert.equal(setting(driver('a4988', { variant: 'pre-2017-green' }), 1).vref, 0.4);
  assert.throws(() => driver('l298'), /no driver "l298" \(a4988, drv8825, tmc2209\)/);
  const over = setting(driver('a4988'), 1.5).findings, past = setting(driver('a4988'), 2.5).findings, volts = setting(driver('tmc2209'), 1, { supply: 36 }).findings;
  assert.equal(over[0].level, 'warn'); assert.match(over[0].text, /heat sink/);
  assert.equal(past[0].level, 'fail'); assert.equal(volts[0].level, 'fail'); assert.match(volts[0].text, /takes 4\.75 to 29 V/);
  assert.equal(setting(driver('a4988'), 1, { microsteps: 32 }).findings[0].level, 'fail');
  const parts = [{ name: 'a', current: 2, resistance: 1.1 }, { name: 'b', current: 2, resistance: 1.1 }, { name: 'board', current: 0.1, voltage: 5 }];
  const r = powerBudget(parts, { voltage: 12, current: 2 });
  assert.ok(Math.abs(r.watts - (2 * (2 * 4 * 1.1) / 0.85 + 0.5)) < 1e-9);
  assert.equal(r.findings[0].level, 'fail', 'a chopper at 12 V on 21 W: a 2 A supply, with its margin, is short');
  assert.equal(powerBudget(parts, { voltage: 24, current: 5 }).findings[0].level, 'pass');
  assert.throws(() => powerBudget(parts, {}), /give the supply's voltage/);
});
