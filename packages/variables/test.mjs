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

test('a rule\'s pin map reaches a design as v.<set>.pinMaps, beside a rule named pins', () => {
  const set = { rules: { pins: { value: 14 }, gpio: { value: 2, pins: { 2: 'GPIO0', 3: 'GPIO1' } } } };
  const v = resolve({ uses: ['chip'], variables: {} }, { load: () => set }).values;
  assert.deepEqual(v.chip.pinMaps, { gpio: { 2: 'GPIO0', 3: 'GPIO1' } });
  assert.equal(v.chip.pins, 14, 'a rule named pins keeps its value');
});

test('names are an object\'s own: nothing inherited is a function, a variable or a rule set', () => {
  // only the listed functions can be called: every object carries constructor and hasOwnProperty, and they aren't among them
  for (const src of ['constructor(5) * 2', 'hasOwnProperty(1) + 1', '__proto__(1)', 'toString(2)']) assert.throws(() => evaluate(src), /unexpected "\("|no value for/, src);
  assert.equal(resolve({ variables: { constructor: { value: 5 }, twice: { value: 'constructor * 2' } } }).values.twice, 10, 'a variable may have any name');
  assert.throws(() => resolve({ variables: { a: { value: 'toString + 1' } } }), /no variable "toString"/);
  assert.throws(() => resolve({ uses: ['constructor'], variables: {} }), /no rule set "constructor"/);
  const sets = { p: { name: 'p', rules: { wall: { value: 3 } } } };
  assert.throws(() => resolve({ uses: ['p'], variables: { a: { value: 'p.constructor' } } }, { sets }), /no rule "constructor" in p/);
  assert.throws(() => resolve({ uses: ['p'], variables: { a: { value: 'p.wall.more' } } }, { sets }), /one dot/);
  assert.throws(() => resolve({ uses: ['p'], variables: { p: { value: 3 } } }, { sets }), /rule set in uses and a variable too/);
  assert.throws(() => resolve({ variables: { a: { value: NaN } } }), /not a finite number/);
  assert.throws(() => resolve({ variables: { a: { unit: 'mm' } } }), /"a" has no value/);
  assert.throws(() => resolve({ uses: ['p'], variables: {} }, { load: async () => sets.p }), /load must return the rule set itself/);
});

test('one grammar: an expression parsed once, its value and its unit read from the same tree', async () => {
  const { unitsOf } = await import('@rulecad/variables');
  const src = '-(w + x1c.line * 3) / 2 + round(w, 0.5) - max(w, 4)', vals = { w: 10, 'x1c.line': 0.42 }, units = { w: 'mm', 'x1c.line': 'mm' };
  assert.ok(Math.abs(evaluate(src, (n) => vals[n]) - (-(10 + 1.26) / 2 + 10 - 10)) < 1e-12);
  assert.deepEqual(unitsOf(src, (n) => units[n]), { unit: 'mm', problems: [], value: { mm: 1 } });
  for (const bad of ['w +', '(w', 'w w', '*']) {
    assert.throws(() => evaluate(bad, () => 1), /ends too soon|missing \)|unexpected/);
    assert.deepEqual(unitsOf(bad, () => 'mm').problems, [], `${bad}: what doesn't parse is evaluate's to say`);
  }
});

test('lint reads code as code: 1e3, 0x1F, 1_000 and numbers inside a template\'s ${…} are seen; // in a string hides nothing; names with digits aren\'t numbers', () => {
  const found = (src) => lint(src).map((f) => `${f.line}:${f.text}`);
  assert.deepEqual(found('const a = 1e3, b = 0x1F, c = 1_000, d = .5'), ['1:1e3', '1:0x1F', '1:1_000', '1:.5']);
  assert.deepEqual(found('const t = `${v.w * 4} mm`'), ['1:4']);
  assert.deepEqual(found('const u = "http://x" + v.w * 7'), ['1:7']);
  assert.deepEqual(found('const x1 = v.p2, y = arr[2].x3\nconst z = `a ${`b ${9}`} c`'), ['2:9']);
  assert.deepEqual(found('f(0, 1, 2, 2.0, 1e0)'), [], '0, 1 and 2 however written');
  assert.deepEqual(found('/* 9\n 8 */ const k = 3 // 4'), ['2:3']);
});

test('units through a division: a plain number over millimetres is per millimetre, so a wrong unit on it is said', async () => {
  const { unitsOf } = await import('@rulecad/variables');
  const unitOf = (n) => ({ w: 'mm', a: 'deg' })[n];
  assert.equal(unitsOf('2 / w', unitOf).unit, 'mm^-1');
  assert.equal(unitsOf('w * (2 / w)', unitOf).unit, 'a plain number');
  assert.deepEqual(unitsOf('2 / w + w', unitOf).problems, ['adds mm to mm^-1']);
});

