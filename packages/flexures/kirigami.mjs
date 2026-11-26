// Kirigami printed flat: rotating squares. A sheet cut by slots into squares, each joined to its four neighbours by a
// neck at one corner, so pulled along one side the squares turn, alternately one way and the other, and the sheet
// grows both ways at once (a Poisson's ratio of -1). The same cell tiled is the chiral lattice of rotating squares, a
// block many times softer in its plane than the plastic it is printed from (Grima and Evans, Auxetic behavior from
// rotating squares, J. Mater. Sci. Lett. 19, 1563, 2000).
//
// The slots: through every grid vertex one slot, along x and along y in turn (a checkerboard), each g wide with round
// ends (radius r = g / 2), stopping a neck w short of the slots either side. So every neck has a round slot end on one
// side and a slot's straight side on the other: a one-sided notch hinge. Its stiffness and its peak strain per radian
// are tabulated from the kit's own plane-stress finite elements (@rulecad/fea): neckFE below solves one neck and
// regenerates any row of the table; the test re-runs one. The thin-neck formula (Paros and Weisbord 1965, with a
// one-sided notch as a two-sided one of twice the radius) gives the trend, but stiffer than the neck as drawn, as it
// leaves out the squares' give round the neck's roots.
//
// The mechanism: each square's four necks sit on its four sides, (g + w) / 2 from a corner, going round, so the necks
// of one square make a square of side s, turned α0 from the grid, and the neighbours turn the other way. Each neck
// turns twice as far as its squares. Drawn flat at rest (α0), the sheet in the bed's plane, so every neck bends
// within its layers. Units: mm, N, MPa; angles in degrees where a caller gives or reads them.
import jscad from '@jscad/modeling';
import { grid, analyse } from '@rulecad/fea';

const { cuboid, polygon } = jscad.primitives;
const { subtract, union } = jscad.booleans;
const { translate } = jscad.transforms;
const { extrudeLinear } = jscad.extrusions;

/** @returns {never} */
const refuse = (code, text) => { throw Object.assign(new Error(`${code}: ${text}`), { code }); };
const said = (v) => JSON.stringify(v) ?? String(v);
const DEG = Math.PI / 180;
const size = (what, p, k, text) => { if (!(typeof p[k] === 'number' && Number.isFinite(p[k]) && p[k] > 0)) refuse('kirigami.size', `${what}: ${k} is ${text}, a size above 0 mm (got ${said(p[k])})`); return p[k]; };

// The one-sided neck, solved by the kit's plane-stress elements on a grid of w / 25 (neckFE at h = 0.04 for w = 1):
// rho = r / w; k = the stiffness over E b w² (the turn read 1 w out beyond the round end, either side); e = the peak
// strain per radian of turn, on the round side (cells cut by the round end take the share of them that is solid, so
// the edge is not a staircase). Kind: derived (computed here 2026-11-25, scratch table in the step's report).
const NECK = [
  [0.5, 0.04944, 0.4007], [0.75, 0.04457, 0.3378], [1, 0.04088, 0.2967], [1.5, 0.03507, 0.2459],
  [2, 0.03159, 0.2110], [3, 0.02666, 0.1744], [4, 0.02347, 0.1531], [6, 0.01952, 0.1256],
];
const RHO = [NECK[0][0], NECK[NECK.length - 1][0]];
// straight lines between the rows, in log rho and log value (both fall as a power of rho)
// (rho is clamped to the table first: the refusal lets a hair past either end through, which findIndex would miss)
const lookup = (rho0, col) => {
  const rho = Math.min(RHO[1], Math.max(RHO[0], rho0));
  const i = Math.max(0, NECK.findIndex((row) => row[0] >= rho) - 1), a = NECK[i], b = NECK[Math.min(i + 1, NECK.length - 1)];
  if (a === b) return a[col];
  const u = Math.log(rho / a[0]) / Math.log(b[0] / a[0]);
  return Math.exp(Math.log(a[col]) + u * Math.log(b[col] / a[col]));
};

/**
 * One neck solved by plane-stress finite elements (@rulecad/fea), for a neck of width 1: the round end of radius rho
 * over a straight side, the squares either side 3 wide and the sheet 3 above the round end, the left side held and a
 * pure turning moment on the right. Its stiffness over E b w² and its peak strain per radian of turn (on the round
 * side, read out from the cell centres to the edge). This is how the table behind neckHingeModel was made (h 0.04).
 * @param {number} rho the round end's radius over the neck's width, 0.5 to 6
 * @param {number} [h] the grid's cell, as a share of the neck's width (default 0.04: 25 cells across the neck)
 * @returns {{ stiffness: number, strain: number, flat: number }} flat: the peak strain per radian on the straight side
 */
