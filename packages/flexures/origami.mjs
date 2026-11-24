// Origami printed flat: the Miura fold, as thick panels on a thin web. Its sheet is parallelograms (sides a and b, an
// angle γ between them) in rows and columns, and it folds rigidly: one number, the fold, sets every crease at once,
// and the panels stay flat. A Miura sheet is a surface of translation: each vertex is the sum of a zigzag across
// (A_i, in x and z) and a zigzag along (B_j, in x and y), so every facet is a parallelogram whatever the fold:
//   A_i = (i L, 0, (i mod 2) H), B_j = ((j mod 2) V, j S, 0),
//   H = a sin θ sin γ, L = √(a² - H²), V = a b cos γ / L, S = √(b² - V²)
// where θ is the facets' tilt off the bed (0 flat, 90° folded flat). |A_i+1 - A_i| = a and |B_j+1 - B_j| = b, and the
// angle between them stays γ (L V = a b cos γ), so the facets are the flat sheet's. The same cell as Schenk and Guest
// (Geometry of Miura-folded metamaterials, PNAS 110(9) 3276, 2013), whose fold angle is this tilt.
//
// Printed, each crease is a living hinge: the web (t thick, on the bed) l wide under the crease, the panels either side
// rising from it with their sides sloped back at 45°. A crease that turns ψ bends its web to a strain t ψ / 2l, and
// stops when the panels either side meet (its pinch). Units: mm, N, MPa; angles in degrees, as a pose's.
import jscad from '@jscad/modeling';
import { need } from './core.mjs';

const { polygon, polyhedron } = jscad.primitives;
const { union } = jscad.booleans;
const { extrudeLinear } = jscad.extrusions;

const refuse = (code, text) => Object.assign(new Error(text), { code });
const rad = (d) => (d * Math.PI) / 180, deg = (r) => (r * 180) / Math.PI;
const sub = (a, b) => a.map((x, i) => x - b[i]), add = (a, b) => a.map((x, i) => x + b[i]), dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(...a); return a.map((x) => x / l); };

/** @typedef {{ a: number, b: number, angle: number, rows: number, columns: number, thickness?: number, hinge?: { flex: number, thickness: number } }} Miura
 *   a: the facets' side across (along x, flat); b: their side along the rows; angle: γ between them, degrees (0 to 90,
 *   not either); rows, columns: facets each way; thickness: the panels' (h); hinge: each crease's web, flex wide across
 *   it and thickness thick (t, under h) */

function check(what, p) {
  need(what, { length: p?.a, width: p?.b });
  if (!(p.angle > 0 && p.angle < 90)) throw refuse('miura.angle', `${what}: the facets' angle is between 0 and 90 degrees, not either (got ${JSON.stringify(p.angle)})`);
  for (const k of ['rows', 'columns']) if (!(Number.isInteger(p[k]) && p[k] >= 1)) throw refuse('miura.count', `${what}: ${k} is a whole number of facets, 1 or more (got ${JSON.stringify(p[k])})`);
  if (p.hinge !== undefined) {
    need(`${what}: hinge`, { flex: p.hinge?.flex, thickness: p.hinge?.thickness });
    if (!(p.thickness > p.hinge.thickness)) throw refuse('miura.web', `${what}: the web (${p.hinge.thickness} mm) is thinner than the panels (thickness ${JSON.stringify(p.thickness)} mm)`);
  }
}

// The cell at a tilt θ (radians)
const cell = ({ a, b, angle }, th) => { const g = rad(angle), H = a * Math.sin(th) * Math.sin(g), L = Math.sqrt(a * a - H * H), V = (a * b * Math.cos(g)) / L, S = Math.sqrt(Math.max(0, b * b - V * V)); return { H, L, V, S }; };
const vertsAt = (p, th) => { const { H, L, V, S } = cell(p, th); return Array.from({ length: p.rows + 1 }, (_, j) => Array.from({ length: p.columns + 1 }, (_, i) => [i * L + (j % 2) * V, j * S, (i % 2) * H])); };
const facet = (v, i, j) => [v[j][i], v[j][i + 1], v[j + 1][i + 1], v[j + 1][i]];
const normalOf = (q) => unit(cross(sub(q[1], q[0]), sub(q[3], q[0])));
const centre = (q) => q.reduce((s, x) => add(s, x.map((c) => c / q.length)), [0, 0, 0]);

