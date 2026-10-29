# @rulecad/fea

How far a part bends under load. Finite elements on a grid of cells, each with its own stiffness: flat parts loaded
in their own plane (2D, plane stress, square cells) and solid parts (3D, cubes). Plain JavaScript in typed arrays, no dependencies: it runs in browsers
and Node alike. Units are millimetres and newtons, so Young's modulus is in MPa and movement in mm.

```js
import { grid, analyse } from '@rulecad/fea';

const g = grid({ nx: 100, ny: 10, h: 1 });          // 100 × 10 cells of 1 mm
const fixed = new Uint8Array(g.dofs), load = new Float64Array(g.dofs);
for (let j = 0; j <= 10; j++) { fixed[2 * g.node(0, j)] = 1; fixed[2 * g.node(0, j) + 1] = 1; } // hold the left edge
load[2 * g.node(100, 5) + 1] = -10;                 // 10 N down at the right end
const r = analyse({ grid: g, density: new Float64Array(1000).fill(1), material: { E: 2680, nu: 0.36 }, thickness: 5, fixed, loads: [load] });
r.u[0];            // each node's movement: x at 2n, y at 2n + 1
r.compliance[0];   // the load times how far it moved (N·mm): lower is stiffer
r.stress[0];       // each cell's von Mises stress (MPa)
r.deflection[0];   // { most, at }: the largest movement of solid material, and where
```

- **3D:** give the grid `nz` too (`grid({ nx, ny, nz, h })`) and every node has x, y and z.
- **Cells:** 4-node squares (bilinear, integrated at 2 × 2 Gauss points) or 8-node cubes (trilinear, 2 × 2 × 2). Each cell's density, 0 to 1, scales its
  stiffness (by `density ** penal`), so the same code analyses a part, a part filling only some of its thickness, and
  a topology optimisation's in-between designs.
- **Solvers:**
  - `direct`: a banded Cholesky factorisation. Exact; quick for 2D grids up to about 100,000 cells and small 3D ones.
  - `cg`: conjugate gradients with a diagonal preconditioner.
  - `mg`: conjugate gradients with a multigrid preconditioner, the default in 3D. Coarser grids halve each side. Each
    coarse cell's matrix is built from its children's exactly (Galerkin), so it stays accurate when cells'
    stiffnesses differ a millionfold, as they do in topology optimisation. A cantilever of 16,000 cubes takes 9
    iterations, where plain `cg` takes 371.
- **Solving again:** `solve(...)` returns `again(loads)`, which solves more right-hand sides on the same matrix,
  reusing its factorisation or preconditioner: an adjoint, for a gradient.
- **Stress at a point:** `centreStress(h, nu, dim)` is the matrix from a cell's movements to the stress at its centre
  (for Young's modulus 1), and `vonMises(s, dim, grad)` gives von Mises stress and, optionally, its gradient. Stress
  limits in @rulecad/topopt use both.
- **Backends:** the few operations `cg` repeats (the stiffness product, its diagonal, dot products) sit behind a small
  interface. `jsBackend`, plain JavaScript in 64-bit floats, is the reference; a WebGPU or TensorFlow.js backend
  implements the same and passes `backend-suite.mjs` in this repository. The matrix is assembled in blocks (a node's
  rows: a 3 × 3 block for each node it shares a cell with), so a product is a plain sweep, and multigrid's sweeps are
  symmetric Gauss-Seidel through those blocks.
- **Threads:** `import { threadsBackend } from '@rulecad/fea/threads'` (Node only) shares each product over the
  machine's cores (`FEA_THREADS` to say how many), the rest as `jsBackend`. On a 134,000-unknown grid a product takes
  6.8 ms on seven threads against 19 ms on one, and an optimisation step about a third of the time.

Tested against beam theory: a cantilever's tip moves within 1% of `F L³ / 3 E I` in 2D, and within 2% in 3D.
Multigrid is tested against the direct solver with stiffnesses a millionfold apart.

## Sources

- Amir, Aage, Lazarov (2014). On multigrid-CG for efficient topology optimization. *Structural and Multidisciplinary
  Optimization* 49, 815–829.
- Andreassen, Clausen, Schevenels, Lazarov, Sigmund (2011). Efficient topology optimization in MATLAB using 88 lines
  of code. *Structural and Multidisciplinary Optimization* 43, 1–16.
- Cook, Malkus, Plesha, Witt (2002). *Concepts and Applications of Finite Element Analysis*, 4th ed. Wiley.
