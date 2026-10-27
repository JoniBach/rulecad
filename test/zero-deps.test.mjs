// Every package runs anywhere with nothing else installed: no dependencies but each other, no Node built-ins. The one
// allowed exception is a CAD kernel the user already has, as a peer dependency (JSCAD for @rulecad/shapes; Manifold,
// an optional peer it loads only when asked for).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PEERS = ['@jscad/modeling', 'manifold-3d'];
const root = fileURLToPath(new URL('..', import.meta.url));
// The tool (cad), the board engine (pcb), the data (rules) and the site (viewer) are what the small packages are for:
// they may depend on more.
const TOOLS = ['cad', 'pcb', 'rules', 'viewer', 'create-rulecad'];
const packages = fs.readdirSync(path.join(root, 'packages')).filter((p) => !TOOLS.includes(p));

for (const p of packages) test(`@rulecad/${p} needs nothing but other @rulecad packages`, () => {
  const pj = JSON.parse(fs.readFileSync(path.join(root, 'packages', p, 'package.json'), 'utf8'));
  for (const d of Object.keys(pj.dependencies || {})) assert.match(d, /^@rulecad\//, `${p} depends on ${d}`);
  for (const d of Object.keys(pj.peerDependencies || {})) assert.ok(PEERS.includes(d), `${p} needs ${d}`);
  const src = fs.readFileSync(path.join(root, 'packages', p, pj.exports.default || pj.exports), 'utf8');
  for (const [, from] of src.matchAll(/^\s*import\b.*from\s+'([^']+)'/gm)) {
    assert.ok(Object.keys({ ...pj.dependencies, ...pj.peerDependencies }).includes(from), `${p} imports ${from} without depending on it`);
  }
  assert.doesNotMatch(src, /\bimport\(|\brequire\(|process\.|['"`]node:/, `${p} reaches for Node`); // node: as a module name, not a property
});
