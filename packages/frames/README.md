# @rulecad/frames

Structures built from beams. A beam is a length of a profile: an aluminium extrusion from any maker's spec sheet, a
plain tube or angle, or a beam printed in plastic. Part of [rulecad](https://github.com/JoniBach/rulecad), a kit for
designing physical things where every measurement says which rule it comes from.

**This is a first release that holds the name.** It installs and loads, and it has no functions to call yet. They
arrive with 0.1.0. Until then there is no reason to install it.

```js
import { status } from '@rulecad/frames'
status.release // 'placeholder' now, 'ready' from 0.1.0
```

## What it will do

- **Profiles as rule sets.** T-slot in metric and inch series, V-slot, the small 10 and 15 mm beams, tube, angle
  and channel, each from its maker's sheet with its sources, plus any section of your own.
- **Beams.** A profile and a length, with an address for any point along any face, so things attach by saying
  where.
- **Joins that do their own drilling.** Say how two beams are joined (a blind joint, a bracket, a gusset) and the
  tapped ends, access holes, fittings and screws follow.
- **Fittings drawn from the profile's rules.** Brackets, feet, panel clips, mounts and slot-nut carriers that print
  without supports, with bought ones as an alternative.
- **Guides.** Linear rails, V-wheels, rods and printed sliders on a beam, each an ordinary sliding joint.
- **Printed beams**, with profiles that print lying down and still take a standard slot nut.

In `@rulecad/cad` a frame gets a cut list, a cut-and-drill sheet per beam, a build order, and checks as a structure:
how far it sags, where it is stressed, how it sways, and what it resonates at.

It is called frames because "extrusion" also means filament leaving a nozzle.

## Where the work is

The plan and its tickets are in [issue 240](https://github.com/JoniBach/rulecad/issues/240). The specification is
`docs/fixings-and-frames.md` in the repository.

## Licence

MIT.
