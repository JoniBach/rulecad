# Changelog: @rulecad/cad

What changed in each release, for someone upgrading a workspace. A **printed size** is a dimension of a part you
print (a hole's diameter, a seat's depth, a part's outline). Each release lists every printed size that moved, with
its reason. A **fasten** is an entry in an assembly's `"fasten"` list: one screwed joint, naming the screw by thread
and head, the parts it passes through and the part it ends in.

## 0.7.96: dot-files are not a package's sources
### Fixed

- cad's build keys read every module of its helper packages, and so also a scratch module another package's tests write beside them for a moment (the fixings README test's `.readme-example-<n>.mjs`). Run in parallel, as CI runs the packages' tests, cad could list it and then fail to read it once deleted (ENOENT, seen on Windows twice). Dot-files are now left out, in the build key, the gears' key and the board engine's. Builds miss the cache once (this code is part of its key). No printed size changes.

## 0.7.95: a rubber is refused as a printed fitting
### Changed

- A project whose material is a rubber (a rule set whose strength over its modulus is past 0.5, such as the kit's new
  `tpu`) is refused by name for printed fittings, whose sums are for a stiff plastic, and a rubber is left out of the
  plastics another refusal lists. No printed size moved.

## 0.7.93: milled by a tool, cast with draft, a minimum feature, voids prevented
### Added

- A problem milled from several sides (`"mill": ["+z", "-z"]`), by a tool of a size (`"tool"`, mm), or cast with a
  draft (`"draft"`, degrees): the schema first. `cad optimise` says how it is made, the draft as made at the grid
  ("a step out every 3 layers: 18.43°"), and any cells too narrow for the tool, in the design or in avoid regions
  (drill those holes). A tool or draft with no milling or casting is refused by name.
- `"mill"` and `"cast"` can name a variable holding the side or sides (`"+z"`, `"+z -z"`) or `"none"`, so a variant
  switches the process; a tool or draft goes off with it.
- `"voids": "prevented"`: the optimiser keeps every empty pocket open to the outside; cad optimise says so, and any
  void a keep region walls in is still an error, said to be left though prevented.
- `"feature"` (mm): the thinnest member, from the printer's line (`x1c.wall_min`, two lines). `cad optimise` says the
  grid holds it where a cell is as wide, or that it was held to three cells, with any cells left narrower; past three
  cells it is refused with the cell size that would hold it.
- The bench's lever E (`bench/lever:milled`): the lever's profile milled through a 6 mm plate by a 4 mm end mill,
  98.9 N/mm against the printed C's 100. No existing printed size moves.
- A refusal of a feature past three cells asks for cells of at least a third of it, rounded up (it asked for cells of
  1.33 mm or less for 4 mm, which it refused again), or a smaller feature.


## 0.7.92: eight axes on a Mega 2560 (#199)
- The wiring sheet names a Mega slot's pins as step, dir and enable (D38, every slot's): the wire to a driver breakout carries EN, STEP, DIR and GND, and the axis's home switch is a wire of its own. A CNC shield's axis still names its limit pin.
- The quadruped carries a 12 V supply (a Mean Well LRS-100-12 to buy: about 6 A for eight motors, an estimate) and a power wire to each breakout.
### Added

- `cad machine` writes the machine's `controller`: the bought board the streamer runs on, a CNC Shield V3 (an Uno,
  three axes, slots X, Y, Z) or an `arduino-mega-2560` (eight axes, slots S0 to S7), with the Uno where the assembly
  names none. A motor's slot is read from its wire to the board, or, for a driver on its own breakout, from the motor's
  wire to the breakout and the breakout's signal wire on to the slot. Two different controllers are refused by name.
- `cad plot` on a gait holds the axes to the controller's slots: the quadruped's eight stream through the Mega, and an
  Uno still warns `stream.axes` past three, naming the Mega as the way to more.
- The wiring sheet names a Mega slot's pins as it does a shield's.

### Changed

