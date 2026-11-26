#!/usr/bin/env node
// A release of every package with change notes waiting: run on a branch from main once a batch of PRs has merged, and
// open the result as the release PR (merging it publishes, as any version change on main does).
//
// A PR never edits a package's version, its CHANGELOG's headings or the lockfile: two PRs that both did used to conflict
// on every merge. Instead it adds a note, packages/<name>/changes/<anything>.md:
//
//   ---
//   title: printed bolts into slot nuts      (a few words for the release's heading)
//   bump: patch                              (patch, the default, or minor)
//   ---
//   ### Added
//   - ...
//
// This script, for each package with notes (or an old "## Unreleased" section in its CHANGELOG): the next version
// (minor if any note asks, else patch), one CHANGELOG section headed "## <version>: <titles>" with the notes' entries
// grouped under their ### headings, the notes deleted, and the range of every released package that depends on another
// released one raised to it. A package whose range no longer covers a dependency's new minor is released too, as
// following it. Then the lockfile (npm install), unless --no-install. --dry-run writes nothing and says what it would do.
//   node scripts/release.mjs [--dry-run] [--no-install] [--root <repo>]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCOPE = '@rulecad/';

/** A change note: its front matter (title, bump) and its body. @param {string} text @param {string} [where] */
export function parseNote(text, where = 'a note') {
  const m = text.replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const head = {}, body = (m ? m[2] : text).trim();
  if (m) for (const line of m[1].split('\n')) { const kv = line.match(/^(\w+):\s*(.*)$/); if (kv) head[kv[1]] = kv[2].trim(); }
  const bump = head.bump || 'patch';
  if (!['patch', 'minor'].includes(bump)) throw new Error(`${where}: bump is patch or minor (got ${JSON.stringify(head.bump)})`);
  if (!body) throw new Error(`${where}: no entries under its front matter`);
  return { title: head.title || '', bump, body };
}

/** Notes' bodies grouped under their ### headings, in the order each heading first appears; lines before any heading go
 * under ### Changed. @param {string[]} bodies */
