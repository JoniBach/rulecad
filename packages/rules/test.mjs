// The published rule sets: every value traceable (what it is, how far to trust it, where it comes from, when it was
// checked), every set named for its file, and every set in the README's table.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { checkRuleSet, resolve } from '@rulecad/variables';

const dir = fileURLToPath(new URL('.', import.meta.url));
const vocabulary = JSON.parse(fs.readFileSync(dir + 'vocabulary.json', 'utf8'));
const sets = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && !['package.json', 'vocabulary.json'].includes(f)).map((f) => ({ file: f, name: f.replace(/\.json$/, ''), set: JSON.parse(fs.readFileSync(dir + f, 'utf8')) }));
const KINDS = ['measured', 'spec', 'community', 'default', 'derived', 'estimate']; // most to least trusted, as CONTRIBUTING.md and the README give them

test('every rule says what it is, how far to trust it, its source and when it was checked', () => {
  assert.ok(sets.length >= 20);
  for (const { file, name, set } of sets) {
    assert.equal(set.name, name, `${file}: its "name" is its file's`);
    assert.ok(Object.keys(set.rules || {}).length, `${file} has rules`);
    for (const [rule, r] of Object.entries(set.rules)) {
      const at = `${file}: ${rule}`;
      assert.ok(typeof r.value === 'number' ? Number.isFinite(r.value) : Array.isArray(r.value) ? r.value.length && r.value.every(Number.isFinite) : typeof r.value === 'string' && r.value, `${at} has a value`);
      assert.ok(typeof r.rule === 'string' && r.rule.length > 5, `${at} says what it is`);
      assert.ok(KINDS.includes(r.kind), `${at}: kind "${r.kind}" is one of ${KINDS.join(', ')}`);
      assert.ok(typeof r.source === 'string' && r.source, `${at} has a source`);
      assert.match(String(r.checked), /^\d{4}-\d{2}-\d{2}$/, `${at}: checked is a date`);
    }
  }
});

test('the README lists every set', () => {
  const readme = fs.readFileSync(dir + 'README.md', 'utf8');
  for (const { name } of sets) assert.ok(readme.includes(`\`${name}\``), `${name} isn't in the README's table`);
});

test('rules check passes every published set, with a motor held to the shared names', () => {
  for (const { file, set } of sets) assert.deepEqual(checkRuleSet(set, vocabulary), [], file);
  const motors = sets.filter((s) => s.set.part === 'motor').map((s) => s.name).sort();
  assert.deepEqual(motors, ['28byj48', 'bldc2204', 'mg90s', 'n20', 'nema14', 'nema17', 'sg90']);
});

test('every bearing is a real ring, and every radial one says its play class', () => {
  const bearings = sets.filter((s) => s.set.part === 'bearing');
  assert.deepEqual(bearings.map((b) => b.name).sort(), ['bearing-51104', 'bearing-608', 'bearing-625', 'bearing-6800', 'bearing-f623', 'bearing-mr105']);
  for (const { name, set: { rules: r } } of bearings) {
    assert.ok(r.outer_diameter.value > r.bore.value && r.bore.value > 0 && r.width.value > 0, `${name}: outer > bore > 0 and width > 0`);
    assert.ok(r.static_rating.value > 0 && r.dynamic_rating.value > 0, `${name}: rated`);
    if (r.type.value !== 'thrust') assert.ok(r.radial_play, `${name}: a radial bearing has a radial play class`);
    if (r.type.value === 'flanged') assert.ok(r.flange_diameter.value > r.outer_diameter.value, `${name}: the flange stands out`);
    if (r.type.value === 'thrust') assert.ok(r.housing_washer_bore.value > r.bore.value, `${name}: the housing washer clears the shaft`);
  }
});

