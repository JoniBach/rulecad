# Changelog: @rulecad/cad

What changed in each release, for someone upgrading a workspace. A **printed size** is a dimension of a part you
print (a hole's diameter, a seat's depth, a part's outline). Each release lists every printed size that moved, with
its reason. A **fasten** is an entry in an assembly's `"fasten"` list: one screwed joint, naming the screw by thread
and head, the parts it passes through and the part it ends in.

## Unreleased: frame checks (Frames 3)

### Added

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
- **Schema:** `"frame": { "supports", "limit", "points", "rack": { "load", "limit" } }` on an assembly.

### Changed

- Every assembly with joins now has these findings; a frame that fails `frame.deflection` or `frame.stress` makes
  `cad check` fail where it passed before. No printed size moves.

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
