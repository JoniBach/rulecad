# The lever bench

A test block for rulecad's topology optimisation (`cad optimise`, @rulecad/topopt), built to be measured. Four
specimens weigh the same, fit the same envelope and are held and loaded the same way. The only difference between them
is where the material is. Print them, hang weights on them and read a dial gauge. The results show whether the
optimiser makes a stiffer part, and how close its predictions are for printed parts.

## The specimens

Each is a cantilever lever, 6 mm thick and printed flat, inside a 140 × 40 mm envelope (`rules/bench.json`). It is
held by two M5 bolts in line at one end and loaded through an M4 bolt 120 mm from the first, in its own plane (the
specimen stands on edge in the rig). Each fills half the envelope: 16,800 mm³, about 21 g of PLA. `cad check` holds
every specimen's volume to within 1% of that.

| | Object | What it is | Predicted stiffness, straight down |
|---|---|---|---|
| A | `lever/bar` | A plain bar of the same length and mass. Beam theory predicts it exactly, so it also measures your printed material's stiffness. | 26.9 N/mm |
| B | `lever/plate` | The whole envelope with a row of four windows: the usual hand-made lightening. | 3.3 N/mm |
| C | `lever/optimised` | The stiffest layout the optimiser finds for the straight-down load (`problems/lever.json`). | 99.9 N/mm |
| D | `lever/optimised:both` | Optimised for a second load too, 45° from straight down. | 98.9 N/mm (190 N/mm at 45°) |

The predictions are from `cad check` (the analysis in @rulecad/fea, with Bambu Lab PLA Basic's data sheet modulus,
2680 MPa). They change when the material rule changes. `cad optimise lever/lever` draws the optimised layout in
`.preview/lever/`.

## The rig

- `lever/rig`: a wall on a base. G-clamp the base to a bench so the wall's end is at the bench's edge; the specimen
  bolts flat against the wall's front with two M5 × 20 socket screws, their nuts in the pockets behind, and reaches
  out past the edge.
- `lever/gauge-arm`: bolts on top of the wall (two M5 × 35, their nuts slid into the wall's side slots) and holds a
  dial indicator's 8 mm stem over the load bolt, pinched by an M4 × 40. The gap from the arm to the bolt's head is
  `bench.gauge_gap` (20 mm): change it to suit your indicator. A digital calliper's depth rod, resting on the arm,
  works too, with less resolution.
- `lever/hanger`: hangs on the load bolt (an M4 × 16: head, hanger, specimen, nut), with an eye for a strap or S-hook.
  Weights can be gym plates, or bottles of water weighed on a kitchen scale.

`lever/bench` is the whole rig assembled with a specimen, for checking that it all fits: `cad check lever/bench`.

## Printing

Print every specimen the same way, and write down how in `results.json`:

- flat on the bed, 0.2 mm layers;
- 100% infill, or enough walls to be solid, so the slicer's infill doesn't change the result;
- the same printer, filament and spool for all four;
- three prints of each;
- left for a day before testing.

Print the rig parts solid too: the rig must be far stiffer than any specimen.

## Testing

1. Bolt the specimen to the wall, hang the empty hanger, and set the dial indicator's plunger on the load bolt's head
   with a little preload. Zero it.
2. Add weights in steps, reading the gauge at each. Keep every specimen in its straight-line range: stop before it
   moves 1 mm (the lightened plate gets there with about 0.3 kg; the others take 2 kg or more).
3. Take the weights off and check that the gauge returns to zero. If it doesn't, the specimen has crept or slipped:
   tighten the bolts and repeat.
4. Repeat three times on each print.

A specimen's stiffness is the slope of load (N: kg × 9.81) against movement (mm), fitted through the readings.

## Recording results

`results.json` holds the predictions, the print settings and every reading. Fill in each reading as
`[load_kg, gauge_mm]`. Then:

- **Your material:** from the plain bar's measured stiffness, your printed material's modulus is the data sheet's
  times measured over predicted. Record it as `"kind": "measured"` in `rules/pla.json`, then run `cad check` again
  for new predictions.
- **The tool:** with the modulus calibrated, compare measured and predicted for B, C and D. The gap shows how far the
  analysis can be trusted for printed parts.

The bench passes when the optimised specimens are clearly stiffer than both A and B (by more than the spread between
repeats), and the calibrated predictions are within 30% of the measurements.
