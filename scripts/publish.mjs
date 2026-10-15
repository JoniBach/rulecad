#!/usr/bin/env node
// Publishes every package whose package.json version isn't on npm yet; the rest are left alone. Run by
// .github/workflows/publish.yml after the tests pass: npm trusts that workflow (trusted publishing, OIDC), so there
// are no tokens, and each release gets provenance (a link to the commit and the run that built it).
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
  published++;
}
console.log(published ? `published ${published}` : 'nothing new to publish');
