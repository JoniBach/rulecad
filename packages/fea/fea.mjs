// Finite elements on a grid of cells, each with its own stiffness: flat parts loaded in their own plane (2D, plane
// stress, square cells) and solid parts (3D, cubes). Plain numbers in typed arrays, no dependencies: it runs in
// browsers and Node alike. Units are millimetres and newtons, so stiffness (Young's modulus) is in MPa (N/mm²) and
// displacement in mm.
//
// The grid: nx × ny (× nz) cells of side h, cell (i, j, k) with i along x, j along y and k along z, its lowest corner
// at (i h, j h, k h). Nodes are the cells' corners, with an unknown for each direction they can move (2 in 2D, 3 in
// 3D): node n's x is dof d n, its y d n + 1 (and z d n + 2), d the dimension. Nodes are numbered with the grid's
// longest side changing slowest, which keeps the stiffness matrix's band narrow.
//
// Three ways to solve:
//   "direct"  banded Cholesky factorisation: exact; quick for 2D grids up to about 100,000 cells and small 3D ones
//   "cg"      conjugate gradients, never assembling the matrix, with a diagonal (Jacobi) preconditioner
//   "mg"      conjugate gradients with a multigrid preconditioner: for big grids, and 3D. Each coarser grid's cells are
//             built from the finer grid's exactly (Galerkin: R K P, cell by cell), so it stays accurate when cells'
//             stiffnesses differ a millionfold, as they do in topology optimisation (Amir, Aage, Lazarov 2014)
// The work the solvers repeat (a stiffness product, its diagonal, dot products) sits behind a backend, so a GPU can do
// it; plain JavaScript in 64-bit floats is the reference.

/** @typedef {{ nx: number, ny: number, nz?: number, h: number }} GridSize cells along x, y (and z for 3D), and their side in mm */
/** @typedef {GridSize & { dim: 2 | 3, cells: number, nodes: number, dofs: number, cellDofs: number, edof: Int32Array, node: (i: number, j: number, k?: number) => number }} Grid */
/** @typedef {{ E: number, nu: number }} Material Young's modulus (MPa) and Poisson's ratio */

// A cell's corners, in order: counter-clockwise from the lowest (then the same again a layer up, in 3D)
const CORNERS = { 2: [[0, 0], [1, 0], [1, 1], [0, 1]], 3: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] };

/**
 * A grid of square (2D) or cube (3D) cells, with each cell's unknowns: its corners in order, x, y (and z) for each.
 * @param {GridSize} size
 * @returns {Grid}
 */
export function grid({ nx, ny, nz, h = 1 }) {
  const dim = nz ? 3 : 2, n = dim === 3 ? [nx, ny, nz] : [nx, ny];
  if (!n.every((c) => c >= 1 && Number.isInteger(c))) throw new Error(`a grid needs whole numbers of cells (got ${n.join(' × ')})`);
  // Strides: the longest side changes slowest (ties: x slowest, then y)
  const axes = n.map((c, a) => a).sort((a, b) => n[a] - n[b] || b - a), stride = new Array(dim);
  let s = 1;
  for (const a of axes) { stride[a] = s; s *= n[a] + 1; }
  const nodes = s;
  const node = dim === 3 ? (i, j, k) => i * stride[0] + j * stride[1] + k * stride[2] : (i, j) => i * stride[0] + j * stride[1];
  const corners = CORNERS[dim], cellDofs = corners.length * dim, cells = n.reduce((p, c) => p * c, 1);
  const edof = new Int32Array(cells * cellDofs);
  for (let e = 0; e < cells; e++) {
    const i = e % nx, j = Math.floor(e / nx) % ny, k = dim === 3 ? Math.floor(e / (nx * ny)) : 0;
    corners.forEach((c, q) => {
      const m = node(i + c[0], j + c[1], k + (c[2] || 0));
      for (let d = 0; d < dim; d++) edof[e * cellDofs + q * dim + d] = dim * m + d;
    });
  }
  return { nx, ny, ...(dim === 3 ? { nz } : {}), h, dim, cells, nodes, dofs: dim * nodes, cellDofs, edof, node };
}

// The strain-displacement matrix of a cell of side h at natural coordinates p (each -1 to 1), row by row: 3 × 8 in 2D
// (εx, εy, γxy), 6 × 24 in 3D (εx, εy, εz, γxy, γyz, γzx)
function strains(p, h, dim) {
  const corners = CORNERS[dim], m = corners.length * dim, rows = dim === 3 ? 6 : 3, B = new Float64Array(rows * m);
  corners.forEach((c, q) => {
    const sign = c.map((x) => 2 * x - 1);
    // dN/dx along each axis: the corner's sign along it, times (1 + sign p) along the others, over 2^dim, times 2 / h
    const g = sign.map((sa, a) => sa * sign.reduce((f, sb, b) => (b === a ? f : f * (1 + sb * p[b])), 1) / (1 << dim) * (2 / h));
    const col = q * dim;
    if (dim === 2) {
      B[col] = g[0]; B[m + col + 1] = g[1]; B[2 * m + col] = g[1]; B[2 * m + col + 1] = g[0];
    } else {
      B[col] = g[0]; B[m + col + 1] = g[1]; B[2 * m + col + 2] = g[2];
      B[3 * m + col] = g[1]; B[3 * m + col + 1] = g[0];
      B[4 * m + col + 1] = g[2]; B[4 * m + col + 2] = g[1];
      B[5 * m + col] = g[2]; B[5 * m + col + 2] = g[0];
    }
  });
  return B;
}
// Stress from strain for Young's modulus 1: plane stress in 2D, isotropic in 3D
function elasticity(nu, dim) {
  if (dim === 2) { const f = 1 / (1 - nu * nu); return [f, f * nu, 0, f * nu, f, 0, 0, 0, f * (1 - nu) / 2]; }
  const f = 1 / ((1 + nu) * (1 - 2 * nu)), a = f * (1 - nu), b = f * nu, c = f * (1 - 2 * nu) / 2, D = new Array(36).fill(0);
  for (let r = 0; r < 3; r++) for (let q = 0; q < 3; q++) D[r * 6 + q] = r === q ? a : b;
  for (let r = 3; r < 6; r++) D[r * 6 + r] = c;
  return D;
}

