// Lamina mechanisms: a whole mechanism drawn in one plane and printed flat, the way working printed blasters are
// made (Howell's lamina emergent mechanisms; the BYU one-piece blaster, PLOS ONE 2026). Everything is a 2D shape
// extruded the same height off the bed, so every flexure bends within its layers, every moving part stands on the
// bed, and every clearance is a slot in the drawing. The mechanism is a tree of rigid bodies joined to the ground
// and to each other by flexures; states say how far each flexure is moved, and the checks read them:
//   free       at rest, everything clears everything it isn't joined to by the printer's gap (else it fuses), and
//              each flexure touches its two bodies and nothing else
//   stops      something hard stops each flexure before its strain limit (displacement-driven design: the travel,
//              not the force, sets the stress)
//   strain     each flexure's strain at the most any state moves it, and how it prints
//   states     nothing that isn't joined runs into anything in any state, or on the way between them
//   holds      a latch holds: in a state, moving a flexure back towards rest runs its body into the catch
//   energy     what each state stores, and the forces
// Flexures are drawn bent between states by their own shape: each point moves by the part of its joint's motion
// that its distance along the flexure (from root to tip, inside the shape) gives it. Units: mm, N, degrees.
import jscad from '@jscad/modeling';
import * as gens from './flexures.mjs';
import { curveClearance } from './curves.mjs';
import { ports, models } from './compose.mjs';
import { simulate, bend, centrelines } from './physics.mjs';
import { shapeOf, fixedLoads } from './beams.mjs';
import { outOfPlane } from './outofplane.mjs';
import { grid as feaGrid, solve as feaSolve, stress as feaStress, cellStiffness, analyse as feaAnalyse } from '@rulecad/fea';

const AREA = 1e-4; // mm²: less than this of an overlap is a rounding error, not a touch
const TOUCH = 0.01; // mm: as near as a flexure's root is to its body, or a point to an edge
const STOP_STEPS = 40; // how finely a joint's travel is swept for its stop
const NONE = new Set();
const MARCH = 40; // steps a follower's give is searched in, from where it is
const FINE = 0.005; // mm: a give this small is the solver's precision, not a push
const REFINE = 10; // a step that pushes a follower, looked at again in this many parts
const FRAMES = 12; // frames from one state to the next, for an animation
const GAMMA = 0.85; // the pseudo-rigid-body leaf's characteristic radius (Howell): its tip turns about 0.15 L from the root
const LEAFLIKE = new Set(['leaf', 'snapHook', 'contactLeaf']);
const OWN_ROUNDS = new Set(['parallelGuide', 'compoundGuide', 'foldedGuide', 'serpentine', 'snapHook', 'notchHinge', 'ellipticalHinge', 'livingHinge', 'cartwheel', 'letJoint', 'bistable']); // flexures with blocks of their own, rounded into them already
const ROUND = 16; // segments to a full circle where an outline is grown
const FE_CELLS = 8; // finite-element cells across a flexure's thickness
const FE_MOST = 40000; // and no more cells than this in all (coarser, then)
const SHARP_TURN = 45; // degrees: an inside corner turning this much or more at once is sharp (a round turns a little at each of many corners)
const rad = (d) => (d * Math.PI) / 180, deg = (r) => (r * 180) / Math.PI;

// 2D affine transforms [a, b, c, d, e, f]: x' = a x + b y + c, y' = d x + e y + f
const I = [1, 0, 0, 0, 1, 0];
const mul = (m, n) => [m[0] * n[0] + m[1] * n[3], m[0] * n[1] + m[1] * n[4], m[0] * n[2] + m[1] * n[5] + m[2], m[3] * n[0] + m[4] * n[3], m[3] * n[1] + m[4] * n[4], m[3] * n[2] + m[4] * n[5] + m[5]];
const apply = (m, [x, y]) => [m[0] * x + m[1] * y + m[2], m[3] * x + m[4] * y + m[5]];
const shift = ([x, y]) => [1, 0, x, 0, 1, y];
const turn = (a, [cx, cy] = [0, 0]) => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, cx - c * cx + s * cy, s, c, cy - s * cx - c * cy]; };

// ---------- the plane's geometry ----------
// Shapes are plain data: lists of closed loops ([[x, y], …]). Booleans, offsets and areas are Clipper2's, through
// manifold-3d's CrossSection: robust where JSCAD's 2D booleans aren't (a near miss, a sliver, a corner a hair off),
// which is what clearance checks live on. Each operation makes its WASM objects and frees them before it returns.
let W = null;
async function ready() {
  if (W) return W;
  let mod;
  try { mod = await import('manifold-3d'); } catch (e) { throw Object.assign(new Error('lamina mechanisms need manifold-3d (npm install manifold-3d): its 2D geometry is what the checks trust'), { cause: e }); }
  W = await mod.default();
  W.setup();
  return W;
}
const empty = (a) => !a || !a.length;
function run(fn) {
  const made = [], keep = (c) => (made.push(c), c), cs = (loops) => keep(new W.CrossSection(loops, 'NonZero'));
  try { return fn(cs, keep); } finally { for (const c of made) c.delete(); }
}
const loopsOf = (c) => c.toPolygons().map((l) => l.map((p) => [p[0], p[1]]));
const union = (list) => { const l = list.filter((a) => !empty(a)); return !l.length ? [] : run((cs, keep) => loopsOf(keep(W.CrossSection.union(l.map(cs))))); };
const intersect = (a, b) => (empty(a) || empty(b) ? [] : run((cs, keep) => loopsOf(keep(cs(a).intersect(cs(b))))));
const subtract = (a, b) => (empty(a) ? [] : empty(b) ? a : run((cs, keep) => loopsOf(keep(cs(a).subtract(cs(b))))));
const grow = (a, d) => (empty(a) || !(d > 0) ? a : run((cs, keep) => loopsOf(keep(cs(a).offset(d, 'Round', 2, ROUND)))));
const shrink = (a, d, join = 'Miter') => (empty(a) || !(d > 0) ? a : run((cs, keep) => loopsOf(keep(cs(a).offset(-d, join, 2, ROUND)))));
const area = (a) => (empty(a) ? 0 : run((cs) => cs(a).area()));
const pieces = (a) => (empty(a) ? 0 : run((cs, keep) => cs(a).decompose().map(keep).filter((p) => p.area() > AREA).length));
const apart = (a) => (empty(a) ? [] : run((cs, keep) => cs(a).decompose().map(keep).filter((p) => p.area() > AREA).map(loopsOf)));
const box = (a) => {
  const lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
  for (const l of a) for (const [x, y] of l) { lo[0] = Math.min(lo[0], x); lo[1] = Math.min(lo[1], y); hi[0] = Math.max(hi[0], x); hi[1] = Math.max(hi[1], y); }
  return { lo, hi };
};
const moved = (m, a) => (m === I ? a : a.map((l) => l.map((p) => apply(m, p))));

// A design's shapes, as loops: a JSCAD 2D shape's sides chained into loops; a prism (a flexure generator's) as its
// top faces; loops as they are. Then one union, so overlaps and odd windings come out clean.
function loopsFromSides(sides) {
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
function flat(g) {
  const { geom2, geom3 } = jscad.geometries;
  if (Array.isArray(g) && (g.length === 0 || Array.isArray(g[0]?.[0]))) return union([g]);
  if (geom2.isA(g)) return union([loopsFromSides(geom2.toSides(g))]);
  if (geom3.isA(g)) {
    const tops = geom3.toPolygons(g).filter((p) => { const [a, b, c] = p.vertices, n = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); return n > 1e-12; }).map((p) => p.vertices.map((v) => [v[0], v[1]]));
    return union([tops]);
  }
  throw new Error('a lamina takes 2D shapes, prisms standing on the bed, or loops of [x, y]');
}
const isLoops = (g) => Array.isArray(g) && g.length > 0 && Array.isArray(g[0]) && Array.isArray(g[0][0]) && typeof g[0][0][0] === 'number';
const shapesIn = (g) => (isLoops(g) ? [g] : Array.isArray(g) ? g.flatMap(shapesIn) : g ? [g] : []); // (loops of points kept whole)
const all = (gs) => union(shapesIn(gs).map(flat));
// A shape as a JSCAD solid, extruded `height` up from the bed
function solidOf(a, height) {
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
function solidWith(a, height, cuts, adds, arches = [], layers = []) {
  const { geom3, poly3 } = jscad.geometries;
  return run((cs, keep) => {
    const slab = (c) => keep(keep(cs(c.shape).extrude(c.to - c.from)).translate([0, 0, c.from]));
    let m = keep(cs(a).extrude(height));
    for (const c of cuts) m = keep(m.subtract(slab(c)));
    // An arch: its profile (a triangle, 45° flanks, along u from lo to hi) stood up and swept across, cut out of the
    // part's footprint there
    for (const r of arches) {
      const mid = (r.lo + r.hi) / 2, half = (r.hi - r.lo) / 2, big = 1e3;
      const tri = keep(new W.CrossSection([[[r.lo, 0], [r.hi, 0], [mid, half]]], 'NonZero')); // (s, z), apex at r.apex since half = apex
      const across = keep(keep(tri.extrude(2 * big)).translate([0, 0, -big])); // swept along the third axis
      const stood = keep(across.rotate([90, 0, 0])); // (s, z, w) to (s, w, z): the profile now stands in x–z, swept along y
      const placed = keep(stood.rotate([0, 0, (Math.atan2(r.u[1], r.u[0]) * 180) / Math.PI])); // s along u
      m = keep(m.subtract(keep(placed.intersect(keep(cs(r.shape).extrude(height))))));
    }
    for (const c of adds) m = keep(m.add(slab(c)));
    // Slabs a layer or so thick: a guide's ridge added, its groove cut (cuts first, so a ridge is never cut away)
    for (const c of layers) if (c.cut && !empty(c.cut)) m = keep(m.subtract(slab({ shape: c.cut, from: c.from, to: c.to })));
    for (const c of layers) if (c.add && !empty(c.add)) m = keep(m.add(slab({ shape: c.add, from: c.from, to: c.to })));
    const { vertProperties: v, triVerts: t, numProp: n } = m.getMesh(), polys = [];
    for (let i = 0; i < t.length; i += 3) polys.push(poly3.create([t[i], t[i + 1], t[i + 2]].map((k) => [v[k * n], v[k * n + 1], v[k * n + 2]])));
    return geom3.create(polys);
  });
}

// Within d of each other? Their outlines grown by half of it each overlap
const within = (a, b, d) => area(intersect(grow(a, d / 2), grow(b, d / 2))) > AREA;
// The gap between two shapes, to a hundredth, when it's under `most`
function gapBetween(a, b, most) {
  if (area(intersect(a, b)) > AREA) return 0;
  let lo = 0, hi = most;
  for (let i = 0; i < 7; i++) { const mid = (lo + hi) / 2; if (within(a, b, mid)) hi = mid; else lo = mid; }
  return +((lo + hi) / 2).toFixed(2);
}
// Run into each other, deeper than `slack`? A touch is fine (a latch resting on its catch); an overlap isn't
function collide(a, b, slack) {
  const o = intersect(a, b);
  if (area(o) <= AREA) return null;
  return area(slack > 0 ? shrink(o, slack / 2) : o) > AREA ? box(o) : null;
}

// ---------- drawing a flexure bent ----------
// Each point's share of the joint's motion: its distance along the flexure from the root over that plus its distance
// from the tip, measured inside the shape (on a grid), so a serpentine or a folded guide bends fold by fold
function shares(shape, root, tip, cell) {
  const { lo, hi } = box(shape), nx = Math.ceil((hi[0] - lo[0]) / cell) + 3, ny = Math.ceil((hi[1] - lo[1]) / cell) + 3;
  const x0 = lo[0] - cell, y0 = lo[1] - cell, at = (i, j) => [x0 + (i + 0.5) * cell, y0 + (j + 0.5) * cell];
  const fill = (g) => { // which cells' centres are inside: crossings along each row, even-odd
    const inside = new Uint8Array(nx * ny), edges = g.flatMap((l) => l.map((p, k) => [p, l[(k + 1) % l.length]]));
    for (let j = 0; j < ny; j++) {
      const y = y0 + (j + 0.5) * cell, xs = [];
      for (const [[ax, ay], [bx, by]] of edges) if ((ay > y) !== (by > y)) xs.push(ax + ((y - ay) * (bx - ax)) / (by - ay));
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let i = Math.max(0, Math.ceil((xs[k] - x0) / cell - 0.5)); i < nx && x0 + (i + 0.5) * cell < xs[k + 1]; i++) inside[j * nx + i] = 1;
    }
    return inside;
  };
  const inside = fill(shape), from = (seeds) => { // distances inside the shape from the seed cells, a step a cell
    const dist = new Float64Array(nx * ny).fill(Infinity), queue = [];
    for (let k = 0; k < seeds.length; k++) if (seeds[k] && inside[k]) { dist[k] = 0; queue.push(k); }
    for (let h = 0; h < queue.length; h++) {
      const k = queue[h], i = k % nx, j = (k - i) / nx;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, b = j + dj, n = b * nx + a;
        if (a >= 0 && b >= 0 && a < nx && b < ny && inside[n] && dist[n] === Infinity) { dist[n] = dist[k] + 1; queue.push(n); }
      }
    }
    return dist;
  };
  const dr = from(fill(root)), dt = from(fill(tip));
  return ([x, y]) => { // the nearest cell inside with both distances
    const ci = Math.floor((x - x0) / cell), cj = Math.floor((y - y0) / cell);
    let best = null, bd = Infinity;
    for (let r = 0; r <= 3 && best == null; r++) for (let a = ci - r; a <= ci + r; a++) for (let b = cj - r; b <= cj + r; b++) {
      if (a < 0 || b < 0 || a >= nx || b >= ny) continue;
      const n = b * nx + a;
      if (!inside[n] || dr[n] === Infinity || dt[n] === Infinity) continue;
      const [cx, cy] = at(a, b), d = (cx - x) ** 2 + (cy - y) ** 2;
      if (d < bd) { bd = d; best = dr[n] / (dr[n] + dt[n] || 1); }
    }
    return best ?? 0;
  };
}
// The flexure's outline with its long edges split, so it bends smoothly
const split = (a, most) => a.map((o) => o.flatMap((p, k) => {
  const q = o[(k + 1) % o.length], n = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / most));
  return Array.from({ length: n }, (_, i) => [p[0] + ((q[0] - p[0]) * i) / n, p[1] + ((q[1] - p[1]) * i) / n]);
}));
const fromOutlines = (outlines) => union([outlines]); // a bent outline that crosses itself comes out as the area it covers
// Shared by the interpolation: a weight that leaves both ends square, as a guided beam bends
const smooth = (s) => s * s * (3 - 2 * s);