export function neckFE(rho, h = 0.04) {
  if (!(typeof rho === 'number' && rho >= RHO[0] && rho <= RHO[1])) refuse('kirigami.radius', `neckFE: rho is the round end's radius over the neck, from ${RHO[0]} to ${RHO[1]} (got ${said(rho)})`);
  if (!(typeof h === 'number' && h > 0 && h <= 0.1)) refuse('kirigami.size', `neckFE: h is the grid's cell as a share of the neck, above 0 and at most 0.1 (got ${said(h)})`);
  const r = rho, w = 1, arm = 3, tall = 3, X = r + arm, H = w + r + tall, nx = Math.round((2 * X) / h), ny = Math.round(H / h), g = grid({ nx, ny, h });
  const cut = (x, y) => Math.abs(x) <= r && y >= w + r - Math.sqrt(Math.max(0, r * r - x * x)), density = new Float64Array(g.cells);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    let solid = 0; // the share of the cell that is solid, from 6 × 6 points
    for (let a = 0; a < 6; a++) for (let c = 0; c < 6; c++) if (!cut(-X + (i + (a + 0.5) / 6) * h, (j + (c + 0.5) / 6) * h)) solid++;
    density[j * nx + i] = Math.max(1e-6, solid / 36);
  }
  const fixed = new Uint8Array(g.dofs), load = new Float64Array(g.dofs), ys = Array.from({ length: ny + 1 }, (_, j) => j * h), I = ys.reduce((s, y) => s + (y - H / 2) ** 2, 0);
  for (let j = 0; j <= ny; j++) { const n = g.node(0, j); fixed[2 * n] = 1; fixed[2 * n + 1] = 1; load[2 * g.node(nx, j) + 0] = -(ys[j] - H / 2) / I; }
  const res = analyse({ grid: g, density, material: { E: 1, nu: 0.35 }, thickness: 1, fixed, loads: [load] }), u = res.u[0], s = res.stress[0];
  const turnAt = (x) => { const i = Math.round((x + X) / h), j0 = Math.round(0.2 / h), j1 = Math.round((H - 0.2) / h); return -(u[2 * g.node(i, j1)] - u[2 * g.node(i, j0)]) / ((j1 - j0) * h); };
  const turn = turnAt(r + 1) - turnAt(-r - 1), out = w / 2 / (w / 2 - h / 2);
  let flat = 0, round = 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = -X + (i + 0.5) * h, y = (j + 0.5) * h, e = j * nx + i;
    if (Math.abs(x) > r + 0.5) continue;
    if (j === 0) flat = Math.max(flat, s[e]);
    if (y > w / 2 && density[e] > 0.999) round = Math.max(round, s[e]);
  }
  return { stiffness: 1 / turn, strain: (round * out) / turn, flat: (flat * out) / turn };
}

/**
 * A kirigami neck: a one-sided notch hinge, the round end of a slot (radius r) over the straight side of another, w
 * apart at the narrowest, b deep. Its stiffness and peak strain from the table above (the kit's finite elements);
 * thinNeck is Paros and Weisbord's thin-neck formula for the same neck, for comparison.
 * @param {{ neck: number, radius: number, depth: number }} p neck: w, the narrowest width; radius: r, the slot end's;
 *   depth: b, up z (the sheet's thickness on the bed). r / w from 0.5 to 6
 * @param {{ E: number, strainLimit?: number }} m
 * @returns {{ stiffness: number, strain: (turn: number) => number, turn: (strain: number) => number, rho: number,
 *   thinNeck: number, limit?: number }} stiffness N·mm a radian; strain at a turn (radians), and the turn for a strain;
 *   limit: the most it turns within the material's strain limit (radians)
 */
