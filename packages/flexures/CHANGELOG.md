# Changelog: @rulecad/flexures

What changed in each release, for someone upgrading a workspace. A **printed size** is a dimension of a part you
print (a leaf's thickness, a pin's diameter, a part's outline). Each release says whether any printed size moved, and
why. Releases before this file was started are described in their pull requests on GitHub.

## Unreleased: lattice spring blocks (#79)

### Added

- `latticeCell` (issue #79): a honeycomb's or a re-entrant (auxetic) honeycomb's in-plane properties from its walls'
  bending (Gibson and Ashby 1997): Young's moduli along x and y, Poisson's ratios (negative when re-entrant), the shear
  modulus, density, a wall's peak strain for a strain of the whole, and the uprights' buckling stress.
- `latticeBlock` and `latticeBlockModel`: a spring block of those cells between two solid plates, drawn flat with every
  inside corner rounded, and solved as a frame of beams in `@rulecad/fea` for its stiffness, its walls' strain at a
  travel, the force at which they buckle, how its sides move, and its grams. `ends: 'sliding'` lets the walls' ends
  slide on the plates; a wide block of thin walls then comes to Gibson and Ashby's figures, which the tests check.
- `latticeFindings`: walls in whole lines, openings at least two lines, depth in whole layers, the cells in the bed's
  plane, the strain at a travel against the material's limit and the travel against buckling, as findings in the
  kit's one shape. Bad cells are refused by name (`lattice.angle`, `lattice.cross`, `lattice.thick`, `lattice.size`,
  `lattice.count`, `lattice.ends`, `lattice.material`, `lattice.printer`).
- The bench's `flexures/lattice`: a re-entrant block in PETG, 5.09 N/mm, sized for 5 N with 2.06 times the margin on
  its walls' strain, 3.72 g.

### Printed sizes that moved

- None: the new generators draw new parts only.

## 0.5.6: compliant gripper jaws (#77)

### Added

- `gripperJaws` and `gripperJawsModel` (issue #77): two jaws, each on a parallel guide, resting closed and opened by a
  servo's double horn turning between their bars. The springs grip, so the gripper holds with the power off; each
  guide stops both ways on a tongue in a slot in its fork. The model gives the horn's stroke and push, the servo's
  margin against the springs, the grip on an object by its width and what that holds, the stops against the leaves'
  strain limit (the servo driven on past open at its full stall torque, turning the horn until the stops hold it or
  through to its toggle at 90°, each bar bending between its tip and its fork; it warns when the stops hold with less
  than the margin asked and the toggle's travel is past 0.8), the leaves' print findings and the grams, as findings in the kit's one shape, with `at` for building a
  palm round it. Bad input is refused by name before any sums. The README compares it with the arm's hand-built
  gripper, and the workspace example has both (`arm/gripper`, `arm/jaws`).

### Printed sizes that moved

- None: the new generator draws new parts only.

## 0.5.5: the annular snap in fixings, named in the README (#76)

### Docs

- The README says where the annular snap of issue 76 lives: in `@rulecad/fixings` (`annularSnapModel`,
  `annularBead`, `annularGroove`), since its job is to hold a lid on its box. No code changed here.

## 0.5.4: no import loops (#278)

### Fixed

- Loaders without cycle support, such as the JSCAD web app's, now load this package. Its modules imported each other
  in a loop (issue #278): Node links such a loop and runs it, but a loader that caches a module only once it has run
  loads it again and again until the stack runs out (`RangeError: Maximum call stack size exceeded / failed loading
  module ...`).
- The flexures themselves moved from `flexures.mjs` to a new `core.mjs`, which `compose.mjs`, `physics.mjs` and
  `lamina.mjs` import. `flexures.mjs` now only re-exports. `lamina()` hands itself to the flooded-frame solver instead
  of `flooded.mjs` importing `lamina.mjs` back, and the stage timer moved to `cache.mjs`. Every export keeps its name
  and behaviour, and no printed size moved.

## 0.5.3: snap pins move to @rulecad/fixings (Fixings 4)

### Changed

- `snapPin`, `snapSocket` and `snapPinModel` now live in `@rulecad/fixings`, which holds everything whose job is to
  hold two parts together. This package re-exports the very same functions from there, so code that imports them
  from `@rulecad/flexures`, or calls `v.flexures.snapPin` in a design, keeps working unchanged.
- This package now depends on `@rulecad/fixings`. Fixings never imports this package, so there is no cycle.
- `snapHook`, the ratchets, `pinJoint`, the travel and angle stops and everything else that bends as its job stay here.

### Printed sizes that moved

None. The launcher's pins, the joints sampler's pins and the gears tensioner's frame were built before and after the
move and are byte for byte the same.

### What a workspace should change

Nothing is required. A new design is better served by `v.fixings.pin('snap pin 4x6')` and
`v.fixings.pinHole('snap pin 4x6')`: the pin is named, its socket takes its clearance from the printer's rules, and
an assembly's fit can name it so `cad check` finds its sockets and `cad list` counts it.
