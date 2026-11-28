// Two parts of the same height side by side on one plane, run 5 mm into each other in x and y (250 mm³ shared), in a
// workspace without manifold-3d (a new workspace's default): JSCAD measures the shared volume and fit must agree that
// they overlap, so 'no parts overlap' fails. The same parts face to face still pass.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/cad.mjs', import.meta.url));
const ROOT_MODULES = fileURLToPath(new URL('../../../node_modules', import.meta.url));

test('without manifold-3d, two equal-height parts on one plane overlapping 250 mm³ fail "no parts overlap"; face to face they pass', () => {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'rulecad-flush-'));
  const write = (f, x) => { fs.mkdirSync(path.join(ws, path.dirname(f)), { recursive: true }); fs.writeFileSync(path.join(ws, f), typeof x === 'string' ? x : JSON.stringify(x)); };
  try {
    write('package.json', { type: 'module' });
    fs.symlinkSync(ROOT_MODULES, path.join(ws, 'node_modules'), 'junction');
    // manifold-3d is installed in this repository, so it is hidden from the check: importing it fails, as it does
    // where it was never installed
    write('hooks.mjs', "export async function resolve(s, c, next) { if (s === 'manifold-3d' || s.startsWith('manifold-3d/')) throw Object.assign(new Error(`Cannot find package '${s}'`), { code: 'ERR_MODULE_NOT_FOUND' }); return next(s, c); }\n");
    write('hide-manifold.mjs', `import { register } from 'node:module';\nregister(${JSON.stringify(pathToFileURL(path.join(ws, 'hooks.mjs')).href)});\n`);
    write('projects/home/project.json', { name: 'home', material: 'PLA', objects: ['block'] });
    write('projects/home/objects/block.json', { name: 'block', title: 'Block', version: '0.1.0', variables: { side: { value: 10, unit: 'mm', rule: 'A side' } } });
    write('projects/home/objects/block.js', "import jscad from '@jscad/modeling'\nconst { cuboid } = jscad.primitives\nexport function main (v) { return cuboid({ size: [v.side, v.side, v.side], center: [v.side / 2, v.side / 2, v.side / 2] }) }\n");
    const pair = (name, at) => write(`projects/home/assemblies/${name}.json`, { title: name, items: [{ id: 'a', object: 'block', at: [0, 0, 0] }, { id: 'b', object: 'block', at }] });
    pair('into', [5, 5, 0]); pair('beside', [10, 5, 0]); pair('twice', [0, 0, 0]);
    const check = (name) => {
      const r = spawnSync(process.execPath, ['--import', pathToFileURL(path.join(ws, 'hide-manifold.mjs')).href, BIN, 'check', `home/${name}`, '--json'], { cwd: ws, encoding: 'utf8', env: { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') } });
      let out; try { out = JSON.parse(r.stdout); } catch { assert.fail(`${r.stdout}${r.stderr}`); }
      return out.findings.filter((x) => x.code === 'overlap');
    };
    const into = check('into');
    assert.deepEqual(into.map((x) => x.level), ['fail'], JSON.stringify(into));
    assert.match(into[0].text, /a\.body and b\.body overlap by 250 mm³/);
    assert.deepEqual(check('twice').map((x) => x.level), ['fail'], 'a part placed twice');
    const beside = check('beside');
    assert.deepEqual(beside.map((x) => x.level), ['pass'], JSON.stringify(beside));
    assert.match(beside[0].text, /no parts overlap/);
  } finally { fs.rmSync(ws, { recursive: true, force: true }); }
});
