# Changelog: @rulecad/flexures

What changed in each release, for someone upgrading a workspace. A **printed size** is a dimension of a part you
print (a leaf's thickness, a pin's diameter, a part's outline). Each release says whether any printed size moved, and
why. Releases before this file was started are described in their pull requests on GitHub.

## Unreleased
### Added

- `kreslingTube`, `kreslingTubeModel` (issue #78): the Kresling fold printed standing in TPU, one piece: a floor, a wall
  of triangles with a panel inside each set back from its creases and sloped 3:1, and a ring on top. The model gives
  each crease's turn from the printed state to the second, the webs' strain, the panels' stretch and the push over the
  barrier, the drawn solid's steepest underside against the printer's overhang, and grams. 6 sides on R 20, 30 tall at
  100°, webs 0.8 by 4: 11.4% at most, 2.19 times under TPU's 25%; 4.68 g.
- `waterbomb`, `waterbombModel` (issue #78): the waterbomb base printed flat (web and panels, as the Miura), its
  symmetric fold with every sector keeping its angle, each crease's fold, strain and pinch, the furthest fold, grams.
- `coneFourBar`, `coneFourBarModel`, `coneFourBarFindings` (issue #78): a four-bar in a cone's wall, its joints on the
  cone's rulings, so a spherical four-bar about the apex; printed on its wide end, the inside its only overhang
  (`developable.overhang`). It is the tube's four-bar as the cone's angle goes to 0.
- `balancedStrip`, `balancedStripModel` (issue #79): a zero-stiffness cell drawn: the buckled switch's strip, its pad a
  ring turning on a disc printed in place, balanced by two leaves on a post (a parallel guide). The strip goes over
  S-shaped at a straight-line negative stiffness, so the pair is flat over 3.11 mm (90 mm strip, PETG) with 0.012 N at
  most, 2.33 times under the strain limit, 19.0 g; the arch's balanced cell wanted 409 mm of leaf for 1.86 mm.
- `flexureMaterial` takes a rule set's `flex_strain` as the strain limit as it stands, and refuses a rubber (strength
  over modulus past 0.5) without one, by name. Stiff plastics are as before.

### Printed sizes

No existing printed size moved: the new parts are new.

## 0.5.15: kirigami, developable mechanisms, Kresling and zero-stiffness cells (#78, #79)
### Added

- `rotatingSquares`, `rotatingSquaresModel`, `kirigamiFindings` (issues #78 and #79): a kirigami sheet of rotating
  squares, printed flat in one piece, which stretches both ways at once (Poisson's ratio -1). The model gives the
  in-plane modulus, the pull and stretch with large turns counted, the stretch at the necks' strain limit, and grams.
  The same cell is the chiral lattice of rotating squares.
- `neckHingeModel` and `neckFE`: the one-sided notch hinge between a slot's round end and another slot's straight
  side, its stiffness and peak strain tabulated from the kit's own plane-stress finite elements (r / w from 0.5 to 6);
  `neckFE` regenerates any row.
- `tubeFourBar`, `tubeFourBarModel`, `tubeFourBarFindings` (issue #78): a developable four-bar in a tube's wall, printed
  standing in one piece with living hinges whose axes run up the tube. The model gives each hinge's turn and strain,
  the input's torque, its travel at the strain limit, and how far each link stands out of the tube and in.
  Each hinge bends as its drawn web, the thin middle plus what the pockets' round corners add (`hinge.length`).
- `kreslingModel` (issue #78): the Kresling fold's two stable states in closed form, each crease's fold, the flat
  pattern, the energy and force between the states with the panels taken as bars (an estimate), and the web a crease
  needs for the material's limit.
- The bench has a kirigami panel, `flexures/kirigami`, and a developable tube, `flexures/tube`.
- `curvedCellModel` and `balancedCellModel` (issue #79): the curved-beam cell's force curve from the beam solver, the
  range where its stiffness is negative, and with a positive spring as stiff, the range of travel over which the pair
  holds about the same force (zero stiffness), with the leaves a printed spring of that stiffness takes.

No printed size of an existing part moved.

## 0.5.12: folding sheets and the Miura fold (#78)
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

## 0.5.11: pivots, linkages, amplifiers and bistables
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

## 0.5.10: lattice spring blocks (#79)
### Added

- `latticeCell` (issue #79): a honeycomb's or a re-entrant (auxetic) honeycomb's in-plane properties from its walls'
  bending (Gibson and Ashby 1997): Young's moduli along x and y, Poisson's ratios (negative when re-entrant), the shear
  modulus, density, a wall's peak strain for a strain of the whole, and the uprights' buckling stress.
- `latticeBlock` and `latticeBlockModel`: a spring block of those cells between two solid plates, drawn flat with every
  inside corner rounded, and solved as a frame of beams in `@rulecad/fea` for its stiffness, its walls' strain at a
  travel, the force at which they buckle, how its sides move, and its grams. `ends: 'sliding'` lets the walls' ends
  slide on the plates; a wide block of thin walls then comes to Gibson and Ashby's figures, which the tests check.
- `latticeFindings`: walls in whole lines, openings at least two lines (an ordinary cell's narrowest opening measured
  straight across between its parallel slanted walls, cos θ (h + 2 l sin θ) - t, not up y), depth in whole layers, the cells in the bed's
  plane, the strain at a travel against the material's limit and the travel against buckling, as findings in the
  kit's one shape. Bad cells are refused by name (`lattice.angle`, `lattice.cross`, `lattice.thick`, `lattice.size`,
  `lattice.count`, `lattice.ends`, `lattice.material`, `lattice.printer`).
- The bench's `flexures/lattice`: a re-entrant block in PETG, 5.09 N/mm, sized for 5 N with 2.06 times the margin on
  its walls' strain, 3.72 g.

### Printed sizes that moved

- None: the new generators draw new parts only.

## 0.5.7: simple flexures (#73, #74, #75)
No printed size moves: every change is a new generator, and `beamModel` now shares its integration with the pinned
leaf, with the same sums.

### Added

- `spiralSpring`, `spiralPath` and `spiralSpringModel` (#73): a flat spiral (clock) spring, a strip round a hub with
  its outer end in a boss, the ends thickened to twice the strip so the joins' corners stay below the strip's strain.
  The model works out the hub's centre held (Castigliano on the strip as drawn) or floating, and agrees with the beam
  solver within 1%. The README says why a helical spring is the wrong answer on a filament printer.
- `pinnedLeaf` and `pinnedLeafModel` (#73): a stiff link on two corner-filleted pivots, the pinned-pinned leaf.
- `filletHinge`, `filletHingeModel`, `hyperbolicHinge` and `hyperbolicHingeModel` (#74): corner-filleted and
  hyperbolic notch hinges, by integrating the neck's profile as the elliptical hinge does.
- `splitTube` and `splitTubeModel` (#74): a slotted tube printed standing, a torsion pivot, with a warning that its
  twist shears the layers.
- `xyStage` and `xyStageModel` (#75): two parallel guides in series at right angles, each axis's stiffness, the
  stiffness along the leaves and each axis's stray.
- `ports` and `models` know the spiral spring, the pinned leaf and the two new hinges, so `report` and `lamina` take them.
- A spiral spring takes 1.25 turns or more (with fewer, its thickened ends lie side by side and the coils overlap at
  a pitch the 1.5 × thickness rule allows), and its model's `gap` is measured on the outline as drawn.
- In a `lamina`, a spiral spring's hub turns in place: the finite-element peak says so (info) instead of failing on a
  push with no direction, and a `lamina.coils` warning says the coils' closing as it winds is not checked.
- Bad input refused by name: `along`, `across` and `slot` are now checked as sizes (an elliptical hinge or LET joint
  given 0 there is refused instead of drawing nothing).

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
