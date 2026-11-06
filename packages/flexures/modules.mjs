// Sub-mechanisms as modules: each draws its own ground, bodies, joints and followers in its own frame and names its
// ports (a point on one of its bodies, and the way it moves there), so a mechanism is put together from tested parts:
// a latch's plunger where a key's stem pushes, a spring pack's shuttle where a pusher hangs. place() puts a module
// somewhere, turned, with its names prefixed; combine() joins placed modules into one lamina spec.
import jscad from '@jscad/modeling';

const rad = (d) => (d * Math.PI) / 180;
const rot = (a) => { const c = Math.cos(rad(a)), s = Math.sin(rad(a)); return { c, s, p: ([x, y]) => [c * x - s * y, s * x + c * y] }; };

// A shape (JSCAD 2D or 3D, or loops of [x, y], or a list of them) turned and shifted
function moveShape(g, a, at) {
  if (Array.isArray(g) && g.length && Array.isArray(g[0]) && Array.isArray(g[0][0])) { const r = rot(a); return g.map((l) => l.map((p) => { const q = r.p(p); return [q[0] + at[0], q[1] + at[1]]; })); }
  if (Array.isArray(g)) return g.map((x) => moveShape(x, a, at));
  return jscad.transforms.translate([at[0], at[1], 0], jscad.transforms.rotateZ(rad(a), g));
}

/**
 * A module placed: its shapes, joints and ports turned by `angle` degrees and moved to `at`, and every name it uses
 * prefixed with `name.` (but 'ground', and names it says are outside, starting '^', which lose the '^').
 * @param {{ ground?: object | object[], bodies?: Record<string, object>, joints?: Record<string, object>, follows?: Record<string, object>,
 *   states?: Record<string, Record<string, number>>, ports?: Record<string, { at: number[], body: string, along?: number[] }> }} m
 * @param {{ name: string, at?: number[], angle?: number }} where
 */
export function place(m, { name, at = [0, 0], angle = 0 }) {
  const r = rot(angle), pt = (p) => { const q = r.p(p); return [q[0] + at[0], q[1] + at[1]]; };
  const id = (n) => (n === 'ground' ? 'ground' : n.startsWith('^') ? n.slice(1) : `${name}.${n}`);
  const joints = Object.fromEntries(Object.entries(m.joints || {}).map(([n, j]) => [id(n), {
    ...j, from: id(j.from), to: id(j.to),
    // A generated flexure is drawn in its own frame, turned by its angle and then moved to its `at` (the origin, if it
    // gives none, as a curve needn't): so it is turned further, and where it is put moves with the module
    ...(j.at || j.kind ? { at: pt(j.at || [0, 0]) } : {}), ...(j.kind ? { angle: (j.angle || 0) + angle } : {}),
    ...(j.pin?.at ? { pin: { ...j.pin, at: pt(j.pin.at) } } : {}), // a pin is where the print has it
    ...(j.shape ? { shape: moveShape(j.shape, angle, at) } : {}), ...(j.axis ? { axis: r.p(j.axis) } : {}), ...(j.pivot ? { pivot: pt(j.pivot) } : {}),
  }]));
  return {
    ground: m.ground ? [moveShape(m.ground, angle, at)].flat() : [],
    bodies: Object.fromEntries(Object.entries(m.bodies || {}).map(([n, g]) => [id(n), moveShape(g, angle, at)])),
    joints,
    follows: Object.fromEntries(Object.entries(m.follows || {}).map(([n, f]) => [id(n), { ...f, by: f.by.map(id) }])),
    states: Object.fromEntries(Object.entries(m.states || {}).map(([s, v]) => [s, Object.fromEntries(Object.entries(v).map(([n, q]) => [id(n), q]))])),
    ports: Object.fromEntries(Object.entries(m.ports || {}).map(([n, p]) => [n, { ...p, at: pt(p.at), body: id(p.body), ...(p.along ? { along: r.p(p.along) } : {}) }])),
  };
}

/**
 * Placed modules joined into one lamina spec: grounds together, bodies, joints and followers merged (a name used twice
 * is an error), each module's states merged state by state; `extra` (height, gap, material, sequence, …) on top.
 * @param {ReturnType<typeof place>[]} placed @param {object} [extra]
 */
export function combine(placed, extra = {}) {
  const spec = { ground: [], bodies: {}, joints: {}, follows: {}, states: {} };
  for (const m of placed) {
    spec.ground.push(...m.ground);
    for (const key of ['bodies', 'joints', 'follows']) for (const [n, v] of Object.entries(m[key])) {
      if (spec[key][n]) throw new Error(`combine: "${n}" is in two modules`);
      spec[key][n] = v;
    }
    for (const [s, v] of Object.entries(m.states)) spec.states[s] = { ...(spec.states[s] || {}), ...v };
  }
  return { ...spec, ...extra, ground: [...spec.ground, ...[extra.ground || []].flat()], bodies: { ...spec.bodies, ...(extra.bodies || {}) }, joints: { ...spec.joints, ...(extra.joints || {}) }, follows: { ...spec.follows, ...(extra.follows || {}) }, states: { ...spec.states, ...(extra.states || {}) } };
}
