#!/usr/bin/env node
// npm create rulecad [folder]: a new rulecad workspace with a design to start from (a soap tray), then npm install.
//   --no-install   make the files only
//   --share gist   short model links: each model you share is stored in a secret GitHub Gist (needs gh, signed in)
//   --share long   links that carry the whole model (nothing is uploaded; too long for chat on bigger models)
// Without --share it asks, in a terminal; elsewhere it keeps links long, since nothing is uploaded without a choice.
import fs from 'node:fs';
import path from 'node:path';
import { execSync, execFileSync } from 'node:child_process';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2), install = !args.includes('--no-install');
const dir = path.resolve(args.find((a) => !a.startsWith('--')) || 'my-designs'), name = path.basename(dir);
if (fs.existsSync(dir) && fs.readdirSync(dir).length) { console.error(`${dir} isn't empty: name a new folder (npm create rulecad my-designs)`); process.exit(1); }

const TEMPLATE = fileURLToPath(new URL('./template/', import.meta.url));
fs.cpSync(TEMPLATE, dir, { recursive: true });
fs.renameSync(path.join(dir, 'gitignore'), path.join(dir, '.gitignore')); // npm drops files named .gitignore from packages
const readme = path.join(dir, 'README.md');
fs.writeFileSync(readme, fs.readFileSync(readme, 'utf8').replaceAll('NAME', name));
// $RULECAD_LOCAL: a rulecad checkout to use instead of npm (to try unpublished changes)
const from = (pkg) => (process.env.RULECAD_LOCAL ? `file:${path.join(path.resolve(process.env.RULECAD_LOCAL), 'packages', pkg)}` : '^0.2.0');
fs.writeFileSync(path.join(dir, 'package.json'), `${JSON.stringify({
  name, private: true, type: 'module',
  scripts: { check: 'cad check home/soap-tray' },
  dependencies: { '@rulecad/cad': from('cad'), '@jscad/modeling': '^2.12.0' },
}, null, 2)}\n`);

console.log(`made ${path.relative(process.cwd(), dir) || '.'}: a soap tray to start from, in projects/home`);

// How models are shared: short links need somewhere to keep the model (a secret Gist); long links carry it
let share = args.includes('--share') ? args[args.indexOf('--share') + 1] : null;
if (share && !['gist', 'long'].includes(share)) { console.error(`--share is gist or long (got "${share}")`); process.exit(1); }
if (!share && process.stdin.isTTY && process.stdout.isTTY) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const a = await rl.question('\nModel links: short ones are easy to paste into chat, but each model you share is stored in a secret\nGitHub Gist (needs the gh command, signed in). Long ones carry the model and upload nothing. Short links? [y/N] ');
  rl.close();
  share = /^y/i.test(a.trim()) ? 'gist' : 'long';
}
if (share === 'gist') {
  const cfg = path.join(dir, 'cad.config.json'), c = JSON.parse(fs.readFileSync(cfg, 'utf8'));
  c.targets = { ...c.targets, shorten: 'gist' };
  fs.writeFileSync(cfg, `${JSON.stringify(c, null, 2)}\n`);
  let ready = true;
  try { execFileSync('gh', ['auth', 'status'], { stdio: 'ignore' }); } catch { ready = false; }
  console.log(ready ? 'short links: models you share go into secret Gists (unlisted: only people with the link find them)'
    : 'short links are on, but the gh command isn\'t installed or signed in: install it from cli.github.com and run gh auth login');
} else console.log(`model links carry the whole model${share ? '' : ' (no --share given)'}; for short ones later, add "shorten": "gist" to "targets" in cad.config.json`);
if (install) execSync('npm install', { cwd: dir, stdio: 'inherit' });
console.log(`\n  cd ${path.relative(process.cwd(), dir)}\n  npx cad check home/soap-tray\n  npx cad preview home/soap-tray\n\nREADME.md says what's where.`);
