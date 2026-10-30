# The flexure bench: a sampler to measure

One plate, printed flat, with seven kinds of flexure from `@rulecad/flexures`, every one bending in the plane of
the bed (within its layers). Each has a predicted stiffness and a predicted travel to 2% strain from beam theory;
measure them, and the numbers become the material's strain limit and a check on the models. Print one in PLA and one
in PETG (`"material"` in sampler.json), the same settings as the other benches: 100% infill, 0.2 mm layers.

`npx cad export flexures/sampler` writes the 3MF. The thinnest flexures are two lines (0.84 mm); if your slicer thins
or thickens walls, say so with the results.

## How to measure

- **Stiffness:** hang a known weight from an eye (coins: a 1p is 3.56 g, a 2p 7.12 g, a £1 8.75 g) or push with the
  bench's dial gauge, and read the travel at the eye. Stiffness is the force over the travel, N/mm. Take three readings
  at increasing weights; the slope is what counts, and the first reading at a few grams shows any slack.
- **Travel to failure:** push each leaf further by hand until it whitens (PLA) or stays bent (PETG): that travel is the
  material's strain limit, through the model's `strain(travel)`. Note whether it whitened at the root, as the model
  says it should.
- **Hinges:** the notch hinges and living hinges turn: push the arm's end sideways and read the travel; the angle is
  the travel over the arm's length (20 mm for a notch hinge, 14 mm for a living hinge), in radians.
- **The bistable beam:** push its middle. Note the force it snaps at, whether it stays over, and whether it comes back
  to exactly where it started after ten snaps.
- **Fatigue:** flex the thinnest leaf to half its travel limit a hundred times and look for whitening; that's the
  beginning of a fatigue rule.

## Predictions

Beam theory, with the material's modulus along the layers (PLA 2,680 MPa, PETG 1,810 MPa) and travel to 2% strain.
The models are good to a few times the thickness of travel; the leaves here go further than that, so expect them to
stiffen as they curl and their tips to come nearer the rail (the elastica in `@rulecad/flexures` says how much:
`elastica(leaf, { E }, { travel })`).

| Flexure | Thickness | PLA stiffness | PETG stiffness | Travel to 2% |
|---|---|---|---|---|
| Leaf spring, 40 mm | 0.84 mm (two lines) | 0.050 N/mm | 0.034 N/mm | 25 mm |
| Leaf spring, 40 mm | 1.26 mm (three lines) | 0.168 N/mm | 0.113 N/mm | 17 mm |
| Leaf spring, 40 mm | 1.68 mm (four lines) | 0.397 N/mm | 0.268 N/mm | 13 mm |
| Parallel guide, 30 mm leaves, 12 mm apart | 1.26 mm | 3.18 N/mm | 2.15 N/mm | 4.8 mm (the shuttle drops 0.45 mm) |
| Serpentine, 5 × 20 mm | 1.26 mm | 1.07 N/mm | 0.72 N/mm | 11 mm |
| Notch hinge, 3 mm notches | 0.84 mm neck | 566 N·mm/rad | 382 N·mm/rad | 4.3° (1.5 mm at the arm's end) |
| Notch hinge, 3 mm notches | 1.26 mm neck | 1,560 N·mm/rad | 1,054 N·mm/rad | 3.5° (1.2 mm at the arm's end) |
| Bistable beam, 60 mm, 3 mm rise | 0.84 mm | 1.88 N/mm at the start | 1.27 N/mm | snaps 6 mm; 1.4% strain on the way |
| Living hinge, 2 mm strip | 0.84 mm | 530 N·mm/rad | 358 N·mm/rad | 5.5° |
| Living hinge, 4 mm strip | 0.84 mm | 265 N·mm/rad | 179 N·mm/rad | 10.9° |

## The second plate: mechanisms

`sampler2` puts three mechanisms on one rail (`npx cad export flexures/sampler2`):

- **A compound parallel guide**, 30 mm leaves of three lines, 12 mm apart, with 6 mm of room. Push the shuttle
  sideways and watch its face against the rail: a parallel guide's shuttle drops 3δ² / 5L (0.45 mm at 4.8 mm); this
  one's should not move along the leaves at all. Stiffness 1.59 N/mm in PLA (1.07 PETG), 9.5 mm to 2% strain.
- **A constant-force mechanism.** The crank is held to the rail by a two-line tab: snap it off and pin it to the coupler's
  boss and the ground boss with two 12 mm bits of filament. Then push the coupler's slider block along the rail's line and read the gauge: the force
  should be there within the first millimetre and hold within ±5% to about 10 mm, at 1.7 N in PLA (1.1 N in PETG),
  the leaf under 2% strain to 22 mm. The pins and bosses will add friction: note the difference between pushing in
  and letting out.
- **A LET joint**, six layers thick, five-line torsion bars and six-line bridges. Fold the outer panel up: predicted
  61 N·mm a radian in PLA, and 2% strain at 41°. This is the one flexure that bends across its layers, so expect PLA
  to whiten at the bridges first; the PETG plate is the one to trust.

## Results

`results.json` beside this file holds the predictions for every specimen on both plates (made from the models, in PLA
and PETG), a `measured` entry for each with its readings (`[load_g, travel_mm]`, three at increasing loads, per print)
and its failure (the travel or angle at whitening or a set, and where), the print settings, and a `strain_limit` for
each material once the failures say what it is. Filled in, it goes to the archive's
[flexures experiment](https://jonibach.github.io/rulecad-archive/experiments/flexures/) and, with this file as the
source, into the material rules as `strain_limit`.
