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
const { measureVolume } = jscad.measurements;

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

// ------------------------------------------------------------------------------------------------ the waterbomb base

/** @typedef {{ sides: number, radius: number, thickness: number, hinge: { flex: number, thickness: number } }} Waterbomb
 *   sides: n, the sheet's corners (3 to 8): the sheet is a regular n-sided polygon, its corners radius R from the
 *   middle; 2n creases run out from the middle, n to the corners and n to the sides' middles, each sector between two
 *   of them a triangle with its angle at the middle π / n; thickness: the panels' (h); hinge: each crease's web, flex
 *   wide across it and thickness thick (t, under h), printed on the bed under the whole sheet */

function checkW(what, p) {
  if (!p || typeof p !== 'object') throw refuse('waterbomb.input', `${what}: a waterbomb is { sides, radius, thickness, hinge: { flex, thickness } } (got ${JSON.stringify(p)})`);
  if (!(Number.isInteger(p.sides) && p.sides >= 3 && p.sides <= 8)) throw refuse('waterbomb.sides', `${what}: sides is a whole number from 3 to 8 (got ${JSON.stringify(p.sides)})`);
  need(what, { radius: p.radius, thickness: p.thickness });
  if (!p.hinge || typeof p.hinge !== 'object') throw refuse('waterbomb.web', `${what}: give its creases a hinge: { flex, thickness } (the web under each crease)`);
  need(`${what}: hinge`, { flex: p.hinge.flex, thickness: p.hinge.thickness });
  if (!(p.thickness > p.hinge.thickness)) throw refuse('waterbomb.web', `${what}: the web (${p.hinge.thickness} mm) is not thinner than the panels (thickness ${p.thickness} mm)`);
  // each panel, set back half a web from its two creases and sloped back at 45°, must keep some of its face
  const n = p.sides, inr = (p.radius * Math.cos(Math.PI / n) * Math.sin(Math.PI / n)) / (1 + Math.sin(Math.PI / n)), back = p.hinge.flex / 2 + (p.thickness - p.hinge.thickness);
  if (!(back < 0.8 * inr)) throw refuse('waterbomb.panel', `${what}: the panels, set back ${back.toFixed(2)} mm from their creases (half the web and the panels' slope), leave next to nothing of each ${(2 * inr).toFixed(2)} mm sector: a bigger radius, a narrower web or thinner panels`);
}

// The symmetric fold, by the corner creases' droop e_c below the flat (radians): each corner crease's direction from
// the middle c_k = (cos e_c cos φk, cos e_c sin φk, -sin e_c), each side crease's m_k the same at φk + π/n with its
// droop e_m. A sector keeps its angle π/n, so c_k · m_k = cos(π/n):
//   cos e_c cos e_m cos(π/n) + sin e_c sin e_m = cos(π/n)
// ρ cos(e_m - δ) = cos(π/n) with ρ = √(cos²(π/n) cos² e_c + sin² e_c), δ = atan2(sin e_c, cos(π/n) cos e_c); of its two
// roots the side creases droop further, e_m = δ + acos(cos(π/n) / ρ): the middle stands up, the corners and sides go
// down, the sides furthest (the waterbomb base). It ends where the side creases hang straight down (e_m = 90°), at
// sin e_c = cos(π/n): there the corner creases are folded flat (180°) and the side creases 180° - 360°/n.
function waterbombAt(n, ec) {
  const C = Math.cos(Math.PI / n), rho = Math.hypot(C * Math.cos(ec), Math.sin(ec)), dl = Math.atan2(Math.sin(ec), C * Math.cos(ec));
  const em = Math.min(Math.PI / 2, dl + Math.acos(Math.min(1, C / rho)));
  const ray = (phi, e) => [Math.cos(e) * Math.cos(phi), Math.cos(e) * Math.sin(phi), -Math.sin(e)];
  const c = Array.from({ length: n }, (_, k) => ray((2 * Math.PI * k) / n, ec)), m = Array.from({ length: n }, (_, k) => ray((2 * Math.PI * k) / n + Math.PI / n, em));
  return { em, c, m };
}
const waterbombEnd = (n) => Math.asin(Math.cos(Math.PI / n));

