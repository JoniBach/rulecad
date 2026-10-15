import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CREATE = fileURLToPath(new URL('./index.mjs', import.meta.url));
const CAD = fileURLToPath(new URL('../cad/bin/cad.mjs', import.meta.url));
const MODULES = fileURLToPath(new URL('../../node_modules', import.meta.url));

test('npm create rulecad: a workspace whose soap tray passes every check', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'create-')), dir = path.join(root, 'my-designs');
  try {
    execFileSync(process.execPath, [CREATE, dir, '--no-install'], { encoding: 'utf8' });
    for (const f of ['package.json', 'cad.config.json', '.gitignore', 'README.md', 'AGENTS.md', 'CLAUDE.md', 'projects/home/objects/soap-tray.js']) assert.ok(fs.existsSync(path.join(dir, f)), f);
    assert.match(fs.readFileSync(path.join(dir, 'README.md'), 'utf8'), /^# my-designs/);
    fs.symlinkSync(MODULES, path.join(dir, 'node_modules'), 'junction'); // stands in for npm install
    const out = execFileSync(process.execPath, [CAD, 'check', 'home/soap-tray'], { cwd: dir, encoding: 'utf8' });
    assert.doesNotMatch(out, /✗|!/, out);
    assert.match(out, /every measurement is a variable/);
    assert.throws(() => execFileSync(process.execPath, [CREATE, dir, '--no-install'], { stdio: 'pipe' }), /isn't empty/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('the template\'s AGENTS.md is the cad package\'s (copy packages/cad/AGENTS.md over it after a change)', () => {
  const read = (p) => fs.readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
  assert.equal(read('./template/AGENTS.md'), read('../cad/AGENTS.md'));
});
