#!/usr/bin/env node
// Runs the repository's tests with node:test, all of them or a part. `npm test` runs this with no options: every test
// file, as before. CI (.github/workflows/test.yml) runs it in parts, so that no one job waits on the whole suite:
//   node scripts/test.mjs                  every test file: packages/*/test.mjs, packages/*/test/*.test.mjs, test/*.test.mjs
//   node scripts/test.mjs --shard 2/3      the second of three parts; the three parts together hold every file once
//   node scripts/test.mjs --quick          only the files that take under a minute (the quick verdict on a pull request)
//   node scripts/test.mjs --slow           only the files that hold the slowest tests, and those tests run too
//                                          (RULECAD_SLOW_TESTS=1): what the nightly run does
// Anything else on the line goes to node --test, ahead of the files: `npm test -- --test-name-pattern="a yoke"`.
//
// node's own --test-shard splits the files by their place in the list, so two of the slowest could land in one part,
// and a part takes as long as the files in it. This script shares the files out by how long each took on CI instead
// (MINUTES below): the slowest first, each to the part with the least so far. A file not in the table counts as
// quick. The table only steers how the files are shared out: a time that has gone stale makes the parts less even,
// never leaves a file out. Refresh it from a CI run's log when one part runs much longer than the others.
// The slowest tests themselves are marked in their files with an option named SLOW, which skips them unless
// RULECAD_SLOW_TESTS is set (packages/cad/test/helpers.mjs); --slow finds the files that use it.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Minutes each slow file took on a Linux runner, with the other files of its run beside it (ubuntu, Node 24, run
 * 46169863330, 2026-11-28; the tests marked SLOW left out, and flexures' catapult in a file of its own). Files of a
 * minute or more: the rest count as quick.
 */
export const MINUTES = {
  'packages/flexures/test/lamina-catapult.test.mjs': 12.8,
  'packages/cad/test/frame-sizing.test.mjs': 11.5,
  'packages/cad/test/build.test.mjs': 5.6,
  'packages/cad/test/machine.test.mjs': 5.6,
  'packages/cad/test/frame.test.mjs': 5.5,
  'packages/flexures/test.mjs': 4.3,
  'packages/topopt/test.mjs': 3.9,
  'packages/cad/test/frame-checks.test.mjs': 3.7,
  'packages/cad/test/fittings.test.mjs': 3.3,
  'packages/cad/test/optimise.test.mjs': 3.1,
  'packages/cad/test/fasten.test.mjs': 3.1,
  'packages/cad/test/guides.test.mjs': 3,
  'packages/frames/test.mjs': 2.2,
  'packages/cad/test/gears.test.mjs': 2,
  'packages/cad/test/measure.test.mjs': 1.5,
  'packages/cad/test/printed-beams.test.mjs': 1.4,
  'packages/cad/test/edit.test.mjs': 1.2,
  'packages/pcb/test.mjs': 1,
  'packages/fea/test.mjs': 1,
};
const QUICK = 0.5; // the minutes a file not in the table counts for

/** Every test file, as paths from the repository's root with forward slashes, sorted. @param {string} [root] @returns {string[]} */
export function testFiles(root = ROOT) {
  const out = [];
  const list = (dir, keep) => {
    const abs = path.join(root, dir);
    if (!fs.existsSync(abs)) return [];
    return fs.readdirSync(abs, { withFileTypes: true }).filter(keep).map((d) => `${dir}/${d.name}`);
  };
  for (const pkg of list('packages', (d) => d.isDirectory())) {
    if (fs.existsSync(path.join(root, pkg, 'test.mjs'))) out.push(`${pkg}/test.mjs`);
    out.push(...list(`${pkg}/test`, (d) => d.isFile() && d.name.endsWith('.test.mjs')));
  }
  out.push(...list('test', (d) => d.isFile() && d.name.endsWith('.test.mjs')));
  return out.sort();
}

/**
 * The files of part `index` (1 to `total`): the slowest first, each to the part with the fewest minutes so far (the
 * first such part on a tie), so every file is in exactly one part and the parts take about as long as each other.
 * @param {string[]} files @param {number} index @param {number} total @param {Record<string, number>} [minutes]
 * @returns {string[]}
 */
export function shard(files, index, total, minutes = MINUTES) {
  if (!Number.isInteger(total) || total < 1 || !Number.isInteger(index) || index < 1 || index > total) throw new Error(`--shard is a part and how many parts, as 2/3 (got ${index}/${total})`);
  const cost = (f) => minutes[f] ?? QUICK;
  const order = [...files].sort((a, b) => cost(b) - cost(a) || (a < b ? -1 : a > b ? 1 : 0));
  const load = new Array(total).fill(0), parts = Array.from({ length: total }, () => /** @type {string[]} */ ([]));
  for (const f of order) {
    const i = load.indexOf(Math.min(...load));
    parts[i].push(f);
    load[i] += cost(f);
  }
  return parts[index - 1].sort();
}

/** The files that take under a minute: those not in MINUTES. @param {string[]} files @param {Record<string, number>} [minutes] */
export const quick = (files, minutes = MINUTES) => files.filter((f) => !(f in minutes));

/** The files that hold a test marked SLOW: `test('...', SLOW, ...)`. @param {string[]} files @param {string} [root] */
export const slow = (files, root = ROOT) => files.filter((f) => /\btest\((['"`]).*?\1,\s*SLOW\s*,/.test(fs.readFileSync(path.join(root, f), 'utf8')));

/** What a command line asks for: `{ shard: [i, n] | null, quick, slow, rest }`. @param {string[]} argv */
export function options(argv) {
  const o = { shard: /** @type {[number, number] | null} */ (null), quick: false, slow: false, rest: /** @type {string[]} */ ([]) };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--quick') o.quick = true;
    else if (a === '--slow') o.slow = true;
    else if (a === '--shard' || a.startsWith('--shard=')) {
      const v = a === '--shard' ? argv[++i] : a.slice('--shard='.length), m = /^(\d+)\/(\d+)$/.exec(v || '');
      if (!m) throw new Error(`--shard is a part and how many parts, as 2/3 (got ${v === undefined ? 'nothing' : JSON.stringify(v)})`);
      o.shard = [Number(m[1]), Number(m[2])];
    } else o.rest.push(a);
  }
  if ([o.quick, o.slow, !!o.shard].filter(Boolean).length > 1) throw new Error('--shard, --quick and --slow each choose the files: give one of them');
  return o;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  let o;
  try { o = options(process.argv.slice(2)); } catch (e) { console.error(/** @type {Error} */ (e).message); process.exit(2); }
  const all = testFiles();
  const files = o.shard ? shard(all, ...o.shard) : o.quick ? quick(all) : o.slow ? slow(all) : all;
  // (node --test given no files looks for tests everywhere, node_modules' own among them)
  if (!files.length) { console.log('no test files in this part'); process.exit(0); }
  const env = o.slow ? { ...process.env, RULECAD_SLOW_TESTS: '1' } : process.env;
  console.log(`${files.length} of ${all.length} test files${o.shard ? `, part ${o.shard[0]} of ${o.shard[1]}` : o.quick ? ', the quick ones' : o.slow ? ', those with the slowest tests' : ''}`);
  const r = spawnSync(process.execPath, ['--test', ...o.rest, ...files], { cwd: ROOT, stdio: 'inherit', env });
  process.exit(r.status ?? 1);
}
