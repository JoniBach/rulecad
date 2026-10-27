#!/usr/bin/env node
// Type declarations for editors (autocomplete, hover docs), made from the packages' JSDoc: <name>.d.mts beside each
// module. The code stays plain JavaScript; these are generated before publishing and never committed.
//   node scripts/types.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const TYPED = ['variables', 'fea', 'topopt', 'keyboard-layout', 'printcheck', 'fit', 'model-link', 'versions', 'shapes'];
for (const dir of TYPED) {
  const { exports: main } = JSON.parse(fs.readFileSync(`packages/${dir}/package.json`, 'utf8'));
  const file = path.join('packages', dir, (main.default || main).replace(/^\.\//, ''));
  execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', file, '--allowJs', '--declaration', '--emitDeclarationOnly',
    '--skipLibCheck', '--types', 'node', '--target', 'es2022', '--module', 'nodenext', '--outDir', path.dirname(file)], { stdio: 'inherit' });
  console.log(`  ${file.replace(/\.mjs$/, '.d.mts')}`);
}
