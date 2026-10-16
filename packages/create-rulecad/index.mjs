#!/usr/bin/env node
// npm create rulecad [folder]: a new rulecad workspace with a design to start from (a soap tray), then npm install.
//   --no-install   make the files only
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
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
if (install) execSync('npm install', { cwd: dir, stdio: 'inherit' });
console.log(`\n  cd ${path.relative(process.cwd(), dir)}\n  npx cad check home/soap-tray\n  npx cad preview home/soap-tray\n\nREADME.md says what's where.`);
