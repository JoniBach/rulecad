# Changelog: @rulecad/topopt

What changed in each release, for someone upgrading.

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
