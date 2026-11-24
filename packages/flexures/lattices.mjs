// Lattices: cells that make a printed block behave as a soft spring. A honeycomb's walls bend when the block is
// pressed, so the block is many times softer than solid plastic; a re-entrant (auxetic) honeycomb, its slanted walls
// leaning inwards, draws its sides in when pressed instead of bulging them out (a negative Poisson's ratio).
//
// The cell: upright walls of length h, slanted walls of length l at an angle θ to x (θ below 0 leans them inwards:
// re-entrant), every wall t thick across and b deep (up z, the block's height off the bed). Its in-plane stiffness,
// Poisson's ratios and wall stresses are Gibson and Ashby's, from the slanted walls' bending (Cellular Solids, 2nd ed.,
// 1997, chapter 4); its buckling under a squeeze along y is theirs too, with their end-fixity factor for a regular
// cell. A whole block (cells between two solid plates) is solved as a frame of beams in @rulecad/fea, so the plates
// holding its ends and its free sides are counted, and its walls' buckling is found from the same frame.
//
// Drawn flat: the cells lie in the bed's plane, so every wall bends within its layers, and the block is printed on
// its face. Units: mm, N, MPa, degrees for the cell's angle.
import jscad from '@jscad/modeling';
import { frame, subdivide } from '@rulecad/fea/frame';

const { cuboid, polygon } = jscad.primitives;
const { subtract, union } = jscad.booleans;
const { translate } = jscad.transforms;
const { extrudeLinear } = jscad.extrusions;

/** @returns {never} */
const refuse = (code, text) => { throw Object.assign(new Error(`${code}: ${text}`), { code }); };
const said = (v) => JSON.stringify(v) ?? String(v);
const positive = (what, p, keys) => { for (const k of keys) if (!(typeof p[k] === 'number' && Number.isFinite(p[k]) && p[k] > 0)) refuse('lattice.size', `${what}: ${k} is a size above 0 mm (got ${said(p[k])})`); };
const whole = (what, p, k, least) => { if (!(Number.isInteger(p[k]) && p[k] >= least)) refuse('lattice.count', `${what}: ${k} is a whole number of cells, ${least} or more (got ${said(p[k])})`); };
const DEG = Math.PI / 180;

/**
 * @typedef {object} LatticeCell a honeycomb's cell, drawn in the bed's plane
 * @property {number} slant l: each slanted wall's length, mm, centreline to centreline
 * @property {number} upright h: each upright wall's length (along y), mm
 * @property {number} angle θ: the slanted walls' angle to x, degrees; 30 with h = l is a regular honeycomb, below 0 a
 *   re-entrant one. Between 5 and 85 either way
 * @property {number} thickness t: every wall's thickness across, mm (whole printed lines prints as drawn)
 * @property {number} depth b: the walls' depth, up z from the bed, mm
 */
/** @typedef {{ E: number, strainLimit?: number, density?: number, name?: string }} LatticeMaterial E in MPa; strainLimit as a fraction; density g/cm³ */

// The cell, checked: its sizes, its angle and that its walls stay apart, each refused by name before any sums
function cellOf(what, p) {
  if (!p || typeof p !== 'object') refuse('lattice.input', `${what}: a cell is { slant, upright, angle, thickness, depth } (got ${said(p)})`);
  positive(what, p, ['slant', 'upright', 'thickness', 'depth']);
  const { slant: l, upright: h, angle, thickness: t, depth: b } = p;
  if (!(typeof angle === 'number' && Math.abs(angle) >= 5 && Math.abs(angle) <= 85)) refuse('lattice.angle', `${what}: angle is the slanted walls' angle to x, from 5 to 85 degrees (a honeycomb) or -5 to -85 (re-entrant); got ${said(angle)}. Nearer 0 the walls stretch instead of bending, past 85 the cell has no width`);
  const s = Math.sin(angle * DEG), c = Math.cos(angle * DEG), dx = l * c, rise = h + l * s;
  if (h / 2 + l * s <= 0) refuse('lattice.cross', `${what}: a re-entrant cell's upright walls must be over 2 l |sin θ| = ${(2 * l * Math.abs(s)).toFixed(3)} mm long, or its top and bottom points cross (got ${h})`);
  const across = 2 * dx - t, tall = h + 2 * l * s - t / c, gap = Math.min(across, tall);
  if (!(gap > 0)) refuse('lattice.thick', `${what}: walls ${t} mm thick fill the cell (its opening would be ${across.toFixed(3)} mm across and ${tall.toFixed(3)} mm tall): thinner walls, or a larger cell`);
  return { l, h, t, b, s, c, dx, rise, gap, across, tall, reentrant: s < 0 };
}

