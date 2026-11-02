// Flexures as smooth curves: a centreline through a few points (a spline, so no straight runs meeting at corners) with
// a thickness that varies smoothly along it, and optionally a mirror image of itself (two arms either side of a line,
// like a bow's limbs, whose sideways pulls cancel). Its model is the beam solver's: a curve has no formula, so its
// stiffness, its strain at a travel and the travel a strain allows are solved, large deflections and all. Drawn in the
// mechanism's own frame: the points are where they are (give the joint no `at` or `angle`).
import jscad from '@jscad/modeling';
import { beamSystem, equilibrium } from './beams.mjs';

const rad = (d) => (d * Math.PI) / 180;
const smoothstep = (a) => a * a * (3 - 2 * a);

/**
 * The centreline: a centripetal Catmull-Rom spline through the points (it passes through each, and doesn't loop or
 * cusp between them), leaving the first point at `start` degrees and arriving at the last at `end` degrees when given;
 * the thickness eased from each point's to the next's.
 * @param {{ points: number[][], thickness: number | number[], start?: number, end?: number, smooth?: number, mirror?: number }} p
 *   points: the root first, the tip last; thickness: one, or one at each point; start, end: the tangent's direction
 *   there, in degrees (a curve meets a block square to its face, or along it), held for a short lead; smooth: samples
 *   between points
 * @returns {{ path: number[][], thickness: number[], at: number[] }} thickness: one per span; at: one per sample
 */
export function curvePath({ points, thickness, start, end, smooth = 10 }) {
  if (!(points?.length >= 2)) throw new Error('a curve needs at least two points');
  // An end given a direction leads off along it for a little (one and a half thicknesses, or a fifth of the way to the
  // next point if that's less) before it curves, so it meets its block square to the way it's told
  const P = points.map((p) => [...p]), T = points.map((_, i) => (Array.isArray(thickness) ? thickness[i] : thickness));
  const lead = (k, a, toward) => { const d = Math.min(1.5 * T[k], 0.2 * Math.hypot(toward[0] - P[k][0], toward[1] - P[k][1])); return [P[k][0] + Math.cos(rad(a)) * d, P[k][1] + Math.sin(rad(a)) * d]; };
  if (end != null) { const e = P.length - 1, q = lead(e, end + 180, P[e - 1]); P.splice(e, 0, q); T.splice(e, 0, T[e]); }
  if (start != null) { const q = lead(0, start, P[1]); P.splice(1, 0, q); T.splice(1, 0, T[0]); }
  const n = P.length, tk = (i) => T[i];
  const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  // Phantom points beyond the ends: along the given direction, or the mirror of the next point (a natural end)
  const before = start != null ? [P[0][0] - Math.cos(rad(start)) * dist(P[0], P[1]), P[0][1] - Math.sin(rad(start)) * dist(P[0], P[1])] : [2 * P[0][0] - P[1][0], 2 * P[0][1] - P[1][1]];
  const after = end != null ? [P[n - 1][0] + Math.cos(rad(end)) * dist(P[n - 2], P[n - 1]), P[n - 1][1] + Math.sin(rad(end)) * dist(P[n - 2], P[n - 1])] : [2 * P[n - 1][0] - P[n - 2][0], 2 * P[n - 1][1] - P[n - 2][1]];
  const all = [before, ...P, after], path = [P[0]], at = [tk(0)];
  for (let i = 1; i < all.length - 2; i++) {
    const [p0, p1, p2, p3] = [all[i - 1], all[i], all[i + 1], all[i + 2]];
    // Barry and Goldman's pyramid, the knots spaced by the square root of each chord (centripetal)
    const t0 = 0, t1 = t0 + Math.sqrt(dist(p0, p1)) || 1e-9, t2 = t1 + Math.sqrt(dist(p1, p2)) || t1 + 1e-9, t3 = t2 + Math.sqrt(dist(p2, p3)) || t2 + 1e-9;
    const lerp = (a, b, ta, tb, t) => [((tb - t) * a[0] + (t - ta) * b[0]) / (tb - ta), ((tb - t) * a[1] + (t - ta) * b[1]) / (tb - ta)];
    for (let k = 1; k <= smooth; k++) {
      const t = t1 + ((t2 - t1) * k) / smooth;
      const A1 = lerp(p0, p1, t0, t1, t), A2 = lerp(p1, p2, t1, t2, t), A3 = lerp(p2, p3, t2, t3, t);
      const B1 = lerp(A1, A2, t0, t2, t), B2 = lerp(A2, A3, t1, t3, t);
      path.push(lerp(B1, B2, t1, t2, t));
      at.push(tk(i - 1) + (tk(i) - tk(i - 1)) * smoothstep(k / smooth));
    }
  }
  return { path, thickness: at.slice(1).map((t, i) => (t + at[i]) / 2), at };
}

// A path mirrored across the line y = m
const mirrored = (path, m) => path.map(([x, y]) => [x, 2 * m - y]);

/** The centrelines of a curve flexure: itself, and its mirror image when it has one */
export function curveLines(p) {
  const c = curvePath(p);
  return p.mirror != null ? [c, { ...c, path: mirrored(c.path, p.mirror) }] : [c];
}

