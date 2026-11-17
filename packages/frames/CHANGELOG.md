# Changelog: @rulecad/frames

What changed in each release, for someone upgrading a workspace.

## Unreleased: squareness from cuts and joins' play, and printed beams (Frames 3)

### Added

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
  joining two halves of a beam longer than the bed.

### Changed

- `nutFit` seats a nut under lips that slope underneath (`lip_angle`) on its top corners, and measures its room from
  there, with a `slot_nut.seat` finding. The 80/20 slots (2°) are the only published sets it moves, and no nut is
  made for them in the kit.
- An operation on a beam of a printed profile is refused only where the beam is not printed; on a printed beam its
  holes are sized by the printer and a hole on its side as it prints is a teardrop (`opsOf`'s `printed`,
  `opCutters`' `up`).
- `printable` gives a printed beam's own findings; a bought beam or a profile still fails.

- `cutList`'s `tolerance`, given, is taken before a profile's own `cut_tolerance` (the maker's figure is for its
  cut service; a workshop's saw is its own).

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

