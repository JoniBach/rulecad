// Folding: sheets printed flat that fold out of their plane into a shape (lamina-emergent mechanisms: Jacobsen, Chen,
// Howell and Magleby 2009; Howell's group at BYU). A sheet is panels joined by hinges along lines in the sheet: arrays
// of lamina-emergent torsion (LET) joints, or living hinges (a thin web on the bed). Each hinge is a row of pins in the
// pseudo-rigid-body model: an LET joint turns about its centre, at the sheet's mid-plane; a living hinge about the
// middle of its web. So a folded pose is the panels (and the lands between an array's joints) turned about those pins,
// and it can be checked: the strain each hinge sees, and whether any two rigid bodies touch, on the way and at the end.
//
// The sheet lies on the bed (z from 0 to its thickness). A positive fold lifts the panel on the hinge's `to` side up
// off the bed (a valley fold seen from above). Angles in poses are in degrees, as a cad assembly's are; the models'
// strain(θ) take radians, as the package's other hinges do. Units: mm, N, MPa.
import jscad from '@jscad/modeling';
import { letJointModel, need } from './core.mjs';
import { ready, subtract as cut2, union as union2, apart, area, solidOf } from './plane.mjs';

const { cuboid, cylinder, polygon, polyhedron } = jscad.primitives;
const { union, subtract } = jscad.booleans;
const { extrudeLinear } = jscad.extrusions;
const { translate, rotateZ, transform } = jscad.transforms;

const refuse = (code, text) => Object.assign(new Error(text), { code });
const block = (x, y, z, size) => cuboid({ center: [x, y, z], size });
const rad = (d) => (d * Math.PI) / 180, deg = (r) => (r * 180) / Math.PI;
const SEGMENTS = 24; // a slot's round end
const OVERLAP = 0.5; // mm: a hinge's strip runs this far into its panels, so the print is one piece
const TOUCH = 1e-3; // mm³: an overlap smaller than this is rounding, not a clash

/** @typedef {{ width: number, thickness: number, bar: number, slot: number, bridge: number, series?: number, parallel?: number, land?: number }} LetArray
 *   one LET joint (letJoint's sizes: width along the axis, the sheet's thickness, a torsion bar's width, the slots'
 *   width, the bridges' width), `series` of them one after another across the axis, `parallel` side by side along it,
 *   each series joint `land` apart (the rigid strip between two joints; default twice the bar, at least 2 mm) */

function letCheck(what, p) {
  // its own sizes first, so they are refused as let.size; need() then checks the rest (it names slot too, without a code)
  for (const k of ['slot', 'bridge']) if (!(p[k] > 0)) throw refuse('let.size', `${what}: ${k} is a size above 0 (got ${JSON.stringify(p[k])})`);
  need(what, p);
  for (const k of ['series', 'parallel']) if (p[k] !== undefined && !(Number.isInteger(p[k]) && p[k] >= 1)) throw refuse('let.count', `${what}: ${k} is a whole number of joints, 1 or more (got ${JSON.stringify(p[k])})`);
  if (p.land !== undefined && !(p.land > 0)) throw refuse('let.size', `${what}: land is a size above 0 (got ${JSON.stringify(p.land)})`);
  if (!(p.width > 3 * p.bridge)) throw refuse('let.bridge', `${what}: a joint ${p.width} mm wide has no torsion bar left between three bridges of ${p.bridge} mm: give a width over ${3 * p.bridge} mm, or narrower bridges`);
}

