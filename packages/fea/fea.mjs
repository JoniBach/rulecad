// Finite elements for flat parts: how far a plate bends under load in its own plane (plane stress), on a grid of
// square cells, each with its own stiffness. Plain numbers in typed arrays, no dependencies: it runs in browsers and
// Node alike. Units are millimetres and newtons, so stiffness (Young's modulus) is in MPa (N/mm²) and displacement in mm.
//
// The grid: nx × ny square cells of side h, cell (i, j) with i along x and j along y, its lower-left corner at
// (i h, j h). Nodes are the cells' corners, two unknowns each (x and y displacement): dof 2n is node n's x, 2n + 1 its
// y. Nodes are numbered along the grid's shorter side, which keeps the stiffness matrix's band narrow.
//
// Two ways to solve: "direct" (banded Cholesky factorisation: exact, and quick for 2D grids up to about 100,000
// cells) and "cg" (conjugate gradients, never assembling the matrix: for big grids, and what faster backends speed up).
// The work cg repeats sits behind a backend, so a GPU can do it; plain JavaScript in 64-bit floats is the reference.

/** @typedef {{ nx: number, ny: number, h: number }} GridSize cells along x and y, and their side in mm */
/** @typedef {GridSize & { nodes: number, dofs: number, edof: Int32Array, node: (i: number, j: number) => number }} Grid */
/** @typedef {{ E: number, nu: number }} Material Young's modulus (MPa) and Poisson's ratio */

/**
 * A grid of square cells, with each cell's eight unknowns (its corners counter-clockwise from lower left, x then y).
 * @param {GridSize} size
 * @returns {Grid}
 */
export function grid({ nx, ny, h = 1 }) {
  if (!(nx >= 1 && ny >= 1 && Number.isInteger(nx) && Number.isInteger(ny))) throw new Error(`a grid needs whole numbers of cells (got ${nx} × ${ny})`);
  const alongY = ny <= nx; // number nodes along the shorter side
  const node = alongY ? (i, j) => i * (ny + 1) + j : (i, j) => j * (nx + 1) + i;
  const edof = new Int32Array(nx * ny * 8);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const e = j * nx + i, corners = [node(i, j), node(i + 1, j), node(i + 1, j + 1), node(i, j + 1)];
    for (let k = 0; k < 4; k++) { edof[e * 8 + 2 * k] = 2 * corners[k]; edof[e * 8 + 2 * k + 1] = 2 * corners[k] + 1; }
  }
  const nodes = (nx + 1) * (ny + 1);
  return { nx, ny, h, nodes, dofs: 2 * nodes, edof, node };
}

// The strain-displacement matrix of a square cell of side h at natural coordinates (s, t), 3 × 8, row by row
function strains(s, t, h) {
  const corner = [[-1, -1], [1, -1], [1, 1], [-1, 1]], B = new Float64Array(24);
  for (let k = 0; k < 4; k++) {
    const [a, b] = corner[k], dx = (a * (1 + b * t)) / 4 * (2 / h), dy = (b * (1 + a * s)) / 4 * (2 / h);
    B[2 * k] = dx; B[8 + 2 * k + 1] = dy; B[16 + 2 * k] = dy; B[16 + 2 * k + 1] = dx;
  }
  return B;
}
// Plane stress: stress from strain for Young's modulus 1
const elasticity = (nu) => { const f = 1 / (1 - nu * nu); return [f, f * nu, 0, f * nu, f, 0, 0, 0, f * (1 - nu) / 2]; };

/**
 * A square cell's stiffness matrix (8 × 8, row by row) for Young's modulus 1 and thickness 1: the same for any cell
 * size. Integrated with 2 × 2 Gauss points, as for any bilinear element.
 * @param {number} nu Poisson's ratio
 * @returns {Float64Array}
 */
export function cellStiffness(nu) {
  const D = elasticity(nu), K = new Float64Array(64), g = 1 / Math.sqrt(3), area = 1 / 4; // h = 1: the Jacobian is 1/4
  for (const s of [-g, g]) for (const t of [-g, g]) {
    const B = strains(s, t, 1);
    for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) {
      let sum = 0;
      for (let p = 0; p < 3; p++) for (let q = 0; q < 3; q++) sum += B[p * 8 + a] * D[p * 3 + q] * B[q * 8 + b];
      K[a * 8 + b] += sum * area;
    }
  }
  return K;
}

