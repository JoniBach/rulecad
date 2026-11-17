# Changelog: @rulecad/frames

What changed in each release, for someone upgrading a workspace.

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

