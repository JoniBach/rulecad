// What a change moves in the things the kit's examples draw: every example object (each workspace's projects, in
// examples/ and the create-rulecad template and machines) built at two commits, and each variable's value, each part's
// volume and size, and each hole and seat v.fixings drew that differs, listed as a table for the pull request.
//
//   node scripts/dimension-diff.mjs [from] [to]   from: a commit (HEAD by default); to: a commit, or . for the working
//                                                  tree (the default). Prints the table; exit 0 either way
//     --md            the table as Markdown, for a pull request
//     --json          every difference as JSON
//     --only <text>   only objects whose name (workspace/project/object) holds the text
//     --jobs <n>      builds at once (4)
//     --fail          exit 1 when anything differs (a step that must move nothing)
//
// Fast when nothing changed: an object is known by everything it is built from (the kit's code and rules, its
// workspace's rules and its own project's files, by git's hashes), and its measures are kept in .cache/dimension-diff/
// by that. An object made from the same files at both commits is the same by construction and isn't built at all;
// one built before is read back. Only what changed is built: from a copy of that commit's files under the system's
// temporary folder (git archive, never a worktree), using this checkout's installed dependencies.
//
// Memory: a cold build of the showcase's optimisations and the launcher's staged physics is the slow and large part
// (one optimisation held 3.5 GB within four minutes on a laptop, most of it outside the V8 heap, so a heap cap does not
// bound it). So those results, which cad keys by the code and the inputs that decide them, are shared by both commits
// and kept between runs (.cache/dimension-diff/slow/); and a worker whose memory has passed DIMENSION_DIFF_RSS_MB
// (2048 by default) after a build hands the rest of its list to a fresh one, so no build carries an earlier one's.
// One build can still outgrow the machine on its own: a thread in each worker reads the process's memory every 0.2 s
// (it runs while the build holds the main thread) and stops the worker past DIMENSION_DIFF_LIMIT_MB (by default half
// the machine's memory, shared by the --jobs workers). That object is reported "not measured" with the memory it held, kept so
// later runs at the same limit skip it, and the rest of the list goes on in a fresh worker. A lost runner keeps
// nothing, where a stopped build costs one object.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';

export const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '');
const SCOPE = ['packages', 'examples', 'package.json', 'package-lock.json'];
const git = (args, input) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28, ...(input != null ? { input } : {}) });
const sha = (x) => crypto.createHash('sha256').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex');

/**
 * A commit's files in scope, as git knows them: path to blob hash. "." is the working tree (what git tracks, and new
 * files it doesn't ignore), hashed as git would.
 * @param {string} rev @returns {Map<string, string>}
 */
export function treeOf(rev) {
  const out = new Map();
  if (rev === '.') {
    const files = git(['ls-files', '-co', '--exclude-standard', '--', ...SCOPE]).split('\n').filter((f) => f && fs.existsSync(path.join(ROOT, f)) && fs.statSync(path.join(ROOT, f)).isFile());
    const blobs = git(['hash-object', '--stdin-paths'], files.join('\n') + '\n').split('\n');
    files.forEach((f, i) => out.set(f, blobs[i]));
  } else for (const line of git(['ls-tree', '-r', rev, '--', ...SCOPE]).split('\n')) { const m = line.match(/^\d+ blob (\w+)\t(.+)$/); if (m) out.set(m[2], m[1]); }
  return out;
}

