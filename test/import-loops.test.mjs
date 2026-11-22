// No package's modules import each other in a loop. Node links a loop of ES modules and runs it, so every package's own
// tests pass with one; a loader without cycle support does not. The JSCAD web app's loader (its require(), see
// test/no-cycle-loader.mjs) loads a module again each time a module it is still loading asks for it, until the stack
// runs out: "RangeError: Maximum call stack size exceeded / failed loading module ./gears.mjs / failed loading module
// ./planetary.mjs / ..." for a design that imported @rulecad/gears (issue #278).
//
// The walk reads every module under packages/ (.mjs and .js, node_modules left out) for its static imports of another
// file by a relative path (import ... from './x.mjs', export ... from './x.mjs', import './x.mjs'), and finds each set
// of modules that reach each other (strongly connected components, Tarjan 1972). import() as a module runs is left
// out: it loads when called, after the module that asks has finished. Imports of another package are held to no
// loop by test/zero-deps.test.mjs (each small package depends only on the ones below it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { transformSync } from 'esbuild';
import { loader } from './no-cycle-loader.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const packages = path.join(root, 'packages');

/** Every module under a folder: file -> source. */
function sources(dir, out = new Map()) {
  for (const n of fs.readdirSync(dir)) {
    if (n === 'node_modules' || n.startsWith('.')) continue;
    const p = path.join(dir, n);
    if (fs.statSync(p).isDirectory()) sources(p, out); else if (/\.m?js$/.test(n)) out.set(p, fs.readFileSync(p, 'utf8'));
  }
  return out;
}