/**
 * A cell's stiffness matrix (8 × 8 in 2D, 24 × 24 in 3D, row by row) for Young's modulus 1 and a cell of side 1 (in
 * 2D, thickness 1). In 2D it's the same for any cell size; in 3D it scales with the side. Integrated at 2 × 2 (× 2)
 * Gauss points, as for any bilinear (trilinear) element.
 * @param {number} nu Poisson's ratio
 * @param {2 | 3} [dim]
 * @returns {Float64Array}
 */
export function cellStiffness(nu, dim = 2) {
  const D = elasticity(nu, dim), m = CORNERS[dim].length * dim, rows = dim === 3 ? 6 : 3, K = new Float64Array(m * m);
  const g = 1 / Math.sqrt(3), weight = 1 / (1 << dim); // side 1: the Jacobian is (1/2)^dim
  const points = dim === 3 ? [-g, g].flatMap((a) => [-g, g].flatMap((b) => [-g, g].map((c) => [a, b, c]))) : [-g, g].flatMap((a) => [-g, g].map((b) => [a, b]));
  for (const p of points) {
    const B = strains(p, 1, dim), DB = new Float64Array(rows * m);
    for (let r = 0; r < rows; r++) for (let c = 0; c < m; c++) { let s = 0; for (let t = 0; t < rows; t++) s += D[r * rows + t] * B[t * m + c]; DB[r * m + c] = s; }
    for (let a = 0; a < m; a++) for (let b = 0; b < m; b++) { let s = 0; for (let r = 0; r < rows; r++) s += B[r * m + a] * DB[r * m + b]; K[a * m + b] += s * weight; }
  }
  return K;
}

/**
 * The plain JavaScript backend: the operations the iterative solvers repeat, on Float64Arrays. Another backend
 * (WebGPU, TensorFlow.js) provides the same and is tested against this one (backend-suite.mjs).
 * operator(g, ke): every cell's stiffness is ke (a cell matrix, shared) times scale[cell]; or with cellMatrices, each
 * cell has its own matrix (cells × m × m), as multigrid's coarser grids do. The matrix is assembled, in blocks (a
 * node's rows: a dim × dim block for each node it shares a cell with), once for each scale array it is given (so one
 * changed in place needs a new operator), or once from the cells' own matrices; each product is then a plain sweep.
 * @type {{ name: string, precision: number, operator: (g: Grid, ke: Float64Array | null, cellMatrices?: Float64Array) => { multiply: (scale: Float64Array | null, x: Float64Array, y: Float64Array) => void, diagonal: (scale: Float64Array | null, d: Float64Array) => void }, dot: (a: Float64Array, b: Float64Array) => number, axpy: (a: number, x: Float64Array, y: Float64Array) => void }}
 */
