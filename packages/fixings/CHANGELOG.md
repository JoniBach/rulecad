# Changelog: @rulecad/fixings

What changed in each release, for someone upgrading a workspace. A **printed size** is a dimension of a part you
print (a hole's diameter, a seat's depth, a part's outline). Each release says whether any printed size moved, and
why.

## 0.1.4: the kit reads its screws from fixings (Fixings 3)

### What reads fixings now

This package is now where every screw size in the kit comes from:
- `@rulecad/cad`: `v.fixings` in a design, and the `fasten` relation in an assembly, which follows a screw through the
  parts, chooses its sold length and counts it in `cad list`.
- `@rulecad/motors`: a motor's mounting screws, their clearance holes and counterbores.
- `@rulecad/pcb`: a board's mounting holes, named by their thread (`mount('M2', x, y)`).
- `@rulecad/shapes` does not import this package (that would make a cycle, since this package draws with shapes'
  seats). Its seats take the screw's figures from here as plain numbers.

### Changed

- `screwGroup(places, o).turns` is `null` when the twist about a single screw rounds to 0 N m at the thousandth it is
  given in. It used to be `0`, and cad then warned "a twist of 0 N m about the one screw is held by friction alone"
  on a part held by one screw whose own weight sits a hair off the screw's axis. A test holds this.

### Printed sizes that moved

None. No hole, seat or piece of hardware this package draws changed size or shape.

### What a workspace should change

Nothing is required. Code that tested `screwGroup(...).turns > 0` keeps working; code that tested `turns !== null`
to mean "a twist" now skips a twist that rounds to nothing, which is the intent.
