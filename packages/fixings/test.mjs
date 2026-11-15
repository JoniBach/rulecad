import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import jscad from '@jscad/modeling';
import * as fixings from '@rulecad/fixings';
import { check } from '@rulecad/printcheck';
import { nutPocket as shapesNutPocket } from '@rulecad/shapes';

const { fixingModel, parseName, threads, GRAMMAR, HEADS, NUTS, DEFAULTS, holeModel, hole, HOLE_KINDS, counterboreModel, counterbore, countersinkModel, countersink, nutPocketModel, nutPocket,
  nutTrapModel, nutTrap, squareNutSlotModel, squareNutSlot, captiveNutModel, captiveNut, insertBossModel, insertBoss, printable, screwModel, screw, nutModel, nut, washerModel, washer, insertModel, insert, fixingsFor } = fixings;
const { measureBoundingBox: bb, measureVolume: vol } = jscad.measurements, { geom3 } = jscad.geometries, { subtract, union, intersect } = jscad.booleans;
const { cuboid, cylinder } = jscad.primitives, { translate, rotateY } = jscad.transforms;
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} against ${b} (±${tol})`);
const json = (path) => JSON.parse(fs.readFileSync(new URL(path, import.meta.url), 'utf8'));
const tris = (g) => geom3.toPolygons(g).flatMap((p) => p.vertices.slice(1, -1).map((_, i) => [p.vertices[0], p.vertices[i + 1], p.vertices[i + 2]].map((v) => [...v])));
// The X1C as printcheck reads it, from its rule set
const x1c = json('../rules/x1c.json'), PRINTER = { bed: 256, overhang: 45, layer: 0.2, support_gap: 0.2, bridge: 5, line: 0.42, print_gap: 0.3, foot: 0.15 };
const prints = (g, what) => assert.deepEqual(check(tris(g), PRINTER).filter((f) => f.level !== 'pass').map((f) => `${f.code}: ${f.text}`), [], what);
const closed = (g, what) => assert.equal(check(tris(translate([0, 0, 200], g)), PRINTER).find((f) => f.code === 'print.closed').level, 'pass', what);
const block = (h, w = 30) => translate([0, 0, h / 2], cuboid({ size: [w, w, h] }));
const passes = (model, code, what) => { const f = printable(model); assert.equal(f.length, 1, what); assert.equal(f[0].code, code); assert.equal(f[0].level, 'pass', `${what}: ${f[0].text}`); };
const SETS = ['m1_6', 'm2', 'm2_5', 'm3', 'm4', 'm5', 'm6', 'm8', 'm10', 'm12', 'unc_4_40', 'unc_6_32', 'unc_8_32', 'unc_10_24', 'unf_10_32', 'unc_1_4_20', 'unc_5_16_18', 'unc_3_8_16', 'pt_k22', 'pt_k25', 'pt_k30', 'pt_k35', 'pt_k40', 'pt_k50'];

test('the package: it says it is ready, depends on the rules and the shapes alone, and ships every module it imports', () => {
  const pkg = json('./package.json');
  assert.equal(fixings.status.plan, 'https://github.com/JoniBach/rulecad/issues/212');
  assert.ok(!pkg.version.startsWith('0.0.'), 'past the placeholder');
  assert.equal(fixings.status.release, 'ready'); assert.ok(Object.isFrozen(fixings.status));
  assert.deepEqual(Object.keys(pkg.dependencies).sort(), ['@rulecad/rules', '@rulecad/shapes']);
  assert.deepEqual(Object.keys(pkg.peerDependencies), ['@jscad/modeling']);
  for (const f of pkg.files.filter((x) => x.endsWith('.mjs'))) { assert.ok(fs.existsSync(new URL(`./${f}`, import.meta.url)), f); assert.ok(pkg.files.includes(f.replace(/\.mjs$/, '.d.mts')), `${f}'s declarations are shipped`); }
});

test('fixingModel: an M3x12 cap screw is its head, clearances, tap drill and pitch, each with how far to trust it and where it comes from', () => {
  const m = fixingModel('M3x12 cap');
  assert.equal(m.kind, 'fixing'); assert.equal(m.item, 'screw'); assert.equal(m.name, 'M3x12 cap'); assert.equal(m.set, 'm3'); assert.equal(m.thread, 'M3'); assert.equal(m.form, 'metric');
  assert.equal(m.major, 3); assert.equal(m.pitch, 0.5); assert.equal(m.length, 12); assert.equal(m.sold, true);
  assert.deepEqual({ form: m.head.form, diameter: m.head.diameter, height: m.head.height, key: m.head.key }, { form: 'cap', diameter: 5.5, height: 3, key: 2.5 });
  for (const [n, value, source] of [['head', 5.5, /ISO 4762/], ['head_height', 3, /ISO 4762/], ['clearance_close', 3.2, /ISO 273/], ['clearance', 3.4, /ISO 273/], ['clearance_loose', 3.6, /ISO 273/], ['tap_drill', 2.5, /ISO 2306/], ['pitch', 0.5, /ISO 261/]]) {
    assert.equal(m.figures[n].value, value, n); assert.equal(m.figures[n].kind, 'spec', n); assert.match(m.figures[n].source, source, n);
  }
  // every figure of every thread carries its kind and its source through, and the model is its own copy of them
  for (const t of threads()) for (const [k, f] of Object.entries(fixingModel(t).figures)) { assert.ok(f.kind, `${t}.${k}`); assert.ok(f.source, `${t}.${k}`); }
  m.figures.head.value = 99; assert.equal(fixingModel('M3').figures.head.value, 5.5, 'a model does not write to the rule set');
  assert.deepEqual(m.made, { heads: ['cap', 'button', 'countersunk', 'hex', 'set'], nuts: ['hex', 'square', 'lock'], washer: true, insert: true });
  assert.deepEqual(fixingModel('K30').made, { heads: ['pan'], nuts: [], washer: false, insert: false });
});

test('every thread there is a rule set for is found by its name, metric, inch and for plastic', () => {
  assert.equal(threads().length, SETS.length);
  for (const s of SETS) { const set = json(`../rules/${s}.json`), m = fixingModel(set.rules.thread.value); assert.equal(m.set, s); assert.equal(m.major, set.rules.major_diameter.value); assert.equal(m.item, 'thread'); assert.equal(m.name, set.rules.thread.value); }
  for (const [said, set] of [['M3', 'm3'], ['m3', 'm3'], ['M2.5', 'm2_5'], ['M 12', 'm12'], ['1/4-20', 'unc_1_4_20'], ['1/4-20 UNC', 'unc_1_4_20'], ['6-32', 'unc_6_32'], ['#6-32', 'unc_6_32'], ['10-24', 'unc_10_24'], ['10-32', 'unf_10_32'], ['10-32 unf', 'unf_10_32'], ['K30', 'pt_k30'], ['PT K30', 'pt_k30'], ['k50', 'pt_k50']]) assert.equal(fixingModel(said).set, set, said);
});