// ---------- a flexure's peak strain by finite elements ----------
// Beam theory says what a bar's strain is; it doesn't see the corner where the bar meets its block, which is where a
// printed flexure yields. Here the flexure and a band of each body it grows from are laid on a grid of squares (each
// filled by how much of it is inside), the body it grows from held, the body on its tip made stiff and pushed along the
// way it moves, and the plane-stress solution scaled to the travel. The peak is the most any solid cell sees (von
// Mises, as a strain); done again on cells 0.6 the size, a peak that keeps rising is a sharp corner.
function coverage(shape, g, x0, y0, sub = 3) {
  const { nx, ny, h } = g, out = new Float64Array(nx * ny), edges = shape.flatMap((l) => l.map((p, k) => [p, l[(k + 1) % l.length]]));
  for (let j = 0; j < ny; j++) for (let b = 0; b < sub; b++) {
    const y = y0 + (j + (b + 0.5) / sub) * h, xs = [];
    for (const [[ax, ay], [bx, by]] of edges) if ((ay > y) !== (by > y)) xs.push(ax + ((y - ay) * (bx - ax)) / (by - ay));
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) for (let i = 0; i < nx; i++) for (let a = 0; a < sub; a++) {
      const x = x0 + (i + (a + 0.5) / sub) * h;
      if (x >= xs[k] && x < xs[k + 1]) out[j * nx + i] += 1 / (sub * sub);
    }
  }
  return out;
}
function fePeak({ flexure, held, moved, direction, travel, E, nu = 0.35, cell, band }) {
  // The bodies as material too, in a band round the flexure (so the corner where it meets them is a real corner); held
  // and pushed only beyond the band
  // (only near where the flexure joins them, within a fine cell of it: a body it merely runs past a print gap off
  // would be welded to it by a grid coarser than the gap)
  // (a body the flexure doesn't quite reach: all of it within twice the band, as before)
  const nearJoin = (body) => { const join = intersect(flexure, grow(body, cell)); return intersect(body, area(join) > AREA ? grow(join, band * 2) : grow(flexure, band * 2)); };
  held = nearJoin(held); moved = nearJoin(moved);
  const near = grow(flexure, band), region = union([flexure, held, moved]), { lo, hi } = box(region);
  let h = cell;
  while (((hi[0] - lo[0]) / h + 2) * ((hi[1] - lo[1]) / h + 2) > FE_MOST) h *= 1.25;
  const nx = Math.ceil((hi[0] - lo[0]) / h) + 2, ny = Math.ceil((hi[1] - lo[1]) / h) + 2, x0 = lo[0] - h, y0 = lo[1] - h;
  const g = feaGrid({ nx, ny, h }), fill = coverage(region, g, x0, y0), isNear = coverage(near, g, x0, y0, 1);
  const isHeld = coverage(held, g, x0, y0, 1), isMoved = coverage(moved, g, x0, y0, 1);
  // A cell with some of the frame and some of what moves in it straddles the gap between them (a stop a print gap off,
  // narrower than a cell): empty, or the grid would weld them together
  const heldPart = coverage(held, g, x0, y0), movedPart = coverage(moved, g, x0, y0);
  // (and a cell of either beside a cell of the other: neighbours share nodes, which would weld them just the same)
  const isH = (e) => heldPart[e] > 0.01, isM = (e) => movedPart[e] > 0.01, cut = [];
  for (let e = 0; e < g.cells; e++) {
    if (!isH(e) && !isM(e)) continue;
    const i = e % nx, j = (e - i) / nx;
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= nx || b >= ny) continue;
      const o = b * nx + a;
      if ((isH(e) && isM(o)) || (isM(e) && isH(o))) cut.push(e);
    }
  }
  for (const e of cut) fill[e] = 0;
  const modulus = new Float64Array(g.cells), fixed = new Uint8Array(g.dofs), f = new Float64Array(g.dofs), loaded = new Set();
  for (let e = 0; e < g.cells; e++) {
    const i = e % nx, j = (e - i) / nx, far = isNear[e] < 0.5, nodes = [g.node(i, j), g.node(i + 1, j), g.node(i + 1, j + 1), g.node(i, j + 1)];
    modulus[e] = E * Math.max(1e-6, fill[e] > 0 && far && isMoved[e] > 0.5 ? 50 : fill[e]);
    if (fill[e] < 0.5 || !far) continue;
    if (isHeld[e] > 0.5) for (const n of nodes) { fixed[2 * n] = 1; fixed[2 * n + 1] = 1; }
    else if (isMoved[e] > 0.5) for (const n of nodes) loaded.add(n);
  }
  if (!loaded.size) for (let e = 0; e < g.cells; e++) { // a tip body all within the band: push all of it
    const i = e % nx, j = (e - i) / nx;
    if (fill[e] >= 0.5 && isMoved[e] > 0.5) for (const n of [g.node(i, j), g.node(i + 1, j), g.node(i + 1, j + 1), g.node(i, j + 1)]) loaded.add(n);
  }
  if (!fixed.some(Boolean) || !loaded.size) return null;
  for (const n of loaded) { f[2 * n] += direction[0] / loaded.size; f[2 * n + 1] += direction[1] / loaded.size; }
  const { u: [u] } = feaSolve(g, { scale: modulus, ke: cellStiffness(nu, 2), fixed, loads: [f] });
  let moves = 0;
  for (const n of loaded) moves += (u[2 * n] * direction[0] + u[2 * n + 1] * direction[1]) / loaded.size;
  const scale = travel / moves, k = 1 / (1 - nu * nu);
  // Strain at each solid cell's corners (on the surface, where a bar's strain is most), as von Mises in plane stress over E
  const equiv = (ex, ey, gxy) => { const sx = k * (ex + nu * ey), sy = k * (ey + nu * ex), txy = (gxy / 2) / (1 + nu); return Math.sqrt(Math.max(0, sx * sx - sx * sy + sy * sy + 3 * txy * txy)); };
  let peak = 0, at = null;
  for (let e = 0; e < g.cells; e++) {
    const i = e % nx, j = (e - i) / nx;
    if (fill[e] < 0.5 || isNear[e] < 0.5 && (isHeld[e] > 0.5 || isMoved[e] > 0.5)) continue;
    const [a, b, c, d] = [g.node(i, j), g.node(i + 1, j), g.node(i + 1, j + 1), g.node(i, j + 1)].map((n) => [u[2 * n] * scale, u[2 * n + 1] * scale]);
    const bx = (b[0] - a[0]) / h, tx = (c[0] - d[0]) / h, ly = (d[1] - a[1]) / h, ry = (c[1] - b[1]) / h; // εx along the bottom and top, εy up the left and right
    const corners = [[bx, ly, (d[0] - a[0]) / h + (b[1] - a[1]) / h, 0, 0], [bx, ry, (c[0] - b[0]) / h + (b[1] - a[1]) / h, 1, 0], [tx, ry, (c[0] - b[0]) / h + (c[1] - d[1]) / h, 1, 1], [tx, ly, (d[0] - a[0]) / h + (c[1] - d[1]) / h, 0, 1]];
    for (const [ex, ey, gxy, ci, cj] of corners) { const v = equiv(ex, ey, gxy); if (v > peak) { peak = v; at = [x0 + (i + ci) * h, y0 + (j + cj) * h]; } }
  }
  return { peak, at, cell: h };
}

// ---------- the mechanism ----------
/**
 * A mechanism in one plane, printed flat.
 * @param {object} spec
 * @param {number} spec.height how tall it prints (z): every part's height, and the flexures' width
 * @param {number} spec.gap the least gap that prints apart: the printer's gap for parts printed in place
 * @param {{ E: number, strainLimit: number, name?: string }} spec.material (flexureMaterial(rules) makes one)
 * @param {{ line: number, layer: number, wall_min?: number }} [spec.printer] for the flexures' print findings
 * @param {object | object[]} spec.ground the fixed body: 2D shapes (or prisms, read as their outlines)
 * @param {Record<string, object>} [spec.bodies] the rigid moving bodies, drawn at rest
 * @param {Record<string, { kind?: string, params?: object, at?: number[], angle?: number, shape?: object, from: string, to: string,
 *   axis?: number[], pivot?: number[], stiffness?: number }>} spec.joints a flexure from one body (or 'ground') to another:
 *   a generator's kind and params placed at `at`, turned `angle` degrees (its root at `at`, its length along the turned x),
 *   or your own `shape` with how its `to` end moves (`axis`, a unit direction, or `pivot`, a point) and its `stiffness`
 *   (N/mm, or N·mm a degree for a pivot)
 * @param {Record<string, Record<string, number>>} [spec.states] how far the joints you move are moved in each state:
 *   mm along an axis, degrees about a pivot; a leaf's (leaf, snapHook, contactLeaf) is its tip's travel in mm. rest is
 *   all zeros. A follower set by a state (a trigger pulled) starts there, and gives further if it must.
 * @param {Record<string, { by: string[], give?: 1 | -1 }>} [spec.follows] joints moved by contact, not only by hand (a
 *   latch, a sear, a pusher a sear presses back): wherever the bodies `by` run into one, it gives (in the `give`
 *   direction of its travel) just as far as it must to clear them, and springs back when they've passed. A joint being
 *   moved from one state to the next drives; one standing still gives. A contact steeper than friction lets a push turn
 *   into the give (a square face) can't push it: there the driver jams, which is what a latch is for and what a
 *   trigger must undo.
 * @param {string[]} [spec.sequence] the states in the order they happen; every step between two is checked
 * @param {Record<string, [string, string][]>} [spec.holds] in a state, [joint, catch]: the joint pushing back towards
 *   rest must jam on the catch, or run into it
 * @param {Record<string, object>} [spec.loose] parts printed beside it, not joined (a disc), as 3D shapes
 * @param {(solid: object) => object} [spec.finish] 3D work on the printed solid (holes through it, chamfers)
 * @param {false | { steps?: number, force?: number, contact?: number }} [spec.physics] the mechanism solved as it would
 *   behave (physics.mjs): off with false
 * @param {{ step: string, joint?: string, peak?: number[], click?: number, end?: number[] }[]} [spec.requires] what a
 *   driven step's force curve must do: its peak and end force (N), and the share it drops after its peak (a click)
 * @param {number} [spec.round] every inside corner of the ground and the bodies rounded to this radius
 * @param {object | object[]} [spec.fixtures] fixed shapes the physics sees but the print leaves out (another layer's walls)
 * @param {Record<string, { shape: object, mass: number }>} [spec.free] parts not joined to anything and not printed
 *   with it (a disc): in the physics only, held still while a hand works the mechanism, mass in grams
 * @param {Record<string, number[]>} [spec.grips] where a hand takes a joint's body to drive it, at rest (a trigger's
 *   blade, where the finger pulls): its force curve is then the finger's. Default: the body's centre
 * @param {{ from: string, disc: string, hold?: Record<string, number>, duration?: number, most?: number }} [spec.fire] let go
 *   from a state and step through time, a hand keeping the joints in `hold` at those travels (a finger on the trigger):
 *   the bodies' speeds and the disc's exit speed and energy (J), against `most`
 * @param {{ slack?: number, steps?: number, cell?: number, friction?: number | { pass?: number, hold?: number }, step?: number }} [spec.check]
 *   how deep a touch may be (default a tenth of the gap); the fewest steps between states (8), and the most any body
 *   moves in one (`step`, a quarter of a mm); the grid flexures are bent on (a quarter of the thinnest); friction at
 *   contacts, the cautious way for each check: `pass` for what must move (0.5), `hold` for what must hold (0.1)
 * @returns {Promise<{ parts: Record<string, object>, findings: object[], energy: Record<string, number>, at: (state: string | object) => object,
 *   outlines: (state: string | object) => Record<string, number[][][]>, frames: object[], mechanism: object }>} (async: the plane's
 *   geometry is manifold-3d's WASM, loaded the first time)
 */
