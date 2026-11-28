// The one runner cad's tests start the command through (./helpers.mjs): a run that should succeed fails its test on any
// other exit, and a run that should fail fails its test when it succeeds, so no test passes on a status it never read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { workspace, runCad } from './helpers.mjs';

const HERE = fileURLToPath(new URL('./', import.meta.url));

test('cad() fails its test, with the command, its exit status and what it printed, when the command exits 1', () => {
  const { ws, cad, done } = workspace();
  try {
    assert.match(cad('--version'), /^\d+\.\d+\.\d+\s*$/, 'a run that exits 0 gives its output');
    assert.equal(cad.ok('--version'), cad('--version'), 'cad.ok is cad by name');
    assert.throws(() => cad('chekc', 'demo/block'), (e) => {
      assert.equal(e.name, 'AssertionError');
      assert.match(e.message, /a run that should succeed did not/);
      assert.match(e.message, /cad chekc demo\/block/, 'the command');
      assert.match(e.message, /exited 1/, 'its exit status');
      assert.match(e.message, /no command "chekc"/, 'what it printed');
      return true;
    });
    assert.throws(() => cad.json('chekc'), /exited 1/, 'cad.json fails the same way');
    assert.throws(() => cad.json('--version'), /printed no JSON/, 'and fails when the output is not JSON');
  } finally { done(); }
});

test('cad.refused() fails its test when the command exits 0, or fails without the code or text it was to print', () => {
  const { ws, cad, done } = workspace();
  try {
    assert.match(cad.refused('no command "chekc"', 'chekc'), /cad help lists them/, 'a refusal with its text gives the output');
    assert.match(cad.refused(/no command "\w+"/, 'chekc'), /chekc/, 'the text can be a pattern');
    assert.throws(() => cad.refused('anything', '--version'), (e) => {
      assert.equal(e.name, 'AssertionError');
      assert.match(e.message, /a run that should fail succeeded/);
      assert.match(e.message, /cad --version/);
      assert.match(e.message, /exited 0/);
      return true;
    });
    assert.throws(() => cad.refused('model.sealed', 'chekc'), /a run failed, but without "model\.sealed"/, 'a failure for another reason is not the refusal asked for');
  } finally { done(); }
});

test('cad.run() keeps the exit status whatever it is, and a timeout stops a run that would hang and says so', () => {
  const { ws, cad, done } = workspace();
  try {
    const r = cad.run('chekc');
    assert.equal(r.status, 1);
    assert.equal(r.code, 1, 'code is status under its older name');
    assert.match(r.out, /no command "chekc"/);
    assert.equal(r.json, undefined, 'output that is not JSON reads as no JSON');
    assert.equal(cad.run('--version').status, 0);
    assert.equal(runCad(ws, ['--version']).status, 0, 'runCad is the same runner, for a folder of any kind');
    const slow = cad.with({ timeout: 1 });
    assert.equal(slow.run('--version').status, null, 'a run past its timeout is stopped');
    assert.throws(() => slow('--version'), /ran past 0\.001 s, so it may hang/);
    assert.throws(() => slow.refused('x', '--version'), /a run that should fail was stopped/, 'a run stopped by its timeout is no refusal');
    assert.equal(cad.with({ env: { CAD_TRUSTED: undefined } }).run('--version').status, 0, 'env adds to the environment, or takes a name out');
  } finally { done(); }
});

test('no cad test starts the command itself: every run goes through the runner in ./helpers.mjs', () => {
  const files = fs.readdirSync(HERE).filter((f) => f.endsWith('.test.mjs'));
  // the command's path (helpers' BIN) as an argument of its own in a list, or a path of the file's own to the command
  const own = files.filter((f) => /[[,]\s*BIN\s*[,\]]|bin\/cad\.mjs/.test(fs.readFileSync(new URL(f, import.meta.url), 'utf8').replace(/^import .*$/gm, '')));
  assert.deepEqual(own, [], 'these test files start the cad command with a spawnSync or execFileSync of their own, so a wrong exit status can pass: use cad(), cad.refused() or cad.run() from workspace() instead');
});
