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

test('rules check says what is wrong with a set: no source, a bad kind, a stray name, the wrong unit, a required rule missing', () => {
  const base = () => JSON.parse(JSON.stringify(sets.find((s) => s.name === 'nema17').set)), codes = (s) => checkRuleSet(s, vocabulary).map((x) => x.code);
  let s = base(); delete s.rules.boss_height.source; assert.deepEqual(codes(s), ['rules.source']);
  s = base(); s.rules.boss_height.kind = 'guess'; assert.deepEqual(codes(s), ['rules.kind']);
  s = base(); s.rules.boss_heigth = s.rules.boss_height; assert.deepEqual(codes(s), ['rules.name']);
  s = base(); s.rules.boss_height.unit = 'in'; assert.deepEqual(codes(s), ['rules.unit', 'rules.unit']);
  s = base(); delete s.rules.mass; assert.deepEqual(codes(s), ['rules.missing']);
  s = base(); s.rules.body_shape.value = 'hexagon'; assert.deepEqual(codes(s), ['rules.choice']);
  s = base(); s.rules.boss_height.checked = 'soon'; assert.deepEqual(codes(s), ['rules.checked']);
  assert.deepEqual(checkRuleSet({ name: 'x', interface: { body_size: 'length' }, rules: { width: { value: 1, rule: 'a width', kind: 'spec', source: 's', checked: '2026-01-01' } } }, vocabulary).map((x) => x.code), ['rules.name', 'rules.interface']);
});