export async function lamina(spec) {
  await ready();
  if (spec.flood) return flooded(spec);
  const { height, gap, material, printer } = spec, slack = spec.check?.slack ?? gap / 10, steps = spec.check?.steps ?? 8, stepMost = spec.check?.step ?? 0.25;
  // Friction, taken the cautious way for each question: what must move is checked sticky (a ramp must still push its
  // follower aside at `pass`), what must hold is checked slippery (a catch must still jam at `hold`). Give over push past
  // 1 / μ and a contact jams: the push is within the friction angle of the face's normal.
  const mu = { pass: 0.5, hold: 0.1, ...(typeof spec.check?.friction === 'number' ? { pass: spec.check.friction, hold: spec.check.friction } : spec.check?.friction) };
  const steepFor = (m) => 1 / m;
  const findings = [], f = (level, text, code, extra = {}) => findings.push({ level, text, code, ...extra });
  if (!(height > 0) || !(gap > 0) || !material?.E || !material?.strainLimit) throw new Error('a lamina needs height, gap and material ({ E, strainLimit })');

  // The parts: the ground, the bodies and the flexures, each a 2D shape at rest
  // round: the inside corners of the frame and the bodies rounded to this radius (grown by it, then shrunk), so no thin
  // arm meets its body at a square corner
  const rounded = (a) => (spec.round > 0 ? shrink(grow(a, spec.round), spec.round, 'Round') : a);
  const parts = { ground: { kind: 'ground', shape: spec.groundRounded ? all(spec.ground) : rounded(all(spec.ground)) } }; // (a flooded frame isn't rounded again: its pockets are the moving parts' room, rounded already by the clearance)
  for (const [n, s] of Object.entries(spec.bodies || {})) { if (parts[n]) throw new Error(`"${n}" is used twice`); parts[n] = { kind: 'body', shape: rounded(all(s)) }; }
  const joints = {};
  for (const [n, j] of Object.entries(spec.joints || {})) {
    if (parts[n]) throw new Error(`joint "${n}" has a body's name`);
    for (const end of ['from', 'to']) if (!parts[j[end]] || parts[j[end]].kind === 'flexure') throw new Error(`joint ${n}: ${end} "${j[end]}" is not the ground or a body`);
    if (j.to === 'ground') throw new Error(`joint ${n}: the ground doesn't move; join from it`);
    const place = mul(shift(j.at || [0, 0]), turn(rad(j.angle || 0))), dir = (v) => apply([place[0], place[1], 0, place[3], place[4], 0], v);
    let shape, motion, model = null, params = null, leafy = false, kind = j.kind;
    if (kind) {
      if (!gens[kind] || !models[kind]) throw new Error(`joint ${n}: no flexure "${kind}"`);
      params = { ...j.params, width: j.params?.width ?? height };
      shape = moved(place, flat(gens[kind](params)));
      // A flexure given rounds has every inside corner rounded to that radius, wherever its parts meet (a round meeting
      // a tapered beam, a beam meeting a block): grown by it, then shrunk
      if (params.fillet > 0 && kind !== 'curve') shape = shrink(grow(shape, params.fillet), params.fillet, 'Round'); // (a curve has no corners of its own, and rounding it whole would close the gaps between its loops)
      model = models[kind](params, material);
      const p = ports(kind, params);
      leafy = LEAFLIKE.has(kind);
      const gam = params.gamma ?? GAMMA; // (a leaf turned by a moment at its tip, not pushed, bends round evenly: about its middle, γ ½)
      motion = leafy ? { pivot: apply(place, [(1 - gam) * params.length, 0]), leaf: gam * params.length }
        : p.moves === 'turn' ? { pivot: apply(place, p.pivot.at) }
          : { axis: dir(p.moves === 'x' ? [1, 0] : [0, 1]), ...(model.drop ? { drop: model.drop, along: dir([-1, 0]) } : {}) }; // a guide's shuttle drops towards its base
    } else {
      if (!j.shape || (!j.axis && !j.pivot)) throw new Error(`joint ${n}: give a flexure kind, or a shape and an axis or pivot`);
      shape = all(j.shape);
      const len = j.axis ? Math.hypot(...j.axis) : 1;
      motion = j.axis ? { axis: j.axis.map((c) => c / len) } : { pivot: j.pivot };
    }
    joints[n] = { ...j, kind, params, model, motion, place, leafy, turning: !leafy && !!motion.pivot, stiffness: j.stiffness ?? model?.stiffness };
    parts[n] = { kind: 'flexure', shape, joint: n };
  }
  // A flexure given rounds meets its bodies in rounds too, whatever their shape: the round filling the corner between the
  // flexure and a band of each body, outside the body, is added to the flexure
  // (only round where it meets them: within two radii of where they touch, so a gap beside the flexure stays open;
  // flexures with blocks of their own, guides and serpentines, round into those already)
  const OWN_BLOCKS = new Set(['parallelGuide', 'compoundGuide', 'foldedGuide', 'serpentine', 'snapHook', 'notchHinge', 'ellipticalHinge', 'livingHinge', 'cartwheel', 'letJoint', 'bistable']);
  for (const [n, j] of Object.entries(joints)) {
    const r = j.params?.fillet;
    if (!(r > 0) || OWN_BLOCKS.has(j.kind) || j.kind === 'curve') continue; // (a curve draws its own rounds, as true quarter circles)
    let F = parts[n].shape;
    for (const b of [j.from, j.to]) {
      if (b === 'ground' && spec.groundRounded) continue; // (a flooded frame draws its own rounds at each root: rounding into it here would close the room beside the flexure)
      const B = parts[b].shape, touch = intersect(F, grow(B, TOUCH)), near = intersect(B, grow(F, r * 3));
      if (area(touch) <= AREA) continue;
      F = union([F, intersect(subtract(shrink(grow(union([F, near]), r), r, 'Round'), B), grow(touch, r * 1.2))]);
    }
    parts[n].shape = F;
  }
  // Each body hangs from one joint: the tree from the ground
  const parent = {};
  for (const [n, j] of Object.entries(joints)) { if (parent[j.to]) throw new Error(`${j.to} hangs from two joints (${parent[j.to]} and ${n}): give it one, a guide is one joint`); parent[j.to] = n; }
  for (const [n, p] of Object.entries(parts)) if (p.kind === 'body' && !parent[n]) throw new Error(`body ${n} isn't joined to anything: join it, or print it loose`);
  const follows = spec.follows || {};
  for (const [n, fo] of Object.entries(follows)) {
    if (!joints[n]) throw new Error(`follows: no joint "${n}"`);
    for (const b of fo.by || []) if (!parts[b]) throw new Error(`follows ${n}: no part "${b}"`);
  }
  for (const [s, v] of Object.entries(spec.states || {})) for (const k of Object.keys(v)) {
    if (!joints[k]) throw new Error(`state ${s}: no joint "${k}"`);
  }

  // How a joint moves its body at a travel q (mm or degrees), and every part's place for a set of travels
  const motionAt = (j, q) => {
    const m = j.motion;
    if (m.axis) { const d = m.drop ? m.drop(q) : 0, a = m.along || [0, 0]; return shift([m.axis[0] * q + a[0] * d, m.axis[1] * q + a[1] * d]); }
    if (j.leafy) return turn(Math.asin(Math.max(-1, Math.min(1, q / m.leaf))), m.pivot); // a leaf's tip travel, as the pseudo-rigid-body angle
    return turn(rad(q), m.pivot);
  };
  const places = (values) => {
    const out = { ground: I }, of = (b) => {
      if (out[b]) return out[b];
      const jn = parent[b], j = joints[jn];
      return (out[b] = mul(of(j.from), motionAt(j, values[jn] || 0)));
    };
    for (const n of Object.keys(parts)) if (parts[n].kind === 'body') of(n);
    return out;
  };

  // Bending: each flexure's points with their share of the motion, worked out once
  const thinnest = Math.min(gap * 4, ...Object.values(joints).flatMap((j) => [j.params?.thickness ?? j.params?.neck ?? gap * 4].flat())); // (a curve's thickness is a list)
  const cell = spec.check?.cell ?? Math.max(0.02, thinnest / 4);
  const bendable = {};
  const bending = (n) => {
    if (bendable[n]) return bendable[n];
    const j = joints[n], shape = parts[n].shape, touch = (b) => intersect(shape, grow(parts[b].shape, TOUCH));
    const share = shares(shape, touch(j.from), touch(j.to), cell), outlines = split(shape, Math.max(cell * 4, 0.3));
    return (bendable[n] = outlines.map((o) => o.map((p) => [p, smooth(share(p))])));
  };
  const shapesAt = (values, only = null) => {
    const at = places(values), out = {};
    for (const [n, p] of Object.entries(parts)) {
      if (only && !only.has(n)) continue;
      if (p.kind !== 'flexure') { out[n] = moved(at[n], p.shape); continue; }
      const j = joints[n], q = values[n] || 0, base = at[j.from];
      if (!q && base === I) { out[n] = p.shape; continue; }
      out[n] = fromOutlines(bending(n).map((o) => o.map(([pt, w]) => apply(mul(base, motionAt(j, q * w)), pt))));
    }
    return out;
  };

  // What may touch what: a flexure its two bodies; nothing else
  const names = Object.keys(parts), joined = (a, b) => [a, b].some((x) => parts[x].kind === 'flexure' && [joints[x].from, joints[x].to].includes(x === a ? b : a));
  const pairs = names.flatMap((a, i) => names.slice(i + 1).map((b) => [a, b]));
  const what = (n) => (parts[n]?.kind === 'flexure' ? `the ${n} flexure` : n === 'ground' ? 'the ground' : n);
  // Which parts a joint carries: its body, the bodies below it, and their flexures
  const carried = (jn) => {
    const out = new Set([joints[jn].to, jn]);
    let grew = true;
    while (grew) { grew = false; for (const [n, j] of Object.entries(joints)) if (out.has(j.from) && !out.has(n)) { out.add(n); out.add(j.to); grew = true; } }
    return out;
  };
  const carries = Object.fromEntries(Object.keys(joints).map((n) => [n, carried(n)]));
  // A pair a follower clears for itself (when it's free to give): the solve keeps them apart, so they aren't a clash
  const driven = (a, b, active = NONE) => Object.entries(follows).some(([n, fo]) => !active.has(n) && ((carries[n].has(a) && fo.by.includes(b)) || (carries[n].has(b) && fo.by.includes(a))));
  const clashes = (shapes, only = null, active = NONE) => {
    const out = [];
    for (const [a, b] of pairs) {
      if (joined(a, b) || driven(a, b, active) || (only && !(only.has(a) !== only.has(b)))) continue;
      const hit = collide(shapes[a], shapes[b], slack);
      if (hit) out.push({ a, b, at: hit });
    }
    return out;
  };
  const limitOf = (n) => { const j = joints[n]; return j.model ? (j.turning ? deg(j.model.travel(material.strainLimit)) : j.model.travel(material.strainLimit)) : Infinity; };

  // ---- followers: each gives as far as it must to clear what drives it ----
  const blocked = (values, n) => {
    const fo = follows[n], sh = shapesAt(values, new Set([...carries[n], ...fo.by]));
    return [...carries[n]].some((p) => fo.by.some((b) => collide(sh[p], sh[b], 0))); // exact: a follower is solved to just touching, so its give is measured, not the slack
  };
  const solve = (values, active = NONE) => { // v: every travel; pushed: how far each follower was pushed past where its state put it
    const v = { ...values }, over = [], pushed = {};
    for (const [n, fo] of Object.entries(follows)) {
      const g = fo.give ?? 1, from = Math.max(0, g * (v[n] || 0)); // where the state put it, if that's along its give
      pushed[n] = 0;
      if (active.has(n)) continue; // being moved: it drives, it doesn't give
      v[n] = g * from;
      if (!blocked(v, n)) continue;
      const most = Math.min(limitOf(n), fo.most ?? Infinity), reach = Number.isFinite(most) ? most : gap * 100;
      // March out from where it is to the first place it clears (giving further can run it into something else), then
      // close in on it
      let lo = from, hi = null;
      for (let k = 1; k <= MARCH && hi == null; k++) { const at = from + ((reach - from) * k) / MARCH; if (blocked({ ...v, [n]: g * at }, n)) lo = at; else hi = at; }
      if (hi == null) { v[n] = g * reach; pushed[n] = reach - from; over.push(n); continue; }
      for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2; if (blocked({ ...v, [n]: g * mid }, n)) lo = mid; else hi = mid; }
      v[n] = g * hi; pushed[n] = hi - from;
    }
    return { v, over, pushed };
  };
  // How far a part's corners move between two sets of travels: a push, or a give
  const corners = (n) => { const { lo, hi } = box(parts[n].shape); return [[lo[0], lo[1]], [hi[0], lo[1]], [lo[0], hi[1]], [hi[0], hi[1]]]; };
  const moveOf = (n, a, b) => {
    if (parts[n].kind === 'ground') return 0;
    const body = parts[n].kind === 'flexure' ? joints[n].to : n, pa = places(a)[body], pb = places(b)[body];
    return Math.max(...corners(body).map((p) => Math.hypot(...apply(pa, p).map((c, k) => c - apply(pb, p)[k]))));
  };

  // Where a follower meets what drives it (the middle of their overlap, grown by a gap), and how far a point on a body moves
  const contactOf = (values, n) => {
    const fo = follows[n], sh = shapesAt(values, new Set([...carries[n], ...fo.by]));
    for (const b of fo.by) for (const p of carries[n]) {
      const o = intersect(grow(sh[p], gap), sh[b]);
      if (area(o) > AREA) { const { lo, hi } = box(o); return { by: b, at: [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2] }; }
    }
    return null;
  };
  const inverse = (m) => { const d = m[0] * m[4] - m[1] * m[3]; return [m[4] / d, -m[1] / d, (m[1] * m[5] - m[4] * m[2]) / d, -m[3] / d, m[0] / d, (m[3] * m[2] - m[0] * m[5]) / d]; };
  const pointStep = (n, a, b, pt) => {
    if (n === 'ground') return [0, 0];
    const body = parts[n].kind === 'flexure' ? joints[n].to : n, step = mul(places(b)[body], inverse(places(a)[body])), q = apply(step, pt);
    return [q[0] - pt[0], q[1] - pt[1]];
  };
  const pointMove = (n, a, b, pt) => Math.hypot(...pointStep(n, a, b, pt));

  // A path from one set of travels to another, in steps no body moves more than a quarter of a mm in: what jams, what
  // runs into what, how far the followers give
  const used = {};
  const note = (v) => { for (const [k, q] of Object.entries(v)) { used[k] ??= { most: 0, signs: new Set() }; if (Math.abs(q) > Math.abs(used[k].most)) used[k].most = q; if (q) used[k].signs.add(Math.sign(q)); } };
  let reachedLast = null; // where the last walk ended: a state as the sequence reaches it
  let walkRatio = 0; // the most any follower gave for its push, over the last walk: a contact that holds needs friction over its inverse
  const walk = (a, b, { record = true, friction = mu.pass } = {}) => { // record: count the travels it reaches as used (not for probes)
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])], at = (t) => Object.fromEntries(keys.map((x) => [x, (a[x] || 0) + ((b[x] || 0) - (a[x] || 0)) * t]));
    const active = new Set(keys.filter((x) => Math.abs((a[x] || 0) - (b[x] || 0)) > 1e-9)), steep = steepFor(friction), solveAt = (t) => solve(at(t), active);
    const far = Math.max(0, ...Object.keys(parts).filter((n) => parts[n].kind === 'body').map((n) => moveOf(n, a, b)));
    const n = Math.min(400, Math.max(steps, Math.ceil(far / stepMost)));
    // Pushed further aside than the push could make it go, in a step: a face too steep, a jam. A step that pushes a
    // follower is looked at again in tenths, so a square face isn't taken for a ramp because the step was coarse
    const jam = (p, q) => {
      for (const [fn, fo] of Object.entries(follows)) {
        if (q.pushed[fn] <= p.pushed[fn] + 1e-9) continue; // not pushed further (moved by its state, or springing back: fine)
        const c = contactOf(p.v, fn);
        if (!c) continue;
        const g = fo.give ?? 1, asSet = { ...q.v, [fn]: q.v[fn] - g * (q.pushed[fn] - p.pushed[fn]) }; // where it would be with only the last push
        // the push: how far what drives it moves against what it hangs from (a pawl carried past a still sear is pushed as hard as one a sear moves into)
        const give = pointMove(joints[fn].to, asSet, q.v, c.at), by = pointStep(c.by, p.v, q.v, c.at), from = pointStep(joints[fn].from, p.v, q.v, c.at), push = Math.hypot(by[0] - from[0], by[1] - from[1]);
        if (give > FINE) walkRatio = Math.max(walkRatio, (give - FINE) / Math.max(push, 1e-9));
        if (give > FINE && give > steep * push + FINE) return { joint: fn, by: c.by, grip: push / give }; // grip: the least friction that jams it here
      }
      return null;
    };
    let prev = solveAt(0), t0 = 0;
    walkRatio = 0;
    for (let k = 1; k <= n; k++) {
      const t = k / n, now = solveAt(t), { v, over } = now;
      if (record) note(v);
      if (Object.keys(follows).some((fn) => now.pushed[fn] > prev.pushed[fn] + 1e-9)) {
        let p = prev;
        for (let s = 1; s <= REFINE; s++) {
          const ts = t0 + ((t - t0) * s) / REFINE, q = s === REFINE ? now : solveAt(ts), j = jam(p, q);
          if (j) return { kind: 'jam', t: ts, ...j, v: q.v, last: p.v };
          p = q;
        }
      }
      if (over.length) return { kind: 'over', t, joint: over[0], v, last: prev.v };
      const hit = clashes(shapesAt(v), null, active)[0];
      if (hit) return { kind: 'hit', t, ...hit, v, last: prev.v, pushing: Object.keys(follows).find((fn) => now.pushed[fn] > slack && (carries[fn].has(hit.a) || carries[fn].has(hit.b))) };
      prev = now; t0 = t;
    }
    reachedLast = prev.v;
    return null;
  };

  // ---- rigid: no thin arm of the frame or a body tied on at one end only (it bends under load, and spoils what it
  // holds: a rail a stop hits, a hanger a hinge hangs from). Thinner than `check.rigid` (3 mm) and joined to the rest at
  // one place, it's a free end ----
  const rigidW = spec.check?.rigid ?? 3;
  for (const [n, p] of Object.entries(parts)) {
    if (p.kind === 'flexure') continue;
    const core = grow(shrink(p.shape, rigidW / 2, 'Round'), rigidW / 2), thin = subtract(p.shape, grow(core, cell));
    for (const piece of apart(thin)) {
      if (area(piece) < rigidW * rigidW) continue; // a nib, not an arm
      if (pieces(intersect(grow(piece, cell * 2), core)) <= 1) { const b = box(piece); f('warn', `${what(n)} has an arm narrower than ${rigidW} mm tied on at one end only, near (${((b.lo[0] + b.hi[0]) / 2).toFixed(1)}, ${((b.lo[1] + b.hi[1]) / 2).toFixed(1)}): it bends under load. Fill it in, or tie its other end back`, 'lamina.rigid', { part: n, at: b }); }
    }
  }

  // ---- free: at rest, the gap between everything that isn't joined; each flexure on its two bodies only ----
  let free = true;
  // A curve folded into its room mustn't come nearer itself than the gap either, or its loops print fused
  for (const [n, j] of Object.entries(joints)) {
    if (j.kind !== 'curve') continue;
    const c = curveClearance(j.params);
    if (c && c.clear < gap * 0.98) { free = false; f('fail', `the ${n} flexure comes ${Math.max(0, c.clear).toFixed(2)} mm from itself, near (${c.at[0].map((x) => x.toFixed(1)).join(', ')}): under the ${gap} mm gap, its loops fuse there`, 'lamina.free', { joint: n, gap: c.clear, at: c.at }); }
  }
  for (const [a, b] of pairs) {
    const A = parts[a].shape, B = parts[b].shape;
    if (!joined(a, b)) {
      if (within(A, B, gap * 0.98)) { free = false; const g = gapBetween(A, B, gap); f('fail', `${what(a)} and ${what(b)} are ${g ? `${g} mm` : 'touching'} apart at rest: under the ${gap} mm gap, they print as one`, 'lamina.free', { parts: [a, b], gap: g, at: box(intersect(grow(A, gap / 2), grow(B, gap / 2))) }); }
      continue;
    }
    const [fx, body] = parts[a].kind === 'flexure' ? [a, b] : [b, a], F = parts[fx].shape, Bd = parts[body].shape;
    const contact = intersect(F, grow(Bd, TOUCH));
    if (area(contact) <= AREA) { free = false; f('fail', `the ${fx} flexure doesn't reach ${what(body)}: it would print loose`, 'lamina.attached', { parts: [fx, body] }); continue; }
    if (area(intersect(F, Bd)) <= AREA) { free = false; f('fail', `the ${fx} flexure only meets ${what(body)} along an edge: run it into it (by a line or two), or it prints as two pieces`, 'lamina.attached', { parts: [fx, body], at: box(contact) }); continue; }
    // Overlapping it in two places is fused (touching along a line, flush, is one material)
    const legs = OWN_BLOCKS.has(joints[fx].kind) ? 1 : (centrelines(joints[fx].kind, joints[fx].params)?.length ?? 1); // a flexure of several leaves meets each body once a leaf
    if (pieces(intersect(F, Bd)) > legs) { free = false; f('fail', `the ${fx} flexure touches ${what(body)} in more than one place: it's fused to it away from its root`, 'lamina.free', { parts: [fx, body], at: box(contact) }); continue; }
    // The flexure away from where it grows out of the body, and its round if it has one (a round lies on the body out to
    // its radius past the flexure's side, and the rounding reaches no further than 1.2 radii)
    const rest = subtract(F, grow(contact, gap * 2 + cell + 1.25 * (joints[fx].params?.fillet ?? 0)));
    if (area(rest) > AREA && within(rest, Bd, gap * 0.98)) { free = false; const g = gapBetween(rest, Bd, gap); f('fail', `the ${fx} flexure runs ${g ? `${g} mm` : 'touching'} from ${what(body)} away from its root: under the ${gap} mm gap, it fuses there`, 'lamina.free', { parts: [fx, body], gap: g, at: box(intersect(grow(rest, gap / 2), grow(Bd, gap / 2))) }); }
  }
  if (free) f('pass', `everything clears what it isn't joined to by ${gap} mm, and each flexure touches only its two bodies: it prints free`, 'lamina.free');

  const kinematic = spec.kinematic !== false; // false: the physics alone says how it moves (contact pushing a follower both ways, a cam)
  const states = { rest: {}, ...(spec.states || {}) }, state = (s) => { const v = typeof s === 'string' ? states[s] : s; if (!v) throw new Error(`no state "${s}"`); return v; };
  const seq = spec.sequence || [], frames = [], reached = {}, solved = {};
  let planned = null;
  // The strain, finite-element peak and hard stop of each flexure, from the travels the sequence reached (the
  // kinematic walk's, or the physics')
  function strainAndStops() {
    // ---- the peak strain by finite elements: the corners beam theory doesn't see ----
    const centroid = (a) => { const { lo, hi } = box(a); return [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2]; };
    // Corners where the outline turns into the material, the turn measured over `span` either side (so a round of a
    // radius well over the span turns a little, a square corner a right angle, and a booleans' wiggle not at all)
    const reentrant = (a, span) => a.flatMap((l) => l.map((p, k) => {
      const reach = (dir) => { for (let i = 1; i < l.length; i++) { const q = l[(k + dir * i + l.length * i) % l.length]; if (Math.hypot(q[0] - p[0], q[1] - p[1]) >= span) return q; } return l[(k + dir + l.length) % l.length]; };
      const o = reach(-1), q = reach(1), u1 = [p[0] - o[0], p[1] - o[1]], u2 = [q[0] - p[0], q[1] - p[1]];
      return { p, turn: Math.atan2(u1[0] * u2[1] - u1[1] * u2[0], u1[0] * u2[0] + u1[1] * u2[1]) };
    }).filter((c) => c.turn < -rad(SHARP_TURN)).map((c) => c.p));
    function feCheck(n, j, most, beam) {
      const t = Math.min(...[j.params?.thickness ?? j.params?.neck ?? gap * 4].flat()), to = parts[j.to].shape, from = parts[j.from].shape, c = centroid(to);
      const m = j.motion, dir = m.axis ? m.axis : (() => { const r = [c[0] - m.pivot[0], c[1] - m.pivot[1]], l = Math.hypot(...r); return [-r[1] / l, r[0] / l]; })();
      const travel = m.axis ? most : j.leafy ? (most * Math.hypot(c[0] - m.pivot[0], c[1] - m.pivot[1])) / m.leaf : rad(most) * Math.hypot(c[0] - m.pivot[0], c[1] - m.pivot[1]);
      const r = fePeak({ flexure: parts[n].shape, held: from, moved: to, direction: dir, travel, E: material.E, cell: t / FE_CELLS, band: Math.max(2 * t, gap * 4) });
      if (!r) { f('info', `${n}: its peak strain couldn't be worked out by finite elements (nothing held, or nothing to push)`, 'lamina.peak', { joint: n }); return null; }
      const sharp = reentrant(union([parts[n].shape, intersect(from, grow(parts[n].shape, t * 2)), intersect(to, grow(parts[n].shape, t * 2))]), r.cell).some((p) => Math.hypot(p[0] - r.at[0], p[1] - r.at[1]) <= r.cell * 2.01);
      // The finite elements are linear: what they say at the full travel is a concentration over what a linear beam says
      // there. A model solved for large deflections (a curve) is asked for its own linear strain (at a twentieth of the
      // travel, scaled up), the concentration taken over that, and applied to what it says at the full travel
      const lin = j.model.signed ? (Math.abs(j.model.strain((Math.sign(used[n]?.most || 1) * most) / 20)) * 20) : beam;
      const ratio = lin > 0 ? r.peak / lin : null; r.peak = ratio && j.model.signed ? ratio * beam : r.peak;
      const where = `at (${r.at.map((x) => x.toFixed(1)).join(', ')})`, limit = material.strainLimit;
      if (sharp) f('fail', `${n}: its strain peaks at a square corner ${where}, ${(r.peak * 100).toFixed(2)}% on ${r.cell.toFixed(2)} mm cells and more on finer ones: a sharp inside corner has no bound, and it's where a print yields. Round it (a radius about the flexure's thickness), or taper into it`, 'lamina.peak', { joint: n, strain: r.peak, at: r.at, sharp: true });
      if (!sharp) f(r.peak <= limit ? 'pass' : 'fail', `${n}: finite elements give a peak of ${(r.peak * 100).toFixed(2)}% ${where}${ratio ? ` (${ratio.toFixed(2)} × beam theory)` : ''}, ${r.peak <= limit ? 'within' : 'over'} the limit of ${(limit * 100).toFixed(2)}%`, 'lamina.peak', { joint: n, strain: r.peak, at: r.at, ratio });
      return { ...r, sharp, ratio: sharp ? Infinity : ratio };
    }

    // ---- strain and stops: displacement-driven, each flexure's travel against its limit, and a hard stop before it ----
    for (const [n, j] of Object.entries(joints)) {
      const u = used[n], m = j.model;
      if (!m) { f('info', `${n}: your own flexure, with no model: its strain and stop aren't checked`, 'lamina.model', { joint: n }); continue; }
      const toModel = (q) => (j.turning ? rad(q) : q), unit = j.turning ? '°' : ' mm', limit = limitOf(n), most = Math.abs(u?.most || 0);
      if (printer) for (const x of gens.printable({ thickness: Math.min(...[j.params.thickness ?? j.params.neck].flat()), width: j.params.width }, printer, material, m)) f(x.level, `${n}: ${x.text}`, x.code, { joint: n });
      const e = Math.abs(m.strain(toModel(m.signed ? u?.most || 0 : most))); // (a curve isn't the same both ways: its strain the way it's moved)
      f(e <= material.strainLimit ? 'pass' : 'fail', `${n}: ${u?.most ? `at its most (${+most.toFixed(2)}${unit}) it sees ${(e * 100).toFixed(2)}% strain, ${e <= material.strainLimit ? 'within' : 'over'} the limit of ${(material.strainLimit * 100).toFixed(2)}% (${+limit.toFixed(2)}${unit})` : 'nothing moves it'}`, 'lamina.strain', { joint: n, strain: e, limit });
      if (j.model.least != null && printer && j.model.least < (printer.wall_min ?? 2 * printer.line) - 1e-6) f('fail', `${n}: tapered to ${j.model.least.toFixed(2)} mm, under the thinnest wall that prints (${printer.wall_min ?? 2 * printer.line} mm)`, 'flexure.thin', { joint: n });
      const fe = u?.most && spec.check?.fe !== false ? feCheck(n, j, most, e) : null;
      // Where the real peak is over beam theory's, the travel it may go is that much less
      const reach = fe && !fe.sharp && fe.ratio > 1 ? (j.turning ? deg(m.travel(material.strainLimit / fe.ratio)) : m.travel(material.strainLimit / fe.ratio)) : limit; // (a sharp corner fails on its own; the model asked, not scaled, since a large deflection isn't linear)
      // A stop: swept from rest to the limit (less a margin), its body, or what it carries, runs into something
      const signs = follows[n] ? [follows[n].give ?? 1] : u?.signs.size ? [...u.signs] : [1, -1]; // a follower only ever gives one way
      for (const sgn of signs) {
        let hits = [], at = 0;
        for (let k = 1; k <= STOP_STEPS && !hits.length; k++) {
          at = (sgn * reach * 0.95 * k) / STOP_STEPS;
          const { v: sv, over } = solve({ [n]: at }, new Set([n])), sh = shapesAt(sv);
          hits = pairs.filter(([a, b]) => !joined(a, b) && !driven(a, b) && carries[n].has(a) !== carries[n].has(b) && (kinematic || a === 'ground' || b === 'ground') && collide(sh[a], sh[b], slack)).map(([a, b]) => ({ a, b })); // (with the physics alone, another moving part would just move: only the frame stops it)
          if (!hits.length && over.length) hits = [{ a: joints[n].to, b: joints[over[0]].to }]; // what it drives has reached its own limit
        }
        const side = signs.length > 1 ? (sgn > 0 ? ' one way' : ' the other way') : '';
        const lim = `${+reach.toFixed(2)}${unit}${reach < limit ? ' (by its finite-element peak)' : ''}`;
        if (hits.length) f('pass', `${n}: stopped by ${what(carries[n].has(hits[0].a) ? hits[0].b : hits[0].a)} at ${+Math.abs(at).toFixed(2)}${unit}${side}, before its limit of ${lim}`, 'lamina.stop', { joint: n, at });
        else f('fail', `${n}: nothing stops it${side} before ${lim}, where it breaks: add a hard stop (a post or a wall it meets)`, 'lamina.stop', { joint: n, limit: reach });
      }
    }

  }

  if (kinematic) {
  // ---- the sequence, then each state as the sequence reaches it: nothing runs into anything, nothing jams ----
  for (let i = 0; i + 1 < seq.length; i++) {
    // From where the last step settled; a joint both states set alike stays where it settled, so it isn't moved
    const a = reached[seq[i]] ?? state(seq[i]), said = state(seq[i]), b = { ...state(seq[i + 1]) };
    for (const k of Object.keys(b)) if (said[k] === b[k] && a[k] != null) b[k] = a[k];
    const r = walk(a, b), pct = r ? `${Math.round(r.t * 100)}% of the way` : '';
    // A step into a state that a catch holds may end on the catch: it settles there, short of the state's own travel
    const catches = (spec.holds?.[seq[i + 1]] || []).filter(([jn]) => Math.abs((a[jn] || 0) - (b[jn] || 0)) > 1e-9);
    const caught = r && catches.find(([jn, by]) => {
      const mine = (x) => carries[jn].has(x), theirs = (x) => x === by || Object.keys(follows).some((fn) => carries[fn].has(by) && carries[fn].has(x));
      return (r.kind === 'jam' && (mine(r.by) || r.by === joints[jn].to) && carries[r.joint].has(by)) || (r.kind === 'jam' && carries[jn].has(r.joint) && theirs(r.by)) || (r.kind === 'hit' && ((mine(r.a) && theirs(r.b)) || (mine(r.b) && theirs(r.a))));
    });
    if (caught) {
      const [jn, by] = caught, at = r.last[jn] || 0;
      reached[seq[i + 1]] ??= r.last;
      f('pass', `${seq[i]} to ${seq[i + 1]}: settles on ${by} at ${+Math.abs(at).toFixed(2)}${joints[jn].turning ? '°' : ' mm'} (${jn})`, 'lamina.sequence', { from: seq[i], to: seq[i + 1], settles: at });
    } else if (!r) { reached[seq[i + 1]] ??= reachedLast; f('pass', `${seq[i]} to ${seq[i + 1]}: clear all the way`, 'lamina.sequence', { from: seq[i], to: seq[i + 1] }); }
    else if (r.kind === 'jam') f('fail', `${seq[i]} to ${seq[i + 1]}: ${r.by} jams on ${joints[r.joint].to} ${pct}: it meets a face too steep to push aside (at a friction of ${mu.pass})`, 'lamina.jam', { from: seq[i], to: seq[i + 1], joint: r.joint, t: r.t });
    else if (r.kind === 'over') f('fail', `${seq[i]} to ${seq[i + 1]}: ${r.joint} would have to give past its limit ${pct}`, 'lamina.follow', { from: seq[i], to: seq[i + 1], joint: r.joint, t: r.t });
    else if (r.pushing) f('fail', `${seq[i]} to ${seq[i + 1]}: ${follows[r.pushing].by.join(' and ')} pushes ${joints[r.pushing].to} aside until ${what(r.a)} and ${what(r.b)} meet, ${pct}: it can't get out of the way (give it more room, or a shallower face)`, 'lamina.sequence', { from: seq[i], to: seq[i + 1], parts: [r.a, r.b], joint: r.pushing, at: r.at, t: r.t });
    else f('fail', `${seq[i]} to ${seq[i + 1]}: ${what(r.a)} runs into ${what(r.b)} ${pct}`, 'lamina.sequence', { from: seq[i], to: seq[i + 1], parts: [r.a, r.b], at: r.at, t: r.t });
  }
  for (const s of Object.keys(states)) {
    const r = reached[s] ? { v: reached[s], over: [], pushed: Object.fromEntries(Object.keys(follows).map((n) => [n, Math.abs((reached[s][n] || 0) - (state(s)[n] || 0))])) } : solve(state(s)), { v, over, pushed } = r;
    solved[s] = v; note(v);
    if (s === 'rest') continue;
    const hits = clashes(shapesAt(v));
    for (const n of over) f('fail', `${s}: ${n} would have to give past its limit to clear ${follows[n].by.join(' and ')}`, 'lamina.follow', { state: s, joint: n });
    for (const h of hits) f('fail', `${s}: ${what(h.a)} runs into ${what(h.b)}`, 'lamina.collide', { state: s, parts: [h.a, h.b], at: h.at });
    if (!hits.length && !over.length) f('pass', `${s}: nothing runs into anything${Object.keys(follows).some((n) => pushed[n] > slack) ? ` (${Object.keys(follows).filter((n) => pushed[n] > slack).map((n) => `${n} pushed ${+pushed[n].toFixed(2)}${joints[n].turning ? '°' : ' mm'} by what it meets`).join(', ')})` : ''}`, 'lamina.collide', { state: s });
  }

  // ---- holds: a latch. Pushing back towards rest jams on the catch, or runs into it ----
  for (const [s, list] of Object.entries(spec.holds || {})) for (const [jn, by] of list) {
    if (!joints[jn] || !parts[by]) throw new Error(`holds in ${s}: no joint "${jn}" or part "${by}"`);
    if (seq.includes(s) && !reached[s]) { f('info', `${s}: the sequence doesn't reach it, so whether ${by} holds isn't checked`, 'lamina.holds', { state: s, joint: jn, catch: by }); continue; }
    const v = solved[s] ?? solve(state(s)).v, q = v[jn] || 0, back = Math.sign(q) * Math.max(gap * 2, Math.abs(q) * 0.1);
    // The follower that is the catch (or carries it): how far it must move to let go is found by moving it along its give
    const fn = Object.keys(follows).find((x) => carries[x].has(by) || joints[x].to === by), unit = fn && joints[fn].turning ? '°' : ' mm';
    const grips = [];
    const holding = (vals) => { const r = walk(vals, { ...vals, [jn]: q - back }, { record: false, friction: mu.hold }); grips.push(r?.kind === 'jam' ? r.grip : walkRatio > 0 ? 1 / walkRatio : null); return !!r && (r.kind === 'jam' || r.kind === 'over' || (r.kind === 'hit' && [r.a, r.b].some((x) => carries[jn].has(x)) && [r.a, r.b].some((x) => x === by || (fn && carries[fn].has(x))))); }; // held: it jams, or what it moves runs into the catch
    const held = holding(v), grip = grips[0]; // the least friction it holds at: 0 when it holds whatever the friction
    let lets = null;
    if (held && fn) {
      const g = follows[fn].give ?? 1, most = Math.min(limitOf(fn), follows[fn].most ?? Infinity), reach = Number.isFinite(most) ? most : gap * 100;
      if (!holding({ ...v, [fn]: g * reach })) { let lo = 0, hi = reach; for (let i = 0; i < 7; i++) { const mid = (lo + hi) / 2; if (holding({ ...v, [fn]: g * mid })) lo = mid; else hi = mid; } lets = hi; }
    }
    const tight = lets != null && lets < gap; // a catch that lets go within a print gap holds by luck
    f(held && !tight ? 'pass' : 'fail', `${s}: ${held ? `${by} holds ${joints[jn].to} against the ${jn} flexure ${grip > 0 ? `at any friction over ${+grip.toFixed(2)} (checked at ${mu.hold})` : 'whatever the friction'}${lets != null ? `, and lets go once ${fn} moves ${+lets.toFixed(2)}${unit}${tight ? `: less than the ${gap} mm gap, too shallow to trust` : ''}` : fn ? `, and ${fn} can't move far enough to let go` : ''}` : `nothing holds ${joints[jn].to}: pushed ${+Math.abs(back).toFixed(2)} back towards rest it passes ${by}${grip ? `, pushing it aside: it would take a friction over ${+grip.toFixed(2)} to hold (checked at ${mu.hold}); tilt the catch so the load presses it in` : ''}`}`, 'lamina.holds', { state: s, joint: jn, catch: by, ...(lets != null ? { release: lets } : {}) });
  }

  strainAndStops();
  } else for (const s of Object.keys(states)) solved[s] = state(s);

  // ---- energy and forces ----
  const energy = {};
  for (const [s, v] of Object.entries(solved)) {
    let e = 0;
    for (const [jn, q] of Object.entries(v)) { // a model's turning stiffness is a radian's; your own pivot's is a degree's
      const j = joints[jn]; if (!j?.stiffness) continue;
      e += j.turning ? (j.stiffness * (j.model ? rad(q) : q) * rad(q)) / 2 : (j.stiffness * q * q) / 2;
    }
    energy[s] = e / 1000; // N·mm to J
  }
  const forces = Object.entries(joints).filter(([n]) => used[n]?.most).map(([n, j]) => {
    const q = used[n].most;
    return j.turning ? `${n} ${Math.abs(j.stiffness * (j.model ? rad(q) : q)).toFixed(1)} N·mm at ${+Math.abs(q).toFixed(1)}°` : `${n} ${Math.abs(j.stiffness * q).toFixed(2)} N at ${+Math.abs(q).toFixed(2)} mm`;
  });
  const most = Object.entries(energy).sort((x, y) => y[1] - x[1])[0], joules = (e) => (e < 0.01 ? `${(e * 1000).toFixed(1)} mJ` : `${e.toFixed(3)} J`);
  if (most && most[1] > 0) f('info', `the most stored is ${joules(most[1])}, in ${most[0]}${forces.length ? `; at their most: ${forces.join(', ')}` : ''}`, 'lamina.energy', { energy });

  // ---- the mechanism as it would behave: its flexures as beams bending as far as they bend, its bodies touching, a
  // hand driving, holding and letting go (physics.mjs). The force each step takes, where a latch lets go, whether a
  // catch holds when let go of, the strain all the way, and the shapes as they bend ----
  let sim = null;
  const handMost = (typeof spec.physics === 'object' && spec.physics.force) || 50; // N: the most a hand pulls or pushes
  if (spec.physics !== false && seq.length) {
    const o = typeof spec.physics === 'object' ? spec.physics : {};
    const loose = Object.fromEntries(Object.entries(spec.free || {}).map(([n, l]) => [n, { shape: all(l.shape), mass: l.mass }]));
    const seen = spec.fixtures ? { ...parts, ground: { ...parts.ground, shape: union([parts.ground.shape, all(spec.fixtures)]) } } : parts; // fixtures: fixed, in the physics, not in the print
    sim = simulate({ parts: seen, joints, material, height, gap, states, sequence: seq, holds: spec.holds, kinematic: places, loose, grips: spec.grips, ...(spec.fire ? { fire: spec.fire } : {}) }, o);
    if (sim.skipped) { f('info', `${sim.skipped.join(', ')}: no centreline to solve as beams (a notch, a cartwheel, a shape of your own), so how it behaves comes from the kinematic model only`, 'lamina.physics'); sim = null; }
  }
  if (sim) {
    const unitOf = (jn) => (joints[jn].turning ? '°' : ' mm');
    for (const tr of sim.transitions) {
      for (const c of tr.curve) {
        const peak = Math.max(...c.points.map(([, F]) => Math.abs(F))), travel = Math.abs(c.points.at(-1)[0]);
        f(peak <= handMost ? 'info' : 'fail', `${tr.from} to ${tr.to}: driving ${c.joint} ${+travel.toFixed(2)} mm takes up to ${peak.toFixed(2)} N${peak <= handMost ? '' : `, more than a hand's ${handMost} N: it jams`}`, 'lamina.force', { from: tr.from, to: tr.to, joint: c.joint, peak, curve: c.points });
      }
      const seen = new Set();
      for (const ev of tr.events) {
        if (seen.has(ev.body)) continue;
        seen.add(ev.body);
        const by = ev.hand.map((h) => `${h.joint} moved ${+Math.abs(h.travel).toFixed(2)} mm under ${Math.abs(h.force).toFixed(2)} N`).join(', ');
        f('info', `${tr.from} to ${tr.to}: ${ev.body} is let go ${Math.round(ev.t * 100)}% of the way${by ? `, with ${by}` : ''}, and jumps ${ev.jump.toFixed(1)} mm`, 'lamina.release', { from: tr.from, to: tr.to, body: ev.body, t: ev.t, hand: ev.hand });
      }
      // Back to rest at the end of the sequence: does everything come home?
      if (tr.to === 'rest' && seq.at(-1) === 'rest' && tr === sim.transitions.at(-1)) {
        const away = Object.keys(sim.sys.body).filter((b) => !sim.sys.body[b].fixed).map((b) => { const d = sim.sys.body[b].dof; return [b, Math.hypot(tr.end[d], tr.end[d + 1])]; }).filter(([, x]) => x > gap);
        f(away.length ? 'fail' : 'pass', away.length ? `back at rest, ${away.map(([b, x]) => `${b} is ${x.toFixed(2)} mm from where it started`).join(', ')}: it doesn't come home` : 'back at rest, everything is where it started', 'lamina.home', { away });
      }
      // Into a state a catch holds: let go of, does it stay?
      for (const [jn, by] of spec.holds?.[tr.to] || []) {
        const b = joints[jn].to, d = sim.sys.body[b].dof, now = Math.hypot(tr.end[d], tr.end[d + 1]), T = places(state(tr.to))[b], c = sim.centre[b];
        const meant = Math.hypot(T[0] * c[0] + T[1] * c[1] + T[2] - c[0], T[3] * c[0] + T[4] * c[1] + T[5] - c[1]), kept = meant > 0 ? now / meant : 1;
        f(kept > 0.75 ? 'pass' : 'fail', `${tr.to}: let go of, ${b} ${kept > 0.75 ? `stays on ${by}, ${now.toFixed(2)} mm from rest${tr.holding?.[jn] != null ? `, which takes ${tr.holding[jn].toFixed(1)} N` : ''} (beams and contact, ${sim.friction ? `friction ${sim.friction}` : 'no friction'})` : `doesn't stay: it runs back to ${now.toFixed(2)} mm from rest, past ${by}`}`, 'lamina.held', { state: tr.to, joint: jn, kept });
      }
    }
    // Requirements on the force curves: [{ step: 'from>to', joint, peak: [least, most], click: least share it drops after
    // the peak, end: [least, most] }], in N: what a key's feel or a latch's push must be
    for (const req of spec.requires || []) {
      const [from, to] = req.step.split('>'), tr = sim.transitions.find((x) => x.from === from && x.to === to), c = tr?.curve.find((x) => !req.joint || x.joint === req.joint);
      if (!c) { f('fail', `${req.step}: no driven ${req.joint || 'joint'} to measure`, 'lamina.requires', { step: req.step }); continue; }
      // The click: the deepest fall from a peak before the force climbs back over it; the peak is that one (the tactile
      // bump), or the highest when nothing falls
      const F = c.points.map(([, x]) => Math.abs(x)), end = F.at(-1);
      let drop = 0, top = Math.max(...F);
      F.forEach((x, i) => { if (!(x > 0)) return; let low = x; for (let k = i + 1; k < F.length && F[k] <= x; k++) low = Math.min(low, F[k]); const d = (x - low) / x; if (d > drop) { drop = d; if (d > 0.05) top = x; } });
      const within = (x, [lo, hi]) => x >= lo - 1e-9 && x <= hi + 1e-9, said = [];
      if (req.peak) said.push([within(top, req.peak), `peaks at ${top.toFixed(2)} N${drop > 0.05 ? ' (its click)' : ''} (wanted ${req.peak[0]} to ${req.peak[1]})`]);
      if (req.click != null) said.push([drop >= req.click, `falls ${Math.round(drop * 100)}% after it (a click wants ${Math.round(req.click * 100)}% or more)`]);
      if (req.end) said.push([within(end, req.end), `ends at ${end.toFixed(2)} N (wanted ${req.end[0]} to ${req.end[1]})`]);
      f(said.every(([ok]) => ok) ? 'pass' : 'fail', `${req.step}: ${c.joint} ${said.map(([, t]) => t).join(', ')}`, 'lamina.requires', { step: req.step, joint: c.joint, peak: top, drop, end });
    }
    if (!kinematic) { // how far the physics moved each joint, as the kinematic model counts it
      for (const [jn, j] of Object.entries(joints)) {
        const d = sim.sys.body[j.to].dof;
        for (const fr of sim.frames) {
          const [dx, dy, phi] = [fr.q[d], fr.q[d + 1], fr.q[d + 2]], m = j.motion;
          const q = m.axis ? dx * m.axis[0] + dy * m.axis[1] : j.leafy ? Math.sin(phi) * m.leaf : deg(phi);
          if (Math.abs(q) > (j.turning ? 0.5 : gap)) note({ [jn]: q }); // a twitch isn't a travel
        }
      }
      strainAndStops();
    }
    // Tripped: pulling the trigger let the catch go. How far and how hard the finger pulled, against what the catch held
    if (sim.trip) {
      const t = sim.trip, h = t.hand[0], held = sim.transitions.find((x) => x.to === t.from)?.holding, most = held ? Math.max(...Object.values(held)) : null;
      if (h) f('info', `${t.from} to ${t.to}: pulling ${h.joint} ${+Math.abs(h.travel).toFixed(2)} mm, at up to ${h.force.toFixed(2)} N, lets ${t.body} go${most ? `: the catch held ${most.toFixed(1)} N, ${(h.force / most).toFixed(2)} of it on the finger` : ''}${sim.friction ? ` (friction ${sim.friction})` : ' (no friction)'}`, 'lamina.trip', { ...t, held: most });
    }
    // Firing: let go from a state, step through time
    if (spec.fire) {
      const fr = sim.fire;
      if (!fr) f('fail', `fire: the sequence never reaches ${spec.fire.from}`, 'lamina.fire');
      else if (fr.pressed > 0.01 * fr.stored) f('fail', `fire: at ${spec.fire.from}, something is already pressed into something (${(fr.pressed * 1000).toFixed(1)} mJ of it, against ${(fr.stored * 1000).toFixed(1)} mJ in the springs): put ${spec.fire.disc} clear of where the pusher is drawn to`, 'lamina.fire', { pressed: fr.pressed });
      else {
        const quick = Object.entries(fr.speeds).filter(([b]) => b !== spec.fire.disc).sort((a, b) => b[1] - a[1])[0];
        const ex = fr.exit, share = ex && fr.stored > 0 ? ex.energy / fr.stored : 0;
        f(ex ? (spec.fire.most != null && ex.energy > spec.fire.most ? 'fail' : 'info') : 'fail', ex
          ? `fired from ${spec.fire.from}${sim.trip ? ' (from the moment the trigger lets go)' : ''}: ${quick ? `${quick[0]} reaches ${quick[1].toFixed(1)} m/s; ` : ''}${spec.fire.disc} leaves at ${ex.speed.toFixed(1)} m/s after ${(ex.t * 1000).toFixed(1)} ms, with ${(ex.energy * 1000).toFixed(1)} mJ: ${Math.round(share * 100)}% of the ${(fr.stored * 1000).toFixed(1)} mJ stored${spec.fire.most != null ? (ex.energy > spec.fire.most ? `, over the ${spec.fire.most * 1000} mJ allowed` : `, within the ${spec.fire.most * 1000} mJ allowed`) : ''}`
          : `fired from ${spec.fire.from}: ${spec.fire.disc} never leaves`, 'lamina.fire', { speeds: fr.speeds, exit: ex, stored: fr.stored });
      }
    }
    for (const [jn, e] of Object.entries(sim.strain)) f(e <= material.strainLimit ? 'pass' : 'fail', `${jn}: bending as far as it bends through the sequence, it sees up to ${(e * 100).toFixed(2)}% strain (large-deflection beams), ${e <= material.strainLimit ? 'within' : 'over'} the limit of ${(material.strainLimit * 100).toFixed(2)}%`, 'lamina.beams', { joint: jn, strain: e });
  }

  // ---- bridges: the frame printed over a moving part on the top layers (a barrel's roof over a stem, so it can't lift
  // out of its channel). Every body that passes under one is cut down by the bridge and a gap, along all of it that
  // ever passes under; the bridge spans no wider than the printer bridges, and stands on the frame both sides ----
  const layer = printer?.layer ?? 0.2, bridgeMost = printer?.bridge ?? 5;
  const bridges = [spec.bridges || []].flat().map((b) => ({ shape: all(b.shape), depth: b.depth ?? layer * 6, gap: b.gap ?? layer * 3, bottom: b.side === 'bottom' }));
  const arches = []; // a floor strip's: the parts passing over it arched up at 45°, which prints without support
  const guidesHeld = []; // what guides hold across the plane
  const cuts = [];
  if (bridges.length) {
    const poses = [places({})];
    for (let i = 0; i + 1 < seq.length; i++) {
      const a = reached[seq[i]] ?? state(seq[i]), b = state(seq[i + 1]), keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
      for (let k = 0; k <= FRAMES * 2; k++) { const t = k / (FRAMES * 2); poses.push(places(solve(Object.fromEntries(keys.map((x) => [x, (a[x] || 0) + ((b[x] || 0) - (a[x] || 0)) * t]))).v)); }
    }
    bridges.forEach((br, i) => {
      const name = br.bottom ? `floor ${i + 1}` : `bridge ${i + 1}`, under = subtract(br.shape, parts.ground.shape), left = height - br.depth - br.gap;
      if (empty(under)) { f('warn', `${name} has nothing to cross: it's all on the frame`, 'lamina.bridge'); return; }
      if (!br.bottom) { // (a floor stands on the bed: it spans nothing)
        const wide = !empty(shrink(under, bridgeMost / 2 + 0.01, 'Round'));
        f(wide ? 'fail' : 'pass', `${name} spans ${wide ? 'more than' : 'no more than'} the ${bridgeMost} mm the printer bridges`, 'lamina.bridge', { bridge: i });
      }
      const feet = pieces(intersect(br.shape, parts.ground.shape));
      f(feet >= 2 ? 'pass' : 'fail', `${name} stands on the frame ${feet >= 2 ? 'on both sides' : feet ? 'on one side only: it would droop' : 'nowhere: it would print in mid-air'}`, 'lamina.bridge', { bridge: i });
      for (const [n, p] of Object.entries(parts)) {
        if (p.kind === 'flexure' && area(intersect(br.shape, p.shape)) > AREA) f('fail', `${name} is over the ${n} flexure: a bridge goes over what slides, not what bends`, 'lamina.bridge', { bridge: i, joint: n });
        if (p.kind !== 'body') continue;
        const cut = intersect(p.shape, union(poses.map((P) => moved(inverse(P[n]), br.shape)))); // all of it that ever passes under, where it is at rest
        if (empty(cut)) continue;
        if (!br.bottom) {
          cuts.push({ shape: cut, from: left, to: height, body: n });
          f(left >= 2 * layer * 5 ? 'pass' : 'fail', `${name}: ${n} passes under it, cut down to ${left.toFixed(2)} mm there (the bridge ${br.depth.toFixed(2)} mm, a gap of ${br.gap.toFixed(2)} mm over it)`, 'lamina.bridge', { bridge: i, body: n, left });
          continue;
        }
        // Over a floor: the part's underside arched up over all of it that ever passes over, the arch's flanks at 45°
        // along the way it moves (so each layer overhangs the one below by no more than it rises), high enough over
        // the whole stretch
        const T = poses.reduce((a, P) => { const d = Math.hypot(P[n][2], P[n][5]); return d > a.d ? { d, u: [P[n][2] / d, P[n][5] / d] } : a; }, { d: 0, u: [1, 0] });
        const turned = poses.some((P) => Math.abs(Math.atan2(P[n][3], P[n][0])) > rad(1));
        if (turned) { f('fail', `${name}: ${n} turns as it passes over it: a floor's arch is for what slides`, 'lamina.bridge', { bridge: i, body: n }); continue; }
        const u = T.u, along = cut.flat().map(([x, y]) => x * u[0] + y * u[1]), lo = Math.min(...along), hi = Math.max(...along), clear = br.depth + br.gap;
        const apex = clear + (hi - lo) / 2;
        arches.push({ body: n, shape: intersect(p.shape, grow(cut, clear + 0.5)), u, lo: lo - clear, hi: hi + clear, apex });
        f(height - apex >= 2 ? 'pass' : 'fail', `${name}: ${n} passes over it, its underside arched up to ${apex.toFixed(2)} mm at 45° (${clear.toFixed(2)} mm clear over the floor all along), leaving ${(height - apex).toFixed(2)} mm above`, 'lamina.bridge', { bridge: i, body: n, apex });
      }
    });
  }

  // ---- guides: where a body slides through a strip of the frame, a ridge on its sides with 45° flanks, centred on
  // the print's height, runs in a matching groove in the frame's wall (a tortoise's shell in its socket), so it can't
  // lift or tip out of the plane. Both are drawn out from the same faces by the same amount at each height, so the gap
  // between them is the gap in the plane; each flank overhangs at 45° and prints without support ----
  const guides = [spec.guides || []].flat().map((x) => ({ body: x.body, shape: all(x.shape), depth: x.depth ?? Math.min(1.5, height / 4) }));
  const layers = []; // slabs added to and cut from the print: { from, to, add?, cut? }
  if (guides.length) {
    const poses = [places({})];
    for (let i = 0; i + 1 < seq.length; i++) {
      const a = reached[seq[i]] ?? state(seq[i]), b = state(seq[i + 1]), keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
      for (let k = 0; k <= FRAMES * 2; k++) { const t = k / (FRAMES * 2); poses.push(places(solve(Object.fromEntries(keys.map((x) => [x, (a[x] || 0) + ((b[x] || 0) - (a[x] || 0)) * t]))).v)); }
    }
    guides.forEach((gd, i) => {
      const n = gd.body, body = parts[n]?.shape;
      if (!body || parts[n].kind !== 'body') { f('fail', `guide ${i + 1}: no body "${n}" to guide`, 'lamina.guide'); return; }
      const mine = intersect(body, union(poses.map((P) => moved(inverse(P[n]), gd.shape)))); // all of the body that ever passes through the strip, at rest
      if (empty(mine)) { f('fail', `guide ${i + 1}: ${n} never passes through it`, 'lamina.guide'); return; }
      const sweptAll = (a) => union(poses.map((P) => moved(P[n], a)));
      const away = (a) => subtract(a, body); // (what's drawn out from the body's faces, not the body)
      // A slab a layer: on the printer's layers, so each layer steps out (or in) by no more than a layer, 45°
      for (let k = Math.floor((height / 2 - gd.depth) / layer); k * layer < height / 2 + gd.depth; k++) {
        const z0 = k * layer, z1 = z0 + layer, v = Math.max(0, gd.depth - Math.abs((z0 + z1) / 2 - height / 2));
        if (v < 0.01) continue;
        const ridge = intersect(away(grow(body, v)), grow(mine, v)); // the body's sides there, drawn out by v
        const groove = intersect(parts.ground.shape, grow(sweptAll(ridge), gap * 1.05 + 0.02)); // the frame cut back to clear the ridge wherever it goes (not only in the strip: the ridge runs on past it)
        layers.push({ from: z0, to: z1, add: ridge }, { from: z0, to: z1, cut: groove });
      }
      const span = box(mine);
      f('pass', `guide ${i + 1}: ${n} runs in it for ${(span.hi[0] - span.lo[0]).toFixed(1)} mm with a ${gd.depth.toFixed(2)} mm ridge in a groove, flanks at 45°: held across the plane`, 'lamina.guide', { guide: i, body: n });
      guidesHeld.push({ body: n, shape: mine });
    });
  }

  // ---- the print, everything at rest, and frames along the sequence for an animation ----
  const extrude = (shapes) => solidOf(union(Object.values(shapes)), height);
  let solid = bridges.length || layers.length ? solidWith(union(Object.values(parts).map((p) => p.shape)), height, cuts, bridges.map((b) => (b.bottom ? { shape: b.shape, from: 0, to: b.depth } : { shape: b.shape, from: height - b.depth, to: height })), arches, layers) : extrude(Object.fromEntries(Object.entries(parts).map(([n, p]) => [n, p.shape])));
  if (spec.finish) solid = spec.finish(solid);
  const outline = (v) => Object.fromEntries(Object.entries(shapesAt(v)).map(([n, g]) => [n, g.map((o) => o.map(([x, y]) => [+x.toFixed(3), +y.toFixed(3)]))]));
  for (let i = 0; i + 1 < seq.length; i++) {
    const a = reached[seq[i]] ?? state(seq[i]), said = state(seq[i]), b = { ...state(seq[i + 1]) };
    for (const k of Object.keys(b)) if (said[k] === b[k] && a[k] != null) b[k] = a[k];
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])], active = new Set(keys.filter((x) => Math.abs((a[x] || 0) - (b[x] || 0)) > 1e-9)); // followers solved per frame
    for (let k = 0; k < FRAMES; k++) { const t = k / FRAMES; frames.push({ from: seq[i], to: seq[i + 1], t, parts: outline(solve(Object.fromEntries(keys.map((x) => [x, (a[x] || 0) + ((b[x] || 0) - (a[x] || 0)) * t])), active).v) }); }
  }
  if (seq.length) frames.push({ from: seq[seq.length - 1], to: seq[seq.length - 1], t: 0, parts: outline(solved[seq[seq.length - 1]]) });
  if (sim) { // the frames as the beams solved them: each body where it went, each flexure bent along its centreline
    const still = shapeOf(sim.sys, new Float64Array(sim.sys.dofs));
    const poseT = (n, q) => { if (parts[n].kind === 'ground') return I; const d = sim.sys.body[n].dof, c = sim.centre[n], cs = Math.cos(q[d + 2]), sn = Math.sin(q[d + 2]); return [cs, -sn, c[0] + q[d] - cs * c[0] + sn * c[1], sn, cs, c[1] + q[d + 1] - sn * c[0] - cs * c[1]]; };
    const round3 = (a) => a.map((o) => o.map(([x, y]) => [+x.toFixed(3), +y.toFixed(3)]));
    // How far a frame's bodies are from where they're meant to be (the kinematic model): a flood's first pass, solved
    // without a frame, lets a body tip in its play, and its flexures fling about with it
    const offPlan = (fr) => {
      const a = reached[fr.from] ?? state(fr.from), b = state(fr.to), keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
      const at = places(solve(Object.fromEntries(keys.map((x) => [x, (a[x] || 0) + ((b[x] || 0) - (a[x] || 0)) * fr.t]))).v);
      return Math.max(0, ...Object.keys(parts).filter((n) => parts[n].kind === 'body').map((n) => Math.max(...corners(n).map((c) => Math.hypot(...apply(poseT(n, fr.q), c).map((x, k) => x - apply(at[n], c)[k]))))));
    };
    const physical = sim.frames.filter((fr, i, all) => fr.t === 0 || i % 2 === 0 || i === all.length - 1).map((fr) => ({ from: fr.from, to: fr.to, t: fr.t, off: offPlan(fr), forces: fr.forces, energy: fr.energy, strain: fr.strain, parts: Object.fromEntries(Object.entries(parts).map(([n, p]) => {
      if (p.kind !== 'flexure') return [n, round3(moved(poseT(n, fr.q), p.shape))];
      const j = joints[n], lines = Object.keys(sim.beamOf).filter((b) => sim.beamOf[b] === n).map((b) => ({ rest: still.lines[b], now: fr.shape.lines[b], turn: fr.shape.turns[b], from: poseT(j.from, fr.q), to: poseT(j.to, fr.q) }));
      return [n, round3(bend(p.shape, lines))];
    })) }));
    if (sim.fire) for (const fr of sim.fire.frames) physical.push({ from: `${spec.fire.from}, fired`, to: `${spec.fire.from}, fired`, t: fr.t, label: `fired, ${(fr.t * 1000).toFixed(1)} ms`, forces: fr.forces, energy: fr.energy, strain: fr.strain, speeds: sim.fire.speeds, parts: {
      ...Object.fromEntries(Object.entries(parts).map(([n, p]) => {
        if (p.kind !== 'flexure') return [n, round3(moved(poseT(n, fr.q), p.shape))];
        const j = joints[n], sh = shapeOf(sim.sys, Float64Array.from(fr.q)), lines = Object.keys(sim.beamOf).filter((b) => sim.beamOf[b] === n).map((b) => ({ rest: still.lines[b], now: sh.lines[b], turn: sh.turns[b], from: poseT(j.from, fr.q), to: poseT(j.to, fr.q) }));
        return [n, round3(bend(p.shape, lines))];
      })),
      ...Object.fromEntries(Object.keys(spec.free || {}).map((n) => { const d = sim.sys.body[n].dof, c = sim.centre[n], q = fr.q, cs = Math.cos(q[d + 2]), sn = Math.sin(q[d + 2]); return [n, round3(moved([cs, -sn, c[0] + q[d] - cs * c[0] + sn * c[1], sn, cs, c[1] + q[d + 1] - sn * c[0] - cs * c[1]], all(spec.free[n].shape)))]; })),
    } });
    planned = [...frames]; // (the kinematic frames: where the bodies are meant to go)
    frames.length = 0;
    frames.push(...physical);

    // ---- the frame under the mechanism's own forces: at the end of each step, what the flexures pull on the frame
    // with (from the beams), the frame an elastic plate as tall as the print, held where a hand holds it (`grip`, or
    // its back quarter); every clearance to what moves then checked on the frame as it bends. A frame that closes
    // onto what moves (prongs either side of a channel pulled together) fails ----
    if (spec.check?.frame !== false && !empty(parts.ground.shape)) {
      const G = parts.ground.shape, { lo, hi } = box(G), side = Math.max(0.25, Math.sqrt(((hi[0] - lo[0]) * (hi[1] - lo[1])) / FE_MOST));
      const nx = Math.ceil((hi[0] - lo[0]) / side) + 2, ny = Math.ceil((hi[1] - lo[1]) / side) + 2, x0 = lo[0] - side, y0 = lo[1] - side;
      const g = feaGrid({ nx, ny, h: side }), fill = coverage(G, g, x0, y0);
      // Bridges and floors are frame too, as thick as they are: a roof over a channel ties its two sides
      for (const br of bridges) { const c = coverage(br.shape, g, x0, y0); for (let e = 0; e < g.cells; e++) fill[e] = Math.min(1, fill[e] + c[e] * (1 - Math.min(1, fill[e])) * (br.depth / height)); }
      const grip = spec.grip ? all(spec.grip) : [[[lo[0] - 1, lo[1] - 1], [lo[0] + (hi[0] - lo[0]) / 4, lo[1] - 1], [lo[0] + (hi[0] - lo[0]) / 4, hi[1] + 1], [lo[0] - 1, hi[1] + 1]]];
      const held = coverage(grip, g, x0, y0), fixed = new Uint8Array(g.dofs);
      for (let e = 0; e < g.cells; e++) if (fill[e] >= 0.5 && held[e] > 0.5) { const i = e % nx, j = (e - i) / nx; for (const n of [g.node(i, j), g.node(i + 1, j), g.node(i + 1, j + 1), g.node(i, j + 1)]) fixed[2 * n] = fixed[2 * n + 1] = 1; }
      const cellAt = ([x, y]) => { const i = Math.max(0, Math.min(nx - 1, Math.floor((x - x0) / side))), j = Math.max(0, Math.min(ny - 1, Math.floor((y - y0) / side))); return { i, j, s: (x - x0) / side - i, t: (y - y0) / side - j }; };
      // A load where the flexure meets the frame's face lands in a cell that's mostly empty: put it on the nearest solid one
      const solidAt = (p) => { const c = cellAt(p); let best = null; for (let r = 0; r < 12 && !best; r++) for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) { const i = c.i + di, j = c.j + dj; if (i < 0 || j < 0 || i >= nx || j >= ny || fill[j * nx + i] < 0.5) continue; const d = Math.hypot(di, dj); if (!best || d < best.d) best = { d, p: [x0 + (i + 0.5) * side, y0 + (j + 0.5) * side] }; } return best ? best.p : p; };
      const cornersOf = ({ i, j, s, t }) => [[g.node(i, j), (1 - s) * (1 - t), [i, j]], [g.node(i + 1, j), s * (1 - t), [i + 1, j]], [g.node(i + 1, j + 1), s * t, [i + 1, j + 1]], [g.node(i, j + 1), (1 - s) * t, [i, j + 1]]];
      let worst = null, most = 0, shown = null; // shown: the frame where it bends most, its outline and how far each point moves
      for (const tr of sim.transitions) {
        const q = Float64Array.from(tr.end), f = new Float64Array(g.dofs);
        // Each load to the corners of its cell: the force shared as the point's place in the cell, the moment as a couple
        for (const L of fixedLoads(sim.sys, q)) {
          const P = solidAt(L.at), c = cellAt(P), cs = cornersOf(c), r = cs.map(([, , [i, j]]) => [x0 + i * side - P[0], y0 + j * side - P[1]]), rr = r.reduce((a, [rx, ry]) => a + rx * rx + ry * ry, 0) || 1;
          cs.forEach(([n, w], k) => { f[2 * n] += L.force[0] * w - (L.moment * r[k][1]) / rr; f[2 * n + 1] += L.force[1] * w + (L.moment * r[k][0]) / rr; });
        }
        if (!f.some((x) => Math.abs(x) > 1e-12)) continue;
        const { u: [u] } = feaAnalyse({ grid: g, density: Float64Array.from(fill, (x) => Math.min(1, x)), material: { E: material.E, nu: 0.38 }, thickness: height, fixed, loads: [f] });
        const at = (p) => { let dx = 0, dy = 0; for (const [n, w] of cornersOf(cellAt(p))) { dx += w * u[2 * n]; dy += w * u[2 * n + 1]; } return [dx, dy]; };
        // The frame's outline, finely, moved as it bends
        let here = 0;
        const fine = split(G, side), moves = fine.map((o) => o.map((p) => { const d = at(p); here = Math.max(here, Math.hypot(...d)); return d; }));
        const bent = union([fine.map((o, k) => o.map((p, i) => [p[0] + moves[k][i][0], p[1] + moves[k][i][1]]))]);
        if (here > most) { most = here; shown = { state: tr.to, outline: fine, moves }; }
        const fr = frames.filter((x) => x.from === tr.from && x.to === tr.to).sort((a, b) => b.t - a.t)[0];
        // What moves where it is then, and what's loose (a disc, waiting in its channel) where it was put
        const there = { ...Object.fromEntries(Object.entries(fr?.parts || {}).filter(([n]) => n !== 'ground' && !spec.free?.[n])), ...Object.fromEntries(Object.entries(spec.free || {}).map(([n, x]) => [n, all(x.shape)])) };
        for (const [n, shape] of Object.entries(there)) {
          const before = gapBetween(G, shape, gap * 2) ?? gap * 2, after = area(intersect(bent, shape)) > AREA ? 0 : (gapBetween(bent, shape, gap * 2) ?? gap * 2);
          const closed = before - after;
          if (closed > 0.01 && (!worst || after < worst.after)) worst = { part: n, state: tr.to, before, after, closed, at: box(intersect(grow(bent, gap), shape)) };
        }
      }
      if (most > 0) {
        const w = worst, where = w && !empty(w.at) && Number.isFinite(w.at.lo[0]) ? ` near (${((w.at.lo[0] + w.at.hi[0]) / 2).toFixed(1)}, ${((w.at.lo[1] + w.at.hi[1]) / 2).toFixed(1)})` : '';
        const level = !w ? 'pass' : w.after <= 0.02 ? 'fail' : w.after < gap / 2 ? 'warn' : 'pass';
        f(level, w
          ? `the frame bends up to ${most.toFixed(2)} mm under the flexures' pull; at ${w.state} it closes ${w.closed.toFixed(2)} mm towards ${what(w.part)}${where}, leaving ${w.after.toFixed(2)} mm${level === 'fail' ? ': it pinches it. Stiffen the frame there, or tie it across' : ''}`
          : `the frame bends up to ${most.toFixed(2)} mm under the flexures' pull, closing no gap to what moves`, 'lamina.frame', { most, ...(w || {}), shown });
      }
    }

    // ---- across the plane: each moving body pushed across the print at its farthest point from what holds it, by a
    // tenth of the hand's pull (a finger a little off the plane); a lamina's flexures are stiff bending across it but
    // soft twisting, so a body on long thin arms tips out of the plane. Bridges over it hold it from lifting, floors
    // under it from dropping ----
    if (spec.check?.across !== false) {
      const peak = Math.max(0, ...sim.transitions.flatMap((tr) => tr.curve.flatMap((c) => c.points.map(([, F]) => Math.abs(F)))));
      const push = spec.check?.side ?? Math.max(1, peak / 10);
      for (const b of new Set(Object.values(joints).map((j) => j.to))) {
        if (!sim.sys.body[b] || sim.sys.body[b].fixed) continue;
        const ends = sim.sys.elements.flatMap((e) => [e.a, e.b]).filter((x) => x.body?.name === b).map((x) => [x.body.at[0] + x.o[0], x.body.at[1] + x.o[1]]);
        const c = ends.length ? [ends.reduce((a, p) => a + p[0], 0) / ends.length, ends.reduce((a, p) => a + p[1], 0) / ends.length] : centroid(parts[b].shape);
        const pts = parts[b].shape.flat(), P = pts.reduce((a, p) => (Math.hypot(p[0] - c[0], p[1] - c[1]) > Math.hypot(a[0] - c[0], a[1] - c[1]) ? p : a), pts[0]);
        const holds = (top) => [...cuts.filter((x) => x.body === b && top).flatMap((x) => x.shape.flat()), ...arches.filter((x) => x.body === b && !top).flatMap((x) => x.shape.flat()), ...guidesHeld.filter((x) => x.body === b).flatMap((x) => x.shape.flat())].map((at) => ({ body: b, at, k: 1e3 }));
        let worst = { most: 0, dir: '' };
        for (const [dir, sign] of [['up', 1], ['down', -1]]) {
          const r = outOfPlane(sim.sys, { loads: [{ body: b, at: P, force: sign * push }], springs: holds(sign > 0) });
          const most = Math.max(...pts.map((p) => Math.abs(r.lift(b, p))));
          if (most > worst.most) worst = { most, dir };
        }
        const level = worst.most > 1 ? 'fail' : worst.most > gap ? 'warn' : 'pass';
        f(level, `${b}: pushed ${push.toFixed(1)} N across the plane at (${P.map((x) => x.toFixed(1)).join(', ')}) (a tenth of the hand's pull), it moves ${worst.most.toFixed(2)} mm out of the plane${level === 'pass' ? '' : `: it flexes out of the plane, ${level === 'fail' ? 'far' : 'more than the print gap'}. Trap it across the plane (a guide or a bridge), or stiffen what holds it`}`, 'lamina.across', { body: b, most: worst.most, push, at: P });
      }
    }
  }
  return {
    parts: { body: solid, ...(spec.loose || {}) },
    findings,
    energy,
    frames,
    planned: planned ?? frames,
    at: (s) => extrude(shapesAt(solve(state(s)).v)),
    outlines: (s) => outline(solve(state(s)).v),
    mechanism: { height, sequence: seq, states: Object.keys(states), limit: material.strainLimit, ...(sim ? { curves: sim.transitions.map((tr) => ({ from: tr.from, to: tr.to, curve: tr.curve, events: tr.events.map((e) => ({ body: e.body, t: e.t, jump: e.jump })), ...(tr.holding ? { holding: tr.holding } : {}) })), physical: true, friction: sim.friction, ...(sim.trip ? { trip: sim.trip } : {}), ...(sim.fire ? { shot: { from: spec.fire.from, disc: spec.fire.disc, exit: sim.fire.exit, stored: sim.fire.stored, speeds: sim.fire.speeds } } : {}) } : {}), joints: Object.fromEntries(Object.entries(joints).map(([n, j]) => [n, { from: j.from, to: j.to, kind: j.kind || 'own', ...(follows[n] ? { follows: follows[n].by } : {}) }])) },
  };
}