test('every driver turns Vref into amps as its own datasheet works it through', () => {
  const r = (name) => sets.find((s) => s.name === name).set.rules, amps = (name, vref) => vref * r(name).vref_gain.value;
  assert.ok(Math.abs(amps('a4988', 0.8) - 0.8 / (8 * r('a4988').sense_resistor.value)) < 1e-3, 'A4988: Imax = Vref / (8 Rs)');
  assert.ok(Math.abs(amps('a4988', 0.8) - 1.47) < 0.01, 'A4988 at 0.068 ohm: 0.8 V gives 1.47 A');
  assert.ok(Math.abs(amps('drv8825', 0.5) - 1) < 0.01, 'DRV8825: 0.5 V gives 1 A');
  assert.ok(Math.abs(amps('tmc2209', 1.2) - 0.9) < 0.06, 'TMC2209 at 0.11 ohm: 1.2 V gives about 0.9 A RMS');
  for (const name of ['a4988', 'drv8825', 'tmc2209']) assert.ok(r(name).current_cooled.value >= r(name).current_bare.value && r(name).row_spacing.value === 12.7 && r(name).pin_pitch.value === 2.54, name);
  for (const [v, s] of Object.entries(sets.find((x) => x.name === 'a4988').set.variants)) assert.ok(Math.abs(s.values.vref_gain - 1 / (8 * s.values.sense_resistor)) < 1e-3, `a4988 variant ${v}`);
});

test('a hobby part says it is community until measured', () => {
  for (const name of ['bearing-mr105', 'endstop-10t85', 'as5600', 'tmc2209', 'cnc-shield-v3', 'supply-12v', 'supply-24v', 't8-screw', 't8-nut', 'rod-8', 'lm8uu', 'lm8luu', 'coupler-5-8', 'gt2-belt-6', 'pulley-gt2-16', 'pulley-gt2-20', 'idler-gt2-toothed-20', 'idler-gt2-smooth-20']) {
    const { set } = sets.find((s) => s.name === name);
    assert.match(set._doc, /community until measured/, `${name} says so in its _doc`);
    assert.ok(Object.values(set.rules).some((r) => r.kind === 'community'), `${name} has community figures`);
  }
});

test('the motion parts: a lead screw\'s lead is pitch by starts, a pulley\'s pitch diameter is teeth by pitch over pi', () => {
  const r = (name) => sets.find((s) => s.name === name).set.rules;
  assert.equal(r('t8-screw').lead.value, r('t8-screw').pitch.value * r('t8-screw').starts.value);
  for (const [v, s] of Object.entries(sets.find((x) => x.name === 't8-screw').set.variants)) assert.equal(s.values.lead, r('t8-screw').pitch.value * s.values.starts, `t8-screw variant ${v}`);
  for (const name of ['pulley-gt2-16', 'pulley-gt2-20']) {
    const p = r(name);
    assert.ok(Math.abs(p.pitch_diameter.value - (p.teeth.value * p.pitch.value) / Math.PI) < 0.03, `${name}: pitch diameter`);
    assert.ok(Math.abs(p.pitch_diameter.value - p.tooth_diameter.value - 2 * r('gt2-belt-6').pitch_line_offset.value) < 0.03, `${name}: teeth inside the pitch circle by the belt's offset`);
  }
  assert.ok(Math.abs(r('gt2-belt-6').stiffness.value - 6 * r('gt2-belt-6').stiffness_per_width.value) < 5, 'belt stiffness per width');
  for (const name of ['lm8uu', 'lm8luu']) assert.ok(r(name).outer_diameter.value > r(name).bore.value && r(name).length.value > 0 && r(name).static_rating.value > 0, name);
  assert.equal(r('coupler-5-8').bore_a.value, 5); assert.equal(r('coupler-5-8').bore_b.value, 8);
});

test('a supply\'s variants each carry their own current and case', () => {
  for (const name of ['supply-12v', 'supply-24v']) {
    const { set } = sets.find((s) => s.name === name);
    const vs = Object.values(set.variants);
    assert.ok(vs.length >= 6, `${name} has its range of currents`);
    assert.ok(vs.every((v) => v.values.output_current > 0 && v.values.body_width > 0 && v.values.output_voltage === set.rules.output_voltage.value), name);
  }
});

