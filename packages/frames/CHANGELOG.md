# Changelog: @rulecad/frames

What changed in each release, for someone upgrading a workspace.

## Unreleased

### Added

- `belts.mjs` (FR4.2): a belt drive on a rail's carriage. `beltLayout` from the belt's, pulley's, idler's and motor's
  sets and the carriage's figures: the belt's height and lines, its path by the pitch line (`beltPath`), the length to
  cut (whole teeth) and to buy (by the metre), its stretch, the idler block's place and room. `beltPlateModel` and
  `beltPlate` (a flat motor plate past the beam's end, its tab in the face's slot), `beltClampModel` and `beltClamp` (a
  toothed clamp for both belt ends on the carriage's tapped holes), `beltIdlerModel` and `beltIdler` (the idler's
  block and tensioner, sliding in the face's slot), each print-ready with its grams and margin; `beltRub` (each run
  against the beam, the rail, the carriage and the clamp through the travel); `BELT_DEFAULTS`, each figure with what
  it rests on. The catalogue gains `gt2-belt-6`, `pulley-gt2-16`, `pulley-gt2-20`, `idler-gt2-toothed-20` and
  `idler-gt2-smooth-20`.

### Printed sizes that moved

None: the parts are new.

### What a workspace should change

Nothing.

## 0.1.10: the magnet catch's pocket from @rulecad/fixings (Fixings 4)

### Changed

- `magnetCatchModel` takes its magnet's pull from `@rulecad/fixings` `magnetSeatModel` (a glued seat), across the
  0.5 mm gap to its strike. Its pocket stays the magnet and the printer's `fit` (10.2 mm for a 10 x 3 mm disc on the
  X1C), on every printer: fixings' glue pocket, the magnet with `hole_comp` and `magnet_glue`, is the same on the X1C
  but would move on a printer whose `fit` is not `hole_comp` + 0.1. The model gains `pocketDiameter` and `pull`, and a `fitting.magnet` finding
  says both. The magnet on the shopping list is named as fixings names it, `disc magnet 10x3 N35`, with its grams. A
  size the magnets set has no pull for still builds, its pull `null`.

### Printed sizes that moved

None. The catch was built for 10 x 3, 8 x 3 and 12 x 3 magnets before and after: the same solid each time, and a
printer with another `fit` draws the pocket it drew before (10.3 mm at a 0.3 mm fit).

### What a workspace should change

Nothing. A test that read the old shopping-list wording ("10 x 3 mm disc magnet") reads `disc magnet 10x3 N35` now.

## 0.1.9: squareness from cuts and joins' play, and printed beams (Frames 3)

### Added

