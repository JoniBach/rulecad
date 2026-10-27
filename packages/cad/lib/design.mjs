// Designs: projects/<project>/objects/<object>.js (the shape) and <object>.json (its variables and metadata).
// The .js exports main(v), where v holds the resolved variables (v.stem_arm) and rule sets (v.x1c.line). It
// should hold no measurements of its own: lint() flags number literals other than 0, 1 and 2.
// main() returns a shape, or named parts ({ cap, pillar }) described in the .json's "parts":
//   { "pillar": { "role": "support", "label": "Breakaway pillar" } }   role: part (default) or support (printed, then
//   removed). Checks and print files use every part; the mirror shows only real parts.
//   "filament": "legend" prints the part in another of the project's filaments (project.json "filaments"); "mirror":
//   false leaves it off the on-screen copy (fine detail); "optional": true lets main() leave it out (a keycap with no legend).
// Variants: named sets of inputs in the .json ("variants": { "oem-r3": { "profile": "oem", "row": "R3" } }), built as
// keyboard/keycap:oem-r3. Versions are the design over time; variants are alternatives that exist side by side.
// Layouts: a "type": "layout" variable picks a file in the project's layouts/; the design gets every layout it can pick
// as v.layouts[name] = { …the file, keys (each key's centre and properties), width, depth } (lib/layout.mjs).
// Boards: "engine": "pcb" in the .json makes main(v) return a tscircuit board ({ board, matrix }, built with v.pcb, as
// @rulecad/pcb describes); the build then carries its Circuit JSON (circuit) and matrix, and one part: the bare board
// (its copper is in the 2D views).
// Builds are cached in .cache/builds/, by everything they're made from (CAD_NO_CACHE=1 to skip).
import { located } from './errors.mjs';
import { host } from './host.mjs';
import { named, faces, fromFaces, polygons } from './parts.mjs';
import { runSandboxed, sandboxed } from './sandbox.mjs';
export { polygons };
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import { resolve, loadRuleSet } from './rules.mjs';
import { WS, paths, printerOf } from './workspace.mjs';
import { readLayout, hasLayout, keys, width, depth } from './layout.mjs';
import { optimised, forDesign } from './optimise.mjs';
import * as shapes from '@rulecad/shapes';
import { engineId, packageVersion, materialise } from './versions.mjs';
import { satisfies } from '@rulecad/versions';

const require = createRequire(import.meta.url);
const jscad = require('@jscad/modeling');

// "keyboard/keycap", "keyboard/keycap:oem-r3" (a variant) or a path to the .js or .json
//   -> { project, name, js, json, dir, variant }
export function locate(ref) {
  const [plain, variant] = String(ref).split(':');
  ref = plain;
  let base = ref.replace(/\.(js|json)$/, '');
  if (!base.includes(path.sep) || !host.exists(`${base}.json`)) {
    const [project, name] = ref.split('/');
    if (!project || !name) throw new Error(`name a design as <project>/<object>, e.g. keyboard/keycap (got "${ref}")`);
    base = path.join(paths.project(project), 'objects', name);
  }
  if (!host.exists(`${base}.json`) || !host.exists(`${base}.js`)) throw new Error(`no design at ${path.relative(WS, base)}.{js,json}`);
  const dir = path.dirname(path.dirname(base));
  return { project: path.basename(dir), name: path.basename(base), js: `${base}.js`, json: `${base}.json`, dir, ...(variant ? { variant } : {}) };
}