// Where an array's joints are, across the axis (x) and along it (y), centred on the hinge's middle
function letLayout(p) {
  const n = p.series ?? 1, m = p.parallel ?? 1, c = p.slot / 2 + p.bar + p.slot, land = p.land ?? Math.max(2 * p.bar, 2), pitch = 2 * c + land;
  return { n, m, c, land, pitch, across: 2 * n * c + (n - 1) * land, along: m * p.width + (m - 1) * p.slot,
    pins: Array.from({ length: n }, (_, k) => (k - (n - 1) / 2) * pitch), bands: Array.from({ length: m }, (_, j) => (j - (m - 1) / 2) * (p.width + p.slot)) };
}
// A slot through the sheet along y, its closed ends round: the bars' and bridges' inside corners are rounds
const slotY = (x, y, w, len, h, closed = [true, true]) => {
  const r = w / 2, y0 = y - len / 2 + (closed[0] ? r : 0), y1 = y + len / 2 - (closed[1] ? r : 0);
  return union(block(x, (y0 + y1) / 2, h / 2, [w, y1 - y0, h + 2]), ...[[closed[0], y0], [closed[1], y1]].filter(([c]) => c).map(([, yy]) => cylinder({ radius: r, height: h + 2, center: [x, yy, h / 2], segments: SEGMENTS })));
};
// The array's cuts in its own frame: for each joint the central slot (closed both ends) and the four outer slots
// (open at the band's edge, closed at the middle bridge); between bands a slot across the whole hinge, its ends
// rounding into the panels
function letCuts(p, L) {
  const { width: W, thickness: h, bar: wt, slot: sl, bridge: wb } = p, out = [], len = (W - wb) / 2;
  for (const x0 of L.pins) for (const y0 of L.bands) {
    out.push(slotY(x0, y0, sl, W - 2 * wb, h));
    for (const s of [1, -1]) out.push(slotY(x0 + s * (sl + wt), y0 + (W + wb) / 4, sl, len, h, [true, false]), slotY(x0 + s * (sl + wt), y0 - (W + wb) / 4, sl, len, h, [false, true]));
  }
  for (let j = 0; j < L.m - 1; j++) { const y = (L.bands[j] + L.bands[j + 1]) / 2; out.push(block(0, y, h / 2, [L.across, sl, h + 2]), ...[1, -1].map((s) => cylinder({ radius: sl / 2, height: h + 2, center: [s * L.across / 2, y, h / 2], segments: SEGMENTS }))); }
  return out;
}

/**
 * An array of lamina-emergent torsion joints: `series` LET joints one after another across the fold, so each turns a
 * share of the angle and the hinge folds further for the same strain, and `parallel` side by side along it, so it is
 * stiffer and holds its line. Drawn as a coupon: the array between two panels, on the bed, the axis along y.
 * @param {LetArray & { panel?: number }} p panel: each panel's length across the axis (default 10)
 * @returns {object} the shape, a JSCAD geom3
 */
export function letArray(p) {
  letCheck('letArray', p);
  const L = letLayout(p), a = p.panel ?? 10;
  return subtract(block(0, 0, p.thickness / 2, [L.across + 2 * a, L.along, p.thickness]), ...letCuts(p, L));
}
/**
 * An LET array's model: joints in series share the angle, joints in parallel share the moment (springs in series and
 * in parallel, as Jacobsen et al. 2009 build the single joint). Stiffness m k / n, the strain at a fold θ the joint's
 * at θ / n. Each joint is a pin at its centre on the mid-plane; the rigid bodies either side end c from it (half a
 * slot, a bar and a slot), so one joint turns until their inner corners meet: π - 2 atan(h / 2c) (its pinch).
 * @param {LetArray} p @param {import('./core.mjs').Material & { nu?: number }} m
 * @returns {import('./core.mjs').Model & { angle: (strain: number) => number, joint: ReturnType<typeof letJointModel>, joints: number, pitch: number, across: number, along: number, pinch: number, gap: (angle: number) => number }}
 *   stiffness in N·mm a radian; joint: one joint's model; joints: how many; pitch: from one joint's centre to the
 *   next; across, along: the hinge's size; pinch: the most the array folds before neighbours touch (radians); gap:
 *   between the two panels' inner faces at a fold (mm, the panels parallel at π; below 0 they overlap)
 */
export function letArrayModel(p, m) {
  letCheck('letArrayModel', p); need('letArrayModel', p, m);
  const L = letLayout(p), one = letJointModel(p, m), strain = (th) => one.strain(Math.abs(th) / L.n), angle = (e) => L.n * one.angle(e);
  // the panels' mid-planes at a fold θ: the chain of lands from the first pin, each turned θ / n further; the second
  // panel leaves the last pin along the chain's direction there, and its face is h / 2 off the line
  const gap = (th) => { let x = 0, z = 0; for (let k = 1; k < L.n; k++) { x += L.pitch * Math.cos((k * th) / L.n); z += L.pitch * Math.sin((k * th) / L.n); } const a = th, nx = -Math.sin(a), nz = Math.cos(a); return Math.abs(x * nx + z * nz) - p.thickness; };
  return { stiffness: (L.m * one.stiffness) / L.n, strain, angle, travel: angle, stress: (th) => m.E * strain(th), joint: one, joints: L.n * L.m, pitch: L.pitch, across: L.across, along: L.along,
    pinch: L.n * (Math.PI - 2 * Math.atan(p.thickness / (2 * L.c))), gap };
}