test('the name grammar: thread, length, head form, nut, washer and insert, metric and inch, each name with one spelling', () => {
  // [as said, its one spelling, item, length in mm, head or nut]
  for (const [said, name, item, length, form] of [
    ['M3x12 cap', 'M3x12 cap', 'screw', 12, 'cap'], ['m3 x 12', 'M3x12 cap', 'screw', 12, 'cap'], ['M3×12 socket cap screw', 'M3x12 cap', 'screw', 12, 'cap'], ['M3x12mm cap', 'M3x12 cap', 'screw', 12, 'cap'],
    ['M5x10 button', 'M5x10 button', 'screw', 10, 'button'], ['M5x10 button head', 'M5x10 button', 'screw', 10, 'button'], ['M4x8 countersunk', 'M4x8 countersunk', 'screw', 8, 'countersunk'], ['M4x8 csk', 'M4x8 countersunk', 'screw', 8, 'countersunk'],
    ['M6x20 hex', 'M6x20 hex', 'screw', 20, 'hex'], ['M3x4 set', 'M3x4 set', 'screw', 4, 'set'], ['M3x4 grub screw', 'M3x4 set', 'screw', 4, 'set'], ['M3 button', 'M3 button', 'screw', null, 'button'],
    ['1/4-20 x 1/2 cap', '1/4-20 UNC x 1/2 cap', 'screw', 12.7, 'cap'], ['1/4-20x1 1/2', '1/4-20 UNC x 1 1/2 cap', 'screw', 38.1, 'cap'], ['6-32 x 0.25in button', '6-32 UNC x 1/4 button', 'screw', 6.35, 'button'],
    ['6-32 x 12.7 mm flat', '6-32 UNC x 1/2 countersunk', 'screw', 12.7, 'countersunk'], ['10-32 UNF x 3/8"', '10-32 UNF x 3/8 cap', 'screw', 9.525, 'cap'],
    ['K30x10', 'PT K30x10 pan', 'screw', 10, 'pan'], ['K30x10 pan torx', 'PT K30x10 pan torx', 'screw', 10, 'pan'],
    ['M3 nut', 'M3 hex nut', 'nut', null, 'hex'], ['M3 hex nut', 'M3 hex nut', 'nut', null, 'hex'], ['M4 square nut', 'M4 square nut', 'nut', null, 'square'], ['M5 lock nut', 'M5 lock nut', 'nut', null, 'lock'], ['M5 nyloc nut', 'M5 lock nut', 'nut', null, 'lock'], ['1/4-20 nut', '1/4-20 UNC hex nut', 'nut', null, 'hex'],
    ['M3 washer', 'M3 washer', 'washer', null, null], ['M3 insert', 'M3x5.7 insert', 'insert', 5.7, null], ['M3x3 insert', 'M3x3 insert', 'insert', 3, null], ['M3x4 heat-set insert', 'M3x4 insert', 'insert', 4, null], ['4-40 insert', '4-40 UNC x 5.7 mm insert', 'insert', 5.7, null]]) {
    const m = fixingModel(said);
    assert.equal(m.name, name, said); assert.equal(m.item, item, said); assert.equal(m.said, said);
    if (length == null) assert.equal(m.length, null, said); else near(m.length, length, 1e-9, said);
    assert.equal(item === 'nut' ? m.nut.kind : m.head?.form ?? null, form, said);
    assert.equal(fixingModel(m.name).name, m.name, `${said}: its one spelling reads back as itself`);
  }
  assert.deepEqual(parseName('1/4-20 x 1 1/2 button'), { thread: '1/4-20', form: 'unified', length: 1.5, unit: null, item: 'screw', head: 'button', nut: null, extra: [] });
  assert.deepEqual(parseName('M3 lock nut'), { thread: 'M3', form: 'metric', length: null, unit: null, item: 'nut', head: null, nut: 'lock', extra: [] });
  assert.deepEqual(parseName('K30x8 torx').extra, ['torx'], 'a word the grammar does not know is left for the rule set\'s variants');
  // 'hex' is a head on a screw and a kind of nut: the word nut decides
  assert.equal(fixingModel('M6 hex').head.form, 'hex'); assert.equal(fixingModel('M6 hex nut').nut.kind, 'hex');
  // a variant of the rule set, by a word or by its insert's length, changes the figures it lists and says where from
  assert.equal(fixingModel('K30x10 torx').head.diameter, 5.6); assert.equal(fixingModel('K30x10').head.diameter, 5.3); assert.equal(fixingModel('K30x10 torx').variant, 'torx');
  const voron = fixingModel('M3x4 insert'); assert.equal(voron.variant, 'M3x5x4-voron'); assert.equal(voron.figures.insert_hole.value, 4.4); assert.match(voron.figures.insert_hole.source, /CNC Kitchen/);
  assert.equal(fixingModel('M3 insert', {}, { variant: 'M3x3' }).length, 3);
  for (const word of [...HEADS, ...NUTS, 'nut', 'washer', 'insert']) assert.ok(GRAMMAR.includes(`"${word}"`), `the grammar names ${word}`);
});

