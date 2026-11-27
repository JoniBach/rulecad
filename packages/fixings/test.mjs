import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import jscad from '@jscad/modeling';
import * as fixings from '@rulecad/fixings';
import { check } from '@rulecad/printcheck';
import * as shapes from '@rulecad/shapes';
import { fileURLToPath } from 'node:url';
import { shippedModules } from '../../scripts/shipped.mjs';
const shapesNutPocket = shapes.nutPocket;

const { fixingModel, parseName, threads, GRAMMAR, HEADS, NUTS, DEFAULTS, holeModel, hole, HOLE_KINDS, counterboreModel, counterbore, countersinkModel, countersink, nutPocketModel, nutPocket,
  nutTrapModel, nutTrap, squareNutSlotModel, squareNutSlot, captiveNutModel, captiveNut, insertBossModel, insertBoss, printable, screwModel, screw, nutModel, nut, washerModel, washer, insertModel, insert, fixingsFor,
  threadModel, thread, THREAD_FORMS, engagement, stripping, preload, torqueFor, seating, lengthFor, screwGroup, screwLoad, MATERIALS, MATERIAL_CLASSES, ENDS } = fixings;
const { measureBoundingBox: bb, measureVolume: vol } = jscad.measurements, { geom3 } = jscad.geometries, { subtract, union, intersect } = jscad.booleans;
const { cuboid, cylinder } = jscad.primitives, { translate, rotateX, rotateY } = jscad.transforms;
// Pins name no thread: their own refusals are held in the pins tests
const PIN_FUNCTIONS = ['pinModel', 'pinHole', 'pin', 'snapPin', 'snapSocket', 'snapPinModel', 'parsePin', 'isPinName', 'magnetModel', 'magnetSeatModel', 'magnetSeat', 'magnet', 'parseMagnet', 'isMagnetName', 'fieldShare', 'annularSnapModel', 'annularBead', 'annularGroove', 'hubFactor', 'shaftFactor', 'tubeRing', 'skirtFinger', 'snapSlots']; // (pins, magnets and annular snaps name no thread)
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
  // every module it ships exists, and its declarations go with it (by name or the *.d.mts pattern)
  const declared = (f) => pkg.files.includes(f.replace(/\.mjs$/, '.d.mts')) || pkg.files.includes('*.d.mts');
  for (const f of shippedModules(fileURLToPath(new URL('.', import.meta.url)))) { assert.ok(fs.existsSync(new URL(`./${f}`, import.meta.url)), f); assert.ok(declared(f), `${f}'s declarations are shipped`); }
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