// ---------- a sheet that folds ----------

/** @typedef {{ name: string, from: string, to: string, at: number[][], let?: Omit<LetArray, 'thickness'>, living?: { flex: number, thickness: number } }} Hinge
 *   a hinge along the line `at` ([[x0, y0], [x1, y1]], the panels' shared edge) from panel `from` (nearer the root)
 *   to panel `to`: an LET array (the sheet's thickness), or a living hinge, a web `thickness` thick on the bed and
 *   `flex` long across the line, the panels' sides above it sloping back at 45° (so no square corner, and later pinch) */
/** @typedef {{ thickness: number, panels: Record<string, number[][]>, hinges: Hinge[], root?: string }} Sheet
 *   thickness: the sheet's (mm); panels: each one's outline in the flat sheet, [x, y] round it, meeting its
 *   neighbours along the hinges' lines; root: the panel that stays on the bed (default the first) */

const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const IDENT = { R: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 0, 0] };
const mulR = (A, B) => { const C = []; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C.push(A[3 * i] * B[j] + A[3 * i + 1] * B[3 + j] + A[3 * i + 2] * B[6 + j]); return C; };
const applyR = (R, v) => [R[0] * v[0] + R[1] * v[1] + R[2] * v[2], R[3] * v[0] + R[4] * v[1] + R[5] * v[2], R[6] * v[0] + R[7] * v[1] + R[8] * v[2]];
const compose = (A, B) => ({ R: mulR(A.R, B.R), t: applyR(A.R, B.t).map((x, i) => x + A.t[i]) }); // A after B
const place = (T, v) => applyR(T.R, v).map((x, i) => x + T.t[i]);
// A turn of a about the line through q along the unit u (Rodrigues)
const about = (q, u, a) => {
  const c = Math.cos(a), s = Math.sin(a), k = 1 - c, [x, y, z] = u;
  const R = [c + x * x * k, x * y * k - z * s, x * z * k + y * s, y * x * k + z * s, c + y * y * k, y * z * k - x * s, z * x * k - y * s, z * y * k + x * s, c + z * z * k];
  return { R, t: sub3(q, applyR(R, q)) };
};
const centroid = (pts) => pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length], [0, 0]);

// A hinge's rectangle in the sheet, half sizes across and along its line; and whether two convex outlines overlap
// (separating axes: they are apart if some side's line has the whole of the other beyond it)
const rectOf = (g, ax, al) => [[-ax, -al], [ax, -al], [ax, al], [-ax, al]].map(([x, y]) => [g.mid[0] + g.nrm[0] * x + g.u[0] * y, g.mid[1] + g.nrm[1] * x + g.u[1] * y]);
const overlaps = (A, B) => ![[A, B], [B, A]].some(([P, Q]) => P.some((p, i) => { const q = P[(i + 1) % P.length], n = [q[1] - p[1], p[0] - q[0]], side = (r) => (r[0] - p[0]) * n[0] + (r[1] - p[1]) * n[1], own = P.map(side).reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a), 0); return Q.every((r) => side(r) * Math.sign(own) <= 1e-9); }));