/**
 * The plain JavaScript backend: the operations conjugate gradients repeats, on Float64Arrays. Another backend (WebGPU,
 * TensorFlow.js) provides the same and is tested against this one.
 * @type {{ name: string, precision: number, operator: (g: Grid, ke: Float64Array) => { multiply: (scale: Float64Array, x: Float64Array, y: Float64Array) => void, diagonal: (scale: Float64Array, d: Float64Array) => void }, dot: (a: Float64Array, b: Float64Array) => number, axpy: (a: number, x: Float64Array, y: Float64Array) => void }}
 */
export const jsBackend = {
  name: 'js',
  precision: 64,
  operator(g, ke) {
    const { edof } = g, cells = g.nx * g.ny, u = new Float64Array(8);
    return {
      // y = K x, K the stiffness of every cell scaled by scale[cell] (its modulus times thickness)
      multiply(scale, x, y) {
        y.fill(0);
        for (let e = 0; e < cells; e++) {
          const s = scale[e], o = e * 8;
          if (s === 0) continue;
          for (let a = 0; a < 8; a++) u[a] = x[edof[o + a]];
          for (let a = 0; a < 8; a++) {
            let f = 0;
            for (let b = 0; b < 8; b++) f += ke[a * 8 + b] * u[b];
            y[edof[o + a]] += s * f;
          }
        }
      },
      diagonal(scale, d) {
        d.fill(0);
        for (let e = 0; e < cells; e++) for (let a = 0; a < 8; a++) d[edof[e * 8 + a]] += scale[e] * ke[a * 9];
      },
    };
  },
  dot(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; },
  axpy(a, x, y) { for (let i = 0; i < y.length; i++) y[i] += a * x[i]; },
};

/**
 * Solve K u = f for each load. K is every cell's stiffness (cellStiffness) times scale[cell]; fixed dofs don't move.
 * @param {Grid} g
 * @param {{ scale: Float64Array, ke: Float64Array, fixed: Uint8Array, loads: Float64Array[], method?: 'direct' | 'cg', backend?: typeof jsBackend, tol?: number, maxIter?: number, start?: Float64Array[] }} o
 *   start: a first guess for cg (the last solution, when solving again after a small change)
 * @returns {{ u: Float64Array[], iterations: number }}
 */
export function solve(g, { scale, ke, fixed, loads, method = 'direct', backend = jsBackend, tol = 1e-9, maxIter = 20000, start }) {
  if (scale.length !== g.nx * g.ny) throw new Error(`scale has ${scale.length} values for ${g.nx * g.ny} cells`);
  if (!fixed.some((f) => f)) throw new Error('nothing is held: fix at least one support, or the part just moves');
  const f = loads.map((l) => { const c = Float64Array.from(l); for (let i = 0; i < c.length; i++) if (fixed[i]) c[i] = 0; return c; });
  if (method === 'direct') {
    const L = factor(g, scale, ke, fixed);
    return { u: f.map((b) => L.solve(b)), iterations: 0 };
  }
  return conjugateGradients(g, { scale, ke, fixed, loads: f, backend, tol, maxIter, start });
}