test('the fixings coupon\'s measurements: a printer\'s measured insert hole, nut fit and nut slip are read before the starting figures', () => {
  const rule = (value, what) => ({ value, unit: 'mm', rule: what, kind: 'measured', source: 'the fixings coupon, PLA', checked: '2026-11-15' });
  const mk4 = { name: 'mk4', rules: { insert_m3: rule(4.1, 'Hole to draw for an M3 heat-set insert'), nut_fit: rule(0.05, 'Clearance across a nut pocket\'s flats'), nut_slip: rule(0.15, 'Clearance across a nut slot\'s flats') } };
  const i = holeModel('M3', { kind: 'insert', printer: mk4 });
  assert.deepEqual([i.diameter, i.comp, i.basis.rule, i.basis.kind], [4.1, 0, 'mk4.insert_m3', 'measured']);
  assert.match(i.findings[0].text, /an M3 insert hole drawn 4\.1 mm: it rests on mk4\.insert_m3 \(4\.1 mm\), a measured rule/);
  assert.match(holeModel('M3', { kind: 'insert' }).findings[0].text, /rests on m3\.insert_hole \(4 mm\), a community figure.*x1c has no measured insert_m3, so measure it on this printer/);
  assert.equal(insertBossModel('M3', { printer: mk4 }).hole, 4.1, 'and the boss round it'); assert.match(insertBossModel('M3', { printer: mk4 }).findings[0].text, /mk4\.insert_m3, as drawn/);
  // a pocket's snug fit is the printer's nut_fit, a slot's slip its nut_slip; a fit given in mm is drawn as given
  const p = nutPocketModel('M4', { printer: mk4 });
  assert.deepEqual([p.flats, p.clearance], [7.15, 0.05]); assert.ok(p.rests.some((r) => r.name === 'mk4.nut_fit'));
  assert.match(p.findings[0].text, /and mk4\.nut_fit 0\.05 mm/);
  const t = nutTrapModel('M4', { depth: 10, printer: mk4 });
  assert.deepEqual([t.width, t.clearance], [7.25, 0.15]); assert.ok(t.rests.some((r) => r.name === 'mk4.nut_slip'));
  assert.equal(captiveNutModel('M4', { at: [0, 0, 4], printer: mk4 }).flats, 7.25, 'a nut dropped in mid-print slips in as a slot\'s does');
  assert.deepEqual([nutPocketModel('M4', { printer: mk4, fit: 0 }).flats, nutPocketModel('M4', { printer: mk4, fit: 'press' }).flats], [7.1, 7.05]);
  // without them, as before: snug is no clearance, slip the printer's slip
  assert.deepEqual([nutPocketModel('M4').clearance, nutTrapModel('M4', { depth: 10 }).clearance], [0, 0.1]);
  assert.throws(() => nutPocketModel('M4', { printer: { name: 'p', rules: { nut_fit: { value: 'tight', kind: 'measured' } } } }), /nutPocket: p\.nut_fit is a clearance in mm \(got "tight"\)/);
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

test('one place for each shape: a seat shapes has a helper for is shapes\' helper given the model\'s figures, to the last vertex', () => {
  const same = (a, b, what) => assert.equal(JSON.stringify(geom3.toPolygons(a).map((p) => p.vertices)), JSON.stringify(geom3.toPolygons(b).map((p) => p.vertices)), what);
  for (const [into, at] of [['-z', [1, 2, 10]], ['+z', [1, 2, 0]], ['+x', [-15, 0, 7]]]) {
    const c = countersinkModel('M3', { length: 8, into });
    same(countersink('M3', { length: 8, at, into }), shapes.countersink({ hole: c.hole, head: c.diameter, length: c.length + 0.1, at, into }), `countersink going ${into}`);
    const p = nutPocketModel('M3', { into });
    same(nutPocket('M3', { at, into }), shapes.nutPocket({ flats: p.flats, height: p.depth, hole: p.hole, at, into }), `hex nut pocket going ${into}`);
  }
  const h = holeModel('M3', { depth: 20, into: '+y' });
  same(hole('M3', { depth: 20, into: '+y', at: [0, -10, 5] }), shapes.teardropHole({ d: h.diameter, length: 20, at: [0, -10, 5], into: '+y', through: h.through }), 'a hole on its side');
  const t = nutTrapModel('M3', { depth: 6, into: '+x' });
  same(nutTrap('M3', { depth: 6, into: '+x', at: [-8, 0, 4] }), shapes.wallOpening({ width: t.width, height: t.gap, depth: t.reach, at: [-8, 0, 4], into: '+x', bridge: x1c.rules.bridge.value }), 'a nut slot from the side');
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
  assert.deepEqual(MATERIALS, ['pla', 'petg', 'abs', 'asa', 'pa_cf', 'al6061', 'al7075', 's275', 'ss304']); assert.deepEqual(MATERIAL_CLASSES, ['plastic', 'aluminium', 'steel']);
  assert.throws(() => engagement('M3', { depth: 0, material: 'pla' }), /engagement: depth is a number above 0/); assert.throws(() => engagement('M3', { depth: -2, material: 'pla' }), /depth is a number above 0/);
  assert.throws(() => engagement('M3', { depth: 6 }), /engagement: give a material: a class \(plastic, aluminium, steel\) or a material \(pla, petg, abs, asa, pa_cf, al6061, al7075, s275, ss304\)/);
  assert.throws(() => engagement('M3', { depth: 6, material: 'nylon' }), /engagement: no material "nylon"\. There are: pla, petg, abs, asa, pa_cf, al6061, al7075, s275, ss304\. For another, hand in its rule set/);
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
  // ...but a twist that rounds to 0 N·m (a clip's own weight, a hair off its screw's axis) is none: nothing to warn of
  assert.equal(screwGroup([[0, 0]], { moment: [0, 0, 0.0004] }).turns, null);
  assert.equal(screwGroup([[0, 0]], { moment: [0, 0, 0.0006] }).turns, 0.001);
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
    screwModel, screw, nutModel, nut, washerModel, washer, insertModel, insert, threadModel, thread, engagement, stripping, preload, torqueFor, seating, screwLoad, printedBoltModel: fixings.printedBoltModel, printedBolt: fixings.printedBolt };
  for (const [name, f] of Object.entries(every)) {
    const o = { depth: 6, length: 10, material: 'pla', ...(name === 'torqueFor' ? { force: 100 } : { torque: 1 }) };
    assert.throws(() => f('M7', o), /no thread "M7"\. There are: M1\.6, M2/, `${name}: an unknown thread`);
    assert.throws(() => f({ thread: 'M3' }, o), /give a fixing's model \(fixingModel\) or its name|give a thread: a fixing's name or model/, `${name}: what is no fixing`);
    assert.throws(() => f('M3', 'deep'), /the second argument is its options/, `${name}: options that are no options`);
  }
  assert.throws(() => lengthFor(6, 'M7', { into: 'nut' }), /no thread "M7"/); assert.throws(() => lengthFor(6, 'M3', 'nut'), /the second argument is its options/);
  for (const name of Object.keys(fixings).filter((k) => typeof fixings[k] === 'function' && !['fixingModel', 'parseName', 'threads', 'printable', 'fixingsFor', 'lengthFor', 'screwGroup', ...PIN_FUNCTIONS].includes(k))) assert.ok(every[name], `${name} is held to these refusals`); // (pins name no thread: their refusals are tested with them)
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

// ---------- pins ----------
const { pinModel, pinHole, pin, snapPin, snapSocket, snapPinModel, parsePin, isPinName, PIN_GRAMMAR, PIN_KINDS } = fixings;
const pla = json('../rules/pla.json'), pins = json('../rules/pins.json');

test('a snap pin by name: its socket from the printer\'s snap_clearance, its forces from two snap hooks worked out here', () => {
  const m = pinModel('snap pin 4x6');
  assert.deepEqual([m.type, m.name, m.diameter, m.length, m.made, m.fit], ['snap', 'snap pin 4x6', 4, 6, 'printed', 'snap']);
  // the socket: the 4 mm peg plus x1c.snap_clearance (0.2 mm) each side, as drawn: 4 + 2 × 0.2 = 4.4 mm
  assert.equal(x1c.rules.snap_clearance.value, 0.2); assert.equal(x1c.rules.snap_clearance.kind, 'estimate');
  assert.deepEqual([m.hole.diameter, m.hole.comp, m.hole.rules], [4.4, 0, ['x1c.snap_clearance']]);
  const mine = fixingsFor({ printer: { name: 'mine', rules: { snap_clearance: { value: 0.25, unit: 'mm', kind: 'measured', source: 'my coupon' } } } }).pinModel('snap pin 4x6');
  assert.equal(mine.hole.diameter, 4.5, 'a measured clearance moves the socket');
  // and the socket's finding says which: an estimate until the holds coupon measures it, then measured
  const socket = (x) => x.findings.find((f) => f.code === 'pin.hole').text;
  assert.match(socket(m), /x1c\.snap_clearance 0\.2 mm each side \(an estimate until the holds coupon measures it\)/);
  assert.match(socket(mine), /mine\.snap_clearance 0\.25 mm each side \(measured\), as drawn/); assert.doesNotMatch(socket(mine), /estimate/);
  // Each half is a snap hook: L = slot = 3 × 4 = 12 mm, t = (4 - gap 1) / 2 = 1.5 mm, w = 0.8 × 4 = 3.2 mm, E = pla.modulus 2680 MPa.
  //   k = E w t³ / 4L³ = 2680 × 3.2 × 3.375 / (4 × 1728) = 4.1875 N/mm; P = k × barb 0.4 = 1.675 N per half
  //   insertion at a 45° lead, μ 0.3: W = P (μ + tan 45) / (1 - μ tan 45) = 1.675 × 1.3 / 0.7 = 3.1107 N per half, 6.22 N for both
  //   strain at the root: 3 t y / 2 L² = 3 × 1.5 × 0.4 / (2 × 144) = 0.00625
  assert.equal(pla.rules.modulus.value, 2680);
  near(m.snap.force, 3.35, 0.005, 'both halves closed by the barb'); near(m.snap.insertion, 6.22, 0.005, 'pushed in'); near(m.snap.removal, 6.22, 0.005, 'a 45° back lets go as it went in'); near(m.snap.strain, 0.00625, 1e-4, 'strain at the root');
  const plain = snapPinModel({ diameter: 4 }, { E: 2680 });
  near(plain.insertion, 2 * (1.675 * 1.3) / 0.7, 1e-9, 'snapPinModel: the same sum'); assert.ok(snapPinModel({ diameter: 4, back: 90 }, { E: 2680 }).holds && pinModel('snap pin 4x6', { back: 90 }).snap.removal === Infinity);
  // mass: the drawn pin's volume × pla.density 1.26 g/cm³
  near(m.grams, (vol(snapPin({ diameter: 4, length: 6 })) * 1.26) / 1000, 1e-3, 'weighed from its solid');
  assert.ok(m.findings.some((f) => f.code === 'pin.snap' && /6\.22 N to push in and 6\.22 N to pull out/.test(f.text)));
  assert.ok(m.rests.some((r) => r.name === 'x1c.snap_clearance' && r.kind === 'estimate'), 'it says what it rests on');
  assert.deepEqual(parsePin('snap pin 2.5x4 barb 0.3'), { kind: 'snap', diameter: 2.5, length: 4, barb: 0.3, standard: null });
  assert.equal(pinModel('snap pins 3x5 barb 0.6').name, 'snap pin 3x5 barb 0.6');
});

test('a snap pin fits its part or is refused by name: too long rattles, too short never clicks', () => {
  assert.equal(pinModel('snap pin 4x6', { thickness: 6 }).findings.find((f) => f.code === 'pin.length').level, 'pass');
  assert.equal(pinModel('snap pin 4x6', { thickness: 5.6 }).findings.find((f) => f.code === 'pin.length').level, 'pass', 'within fixings.snap_play, 0.5 mm');
  assert.throws(() => pinModel('snap pin 4x8', { thickness: 6 }), /pinModel: snap pin 4x8's shaft is 8 mm long, and the parts it goes through are 6 mm thick: it is too long for its part, so the barb clicks out 2 mm past the far face/);
  assert.throws(() => pinModel('snap pin 4x5', { thickness: 6 }), /too short for its part, and the barb never clicks out/);
  assert.equal(DEFAULTS.snap_play.kind, 'estimate');
});

test('a 3 mm dowel: press and slip holes from the printer\'s rules, a teardrop on its side, its shear and the hole\'s bearing', () => {
  // press: 3 + x1c.hole_comp 0.1 - x1c.pin_press 0.05 = 3.05 mm; slip: 3 + 0.1 + x1c.pin_slip 0.2 = 3.3 mm
  const press = pinModel('dowel 3x12'), slip = pinModel('dowel 3x12', { fit: 'slip' });
  assert.deepEqual([press.hole.diameter, slip.hole.diameter], [3.05, 3.3]);
  assert.deepEqual([press.fit, press.made, press.standard], ['press', 'bought', 'ISO 8734']);
  for (const k of ['pin_press', 'pin_slip']) assert.equal(x1c.rules[k].kind, 'estimate');
  assert.equal(pinModel('dowel 3x12', { printer: { hole_comp: 0.15, pin_press: 0.1 } }).hole.diameter, 3.05, 'a printer\'s own figures: 3 + 0.15 - 0.1');
  // on its side the hole gets a 45° roof; standing it is round, and the solid is the drawn diameter across
  assert.equal(pinModel('dowel 3x12', { axis: 'x' }).hole.teardrop, true); assert.equal(press.hole.teardrop, false);
  const cut = pinHole('dowel 3x12', { depth: 6 }), box = bb(cut);
  near(box[1][0] - box[0][0], 3.05, 0.01, 'the press hole across'); assert.equal(cut.model.hole.diameter, 3.05);
  const side = bb(pinHole('dowel 3x12', { axis: 'y', depth: 6 })); assert.ok(side[1][2] - 3.05 / 2 > 0.5, 'a teardrop stands taller than its circle');
  // Strength, at 30 N across the pin, in 12 mm of PLA parts (6 mm grip each side):
  //   shear: pins.dowel_shear 158.8 MPa × π 3² / 4 = 7.0686 mm² → 1122.5 N (one plane)
  //   bearing: pla.strength 39 MPa × d 3 mm × grip 6 mm = 702 N; the margin is the less over the load: 702 / 30 = 23.4
  //   mass: 7.0686 mm² × 12 mm × 7.85 g/cm³ / 1000 = 0.666 g
  assert.equal(pins.rules.dowel_shear.value, 158.8); near(275 / Math.sqrt(3), 158.8, 0.05, 'S275 over √3');
  const m = pinModel('dowel 3x12', { load: 30, thickness: 12 });
  assert.deepEqual([m.shear, m.bearing, m.margin, m.governs, m.grams], [1122.5, 702, 23.4, 'bearing', 0.666]);
  assert.equal(m.findings.find((f) => f.code === 'pin.strength').level, 'pass');
  assert.equal(pinModel('dowel 3x12', { load: 500, thickness: 12 }).findings.find((f) => f.code === 'pin.strength').level, 'warn', '702 / 500 = 1.4: under twice');
  assert.equal(pinModel('dowel 3x12', { load: 800, thickness: 12 }).findings.find((f) => f.code === 'pin.strength').level, 'fail');
  // too long for its part, by name, with the longest that fits
  assert.throws(() => pinModel('dowel 3x20', { thickness: 12 }), /dowel 3x20 is 20 mm long, and the parts it goes in hold 12 mm of it: it is too long for its part, and stands 8 mm proud\. The longest dowel that fits is 12 mm/);
  assert.deepEqual(parsePin('dowel 4x16 ISO 2338'), { kind: 'dowel', diameter: 4, length: 16, barb: null, standard: 'ISO 2338' });
});

test('filament and printed pins: the filament\'s diameter and tolerance, a printed pin\'s shear across its layers', () => {
  const f = pinModel('filament pin 1.75x12', { load: 10 });
  assert.deepEqual([f.hole.diameter, f.made, f.pinMaterial], [1.8, 'cut', 'pla']); // 1.75 + 0.1 - 0.05
  // shear: pla.strength 39 × 1/√3 × π 1.75² / 4 = 22.517 × 2.4053 = 54.2 N
  near(f.shear, 54.2, 0.05, 'a filament pin in shear');
  assert.ok(f.findings.some((x) => x.code === 'pin.tolerance' && /± 0\.03 mm/.test(x.text)));
  const p = pinModel('printed pin 4x10', { fit: 'slip' }); assert.deepEqual([p.hole.diameter, p.made], [4.3, 'printed']);
  const s = pin('printed pin 4x10'), b = bb(s); near(b[1][2] - b[0][2], 10, 1e-6, 'drawn standing, its length up'); near(b[1][0] - b[0][0], 4, 0.02, 'and its diameter across');
  assert.ok(isPinName('dowel 3x12') && !isPinName('Two push pins') && !isPinName('M3x10'));
  assert.ok(PIN_GRAMMAR.includes('snap pin') && PIN_KINDS.length === 4);
});

test('pins are refused by name before any sums: what is no pin, a size not sold, a pin too thin to print, options a pin has not', () => {
  assert.throws(() => pinModel('Two push pins'), /pin name: "Two push pins" is no pin\. A pin is its kind, then diameter x length/);
  assert.throws(() => pinModel('dowel 3.5x12'), /no ISO 8734 dowel is 3\.5 mm across: the nearest are 3 and 4 mm/);
  assert.throws(() => pinModel('dowel 3x13'), /a dowel is not sold 13 mm long: the nearest are 12 and 14 mm/);
  assert.equal(pinModel('dowel 3x13', { anyLength: true }).length, 13);
  assert.throws(() => pinModel('filament pin 2.85x10'), /a filament pin is the printer's filament, 1\.75 mm across/);
  assert.throws(() => pinModel('printed pin 1.5x10'), /under fixings\.pin_least, 2 mm/);
  assert.throws(() => pinModel('snap pin 4x6', { fit: 'press' }), /a snap pin's fit is its socket's/);
  assert.throws(() => pinModel('dowel 3x12', { pull: 5 }), /pull is along a snap pin/);
  assert.throws(() => pinModel('dowel 3x12', { fit: 'tight' }), /fit is press or slip/);
  assert.throws(() => pinModel('dowel 3x12 barb 0.4'), /only a snap pin has a barb/);
  assert.throws(() => pinModel('dowel 3x12', 'deep'), /the second argument is its options/);
  assert.throws(() => pinModel('snap pin 4x6', { gap: 4 }), /gap is the split's width, 0 mm or more and narrower than the 4 mm peg/);
  assert.throws(() => snapPinModel({ diameter: 4 }, { E: 0 }), /snapPinModel: the material needs a modulus E above 0 MPa/);
  assert.throws(() => pinModel('dowel 3x12', { material: 'cheese' }), /no material "cheese"/);
});

test('snapSocket draws the clearance the X1C\'s rule gives, the 0.2 mm it always drew', () => {
  near(vol(snapSocket({ diameter: 4, depth: 6 })), vol(snapSocket({ diameter: 4, depth: 6, clearance: 0.2 })), 1e-9, 'the default is the rule');
});

test('the README names pins with the grammar the code reads, word for word', () => {
  const readme = fs.readFileSync(new URL('./README.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.ok(readme.includes('\n## Pins\n'), 'a section on pins'); assert.ok(readme.includes(PIN_GRAMMAR), 'the pin grammar, word for word');
});

// ---------- magnets ----------
const { magnetModel, magnetSeatModel, magnetSeat, magnet, parseMagnet, isMagnetName, fieldShare, MAGNET_GRAMMAR, MAGNET_GRADES, MAGNET_SIZES } = fixings;
const magnets = json('../rules/magnets.json');

test('a magnet by name: its pull from its seller\'s figure, scaled to its grade by the remanence squared and across a gap by the field on its axis squared', () => {
  assert.deepEqual(parseMagnet('disc magnet 8x3'), { shape: 'disc', diameter: 8, length: null, width: null, thickness: 3, grade: null });
  assert.deepEqual(parseMagnet('block magnet 10x5x2 n52'), { shape: 'block', diameter: null, length: 10, width: 5, thickness: 2, grade: 'N52' });
  assert.equal(parseMagnet('magnet 6x2').shape, 'disc'); assert.ok(isMagnetName('disc magnet 12x3 N45')); assert.ok(!isMagnetName('M3x12 cap'));
  for (const bad of ['disc magnet 8', 'block magnet 8x3', 'disc magnet 8x3x2', 'disc magnet 8x3 N99', 'disc magnet 8x3 strong', 'magnet']) assert.throws(() => parseMagnet(bad), /magnet name/, bad);
  assert.deepEqual(MAGNET_SIZES.disc, ['6x2', '6x3', '8x3', '10x2', '10x3', '12x3']); assert.deepEqual(MAGNET_GRADES, ['N35', 'N38', 'N40', 'N42', 'N45', 'N48', 'N50', 'N52']);
  for (const [k, r] of Object.entries(magnets.rules)) { assert.ok(r.rule && r.kind && r.source && r.checked, k); }
  // The seller's 8 x 3 disc is N45 and pulls 14.7 N (supermagnete S-08-03-N): as sold, that figure itself
  const n45 = magnetModel('disc magnet 8x3 N45');
  assert.deepEqual([n45.name, n45.touching, n45.pull, n45.grams], ['disc magnet 8x3 N45', 14.7, 14.7, 1.131]); // 8² π/4 × 3 = 150.80 mm³ × 7.5 g/cm³ = 1.131 g
  // N35, the default: middles of remanence N35 (1.17 + 1.21) / 2 = 1.19 T, N45 (1.32 + 1.37) / 2 = 1.345 T;
  // 14.7 × (1.19 / 1.345)² = 14.7 × 0.782789 = 11.507 N. N52: (1.42 + 1.47) / 2 = 1.445 T, 14.7 × (1.445 / 1.345)² = 16.967 N
  const n35 = magnetModel('disc magnet 8x3');
  assert.equal(n35.grade, 'N35'); near(n35.touching, 11.507, 0.005, 'N35 by hand'); near(magnetModel('disc magnet 8x3 N52').touching, 16.967, 0.005, 'N52 by hand');
  assert.ok(n35.rests.some((r) => r.name === 'magnets.grade') && n35.rests.some((r) => r.name === 'magnets.remanence_N35'));
  // Across 1 mm: B(z) / Br = ½ [(D + z) / √(R² + (D + z)²) - z / √(R² + z²)], R 4, D 3: at 0, 3 / 5 = 0.6; at 1,
  // 4 / √32 - 1 / √17 = 0.707107 - 0.242536 = 0.464571; (0.464571 / 0.6)² = 0.599514, × 14.7 = 8.813 N
  near(fieldShare(parseMagnet('disc magnet 8x3'), 1), 0.774285, 1e-5, 'the field share by hand');
  const far = magnetModel('disc magnet 8x3 N45', { gap: 1 }); near(far.pull, 8.813, 0.005, 'across 1 mm'); assert.ok(far.rests.some((r) => r.name === 'magnets.field_formula'));
  // a block's field: at its face atan(∞) = π/2 less the far face's, so the share there is 1
  near(fieldShare(parseMagnet('block magnet 10x5x2'), 0), 1, 1e-12, 'a block at its face'); assert.ok(fieldShare(parseMagnet('block magnet 10x5x2'), 1) < 1);
  // two of them on a lid, a 10 N pull: 23.01 N together, 2.3 times over, a pass; 15 N: 1.53 times, a warning under load_margin
  const lid = magnetModel('disc magnet 8x3', { count: 2, load: 10 });
  assert.deepEqual([lid.total, lid.margin], [23.01, 2.3]); assert.equal(lid.findings.find((f) => f.code === 'magnet.hold').level, 'pass');
  assert.equal(magnetModel('disc magnet 8x3', { count: 2, load: 15 }).findings.find((f) => f.code === 'magnet.hold').level, 'warn');
  assert.equal(magnetModel('disc magnet 8x3', { count: 2, load: 30 }).findings.find((f) => f.code === 'magnet.hold').level, 'fail');
  // refused by name: a size with no seller's figure (unless its pull is given), a gap less than nothing, a grade not made
  assert.throws(() => magnetModel('disc magnet 7x3'), /magnetModel: there is no seller's pull for a disc magnet 7x3: the kit holds 6x2, 6x3, 8x3, 10x2, 10x3, 12x3 \(magnets\.disc_<size>_pull\)\. For another size, give its maker's pull/);
  assert.equal(magnetModel('disc magnet 7x3', { pull: 12 }).touching, 12);
  assert.throws(() => magnetModel('disc magnet 8x3', { gap: -1 }), /gap is what lies between/); assert.throws(() => magnetModel('disc magnet 8x3', { grade: 'N60' }), /grade is one of/);
  assert.throws(() => magnetModel('disc magnet 8x3', { count: 1.5 }), /count is how many magnets/);
});

test('a magnet\'s seat: a press, glue or crush-rib pocket from the printer\'s rules, its floor held to what prints, and the pull out of it against the fit', () => {
  const x1 = x1c.rules;
  assert.deepEqual([x1.magnet_press.value, x1.magnet_glue.value, x1.magnet_crush.value].map(Number), [0.1, 0.1, 0.2]);
  for (const k of ['magnet_press', 'magnet_glue', 'magnet_crush']) assert.equal(x1[k].kind, 'estimate', k);
  // press: 8 + hole_comp 0.1 - magnet_press 0.1 = 8 mm; glue: 8 + 0.1 + magnet_glue 0.1 = 8.2 mm; ribs: a glue pocket with
  // its ribs' tips at 8 + 0.1 - magnet_crush 0.2 = 7.9 mm, standing (8.2 - 7.9) / 2 = 0.15 mm off its wall
  const press = magnetSeatModel('disc magnet 8x3', { fit: 'press', thickness: 5 }), glue = magnetSeatModel('disc magnet 8x3', { fit: 'glue', thickness: 5 }), ribs = magnetSeatModel('disc magnet 8x3', { fit: 'ribs', thickness: 5 });
  assert.deepEqual([press.pocket.diameter, press.pocket.depth, press.floor, press.pocket.rules], [8, 3, 2, ['x1c.hole_comp', 'x1c.magnet_press']]);
  assert.deepEqual([glue.pocket.diameter, glue.pocket.lead], [8.2, 0]); assert.deepEqual(ribs.pocket.ribs, { count: 3, tips: 7.9, radius: 0.21, protrude: 0.15 });
  assert.equal(fixingsFor({ printer: { name: 'mine', rules: { magnet_press: { value: 0.05, unit: 'mm', kind: 'measured', source: 'my coupon' } } } }).magnetSeatModel('disc magnet 8x3', { fit: 'press' }).pocket.diameter, 8.05, 'a measured press moves the pocket');
  // the pull out of the pocket, facing its steel. Press: p = E i / d / (1 + ν) = 2680 × 0.1 / 8 / 1.36 = 24.632 MPa;
  // over the wall π × 8 × 3 = 75.398 mm² at clamp_friction 0.3: 0.3 × 24.632 × 75.398 = 557.2 N, 48.4 times its 11.51 N
  assert.equal(press.hold, 557.2); near(press.holdMargin, 557.2 / 11.507, 0.02, 'the press margin');
  assert.equal(press.findings.find((f) => f.code === 'magnet.wall').level, 'warn', '24.6 MPa round the hoop is past half of PLA\'s 39 MPa');
  // ribs crushed press at the plastic's strength over three lines 0.42 mm wide by 3 mm: 0.3 × 39 × 3 × 0.42 × 3 = 44.2 N
  assert.equal(ribs.hold, 44.2); assert.equal(ribs.findings.find((f) => f.code === 'magnet.pullout').level, 'pass');
  assert.equal(glue.hold, null); assert.equal(glue.findings.find((f) => f.code === 'magnet.pullout').level, 'info');
  // facing the floor: the steel past a 0.6 mm floor (3.6 mm thick, 3 mm pocket) is the gap, and the magnet cannot pull out
  const through = magnetSeatModel('disc magnet 8x3 N45', { thickness: 3.6, facing: 'floor' });
  near(through.magnet.gap, 0.6, 1e-9, 'the floor is the gap'); assert.ok(through.magnet.pull < 14.7); assert.equal(through.findings.find((f) => f.code === 'magnet.pullout').level, 'pass');
  // a block's pocket: press 10 x 5 mm, its corners relieved by a line's radius so none is square
  assert.deepEqual(magnetSeatModel('block magnet 10x5x2', { fit: 'press' }).pocket.size, [10, 5]); assert.equal(magnetSeatModel('block magnet 10x5x2').pocket.relief, 0.42);
  // The default fit passes: crush ribs for a disc standing, glue lying on its side and for a block. A press warns or fails
  // on its wall: 8x3 in PLA, p = 24.632 MPa > 39 / 2 = 19.5 (warn); the 10x5x2 block's press, p = 2680 × 0.1 / 5 / 1.36 =
  // 39.41 MPa > 39 (fail, it splits). The ribs hold the largest kit disc, 12x3, 2.1 times its pull in PETG, at least
  assert.deepEqual([magnetSeatModel('disc magnet 8x3').fit, magnetSeatModel('disc magnet 8x3', { into: '+x' }).fit, magnetSeatModel('block magnet 10x5x2').fit], ['ribs', 'glue', 'glue']);
  assert.deepEqual(magnetSeatModel('block magnet 10x5x2').pocket.size, [10.2, 5.2], 'a glued block: 10 + 0.1 + 0.1 by 5 + 0.1 + 0.1');
  assert.equal(magnetSeatModel('block magnet 10x5x2', { fit: 'press' }).findings.find((f) => f.code === 'magnet.wall').level, 'fail');
  for (const size of ['disc magnet 6x2', 'disc magnet 6x3', 'disc magnet 8x3', 'disc magnet 10x2', 'disc magnet 10x3', 'disc magnet 12x3', 'block magnet 10x5x2', 'block magnet 20x10x2']) for (const material of ['pla', 'petg']) {
    const bad = magnetSeatModel(size, { material }).findings.filter((f) => f.level === 'warn' || f.level === 'fail');
    assert.deepEqual(bad.map((f) => f.text), [], `${size} in ${material}, by default`);
  }
  // A magnet's model handed in is built again with the options given, as its name would be: through a 1 mm floor (4 mm
  // thick, a 3 mm pocket) the 8x3 N35 pulls 11.507 × (0.464571 / 0.6)² = 6.9 N, not its 11.51 N touching, and a 50 N
  // load is held 6.9 / 50 = 0.14 times: magnet.hold fails
  const byModel = magnetSeatModel(magnetModel('disc magnet 8x3'), { facing: 'floor', thickness: 4, load: 50 }), byName = magnetSeatModel('disc magnet 8x3', { facing: 'floor', thickness: 4, load: 50 });
  assert.deepEqual([byModel.magnet.pull, byModel.magnet.gap, byModel.magnet.load], [6.9, 1, 50]); assert.deepEqual(byModel.magnet.findings, byName.magnet.findings, 'what it says, as by its name');
  assert.equal(byModel.findings.find((f) => f.code === 'magnet.hold').level, 'fail');
  const own = magnetModel('disc magnet 9x3', { pull: 12, count: 2 }); assert.equal(magnetModel(own), own, 'with no options, the model itself');
  assert.deepEqual([magnetModel(own, { load: 5 }).touching, magnetModel(own, { load: 5 }).count, magnetModel(own, { load: 5 }).margin], [12, 2, 4.8], 'its given pull and count kept: 24 / 5');
  // refused by name: a floor under three layers (0.6 mm), a pocket opening on the bed wider than x1c.bridge 5 mm, ribs
  // or a block lying on their side, facing the floor with no thickness
  assert.throws(() => magnetSeatModel('disc magnet 8x3', { thickness: 3.5 }), /a pocket 3 mm deep in a part 3\.5 mm thick there leaves a floor of 0\.5 mm under the magnet, under fixings\.magnet_floor's 3 layers \(0\.6 mm at x1c\.layer 0\.2 mm\)/);
  assert.equal(magnetSeatModel('disc magnet 8x3', { thickness: 3.6 }).floor, 0.6);
  assert.throws(() => magnetSeatModel('disc magnet 8x3', { fit: 'press', into: '+z' }), /going up from the bed 8 mm across has its floor printed over it as a bridge, wider than x1c\.bridge 5 mm/);
  assert.throws(() => magnetSeatModel('disc magnet 8x3', { fit: 'ribs', into: '+x' }), /crush ribs lying on their side/);
  assert.throws(() => magnetSeatModel('block magnet 10x5x2', { into: '+y' }), /a block magnet's pocket lying on its side/);
  assert.throws(() => magnetSeatModel('disc magnet 8x3', { facing: 'floor' }), /give thickness/);
  assert.throws(() => magnetSeatModel('disc magnet 8x3', { fit: 'tape' }), /fit is press, glue or ribs/);
  assert.equal(magnetSeatModel('disc magnet 8x3', { into: '+x' }).pocket.teardrop, true, 'lying on its side, a teardrop');
});

test('a magnet\'s pocket and its solid: each prints, a ribbed pocket holds its ribs, and the magnet says it is bought', () => {
  const plate = (g, h) => subtract(cuboid({ size: [20, 20, h], center: [0, 0, h / 2] }), g);
  for (const fit of ['press', 'glue', 'ribs']) { const g = magnetSeat('disc magnet 8x3', { fit, at: [0, 0, 5] }); assert.equal(printable(g)[0].level, 'pass', fit); prints(plate(g, 5), `a ${fit} pocket in a plate`); }
  // a slice 1 mm thick at mid-depth, under the ribbed pocket's lead-in: the glue pocket's is a 8.2 mm circle, the ribbed one less its three ribs
  const slab = cuboid({ size: [20, 20, 1], center: [0, 0, -2] }), plain = vol(intersect(magnetSeat('disc magnet 8x3', { fit: 'glue' }), slab)), ribbed = vol(intersect(magnetSeat('disc magnet 8x3', { fit: 'ribs' }), slab));
  assert.ok(ribbed < plain - 0.1 && ribbed > plain - 1, `the ribs stand in the pocket: ${ribbed} against ${plain} mm³`);
  prints(plate(magnetSeat('block magnet 10x5x2', { at: [0, 0, 4] }), 4), 'a block\'s pocket, its corners relieved');
  const side = magnetSeat('disc magnet 8x3', { into: '+x', at: [-10, 0, 6] }); prints(subtract(cuboid({ size: [20, 20, 12], center: [0, 0, 6] }), side), 'a pocket on its side, a teardrop');
  const m = magnet('disc magnet 8x3'); near(vol(m), 150.8, 1.5, 'the disc\'s volume'); assert.equal(printable(m)[0].level, 'fail'); assert.match(printable(m)[0].text, /bought and fitted, not printed/);
});

test('the README names magnets with the grammar the code reads, word for word', () => {
  const readme = fs.readFileSync(new URL('./README.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.ok(readme.includes('\n## Magnets\n') && readme.includes('\n## Printed bolts\n')); assert.ok(readme.includes(MAGNET_GRAMMAR), 'the magnet grammar, word for word');
});

// ---------- printed bolts ----------
const { printedBoltModel, printedBolt } = fixings;

test('a printed bolt: an M8 in PLA breaks at the load worked by hand, in a printed or a steel nut, standing or lying; an M5 is refused at 0.2 mm layers naming M6', () => {
  // the name: the word printed makes it printed, at any length
  assert.equal(parseName('M8x20 hex printed').printed, true); assert.equal(parseName('M8x20 hex').printed, undefined);
  const fx = fixingModel('M8x23 hex printed'); assert.deepEqual([fx.name, fx.printed, fx.sold], ['M8x23 hex printed', true, false]);
  assert.throws(() => fixingModel('M8x23 hex'), /not sold 23 mm long/, 'a bought one is held to the sold lengths');
  assert.equal(fixingModel('M8 nut printed').name, 'M8 hex nut printed'); assert.throws(() => parseName('M3 insert printed'), /only a screw or a nut is printed/);
  assert.equal(printable(fx)[0].code, 'fixing.printable'); assert.match(printable(fx)[0].text, /is printed with its thread/);
  // By hand, an M8 (1.25 mm pitch) in a printed nut. The basic root: 8 - 2 × (5/8)(√3/2)(1.25) = 6.6467 mm; drawn, less its half
  // of x1c.thread_gap (0.1 mm) each side: radius 3.3234 - 0.1 = 3.223 mm, 6.446 mm across.
  //   Tension: (π/4) × 6.446² = 32.634 mm² × pla.strength 39 MPa (PLA has no strength_z: the strength along the layers stands
  //   for it, and the finding says so) = 1272.7 N.
  //   Teeth in the nut, 6.8 mm deep (m8.nut_height): the bolt's, 0.75 π D1 Le with D1 = 8 - 1.0825 × 1.25 = 6.6468 mm, is
  //   0.75 × π × 6.6468 × 6.8 = 106.50 mm²; the nut's, 0.875 π d Le = 0.875 × π × 8 × 6.8 = 149.54 mm²; at 39 / √3 = 22.517 MPa,
  //   the lesser shears at 2397.9 N.
  //   The head, 5.3 mm high (m8.hex_head_height): 22.517 × π × 8 × 5.3 = 2999.3 N.
  //   So it breaks at 1272.7 N, pulled apart across its root: 6.36 times a 200 N pull.
  const b = printedBoltModel('M8x20 hex printed', { load: 200 });
  assert.deepEqual([b.root, b.rootArea, b.tension.load, b.strip.area, b.strip.nutArea, b.strip.shear, b.strip.load, b.headShear, b.breaking, b.governs, b.margin],
    [6.446, 32.63, 1272.7, 106.5, 149.54, 22.52, 2397.9, 2999.3, 1272.7, 'tension', 6.36]);
  near(b.breaking, (Math.PI / 4) * 6.446 ** 2 * 39, 0.05, 'the breaking load worked by hand');
  assert.match(b.findings.find((f) => f.code === 'bolt.strength').text, /pla has no strength across its layers, strength_z/);
  assert.equal(b.findings.find((f) => f.code === 'bolt.load').level, 'pass'); assert.equal(printedBoltModel('M8x20 hex printed', { load: 1000 }).findings.find((f) => f.code === 'bolt.load').level, 'warn');
  assert.equal(printedBoltModel('M8x20 hex printed', { load: 1500 }).findings.find((f) => f.code === 'bolt.load').level, 'fail');
  // in a steel nut it takes the whole 0.2 mm gap: radius 3.3234 - 0.2 = 3.123, 6.246 mm; (π/4) 6.246² × 39 = 1195.0 N
  const steel = printedBoltModel('M8x20 hex printed', { nut: 'steel' }); assert.deepEqual([steel.root, steel.breaking, steel.strip.nutArea], [6.246, 1195, null]);
  // PETG standing pulls across its layers at petg.strength_z 23 MPa: 23 × 32.634 = 750.6 N; lying on a flat, along them
  const petg = printedBoltModel('M8x20 hex printed', { material: 'petg' }); assert.deepEqual([petg.tension.rule, petg.breaking], ['petg.strength_z', 750.6]);
  const lying = printedBoltModel('M8x20 hex printed', { material: 'petg', axis: 'x' }); assert.equal(lying.tension.rule, 'petg.strength');
  assert.ok(lying.rootArea < b.rootArea, 'lying, its flat takes some of the root away');
  // too fine to print: M5's 0.8 mm pitch is under five 0.2 mm layers; the smallest that prints is M6
  assert.throws(() => printedBoltModel('M5x20 hex printed'), /printedBoltModel: M5 has a 0\.8 mm pitch, finer than x1c prints: a thread needs 5 layers to a pitch \(1 mm at x1c\.layer 0\.2 mm\).*The smallest metric thread that would print is M6 \(1 mm pitch\)/);
  assert.equal(printedBoltModel('M5x20 hex printed', { printer: { name: 'fine', layer: 0.12 } }).thread, 'M5', 'at 0.12 mm layers an M5 prints');
  assert.throws(() => printedBoltModel('M8x20 hex printed', { material: 's275' }), /not a plastic/);
  assert.throws(() => printedBoltModel('M8 washer'), /not a bolt/);
  // lengthFor: a printed screw is any whole millimetre long
  assert.equal(lengthFor(6, 'M8 hex printed', { into: { kind: 'thread', depth: 22, material: 'pla' } }).length, 26, '6 mm of stack and 2.5 × 8 = 20 mm engaged');
  assert.equal(lengthFor(6, 'M8 hex printed', { into: { kind: 'thread', depth: 22, material: 'pla' } }).name, 'M8x26 hex printed', 'named as printed, not as a sold screw');
  // screwModel on a printed name: the printed bolt's outline, named printed and weighed in its plastic. The steel M8x20 hex
  // weighs 12.46 g at 7.85 g/cm³, so its outline is 12.46 / 7.85 = 1.587 cm³: 1.587 × pla.density 1.26 = 2.0 g, × petg's 1.27 = 2.016 g
  const ps = screwModel('M8x20 hex printed');
  assert.deepEqual([ps.name, ps.printed, ps.material, ps.mass], ['M8x20 hex printed', true, 'pla', 2]); assert.equal(screwModel('M8x20 hex').mass, 12.46);
  assert.equal(screwModel('M8x20 hex printed', { material: 'petg' }).mass, 2.016); assert.equal(printedBoltModel('M8x20 hex printed').grams, ps.mass, 'the grams printedBoltModel gives');
  assert.match(ps.findings.map((f) => f.text).join(' '), /printedBoltModel\('M8x20 hex printed', \{ material: 'pla' \}\) gives its strength/);
  assert.throws(() => screwModel('M8x20 hex printed', { material: 's275' }), /screw: M8x20 hex printed is printed, and s275 is no plastic/);
  // its solid: the screw with its thread drawn, standing on its head, which prints
  const g = printedBolt('M8x16 hex printed'); assert.equal(g.model.name, 'M8x16 hex printed'); prints(g, 'a printed M8 bolt on its head');
});

test('a printed bolt has no proof load: screwLoad, preload, torqueFor, stripping and seating refuse it by name, pointing to printedBoltModel; a printed nut is let through', () => {
  const { screwLoad, preload, torqueFor, stripping, seating, printedBoltModel } = fixings;
  // Read as steel, an M8 printed bolt "held" 2000 N with margin 2.66 and was told to tighten to 25.47 N m (class 8.8
  // proof: pi/4 (8 - 0.9382 x 1.25)² = 36.61 mm² at 580 MPa, 21233 N). In PLA it breaks at 1272.7 N (printedBoltModel), so each is refused
  const says = (fn) => new RegExp(`${fn}: M8x20 hex printed is a printed bolt, with no property class and no proof load.*printedBoltModel\\('M8x20 hex printed'`);
  assert.throws(() => screwLoad('M8x20 hex printed', { tension: 2000 }), says('screwLoad'));
  assert.throws(() => screwLoad('M8x20 hex printed', { tension: 200, depth: 20, material: 'pla' }), says('screwLoad'));
  assert.throws(() => torqueFor('M8x20 hex printed', { force: 1000 }), says('torqueFor'));
  assert.throws(() => preload('M8x20 hex printed', { torque: 1 }), says('preload'));
  assert.throws(() => stripping('M8x20 hex printed', { depth: 20, material: 'pla' }), says('stripping'));
  assert.throws(() => seating('M8x20 hex printed', { material: 'pla' }), /seating: .*printed bolt.*seating with a force \(N\) given/);
  assert.equal(printedBoltModel('M8x20 hex printed').breaking, 1272.7, 'where its strength is read');
  // the pressure under a printed head at a force given needs no proof load: 500 N on the hex's ring
  assert.ok(seating('M8x20 hex printed', { material: 'pla', force: 500 }).pressure > 0);
  // a printed nut takes a bought screw, whose proof load stands: the steel screw is still read
  assert.equal(stripping('M8 nut printed', { depth: 8, material: 'pla' }).proof, stripping('M8', { depth: 8, material: 'pla' }).proof);
  // refusals read with a plain word's article: an aluminium, an insert
  assert.throws(() => printedBoltModel('M8x20 hex printed', { material: 'al6061' }), /al6061 is an aluminium, not a plastic/);
  assert.throws(() => printedBoltModel('M8 insert'), /M8x12\.7 insert is an insert, not a bolt/);
});

test('the working figures no coupon measures say so: snap_play, pin_least and magnet_floor stay estimates, each naming what would measure it', () => {
  // The holds coupon measures the printer's fits (snap_clearance, pin_press, pin_slip, magnet_press, magnet_glue,
  // magnet_crush) and the snap barb; none of its rows measures these three, so none may claim a coupon measures it
  for (const k of ['snap_play', 'pin_least', 'magnet_floor']) {
    const f = DEFAULTS[k];
    assert.equal(f.kind, 'estimate', k);
    assert.doesNotMatch(f.source, /to be measured on the fixings coupon/i, k);
    assert.match(f.source, /No coupon row measures it.*so it stays an estimate: .+ would measure it/, k);
  }
});

// ---------- annular snaps ----------
const { annularSnapModel, annularBead, annularGroove, hubFactor, shaftFactor, tubeRing, SNAP_USES } = fixings;
// The lamp housing of the Bayer guide's worked example: Makrolon PC, E 2200 MPa (its secant modulus at 0.5%), ν 0.35.
// Its strength is set for the test only, so the strain limit does not get in the way
const makrolon = { name: 'makrolon', rules: { modulus: { value: 2200, unit: 'MPa' }, strength: { value: 65, unit: 'MPa' }, poisson: { value: 0.35 } } };

test('annular snap: the Bayer guide\'s lamp cover, worked by hand, from its geometric factor to its mating force', () => {
  // Bayer, Snap-Fit Joints for Plastics, the annular snap example (pages 22 and 23): d = 200 mm, t = 2.5 mm for both,
  // undercut 1 mm a side, lead 30° (a 45° face, rounded), μ = 0.6 (PC on PC, 0.5 × 1.2).
  // The hub's (the cover's) factor: k = d0 / d = 205 / 200 = 1.025;
  //   √((k − 1)/(k + 1)) = √(0.025 / 2.025) = 0.111111; (k² + 1)/(k² − 1) = 2.050625 / 0.050625 = 40.50617, + ν = 40.85617;
  //   X_N = 0.62 × 0.111111 / 40.85617 = 0.0016861. The guide reads 1.7 × 10⁻³ off its Fig. 27.
  near(hubFactor(1.025, 0.35), 0.0016861, 1e-7, 'X_N for the cover');
  // The housing's, a hollow shaft: k = d / di = 200 / 195 = 1.025641; √(0.025641 / 2.025641) = 0.112509;
  //   (k² + 1)/(k² − 1) = 2.051940 / 0.051940 = 39.50597, − ν = 39.15597; X_W = 0.62 × 0.112509 / 39.15597 = 0.0017815
  near(shaftFactor(200 / 195, 0.35), 0.0017815, 1e-7, 'X_W for the housing');
  // The guide takes the two as equal and gives each half the 2 mm of interference: P = y d Es X = 1 × 200 × 2200 ×
  //   0.0016861 = 741.9 N (748 N with X rounded to 1.7e-3), W = P (μ + tan α)/(1 − μ tan α) = 741.9 × 1.17735 / 0.65359
  //   = 741.9 × 1.80136 = 1336.4 N (the guide: 748 × 1.8 = 1346 N)
  near(1 * 200 * 2200 * hubFactor(1.025, 0.35) * (0.6 + Math.tan(Math.PI / 6)) / (1 - 0.6 * Math.tan(Math.PI / 6)), 1336.4, 0.5, 'the guide\'s mating force, by its own sum');
  // The model takes them as springs in series instead: k_N = 200 × 2200 × 0.0016861 = 741.88 N/mm, k_W = 200 × 2200 ×
  //   0.0017815 = 783.86 N/mm; k = 1 / (1/741.88 + 1/783.86) = 381.15 N/mm; P = 2 mm × 381.15 = 762.3 N, 2% over the
  //   guide's equal split: the cover takes 762.3 / 741.88 = 1.0275 mm (0.51% hoop strain, the guide's 0.5%) and the
  //   housing 0.9725 mm; W = 762.3 × 1.80136 = 1373.2 N
  const m = annularSnapModel({ diameter: 200, wall: 2.5, skirt: 2.5, bead: 1, lead: 30, back: 30 }, { material: makrolon, printer: { fit: 0, layer: 0.2, overhang: 45 }, friction: 0.6, uses: 'once' });
  assert.equal(m.interference, 2); assert.equal(m.lid.diameter, 200); assert.equal(m.lid.outside, 205); assert.equal(m.box.inside, 195);
  near(m.force, 762.3, 0.2, 'P'); near(m.lid.deflection, 1.0275, 0.001, 'the cover\'s share'); near(m.box.deflection, 0.9725, 0.001, 'the housing\'s');
  near(m.lid.strain, 0.0051, 0.0001, 'the cover\'s hoop strain, the guide\'s 0.5%'); near(m.insertion, 1373.2, 0.5, 'W');
  near(m.force / 748, 1.02, 0.01, 'within 2% of the guide\'s P'); near(m.insertion / 1346, 1.02, 0.01, 'and of its W');
  assert.equal(m.removal, m.insertion, 'a 30° return face lets go at the same force');
});

test('annular snap: the 60 mm pot\'s lid, worked by hand: shares, hoop strains against PLA\'s limit, forces, and the joint near its ends', () => {
  // d = 60, wall 1.68, skirt 1.26, clearance x1c.fit 0.2 (so the skirt's inside is 60.4, its outside 62.92), bead 0.4,
  // 1.5 mm in from each free end; PLA E 2680 MPa, ν 0.36, strength 39 MPa; μ 0.5; lead 30°, back 45°.
  // The wall: k = 60 / 56.64 = 1.059322; √(0.059322 / 2.059322) = 0.169726; (k² + 1)/(k² − 1) = 2.122163 / 0.122163 =
  //   17.37158, − 0.36 = 17.01158; X_W = 0.62 × 0.169726 / 17.01158 = 0.0061858. Remote at 1.8 √(60 × 1.68) = 18.072 mm,
  //   so 1.5 mm in is 1 + 2 × 1.5 / 18.072 = 1.1660 times stiffer: k_box = 1.1660 × 60 × 2680 × 0.0061858 = 1159.8 N/mm.
  // The skirt: k = 62.92 / 60.4 = 1.041722; √(0.041722 / 2.041722) = 0.142950; (k² + 1)/(k² − 1) = 2.085185 / 0.085185
  //   = 24.4783, + 0.36 = 24.8383; X_N = 0.62 × 0.142950 / 24.8383 = 0.0035682; remote at 1.8 √(60.4 × 1.26) = 15.703,
  //   so 1 + 3 / 15.703 = 1.19105; k_lid = 1.19105 × 60.4 × 2680 × 0.0035682 = 687.9 N/mm.
  // In series k = 1 / (1/1159.8 + 1/687.9) = 431.8 N/mm; the undercut 0.4 − 0.2 = 0.2 mm is 0.4 on the diameter, so
  //   P = 172.7 N; the wall takes 172.7 / 1159.8 = 0.1489 mm (0.248%), the skirt 0.2511 mm (0.416%).
  // PLA may see 0.7 × 0.6 × 39 / 2680 = 0.611% (a brief snap, opened often). Push on: 172.7 × (0.5 + tan 30°)/(1 − 0.5 tan 30°)
  //   = 172.7 × 1.51457 = 261.6 N; pull off: 172.7 × (0.5 + 1)/(1 − 0.5) = 518.2 N
  const m = annularSnapModel({ diameter: 60, wall: 1.68, skirt: 1.26, bead: 0.4, boxEnd: 1.5, lidEnd: 1.5 }, { pull: 10 });
  assert.deepEqual([m.clearance, m.undercut, m.interference, m.lid.diameter, m.lid.outside, m.box.inside], [0.2, 0.2, 0.4, 60.4, 62.92, 56.64]);
  near(m.box.X, 0.00619, 1e-5, 'X_W'); near(m.lid.X, 0.00357, 1e-5, 'X_N'); assert.equal(m.box.far, 18.07); assert.equal(m.box.factor, 1.17); assert.equal(m.lid.factor, 1.19);
  near(m.box.stiffness, 1159.8, 0.5, 'k_box'); near(m.lid.stiffness, 687.9, 0.5, 'k_lid'); near(m.force, 172.7, 0.2, 'P');
  near(m.box.deflection, 0.1489, 0.001, 'the wall\'s share'); near(m.lid.deflection, 0.2511, 0.001, 'the skirt\'s'); near(m.box.strain, 0.00248, 0.00005, 'the wall\'s strain, to four places'); near(m.lid.strain, 0.00416, 0.00005, 'the skirt\'s');
  near(m.permissible, 0.0061, 0.00005, 'PLA\'s limit, opened often'); near(m.insertion, 261.6, 0.5, 'push on'); near(m.removal, 518.2, 0.5, 'pull off'); assert.equal(m.margin, 51.82, "518.2 / 10");
  const byCode = (c) => m.findings.filter((f) => f.code === c);
  assert.deepEqual(byCode('snap.strain').map((f) => [f.level, f.refs.part]), [['pass', 'box'], ['pass', 'lid']]);
  assert.equal(byCode('snap.hold')[0].level, 'pass'); assert.equal(byCode('snap.printable')[0].level, 'pass'); assert.equal(byCode('snap.remote').length, 1);
  for (const f of m.findings) { assert.ok(['pass', 'info', 'warn', 'fail'].includes(f.level) && f.text && f.code, 'the kit\'s one shape'); assert.ok(!/[—–]/.test(f.text)); }
  for (const k of ['x1c.fit', 'x1c.overhang', 'pla.modulus', 'pla.strength', 'pla.poisson', 'fixings.snap_brief', 'fixings.snap_often', 'fixings.snap_remote', 'fixings.snap_friction', 'fixings.load_margin']) assert.ok(m.rests.some((r) => r.name === k), `rests on ${k}`);
  // at the ends, as the guide's simple form has it, no remote finding and the plain stiffness: 60 × 2680 × 0.0061858 = 994.7
  const end = annularSnapModel({ diameter: 60, wall: 1.68, skirt: 1.26, bead: 0.4 });
  near(end.box.stiffness, 994.7, 0.2, 'at the end'); assert.equal(end.findings.filter((f) => f.code === 'snap.remote').length, 0);
  // snapped once, the limit is the brief one: 0.7 × 39 / 2680 = 1.019%
  near(annularSnapModel({ diameter: 60, wall: 1.68, skirt: 1.26, bead: 0.4 }, { uses: 'once' }).permissible, 0.0102, 0.00005, 'snapped once');
  // PETG, a plastic with its own figures: 0.7 × 0.6 × 34 / 1810 = 0.789%
  near(annularSnapModel({ diameter: 60, wall: 1.68, skirt: 1.26, bead: 0.4 }, { material: 'petg' }).permissible, 0.0079, 0.00005, 'PETG');
});

test('annular snap: a closed end any distance off gives finite figures, and one far beyond the wall\'s bending counts as open', () => {
  // The wall bends over about 1/β; tubeRing's growing waves e^u overflow a double past about 709/β, which a closed
  // end 3.5 m from a 60 mm pot's joint used to reach (NaN strains, an infinite force). Past 2 × 12/β an end is long:
  // e^-24 of the load reaches it, so the joint is as if it were open and the strain at its root is 0.
  const far = (o) => annularSnapModel({ diameter: 60, wall: 1.68, skirt: 1.26, ...o }), open = far({});
  for (const o of [{ lidTop: 1e6 }, { boxFloor: 1e6 }, { lidTop: 4000, boxFloor: 4000 }]) {
    const m = far(o);
    assert.doesNotMatch(JSON.stringify(m), /NaN|Infinity/, JSON.stringify(o));
    assert.equal(m.findings.filter((f) => f.level === 'fail').length, 0, JSON.stringify(o));
    assert.deepEqual([m.undercut, m.insertion, m.removal], [open.undercut, open.insertion, open.removal]);
    for (const q of [m.box, m.lid]) if (q.closed != null) { assert.equal(q.root, 0); assert.equal(q.stiffer, 1); }
  }
  assert.deepEqual(tubeRing(3, 1e5, { A: 'free', B: 'closed' }).bendB, 0);
});

test('annular snap: sized from the pull with twice the margin, the least the print holds, and capped by the strain', () => {
  const p = { diameter: 60, wall: 1.68, skirt: 1.26, boxEnd: 1.5, lidEnd: 1.5 };
  // No pull: the least the print holds, fixings.snap_least 0.2 mm of undercut, so a bead of 0.4 mm
  const least = annularSnapModel(p);
  assert.deepEqual([least.sized, least.undercut, least.bead], [true, 0.2, 0.4]); assert.match(least.findings.find((f) => f.code === 'snap.hold').text, /give pull/);
  // 300 N: 2 × 300 / 3 (the 45° face at μ 0.5) = 200 N of P, over k 431.8 N/mm is 0.4632 mm on the diameter, 0.2316 a side
  const big = annularSnapModel(p, { pull: 300 });
  near(big.undercut, 0.2316, 0.001, 'the undercut for 300 N'); near(big.removal / 300, 2, 0.01, 'held twice over'); assert.equal(big.findings.find((f) => f.code === 'snap.hold').level, 'pass');
  // 1000 N asks more than the strain allows: the skirt limits P to 0.0061119 × 687.9 × 60.4 = 253.9 N, 0.588 mm on the
  // diameter, so the undercut is held to 0.294 mm, the strain passes and the hold fails, naming what the most would hold
  const over = annularSnapModel(p, { pull: 1000 });
  near(over.undercut, 0.294, 0.002, 'capped'); assert.deepEqual(over.findings.filter((f) => f.code === 'snap.strain').map((f) => f.level), ['pass', 'pass']);
  const hold = over.findings.find((f) => f.code === 'snap.hold'); assert.equal(hold.level, 'fail'); assert.match(hold.text, /comes off\. The strain allows up to 0\.294 mm of undercut, which would hold 76\d\.\d N/);
  // a bead given too tall fails both parts by name, with the most undercut the strain allows
  const tall = annularSnapModel({ ...p, bead: 0.9 });
  assert.deepEqual(tall.findings.filter((f) => f.code === 'snap.strain').map((f) => f.level), ['fail', 'fail']); assert.match(tall.findings.find((f) => f.code === 'snap.strain').text, /over its limit.*The most undercut the strain allows is 0\.294 mm/);
  // a bead given under the least the print holds warns
  assert.equal(annularSnapModel({ ...p, bead: 0.3 }).findings.find((f) => f.code === 'snap.least').level, 'warn');
  // through fixingsFor, the workspace's printer is read: its fit is the clearance
  assert.equal(fixingsFor({ printer: { fit: 0.3, layer: 0.2, overhang: 45 } }).annularSnapModel(p).clearance, 0.3);
});

test('annular snap: refused by name before any sum, and a return face past the printer\'s overhang fails', () => {
  const p = { diameter: 60, wall: 1.68, skirt: 1.26 };
  for (const [what, f, re] of [
    ['no figures', () => annularSnapModel('60'), /annularSnapModel: give the joint's figures/],
    ['no diameter', () => annularSnapModel({ wall: 1, skirt: 1 }), /diameter is a number above 0/],
    ['a wall that fills it', () => annularSnapModel({ ...p, wall: 30 }), /a wall of 30 mm fills a 60 mm box/],
    ['a bead under the clearance', () => annularSnapModel({ ...p, bead: 0.2 }), /a bead of 0\.2 mm is no taller than the x1c\.fit clearance of 0\.2 mm round the skirt, so it never catches/],
    ['a square lead', () => annularSnapModel({ ...p, lead: 90 }), /a lead of 90° is a square face the lid cannot be pushed over/],
    ['a back past square', () => annularSnapModel({ ...p, back: 120 }), /back is an angle from the axis above 0° and at most 90°/],
    ['no back', () => annularSnapModel({ ...p, back: 0 }), /back is an angle/],
    ['a far end below 0', () => annularSnapModel({ ...p, boxEnd: -1 }), /boxEnd is how far the joint is from that part's free end/],
    ['a use it has no limit for', () => annularSnapModel(p, { uses: 'daily' }), /uses is often or once/],
    ['friction that locks', () => annularSnapModel(p, { friction: 1 }), /friction is μ between the parts, 0 or more and under 1/],
    ['a pull of nothing', () => annularSnapModel(p, { pull: 0 }), /pull \(along the axis, in N\) is a number above 0/],
    ['a metal', () => annularSnapModel(p, { material: 'al6061' }), /an annular snap is two printed plastic parts; al6061 is a aluminium|al6061 is an? aluminium/],
    ['a plastic with no poisson', () => annularSnapModel(p, { material: { name: 'mystery', rules: { modulus: { value: 2000 }, strength: { value: 40 } } } }), /mystery has no poisson in its rule set/],
    ['options that are no options', () => annularSnapModel(p, 'pla'), /the second argument is its options/]]) assert.throws(f, re, what);
  assert.deepEqual(SNAP_USES, ['often', 'once']);
  const steep = annularSnapModel({ ...p, back: 60 }), f = steep.findings.find((x) => x.code === 'snap.printable');
  assert.equal(f.level, 'fail'); assert.match(f.text, /the 60° return face is past x1c\.overhang 45°: under the box's bead and over the lid's groove it needs support/);
  assert.equal(annularSnapModel({ ...p, back: 90 }).holds, true, 'a square return face holds for good');
});

test('annular snap: the bead and the groove print without support on a pot and a lid, and the seated bead touches nothing', () => {
  const m = annularSnapModel({ diameter: 30, wall: 1.68, skirt: 1.26, bead: 0.5 }), R = 15, H = 12, seg = 48, foot = 9, c = m.clearance;
  const ring = (r0, r1, z0, z1) => subtract(cylinder({ radius: r1, height: z1 - z0, center: [0, 0, (z0 + z1) / 2], segments: seg }), cylinder({ radius: r0, height: z1 - z0 + 2, center: [0, 0, (z0 + z1) / 2], segments: seg }));
  const bead = annularBead(m, { at: foot, segments: seg });
  assert.equal(bead.model, m); near(bb(bead)[1][0], R + m.bead, 0.01, 'the bead stands its height off the wall'); near(bb(bead)[1][2] - bb(bead)[0][2], m.length, 0.01, 'and is its length along it');
  near(m.length, 0.5 / 1 + 0.4 + 0.5 / Math.tan(Math.PI / 6), 0.001, 'return face 0.5 at 45°, land 0.4, lead face 0.5 / tan 30°');
  const pot = union(cylinder({ radius: R, height: 1.2, center: [0, 0, 0.6], segments: seg }), ring(R - 1.68, R, 1.2 - 0.01, H), bead);
  prints(pot, 'the pot with its bead, standing on its floor'); closed(pot, 'one closed solid');
  // The lid in place: its top on the rim, its skirt down to 5 mm, the groove cut with a lead-in at the mouth
  const groove = annularGroove(m, { at: foot, mouth: 5, segments: seg }), lidR = R + c + 1.26;
  const lid = subtract(union(cylinder({ radius: lidR, height: 1.6, center: [0, 0, H + 0.8], segments: seg }), ring(R + c, lidR, 5, H + 0.01)), groove);
  near(vol(intersect(lid, bead)), 0, 1e-6, 'seated, the bead sits in its groove clear of the skirt');
  assert.ok(vol(intersect(union(cylinder({ radius: lidR, height: 1.6, center: [0, 0, H + 0.8], segments: seg }), ring(R + c, lidR, 5, H + 0.01)), bead)) > 1, 'without the groove the bead would stand in the skirt');
  near(bb(groove)[0][2], 5 - 0.1, 1e-6, 'the lead-in opens out of the mouth');
  prints(translate([0, 0, H + 1.6], rotateX(Math.PI, lid)), 'the lid on its top, its groove and lead-in included'); closed(lid, 'one closed solid');
  assert.throws(() => annularGroove(m, { at: foot, mouth: 9 }), /mouth is the z of the skirt's open end, below the groove's foot/);
});

test('annular snap fixes after check 1: tubeRing, the beam on an elastic foundation, checked against its textbook cases', () => {
  // In ξ = βx the wall bends as w'''' + 4w = 0 and a ring load q steps w''' by 1 (in q / (D β³)). Hetényi (1946):
  //   a long tube both ways, w = Pβ / 2k = q / (8 D β³), so 1/8; the load at a free end, 2Pβ / k = 1/2 (four times).
  near(tubeRing(6, 6).w, 0.125, 1e-6, 'a long tube'); near(tubeRing(0, 6, { A: 'free' }).w, 0.5, 1e-6, 'at a free end');
  // A short skirt is a cantilever: the foundation counts for little, so w = q L³ / 3 D, in units (βL)³ / 3, and the
  //   curvature at its root q L / D, in units βL. βL = 0.1: 0.001 / 3 = 3.333e-4 and 0.1
  const short = tubeRing(0, 0.1, { A: 'free', B: 'closed' });
  near(short.w, 0.001 / 3, 2e-6, 'a short cantilever\'s tip'); near(short.bendB, 0.1, 1e-4, 'and its root\'s curvature');
  near(tubeRing(0.5, 0, { A: 'long', B: 'closed' }).w + tubeRing(1e-9, 3, { A: 'closed' }).w, 0, 1e-6, 'nothing moves at a closed end');
  assert.throws(() => tubeRing(-1, 2), /tubeRing: a is the load's distance from an end, in 1\/β, 0 or more/);
  assert.throws(() => tubeRing(1, 2, { A: 'held' }), /ends\.A is free, closed or long/);
});

test('annular snap fixes after check 1: a lid\'s closed top near the groove stiffens the skirt and bends it at its root', () => {
  // The pot's skirt: R = (60.4 + 62.92) / 4 = 30.83 mm, t = 1.26, ν 0.36; β⁴ = 3 × (1 − 0.1296) / (30.83² × 1.26²)
  //   = 2.6112 / 1508.99 = 0.0017304, β = 0.20396 /mm, so 1/β = 4.903 mm. The groove 1.5 mm from the mouth (ξ 0.3059)
  //   and 1.3 mm from the top (ξ 0.2651): open, w = 0.27714; closed, 0.0060336; 45.93 times as stiff.
  const p = { diameter: 60, wall: 1.68, skirt: 1.26, bead: 0.4, boxEnd: 1.5, lidEnd: 1.5 }, b = 0.20396;
  near(tubeRing(1.5 * b, 12, { A: 'free' }).w / tubeRing(1.5 * b, 1.3 * b, { A: 'free', B: 'closed' }).w, 45.93, 0.02, 'the beam\'s ratio');
  const free = annularSnapModel(p), top = annularSnapModel({ ...p, lidTop: 1.3 });
  assert.equal(free.findings.find((f) => f.code === 'snap.strain' && f.refs.part === 'box').level, 'pass', 'as a free tube the wall passes');
  assert.deepEqual([top.lid.decay, top.lid.stiffer, top.lid.factor], [4.9, 45.93, 54.71], '1.191 × 45.93 = 54.71');
  // k_lid = 687.9 × 45.93 = 31,595 N/mm; k = 1 / (1/1159.8 + 1/31,595) = 1118.7; P = 0.4 × 1118.7 = 447.5 N; the wall
  //   takes 447.5 / 1159.8 = 0.3858 mm, 0.643% hoop strain, over PLA's 0.611%: it fails
  near(top.force, 447.5, 0.5, 'P with the skirt held round'); near(top.box.strain, 0.0064, 0.00005, 'the wall takes nearly all of it');
  assert.equal(top.findings.find((f) => f.code === 'snap.strain' && f.refs.part === 'box').level, 'fail');
  // The root: w''(ξ) at the top = 0.25862; q = P / (π d) = 447.5 / (π × 60.4) = 2.3583 N/mm; M = w'' q / β =
  //   0.25862 × 2.3583 / 0.20396 = 2.9903 N mm/mm; ε = 6 M (1 − ν²) / (E t²) = 6 × 2.9903 × 0.8704 / (2680 × 1.5876) = 0.367%
  near(top.lid.root, 0.0037, 0.00005, 'the bending at the skirt\'s root'); assert.equal(top.findings.find((f) => f.code === 'snap.root').level, 'pass');
  assert.match(top.findings.find((f) => f.code === 'snap.closed').text, /the lid's skirt meets its top 1\.3 mm from the joint, where a tube's wall bends over about 1\/β = 4\.9 mm: held round there, it is 45\.93 times as stiff/);
  // Sized, the strain holds it under the least the print holds, and says so
  const sized = annularSnapModel({ ...p, bead: undefined, lidTop: 1.3 }, { pull: 10 });
  assert.equal(sized.undercut, 0.19); assert.equal(sized.findings.find((f) => f.code === 'snap.least').level, 'warn');
  // The example: the bead 6 mm under the rim, the groove 5.8 mm under the top: every strain passes, the root's at 0.32%
  const ex = annularSnapModel({ ...p, bead: undefined, boxEnd: 6, lidTop: 5.8, boxFloor: 30.3 }, { pull: 10 });
  assert.deepEqual([ex.bead, ex.lid.stiffer, ex.box.strain, ex.lid.strain, ex.lid.root, ex.insertion, ex.removal], [0.4, 1.3, 0.0023, 0.0043, 0.0032, 351.1, 695.4]);
  assert.ok(ex.findings.every((f) => f.level === 'pass' || f.level === 'info'), 'nothing warns or fails');
  // the free ends' share alone in snap.remote: 1 + 2 × 6 / 18.072 = 1.66 for the wall, 1.19 for the skirt (its 1.54 is
  //   that times the top's 1.3, said in snap.closed)
  assert.deepEqual(ex.findings.find((f) => f.code === 'snap.remote').values, { box: 1.66, lid: 1.19 }); assert.deepEqual([ex.lid.remote, ex.lid.factor], [1.19, 1.54]);
  assert.match(ex.findings.find((f) => f.code === 'snap.closed' && f.refs.part === 'box').text, /far enough off to make no difference/);
  // a root that bends too far fails by name, where the hoop strains pass: a stiff 4 mm wall and a 0.84 mm skirt whose
  //   groove is 1.5 mm under its top bend the skirt's root 1.94%, over the 0.61%
  const bent = annularSnapModel({ diameter: 60, wall: 4, skirt: 0.84, bead: 0.4, lidEnd: 1.5, lidTop: 1.5 });
  assert.deepEqual(bent.findings.filter((f) => f.level === 'fail').map((f) => f.code), ['snap.root']); near(bent.lid.root, 0.0194, 0.00005, 'the root');
  assert.match(bent.findings.find((f) => f.code === 'snap.root').text, /the lid's skirt bends where it meets its top: 1\.94% strain at the root where pla may see 0\.61%\. Move the joint further from the top \(the wall bends over about 1\/β, 3\.99 mm\), or a smaller bead: the most undercut the strain allows is 0\.063 mm/);
  assert.throws(() => annularSnapModel({ ...p, lidTop: -1 }), /lidTop is how far the joint is from the lid's top, its closed end, at least the 1\.26 mm skirt \(got -1\)/);
});

test('annular snap fixes after check 2: a bead held to the strain passes its own check whatever the limit rounds to', () => {
  // The strains are shown to 4 places but judged unrounded. PLA snapped once may see 0.7 × 39 / 2680 = 0.0101866.
  //   The checker's case, d 20.19, wall 1.72, skirt 1.11: the strain caps the bead at 0.148 mm of undercut, P 327.8 N,
  //   and the skirt (1565.1 N per mm, 20.59 mm) takes 327.8 / 1565.1 / 20.59 = 0.010172, under 0.0101866. Shown, it is
  //   0.0102, and compared rounded it failed the bead the model had just sized
  const pla = annularSnapModel({ diameter: 20.19, wall: 1.72, skirt: 1.11, boxEnd: 4.61, lidEnd: 4.54 }, { uses: 'once' });
  assert.equal(pla.undercut, 0.148); assert.equal(pla.most.undercut, 0.148); assert.equal(pla.lid.strain, 0.0102);
  near(327.8 / 1565.1 / 20.59, 0.010172, 0.000001, 'the hand figure'); near(pla.permissible, 0.0102, 0.00005);
  assert.deepEqual(pla.findings.filter((f) => f.code === 'snap.strain').map((f) => f.level), ['pass', 'pass']);
  // PETG opened often may see 0.7 × 0.6 of its yield strain, 0.0078895. d 84.02, wall 1.15, skirt 2.76, the floor
  //   20.54 mm off: the bead is capped at 0.425 mm, P 260.3 N, and the wall (393.5 N per mm, 84.02 mm) takes
  //   260.3 / 393.5 / 84.02 = 0.0078731, under 0.0078895 but shown 0.0079
  const petg = annularSnapModel({ diameter: 84.02, wall: 1.15, skirt: 2.76, boxEnd: 2.31, lidEnd: 4.49, boxFloor: 20.54 }, { material: 'petg', pull: 184.2, friction: 0.12 });
  assert.equal(petg.undercut, 0.425); assert.equal(petg.most.undercut, 0.425); assert.equal(petg.box.strain, 0.0079);
  near(260.3 / 393.5 / 84.02, 0.0078731, 0.000001, 'the hand figure');
  assert.deepEqual(petg.findings.filter((f) => f.code === 'snap.strain').map((f) => f.level), ['pass', 'pass']);
  // and a bead over the limit still fails: 0.2 mm of undercut in the PLA case
  assert.equal(annularSnapModel({ diameter: 20.19, wall: 1.72, skirt: 1.11, boxEnd: 4.61, lidEnd: 4.54, bead: 0.4 }, { uses: 'once' }).findings.filter((f) => f.code === 'snap.strain' && f.level === 'fail').length, 1);
});

test('annular snap fixes after check 2: a closed end nearer the joint than its part\'s wall is refused by name', () => {
  // At 0 mm the wall cannot give (the lid's factor came out null, P Infinity, strains NaN); under the wall's own
  //   thickness it is a solid corner, which the thin-shell beam does not model (at 0.000001 mm P came out negative)
  const p = { diameter: 60, wall: 1.68, skirt: 1.26, bead: 0.4 };
  for (const [what, q, re] of [
    ['the lid\'s top at the groove', { lidTop: 0 }, /lidTop is how far the joint is from the lid's top, its closed end, at least the 1\.26 mm skirt \(got 0\): a joint nearer its closed end than that is a solid corner that cannot give/],
    ['the box\'s floor at the bead', { boxFloor: 0 }, /boxFloor is how far the joint is from the box's floor, its closed end, at least the 1\.68 mm wall \(got 0\)/],
    ['both at 0', { lidTop: 0, boxFloor: 0 }, /boxFloor is how far/],
    ['a hair off', { lidTop: 0.000001 }, /lidTop is how far.*at least the 1\.26 mm skirt/],
    ['just under the skirt', { lidTop: 1.25 }, /at least the 1\.26 mm skirt \(got 1\.25\)/],
    ['just under the wall', { boxFloor: 1.6 }, /at least the 1\.68 mm wall \(got 1\.6\)/]]) assert.throws(() => annularSnapModel({ ...p, ...q }), re, what);
  // One wall off is the nearest allowed, and every figure it gives is finite
  const at = annularSnapModel({ ...p, lidTop: 1.26, boxFloor: 1.68 });
  for (const q of [at.box, at.lid]) for (const k of ['factor', 'stiffer', 'strain', 'root']) assert.ok(Number.isFinite(q[k]), `${k} ${q[k]}`);
  assert.ok(Number.isFinite(at.force) && at.force > 0); assert.doesNotMatch(JSON.stringify(at.findings), /NaN|Infinity/);
});

test('annular snap fixes after check 1: a friction-locked lead, a groove through the skirt, a sized bead within its own strain, and the push', () => {
  const p = { diameter: 60, wall: 1.68, skirt: 1.26 };
  // μ tan α: 0.6 × tan 60° = 1.039, 1 or more, so the lead locks; at μ 0.5, 0.866, it goes on (2435.1 N square)
  assert.throws(() => annularSnapModel({ ...p, lead: 60 }, { friction: 0.6 }), /annularSnapModel: a 60° lead at friction 0\.6 locks: μ tan α is 1\.04, 1 or more, so no push slides the skirt over it\. Give a lead under 59° at that friction/);
  near(annularSnapModel({ ...p, lead: 60 }).insertion, 2435.1, 0.5, 'steep, but it goes on');
  // The checker's case: a 0.6 mm bead in a 0.4 mm skirt, its groove (outer radius 100.8) past the skirt's (100.6)
  assert.throws(() => annularSnapModel({ diameter: 200, wall: 3, skirt: 0.4, bead: 0.6 }, { uses: 'once' }), /a bead of 0\.6 mm needs a groove as deep in the 0\.4 mm skirt, which cuts right through it/);
  // A sized bead in a 0.5 mm skirt leaves 0.5 − 0.4 = 0.1 mm behind its groove, under one 0.42 mm line: it fails
  const thin = annularSnapModel({ ...p, skirt: 0.5 }).findings.find((f) => f.code === 'snap.skirt');
  assert.equal(thin.level, 'fail'); assert.match(thin.text, /the groove leaves 0\.1 mm of the 0\.5 mm skirt behind it, under the x1c\.line 0\.42 mm line/);
  assert.equal(annularSnapModel({ ...p, boxEnd: 1.5, lidEnd: 1.5 }).findings.find((f) => f.code === 'snap.skirt').level, 'pass', '1.26 − 0.4 = 0.86 mm, two lines');
  // A bead capped by the strain is rounded down: d 10, wall 0.8, skirt 2. The strain allows 0.0447 mm; rounded to
  //   the nearest it was 0.045 and the wall's strain 0.0062 failed against 0.0061. Down, 0.044, and it passes
  const small = annularSnapModel({ diameter: 10, wall: 0.8, skirt: 2 }, { pull: 50 });
  assert.equal(small.undercut, 0.044); assert.ok(small.findings.filter((f) => f.code === 'snap.strain').every((f) => f.level === 'pass'), 'within its own strain');
  // and a bead sized from the pull is rounded up, so it holds the pull twice over: 300 N wants 0.2316 mm, drawn 0.232
  const pulled = annularSnapModel({ ...p, boxEnd: 1.5, lidEnd: 1.5 }, { pull: 300 });
  assert.equal(pulled.undercut, 0.232); assert.ok(pulled.margin >= 2, `held ${pulled.margin} times`);
  // Given push, the square push on is judged: 261.6 N for the pot's lid
  const lid = { ...p, boxEnd: 1.5, lidEnd: 1.5 };
  assert.equal(annularSnapModel(lid, { push: 300 }).findings.find((f) => f.code === 'snap.push').level, 'pass');
  assert.match(annularSnapModel(lid, { push: 100 }).findings.find((f) => f.code === 'snap.push').text, /pushed with 100 N, the lid goes on only at a tilt: square it takes 261\.6 N/);
  assert.throws(() => annularSnapModel(lid, { push: 0 }), /push \(along the axis, in N\) is a number above 0/);
});

test('annular snap, a slotted skirt (#309): the 60 mm pot\'s lid in 16 fingers, worked by hand, pushes on with about a tenth of the force', () => {
  const { skirtFinger, snapSlots } = fixings;
  // The slotted pot (examples/bench enclosures/snap-pot:slotted): bead 14 mm under the rim, groove 13.8 mm under the
  //   lid's top, 16 fingers by 1 mm slots (fixings.snap_slot), each 11.8 mm from its root to the groove's top edge.
  // One finger, a ring's sector: ri = 30 + 0.2 = 30.2, ro = 30.2 + 1.26 = 31.46, rm = 30.83
  //   φ = π/16 − 1/(2 × 30.83) = 0.196350 − 0.016218 = 0.180132 rad (20.64° whole), arc 2 φ rm = 11.107 mm
  //   A = φ (ro² − ri²) = 0.180132 × 77.7924 = 13.9947 mm², A x̄ = 2 (ro³ − ri³) sin φ / 3 = 429.187, x̄ = 30.6678
  //   ∫x² dA = (ro⁴ − ri⁴)(φ + sin φ cos φ) / 4 = 13164.372, I = 13164.372 − 13.9947 × 30.6678² = 2.1412 mm⁴
  //   (the flat 11.107 × 1.26³ / 12 is 1.852: the curve stiffens it by about a sixth)
  //   c = max(ro − x̄ = 0.7922, x̄ − ri cos φ = 0.9564) = 0.9564
  //   k = 3 E I / L³ = 3 × 2680 × 2.1412 / 11.8³ = 10.478 N/mm at 11.8 mm (the bare beam, below)
  const f = skirtFinger({ count: 16, width: 1, reach: 11.8, inside: 30.2, outside: 31.46 }, 2680);
  near(f.angle, 20.64, 0.01, 'angle'); near(f.width, 11.107, 0.001, 'arc'); near(f.inertia, 2.1412, 0.0001, 'I'); near(f.fibre, 0.9564, 0.0001, 'c'); near(f.stiffness, 10.478, 0.001, 'k');
  // Narrow and thin, the sector is the rectangle: 200 fingers of a 1 mm ring 100 mm in, I → w t³ / 12
  const thin = skirtFinger({ count: 200, width: 0.1, reach: 10, inside: 100, outside: 101 }, 1000), w = (2 * Math.PI * 100.5) / 200 - 0.1;
  near(thin.inertia, w / 12, 1e-4, 'the rectangle\'s I'); near(thin.stiffness, (1000 * w) / (4 * 1000), 1e-4, 'E w t³ / 4 L³'); near(thin.strainPerY, (3 * 0.5) / 100, 3e-4, '3 (t/2) / L², c 0.5085: the finger\'s inner corners lie 0.0085 mm further in for its curve');
  const p = { diameter: 60, wall: 1.68, skirt: 1.26, boxEnd: 14, lidEnd: 1.5, lidTop: 13.8 };
  const m = annularSnapModel({ ...p, slots: { count: 16, reach: 11.8 } }, { pull: 10 });
  // The bead is the least the print holds, 0.2 mm undercut, 0.4 mm tall, 0.4/tan 45° + 0.4 (land, two layers) + 0.4/tan 30° = 1.493 mm
  //   long. It bears on each finger at the groove's bottom edge, the groove's height below its top: the arm is
  //   11.8 + 1.493 + 2 × 0.2 = 13.693 mm, so k = 3 × 2680 × 2.1412 / 13.693³ = 17215.3 / 2567.41 = 6.705 N/mm, and the
  //   lid is 16 × 6.705 / 2 = 53.64 N per mm of diameter.
  // The wall stays the guide's tube: 2535.8 N/mm (remote 1 + 2 × 14/18.07 = 2.55 times). In series with the fingers'
  //   53.64, k = 1 / (1/2535.8 + 1/53.64) = 52.53 N/mm, so P = 52.53 × 0.4 = 21.01 N. Each finger is pushed out
  //   21.01 / 53.64 / 2 = 0.1959 mm, so its root strains 3 × 0.9564 × 0.1959 / 13.693² = 0.30%, under PLA's 0.61%
  //   when opened often (49% of it).
  //   On square: 21.01 × (0.5 + tan 30°) / (1 − 0.5 tan 30°) = 21.01 × 1.5146 = 31.8 N; off at 45°: × 3 = 63.0 N, 6.3 times the 10 N pull
  assert.equal(m.bead, 0.4); assert.equal(m.slots.arm, 13.693); near(m.box.stiffness, 2535.8, 0.1, 'wall'); near(m.lid.stiffness, 53.6, 0.1, 'fingers');
  near(m.force, 21.0, 0.05, 'P'); near(m.lid.strain, 0.003, 0.00005, 'root strain'); near(m.insertion, 31.8, 0.05, 'push on'); near(m.removal, 63.0, 0.05, 'pull off'); near(m.margin, 6.3, 0.01, 'margin');
  // The same bead in a whole skirt there: 217.7 N of P, 10.4 times the fingers', and 329.7 N to push on square
  const whole = annularSnapModel(p, { pull: 10 });
  assert.equal(whole.bead, 0.4); near(whole.force, 217.7, 0.05, 'whole skirt'); near(m.slots.whole, whole.force, 0.05, 'the model says what the whole skirt would take');
  const fingers = m.findings.find((x) => x.code === 'snap.fingers');
  assert.match(fingers.text, /slotted into 16 fingers by 1 mm slots \(fixings\.snap_slot\), each 11\.11 mm wide and 11\.8 mm from the slots' closed end to the groove, and borne on by the bead at the groove's bottom edge, 13\.693 mm from it: 6\.7 N per mm pushed out there.*A whole skirt would take 217\.7 N of transverse force for this bead, the fingers 21 N, 10\.4 times less/);
  const strain = m.findings.filter((x) => x.code === 'snap.strain');
  assert.deepEqual(strain.map((x) => x.level), ['pass', 'pass']); assert.match(strain[1].text, /the lid's fingers are 0\.3% bending strain at their root \(each pushed out 0\.196 mm at 13\.693 mm from it, where the bead bears\)/);
  assert.ok(!m.findings.some((x) => x.code === 'snap.closed' && x.refs?.part === 'lid'), 'the top holds no finger round: each is clamped at its root already');
  assert.ok(m.rests.some((r) => r.name === 'fixings.snap_slot'));
  // Short fingers strain more than a whole skirt: reaching 5.8 mm (borne on at 7.411 mm), 8 fingers cap the sized bead under the least the print holds
  const short = annularSnapModel({ diameter: 60, wall: 1.68, skirt: 1.26, boxEnd: 6, lidEnd: 1.5, lidTop: 5.8, slots: { count: 8, reach: 5.8 } }, { pull: 10 });
  assert.equal(short.undercut, 0.097); assert.equal(short.slots.arm, 7.411); assert.equal(short.findings.find((x) => x.code === 'snap.least').level, 'warn');
  assert.ok(short.findings.filter((x) => x.code === 'snap.strain').every((x) => x.level === 'pass'), 'held within its own strain');
  // A given bead too big for short fingers fails their strain, naming longer fingers
  const over = annularSnapModel({ ...p, bead: 0.6, slots: { count: 6, reach: 5 } }).findings.filter((x) => x.code === 'snap.strain')[1];
  assert.equal(over.level, 'fail'); assert.match(over.text, /longer fingers/);
  // Refused by name
  assert.throws(() => annularSnapModel({ ...p, slots: { count: 2, reach: 10 } }), /slots\.count is how many fingers the skirt is slotted into, a whole number, 3 or more \(got 2\)/);
  assert.throws(() => annularSnapModel({ ...p, slots: { count: 16, reach: 10, width: 0.2 } }), /slots\.width is the slots' width, at least the x1c\.print_gap 0\.3 mm that prints apart \(got 0\.2\)/);
  assert.throws(() => annularSnapModel({ ...p, slots: { count: 16, reach: 2 } }), /slots\.reach of 2 mm is under twice the 1\.26 mm skirt, too short to bend as a finger: give 2\.52 mm or more/);
  assert.throws(() => annularSnapModel({ ...p, slots: { count: 16, reach: 14 } }), /slots\.reach of 14 mm runs past the lid's top, 13\.8 mm from the groove \(lidTop\)/);
  assert.throws(() => annularSnapModel({ ...p, slots: { count: 100, reach: 10 } }), /100 fingers with 1 mm slots leave each 0\.937 mm wide, under the 1\.26 mm skirt: give fewer, at most 85/);
  assert.throws(() => annularSnapModel({ ...p, slots: { count: 16, reach: 10, depth: 3 } }), /slots has no depth: it takes count, reach and width/);
  assert.throws(() => annularSnapModel({ ...p, slots: 16 }), /slots is \{ count, reach, width \}/);
  // The slots as cut: 16 round-ended slots through the skirt from below the mouth up to 11.8 mm over the groove's top
  const foot = 20, mouth = foot - 0.2 - 1.5, cut = snapSlots(m, { at: foot, mouth }), box = bb(cut);
  near(box[1][2], foot + m.length + 0.2 + 11.8, 1e-6, 'the slots\' closed end'); near(box[0][2], mouth - 0.1, 1e-6, 'open past the mouth');
  near(Math.hypot(box[1][0], box[1][1]) / Math.SQRT2, 30.2 + 1.26 + 0.1, 0.01, 'through the skirt');
  // 16 slots of 1 mm by 1.46 mm through (the 1.26 mm skirt and 0.1 mm past each face), each (z span − 0.5) long with a half disc of 0.5 mm on top
  const span = foot + m.length + 0.2 + 11.8 - (mouth - 0.1);
  near(vol(cut), 16 * 1.46 * (1 * (span - 0.5) + (Math.PI * 0.25) / 2), 0.1, 'volume (the round end drawn in 24 faces)');
  // The lid on its top with its slots cut prints with no support and stays one closed solid
  const lidR = 31.46, seg = 96, top = foot + 15, lid0 = union(cylinder({ radius: lidR, height: 1.6, center: [0, 0, top + 0.8], segments: seg }),
    subtract(cylinder({ radius: lidR, height: top - mouth, center: [0, 0, (top + mouth) / 2], segments: seg }), cylinder({ radius: 30.2, height: top - mouth + 2, center: [0, 0, (top + mouth) / 2], segments: seg })));
  const lid = subtract(lid0, annularGroove(m, { at: foot, mouth, segments: seg }), cut);
  prints(translate([0, 0, top + 1.6 - mouth], rotateX(Math.PI, translate([0, 0, -mouth], lid))), 'the slotted lid on its top'); closed(lid, 'one closed solid');
  assert.throws(() => snapSlots(whole, { mouth }), /snapSlots: give an annular snap's model with slots/);
  assert.throws(() => snapSlots(m, { at: foot, mouth: 40 }), /mouth is the z of the skirt's open end, below the slots' closed end/);
});

test('annular snap, a slotted skirt: the bead bears on each finger at the groove\'s bottom edge, so a pull is held at that arm, not the slots\' reach', () => {
  const { snapSlots } = fixings;
  // The slotted pot's lid pulled with 40 N. Its slots end 11.8 mm over the groove's top edge, but the bead never pushes
  //   there: going on, the lip below the groove rides over the bead's crest; coming off, the groove's lower face rides up
  //   the return face. Either way a finger is pushed out the whole undercut at the groove's bottom edge, the groove's
  //   height (the bead's 1.493 mm length and 0.2 mm clearance at each end) further from the root: 11.8 + 1.493 + 0.4 = 13.693 mm.
  //   At 13.693 mm, k = 3 × 2680 × 2.1412 / 13.693³ = 6.705 N/mm, 16 fingers 53.64 N per mm of diameter, in series with
  //   the wall's 2535.8: 52.53 N/mm. A 0.4 mm bead (0.2 mm undercut): P = 52.53 × 0.4 = 21.01 N, off at 45° and μ 0.5,
  //   × (0.5 + 1) / (1 − 0.5) = 3: 63.0 N, 1.58 times the 40 N pull, under the 2 times fixings.load_margin, so a warning.
  //   Taken at 11.8 mm, the fingers were 83.82 N per mm and the pull-off 97.4 N, 2.43 times: a pass it had not earned.
  const p = { diameter: 60, wall: 1.68, skirt: 1.26, boxEnd: 14, lidEnd: 1.5, lidTop: 13.8 }, slots = { count: 16, reach: 11.8 };
  const given = annularSnapModel({ ...p, bead: 0.4, slots }, { pull: 40 });
  assert.equal(given.slots.arm, 13.693); near(given.removal, 63.0, 0.05, 'pull-off at the arm'); assert.equal(given.margin, 1.58);
  assert.equal(given.findings.find((x) => x.code === 'snap.hold').level, 'warn');
  // Sized for that pull, the bead grows, and with it the groove and the arm, until the bead holds the pull at its own arm:
  //   a 0.464 mm bead is 0.464 + 0.4 + 0.464/tan 30° = 1.668 mm long, so the arm is 11.8 + 1.668 + 0.4 = 13.868 mm, and
  //   the pull-off 80.2 N, 2.0 times the 40 N
  const sized = annularSnapModel({ ...p, slots }, { pull: 40 });
  assert.equal(sized.bead, 0.464); assert.equal(sized.length, 1.668); assert.equal(sized.slots.arm, 13.868); near(sized.removal, 80.2, 0.05, 'pull-off');
  assert.ok(sized.margin >= 2, `holds the pull twice over at its own arm (${sized.margin})`); assert.equal(sized.findings.find((x) => x.code === 'snap.hold').level, 'pass');
  // The arm is the drawn one: from the slots' closed end, as snapSlots cuts it, down to the groove's bottom edge, at - clearance
  const foot = 20, top = bb(snapSlots(sized, { at: foot, mouth: foot - 0.2 - 1.5 }))[1][2];
  near(top - (foot - sized.clearance), sized.slots.arm, 1e-6, 'from the slots\' closed end to the groove\'s bottom edge');
  // A whole skirt has no arm: its figures are the guide's tube as before
  assert.equal(annularSnapModel(p, { pull: 40 }).slots, undefined);
});

test('annular snap, a slotted skirt: the most undercut a failing bead names is worked at its own arm, so a bead that size passes', () => {
  // The pot's figures in 8 fingers reaching 4 mm, with a 0.9 mm bead: far too big, so the lid's strain fails and names the
  //   most undercut the strain allows. Taken at the 0.9 mm bead's 7.259 mm arm that was 0.08 mm, but a 0.28 mm bead has a
  //   shorter groove, so a 5.565 mm arm: stiffer fingers (k goes as 1 / L³) and more root strain per mm (3 c y / L²), 0.72%
  //   against the 0.61% allowed, a fail of its own. Worked down to an undercut that passes at its own arm, it is 0.067 mm,
  //   and a thousandth more fails: the most, rounded down, as the sized path finds it
  const p = { diameter: 60, wall: 1.68, skirt: 1.26, boxEnd: 14, lidEnd: 1.5, lidTop: 16 }, slots = { count: 8, reach: 4 };
  const lid = (m) => m.findings.find((x) => x.code === 'snap.strain' && x.refs?.part === 'lid').level;
  const given = annularSnapModel({ ...p, bead: 0.9, slots }, { pull: 40 });
  assert.equal(lid(given), 'fail'); assert.equal(given.most.undercut, 0.067);
  assert.match(given.findings.find((x) => x.code === 'snap.strain' && x.refs?.part === 'lid').text, /most undercut the strain allows is 0\.067 mm/);
  for (const reach of [3, 4, 6]) for (const count of [8, 16]) {
    const big = annularSnapModel({ ...p, bead: 1.0, slots: { count, reach } }, { pull: 40 });
    const at = (u) => annularSnapModel({ ...p, bead: +(u + big.clearance).toFixed(3), slots: { count, reach } }, { pull: 40 });
    const most = at(big.most.undercut), over = at(big.most.undercut + 0.001);
    assert.equal(lid(big), 'fail', `${count} fingers reaching ${reach} mm, the 1 mm bead`);
    assert.equal(lid(most), 'pass', `${count} fingers reaching ${reach} mm, at the ${big.most.undercut} mm it names`);
    assert.equal(lid(over), 'fail', `${count} fingers reaching ${reach} mm, a thousandth over`);
    assert.ok(most.removal <= big.most.removal + 1e-9, `the pull-off it names holds at that bead (${most.removal} against ${big.most.removal})`);
    // The sized bead, held to the strain, comes to the same most
    assert.equal(annularSnapModel({ ...p, slots: { count, reach } }, { pull: 400 }).most.undercut, big.most.undercut);
  }
});

test('annular snap, a slotted skirt: every given bead, passing or failing, names the same most undercut, and it holds what it says', () => {
  // With few fingers the box's wall shares the stiffness, so the limit at a bead's own arm neither only falls nor only
  //   rises with the bead: the most is searched over every thousandth. The 60 mm pot in 4 fingers reaching 4 mm passes
  //   at 0.160 mm and fails at 0.161 (it named 0.152, 0.139 and 0.130 for beads of 0.5, 0.8 and 1.1 before); the 90 mm
  //   joint in 4 fingers reaching 8 mm passes at 0.196 and not at 0.198, which a passing 0.35 mm bead named before
  const strains = (m) => m.findings.filter((x) => /^snap\.(strain|root)$/.test(x.code)).every((x) => x.level === 'pass');
  const pot = { diameter: 60, wall: 1.68, skirt: 1.26, boxEnd: 14, lidEnd: 1.5, lidTop: 16 }, wide = { diameter: 90, wall: 2, skirt: 1.2, boxEnd: 20, lidEnd: 2 };
  const cases = [[pot, 4, 4, 0.16], [wide, 4, 8, 0.196], [pot, 8, 4, 0.067], [pot, 16, 4, null], [wide, 16, 8, null]];
  for (const [p, count, reach, want] of cases) {
    const at = (u) => annularSnapModel({ ...p, bead: +(u + 0.2).toFixed(3), slots: { count, reach } }, { pull: 1500 });
    const named = [0.35, 0.5, 0.8, 1.1].filter((b) => b < p.skirt).map((b) => at(b - 0.2).most);
    const u = named[0].undercut, say = `${p.diameter} mm in ${count} fingers reaching ${reach} mm`;
    for (const m of named) assert.deepEqual(m, named[0], `${say}: every bead names the same most`);
    if (want != null) assert.equal(u, want, say);
    const most = at(u);
    assert.ok(strains(most), `${say}: the ${u} mm it names passes`);
    assert.ok(!strains(at(u + 0.001)), `${say}: a thousandth more fails`);
    assert.equal(most.removal, named[0].removal, `${say}: it holds the pull-off it names`);
  }
});

test('the printed plastics ABS, ASA and PA-CF are materials of the kit: plastics by their stiffness, stripped at their strength across the layers', () => {
  // By hand, an M3 screw 6 mm in, its shear area 0.875 x pi x 3 x 6 = 49.480 mm² (as for PLA above), at the strength
  // across the layers (strength_z) over sqrt(3), the weaker way of each print:
  //   abs (Polymaker PolyLite ABS):   29.7 / 1.7321 = 17.147 MPa x 49.480 =  848.4 N
  //   asa (Bambu Lab ASA):            35   / 1.7321 = 20.207 MPa x 49.480 =  999.9 N
  //   pa_cf (Bambu Lab PAHT-CF):      64   / 1.7321 = 36.950 MPa x 49.480 = 1828.3 N, 1828.3 / 2917.9 = 0.63 of a class 8.8 screw's proof load
  const area = 0.875 * Math.PI * 3 * 6;
  for (const [name, across, strip] of [['abs', 29.7, 848.4], ['asa', 35, 999.9], ['pa_cf', 64, 1828.3]]) {
    const s = stripping('M3', { depth: 6, material: name });
    near(s.strip, (across / Math.sqrt(3)) * area, 0.05, `${name}, across its layers`); assert.equal(s.strip, strip, name);
    assert.ok(s.rests.some((r) => r.name === `${name}.strength_z`), `${name} rests on its strength across the layers`);
    assert.match(s.findings[0].text, new RegExp(`${name}\\.strength_z, the weaker way of the print`));
    const e = engagement('M3', { depth: 6, material: name.toUpperCase() });
    assert.deepEqual([e.class, e.material, e.need], ['plastic', name, 7.5], `${name} is a plastic: 2.5 diameters`);
  }
  assert.equal(stripping('M3', { depth: 6, material: 'pa_cf' }).margin, 0.63);
});
