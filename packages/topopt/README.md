# @rulecad/topopt

Topology optimisation for flat parts (2D) and solid ones (3D): where to put a fixed amount of material in a region so
the part is as stiff as possible under its loads. Give it the space a part may fill, the bosses it must keep, the
holes it must avoid, where it's held and how it's loaded. It returns outlines ready to extrude (2D), or a closed surface
ready to print (3D). No dependencies but
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
result.unsupported; // with overhang: the share of the kept regions' material nothing holds up (0: all held up)
result.cases;      // [{ name: 'down', deflection (mm along the load), stiffness (N/mm) }]; a twist (forces adding
                   // to nothing): { name, moment (N·mm), angle (radians), torsion (N·mm a radian) }
const loops = outlines(spec.grid, result.density, spec.origin);   // closed loops, solid on the left
```

### In 3D

Regions take a z. A region can be a box (`size`), a cylinder (`r`, `length`, `axis`), a ball (`r`), or a closed
triangle mesh (`triangles`). A cylinder can be a teardrop: `teardrop: '-z'` for a boss, `'+z'` for a hole, or any
direction across its axis. It gets a 45° point that way, so it prints without support. Supports and loads can be any region.

A part's mesh can be a region of a flat problem too: `{ triangles, flat: true }` is its section halfway up (a plate's
outline, its holes open), so a flat part can be optimised within the blank it's cut from.

```js
const spec = discretise({
  space: { at: [10, 0, 43], size: [40, 40, 86] },
  keep: [{ at: [10, 0, 80], r: 5, length: 16, axis: 'x', teardrop: '-z' }],
  supports: [{ at: [10, 0, 1], size: [40, 40, 2] }],
  loads: [{ at: [10, 0, 80], r: 2.4, length: 16, axis: 'x', force: [0, -20, 0] }],
  material: { E: 2680, nu: 0.36 }, cell: 2.5, volume: 0.2, filter: 5,
  overhang: '+z',                                    // printable standing this way up: no supports
});
const result = optimise(spec);                       // multigrid solves each step
const { vertices, faces } = surface(spec.grid, result.density, spec.origin, { overhang: { up: '+z', angle: 45 } });
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
  patterns. A member thinner than four cells is analysed too stiff (two cells: about 11%; one: about
  32%; see @rulecad/fea, How fine a grid), so pick a cell small enough that the thinnest member the filter allows is
  four cells across, or a result full of thin members looks better than it is.
- **Heaviside projection** sharpens the result, more on each pass, until cells are solid or empty.
- **The overhang filter** (optional, after Langelaar 2017) applies the printer's limit. Layer by layer from the bed, a
  cell can only be as solid as the material under it: the cell below and its neighbours, so nothing overhangs more
  than 45°. With `bridge` (the widest gap the printer spans, mm), a cell is also held up by a bridge: a run of solid
  cells along its own layer, up to half that long, ending on a held cell. The result prints without supports in that
  direction. Kept regions must print too: a kept cell that
  nothing holds up costs the optimiser as much as the whole part's compliance (shared over the kept cells), so it grows
  what holds it up; `result.unsupported` says how much of the kept material is still left hanging, which means there
  wasn't material enough to stand it on.

