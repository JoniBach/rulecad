// The release plan: what goes out, in what order, and when a release must stop before publishing anything
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plan } from '../scripts/publish-plan.mjs';

const pkg = (dir, version, dependencies = {}) => ({ dir, name: dir === 'create-rulecad' ? dir : `@rulecad/${dir}`, version, dependencies });
// As on 2026-10-27: cad 0.6.0 needed fea and topopt (new to npm) and new versions of rules, shapes and variables
const release = [pkg('cad', '0.6.0', { '@rulecad/fea': '^0.1.0', '@rulecad/topopt': '^0.1.0', '@rulecad/rules': '^0.3.0', '@rulecad/shapes': '^0.3.0', '@rulecad/variables': '^0.2.0' }),
  pkg('create-rulecad', '0.3.5'), pkg('fea', '0.1.0'), pkg('fit', '0.2.1'), pkg('rules', '0.3.0'),
  pkg('shapes', '0.3.0', { '@rulecad/variables': '^0.2.0' }), pkg('topopt', '0.1.0', { '@rulecad/fea': '^0.1.0' }), pkg('variables', '0.2.0')];
const npm = { onNpm: (name) => name === '@rulecad/fit', exists: (name) => !['@rulecad/fea', '@rulecad/topopt'].includes(name) };

test('packages go out after the ones they depend on, and those already on npm are left alone', () => {
  const order = plan(release, npm).publish.map((p) => p.dir);
  assert.ok(!order.includes('fit'));
  for (const [before, after] of [['fea', 'topopt'], ['topopt', 'cad'], ['variables', 'shapes'], ['shapes', 'cad'], ['rules', 'cad']]) {
    assert.ok(order.indexOf(before) < order.indexOf(after), `${before} before ${after}: ${order.join(', ')}`);
  }
});

test('packages new to npm are found before anything is published', () => {
  assert.deepEqual(plan(release, npm).new.map((p) => p.name), ['@rulecad/fea', '@rulecad/topopt']);
  assert.deepEqual(plan(release, { ...npm, exists: () => true }).new, []);
});

test('a dependency loop is reported, not followed forever', () => {
  assert.throws(() => plan([pkg('a', '1.0.0', { '@rulecad/b': '1' }), pkg('b', '1.0.0', { '@rulecad/a': '1' })], { onNpm: () => false, exists: () => true }), /loop/);
});
