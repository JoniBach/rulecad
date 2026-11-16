// What a section is worth as a beam, from its outline alone: area, centroid and second moments by the polygon
// formulas, and the torsion constant by solving Prandtl's stress function over a raster of the section. Loops are
// closed outlines as [x, y] points in mm: the outside counter-clockwise, each hole clockwise (signedArea says which).

/** Twice-signed area's half: positive for a counter-clockwise loop. @param {number[][]} loop @returns {number} */
export function signedArea(loop) {
  let a = 0;
  for (let i = 0, n = loop.length; i < n; i++) { const [x0, y0] = loop[i], [x1, y1] = loop[(i + 1) % n]; a += x0 * y1 - x1 * y0; }
  return a / 2;
}

/**
 * Area, centroid and second moments of area of a section, by the polygon (Green's theorem) formulas, summed over its
 * loops so that a clockwise hole takes away. The second moments are about axes through the centroid, parallel to x and y.
 * @param {number[][][]} loops
 * @returns {{ area: number, centroid: [number, number], inertiaX: number, inertiaY: number, inertiaXY: number }} mm², mm, mm⁴
 */
export function polygonSection(loops) {
  let a = 0, sx = 0, sy = 0, ixx = 0, iyy = 0, ixy = 0;
  for (const loop of loops) for (let i = 0, n = loop.length; i < n; i++) {
    const [x0, y0] = loop[i], [x1, y1] = loop[(i + 1) % n], c = x0 * y1 - x1 * y0;
    a += c; sx += (x0 + x1) * c; sy += (y0 + y1) * c;
    ixx += (y0 * y0 + y0 * y1 + y1 * y1) * c; iyy += (x0 * x0 + x0 * x1 + x1 * x1) * c;
    ixy += (x0 * y1 + 2 * x0 * y0 + 2 * x1 * y1 + x1 * y0) * c;
  }
  const area = a / 2;
  if (!(area > 0)) throw new Error(`polygonSection: the loops enclose no area (${area}): the outside runs counter-clockwise and holes clockwise`);
  const cx = sx / (6 * area), cy = sy / (6 * area);
  return { area, centroid: [cx, cy], inertiaX: ixx / 12 - area * cy * cy, inertiaY: iyy / 12 - area * cx * cx, inertiaXY: ixy / 24 - area * cx * cy };
}

// The cells of a raster whose centres lie inside a loop, row by row (even-odd along each row)
function fill(loop, x0, y0, h, nx, ny, mark) {
  for (let j = 0; j < ny; j++) {
    const y = y0 + (j + 0.5) * h, xs = [];
    for (let i = 0, n = loop.length; i < n; i++) {
      const [ax, ay] = loop[i], [bx, by] = loop[(i + 1) % n];
      if ((ay <= y && by > y) || (by <= y && ay > y)) xs.push(ax + ((y - ay) * (bx - ax)) / (by - ay));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.ceil((xs[k] - x0) / h - 0.5)), to = Math.min(nx - 1, Math.floor((xs[k + 1] - x0) / h - 0.5));
      for (let i = from; i <= to; i++) mark(j * nx + i);
    }
  }
}

/**
 * The torsion constant of a section (St Venant's J, written It on a maker's sheet): torque = G J × twist per length.
 * Prandtl's stress function φ is solved on a raster of square cells: ∇²φ = −2 in the material, φ = 0 on the outside,
 * and φ one unknown constant over each hole, fixed by the hole's own balance (the flow of φ into a hole is twice its
 * area). Then J = 2 ∫φ dA over material and holes. That is why a closed tube is stiff and a slotted one is not: an
 * open slot is outside (φ = 0 along it), a closed hole carries φ across itself.
 * @param {number[][][]} loops the outside counter-clockwise, holes clockwise
 * @param {{ cells?: number, tolerance?: number }} [o] cells: about how many raster cells cover the section's bounding
 *   box (40 000: a 20 mm section in 0.1 mm cells); tolerance: where the solver stops, as a share of the load
 * @returns {{ torsion: number, cell: number, cells: number, iterations: number }} mm⁴, the cell's side in mm
 */
