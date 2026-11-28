// cad's tests of the sandbox designs run in, the engines, the in-memory host and the helper packages read as sources. The shared helpers are in ./helpers.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { workspace, object, run, BIN, ROOT_MODULES, CAD } from './helpers.mjs';

test('sandbox: a design can make shapes, but not read or write files, reach the network or start programs', () => {
  const { ws, cad, done } = workspace();
  try {
    const vars = { w: { value: 10, unit: 'mm', rule: 'Width' } };
    const tryIt = (name, body) => {
      object(ws, `demo/${name}`, { variables: vars }, `import jscad from '@jscad/modeling'\n${body}\nexport function main (v) { return jscad.primitives.cuboid({ size: [v.w, v.w, v.w], center: [0, 0, v.w / 2] }) }\n`);
      return cad('check', `demo/${name}`);
    };
    assert.match(tryIt('fine', ''), /fits the bed/);
    assert.match(tryIt('fs', "import fs from 'node:fs'"), /designs can't import "node:fs"/);
    assert.match(tryIt('net', "await fetch('https://example.com')"), /fetch is not defined/);
    assert.match(tryIt('dyn', "await import('node:child_process')"), /designs can't import "node:child_process"/);
    assert.match(tryIt('outside', "await import('../../../../x.mjs')"), /can't import|outside|Cannot find/);
    assert.match(tryIt('write', "process.binding('fs')"), /restricted|denied|not allowed|binding/i);
    assert.ok(!fs.existsSync(path.join(ws, 'pwned')));
    fs.writeFileSync(path.join(ws, 'cad.config.json'), JSON.stringify({ sandbox: false }));
    assert.match(tryIt('untrusted', "import fs from 'node:fs'"), /designs can't import "node:fs"/, 'a workspace that turns the sandbox off isn\'t believed until its user trusts it');
    assert.match(cad('trust'), /trusted .* for designs run outside the sandbox/);
    assert.match(tryIt('trusted', "import fs from 'node:fs'"), /fits the bed/, 'a workspace can trust its own designs, once its user says so');
    fs.writeFileSync(path.join(ws, 'cad.config.json'), JSON.stringify({ sandbox: false, targets: { show: 'mine/show.mjs' } }));
    assert.match(cad('show', 'demo/fine'), /asks for designs run outside the sandbox and the show target mine\/show\.mjs .* run cad trust once/, 'asking for more is asked again'); // (a design that builds in the sandbox too: this one's about the target, whether or not its build is cached)
  } finally { done(); }
});

test('engines: a design using v.ops builds the same shape with JSCAD and with Manifold, watertight', () => {
  const { ws, cad, done } = workspace();
  try {
    const vars = { w: { value: 20, unit: 'mm', rule: 'Width', tweak: { min: 5, max: 50 } }, r: { value: 'w * 0.6', unit: 'mm', rule: 'Radius' }, n: { value: 64, unit: '', rule: 'Segments' } };
    object(ws, 'demo/cut', { variables: vars }, `import jscad from '@jscad/modeling'
const { cuboid, sphere } = jscad.primitives
export function main (v) {
  return v.ops.subtract(cuboid({ size: [v.w, v.w, v.w], center: [0, 0, v.w / 2] }), sphere({ radius: v.r, center: [0, 0, v.w], segments: v.n }))
}
`);
    const j = JSON.parse(cad('check', 'demo/cut', '--json')), m = JSON.parse(execFileSync(process.execPath, [BIN, 'check', 'demo/cut', '--json'], { cwd: ws, encoding: 'utf8', env: { ...process.env, CAD_ENGINE: 'manifold' } }));
    const size = (r) => r.findings.find((f) => f.code === 'print.bed').values.size, base = (r) => r.findings.find((f) => f.code === 'print.base').values.area;
    assert.deepEqual(size(j).map((x) => x.toFixed(2)), size(m).map((x) => x.toFixed(2)));
    assert.ok(Math.abs(base(j) - base(m)) < 0.5, 'the same footprint');
    const closed = m.findings.find((f) => f.code === 'print.closed');
    assert.equal(closed.level, 'pass'); assert.equal(closed.values.tjunctions, 0, 'Manifold leaves no T-junctions');
  } finally { done(); }
});

test('host: the core builds and checks a design from a workspace in memory, writing nothing to disk', () => {
  const lib = (f) => JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../lib', f)).href);
  const root = path.resolve('/rulecad-memory-test');
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', `
    import fs from 'node:fs';
    import { useHost, memoryHost } from ${lib('host.mjs')};
    const h = memoryHost({
      'cad.config.json': '{}',
      'projects/demo/project.json': JSON.stringify({ name: 'demo', objects: ['box'] }),
      'projects/demo/objects/box.json': JSON.stringify({ name: 'box', version: '0.1.0', uses: ['x1c'], variables: { w: { value: 'x1c.line * 40', unit: 'mm', rule: 'Width' } } }),
      'projects/demo/objects/box.js': "import jscad from '@jscad/modeling'\\nexport function main (v) { return jscad.primitives.cuboid({ size: [v.w, v.w, v.w], center: [0, 0, v.w / 2] }) }\\n",
    }, { root: ${JSON.stringify(root)} });
    useHost(h);
    const { build, locate, printer } = await import(${lib('design.mjs')});
    const { check } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(BIN), '../../printcheck/printcheck.mjs')).href)});
    const d = locate('demo/box'), b = await build(d, {}, { trusted: true }); // (a workspace in memory has no sandbox: its designs run only when the caller trusts them)
    const found = check(b.triangles, printer(b, d));
    console.log(JSON.stringify({ size: found.find((f) => f.code === 'print.bed').values.size.map((x) => +x.toFixed(2)),
      onDisk: fs.existsSync(${JSON.stringify(root)}), cached: [...h.files.keys()].some((k) => k.includes('.cache')), rules: [...h.files.keys()].some((k) => k.endsWith('x1c.json')) }));
  `], { cwd: os.tmpdir(), encoding: 'utf8', env: { ...process.env, CAD_WORKSPACE: root } });
  assert.deepEqual(JSON.parse(out), { size: [16.8, 16.8, 16.8], onDisk: false, cached: true, rules: true });
});

test('sandbox: the roads round the import hook are shut too, and the design sees none of the environment', () => {
  const { ws, done } = workspace();
  try {
    const vars = { w: { value: 10, unit: 'mm', rule: 'Width' } };
    const tryIt = (name, top, body) => {
      object(ws, `demo/${name}`, { variables: vars }, `import jscad from '@jscad/modeling'\n${top}\nexport function main (v) {\n  ${body}\n  return jscad.primitives.cuboid({ size: [v.w, v.w, v.w], center: [0, 0, v.w / 2] })\n}\n`);
      return run(ws, ['check', `demo/${name}`], { SECRET_TOKEN: 'tok123' }).out;
    };
    assert.match(tryIt('builtin', '', "process.getBuiltinModule('node:fs')"), /getBuiltinModule is not a function/);
    assert.match(tryIt('env', '', "if (process.env.SECRET_TOKEN || process.env.HOME) throw new Error('the environment leaked')"), /fits the bed/);
    assert.match(tryIt('kill', '', "if (process.kill || process.binding) throw new Error('process can still reach out')"), /fits the bed/);
    // a node_modules folder inside the project is the design's own code, held to the same imports
    fs.mkdirSync(path.join(ws, 'projects/demo/node_modules'), { recursive: true });
    fs.writeFileSync(path.join(ws, 'projects/demo/node_modules/helper.mjs'), "export * as http from 'node:http'\n");
    assert.match(tryIt('own-modules', "import * as h from '../node_modules/helper.mjs'", ''), /designs can't import "node:http"/);
    // and a path out of the project is refused wherever it leads, the workspace's packages included
    assert.match(tryIt('leaves', "import * as ts from '../../../node_modules/typescript/lib/typescript.js'", ''), /it is outside the project/);
    fs.writeFileSync(path.join(ws, 'projects/demo/objects/half.js'), 'export const half = (x) => x / (1 + 1)\n');
    assert.match(tryIt('own-file', "import { half } from './half.js'", 'half(v.w)'), /fits the bed/, 'its own files are still its own');
  } finally { done(); }
});

test('a node_modules link spelled through another link: the sandbox names the link it was refused, and the remedy', { skip: process.platform === 'win32' && 'linked folders need privileges on Windows' }, () => {
  const { ws, cad, done } = workspace();
  // a folder outside the workspace, reached through a link beside it: the way macOS spells /var/folders through /var
  const real = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'rulecad-alias-'))), alias = `${real}-link`;
  try {
    fs.symlinkSync(real, alias, 'dir'); fs.symlinkSync(ROOT_MODULES, path.join(real, 'node_modules'), 'dir');
    fs.rmSync(path.join(ws, 'node_modules')); fs.symlinkSync(path.join(alias, 'node_modules'), path.join(ws, 'node_modules'), 'dir');
    cad('new', 'home/tray');
    const out = cad('check', 'home/tray');
    assert.match(out, new RegExp(`sandbox was refused ${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}, a link to ${real.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), out);
    assert.match(out, /Make that link with its real path/);
  } finally { done(); fs.rmSync(alias, { force: true }); fs.rmSync(real, { recursive: true, force: true }); }
});

test('a helper package\'s dot-files are not its sources: a scratch module another package\'s tests write beside them, gone mid-read, does not crash cad', () => {
  // The fixings tests write .readme-example-<n>.mjs into their package while they run; cad, started in parallel (CI
  // runs the packages' tests at once), listed the folder, then read a file already deleted (ENOENT, seen on Windows).
  // A directory named like a module stands in for that file: reading it throws, so only skipping dot-files passes
  const dir = path.dirname(fileURLToPath(import.meta.resolve('@rulecad/fixings'))), probe = path.join(dir, '.cad-dotfile-probe.mjs');
  fs.mkdirSync(probe, { recursive: true });
  try {
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(pathToFileURL(fileURLToPath(new URL('./lib/design.mjs', CAD))).href)}); console.log('loaded')`], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /loaded/);
  } finally { fs.rmSync(probe, { recursive: true, force: true }); }
});