// The sheet worked out: each hinge's frame and pins, the bodies (panels, and an array's lands), the tree
function layout(S, what) {
  if (!(S && S.thickness > 0)) throw refuse('fold.thickness', `${what}: the sheet needs a thickness above 0 mm (got ${JSON.stringify(S?.thickness)})`);
  const names = Object.keys(S.panels || {});
  if (!names.length) throw refuse('fold.panels', `${what}: a sheet needs panels: { name: [[x, y], ...] }`);
  for (const n of names) if (!(Array.isArray(S.panels[n]) && S.panels[n].length >= 3 && S.panels[n].every((q) => q.length === 2 && q.every(Number.isFinite)))) throw refuse('fold.panels', `${what}: panel ${n} is an outline of three or more [x, y] points`);
  const root = S.root ?? names[0];
  if (!names.includes(root)) throw refuse('fold.root', `${what}: the root ${root} is not a panel (panels: ${names.join(', ')})`);
  const h = S.thickness, hinges = [], seen = new Set();
  for (const g of S.hinges || []) {
    if (!g || typeof g.name !== 'string' || seen.has(g.name)) throw refuse('fold.hinge', `${what}: every hinge needs a name of its own (got ${JSON.stringify(g?.name)})`);
    seen.add(g.name);
    for (const k of ['from', 'to']) if (!names.includes(g[k])) throw refuse('fold.hinge', `${what}: hinge ${g.name}'s ${k} panel ${JSON.stringify(g[k])} is not one of the panels (${names.join(', ')})`);
    if (!(Array.isArray(g.at) && g.at.length === 2 && g.at.every((q) => q.length === 2 && q.every(Number.isFinite)))) throw refuse('fold.hinge', `${what}: hinge ${g.name} needs its line, at: [[x0, y0], [x1, y1]]`);
    if (!!g.let === !!g.living) throw refuse('fold.kind', `${what}: hinge ${g.name} is either let: { width, bar, slot, bridge, series?, parallel?, land? } or living: { flex, thickness }`);
    const [a, b] = g.at, len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!(len > 0)) throw refuse('fold.hinge', `${what}: hinge ${g.name}'s line has no length`);
    const u = [(b[0] - a[0]) / len, (b[1] - a[1]) / len, 0], mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    let nrm = [u[1], -u[0]]; // across the line, pointing to the `to` panel
    const ct = centroid(S.panels[g.to]);
    if ((ct[0] - mid[0]) * nrm[0] + (ct[1] - mid[1]) * nrm[1] < 0) nrm = [-nrm[0], -nrm[1]];
    let pins, across, along, zp, c, kind;
    if (g.let) {
      const p = { ...g.let, thickness: h }; letCheck(`${what}: hinge ${g.name}`, p);
      const L = letLayout(p); pins = L.pins; across = L.across; along = L.along; zp = h / 2; c = L.c; kind = 'let';
      if (along > len + 1e-9) throw refuse('fold.width', `${what}: hinge ${g.name}'s joints span ${+along.toFixed(3)} mm along a line ${+len.toFixed(3)} mm long: fewer in parallel, or narrower`);
    } else {
      need(`${what}: hinge ${g.name}`, g.living);
      if (!(g.living.thickness < h)) throw refuse('fold.web', `${what}: hinge ${g.name}'s web (${g.living.thickness} mm) must be thinner than the sheet (${h} mm)`);
      pins = [0]; across = g.living.flex; along = len; zp = g.living.thickness / 2; c = g.living.flex / 2; kind = 'living';
    }
    // the pins in the sheet, in order from the `from` side; each body between two pins is a land
    const at = pins.map((x) => [mid[0] + nrm[0] * x, mid[1] + nrm[1] * x, zp]);
    // a positive turn about u lifts the `to` side if u × nrm points up
    const sign = Math.sign(u[0] * nrm[1] - u[1] * nrm[0]);
    hinges.push({ ...g, kind, u, mid, nrm, len, pins, at, across, along, zp, c, sign });
  }
  // two arrays' strips that overlap (at a corner, where two edges' joints are wider than the panel between their bands)
  // would print joined, tying one hinge's bars to the other's: refused, with what fits
  const strips = hinges.filter((g) => g.kind === 'let').map((g) => ({ g, pts: rectOf(g, g.across / 2 + OVERLAP, g.along / 2) }));
  for (let i = 0; i < strips.length; i++) for (let k = i + 1; k < strips.length; k++) if (overlaps(strips[i].pts, strips[k].pts)) {
    const [a, b] = [strips[i].g, strips[k].g];
    throw refuse('fold.strips', `${what}: hinges ${a.name} and ${b.name} have joints that overlap (their strips meet, so they would print joined): narrower joints (width), fewer in series, or the panels between them larger`);
  }
  // the tree from the root: each panel reached once
  const parent = { [root]: null }, order = [root], queue = [root];
  while (queue.length) {
    const n = queue.shift();
    for (const g of hinges) {
      const other = g.from === n ? g.to : g.to === n ? g.from : null;
      if (other == null) continue;
      if (g.from !== n) { if (!(other in parent)) throw refuse('fold.tree', `${what}: hinge ${g.name} runs from ${g.from} to ${g.to}, but ${g.to} is nearer the root ${root}: give each hinge its from panel on the root's side`); continue; }
      if (other in parent) throw refuse('fold.loop', `${what}: panel ${other} is reached twice (by hinge ${g.name}): a sheet here is a tree of panels from the root; a pattern with closed loops of creases (an origami vertex) folds as one, as miura() does`);
      parent[other] = g; order.push(other); queue.push(other);
    }
  }
  const lost = names.filter((n) => !(n in parent));
  if (lost.length) throw refuse('fold.tree', `${what}: ${lost.join(', ')} ${lost.length > 1 ? 'are' : 'is'} joined to the root ${root} by no hinge`);
  return { h, root, names, hinges, parent, order };
}

