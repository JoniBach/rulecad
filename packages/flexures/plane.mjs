// The plane's geometry for lamina mechanisms: shapes as plain data (lists of closed loops, [[x, y], …]), the
// booleans, offsets and areas on manifold-3d's CrossSection (Clipper2: robust where JSCAD's 2D booleans aren't), the
// 2D transforms, and the print in 3D (the shapes extruded, cut and added to). The constants the mechanism's checks
// share live here too. Split from lamina.mjs, which keeps the mechanism itself; bent.mjs draws flexures bent and
// finds their peak strain; flooded.mjs floods a frame.
import jscad from '@jscad/modeling';

export const AREA = 1e-4; // mm²: less than this of an overlap is a rounding error, not a touch
export const TOUCH = 0.01; // mm: as near as a flexure's root is to its body, or a point to an edge
export const STOP_STEPS = 40; // how finely a joint's travel is swept for its stop
export const NONE = new Set();
export const MARCH = 40; // steps a follower's give is searched in, from where it is
export const FINE = 0.005; // mm: a give this small is the solver's precision, not a push
export const REFINE = 10; // a step that pushes a follower, looked at again in this many parts
export const FRAMES = 12; // frames from one state to the next, for an animation
export const GAMMA = 0.85; // the pseudo-rigid-body leaf's characteristic radius (Howell): its tip turns about 0.15 L from the root
export const LEAFLIKE = new Set(['leaf', 'snapHook', 'contactLeaf']);
export const OWN_ROUNDS = new Set(['parallelGuide', 'compoundGuide', 'foldedGuide', 'serpentine', 'snapHook', 'notchHinge', 'ellipticalHinge', 'livingHinge', 'cartwheel', 'letJoint', 'bistable']); // flexures with blocks of their own, rounded into them already
export const ROUND = 16; // segments to a full circle where an outline is grown
export const FE_CELLS = 8; // finite-element cells across a flexure's thickness
export const FE_MOST = 40000; // and no more cells than this in all (coarser, then)
export const SHARP_TURN = 45; // degrees: an inside corner turning this much or more at once is sharp (a round turns a little at each of many corners)
export const rad = (d) => (d * Math.PI) / 180, deg = (r) => (r * 180) / Math.PI;

// 2D affine transforms [a, b, c, d, e, f]: x' = a x + b y + c, y' = d x + e y + f
export const I = [1, 0, 0, 0, 1, 0];
export const mul = (m, n) => [m[0] * n[0] + m[1] * n[3], m[0] * n[1] + m[1] * n[4], m[0] * n[2] + m[1] * n[5] + m[2], m[3] * n[0] + m[4] * n[3], m[3] * n[1] + m[4] * n[4], m[3] * n[2] + m[4] * n[5] + m[5]];
export const apply = (m, [x, y]) => [m[0] * x + m[1] * y + m[2], m[3] * x + m[4] * y + m[5]];
export const shift = ([x, y]) => [1, 0, x, 0, 1, y];
export const turn = (a, [cx, cy] = [0, 0]) => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, cx - c * cx + s * cy, s, c, cy - s * cx - c * cy]; };


