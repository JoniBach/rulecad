import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, resolve, fmt, lint } from '@rulecad/variables';

test('expressions: arithmetic, brackets, functions and degrees', () => {
  assert.equal(evaluate('0.42 * 3', () => 0), 0.42 * 3);
  assert.equal(evaluate('(2 + 3) * -2', () => 0), -10);
  assert.equal(evaluate('max(a, 1) + min(2, b)', (k) => ({ a: 4, b: 0.5 }[k])), 4.5);
  assert.equal(evaluate('round(1.26, 0.2)', () => 0), 1.2000000000000002);
  assert.ok(Math.abs(evaluate('sind(30)', () => 0) - 0.5) < 1e-12);
});

test('expressions never run code', () => {
  for (const bad of ['process.exit()', 'a; b', '1 + ', '"x"', 'constructor.constructor("x")()', '2 ** 3']) assert.throws(() => evaluate(bad, () => 1));
});

const sets = { p: { name: 'p', rules: { line: { value: 0.4 }, wall: { value: 'line * 3' } } } };

test('resolve: variables refer to rule sets and to each other', () => {
  const r = resolve({ uses: ['p'], variables: { w: { value: 'p.wall + gap' }, gap: { value: 0.2 } } }, { sets });
  assert.equal(r.values.w, 0.4 * 3 + 0.2);
  assert.equal(r.values.p.wall, 0.4 * 3);
});

test('resolve: rule sets can be loaded on demand', () => {
  const r = resolve({ uses: ['p'], variables: { w: { value: 'p.line * 2' } } }, { load: (name) => sets[name] });
  assert.equal(r.values.w, 0.8);
  assert.throws(() => resolve({ uses: ['q'], variables: {} }), /no rule set "q"/);
});

test('resolve: loops, unknown names and unused sets are errors', () => {
  assert.throws(() => resolve({ variables: { a: { value: 'b' }, b: { value: 'a' } } }, { sets }), /refers back to itself/);
  assert.throws(() => resolve({ variables: { a: { value: 'nope' } } }, { sets }), /no variable "nope"/);
  assert.throws(() => resolve({ variables: { a: { value: 'p.line' } } }, { sets }), /isn't in uses/);
});

test('resolve: only tweakable variables can be set, and only within range', () => {
  const o = { variables: { h: { value: 7, tweak: { min: 6, max: 12 } }, w: { value: 1 } } };
  assert.equal(resolve(o, { set: { h: 9 } }).values.h, 9);
  assert.throws(() => resolve(o, { set: { h: 30 } }), /from 6 to 12/);
  assert.throws(() => resolve(o, { set: { w: 2 } }), /fixed by its rule/);
});

test('fmt: two decimals at most, names left alone', () => {
  assert.equal(fmt(1.23456), '1.23');
  assert.equal(fmt('oem'), 'oem');
});

test('lint: numbers in a design are flagged, except 0, 1, 2, comments and strings', () => {
  assert.deepEqual(lint('const a = v.x * 2 // 45 degrees\nconst b = "12" + 0.5\n/* 9 */ f(v.y, 1)'), [{ line: 2, text: '0.5' }]);
});

test('choices can be numbers: the value matches one and comes back as a number', () => {
  const { values } = resolve({ variables: { turn: { value: 270, choice: [0, 90, 180, 270] } } });
  assert.equal(values.turn, 270);
  assert.throws(() => resolve({ variables: { turn: { value: 45, choice: [0, 90, 180, 270] } } }), /is one of 0, 90, 180, 270/);
});

test('a rule set named with a hyphen is read with an underscore (a - is a minus in expressions)', () => {
  const sets = { 'keyboard/mx-switch': { name: 'mx-switch', rules: { housing_top: { value: 11.6 } } } };
  const { values } = resolve({ uses: ['keyboard/mx-switch'], variables: { lift: { value: 'mx_switch.housing_top / 2' } } }, { sets });
  assert.equal(values.lift, 5.8);
});

test('resolve: errors carry a code and the path to fix; deps say what each value reads', () => {
  const r = resolve({ uses: ['p'], variables: { w: { value: 'p.wall + gap' }, gap: { value: 0.2 } } }, { sets });
  assert.deepEqual(r.deps.w.sort(), ['gap', 'p.wall']);
  assert.deepEqual(r.deps['p.wall'], ['p.line']);
  const err = (o, opts) => { try { resolve(o, { sets, ...opts }); } catch (e) { return e; } assert.fail('no error'); };
  let e = err({ uses: ['p'], variables: { w: { value: 'p.wal + 1' } } });
  assert.equal(e.code, 'var.unknown-rule'); assert.equal(e.path, 'variables.w.value');
  e = err({ variables: { w: { value: 'gapp * 2' } } });
  assert.equal(e.code, 'var.unknown'); assert.equal(e.path, 'variables.w.value');
  e = err({ variables: { w: { value: 'v' }, v: { value: 'w' } } });
  assert.equal(e.code, 'var.cycle');
  e = err({ variables: { w: { value: 1 } } }, { set: { w: 2 } });
  assert.equal(e.code, 'set.fixed'); assert.equal(e.path, 'variables.w.tweak');
  e = err({ variables: { w: { value: '1 +' } } });
  assert.equal(e.code, 'var.expression'); assert.equal(e.path, 'variables.w.value');
});

test('units: mixing millimetres and degrees, or a value that comes to another unit than it says, is flagged', async () => {
  const { unitsOf } = await import('@rulecad/variables');
  const u = { w: 'mm', a: 'deg', n: 'keys', p: 'mm' };
  assert.deepEqual(unitsOf('w * 2 + p', (k) => u[k]).problems, []);
  assert.deepEqual(unitsOf('n * p + w', (k) => u[k]).problems, [], 'a count of keys times a pitch is a length');
  assert.match(unitsOf('w + a', (k) => u[k]).problems[0], /adds deg to mm/);
  assert.match(unitsOf('sind(w)', (k) => u[k]).problems[0], /sind of mm, not degrees/);
  const r = resolve({ variables: { w: { value: 10, unit: 'mm' }, area: { value: 'w * w', unit: 'mm' }, ok: { value: 'w * w', unit: 'mm²' } } });
  assert.deepEqual(r.units.map((x) => x.path), ['variables.area.unit']);
});
