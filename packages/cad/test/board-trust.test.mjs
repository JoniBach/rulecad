// Board designs and in-memory designs, and trust (issue #338). A board design (an object whose .json says
// "engine": "pcb") runs in the tool's own process, with the board engine, not in the sandbox: so a workspace with one
// is asked about once (cad trust), as one that turns the sandbox off is. A workspace held in memory (memoryHost) has
// no sandbox at all, so its designs run only when the caller says it trusts them (build's trusted: true). Both used
// to run with nothing asked: a cloned board workspace ran any code on its first cad check.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/cad.mjs', import.meta.url));
const LIB = (f) => pathToFileURL(fileURLToPath(new URL(`../lib/${f}`, import.meta.url))).href;
const ROOT_MODULES = fileURLToPath(new URL('../../../node_modules', import.meta.url));

// A board design that leaves a mark when it loads, so a test can tell whether it ran
const BOARD = (mark) => `import fs from 'node:fs';
fs.writeFileSync(${JSON.stringify(mark)}, 'ran');
export function main (v) { return { center: { x: 0, y: 0 }, width: v.w, height: v.d, thickness: v.thickness, parts: [], traces: [], silk: [], holes: [] } }
`;
const BOARD_JSON = { name: 'b', title: 'Board', version: '0.1.0', engine: 'pcb', role: 'board', uses: ['jlcpcb'], parts: { board: { label: 'PCB' } },
  variables: { w: { value: 30, unit: 'mm', rule: 'Width' }, d: { value: 20, unit: 'mm', rule: 'Depth' }, thickness: { value: 'jlcpcb.thickness', unit: 'mm', rule: 'Standard' } } };

function workspace() {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'rulecad-board-'));
  fs.writeFileSync(path.join(ws, 'package.json'), JSON.stringify({ type: 'module' }));
  fs.writeFileSync(path.join(ws, 'cad.config.json'), '{}');
  fs.symlinkSync(ROOT_MODULES, path.join(ws, 'node_modules'), 'junction');
  fs.mkdirSync(path.join(ws, 'projects/p/objects'), { recursive: true });
  fs.writeFileSync(path.join(ws, 'projects/p/project.json'), JSON.stringify({ name: 'p', objects: ['b'] }));
  const env = { ...process.env, CAD_WORKSPACE: ws, CAD_TRUSTED: path.join(ws, '.trusted.json'), CAD_TRUST: '', CAD_NO_CACHE: '1' };
  const cad = (...a) => spawnSync(process.execPath, [BIN, ...a], { cwd: ws, encoding: 'utf8', env });
  const board = (name, mark) => {
    fs.writeFileSync(path.join(ws, `projects/p/objects/${name}.json`), JSON.stringify({ ...BOARD_JSON, name }));
    fs.writeFileSync(path.join(ws, `projects/p/objects/${name}.js`), BOARD(mark));
  };
  return { ws, env, cad, board, done: () => fs.rmSync(ws, { recursive: true, force: true }) };
}

test('an untrusted board design is refused and runs nothing; cad trust lists it, and after that it builds', () => {
  const w = workspace();
  try {
    const mark = path.join(w.ws, 'ran.txt');
    w.board('b', mark);
    const before = w.cad('check', 'p/b');
    assert.notEqual(before.status, 0, before.stdout);
    const said = before.stdout + before.stderr;
    assert.match(said, /board designs run outside the sandbox/);
    assert.match(said, /projects\/p\/objects\/b\.json/, 'it names the object file');
    assert.match(said, /"engine": "pcb"/, 'and the field that asks');
    assert.match(said, /cad trust/);
    assert.ok(!fs.existsSync(mark), 'the board design did not run before the workspace was trusted');
    const trusted = w.cad('trust');
    assert.match(trusted.stdout, /trusted .* for board designs run outside the sandbox/);
    assert.deepEqual(Object.values(JSON.parse(fs.readFileSync(path.join(w.ws, '.trusted.json'), 'utf8'))), [['board designs run outside the sandbox']], 'what cad trust records');
    const after = w.cad('check', 'p/b');
    assert.equal(after.status, 0, after.stdout + after.stderr);
    assert.ok(fs.existsSync(mark), 'once trusted, it builds');
    // a second board design later is covered by the same answer: the question is whether the workspace's boards run
    w.board('c', path.join(w.ws, 'ran-c.txt'));
    assert.equal(w.cad('check', 'p/c').status, 0);
  } finally { w.done(); }
});

test('a workspace with no board design asks nothing for boards', () => {
  const w = workspace();
  try {
    fs.writeFileSync(path.join(w.ws, 'projects/p/objects/plain.json'), JSON.stringify({ name: 'plain', version: '0.1.0', variables: {} }));
    assert.match(w.cad('trust').stdout, /nothing to trust/);
  } finally { w.done(); }
});

