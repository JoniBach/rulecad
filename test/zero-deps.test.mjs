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
  // Every module the package ships, not only its main entry. The exception is a Node-only extra offered under its
  // own path (fea's ./threads): the main entry must not import it.
  const extras = typeof pj.exports === 'object' && pj.exports['.'] ? Object.entries(pj.exports).filter(([k]) => k !== '.').map(([, v]) => path.normalize(v.default || v)) : [];
  const modules = pj.files.filter((f) => f.endsWith('.mjs') && !extras.includes(path.normalize(f)));
  assert.ok(modules.length, `${p} ships no module`);
  for (const f of modules) {
    const src = fs.readFileSync(path.join(root, 'packages', p, f), 'utf8');
    for (const [, from] of src.matchAll(/^\s*(?:import|export)\b[^'\n]*\bfrom\s+'([^']+)'/gm)) {
      if (from.startsWith('./')) assert.ok(modules.includes(from.slice(2)), `${p}/${f} imports ${from}, which the package doesn't ship (or is its Node-only extra)`);
      else assert.ok(Object.keys({ ...pj.dependencies, ...pj.peerDependencies }).some((d) => from === d || from.startsWith(`${d}/`)), `${p}/${f} imports ${from} without depending on it`); // (a file of one, such as @rulecad/rules/nema17.json)
    }
    // (a peer may be loaded when it's asked for, as Manifold is: any other import() could reach for anything; a type's
    // import('./x.mjs') in a comment loads nothing)
    for (const [, from] of src.replace(/^\s*(\*|\/\/).*$/gm, '').matchAll(/\bimport\(\s*([^)]*)\)/g)) assert.ok(PEERS.some((peer) => from === `'${peer}'`) && pj.peerDependencies?.[from.slice(1, -1)], `${p}/${f} loads ${from} as it runs`);
    // node: as a module name, not a property; asking whether there is a process at all (globalThis.process?.) is safe anywhere
    assert.ok(!/\brequire\(|\bprocess\.|['"`]node:/.test(src.replaceAll('globalThis.process?.', '')), `${p}/${f} reaches for Node`);
  }
});
