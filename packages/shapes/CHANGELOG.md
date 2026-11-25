# Changelog: @rulecad/shapes

What changed in each release, for someone upgrading a workspace. A **printed size** is a dimension of a part you
print (a hole's diameter, a seat's depth, a part's outline). Each release says whether any printed size moved, and
why.

## Unreleased
### Added

- `regionShape` (and so `optimisedOutline`) takes a region of `rings`: closed outlines solid on their left, holes
  clockwise, as cad gives a part swept past a flat plate. It is cut with its holes open; drawn from its `points`
  alone, the solver's single polygon of all its outlines, it would not be.

### Printed sizes that moved

- None.

## 0.4.8: a part as a region
### Fixed

- `optimisedOutline` leaves a design's part named as a keep or avoid region to the design, as `optimisedSolid` does:
  `regionShape` gives null for one. Before, it was drawn as a circle with no radius, and the build failed.

## 0.4.7: shaft bores in one place
### Added

- `shaftBore(shaft, { fit, across, printer })` and its table `SHAFT_FITS`: the bore a printed part takes for a bought
  shaft, in one place (#307). `slide` is the fit bar's measured D-bore (0.05 mm each side, so 5.2 mm drawn for a 5 mm
  shaft on the X1C), `press` the estimate of -0.02 mm each side, `run` the printer's `fit`, or a gap in mm. Each answer
  says how far its fit is trusted (`kind`). `@rulecad/motors` now reads its bore from here, so the three agree.
- `plainBearing` and `pulleyBore` take `fit` as `shaftBore` does.
- `shaftBore` takes a `hole_comp` below 0, for a printer whose holes come out large, as `@rulecad/motors`' bore always
  has; `plainBearing` and `pulleyBore` now take one too (they refused it). It refuses a `hole_comp` that is not a
  number, or one that leaves no bore, by name.

### Printed sizes

- `pulleyBore` is drawn at the measured slide fit: 5.2 mm for a 5 mm shaft, 8.2 mm for 8 mm (it was 5.3 and 8.3). It
  read the printer's `slip`, a figure across the diameter, as a gap each side. Give `fit: 'run'` for an idler that
  turns on its axle. No example project draws a `pulleyBore`.
- `plainBearing` is unchanged (8.5 mm for 8 mm on the X1C).

## 0.4.6: print-in-place clearances (#162)

### Added

- `ops('manifold').gap(a, b, within)`: the least distance between two solids' surfaces, by Manifold's `minGap`, up to
  `within` mm (#162). cad uses it to check that parts printed in place stand the print gap apart. On the JSCAD engine
  `gap` refuses by name.

No printed size moved.

## 0.4.5: shapes holds no screw size (Fixings 3)

### What reads fixings now

Nothing in this package imports `@rulecad/fixings`: fixings draws with this package's seats, so an import the other
way would make a dependency cycle. Instead every helper takes plain dimensions in mm, and anything named by a thread
(a hole for an M3 screw, the seat for its head, its nut or its insert) comes from fixings, which calls `countersink`,
`teardropHole`, `nutPocket` and `wallOpening` here with the thread's figures. A test holds that fixings' countersink,
nut pocket, side hole and nut slot are this package's helpers given the model's figures, to the last vertex.

### Changed

- `nutTrap(nut, { hole, ... })`: the 3.5 mm default for the screws that hold a lead-screw nut's flange is gone. Their
  hole comes in as `hole` (the hole as drawn, for example `fixings.holeModel('M3', { printer }).diameter`, which
  already has the printer's compensation in it), or else from the nut's own `hole_diameter` or `mount_hole_diameter`
  plus the printer's `hole_comp`. Given neither, `nutTrap` refuses by name. The result carries `.hole`, the screws'
  hole as drawn.
- `nutTrap` reads `flange_width` (the name the `t8-nut` rule set uses) as `flange_thickness`.
- The README says which helpers take screw figures and why, and points to fixings for anything named by a thread.

### Printed sizes that moved

None. Every drawn result is the same solid, vertex for vertex, for every input that worked before: the kit's
`t8-nut` set gives its own `mount_hole_diameter`, 3.5 mm, the figure the old default typed.

### What a workspace should change

- A call to `nutTrap` with a nut that has no `hole_diameter` or `mount_hole_diameter` and no `hole` now fails. Pass the
  screws' hole from fixings: `nutTrap(nut, { hole: v.fixings.holeModel('M3').diameter, printer: v.x1c, at })`, or add
  the nut's own figure to its rule set.
