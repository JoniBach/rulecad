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
