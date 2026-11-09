# Worked examples: from parts to a mechanism

[The tutorial](TUTORIAL.md) ends with a wall hook checked against its screw. These examples carry on from there, one
for each thing the [README](README.md) describes after that: parts, variants and releases, joints and poses, a model
from elsewhere, an optimised part, a board, a mechanism printed flat, gears, a gearbox, a motor, and a robot joint. Each is a few files and the commands to run
them. The tests write every file here and run every command, so what you read is what works.

They start from a workspace `npm create rulecad my-designs` makes, as the tutorial does, and run in order: later
examples use earlier files where it saves repeating them.

## 1. Parts: a support that breaks away, and a second filament

A tag with a raised legend on top, printed as one object in two filaments, standing on a breakaway brim. `main`
returns named parts; the `.json` says what each is for.

```json projects/home/objects/tag.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "tag",
  "title": "Name tag",
  "version": "0.1.0",
  "uses": ["x1c"],
  "material": "PLA",
  "orientation": "Flat, legend up, on a brim that snaps off",
  "parts": {
    "base": { "label": "Tag" },
    "legend": { "label": "Raised legend", "filament": "legend" },
    "brim": { "role": "support", "label": "Breakaway brim" }
  },
  "variables": {
    "length": { "value": 50, "unit": "mm", "rule": "Room for a short name", "label": "Length", "show": true, "tweak": { "min": 30, "max": 90 } },
    "width": { "value": 20, "unit": "mm", "rule": "Two lines of text", "label": "Width", "show": true },
    "thick": { "value": "x1c.layer * 8", "unit": "mm", "rule": "Eight layers: stiff enough to pin to a coat" },
    "raise": { "value": "x1c.layer * 3", "unit": "mm", "rule": "The legend stands three layers proud, so the second filament has layers of its own" },
    "inset": { "value": "x1c.line * 4", "unit": "mm", "rule": "The legend's border, in from the edge" },
    "brim": { "value": 4, "unit": "mm", "rule": "A brim this wide holds a thin tag flat while it prints" },
    "brim_gap": { "value": "x1c.support_gap", "unit": "mm", "rule": "The gap a breakaway support leaves, so it snaps off" }
  }
}
```

The brim is a frame round the tag one layer tall, a support gap below the tag's edge; the check knows a `support`
part is printed and removed, so the tag resting on it is not an overhang.

```js projects/home/objects/tag.js
// A name tag: a slab, a raised legend in a second filament, on a breakaway brim.
import jscad from '@jscad/modeling'
const { cuboid } = jscad.primitives
const { subtract } = jscad.booleans

export function main (v) {
  const base = cuboid({ size: [v.length, v.width, v.thick], center: [0, 0, v.thick / 2] })
  const legend = cuboid({ size: [v.length - 2 * v.inset, v.width - 2 * v.inset, v.raise], center: [0, 0, v.thick + v.raise / 2] })
  const ring = subtract(cuboid({ size: [v.length + 2 * v.brim, v.width + 2 * v.brim, v.thick], center: [0, 0, v.thick / 2] }), cuboid({ size: [v.length - 2 * v.brim, v.width - 2 * v.brim, v.thick], center: [0, 0, v.thick / 2] }))
  const brim = subtract(ring, cuboid({ size: [v.length + 2 * v.brim, v.width + 2 * v.brim, v.thick], center: [0, 0, v.thick / 2 + v.brim_gap + v.x1c.layer] }))
  return { base, legend, brim }
}
```

The second filament is named in the project: a slot in the AMS.

```json projects/home/project.json
{
  "name": "home",
  "title": "Things for the house",
  "printer": "x1c",
  "filaments": { "base": { "slot": 1 }, "legend": { "slot": 2 } }
}
```

```sh
npx cad check home/tag
npx cad export home/tag
```

The print file groups the three parts as one object, the legend on its own slot, the brim marked as support.

## 2. Variants, then a release

