// Fits: the closest gap between two sets of faces, as plain numbers. No files, no dependencies but @rulecad/printcheck's
// bounds: it runs in browsers and Node alike. Faces are [[x, y, z], …] polygons, triangulated here.
import { bounds } from '@rulecad/printcheck';

/** @typedef {[number, number, number]} Point a corner in mm, Z up */
/** @typedef {Point[]} Face a polygon: three or more corners, counter-clockwise seen from outside */

// Distance from point (px, py, pz) to triangle t = [a, b, c] (Ericson, Real-Time Collision Detection 5.1.5), in plain
// numbers: this runs millions of times in a big assembly's checks, so it makes no arrays.
function toTriangle(px, py, pz, t) {
  const [a, b, c] = t;
  const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2], acx = c[0] - a[0], acy = c[1] - a[1], acz = c[2] - a[2];
  const apx = px - a[0], apy = py - a[1], apz = pz - a[2];
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  const to = (x, y, z) => Math.sqrt((px - x) ** 2 + (py - y) ** 2 + (pz - z) ** 2);
  if (d1 <= 0 && d2 <= 0) return to(a[0], a[1], a[2]);
  const bpx = px - b[0], bpy = py - b[1], bpz = pz - b[2], d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return to(b[0], b[1], b[2]);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return to(a[0] + abx * v, a[1] + aby * v, a[2] + abz * v); }
  const cpx = px - c[0], cpy = py - c[1], cpz = pz - c[2], d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return to(c[0], c[1], c[2]);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return to(a[0] + acx * w, a[1] + acy * w, a[2] + acz * w); }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / (d4 - d3 + (d5 - d6)); return to(b[0] + (c[0] - b[0]) * w, b[1] + (c[1] - b[1]) * w, b[2] + (c[2] - b[2]) * w); }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
  return to(a[0] + abx * v + acx * w, a[1] + aby * v + acy * w, a[2] + abz * v + acz * w);
}

// Faces given are faces: a list of polygons of three or more [x, y, z] corners, all numbers. Said by name, not left
// to fail inside as a TypeError
function faces(what, polys, which) {
  if (!Array.isArray(polys)) throw new Error(`${what}: ${which} is a list of faces (polygons of [x, y, z] corners), not ${polys === null ? 'null' : typeof polys}`);
  for (const p of polys) if (!Array.isArray(p) || p.length < 3 || !p.every((v) => Array.isArray(v) && v.length === 3 && v.every((c) => typeof c === 'number' && Number.isFinite(c)))) throw new Error(`${what}: ${which} has a face that isn't three or more [x, y, z] corners of numbers`);
}
const tris = (polys) => polys.flatMap((t) => t.slice(1, -1).map((_, i) => [t[0], t[i + 1], t[i + 2]]));
/**
 * How far a point is from a face (a polygon), in mm: to its nearest point, inside it or on its edge.
 * @param {Point} p @param {Face} face
 * @returns {number}
 */
export const distanceToFace = (p, face) => Math.min(...tris([face]).map((t) => toTriangle(p[0], p[1], p[2], t)));