// ---------- objects that read each other ----------
// "uses": ["macropad/pcb"] reads another object's numbers as a rule set named after it (pcb.board_w in an
// expression, v.pcb.board_w in code): its variables, and what a board tells the parts around it (board_x, board_y,
// board_w, board_d, and for code board_holes, board_parts (where each part is) and board_outline, for a shaped board). The object is built (cached) first. "macropad/pcb@^0.2.0" also checks
// its version; "macropad/pcb@0.2.0" reads that release instead of the working copy.
export const isObjectRef = (u) => String(u).includes('/');
const building = new Set();
export async function objectSets(d, object) {
  const refs = (object.uses || []).filter(isObjectRef), sets = {}, extra = {};
  if (!refs.length) return { sets, extra };
  const self = `${d.project}/${d.name}`;
  building.add(self);
  try {
    for (const u of refs) {
      const [ref, want] = u.split('@'), exact = /^\d+\.\d+\.\d+$/.test(want || '');
      if (building.has(ref)) throw new Error(`${self} and ${ref} read each other's numbers: one of them has to give its numbers to the other, not both`);
      const base = locate(ref), b = await build(exact ? materialise(base, want) : base), version = b.object.version;
      if (want && !exact && !satisfies(version, want)) throw new Error(`${self} uses ${ref} ${want}, but ${ref} is ${version}: change the range, or the design to suit ${version}`);
      const units = Object.fromEntries(Object.entries(b.object.variables || {}).map(([k, x]) => [k, x.unit]));
      const rules = {};
      for (const [k, v] of Object.entries(b.values)) if (typeof v === 'number' && Number.isFinite(v)) {
        rules[k] = { value: v, unit: units[k] ?? 'mm', rule: `${ref}'s ${k}`, kind: 'design', source: `${ref}@${version}` };
      }
      sets[u] = { name: base.name, rules };
      if (b.circuit) { const e = await pcbEngine(), board = b.circuit.find((x) => x.type === 'pcb_board'); extra[base.name] = { board_holes: e.holes(b.circuit), board_parts: e.parts ? e.parts(b.circuit) : {}, ...(board.outline ? { board_outline: board.outline } : {}) }; }
    }
  } finally { building.delete(self); }
  return { sets, extra };
}

// The layouts an object can pick, by name, from its layout variables' choices (built-ins like grid have no file)
export function layoutsOf(d, object) {
  const out = {};
  for (const v of Object.values(object.variables || {})) if (v.type === 'layout') {
    for (const n of v.choice || [v.value]) if (hasLayout(d.project, n, d.layoutsDir)) out[n] = readLayout(d.project, n, d.layoutsDir);
  }
  return out;
}

// The optimised layouts an object's problem variables pick, by name, for v.problems
export function problemsOf(d, object, values) {
  const out = {};
  for (const [name, v] of Object.entries(object.variables || {})) if (v.type === 'problem') {
    const ref = values[name];
    if (!out[ref]) {
      const r = optimised(d.project, ref, { onStep: (s) => s.step === 1 && console.error(`optimising ${ref} (once: the result is cached until the problem changes)…`) });
      out[ref] = forDesign(r);
    }
  }
  return out;
}

// A variant's inputs, under what's set explicitly
export function variantSet(d, object, set = {}) {
  if (!d.variant) return set;
  const v = (object.variants || {})[d.variant];
  if (!v) throw new Error(`${d.name} has no variant "${d.variant}" (variants: ${Object.keys(object.variants || {}).join(', ') || 'none'})`);
  return { ...v, ...set };
}

const CACHE = paths.cache('builds'), CACHE_VERSION = 2;
const source = (f) => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
// What every build is made with: this code, the shape helpers and JSCAD's version (an upgrade rebuilds everything);
// boards also with the board engine (engineId: its code and tscircuit's version), loaded only for boards
const own = source(import.meta.url) + source(import.meta.resolve('@rulecad/shapes')) + packageVersion('@jscad/modeling');
export const pcbEngine = () => import('@rulecad/pcb').catch((e) => {
  if (e.code === 'ERR_MODULE_NOT_FOUND' && /@rulecad\/pcb/.test(e.message)) throw new Error('boards need the board engine: npm install @rulecad/pcb');
  throw e;
});

