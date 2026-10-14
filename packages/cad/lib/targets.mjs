// Targets: optional extras the command hands work to, named in cad.config.json's "targets". A name is one of lib/targets/
// (gist) or a module path relative to the workspace, so anyone can add their own (a smart mirror, a slicer, a printer).
//   show:    export async function show({ title, ttl, mesh, card }) puts a model somewhere to look at.
//              mesh: { polygons } (one solid) or { shapes, place } (each shape once, then a 3 × 4 transform per copy);
//              card: { title, items } (short lines) to go with it
//   shorten: export async function shorten(data, { desc }) stores a model link's data and returns an ID for #s=<id>
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { WS, config } from './workspace.mjs';

export const hasTarget = (kind) => !!config.targets?.[kind];

export async function target(kind) {
  const name = config.targets?.[kind];
  if (!name) throw new Error(`no "${kind}" target: name one in cad.config.json ("targets": { "${kind}": … })`);
  const own = new URL(`./targets/${name}.mjs`, import.meta.url);
  const mod = await import(fs.existsSync(own) ? own : pathToFileURL(path.resolve(WS, name)).href);
  if (typeof mod[kind] !== 'function') throw new Error(`target ${name} has no ${kind}()`);
  return mod[kind];
}
