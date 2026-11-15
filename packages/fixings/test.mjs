import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import jscad from '@jscad/modeling';
import * as fixings from '@rulecad/fixings';
import { check } from '@rulecad/printcheck';
import { nutPocket as shapesNutPocket } from '@rulecad/shapes';

const { fixingModel, parseName, threads, GRAMMAR, HEADS, NUTS, DEFAULTS, holeModel, hole, HOLE_KINDS, counterboreModel, counterbore, countersinkModel, countersink, nutPocketModel, nutPocket,
  nutTrapModel, nutTrap, squareNutSlotModel, squareNutSlot, captiveNutModel, captiveNut, insertBossModel, insertBoss, printable, screwModel, screw, nutModel, nut, washerModel, washer, insertModel, insert, fixingsFor,
  threadModel, thread, THREAD_FORMS, engagement, stripping, preload, torqueFor, seating, lengthFor, screwGroup, screwLoad, MATERIALS, MATERIAL_CLASSES, ENDS } = fixings;
const { measureBoundingBox: bb, measureVolume: vol } = jscad.measurements, { geom3 } = jscad.geometries, { subtract, union, intersect } = jscad.booleans;
const { cuboid, cylinder } = jscad.primitives, { translate, rotateX, rotateY } = jscad.transforms;
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
  assert.throws(() => fixingModel(json('../rules/m3.json')), (e) => /give a name, not \{"_doc"/.test(e.message) && e.message.length < 400, 'a rule set handed in where the name goes is not printed back whole');
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
  assert.throws(() => holeModel('M3', { kind: 'thread' }), /hole: M3 has a 0\.5 mm pitch, finer than x1c prints.*The smallest metric thread that would print is M6.*use a pilot.*an insert, or a nut/);
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
  assert.throws(() => printable(3), /printable: give a fixing's model, or a hole's, a seat's or a thread's/);
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

// ---------- threads cut for printing (Fixings 1.7) ----------
// Every edge of a closed solid is walked once each way
const sealed = (g, what) => {
  const key = (p) => p.map((x) => x.toFixed(6)).join(','), edges = new Map();
  for (const t of tris(g)) for (let i = 0; i < 3; i++) { const e = `${key(t[i])}>${key(t[(i + 1) % 3])}`; edges.set(e, (edges.get(e) ?? 0) + 1); }
  for (const [e, n] of edges) { const [p, q] = e.split('>'); assert.equal(n, 1, `${what}: an edge walked twice the same way`); assert.equal(edges.get(`${q}>${p}`), 1, `${what}: an edge with no face on its other side`); }
  assert.ok(vol(g) > 0, `${what}: faces point outwards`);
};
// The steepest a face overhangs from upright, in degrees, with z up (flat undersides on the bed left out)
const steepest = (g, floor = 1e-6) => Math.max(...tris(g).map(([p, q, r]) => {
  const u = q.map((x, k) => x - p[k]), v = r.map((x, k) => x - p[k]), n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], len = Math.hypot(...n);
  return len < 1e-9 || Math.max(p[2], q[2], r[2]) < floor || n[2] >= 0 ? 0 : (Math.asin(-n[2] / len) * 180) / Math.PI;
}));
// Heights as where they fall within a pitch, to compare one column's crests with another's
const within = (zs, P, shift = 0) => [...new Set(zs.map((z) => ((((z + shift) % P) + P + 1e-7) % P).toFixed(4)))].sort();
// The heights of a thread's crest corners on the column at an angle round the axis, away from its ends
const crests = (g, R, degrees, from, to) => [...new Set(tris(g).flat().filter((p) => Math.abs(Math.hypot(p[0], p[1]) - R) < 1e-6 && Math.abs(Math.atan2(p[1], p[0]) - (degrees * Math.PI) / 180) < 1e-6 && p[2] > from && p[2] < to).map((p) => p[2].toFixed(6)))].map(Number).sort((x, y) => x - y);

test('threads: an M10 bolt and its nut report a clearance from the printer\'s rules, are closed solids, pass printcheck upright, and screw together', () => {
  const bolt = screw('M10x30 hex', { display: 'thread' }), fits = nut('M10', { display: 'thread' }), b = bolt.model.threaded, n = fits.model.threaded;
  // the clearance is the printer's rule, an estimate, and each of a printed pair takes half of it
  for (const t of [b, n]) {
    assert.equal(t.clearance, x1c.rules.thread_gap.value); assert.equal(t.clearance, 0.2); assert.equal(t.gap, 0.1); assert.equal(t.mate, 'printed');
    const r = t.rests.find((x) => x.name === 'x1c.thread_gap'); assert.equal(r.kind, 'estimate'); assert.match(r.source, /fixings coupon/);
    const f = t.findings.find((x) => x.code === 'thread.clearance'); assert.equal(f.level, 'info'); assert.deepEqual(f.refs, { rule: 'x1c.thread_gap', kind: 'estimate', mate: 'printed' });
    assert.match(f.text, /0\.2 mm between this thread and its mate, on the radius: x1c\.thread_gap, an estimate until the fixings coupon measures it\. A printed pair takes half each, so this one is drawn 0\.1 mm off the basic profile/);
  }
  assert.match(x1c.rules.thread_gap.rule, /fixings coupon|printed pair/); assert.equal(x1c.rules.thread_gap.kind, 'estimate');
  assert.equal(b.internal, false); assert.equal(n.internal, true); assert.equal(n.comp, 0.1, 'an internal thread is a printed hole: the compensation is added as well');
  assert.deepEqual(b.drawn, { major: 9.364, minor: 8.176 }); assert.deepEqual(n.drawn, { major: 10.3, minor: 8.874 });
  // closed, and printable: the bolt standing on its head, the nut as it stands
  const standing = translate([0, 0, bolt.model.headHeight], rotateX(Math.PI, bolt));
  sealed(bolt, 'the bolt'); sealed(fits, 'the nut'); prints(standing, 'an M10 bolt standing on its head'); prints(fits, 'an M10 nut');
  assert.ok(steepest(standing) <= 45.5, `no face of the bolt overhangs past 45°: ${steepest(standing)}`); assert.ok(steepest(fits) <= 45.5, `nor of the nut: ${steepest(fits)}`);
  near(bb(standing)[1][2], 30 + 6.4, 1e-9, 'a 30 mm thread on a 6.4 mm head'); near(bb(fits)[1][2], 8.4, 1e-9, 'the nut\'s height');
  near(bb(standing)[1][0] * 2, 16 / Math.cos(Math.PI / 6), 1e-3, 'the hexagon head over its corners');
  for (const t of [b, n]) { assert.equal(printable(t)[0].code, 'thread.printable'); assert.equal(printable(t)[0].level, 'pass'); }
  assert.equal(printable(bolt)[0].code, 'thread.printable', 'a screw with its thread drawn says how it prints');
  // the nut runs on the bolt: nothing of one in the other where their threads are in step, and a clash half a pitch out
  assert.ok(vol(intersect(bolt, translate([0, 0, -15], fits))) < 1e-6, 'the nut on the bolt, ten turns up');
  assert.ok(vol(intersect(bolt, translate([0, 0, -15.75], fits))) > 1, 'half a pitch out of step, the teeth would clash');
  // triangles: bounded by the model's figure, and the light solids stay light unless the thread is asked for
  assert.ok(tris(bolt).length <= b.triangles + 200, `${tris(bolt).length} against ${b.triangles}`); assert.ok(tris(fits).length <= n.triangles + 200);
  assert.ok(tris(screw('M10x30 hex')).length < 100); assert.equal(screwModel('M10x30 hex').display, 'plain'); assert.equal(screwModel('M10x30 hex').threaded, null);
});