- **Process filters** (optional) hold the result to what another way of making it can make. `mill: '+z'` (the tool
  cuts from that side) and `cast: '+z'` (a mould drawn off that way) make each cell as solid as every cell between
  it and that side, by a smooth running maximum along each line (`drawFilter`, never below the larger of the two
  densities it joins and never above 1), so nothing is undercut. With
  `cast: { draw: 'z', parting }` the mould is in two halves, drawn off both ways from the parting plane (mm; the
  space's middle by default). `symmetry: { mirror: 'xy', turns: 4, axis: 'z' }` and `extrude: 'x'` tie cells
  together (`tieFilter`): each design density is the average over its mirror images, its copies turned about the
  middle, or its line along the axis, so the part is the same in each. The mirror planes are the grid's middle
  planes, which are the middle of the space and keep regions (in 3D, except along an overhang's build direction).
  A mirror or turn that swaps the tool's side, the draw or the build direction for its opposite, or a quarter turn
  that moves it onto another axis, is refused by name: the part would have to be made from both sides at once. A
  mould in two halves parted at the grid's middle maps onto itself, so it may be mirrored or half turned across its
  draw. A process filter goes after the density filter and before the projection, in
  place of the overhang filter: a part is printed, milled or cast, one of them.
  `undercuts(grid, density, { from, parting })` counts the cells a tool or a mould half could not reach (none, by
  construction, unless an avoid region or the space's own edge sits behind material); `grey(density, passive)` is
  the share of the design cells between a tenth and nine tenths solid. A clear result has a few per cent, on its
  surfaces. A section milled, cast or extruded across its own plane in 2D often comes out grey (a grey column bends as
  stiffly as a solid one of its share's height, so the optimiser has no reason to choose), and its outline at half
  density is then a guess; `voids(grid, density)` finds enclosed empty pockets,
  which a powder bed print can't empty of powder, with each one's volume and centre.
- **The tool, more sides, the draft** (with a process filter). `tool` (mm, with `mill`) is a flat end mill's radius:
  in each layer across the tool's axis the part is closed by a disc that size (`toolFilter`: dilated then eroded,
  Sigmund 2007's morphology filters as smooth maxima and minima), so no pocket is narrower than the tool and every
  inside corner seen from it is rounded to its radius. In 2D, `mill: '+z'` with a tool is a plate's profile cut
  through by an end mill along z. `mill: ['+z', '-z']` mills from several sides, a setup each (Langelaar 2019): a
  cell stays only where no side's tool reaches it, the smooth minimum of what each side leaves. `draft` (degrees, with
  `cast`) narrows the part towards the side it is drawn off: a wall steps out a cell every whole number of layers in
  1 / tan(draft), so at least the draft asked, and a grid too shallow for one step is refused by name.
- **Voids prevented** (`voids: 'prevented'`): every empty pocket is kept open to the outside as the part is optimised,
  by the virtual temperature (`virtualTemperature`, Liu and others 2015): empty cells make heat and conduct it well,
  solid ones conduct it poorly, the grid's faces are held cold, so an enclosed void runs hot. Its p-mean is kept under
  a cap as a second constraint. On a twisted block that closes into a tube freely, the prevented run vents it for a
  little stiffness (test). For the stiffest part that fills a volume.
- **The thinnest member** (`feature`, mm): a printer's two lines, a resin printer's smallest feature. Members
  narrower go as the part is optimised: after the density filter the part is opened by a ball (`featureFilter`:
  eroded then dilated) of the least whole number of cells r whose 2r + 1 cells across are as wide. Where a cell is
  already as wide (two 0.42 mm lines on 1 mm cells), every member is, and nothing changes. A ball of one cell holds
  members to three cells; a wider one is refused by name with the cells that would do it, since a 2D cantilever
  optimised under a ball of two cells came out speckled with loose cells and over twice as flexible (450 against 199).
  On a 60 × 20 cantilever with a 1.2 mm filter, a 3 mm feature on 1 mm cells took the cells in members under three
  cells from 114 to none, for 8.8% more compliance (test). `thin(grid, density, { radius })` finds the solid cells in
  members narrower than a ball (and on square outside corners, which it rounds).

Milled from above, the 3D cantilever (24 × 8 × 8 cubes, volume 0.3, 200 steps) has no undercuts from the tool's
side and a compliance of 3227 against 2989 optimised freely, 8% less stiff, with 5.3% of its cells grey; the free
design has over 100 cells hidden under material from above. A 2D cantilever (30 × 20 squares, 200 steps) milled from
its top edge has no undercuts either, but over 30% of it is grey. Mirrored across its middle, a cantilever loaded at one corner comes out the same both
sides to the last digit.

| Figure | Formula | Source |
|---|---|---|
| Smooth maximum over a disc or ball of N cells | (1/β) ln(Σ exp(β x) / N), β = 10 ln N + 10 | Sigmund (2007) |
| Smooth minimum | 1 − smooth maximum of (1 − x) | Sigmund (2007) |
| Tool (closing) | smooth minimum of the smooth maximum, over a disc of the tool's radius in each layer | Sigmund (2007); Langelaar (2019) |
| Feature (opening) | smooth maximum of the smooth minimum, over a ball of r cells; r = ⌈(feature / h − 1) / 2⌉ | Sigmund (2007) |
| Several sides | smooth minimum of two: ½(a + b − √((a − b)² + ε)) + ½√ε, ε = 10⁻⁶ | Langelaar (2019) |
| Draft | a cell's step out every ⌊1 / tan(draft)⌋ layers | the draw after Gersborg and Andreassen (2011); the step is this package's choice |
| Virtual temperature | k = kₛ + (1 − kₛ)(1 − ρ)³, heat 1 − ρ, faces at 0; p-mean of T, p = 8 | Liu and others (2015) |

Several load cases are optimised together by weight. A case weighted 0 is solved only at the end, for its figures.
`model(spec)` exposes the analysis and its gradient, for other update methods.

`outlines` traces a 2D result's edges at density 0.5 (marching squares), smooths them (Taubin, which keeps the size),
and drops holes and islands smaller than `minArea`.

`surface` does the same for a 3D result: a closed triangle mesh at density 0.5, by marching tetrahedra. Every cube
is split along the same diagonal, so neighbouring cubes cut their shared faces the same way and the surface has no
gaps. Then it's smoothed. With `overhang`, the smoothed surface is made printable: faces left steeper than the limit
are tipped back to it, and tips left hanging in mid-air (the lowest point of a dip under an edge, which a printer has
nothing to lay down on) are lifted level with their neighbours, in turn until neither finds any.

`reduce` gives a closed surface fewer triangles. It collapses edges one at a time, cheapest first, by the quadric
error of Garland and Heckbert (1997): each corner keeps the planes of the faces it came from, and the sum of its squared
distances to them must stay under the tolerance squared, so no corner moves further than the tolerance from any of
those planes. A collapse is refused if it would open or pinch the surface (the two ends must share exactly the two
corners across their edge: the link condition of Dey and others, 1999), fold a face over, or leave a sliver with no
area. Corners on the grid's faces stay on them. Given the build direction and the printer's limit, it also refuses a
collapse that adds to the area hanging past the limit or leaves a corner lower than all its neighbours (a tip, which
slices as an island). On the bracket bench's printable result, 0.1 mm (a quarter of a print line) took 75,592
triangles to 21,124, the volume from 27.808 to 27.806 cm³, with no islands before or after.

```js
const fewer = reduce({ vertices, faces }, { tolerance: 0.1, lo, hi, overhang: { up: '+z', angle: 45 } }); // lo, hi: the grid's corners
```

| Figure | Formula | Source |
|---|---|---|
| A corner's error at p | Σ over its faces' planes (n · p + d)², n the unit normal | Garland and Heckbert (1997) |
| Collapse allowed | error ≤ tolerance², ends share exactly two corners, no face turned over 70° | Garland and Heckbert (1997); Dey and others (1999) |
| A face hangs | its normal points down more than sin(limit) from level, and it isn't on the bed | the printer's overhang limit, degrees from vertical |

`printable` makes a result printable before it's drawn, the hard way: built up layer by layer from the bed, a cell
stays only if something holds it up (a cell in the layer below, straight under it or diagonally next to that; or,
within `reach` cells along its own layer, one that is: a short bridge); kept regions always stay. Whatever's left
hanging is emptied, and with it, layer by layer, whatever rested on it. It's what `cad optimise` does to every 3D
result with a build direction.

## Stress limits

Stiffness alone puts material in sharp inside corners, where stress concentrates and cracks start. Give a stress limit
(MPa) instead of a volume, and `optimise` finds the lightest layout that keeps every cell's von Mises stress under it:

```js
const spec = discretise({ ...problem, volume: undefined, stress: 13 }); // pla.strength / 3
const result = optimise(spec);
result.stress;     // { peak, limit }: the largest stress in the result's solid cells (MPa)
```

- **How:** each cell's stress at its centre, as if solid, gets its own limit, scaled by its density so an empty cell's
  limit vanishes (Senhora, Giraldo-Londoño, Menezes, Paulino 2020). An augmented Lagrangian keeps them all: every 5
  steps its multipliers are raised where a limit is broken, and its penalty grows. Each step is a step of the method
  of moving asymptotes (`mma`, after Svanberg's 2007 code, also exported; that code is under the GPL, see
  [THIRD-PARTY.md](THIRD-PARTY.md)), and needs one more solve, for the adjoint.
- **Cost:** about a thousand steps, each with two solves, against about two hundred with one for the stiffest layout.
  Start on coarse cells.
- **Supports and loads:** every cell is limited, those where the part is held and loaded too, so give them some area
  (a hole's edge, a pad): a force on a point is an unlimited stress there.

The L-bracket (`reference/lbracket.mjs`), the usual test: a 100 mm square less its top-right 60 mm, held along the
top of its upright arm and pushed down with 100 N at the end of its lower one, PLA 2 mm thick, on 1 mm cells. Each
result is re-analysed as it would be made: its smoothed outline, on 0.5 mm cells.

| | Space used | Compliance | Peak stress, on its cells | Peak stress, as made |
|---|---|---|---|---|
| Stiffest at 40% | 40.0% | 373 N·mm | – | 67.2 MPa |
| Lightest under 25 MPa | 39.4% | 426 N·mm | 26.2 MPa | 36.6 MPa |

![The L-bracket, stiffest and stress-limited](reference/lbracket.svg)

For the same material, the stress-limited bracket draws its members together with filleted joints, and its peak stress
falls by 46%. Two things to know:

- **A sharp corner in the space stays sharp.** The domain's inside corner is where both arms meet, and both results
  keep material there; on finer cells its stress keeps rising. The limit holds to within 5% on the optimiser's own
  cells, not on finer ones. Check the final part on finer cells (cad's `analysis` with a `cell`), and set the limit
  with that margin in mind.
- **It may not settle within its steps.** This one ran its 1,000 steps with the peak hovering 5% over the limit.
- **Stress at each cell's corners does not round it either.** Limiting every cell at its four corners, where a sharp
  corner's stress shows, in place of its centre, was tried on 2 mm cells: at 25 MPa the peak as made fell from 33.7 to
  28.9 MPa, but the corner stayed solid, and at 20 MPa the run did not settle (a peak of 109 MPa). It is not built in.

### Robust stress limits

A part is never printed exactly as drawn: an edge comes out a little in or a little out. Give `robust: true` with the
limit and the layout is optimised as three copies at once: the design as made, an eroded copy (thinner, projected at
0.7) and a dilated one (thicker, at 0.3), with the limit held on every cell of all three (Wang, Lazarov and Sigmund
2011; with stress limits, da Silva, Beck and Sigmund 2019). The lightest of the design as made is what's sought.
`result.stress.copies` gives the eroded and dilated copies' peaks for every lightest layout, robust or not.

| The cantilever of the tests, 20 MPa, 2 mm cells | Space used | Peak as made | Made thin | Made thick |
|---|---|---|---|---|
| Plain | 76.1% | 20.3 MPa | 103 MPa | 19.9 MPa |
| Robust | 89.1% | 19.9 MPa | 20.0 MPa | 19.8 MPa |

The plain layout keeps a member that is just thick enough as drawn; a little thinner, its peak is five times the
limit. On the L-bracket at 25 MPa, re-analysed as made on cells half the size:

| L-bracket, 25 MPa | Space used | Peak as made (half cells) | Settled |
|---|---|---|---|
| Plain, 2 mm cells | 44.9% | 33.7 MPa | yes |
| Robust, 2 mm cells | 56.9% | 32.1 MPa | yes, 619 steps |
| Plain, 1.6 mm cells | 41.9% | 794 MPa (a member left too thin to carry) | no, 800 steps |
| Robust, 1.6 mm cells | 52.8% | 27.5 MPa | yes, 584 steps |

Robust costs three solves and three adjoints a step, and more material. What it buys is a result that is what it
claims to be when made: on 1.6 mm cells the plain result came apart as made, the robust one stayed 10% over the limit,
at the inside corner. That corner still stays sharp: robustness does not round the space's own corners, since the
filter counts the cut-out as empty and the design as made keeps a solid cell there. Three more ways were tried on
2 mm cells with the robust copies, and none is built in: limiting each cell at its four corners (the corner cell
emptied and the peak as made fell to 23.9 MPa, but the space used rose to 76%, and 1,000 steps did not settle), at its
four Gauss points (21.3 MPa as made, the corner cell emptied, 72% of the space, 1,500 steps unsettled, the space used
still rising) and at the space's inside corners only (68%, unsettled). Each limit at a sharp corner is a stress that
rises without end as cells shrink, so it keeps the augmented Lagrangian's penalty growing, and the optimiser answers it
with material everywhere. A rounded inside corner with the peak under the limit as made, as the published results
show, is still to be met.

## Mechanisms

A compliant mechanism is a part that moves by bending: push here, and there moves, with no joints. Give the problem an
`output` (where it should move, along one axis, against a spring) and the first load becomes the input (with
`input_spring`, a spring it pushes against); the optimiser then makes the layout that moves the output furthest
(Sigmund 1997), by the method of moving asymptotes under the volume.

```js
const spec = discretise({
  space: { at: [20, 10], size: [40, 20] }, cell: 1, volume: 0.3, filter: 1.5, material: { E: 1, nu: 0.3 }, thickness: 1,
  supports: [{ at: [0.5, 0.5], size: [1, 1] }, { at: [0.5, 19.5], size: [1, 1] }],
  loads: [{ at: [0.5, 10], size: [1, 2], force: [1, 0] }], input_spring: 0.1,   // pushed to the right at the left edge
  output: { at: [39.5, 10], size: [1, 2], direction: [-1, 0], spring: 0.1 },    // the right edge should move left
});
const result = optimise(spec);
result.mechanism;  // { travel (mm, the output along its direction), input (mm, the input along the push), advantage (travel / input) }
```

That one is the force inverter, the classic test: a block pushed at its left edge whose right edge moves the other
way. The springs matter: the output's stands for what the mechanism works against, the input's for what pushes it;
softer springs give more travel and a smaller advantage. The travel's gradient (an adjoint solve with the output's
direction as the load) agrees with finite differences.

Left to itself, mechanism synthesis makes point hinges: a joint one cell wide and half empty is the most compliant
there is, and no printer makes it. So a mechanism is optimised robustly (Wang, Lazarov and Sigmund 2011): its travel
on an eroded copy of the design (projected at a threshold of 0.7), its volume on a dilated one (0.3), the design as
made between them. A hinge that survives erosion has real width, and the result is one piece, cell to cell. The
price: the design as made is stiffer than the eroded copy it was optimised on, by a hinge width's worth of
stiffness (which goes as the width cubed), so `result.mechanism` reports what the design as made does, and it moves
less than the run's progress figures suggested. `result.mechanism.copies` gives the eroded and dilated copies' travels.

The eroded copy alone leaves the dilated one free to stiffen: made a little thick, the hinges of the PLA inverter
below fill in and its output moves 0.023 mm against 1.81 mm as made. With `robust: true` the worst of the three copies
is optimised, by the bound formulation (Bendsøe, Olhoff and Taylor 1983, as Wang, Lazarov and Sigmund 2011 use it):
one more variable z is minimised under each copy's minus travel over the first step's, z for each, so whichever
copy moves least is the one improved. Two more things come with it, as in da Silva, Beck and Sigmund (2019): the filter
counts the cells past the grid's edges as empty (Clausen and Andreassen 2017), else a member one cell thick along an
edge survives erosion and the copies cheat there; and so the cells at the supports, input and output are kept solid.

| PLA inverter, 1 mm cells, 10 N | Travel as made | Made thin | Made thick | Space used |
|---|---|---|---|---|
| Eroded copy (default) | 1.81 mm | 0.92 mm | 0.023 mm | 30% |
| Worst of three (`robust`) | 2.99 mm | 0.92 mm | 0.93 mm | 23.3% |

The worst copy moves 40 times as far. The robust layout leaves its volume unused (more material would not move the
worst copy further). On these cells, with a 1.5 mm filter, it keeps two joints where cells meet only at a corner, in all
three copies: a hinge a node wide. A wider filter is the cure in principle; at 2.5 mm on 1 mm cells the inverter moved
0.02 mm, so on cells this coarse the robust inverter is a layout to read, not a part to print: its members are one
and two cells wide, and the smoothed outline (`outlines`) loses them, drawing it in pieces.

### A mechanism's strength

A mechanism bends, so its hinges are where it breaks. Give a mechanism a `stress` limit (MPa), or a `strain` limit (a
share of the length, times the material's E: a printed plastic's strain at yield is about its strength over its
modulus), and once optimised it is checked against it at its input force:

```js
const result = optimise(discretise({ ...inverter, material: { E: 2680, nu: 0.36 }, strain: 0.003 })); // PLA, 0.3%
result.stress; // { peak, limit, strain, strainLimit, force, travel }
```

`peak` is the largest von Mises stress in the design as made (cells at least half solid) under the input force;
`force` is the input force that takes the peak to the limit, and `travel` how far the output moves then. The part is
linear, so both are the input force and the output's travel times limit over peak. For the PLA inverter above (40 by
20 mm, 4 mm thick, pushed with 10 N against springs of 0.268 N/mm), the peak is 12.1 MPa and the output moves 1.81 mm,
so at 0.3% (8.04 MPa) it may be pushed with 10 × 8.04 / 12.1 = 6.6 N, its output then 1.2 mm along.

Without `robust`, the limit checks the layout and does not shape it. With `robust: true` the mechanism is optimised
under it, as in da Silva, Beck and Sigmund (2019): every cell's limit on each of the three copies, kept by the
augmented Lagrangian the lightest layout uses (its penalty starting at 1), added to z. Two choices make it work, each
found by trial on the inverter: the cells at the supports, input and output are not limited (a force on a small pad
is a stress there, whatever the layout, as the paper also sets it), and each limit is relaxed by the cell's density
cubed rather than its density. With density alone the empty cells between moving parts, which stretch far and as if
solid carry huge stresses, held the output still: the travel went to 0 at every limit tried, 2% included.

| PLA inverter, 10 N, limit 0.15% (4.02 MPa) | Peak as made | Made thin | Made thick | Travel as made | Worst copy |
|---|---|---|---|---|---|
| Checked only (default) | 12.1 MPa | | | 1.81 mm | 0.023 mm |
| Optimised under it (`robust`) | 4.03 MPa | 0.72 MPa | 6.66 MPa | 1.90 mm | 1.28 mm |

**Experimental: the figures above are one machine's.** A mechanism optimised under a limit is sensitive to the
floating point of the machine it runs on. The same problem in CI ended within 2% of the limit with the worst copy
moving 0.55 mm and in more than one piece (macOS), 5.7% over (Linux), and within 2% (Windows). It always cuts the
checked-only layout's peak by more than half, but check the result as drawn (`cad check` finds loose pieces) before
printing it, and read its peak in `result.stress`. Making it hold the same on every machine is left.

On the machine above, the design as made keeps to the limit and still moves its output 1.9 mm. Made a little thick, its peak is 66% over:
the dilated copy's limits are in the problem but did not hold by the time it settled (its stopping test is the travel,
not the limit). So read `result.stress.copies` before trusting a thick print, and keep the input force under the
`force` reported. Earlier tries, without the three copies: the augmented Lagrangian added to the eroded copy's travel
(the travel went to 0), and the stresses' p-norm (p = 8) as a second limit after de Leon, Alexandersen, Fonseca and
Sigmund (2015), with Le et al.'s (2010) correction (the final peaks missed the limit by up to 80%).

## Checked against the published code

With projection off, it matches a line-by-line port of the 88-line MATLAB code (`reference/top88.py`) step for step:

- **The MBB beam** (60 × 20, volume 0.5): 127 steps to a compliance of 218.80.
- **A short cantilever** (48 × 24, volume 0.4): 100 steps to 99.49.

The docs site runs the same MBB beam live in the browser, in a worker, to the same 127 steps and 218.80.

In 3D it matches a port of Liu and Tovar's top3d (`reference/top3d.py`) step for step: a cantilever of 24 × 8 × 8
cubes, 145 steps to 4906.73. The overhang filter's gradient agrees with finite differences.

Its gradients agree with finite differences through the filter and the projection.

## Glossary

- **Compliance:** the load times how far it moves (N·mm); the inverse of stiffness.
- **Volume:** the share of the space the result fills, 0 to 1.
- **Filter radius:** about the thinnest member, in mm.
- **Undercut:** material the tool or mould can't reach, because other material lies between it and the side the tool
  comes from or the mould is drawn off to.
- **Parting plane:** where a two-part mould's halves meet.
- **Draft:** a slight taper on faces along the draw, so a part slides out of its mould.
- **Eroded, dilated:** copies of the design projected at a higher or lower threshold (0.7, 0.3): the part as if made a
  little thin or a little thick all round.
- **Bound formulation:** making the worst of several measures best, by minimising one extra variable that each of
  them must stay under.
- **Feature:** the thinnest member a process makes, mm.
- **Von Mises stress:** one number for how hard a point of material is worked, from all its stresses together; it's
  compared with the material's strength.

## Sources

- Sigmund, O., "On the design of compliant mechanisms using topology optimization", *Mechanics of Structures and Machines* 25(4), 1997: the output-travel objective and its adjoint.
- Wang, F., Lazarov, B. S., and Sigmund, O., "On projection methods, convergence and robust formulations in topology optimization", *Structural and Multidisciplinary Optimization* 43, 2011: the eroded, intermediate and dilated designs.

- Bendsøe, Sigmund (2003). *Topology Optimization: Theory, Methods and Applications*. Springer.
- Andreassen, Clausen, Schevenels, Lazarov, Sigmund (2011). Efficient topology optimization in MATLAB using 88 lines
  of code. *Structural and Multidisciplinary Optimization* 43, 1–16.
- Wang, Lazarov, Sigmund (2011). On projection methods, convergence and robust formulations in topology optimization.
  *Structural and Multidisciplinary Optimization* 43, 767–784.
- Liu, Tovar (2014). An efficient 3D topology optimization code written in Matlab. *Structural and Multidisciplinary
  Optimization* 50, 1175–1196.
- Langelaar (2017). An additive manufacturing filter for topology optimization of print-ready designs. *Structural and
  Multidisciplinary Optimization* 55, 871–883.
- Langelaar (2019). Topology optimization for multi-axis machining. *Computer Methods in Applied Mechanics and
  Engineering* 351, 226–252.
- Sigmund (2007). Morphology-based black and white filters for topology optimization. *Structural and
  Multidisciplinary Optimization* 33, 401–424.
- Liu, Li, Chen, Tong, Cheng (2015). An identification method for enclosed voids restriction in manufacturability
  design for additive manufacturing structures. *Frontiers of Mechanical Engineering* 10, 126–137.
- Gersborg, Andreassen (2011). An explicit parameterization for casting constraints in gradient driven topology
  optimization. *Structural and Multidisciplinary Optimization* 44, 875–881.
- Taubin (1995). A signal processing approach to fair surface design. *SIGGRAPH '95*, 351–358.
- Garland, Heckbert (1997). Surface simplification using quadric error metrics. *SIGGRAPH '97*, 209–216.
- Dey, Edelsbrunner, Guha, Nekhayev (1999). Topology preserving edge contraction. *Publications de l'Institut
  Mathématique (Beograd)* 66 (80), 23–45.
- Senhora, Giraldo-Londoño, Menezes, Paulino (2020). Topology optimization with local stress constraints: a stress
  aggregation-free approach. *Structural and Multidisciplinary Optimization* 62, 1639–1668.
- Le, Norato, Bruns, Ha, Tortorelli (2010). Stress-based topology optimization for continua. *Structural and
  Multidisciplinary Optimization* 41, 605–620.
- de Leon, Alexandersen, Fonseca, Sigmund (2015). Stress-constrained topology optimization for compliant mechanism
  design. *Structural and Multidisciplinary Optimization* 52, 929–943.
- da Silva, Beck, Sigmund (2019). Stress-constrained topology optimization considering uniform manufacturing
  uncertainties. *Computer Methods in Applied Mechanics and Engineering* 344, 512–537.
- da Silva, Beck, Sigmund (2019). Topology optimization of compliant mechanisms with stress constraints and
  manufacturing error robustness. *Computer Methods in Applied Mechanics and Engineering* 354, 397–421.
- Clausen, Andreassen (2017). On filter boundary conditions in topology optimization. *Structural and
  Multidisciplinary Optimization* 56, 1147–1155.
- Bendsøe, Olhoff, Taylor (1983). A variational formulation for multicriteria structural optimization. *Journal of
  Structural Mechanics* 11, 523–544.
- Svanberg (1987). The method of moving asymptotes: a new method for structural optimization. *International Journal
  for Numerical Methods in Engineering* 24, 359–373.

## Licence

MIT (see [LICENSE](LICENSE)), except the method of moving asymptotes: `mma`, `subsolve` and `gauss` in topopt.mjs
follow Krister Svanberg's MATLAB code, which is under the GNU General Public License version 3 or later. Until they are
rewritten, read [THIRD-PARTY.md](THIRD-PARTY.md) before you copy or reuse them.
