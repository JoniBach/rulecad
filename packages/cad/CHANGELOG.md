# Changelog: @rulecad/cad

What changed in each release, for someone upgrading a workspace. A **printed size** is a dimension of a part you
print (a hole's diameter, a seat's depth, a part's outline). Each release lists every printed size that moved, with
its reason. A **fasten** is an entry in an assembly's `"fasten"` list: one screwed joint, naming the screw by thread
and head, the parts it passes through and the part it ends in.

## Unreleased: frame checks (Frames 3)

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
