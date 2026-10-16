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

const tris = (polys) => polys.flatMap((t) => t.slice(1, -1).map((_, i) => [t[0], t[i + 1], t[i + 2]]));

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
  return (x, y, z, best) => {
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
}

// The closest gap between two sets of faces (mm), from each one's corners and edge midpoints to the other's faces.
// Only points near the other's bounding box are measured. Infinity if they're far apart (more than reach mm).
/**
 * The smallest gap between two meshes, in mm: 0 if they touch, Infinity if farther apart than reach.
 * @param {Face[]} polysA @param {Face[]} polysB
 * @param {number} [reach] how far to look, in mm (2)
 * @returns {number}
 */
export function closest(polysA, polysB, reach = 2) {
  const A = tris(polysA), B = tris(polysB);
  const near = (p, bx) => p.every((c, k) => c >= bx.lo[k] - reach && c <= bx.hi[k] + reach);
  let best = Infinity;
  const probe = (P, T) => {
    if (!T.length) return;
    const bx = bounds(T), pts = new Map();
    for (const t of P) t.forEach((v, i) => { const w = t[(i + 1) % 3]; for (const q of [v, [0, 1, 2].map((k) => (v[k] + w[k]) / 2)]) if (near(q, bx)) pts.set(q.join(), q); });
    if (!pts.size) return;
    const nearest = grid(T, Math.max(reach, 1));
    for (const q of pts.values()) best = nearest(q[0], q[1], q[2], best);
  };
  probe(A, B); probe(B, A);
  return best;
}

/**
 * Is a point inside a closed solid? A ray from the point is followed through the solid's faces: an odd number of
 * crossings means inside. Used to follow a screw's path: clear where it should be a hole, solid where it should grip.
 * @param {Point} p @param {Face[]} faces a closed solid
 * @returns {boolean}
 */
export function inside(p, faces) {
  const d = [1, 0.000317, 0.000137]; // an odd direction, so the ray misses the edges and corners of square shapes
  let n = 0;
  for (const [a, b, c] of tris(faces)) if (crosses(p, d, a, b, c)) n++;
  return n % 2 === 1;
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
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
