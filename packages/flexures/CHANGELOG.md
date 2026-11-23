# Changelog: @rulecad/flexures

What changed in each release, for someone upgrading a workspace. A **printed size** is a dimension of a part you
print (a leaf's thickness, a pin's diameter, a part's outline). Each release says whether any printed size moved, and
why. Releases before this file was started are described in their pull requests on GitHub.

## Unreleased

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
