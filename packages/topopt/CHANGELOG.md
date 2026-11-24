# Changelog: @rulecad/topopt

What changed in each release, for someone upgrading.

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
