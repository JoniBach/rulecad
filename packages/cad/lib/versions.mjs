// Versions: semver per object, kept as git tags (keyboard/keycap@1.2.0), so any release can be rebuilt exactly.
//   major: an earlier print may no longer fit: an interface variable changed or went away
//   minor: something added that doesn't break fits: a new interface variable or a new tweakable option
//   patch: anything else (print quality, tolerances that aren't interface, the shape's code, the rules it uses)
// A project release (keyboard@1.0.0) records which version of each object it contains.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import { resolve, loadRuleSet } from './rules.mjs';
import { WS, paths } from './workspace.mjs';
import { readLayout, hasLayout } from './layout.mjs';
import { newer } from '@rulecad/versions';

export const git = (...args) => execFileSync('git', args, { cwd: WS, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trimEnd();

// ---------- semver: @rulecad/versions ----------
export { parse, bump, newer, bigger, compare } from '@rulecad/versions';

// ---------- tags ----------
// tags('keyboard', 'keycap') -> releases, oldest first: { version, tag, date, kind, message }. tags('keyboard') -> project releases.
export function tags(project, name) {
  const prefix = name ? `${project}/${name}@` : `${project}@`;
  let out;
  try { out = git('for-each-ref', `refs/tags/${prefix}*`, '--format=%(refname:strip=2)%09%(creatordate:short)%09%(contents:subject)'); }
  catch (e) { if (/not a git repository/.test(e.stderr || e.message)) return []; throw e; } // a workspace outside git: no releases yet
  return out.split('\n').filter(Boolean).map((l) => {
    const [tag, date, subject = ''] = l.split('\t'), [, kind, message] = subject.match(/^(major|minor|patch|first): (.*)$/) || [, '', subject];
    return { tag, version: tag.slice(prefix.length), date, kind, message };
  }).filter((t) => /^\d+\.\d+\.\d+$/.test(t.version)).sort((a, b) => (newer(a.version, b.version) ? 1 : -1));
}

// The layout files an object can pick (its layout variables' choices that are files), by name
const layoutNames = (d, object) => Object.values(object.variables || {}).filter((v) => v.type === 'layout')
  .flatMap((v) => v.choice || [v.value]).filter((n) => hasLayout(d.project, n, d.layoutsDir));

// The files a design depends on, relative to the workspace (its git repo): its .js and .json, the rule sets and the layouts it uses.
// (A board's engine is the tool's code, not the workspace's: its release records engineId() instead.)
export function files(d, object) {
  return [path.relative(WS, d.js), path.relative(WS, d.json), ...(object.uses || []).map((u) => `rules/${u}.json`),
    ...layoutNames(d, object).map((n) => `projects/${d.project}/layouts/${n}.json`)];
}

// A released version's files, written under .versions/ so its imports still find node_modules. -> a design to build
export function materialise(d, version) {
  const tag = `${d.project}/${d.name}@${version}`;
  try { git('rev-parse', '--verify', `refs/tags/${tag}`); } catch { throw new Error(`no release ${tag} (releases: ${tags(d.project, d.name).map((t) => t.version).join(', ') || 'none'})`); }
  const base = paths.versions(d.project, `${d.name}@${version}`);
  const show = (rel) => git('show', `${tag}:${rel}`);
  const object = JSON.parse(show(path.relative(WS, d.json)));
  fs.mkdirSync(path.join(base, 'rules'), { recursive: true });
  const js = path.join(base, `${d.name}.js`), json = path.join(base, `${d.name}.json`);
  fs.writeFileSync(js, show(path.relative(WS, d.js)));
  fs.writeFileSync(json, JSON.stringify(object, null, 2));
  for (const u of object.uses || []) fs.writeFileSync(path.join(base, 'rules', `${u}.json`), show(`rules/${u}.json`));
  // The layouts it could pick, as they were then (only files that existed in that release)
  fs.mkdirSync(path.join(base, 'layouts'), { recursive: true });
  for (const v of Object.values(object.variables || {})) if (v.type === 'layout') for (const n of v.choice || [v.value]) {
    try { fs.writeFileSync(path.join(base, 'layouts', `${n}.json`), show(`projects/${d.project}/layouts/${n}.json`)); } catch {} // a built-in (grid)
  }
  return { ...d, js, json, rulesDir: path.join(base, 'rules'), layoutsDir: path.join(base, 'layouts'), version, tag };
}

// ---------- what changed: compare() is @rulecad/versions' (exported above) ----------

// The board engine's identity: its code and the tscircuit it runs on. A board's release tag records it ("engine: …").
// A package's version, from the package.json above its entry point (some packages don't export their package.json).
// from: where to look from (a file URL), when it's another package's dependency, as tscircuit is the board engine's
export function packageVersion(name, from = import.meta.url) {
  for (let dir = path.dirname(createRequire(from).resolve(name)); dir !== path.dirname(dir); dir = path.dirname(dir)) {
    const f = path.join(dir, 'package.json');
    if (fs.existsSync(f)) { const pj = JSON.parse(fs.readFileSync(f, 'utf8')); if (pj.name === name) return pj.version; }
  }
  return '';
}
const tscircuitVersion = () => packageVersion('tscircuit', import.meta.resolve('@rulecad/pcb'));
const engineHash = (code) => crypto.createHash('sha256').update(`${code.trimEnd()}\n${tscircuitVersion()}`).digest('hex').slice(0, 16);
export const engineId = () => engineHash(fs.readFileSync(new URL(import.meta.resolve('@rulecad/pcb')), 'utf8'));
// From a tag's message, or for releases before tags recorded it, from the engine's code in the repo at the tag
function taggedEngine(tag) {
  const m = git('tag', '-l', '--format=%(contents)', tag).match(/^engine: (\w+)$/m);
  if (m) return m[1];
  try { return engineHash(git('show', `${tag}:lib/pcb.mjs`)); } catch { return ''; } // (the engine once lived in the workspace)
}

// Resolve a design as it is on disk, or as materialised from a release.
export function snapshot(d) {
  const object = JSON.parse(fs.readFileSync(d.json, 'utf8'));
  const sets = d.rulesDir ? Object.fromEntries((object.uses || []).map((u) => [u, loadRuleSet(u, d.rulesDir)])) : {};
  const layouts = Object.fromEntries(layoutNames(d, object).map((n) => [n, readLayout(d.project, n, d.layoutsDir)]));
  // A board is also made by the board engine (footprints, the router): which engine, as recorded at the release
  const engine = object.engine === 'pcb' ? (d.tag ? taggedEngine(d.tag) : engineId()) : null;
  return { object, entries: resolve(object, { sets }).entries, js: fs.readFileSync(d.js, 'utf8'), layouts, ...(engine != null ? { engine } : {}) };
}

// ---------- prints log ----------
// projects/<project>/prints.jsonl: one JSON object a line: { date, object, version, set, material, result, note }
export const printsFile = (d) => path.join(d.dir, 'prints.jsonl');
export function prints(d) {
  const f = printsFile(d);
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((p) => !d.name || p.object === d.name);
}
