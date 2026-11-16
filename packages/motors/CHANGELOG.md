# Changelog: @rulecad/motors

What changed in each release, for someone upgrading a workspace. A **printed size** is a dimension of a part you
print (a hole's diameter, a seat's depth, a part's outline). Each release says whether any printed size moved, and
why.

## Next release: motors mount through fixings (Fixings 3)

The version number is set when the release is published.

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
