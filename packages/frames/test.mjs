import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as frames from '@rulecad/frames';

test('the first release: it loads, says what it is, and promises nothing it does not have', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
  assert.equal(frames.status.plan, 'https://github.com/JoniBach/rulecad/issues/240');
  // a 0.0.x release is the placeholder and exports only its status; from 0.1.0 it must say it is ready
  if (pkg.version.startsWith('0.0.')) { assert.equal(frames.status.release, 'placeholder'); assert.deepEqual(Object.keys(frames), ['status']); }
  else assert.equal(frames.status.release, 'ready');
  assert.ok(Object.isFrozen(frames.status));
  assert.deepEqual(Object.keys(pkg.dependencies || {}), [], 'nothing to install but itself, until it has code that needs more');
});