test('rules check says what is wrong with a set: no source, a bad kind, a stray name, the wrong unit, a required rule missing', () => {
  const base = () => JSON.parse(JSON.stringify(sets.find((s) => s.name === 'nema17').set)), codes = (s) => checkRuleSet(s, vocabulary).map((x) => x.code);
  let s = base(); delete s.rules.boss_height.source; assert.deepEqual(codes(s), ['rules.source']);
  s = base(); s.rules.boss_height.kind = 'guess'; assert.deepEqual(codes(s), ['rules.kind']);
  s = base(); s.rules.boss_heigth = s.rules.boss_height; assert.deepEqual(codes(s), ['rules.name']);
  s = base(); s.rules.boss_height.unit = 'in'; assert.deepEqual(codes(s), ['rules.unit', 'rules.unit']);
  s = base(); delete s.rules.shaft_length; assert.deepEqual(codes(s), ['rules.missing']);
  s = base(); s.rules.body_shape.value = 'hexagon'; assert.deepEqual(codes(s), ['rules.choice']);
  s = base(); s.rules.boss_height.checked = 'soon'; assert.deepEqual(codes(s), ['rules.checked']);
  assert.deepEqual(checkRuleSet({ name: 'x', interface: { body_size: 'length' }, rules: { width: { value: 1, rule: 'a width', kind: 'spec', source: 's', checked: '2026-01-01' } } }, vocabulary).map((x) => x.code), ['rules.name', 'rules.interface']);
});

// ---------- threads ----------
const METRIC = ['m1_6', 'm2', 'm2_5', 'm3', 'm4', 'm5', 'm6', 'm8', 'm10', 'm12'], INCH = ['unc_4_40', 'unc_6_32', 'unc_8_32', 'unc_10_24', 'unf_10_32', 'unc_1_4_20', 'unc_5_16_18', 'unc_3_8_16'];
const PUBLISHED_PILOT = ['m2', 'm2_5', 'm3', 'm4']; // the threads Bambu Lab's guide gives a hole for
const rulesOf = (name) => sets.find((s) => s.name === name).set.rules;

test('the names designs read today keep their values: clearance, head, head_height, nut_flats, nut_height, insert_hole, insert_length', () => {
  const was = { // every thread rule as published in @rulecad/rules 0.3.9
    m1_6: { clearance: 1.8, head: 3, head_height: 1.6 },
    m2: { clearance: 2.4, head: 3.8, head_height: 2, insert_hole: 3.2, insert_length: 3 },
    m3: { clearance: 3.4, head: 5.5, head_height: 3 },
    m4: { clearance: 4.5, head: 7, head_height: 4, nut_flats: 7, nut_height: 3.2 },
    m5: { clearance: 5.5, head: 8.5, head_height: 5, nut_flats: 8, nut_height: 4.7 },
  };
  for (const [name, values] of Object.entries(was)) {
    const { set } = sets.find((s) => s.name === name);
    for (const [rule, value] of Object.entries(values)) { assert.equal(set.rules[rule]?.value, value, `${name}.${rule} is still ${value}`); assert.equal(set.rules[rule].unit, 'mm', `${name}.${rule} is still in mm`); }
    assert.deepEqual(set.interface, { screw_clearance: 'clearance', screw_head: 'head', screw_head_height: 'head_height' }, `${name} still says which of its rules a motor's screw reads`);
  }
});