A variant is a named set of inputs, kept beside the design rather than as a copy: a long tag next to the standard
one, a short one beside it. They are `variants` entries in the `.json` (values a variable's `tweak` range allows),
built as `home/tag:long`.

```json projects/home/objects/tag.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "tag",
  "title": "Name tag",
  "version": "0.1.0",
  "uses": ["x1c"],
  "material": "PLA",
  "orientation": "Flat, legend up, on a brim that snaps off",
  "parts": {
    "base": { "label": "Tag" },
    "legend": { "label": "Raised legend", "filament": "legend" },
    "brim": { "role": "support", "label": "Breakaway brim" }
  },
  "variants": { "long": { "length": 80 }, "short": { "length": 35 } },
  "variables": {
    "length": { "value": 50, "unit": "mm", "rule": "Room for a short name", "label": "Length", "show": true, "tweak": { "min": 30, "max": 90 } },
    "width": { "value": 20, "unit": "mm", "rule": "Two lines of text", "label": "Width", "show": true },
    "thick": { "value": "x1c.layer * 8", "unit": "mm", "rule": "Eight layers: stiff enough to pin to a coat" },
    "raise": { "value": "x1c.layer * 3", "unit": "mm", "rule": "The legend stands three layers proud, so the second filament has layers of its own" },
    "inset": { "value": "x1c.line * 4", "unit": "mm", "rule": "The legend's border, in from the edge" },
    "brim": { "value": 4, "unit": "mm", "rule": "A brim this wide holds a thin tag flat while it prints" },
    "brim_gap": { "value": "x1c.support_gap", "unit": "mm", "rule": "The gap a breakaway support leaves, so it snaps off" }
  }
}
```

```sh
npx cad variants home/tag
npx cad check home/tag:long
npx cad compare home/tag short long
```

`compare` puts two variants (or two releases) side by side: what differs in their values and their sizes.

Versions are git tags, so a release needs the workspace in git. `--dry-run` shows the bump a change would need
without making it: here the first release of a new object is `0.1.0` as written.

```sh
npx cad release home/tag -m "First tag" --dry-run
```

## 3. Joints and poses: a lid on a hinge

A box with a lid is one assembly, with the lid on a revolute joint between two anchors. The base and the lid name
their anchors in their `.json`; the poses say where the joint stands.

```json projects/home/objects/base.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "base",
  "title": "Box base",
  "version": "0.1.0",
  "uses": ["x1c"],
  "anchors": { "hinge": { "at": [0, "depth / 2", "height"], "axis": [1, 0, 0] } },
  "variables": {
    "width": { "value": 40, "unit": "mm", "rule": "The box's width", "label": "Width", "show": true },
    "depth": { "value": 30, "unit": "mm", "rule": "Its depth", "label": "Depth", "show": true },
    "height": { "value": 16, "unit": "mm", "rule": "Its height", "label": "Height", "show": true },
    "wall": { "value": "x1c.line * 3", "unit": "mm", "rule": "Three lines" }
  }
}
```

```js projects/home/objects/base.js
// An open box: a tray with walls, the hinge along the middle of its back edge.
import jscad from '@jscad/modeling'
const { cuboid } = jscad.primitives
const { subtract } = jscad.booleans

export function main (v) {
  const outer = cuboid({ size: [v.width, v.depth, v.height], center: [0, 0, v.height / 2] })
  const inner = cuboid({ size: [v.width - 2 * v.wall, v.depth - 2 * v.wall, v.height], center: [0, 0, v.height / 2 + v.wall] })
  return subtract(outer, inner)
}
```

```json projects/home/objects/lid.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "lid",
  "title": "Box lid",
  "version": "0.1.0",
  "uses": ["x1c"],
  "anchors": { "hinge": { "at": [0, "depth / 2", 0], "axis": [1, 0, 0] } },
  "variables": {
    "width": { "value": 40, "unit": "mm", "rule": "The box's width", "label": "Width", "show": true },
    "depth": { "value": 30, "unit": "mm", "rule": "Its depth", "label": "Depth", "show": true },
    "thick": { "value": "x1c.layer * 10", "unit": "mm", "rule": "Ten layers" }
  }
}
```

```js projects/home/objects/lid.js
// A flat lid, hinged along its back edge.
import jscad from '@jscad/modeling'

export function main (v) {
  return jscad.primitives.cuboid({ size: [v.width, v.depth, v.thick], center: [0, 0, v.thick / 2] })
}
```

The assembly: the lid's hinge anchor sits on the base's, and the joint turns it from there. Angle 0 is shut; the lid
opens by turning back over the hinge, so the open pose is negative.

```json projects/home/assemblies/box.json
{
  "title": "Box with its lid",
  "kind": "fit",
  "items": [
    { "id": "base", "object": "base" },
    { "id": "lid", "object": "lid" }
  ],
  "joints": [
    { "id": "hinge", "type": "revolute", "parent": "base.hinge", "child": "lid.hinge", "min": -120, "max": 0, "label": "Lid" }
  ],
  "poses": { "shut": { "hinge": 0 }, "open": { "hinge": -110 } }
}
```

```sh
npx cad check home/box
npx cad check home/box --pose open
npx cad check home/box --sweep --steps 12
```

Every pose is checked for parts overlapping; the sweep turns the hinge through its range and names where anything
collides on the way. The link carries the joint as a slider: `npx cad link home/box --md`.

## 4. A model from elsewhere: measured into rules, and matched

Something you must fit (a socket, a maker's part) is best measured from its model, not guessed. Here the model is the
box base exported as a 3MF, standing in for a file from a model site: `cad measure` reads its sections into a draft
rule set, and `cad match` lays the model over a design and reports how far apart their surfaces are.

```sh
npx cad export home/base
npx cad measure exports/home/base@0.1.0.3mf --rules basemodel --source "exports/home/base@0.1.0.3mf" --licence "CC0" --no-pictures
npx cad match home/base exports/home/base@0.1.0.3mf --no-pictures --samples 3000
```

The rule set `rules/basemodel.json` has every value as `kind: derived` with the file it came from: rename its
placeholder names (`size_x`, `sectionA_w`) for what they are before a design uses them. The match of the design
against its own export is exact; against someone else's model, a deliberate clearance shows as an even offset.

## 5. An optimised part, analysed

A lever arm: where to put material so it bends least under a load, with bosses kept round the bolt and the pin. The
problem is a file in the project's `problems/`.

```json projects/home/problems/arm.json
{
  "title": "Lever arm",
  "uses": ["m4", "x1c"],
  "material": "pla",
  "thickness": 4,
  "cell": 1.5,
  "volume": 0.4,
  "filter": 3,
  "space": { "at": [25, 0], "size": [62, 24] },
  "keep": [{ "at": [0, 0], "r": 5 }, { "at": [50, 0], "r": 4 }],
  "avoid": [{ "at": [0, 0], "r": "m4.clearance / 2" }, { "at": [50, 0], "r": 1.6 }],
  "supports": [{ "at": [0, 0], "r": "m4.clearance / 2" }],
  "loads": [{ "at": [50, 0], "r": 1.6, "force": [0, -10], "case": "down" }]
}
```

The design reads the result through a `problem` variable and draws it; `analysis` has `cad check` report its
stiffness and peak stress on finer cells.

```json projects/home/objects/arm.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "arm",
  "title": "Lever arm",
  "version": "0.1.0",
  "uses": ["x1c"],
  "material": "PLA",
  "orientation": "Flat on the bed",
  "variables": {
    "problem": { "type": "problem", "value": "arm", "choice": ["arm"] },
    "thick": { "value": 4, "unit": "mm", "rule": "As the problem's thickness" }
  },
  "analysis": [{ "problem": "arm", "cell": 0.5, "max_deflection": 1 }]
}
```

```js projects/home/objects/arm.js
// The optimised arm, extruded to its thickness: the holes come out true, cut from the outline.
import jscad from '@jscad/modeling'

export function main (v) {
  return jscad.extrusions.extrudeLinear({ height: v.thick }, v.shapes.optimisedOutline(v.problems[v.problem]))
}
```

```sh
npx cad optimise home/arm
npx cad check home/arm
```

`optimise` draws the layout in `.preview/` and reports how far the load moves; the result is kept until the problem
or the solver changes. `check` analyses the part as drawn, on cells half the size and again a quarter bigger, and says
whether the stiffness has settled.

## 6. A board, and a case that reads it

A four-key pad: keys in a matrix, one diode each, and a Pico beside them. Every track is drawn by rule; the
checks run the fab's design rules.

```json projects/home/objects/pad.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "pad",
  "title": "Four-key pad",
  "version": "0.1.0",
  "engine": "pcb",
  "uses": ["mx", "pico", "sod123", "m2", "jlcpcb"],
  "variables": {
    "rows": { "value": 2, "rule": "Two rows" },
    "cols": { "value": 2, "rule": "Two columns" },
    "track": { "value": "jlcpcb.track_min * 2.5", "unit": "mm", "rule": "Tracks well over the fab's least" },
    "clear": { "value": "jlcpcb.gap_min * 2.5", "unit": "mm", "rule": "Clearance well over the fab's least" },
    "thickness": { "value": "jlcpcb.thickness", "unit": "mm", "rule": "The usual board" },
    "margin": { "value": 5, "unit": "mm", "rule": "Board edge beyond the keys" },
    "mcu_gap": { "value": 2, "unit": "mm", "rule": "Between the keys and the Pico" },
    "mcu_side": { "value": "left", "choice": ["left", "right"], "rule": "Which way the Pico's USB faces" },
    "mcu_row": { "value": 0, "rule": "Which key row the Pico sits beside" },
    "mount_holes": { "value": 1, "rule": "M2 holes in the corners" },
    "controller": { "value": "beside", "choice": ["beside", "under"], "rule": "The Pico beside the keys" }
  }
}
```

```js projects/home/objects/pad.js
// A key matrix on the keyboard recipe: the board and its matrix (rows, columns, GPIO) for the firmware.
export function main (v) {
  const keys = v.pcb.grid(v.rows, v.cols, v.mx.pitch)
  return v.pcb.keyboard(v, keys)
}
```

```sh
npx cad check home/pad
npx cad export home/pad
```

A case reads the board rather than copying its numbers: `"uses": ["home/pad"]`, then `v.pad.board_w` and
`v.pad.board_holes` are the board's own.

## 7. A mechanism printed flat

A leaf spring and a block that flicks, drawn in one plane and printed on its side. The lamina's checks come out with
the print checks: it prints free, its sequence is clear, and a hard stop catches the leaf before its strain limit.

```json projects/home/objects/flick.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "flick",
  "title": "Flicker",
  "version": "0.1.0",
  "uses": ["x1c", "pla"],
  "material": "PLA",
  "orientation": "On its side: the plane of the drawing is the bed",
  "variables": {
    "len": { "value": 20, "unit": "mm", "rule": "The leaf's length", "label": "Leaf", "show": true },
    "t": { "value": "x1c.line * 2", "unit": "mm", "rule": "Two lines thick: it bends within its layers" },
    "fillet": { "value": "x1c.line * 2", "unit": "mm", "rule": "Rounded where it meets its blocks: a square corner is where a print yields" },
    "h": { "value": 10, "unit": "mm", "rule": "The print's height, the leaf's width: tall, so the tip can't flex out of the plane" },
    "gap": { "value": "x1c.print_gap", "unit": "mm", "rule": "The gap that prints apart" },
    "post": { "value": "x1c.print_gap + x1c.line", "unit": "mm", "rule": "How far the stop's lip stands over the tip block" },
    "bend": { "value": 0.3, "unit": "mm", "rule": "How far the state bends it" },
    "block": { "value": 4, "unit": "mm", "rule": "The tip block, the root, the frame's bars" }
  }
}
```

```js projects/home/objects/flick.js
// A leaf from a root block to a tip block, bent by a state. The frame is one piece: the root, a floor under
// everything, and a post past the tip with a lip over it, the hard stop.
import jscad from '@jscad/modeling'
const rect = (x0, y0, x1, y1) => jscad.primitives.polygon({ points: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] })

export function main (v) {
  const f = v.flexures, b = v.block, tipTop = b / 2, floor = 0 - b - b, postX = v.len + b + v.gap
  return f.lamina({
    height: v.h, gap: v.gap, material: f.flexureMaterial({ modulus: v.pla.modulus, strength: v.pla.strength }),
    ground: [rect(0 - b, floor, 0, b), rect(0 - b, floor, postX + b, floor + b), rect(postX, floor, postX + b, tipTop + v.post + b), rect(v.len, tipTop + v.post, postX + b, tipTop + v.post + b)],
    bodies: { tip: rect(v.len - b / 2, 0 - b / 2, v.len + b, tipTop) },
    joints: { leaf: { kind: 'leaf', params: { length: v.len, thickness: v.t, fillet: v.fillet }, at: [0 - 1, 0], from: 'ground', to: 'tip' } },
    states: { bent: { leaf: v.bend } }, sequence: ['rest', 'bent', 'rest']
  })
}
```

```sh
npx cad check home/flick
npx cad animate home/flick
```

`animate` writes the sequence as an animated SVG in `.preview/`, the leaf drawn bent, and a page that plays it with
the force on each step. The launcher in `examples/bench/projects/launcher` is the same idea at full size: a flooded
frame, catches, a trigger, and a shot.

## 8. Gears: a focus slider on a rack and pinion

A slide for a phone or a small camera, moved by a knob: a pinion turns, and a rack carries the slide along. The gears
come from `v.gears` (`@rulecad/gears`), drawn from their module and teeth; the assembly says which gear drives which,
and the check works out the rest.

The pinion has 14 teeth. Fewer than 17 at the standard 20° are undercut, so it is drawn with a profile shift of 0.2,
which `@rulecad/gears` names when it refuses one without (`give a profile shift of at least 0.19`). One turn of the knob
moves the slide π × 14 × 1 = 43.98 mm.

```json projects/home/objects/pinion.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "pinion",
  "title": "Focus knob and pinion",
  "version": "0.1.0",
  "uses": ["x1c"],
  "anchors": { "axis": { "at": [0, 0, 0], "axis": [0, 0, 1] } },
  "variables": {
    "module": { "value": 1, "unit": "mm", "rule": "Tooth size: 3.6 lines across a tooth at the pitch circle on the X1C" },
    "teeth": { "value": 14, "rule": "Few teeth for a fine travel a turn" },
    "shift": { "value": 0.2, "rule": "Profile shift: 14 teeth at 20° need at least 0.19, or they are undercut" },
    "width": { "value": "x1c.layer * 30", "unit": "mm", "rule": "Face width, thirty layers" },
    "bore": { "value": 3.2, "unit": "mm", "rule": "An M3 screw as its axle, 0.2 mm clear" },
    "knob": { "value": 5.5, "unit": "mm", "rule": "The knob's radius, inside the teeth's roots" },
    "grip": { "value": "x1c.layer * 40", "unit": "mm", "rule": "The knob's height, forty layers" }
  }
}
```

```js projects/home/objects/pinion.js
// A pinion with a knob on top: the gear's face on the bed, the knob printed on it.
import jscad from '@jscad/modeling'
const { cylinder } = jscad.primitives
const { union, subtract } = jscad.booleans

export function main (v) {
  const gear = v.gears.spur({ module: v.module, teeth: v.teeth, shift: v.shift, width: v.width, bore: v.bore })
  const knob = cylinder({ radius: v.knob, height: v.grip, center: [0, 0, v.width + v.grip / 2] })
  const hole = cylinder({ radius: v.bore / 2, height: v.grip, center: [0, 0, v.width + v.grip / 2] })
  return union(gear, subtract(knob, hole))
}
```

```json projects/home/objects/rack.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "rack",
  "title": "Slide rack",
  "version": "0.1.0",
  "uses": ["x1c"],
  "anchors": { "slide": { "at": [0, 0, 0], "axis": [1, 0, 0] } },
  "variables": {
    "module": { "value": 1, "unit": "mm", "rule": "The pinion's module: gears that mesh share it" },
    "teeth": { "value": 24, "rule": "Long enough for 60 mm of travel" },
    "width": { "value": "x1c.layer * 30", "unit": "mm", "rule": "The pinion's face width" },
    "back": { "value": "x1c.line * 10", "unit": "mm", "rule": "Bar under the teeth: ten lines" }
  }
}
```

```js projects/home/objects/rack.js
// The rack: along x, its teeth up +y, its pitch line on y = 0.
export function main (v) {
  return v.gears.rack({ module: v.module, teeth: v.teeth, width: v.width, height: v.back })
}
```

```json projects/home/objects/rail.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "rail",
  "title": "Slide base",
  "version": "0.1.0",
  "uses": ["x1c"],
  "engine": "manifold",
  "anchors": {
    "axle": { "at": [0, "centre", "thick"], "axis": [0, 0, 1] },
    "track": { "at": ["start", 0, "thick"], "axis": [1, 0, 0] }
  },
  "variables": {
    "centre": { "value": 7.2, "unit": "mm", "rule": "The pinion's axle above the rack's pitch line: its pitch radius and its shift, m z / 2 + x m" },
    "length": { "value": 120, "unit": "mm", "rule": "The rack (75.4 mm) and its travel, ±22 mm" },
    "start": { "value": -37.7, "unit": "mm", "rule": "The rack's middle under the knob at rest: half its 24 teeth, 12 × π" },
    "strip": { "value": 12, "unit": "mm", "rule": "The strip under the rack, from behind its guide to under its teeth" },
    "boss": { "value": 12, "unit": "mm", "rule": "Round the axle's foot" },
    "foot": { "value": 40, "unit": "mm", "rule": "A foot across the middle, so it stands without rocking" },
    "thick": { "value": "x1c.layer * 15", "unit": "mm", "rule": "Fifteen layers" },
    "pin": { "value": "3.2 - 2 * x1c.fit - x1c.hole_comp", "unit": "mm", "rule": "The axle: the pinion's 3.2 mm bore, less the printer's fit each side and what a printed bore loses, so it turns" },
    "pin_height": { "value": "x1c.layer * 60", "unit": "mm", "rule": "Up through the pinion and its knob" },
    "guide_y": { "value": "0 - 5.45 - x1c.line / 2", "unit": "mm", "rule": "Behind the rack's back (1.25 + 4.2 mm under its pitch line), half a line clear" },
    "guide": { "value": "x1c.line * 4", "unit": "mm", "rule": "The guide wall: four lines" },
    "guide_height": { "value": "x1c.layer * 20", "unit": "mm", "rule": "Most of the rack's width" }
  }
}
```

```js projects/home/objects/rail.js
// The base as little as holds it: a strip under the rack's travel with a wall behind the rack (so it slides straight
// and can't back away from the pinion), a boss carrying the pinion's axle, and a foot across the middle.
import jscad from '@jscad/modeling'
const { cuboid, cylinder } = jscad.primitives

export function main (v) {
  const y0 = v.guide_y - v.guide, strip = cuboid({ size: [v.length, v.strip, v.thick], center: [0, y0 + v.strip / 2, v.thick / 2] })
  const boss = cylinder({ radius: v.boss / 2, height: v.thick, center: [0, v.centre, v.thick / 2] })
  const neck = cuboid({ size: [v.boss, v.centre - y0, v.thick], center: [0, (y0 + v.centre) / 2, v.thick / 2] })
  const foot = cuboid({ size: [v.boss, v.foot, v.thick], center: [0, y0 + v.foot / 2 - v.boss, v.thick / 2] })
  const axle = cylinder({ radius: v.pin / 2, height: v.pin_height, center: [0, v.centre, v.thick + v.pin_height / 2] })
  const guide = cuboid({ size: [v.length, v.guide, v.guide_height], center: [0, v.guide_y - v.guide / 2, v.thick + v.guide_height / 2] })
  return v.ops.union(strip, boss, neck, foot, axle, guide)
}
```

The assembly: the knob turns on the base's axle (a pin printed with the base), and the rack slides along its track
against a guide wall, its middle under the knob at
rest, so half a turn either way (±22 mm) keeps the pinion on its teeth. The slide's joint doesn't say
how far it moves for a turn of the knob: its `mesh` says which joint drives it, and the gears' module and teeth (read
from the parts, so they can't disagree). The check works out the travel a turn and the phase that puts a tooth in a
gap, and says whether the axle is where the gears need it.

```json projects/home/assemblies/slider.json
{
  "title": "Focus slider",
  "kind": "fit",
  "items": [
    { "id": "rail", "object": "rail" },
    { "id": "pinion", "object": "pinion" },
    { "id": "rack", "object": "rack" }
  ],
  "joints": [
    { "id": "knob", "type": "revolute", "parent": "rail.axle", "child": "pinion.axis", "min": -180, "max": 180, "label": "Knob" },
    { "id": "slide", "type": "prismatic", "parent": "rail.track", "child": "rack.slide", "min": -100, "max": 100,
      "mesh": { "with": "knob", "module": "pinion.module", "teeth": ["pinion.teeth", "rack.teeth"], "shift": ["pinion.shift", 0] } }
  ],
  "fits": [{ "a": "pinion", "b": "rail", "engage": "pinion.width", "note": "The pinion down its axle" }],
  "poses": { "home": { "knob": 0 }, "out": { "knob": 150 } }
}
```

```sh
npx cad check home/slider
npx cad check home/slider --sweep --steps 12
```

The check says `knob drives slide: 43.98 mm of rack a turn`, the contact ratio, and that the axle is where the gears
need it (`centre distance 7.2 mm, as they need`). Set the base's `centre` to 6.9 and it fails: 0.3 mm closer is more than the
teeth's 0.15 mm of backlash allows, and they would jam. The
sweep turns the knob from −180° to 180° with the rack following, and names any teeth that touch on the way. The link
carries the knob as a slider, with the rack moving with it: `npx cad link home/slider --md`.

To see the gears' geometry, `@rulecad/gears/diagram` draws a pair the way a textbook does: pitch and base circles,
the line of action and the path of contact.

## 9. A gearbox: a spool winder through a planetary

A crank that winds a spool four times for each turn: a planetary gearbox, the crank on the carrier, the spool on the
sun, the ring held in the case. `planetary()` in `@rulecad/gears` finds the teeth for the ratio and checks that they
put together:

```js
planetary({ module: 1, ratio: 0.25, planets: 3, held: 'ring', input: 'carrier', output: 'sun' })
// 0.25 : 1 (carrier to sun, ring held), as asked: sun 18, planets 18 × 3, ring 54
```

The ring is the sun and two planets across (18 + 2 × 18 = 54), and the planets go in evenly: 18 + 54 = 72 is a whole
number of threes. The parts: a case with the ring on it and a pin for the sun, the sun with the spool's shaft, three
planets, the carrier with the planets' pins and the crank arm, and the crank's handle.

```json projects/home/objects/winder-case.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "winder-case",
  "title": "Winder case",
  "version": "0.1.0",
  "uses": ["x1c"],
  "engine": "manifold",
  "variables": {
    "radius": { "value": 33, "unit": "mm", "rule": "The ring's rim: the case is a rim under it" },
    "rim": { "value": "x1c.line * 14", "unit": "mm", "rule": "The rim under the ring's, wide enough for its push pins" },
    "snap": { "value": 2, "unit": "mm", "rule": "Two push pins hold the ring still: their shafts" },
    "snap_lip": { "value": 0.3, "unit": "mm", "rule": "The barb's lip, clicking over the floor of the ring's counterbore" },
    "snap_back": { "value": 90, "unit": "deg", "rule": "A square back: it holds for good" },
    "snap_at": { "value": 30.6, "unit": "mm", "rule": "Halfway across the ring's rim, between its roots and its outside" },
    "snap_length": { "value": 4, "unit": "mm", "rule": "Up the ring's 6 mm rim to its 2 mm counterbore" },
    "flange": { "value": 2, "unit": "mm", "rule": "A push pin's foot flange, buried in the rim" },
    "hub": { "value": 12, "unit": "mm", "rule": "Round the sun's axle" },
    "spoke": { "value": "x1c.line * 12", "unit": "mm", "rule": "Three spokes from the hub to the rim" },
    "spokes": { "value": 3, "rule": "Three: it stands without rocking" },
    "t": { "value": "x1c.layer * 15", "unit": "mm", "rule": "Base, fifteen layers" },
    "pin": { "value": 3, "unit": "mm", "rule": "The sun's axle" },
    "pin_height": { "value": 22, "unit": "mm", "rule": "Up through the sun and its shaft" }
  }
}
```

```js projects/home/objects/winder-case.js
// The case as little as holds it: a rim the ring sits on (two push pins hold it still), a hub with the sun's axle
// standing in it, and spokes between.
import jscad from '@jscad/modeling'
const { cylinder, cuboid } = jscad.primitives
const { rotateZ } = jscad.transforms

export function main (v) {
  const rim = v.ops.subtract(cylinder({ radius: v.radius, height: v.t, center: [0, 0, v.t / 2] }), cylinder({ radius: v.radius - v.rim, height: v.t, center: [0, 0, v.t / 2] }))
  const spokes = Array.from({ length: v.spokes }, (_, k) => rotateZ((2 * Math.PI * k) / v.spokes, cuboid({ size: [v.radius - v.rim / 2, v.spoke, v.t], center: [(v.radius - v.rim / 2) / 2, 0, v.t / 2] })))
  const snaps = [0, Math.PI].map((a) => jscad.transforms.translate([v.snap_at * Math.cos(a), v.snap_at * Math.sin(a), v.t - v.flange], v.flexures.snapPin({ diameter: v.snap, length: v.snap_length, lip: v.snap_lip, back: v.snap_back }, v.ops)))
  return v.ops.union(rim, cylinder({ radius: v.hub / 2, height: v.t, center: [0, 0, v.t / 2] }), ...spokes, ...snaps,
    cylinder({ radius: v.pin / 2, height: v.pin_height, center: [0, 0, v.t + v.pin_height / 2] }))
}
```

```json projects/home/objects/winder-ring.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "winder-ring",
  "title": "Winder ring gear",
  "version": "0.1.0",
  "uses": ["x1c"],
  "engine": "manifold",
  "variables": {
    "rim": { "value": 66, "unit": "mm", "rule": "Across the outside: a rim wide enough for the push pins' holes" },
    "snap": { "value": 2, "unit": "mm", "rule": "The case's push pins" },
    "clear": { "value": "x1c.line / 2", "unit": "mm", "rule": "Half a line round a pin" },
    "snap_at": { "value": 30.6, "unit": "mm", "rule": "As the case's pins" },
    "counterbore": { "value": 2, "unit": "mm", "rule": "Deep enough that a barb clicks below the ring's top, clear of the crank arm" },
    "barb": { "value": 1.6, "unit": "mm", "rule": "The counterbore's radius: the barb and its clearance" },
    "module": { "value": 1, "unit": "mm", "rule": "3.6 lines across a tooth on the X1C" },
    "teeth": { "value": 54, "rule": "The sun and two planets across: 18 + 2 × 18" },
    "width": { "value": "x1c.layer * 30", "unit": "mm", "rule": "Face width, thirty layers: plenty for a spool's pull" }
  }
}
```

```js projects/home/objects/winder-ring.js
// The ring gear, held to the case by two push pins: through-holes in its rim, counterbored at the top for the barbs.
import jscad from '@jscad/modeling'
const { cylinder } = jscad.primitives

export function main (v) {
  const holes = [0, Math.PI].flatMap((a) => {
    const x = v.snap_at * Math.cos(a), y = v.snap_at * Math.sin(a)
    return [cylinder({ radius: v.snap / 2 + v.clear, height: v.width, center: [x, y, v.width / 2] }),
      cylinder({ radius: v.barb, height: v.counterbore, center: [x, y, v.width - v.counterbore / 2] })]
  })
  return v.ops.subtract(v.gears.internal({ module: v.module, teeth: v.teeth, width: v.width, rim: v.rim }), ...holes)
}
```

```json projects/home/objects/winder-gear.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "winder-gear",
  "title": "Winder planet",
  "version": "0.1.0",
  "uses": ["x1c"],
  "anchors": { "axis": { "at": [0, 0, 0], "axis": [0, 0, 1] } },
  "variables": {
    "module": { "value": 1, "unit": "mm", "rule": "As the ring" },
    "teeth": { "value": 18, "rule": "From planetary(): 18 for 4 : 1 with three planets" },
    "width": { "value": "x1c.layer * 30", "unit": "mm", "rule": "As the ring" },
    "bore": { "value": "3 + 2 * x1c.fit + x1c.hole_comp", "unit": "mm", "rule": "A 3 mm pin, the printer's fit each side, and what a printed bore loses" }
  }
}
```

```js projects/home/objects/winder-gear.js
export function main (v) {
  return v.gears.spur({ module: v.module, teeth: v.teeth, width: v.width, bore: v.bore })
}
```

The sun is a planet with the spool's shaft on top, bored through for its axle:

```json projects/home/objects/winder-sun.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "winder-sun",
  "title": "Winder sun and spool shaft",
  "version": "0.1.0",
  "uses": ["x1c"],
  "engine": "manifold",
  "anchors": { "axis": { "at": [0, 0, 0], "axis": [0, 0, 1] } },
  "variables": {
    "module": { "value": 1, "unit": "mm", "rule": "As the ring" },
    "teeth": { "value": 18, "rule": "From planetary()" },
    "width": { "value": "x1c.layer * 30", "unit": "mm", "rule": "As the ring" },
    "bore": { "value": "3 + 2 * x1c.fit + x1c.hole_comp", "unit": "mm", "rule": "On the case's 3 mm axle: the printer's fit each side, and what a printed bore loses" },
    "shaft": { "value": 8, "unit": "mm", "rule": "The spool's shaft, inside the sun's roots" },
    "shaft_height": { "value": 12, "unit": "mm", "rule": "Up through the carrier, and a spool's width over it" }
  }
}
```

```js projects/home/objects/winder-sun.js
import jscad from '@jscad/modeling'
const { cylinder } = jscad.primitives

export function main (v) {
  const gear = v.gears.spur({ module: v.module, teeth: v.teeth, width: v.width, bore: v.bore })
  const shaft = cylinder({ radius: v.shaft / 2, height: v.shaft_height, center: [0, 0, v.width + v.shaft_height / 2] })
  const hole = cylinder({ radius: v.bore / 2, height: v.shaft_height, center: [0, 0, v.width + v.shaft_height / 2] })
  return v.ops.union(gear, v.ops.subtract(shaft, hole))
}
```

The carrier is drawn as it prints: a flat plate on the bed (the disc over the gears, inside the ring's tips, and the
crank arm in the same plane, reaching out over the ring), with a pin standing up from it for each planet. The assembly
turns it over, so its pins hang down into the planets. The planets turn every 120° at the sun-to-planet distance
(m (S + P) / 2 = 18 mm). The handle is a part of its own, printed upright and pressed into the arm's end, as a crank
handle usually is.

```json projects/home/objects/winder-carrier.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "winder-carrier",
  "title": "Winder carrier and crank arm",
  "version": "0.1.0",
  "uses": ["x1c"],
  "engine": "manifold",
  "anchors": {
    "axis": { "at": [0, 0, 0], "axis": [0, 0, -1] },
    "grip": { "at": ["arm", 0, 0], "axis": [0, 0, -1] },
    "p0": { "at": ["a", 0, "t + drop"], "axis": [0, 0, -1] },
    "p1": { "at": ["0 - a / 2", "a * 0.8660254", "t + drop"], "axis": [0, 0, -1] },
    "p2": { "at": ["0 - a / 2", "0 - a * 0.8660254", "t + drop"], "axis": [0, 0, -1] }
  },
  "variables": {
    "a": { "value": 18, "unit": "mm", "rule": "Sun to planet: m (S + P) / 2" },
    "drop": { "value": "6 + x1c.layer * 2", "unit": "mm", "rule": "A planet's width and two layers' gap above it" },
    "radius": { "value": 25, "unit": "mm", "rule": "Inside the ring's tips (26 mm)" },
    "t": { "value": "x1c.layer * 15", "unit": "mm", "rule": "Fifteen layers" },
    "hole": { "value": 9, "unit": "mm", "rule": "Round the sun's 8 mm shaft" },
    "pin": { "value": 3, "unit": "mm", "rule": "The planets' axles" },
    "arm": { "value": 45, "unit": "mm", "rule": "The crank's reach, out over the ring" },
    "bar": { "value": 10, "unit": "mm", "rule": "The crank arm's width" },
    "peg": { "value": 4, "unit": "mm", "rule": "The handle's peg" },
    "fit": { "value": "x1c.line / 4", "unit": "mm", "rule": "A press fit for the handle's peg: a quarter line" },
    "planets": { "value": 3, "rule": "From planetary(): three planets" }
  }
}
```

```js projects/home/objects/winder-carrier.js
// The carrier as it prints: a flat plate (the disc and the crank arm) on the bed, the planets' pins standing up from it.
import jscad from '@jscad/modeling'
const { cylinder, cuboid } = jscad.primitives

export function main (v) {
  const plate = v.ops.union(cylinder({ radius: v.radius, height: v.t, center: [0, 0, v.t / 2] }),
    cuboid({ size: [v.arm, v.bar, v.t], center: [v.arm / 2, 0, v.t / 2] }), cylinder({ radius: v.bar / 2, height: v.t, center: [v.arm, 0, v.t / 2] }))
  const third = (2 * Math.PI) / v.planets
  const pins = [0, 1, 2].map((k) => cylinder({ radius: v.pin / 2, height: v.drop, center: [v.a * Math.cos(k * third), v.a * Math.sin(k * third), v.t + v.drop / 2] }))
  const hole = cylinder({ radius: v.hole / 2, height: v.t, center: [0, 0, v.t / 2] })
  const socket = cylinder({ radius: v.peg / 2 - v.fit, height: v.t, center: [v.arm, 0, v.t / 2] })
  return v.ops.subtract(v.ops.union(plate, ...pins), hole, socket)
}
```

```json projects/home/objects/winder-handle.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "winder-handle",
  "title": "Winder handle",
  "version": "0.1.0",
  "uses": ["x1c"],
  "anchors": { "peg": { "at": [0, 0, "grip_height"], "axis": [0, 0, -1] } },
  "variables": {
    "grip": { "value": 9, "unit": "mm", "rule": "A finger round it" },
    "grip_height": { "value": 22, "unit": "mm", "rule": "A finger's width and a little" },
    "peg": { "value": 4, "unit": "mm", "rule": "Into the arm's socket" },
    "peg_height": { "value": "x1c.layer * 15", "unit": "mm", "rule": "Through the arm" }
  }
}
```

```js projects/home/objects/winder-handle.js
// The handle as it prints: the grip on the bed, its peg standing on top.
import jscad from '@jscad/modeling'
const { cylinder } = jscad.primitives

export function main (v) {
  return v.ops.union(cylinder({ radius: v.grip / 2, height: v.grip_height, center: [0, 0, v.grip_height / 2] }),
    cylinder({ radius: v.peg / 2, height: v.peg_height, center: [0, 0, v.grip_height + v.peg_height / 2] }))
}
```

The assembly holds the ring on the case, by two push pins up from the case's rim into counterbored holes in the
ring's (the fit that says so is what the check reads as holding it), and turns the carrier on the crank; the `planetary` turns the sun and the
planets with it, in phase. The gears sit two layers off the case, so nothing rubs as it turns. The case, the sun and the carrier
are built with Manifold's booleans (`"engine": "manifold"`): closed solids, so the check measures them quickly.

```json projects/home/assemblies/winder.json
{
  "title": "Spool winder",
  "kind": "fit",
  "items": [
    { "id": "case", "object": "winder-case" },
    { "id": "ring", "object": "winder-ring", "at": [0, 0, "case.t"] },
    { "id": "sun", "object": "winder-sun" },
    { "id": "carrier", "object": "winder-carrier" },
    { "id": "handle", "object": "winder-handle" },
    { "id": "p0", "object": "winder-gear" },
    { "id": "p1", "object": "winder-gear" },
    { "id": "p2", "object": "winder-gear" }
  ],
  "joints": [
    { "id": "sun", "type": "revolute", "parent": { "item": "case", "at": [0, 0, "case.t + 0.4"], "axis": [0, 0, 1] }, "child": "sun.axis", "min": -3000, "max": 3000 },
    { "id": "crank", "type": "revolute", "parent": { "item": "case", "at": [0, 0, "case.t + 0.8 + ring.width + carrier.t"], "axis": [0, 0, 1] }, "child": "carrier.axis", "min": -180, "max": 180, "label": "Crank" },
    { "id": "handle", "type": "fixed", "parent": "carrier.grip", "child": "handle.peg" },
    { "id": "p0", "type": "revolute", "parent": "carrier.p0", "child": "p0.axis", "min": -3000, "max": 3000 },
    { "id": "p1", "type": "revolute", "parent": "carrier.p1", "child": "p1.axis", "min": -3000, "max": 3000 },
    { "id": "p2", "type": "revolute", "parent": "carrier.p2", "child": "p2.axis", "min": -3000, "max": 3000 }
  ],
  "planetary": [
    { "sun": "sun", "carrier": "carrier", "ring": "ring", "planets": ["p0", "p1", "p2"], "drive": "carrier",
      "module": "ring.module", "teeth": ["sun.teeth", "p0.teeth", "ring.teeth"] }
  ],
  "fits": [{ "a": "handle", "b": "carrier", "min": "0 - carrier.fit * 2", "note": "The handle's peg pressed into the arm" },
    { "a": "ring", "b": "case", "fastens": true, "note": "The ring held still on the case by its two push pins" },
    { "a": "handle", "b": "carrier", "engage": "carrier.t", "note": "The handle's peg through the arm" }],
  "poses": { "rest": { "crank": 0 }, "quarter": { "crank": 90 } }
}
```

```sh
npx cad check home/winder
npx cad check home/winder --sweep --steps 24
```

The check says `the carrier drives the sun and the planets (the ring held): 4 turns of the sun for each turn of the
carrier, the same way`, and each planet's centre distance and contact ratio. The sweep turns the crank from −180° to
180°, the sun four times as far, and looks for anything that touches. Move a planet's anchor off its 120° and the
check fails it: it can't mesh with the sun and the ring at once there.

## 10. A motor: the focus slider, driven

The same slide, with a 28BYJ-48 geared stepper in place of the knob: 5 V, a few pounds to buy, slow and strong. A motor in an
assembly is an item with `"motor"`, drawn from `@rulecad/motors`, bought and not printed. Its shaft turns the joint it
drives, the viewer's slider moves in the motor's steps, and `loads` say what it has to do. Its figures come with their
kinds: the 28BYJ-48's torque varies between makers, and the check says what its answer rests on.

The pinion takes the motor's shaft, two flats and all, with `v.motors.bore`. The motor sits under the plate, shaft up
through it, so its body needs room below: two feet stand the rail up.

```json projects/home/objects/drive-pinion.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "drive-pinion",
  "title": "Motor pinion",
  "version": "0.1.0",
  "uses": ["x1c"],
  "engine": "manifold",
  "anchors": { "axis": { "at": [0, 0, "0 - gap"], "axis": [0, 0, 1] } },
  "variables": {
    "module": { "value": 1, "unit": "mm", "rule": "As the rack" },
    "teeth": { "value": 14, "rule": "As the knob's pinion" },
    "shift": { "value": 0.2, "rule": "14 teeth need at least 0.19" },
    "width": { "value": "x1c.layer * 30", "unit": "mm", "rule": "The rack's width" },
    "gap": { "value": "x1c.layer + 0.1", "unit": "mm", "rule": "Clear of the plate" },
    "tip": { "value": 5.1, "unit": "mm", "rule": "Where the shaft's tip is from the pinion's underside: 10 mm of shaft less the 4.6 mm plate and the gap" }
  }
}
```

```js projects/home/objects/drive-pinion.js
// A pinion with the motor's shaft in it: the flats of the bore run only as far as the shaft's flats do.
export function main (v) {
  const motor = v.motors.motorModel('28byj48')
  return v.ops.subtract(v.gears.spur({ module: v.module, teeth: v.teeth, shift: v.shift, width: v.width }), v.motors.bore(motor, { depth: v.width, tip: v.tip }, v.ops))
}
```

```json projects/home/objects/drive-rail.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "drive-rail",
  "title": "Motor rail",
  "version": "0.1.0",
  "uses": ["x1c"],
  "engine": "manifold",
  "anchors": {
    "axle": { "at": [0, "centre", "thick"], "axis": [0, 0, 1] },
    "track": { "at": ["start", 0, "thick"], "axis": [1, 0, 0] }
  },
  "variables": {
    "centre": { "value": 7.2, "unit": "mm", "rule": "The pinion's axis above the rack's pitch line: m z / 2 + x m" },
    "length": { "value": 120, "unit": "mm", "rule": "The rack and its travel" },
    "start": { "value": -37.7, "unit": "mm", "rule": "The rack's middle under the pinion at rest" },
    "thick": { "value": "x1c.layer * 23", "unit": "mm", "rule": "23 layers: the motor's boss pocket, and enough for its M3 screws" },
    "y0": { "value": -14.5, "unit": "mm", "rule": "Past the motor's near ear" },
    "y1": { "value": 29, "unit": "mm", "rule": "Past its far ear, 17.5 mm off the axis" },
    "plate": { "value": 26, "unit": "mm", "rule": "Wide enough round the motor's boss and its ears" },
    "guide_y": { "value": "0 - 5.45 - x1c.line / 2", "unit": "mm", "rule": "Behind the rack's back, half a line clear" },
    "guide": { "value": "x1c.line * 4", "unit": "mm", "rule": "The guide wall: four lines" },
    "guide_height": { "value": "x1c.layer * 20", "unit": "mm", "rule": "Most of the rack's width" },
    "hole": { "value": 3.5, "unit": "mm", "rule": "M3 clearance, for the feet" },
    "foot_x": { "value": 52, "unit": "mm", "rule": "Each foot's screw, from the middle" },
    "foot_y": { "value": -11, "unit": "mm", "rule": "On the strip, behind the guide" }
  }
}
```

```js projects/home/objects/drive-rail.js
// The rail: a strip under the rack, a plate for the motor (turned 90° on its shaft, so its ears clear the rack), a wall
// behind the rack, and the motor's own cuts.
import jscad from '@jscad/modeling'
const { cuboid, cylinder } = jscad.primitives
const { translate, rotateZ } = jscad.transforms

export function main (v) {
  const motor = v.motors.motorModel('28byj48')
  const strip = cuboid({ size: [v.length, 12, v.thick], center: [0, v.y0 + 6, v.thick / 2] })
  const seat = cuboid({ size: [v.plate, v.y1 - v.y0, v.thick], center: [8, (v.y0 + v.y1) / 2, v.thick / 2] })
  const guide = cuboid({ size: [v.length, v.guide, v.guide_height], center: [0, v.guide_y - v.guide / 2, v.thick + v.guide_height / 2] })
  const cuts = translate([0, v.centre, 0], rotateZ(Math.PI / 2, v.motors.mount(motor, { plate: v.thick, screw: 'M3' }, v.ops)))
  const screws = [1, -1].map((s) => cylinder({ radius: v.hole / 2, height: v.thick + 2, center: [s * v.foot_x, v.foot_y, v.thick / 2] }))
  return v.ops.subtract(v.ops.union(strip, seat, guide), cuts, screws)
}
```

```json projects/home/objects/drive-foot.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "drive-foot",
  "title": "Rail foot",
  "version": "0.1.0",
  "uses": ["x1c"],
  "variables": {
    "height": { "value": 21, "unit": "mm", "rule": "Under the motor: its 19 mm can and 2 mm to the table" },
    "size": { "value": 12, "unit": "mm", "rule": "As wide as the strip" },
    "long": { "value": 28, "unit": "mm", "rule": "Across the strip's end, for a stance that doesn't rock" },
    "hole": { "value": 2.9, "unit": "mm", "rule": "M3 screw, self-tapped into the plastic" },
    "depth": { "value": 12, "unit": "mm", "rule": "Plenty for an M3 × 16" }
  }
}
```

```js projects/home/objects/drive-foot.js
// A foot: a block under each end of the rail, screwed on from above.
import jscad from '@jscad/modeling'
const { cuboid, cylinder } = jscad.primitives
const { subtract } = jscad.booleans

export function main (v) {
  const block = cuboid({ size: [v.size, v.long, v.height], center: [0, 0, v.height / 2] })
  return subtract(block, cylinder({ radius: v.hole / 2, height: v.depth, center: [0, 0, v.height - v.depth / 2] }))
}
```

The assembly says the motor drives the pinion's joint, the slide follows by its `mesh`, and the load is a force on the
slide: a 200 g camera on a rail with the friction of plastic on plastic, about 1 N. The `shaft` fit reads the bore from
the pinion as drawn. `duty` says the motor runs a fifth of the time, since a focus stack is mostly standing still.

```json projects/home/assemblies/driven.json
{
  "title": "Motorised focus slider",
  "kind": "fit",
  "items": [
    { "id": "rail", "object": "drive-rail" },
    { "id": "foot_a", "object": "drive-foot", "at": ["0 - rail.foot_x", "rail.foot_y", "0 - foot_a.height"] },
    { "id": "foot_b", "object": "drive-foot", "at": ["rail.foot_x", "rail.foot_y", "0 - foot_b.height"] },
    { "id": "drive", "motor": { "model": "28byj48", "drives": "pinion", "duty": 0.2, "screw": "M3" }, "at": [0, "rail.centre", 0], "rotate": [0, 0, 90] },
    { "id": "gear", "object": "drive-pinion" },
    { "id": "rack", "object": "rack" }
  ],
  "joints": [
    { "id": "pinion", "type": "revolute", "parent": "rail.axle", "child": "gear.axis", "label": "Motor" },
    { "id": "slide", "type": "prismatic", "parent": "rail.track", "child": "rack.slide", "min": -100, "max": 100,
      "mesh": { "with": "pinion", "module": "gear.module", "teeth": ["gear.teeth", "rack.teeth"], "shift": ["gear.shift", 0] } }
  ],
  "fits": [
    { "a": "foot_a", "b": "rail", "fastens": true, "min": 0, "note": "A foot, screwed on" },
    { "a": "foot_b", "b": "rail", "fastens": true, "min": 0, "note": "A foot, screwed on" },
    { "a": "drive", "b": "rail", "fastens": true, "min": 0, "note": "The motor, on its two ears" },
    { "a": "drive", "b": "gear", "shaft": true, "note": "The motor's shaft in the pinion" }
  ],
  "loads": [{ "joint": "slide", "force": 1, "note": "A 200 g camera sliding, plastic on plastic" }],
  "poses": { "home": { "pinion": 0 } }
}
```

```sh
npx cad check home/driven
npx cad check home/driven --sweep --steps 12
```

The check says which motor it is and how far a step moves (`0.0879° a step`, or 0.0107 mm of slide), that its shaft is
on the pinion's axis, the force reaching the slide against the 1 N it has to push and how many times over, how fast the
slide moves, and that the slide holds with the power off: the 28BYJ-48's own gearbox friction, far more than the load can
turn it back with. The torque's line ends `(rests on community figures: measure it)`, because that's what its torque is.

## 11. A robot joint: a stepper through a compound planetary

A shoulder for a small desktop arm: a NEMA 17 turning a 38:1 gearbox on one axis, 500 g at 150 mm on the output. The
gearbox is a compound planetary: two rings a few teeth apart, one held and one the output, with stepped planets (18 teeth on the
held ring and the sun, 21 on the output ring). `compoundPlanetary` found the teeth; three planets of 18/21, a sun of 18,
rings of 54 and 57. The planets are held by the sun and the two rings: there's no carrier to print, and the assembly's
`carrier` is a speck that's only there to carry the planets' joints. At 38:1 the gearbox is under half efficient, so
the load can't turn it backwards: the joint holds with the power off.

```json projects/home/objects/joint-housing.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "joint-housing",
  "title": "Joint housing and fixed ring",
  "version": "0.1.0",
  "uses": ["x1c"],
  "engine": "manifold",
  "anchors": { "axis": { "at": [0, 0, "plate"], "axis": [0, 0, 1] } },
  "variables": {
    "plate": { "value": 5, "unit": "mm", "rule": "Enough for M3 screws into a NEMA 17 (1.5 × their size)" },
    "width": { "value": 8, "unit": "mm", "rule": "The fixed ring's face: strong enough for the motor's whole torque" },
    "rim": { "value": 62, "unit": "mm", "rule": "Round the 54-tooth ring, three lines and more of wall" },
    "module": { "value": 1, "unit": "mm", "rule": "The gears'" },
    "teeth": { "value": 54, "rule": "The held ring" },
    "post_r": { "value": 37, "unit": "mm", "rule": "Three posts outside the output ring's 33 mm" },
    "post": { "value": 7, "unit": "mm", "rule": "Each post's diameter" },
    "post_height": { "value": 19.7, "unit": "mm", "rule": "From the plate to under the clips, just over the output ring" },
    "pilot": { "value": 2.9, "unit": "mm", "rule": "An M3 screw, self-tapped" },
    "pilot_depth": { "value": 8, "unit": "mm", "rule": "For an M3 × 10" }
  }
}
```

```js projects/home/objects/joint-housing.js
// A motor plate with the fixed ring standing on it. The motor bolts underneath, its shaft up through the middle.
import jscad from '@jscad/modeling'
const { cylinder } = jscad.primitives
const { translate } = jscad.transforms

export function main (v) {
  const motor = v.motors.motorModel('nema17')
  const plate = cylinder({ radius: v.rim / 2, height: v.plate, center: [0, 0, v.plate / 2], segments: 96 })
  const ring = translate([0, 0, v.plate], v.gears.internal({ module: v.module, teeth: v.teeth, width: v.width, rim: v.rim }))
  const at = (a) => [v.post_r * Math.cos(a), v.post_r * Math.sin(a)]
  const angles = [Math.PI / 6, (5 * Math.PI) / 6, (3 * Math.PI) / 2]
  const lobes = angles.map((a) => cylinder({ radius: v.post, height: v.plate, center: [...at(a), v.plate / 2], segments: 32 }))
  const posts = angles.map((a) => cylinder({ radius: v.post / 2, height: v.post_height + v.plate, center: [...at(a), (v.post_height + v.plate) / 2], segments: 32 }))
  const arms = angles.map((a) => jscad.transforms.rotateZ(a, jscad.primitives.cuboid({ size: [v.post_r - v.rim / 2 + 2, v.post, v.plate], center: [(v.post_r + v.rim / 2 - 2) / 2, 0, v.plate / 2] })))
  const pilots = angles.map((a) => cylinder({ radius: v.pilot / 2, height: v.pilot_depth, center: [...at(a), v.plate + v.post_height - v.pilot_depth / 2], segments: 24 }))
  return v.ops.subtract(v.ops.union(plate, ring, lobes, posts, arms), v.motors.mount(motor, { plate: v.plate, counterbore: true }, v.ops), pilots)
}
```

```json projects/home/objects/joint-sun.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "joint-sun",
  "title": "Sun gear on the motor's shaft",
  "version": "0.1.0",
  "uses": ["x1c"],
  "engine": "manifold",
  "anchors": { "axis": { "at": [0, 0, "0 - gap"], "axis": [0, 0, 1] } },
  "variables": {
    "gap": { "value": 0.3, "unit": "mm", "rule": "Clear of the motor plate" },
    "module": { "value": 1, "unit": "mm", "rule": "The gears'" },
    "teeth": { "value": 18, "rule": "As the planets' first step" },
    "width": { "value": 8, "unit": "mm", "rule": "The first stage" },
    "hub": { "value": 12, "unit": "mm", "rule": "A hub above the teeth, inside the planets' second step" },
    "tall": { "value": 16, "unit": "mm", "rule": "Up through both stages, so 12 mm of the shaft's flat is gripped" },
    "tip": { "value": 18.7, "unit": "mm", "rule": "Where the shaft's 24 mm tip is from the sun's underside, 5.3 mm above the mounting face" }
  }
}
```

```js projects/home/objects/joint-sun.js
// The sun with a hub above it, up through both stages, for grip on the shaft's flat.
import jscad from '@jscad/modeling'
const { cylinder } = jscad.primitives

export function main (v) {
  const motor = v.motors.motorModel('nema17')
  const gear = v.gears.spur({ module: v.module, teeth: v.teeth, width: v.width })
  const hub = cylinder({ radius: v.hub / 2, height: v.tall, center: [0, 0, v.tall / 2], segments: 64 })
  return v.ops.subtract(v.ops.union(gear, hub), v.motors.bore(motor, { depth: v.tall, tip: v.tip }, v.ops))
}
```

```json projects/home/objects/joint-planet.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "joint-planet",
  "title": "Stepped planet",
  "version": "0.1.0",
  "uses": ["x1c"],
  "engine": "manifold",
  "anchors": { "axis": { "at": [0, 0, "width * 2 + gap"], "axis": [0, 0, -1] } },
  "variables": {
    "gap": { "value": 0.3, "unit": "mm", "rule": "Clear of the motor plate" },
    "module": { "value": 1, "unit": "mm", "rule": "The gears'" },
    "low": { "value": 18, "rule": "On the sun and the held ring" },
    "high": { "value": 21, "rule": "On the output ring" },
    "width": { "value": 8, "unit": "mm", "rule": "Each stage" }
  }
}
```

```js projects/home/objects/joint-planet.js
// A planet in two steps, in one piece, printed with the wider step on the bed.
import jscad from '@jscad/modeling'
const { translate } = jscad.transforms

export function main (v) {
  const high = v.gears.spur({ module: v.module, teeth: v.high, width: v.width })
  const low = translate([0, 0, v.width], v.gears.spur({ module: v.module, teeth: v.low, width: v.width, chamfer: 0 }))
  return v.ops.union(high, low)
}
```

```json projects/home/objects/joint-output.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "joint-output",
  "title": "Output ring and flange",
  "version": "0.1.0",
  "uses": ["x1c"],
  "engine": "manifold",
  "anchors": { "axis": { "at": [0, 0, "top + width"], "axis": [0, 0, -1] }, "tip": { "at": [150, 0, "top + width"], "axis": [0, 0, -1] } },
  "variables": {
    "top": { "value": 3, "unit": "mm", "rule": "The flange, printed on the bed" },
    "width": { "value": 8, "unit": "mm", "rule": "The output ring's face" },
    "rim": { "value": 66, "unit": "mm", "rule": "Round the 57-tooth ring" },
    "module": { "value": 1, "unit": "mm", "rule": "The gears'" },
    "teeth": { "value": 57, "rule": "The output ring" },
    "hole": { "value": 3.5, "unit": "mm", "rule": "M3 clearance, on a 40 mm circle, for the arm" },
    "middle": { "value": 15, "unit": "mm", "rule": "A hole in the middle for the motor's shaft to come up in" },
    "bolt": { "value": 20, "unit": "mm", "rule": "Radius of the arm's bolt circle" }
  }
}
```

```js projects/home/objects/joint-output.js
// The output ring, drawn as it prints: its flange on the bed, the teeth standing on it; it goes on upside down.
import jscad from '@jscad/modeling'
const { cylinder } = jscad.primitives
const { translate } = jscad.transforms

export function main (v) {
  const flange = cylinder({ radius: v.rim / 2, height: v.top, center: [0, 0, v.top / 2], segments: 96 })
  const ring = translate([0, 0, v.top], v.gears.internal({ module: v.module, teeth: v.teeth, width: v.width, rim: v.rim }))
  const holes = [0, 1, 2, 3].map((k) => cylinder({ radius: v.hole / 2, height: v.top + 1, center: [v.bolt * Math.cos(k * Math.PI / 2), v.bolt * Math.sin(k * Math.PI / 2), v.top / 2], segments: 24 }))
  const middle = cylinder({ radius: v.middle / 2, height: v.top + 1, center: [0, 0, v.top / 2], segments: 48 })
  return v.ops.subtract(v.ops.union(flange, ring), holes, middle)
}
```

Three clips on three posts keep the output ring from lifting off. It turns under them with 0.3 mm to spare.

```json projects/home/objects/joint-clip.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "joint-clip",
  "title": "Retaining clip",
  "version": "0.1.0",
  "uses": ["x1c"],
  "variables": {
    "reach": { "value": 6, "unit": "mm", "rule": "In over the flange's edge, 4 mm" },
    "back": { "value": 4, "unit": "mm", "rule": "Round the post" },
    "wide": { "value": 8, "unit": "mm", "rule": "As wide as the post and a little" },
    "thick": { "value": 3, "unit": "mm", "rule": "Fifteen layers" },
    "hole": { "value": 3.5, "unit": "mm", "rule": "M3 clearance" }
  }
}
```

```js projects/home/objects/joint-clip.js
// A flat tab screwed to a post, its nose over the flange.
import jscad from '@jscad/modeling'
const { cuboid, cylinder } = jscad.primitives
const { subtract } = jscad.booleans

export function main (v) {
  const tab = cuboid({ size: [v.reach + v.back, v.wide, v.thick], center: [(v.back - v.reach) / 2, 0, v.thick / 2] })
  return subtract(tab, cylinder({ radius: v.hole / 2, height: v.thick + 1, center: [0, 0, v.thick / 2], segments: 24 }))
}
```

```json projects/home/objects/joint-speck.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "joint-speck",
  "title": "Carrier (not printed)",
  "version": "0.1.0",
  "role": "reference",
  "anchors": {
    "axis": { "at": [0, 0, 0], "axis": [0, 0, 1] },
    "a": { "at": [18, 0, 0], "axis": [0, 0, 1] },
    "b": { "at": ["0 - 9", "18 * sind(120)", 0], "axis": [0, 0, 1] },
    "c": { "at": ["0 - 9", "0 - 18 * sind(120)", 0], "axis": [0, 0, 1] }
  },
  "variables": { "r": { "value": 0.2, "unit": "mm", "rule": "A speck, so the planets' joints have something to hang from" } }
}
```

```js projects/home/objects/joint-speck.js
// Nothing is printed here: the planets ride on the sun and the rings. A mark for the planets' joints to be on.
import jscad from '@jscad/modeling'
const { sphere } = jscad.primitives

export function main (v) { return sphere({ radius: v.r, center: [0, 0, 60] }) }
```

The joint's load is a mass on the output. The check finds the worst angle by running the motor through its range.

```json projects/home/assemblies/shoulder.json
{
  "title": "Robot shoulder",
  "kind": "fit",
  "gravity": [0, -1, 0],
  "items": [
    { "id": "housing", "object": "joint-housing" },
    { "id": "motor", "motor": { "model": "nema17", "drives": "drive", "speed": 300, "duty": 0.3 } },
    { "id": "sun", "object": "joint-sun" },
    { "id": "carrier", "object": "joint-speck" },
    { "id": "p1", "object": "joint-planet" },
    { "id": "p2", "object": "joint-planet" },
    { "id": "p3", "object": "joint-planet" },
    { "id": "output", "object": "joint-output" },
    { "id": "clip1", "object": "joint-clip", "at": ["37 * cosd(30)", "37 * sind(30)", 24.7], "rotate": [0, 0, 30] },
    { "id": "clip2", "object": "joint-clip", "at": ["37 * cosd(150)", "37 * sind(150)", 24.7], "rotate": [0, 0, 150] },
    { "id": "clip3", "object": "joint-clip", "at": [0, -37, 24.7], "rotate": [0, 0, 270] }
  ],
  "joints": [
    { "id": "drive", "type": "revolute", "parent": "housing.axis", "child": "sun.axis", "label": "Motor" },
    { "id": "turn", "type": "revolute", "parent": "housing.axis", "child": "carrier.axis" },
    { "id": "s1", "type": "revolute", "parent": "carrier.a", "child": "p1.axis" },
    { "id": "s2", "type": "revolute", "parent": "carrier.b", "child": "p2.axis" },
    { "id": "s3", "type": "revolute", "parent": "carrier.c", "child": "p3.axis" },
    { "id": "out", "type": "revolute", "parent": { "at": [0, 0, 13.4], "axis": [0, 0, 1] }, "child": "output.axis" }
  ],
  "planetary": [{ "sun": "sun", "carrier": "carrier", "ring": "housing", "planets": ["p1", "p2", "p3"], "drive": "sun", "module": 1, "teeth": [18, 18, 54], "output": { "ring": "output", "planet": 21, "teeth": 57 } }],
  "fits": [
    { "a": "motor", "b": "housing", "fastens": true, "min": 0, "note": "The motor, on its four screws" },
    { "a": "clip1", "b": "housing", "fastens": true, "min": 0, "note": "A clip, screwed on" },
    { "a": "clip2", "b": "housing", "fastens": true, "min": 0, "note": "A clip, screwed on" },
    { "a": "clip3", "b": "housing", "fastens": true, "min": 0, "note": "A clip, screwed on" },
    { "a": "motor", "b": "sun", "shaft": true, "note": "The motor's shaft in the sun" }
  ],
  "loads": [{ "mass": 0.5, "at": "output.tip", "note": "500 g at 150 mm: a forearm" }],
  "poses": { "home": { "drive": 0 } }
}
```

```sh
npx cad check home/shoulder
```

The check says the output ring turns 1/38 of the motor's turn, the other way; that 7.44 N m reaches the joint at 300 rpm
against the 0.735 N m it needs at its worst, ten times over; that it turns a full turn in 7.6 s at that speed; and
that the gears, under 50% efficient, hold it with the power off. `npx cad check home/shoulder --sweep --steps 24` turns the
motor all the way round and finds no teeth touching, and neither do the output ring's steps.

Ten times over is more margin than the job needs, but the gearbox is the size it is for what the motor could do to it, not
the arm: stalled against a stop, the 7.44 N m at the output puts 33 MPa on the planets' top teeth (`strength`, the Lewis
equation, for teeth 8 mm wide), against PLA's 39. Give that a home switch, or a smaller current.