/**
 * The Miura fold's model at a fold: its vertices, its size, and every crease's turn; with a hinge and a material, each
 * crease's strain and pinch, and the furthest the sheet folds before a crease strains past the limit or pinches.
 * @param {Miura} p @param {import('./core.mjs').Material} [m]
 * @returns {{ at: (fold: number) => { cell: { H: number, L: number, V: number, S: number }, size: number[], vertices: number[][][], creases: { between: number[][], kind: 'across' | 'along', turn: number, top: boolean, strain?: number, pinch?: number }[] }, fold: number | null, limit: string | null }}
 *   at(fold): the sheet at a tilt (degrees): cell H, L, V, S (a cell is two facets each way: 2L by 2S, H high); size
 *   [x, y, z]; creases: between two facets ([i, j] each), across (between columns, the zigzag creases) or along
 *   (between rows), the turn in degrees, top: whether it closes the panels' top faces (the web outside), and with a
 *   hinge its strain and pinch (degrees); fold: the furthest tilt that passes (with a hinge and a strain limit), and
 *   limit: what stops it there ('strain' or 'pinch')
 */
export function miuraModel(p, m) {
  check('miuraModel', p);
  if (m !== undefined) need('miuraModel', {}, m);
  const hg = p.hinge, h = p.thickness;
  const pinchOf = (top) => {
    if (!hg) return undefined;
    const { flex: l, thickness: t } = hg;
    // the corners nearest the pin (the web's middle, t / 2 up): the web's edge (l / 2 along, t / 2 off) on either side,
    // and on the top the panel's top edge, sloped back 45° (l / 2 + h - t along, h - t / 2 above)
    return deg(Math.PI - 2 * (top ? Math.max(Math.atan(t / l), Math.atan((h - t / 2) / (l / 2 + h - t))) : Math.atan(t / l)));
  };
  const at = (fold) => {
    if (!(fold >= 0 && fold < 90)) throw refuse('miura.fold', `miuraModel: the fold is the facets' tilt, from 0 (flat) to under 90 degrees (folded flat) (got ${JSON.stringify(fold)})`);
    const v = vertsAt(p, rad(fold)), c = cell(p, rad(fold)), creases = [];
    const crease = (i0, j0, i1, j1, kind) => {
      const q0 = facet(v, i0, j0), q1 = facet(v, i1, j1), n0 = normalOf(q0), n1 = normalOf(q1);
      const turn = deg(Math.acos(Math.min(1, Math.max(-1, dot(n0, n1))))), top = dot(sub(centre(q1), centre(q0)), n0) > 1e-9;
      const x = { between: [[i0, j0], [i1, j1]], kind, turn, top };
      if (hg) { x.strain = (hg.thickness * rad(turn)) / (2 * hg.flex); x.pinch = pinchOf(top); }
      creases.push(x);
    };
    for (let j = 0; j < p.rows; j++) for (let i = 0; i < p.columns; i++) { if (i + 1 < p.columns) crease(i, j, i + 1, j, 'across'); if (j + 1 < p.rows) crease(i, j, i, j + 1, 'along'); }
    const all = v.flat(), lo = [0, 1, 2].map((k) => Math.min(...all.map((q) => q[k]))), hi = [0, 1, 2].map((k) => Math.max(...all.map((q) => q[k])));
    return { cell: c, size: hi.map((x, k) => x - lo[k]), vertices: v, creases };
  };
  // the furthest fold: every crease turns further as the sheet folds, so a bisection finds where the first fails
  let fold = null, limit = null;
  if (hg && m?.strainLimit != null && (p.rows > 1 || p.columns > 1)) {
    const fails = (f) => { const cs = at(f).creases; return cs.some((x) => x.strain > m.strainLimit) ? 'strain' : cs.some((x) => x.turn > x.pinch) ? 'pinch' : null; };
    let lo = 0, hi = 89.999;
    if (!fails(hi)) fold = hi;
    else { for (let k = 0; k < 50; k++) { const mid = (lo + hi) / 2; if (fails(mid)) hi = mid; else lo = mid; } fold = lo; limit = fails(hi); }
  }
  return { at, fold, limit };
}

