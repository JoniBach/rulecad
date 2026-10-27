// The sandbox's import hook: code in the design's project may import @jscad/modeling, @rulecad/shapes and files of
// its own project, nothing else (no node: modules: no files, network or processes). The tool's own modules are free.
import { builtinModules } from 'node:module';

let project = '';
export async function initialize(data) { project = data?.project || ''; }

const ALLOWED = ['@jscad/modeling', '@rulecad/shapes'];
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
const after = (spec, r) => {
  if (r.url.startsWith('file:') && !r.url.startsWith(project) && !r.url.includes('/node_modules/')) throw deny(spec, 'it is outside the project');
  return r;
};
function check(spec, context) {
  const fromDesign = project && context.parentURL?.startsWith(project) && !context.parentURL.includes('/node_modules/');
  if (fromDesign) {
    if (spec.startsWith('node:') || builtinModules.includes(spec)) throw deny(spec, 'a design only makes shapes (no files, network or programs)');
    const relative = spec.startsWith('./') || spec.startsWith('../');
    if (!relative && !ALLOWED.some((a) => spec === a || spec.startsWith(`${a}/`))) throw deny(spec, `only ${ALLOWED.join(', ')} and files in its project`);
  }
  return fromDesign;
}
