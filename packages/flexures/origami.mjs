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

// ------------------------------------------------------------------------------------------------- the Kresling fold

/** @typedef {{ sides: number, radius: number, height: number, twist: number, panel?: { thickness: number }, hinge?: { flex: number, thickness: number } }} Kresling
 *   sides: n, the polygons' sides (3 to 12); radius: R, their circumradius; height, twist: one stable state, the top
 *   polygon h above the bottom and turned φ (degrees) from it; panel: the panels' thickness, for the stretch the
 *   panels take between the stable states; hinge: each crease's web, flex wide and thickness thick */

const vertsK = (n, R, h, phi) => ({ B: Array.from({ length: n }, (_, i) => { const q = (2 * Math.PI * i) / n; return [R * Math.cos(q), R * Math.sin(q), 0]; }), T: Array.from({ length: n }, (_, i) => { const q = (2 * Math.PI * i) / n + phi; return [R * Math.cos(q), R * Math.sin(q), h]; }) });
// The fold at every crease, degrees (0 flat): each side B_i T_i between the panels either side, each diagonal B_i+1 T_i
// between the two panels of its quad (B_i B_i+1 T_i and B_i+1 T_i+1 T_i)
function foldsK(n, R, h, phi) {
  const { B, T } = vertsK(n, R, h, phi), tri = (a, b, c) => normalOf([a, b, c, c]), turn = (u, v) => deg(Math.acos(Math.min(1, Math.max(-1, dot(u, v)))));
  const lower = (i) => tri(B[i], B[(i + 1) % n], T[i]), upper = (i) => tri(B[(i + 1) % n], T[(i + 1) % n], T[i]);
  return { side: turn(upper((i => (i + n - 1) % n)(0)), lower(0)), diagonal: turn(lower(0), upper(0)) };
}

/**
 * The Kresling fold: a tube of 2n triangles between two n-sided polygons, the top turned against the bottom. Its
 * triangles' sides are fixed by one stable state (height, twist), and with the same sides it stands again at a
 * second, where every side is again its length (Guest and Pellegrino, The folding of triangulated cylinders, part 1,
 * J. Appl. Mech. 61, 1994). Between the two the panels must stretch: it is bistable, not rigid-foldable. With the side
 * B_i T_i of length a and the diagonal B_i+1 T_i of length b (α = 2π/n):
 *   a² = h² + 2R²(1 - cos φ), b² = h² + 2R²(1 - cos(φ - α)), so a² - b² = 2R²(cos(φ - α) - cos φ) at both states:
 *   2R² sin(α/2) · 2 sin(φ - α/2) = a² - b², whose two roots φ0 and π + α - φ0 are the two states' twists.
 * The force to hold it at a height, its top free to turn, is the slope of the panels' stretch energy (each side and
 * diagonal a bar, as stiff as its panel taken as a strip its triangle's height wide: an estimate), at the twist that
 * makes it least.
 * @param {Kresling} p
 * @param {{ E: number, strainLimit?: number }} [m]
 * @returns {{ sides: { polygon: number, side: number, diagonal: number }, states: { height: number, twist: number, folds: { side: number, diagonal: number } }[],
 *   bistable: boolean, at?: (height: number) => { twist: number, energy: number, force: number, stretch: number }, barrier?: { height: number, energy: number, force: number },
 *   flat: number[][], web?: { strain: number, fold: number, length: number }[] }}
 *   sides: the polygon's side and the triangles' two others, mm; states: both stable states (twist in degrees, folds
 *   at the creases in degrees), the given one first; bistable: whether the second exists with the top above the
 *   bottom; at(h): with a material and a panel, the least-energy twist, the energy (N·mm), the force to hold it (N, +
 *   pushes it taller) and the most stretch of a side or diagonal; barrier: the energy's most between the states, and
 *   the most force to push it from the first towards the second; flat: the pattern's vertices flat, [x, y], bottom row
 *   then top row; web: with a hinge, at each state the creases' most strain and the web length that fold needs for the
 *   material's limit
 */
