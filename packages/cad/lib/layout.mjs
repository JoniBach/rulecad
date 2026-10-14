// Layout files: projects/<project>/layouts/<name>.json, in the format @rulecad/keyboard-layout describes and reads.
import fs from 'node:fs';
import path from 'node:path';
import { WS, paths } from './workspace.mjs';

export const layoutPath = (project, name, dir) => path.join(dir || path.join(paths.project(project), 'layouts'), `${name}.json`);
export const hasLayout = (project, name, dir) => fs.existsSync(layoutPath(project, name, dir));
export function readLayout(project, name, dir) {
  const f = layoutPath(project, name, dir);
  if (!fs.existsSync(f)) throw new Error(`no layout "${name}" (${path.relative(WS, f)})`);
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

export { keys, width, depth, project } from '@rulecad/keyboard-layout';
