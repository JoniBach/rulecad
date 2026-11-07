// What a release publishes, decided before anything goes out: every package whose version isn't on npm yet, ordered
// so each goes after the @rulecad packages it depends on (a package is never on npm before what it needs). A package
// that has never been published at all can't be published by GitHub Actions: npm's trusted publishing only trusts a
// workflow for a package that already exists. Those are listed as new, and held back with everything that depends on
// them (it would land on npm needing a version that isn't there); every other package goes out as usual, so one new
// package no longer stops every release.
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
