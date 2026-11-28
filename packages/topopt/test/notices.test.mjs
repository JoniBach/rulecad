// Part of topopt's method of moving asymptotes (mma and subsolve in topopt.mjs) follows Krister Svanberg's MATLAB
// mmasub.m and subsolv.m, which are under the GNU GPL 3 or later. Until that part is rewritten from his published
// papers, THIRD-PARTY.md says so, and npm must ship it with the code. These tests keep the note and the code together.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('..', import.meta.url));
const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('topopt packs THIRD-PARTY.md, the note on where its MMA came from', () => {
  // what npm itself would pack (package.json's files list holds more than modules, so scripts/shipped.mjs cannot say)
  const packed = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: dir, encoding: 'utf8', shell: process.platform === 'win32' }))[0].files.map((f) => f.path.replace(/\\/g, '/'));
  assert.ok(packed.includes('topopt.mjs'), 'topopt.mjs is packed');
  assert.ok(packed.includes('THIRD-PARTY.md'), 'THIRD-PARTY.md is packed beside topopt.mjs');
});

test('while topopt.mjs follows mmasub and subsolv, THIRD-PARTY.md names them, Svanberg and the GPL', () => {
  const code = read('topopt.mjs');
  if (!/mmasub|subsolv/.test(code)) return; // rewritten from the papers: the note may go with the old code
  assert.ok(fs.existsSync(new URL('../THIRD-PARTY.md', import.meta.url)), 'THIRD-PARTY.md is there');
  const note = read('THIRD-PARTY.md');
  for (const word of ['mmasub', 'subsolv', 'Svanberg', 'GPL-3.0-or-later', '`mma`', '`subsolve`']) assert.ok(note.includes(word), `THIRD-PARTY.md names ${word}`);
  assert.match(code, /THIRD-PARTY\.md/, 'topopt.mjs points to THIRD-PARTY.md');
  assert.match(read('README.md'), /THIRD-PARTY\.md/, 'the README points to THIRD-PARTY.md');
});