export const jsBackend = {
  name: 'js',
  precision: 64,
  operator(g, ke, cellMatrices) {
    const pat = pattern(g), { dim } = g, bb = dim * dim;
    let values = cellMatrices ? assemble(g, pat, cellMatrices, null, null) : null, assembledFor = cellMatrices ? undefined : {};
    const ready = (scale) => { if (!cellMatrices && assembledFor !== scale) { values = assemble(g, pat, null, ke, scale, values); assembledFor = scale; } };
    // Each node's diagonal block, inverted, with fixed dofs left out (their rows and columns zero, so they don't move);
    // a node with nothing round it (no stiffness) doesn't move either. Kept until the values or the fixed dofs change.
    let invFor = null, invValues = null, inv = null;
    function inverses(fixed) {
      if (inv && invFor === fixed && invValues === values) return inv;
      const { rows, self } = pat, n = g.nodes;
      inv = new Float64Array(n * bb); invFor = fixed; invValues = values;
      const D = new Float64Array(bb);
      for (let i = 0; i < n; i++) {
        const o = (rows[i] + self[i]) * bb, b = i * bb;
        for (let q = 0; q < bb; q++) D[q] = values[o + q];
        for (let q = 0; q < dim; q++) if (fixed[dim * i + q]) { for (let f = 0; f < dim; f++) { D[q * dim + f] = 0; D[f * dim + q] = 0; } }
        if (dim === 2) {
          const det = D[0] * D[3] - D[1] * D[2];
          if (!(Math.abs(det) > 0)) continue;
          inv[b] = D[3] / det; inv[b + 1] = -D[1] / det; inv[b + 2] = -D[2] / det; inv[b + 3] = D[0] / det;
        } else {
          const c0 = D[4] * D[8] - D[5] * D[7], c1 = D[5] * D[6] - D[3] * D[8], c2 = D[3] * D[7] - D[4] * D[6], det = D[0] * c0 + D[1] * c1 + D[2] * c2;
          if (!(Math.abs(det) > 0)) {
            // Some dofs fixed: invert what's left, dof by dof where the block is diagonal there
            for (let q = 0; q < dim; q++) if (!fixed[dim * i + q] && D[q * dim + q] > 0) inv[b + q * dim + q] = 1 / D[q * dim + q];
            continue;
          }
          inv[b] = c0 / det; inv[b + 1] = (D[2] * D[7] - D[1] * D[8]) / det; inv[b + 2] = (D[1] * D[5] - D[2] * D[4]) / det;
          inv[b + 3] = c1 / det; inv[b + 4] = (D[0] * D[8] - D[2] * D[6]) / det; inv[b + 5] = (D[2] * D[3] - D[0] * D[5]) / det;
          inv[b + 6] = c2 / det; inv[b + 7] = (D[1] * D[6] - D[0] * D[7]) / det; inv[b + 8] = (D[0] * D[4] - D[1] * D[3]) / det;
        }
      }
      return inv;
    }
    return {
      multiply(scale, x, y) {
        ready(scale);
        const { rows, cols } = pat, n = g.nodes, v = values;
        if (dim === 3) {
          for (let i = 0; i < n; i++) {
            let y0 = 0, y1 = 0, y2 = 0;
            for (let t = rows[i], end = rows[i + 1]; t < end; t++) {
              const j = cols[t] * 3, o = t * 9, x0 = x[j], x1 = x[j + 1], x2 = x[j + 2];
              y0 += v[o] * x0 + v[o + 1] * x1 + v[o + 2] * x2;
              y1 += v[o + 3] * x0 + v[o + 4] * x1 + v[o + 5] * x2;
              y2 += v[o + 6] * x0 + v[o + 7] * x1 + v[o + 8] * x2;
            }
            y[3 * i] = y0; y[3 * i + 1] = y1; y[3 * i + 2] = y2;
          }
        } else {
          for (let i = 0; i < n; i++) {
            let y0 = 0, y1 = 0;
            for (let t = rows[i], end = rows[i + 1]; t < end; t++) {
              const j = cols[t] * 2, o = t * 4, x0 = x[j], x1 = x[j + 1];
              y0 += v[o] * x0 + v[o + 1] * x1; y1 += v[o + 2] * x0 + v[o + 3] * x1;
            }
            y[2 * i] = y0; y[2 * i + 1] = y1;
          }
        }
      },
      diagonal(scale, d) {
        ready(scale);
        const { rows, self } = pat;
        for (let i = 0; i < g.nodes; i++) { const o = (rows[i] + self[i]) * bb; for (let q = 0; q < dim; q++) d[dim * i + q] = values[o + q * dim + q]; }
      },
      // One symmetric Gauss-Seidel sweep on K x = r, in place: forward through the nodes, then back, each node's dofs
      // solved together through its diagonal block's inverse, with its neighbours' latest values. Fixed dofs stay.
      // Symmetric, so a multigrid cycle smoothed with it can precondition conjugate gradients.
      smooth(scale, fixed, r, x) {
        ready(scale);
        const inv = inverses(fixed), { rows, cols } = pat, n = g.nodes, v = values;
        const node = dim === 3
          ? (i) => {
            let y0 = 0, y1 = 0, y2 = 0;
            for (let t = rows[i], end = rows[i + 1]; t < end; t++) {
              const j = cols[t] * 3, o = t * 9, x0 = x[j], x1 = x[j + 1], x2 = x[j + 2];
              y0 += v[o] * x0 + v[o + 1] * x1 + v[o + 2] * x2; y1 += v[o + 3] * x0 + v[o + 4] * x1 + v[o + 5] * x2; y2 += v[o + 6] * x0 + v[o + 7] * x1 + v[o + 8] * x2;
            }
            const k = 3 * i, b = 9 * i, r0 = r[k] - y0, r1 = r[k + 1] - y1, r2 = r[k + 2] - y2;
            x[k] += inv[b] * r0 + inv[b + 1] * r1 + inv[b + 2] * r2; x[k + 1] += inv[b + 3] * r0 + inv[b + 4] * r1 + inv[b + 5] * r2; x[k + 2] += inv[b + 6] * r0 + inv[b + 7] * r1 + inv[b + 8] * r2;
          }
          : (i) => {
            let y0 = 0, y1 = 0;
            for (let t = rows[i], end = rows[i + 1]; t < end; t++) { const j = cols[t] * 2, o = t * 4, x0 = x[j], x1 = x[j + 1]; y0 += v[o] * x0 + v[o + 1] * x1; y1 += v[o + 2] * x0 + v[o + 3] * x1; }
            const k = 2 * i, b = 4 * i, r0 = r[k] - y0, r1 = r[k + 1] - y1;
            x[k] += inv[b] * r0 + inv[b + 1] * r1; x[k + 1] += inv[b + 2] * r0 + inv[b + 3] * r1;
          };
        for (let i = 0; i < n; i++) node(i);
        for (let i = n - 1; i >= 0; i--) node(i);
      },
    };
  },
  dot(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; },
  axpy(a, x, y) { for (let i = 0; i < y.length; i++) y[i] += a * x[i]; },
};

// Memory worker threads can share, where there is such a thing (Node; browsers only when cross-origin isolated)
const Shared = typeof SharedArrayBuffer === 'function' ? SharedArrayBuffer : ArrayBuffer;
// A copy of a typed array on it
const shared = (a) => { const out = new a.constructor(new Shared(a.byteLength)); out.set(a); return out; };

