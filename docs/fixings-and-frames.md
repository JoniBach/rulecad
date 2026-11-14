# Fixings and frames: screws, beams and fittings from rules

A specification for two additions to rulecad, and for moving the rest of the kit onto the first of them. **Fixings**
are screws, nuts, washers and inserts, the holes and seats they need, and a way to say in an assembly that two parts
are screwed together. **Frames** are structures built from beams: aluminium extrusions of any maker's profile, plain
tubes and angles, or beams printed in plastic, with the brackets, nuts, mounts and linear guides that attach to them,
checked as a structure before anything is cut. Written against rulecad as published on 2026-11-14 (cad 0.7.46,
motors 0.1.5, rules 0.3.9, shapes 0.4.4). Nothing described here is built yet.

The work is three plans, each with its own tickets:

| Plan | What it adds | Tickets |
|---|---|---|
| Fixings ([#212](https://github.com/JoniBach/rulecad/issues/212)) | Thread rule sets, a new package `@rulecad/fixings`, and a `fasten` relation in assemblies | Fixings 1 and 2 |
| Migration (part of [#212](https://github.com/JoniBach/rulecad/issues/212)) | Motors, shapes, pcb, cad, the examples and the templates read fixings, with every changed dimension listed | Fixings 3 |
| Frames ([#240](https://github.com/JoniBach/rulecad/issues/240)) | Profile rule sets, a new package `@rulecad/frames`, beams, joins and guides in assemblies, and a beam solver | Frames 1, 2 and 3 |

Fixings comes first because frames is built on it: a frame is mostly screws and nuts.

## Decisions taken

- **Two new packages.** `@rulecad/fixings` depends on JSCAD, `@rulecad/rules` and `@rulecad/shapes`.
  `@rulecad/frames` depends on JSCAD, `@rulecad/rules`, `@rulecad/shapes` and `@rulecad/fixings`. The beam solver
  goes in `@rulecad/fea`, so the optimiser's tube frames (issue 41) can share it. Each new package ships alone and is
  published once by hand before anything depends on it.
- **The package is called frames.** "Extrusion" already means filament leaving a nozzle, and a 3D printer project
  will use both words every day.
- **Any constant section is a profile.** T-slot, V-slot, the small 10 and 15 mm beams, inch series, square and round
  tube, angle, channel, flat bar, and a section nobody has listed yet all use one description. Slots are a feature a
  profile may have, so nothing is shut out.
- **One maker, one rule set.** A "2020" from two makers has different slots. Each maker's profile is its own set with
  its own sources, and a generic set marked `community` stands in for unbranded stock until it is measured.
- **The kit draws its own outlines.** A profile's shape is drawn from its interface dimensions. A maker's CAD model
  may be measured into rules in a person's own workspace, and is never copied into the kit.
- **Metric and inch.** Thread sets cover ISO metric and unified inch sizes. PC cases use 6-32 beside M3, and inch
  T-slot uses 1/4-20 and 5/16-18.
- **Numbers below, rules above.** `@rulecad/shapes` keeps its helpers that take plain dimensions. `@rulecad/fixings`
  looks the dimensions up from rules and calls them. Nothing in shapes changes its drawn result.
- **One relation for a screwed joint.** `fasten` covers part to part, part into a slot, and beam to beam. The nut,
  the screw's length and the shopping list follow from it.
- **Threads are data first.** A tapped hole in metal is a line on a drill sheet. A thread in plastic below about M6
  is a pilot hole, an insert or a captive nut. Modelled threads are for large printed threads and are off by default.
- **Motion is open.** Linear rails, V-wheels, rods and printed sliders are all `guides`. Each becomes an ordinary
  sliding joint, so poses, sweeps, loads and the error budget work as they do today.
- **Estimates say so.** Pilot sizes, slot fits and the stiffness of a joint start as `community` or `estimate`. Each
  plan has a printed coupon or rig that replaces them with `measured` rules through `cad measured`.
- **Migration changes no dimension silently.** Each migration change lists every drawn size that moves, and a test
  holds the rest still.

Standards every ticket inherits, as for gears, motors and robots: findings in the one shape (`at`, `box`,
`between`); bad input refused by name before any maths; values and units through the one grammar; schema first; no
dependency cycles; slow work as cached stages; heavy work off the page's thread; docs that stand alone with a
formulas table and sources; a worked example replayed by a test; print-ready without supports, no square corners,
mechanisms shown at rest; every fix with a test that fails without it, on every platform; designs as small as the
load allows, with a simple solid first layer and grams and margin reported per part.

## 1. Where the kit stands

An inventory of the repository on 2026-11-14:

- **Thread rule sets are thin.** `m1_6`, `m2`, `m3`, `m4` and `m5` hold three to five values each (a clearance, a
  head, sometimes a nut or an insert). None has a `part`, so `cad rules check` holds them to nothing. There is no
  pitch, tap drill, pilot, second head form, washer, or any size above M5.
- **Motors keeps a private table.** `@rulecad/motors` maps thread names to those sets itself. No other package can
  ask what an M3 screw is.
- **Designs repeat the arithmetic.** 116 variables in 54 example and template objects describe a screw by hand, and
  66 more in the worked examples. `m3.clearance + x1c.hole_comp` is written out 46 times. An M3 self-tapping pilot is
  typed as `2.9` forty times.
- **A measured result has nowhere to go.** The fit bar measured M3 pilots (2.9 and 3.0 mm drawn both hold a screw
  straight in PLA). It is recorded in a table and read by no design.
- **Screws are missing from the shopping list.** `cad list` counts motors, bearings and drivers. It counts no
  screw, nut or insert, and the build page tells the reader to keep an assortment.
- **A joint is two unrelated statements.** A `"fastens": true` fit says two parts are held. A `holes` fit says
  holes line up. Neither knows the screw, so nothing checks its length, its thread engagement or whether a key
  reaches it.
- **There are no beams.** No rule set describes a profile, and no item kind has a length. The gap analysis for
  machines (`docs/robots-gap-analysis.md`) lists 2020 and 2040 extrusion, T-nuts and brackets as needed for a
  plotter and a printer.

What already exists and is reused: rule sets with sources and kinds, `cad rules check` and `cad rules draw`, bought
items in assemblies with a shopping list, joints, poses and sweeps, loads and motor checks, `cad measure` for a
model from elsewhere, `cad measured` and its ledger, `cad plates`, `cad order` and the build page, and finite
elements on voxels in `@rulecad/fea`.

## 2. Fixings

### 2.1 Data: one rule set per thread

Each thread size is a rule set in `@rulecad/rules` with `"part": "thread"`, holding everything that hangs off that
thread. The existing names (`clearance`, `head`, `head_height`, `nut_flats`, `nut_height`, `insert_hole`,
`insert_length`) stay and keep their values.

| Group | Fields | Standard to cite |
|---|---|---|
| Thread | major diameter, pitch, fine pitch where common, tap drill, thread form | ISO 261, ISO 262, ISO 724; ASME B1.1 for inch |
| Holes | clearance close, normal and loose | ISO 273 |
| Socket cap head | head diameter and height, key size | ISO 4762 |
| Button head | head diameter and height, key size | ISO 7380-1 |
| Countersunk | head diameter, angle, key size | ISO 10642 |
| Hex head | across flats, head height | ISO 4017 |
| Nuts | hex across flats and height, square, locking | ISO 4032, DIN 562, DIN 985 |
| Washers | outer diameter and thickness | ISO 7089 |
| Set screws | key size, point | ISO 4026 |
| Lengths | the lengths the screw is sold in | the same standards |
| Strength | property class and its proof stress | ISO 898-1, ISO 3506-1 for stainless |
| Inserts | outer diameter, length, hole, taper, least wall | the maker's sheet, `community` |
| In plastic | the pilot a screw cuts its own thread in | `community`, then `measured` per printer and material |

Sizes: M1.6, M2, M2.5, M3, M4, M5, M6, M8, M10 and M12; and 4-40, 6-32, 8-32, 10-24, 10-32, 1/4-20, 5/16-18 and
3/8-16. Screws made for plastic (thread-forming screws with a coarse thread) get their own sets, since their pilot
rule differs.

A pilot depends on the printer and the plastic as well as the screw. The thread set holds a starting figure, and a
measured one lives with the printer, as `x1c.pilot_m3`, written by `cad measured` from the coupon in 2.5.

### 2.2 The package: `@rulecad/fixings`

It follows the pattern `@rulecad/motors` set: a model made from rules, then pairs of functions where one returns the
numbers with findings and the other the solid to cut or show.

| Function | Gives |
|---|---|
| `fixingModel('M3')`, `fixingModel('M3x12 cap')`, `fixingModel('1/4-20')` | A thread, or a whole screw, as a model from its rule set, with overrides |
| `hole(m, { kind })` and `holeModel` | A cutting solid for `clearance`, `close`, `loose`, `pilot`, `tap`, `insert` or `thread`, with the printer's hole compensation and a teardrop where it lies on its side |
| `counterbore`, `countersink` | A seat for a cap, button, hex or countersunk head, with the depth that hides it |
| `nutPocket`, `nutTrap`, `squareNutSlot` | A pocket from one face, or a slot from the side, with a fit from the printer |
| `insertBoss` | A boss with the hole an insert melts into and the least wall round it |
| `screw`, `nut`, `washer`, `insert` | Light reference solids for an assembly, drawn faint as bought parts are |
| `thread(m, { length, internal })` and `threadModel` | A real thread to print (2.4) |
| `engagement`, `stripping`, `preload`, `seating` | Whether enough thread is engaged, the load that strips it, the clamp force from a tightening torque, the pressure under the head |
| `lengthFor(stack, m)` | The sold length that passes through a stack and engages enough at the far end |
| `printable(m)` | What a printer can make of it, as findings |

Refusals are by name: a thread nobody has a set for, a head form that size is not made in, a length nobody sells, a
pocket deeper than the part.

Formulas the README states with their sources: thread engagement and stripping area (Machinery's Handbook, VDI
2230), preload from torque (T = K d F, with K from a rule), and bearing pressure under a head.

### 2.3 In assemblies: `fasten`

Designs get `v.fixings`, so a part writes `v.fixings.hole('M3', { kind: 'pilot' })` in place of a typed number.

An assembly gets one relation:

```json
"fasten": [
  { "screw": "M3 cap", "through": ["bracket"], "into": "base", "at": ["bracket.h1", "bracket.h2"] },
  { "screw": "M5 button", "through": ["plate"], "into": "x1.top", "holes": "plate.body", "nut": "drop-in" }
]
```

`through` lists the parts the screw passes in order, `into` is where it ends (a part, or a slot on a beam, see 4.5),
and `nut` says what holds it there when the part itself does not. A length may be given; without one the relation
chooses it. Reference screws, nuts and washers are placed in the model as bought items.

| Finding | What it checks |
|---|---|
| `fasten.holes` | The holes share an axis through the whole stack |
| `fasten.clearance` | Each hole passed through is a clearance hole for this thread, as drawn |
| `fasten.end` | The far end is a pilot, a tapped hole, an insert or a nut of this thread |
| `fasten.length` | The chosen length is sold, reaches, and does not bottom out or stand proud |
| `fasten.engagement` | Enough thread is engaged for the material it is in |
| `fasten.seat` | The head has a flat seat as wide as itself, and the pressure under it is within the material |
| `fasten.access` | A key or driver reaches the head along its axis with every other part in place |
| `fasten.load` | With loads or a motor's torque on the joint, each screw's shear and tension against its strength and the thread's |
| `fasten.count` | Every screw, nut, washer and insert, onto the shopping list |

A `fasten` implies the parts are held, so it stands in for a `"fastens": true` fit, and it carries the alignment a
`holes` fit checks. Both older forms keep working. `cad order` places the screws in the build sequence, and
`cad list` sums them by thread, length and head, rounded up to the packs they are sold in.

### 2.4 Threads cut for printing

`thread()` draws ISO metric, unified and trapezoidal threads (ISO 2904, the form of a T8 lead screw), internal and
external, with a clearance from the printer, a lead-in chamfer, and flanks no steeper than the printer's overhang
when the axis is upright. `threadModel` refuses a pitch finer than the printer resolves and says which size would
print. In the viewer and in links a thread is shown only when `display` asks for it, since it adds many triangles.

### 2.5 The fixings coupon

One small print, measured once per printer and plastic: pilots for each thread at five diameters, insert holes at
three, nut pockets and traps at three fits, a counterbore, and M6 to M12 printed threads at three clearances. Each
row has a line in the measuring sheet, and `cad measured` writes the result to the printer's rule set, where every
design then reads it.

## 3. Migration: fixings into the rest of the kit

The order follows the dependencies, and each step is one pull request that can be released on its own.

| Step | Package | What changes | What must not change |
|---|---|---|---|
| 1 | rules | Thread sets gain fields and `"part": "thread"`; old names stay | Every existing value |
| 2 | fixings | Published alone | Nothing depends on it yet |
| 3 | cad | `v.fixings`, `fasten`, the list and the order | Assemblies without `fasten` check as before |
| 4 | motors | The private screw table goes; `mount()` cuts through fixings; a motor's tapped holes get an engagement check | The solid `mount()` cuts, to the last face |
| 5 | shapes | Its README points to fixings for anything named by a thread; `countersink`, `nutPocket`, `nutTrap` and `teardropHole` stay as they are | Every drawn result |
| 6 | pcb | Mounting holes, standoffs and inserts read thread sets; a board in a case can use `fasten` | Fabrication output |
| 7 | examples and templates | Typed pilots and clearances become `v.fixings` calls; assemblies gain `fasten`; screws appear in the lists | Sizes, unless listed in the pull request |
| 8 | worked examples | The chapters of `EXAMPLES.md` and `TUTORIAL.md` are rewritten the same way and replayed | What each chapter's check says |
| 9 | the rest | Gears, flexures and the docs site are swept for typed screw sizes; release notes list every behaviour change | |

Three guards make this safe:

- **An inventory test.** A script counts every screw dimension typed by hand across packages, examples, templates
  and docs. The count is recorded, each migration step lowers it, and a test fails if it rises.
- **A dimension diff.** Before and after each step, every example object is built and its hole diameters, pocket
  sizes and volume are compared. The pull request carries the table. An empty table is the normal case.
- **One measured change, on purpose.** Where a typed `2.9` becomes the measured pilot rule, the size stays 2.9 mm
  on the X1C because that is what was measured. A workspace with another printer gets its own figure, which is the
  point of the change.

After step 8 the shopping lists for the arm and the leg count their M3 screws, and the sentence telling the builder
to keep an assortment goes.

## 4. Frames

### 4.1 Profile rule sets

A profile is a rule set with `"part": "profile"`, read at three levels. Only the first is required.

| Level | Fields | Used for |
|---|---|---|
| Interface | family, series, cells across and up, width, height, corner radius; per slot: opening, lip thickness, cavity width and depth, the nut family it takes; bores: diameter, the thread each taps to, positions | Drawing the beam, generating every fitting, choosing nuts and screws |
| Section | area, the two second moments, torsion constant, mass per metre, alloy and temper | The beam solver, the cut list's mass |
| Outline | The exact section as closed outlines, measured from a model | Looks, printed beams, and checking the section figures |

Supply fields sit beside them: the lengths it is sold in, the tolerance on a cut, straightness and twist per metre.

Slots are described once per slot family (`slot-5`, `slot-6`, `slot-8`, `slot-10`, `v-slot`, the small beams' slots,
the inch series' slots) and a profile names the family for each face. A face may be closed, and a profile may mix
families. Larger sections are cells of a base profile (`"cells": [2, 1]` for a 2040), with any face overridden.

Families the vocabulary covers from the start:

| Family | Examples | Notes |
|---|---|---|
| Metric T-slot | 20, 30, 40 and 45 mm series, single and multiple cells, light and heavy | Slot 5, 6, 8 or 10 by maker: Bosch Rexroth, item, MISUMI, Motedis and unbranded stock each get sets |
| V-slot | 2020 to 2080, C-beam | Faces that wheels run on, with the wheel's track as a field |
| Small beams | MakerBeam (10 mm), MakerBeamXL and OpenBeam (15 mm) | M3 hardware; OpenBeam takes a plain nut in its slot |
| Inch T-slot | 1 inch and 1.5 inch series | 1/4-20 and 5/16-18 hardware |
| Plain sections | Square, rectangular and round tube, angle, channel, flat bar, round bar | No slots: fastened through drilled holes, clamps and printed saddles |
| Printed | The printable profiles of 4.9 | Material from the project's filament |
| Custom | Any closed outline | Section figures computed from the outline |

Three commands support adding one from a spec sheet:

- `cad rules draft profile <name>` writes a set with every field of the vocabulary, each marked `estimate`, for a
  person to fill from the sheet with its source and the date.
- `cad rules check` holds it to the vocabulary, computes the section figures from the drawn outline and warns where
  the sheet's differ by more than a few percent.
- `cad rules draw` draws the section with its slot dimensions, to hold against the sheet.

`cad measure <model> --profile <name>` does the same from a maker's model: `cad measure` already finds a stretch of
constant section, so the outline, the slots and the bores are read from it and written as draft rules in the
workspace, with the model's source and licence.

Section figures from an outline: area and second moments by the polygon formulas, and the torsion constant by
solving the stress function over the section, because a slotted section twists far more easily than its polar
moment suggests.

### 4.2 Beams in assemblies

A beam is an item with a profile and a length:

```json
{ "id": "x1", "beam": { "profile": "2020-misumi-hfs5", "length": 300 }, "from": [0, 0, 0], "to": [300, 0, 0] }
```

It may be placed by its two ends with a roll about its axis, or with `at` and `rotate` as any item is. A beam is
bought by default and goes on the cut list; `"printed": true` makes it a printed part (4.9). `"material"` overrides
the profile's alloy, so one frame can be checked in aluminium and in plastic.

Every beam has addresses along its faces, so anything can be attached by saying where:

- `x1.a` and `x1.b` are its ends, and `x1.a.1` a bore in an end.
- `x1.top@120` is the slot on its top face, 120 mm from end `a`; `@-20` counts from end `b`, `@50%` is the middle.
- `x1.top.2@120` is the second slot of a face that has more than one.

The grammar is settled, schema first, in the ticket that adds beams.

### 4.3 Operations on a beam

A beam carries a list of operations, each a line on its cut-and-drill sheet and a cut in its solid.

| Operation | What it is | Usual reason |
|---|---|---|
| `cut` | Square cut to length | Every beam |
| `mitre` | An end cut at an angle, about a named face | Mitred corners, braces |
| `tap` | A thread cut in an end bore | End-tapped and blind joints |
| `access` | A hole across the beam, in line with a slot, for a key | Blind joints |
| `drill` | A hole through one wall or right through, plain or tapped | Bolting through, panels, wires |
| `counterbore` | A seat for a head in a face | Anchor and hidden connectors |
| `pocket` | A milled pocket by outline | Anchor connectors, switch cut-outs |
| `notch` | Part of a lip cut away | Loading a nut mid-span |
| `deburr` | Named so the sheet asks for it | Every cut end |

On a printed beam the same operations become features of the print, and an end `tap` becomes an insert or a captive
nut. Most operations are not typed: a join (4.4) or a guide (4.7) puts them on the right beams.

`cad beams <project>/<assembly>` writes a sheet per beam: its profile, length, each operation dimensioned from end
`a`, and which face is up. `cad list` gains the cut list: lengths by profile, packed into the lengths the profile is
sold in with the saw's kerf, the bars to buy, and their mass.

### 4.4 Joins

Beams are joined by a relation separate from `joints`, which stay for things that move:

```json
"joins": [{ "kind": "blind", "a": "y1.a", "b": "x1.back@0" }, { "kind": "bracket", "a": "z1.a", "b": "x1.top@0", "fitting": "printed" }]
```

| Kind | What it derives |
|---|---|
| `blind` | A tap in the end of `a`, a button-head screw in its end, the head in `b`'s slot, an access hole across `b` |
| `end-tap` | A tap in the end of `a` and a screw through a drilled hole in `b` |
| `bracket` | A corner bracket, printed or bought, with its slot nuts and screws |
| `gusset` | A flat plate (L, T or cross), printed or bought, over the joint |
| `cube` | A three-way corner taking three beam ends |
| `hidden` | A bought inner connector in the slots |
| `anchor` | A bought anchor connector and its pocket |
| `mitre` | Two mitred ends and a corner key or plate |
| `pivot` | A hinge or pivot joint, which also adds a `joint` |
| `splice` | Two beams end to end, with a joining plate |
| `printed` | A printed node that sockets the beam ends |

Each kind adds its operations to the beams, its fittings and fixings to the list, its `fasten` relations to the
checks, and a stiffness to the solver. `join.geometry` checks that an end really meets a face square and flush,
`join.end` that every beam end is joined or capped, and `join.stiffness` says what the joint's stiffness rests on.

### 4.5 Slot nuts and fastening into a slot

Slot nuts are rule sets by slot family, thread and kind: slide-in, drop-in, roll-in with a spring, hammer-head, a
T-bolt, a plain square or hex nut where the slot takes one, and a printed carrier that holds a hex nut or an insert.

A `fasten` whose `into` is a slot address picks the nut for that slot and thread. Two checks follow that people
usually meet too late:

- `frame.nut`: a slide-in nut needs an open end. If both ends of that slot are closed by joins, the check says so
  and names the drop-in that would do.
- `frame.preload`: the nuts that must be in a slot before a join closes it, by beam and face, in the build order.

A part with several holes fastened into slots is checked for its holes lying over a slot (`fasten.slot`), which
catches a plate drawn for 20 mm between slots on a profile with 30.

### 4.6 Fittings

Every printed fitting is generated from the profile's and the thread's rules, prints without supports, and has a
model function that says what it was drawn to and what load it takes. Bought equivalents are rule sets, and a join
or mount chooses printed or bought.

| Group | Fittings |
|---|---|
| Joints | Corner bracket, gusset plates (L, T, cross), three-way corner, hidden-corner cover, pivot, hinge, splice plate, printed node |
| Nuts | Printed nut carrier, slide-in strip with several nuts at a pitch |
| Ends and feet | End cap, foot, levelling foot, castor plate, stacking foot |
| Panels and doors | Panel clip, in-slot panel edge, panel corner, hinge, handle, latch, magnet catch, slot cover, gasket strip |
| Motion | Rail alignment jig, wheel carriage plate, rod holder, lead-screw bearing block, nut block, motor plate, idler and tensioner, endstop mount, belt anchor |
| Services | Cable clip, cable tie anchor, drag-chain end, board mount, supply mount, fan mount, DIN-rail adapter, spool holder |
| Jigs | Drill guide for access holes, tap guide, cut-length stop, squaring corner |

The jigs matter as much as the parts: a printed guide that clips over a beam's end and puts the access hole exactly
where the sheet says is how a hand drill meets a drawing.

### 4.7 Guides

A guide puts linear motion on a beam and produces an ordinary sliding joint with its true travel.

| Kind | Rule sets it reads | What it derives |
|---|---|---|
| `rail` | Miniature rails and carriages (MGN7, 9, 12, 15 and their long and short carriages) | Nuts at the rail's hole pitch, the screws, an alignment jig, travel from the rail and carriage lengths |
| `wheels` | V-wheels, eccentric spacers | A carriage plate for the profile, three or four wheels, the preload adjustment, travel |
| `rods` | Rods, linear bearings, rod holders | Holders on the beams, the bearing seats in the carriage, travel |
| `slider` | The slot family, a bearing plastic | A printed slider running in the slot, its clearance from the printer |
| `screw`, `belt` | Lead screws and nuts, belts and pulleys, already in the catalogue | Bearing blocks, a motor plate, a tensioner; the drive ratio the motor checks read |

Each guide's bearings carry the loads the assembly already knows, checked against their ratings as `joint.moment`
is today, and each adds its terms (straightness, clearance, the beam's own sag) to a machine's error budget.

### 4.8 Checks on a frame

The frame is solved as beam elements joined at nodes, with a rotational spring at each join. It is supported at its
feet, loaded by gravity on every beam and item, by the loads the assembly names, and by its moving masses at each
pose.

| Finding | What it says |
|---|---|
| `frame.deflection` | The sag at named points and at every guide, against a limit from the task or a rule |
| `frame.stress` | The worst bending stress in each beam and the moment at each join, against the material and the fitting |
| `frame.buckling` | Each beam in compression against its buckling load |
| `frame.frequency` | The lowest modes, against the frequencies the machine excites |
| `frame.rack` | How far an unbraced bay sways under a side load, and what a brace, gusset or panel would do |
| `frame.square` | The diagonal error that cut tolerances and joint play allow, and the two diagonals to measure when building |
| `frame.heat` | Printed fittings near a heater or inside an enclosure, against the plastic's softening point |
| `frame.cut` | Lengths against the sold lengths, the saw's kerf and tolerance |

The solver is new in `@rulecad/fea`: three-dimensional beam elements with shear, joined rigidly, pinned or through a
spring, with static, buckling and modal solves, verified against textbook cases (a cantilever, a portal frame, a
simply supported beam under a spread load) and against the voxel solver on a short beam. A frame of a few dozen
beams solves in milliseconds, so the checks run at every pose.

A joint's spring is the honest unknown. A printed bracket is far softer than the beam it joins, so the frame's
stiffness is set at its corners. Each join kind starts with an estimate, and the joint rig (a beam cantilevered
from one join, a known mass hung from its end, the drop measured) replaces it through `cad measured`.

### 4.9 Printed beams

Aluminium is about twenty times as stiff as PLA and does not creep, so a printed beam suits a case or an enclosure
and seldom a gantry. The checks decide per beam: with the material as a variable, `beam.printable` reports which
beams of a frame can be printed within its deflection, frequency and creep limits.

- **Printable profiles.** A standard slot has ceilings that print in mid-air when the beam lies down. The printed
  profiles are rule sets of their own, with slot roofs at the printer's overhang angle, that still take the
  standard nut of their slot family.
- **Two ways up.** Lying down, the layers run along the beam and it is strong in bending. Standing up, the section
  is exact and the beam is short and weak across its layers. The beam says which, and the check uses the matching
  strength.
- **Longer than the bed.** A beam that does not fit is spliced: a keyed joint drawn into both halves, placed away
  from the greatest bending moment.
- **Ends.** An insert or a captive nut in place of a tap, with the wall round it from the thread's rules.
- **A beam coupon.** A short printed beam bent between two supports gives the stiffness and strength the checks
  use, by `cad measured`.

### 4.10 Generated frames and kits

A frame can be asked for by what it is for:

```json
"frame": { "kind": "box", "inside": [300, 300, 350], "profile": "2020-misumi-hfs5", "join": "blind", "feet": "levelling" }
```

Generators for a box, a portal, a table, a gantry on a base and a shelf expand into beams and joins, as the
planetary composer expands into gears, and the result stays editable. `"inside"` sizes the frame round a volume it
must enclose and `"outside"` within one it must fit. A sizing step can then choose, beam by beam, the lightest
profile from a list that meets the deflection and frequency limits.

A kit is everything a person needs to build it: `cad plates` lays out the printed fittings, `cad list` gives the
cut list, the fixings and the bought parts, `cad beams` the sheets, and the build page the order, the nuts to load
first and the diagonals to measure. `npm create rulecad my-frame --machine frame` starts from a working box.

## 5. What stays open for the printer

A 3D printer is a later plan. This one is written so that plan chooses freely:

- Any frame: every profile family, printed or bought fittings, generated or drawn by hand.
- Any motion: rails, wheels, rods or sliders on any axis, driven by belt or screw.
- Panels, doors and an enclosure, with `frame.heat` for printed parts inside it.
- The frame in the error budget: sag and squareness reach `task.accuracy`, and the lowest mode is there to compare
  with the speeds the machine runs at.

Left for that plan: belt paths for the common layouts, the bed, the hot end and extruder, heating and its safety,
and firmware.

## 6. Order of work and tickets

Each milestone ships on its own. Tickets marked (person) need a print, a purchase or a first publish by hand.

**Fixings 1: holes and hardware from rules**

| Ticket | What | Issue |
|---|---|---|
| Fixings 1.1 | Thread rule sets, widened: M1.6 to M12, with a vocabulary, a check and a drawing | [#213](https://github.com/JoniBach/rulecad/issues/213) |
| Fixings 1.2 | Rule sets for inch threads, inserts, screws for plastic and the pilot they cut | [#214](https://github.com/JoniBach/rulecad/issues/214) |
| Fixings 1.3 | @rulecad/fixings, a new package: a fixing as a model from its rules | [#215](https://github.com/JoniBach/rulecad/issues/215) |
| Fixings 1.4 | Holes by purpose: clearance, pilot, tapped, insert | [#216](https://github.com/JoniBach/rulecad/issues/216) |
| Fixings 1.5 | Seats: counterbore, countersink, nut pocket, nut trap, insert boss | [#217](https://github.com/JoniBach/rulecad/issues/217) |
| Fixings 1.6 | Reference hardware: screws, nuts, washers and inserts as light solids | [#218](https://github.com/JoniBach/rulecad/issues/218) |
| Fixings 1.7 | Threads cut for printing | [#219](https://github.com/JoniBach/rulecad/issues/219) |
| Fixings 1.8 | Strength and length: engagement, stripping, preload, and the screw that fits a stack | [#220](https://github.com/JoniBach/rulecad/issues/220) |
| Fixings 1.9 | Refusals by name, printability, and a README that stands alone | [#221](https://github.com/JoniBach/rulecad/issues/221) |
| Fixings 1.10 | Ship @rulecad/fixings alone, then the first publish by hand (person) | [#222](https://github.com/JoniBach/rulecad/issues/222) |
| Fixings 1.11 | Measured: the fixings coupon printed and measured (person) | [#223](https://github.com/JoniBach/rulecad/issues/223) |

**Fixings 2: fastened assemblies**

| Ticket | What | Issue |
|---|---|---|
| Fixings 2.1 | V.fixings in designs | [#224](https://github.com/JoniBach/rulecad/issues/224) |
| Fixings 2.2 | Fasten in assemblies: one relation for a screwed joint | [#225](https://github.com/JoniBach/rulecad/issues/225) |
| Fixings 2.3 | Length, engagement and seat, checked | [#226](https://github.com/JoniBach/rulecad/issues/226) |
| Fixings 2.4 | Tool access, and fastening in the assembly order | [#227](https://github.com/JoniBach/rulecad/issues/227) |
| Fixings 2.5 | The shopping list counts every fixing | [#228](https://github.com/JoniBach/rulecad/issues/228) |
| Fixings 2.6 | Screw groups under load | [#229](https://github.com/JoniBach/rulecad/issues/229) |
| Fixings 2.7 | Worked example and archive (EXAMPLES chapter 15) | [#230](https://github.com/JoniBach/rulecad/issues/230) |

**Fixings 3: migration into the kit**

| Ticket | What | Issue |
|---|---|---|
| Fixings 3.1 | The inventory as a test, and a dimension diff for every migration step | [#231](https://github.com/JoniBach/rulecad/issues/231) |
| Fixings 3.2 | Rules: old names kept, thread sets marked | [#232](https://github.com/JoniBach/rulecad/issues/232) |
| Fixings 3.3 | Motors: mounts and screws through fixings | [#233](https://github.com/JoniBach/rulecad/issues/233) |
| Fixings 3.4 | Shapes and fixings: one place for each thing | [#234](https://github.com/JoniBach/rulecad/issues/234) |
| Fixings 3.5 | Pcb and its cases | [#235](https://github.com/JoniBach/rulecad/issues/235) |
| Fixings 3.6 | Cad: holes fits, fastens, templates and AGENTS.md | [#236](https://github.com/JoniBach/rulecad/issues/236) |
| Fixings 3.7 | The bench and machine examples: arm, leg, benchmarks and the machine templates | [#237](https://github.com/JoniBach/rulecad/issues/237) |
| Fixings 3.8 | The worked examples: EXAMPLES and TUTORIAL | [#238](https://github.com/JoniBach/rulecad/issues/238) |
| Fixings 3.9 | The rest of the kit, the docs, and the release notes | [#239](https://github.com/JoniBach/rulecad/issues/239) |

**Frames 1: profiles, beams and the cut list**

| Ticket | What | Issue |
|---|---|---|
| Frames 1.1 | A vocabulary for profiles, slots and slot nuts, with check, draw and draft | [#241](https://github.com/JoniBach/rulecad/issues/241) |
| Frames 1.2 | Rule sets: metric T-slot, by series and by maker | [#242](https://github.com/JoniBach/rulecad/issues/242) |
| Frames 1.3 | Rule sets: V-slot, the small beams, inch T-slot and plain sections | [#243](https://github.com/JoniBach/rulecad/issues/243) |
| Frames 1.4 | Measuring a profile from a maker's model | [#244](https://github.com/JoniBach/rulecad/issues/244) |
| Frames 1.5 | @rulecad/frames, a new package: profiles, sections and beams | [#245](https://github.com/JoniBach/rulecad/issues/245) |
| Frames 1.6 | Beams in assemblies, and addresses along a face | [#246](https://github.com/JoniBach/rulecad/issues/246) |
| Frames 1.7 | Operations on a beam: cut, mitre, tap, drill, pocket | [#247](https://github.com/JoniBach/rulecad/issues/247) |
| Frames 1.8 | The cut list, stock lengths, and a cut-and-drill sheet per beam | [#248](https://github.com/JoniBach/rulecad/issues/248) |
| Frames 1.9 | Slot nuts: families, the nut for a slot, and printed carriers | [#249](https://github.com/JoniBach/rulecad/issues/249) |
| Frames 1.10 | Ship @rulecad/frames alone, then the first publish by hand (person) | [#250](https://github.com/JoniBach/rulecad/issues/250) |
| Frames 1.11 | Measured: the slot coupon (person) | [#251](https://github.com/JoniBach/rulecad/issues/251) |

**Frames 2: joins, fittings and motion**

| Ticket | What | Issue |
|---|---|---|
| Frames 2.1 | Joins: beam to beam, by kind | [#252](https://github.com/JoniBach/rulecad/issues/252) |
| Frames 2.2 | Fastening into a slot; trapped nuts, and nuts to load first | [#253](https://github.com/JoniBach/rulecad/issues/253) |
| Frames 2.3 | Printed fittings: brackets, gussets, corners and nodes | [#254](https://github.com/JoniBach/rulecad/issues/254) |
| Frames 2.4 | Printed fittings: ends, feet, panels and doors | [#255](https://github.com/JoniBach/rulecad/issues/255) |
| Frames 2.5 | Printed fittings: cables, boards, supplies and fans | [#256](https://github.com/JoniBach/rulecad/issues/256) |
| Frames 2.6 | Bought fittings as rule sets, and printed or bought per join | [#257](https://github.com/JoniBach/rulecad/issues/257) |
| Frames 2.7 | Guides: linear rails on a face | [#258](https://github.com/JoniBach/rulecad/issues/258) |
| Frames 2.8 | Guides: V-wheels, carriage plates and slot sliders | [#259](https://github.com/JoniBach/rulecad/issues/259) |
| Frames 2.9 | Guides: rods, lead screws, motor plates, idlers and endstops | [#260](https://github.com/JoniBach/rulecad/issues/260) |
| Frames 2.10 | Jigs: drill, tap, cut length and square | [#261](https://github.com/JoniBach/rulecad/issues/261) |
| Frames 2.11 | Assembly order and the build page for a frame | [#262](https://github.com/JoniBach/rulecad/issues/262) |
| Frames 2.12 | Worked example: a frame with a moving axis (EXAMPLES chapter 16) | [#263](https://github.com/JoniBach/rulecad/issues/263) |
| Frames 2.13 | Measured: the joint rig and a slot nut's hold (person) | [#264](https://github.com/JoniBach/rulecad/issues/264) |

**Frames 3: frame checks, printed beams and generated frames**

| Ticket | What | Issue |
|---|---|---|
| Frames 3.1 | A beam solver in @rulecad/fea | [#265](https://github.com/JoniBach/rulecad/issues/265) |
| Frames 3.2 | Frame.deflection, frame.stress and frame.buckling | [#266](https://github.com/JoniBach/rulecad/issues/266) |
| Frames 3.3 | Frame.frequency, and racking | [#267](https://github.com/JoniBach/rulecad/issues/267) |
| Frames 3.4 | Squareness, and the frame in a machine's error budget | [#268](https://github.com/JoniBach/rulecad/issues/268) |
| Frames 3.5 | Printable profiles and printed beams | [#269](https://github.com/JoniBach/rulecad/issues/269) |
| Frames 3.6 | Printed beams checked, and which beams of a frame can be printed (person) | [#270](https://github.com/JoniBach/rulecad/issues/270) |
| Frames 3.7 | Frame generators: a frame from a size, or from the volume it encloses | [#271](https://github.com/JoniBach/rulecad/issues/271) |
| Frames 3.8 | Sizing: the lightest profiles that meet the limits | [#272](https://github.com/JoniBach/rulecad/issues/272) |
| Frames 3.9 | Kits, plates and a template | [#273](https://github.com/JoniBach/rulecad/issues/273) |
| Frames 3.10 | Worked example: a kit of printed beams (EXAMPLES chapter 17) | [#274](https://github.com/JoniBach/rulecad/issues/274) |
| Frames 3.11 | The guide, AGENTS.md and the docs | [#275](https://github.com/JoniBach/rulecad/issues/275) |
| Frames 3.12 | Measured: a frame built and measured (person) | [#276](https://github.com/JoniBach/rulecad/issues/276) |

What depends on what:

- Fixings 1 needs nothing. Fixings 2 needs the package published. Fixings 3 needs Fixings 2.
- Frames 1 needs Fixings 1 published. Frames 2 needs Fixings 2 for `fasten`. Frames 3 needs Frames 2.
- The beam solver (Frames 3.1) needs nothing and can start at any time.
- Frames may start as soon as Fixings 2 is done; the migration can run beside it.

## 7. What needs a person

- **Two first publishes.** `@rulecad/fixings` and `@rulecad/frames` are each published once by hand, then trusted
  for the release workflow (`npm trust github <name> --file publish.yml --repo JoniBach/rulecad --allow-publish
  --yes`), and the workflow run again. Until then the release plan holds back whatever depends on them.
- **Three coupons and two rigs to print and measure:** the fixings coupon, the slot coupon, the joint rig, the
  beam coupon, and a frame built and measured against its predictions.
- **A little to buy:** a few lengths of one or two profiles, their slot nuts, a rail and carriage, and an
  assortment of screws for the coupons.

## 8. Risks

- **Scope.** This is a framing system and a fastener library, each a product in its own right elsewhere. The
  milestones are cut so that each is useful alone, and Frames 3 can wait without leaving the rest incomplete.
- **Joint stiffness.** Every frame prediction rests on it until the rig is measured, and the checks say so in
  their text.
- **Slots differ.** Two makers' slots of the same name differ by tenths of a millimetre. One set per maker and a
  printed slot coupon are the answer, and a fitting drawn against a `community` slot says that it is.
- **Migration churn.** A hundred and eighty typed sizes change form. The inventory test and the dimension diff are
  what keep that from changing any print.
- **Section figures.** A sheet's second moments and the kit's computed ones will differ where the outline is
  drawn from interface values alone. The check reports the difference, and the solver uses the sheet's.
- **Makers' models.** Their licences vary. Measuring one into rules in a private workspace is safe; the kit's own
  sets are drawn from published dimensions only.

## Glossary

- **Beam:** a length of a profile. Bought and cut, or printed.
- **Blind joint:** a beam end screwed to another beam's slot by a screw in its tapped end, tightened through a hole
  drilled across the other beam.
- **Cell:** one unit of a base profile in a larger section. A 2040 is two cells of a 2020.
- **Clearance hole:** a hole a screw passes through without touching.
- **Drop-in nut:** a slot nut that goes in through the slot's opening anywhere along it.
- **Fitting:** a part that attaches to a beam: a bracket, a foot, a mount.
- **Fixing:** a screw, nut, washer or insert.
- **Guide:** something that lets a carriage slide along a beam: a rail, wheels, rods or a slider.
- **Insert:** a threaded metal bush melted or pressed into plastic.
- **Join:** a structural connection between two beams, as opposed to a joint, which moves.
- **Pilot:** a hole a screw cuts its own thread into.
- **Profile:** a beam's cross-section and the rules that describe it.
- **Second moment of area:** the property of a section that sets how much a beam of it bends.
- **Slide-in nut:** a slot nut that enters only from an open end of the slot.
- **Slot family:** a slot's shape and size, shared by every profile that takes the same nuts.
- **T-slot:** an undercut slot along a beam that holds a nut.
- **Torsion constant:** the property of a section that sets how much a beam of it twists.

## Sources

Standards, by number: ISO 68-1, ISO 261, ISO 262 and ISO 724 (metric threads); ISO 965-1 (thread tolerances);
ISO 273 (clearance holes); ISO 4762, ISO 7380-1, ISO 10642, ISO 4017 and ISO 4026 (screws); ISO 4032, DIN 562 and
DIN 985 (nuts); ISO 7089 (washers); ISO 898-1 and ISO 3506-1 (strength of screws); ISO 2904 (trapezoidal threads);
ASME B1.1 (unified inch threads) and ASME B18.3 (inch socket screws); VDI 2230 (bolted joints); EN 1993-1-8 (joints
in frames, classified by stiffness).

Books: Machinery's Handbook (thread engagement and stripping); McGuire, Gallagher and Ziemian, Matrix Structural
Analysis (beam elements, semi-rigid joints, buckling and vibration).

Makers' catalogues to draw profile and slot rule sets from, each cited with its page and date in the rule it
supports: Bosch Rexroth, item, MISUMI, Motedis, 80/20, OpenBuilds, MakerBeam and OpenBeam for profiles; Hiwin for
miniature rails.

Within the kit: `docs/robots-gap-analysis.md` (what a machine needs, including frames), the cad README (assemblies,
joints, fits and bought items), and `packages/rules/vocabulary.json` (the names rule sets share).