export function neckHingeModel(p, m) {
  if (!p || typeof p !== 'object') refuse('kirigami.input', `neckHingeModel: a neck is { neck, radius, depth } (got ${said(p)})`);
  const w = size('neckHingeModel', p, 'neck', 'the narrowest width'), r = size('neckHingeModel', p, 'radius', "the slot end's radius"), b = size('neckHingeModel', p, 'depth', "the sheet's thickness");
  if (!(m && m.E > 0)) refuse('kirigami.material', `neckHingeModel: the material needs a modulus E above 0 MPa (got ${said(m?.E)})`);
  const rho = r / w;
  if (!(rho >= RHO[0] - 1e-9 && rho <= RHO[1] + 1e-9)) refuse('kirigami.radius', `neckHingeModel: the slot end's radius over the neck is ${rho.toFixed(3)}; from ${RHO[0]} to ${RHO[1]} is modelled (a radius from ${(RHO[0] * w).toFixed(2)} to ${(RHO[1] * w).toFixed(2)} mm for this neck)`);
  const k = m.E * b * w * w * lookup(rho, 1), e = lookup(rho, 2);
  return {
    stiffness: k, strain: (th) => e * Math.abs(th), turn: (s) => s / e, rho,
    thinNeck: (2 * m.E * b * w ** 2.5) / (9 * Math.PI * Math.sqrt(2 * r)),
    ...(m.strainLimit != null ? { limit: m.strainLimit / e } : {}),
  };
}

/**
 * @typedef {{ pitch: number, neck: number, slot: number, depth: number, across: number, rows: number }} RotatingSquares
 *   pitch: a, the squares' size, centre to centre; neck: w, each neck's narrowest width; slot: g, every slot's width
 *   (its ends round, radius g / 2); depth: b, the sheet's thickness up z; across, rows: whole squares along x and y
 */
function sheetOf(what, p) {
  if (!p || typeof p !== 'object') refuse('kirigami.input', `${what}: a sheet is { pitch, neck, slot, depth, across, rows } (got ${said(p)})`);
  const a = size(what, p, 'pitch', "the squares' size"), w = size(what, p, 'neck', "each neck's width"), g = size(what, p, 'slot', "every slot's width"), b = size(what, p, 'depth', "the sheet's thickness");
  for (const k of ['across', 'rows']) if (!(Number.isInteger(p[k]) && p[k] >= 2)) refuse('kirigami.count', `${what}: ${k} is a whole number of squares, 2 or more (got ${said(p[k])})`);
  const r = g / 2, reach = a - r - w; // a slot's tip from its vertex
  if (!(reach >= r + 1e-9)) refuse('kirigami.pitch', `${what}: a pitch of ${a} mm leaves no room for a slot ${g} mm wide and a neck of ${w} mm: over ${(2 * r + w).toFixed(2)} mm`);
  const d = r + w / 2, s = Math.hypot(a - d, d), alpha0 = Math.atan2(d, a - d);
  return { a, w, g, b, r, reach, d, s, alpha0, n: p.across, m: p.rows };
}
const stadium = (cx, cy, along, half, r) => { // a slot through (cx, cy), along x or y, its tips half from the centre
  const pts = [], c = half - r, steps = 16;
  for (let k = 0; k <= steps; k++) { const t = -Math.PI / 2 + (Math.PI * k) / steps; pts.push([c + r * Math.cos(t), r * Math.sin(t)]); }
  for (let k = 0; k <= steps; k++) { const t = Math.PI / 2 + (Math.PI * k) / steps; pts.push([-c + r * Math.cos(t), r * Math.sin(t)]); }
  return pts.map(([x, y]) => (along === 'x' ? [cx + x, cy + y] : [cx - y, cy + x]));
};

/**
 * A rotating-squares sheet, drawn flat at rest: a plate across × rows squares of pitch a, b thick, from (0, 0) up, cut
 * by its slots. Through each grid vertex (i a, j a) one slot, along x where i + j is even and along y where it is odd,
 * running out of the sheet at its edges. One piece, printed on its face.
 * @param {RotatingSquares} p
 * @returns {object} the shape, a JSCAD geom3
 */
export function rotatingSquares(p) {
  const S = sheetOf('rotatingSquares', p), { a, b, r, reach, n, m } = S, W = n * a, H = m * a;
  const cuts = [];
  for (let j = 0; j <= m; j++) for (let i = 0; i <= n; i++) cuts.push(translate([0, 0, -1], extrudeLinear({ height: b + 2 }, polygon({ points: stadium(i * a, j * a, (i + j) % 2 ? 'y' : 'x', reach, r) }))));
  return subtract(cuboid({ center: [W / 2, H / 2, b / 2], size: [W, H, b] }), union(cuts));
}