// Where each body is at a set of folds ({ hinge: degrees }): panels, and `<hinge>.land<k>` between an array's joints
function bodiesAt(Lo, folds, what) {
  for (const k of Object.keys(folds || {})) if (!Lo.hinges.some((g) => g.name === k)) throw refuse('fold.pose', `${what}: no hinge ${k} (hinges: ${Lo.hinges.map((g) => g.name).join(', ')})`);
  const T = { [Lo.root]: IDENT }, lands = {};
  for (const n of Lo.order.slice(1)) {
    const g = Lo.parent[n], a = folds?.[g.name] ?? 0;
    if (!Number.isFinite(a)) throw refuse('fold.pose', `${what}: hinge ${g.name}'s fold is a number of degrees (got ${JSON.stringify(a)})`);
    let t = T[g.from];
    g.at.forEach((q, k) => { t = compose(t, about(q, g.u, (g.sign * rad(a)) / g.at.length)); if (k < g.at.length - 1) lands[`${g.name}.land${k + 1}`] = { T: t, hinge: g, k }; });
    T[n] = t;
  }
  return { T, lands };
}

// A body's outline in the sheet, flat: a panel less the bands its hinges take; a land as its rectangle
const quad = (g, x0, x1, y0, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => [g.mid[0] + g.nrm[0] * x + g.u[0] * y, g.mid[1] + g.nrm[1] * x + g.u[1] * y]);
const landOf = (g, k) => quad(g, g.pins[k] + g.c, g.pins[k + 1] - g.c, -g.along / 2, g.along / 2);

// A hinge's band as a cut, in its own frame (x across, z up): its section, which runs the length of the line. An LET
// array's is the band through the sheet; a living hinge's rises from its web's top with its sides sloping out at 45°,
// and with `web` it takes the web too (for the rigid bodies, whose webs bend)
function sectionOf(g, h, web) {
  const half = g.across / 2;
  if (g.kind === 'let') return [[-half, -1], [half, -1], [half, h + 1], [-half, h + 1]];
  const t = g.living.thickness, up = h + 1 - t;
  return [...(web ? [[-half, -1], [half, -1]] : []), [half, t], [half + up, h + 1], [-half - up, h + 1], [-half, t]];
}
const ANGLE = (g) => Math.atan2(g.u[1], g.u[0]) - Math.PI / 2;
function cutOf(g, h, web) { // a JSCAD prism along the hinge's line
  const len = g.len + 2e-3, prism = translate([0, len / 2, 0], jscad.transforms.rotateX(Math.PI / 2, extrudeLinear({ height: len }, polygon({ points: sectionOf(g, h, web) }))));
  return translate([g.mid[0], g.mid[1], 0], rotateZ(ANGLE(g), prism));
}
// A section's corners along the hinge's line, in the sheet, for a hull: the section must be convex. A living hinge's
// band with its web is not (it bends in where the web's top meets the sloped sides), so it is given as two convex
// pieces, the web's box and the sloped band above it, each hulled on its own
const cutPoints = (g, h, sec) => { const L = g.len / 2 + 1e-3; return [-L, L].flatMap((y) => sec.map(([x, z]) => [g.mid[0] + g.nrm[0] * x + g.u[0] * y, g.mid[1] + g.nrm[1] * x + g.u[1] * y, z])); };
function convexCuts(g, h) {
  const half = g.across / 2, t = g.living.thickness;
  return [[[-half, -1], [half, -1], [half, t], [-half, t]], sectionOf(g, h, false)].map((sec) => cutPoints(g, h, sec));
}
// Each panel's footprint: its outline less its LET arrays' bands. Where two bands meet near a corner they can cut a
// bit off a panel that no hinge holds: it would print loose, so it is left out (the largest piece is the panel), and
// how much was left out is said
function footprints(Lo, S) {
  const out = {};
  for (const n of Lo.names) {
    const bands = Lo.hinges.filter((g) => g.kind === 'let' && (g.from === n || g.to === n)).map((g) => quad(g, -g.across / 2, g.across / 2, -g.len / 2 - 1e-3, g.len / 2 + 1e-3));
    const left = bands.length ? cut2([orient(S.panels[n])], union2(bands)) : [orient(S.panels[n])], bits = apart(left);
    const keep = bits.reduce((a, b) => (area(b) > area(a) ? b : a), bits[0] || []);
    out[n] = { loops: keep, loose: bits.length - 1, lost: area(left) - area(keep) };
  }
  return out;
}
const toMat4 = (T) => [T.R[0], T.R[3], T.R[6], 0, T.R[1], T.R[4], T.R[7], 0, T.R[2], T.R[5], T.R[8], 0, T.t[0], T.t[1], T.t[2], 1];

