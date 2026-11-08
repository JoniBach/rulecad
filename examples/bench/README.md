# The benches

Test blocks for rulecad's topology optimisation, printed and load-tested on one rig: four levers (2D, flat) and
four wall brackets (3D). Every object here is in the `bench` project; the rules they share are in `rules/bench.json`.

## The lever bench

A test block for rulecad's topology optimisation (`cad optimise`, @rulecad/topopt), built to be measured. Four
specimens weigh the same, fit the same envelope and are held and loaded the same way. The only difference between them
is where the material is. Print them, hang weights on them and read a dial gauge. The results show whether the
optimiser makes a stiffer part, and how close its predictions are for printed parts.

### The specimens

Each is a cantilever lever, 6 mm thick and printed flat, inside a 140 × 40 mm envelope (`rules/bench.json`). It is
held by two M5 bolts in line at one end and loaded through an M4 bolt 120 mm from the first, in its own plane (the
specimen stands on edge in the rig). Each fills half the envelope: 16,800 mm³, about 21 g of PLA. `cad check` holds
every specimen's volume to within 1% of that.

| | Object | What it is | Predicted stiffness, straight down |
|---|---|---|---|
| A | `bench/lever-bar` | A plain bar of the same length and mass. Its prediction is the simplest and surest (it's close to beam theory), so it also measures your printed material's stiffness. | 28.2 N/mm |
| B | `bench/lever-plate` | The whole envelope with a row of four windows: the usual hand-made lightening. | 3.72 N/mm |
| C | `bench/lever` | The stiffest layout the optimiser finds for the straight-down load (`problems/lever.json`). | 100 N/mm |
| D | `bench/lever:both` | Optimised for a second load too, 45° from straight down. | 99.3 N/mm (191 N/mm at 45°) |

The predictions are from `cad check` (the analysis in @rulecad/fea, with Bambu Lab PLA Basic's data sheet modulus,
2680 MPa), verified: each specimen is analysed on cells smaller than the optimiser's (0.5 mm for the levers, 0.8 mm
for the brackets) and again on cells a quarter bigger, and its stiffness has settled to within 5% (one exception,
below). Each specimen's report is in `.preview/bench/` after `cad check`: peak stress and where, safety factor, and
the largest movement. They change when the material rule changes.

The lightened plate (B) is the one to watch: under 20 N its peak stress is 25 MPa, 1.5 times under PLA's strength, at
the corner of a window. Load it gently: at about 2 kg it may crack, which is a result in itself. `cad optimise bench/lever` draws the optimised layout in
`.preview/bench/`.

### The rig

- `bench/rig`: a wall on a base. G-clamp the base to a bench so the wall's end is at the bench's edge; the specimen
  bolts flat against the wall's front with two M5 × 20 socket screws, their nuts in the pockets behind, and reaches
  out past the edge.
