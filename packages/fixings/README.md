# @rulecad/fixings

Screws, nuts, washers and inserts described by rule sets, and the holes and seats they need in a printed part. Part
of [rulecad](https://github.com/JoniBach/rulecad), a kit for designing physical things where every measurement says
which rule it comes from.

**This is a first release that holds the name.** It installs and loads, and it has no functions to call yet. They
arrive with 0.1.0. Until then there is no reason to install it.

```js
import { status } from '@rulecad/fixings'
status.release // 'placeholder' now, 'ready' from 0.1.0
```

## What it will do

- **A fixing as a model from its rules.** `fixingModel('M3x12 cap')` gives the head, the clearances, the tap drill
  and the pitch, each with the standard it comes from. Metric from M1.6 to M12, and inch sizes.
- **Holes by purpose.** A clearance hole, a pilot a screw cuts its own thread in, a hole to tap, a hole for an
  insert: the design says what the hole is for, and the rules and the printer size it.
- **Seats.** Counterbores, countersinks, nut pockets, nut traps and insert bosses that print without supports.
- **Reference hardware.** Light solids of screws, nuts, washers and inserts for an assembly.
- **Threads cut for printing**, for the large threads where that is worth doing.
- **Strength and length.** Whether enough thread is engaged, the load that strips it, and the sold length that fits
  a stack of parts.

In `@rulecad/cad` it becomes `v.fixings` in designs and a `fasten` relation in assemblies that checks a screwed
joint and puts every screw on the shopping list.

## Where the work is

The plan and its tickets are in [issue 212](https://github.com/JoniBach/rulecad/issues/212). The specification is
`docs/fixings-and-frames.md` in the repository.

## Licence

MIT.