/**
 * A sheet of panels and hinges, printed flat, drawn flat or folded. Flat (no folds, or all 0) it is the print: one
 * piece, the panels joined by their hinges. Folded, it is the panels and lands where the folds put them, the hinges'
 * bars and webs left out (they bend; the check below says how far); for a picture and a fit check in an assembly.
 * @param {Sheet} S @param {Record<string, number>} [folds] each hinge's fold in degrees (positive lifts its `to` panel)
 * @returns {Promise<object>} the shape, a JSCAD geom3 (async: its outlines are manifold-3d's, an optional peer dependency)
 */
export async function foldSheet(S, folds = {}) {
  const Lo = layout(S, 'foldSheet'), h = Lo.h, flat = Object.values(folds).every((a) => !a);
  const { T, lands } = bodiesAt(Lo, folds, 'foldSheet');
  await ready();
  const feet = footprints(Lo, S), slab = (pts) => extrudeLinear({ height: h }, polygon({ points: pts }));
  const panel = (n) => { const own = Lo.hinges.filter((g) => g.kind === 'living' && (g.from === n || g.to === n)), body = solidOf(feet[n].loops, h); return own.length ? subtract(body, ...own.map((g) => cutOf(g, h, !flat))) : body; };
  if (flat) {
    const strips = Lo.hinges.filter((g) => g.kind === 'let').map((g) => { const p = { ...g.let, thickness: h }, L = letLayout(p); return translate([g.mid[0], g.mid[1], 0], rotateZ(ANGLE(g), subtract(block(0, 0, h / 2, [L.across + 2 * OVERLAP, L.along, h]), ...letCuts(p, L)))); });
    return union(...Lo.names.map(panel), ...strips);
  }
  return union(...Lo.names.map((n) => transform(toMat4(T[n]), panel(n))), ...Object.values(lands).map(({ T: t, hinge: g, k }) => transform(toMat4(t), slab(orient(landOf(g, k))))));
}
const orient = (pts) => { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return a < 0 ? [...pts].reverse() : pts; };

/**
 * A folding sheet's model: each hinge's (an LET array's, or a living hinge's, Howell's small-length flexural pivot:
 * strain t θ / 2l), its pins and pinch, and where the bodies are at a set of folds.
 * @param {Sheet} S @param {import('./core.mjs').Material & { nu?: number }} m
 * @returns {{ hinges: Record<string, { kind: 'let' | 'living', stiffness: number, strain: (angle: number) => number, angle: (strain: number) => number, pins: number, pinch: number }>, bodies: (folds: Record<string, number>) => Record<string, { R: number[], t: number[] }>, place: (T: { R: number[], t: number[] }, p: number[]) => number[] }}
 *   pinch: the most a hinge folds (radians) before the bodies either side of a pin touch; bodies: each body's turn R
 *   (3 × 3, by rows) and shift t at the folds
 */