export function torsionConstant(loops, o = {}) {
  const { cells = 40000, tolerance = 1e-7 } = o;
  if (!(Number.isFinite(cells) && cells >= 100)) throw new Error(`torsionConstant: cells is a number of at least 100 (got ${JSON.stringify(cells)})`);
  let xa = Infinity, xb = -Infinity, ya = Infinity, yb = -Infinity;
  for (const loop of loops) for (const [x, y] of loop) { xa = Math.min(xa, x); xb = Math.max(xb, x); ya = Math.min(ya, y); yb = Math.max(yb, y); }
  if (!(xb > xa && yb > ya)) throw new Error('torsionConstant: the loops have no extent');
  const h = Math.sqrt(((xb - xa) * (yb - ya)) / cells), nx = Math.ceil((xb - xa) / h), ny = Math.ceil((yb - ya) / h);
  const x0 = (xa + xb) / 2 - (nx * h) / 2, y0 = (ya + yb) / 2 - (ny * h) / 2;
  // what each cell is: 0 outside, 1 material, -(k + 1) hole k. Outer loops first, then holes, then islands inside holes
  const what = new Int32Array(nx * ny), order = loops.map((loop, k) => ({ loop, k, a: signedArea(loop) })).sort((p, q) => Math.abs(q.a) - Math.abs(p.a));
  let holes = 0;
  for (const { loop, a } of order) { const tag = a > 0 ? 1 : -(++holes); fill(loop, x0, y0, h, nx, ny, (c) => { what[c] = tag; }); }
  // one unknown per material cell, one per hole
  const dof = new Int32Array(nx * ny).fill(-1); let n = 0;
  for (let c = 0; c < what.length; c++) if (what[c] === 1) dof[c] = n++;
  const material = n, holeCells = new Float64Array(holes);
  for (let c = 0; c < what.length; c++) if (what[c] < 0) { dof[c] = material + (-what[c] - 1); holeCells[-what[c] - 1] += 1; }
  n = material + holes;
  if (!material) throw new Error('torsionConstant: no raster cell lies in the section: use more cells');
  // The five-point Laplacian with the wall half a cell from a cell's centre (so a wall weighs 2). Each link is listed once
  const la = [], lb = [], lw = [], diag = new Float64Array(n), b = new Float64Array(n);
  const link = (i, j, w) => { la.push(i); lb.push(j); lw.push(w); diag[i] += w; if (j >= 0) diag[j] += w; };
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const c = j * nx + i, t = what[c];
    if (t !== 1) continue;
    b[dof[c]] = 2 * h * h;
    for (const [di, dj] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const ii = i + di, jj = j + dj, inside = ii >= 0 && ii < nx && jj >= 0 && jj < ny, tn = inside ? what[jj * nx + ii] : 0;
      if (tn === 1) { if (di + dj > 0) link(dof[c], dof[jj * nx + ii], 1); } // (material to material: once, from the lower cell)
      else if (tn === 0) link(dof[c], -1, 2);
      else link(dof[c], dof[jj * nx + ii], 2);
    }
  }
  for (let k = 0; k < holes; k++) { b[material + k] = 2 * h * h * holeCells[k]; if (!diag[material + k]) { diag[material + k] = 1; b[material + k] = 0; } } // (a hole no material touches carries nothing)
  const A = Int32Array.from(la), B = Int32Array.from(lb), Wt = Float64Array.from(lw), links = A.length;
  const apply = (x, y) => { y.fill(0); for (let e = 0; e < links; e++) { const i = A[e], j = B[e], w = Wt[e]; if (j < 0) y[i] += w * x[i]; else { const d = w * (x[i] - x[j]); y[i] += d; y[j] -= d; } } };
  // conjugate gradients, each unknown scaled by its own diagonal
  const x = new Float64Array(n), r = Float64Array.from(b), z = new Float64Array(n), p = new Float64Array(n), q = new Float64Array(n);
  let rz = 0, bb = 0;
  for (let i = 0; i < n; i++) { z[i] = r[i] / diag[i]; p[i] = z[i]; rz += r[i] * z[i]; bb += b[i] * b[i]; }
  let it = 0;
  for (const most = 20 * Math.max(nx, ny) + 200; it < most; it++) {
    apply(p, q);
    let pq = 0; for (let i = 0; i < n; i++) pq += p[i] * q[i];
    const alpha = rz / pq; let rr = 0;
    for (let i = 0; i < n; i++) { x[i] += alpha * p[i]; r[i] -= alpha * q[i]; rr += r[i] * r[i]; }
    if (rr <= tolerance * tolerance * bb) { it++; break; }
    let next = 0; for (let i = 0; i < n; i++) { z[i] = r[i] / diag[i]; next += r[i] * z[i]; }
    const beta = next / rz; rz = next;
    for (let i = 0; i < n; i++) p[i] = z[i] + beta * p[i];
  }
  let sum = 0;
  for (let i = 0; i < material; i++) sum += x[i];
  for (let k = 0; k < holes; k++) sum += x[material + k] * holeCells[k];
  return { torsion: 2 * sum * h * h, cell: h, cells: nx * ny, iterations: it };
}

// ---------- outlines against each other: what a check of a section asks ----------
const cross = (ax, ay, bx, by) => ax * by - ay * bx;
/** Whether a point is inside a loop (even-odd). @param {number[]} p @param {number[][]} loop @returns {boolean} */
export function inside([x, y], loop) {
  let inn = false;
  for (let i = 0, n = loop.length; i < n; i++) { const [ax, ay] = loop[i], [bx, by] = loop[(i + 1) % n]; if ((ay > y) !== (by > y) && x < ax + ((y - ay) * (bx - ax)) / (by - ay)) inn = !inn; }
  return inn;
}
function segmentDistance(a, b, c, d) { // the least distance between segments ab and cd (0 where they cross)
  const d1 = cross(b[0] - a[0], b[1] - a[1], c[0] - a[0], c[1] - a[1]), d2 = cross(b[0] - a[0], b[1] - a[1], d[0] - a[0], d[1] - a[1]);
  const d3 = cross(d[0] - c[0], d[1] - c[1], a[0] - c[0], a[1] - c[1]), d4 = cross(d[0] - c[0], d[1] - c[1], b[0] - c[0], b[1] - c[1]);
  if (d1 * d2 < 0 && d3 * d4 < 0) return 0;
  const to = (p, s, e) => { const vx = e[0] - s[0], vy = e[1] - s[1], L = vx * vx + vy * vy, t = L ? Math.max(0, Math.min(1, ((p[0] - s[0]) * vx + (p[1] - s[1]) * vy) / L)) : 0; return Math.hypot(p[0] - s[0] - t * vx, p[1] - s[1] - t * vy); };
  return Math.min(to(a, c, d), to(b, c, d), to(c, a, b), to(d, a, b));
}
/**
 * The gap between two closed outlines: the least distance between them, or a negative number when they overlap (one
 * crossing or inside the other), whose size is not a depth.
 * @param {number[][]} p @param {number[][]} q @returns {number}
 */
export function gap(p, q) {
  let least = Infinity;
  for (let i = 0; i < p.length; i++) for (let j = 0; j < q.length; j++) least = Math.min(least, segmentDistance(p[i], p[(i + 1) % p.length], q[j], q[(j + 1) % q.length]));
  return least === 0 || inside(p[0], q) || inside(q[0], p) ? -1 : least;
}
