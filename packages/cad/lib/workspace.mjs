// Where things are. The tool (TOOL: this package: lib/, templates/) and the workspace (WS: your projects, your rules,
// and what's generated) are separate folders.
//   The workspace is $CAD_WORKSPACE, else the nearest folder at or above the current one with a cad.config.json, else
//   the current folder.
//   cad.config.json: { "printer": "x1c", "viewUrl": "https://…/", "targets": { "show": "targets/show.mjs", "shorten": "gist" } }
//     printer   the rule set a print is checked against (bed, overhang, bridges); a project.json's "printer" wins
//     viewUrl   the model page that links open (the public one by default: it reads links as data, nothing is uploaded)
//     targets   optional extras: show (put a model on display: a module of your own) and shorten (short links: "gist")
import fs from 'node:fs';
import path from 'node:path';
import { host, readJson } from './host.mjs';
import { fileURLToPath } from 'node:url';

export const TOOL = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '');

function find() {
  if (process.env.CAD_WORKSPACE) return path.resolve(process.env.CAD_WORKSPACE);
  for (let dir = process.cwd(); ; dir = path.dirname(dir)) {
    if (host.exists(path.join(dir, 'cad.config.json'))) return dir;
    if (dir === path.dirname(dir)) return process.cwd(); // none: where you are
  }
}

export const WS = find();
// A cad.config.json that doesn't parse is kept as configError for the command to report in its own words: this runs
// as the tool is loaded, where an error would reach a person as a stack trace
export let configError = null;
export const config = (() => {
  const f = path.join(WS, 'cad.config.json');
  let own = {};
  try { if (host.exists(f)) own = readJson(f); } catch (e) { configError = e; }
  return { printer: 'x1c', viewUrl: 'https://jonibach.github.io/rulecad/', targets: {}, ...own };
})();

// Rule sets: the workspace's own first (your copies, with your measurements), then the published ones (@rulecad/rules).
export const RULE_DIRS = [...new Set([path.join(WS, 'rules'), path.dirname(fileURLToPath(import.meta.resolve('@rulecad/rules/x1c.json')))])];

export const paths = {
  projects: path.join(WS, 'projects'),
  project: (p) => path.join(WS, 'projects', p),
  cache: (...p) => path.join(WS, '.cache', ...p),
  preview: (...p) => path.join(WS, '.preview', ...p),
  exports: (...p) => path.join(WS, 'exports', ...p),
  versions: (...p) => path.join(WS, '.versions', ...p),
};

// The printer a project's prints are checked against
export const printerOf = (project) => {
  const f = project && path.join(paths.project(project), 'project.json');
  return (f && host.exists(f) && readJson(f).printer) || config.printer;
};

