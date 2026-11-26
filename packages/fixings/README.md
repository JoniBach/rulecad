# @rulecad/fixings

Screws, nuts, washers and inserts, and the holes and seats they need in a printed part. A **fixing** is anything on
a screw thread: the thread itself (`M3`), a whole screw (`M3x12 cap`), a nut, a washer, or a heat-set insert (a
threaded brass bush melted into plastic). You name the fixing, and this package looks its dimensions up from rules and
gives you the model, the hole, the seat and the solid. It also draws a real thread to print where one is worth it,
and does the first sums on a joint: how much thread is engaged, the load that strips it, the clamp force from a
tightening torque, the pressure under a head, and the sold length that fits. It holds what fastens two parts with no
steel screw as well: pins (a printed snap pin, a steel dowel, a length of filament), magnets in printed pockets, and
bolts printed with their thread. Every figure says how far to trust it and where it comes from.
The figures live in [`@rulecad/rules`](https://github.com/JoniBach/rulecad/tree/main/packages/rules) as open data,
one rule set per thread, and this package holds no screw's numbers of its own. Needs JSCAD. Part of
[rulecad](https://github.com/JoniBach/rulecad).

```js
import { fixingModel, holeModel, hole, counterboreModel, nutPocketModel, screwModel, screw } from '@rulecad/fixings';

const m = fixingModel('M3x12 cap');                          // or 'M3', '1/4-20 x 1/2 button', 'M4 lock nut', 'K30x10'
console.log(m.thread, m.pitch, m.head.diameter, m.figures.clearance.value, m.figures.clearance.kind, m.figures.tap_drill.value);

const through = holeModel(m);                                // the hole it passes through, on the kit's X1C
console.log(through.diameter, through.rests.map((r) => r.name).join(' + '));

const pilot = holeModel(m, { kind: 'pilot' });               // the hole it forms its own thread in
console.log(pilot.diameter, pilot.depth, pilot.basis.rule, pilot.basis.kind);

const seat = counterboreModel(m);                            // a seat that hides its head
console.log(seat.diameter, seat.depth, seat.sunk);

const pocket = nutPocketModel('M3');                         // a pocket its nut cannot turn in
console.log(pocket.flats, pocket.depth);

const bought = screwModel(m);                                // the screw itself, for an assembly and the list
console.log(bought.name, bought.mass, bought.anchors.tip.origin.join(','));

const cut = hole(m, { depth: 6, at: [0, 0, 6] });            // a JSCAD solid: subtract it from a 6 mm plate
const solid = screw(m);                                      // and the screw to show in it, 96 triangles
console.log(cut.model.findings[0].text);
```

```text
M3 0.5 5.5 3.4 spec 2.5
3.5 m3.clearance + x1c.hole_comp
2.9 5 x1c.pilot_m3 measured
6 3 0
5.6 2.8
M3x12 cap 1.089 0,0,-12
an M3 clearance hole drawn 3.5 mm: it rests on m3.clearance (3.4 mm), a standard's figure, plus x1c.hole_comp 0.1 mm across, since a printed hole comes out small
```

So an M3 screw passes through a hole drawn 3.5 mm (the standard's 3.4 mm and the printer's 0.1 mm, because printed
holes come out small), forms its own thread in a hole drawn 2.9 mm, which was measured on this printer, and hides its
head in a seat 6 mm across and 3 mm deep. The screw weighs about 1.1 g.

Most functions come in pairs, as in `@rulecad/motors`. `holeModel` gives the numbers, what they rest on, and findings
in the kit's one shape (`level`, `text`, `code`, `values`, `refs`). `hole` gives the JSCAD solid, with the same model
on it as `.model`. Lengths are in mm, angles in degrees, masses in grams, forces in newtons, torques in newton metres
and stresses in MPa.

| Section | Functions |
|---|---|
| [Start here](#start-here-a-plate-with-four-counterbored-holes-and-an-insert-boss) | A whole part from four calls |
| [Naming a fixing](#naming-a-fixing) | `fixingModel`, `parseName`, `threads`, `fixingsFor` |
| [Holes by purpose](#holes-by-purpose) | `hole`, `holeModel` |
| [Seats](#seats) | `counterbore`, `countersink`, `nutPocket`, `nutTrap`, `squareNutSlot`, `captiveNut`, `insertBoss` |
| [Reference hardware](#reference-hardware) | `screw`, `nut`, `washer`, `insert` |
| [Threads cut for printing](#threads-cut-for-printing) | `thread`, `threadModel` |
| [Strength and length](#strength-and-length) | `engagement`, `stripping`, `preload`, `torqueFor`, `seating`, `lengthFor`, `screwGroup`, `screwLoad` |
| [Pins](#pins) | `pinModel`, `pinHole`, `pin`, `snapPin`, `snapSocket`, `snapPinModel`, `parsePin`, `isPinName` |
| [Printed bolts](#printed-bolts) | `printedBoltModel`, `printedBolt` |
| [Magnets](#magnets) | `magnetModel`, `magnetSeatModel`, `magnetSeat`, `magnet`, `parseMagnet`, `isMagnetName`, `fieldShare` |
| [Annular snaps](#annular-snaps) | `annularSnapModel`, `annularBead`, `annularGroove`, `snapSlots`, `skirtFinger`, `hubFactor`, `shaftFactor`, `tubeRing` |
| [Measuring the printer's fits](#measuring-the-printers-fits) | the fixings coupon and the holds coupon |
| [Refusals and printability](#refusals-and-printability) | `printable` |

## Where each thing lives

Anything whose job is to hold two parts together is here, where it is sized, its hole takes its fit from the
printer's rules, it goes on the shopping list and the build steps, and a coupon measures it. Some near neighbours
live elsewhere, each for a reason:

| Thing | Where | Why |
|---|---|---|
| Screws, nuts, washers, inserts, their holes and seats | here | they are the fixings |
| Snap pins (`snapPin`, `snapSocket`, `snapPinModel`), plain pins | here | moved from `@rulecad/flexures`, which passes the three snap pin functions on unchanged |
| Magnets and their pockets | here | `@rulecad/frames`' magnet catch takes its pocket and pull from `magnetSeatModel` |
| Printed bolts | here | a screw named with the word printed |
| Annular snaps, a lid that clicks on (`annularSnapModel`, `annularBead`, `annularGroove`) | here | their job is to hold a lid on its box; issue 76 listed them with the flexures, which keep the snap hook |
| Snap hooks, ratchets, pin joints printed in place, travel and angle stops | `@rulecad/flexures` | their bending is their job |
| A countersink, a nut pocket and a nut trap from plain figures, crush ribs, a teardrop hole | `@rulecad/shapes` | shapes draws from plain numbers and reads no rule sets; this package calls the same shapes with a thread's figures, so moving them would make a cycle |
| Slot nuts, carriers, brackets, hinges, latches, cable clips | `@rulecad/frames` | each is shaped to a beam's slot |

## Start here: a plate with four counterbored holes and an insert boss

Install the package and JSCAD (`npm install @rulecad/fixings @jscad/modeling`), and this is a whole part: a plate
50 by 40 by 8 mm with a counterbored M3 hole near each corner and a boss in the middle for an M3 heat-set insert.

```js
import jscad from '@jscad/modeling';
import { counterbore, counterboreModel, insertBoss, lengthFor } from '@rulecad/fixings';

const { subtract, union } = jscad.booleans;
const plate = jscad.primitives.cuboid({ size: [50, 40, 8], center: [0, 0, 4] });   // 8 mm thick, its top at z = 8
const corners = [[-19, -14], [19, -14], [19, 14], [-19, 14]];
const boss = insertBoss('M3', { at: [0, 0, 8] });                                  // stands on the top, in the middle
const part = subtract(union(plate, boss.boss), boss.hole,
  ...corners.map(([x, y]) => counterbore('M3', { length: 8, thickness: 8, at: [x, y, 8] })));

const seat = counterboreModel('M3');
console.log(seat.diameter, seat.depth, seat.hole);                 // the seat, and the hole under it
console.log(boss.model.outer, boss.model.height, boss.model.hole); // the boss, and the hole the insert melts into
console.log(lengthFor(8, 'M3', { into: 'insert', sunk: seat.depth }).name); // the screw that holds this plate to an insert below
console.log(Math.round(jscad.measurements.measureVolume(part)), 'mm³');
```

```text
6 3 3.5
7.2 6.8 4
M3x8 cap
15663 mm³
```

`part` is a JSCAD solid: export it with `@jscad/stl-serializer`, or hand it to any JSCAD viewer. Each cutter starts
at a point on a face (`at`) and goes into the part (`into`, down from the top unless you say). `length: 8` cuts the
screw's hole right through, and `thickness: 8` has the seat checked against the part it is in. No dimension of the
screw was typed: the seat is 6 mm across and 3 mm deep because an M3 cap head is 5.5 by 3 mm, and the boss is 7.2 mm
across because the insert's rule asks 1.6 mm of wall round its 4 mm hole.

## Naming a fixing

One grammar reads every name. It is exported as `GRAMMAR`, and `parseName(name)` is the only thing that reads it.

```text
name    = thread [ "x" length ] { word }
thread  = "M" number                          metric: M3, M2.5
        | size "-" count [ "UNC" | "UNF" ]    inch: 6-32, #6-32, 1/4-20, 10-32 UNF
        | [ "PT" ] "K" number                 a screw for plastic: K30, PT K30
length  = number [ "mm" | "in" ]              mm on a metric or plastic thread; inches on an inch thread, where
                                              a fraction is read too: 1/2, 1 1/2
word    = "cap" | "button" | "countersunk" | "hex" | "set" | "pan"      a screw's head form
        | [ "hex" | "square" | "lock" ] "nut"                           a nut (hex if not said)
        | "washer" | "insert"                                           a plain washer, a heat-set insert
        | a variant of the thread's rule set                            torx, on a PT screw
        | "printed"                                                     a screw or nut printed with its thread, not bought
```

| You write | You get |
|---|---|
| `M3`, `M2.5`, `1/4-20`, `6-32`, `K30` | The thread alone: every figure, no length and no head |
| `M3x12 cap`, `M5x10 button`, `M4x8 countersunk`, `M6x20 hex`, `M3x4 set` | A screw: its length is from under the head, or overall for a countersunk screw and a set screw |
| `1/4-20 x 1/2 cap`, `6-32 x 1 1/2 button` | An inch screw, its length in inches (`x 12.7 mm` is read too) |
| `K30x10`, `K30x10 torx` | A thread-forming screw for plastic with a pan head, and its Torx variant |
| `M3 nut`, `M4 square nut`, `M5 lock nut` | A hexagon nut, a thin square nut, a nylon-insert lock nut |
| `M3 washer`, `M3 insert`, `M3x3 insert` | A plain washer; a heat-set insert, the usual one or a shorter one by its length in mm |

A screw with a length and no head form is a socket cap screw (`M3x12`), or a pan head on a screw for plastic. Case
and spaces are free, and a few everyday words are read as well: `socket`, `csk`, `flat`, `grub`, `nyloc`, and
`screw`, `bolt`, `head`, `plain` and `heat-set`, which add nothing. Each name has one spelling, in `model.name`: `m3 x 12` comes back as
`M3x12 cap` and `1/4-20x1/2` as `1/4-20 UNC x 1/2 cap`.

The threads there are rule sets for (`threads()` lists them): M1.6, M2, M2.5, M3, M4, M5, M6, M8, M10 and M12;
4-40, 6-32, 8-32, 10-24, 10-32 UNF, 1/4-20, 5/16-18 and 3/8-16; and the PT screws for plastic K22, K25, K30, K35,
K40 and K50. A size has only what its standard makes: M2.5 has no button head, M12 no square nut and no insert.

```js
import { fixingModel, threads } from '@rulecad/fixings';

fixingModel('1/4-20 x 1/2 button').head.diameter   // 11.1 mm, with m.figures.button_head.source saying where from
fixingModel('M4 lock nut').nut.height              // 5 mm
fixingModel('M3', { clearance: 3.3 })              // a figure of your own, marked kind 'given'
fixingModel('M3', { pilot: { value: 2.8, kind: 'measured', source: 'my coupon, 2026-11-20' } })
fixingModel('M3x14 cap', {}, { anyLength: true })  // a length the list does not have: sold is false
threads()                                          // ['M1.6', 'M2', …, 'PT K50']
```

**Refusals are by name, before any geometry.** A thread with no rule set is refused with the threads there are
(`fixingModel('M7')`). A head or a nut that size is not made with is refused with the ones it is. A length that is
not sold is refused with the nearest sold lengths, unless you pass `{ anyLength: true }`. The list of lengths is the
socket cap screw's, and it holds button, countersunk and hexagon head screws too. A set screw is sold shorter, so its
length is not held to the list, and the screws for plastic list no lengths.

### The model

`fixingModel(name, change, { sets, anyLength, variant })` returns:

| Field | What it is |
|---|---|
| `kind`, `item` | `'fixing'`, and `'thread'`, `'screw'`, `'nut'`, `'washer'` or `'insert'` |
| `name`, `said` | The name in its one spelling, and as you wrote it |
| `set`, `thread`, `form` | The rule set (`m3`), the thread as written (`M3`), and `'metric'`, `'unified'` or `'plastic'` |
| `major`, `pitch` | The thread, in mm |
| `length`, `sold` | A screw's or an insert's length, and whether the thread's list has it (`null` where there is no list) |
| `head` | A screw's head: `form`, `diameter`, `height`, `across` (the widest it is), and `key`, `flats`, `angle` or `drive` where the form has them |
| `nut` | A nut: `kind`, `flats`, `height`, `across` (over its corners) |
| `made` | What this size has figures for: `heads`, `nuts`, `washer`, `insert` |
| `figures` | Every rule of the thread's set by name, each `{ value, unit, kind, source, rule, checked }` |

`kind` on a figure is how far to trust it: `spec` (a standard, as tabulated on the page its source names),
`measured`, `community` (as commonly quoted), `estimate`, or `given` (you passed it in).

### Your own rule sets

A workspace's own rule set for a thread is used before the kit's. Pass the workspace's sets as `{ sets }`, by name or
as a list. A set is found by the thread its `thread` rule names, or, for a set written before threads said what they
were, by having the same name as the kit's (`m3`). Its figures come first and the kit's fill in what it lacks, each
marked `from: 'workspace'` or `from: 'kit'`. A thread the kit has no set for (M14) is a rule set of your own with
`thread`, `thread_form`, `major_diameter` and `pitch`, in the names the rules package's `vocabulary.json` lists.

`fixingsFor({ sets, printer, ops })` returns every function of this package with those in hand, so a design names a
thread and gets its own project's figures. It is the hook a host calls once per design: this package reads no files.

```js
import { fixingsFor } from '@rulecad/fixings';

const mine = { name: 'mk4', rules: { hole_comp: { value: 0.15, unit: 'mm', kind: 'measured', source: 'a test print' } } };
const fixings = fixingsFor({ printer: mine });
console.log(fixings.holeModel('M3').diameter);              // 3.55: this printer's compensation
console.log(fixings.holeModel('M3', { kind: 'pilot' }).basis.rule); // m3.pilot: this printer has measured none
```

## Holes by purpose

`holeModel(fixing, { kind, depth, through, printer, material, axis, into, lead })` and `hole(…, { at })`. The first
argument is a model or a name.

| `kind` | What it is for | Drawn to | Compensation |
|---|---|---|---|
| `clearance` | A screw passes through (the default) | `clearance`, the normal fit of ISO 273 or ASME B18.2.8 | Added |
| `close`, `loose` | A tighter or a freer fit | `clearance_close`, `clearance_loose` | Added |
| `tap` | A hole to tap | `tap_drill` | Added |
| `pilot` | The screw forms its own thread in the plastic | The printer's `pilot_<set>`, else the thread's `pilot` | None: as drawn |
| `insert` | A heat-set insert melts in | `insert_hole` | None: as drawn |
| `thread` | A thread modelled to print, for a screw of about M6 or more | The thread's major diameter and the printer's `thread_gap` (see [Threads cut for printing](#threads-cut-for-printing)) | Added |

**Compensation is applied once, and only where it belongs.** Printed holes come out small, so the printer's
`hole_comp` is added across the diameter where the rule's figure is the size the hole must come out. A pilot and an
insert hole are figures for the hole as drawn, already sized for printing, and their rules say so: nothing is added.

**A pilot says what it rests on.** A pilot depends on the printer and the plastic as well as the screw. The printer's
own measured rule comes first: `pilot_m3` on the X1C's rule set, or `pilot_m3_petg` for one plastic when you pass
`material: 'PETG'`. An insert hole reads the printer's `insert_m3` the same way. Without one, the thread's starting figure is used (`m3.pilot`, a community figure, or an estimate
for the sizes nobody has published), and the finding says to measure it. A measurement made on one printer is never
borrowed for another.

**The printer** is the kit's X1C unless you pass one: its rule set (`{ name, rules }`, so each figure keeps its kind
and source), or its values as a design reads them (`v.x1c`, plain numbers, marked `given`). A basic clearance the
printer lacks is the X1C's, and a finding says so.

**Which way it goes.** As the features of `@rulecad/shapes`, a hole starts at a point on a face (`at`) and goes into
the part along `into`: `-z` down from a top face (the default), `+z` up from the bed, or `+x`, `-x`, `+y`, `-y`
across the part. `axis: 'x'` says the same for a model with no place yet. Standing up, a hole is round. On its side it
is a teardrop through shapes' `teardropHole`, with a 45° roof. A blind hole going down gets a lead-in chamfer at its
mouth (the printer's `chamfer`), and one going up from the bed ends in a 45° point, so its end needs no bridge.

Depth: a clearance hole needs the thickness it passes through (`depth`, or `thickness`, the part's there). A pilot defaults to the thread's `pilot_depth`, or 2.5
diameters where it has none; an insert hole to `insert_depth` (the insert and 1 mm), or `insert_length` when it goes
through; a tapped hole to the engagement rule for its `material` (1 diameter in steel, 2 in aluminium, 2.5 in plastic).
With `thickness`, a blind hole deeper than the part is refused.

```js
import jscad from '@jscad/modeling';
import { hole, holeModel } from '@rulecad/fixings';

const plate = jscad.primitives.cuboid({ size: [30, 20, 8], center: [0, 0, 4] });
const part = jscad.booleans.subtract(plate,
  hole('M3', { depth: 8, at: [-8, 0, 8] }),                    // through, from the top
  hole('M3', { kind: 'pilot', at: [0, 0, 8] }),                // blind, 5 mm deep, with a lead-in
  hole('M3', { kind: 'insert', into: '+y', at: [8, -10, 4] })); // on its side: a teardrop
console.log(holeModel('M3', { kind: 'insert' }).diameter, holeModel('M3', { kind: 'tap' }).diameter); // 4 2.6
console.log(jscad.measurements.measureVolume(part) < 30 * 20 * 8); // true
```

## Seats

Each seat prints without supports in the direction it is drawn for, says so in a finding (`counterbore.printable`
and the like, which `printable(model)` returns), and is checked by `@rulecad/printcheck` in this package's tests.

| Function | What it cuts | Sized from |
|---|---|---|
| `counterbore(fixing, { head, depth, diameter, length })` | A round seat for a cap, button, hexagon or pan head, and with `length` the screw's hole on through | The head, the printer's `fit` each side and `hole_comp`; as deep as the head, up to a whole layer |
| `countersink(fixing, { length })` | A cone for a flat head, flush with the face | The head's sharp-edge diameter and its angle: 90° metric, 82° inch |
| `nutPocket(fixing, { kind, depth, fit })` | A pocket for a hex, square or lock nut, in from a face along the screw | The nut's flats and `hole_comp`; the nut's height and two layers |
| `nutTrap(fixing, { kind, axis, into, depth, fit })` | A slot a nut slides into from the side, across the screw | The nut's flats, `hole_comp` and the printer's `slip` |
| `squareNutSlot(fixing, { depth })` | The same for a thin square nut, dropped in from the top | DIN 562's nut |
| `captiveNut(fixing, { kind, at })` | A pocket closed inside the part for a nut put in mid-print | The nut and one layer over it, with the pause height |
| `insertBoss(fixing, { height, outer, wall, through })` | A boss to add and the hole to cut in it | The insert's hole, depth and least wall |

Each has a twin with `Model` on its name (`counterboreModel`) that gives the numbers and the findings. Each takes
`thickness`, the part's thickness where the seat is cut, and is refused by name where it would be deeper than the part.

- **Counterbore.** Going down from a top face it is a plain step. Going up from the bed, its seat ends in a 45° cone
  from the bore to the hole, so nothing spans, and the head bears on the cone's rim. On its side, the seat and the
  hole are one teardrop cutter. A hexagon head's seat clears its corners and no more: give `diameter` for a socket.
- **Countersink.** A 90° head goes through shapes' `countersink`. An inch screw's 82° cone is drawn here in the same
  form, since shapes' helper takes no angle. The seat is as wide as the head's theoretical sharp edge, so any head
  made to the standard sits flush.
- **Nut pocket.** `fit` is `snug` by default (no clearance once printed, so the nut cannot turn), or `slip`, `press`,
  or a clearance in mm. Where the printer has a measured `nut_fit`, snug is that clearance; a slot's and a closed
  pocket's slip is the printer's `nut_slip` where it has one. A hexagon goes through shapes' `nutPocket`: open from above, with a 45° roof going up from
  the bed, and with a flat on top across a part. A square pocket is drawn here, turned corner up across a part.
- **Nut slot.** `depth` is from the face to the screw's axis, and `at` is the point on the face level with the nut's
  middle. From the side of a screw standing up (`axis: 'z'`), the slot goes through shapes' `wallOpening`: its roof
  bridges, and where the nut is wider than the printer bridges it rises at 45° to a flat as wide as it can span. Then
  the floor is flat and the roof is not, so bring the screw in through the floor. Dropped in from the top of a screw
  lying down (`axis: 'x'`, `into: '-z'`), the slot is open above and ends in the nut's own outline.
- **A nut put in mid-print.** `captiveNutModel` reports `pause`, the height where the pocket's walls end, and `layer`,
  the last layer laid before it. Pause there, drop the nut in, and the next layers close a 45° roof over it.
- **Insert boss.** `insertBoss` returns `{ boss, hole, model }`: add the boss, then subtract the hole. It is refused
  where the wall you give is thinner than the insert's rule allows, or the part is shorter than the insert.

```js
import jscad from '@jscad/modeling';
import { counterbore, nutTrap, nutTrapModel, insertBoss, captiveNutModel, hole } from '@rulecad/fixings';

const { subtract, union } = jscad.booleans;
const plate = jscad.primitives.cuboid({ size: [40, 20, 10], center: [0, 0, 5] });
const boss = insertBoss('M3', { at: [14, 0, 10] });              // stands on the plate's top
const part = subtract(union(plate, boss.boss), boss.hole,
  counterbore('M3', { length: 10, at: [-14, 0, 10] }),           // a cap head, hidden, and its hole
  nutTrap('M4', { depth: 10, into: '+y', at: [0, -10, 5] }),     // an M4 nut slides in from the front
  hole('M4', { depth: 10, at: [0, 0, 10] }));                    // and its screw comes down to it
console.log(nutTrapModel('M4', { depth: 10 }).findings[1].text);
console.log(captiveNutModel('M4', { at: [0, 0, 4] }).pause, boss.model.outer); // 7.4 7.2
```

## Reference hardware

`screw`, `nut`, `washer` and `insert` are light solids for an assembly (`display: 'thread'` on a screw or a nut draws
its real thread instead, to print it: see [Threads cut for printing](#threads-cut-for-printing)): the thread is a plain cylinder at the major
diameter, a head is its outline with no socket, and a bore is drawn just clear of the thread, so a screw in its nut
never reads as an overlap. An M3x12 cap screw is 96 triangles. Each twin (`screwModel`) gives the mass and the
anchors an assembly places the part by, in the form a motor's are: `{ origin: [x, y, z], axis: [x, y, z] }`.

| Solid | How it stands | Anchors |
|---|---|---|
| `screw(fixing, { length, head, material })` | On z, head up, the face its head seats on at z = 0, the thread down to z = -length. A countersunk screw and a set screw have their top at z = 0 | `seat`, `tip`, `axis`, `top` (where a key goes in) |
| `nut(fixing, { kind, material })` | On z, from z = 0 to its height, a hexagon's corner on x | `seat`, `top`, `axis` |
| `washer(fixing, { material })` | Flat on z = 0 | `seat`, `top`, `axis` |
| `insert(fixing)` | Hanging from z = 0, flush with the mouth of its hole, down to z = -length | `seat`, `bottom`, `axis` |

```js
import jscad from '@jscad/modeling';
import { screw, nut, counterbore, counterboreModel } from '@rulecad/fixings';

const plate = jscad.booleans.subtract(jscad.primitives.cuboid({ size: [20, 20, 10], center: [0, 0, 5] }), counterbore('M3', { length: 10, at: [0, 0, 10] }));
const s = screw('M3x12 cap'), seat = 10 - counterboreModel('M3').depth;      // the seat's floor
const placed = jscad.transforms.translate([0, 0, seat - s.model.anchors.seat.origin[2]], s);
console.log(jscad.measurements.measureBoundingBox(placed)[1][2]);            // 10: the head is flush
console.log(s.model.mass, nut('M3').model.mass);                             // 1.089 0.388
```

## Threads cut for printing

Below about M6 a printed thread is worse than a pilot, an insert or a nut. Above it, and for lids, knobs and
lead-screw nuts, a real thread is worth drawing. `threadModel(spec, options)` gives it as numbers and `thread` gives
the solid: an external thread to add, standing on z from 0 to its length, or with `internal: true` the cutter of an
internal thread to subtract, which runs a little past both faces of a part as thick as the thread is long.

| `spec` | The thread |
|---|---|
| `'M10'`, `'1/4-20'`, a fixing's model | An ISO metric or a unified inch thread: the basic profile of ISO 68-1, from the major diameter and the pitch in the thread's rule set (`pitch: 1.25` for a fine one) |
| `'Tr8x2'`, `'Tr8x8(P2)'`, `'Tr8x4(P2)LH'` | A metric trapezoidal thread (ISO 2904), written diameter x lead (P pitch): 8 mm lead on a 2 mm pitch is four starts |
| `'T8'`, or a lead screw's or its nut's rule set | The catalogue's T8 lead screw (`t8-screw` in the rules package: four starts, 8 mm lead), or `variant: 'lead-2'` |
| `{ form, diameter, pitch, starts }` | Any other, by its numbers (`form`: `metric`, `unified` or `trapezoidal`) |

| Option | What it does |
|---|---|
| `length` | The thread's length along its axis (needed) |
| `internal` | `true` for a nut's thread or a threaded hole |
| `starts`, `hand` | How many threads run side by side, and `'right'` or `'left'` |
| `mate` | What it screws into: `'printed'` (the default: each of the pair takes half the gap) or `'bought'` (this one takes all of it) |
| `gap` | The gap to its mate on the radius, in place of the printer's `thread_gap` |
| `flanks` | `'printed'` (the default, below) or `'standard'` (the standard's own form) |
| `leadIn` | The size of the lead-in at each end, on the radius (default a tooth's height) |
| `segments`, `display` | Faces round, a multiple of 4 from 12 to 144 (default 48), and `'thread'` or `'plain'` |
| `top` | Which end is up when it prints: `'+z'` (as drawn) or `'-z'` |
| `axis`, `flat` | `'z'` standing up (the default), or `'x'` or `'y'` lying on its side, which needs `flat: true` |

What a printed thread gets that a machined one does not:

- **A clearance from the printer.** The printer's rule `thread_gap` (0.2 mm on the X1C, an estimate until the
  fixings coupon measures it) is the gap between the thread and its mate, on the radius. The whole profile is moved
  off the basic size by it: half each for a printed pair, all of it where the mate is bought. An internal thread
  also gets the printer's `hole_comp` across its diameter, as every printed hole does. An M10 bolt for a printed nut
  is drawn 0.1 mm under size on the radius and its nut 0.15 mm over.
- **Flanks the printer can lay.** With the axis upright, a flank is an overhang where it faces down. The 60° metric
  form has flanks 30° from the axis's normal, which is a 60° overhang from upright, and the trapezoidal form's 15°
  flanks are a 75° overhang. Both are past the X1C's 45°. So the flank that faces down is laid back to the printer's
  overhang (45° from the axis's normal on the X1C), turning about the tooth's root, and the flank that faces up keeps
  the standard's angle. Material is only ever taken off, so the thread stays inside the standard's outline and still
  screws into a bought nut or on to a bought screw. The tooth ends in a crest flat an eighth of the pitch wide, so
  it is lower than the standard's: an M10 tooth is 0.594 mm high where the standard's is 0.812 mm. `flank`,
  `overhang`, `depth` and `overlap` on the model say exactly what was drawn, and `flanks: 'standard'` keeps the
  standard's own form, with a warning that says its overhang.
- **A lead-in at each end.** A 45° cone as deep as a tooth, so the first layer on the bed is a plain circle, the
  thread grows out of it, and a nut starts easily.
- **Which way up.** The laid-back flank depends on which end is up: `top: '-z'` for a part that is turned over to
  print. `screw` sets it for you. A printed pair meets on matching flanks when the nut is turned over from how it
  printed.

**Refused by name.** A pitch finer than the printer resolves: a thread needs 5 layers to a pitch and a tooth a print
line deep, so on the X1C at 0.2 mm layers `threadModel('M3')` is refused, naming M6 as the smallest metric thread
that would print (10-24 for inch threads; M5 at a 0.1 mm layer). A thread lying on its side with no flat: its lower
half would hang over the bed. With `flat: true` an external thread gets a flat along it to lie on, and a threaded
hole gets a pointed roof as a teardrop has; either keeps the standard's flanks, which face sideways, and leaves
thread on three quarters of each turn.

**Triangles.** A real thread is thousands of triangles (an M10 thread 30 mm long at 48 faces round is about 8,000),
bounded by `segments` and reported as `triangles` on the model. `display: 'plain'` draws a plain cylinder in its
place, for a viewer or a link, and `fixingsFor({ display: 'plain' })` makes that the default for a whole workspace.
`screw` and `nut` are light solids unless you pass `display: 'thread'`.

**In a part and on hardware.** `hole(m, { kind: 'thread', depth })` cuts a threaded hole: down from a face, up from
the bed (it ends in a 45° point), through, or on its side with `flat: true`. `screw(m, { display: 'thread' })` is the
whole screw as one closed solid, to print standing on its head, and `nut(m, { display: 'thread' })` the nut, to print
as it stands.

```js
import { threadModel, screw, nut } from '@rulecad/fixings';

const t = threadModel('M10', { length: 20 });
console.log(t.drawn.major, t.drawn.minor, t.clearance, t.flank.down, t.overhang.standard, t.overlap);

const bolt = screw('M10x30 hex', { display: 'thread' });   // one closed solid: print it standing on its head
const itsNut = nut('M10', { display: 'thread' });          // print it as it stands
console.log(bolt.model.threaded.triangles, itsNut.model.threaded.drawn.major, itsNut.model.threaded.drawn.minor);

const lead = threadModel('T8', { length: 15, internal: true, mate: 'bought' }); // a nut for the catalogue's lead screw
console.log(lead.thread, lead.starts, lead.lead, lead.drawn.minor);

try { threadModel('M3', { length: 10 }); } catch (e) { console.log(e.message.split('. ')[1]); }
```

```text
9.364 8.176 0.2 45 60 0.246
10080 10.3 8.874
Tr8x8(P2) 4 8 7.184
The smallest metric thread that would print is M6 (1 mm pitch)
```

The first line reads: an M10 screw thread drawn 9.364 mm over its crests and 8.176 mm over its roots, with 0.2 mm
between it and its mate, its down-facing flank at 45° where the standard's would overhang 60°, overlapping a printed
nut's flanks by 0.246 mm on the radius. That overlap is what laying the flank back costs: the standard's form
overlaps 0.812 mm before any gap. Where the joint carries load, compare `flanks: 'standard'` on a test print.

## Strength and length

First sums for a joint, each returning its numbers, what they rest on and findings. `material` is a material of the
kit's rule sets (`pla`, `petg`, `abs`, `asa`, `pa_cf`, `al6061`, `al7075`, `s275`, `ss304`), the workspace's own set of that name (`sets`),
or a rule set with a `strength` and a `modulus`. Its class (plastic, aluminium or steel) is told from its stiffness.

| Function | Gives |
|---|---|
| `engagement(m, { depth, material })` | Threads engaged, against the rule for that class of material, and the depth that would do. `material` may be a class by name |
| `stripping(m, { depth, material, load })` | The load that strips the internal thread, against the screw's proof load, and the depth at which the two match. With `load`, whether it is held twice over |
| `preload(m, { torque })`, `preload(m, { force })`, `torqueFor(m, { force })` | The clamp force a tightening torque gives, and the torque for a force. `K` for another nut factor |
| `seating(m, { head, material, force })` | The pressure under the head, the plain washer that would bring it within, and the most the seat takes. `torque` in place of `force`; with neither, a screw tightened fully |
| `lengthFor(stack, m, { into })` | The shortest sold length that passes the stack and engages enough at the far end without bottoming out or standing proud |
| `screwGroup(places, { force, moment, at, pivot })` | A load on a joint shared between its screws: each one's shear across the joint and pull along it. `places` are the screws' `[x, y]` across the joint; `force` and `moment` are on the part they hold, `z` along the screws and positive pulling it off |
| `screwLoad(m, { tension, shear, depth, material, torque })` | One screw under its share: how many times that load it holds before the screw yields and the thread strips at its preload, and whether the parts slip. With no `torque`, the preload that leaves the thread twice the pull, within `most` (what the seat takes), and the torque for it |

The screw is class 8.8 steel as its rule set gives it. `screw: 'stainless'` takes the A2-70 figure, and
`proof: 830` any other class by its proof stress in MPa (830 is class 10.9). A fixing's name carries no property
class.

`lengthFor` takes the thicknesses the screw passes under its head (`6`, or `[3, 6]`), with `washer: true` for a plain
washer and `sunk` for a counterbore's depth. `into` says what it ends in:

| `into` | Thread asked | Room before it bottoms out |
|---|---|---|
| `'insert'`, `{ kind: 'insert', length: 3 }` | A diameter, or the whole insert where it is shorter | The insert's length: the millimetre of hole under an insert is left for the plastic it pushes ahead |
| `'pilot'`, `{ kind: 'pilot', depth }` | The thread's `pilot_depth`, else 2.5 diameters | The hole's depth less 1 mm at the tip. With no depth, the result says how deep to draw it |
| `'tap'`, `'thread'`, `{ kind: 'tap', material, depth }` | The engagement rule for the material | As a pilot's |
| `'nut'`, `{ kind: 'nut', nut: 'lock', room }` | The nut's whole height | `room` where the nut sits in a pocket, else no limit |

Where no sold length fits it is refused by name, with the nearest length and by how much it misses.

```js
import { engagement, stripping, preload, torqueFor, seating, lengthFor } from '@rulecad/fixings';

console.log(engagement('M3', { depth: 6, material: 'pla' }).need);           // 6 mm is short: 7.5 mm would do
const s = stripping('M3', { depth: 6, material: 'pla' });
console.log(s.strip, s.proof, s.margin, s.depthFor);                         // the thread goes first
console.log(preload('M3', { torque: 0.5 }).force, torqueFor('M3', { force: 500 }).torque);
const seat = seating('M3', { head: 'cap', material: 'pla', torque: 0.5 });
console.log(seat.pressure, seat.limit, seat.washer.pressure, seat.most.torque);
const fit = lengthFor(6, 'M3', { into: 'insert' });
console.log(fit.name, '|', fit.findings[1].text);
```

```text
7.5
1114.1 2917.9 0.38 15.7
833.3 0.3
58.9 39 28.9 0.331
M3x10 cap | M3x12 cap would bottom out: 6 mm into 5.7 mm of room (the insert's 5.7 mm: the hole's extra millimetre under it is left for the plastic the insert pushes ahead)
```

So an M3 screw 6 mm into PLA strips its thread at about 1,114 N, 0.38 of the 2,918 N the screw itself holds, and
15.7 mm of thread would match the screw. Tightened to 0.5 N·m it clamps with about 833 N, which is 58.9 MPa under a
bare cap head, past PLA's 39 MPa: an M3 washer brings it to 28.9 MPa. Through a 6 mm plate into the 5.7 mm insert,
M3x10 is the screw: M3x12 would bottom out.

**How far to trust these.** The stripping load is a geometric shear area times a shear strength taken as the
material's tensile strength over √3. For a printed plastic that strength is an estimate: the bond between layers,
the walls round the hole and how the hole printed decide the real figure, and a thread a screw has formed in a pilot
is less complete than the handbook's. Where the material's rule set has a strength across the layers (`strength_z`,
as `petg`, `abs`, `asa` and `pa_cf` have), the weaker of the two is taken; where it has none (`pla`), the finding says so. The clamp force from
a torque scatters by a quarter to a third either way. Take the results as a first check, keep a working load to half
of what they give, and test a joint that matters.

## Pins

A pin holds two printed parts together with no thread. Four kinds are drawn and sized here:

- a **snap pin**, a printed peg split down its middle with a barb at its tip, which clicks through its hole and holds;
- a **dowel**, a bought steel pin (ISO 8734, hardened and ground, or ISO 2338, unhardened);
- a **filament pin**, a cut length of the printer's 1.75 mm filament, with nothing to buy;
- a **printed pin**, a plain printed peg.

`pinModel(name, options)` gives a pin's numbers by name: the hole it goes in, its mass, what it carries in shear and
what the printed hole takes in bearing, and for a snap pin the force to push it in and pull it out. `pinHole` is the
hole to subtract (round standing up, a teardrop lying on its side) and `pin` the pin's own solid. A plain pin is
pressed in (`fit: 'press'`, the default: it grips) or slides in (`fit: 'slip'`: it turns, a hinge pin). Each hole
takes its size from the printer's rules: a snap pin's socket is the peg plus `snap_clearance` each side, as drawn; a
plain pin's hole is the pin plus `hole_comp`, less `pin_press` or plus `pin_slip`. All three are estimates until the
holds coupon measures them (see [Measuring the printer's fits](#measuring-the-printers-fits)). A snap pin's barb is
0.4 mm past its peg unless its name says another; the holds coupon prints three, and `x1c.snap_barb` records the one
that won. Given the `thickness` it goes through, a pin that does not fit its part is refused by
name: a plain pin longer than the parts stands proud, and a snap pin's shaft must be as long as the parts and at most
`snap_play` (0.5 mm) longer, or its barb never clicks out or rattles.

A pin's name is read by this grammar:

```
pin      = kind diameter "x" length { word }        snap pin 4x6, dowel 3x12, filament pin 1.75x12, printed pin 4x10
kind     = "snap pin" | "dowel" | "filament pin" | "printed pin"      ("pins" and "dowel pin" are read too)
diameter = number                                    mm: the peg's, below a snap pin's barb
length   = number [ "mm" ]                           mm: a snap pin's shaft from its foot to its barb; a plain pin's whole length
word     = "barb" number                             a snap pin's barb past its peg (default 0.4)
         | "ISO 8734" | "ISO 2338"                   a dowel's standard: hardened and ground (the default), or unhardened
```

```js
import { pinModel, pinHole, pin } from '@rulecad/fixings';

const snap = pinModel('snap pin 4x6', { thickness: 6, pull: 2 });
console.log(snap.hole.diameter, snap.snap.insertion, snap.snap.removal, snap.grams);
for (const fit of ['press', 'slip']) console.log(fit, pinModel('dowel 3x12', { fit }).hole.diameter);
const dowel = pinModel('dowel 3x12', { thickness: 12, load: 30 });
console.log(dowel.shear, dowel.bearing, dowel.margin, dowel.governs);
const cut = pinHole('dowel 3x12', { fit: 'slip', axis: 'x', depth: 8 }), solid = pin('snap pin 4x6');
console.log(cut.model.hole.teardrop, solid.model.name);
try { pinModel('dowel 3x20', { thickness: 12 }); } catch (e) { console.log(e.message.slice(0, 96)); }
```

```text
4.4 6.22 6.22 0.191
press 3.05
slip 3.3
1122.5 702 23.4 bearing
true snap pin 4x6
pinModel: dowel 3x20 is 20 mm long, and the parts it goes in hold 12 mm of it: it is too long fo
```

`snapPin`, `snapSocket` and `snapPinModel` draw and size a snap pin from plain figures (diameter, shaft length, barb,
slot, gap, lead and back angles, head), as `@rulecad/flexures` drew them before they moved here. Flexures re-exports
them unchanged, so `v.flexures.snapPin` draws the same pin it always has. `parsePin` reads a name and `isPinName`
says whether a text is one. In an assembly, a fit's `fastener` can name pins (`{ "pin": "snap pin 4x6", "count": 2 }`):
`cad check` finds their holes, checks them against these figures and the pins' length against the parts, and `cad
list` and `cad order` name them.

## Printed bolts

A printed bolt is a screw printed with its thread, standing on its head, where a bought one will not do or is not to
hand. Name it as a screw with the word printed, `'M8x20 hex printed'`: it is then printed at any length, not held to
the lengths screws are sold in. `printedBoltModel(name, options)` gives its strength in the plastic it is printed in,
and `printedBolt` its solid (the screw with its thread drawn, as `screw(m, { display: 'thread' })` draws it).

It breaks at the least of three loads:

- **in tension across its root**, its root diameter as drawn, at the plastic's strength across its layers when it
  stands on its head (`strength_z`; a plastic with none, as PLA's set, uses its strength along them and says so) or
  along them when it lies on a flat (`axis: 'x'` or `'y'`, its section less the flat);
- **its teeth sheared off in the nut**, over 0.75 π D1 Le (the bolt's teeth at the nut's minor diameter) and, in a
  printed nut, the nut's own 0.875 π d Le, whichever is less, at the plastic's shear strength (its strength over √3);
- **its head sheared off its shank**, over π d k, k the head's height.

A printed bolt goes in a printed nut or a thread printed in the part (`nut: 'printed'`, the default), each taking half
the printer's `thread_gap`, or in a bought steel nut (`nut: 'steel'`), the bolt then taking the whole gap, so its
root is smaller. `depth` is the thread engaged (default the thread's hex nut height), and `load`, the pull along it, is
held to `load_margin`. Below the smallest pitch the printer resolves it is refused by name, as a thread is, naming the
smallest thread that prints: M6 at 0.2 mm layers.

```js
import { printedBoltModel, printedBolt } from '@rulecad/fixings';

const pair = printedBoltModel('M8x20 hex printed', { load: 200 });
console.log(pair.root, pair.rootArea, pair.tension.load, pair.strip.load, pair.breaking, pair.governs, pair.margin);
const inSteel = printedBoltModel('M8x20 hex printed', { nut: 'steel' }), lying = printedBoltModel('M8x20 hex printed', { axis: 'x' });
console.log(inSteel.root, inSteel.breaking, lying.rootArea, lying.tension.rule);
const solid = printedBolt('M10x30 hex printed');     // its thread drawn: print it standing on its head
console.log(solid.model.name, solid.model.grams);
try { printedBoltModel('M5x20 hex printed'); } catch (e) { console.log(e.message.split('. ')[1]); }
```

```text
6.446 32.63 1272.7 2397.9 1272.7 tension 6.36
6.246 1195 29.67 pla.strength
M10x30 hex printed 4.206
The smallest metric thread that would print is M6 (1 mm pitch)
```

The first line reads: an M8 printed bolt in PLA, in a printed nut, has a 6.446 mm root drawn (the basic 6.646 mm less
its half of the 0.2 mm gap each side), 32.63 mm² of section, which breaks at 39 MPa × 32.63 mm² = 1272.7 N before its
teeth shear (2397.9 N): 6.36 times a 200 N pull. Do a printed bolt up by hand: its thread takes no wrench's torque.
In an assembly, a fasten's `screw` can name one (`"M8x20 hex printed"`): `cad check` holds it to its load with these
sums, and `cad list` lists it as a printed part, not a bought screw. `screwLoad`, `preload`, `torqueFor`, `stripping` and
`seating` with no force given refuse a printed bolt by name and point here: each reads a steel screw's proof load,
which a printed bolt does not have. A printed nut is read by them as usual, since the screw in it is a bought one.

PLA's rule set has no strength across its layers, so a PLA bolt standing on its head is taken at its strength along
them, 39 MPa, which overstates it. The holds coupon's pull bolt measures it: written back with `cad measured`, it
becomes the plastic's `strength_z`, and every printed bolt standing in that plastic is worked out from it.

## Magnets

A magnet holds two parts together with no screw: a lid, a door's catch, a tool on a board. `magnetModel(name,
options)` gives a disc or block neodymium magnet's pull straight off steel and its mass; `magnetSeatModel` its pocket
in a printed part; `magnetSeat` the pocket to subtract, and `magnet` the magnet's solid for an assembly.

**The pull.** The kit's `magnets` rule set holds six discs (6 x 2, 6 x 3, 8 x 3, 10 x 2, 10 x 3 and 12 x 3 mm) and
two blocks (10 x 5 x 2 and 20 x 10 x 2 mm), each with its seller's pull straight off thick mild steel and the grade
it was sold in. Another grade is scaled from it by the square of the middle of the two grades' remanence; with no
grade named, N35, the weakest sold, so a pull is not overstated. Across a gap (`gap`, or the floor under the pocket
when the steel is on that side) the pull is taken as the pull touching times the square of the field on the magnet's
axis there, over the field at its face: an estimate. `count` magnets share a `load`, held to `load_margin`. For a size
the set has no figure for, give its maker's pull (`{ pull: 12 }`, in N).

**The pocket.** Each fit takes its size from the printer's rules, all estimates until the holds coupon measures
them: a press (`fit: 'press'`) is the magnet plus `hole_comp` less `magnet_press`; a glued fit (`fit: 'glue'`) plus
`magnet_glue`; crush ribs (`fit: 'ribs'`) are a glued pocket with three ribs a line wide whose tips stand
`magnet_crush` inside the magnet, so a magnet anywhere in its ±0.1 mm goes in and grips. With no fit given, a disc
standing in its pocket gets crush ribs, and a disc lying on its side (where ribs would hang from the roof) or a block
is glued: each of those passes for every size the set holds, in PLA and PETG. A press grips hardest, but it stretches
the wall: an 8 x 3 disc in PLA at 24.6 MPa round the hoop, past half of PLA's 39 MPa, and a 10 x 5 x 2 block at 39.4
MPa, which splits it. A block's pocket
has its corners relieved by round cuts, so no inside corner is square. Given the part's `thickness`, the floor left
under the pocket is held to `magnet_floor` (three layers). The magnet's own pull draws it out of a pocket that faces its
steel: a press grips by its interference (p = E i / d / (1 + ν), with friction over its wall), crush ribs by the
plastic's strength over the ribs, and glue by the glue, which is not checked here. A press also stretches the pocket's
wall at that pressure, which a magnet at the top of its tolerance can split.

Refused by name: a size the set has no pull for, a floor too thin to print, a pocket opening on the bed wider than
the printer bridges, a block's pocket or crush ribs lying on their side.

A magnet's name is read by this grammar:

```
magnet = shape size [ grade ]                       disc magnet 8x3, disc magnet 10x3 N52, block magnet 10x5x2
shape  = "disc magnet" | "block magnet" | "magnet"  (a magnet alone is a disc; "magnets" is read too)
size   = diameter "x" thickness                     a disc, in mm, magnetised through its thickness
       | length "x" width "x" thickness             a block, in mm, magnetised through its thickness
grade  = "N35" | "N38" | "N40" | "N42" | "N45" | "N48" | "N50" | "N52"   (default magnets.grade, N35)
```

```js
import { magnetModel, magnetSeatModel, magnetSeat, magnet } from '@rulecad/fixings';

const lid = magnetModel('disc magnet 8x3', { count: 2, load: 10 });
console.log(lid.name, lid.touching, lid.total, lid.margin, lid.grams);
for (const fit of ['press', 'glue', 'ribs']) { const s = magnetSeatModel('disc magnet 8x3', { fit, thickness: 5 }); console.log(fit, s.pocket.diameter, s.floor, s.hold); }
const through = magnetSeatModel('disc magnet 8x3 N52', { thickness: 4, recess: 0.4, facing: 'floor' });
console.log(through.magnet.gap, through.magnet.pull);
const cut = magnetSeat('block magnet 10x5x2', { at: [0, 0, 4] }), solid = magnet('disc magnet 8x3');
console.log(cut.model.pocket.size, solid.model.thickness);
try { magnetSeatModel('disc magnet 8x3', { thickness: 3.4 }); } catch (e) { console.log(e.message.slice(0, 98)); }
```

```text
disc magnet 8x3 N35 11.51 23.01 2.3 1.131
press 8 2 557.2
glue 8.2 2 null
ribs 8.2 2 44.2
0.6 12.77
[ 10.2, 5.2 ] 3
magnetSeatModel: a pocket 3 mm deep in a part 3.4 mm thick there leaves a floor of 0.4 mm under th
```

The first line reads: a lid held by two 8 x 3 mm discs. The seller's N45 disc pulls 14.7 N; as N35 it pulls 14.7 ×
(1.19 / 1.345)² = 11.51 N, and two pull 23.01 N, 2.3 times a 10 N pull. A 5 mm thick lid leaves a 2 mm floor under
each 3 mm pocket. Put the magnets' poles the right way round before they go in: two magnets facing each other repel
if they are put in alike. `parseMagnet` reads a name, `isMagnetName` says whether a text is one, and `fieldShare(m, z)`
is the field on a magnet's axis at z from its face over the field at its face. In an assembly, a fit's `fastener` can
name magnets (`{ "magnet": "disc magnet 8x3", "count": 2 }`): `cad check` finds their pockets and reports their pull,
and `cad list` lists them as bought.

## Annular snaps

An annular snap holds a lid on a round box with no screw: it clicks on and pulls off. A bead runs round the outside
of the box's wall near its rim, and the lid's skirt has a groove inside it, the bead's shape grown by the printer's
`fit` all round, with a lead-in at the skirt's mouth. Pushed on, the bead's lead face spreads the skirt and squeezes
the wall; past it, both spring back and the bead sits in the groove touching neither, so nothing is strained at rest.
Pulled, the bead's return face has to spread the skirt again. A part whose job is to hold two parts together lives in
this package, so the annular snap is here, beside the snap pin; a snap hook, whose bending is its job alone, stays in
`@rulecad/flexures`.

`annularSnapModel(figures, options)` gives the numbers and findings; `annularBead` is the bead to add to the box's
wall and `annularGroove` the groove (and with `mouth`, the lead-in) to cut from the lid's skirt, each about the z axis
with the bead's foot at `at`, and each with the model on it as `.model`.

**The figures.** `diameter` is the box's wall outside at the joint, `wall` its thickness, `skirt` the lid's skirt
thickness. `bead` is how far the bead stands off the wall; less the clearance (the printer's `fit`) it is the undercut
the skirt is spread by. `lead` is the angle of the face the lid pushes over, from the axis (default 30°), `back` the
return face's (default 45°, the steepest the printer's `overhang` allows: it is the underside of the bead as the box
stands, and the face over the groove as the lid lies on its top). `land` is the bead's flat top (two layers), and
`boxEnd` and `lidEnd` how far the joint is from each part's free end (the rim, the skirt's mouth). `boxFloor` and
`lidTop` are how far it is from each part's closed end: the box's floor, and the underside of the lid's top. Each is
at least its part's own wall (the box's wall, the skirt): nearer than that the corner is solid and cannot give, so
it is refused.

**The sums.** Both parts are tubes. The Bayer snap-fit guide gives each one's transverse force for a spread y on the
diameter as P = y d Es X, with a geometric factor X from its proportions (X_N for the skirt spread over a rigid
shaft, X_W for the wall squeezed in a rigid tube). Here both give, so they are two springs in series and share the
interference by their stiffness: the guide's graphical method for two flexible parts, worked out. The hoop strain in
each is its share over its diameter, held to the plastic's limit: about 70% of its yield strain for a brief snap in an
amorphous plastic, and 60% of that for a lid opened often (`uses: 'often'`, the default; `'once'` for a joint snapped
once). The yield strain is taken as strength over modulus, below the real one. A joint further than 1.8 √(d t) from a
free end is about three times as stiff; nearer, the kit takes a straight line from 1 to 3. The forces along the push
are the guide's W = P (μ + tan α) / (1 - μ tan α), over the lead face going on and the return face coming off.

**A closed end near the joint.** The guide's tubes are open. A lid's skirt hangs from its top, and the top holds the
skirt round where they meet: a tube's wall bends over a length of about 1/β, with β⁴ = 3 (1 - ν²) / (R² t²), so a
groove within a few times 1/β of the top sits in a skirt far stiffer than a free tube, and the box's wall takes most
of the interference. `tubeRing` works this out as Hetényi's beam on an elastic foundation (the theory the guide's own
annular joint rests on): a ring load on the tube's wall, each end free, closed or long. The part's stiffness is
multiplied by the beam's deflection with that end open over the deflection with it closed, and the bending strain at
the closed end's root, 6 M (1 - ν²) / (E t²), is held to the same limit as the hoop strain (`snap.root`). The end is
taken as fully closed, the stiffest it can be, so the forces and the mate's strain err high. For the 60 mm pot's lid,
1/β is 4.9 mm: a groove 1.3 mm under the top makes the skirt 46 times as stiff, and 5.8 mm under it 1.3 times.

**Refused and failed.** A lead that friction locks (μ tan α of 1 or more) is refused: no push slides the skirt over
it. So is a bead as deep as the skirt, whose groove would cut right through it. The groove must leave at least one of
the printer's `line` behind it (`snap.skirt`). Given `push`, the force the lid is pushed on with, a square push over
it warns (`snap.push`).

**Sizing.** Given no bead, it is sized: the least the print holds (`fixings.snap_least`, 0.2 mm of undercut), or
more where `pull` asks for it, so the lid stays on against twice the pull (`load_margin`), up to the most the strain
allows, rounded up to what the pull needs and down to what the strain allows. A bead given too tall fails by name
(`snap.strain`), with the most undercut that would do.

```js
import { annularSnapModel, annularBead, annularGroove, tubeRing } from '@rulecad/fixings';

const joint = { diameter: 60, wall: 1.68, skirt: 1.26, boxEnd: 6, lidEnd: 1.5, lidTop: 5.8, boxFloor: 30.3 };
const lid = annularSnapModel(joint, { pull: 10 });
console.log(lid.bead, lid.undercut, lid.box.strain, lid.lid.strain, lid.lid.root, lid.permissible);
console.log(lid.force, lid.insertion, lid.removal, lid.margin, lid.lid.stiffer, lid.lid.decay);
const bead = annularBead(lid, { at: 30 }), groove = annularGroove(lid, { at: 30, mouth: 28 });
console.log(bead.model.length, groove.model.groove);
const near = annularSnapModel({ ...joint, boxEnd: 1.5, lidTop: 1.3 }, { pull: 10 });
console.log(near.lid.stiffer, near.box.strain, near.undercut, near.findings.filter((f) => f.level === 'warn').map((f) => f.code));
const tight = annularSnapModel({ ...joint, bead: 0.9 });
console.log(tight.findings.filter((f) => f.level === 'fail').map((f) => `${f.code} ${f.refs?.part ?? ''}`), tight.most.undercut);
console.log(+tubeRing(6, 6).w.toFixed(4), +tubeRing(0, 6, { A: 'free' }).w.toFixed(4));
try { annularSnapModel({ ...joint, bead: 0.2 }); } catch (e) { console.log(e.message.slice(0, 93)); }
try { annularSnapModel({ ...joint, lead: 60 }, { friction: 0.6 }); } catch (e) { console.log(e.message.slice(0, 93)); }
```

```text
0.4 0.2 0.0023 0.0043 0.0032 0.0061
231.8 351.1 695.4 69.54 1.3 4.9
1.493 { inner: 30.2, outer: 30.6, depth: 0.4 }
45.93 0.0061 0.19 [ 'snap.least' ]
[
  'snap.strain box',
  'snap.strain lid',
  'snap.root lid',
  'snap.skirt '
] 0.284
0.125 0.5
annularSnapModel: a bead of 0.2 mm is no taller than the x1c.fit clearance of 0.2 mm round th
annularSnapModel: a 60° lead at friction 0.6 locks: μ tan α is 1.04, 1 or more, so no push sl
```

The first line reads: a pot 60 mm across with a wall of four lines and a skirt of three, its lid to stay on against
10 N, the bead 6 mm under the rim and so the groove 5.8 mm under the lid's top. That needs far less than the least the
print holds, so the bead is 0.4 mm: 0.2 mm of undercut past the 0.2 mm fit. The wall takes 0.23% hoop strain, the
skirt 0.43% and the skirt's root 0.32%, under PLA's 0.61% (0.7 × 0.6 × 39 / 2680). Pushed on square it takes 351.1 N
and pulled off square 695.4 N, 69.54 times the pull. The top makes the skirt 1.3 times as stiff. Those are the guide's forces for the whole bead
at once: a lid put on by hand goes on at a tilt, a part of the bead at a time, and takes much less, which is why it
has a tab to lift it by. With the groove 1.3 mm under the top instead, the skirt is 46 times as stiff, the wall takes
almost all of the snap, and the strain holds the undercut to 0.19 mm, under the least the print holds. A 0.9 mm bead
strains both parts past the limit and leaves the skirt thinner than a line behind its groove; 0.284 mm of undercut is
the most. The beam's own checks: a long tube deflects 1/8 under a ring load, and 1/2 with the load at a free end. The
example project `enclosures` in the repository's bench draws this pot and lid (`snap-pot`) and puts the lid on
(`snap-pot-closed`).

### A slotted skirt

A whole skirt on a stiff box takes a hard push: 351.1 N square for the pot above. Slots cut up from the skirt's mouth
part it into fingers, and each finger bends as a cantilever, far more easily than a ring stretches, so the push falls
several times over. Give `slots: { count, reach, width }`: `count` fingers (3 or more), `reach` from the slots' closed
end to the groove's top edge, and `width` the slots' (default `fixings.snap_slot`,
1 mm, at least the printer's `print_gap`). `snapSlots(model, { at, mouth })` is the cutter: the slots through the
skirt, in the same place as the bead and groove, each ending in a full round so the root that takes the bending has
no square corner.

**The sums.** `skirtFinger` gives one finger. Its section is a sector of the skirt's ring, its sides taken as radial,
2φ round with φ = π / n - w / (2 rm). Its second moment about its own centroid, square to its line of symmetry, is
∫x² dA - A x̄², worked exactly for the sector, so a wide finger's curve counts: for the pot's 16 fingers it is 2.14 mm⁴,
where a flat strip as wide is 1.85. The bead bears on a finger at the groove's bottom edge, the end nearest the mouth:
going on, the lip below the groove rides over the bead's crest, and coming off, the groove's lower face rides up the
bead's return face, each pushing the finger out the whole undercut as that edge passes the crest. So its arm L is
`reach` plus the groove's height, the bead's length and the clearance at each end (`slots.arm` in the model; a bigger
bead lengthens it, so a sized bead is worked at its own arm). Clamped at its root and pushed out y at L, a finger takes
k y with k = 3 E I / L³, and its root strains 3 c y / L², c its farthest fibre from that axis: the beam formulas for a
cantilever with an end load. The fingers side by side are n k / 2 per mm of diameter, in series with the box's wall as
before, and their root strain is held to the same limit as a hoop strain. The lid's top no longer holds the groove
round: each finger is clamped at its root already. The finding `snap.fingers` says what a whole skirt would take for
the same bead.

**Reach.** A short finger strains more than the ring it was cut from, so a slotted skirt wants a deeper lid: reaching
5.8 mm (borne on at 7.411 mm), eight fingers on the pot above hold the bead to 0.097 mm of undercut, under the least the print holds. Refused
by name: under 3 fingers, a slot narrower than `print_gap`, a reach under twice the skirt (too short to bend as a beam)
or past the lid's top (`lidTop`), and fingers narrower than the skirt is thick.

```js
import { annularSnapModel, snapSlots, skirtFinger } from '@rulecad/fixings';

const joint = { diameter: 60, wall: 1.68, skirt: 1.26, boxEnd: 14, lidEnd: 1.5, lidTop: 13.8, boxFloor: 23.3 };
const slotted = annularSnapModel({ ...joint, slots: { count: 16, reach: 11.8 } }, { pull: 10 });
console.log(slotted.bead, slotted.force, slotted.insertion, slotted.removal, slotted.margin, slotted.lid.strain, slotted.slots.whole);
console.log(slotted.slots.finger);
const one = skirtFinger({ count: 16, width: 1, reach: 11.8, inside: 30.2, outside: 31.46 }, 2680);
console.log(+one.stiffness.toFixed(2), +(one.strainPerY * 100).toFixed(3));
const slots = snapSlots(slotted, { at: 20, mouth: 18.3 });
console.log(slots.model === slotted);
try { annularSnapModel({ ...joint, slots: { count: 16, reach: 14 } }); } catch (e) { console.log(e.message.slice(0, 89)); }
```

```text
0.4 21 31.8 63 6.3 0.003 217.8
{
  angle: 20.64,
  width: 11.11,
  inertia: 2.1412,
  fibre: 0.9564,
  stiffness: 6.7
}
10.48 2.061
true
annularSnapModel: slots.reach of 14 mm runs past the lid's top, 13.8 mm from the groove (
```

The first line reads: the same pot with its bead 14 mm under the rim, the lid's skirt in 16 fingers by 1 mm slots,
each 11.8 mm from its root to the groove's top edge. The bead is the least the print holds, 0.4 mm, and bears on the
fingers 13.693 mm from their root (11.8 mm, the bead's 1.493 mm length and 0.2 mm clearance at each end). Its
transverse force is 21 N, where a whole skirt there would take 217.8 N: it goes on square with 31.8 N and comes off
with 63 N, 6.3 times the 10 N pull. The fingers' roots strain 0.30%, under PLA's 0.61%. Each finger is 20.64° round,
11.11 mm wide at its middle, and takes 6.7 N per mm it is pushed out where the bead bears. `skirtFinger` alone takes
the arm it is given: at 11.8 mm it takes 10.48 N per mm, and each millimetre strains its root 2.061%. The bench's `snap-pot`
has this lid as its `slotted` variant, and `snap-pot-slotted-closed` puts it on.

## Measuring the printer's fits

Every clearance a hole, a seat or a pocket is drawn with is a rule of the printer's, and most are estimates until two
coupons measure them, printed together on one plate (`examples/bench/projects/benchmarks/MEASURE.md` says how to read
each):

- the **fixings coupon** (`objects/fixings-coupon`, rows 22 to 28): pilots, insert holes, nut pockets and slots, a
  counterbore, and printed threads for bought bolts, writing `pilot_m3` and its kin, `insert_m3`, `nut_fit`,
  `nut_slip`, `thread_gap` and `thread_flank`;
- the **holds coupon** (`objects/holds-coupon`, rows 40 to 47): snap pin sockets and three barbs (`snap_clearance`,
  `snap_barb`), a 3 mm dowel's and 1.75 mm filament's press and slip holes (`pin_press`, `pin_slip`), 6 x 3 and 8 x 3
  magnet pockets pressed and ribbed (`magnet_press`, `magnet_crush`), printed nuts and bolts for M8 and M10 (a second
  reading of `thread_gap`), and a pull bolt whose waist breaks across its layers (the plastic's `strength_z`).

Each feature on a coupon is drawn by this package from the printer's rules, at the kit's figure and a step either side,
and labelled with its figure. Write the best one back with `cad measured benchmarks/fixings-test x1c.pin_press=0.1`: it
goes into the workspace's copy of the printer's set, marked measured with the date, and every design drawn after it
uses it. `cad measured` refuses a figure no fit of its kind can be (a press of 3 mm), naming what it accepts.

## Refusals and printability

Bad input is refused by name before any geometry is made, with what would be accepted:

| Asked for | Refused with |
|---|---|
| A thread there is no rule set for (`'M7'`) | The threads there are, and how to hand in a rule set of your own |
| A head or a nut that size is not made with (`'M2.5x6 button'`) | The forms it comes in |
| A length that is not sold (`'M3x14 cap'`) | The nearest sold lengths, and `anyLength` |
| A seat, a pocket or a blind hole deeper than the part (`thickness`) | How deep it goes and how thick the part is |
| A depth, a length or a thickness of nothing or less | The name of the option and what it must be |
| A material with no rule set (`'nylon'`) | The materials there are |
| A printed thread too fine for the printer, or on its side with no flat | The smallest thread that would print; the flat |
| A stack no sold screw fits | The nearest length and by how much it misses |
| A pin too long or too short for its part (`thickness`), a dowel size not sold, a pin thinner than `pin_least` | How long the pin is against the parts, the nearest sizes |

`printable(x)` gives what a printer can make of anything this package draws, as findings: pass a model or the solid
made from it. A hole, a seat or a printed thread gives its `.printable` finding for the direction it was drawn for
(a teardrop on its side, a 45° roof going up from the bed, a laid-back flank). A fixing, and a screw, nut, washer or
insert drawn as a light solid, is bought, so it fails, and says how to draw it with its thread.

```js
import { printable, holeModel, screwModel, nutPocketModel, fixingModel } from '@rulecad/fixings';

console.log(printable(holeModel('M3', { axis: 'x' }))[0].text);
console.log(printable(screwModel('M3x12 cap'))[0].level);
for (const refused of [() => fixingModel('M7'), () => fixingModel('M2.5x6 button'), () => fixingModel('M3x14 cap'), () => nutPocketModel('M4', { thickness: 3 }), () => holeModel('M3', { depth: -2 })]) {
  try { refused(); } catch (e) { console.log(e.message.slice(0, 96)); }
}
```

```text
lying along x, the hole is a teardrop: a 45° roof, so it prints with no support
fail
fixingModel: no thread "M7". There are: M1.6, M2, M2.5, M3, M4, M5, M6, M8, M10, M12, 4-40 UNC, 
fixingModel: M2.5 is not made with a button head, by its rule set (m2_5): it comes as cap, count
fixingModel: an M3 screw is not sold 14 mm long: the nearest are 12 mm and 16 mm (m3.lengths: 5,
nutPocket: a pocket 3.6 mm deep for an M4 nut goes 3.6 mm into a part 3 mm thick there: it is de
hole: depth is a number above 0, in mm (got -2)
```

## Limits

- **Lengths are the socket cap screw's.** Each thread's rule set lists the lengths of ISO 4762 cap screws (or the
  inch equivalent), and button, countersunk and hexagon head screws are held to the same list, though their own
  standards run over slightly different ranges. Pass `{ anyLength: true }` for a length you know you can buy. Set
  screws are not held to a list, and the screws for plastic list none, so `lengthFor` cannot choose one for them.
- **A hexagon head's seat has no socket in it.** No rule set holds the outside diameter of a socket or a spanner, so
  `counterbore` for a hexagon head clears the head's corners by the printer's fit, warns (`counterbore.socket`), and
  takes `diameter` for the tool you use.
- **Screws are steel.** A name carries no material or property class. Masses are for `material: 'steel'` or
  `'stainless'`; strength is class 8.8, A2-70 with `screw: 'stainless'`, or any class by `proof`. A screw drawn with
  its thread to print still reports a steel screw's mass.
- **Printed threads** are drawn for three forms, at pitches the printer resolves, with trapezoidal pitches from 1.5
  to 12 mm (give `ac` for others). Tapered and pipe threads are outside this package.
- **Strength** is first sums at basic thread sizes. Shear and tension on a joint under load, fatigue, creep in
  plastic and heat are for a calculation such as VDI 2230, or a test.
- **A pilot lying on its side** only warns (`hole.side`): the figures are for a hole standing upright.

## What is measured and what is estimated

- **Standards** (`spec`): threads, clearance holes, heads, nuts, washers, lengths and proof stresses, each from its
  standard as tabulated on the pages its rule names. The thread profiles are ISO 68-1's and ISO 2904's formulas.
- **Measured**: the X1C's M3 pilot (`x1c.pilot_m3`, 2.9 mm, from the kit's fit bar). It is the only measured figure
  so far. The fixings coupon and the holds coupon measure the rest, per printer and plastic, and `cad measured`
  writes each result to the printer's rule set (see [Measuring the printer's fits](#measuring-the-printers-fits)).
- **Community**: the annular snap's share of the yield strain for a brief snap (`snap_brief`, 70%) and for one opened often
  (`snap_often`, 60% of that) and its remote joint's factor (`snap_remote`, 3), from the Bayer snap-fit guide for its own
  plastics, applied to printed PLA and PETG unchecked; magnets' pulls straight off steel (the seller's figures, supermagnete) and the grades' remanence, heat-set inserts (CNC Kitchen's sheet), pilots for M2 to M4 (Bambu Lab's figures for PLA) and for
  the PT screws (the maker's factor for ABS), the engagement rules, the printer's `hole_comp`, `fit` and `bridge`,
  the two layers a nut pocket is sunk, and the three quarters of proof load a fully tightened screw is taken to carry.
- **Estimates**: pilots for M1.6, M5 and up, and every inch size (nobody has published one); the printer's `slip`,
  `press`, `thread_gap`, `snap_clearance`, `pin_press`, `pin_slip`, `magnet_press`, `magnet_glue` and `magnet_crush`; a steel dowel's shear strength and the play a
  snap pin's shaft may have; a magnet's pull at a grade other than its seller's and across a gap, the grip of a press
  or of crush ribs on a magnet, the three layers under a magnet's pocket, and every strength of a printed bolt; the layers and line a printed thread needs; the layer left over a nut put in mid-print;
  an annular snap's friction (`snap_friction`, 0.5), least undercut (`snap_least`) and slot width (`snap_slot`, 1 mm), a slotted skirt's fingers clamped at their roots with radial sides, its stiffness between a free end
  and a remote joint, a closed end taken as fully closed, the skirt's full thickness at its groove, and its plastic's yield strain (strength over modulus) and modulus in place of the guide's secant modulus;
  a material's shear strength (its tensile strength over √3) and what it bears under a head (its strength); the nut
  factor K (0.2); the diameter of thread asked in an insert; the millimetre kept at a screw's tip; and every mass.
  A mass comes from the part's outline, with no socket and no knurls, and an insert's alloy is assumed.

Nothing here has been printed yet as a test of this package: the checks are geometry, hand-worked sums and
`@rulecad/printcheck`. The rules this package adds to the threads' and the printer's are exported as `DEFAULTS`, each
with its `rule`, `kind` and `source`.

## Formulas

| What | Formula | Source |
|---|---|---|
| A hole as drawn | d = figure + hole_comp, where the figure is the size wanted; d = figure, where it is as drawn | The rule's own text, and the vocabulary in `@rulecad/rules` |
| Counterbore | D = head + 2 fit + hole_comp; depth = head height, up to a whole layer | As `@rulecad/motors` sinks a screw's head |
| Countersink | D = sharp-edge head + hole_comp; depth = (D - d) / (2 tan(angle / 2)) | ISO 10642 (90°), ASME B18.3 (82°), in the thread's rule set |
| Nut pocket | flats = nut flats + hole_comp + fit; depth = nut height + 2 layers | The kit's lever bench (`examples/bench`) |
| A hexagon's corners | across corners = flats / cos 30° | Geometry |
| Nut slot | reach = depth + flats / (2 cos 30°) for a hexagon, depth + flats / 2 for a square | Geometry |
| Roof too wide to bridge | rise = (span - bridge) / 2, at 45° | `@rulecad/shapes` `wallOpening` |
| Thread engaged | depth = engagement × major diameter: 1 in steel, 2 in aluminium, 2.5 in plastic | `engagement` in `@rulecad/rules` (Nord-Lock and Bossard for metal, Bambu Lab for plastic) |
| Pitch diameter | d2 = d - 0.6495 P, for a 60° thread | ISO 68-1 basic profile |
| A screw's mass | m = ρ (π/4 d2² L + head volume), with ρ = 7.85 g/cm³ for steel, 8.0 for stainless | EN 1991-1-1 table A.4; ASM, AISI 304 (in `@rulecad/rules`) |
| A nut's mass | m = ρ (√3/2 s² - π/4 d2²) h, s across the flats | Geometry |
| An insert's mass | m = ρ (π/4 D² - π/4 d2²) L, with ρ = 8.47 g/cm³ for brass | Aalco, CW614N datasheet; the alloy is assumed |
| Metric and unified thread | H = (√3/2) P; tooth height 5H/8 = 0.5413 P; d1 = d - 1.0825 P; d2 = d - 0.6495 P; crest flat P/8 on a screw, P/4 in a nut | ISO 68-1 basic profile, as worked at Wikipedia, ISO metric screw thread |
| Trapezoidal thread | H1 = 0.5 P; h3 = H4 = H1 + ac; d2 = d - 0.5 P; d3 = d - 2 h3; D1 = d - P; D4 = d + 2 ac; ac = 0.15 (P 1.5), 0.25 (P 2 to 5), 0.5 (P 6 to 12); flanks 15° | ISO 2904, as given at Roymech, Trapezoidal threads; ac as DIN 103 tabulates it at Wikipedia, Trapezoidal thread form |
| Lead of a multi-start thread | lead = starts × pitch | ISO 2904's designation: Tr 8x8(P2) is lead 8, pitch 2 |
| A flank's overhang | overhang from upright = 90° - the flank's angle from the axis's normal; laid back to β = 90° - the printer's overhang | Geometry, with `overhang` in the printer's rule set |
| A printed tooth | height = min(standard, (root width - P/8) / (tan α + tan β)), turning about the root | Geometry: the tooth kept inside the standard's outline |
| Smallest pitch that prints | P ≥ 5 layers, and P ≥ line × P / tooth height (a tooth a line deep) | Working figures of this package (`DEFAULTS`), estimates |
| Thread engaged | need = engagement × d; threads = depth / P | `engagement` in `@rulecad/rules` |
| Shear area of an internal thread | A = π n Le Ds [1/(2n) + 0.57735 (Ds - En)], which at basic sizes (Ds = d, En = d2, n = 1/P) is 0.875 π d Le | Machinery's Handbook and FED-STD-H28/2B, as given at Engineers Edge (thread shear area) and Roymech (Thread calcs). Applied at basic sizes, with no tolerances |
| Shear strength | τ = strength / √3 | The von Mises criterion (Wikipedia). An estimate for a printed plastic |
| Load that strips the thread | F = τ A | The two rows above |
| A screw's stress area and proof load | At = (π/4) (d - 0.9382 P)², or (d - 0.9743 P)² for an inch thread; Fp = At × proof stress | ISO 898-1's stress area as Machinery's Handbook gives it (SolidWorks help, Tensile stress area of bolt); proof stress in the thread's rule set |
| Clamp force from torque | T = K d F, with K = 0.2 | The short form of the torque relation, as at Wikipedia, Bolted joint. VDI 2230 splits K into thread friction, head friction and pitch: that fuller form is not applied here |
| A screw tightened fully | F = 0.75 × proof load | Wikipedia, Bolted joint |
| Pressure under a head | p = F / (π/4 (D² - dh²)), D the head (a hexagon's flats) or the washer, dh the hole as drawn | Geometry; the limit is the material's strength, an estimate |
| Shear on each screw of a group | S = F / n + M d / Σd², the second across the line from the centroid, the two added as vectors | The elastic method for eccentrically loaded bolt groups, as at steelcalculator.pages.dev (Bolt group capacity) |
| Pull on each screw of a group | P = Fz / n + b x + c y, with Σ P y = Mx and Σ P x = -My about the centroid; screws in a line tip about the clamped face's edge, P = M / (n × pivot) | An estimate of this package: the plane through the centroid holds while the parts stay pressed together. No source was read for it |
| A screw under its load | the screw: (Fp + k P)² + 3 (k S)² = proof load²; the thread: Fp + k P = strip load; the clamp: μ (Fp - k P) = k S; the margin is the least k of the first two | Von Mises on the stress area; the screw takes the whole pull and the clamp loses the whole pull, each the safe side for a part far softer than the screw. μ is `fixings.clamp_friction`, an estimate |
| A screw's length | grip = stack + washer - sunk; engaged = length - grip; fits where need ≤ engaged ≤ room | Geometry, with the rules for need and room in the table under `lengthFor` |
| A snap pin's half | k = E w t³ / 4L³, with L the slot, t = (d - gap) / 2, w = 0.8 d; strain at the root 3 t y / 2 L² for the barb y | The cantilever snap-fit (BASF and Bayer snap-fit design guides), as `@rulecad/flexures` models a snap hook |
| Push in and pull out | W = 2 k y (μ + tan α) / (1 - μ tan α), α the lead or back angle; holds where α is 90° or μ tan α ≥ 1 | The same guides |
| A pin's shear | F = τ π d² / 4 × planes, a snap pin's area less its slot (gap × d); τ = strength / √3, or `pins.dowel_shear` for steel | Von Mises; the dowel's figure is an estimate that understates a hardened pin |
| The hole's bearing | F = strength × d × grip, the grip half the parts' thickness unless given | Projected area, as a screw's seat is taken; an estimate |
| A pin's mass | m = ρ π d² / 4 L, a snap pin's from its drawn solid | Geometry, with the plastic's or steel's density |
| A printed bolt in tension | F = strength × (π/4) dr², dr the root as drawn (the basic d - 1.0825 P less the bolt's share of thread_gap each side); strength across the layers standing (strength_z), along them lying; lying, the section less the segment past its flat | ISO 68-1 basic profile; the plastic's rule set. An estimate |
| Its teeth sheared in the nut | the bolt's A = 0.75 π D1 Le, D1 = d - 1.0825 P (its tooth is 0.75 P wide where the nut's crest flat, P/4, ends); a printed nut's A = 0.875 π d Le; F = (strength / √3) × the lesser | The same derivation as the internal thread's shear area above, at basic sizes; an estimate |
| Its head sheared off | F = (strength / √3) × π d k, k the head's height | Geometry; an estimate |
| A magnet's pull at another grade | F = F_sold × (Br / Br_sold)², each Br the middle of its grade's range | The force on an iron face, F = B² A / 2μ0 (Wikipedia, Force between magnets), with B in proportion to Br; remanence from supermagnete's physical magnet data. An estimate |
| A magnet's pull across a gap | F(z) = F(0) × (B(z) / B(0))²; a disc's B(z) = Br/2 [(D + z) / √(R² + (D + z)²) - z / √(R² + z²)], a block's Br/π [atan(LW / (2z √(4z² + L² + W²))) - atan(LW / (2(D + z) √(4(D + z)² + L² + W²)))] | supermagnete, How do you calculate the magnetic flux density? (the formulas); the square as above. An estimate |
| A magnet's pocket | press: d + hole_comp - magnet_press; glue: d + hole_comp + magnet_glue; ribs: the glue pocket, three ribs' tips at d + hole_comp - magnet_crush | The printer's rules, estimates until the coupon measures them |
| A press's grip on a magnet | p = E i / d / (1 + ν), i = magnet_press; hold = μ p π d h; the pocket's wall stretched round its hoop at p | A rigid disc pressed into a hole in a wide plate (Lamé's thick cylinder with an infinite outer radius); μ is clamp_friction. An estimate, which creep lowers |
| Crush ribs' grip | hold = μ × strength × n w h, n ribs a line w wide, crushed to the plastic's strength | An estimate of this package |
| A magnet's mass | m = 7.5 g/cm³ × its volume | magnets.density, worked from sellers' weights |
| An annular snap's geometric factor | X_N = 0.62 √((k - 1)/(k + 1)) / ((k² + 1)/(k² - 1) + ν), k = d0 / d, for the skirt; X_W the same with - ν and k = d / di, for the wall | Bayer, Snap-Fit Joints for Plastics, the annular snap joint (pages 21 and 22) |
| Its transverse force | P = y d Es X for each part alone, y on the diameter; the two in series, k = 1 / (1/k_box + 1/k_lid) with k = factor × d E X; factor 1 at a free end, 3 from 1.8 √(d t) in, a straight line between | The same guide (pages 21 and 22, and page 24 for two flexible parts); Es taken as the modulus, and the line an estimate |
| Its hoop strain | ε = (P / k_part) / d_part, held to 0.7 × strength / modulus, × 0.6 for a joint opened often | The same guide (page 11, and the note to Table 2 on page 12); yield strain as strength over modulus, an estimate on the safe side |
| Its forces along the push | W = P (μ + tan α) / (1 - μ tan α), α the lead going on and the return face coming off; refused where μ tan α ≥ 1 on the lead | The same guide (page 14) |
| A closed end near the joint | w'''' + 4 w = 0 in ξ = βx, β⁴ = 3 (1 - ν²) / (R² t²); a ring load q steps w''' by q / (D β³), D = E t³ / 12 (1 - ν²); a free end has w'' = w''' = 0, a closed one w = w' = 0; the part is stiffer by w(open) / w(closed) | Hetényi, Beams on Elastic Foundation (1946): a long tube gives w = Pβ / 2k, a free end 2Pβ / k; the end taken as fully closed, an estimate on the stiff side |
| The bending at a closed end | M = w''(ξ) q / β, q = P / (π d); ε = 6 M (1 - ν²) / (E t²) | Plate bending, with the same beam |
| A slotted skirt's finger | φ = π / n - w / (2 rm); A = φ (ro² - ri²), A x̄ = 2 (ro³ - ri³) sin φ / 3, I = (ro⁴ - ri⁴)(φ + sin φ cos φ) / 4 - A x̄²; k = 3 E I / L³; root strain 3 c y / L²; the lid n k / 2 per mm of diameter | The area moments of a ring's sector, and the cantilever with an end load (deflection P L³ / 3 E I, root stress P L c / I) from Euler-Bernoulli beam theory; the root taken as clamped, an estimate on the stiff side |

VDI 2230 and Machinery's Handbook are named because the plan asked for them. Neither was read at first hand for
this package: the handbook's thread shear area and stress area are applied as the pages above give them, and VDI
2230's method is not implemented.

## Glossary

- **Annular snap**: a bead round a round part that clicks into a groove round its mate: a lid that snaps on.
- **Hoop strain**: how much a ring is stretched (or squeezed) round its circumference, the change in its diameter over its diameter.
- **Clearance hole**: a hole a screw passes through without touching, a little wider than the thread.
- **Clamp force, preload**: the force a tightened screw presses the parts together with.
- **Counterbore**: a wider, flat-bottomed step at the mouth of a hole that hides a screw's head.
- **Countersink**: a cone at the mouth of a hole for a flat-head screw to sit flush in.
- **Crest, root, flank**: the top of a thread's tooth, the bottom of the groove between teeth, and the sloping side joining them.
- **Engagement**: the length of a screw's thread that is inside the thread it screws into.
- **Finding**: a result in the kit's one shape: `level` (`pass`, `info`, `warn`, `fail`), `text`, `code`, and `values` and `refs` where they apply.
- **Heat-set insert**: a threaded brass bush pressed into a printed hole with a hot soldering iron.
- **Hole compensation**: what is added to a printed hole's diameter because printed holes come out small.
- **Lead**: how far a nut travels in one turn. Pitch times the number of starts.
- **Major diameter, minor diameter**: a thread's diameter over its crests (the screw's nominal size) and over its roots.
- **Mate**: the thread a thread screws into.
- **Nut factor (K)**: the number that ties tightening torque to clamp force, mostly friction.
- **Overhang**: how far a surface leans out from upright as it rises. Past about 45° a printer needs support under it.
- **Pilot**: a plain hole a screw forms its own thread in as it is driven into plastic.
- **Pitch**: the distance from one thread tooth to the next along the screw.
- **Pitch diameter**: the diameter at which a thread's tooth and the gap beside it are equally wide.
- **Proof load, proof stress**: the most a screw holds with no permanent stretch, and that as a stress.
- **Property class**: a steel screw's strength grade (8.8, 10.9, 12.9).
- **Rule set**: a JSON file of named, sourced values in `@rulecad/rules`: one per thread, printer or material.
- **Start**: one of the separate threads wound side by side on a multi-start screw.
- **Stripping**: a thread failing by its teeth shearing off.
- **Secant modulus**: a plastic's stress over its strain at a given strain, a little under its modulus at small strains.
- **Slotted skirt**: a lid's skirt cut by slots from its mouth into fingers, each a cantilever, so an annular snap goes on with a smaller push.
- **Teardrop**: a round hole with a pointed top, so a hole lying on its side prints with no support.
- **Trapezoidal thread**: the flat-topped thread of a lead screw, with flanks 30° apart.
- **Undercut**: how far a snap's bead stands past the part it has to pass, so the parts must bend to let it by.

## Sources

Each figure's own source is in its rule (`m.figures.<name>.source`, and `DEFAULTS`). The formulas rest on:

- [ISO metric screw thread](https://en.wikipedia.org/wiki/ISO_metric_screw_thread), Wikipedia: the ISO 68-1 basic profile.
- [Trapezoidal threads](https://roymech.org/Useful_Tables/Screws/Trapezoidal.html), Roymech: the ISO 2904 formulas; and [Trapezoidal thread form](https://en.wikipedia.org/wiki/Trapezoidal_thread_form), Wikipedia: crest clearances and the designation.
- [Thread shear area](https://engineersedge.com/calculators/thread_shear_area_15876.htm), Engineers Edge, and [Thread calcs](https://roymech.org/Useful_Tables/Screws/Thread_Calcs.html), Roymech: the thread shear areas of Machinery's Handbook and FED-STD-H28/2B.
- [Tensile stress area of bolt](https://help.solidworks.com/2014/English/SolidWorks/cworks/r_Tensile_Stress_Area_Bolt.htm), SolidWorks help, citing Machinery's Handbook.
- [Bolted joint](https://en.wikipedia.org/wiki/Bolted_joint), Wikipedia: torque and preload, the nut factor, and how tightening methods scatter.
- [Bolt group capacity](https://steelcalculator.pages.dev/reference/bolt-group-capacity/), the elastic method: direct and torsional shear in a group.
- [Von Mises yield criterion](https://en.wikipedia.org/wiki/Von_Mises_yield_criterion), Wikipedia: shear yield from tensile yield.
- [How do you calculate the magnetic flux density?](https://www.supermagnete.de/eng/faq/How-do-you-calculate-the-magnetic-flux-density), supermagnete: the field on a disc's and a block's axis; [Physical magnet data](https://www.supermagnete.de/eng/physical-magnet-data), supermagnete: each grade's remanence; and [Force between magnets](https://en.wikipedia.org/wiki/Force_between_magnets), Wikipedia: the force on an iron face, F = B² A / 2μ0. Read on 2026-11-21; each magnet's pull is its seller's page, named in its rule.
- [Snap-Fit Joints for Plastics: A Design Guide](https://fab.cba.mit.edu/classes/S62.12/people/vernelle.noel/Plastic_Snap_fit_design.pdf), Bayer MaterialScience: the annular snap joint (its geometric factors, deflection and mating forces and worked lamp cover), the permissible strain for a snap and the friction table. Read on 2026-11-23.
- M. Hetényi, Beams on Elastic Foundation, University of Michigan Press, 1946: a thin tube's wall under a ring load as a beam on an elastic foundation, with its long-tube and free-end deflections (Pβ / 2k and 2Pβ / k), which `tubeRing` reproduces in its tests. Not read at first hand for this package: the equation and the two results are the textbook ones, and the kit checks its solution against them and against a short cantilever's P L³ / 3 D.

The rest were read on 2026-11-15. The plan for this package is [issue 212](https://github.com/JoniBach/rulecad/issues/212),
and its specification is `docs/fixings-and-frames.md` in the repository. In `@rulecad/cad` the package is to become
`v.fixings` in designs and a `fasten` relation in assemblies: that work is not in this release.

## Licence

MIT.
