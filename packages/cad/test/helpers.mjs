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
 * A run of the cad command in a folder, its exit status kept: the one way cad's tests start the command.
 * `{ status, signal, out, stdout, stderr, json, code }`: out is stdout then stderr; json is stdout read as JSON
 * (undefined when it is not JSON); code is status under its older name. A run that outlasts `timeout` ms is stopped
 * and its status is null. `env` adds to (or, with a value of undefined, removes from) the environment; `node` is
 * flags for node itself, before the command (`['--import', hooks]`).
 * @param {string} ws the folder to run in
 * @param {string[]} args the command's arguments
 * @param {{ env?: Record<string, string | undefined>, timeout?: number, input?: string, node?: string[] }} [options]
 */
export function runCad(ws, args, { env = {}, timeout, input, node = [] } = {}) {
  const r = spawnSync(process.execPath, [...node, BIN, ...args], { cwd: ws, encoding: 'utf8', env: { ...process.env, ...env }, timeout, input, maxBuffer: 1 << 28 });
  const stdout = r.stdout ?? '', stderr = r.stderr ?? '';
  const result = { status: r.status, signal: r.signal, out: `${stdout}${stderr}`, stdout, stderr, code: r.status, args, ws, timeout };
  let json;
  Object.defineProperty(result, 'json', { enumerable: false, get: () => { if (json === undefined) { try { json = JSON.parse(stdout); } catch { json = null; } } return json ?? undefined; } });
  audit(result);
  return result;
}

// CAD_TEST_AUDIT=<file>: every run that does not exit 0 is noted in the file (a line of JSON: the test line that
// started it, the command, its status, its failing findings or refusal), and a run that should succeed gives its output
// rather than failing its test, so that one pass of the suite lists every run that fails
const AUDIT = process.env.CAD_TEST_AUDIT;
function audit(r) {
  if (!AUDIT || r.status === 0) return;
  const at = (new Error().stack ?? '').split('\n').map((l) => l.match(/[\\/]test[\\/]([\w.-]+\.test\.mjs):(\d+)/)).find(Boolean);
  const fails = [...(r.json?.findings ?? []).filter((x) => x.level === 'fail').map((x) => `${x.code}: ${x.text}`), ...(r.json?.error ? [JSON.stringify(r.json.error)] : []),
    ...r.out.split('\n').filter((l) => /^\s*✗|error/.test(l))].slice(0, 8);
  fs.appendFileSync(AUDIT, `${JSON.stringify({ at: at ? `${at[1]}:${at[2]}` : '?', args: r.args, status: r.status, signal: r.signal, out: r.out.slice(0, 600), fails })}\n`);
}

/** What a run printed, with the command and its exit status, for a failed assertion. */
const told = (r) => `cad ${r.args.join(' ')}\n(in ${r.ws})\nexited ${r.status ?? `on ${r.signal}${r.timeout ? `: it ran past ${r.timeout / 1000} s, so it may hang` : ''}`}\n${r.out}`;

/**
 * The findings a `--json` run printed, after checking its exit status agrees with them: 1 when a finding fails, 0 when
 * none does. A run that printed no findings, stopped, or exited otherwise fails the test.
 * @param {ReturnType<typeof runCad>} r the run
 */
export function findingsOf(r) {
  const findings = r.json?.findings;
  if (!Array.isArray(findings)) assert.fail(`the run printed no findings:\n${told(r)}`);
  const want = findings.some((x) => x.level === 'fail') ? 1 : 0;
  if (r.status !== want && !AUDIT) assert.fail(`a run ${want ? 'with a failing finding should exit 1' : 'with no failing finding should exit 0'}, and this one did not:\n${told(r)}`);
  return findings;
}

/**
 * The command run in a folder, as tests call it: `cad(...args)` gives what a run that must succeed printed on stdout
 * (its notes on stderr are left out, so --json output reads as JSON), and fails the test, with the command, its exit
 * status and output, on any other exit. The others:
 * - `cad.ok(...args)`, the same, by name;
 * - `cad.refused(want, ...args)`: a run that must fail (a non-zero exit), and print `want` (a finding or refusal code,
 *   any text, or a pattern); gives the output;
 * - `cad.run(...args)`: the run whatever its exit, as runCad gives it, for a test that reads the status itself;
 * - `cad.json(...args)`: a run that must succeed, its stdout read as JSON;
 * - `cad.findings(...args)`: a `--json` check whose findings are read whether it passes or fails: it must print its
 *   findings, and exit 1 when one of them fails and 0 when none does; gives the findings;
 * - `cad.with(options)`: the same functions with runCad's options (`env`, `timeout`, `node`) added to these.
 * @param {string} ws the folder to run in
 * @param {{ env?: Record<string, string | undefined>, timeout?: number, node?: string[] }} [options]
 */
export function cadIn(ws, options = {}) {
  const go = (args) => runCad(ws, args, options);
  const ok = (...args) => { const r = go(args); if (r.status !== 0 && !AUDIT) assert.fail(`a run that should succeed did not:\n${told(r)}`); return r.status === 0 ? r.stdout : r.out; };
  const cad = Object.assign(ok, {
    ok,
    run: (...args) => go(args),
    json: (...args) => { const r = go(args); if (r.status !== 0 && !AUDIT) assert.fail(`a run that should succeed did not:\n${told(r)}`); if (r.json === undefined) assert.fail(`the run printed no JSON:\n${told(r)}`); return r.json; },
    refused: (want, ...args) => {
      const r = go(args);
      if (r.status === 0) assert.fail(`a run that should fail succeeded:\n${told(r)}`);
      if (r.status === null) assert.fail(`a run that should fail was stopped:\n${told(r)}`);
      if (want instanceof RegExp ? !want.test(r.out) : !r.out.includes(want)) assert.fail(`a run failed, but without ${want instanceof RegExp ? want : JSON.stringify(want)}:\n${told(r)}`);
      return r.out;
    },
    findings: (...args) => findingsOf(go(args)),
    with: (more) => cadIn(ws, { ...options, ...more, env: { ...options.env, ...more.env } }),
  });
  return cad;
}

/** A fresh workspace, as the README's quick start makes one: `{ ws, cad, done }`, cad as cadIn gives it. */
export function workspace(config) {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'rulecad-'));
  fs.writeFileSync(path.join(ws, 'package.json'), JSON.stringify({ type: 'module' }));
  if (config) fs.writeFileSync(path.join(ws, 'cad.config.json'), JSON.stringify(config));
  fs.symlinkSync(ROOT_MODULES, path.join(ws, 'node_modules'), 'junction');
  const cad = cadIn(ws, { env: { CAD_TRUSTED: path.join(ws, '.trusted.json') } }); // (the user's own trust list, kept out of their home)
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
  const check = () => { const r = runCad(ws, ['check', 'demo/joint', '--json'], { env: { CAD_TRUSTED: path.join(ws, '.trusted.json') } }), findings = findingsOf(r); return { status: r.status, findings, of: (code) => findings.filter((x) => x.code === code), fails: findings.filter((x) => x.level === 'fail').map((x) => x.code) }; };
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

/** A run of the command in a workspace with its exit status kept, whatever it is: runCad with only `env`. */
export const run = (ws, a, env = {}) => runCad(ws, a, { env });
/** A run of the command in a workspace that must succeed (cadIn's cad() with only `env`): its output. */
export const ok = (ws, a, env = {}) => cadIn(ws, { env })(...a);

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
