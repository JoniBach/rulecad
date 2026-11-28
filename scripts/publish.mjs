#!/usr/bin/env node
// Publishes every package whose package.json version isn't on npm yet; the rest are left alone. Run by
// .github/workflows/publish.yml once the tests have passed on every platform: npm trusts that workflow (trusted
// publishing, OIDC), so there are no tokens, and each release gets provenance (a link to the commit and the run that
// built it). Packages go out after the ones they depend on; a package new to npm is held back, with what depends on
// it, and the run is marked failed with the commands for its first publish (scripts/publish-plan.mjs).
//   node scripts/publish.mjs [--dry-run]
// Then, in a job of its own that may write to the repository but cannot publish, each new version gets a GitHub
// Release, tagged <name>@<version> at the commit that was tested (RELEASE_SHA), its notes the commits that changed
// that package since its last release. RELEASES lists the versions the plan said were due; each one that is on npm
// and has no release yet gets one, so running it again after a stopped run makes only what is missing.
//   RELEASE_SHA=<commit> RELEASES='<name>@<version> ...' node scripts/publish.mjs --releases-only
import { execFileSync } from 'node:child_process';
import { plan, readPackages, registry } from './publish-plan.mjs';

if (process.argv.includes('--releases-only')) releases();
else publishAll(process.argv.includes('--dry-run'));

function publishAll(dry) {
  execFileSync(process.execPath, ['scripts/types.mjs'], { stdio: 'inherit' }); // declarations for editors, from the JSDoc
  const packages = readPackages();
  const { publish, new: brandNew, held } = plan(packages, registry);
  for (const p of packages) if (!publish.includes(p) && !brandNew.includes(p) && !held.includes(p)) console.log(`  ${p.name}@${p.version} is on npm`);
  // GitHub Actions can't publish a package npm has never seen (trusted publishing needs it to exist): those, and what
  // depends on them, wait for a first publish by hand; everything else goes out now
  const firstPublish = brandNew.length && process.env.GITHUB_ACTIONS ? `\n${brandNew.map((p) => p.name).join(', ')} ${brandNew.length > 1 ? 'are' : 'is'} new to npm, and this workflow can only publish packages that already exist there${held.length ? `; held back with ${brandNew.length > 1 ? 'them' : 'it'}: ${held.map((p) => p.name).join(', ')}` : ''}.
Publish ${brandNew.length > 1 ? 'them' : 'it'} once from a terminal, which also trusts this workflow for ${brandNew.length > 1 ? 'them' : 'it'} (npm asks you to approve each step in the browser), then run the workflow again:
  scripts/first-publish.sh ${brandNew.map((p) => p.dir).join(' ')}
  gh workflow run publish.yml` : null;
  let published = 0;
  for (const { dir, name, version } of publish) {
    console.log(`+ ${name}@${version}${dry ? ' (dry run)' : ''}`);
    execFileSync('npm', ['publish', '--workspace', `packages/${dir}`, '--access', 'public', ...(dry ? ['--dry-run'] : [])], { stdio: 'inherit' });
    published++;
  }
  console.log(published ? `published ${published}` : 'nothing new to publish');
  if (firstPublish) { console.error(firstPublish); process.exitCode = 1; } // (said at the end, and the run marked failed, so it isn't missed)
}

// A GitHub Release for each published version that has none yet: what changed in this package since its last release,
// in its commits' words
function releases() {
  const sha = process.env.RELEASE_SHA;
  // Not GITHUB_SHA: in a run started by the test workflow that is main's latest commit, which may not be the one tested
  if (!sha || !/^[0-9a-f]{40}$/.test(sha)) throw new Error('RELEASE_SHA must be the full commit the tests passed on (the plan job\'s sha): the releases are tagged there');
  const wanted = (process.env.RELEASES || '').split(/\s+/).filter(Boolean);
  if (!wanted.length) { console.log('no releases to make'); return; }
  const dirs = new Map(readPackages().map((p) => [`${p.name}@${p.version}`, p.dir]));
  const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
  const hasRelease = (tag) => { try { execFileSync('gh', ['release', 'view', tag], { stdio: 'ignore' }); return true; } catch { return false; } };
  // npm can take a little while to show a version just published: ask again before deciding it didn't go out
  const published = (name, version) => {
    for (let i = 0; i < 4; i++) {
      if (registry.onNpm(name, version)) return true;
      if (i < 3) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 15000); // fifteen seconds
    }
    return false;
  };
  let made = 0;
  const missing = [];
  for (const tag of wanted) {
    const at = tag.lastIndexOf('@'), name = tag.slice(0, at), version = tag.slice(at + 1), dir = dirs.get(tag);
    if (!dir) throw new Error(`${tag} isn't a package version at ${sha}`);
    if (hasRelease(tag)) { console.log(`  ${tag} has a release already`); continue; }
    if (!published(name, version)) { missing.push(tag); continue; }
    const previous = git('tag', '--list', `${name}@*`, '--sort=-v:refname').split('\n').filter((t) => t && t !== tag)[0];
    const commits = git('log', '--format=- %s (%h)', ...(previous ? [`${previous}..${sha}`] : ['-n', '20', sha]), '--', `packages/${dir}`);
    const notes = `${commits || '- Packaging only'}\n\n[${name} on npm](https://www.npmjs.com/package/${name}/v/${version})${previous ? `, changes since ${previous}` : ''}\n`;
    execFileSync('gh', ['release', 'create', tag, '--target', sha, '--title', tag, '--notes', notes], { stdio: 'inherit' });
    made++;
  }
  console.log(made ? `made ${made} release${made > 1 ? 's' : ''}` : 'no new releases');
  if (missing.length) {
    console.error(`not on npm, so no release made: ${missing.join(', ')}. If the publish job stopped part way, run the workflow again (CONTRIBUTING.md, Releasing).`);
    process.exitCode = 1;
  }
}