/**
 * A honeycomb cell's in-plane properties, from its walls' bending (Gibson and Ashby 1997, chapter 4): Young's moduli
 * along x (1) and y (2), Poisson's ratios, the shear modulus, the density against solid, the most strain a wall sees
 * for a strain of the whole along each axis, and the stress at which the upright walls buckle under a squeeze along y.
 * A re-entrant cell (angle below 0) has negative Poisson's ratios. Good while the walls are thin (t / l under about
 * 0.25): the walls' stretching is left out.
 * @param {LatticeCell} p
 * @param {LatticeMaterial} m
 * @returns {{ density: number, E1: number, E2: number, nu12: number, nu21: number, G12: number, wall1: number, wall2: number,
 *   buckle2: number, pitch: [number, number], gap: number, reentrant: boolean }}
 *   density: the share of the cell that is wall; E1, E2, G12 in MPa; nu12: the strain along y over that along x when
 *   pulled along x; wall1, wall2: a wall's peak strain for a strain of 1 along x, along y; buckle2: the stress along y
 *   (MPa, over the block's whole face) at which the uprights buckle, with the end-fixity factor of a regular cell
 *   (0.686) as an estimate for others; pitch: one cell's size along x and y; gap: the narrowest opening in a cell, mm
 */
export function latticeCell(p, m) {
  const { l, h, t, s, c, gap, reentrant } = cellOf('latticeCell', p);
  if (!(m && m.E > 0)) refuse('lattice.material', `latticeCell: the material needs a modulus E above 0 MPa (got ${said(m?.E)})`);
  const { E } = m, beta = h / l, a = t / l, q = beta + s, k = a ** 3;
  const n = 0.686; // the uprights' end fixity in a regular honeycomb, Gibson and Ashby's
  return {
    density: (a * (beta + 2)) / (2 * c * q),
    E1: (E * k * c) / (q * s * s), E2: (E * k * q) / c ** 3,
    nu12: (c * c) / (q * s), nu21: (q * s) / (c * c),
    G12: (E * k * q) / (beta * beta * (1 + 2 * beta) * c),
    wall1: (3 * a * c) / Math.abs(s), wall2: (3 * a * q) / c,
    buckle2: (E * n * n * Math.PI ** 2 * k) / (24 * beta * beta * c),
    pitch: [2 * l * c, 2 * (h + l * s)], gap, reentrant,
  };
}

/**
 * @typedef {LatticeCell & { across: number, rows: number, plate?: number, fillet?: number }} LatticeBlock
 *   a block of cells between two solid plates, pressed along y. across: whole cells along x (the rows between
 *   alternate with half cells at the sides); rows: cell rows from plate to plate (each plate cuts the uprights of its
 *   row at their middles); plate: each plate's thickness along y (default 3 mm); fillet: the radius rounding each
 *   inside corner where walls meet (default t / 2)
 */

