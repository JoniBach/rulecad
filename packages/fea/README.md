# @rulecad/fea

How far a flat part bends under load. Finite elements for a plate loaded in its own plane (plane stress) on a grid
of square cells, each with its own stiffness. Plain JavaScript in typed arrays, no dependencies: it runs in browsers
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

- **Cells:** 4-node squares (bilinear, integrated at 2 × 2 Gauss points). Each cell's density, 0 to 1, scales its
  stiffness (by `density ** penal`), so the same code analyses a part, a part filling only some of its thickness, and
  a topology optimisation's in-between designs.
- **Solvers:** `direct`, a banded Cholesky factorisation (exact; quick for 2D grids up to about 100,000 cells), or
  `cg`, conjugate gradients that never assemble the matrix (for bigger grids, and what faster backends speed up).
- **Backends:** the few operations `cg` repeats (the stiffness product, its diagonal, dot products) sit behind a small
  interface. `jsBackend`, plain JavaScript in 64-bit floats, is the reference; a WebGPU or TensorFlow.js backend
  implements the same and passes `backend-suite.mjs` in this repository.

Tested against beam theory: a cantilever's tip moves within 1% of `F L³ / 3 E I`.

## Sources

- Andreassen, Clausen, Schevenels, Lazarov, Sigmund (2011). Efficient topology optimization in MATLAB using 88 lines
  of code. *Structural and Multidisciplinary Optimization* 43, 1–16.
- Cook, Malkus, Plesha, Witt (2002). *Concepts and Applications of Finite Element Analysis*, 4th ed. Wiley.
