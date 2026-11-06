// Where things are. The tool (TOOL: this package: lib/, templates/) and the workspace (WS: your projects, your rules,
// and what's generated) are separate folders.
//   The workspace is $CAD_WORKSPACE, else the nearest folder at or above the current one with a cad.config.json, else
//   the current folder.
//   cad.config.json: { "printer": "x1c", "viewUrl": "https://…/", "targets": { "show": "targets/show.mjs", "shorten": "gist" } }
//     printer   the rule set a print is checked against (bed, overhang, bridges); a project.json's "printer" wins
//     viewUrl   the model page that links open (the public one by default: it reads links as data, nothing is uploaded)
//     targets   optional extras: show (put a model on display: a module of your own) and shorten (short links: "gist")
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
