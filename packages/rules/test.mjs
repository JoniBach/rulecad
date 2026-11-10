// The published rule sets: every value traceable (what it is, how far to trust it, where it comes from, when it was
// checked), every set named for its file, and every set in the README's table.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { checkRuleSet } from '@rulecad/variables';

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
      assert.ok(typeof r.value === 'number' ? Number.isFinite(r.value) : typeof r.value === 'string' && r.value, `${at} has a value`);
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
