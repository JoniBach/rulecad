# Changelog: @rulecad/shapes

What changed in each release, for someone upgrading a workspace. A **printed size** is a dimension of a part you
print (a hole's diameter, a seat's depth, a part's outline). Each release says whether any printed size moved, and
why.

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
