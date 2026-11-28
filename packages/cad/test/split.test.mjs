// cad's tests stay split by command: one file per command or topic in this folder, around ./helpers.mjs. One file of
// every test (the old packages/cad/test.mjs) could not be run a command at a time, nor spread over cores, and two pull
// requests often edited it at once; a test file with its own workspace() starts the command a way of its own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('./', import.meta.url));

test('cad\'s tests are one file per command: no packages/cad/test.mjs, and no test file with a workspace() of its own', () => {
  assert.ok(!fs.existsSync(new URL('../test.mjs', import.meta.url)), 'packages/cad/test.mjs is back: put its tests in packages/cad/test/<command>.test.mjs, as CONTRIBUTING.md says');
  const files = fs.readdirSync(HERE).filter((f) => f.endsWith('.test.mjs'));
  assert.ok(files.length > 10, `only ${files.length} test files found in ${HERE}`);
  const own = files.filter((f) => /\b(function\s+workspace\s*\(|(const|let|var)\s+workspace\s*=)/.test(fs.readFileSync(new URL(f, import.meta.url), 'utf8')));
  assert.deepEqual(own, [], 'these test files make a workspace their own way: import workspace() from ./helpers.mjs instead');
});