// Triangles in a grid of cubes (cell mm), each in every cube its bounding box touches; nearest(x, y, z, best) searches
// ring by ring outward from the point's cube and stops once no unsearched cube can hold anything nearer than best.
function grid(T, cell) {
  const key = (i, j, k) => `${i},${j},${k}`, cells = new Map(), f = (v) => Math.floor(v / cell);
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  T.forEach((t, n) => {
    const a = [0, 1, 2].map((k) => f(Math.min(t[0][k], t[1][k], t[2][k]))), b = [0, 1, 2].map((k) => f(Math.max(t[0][k], t[1][k], t[2][k])));
    for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], a[k]); hi[k] = Math.max(hi[k], b[k]); }
    for (let i = a[0]; i <= b[0]; i++) for (let j = a[1]; j <= b[1]; j++) for (let k = a[2]; k <= b[2]; k++) {
      const c = key(i, j, k); if (!cells.has(c)) cells.set(c, []); cells.get(c).push(n);
    }
  });
  const seen = new Uint32Array(T.length);
  let stamp = 0;
  // The triangles in every cube a box touches (each once)
  const within = (blo, bhi) => {
    stamp++;
    const out = [], a = [0, 1, 2].map((k) => f(blo[k])), b = [0, 1, 2].map((k) => f(bhi[k]));
    for (let i = a[0]; i <= b[0]; i++) for (let j = a[1]; j <= b[1]; j++) for (let k = a[2]; k <= b[2]; k++) for (const n of cells.get(key(i, j, k)) || []) { if (seen[n] !== stamp) { seen[n] = stamp; out.push(n); } }
    return out;
  };
  const nearest = (x, y, z, best) => {
    stamp++;
    const ci = f(x), cj = f(y), ck = f(z);
    const most = Math.max(...[0, 1, 2].map((k) => Math.max(Math.abs([ci, cj, ck][k] - lo[k]), Math.abs(hi[k] - [ci, cj, ck][k]))));
    for (let r = 0; r <= most; r++) {
      if (best <= (r - 1) * cell) break; // every cube in this ring is at least (r - 1) cells away
      for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) for (let k = ck - r; k <= ck + r; k++) {
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj), Math.abs(k - ck)) !== r) continue; // the ring's shell only
        const list = cells.get(key(i, j, k));
        if (list) for (const n of list) { if (seen[n] === stamp) continue; seen[n] = stamp; const d = toTriangle(x, y, z, T[n]); if (d < best) best = d; }
      }
    }
    return best;
  };
  return Object.assign(nearest, { within });
}

// The closest gap between two sets of faces (mm): each one's corners to the other's faces, and their edges to each
// other's edges, which together find the nearest two triangles can be. Infinity if they're farther apart than reach.
/**
 * The smallest gap between two meshes, in mm: 0 if they touch, Infinity if farther apart than reach.
 * @param {Face[]} polysA @param {Face[]} polysB
 * @param {number} [reach] how far to look, in mm (2)
 * @returns {number}
 */
export function closest(polysA, polysB, reach = 2) {
  return closestAt(polysA, polysB, reach).gap;
}
/**
 * The smallest gap between two meshes and where it is: the point (on one of them) nearest the other.
 * @param {Face[]} polysA @param {Face[]} polysB
 * @param {number} [reach] how far to look, in mm (2)
 * @returns {{ gap: number, at: Point | null }} gap Infinity and at null if farther apart than reach
 */
