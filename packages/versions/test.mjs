import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bump, newer, satisfies, compare } from '@rulecad/versions';
import { resolve } from '@rulecad/variables';

const snap = (variables, js = 'x', extra = {}) => { const object = { variables, ...extra }; return { object, entries: resolve(object).entries, js }; };

test('semver: bumps, ordering and ranges', () => {
  assert.equal(bump('1.2.3', 'major'), '2.0.0'); assert.equal(bump('1.2.3', 'minor'), '1.3.0'); assert.equal(bump('1.2.3', 'patch'), '1.2.4');
  assert.ok(newer('1.10.0', '1.9.9')); assert.ok(!newer('1.0.0', '1.0.0'));
  assert.ok(satisfies('0.3.0', '^0.2.0'), 'a minor release never breaks a fit, 0.x included');
  assert.ok(!satisfies('1.0.0', '^0.2.0')); assert.ok(!satisfies('0.1.9', '^0.2.0'));
  assert.ok(satisfies('1.2.5', '~1.2.0')); assert.ok(!satisfies('1.3.0', '~1.2.0')); assert.ok(satisfies('1.2.0', '1.2.0'));
});

test('a changed or removed interface value is major: old prints may not fit', () => {
  const a = snap({ slot: { value: 4.2, interface: true }, wall: { value: 1 } });
  const r = compare(a, snap({ slot: { value: 4.25, interface: true }, wall: { value: 1 } }));
  assert.equal(r.kind, 'major');
  assert.deepEqual(r.reasons, [{ kind: 'major', text: 'interface slot 4.2 → 4.25' }]);
  assert.equal(compare(a, snap({ wall: { value: 1 } })).kind, 'major');
  assert.equal(compare(a, snap({ slot: { value: 4.2 }, wall: { value: 1 } })).kind, 'major');
});

test('added interface or a new option is minor; other changes are patch; nothing is null', () => {
  const a = snap({ wall: { value: 1 } });
  assert.equal(compare(a, snap({ wall: { value: 1 }, travel: { value: 4, interface: true } })).kind, 'minor');
  assert.equal(compare(a, snap({ wall: { value: 1, tweak: { min: 1, max: 2 } } })).kind, 'minor');
  assert.equal(compare(a, snap({ wall: { value: 1.2 } })).kind, 'patch');
  assert.equal(compare(a, snap({ wall: { value: 1 } }, 'y')).kind, 'patch');
  assert.equal(compare(a, snap({ wall: { value: 1 } }, 'x\n')).kind, null);
});