export function kreslingModel(p, m) {
  if (!p || typeof p !== 'object') throw refuse('kresling.input', `kreslingModel: a Kresling cell is { sides, radius, height, twist } (got ${JSON.stringify(p)})`);
  const n = p.sides;
  if (!(Number.isInteger(n) && n >= 3 && n <= 12)) throw refuse('kresling.sides', `kreslingModel: sides is a whole number from 3 to 12 (got ${JSON.stringify(n)})`);
  need('kreslingModel', { radius: p.radius, length: p.height });
  const R = p.radius, h0 = p.height, al = (2 * Math.PI) / n, phi0 = rad(p.twist);
  if (!(typeof p.twist === 'number' && phi0 > al / 2 && phi0 < Math.PI / 2 + al / 2)) throw refuse('kresling.twist', `kreslingModel: twist is the top's turn, between ${(deg(al) / 2).toFixed(1)} and ${(90 + deg(al) / 2).toFixed(1)} degrees for ${n} sides (half a side's turn to a quarter turn past it; got ${JSON.stringify(p.twist)})`);
  const a2 = h0 * h0 + 2 * R * R * (1 - Math.cos(phi0)), b2 = h0 * h0 + 2 * R * R * (1 - Math.cos(phi0 - al)), s = 2 * R * Math.sin(al / 2);
  // the second root of sin(φ - α/2) = (a² - b²) / (4R² sin(α/2)): φ1 - α/2 = π - (φ0 - α/2)
  const phi1 = Math.PI + al - phi0, h1sq = a2 - 2 * R * R * (1 - Math.cos(phi1)), bistable = h1sq > 1e-9 && Math.abs(phi1 - phi0) > 1e-9;
  const state = (h, phi) => ({ height: h, twist: deg(phi), folds: foldsK(n, R, h, phi) });
  const states = [state(h0, phi0), ...(bistable ? [state(Math.sqrt(h1sq), phi1)] : [])];
  // the pattern flat: the bottom row at (i s, 0); each top vertex a from its bottom one and b from the next
  const x0 = (a2 - b2 + s * s) / (2 * s), y0 = Math.sqrt(Math.max(0, a2 - x0 * x0));
  const flat = [Array.from({ length: n + 1 }, (_, i) => [i * s, 0]), Array.from({ length: n + 1 }, (_, i) => [i * s + x0, y0])];
  const out = { sides: { polygon: s, side: Math.sqrt(a2), diagonal: Math.sqrt(b2) }, states, bistable, flat };
  if (m !== undefined) need('kreslingModel', {}, m);
  if (m && p.panel) {
    need('kreslingModel: panel', { thickness: p.panel.thickness });
    // a bar's stiffness: E × panel thickness × its triangle's height to that side / the side's length (an estimate)
    const area = 0.5 * s * y0, ka = (m.E * p.panel.thickness * ((2 * area) / Math.sqrt(a2))) / Math.sqrt(a2), kb = (m.E * p.panel.thickness * ((2 * area) / Math.sqrt(b2))) / Math.sqrt(b2);
    const U = (h, phi) => { const da = Math.sqrt(h * h + 2 * R * R * (1 - Math.cos(phi))) - Math.sqrt(a2), db = Math.sqrt(h * h + 2 * R * R * (1 - Math.cos(phi - al))) - Math.sqrt(b2); return n * (0.5 * ka * da * da + 0.5 * kb * db * db); };
    const best = (h) => { // golden-section search on the twist, over the span of both states and a little more
      let lo = Math.min(phi0, phi1) - 0.3, hi = Math.max(phi0, phi1) + 0.3; const g = (Math.sqrt(5) - 1) / 2;
      // a coarse look first, so the search starts in the least valley
      let at = lo, least = Infinity; for (let k = 0; k <= 200; k++) { const q = lo + ((hi - lo) * k) / 200, u = U(h, q); if (u < least) { least = u; at = q; } }
      lo = at - (hi - lo) / 200; hi = at + (hi - lo) / 200;
      for (let k = 0; k < 80; k++) { const c = hi - g * (hi - lo), d = lo + g * (hi - lo); if (U(h, c) < U(h, d)) hi = d; else lo = c; }
      return (lo + hi) / 2;
    };
    out.at = (h) => {
      if (!(typeof h === 'number' && h > 0)) throw refuse('kresling.height', `kreslingModel: a height is above 0 mm (got ${JSON.stringify(h)})`);
      const phi = best(h), e = 1e-5 * h0, energy = U(h, phi), force = -(U(h + e, best(h + e)) - U(h - e, best(h - e))) / (2 * e);
      const stretch = Math.max(Math.abs(Math.sqrt(h * h + 2 * R * R * (1 - Math.cos(phi))) / Math.sqrt(a2) - 1), Math.abs(Math.sqrt(h * h + 2 * R * R * (1 - Math.cos(phi - al))) / Math.sqrt(b2) - 1));
      return { twist: deg(phi), energy, force, stretch };
    };
    if (bistable) {
      const hs = Array.from({ length: 81 }, (_, k) => h0 + ((states[1].height - h0) * k) / 80), pts = hs.map((h) => ({ h, ...out.at(h) }));
      const top = pts.reduce((a, c) => (c.energy > a.energy ? c : a)), push = pts.slice(0, pts.indexOf(top) + 1).reduce((a, c) => (Math.abs(c.force) > Math.abs(a.force) ? c : a)); // the most force before the top of the barrier
      out.barrier = { height: top.h, energy: top.energy, force: Math.abs(push.force), stretch: Math.max(...pts.map((c) => c.stretch)) };
    }
  }
  if (p.hinge) {
    need('kreslingModel: hinge', { flex: p.hinge.flex, thickness: p.hinge.thickness });
    out.web = states.map((st) => { const fold = Math.max(st.folds.side, st.folds.diagonal), strain = (p.hinge.thickness * rad(fold)) / (2 * p.hinge.flex); return { fold, strain, length: m?.strainLimit ? (p.hinge.thickness * rad(fold)) / (2 * m.strainLimit) : NaN }; });
  }
  return out;
}
