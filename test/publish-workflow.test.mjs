// The release workflow's guards, read from the YAML as text: publishing waits for the whole test run (every platform)
// to pass on main, a read-only job decides whether anything is due, the job that can publish to npm installs without
// running any package's install scripts and runs no tests, the GitHub Releases are made by a job of their own, and
// every action any workflow uses is pinned to a commit. Then the two scripts' parts that run without npm.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { outputs } from '../scripts/publish-plan.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, '.github', 'workflows');
const read = (name) => fs.readFileSync(path.join(DIR, name), 'utf8').replace(/\r\n/g, '\n');

/** The lines under `key:` that are indented more than it, comments dropped: one block of a YAML file. */
function block(text, key, indent = 0) {
  const lines = text.split('\n');
  const pad = ' '.repeat(indent);
  const start = lines.findIndex((l) => l.startsWith(`${pad}${key}:`) && !l.startsWith(`${pad} `));
  if (start < 0) return null;
  const out = [lines[start]];
  for (const l of lines.slice(start + 1)) {
    if (l.trim() === '' || l.trim().startsWith('#')) continue;
    if (l.length - l.trimStart().length <= indent) break;
    out.push(l.replace(/\s+#.*$/, ''));
  }
  return out.join('\n');
}
const publishYml = read('publish.yml');
const jobs = block(publishYml, 'jobs');
const job = (name) => {
  const j = block(jobs, name, 2);
  assert.ok(j, `publish.yml has a ${name} job`);
  return j;
};
/** A job's own permissions, as { name: level }. */
const permissions = (j) => Object.fromEntries((block(j, 'permissions', 4) || '').split('\n').slice(1).map((l) => l.trim().split(/:\s*/)));

test('publishing starts from a finished test run on main (or by hand), never from a push of its own', () => {
  const on = block(publishYml, 'on');
  assert.ok(on, 'publish.yml has an "on:" block');
  assert.doesNotMatch(on, /^ {2}push:/m, 'a push to main would publish before the tests on every platform have passed');
  const run = block(on, 'workflow_run', 2);
  assert.ok(run, 'publish waits for the test workflow (workflow_run)');
  assert.match(run, /workflows:\s*\[\s*test\s*\]/, 'the workflow it waits for is test');
  assert.match(run, /types:\s*\[\s*completed\s*\]/);
  assert.match(run, /branches:\s*\[\s*main\s*\]/);
  assert.match(on, /^ {2}workflow_dispatch:/m, 'a maintainer can start it by hand');
});

test('only a passing test run of a push to main, in this repository, goes on to the plan', () => {
  const plan = job('plan');
  const cond = plan.match(/^ {4}if:\s*(.+)$/m)?.[1] || '';
  // A pull request from a fork whose branch is called main also has head_branch "main": event and repository rule it out
  for (const part of [/workflow_run\.conclusion\s*==\s*'success'/, /workflow_run\.head_branch\s*==\s*'main'/, /workflow_run\.event\s*==\s*'push'/,
    /workflow_run\.head_repository\.full_name\s*==\s*github\.repository/, /github\.event_name\s*==\s*'workflow_dispatch'/]) {
    assert.match(cond, part, `the plan job's condition: ${cond}`);
  }
});

test('nothing in the workflow can write or publish unless a job asks for it', () => {
  const top = block(publishYml, 'permissions');
  assert.ok(top, 'publish.yml sets its default permissions');
  assert.doesNotMatch(top, /write/, 'the default is read-only (or none)');
});

test('the plan job only reads: it checks out the tested commit and says whether anything is due', () => {
  const plan = job('plan');
  const p = permissions(plan);
  assert.equal(p.contents, 'read');
  assert.ok(!Object.values(p).includes('write'), `no write permission: ${JSON.stringify(p)}`);
  assert.match(plan, /workflow_run\.head_sha/, 'under workflow_run, the commit the tests passed on, not main\'s latest');
  assert.match(plan, /node scripts\/publish-plan\.mjs/);
  assert.doesNotMatch(plan, /npm (ci|install|test)\b/, 'the plan needs nothing installed');
  assert.match(plan, /outputs:[\s\S]*due:/, 'it says whether anything is due');
  // A request inside a test ([ "$(gh api ...)" = 0 ]) that fails gives an empty answer, which would count as a pass
  assert.doesNotMatch(plan, /\[\s*"\$\(gh api/, 'each question to GitHub is asked on a line of its own, so a failed one stops the job');
  assert.match(plan, /passed="\$\(gh api [^\n]*status=success/, 'started by hand, the commit needs a passing test run');
});

test('the publish job holds the right to publish alone, installs without install scripts and runs no tests', () => {
  const pub = job('publish');
  assert.match(pub, /needs:\s*(\[\s*)?plan/);
  assert.match(pub, /^ {4}if:.*needs\.plan\.outputs\.due\s*==\s*'true'/m, 'it is skipped when nothing is due');
  assert.match(pub, /^ {4}environment:\s*npm-publish\s*$/m, 'it runs in the npm-publish environment');
  assert.deepEqual(permissions(pub), { contents: 'read', 'id-token': 'write' });
  assert.match(pub, /run:\s*npm ci --ignore-scripts/);
  assert.doesNotMatch(pub, /npm ci\s*$/m, 'every install in this job skips install scripts');
  assert.doesNotMatch(pub, /npm (install|test)\b|fresh-install|test:browser/, 'the tests ran before, on every platform');
  assert.match(pub, /ref:\s*\$\{\{\s*needs\.plan\.outputs\.sha\s*\}\}/, 'it publishes the commit the plan was made from');
  assert.match(pub, /node scripts\/publish\.mjs\s*$/m);
  const m = pub.match(/^ {4}timeout-minutes:\s*(\d+)/m);
  assert.ok(m && Number(m[1]) <= 60, 'publishing alone has a time limit of at most an hour');
});

test('the GitHub Releases are made by a job of their own, which installs nothing and cannot publish', () => {
  const rel = job('releases');
  assert.match(rel, /needs:\s*\[\s*plan,\s*publish\s*\]/);
  assert.deepEqual(permissions(rel), { contents: 'write' });
  assert.doesNotMatch(rel, /npm (ci|install|test)\b/);
  assert.match(rel, /node scripts\/publish\.mjs --releases-only/);
  assert.match(rel, /RELEASE_SHA:\s*\$\{\{\s*needs\.plan\.outputs\.sha\s*\}\}/, 'each release is tagged at the tested commit');
});

test('every action in every workflow is pinned to a commit, its version in a comment', () => {
  for (const name of fs.readdirSync(DIR).filter((f) => /\.ya?ml$/.test(f))) {
    for (const line of read(name).split('\n').filter((l) => /^\s*-?\s*uses:/.test(l))) {
      assert.match(line, /uses:\s*[\w.-]+\/[\w./-]+@[0-9a-f]{40}\s+#\s*v\d+(\.\d+){0,2}\s*$/, `${name}: ${line.trim()}`);
    }
  }
});

test('the fresh install (as a stranger installs the packages) runs with the tests, before any release', () => {
  const fresh = block(block(read('test.yml'), 'jobs'), 'fresh-install', 2);
  assert.ok(fresh, 'test.yml has a fresh-install job');
  assert.match(fresh, /run:\s*test\/fresh-install\.sh/);
});

test('the plan says whether anything is due and which versions, for the jobs after it', () => {
  const p = (dir, version) => ({ dir, name: `@rulecad/${dir}`, version });
  assert.deepEqual(outputs({ publish: [], new: [], held: [] }), { due: 'false', versions: '' });
  assert.deepEqual(outputs({ publish: [p('fit', '0.2.1'), p('cad', '0.7.1')], new: [], held: [] }), { due: 'true', versions: '@rulecad/fit@0.2.1 @rulecad/cad@0.7.1' });
  // A package new to npm alone is still due: the publish job reports what to do about it and the run is marked failed
  assert.deepEqual(outputs({ publish: [], new: [p('fea', '0.1.0')], held: [p('cad', '0.7.1')] }), { due: 'true', versions: '' });
});

test('the releases step refuses to guess which commit to tag', () => {
  const run = (env) => execFileSync(process.execPath, ['scripts/publish.mjs', '--releases-only'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    env: { PATH: process.env.PATH, ...env } });
  assert.throws(() => run({ RELEASES: '@rulecad/fit@0.2.1', GITHUB_SHA: 'a'.repeat(40) }), /RELEASE_SHA/, 'GITHUB_SHA under workflow_run is main\'s latest commit, not the tested one');
  assert.match(run({ RELEASES: '', RELEASE_SHA: 'a'.repeat(40) }), /no releases to make/);
});