/**
 * The waterbomb base's model (Hanna, Lund, Lang, Magleby and Howell, Waterbomb base: a symmetric single-vertex
 * bistable origami mechanism, Smart Mater. Struct. 23 094009, 2014, for the base; the symmetric fold's sums are worked
 * here from its sectors keeping their angles): at a fold, the side creases' droop, every crease's fold, the middle's
 * height over the corners and the sheet's reach; each crease's strain t ψ / 2l and, where the panels close on it, its
 * pinch; the furthest fold the webs allow at the material's limit; and the grams.
 * @param {Waterbomb} p
 * @param {{ E: number, strainLimit?: number, density?: number, name?: string }} [m]
 * @param {{ fold?: number }} [o] fold: the corner creases' droop it is checked at, degrees (default the fold's end)
 * @returns {{ at: (fold: number) => { side: number, folds: { corner: number, side: number }, height: number, reach: number, strain: { corner: number, side: number }, pinch: number, vertices: number[][] },
 *   end: number, fold: number | null, limit: string | null, grams: number | null, margin: number | null, findings: object[] }}
 *   at(fold): fold is the corner creases' droop below flat, degrees, from 0 to the end; side: the side creases' droop;
 *   folds: each kind of crease's fold, degrees; height: the middle over the corners (mm); reach: the corners from the
 *   middle across (mm); strain: each kind's web strain; pinch: the fold at which the panels either side of a side
 *   crease meet (they close on their tops; the corner creases close on the web); vertices: the middle, then each corner
 *   and side's end in turn round; end: the fold where the side creases hang straight down; fold: the furthest that
 *   passes; limit: what stops it ('strain' or 'pinch'), null if it reaches the end; margin: the limit over the most
 *   strain at the checked fold
 */
export function waterbombModel(p, m, o = {}) {
  checkW('waterbombModel', p);
  if (m !== undefined) need('waterbombModel', {}, m);
  const n = p.sides, R = p.radius, Rm = R * Math.cos(Math.PI / n), h = p.thickness, { flex: l, thickness: t } = p.hinge, end = deg(waterbombEnd(n));
  const pinch = deg(Math.PI - 2 * Math.max(Math.atan(t / l), Math.atan((h - t / 2) / (l / 2 + h - t))));
  const at = (fold) => {
    if (!(typeof fold === 'number' && fold >= 0 && fold <= end + 1e-9)) throw refuse('waterbomb.fold', `waterbombModel: the fold is the corner creases' droop, from 0 (flat) to ${end.toFixed(2)} degrees (the side creases hanging straight down) (got ${JSON.stringify(fold)})`);
    const { em, c, m: s } = waterbombAt(n, rad(Math.min(fold, end))), nrm = (a, b) => unit(cross(a, b)), ang = (u, v) => deg(Math.acos(Math.min(1, Math.max(-1, dot(u, v)))));
    // the fold at side crease 0 (between sectors c0 m0 and m0 c1) and at corner crease 1 (between m0 c1 and c1 m1)
    const side = fold === 0 ? 0 : ang(nrm(c[0], s[0]), nrm(s[0], c[1 % n])), corner = fold === 0 ? 0 : ang(nrm(s[0], c[1 % n]), nrm(c[1 % n], s[1 % n]));
    const vertices = [[0, 0, 0]];
    for (let k = 0; k < n; k++) vertices.push(c[k].map((x) => x * R), s[k].map((x) => x * Rm));
    return { side: deg(em), folds: { corner, side }, height: R * Math.sin(rad(fold)), reach: R * Math.cos(rad(fold)), strain: { corner: (t * rad(corner)) / (2 * l), side: (t * rad(side)) / (2 * l) }, pinch, vertices };
  };
  let fold = null, limit = null;
  if (m?.strainLimit != null) {
    const fails = (f) => { const a = at(f); return Math.max(a.strain.corner, a.strain.side) > m.strainLimit ? 'strain' : a.folds.side > pinch ? 'pinch' : null; };
    if (!fails(end)) fold = end;
    else { let lo = 0, hi = end; for (let k = 0; k < 50; k++) { const mid = (lo + hi) / 2; if (fails(mid)) hi = mid; else lo = mid; } fold = lo; limit = fails(hi); }
  }
  const out = [], f = (level, text, code, values) => out.push({ level, text, code, ...(values ? { values } : {}) });
  const check = o.fold ?? end, a = at(check), most = Math.max(a.strain.corner, a.strain.side);
  let margin = null;
  if (m?.strainLimit != null) {
    margin = m.strainLimit / most;
    f(most <= m.strainLimit ? 'pass' : 'fail', `folded ${n2f(check)}° (the corners' droop) its corner creases fold ${n2f(a.folds.corner)}° and its side creases ${n2f(a.folds.side)}°; the webs see at most ${n2f(most * 100)}%, ${most <= m.strainLimit ? 'within' : 'over'} ${m.name ?? 'its'} limit of ${n2f(m.strainLimit * 100)}% (${n2f(margin)} times)`, 'flexure.strain', { fold: check, strain: most, limit: m.strainLimit, margin });
  }
  f(a.folds.side <= pinch ? 'pass' : 'fail', `the panels either side of a side crease meet at a ${n2f(pinch)}° fold; folded ${n2f(check)}° it is at ${n2f(a.folds.side)}°`, 'waterbomb.pinch', { fold: a.folds.side, pinch });
  let grams = null;
  if (m?.density > 0) { grams = (measureVolume(waterbomb(p)) / 1000) * m.density; f('pass', `${n2f(grams)} g printed${m.name ? ` in ${m.name}` : ''}, flat`, 'waterbomb.mass', { grams }); }
  return { at, end, fold, limit, grams, margin, findings: out };
}
const n2f = (x) => (Math.round(x * 100) / 100).toString();

