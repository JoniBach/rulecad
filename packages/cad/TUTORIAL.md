# Your first parts with cad

A walk from an empty folder to a part of your own, checked against the thing it fits. It takes about twenty minutes
and needs Node 20 or later. Every file and command here is run by the tests as written, so what you type is what works.

The words used:

- **Workspace**: the folder your designs live in.
- **Project**: a group of designs that belong together (`home`).
- **Object**: one design: a `.json` of its variables and a `.js` that draws its shape.
- **Rule set**: facts shared by designs, each with its source: a printer's limits (`x1c`), a screw's sizes (`m4`).
- **Assembly**: objects placed together, to check how they fit.

## 1. Start a workspace

```sh
npm create rulecad my-designs
cd my-designs
npx cad check home/soap-tray
```

The workspace comes with one design, a soap tray, and `check` builds it and tests it for printing:

```
Soap tray 0.1.0
  ✓ files match their schemas
  ✓ every measurement is a variable
  ✓ 110 × 75 × 12 mm, fits the bed
  ✓ 6955.8 mm² flat on the bed
  ✓ no overhangs past 45°
  ✓ closed solid
```

The first check also copies the printer's rule set into `rules/x1c.json`. It is yours now: when you measure your own
printer, correct the values there and every design follows.

## 2. See where a number comes from

Open `projects/home/objects/soap-tray.json`. Each variable has a value and a `rule` saying why. A value can be a
number, or arithmetic over other names:

```json
"wall": { "value": "x1c.line * 4", "unit": "mm", "rule": "Four print lines: stiff, and no gaps between lines" }
```

`x1c.line` is the printer's line width, from its rule set. Ask what any value rests on:

```sh
npx cad why home/soap-tray.wall
npx cad rules home/soap-tray
```

`why` follows one value down to the rules and their sources; `rules` lists every variable and rule the design uses.

## 3. Change it

Variables with a `tweak` range can be changed for one run, without touching the file, or for good:

```sh
npx cad check home/soap-tray --set length=140
npx cad set home/soap-tray length=120
```

`set` edits the `.json` and keeps the rest of the file as it was. It refuses a change that would leave the design
broken.

## 4. A part of your own

A wall hook: a back plate with a hole for an M4 screw, and an arm.

```sh
npx cad new home/hook
```

That makes `projects/home/objects/hook.json` and `hook.js` from a template. Replace the `.json` with the hook's
variables. The screw's sizes come from the `m4` rule set, which is copied into `rules/` the first time it is used:

```json projects/home/objects/hook.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "hook",
  "title": "Wall hook",
  "version": "0.1.0",
  "uses": ["x1c", "m4"],
  "material": "PETG",
  "orientation": "On its side, so the layers run along the arm and it can't snap off across them.",
  "variables": {
    "width": { "value": 20, "unit": "mm", "rule": "Wide enough for a coat's loop", "label": "Width", "show": true, "tweak": { "min": 10, "max": 60 } },
    "plate": { "value": 50, "unit": "mm", "rule": "The back plate: room for a screw above the arm", "label": "Plate", "show": true },
    "reach": { "value": 30, "unit": "mm", "rule": "How far the arm stands out from the wall", "label": "Reach", "show": true, "tweak": { "min": 15, "max": 60 } },
    "thick": { "value": "x1c.line * 10", "unit": "mm", "rule": "Ten print lines: stiff enough for a coat" },
    "hole": { "value": "m4.clearance + x1c.hole_comp", "unit": "mm", "rule": "An M4 screw's clearance hole, widened for how holes print", "interface": true }
  }
}
```

Then the shape. `main(v)` gets the variables as `v`, with the rule sets (`v.x1c.line`), print-aware shapes
(`v.shapes`) and booleans (`v.ops`). Z is up and the bed is z = 0: draw the part the way it will print.

```js projects/home/objects/hook.js
// A wall hook: a back plate with a screw hole, and an arm. It lies on its side to print (z is its width).
import jscad from '@jscad/modeling'
const { cuboid } = jscad.primitives

export function main (v) {
  const plate = cuboid({ size: [v.plate, v.thick, v.width], center: [0, v.thick / 2, v.width / 2] })
  const arm = cuboid({ size: [v.thick, v.reach, v.width], center: [(v.thick - v.plate) / 2, v.thick + v.reach / 2, v.width / 2] })
  // a hole across the part as it prints: a teardrop, so its roof needs no support. It is a line longer than the
  // plate is thick, so it comes out of the back cleanly
  const screw = v.shapes.teardropHole({ d: v.hole, length: v.thick + v.x1c.line, at: [v.plate / 2 / 2, v.thick, v.width / 2], into: '-y' })
  return v.ops.subtract(v.ops.union(plate, arm), screw)
}
```

