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
import { ports, models } from './compose.mjs';

const AREA = 1e-4; // mm²: less than this of an overlap is a rounding error, not a touch
const TOUCH = 0.01; // mm: as near as a flexure's root is to its body, or a point to an edge
const STOP_STEPS = 40; // how finely a joint's travel is swept for its stop
const NONE = new Set();
const FINE = 0.005; // mm: a give this small is the solver's precision, not a push
const REFINE = 10; // a step that pushes a follower, looked at again in this many parts
const FRAMES = 12; // frames from one state to the next, for an animation
const GAMMA = 0.85; // the pseudo-rigid-body leaf's characteristic radius (Howell): its tip turns about 0.15 L from the root
const LEAFLIKE = new Set(['leaf', 'snapHook', 'contactLeaf']);
const ROUND = 16; // segments to a full circle where an outline is grown
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
const shrink = (a, d) => (empty(a) || !(d > 0) ? a : run((cs, keep) => loopsOf(keep(cs(a).offset(-d, 'Miter', 2, ROUND)))));
const area = (a) => (empty(a) ? 0 : run((cs) => cs(a).area()));
const pieces = (a) => (empty(a) ? 0 : run((cs, keep) => cs(a).decompose().map(keep).filter((p) => p.area() > AREA).length));
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
const all = (gs) => union([gs].flat(Infinity).filter(Boolean).map(flat));
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
  const { height, gap, material, printer } = spec, slack = spec.check?.slack ?? gap / 10, steps = spec.check?.steps ?? 8, stepMost = spec.check?.step ?? 0.25;
  // Friction, taken the cautious way for each question: what must move is checked sticky (a ramp must still push its
  // follower aside at `pass`), what must hold is checked slippery (a catch must still jam at `hold`). Give over push past
  // 1 / μ and a contact jams: the push is within the friction angle of the face's normal.
  const mu = { pass: 0.5, hold: 0.1, ...(typeof spec.check?.friction === 'number' ? { pass: spec.check.friction, hold: spec.check.friction } : spec.check?.friction) };
  const steepFor = (m) => 1 / m;
  const findings = [], f = (level, text, code, extra = {}) => findings.push({ level, text, code, ...extra });
  if (!(height > 0) || !(gap > 0) || !material?.E || !material?.strainLimit) throw new Error('a lamina needs height, gap and material ({ E, strainLimit })');

  // The parts: the ground, the bodies and the flexures, each a 2D shape at rest
  const parts = { ground: { kind: 'ground', shape: all(spec.ground) } };
  for (const [n, s] of Object.entries(spec.bodies || {})) { if (parts[n]) throw new Error(`"${n}" is used twice`); parts[n] = { kind: 'body', shape: all(s) }; }
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
      model = models[kind](params, material);
      const p = ports(kind, params);
      leafy = LEAFLIKE.has(kind);
      motion = leafy ? { pivot: apply(place, [(1 - GAMMA) * params.length, 0]), leaf: GAMMA * params.length }
        : p.moves === 'turn' ? { pivot: apply(place, p.pivot.at) }
          : { axis: dir(p.moves === 'x' ? [1, 0] : [0, 1]), ...(model.drop ? { drop: model.drop, along: dir([-1, 0]) } : {}) }; // a guide's shuttle drops towards its base
    } else {
      if (!j.shape || (!j.axis && !j.pivot)) throw new Error(`joint ${n}: give a flexure kind, or a shape and an axis or pivot`);
      shape = all(j.shape);
      const len = j.axis ? Math.hypot(...j.axis) : 1;
      motion = j.axis ? { axis: j.axis.map((c) => c / len) } : { pivot: j.pivot };
    }
    joints[n] = { ...j, kind, params, model, motion, leafy, turning: !leafy && !!motion.pivot, stiffness: j.stiffness ?? model?.stiffness };
    parts[n] = { kind: 'flexure', shape, joint: n };
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
  const thinnest = Math.min(gap * 4, ...Object.values(joints).map((j) => j.params?.thickness ?? j.params?.neck ?? gap * 4));
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
  const what = (n) => (parts[n].kind === 'flexure' ? `the ${n} flexure` : n === 'ground' ? 'the ground' : n);
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
      if (blocked({ ...v, [n]: g * reach }, n)) { v[n] = g * reach; pushed[n] = reach - from; over.push(n); continue; }
      let lo = from, hi = reach;
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
  const pointMove = (n, a, b, pt) => {
    if (n === 'ground') return 0;
    const body = parts[n].kind === 'flexure' ? joints[n].to : n, step = mul(places(b)[body], inverse(places(a)[body])), q = apply(step, pt);
    return Math.hypot(q[0] - pt[0], q[1] - pt[1]);
  };

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
        const give = pointMove(joints[fn].to, asSet, q.v, c.at), push = pointMove(c.by, p.v, q.v, c.at);
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

  // ---- free: at rest, the gap between everything that isn't joined; each flexure on its two bodies only ----
  let free = true;
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
    if (pieces(contact) > 1) { free = false; f('fail', `the ${fx} flexure touches ${what(body)} in more than one place: it's fused to it away from its root`, 'lamina.free', { parts: [fx, body], at: box(contact) }); continue; }
    const rest = subtract(F, grow(contact, gap * 2 + cell)); // the flexure away from where it grows out of the body
    if (area(rest) > AREA && within(rest, Bd, gap * 0.98)) { free = false; const g = gapBetween(rest, Bd, gap); f('fail', `the ${fx} flexure runs ${g ? `${g} mm` : 'touching'} from ${what(body)} away from its root: under the ${gap} mm gap, it fuses there`, 'lamina.free', { parts: [fx, body], gap: g, at: box(intersect(grow(rest, gap / 2), grow(Bd, gap / 2))) }); }
  }
  if (free) f('pass', `everything clears what it isn't joined to by ${gap} mm, and each flexure touches only its two bodies: it prints free`, 'lamina.free');

  // ---- the sequence, then each state as the sequence reaches it: nothing runs into anything, nothing jams ----
  const states = { rest: {}, ...(spec.states || {}) }, state = (s) => { const v = typeof s === 'string' ? states[s] : s; if (!v) throw new Error(`no state "${s}"`); return v; };
  const seq = spec.sequence || [], frames = [], reached = {};
  for (let i = 0; i + 1 < seq.length; i++) {
    // From where the last step settled; a joint both states set alike stays where it settled, so it isn't moved
    const a = reached[seq[i]] ?? state(seq[i]), said = state(seq[i]), b = { ...state(seq[i + 1]) };
    for (const k of Object.keys(b)) if (said[k] === b[k] && a[k] != null) b[k] = a[k];
    const r = walk(a, b), pct = r ? `${Math.round(r.t * 100)}% of the way` : '';
    // A step into a state that a catch holds may end on the catch: it settles there, short of the state's own travel
    const catches = (spec.holds?.[seq[i + 1]] || []).filter(([jn]) => Math.abs((a[jn] || 0) - (b[jn] || 0)) > 1e-9);
    const caught = r && catches.find(([jn, by]) => {
      const mine = (x) => carries[jn].has(x), theirs = (x) => x === by || Object.keys(follows).some((fn) => carries[fn].has(by) && carries[fn].has(x));
      return (r.kind === 'jam' && (mine(r.by) || r.by === joints[jn].to) && carries[r.joint].has(by)) || (r.kind === 'hit' && ((mine(r.a) && theirs(r.b)) || (mine(r.b) && theirs(r.a))));
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
  const solved = {};
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

  // ---- strain and stops: displacement-driven, each flexure's travel against its limit, and a hard stop before it ----
  for (const [n, j] of Object.entries(joints)) {
    const u = used[n], m = j.model;
    if (!m) { f('info', `${n}: your own flexure, with no model: its strain and stop aren't checked`, 'lamina.model', { joint: n }); continue; }
    const toModel = (q) => (j.turning ? rad(q) : q), unit = j.turning ? '°' : ' mm', limit = limitOf(n), most = Math.abs(u?.most || 0);
    if (printer) for (const x of gens.printable({ thickness: j.params.thickness ?? j.params.neck, width: j.params.width }, printer, material, m)) f(x.level, `${n}: ${x.text}`, x.code, { joint: n });
    const e = m.strain(toModel(most));
    f(e <= material.strainLimit ? 'pass' : 'fail', `${n}: ${u?.most ? `at its most (${+most.toFixed(2)}${unit}) it sees ${(e * 100).toFixed(2)}% strain, ${e <= material.strainLimit ? 'within' : 'over'} the limit of ${(material.strainLimit * 100).toFixed(2)}% (${+limit.toFixed(2)}${unit})` : 'nothing moves it'}`, 'lamina.strain', { joint: n, strain: e, limit });
    // A stop: swept from rest to the limit (less a margin), its body, or what it carries, runs into something
    const signs = follows[n] ? [follows[n].give ?? 1] : u?.signs.size ? [...u.signs] : [1, -1]; // a follower only ever gives one way
    for (const sgn of signs) {
      let hits = [], at = 0;
      for (let k = 1; k <= STOP_STEPS && !hits.length; k++) {
        at = (sgn * limit * 0.95 * k) / STOP_STEPS;
        const { v: sv, over } = solve({ [n]: at }, new Set([n])), sh = shapesAt(sv);
        hits = pairs.filter(([a, b]) => !joined(a, b) && !driven(a, b) && carries[n].has(a) !== carries[n].has(b) && collide(sh[a], sh[b], slack)).map(([a, b]) => ({ a, b }));
        if (!hits.length && over.length) hits = [{ a: joints[n].to, b: joints[over[0]].to }]; // what it drives has reached its own limit
      }
      const side = signs.length > 1 ? (sgn > 0 ? ' one way' : ' the other way') : '';
      if (hits.length) f('pass', `${n}: stopped by ${what(carries[n].has(hits[0].a) ? hits[0].b : hits[0].a)} at ${+Math.abs(at).toFixed(2)}${unit}${side}, before its limit of ${+limit.toFixed(2)}${unit}`, 'lamina.stop', { joint: n, at });
      else f('fail', `${n}: nothing stops it${side} before ${+limit.toFixed(2)}${unit}, where it breaks: add a hard stop (a post or a wall it meets)`, 'lamina.stop', { joint: n, limit });
    }
  }

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
  if (most && most[1] > 0) f('info', `the most stored is ${joules(most[1])}, in ${most[0]}; at their most: ${forces.join(', ')}`, 'lamina.energy', { energy });

  // ---- the print, everything at rest, and frames along the sequence for an animation ----
  const extrude = (shapes) => solidOf(union(Object.values(shapes)), height);
  let solid = extrude(Object.fromEntries(Object.entries(parts).map(([n, p]) => [n, p.shape])));
  if (spec.finish) solid = spec.finish(solid);
  const outline = (v) => Object.fromEntries(Object.entries(shapesAt(v)).map(([n, g]) => [n, g.map((o) => o.map(([x, y]) => [+x.toFixed(3), +y.toFixed(3)]))]));
  for (let i = 0; i + 1 < seq.length; i++) {
    const a = reached[seq[i]] ?? state(seq[i]), said = state(seq[i]), b = { ...state(seq[i + 1]) };
    for (const k of Object.keys(b)) if (said[k] === b[k] && a[k] != null) b[k] = a[k];
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])], active = new Set(keys.filter((x) => Math.abs((a[x] || 0) - (b[x] || 0)) > 1e-9)); // followers solved per frame
    for (let k = 0; k < FRAMES; k++) { const t = k / FRAMES; frames.push({ from: seq[i], to: seq[i + 1], t, parts: outline(solve(Object.fromEntries(keys.map((x) => [x, (a[x] || 0) + ((b[x] || 0) - (a[x] || 0)) * t])), active).v) }); }
  }
  if (seq.length) frames.push({ from: seq[seq.length - 1], to: seq[seq.length - 1], t: 0, parts: outline(solved[seq[seq.length - 1]]) });
  return {
    parts: { body: solid, ...(spec.loose || {}) },
    findings,
    energy,
    frames,
    at: (s) => extrude(shapesAt(solve(state(s)).v)),
    outlines: (s) => outline(solve(state(s)).v),
    mechanism: { height, sequence: seq, states: Object.keys(states), joints: Object.fromEntries(Object.entries(joints).map(([n, j]) => [n, { from: j.from, to: j.to, kind: j.kind || 'own', ...(follows[n] ? { follows: follows[n].by } : {}) }])) },
  };
}

/**
 * A material for flexures from its rule set ({ modulus, strength }): the strain it may see is its strength over its
 * modulus, the strain where it starts to yield, over a safety factor. The ratio is the figure of merit for compliant
 * mechanisms (Howell): the higher it is, the further a flexure of a given size can bend. PLA's is about 1.5%,
 * PETG's 1.9%, nylon's higher still.
 * @param {{ modulus: number, strength: number, name?: string }} rules @param {{ safety?: number }} [o] (default 1.5)
 */
export function flexureMaterial({ modulus, strength, name }, { safety = 1.5 } = {}) {
  if (!(modulus > 0) || !(strength > 0)) throw new Error('a flexure material needs its modulus and strength (MPa)');
  const yieldStrain = strength / modulus;
  return { E: modulus, strength, yieldStrain, strainLimit: yieldStrain / safety, safety, ...(name ? { name } : {}) };
}
