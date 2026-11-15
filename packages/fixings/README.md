# @rulecad/fixings

Screws, nuts, washers and inserts, and the holes and seats they need in a printed part. A **fixing** is anything on
a screw thread: the thread itself (`M3`), a whole screw (`M3x12 cap`), a nut, a washer, or a heat-set insert (a
threaded brass bush melted into plastic). You name the fixing, and this package looks its dimensions up from rules and
gives you the model, the hole, the seat and the solid. Every figure says how far to trust it and where it comes from.
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
on it as `.model`. Lengths are in mm, angles in degrees, masses in grams.

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
| `thread` | A thread modelled to print | Refused for now: it arrives with this package's printed threads | |

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

Depth: a clearance hole needs the thickness it passes through. A pilot defaults to the thread's `pilot_depth`, or 2.5
diameters where it has none; an insert hole to `insert_depth` (the insert and 1 mm), or `insert_length` when it goes
through; a tapped hole to the engagement rule for its `material` (1 diameter in steel, 2 in aluminium, 2.5 in plastic).

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

Each has a twin with `Model` on its name (`counterboreModel`) that gives the numbers and the findings.

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

`screw`, `nut`, `washer` and `insert` are light solids for an assembly: the thread is a plain cylinder at the major
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

## What is measured and what is estimated

- **Standards** (`spec`): threads, clearance holes, heads, nuts, washers, lengths and strength, each from its
  standard as tabulated on the pages its rule names.
- **Measured**: the X1C's M3 pilot (`x1c.pilot_m3`, 2.9 mm, from the kit's fit bar). It is the only measured figure
  so far. The fixings coupon in the plan measures the rest, per printer and plastic.
- **Community**: heat-set inserts (CNC Kitchen's sheet), pilots for M2 to M4 (Bambu Lab's figures for PLA) and for
  the PT screws (the maker's factor for ABS), the printer's `hole_comp`, `fit` and `bridge`, and the two layers a nut
  pocket is sunk (as the kit's lever bench draws it).
- **Estimates**: pilots for M1.6, M5 and up, and every inch size (nobody has published one); the printer's `slip`
  and `press`; the layer left over a nut put in mid-print; and every mass. A mass comes from the part's outline, with
  no socket and no knurls, and an insert's alloy is assumed.

Nothing here has been printed yet as a test of this package: the checks are geometry and `@rulecad/printcheck`.

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

The rules this package adds to the threads' and the printer's are exported as `DEFAULTS`, each with its `rule`,
`kind` and `source`.

## What comes next

Threads modelled to print, the strength of a joint (thread engagement, stripping, preload, bearing pressure under a
head) and choosing a sold length for a stack of parts are planned and are not in this release. In `@rulecad/cad` the
package becomes `v.fixings` in designs and a `fasten` relation in assemblies. The plan and its tickets are in
[issue 212](https://github.com/JoniBach/rulecad/issues/212), and the specification is `docs/fixings-and-frames.md`
in the repository.

## Licence

MIT.