```sh
npx cad check home/hook
npx cad preview home/hook
npx cad export home/hook
```

`preview` draws six views as a picture in `.preview/` (it needs Chrome or Chromium). Look at it before you print.
`export` writes a 3MF for your slicer in `exports/`.

## 5. When something is wrong

The check names mistakes rather than drawing something else. The ones everyone makes first:

| You wrote | The check says |
|---|---|
| a number in the `.js`: `v.plate / 4` | `numbers in hook.js that should be variables: line 10: 4` |
| a variable that isn't there: `v.thik` | `v.thik: the design has no variable "thik" (did you mean "thick"?)` |
| a rule that isn't there: `m4.clearence` | `"m4.clearence": no rule "clearence" in m4 (hook.json: variables.hole.value)` |
| a misspelt key in the `.json`: `"lable"` | `variables.thick.lable: not allowed here (did you mean "label"?)` |
| nothing returned from `main` | `main() returned no shape: return a JSCAD solid, or named parts` |

Only 0, 1 and 2 may be written as numbers in a design: everything else is a variable, so that every measurement can
be traced. To see a value while you work, `console.log` it in `main`: it comes out with the check's output.

## 6. Check it against what it fits

A part is right when it fits the thing it is for. Model that thing as a **reference** object: drawn and checked
against, never printed. Here, the screw's shank:

```sh
npx cad new home/screw
```

```json projects/home/objects/screw.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "screw",
  "title": "M4 screw",
  "version": "0.1.0",
  "role": "reference",
  "variables": {
    "d": { "value": 4, "unit": "mm", "rule": "An M4 screw's thread", "interface": true },
    "length": { "value": 16, "unit": "mm", "rule": "Long enough to go through the plate into a wall plug" },
    "sides": { "value": 32, "rule": "Sides drawn round the shank" }
  }
}
```

```js projects/home/objects/screw.js
// An M4 screw's shank, lying along y: something the hook fits, not something to print.
import jscad from '@jscad/modeling'

export function main (v) {
  return jscad.transforms.rotateX(Math.PI / 2, jscad.primitives.cylinder({ radius: v.d / 2, height: v.length, segments: v.sides }))
}
```

An assembly places objects together. Positions are expressions over the items' own variables, so the screw stays in
the hole when the hook changes:

```json projects/home/assemblies/hook-on-screw.json
{
  "title": "Hook on its screw",
  "kind": "fit",
  "uses": ["x1c"],
  "items": [
    { "id": "hook", "object": "hook" },
    { "id": "screw", "object": "screw", "at": ["hook.plate / 4", "hook.thick - screw.length / 2", "hook.width / 2"] }
  ]
}
```

Now say how they should fit: the gap between the screw and its hole, between the printer's sliding fit and half a
millimetre. An object that returns one shape has one part, `body`.

```sh
npx cad add fit home/hook-on-screw --a hook.body --b screw.body --min x1c.fit --max 0.5 --note "The screw in its hole"
npx cad check home/hook-on-screw
```

```
Hook on its screw (fit: hook 0.1.0, screw 0.1.0)
  ✓ files match their schemas
  ✓ no parts overlap (2 object instances)
  ✓ The screw in its hole: closest gap 0.295 mm
```

Change `hole` in the hook to something too tight and the check fails with the number. That is the loop: rules, a
shape from them, and a check against the thing it meets.

## 7. Share it

```sh
npx cad link home/hook --md
```

That prints one link that opens the model in a browser, with its rules and downloads. The model travels in the link
itself: nothing is uploaded.

## Where next

[The worked examples](EXAMPLES.md) carry on from here, one for each of these, with the files to write and the
commands to run, tested the same way as this page. Each is also a section of [the README](README.md):

- **Parts**: a design that returns several named parts, supports that break away, a second colour.
- **Variants**: named sets of inputs, side by side (`home/hook:long`).
- **Joints and poses**: things that move, checked in every position and swept for collisions.
- **Versions**: `cad release` compares a design with its last release and says whether an earlier print still fits.
- **Models from elsewhere**: measure someone else's STL into rules, and match your design against it.
- **Optimised parts**: the stiffest layout for a load, and an analysis of what you drew.
- **Boards**: circuit boards from the same rules as the case around them.
- **Mechanisms printed flat**: springs, catches and triggers in one print, checked through their whole cycle.