// A triangle's prism: a face, and another above it (both in the same order round), as a closed solid
const prism3 = (lo, hi) => polyhedron({ points: [...lo, ...hi], faces: [[2, 1, 0], [3, 4, 5], [0, 1, 4, 3], [1, 2, 5, 4], [2, 0, 3, 5]], orientation: 'outward' });

/**
 * A waterbomb base (Waterbomb above), printed flat (fold 0): the web, the whole polygon t thick on the bed, and a
 * panel on each of the 2n sectors, set back half a web from its two creases and sloped back at 45°, so the first layer
 * is the whole sheet and no inside corner is square. Folded (fold above 0, the corners' droop in degrees), the panels
 * where the symmetric fold puts them (the webs left out), for a picture and a fit check.
 * @param {Waterbomb} p @param {number} [fold] (default 0, as printed)
 * @returns {object} the shape, a JSCAD geom3
 */
export function waterbomb(p, fold = 0) {
  checkW('waterbomb', p);
  const n = p.sides, R = p.radius, Rm = R * Math.cos(Math.PI / n), h = p.thickness, { flex: l, thickness: t } = p.hinge, rise = h - t, end = deg(waterbombEnd(n));
  if (!(typeof fold === 'number' && fold >= 0 && fold <= end + 1e-9)) throw refuse('waterbomb.fold', `waterbomb: the fold is the corner creases' droop, from 0 (flat) to ${end.toFixed(2)} degrees (got ${JSON.stringify(fold)})`);
  const { c, m: s } = waterbombAt(n, rad(Math.min(fold, end))), parts = [];
  for (let k = 0; k < n; k++) for (const q of [[[0, 0, 0], c[k].map((x) => x * R), s[k].map((x) => x * Rm)], [[0, 0, 0], s[k].map((x) => x * Rm), c[(k + 1) % n].map((x) => x * R)]]) {
    // sides in order: the first crease, the sheet's edge, the second crease; set back from the creases only
    const nm = normalOf([...q, q[2]]), d0 = [l / 2, 0, l / 2], d1 = [l / 2 + rise, 0, l / 2 + rise], lo = inset(q, nm, d0), hi = inset(q, nm, d1);
    if (fold === 0) parts.push(prism3(lo.map((x) => [x[0], x[1], t - 0.01]), hi.map((x) => [x[0], x[1], h])));
    else parts.push(prism3(lo, hi.map((x) => add(x, nm.map((v) => v * rise)))));
  }
  if (fold === 0) parts.push(extrudeLinear({ height: t }, polygon({ points: Array.from({ length: n }, (_, k) => [R * Math.cos((2 * Math.PI * k) / n), R * Math.sin((2 * Math.PI * k) / n)]) })));
  return union(...parts);
}

// --------------------------------------------------------------------------------------- the Kresling tube, printed