// The assembled matrix's shape for a grid, worked out once per grid: for each node, the nodes it shares a cell with
// (the 3 × 3 (× 3) round it, in node order: rows, cols), which of them is itself (self), and where each of its
// neighbourhood's offsets sits in its row (slot), so a cell's entries find their blocks without searching.
const patterns = new WeakMap();
export function pattern(g) {
  if (patterns.has(g)) return patterns.get(g);
  const { dim, nodes, cellDofs: m, edof } = g, nk = dim === 3 ? g.nz : 0, corners = CORNERS[dim];
  const id = (i, j, k) => (dim === 3 ? g.node(i, j, k) : g.node(i, j));
  const coords = new Int32Array(nodes * 3);
  for (let k = 0; k <= nk; k++) for (let j = 0; j <= g.ny; j++) for (let i = 0; i <= g.nx; i++) { const n = id(i, j, k); coords[3 * n] = i; coords[3 * n + 1] = j; coords[3 * n + 2] = k; }
  const offsets = [];
  for (let c = dim === 3 ? -1 : 0; c <= (dim === 3 ? 1 : 0); c++) for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) offsets.push([a, b, c]);
  const O = offsets.length, offsetIndex = (a, b, c) => (dim === 3 ? (c + 1) * 9 : 0) + (b + 1) * 3 + (a + 1);
  const slot = new Int32Array(nodes * O).fill(-1), rows = new Int32Array(nodes + 1), self = new Int32Array(nodes), cols = [];
  for (let n = 0; n < nodes; n++) {
    const [i, j, k] = [coords[3 * n], coords[3 * n + 1], coords[3 * n + 2]], near = [];
    offsets.forEach(([a, b, c], o) => { const I = i + a, J = j + b, K = k + c; if (I >= 0 && I <= g.nx && J >= 0 && J <= g.ny && K >= 0 && K <= nk) near.push([id(I, J, K), o]); });
    near.sort((p, q) => p[0] - q[0]);
    near.forEach(([nb, o], t) => { slot[n * O + o] = t; if (nb === n) self[n] = t; cols.push(nb); });
    rows[n + 1] = cols.length;
  }
  // For a cell's corner pair (p, q), the offset of q's node from p's
  const C = corners.length, pairOffset = new Int32Array(C * C);
  for (let p = 0; p < C; p++) for (let q = 0; q < C; q++) pairOffset[p * C + q] = offsetIndex(corners[q][0] - corners[p][0], corners[q][1] - corners[p][1], (corners[q][2] || 0) - (corners[p][2] || 0));
  const out = { rows: shared(rows), cols: shared(Int32Array.from(cols)), slot, self, pairOffset, O };
  patterns.set(g, out);
  return out;
}

// The matrix's values, assembled from the cells: each its own matrix (cellMatrices), or ke times its scale (1 with no
// scale). Into the buffer given, if any.
export function assemble(g, pat, cellMatrices, ke, scale, into) {
  const { rows, cols, slot, pairOffset, O } = pat, { dim, cells, cellDofs: m, edof } = g, C = CORNERS[dim].length, bb = dim * dim, mm = m * m;
  const values = into || new Float64Array(new Shared(cols.length * bb * 8));
  if (into) values.fill(0);
  const K = cellMatrices || ke;
  for (let e = 0; e < cells; e++) {
    const s = scale ? scale[e] : 1;
    if (s === 0) continue;
    const base = cellMatrices ? e * mm : 0, eo = e * m;
    for (let p = 0; p < C; p++) {
      const na = edof[eo + p * dim] / dim, row = rows[na], sb = na * O, pb = p * C;
      for (let q = 0; q < C; q++) {
        const t = (row + slot[sb + pairOffset[pb + q]]) * bb, kb = base + p * dim * m + q * dim;
        for (let d = 0; d < dim; d++) for (let f = 0; f < dim; f++) values[t + d * dim + f] += s * K[kb + d * m + f];
      }
    }
  }
  return values;
}

/**
 * Solve K u = f for each load. K is every cell's stiffness (cellStiffness) times scale[cell]; fixed dofs don't move.
 * @param {Grid} g
 * @param {{ scale: Float64Array, ke: Float64Array, fixed: Uint8Array, loads: Float64Array[], method?: 'direct' | 'cg' | 'mg', backend?: typeof jsBackend, tol?: number, maxIter?: number, start?: Float64Array[] }} o
 *   start: a first guess for the iterative solvers (the last solution, when solving again after a small change)
 * @returns {{ u: Float64Array[], iterations: number, again: (loads: Float64Array[]) => Float64Array[] }} again: more
 *   loads on the same matrix (an adjoint), reusing its factor or preconditioner
 */
export function solve(g, { scale, ke, fixed, loads, method = 'direct', backend = jsBackend, tol = 1e-9, maxIter = 20000, start }) {
  if (scale.length !== g.cells) throw new Error(`scale has ${scale.length} values for ${g.cells} cells`);
  if (!fixed.some((f) => f)) throw new Error('nothing is held: fix at least one support, or the part just moves');
  const held = (ls) => ls.map((l) => { const c = Float64Array.from(l); for (let i = 0; i < c.length; i++) if (fixed[i]) c[i] = 0; return c; });
  if (method === 'direct') {
    const L = factor(g, { scale, ke }, fixed), again = (ls) => held(ls).map((b) => L.solve(b));
    return { u: again(loads), iterations: 0, again };
  }
  const op = backend.operator(g, ke); // one for the solver and its preconditioner: the matrix is assembled once
  const precondition = method === 'mg' ? multigrid(g, { scale, ke, fixed, backend, op }) : jacobi(g, { scale, fixed, op });
  const again = (ls) => conjugateGradients(g, { scale, fixed, loads: held(ls), backend, tol, maxIter, precondition, op }).u;
  return { ...conjugateGradients(g, { scale, fixed, loads: held(loads), backend, tol, maxIter, start, precondition, op }), again };
}

