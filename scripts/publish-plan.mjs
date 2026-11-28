// What a release publishes, decided before anything goes out: every package whose version isn't on npm yet, ordered
// so each goes after the @rulecad packages it depends on (a package is never on npm before what it needs). A package
// that has never been published at all can't be published by GitHub Actions: npm's trusted publishing only trusts a
// workflow for a package that already exists. Those are listed as new, and held back with everything that depends on
// them (it would land on npm needing a version that isn't there); every other package goes out as usual, so one new
// package no longer stops every release.
//   node scripts/publish-plan.mjs     what is due, said here and (in GitHub Actions) as the plan job's outputs
// The release workflow's first job runs this with read-only rights and nothing installed, so a run with nothing due
// stops there; scripts/publish.mjs, in the job that may publish, makes the same plan again just before publishing.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const npmView = (...args) => {
  try { execFileSync('npm', ['view', ...args], { stdio: ['ignore', 'pipe', 'ignore'] }); return true; } catch { return false; }
};
/** The registry, asked with `npm view`: is this version published, and is the package there at all. */
export const registry = {
  /** @type {(name: string, version: string) => boolean} */
  onNpm: (name, version) => npmView(`${name}@${version}`, 'version'),
  /** @type {(name: string) => boolean} */
  exists: (name) => npmView(name, 'name'),
};

/**
 * Every package under packages/ that is published (not private), by folder name.
 * @param {string} [root] the repository
 * @returns {{ dir: string, name: string, version: string, dependencies?: Record<string, string> }[]}
 */
export function readPackages(root = '.') {
  return fs.readdirSync(path.join(root, 'packages')).sort()
    .filter((dir) => fs.existsSync(path.join(root, 'packages', dir, 'package.json')))
    .map((dir) => ({ dir, ...JSON.parse(fs.readFileSync(path.join(root, 'packages', dir, 'package.json'), 'utf8')) }))
    .filter((p) => !p.private);
}

/**
 * What the jobs after the plan need: due ("true" when anything is to publish, or a package new to npm is waiting, which
 * the publish job reports), and versions, the name@version of each package to publish, space-separated (the releases).
 * @param {{ publish: { name: string, version: string }[], new: unknown[] }} result plan()'s answer
 * @returns {{ due: 'true' | 'false', versions: string }}
 */
export function outputs(result) {
  return { due: result.publish.length || result.new.length ? 'true' : 'false', versions: result.publish.map((p) => `${p.name}@${p.version}`).join(' ') };
}
/**
 * @param {{ dir: string, name: string, version: string, dependencies?: Record<string, string> }[]} packages
 * @param {{ onNpm: (name: string, version: string) => boolean, exists: (name: string) => boolean }} npm
 * @returns {{ publish: typeof packages, new: typeof packages, held: typeof packages }} publish: what goes out now; new: never
 *   on npm (a first publish by hand); held: waiting on a new one
 */
export function plan(packages, { onNpm, exists }) {
  const due = packages.filter((p) => !onNpm(p.name, p.version));
  const byName = new Map(due.map((p) => [p.name, p])), done = new Set(), ordered = [];
  const visit = (p, path = []) => {
    if (done.has(p.name)) return;
    if (path.includes(p.name)) throw new Error(`packages depend on each other in a loop: ${[...path, p.name].join(' → ')}`);
    for (const d of Object.keys(p.dependencies || {})) if (byName.has(d)) visit(byName.get(d), [...path, p.name]);
    done.add(p.name); ordered.push(p);
  };
  for (const p of [...due].sort((a, b) => a.dir.localeCompare(b.dir))) visit(p);
  const brandNew = ordered.filter((p) => !exists(p.name)), held = new Set(brandNew.map((p) => p.name));
  // held: the new ones, and (in order, so a chain is caught) whatever due depends on something held
  for (const p of ordered) if (Object.keys(p.dependencies || {}).some((d) => held.has(d))) held.add(p.name);
  return { publish: ordered.filter((p) => !held.has(p.name)), new: brandNew, held: ordered.filter((p) => held.has(p.name) && !brandNew.includes(p)) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = plan(readPackages(), registry);
  for (const p of result.publish) console.log(`+ ${p.name}@${p.version} is due`);
  for (const p of result.new) console.log(`! ${p.name}@${p.version} is new to npm: the publish job says how to publish it the first time`);
  for (const p of result.held) console.log(`  ${p.name}@${p.version} waits for a package new to npm`);
  const out = outputs(result);
  console.log(out.due === 'true' ? 'due: the publish job runs next' : 'nothing new to publish: every version is on npm already');
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `due=${out.due}\nversions=${out.versions}\n`);
}