- The bench quadruped and crawl carry a Mega 2560, a DRV8825 on a driver breakout for each motor and sixteen wires
  (each motor to its breakout, each breakout's EN, STEP, DIR and GND to the Mega); each motor names its driver, so the
  check says each trimmer's setting. The boards sit over the body as references; no printed size moved. EXAMPLES
  chapter 14 says how the eight axes are wired, and `leg.robot_mass`'s rule names the Mega (its 4.2 kg is unchanged).

## 0.7.91: problems at an assembly's joints, avoid regions from a sweep
### Added

- Optimisation problems placed in an assembly (#28): `"in": { "assembly", "item", "pose", "z" }` puts a problem in
  an item's frame. A region, support or load can sit at one of the assembly's joints (`"joint": "hinge"`, read as an
  anchor is), and an `avoid` region can be a part swept through a joint's range (`{ "sweep": "gate", "through":
  "swing", "steps" }`), each step kept clear; in a flat problem, all of the part within the plate's thickness (its
  sections up the plate, half a cell apart and closer where a face leans, so a part dipping into the plate's top or
  bottom is kept clear too), holes open. Steps by default so no point moves more than half a cell between two. Changing the assembly reruns the
  optimisation. `cad why` names the assembly, the joints read and each sweep's range and steps. Schema first:
  `problem.schema.json` gains `in`, `joint`, `sweep`, `through` and `steps`. Refused by name: a sweep outside avoid,
  of the item itself or through a joint that doesn't move it against the item; a part that never reaches into a flat
  plate's thickness; a joint or item the assembly has not got; more than 360 default steps.

### Printed sizes that moved

- None. Problems without `in` read as before (each result is drawn again once, since this file's code is in the
  drawing's key; no densities key moves).

## 0.7.89: fewer triangles by default
### Changed

- A solid (3D) optimised result's surface is thinned by default to within 0.1 mm of where it was drawn (`outline.reduce`,
  which was off unless given). Every 3D result's mesh has fewer triangles and its volume and grams move a little: on the
  bracket bench's printable result 75,592 triangles become 21,124, the volume 27.808 cm³ becomes 27.806 cm³ (0.007%
  less) and the weight stays 35.04 g of PLA. `"outline": { "reduce": false }` keeps every triangle, as before. Results
  are drawn again from their cached densities; nothing is optimised again.
- cad's share of the densities key (the text of `holdEmpty` and `optimised()`) is pinned by a test, so an edit there,
  a comment included, that would optimise every cached problem again is made on purpose.

### Added

- Printed fittings may be sized from the kit's new second-maker plastics (`pla-prusament`, `petg-polylite`,
  `asa-polylite`); a project's material that has no rule set is refused naming them too.
- A design's expressions read the ends of a rule's range (`pa_cf.strength_z.low`), and `cad why` explains one as the
  rule it comes from.

### Fixed

- `cad why` explains a rule of a set whose name has a hyphen, written as an expression writes it
  (`pla_prusament.strength_z`, `pla_prusament.strength_z.low`, `mx_switch.housing_top`), as `cad values` already read
  it; it stopped with `no variable or rule` before.

### Printed sizes that moved

- An optimised solid's surface moves by no more than 0.1 mm (its outline's corners, as above). Bolt holes and kept
  regions are cut and added exactly afterwards, so they do not move.

## 0.7.83: stalled motors and joints swept together on the frame
### Added

- A rail guide takes `"nut": "printed"` (issue 308): a printed carrier strip `<id>-nuts` in the slot under the rail,
  a hex nut under each hole, its screws fastened into them. An MGN7 on a 2020 now checks clean this way.
- Frame checks (issue 302): moving joints on the frame's beams are swept together as well as one at a time
  (`frame.together`); a motor driving a joint on the frame stalls against a hard stop at each end of the travel, its
  holding torque pushing the stop and its own mount apart; a motor turning a hinge holds its torque at its mount.
  Frames with two moving joints solve more poses (the arm in the tests: 11 to 27), and frames with motors more cases:
  a sag, stress or join figure there can grow where a combined pose or a stall is worse than the poses before. No
  printed size moved.
- The printed-beam options (`beam.printable`, issue 302) take a motor's stall against its stop as `frame.stress` and
  `frame.deflection` do: a frame with a stalled motor no longer offers a printed beam with a margin it does not have.
### Fixed

- `cad list` counted a `nut-carrier`'s nuts twice where a fasten placed them: once with the fasten and once as the
  carrier's own hardware. They are counted once.
- A `nut-carrier` item stands inside its beam's envelope: the overlap check measures only what stands above the face,
  and the screws and nuts in it may overlap that beam.

## 0.7.81: a folding sheet checked in an assembly's poses (#78)
### Tests

- A test that an assembly's pose can fold a sheet from `@rulecad/flexures` (the workspace example `flexures/tray-fit`
  sets `tray.fold`): the fit is checked flat and folded, and a block that clears the flat sheet is caught once the
  walls stand. No code in cad changed: a design whose `main` returns a fold check's findings with its parts has them
  reported by `cad check`, as a lamina mechanism's are.

### Printed sizes that moved

- None.

## 0.7.80: problems tied to designs, and optimisation you can watch again
### Added

- A problem's regions, supports and loads can sit at another design's anchor: `"anchor": "plate.pivot"` in place of
  `at`, where that anchor is as the design is built (x and y of it in a flat problem; a cylinder along the anchor's
  axis unless it names one; an anchor with a `rotate` points along its z turned by it, as an assembly reads it).
  Moving the anchor moves the problem and optimises it again; a value of that design the anchors do not read leaves
  the result as it is. A design built from the problem itself is refused by name, as is an anchor that is not there
  (with the anchors there are). So are problems that reach each other through designs built from them, however long
  the loop (problem a held at a design built from b, and b at one built from a): refused with the chain, where before
  they were read until memory ran out. Schema first: `anchor` on regions, supports, loads and the output.
- `cad preview <project>/problems/<problem>` (or the problem file's path) shows the run: the result is drawn as by
  `cad optimise`, and `.preview/<project>/<problem>-run.html` replays the run step by step with no server (the live
  view's page, its densities, compliance and change for every step read from the file). Every `cad optimise` run is
  recorded and kept by its densities' key, so a cached result still shows the run that made it; one made without
  recording (by a design's build) shows its end and each step's compliance, and says to run it with `--fresh`.
  `--watch` on the preview shows the run live, as on `cad optimise`.
- A flat (2D) problem's regions can be another design's part (`{ "part": "blank.body" }`), as solid problems' could:
  its section halfway up, holes open, so an arm is optimised within the blank it is cut from. A problem with a
  `thickness` is flat whatever its regions are.
- `cad why <project>/<object>.<problem variable>` says what the optimised result is made from: the problem file, its
  title and material, its rule sets and values, the parts and anchors of other designs it reads, where its filter
  came from, and the file its densities are kept in (made, or not yet).

- `"outline": { "reduce": 0.1 }` on a solid problem draws its surface with fewer triangles: within that many mm of
  the surface as drawn, closed, with no more area past the printer's overhang limit and no new tips (topopt's
  `reduce`). `cad optimise` says how many triangles it had and has. Off unless given: no existing result changes.
  On the bracket bench's printable result, 0.1 mm took 75,592 triangles to 21,124 (27.808 to 27.806 cm³).

### Changed

- A problem with no `filter` is never filtered under two of the printer's lines (the thinnest wall it lays solid).
  It was a cell and a half always, and still is wherever that is more: on an X1C's 0.42 mm lines, every cell of
  0.56 mm or more. No existing problem's result moves: the kit's problems all give their filter or use cells of 1 mm
  or more.

## 0.7.79: strength in optimisation
### Added

- A problem takes `strain`, a strain limit (a share: `"pla.strength / pla.modulus / 2"`), in place of `stress`: the
  stress limit is it times the material's modulus. A mechanism given either is optimised as before and then checked:
  `cad optimise` gives its peak stress at its push and the push and output travel that take it to the limit.
- The rule set schema takes `low` and `high` on a rule: the range it is found in.

### Changed

- A project whose material has no rule set is refused with every plastic the workspace and the kit have a set for
  (abs, asa, pa_cf, petg and pla in the kit), where it named only pla and petg. A plastic is a set that gives
  strength, modulus, density and modulus_z. `plastics()` in `lib/fittings.mjs` lists them. A project of ABS, ASA or
  PA-CF has its printed fittings sized from the kit's set.

No printed size moved.

## 0.7.78: frames solved under their joints' loads, sized with joins that fit (#302, #303, #304)

### Added

- The frame checks carry each `"loads"` entry on a joint (a force on a slide, a torque on a hinge) and a belt guide's
  push at its carriage's acceleration into the beam the joint is mounted on, as a force and its moment at that node,
  solved one way and then the other in every pose (#302). `frame.solve` names them (`refs.onJoints`).
- `frame.size` holds every join of a grouped beam to fit the profiles chosen (#303): a blind join's screw must pass
  the other beam's slot opening and its button head sit under the lips; an end-tap's cap head must not fall through
  the far face's slot; a bought fitting must fit both profiles. A group whose next lighter profile breaks a join says
  so as what set it ("set by a join").
- Racking as a sizing limit (#303): with `"frame": { "rack" }` or `"size": { "limits": { "rack": mm } }`, the side
  push each way across, alone, is a case of its own, and the sway at each top node is held to the limit. A way nothing
  holds the frame is said and left out.
- `frame.solve`, `frame.rack`, `frame.buckling` and `frame.frequency` say how a frame moves where nothing holds it
  ("the frame tips over along y", "x1 spins on its own axis", `refs.how`), with the freedoms that show it, where
  they named a freedom at a node (#304).

### Changed

- A moving joint mounted on a beam is swept through its travel: each end and its quarters between
  (`FRAME_CHECK.sweep`, 4), where a slide was solved at its ends and middle and a hinge at its ends (#302). A
  carriage's worst place for the sag at a point off a span's middle lies between the two: on the riding test's
  600 mm beam, 325 mm along where the far end was taken before. Frames with a moving joint now say more poses.
- A frame stood on its lowest ends with nothing saying so (no feet, no `"frame": { "supports" }`) now warns in
  `frame.solve` even where those ends, pinned, hold it (#304); before, only a guess that changed how they are held
  warned. Give a frame feet or supports to clear it.
- `"frame": { "supports": {} }` is refused by name: it names nowhere the frame is held (#304).
- The sizing table's example in the README: the table's legs and short rails are 2020, not 1515 OpenBeam, whose joins
  to the 2040 rails and 2020 legs do not go together.

## 0.7.77: a leg's gait for the streamer (#199)
### Added

- `cad machine <project>/<assembly>` on an assembly with a `gait` and no `task`: a legged machine, an axis for each
  motor's shaft the gait turns, ordered by the CNC shield slot (X, Y, Z) its motor is wired to, each with its `slot`.
- `cad plot <project>/<assembly>` with no drawing, on an assembly with a gait: the gait as a step file for the streamer,
  `exports/<project>/<assembly>-gait.steps.json`, from the pose shown (`--pose` for another) through `--cycles` (3) and
  back, at the gait's period or `--period`, and a picture of each axis through the run in `.preview/`. A motor wired to
  a slot out of the streamer's order fails (`stream.wiring`); more than three axes is a warning (`stream.axes`). The
  bench stand's gait plays at 2.89 s a cycle against its 2 s period: its knee would need 11712 steps/s, past the 5333
  of a 17HS4401 at 200 rpm and 1/8 steps.

## 0.7.75: parts milled, cast or printed in a powder bed
### Added

- Problems take how the part is made: `"mill": "+z"` (milled from that side, no undercuts), `"cast": "+z"` or
  `"cast": { "draw": "z", "parting": 6 }` (a mould drawn off one way, or two halves from a parting plane), with
  `"symmetry": { "mirror": "y", "turns": 4, "axis": "z" }` and `"extrude": "x"` for any process, and
  `"voids": "refused"` for a metal powder bed print. The problem schema has each field.
- `cad optimise` says how a milled or cast part is made and counts its undercuts (none unless an avoid region sits
  behind material), says what is mirrored or extruded, and fails on a problem that refuses voids with each enclosed
  void's volume and centre. `--json` gives `process`, `undercuts`, `symmetry`, `extrude`, `grey` and `voids`.
- `cad optimise` warns when more than a tenth of a milled, cast, symmetric or extruded result is grey (neither empty
  nor solid), and refuses a symmetry that swaps the side the part is made from for its opposite.
- Rule sets `mill-3axis`, `mould-injection` and `dmls` (from @rulecad/rules) to read the processes' limits from.

### Changed

- Every optimised result is made again once, since topopt's solver file changed; a problem without the new fields
  gets the same densities as before. No printed size moved.

## 0.7.70: printed bolts into slot nuts, a slotted snap pot
### Fixed

- **A printed bolt into a slot nut** (issue 305): its length is now any whole millimetre between the nut's thread and
  the slot's floor, as a printed bolt's is everywhere else, and `fasten.length` says "the shortest that fits (a printed
  bolt is printed to any whole millimetre)", not "the shortest sold". A 10 mm plate on a 3030's slot, where no M6 is
  sold from 16.4 to 18.7 mm, takes an M6x17 printed bolt.
- **A torque given for a printed bolt** is worded as a turn by hand, not a tightening: `fasten.seat` says "turned by
  hand to 1 N m, it clamps with about 833.3 N (T = K d F, fixings.nut_factor 0.2 for steel threads: an estimate for a
  printed one)", and `cad order` says "to 1 N m and no further (a printed bolt, turned by hand, not tightened)". A new
  finding, `fasten.torque`, holds that clamp against what the bolt breaks at, about twice over: an M6 printed bolt in
  PLA breaks at 625.2 N, so 1 N m fails and names 0.37 N m as the most (rounded down, so it passes its own check). The seat's values no longer carry a
  tightening torque for a printed bolt.

- **Pins lying on their side** (issue 306): a pin in teardrop holes, as `v.fixings.pinHole` draws one lying on its
  side, is found and checked as a round one is. It already was: `holesIn` leaves a teardrop's roof out of the round
  it fits. A test now holds it (press, slip and snap sockets, along x and along y, blind, and the failures by name),
  and the README says so.

### Added

- The bench project `enclosures` has a `slotted` variant of `snap-pot`, its lid's skirt in 16 fingers (issue 309), and
  the assembly `snap-pot-slotted-closed`.

## 0.7.69: --dry-run never writes

### Fixed

- `--dry-run` never writes. It was a flag every command accepted, and four that did not handle it wrote the file
  anyway: `cad set <project>/<object>` (an object's variables), `cad add fasten --from-fits`, `cad frame --expand` and
  `cad frame --size --write`. Each now runs every check and writes nothing on a dry run, saying what it would write;
  with `--json` it answers `written: false, dryRun: true`. Any other command given `--dry-run` (`cad measured`,
  `cad check`, `cad export` and the rest) refuses it by name and runs nothing, listing the commands that take one.
  `setVariables(ref, changes, { dryRun })` and `fastenFromFitsEdit(ref, found, { dryRun })` in `lib/edit.mjs` take it
  too, and `setVariables` now checks the edit before it writes, so a refused one never touches the file.
- `cad new <project>/<object>` takes `--dry-run` and `--json` as the other edits do. Before, a dry run made the
  object's files anyway, and `--json` printed a line of words. Now a dry run writes nothing and says what it would make;
  `--json` answers `{ command, file, written, dryRun, made, changes, findings }`; an object already there is refused
  as `object.exists` and a bad name as `edit.name`. A project made for a new object is made as `cad new <project>`
  makes one, with its `$schema`. A program can call it as `newObject(ref, { dryRun })` from `lib/edit.mjs`.

## 0.7.68: the actuator printed in place (#162)

### Added

- `"printInPlace": true` on an object (#162): its parts print together in the pose they are drawn in and move apart
  once freed. `cad check` (and the check before `cad release`) adds `inplace.bed` (each part has a face of its own on
  the bed), `inplace.gap` (every two parts stand the printer's `print_gap` apart, measured by Manifold through
  @rulecad/shapes' new `ops.gap`) and `inplace.support` (a bridge wider than the printer's `bridge`, an underside in
  mid-air or printed onto another part, a ledge or an island fails, since no support can come out from between the
  parts). This is the bridge-span finding #133 asked for. `inplace.first-layer` holds every two parts on the bed
  to `print_gap` and twice the printer's `foot` half a layer up, where the first layer spreads (printcheck's first-layer
  check looks inside one part at a time, so it never saw two parts printed in place side by side).
- `"printInPlace": [items]` on an assembly: the items printed together as one object printed in place. The assembly
  order never takes them apart from each other (before, a planet enclosed by the rings it was printed inside was
  `assembly.order`'s "can't be reached in any order"). A name that isn't an item is refused by name. `cad order`
  gives them as one step ("printed together in place (one print)") and `cad list` as one printed row, their grams and
  print minutes added, where each was a step and a print of its own.
- A motor item's `"screw"` may name a whole screw, thread, length and head (`"M3x8 hex"`): `cad list` buys that screw
  and `cad order` names the tool its head takes (a 5.5 mm socket or spanner on an M3 hexagon head, ISO 4017), where
  every motor's screws were cap screws turned with a hex key.
- A `"shaft": "slide"` fit holds the bore to a slide fit as printed (`shaft.slide`): the drawn gap less half the
  printer's `hole_comp` must clear the shaft. A slide fit is never pressed on, so it has no hoop check. The shaft fits
  now read `hole_comp` from the assembly's printer rules (0.1 mm on the X1C, as before).

### Fixed

- A compound planetary whose planets mesh the output ring only a tooth of their first step on (sun 18, planets 21/18,
  rings 60 and 57) failed `planetary.phase` for every planet but the first, and drew them into the output ring. Each
  planet now takes the first tooth of its first step that meshes the output ring as well as the sun and the held ring.
  Chapter 11's planets take the tooth they always did.
- The assembly order ran out of stack on a part of a few hundred thousand faces (the middle of its box was found by
  spreading every corner into `Math.min`).

### The print-in-place actuator (examples/bench/projects/benchmarks)

- `shoulder-pip`, the bench shoulder printed in one piece on a 17HS4401 (44.3:1), its parts drawn by
  `shoulder-pip-parts.js` from the numbers in `pip`, and `shoulder-pip-drive`, the assembly that turns it, beside
  `shoulder-test`, the assembled 38:1. New objects only: no printed size of an existing part moved.

## 0.7.67: the leg on the parts its builder has

### Changed

- The worked leg (`examples/bench/projects/leg`, EXAMPLES chapter 14) runs on the parts on the bench, as the arm does:
  a 17HS4401 at the knee in place of the NEMA 14, the 12 V bench supply with its current limit at 1.5 A in place of
  the Mean Well LRS-50-24, and `"have": true` on the motors, the DRV8825s, the CNC Shield V3 and the supply. The
  quadruped's and the crawl's knees are 17HS4401s too, at 1 A as their hips.
- The stand's gait is loaded with what rides its rods, `leg.stand_load`, the larger of the robot's share and
  `leg.riding` (1.01 kg from `cad list`: the leg, its carriage, the bushings and the screws), not the share alone. The
  stand's margins: knee 3.1 to 2.8 times, hip 11.4 to 8.5 times, at 0.5 A. `leg.robot_mass` is 4.2 kg (was 3.8):
  the trot's worst knee goes from 1.7 times (a warning) to 2.3 times, the crawl's from 1.9 to 2.6.

### Printed sizes

- The thigh (`leg/thigh`): the knee motor's four M3 holes move from the NEMA 14's 26 mm square to the 17HS4401's
  31 mm square, so the 17HS4401 bolts on. Reprint a thigh printed for a NEMA 14.

## 0.7.66: the Uno streamer keeps time (#181)

### Added

- An assembly's `task` takes `blockTime`, seconds: `cad plot` plans no move shorter (robots' `minBlockTime`), for a
  streamer that takes one line a block over serial. `cad machine` writes it into the machine's `task`. No printed size
  moved.

## 0.7.65: the arm on the parts its builder has

### Changed

- A stepper's torque at speed (`motor.torque`, `motor.mount`, `fasten.load`, `motor.accel`, `task.time`, a gait's
  torque, the motor's curve in the preview) is worked out at the volts of the assembly's bought supply, where it has
  one; before, always at `@rulecad/motors`' default 24 V. On 12 V a 17HS4401 at 300 rpm gives 0.269 N m at full
  current, not 0.283. A stepper with no `speed` works at its corner speed at that supply (286 rpm on 12 V, not 571).
  `motor.torque` says it: `..., at 300 rpm on its supply's 12 V`, and its values carry `supply` and `rpm`. An
  assembly with no supply checks as before.
- A motor named by its variant (`17HS4401`) is listed by it: `nema17 (17HS4401)` on `cad list`, the kit and the
  `bought.item` line.

### Added

- `"have": true` on a motor or bought item: in hand, so `cad list` lists it under `Bought, in hand` apart from what is
  to buy (`have: true` on its line in `--json`, and out of the bought cost), the kit's `buy.csv` gives it the kind `in
  hand`, and the kit's build page a table of its own. On a printed or beam item it is refused, by name.

### The bench arm (examples/bench/projects/arm and EXAMPLES chapters 12 and 13)

- The elbow's motor is a 17HS4401, the shoulder's, on the same `v.motors` mount: printed sizes moved in `upper`, the
  elbow motor's four M3 holes and their counterbores from the NEMA 14's 26 mm square to the 17HS4401's 31 mm square,
  so the motor the builder has bolts on (the part weighs 126.1 g, as before). The supply is a 12 V bench supply with
  its limit at 1.5 A; the drivers stay at 0.5 A and 1/8 step, the upright arm's shoulder at 0.8 A. Rules moved:
  `arm.shoulder_torque` 0.2 to 0.22 N m, `lift.upper_mass` 0.376 to 0.466 kg.

## 0.7.64: no import loops (#278)

### Fixed

- `wiresFor`, `wireTubesOf` and `wireRoutesOf` moved from `lib/assembly.mjs` to `lib/wires.mjs`, so `lib/list.mjs` no
  longer imports `lib/assembly.mjs` back (a loop of imports, issue #278). `lib/assembly.mjs` re-exports all three
  under the same names. No printed size moved.

## 0.7.62: commands that write projects and assemblies, and belt guides (Frames 4)

### Added

- Commands that write a workspace's projects and assemblies, so neither file need be written by hand: `cad new
  <project>` (its `project.json`), `cad set <project> field=value` (title, description, material, printer,
  `filaments.<name>.slot`), `cad new <project>/<assembly> --assembly` (empty, or a generated frame with `--frame box
  --inside 300,300,350 --profile … --join … --feet …`, and any field as `field=value`), `cad set <project>/<assembly>
  <address>=<value>` (an entry's field by its id or its place, `x1.at`, `joins.3.kind`, or the assembly's own,
  `frame.join.fitting`), `cad move <project>/<assembly> <id> --at | --to [--rotate]` and `cad remove
  <project>/<assembly> <id | list.n | id.field> [--with-refs]`. `cad add` also takes `guide`, `load` and `wire`, and any
  field as `field=value`. Each keeps the file's layout, checks the edit against the schema and what it could break (a
  generated frame must still expand, the names an entry gives must be there, and every other entry's names that were
  there before must still be: a beam renamed or removed, a frame changed or removed, a joint's parent and child, a
  pose's joints, a wire's ends and route, a loop's anchors, a load's joint, a mount's beam) before it writes, refuses a bad one by name with nothing written (`project.exists`,
  `assembly.exists`, `project.printer`, `project.material`, `edit.kind`, `frame.refused`, `edit.address`,
  `edit.ambiguous`, `edit.generated`, `edit.referenced`, `edit.dangling`, `edit.renumber`, `edit.move`), takes
  `--dry-run`, and with `--json` says what changed and the checks. `cad remove` of a beam a join uses is refused,
  naming the join; so is `cad remove frame` where a join uses the frame's beams, and the removal of any guide before
  one with no id of its own, which is named by place. `cad new <project>/<assembly> --assembly --material PETG
  --printer x1c` makes the project with them where it is not there, passes them where the project already has them, and
  refuses by name one that differs. The change paths in `--json` are from the workspace (`projects/<p>/project.json`,
  `projects/<p>/assemblies/<a>.json`). A name the build makes (a repeated item's copy, a mount, a guide's part) counts
  as there only by the exact pattern its maker uses, so `rail-3` is refused where `rail` makes no copies.
- `schemas/project.schema.json`: the project file's fields.
- Belt guides (`"kind": "belt"`, FR4.2): a GT2 belt drives a rail guide's one carriage from a motor under a printed
  plate past the beam's end a, round a toothed idler on a printed block past the rail's end (the tensioner: it slides
  along the beam's slot), its ends in a printed clamp on the carriage. The motor reads the belt's ratio (40 mm a turn
  for a 20 tooth GT2 pulley) and is held to the push of the carriage at its acceleration; the belt goes on `cad list`
  by the metre; `belt.length`, `belt.tension`, `belt.rub` (swept through the travel), `belt.line`, `belt.tensioner`
  and `belt.stretch` (a term of the error budget). The schema has the guide's keys and the fittings `belt-plate`,
  `belt-clamp` and `belt-idler`. The example is `examples/bench` `axes/x-belt`, written by the edit commands.
  A belt's push adds to the weight on an upright or sloping axis (in `motor.torque`, `belt.tension` and the stretch),
  the clamp's screws go a layer past steel's least engagement, `belt.rub` holds what the carriage carries, and the
  guide's `height` raises the belt over it.

### Changed

- `motor.axis` passes a motor driving a belt with its shaft square to the slide (a belt's pulley), as well as one on
  the slide's axis as before. `motor.holds` leaves out a belt's push at its acceleration, which is not there at rest.
- A rail's carriage carries its tapped holes as its mount: a `fasten` into a carriage ends in its own thread, held to
  the depth HIWIN gives (`carriage_thread_depth`), as a motor's or a supply's mounting holes are.
- A belt guide is no longer refused as "not built yet"; a screw on a rail is refused saying a rail is driven by a belt.
- `cad add join`, `cad add fasten` and `cad add fit` accept a generated frame's beams (they were refused as not in the
  assembly), and `cad add item` and `cad add load` refuse an address on an item the assembly does not have.
- `cad add` prints the place it added at (`added a join to … (joins.3)`), and its `--json` is `{ command, file,
  written, changes, findings, added }`; the `file` is relative to the workspace.
- No printed size or figure moves.

## 0.7.61: a board rebuilt when its finish changes

### Fixed

- A board's cached build now misses when @rulecad/smooth changes, not only @rulecad/pcb: its build runs smooth's
  smoothing and finish, so a change there could leave a board built by the old code (the engine id hashes both).

### Printed sizes that moved

None. Boards build again once (their cache key changed); what they build is the same unless @rulecad/smooth changed.

## 0.7.60: pins, magnets and printed bolts in assemblies, and the holds coupon (Fixings 4)

### Added

- An assembly fit's `fastener` may name pins, `{ "pin": "snap pin 4x6", "count": 2, "fit", "load", "pull" }`, or
  magnets, `{ "magnet": "disc magnet 8x3", "count": 2, "fit", "load", "gap" }` (the schema's `$defs.pins` and
  `$defs.magnets`). `cad check` finds their holes or pockets (`fit.pin`, `fit.magnet`), checks each against the size
  `@rulecad/fixings` draws it from the printer's rules, refuses by name a pin too long or too short for its part, a
  pocket too shallow or with too thin a floor, or fewer holes than the count, and holds their load. `cad list` lists
  pins (printed, cut or bought) and magnets (bought) with their grams; `cad order` names them on their step. The
  free-text form (`"fastener": "push pin"`) works as before.
- A fasten's `screw` may name a printed bolt, `"M8x20 hex printed"`: it is refused below the printer's smallest
  thread, checked against its load with `printedBoltModel` (no wrench torque is given), and listed as a printed part.
  Into a thread printed in the part it takes half the printer's `thread_gap`; into a nut, a heat-set insert or a
  tapped hole, a standard thread, it takes the whole gap (an M8 in PLA breaks at about 1195 N there, not 1272.7 N).
  Into a pilot it is refused by name: a plastic thread forms no thread in plastic. Its findings say it is printed:
  the length is the shortest that fits (not the shortest sold), the seat says what it takes with no tightening
  torque, and the key is a socket turned by hand.
- `cad measured` knows the holds coupon's figures with no `--rule`: `x1c.snap_clearance`, `snap_barb`, `pin_press`,
  `pin_slip`, `magnet_press`, `magnet_glue` and `magnet_crush`, each with its prediction read through the model that
  draws from it and refused outside what a fit of its kind can be; and a plastic's `strength_z` from the pull bolt,
  refused above its strength along the layers. `pin_slip` and `magnet_crush` may be 0 (both are past `hole_comp`, so 0
  is a close fit); `snap_clearance` and `snap_barb` must be above 0, and the coupon's snap sockets stay a step above 0.
- The bench's `holds-coupon` (examples/bench/projects/benchmarks), printed with the fixings coupon on one plate
  (`fixings-test`), and MEASURE.md rows 40 to 47.

### Printed sizes that moved

None. The frames door's magnet pocket is drawn 10.2 mm as before; only its line on the shopping list reads
`disc magnet 10x3 N35`.

### What a workspace should change

Nothing is required. An assembly that names pins or magnets in a fit's note can name them in `fastener` instead, so
they are found, checked and counted.

## 0.7.59: routes kept between builds, assemblies shown as built

### Added

- `"show": "built"` on an assembly draws its references (bought parts, boards, a module) solid in `cad preview`
  and on the model page, as the thing built; they still aren't printed or downloaded.
- The autorouter's results are kept in the workspace's `.cache/routes`, by their exact input (@rulecad/pcb's route
  cache): a board rebuilt for anything but its routing (a change to the library, its finish or its checks) reuses its
  route instead of searching again. `CAD_NO_CACHE` turns it off with the rest of the cache.

### Printed sizes that moved

None.

## 0.7.58: frame checks (Frames 3)

### Added

- **The kit counts as cad check does**: its README's pass count is cad check's, the files' schema check included (it
  was one short), from one list both commands make. It says where each upright stands (a table of the corners, seen
  from above, with each upright's mark), so the build is followed without `--pictures`. Laying out its plates copies
  the printer's rule set into a fresh workspace's `rules/`, as any command that uses a tool's set does: the kit now
  says which sets it copied (`copied` in `--json`).
- **Sheets in work order**: a beam's sheet numbers its operations in the order they are done (the ends cut, the holes
  from end a, the taps), and a jig's label follows (`A4` where it was `A3`); marks, the cut list and the beam's own `ops` keep their order along the beam, from end a.
- **Printed beams said as printed**: a bay's squareness (`frame.square`) says "beams printed to ±0.5 mm" for printed
  beams (the saw's tolerance taken for a printed length, an estimate), not "cut".
- **A gusset's face**: a printed gusset join takes `"face"`, the face of b it lies on (one of the two square to a);
  the other one than its beams' directions give turns the L over. A generated frame names the face looking out of
  the frame, so its printed gussets no longer land where a corner's third beam butts (a box joined by printed
  gussets checked with 8 overlaps and an unreachable plate; it now checks clean). `face` on any other join, or a face
  not square to a, is refused by name.

- **A draft said by name**: `cad rules check` warns `rules.draft` while a set made by `cad rules draft` still has
  figures not read from a sheet (a rule or source starting `DRAFT`), naming each, so a half-filled profile, slot or
  slot nut is never taken for a finished one. No printed size moves.
- **The frames guide** (`docs/guides/building-frames.md`, on the docs site): a profile from its spec sheet to a
  checked box, built square; the machines guide gains a machine on a frame; AGENTS.md says a frame is beams and
  joins, profiles come from rule sets and estimates about joins are reported as estimates.
- **A task on a slide** (with @rulecad/robots): a carriage's `task.reach` margin is how far it stands from the ends of
  its travel (it said -159.59 mm to spare on a rail it reached end to end).

- **Printed beams' ends in a frame**: a printed beam in its place is drawn with its ends' inserts or captive nuts
  (and collides by them), so a screw into its end is followed into its fixing; a beam printed standing from a metal's
  profile takes its end's screw in its bore's place; a foot item takes `"thread"` for such an end; a screw of another
  thread into a printed end fails `fasten.end` and names the thread. EXAMPLES chapter 17, a Raspberry Pi 4 case with
  every beam printed, checked in aluminium and printed, its kit.

- **A kit**: `cad kit <project>/<assembly>` writes `exports/<project>/<assembly>-kit/`, one folder to build it from
  without the model: `README.md` (what the checks say, what to buy, what to print, the jigs, the cut list, the drilling
  and tapping, the build step by step with its torques and diagonals), `buy.csv`, each plate's 3MF and the jigs', each
  mark's sheet, and with `--pictures` the whole and each step. Refused by name for an assembly whose check fails
  (`kit.check`) or that has nothing to build from (`kit.empty`).
- `cad plates` groups by material as well as filament: a printed beam in its own `"material"` gets a plate of its
  own (`<assembly>-petg-base-1`; `packed.material` in the plate's file, schema first). A frame's jigs are written
  beside the plates, in the project's plastic (`--no-jigs` leaves them); the jigs now take the project's plastic
  (PLA unchanged). A levelling foot's pad is printed beside its body and listed by `cad list`.
- A `nut-carrier` fitting item: `@rulecad/frames`' printed carrier for a hex nut or an insert in a slot (`face`,
  `thread`, `holds`, `load`), its nut or insert on the list. `examples/bench` has `fittings/kit-2020`, a kit of
  fittings alone for 2020.
- A link of a frame labels each beam by its mark (`mark A: profile-2020-misumi-hfs5 x 300 mm`, so the parts list
  groups them) and carries each mark's cut-and-drill sheet as a view (`Beams: A`); the viewer offers a picked beam's.

### Changed

- **An optimisation's saved densities are kept by everything that makes them:** the problem, topopt's solver, the
  FE and its threads backend, and cad's own code that readies the problem and calls the solver with its settings. A
  change to any of them optimises again. Each problem already saved is optimised once more the first time it is run.
- **A generated portal says how it is held**: a portal lies in one plane, and on its two feet (each holding a leg's end
  from moving, not from turning) it tips over out of that plane: every generated portal failed `frame.buckling`
  (factor 0) or warned `frame.solve`, whatever its join or profile. `"frame": { "kind": "portal" }` is now refused by
  name until `"supports"` says how its feet are held, as `{ "z1.a": "fixed", "z2.a": "fixed" }` for a portal bolted
  to a bench or a wall. So held, it checks clean in 2020 joined blind and in 3030 and 4040 by printed gussets. No
  printed size moves.
- **Guessed supports said**: where a frame has no feet and no `"frame": { "supports" }`, and its lowest ends pinned
  would leave it free, the guess stands its posts fixed on their end faces (and lays a lying beam on its face). That
  hid the frame's freedom: a 2020 portal with no supports passed `frame.rack` along y at 0.411 mm though it is free
  that way, and racked along x at 0.259 mm where pinned feet give 1.669 mm and a warning. `frame.solve` now warns
  that the supports are guessed, names what pinned feet would leave free (`refs.free`) and the ends held
  (`refs.guessed`), and asks for feet or `frame.supports`; `frame.rack`, `frame.buckling` and `frame.frequency` say
  they rest on the guess.
- **A generated frame's printed feet are screwed on**: each printed foot, levelling foot or stacking foot's upright
  is tapped at its end as the foot says (M5, 18.5 mm deep in 2020) and a `fasten` holds the foot (an M5x16 cap screw
  on the list). Where the join drills the uprights (blind, end-tap, hidden, anchor), the bottom ring rises by the
  tap's depth so its access holes clear the tap: a box round 300 x 300 x 350 in 2020 on feet now has uprights of
  408.5 mm, not 390, and its bottom joins at 28.5 mm. Before, the feet had no screw and the tap was missing from the
  sheets. `cad frame --expand` writes the tap and the fasten.
- **A joint support's `"cell"` is its clips' alone**: it sets the FE cell of the printed clips under that joint, and
  no longer the cell of the link bent beyond it (`link.deflection`). That link takes the new `"linkCell"` on the
  same support; without it the link keeps its own cell, a third of its thinnest side, 1 to 4 mm. A workspace that
  set `"cell"` to refine `link.deflection` now gets the default link cell, and its drop at the tool can move: put
  the same figure in `"linkCell"` to keep it. The finding now names `"linkCell"`. A 170 mm link under 0.5 mm clips
  was meshed at 0.5 mm (130 560 cells, about 3 GB and over ten minutes); it is now meshed at 2.67 mm. No printed
  size moves.

### Fixed

- A frame in one plane on pinned feet (two posts and a rail, a generated portal) and a beam pinned at both ends were
  left unsolved as mechanisms, their sag falling back to estimates. The part nothing holds (the plane's sway, the
  beam's spin) is held for the figures while the loads do not move it, `frame.solve` names it (`refs.held`) and
  `frame.rack` warns that a push across finds the frame free. With @rulecad/fea's `loose: 'hold'`. The hold carries
  only the sag and the stresses: the modes and buckling count that freedom free. A portal on pinned feet with its
  posts squeezed tips over, so `frame.buckling` fails it at a factor of 0 (it passed at 2.5 times its load, read off
  the hold), and `frame.frequency` gives its lowest mode as 0 Hz and warns (it said 1.8 Hz).
- A panel across the top of a corner-post box (its rails joined to the posts, not to each other) was no shear web and
  its weight was dropped as "not on a beam". It is a web on its bay now; a panel whose beams make no bay is weighed
  along them (`refs.laid`).
- A gantry beam put all its weight on the side beam its joint is on; it is shared between the two it lies on by the
  lever rule (`refs.riding[].on`). What rides or is loaded on a beam left out of the frame is named as not weighed
  (`refs.off`), where it vanished.
- `frame.size`: the step search stalled where two groups tied for the worst figure; a group at its lightest profile
  took its margin without the sag at its own nodes; with nothing fitting, the nearest design was ranked by a partial
  check. Each is fixed in @rulecad/fea's sizing.
- A sag under 0.1 mm is given to three figures (0.0521 mm, not 0.052; 0.00123, not 0.001), in the task's error budget too.
- The schema said `frame.limit` held the sag at a named point; it holds every `frame.deflection` finding, as the code
  did. The Euler check's rule (`frame.euler`) says it rests on ends held from moving sideways, and that a sway frame's
  posts are the whole frame's buckling factor's to judge.
- A slot nut in a printed slot with sloped lips warned on every screw (`fasten.end`): the nut's fit note, which
  @rulecad/frames gives at info level, was raised to a warning. It is said in the text.
- A slot nut's thread was counted from under the lips where the nut seats lower, under lips that slope underneath
  (the printable slots, `slot_nut.seat`): an M4 drop-in nut in the printable 2020's slot seats 3.95 mm down, not 2, so
  its thread runs from 3.15 mm. `fasten.length` and `fasten.engagement` now count from the seat: an M4x10 through a
  4.4 mm plate engaged 2.45 mm and passed as 4.1. A screw into such a slot may now need the next length.
- A printed gusset or splice plate between beams of two profiles (MISUMI's 2020 and the printable 2020) is drawn for
  both: each arm's tongue and nuts are its own beam's slot's, and it is thickened until a length sold fits both (its
  name gains `-to-<profile>`). Printed size: chapter 17's T gusset, 4.4 to 4.6 mm thick, with M4x12 into the
  printable slot; its splice plate, 4 to 4.6 mm.
- `frame.deflection` gave a stiff frame's sag as 0 mm: under 0.001 mm it is given to three figures.
- `fasten.seat` read a counterbore's floor in a part with a drawn thread (a levelling foot's body) as a cone and
  failed it: such a part is measured at even steps, and now also at every face square to the screw's axis.

- **The lightest profiles**: `"frame": { "size": { "profiles", "groups", "limits", "by" } }` gives each group of beams
  that must match (named, or found: one profile, one direction, one length) the lightest profile from the list that
  meets the frame's own limits (each sag as `frame.deflection` holds it, stress with the joins' springs and rigid,
  the frame's buckling and each grouped beam's Euler load with `frame.margin`, and the lowest mode against the task's
  moves), in every pose, by `@rulecad/fea/frame`'s `sizing`. `frame.size` names, for each group, the limit its next
  lighter profile breaks and the margin as chosen. `cad frame <project>/<assembly> --size` prints the table and
  `--write` writes the profiles in (a quarter roll for a 2040 on edge, its end fittings, ends moved to the faces they
  meet, a join a bore at a two-bore end, a generated frame written out expanded with its rings' outer faces kept,
  a drawn beam that would stand past the end of the beam it meets moved along it, and nothing written where a join
  would land off its beam).
  `FRAME_SIZING` (`profiles`, `match`).
- `"frame": { "kind", "inside" | "outside", "profile", "join", "feet", "caps", "braces", "panels", "shelves" }`:
  a box, portal, table, gantry or shelf generated from a size, expanded into beams, joins and their ends before
  anything is built; `frame.generated` says what it made. `cad frame <project>/<assembly>` prints it and `--expand`
  writes it into the assembly to edit by hand. An assembly with a generated frame needs no `items`.
- The assembly order takes a fitting without the tongue or pegs it stands in a slot or a beam's end with, as the
  overlap check does (two end caps on one beam no longer lock it in), and a part placed on another goes on after it
  whatever its fastening's distance from the base says. A fitting at a beam's end is held by that beam
  (`assembly.loose` no longer names a gantry's end caps and feet).
- **Which beams can be printed**: `"frame": { "printed": "petg" }` (or `{ material, walls, infill, pose }`) tries each
  beam of the frame printed in that plastic (the kit's printable profile of its size, lying down, spliced past the
  bed, or standing up), solves the frame again and holds the beam to the frame's sags, its stress and Euler's load
  with twice the margin, the creep limit, its sag as it creeps and the task's moves: `beam.printable` per beam with
  its least margin, or the margin it misses by, and the joins that would need changing; then those that hold are
  printed together and solved once more, one finding listing them. A printed beam's frame stress is now held to its
  plastic's strength for its pose (across the layers standing up), and `beam.creep` checks it. A sag the frame as
  drawn already misses is held to the drawn frame's own figure and 2% more, not to the limit, so a beam far from it is
  not reported as needing metal for it.
- **The beam coupon**: a printed beam on two `frame.supports` with a mass on it predicts its sag and the mass it breaks
  at (`beam.coupon`); `cad measured <ref> k1.sag=<mm>` and `k1.break=<kg>` write `beam_modulus` / `beam_strength`
  (`_z` standing up) into the workspace's copy of the plastic's set as measured. The workspace's material sets (a
  set with a density and no part) are now read by the frames a design builds. `"resting"` in `frame.supports`: held
  from moving and from twisting about the beam's length. The bench has the coupon: `benchmarks/beam-test`,
  MEASURE.md rows 38 and 39.

- **Printed beams**: `"printed": true` (or `{ pose, walls, infill, end, pull }`) on a beam item makes it a printed
  part: drawn solid, weighed on `cad list` by the plastic its walls and infill lay (a part's `fill`), laid on a plate as
  it prints (`"laid": true`, which `cad plates` writes), off the cut list and the beam sheets. Its findings say how it
  prints. It was refused by name before.
- **The frame solved** (`@rulecad/fea/frame`): an assembly with joins is solved as beam elements, each join a rigid
  link and its spring, held at its feet or where `"frame": { "supports" }` says. `frame.deflection` gives the sag at
  each load, each `"frame": { "points" }` and every guide, with the joins' springs and rigid, and says which it rests
  on; `frame.stress` each beam against its alloy and each printed fitting's join against its strength;
  `frame.buckling` each beam in compression against Euler's load and the frame's first factor; `frame.solve` what
  the model holds. A mass on a slide along a beam is solved at each end of its travel, and a beam riding a moving
  joint weighs on the frame as a load. `refs.restsOn` is `estimate` whenever any join's spring is one. `cad beams` writes the
  deflected shape as a check view, `<assembly>.frame-sag.svg`.
- **Racking and frequency** (#267): `frame.rack` racks the frame each way with a side push at its top, gives its
  stiffness, and solves gussets, one brace and a panel in each open bay with each one's gain, advising the cheapest
  that reaches the limit. A panel on a bay is a shear web in the model (its clips' grip an estimate). `frame.frequency`
  gives the lowest modes with every carried mass, in the worst pose, against steppers' full-step rates and the task's
  moves. `cad beams` writes the lowest mode animated, `<assembly>.frame-mode.svg`.
- **Squareness and the frame in the error budget** (#268): `frame.square` stacks each bay's cut tolerances and its
  joins' play (`JOIN_PLAY`, estimates) across its diagonals, worst case and root-sum-square, lists each term, and is a
  prediction `cad measured` takes as `frame.square.<beams>=<mm>`, the difference measured; once measured, it passes
  within what the parts allow and warns that the bay leans past it. `"frame": { "cut": { "tolerance" } }` is the
  workshop's own cut tolerance, taken by `frame.square` and the cut list. A task on a guide counts the beam's sag
  (the frame's solved figure where the frame is solved), its straightness and its twist as named `task.accuracy`
  terms. `frame.heat` gives the frame's growth from built to running air and holds each printed fitting to its
  plastic's softening point, at the air's temperature or a heater's within its reach.
- **Schema:** `"frame": { "supports", "limit", "points", "rack": { "load", "limit" }, "cut": { "tolerance" }, "heat":
  { "air", "built", "heaters" } }` on an assembly.

### Changed

- Every assembly with joins now has these findings; a frame that fails `frame.deflection` or `frame.stress` makes
  `cad check` fail where it passed before. No printed size moves.
- `frame.square`'s difference to accept now counts only the beams whose cut lengths set the opening, and adds the
  joins' play: the 260 × 200 mm bay of a 2020 box with blind joins goes from 0.79 to 1.04 mm, its 220 × 260 mm bays
  from 0.76 to 0.95 mm (before, the longer side counted whichever beams set it). The build page's bays carry `rss`
  and `terms` too.
- A slide on a beam is solved at the middle of its travel too, so `frame.solve` counts one pose more for each slide not
  drawn there, and a carriage between two supports is solved where it bends its beam most.
- On a sliding joint, `task.accuracy` names its biggest term in mm alone, no longer with a degree sign.
- `frame.deflection` names a load hung on an item by that item and its point (`g1-carriage-1 at (0, 0, 13)`), where it
  said `[object Object]`.

### Fixed

- Two joins at one beam end's two bores (a 2040's `a.1` and `a.2`) now tap both: the second tap was taken for the
  first, and its screw met an untapped 4.2 mm bore (`fasten`: no hole for M5).


## 0.7.57: frames in assemblies (Frames 2)

### Added

- **Joins** (`"joins"`, `cad add join`): beam to beam by kind. A blind or end-tap join taps one beam's end, drills
  the access hole across the other and adds its screw to the fasten checks and `cad list`; a bracket, gusset, splice,
  cube, anchor or hinge join takes a printed fitting (`"fitting": "printed"`) or a bought one by its rule set's name.
  `join.geometry` fails a beam that stands off or runs into the face, with the gap; `join.stiffness` is an estimate
  until the joint rig measures it, and says so.
- **Screws into a slot:** a fasten `"into": "x1.top"` (or `x1.top.2`, `x1.top@120`) uses the slot nut `nutFor`
  picks, and `fasten.slot` holds the holes to the slot's centre line; a distance places the screws as a group.
  `frame.nut` fails slide-in nuts in a slot that joins close at both ends and names the nut that drops in;
  `frame.preload` lists nuts to load before a join closes their way.
- **Fittings:** printed brackets, gussets and splice plates; panels cut to their bay with clips; doors on printed
  hinges, swept, a latched door failing its sweep; end caps, feet and castors; mounts for boards and supplies read
  from their own rule sets, fans, drag chains, DIN rail, cable clips and runs along a slot; bought fittings with their
  price on `cad list`.
- **Guides:** linear rails with their screws and slot nuts at the rail's pitch, each carriage on a sliding joint and
  held to its ratings (`joint.moment`); V-wheel carriages seated from the profile's rules, the eccentrics' range
  checked; rods with their holders, a lead screw with its motor plate, coupler and endstop, placed by addresses.
- **Jigs** (`cad beams --jigs`): drill and tap guides, cut-length stops and squaring corners of both hands, from the
  assembly, laid out as one plate.
- **A frame's build** (`cad order`, the build page): from bars to a square frame in numbered steps, every screw head
  and slot nut given a way into its slot, joins left snug until squared; an order that would trap a nut is refused
  with the slot and the join. `frame.square` per bay.
- **`motor.heat`** reads the driver current the motor item sets; its case temperature is an estimate and says so.
- **`cad measured`** takes the joint rig's readings, a join's measured stiffness and a slot nut's hold along its
  slot, and checks every value before it writes any.
- EXAMPLES.md chapter 16, a frame with a moving axis.

### Changed

- A part fastened by a fit only to a part a joint moves, but placed where it stands, is said by name
  (`assembly.fastened`).
- A beam placed by its ends counts as held in the loose-part check.
- Printed fittings in a project of a plastic the kit has no set for are refused by name, where they were sized as PLA.

### Printed sizes that moved

None in the examples and templates that existed before. CI's dimension table compares every one.

## 0.7.56: screws through fixings, end to end (Fixings 3)

### What reads fixings now

- **Designs:** `v.fixings` (from `@rulecad/fixings`, bound to the project's printer, its material and the workspace's
  own thread sets) is how the worked examples, the tutorial, the starter project and the machine templates draw every
  screw hole, seat and nut pocket. None of them types a screw size any more.
- **Motors:** `motor.mount` checks a motor's screws as bought, through fixings: their engagement in the motor's tapped
  holes must be at least one diameter (`engagement.steel`), and a counterbored plate is read as one. `cad order`
  counts a motor's screws with the key that turns them, and `cad list` names their head.
- **Boards:** `v.pcb.mount('M2', x, y)` reads the workspace's thread sets before the kit's, and a build that uses it
  is cached by them, as a `v.fixings` build is. A `fasten` through a board's holes (`"holes": "pcb.board"`) holds them
  to the thread's clearance hole as the fab drills it, with nothing added for a printer.
- **Assemblies:** `fasten` is the one way to say a screwed joint. A fit with `"fastens": true` is for what holds parts
  without screws (pins, a press, a clip), with one exception for now: a NEMA motor's mounting screws stay on its
  `"fastens": true` fit, which counts them in `cad list`, because `fasten` and `motor.mount` still choose different
  lengths for the same screw.

### Added

- `fasten.suggest`: where a holes fit and a fit that fastens join the same two items, `cad check` notes the fasten that
  would stand for both, with the entry to paste. The screw is read from the fit's `fastener`, else from a thread set
  the holes fit's `depth` names, else from the board's holes as drawn.
- `cad add fasten <project>/<assembly> --from-fits` writes that fasten in their place: the holes fit goes, and the fit
  that fastens keeps only its gap range. The file's own layout is kept.
- A screw across a yoke or a split clamp: name the part under the head first in `through` and again as `into`, and
  place each screw with an anchor (`at`). Along the screw, the part's first stretch of material is the head's side
  and the rest is the far side.
- `cad rules check` gives notes, which never fail: each alias a set lists in `"interface"`, and, for a workspace's own
  copy of a kit set, what the kit's set has that the copy lacks. `--json` carries them as `notes`.
- The assembly schema takes a holes fit and a fasten's `holes`; editors get fasten snippets.

### Fixed

- A fasten's nut, washer and insert are the size of their own thread. Before, every nut in an assembly took the
  first one's size: a bench with M5 nuts on two bolts and an M4 nut on a third listed 3 M5 nuts and drew the M4 nut
  as an M5.
- Thread engagement is compared rounded to the micron, so "engages 4 mm where 4 mm is asked" passes.

### Printed sizes that moved: the worked examples (EXAMPLES.md) and the tutorial

The tutorial and chapters 1 to 11 and 15 move nothing: each hole that now comes from `v.fixings` comes out at the
size it was typed at (an M3 clearance hole 3.5 mm, an M3 pilot 2.9 mm, an M4 clearance hole 4.6 mm), and each part's
volume and outline are unchanged. Chapter 6 gains a part: a printed case for the four-key pad, with a heat-set
insert's boss under each of the board's M2 holes, and the board screwed into it with a fasten (new, so nothing in it
moved). Chapters 12 to 14 are the repository's bench arm and leg written out in full, and
move what the bench moved (volumes in mm3):

| Chapter | Part | What moved | Volume | Reason |
|---|---|---|---|---|
| 12 | arm/base | M5 bolt holes 5.5 to 5.6 mm; home switch M2 pilots 1.8 to 2.1 mm | 76200.62 to 76161.41 | The printer's hole compensation (0.1 mm) is now added to the M5 clearance hole, as to every other. The 1.8 mm pilot was the M2 clearance less 0.6 mm, which is no thread's figure; it is now the M2 pilot (a community figure) |
| 12 | arm/upper | home switch M2 pilots 1.8 to 2.1 mm | 100104.83 to 100088.32 | As the base |
| 12 | arm/holder | pen clamp pilot 2.8 to 2.9 mm | 25547.38 to 25546.69 | The M3 clearance less 0.6 mm, replaced by the M3 pilot measured on the X1C |
| 12 | arm/spindle | countersinks 5.5 to 6.82 mm across; disc 46 to 48 mm across | 5729.69 to 6119.54 | 5.5 mm was a cap head's diameter. An ISO 10642 M3 countersunk head needs 6.72 mm, so the heads stood about 0.6 mm proud under the bridge. The disc grew to keep 0.6 mm of edge beside the wider countersinks |
| 12 | arm/forearm | boss counterbores sunk 1.5 mm (was 0.2); yoke cheeks made parallel; yoke heads counterbored 3 mm | 25738.92 to 25907.74 | An M3x16 from the old depth ran 2.7 mm past the elbow output's flange into the planet gears. Sunk 1.5 mm, an M3x12 engages the whole 5 mm flange and stops at its face. The cheeks were tapered 3.6 degrees under the heads and nuts, so no head sat flat. The 28 mm yoke needs a 30.4 mm screw and nut, longer than the longest M3 cap screw sold (30 mm): the counterbore makes an M3x30 fit |
| 13 | arm/gripper | SG90 servo pilots 1.8 to 1.7 mm | 29345.82 to 29350.21 | The servo's own screws, sized from its tabs' holes by `v.motors`, as its mount already was |
| 13 | arm/zframe | 28BYJ-48 motor ear holes 4.2 to 4.6 mm | 42170.27 to 42111.32 | The motor's mount takes M4 screws (`cad list` buys M4x16): the M4 clearance hole with the printer's compensation |
| 14 | leg/spindle | as arm/spindle | 5729.69 to 6119.54 | As arm/spindle |
| 14 | leg/shin | boss counterbores sunk 1.5 mm (was 0.2) | 34176.92 to 34080.07 | As the forearm: the screws stop short of the knee's planet gears |
| 14 | leg/foot | M5 bolt holes 5.5 to 5.6 mm | 13379.21 to 13351.41 | As arm/base: hole compensation on the M5 clearance |
| 14 | leg/side | beam holes 2.9 mm pilot to 3.5 mm clearance | 66414.18 to 66341.87 | The screw passes through the side plate into the beam's pilot. With a pilot in both, the screw gripped both parts and could not clamp them together (`fasten.clearance`) |

Masses that follow: the arm prints 439.4 g (was 438.7 g), and `cad list arm/arm` now counts 30.4 g of fixings. The
quadruped in chapter 14 is 3474 g as a machine (was 3369 g), mostly its 105 g of screws, now counted.

### Printed sizes that moved: the repository's bench workspace

`examples/bench` is not published, but it holds printed references, so its moves are listed here too.
- `bench/arm` and `bench/leg` moved exactly as chapters 12 to 14 above (they are the same files).
- `benchmarks/shoulder-housing`: the counterbore for an M3 cap head went from 6.4 to 6 mm across (volume 27363.5 to
  27413.23 mm3). It is now the kit's counterbore: the M3 head 5.5 mm, plus the printer's fit 0.2 mm each side, plus
  its hole compensation 0.1 mm.
- `showcase/guitar`: the screw hole is expected to go from 4.5 to 4.6 mm, the M4 clearance hole (ISO 273, 4.5 mm)
  plus the printer's 0.1 mm. Its build runs a topology optimisation that takes over 30 minutes, so this one is left to
  the dimension table CI writes on the pull request.
- Every other bench, benchmark and showcase part keeps its sizes: the typed holes became the same figures from
  `v.fixings`. The bench's own copies of the M2 to M5 thread sets were made whole from the kit's; every value they
  held was already the kit's.

### Findings that changed

- `arm/arm-upright`: a new `fasten.load` warning, "a twist of 1.455 N m about the one screw is held by friction
  alone", on the upper arm's screw into the spindle. The spindle's hexagon carries that twist, which the check cannot
  see.
- `leg/stand`: two `fasten.access` warnings: the shin's screws 1 and 3 are reached only by a ball-end key in the
  stand's pose. Put the shin on before the leg goes on the stand.

### What a workspace should change

- Nothing breaks: an assembly without `fasten` checks as before, and typed holes keep working.
- Where parts screw together with a holes fit and a fit that `fastens`, run `npx cad check`: it notes the fasten
  that would replace them. `npx cad add fasten <project>/<assembly> --from-fits` writes it. Check again, and fix the
  part, never the fasten, where it fails.
- Draw screw holes with `v.fixings` (`v.fixings.hole('M3', { depth, at })`, `holeModel('M3', { kind: 'pilot' })`,
  `counterboreModel('M3 cap')`) instead of variables such as `m3.clearance + x1c.hole_comp`. The sizes stay the same
  where the old sum was the thread's figure plus the printer's compensation.
- A workspace with its own copies of thread sets (`rules/m3.json`): run `npx cad rules check` and copy across what
  the kit's set has that the copy lacks, or delete the copy, so pilots, clearances and sold lengths all come from one
  place.
- A fit's `"fastener"` and `"count"` are for what is not a screw (pins, a clip). Once a fasten holds a joint, the
  fasten counts its screws at the length it chose; `--from-fits` takes the old fields off the fit for you.
