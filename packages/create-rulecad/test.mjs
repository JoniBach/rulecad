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
    // The elbow on a 17HS4401, the shoulder's motor, on 12 V at 0.5 A, by hand. What it must do (arm.elbow_torque): the
    // pen's 0.3 N of drag at 115 mm, 0.035 N m, the forearm's 0.0006 kg m2 at 500 mm/s2 over 115 mm (4.35 rad/s2),
    // 0.003 N m, and the band's 0.04 N m bias: 0.077, so 0.08 N m. What it gives: 0.4 N m holding (the 17HS4401's,
    // community) / √2 = 0.2828 N m moving, flat to 60 × 12 / (2 × 0.0042 H × 1.5 A × 200) = 285.7 rpm on 12 V; at
    // 300 rpm 0.2828 × 285.7 / 300 = 0.2694 N m, at 0.5 of its 1.5 A 0.0898 N m, through 38:1 at the gears' 47% forwards
    // 0.0898 × 38 × 0.469 = 1.60 N m: 20 times the 0.08. (The NEMA 14 it replaces gave 1.419 N m on 24 V, 17.7 times.)
    const elbow = r.findings.find((x) => x.code === 'motor.torque' && x.refs?.joint === 'elbow');
    assert.equal(elbow.level, 'pass', elbow.text); assert.equal(elbow.values.supply, 12);
    const byHand = (0.4 / Math.SQRT2) * ((60 * 12) / (2 * 0.0042 * 1.5 * 200) / 300) * (0.5 / 1.5) * 38 * 0.469;
    assert.ok(Math.abs(elbow.values.available - byHand) / byHand < 0.005, `${elbow.values.available} N m against ${byHand} by hand`);
    assert.equal(elbow.values.needed, 0.08); assert.ok(elbow.values.margin > 19.9 && elbow.values.margin < 20.2, String(elbow.values.margin));
    assert.match(r.findings.find((x) => x.code === 'motor.model' && x.refs?.item === 'm2').text, /m2: nema17, 280 g/, 'the 17HS4401 at the elbow');
    // the drivers at 1/8 step and 0.5 A: 0.25 V on each trimmer for the DRV8825's 0.1 ohm sense resistors (Vref = I / 2)
    assert.deepEqual(r.findings.filter((x) => x.code === 'motor.driver' && x.level === 'pass').map((x) => x.values.vref), [0.25, 0.25]);
    assert.match(r.findings.find((x) => x.code === 'power.supply').text, /at 12 V/);
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
    // The stand steps under the robot's share or what rides its rods, the more: a 2 kg robot's 1 kg share is under the
    // 1.01 kg of leg and carriage (leg.riding), a 3 kg robot's 1.5 kg is over it
    assert.match(make('a-leg', '--machine', 'leg', '--robot', '2'), /2 kg robot; its share of the weight is 1 kg, and the stand steps under 1\.01 kg, what the leg and its carriage weigh/);
    assert.match(make('big-leg', '--machine', 'leg', '--robot', '3'), /share of the weight is 1\.5 kg, and the stand steps under 1\.5 kg: rules/);
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
    assert.throws(() => make('a', '--size', '300x300'), /--size is the inside width x depth x height in mm, as 300x300x350 \(got "300x300"\)/);
    // a size its box does not check clean in, refused for the profile asked: 2000 x 2000 x 2000 in 2020 sags 10.66 mm
    // against 5.56 and sways 20.1 mm against 5.12; 800 x 600 x 1000 in 3030 on printed brackets sways 7.6 mm against
    // 2.61; and 50 mm in 3030 crowds its brackets into each other
    assert.throws(() => make('a', '--size', '2000x2000x2000'), /--size in 2020-misumi-hfs5 is width and depth 50 to 1400 mm, height 50 to 600 mm: the sizes its box checks clean in \(got "2000x2000x2000"/);
    assert.throws(() => make('a', '--size', '1400x1401x600'), /--size in 2020-misumi-hfs5 is width and depth 50 to 1400 mm/);
    assert.throws(() => make('a', '--size', '300x300x601', '--profile', '2020-openbuilds'), /--size in 2020-openbuilds is width and depth 50 to 1400 mm, height 50 to 600 mm/);
    assert.throws(() => make('a', '--size', '800x600x1000', '--profile', '3030-misumi-hfs6'), /--size in 3030-misumi-hfs6 is width and depth 100 to 800 mm, height 100 to 300 mm/);
    assert.throws(() => make('a', '--size', '50x50x50', '--profile', '3030-misumi-hfs6'), /--size in 3030-misumi-hfs6 is width and depth 100 to 800 mm/);
    assert.throws(() => make('b', '--profile', '4040-item-8'), /--profile is 2020-misumi-hfs5, 2020-openbuilds, 3030-misumi-hfs6: the profiles this box checks clean in \(got "4040-item-8"/);
    assert.throws(() => execFileSync(process.execPath, [CREATE, path.join(root, 'c'), '--no-install', '--machine', 'arm', '--size', '300x300x350'], { stdio: 'pipe' }), /--size is for --machine frame/);
    // a size inside the ranges whose beams' cut lengths lie under 1 mm apart, which two cuts at ±0.5 mm cannot hold
    // apart (frame.cut warns). Hand: a 2020 box's uprights are the height and 2 x 20 + 18.5 = 58.5 mm, so at 300 high
    // 358.5 mm, 0.5 from a 358 or 359 mm width; a 3030 box's are the height and 60, 260 at 200 high, 0.5 from 260.5
    assert.throws(() => make('a', '--size', '358x300x300'), /--size 358x300x300 in 2020-misumi-hfs5 cuts the width's beams at 358 mm and the upright's at 358\.5 mm, 0\.5 mm apart: two cuts at ±0\.5 mm cannot hold them apart \(cad check warns frame\.cut\)\. Make them one length or 1 mm apart or more \(the uprights are the height and 58\.5 mm\)/);
    assert.throws(() => make('a', '--size', '300x359x300'), /cuts the depth's beams at 359 mm and the upright's at 358\.5 mm/);
    assert.throws(() => make('a', '--size', '300.5x299.7x350'), /cuts the width's beams at 300\.5 mm and the depth's at 299\.7 mm, 0\.8 mm apart/);
    assert.throws(() => make('a', '--size', '260.5x300x200', '--profile', '3030-misumi-hfs6'), /cuts the width's beams at 260\.5 mm and the upright's at 260 mm, 0\.5 mm apart[^]*the height and 60 mm/);
    assert.deepEqual(fs.readdirSync(root), [], 'nothing written for a refusal');
    // each profile offered, made and checked as a person would after npm install: no check fails or warns. The default
    // first (300 x 300 x 350 in 2020-misumi-hfs5), then each profile at the largest and the smallest corner of the sizes
    // it takes. A box only gets worse as a side grows (the top beam's sag grows with the width, the sway under a side
    // push with the height and the width across it), so clean at the largest corner is clean below it; the smallest
    // is where fittings crowd. Hand for the largest 2020 corner, 1400 x 1400 x 600: sway limit the frame's height, as cad
    // check measures it 648.5 mm (the inside and the rings and feet), over 400 = 1.62 mm; it sways 1.33 (blind joins); sag limit
    // 1400 / 360 = 3.89 mm, it sags 3.35. For 3030 at 800 x 800 x 300: 0.81 mm against 0.86
    const sizes = { '2020-misumi-hfs5': ['1400x1400x600', '50x50x50'], '2020-openbuilds': ['1400x1400x600', '50x50x50'], '3030-misumi-hfs6': ['800x800x300', '100x100x100'] };
    // and the closest lengths it takes, exactly 1 mm apart (frame.cut warns under 2 x 0.5 mm): 2020 at 357.5 wide beside
    // its 358.5 mm uprights, 300.5 deep beside 299.5 wide; 3030 at 261 wide beside its 260 mm uprights
    const near = [['2020-misumi-hfs5', '357.5x300x300'], ['2020-misumi-hfs5', '299.5x300.5x350'], ['3030-misumi-hfs6', '261x300x200']];
    const cases = [['box', [], '2020-misumi-hfs5', 'blind', '300 x 300 x 350'], ...Object.entries(sizes).flatMap(([profile, two]) => two.map((size, i) => [`${profile}-${i ? 'least' : 'most'}`, ['--profile', profile, '--size', size], profile, profile.startsWith('3030') ? 'bracket' : 'blind', size.replaceAll('x', ' x ')])),
      ...near.map(([profile, size], i) => [`near-${i}`, ['--profile', profile, '--size', size], profile, profile.startsWith('3030') ? 'bracket' : 'blind', size.replaceAll('x', ' x ')])];
    for (const [name, args, profile, join, shown] of cases) {
      const made = make(name, ...args), dir = path.join(root, name);
      assert.match(made, new RegExp(`a box frame round ${shown} mm inside, in ${profile}`));
      assert.match(made, /npx cad check frame\/box/);
      const a = JSON.parse(fs.readFileSync(path.join(dir, 'projects/frame/assemblies/box.json'), 'utf8'));
      assert.equal(a.frame.profile, profile); assert.equal(a.frame.join.kind ?? a.frame.join, join);
      assert.match(fs.readFileSync(path.join(dir, 'README.md'), 'utf8'), /## The frame[^]*npx cad kit frame\/box/);
      fs.symlinkSync(MODULES, path.join(dir, 'node_modules'), 'junction'); // stands in for npm install
      const r = JSON.parse(execFileSync(process.execPath, [CAD, 'check', 'frame/box', '--json'], { cwd: dir, encoding: 'utf8', maxBuffer: 1 << 26 }));
      assert.ok(r.findings, JSON.stringify(r.error ?? r));
      assert.deepEqual(r.findings.filter((x) => x.level === 'fail' || x.level === 'warn').map((x) => `${x.code}: ${x.text}`), [], `${name}: checks clean`);
      for (const code of ['frame.generated', 'frame.deflection', 'frame.stress', 'frame.buckling', 'frame.rack', 'frame.frequency', 'assembly.order']) assert.ok(r.findings.some((x) => x.code === code), `${name}: ${code}`);
      // MISUMI's 3030 has five bores in each end, and only the middle one (6.8 mm) is for M8: a foot taps that one alone
      if (profile === '3030-misumi-hfs6' && name.endsWith('least')) {
        const fr = JSON.parse(execFileSync(process.execPath, [CAD, 'frame', 'frame/box', '--json'], { cwd: dir, encoding: 'utf8', maxBuffer: 1 << 26 })).frame;
        assert.deepEqual(fr.ends.filter((e) => e.tap).map((e) => `${e.tap.at} ${e.tap.thread}`), Array(4).fill('a.1 M8'));
      }
      if (name !== 'box') continue;
      // the default's kit: one folder with the plates, the jigs, a sheet per mark, the shopping list and the build page.
      // Hand: the uprights are 350 + 2 x 20 + 18.5 = 408.5 mm (the bottom ring raised clear of the feet's 18.5 mm taps),
      // the eight butting beams the inside, 300 mm; each foot is held by one M5x16 cap screw
      const k = JSON.parse(execFileSync(process.execPath, [CAD, 'kit', 'frame/box', '--json'], { cwd: dir, encoding: 'utf8', maxBuffer: 1 << 26 })), kit = path.join(dir, k.dir);
      assert.deepEqual(k.files, ['README.md', 'buy.csv', 'print/box-base-1.3mf', 'print/box.jigs.3mf', 'sheets/beam-A.svg', 'sheets/beam-B.svg', 'sheets/beam-C.svg', 'sheets/beam-D.svg', 'sheets/beam-E.svg']);
      const readme = fs.readFileSync(path.join(kit, 'README.md'), 'utf8');
      assert.match(readme, /^# Box frame 300 x 300 x 350: the kit\n/);
      assert.match(readme, /none fail, none warn/);
      assert.match(readme, /\| E \| 8 \| profile-2020-misumi-hfs5 \| 300 \| x1, x2, y1, y2, x3, x4, y3, y4 \|/);
      assert.match(readme, /\| C \| 1 \| profile-2020-misumi-hfs5 \| 408\.5 \| z1 \|/);
      assert.match(readme, /\| 4 \| M5x16 cap \|/);
      assert.match(readme, /\n26\. cap-z4-b \(fitting:end-cap-2020-misumi-hfs5\) goes on\n/, 'the build to its last step');
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('--machine leg: the workspace carries the streamer and its sender, the arm\'s own programs, and the sender takes a gait file', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'create-machine-')), dir = path.join(root, 'my-leg');
  try {
    execFileSync(process.execPath, [CREATE, dir, '--no-install', '--machine', 'leg'], { encoding: 'utf8' });
    const read = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n'), arm = fileURLToPath(new URL('./machines/arm/projects/arm/', import.meta.url));
    for (const [f, same] of [['projects/leg/firmware/leg/leg.ino', 'firmware/arm/arm.ino'], ['projects/leg/send.mjs', 'send.mjs'], ['projects/leg/STREAMER.md', 'STREAMER.md']]) assert.equal(read(path.join(dir, f)), read(path.join(arm, same)), f);
    // a two-axis gait block for the stand's Uno: three numbers a block, the third axis 0
    const send = await import(pathToFileURL(path.join(dir, 'projects/leg/send.mjs')).href);
    const file = { format: 'rulecad.steps/1', kind: 'gait', axes: [{ name: 'hd' }, { name: 'kd' }], blocks: [{ type: 'move', steps: [400, -200], rate: { entry: 0, peak: 2000, exit: 0, accel: 20000 }, accelSteps: 100, decelSteps: 100 }] };
    assert.deepEqual(send.linesOf(file), ['m 400 -200 0 0 2000 0 20000 100 100']);
    assert.deepEqual(send.dryRun(['e', ...send.linesOf(file), 'd']).position, [400, -200, 0]);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