/** @typedef {Kresling & { wall: number, panel: { thickness: number }, hinge: { flex: number }, cap?: number, rim?: number }} KreslingTube
 *   the Kresling cell (sides, radius, height, twist: the state it is printed in, standing); wall: the wall's thickness
 *   out from the axis, which is each crease's web; panel.thickness: the panels' (h, over the wall), on the inside;
 *   hinge.flex: each crease's web, flex wide between the panels; cap: the solid floor under the bottom polygon (default
 *   1.2); rim: the ring over the top polygon, which keeps it a polygon (default 2, as wide in as it is tall) */

function checkKT(what, p) {
  if (!p || typeof p !== 'object') throw refuse('kresling.input', `${what}: a Kresling tube is { sides, radius, height, twist, wall, panel: { thickness }, hinge: { flex } } (got ${JSON.stringify(p)})`);
  need(what, { thickness: p.wall });
  if (!p.panel || !p.hinge) throw refuse('kresling.web', `${what}: give the panels' thickness (panel: { thickness }) and each crease's web (hinge: { flex })`);
  need(`${what}: panel`, { thickness: p.panel.thickness });
  need(`${what}: hinge`, { flex: p.hinge.flex });
  if (!(p.panel.thickness > p.wall)) throw refuse('kresling.web', `${what}: the panels (${p.panel.thickness} mm) are not thicker than the wall, the creases' web (${p.wall} mm)`);
  const cap = p.cap ?? 1.2, rim = p.rim ?? 2;
  need(what, { cap, rim });
  return { cap, rim };
}

// The tube's wall, as drawn: the outer face is the Kresling's triangles through the polygons' corners (radius R), the
// inner face the same corners w nearer the axis; floor and top close it. A closed solid, faces outward
function kreslingShell(n, R, h, phi, w) {
  const al = (2 * Math.PI) / n, pt = (r, q, z) => [r * Math.cos(q), r * Math.sin(q), z];
  const pts = [];
  for (let i = 0; i < n; i++) pts.push(pt(R, i * al, 0), pt(R - w, i * al, 0), pt(R, i * al + phi, h), pt(R - w, i * al + phi, h));
  const B = (i) => 4 * (i % n), b = (i) => 4 * (i % n) + 1, T = (i) => 4 * (i % n) + 2, t = (i) => 4 * (i % n) + 3, faces = [];
  for (let i = 0; i < n; i++) {
    faces.push([B(i), B(i + 1), T(i)], [B(i + 1), T(i + 1), T(i)]); // outside, seen from outside
    faces.push([b(i), t(i), b(i + 1)], [b(i + 1), t(i), t(i + 1)]); // inside
    faces.push([B(i), b(i), b(i + 1), B(i + 1)], [T(i), T(i + 1), t(i + 1), t(i)]); // floor and top
  }
  return polyhedron({ points: pts, faces, orientation: 'outward' });
}

// The fold at a polygon's edge: the turn of the triangle on it about the edge, from the edge's outward level line,
// so a change between two states is the hinge's turn there. The edge a, b; the triangle's third corner c
const edgeTilt = (a, b, c) => {
  const e = unit(sub(b, a)), u0 = sub(c, a), u = unit(sub(u0, e.map((x) => x * dot(u0, e)))), out = unit([e[1], -e[0], 0]); // the edge runs round anticlockwise, so out is to its right
  return deg(Math.atan2(u[2], dot(u, out)));
};

/**
 * A Kresling tube printed standing in its first state (KreslingTube above): one piece, the floor on the bed, the
 * wall's triangles with a panel inside each, set back from its three creases by the web and sloped back at 3:1 (so no
 * panel's underside overhangs more than the printer allows), and the ring on top. The other state is where the panels
 * stretch through to and stand again: the creases' turn from print to there bends the webs.
 * @param {KreslingTube} p
 * @returns {object} the shape, a JSCAD geom3
 */