// ---------- the plane's geometry ----------
// Shapes are plain data: lists of closed loops ([[x, y], …]). Booleans, offsets and areas are Clipper2's, through
// manifold-3d's CrossSection: robust where JSCAD's 2D booleans aren't (a near miss, a sliver, a corner a hair off),
// which is what clearance checks live on. Each operation makes its WASM objects and frees them before it returns.
let W = null;
export async function ready() {
  if (W) return W;
  let mod;
  try { mod = await import('manifold-3d'); } catch (e) { throw Object.assign(new Error('lamina mechanisms need manifold-3d (npm install manifold-3d): its 2D geometry is what the checks trust'), { cause: e }); }
  W = await mod.default();
  W.setup();
  return W;
}
export const empty = (a) => !a || !a.length;
export function run(fn) {
  const made = [], keep = (c) => (made.push(c), c), cs = (loops) => keep(new W.CrossSection(loops, 'NonZero'));
  try { return fn(cs, keep); } finally { for (const c of made) c.delete(); }
}
export const loopsOf = (c) => c.toPolygons().map((l) => l.map((p) => [p[0], p[1]]));
export const union = (list) => { const l = list.filter((a) => !empty(a)); return !l.length ? [] : run((cs, keep) => loopsOf(keep(W.CrossSection.union(l.map(cs))))); };
export const intersect = (a, b) => (empty(a) || empty(b) ? [] : run((cs, keep) => loopsOf(keep(cs(a).intersect(cs(b))))));
export const subtract = (a, b) => (empty(a) ? [] : empty(b) ? a : run((cs, keep) => loopsOf(keep(cs(a).subtract(cs(b))))));
export const grow = (a, d) => (empty(a) || !(d > 0) ? a : run((cs, keep) => loopsOf(keep(cs(a).offset(d, 'Round', 2, ROUND)))));
export const shrink = (a, d, join = 'Miter') => (empty(a) || !(d > 0) ? a : run((cs, keep) => loopsOf(keep(cs(a).offset(-d, join, 2, ROUND)))));
export const area = (a) => (empty(a) ? 0 : run((cs) => cs(a).area()));
export const pieces = (a) => (empty(a) ? 0 : run((cs, keep) => cs(a).decompose().map(keep).filter((p) => p.area() > AREA).length));
export const apart = (a) => (empty(a) ? [] : run((cs, keep) => cs(a).decompose().map(keep).filter((p) => p.area() > AREA).map(loopsOf)));
export const box = (a) => {
  const lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
  for (const l of a) for (const [x, y] of l) { lo[0] = Math.min(lo[0], x); lo[1] = Math.min(lo[1], y); hi[0] = Math.max(hi[0], x); hi[1] = Math.max(hi[1], y); }
  return { lo, hi };
};
export const moved = (m, a) => (m === I ? a : a.map((l) => l.map((p) => apply(m, p))));

