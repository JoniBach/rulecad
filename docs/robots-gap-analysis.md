# Building machines in rulecad: a gap analysis

What rulecad would need for someone to design, print, wire and run a machine from scratch, with the kit catching the
mistakes before the printer does. Three machines set the scope: a **SCARA arm** that draws (the main project), a
**flat XY plotter**, and a **3D printer**. The arm comes first; the other two share most of what it needs and add a
little each. Written against rulecad as published on 2026-11-09 (cad 0.7.41, motors 0.1.2, gears 0.3.2, rules 0.3.6).

The measure of success is a person who has never built a machine finishing one with few reprints, able to see at every
step what the design predicts and whether the build agrees. Three words come up throughout: **ease** (the kit does the
arithmetic and the bookkeeping), **observability** (every prediction is visible, with its source, and can be compared
with a measurement), and **minimal retry** (a mistake is found by a check, not by a print or a burnt driver).

## 1. The three machines

| | SCARA drawing arm | XY plotter | 3D printer |
|---|---|---|---|
| Motion | two revolute joints, a pen lift (and later a Z and a wrist) | two prismatic axes on belts, a pen lift | three prismatic axes, an extruder, heat |
| Kinematics | non-linear: pen position to joint angles, two solutions | linear (plain XY) or belt-coupled (CoreXY) | linear, plus a 4th axis that meters plastic |
| What the arm carries | its own motors and links, cantilevered | a light carriage on rails | a hot end and a fan on rails, a heated bed |
| Accuracy that matters | pen position over the sheet, 0.3 mm or so | the same, easier to get | 0.1 mm, and repeatable layer to layer |
| Loads | tipping moments at each joint; the shoulder takes the whole arm | belt tension; little else | belt tension, bed weight, a frame that must stay square |
| Electronics | a stepper driver per joint, a servo, a controller that can do arm maths | GRBL on an Arduino, a CNC shield | a printer board, heaters, thermistors, 24 V supply, safety |
| Firmware | none off the shelf for the Uno does SCARA; the arm maths runs on the computer | GRBL, configured by number | Marlin or Klipper, configured by file |

The arm is the hardest of the three in kinematics and loads, the printer the hardest in thermal and electrical safety,
the plotter the easiest in everything. Building the kit around the arm and checking it against the plotter (where the
answers are easy to verify by hand) is the sensible order.

## 2. What rulecad has today

An honest inventory, so the gaps are read against it.

- **Rule sets** for a Bambu X1C, PLA and PETG, several metals, M1.6 to M5 fasteners, MX switches and keycaps, boards
  (Pico, XIAO, Pro Micro), connectors (Qwiic, JST PH), and since the motors work, NEMA 17 and 14, 28BYJ-48, N20, SG90,
  MG90S and a 2204 brushless motor. Every figure has a value, unit, rule, kind and source; `cad rules check` holds a
  set to that, `cad rules draw` draws what it says a part mounts by, `cad rules draft` pulls figures from a datasheet
  for a person to name and check.
- **Parts** as JSCAD designs whose every number is a traced variable; variants; versions with semver for physical fit;
  a print log (`cad printed`) and history.
- **Assemblies**: items placed by expressions, fit checks with ranges, holes fits, components, repeats, references
  (things bought, not printed). **Joints** (fixed, revolute, prismatic, cylindrical, ball, path), followers, poses,
  loops that close rings, and sweeps that move every joint through its range looking for collisions. `assembly.loose`
  says what nothing holds.
- **Gears**: spur, rack, ring, worm, bevel, planetary and compound planetary, meshed in phase in assemblies, with
  backlash, interference, contact ratio and centre-distance checks measured from the drawn teeth; tooth strength by FE.
- **Motors**: an item that drives a joint; loads as torque, force or a mass at an anchor that follows the pose;
  `motor.torque`, `motor.speed`, `motor.holds`, `motor.mount`, `motor.heat`; shaft fits read from the bore as drawn.
- **Structure**: `@rulecad/fea` (2D and 3D grids) and `@rulecad/topopt` for the stiffest layout of a flat or solid
  part; an `analysis` on an object reports its stiffness and peak stress.
- **Flexures**: leaf springs, notch hinges, serpentines, lamina mechanisms printed flat, with strain, jam, catch and
  sequence checks, animated.
