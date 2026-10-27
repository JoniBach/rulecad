// Layout files: projects/<project>/layouts/<name>.json, in the format @rulecad/keyboard-layout describes and reads.
import path from 'node:path';
import { host } from './host.mjs';
import { WS, paths } from './workspace.mjs';

export const layoutPath = (project, name, dir) => path.join(dir || path.join(paths.project(project), 'layouts'), `${name}.json`);
export const hasLayout = (project, name, dir) => host.exists(layoutPath(project, name, dir));
export function readLayout(project, name, dir) {
  const f = layoutPath(project, name, dir);
  if (!host.exists(f)) throw new Error(`no layout "${name}" (${path.relative(WS, f)})`);
  return JSON.parse(host.readText(f));
}

export { keys, width, depth, project } from '@rulecad/keyboard-layout';