test('every thread from M1.6 to M12 and 4-40 to 3/8-16 is a thread set with the whole vocabulary, each figure a spec from a standard', () => {
  const threads = sets.filter((s) => s.set.part === 'thread' && s.set.rules.thread_form.value !== 'plastic').map((s) => s.name).sort();
  assert.deepEqual(threads, [...METRIC, ...INCH].sort());
  const every = ['thread_form', 'thread', 'major_diameter', 'pitch', 'tap_drill', 'clearance_close', 'clearance', 'clearance_loose', 'head', 'head_height', 'head_key', 'nut_flats', 'nut_height', 'washer_bore', 'washer_diameter', 'washer_thickness', 'set_screw_key', 'lengths', 'proof_stress', 'pilot'];
  for (const name of threads) {
    const r = rulesOf(name), metric = METRIC.includes(name);
    for (const k of every) assert.ok(r[k], `${name} has ${k}`);
    assert.equal(r.thread_form.value, metric ? 'metric' : 'unified', name);
    for (const [k, x] of Object.entries(r)) {
      assert.ok(vocabulary.fields[k], `${name}.${k} is a name in the vocabulary`);
      assert.match(x.source, /https:\/\//, `${name}.${k} names the page it was read on`);
      if (/^insert_/.test(k)) { assert.equal(x.kind, 'community', `${name}.${k} is its maker's figure, community until measured`); assert.match(x.source, /^CNC Kitchen/, `${name}.${k}: every insert from the one maker's sheet`); }
      else if (/^pilot/.test(k)) assert.equal(x.kind, PUBLISHED_PILOT.includes(name) ? 'community' : 'estimate', `${name}.${k}: a published figure is community, one nobody publishes is an estimate`);
      else if (!metric && /^(lock_nut_|lengths)/.test(k)) { assert.equal(x.kind, 'community', `${name}.${k} is from a distributor's list, and says so`); assert.match(x.source, /distributor/); }
      else { assert.equal(x.kind, 'spec', `${name}.${k} is a spec`); assert.match(x.source, /\b(ISO|DIN|ASME|ASTM) ?[A-Z]?\d/, `${name}.${k} names its standard`); }
      if (!metric && x.unit === 'mm' && !/^insert_/.test(k)) assert.match(x.rule, /\d ?in\b|\d\/\d+ in|#\d+ drill|letter [A-Z] drill/, `${name}.${k} gives its inch figure in words: ${x.rule}`);
    }
    // through the one grammar: a design reads numbers, a list as an array, and text as text
    const v = resolve({ uses: [name], variables: { hole: { value: `${name}.clearance + 0.1`, unit: 'mm' }, shortest: { value: `min(${name}.lengths)`, unit: 'mm' } } }, { sets: { [name]: sets.find((s) => s.name === name).set } }).values;
    assert.ok(Array.isArray(v[name].lengths) && v[name].lengths.length >= 5 && v.shortest === v[name].lengths[0], `${name}.lengths is a list`);
    assert.equal(typeof v[name].thread, 'string', `${name}.thread reads as text (${v[name].thread})`);
    assert.equal(v[name].stainless_class ?? 'text', r.stainless_class?.value ?? 'text');
    assert.ok(Math.abs(v.hole - r.clearance.value - 0.1) < 1e-12);
  }
  // what ISO says of every metric size: a cap head as tall as the thread is wide, one spanner for nut and hexagon head, the standard's own lengths
  for (const name of METRIC) {
    const r = rulesOf(name), d = r.major_diameter.value;
    assert.equal(r.head_height.value, d, `${name}: ISO 4762 k = d`);
    assert.equal(r.nut_flats.value, r.hex_head_flats.value, `${name}: one spanner`);
    assert.equal(r.thread.value, `M${d}`);
    assert.equal(r.property_class.value, 8.8); assert.equal(r.proof_stress.value, 580); assert.equal(r.stainless_class.value, 'A2-70');
    assert.ok(r.lengths.value.every((l) => [2.5, 3, 4, 5, 6, 8, 10, 12, 16, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 80, 90, 100, 110, 120].includes(l)), `${name}: ISO 4762 lengths`);
  }
  for (const name of ['m3', 'm4', 'm5', 'm6', 'm8', 'm10', 'm12']) for (const k of ['button_head', 'button_head_height', 'button_key', 'countersunk_head', 'countersunk_angle', 'countersunk_key', 'hex_head_flats', 'hex_head_height', 'square_nut_flats', 'lock_nut_height'].filter((k) => !(name === 'm12' && k === 'square_nut_flats'))) assert.ok(rulesOf(name)[k], `${name} has ${k}`);
  assert.ok(!rulesOf('m1_6').button_head && !rulesOf('m12').square_nut_flats, 'a head or nut the standard does not make in a size is left out, not invented');
  // where an older DIN and the current ISO disagree, the ISO figure, and the rule says so
  assert.equal(rulesOf('m10').nut_flats.value, 16); assert.match(rulesOf('m10').nut_flats.rule, /DIN 934 gave 17/);
  assert.equal(rulesOf('m12').hex_head_flats.value, 18); assert.match(rulesOf('m12').hex_head_flats.rule, /DIN 933 gave 19/);
  assert.equal(rulesOf('m3').countersunk_head.value, 6.72); assert.match(rulesOf('m3').countersunk_head.rule, /DIN 7991 gave 6/);
  // an inch thread is its own numbers in mm
  assert.equal(rulesOf('unc_6_32').major_diameter.value, 3.5052); assert.ok(Math.abs(rulesOf('unc_6_32').pitch.value - 25.4 / 32) < 1e-4);
  assert.equal(rulesOf('unc_1_4_20').major_diameter.value, 6.35); assert.equal(rulesOf('unc_1_4_20').pitch.value, 1.27);
  assert.equal(rulesOf('unc_6_32').countersunk_angle.value, 82);
});

test('rules check holds a thread to sense: a head wider than its hole, a tap drill near the thread less its pitch, holes and lengths in order', () => {
  const base = () => JSON.parse(JSON.stringify(sets.find((s) => s.name === 'm3').set)), found = (s) => checkRuleSet(s, vocabulary).map((x) => `${x.code} ${x.rule}`);
  let s = base(); s.rules.head.value = 3.5; assert.deepEqual(found(s), ['rules.order head']);
  s = base(); s.rules.tap_drill.value = 3.1; assert.deepEqual(found(s), ['rules.order major_diameter', 'rules.near tap_drill', 'rules.order pilot']);
  s = base(); s.rules.tap_drill.value = 2.2; assert.deepEqual(found(s), ['rules.near tap_drill']);
  s = base(); s.rules.clearance.value = 3.7; assert.deepEqual(found(s), ['rules.order clearance_loose']);
  s = base(); s.rules.clearance_close.value = 2.9; assert.deepEqual(found(s), ['rules.order clearance_close', 'rules.order clearance_close'], 'under the thread, and no wider than the pilot');
  s = base(); s.rules.lengths.value = [5, 8, 6, 10]; assert.deepEqual(found(s), ['rules.order lengths']);
  s = base(); s.rules.lengths.value = 10; assert.deepEqual(found(s), ['rules.list lengths']);
  s = base(); s.rules.washer_diameter.value = 3; assert.deepEqual(found(s), ['rules.order washer_diameter', 'rules.order washer_diameter']);
  s = base(); s.rules.pilot.value = 3.3; assert.deepEqual(found(s), ['rules.order clearance_close'], 'a pilot as wide as a clearance hole forms no thread');
  s = base(); s.rules.insert_hole.value = 4.7; assert.deepEqual(found(s), ['rules.order insert_diameter'], 'an insert falls into a hole wider than its knurls');
  s = base(); s.rules.head_hieght = s.rules.head_height; assert.deepEqual(found(s), ['rules.name head_hieght']);
  s = base(); delete s.rules.pitch; assert.deepEqual(found(s), ['rules.missing pitch']);
  s = base(); s.rules.thread_form.value = 'whitworth'; assert.deepEqual(found(s), ['rules.choice thread_form']);
  s = base(); s.rules.proof_stress.unit = 'psi'; assert.deepEqual(found(s), ['rules.unit proof_stress', 'rules.unit proof_stress']);
});

test('what holds a screw in plastic: inserts from one maker, pilots as starting figures, the printer\'s measured pilot, and engagement by material', () => {
  for (const name of ['m2', 'm2_5', 'm3', 'm4', 'm5']) {
    const r = rulesOf(name);
    for (const k of ['insert_diameter', 'insert_length', 'insert_hole', 'insert_depth', 'insert_wall']) { assert.ok(r[k], `${name} has ${k}`); assert.equal(r[k].kind, 'community'); }
    assert.ok(r.insert_diameter.value > r.insert_hole.value && r.insert_hole.value > r.major_diameter.value, `${name}: the knurls bite into a hole wider than the thread`);
    assert.ok(Math.abs(r.insert_depth.value - r.insert_length.value - 1) < 1e-9, `${name}: a blind hole a millimetre deeper than the insert`);
  }
  assert.deepEqual([rulesOf('m3').insert_diameter.value, rulesOf('m3').insert_length.value, rulesOf('m3').insert_hole.value, rulesOf('m3').insert_wall.value], [4.6, 5.7, 4, 1.6], 'CNC Kitchen M3 x 5.7');
  assert.deepEqual(sets.find((s) => s.name === 'm3').set.variants['M3x5x4-voron'].values, { insert_length: 4, insert_depth: 5, insert_diameter: 5, insert_hole: 4.4 }, 'its other inserts are variants');
  for (const name of [...METRIC, ...INCH]) { const r = rulesOf(name); assert.ok(r.pilot.value > r.tap_drill.value && r.pilot.value < r.clearance_close.value, `${name}: a pilot between the tap drill and the closest clearance hole`); }
  assert.deepEqual(PUBLISHED_PILOT.map((n) => rulesOf(n).pilot.value), [2.1, 2.5, 2.9, 3.75], 'Bambu Lab\'s figures for PLA, the hole upright');
  assert.equal(rulesOf('m3').pilot.value, rulesOf('x1c').pilot_m3.value, 'the published M3 figure is the one the fit bar measured');
  const pilot = rulesOf('x1c').pilot_m3;
  assert.deepEqual([pilot.value, pilot.unit, pilot.kind, pilot.checked], [2.9, 'mm', 'measured', '2026-11-10']);
  assert.match(pilot.source, /fit bar, examples\/bench\/projects\/benchmarks\/MEASURE.md row 5, PLA/); assert.match(pilot.rule, /2\.9 mm and 3\.0 mm drawn both hold/);
  assert.ok(fs.readFileSync(dir + '../../examples/bench/projects/benchmarks/MEASURE.md', 'utf8').includes('2.9 mm and 3.0 mm both good; smaller holes send the screw in at an angle (2026-11-10, PLA)'), 'as the measuring sheet records it');
  const e = rulesOf('engagement');
  assert.ok(e.steel.value < e.aluminium.value && e.aluminium.value < e.plastic.value, 'the softer the material, the more thread a screw needs in it');
  for (const k of ['steel', 'aluminium', 'plastic']) { assert.equal(e[k].unit, ''); assert.match(e[k].source, /https:\/\//); }
  const plastic = sets.filter((s) => s.set.part === 'thread' && s.set.rules.thread_form.value === 'plastic');
  assert.ok(plastic.length >= 4, 'thread-forming screws for plastic are their own sets');
  assert.deepEqual(plastic.map((s) => s.name).sort(), ['pt_k22', 'pt_k25', 'pt_k30', 'pt_k35', 'pt_k40', 'pt_k50']);
  for (const { name, set: { rules: r, variants } } of plastic) {
    assert.ok(Math.abs(r.pilot.value - 0.8 * r.major_diameter.value) < 0.006 && r.pilot.kind === 'community', `${name}: its maker's pilot for ABS, 0.8 of its diameter, community until measured`);
    assert.ok(r.pilot_depth.value === 2 * r.major_diameter.value && r.pilot_boss.value === 2 * r.major_diameter.value, `${name}: depth and boss twice its diameter`);
    assert.ok(r.root_diameter.value < r.pilot.value && r.pan_head.value > r.major_diameter.value && /^PZ[12]$/.test(r.pan_head_drive.value) && /^T\d+$/.test(variants.torx.values.pan_head_drive), name);
    assert.ok(!r.tap_drill && !r.nut_flats && !r.clearance, `${name}: no tap, no nut, and no clearance hole its maker gives`);
  }
});