// The block's walls as centrelines, and its cells' openings: shared by the shape and the model
function blockOf(what, p) {
  const cell = cellOf(what, p);
  whole(what, p, 'across', 1); whole(what, p, 'rows', 1);
  const { l, h, t, s, dx } = cell, plate = p.plate ?? 3, fillet = p.fillet ?? t / 2;
  if (!(typeof plate === 'number' && plate > 0)) refuse('lattice.size', `${what}: plate is each plate's thickness, a size above 0 mm (got ${said(plate)})`);
  if (!(typeof fillet === 'number' && fillet >= 0)) refuse('lattice.size', `${what}: fillet is the inside corners' radius, 0 mm or more (got ${said(fillet)})`);
  const R = p.rows, nx = p.across, step = h + l * s, x0 = -dx, x1 = (2 * nx - 1) * dx, y0 = 0, y1 = R * step, eps = 1e-9 * (l + h);
  const corners = (cx, cy) => [[cx + dx, cy - h / 2], [cx + dx, cy + h / 2], [cx, cy + h / 2 + l * s], [cx - dx, cy + h / 2], [cx - dx, cy - h / 2], [cx, cy - h / 2 - l * s]];
  const cells = [];
  for (let r = 0; r <= R; r++) for (let j = r % 2 ? -1 : 0; j < nx; j++) cells.push([(2 * j + (r % 2)) * dx, r * step]);
  // the walls, clipped to the block (Liang and Barsky's clip of a segment to a box), joined where they meet
  const key = (x, y) => `${Math.round(x / eps / 1e3)},${Math.round(y / eps / 1e3)}`, nodes = new Map(), walls = new Map();
  const node = (x, y) => { const k = key(x, y); if (!nodes.has(k)) nodes.set(k, [x, y]); return k; };
  for (const [cx, cy] of cells) {
    const v = corners(cx, cy);
    for (let i = 0; i < 6; i++) {
      const [ax, ay] = v[i], [bx, by] = v[(i + 1) % 6], ddx = bx - ax, ddy = by - ay;
      let lo = 0, hi = 1;
      for (const [pp, qq] of [[-ddx, ax - x0], [ddx, x1 - ax], [-ddy, ay - y0], [ddy, y1 - ay]]) {
        if (Math.abs(pp) < 1e-15) { if (qq < -eps) { lo = 1; hi = 0; } continue; }
        const r = qq / pp;
        if (pp < 0) lo = Math.max(lo, r); else hi = Math.min(hi, r);
      }
      if (hi - lo < 1e-9) continue;
      const a = node(ax + lo * ddx, ay + lo * ddy), b = node(ax + hi * ddx, ay + hi * ddy);
      if (a !== b) walls.set([a, b].sort().join('|'), [a, b]);
    }
  }
  // each cell's opening: its outline set in by t / 2, cut at the plates, inside corners rounded
  const holes = cells.map(([cx, cy]) => roundCorners(clipY(inset(corners(cx, cy), t / 2), y0, y1), fillet, x0 - t / 2, x1 + t / 2));
  return { cell, nx, R, plate, fillet, x0, x1, y0, y1, nodes, walls: [...walls.values()], holes, box: [x0 - t / 2, y0 - plate, x1 + t / 2, y1 + plate] };
}

// A polygon (counter-clockwise) with each edge moved d inwards, its corners where the moved edges meet
function inset(pts, d) {
  const n = pts.length, lines = pts.map((a, i) => { const b = pts[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]), nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L; return [a[0] + d * nx, a[1] + d * ny, (b[0] - a[0]) / L, (b[1] - a[1]) / L]; });
  return lines.map((e, i) => { const f = lines[(i + 1) % n], den = e[2] * f[3] - e[3] * f[2], u = ((f[0] - e[0]) * f[3] - (f[1] - e[1]) * f[2]) / den; return [e[0] + u * e[2], e[1] + u * e[3]]; });
}
// Sutherland and Hodgman's clip to y0 ≤ y ≤ y1 (the cells' openings stay one piece there: see blockOf)
function clipY(pts, y0, y1) {
  const half = (poly, inside, cut) => { const out = []; poly.forEach((a, i) => { const b = poly[(i + 1) % poly.length], ia = inside(a), ib = inside(b); if (ia) out.push(a); if (ia !== ib) out.push(cut(a, b)); }); return out; };
  const at = (y) => (a, b) => [a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]), y];
  return half(half(pts, (q) => q[1] >= y0, at(y0)), (q) => q[1] <= y1, at(y1));
}
function clipX(pts, x0, x1) {
  const half = (poly, inside, cut) => { const out = []; poly.forEach((a, i) => { const b = poly[(i + 1) % poly.length], ia = inside(a), ib = inside(b); if (ia) out.push(a); if (ia !== ib) out.push(cut(a, b)); }); return out; };
  const at = (x) => (a, b) => [x, a[1] + ((x - a[0]) * (b[1] - a[1])) / (b[0] - a[0])];
  return half(half(pts, (q) => q[0] >= x0, at(x0)), (q) => q[0] <= x1, at(x1));
}
// An opening's corners that point out of it (the walls' inside corners) rounded to radius r, or less where its edges
// are short (each arc takes at most half of either edge); corners outside x0..x1 are cut off by the block's sides
function roundCorners(pts, r, x0, x1) {
  const clean = pts.filter((q, i) => { const p0 = pts[(i + pts.length - 1) % pts.length]; return Math.hypot(q[0] - p0[0], q[1] - p0[1]) > 1e-9; });
  if (!(r > 0)) return clean;
  const n = clean.length, out = [];
  clean.forEach((q, i) => {
    const a = clean[(i + n - 1) % n], b = clean[(i + 1) % n], ux = a[0] - q[0], uy = a[1] - q[1], vx = b[0] - q[0], vy = b[1] - q[1], la = Math.hypot(ux, uy), lb = Math.hypot(vx, vy);
    const turn = (q[0] - a[0]) * (b[1] - q[1]) - (q[1] - a[1]) * (b[0] - q[0]), inner = Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (la * lb))));
    if (turn <= 1e-12 * la * lb || q[0] < x0 || q[0] > x1 || inner > Math.PI - 1e-6) { out.push(q); return; }
    const rr = Math.min(r, 0.5 * Math.min(la, lb) * Math.tan(inner / 2)), d = rr / Math.tan(inner / 2), bis = Math.hypot(ux / la + vx / lb, uy / la + vy / lb);
    const cx = q[0] + ((ux / la + vx / lb) / bis) * (rr / Math.sin(inner / 2)), cy = q[1] + ((uy / la + vy / lb) / bis) * (rr / Math.sin(inner / 2));
    const p1 = [q[0] + (ux / la) * d, q[1] + (uy / la) * d], p2 = [q[0] + (vx / lb) * d, q[1] + (vy / lb) * d];
    const t1 = Math.atan2(p1[1] - cy, p1[0] - cx), sweep = Math.PI - inner, steps = Math.max(2, Math.ceil(sweep / (Math.PI / 12)));
    for (let k = 0; k <= steps; k++) { const ang = t1 + (sweep * k) / steps; out.push([cx + rr * Math.cos(ang), cy + rr * Math.sin(ang)]); }
    void p2;
  });
  return out;
}
const area = (pts) => pts.reduce((sum, a, i) => { const b = pts[(i + 1) % pts.length]; return sum + (a[0] * b[1] - b[0] * a[1]) / 2; }, 0);

