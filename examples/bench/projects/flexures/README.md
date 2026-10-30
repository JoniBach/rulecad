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

## The third plate: things that click, turn and hold

`sampler3` (`npx cad export flexures/sampler3`):

- **A folded-beam guide**, 25 mm beams of three lines: the MEMS suspension. Push the shuttle toward the rail: 2.74 N/mm
  in PLA (1.85 PETG), 6.6 mm to 2% strain, and no drift along the rail.
- **A cartwheel pivot**, 10 mm spokes of two lines: push the arm's end sideways. 2,200 N·mm/rad in PLA (1,490 PETG);
  2% strain at 5.3°, 2.8 mm at the arm's end.
- **An elliptical notch hinge**, notches 6 mm along by 3 deep on a two-line neck: half the circular notch's stiffness
  (294 N·mm/rad in PLA against 566) and nearly twice the angle at 2% (8.2° against 4.3°). Compare the two on plate 1.
- **Two snap hooks** under catch lips, one square-backed and one sloped at 60°. Push a hook's tip away from its post
  until it clears the lip (0.8 mm: 2.5 N in PLA) and let go for the click. The square one holds whatever pulls it; the
  sloped one lets go at about four times its insertion force.
- **A ratchet.** Snap the wheel off its tab and pin it on the boss; its 24 teeth meet the tall pawl's upper half. Turn
  it one way by the rim: a click each tooth at 0.73 N (PLA); the other way it holds.

## The fourth plate: stops, and mechanisms made compliant

`sampler4` (`npx cad export flexures/sampler4`):

- **A leaf with travel stops**: posts at its tip 20 mm each side, where 2% strain says 25 mm and the stop allows
  80% of it. Push the leaf to the post: it should not whiten. This is the rule as a shape; the same rule in
  `printable()` warns of a flexure with no stop.
- **A pre-curved leaf**, 40 mm of two lines bowed 6 mm: push it straight and push it further bent; the same 0.050 N/mm
  either way, and 25 mm of travel each way about its rest instead of one.
- **A contact-aided leaf**: a stop bar beside it reaching 20 mm from the root, 2 mm off. Free, it is the two-line
  leaf (0.050 N/mm); at 6.4 mm of tip travel the beam touches the bar and it becomes a 20 mm leaf (0.40 N/mm). Hang
  weights and watch the rate change.
- **A parallelogram** on four two-line notch hinges, links 30 mm: push the coupler sideways, 2.5 N/mm, and watch it
  stay level; the hinges reach 2% at 2.2 mm.
- **Tweezers**: a 40 mm two-line spring between two 50 mm arms, jaws 10 mm apart. Squeeze: 0.20 N/mm at the
  fingers, the jaws meet at 10 mm with the spring at 1.6% strain.

## Joints that aren't flexures

`joints` (`npx cad export flexures/joints`) is the comparison: a pin joint printed in place and a snap pin with its
socket, three named parts. Twist the lever to break it free (it sits a 0.2 mm support gap off the base and under the
cap, 0.2 mm clear of the pin all round) and feel the play: 3.8° of rock on a 6 mm ring. Push the peg into the socket
until it clicks (predicted 6 N in PLA, the barb's halves at 0.6% strain) and pull it out again; a 90° back would hold
it for good. Where a flexure's travel is enough, it has none of this play and nothing to break free; where it isn't,
this is the joint.

## Results

`results.json` beside this file holds the predictions for every specimen on both plates (made from the models, in PLA
and PETG), a `measured` entry for each with its readings (`[load_g, travel_mm]`, three at increasing loads, per print)
and its failure (the travel or angle at whitening or a set, and where), the print settings, and a `strain_limit` for
each material once the failures say what it is. Filled in, it goes to the archive's
[flexures experiment](https://jonibach.github.io/rulecad-archive/experiments/flexures/) and, with this file as the
source, into the material rules as `strain_limit`.
