# @rulecad/flexures

Compliant mechanisms for printed parts: flexures that move by bending instead of turning on a pin. Each one is a
JSCAD shape and a model: its stiffness, the strain its material sees at a travel, and the travel a strain allows.
Needs JSCAD, [`@rulecad/fea`](https://github.com/JoniBach/rulecad/tree/main/packages/fea) for its finite-element checks, and
[`@rulecad/fixings`](https://github.com/JoniBach/rulecad/tree/main/packages/fixings), whose snap pins it passes on. Part of [rulecad](https://github.com/JoniBach/rulecad).

```js
import { leaf, leafModel, parallelGuide, parallelGuideModel, serpentine, notchHinge, notchHingeModel, printable } from '@rulecad/flexures';

const spring = { length: 40, thickness: 1.26, width: 8 };          // mm: along x, bending along y, width up z
const pla = { E: 2680, strainLimit: 0.02, name: 'PLA' };           // MPa, and the strain it may see
const m = leafModel(spring, pla);
m.stiffness;        // 0.17 N/mm
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
| `cartwheel` | Two leaves crossing at a hub inside a rim, joined where they cross: a pivot that prints flat | 16 EI / s × (1 + 3 r / s + 3 r² / s²), N·mm a radian, spokes s from a hub r | 2tθ / s × (1 + 1.5 r / s) |
| `filletHinge` | A flat neck l long between notches with rounded corners: bends along the whole flat, so it turns far further than a notch as deep (Lobontiu 2003) | ∫ dx / EI(x) along the notch, N·mm a radian; EI / l with small rounds, the circular notch with no flat | the moment kθ at the neck, times about 1.2 for the corners (an estimate) |
| `hyperbolicHinge` | Notches whose neck thickens as a hyperbola: bends close to its middle, so it keeps its axis; stiffer and shorter in angle than an elliptical notch of the same size | ∫ dx / EI(x) along the notch | as `filletHinge` |
| `spiralSpring` | A strip wound round a hub, its outer end in a boss, ends thickened to twice the strip: a torsion return that prints flat | about EI / L (Wahl 1963); worked out with the hub's centre held (Castigliano), within 1% of the beam solver | the moment along the strip times t / 2EI; tθ / 2L when the hub floats |
| `pinnedLeaf` | A stiff link on two corner-filleted pivots: moves as a link on two pins, stiff along itself where a plain leaf buckles | the profile as a guided beam; near 2K / Lp² for pivots K = EI / l, Lp apart | the profile's, at the pivots' necks |
| `xyStage` | Two parallel guides in series at right angles: a stage that moves along x and y | `xyStageModel`: 2 E w t³ / L³ each axis; 2 E w t / L along the leaves | a guide's 3tδ / L², the worse axis; each guide's drop 3δ² / 5L strays the other axis |
| `splitTube` | A thin tube slotted along its length between closed collars, printed standing: a torsion pivot | G (2πr − s) t³ / 3L (Roark: an open section), about a hundredth of the closed tube's | √3 G t θ / L E (the shear as a tensile strain); warns that its twist shears the layers |
| `snapHook` | A cantilever with a hook: pushed in it deflects and springs back behind the catch | the leaf's; `force` at the undercut, `insertion` and `removal` with friction μ (BASF, Bayer) | 3ty / 2L² at the undercut y |
| `ratchetWheel`, `ratchetPawl` | Saw teeth on a pin and a leaf pawl: a one-way click | `ratchetModel`: the pawl's `lift` a tooth high and the `click` along the rim | the pawl's, at the tooth height |
| `foldedGuide` | A shuttle on two folds, each a beam out to a floating truss and back to an anchor: a compound guide in a shorter box | E w t³ / L³ | 3t(δ/2) / L²; no drift |
| `pinJoint` | A pin, a ring with an arm and a cap, printed in place a support gap apart: the joint to compare the flexures against | not compliant: `pinJointCheck` reads the printer's fit and support gap, and gives the ring's play | — |
| `snapPin`, `snapSocket` | A barbed, slotted peg that clicks into a hole, printed standing. These live in `@rulecad/fixings` now and are passed on here unchanged | `snapPinModel`: two snap hooks' worth of `force`, `insertion` and `removal` | 3ty / 2L² in each half |
| `travelStop` | Two posts at a leaf's tip where the strain limit says its travel must end, less a margin: the rule as a shape | — | `at`: factor × travel(strainLimit) |
| `contactLeaf` | A leaf with a stop bar beside it: free until the beam touches, stiffer after; two rates in one spring | `first` the leaf's, `second` a cantilever propped at the stop (12EI / b²(3a + 4b), b past the stop), meeting at `contact` | 3tδ / 2L² before contact, then the larger of the root's and the stop's moments |
| `parallelogram` | A four-bar with a notch hinge at each corner: the coupler moves sideways and stays parallel, rising a little | 4K / L² at the coupler | the hinges' at θ = asin(δ / L) |
| `tweezers` | Two arms on a fixed-guided spring: squeeze to close the jaws; the simplest compliant gripper | E w t³ / L³ at the fingers | 3tδ / L² at a squeeze δ |
| `gripperJaws` | Two jaws, each on a parallel guide with a stop both ways, resting closed and opened by a servo's double horn: the springs grip, so it holds with the power off | `gripperJawsModel`: the guide's 2 E w t³ / L³ in series with the bar's 3 E I / l³, the grip k (w - g) / 2 on an object w across | the guide's 3tδ / L² at the horn's stroke |
| `curvedLeaf` | A leaf drawn as an arc, so its rest is the middle of its working range: a spring that works from a loaded rest | E w t³ / 4L³ | 3tδ / 2L² from the curved rest, either way; `preset` t / 2ρ already in the curve |
| `angleStop` | Posts at a pivot's arm end where its strain limit says the turn must end, less a margin | — | `angle`: factor × angle(strainLimit) |
| `fourBar` | A four-bar on four short flexures: a crank-rocker turns a small swing into another; crank = rocker and coupler = ground make a parallelogram | `fourBarModel`: K = 1 / ∫ dx / EI at each joint, the crank's torque dU/dθ from the joints' ½ K ψ² | t ψ / 2l at the most turned joint (ψ its turn) |
| `sliderCrank` | A crank, a coupler and a slider on a parallel guide, every joint a flexure: a press near the toggle, a pump's stroke | `sliderCrankModel`: the joints' and the guide's energy; the push (T - dU/dθ) / \|dx/dθ\| | the joints' and the guide's 3tδ / L² |
| `bridgeAmplifier`, `rhombusAmplifier` | Four links on in-line flexures between input and output blocks (the bridge) or corners (the rhombus): the input pushed apart, the output comes together about cot α times as far | 2K / L² sin²α at the input; the beam solver's ratio beside cot α | t Δα / 2l, Δα from cos α' = cos α + u / 2L |
| `leverAmplifier` | One link on one flexure, pushed a from its pivot, its far end b out moving b / a times as far | K / a² at the input | t (u / a) / 2l |
| `tiltedBistable` | A shuttle on two straight leaves tilted toward it: pushed past the roots' line it snaps on and stays (Jensen and Howell) | 2 (EA/L sin²α + 12EI/L³ cos²α) at rest; the snap from the beam solver | the solver's, along the way over |
| `buckledSwitch` | A strip printed longer than its frame, squeezed past buckling when fitted: it bows either way, and switches with the same push each way (Vangbo) | buckles at 4π²EI / L²; rises (2/π) √(L s - π²t²/3); the snap from the beam solver | the solver's, fitted and switched |

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
// { force: 1.35, travel: 20, shortening: 6.6, angle: 0.79, strain: 0.018, stiffness: 0.068, centreline: [...] }
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

## Gripper jaws: a servo opens, springs grip

`gripperJaws` draws a two-jaw gripper for a hobby servo, printed flat in one piece. Each jaw sits on a parallel guide
(two leaves, so it slides without turning) and rests closed, its face half the gap `jaws.gap` from the middle. The
servo's double horn turns between the jaws' bars and pushes them apart to open. Let go, the guides spring back and
grip whatever is between the jaws. The servo only opens, so the gripper holds with the power off and the servo never
stalls on a load. Each guide has a contact stop both ways: a tongue from the root block between its leaves, its round
end in a slot in the moving fork, stopping the jaw `stop.open` out and `stop.close` in.

Why the horn opens and the springs close: a horn's arm pushes only with the round of its tip, and only in directions
within 90° of where the arm points. Turning between two bars it points outward at both, so its tip's top meets each
bar's flat inner face cleanly, with the lever r cos a. Pushing the jaws closed from between them would need the side
of the arm on a corner.

```js
import { gripperJaws, gripperJawsModel, flexureMaterial } from '@rulecad/flexures';
const p = { width: 16, leaf: { length: 37, thickness: 0.84, apart: 14, fillet: 1 }, bar: { inner: 14, width: 5 },
  horn: { reach: 18, open: 65 }, jaws: { from: 20, to: 30, gap: 2 }, stop: { open: 4.8, close: 0.85, tongue: 10 } };   // mm and degrees
const petg = flexureMaterial({ modulus: 1810, strength: 34, name: 'PETG', density: 1.27 });
const m = gripperJawsModel(p, petg, { torque: 0.1765, payload: 0.1, accel: 300 });           // an SG90, 100 g
m.stroke;     // 4.56 mm each jaw opens
m.grip(10);   // 2.73 N a jaw on an object 10 mm across
m.rated;      // 9.41: the narrowest object held twice over
m.at;         // where the root blocks, forks, stops and bars are, to build a palm round it
gripperJaws(p);                  // the shape, at rest; { part: 'ground' | 'upper' | 'lower' } for one piece of it
```

The model's findings, in the kit's one shape (`level`, `text`, `code`, `values`): `gripper.drive` (the stroke and
the push), `gripper.servo` (the servo against the springs, at full open where its lever is shortest and the springs
pull hardest), `gripper.bar` (a warning when the bar bends more than a tenth as much as the guide), `gripper.grip`
(what the grip holds, and on which sizes), `gripper.holds`, `gripper.stop` (each stop, and how far a jaw goes when
the servo drives the horn on past open at its full stall torque, as a stalled servo pushes, against `travelStop`'s 0.8 of
the strain limit: the horn turns until the stops hold it, or through to 90°, its toggle; held with less than the
margin asked while the toggle's travel is past 0.8, it warns), the leaves' print findings
(`flexure.lines`, `flexure.stop`, `flexure.strain`) and `gripper.mass`. `rests` names each default it leaned on.
Bad input is refused by name before any sums, with what would be accepted.

| Quantity | Formula | Source |
|---|---|---|
| Horn at rest | r sin a + tip = bar's inner face, so a = asin((inner - tip) / r) | geometry |
| Stroke | r sin(a_open) - (inner - tip) | geometry |
| Push on each bar | T / (2 r cos a), T the servo's stall torque times `share` (0.6) to open; driven past open, the whole stall torque | statics; the share is an estimate, as the kit's grip check's |
| Guide | 2 E w t³ / L³; its drop 3δ² / 5L | Howell 2001 |
| Bar | 3 E I / l³, I = w b³ / 12, from the fork to the jaws' middle | Young and Budynas 2002 |
| Jaw | 1 / (1 / guide + 1 / bar) | springs in series |
| Grip on an object w across | k (w - gap) / 2 a jaw, up to the widest that goes in, gap + 2 stroke - 2 print gaps | Hooke's law |
| Held | 2 μ grip against m (g + a), at the margin asked | Coulomb friction; μ 0.4 is an estimate |
| Tongue | 1 / ∫ (ℓ - s)² / E I(s) ds at its pin | unit-load method, Young and Budynas 2002 |
| Driven past open | each tip d = r sin a - (inner - tip) out; its jaw x from x + F(x) / k_bar = d, F(x) = k_guide x + k_tongue (x - stop) past the stop, the bar 3 E I / l³ from the fork's front to the tip (r cos a in front of the axis for the upper arm, behind it for the lower) | springs in series and in parallel |
| Held by the stops | (F upper + F lower) r cos a = the stall torque, the first angle it reaches it; if it never does, the horn turns to 90° and d = r - (inner - tip) | statics |

The grip rises with the object's width, so the gap at rest picks the sizes a gripper is for. The arm's jaws
(below) rest 2 mm apart: 50 g held twice over from 5.7 mm across, 100 g from 9.4 mm, up to 10.5 mm.

### Against the arm's hand-built gripper

The workspace example `examples/bench` has both on the arm: `arm/gripper`, drawn by hand (each finger on one long
leaf, the horn closing them), and `arm/jaws`, this generator with a palm round it (the same yoke block and screws,
the same SG90 and horn, the servo on two posts above the print). `arm/jaws-check` sweeps the horn from rest to open:
nothing collides, and the horn clears the front post by 0.5 mm at rest.

| | Hand-built `arm/gripper` | `arm/jaws` |
|---|---|---|
| Printed | 37.1 g in one print (3 pieces in its check) | 53.5 g in one print: 39.3 g of jaws and stops, 14.2 g of yoke block, spine and posts |
| Grip | 1.46 N a finger, on anything up to 8 mm | 0.68 N/mm a jaw past the 2 mm gap: 2.05 N at 8 mm, 2.91 N at 10.5 mm |
| 50 g at 300 mm/s² | 2.3 times over | 2 times over from 5.7 mm across |
| 100 g (the upright arm's payload) | 1.2 times: warns | 2 times over from 9.4 to 10.5 mm across |
| Rests on | the lever 0.38 (an estimate) and μ 0.4 | μ 0.4 and the servo's share 0.6 (estimates); no lever |
| Contact | the horn's arm passes through the finger's flat (25 mm³ overlap allowed in its check) | the horn's tip on the bar's flat face |
| Servo | holds the grip, stalled, while it carries | opens, then lets go; 2.1 times the springs at full open |
| Stops | none | both ways on each jaw; the servo driven on at its full torque stalls at 69° with a jaw at 4.98 mm, which bends the leaves to 75% of their strain limit; the stops resist 2.16 times its stall torque |
| Tool point | 85 mm from the yoke's screws | 105 mm |

Swapped into the upright arm (`arm/arm-upright`, the jaws on the forearm's yoke in the gripper's place), with the
arm's tool mass (`lift.tool_mass`, 0.148 kg with the hand-built gripper) raised by the jaws' extra 16.4 g to 0.164 kg,
the arm still checks clean: nothing collides through its poses, the shoulder's motor has 2.13 times the torque it
needs (1.204 N m against 2.563; 2.22 times with the hand-built), the elbow's 5.57 times (6.88), the tool still reaches
its whole box with 66 mm to spare, and the accuracy budget moves from 2.361 to 2.376 mm against 2.5.

So it can replace it: it holds the upright arm's 100 g where the hand-built one warns, with no estimated lever and no
stalled servo, at 16.4 g more and 20 mm more reach. What it gives up is range: twice over at 100 g only on objects
9.4 to 10.5 mm across. A different object size wants a different gap at rest.

## Linkages, amplifiers and things that click

A compliant linkage is a rigid machine with each pin replaced by a short flexure. The pseudo-rigid-body model
(Howell 2001, chapter 5) moves its links as the rigid machine's would, and puts a torsion spring at each pin: a joint
of length l and thickness t is as stiff as 1 / ∫ dx / EI along it, which is EI / l without rounds, and a turn ψ
strains it t ψ / 2l. The input needs the torque the springs' energy asks. Each joint's flexure lies on the line halfway
between its two links, and rounds into a disc (a knuckle) on each, so no corner it meets is square. Every model here
also runs the beam solver on the drawn flexures, where the springs-and-pins sums stop being enough.

```js
import { fourBar, fourBarModel, bridgeAmplifierModel, tiltedBistableModel, buckledSwitch, buckledSwitchModel } from '@rulecad/flexures';

const pla = { E: 2680, strainLimit: 0.02, density: 1.24, name: 'PLA' }, flex = { length: 6, thickness: 0.84 };
const m = fourBarModel({ ground: 40, crank: 15, coupler: 40, rocker: 30, angle: 60, width: 6, flex }, pla);
m.kind;          // 'crank-rocker'
m.swing;         // [11.2, 11.9] degrees down and up before a joint reaches 2%
m.torque(10);    // 75.6 N·mm at the crank, 10° on (the beam solver: 75.5)
```

The figures for that four-bar, and for one of each of the others, all in PLA, 6 mm wide, joints 6 mm by 0.84 mm:

| Part | What the model says | Grams |
|---|---|---|
| `fourBar`, links 15, 40, 30 on 40 | each joint 159.9 N·mm a radian; swung ±9.0° (0.8 of the limit) the rocker turns 3.4° | 5.2 |
| `bridgeAmplifier`, links 20 at 10° | cot 10° = 5.67; over 0.1 mm the rigid links give 5.93 and the drawn flexures 5.76; the links lie flat at 0.608 mm of input | 5.7 |
| `tiltedBistable`, leaves 30 at 8° | rises 4.18 mm; 7.39 N switches it, 1.00 mm in; it rests again 5.95 mm down, and 1.21 N brings it back (1.82 N on a rigid frame); 1.65% on the way | 13.7 |
| `buckledSwitch`, strip 50 squeezed 0.4 | the frame gives 0.082 mm; the strip pushes its pockets with 15.8 N and bows 2.19 mm; 7.00 N switches it either way; 1.62% | 10.6 (strip and frame) |

- **The slider-crank** pushes its slider with (T - dU/dθ) / |dx/dθ| for a torque T at the crank (virtual work). The
  push grows as the crank and coupler come into line, the press's toggle. The slider rides a parallel guide, so it
  drops 3δ² / 5L at a stroke δ.
- **The bridge and the rhombus** move their outputs cot α times their input for the rigid links. The flexures stretch
  and shear a little, so the drawn bridge gives less (the solver's `solved`). A bridge pushed past flat toggles, and
  the model fails it by name.
- **The tilted-leaf bistable** prints stress-free, one piece. Pushed, its leaves squeeze and buckle. Past the line
  between their roots they push on, and it rests again short of twice its rise, because its leaves stay bent there.
  The model nudges each leaf a thousandth of its buckling load: a printed leaf has a bow to start from, where the
  solver's perfectly straight one would not. The frame is in the solver too. The leaves push their roots outward a
  few millimetres above the frame's bar, so the bar bends and the root blocks turn out, and the leaves are squeezed
  less. A bar 6 mm deep gives about 96 N/mm at each root (a² l / EI, a the roots' height over the bar's middle line,
  l the bar from the middle to a block), a fifth of a leaf's 450 N/mm along its length, and the part springs back.
  So the bar is 20 mm deep by default, and the model takes the frame as sat on its two blocks, free to spread and
  turn there: the `bistable.frame` finding gives the pull back against a rigid frame's and warns when the frame
  takes over half of it. Screwed down flat, the frame gives less, and the part comes nearer the rigid figures.
- **The buckled-beam switch** is two prints. The frame's pockets hold the strip's tabs `squeeze` nearer than they
  print, so fitted the strip is squeezed past buckling and bows. Its two states are mirrors, so it switches with the
  same push each way. A stem from its pad slides in a slot in the frame's top, which keeps the pad square, and a round
  knob on the stem is what you push and pull. The frame gives a little under the strip's push, and the model takes that
  off the squeeze (a beam sum on the frame's C). The tabs are taken as held square: a press fit, an estimate.

| Formula | Where it is used | Source |
|---|---|---|
| K = 1 / ∫ dx / EI(x); EI / l without rounds; strain t ψ / 2l | each joint | Howell 2001, small-length flexural pivot |
| cos μ = (b² + c² - BD²) / 2bc; keep μ within 40° to 140° | four-bar transmission angle | Norton, *Design of Machinery*, a rule of thumb |
| x = r cos θ + √(l² - (r sin θ - e)²); F = (T - dU/dθ) / \|dx/dθ\| | slider-crank | rigid kinematics; virtual work |
| v = 2L (sin α - sin α'), cos α' = cos α + u / 2L; k = 2K / L² sin²α | bridge, rhombus | rigid kinematics; the joints' energy |
| k = 2 (EA/L sin²α + 12EI/L³ cos²α) | tilted bistable at rest | two fixed-guided beams |
| δ / H = a² l / EI | tilted bistable's frame: a root's move out for its thrust H | the bar a cantilever from its middle under the moment H a |
| P = 4π²EI / L²; h = (2/π) √(L s - π²t²/3) | buckled switch | Euler, clamped ends; first buckled mode |

Left for later: the Young bistable and tristable mechanisms, the tensural bistable, compliant gear teeth and clutches,
and force-sensing beams.

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

### Shaped beams: tapers and rounds

A leaf, a fixed-guided beam and a parallel guide's leaves take three more parameters. `taper` (0 to 1) shapes the
beam's thickness to its bending moment: at 1 it is a uniform-strength beam, thick where it bends most and thin where it
bends least, so the strain is the same all along it. `least` is the thinnest it may get (the thinnest wall that
prints). `fillet` rounds the beam where it meets its block, at each end that's held, and `into` runs it on into the
block so they join. `thickness` is then the most it is.

A square inside corner, where a bar meets its block, concentrates the strain. On a printed part that corner is where
it yields and stays bent. A round of about the beam's thickness brings it back to beam theory's. A fully tapered beam
bends 1.7 times as far as a bar before it reaches the same strain, and stores 1.7 times the energy. `beamModel`
integrates the beam's own profile, rounds included, and `size.forTravel` takes a `shape` to size one.

```js
size.forTravel('parallelGuide', { travel: 12, energy: 50, width: 14, material: petg, shape: { taper: 1, fillet: 2, least: 0.84 } }, x1c);
// 71 mm leaves, against 88 for bars
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
  driver jams. A follower gives on from wherever its state puts it, on either side of rest (a pusher that runs on
  past rest, and can also be cammed back).
- **Rounds:** `round` rounds every inside corner of the ground and the bodies to that radius, so no thin arm meets its
  body at a square corner. A flexure given a `fillet` has every inside corner of its own rounded to it, wherever its
  parts meet.
- **Friction, the cautious way:** what must move is checked sticky (a ramp must still push a latch aside at 0.5),
  and what must hold is checked slippery (a catch must still hold at 0.1).

The findings, each pass or fail with its code:

| Code | What |
|---|---|
| `lamina.free` | At rest, everything clears what it isn't joined to by the printer's gap, and each flexure touches only its two bodies, in one place each: else it prints fused |
| `lamina.attached` | Each flexure runs into its bodies, not just along an edge (an edge join prints as two pieces) |
| `lamina.seat` | Each curve's end flare and run on lie inside its body (a seat added where they wouldn't); one hanging out of a frame drawn as it is fails |
| `lamina.sequence`, `lamina.collide` | Nothing runs into anything in any state or on the way; a step into a state a catch holds may settle on the catch |
| `lamina.jam`, `lamina.follow` | No driver jams on a follower, and no follower has to give past its limit |
| `lamina.holds` | A catch holds: the joint pushing back towards rest jams on it. It says the least friction it holds at, and how far the catch must move to let go. A catch that bites presses into what it holds as it's moved: what it holds is cammed back out of it first |
| `lamina.strain` | Each flexure's strain at the most it is moved, against the limit, by beam theory |
| `lamina.peak` | Each flexure's real peak strain, by finite elements: the flexure and a band of each body it meets, laid on a grid of squares, held beyond the band at its root and pushed at its tip to the travel it reaches. A peak at a square inside corner fails: the strain there has no bound, and it's where a print yields. A spiral spring's hub, or a body turning about its own middle, is not a push along a line: it says so (info), and its strain is the model's |
| `lamina.coils` | A spiral spring's coils close up as it winds: a warning with their gap at rest, since the stop sweeps the bodies and not the coils. Stop it before they touch, and check a wide turn with the beam solver |
| `lamina.stop` | Something hard stops each flexure before its strain limit, scaled by its finite-element peak (swept from rest, so a stop that is jumped over doesn't count) |
| `lamina.energy` | What each state stores, and the forces |
| `lamina.force` | The force a hand needs along each driven step, from the physics: a force curve. Over a hand's 50 N, it jams |
| `lamina.release` | Where a body is let go of on the way (a latch letting go), and how far the hand had moved, with what force |
| `lamina.held` | Let go of in a state a catch holds, the body stays, and the force the catch takes (the physics, with `physics.friction` or frictionless, so cautious) |
| `lamina.bite` | Which way the held load pushes the catch: from the physics' contact forces, normal only, against how each contact point moves as the catch lets go. Under `check.bite` (5°) into the catch, it holds by friction or its own spring alone, and a printed catch slips |
| `lamina.carried` | A loose part (a disc) is held over and under, its middle over a bridge and a floor, loaded and all through the shot while it's in the frame |
| `lamina.trip` | Pulling the trigger lets the catch go: how far and how hard the finger pulled, against the force the catch held |
| `lamina.holes` | Each fastener hole through a flooded frame is all frame: inside the outline, clear of the moving parts' room |
| `lamina.home` | At the end of the sequence, everything is back where it started |
| `lamina.beams` | Each flexure's strain all the way through, bending as far as it bends |
| `lamina.requires` | A driven step's force curve does what you asked: its peak, its click (the fall after the peak), its end |
| `lamina.fire` | Let go and stepped through time: each body's top speed, and the disc's exit speed and energy against a limit. A disc given less than `fire.least` (default a quarter) of what the springs stored fails, saying where the rest is as it leaves |
| `lamina.room` | In every frame, planned and as the physics moved it, the shot included, nothing that moves runs into the frame deeper than half the gap (a flexure where it's anchored aside) |

It returns the printed `parts` (`body`, the drawing extruded, after an optional `finish` for 3D work such as holes
through it, and any `loose` parts), the `findings`, the `energy` in each state, and `frames` along the sequence with
the flexures drawn bent, for an animation. A design that returns it is checked by `cad check`, and `cad animate`
plays its sequence. The plane's geometry is manifold-3d's (Clipper2): JSCAD's 2D booleans are not robust enough for
clearance checks a tenth of a millimetre fine.

The launcher's flat action is a worked example (examples/bench/projects/launcher/objects/flat.js): a pusher on a
two-leaf spring, a tab to cock it, and a trigger that is its own sear, with a catch that leans back so it holds
however slippery the plastic. examples/bench/projects/mechanisms has a key with a tactile click and a wave spring.

### As it would behave: the physics

The kinematic checks above move each joint the way its model says and look for collisions. `lamina` then solves the
mechanism as it would behave (`physics.mjs`): each flexure with a centreline (leaf, fixed-guided, guides, serpentine,
wave spring, pivot pair, shaped or not) becomes a chain of large-deflection beams (`beams.mjs`), each body a rigid
body, and everything touches everything it meets, flexures themselves included. A hand works it through the sequence:
a joint the next state sets to a new value is driven there; one it keeps is held; one it drops, or one a catch holds
in the next state, is let go of, gradually, so the mechanism finds where it rests. The hand's force along each driven
step is the force curve; the frames are the solved shapes, each flexure's outline bent along its centreline.

- `kinematic: false` leaves how it moves to the physics alone, for contact that pushes a part either way (a cam).
- `requires: [{ step: 'rest>pressed', joint, peak: [least, most], click, end }]` checks a force curve: a key's feel.
- `free: { disc: { shape, mass } }` adds parts that aren't printed or joined (a disc): the physics only.
- `fixtures` are fixed shapes the physics sees but the print leaves out (another layer's walls).
- `flood: { outline, keep, clear, least }` floods the frame: everything inside `outline` is solid except the room
  the moving parts sweep through the sequence (grown by `clear`, the print gap, or a sliding fit by part's name), and
  the spaces `keep` holds open. The bodies sweep where the kinematic model puts them; each flexure sweeps its real
  bends, the beam solver's, with every body held where it is meant to be at each frame (a folded spring doesn't bend
  as a smear from root to tip, and room cut for that shape leaves frame in its way). `lamina.room` then checks every
  frame, planned and as the physics moved it, the shot included. Slivers thinner than `least` and islands that would print loose are left out. A thin
  frame bends and spoils the mechanism; a flooded one is as stiff as its outline, and its pockets are the moving
  parts' stops and guides. Leave out the outline and it's everything the moving parts reach, a `wall` round it. Leave
  out `ground` too: each flexure's root gets a block behind the face it grows from, found from its root port. List
  as states everything the parts reach (a shot's overshoot too), and keep open what the mechanism doesn't sweep (a
  disc's way out, room for a finger). With `band`, the frame is a web: solid only that far round the moving parts'
  room, the kept spaces and the outline's edge, the rest rounded windows (none narrower than the band). `holes:
  [{ at, diameter, wall }]` go through the frame for fasteners, each in a solid boss `wall` thick that no window opens
  into: snap pins holding a plate either side, should a frame ever need one. Each is checked to be all frame.
- `bridges: [{ shape, depth, gap }]` prints the frame over a moving part on the top layers: a barrel's roof over a
  stem, so it can't lift out of its channel. Every body that passes under one is cut down by `depth` (six layers) and
  `gap` (three layers), along all of it that ever passes under. Each bridge must stand on the frame both sides, span no
  more than the printer's `bridge`, and not cross a flexure. With `side: 'bottom'` it's a floor on the bottom layers
  (on the bed, so it spans nothing), and what slides over it has its underside arched up at 45° along the way it
  moves, clear of the floor all along: each layer overhangs the one below by no more than it rises, so it prints with
  no support. A floor and a bridge close a barrel on both faces; they need their own stretches of what passes them.
  With `body: 'slide'` it is that body's strap: from it, over or under another, to a post of its own standing in a slot
  there (a clevis), moving with it. With `strap: true` it is the frame's strap: from the frame to a post of the frame's
  (drawn as `ground`, or in a flooded frame as `flood.posts`) standing in a slot in what slides, so a pin in a slot guides it and the two straps, over and
  under, keep it in the plane. What passes a strap is cut back a gap all round it: flat under an upper strap (the
  pocket's floor is built up from the bed), and over a lower one with a ceiling that slants in from the pocket's walls
  at 45°, a layer in for each layer up, so no ledge hangs flat in the air beside the slot. Across the pocket that roof
  is no taller than the pocket is wide; an arch along a long travel would stand taller than the print.
- The frame is checked under the mechanism's own forces: at the end of each step, what the flexures pull on it with
  (from the beams) loads it as an elastic plate as tall as the print, held where a hand holds it (`grip`, or its back
  quarter), and every gap to what moves (loose parts too, a disc in its channel, carried along as the frame round it
  moves, so what counts is its channel closing on it) is rechecked on the frame as it bends.
  A frame that closes onto what moves, prongs either side of a channel pulled together, fails. `check.frame: false`
  turns it off.
- Every moving body is pushed across the plane, at its farthest point from what holds it, by the hand's pull 15° off
  the plane (`check.side` to set it). A lamina's flexures are stiff bending across the plane but soft twisting, so a
  body on long thin arms tips out of it. The body or the flexures holding it, whichever moves further: over the print
  gap it warns, over 1 mm it fails. Bridges hold a body from lifting, floors from dropping, guides both ways, each only
  once the body has moved across its play (the print gap, or the bridge's own): held rigidly, a printed part looked
  held where it wobbles. `check.across: false` turns it off.
- A loose part lying in the plane (a disc) needs holding on both faces wherever it goes in the frame: `lamina.carried`
  fails it where its middle isn't over a bridge (`bridges`) and over a floor (a bridge with `side: 'bottom'`), loaded
  or during the shot, until it leaves the frame.
- `guides: [{ body, shape, depth }]` trap a sliding body across the plane: where it passes through `shape`, a ridge
  on its sides with 45° flanks (`depth`, centred on the print's height) runs in a matching groove in the frame's wall.
  Both are drawn out from the same faces by the same amount at each height, so the gap stays the gap, and each flank
  prints without support. The out-of-plane check counts a guided stretch as held both ways.
- Every rigid part is checked for free ends: an arm narrower than `check.rigid` (3 mm) tied on at one end only bends
  under load, so it's a warning.
- `physics: { friction }` adds friction to every contact (Coulomb, μ, smoothed over a hundredth of a mm): each point
  touching a body at the start of a step is anchored there, and sliding from it costs μ times the push it touched with.
  A trigger then pulls against what its sear's face drags, and a catch holds on friction as well as its shape. The
  shot is solved without it.
- `grips: { joint: [x, y] }` says where a hand takes a joint's body to drive it (a trigger's blade, where the finger
  pulls), so its force curve is the finger's. Default: the body's centre.
- A catch that holds tells the force it takes (`lamina.held`: the flexures' pull on what it holds). A step that lets a
  body go (`lamina.release`) and leads into the state a shot fires `from`, with no `hold`, trips the shot: it fires
  from the step before, the finger going on where it was going, so the pull, the let-go and the shot are one sequence
  (`lamina.trip`: how far and how hard the finger pulled, against what the catch held; the disc's time to leave is
  then the lock time).
- `fire: { from, disc, hold, most, least }` lets go from a state, with a finger keeping `hold`'s joints where it says, and
  steps through time (masses from the material's `density`; explicit steps short enough that a sound wave doesn't
  cross the shortest beam element in one, with whatever mass Gershgorin's bound still asks for added to the lightest
  flexure nodes): the speeds, and the disc's exit speed and energy, taken when it last parts from everything. A shot
  that starts with the disc pressed into the drawn pusher fails: it would be thrown with energy the spring never
  stored. `seat: [dx, dy]` lays a loose part where it would rest before the shot, moved that way until it just touches
  what pushes it (a disc dropped in its slot slides back on to the nose): left a gap, it is struck and bounces off
  early, which no real loading does.
- `physics: false` turns it off.

The slow stages are kept between builds when a store is given, `laminaCache({ get, put, salt })` (cad gives one,
in the workspace's `.cache/stages/`): the physics (about 17 of a launcher's 22 minutes), a flooded frame's probe
(the mechanism solved once more without the frame, for the room it needs), the kinematics (the sequence walked,
each state, the latches, the strain and stops) and the frame's finite elements. Each is keyed by what it is made
from (the mechanism in the plane: parts, joints, states, sequence, holds, material, height, the checks' settings;
nothing of the straps, guides or finish, and for the kinematics nothing of the physics) and by `salt`, which is
this library's own code, so a change to a strap, a check after them or a rule's words finds them at once, and any
change to what they were made from runs them again. What a stage keeps is JSON (its findings, and what the later
stages read of it, typed arrays as arrays), and a build gets the same copy whether it came from the store or was
just made. `LAMINA_TIMES=1` prints each stage's time.

The beam solver stands on its own too: `beamSystem({ bodies, beams })`, `equilibrium(sys, { held, loads })`
(Newton's method on the energy; a held unknown reports the force to hold it). It agrees with beam theory at small
deflections, with the elastica to 0.1% at large ones, with a parallel guide's stiffness and drop, and buckles a
column at the Euler load.

### Modules

`place(module, { name, at, angle })` turns and moves a sub-mechanism (its ground, bodies, joints, followers, states
and named `ports`) and prefixes its names; `combine(placed, extra)` joins placed modules into one lamina spec. The
push-push latch is built from a plunger module and a track module placed at the plunger's pin port.

### More flexures

- **`pivotPair`:** two leaves on lines that meet at a point, so what they hold turns about that point though nothing
  is there: stiff along the leaves, soft turning. A point beyond the tips bends each leaf into an S, (t/2)(6d + 4L) / L²
  strain a radian, d the tips' distance from the point: long leaves, tips near the point.
- **`waveSpring`:** legs across joined by round U-bends, the thickness grading smoothly to the bends'. Squashed along
  its stack it stacks solid when its legs meet: its own stop, which the physics sees.

### Springs that turn, and hinges that bend further

- **The spiral, not the helix.** A helical torsion spring is the wrong answer on a filament printer: lying on its side
  every coil needs support under it, and standing, its coils bend across the layers' bonds, where a print is weakest.
  `spiralSpring` is the flat alternative: a strip wound round a hub, bending within its layers. With the hub on a shaft
  (its centre held) the strip bends a little more on one side than the other; the model works that out (Castigliano
  on the strip as drawn) and agrees with the beam solver within 1%. Its coils need a gap of at least the printer's at
  rest (`gap`, measured on the outline, about pitch less 1.5 × thickness by the thickened ends). Each end is
  thickened over a quarter turn, so it takes 1.25 turns or more: with fewer, the two thickened ends lie side by side; as it winds they crowd to one side, so check a wide turn with the solver. In
  the beam solver, 3 turns of 0.84 mm at a 2.5 mm pitch closed their narrowest gap from 1.24 mm to 0.83 mm at 1.2 rad.
- **Hinges by their notch.** The circular notch (`notchHinge`) bends at one thin point. The corner-filleted hinge
  (`filletHinge`) bends along a flat, so with a 4 mm flat it turns four times as far at the same strain as a circular
  notch as deep. The hyperbolic hinge (`hyperbolicHinge`) is the other end: stiff and precise. The elliptical hinge
  sits between.
- **A link on two pins, with no pins.** `pinnedLeaf` is a stiff link with a short flexural pivot at each end (Howell's
  small-length flexural pivots), for a linkage's links: it carries load along itself, which a plain leaf would buckle
  under.
- **A twist about an axis.** `splitTube` twists about its axis about a hundred times more easily than the same tube
  closed. It prints only standing, and then its twist shears the wall along the layers: test it, or allow it less
  than the strain limit says. The LET joint is the flat alternative.

### Shaped by the solver: curves

A `curve` flexure is a spline through a few points, its thickness easing from point to point. It has no straight runs
and no corners. `start` and `end` set the directions it leaves its root and meets its tip, held for a short lead so it
meets each block square. `mirror` adds its mirror image across a line, so two arms either side of an axis pull
together and their sideways pulls cancel. A curve has no formula, so its model is the beam solver's: its stiffness,
its strain and energy at a travel, and the travel a strain allows, large deflections and all.

`shapeCurve(job)` finds the curve for a job. Its ends stay fixed: where it grows from and what it moves. It gets a box
of room, a travel, an energy to store there, and a range of thicknesses. CMA-ES then moves every point and thickness
until the beam solver says it stores the energy with the least peak strain, inside its room. No bend may be tighter
than `bend` thicknesses (default 2), where a curved beam's inside fibre takes much more than beam theory says. No two
parts of it may come within `apart` of each other (default 1 mm), at rest or fully moved: nearer, they may print fused
and slap together when it fires. Each end leaves its block square for `lead`, and flares into it in a true round
(`fillet`). That round is drawn for a face square to the end, so in a lamina each body a curve ends on gets that face: a
seat, a block square to the end as wide as the flare and a margin, running in past the run on, rounded into the body.
Where the body is already there it disappears into it. Where the end is oblique to the body's edge, or near it, the seat
stands out of it as a shoulder, and `lamina.seat` says so. A flooded frame builds its own block at each root; those
ends are only checked. The lamina also checks that a curve keeps the print gap from itself. Give `width`
as a range and it is solved at the widest, then printed as tall as the energy needs: force goes with height, strain
doesn't.

With `moves: 'turn'` and `about: [x, y]`, its tip turns `travel` degrees about that point, as a lever on a hinge there
would, and its force is the moment: a spring that is a hinge, shaped to put the hinge where you want it.

A plain `leaf` joint takes `gamma`, where along it its tip turns about (from the tip, as a share of its length): 0.85,
Howell's, for a leaf pushed at its tip; ½ for one turned by a moment, which bends round evenly about its middle. The
launcher's sear hangs on such a leaf, on the line its catch is pushed along: the spring's pull is the leaf's tension,
and a trigger blade turns it.

Give it `onRound` to watch it work: after each round it's told every shape tried, and the best so far (its path,
thickness, drawn-back shape, strain and energy), and returning true stops the search. `@rulecad/cad`'s `liveShape`
serves a page that draws them as they come, with a stop button.

Free-form points wander into tangles, so start it from a shape of the right kind. `meander({ root, tip, legs, lo, hi })`
folds an arm into its room as legs joined by round bends. Each arm must be long enough to spread the travel's strain
(for a 12 mm stroke at 1%, 14 cm or more of a three-line arm), and a meander is how that length fits. From there the
shaping moves everything. The launcher's in-line action (`launcher/inline`) is shaped this way, from five legs.

```js
const job = { root: [44, 35], tip: [0, 5], start: 270, end: -90, region: { lo: [-18, 5.6], hi: [46, 35] }, gap: 0.3,
  thickness: [1.26, 4], moves: 'x', travel: -12, energy: 50, mirror: 0, width: [10, 20], margin: 0.8,
  guess: meander({ root: [44, 35], tip: [0, 5], legs: 5, lo: 7.5, hi: 33 }) };
const r = shapeCurve({ ...job, material: petg });
// r.params: the curve, ready for a lamina joint ({ kind: 'curve', params: r.params }); r.width, r.energy, r.strain
```

## Joints that aren't flexures

`pinJoint` prints a pin, a ring with an arm and a cap as one piece, the ring a clearance from the pin and a support
gap off the base and under the cap, so it breaks free with a twist and turns with a little play. It is the joint to
compare the flexures against, and the one to use where a part must turn further than any flexure lets it (the
constant-force mechanism's crank). `pinJointCheck(joint, printer)` says whether the clearance meets the printer's fit
and the gaps its support gap, and how far the ring can rock. `snapPin` and `snapSocket` join two printed parts with a
click: a barbed peg split down the middle, each half a snap hook, pushed into a hole; `snapPinModel` gives the
forces, and the barb's back angle decides whether it holds for good (90) or can be pulled apart (45, the default,
which also prints standing with no overhang).

**Where snap pins live.** A snap pin's job is to hold two parts together, so `snapPin`, `snapSocket` and
`snapPinModel` moved to [`@rulecad/fixings`](https://github.com/JoniBach/rulecad/tree/main/packages/fixings), with the
snap-hook sums they need written there. This package passes the same three functions on, so `v.flexures.snapPin`,
the launcher and the joints sampler draw exactly what they drew before. Use fixings for a new design: there a snap
pin is also named (`snap pin 4x6`), its socket takes its clearance from the printer's `snap_clearance`, its mass and
its push-in and pull-out forces are reported, an assembly's fit can name it, and the holds coupon
(`examples/bench/projects/benchmarks/objects/holds-coupon`) measures its socket and barb. Everything whose bending is
its job stays here: `snapHook`, the ratchets, `pinJoint` printed in place, and the travel and angle stops. The annular
snap, a lid that clicks on to a round box (issue 76), holds two parts together too, so it was built in fixings
(`annularSnapModel`, `annularBead`, `annularGroove`) and is not passed on here.

In a lamina, a curve joint given a `pin` turns on a pin printed in place instead of bending about its own middle:
`{ kind: 'curve', params, from: 'slide', to: 'pawl', pin: { d: 3, at: [x, y], under } }`. The post stands on the
`from` body and the `to` body has a hole round it, the printer's fit (`printer.fit`, or `clearance`) wider. In 3D the
post stands on a floor (`under`, a 2D shape from the post to its body, `base` thick, six layers by default) and is
capped by a cone flaring out at 45° by `lip` (1 mm). The carried body is cut back a support gap (`lift`) over the
floor wherever it ever passes over it and under the cap. The pin carries the load: in the physics it is a stiff tie
between the two bodies at the pin's centre, free to turn. The curve only springs the turn (a pawl's bias), so its
strain comes from the physics rather than its own model. `lamina.pin` fails a post with no floor joining it to its
body, and reports how tall the carried body turns on it. Across the plane, the cap and the floor hold the carried
body to the post's body after their lift.

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
- Lobontiu, N., *Compliant Mechanisms: Design of Flexure Hinges*, CRC Press, 2003: elliptical, corner-filleted and hyperbolic notch profiles.
- BASF, *Snap-Fit Design Manual*, and Bayer MaterialScience, *Snap-Fit Joints for Plastics*: the cantilever hook's deflection, insertion and removal forces.
- Wahl, A. M., *Mechanical Springs*, 2nd ed., McGraw-Hill, 1963: flat spiral springs, the moment and stiffness EI / L with the outer end clamped.
- Young, W. C., and Budynas, R. G., *Roark's Formulas for Stress and Strain*, 7th ed., 2002: a rectangular bar's torsion constant and peak shear, and an open thin-walled section's (the split tube).
- Qiu, J., Lang, J. H., and Slocum, A. H., "A curved-beam bistable mechanism", *Journal of Microelectromechanical Systems* 13(2), 2004: the double curved beam and its bistability condition.
- Jensen, B. D., and Howell, L. L., "Bistable configurations of compliant mechanisms modeled using four links and translational joints", *Journal of Mechanical Design* 126(4), 2004: bistable compliant mechanisms, among them a shuttle on two leaves.
- Vangbo, M., "An analytical analysis of a compressed bistable buckled beam", *Sensors and Actuators A* 69(3), 1998: the squeezed strip and its snap.
- Norton, R. L., *Design of Machinery*, McGraw-Hill: Grashof's condition and the transmission angle.
