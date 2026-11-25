# Changelog: @rulecad/topopt

What changed in each release, for someone upgrading.

## Unreleased
### Added

- `robust: true` on a problem: the design is optimised as three copies, as made, eroded (a little thin, threshold
  0.7) and dilated (a little thick, 0.3). With a stress or strain limit and no output, the lightest layout that keeps
  the limit on every cell of all three (da Silva, Beck and Sigmund 2019): on the tests' cantilever at 20 MPa, made
  thin the plain layout peaks at 103 MPa, the robust one at 20.0 MPa, for 89% of the space against 76%. A mechanism
  maximises the worst copy's travel by the bound formulation (an extra MMA variable): on the PLA inverter the worst
  copy moves 0.93 mm against 0.023 mm. A robust mechanism with a stress or strain limit is optimised under it on the
  three copies (limits relaxed by density cubed; cells at supports, input and output not limited): at 0.15% the
  design as made peaks at 4.03 MPa against 4.02 MPa, where the plain layout peaks at 12.1 MPa. Refused by name with a
  volume alone, or a value other than true or false.
- `result.stress.copies` (`eroded`, `dilated`): every lightest layout's and every limited robust mechanism's copies'
  peaks. `result.mechanism.copies`: every mechanism's copies' travels.
- `densityFilter(size, radius, { pad })`: with pad, cells past the grid's edges count as empty (Clausen and
  Andreassen 2017). A robust mechanism uses it, and keeps the cells at its supports, input and output solid.

### Fixed

- The stress limits' gradient was projected at the design's threshold for every copy; it now uses the copy's own
  (no effect before: only the design as made was ever limited).

### Not done

- The L-bracket's inside corner still stays sharp (issue 39): robust, on 1.6 mm cells, its peak as made is 27.5 MPa
  against 25. Limiting cells at their corners or Gauss points empties the corner cell but takes 68 to 76% of the
  space and does not settle; not built in. The README has the figures.
- A limited robust mechanism's dilated copy can end over the limit (66% over on the inverter at 0.15%).

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
