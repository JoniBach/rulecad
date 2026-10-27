# @rulecad/topopt

Topology optimisation for flat parts: where to put a fixed amount of material in a region so the part is as stiff as
possible under its loads. Give it the space a part may fill, the bosses it must keep, the holes it must avoid, where it's
held and how it's loaded, and it returns outlines ready to extrude. No dependencies but
[@rulecad/fea](../fea); runs in browsers and Node.

```js
import { discretise, optimise, outlines } from '@rulecad/topopt';

const spec = discretise({
  space: { at: [60, 0], size: [140, 40] },                         // where material may go (mm)
  keep: [{ at: [0, 0], r: 6 }, { at: [120, 0], r: 5 }],            // must stay solid
  avoid: [{ at: [0, 0], r: 2.8 }, { at: [120, 0], r: 2.3 }],       // must stay empty
  supports: [{ at: [0, 0], r: 2.8 }],                              // held here
  loads: [{ at: [120, 0], r: 2.3, force: [0, -20], case: 'down' }], // pushed here (N)
  material: { E: 2680, nu: 0.36 }, thickness: 6, cell: 1, volume: 0.5, filter: 2.5,
});
const result = optimise(spec, { onStep: (s) => console.log(s.step, s.compliance) });
result.cases;      // [{ name: 'down', deflection (mm along the load), stiffness (N/mm) }]
const loops = outlines(spec.grid, result.density, spec.origin);   // closed loops, solid on the left
```

## How it works

The density method (SIMP: solid isotropic material with penalisation). Each cell has a density from 0 to 1, starting
even. On each step:

1. **Analyse** the part (@rulecad/fea).
2. **Work out each cell's effect on the compliance.** Compliance is how much the part gives under its loads, so lower
   is stiffer; each cell's effect is its gradient.
3. **Move material** towards the cells that stiffen the part most, keeping the total fixed (the optimality criteria
   update).

Stiffness grows as density cubed, so part-solid cells are poor value and the result settles into solid and empty.
Two more steps shape the result:

- **A density filter** averages each cell with its neighbours. It sets the thinnest member and prevents chequerboard
  patterns.
- **Heaviside projection** sharpens the result, more on each pass, until cells are solid or empty.

Several load cases are optimised together by weight. `model(spec)` exposes the analysis and its gradient, for other
update methods.

`outlines` traces the result's edges at density 0.5 (marching squares), smooths them (Taubin, which keeps the size),
and drops holes and islands smaller than `minArea`.

## Checked against the published code

With projection off, it matches a line-by-line port of the 88-line MATLAB code (`reference/top88.py`) step for step:

- **The MBB beam** (60 × 20, volume 0.5): 127 steps to a compliance of 218.80.
- **A short cantilever** (48 × 24, volume 0.4): 100 steps to 99.49.

Its gradients agree with finite differences through the filter and the projection.

## Glossary

- **Compliance:** the load times how far it moves (N·mm); the inverse of stiffness.
- **Volume:** the share of the space the result fills, 0 to 1.
- **Filter radius:** about the thinnest member, in mm.

## Sources

- Bendsøe, Sigmund (2003). *Topology Optimization: Theory, Methods and Applications*. Springer.
- Andreassen, Clausen, Schevenels, Lazarov, Sigmund (2011). Efficient topology optimization in MATLAB using 88 lines
  of code. *Structural and Multidisciplinary Optimization* 43, 1–16.
- Wang, Lazarov, Sigmund (2011). On projection methods, convergence and robust formulations in topology optimization.
  *Structural and Multidisciplinary Optimization* 43, 767–784.
- Taubin (1995). A signal processing approach to fair surface design. *SIGGRAPH '95*, 351–358.
