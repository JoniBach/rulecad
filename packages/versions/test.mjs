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

test('display settings (once called mirror) are a patch, and renaming the field is no change', () => {
  const a = snap({ w: { value: 1 } }, 'x', { mirror: { smooth: 8 } });
  assert.equal(compare(a, snap({ w: { value: 1 } }, 'x', { display: { smooth: 8 } })).kind, null);
  assert.equal(compare(a, snap({ w: { value: 1 } }, 'x', { display: { smooth: 16 } })).kind, 'patch');
});

test('changes of role, unit and range are reported: a variable made interface, one no longer settable, the same settings reordered', () => {
  const kinds = (a, b) => { const r = compare(a, b); return [r.kind, r.reasons.map((x) => x.text).join('; ')]; };
  assert.deepEqual(kinds(snap({ slot: { value: 4.2 } }), snap({ slot: { value: 4.2, interface: true } }))[0], 'minor', 'a new promise to other parts');
  assert.match(kinds(snap({ slot: { value: 4.2, unit: 'mm', interface: true } }), snap({ slot: { value: 4.2, unit: 'in', interface: true } }))[1], /interface slot is now in in \(was mm\)/);
  assert.equal(kinds(snap({ slot: { value: 4.2, unit: 'mm', interface: true } }), snap({ slot: { value: 4.2, unit: 'in', interface: true } }))[0], 'major');
  assert.match(kinds(snap({ w: { value: 10, tweak: { min: 5, max: 20 } } }), snap({ w: { value: 10 } }))[1], /w can no longer be set \(it was 5 to 20\)/);
  assert.match(kinds(snap({ slot: { value: 4.2, interface: true } }), snap({ slot: { value: 4.204, interface: true } }))[1], /4\.2 → 4\.204/, 'not 4.2 → 4.2');
  const variants = (v) => snap({ w: { value: 10, tweak: { min: 5, max: 20 } }, d: { value: 3, tweak: { min: 1, max: 9 } } }, 'x', { variants: { big: v } });
  assert.equal(kinds(variants({ w: 15, d: 5 }), variants({ d: 5, w: 15 }))[0], null, 'the same settings in another order');
  assert.throws(() => bump('1.2.3', 'Major'), /major, minor or patch/);
  assert.throws(() => bump('1.2.3'), /major, minor or patch/);
});

test('a list rule compares entry by entry: the same list is no change, another length is a patch', () => {
  const at = (lengths) => { const object = { uses: ['m3'], variables: { l: { value: 'min(m3.lengths)' } } }; return { object, entries: resolve(object, { sets: { m3: { name: 'm3', rules: { lengths: { value: lengths, unit: 'mm' } } } } }).entries, js: 'x' }; };
  assert.equal(compare(at([5, 6, 8]), at([5, 6, 8])).kind, null);
  assert.deepEqual(compare(at([5, 6, 8]), at([5, 6, 10])).reasons, [{ kind: 'patch', text: 'rule m3.lengths 5, 6, 8 → 5, 6, 10' }]);
  assert.equal(compare(at([5, 6, 8]), at([5, 6])).kind, 'patch');
});
