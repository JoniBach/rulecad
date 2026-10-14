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
import { fileURLToPath } from 'node:url';

export const TOOL = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

function find() {
  if (process.env.CAD_WORKSPACE) return path.resolve(process.env.CAD_WORKSPACE);
  for (let dir = process.cwd(); ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'cad.config.json'))) return dir;
    if (dir === path.dirname(dir)) return process.cwd(); // none: where you are
  }
}

export const WS = find();
export const config = (() => {
  const f = path.join(WS, 'cad.config.json');
  return { printer: 'x1c', viewUrl: 'https://jonibach.github.io/mirror-cad-view/', targets: {}, ...(fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {}) };
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
  return (f && fs.existsSync(f) && JSON.parse(fs.readFileSync(f, 'utf8')).printer) || config.printer;
};