- `bench/gauge-arm`: bolts on top of the wall (two M5 × 35, their nuts slid into the wall's side slots) and holds a
  dial indicator's 8 mm stem over the load bolt, pinched by an M4 × 40. The gap from the arm to the bolt's head is
  `bench.gauge_gap` (20 mm): change it to suit your indicator. A digital calliper's depth rod, resting on the arm,
  works too, with less resolution.
- `bench/hanger`: hangs on the load bolt (an M4 × 16: head, hanger, specimen, nut), with an eye for a strap or S-hook.
  Weights can be gym plates, or bottles of water weighed on a kitchen scale.

`bench/lever-bench` is the whole rig assembled with a specimen, for checking that it all fits: `cad check bench/lever-bench`.

### Printing

Print every specimen the same way, and write down how in `results.json`:

- flat on the bed, 0.2 mm layers;
- 100% infill, or enough walls to be solid, so the slicer's infill doesn't change the result;
- the same printer, filament and spool for all four;
- three prints of each;
- left for a day before testing.

Print the rig parts solid too: the rig must be far stiffer than any specimen.

### Testing

1. Bolt the specimen to the wall, hang the empty hanger, and set the dial indicator's plunger on the load bolt's head
   with a little preload. Zero it.
2. Add weights in steps, reading the gauge at each. Keep every specimen in its straight-line range: stop before it
   moves 1 mm (the lightened plate gets there with about 0.3 kg; the others take 2 kg or more).
3. Take the weights off and check that the gauge returns to zero. If it doesn't, the specimen has crept or slipped:
   tighten the bolts and repeat.
4. Repeat three times on each print.

A specimen's stiffness is the slope of load (N: kg × 9.81) against movement (mm), fitted through the readings.

### Recording results

`results.json` holds the predictions, the print settings and every reading. Fill in each reading as
`[load_kg, gauge_mm]`. Then:

- **Your material:** from the plain bar's measured stiffness, your printed material's modulus is the data sheet's
  times measured over predicted. Record it as `"kind": "measured"` in `rules/pla.json`, then run `cad check` again
  for new predictions.
- **The tool:** with the modulus calibrated, compare measured and predicted for B, C and D. The gap shows how far the
  analysis can be trusted for printed parts.

The bench passes when the optimised specimens are clearly stiffer than both A and B (by more than the spread between
repeats), and the calibrated predictions are within 30% of the measurements.

## The bracket bench

A 3D test block on the same rig: a wall bracket, bolted to the wall's face by the same two M5 bolts and reaching
straight out from it 80 mm to a load bolt, where the hanger hangs. Four brackets of equal mass (27,520 mm³, about
35 g of PLA) fill the same envelope (40 × 40 × 86 mm) and are held and loaded the same way:

| | Object | What it is | Predicted stiffness, straight down |
|---|---|---|---|
| A | `bench/bracket-web` | A back plate and a plain upright web to the load boss: the usual hand-made bracket. | 95.2 N/mm |
| B | `bench/bracket` | The stiffest bracket the optimiser finds (`problems/bracket.json`), ignoring how it prints. | 141 N/mm |
| C | `bench/bracket:printable` | The same, keeping only what prints without supports standing on its back plate. | 141 N/mm |
| D | `bench/bracket:side` | The same, keeping only what prints without supports lying on its side (the problem's y up). | 127 N/mm |

The differences between B, C and D are what printing without supports costs in stiffness. A, B and C print standing
on their back plate, as they're drawn; D is drawn lying on its side, and its analysis turns it back (`rotate` and
`move`) so it's loaded as the others are. Their bolt holes and the load boss are teardrops, pointed up the way each
prints. `bench/bracket:side-free` is B laid on its side: not for printing, but to show what it would need supporting.

What the predictions say:

- **Optimised against plain:** B and C are predicted 1.5 times stiffer than the plain web of the same mass straight
  down (141 against 95.2 N/mm), and over twice as stiff at 45° (53–61 against 24.4 N/mm).
- **Printable against free:** standing on its back plate, the free optimum is already nearly self-supporting.
  Keeping it printable costs nothing straight down and about 14% at 45° (52.6 against 60.9 N/mm). The visible
  difference is the hole through its side: arched in B, rising to a 45° point in C.
- **On its side:** here the filter earns its keep. Laid on its side, B has 1,035 mm² of overhangs past 45° and needs
  supports; D has none. D costs about 10% straight down and 33% at 45° (127 and 41 against 141 and 60.9 N/mm): with
  y up, every hole's roof must rise at 45°, so D is closer to a solid web than an open truss.
- **Overhangs:** C and D have none past 45°. Smoothing the cubes into a surface leaves small faces either side of 45°,
  so a printable result's faces past it are tipped back to it: under 0.1% of its volume moves. B, unfiltered, has
  about 100 mm² standing up; most printers bridge those.
- **How settled:** D at 45° changes 5.6% between 1 mm and 0.8 mm cells, so its check flags it not settled; read its
  41 N/mm as within about 6%. The brackets' peak stresses (4–5 MPa, 7 to 9 times under PLA's strength) are at the
  bolt holes, where the analysis holds the part rigidly: the real bolts and washers spread that load.
- **Earlier predictions:** on the optimiser's 2.5 mm cubes, solid only where a cube's centre was inside, a 6 mm plate
  came out 5 mm thick, and the brackets were predicted 15–35% too flexible (A 72.8, B 119 N/mm straight down). The
  check on finer cells caught it; analyses now fill each cube by the share the part takes up.

`bench/reach-arm` takes the gauge arm's place on the wall's top and reaches out over the bracket's load bolt. The
bracket reaches out from the wall's face, so clamp the rig with the wall's face at the bench's edge: the hanger then
hangs clear of the bench.
`bench/bracket-bench` is the rig assembled with a bracket.

Test them as the levers: preload, zero, load in steps (stop before 1 mm), unload, three repeats on three prints.

## The gear sampler

`projects/gears`: what backlash and module print well on this printer, so `@rulecad/gears` can start from measured
numbers rather than estimates (its `DEFAULTS` say which are estimates).

