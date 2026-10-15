#!/usr/bin/env node
// Publishes every package whose package.json version isn't on npm yet; the rest are left alone. Run by
// .github/workflows/publish.yml after the tests pass: npm trusts that workflow (trusted publishing, OIDC), so there
// are no tokens, and each release gets provenance (a link to the commit and the run that built it). In GitHub
// Actions each new version also gets a GitHub Release, tagged <name>@<version>, its notes the commits that changed
// that package since its last release.
//   node scripts/publish.mjs [--dry-run]
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const dry = process.argv.includes('--dry-run');
const onNpm = (name, version) => {
  try { execFileSync('npm', ['view', `${name}@${version}`, 'version'], { stdio: ['ignore', 'pipe', 'ignore'] }); return true; } catch { return false; }
};
execFileSync(process.execPath, ['scripts/types.mjs'], { stdio: 'inherit' }); // declarations for editors, from the JSDoc
let published = 0;
for (const dir of fs.readdirSync('packages').sort()) {
  const { name, version, private: hidden } = JSON.parse(fs.readFileSync(`packages/${dir}/package.json`, 'utf8'));
  if (hidden) continue;
  if (onNpm(name, version)) { console.log(`  ${name}@${version} is on npm`); continue; }
  console.log(`+ ${name}@${version}${dry ? ' (dry run)' : ''}`);
  execFileSync('npm', ['publish', '--workspace', `packages/${dir}`, '--access', 'public', ...(dry ? ['--dry-run'] : [])], { stdio: 'inherit' });
  if (!dry && process.env.GITHUB_ACTIONS) release(dir, name, version);
  published++;
}
console.log(published ? `published ${published}` : 'nothing new to publish');

// A GitHub Release for a published version: what changed in this package since its last release, in its commits' words
function release(dir, name, version) {
  const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
  const tag = `${name}@${version}`;
  const previous = git('tag', '--list', `${name}@*`, '--sort=-v:refname').split('\n').filter((t) => t && t !== tag)[0];
  const commits = git('log', '--format=- %s (%h)', ...(previous ? [`${previous}..HEAD`] : ['-n', '20']), '--', `packages/${dir}`);
  const notes = `${commits || '- Packaging only'}\n\n[${name} on npm](https://www.npmjs.com/package/${name}/v/${version})${previous ? `, changes since ${previous}` : ''}\n`;
  execFileSync('gh', ['release', 'create', tag, '--target', process.env.GITHUB_SHA, '--title', tag, '--notes', notes], { stdio: 'inherit' });
}