// The banded Cholesky factor of K (cells' matrices: ke × scale, or each its own), fixed dofs as identity rows
function factor(g, { scale, ke, cellMatrices }, fixed) {
  const { edof, dofs, cells, cellDofs: m } = g, mm = m * m;
  let b = 0;
  for (let e = 0; e < cells; e++) {
    let lo = Infinity, hi = -Infinity;
    for (let a = 0; a < m; a++) { lo = Math.min(lo, edof[e * m + a]); hi = Math.max(hi, edof[e * m + a]); }
    b = Math.max(b, hi - lo);
  }
  const w = b + 1, L = new Float64Array(dofs * w); // L[i][j] (j ≤ i, i - j ≤ b) at i * w + b - i + j: a row's band in order
  for (let e = 0; e < cells; e++) {
    const s = scale ? scale[e] : 1, K = cellMatrices || ke, base = cellMatrices ? e * mm : 0;
    for (let p = 0; p < m; p++) {
      const i = edof[e * m + p];
      if (fixed[i]) continue;
      for (let q = 0; q < m; q++) {
        const j = edof[e * m + q];
        if (j > i || fixed[j]) continue;
        L[i * w + b - i + j] += s * K[base + p * m + q];
      }
    }
  }
  for (let i = 0; i < dofs; i++) if (fixed[i] || L[i * w + b] === 0) L[i * w + b] = 1; // fixed, or touching no cell
  for (let i = 0; i < dofs; i++) {
    const from = Math.max(0, i - b), ri = i * w + b - i; // L[i][k] is at ri + k
    for (let j = from; j <= i; j++) {
      const rj = j * w + b - j;
      let s = L[ri + j], s1 = 0, s2 = 0, s3 = 0, k = from;
      for (; k + 3 < j; k += 4) { s -= L[ri + k] * L[rj + k]; s1 += L[ri + k + 1] * L[rj + k + 1]; s2 += L[ri + k + 2] * L[rj + k + 2]; s3 += L[ri + k + 3] * L[rj + k + 3]; } // four running sums: a little faster
      for (; k < j; k++) s -= L[ri + k] * L[rj + k];
      s -= s1 + s2 + s3;
      if (j === i) {
        if (!(s > 0)) throw new Error('the part is not held still: add supports, or join loose pieces to it');
        L[i * w + b] = Math.sqrt(s);
      } else L[ri + j] = s / L[j * w + b];
    }
  }
  return {
    solve(f) {
      const x = Float64Array.from(f);
      for (let i = 0; i < dofs; i++) {
        let s = x[i];
        for (let k = Math.max(0, i - b); k < i; k++) s -= L[i * w + b - i + k] * x[k];
        x[i] = s / L[i * w + b];
      }
      for (let i = dofs - 1; i >= 0; i--) {
        let s = x[i];
        for (let k = i + 1; k <= Math.min(dofs - 1, i + b); k++) s -= L[k * w + b - k + i] * x[k];
        x[i] = s / L[i * w + b];
      }
      return x;
    },
  };
}

// The diagonal preconditioner: each residual over its diagonal
function jacobi(g, { scale, fixed, op }) {
  const d = new Float64Array(g.dofs);
  op.diagonal(scale, d);
  for (let i = 0; i < d.length; i++) d[i] = fixed[i] || !(d[i] > 0) ? 1 : 1 / d[i];
  return (r, z) => { for (let i = 0; i < r.length; i++) z[i] = d[i] * r[i]; };
}

// Conjugate gradients, matrix-free: fixed dofs stay at 0 (their rows act as the identity)
function conjugateGradients(g, { scale, fixed, loads, backend, tol, maxIter, start, precondition, op }) {
  const n = g.dofs;
  const apply = (x, y) => { op.multiply(scale, x, y); for (let i = 0; i < n; i++) if (fixed[i]) y[i] = x[i]; };
  let total = 0;
  const u = loads.map((f, c) => {
    const x = start?.[c] ? Float64Array.from(start[c]) : new Float64Array(n);
    for (let i = 0; i < n; i++) if (fixed[i]) x[i] = 0;
    const r = new Float64Array(n), z = new Float64Array(n), p = new Float64Array(n), q = new Float64Array(n);
    apply(x, q);
    for (let i = 0; i < n; i++) r[i] = f[i] - q[i];
    const limit = tol * Math.sqrt(backend.dot(f, f));
    precondition(r, z); p.set(z);
    let rz = backend.dot(r, z), it = 0;
    while (Math.sqrt(backend.dot(r, r)) > limit && it < maxIter) {
      apply(p, q);
      const a = rz / backend.dot(p, q);
      backend.axpy(a, p, x); backend.axpy(-a, q, r);
      precondition(r, z);
      const next = backend.dot(r, z);
      for (let i = 0; i < n; i++) p[i] = z[i] + (next / rz) * p[i];
      rz = next; it++;
    }
    if (it >= maxIter) throw new Error(`the solver didn't settle in ${maxIter} steps: the part may be barely held, or a piece of it loose`);
    total += it;
    return x;
  });
  return { u, iterations: total };
}

// ---------- multigrid ----------
// Coarser grids halve each side while every side is even and the grid has more than about 3,000 unknowns. A coarse
// cell's matrix is its 2^d children's, carried up by the trilinear (bilinear) interpolation from its corners to theirs
// (Pᵀ K P), with fixed dofs left out, so the coarse problem is the fine one seen at half the resolution. The cycle is a
// V: two damped Jacobi sweeps down, the coarsest grid solved exactly (banded Cholesky), two sweeps on the way up.
// It's symmetric, so conjugate gradients can use it as a preconditioner.
const SWEEPS = 2, DAMPING = 0.5, COARSEST = 600;

// The coarser grids under a grid, and the maps between each pair, worked out once per grid (they don't change as the
// cells' stiffnesses do)
const hierarchies = new WeakMap();
function hierarchy(g) {
  if (hierarchies.has(g)) return hierarchies.get(g);
  const grids = [g];
  for (;;) {
    const fg = grids.at(-1), sides = fg.dim === 3 ? [fg.nx, fg.ny, fg.nz] : [fg.nx, fg.ny];
    if (fg.dofs <= COARSEST || sides.some((s) => s % 2)) break;
    grids.push(grid({ nx: fg.nx / 2, ny: fg.ny / 2, ...(fg.dim === 3 ? { nz: fg.nz / 2 } : {}), h: fg.h * 2 }));
  }
  const maps = grids.slice(1).map((cg, l) => transfer(grids[l], cg));
  const out = { grids, maps };
  hierarchies.set(g, out);
  return out;
}

