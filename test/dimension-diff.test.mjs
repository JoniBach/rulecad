// The dimension diff (scripts/dimension-diff.mjs): every example object compared between two commits. These tests
// hold how an object is known (so one made from the same files is never rebuilt), what a comparison reports, and how
// its builds are held in memory; only the last builds anything (the template's two smallest objects).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { treeOf, objectsOf, compare, materialise, run, measuresAt, memoryLimit, SHARED } from '../scripts/dimension-diff.mjs';

test('the diff between a commit and itself is empty, and builds nothing', () => {
  const objects = objectsOf(treeOf('HEAD'));
  assert.ok(objects.length > 100, `every example object is found (${objects.length})`);
  for (const ws of ['examples/bench', 'examples/thin-picro', 'packages/create-rulecad/template', 'packages/create-rulecad/machines/arm', 'packages/create-rulecad/machines/leg']) assert.ok(objects.some((o) => o.ws === ws), `${ws}'s objects are in it`);
  const r = compare({ objects, measures: new Map() }, { objects: objectsOf(treeOf('HEAD')), measures: new Map() });
  assert.deepEqual(r.rows, []); assert.equal(r.unchanged, objects.length);
});

test('an object is known by what it is built from: its project, its workspace\'s rules and the kit\'s code, not tests or documents', () => {
  const tree = treeOf('HEAD'), key = (t) => new Map(objectsOf(t).map((o) => [o.id, o.key])), was = key(tree);
  const edit = (f) => { const t = new Map(tree); assert.ok(t.has(f), f); t.set(f, '0'.repeat(40)); return key(t); };
  const moved = (now) => [...was].filter(([id, k]) => now.get(id) !== k).map(([id]) => id);
  const arm = moved(edit('examples/bench/projects/arm/objects/base.json'));
  assert.ok(arm.length > 1 && arm.every((id) => id.startsWith('examples/bench/arm/')), 'a change in a project moves its objects, and only those');
  assert.equal(moved(edit('examples/bench/rules/m3.json')).every((id) => id.startsWith('examples/bench/')), true, 'a workspace\'s rules move its own objects');
  assert.equal(moved(edit('packages/rules/m3.json')).length, was.size, 'the kit\'s rules move every object');
  assert.equal(moved(edit('packages/shapes/shapes.mjs')).length, was.size, 'the kit\'s code moves every object');
  assert.deepEqual(moved(edit('packages/shapes/test.mjs')), [], 'a test moves nothing');
  assert.deepEqual(moved(edit('packages/cad/EXAMPLES.md')), [], 'a document moves nothing');
});

test('a comparison names each hole, volume, size and v.fixings figure that moved, and a build that fails', () => {
  const objects = (k) => [{ id: 'w/p/a', key: `a${k}` }, { id: 'w/p/b', key: `b${k}` }, { id: 'w/p/c', key: `c${k}` }, { id: 'w/p/d', key: 'same' }];
  const m = (hole, volume, size, fixings) => ({ values: { hole, wall: 2 }, parts: { body: { volume, size } }, ...(fixings ? { fixings } : {}) });
  const a = { objects: objects(1), measures: new Map([['w/p/a', m(3.4, 1000, [10, 10, 5])], ['w/p/b', m(2.9, 500, [5, 5, 5], ['fixings.hole: {"diameter":2.9}'])], ['w/p/c', m(3, 1, [1, 1, 1])]]) };
  const b = { objects: objects(2), measures: new Map([['w/p/a', m(3.4, 1000.004, [10, 10, 5])], ['w/p/b', m(3, 512.3, [5, 5, 5.2], ['fixings.hole: {"diameter":3}'])], ['w/p/c', { error: 'no rule "clearence" in m4' }]]) };
  const r = compare(a, b);
  assert.deepEqual(r.rows.map((x) => [x.object, x.what, x.from, x.to]), [
    ['w/p/b', 'hole', '2.9', '3'], ['w/p/b', 'part body volume (mm³)', '500', '512.3'], ['w/p/b', 'part body size (mm)', '5 × 5 × 5', '5 × 5 × 5.2'],
    ['w/p/b', 'v.fixings drew', 'fixings.hole: {"diameter":2.9}', '(no longer)'], ['w/p/b', 'v.fixings drew', '(none)', 'fixings.hole: {"diameter":3}'],
    ['w/p/c', 'the build', 'builds', 'fails: no rule "clearence" in m4'],
  ]);
  assert.equal(r.same, 1, 'a hundredth of a mm³ is the same solid'); assert.equal(r.unchanged, 1);
});