/**
 * A material for flexures from its rule set ({ modulus, strength }): the strain it may see is its strength over its
 * modulus, the strain where it starts to yield, over a safety factor. The ratio is the figure of merit for compliant
 * mechanisms (Howell): the higher it is, the further a flexure of a given size can bend. PLA's is about 1.5%,
 * PETG's 1.9%, nylon's higher still.
 * @param {{ modulus: number, strength: number, name?: string }} rules @param {{ safety?: number }} [o] (default 1.5)
 */
/**
 * A lamina whose frame is flooded: everything inside `flood.outline` is solid but the room the moving parts need (where
 * each body and flexure goes, through the whole sequence, grown by a clearance) and the spaces `flood.keep` holds open
 * (a disc's way out). A thin frame bends and spoils everything it holds; a flooded one is as stiff as the outline
 * allows, so the mechanism is all that moves. The moving parts are solved through the sequence first (with the ground
 * you draw: the blocks the flexures grow from), then the frame is what's left, slivers thinner than `least` and islands
 * that would print loose taken out, and your ground added back.
 * @param {object} spec a lamina spec, with flood: { outline?, keep?, clear?: number | Record<string, number>, least?, wall?,
 *   pad?, corner?, band?, holes? }: holes, [{ at, diameter, wall? }] through the frame for fasteners (pins holding plates
 *   either side), each in a solid boss `wall` thick (default half `wall`), checked to be all frame; band, solid only this far round the moving parts' room, the kept spaces and the outline's
 *   edge, the rest windows (a web: lighter, as stiff where it matters); outline, the frame's (default: everything the moving parts reach and `keep`, `wall` round it,
 *   corners rounded to `corner`); clear, the gap round the moving parts (the print gap; or by part, a sliding fit for
 *   what slides in a channel); pad, how far the solid round each flexure's root reaches (its roots are found: the part
 *   of it that never moves). spec.ground may then be left out
 */
