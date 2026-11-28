// The workflows' own guards, read from the YAML as text: each commit is tested once, a newer push stops the run it
// replaces, publishing has a time limit, and the Pages deploy is a job of its own that tries twice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.github', 'workflows');
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
    out.push(l);
  }
  return out.join('\n');
}

test('tests run on pushes to main and on pull requests, not twice for a pull request commit', () => {
  const on = block(read('test.yml'), 'on');
  assert.ok(on, 'test.yml has an "on:" block');
  assert.doesNotMatch(on, /^on:\s*\[/, 'a bare list ([push, pull_request]) tests every branch push as well as its pull request');
  const push = block(on, 'push', 2);
  assert.ok(push, 'pushes are tested');
  assert.match(push, /branches:\s*\[\s*main\s*\]/, 'pushes are tested on main only');
  assert.match(on, /^ {2}pull_request:/m, 'pull requests are tested');
});

test('a newer push cancels the test run it replaces, except on main', () => {
  const c = block(read('test.yml'), 'concurrency');
  assert.ok(c, 'test.yml has a concurrency group');
  // One group per pull request; on main, one per commit, so a merge's run never waits for or drops another's
  assert.match(c, /group:\s*test-\$\{\{\s*github\.ref\s*==\s*'refs\/heads\/main'\s*&&\s*github\.sha\s*\|\|\s*github\.ref\s*\}\}/, 'one group per pull request, one per commit on main');
  assert.match(c, /cancel-in-progress:\s*\$\{\{\s*github\.ref\s*!=\s*'refs\/heads\/main'\s*\}\}/, 'cancelled everywhere but main');
});

test('publishing has a time limit', () => {
  const job = block(read('publish.yml'), 'publish', 2);
  assert.ok(job, 'publish.yml has a publish job');
  const m = job.match(/^ {4}timeout-minutes:\s*(\d+)/m);
  assert.ok(m, 'the publish job has timeout-minutes');
  assert.ok(Number(m[1]) > 0 && Number(m[1]) <= 180, `a limit of at most three hours (${m[1]} minutes)`);
});

test('Pages is built in one job and deployed in another that needs it, and the deploy is tried twice', () => {
  const jobs = block(read('pages.yml'), 'jobs');
  const build = block(jobs, 'build', 2);
  const deploy = block(jobs, 'deploy', 2);
  assert.ok(build, 'pages.yml has a build job');
  assert.ok(deploy, 'pages.yml has a deploy job');
  assert.match(build, /uses:\s*actions\/upload-pages-artifact@v4/, 'the build job uploads the site');
  assert.doesNotMatch(deploy, /upload-pages-artifact/, 'the deploy job only deploys');
  assert.match(deploy, /needs:\s*(\[\s*)?build/, 'the deploy job waits for the build');
  const deploys = deploy.match(/uses:\s*actions\/deploy-pages@/g) || [];
  assert.equal(deploys.length, 2, 'a first deploy and a retry');
  assert.match(deploy, /id:\s*deployment\n\s+continue-on-error:\s*true/, 'the first deploy may fail without failing the job');
  assert.match(deploy, /if:\s*steps\.deployment\.outcome\s*==\s*'failure'/, 'the retry runs only when the first deploy failed');
});
