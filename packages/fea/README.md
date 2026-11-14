# @rulecad/fea

How far a part bends under load. Finite elements on a grid of cells, each with its own stiffness: flat parts loaded
in their own plane (2D, plane stress, square cells) and solid parts (3D, cubes). Plain JavaScript in typed arrays, no dependencies: it runs in browsers
and Node alike. Units are millimetres and newtons, so Young's modulus is in MPa and movement in mm.

Frames of beams joined at nodes have their own solver, `@rulecad/fea/frame`: see [Frames of beams](#frames-of-beams).

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
r.thin;            // { share, cells }: how much of the part is in members under 4 cells thick (thinShare), where a cell's stiffness is rough
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
  6.8 ms on seven threads against 19 ms on one, and an optimisation step about a third of the time. It needs Node 22
  or later: on Node 20 a product now and then came out wrong when the workers let go of an old operator's shared
  memory (a few solves in sixty, more with more threads, none on Node 22 or 24), so there it is plain JavaScript
  under another name (its `name` says so).

Tested against beam theory: a cantilever's tip moves within 1% of `F L³ / 3 E I` in 2D, and within 2% in 3D.
Multigrid is tested against the direct solver with stiffnesses a millionfold apart.

**How fine a grid.** The cells are exact for a part that only stretches, and converge on beam theory with shear
(Timoshenko's) as they shrink. What matters is how many cells cross the depth of whatever bends:

| Cells through the depth | Too stiff by |
|---|---|
| 1 | about 32% |
| 2 | about 11% |
| 4 | about 3% |
| 10 | under 1% |

So give every member that bends at least four cells, and check a final shape on cells half the size: if the
stiffness moves by more than a few percent, the grid was too coarse. (Measured on cantilevers and a simply supported
beam, in 2D and 3D.)

## Frames of beams

`@rulecad/fea/frame` solves a frame as beams joined at nodes: how far it moves under load, what each beam carries,
the load at which it buckles and the frequencies it rings at. A frame of aluminium extrusion or tube would need
millions of cubes, nearly all of them empty; as beams it has a few hundred unknowns and solves in milliseconds, so a
machine's frame can be checked at every pose. It is its own entry of the package, with no dependencies, and runs in
browsers and Node alike.

```js
import { frame, subdivide } from '@rulecad/fea/frame';

const model = {
  nodes: { footA: [0, 0, 0], topA: [0, 0, 400], topB: [600, 0, 400], footB: [600, 0, 0] },   // mm
  sections: { bar2020: { A: 400, Iy: 13333, Iz: 13333, J: 22500, Asy: 333, Asz: 333, cy: 10, cz: 10 } },
  materials: { aluminium: { E: 69000, nu: 0.33, density: 2.7 } },
  elements: [
    { id: 'legA', a: 'footA', b: 'topA', section: 'bar2020', material: 'aluminium' },
    { id: 'beam', a: 'topA', b: 'topB', section: 'bar2020', material: 'aluminium', ends: { a: { ry: 2e6, rz: 2e6 }, b: { ry: 2e6, rz: 2e6 } } },
    { id: 'legB', a: 'footB', b: 'topB', section: 'bar2020', material: 'aluminium' },
  ],
  supports: { footA: 'fixed', footB: 'fixed' },
  loads: [{ node: 'topA', force: [50, 0, 0] }, { element: 'beam', spread: [0, 0, -0.2] }],
  gravity: [0, 0, -9.81],
  masses: { topB: 1.5 },
};

const f = frame(model);                  // read, checked and factorised once
const s = f.statics();
s.displacements.topA;                    // [x, y, z, rx, ry, rz]: 0.40 mm sideways
s.reactions.footA;                       // the force (N) and moment (N·mm) the support gives the frame
s.elements[1].peak.My;                   // { value, x }: the beam's largest moment about its own y, and where along it
s.elements[1].stress.peak;               // 5.6 MPa
const fine = frame(subdivide(model, 4)); // every member in four pieces, for buckling and modes
fine.buckling().factors[0];              // 181: the loads times this buckle the frame
fine.modes({ count: 3 }).frequencies;    // [26.7, 36.6, 66.9] Hz
```

**The model** is plain data, so an assembly can write it and a file can hold it.

| Part | Shape | Notes |
|---|---|---|
| `nodes` | `{ name: [x, y, z] }`, or a list of positions named by place | mm |
| `elements` | `[{ id, a, b, section, material, roll, up, ends }]` | From node `a` to node `b`. `section` and `material` are objects, or names in the model's `sections` and `materials` |
| a section | `{ A, Iy, Iz, J, Asy, Asz, cy, cz }` | Area (mm²); second moments about the element's own y and z, and the torsion constant (mm⁴); shear areas (mm², leave out for no shear deformation); the distances to the furthest fibre along y and z (mm), or the section moduli `Wy` and `Wz` (mm³), for stress |
| a material | `{ E, nu, density }` | MPa; Poisson's ratio (or `G` in MPa); g/cm³, as the kit's material rule sets give it |
| `ends` | `{ a, b }`, each `'rigid'`, `'pinned'`, `'ball'` or `{ rx, ry, rz }` | How each end is joined to its node: each rotation `'rigid'`, `'free'`, or a spring's stiffness in N·mm/rad, about the element's own axes. `'pinned'` frees both bending rotations and still carries twist; `'ball'` frees all three |
| `supports` | `{ node: 'fixed' }`, `'pinned'`, or `{ x, y, z, rx, ry, rz }` | Each freedom `true` (held), left out (free), or a spring to ground in N/mm or N·mm/rad |
| `loads` | `{ node, force, moment }` or `{ element, spread, axes }` | N and N·mm in global axes; a spread load is N per mm of the element's length, in `'global'` axes or the element's `'local'` ones |
| `gravity` | `[0, 0, -9.81]` | N/kg, the same number as m/s². It acts on every element's mass and every lumped mass |
| `masses` | `{ node: kg }` | Lumped masses: weight under gravity, inertia in modes |

**An element's own axes.** x runs from `a` to `b`. z is the part of `up` square to the element, and `up` is global
+Z unless the element gives another (for an element along Z it is global +X). y = z × x. `roll`, in degrees, then
turns y and z about x. `Iy` resists bending that moves the beam along its z, `Iz` along its y. Every element's
result carries its `axes`, so nothing has to be guessed.

**What each solve returns.**

- `frame(model, { shear })` reads and checks the model, assembles and factorises it, and returns `{ statics,
  buckling, modes, freedoms, nodes }`. `shear: false` ignores the shear areas. `statics(model)`, `buckling(model)`
  and `modes(model)` do it in one call.
- `statics({ loads, gravity, masses, samples })`: `displacements` and `reactions` by node, each `[x, y, z, rx, ry,
  rz]` in global axes; `deflection: { most, node }`; and `elements`, each with its `length`, `axes`, the `ends`
  forces its nodes put on it (local axes), `axial` (its mean axial force, tension positive), and `along`: at each
  station `x`, the axial force `N`, shears `Vy` and `Vz`, torque `T`, moments `My` and `Mz`, and the movement `d`
  in global axes. The stations are `samples` evenly spaced (11) plus the points where each moment peaks, so `peak`
  (each quantity's largest value and where) is exact for the loads supported. `stress` is the largest
  `|N|/A + |My|/Wy + |Mz|/Wz` along the element, in MPa, where it is, and the bending part alone. Given other
  loads, it solves another load case on the same factorisation.
- `buckling({ count })`: `factors`, lowest first, and `modes`, each `{ factor, shape }`: the loads times the factor
  buckle the frame into the shape (by node, largest movement 1). `statics` is the solve it came from. The first
  factor is always quick; more of them cost more when slender members are in tension.
- `modes({ count })`: `frequencies` in Hz, lowest first, and `modes`, each `{ frequency, shape }`.
- `subdivide(model, pieces)` cuts every element into equal pieces. One element cannot bow between its own ends, so
  buckling and modes want members in pieces: a pinned column's Euler load is 22% out with one element, 0.8% with
  two and 0.05% with four. Statics is exact with one.

**Refusals.** What is wrong with a model is said by name before any solve, as an `Error` with a `code`: a node
that does not exist (`fea.frame.node`), an element of no length (`fea.frame.length`), a section property that is
not above 0 (`fea.frame.section`), a material (`fea.frame.material`), an `up` along the element
(`fea.frame.axes`), a joint or support it cannot read (`fea.frame.join`, `fea.frame.support`), a load or mass
(`fea.frame.load`, `fea.frame.mass`), nothing held (`fea.frame.unheld`), a mechanism (`fea.frame.mechanism`, with
`loose`: the freedoms nothing resists, by node), and buckling with nothing in compression
(`fea.frame.compression`). A node that every element end is pinned to has rotations nothing turns: they are held
still and reported as 0, and a moment put on one is refused.

**Units.** mm, N, MPa, rad, N·mm; springs in N/mm and N·mm/rad; masses in kg, densities in g/cm³, gravity in N/kg;
frequencies in Hz. In the modal solve stiffness is N/mm and mass kg. A newton is a kg·m/s² and lengths are mm, so
N/mm ÷ kg = 1000 s⁻²: the frequency is `√(1000 λ) / 2π`, with λ the eigenvalue of the stiffness against the mass
in kg. A test holds this against the textbook formula worked in SI units.

**Formulas.** Each bending plane of an element has the freedoms `[v1, θ1, v2, θ2]`, with L its length and ξ = x/L.

| What | Formula | Source |
|---|---|---|
| Shear parameter | `Φ = 12 E I / (G As L²)`, one for each bending plane; 0 with no shear area, which is Euler-Bernoulli's beam | Przemieniecki, eq. 5.116 |
| Bending stiffness | `E I / ((1 + Φ) L³) × [[12, 6L, −12, 6L], [6L, (4 + Φ) L², −6L, (2 − Φ) L²], [−12, −6L, 12, −6L], [6L, (2 − Φ) L², −6L, (4 + Φ) L²]]` | Przemieniecki, eq. 5.116 |
| Stretch and twist | `(E A / L) × [[1, −1], [−1, 1]]` and `(G J / L) × [[1, −1], [−1, 1]]` | Przemieniecki, chapter 5 |
| Shape functions | Deflection `N = [2ξ³ − 3ξ² − Φξ + 1 + Φ, L (ξ³ − (2 + Φ/2) ξ² + (1 + Φ/2) ξ), −(2ξ³ − 3ξ² − Φξ), L (ξ³ − (1 − Φ/2) ξ² − (Φ/2) ξ)] / (1 + Φ)`; the section's rotation `R = [6 (ξ² − ξ) / L, 3ξ² − (4 + Φ) ξ + 1 + Φ, −6 (ξ² − ξ) / L, 3ξ² − (2 − Φ) ξ] / (1 + Φ)` | Friedman and Kosmatka |
| Geometric stiffness | `P ∫ N′ᵀ N′ dx` for an axial force P, tension positive. With Φ = 0: `(P / 30 L) × [[36, 3L, −36, 3L], [3L, 4L², −3L, −L²], [−36, −3L, 36, −3L], [3L, −L², −3L, 4L²]]` | McGuire, Gallagher and Ziemian, chapter 9; Cook et al. |
| Consistent mass | `ρ A ∫ Nᵀ N dx + ρ I ∫ Rᵀ R dx` (the second term is rotary inertia). With Φ = 0 the first is `(ρ A L / 420) × [[156, 22L, 54, −13L], [22L, 4L², 13L, −3L²], [54, 13L, 156, −22L], [−13L, −3L², −22L, 4L²]]`; stretch and twist are `(ρ A L / 6) × [[2, 1], [1, 2]]` and the same with `Iy + Iz` for A | Przemieniecki, chapter 11; Cook et al. |
| A spread load w | End forces `w L / 2` and end moments `± w L² / 12`; the deflection between the ends adds `w x² (L − x)² / 24 E I + w x (L − x) / 2 G As` | Roark's, table 8.1 |
| A spring k or a release (k = 0) at an end | With s the sprung rotations: `K − K_s (K_ss + k)⁻¹ K_sᵀ`, and loads `f − K_s (K_ss + k)⁻¹ f_s`. Exact, and nothing is subtracted from a large number however stiff the spring | Static condensation: Cook et al.; member releases and semi-rigid joints: McGuire, Gallagher and Ziemian |
| Mass and geometric stiffness behind a spring or release | `Tᵀ M T` with `T = I − E_s (K_ss + k)⁻¹ K_sᵀ`: the beam's end follows its nodes as it would at rest | Guyan |
| Buckling | `(K + λ Kg) φ = 0`, Kg from each element's mean axial force in the static solve | McGuire, Gallagher and Ziemian, chapter 9 |
| Modes | `K φ = ω² M φ`, frequency `ω / 2π` | Przemieniecki, chapter 12; Bathe, chapter 11 (subspace iteration) |
| Forces along an element | From the forces F on end a and the spread load w: `N = −(Fx + wx x)`, `Vy = −(Fy + wy x)`, `My = −(My_a + Fz x + wz x² / 2)`, `Mz = −Mz_a + Fy x + wy x² / 2`: the part of the beam beyond x acting on the part before it | Statics |
| Stress | `abs(N) / A + abs(My) / Wy + abs(Mz) / Wz`, with `Wy = Iy / cz` and `Wz = Iz / cy` | Roark's, chapter 8 |

The matrix is stored row by row from each row's first non-zero to its diagonal, with the nodes ordered to keep
rows short (reverse Cuthill-McKee), and factorised by Cholesky. Buckling and modes use subspace iteration with the
small problems solved by Jacobi rotations; buckling first brackets its lowest factor between a shift that
factorises and one that does not, so factors of the loads reversed are never taken for it.

**Tested** against closed forms, each within 1%, most to rounding: a cantilever's tip deflection and rotation
with and without shear; a simply supported and a fixed-fixed beam under a spread load; a portal frame's sway and
foot moments by slope-deflection; a bar's twist; Euler's load for pinned-pinned and fixed-free columns (0.003% with
eight elements), and Engesser's with shear; the first frequencies of a cantilever and a simply supported beam
(0.02% and 0.04%); a heavy tip mass as one mass on a spring; a cantilever on a sprung joint, `P L³ / 3 E I + P L²
/ k`, a stiff spring against rigid and a soft one against pinned; the same cantilever along every axis and rolled;
a two-bar truss. Against this package's voxel solver on a cantilever three times as long as deep, the tip agrees
within 2.7% (the voxels are the stiffer: eight cubes through the depth, and a root clamped over its whole face).
A braced box of 50 beams (108 unknowns) solves statically in about 3 ms on a laptop.

**Limits.**

- Linear and small-displacement: stiffness does not change as the frame moves, and buckling is the linear
  (eigenvalue) kind, an upper bound on what a real, imperfect frame carries.
- Prismatic, straight members joined at their centroids: no tapers, no curved members, no offsets or rigid ends at
  joints.
- Torsion is St Venant's only: no warping stiffness, so an open thin-walled section twists more here than it
  would. No shear lag.
- Buckling is by bending under axial force: no torsional or lateral-torsional buckling, and bending moments do not
  enter the geometric stiffness.
- Joint springs are rotational and linear, at element ends; a joint's play, slip and preload are outside it.
- Stress is axial plus bending at the extreme corner, right for rectangular sections and extrusions and on the
  safe side for round ones; shear and torsion stresses are left out, as is anything local to a joint or a hole.
- Loads spread along an element are even along it; a load part-way along needs a node there. No temperature loads
  and no moved supports.
- Behind a spring or a release, mass and geometric stiffness are reduced as at rest (Guyan's reduction), which
  is why buckling and modes want members cut into pieces.

## Sources

- Amir, Aage, Lazarov (2014). On multigrid-CG for efficient topology optimization. *Structural and Multidisciplinary
  Optimization* 49, 815–829.
- Andreassen, Clausen, Schevenels, Lazarov, Sigmund (2011). Efficient topology optimization in MATLAB using 88 lines
  of code. *Structural and Multidisciplinary Optimization* 43, 1–16.
- Bathe (2014). *Finite Element Procedures*, 2nd ed. K. J. Bathe, Watertown.
- Blevins (1979). *Formulas for Natural Frequency and Mode Shape*. Van Nostrand Reinhold.
- Cook, Malkus, Plesha, Witt (2002). *Concepts and Applications of Finite Element Analysis*, 4th ed. Wiley.
- Cuthill, McKee (1969). Reducing the bandwidth of sparse symmetric matrices. *Proceedings of the 24th National
  Conference of the ACM*, 157–172.
- Friedman, Kosmatka (1993). An improved two-node Timoshenko beam finite element. *Computers and Structures* 47,
  473–481.
- Guyan (1965). Reduction of stiffness and mass matrices. *AIAA Journal* 3, 380.
- McGuire, Gallagher, Ziemian (2000). *Matrix Structural Analysis*, 2nd ed. Wiley.
- Przemieniecki (1968). *Theory of Matrix Structural Analysis*. McGraw-Hill.
- Timoshenko, Gere (1961). *Theory of Elastic Stability*, 2nd ed. McGraw-Hill.
- Young, Budynas (2002). *Roark's Formulas for Stress and Strain*, 7th ed. McGraw-Hill.