async function flooded(spec) {
  const { keep = [], least = 2, wall = 4, pad = 3, corner = 6 } = spec.flood, gap = spec.gap, clearOf = (n) => (typeof spec.flood.clear === 'object' ? spec.flood.clear[n] ?? spec.flood.clear.default ?? gap : spec.flood.clear ?? gap);
  // The mechanism solved through its sequence, on the ground you drew (or none: a speck far off, for the solver)
  const mine = all(spec.ground || []), far = [[[-1e4, -1e4], [-1e4 + 1, -1e4], [-1e4 + 1, -1e4 + 1], [-1e4, -1e4 + 1]]];
  const probe = await lamina({ ...spec, ground: empty(mine) ? far : mine, flood: undefined, fire: undefined, bridges: undefined, check: { ...(spec.check || {}), fe: false, frame: false } });
  const free = new Set(Object.keys(spec.free || {})), by = {};
  // The room: everything where it's meant to go, the kinematic frames (solved without a frame, the physics lets a body
  // tip anywhere its play allows: room cut round that would let it)
  for (const fr of probe.planned) for (const [n, o] of Object.entries(fr.parts)) if (n !== 'ground' && !free.has(n)) (by[n] ??= []).push(o);
  // and each flexure as it really bends, wherever its bodies are where they're meant to be (within the gap and a bit)
  if (probe.planned !== probe.frames) for (const fr of probe.frames) if (fr.off != null && fr.off <= Math.max(gap * 3, 2)) for (const [n, o] of Object.entries(fr.parts)) if (n !== 'ground' && !free.has(n) && !spec.bodies?.[n]) (by[n] ??= []).push(o);
  const swept = union(Object.entries(by).map(([n, os]) => grow(union(os), clearOf(n) * 1.05 + 0.02))); // (a little over: a round offset's segments cut its corners)
  // The outline: yours, or everything the moving parts reach and the spaces kept, a wall round it, its corners rounded
  let outline = spec.flood.outline ? all(spec.flood.outline) : null;
  if (!outline) {
    const { lo, hi } = box(union([swept, all(keep)])), r = Math.min(corner, (hi[0] - lo[0]) / 2, (hi[1] - lo[1]) / 2);
    const square = [[[lo[0] - wall, lo[1] - wall], [hi[0] + wall, lo[1] - wall], [hi[0] + wall, hi[1] + wall], [lo[0] - wall, hi[1] + wall]]];
    outline = grow(shrink(square, r, 'Miter'), r);
  }
  // Each flexure's root: a block behind the face it grows from (its root port, facing back into the frame), `pad` deep
  // and as wide again either side, clear of every other moving part, so it grows from solid however the flood falls
  const kind = (j) => j.kind === 'curve' || OWN_ROUNDS.has(j.kind); // (these draw their own rounds)
  const roots = Object.entries(spec.joints || {}).filter(([, j]) => j.from === 'ground' && j.kind).map(([n, j]) => {
    const params = { ...j.params, width: j.params?.width ?? spec.height }, root = ports(j.kind, params).root, a = rad(j.angle || 0);
    const c = apply(mul(shift(j.at || [0, 0]), turn(a)), root.at), l = Math.hypot(root.dir[0], root.dir[1]) || 1;
    const u = [(Math.cos(a) * root.dir[0] - Math.sin(a) * root.dir[1]) / l, (Math.sin(a) * root.dir[0] + Math.cos(a) * root.dir[1]) / l], v = [-u[1], u[0]];
    const t = Math.max(...[params.thickness ?? params.neck ?? 1].flat()), w = pad + t + (params.fillet ?? 0) * 1.5;
    const block = [[[c[0] + v[0] * w, c[1] + v[1] * w], [c[0] + v[0] * w + u[0] * pad, c[1] + v[1] * w + u[1] * pad], [c[0] - v[0] * w + u[0] * pad, c[1] - v[1] * w + u[1] * pad], [c[0] - v[0] * w, c[1] - v[1] * w]]];
    const others = union(Object.entries(by).filter(([m]) => m !== n).map(([m, os]) => grow(union(os), clearOf(m) * 1.05 + 0.02)));
    const mirror = params.mirror != null ? [block[0].map(([x, y]) => [x, 2 * params.mirror - y]).reverse()] : []; // (a mirrored curve's other arm roots in its mirror image)
    // and its rounds: a quarter circle either side of it where it leaves the block's face, standing in its room
    const r = kind(j) ? 0 : params.fillet ?? 0, fillets = r > 0 ? [1, -1].map((sd) => {
      const at = (a, b) => [c[0] + v[0] * sd * a - u[0] * b, c[1] + v[1] * sd * a - u[1] * b], h = t / 2;
      const arc = Array.from({ length: 9 }, (_, i) => { const th = (Math.PI / 2) * (i / 8); return at(h + r - r * Math.cos(th), r - r * Math.sin(th)); }); // round from the leaf's side to the block's face
      const loop = [at(h, -pad / 4), at(h + r, -pad / 4), ...arc.slice().reverse()];
      const signed = loop.reduce((a, p, i) => { const q = loop[(i + 1) % loop.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0);
      return [signed < 0 ? loop.reverse() : loop]; // (anticlockwise)
    }) : [];
    return subtract(union([block, mirror, ...fillets]), others);
  });
  // Holes through the frame for fasteners (pins holding plates either side, should it ever need them): each in a solid
  // boss, a wall round it, that no window opens into
  const ring = ([x, y], r) => [Array.from({ length: 48 }, (_, i) => [x + r * Math.cos((2 * Math.PI * i) / 48), y + r * Math.sin((2 * Math.PI * i) / 48)])];
  const holes = (spec.flood.holes || []).map((h) => ({ ...h, hole: ring(h.at, h.diameter / 2), boss: ring(h.at, h.diameter / 2 + (h.wall ?? wall / 2)) }));
  const bosses = holes.length ? union(holes.map((h) => h.boss)) : [];
  let space = subtract(outline, union([swept, all(keep)]));
  // A web, not a slab: with `band`, solid only that far round the moving parts' room, the kept spaces and the
  // outline's edge; the rest opens up as windows, rounded (every rib a closed loop, so nothing hangs free)
  if (spec.flood.band > 0) {
    const band = spec.flood.band, rim = subtract(outline, shrink(outline, band, 'Round'));
    const web = intersect(space, union([grow(union([swept, all(keep)]), band), rim, bosses]));
    // (only windows worth having: one no wider than the band, a sliver between ribs, is left solid; the rest rounded)
    const windows = apart(subtract(space, web)).filter((w) => !empty(shrink(w, band / 2, 'Round'))).map((w) => grow(shrink(w, band / 2, 'Round'), band / 2));
    space = subtract(space, union(windows));
  }
  space = grow(shrink(space, least / 2, 'Round'), least / 2); // no sliver thinner than `least`
  // Only what's joined to the main frame, a root or your ground: an island (inside an arm's loop, a ring's hole) prints loose
  const anchors = union([mine, ...roots]), bits = apart(space), biggest = Math.max(0, ...bits.map(area));
  const kept = bits.filter((b) => area(b) >= biggest - 1e-9 || area(intersect(b, grow(anchors, TOUCH))) > AREA);
  let ground = union([anchors, ...kept]);
  // Each hole's boss must be all frame: inside the outline, clear of the moving parts' room and anything kept open
  const holed = holes.map((h, i) => {
    const out = !empty(subtract(h.boss, outline)), open = !empty(intersect(h.boss, union([swept, all(keep)])));
    return { level: out || open ? 'fail' : 'pass', text: `hole ${i + 1} (⌀${h.diameter} at ${h.at.map((c) => +c.toFixed(1)).join(', ')}) ${out ? 'sticks out of the outline' : open ? 'breaks into the room the moving parts sweep' : `is in solid frame, ${+(h.wall ?? wall / 2).toFixed(2)} mm of wall round it`}`, code: 'lamina.holes', hole: i };
  });
  if (holes.length) ground = subtract(ground, union(holes.map((h) => h.hole)));
  const out = await lamina({ ...spec, flood: undefined, ground, groundRounded: true });
  out.findings.unshift({ level: 'info', text: `the frame is flooded: ${area(ground).toFixed(0)} mm² solid, all but the room the moving parts sweep (${bits.length - kept.length} loose bits left out)`, code: 'lamina.flood' }, ...holed);
  return out;
}

export function flexureMaterial({ modulus, strength, name, density }, { safety = 1.5 } = {}) {
  if (!(modulus > 0) || !(strength > 0)) throw new Error('a flexure material needs its modulus and strength (MPa)');
  const yieldStrain = strength / modulus;
  return { E: modulus, strength, yieldStrain, strainLimit: yieldStrain / safety, safety, ...(name ? { name } : {}), ...(density ? { density } : {}) }; // density g/cm³, for firing
}