- **Boards**: `@rulecad/pcb` draws a circuit board from rules and ships a fab zip and KiCad files; a board is a part
  in assemblies.
- **Print checks**: bed, base, overhangs, bridges, ledges, islands as sliced, closed solids, first-layer sprawl.
- **Sharing and looking**: a model page with a slider per joint, a pose button each, a slice panel with islands in
  red, downloads as STL or 3MF per filament; `cad preview`'s six views; `cad explain` and `cad why` down to the rules.
- **A bench**: `examples/bench/projects/benchmarks` holds twenty printed measurements (fits, backlash, gear strength,
  motor stand, servo stand, the robot shoulder) and firmware for an Uno to drive them, with predictions to compare.

What the kit does not have, in one sentence: it can say whether a mechanism fits and turns, but not whether a machine
built from it reaches, draws straight, holds its accuracy, or can be wired and run.

## 3. The gaps

Each gap says what is there today, what a machine needs, the implementation that would make it easy, observable and
hard to get wrong, and which machines need it (**A**rm, **P**lotter, **3D** printer). "Needs numbers" marks the gaps
whose figures should come from the bench before they are trusted.

### 3.1 Catalogue: the bought parts a machine is made of

**Today:** motors, fasteners, boards and connectors. No bearings, belts, pulleys, rods, rails, lead screws, couplers,
extrusions, switches, sensors, drivers, supplies or hot ends. The word "bearing" appears once, in the N20's rules.

**Needed:** a machine is mostly bought parts, printed parts joining them. Without rule sets for them, every design
hard-codes a bearing's outer diameter from memory, which is the kind of number the kit exists to trace.

| Family | Sets | For |
|---|---|---|
| Rolling bearings | 608, 625, 6800, 6805, MR105, F623 (flanged), a 51104 thrust | A, P, 3D |
| Belts and pulleys | GT2 2 mm pitch in 6 mm and 9 mm (tooth form, pitch line offset 0.254 mm, stiffness per width), 16 T and 20 T pulleys with 5 mm bores, smooth and toothed idlers | P, 3D (A later, for a belt-reduced joint) |
| Linear motion | 8 mm smooth rod, LM8UU and LM8LUU, MGN12H rail and carriage, SCS8UU, T8 lead screw with 2 mm, 4 mm and 8 mm leads, brass and POM nuts, 5 to 8 mm couplers | P, 3D (A for its Z) |
| Frame | 2020 and 2040 extrusion, M5 T-nuts, corner brackets, M3 drop-in nuts | 3D, P |
| Sensing | mechanical endstops (the common 10 T85 microswitch), hall sensors, optical endstops, AS5600 magnetic encoders, BLTouch and inductive probes | A, P, 3D |
| Drive electronics | A4988, DRV8825, TMC2208 and TMC2209 (current setting, microsteps, voltage, heat), the Arduino CNC shield V3, SKR Mini, RAMPS | A, P, 3D |
| Power | 12 V and 24 V supplies by current; USB power budget | A, P, 3D |
| Hot end and bed | E3D V6 and clones (heater block, heat break, PTFE limit), 0.4 mm nozzles, 40 W heaters, 100 k thermistors, 4010 and 5015 fans, a heated bed with its PEI sheet | 3D |
| Wiring | JST-XH, Dupont, ferrules, 22 to 18 AWG by current, drag chain sizes | A, P, 3D |

**Ideal implementation:**

- One rule set per part, as the motor sets are: `part` (what it is), `interface` (the dimensions something printed
  mates with: bore, outer diameter, width, chamfer, belt pitch), `variants` for sizes. `cad rules draw` already draws a
  set's mounting dimensions; it should draw bearings and pulleys too, so a person can hold the drawing against the
  datasheet.
- A `bought` item kind in assemblies, generalising the motor item: `{ "id": "b1", "part": "608", "at": [...] }` places
  the reference shape from the rules, gives it anchors (`bore`, `outer`, `face`), and puts it on the shopping list.
  Motors would become one case of it.
