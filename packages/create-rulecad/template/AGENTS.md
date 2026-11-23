# Designing with rulecad: notes for AI agents

This project designs physical things with the `cad` command (rulecad). Every measurement is a variable, and every
variable says which rule it comes from. Follow these steps; they're what makes a design traceable and printable.
(`npx cad help` lists the commands; the full guide is @rulecad/cad's README.)

## A new part
1. **Rules first.** Find the facts the part depends on: standards, the thing it fits, the printer. Put shared ones in
   `rules/<set>.json` with `kind`, `source` and `checked`. Research them, don't guess. Ask the person to measure what
   can't be looked up, and record it as `"kind": "measured"`; something nobody has published goes in as
   `"kind": "estimate"`, and the check will flag it.
2. `npx cad new <project>/<object>`, then write the variables in the .json and the shape in the .js. No numbers in
   the .js other than 0, 1 and 2: `cad check` fails on any other.
3. `npx cad check`, then `npx cad preview`, and **look at the preview image** before saying it's done. Check the views
   from below for anything that fits onto something else.
4. Mark the variables that matter to the person `show` (six at most, short `label`s), and the ones other parts depend
   on `interface` (versions follow them). Give sensible `tweak` ranges to the ones they may want to change.
5. `npx cad export` for printing; `npx cad link --md` for a link to share.

## Fitting something from elsewhere
- When a part must fit something whose model exists (a maker's CAD, a model site), measure that model:
  `npx cad measure <file> --rules <name> --source <url> --licence "…"`. Look at the drawing in `.preview/measure/`,
  then rename the draft rules for what they are and say in each `rule` what the feature does.
- For a beam (an aluminium extrusion) the kit has no profile for, write its profile from the maker's spec sheet:
  `npx cad rules draft profile <name>` writes every field as a draft; fill each the sheet gives (its value, `"kind":
  "spec"`, the sheet, page and address as `source`, the date), delete the rest, and run `npx cad rules check <name>`
  until it has no `rules.draft` warning. A section figure warned off its outline (`profile.section.*`) is first a typed
  figure to hold against the sheet; if it is right, add the corner hollows the drawing shows as estimates, or measure
  the section's DXF, and say in your report what is left: the checks use the sheet's figures. Never change the check;
  then `npx cad rules draw <name>` and look at the drawing beside the sheet's. Or measure the maker's model or a DXF of its section:
  `npx cad measure <beam.stl|section.dxf> --profile <name> --source <url> --licence "…"`. It writes a draft profile
  set and the section's outline into this workspace's `rules/`. Look at the drawing, check the slot figures against
  the maker's sheet, and never copy the outline out of the workspace: it is the maker's shape.
- Model it from those rules, then `npx cad match <project>/<object> <file>`: report the worst places with their numbers,
  and look at the sections picture. A deliberate clearance shows as an even offset; anything else is a finding.
- Don't copy the shape of a model whose licence is non-commercial, no-derivatives or share-alike into a design under
  another licence: take measurements only, and say so.

## Changing a design
1. `npx cad history <project>/<object>` first: read the print log. A failed print is the reason for most changes:
   fix the rule or variable it points at (a measured fit beats a community rule).
2. Change, then check, preview and look, as for a new part. Change values with `npx cad set <project>/<object>
   name=value` and assemblies with `npx cad add fit|joint|item|beam|pose|fasten|join|guide|load …`, `npx cad set
   <project>/<assembly> x1.at=… joins.0.kind=…`, `npx cad move` and `npx cad remove`: they keep the file's layout and
   refuse an edit that breaks it, naming why and writing nothing. Make a project with `npx cad new <project>` and an
   assembly with `npx cad new <project>/<assembly> --assembly` (`--frame box --inside … --profile …` for a frame), and
   change a project's own fields with `npx cad set <project> material=PETG`. Write project and assembly files with
   these commands, not by hand: each checks its edit first, `--dry-run` shows it, and `--json` gives what changed and
   the checks. `cad remove` refuses to take out what other entries name and lists them; add `--with-refs` only once
   the person agrees those go too. `npx cad values` lists an object's numbers; `npx cad why <project>/<object>.<name>` shows what a
   value depends on, down to the rules (estimates marked). `--json` on check, values and why gives data to act on:
   each finding has a code, its numbers and where it is.
3. `npx cad release <project>/<object> -m "what changed, for the person" --dry-run` shows the bump and why. If it's
   major, tell the person which interface values changed: earlier prints may no longer fit.
4. Release only when the person agrees. Don't use `--force` without asking.

## Shapes
- Z is up, the bed is z = 0: model the part in its print orientation, and describe it in `orientation`.
- Walls are whole numbers of print lines (`x1c.line * 3`, or your printer's set), heights whole numbers of layers.
- Holes and slots get the printer's hole compensation; parts that slide together get its fit clearance. Chamfer
  bottom edges.
- A hole or a seat for a screw, a nut or a heat-set insert comes from `v.fixings`, named by its thread, never from a
  typed number: `v.fixings.hole('M3', { kind: 'pilot', at })` (kinds: `clearance`, `close`, `loose`, `pilot`, `tap`,
  `insert`, `thread`), `counterbore`, `countersink`, `nutPocket`, `nutTrap`, `squareNutSlot`, `insertBoss`. Each reads
  the workspace's thread set (`rules/m3.json` before the kit's), the project's printer and its material, so no
  diameter is typed and none is passed in. `cad check` then says what each was drawn to and the rule it rests on:
  report a figure it marks as an estimate or a community figure, and measure it. A thread's name is text
  (`'M3x12 cap'`), so the check on numbers passes it.
- An overhang warning means supports: say so in `orientation`, or change the shape or orientation.
- A part that moves by bending (a spring, a snap, a hinge with no pin) is a flexure from `v.flexures`: drawn flat, so it
  bends within its layers; give its thickness in whole lines (`x1c.line`), and check its strain at the travel against
  the material's limit with `v.flexures.printable`. PLA creeps held bent and fatigues; PETG or nylon for springs.
- Use the print-aware features in `v.shapes` before drawing your own: `teardropHole`, `crushRibs`, `wallOpening`
  print without supports as drawn (and `countersink` and `nutPocket` for a size that is no screw's). Use `v.ops.union/subtract/intersect` for booleans: the
  workspace can switch them to Manifold (faster, watertight) without touching the design.
- Designs run sandboxed: they may import only `@jscad/modeling`, `@rulecad/shapes`, `@rulecad/flexures`,
  `@rulecad/gears`, `@rulecad/motors`, `@rulecad/fixings` and files in their project, and can't write files or start
  programs. To see a value while designing, `console.log` it: it comes
  out with the command's output. A misspelt `v.name` stops the build and says which name was meant.
- Something printed under the part and removed afterwards is a named `support` part (`return { cap, pillar }`, both
  described in the .json's `parts`), not part of the shape. Look at `cad preview --explode` too.

## Alternatives, layouts, colours
- To try an alternative, add a **variant** (named inputs in the .json) rather than a copy of the object; `cad compare`
  shows two side by side. Remove trial variants before a release.
- What differs key by key on a keyboard belongs in a **layout file**, read through `per`. `cad import-kle` brings
  one in from keyboard-layout-editor.com.
- A part in another colour is a part with a `filament` from `project.json`: the 3MF puts it on its own AMS slot.
- Fine detail a screen doesn't need goes in `display` settings (fewer segments, no legends).

## Fits
- To check how parts go together, make a `fit` assembly with the thing it fits as a `reference` object, and `fits`
  with ranges from rules. An overlap or gap outside its range is a finding: report it with the numbers, and never
  widen a range to make it pass without saying why.
- Build bigger things from checked assemblies used as items, rather than placing their objects again.
- Things that move are one assembly with joints and poses, not a copy per position: give the objects anchors, join
  them with joints, name the positions in `poses`, and run `cad check --sweep` to find where parts collide on the way.
  See "Joints and poses" in the cad README.
- A part is named in fits as `<item>.<part>`; an object that returns one unnamed shape has one part, `body`.
- **A screwed joint is a `fasten`**, which knows the screw:
  `{ "screw": "M3 cap", "through": ["bracket"], "into": "base", "at": ["bracket.h1", "bracket.h2"] }` (anchors on the
  holes' axes), or `"holes": "bracket.body"` to use the part's own holes; `npx cad add fasten …` writes it. Draw each
  part's holes with `v.fixings` (a clearance hole where the screw passes, a pilot, insert or nut seat where it ends),
  and name the screw by thread and head with no length: the check chooses one. It reads the holes from the parts as
  drawn: one axis through the stack, a clearance hole in each part passed, a pilot, insert or nut at the far end, the
  length chosen from what is sold, thread engaged, the seat under the head and the key's way to it, and `cad list`
  counts the screws. Report what it finds with its numbers, and fix the part, never the relation, to make it pass.
- **A frame is beams and joins, never loose boxes.** Each beam is a `"beam"` item of a profile from a rule set (the
  kit's or one in `rules/`, never sizes typed into an object), placed by its ends; each meeting of two beams is a
  declared join, and its drilling, tapping, screws and nuts follow from it: never draw a join's holes or type its
  screws. Every join's stiffness and play is an estimate until the joint rig measures it, so every frame figure that
  rests on one (sag, sway, frequency, the diagonals to accept) is reported as resting on an estimate. The frames guide
  (docs/guides/building-frames.md, on the docs site) walks a profile from its sheet to a checked box.
- **Beams are held to each other by a join**, not a fasten: `{ "kind": "blind", "a": "y1.a", "b": "x1.back@120" }`
  (`npx cad add join …`), `b` the place on the other beam where a's end meets it. A blind or end-tap join taps a's end,
  drills b and adds its screw to the fasten checks and the list. A bracket, gusset or splice join with `"fitting":
  "printed"` adds its printed fitting, sized from `"load"` (N, default 100) by finite elements, and its screws into both
  beams' slots: report the fitting's grams, margin and stiffness from `cad check` with that load, and say the stiffness
  leaves out the slot nuts. A bought fitting is a rule set named in `"fitting"` (`fitting-motedis-bracket-20-b6`;
  bracket, gusset, splice, hidden and anchor joins): its screws and nuts are its set's, its price goes on `cad list`,
  and its stiffness is its set's estimate, so report it as one. Choose printed or bought from what `cad list` costs
  and what each stiffness rests on, and say both. A `fitting.fit` failure means the set is made for another profile
  or slot: choose another set, never edit the set to pass. The other kinds are checked where they meet and say their
  fitting comes later (`join.fitting`). Move the beam to fix `join.geometry`, never the address, unless the
  address is what was wrong; `join.stiffness` says whether it rests on an estimate or on the joint rig's
  measurement (and its date): report it as it says. A `join.drop` is a prediction for a beam held by one join, to
  measure and write back with `cad measured`, never a figure to tune. `frame.deflection` gives each sag twice, on
  the joins' springs and with the joins rigid: report the first with what it rests on (`refs.restsOn`), never the
  rigid one alone. Say where the frame stands with `"frame": { "supports" }` or fitted feet, not by moving beams.
  `frame.rack` gives the racking stiffness each way and the gain each change (gussets, a brace, a panel) solves to:
  report the stiffness, the gain and the change it advises, and say the push and the joins' springs are estimates.
  `frame.frequency` gives the lowest mode against what the machine excites: report it with its pose, and look at
  `<assembly>.frame-mode.svg` from `cad beams` to see what moves. To choose profiles, give `"frame": { "size": {
  "profiles": [...] } }` and read `frame.size` (or `npx cad frame <project>/<assembly> --size`): report each group's
  profile with the limit that set it and its margin, never pick a profile by hand where the sizing can; write it with
  `--size --write` and check again, as its joins and lengths change. A task on a guide counts the beam's sag (the
  frame's own figure where the frame is solved), straightness and twist in `task.accuracy`: report the biggest term
  as it is named. `frame.heat` (given `"frame": { "heat": { "air": 45 } }`) says how much the frame grows and holds
  each printed fitting to its plastic's softening point: move a failing fitting from the heat or print it in a plastic
  that softens higher, never raise the softening figure. `beam.printable` (given `"frame": { "printed": "petg" }`)
  says which beams could be printed and the margin each misses by: report the margin and what governs it, say it
  rests on estimates (the printed section, creep) until the beam coupon is measured, and name the joins it says need
  changing. A `beam.coupon` sag or break is a prediction to measure on the bench and write back with `cad measured`,
  never a figure to tune; `beam.creep` fails a printed beam held too hard for months: a deeper section or aluminium.
  A beam that needs slots in more than its top face prints standing up from the metal's profile
  (`"printed": { "pose": "standing", "end": "nut" }`): its tapped end takes the thread `beam.end` names, and a foot
  under it takes that `"thread"`. Report each printed beam's pose, grams and the sag `frame.deflection` gives.
- **A frame for a size starts from a generator**: `"frame": { "kind": "box", "inside": [w, d, h], "profile",
  "join": "blind" }` (also portal, table, gantry, shelf) expands into beams, joins, feet and caps before anything is
  checked. Ask by `inside` for what it must enclose, `outside` for what it must fit in; never work the lengths out by
  hand. Make it with `npx cad new <project>/<assembly> --assembly --frame box --inside 300,300,350 --profile …
  --join blind`, which says what it expands into before it writes. Read `frame.generated` for what it made, and
  `npx cad frame <project>/<assembly> --expand` to write it out when it needs changes a generator cannot make, then
  change the beams and joins with `cad set`, `cad move`, `cad add` and `cad remove` as a hand-drawn frame's.
- **Beams are cut and drilled by hand from their sheets and jigs**: `npx cad beams <project>/<assembly>` writes a
  cut-and-drill sheet per mark, and `--jigs` writes the jigs as a plate in `exports/` (a drill guide per distinct
  hole across a beam, a tap guide per tapped end, a cut-length stop per length, a squaring corner of the hand each square join takes),
  each marked with the marks it is for. Report each jig's grams and margin and that it prints clean; a hole too far
  from both ends for one print is a `jig.drill` warning: say to mark it from the sheet. A `jig.tap` or `jig.square`
  warning is a tapped end or a join with no jig that fits: tap it by eye, or square it with an engineer's square.
- **A bay closed by a sheet is a `panel` item**: `{ "id": "front", "panel": { "sheet": "acrylic", "thickness": 3,
  "bay": ["x1", "z2", "x2", "z1"], "out": [0, -1, 0] } }`. It is cut to the bay with its clips at a pitch, each
  fastened into its slot; report its size and grams from `cad check` (`panel.size`) and the clips from `cad list`.
  `"door": { "hinge": "z1" }` makes it a door on two printed hinges, turning on a joint: run `cad check --sweep` and
  report what it finds. A turn-button latch shown shut blocks the door in its first degree, which is right.
- **A board or supply on a frame is a bought item with `"mount"`**: `{ "id": "psu", "bought": "supply-24v",
  "variant": "LRS-50-24", "mount": { "on": "rail.top@-90" } }`. Its holes come from its rule set (`mount_holes`, x then
  y for each); add them from the maker's drawing, with their source, before mounting a device whose set has none. A
  wire along a beam is a run in its `via`, `{ "along": "rail.front", "from": 300, "to": 60 }`: report its length and
  its clips from `wire.length` and `wire.run`.
- **Linear motion on a beam is a guide**: `"guides": [{ "kind": "rail", "rail": "rail-mgn12", "carriage": "MGN12H",
  "on": "x1.top", "from": 50, "length": 300 }]`, written by `npx cad add guide <project>/<assembly> --kind rail
  rail=rail-mgn12 carriage=MGN12H on=x1.top from=50 length=300`. Never draw a rail or carriage yourself, nor type its screws: the
  guide places the rail, its screws into the slot at its pitch and each carriage on a sliding joint with its true
  travel. Fix a table on a carriage with a fixed joint at `g1-carriage-1.top`. Run `cad check --sweep`, and report
  `guide.fit`, the travel and each carriage's `joint.moment` margin; a fail there means a longer carriage
  (`MGN12H`), a larger rail or the load nearer the carriage, never a changed rating.
  On a V-slot beam the same guide can be wheels: `{ "kind": "wheels", "wheel": "v-wheel-solid", "on": "x1.top",
  "from": 50, "length": 400 }` (the plate over that face, its wheels in the tracks either side). A plain T-slot is
  refused for wheels: use a rail or a `slider` there. Report the wheels' `guide.fit` seat, the travel and the
  plate's `joint.moment` margin, and say the wheels' ratings are estimates.
  Two smooth rods and a lead screw are two guides: `{ "kind": "rods", "on": "x1.top", "from": 60, "length": 101,
  "endstop": { "at": "x1.front@82" } }` and `{ "kind": "screw", "guide": "g1", "motor": { "model": "28byj48" } }`.
  Never draw the holders, motor plate, coupler or carriage yourself: the guides place them by addresses and give the
  motor its lead screw. Report the travel, `motor.torque`'s margin, `guide.coupler`, the bearings' `joint.moment`, the
  endstop's home, and each printed part's grams and margin; if the endstop is refused, use the address it names.
  A belt drives a rail's carriage: `{ "kind": "belt", "guide": "g1", "motor": { "model": "nema17" }, "accel": 3000 }`
  (`npx cad add guide <project>/<assembly> --kind belt guide=g1 motor.model=nema17 accel=3000`). Never draw the
  pulley, idler, belt, plate or clamp yourself: the guide places them by addresses. Report `belt.length` (cut and
  buy), `belt.tension`, `motor.torque`'s margin and the travel a turn, `belt.tensioner`'s room, and each printed part's
  grams and margin; say the tension and the belt's thickness are estimates. A `belt.rub` or `belt.line` fail means the
  idler or the part it names moves, never the belt's figures; where the part is on the carriage, raise the belt with
  the `"height"` it names instead or move the part; a `belt.tensioner` fail means cutting the belt to the length it
  names.
- **A part screwed onto a beam is a `fasten` into a slot**: `"into": "x1.top"` (or `x1.top.2`, or `x1.top@120`, the
  middle of its screws), the
  part's holes drawn with `v.fixings` at the slot's spacing, `"nut"` the slot nut's kind. `fasten.slot` fails a hole off
  a slot's centre line, with the distance: move the hole. `frame.nut` fails slide-in nuts in a slot that joins close
  at both ends: use the kind it names (`"nut": "drop-in"`). `frame.preload` lists nuts to load before a join; tell
  the user, and `cad order` shows them on the step.
- **A frame's build is `cad order`**: from bars to a square frame in numbered steps (cut, drill and tap, sides built
  flat and squared, nuts to load, joins with their torque, the diagonals, then the rest). Give the user its steps and
  its diagonals (`frame.square`: each and the difference to accept, stacked from the cut tolerances and the joins'
  play; `"frame": { "cut": { "tolerance": 1 } }` where the user's saw holds less than the profile's figure). Once
  squared, the difference they measure goes back with `cad measured <ref> frame.square.<beams>=<mm>`. If it is refused for a slot's nuts, change the
  nut to the kind it names; never reorder the joins to get round it. Where a side is built on the frame, not flat,
  the build says why; pass that on. Its load and "Slide ... screw into ... head first" steps give each nut and head a
  way into its slot: pass them on as written. `cad check` counts the same steps.
- **To hand a build to someone, write its kit**: `npx cad kit <project>/<assembly>` writes
  `exports/<project>/<assembly>-kit/` (the build page as README.md, buy.csv, each plate's 3MF and the jigs', each
  mark's sheet; `--pictures` adds the steps' pictures). It refuses a design whose check fails: fix the failures, never
  hand on a kit of one. `npx cad plates` lays out every printed part by material, with a frame's jigs beside them.
  A new frame project can start from `npm create rulecad my-frame --machine frame --size 300x300x350 --profile
  2020-misumi-hfs5`.
- What holds parts with no steel screw is named in the fit's `fastener`, never typed in a note:
  `{ "pin": "snap pin 4x6", "count": 2 }`, `{ "pin": "dowel 3x12", "fit": "press" }`, or
  `{ "magnet": "disc magnet 8x3", "count": 2, "load": 10 }`, with the holes or pockets drawn by `v.fixings.pinHole(...)`
  and `v.fixings.magnetSeat(...)` under the same name. `cad check` then finds and checks them and `cad list` counts
  them. A bolt to print is a fasten's screw with the word printed (`"M8x20 hex printed"`). Snap pins live in
  `v.fixings` now (`v.flexures.snapPin` still draws the same pin); snap hooks and ratchets stay in `v.flexures`.
- A fit with `"fastens": true` is for what holds parts without screws (pins, a press, a clip). An older assembly with
  a holes fit (`{ "holes": "pcb.board", "into": "case.body", … }`) and a fit that fastens the same parts gets a
  `fasten.suggest` note from `cad check`: `npx cad add fasten <project>/<assembly> --from-fits` puts the fasten in
  their place. Check it after, and report what changed.
- A board screwed into its case is a `fasten` too, through the board's own mounting holes:
  `{ "screw": "M2 cap", "through": ["pcb"], "into": "case", "holes": "pcb.board" }`, into bosses the case draws with
  `v.fixings.insertBoss('M2', ...)` under `v.pcb.board_holes`.
- A part built around another (a case around its board) reads it: `"uses": ["macropad/pcb"]`, then
  `pcb.board_w` and `v.pcb.board_holes`. Never copy another object's numbers by hand.

## Circuit boards
- `"engine": "pcb"` in the .json; `main(v)` returns a board built with `v.pcb` (see @rulecad/pcb's README).
- Parts come from rule sets where one exists (`v.pcb.xiao`, `qwiic`, `jstph`, `header`), or any standard footprint by
  name (`v.pcb.part('U2', 'soic8', x, y)`). Turn parts in quarter turns with `rotation`, held in a variable.
- A board's mounting holes are named by their screws' thread, never typed: `v.pcb.mount('M2', x, y)` in its `holes`
  is the thread's clearance hole from its rule set, as the fab drills it (`{ fit: 'close' }` or `'loose'` for the others).
- Join pins with `nets` (`GND: ['U1.GND', 'J1.GND']`) and let the autorouter draw them; `cad check` runs the fab's
  design rules. Look at the copper preview: connectors should face the edge their plug comes from.

## Optimised parts
- For a flat part that carries load (a lever, a bracket, a pedal arm), describe it as a problem in `problems/`: the
  space it may fill, the bosses to keep, the holes to avoid, the supports and loads (in newtons, each in a case), the
  material's rule set. `npx cad optimise <project>/<problem>` and **look at the picture** in `.preview/`.
- A design reads the result through a `problem` variable and builds it with `v.shapes.optimisedOutline(...)`. Add an
  `analysis` to the object so `cad check` reports its stiffness; report those numbers with their load and material.
- Solid parts (brackets, joints) are 3D problems: regions with a z, a named part as the space if it helps. Set
  `"overhang"` to the way up it will print, so the result needs no supports, and give horizontal bosses and holes a
  `teardrop` (`"down"`, `"up"`). Draw the part as it prints; if that isn't the problem's frame, give its `analysis` a
  `rotate` and `move` back. Build with `v.shapes.optimisedSolid(...)` and `"engine": "manifold"`; look at the four views.
  The result is made printable before it's drawn (hanging cells emptied, tips lifted, loose bits dropped), but a kept
  region is never emptied: if `cad optimise` says part of one has nothing holding it up, give the part more material
  to stand it on, or keep less. `cad check` tests the part for one piece and nothing starting in mid-air.
- Before reporting numbers for a final shape, verify them: give the `analysis` a smaller `cell` (solids: about a
  third of the problem's) and check the stiffness has settled (`fea.settled`). Report the verified numbers, the safety
  factor, and where the peak stress is.
- For a part that must not break (a lever, a pedal), give its problem a `"stress"` limit (the material's strength
  over a safety factor) instead of a `"volume"`: the lightest layout under it. Then verify it on finer cells.
- Mark a problem `"critical": true` if the part could hurt someone if it broke. Say plainly that the analysis is a
  design aid and the material values are data-sheet figures: such a part needs testing, recorded under
  `"verification"`, not just a check.

## Machines
A machine is an assembly with a `task` at the top: the tool, the sheet or volume it works in, how fast and how accurately.
EXAMPLES chapter 12 builds one from start to finish.
- **Task first.** Write the `task` before any part: what the tool must reach, at what speed, to what accuracy. The checks
  (`task.reach`, `task.speed`, `task.accuracy`) report margins against it, in every pose and across the sheet.
- **Reach before shape.** Find the link lengths from the far and near corners of the work, keeping away from full stretch
  (the speed check finds that) and from the fold (the hole near the base). Write down why; the parts come after.
- **Bench before trusting a budget.** The error budget stacks what each joint adds. A gearbox's play and twist are
  guesses until bench tests 14, 15 and 17 have measured them: give them as rules of `"kind": "estimate"`, read the
  sentence that says what the figure rests on, and use `npx cad measured` to replace them. A passing budget on estimates
  is a target, not a prediction. Report it that way.
- **Never set a driver's current from memory.** Give the motor item a `driver` and a `current`, and take the trimmer's
  voltage from what `cad check` says for that board and its sense resistors; read the resistors on your own board first.
  State why the current is what it is: the torque it needs, the driver's rating without a heat sink, the motor's heat.
- **Everything bought is an item.** Motors, drivers, bearings, switches, the supply: `bought` items and `wires` make the
  shopping list (`cad list`), the wiring sheet (`cad wires`) and the firmware's settings (`cad machine`) from one assembly.
  Ask the person what they already have, and mark those items `"have": true`: `cad list` and the kit then list them as
  in hand, apart from what is to buy. Design for the parts they have before asking them to buy others.
- **The supply sets the speed.** A stepper's torque at speed is worked out at the volts of the assembly's bought supply
  (24 V where it has none): give the supply they will really use, and report `motor.torque` at that voltage.
- Before moving anything: `cad plot` the drawing and watch the preview. It refuses a stroke that leaves the sheet.
- **A gait is the same idea for a body.** Give an assembly a `gait` (`legs`, `pattern`, `stride`, `lift`, `period`, `height`, `mass`): the body at the world origin, the hips at z = 0, the feet as anchors. One leg on a stand is a gait of one leg (`"pattern": { "duty": 0.6, "phase": [0] }`). Anchor a round foot at its centre, so the contact rolls with the shin and the height stays true. Report a gait's numbers as they are: quasi-static, the torque from the weight alone, no dynamics.
- **Say what the machine weighs.** A robot built from these parts is heavier than the first sizing said it was: list `cad list`'s grams and set the gait's `mass` to that, and report the torque margin at the real mass.
- Start a machine from a template rather than from an empty assembly: `npm create rulecad my-arm --machine arm --sheet a5 --accuracy 0.3`, or `--machine leg`.

## Talking to the person
- Give links as one labelled line (`npx cad link <project>/<object> --md`), never a raw URL. If it says
  "(not a release)", say so. If it says the link is too long for chat, don't paste it: tell the person, and offer
  short links (a secret Gist), which upload the model, so ask first.
- Say what the checks found, with numbers. Ask before anything that leaves the computer: releases with `--push`,
  ordering boards, publishing.
- Designs are code: only run designs you or the person trust. Links and rule files are data and never run.