export function foldSheetModel(S, m) {
  const Lo = layout(S, 'foldSheetModel'); need('foldSheetModel', {}, m);
  const hinges = Object.fromEntries(Lo.hinges.map((g) => {
    if (g.kind === 'let') { const md = letArrayModel({ ...g.let, thickness: Lo.h }, m); return [g.name, { kind: 'let', stiffness: md.stiffness, strain: md.strain, angle: md.angle, pins: g.pins.length, pinch: md.pinch }]; }
    const { flex: l, thickness: t } = g.living, strain = (th) => (t * Math.abs(th)) / (2 * l), w = g.len;
    // the corners nearest the pin: the web's top edge (l / 2 along, t / 2 above the pin) and the panel's top, sloped
    // back 45° (l / 2 + h - t along, h - t / 2 above): the fold stops when the steeper reaches the bisector
    const pinch = Math.PI - 2 * Math.max(Math.atan(t / 2 / (l / 2)), Math.atan((Lo.h - t / 2) / (l / 2 + Lo.h - t)));
    return [g.name, { kind: 'living', stiffness: (m.E * w * t ** 3) / 12 / l, strain, angle: (e) => (2 * l * e) / t, pins: 1, pinch }];
  }));
  const bodies = (folds) => { const { T, lands } = bodiesAt(Lo, folds, 'foldSheetModel'); return { ...T, ...Object.fromEntries(Object.entries(lands).map(([k, x]) => [k, x.T])) }; };
  return { hinges, bodies, place };
}

/**
 * A folding sheet checked in its poses: at each, and on the way there from flat (`steps` stages), every hinge's strain
 * against the material's limit, and every two rigid bodies (panels and lands) apart by the clearance. The bodies are
 * the panels less their hinges' bands (the bars and webs bend, so they are left out; a living hinge's panels sloped
 * back as printed), each the sheet's thickness; geometry is manifold-3d's (an optional peer dependency).
 * @param {Sheet} S @param {import('./core.mjs').Material & { nu?: number }} m
 * @param {{ poses: Record<string, Record<string, number>>, clearance?: number, steps?: number }} o poses: name to
 *   { hinge: degrees }; clearance: the least gap between bodies (default 0.2 mm); steps: stages from flat (default 6)
 * @returns {Promise<{ ok: boolean, findings: { level: 'pass' | 'warn' | 'fail', text: string, code: string, between?: string[], values?: object, refs?: object }[], poses: Record<string, { gap: number, between: string[] | null, strain: Record<string, number> }> }>}
 *   per pose: the least gap between two bodies on the way (below 0: they overlap) and the pair, each hinge's strain
 */
