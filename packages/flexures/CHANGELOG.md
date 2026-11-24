# Changelog: @rulecad/flexures

What changed in each release, for someone upgrading a workspace. A **printed size** is a dimension of a part you
print (a leaf's thickness, a pin's diameter, a part's outline). Each release says whether any printed size moved, and
why. Releases before this file was started are described in their pull requests on GitHub.

## 0.5.9: folding sheets and the Miura fold (#78)
### Added

- `letArray` and `letArrayModel` (issue #78): LET joints in series across a fold and in parallel along it. Joints in
  series share the angle, so the hinge folds further for a strain; in parallel they share the moment. The model gives
  the stiffness (m k / n), the strain at a fold, the fold a strain allows, the pinch (where the rigid parts either side
  of a joint meet) and the gap between the panels folded flat.
- `foldSheet`, `foldSheetModel` and `foldCheck`: a sheet of panels joined by LET arrays or living hinges, printed flat
  in one piece and drawn folded at any set of folds (an assembly's pose can set them). `foldCheck` checks each pose on
  the way from flat: every hinge's strain (`fold.strain`), its pinch (`fold.pinch`), and every two rigid bodies apart
  by the clearance (`fold.clash`, `fold.clearance`); a bit of panel that two bands cut off is left out of the print and
  said (`fold.loose`). Two arrays whose joints would meet at a corner are refused (`fold.strips`): they would print
  joined. Bad input is refused by name (`fold.*`, `let.*`). `foldSheet` and `foldCheck` are async: their
  geometry is manifold-3d's.
- `miura` and `miuraModel`: the Miura fold printed flat as panels on a web, its rigid folding (one tilt sets every
  crease), each crease's turn, strain and pinch, and the furthest it folds (`miura.*` refusals).
- The workspace example `flexures/tray` (a tray whose four walls fold up on LET arrays, in PETG) and the assembly
  `flexures/tray-fit`, which shows it flat and folded and checks the block it holds in both poses.

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
