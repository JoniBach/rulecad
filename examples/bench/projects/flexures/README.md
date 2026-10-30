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
The models are good to a few times the thickness of travel; the leaves here go further than that, so expect the
stiffness to drop as they bend (a leaf shortens as it curls).

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

## Results

Record them in `results.json` beside this file (specimen, material, weights and travels, the strain or angle at
failure, cycles), as the lever and bracket benches do, and they'll go into the archive's experiment page and, with a
source, into the material rules as `strain_limit`.