test('threads: the ISO metric and unified profile from the major diameter and the pitch, and the pitch and lead measured from the mesh', () => {
  // the standard's own form, with no gap: ISO 68-1's basic profile
  const basic = threadModel('M10', { length: 20, flanks: 'standard', gap: 0 }), H = (Math.sqrt(3) / 2) * 1.5;
  assert.deepEqual(basic.basic, { major: 10, pitch: 9.026, minor: 8.376 }); assert.deepEqual(basic.drawn, { major: 10, minor: 8.376 });
  near(basic.depth, (5 / 8) * H, 1e-3, 'a tooth is five eighths of the triangle high'); near(basic.crest, 1.5 / 8, 1e-3, 'a crest an eighth of the pitch wide'); near(basic.basic.pitch, 10 - 2 * (3 / 8) * H, 1e-3, 'pitch diameter');
  assert.deepEqual(basic.flank, { up: 30, down: 30 }); assert.equal(basic.findings.find((f) => f.code === 'thread.printable').level, 'warn', 'and its 60° overhang is said');
  assert.match(basic.findings.find((f) => f.code === 'thread.printable').text, /overhangs 60° from upright where it faces down, past x1c\.overhang 45°/);
  const inch = threadModel('1/4-20', { length: 12, flanks: 'standard', gap: 0 }); assert.equal(inch.form, 'unified'); near(inch.basic.minor, 6.35 - 1.082532 * 1.27, 1e-3, '1/4-20 minor'); near(inch.basic.pitch, 6.35 - 0.649519 * 1.27, 1e-3, '1/4-20 pitch diameter');
  assert.equal(threadModel('M10', { length: 20, pitch: 1.25 }).thread, 'M10x1.25', 'a fine pitch on the same diameter');
  // as printed on the X1C: the down-facing flank laid back to the overhang, the tooth lower for it
  const t = threadModel('M10', { length: 20 });
  assert.deepEqual(t.flank, { up: 30, down: 45 }); assert.deepEqual(t.overhang, { standard: 60, drawn: 45, limit: 45 });
  near(t.depth, (0.75 * 1.5 - 1.5 / 8) / (Math.tan(Math.PI / 6) + 1), 1e-3, 'what is left of a tooth 0.75 P wide at its root under a P/8 crest'); assert.equal(t.standardDepth, 0.812);
  assert.match(t.findings.find((f) => f.code === 'thread.printable').text, /a 60° overhang from upright where it faces down, past x1c\.overhang 45°\. The down-facing flank is laid back to 45° about the tooth's root/);
  assert.equal(threadModel('M10', { length: 20, printer: { overhang: 60 } }).flank.down, 30, 'a printer that lays 60° keeps the standard\'s form');
  assert.ok(t.overlap > 0 && t.overlap < t.standardOverlap); assert.match(t.findings.find((f) => f.code === 'thread.overlap').text, /overlap a printed mate drawn the same way by 0\.246 mm on the radius, where the standard's overlap 0\.812 mm/);
  assert.equal(threadModel('M10', { length: 20, mate: 'bought' }).gap, 0.2, 'for a bought mate this thread takes the whole gap'); assert.equal(threadModel('M10', { length: 20, gap: 0.3 }).clearance, 0.3);
  // measured from the mesh: crests a pitch apart, a quarter of the lead on in a quarter turn, the other way for a left hand
  const g = thread('M10', { length: 20 }), R = t.drawn.major / 2, at0 = crests(g, R, 0, 2, 18), at90 = crests(g, R, 90, 2, 18);
  sealed(g, 'an M10 thread'); prints(g, 'an M10 thread standing on its end'); assert.ok(steepest(g) <= 45.5, `flanks within the overhang: ${steepest(g)}`);
  assert.ok(at0.length >= 16, 'two corners to a crest'); for (let i = 2; i < at0.length; i++) near(at0[i] - at0[i - 2], 1.5, 1e-6, 'the pitch, crest to crest');
  assert.deepEqual(within(at90, 1.5), within(at0, 1.5, 1.5 / 4), 'a right-hand thread climbs a quarter of its lead in a quarter turn');
  const left = thread('M10', { length: 20, hand: 'left' }); assert.deepEqual(within(crests(left, R, 90, 2, 18), 1.5), within(crests(left, R, 0, 2, 18), 1.5, -1.5 / 4), 'a left-hand thread falls by it'); sealed(left, 'left hand'); near(vol(left), vol(g), 0.5, 'the same solid, mirrored');
  const two = thread('M10', { length: 20, starts: 2 }), c0 = crests(two, R, 0, 2, 18), c90 = crests(two, R, 90, 2, 18);
  assert.equal(two.model.lead, 3); near(c0[2] - c0[0], 1.5, 1e-6, 'two starts: still a pitch from crest to crest'); assert.deepEqual(within(c90, 1.5), within(c0, 1.5, 3 / 4), 'and twice the climb'); sealed(two, 'two starts'); prints(two, 'a two-start thread');
  assert.ok(steepest(thread('M10', { length: 20, flanks: 'standard' })) > 55, 'the standard\'s form does overhang 60°');
  // each end has a lead-in: the first layer is a plain circle at the root, and the thread grows out of a cone
  const foot = tris(g).flat().filter((p) => Math.abs(p[2]) < 1e-9 && Math.hypot(p[0], p[1]) > 1e-6); for (const p of foot) near(Math.hypot(p[0], p[1]), t.drawn.minor / 2, 1e-6, 'the foot is round');
  assert.equal(t.leadIn, t.depth); assert.equal(t.run, t.leadIn, 'a 45° cone'); near(bb(g)[1][2], 20, 1e-9, 'its length'); near(bb(g)[1][0], R, 1e-6, 'its crests');
  // the count of triangles is bounded by the faces round, and a plain cylinder is there for a viewer
  assert.ok(tris(g).length <= t.triangles, `${tris(g).length} within ${t.triangles}`); const coarse = thread('M10', { length: 20, segments: 24 }); assert.ok(tris(coarse).length <= coarse.model.triangles && tris(coarse).length < 0.55 * tris(g).length); sealed(coarse, '24 round');
  const plain = thread('M10', { length: 20, display: 'plain' }); assert.ok(tris(plain).length <= plain.model.triangles); assert.ok(tris(plain).length <= 8 * 48); near(bb(plain)[1][0], R, 1e-6, 'plain: a cylinder at the crests'); sealed(plain, 'plain');
  assert.deepEqual(THREAD_FORMS, ['metric', 'unified', 'trapezoidal']);
});

test('threads: the T8 lead screw\'s trapezoidal thread, four starts as its rule set says, and its nut drawn and printable', () => {
  const screwSet = json('../rules/t8-screw.json'), nutSet = json('../rules/t8-nut.json');
  // ISO 2904's basic sizes, which the catalogue's own rules were worked from
  const basic = threadModel('T8', { length: 20, flanks: 'standard', gap: 0 });
  assert.equal(basic.form, 'trapezoidal'); assert.equal(basic.thread, 'Tr8x8(P2)'); assert.equal(basic.starts, screwSet.rules.starts.value); assert.equal(basic.starts, 4); assert.equal(basic.lead, screwSet.rules.lead.value); assert.equal(basic.pitch, 2);
  assert.deepEqual(basic.basic, { major: 8, pitch: screwSet.rules.pitch_diameter.value, minor: screwSet.rules.root_diameter.value }); assert.deepEqual(basic.flank, { up: 15, down: 15 });
  near(basic.crest, 2 * (0.5 - 0.5 * Math.tan(Math.PI / 12)), 1e-3, 'a crest 0.366 of the pitch wide'); assert.equal(basic.depth, 1.25, 'h3 = 0.5 P + ac');
  assert.ok(basic.rests.some((r) => r.name === 't8-screw.thread' && r.kind === 'community')); assert.ok(basic.rests.some((r) => r.name === 't8-screw.starts'));
  assert.deepEqual(threadModel('T8', { length: 20, internal: true, flanks: 'standard', gap: 0, printer: { hole_comp: 0 } }).basic, { major: 8.5, pitch: 7, minor: 6 }, 'the nut: D4 = d + 2 ac, D1 = d - P');
  // by its designation, by the nut's own rule set, and a variant of the screw's
  assert.equal(threadModel('Tr8x8(P2)', { length: 20 }).starts, 4); assert.equal(threadModel('tr8x2', { length: 20 }).starts, 1); assert.equal(threadModel('Tr8x4(P2)LH', { length: 20 }).hand, 'left');
  const byNut = threadModel(nutSet, { length: nutSet.rules.length.value, internal: true, mate: 'bought' });
  assert.equal(byNut.starts, 4); assert.equal(byNut.thread, 'Tr8x8(P2)'); assert.equal(byNut.gap, 0.2, 'on a bought screw the nut takes the whole gap'); assert.ok(byNut.rests.some((r) => r.name === 't8-nut.thread'));
  assert.equal(threadModel(screwSet, { length: 20, variant: 'lead-2' }).starts, 1); assert.equal(threadModel(screwSet, { length: 20, variant: 'lead-4' }).lead, 4);
  assert.deepEqual(byNut.overhang, { standard: 75, drawn: 45, limit: 45 }); assert.ok(byNut.overlap > 0.3, `the nut still overlaps a bought screw: ${byNut.overlap}`);
  // the nut: the catalogue's round body with the thread cut through it
  const L = nutSet.rules.length.value, body = translate([0, 0, L / 2], cylinder({ radius: nutSet.rules.body_diameter.value / 2 + 2, height: L, segments: 48 })), cut = thread(nutSet, { length: L, internal: true, mate: 'bought' });
  sealed(cut, 'the T8 cutter'); const made = subtract(body, cut); prints(made, 'a printed T8 nut');
  assert.ok(vol(intersect(made, translate([0, 0, L / 2], cylinder({ radius: byNut.drawn.minor / 2 - 0.02, height: L + 2, segments: 64 })))) < 1e-6, 'open to its crests');
  assert.ok(vol(intersect(made, translate([0, 0, L / 2], cylinder({ radius: 4, height: L - 4, segments: 64 })))) > 5, 'and the screw\'s 8 mm would meet its teeth');
  // four starts measured from the cutter: at one angle a crest every pitch, and an eighth of a turn on, half a pitch higher (an eighth of the 8 mm lead)
  const R = byNut.drawn.major / 2, c0 = crests(cut, R, 0, 3, 12), c45 = crests(cut, R, 45, 3, 12);
  near(c0[2] - c0[0], 2, 1e-6, 'the pitch'); assert.deepEqual(within(c45, 2), within(c0, 2, 1), 'a lead of 8 mm: 1 mm in an eighth of a turn'); assert.notDeepEqual(within(c45, 2), within(c0, 2), 'which one start would not give');
  const rod = thread('Tr8x2', { length: 20 }); sealed(rod, 'a Tr8x2 screw'); prints(rod, 'a printed Tr8x2 screw'); assert.ok(steepest(rod) <= 45.5);
  assert.throws(() => threadModel('Tr8x3(P2)', { length: 10 }), /the lead a whole number of pitches: Tr8x2, Tr8x8\(P2\) \(got a lead of 3 mm on a 2 mm pitch\)/);
  assert.throws(() => threadModel('Tr60x14', { length: 60 }), /a trapezoidal pitch of 14 mm is outside the crest clearances this package holds \(ISO 2904, pitches from 1\.5 to 12 mm\)/);
  assert.equal(threadModel({ form: 'trapezoidal', diameter: 60, pitch: 14, ac: 1 }, { length: 60 }).basic.minor, 44, 'with its own crest clearance');
  assert.throws(() => threadModel(json('../rules/nema17.json'), { length: 10 }), /nema17 names no trapezoidal thread/);
  assert.throws(() => threadModel(screwSet, { length: 20, variant: 'lead-3' }), /t8-screw has no variant "lead-3" \(lead-2, lead-4\)/);
});

test('threads refused by name: a pitch finer than the printer resolves, with the size that would print; on its side with no flat; and what is not a thread', () => {
  assert.throws(() => threadModel('M3', { length: 10 }), /threadModel: M3 has a 0\.5 mm pitch, finer than x1c prints: a thread needs 5 layers to a pitch \(1 mm at x1c\.layer 0\.2 mm\) and a tooth a line deep \(a pitch of 0\.776 mm at x1c\.line 0\.42 mm\)\. The smallest metric thread that would print is M6 \(1 mm pitch\)\. For M3 use a pilot the screw forms its own thread in, an insert, or a nut/);
  for (const small of ['M1.6', 'M2', 'M2.5', 'M3', 'M4', 'M5', '4-40', '6-32', '8-32']) assert.throws(() => threadModel(small, { length: 10 }), /finer than x1c prints/, small);
  for (const big of ['M6', 'M8', 'M10', 'M12', '10-24', '1/4-20', '5/16-18', '3/8-16']) assert.equal(threadModel(big, { length: 12 }).kind, 'thread', big);
  assert.throws(() => threadModel('6-32', { length: 10 }), /The smallest unified thread that would print is 10-24 UNC/);
  // a finer layer resolves a finer thread, and then the line's width decides
  assert.throws(() => threadModel('M4', { length: 10, printer: { layer: 0.1 } }), /a pitch of 0\.776 mm at x1c\.line 0\.42 mm\)\. The smallest metric thread that would print is M5 \(0\.8 mm pitch\)/);
  assert.equal(threadModel('M5', { length: 10, printer: { layer: 0.1 } }).pitch, 0.8);
  assert.throws(() => threadModel('M10', { length: 20, pitch: 0.75 }), /M10x0\.75 has a 0\.75 mm pitch, finer than x1c prints/);
  assert.throws(() => screwModel('M3x12 cap', { display: 'thread' }), /screw: M3 has a 0\.5 mm pitch, finer than x1c prints/);
  // on its side
  assert.throws(() => threadModel('M10', { length: 20, axis: 'x' }), /a thread lying on its side \(axis x\) has its lower half hanging over the bed.*Stand it up \(axis z\), or give \{ flat: true \}: a flat along the thread for it to lie on/);
  assert.throws(() => holeModel('M10', { kind: 'thread', into: '+x' }), /hole: a thread lying on its side \(axis x\) has the crests of its top turns hanging in the hole.*a pointed roof over the hole, as a teardrop has/);
  assert.throws(() => threadModel('M10', { length: 20, flat: true }), /flat is for a thread lying on its side/);
  // and the rest, by name
  assert.throws(() => threadModel('K30', { length: 10 }), /PT K30 is a thread-forming screw for plastic.*no thread to print/);
  assert.throws(() => threadModel('M7', { length: 10 }), /no thread "M7"/);
  assert.throws(() => threadModel(7, { length: 10 }), /threadModel: give a thread: a fixing's name or model \('M10', '1\/4-20'\), a trapezoidal thread/);
  assert.throws(() => threadModel('M10'), /give a length, the thread's along its axis/); assert.throws(() => threadModel('M10', 20), /the second argument is its options/);
  assert.throws(() => threadModel('M10', { length: -5 }), /length is a number above 0/); assert.throws(() => threadModel('M10', { length: 2 }), /an M10 thread 2 mm long is shorter than its two lead-ins and one pitch \(2\.689 mm\)|shorter than its two lead-ins/);
  assert.throws(() => threadModel('M10', { length: 20, hand: 'both' }), /hand is right or left/); assert.throws(() => threadModel('M10', { length: 20, starts: 1.5 }), /starts is how many threads run side by side, a whole number/);
  assert.throws(() => threadModel('M10', { length: 20, segments: 50 }), /segments is how many faces go round, a multiple of 4 from 12 to 144/); assert.throws(() => threadModel('M10', { length: 20, display: 'pretty' }), /display is thread or plain/);
  assert.throws(() => threadModel('M10', { length: 20, internal: 'yes' }), /internal is true/); assert.throws(() => threadModel('M10', { length: 20, gap: -0.1 }), /gap is the gap between this thread and its mate on the radius, 0 mm or more/);
  assert.throws(() => threadModel('M10', { length: 20, mate: 'steel' }), /mate is printed or bought/); assert.throws(() => threadModel('M10', { length: 20, flanks: 'sharp' }), /flanks is printed or standard/);
  assert.throws(() => threadModel({ form: 'whitworth', diameter: 10, pitch: 1.5 }, { length: 20 }), /form is metric, unified or trapezoidal/);
  assert.throws(() => nutModel('M10', { display: 'real' }), /nut: display is plain or thread/);
  // another printer with no thread_gap borrows the X1C's, and says so
  const other = threadModel('M10', { length: 20, printer: { name: 'mk4', rules: {} } }); assert.ok(other.findings.some((f) => f.code === 'thread.printer' && /mk4 has no thread_gap: the X1C's 0\.2 mm is used/.test(f.text)));
});

test('threads in a part: hole kind thread going down, through, up from the bed, and on its side with a roof; a thread lying on a flat', () => {
  const part = (cut) => subtract(translate([0, 0, 10], cuboid({ size: [24, 24, 20] })), cut), pin = (d, lo, hi, turn = (g) => g) => turn(translate([0, 0, (lo + hi) / 2], cylinder({ radius: d / 2, height: hi - lo, segments: 64 })));
  const h = holeModel('M10', { kind: 'thread', depth: 12 });
  assert.equal(h.kind, 'thread'); assert.equal(h.diameter, 10.3); assert.equal(h.nominal, 10); assert.equal(h.depth, 12); assert.equal(h.through, false); assert.equal(h.threaded.internal, true); assert.equal(h.threaded.length, 12);
  assert.equal(holeModel('M10', { kind: 'thread', mate: 'bought' }).diameter, 10.5, 'for a bought screw: the whole gap'); assert.equal(holeModel('M10', { kind: 'thread' }).depth, 25, '2.5 diameters of thread in plastic');
  assert.ok(holeModel('M10', { kind: 'thread', depth: 8 }).findings.some((f) => f.code === 'hole.depth' && /engagement\.plastic asks 25 mm of thread/.test(f.text)));
  assert.match(h.findings.find((f) => f.code === 'hole.drawn').text, /an M10 threaded hole drawn 10\.3 mm over its roots: it rests on m10\.major_diameter \(10 mm\)/); passes(h, 'thread.printable', 'a threaded hole');
  for (const [what, o, clear] of [['down, blind', { depth: 12, at: [0, 0, 20] }, [8.2, 20.5]], ['down, through', { depth: 20, through: true, at: [0, 0, 20] }, [-0.5, 20.5]], ['up from the bed, blind', { depth: 10, into: '+z', at: [0, 0, 0] }, [-0.5, 9.5]]]) {
    const cut = hole('M10', { kind: 'thread', ...o }), made = part(cut);
    prints(made, `a threaded hole ${what}`); assert.ok(vol(made) < 24 * 24 * 20 - 300, what);
    assert.ok(vol(intersect(made, pin(cut.model.threaded.drawn.minor - 0.05, ...clear))) < 1e-6, `${what}: open to its crests`); assert.ok(vol(intersect(made, pin(10, ...clear))) > 5, `${what}: with teeth for a 10 mm screw`);
  }
  assert.equal(holeModel('M10', { kind: 'thread', depth: 10, into: '+z' }).point, 4.437, 'up from the bed it ends in a 45° point, as a blind hole does');
  near(bb(hole('M10', { kind: 'thread', depth: 10, into: '+z' }))[1][2], 10 + 4.437, 1e-6, 'the point past the thread');
  const side = hole('M10', { kind: 'thread', depth: 24, through: true, into: '+x', flat: true, at: [-12, 0, 10] });
  prints(part(side), 'a threaded hole on its side, with its roof'); near(bb(side)[1][2] - 10, (10.3 / 2) * Math.SQRT2, 1e-3, 'a roof to a point, as a teardrop\'s'); assert.equal(side.model.threaded.engaged, 0.75);
  assert.equal(side.model.threaded.flank.down, 30, 'on its side the flanks face sideways and keep the standard\'s angle');
  const lying = thread('M10', { length: 20, axis: 'x', flat: true }), [lo, hi] = bb(lying);
  sealed(lying, 'a thread lying on its flat'); prints(translate([0, 0, -lo[2]], lying), 'a thread lying on its flat'); near(-lo[2], lying.model.flat, 1e-9, 'the flat, from the axis'); near(hi[0] - lo[0], 20, 1e-9, 'along x'); near(hi[2], 4.9, 1e-6, 'its crests above');
  near(bb(thread('M10', { length: 20, axis: 'y', flat: true }))[1][1], 20, 1e-9, 'or along y');
  // a viewer's plain cylinder, by the call or for a whole workspace
  const quick = hole('M10', { kind: 'thread', depth: 12, display: 'plain', at: [0, 0, 20] }); assert.ok(tris(quick).length <= 8 * 48); near(bb(quick)[0][2], 8, 1e-9, 'plain: the bore to its depth');
  const light = fixingsFor({ display: 'plain' }); assert.equal(light.threadModel('M10', { length: 20 }).display, 'plain'); assert.equal(light.hole('M10', { kind: 'thread', depth: 12 }).model.threaded.display, 'plain'); assert.equal(light.thread('M10', { length: 20, display: 'thread' }).model.display, 'thread', 'unless asked');
  assert.equal(light.holeModel('M3').diameter, 3.5, 'and other holes are as they were');
});

// ---------- strength and length (Fixings 1.8) ----------
test('engagement: threads engaged against the rule for what they are in, with the depth that would do', () => {
  // By hand: M3 is 3 mm with a 0.5 mm pitch. 6 mm of it is 6 / 0.5 = 12 threads, 6 / 3 = 2 diameters.
  // engagement.plastic asks 2.5 diameters = 7.5 mm (short); engagement.aluminium 2 = 6 mm (just enough); engagement.steel 1 = 3 mm.
  const rules = json('../rules/engagement.json').rules, e = engagement('M3', { depth: 6, material: 'pla' });
  assert.deepEqual({ depth: e.depth, need: e.need, turns: e.turns, diameters: e.diameters, class: e.class, material: e.material, enough: e.enough }, { depth: 6, need: 7.5, turns: 12, diameters: 2, class: 'plastic', material: 'pla', enough: false });
  assert.equal(e.need, rules.plastic.value * 3); assert.equal(e.findings[0].level, 'warn'); assert.equal(e.findings[0].code, 'engagement.depth');
  assert.match(e.findings[0].text, /an M3 screw 6 mm into pla \(a plastic\) engages 12 threads, 2 diameters: engagement\.plastic asks 2\.5 \(7\.5 mm\), so 7\.5 mm would do/);
  assert.deepEqual(e.findings[0].values, { depth: 6, need: 7.5, turns: 12 }); assert.ok(e.rests.some((r) => r.name === 'engagement.plastic' && r.kind === 'community'));
  const al = engagement('M3', { depth: 6, material: 'al6061' }); assert.equal(al.class, 'aluminium'); assert.equal(al.need, 6); assert.equal(al.enough, true); assert.equal(al.findings[0].level, 'pass');
  assert.equal(engagement('M3', { depth: 6, material: 'steel' }).need, 3, 'a class by name'); assert.equal(engagement('M3', { depth: 6, material: 's275' }).class, 'steel'); assert.equal(engagement('M3', { depth: 6, material: 'PETG' }).class, 'plastic');
  assert.equal(engagement('1/4-20', { depth: 12.7, material: 'aluminium' }).need, 12.7, 'two diameters of 6.35 mm');
  assert.deepEqual(MATERIALS, ['pla', 'petg', 'al6061', 'al7075', 's275', 'ss304']); assert.deepEqual(MATERIAL_CLASSES, ['plastic', 'aluminium', 'steel']);
  assert.throws(() => engagement('M3', { depth: 0, material: 'pla' }), /engagement: depth is a number above 0/); assert.throws(() => engagement('M3', { depth: -2, material: 'pla' }), /depth is a number above 0/);
  assert.throws(() => engagement('M3', { depth: 6 }), /engagement: give a material: a class \(plastic, aluminium, steel\) or a material \(pla, petg, al6061, al7075, s275, ss304\)/);
  assert.throws(() => engagement('M3', { depth: 6, material: 'nylon' }), /engagement: no material "nylon"\. There are: pla, petg, al6061, al7075, s275, ss304\. For another, hand in its rule set/);
  assert.throws(() => engagement('M7', { depth: 6, material: 'pla' }), /no thread "M7"/); assert.throws(() => engagement('M3', 6), /the second argument is its options/);
});

test('stripping: an M3 screw 6 mm into PLA strips at the hand-worked load, against its own proof load', () => {
  // By hand, an M3 screw (d = 3 mm, P = 0.5 mm, class 8.8) 6 mm into PLA (tensile strength 39 MPa):
  //   shear area of the internal thread, at basic sizes: pi n Le d [1/(2n) + 0.57735 (d - d2)] with n = 1/P and d - d2 = 0.6495 P
  //     = pi d Le (0.5 + 0.375) = 0.875 x pi x 3 x 6                       = 49.480 mm²
  //   shear strength, an estimate: 39 / sqrt(3)                             = 22.517 MPa
  //   load that strips the thread: 22.517 x 49.480                          = 1114.1 N
  //   the screw's stress area: 0.7854 x (3 - 0.9382 x 0.5)² = 0.7854 x 2.5309² = 5.031 mm²
  //   its proof load: 5.031 x 580                                           = 2917.9 N
  //   margin: 1114.1 / 2917.9 = 0.38, so the thread goes first; 6 / 0.3818 = 15.7 mm of thread would match the screw
  const pla = json('../rules/pla.json').rules, m3 = json('../rules/m3.json').rules, s = stripping('M3', { depth: 6, material: 'PLA' });
  const area = 0.875 * Math.PI * 3 * 6, shear = pla.strength.value / Math.sqrt(3), strip = shear * area, At = (Math.PI / 4) * (3 - 0.9382 * 0.5) ** 2, proof = At * m3.proof_stress.value;
  near(area, 49.48, 0.001, 'the hand\'s area'); near(shear, 22.517, 0.001, 'the hand\'s shear strength'); near(strip, 1114.1, 0.05, 'the hand\'s load'); near(At, 5.031, 0.001, 'the hand\'s stress area'); near(proof, 2917.9, 0.1, 'the hand\'s proof load');
  assert.equal(s.area, 49.48); assert.equal(s.shear, 22.52); assert.equal(s.strip, 1114.1); assert.equal(s.stressArea, 5.03); assert.equal(s.proof, 2917.9); assert.equal(s.margin, 0.38); assert.equal(s.depthFor, 15.7);
  near(s.strip, strip, 0.05, 'against the sum'); near(s.margin, strip / proof, 0.005, 'the margin');
  const [load, margin] = s.findings; assert.equal(load.code, 'stripping.load'); assert.equal(margin.code, 'stripping.margin'); assert.equal(margin.level, 'info');
  assert.match(load.text, /an M3 screw 6 mm into pla strips its thread at about 1114\.1 N: a shear area of 49\.48 mm² \(0\.875 π d Le\) at 22\.52 MPa, 39 MPa over √3.*The shear strength is an estimate from the tensile strength/);
  assert.match(load.text, /pla has no strength across its layers, strength_z: the strength along them is used/); assert.equal(load.refs.kind, 'estimate');
  assert.match(margin.text, /the thread strips before the screw yields: 1114\.1 N is 0\.38 of the screw's proof load, 2917\.9 N \(class 8\.8, 5\.03 mm² at 580 MPa\)\. 15\.7 mm of thread would match the screw/);
  const ratio = s.rests.find((r) => r.name === 'fixings.shear_ratio'); assert.equal(ratio.kind, 'estimate'); assert.match(ratio.source, /von Mises/); assert.ok(s.rests.some((r) => r.name === 'pla.strength')); assert.ok(s.rests.some((r) => r.name === 'm3.proof_stress' && r.kind === 'spec'));
  // PETG's set has a strength across the layers, and the weaker way is taken: 23 / sqrt(3) x 49.48 = 657.0 N
  const petg = stripping('M3', { depth: 6, material: 'petg', load: 300 }); near(petg.strip, (23 / Math.sqrt(3)) * area, 0.05, 'PETG, across its layers'); assert.ok(petg.rests.some((r) => r.name === 'petg.strength_z'));
  // a load is held with twice the margin: 657 / 300 = 2.19 passes, 657 / 400 = 1.64 warns, 657 / 700 fails
  assert.equal(petg.findings.find((f) => f.code === 'stripping.held').level, 'pass'); assert.equal(stripping('M3', { depth: 6, material: 'petg', load: 400 }).findings.at(-1).level, 'warn'); assert.equal(stripping('M3', { depth: 6, material: 'petg', load: 700 }).findings.at(-1).level, 'fail');
  // in aluminium the screw goes first: 276 / sqrt(3) x 49.48 = 7884.6 N, 2.7 times its proof load
  const al = stripping('M3', { depth: 6, material: 'al6061' }); assert.equal(al.strip, 7884.6); assert.equal(al.margin, 2.7); assert.equal(al.findings[1].level, 'pass');
  // a stainless screw (A2-70, 450 MPa), another class by its proof stress, and a material of your own
  near(stripping('M3', { depth: 6, material: 'pla', screw: 'stainless' }).proof, At * 450, 0.1, 'A2-70'); near(stripping('M3', { depth: 6, material: 'pla', proof: 830 }).proof, At * 830, 0.1, 'class 10.9 by its proof stress');
  const abs = { name: 'abs', rules: { strength: { value: 30, unit: 'MPa', kind: 'community', source: 'a data sheet' }, modulus: { value: 2200, unit: 'MPa', kind: 'community', source: 'a data sheet' } } };
  near(stripping('M3', { depth: 6, material: abs }).strip, (30 / Math.sqrt(3)) * area, 0.05, 'a rule set handed in'); near(stripping('M3', { depth: 6, material: 'abs', sets: { abs } }).strip, (30 / Math.sqrt(3)) * area, 0.05, 'or found in the workspace\'s sets');
  near(stripping('1/4-20', { depth: 10, material: 'pla' }).stressArea, (Math.PI / 4) * (6.35 - 0.9743 * 1.27) ** 2, 0.01, 'an inch thread\'s stress area');
  assert.throws(() => stripping('M3', { depth: 6, material: 'nylon' }), /stripping: no material "nylon"/); assert.throws(() => stripping('M3', { depth: 6 }), /stripping: give a material/);
  assert.throws(() => stripping('M3', { depth: -1, material: 'pla' }), /depth is a number above 0/); assert.throws(() => stripping('K30', { depth: 6, material: 'pla' }), /PT K30 is a thread-forming screw for plastic, with no property class/);
  assert.throws(() => stripping('M3', { depth: 6, material: { name: 'mystery', rules: { modulus: { value: 2000 } } } }), /mystery has no strength in its rule set/); assert.throws(() => stripping('M3', { depth: 6, material: 'pla', screw: 'brass' }), /screw is steel or stainless/);
  assert.throws(() => stripping('M3', { depth: 6, material: 'pla', load: 0 }), /load \(in N\) is a number above 0/);
});

test('preload: the clamp force from a tightening torque and the torque for a force, T = K d F, with K an estimate', () => {
  // By hand, M3 (d = 3 mm), K = 0.2:  F = T / (K d) = 0.5 N·m x 1000 / (0.2 x 3 mm) = 833.3 N, which is 833.3 / 2917.9 = 28.6% of proof.
  // The other way: three quarters of proof is 0.75 x 2917.9 = 2188.4 N, and T = 0.2 x 3 x 2188.4 / 1000 = 1.313 N·m.
  const p = preload('M3', { torque: 0.5 });
  assert.deepEqual({ torque: p.torque, force: p.force, K: p.K, proof: p.proof, share: p.share, full: p.full }, { torque: 0.5, force: 833.3, K: 0.2, proof: 2917.9, share: 0.286, full: { force: 2188.4, torque: 1.313 } });
  assert.match(p.findings[0].text, /0\.5 N·m on an M3 screw gives a clamp force of about 833\.3 N \(T = K d F, K = 0\.2, an estimate/); assert.equal(p.findings[0].refs.kind, 'estimate'); assert.equal(p.findings[1].level, 'pass');
  const k = p.rests.find((r) => r.name === 'fixings.nut_factor'); assert.equal(k.kind, 'estimate'); assert.match(k.source, /Bolted joint/);
  const back = torqueFor('M3', { force: 2188.4 }); assert.equal(back.torque, 1.313); assert.equal(back.share, 0.75); assert.equal(preload('M3', { force: 833.3 }).torque, 0.5, 'and back again');
  assert.equal(preload('M3', { torque: 0.5, K: 0.15 }).force, 1111.1, 'a lubricated thread: 500 / (0.15 x 3)'); assert.ok(!preload('M3', { torque: 0.5, K: 0.15 }).rests.some((r) => r.name === 'fixings.nut_factor'));
  assert.equal(preload('M3', { torque: 1.7 }).findings[1].level, 'warn', '2833 N: past 90% of proof'); assert.equal(preload('M3', { torque: 2 }).findings[1].level, 'fail', '3333 N: the screw yields');
  near(preload('M10', { torque: 40 }).force, 40000 / (0.2 * 10), 0.1, 'M10 at 40 N·m: 20 kN');
  assert.throws(() => preload('M3', {}), /preload: give torque \(N·m\), to get the clamp force, or force \(N\), to get the torque for it: one of the two/); assert.throws(() => preload('M3', { torque: 1, force: 100 }), /one of the two/);
  assert.throws(() => preload('M3', { torque: -1 }), /torque \(in N·m\) is a number above 0/); assert.throws(() => preload('M3', { torque: 1, K: 0 }), /K is the nut factor, a number above 0/); assert.throws(() => torqueFor('M3', { torque: 1 }), /torqueFor: give force/);
});

test('seating: the pressure under a head against what it sits on, and the washer that brings it within', () => {
  // By hand, an M3 cap head (5.5 mm) on its clearance hole as drawn on the X1C (3.4 + 0.1 = 3.5 mm):
  //   bearing ring: pi/4 x (5.5² - 3.5²) = pi/4 x 18 = 14.137 mm²;  under the M3 washer (7 mm): pi/4 x (49 - 12.25) = 28.863 mm²
  //   tightened fully (2188.4 N): 2188.4 / 14.137 = 154.8 MPa, and 75.8 MPa on the washer: both past PLA's 39 MPa
  //   the most the seat takes: 39 x 14.137 = 551.3 N bare (0.2 x 3 x 551.3 / 1000 = 0.331 N·m), 39 x 28.863 = 1125.7 N on the washer (0.675 N·m)
  //   at 0.5 N·m (833.3 N): 58.9 MPa bare, too much; 28.9 MPa on the washer, within
  const full = seating('M3x10 cap', { material: 'pla' });
  assert.deepEqual({ head: full.head, force: full.force, area: full.area, pressure: full.pressure, limit: full.limit, within: full.within }, { head: 'cap', force: 2188.4, area: 14.14, pressure: 154.8, limit: 39, within: false });
  assert.deepEqual(full.washer, { diameter: 7, area: 28.86, pressure: 75.8, within: false }); assert.deepEqual(full.most, { force: 551.3, torque: 0.331, washerForce: 1125.7, washerTorque: 0.675 });
  near(full.area, (Math.PI / 4) * (5.5 ** 2 - 3.5 ** 2), 0.005, 'the ring'); assert.equal(full.findings[0].level, 'fail'); assert.equal(full.findings[0].code, 'seating.pressure');
  assert.match(full.findings[0].text, /an M3 cap head, 5\.5 mm across on a 3\.5 mm hole, bears on 14\.14 mm²: at 2188\.4 N, a screw tightened fully \(75% of its proof load\), 154\.8 MPa on pla, whose strength is 39 MPa.*an estimate\): too much, and the M3 washer, 7 mm across, only brings it to 75\.8 MPa\. The seat takes 551\.3 N bare \(0\.331 N·m\) and 1125\.7 N on the washer \(0\.675 N·m\)/);
  const half = seating('M3', { material: 'pla', torque: 0.5 }); assert.equal(half.pressure, 58.9); assert.equal(half.findings[0].level, 'warn'); assert.equal(half.washer.pressure, 28.9); assert.equal(half.washer.within, true);
  assert.match(half.findings[0].text, /too much for the bare seat\. The M3 washer, 7 mm across, brings it to 28\.9 MPa, within/);
  assert.equal(seating('M3', { material: 'pla', force: 300 }).findings[0].level, 'pass', '300 / 14.137 = 21.2 MPa'); assert.equal(seating('M3', { material: 'pla', force: 300 }).pressure, 21.2);
  assert.equal(seating('M3', { material: 'al6061' }).findings[0].level, 'pass', 'on aluminium a fully tightened M3 seats: 154.8 against 276 MPa');
  // other heads: a button head is wider, a hexagon head bears across its flats, and a close hole leaves more seat
  near(seating('M3', { head: 'button', material: 'pla', force: 300 }).area, (Math.PI / 4) * (5.7 ** 2 - 3.5 ** 2), 0.005, 'button'); near(seating('M6', { head: 'hex', material: 'pla', force: 300 }).area, (Math.PI / 4) * (10 ** 2 - 6.7 ** 2), 0.005, 'hexagon, across its flats');
  assert.ok(seating('M3', { material: 'pla', force: 300, hole: 'close' }).area > full.area); near(seating('M3', { material: 'pla', force: 300, printer: { hole_comp: 0.3 } }).area, (Math.PI / 4) * (5.5 ** 2 - 3.7 ** 2), 0.005, 'the hole as this printer draws it');
  assert.throws(() => seating('K30', { material: 'pla', force: 100 }), /PT K30 has no clearance in its rule set \(pt_k30\)/, 'a screw for plastic has no clearance hole in its rule set to seat on');
  assert.throws(() => seating('M3', { force: 300 }), /seating: give a material, what the thread is in or the head sits on/); assert.throws(() => seating('M3', { material: 'pla', head: 'set' }), /a set screw has no head to bear on anything/);
  assert.throws(() => seating('M2.5', { material: 'pla', head: 'button' }), /M2\.5 is not made with a button head/); assert.throws(() => seating('M3', { material: 'pla', force: 1, torque: 1 }), /give force \(N\) or torque \(N·m\), not both/);
  assert.throws(() => seating('M3', { material: 'pla', force: -5 }), /force \(in N\) is a number above 0/); assert.throws(() => seating('M3', { material: 'pla', hole: 'pilot' }), /hole is clearance, close or loose/);
});

test('screwGroup: a load shared between screws, across the joint by distance from the centroid and along it by a plane through the centroid', () => {
  // A NEMA 17's four screws on its 31 mm square under 0.283 N·m about the shaft: T / (4 r) each, r = 15.5 √2 mm, as the motor mount check works it
  const T = 0.28284271247461906, r = 15.5 * Math.SQRT2, nema = screwGroup([[-15.5, -15.5], [15.5, -15.5], [15.5, 15.5], [-15.5, 15.5]], { moment: [0, 0, T] });
  for (const sc of nema.screws) { near(sc.shear, (T * 1000) / (4 * r), 1e-3, 'torque shared'); assert.equal(sc.tension, 0); }
  near(nema.polar, 4 * r * r, 1e-6, 'Σ r²'); assert.deepEqual(nema.centroid, [0, 0]); assert.equal(nema.line, false); assert.ok(nema.rests.length === 2);
  // two screws 24 mm apart, 19.6 N pulling straight off over the right one: it takes it all (W/2 + W e x / Σx²), the other none
  const two = screwGroup([[-12, 0], [12, 0]], { force: [0, 0, 19.6133], at: [12, 0] });
  near(two.screws[1].tension, 19.613, 1e-3, 'the near screw'); near(two.screws[0].tension, 0, 1e-3, 'the far one'); assert.equal(two.line, true);
  // a force across the joint at the centroid is shared equally; lifted 10 mm off the face it tips the part towards the force, by the line's own spread when the moment is along it
  const across = screwGroup([[-12, 0], [12, 0]], { force: [10, 0, 0], at: [0, 0, 10] });
  for (const sc of across.screws) near(sc.shear, 5, 1e-9, 'shared equally'); near(across.screws[0].tension, 100 * 12 / 288, 1e-3, 'the heel lifts'); near(across.screws[1].tension, -100 * 12 / 288, 1e-3, 'the toe presses');
  // a moment about the line of screws: they cannot share it by tension, so the part tips about the edge `pivot` from the line, and each holds its share
  assert.throws(() => screwGroup([[-12, 0], [12, 0]], { force: [0, 10, 0], at: [0, 0, 10] }), /the screws stand in one line, and 0\.1 N·m tips the part about it: give pivot/);
  const tipped = screwGroup([[-12, 0], [12, 0]], { force: [0, 10, 0], at: [0, 0, 10], pivot: 5 }); for (const s of tipped.screws) near(s.tension, 100 / (2 * 5), 1e-3, 'tipped about an edge 5 mm off');
  // one screw: a twist it cannot hold by shear is said as turns
  assert.equal(screwGroup([[0, 0]], { moment: [0, 0, 0.1] }).turns, 0.1);
  assert.throws(() => screwGroup([], {}), /places lists each screw's \[x, y\]/); assert.throws(() => screwGroup([[0, 0]], { force: [1, 'a'] }), /force is \[x, y, z\] in numbers/);
});

test('screwLoad: a bracket with 2 kg on two M3 screws into PLA pilots holds 30.3 times its load, the thread first, as worked by hand', () => {
  // By hand: W = 2 kg × 9.80665 = 19.613 N, all on one screw (screwGroup above).
  // Thread: 0.875 π d Le = 0.875 π 3 × 5 = 41.233 mm², at 39 MPa (pla.strength) / √3 = 22.517 MPa: strips at 928.4 N.
  // Preload at 0.2 N·m: F = T / (K d) = 0.2 / (0.2 × 0.003) = 333.3 N (fixings.nut_factor 0.2).
  // Thread margin: (928.4 - 333.3) / 19.613 = 30.34. Screw: proof load (π/4)(3 - 0.9382 × 0.5)² × 580 = 2917.9 N, (2917.9 - 333.3) / 19.613 = 131.78.
  const W = 2 * 9.80665, l = screwLoad('M3', { tension: W, depth: 5, material: 'pla', torque: 0.2 });
  assert.equal(l.strip, 928.4); assert.equal(l.proof, 2917.9); assert.deepEqual(l.preload, { force: 333.3, torque: 0.2, given: true });
  near(l.margins.thread, (928.4 - 333.3) / W, 0.01, 'the thread'); near(l.margins.screw, (2917.9 - 333.3) / W, 0.01, 'the screw'); assert.equal(l.margin, l.margins.thread); assert.equal(l.governs, 'thread'); assert.equal(l.margins.slip, null);
  assert.equal(l.findings[0].level, 'pass'); assert.match(l.findings[0].text, /^an M3 screw with 19\.6 N of pull and 0 N of shear, clamped with 333\.3 N \(0\.2 N·m, T = K d F with K = 0\.2, an estimate\): its thread in pla strips at about 928\.4 N \(an estimate: 22\.52 MPa in shear\), 30\.34 times this pull over the preload; the screw yields at 131\.78 times it \(proof load 2917\.9 N\)\. It holds 30\.34 times the load, the thread first$/);
  for (const k of ['pla.strength', 'fixings.shear_ratio', 'fixings.load_margin', 'm3.proof_stress']) assert.ok(l.rests.some((r) => r.name === k), k);
  // no torque given: the most that leaves the thread twice the pull, within the seat's 550 N: the seat's, at 0.33 N·m; with 5 N of shear it slips 15 times short of it
  const free = screwLoad('M3', { tension: W, shear: 5, depth: 5, material: 'pla', most: 553 });
  assert.deepEqual(free.preload, { force: 550, torque: 0.33, given: false }); near(free.margins.slip, (0.3 * 550) / (5 + 0.3 * W), 0.01, 'μ F / (S + μ T)');
  assert.ok(free.rests.some((r) => r.name === 'fixings.clamp_friction' && r.kind === 'estimate')); assert.equal(free.findings[1].code, 'screwLoad.slip');
  // a heavy pull: the preload is held down to leave the thread twice it, and the torque said; past half the strip load it warns, past it fails
  const heavy = screwLoad('M3', { tension: 400, depth: 5, material: 'pla' }); assert.equal(heavy.preload.torque, 0.07); assert.ok(heavy.margin >= 2, heavy.margin);
  assert.equal(screwLoad('M3', { tension: 600, depth: 5, material: 'pla' }).findings[0].level, 'warn'); assert.equal(screwLoad('M3', { tension: 1000, depth: 5, material: 'pla' }).findings[0].level, 'fail');
  // shear and pull on the screw itself: von Mises on its stress area; in an insert or a nut the thread is not checked, and says why
  const nutted = screwLoad('M3', { tension: 1000, shear: 500, end: 'nut', torque: 1 }); assert.equal(nutted.margins.thread, null); assert.equal(nutted.governs, 'screw'); assert.match(nutted.findings[0].text, /in a steel nut, not checked here/);
  const Fp = nutted.preload.force; near(Math.hypot(Fp + nutted.margin * 1000, Math.sqrt(3) * nutted.margin * 500), 2917.9, 2917.9 * 0.01, 'at the margin the screw is at its proof load (the margin rounded to 0.01)');
  assert.match(screwLoad('M3', { tension: 10, end: 'insert' }).findings[0].text, /brass insert, whose hold in the plastic is its maker's figure/);
  assert.throws(() => screwLoad('M3', { tension: -1, shear: -1 }), /shear is a number of N, 0 or more/); assert.throws(() => screwLoad('M3', { end: 'glue' }), /end is insert or nut/);
});

test('lengthFor: M3x10 for a 6 mm plate into a 5.7 mm insert, M3x12 would bottom out; refused by name where no sold length fits', () => {
  // By hand: the M3 insert in the rule set is 5.7 mm long (m3.insert_length), and M3 cap screws are sold 5, 6, 8, 10, 12, 16 ... mm.
  // Through a 6 mm plate, a screw of length L goes L - 6 into the insert. It must engage a diameter, 3 mm, and has the insert's 5.7 mm of room.
  //   M3x8: 2 mm, short.   M3x10: 4 mm, fits, 1.7 mm to spare.   M3x12: 6 mm, more than 5.7: it would bottom out.
  const m3 = json('../rules/m3.json').rules; assert.equal(m3.insert_length.value, 5.7, 'the insert of the ticket\'s example is the rule set\'s');
  const l = lengthFor(6, 'M3', { into: 'insert' });
  assert.deepEqual({ name: l.name, length: l.length, head: l.head, grip: l.grip, engaged: l.engaged, need: l.need, room: l.room, spare: l.spare, into: l.into }, { name: 'M3x10 cap', length: 10, head: 'cap', grip: 6, engaged: 4, need: 3, room: 5.7, spare: 1.7, into: 'insert' });
  assert.deepEqual(l.lengths.map((x) => `${x.length} ${x.fits}`), ['5 short', '6 short', '8 short', '10 fits', '12 long', '16 long', '20 long', '25 long', '30 long']);
  const [chosen, longer, shorter] = l.findings; assert.equal(chosen.code, 'lengthFor.chosen'); assert.equal(chosen.level, 'pass'); assert.deepEqual(chosen.refs, { thread: 'M3', screw: 'M3x10 cap', into: 'insert' });
  assert.match(chosen.text, /M3x10 cap fits 6 mm of stack into an M3 insert 5\.7 mm long: it engages 4 mm where 3 mm is asked, with 1\.7 mm to spare before it would bottom out/);
  assert.equal(longer.code, 'lengthFor.longer'); assert.match(longer.text, /M3x12 cap would bottom out: 6 mm into 5\.7 mm of room/); assert.match(shorter.text, /M3x8 cap would engage 2 mm where 3 mm is asked/);
  assert.equal(fixingModel(l.name).sold, true, 'and what it names is a screw that is sold'); assert.ok(l.rests.some((r) => r.name === 'm3.insert_length')); assert.ok(l.rests.some((r) => r.name === 'fixings.insert_engagement' && r.kind === 'estimate'));
  // a stack of several parts, a washer under the head, a head sunk in a counterbore
  assert.equal(lengthFor([3, 3], 'M3', { into: 'insert' }).name, 'M3x10 cap'); assert.equal(lengthFor([3, 3], 'M3', { into: 'insert', washer: true }).grip, 6.5); assert.equal(lengthFor(9, 'M3', { into: 'insert', sunk: 3 }).name, 'M3x10 cap', '9 mm less a 3 mm counterbore');
  assert.equal(lengthFor(6, 'M3 button', { into: 'insert' }).name, 'M3x10 button', 'the model\'s head'); assert.equal(lengthFor(6, 'M3', { into: 'insert', head: 'countersunk' }).name, 'M3x10 countersunk');
  const stub = lengthFor(5, 'M3', { into: { kind: 'insert', length: 3 } }); assert.equal(stub.name, 'M3x8 cap', 'the 3 mm insert: all 3 mm of it engaged'); assert.equal(stub.spare, 0); assert.equal(stub.need, 3);
  assert.throws(() => lengthFor(4, 'M3', { into: { kind: 'insert', length: 3 } }), /into an M3 insert 3 mm long: M3x6 cap would engage 2 mm where 3 mm is asked, and M3x8 cap would bottom out: 4 mm into 3 mm of room/);
  // into a pilot the screw forms its own thread in: m3.pilot_depth asks 5 mm, so 6 + 5 = 11 and M3x12 is the first to do; the hole is drawn a millimetre past its tip
  const p = lengthFor(6, 'M3', { into: 'pilot' }); assert.equal(p.name, 'M3x12 cap'); assert.equal(p.engaged, 6); assert.equal(p.need, 5); assert.equal(p.room, null); assert.equal(p.depth, 7);
  assert.match(p.findings.find((f) => f.code === 'lengthFor.depth').text, /draw its blind hole 7 mm deep or more/);
  assert.equal(lengthFor(6, 'M3', { into: { kind: 'pilot', depth: 7.5 } }).spare, 0.5, 'in a hole 7.5 mm deep: 6 mm in, 1 mm kept at the tip, 0.5 to spare');
  // into a tapped hole in aluminium (2 diameters), a printed thread (2.5), and a nut (its whole height)
  assert.equal(lengthFor(5, 'M6', { into: { kind: 'tap', material: 'al6061' } }).name, 'M6x20 cap', '5 + 12 = 17, so 20'); assert.equal(lengthFor(5, 'M6', { into: { kind: 'tap', material: 'steel' } }).name, 'M6x12 cap', '5 + 6 = 11, so 12');
  assert.equal(lengthFor(5, 'M6', { into: 'thread' }).name, 'M6x20 cap'); assert.equal(lengthFor(5, 'M6', { into: { kind: 'tap', material: 'aluminium', through: true } }).depth, null, 'through: no blind hole to draw');
  const n = lengthFor(4, 'M4 button', { into: { kind: 'nut', nut: 'lock' }, washer: true }); assert.equal(n.name, 'M4x10 button'); assert.equal(n.grip, 4.8); assert.equal(n.need, 5, 'through the whole lock nut');
  assert.equal(lengthFor(8, 'M4', { into: { kind: 'nut', room: 4 } }).name, 'M4x12 cap', 'a nut in a 4 mm pocket: 3.2 mm of nut, 12 goes 4 in and ends flush');
  assert.deepEqual(ENDS, ['pilot', 'tap', 'thread', 'insert', 'nut']);
  // refused by name where no sold length fits, with the nearest
  assert.throws(() => lengthFor(3.6, 'M3', { into: { kind: 'pilot', depth: 6.5 } }), /lengthFor: no M3 cap screw that is sold fits 3\.6 mm of stack into a pilot it forms its own thread in 6\.5 mm deep: M3x8 cap would engage 4\.4 mm where 5 mm is asked, and M3x10 cap would bottom out: 6\.4 mm into 5\.5 mm of room \(the hole's 6\.5 mm less 1 mm at its tip\)\. The nearest is M3x8 cap: change the stack or the far end by 0\.6 mm/);
  assert.throws(() => lengthFor(9.5, 'M3', { into: 'insert' }), /no M3 cap screw that is sold fits 9\.5 mm of stack into an M3 insert 5\.7 mm long: M3x12 cap would engage 2\.5 mm where 3 mm is asked, and M3x16 cap would bottom out: 6\.5 mm into 5\.7 mm of room.*The nearest is M3x12 cap: change the stack or the far end by 0\.5 mm, or use a length of 12\.5 mm to 15\.2 mm from another list/);
  assert.throws(() => lengthFor(40, 'M3', { into: 'nut' }), /M3x30 cap does not reach through the 40 mm stack\. The nearest is M3x30 cap: change the stack or the far end by 12\.4 mm, or use a length of 42\.4 mm or more/);
  assert.throws(() => lengthFor(3, 'M3', { into: { kind: 'pilot', depth: 5 } }), /a pilot it forms its own thread in 5 mm deep leaves 4 mm of room for the screw.*where 5 mm of thread is asked: no length can do both\. Deepen the far end to 6 mm or more/);
  assert.throws(() => lengthFor(6, 'K30', { into: 'pilot' }), /PT K30 lists no lengths in its rule set \(pt_k30\), so none can be chosen: the length wanted is between 12 mm and as long as you like/);
  assert.throws(() => lengthFor(6, 'M3', {}), /lengthFor: give into, what the screw ends in: 'pilot', 'tap', 'thread', 'insert', 'nut'/); assert.throws(() => lengthFor(6, 'M3', { into: 'glue' }), /into is pilot, tap, thread, insert or nut/);
  assert.throws(() => lengthFor([], 'M3', { into: 'nut' }), /the stack is the thicknesses the screw passes through, each above 0 mm/); assert.throws(() => lengthFor([3, -1], 'M3', { into: 'nut' }), /each above 0 mm/); assert.throws(() => lengthFor(0, 'M3', { into: 'nut' }), /each above 0 mm/);
  assert.throws(() => lengthFor(6, 'M3 nut', { into: 'nut' }), /M3 hex nut is a nut, not a screw/); assert.throws(() => lengthFor(6, 'M3', { into: 'nut', head: 'set' }), /a set screw clamps nothing/);
  assert.throws(() => lengthFor(6, 'M12', { into: 'insert' }), /M12 has no heat-set insert/); assert.throws(() => lengthFor(6, 'M12', { into: { kind: 'nut', nut: 'square' } }), /M12 has no square nut/);
  assert.throws(() => lengthFor(3, 'M3', { into: 'insert', sunk: 5 }), /a seat sunk 5 mm is deeper than the 3 mm stack it is in/); assert.throws(() => lengthFor(6, 'M2.5', { into: 'nut', head: 'button' }), /M2\.5 is not made with a button head/);
  // bound to a workspace as the rest are
  assert.equal(fixingsFor().lengthFor(6, 'M3', { into: 'insert' }).name, 'M3x10 cap'); assert.equal(fixingsFor().stripping('M3', { depth: 6, material: 'pla' }).strip, 1114.1);
});

// ---------- refusals and printability across the package (Fixings 1.9) ----------
test('refused by name before any geometry: a pocket, a seat or a blind hole deeper than the part, and a depth of nothing or less', () => {
  // deeper than the part: each says what it is, how deep it goes and how thick the part is
  assert.throws(() => nutPocketModel('M4', { thickness: 3 }), /nutPocket: a pocket 3\.6 mm deep for an M4 nut goes 3\.6 mm into a part 3 mm thick there: it is deeper than the part, and would break out of its far face\. Make it shallower, or the part thicker/);
  assert.throws(() => nutPocket('M4', { thickness: 3, at: [0, 0, 3] }), /deeper than the part/, 'the solid is refused as its numbers are');
  assert.throws(() => nutPocketModel('M4', { into: '+z', thickness: 5 }), /a pocket 3\.6 mm deep for an M4 nut with its 1\.799 mm roof goes 5\.399 mm into a part 5 mm thick/);
  assert.throws(() => counterboreModel('M3', { thickness: 3 }), /counterbore: a seat 3 mm deep for an M3 cap head goes 3 mm into a part 3 mm thick there: it is deeper than the part/);
  assert.throws(() => counterboreModel('M3', { into: '+z', thickness: 4 }), /with its 1\.25 mm cone goes 4\.25 mm into a part 4 mm thick/);
  assert.throws(() => countersinkModel('M3', { thickness: 1.5 }), /countersink: a countersink 1\.66 mm deep for an M3 flat head goes 1\.66 mm into a part 1\.5 mm thick/);
  assert.throws(() => holeModel('M3', { kind: 'pilot', thickness: 4 }), /hole: a blind pilot 5 mm deep goes 5 mm into a part 4 mm thick there: it is deeper than the part/);
  assert.throws(() => holeModel('M3', { kind: 'insert', into: '+z', thickness: 8 }), /a blind insert hole 6\.7 mm deep with its 2 mm point goes 8\.7 mm into a part 8 mm thick/);
  assert.throws(() => holeModel('M10', { kind: 'thread', depth: 12, thickness: 10 }), /hole: a blind threaded hole 12 mm deep goes 12 mm into a part 10 mm thick there: it is deeper than the part/);
  assert.throws(() => captiveNutModel('M4', { at: [0, 0, 4], thickness: 8 }), /captiveNut: a closed pocket for an M4 nut from z = 4 mm ends its roof at z = 9\.257 mm, and the part is 8 mm high there: it is deeper than the part/);
  assert.throws(() => insertBossModel('M3', { height: 4 }), /the part is 4 mm thick there and an M3 insert 5\.7 mm long/);
  // and within the part, each is as it was: the thickness changes nothing but a through hole's depth
  assert.equal(nutPocketModel('M4', { thickness: 6 }).depth, 3.6); assert.equal(counterboreModel('M3', { thickness: 8 }).depth, 3); assert.equal(holeModel('M3', { kind: 'pilot', thickness: 8 }).depth, 5);
  assert.equal(holeModel('M3', { thickness: 6 }).depth, 6, 'a clearance hole through a part is as deep as the part'); near(bb(hole('M3', { thickness: 6, at: [0, 0, 6] }))[0][2], -0.1, 1e-9, 'and its solid runs out of the far face');
  assert.equal(holeModel('M10', { kind: 'thread', through: true, thickness: 12 }).depth, 12); assert.equal(captiveNutModel('M4', { at: [0, 0, 4], thickness: 12 }).pause, 7.4);
  // nothing, less than nothing, and what is not a number
  for (const [what, f] of [['hole depth', () => holeModel('M3', { depth: 0 })], ['hole thickness', () => holeModel('M3', { thickness: -6 })], ['counterbore depth', () => counterboreModel('M3', { depth: -1 })], ['counterbore diameter', () => counterboreModel('M3', { diameter: 0 })],
    ['counterbore thickness', () => counterboreModel('M3', { thickness: 0 })], ['pocket depth', () => nutPocketModel('M3', { depth: 0 })], ['slot depth', () => nutTrapModel('M3', { depth: -4 })], ['boss height', () => insertBossModel('M3', { height: 0 })],
    ['boss wall', () => insertBossModel('M3', { wall: -1 })], ['screw length', () => screwModel('M3', { length: 0 })], ['thread length', () => threadModel('M10', { length: 0 })], ['engagement depth', () => engagement('M3', { depth: 0, material: 'pla' })],
    ['stripping depth', () => stripping('M3', { depth: -6, material: 'pla' })], ['a stack', () => lengthFor(-6, 'M3', { into: 'insert' })], ['a depth as text', () => holeModel('M3', { depth: '6' })]]) assert.throws(f, /is a number above 0|each above 0 mm/, what);
  // every function that takes a fixing refuses an unknown thread, and what is no fixing, by name
  const every = { holeModel, hole, counterboreModel, counterbore, countersinkModel, countersink, nutPocketModel, nutPocket, nutTrapModel, nutTrap, squareNutSlotModel, squareNutSlot, captiveNutModel, captiveNut, insertBossModel, insertBoss,
    screwModel, screw, nutModel, nut, washerModel, washer, insertModel, insert, threadModel, thread, engagement, stripping, preload, torqueFor, seating, screwLoad };
  for (const [name, f] of Object.entries(every)) {
    const o = { depth: 6, length: 10, material: 'pla', ...(name === 'torqueFor' ? { force: 100 } : { torque: 1 }) };
    assert.throws(() => f('M7', o), /no thread "M7"\. There are: M1\.6, M2/, `${name}: an unknown thread`);
    assert.throws(() => f({ thread: 'M3' }, o), /give a fixing's model \(fixingModel\) or its name|give a thread: a fixing's name or model/, `${name}: what is no fixing`);
    assert.throws(() => f('M3', 'deep'), /the second argument is its options/, `${name}: options that are no options`);
  }
  assert.throws(() => lengthFor(6, 'M7', { into: 'nut' }), /no thread "M7"/); assert.throws(() => lengthFor(6, 'M3', 'nut'), /the second argument is its options/);
  for (const name of Object.keys(fixings).filter((k) => typeof fixings[k] === 'function' && !['fixingModel', 'parseName', 'threads', 'printable', 'fixingsFor', 'lengthFor', 'screwGroup'].includes(k))) assert.ok(every[name], `${name} is held to these refusals`);
});

test('printable: every drawn feature says how it prints, and what is bought says so', () => {
  const drawn = { hole: hole('M3', { depth: 6 }), pilot: hole('M3', { kind: 'pilot' }), 'threaded hole': hole('M10', { kind: 'thread', depth: 12 }), counterbore: counterbore('M3'), countersink: countersink('M3'), nutPocket: nutPocket('M3'), nutTrap: nutTrap('M3', { depth: 8 }),
    squareNutSlot: squareNutSlot('M3', { depth: 8 }), captiveNut: captiveNut('M3'), insertBoss: insertBoss('M3'), thread: thread('M10', { length: 20 }), 'internal thread': thread('M10', { length: 10, internal: true }), 'threaded screw': screw('M10x30 hex', { display: 'thread' }), 'threaded nut': nut('M10', { display: 'thread' }) };
  for (const [what, g] of Object.entries(drawn)) {
    const f = printable(g); assert.equal(f.length, 1, what); assert.equal(f[0].level, 'pass', `${what}: ${f[0].text}`); assert.match(f[0].code, /\.printable$/, what); assert.ok(f[0].text.length > 20, what);
    assert.deepEqual(printable(g.model), f, `${what}: the model says what its solid does`);
  }
  // what is bought is not printed: the light solids, and the fixing itself
  for (const [g, item] of [[screw('M3x12 cap'), 'screw'], [nut('M3'), 'nut'], [washer('M3'), 'washer'], [insert('M3'), 'insert']]) {
    const f = printable(g); assert.equal(f.length, 1, item); assert.equal(f[0].level, 'fail'); assert.equal(f[0].code, 'fixing.printable'); assert.match(f[0].text, new RegExp(`an M3 ${item} is bought and fitted, not printed`));
  }
  assert.match(printable(screwModel('M3x12 cap'))[0].text, /or draw it with its thread to print it \(\{ display: 'thread' \}\)/);
  // a warning where the printer would struggle: a standard flank past its overhang, a bridge past its span
  assert.equal(printable(threadModel('M10', { length: 20, flanks: 'standard' }))[0].level, 'warn'); assert.equal(printable(nutPocketModel('M12', { into: '+x' }))[0].level, 'warn');
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

test('the README: its examples run as written, the first prints what it says, and the grammar in it is the one the code reads', async () => {
  const { execFileSync } = await import('node:child_process'), { fileURLToPath } = await import('node:url');
  const readme = fs.readFileSync(new URL('./README.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n'); // (git on Windows checks it out with CRLF)
  // every example, with the output printed under it where it shows one (a text block straight after the code)
  const found = [...readme.matchAll(/```js\n([\s\S]*?)```(?:\n\n```text\n([\s\S]*?)```)?/g)], blocks = found.map((b) => b[1]), expected = found[0][2];
  assert.ok(blocks.length >= 9, 'an example for the model, a whole part, the holes, the seats, the hardware, a workspace, threads, strength and refusals');
  assert.ok(found.filter((b) => b[2] != null).length >= 5, 'five of them show what they print');
  const run = (js, i) => {
    const file = new URL(`./.readme-example-${i}.mjs`, import.meta.url);
    fs.writeFileSync(file, js);
    try { return execFileSync(process.execPath, [fileURLToPath(file)], { encoding: 'utf8' }).replace(/\r\n/g, '\n'); } finally { fs.rmSync(file); }
  };
  assert.equal(run(blocks[0], 0), expected);
  for (let i = 1; i < blocks.length; i++) { const said = run(blocks[i], i); if (found[i][2] != null) assert.equal(said, found[i][2], `example ${i + 1} prints what the README shows under it`); }
  // the part of "Start here" is what its ticket asks a newcomer to be able to draw: four counterbored M3 holes and an insert boss
  const start = blocks.find((b) => b.includes('insertBoss') && b.includes('corners')); assert.ok(start && /counterbore\('M3'/.test(start) && readme.includes('## Start here'), 'the plate with four counterbored M3 holes and an insert boss');
  for (const heading of ['Naming a fixing', 'Holes by purpose', 'Seats', 'Reference hardware', 'Threads cut for printing', 'Strength and length', 'Refusals and printability', 'Limits', 'What is measured and what is estimated', 'Formulas', 'Glossary', 'Sources']) assert.ok(readme.includes(`\n## ${heading}`), `a section on ${heading}`);
  assert.ok(!/What comes next/.test(readme)); assert.ok(!/^\s*(Not|No)\b/.test(readme.split('\n').find((l) => l.trim() && !l.startsWith('#'))), 'it does not open on a not');
  assert.ok(readme.includes(GRAMMAR), 'the grammar, word for word');
  assert.ok(!/[\u2014\u2013]/.test(readme), 'no dashes used as punctuation');
  for (const name of Object.keys(fixings).filter((k) => typeof fixings[k] === 'function')) assert.ok(readme.includes(name.replace(/Model$/, '')), `${name} is described`);
});
