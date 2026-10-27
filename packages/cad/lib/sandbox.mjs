// Designs are code. A JSCAD design runs in a sandbox: another Node process with the permission model on, so it can
// read the workspace and the tool's packages but can't write files, start programs or workers, or load addons; an
// import hook (sandbox-hooks.mjs) lets a design import only @jscad/modeling, @rulecad/shapes and files in its own
// project (no node: modules, so no network), and the runner removes fetch and its kin. It gets its values as data
// and sends back its parts' faces. A workspace that trusts its designs sets "sandbox": false in cad.config.json (or
// CAD_TRUST=1); Node without the permission model (18) runs designs as before. Board designs (engine pcb) run in the
// tool's own process, with the board engine.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire, registerHooks } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { WS, TOOL, config } from './workspace.mjs';
import { fromFaces } from './parts.mjs';
import { located } from './errors.mjs';

const flag = (() => {
  const f = process.allowedNodeEnvironmentFlags;
  return f.has('--permission') ? '--permission' : f.has('--experimental-permission') ? '--experimental-permission' : null;
})();

const inThread = typeof registerHooks === 'function'; // import hooks in this thread; older Node needs a worker for them

/** Whether designs run sandboxed here. */
export const sandboxed = () => !!flag && process.env.CAD_TRUST !== '1' && config.sandbox !== false;

// What the sandbox may read: the workspace, and the packages designs and the runner load (wherever npm put them)
function readable() {
  const real = (p) => { try { return fs.realpathSync(p); } catch { return null; } };
  const pkgDir = (name, from) => { // the package's folder: from its entry up to its package.json (exports may hide that file)
    try { let d = path.dirname(createRequire(from).resolve(name)); while (!fs.existsSync(path.join(d, 'package.json')) && path.dirname(d) !== d) d = path.dirname(d); return d; } catch { return null; }
  };
  const fromWs = path.join(WS, 'package.json'), fromTool = path.join(TOOL, 'package.json');
  // Every node_modules above the workspace and the tool (package lookups read their links), and where links lead
  const up = (dir) => { const out = []; for (let d = dir; ; d = path.dirname(d)) { out.push(path.join(d, 'node_modules')); if (path.dirname(d) === d) return out; } };
  const dirs = [WS, TOOL, ...[...up(WS), ...up(TOOL)].filter((d) => fs.existsSync(d)),
    ...['@jscad/modeling', '@rulecad/shapes', '@rulecad/variables'].flatMap((n) => [pkgDir(n, fromWs), pkgDir(n, fromTool)])];
  return [...new Set(dirs.filter(Boolean).flatMap((d) => [d, real(d)]).filter(Boolean))];
}

/**
 * Run a design's main(values) in the sandbox: { parts, read } as the build makes them.
 * @param {{ js: string }} d the design @param {object} values @param {object} meta the .json's parts
 */
export function runSandboxed(d, values, meta) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const args = [flag, ...readable().map((p) => `--allow-fs-read=${p}`), ...(inThread ? [] : ['--allow-worker']), '--import', pathToFileURL(path.join(here, 'sandbox-preload.mjs')).href, path.join(here, 'sandbox-run.mjs')];
  const project = pathToFileURL(path.dirname(path.dirname(d.js)) + path.sep).href;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, CAD_SANDBOX_PROJECT: project } });
    const out = [], err = [];
    child.stdout.on('data', (b) => out.push(b));
    child.stderr.on('data', (b) => err.push(b));
    child.on('error', reject);
    child.on('close', () => {
      let r;
      try { r = JSON.parse(Buffer.concat(out).toString('utf8')); } catch {
        return reject(located(new Error(`the design's sandbox stopped: ${Buffer.concat(err).toString('utf8').trim().split('\n').slice(-3).join(' ') || 'no output'}`), d.js, 'design.sandbox'));
      }
      if (r.error) return reject(located(Object.assign(new Error(r.error.message), { code: r.error.code }), d.js, r.error.code || 'design.run'));
      resolve({ parts: r.parts.map(({ solid, ...p }) => ({ ...p, geometry: fromFaces(solid) })), read: new Set(r.read) });
    });
    child.stdin.end(JSON.stringify({ js: `${pathToFileURL(d.js).href}?t=${fs.statSync(d.js).mtimeMs}`, values, meta }));
  });
}