// A workspace: a folder with projects/ that cad builds in (examples/*, the template, each machine)
const isWorkspaceFile = (f) => /^(examples\/[^/]+|packages\/create-rulecad\/template|packages\/create-rulecad\/machines\/[^/]+)\//.test(f);
const workspaceOf = (f) => f.match(/^(examples\/[^/]+|packages\/create-rulecad\/template|packages\/create-rulecad\/machines\/[^/]+)\//)?.[1];
// What builds read of the kit: its packages' code and rules, not their tests, documents or the viewer's site
const isKit = (f) => (f.startsWith('packages/') && !isWorkspaceFile(f) && !/(^|\/)test[^/]*\.mjs$|\.test\.mjs$|\.md$|\/docs\/|^packages\/viewer\/|^packages\/[^/]+\/drawings\//.test(f)) || f === 'package-lock.json';

/**
 * Every example object in a tree, each with the key of everything it is built from.
 * @param {Map<string, string>} tree @returns {{ id: string, ws: string, project: string, name: string, key: string }[]}
 */
export function objectsOf(tree) {
  const files = [...tree.keys()].sort(), kit = sha(files.filter(isKit).map((f) => `${f} ${tree.get(f)}`));
  const part = (pick) => sha(files.filter(pick).map((f) => `${f} ${tree.get(f)}`));
  const out = [];
  for (const f of files) {
    const m = f.match(/^(.+)\/projects\/([^/]+)\/objects\/([^/]+)\.json$/);
    if (!m || workspaceOf(f) !== m[1] || !tree.has(f.replace(/\.json$/, '.js'))) continue;
    const [, ws, project, name] = m, home = `${ws}/`, own = `${ws}/projects/${project}/`;
    const key = sha([kit, part((x) => x.startsWith(home) && !x.startsWith(`${home}projects/`)), part((x) => x.startsWith(own)), name]);
    out.push({ id: `${ws}/${project}/${name}`, ws, project, name, key });
  }
  return out;
}

// ---------- measuring a build (in a worker, one workspace at a time) ----------
const r4 = (x) => Math.round(x * 1e4) / 1e4;
function volumeOf(tris) { let V = 0; for (const [a, b, c] of tris) V += (a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6; return Math.abs(V); }
function boxOf(tris) { const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; for (const t of tris) for (const p of t) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); } return lo[0] === Infinity ? null : hi.map((h, k) => r4(h - lo[k])); }
/** What a build is measured by: its own variables' values, each part's volume and size, and each hole and seat v.fixings drew. */
export function measure(b) {
  const values = {};
  for (const e of b.entries || []) { const v = b.values[e.name]; if (typeof v === 'number' && Number.isFinite(v)) values[e.name] = r4(v); }
  const parts = Object.fromEntries((b.parts || []).map((p) => [p.name, { volume: Math.round(volumeOf(p.triangles) * 100) / 100, size: boxOf(p.triangles) }]));
  const fixings = (b.fixings || []).filter((x) => x.values && typeof x.values === 'object').map((x) => `${x.code}: ${JSON.stringify(Object.fromEntries(Object.entries(x.values).filter(([, v]) => typeof v === 'number').map(([k, v]) => [k, r4(v)])))}`).sort();
  return { values, parts, ...(fixings.length ? { fixings } : {}) };
}

// The memory, in MB, past which a worker stops after its build and a fresh one takes the rest of its list
const rssBudget = () => Number(process.env.DIMENSION_DIFF_RSS_MB || 2048);
/** The memory, in MB, past which one worker is stopped mid-build: DIMENSION_DIFF_LIMIT_MB, or half the machine's shared by the jobs. @param {number} [jobs] */
export const memoryLimit = (jobs = 1) => Number(process.env.DIMENSION_DIFF_LIMIT_MB) || Math.floor(os.totalmem() / 1048576 / 2 / Math.max(1, jobs));
// the watchdog: a thread of the worker's own, so it reads the memory while a build (an optimisation, WASM) holds the main thread
// (it reads once before the worker builds anything, so a limit below a bare Node process stops it at once)
const WATCH = `const { workerData: { limit, out }, parentPort } = require('node:worker_threads'), fs = require('node:fs');
const look = () => { const rss = process.memoryUsage.rss(); if (rss > limit * 1048576) { fs.writeSync(out, JSON.stringify({ stopped: Math.round(rss / 1048576), limit }) + '\\n'); process.kill(process.pid, 'SIGKILL'); } };
look(); parentPort.postMessage('watching'); setInterval(look, 200);`;
async function worker(dir, names) {
  const watch = new Worker(WATCH, { eval: true, workerData: { limit: memoryLimit(), out: 1 } }); await new Promise((ok) => watch.once('message', ok)); watch.unref();
  const { build, locate } = await import(pathToFileURL(path.join(dir, 'packages/cad/lib/design.mjs')).href);
  const log = console.log; console.log = console.error; // (a design's own logging stays off the results)
  for (const n of names) {
    let r;
    try { r = measure(await build(locate(n))); } catch (e) { r = { error: String(e?.message || e).split('\n')[0].slice(0, 200) }; }
    log(JSON.stringify({ n, r }));
    if (process.memoryUsage().rss > rssBudget() * 1048576) { log(JSON.stringify({ restart: true })); process.exit(0); } // (the WASM memory a build grew is never given back)
  }
}

// ---------- a commit's files, built ----------
const TMP = path.join(os.tmpdir(), 'rulecad-dimension-diff');
// The slow results cad keeps by what decides them (an optimisation's densities: the problem, topopt's solver, the FE's
// code with its threads backend and cad's own code that readies the problem, cad's densitiesKey; a lamina's stages:
// every module of flexures and of the FE and the stage's inputs), so the same in any commit
// that has the same of each: shared by every commit's copy, and kept between runs
export const SHARED = ['densities', 'stages'];
const linkShared = (dir, tree, slow) => {
  for (const ws of new Set([...tree.keys()].map(workspaceOf).filter(Boolean))) for (const kind of SHARED) {
    const at = path.join(dir, ws, '.cache', kind), to = path.join(slow, kind);
    fs.mkdirSync(to, { recursive: true }); fs.mkdirSync(path.dirname(at), { recursive: true });
    let was = null; try { was = fs.lstatSync(at); } catch {}
    if (was?.isSymbolicLink()) { try { fs.unlinkSync(at); } catch { fs.rmdirSync(at); } } else if (was) fs.rmSync(at, { recursive: true, force: true }); // (a copy made with another shared folder, or none)
    fs.symlinkSync(to, at, 'junction');
  }
};
/**
 * A copy of a tree's files, with this checkout's dependencies linked in, the tree's own packages as @rulecad/*, and
 * each workspace's slow results (SHARED) linked to one folder.
 * @param {string} rev @param {Map<string, string>} tree @param {string} slow the shared folder @returns {string} the copy
 */
export function materialise(rev, tree, slow) {
  const dir = path.join(TMP, sha([...tree].sort()).slice(0, 16)), done = path.join(dir, '.complete');
  if (fs.existsSync(done)) { linkShared(dir, tree, slow); return dir; }
  fs.mkdirSync(dir, { recursive: true });
  if (rev === '.') for (const f of tree.keys()) { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.copyFileSync(path.join(ROOT, f), path.join(dir, f)); }
  else execFileSync('tar', ['-x', '-f', '-', '-C', dir], { input: execFileSync('git', ['archive', '--format=tar', rev, '--', ...SCOPE.filter((s) => [...tree.keys()].some((f) => f === s || f.startsWith(`${s}/`)))], { cwd: ROOT, maxBuffer: 1 << 30 }), maxBuffer: 1 << 30 });
  const link = (to, at) => { if (!fs.existsSync(at)) fs.symlinkSync(to, at, 'junction'); };
  const nm = path.join(dir, 'node_modules'); fs.mkdirSync(path.join(nm, '@rulecad'), { recursive: true });
  for (const e of fs.readdirSync(path.join(ROOT, 'node_modules'))) if (!['@rulecad', '.bin', '.package-lock.json'].includes(e)) link(path.join(ROOT, 'node_modules', e), path.join(nm, e));
  for (const p of fs.readdirSync(path.join(dir, 'packages'))) {
    const pj = path.join(dir, 'packages', p, 'package.json');
    if (fs.existsSync(pj)) link(path.join(dir, 'packages', p), path.join(nm, JSON.parse(fs.readFileSync(pj, 'utf8')).name));
    const own = path.join(ROOT, 'packages', p, 'node_modules'); // (a package's own copy of a dependency, as npm placed it)
    if (fs.existsSync(own)) link(own, path.join(dir, 'packages', p, 'node_modules'));
  }
  linkShared(dir, tree, slow);
  fs.writeFileSync(done, rev);
  return dir;
}

/**
 * Builds a workspace's objects in workers: one, and a fresh one for the rest whenever a worker stops for its memory.
 * @param {string} dir a commit's copy @param {string} ws @param {string[]} names project/object
 * @param {(n: string, r: object) => void} [each] @param {number} [limit] MB past which a worker is stopped mid-build
 * @returns {Promise<Map<string, object> & { workers: number }>}
 */
export async function run(dir, ws, names, each = () => {}, limit = memoryLimit()) {
  const out = new Map(); let workers = 0;
  for (let left = names; left.length;) {
    workers++;
    const restart = await new Promise((resolve) => {
      const home = path.join(dir, ws), env = { ...process.env, DIMENSION_DIFF_LIMIT_MB: String(limit), CAD_WORKSPACE: home, CAD_TRUST: '1', CAD_TRUSTED: path.join(dir, '.trusted.json') };
      const p = spawn(process.execPath, [fileURLToPath(import.meta.url), '--worker', dir, ...left], { cwd: home, env, stdio: ['ignore', 'pipe', 'ignore'] });
      let buf = '', again = false;
      // a worker stopped for its memory: the object it was building (the first of its list not yet measured) is not
      // measured, and a fresh worker takes the rest
      const stopped = (m) => { const n = left.find((x) => !out.has(x)); if (n) { const r = { error: `not measured: its build passed ${m.limit} MB (it held ${m.stopped} MB when stopped; DIMENSION_DIFF_LIMIT_MB)`, memory: m.limit }; out.set(n, r); each(n, r); } again = true; };
      p.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); try { const m = JSON.parse(line); if (m.restart) again = true; else if (m.stopped) stopped(m); else { out.set(m.n, m.r); each(m.n, m.r); } } catch {} } });
      p.on('close', (code) => { if (!again) for (const n of left) if (!out.has(n)) out.set(n, { error: `the build stopped (exit ${code})` }); resolve(again); });
    });
    left = restart ? left.filter((n) => !out.has(n)) : [];
  }
  return Object.assign(out, { workers });
}