// A convex polygon in its plane, each side moved in by its own distance: the sides' lines moved, then met again
const inset = (q, n, d) => {
  const lines = q.map((a, k) => { const b = q[(k + 1) % q.length], e = unit(sub(b, a)), inw = unit(cross(n, e)); return { p: add(a, inw.map((x) => x * d[k])), e }; });
  return lines.map((L1, k) => { const L0 = lines[(k + q.length - 1) % q.length], w = sub(L1.p, L0.p), c = cross(L0.e, L1.e), s = dot(cross(w, L1.e), c) / dot(c, c); return add(L0.p, L0.e.map((x) => x * s)); });
};
// A frustum: a quad face, and another above it along n (both in the same order round), as a closed solid
const frustum = (lo, hi) => polyhedron({ points: [...lo, ...hi], faces: [[3, 2, 1, 0], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]], orientation: 'outward' });

/**
 * A Miura sheet, printed flat (fold 0): the web over the whole sheet on the bed, and a panel on each facet, set back
 * from its creases by half the web's width and sloped back at 45°, so the first layer is the whole sheet and no inside
 * corner is square. Folded (fold above 0), the panels where the fold puts them (the webs left out), for a picture
 * and a fit check.
 * @param {Miura & { thickness: number, hinge: { flex: number, thickness: number } }} p
 * @param {number} [fold] the facets' tilt, degrees (default 0, as printed)
 * @returns {object} the shape, a JSCAD geom3
 */
export function miura(p, fold = 0) {
  check('miura', p);
  if (!p.hinge) throw refuse('miura.web', 'miura: give its creases a hinge: { flex, thickness } (the web under each crease)');
  if (!(fold >= 0 && fold < 90)) throw refuse('miura.fold', `miura: the fold is the facets' tilt, from 0 (flat) to under 90 degrees (got ${JSON.stringify(fold)})`);
  const v = vertsAt(p, rad(fold)), h = p.thickness, { flex: l, thickness: t } = p.hinge, rise = h - t, parts = [];
  for (let j = 0; j < p.rows; j++) for (let i = 0; i < p.columns; i++) {
    const q = facet(v, i, j), n = normalOf(q);
    // sides in order: along the row below (j), the column to the right (i + 1), the row above (j + 1), the column to the left (i)
    const inner = [j > 0, i + 1 < p.columns, j + 1 < p.rows, i > 0], d0 = inner.map((x) => (x ? l / 2 : 0)), d1 = inner.map((x) => (x ? l / 2 + rise : 0));
    if (fold === 0) parts.push(frustum(inset(q, n, d0).map((x) => [x[0], x[1], t - 0.01]), inset(q, n, d1).map((x) => [x[0], x[1], h])));
    else { const lo = inset(q, n, d0), hi = inset(q, n, d1).map((x) => add(x, n.map((c) => c * h))); parts.push(frustum(lo, hi)); }
  }
  if (fold === 0) {
    // the web: the sheet's outline, the bottom row, up the right side, the top row back, down the left
    const R = p.rows, C = p.columns, out = [...v[0].map((x) => [x[0], x[1]])];
    for (let j = 1; j <= R; j++) out.push([v[j][C][0], v[j][C][1]]);
    for (let i = C - 1; i >= 0; i--) out.push([v[R][i][0], v[R][i][1]]);
    for (let j = R - 1; j >= 1; j--) out.push([v[j][0][0], v[j][0][1]]);
    parts.push(extrudeLinear({ height: t }, polygon({ points: out })));
  }
  return union(...parts);
}
