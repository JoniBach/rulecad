// The package's files are patterns (*.mjs, *.d.mts, less its tests), so a pull request that adds a module doesn't edit
// the list, and two never conflict there. What npm packs is still every module with its declarations, and no test
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('flexures packs every module, takes its declarations by pattern, and packs none of its tests', () => {
  const dir = fileURLToPath(new URL('..', import.meta.url));
  const packed = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: dir, encoding: 'utf8', shell: process.platform === 'win32' }))[0].files.map((f) => f.path.replace(/\\/g, '/'));
  const modules = fs.readdirSync(dir).filter((f) => f.endsWith('.mjs') && f !== 'test.mjs' && !f.startsWith('.'));
  for (const m of modules) assert.ok(packed.includes(m), `${m} is packed`);
  // (the declarations are made at publishing, scripts/types.mjs, beside each module: the pattern takes them all)
  assert.ok(JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).files.includes('*.d.mts'));
  assert.deepEqual(packed.filter((f) => /(^|\/)test(\.mjs|\/)|\.test\.mjs$/.test(f)), [], 'no test is packed');
  assert.ok(packed.includes('README.md') && packed.includes('package.json'));
});
