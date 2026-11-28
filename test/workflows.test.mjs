// The workflows' own guards, read from the YAML as text: each commit is tested once, a newer push stops the run it
// replaces, publishing has a time limit, and the Pages deploy is a job of its own that tries twice. Then the test job
// in parts (scripts/test.mjs shares the files out), a quick job, and the slowest tests nightly and on release pull
// requests (slow-tests.yml).
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
  assert.match(build, /uses:\s*actions\/upload-pages-artifact@/, 'the build job uploads the site');
  assert.doesNotMatch(deploy, /upload-pages-artifact/, 'the deploy job only deploys');
  assert.match(deploy, /needs:\s*(\[\s*)?build/, 'the deploy job waits for the build');
  const deploys = deploy.match(/uses:\s*actions\/deploy-pages@/g) || [];
  assert.equal(deploys.length, 2, 'a first deploy and a retry');
  assert.match(deploy, /id:\s*deployment\n\s+continue-on-error:\s*true/, 'the first deploy may fail without failing the job');
  assert.match(deploy, /if:\s*steps\.deployment\.outcome\s*==\s*'failure'/, 'the retry runs only when the first deploy failed');
});

// ---------- the test job in parts, and the slow tests nightly ----------
import { testFiles, shard, quick, slow, options, MINUTES } from '../scripts/test.mjs';

test('the test job runs in parts side by side on each platform, each part a share of the files, within a limit', () => {
  const job = block(block(read('test.yml'), 'jobs'), 'test', 2);
  assert.ok(job, 'test.yml has a test job');
  const shards = job.match(/^ {8}shard:\s*\[([^\]]*)\]/m);
  assert.ok(shards, 'the test job\'s matrix has a shard dimension (shard: [1, 2, ...]): one job running every file took up to 85 minutes');
  const parts = shards[1].split(',').map((x) => Number(x.trim()));
  assert.ok(parts.length >= 2, `at least two parts: ${shards[1]}`);
  assert.deepEqual(parts, parts.map((_, i) => i + 1), 'the parts are numbered 1 to n');
  const run = job.match(/run:\s*npm test -- --shard \$\{\{\s*matrix\.shard\s*\}\}\/(\d+)/);
  assert.ok(run, 'each job runs its part: npm test -- --shard ${{ matrix.shard }}/n');
  assert.equal(Number(run[1]), parts.length, 'the n in --shard i/n is the number of parts in the matrix, or some files would run in no part');
  assert.match(job, /platform:[\s\S]*ubuntu-latest[\s\S]*macos-latest[\s\S]*windows-latest/, 'every platform still runs every part');
  const limit = Number(job.match(/^ {4}timeout-minutes:\s*(\d+)/m)?.[1]);
  assert.ok(limit > 0 && limit <= 45, `a part's limit is about twice its time, not the whole suite's (${limit} minutes)`);
});

test('a quick job gives a first verdict, and one check stands for every part', () => {
  const jobs = block(read('test.yml'), 'jobs');
  const q = block(jobs, 'quick', 2);
  assert.ok(q, 'test.yml has a quick job');
  assert.match(q, /run:\s*npm test -- --quick/);
  assert.ok(Number(q.match(/^ {4}timeout-minutes:\s*(\d+)/m)?.[1]) <= 15, 'the quick job is held to a quarter of an hour');
  const all = block(jobs, 'tests', 2);
  assert.ok(all, 'test.yml has a tests job that stands for them all');
  assert.match(all, /needs:\s*\[\s*quick,\s*test\s*\]/);
  assert.match(all, /if:\s*\$\{\{\s*!cancelled\(\)\s*\}\}/, 'it runs, and fails, when a part failed (a plain needs would skip it, and a skipped check counts as passed)');
});

test('the slowest tests run nightly, on every platform, and on release pull requests', () => {
  const yml = read('slow-tests.yml'), on = block(yml, 'on');
  assert.ok(on, 'slow-tests.yml has an "on:" block');
  assert.match(block(on, 'schedule', 2) || '', /cron:/, 'a nightly schedule');
  const pr = block(on, 'pull_request', 2) || '';
  assert.match(pr, /packages\/\*\/CHANGELOG\.md/, 'a release pull request (the one kind that writes CHANGELOGs) runs them');
  const job = block(block(yml, 'jobs'), 'slow', 2);
  assert.ok(job, 'slow-tests.yml has a slow job');
  assert.match(job, /run:\s*npm test -- --slow/);
  assert.match(job, /ubuntu-latest[\s\S]*macos-latest[\s\S]*windows-latest/);
});

test('the parts hold every test file once, the slowest spread apart, and the slow tests\' files are found', () => {
  const files = testFiles();
  assert.ok(files.length > 40 && files.includes('packages/flexures/test.mjs') && files.includes('packages/cad/test/fasten.test.mjs') && files.includes('test/workflows.test.mjs'), files.join(' '));
  for (const n of [1, 2, 3, 4]) {
    const parts = Array.from({ length: n }, (_, i) => shard(files, i + 1, n));
    assert.deepEqual(parts.flat().sort(), files, `${n} parts: every file in one of them, none twice`);
  }
  // The three slowest files each go to a part of their own
  const top = Object.entries(MINUTES).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([f]) => f);
  assert.equal(new Set(top.map((f) => [1, 2, 3].find((i) => shard(files, i, 3).includes(f)))).size, 3, `${top.join(', ')} in three parts`);
  // A file the table doesn't name still runs somewhere
  assert.deepEqual([1, 2].flatMap((i) => shard(['b.test.mjs', 'a.test.mjs', 'c.test.mjs'], i, 2, {})).sort(), ['a.test.mjs', 'b.test.mjs', 'c.test.mjs']);
  for (const f of Object.keys(MINUTES)) assert.ok(files.includes(f), `scripts/test.mjs times ${f}, which is not a test file now: take it out of MINUTES`);
  const q = quick(files);
  assert.ok(q.includes('test/workflows.test.mjs') && !q.includes('packages/flexures/test.mjs') && !q.includes('packages/cad/test/frame-sizing.test.mjs'), 'the quick files leave the slow ones out');
  assert.deepEqual(slow(files), ['packages/cad/test/examples.test.mjs', 'packages/create-rulecad/test.mjs'], 'the files that hold tests marked SLOW');
});

test('the test runner reads --shard i/n, --quick and --slow, and passes the rest to node --test', () => {
  assert.deepEqual(options(['--shard', '2/3']), { shard: [2, 3], quick: false, slow: false, rest: [] });
  assert.deepEqual(options(['--shard=1/4', '--test-name-pattern=a yoke']), { shard: [1, 4], quick: false, slow: false, rest: ['--test-name-pattern=a yoke'] });
  assert.equal(options(['--quick']).quick, true);
  assert.equal(options(['--slow']).slow, true);
  assert.throws(() => options(['--shard', '3']), /--shard is a part and how many parts, as 2\/3 \(got "3"\)/);
  assert.throws(() => options(['--shard']), /got nothing/);
  assert.throws(() => options(['--quick', '--slow']), /give one of them/);
  assert.throws(() => shard(['a'], 4, 3), /--shard is a part and how many parts, as 2\/3 \(got 4\/3\)/);
});