// A static import or re-export of a relative path, one statement at a time: import { a, b } from './x.mjs' (over
// several lines too), import x, * as y from, export * from, export { a } from, and import './x.mjs' for its effect.
// The source is first read by a JavaScript parser (esbuild, the one test/no-cycle-loader.mjs uses) and printed back
// without its comments, so an example in a comment isn't read as an import, and a "/*" or "//" inside a string, a
// template or a line comment (packages/cad/lib/schema.mjs opens on "// ... (schemas/*.schema.json)") hides none.
// A regular expression over the raw text cannot tell those apart: one stripping /* ... */ first lost every import up
// to the next "*/". The parser keeps every import as written, used or not, as it does for any .js or .mjs file.
const IMPORT = /(?:^|[;\n])\s*(?:import|export)\s*(?:[\w$]+\s*,?\s*)?(?:\{[^}]*\}|\*(?:\s*as\s+[\w$]+)?)?\s*from\s*(['"])(\.{1,2}\/[^'"]+)\1|(?:^|[;\n])\s*import\s*(['"])(\.{1,2}\/[^'"]+)\3/g;
const uncommented = (src) => transformSync(src, { loader: 'js', legalComments: 'none', logLevel: 'silent' }).code;
export const importsOf = (src) => [...uncommented(src).matchAll(IMPORT)].map((m) => m[2] ?? m[4]);

/** The loops among some modules (file -> source): each a sorted list of the files that import each other round. */
export function loops(files) {
  const graph = new Map([...files].map(([f, src]) => [f, importsOf(src).map((s) => path.resolve(path.dirname(f), s)).filter((g) => files.has(g))]));
  let n = 0; const index = new Map(), low = new Map(), stack = [], on = new Set(), found = [];
  const visit = (v) => { // Tarjan's strongly connected components
    index.set(v, n); low.set(v, n++); stack.push(v); on.add(v);
    for (const w of graph.get(v)) {
      if (!index.has(w)) { visit(w); low.set(v, Math.min(low.get(v), low.get(w))); } else if (on.has(w)) low.set(v, Math.min(low.get(v), index.get(w)));
    }
    if (low.get(v) !== index.get(v)) return;
    const c = []; let w; do { w = stack.pop(); on.delete(w); c.push(w); } while (w !== v);
    if (c.length > 1 || graph.get(v).includes(v)) found.push(c.sort());
  };
  for (const f of graph.keys()) if (!index.has(f)) visit(f);
  return found;
}
const shown = (found) => found.map((c) => c.map((f) => path.relative(root, f).replaceAll('\\', '/')).join(' <-> ')).join('; ');

test('no package has modules that import each other in a loop', () => {
  const all = sources(packages);
  assert.ok(all.size > 200, `only ${all.size} modules found under packages/`);
  const found = loops(all);
  assert.deepEqual(found, [], `modules in a loop of imports (a loader without cycle support never finishes them, #278): ${shown(found)}`);
});

test('the walk finds a loop when one is put back', () => {
  const gears = sources(path.join(packages, 'gears')), planetary = path.join(packages, 'gears', 'planetary.mjs');
  assert.deepEqual(loops(gears), []);
  // planetary.mjs taking its gears from gears.mjs again, as before #278 was fixed
  gears.set(planetary, gears.get(planetary).replace("from './core.mjs'", "from './gears.mjs'"));
  assert.equal(shown(loops(gears)), 'packages/gears/gears.mjs <-> packages/gears/planetary.mjs');
  // three modules round, by a re-export and an import over several lines; and a module importing itself
  const at = (n) => path.join(root, 'x', n);
  const three = new Map([[at('a.mjs'), "export * from './b.mjs';"], [at('b.mjs'), "import {\n  c,\n} from './c.mjs';\r\nexport const b = 1;"], [at('c.mjs'), "import { a } from \"./a.mjs\"\nexport const c = 2;"]]);
  assert.deepEqual(loops(three), [[at('a.mjs'), at('b.mjs'), at('c.mjs')]]);
  assert.deepEqual(loops(new Map([[at('d.mjs'), "import './d.mjs';"]])), [[at('d.mjs')]]);
  // what isn't a loop: an import in a comment, import() as it runs, a chain that ends
  assert.deepEqual(loops(new Map([[at('e.mjs'), "// import { f } from './f.mjs';\n/* export * from './f.mjs' */\nexport const e = () => import('./f.mjs');"], [at('f.mjs'), "import { e } from './e.mjs';"]])), []);
  // a "/*" that opens no comment: in a line comment, a string or a template (and a "*/" later on), with real imports
  // between; each pair is a loop all the same
  const hid = (where) => loops(new Map([[at('g.mjs'), `${where}\nimport { h } from './h.mjs';\nexport const g = 1; // ends */`], [at('h.mjs'), "import { g } from './g.mjs';"]]));
  for (const where of ['// the schemas (schemas/*.schema.json)', "const glob = 'schemas/*.json';", 'const glob = `a/*${1}`;', 'const re = /a\\/*b/;'])
    assert.deepEqual(hid(where), [[at('g.mjs'), at('h.mjs')]], where);
  // the repository's own case: cad's schema.mjs (whose line 1 is such a comment) and errors.mjs importing it back
  const cad = sources(path.join(packages, 'cad', 'lib')), errors = path.join(packages, 'cad', 'lib', 'errors.mjs');
  cad.set(errors, "import { validate } from './schema.mjs';\n" + cad.get(errors));
  assert.equal(shown(loops(cad)), 'packages/cad/lib/errors.mjs <-> packages/cad/lib/schema.mjs');
});

// Each module a package offers (its package.json exports): what a design imports
const entries = fs.readdirSync(packages).flatMap((p) => {
  const pj = JSON.parse(fs.readFileSync(path.join(packages, p, 'package.json'), 'utf8')), ex = pj.exports;
  const list = !ex ? [] : typeof ex === 'string' ? [ex] : ex.default ? [ex.default] : Object.values(ex).map((v) => v.default ?? v);
  return list.filter((f) => typeof f === 'string' && f.endsWith('.mjs')).map((f) => [p, f, path.join(packages, p, f)]);
});

test("a loader without cycle support (the JSCAD web app's) fails on a loop, as issue #278 reported", () => {
  // the gears package as it was: planetary.mjs taking its gears from gears.mjs, which re-exports planetary.mjs
  const planetary = path.join('gears', 'planetary.mjs');
  const asItWas = (f) => { const src = fs.readFileSync(f, 'utf8'); return f.endsWith(planetary) ? src.replace("from './core.mjs'", "from './gears.mjs'") : src; };
  assert.throws(() => loader(asItWas)(path.join(packages, 'gears', 'gears.mjs')), (e) => e instanceof RangeError && /Maximum call stack size exceeded/.test(e.message)
    && /failed loading module \.\/planetary\.mjs \/ failed loading module \.\/gears\.mjs \/ failed loading module \.\/planetary\.mjs/.test(e.message));
});

test("every package's modules load with a loader without cycle support, with the same exports as Node gives", async () => {
  assert.ok(entries.length > 30, `only ${entries.length} modules offered`);
  const load = loader();
  for (const [p, f, file] of entries) {
    let got; try { got = load(file); } catch (e) { assert.fail(`@rulecad/${p} ${f}: ${e.message.slice(0, 300)}`); }
    const node = await import(pathToFileURL(file).href);
    assert.deepEqual(Object.keys(got).filter((k) => k !== 'default').sort(), Object.keys(node).sort(), `@rulecad/${p} ${f}`);
  }
});

test("issue #278's own design runs with that loader", () => {
  const design = path.join(root, 'test', 'issue-278-design.mjs'); // not on disk: the issue's design, as typed there
  const src = `import { gearModel, rackModel, spur, mesh, phase, printable } from '@rulecad/gears';

export const main = (params) => {
  const pinion = gearModel({ module: 1, teeth: 18 });   // mm; 20° pressure angle unless you say
  const wheel = gearModel({ module: 1, teeth: 42 });
  const m = mesh(pinion, wheel, { centre: 30 });          // the axes you plan, checked
  return [pinion]
}
`;
  const { main } = loader((f) => (f === design ? src : fs.readFileSync(f, 'utf8')))(design);
  const [pinion] = main({});
  assert.equal(pinion.teeth, 18);
  assert.equal(pinion.pitch, 18); // the pitch diameter, m z = 1 mm × 18 = 18 mm
});
