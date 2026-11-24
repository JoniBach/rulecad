# Changelog: @rulecad/fixings

What changed in each release, for someone upgrading a workspace. A **printed size** is a dimension of a part you
print (a hole's diameter, a seat's depth, a part's outline). Each release says whether any printed size moved, and
why.

## Unreleased

### Added

- **A slotted skirt for the annular snap** (issue 309): `annularSnapModel` takes `slots: { count, reach, width }`, the
  lid's skirt cut into fingers, each a cantilever clamped at the slots' closed end (`skirtFinger`: the exact second
  moment of a ring's sector, k = 3 E I / L³, root strain 3 c y / L²). The fingers' root strain is held to the same
  limit as a hoop strain, and the finding `snap.fingers` says what a whole skirt would take for the same bead.
  `snapSlots` cuts the slots, each ending in a full round. New rule `fixings.snap_slot` (1 mm, an estimate), and the
  printer's `print_gap` is borrowed from the X1C where a printer lacks it. Refused by name: under 3 fingers, a slot
  narrower than `print_gap`, a reach under twice the skirt or past the lid's top, fingers narrower than the skirt.
  The bead bears on each finger at the groove's bottom edge, so the finger's arm is the reach plus the groove's
  height (`slots.arm`), and a sized bead is worked at its own arm.
  For the 60 mm pot with its bead 14 mm under the rim, 16 fingers bring the push on from 329.9 N (a whole skirt
  there) to 31.8 N. The bench's `snap-pot` gains a `slotted` variant and the assembly `snap-pot-slotted-closed`.

### Printed sizes

- None moved: without `slots` every figure and solid is as before (checked against the pot's model before the change).

## 0.1.6: the annular snap: lids that click on (#76)

### Added

- **Annular snaps** (`snaps.mjs`, issue 76): a lid that clicks on to a round box. `annularSnapModel` gives the bead,
  the undercut, the share of it the box's wall and the lid's skirt each take as two springs in series, the hoop strain
  in each against the plastic's limit, and the forces to push the lid on and pull it off, from the Bayer snap-fit
  guide's annular joint (P = y d Es X, its geometric factors `hubFactor` and `shaftFactor`); without a bead height it
  is sized from `pull` with twice the margin. `annularBead` and `annularGroove` draw the bead and the groove (with a
  lead-in at the skirt's mouth). Findings: `snap.undercut`, `snap.strain`, `snap.least`, `snap.forces`, `snap.remote`,
  `snap.hold`, `snap.printable`. `SNAP_USES`. Bound in `fixingsFor`.
- **A closed end near an annular snap** (`boxFloor`, `lidTop`): `tubeRing` works out a ring load on a tube's wall as
  Hetényi's beam on an elastic foundation, each end free, closed or long. A lid's top within a few times 1/β of its
  groove holds the skirt round, so the skirt is stiffer and the box's wall takes more of the snap; the bending strain
  at the closed end's root is held to the same limit. Findings `snap.closed` and `snap.root`. `snap.remote` reports
  the free ends' share alone.
- Refused by name: a lead that friction locks (μ tan α of 1 or more), and a bead as deep as the skirt, whose groove
  would cut through it. `snap.skirt` fails where the groove leaves less than one of the printer's `line` behind it.
  Given `push`, `snap.push` warns where pushing the lid on square takes more.
- A sized bead is rounded up to what its pull needs and down to what its strain allows, and the strains are judged
  unrounded (they are shown to 4 places), so a bead held to the strain passes its own strain check whatever the
  limit rounds to.
- Refused by name: a closed end (`boxFloor`, `lidTop`) nearer the joint than its part's wall, 0 mm included, where
  the wall cannot give and the sums came out as NaN and Infinity.
- `DEFAULTS` gains `snap_brief` (70% of the yield strain) and `snap_often` (60% of that) and `snap_remote` (3), from
  the guide, and `snap_friction` (0.5) and `snap_least` (0.2 mm), estimates.

No printed size moved: nothing drawn before reads these.

## 0.1.5: pins, magnet seats and printed bolts (Fixings 4)

### Added

- **Pins** (`pins.mjs`): `pinModel`, `pinHole` and `pin` for a snap pin, a steel dowel (ISO 8734 or ISO 2338), a
  length of 1.75 mm filament or a printed pin, named by a grammar (`snap pin 4x6`, `dowel 3x12`, `filament pin
  1.75x12`, `printed pin 4x10`): the hole from the printer's rules (press or slip for a plain pin, a teardrop lying on
  its side), mass, shear and bearing, a snap pin's push-in and pull-out forces, and a pin too long or too short for
  its part refused by name. `parsePin`, `isPinName`, `PIN_KINDS`, `PIN_FITS`, `PIN_GRAMMAR`.
- **Snap pins moved here** from `@rulecad/flexures`: `snapPin`, `snapSocket` and `snapPinModel`, same signatures and
  defaults, with the snap-hook sums written in this package. `snapSocket`'s default clearance reads
  `x1c.snap_clearance` (0.2 mm, the figure it always drew).
- **Magnets** (`magnets.mjs`): `magnetModel` (a disc or block's pull off steel, at another grade and across a gap),
  `magnetSeatModel` and `magnetSeat` (a press, glued or crush-ribbed pocket from the printer's rules, its floor held
  to three layers, a pull-out finding), `magnet`, `parseMagnet`, `isMagnetName`, `fieldShare`, `MAGNET_GRADES`,
  `MAGNET_FITS`, `MAGNET_SIZES`, `MAGNET_GRAMMAR`.
- **Printed bolts** (`bolts.mjs`): `printedBoltModel` (breaking load in tension at the root, by how it prints, in
  thread stripping and in head shear; held to `load_margin`; refused below the printer's smallest thread, naming the
  smallest that prints), `printedBolt`, `BOLT_NUTS`. The word printed in a name (`M8x20 hex printed`) makes a screw
  printed, at any length.
- `DEFAULTS`: `snap_play`, `pin_least`, `magnet_floor`, all estimates. The printer's basics now borrow
  `snap_clearance`, `pin_press`, `pin_slip`, `magnet_press`, `magnet_glue` and `magnet_crush` from the X1C where a
  printer's set lacks them.
- `materialOf` and `weakest` are exported from `strength.mjs`; `materialOf` also returns `density` and `poisson`.
- README: sections on pins, printed bolts and magnets, where each thing lives, and measuring the printer's fits with
  the fixings coupon and the new holds coupon.

### Changed

- `screwLoad`, `preload`, `torqueFor`, `stripping`, and `seating` with no force given, refuse a printed bolt by name:
  each reads a steel screw's proof load, which a printed bolt does not have.
- `screwModel` on a printed name (`M8x20 hex printed`) keeps the word printed in its name, says `printed: true`, and
  weighs it in its plastic (`material`, PLA by default: 2.0 g, not 12.46 g of steel). `lengthFor` names a printed
  length as printed too.
- `magnetSeatModel` with no `fit` gives crush ribs for a disc standing in its pocket, and glue for a disc lying on its
  side or a block: a press warned on its wall for an 8 x 3 disc in PLA and split a 10 x 5 x 2 block's.
- `magnetModel` and `magnetSeatModel` handed a magnet's model with options build it again from its name with them
  (its own grade, gap, count, load and given pull kept where the options say none). Before, the options were ignored.

### Printed sizes that moved

A magnet pocket drawn with no `fit` given: 8.2 mm with ribs for an 8 x 3 disc, where the press was 8 mm (fixings'
own default only; frames' catch and the coupons name their fit). Otherwise none. Every snap pin and socket the kit drew before (the launcher's, the joints sampler's, the gears tensioner's) is
byte for byte the same, and frames' magnet catch pocket is 10.2 mm as it was.

### What a workspace should change

Nothing is required. To use the new fits on your own printer, print the holds coupon and write each result back with
`cad measured` (examples/bench/projects/benchmarks/MEASURE.md, rows 40 to 47).

## 0.1.4: the kit reads its screws from fixings (Fixings 3)

### What reads fixings now

This package is now where every screw size in the kit comes from:
- `@rulecad/cad`: `v.fixings` in a design, and the `fasten` relation in an assembly, which follows a screw through the
  parts, chooses its sold length and counts it in `cad list`.
- `@rulecad/motors`: a motor's mounting screws, their clearance holes and counterbores.
- `@rulecad/pcb`: a board's mounting holes, named by their thread (`mount('M2', x, y)`).
- `@rulecad/shapes` does not import this package (that would make a cycle, since this package draws with shapes'
  seats). Its seats take the screw's figures from here as plain numbers.

### Changed

- `screwGroup(places, o).turns` is `null` when the twist about a single screw rounds to 0 N m at the thousandth it is
  given in. It used to be `0`, and cad then warned "a twist of 0 N m about the one screw is held by friction alone"
  on a part held by one screw whose own weight sits a hair off the screw's axis. A test holds this.

### Printed sizes that moved

None. No hole, seat or piece of hardware this package draws changed size or shape.

### What a workspace should change

Nothing is required. Code that tested `screwGroup(...).turns > 0` keeps working; code that tested `turns !== null`
to mean "a twist" now skips a twist that rounds to nothing, which is the intent.
