# @rulecad/fea

How far a part bends under load. Finite elements on a grid of cells, each with its own stiffness: flat parts loaded
in their own plane (2D, plane stress, square cells) and solid parts (3D, cubes). Plain JavaScript in typed arrays, no dependencies: it runs in browsers
and Node alike. Units are millimetres and newtons, so Young's modulus is in MPa and movement in mm.

Frames of beams joined at nodes have their own solver, `@rulecad/fea/frame`: see [Frames of beams](#frames-of-beams).
Which members such a frame should have, and how thick, is found by `@rulecad/fea/layout`: see
[Frame layout](#frame-layout-which-members-and-how-thick).

```js
import { grid, analyse } from '@rulecad/fea';

const g = grid({ nx: 100, ny: 10, h: 1 });          // 100 × 10 cells of 1 mm
const fixed = new Uint8Array(g.dofs), load = new Float64Array(g.dofs);
for (let j = 0; j <= 10; j++) { fixed[2 * g.node(0, j)] = 1; fixed[2 * g.node(0, j) + 1] = 1; } // hold the left edge
load[2 * g.node(100, 5) + 1] = -10;                 // 10 N down at the right end
const r = analyse({ grid: g, density: new Float64Array(1000).fill(1), material: { E: 2680, nu: 0.36 }, thickness: 5, fixed, loads: [load] });
r.u[0];            // each node's movement: x at 2n, y at 2n + 1
r.compliance[0];   // the load times how far it moved (N·mm): lower is stiffer
r.stress[0];       // each cell's von Mises stress (MPa) at its centre: reads bending stress low (see How fine a grid)
r.surface[0];      // each solid cell's von Mises stress (MPa) at the part's surface: use this for strength
r.findings;        // [{ level, text, code, values, at, box }]: a warning where the peak stress is in a member under 8 cells through
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
- **Stress at the surface:** `stress` is read at each cell's centre, half a cell inside the part. In bending the
  stress peaks at the surface, so in a member n cells through the centre stress reads low by about one cell's share:
  27 to 30% low at 4 cells, 10% at 10. `surface` (and `surfaceStress(g, u, modulus, nu, density)`, which also gives
  each node's value) reads each cell at its corners and averages each stress component over the solid cells round
  each node. At a corner it takes two thirds of what the cell's strains say and one third of the stress that
  reproduces the forces on the cell's corners: square cells bend a little too stiffly, so their strains alone read
  low (6% at 4 cells in 3D), and the second reading errs the other way by about twice as much. A cell under half
  density keeps its centre stress. `analyse` adds a warning to `findings` (code `fea.coarse-stress`) for each load
  whose peak surface stress is in a member under 8 cells through, counted along the direction the stress changes
  fastest there. At a sharp inside corner, or a curved edge stepped into cells, the peak keeps rising as cells shrink:
  the stress concentrates there beyond what any grid settles on, so read it with care (a real part has a fillet).
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

Tested against beam theory with shear (Timoshenko's, `F L³ / 3 E I + F L / κ G A`): a cantilever's tip moves within
1% of it in 2D at 10 cells through, and within 3% in 3D at 8, never more. The surface stress of a cantilever 4, 8 or
10 cells deep is tested within 5% of `M c / I` at mid-span and a beam's depth from the support, in 2D and 3D (it
comes within 2%); right at a clamped edge the stress concentrates, and beam theory doesn't hold.
Multigrid is tested against the direct solver with stiffnesses a millionfold apart.

**How fine a grid.** The cells are exact for a part that only stretches, and converge on beam theory with shear
(Timoshenko's) as they shrink. What matters is how many cells cross the depth of whatever bends:

| Cells through the depth | Too stiff by | `stress` (cell centres) reads low by | `surface` is out by |
|---|---|---|---|
| 1 | about 32% | about 94% | about 24% low |
| 2 | about 11% | about 55% | about 5% low |
| 4 | about 3% (4% in 3D) | about 27% (29% in 3D) | under 1% |
| 8 | about 1% | about 13% | about 1% high |
| 10 | under 1% | about 10% | about 1% high |
| 20 | under 0.5% | about 5% | under 1% high |

So give every member that bends at least four cells, read its strength from `surface`, not `stress`, and check a
final shape on cells half the size: if the stiffness or the peak stress moves by more than a few percent, the grid
was too coarse. (Stiffness measured on cantilevers and a simply supported beam, in 2D and 3D; stress on a cantilever
100 × 10 mm at mid-span, against `M c / I`, in 2D, and in 3D where they differ.)

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
  buckling, modes, freedoms, nodes, loose, mechanisms }`. `shear: false` ignores the shear areas. `statics(model)`, `buckling(model)`
  and `modes(model)` do it in one call. A model with `loose: 'hold'` is solved even where part of it can move with
  nothing resisting (a frame in one plane on pinned feet sways out of that plane; a beam pinned at both ends spins on
  its axis): each such freedom is held, `loose` names it by node, `mechanisms` gives the way the frame moves there
  (each node's six, its largest movement 1: the portal's feet still and its top moving across its plane), and a solve whose loads would do work moving the
  frame that way is refused (`fea.frame.mechanism`, with `driven: true`). The modes count those freedoms free:
  each way that moves mass unresisted comes back as a mode of 0 Hz, marked `free: true`, and the rest are the
  frame's own, whichever freedom was held. They are the modes of `K + s M` (s the held frame's lowest eigenvalue),
  which has the same shapes as `K` against `M` with every eigenvalue raised by s. Buckling gives a factor of 0 when
  the loads lean the frame the way it is free (its squeezed members turning with it, `vᵀ B v > 0` for that way v,
  B the geometric stiffness's negative): the frame tips over under any share of its loads before anything buckles,
  and `tipped` names the freedoms. When the loads pull it back (a frame hanging from its pins), the factors are of
  the frame held there, so they can only be higher than the true ones, and `rests` names the freedoms. When the
  loads leave that way alone (a strut spinning on its axis), the factors are exact.
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
- `modes({ count })`: `frequencies` in Hz, lowest first, and `modes`, each `{ frequency, shape }` (and `free: true`
  on a mode of 0 Hz where the frame moves with nothing resisting).
- `sizing(model, o)`: each group of members given the lightest section from a list that meets limits on
  deflection, stress, buckling and frequency (below).
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

### Sizing: the lightest sections that meet the limits

`sizing(model, o)` chooses a section for each group of members (members that must match: a pair of rails, four
posts) from a list, so the frame meets its limits for the least mass, or the least cost where every choice gives
one. Each design is the same frame with its groups' sections, materials and rolls changed, solved under every load
case. A frame of tubes from a layout optimiser and a frame of extrusions from an assembly go through the same solver
and the same limits.

```js
import { sizing } from '@rulecad/fea/frame';

const bar = (b) => ({ name: `bar ${b}`, section: { A: b * b, Iy: b ** 4 / 12, Iz: b ** 4 / 12, J: 0.141 * b ** 4, cy: b / 2, cz: b / 2 },
  material: { E: 70000, nu: 0.33, density: 2.7, strength: 205 } });
// model: a table, four 700 mm legs on pinned feet and a ring of rails 600 x 400 mm joined rigidly, its own weight
// and 20 kg at the middle of each long rail (nodes m1 and m2)
const r = sizing(model, {
  groups: { legs: ['z1', 'z2', 'z3', 'z4'], rails: ['x1', 'x2'], ends: ['y1', 'y2'] },   // by element id, or by `of`
  choices: [10, 15, 20, 25, 30].map(bar),
  limits: { deflection: [{ node: 'm1', limit: 1.7 }, { node: 'm2', limit: 1.7 }], stress: { margin: 2 }, buckling: { factor: 2, euler: 1 } },
});
r.groups[1];  // { name: 'rails', choice: 'bar 20', mass: 1.296, lighter: 'bar 15',
              //   governs: { limit: 'deflection', where: 'm1', value: 0.92, allowed: 1.7, broken: 1.51 }, margin: 1.84 }
r.groups[0];  // { name: 'legs', choice: 'bar 10', lighter: null, governs: null }: the lightest in the list meets them
```

| Part | Shape | Notes |
|---|---|---|
| `groups` | `{ name: [members] }` | Each member an element's `id`, or the member its pieces came from (`of`). Members in no group keep their sections |
| `choices` | `[{ name, section, material, mass, cost, roll }]` | `material` its own (the member's if left out), with `strength` in MPa for the stress limit; `mass` and `cost` per metre (mass from the area and density if left out); `roll` degrees added to the member's roll, the same section turned (a 20 x 40 on edge) |
| `only` | `{ group: [choice names] }` | The choices a group may take (all of them if left out) |
| `fits` | `(design) => [{ where, why }]` | Whether a design's choices go together, given each group's choice by name: what does not (a join between two groups that one's choice cannot make with the other's), empty where it fits. A design that does not fit is never solved |
| `limits.deflection` | `[{ node, limit, along, cases }]` or `[{ member, limit, from, to, along, cases }]` | mm, along `along` (gravity's direction, else the whole movement); a member between two distances from its start; `cases` the load cases it holds in, by label (every case where left out) |
| `limits.stress` | `{ margin }` | Each member's peak `abs(N)/A + abs(My)/Wy + abs(Mz)/Wz`, times the margin, under its material's strength |
| `limits.buckling` | `{ factor, euler }` | The whole frame's first buckling factor at least `factor` (members cut into `pieces`, 4); with `euler` (the effective length factor K) each grouped member in compression also carries `factor` times its force under `π² E I / (K L)²`, I the lesser second moment |
| `limits.frequency` | `{ Hz }` | The lowest mode at least this |
| `cases` | `[{ label, loads, masses, inertia, gravity, limits }]` | Load cases: `loads` and `masses` as `statics` takes them; `inertia` masses whose weight is already in `loads` and which ring in the modes only; `gravity` the case's own (`[0, 0, 0]` for a side push alone); `limits` the limits it is held to by name (every one where left out) |
| a model list | `[frame, ...others]` | The others are the same frame joined other ways (its joins rigid), same elements in the same order: each is held to the stress limit too |

**The search.** With few designs (`every`, 512, or `search: 'every'`), every design is ranked by mass and solved in
that order until one meets every limit, which makes it the lightest; a design is dropped at the first stage
(statics, then buckling, then modes) that breaks a limit. With more, `search: 'steps'`: from every group at its
lightest, each group looks up its list for the lightest heavier choice that cuts the worst limit's use (passing over
one that is heavier but weaker this way, a 30 x 30 after a 20 x 40 on edge), and the group that cuts it most for its
added mass steps up to it, until the limits are met (a choice that does not fit the others' takes them along: the
lightest design from there in which they fit); then each group, the heaviest first, steps down as far as the limits allow, until nothing moves. Steps
solve far fewer designs and land near the lightest, not always on it (a table in the tests: within a fifth).

**What set each choice.** A group's `governs` is the limit its next lighter choice breaks with the other groups as
chosen, the worst there by `broken` (its use of the limit, over 1). A choice of the same weight (the same section
turned) is not lighter. `margin` is how many times inside that limit the chosen design is. A group at the lightest
choice has no `governs`, and its margin is its own members' nearest check. Where the next lighter choice does not go
with the others' (`fits` lists something), that set it: `governs` is `{ limit: 'fit', where, why, lighter }`, and the
margin is its own members' nearest check. Where no design meets the limits, `ok` is
false and the result is the design that came nearest, with `worst` saying which limit it breaks and by how much.

**Designs that fit.** With `fits`, only designs whose choices go together are solved: the steps start from the
lightest design that fits, found lightest first. Where none of the list's designs fits, sizing is refused
(`fea.frame.fit`, with the first thing that does not fit).

**Limits of sizing.** The geometry stays as drawn: a deeper section moves no node, so joints that hang off a
member's face by its width keep their drawn offsets. The search is over the list given; it does not invent a section.


## Frame layout: which members, and how thick

`@rulecad/fea/layout` designs a frame of tubes or bars from nothing but its loads and supports: given a cloud of
candidate nodes, it chooses which members to put between them, and how thick each must be, so the frame carries
every load case to its supports with the least material. A bike frame, a roll cage or a space frame is mostly empty,
so it is better designed as members joined at nodes than as millions of voxels. The members are pin-jointed and each
is as thick as its worst case's force over the strength (fully stressed); the frame that comes out is then sized
from tubes that can be bought (`layoutFrame` and `sizing`), and its joints shaped by the voxel optimiser
(`layoutJoints`).

```js
import { layout, layoutFrame, layoutJoints } from '@rulecad/fea/layout';
import { sizing } from '@rulecad/fea/frame';

const r = layout({
  nodes: { A: [0, 300], B: [0, -300], C: [400, 0] },  // mm; or a grid: { from, to, pitch }, or both
  supports: { A: 'pinned', B: 'pinned' },              // or { x: true, y: true, z: false }
  loads: [{ node: 'C', force: [0, -1000] }],           // N; or cases: [{ label, loads }, ...]
  strength: 100,                                       // MPa; or { tension, compression }
});
r.volume;      // 8333.3 mm³: two bars of 8.33 mm², 833 N each
r.members[0];  // { id: 'B-C', a: 'B', b: 'C', length: 500, area: 8.333, forces: [-833.3], kind: 'compression' }
const f = layoutFrame(r, { material: { E: 200000, nu: 0.3, density: 7.85, strength: 275 } });
const sized = sizing(f.model, { groups: { bars: f.members }, choices: tubes, cases: f.cases, limits: { stress: { margin: 2 }, buckling: { factor: 2, euler: 1 } } });
const joints = layoutJoints(r, { material: 's275' });  // [{ node: 'C', members, problem }]: a problem file for each joint
```

| Part of the problem | Shape | Notes |
|---|---|---|
| `nodes` | `{ name: [x, y] or [x, y, z] }` | Candidate nodes, mm (a list is named by place) |
| `grid` | `{ from, to, pitch }` | More candidates, every `pitch` mm across a box, named `"i,j"` or `"i,j,k"` by place; one within a hundredth of the pitch of a named node gives way to it |
| `supports` | `{ node: 'pinned' or { x, y, z } }` | Which movements are held at each |
| `loads` or `cases` | `[{ node, force }]` or `[{ label, loads }]` | One load case, or several, each carried alone with the same areas |
| `strength` | MPa, or `{ tension, compression }` | Each member's force over its area stays within it: give the material's strength over your margin |
| `density` | g/cm³ | For the mass, kg |
| `joint` | mm | A joint's cost as a length of member (0): above 0, fewer and longer members |
| `reach` | mm | The longest candidate member |
| `avoid` | `[{ at, r, through }]` | Balls (circles, flat) no node or member enters; with `through: true` members may pass and only nodes are kept out |
| `plane` | `true` or `false` | A flat layout in x and y; left out, flat when every node and load is at z = 0 |

Options: `keep` (members thinner than this share of the thickest are left out of `members`, 1e-4; the volume counts
them), `start` (each node's nearest candidates in the first programme: 8 flat, 18 in space), `add` (most members
added a round), `adding: false` (every candidate in one programme), `tolerance` (1e-5).

**What comes back.** `volume` (mm³), `mass` (kg, with a density), `members` (thickest first: area, each case's force,
tension positive, and `kind`), `nodes` (those the members meet at, with the loaded and supported ones), `candidates`
(the ground structure's members), `programme` (how many the last programme held), `rounds`, `strain` (the largest
virtual strain of any candidate over its limit: 1 at most, which proves no left-out member would lower the volume),
`left` (the volume share under `keep`) and `virtual` (each case's virtual displacements by node, the programme's
dual). With several cases the areas are unique but the forces in a case may not be (a member thicker than one case
needs can carry more or less in it): `members[].forces` is one set the strengths allow. For the forces the built frame
will carry, solve it (`layoutFrame`, then `frame().statics`) and give them to `layoutJoints`.

**Handing it on.** `layoutFrame(result, { material, section, ends })` is the layout as a frame model, each member a
solid round bar of its area (or `section`), joints `'rigid'` (welded, the default) or `'pinned'`, a flat layout held
out of its plane at its supports, and `cases` as `sizing` takes them. `layoutJoints(result, { material, diameters,
forces, stub, cell, volume, nodes })` gives each joint (every node where two members or more meet, or those named) as
a problem file in the form `cad optimise` reads: a space round the node, each member a stub `stub` mm long (twice the
widest diameter), the stub carrying the most held (the frame beyond it) and the others loaded with their forces in
each case, plus any outside load at the node. A flat layout's joints are flat problems as thick as the widest tube.

**How it works.** Every pair of candidate nodes is a member unless it passes through a third node (two shorter ones
do the same), is longer than `reach` or enters an avoided ball. The least volume is a linear programme in the areas
and the forces; it is solved by a primal-dual interior point method, the normal equations' members' rows eliminated
first so the dense matrix is only the equilibrium rows (free freedoms times cases). The first programme holds each
node's nearest candidates. Its dual is a virtual displacement field; any left-out member it would strain past its
limit would lower the volume, so the most strained are added and the programme solved again, until none is. The
answer is then the least over every candidate (the `strain` figure is the proof), while the programme holds a few
percent of them.

| What | Formula | Source |
|---|---|---|
| The least volume | Least `Σ (l_i + s) a_i` such that `B q_k = f_k` and `−σc a_i ≤ q_ik ≤ σt a_i` in every case k | Dorn, Gomory and Greenberg; Hemp (several cases); Parkes (the joint cost s) |
| Equilibrium | Member i from node a to b, unit direction e: column `−e` at a and `+e` at b, so `B q = f` with tension positive | Statics |
| Standard form | `q = p − n` with p and n ≥ 0, and a slack per member and case: `a_i σt = p_ik + (σt / σc) n_ik + s_ik` (forces scaled by the largest load, lengths by the longest candidate) | Linear programming |
| The solver | Primal-dual interior point, Mehrotra's predictor and corrector; a pivot that has cancelled to a 1e-13 share of its own row's diagonal is made huge, so its direction solves as 0 (tested against its own row, as the diagonal spans many orders near the optimum). It stops when equilibrium, the members' limits and the gap between the primal and dual values are each within 1e-9 relative; a run that rounding still stalls short of that takes its best point if within 1e-6 | Mehrotra; Nocedal and Wright, chapter 14; Zhang (LIPSOL) |
| Adding members | A left-out member would lower the volume if `Σ_k max(0, σt b_i·u_k, −σc b_i·u_k) > l_i + s`, u_k the dual of case k's equilibrium | Gilbert and Tyas |
| Members through a node | From each node, only the nearest node in each direction | Gilbert and Tyas |

**Tested** against hand calculations, each to rounding: two bars to two pins (8333.3 mm³, 833.3 N each), the same
weaker in compression (12500 mm³), a tripod in space (5625 mm³, 375 N a leg), two load cases sharing areas (3000 mm³,
not the 4000 of each alone); and against Michell's closed form for a couple carried between two circles (Michell
1904: `V = 2 M ln(R / r) / σ`): never under it, 2.6% over with 16 nodes to a ring and 0.65% with 32, the excess
falling fourfold as the step halves (straight members where his spirals curve). Member adding gives the same volume
as every candidate in one programme, alone and with two cases. The 32-to-a-ring wheel (224 nodes, 23728
candidates) takes about half a second on a laptop; the bicycle frame example (`examples/bicycle-frame`, 61 nodes and 1242 candidates,
three cases) about 4 seconds.

**Limits.**

- Pin-jointed and plastic: each member is as thick as its force needs, with nothing for buckling or bending. Size the
  result (`layoutFrame` and `sizing`), which checks both.
- The node positions are fixed: a finer grid gives a better layout, slowly (the dense matrix grows with the free
  freedoms times the cases: a few thousand rows is the practical most).
- With several cases, the forces within a case may not be unique (above), and members of equal merit may share a
  load: a joint cost (`joint`) settles on fewer.
- A flat layout's members may cross without meeting (a node is needed where they cross to join them).
- The joints' problems carry the members' forces as point loads at the stubs' ends, held at one stub: the joint's own
  stiffness against the frame's is not modelled.

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
- Dorn, Gomory, Greenberg (1964). Automatic design of optimal structures. *Journal de Mécanique* 3, 25–52.
- Friedman, Kosmatka (1993). An improved two-node Timoshenko beam finite element. *Computers and Structures* 47,
  473–481.
- Gilbert, Tyas (2003). Layout optimization of large-scale pin-jointed frames. *Engineering Computations* 20,
  1044–1064.
- Guyan (1965). Reduction of stiffness and mass matrices. *AIAA Journal* 3, 380.
- Hemp (1973). *Optimum Structures*. Clarendon Press, Oxford.
- McGuire, Gallagher, Ziemian (2000). *Matrix Structural Analysis*, 2nd ed. Wiley.
- Mehrotra (1992). On the implementation of a primal-dual interior point method. *SIAM Journal on Optimization* 2,
  575–601.
- Michell (1904). The limits of economy of material in frame-structures. *Philosophical Magazine* 8, 589–597.
- Nocedal, Wright (2006). *Numerical Optimization*, 2nd ed. Springer.
- Parkes (1975). Joints in optimum frameworks. *International Journal of Solids and Structures* 11, 1017–1022.
- Przemieniecki (1968). *Theory of Matrix Structural Analysis*. McGraw-Hill.
- Timoshenko, Gere (1961). *Theory of Elastic Stability*, 2nd ed. McGraw-Hill.
- Young, Budynas (2002). *Roark's Formulas for Stress and Strain*, 7th ed. McGraw-Hill.
- Zhang (1998). Solving large-scale linear programs by interior-point methods under the MATLAB environment.
  *Optimization Methods and Software* 10, 1–31.