test('a list rule: each entry through the one grammar, read as an array, and only min() and max() take it in an expression', async () => {
  const { fmt } = await import('@rulecad/variables');
  const sets = { m3: { name: 'm3', rules: { major_diameter: { value: 3, unit: 'mm' }, lengths: { value: [5, 6, 'major_diameter * 4', 16], unit: 'mm' } } } };
  const r = resolve({ uses: ['m3'], variables: { shortest: { value: 'min(m3.lengths)', unit: 'mm' }, longest: { value: 'max(m3.lengths, 20) + 1', unit: 'mm' } } }, { sets });
  assert.deepEqual(r.values.m3.lengths, [5, 6, 12, 16], 'an expression among the entries is worked out like any value');
  assert.equal(r.values.shortest, 5); assert.equal(r.values.longest, 21);
  assert.deepEqual(r.entries.find((e) => e.name === 'm3.lengths').value, [5, 6, 12, 16]);
  assert.ok(r.entries.find((e) => e.name === 'm3.lengths').used, 'a list a variable reads is used');
  assert.deepEqual(r.units, [], 'its unit is each entry\'s');
  assert.equal(fmt([5, 6.004, 12]), '5, 6, 12');
  // anything else refuses the list by name, and says what would be accepted
  assert.throws(() => resolve({ uses: ['m3'], variables: { a: { value: 'm3.lengths * 2' } } }, { sets }), /"m3.lengths" is a list: take min\(m3.lengths\) or max\(m3.lengths\)/);
  assert.throws(() => resolve({ uses: ['m3'], variables: { a: { value: 'm3.lengths' } } }, { sets }), /is a list/);
  assert.throws(() => resolve({ uses: ['m3'], variables: { a: { value: 'min(m3.lengths + 1)' } } }, { sets }), /is a list/);
  assert.throws(() => resolve({ variables: { a: { value: [1, 2] } } }), (e) => e.code === 'var.list' && /only a rule in a rule set holds a list/.test(e.message));
  const bad = (value) => () => resolve({ uses: ['s'], variables: {} }, { sets: { s: { name: 's', rules: { l: { value, unit: 'mm' } } } } });
  assert.throws(bad([]), /"s.l" = \[\]: is an empty list/);
  assert.throws(bad([1, 'nope + 1']), /no rule "nope" in s/);
  assert.throws(bad([1, [2]]), /"s.l"/);
});

test('rules check holds a list rule to order, and a part to what its vocabulary says holds between its figures', async () => {
  const { checkRuleSet } = await import('@rulecad/variables');
  const rule = (value, unit = 'mm') => ({ value, ...(unit != null ? { unit } : {}), rule: 'what it is, in words', kind: 'spec', source: 'a table', checked: '2026-11-14' });
  const vocabulary = { units: ['mm', ''], prefixes: ['head_'], parts: { thread: ['major_diameter', 'pitch'] },
    fields: { major_diameter: { unit: 'mm' }, pitch: { unit: 'mm' }, tap_drill: { unit: 'mm' }, clearance: { unit: 'mm' }, head: { unit: 'mm' }, lengths: { unit: 'mm', list: true } },
    checks: { thread: [{ ascending: ['tap_drill', 'major_diameter', 'clearance', 'head'], says: 'drill, thread, hole, head' }, { near: 'tap_drill', to: 'major_diameter - pitch', within: '0.2 * pitch', says: 'a tap drill is about the thread less its pitch' }] } };
  const base = () => ({ name: 'm3', part: 'thread', rules: { major_diameter: rule(3), pitch: rule(0.5), tap_drill: rule(2.5), clearance: rule(3.4), head: rule(5.5), lengths: rule([5, 6, 8]) } });
  const codes = (s) => checkRuleSet(s, vocabulary).map((x) => x.code);
  assert.deepEqual(codes(base()), []);
  let s = base(); s.rules.lengths.value = [5, 8, 6]; assert.deepEqual(checkRuleSet(s, vocabulary).map((x) => [x.code, x.rule, x.values]), [['rules.order', 'lengths', { before: 8, after: 6 }]]);
  s = base(); s.rules.lengths.value = [5, 5]; assert.deepEqual(codes(s), ['rules.order'], 'a length given twice is out of order too');
  s = base(); s.rules.lengths.value = []; assert.deepEqual(codes(s), ['rules.value']);
  s = base(); s.rules.lengths.value = [5, '6']; assert.deepEqual(codes(s), ['rules.value'], 'a published list is numbers');
  s = base(); s.rules.lengths.value = 5; assert.deepEqual(codes(s), ['rules.list']);
  s = base(); s.rules.head.value = [5.5]; assert.deepEqual(codes(s), ['rules.list'], 'a field that is one value takes no list');
  s = base(); delete s.rules.lengths.unit; assert.deepEqual(codes(s), ['rules.unit', 'rules.unit']);
  s = base(); s.rules.head.value = 3.2; assert.match(checkRuleSet(s, vocabulary)[0].text, /head \(3.2\) is not larger than clearance \(3.4\): drill, thread, hole, head/);
  s = base(); s.rules.tap_drill.value = 3.1; assert.deepEqual(codes(s), ['rules.order', 'rules.near'], 'a tap drill over the thread');
  s = base(); s.rules.tap_drill.value = 2.2; assert.deepEqual(checkRuleSet(s, vocabulary).map((x) => [x.code, x.rule]), [['rules.near', 'tap_drill']]);
  s = base(); delete s.rules.head; delete s.rules.tap_drill; assert.deepEqual(codes(s), [], 'what a size is not made with is not held to anything');
  assert.deepEqual(checkRuleSet({ name: 'x', rules: { l: { ...rule([3, 2]), unit: undefined } } }, vocabulary).map((x) => x.code), ['rules.order'], 'a list in a set with no part is still in order');
});
