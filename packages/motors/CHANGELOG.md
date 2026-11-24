# Changelog: @rulecad/motors

What changed in each release, for someone upgrading a workspace. A **printed size** is a dimension of a part you
print (a hole's diameter, a seat's depth, a part's outline). Each release says whether any printed size moved, and
why.

## 0.1.7: bores from shapes' shaftBore
### Changed

- `boreModel` and `bore` read their fit from `@rulecad/shapes`' `shaftBore` (#307), the one place every shaft bore in
  the kit reads it. `DEFAULTS.fit` and `DEFAULTS.press` are now the same objects as `SHAFT_FITS.slide` and
  `SHAFT_FITS.press`, with a source and a date. The package depends on `@rulecad/shapes`, which fixings already did, at the release that
  first ships `shaftBore`. A printer's `hole_comp` below 0 is still taken.

### Printed sizes

- None moved: a NEMA 17's bore is still 5.2 mm (4.7 across its flat) at slide and 5.06 mm (4.56) at press.

## 0.1.6: motors mount through fixings (Fixings 3)

### What reads fixings now

- `mountModel` and `mount()` take their screw from `@rulecad/fixings` (`fixingModel`), and cut fixings' clearance hole
  and counterbore. The package's own private table of thread names is gone, so a motor's screw and a design's screw
  are the same model, with the same sourced figures.
- `screw` is a fixing's name: a thread (`'M3'`), whose length is worked out from the plate, or a whole screw
  (`'M3x8 cap'`), whose length is checked as it is.
- New dependency: `@rulecad/fixings`.

### Added

- `mount.engagement`: the screw's length past the plate, held to the motor's `mount_hole_depth`, must be at least one
  diameter (`engagement.steel` in `@rulecad/rules`). So an M3x6 through a 6 mm plate into a NEMA 17 fails: it ends at
  the motor's face.
- A thread the motor's tapped holes do not take is refused by name, with the thread they do take.

### Printed sizes that moved

None. The solid `mount()` cuts is the same for every motor in the kit: a test holds each one's volume and bounds to
the figures recorded before the change.

### What a workspace should change

- A design that passed a screw name the motor's holes do not take (an M4 screw for an M3-tapped NEMA 17) is now
  refused: name the motor's own thread.
- A plate too thin or too thick for a sold screw to reach the motor's thread now gets a `mount.engagement` failure,
  where it used to pass. Change the plate's thickness or name a whole screw that reaches.
