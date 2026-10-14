// Every package runs anywhere with nothing else installed: no dependencies but each other, no Node built-ins.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const packages = fs.readdirSync(path.join(root, 'packages'));

for (const p of packages) test(`@rulecad/${p} needs nothing but other @rulecad packages`, () => {
  const pj = JSON.parse(fs.readFileSync(path.join(root, 'packages', p, 'package.json'), 'utf8'));
  for (const d of Object.keys({ ...pj.dependencies, ...pj.peerDependencies })) assert.match(d, /^@rulecad\//, `${p} depends on ${d}`);
  const src = fs.readFileSync(path.join(root, 'packages', p, pj.exports), 'utf8');
  for (const [, from] of src.matchAll(/^\s*import\b.*from\s+'([^']+)'/gm)) {
    assert.match(from, /^@rulecad\//, `${p} imports ${from}`);
    assert.ok(Object.keys(pj.dependencies || {}).includes(from), `${p} imports ${from} without depending on it`);
  }
  assert.doesNotMatch(src, /\bimport\(|\brequire\(|process\.|node:/, `${p} reaches for Node`);
});