/**
 * A lattice spring block: cells of honeycomb (or re-entrant honeycomb) between two solid plates, drawn flat with the
 * block pressed along y. The bottom plate's face is at y = 0 minus its thickness, the cells start at y = 0; x runs
 * from the left side's upright wall. Every inside corner where walls meet is rounded (fillet).
 * @param {LatticeBlock} p
 * @returns {object} the shape, a JSCAD geom3
 */
export function latticeBlock(p) {
  const B = blockOf('latticeBlock', p), [X0, Y0, X1, Y1] = B.box, b = p.depth;
  const solid = cuboid({ center: [(X0 + X1) / 2, (Y0 + Y1) / 2, b / 2], size: [X1 - X0, Y1 - Y0, b] });
  const cuts = B.holes.filter((o) => o.length >= 3 && Math.abs(area(o)) > 1e-9).map((o) => translate([0, 0, -1], extrudeLinear({ height: b + 2 }, polygon({ points: area(o) > 0 ? o : [...o].reverse() }))));
  return subtract(solid, union(cuts));
}

/**
 * A lattice spring block's model: its stiffness pressed between its plates, the strain its walls see, the force and
 * travel at which they buckle, and how its sides move. The block is a frame of beams (@rulecad/fea): each wall a
 * beam along its centreline, rigidly joined where walls meet, the bottom plate held and the top plate pressed
 * straight down without turning or sliding (the plates far stiffer than the walls), the sides free. Gibson and
 * Ashby's E2 over the block's face gives `estimate`, which a large block approaches.
 * @param {LatticeBlock} p
 * @param {LatticeMaterial} m
 * @returns {{ cell: ReturnType<typeof latticeCell>, stiffness: number, estimate: number, strain: (travel: number) => number,
 *   travel: (strain: number) => number, stress: (travel: number) => number, buckling: { force: number, travel: number },
 *   poisson: number, size: [number, number, number], area: number, volume: number, grams?: number, walls: number }}
 *   stiffness N/mm along y; strain at a travel (mm) is the most any wall sees, bending and stretch together; buckling:
 *   the force (N) and travel (mm) at which the walls first buckle (in the bed's plane), past which the block softens
 *   sharply; poisson: the sides' strain at mid-height over the press's, negative when they draw in; size: the block's
 *   x, y and z; area: the outline's area less its openings, mm²; volume mm³; grams with the material's density
 */