/**
 * Each object's measures at a commit: from the cache by its key, else built.
 * @param {string} rev @param {{ only?: string, jobs?: number, cache?: string, say?: (s: string) => void, skip?: Set<string> }} [o]
 *   skip: keys not to build (made from the same files on the other side: the same by construction)
 * @returns {Promise<{ objects: ReturnType<typeof objectsOf>, measures: Map<string, object>, built: number }>}
 */
export async function measuresAt(rev, { only, jobs = 4, cache = path.join(ROOT, '.cache', 'dimension-diff'), say = () => {}, skip = new Set() } = {}) {
  const tree = treeOf(rev), objects = objectsOf(tree).filter((o) => !only || o.id.includes(only)), measures = new Map();
  fs.mkdirSync(cache, { recursive: true });
  const kept = (o) => path.join(cache, `${o.key}.json`), limit = memoryLimit(jobs);
  // (an object stopped for its memory is kept too: built again only with more memory than it was stopped at)
  for (const o of objects) if (fs.existsSync(kept(o))) { const r = JSON.parse(fs.readFileSync(kept(o), 'utf8')); if (!(r.memory < limit)) measures.set(o.id, r); }
  const due = objects.filter((o) => !measures.has(o.id) && !skip.has(o.key));
  if (due.length) {
    say(`building ${due.length} of ${objects.length} objects at ${rev}`);
    const dir = materialise(rev, tree, path.join(cache, 'slow')), queue = [];
    // a few workers, each in one workspace (the workspace is where cad looks for rules), each given a share of it
    const byWs = Map.groupBy ? Map.groupBy(due, (o) => o.ws) : due.reduce((m, o) => m.set(o.ws, [...(m.get(o.ws) || []), o]), new Map());
    for (const [ws, list] of byWs) { const n = Math.max(1, Math.min(jobs, Math.ceil(list.length / 8))); for (let i = 0; i < n; i++) queue.push({ ws, list: list.filter((_, k) => k % n === i) }); }
    // (each kept as it comes, so a run that is stopped keeps what it built)
    let n = 0, t = Date.now();
    const keep = (o, r) => { measures.set(o.id, r); if (!r.error || r.memory) fs.writeFileSync(kept(o), JSON.stringify(r)); n++; if (Date.now() - t > 30000 || n === due.length) { t = Date.now(); say(`  ${n} of ${due.length} built at ${rev}`); } };
    const go = async () => { for (let q; (q = queue.shift());) { const at = new Map(q.list.map((o) => [`${o.project}/${o.name}`, o])); const got = await run(dir, q.ws, [...at.keys()], (n, r) => keep(at.get(n), r), limit); for (const [n, o] of at) if (!measures.has(o.id)) keep(o, got.get(n)); } };
    await Promise.all(Array.from({ length: Math.max(1, jobs) }, go));
    // a failure is built again once, alone in its workspace: workers sharing a workspace can meet as cad copies a kit
    // rule set into its rules/ (one reads the file while the other writes it); a real failure fails again
    // (one stopped for its memory would only be stopped again)
    const again = due.filter((o) => measures.get(o.id)?.error && !measures.get(o.id).memory), byWs2 = again.reduce((m, o) => m.set(o.ws, [...(m.get(o.ws) || []), o]), new Map());
    for (const [ws, list] of byWs2) { const at = new Map(list.map((o) => [`${o.project}/${o.name}`, o])); n -= list.length; const got = await run(dir, ws, [...at.keys()], (k, r) => keep(at.get(k), r)); for (const [k, o] of at) if (got.get(k)?.error) keep(o, got.get(k)); }
  }
  return { objects, measures, built: due.length };
}

