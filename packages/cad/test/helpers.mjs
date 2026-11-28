// Helpers shared by cad's tests (packages/cad/test/*.test.mjs). This file is not a test itself: the test command takes
// only *.test.mjs, and packages/cad/package.json's "files" leaves the test folder out of the package. A test file
// imports what it needs from here rather than defining its own workspace(), so every test starts the command one way.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** The URL of packages/cad/, the folder test.mjs stood in: `new URL('./lib/x.mjs', CAD)`, `new URL('../rules/m3.json', CAD)`. */
export const CAD = new URL('../', import.meta.url).href;
/** The path of the cad command, bin/cad.mjs. */
export const BIN = fileURLToPath(new URL('./bin/cad.mjs', CAD));
/** The repository's node_modules, linked into each workspace: it stands in for npm install @jscad/modeling. */
export const ROOT_MODULES = fileURLToPath(new URL('../../../node_modules', import.meta.url));

/**
 * The option that keeps one of the slowest end-to-end tests out of the pull request run: `test(name, SLOW, fn)`. Those
 * tests run nightly and on release pull requests (.github/workflows/slow-tests.yml), with RULECAD_SLOW_TESTS=1, which
 * also runs them on your own machine (CONTRIBUTING.md, "Tests that run nightly"). scripts/test.mjs --slow finds the
 * files that hold such tests by this name.
 */
export const SLOW = { skip: process.env.RULECAD_SLOW_TESTS ? false : 'one of the slowest tests: it runs nightly and on release pull requests (RULECAD_SLOW_TESTS=1 runs it here)' };

/** A fresh workspace, as the README's quick start makes one: `{ ws, cad, done }`, cad(...args) giving the output. */
export function workspace(config) {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'rulecad-'));
  fs.writeFileSync(path.join(ws, 'package.json'), JSON.stringify({ type: 'module' }));
  if (config) fs.writeFileSync(path.join(ws, 'cad.config.json'), JSON.stringify(config));
  fs.symlinkSync(ROOT_MODULES, path.join(ws, 'node_modules'), 'junction');
  const env = { ...process.env, CAD_TRUSTED: path.join(ws, '.trusted.json') }; // (the user's own trust list, kept out of their home)
  const cad = (...a) => { try { return execFileSync(process.execPath, [BIN, ...a], { cwd: ws, encoding: 'utf8', stdio: 'pipe', env }); } catch (e) { return `${e.stdout}${e.stderr}`; } };
  return { ws, cad, done: () => fs.rmSync(ws, { recursive: true, force: true }) };
}