export function latticeBlockModel(p, m) {
  const B = blockOf('latticeBlockModel', p);
  if (!(m && m.E > 0)) refuse('lattice.material', `latticeBlockModel: the material needs a modulus E above 0 MPa (got ${said(m?.E)})`);
  const cell = latticeCell(p, m), { t, b } = B.cell, E = m.E, keys = [...B.nodes.keys()], at = (k) => B.nodes.get(k), tol = 1e-6 * (B.cell.l + B.cell.h);
  const bottom = keys.filter((k) => Math.abs(at(k)[1] - B.y0) < tol), top = keys.filter((k) => Math.abs(at(k)[1] - B.y1) < tol).sort((a, c) => at(a)[0] - at(c)[0]);
  const wall = { A: t * b, Iz: (b * t ** 3) / 12, Iy: (t * b ** 3) / 12, J: (Math.max(t, b) * Math.min(t, b) ** 3) / 3, cy: t / 2, cz: b / 2 };
  const stiff = { A: 1e4 * t * b, Iz: 1e4 * (b * t ** 3) / 12, Iy: 1e4 * (t * b ** 3) / 12, J: 1e4 * (b * t ** 3) / 3, cy: t / 2, cz: b / 2 };
  // bonded: the plates hold the walls' ends from sliding; sliding: the plates press without holding them across
  const ends = p.ends ?? 'bonded';
  if (ends !== 'bonded' && ends !== 'sliding') refuse('lattice.ends', `latticeBlockModel: ends is how the plates hold the walls: 'bonded' (glued or printed on: no sliding) or 'sliding' (pressed between smooth plates); got ${said(ends)}`);
  const flat = { z: true, rx: true, ry: true }, supports = {}, slide = ends === 'sliding';
  if (slide) stiff.A = 1e-6 * t * b;
  for (const k of keys) supports[k] = flat;
  for (const k of bottom) supports[k] = slide ? { ...flat, y: true, rz: true } : 'fixed';
  for (const k of top) supports[k] = { ...flat, x: !slide, rz: true };
  if (slide) supports[bottom.sort((a, c) => Math.abs(at(a)[0] - (B.x0 + B.x1) / 2) - Math.abs(at(c)[0] - (B.x0 + B.x1) / 2))[0]] = { ...flat, x: true, y: true, rz: true };
  const elements = B.walls.map(([a, c], i) => ({ id: `w${i}`, a, b: c, section: 'wall', material: 'm' }));
  for (let i = 1; i < top.length; i++) elements.push({ id: `plate${i}`, a: top[i - 1], b: top[i], section: 'plate', material: 'm' });
  if (slide) { const bs = [...bottom].sort((a, c) => at(a)[0] - at(c)[0]); for (let i = 1; i < bs.length; i++) elements.push({ id: `base${i}`, a: bs[i - 1], b: bs[i], section: 'plate', material: 'm' }); }
  const loads = top.map((k) => ({ node: k, force: [0, -1 / top.length, 0] }));
  const model = { nodes: Object.fromEntries(keys.map((k) => [k, [...at(k), 0]])), elements, sections: { wall, plate: stiff }, materials: { m: { E, nu: 0.35 } }, supports, loads };
  const F = frame(model), st = F.statics(), d = st.displacements;
  const press = -top.reduce((sum, k) => sum + d[k][1], 0) / top.length, stiffness = 1 / press;
  const perNewton = Math.max(...st.elements.filter((e) => String(e.id).startsWith('w')).map((e) => e.stress.peak)) / E;
  const strain = (x) => perNewton * stiffness * x;
  const force = frame(subdivide(model, 4)).buckling().factors[0]; // (each wall in four, so it can bow between its ends)
  // the sides' strain at mid-height: the nodes on each side nearest it
  const mid = (B.y0 + B.y1) / 2, side = (x) => keys.filter((k) => Math.abs(at(k)[0] - x) < tol).sort((a, c) => Math.abs(at(a)[1] - mid) - Math.abs(at(c)[1] - mid))[0];
  const L = side(B.x0), Rt = side(B.x1), H = B.y1 - B.y0, W = B.x1 - B.x0;
  const poisson = L && Rt ? ((d[Rt][0] - d[L][0]) / W) / (press / H) : NaN;
  const [X0, Y0, X1, Y1] = B.box, open = B.holes.reduce((sum, o) => sum + Math.abs(area(clipX(o, X0, X1))), 0), A = (X1 - X0) * (Y1 - Y0) - open;
  return {
    cell, stiffness, estimate: (cell.E2 * (W + t) * b) / H, strain, travel: (e) => e / (perNewton * stiffness), stress: (x) => E * strain(x),
    buckling: { force, travel: force / stiffness }, poisson, size: [X1 - X0, Y1 - Y0, b], area: A, volume: A * b,
    ...(m.density ? { grams: (A * b * m.density) / 1000 } : {}), walls: B.walls.length,
  };
}