test('a length is held to the lengths sold, with the nearest named; the caller may allow another', () => {
  assert.throws(() => fixingModel('M3x14 cap'), /an M3 screw is not sold 14 mm long: the nearest are 12 mm and 16 mm \(m3\.lengths: 5, 6, 8, 10, 12, 16, 20, 25, 30 mm.*anyLength/);
  assert.throws(() => fixingModel('M3x40 cap'), /the nearest is 30 mm/);
  assert.throws(() => fixingModel('1/4-20 x 5/16 cap'), /a 1\/4-20 UNC screw is not sold 5\/16 in \(7\.938 mm\) long: the nearest is 3\/8 in \(9\.525 mm\)/);
  const odd = fixingModel('M3x14 cap', {}, { anyLength: true }); assert.equal(odd.length, 14); assert.equal(odd.sold, false);
  assert.equal(fixingModel('M3x3 set').sold, null, 'a set screw is sold shorter than the cap screw\'s list: not held to it');
  assert.equal(fixingModel('K30x10').sold, null, 'no list of lengths for a screw for plastic');
  for (const s of SETS) { const set = json(`../rules/${s}.json`); for (const L of set.rules.lengths?.value ?? []) assert.equal(fixingModel(`${set.rules.thread.value} x ${L} mm cap`).sold, true, `${s} ${L}`); }
});

test('refused by name: a thread nobody has a set for, a head or a nut that size is not made with, and names the grammar cannot read', () => {
  assert.throws(() => fixingModel('M7'), /fixingModel: no thread "M7"\. There are: M1\.6, M2, M2\.5, M3, M4, M5, M6, M8, M10, M12, 4-40 UNC, .*PT K50\. For another thread, hand in its rule set/);
  assert.throws(() => fixingModel('10-32 UNC'), /no thread "10-32 UNC" \(did you mean 10-32 UNF\?\)/);
  assert.throws(() => fixingModel('M2.5x6 button'), /M2\.5 is not made with a button head, by its rule set \(m2_5\): it comes as cap, countersunk, hex, set/);
  assert.throws(() => fixingModel('6-32 x 1/2 hex'), /6-32 UNC is not made with a hex head/);
  assert.throws(() => fixingModel('K30x10 cap'), /PT K30 is not made with a cap head.*it comes as pan/);
  assert.throws(() => fixingModel('M12 square nut'), /M12 has no square nut in its rule set \(m12\): its nuts are hex, lock/);
  assert.throws(() => fixingModel('M2 lock nut'), /M2 has no lock nut/);
  assert.throws(() => fixingModel('M12 insert'), /M12 has no heat-set insert/);
  assert.throws(() => fixingModel('K30 washer'), /PT K30 has no washer/);
  assert.throws(() => fixingModel('M3x5 insert'), /an M3 insert is not listed 5 mm long: its rule set \(m3\) has 5\.7, 3, 4 mm/);
  assert.throws(() => fixingModel('M3x12 dome'), /nothing is called "dome"\. A head form is one of cap, button, countersunk, hex, set, pan/);
  assert.throws(() => fixingModel('M3 cap button'), /says cap and button/);
  assert.throws(() => fixingModel('M3x12 nut'), /a nut has no length/);
  assert.throws(() => fixingModel('M3 nut washer'), /names nut and washer: one thing at a time/);
  assert.throws(() => fixingModel('bolt'), /"bolt" does not start with a thread \(M3, M2\.5, 6-32, 1\/4-20, K30\)/);
  assert.throws(() => fixingModel('M3x'), /after the x comes a length/);
  assert.throws(() => fixingModel(3), /give a name, not 3/);
  assert.throws(() => fixingModel(''), /give a name/);
  assert.throws(() => fixingModel('M3', 3), /change is figures by their rules' names/);
  assert.throws(() => fixingModel('M3', { clearence: 3.3 }), /m3 has no figure "clearence" \(did you mean clearance\?\)/);
  assert.throws(() => fixingModel('M3', {}, { variant: 'gold' }), /m3 has no variant "gold" \(M3x3, M3x5x4-voron\)/);
  assert.throws(() => fixingModel('M3', {}, { sets: 'm3' }), /sets is the workspace's rule sets/);
});

test('a figure of your own replaces the rule\'s, as motorModel takes them; a workspace\'s rule set for a thread is used before the kit\'s', () => {
  assert.deepEqual([fixingModel('M3', { clearance: 3.3 }).figures.clearance.value, fixingModel('M3', { clearance: 3.3 }).figures.clearance.kind], [3.3, 'given']);
  const measured = fixingModel('M3', { pilot: { value: 2.8, kind: 'measured', source: 'my coupon' } });
  assert.equal(measured.figures.pilot.value, 2.8); assert.equal(measured.figures.pilot.kind, 'measured'); assert.equal(measured.figures.pilot.source, 'my coupon'); assert.match(measured.figures.pilot.rule, /form its own thread/);
  assert.equal(holeModel(fixingModel('M3', { clearance: 3.3 })).diameter, 3.4, 'and what reads the model reads the change');
  // the workspace's own m3, as a whole set with one figure changed: found by its thread's name
  const own = json('../rules/m3.json'); own.rules.clearance = { ...own.rules.clearance, value: 3.3, kind: 'measured', source: 'this workspace' };
  const m = fixingModel('M3x12 cap', {}, { sets: { m3: own } });
  assert.equal(m.figures.clearance.value, 3.3); assert.equal(m.figures.clearance.source, 'this workspace'); assert.equal(m.figures.pitch.value, 0.5);
  assert.equal(holeModel('M3', { sets: { m3: own } }).diameter, 3.4, 'a name read with the workspace\'s sets');
  assert.equal(fixingModel('M3', {}, { sets: [own] }).figures.clearance.value, 3.3, 'sets as a list');
  // an older workspace set, from before threads said what they were (no thread, no pitch): found by its name, the kit filling what it lacks
  const old = { name: 'm4', rules: { clearance: { value: 4.6, unit: 'mm', rule: 'M4 clearance, as this shop drills it', kind: 'community', source: 'the shop' } } };
  const o = fixingModel('M4x10 cap', {}, { sets: { m4: old, x1c } });
  assert.equal(o.figures.clearance.value, 4.6); assert.equal(o.figures.clearance.from, 'workspace'); assert.equal(o.figures.pitch.value, 0.7); assert.equal(o.figures.pitch.from, 'kit'); assert.equal(o.head.diameter, 7);
  assert.equal(fixingModel('M3', {}, { sets: { m4: old } }).figures.clearance.value, 3.4, 'another thread is untouched');
  // a thread the kit has no set for is a rule set of your own
  const m14 = { name: 'm14', part: 'thread', rules: Object.fromEntries(Object.entries({ thread: 'M14', thread_form: 'metric', major_diameter: 14, pitch: 2, clearance: 15.5, lengths: [30, 40, 50], head: 21, head_height: 14 }).map(([k, value]) => [k, { value, kind: 'spec', source: 'ISO 4762, read by hand' }])) };
  assert.throws(() => fixingModel('M14'), /no thread "M14"/);
  const big = fixingModel('M14x40 cap', {}, { sets: { m14 } }); assert.equal(big.head.diameter, 21); assert.equal(big.sold, true);
  assert.ok(threads({ sets: { m14 } }).includes('M14')); assert.throws(() => fixingModel('M14x35 cap', {}, { sets: { m14 } }), /nearest are 30 mm and 40 mm/);
  assert.throws(() => fixingModel('M16', {}, { sets: { m16: { name: 'm16', rules: { thread: { value: 'M16' } } } } }), /m16 is no thread's rule set: it has no thread_form/);
});

test('holes: an M3 clearance hole on the X1C is 3.5 mm, as designs write it today, and an M3 pilot is 2.9 mm and rests on a measured rule', () => {
  const m3 = json('../rules/m3.json'), c = holeModel('M3');
  assert.equal(c.kind, 'clearance'); assert.equal(c.diameter, 3.5);
  assert.equal(c.diameter, +(m3.rules.clearance.value + x1c.rules.hole_comp.value).toFixed(3), 'm3.clearance + x1c.hole_comp');
  assert.equal(c.nominal, 3.4); assert.equal(c.comp, 0.1); assert.equal(c.through, true); assert.deepEqual(c.basis, { rule: 'm3.clearance', kind: 'spec', source: m3.rules.clearance.source });
  assert.deepEqual(c.rests.map((r) => r.name), ['m3.clearance', 'x1c.hole_comp']);
  const drawn = c.findings.find((f) => f.code === 'hole.drawn');
  assert.equal(drawn.level, 'info'); assert.match(drawn.text, /an M3 clearance hole drawn 3\.5 mm: it rests on m3\.clearance \(3\.4 mm\), a standard's figure, plus x1c\.hole_comp 0\.1 mm across/);
  assert.deepEqual(drawn.values, { diameter: 3.5, nominal: 3.4, comp: 0.1 }); assert.deepEqual(drawn.refs, { thread: 'M3', set: 'm3', rule: 'm3.clearance', kind: 'spec' });

  const p = holeModel('M3', { kind: 'pilot' });
  assert.equal(p.diameter, 2.9); assert.equal(p.comp, 0, 'the pilot is drawn as its rule gives it'); assert.equal(p.basis.rule, 'x1c.pilot_m3'); assert.equal(p.basis.kind, 'measured');
  assert.match(p.findings.find((f) => f.code === 'hole.drawn').text, /an M3 pilot drawn 2\.9 mm: it rests on x1c\.pilot_m3 \(2\.9 mm\), a measured rule, as drawn/);
  assert.equal(p.through, false); assert.equal(p.depth, 5, 'm3.pilot_depth'); assert.ok(p.rests.some((r) => r.name === 'm3.pilot_depth'));

  assert.deepEqual([holeModel('M3', { kind: 'close' }).diameter, holeModel('M3', { kind: 'loose' }).diameter, holeModel('M3', { kind: 'tap' }).diameter, holeModel('M3', { kind: 'insert' }).diameter], [3.3, 3.7, 2.6, 4]);
  assert.equal(holeModel('M3', { kind: 'insert' }).depth, 6.7, 'a blind insert hole: the insert and 1 mm'); assert.equal(holeModel('M3', { kind: 'insert', through: true }).depth, 5.7, 'through: the insert\'s length');
  assert.equal(holeModel('M3', { kind: 'tap' }).depth, 7.5, '2.5 diameters of thread in plastic'); assert.equal(holeModel('M3', { kind: 'tap', material: 'aluminium' }).depth, 6); assert.equal(holeModel('M3', { kind: 'tap', material: 'steel' }).depth, 3);
  assert.equal(holeModel('M5', { kind: 'pilot' }).depth, 12.5, 'no pilot_depth for M5: the engagement rule for plastic');
  assert.deepEqual(HOLE_KINDS, ['clearance', 'close', 'loose', 'tap', 'pilot', 'insert', 'thread']);
  // each thread's clearance hole is its rule plus the compensation, once
  for (const s of SETS.filter((n) => !n.startsWith('pt_'))) { const set = json(`../rules/${s}.json`); near(holeModel(set.rules.thread.value).diameter, set.rules.clearance.value + 0.1, 1e-9, s); }
});

test('holes: compensation goes on a figure that is the size wanted, and not on one its rule says is as drawn', () => {
  // The rules themselves say which is which: the vocabulary gives a pilot and an insert hole "as drawn", and each rule's own
  // text says "no hole compensation" or that it is the hole to draw
  const fields = json('../rules/vocabulary.json').fields;
  assert.match(fields.pilot.says, /as drawn/); assert.match(fields.insert_hole.says, /as drawn: no hole compensation/);
  for (const s of SETS) {
    const set = json(`../rules/${s}.json`), t = set.rules.thread.value;
    for (const [kind, rule] of [['pilot', 'pilot'], ['insert', 'insert_hole']]) if (set.rules[rule]) {
      assert.match(set.rules[rule].rule, /no hole compensation|^Hole to draw for|^Hole for a PT/, `${s}.${rule} says it is as drawn`);
      const h = holeModel(t, { kind, printer: { name: 'other', rules: { hole_comp: { value: 0.3, kind: 'measured', source: 'x' } } } });
      assert.equal(h.comp, 0, `${s} ${kind}`); assert.equal(h.diameter, set.rules[rule].value, `${s} ${kind}: drawn as the rule gives it, whatever the printer's compensation`);
    }
  }
  assert.match(x1c.rules.pilot_m3.rule, /no hole compensation/);
  // the same compensation is added to the sizes wanted
  const other = { name: 'other', rules: { hole_comp: { value: 0.3, unit: 'mm', kind: 'measured', source: 'a test print' } } };
  assert.deepEqual(['clearance', 'close', 'loose', 'tap'].map((kind) => holeModel('M4', { kind, printer: other }).diameter), [4.8, 4.6, 5.1, 3.6]);
});

test('holes: another printer\'s rule set gives that printer\'s figure, and a pilot it has not measured rests on the thread\'s starting figure and says so', () => {
  const mk4 = { name: 'mk4', rules: { hole_comp: { value: 0.15, unit: 'mm', rule: 'Holes come out small', kind: 'measured', source: 'a test print' }, pilot_m4: { value: 3.6, unit: 'mm', rule: 'Hole to draw for an M4 screw in PETG', kind: 'measured', source: 'its coupon' }, pilot_m4_pla: { value: 3.7, unit: 'mm', rule: 'Hole to draw for an M4 screw in PLA', kind: 'measured', source: 'its coupon' } } };
  const c = holeModel('M3', { printer: mk4 });
  assert.equal(c.diameter, 3.55); assert.deepEqual(c.rests.map((r) => r.name), ['m3.clearance', 'mk4.hole_comp']); assert.match(c.findings[0].text, /plus mk4\.hole_comp 0\.15 mm across/);
  const p = holeModel('M3', { kind: 'pilot', printer: mk4 });
  assert.equal(p.diameter, 2.9); assert.equal(p.basis.rule, 'm3.pilot'); assert.equal(p.basis.kind, 'community', 'the X1C\'s measurement is not borrowed for another machine');
  assert.match(p.findings[0].text, /rests on m3\.pilot \(2\.9 mm\), a community figure.*mk4 has no measured pilot_m3, so measure it on this printer/);
  // its own measured rule, for the thread and then for the plastic
  assert.deepEqual([holeModel('M4', { kind: 'pilot', printer: mk4 }).diameter, holeModel('M4', { kind: 'pilot', printer: mk4 }).basis.rule], [3.6, 'mk4.pilot_m4']);
  assert.deepEqual([holeModel('M4', { kind: 'pilot', printer: mk4, material: 'PLA' }).diameter, holeModel('M4', { kind: 'pilot', printer: mk4, material: 'PLA' }).basis.rule], [3.7, 'mk4.pilot_m4_pla']);
  assert.equal(holeModel('M4', { kind: 'pilot' }).basis.kind, 'community', 'the X1C has measured M3 only');
  assert.equal(holeModel('M6', { kind: 'pilot' }).basis.kind, 'estimate');
  // a figure for one plastic, asked for another
  assert.ok(holeModel('M3', { kind: 'pilot', material: 'PETG' }).findings.some((f) => f.code === 'hole.material' && f.level === 'warn' && /does not name PETG/.test(f.text)));
  assert.ok(!holeModel('M3', { kind: 'pilot', material: 'PLA' }).findings.some((f) => f.code === 'hole.material'));
  assert.ok(!holeModel('M4', { kind: 'pilot', printer: mk4, material: 'PETG' }).findings.some((f) => f.code === 'hole.material'));
  // a design's plain values (v.x1c) work as a printer too, marked as given; what they lack is the X1C's, and said
  const plain = holeModel('M3', { printer: { hole_comp: 0.2 } }); assert.equal(plain.diameter, 3.6); assert.equal(plain.rests[1].kind, 'given');
  const bare = holeModel('M3', { printer: { name: 'bare', rules: {} } }); assert.equal(bare.diameter, 3.5); assert.ok(bare.findings.some((f) => f.code === 'hole.printer' && /bare has no hole_comp: the X1C's 0\.1 mm is used/.test(f.text)));
  assert.equal(holeModel('M3', { kind: 'pilot', printer: { pilot_m3: 3 } }).diameter, 3);
});

test('holes drawn: round standing up, a teardrop on its side, a blind hole to its depth with a lead-in, a point where it ends going up', () => {
  const pin = (d, h, at) => translate(at, cylinder({ radius: d / 2, height: h, segments: 64 }));
  // through a 6 mm plate: a 3.4 mm pin passes, a 3.6 mm pin does not
  const plate = subtract(block(6), hole('M3', { depth: 6, at: [0, 0, 6] }));
  assert.ok(vol(intersect(plate, pin(3.4, 6, [0, 0, 3]))) < 1e-3); assert.ok(vol(intersect(plate, pin(3.6, 6, [0, 0, 3]))) > 0.5);
  near(vol(block(6)) - vol(plate), (Math.PI / 4) * 3.5 ** 2 * 6, 0.3, 'the plug taken out');
  prints(plate, 'a clearance hole down through a plate');
  // blind: its depth, and a lead-in at the mouth
  const p = hole('M3', { kind: 'pilot', at: [0, 0, 10] }), [lo, hi] = bb(p);
  near(lo[2], 5, 1e-9, 'the pilot ends 5 mm down'); near(hi[0] - lo[0], 2.9 + 2 * 0.4, 1e-9, 'its mouth wider by the lead-in each side'); assert.equal(p.model.lead, 0.4);
  near(bb(hole('M3', { kind: 'pilot', lead: 0, at: [0, 0, 10] }))[1][0], 1.45, 1e-9, 'no lead-in when told');
  prints(subtract(block(10), p), 'a blind pilot from the top');
  // going up from the bed a blind hole ends in a 45° point, so nothing bridges
  const up = hole('M5', { kind: 'insert', into: '+z' }), m5 = json('../rules/m5.json').rules;
  assert.equal(up.model.point, m5.insert_hole.value / 2); near(bb(up)[1][2], m5.insert_depth.value + m5.insert_hole.value / 2, 1e-9, 'depth and point'); prints(subtract(block(16), up), 'a blind hole up from the bed');
  // on its side: a teardrop, through shapes' teardropHole
  const side = hole('M3', { depth: 30, at: [-15, 0, 6], into: '+x' });
  assert.equal(side.model.teardrop, true); near(bb(side)[1][2] - 6, (3.5 / 2) * Math.SQRT2, 0.03, 'a 45° roof above the round'); near(bb(side)[0][2], 6 - 1.75, 1e-9, 'round below');
  prints(subtract(block(12), side), 'a hole lying on its side'); passes(side, 'hole.printable', 'on its side');
  assert.equal(holeModel('M3', { axis: 'y' }).into, '+y'); assert.equal(holeModel('M3', { axis: 'z' }).teardrop, false);
  assert.ok(holeModel('M3', { kind: 'pilot', axis: 'x' }).findings.some((f) => f.code === 'hole.side' && f.level === 'warn'), 'a pilot on its side is said');
  assert.ok(holeModel('M3', { kind: 'insert', depth: 4 }).findings.some((f) => f.code === 'hole.depth' && /asks 6\.7 mm of blind hole/.test(f.text)), 'too shallow for its insert');
  passes(holeModel('M3'), 'hole.printable', 'standing up'); assert.equal(hole('M3', { depth: 3 }).model.diameter, 3.5, 'the solid carries its model');
});

test('holes refuse what they cannot draw, by name', () => {
  assert.throws(() => holeModel('M3', { kind: 'thread' }), /kind "thread" is a thread modelled to print, which arrives with this package's printed threads.*'pilot'.*'tap'.*'insert'/);
  assert.throws(() => holeModel('M3', { kind: 'slot' }), /hole: kind is clearance, close, loose, tap, pilot, insert or thread \(got "slot"\)/);
  assert.throws(() => holeModel('K30', { kind: 'tap' }), /PT K30 has no tap_drill in its rule set \(pt_k30\), so no tap hole: it has figures for pilot/);
  assert.throws(() => holeModel('M12', { kind: 'insert' }), /M12 has no insert_hole/);
  assert.throws(() => holeModel('M3', { depth: 0 }), /depth is a number above 0/);
  assert.throws(() => holeModel('M3', { into: 'up' }), /into is \+x, -x, \+y, -y, \+z or -z \(got "up"\)/);
  assert.throws(() => holeModel('M3', { axis: 'w' }), /axis is x, y or z/);
  assert.throws(() => holeModel('M3', { into: '+x', axis: 'z' }), /into \+x runs along x and axis says z/);
  assert.throws(() => holeModel('M3', { kind: 'pilot', into: '+x', lead: 0.4 }), /a lead-in on a hole lying on its side would overhang/);
  assert.throws(() => holeModel('M3', { lead: -1 }), /lead is the lead-in chamfer, 0 mm or more/);
  assert.throws(() => holeModel('M3', { through: 'yes' }), /through is true or false/);
  assert.throws(() => holeModel('M3', 'pilot'), /the second argument is its options/);
  assert.throws(() => holeModel({}, {}), /give a fixing's model \(fixingModel\) or its name/);
  assert.throws(() => holeModel('M3', { printer: 'x1c' }), /printer is the printer's rule set/);
  assert.throws(() => holeModel('M3', { printer: { name: 'p', rules: { hole_comp: { value: 'line / 4' } } } }), /p\.hole_comp is a number of 0 or more \(got "line \/ 4"\)/);
  assert.throws(() => hole('M3', {}), /an M3 clearance hole needs depth, the thickness it passes through/);
  assert.throws(() => hole('M3', { depth: 3, at: [0, 0] }), /at is a point on the part's face, \[x, y, z\]/);
});

test('seats: a counterbore hides its head with the printer\'s fit round it, and prints each way it goes in', () => {
  const c = counterboreModel('M3');
  assert.equal(c.head, 'cap'); assert.equal(c.diameter, 6, '5.5 and 0.2 each side and 0.1'); assert.equal(c.depth, 3); assert.equal(c.sunk, 0); assert.equal(c.hole, 3.5);
  assert.match(c.findings[0].text, /a counterbore for an M3 cap head drawn 6 mm across and 3 mm deep.*x1c\.fit 0\.2 mm each side and x1c\.hole_comp 0\.1 mm across; its top lies flush with the face/);
  const b = counterboreModel('M5x10 button'); assert.equal(b.head, 'button', 'the model\'s own head'); assert.equal(b.diameter, 10); assert.equal(b.depth, 2.8, '2.75 up to a whole layer'); assert.equal(b.sunk, 0.05);
  assert.equal(counterboreModel('M3', { head: 'button' }).diameter, 6.2);
  const h = counterboreModel('M6', { head: 'hex' }); near(h.diameter, 10 / Math.cos(Math.PI / 6) + 0.5, 1e-3, 'round a hexagon head\'s corners'); assert.ok(h.findings.some((f) => f.code === 'counterbore.socket'));
  assert.ok(!counterboreModel('M6', { head: 'hex', diameter: 18 }).findings.some((f) => f.code === 'counterbore.socket'));
  assert.throws(() => counterboreModel('K30'), /counterbore: PT K30 has no clearance in its rule set \(pt_k30\): a seat sits on a clearance hole/);
  assert.ok(counterboreModel('M3', { depth: 2 }).findings.some((f) => f.code === 'counterbore.proud' && /stands 1 mm proud/.test(f.text)));
  assert.ok(counterboreModel('M3', { diameter: 5 }).findings.some((f) => f.code === 'counterbore.diameter' && f.level === 'fail'));
  for (const [into, at, thick] of [['-z', [0, 0, 10], 10], ['+z', [0, 0, 0], 10], ['+x', [-15, 0, 6], 12], ['-y', [0, 15, 6], 12]]) {
    const cut = counterbore('M3', { length: into[1] === 'z' ? thick : 30, at, into }), part = subtract(block(thick), cut);
    prints(part, `a counterbore going ${into}`); passes(cut, 'counterbore.printable', into);
    assert.ok(vol(block(thick)) - vol(part) > (Math.PI / 4) * 6 ** 2 * 3, `${into}: the seat and its hole are out`);
  }
  assert.equal(counterboreModel('M3', { into: '+z' }).cone, 1.25, 'up from the bed the seat ends in a 45° cone to the hole');
  near(bb(counterbore('M3', { at: [0, 0, 10] }))[0][2], 7, 1e-9, 'with no length, the seat alone');
  assert.throws(() => counterboreModel('M3', { head: 'countersunk' }), /a countersunk head sits in a cone, not a counterbore: use countersink/);
  assert.throws(() => counterboreModel('M3', { head: 'set' }), /a set screw has no head to seat/);
  assert.throws(() => counterboreModel('M2', { head: 'button' }), /M2 is not made with a button head/);
  assert.throws(() => counterboreModel('M3', { length: 2 }), /length is the whole hole's, from the face it starts at: 2 mm is less than the seat's depth \(3 mm\)/);
  assert.throws(() => counterboreModel('M3', { hole: 'pilot' }), /hole is clearance, close or loose/);
});

test('seats: a countersink to the head\'s angle and sharp-edge diameter, 90° through shapes and an inch screw\'s 82° drawn here', () => {
  const c = countersinkModel('M3');
  assert.equal(c.diameter, 6.82, 'the 6.72 mm sharp-edge head and the compensation'); assert.equal(c.angle, 90); assert.equal(c.hole, 3.5); assert.equal(c.depth, 1.66); assert.equal(c.length, 1.66);
  const inch = countersinkModel('6-32'); assert.equal(inch.angle, 82); near(inch.depth, (inch.diameter - inch.hole) / 2 / Math.tan((41 * Math.PI) / 180), 1e-3, 'a steeper cone is deeper');
  for (const t of ['M3', '6-32']) for (const [into, at, thick] of [['-z', [0, 0, 10], 10], ['+z', [0, 0, 0], 10], ['+x', [-15, 0, 7], 14]]) {
    const cut = countersink(t, { length: into[1] === 'z' ? thick : 30, at, into }), part = subtract(block(thick), cut), m = countersinkModel(t);
    prints(part, `${t} countersunk going ${into}`); passes(cut, 'countersink.printable', `${t} ${into}`);
    if (into === '-z') { // the cone is as wide as the model says at the face, and narrows to the hole at its depth
      const at0 = (d, z) => vol(intersect(part, translate([0, 0, z], cylinder({ radius: d / 2, height: 0.02, segments: 64 }))));
      assert.ok(at0(m.diameter - 0.1, 9.98) < 1e-4, `${t}: open to its diameter at the face`); assert.ok(at0(m.diameter + 0.3, 9.98) > 0.01, `${t}: and no wider`);
      assert.ok(at0(m.hole + 0.3, 10 - m.depth - 0.05) > 0.01, `${t}: down to the hole at the cone's depth`); assert.ok(at0(m.hole + 0.3, 10 - m.depth + 0.3) < 1e-4, `${t}: the cone above it`);
    }
  }
  assert.throws(() => countersinkModel('M1.6'), /M1\.6 is not made with a countersunk head/);
  assert.throws(() => countersinkModel('M3', { length: 1 }), /less than the cone's depth/);
  assert.equal(countersinkModel('M3', {}).findings.filter((f) => f.code === 'countersink.drawn').length, 1);
});

test('seats: a nut pocket for M4 is what the lever bench draws by hand, and pockets, slots and closed pockets print for hex, square and lock nuts', () => {
  // examples/bench/projects/bench/objects/gauge-arm.json: nut4 = m4.nut_flats + x1c.hole_comp, nut4_h = m4.nut_height + x1c.layer * 2, hole4 = m4.clearance + x1c.hole_comp
  const m4 = json('../../examples/bench/rules/m4.json').rules, bx = json('../../examples/bench/rules/x1c.json').rules;
  const byHand = { flats: m4.nut_flats.value + bx.hole_comp.value, height: m4.nut_height.value + bx.layer.value * 2, hole: m4.clearance.value + bx.hole_comp.value };
  const p = nutPocketModel('M4');
  assert.deepEqual({ flats: p.flats, height: p.depth, hole: p.hole }, { flats: 7.1, height: 3.6, hole: 4.6 }); near(byHand.flats, p.flats, 1e-9, 'flats'); near(byHand.height, p.depth, 1e-9, 'depth'); near(byHand.hole, p.hole, 1e-9, 'hole');
  near(vol(nutPocket('M4', { at: [5, 6, 7], into: '-y' })), vol(shapesNutPocket({ ...byHand, at: [5, 6, 7], into: '-y' })), 1e-9, 'the same solid as the bench\'s own call');
  assert.deepEqual(bb(nutPocket('M4', { at: [5, 6, 7], into: '-y' })), bb(shapesNutPocket({ ...byHand, at: [5, 6, 7], into: '-y' })));
  assert.equal(nutPocketModel('M4', { fit: 'slip' }).flats, 7.2); assert.equal(nutPocketModel('M4', { fit: 'press' }).flats, 7.05); assert.equal(nutPocketModel('M4', { fit: 0.3 }).flats, 7.4);
  assert.equal(nutPocketModel('M4 lock nut').kind, 'lock', 'the model\'s own nut'); assert.equal(nutPocketModel('M4 lock nut').depth, 5.4);
  for (const kind of NUTS) {
    const through = (thick) => hole('M4', { depth: thick, at: [0, 0, thick] }), across = (thick) => hole('M4', { depth: 30, at: [15, 0, thick / 2], into: '-x' });
    for (const [into, at, thick] of [['-z', [0, 0, 10], 10], ['+z', [0, 0, 0], 12], ['-x', [15, 0, 8], 16]]) {
      const cut = nutPocket('M4', { kind, at, into });
      prints(subtract(block(thick), cut, into === '-x' ? across(thick) : through(thick)), `${kind} nut pocket going ${into}`); passes(cut, 'nutPocket.printable', `${kind} ${into}`);
    }
    // a slot from the side of a screw standing up, one dropped in from the top of a screw lying down, one from the side of it
    for (const [o, thick, screw] of [[{ depth: 15, at: [-15, 0, 6] }, 12, through], [{ axis: 'x', depth: 8, at: [0, 0, 16] }, 16, across], [{ axis: 'x', into: '+y', depth: 15, at: [0, -15, 8] }, 16, across]]) {
      const cut = nutTrap('M4', { kind, ...o });
      prints(subtract(block(thick), cut, screw(thick)), `${kind} nut slot, screw along ${cut.model.axis}, in from ${cut.model.into}`); passes(cut, 'nutTrap.printable', kind);
    }
    const closedIn = captiveNut('M4', { kind, at: [0, 0, 4] });
    prints(subtract(block(14), closedIn, through(14)), `${kind} nut closed in the part`); passes(closedIn, 'captiveNut.printable', kind);
    // the nut itself fits each: nothing of it in the part
    const fits = (part, at, turn = (g) => g) => assert.ok(vol(intersect(part, translate(at, turn(nut('M4', { kind }))))) < 0.02, `the ${kind} nut goes in`);
    const h = nutModel('M4', { kind }).height;
    fits(subtract(block(10), nutPocket('M4', { kind, at: [0, 0, 10] }), through(10)), [0, 0, 10 - h]);
    fits(subtract(block(12), nutTrap('M4', { kind, depth: 15, at: [-15, 0, 6] }), through(12)), [0, 0, 6 - h / 2]);
    fits(subtract(block(14), closedIn, through(14)), [0, 0, 4]);
  }
});

test('seats: a nut slot\'s roof bridges or rises, a square nut slot drops in from the top, and a closed pocket says where to pause', () => {
  const t = nutTrapModel('M4', { depth: 15 });
  assert.equal(t.width, 7.2, '7 and the compensation and the printer\'s slip'); assert.equal(t.gap, 3.6, '3.4 up to an even number of layers'); assert.equal(t.axis, 'z'); assert.equal(t.into, '+x');
  near(t.reach, 15 + 7.2 / (2 * Math.cos(Math.PI / 6)), 1e-3, 'in past the axis by the nut\'s corner'); assert.equal(t.span, 7.2); assert.equal(t.rise, 1.1, 'wider than the 5 mm bridge: up at 45° to a 5 mm flat');
  assert.ok(t.findings.some((f) => f.code === 'nutTrap.side'), 'and which side the screw comes from is said');
  const m3 = nutTrapModel('M3', { depth: 10, kind: 'square', printer: { bridge: 8 } }); assert.equal(m3.rise, 0, 'within a longer bridge: flat');
  const s = squareNutSlotModel('M3', { depth: 6 });
  assert.equal(s.kind, 'square'); assert.equal(s.axis, 'x'); assert.equal(s.into, '-z'); assert.equal(s.width, 5.7); assert.equal(s.gap, 2, '1.8 and 0.1 and 0.1'); assert.equal(s.reach, 8.85); assert.equal(s.span, 0);
  const slot = squareNutSlot('M3', { depth: 6, at: [0, 0, 12] }), [lo, hi] = bb(slot);
  near(hi[0] - lo[0], 2, 1e-9, 'thin along the screw'); near(hi[1] - lo[1], 5.7, 1e-9, 'across the flats'); near(lo[2], 12 - 8.85, 1e-9, 'down past the axis by half the nut');
  prints(subtract(block(12), slot, hole('M3', { depth: 30, at: [15, 0, 6], into: '-x' })), 'a square nut slot'); passes(slot, 'nutTrap.printable', 'square slot');
  near(bb(squareNutSlot('M3', { axis: 'y', depth: 6, at: [0, 0, 12] }))[1][1] * 2, 2, 1e-9, 'across a screw lying along y');
  const c = captiveNutModel('M4', { at: [0, 0, 4] });
  assert.equal(c.height, 3.4, 'the nut and a layer'); assert.equal(c.pause, 7.4); assert.equal(c.layer, 37); near(c.top, 7.4 + c.roof, 1e-9, 'the roof closes above the pause');
  assert.match(c.findings.find((f) => f.code === 'captiveNut.pause').text, /pause the print at z = 7\.4 mm, once layer 37 is down \(0\.2 mm layers, the bed at z = 0\), drop the M4 nut in/);
  assert.equal(captiveNutModel('M4', { at: [0, 0, 4], printer: { layer: 0.1 } }).layer, 73, 'at another layer height');
  assert.throws(() => nutTrapModel('M4', {}), /depth \(from the face to the screw's axis\) is a number above 0/);
  assert.throws(() => nutTrapModel('M4', { depth: 8, axis: 'x', into: '+x' }), /the nut slides in across the screw, so into is square to axis/);
  assert.throws(() => nutTrapModel('M4', { depth: 8, axis: 'x', into: '+z' }), /a slot open to the bed/);
  assert.throws(() => squareNutSlotModel('M12', { depth: 8 }), /squareNutSlot: M12 has no square nut/);
  assert.throws(() => nutPocketModel('M4', { kind: 'wing' }), /kind is hex, square or lock/);
  assert.throws(() => nutPocketModel('M4', { fit: 'tight' }), /fit is snug \(no clearance once printed\), slip or press \(the printer's\), or a clearance in mm/);
  assert.throws(() => nutPocketModel('M2', { kind: 'lock' }), /M2 has no lock nut/);
});

test('seats: an insert boss takes its hole, depth and least wall from the insert\'s rules, and is refused where the part is thinner', () => {
  const b = insertBossModel('M3');
  assert.deepEqual({ hole: b.hole, depth: b.depth, outer: b.outer, wall: b.wall, least: b.least, height: b.height, through: b.through }, { hole: 4, depth: 6.7, outer: 7.2, wall: 1.6, least: 1.6, height: 6.8, through: false });
  assert.match(b.findings[0].text, /m3\.insert_hole, as drawn \(no hole compensation\), with 1\.6 mm of wall where m3\.insert_wall asks 1\.6 mm/);
  assert.equal(insertBossModel('M3', { outer: 10 }).wall, 3); assert.equal(insertBossModel('M3', { wall: 2 }).outer, 8);
  assert.throws(() => insertBossModel('M3', { outer: 6 }), /insertBoss: 1 mm of wall round an M3 insert's 4 mm hole is thinner than the insert allows: m3\.insert_wall asks 1\.6 mm, so a boss 7\.2 mm across or more/);
  assert.throws(() => insertBossModel('M3', { wall: 1.2 }), /thinner than the insert allows/);
  assert.throws(() => insertBossModel('M3', { height: 4 }), /the part is 4 mm thick there and an M3 insert 5\.7 mm long \(m3\.insert_length\): it would stand proud/);
  assert.throws(() => insertBossModel('M3', { outer: 8, wall: 2 }), /give outer .* or wall .*, not both/);
  assert.throws(() => insertBossModel('M12'), /M12 has no heat-set insert/);
  assert.ok(insertBossModel('M3', { height: 6 }).findings.some((f) => f.code === 'insertBoss.depth' && /runs 0\.7 mm on under the boss's foot/.test(f.text)));
  assert.equal(insertBossModel('M3', { height: 6, through: true }).depth, 6);
  assert.equal(insertBossModel('M3x3 insert').depth, 4, 'a shorter insert, from its variant');
  const { boss, hole: cut, model } = insertBoss('M3', { at: [0, 0, 3] }), part = subtract(union(block(3), boss), cut);
  near(bb(boss)[1][2], 9.8, 1e-9, 'standing on the plate'); near(bb(boss)[1][0], 3.6 + 0.4, 1e-9, 'flared at its foot by the printer\'s chamfer'); near(bb(cut)[0][2], 9.8 - 6.7, 1e-9, 'the hole from its top');
  prints(part, 'a boss on a plate'); passes(model, 'insertBoss.printable', 'boss');
  assert.ok(vol(intersect(part, translate([0, 0, 9.8], insert('M3')))) > 0.5, 'the insert is wider than its hole: it melts in');
  assert.ok(vol(intersect(part, translate([0, 0, 9.8], cylinder({ radius: 1.95, height: 13, segments: 32 })))) < 1e-3, 'and the hole is there to its depth');
});

test('printable: a fixing is bought; a hole or a seat says how it prints', () => {
  const f = printable(fixingModel('M3x12 cap'));
  assert.equal(f[0].level, 'fail'); assert.equal(f[0].code, 'fixing.printable'); assert.match(f[0].text, /an M3 screw is bought and fitted, not printed/);
  for (const model of [holeModel('M3'), counterboreModel('M3'), countersinkModel('M3'), nutPocketModel('M3'), nutTrapModel('M3', { depth: 8 }), squareNutSlotModel('M3', { depth: 8 }), captiveNutModel('M3'), insertBossModel('M3')]) {
    const p = printable(model); assert.equal(p.length, 1); assert.equal(p[0].level, 'pass'); assert.ok(p[0].text.length > 20);
    for (const x of model.findings) { assert.ok(['pass', 'info', 'warn', 'fail'].includes(x.level)); assert.ok(x.text && x.code, 'a finding in the kit\'s one shape'); }
    for (const r of model.rests) { assert.ok(r.name && r.kind && r.source, `what it rests on: ${JSON.stringify(r)}`); }
  }
  assert.throws(() => printable(3), /give a fixing's model, or a hole's or seat's/);
  // a long hexagon's flat on top, past the printer's bridge, is a warning
  assert.equal(printable(nutPocketModel('M12', { into: '+x' }))[0].level, 'warn');
  assert.equal(printable(countersinkModel('M3', { into: '+z', printer: { overhang: 40 } }))[0].level, 'warn');
});

test('hardware: an M3x12 cap screw is under 100 triangles, sits in its counterbore with its head flush, and says its mass', () => {
  const s = screw('M3x12 cap'), m = s.model;
  assert.equal(tris(s).length, 96); assert.ok(tris(s).length < 100);
  assert.deepEqual(bb(s), [[-2.75, -2.75, -12], [2.75, 2.75, 3]]);
  near(vol(s), 12 * 3 * 1.5 ** 2 + 12 * 0.25 * 3 * 2.75 ** 2, 1e-6, 'two twelve-sided prisms: the thread at 3 mm, the head at 5.5');
  assert.deepEqual(m.anchors, { seat: { origin: [0, 0, 0], axis: [0, 0, 1] }, tip: { origin: [0, 0, -12], axis: [0, 0, -1] }, axis: { origin: [0, 0, 0], axis: [0, 0, 1] }, top: { origin: [0, 0, 3], axis: [0, 0, 1] } });
  // its mass: the thread at its pitch diameter and the head as a plain cylinder, at steel's density
  const d2 = 3 - ((3 * Math.sqrt(3)) / 8) * 0.5, grams = (((Math.PI / 4) * d2 ** 2 * 12 + (Math.PI / 4) * 5.5 ** 2 * 3) * 7.85) / 1000;
  near(m.mass, grams, 1e-3, 'grams'); near(m.mass, 1.09, 0.01, 'about 1.1 g'); assert.equal(m.material, 'steel');
  assert.match(m.findings[0].text, /M3x12 cap: 1\.089 g of steel/); assert.equal(m.findings[0].code, 'fixing.mass'); assert.ok(m.rests.some((r) => r.name === 'fixings.steel_density' && r.value === 7.85 && /EN 1991/.test(r.source)));
  near(screwModel('M3x12 cap', { material: 'stainless' }).mass / m.mass, 8 / 7.85, 1e-3, 'stainless is a little heavier');
  // in a 10 mm plate with a counterbore from Fixings 1.5: placed by its seat anchor on the seat's floor, its head ends flush and nothing of it is in the plate
  const c = counterboreModel('M3'), plate = subtract(block(10), counterbore('M3', { length: 10, at: [0, 0, 10] })), placed = translate([0, 0, 10 - c.depth - m.anchors.seat.origin[2]], s);
  near(bb(placed)[1][2], 10, 1e-9, 'the head\'s top is flush with the plate\'s face'); assert.equal(c.sunk, 0);
  assert.ok(vol(intersect(plate, placed)) < 1e-6, 'and it touches nothing');
  assert.ok(vol(intersect(subtract(block(10), counterbore('M3', { length: 10, at: [0, 0, 10], depth: 2.8, diameter: 5.4 })), placed)) > 0.1, 'a seat too small would be seen');
});

test('hardware: every head form, nut, washer and insert is a closed light solid at its rule set\'s sizes, with anchors and a mass', () => {
  // [name, triangles at most, x, y, low, high]
  for (const [name, most, x, low, high] of [['M3x12 cap', 96, 5.5, -12, 3], ['M5x10 button', 120, 9.5, -10, 2.75], ['M4x8 countersunk', 72, 8.96, -8, 0], ['M3x4 set', 48, 3, -4, 0], ['K30x10 pan', 96, 5.3, -10, 2], ['1/4-20 x 1/2 cap', 96, 9.525, -12.7, 6.35], ['M6x20 hex', 120, 10 / Math.cos(Math.PI / 6), -20, 4]]) {
    const s = screw(name), [lo, hi] = bb(s), n = tris(s).length;
    assert.ok(n <= most, `${name}: ${n} triangles`); near(hi[0] - lo[0], x, 1e-3, `${name} across`); near(lo[2], low, 1e-9, `${name} tip`); near(hi[2], high, 1e-9, `${name} top`);
    closed(s, name); assert.ok(s.model.mass > 0, name); near(s.model.anchors.tip.origin[2], low, 1e-9, name); near(s.model.anchors.top.origin[2], high, 1e-9, name); assert.equal(s.model.name, fixingModel(name).name);
  }
  assert.equal(screwModel('M3', { length: 16, head: 'button' }).name, 'M3x16 button', 'a thread with a length and a head');
  assert.equal(screwModel('M3x12 cap', { length: 20 }).length, 20, 'or a model with another length');
  // a countersunk screw is measured overall: its head lies in the countersink, flush
  const csk = screw('M4x8 countersunk'), sink = subtract(block(8), countersink('M4', { length: 8, at: [0, 0, 8] }));
  assert.ok(vol(intersect(sink, translate([0, 0, 8], csk))) < 1e-6, 'a flat head in its countersink');
  for (const [name, flats, height] of [['M3 nut', 5.5, 2.4], ['M3 square nut', 5.5, 1.8], ['M3 lock nut', 5.5, 4], ['1/4-20 nut', 11.113, 5.74]]) {
    const n = nut(name), [lo, hi] = bb(n); assert.ok(tris(n).length <= 100, `${name}: ${tris(n).length} triangles`); closed(n, name);
    near(Math.min(hi[0] - lo[0], hi[1] - lo[1]), flats, 0.01, `${name} across the flats`); near(hi[2] - lo[2], height, 0.01, `${name} height`); near(lo[2], 0, 1e-9, name);
    assert.deepEqual(n.model.anchors.top, { origin: [0, 0, n.model.height], axis: [0, 0, 1] }); assert.ok(n.model.mass > 0);
  }
  near(nutModel('M3 nut').mass, 0.39, 0.02, 'an M3 nut is about 0.4 g'); assert.equal(nutModel('M4', { kind: 'lock' }).name, 'M4 lock nut');
  const w = washer('M3'), [wl, wh] = bb(w); near(wh[0] - wl[0], 7, 1e-9, 'washer across'); near(wh[2], 0.5, 1e-9, 'washer thick'); closed(w, 'washer'); assert.equal(tris(w).length, 96); near(w.model.mass, 0.12, 0.01, 'an M3 washer is about 0.12 g');
  const i = insert('M3'), [il, ih] = bb(i); near(ih[0] - il[0], 4.6, 1e-9, 'insert over its knurls'); near(il[2], -5.7, 1e-9, 'it hangs from the mouth of its hole'); near(ih[2], 0, 1e-9, 'flush'); closed(i, 'insert');
  assert.equal(i.model.material, 'brass'); assert.match(i.model.findings[0].text, /the alloy is assumed/); assert.equal(insertModel('M3x3 insert').length, 3); assert.deepEqual(i.model.anchors.bottom, { origin: [0, 0, -5.7], axis: [0, 0, -1] });
  // a screw passes through its nut, washer and insert with nothing touching, however the nut is turned
  const bolt = translate([0, 0, 8], screw('M3x12 cap'));
  for (const [what, g] of [['nut', nut('M3')], ['nut turned', jscad.transforms.rotateZ(0.2, nut('M3'))], ['washer', washer('M3')], ['insert', translate([0, 0, 6], insert('M3'))]]) assert.ok(vol(intersect(bolt, g)) < 1e-6, `the screw in its ${what}`);
  assert.throws(() => screwModel('M3'), /screw: give a length, in the name \('M3x12 cap'\) or as \{ length: 12 \}/);
  assert.throws(() => screwModel('M3', { length: 14 }), /not sold 14 mm long/); assert.equal(screwModel('M3', { length: 14, anyLength: true }).sold, false);
  assert.throws(() => screwModel('M3 nut'), /M3 hex nut is a nut, not a screw: use nut\(\)/);
  assert.throws(() => nutModel('M3x12 cap'), /M3x12 cap is a screw, not a nut/);
  assert.throws(() => screwModel('M3x12 cap', { material: 'brass' }), /material is steel or stainless/);
  assert.throws(() => washerModel('K30'), /PT K30 has no washer/); assert.throws(() => insertModel('M12'), /M12 has no heat-set insert/);
  assert.equal(washerModel('M3 washer').thickness, 0.5); assert.ok(rotateY, 'used above');
});

test('the rules this package adds say what they are and where they come from', () => {
  for (const [k, d] of Object.entries(DEFAULTS)) { assert.ok(d.rule && d.kind && d.source && d.unit, k); assert.ok(typeof d.value === 'number', k); }
  near(DEFAULTS.pitch_diameter.value, 0.649519, 1e-6, 'a 60° thread\'s pitch diameter'); assert.equal(DEFAULTS.steel_density.value, json('../rules/s275.json').rules.density.value);
  assert.equal(DEFAULTS.brass_density.kind, 'estimate'); assert.equal(DEFAULTS.nut_sink.value, 2);
});

test('fixingsFor: a workspace\'s rule sets and printer in hand, so a design names a thread and gets its own project\'s figures', () => {
  const own = json('../rules/m3.json'); own.rules.clearance = { ...own.rules.clearance, value: 3.3, kind: 'measured', source: 'this workspace' };
  const mk4 = { name: 'mk4', rules: { hole_comp: { value: 0.2, unit: 'mm', kind: 'measured', source: 'a test print' }, fit: { value: 0.15, unit: 'mm', kind: 'measured', source: 'a test print' } } };
  const f = fixingsFor({ sets: { m3: own, mk4 }, printer: mk4 });
  assert.equal(f.fixingModel('M3').figures.clearance.value, 3.3); assert.equal(f.holeModel('M3').diameter, 3.5, '3.3 and 0.2');
  assert.equal(f.hole('M3', { depth: 4 }).model.diameter, 3.5); assert.equal(f.counterboreModel('M3').diameter, 6, '5.5 and 0.15 each side and 0.2');
  assert.equal(f.holeModel('M3', { printer: { hole_comp: 0 } }).diameter, 3.3, 'a printer given to one call wins');
  assert.equal(f.holeModel('M4').diameter, 4.7, 'a thread the workspace has no set for is the kit\'s');
  assert.equal(tris(f.screw('M3x12 cap')).length, 96); assert.equal(f.nutModel('M3').flats, 5.5); assert.equal(f.status.release, 'ready');
  const plain = fixingsFor(); assert.equal(plain.holeModel('M3').diameter, 3.5); assert.equal(plain.holeModel('M3', { kind: 'pilot' }).basis.kind, 'measured');
  for (const k of Object.keys(fixings).filter((n) => typeof fixings[n] === 'function' && !['fixingsFor', 'parseName', 'threads'].includes(n))) assert.equal(typeof f[k], 'function', `${k} is bound`);
  let joins = 0; const counted = fixingsFor({ ops: { union: (...a) => { joins++; return union(...a); }, subtract } });
  counted.screw('M6x20 hex'); assert.equal(joins, 1, 'the design\'s booleans join a hexagon head to its thread');
});
