import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

test('npm create rulecad: no screw size is typed, and the example assembly screws its lid on with a fasten and lists its screws', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'create-')), dir = path.join(root, 'w');
  try {
    execFileSync(process.execPath, [CREATE, dir, '--no-install'], { encoding: 'utf8' });
    fs.symlinkSync(MODULES, path.join(dir, 'node_modules'), 'junction'); // stands in for npm install
    // the inventory of screw sizes typed by hand finds none, even counting the objects that read v.fixings, which it passes over
    const { inventory, kindOf } = await import(pathToFileURL(fileURLToPath(new URL('../../scripts/fixings-inventory.mjs', import.meta.url))).href);
    const walk = (d) => fs.readdirSync(path.join(dir, d), { withFileTypes: true }).flatMap((e) => (e.name === 'node_modules' ? [] : e.isDirectory() ? walk(path.posix.join(d, e.name)) : [path.posix.join(d, e.name)]));
    const files = walk('.').map((f) => f.replace(/^\.\//, ''));
    assert.deepEqual(inventory({ root: dir, files }).total, { named: 0, reads: 0, typed: 0, table: 0 });
    const objects = files.filter((f) => /^projects\/[^/]+\/objects\/[^/]+\.json$/.test(f));
    assert.deepEqual(objects.sort(), ['projects/home/objects/box.json', 'projects/home/objects/lid.json', 'projects/home/objects/soap-tray.json']);
    for (const f of objects) for (const [name, v] of Object.entries(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).variables)) assert.equal(kindOf(v), null, `${f}: ${name}`);
    for (const f of ['box', 'lid']) assert.match(fs.readFileSync(path.join(dir, `projects/home/objects/${f}.js`), 'utf8'), /v\.fixings\.hole\('M3'/, `${f}.js draws its holes from v.fixings`);
    const cad = (...a) => execFileSync(process.execPath, [CAD, ...a], { cwd: dir, encoding: 'utf8', maxBuffer: 1 << 26 });
    const a = JSON.parse(fs.readFileSync(path.join(dir, 'projects/home/assemblies/lidded-box.json'), 'utf8'));
    assert.deepEqual(a.fasten, [{ screw: 'M3 cap', through: ['lid'], into: 'box', holes: 'lid.body', note: 'Lid screwed to the box' }]);
    assert.ok(!a.fits.some((x) => x.fastens || x.holes || x.fastener), 'the screws are the fasten\'s, not a fit\'s');
    // each part checks clean, the assembly too, with each screw followed through its holes
    for (const o of ['box', 'lid']) assert.doesNotMatch(cad('check', `home/${o}`), /✗|!/);
    const r = JSON.parse(cad('check', 'home/lidded-box', '--json'));
    assert.deepEqual(r.findings.filter((x) => x.level === 'fail' || x.level === 'warn').map((x) => x.text), []);
    for (const code of ['fasten.holes', 'fasten.clearance', 'fasten.end', 'fasten.length', 'fasten.engagement', 'fasten.seat', 'fasten.access']) assert.deepEqual(r.findings.filter((x) => x.code === code).map((x) => x.level), ['pass'], code);
    assert.match(r.findings.find((x) => x.code === 'fasten.length').text, /^Lid screwed to the box, 4 M3 cap screws: M3x8 cap chosen, the shortest sold that fits/);
    // its list names the screws, and its order the step they go in at
    assert.match(cad('list', 'home/lidded-box'), /4 ×\s+M3x8 cap\s+0\.913 g each, 3\.65 g\s+1 pack of 10, 6 spare\s+Lid screwed to the box/);
    assert.match(cad('order', 'home/lidded-box'), /2\. lid goes on: Lid screwed to the box \(4 × M3x8 cap\) with a 2\.5 mm hex key/);
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
    assert.throws(() => make('x', '--machine', 'hexapod'), /--machine is arm, leg or frame/);
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

test('--machine frame: a box from its inside size and profile checks clean on a fresh install, in every profile offered', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'create-machine-'));
  const make = (name, ...a) => execFileSync(process.execPath, [CREATE, path.join(root, name), '--no-install', '--machine', 'frame', ...a], { encoding: 'utf8', stdio: 'pipe' });
  try {
    // refused by name before anything is written: a size that is not three numbers, a profile it does not make the box
    // in, and a frame's flag on another machine
    assert.throws(() => make('a', '--size', '300x300'), /--size is the inside width x depth x height in mm, each 50 to 2000, as 300x300x350 \(got "300x300"\)/);
    assert.throws(() => make('b', '--profile', '4040-item-8'), /--profile is 2020-misumi-hfs5, 2020-openbuilds, 3030-misumi-hfs6: the profiles this box checks clean in \(got "4040-item-8"/);
    assert.throws(() => execFileSync(process.execPath, [CREATE, path.join(root, 'c'), '--no-install', '--machine', 'arm', '--size', '300x300x350'], { stdio: 'pipe' }), /--size is for --machine frame/);
    assert.deepEqual(fs.readdirSync(root), [], 'nothing written for a refusal');
    // each profile offered, made and checked as a person would after npm install: no check fails or warns. The defaults
    // first (300 x 300 x 350 in 2020-misumi-hfs5), then the others at another size
    for (const [name, args, profile, join] of [['box', [], '2020-misumi-hfs5', 'blind'], ['ob', ['--profile', '2020-openbuilds', '--size', '250x200x300'], '2020-openbuilds', 'blind'], ['hfs6', ['--profile', '3030-misumi-hfs6', '--size', '400x300x350'], '3030-misumi-hfs6', 'bracket']]) {
      const made = make(name, ...args), dir = path.join(root, name);
      assert.match(made, new RegExp(`a box frame round ${name === 'box' ? '300 x 300 x 350' : name === 'ob' ? '250 x 200 x 300' : '400 x 300 x 350'} mm inside, in ${profile}`));
      assert.match(made, /npx cad check frame\/box/);
      const a = JSON.parse(fs.readFileSync(path.join(dir, 'projects/frame/assemblies/box.json'), 'utf8'));
      assert.equal(a.frame.profile, profile); assert.equal(a.frame.join.kind ?? a.frame.join, join);
      assert.match(fs.readFileSync(path.join(dir, 'README.md'), 'utf8'), /## The frame[^]*npx cad kit frame\/box/);
      fs.symlinkSync(MODULES, path.join(dir, 'node_modules'), 'junction'); // stands in for npm install
      const r = JSON.parse(execFileSync(process.execPath, [CAD, 'check', 'frame/box', '--json'], { cwd: dir, encoding: 'utf8', maxBuffer: 1 << 26 }));
      assert.ok(r.findings, JSON.stringify(r.error ?? r));
      assert.deepEqual(r.findings.filter((x) => x.level === 'fail' || x.level === 'warn').map((x) => `${x.code}: ${x.text}`), [], `${profile}: checks clean`);
      for (const code of ['frame.generated', 'frame.deflection', 'frame.stress', 'frame.buckling', 'frame.rack', 'frame.frequency', 'assembly.order']) assert.ok(r.findings.some((x) => x.code === code), `${profile}: ${code}`);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