export function closestAt(polysA, polysB, reach = 2) {
  faces('closestAt', polysA, 'a'); faces('closestAt', polysB, 'b');
  if (!(typeof reach === 'number' && reach > 0)) throw new Error(`closestAt: reach is a distance above 0 mm (got ${reach})`);
  const A = tris(polysA), B = tris(polysB);
  const near = (p, bx) => p.every((c, k) => c >= bx.lo[k] - reach && c <= bx.hi[k] + reach);
  let best = Infinity, at = null;
  // The nearest two triangles can be is from a corner of one to a face of the other, or from an edge of one to an edge
  // of the other (two edges passing mid-span): both are measured. The grid's cubes are sized to the triangles, not to
  // `reach`, and a search stops at `reach`, so a long reach costs only where there is something to find
  const probe = (P, T, edges) => {
    if (!T.length) return;
    const bx = bounds(T), pts = new Map(), g = grid(T, cellFor(T));
    for (const t of P) for (const v of t) if (near(v, bx)) pts.set(v.join(), v);
    // (nearest the other's box first, so the best is found early, and a point further from the box than it is skipped)
    const toBox = (q) => Math.hypot(...[0, 1, 2].map((c) => Math.max(0, bx.lo[c] - q[c], q[c] - bx.hi[c])));
    for (const [q, out] of [...pts.values()].map((q) => [q, toBox(q)]).sort((x, y) => x[1] - y[1])) {
      const lim = Math.min(best, reach + 1e-9);
      if (out >= lim) break;
      const d = g(q[0], q[1], q[2], lim); if (d < lim) { best = d; at = q; }
    }
    if (!edges) return;
    const seenEdge = new Set();
    for (const t of P) for (let i = 0; i < 3; i++) {
      const a = t[i], b = t[(i + 1) % 3], k = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (seenEdge.has(k)) continue; seenEdge.add(k);
      const lim = Math.min(best, reach + 1e-9), lo = [0, 1, 2].map((c) => Math.min(a[c], b[c]) - lim), hi = [0, 1, 2].map((c) => Math.max(a[c], b[c]) + lim);
      if (!lo.every((x, c) => x <= bx.hi[c]) || !hi.every((x, c) => x >= bx.lo[c])) continue;
      for (const n of g.within(lo, hi)) for (let j = 0; j < 3; j++) {
        const { d, p } = segments(a, b, T[n][j], T[n][(j + 1) % 3]);
        if (d < Math.min(best, reach + 1e-9)) { best = d; at = p; }
      }
    }
  };
  probe(A, B, true); probe(B, A, false); // (edges both ways are the same pairs)
  // Two solids that run into each other have no gap, however far their corners are from each other's faces (a peg
  // through a plate, a cube wholly inside another, two boxes half into each other on one plane): their surfaces cross,
  // one is inside the other, or they share volume next to a face plane they share
  const o = A.length && B.length && boxesMeet(bounds(A), bounds(B)) ? overlap(A, B) : null;
  if (o) return { gap: 0, at: o, overlap: true };
  return { gap: best, at };
}

// A grid cube about the size of the triangles (their median longest side), so a cube holds a few of them whatever
// the reach; never so small the grid has more than a few million cubes
function cellFor(T) {
  const sides = T.map((t) => Math.max(...[0, 1, 2].map((i) => Math.hypot(...[0, 1, 2].map((c) => t[i][c] - t[(i + 1) % 3][c]))))).sort((x, y) => x - y);
  const { lo, hi } = bounds(T), volume = Math.max(1e-9, (hi[0] - lo[0]) * (hi[1] - lo[1]) * (hi[2] - lo[2]));
  return Math.max(sides[Math.floor(sides.length / 2)] || 1, Math.cbrt(volume / 4e6), 1e-3);
}

// The nearest points of segments a–b and c–d (Ericson, Real-Time Collision Detection 5.1.9): { d, p } with p on a–b
function segments(a, b, c, d) {
  const d1 = sub(b, a), d2 = sub(d, c), r = sub(a, c), A = dot(d1, d1), E = dot(d2, d2), F = dot(d2, r);
  let s, t;
  if (A < 1e-18 && E < 1e-18) { s = 0; t = 0; } else if (A < 1e-18) { s = 0; t = Math.min(1, Math.max(0, F / E)); } else {
    const C = dot(d1, r);
    if (E < 1e-18) { t = 0; s = Math.min(1, Math.max(0, -C / A)); } else {
      const B = dot(d1, d2), den = A * E - B * B;
      s = den > 1e-18 ? Math.min(1, Math.max(0, (B * F - C * E) / den)) : 0;
      t = (B * s + F) / E;
      if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -C / A)); } else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (B - C) / A)); }
    }
  }
  const p = [0, 1, 2].map((k) => a[k] + d1[k] * s), q = [0, 1, 2].map((k) => c[k] + d2[k] * t);
  return { d: Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]), p };
}

/**
 * Do two closed solids run into each other? Their surfaces cross (an edge of one passes through a face of the
 * other), a corner of one lies inside the other, or a point just inside a face of one lies inside the other (solids
 * that share face planes: side by side on one plane, or one placed twice). Faces that only touch are not an overlap.
 * Where, or null.
 * @param {Face[]} polysA @param {Face[]} polysB
 * @returns {Point | null}
 */
