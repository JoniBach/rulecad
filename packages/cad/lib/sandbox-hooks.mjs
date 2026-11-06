// The sandbox's import hook: code in the design's project may import @jscad/modeling, @rulecad/shapes, @rulecad/flexures and files of
// its own project, nothing else (no node: modules: no files, network or processes). The tool's own modules are free.
import { builtinModules } from 'node:module';

let project = '';
export async function initialize(data) { project = data?.project || ''; }

const ALLOWED = ['@jscad/modeling', '@rulecad/shapes', '@rulecad/flexures'];
const deny = (spec, why) => Object.assign(new Error(`designs can't import "${spec}": ${why}`), { code: 'design.sandbox' });

// The same check, for in-thread hooks (synchronous) and worker hooks (async)
export function resolveHook(spec, context, next) {
  const fromDesign = check(spec, context), r = next(spec, context);
  return fromDesign ? after(spec, r) : r;
}
export async function resolve(spec, context, next) {
  const fromDesign = check(spec, context), r = await next(spec, context);
  return fromDesign ? after(spec, r) : r;
}
const isRelative = (spec) => spec.startsWith('./') || spec.startsWith('../');
// A design's own files are its project's. A path that leaves it is refused wherever it leads: into the workspace's
// node_modules, say, where any package may be. (The allowed packages are named bare, and may live anywhere.)
const after = (spec, r) => {
  if (isRelative(spec) && !r.url.startsWith(project)) throw deny(spec, 'it is outside the project');
  return r;
};
// Everything under the project is the design's code, a node_modules folder there included
function check(spec, context) {
  const fromDesign = project && context.parentURL?.startsWith(project);
  if (fromDesign) {
    if (spec.startsWith('node:') || builtinModules.includes(spec)) throw deny(spec, 'a design only makes shapes (no files, network or programs)');
    if (!isRelative(spec) && !ALLOWED.some((a) => spec === a || spec.startsWith(`${a}/`))) throw deny(spec, `only ${ALLOWED.join(', ')} and files in its project`);
  }
  return fromDesign;
}
