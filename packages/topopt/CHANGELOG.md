# Changelog: @rulecad/topopt

What changed in each release, for someone upgrading.

## Unreleased
### Added

- `tool` (mm, with `mill`): a flat end mill's radius. `toolFilter` closes each layer across the tool's axis by a disc
  that size, so no pocket is narrower than the tool and every inside corner seen from it is rounded to its radius. In
  2D, `mill: '+z'` with a tool cuts a plate's profile through along z. Refused by name under a cell, or without mill.
- `mill: ['+z', '-z']`: milled from several sides, a setup each; a cell stays only where no side's tool reaches it.
  A side given twice is refused by name.
- `draft` (degrees, with `cast`): the part narrows towards the side it is drawn off, a step out every whole number of
  layers in 1 / tan(draft). Refused by name outside 0 to 45 degrees, or where the grid is too shallow for one step.
- `voids: 'prevented'`: enclosed voids prevented as the part is optimised, by the virtual temperature
  (`virtualTemperature`, Liu and others 2015) kept under a cap.
- `feature` (mm): the thinnest member, held by an opening filter (`featureFilter`) of up to three cells across;
  nothing to do where a cell is already as wide; wider is refused by name with the cell size that holds it (a third
  of the feature, rounded up so the size asked for passes) or the feature the grid holds (rounded down).
  `featureCells(feature, h)` and `thin(grid, density, { radius })` give the ball and the cells in narrower members.
- `undercuts(grid, density, { from, tool, draft })` also counts what a tool of a size, or a draft, could not make.

### Fixed

- An empty cell no longer crashes the optimality criteria's update.
- A tool under a cell is refused with cells no bigger than the tool, rounded down (to the nearest, 1.237 mm asked
  for 1.24 mm cells, still too big).

## 0.3.6: fewer triangles, problems in 2D from a part
### Added

- `reduce(mesh, { tolerance, lo, hi, overhang })`: a closed surface with fewer triangles. Edges are collapsed
  cheapest first by quadric error (Garland and Heckbert 1997), each corner kept within `tolerance` mm of the planes
  it came from; a collapse that would open, pinch or fold the surface is refused, corners on the grid's faces stay on
  them, and with `overhang` no collapse adds area past the printer's limit or leaves a new tip. Refused by name with a
  tolerance that is not a distance above 0. On the bracket bench's printable result, 0.1 mm took 75,592 triangles to
  21,124 with the volume within 0.01%.
- A part's mesh can be a region of a flat (2D) problem: `{ triangles, flat: true }`, its section halfway up.
- The docs site runs the MBB beam live in the browser, in a worker, with this package's own code.

## 0.3.5: stress-limited optimisation
### Added

- `strain`: a strain limit in place of `stress` (0.02 is 2%), times the material's E. Both at once is refused.
- A mechanism (a problem with an `output`) given a stress or strain limit is optimised as before, then checked at its
  input force: `result.stress` gives its peak (MPa, in cells at least half solid), the limit, and the input force and
  output travel that take the peak to the limit (the part is linear, so both scale with the force). With `strain`, the
  peak and limit as strains too. Optimising a mechanism under the limit is still to come.

### Changed

- A problem's `volume` is optional in its type, as it already was with a stress limit.

## 0.3.4: process filters
### Added

- `symmetry: { mirror, turns, axis }`: the same either side of the grid's middle planes (mirror `'x'`, `'xy'`, ...)
  and each half or quarter turn about its middle (turns 2 or 4; a quarter turn needs a square grid across its axis).
- `extrude: 'x' | 'y' | 'z'`: one section all along an axis, a part cut from a bar or plate of the profile.
- `mill: '+z'`: milled from that side, so no undercuts: a cell is as solid as every cell between it and the tool.
- `cast: '+z'` or `cast: { draw: 'z', parting }`: cast in a mould drawn off one way, or in two halves drawn off both
  ways from a parting plane (mm along the axis; the space's middle by default). The spec holds the plane's layer.
- `tieFilter`, `drawFilter`: the filters themselves. `undercuts(grid, density, { from, parting })`: the empty cells a
  tool or mould half could not reach. `voids(grid, density)`: enclosed empty pockets (powder a powder bed print can't
  lose, a casting's trapped core), each with its volume and centre.
- `grey(density, passive)`: the share of the design cells neither empty nor solid (between a tenth and nine tenths).
- A problem with two of overhang, mill and cast is refused, as is a mirror or turn that swaps the tool's side, the
  draw or the build direction for its opposite, or a quarter turn that moves it onto another axis (a mould in two
  halves parted at the grid's middle may be mirrored or half turned across its draw).

No existing result changes: a problem with none of the new fields is optimised exactly as before.