// An object's on-screen settings are "display" ({ "smooth": 24 }), and a part left off screen is "display": false.
// Their first name, "mirror", still works: read here, the rest of the tool sees it as mirror either way.
// Which engine a design's v.ops booleans use: the object's "engine": "manifold", or CAD_ENGINE=manifold for every design
export const booleans = (object) => (object.engine === 'manifold' ? 'manifold' : object.engine === 'pcb' ? 'jscad' : process.env.CAD_ENGINE || 'jscad');

export const readObject = (d) => {
  const o = JSON.parse(host.readText(d.json));
  if (o.display && !o.mirror) o.mirror = o.display;
  for (const p of Object.values(o.parts || {})) if (p.display === false) p.mirror = false;
  return o;
};

// build(design, set, { mirror }) -> { object, values, entries, parts, polygons (for the mirror), triangles (for checks and export) }
//   parts: [{ name, role, label, geometry, polygons, triangles }]; polygons and triangles: every part together
export async function build(d, set = {}, { mirror = false } = {}) {
  const object = readObject(d);
  set = variantSet(d, object, set);
  const refs = await objectSets(d, object); // other objects' numbers, when it reads them
  const sets = { ...(d.rulesDir ? Object.fromEntries((object.uses || []).filter((u) => !isObjectRef(u)).map((u) => [u, loadRuleSet(u, d.rulesDir)])) : {}), ...refs.sets }; // a release's own rules
  const display = mirror ? object.mirror || {} : {};
  let resolved;
  try { resolved = resolve(object, { set, sets, display }); } catch (e) { throw located(e, d.json, 'var'); } // mirror: lighter for the display
  const { values, entries, deps, units } = resolved;
  for (const [n, x] of Object.entries(refs.extra)) Object.assign(values[n], x);
  const files = layoutsOf(d, object);
  if (object.layouts) values.layouts = object.layouts; // older designs kept layouts in their .json
  if (Object.keys(files).length) values.layouts = Object.fromEntries(Object.entries(files).map(([n, l]) => [n, { ...l, keys: keys(l), width: width(l), depth: depth(l) }]));
  // Optimised layouts: a "type": "problem" variable picks a problem in the project's problems/; the design gets the
  // one it picked as v.problems[name] (lib/optimise.mjs), optimised the first time and cached after
  const problems = problemsOf(d, object, values);
  if (Object.keys(problems).length) values.problems = problems;

  // The cache: everything the build is made from. A hit skips running the design (and its booleans) altogether
  const ruleText = [...(object.uses || []).map((u) => JSON.stringify(sets[u] || loadRuleSet(u))), JSON.stringify(refs.extra)];
  const key = crypto.createHash('sha256').update(JSON.stringify([CACHE_VERSION, own, object.engine === 'pcb' ? engineId() : booleans(object), host.readText(d.js), JSON.stringify(object), ruleText, files, Object.values(problems).map((p) => p.hash), set, display])).digest('hex');
  const hit = path.join(CACHE, `${key}.json`);
  if (!process.env.CAD_NO_CACHE && host.exists(hit)) {
    const c = JSON.parse(host.readText(hit));
    try { host.touch(hit); } catch {} // recently used: kept when the cache is pruned
    for (const e of entries) if (c.used.includes(e.name)) e.used = true;
    const parts = c.parts.map(({ solid: f, ...p }) => ({ ...p, geometry: fromFaces(f) }));
    if (c.circuit) Object.assign(values, (await pcbEngine()).outputs(c.circuit, c.matrix));
    return { object, values, entries, deps, units, parts, polygons: parts.flatMap((p) => p.polygons), triangles: parts.flatMap((p) => p.triangles), cached: true, hash: key, ...(c.circuit ? { circuit: c.circuit, matrix: c.matrix } : {}) };
  }

  // A JSCAD design runs in a sandbox (sandbox.mjs: another process that can't write files, start programs or reach
  // the network) unless the workspace trusts its designs; a board design runs here, with the board engine
  const pcb = object.engine === 'pcb' ? await pcbEngine() : null;
  let parts, board = null, read;
  if (!pcb && sandboxed() && host.name === 'node') ({ parts, read } = await runSandboxed(d, values, object.parts || {}, booleans(object)));
  else {
    const mod = await host.loadModule(d.js).catch((e) => { // a fresh copy after each edit
      // Designs import JSCAD themselves, so it has to be installed where they are (it's the workspace's dependency)
      if (e.code === 'ERR_MODULE_NOT_FOUND' && /@jscad\/modeling/.test(e.message)) throw new Error(`designs need JSCAD in the workspace: npm install @jscad/modeling (in ${WS})`);
      if (/import statement outside a module/.test(e.message)) throw new Error(`designs are ES modules: set "type": "module" in ${path.join(WS, 'package.json')}`);
      throw e;
    });
    if (typeof mod.main !== 'function') throw new Error(`${path.relative(WS, d.js)} has no exported main(v)`);
    // Rules the code reads directly (v.mx.housing_top) count as used too, so estimates it relies on get flagged
    read = new Set();
    const watched = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v && typeof v === 'object'
      ? new Proxy(v, { get: (t, r) => { if (typeof r === 'string' && r in t) read.add(`${k}.${r}`); return t[r]; } }) : v]));
    watched.shapes = shapes; watched.ops = await shapes.ops(booleans(object)); if (pcb) watched.pcb = pcb;
    let made;
    try { made = await mod.main(watched); } catch (e) { throw located(e, d.js, 'design.run'); }
    if (object.engine === 'pcb') { // a circuit board: tscircuit builds it, and the bare board is its one part
      const { board: b, matrix } = made && made.board ? made : { board: made };
      board = { circuit: await pcb.render(b), ...(matrix ? { matrix } : {}) };
      Object.assign(values, pcb.outputs(board.circuit, matrix)); // what it tells the parts around it: outline, Pico
      made = pcb.solids(board.circuit, { thickness: values.thickness, smooth: values.smooth });
    }
    parts = named(made, object.parts || {});
  }
  for (const e of entries) if (read.has(e.name)) e.used = true;
  try {
    prune();
    host.writeText(hit, JSON.stringify({ used: entries.filter((e) => e.used).map((e) => e.name), parts: parts.map(({ geometry, ...p }) => ({ ...p, solid: faces(geometry) })), ...(board || {}) }));
  } catch {} // a cache that can't be written is only slower
  return { object, values, entries, deps, units, parts, polygons: parts.flatMap((p) => p.polygons), triangles: parts.flatMap((p) => p.triangles), hash: key, ...(board || {}) };
}