- Shape helpers for the seats these parts sit in, in `@rulecad/shapes`: `bearingSeat` (a press or slip seat with the
  printer's compensation, a lip to stop against, a relief so the inner race runs free), `pulleyBore`, `rodClamp`,
  `lm8uuPocket`, `nutTrap` for lead-screw nuts, `extrusionEnd`. Each prints without supports in its intended
  orientation, and each says in a check what fit it was drawn to.
- Most figures start as `community` (hobby parts have no single datasheet). The bench's fit bar pattern extends to a
  **seats coupon**: one small print with each bearing and rod seat at three fits, so a person measures once per filament
  and the kit writes `measured` rules back (see 3.8).

### 3.2 Kinematics and the task: does the pen reach the paper?

**Today:** joints place parts forward (angle in, position out). Nothing goes the other way, nothing knows where the
tool is, and nothing knows what the machine is for.

**Needed:** the arm must put its pen anywhere on the sheet, and the designer should learn that it can't before anything
is printed. For the plotter this is a rectangle check; for the arm it is two solutions per point, joint limits, an
elbow that must not hit the base, and a region near full stretch where small joint errors become large pen errors.

**Ideal implementation:**

- A **task** in the assembly, in the machine's own words:
  `"task": { "tool": "pen.tip", "sheet": { "size": "a4", "at": [60, -105, 0], "normal": [0, 0, 1] }, "speed": 50,
  "accuracy": 0.3 }`. For a printer, `"volume": [220, 220, 250]`; for the plotter, the sheet.
- **Inverse kinematics** in `@rulecad/cad` for the chains it already knows how to pose: a serial chain of revolute and
  prismatic joints solved numerically (a damped least-squares step on the forward placement the kit already computes,
  which handles any chain), with closed forms for the two it meets most (a planar 2R arm, plain XY) so the answers are
  exact and the two elbow solutions are named.
- A **reach check**, `task.reach`: the tool's reachable region sampled across the sheet (or volume), against the joint
  limits and the sweep's collisions. A fail names the corner that can't be reached and by how much. The picture in
  `.preview/` draws the sheet, the reachable region, and the dexterity (how far from a stretched-out singularity) as a
  shade.
- **Speed**, `task.speed`: with the joint speeds `motor.speed` already finds, the slowest the tool can move anywhere on
  the sheet, against the task's speed; a plotter's belts turn this into mm/s directly.
- The viewer's Motion panel gains a **tool mode**: drag the pen on the sheet and the joints follow (the inverse
  kinematics run in the page), so a person feels the workspace rather than reading it.

### 3.3 Accuracy at the tool: adding up the play

**Today:** `mesh.backlash` measures each gear pair; `joint.play` exists for a joint; a stepper's step size is known to
the motor item. Nothing adds them up, and nothing turns an angle error into a pen error.

**Needed:** a drawing arm's error at the pen is every joint's play, multiplied by the arm length beyond it, plus the
step size through the ratio, plus link bending under the pen's drag, plus shaft twist. It changes with the pose. A
designer today cannot tell whether a 0.3 mm backlash at the shoulder gearbox matters; with a 200 mm arm it is 1 mm at
the pen, and it does.

**Ideal implementation:** an **error budget**, `task.accuracy`, computed per joint and stacked to the tool over the
sheet:

| Term | Source today | Source needed |
|---|---|---|
| Step resolution | motor steps, gear ratio | microsteps from the driver's rules (and a note that microsteps add resolution, not accuracy) |
| Gear backlash | `mesh.backlash` per mesh | stacked through the train, as an angle at the output; measured by bench test 14 |
| Shaft and hub twist | nothing | torsion of printed shafts and D-bores under the joint's torque; measured by bench test 15 |
| Bearing and clip play | nothing | radial and axial play from the bearing's rules; for printed bearings, a measured figure |
| Link bending | `@rulecad/fea` on a part | the link's deflection under the tool's drag and its own carried mass, automatically from the assembly (3.4) |
| Belt stretch and tooth play | nothing | GT2 stiffness per width times free length, from the belt's rules |
| Lead screw backlash | nothing | from the nut's rules; zero with an anti-backlash nut |

