# @rulecad/flexures

Compliant mechanisms for printed parts: flexures that move by bending instead of turning on a pin. Each one is a
JSCAD shape and a model: its stiffness, the strain its material sees at a travel, and the travel a strain allows.
No dependencies but JSCAD. Part of [rulecad](https://github.com/JoniBach/rulecad).

```js
import { leaf, leafModel, parallelGuide, parallelGuideModel, serpentine, notchHinge, notchHingeModel, printable } from '@rulecad/flexures';

const spring = { length: 40, thickness: 1.26, width: 8 };          // mm: along x, bending along y, width up z
const pla = { E: 2680, strainLimit: 0.02, name: 'PLA' };           // MPa, and the strain it may see
const m = leafModel(spring, pla);
m.stiffness;        // 0.084 N/mm
m.travel(0.02);     // 16.9 mm: how far before 2% strain
m.strain(5);        // 0.0059 at 5 mm
leaf(spring);       // the shape

printable({ ...spring, travel: 5 }, { line: 0.42, layer: 0.2, wall_min: 0.84 }, pla, m);
// [{ level: 'pass', text: '1.26 mm thick: 3 lines of 0.42 mm', code: 'flexure.lines' }, { level: 'pass', text: 'at 5 mm of travel the material sees 0.59% strain, within PLA limit of 2.0%', ... }]
```

## The flexures

| | Shape | Stiffness | Strain at travel δ |
|---|---|---|---|
| `leaf` | A cantilever: fixed at one end, pushed at the tip | E w t³ / 4L³ | 3tδ / 2L² |
| `fixedGuided` | Fixed at one end, the other moved without turning | E w t³ / L³ | 3tδ / L² |
| `parallelGuide` | Two fixed-guided leaves and a shuttle: a linear bearing with no parts | 2 E w t³ / L³ | 3tδ / L²; the shuttle drops 3δ² / 5L |
| `serpentine` | n leaves end to end, zigzagging: a long spring in a short space | E w t³ / nL³ | 3t(δ/n) / L² |
| `notchHinge` | A thin neck between two round notches: a pivot with no play | 2 E w t^(5/2) / 9π√R, N·mm a radian | 4θ√(t/R) / 3π, times about 1.2 for the notch |
| `bistable` | Two shallow arches clamped at both ends, joined in the middle: pushed, they snap over and stay (a switch, a latch) | 384 EI / L³ at the start of a push | 2π²ht / L² on the way over; bistable when h > 2.31t (Qiu, Lang and Slocum 2004) |
| `livingHinge` | A thin strip between two blocks that folds | EI / l, N·mm a radian | tθ / 2l |
| `compoundGuide` | Two parallel guides in series, one folded back inside the other: a linear bearing with no drop | E w t³ / L³ | 3t(δ/2) / L²; no drop |
| `letJoint` | A hinge cut into a flat sheet: torsion bars either side of a slot, turning about an axis in the sheet (Jacobsen et al. 2009) | 2 / (2/k_t + 1/k_b), N·mm a radian: half-bars GJ / L_t, end bridges EI / L_b | the bars' shear (as von Mises) or the bridges' bending, whichever is more |
| `constantForce` | A slider-crank with a leaf coupler (Howell): the slider's force stays within ±5% over about a quarter of the leaf's length | `force(stroke)`, `flat` {from, to, force} | 0.85 × 2.65 t Θ / 2l, the leaf's pseudo-rigid-body angle Θ |
| `ellipticalHinge` | A notch hinge with half-ellipse notches, longer along the beam for less stress at an angle (Smith 2000) | ∫ dx / EI(x) along the notch, N·mm a radian; the circle within a few % of `notchHinge` | 1.2 × t K θ / 2 E I at the neck |
| `cartwheel` | Two leaves crossing at a hub inside a rim, joined where they cross: a pivot that prints flat | 16 EI / s × (1 + 1.5 r / s), N·mm a radian, spokes s from a hub r | 2tθ / s × (1 + 1.5 r / s) |
| `snapHook` | A cantilever with a hook: pushed in it deflects and springs back behind the catch | the leaf's; `force` at the undercut, `insertion` and `removal` with friction μ (BASF, Bayer) | 3ty / 2L² at the undercut y |
| `ratchetWheel`, `ratchetPawl` | Saw teeth on a pin and a leaf pawl: a one-way click | `ratchetModel`: the pawl's `lift` a tooth high and the `click` along the rim | the pawl's, at the tooth height |
| `foldedGuide` | A shuttle on two folds, each a beam out to a floating truss and back to an anchor: a compound guide in a shorter box | E w t³ / L³ | 3t(δ/2) / L²; no drift |
| `pinJoint` | A pin, a ring with an arm and a cap, printed in place a support gap apart: the joint to compare the flexures against | not compliant: `pinJointCheck` reads the printer's fit and support gap, and gives the ring's play | — |
| `snapPin`, `snapSocket` | A barbed, slotted peg that clicks into a hole, printed standing | `snapPinModel`: two snap hooks' worth of `force`, `insertion` and `removal` | 3ty / 2L² in each half |
| `travelStop` | Two posts at a leaf's tip where the strain limit says its travel must end, less a margin: the rule as a shape | — | `at`: factor × travel(strainLimit) |
| `contactLeaf` | A leaf with a stop bar beside it: free until the beam touches, stiffer after; two rates in one spring | `first` the leaf's, `second` a shorter leaf's, meeting at `contact` | 3tδ / 2L² before contact, the shorter leaf's after |
| `parallelogram` | A four-bar with a notch hinge at each corner: the coupler moves sideways and stays parallel, rising a little | 4K / L² at the coupler | the hinges' at θ = asin(δ / L) |
| `tweezers` | Two arms on a fixed-guided spring: squeeze to close the jaws; the simplest compliant gripper | E w t³ / L³ at the fingers | 3tδ / L² at a squeeze δ |
| `curvedLeaf` | A leaf drawn as an arc, so its rest is the middle of its working range: a spring that works from a loaded rest | E w t³ / 4L³ | 3tδ / 2L² from the curved rest, either way; `preset` t / 2ρ already in the curve |
| `angleStop` | Posts at a pivot's arm end where its strain limit says the turn must end, less a margin | — | `angle`: factor × angle(strainLimit) |

L length, t thickness (across the bend), w width (up the print), R a notch's radius, h an arch's rise, l a strip's length, s a spoke's length, r a hub's radius, y a hook's undercut, I = wt³/12, J a bar's torsion constant, θ an angle in radians. Each
`<name>Model(shape, material)` gives `stiffness`, `strain(travel)`, `travel(strain)` and `stress(travel)`; the notch
hinge's are in angles.

## Printed flat

Every flexure is drawn with its length along x, bending along y, and its width up z. Printed that way, it bends
within its layers, where the filament's own strength is. A flexure that bends across its layers pulls them apart,
and that's the one that snaps.

`printable(shape, printer, material, model)` says how it prints, as findings like `@rulecad/printcheck`'s: the
thickness in whole extrusion lines (and at least two of them: `line` and `wall_min` from the printer's rules), the
width in whole layers, and the strain at the travel against the material's `strainLimit`. Give it `stop: false` and it
warns that nothing bounds the flexure's travel before the limit; give it the stop's travel and it checks that against
the limit. `travelStop` draws the stop where the limit says.

## Bent for real: the elastica

Beam theory holds while a leaf's travel is a few times its thickness. Past that the leaf curls, its tip comes nearer
along x, and it stiffens. `elastica(leaf, material, { force })` or `{ travel }` integrates Euler and Bernoulli's beam
with its exact curvature along the leaf (Bisshopp and Drucker 1945), and gives the tip's travel, how much it has
shortened and turned, the strain at the root, and the secant stiffness. `leafFlexed(leaf, material, load)` draws the
leaf bent, for a picture of the spring at work or a fit check at full travel. Checked against the published values:
tip travel 0.3017 and 0.4935 of the length at load parameters PL²/EI of 1 and 2.

```js
elastica({ length: 40, thickness: 0.84, width: 8 }, { E: 2680 }, { travel: 20 });
// { force: 1.2, travel: 20, shortening: 5.6, angle: 0.82, strain: 0.017, stiffness: 0.06, centreline: [...] }
```

## Out of the plane: the LET joint

Every flexure above bends within its layers. The LET joint is the one that doesn't: it is the natural hinge for a
flat sheet, a slot pattern whose torsion bars twist about an axis lying in the sheet, so a panel folds up out of the
bed. Printed, its bars twist about an axis in the layer plane and its end bridges bend across the layers, so PLA
cracks here sooner than anywhere else: PETG, nylon or TPU, and a sheet several layers thick. `letJointModel` gives the
joint's stiffness, each half-bar's twist and each bridge's bend at an angle, and the angle a strain allows.

## Pinned where it must be: the constant-force mechanism

`constantForce` is a slider-crank whose coupler is a leaf fixed to the slider (Howell, Midha and Murphy 1994): pushed
in, the slider's force is there almost at once and holds within ±5% from the first millimetre to about a quarter of
the leaf's length, because the leaf bends further as the crank's lever shortens. The ground pin sits a little beside
the slider's line (the model's `offset`), so the leaf prints straight and the crank starts at its rest angle. The crank turns too far for any
flexure, so it is pinned: `constantForce` draws the coupler (a slider block, the leaf, a boss at its tip) and
`constantForceCrank` the crank with a boss at each end, for pins of filament. `constantForceModel` gives
`force(stroke)`, the `flat` stretch, the leaf's `strain(stroke)` and the stroke a strain allows. The force scales
with the leaf's thickness cubed: 1.7 N at three lines (1.26 mm) on a 40 mm leaf 8 mm wide in PLA, 13 N at six.

## Composing mechanisms

A mechanism is several flexures placed against each other. Three helpers make that a matter of naming rather than
arithmetic:

- **`ports(kind, params)`** says where a flexure attaches: its `root` and its moving `end` as points and facing
  directions in the shape's own frame, what `moves` there (`'x'`, `'y'` or `'turn'`), and the pivot or shuttle where
  there is one. A design puts the sear's hook at `ports('constantForce', trigger).end.at`.
- **`size.<kind>(job, printer)`** is the model the other way round: give the travel, the force (or the angle) and
  the material, get the thinnest whole-line thickness and the length that do it with the strain under the limit times
  a margin, or `null` when no thickness up to eight lines can (then widen it, or allow a longer part). For the leaf,
  the fixed-guided beam, the compound and folded guides, the serpentine in a box, the notch and living hinges, and the
  constant-force mechanism.
- **`report(parts, printer, material)`** checks a mechanism's worth of flexures at once: each one's print findings,
  its strain at the travel or angle its pose gives it, whether a stop bounds it, and the worst of them named.

```js
import { size, ports, report, constantForce } from '@rulecad/flexures';
const trigger = size.constantForce({ force: 10, stroke: 8, width: 8, material: pla }, x1c);   // { leaf: 70, thickness: 3.36, crank: 35, … }
const pin = ports('constantForce', trigger).pin.at;                                             // where the crank's pin goes
report([{ name: 'trigger', kind: 'constantForce', params: trigger, travel: 8, stop: 10 }], x1c, pla).ok;
```

Requirements belong in the design's variables, each with its rule and source, as the printer's and the material's do;
the sizing helpers read them from there.

### Displacement first

The strain in a beam depends on how far it bends against its length and thickness, not on how hard it's pushed, so a
compliant mechanism is sized by its travel (Howell; the BYU one-piece blaster, Lewis et al., PLOS ONE 2026): the
travel and the strain limit set the length for a thickness, and the force comes last, from the width, which doesn't
change the strain at all. `size.forTravel(kind, job, printer)` works that way round for the leaf, the fixed-guided
beam, the parallel, compound and folded guides and the serpentine. Give `force` (at full travel) or `energy` (N·mm)
to store. Leave `width` out and it takes the thinnest whole-line thickness at the shortest length that keeps the strain
under the limit times a margin, and makes it as wide (whole layers) as the force needs. Give `width` when the print
fixes it (a mechanism printed on its side is as wide as the print is tall), and the thickness sets the force instead:
the thinnest that reaches it, lengthened to give just that. The result says its `ratio`, travel over length: the same
ratio is the same strain at any size, so a design scales.

```js
size.forTravel('parallelGuide', { travel: 12, energy: 50, width: 14, material: petg }, x1c);
// { length: 87.8, thickness: 2.1, width: 14, force: 8.33, energy: 50, strain: 0.0098, ratio: 0.137 }
```

`flexureMaterial(rules)` makes the material from its rule set's `modulus` and `strength`: the strain it may see is its
strength over its modulus (where it starts to yield) over a safety factor (1.5). That ratio is the figure of merit for
flexures: PLA's is about 1.5%, PETG's 1.9%, nylon's higher. A flexure sized at a strain past it bends for good.

## Lamina mechanisms

Working printed blasters and toys are one flat drawing printed on its side: every flexure bends within its layers,
everything that moves stands on the bed, and every clearance is a slot in the drawing. `lamina(spec)` (async) takes a
mechanism drawn that way and checks it as it will print and move:

- **The parts:** a `ground`, rigid `bodies`, and `joints`, each a flexure from one body (or the ground) to another, a
  generator's `kind` and `params` placed `at` a point and turned an `angle`, or your own `shape` with its `axis` or
  `pivot`. A leaf moves its body as the pseudo-rigid-body model says (a turn about a point 0.15 of its length from its
  root); a guide's shuttle moves along it, and drops as its model says. Every part is the print's `height`, which is
  also the flexures' width.
- **States and a sequence:** each state says how far the joints are moved; the `sequence` is the order they happen.
  Every step between two states is walked in steps of a quarter of a millimetre at most.
- **Followers:** a joint moved by contact (a latch, a sear) gives just as far as it must to clear what drives it,
  and springs back when that has passed. The joint being moved drives, and one standing still gives. Where a follower
  would have to give more than the push could make it (a face steeper than friction lets a push turn aside), the
  driver jams.
- **Friction, the cautious way:** what must move is checked sticky (a ramp must still push a latch aside at 0.5),
  and what must hold is checked slippery (a catch must still hold at 0.1).

The findings, each pass or fail with its code:

| Code | What |
|---|---|
| `lamina.free` | At rest, everything clears what it isn't joined to by the printer's gap, and each flexure touches only its two bodies, in one place each: else it prints fused |
| `lamina.attached` | Each flexure runs into its bodies, not just along an edge (an edge join prints as two pieces) |
| `lamina.sequence`, `lamina.collide` | Nothing runs into anything in any state or on the way; a step into a state a catch holds may settle on the catch |
| `lamina.jam`, `lamina.follow` | No driver jams on a follower, and no follower has to give past its limit |
| `lamina.holds` | A catch holds: the joint pushing back towards rest jams on it. It says the least friction it holds at, and how far the catch must move to let go |
| `lamina.strain` | Each flexure's strain at the most it is moved, against the limit |
| `lamina.stop` | Something hard stops each flexure before its strain limit (swept from rest, so a stop that is jumped over doesn't count) |
| `lamina.energy` | What each state stores, and the forces |

It returns the printed `parts` (`body`, the drawing extruded, after an optional `finish` for 3D work such as holes
through it, and any `loose` parts), the `findings`, the `energy` in each state, and `frames` along the sequence with
the flexures drawn bent, for an animation. A design that returns it is checked by `cad check`, and `cad animate`
plays its sequence. The plane's geometry is manifold-3d's (Clipper2): JSCAD's 2D booleans are not robust enough for
clearance checks a tenth of a millimetre fine.

The launcher's flat action is a worked example (examples/bench/projects/launcher/objects/flat.js): a pusher on a
two-leaf spring, a tab to cock it, and a trigger that is its own sear, with a catch that leans back so it holds
however slippery the plastic.

## Joints that aren't flexures

`pinJoint` prints a pin, a ring with an arm and a cap as one piece, the ring a clearance from the pin and a support
gap off the base and under the cap, so it breaks free with a twist and turns with a little play. It is the joint to
compare the flexures against, and the one to use where a part must turn further than any flexure lets it (the
constant-force mechanism's crank). `pinJointCheck(joint, printer)` says whether the clearance meets the printer's fit
and the gaps its support gap, and how far the ring can rock. `snapPin` and `snapSocket` join two printed parts with a
click: a barbed peg split down the middle, each half a snap hook, pushed into a hole; `snapPinModel` gives the
forces, and the barb's back angle decides whether it holds for good (90) or can be pulled apart (45, the default,
which also prints standing with no overhang).

## What the models are good for

Beam theory and the pseudo-rigid-body model, good while a flexure's travel is a few times its thickness; past that,
the elastica above for a leaf (the other flexures' large-deflection models are on the roadmap). The material's strain limit
is yours to set: PLA is brittle and creeps when held bent; PETG and nylon last far longer; living hinges want TPU or
polypropylene. Measured limits, with their sources, belong in the material's rule set.

## Sources

- Howell, L. L., *Compliant Mechanisms*, Wiley, 2001: the pseudo-rigid-body model, the fixed-guided beam, the
  parallel guide's drop.
- Smith, S. T., *Flexures: Elements of Elastic Mechanisms*, CRC Press, 2000: notch hinges and their stress.
- Bisshopp, K. E., and Drucker, D. C., "Large deflection of cantilever beams", *Quarterly of Applied Mathematics* 3(3), 1945: the elastica of a cantilever under a tip load.
- Paros, J. M., and Weisbord, L., "How to design flexure hinges", *Machine Design*, 1965: the notch hinge's stiffness.
- Jacobsen, J. O., Chen, G., Howell, L. L., and Magleby, S. P., "Lamina Emergent Torsional (LET) joint", *Mechanism and Machine Theory* 44(11), 2009: the LET joint and its stiffness as torsion and bending segments in series and parallel.
- Howell, L. L., Midha, A., and Murphy, M. D., "Dimensional synthesis of compliant constant-force slider mechanisms", *Machine Elements and Machine Dynamics*, ASME DE-71, 1994: the constant-force slider-crank.
- Lobontiu, N., *Compliant Mechanisms: Design of Flexure Hinges*, CRC Press, 2003: elliptical and other notch profiles.
- BASF, *Snap-Fit Design Manual*, and Bayer MaterialScience, *Snap-Fit Joints for Plastics*: the cantilever hook's deflection, insertion and removal forces.
- Young, W. C., and Budynas, R. G., *Roark's Formulas for Stress and Strain*, 7th ed., 2002: a rectangular bar's torsion constant and peak shear.
- Qiu, J., Lang, J. H., and Slocum, A. H., "A curved-beam bistable mechanism", *Journal of Microelectromechanical Systems* 13(2), 2004: the double curved beam and its bistability condition.
