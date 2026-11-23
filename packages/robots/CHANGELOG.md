# Changelog: @rulecad/robots

What changed in each release, for someone upgrading a workspace.

## Unreleased

### Added

- `stepBlocks` takes `minBlockTime`, the least seconds a move lasts: a shorter move's peak tool speed is held to its
  length over `minBlockTime`, and the finding `steps.blockTime` counts the moves slowed. A streamer that takes one
  line a block over a serial line falls behind on blocks shorter than their line takes to send.

## 0.1.2: a chain of slides' reach (Frames 3)

### Fixed

- A chain of slides alone takes its reach margin from its ends of travel, not an arm's span: a carriage on a frame
  had said it fell 159.59 mm short of a line it reached all of.
