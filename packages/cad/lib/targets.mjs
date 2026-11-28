// Targets: optional extras the command hands work to, named in cad.config.json's "targets". A name is either exactly one
// of the kit's own (OWN_TARGETS in workspace.mjs: today only "gist"), or a module path inside the workspace, so anyone
// can add their own (a smart mirror, a slicer, a printer). Every name but the kit's own is the workspace's code: it runs
// in the tool's process, so only once the workspace is trusted (cad trust), and never from outside the workspace. No
// path is ever made from a name to find one of the kit's own.
//   show:    export async function show({ title, ttl, mesh, card }) puts a model somewhere to look at.
//              mesh: { polygons } (one solid) or { shapes, place } (each shape once, then a 3 × 4 transform per copy);
//              card: { title, items } (short lines) to go with it
//   shorten: export async function shorten(data, { desc }) stores a model link's data and returns an ID for #s=<id>
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { WS, config, needTrust, isOwnTarget, OWN_TARGETS } from './workspace.mjs';

/** Whether cad.config.json names a target of this kind ("show", "shorten"). */
export const hasTarget = (kind) => !!config.targets?.[kind];

/**
 * The function a target of this kind exports, loaded: one of the kit's own by its exact name, else the workspace's own
 * module, once the workspace is trusted and only from inside it.
 * @param {string} kind "show" or "shorten"
 * @returns {Promise<Function>}
 */
export async function target(kind) {
  const name = config.targets?.[kind];
  if (!name) throw new Error(`no "${kind}" target: name one in cad.config.json ("targets": { "${kind}": … })`);
  let href;
  if (isOwnTarget(name)) href = OWN_TARGETS[name];
  else {
    needTrust(); // (the workspace's own code, run in the tool's process: only once it is trusted)
    if (typeof name !== 'string') throw new Error(`the ${kind} target in cad.config.json should be the name of a module file, not ${JSON.stringify(name)}`);
    const file = path.resolve(WS, name), rel = path.relative(WS, file);
    if (!rel || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
      throw Object.assign(new Error(`the ${kind} target ${name} (cad.config.json) is outside this workspace (${WS}), so it isn't run. Put the module in the workspace's folder and name it from there`), { code: 'workspace.outside' });
    }
    href = pathToFileURL(file).href;
  }
  const mod = await import(href);
  if (typeof mod[kind] !== 'function') throw new Error(`target ${name} has no ${kind}()`);
  return mod[kind];
}