export function groupEntries(bodies) {
  const groups = new Map();
  for (const b of bodies) {
    let at = 'Changed';
    for (const line of b.split('\n')) {
      const h = line.match(/^###\s+(.+?)\s*$/);
      if (h) { at = h[1]; continue; }
      if (!groups.has(at)) groups.set(at, []);
      groups.get(at).push(line);
    }
  }
  return [...groups].map(([h, lines]) => `### ${h}\n\n${lines.join('\n').replace(/^\n+|\n+$/g, '')}`).filter((s) => !/^### .+\n\n$/.test(s)).join('\n\n');
}

/** The next version: 0.7.93 by patch is 0.7.94, by minor 0.8.0. @param {string} v @param {'patch'|'minor'} bump */
export function nextVersion(v, bump) {
  const [a, b, c] = v.split('.').map(Number);
  if (![a, b, c].every(Number.isInteger)) throw new Error(`version ${v} is not major.minor.patch`);
  return bump === 'minor' ? `${a}.${b + 1}.0` : `${a}.${b}.${c + 1}`;
}

// Does a caret range ^x.y.z cover version v? (0.x: same minor; else the same major)
const covers = (range, v) => {
  const m = String(range).match(/^\^(\d+)\.(\d+)\.(\d+)$/); if (!m) return true;
  const [a, b, c] = v.split('.').map(Number), [ra, rb, rc] = m.slice(1).map(Number);
  if (ra === 0) return a === 0 && b === rb && c >= rc;
  return a === ra && (b > rb || (b === rb && c >= rc));
};

/**
 * Plan (and with write, make) the release. @param {string} root the repository
 * @param {{ write?: boolean }} [o]
 * @returns {{ released: { name: string, from: string, to: string, title: string, notes: string[] }[], order: string[] }}
 */
export function release(root, { write = false } = {}) {
  const dirs = fs.readdirSync(path.join(root, 'packages')).filter((d) => fs.existsSync(path.join(root, 'packages', d, 'package.json'))).sort();
  const pkgs = new Map(dirs.map((d) => { const file = path.join(root, 'packages', d, 'package.json'); return [d, { dir: path.join(root, 'packages', d), file, text: fs.readFileSync(file, 'utf8'), json: JSON.parse(fs.readFileSync(file, 'utf8')) }]; }));
  const byName = new Map([...pkgs].map(([d, p]) => [p.json.name, d]));
  const deps = (p) => ({ ...p.json.dependencies, ...p.json.peerDependencies });
  // each package's notes, and an old Unreleased section as one more
  const plan = new Map();
  for (const [d, p] of pkgs) {
    const notesDir = path.join(p.dir, 'changes'), notes = [];
    if (fs.existsSync(notesDir)) for (const f of fs.readdirSync(notesDir).filter((f) => f.endsWith('.md')).sort()) notes.push({ file: path.join(notesDir, f), ...parseNote(fs.readFileSync(path.join(notesDir, f), 'utf8'), `packages/${d}/changes/${f}`) });
    const log = path.join(p.dir, 'CHANGELOG.md'), text = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').replace(/\r\n/g, '\n') : null;
    const un = text?.match(/^## Unreleased(?::\s*(.*))?\n([\s\S]*?)(?=^## |(?![\s\S]))/m);
    if (un && un[2].trim()) notes.push({ unreleased: un[0], title: (un[1] || '').trim(), bump: 'patch', body: un[2].trim() });
    if (notes.length) plan.set(d, { notes, bump: notes.some((n) => n.bump === 'minor') ? 'minor' : 'patch' });
  }
  // a dependent whose range no longer covers a dependency's new version is released too, following it
  for (let changed = true; changed;) {
    changed = false;
    for (const [d, p] of pkgs) {
      if (plan.has(d)) continue;
      for (const [dep, range] of Object.entries(deps(p))) {
        const dd = byName.get(dep), q = dd && plan.get(dd);
        if (q && !covers(range, nextVersion(pkgs.get(dd).json.version, q.bump))) {
          plan.set(d, { notes: [{ title: `follows ${dep} ${nextVersion(pkgs.get(dd).json.version, q.bump)}`, bump: 'patch', body: `### Changed\n\n- Takes ${dep} ${nextVersion(pkgs.get(dd).json.version, q.bump)}.` }], bump: 'patch' });
          changed = true; break;
        }
      }
    }
  }
  const to = new Map([...plan].map(([d, q]) => [d, nextVersion(pkgs.get(d).json.version, q.bump)]));
  // publishing order: dependencies first
  const order = [], seen = new Set();
  const visit = (d) => { if (seen.has(d)) return; seen.add(d); for (const dep of Object.keys(deps(pkgs.get(d)))) { const dd = byName.get(dep); if (dd && to.has(dd)) visit(dd); } order.push(pkgs.get(d).json.name); };
  [...to.keys()].forEach(visit);
  const released = [...plan].map(([d, q]) => ({ name: pkgs.get(d).json.name, from: pkgs.get(d).json.version, to: to.get(d), title: q.notes.map((n) => n.title).filter(Boolean).join('; '), notes: q.notes.filter((n) => n.file).map((n) => path.relative(root, n.file)) }));
  if (!write) return { released, order };
  for (const [d, q] of plan) {
    const p = pkgs.get(d), v = to.get(d), title = q.notes.map((n) => n.title).filter(Boolean).join('; ');
    // the version, and every released dependency's range raised to its new version
    let text = p.text.replace(/("version":\s*")[^"]+"/, `$1${v}"`);
    for (const [dd, dv] of to) text = text.replace(new RegExp(`("${pkgs.get(dd).json.name.replace('/', '\\/')}":\\s*")\\^[^"]+"`, 'g'), `$1^${dv}"`);
    fs.writeFileSync(p.file, text);
    // the CHANGELOG: one section for the release, the Unreleased section (if any) folded into it
    const log = path.join(p.dir, 'CHANGELOG.md');
    let c = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').replace(/\r\n/g, '\n') : `# Changelog: ${p.json.name}\n\n`;
    for (const n of q.notes) if (n.unreleased) c = c.replace(n.unreleased, '');
    const section = `## ${v}${title ? `: ${title}` : ''}\n\n${groupEntries(q.notes.map((n) => n.body))}\n\n`;
    const at = c.search(/^## /m);
    c = at < 0 ? `${c.replace(/\n*$/, '\n\n')}${section}` : c.slice(0, at) + section + c.slice(at);
    fs.writeFileSync(log, c.replace(/\n{3,}/g, '\n\n'));
    for (const n of q.notes) if (n.file) fs.rmSync(n.file);
  }
  return { released, order };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2), at = args.indexOf('--root'), root = at >= 0 ? path.resolve(args[at + 1]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const dry = args.includes('--dry-run'), r = release(root, { write: !dry });
  if (!r.released.length) { console.log('no change notes waiting: nothing to release'); process.exit(0); }
  for (const x of r.released) console.log(`${x.name} ${x.from} -> ${x.to}${x.title ? `: ${x.title}` : ''}${x.notes.length ? ` (${x.notes.length} note${x.notes.length > 1 ? 's' : ''})` : ''}`);
  console.log(`publish in this order: ${r.order.join(', ')}`);
  if (dry) console.log('dry run: nothing written');
  else if (!args.includes('--no-install')) execFileSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: root, stdio: 'inherit' });
}