function multigrid(g, { scale, ke, fixed, backend, op }) {
  const { grids, maps } = hierarchy(g);
  const levels = [{ g, op, scale, fixed: Uint8Array.from(fixed), mats: null }];
  for (let l = 1; l < grids.length; l++) {
    const f = levels.at(-1), fg = f.g, cg = grids[l];
    const mats = coarsen(fg, cg, f.mats || ke, f.mats ? null : f.scale, f.fixed);
    const cfixed = new Uint8Array(cg.dofs), diag = new Float64Array(cg.dofs), m = cg.cellDofs;
    for (let e = 0; e < cg.cells; e++) for (let a = 0; a < m; a++) diag[cg.edof[e * m + a]] += mats[e * m * m + a * (m + 1)];
    for (let i = 0; i < cg.dofs; i++) if (!(diag[i] > 0)) cfixed[i] = 1; // nothing below moves it: held
    levels.push({ g: cg, op: backend.operator(cg, null, mats), scale: null, fixed: cfixed, mats });
  }
  for (const l of levels) { // each level's diagonal, for its Jacobi sweeps
    l.inv = new Float64Array(l.g.dofs);
    l.op.diagonal(l.scale, l.inv);
    for (let i = 0; i < l.inv.length; i++) l.inv[i] = l.fixed[i] || !(l.inv[i] > 0) ? 0 : DAMPING / l.inv[i];
  }
  const last = levels.at(-1), coarse = factor(last.g, { scale: last.scale, ke, cellMatrices: last.mats }, last.fixed);
  const apply = (l, x, y) => { l.op.multiply(l.scale, x, y); for (let i = 0; i < y.length; i++) if (l.fixed[i]) y[i] = 0; };

  const cycle = (k, r) => {
    const l = levels[k];
    if (k === levels.length - 1) { const x = coarse.solve(r); for (let i = 0; i < x.length; i++) if (l.fixed[i]) x[i] = 0; return x; }
    const n = l.g.dofs, x = new Float64Array(n), Ax = new Float64Array(n), res = new Float64Array(n);
    // Smoothed by a symmetric Gauss-Seidel sweep where the backend has one (once each way is about as much work as
    // two Jacobi sweeps, and smooths better), else by damped Jacobi
    const sweep = () => { if (l.op.smooth) l.op.smooth(l.scale, l.fixed, r, x); else { apply(l, x, Ax); for (let i = 0; i < n; i++) x[i] += l.inv[i] * (r[i] - Ax[i]); } };
    const sweeps = l.op.smooth ? 1 : SWEEPS;
    for (let s = 0; s < sweeps; s++) sweep();
    apply(l, x, Ax);
    for (let i = 0; i < n; i++) res[i] = l.fixed[i] ? 0 : r[i] - Ax[i];
    const e = maps[k].prolong(cycle(k + 1, maps[k].restrict(res)));
    for (let i = 0; i < n; i++) x[i] += l.fixed[i] ? 0 : e[i];
    for (let s = 0; s < sweeps; s++) sweep();
    return x;
  };
  return (r, z) => {
    const x = cycle(0, r);
    for (let i = 0; i < z.length; i++) z[i] = fixed[i] ? r[i] : x[i];
  };
}

// The interpolation weights from a coarse cell's corners to one child's corners: for child offset o (each 0 or 1),
// a (cellDofs × cellDofs) matrix P_o with child dof = Σ P_o[child][coarse] × coarse dof, kept as its nonzero entries
function childInterpolation(dim) {
  const corners = CORNERS[dim], m = corners.length * dim, out = [];
  for (const o of corners) {
    const P = new Float64Array(m * m);
    corners.forEach((c, q) => { // the child's corner q, at (o + c) / 2 in the coarse cell
      const at = c.map((x, a) => (o[a] + x) / 2);
      corners.forEach((C, Q) => {
        const wgt = at.reduce((p, x, a) => p * (C[a] ? x : 1 - x), 1);
        if (wgt) for (let d = 0; d < dim; d++) P[(q * dim + d) * m + Q * dim + d] = wgt;
      });
    });
    // As its nonzero entries: rows, columns, weights
    const rows = [], cols = [], wts = [];
    for (let r = 0; r < m; r++) for (let c = 0; c < m; c++) if (P[r * m + c]) { rows.push(r); cols.push(c); wts.push(P[r * m + c]); }
    out.push([Int32Array.from(rows), Int32Array.from(cols), Float64Array.from(wts)]);
  }
  return out;
}