const same = (a, b) => (a === b) || (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b)));
const shown = (x) => (x == null ? '(none)' : Array.isArray(x) ? x.join(' × ') : typeof x === 'object' ? JSON.stringify(x) : String(x));
/**
 * Every measure that differs between two sets of measures, object by object.
 * @param {{ objects: { id: string, key: string }[], measures: Map<string, object> }} a @param {typeof a} b
 * @returns {{ rows: { object: string, what: string, from: string, to: string }[], same: number, unchanged: number }}
 *   unchanged: objects built from the same files at both (not compared, the same by construction)
 */
export function compare(a, b) {
  const rows = [], keyA = new Map(a.objects.map((o) => [o.id, o.key])), keyB = new Map(b.objects.map((o) => [o.id, o.key]));
  let unchanged = 0, alike = 0;
  for (const id of [...new Set([...keyA.keys(), ...keyB.keys()])].sort()) {
    if (keyA.get(id) && keyA.get(id) === keyB.get(id)) { unchanged++; continue; }
    const x = a.measures.get(id), y = b.measures.get(id), add = (what, from, to) => rows.push({ object: id, what, from: shown(from), to: shown(to) }), before = rows.length;
    if (!x || !y) { add('the object', x ? 'built' : '(none)', y ? 'built' : '(none)'); continue; }
    if (x.error || y.error) { if (x.error !== y.error) add('the build', x.error ? `fails: ${x.error}` : 'builds', y.error ? `fails: ${y.error}` : 'builds'); continue; }
    for (const n of [...new Set([...Object.keys(x.values), ...Object.keys(y.values)])].sort()) if (!same(x.values[n], y.values[n])) add(n, x.values[n], y.values[n]);
    for (const p of [...new Set([...Object.keys(x.parts), ...Object.keys(y.parts)])].sort()) {
      const [px, py] = [x.parts[p], y.parts[p]];
      if (!px || !py) { add(`part ${p}`, px ? 'drawn' : '(none)', py ? 'drawn' : '(none)'); continue; }
      if (!same(px.volume, py.volume) && Math.abs(px.volume - py.volume) > 0.01) add(`part ${p} volume (mm³)`, px.volume, py.volume);
      if ((px.size || []).some((s, k) => !same(s, py.size?.[k]))) add(`part ${p} size (mm)`, px.size, py.size);
    }
    const fx = x.fixings || [], fy = y.fixings || [];
    for (const f of fx.filter((s) => !fy.includes(s))) add('v.fixings drew', f, '(no longer)');
    for (const f of fy.filter((s) => !fx.includes(s))) add('v.fixings drew', '(none)', f);
    if (rows.length === before) alike++;
  }
  return { rows, same: alike, unchanged };
}

