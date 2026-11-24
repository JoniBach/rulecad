# Changelog: @rulecad/topopt

What changed in each release, for someone upgrading.

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
