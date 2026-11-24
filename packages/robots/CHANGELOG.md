# Changelog: @rulecad/robots

What changed in each release, for someone upgrading a workspace.

## 0.1.4: a gait as step blocks (#199)
### Added

- `gaitBlocks(sequence, { axes, cycles, period, from, approach })`: a gait's frames in time as a `rulecad.steps/1` block
  file with `kind: 'gait'`, every driven joint an axis in each block, from a start pose through the cycles and back.
  Blocks keep to the gait's period where each axis's `maxRate` allows; a joint turning back slows the run so no axis
  changes speed by more than its `jump` (default `maxRate / 8`) and ramps stay within its `accel` (default
  `4 maxRate`), both estimates. Findings `gait.period`, `steps.rate` and `steps.jump`.

## 0.1.3: blocks no shorter than their line takes (#181)

### Added

- `stepBlocks` takes `minBlockTime`, the least seconds a move lasts: a shorter move's peak tool speed is held to its
  length over `minBlockTime`, and the finding `steps.blockTime` counts the moves slowed. A streamer that takes one
  line a block over a serial line falls behind on blocks shorter than their line takes to send.

## 0.1.2: a chain of slides' reach (Frames 3)

### Fixed

- A chain of slides alone takes its reach margin from its ends of travel, not an arm's span: a carriage on a frame
  had said it fell 159.59 mm short of a line it reached all of.