/**
 * A rotating-squares sheet's model: its necks (neckHingeModel), the squares' turn at rest, how the sheet grows as the
 * necks turn, its in-plane modulus as a material (Grima and Evans: E = 8 K / (s² b (1 - sin 2α)), Poisson's ratio -1),
 * and pulled along x by its two sides, its stiffness, force and strain at a stretch. The sheet's energy is every
 * neck's, ½ K (2 Δα)², and its width n s (cos α + sin α) between the necks of its end squares, so the pull is
 * dU/dα over dX/dα: large turns counted, the necks' stiffness taken as straight.
 * @param {RotatingSquares} p
 * @param {{ E: number, strainLimit?: number, density?: number, name?: string }} m
 * @returns {{ neck: ReturnType<typeof neckHingeModel>, side: number, rest: number, necks: number, E: number, poisson: number,
 *   stiffness: number, at: (stretch: number) => { turn: number, force: number, strain: number, sheet: number }, stretchFor: (force: number) => number,
 *   limit?: { stretch: number, turn: number, force: number, sheet: number }, size: [number, number, number], area: number,
 *   volume: number, solid: number, grams?: number }}
 *   side: s, the square through each square's necks; rest: α0, the squares' turn as drawn (degrees); necks: how many;
 *   E: the in-plane modulus at rest (MPa); stiffness: the sheet's pull along x at rest, N/mm; at(stretch mm): the necks'
 *   turn (degrees), the force (N), the necks' peak strain and the sheet's strain; stretchFor(force N): the stretch a
 *   pull gives, mm; limit: the stretch at the necks'
 *   strain limit; solid: the share of the plate that is left after the slots
 */
export function rotatingSquaresModel(p, m) {
  const S = sheetOf('rotatingSquaresModel', p), { a, w, b, r, reach, s, alpha0: a0, n, m: rows } = S;
  if (!(m && m.E > 0)) refuse('kirigami.material', `rotatingSquaresModel: the material needs a modulus E above 0 MPa (got ${said(m?.E)})`);
  const neck = neckHingeModel({ neck: w, radius: r, depth: b }, m), K = neck.stiffness, N = (n - 1) * rows + n * (rows - 1);
  const X = (al) => n * s * (Math.cos(al) + Math.sin(al)), X0 = X(a0);
  const force = (al) => (N * 4 * K * (al - a0)) / (n * s * (Math.cos(al) - Math.sin(al))); // dU/dα over dX/dα, U = N ½ K (2(α - α0))²
  const alphaAt = (x) => { let lo = a0, hi = Math.PI / 4; for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; if (X(mid) - X0 < x) lo = mid; else hi = mid; } return (lo + hi) / 2; };
  if (X(Math.PI / 4) - X0 <= 0) refuse('kirigami.pitch', 'rotatingSquaresModel: the squares are already fully open at rest');
  const at = (x) => {
    if (!(typeof x === 'number' && x >= 0 && x < X(Math.PI / 4) - X0)) refuse('kirigami.stretch', `rotatingSquaresModel: a stretch is from 0 to under ${(X(Math.PI / 4) - X0).toFixed(3)} mm, where the squares are fully open (got ${said(x)})`);
    const al = alphaAt(x), turn = 2 * (al - a0);
    return { turn: turn / DEG, force: force(al), strain: neck.strain(turn), sheet: x / X0 };
  };
  const c = Math.cos(a0), sn = Math.sin(a0), stiffness = (N * 4 * K) / (n * n * s * s * (c - sn) ** 2);
  let limit;
  if (neck.limit != null) {
    const al = Math.min(Math.PI / 4, a0 + neck.limit / 2), x = X(al) - X0;
    limit = { stretch: x, turn: (2 * (al - a0)) / DEG, force: force(al), sheet: x / X0 };
  }
  // the slots' area inside the sheet: each a stadium, cut in half by an edge it lies on, in four at a corner
  const slot = Math.PI * r * r + 2 * r * 2 * (reach - r);
  let cut = 0;
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= n; i++) cut += slot * (i === 0 || i === n ? 0.5 : 1) * (j === 0 || j === rows ? 0.5 : 1);
  const area = n * a * rows * a - cut;
  // the stretch a pull gives: the force rises with the turn up to fully open, so a bisection on the turn finds it
  const stretchFor = (F) => {
    if (!(typeof F === 'number' && F >= 0)) refuse('kirigami.force', `rotatingSquaresModel: a pull is a force of 0 N or more (got ${said(F)})`);
    let lo = a0, hi = Math.PI / 4 - 1e-9;
    for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; if (force(mid) < F) lo = mid; else hi = mid; }
    return X((lo + hi) / 2) - X0;
  };
  return {
    neck, side: s, rest: a0 / DEG, necks: N, stretchFor, E: (8 * K) / (s * s * b * (1 - Math.sin(2 * a0))), poisson: -1, stiffness, at,
    ...(limit ? { limit } : {}), size: [n * a, rows * a, b], area, volume: area * b, solid: area / (n * a * rows * a),
    ...(m.density ? { grams: (area * b * m.density) / 1000 } : {}),
  };
}