// A design's shapes, as loops: a JSCAD 2D shape's sides chained into loops; a prism (a flexure generator's) as its
// top faces; loops as they are. Then one union, so overlaps and odd windings come out clean.
export function loopsFromSides(sides) {
  const key = (p) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`, next = new Map(), out = [];
  for (const [a, b] of sides) next.set(key(a), [a, b]);
  const seen = new Set();
  for (const [a] of sides) {
    if (seen.has(key(a))) continue;
    const loop = []; let k = key(a);
    while (next.has(k) && !seen.has(k)) { seen.add(k); const [p, q] = next.get(k); loop.push(p); k = key(q); }
    if (loop.length >= 3) out.push(loop);
  }
  return out;
}
export function flat(g) {
  const { geom2, geom3 } = jscad.geometries;
  if (Array.isArray(g) && (g.length === 0 || Array.isArray(g[0]?.[0]))) return union([g]);
  if (geom2.isA(g)) return union([loopsFromSides(geom2.toSides(g))]);
  if (geom3.isA(g)) {
    const tops = geom3.toPolygons(g).filter((p) => { const [a, b, c] = p.vertices, n = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); return n > 1e-12; }).map((p) => p.vertices.map((v) => [v[0], v[1]]));
    return union([tops]);
  }
  throw new Error('a lamina takes 2D shapes, prisms standing on the bed, or loops of [x, y]');
}
export const isLoops = (g) => Array.isArray(g) && g.length > 0 && Array.isArray(g[0]) && Array.isArray(g[0][0]) && typeof g[0][0][0] === 'number';
export const shapesIn = (g) => (isLoops(g) ? [g] : Array.isArray(g) ? g.flatMap(shapesIn) : g ? [g] : []); // (loops of points kept whole)
export const all = (gs) => union(shapesIn(gs).map(flat));
// A shape as a JSCAD solid, extruded `height` up from the bed
export function solidOf(a, height) {
  const { geom3, poly3 } = jscad.geometries;
  if (empty(a)) return geom3.create();
  return run((cs, keep) => {
    const m = cs(a).extrude(height), { vertProperties: v, triVerts: t, numProp: n } = m.getMesh(), polys = [];
    m.delete();
    for (let i = 0; i < t.length; i += 3) polys.push(poly3.create([t[i], t[i + 1], t[i + 2]].map((k) => [v[k * n], v[k * n + 1], v[k * n + 2]])));
    return geom3.create(polys);
  });
}

// The print in 3D: the shapes extruded, `cuts` taken out of them between heights and `adds` put on (bridges)
export function solidWith(a, height, cuts, adds, arches = [], layers = [], pins = []) {
  const { geom3, poly3 } = jscad.geometries;
  // Each step's solid replaces the last, which is let go at once: a print with guides is a hundred thin slabs, and
  // keeping every one till the end runs manifold out of memory
  let m = null;
  const scratch = [], tmp = (x) => (scratch.push(x), x), flush = () => { for (const x of scratch.splice(0)) x.delete(); };
  const next = (x) => { if (m) m.delete(); m = x; flush(); };
  const slab = (shape, from, to) => { const c = tmp(new W.CrossSection(shape, 'NonZero')), e = tmp(c.extrude(to - from)); return tmp(e.translate([0, 0, from])); };
  const real = (shape, from, to) => !empty(shape) && to - from > 1e-6; // (manifold falls over on a slab with no thickness)
  try {
    const base = tmp(new W.CrossSection(a, 'NonZero'));
    next(base.extrude(height));
    for (const c of cuts) if (real(c.shape, c.from, c.to)) next(m.subtract(slab(c.shape, c.from, c.to)));
    // An arch: its profile (a triangle, 45° flanks, along u from lo to hi) stood up and swept across, cut out of the
    // part's footprint there
    for (const r of arches) {
      if (!(r.hi - r.lo > 1e-3) || empty(r.shape)) continue; // (nothing to arch over)
      const mid = (r.lo + r.hi) / 2, half = (r.hi - r.lo) / 2, big = 1e3;
      const tri = tmp(new W.CrossSection([[[r.lo, 0], [r.hi, 0], [mid, half]]], 'NonZero')); // (s, z), apex at r.apex since half = apex
      const across = tmp(tmp(tri.extrude(2 * big)).translate([0, 0, -big])); // swept along the third axis
      const stood = tmp(across.rotate([90, 0, 0])); // (s, z, w) to (s, w, z): the profile now stands in x–z, swept along y
      const placed = tmp(stood.rotate([0, 0, (Math.atan2(r.u[1], r.u[0]) * 180) / Math.PI])); // s along u
      const foot = tmp(tmp(new W.CrossSection(r.shape, 'NonZero')).extrude(height));
      next(m.subtract(tmp(placed.intersect(foot))));
    }
    for (const c of adds) if (real(c.shape, c.from, c.to)) next(m.add(slab(c.shape, c.from, c.to)));
    // Slabs a layer or so thick: a guide's ridge added, its groove cut (cuts first, so a ridge is never cut away)
    for (const c of layers) if (real(c.cut, c.from, c.to)) next(m.subtract(slab(c.cut, c.from, c.to)));
    for (const c of layers) if (real(c.add, c.from, c.to)) next(m.add(slab(c.add, c.from, c.to)));
    // Pins: the carried body cut back over the floor and under the cap, then the floor, the post and its cap put back
    const cone = (r0, r1, z0, z1, at) => tmp(tmp(W.Manifold.cylinder(z1 - z0, r0, r1, 64)).translate([at[0], at[1], z0]));
    for (const p of pins) {
      if (real(p.floorCut, 0, p.base + p.lift)) next(m.subtract(slab(p.floorCut, 0, p.base + p.lift)));
      const top = height - p.lip, R = p.r + p.c; // the cap: from the post's radius at `top` out by the lip at the top, 45°
      next(m.subtract(cone(R, R + p.lip + p.lift, top - p.lift, height + 1e-3, p.at)));
      if (real(p.under, 0, p.base)) next(m.add(slab(p.under, 0, p.base)));
      next(m.add(cone(p.r, p.r, 0, top, p.at)));
      next(m.add(cone(p.r, p.r + p.lip, top, height, p.at)));
    }
    const { vertProperties: v, triVerts: t, numProp: n } = m.getMesh(), polys = [];
    for (let i = 0; i < t.length; i += 3) polys.push(poly3.create([t[i], t[i + 1], t[i + 2]].map((k) => [v[k * n], v[k * n + 1], v[k * n + 2]])));
    return geom3.create(polys);
  } finally { flush(); if (m) m.delete(); }
}

// Within d of each other? Their outlines grown by half of it each overlap
export const within = (a, b, d) => area(intersect(grow(a, d / 2), grow(b, d / 2))) > AREA;
// The gap between two shapes, to a hundredth, when it's under `most`
export function gapBetween(a, b, most) {
  if (area(intersect(a, b)) > AREA) return 0;
  let lo = 0, hi = most;
  for (let i = 0; i < 7; i++) { const mid = (lo + hi) / 2; if (within(a, b, mid)) hi = mid; else lo = mid; }
  return +((lo + hi) / 2).toFixed(2);
}
// Run into each other, deeper than `slack`? A touch is fine (a latch resting on its catch); an overlap isn't
export function collide(a, b, slack) {
  const o = intersect(a, b);
  if (area(o) <= AREA) return null;
  return area(slack > 0 ? shrink(o, slack / 2) : o) > AREA ? box(o) : null;
}