// Trust: a workspace that turns the design sandbox off ("sandbox": false), runs code of its own as a target (any
// name but one of the kit's own, below), or has board designs (an object whose .json says "engine": "pcb": those run
// with the board engine, in the tool's process) runs that code outside the sandbox. A workspace cloned from elsewhere
// could do that on its first command, so it is asked once: cad trust records this folder, with what it asked for, in
// the user's own list (~/.config/rulecad/trusted.json, or $CAD_TRUSTED); asking for more later is asked again.
import os from 'node:os';
const TRUSTED = () => process.env.CAD_TRUSTED || path.join(os.homedir(), '.config', 'rulecad', 'trusted.json');
// The kit's own targets, by exact name. A target is the kit's own only if its name is a key here, never because of
// what its name looks like or because a file of that name happens to be in the kit: anything else in "targets" (a bare
// name, a path with / or \, a ../ name that reaches one of the kit's modules) is the workspace's code, and asked about.
export const OWN_TARGETS = Object.freeze(Object.assign(Object.create(null), { gist: new URL('./targets/gist.mjs', import.meta.url).href }));
/** Whether a target name in cad.config.json is one of the kit's own (exactly a key of OWN_TARGETS). */
export const isOwnTarget = (name) => typeof name === 'string' && Object.hasOwn(OWN_TARGETS, name);
// Board designs: what asks() says for them, one entry for all of a workspace's boards (a board added later is covered
// by the same answer), and which object files they are. The objects are read once per run (asks() is called on every
// trusted() check), through the host, so a workspace in memory is read too; a board design that build() meets after
// that (one made since, or a release's copy in .versions) is added as it is met (sawBoard), so it is asked about too.
export const BOARDS = 'board designs run outside the sandbox';
const boardScans = new WeakMap(), boardsSeen = new Set(); // (scans by the host they were read through: host.list is the host's own)
const rel = (f) => path.relative(WS, f).split(path.sep).join('/');
/** The workspace's board designs: the object files (projects/<p>/objects/<o>.json) that say "engine": "pcb". */
export function boardDesigns() {
  let scan = boardScans.get(host.list);
  if (!scan) {
    scan = [];
    for (const p of host.list(paths.projects)) {
      const dir = path.join(paths.projects, p, 'objects');
      for (const f of host.list(dir)) {
        if (!f.endsWith('.json')) continue;
        try { if (readJson(path.join(dir, f))?.engine === 'pcb') scan.push(rel(path.join(dir, f))); } catch {} // (a .json that doesn't parse is reported when it is used)
      }
    }
    boardScans.set(host.list, scan);
  }
  return [...new Set([...scan, ...boardsSeen])].sort();
}
/** Note a board design met while building (its object file), so asks() counts it. @param {string} file */
export const sawBoard = (file) => { boardsSeen.add(rel(path.resolve(WS, file))); };
/** What this workspace asks to run outside the sandbox: [] when nothing. */
export function asks(cfg = config) {
  const own = Object.entries(cfg.targets || {}).filter(([, v]) => v && !isOwnTarget(v)).map(([k, v]) => `the ${k} target ${typeof v === 'string' ? v : JSON.stringify(v)}`);
  return [...(cfg.sandbox === false ? ['designs run outside the sandbox'] : []), ...own, ...(boardDesigns().length ? [BOARDS] : [])].sort();
}
const trustList = () => { try { return JSON.parse(fs.readFileSync(TRUSTED(), 'utf8')); } catch { return {}; } };
/** Whether the user has trusted this workspace for all it asks. */
export const trusted = (cfg = config) => { const a = asks(cfg); if (!a.length || process.env.CAD_TRUST === '1') return true; const t = trustList()[WS]; return !!t && a.every((x) => t.includes(x)); };
/** Trust this workspace for what it asks now. */
export function trust(cfg = config) { const list = trustList(); list[WS] = asks(cfg); fs.mkdirSync(path.dirname(TRUSTED()), { recursive: true }); fs.writeFileSync(TRUSTED(), JSON.stringify(list, null, 2) + '\n'); return list[WS]; }
/**
 * Throws, saying what it asks, where it asks it and how to allow it, when this workspace isn't trusted for what it asks.
 * @param {object} [cfg] @param {{ board?: string }} [options] board: the object file of the board design about to run, to name it
 */
export function needTrust(cfg = config, { board } = {}) {
  if (trusted(cfg)) return;
  const what = asks(cfg), fromConfig = what.filter((x) => x !== BOARDS), parts = [];
  if (fromConfig.length) parts.push(`${fromConfig.join(' and ')} (cad.config.json)`);
  if (what.includes(BOARDS)) {
    const files = board ? [rel(path.resolve(WS, board))] : boardDesigns();
    parts.push(`${BOARDS} (${files.slice(0, 3).join(', ')}${files.length > 3 ? ` and ${files.length - 3} more` : ''} ${files.length > 1 ? 'say' : 'says'} "engine": "pcb")`);
  }
  throw Object.assign(new Error(`this workspace asks for ${parts.join(' and ')}. If you trust it, run cad trust once; until then, it isn't done`), { code: 'workspace.untrusted' });
}