// Each coarse cell's matrix: Σ over its children of P_oᵀ (child's matrix, fixed rows and columns left out) P_o, using
// only P_o's nonzero weights (about one in seven)
const interpolations = { 2: null, 3: null };
// On the fine level every cell's matrix is the one cell matrix scaled, so each child position's carried-up matrix
// (P_oᵀ ke P_o) is the same for every coarse cell: worked out once per cell matrix, and scaled. Only a child with a
// fixed dof (few: on the supports) is carried up the long way, with those left out.
const carried = new WeakMap();
function carriedUp(ke, dim) {
  if (carried.has(ke)) return carried.get(ke);
  const m = CORNERS[dim].length * dim, mm = m * m, P = interpolations[dim] || (interpolations[dim] = childInterpolation(dim)), KP = new Float64Array(mm);
  const out = P.map(([rows, cols, wts]) => {
    const o = new Float64Array(mm);
    KP.fill(0);
    for (let t = 0; t < wts.length; t++) { const b = rows[t], c = cols[t], w = wts[t]; for (let a = 0; a < m; a++) KP[a * m + c] += ke[a * m + b] * w; }
    for (let t = 0; t < wts.length; t++) { const a = rows[t], r = cols[t], w = wts[t]; for (let c = 0; c < m; c++) o[r * m + c] += w * KP[a * m + c]; }
    return o;
  });
  carried.set(ke, out);
  return out;
}
function coarsen(fg, cg, K, scale, fixed) {
  const dim = fg.dim, m = fg.cellDofs, mm = m * m, corners = CORNERS[dim];
  const P = interpolations[dim] || (interpolations[dim] = childInterpolation(dim)), ready = scale ? carriedUp(K, dim) : null;
  const out = new Float64Array(cg.cells * mm), KP = new Float64Array(mm), held = new Uint8Array(m);
  const shared = scale ? K : null; // fine level: one matrix scaled per cell; coarser: each cell its own
  const offset = corners.map((o) => ((o[2] || 0) * fg.ny + o[1]) * fg.nx + o[0]); // a child's cell number from its first
  for (let E = 0; E < cg.cells; E++) {
    const I = E % cg.nx, J = Math.floor(E / cg.nx) % cg.ny, Kz = dim === 3 ? Math.floor(E / (cg.nx * cg.ny)) : 0;
    const first = (2 * Kz * fg.ny + 2 * J) * fg.nx + 2 * I, o0 = E * mm;
    for (let oi = 0; oi < corners.length; oi++) {
      const e = first + offset[oi], s = scale ? scale[e] : 1, base = shared ? 0 : e * mm, src = shared || K;
      if (s === 0) continue;
      let any = 0;
      for (let a = 0; a < m; a++) { held[a] = fixed[fg.edof[e * m + a]]; any |= held[a]; }
      if (ready && !any) { const R = ready[oi]; for (let t = 0; t < mm; t++) out[o0 + t] += s * R[t]; continue; }
      const [rows, cols, wts] = P[oi];
      KP.fill(0);
      for (let t = 0; t < wts.length; t++) { // KP = child × P_o
        const b = rows[t];
        if (held[b]) continue;
        const c = cols[t], w = s * wts[t];
        for (let a = 0; a < m; a++) if (!held[a]) KP[a * m + c] += src[base + a * m + b] * w;
      }
      for (let t = 0; t < wts.length; t++) { // out += P_oᵀ × KP
        const a = rows[t], r = cols[t], w = wts[t], ro = o0 + r * m, ka = a * m;
        for (let c = 0; c < m; c++) out[ro + c] += w * KP[ka + c];
      }
    }
  }
  return out;
}

// Between a fine grid and the next coarser: prolong (coarse to fine: each fine node takes the interpolation of the
// coarse nodes round it, 1, 2, 4 or 8 of them) and restrict, its transpose. Each fine node's coarse nodes and weights
// are listed once, as flat arrays.
function transfer(fg, cg) {
  const dim = fg.dim, nk = dim === 3 ? fg.nz : 0, start = new Int32Array(fg.nodes + 1), from = [], weight = [];
  const order = new Int32Array(fg.nodes);
  let n = 0;
  for (let k = 0; k <= nk; k++) for (let j = 0; j <= fg.ny; j++) for (let i = 0; i <= fg.nx; i++) {
    const node = dim === 3 ? fg.node(i, j, k) : fg.node(i, j);
    let picks = [[i >> 1, j >> 1, k >> 1]];
    [i, j, k].slice(0, dim).forEach((c, a) => { if (c & 1) picks = picks.flatMap((p) => [p, p.map((v, b) => (b === a ? v + 1 : v))]); });
    for (const c of picks) { from.push(dim === 3 ? cg.node(c[0], c[1], c[2]) : cg.node(c[0], c[1])); weight.push(1 / picks.length); }
    order[n] = node; start[++n] = from.length;
  }
  const F = Int32Array.from(from), W = Float64Array.from(weight);
  return {
    prolong(xc) {
      const xf = new Float64Array(fg.dofs);
      for (let q = 0; q < fg.nodes; q++) {
        const o = dim * order[q];
        for (let t = start[q]; t < start[q + 1]; t++) { const c = dim * F[t], w = W[t]; for (let d = 0; d < dim; d++) xf[o + d] += w * xc[c + d]; }
      }
      return xf;
    },
    restrict(rf) {
      const rc = new Float64Array(cg.dofs);
      for (let q = 0; q < fg.nodes; q++) {
        const o = dim * order[q];
        for (let t = start[q]; t < start[q + 1]; t++) { const c = dim * F[t], w = W[t]; for (let d = 0; d < dim; d++) rc[c + d] += w * rf[o + d]; }
      }
      return rc;
    },
  };
}

/**
 * Stress at a cell's centre from its corners' movements, for Young's modulus 1: a matrix (rows × cell dofs, row by row;
 * rows: σx, σy, τxy in 2D; σx, σy, σz, τxy, τyz, τzx in 3D). Times a cell's movements and its modulus, it's the stress.
 * @param {number} h cell size (mm) @param {number} nu @param {2 | 3} dim
 * @returns {Float64Array}
 */
export function centreStress(h, nu, dim) {
  const m = CORNERS[dim].length * dim, rows = dim === 3 ? 6 : 3, B = strains(new Array(dim).fill(0), h, dim), D = elasticity(nu, dim), S = new Float64Array(rows * m);
  for (let p = 0; p < rows; p++) for (let a = 0; a < m; a++) { let t = 0; for (let q = 0; q < rows; q++) t += D[p * rows + q] * B[q * m + a]; S[p * m + a] = t; }
  return S;
}

