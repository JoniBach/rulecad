# Changelog: @rulecad/flexures

What changed in each release, for someone upgrading a workspace. A **printed size** is a dimension of a part you
print (a leaf's thickness, a pin's diameter, a part's outline). Each release says whether any printed size moved, and
why. Releases before this file was started are described in their pull requests on GitHub.

## 0.5.8: pivots, linkages, amplifiers and bistables
### Added

- Compliant linkages (issue #77): `fourBar` and `fourBarModel` (crank-rocker, parallelogram and the other Grashof
  kinds), `sliderCrank` and `sliderCrankModel` (the slider on a parallel guide, every joint a flexure). Each joint is a
  short flexure on the line halfway between its links, rounded into a knuckle on each. The models give the kind, the
  transmission angle, each joint's turn and strain, the crank's torque, the swing the strain limit allows, the
  clearances swept over the swing, the slider's stroke, drop and push for a torque, and the grams, as findings.
  `fourBarModel(...).solve(deg)` runs the beam solver on the drawn flexures.
- Displacement amplifiers (issue #77): `bridgeAmplifier`, `rhombusAmplifier`, `leverAmplifier` and their models: the
  rigid links' ratio (cot α, or b / a), the beam solver's ratio on the drawn flexures, the input's stiffness, the strain,
  the stroke the limit allows, and a fail by name for a bridge pushed past flat.
- Bistables (issue #76): `tiltedBistable` (a shuttle on two tilted leaves, one piece) and `buckledSwitch` (a strip
  squeezed into its frame, two prints), with models whose force curves come from the beam solver: the push that
  switches it, the pull back, where it rests again, the strain on the way, and for the switch its rise, its load on the
  frame and the frame's give. `snapCurve` reads such a curve for any beam system, with other unknowns held where a
  frame is supported. The tilted bistable's model puts its frame's bar in the solver (the frame sat on its blocks),
  reports the same figures on a rigid frame beside them, and warns (`bistable.frame`) when the bar takes over half
  of the pull back; its bar is 20 mm deep by default, because a 6 mm bar lets the roots spread and the part springs back.
- `pivots.mjs`: the drawing, clearances and beam-solver set-up the linkages and amplifiers share.

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