/**
 * Whether a rotating-squares sheet prints as drawn and lasts at its stretch, as findings in the kit's one shape: the
 * necks in whole printed lines (kirigami.neck), the slots wide enough to stay open (kirigami.slot), the thickness in
 * whole layers (kirigami.layers), the squares in the bed's plane (kirigami.direction), and the necks' strain at the
 * stretch against the material's limit (kirigami.strain).
 * @param {RotatingSquares & { stretch?: number }} p stretch: how far the sheet is pulled along x, mm
 * @param {{ line: number, layer: number, wall_min?: number }} printer
 * @param {{ strainLimit?: number, name?: string }} [material]
 * @param {ReturnType<typeof rotatingSquaresModel>} [model]
 * @returns {{ level: 'pass' | 'warn' | 'fail', text: string, code: string, values?: object }[]}
 */
export function kirigamiFindings(p, printer, material, model) {
  const { w, g, b } = sheetOf('kirigamiFindings', p), out = [], f = (level, text, code, values) => out.push({ level, text, code, ...(values ? { values } : {}) });
  if (!(printer && printer.line > 0 && printer.layer > 0)) refuse('kirigami.printer', `kirigamiFindings: the printer needs its line width and layer height above 0 mm (got ${said(printer)})`);
  const lines = w / printer.line, least = (printer.wall_min ?? 2 * printer.line) / printer.line;
  if (lines < least - 0.05) f('fail', `necks ${w} mm wide are under ${least} lines of ${printer.line} mm: too thin to print`, 'kirigami.neck', { neck: w, lines });
  else if (Math.abs(lines - Math.round(lines)) > 0.05) f('warn', `necks ${w} mm wide are ${lines.toFixed(2)} lines of ${printer.line} mm: a whole number prints as drawn (${(Math.round(lines) * printer.line).toFixed(2)} mm)`, 'kirigami.neck', { neck: w, lines });
  else f('pass', `necks ${w} mm wide: ${Math.round(lines)} lines of ${printer.line} mm`, 'kirigami.neck', { neck: w, lines: Math.round(lines) });
  const open = 2 * printer.line;
  f(g >= open ? 'pass' : 'fail', `slots ${g} mm wide${g >= open ? '' : `, under two lines (${open.toFixed(2)} mm): the squares would print joined`}`, 'kirigami.slot', { slot: g, least: open });
  const layers = b / printer.layer;
  if (Math.abs(layers - Math.round(layers)) > 0.05) f('warn', `${b} mm thick is ${layers.toFixed(2)} layers of ${printer.layer} mm: a whole number prints as drawn`, 'kirigami.layers', { depth: b, layers });
  f('pass', "the squares lie in the bed's plane: every neck bends within its layers, and the sheet prints flat with no overhangs", 'kirigami.direction');
  if (p.stretch != null && model) {
    const x = model.at(p.stretch), limit = material?.strainLimit;
    if (limit != null) f(x.strain <= limit ? 'pass' : 'fail', `pulled ${+p.stretch.toFixed(2)} mm (${(x.sheet * 100).toFixed(2)}%), each neck turns ${x.turn.toFixed(2)}° and sees ${(x.strain * 100).toFixed(2)}% strain${x.strain <= limit ? ', within' : ', over'} ${material.name ?? 'its'} limit of ${(limit * 100).toFixed(2)}%${x.strain > limit && model.limit ? `: at most ${model.limit.stretch.toFixed(2)} mm` : ` (${(limit / x.strain).toFixed(2)} times)`}`, 'kirigami.strain', { stretch: p.stretch, strain: x.strain, limit, force: x.force });
  }
  return out;
}
