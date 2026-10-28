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
