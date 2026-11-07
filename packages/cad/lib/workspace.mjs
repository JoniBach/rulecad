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

// Trust: a workspace that turns the design sandbox off ("sandbox": false), or runs code of its own as a target (a
// module path rather than one of rulecad's), runs that code in the tool's process. A workspace cloned from elsewhere
// could do that on its first command, so it is asked once: cad trust records this folder, with what it asked for, in
// the user's own list (~/.config/rulecad/trusted.json, or $CAD_TRUSTED); asking for more later is asked again.
import os from 'node:os';
const TRUSTED = () => process.env.CAD_TRUSTED || path.join(os.homedir(), '.config', 'rulecad', 'trusted.json');
/** What this workspace asks to run outside the sandbox: [] when nothing. */
export function asks(cfg = config) {
  const own = Object.entries(cfg.targets || {}).filter(([, v]) => typeof v === 'string' && (v.includes('/') || v.endsWith('.mjs') || v.endsWith('.js'))).map(([k, v]) => `the ${k} target ${v}`);
  return [...(cfg.sandbox === false ? ['designs run outside the sandbox'] : []), ...own].sort();
}
const trustList = () => { try { return JSON.parse(fs.readFileSync(TRUSTED(), 'utf8')); } catch { return {}; } };
/** Whether the user has trusted this workspace for all it asks. */
export const trusted = (cfg = config) => { const a = asks(cfg); if (!a.length || process.env.CAD_TRUST === '1') return true; const t = trustList()[WS]; return !!t && a.every((x) => t.includes(x)); };
/** Trust this workspace for what it asks now. */
export function trust(cfg = config) { const list = trustList(); list[WS] = asks(cfg); fs.mkdirSync(path.dirname(TRUSTED()), { recursive: true }); fs.writeFileSync(TRUSTED(), JSON.stringify(list, null, 2) + '\n'); return list[WS]; }
/** Throws, saying what it asks and how to allow it, when this workspace isn't trusted for what it asks. */
export function needTrust(cfg = config) {
  if (trusted(cfg)) return;
  throw Object.assign(new Error(`this workspace asks for ${asks(cfg).join(' and ')} (cad.config.json). If you trust it, run cad trust once; until then, it isn't done`), { code: 'workspace.untrusted' });
}