/** A bracket on a base, each drawn with v.fixings: the base's ends and the bracket's seats are choices, so one pair of objects tries every joint. */
export function fastened(ws) {
  fs.mkdirSync(path.join(ws, 'projects/demo/assemblies'), { recursive: true });
  const size = { width: { value: 40, unit: 'mm', rule: 'Room for two screws' }, depth: { value: 20, unit: 'mm', rule: 'A screw and its walls' }, pitch: { value: 24, unit: 'mm', rule: 'Between the screws' } };
  object(ws, 'demo/base', { uses: ['x1c'], variables: { ...size, tall: { value: 'x1c.layer * 60', unit: 'mm', rule: 'Whole layers' }, hole_depth: { value: 9, unit: 'mm', rule: 'The thread engaged and room at the tip', tweak: { min: 3, max: 11 } },
    end: { value: 'pilot', choice: ['pilot', 'insert', 'through', 'pocket', 'trap'], rule: 'What holds the screw' } } }, `import jscad from '@jscad/modeling'
const { cuboid } = jscad.primitives
export function main (v) {
  const f = v.fixings, block = cuboid({ size: [v.width, v.depth, v.tall], center: [0, 0, v.tall / 2] })
  const cut = (x) => (v.end === 'pilot' ? [f.hole('M3', { kind: 'pilot', depth: v.hole_depth, at: [x, 0, v.tall] })] : v.end === 'insert' ? [f.hole('M3', { kind: 'insert', at: [x, 0, v.tall] })]
    : [f.hole('M3', { depth: v.tall, at: [x, 0, v.tall] }), ...(v.end === 'pocket' ? [f.nutPocket('M3', { at: [x, 0, 0], into: '+z' })] : v.end === 'trap' ? [f.nutTrap('M3', { depth: v.depth / 2, into: '+y', at: [x, 0 - v.depth / 2, v.tall / 2] })] : [])])
  return v.ops.subtract(block, ...[-1, 1].flatMap((s) => cut(s * v.pitch / 2)))
}
`);
  object(ws, 'demo/bracket', { uses: ['x1c'], anchors: { h1: { at: ['-pitch / 2 + shift', 0, 'thick'], axis: [0, 0, 1] }, h2: { at: ['pitch / 2 + shift', 0, 'thick'], axis: [0, 0, 1] }, pivot: { at: [0, 0, 0], axis: [0, 0, 1] } }, variables: { ...size,
    thick: { value: 'x1c.layer * 25', unit: 'mm', rule: 'Whole layers', tweak: { min: 2, max: 12 } }, shift: { value: 0, unit: 'mm', rule: 'The holes moved along, to try a misfit', tweak: { min: -3, max: 3 } },
    bore: { value: 0, unit: 'mm', rule: 'A hole typed by hand, to try a wrong size (0: the thread\'s own)', tweak: { min: 0, max: 6 } }, seat: { value: 'hole', choice: ['hole', 'counterbore', 'countersink'], rule: 'How the head sits' } } }, `import jscad from '@jscad/modeling'
const { cuboid, cylinder } = jscad.primitives
export function main (v) {
  const plate = cuboid({ size: [v.width, v.depth, v.thick], center: [0, 0, v.thick / 2] })
  const cut = (x) => (v.bore ? cylinder({ radius: v.bore / 2, height: v.thick * 2, center: [x, 0, v.thick / 2] })
    : v.seat === 'hole' ? v.fixings.hole('M3', { depth: v.thick, at: [x, 0, v.thick] }) : v.fixings[v.seat]('M3', { length: v.thick, thickness: v.thick, at: [x, 0, v.thick] }))
  return v.ops.subtract(plate, ...[-1, 1].map((s) => cut(s * v.pitch / 2 + v.shift)))
}
`);
  fs.writeFileSync(path.join(ws, 'projects/demo/project.json'), JSON.stringify({ name: 'demo', material: 'PLA', objects: ['base', 'bracket'] }));
  const file = path.join(ws, 'projects/demo/assemblies/joint.json');
  // write(change): the assembly with its items' sets and its fasten changed; check(): its findings and exit code
  const write = ({ base = {}, bracket = {}, fasten = {}, more = {} } = {}) => fs.writeFileSync(file, JSON.stringify({ title: 'Bracket on its base', kind: 'fit',
    items: [{ id: 'base', object: 'base', set: base }, { id: 'bracket', object: 'bracket', at: [0, 0, 'base.tall'], set: bracket }],
    fits: [{ a: 'bracket', b: 'base', min: 0, max: 0.05, note: 'The bracket sits on the base' }],
    fasten: [{ screw: 'M3 cap', through: ['bracket'], into: 'base', at: ['bracket.h1', 'bracket.h2'], ...fasten }], ...more }));
  const check = () => { const r = spawnSync(process.execPath, [BIN, 'check', 'demo/joint', '--json'], { cwd: ws, encoding: 'utf8' }); let out; try { out = JSON.parse(r.stdout); } catch { assert.fail(`${r.stdout}${r.stderr}`); } return { status: r.status, findings: out.findings, of: (code) => out.findings.filter((x) => x.code === code), fails: out.findings.filter((x) => x.level === 'fail').map((x) => x.code) }; };
  return { file, write, check };
}

/** Write an object (its .json and .js) into a workspace, adding it to its project. */
export const object = (ws, ref, json, js) => {
  const [project, name] = ref.split('/'), dir = path.join(ws, 'projects', project, 'objects');
  fs.mkdirSync(dir, { recursive: true });
  const pj = path.join(ws, 'projects', project, 'project.json');
  const p = fs.existsSync(pj) ? JSON.parse(fs.readFileSync(pj, 'utf8')) : { name: project, objects: [] };
  if (!p.objects.includes(name)) p.objects.push(name);
  fs.writeFileSync(pj, JSON.stringify(p));
  fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify({ name, title: name, version: '0.1.0', ...json }));
  fs.writeFileSync(path.join(dir, `${name}.js`), js);
};