// The banded Cholesky factor of K: K's lower band (half-bandwidth b) assembled, then factored in place
function factor(g, scale, ke, fixed) {
  const { edof, dofs } = g, cells = g.nx * g.ny;
  let b = 0;
  for (let e = 0; e < cells; e++) {
    let lo = Infinity, hi = -Infinity;
    for (let a = 0; a < 8; a++) { lo = Math.min(lo, edof[e * 8 + a]); hi = Math.max(hi, edof[e * 8 + a]); }
    b = Math.max(b, hi - lo);
  }
  const w = b + 1, L = new Float64Array(dofs * w); // L[i][j] (j ≤ i, i - j ≤ b) at i * w + b - i + j: a row's band in order
  for (let e = 0; e < cells; e++) {
    const s = scale[e];
    for (let p = 0; p < 8; p++) {
      const i = edof[e * 8 + p];
      if (fixed[i]) continue;
      for (let q = 0; q < 8; q++) {
        const j = edof[e * 8 + q];
        if (j > i || fixed[j]) continue;
        L[i * w + b - i + j] += s * ke[p * 8 + q];
      }
    }
  }
  for (let i = 0; i < dofs; i++) if (fixed[i]) L[i * w + b] = 1;
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

// Jacobi-preconditioned conjugate gradients, matrix-free: fixed dofs stay at 0 (their rows act as the identity)
function conjugateGradients(g, { scale, ke, fixed, loads, backend, tol, maxIter, start }) {
  const op = backend.operator(g, ke), n = g.dofs, d = new Float64Array(n);
  op.diagonal(scale, d);
  for (let i = 0; i < n; i++) d[i] = fixed[i] || !(d[i] > 0) ? 1 : 1 / d[i];
  const apply = (x, y) => { op.multiply(scale, x, y); for (let i = 0; i < n; i++) if (fixed[i]) y[i] = x[i]; };
  let total = 0;
  const u = loads.map((f, c) => {
    const x = start?.[c] ? Float64Array.from(start[c]) : new Float64Array(n);
    for (let i = 0; i < n; i++) if (fixed[i]) x[i] = 0;
    const r = new Float64Array(n), z = new Float64Array(n), p = new Float64Array(n), q = new Float64Array(n);
    apply(x, q);
    for (let i = 0; i < n; i++) r[i] = f[i] - q[i];
    const limit = tol * Math.sqrt(backend.dot(f, f));
    for (let i = 0; i < n; i++) p[i] = z[i] = d[i] * r[i];
    let rz = backend.dot(r, z), it = 0;
    while (Math.sqrt(backend.dot(r, r)) > limit && it < maxIter) {
      apply(p, q);
      const a = rz / backend.dot(p, q);
      backend.axpy(a, p, x); backend.axpy(-a, q, r);
      for (let i = 0; i < n; i++) z[i] = d[i] * r[i];
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

/**
 * Each cell's von Mises stress (MPa) at its centre, from a solution u.
 * @param {Grid} g @param {Float64Array} u @param {Float64Array} modulus each cell's Young's modulus (MPa) @param {number} nu
 * @returns {Float64Array}
 */
export function stress(g, u, modulus, nu) {
  const B = strains(0, 0, g.h), D = elasticity(nu), out = new Float64Array(g.nx * g.ny);
  for (let e = 0; e < out.length; e++) {
    const strain = [0, 0, 0];
    for (let p = 0; p < 3; p++) for (let a = 0; a < 8; a++) strain[p] += B[p * 8 + a] * u[g.edof[e * 8 + a]];
    const [sx, sy, txy] = [0, 1, 2].map((p) => modulus[e] * (D[p * 3] * strain[0] + D[p * 3 + 1] * strain[1] + D[p * 3 + 2] * strain[2]));
    out[e] = Math.sqrt(sx * sx - sx * sy + sy * sy + 3 * txy * txy);
  }
  return out;
}

/**
 * Analyse a plate: each cell's density (0 empty to 1 solid; Young's modulus scales with density^penal, never below
 * E × 1e-9 so empty cells don't leave the matrix singular), its thickness, supports and loads.
 * @param {{ grid: Grid, density: Float64Array, material: Material, thickness: number, fixed: Uint8Array, loads: Float64Array[], penal?: number, method?: 'direct' | 'cg', backend?: typeof jsBackend }} o
 * @returns {{ u: Float64Array[], compliance: number[], stress: Float64Array[], deflection: { most: number, at: [number, number] }[] }}
 *   compliance: f · u per load (N·mm): the work the load does; lower is stiffer. deflection: the largest movement
 *   of any node in solid material, and where.
 */
export function analyse({ grid: g, density, material, thickness, fixed, loads, penal = 1, method = 'direct', backend }) {
  const { E, nu } = material, Emin = E * 1e-9, ke = cellStiffness(nu);
  const modulus = Float64Array.from(density, (x) => Emin + Math.pow(x, penal) * (E - Emin));
  const scale = modulus.map((m) => m * thickness);
  const { u } = solve(g, { scale, ke, fixed, loads, method, backend });
  const solidNode = new Uint8Array(g.nodes);
  for (let e = 0; e < density.length; e++) if (density[e] >= 0.5) for (let k = 0; k < 4; k++) solidNode[g.edof[e * 8 + 2 * k] / 2] = 1;
  const position = positions(g);
  return {
    u,
    compliance: u.map((x, c) => jsBackend.dot(loads[c], x)),
    stress: u.map((x) => stress(g, x, modulus, nu)),
    deflection: u.map((x) => {
      let most = 0, at = [0, 0];
      for (let n = 0; n < g.nodes; n++) if (solidNode[n]) {
        const m = Math.hypot(x[2 * n], x[2 * n + 1]);
        if (m > most) { most = m; at = position[n]; }
      }
      return { most, at };
    }),
  };
}

/**
 * Each node's position in mm, [x, y], by node number.
 * @param {Grid} g
 * @returns {[number, number][]}
 */
export function positions(g) {
  const out = new Array(g.nodes);
  for (let j = 0; j <= g.ny; j++) for (let i = 0; i <= g.nx; i++) out[g.node(i, j)] = [i * g.h, j * g.h];
  return out;
}