/**
 * Von Mises stress from a stress (as centreStress's rows); with grad, also its gradient with respect to the stress.
 * @param {ArrayLike<number>} s @param {2 | 3} dim @param {Float64Array} [grad]
 * @returns {number}
 */
export function vonMises(s, dim, grad) {
  const v = dim === 2 ? Math.sqrt(Math.max(0, s[0] * s[0] - s[0] * s[1] + s[1] * s[1] + 3 * s[2] * s[2]))
    : Math.sqrt(Math.max(0, ((s[0] - s[1]) ** 2 + (s[1] - s[2]) ** 2 + (s[2] - s[0]) ** 2) / 2 + 3 * (s[3] ** 2 + s[4] ** 2 + s[5] ** 2)));
  if (grad) {
    const k = v > 0 ? 1 / (2 * v) : 0;
    if (dim === 2) { grad[0] = k * (2 * s[0] - s[1]); grad[1] = k * (2 * s[1] - s[0]); grad[2] = k * 6 * s[2]; }
    else {
      grad[0] = k * (2 * s[0] - s[1] - s[2]); grad[1] = k * (2 * s[1] - s[0] - s[2]); grad[2] = k * (2 * s[2] - s[0] - s[1]);
      grad[3] = k * 6 * s[3]; grad[4] = k * 6 * s[4]; grad[5] = k * 6 * s[5];
    }
  }
  return v;
}

/**
 * Each cell's von Mises stress (MPa) at its centre, from a solution u.
 * @param {Grid} g @param {Float64Array} u @param {Float64Array} modulus each cell's Young's modulus (MPa) @param {number} nu
 * @returns {Float64Array}
 */
export function stress(g, u, modulus, nu) {
  const dim = g.dim, m = g.cellDofs, rows = dim === 3 ? 6 : 3, B = strains(new Array(dim).fill(0), g.h, dim), D = elasticity(nu, dim), out = new Float64Array(g.cells);
  const strain = new Float64Array(rows);
  for (let e = 0; e < g.cells; e++) {
    strain.fill(0);
    for (let p = 0; p < rows; p++) for (let a = 0; a < m; a++) strain[p] += B[p * m + a] * u[g.edof[e * m + a]];
    const s = new Array(rows).fill(0).map((_, p) => { let t = 0; for (let q = 0; q < rows; q++) t += D[p * rows + q] * strain[q]; return modulus[e] * t; });
    out[e] = dim === 2 ? Math.sqrt(s[0] * s[0] - s[0] * s[1] + s[1] * s[1] + 3 * s[2] * s[2])
      : Math.sqrt(((s[0] - s[1]) ** 2 + (s[1] - s[2]) ** 2 + (s[2] - s[0]) ** 2) / 2 + 3 * (s[3] ** 2 + s[4] ** 2 + s[5] ** 2));
  }
  return out;
}

/**
 * Analyse a part: each cell's density (0 empty to 1 solid; Young's modulus scales with density^penal, never below
 * E × 1e-9 so empty cells don't leave the matrix singular), supports and loads. In 2D the part is a plate of the given
 * thickness; in 3D thickness is not used.
 * @param {{ grid: Grid, density: Float64Array, material: Material, thickness?: number, fixed: Uint8Array, loads: Float64Array[], penal?: number, method?: 'direct' | 'cg' | 'mg', backend?: typeof jsBackend }} o
 * @returns {{ u: Float64Array[], compliance: number[], stress: Float64Array[], deflection: { most: number, at: number[] }[] }}
 *   compliance: f · u per load (N·mm): the work the load does; lower is stiffer. deflection: the largest movement
 *   of any node in solid material, and where.
 */
export function analyse({ grid: g, density, material, thickness = 1, fixed, loads, penal = 1, method = g.dim === 3 ? 'mg' : 'direct', backend }) {
  const { E, nu } = material, Emin = E * 1e-9, ke = cellStiffness(nu, g.dim);
  const modulus = Float64Array.from(density, (x) => Emin + Math.pow(x, penal) * (E - Emin));
  const scale = modulus.map((mod) => mod * (g.dim === 3 ? g.h : thickness));
  const { u } = solve(g, { scale, ke, fixed, loads, method, backend });
  const solidNode = new Uint8Array(g.nodes), corners = CORNERS[g.dim].length;
  for (let e = 0; e < density.length; e++) if (density[e] >= 0.5) for (let k = 0; k < corners; k++) solidNode[g.edof[e * g.cellDofs + g.dim * k] / g.dim] = 1;
  const position = positions(g);
  return {
    u,
    compliance: u.map((x, c) => jsBackend.dot(loads[c], x)),
    stress: u.map((x) => stress(g, x, modulus, nu)),
    deflection: u.map((x) => {
      let most = 0, at = position[0];
      for (let n = 0; n < g.nodes; n++) if (solidNode[n]) {
        let s = 0;
        for (let d = 0; d < g.dim; d++) s += x[g.dim * n + d] ** 2;
        if (Math.sqrt(s) > most) { most = Math.sqrt(s); at = position[n]; }
      }
      return { most, at };
    }),
  };
}

/**
 * Each node's position in mm, [x, y] (or [x, y, z]), by node number.
 * @param {Grid} g
 * @returns {number[][]}
 */
export function positions(g) {
  const out = new Array(g.nodes), nk = g.dim === 3 ? g.nz : 0;
  for (let k = 0; k <= nk; k++) for (let j = 0; j <= g.ny; j++) for (let i = 0; i <= g.nx; i++) {
    if (g.dim === 3) out[g.node(i, j, k)] = [i * g.h, j * g.h, k * g.h]; else out[g.node(i, j)] = [i * g.h, j * g.h];
  }
  return out;
}