/** Write a file into a workspace, making its folders: text as it is, anything else as JSON. */
export const write = (ws, file, x) => { fs.mkdirSync(path.dirname(path.join(ws, file)), { recursive: true }); fs.writeFileSync(path.join(ws, file), typeof x === 'string' ? x : JSON.stringify(x)); };

/** A box design of v.w × v.d × v.h standing on the bed, for object(). */
export const BOX = `import jscad from '@jscad/modeling'
const { cuboid } = jscad.primitives, { translate } = jscad.transforms
export function main (v) { return translate([0, 0, v.h / 2], cuboid({ size: [v.w, v.d, v.h] })) }
`;

/** A rail-like test part, as triangles: a plate with a key standing on part of it, and a notch in the key's top. */
export async function railPart() {
  const { primitives: { cuboid }, booleans: { union, subtract }, transforms: { translate } } = (await import('@jscad/modeling')).default;
  const box = (lo, size) => translate(lo.map((a, i) => a + size[i] / 2), cuboid({ size }));
  const g = subtract(union(box([0, -5, 0], [40, 10, 2]), box([10, -2, 2], [20, 4, 3])), box([18, -3, 3.5], [4, 6, 2]));
  const { polygons } = await import('../lib/design.mjs');
  return polygons(g, { triangulate: true }).flatMap((p) => p.slice(1, -1).map((_, i) => [p[0], p[i + 1], p[i + 2]]));
}

/** A run of the command in a workspace with its exit status kept (workspace()'s cad() gives the output only): `{ out, stdout, code }`. */
export const run = (ws, a, env = {}) => { const r = spawnSync(process.execPath, [BIN, ...a], { cwd: ws, encoding: 'utf8', env: { ...process.env, ...env } }); return { out: `${r.stdout}${r.stderr}`, stdout: r.stdout, code: r.status }; };

/** A document replayed in a workspace npm create rulecad makes: each file it names written, each `npx cad` command run to pass. */
// Its fenced blocks in turn: a block named for a file is written there; a sh block's cad commands are run (previews
// need Chrome, so they're passed over), each to pass with no failing or warning finding. Returns { text, files,
// commands }; the workspace is the caller's, to check further and remove after
export function replay(doc, ws) {
  const text = fs.readFileSync(doc, 'utf8').replace(/\r\n/g, '\n'); // (a Windows checkout has its own line endings)
  execFileSync(process.execPath, [fileURLToPath(new URL('../create-rulecad/index.mjs', CAD)), ws, '--no-install'], { encoding: 'utf8' });
  fs.symlinkSync(ROOT_MODULES, path.join(ws, 'node_modules'), 'junction'); // stands in for npm install
  let files = 0, commands = 0;
  for (const [, info, body] of text.matchAll(/^```(\S*(?: \S+)?)\n([\s\S]*?)^```$/gm)) {
    const [lang, file] = info.split(' ');
    if (file) { fs.mkdirSync(path.dirname(path.join(ws, file)), { recursive: true }); fs.writeFileSync(path.join(ws, file), body); files++; continue; }
    if (lang !== 'sh') continue;
    // a command the text says warns ("# warns: why") may warn, never fail
    for (const { line, warns } of body.split('\n').map((l) => ({ line: l.replace(/\s+#.*$/, '').trim(), warns: /#\s*warns\b/.test(l) })).filter(({ line: l }) => l.startsWith('npx cad ') && !l.startsWith('npx cad preview'))) {
      const a = [...line.slice('npx cad '.length).matchAll(/"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2]);
      const r = run(ws, a);
      assert.equal(r.code, 0, `${line}\n${r.out}`);
      assert.doesNotMatch(r.out, warns ? /^\s+✗ /m : /^\s+[✗!] /m, `${line}\n${r.out}`);
      commands++;
    }
  }
  return { text, files, commands };
}
