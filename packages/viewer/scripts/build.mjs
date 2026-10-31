#!/usr/bin/env node
// Fills site/ with what the page loads beside view.mjs: the link format and the print check (@rulecad/model-link and
// @rulecad/printcheck, copied, so the site is plain files with nothing to install) and, with --three, the parts of three.js the page uses (site/three.min.js, MIT,
// site/three.LICENSE; rebuild it after adding a name to the list below).
//   node scripts/build.mjs [--three]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const SITE = fileURLToPath(new URL('../site/', import.meta.url));
fs.copyFileSync(require.resolve('@rulecad/model-link'), path.join(SITE, 'model-link.mjs'));
fs.copyFileSync(require.resolve('@rulecad/printcheck'), path.join(SITE, 'printcheck.mjs')); // a dropped STL is checked here

if (process.argv.includes('--three')) {
  const { build } = await import('esbuild');
  const names = ['WebGLRenderer', 'Scene', 'PerspectiveCamera', 'BufferGeometry', 'Float32BufferAttribute', 'Mesh', 'MeshLambertMaterial',
    'LineSegments', 'EdgesGeometry', 'LineBasicMaterial', 'AmbientLight', 'DirectionalLight', 'Group', 'WireframeGeometry', 'Raycaster',
    'Vector2', 'Vector3', 'Box3', 'Plane', 'Points', 'PointsMaterial'];
  const three = path.resolve(path.dirname(require.resolve('three')), '..'); // (three/package.json isn't exported: its entry is build/three.cjs)
  await build({ stdin: { contents: `export { ${names.join(', ')} } from 'three';`, resolveDir: three, loader: 'js' },
    bundle: true, minify: true, format: 'esm', legalComments: 'inline', outfile: path.join(SITE, 'three.min.js') });
  fs.copyFileSync(path.join(three, 'LICENSE'), path.join(SITE, 'three.LICENSE'));
}
console.log(`site/: ${fs.readdirSync(SITE).join(', ')}`);