export function overlapAt(polysA, polysB) { return overlap(tris(polysA), tris(polysB)); }
const boxesMeet = (p, q) => [0, 1, 2].every((k) => p.lo[k] <= q.hi[k] && q.lo[k] <= p.hi[k]);
function overlap(A, B) {
  if (!A.length || !B.length) return null;
  const crossing = (P, T) => { // an edge of P through a face of T
    const g = grid(T, 2);
    for (const t of P) {
      const lo = [0, 1, 2].map((k) => Math.min(t[0][k], t[1][k], t[2][k])), hi = [0, 1, 2].map((k) => Math.max(t[0][k], t[1][k], t[2][k]));
      const near = g.within(lo, hi);
      if (!near.length) continue;
      for (let i = 0; i < 3; i++) {
        const a = t[i], b = t[(i + 1) % 3], d = sub(b, a);
        for (const n of near) { const u = through(a, d, T[n][0], T[n][1], T[n][2]); if (u != null) return [a[0] + d[0] * u, a[1] + d[1] * u, a[2] + d[2] * u]; }
      }
    }
    return null;
  };
  const within = (P, T) => { // a corner of P inside T (one is enough: every corner, for a solid wholly inside)
    const bx = bounds(T);
    for (const t of P) for (const v of t) if (v.every((c, k) => c > bx.lo[k] && c < bx.hi[k]) && inside(v, T)) return v;
    return null;
  };
  return crossing(A, B) || crossing(B, A) || within(A, B) || within(B, A) || flush(A, B) || flush(B, A);
}
// Solids that share face planes can overlap with neither test firing: two cubes side by side on one plane, half into
// each other, or a part placed twice. Their edges lie in each other's faces (not through them) and their corners on
// each other's surface (not inside). So a point just inside each face of P, its middle moved a hair against the face's
// outward normal, is tested against T: inside T means the two share volume there. The hair is a tenth of the face's
// inner radius, at most 0.001 mm and at least 0.000001 mm, so it stays inside P even where P is thin, and an overlap
// thinner than it (rounding in a mesh) is still a touch. Faces that only meet have their points outside the other.
function flush(P, T) {
  // Which way is out: the corners say counter-clockwise from outside, but a mesh turned inside out is read as it is
  // (its signed volume says which way it winds); an open surface, which has no inside, is left to the other tests
  let vol = 0;
  for (const [a, b, c] of P) vol += dot(a, cross(b, c));
  if (!(Math.abs(vol) > 1e-12)) return null;
  const out = Math.sign(vol), bx = bounds(T);
  let ray = null; // (made when first needed: most faces of two touching parts are nowhere near the other)
  for (const [a, b, c] of P) {
    const n = cross(sub(b, a), sub(c, a)), twice = Math.hypot(n[0], n[1], n[2]); // twice the face's area
    if (!(twice > 1e-12)) continue;
    const rim = Math.hypot(...sub(b, a)) + Math.hypot(...sub(c, b)) + Math.hypot(...sub(a, c));
    const hair = Math.min(1e-3, Math.max(1e-6, 0.1 * twice / rim)) * out / twice; // (twice / rim is the inner radius)
    const p = [0, 1, 2].map((k) => (a[k] + b[k] + c[k]) / 3 - n[k] * hair);
    if (p.every((x, k) => x > bx.lo[k] && x < bx.hi[k]) && (ray ||= rays(T))(p)) return p;
  }
  return null;
}
// inside(), for many points against one solid: the same ray from each point, through only the solid's faces that lie
// across its path. The faces are sorted into a grid seen along the ray, so each point tests a few of them, not all
const RAY = [1, 0.000317, 0.000137]; // an odd direction, so the ray misses the edges and corners of square shapes
function rays(T) {
  const len = Math.hypot(...RAY), d = RAY.map((x) => x / len), u0 = cross(d, [0, 0, 1]), ul = Math.hypot(...u0), u = u0.map((x) => x / ul), v = cross(d, u);
  const flat = (p) => [dot(p, u), dot(p, v)];
  const e = 1e-9; // (a little wider than each face, so a ray along a face's edge still meets it, as in inside())
  const spans = T.map((t) => { const q = t.map(flat); return [Math.min(q[0][0], q[1][0], q[2][0]) - e, Math.max(q[0][0], q[1][0], q[2][0]) + e, Math.min(q[0][1], q[1][1], q[2][1]) - e, Math.max(q[0][1], q[1][1], q[2][1]) + e]; });
  const sides = spans.map((s) => Math.max(s[1] - s[0], s[3] - s[2])).sort((x, y) => x - y), cell = Math.max(sides[Math.floor(sides.length / 2)] || 1, 1e-3);
  const cells = new Map(), f = (x) => Math.floor(x / cell);
  spans.forEach((s, n) => {
    const i1 = f(s[1]), j1 = f(s[3]);
    if ((i1 - f(s[0]) + 1) * (j1 - f(s[2]) + 1) > 64) { (cells.get('wide') || cells.set('wide', []).get('wide')).push(n); return; } // (a big face, a plate's beside a keycap's small ones: tested every time, not filed in thousands of cells)
    for (let i = f(s[0]); i <= i1; i++) for (let j = f(s[2]); j <= j1; j++) { const k = `${i},${j}`; (cells.get(k) || cells.set(k, []).get(k)).push(n); }
  });
  return (p) => {
    const [pu, pv] = flat(p);
    let n = 0;
    for (const list of [cells.get(`${f(pu)},${f(pv)}`), cells.get('wide')]) if (list) for (const i of list) { const s = spans[i]; if (pu >= s[0] && pu <= s[1] && pv >= s[2] && pv <= s[3] && crosses(p, RAY, T[i][0], T[i][1], T[i][2])) n++; }
    return n % 2 === 1;
  };
}