// The outline of one centreline: offset either side by half its thickness, run on straight past each end by `into`
// (into the blocks it joins), anticlockwise
function outline({ path, at }, into) {
  const n = path.length, dir = (i) => { const a = path[Math.max(0, i - 1)], b = path[Math.min(n - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
  const d0 = dir(0), d1 = dir(n - 1), pts = [[path[0][0] - d0[0] * into, path[0][1] - d0[1] * into], ...path, [path[n - 1][0] + d1[0] * into, path[n - 1][1] + d1[1] * into]];
  const ts = [at[0], ...at, at[n - 1]], dirs = [d0, ...path.map((_, i) => dir(i)), d1];
  const side = (k) => pts.map((p, i) => [p[0] - (k * dirs[i][1] * ts[i]) / 2, p[1] + (k * dirs[i][0] * ts[i]) / 2]);
  const loop = [...side(-1), ...side(1).reverse()];
  const area = loop.reduce((s, p, i) => { const q = loop[(i + 1) % loop.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0);
  return area < 0 ? loop.reverse() : loop;
}

/**
 * A curve flexure: a spline through `points`, its thickness smooth along it, run on into the blocks at its ends by
 * `into`; with `mirror`, its mirror image across y = mirror as well (two arms, one shape).
 * @param {{ points: number[][], thickness: number | number[], width: number, start?: number, end?: number, smooth?: number, mirror?: number, into?: number }} p
 */
export function curve(p) {
  const into = p.into ?? Math.max(...[p.thickness].flat()), c = curvePath(p);
  const loops = [outline(c, into), ...(p.mirror != null ? [outline({ ...c, path: mirrored(c.path, p.mirror) }, into)] : [])];
  const shapes = loops.map((points) => jscad.extrusions.extrudeLinear({ height: p.width }, jscad.primitives.polygon({ points })));
  return shapes.length > 1 ? jscad.booleans.union(shapes) : shapes[0];
}

/**
 * A curve held at its root and moved at its tip, solved: the tip moved `d` along its motion (x or y), not turning, and
 * across it free (one arm) or held (a mirrored pair, whose sideways pulls cancel). Energy in mJ, force in N.
 * @param {object} p the curve's params (moves: 'x' or 'y', default 'y'; across: 'free' or 'held', default held when mirrored)
 * @param {{ E: number }} m
 */
export function curveSolver(p, { E }) {
  const lines = curveLines(p), tip = lines[0].path.at(-1), axis = p.moves === 'x' ? 0 : 1;
  const held = p.across ?? (p.mirror != null ? 'held' : 'free');
  // A mirrored pair moved along its mirror line, held across, bends as two mirror images: one arm solved, counted twice
  const twin = p.mirror != null && held === 'held' && axis === 0, arms = twin ? lines.slice(0, 1) : lines, times = twin ? 2 : 1;
  const sys = beamSystem({ bodies: { ground: { at: [0, 0], fixed: true }, tip: { at: tip } }, beams: arms.map((c, i) => ({ name: `arm${i}`, path: c.path, thickness: c.thickness, width: p.width, E, from: 'ground', to: 'tip' })), segments: 1 });
  let q = null, at = 0;
  /** Solve at d, stepping out from the last solve in steps no longer than `step` */
  const solve = (d, step = Math.max(0.5, Math.abs(d) / 6)) => {
    if (!q || Math.abs(d) < Math.abs(at) - 1e-9 || Math.sign(d) !== Math.sign(at)) { q = null; at = 0; }
    let r = null;
    const n = Math.max(1, Math.ceil(Math.abs(d - at) / step));
    for (let k = 1; k <= n; k++) {
      const dk = at + ((d - at) * k) / n, h = new Map([[axis, dk], [2, 0]]);
      if (held === 'held') h.set(1 - axis, 0);
      r = equilibrium(sys, { held: h, start: q ?? undefined, iterations: 80 });
      q = r.q;
    }
    at = d;
    if (!r) r = equilibrium(sys, { held: new Map([[axis, 0], [2, 0], ...(held === 'held' ? [[1 - axis, 0]] : [])]) });
    return { energy: r.energy * times, force: r.reaction.get(axis) * times, strain: Math.max(0, ...Object.values(r.strain)), converged: r.converged, q: r.q };
  };
  return { sys, solve, lines };
}

/**
 * A curve's model, from the beam solver: its stiffness at rest along its motion, its strain and energy at a travel,
 * and the travel a strain allows (whichever way it's moved comes first).
 * @returns {{ stiffness: number, strain: (d: number) => number, travel: (e: number) => number, stress: (d: number) => number, energy: (d: number) => number, least: number }}
 */
export function curveModel(p, m) {
  const s = curveSolver(p, m), cache = new Map(), at = (d) => { const k = +d.toFixed(4); if (!cache.has(k)) cache.set(k, s.solve(d)); return cache.get(k); };
  const small = 0.01, stiffness = Math.abs(at(small).force) / small;
  const strain = (d) => (Math.abs(d) < 1e-9 ? 0 : at(d).strain);
  const travel = (e) => {
    // Out either way in steps until the strain passes e, then halve the step down on to it
    const reach = Math.max(...s.lines.flatMap((c) => c.path.map(([x, y]) => Math.hypot(x - c.path[0][0], y - c.path[0][1])))) * 2;
    const side = (sign) => {
      let lo = 0, hi = null;
      for (let d = reach / 16; d <= reach; d += reach / 16) { if (strain(sign * d) >= e) { hi = d; break; } lo = d; }
      if (hi == null) return reach;
      for (let i = 0; i < 20; i++) { const mid = (lo + hi) / 2; if (strain(sign * mid) >= e) hi = mid; else lo = mid; }
      return lo;
    };
    return Math.min(side(1), side(-1));
  };
  return { signed: true, stiffness, strain, travel, stress: (d) => m.E * strain(d), energy: (d) => at(d).energy, force: (d) => at(d).force, least: Math.min(...[p.thickness].flat()) };
}