export function kreslingTube(p) {
  const { cap, rim } = checkKT('kreslingTube', p), n = p.sides, R = p.radius, h0 = p.height, phi = rad(p.twist), w = p.wall, l = p.hinge.flex, rise = p.panel.thickness - w;
  kreslingModel({ ...p, hinge: undefined }); // its sides, radius, height and twist checked
  const al = (2 * Math.PI) / n, pt = (r, q, z) => [r * Math.cos(q), r * Math.sin(q), z], parts = [kreslingShell(n, R, h0, phi, w)];
  for (let i = 0; i < n; i++) {
    const Bi = pt(R - w, i * al, 0), Bj = pt(R - w, (i + 1) * al, 0), Ti = pt(R - w, i * al + phi, h0), Tj = pt(R - w, (i + 1) * al + phi, h0);
    // each inner triangle, seen from the axis anticlockwise; its sides in order, and how far back each one's panel
    // starts: a crease between two panels half a web, the floor's and the ring's edges a whole web over them
    for (const [q, back] of [[[Bi, Ti, Bj], [l / 2, l / 2, cap + l]], [[Bj, Ti, Tj], [l / 2, l, l / 2]]]) {
      const nm = normalOf([...q, q[2]]), lo = inset(q, nm, back), hi = inset(q, nm, back.map((d) => d + 3 * rise));
      if (!(dot(cross(sub(hi[1], hi[0]), sub(hi[2], hi[0])), nm) > 1)) throw refuse('kresling.panel', `kreslingTube: the panels, set back from their creases by the web and sloped back 3:1 over ${n2f(rise)} mm, leave next to nothing of their triangles: a bigger tube, narrower webs or thinner panels`);
      parts.push(prism3(lo.map((x) => add(x, nm.map((v) => -v * 0.01))), hi.map((x) => add(x, nm.map((v) => v * rise)))));
    }
  }
  const poly = (r, q0, z) => Array.from({ length: n }, (_, i) => pt(r, i * al + q0, z));
  parts.push(extrudeLinear({ height: cap }, polygon({ points: poly(R, 0, 0).map((x) => [x[0], x[1]]) })));
  // the ring: on the wall's top (w wide) from h0 up by rim, and a third of rim further in, its underside rising 2:1 in
  // from the wall's inside edge, so every layer of it is at least the wall's width and stands on the one below
  const ri = Math.min(rim / 3, R / 3), prof = [[R, h0], [R, h0 + rim], [R - w - ri, h0 + rim], [R - w - ri, h0 + 2 * ri], [R - w, h0]], np = prof.length;
  const ringPts = [], faces = [];
  for (let i = 0; i < n; i++) for (const [r, z] of prof) ringPts.push(pt(r, i * al + phi, z));
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, at = (c, k) => c * np + k;
    for (let k = 0; k < np; k++) { const k1 = (k + 1) % np; faces.push([at(i, k), at(j, k), at(j, k1), at(i, k1)]); }
  }
  parts.push(polyhedron({ points: ringPts, faces, orientation: 'outward' }));
  return union(...parts);
}

/**
 * What a Kresling tube printed standing (KreslingTube) does: its two states (kreslingModel), every crease's turn from
 * the printed state to the other (the sides, the diagonals, and the polygons' edges at the floor and the ring), each
 * web's strain t ψ / 2l there, the panels' stretch on the way over (the panels as bars, an estimate), the push over
 * the barrier and the energy, the steepest overhang of the drawn solid against the printer's, and the grams.
 * @param {KreslingTube} p
 * @param {{ E: number, strainLimit: number, density?: number, name?: string }} m flexureMaterial(rules): a rubber's
 *   flex_strain is its limit
 * @param {{ overhang?: number }} [printer] overhang: the steepest from vertical it prints (degrees, default 45)
 * @returns {{ states: object[], bistable: boolean, turns: { side: number, diagonal: number, floor: number, ring: number }, strain: number, stretch: number | null,
 *   barrier: { height: number, energy: number, force: number } | null, overhang: number, margin: number | null, grams: number | null, findings: object[] }}
 *   turns: each crease's turn from print to the second state, degrees; strain: the most any web sees there; stretch:
 *   the most a panel stretches on the way; overhang: the steepest underside of the drawn solid off its floor, degrees
 *   from vertical; margin: the limit over the worse of strain and stretch
 */