// The cache keeps its most recently used builds, about CACHE_KEEP of them (an old version's builds go first)
const CACHE_KEEP = 800;
function prune() {
  if (Math.random() > 0.05) return; // now and then is enough
  const files = host.list(CACHE).map((f) => { const p = path.join(CACHE, f); return { p, t: host.mtime(p) }; }).sort((a, b) => b.t - a.t);
  for (const { p } of files.slice(CACHE_KEEP)) host.remove(p);
}

// The rules of the printer a build is checked against (the project's, else the workspace's), resolved
export const printer = (b, d) => { const n = printerOf(d.project); return b.values[n] || resolve({ uses: [n] }).values[n]; };

// Only some parts: --part cap (by name), the real parts without supports, or what the mirror shows (no supports, and
// no parts marked mirror: false).
export function pick(b, { part, noSupports = false, forMirror = false } = {}) {
  let parts = b.parts;
  if (part) { parts = parts.filter((p) => p.name === part); if (!parts.length) throw new Error(`no part "${part}" (parts: ${b.parts.map((p) => p.name).join(', ')})`); }
  if (noSupports || forMirror) parts = parts.filter((p) => p.role !== 'support');
  if (forMirror) parts = parts.filter((p) => p.mirror !== false);
  return { ...b, parts, polygons: parts.flatMap((p) => p.polygons), triangles: parts.flatMap((p) => p.triangles) };
}



export { lint } from '@rulecad/variables'; // number literals that should be variables

export { jscad };