/**
 * Is a point inside a closed solid? A ray from the point is followed through the solid's faces: an odd number of
 * crossings means inside. Used to follow a screw's path: clear where it should be a hole, solid where it should grip.
 * @param {Point} p @param {Face[]} faces a closed solid
 * @returns {boolean}
 */
export function inside(p, faces) {
  if (!Array.isArray(p) || p.length !== 3 || !p.every(Number.isFinite)) throw new Error(`inside: the point is [x, y, z] in numbers (got ${JSON.stringify(p)})`);
  let n = 0;
  for (const [a, b, c] of tris(faces)) if (crosses(p, RAY, a, b, c)) n++;
  return n % 2 === 1;
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
// Where the segment o + u·d (0 < u < 1) passes through the inside of triangle a b c: u, or null. Clear of the
// segment's ends and the triangle's edges, so faces that merely meet (touching solids, a shared edge) don't count
function through(o, d, a, b, c) {
  const e1 = sub(b, a), e2 = sub(c, a), h = cross(d, e2), det = dot(e1, h);
  if (Math.abs(det) < 1e-12) return null;
  const s = sub(o, a), u = dot(s, h) / det;
  if (u < 1e-6 || u > 1 - 1e-6) return null;
  const q = cross(s, e1), v = dot(d, q) / det;
  if (v < 1e-6 || u + v > 1 - 1e-6) return null;
  const t = dot(e2, q) / det;
  return t > 1e-6 && t < 1 - 1e-6 ? t : null;
}
// Does the ray o + t·d (t > 0) pass through triangle a b c? (Möller and Trumbore's test)
function crosses(o, d, a, b, c) {
  const e1 = sub(b, a), e2 = sub(c, a), h = cross(d, e2), det = dot(e1, h);
  if (Math.abs(det) < 1e-12) return false; // the ray runs along the triangle's plane
  const s = sub(o, a), u = dot(s, h) / det;
  if (u < 0 || u > 1) return false;
  const q = cross(s, e1), v = dot(d, q) / det;
  if (v < 0 || u + v > 1) return false;
  return dot(e2, q) / det > 1e-9;
}