The finding gives the worst point on the sheet and the biggest term, so the fix is obvious ("1.1 mm at the far
corner, 0.8 of it the shoulder's backlash: preload the gearbox or shorten the forearm"). The picture shades the sheet
by predicted error. Every figure says whether it is from a datasheet, FE, the bench, or an estimate.

**Needs numbers:** bench tests 14 (play at the shoulder's output) and 15 (its twist under load) set the two biggest
terms for printed gearboxes, and test 17 (repeatability over twenty cycles) is the whole budget measured at once; until
they are measured the budget runs on estimates and says so.

### 3.4 Loads and structure: what the joints and links must carry

**Today:** loads are a torque about a joint's axis, a force along a prismatic, or a mass whose torque about each axis is
found from the pose. `motor.mount` reads the thickness under a motor's screws. FE exists but is run on one part at a
time through its `analysis`.

**Needed:**

- The **overturning moment** on a joint: a shoulder holding a forearm, its motor and a pen takes a tipping load at
  right angles to its axis, carried by whatever locates the output (three clips on the current robot shoulder, bearings
  on a real one). Nothing checks it. It is the single most likely cause of a first arm sagging or wobbling.
- **Bearing loads** against their ratings, static and dynamic, from the same moments.
- **Link stiffness** in the assembly: how far the forearm's tip drops under its own carried mass and the pen's drag, in
  every pose, from the shapes as drawn, not from a hand-set `analysis`.
- **First natural frequency** of the arm and of a printer's gantry: a printer's ringing and an arm's wobble after each
  move are set by it. A crude estimate (stiffness over carried mass) is enough to compare designs.
- **Belt tension** as a load on the frame and the motor shaft (side load on a NEMA 17 shaft is limited; the rules
  should carry the figure).
- **Frame squareness** for the printer: whether the extrusion frame as assembled holds the axes at right angles
  within the task's accuracy.

**Ideal implementation:**

- `joint.moment`: for each revolute, the resultant force and tipping moment at the joint from the masses and tool
  loads beyond it, in every pose, against what holds it: a bearing's rating from its rules, or, for a printed
  location (clips, a printed sleeve), a figure from FE on the part as drawn.
- `link.deflection`: FE on each link between its joint anchors, automatically meshed from the part at a coarse cell
  (the kit already voxelises parts for topopt), loaded by the moments above; reported as a drop at the tool, feeding
  the error budget in 3.3. Flag `fea.settled` as the existing analyses do, and let a person refine the cell.
- `assembly.frequency`: the lowest mode estimated from the stiffness and mass found above, with a plain-words note
  ("about 18 Hz: visible ringing above 60 mm/s").
- The `critical` flag that problems already have, extended to assemblies: a machine whose failure could hurt someone
  (a printer's heaters, anything with mains) fails rather than warns on estimates in its safety path.

### 3.5 Motion: from a drawing to steps

**Today:** nothing. No toolpath, no G-code, no firmware configuration, no streaming. The bench firmware moves one motor
by a count.

**Needed:**

- Plotter: GRBL on the Uno and CNC shield takes G-code; the design knows steps per millimetre, the axes' lengths,
  the homing directions and the maximum speeds, and a person today would type them into GRBL's `$` settings by hand,
  from numbers the kit already has. Typing them is where mistakes come from.
- Arm: GRBL cannot do arm kinematics. Either the computer does the maths and streams joint moves, or the firmware
  does (Marlin has a SCARA mode but is heavy for an Uno). The sensible first version keeps the arm maths on the
  computer, which the kit already has in 3.2, and sends synchronised step counts to simple firmware.
- Printer: Marlin or Klipper configuration files whose every number (steps per mm, extruder steps, thermistor type,
  bed size, probe offset, endstop positions) comes from the assembly.
- A path from a drawing (SVG) to tool motion: lines, arcs, pen up and down, ordered to reduce travel, with an arm's
  straight lines interpolated in joint space finely enough to stay straight.

**Ideal implementation:**

- A **machine description** generated from the assembly, `cad machine <project>/<assembly>`: axes (joint, motor,
  driver, steps per degree or millimetre, limits, homing direction and switch anchor), tool, task, kinematics type.
  Plain JSON, the single source for everything below.
- **Targets** for firmware, as the kit's targets already do for other outputs: `grbl` writes the `$` settings as a
  script to paste into a serial terminal; `marlin` writes a `Configuration.h` fragment; `klipper` writes a
  `printer.cfg`. Each is text with a comment per line naming the rule it came from, so the firmware is as traceable as
  the part.
- **`cad plot <assembly> <drawing.svg>`**: plans the toolpath, runs it through the inverse kinematics, checks it
  against reach, speed and accuracy (3.2, 3.3), writes G-code for a plotter or a joint-step file for the arm, and
  draws the result: the sheet, the path, the arm's sweep over it as an animation (as `cad animate` does for lamina
  mechanisms), with pen-down lines in the predicted error's colour.
- **A streamer** for the Uno in the kit's `firmware/` pattern: the bench sketch grown to take synchronised two-axis
  step blocks over serial with acceleration, plus the servo lift and an endstop each. Not a general firmware: the
  smallest thing that lets the arm draw, so the kit's predictions can be tested.
- The viewer plays the planned path on the model (the Motion panel's sliders driven by the path) so the person sees
  the arm draw before it exists.

### 3.6 Electronics and wiring: the half of the machine that isn't printed

**Today:** `@rulecad/pcb` makes boards, `wiring.json` is a single estimate for keyboard hand-wiring. An assembly has
no notion of a wire, a connector or a power budget. `motor.heat` reports the current to set a driver to, but the
driver itself is not in the design.

**Needed:** a motor, a driver, a controller and a supply are a chain with current, voltage and heat at each step; a
wire has a gauge, a length and a connector at each end; cables that move through a joint need slack and a path. A
first machine fails on these as often as on its mechanics: a Vref set wrong, a wire too short to reach the elbow at
full stretch, a supply too small.

**Ideal implementation:**

- **Driver and controller items** from rule sets (3.1), with `motor.driver` checking the driver's current against the
  motor's and the supply's voltage against both, and saying the Vref or UART setting to use.
- **A power budget**, `power.supply`: every motor's, heater's and board's draw at the task's duty against the supply.
- **Wires in the assembly**: `"wires": [{ "from": "elbow_motor.connector", "to": "board.Y", "via": ["chain"],
  "gauge": "awg22" }]`. The kit measures the route through the poses (longest at full stretch), adds service loop,
  checks the gauge against the current, and lists each wire with its length and connectors. A `path` joint already
  models a flexible route; a cable can use it.
- **A controller board from rules** where none fits: the pcb package can draw a breakout that sits on the Uno's
  headers with the right connectors facing the right way, as it does for keyboards. For most people the CNC shield is
  the answer and should simply be a rule set with a drawing.
- A **wiring sheet** in the exports: the connections, colours and connector pinouts as a page, drawn from the same
  data as the shopping list.

### 3.7 Thermal, and the printer's safety

**Today:** `motor.heat` compares a motor's case temperature with the filament's softening point.

**Needed (3D printer, and an arm or plotter only where drivers sit in a printed box):** a hot end's heat break must
keep its PTFE and its printed mount below their limits; a printed fan duct must not melt; a heated bed must not warp
a printed frame member; a stepper driver in a closed printed case overheats. Beyond heat: a heater's wiring, a
thermistor coming loose and a failed MOSFET are how printers catch fire, and firmware thermal runaway protection is
what prevents it.

**Ideal implementation:**

- `heat` as a general item property (a source, its watts, where it is), with conduction along the part to each
  printed face and a temperature against the material's limit at the nearest printed point; convection by rule of
  thumb (fan or not). A crude 1D or coarse 3D conduction on the kit's existing voxel grid would be enough to catch the
  usual mistakes (PETG within 15 mm of a heater block).
- A **safety list** for any assembly with a heater or mains: the firmware's thermal protection on, a fuse by rule, a
  thermistor fixed by a screw not glue, a heater with a strain relief. Mostly words, generated once, checked off in the
  print log.

### 3.8 Calibration and measurement: closing the loop

**Today:** the bench has `MEASURE.md` (twenty measurements, written for a person) and `results.json` filled in by hand;
`cad printed` logs a print's outcome; `rules.estimate` warns that an assembly rests on estimates.

**Needed:** the whole point of a bench is that measured numbers replace estimates and the predictions move. Today
that is a person editing JSON. It should be one command whose effect is visible.

**Ideal implementation:**

- **`cad measured <project>/<assembly> <name>=<value> [--source "…"]`**: writes a `measured` rule (kind, value, date,
  who) into the project's rules, re-runs the checks that read it and prints what changed: "shoulder backlash 0.35°
  (was estimate 0.5°): pen error at the far corner 0.9 mm to 0.7 mm".
- **A measured-against-predicted ledger** per machine, kept by the kit, not by hand: each prediction the checks make
  that the bench can measure, its figure, the measurement when it arrives, the ratio. It shows as a table in the
  model page's Rules panel and in `cad history`.
- **Coupons generated for the machine**: the fit bar, the gear card and the seats coupon (3.1) built from the
  machine's own bores, modules and bearings, so the first print is always the test print for that design, in the
  filament it will use.
- **Calibration moves** in the streamer: a 100 mm square and a circle at three places on the sheet, with the
  predicted error next to the measured one, written back with `cad measured`.

### 3.9 Build: from a checked assembly to a finished machine

**Today:** plate assemblies are written by hand; `cad export` writes a 3MF per object or plate; references are drawn
faint; there is no parts list, no mass or filament figure, no assembly order.

**Needed:** a machine has thirty printed parts and sixty bought ones. A person needs to know what to buy, how much
filament it takes, how to lay the parts on beds, and the order to put it together without trapping a nut behind a
wall.

**Ideal implementation:**

- **A shopping list** from the references and bought items: part, quantity, the rule set it came from, with any
  measured alternatives. The pcb package already emits a BOM; the format can be shared.
- **Grams and minutes per part** from the mesh's volume, the filament's density and a layer estimate, reported by
  `cad check` so "design small" is seen in numbers, and a total for the machine.
- **`cad plates <project>/<assembly>`**: packs every printed part of an assembly onto beds in its print orientation,
  grouped by filament, respecting the first-layer gap rule, and writes the plate assemblies so they are checked as
  prints. A change to a part re-packs only its plate.
- **Assembly order** from the fits and joints: a part fastened into another must go in after it; a nut trapped by a
  wall must go in before the wall's neighbour; the output is an exploded preview per step with the fasteners named
  (the `fastens` notes already carry them).
- **A build page** in the link: the shopping list, the plates, the wiring sheet, the assembly steps and the firmware
  settings in one place beside the model, so the link is the whole project.

### 3.10 Teaching and templates

**Today:** EXAMPLES has eleven chapters up to a robot joint; AGENTS.md guides an agent part by part; `npm create
rulecad` gives a soap tray.

**Needed:** someone starting a machine needs a worked example of exactly that and a template that already has its
joints, task and motors in place.

**Ideal implementation:**

- EXAMPLES chapters 12 to 14: the arm (task, reach, budget, build), the plotter (CoreXY belts, GRBL), and the printer's
  motion system (an extruder through the gears package, a frame, a Klipper configuration).
- **Machine templates**: `npm create rulecad my-arm --machine scara`, sized from a sheet and a reach; the plotter from
  a sheet; the printer from a bed. Each a checked assembly with a task, its coupons, its plates and its firmware
  target, ready to print.
- AGENTS.md gains a "machines" section: task first, reach before shape, bench before trusting a budget, never set a
  driver's current from memory.

## 4. Putting the gaps in order

The arm is the main project and most of the work serves all three machines. In the order it should be built:

| Step | Gaps | Why here | Machines | Needs numbers |
|---|---|---|---|---|
| 1. Catalogue and seats | 3.1 | everything else places these parts | A, P, 3D | the seats coupon gives the fits |
| 2. Task, inverse kinematics, reach | 3.2 | sizes the arm before anything is drawn | A, P, 3D | no |
| 3. Joint moments and bearings | 3.4 (moments, bearing loads) | the shoulder's design depends on it | A, 3D | FE on the printed location; bench test 15 (the shoulder under load) |
| 4. Error budget | 3.3 | says whether the gearbox is good enough | A, P, 3D | tests 14 and 15 |
| 5. Machine description, targets, plot | 3.5 | the first drawing | A, P | no |
| 6. Drivers, power, wires | 3.6 | the first wiring without a burnt driver | A, P, 3D | no |
| 7. Measured and the ledger | 3.8 | predictions become trustworthy | A, P, 3D | the bench, as it is measured |
| 8. Shopping list, grams, plates, order, build page | 3.9 | the machine as a project someone else can build | A, P, 3D | no |
| 9. Link stiffness and frequency | 3.4 (deflection, frequency) | the second arm, and any printer | A, 3D | FE at fine cells against tests 15 and 17 |
| 10. Thermal and safety | 3.7 | the printer | 3D | no |
| 11. Examples and templates | 3.10 | other people | all | after the arm has drawn |

Steps 1, 2, 5 and 6 can start before the bench is measured; 3, 4, 7 and 9 should not be trusted until it is. The
plotter falls out of steps 1, 5, 6 and 8 plus CoreXY belt geometry (a routing of belt length and idler positions that
the task's size sets). The printer adds 3.7, the extruder (a gear pair the gears package can already check), the frame
from extrusion, and a firmware target.

## 5. Outside the box: what would make this unusual

- **The task is the top of the design, not the parts.** Today a design starts from a part; a machine should start from
  "draw on A4 to 0.3 mm at 50 mm/s" and the kit says what reach, ratio, motor and stiffness that takes, before anything
  has a shape. Sizing from the task is also the honest way to design small.
- **One assembly, every output.** Firmware settings, wiring, the shopping list, plates and assembly steps all read
  the same assembly, so they cannot disagree with each other or with the model. Retries today come from the human
  copying numbers between those documents.
- **Predictions that expect to be measured.** Every figure in a check is labelled by where it came from, and the
  machine's own coupons and calibration moves exist to replace the labels with measurements. A machine whose safety
  path rests on an estimate refuses to pass.
- **Watch it before you print it.** The planned drawing plays on the model in the browser, with the pen's line
  coloured by predicted error; the moment panel shows the shoulder's margin as the arm stretches. Observability means
  the person sees the same thing the check computed.
- **The kit learns the printer.** Measured fits, backlash and twist written back per filament and printer become the
  defaults for the next design on the same machine, so the second arm's first print is right.

## 6. What this does not propose

- Full rigid-body dynamics, path optimisation for speed, or gait. A drawing arm moves slowly and flat. These belong
  to a later plan when the arm lifts loads or walks.
- Writing a general firmware. GRBL, Marlin and Klipper exist; the kit configures them. The Uno streamer is the
  minimum to test the arm, not a product.
- Vendor CAD. Every bought part is drawn from its datasheet's dimensions, as the motors are, so the catalogue stays
  open data.
- Closed-loop control or encoders in the first arm. Steppers with a budget that is measured are enough to draw; an
  encoder set (AS5600) is in the catalogue for when they are not.

## Glossary

- **SCARA**: an arm with two vertical-axis revolute joints in a horizontal plane, stiff vertically, used for pick and
  place and drawing.
- **CoreXY**: a belt arrangement where two fixed motors move one carriage in X and Y together, each axis a sum or
  difference of the two motors.
- **Inverse kinematics**: finding the joint angles that put the tool at a wanted position; forward kinematics is the
  reverse, which rulecad's poses already do.
- **Error budget**: the sum of every source of position error at the tool, so the biggest can be found and fixed.
- **Overturning moment**: the tipping load on a joint at right angles to its axis, carried by its bearings or clips,
  not by its motor.
- **Vref**: the reference voltage on a stepper driver that sets the motor current.
- **GRBL**: open firmware for small CNC machines on an Arduino, configured by numbered `$` settings.
- **Coupon**: a small test print whose measurements calibrate a design for a printer and filament.

## Sources

- rulecad on 2026-11-09: `packages/cad/README.md` (assemblies, joints, motors, checks), `packages/motors/README.md`,
  `packages/gears/README.md`, `packages/fea/README.md`, `packages/pcb/README.md`, `packages/printcheck/README.md`,
  `examples/bench/projects/benchmarks/MEASURE.md` (bench tests referred to by number).
- GRBL settings: https://github.com/gnea/grbl/wiki/Grbl-v1.1-Configuration
- Marlin SCARA support: https://marlinfw.org/docs/configuration/configuration.html (search "SCARA")
- Klipper kinematics and configuration: https://www.klipper3d.org/Config_Reference.html
- GT2 belt geometry (2 mm pitch, pitch line offset 0.254 mm): Gates PowerGrip GT2 drive design manual.
