// The published rule sets: every value traceable (what it is, how far to trust it, where it comes from, when it was
// checked), every set named for its file, and every set in the README's table.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('.', import.meta.url));
const sets = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'package.json').map((f) => ({ file: f, name: f.replace(/\.json$/, ''), set: JSON.parse(fs.readFileSync(dir + f, 'utf8')) }));
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
