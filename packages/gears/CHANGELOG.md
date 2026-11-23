# Changelog: @rulecad/gears

What changed in each release, for someone upgrading a workspace. A **printed size** is a dimension of a part you
print (a gear's tip diameter, a tooth's thickness). Each release says whether any printed size moved, and why.
Releases before this file was started are described in their pull requests on GitHub.

## Unreleased

### Added

- `compoundPlanetary({ ..., printInPlace: true, gap, helix })` (#162): a compound planetary drawn to print in one
  piece. Every gap is the print gap (`gap`, default `DEFAULTS.printGap`, 0.3 mm, an estimate): the backlash that
  leaves it normal to every flank, 2 gap / (cos α cos β_b), and a dedendum that leaves it under every tip; herringbone
  teeth (`helix`, default `DEFAULTS.helix`, 30°), the sun of one hand and the planets and rings of the other; no
  carrier. `best.printInPlace` gives what it was drawn to, and a `compound.inPlace` finding says so. A `backlash` given
  with it is refused by name, as are `gap` and `helix` without it.
- `compoundPlay(teeth, backlash)` and `best.play`: how far the output ring turns with the sun and the held ring still,
  in mm at its pitch circle and in degrees, with a `compound.play` finding. Chapter 11's 38:1: 0.65°; the 44:1 printed
  in place: 2.92°.
- `DEFAULTS.printGap` and `DEFAULTS.helix`, each with its rule.

### Fixed

- `compoundPlanetary` laid out a planet out of phase with the output ring where its teeth put it there (#162): with
  57/39/36/135/132 (ratio 60, step -1, 3 planets) the planet at 120° cut 0.004 mm into the output ring at the
  default backlash, and stood 0.11 mm off it where 0.3 mm was drawn, printed in place, with no finding. Each planet
  after the first now takes the first tooth of its first step that also meshes the output ring (there, 12 teeth on),
  and a `compound.phase` finding fails where no tooth does. Layouts already in phase (chapter 11's 38:1, the 44:1
  printed in place) are unchanged.

No printed size moved: a gearbox not printed in place is drawn as before. Where a planet was out of phase, it now
stands turned a whole number of its first step's teeth.

## 0.3.3: no import loops (#278)

### Fixed

- Loaders without cycle support, such as the JSCAD web app's, now load this package. Its modules imported each other
  in a loop (issue #278): Node links such a loop and runs it, but a loader that caches a module only once it has run
  loads it again and again until the stack runs out (`RangeError: Maximum call stack size exceeded / failed loading
  module ...`).
- The code the other modules share moved from `gears.mjs` to a new `core.mjs`, which `planetary.mjs`, `contact.mjs`,
  `tooth.mjs`, `worm.mjs` and `diagram.mjs` import. `gears.mjs` now only re-exports. Every export keeps its name and
  behaviour, and no printed size moved.