export async function foldCheck(S, m, { poses, clearance = 0.2, steps = 6 } = {}) {
  const Lo = layout(S, 'foldCheck'); need('foldCheck', {}, m);
  if (!poses || typeof poses !== 'object' || !Object.keys(poses).length) throw refuse('fold.pose', 'foldCheck: give the poses to check, { name: { hinge: degrees } }');
  if (!(clearance >= 0)) throw refuse('fold.clearance', `foldCheck: the clearance is a gap of 0 mm or more (got ${JSON.stringify(clearance)})`);
  if (!(Number.isInteger(steps) && steps >= 1)) throw refuse('fold.steps', `foldCheck: steps is a whole number, 1 or more (got ${JSON.stringify(steps)})`);
  const model = foldSheetModel(S, m), W = await ready(), h = Lo.h, made = [];
  const keep = (x) => (made.push(x), x);
  try {
    // each body flat, once: a panel less its bands (a living hinge's web too: it bends), sloped as printed; a land
    const slab = (pts) => keep(W.Manifold.extrude(keep(new W.CrossSection([orient(pts)], 'NonZero')), h));
    const flat = {};
    const feet = footprints(Lo, S);
    for (const n of Lo.names) { let b = keep(W.Manifold.extrude(keep(new W.CrossSection(feet[n].loops, 'NonZero')), h)); for (const g of Lo.hinges.filter((x) => x.kind === 'living' && (x.from === n || x.to === n))) for (const pts of convexCuts(g, h)) b = keep(b.subtract(keep(W.Manifold.hull(pts)))); flat[n] = b; }
    const landNames = [];
    for (const g of Lo.hinges) for (let k = 0; k < g.pins.length - 1; k++) { const nm = `${g.name}.land${k + 1}`; flat[nm] = slab(landOf(g, k)); landNames.push(nm); }
    const all = [...Lo.names, ...landNames];
    const solid = (n, T) => flat[n].warp((v) => { const q = place(T, v); v[0] = q[0]; v[1] = q[1]; v[2] = q[2]; });
    const findings = [], out = {};
    for (const n of Lo.names) if (feet[n].loose) findings.push({ level: 'info', text: `panel ${n}: its hinges' bands cut ${feet[n].loose} bit${feet[n].loose > 1 ? 's' : ''} off it (${+feet[n].lost.toFixed(2)} mm²) that no hinge holds, left out of the print so ${feet[n].loose > 1 ? 'they do' : 'it does'} not print loose: make the hinges' lines meet at the corner to keep the panel square`, code: 'fold.loose', values: { panel: n, bits: feet[n].loose, area: feet[n].lost } });
    for (const [pose, folds] of Object.entries(poses)) {
      let worst = { gap: Infinity, between: null, at: 0 };
      for (let s = 1; s <= steps; s++) {
        const f = Object.fromEntries(Object.entries(folds).map(([k, a]) => [k, (a * s) / steps])), B = model.bodies(f), sol = {};
        try {
          for (const n of all) sol[n] = solid(n, B[n]);
          for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
            const A = sol[all[i]], C = sol[all[j]], X = A.intersect(C), v = X.volume(); X.delete();
            const gap = v > TOUCH ? -v : A.minGap(C, clearance + 1);
            if (gap < worst.gap - 1e-9) worst = { gap, between: [all[i], all[j]], at: s / steps };
          }
        } finally { for (const x of Object.values(sol)) x.delete(); }
      }
      const strain = Object.fromEntries(Lo.hinges.map((g) => [g.name, model.hinges[g.name].strain(rad(folds[g.name] ?? 0))]));
      out[pose] = { gap: worst.gap, between: worst.between, strain };
      for (const g of Lo.hinges) {
        const a = folds[g.name] ?? 0, e = strain[g.name], lim = m.strainLimit, md = model.hinges[g.name];
        if (lim != null) findings.push({ level: e <= lim ? 'pass' : 'fail', text: `${pose}: hinge ${g.name} folded ${+a.toFixed(2)}° (${md.pins} pin${md.pins > 1 ? 's' : ''}) sees ${(e * 100).toFixed(2)}% strain, ${e <= lim ? 'within' : 'over'} the limit of ${(lim * 100).toFixed(2)}%${e <= lim ? '' : `: it folds ${+deg(md.angle(lim)).toFixed(1)}° at most; more joints in series, or a longer web`}`, code: 'fold.strain', values: { pose, hinge: g.name, angle: a, strain: e, limit: lim } });
        if (Math.abs(rad(a)) > md.pinch) findings.push({ level: 'fail', text: `${pose}: hinge ${g.name} folds ${+a.toFixed(2)}°, past its pinch of ${+deg(md.pinch).toFixed(1)}°, where the bodies either side of a pin meet: more joints in series, or a longer web`, code: 'fold.pinch', values: { pose, hinge: g.name, angle: a, pinch: deg(md.pinch) } });
      }
      const clear = worst.gap >= clearance - 1e-6;
      findings.push({ level: clear ? 'pass' : 'fail', text: clear ? `${pose}: every two bodies stay ${+Math.min(worst.gap, clearance + 1).toFixed(3)} mm or more apart on the way from flat${worst.gap >= clearance + 1 - 1e-9 ? ' (over a millimetre past the clearance)' : `, the nearest ${worst.between.join(' and ')}`}` : `${pose}: ${worst.between.join(' and ')} ${worst.gap < 0 ? `overlap (${+(-worst.gap).toFixed(3)} mm³)` : `come ${+worst.gap.toFixed(3)} mm apart, under the clearance of ${clearance} mm`} ${worst.at < 1 ? `${Math.round(worst.at * 100)}% of the way from flat` : 'in the pose'}: move or shorten them, or fold them in another order`, code: worst.gap < 0 ? 'fold.clash' : 'fold.clearance', between: worst.between, values: { pose, gap: worst.gap, clearance, at: worst.at } });
    }
    return { ok: !findings.some((f) => f.level === 'fail'), findings, poses: out };
  } finally { for (const x of made) { try { x.delete(); } catch { /* freed */ } } }
}
