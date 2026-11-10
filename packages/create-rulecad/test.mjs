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

test('--machine arm: a fresh workspace, sized from the sheet and the accuracy, checks clean and plots its test drawing with no edits', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'create-machine-')), dir = path.join(root, 'my-arm');
  try {
    const made = execFileSync(process.execPath, [CREATE, dir, '--no-install', '--machine', 'arm', '--sheet', 'a5', '--accuracy', '0.3'], { encoding: 'utf8', env: { ...process.env, RULECAD_LOCAL: path.resolve(MODULES, '..') } });
    assert.match(made, /an arm for a landscape A5 sheet at 0\.3 mm: upper arm 160 mm, forearm 115 mm/);
    for (const f of ['rules/arm.json', 'projects/arm/project.json', 'projects/arm/assemblies/arm.json', 'projects/arm/drawings/test.svg', 'projects/arm/firmware/arm/arm.ino', 'projects/arm/send.mjs']) assert.ok(fs.existsSync(path.join(dir, f)), f);
    fs.symlinkSync(MODULES, path.join(dir, 'node_modules'), 'junction'); // stands in for npm install
    const cad = (...a) => JSON.parse(execFileSync(process.execPath, [CAD, ...a, '--json'], { cwd: dir, encoding: 'utf8', maxBuffer: 1 << 26 }));
    const r = cad('check', 'arm/arm');
    assert.ok(r.findings, JSON.stringify(r));
    const fails = r.findings.filter((x) => x.level === 'fail');
    assert.equal(fails.length, 0, fails.map((x) => x.text).join('\n'));
    assert.equal(r.findings.find((x) => x.code === 'task.reach').level, 'pass');
    const plot = execFileSync(process.execPath, [CAD, 'plot', 'arm/arm', 'projects/arm/drawings/test.svg'], { cwd: dir, encoding: 'utf8', maxBuffer: 1 << 26 });
    assert.match(plot, /s|step|plot/i);
    assert.ok(fs.readdirSync(path.join(dir, 'exports/arm')).some((f) => f.endsWith('.steps.json')), 'a step file for the streamer');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('--machine arm sizes itself, refuses what it cannot make, and asks no one when there is no terminal', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'create-machine-'));
  const make = (name, ...a) => execFileSync(process.execPath, [CREATE, path.join(root, name), '--no-install', ...a], { encoding: 'utf8' });
  try {
    assert.match(make('a4', '--machine', 'arm', '--sheet', 'a4', '--accuracy', '0.5'), /A4 sheet at 0\.5 mm/);
    const rules = JSON.parse(fs.readFileSync(path.join(root, 'a4/rules/arm.json'), 'utf8')).rules;
    assert.ok(rules.upper.value > 160 && rules.sheet_w.value === 297, JSON.stringify(rules.upper));
    const asm = fs.readFileSync(path.join(root, 'a4/projects/arm/assemblies/arm.json'), 'utf8');
    assert.match(asm, /"size": "a4"/); assert.match(asm, /"accuracy": 0\.5/);
    assert.match(fs.readFileSync(path.join(root, 'a4/projects/arm/drawings/test.svg'), 'utf8'), /width="297mm"/);
    assert.match(make('by-default', '--machine', 'arm'), /A5 sheet at 0\.3 mm/, 'no flags and no terminal: the defaults');
    assert.match(make('a-leg', '--machine', 'leg', '--robot', '2'), /2 kg robot/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'a-leg/rules/leg.json'), 'utf8')).rules.robot.value, 2);
    assert.throws(() => make('x', '--machine', 'hexapod'), /--machine is arm or leg/);
    assert.throws(() => make('y', '--machine', 'arm', '--sheet', 'a3'), /--sheet is a6, a5, a4/);
    assert.throws(() => make('z', '--machine', 'arm', '--accuracy', '0'), /--accuracy is above 0/);
    assert.ok(!fs.existsSync(path.join(root, 'hexapod')), 'an option\'s value is not the folder');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('--machine leg: the stand checks with no failures, and its step of a gait can be animated', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'create-machine-')), dir = path.join(root, 'my-leg');
  try {
    execFileSync(process.execPath, [CREATE, dir, '--no-install', '--machine', 'leg'], { encoding: 'utf8' });
    fs.symlinkSync(MODULES, path.join(dir, 'node_modules'), 'junction');
    const r = JSON.parse(execFileSync(process.execPath, [CAD, 'check', 'leg/stand', '--json'], { cwd: dir, encoding: 'utf8', maxBuffer: 1 << 26 }));
    assert.ok(r.findings, JSON.stringify(r));
    const fails = r.findings.filter((x) => x.level === 'fail');
    assert.equal(fails.length, 0, fails.map((x) => x.text).join('\n'));
    assert.ok(r.findings.find((x) => x.code === 'gait.clearance'), 'its step');
    assert.match(execFileSync(process.execPath, [CAD, 'animate', 'leg/stand'], { cwd: dir, encoding: 'utf8' }), /stand-gait\.svg/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
