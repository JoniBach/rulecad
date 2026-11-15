# @rulecad/fixings

Screws, nuts, washers and inserts, and the holes and seats they need in a printed part. A **fixing** is anything on
a screw thread: the thread itself (`M3`), a whole screw (`M3x12 cap`), a nut, a washer, or a heat-set insert (a
threaded brass bush melted into plastic). You name the fixing, and this package looks its dimensions up from rules and
gives you the model, the hole, the seat and the solid. It also draws a real thread to print where one is worth it,
and does the first sums on a joint: how much thread is engaged, the load that strips it, the clamp force from a
tightening torque, the pressure under a head, and the sold length that fits. Every figure says how far to trust it
and where it comes from.
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
| [Refusals and printability](#refusals-and-printability) | `printable` |

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
`material: 'PETG'`. Without one, the thread's starting figure is used (`m3.pilot`, a community figure, or an estimate
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
  or a clearance in mm. A hexagon goes through shapes' `nutPocket`: open from above, with a 45° roof going up from
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
kit's rule sets (`pla`, `petg`, `al6061`, `al7075`, `s275`, `ss304`), the workspace's own set of that name (`sets`),
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
as `petg` has), the weaker of the two is taken; where it has none (`pla`), the finding says so. The clamp force from
a torque scatters by a quarter to a third either way. Take the results as a first check, keep a working load to half
of what they give, and test a joint that matters.

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
  so far. The fixings coupon in the plan measures the rest, per printer and plastic.
- **Community**: heat-set inserts (CNC Kitchen's sheet), pilots for M2 to M4 (Bambu Lab's figures for PLA) and for
  the PT screws (the maker's factor for ABS), the engagement rules, the printer's `hole_comp`, `fit` and `bridge`,
  the two layers a nut pocket is sunk, and the three quarters of proof load a fully tightened screw is taken to carry.
- **Estimates**: pilots for M1.6, M5 and up, and every inch size (nobody has published one); the printer's `slip`,
  `press` and `thread_gap`; the layers and line a printed thread needs; the layer left over a nut put in mid-print;
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

VDI 2230 and Machinery's Handbook are named because the plan asked for them. Neither was read at first hand for
this package: the handbook's thread shear area and stress area are applied as the pages above give them, and VDI
2230's method is not implemented.

## Glossary

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
- **Teardrop**: a round hole with a pointed top, so a hole lying on its side prints with no support.
- **Trapezoidal thread**: the flat-topped thread of a lead screw, with flanks 30° apart.

## Sources

Each figure's own source is in its rule (`m.figures.<name>.source`, and `DEFAULTS`). The formulas rest on:

- [ISO metric screw thread](https://en.wikipedia.org/wiki/ISO_metric_screw_thread), Wikipedia: the ISO 68-1 basic profile.
- [Trapezoidal threads](https://roymech.org/Useful_Tables/Screws/Trapezoidal.html), Roymech: the ISO 2904 formulas; and [Trapezoidal thread form](https://en.wikipedia.org/wiki/Trapezoidal_thread_form), Wikipedia: crest clearances and the designation.
- [Thread shear area](https://engineersedge.com/calculators/thread_shear_area_15876.htm), Engineers Edge, and [Thread calcs](https://roymech.org/Useful_Tables/Screws/Thread_Calcs.html), Roymech: the thread shear areas of Machinery's Handbook and FED-STD-H28/2B.
- [Tensile stress area of bolt](https://help.solidworks.com/2014/English/SolidWorks/cworks/r_Tensile_Stress_Area_Bolt.htm), SolidWorks help, citing Machinery's Handbook.
- [Bolted joint](https://en.wikipedia.org/wiki/Bolted_joint), Wikipedia: torque and preload, the nut factor, and how tightening methods scatter.
- [Bolt group capacity](https://steelcalculator.pages.dev/reference/bolt-group-capacity/), the elastic method: direct and torsional shear in a group.
- [Von Mises yield criterion](https://en.wikipedia.org/wiki/Von_Mises_yield_criterion), Wikipedia: shear yield from tensile yield.

All were read on 2026-11-15. The plan for this package is [issue 212](https://github.com/JoniBach/rulecad/issues/212),
and its specification is `docs/fixings-and-frames.md` in the repository. In `@rulecad/cad` the package is to become
`v.fixings` in designs and a `fasten` relation in assemblies: that work is not in this release.

## Licence

MIT.