test('asks() reads the objects once per run, and a board design that appears later is still asked about when it is built', () => {
  const w = workspace();
  try {
    const mark = path.join(w.ws, 'ran.txt');
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', `
      import fs from 'node:fs';
      const { asks } = await import(${JSON.stringify(LIB('workspace.mjs'))});
      const { build, locate } = await import(${JSON.stringify(LIB('design.mjs'))});
      const first = asks();
      fs.writeFileSync(${JSON.stringify(path.join(w.ws, 'projects/p/objects/b.json'))}, ${JSON.stringify(JSON.stringify(BOARD_JSON))});
      fs.writeFileSync(${JSON.stringify(path.join(w.ws, 'projects/p/objects/b.js'))}, ${JSON.stringify(BOARD(mark))});
      const cached = asks(); // (not read again: the scan is kept for the run)
      let code = null;
      try { await build(locate('p/b')); } catch (e) { code = e.code || e.message; }
      console.log(JSON.stringify({ first, cached, code, later: asks() }));
    `], { cwd: w.ws, encoding: 'utf8', env: w.env });
    assert.deepEqual(JSON.parse(out), { first: [], cached: [], code: 'workspace.untrusted', later: ['board designs run outside the sandbox'] });
    assert.ok(!fs.existsSync(mark));
  } finally { w.done(); }
});

// A workspace in memory: a design run there runs in the tool's own process, so only when the caller trusts it
const memoryBuild = (root, mark, options) => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
  import fs from 'node:fs';
  const { useHost, memoryHost } = await import(${JSON.stringify(LIB('host.mjs'))});
  useHost(memoryHost({
    'cad.config.json': '{}',
    'projects/demo/project.json': JSON.stringify({ name: 'demo', objects: ['box'] }),
    'projects/demo/objects/box.json': JSON.stringify({ name: 'box', version: '0.1.0', variables: { w: { value: 10, unit: 'mm', rule: 'Width' } } }),
    'projects/demo/objects/box.js': ${JSON.stringify(`import fs from 'node:fs'\nimport jscad from '@jscad/modeling'\nfs.writeFileSync(${JSON.stringify(mark)}, 'ran')\nexport function main (v) { return jscad.primitives.cuboid({ size: [v.w, v.w, v.w] }) }\n`)},
  }, { root: ${JSON.stringify(root)} }));
  const { build, locate } = await import(${JSON.stringify(LIB('design.mjs'))});
  let code = null, message = '', parts = 0;
  try { parts = (await build(locate('demo/box'), {}, ${JSON.stringify(options)})).parts.length; } catch (e) { code = e.code || 'other'; message = e.message; }
  console.log(JSON.stringify({ code, message, parts }));
`], { cwd: os.tmpdir(), encoding: 'utf8', env: { ...process.env, CAD_WORKSPACE: root, CAD_TRUST: '', CAD_NO_CACHE: '1' } }));

test('a design in a workspace held in memory is refused unless the caller passes trusted: true', () => {
  const root = path.resolve('/rulecad-memory-trust-test'), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rulecad-memtrust-')), mark = path.join(dir, 'ran.txt');
  try {
    const refused = memoryBuild(root, mark, {});
    assert.equal(refused.code, 'workspace.untrusted', refused.message);
    assert.match(refused.message, /trusted: true/);
    assert.ok(!fs.existsSync(mark), 'the design did not run');
    const ran = memoryBuild(root, mark, { trusted: true });
    assert.equal(ran.code, null, ran.message);
    assert.equal(ran.parts, 1);
    assert.ok(fs.existsSync(mark), 'with trusted: true it runs, in the tool\'s process');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// Ways round the gate found after it was written
test('a trusted workspace does not run a board design from outside its folder', () => {
  const w = workspace(), other = workspace();
  try {
    w.board('b', path.join(w.ws, 'ran.txt'));
    assert.equal(w.cad('trust').status, 0);
    const mark = path.join(other.ws, 'ran.txt');
    other.board('b', mark);
    const r = w.cad('check', path.join(other.ws, 'projects/p/objects/b.json'));
    assert.notEqual(r.status, 0, r.stdout);
    assert.match(r.stdout + r.stderr, /outside this workspace/);
    assert.ok(!fs.existsSync(mark), 'the other workspace\'s board did not run under this one\'s trust');
    assert.equal(w.cad('check', path.join(w.ws, 'projects/p/objects/b.json')).status, 0, 'its own board, by its full path, still runs');
  } finally { w.done(); other.done(); }
});

test('a workspace in memory runs designs only for trusted: true itself, not a value that merely looks true', () => {
  const root = path.resolve('/rulecad-memory-trust-test'), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rulecad-memtrust-')), mark = path.join(dir, 'ran.txt');
  try {
    for (const trusted of ['false', 1, 'yes', {}]) {
      const r = memoryBuild(root, mark, { trusted });
      assert.equal(r.code, 'workspace.untrusted', `${JSON.stringify(trusted)}: ${r.message}`);
      assert.ok(!fs.existsSync(mark), `${JSON.stringify(trusted)}: the design did not run`);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