/**
 * Whether a lattice block prints as drawn and lasts at its travel, as findings in the kit's one shape: walls in whole
 * printed lines (lattice.lines), openings wide enough to stay open (lattice.gap), the depth in whole layers
 * (lattice.layers), the cells in the bed's plane so the walls bend within their layers (lattice.direction), the
 * walls' strain at the travel against the material's limit (lattice.strain) and the travel against the walls'
 * buckling (lattice.buckle).
 * @param {LatticeBlock & { travel?: number }} p travel: how far the block is pressed, mm
 * @param {{ line: number, layer: number, wall_min?: number }} printer
 * @param {LatticeMaterial} [material] with strainLimit, to check the travel
 * @param {ReturnType<typeof latticeBlockModel>} [model]
 * @returns {{ level: 'pass' | 'warn' | 'fail', text: string, code: string, values?: object }[]}
 */
export function latticeFindings(p, printer, material, model) {
  const { t, b, gap } = cellOf('latticeFindings', p), out = [], f = (level, text, code, values) => out.push({ level, text, code, ...(values ? { values } : {}) });
  if (!(printer && printer.line > 0 && printer.layer > 0)) refuse('lattice.printer', `latticeFindings: the printer needs its line width and layer height above 0 mm (got ${said(printer)})`);
  const lines = t / printer.line, least = (printer.wall_min ?? 2 * printer.line) / printer.line;
  if (lines < least - 0.05) f('fail', `walls ${t} mm thick are under ${least} lines of ${printer.line} mm: too thin to print`, 'lattice.lines', { thickness: t, lines });
  else if (Math.abs(lines - Math.round(lines)) > 0.05) f('warn', `walls ${t} mm thick are ${lines.toFixed(2)} lines of ${printer.line} mm: a whole number prints as drawn (${(Math.round(lines) * printer.line).toFixed(2)} mm)`, 'lattice.lines', { thickness: t, lines });
  else f('pass', `walls ${t} mm thick: ${Math.round(lines)} lines of ${printer.line} mm`, 'lattice.lines', { thickness: t, lines: Math.round(lines) });
  const open = 2 * printer.line;
  f(gap >= open ? 'pass' : 'fail', `the narrowest opening in a cell is ${gap.toFixed(2)} mm${gap >= open ? '' : `, under two lines (${open.toFixed(2)} mm): its walls would print joined`}`, 'lattice.gap', { gap, least: open });
  const layers = b / printer.layer;
  if (Math.abs(layers - Math.round(layers)) > 0.05) f('warn', `${b} mm deep is ${layers.toFixed(2)} layers of ${printer.layer} mm: a whole number prints as drawn`, 'lattice.layers', { depth: b, layers });
  f('pass', 'the cells lie in the bed\'s plane: every wall bends within its layers, and the block prints on its face with no overhangs', 'lattice.direction');
  if (p.travel != null && model) {
    const e = model.strain(p.travel), limit = material?.strainLimit;
    if (limit != null) f(e <= limit ? 'pass' : 'fail', `pressed ${p.travel} mm, the walls see ${(e * 100).toFixed(2)}% strain${e <= limit ? ', within' : ', over'} ${material.name ?? 'its'} limit of ${(limit * 100).toFixed(2)}%${e > limit ? `: at most ${model.travel(limit).toFixed(2)} mm` : ` (${(limit / e).toFixed(2)} times)`}`, 'lattice.strain', { travel: p.travel, strain: e, limit });
    const bk = model.buckling.travel;
    f(p.travel < bk ? 'pass' : 'warn', `the walls buckle at ${bk.toFixed(2)} mm (${model.buckling.force.toFixed(1)} N)${p.travel < bk ? `, past the travel of ${p.travel} mm` : `: pressed ${p.travel} mm the block softens sharply and its force is no longer ${model.stiffness.toFixed(2)} N/mm times the travel`}`, 'lattice.buckle', { travel: p.travel, buckles: bk, force: model.buckling.force });
  }
  return out;
}
