// Designs are code. A JSCAD design runs in a sandbox: another Node process with the permission model on. What that
// promises, whatever the design does: it can't write or delete files, start programs or workers, or load addons, and
// it reads only the workspace and the packages designs use. That much is Node's own boundary.
// On top of it, to keep a design to making shapes: an import hook (sandbox-hooks.mjs) lets it import only
// @jscad/modeling, @rulecad/shapes, @rulecad/flexures and files in its own project (no node: modules); the runner
// takes away fetch and its kin and process's own ways to Node's modules; and it is started with none of this
// process's environment (no tokens). Those close the ordinary roads to the network, not every one: before Node 25
// the permission model doesn't cover the network, so a design written to get round them might still reach it, and
// read the workspace as it does. So: run only designs you trust, as with any code.
// It gets its values as data and sends back its parts' faces. A workspace that trusts its designs sets
// "sandbox": false in cad.config.json (or CAD_TRUST=1). Board designs (engine pcb) run in the tool's own process,
// with the board engine.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import * as nodeModule from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { WS, TOOL, config, paths, trusted } from './workspace.mjs';
import { fromFaces } from './parts.mjs';
import { located } from './errors.mjs';

const flag = (() => {
  const f = process.allowedNodeEnvironmentFlags;
  return f.has('--permission') ? '--permission' : f.has('--experimental-permission') ? '--experimental-permission' : null;
})();

const inThread = typeof nodeModule.registerHooks === 'function'; // import hooks in this thread; older Node needs a worker for them

/** Whether designs run sandboxed here. */
// (a workspace's "sandbox": false counts only once the user has trusted it: cad trust)
export const sandboxed = () => !!flag && process.env.CAD_TRUST !== '1' && !(config.sandbox === false && trusted());

// What the sandbox may read: the workspace, and the packages designs and the runner load (wherever npm put them)
function readable() {
  const real = (p) => { try { return fs.realpathSync(p); } catch { return null; } };
  const pkgDir = (name, from) => { // the package's folder: from its entry up to its package.json (exports may hide that file)
    try { let d = path.dirname(nodeModule.createRequire(from).resolve(name)); while (!fs.existsSync(path.join(d, 'package.json')) && path.dirname(d) !== d) d = path.dirname(d); return d; } catch { return null; }
  };
  const fromWs = path.join(WS, 'package.json'), fromTool = path.join(TOOL, 'package.json');
  // Every node_modules above the workspace and the tool (package lookups read their links), and where links lead
  const up = (dir) => { const out = []; for (let d = dir; ; d = path.dirname(d)) { out.push(path.join(d, 'node_modules')); if (path.dirname(d) === d) return out; } };
  const dirs = [WS, TOOL, ...[...up(WS), ...up(TOOL)].filter((d) => fs.existsSync(d)),
    ...['@jscad/modeling', '@rulecad/shapes', '@rulecad/flexures', '@rulecad/gears', '@rulecad/motors', '@rulecad/rules/x1c.json', '@rulecad/fea', '@rulecad/variables', 'manifold-3d'].flatMap((n) => [pkgDir(n, fromWs), pkgDir(n, fromTool)])];
  return [...new Set(dirs.filter(Boolean).flatMap((d) => [d, real(d)]).filter(Boolean))];
}

// A read the permission model refused, said with what to do. Node names the first path it may not read; when that is
// a link (macOS spells its temporary folders through /tmp and /var, both links into /private), the design's packages
// are reached through a node_modules link spelled through it, which the sandbox follows by its real path and may not.
function refused(e) {
  if (e.code !== 'design.sandbox' || !e.resource) return e.message;
  const res = e.resource, to = (() => { try { return fs.lstatSync(res).isSymbolicLink() ? fs.realpathSync(res) : null; } catch { return null; } })();
  const trust = 'or trust the workspace ("sandbox": false in cad.config.json, then cad trust)';
  return to
    ? `the design's sandbox was refused ${res}, a link to ${to}: something the design loads is reached through it (a node_modules link spelled through ${res}, most likely). Make that link with its real path (ln -s "$(pwd -P)/node_modules"), ${trust}`
    : `the design's sandbox was refused ${res}: a design may read only its workspace and the packages it uses. Keep what it needs inside the workspace, ${trust}`;
}

/**
 * Run a design's main(values) in the sandbox: { parts, read } as the build makes them.
 * @param {{ js: string }} d the design @param {object} values @param {object} meta the .json's parts @param {'jscad' | 'manifold'} [engine] v.ops's booleans
 * @param {string[]} [optional] names main may read that aren't among the values (the display's own inputs)
 * @param {{ salt: string, get: (k: string) => string | undefined, put: (k: string, text: string) => void } | null} [stages] where a lamina's slow stages are kept: the child reads them from the cache (it may read the workspace) and hands back what it made, which is written here
 */
export function runSandboxed(d, values, meta, engine = 'jscad', optional = [], stages = null) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const args = [flag, ...readable().map((p) => `--allow-fs-read=${p}`), ...(inThread ? [] : ['--allow-worker']), '--import', pathToFileURL(path.join(here, 'sandbox-preload.mjs')).href, path.join(here, 'sandbox-run.mjs')];
  // (real paths: Node names an imported file by where it really is, so a workspace reached through a link still matches)
  const js = fs.realpathSync(d.js), project = pathToFileURL(path.dirname(path.dirname(js)) + path.sep).href, stagesDir = paths.cache('stages');
  // The child gets none of this process's environment but what Node needs to start: tokens and keys stay out of it
  const env = Object.fromEntries(['PATH', 'SystemRoot', 'windir', 'TMPDIR', 'TEMP', 'TMP', 'LANG', 'LC_ALL', 'PHYS_DEBUG', 'LAMINA_TIMES'].filter((k) => process.env[k] != null).map((k) => [k, process.env[k]]));
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: ['pipe', 'pipe', 'pipe'], env: { ...env, CAD_SANDBOX_PROJECT: project, NODE_NO_WARNINGS: '1' } }); // (its stderr is passed on: what the design prints, not Node's notes on its own flags)
    const out = [], err = [];
    child.stdout.on('data', (b) => out.push(b));
    child.stderr.on('data', (b) => err.push(b));
    child.on('error', reject);
    child.on('close', () => {
      let r;
      try { r = JSON.parse(Buffer.concat(out).toString('utf8')); } catch {
        return reject(located(new Error(`the design's sandbox stopped: ${Buffer.concat(err).toString('utf8').trim().split('\n').slice(-3).join(' ') || 'no output'}`), d.js, 'design.sandbox'));
      }
      if (err.length) process.stderr.write(Buffer.concat(err)); // what the design printed
      if (r.error) return reject(located(Object.assign(new Error(refused(r.error)), { code: r.error.code, ...(r.error.line ? { line: r.error.line } : {}), ...(r.error.syntax ? { name: 'SyntaxError' } : {}) }), d.js, r.error.code || 'design.run'));
      if (stages) for (const [k, text] of Object.entries(r.stages || {})) stages.put(k, text);
      resolve({ parts: r.parts.map(({ solid, ...p }) => ({ ...p, geometry: fromFaces(solid) })), read: new Set(r.read), mechanism: r.mechanism || null });
    });
    child.stdin.end(JSON.stringify({ js: `${pathToFileURL(js).href}?t=${fs.statSync(js).mtimeMs}`, values, meta, engine, optional, ...(stages ? { stages: { dir: stagesDir, salt: stages.salt } } : {}) }));
  });
}
