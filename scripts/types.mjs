#!/usr/bin/env node
// Type declarations for editors (autocomplete, hover docs), made from the packages' JSDoc: <name>.d.mts beside each
// module. The code stays plain JavaScript; these are generated before publishing and never committed.
//   node scripts/types.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const TYPED = ['variables', 'fea', 'topopt', 'keyboard-layout', 'printcheck', 'fit', 'model-link', 'versions', 'shapes', 'flexures', 'smooth', 'gears', 'motors', 'robots', 'fixings', 'frames'];
for (const dir of TYPED) {
  // every module the package ships (its main entry, what that imports, and extras under their own paths such as fea's ./threads)
  const { files } = JSON.parse(fs.readFileSync(`packages/${dir}/package.json`, 'utf8'));
  const modules = files.filter((f) => f.endsWith('.mjs')).map((f) => path.join('packages', dir, f)), folder = path.join('packages', dir);
  for (const stale of fs.readdirSync(folder)) if (stale.endsWith('.d.mts')) fs.rmSync(path.join(folder, stale)); // a stale declaration beside a module it imports would be read as input
  execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', ...modules, '--allowJs', '--declaration', '--emitDeclarationOnly',
    '--skipLibCheck', '--types', 'node', '--target', 'es2022', '--module', 'nodenext', '--outDir', folder], { stdio: 'inherit' });
  for (const m of modules) {
    const made = m.replace(/\.mjs$/, '.d.mts');
    if (!fs.existsSync(made)) throw new Error(`${made} wasn't made`);
    if (!files.includes(path.basename(made))) throw new Error(`${made} isn't in ${folder}/package.json's files, so it wouldn't be published`);
    console.log(`  ${made}`);
  }
}