const flag = (f) => process.argv.includes(f), opt = (f) => { const i = process.argv.indexOf(f); return i > 0 ? process.argv[i + 1] : undefined; };
if (process.argv[2] === '--worker') await worker(process.argv[3], process.argv.slice(4));
else if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const pos = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !['--only', '--jobs'].includes(all[i - 1]));
  const [from = 'HEAD', to = '.'] = pos, known = (r) => r === '.' || (!/^0+$/.test(r) && (() => { try { git(['rev-parse', '--verify', '--quiet', `${r}^{commit}`]); return true; } catch { return false; } })());
  for (const r of [from, to]) if (!known(r)) { console.log(`No commit ${r} to compare with: nothing to diff.`); process.exit(0); }
  const o = { only: opt('--only'), jobs: Number(opt('--jobs') || 4), say: (s) => console.error(s) };
  const t0 = Date.now(), there = new Set(objectsOf(treeOf(to)).map((x) => x.key)), both = new Set(objectsOf(treeOf(from)).map((x) => x.key).filter((k) => there.has(k)));
  const a = await measuresAt(from, { ...o, skip: both }), b = await measuresAt(to, { ...o, skip: both }), { rows, same: alike, unchanged } = compare(a, b);
  const head = `${a.objects.length} objects at ${from}, ${b.objects.length} at ${to}: ${unchanged} built from the same files, ${alike} rebuilt alike, ${new Set(rows.map((r) => r.object)).size} differ (${a.built + b.built} built, ${((Date.now() - t0) / 1000).toFixed(1)} s)`;
  if (flag('--json')) console.log(JSON.stringify({ from, to, unchanged, same: alike, rows }, null, 2));
  else if (flag('--md')) console.log([`Dimension diff, ${from} to ${to}: ${head}.`, '', ...(rows.length ? ['| Object | What | From | To |', '|---|---|---|---|', ...rows.map((r) => `| ${r.object} | ${r.what} | ${r.from} | ${r.to} |`)] : ['Nothing drawn differs.'])].join('\n'));
  else { for (const r of rows) console.log(`${r.object}  ${r.what}: ${r.from} -> ${r.to}`); console.log(head); }
  if (flag('--fail') && rows.length) process.exitCode = 1;
}