export function kreslingTubeModel(p, m, printer = {}) {
  checkKT('kreslingTubeModel', p);
  need('kreslingTubeModel', {}, m);
  if (!(m.strainLimit > 0)) throw refuse('kresling.material', 'kreslingTubeModel: the material needs a strainLimit (flexureMaterial(rules) gives one; a rubber\'s is its flex_strain)');
  const k = kreslingModel({ ...p, hinge: undefined }, m), n = p.sides, R = p.radius, al = (2 * Math.PI) / n, out = [], f = (level, text, code, values) => out.push({ level, text, code, ...(values ? { values } : {}) });
  const limit = m.strainLimit, over = printer.overhang ?? 45;
  const turnsAt = (st) => {
    const phi = rad(st.twist), pt = (q, z) => [R * Math.cos(q), R * Math.sin(q), z], B0 = pt(0, 0), B1 = pt(al, 0), T0 = pt(phi, st.height), T1 = pt(al + phi, st.height);
    // the floor's edge B0 B1 turns the lower triangle (third corner T0); the ring's edge T0 T1 the upper (third corner B1)
    return { side: st.folds.side, diagonal: st.folds.diagonal, floor: edgeTilt(B0, B1, T0), ring: edgeTilt(T0, T1, B1) };
  };
  let turns = { side: 0, diagonal: 0, floor: 0, ring: 0 }, strain = 0, stretch = null, barrier = null;
  if (!k.bistable) f('fail', `with these sides it has no second state with its top above its floor: a taller first state or more twist`, 'kresling.states', { states: k.states });
  else {
    const a = turnsAt(k.states[0]), b = turnsAt(k.states[1]);
    turns = { side: Math.abs(b.side - a.side), diagonal: Math.abs(b.diagonal - a.diagonal), floor: Math.abs(b.floor - a.floor), ring: Math.abs(b.ring - a.ring) };
    // the side and diagonal webs are the wall (w thick) between panels; the floor's and ring's webs too
    strain = (p.wall * rad(Math.max(...Object.values(turns)))) / (2 * p.hinge.flex);
    stretch = k.barrier.stretch; barrier = { height: k.barrier.height, energy: k.barrier.energy, force: k.barrier.force };
    f('pass', `printed ${n2f(p.height)} mm tall at ${n2f(p.twist)}°, it stands again ${n2f(k.states[1].height)} mm tall at ${n2f(k.states[1].twist)}°; pushed over it takes up to ${n2f(barrier.force)} N, and the panels stretch up to ${n2f(stretch * 100)}% on the way (as bars: an estimate)`, 'kresling.states', { states: k.states, barrier, stretch });
    f(strain <= limit ? 'pass' : 'fail', `from print to the second state the creases turn ${n2f(turns.side)}° (sides), ${n2f(turns.diagonal)}° (diagonals), ${n2f(turns.floor)}° (floor) and ${n2f(turns.ring)}° (ring): the webs see at most ${n2f(strain * 100)}%, ${strain <= limit ? 'within' : 'over'} ${m.name ?? 'its'} limit of ${n2f(limit * 100)}%`, 'flexure.strain', { turns, strain, limit });
    f(stretch <= limit ? 'pass' : 'fail', `the panels stretch up to ${n2f(stretch * 100)}% between the states, ${stretch <= limit ? 'within' : 'over'} the limit of ${n2f(limit * 100)}%${stretch <= limit ? '' : ': a stiffer material would break; this fold wants a rubber, or a twist nearer the polygon\'s'}`, 'kresling.stretch', { stretch, limit });
  }
  const margin = k.bistable ? limit / Math.max(strain, stretch) : null;
  // the steepest underside of the drawn solid, off the floor (z > 0): a face whose outward normal points down by nz
  // overhangs asin(-nz) from vertical
  const shape = kreslingTube(p), polys = jscad.geometries.geom3.toPolygons(shape);
  let overhang = 0;
  for (const g of polys) {
    const v = g.vertices, nz = jscad.maths.plane.fromPoints(jscad.maths.plane.create(), ...v)[2];
    if (nz < -1e-9 && Math.max(...v.map((x) => x[2])) > 1e-6) overhang = Math.max(overhang, deg(Math.asin(Math.min(1, -nz))));
  }
  f(overhang <= over + 1e-6 ? 'pass' : 'fail', `printed standing on its floor, its steepest underside is ${n2f(overhang)}° from vertical${overhang <= over + 1e-6 ? `, within the ${over}° it prints without supports` : `, past the ${over}° it prints without supports: less twist, or thinner panels`}`, 'kresling.overhang', { overhang, limit: over });
  let grams = null;
  if (m.density > 0) { grams = (measureVolume(shape) / 1000) * m.density; f('pass', `${n2f(grams)} g printed${m.name ? ` in ${m.name}` : ''}`, 'kresling.mass', { grams }); }
  return { states: k.states, bistable: k.bistable, turns, strain, stretch, barrier, overhang, margin, grams, findings: out };
}
