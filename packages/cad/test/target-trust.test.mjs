// Targets and trust (issue #337). A target named in cad.config.json is either one of the kit's own, by its exact name
// (today only "gist"), or the workspace's own code, run in the tool's process: that is asked about (cad trust) whatever
// its name looks like. A bare name, a backslash path and a "../" name that reaches one of the kit's modules used to be
// taken for the kit's own, and so ran in a cloned workspace with nothing asked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { workspace } from './helpers.mjs';

const BIN = fileURLToPath(new URL('../bin/cad.mjs', import.meta.url));
const LIB = (f) => pathToFileURL(fileURLToPath(new URL(`../lib/${f}`, import.meta.url))).href;

// A workspace holding a module that leaves a mark when it loads, so a test can tell whether it ran
const MODULE = (mark) => `import fs from 'node:fs';\nfs.writeFileSync(${JSON.stringify(mark)}, 'ran');\nexport async function show() {}\nexport async function shorten() { return 'id'; }\n`;
// (helpers.mjs's workspace(), with a probe and a cad() that throws, both run with CAD_TRUST cleared)
function targetWorkspace(targets) {
  const { ws } = workspace({ targets });
  const env = { ...process.env, CAD_WORKSPACE: ws, CAD_TRUSTED: path.join(ws, '.trusted.json'), CAD_TRUST: '' };
  // What the workspace asks for, and what loading its target does: { asks, code, message } (code null: it loaded)
  const probe = (kind) => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
    const { asks } = await import(${JSON.stringify(LIB('workspace.mjs'))});
    const { target } = await import(${JSON.stringify(LIB('targets.mjs'))});
    let code = null, message = '';
    try { await target(${JSON.stringify(kind)}); } catch (e) { code = e.code || 'other'; message = e.message; }
    console.log(JSON.stringify({ asks: asks(), code, message }));
  `], { cwd: ws, encoding: 'utf8', env }));
  const cad = (...a) => execFileSync(process.execPath, [BIN, ...a], { cwd: ws, encoding: 'utf8', env });
  return { ws, probe, cad, done: () => fs.rmSync(ws, { recursive: true, force: true }) };
}

test('a target named without a slash or an extension is the workspace\'s code, asked about once', () => {
  const w = targetWorkspace({ show: 'show' });
  try {
    const mark = path.join(w.ws, 'ran.txt');
    fs.writeFileSync(path.join(w.ws, 'show'), MODULE(mark)); // (an extensionless module at the workspace's root)
    const before = w.probe('show');
    assert.deepEqual(before.asks, ['the show target show']);
    assert.equal(before.code, 'workspace.untrusted', before.message);
    assert.ok(!fs.existsSync(mark), 'nothing of the workspace\'s ran before it was trusted');
    assert.match(w.cad('trust'), /trusted .* for the show target show/);
    assert.equal(w.probe('show').code, null, 'once trusted, it runs as before');
    assert.ok(fs.existsSync(mark));
  } finally { w.done(); }
});

test('a backslash path is the workspace\'s code, asked about once', () => {
  const w = targetWorkspace({ show: 'helper\\show' });
  try {
    const r = w.probe('show');
    assert.deepEqual(r.asks, ['the show target helper\\show']);
    assert.equal(r.code, 'workspace.untrusted', r.message);
  } finally { w.done(); }
});

test('a "../" name that reaches one of the kit\'s own modules is not the kit\'s own target', () => {
  for (const name of ['../sandbox', '../targets/gist', 'targets/gist', 'gist.mjs', './gist']) {
    const w = targetWorkspace({ show: name });
    try {
      const before = w.probe('show');
      assert.deepEqual(before.asks, [`the show target ${name}`], name);
      assert.equal(before.code, 'workspace.untrusted', `${name}: ${before.message}`);
      if (name.startsWith('../')) { // once trusted, a path out of the workspace is still refused, in plain words
        w.cad('trust');
        const after = w.probe('show');
        assert.equal(after.code, 'workspace.outside', `${name}: ${after.message}`);
        assert.match(after.message, /outside this workspace/);
      }
    } finally { w.done(); }
  }
});

test('a target outside the workspace is asked about, and refused even once trusted', () => {
  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'rulecad-elsewhere-'));
  const mark = path.join(elsewhere, 'ran.txt');
  fs.writeFileSync(path.join(elsewhere, 'show.mjs'), MODULE(mark));
  try {
    for (const name of [path.join(elsewhere, 'show.mjs'), `../${path.basename(elsewhere)}/show.mjs`]) {
      const w = targetWorkspace({ show: name });
      try {
        const before = w.probe('show');
        assert.deepEqual(before.asks, [`the show target ${name}`]);
        assert.equal(before.code, 'workspace.untrusted', before.message);
        w.cad('trust');
        const after = w.probe('show');
        assert.equal(after.code, 'workspace.outside', after.message);
        assert.ok(!fs.existsSync(mark), `${name}: a module outside the workspace never ran`);
      } finally { w.done(); }
    }
  } finally { fs.rmSync(elsewhere, { recursive: true, force: true }); }
});

test('the kit\'s own gist target, by its exact name, still runs without trust', () => {
  const w = targetWorkspace({ shorten: 'gist' });
  try {
    const r = w.probe('shorten');
    assert.deepEqual(r.asks, []);
    assert.equal(r.code, null, r.message);
    assert.match(w.cad('trust'), /asks for nothing outside the sandbox/);
  } finally { w.done(); }
  const n = targetWorkspace({ shorten: 'toString' }); // (a name every object has is not one of the kit's)
  try { assert.equal(n.probe('shorten').code, 'workspace.untrusted'); } finally { n.done(); }
});
