# Changelog: @rulecad/topopt

What changed in each release, for someone upgrading.

## Unreleased

### Added

- `reduce(mesh, { tolerance, lo, hi, overhang })`: a closed surface with fewer triangles. Edges are collapsed
  cheapest first by quadric error (Garland and Heckbert 1997), each corner kept within `tolerance` mm of the planes
  it came from; a collapse that would open, pinch or fold the surface is refused, corners on the grid's faces stay on
  them, and with `overhang` no collapse adds area past the printer's limit or leaves a new tip. Refused by name with a
  tolerance that is not a distance above 0. On the bracket bench's printable result, 0.1 mm took 75,592 triangles to
  21,124 with the volume within 0.01%.
- The docs site runs the MBB beam live in the browser, in a worker, with this package's own code.