test('the slow results (an optimisation\'s densities, a lamina\'s stages) are one folder for every workspace and commit, kept with the measures', () => {
  const tree = treeOf('HEAD'), slow = fs.mkdtempSync(path.join(os.tmpdir(), 'rulecad-slow-'));
  try {
    const dir = materialise('HEAD', tree, slow), wss = ['examples/bench', 'packages/create-rulecad/template', 'packages/create-rulecad/machines/arm'];
    assert.deepEqual(SHARED, ['densities', 'stages']);
    for (const ws of wss) for (const kind of SHARED) assert.equal(fs.realpathSync(path.join(dir, ws, '.cache', kind)), fs.realpathSync(path.join(slow, kind)), `${ws}'s ${kind}`);
    fs.writeFileSync(path.join(dir, wss[0], '.cache/densities/x.json'), '{}');
    assert.ok(fs.existsSync(path.join(dir, wss[1], '.cache/densities/x.json')), 'what one workspace keeps, another reads');
    // the same commit's copy again, with another folder (a later run's), follows it
    const later = fs.mkdtempSync(path.join(os.tmpdir(), 'rulecad-slow-'));
    try { materialise('HEAD', tree, later); assert.equal(fs.realpathSync(path.join(dir, wss[0], '.cache/stages')), fs.realpathSync(path.join(later, 'stages'))); } finally { fs.rmSync(later, { recursive: true, force: true }); }
  } finally { fs.rmSync(slow, { recursive: true, force: true }); }
});

test('a worker past its memory budget hands the rest of its list to a fresh one, and every object is still measured', async () => {
  const tree = treeOf('HEAD'), slow = fs.mkdtempSync(path.join(os.tmpdir(), 'rulecad-slow-')), was = process.env.DIMENSION_DIFF_RSS_MB;
  try {
    const dir = materialise('HEAD', tree, slow);
    process.env.DIMENSION_DIFF_RSS_MB = '1'; // (every worker is past 1 MB after a build: one worker an object)
    const small = await run(dir, 'packages/create-rulecad/template', ['home/box', 'home/lid']);
    assert.equal(small.workers, 2); assert.deepEqual([...small.keys()].sort(), ['home/box', 'home/lid']);
    for (const [n, r] of small) assert.ok(r.parts && !r.error, `${n}: ${JSON.stringify(r)}`);
    process.env.DIMENSION_DIFF_RSS_MB = '100000'; // (none is: one worker for the list)
    assert.equal((await run(dir, 'packages/create-rulecad/template', ['home/box', 'home/lid'])).workers, 1);
  } finally { if (was == null) delete process.env.DIMENSION_DIFF_RSS_MB; else process.env.DIMENSION_DIFF_RSS_MB = was; fs.rmSync(slow, { recursive: true, force: true }); }
});

test('a build past the memory limit is stopped mid-build, reported not measured, and the rest of the list goes on; a later run at the same limit skips it', async () => {
  const tree = treeOf('HEAD'), slow = fs.mkdtempSync(path.join(os.tmpdir(), 'rulecad-slow-')), cache = fs.mkdtempSync(path.join(os.tmpdir(), 'rulecad-dd-')), was = process.env.DIMENSION_DIFF_LIMIT_MB;
  try {
    // the default: half the machine's memory, shared by the jobs (16 GB and --jobs 1: 8192 MB; --jobs 4: 2048 MB)
    delete process.env.DIMENSION_DIFF_LIMIT_MB;
    assert.equal(memoryLimit(1), Math.floor(os.totalmem() / 1048576 / 2)); assert.equal(memoryLimit(4), Math.floor(os.totalmem() / 1048576 / 8));
    // 1 MB is below a bare Node process (about 40 MB), so each worker is stopped before its first build is done
    const dir = materialise('HEAD', tree, slow), stopped = await run(dir, 'packages/create-rulecad/template', ['home/box', 'home/lid'], () => {}, 1);
    assert.equal(stopped.workers, 2, 'a fresh worker for the rest of the list'); assert.deepEqual([...stopped.keys()].sort(), ['home/box', 'home/lid']);
    for (const [n, r] of stopped) { assert.equal(r.memory, 1, n); assert.match(r.error, /^not measured: its build passed 1 MB \(it held \d+ MB when stopped; DIMENSION_DIFF_LIMIT_MB\)$/); }
    // through measuresAt: kept, so the same limit reads it back and builds nothing; a higher limit builds it again
    process.env.DIMENSION_DIFF_LIMIT_MB = '1';
    const only = 'create-rulecad/template/home/box', first = await measuresAt('HEAD', { only, jobs: 1, cache });
    assert.equal(first.built, 1); assert.equal([...first.measures.values()][0].memory, 1);
    assert.equal((await measuresAt('HEAD', { only, jobs: 1, cache })).built, 0, 'stopped at this limit before: skipped');
    process.env.DIMENSION_DIFF_LIMIT_MB = '100000';
    const more = await measuresAt('HEAD', { only, jobs: 1, cache }), r = [...more.measures.values()][0];
    assert.equal(more.built, 1); assert.ok(r.parts && !r.error, JSON.stringify(r));
  } finally { if (was == null) delete process.env.DIMENSION_DIFF_LIMIT_MB; else process.env.DIMENSION_DIFF_LIMIT_MB = was; fs.rmSync(slow, { recursive: true, force: true }); fs.rmSync(cache, { recursive: true, force: true }); }
});
