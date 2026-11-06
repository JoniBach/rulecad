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
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'cad.config.json'), 'utf8')).targets.shorten, undefined, 'asked no one: links stay long');
    const short = path.join(root, 'short');
    assert.match(execFileSync(process.execPath, [CREATE, short, '--no-install', '--share', 'gist'], { encoding: 'utf8' }), /short links/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(short, 'cad.config.json'), 'utf8')).targets.shorten, 'gist');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('the template\'s AGENTS.md is the cad package\'s (copy packages/cad/AGENTS.md over it after a change)', () => {
  const read = (p) => fs.readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
  assert.equal(read('./template/AGENTS.md'), read('../cad/AGENTS.md'));
});

test('a new workspace asks for the cad command as it is now, not an old minor version', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'create-'));
  try {
    execFileSync(process.execPath, [CREATE, path.join(root, 'w'), '--no-install'], { encoding: 'utf8', env: { ...process.env, RULECAD_LOCAL: '' } });
    const range = JSON.parse(fs.readFileSync(path.join(root, 'w', 'package.json'), 'utf8')).dependencies['@rulecad/cad'];
    const { version } = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../cad/package.json', import.meta.url)), 'utf8'));
    const [, major, minor, patch] = range.match(/^\^(\d+)\.(\d+)\.(\d+)$/) || [], [M, m, p] = version.split('.').map(Number);
    assert.ok(major !== undefined, `a caret range, got ${range}`);
    // what ^ allows: the same major, and before 1.0 the same minor too
    assert.ok(+major === M && (M > 0 ? m > +minor || (m === +minor && p >= +patch) : +minor === m && p >= +patch), `${range} leaves out @rulecad/cad ${version}: set CAD in index.mjs to ^${M}.${m}.0`);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('the folder is named apart from --share\'s value, and any folder name makes a package name npm takes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'create-'));
  try {
    execFileSync(process.execPath, [CREATE, '--share', 'long', 'My Designs', '--no-install'], { cwd: root, encoding: 'utf8' });
    assert.ok(!fs.existsSync(path.join(root, 'long')), '--share\'s value isn\'t the folder');
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'My Designs', 'package.json'), 'utf8')).name, 'my-designs');
    assert.throws(() => execFileSync(process.execPath, [CREATE, path.join(root, 'x'), '--no-install', '--share'], { stdio: 'pipe' }), /--share is gist or long/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