- The generators refuse by name, before anything is built, a blind or end-tap screw that does not pass between the
  slot's lips (M12 in MISUMI's and Bosch's 4040) and a blind join's head that does not fit under them (Bosch's 2020:
  an M6 button head 3.3 mm high under 3 mm lips), where `cad check` failed them before. A printed fitting's or a
  brace's slot nut is the first of drop-in, roll-in, hammer and t-bolt the kit has for the slot (roll-in on item's
  4040, where drop-in was asked and drawing the fitting threw), a kind the kit lacks is refused naming one it has,
  and a slot with none (item's 3030) is refused. A printed gusset join names the post's face that looks out of the
  frame (`face`), so it never lands where the corner's third beam butts.
- A `join.screw` whose thread is no wider than the end bore it is cut in (M8 in MISUMI's 4040, M4 in item's 2020) is
  refused by the generator, where the build threw after it was taken. Each refusal of a blind or end-tap screw names
  the screws from M3 to M12 that fit, and the joins the generator takes for that profile instead, never one it would
  refuse too: in MISUMI's and Bosch's 4040 that is a bracket or gusset with no fitting, or a slot nut set of your own
  with a printed fitting.
- A beam's sheet numbers its operations in the order the work is done: the ends cut and deburred, the holes across
  from end a, the taps last (it listed them in their order along the beam, a tap at end a before its square cut).
  `workOrder(beam)` gives that order. A jig's label (`C4`) and a guide's warnings follow the sheet's numbers. The
  beam's own `ops` stay in their place along the beam from end a, as everything else reads them, and so do marks
  and the cut list's summary, so no mark's letter moves.
- A tap at a whole end goes in the bores made for a thread where the end has any (MISUMI's 3030: its M8 centre bore,
  not its four 4.2 mm corner holes), and a foot taps its bore by number (`a.1`) where the end has several.
- `squareness` takes `printed: true` on a cut: its term and its reason say the beam is printed, not cut.
- `bracketModel` and `plateModel` asked for a nut kind the slot has none of name the kinds it has, where they said
  "thread is a thread as written (got nothing)".

- A beam printed standing from a metal's profile takes a tapped end's screw in its one threaded bore's place: the
  largest thread whose screw passes up the bore and whose insert (no narrower than the bore, with its wall) or
  captive nut (its corners and a line) fits round the bore's middle; under a captive nut the bore is filled to the
  screw's hole's end. MISUMI's 2020 standing takes an M3 captive nut (`"end": "nut"`); an insert has no room.
- `footModel(profile, { thread })`: a foot under a printed end, its screw that end's thread.
- `printedInPlace(b)`: a printed beam in its own frame with its ends' inserts or nuts cut in.
- `plateModel(profile, { other })`: a gusset or splice plate whose beam a is of another profile with the same face
  names; a's arms take its slot's tongue and nuts, and the plate is thickened until a length sold fits both slots.

- A generated frame's printed foot (`foot`, `levelling`, `stacking`) carries its end's `tap` and its `screw`, from the
  foot's own model; with a join that drills the uprights (blind, end-tap, hidden, anchor) the bottom ring rises by the
  tap's depth (`lift` on the model), so its holes clear the tapped end. A box round 300 x 300 x 350 in 2020 on feet:
  outside 340 x 340 x 408.5, uprights 408.5 mm.

- `profileChoices(profile)`: a profile as the choices `@rulecad/fea/frame`'s `sizing` takes: its section in a beam's
  own axes, its alloy (modulus, Poisson's ratio, density, strength) and mass per metre; one that is not square twice,
  as drawn and turned a quarter (`roll` 90, "<name> turned").
- `box`, `portal`, `table`, `gantry`, `shelf` and `frameModel(kind, o)`: a frame from the volume it encloses
  (`inside`) or fits in (`outside`), in one square profile, its corners arranged for its join (`FRAME_JOINS`: the
  uprights run through for a join against a face, every beam into a node for a cube), with feet, end caps, braces
  and panels. `FRAME_KINDS`, `FRAME_FEET`, `FRAME_GEN.clear`.
- `beamCreep(b, { stress | moment, sag, limit })`: `beam.creep`, a printed beam's sustained stress against
  `PRINTED_DEFAULTS.creep` (0.15) of its strength for its pose, and its sag as it creeps (`creep_modulus`, 0.5). Both
  estimates. `PRINTED_DEFAULTS.splice_share` (0.5): what a splice carries of the whole beam's moment. `b.printed.creep`
  holds the limit.
- A printed beam takes the beam coupon's measured figures from its plastic's set before the plastic's own:
  `beam_modulus`, `beam_strength` lying down, `beam_modulus_z`, `beam_strength_z` standing up (`b.printed.coupon`
  names them, `b.printed.modulusKind` says what the modulus rests on).

- `JOIN_PLAY`: each join kind's play, how far the end of `a` may sit off where it was squared once its screws are
  tight, in mm. Every one an estimate (end-tap from ISO 273's medium clearance for M5).
- `squareness(width, height, { tolerance, cuts, plays })`: the beams whose cut lengths set the opening, each with its
  own tolerance where it differs, and each join's play, stacked across the diagonals (sum for the worst case,
  root-sum-square beside it); the result carries `terms` and `rss`. Left out, `cuts` is two beams along the larger
  side and `plays` none, which gives the figures it gave before.
- Printed beams: `beamModel(profile, { length, printed })` makes a printed part (lying down or standing up), its mass
  and section figures from its walls and infill (`printedSection`), its tapped ends heat-set inserts or captive nuts,
  findings `beam.printable`, `beam.mass`, `beam.strength`, `beam.slot` and `beam.end`. `printedBeam` draws it as it
  prints. `printedProfile` works out a printable profile from a slot family's nuts and a printer's rules;
  `PRINTED_DEFAULTS`, `PRINTED_SERIES`, `printerFigures`. `spliceModel` and `splice`: a keyed lap with two screws
  joining two halves of a beam longer than the bed, cut upright down the section's middle over the lap, checked on
  each half's section and the screws' couple (a splice carries about half what the beam does: give the frame's
  moment). `printedSection` takes `between`, the part of a section between two upright cuts, and `holes`, boxes
  taken out of it with walls round them.
- A splice's halves are also read at their first screws, net of the screw's hole and the head's seat or the nut's
  pocket, where each still carries the whole moment (`halves.a.net`, `netA` and `netB` in `splice.strength`). Where no
  splice fits the bed, the refusal says the longest beam, the range of `at`, or the moment that fits, never 0 N·m.
- A printed beam standing up reads its slots' hold at the plastic's strength along its layers: the lips and walls
  bend in the section, which is the layer (2020 MISUMI standing: 2.6 times a 100 N pull, read before as 1.56).

### Changed

- `nutFit` seats a nut under lips that slope underneath (`lip_angle`) on its top corners, and measures its room from
  there, with a `slot_nut.seat` finding. The 80/20 slots (2°) are the only published sets it moves, and no nut is
  made for them in the kit.
- An operation on a beam of a printed profile is refused only where the beam is not printed; on a printed beam its
  holes are sized by the printer and a hole on its side as it prints is a teardrop (`opsOf`'s `printed`,
  `opCutters`' `up`).
- `printable` gives a printed beam's own findings; a bought beam or a profile still fails.
- A printed slot's side walls bend across the layers lying down: their hold is worked out at the plastic's strength
  across them (`strength_z`, or 0.6 of its strength), the lips' along them. `profile-2020-printed` holds 427 N on its
  drop-in nut, not 711 N; the published printed slot sets say so.

- `cutList`'s `tolerance`, given, is taken before a profile's own `cut_tolerance` (the maker's figure is for its
  cut service; a workshop's saw is its own).

### Fixed

- A fitting's screw window (the lengths `sold` finds for a bracket, a plate, a panel's clip, a door's or a mount's
  thickness) counted a slot nut's thread from under the lips where the nut seats lower, under lips that slope
  underneath (`nutFit`'s `slot_nut.seat`): an M4 drop-in in the printable 2020 seats 3.95 mm down, so its thread
  starts at 3.15 mm, not 1.2. A fitting on a printable slot may come out thicker so a sold screw fits.

## 0.1.8: joins, fittings, guides, jigs and the build (Frames 2)

### Added

- `join.mjs`: joins between beams by kind, with their ops, screws, fitting and an estimated stiffness for
  `@rulecad/fea/frame`.
- `fitting.mjs`: printed corner brackets, gussets and splice plates from one generator, with mass, stiffness and
  margin at a named load. The margin rests on coarse finite elements and PLA's strength, so it is an estimate.
- `panel.mjs`, `door.mjs`, `ends.mjs`, `services.mjs`, `bought.mjs`: panels and clips; hinges, handles, latches and
  catches; end caps and feet; mounts for boards and supplies, cable clips and runs; bought fittings from rule sets.
- `guide.mjs`, `wheels.mjs`, `rods.mjs`: miniature rails, V-wheel carriages and printed sliders, rods, lead screws,
  motor plates and endstop mounts.
- `jig.mjs`: drill guides, tap guides, cut-length stops and squaring corners.
- `square.mjs`: a bay's diagonals and the difference the cut tolerance allows.
- Measured joins: a join's stiffness and a slot nut's hold read from the rules once the joint rig has measured them.

Joint stiffness, slot nut holds other than Bosch Rexroth's ratings, and printed fittings' margins are estimates until
measured, and each finding says what it rests on.