- **`gears/sampler`**, the frame (180 × 179 mm, a ladder of bars, not a plate): a pair of 3 mm pins on a bar for each
  of three modules (0.8, 1, 1.5; if 1.5 runs, 2 will) at each of three backlashes (0.1, 0.2, 0.3 mm), each pair at its
  centre distance with its label (`M1 B0.2`) on a tab, the bars joined by rails. The front row has a rail for a loose
  module 1 rack and a lip on a floor for a loose 40-tooth ring, each with a pin for its pinion.
- **`gears/sampler-gears`**, the gears (191 × 146 mm): 17 teeth each, a row a module, a pair at each backlash. One, two
  or three dots on the top face say the backlash (0.1, 0.2, 0.3). Then the rack's and the ring's pinions (module 1, two
  dots), and the loose rack and ring.
- **`gears/sampler-mounted`**: the plate with every gear on its pin, each pair meshed, the rack on its rail and the ring
  in its lip, each driven by its pinion. `npx cad check gears/sampler-mounted --sweep` turns every pair and finds each
  measures the play it was drawn with. 59 g of PLA in all, where the first plate was 227 g. It is written by `node projects/gears/make-sampler.mjs` from
  `sampler-layout.mjs`, which the plate reads too, so the pins and the gears on them can't disagree.

Print both in PLA at the X1C's defaults (0.2 mm layers), gears face down as exported. Press each pair onto the pins its
label names, dots up.

For each pair, record:

1. **Turns freely?** Turn one gear a whole turn by hand: smooth, tight in places, or binding.
2. **Play:** hold one gear still and rock the other: none you can feel, a little, or a knock.
3. **Teeth:** for module 0.8 especially, whether the teeth printed whole, with their tips and roots, or as blobs.
4. **The rack and the ring:** whether the rack slides its whole travel along the rail, and the ring turns all the way
   round in its lip, as their pinions turn, without catching.

The smallest backlash that turns freely at each module becomes the kit's default (with the plate named as its
source, `kind: measured`); the smallest module whose teeth printed whole becomes its floor.

```sh
npx cad check gears/sampler
npx cad export gears/sampler
npx cad export gears/sampler-gears
```

## The strap tensioner

`gears/tensioner`: a crank through two herringbone stages (17 to 34, then 17 to 51: six turns of the crank for one of
the spool) to a spool held by a ratchet and a leaf pawl, on a skeleton frame (a spine, a boss round each shaft, two feet). The gears turn on three 6 mm pins printed
standing on it; the pawl stands on a post on the frame, outside every gear's reach. The ratchet is on the spool's shaft, so the gears carry the
winding and never the held load. Herringbone teeth push nothing along their shafts, so the gears stay put without
collars. `npx cad check gears/tensioner --sweep` turns the crank through a whole turn with both stages in phase.

Predicted, for a 100 N pull on a 10 mm spool (1 N·m at the spool), each part sized to about twice what that needs:

| What | Predicted | From |
|---|---|---|
| Force on the 40 mm crank | 4.6 N (95% a stage) | the ratio |
| Teeth, worst stage (the second's pinion, module 1.25, 6 mm wide) | 13.9 MPa by Lewis, 2.8× under PLA's 39 MPa; 17.8 MPa by finite elements (2.2×) | `strength`, `toothStress` |
| The pawl's click over each tooth | 5.1 N to lift it, 3.3 N at the rim | `ratchetModel` |
| The pawl's strain at a tooth's height | 0.7%, under PLA's 2% | `ratchetModel` |
| The pawl holding | 50 N end-on; it buckles at 97 N free-ended (1.9×) | Euler |
| The pawl's post | under 3 MPa at its foot under that 50 N | bending, 12 mm square |
| Material | 86 g of PLA: frame 22, spool shaft 41, middle shaft 13, crank and arm 9, pawl 1 | volumes |

The pawl is 35 mm long, to reach from a post outside the spool gear to the ratchet, and nine lines thick, so that
length still holds: at three lines, as first drawn, holding 100 N would have folded it at 11 N.

Every part prints without supports: the crank's arm is its own part, printed flat and slipped onto a flat on the
crank shaft; the second pinion's teeth run straight down onto the gear under them; the ratchet sits on a spacer as wide
as itself; the spool's top flange slants in at 45°; the frame prints base down, its pins and post standing. Not yet right: the pawl's seat on
the ratchet is set by eye (the check allows it into the teeth, where it would bend); checking it as a flexure through the ratchet's turn is
for the flexures package's lamina tools, next.

To measure: the pull it holds before the pawl gives (buckles or slips), the force on the crank at 50 and 100 N, and
whether the clicks are crisp.
