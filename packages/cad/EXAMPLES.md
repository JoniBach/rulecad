# Worked examples: from parts to a mechanism

[The tutorial](TUTORIAL.md) ends with a wall hook checked against its screw. These examples carry on from there, one
for each thing the [README](README.md) describes after that: parts, variants and releases, joints and poses, a model
from elsewhere, an optimised part, a board, a mechanism printed flat, gears, a gearbox, a motor, a robot joint, and a machine sized from its task. Each is a few files and the commands to run
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

## 12. A machine from its task: a SCARA arm that draws

A two-link arm with a pen, standing on a bench, draws on an A5 sheet to 0.3 mm at 50 mm/s. That sentence is the
design's first line and everything else follows from it: where the sheet goes, how long the links are, what turns them,
and what the error budget has to say. This chapter is a whole machine, so it is long. It is the project in
`examples/bench/projects/arm` written out in full: the tests write every file here and run every command.

The arm is a compound planetary at the shoulder (chapter 11's gearbox, on a 17HS4401) and the same gearbox at the
elbow on a smaller motor. Its joints are vertical, so gravity never loads a motor. The base can bolt flat on a
bench to draw, or upright on a stand later, on the same four holes.

### The task, and where the sheet goes

A sheet can face the arm either way. Portrait, the far corners are 290 mm from the shoulder; landscape, 242 mm, for the
same paper, because the arm's reach is a circle and a landscape sheet fits inside it better. Landscape it is: the 210 mm
side across the arm's front, its near edge 70 mm from the shoulder (past the base, with room for the pen holder), its
centre at (144, 0), and its plane at z = 0, the bench.

The tool's plane has to be the sheet's. The pen's tip rests 1 mm below the paper, because that is how the leaf spring
presses it down, so the tool anchor for the task is a point on the holder level with the paper, not the pen's tip itself.

### The link lengths, from reach

The far corner is at √(218² + 105²) = 242 mm, and the arm has to stay away from full stretch there. Near full stretch
the arm can only go sideways, and moving outward needs the elbow to race: the `task.speed` check finds the slowest point
on the sheet, and with 95% of full stretch at the far corner (the first idea, 150 and 110 mm) the slowest point was only
31 mm/s against 50. Giving it 88% of full stretch brings the slowest point up to 51 mm/s. So L1 + L2 = 242 / 0.88 = 275 mm.

The split between them is decided by the error, because an angle at the elbow swings only the forearm, and an angle at the
shoulder swings the whole reach. For equal joint errors the pen moves (242 + L2) × angle at the far corner, so the forearm
should be as short as the reach allows. The limit is the near edge: fully folded the arm reaches in to L1 − L2 from the
shoulder, and the elbow's home switch stops it at 160° of fold. At 160° of fold,
160 mm and 115 mm reach in to 65 mm, inside the near edge at 70. Shorter forearms leave the near edge out of reach:
115 mm is the shortest that works. These are the `upper` and `fore` rules in the rule set below.

| Links (mm) | Far corner | Slowest speed (motor at 240 rpm) |
|---|---|---|
| 150 + 110 | 93% of full stretch | 31 mm/s |
| 155 + 115 | 90% | 39 mm/s |
| 160 + 115 | 88% | 41 mm/s (51 at 300 rpm) |
| 170 + 120 | 83% | 38 mm/s (slower again: the shoulder's limit takes over) |

### The elbow, from the numbers

Three ways to turn the elbow:

| | Elbow motor | Step at the pen | What it adds | |
|---|---|---|---|---|
| Direct | NEMA 17 on the joint, no gears | 0.225° × 115 mm = 0.45 mm at 1/8 step | 280 g | over the 0.3 mm budget from one term |
| Belt to the base | Motor at the base, a belt up to a pulley | depends on the ratio: 3:1 at most from pulleys that fit | No belt in the catalogue yet; the elbow couples to the shoulder and the sag of the belt is an error of its own | later |
| Geared | NEMA 14 through the 38:1 gearbox | 0.0059° × 115 mm = 0.012 mm at 1/8 step | 190 g; the gearbox's play and twist | the choice |

The geared elbow uses the shoulder's gearbox unchanged, so the sun, the planets and the output ring are the same prints
and the same bench test measures both. NEMA 14 rather than a second 17 because the torque the elbow needs is tiny: 0.08 N m
at the elbow (the pen's drag, the forearm's inertia, the bias) against 2.27 N m the small motor gives through 38:1,
and it weighs 90 g less at the end of a 160 mm link. The fixed ring is printed into the upper arm itself: the elbow costs
a sun, three planets, an output ring and three clips.

### The bearing

The output ring turns inside fixed posts, so nothing printed can go through it. The bearing goes above the gearbox: a
6800 in a three-armed bridge, with the output's shaft up through it, and the arm on a hexagon at the shaft's top. The upper arm's
screw clamps the inner race between the spindle's collar and the arm's collar, so the arm's weight and the tipping moment go
through the balls and not through the gears. `joint.moment` reports it, and `fit.seat` checks the seat as drawn.

Two rubber bands bias the joints, one from the upper arm to a corner bolt of the base and one across the elbow, each
pulling the same way across the whole of the sheet: the arm's backlash is always taken up the same way, which is why
play can appear in the budget as a small figure at all. Without the bias, 0.15 mm of drawn backlash is about 0.3° at the
output, which is 1.2 mm at the far corner. The rules give the figures with the bias as targets, marked `estimate`: bench
tests 14, 15 and 17 in `examples/bench/projects/benchmarks/MEASURE.md` measure them, and `cad measured` writes them back
and moves the budget.

The rules: the reach, the stack of parts from the bench up, and what the budget assumes.

```json rules/arm.json
{
  "_doc": "The drawing arm's own figures: its reach, its stack of parts, and what its error budget assumes until the bench measures it. Examples chapter 12 explains each.",
  "name": "arm",
  "rules": {
    "sheet_w": {"value": 210, "unit": "mm", "rule": "An A5 sheet's long side, across the arm's front", "kind": "spec", "source": "ISO 216", "checked": "2026-11-09"},
    "sheet_h": {"value": 148, "unit": "mm", "rule": "An A5 sheet's short side, away from the arm", "kind": "spec", "source": "ISO 216", "checked": "2026-11-09"},
    "near": {"value": 70, "unit": "mm", "rule": "From the shoulder's axis to the sheet's near edge: past the base and the pen holder's width", "kind": "default", "source": "EXAMPLES.md chapter 12", "checked": "2026-11-09"},
    "upper": {"value": 160, "unit": "mm", "rule": "Shoulder to elbow: with the forearm, the shortest pair that keeps the far corner at 88% of full stretch (the speed check's slowest point) and folds to the near edge", "kind": "default", "source": "EXAMPLES.md chapter 12", "checked": "2026-11-09"},
    "fore": {"value": 115, "unit": "mm", "rule": "Elbow to pen: as short as the reach allows, because the elbow's error swings through it", "kind": "default", "source": "EXAMPLES.md chapter 12", "checked": "2026-11-09"},
    "play_shoulder": {"value": 0.02, "unit": "°", "rule": "The shoulder's play at its output with the bias spring taking up the gear backlash", "kind": "estimate", "source": "A target, not a measurement: bench test 14 in projects/benchmarks/MEASURE.md settles it", "checked": "2026-11-09"},
    "play_elbow": {"value": 0.02, "unit": "°", "rule": "The elbow's play, the same gearbox and bias", "kind": "estimate", "source": "A target, not a measurement: bench test 14", "checked": "2026-11-09"},
    "twist_shoulder": {"value": 0.01, "unit": "°", "rule": "The shoulder's gear train twisting under the pen's drag and the bias", "kind": "estimate", "source": "A guess: bench test 15", "checked": "2026-11-09"},
    "twist_elbow": {"value": 0.01, "unit": "°", "rule": "The elbow's gear train twisting, the same", "kind": "estimate", "source": "A guess: bench test 15", "checked": "2026-11-09"},
    "deflection": {"value": 0.02, "unit": "mm", "rule": "The links bending sideways at the pen under its drag, from beam formulas", "kind": "estimate", "source": "0.3 N of drag on the forearm and holder as cantilevers: bench test 17 measures the whole budget at once", "checked": "2026-11-09"},
    "drag": {"value": 0.3, "unit": "N", "rule": "A pen's drag on paper, about, pulled sideways at the tip", "kind": "estimate", "source": "A hand guess from a pen on a spring scale: measure yours", "checked": "2026-11-09"},
    "shoulder_torque": {"value": 0.2, "unit": "N m", "rule": "What the shoulder must do at the task's speed and accel: the pen's drag at 240 mm, the arm's inertia and the bias", "kind": "estimate", "source": "Drag 0.07 N m + inertia about 0.03 N m + the rubber band's bias 0.1 N m", "checked": "2026-11-09"},
    "elbow_torque": {"value": 0.08, "unit": "N m", "rule": "What the elbow must do: the pen's drag at 110 mm, the forearm's inertia and the bias", "kind": "estimate", "source": "Drag 0.03 N m + inertia 0.01 N m + the rubber band's bias 0.04 N m", "checked": "2026-11-09"},
    "foot": {"value": 6, "unit": "mm", "rule": "The base plate's thickness", "kind": "default", "source": "Stiff enough for four M5 screws", "checked": "2026-11-09"},
    "room": {"value": 2, "unit": "mm", "rule": "Air between the shoulder motor's back and the base plate", "kind": "default", "source": "Design", "checked": "2026-11-09"},
    "motor17": {"value": 40, "unit": "mm", "rule": "The 17HS4401's body length", "kind": "community", "source": "nema17 variant 17HS4401 (https://market.samm.com/17hs4401-nema17-step-motor-en)", "checked": "2026-11-09"},
    "face": {"value": "foot + room + motor17", "unit": "mm", "rule": "The shoulder motor's mounting face above the bench: the base's height", "kind": "default", "source": "The stack", "checked": "2026-11-09"},
    "plate": {"value": 5, "unit": "mm", "rule": "The shoulder housing's plate: enough for M3 screws into a NEMA 17 (1.5 × their size)", "kind": "default", "source": "Chapter 11's housing", "checked": "2026-11-09"},
    "gear": {"value": 8, "unit": "mm", "rule": "Each gear stage's face", "kind": "default", "source": "Chapter 11's gearbox", "checked": "2026-11-09"},
    "ring_gap": {"value": 0.4, "unit": "mm", "rule": "Between the fixed ring and the output ring", "kind": "default", "source": "Chapter 11's gearbox", "checked": "2026-11-09"},
    "flange": {"value": 5, "unit": "mm", "rule": "The output ring's flange: thick enough for four M3 screws to bite", "kind": "default", "source": "Design", "checked": "2026-11-09"},
    "output_top": {"value": "face + plate + gear + ring_gap + gear + flange", "unit": "mm", "rule": "Top of the shoulder's output flange above the bench", "kind": "default", "source": "The stack", "checked": "2026-11-09"},
    "disc": {"value": 3, "unit": "mm", "rule": "The spindle's disc, on the flange", "kind": "default", "source": "Design", "checked": "2026-11-09"},
    "bridge_gap": {"value": 0.6, "unit": "mm", "rule": "Between the spindle's disc and the bridge above it", "kind": "default", "source": "Design", "checked": "2026-11-09"},
    "bridge": {"value": 7, "unit": "mm", "rule": "The bridge's thickness: the 5 mm bearing and a 2 mm ledge", "kind": "default", "source": "Design", "checked": "2026-11-09"},
    "bridge_low": {"value": "output_top + disc + bridge_gap", "unit": "mm", "rule": "The bridge's underside above the bench", "kind": "default", "source": "The stack", "checked": "2026-11-09"},
    "arm_gap": {"value": 0.5, "unit": "mm", "rule": "Between the bridge's top and the upper arm's underside", "kind": "default", "source": "Design", "checked": "2026-11-09"},
    "arm": {"value": 12, "unit": "mm", "rule": "The upper arm's thickness, a plate over the elbow too: about 1.7 mm of sag under its load at 8 mm thick, 0.5 mm at 12", "kind": "default", "source": "The cantilever formula in EXAMPLES.md chapter 12", "checked": "2026-11-09"},
    "switch_pitch": {"value": 9.5, "unit": "mm", "rule": "Between the endstop's two screw holes", "kind": "estimate", "source": "endstop-10t85 in @rulecad/rules: the set has words among its figures, so an object can't read it through uses", "checked": "2026-11-09"},
    "bearing_bore": {"value": 10, "unit": "mm", "rule": "The 6800's bore", "kind": "spec", "source": "bearing-6800 in @rulecad/rules (NTN)", "checked": "2026-11-09"},
    "bearing_outer": {"value": 19, "unit": "mm", "rule": "The 6800's outside diameter", "kind": "spec", "source": "bearing-6800", "checked": "2026-11-09"},
    "bearing_width": {"value": 5, "unit": "mm", "rule": "The 6800's width", "kind": "spec", "source": "bearing-6800", "checked": "2026-11-09"},
    "boss": {"value": 11.5, "unit": "mm", "rule": "The forearm's boss, so the bar passes under the elbow's clips", "kind": "default", "source": "The stack", "checked": "2026-11-09"},
    "elbow_flange": {"value": "bridge_low + bridge + arm_gap - gear - ring_gap - gear - flange", "unit": "mm", "rule": "The elbow output flange's underside, where the forearm bolts on: the upper arm's underside less the elbow's stack", "kind": "default", "source": "The stack", "checked": "2026-11-09"},
    "fore_low": {"value": "elbow_flange - boss", "unit": "mm", "rule": "The forearm bar's underside above the bench", "kind": "default", "source": "The stack", "checked": "2026-11-09"},
    "fore_mid": {"value": "fore_low + arm_mid", "unit": "mm", "rule": "The holder's bolts, level with the middle of the forearm", "kind": "default", "source": "The stack", "checked": "2026-11-09"},
    "arm_mid": {"value": 4, "unit": "mm", "rule": "Half the forearm's 8 mm thickness", "kind": "default", "source": "The stack", "checked": "2026-11-09"},
    "press": {"value": 1, "unit": "mm", "rule": "How far below the paper the pen tip sits at rest, so the leaf spring presses it down", "kind": "default", "source": "Sets the pen force through the guide's stiffness", "checked": "2026-11-09"}
  }
}
```

```json projects/arm/project.json
{
  "name": "arm",
  "description": "A SCARA arm sized from its task: an A5 sheet, a pen, 0.3 mm at 50 mm/s. EXAMPLES chapter 12 explains it.",
  "material": "PLA",
  "objects": [
    "base",
    "housing",
    "sun",
    "planet",
    "speck",
    "output",
    "bridge",
    "spindle",
    "upper",
    "clip",
    "forearm",
    "holder"
  ]
}
```

### The base and the shoulder

A square plate that takes four M5 bolts, flat on the bench or upright on a stand. Three columns hold the shoulder housing,
with the motor hanging between them, and a post carries the shoulder's home switch.

```json projects/arm/objects/base.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "base",
  "title": "Base: plate and motor stand",
  "version": "0.1.0",
  "uses": ["x1c", "arm", "m2", "m3", "m5"],
  "engine": "manifold",
  "orientation": "The plate on the bed, columns up",
  "description": "A square plate that bolts down through four corner holes, flat on the bench or upright on a stand, with three columns round the motor carrying the shoulder housing and a post for the home switch.",
  "anchors": {
    "top": {"at": [0, 0, "column_top"], "axis": [0, 0, 1]},
    "cable": {"at": ["0 - side / 2", 0, "foot"], "axis": [0, 0, 1]},
    "switch": {"at": ["(post_r + switch_pitch / 2) * cosd(post_a)", "(post_r + switch_pitch / 2) * sind(post_a)", "post_top + switch_half"], "axis": [0, 0, 1], "ref": ["0 - cosd(post_a)", "0 - sind(post_a)", 0]}
  },
  "variables": {
    "side": {"value": 96, "unit": "mm", "rule": "The plate's side: round the columns, with room for the bolts", "label": "Plate", "show": true},
    "foot": {"value": "arm.foot", "unit": "mm", "rule": "The plate's thickness"},
    "corner": {"value": 8, "unit": "mm", "rule": "The plate's corners, rounded"},
    "bolt": {"value": "m5.clearance", "unit": "mm", "rule": "Bolts through to the bench, or an upright stand"},
    "bolt_at": {"value": 38, "unit": "mm", "rule": "Half the bolts' square: the same pattern on a bench and on a stand"},
    "column_top": {"value": "arm.face", "unit": "mm", "rule": "Up to the shoulder motor's mounting face"},
    "column_r": {"value": 37, "unit": "mm", "rule": "Round the motor's corners"},
    "column": {"value": 10, "unit": "mm", "rule": "Solid, stiff enough for the arm's tipping load: section against 2 x the arm's weight in the chapter"},
    "pilot": {"value": 2.9, "unit": "mm", "rule": "An M3 screw self-tapped into the column's top", "kind": "community"},
    "pilot_depth": {"value": 16, "unit": "mm", "rule": "For an M3 × 20 through the housing's plate"},
    "post_r": {"value": 50, "unit": "mm", "rule": "The switch post, outside the housing's posts", "interface": true},
    "post_a": {"value": 235, "unit": "°", "rule": "Round from the front: where the upper arm's flag meets the switch's lever at the shoulder's home, -116°", "interface": true},
    "post_w": {"value": 14, "unit": "mm", "rule": "The post's width along the radius, for the switch's two screws"},
    "post_d": {"value": 12, "unit": "mm", "rule": "The post's depth, tangential"},
    "post_top": {"value": "arm.bridge_low + arm.bridge - 6", "unit": "mm", "rule": "The switch lies on the post, its lever under the arm's flag"},
    "switch_pilot": {"value": "m2.clearance - 0.6", "unit": "mm", "rule": "An M2 screw self-tapped into the post", "kind": "community"},
    "switch_pitch": {"value": "arm.switch_pitch", "unit": "mm", "rule": "The switch's screw spacing"},
    "switch_depth": {"value": 10, "unit": "mm", "rule": "Pilot depth for M2 × 8"},
    "segments": {"value": 64, "rule": "Round enough"},
    "rad": {"value": 0.017453293, "rule": "Radians in a degree"},
    "c1": {"value": 90, "unit": "°", "rule": "First column, between the motor's corners"},
    "c2": {"value": 210, "unit": "°", "rule": "Second column"},
    "c3": {"value": 330, "unit": "°", "rule": "Third column"},
    "switch_half": {"value": 3, "unit": "mm", "rule": "Half the switch's thickness: it lies on the post, its screws straight down"}
  }
}
```

```js projects/arm/objects/base.js
// A plate with three columns and a post: first layer one square with four holes.
import jscad from '@jscad/modeling'
const { cylinder, cuboid, roundedRectangle } = jscad.primitives
const { extrudeLinear } = jscad.extrusions
const { translate, rotateZ } = jscad.transforms

export function main (v) {
  const plate = extrudeLinear({ height: v.foot }, roundedRectangle({ size: [v.side, v.side], roundRadius: v.corner, segments: v.segments }))
  const angles = [v.c1, v.c2, v.c3].map((a) => a * v.rad)
  const at = (r, a) => [r * Math.cos(a), r * Math.sin(a)]
  const columns = angles.map((a) => cylinder({ radius: v.column / 2, height: v.column_top, center: [...at(v.column_r, a), v.column_top / 2], segments: v.segments }))
  const pilots = angles.map((a) => cylinder({ radius: v.pilot / 2, height: v.pilot_depth, center: [...at(v.column_r, a), v.column_top - v.pilot_depth / 2], segments: v.segments }))
  const a = v.post_a * v.rad
  const post = translate([...at(v.post_r, a), 0], rotateZ(a, cuboid({ size: [v.post_w, v.post_d, v.post_top], center: [0, 0, v.post_top / 2] })))
  const pads = [-1, 1].map((s) => cylinder({ radius: v.switch_pilot / 2, height: v.switch_depth, center: [...at(v.post_r + s * v.switch_pitch / 2, a), v.post_top - v.switch_depth / 2], segments: v.segments }))
  const holes = [[1, 1], [-1, 1], [1, -1], [-1, -1]].map(([x, y]) => cylinder({ radius: v.bolt / 2, height: v.foot + 1, center: [x * v.bolt_at, y * v.bolt_at, v.foot / 2], segments: v.segments }))
  return v.ops.subtract(v.ops.union(plate, columns, post), pilots, pads, holes)
}
```

The housing is chapter 11's with its posts longer, and with the bridge in place of the clips. Above each motor's boss is a
45° cone up through the plate: a pocket there would have to be bridged.

```json projects/arm/objects/housing.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "housing",
  "title": "Shoulder housing and fixed ring",
  "version": "0.1.0",
  "uses": ["x1c", "arm", "m3"],
  "engine": "manifold",
  "orientation": "The motor plate on the bed, the ring and posts up",
  "anchors": {
    "axis": {"at": [0, 0, "plate"], "axis": [0, 0, 1]},
    "motor": {"at": [0, 0, 0], "axis": [0, 0, 1], "ref": [1, 0, 0]}
  },
  "variables": {
    "plate": {"value": "arm.plate", "unit": "mm", "rule": "The motor plate", "interface": true},
    "gear": {"value": "arm.gear", "unit": "mm", "rule": "The fixed ring's face: strong enough for the motor's whole torque"},
    "rim": {"value": 62, "unit": "mm", "rule": "Round the 54-tooth ring, three lines and more of wall"},
    "module": {"value": 1, "unit": "mm", "rule": "The gears'"},
    "teeth": {"value": 54, "rule": "The fixed ring"},
    "post_r": {"value": 37, "unit": "mm", "rule": "Three posts outside the output ring", "interface": true},
    "post": {"value": 7, "unit": "mm", "rule": "Each post's diameter"},
    "post_high": {"value": "arm.bridge_low - arm.face - plate", "unit": "mm", "rule": "From the plate to under the bridge", "interface": true},
    "pilot": {"value": 2.9, "unit": "mm", "rule": "An M3 screw self-tapped", "kind": "community"},
    "pilot_depth": {"value": 8, "unit": "mm", "rule": "For an M3 × 16 through the bridge"},
    "column_r": {"value": 37, "unit": "mm", "rule": "Over the base's columns"},
    "lobe": {"value": 12, "unit": "mm", "rule": "The plate reaches out over each column"},
    "screw": {"value": "m3.clearance + x1c.hole_comp", "unit": "mm", "rule": "M3 clearance, down into the column"},
    "head": {"value": "m3.head + 2 * x1c.fit + x1c.hole_comp", "unit": "mm", "rule": "The screw head's counterbore"},
    "head_depth": {"value": "m3.head_height + x1c.layer", "unit": "mm", "rule": "A socket head's height, sunk"},
    "segments": {"value": 64, "rule": "Round enough"},
    "ring_segments": {"value": 96, "rule": "Smooth to the eye and to the gear"},
    "rad": {"value": 0.017453293, "rule": "Radians in a degree"},
    "p1": {"value": 30, "unit": "°", "rule": "First post"},
    "p2": {"value": 150, "unit": "°", "rule": "Second post"},
    "p3": {"value": 270, "unit": "°", "rule": "Third post"},
    "f1": {"value": 90, "unit": "°", "rule": "First foot, over a column"},
    "f2": {"value": 210, "unit": "°", "rule": "Second foot"},
    "f3": {"value": 330, "unit": "°", "rule": "Third foot"}
  }
}
```

```js projects/arm/objects/housing.js
// The motor plate with the fixed ring and posts standing on it. The motor bolts underneath, its shaft up through the middle.
import jscad from '@jscad/modeling'
const { cylinder, cylinderElliptic } = jscad.primitives
const { translate } = jscad.transforms

export function main (v) {
  const motor = v.motors.motorModel('17HS4401')
  const at = (r, a) => [r * Math.cos(a), r * Math.sin(a)]
  const posts = [v.p1, v.p2, v.p3].map((a) => a * v.rad), feet = [v.f1, v.f2, v.f3].map((a) => a * v.rad)
  const plate = cylinder({ radius: v.rim / 2, height: v.plate, center: [0, 0, v.plate / 2], segments: v.ring_segments })
  const ring = translate([0, 0, v.plate], v.gears.internal({ module: v.module, teeth: v.teeth, width: v.gear, rim: v.rim }))
  const lobes = [...posts, ...feet].map((a) => cylinder({ radius: v.lobe / 2, height: v.plate, center: [...at(v.post_r, a), v.plate / 2], segments: v.segments }))
  const joins = [...posts, ...feet].map((a) => jscad.transforms.rotateZ(a, jscad.primitives.cuboid({ size: [v.post_r - v.rim / 2 + 2, v.lobe, v.plate], center: [(v.post_r + v.rim / 2 - 2) / 2, 0, v.plate / 2] })))
  const uprights = posts.map((a) => cylinder({ radius: v.post / 2, height: v.post_high + v.plate, center: [...at(v.post_r, a), (v.post_high + v.plate) / 2], segments: v.segments }))
  const pilots = posts.map((a) => cylinder({ radius: v.pilot / 2, height: v.pilot_depth, center: [...at(v.post_r, a), v.plate + v.post_high - v.pilot_depth / 2], segments: v.segments }))
  const screws = feet.map((a) => cylinder({ radius: v.screw / 2, height: v.plate + 1, center: [...at(v.column_r, a), v.plate / 2], segments: v.segments }))
  const heads = feet.map((a) => cylinder({ radius: v.head / 2, height: v.head_depth, center: [...at(v.column_r, a), v.plate - v.head_depth / 2], segments: v.segments }))
  // the pocket for the motor's boss would be bridged across: a 45° cone from its roof up through the plate needs no bridge
  const hole = v.motors.mountModel(motor, { plate: v.plate, counterbore: true }), rise = v.plate - hole.pocketDepth
  const roof = cylinderElliptic({ height: rise + 1, startRadius: [hole.pocket / 2, hole.pocket / 2], endRadius: [hole.pocket / 2 - rise - 1, hole.pocket / 2 - rise - 1], center: [0, 0, hole.pocketDepth + (rise + 1) / 2], segments: v.segments })
  return v.ops.subtract(v.ops.union(plate, ring, lobes, joins, uprights), v.motors.mount(motor, { plate: v.plate, counterbore: true }, v.ops), pilots, screws, heads, roof)
}
```

Sun, planet, the carrier that isn't printed and the output ring are chapter 11's, with the output's flange thicker so its
holes can be self-tapped. The elbow's are the same prints.

```json projects/arm/objects/sun.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "sun",
  "title": "Sun gear on a motor's shaft",
  "version": "0.1.0",
  "uses": ["x1c"],
  "engine": "manifold",
  "orientation": "Gear down, the hub up",
  "anchors": {
    "axis": {"at": [0, 0, "0 - gap"], "axis": [0, 0, 1]}
  },
  "variables": {
    "gap": {"value": 0.3, "unit": "mm", "rule": "Clear of the motor plate"},
    "module": {"value": 1, "unit": "mm", "rule": "The gears'"},
    "teeth": {"value": 18, "rule": "As the planets' first step"},
    "width": {"value": 8, "unit": "mm", "rule": "The first stage"},
    "hub": {"value": 12, "unit": "mm", "rule": "A hub above the teeth, inside the planets' second step"},
    "tall": {"value": 16, "unit": "mm", "rule": "Up through both stages, so 12 mm of the shaft's flat is gripped"},
    "tip": {"value": 18.7, "unit": "mm", "rule": "Where the shaft's 24 mm tip is from the sun's underside, 5.3 mm above the mounting face (the elbow's plate is thicker: its sun sets this less)", "interface": true, "tweak": {"min": 10, "max": 24}},
    "segments": {"value": 64, "rule": "Round enough"}
  }
}
```

```js projects/arm/objects/sun.js
// The sun with a hub above it, up through both stages, for grip on the shaft's flat.
import jscad from '@jscad/modeling'
const { cylinder } = jscad.primitives

export function main (v) {
  const motor = v.motors.motorModel('nema17')
  const gear = v.gears.spur({ module: v.module, teeth: v.teeth, width: v.width })
  const hub = cylinder({ radius: v.hub / 2, height: v.tall, center: [0, 0, v.tall / 2], segments: v.segments })
  return v.ops.subtract(v.ops.union(gear, hub), v.motors.bore(motor, { depth: v.tall, tip: v.tip }, v.ops))
}
```

```json projects/arm/objects/planet.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "planet",
  "title": "Stepped planet",
  "version": "0.1.0",
  "uses": ["x1c"],
  "engine": "manifold",
  "orientation": "The wider step on the bed",
  "anchors": {
    "axis": {"at": [0, 0, "width * 2 + gap"], "axis": [0, 0, -1]}
  },
  "variables": {
    "gap": {"value": 0.3, "unit": "mm", "rule": "Clear of the motor plate"},
    "module": {"value": 1, "unit": "mm", "rule": "The gears'"},
    "low": {"value": 18, "rule": "On the sun and the held ring"},
    "high": {"value": 21, "rule": "On the output ring"},
    "width": {"value": 8, "unit": "mm", "rule": "Each stage"},
    "low_chamfer": {"value": 0.25, "unit": "mm", "rule": "The top step's tooth tips slanted in at their root, so they do not overhang the step below"}
  }
}
```

```js projects/arm/objects/planet.js
// A planet in two steps, in one piece, printed with the wider step on the bed.
import jscad from '@jscad/modeling'
const { translate } = jscad.transforms

export function main (v) {
  const high = v.gears.spur({ module: v.module, teeth: v.high, width: v.width })
  const low = translate([0, 0, v.width], v.gears.spur({ module: v.module, teeth: v.low, width: v.width, chamfer: v.low_chamfer }))
  return v.ops.union(high, low)
}
```

```json projects/arm/objects/speck.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "speck",
  "title": "Carrier (not printed)",
  "version": "0.1.0",
  "role": "reference",
  "anchors": {
    "axis": {"at": [0, 0, 0], "axis": [0, 0, 1]},
    "a": {"at": [18, 0, 0], "axis": [0, 0, 1]},
    "b": {"at": ["0 - 9", "18 * sind(120)", 0], "axis": [0, 0, 1]},
    "c": {"at": ["0 - 9", "0 - 18 * sind(120)", 0], "axis": [0, 0, 1]}
  },
  "variables": {
    "r": {"value": 0.2, "unit": "mm", "rule": "A speck, so the planets' joints have something to hang from"},
    "far": {"value": 110, "unit": "mm", "rule": "Out of the way, above the arm"}
  }
}
```

```js projects/arm/objects/speck.js
// Nothing is printed here: the planets ride on the sun and the rings. A mark for the planets' joints to be on.
import jscad from '@jscad/modeling'
const { sphere } = jscad.primitives

export function main (v) { return sphere({ radius: v.r, center: [0, 0, v.far] }) }
```

```json projects/arm/objects/output.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "output",
  "title": "Output ring and flange",
  "version": "0.1.0",
  "uses": ["x1c", "arm", "m3"],
  "engine": "manifold",
  "orientation": "The flange on the bed, the teeth standing on it",
  "description": "Printed flange down and fitted upside down: the same part on the shoulder and the elbow.",
  "anchors": {
    "axis": {"at": [0, 0, "top + width"], "axis": [0, 0, -1]},
    "flange": {"at": [0, 0, 0], "axis": [0, 0, -1]}
  },
  "variables": {
    "top": {"value": "arm.flange", "unit": "mm", "rule": "The flange, printed on the bed", "interface": true},
    "width": {"value": "arm.gear", "unit": "mm", "rule": "The output ring's face"},
    "rim": {"value": 66, "unit": "mm", "rule": "Round the 57-tooth ring"},
    "module": {"value": 1, "unit": "mm", "rule": "The gears'"},
    "teeth": {"value": 57, "rule": "The output ring"},
    "pilot": {"value": 2.9, "unit": "mm", "rule": "An M3 screw self-tapped into the flange", "kind": "community"},
    "middle": {"value": 15, "unit": "mm", "rule": "A hole in the middle for the motor's shaft to come up in"},
    "bolt": {"value": 20, "unit": "mm", "rule": "Radius of the bolt circle", "interface": true},
    "segments": {"value": 24, "rule": "Small holes"},
    "ring_segments": {"value": 96, "rule": "Smooth to the eye and to the gear"},
    "quarter": {"value": 1.57079633, "rule": "The bolts, a quarter turn apart, in radians"},
    "bolts": {"value": 4, "rule": "Four"}
  }
}
```

```js projects/arm/objects/output.js
// The output ring, drawn as it prints: its flange on the bed, the teeth standing on it; it goes on upside down.
import jscad from '@jscad/modeling'
const { cylinder } = jscad.primitives
const { translate } = jscad.transforms

export function main (v) {
  const flange = cylinder({ radius: v.rim / 2, height: v.top, center: [0, 0, v.top / 2], segments: v.ring_segments })
  const ring = translate([0, 0, v.top], v.gears.internal({ module: v.module, teeth: v.teeth, width: v.width, rim: v.rim }))
  const holes = Array.from({ length: v.bolts }, (_, k) => cylinder({ radius: v.pilot / 2, height: v.top + 1, center: [v.bolt * Math.cos(k * v.quarter), v.bolt * Math.sin(k * v.quarter), v.top / 2], segments: v.segments }))
  const middle = cylinder({ radius: v.middle / 2, height: v.top + 1, center: [0, 0, v.top / 2], segments: v.ring_segments })
  return v.ops.subtract(v.ops.union(flange, ring), holes, middle)
}
```

The spindle bolts onto the output's flange and carries the bearing's inner race on a shoulder. The bridge, on the housing's
posts, holds the outer race in a seat drawn from the 6800's rule set and this printer's press fit.

```json projects/arm/objects/bridge.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "bridge",
  "title": "Bridge: the 6800's seat",
  "version": "0.1.0",
  "uses": ["x1c", "arm", "m3"],
  "engine": "manifold",
  "orientation": "Upside to the sky, as it goes on: the pocket opens upward and its ledge prints flat",
  "description": "Three arms across the housing's posts, holding the bearing that takes the output's tipping load.",
  "anchors": {
    "seat": {"at": [0, 0, "thick - width"], "axis": [0, 0, 1]},
    "under": {"at": [0, 0, 0], "axis": [0, 0, 1]}
  },
  "variables": {
    "thick": {"value": "arm.bridge", "unit": "mm", "rule": "The bearing's width and a ledge", "interface": true},
    "bore": {"value": "arm.bearing_bore", "unit": "mm", "rule": "The 6800's bore"},
    "outer": {"value": "arm.bearing_outer", "unit": "mm", "rule": "The 6800's outside"},
    "width": {"value": "arm.bearing_width", "unit": "mm", "rule": "The 6800's width"},
    "relief": {"value": "thick - width", "unit": "mm", "rule": "Through the ledge, so the seat prints without a bridge"},
    "hub": {"value": 34, "unit": "mm", "rule": "Round the pocket, three lines and more of wall"},
    "post_r": {"value": 37, "unit": "mm", "rule": "On the housing's posts"},
    "lobe": {"value": 12, "unit": "mm", "rule": "Each arm's width"},
    "p1": {"value": 30, "unit": "°", "rule": "First post"},
    "p2": {"value": 150, "unit": "°", "rule": "Second post"},
    "p3": {"value": 270, "unit": "°", "rule": "Third post"},
    "rad": {"value": 0.017453293, "rule": "Radians in a degree"},
    "screw": {"value": "m3.clearance + x1c.hole_comp", "unit": "mm", "rule": "M3 clearance"},
    "head": {"value": "m3.head + 2 * x1c.fit + x1c.hole_comp", "unit": "mm", "rule": "The screw head's counterbore"},
    "head_depth": {"value": "m3.head_height + x1c.layer", "unit": "mm", "rule": "A socket head's height, sunk, so the arm passes over"},
    "segments": {"value": 64, "rule": "Round enough"}
  }
}
```

```js projects/arm/objects/bridge.js
// A three-armed plate over the gearbox, the bearing's seat in the middle.
import jscad from '@jscad/modeling'
const { cylinder, cuboid } = jscad.primitives
const { rotateZ } = jscad.transforms

export function main (v) {
  const posts = [v.p1, v.p2, v.p3].map((a) => a * v.rad), at = (a) => [v.post_r * Math.cos(a), v.post_r * Math.sin(a)]
  const hub = cylinder({ radius: v.hub / 2, height: v.thick, center: [0, 0, v.thick / 2], segments: v.segments * 2 })
  const arms = posts.map((a) => rotateZ(a, cuboid({ size: [v.post_r, v.lobe, v.thick], center: [v.post_r / 2, 0, v.thick / 2] })))
  const lobes = posts.map((a) => cylinder({ radius: v.lobe / 2, height: v.thick, center: [...at(a), v.thick / 2], segments: v.segments }))
  const seat = v.shapes.bearingSeat({ bore: v.bore, outer_diameter: v.outer, width: v.width }, { fit: 'press', relief: v.relief, through: true, printer: v.x1c, at: [0, 0, v.thick], into: '-z', lead: 0 })
  const screws = posts.map((a) => cylinder({ radius: v.screw / 2, height: v.thick + 1, center: [...at(a), v.thick / 2], segments: v.segments }))
  const heads = posts.map((a) => cylinder({ radius: v.head / 2, height: v.head_depth + 1, center: [...at(a), v.thick - (v.head_depth - 1) / 2], segments: v.segments }))
  return v.ops.subtract(v.ops.union(hub, arms, lobes), seat, screws, heads)
}
```

```json projects/arm/objects/spindle.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "spindle",
  "title": "Spindle: disc and shaft",
  "version": "0.1.0",
  "uses": ["x1c", "arm", "m3"],
  "engine": "manifold",
  "orientation": "The disc on the bed, the shaft up, as it goes on",
  "description": "The output's flange turns the spindle; the spindle's shaft runs in the 6800 and carries the upper arm on a hexagon at its top.",
  "anchors": {
    "down": {"at": [0, 0, 0], "axis": [0, 0, 1], "ref": [1, 0, 0]},
    "seat": {"at": [0, 0, "collar_top + width"], "axis": [0, 0, 1], "ref": [1, 0, 0]}
  },
  "variables": {
    "disc": {"value": "arm.disc", "unit": "mm", "rule": "Thick enough for a countersunk M3"},
    "rim": {"value": 46, "unit": "mm", "rule": "Round the 40 mm bolt circle"},
    "bolt": {"value": 20, "unit": "mm", "rule": "On the output's bolt circle"},
    "hole": {"value": "m3.clearance + x1c.hole_comp", "unit": "mm", "rule": "M3 clearance"},
    "head": {"value": "m3.head", "unit": "mm", "rule": "A countersunk head, flush with the disc so the bridge passes over"},
    "shaft": {"value": "arm.bearing_bore - x1c.press", "unit": "mm", "rule": "A close slide into the bearing's bore, clamped end to end by the upper arm's screw"},
    "width": {"value": "arm.bearing_width", "unit": "mm", "rule": "The bearing"},
    "collar_top": {"value": "arm.bridge_low + arm.bridge - width - arm.output_top", "unit": "mm", "rule": "Where the inner race rests, above the disc's underside"},
    "shoulder": {"value": 13, "unit": "mm", "rule": "Stops the inner race; clears the outer race"},
    "hex": {"value": 8, "unit": "mm", "rule": "Hexagon across its flats: inside the bore, drives the upper arm"},
    "hex_long": {"value": 5, "unit": "mm", "rule": "Into the arm's socket"},
    "pilot": {"value": 2.9, "unit": "mm", "rule": "An M3 screw self-tapped", "kind": "community"},
    "pilot_depth": {"value": 12, "unit": "mm", "rule": "For the arm's M3"},
    "cos30": {"value": "cosd(30)", "rule": "A hexagon, across corners to across flats"},
    "bolts": {"value": 4, "rule": "On the bolt circle"},
    "quarter": {"value": 1.57079633, "rule": "A quarter turn in radians"},
    "segments": {"value": 64, "rule": "Round enough"},
    "hex_segments": {"value": 6, "rule": "A hexagon's sides"}
  }
}
```

```js projects/arm/objects/spindle.js
// A disc on the output's flange and a shaft up through the bearing, a hexagon at its top for the arm.
import jscad from '@jscad/modeling'
const { cylinder } = jscad.primitives

export function main (v) {
  const plate = cylinder({ radius: v.rim / 2, height: v.disc, center: [0, 0, v.disc / 2], segments: v.segments * 2 })
  const top = v.collar_top + v.width
  const shaft = cylinder({ radius: v.shaft / 2, height: top - 1, center: [0, 0, (top + 1) / 2], segments: v.segments * 2 })
  const collar = v.shapes.shaftShoulder(v.shaft, { shoulder: v.shoulder, height: v.collar_top - v.disc, at: [0, 0, v.collar_top] })
  const hex = cylinder({ radius: v.hex / 2 / v.cos30, height: v.hex_long, center: [0, 0, top + v.hex_long / 2], segments: v.hex_segments })
  const screws = Array.from({ length: v.bolts }, (_, k) => {
    const c = [v.bolt * Math.cos(k * v.quarter), v.bolt * Math.sin(k * v.quarter), v.disc]
    return v.shapes.countersink({ hole: v.hole, head: v.head, length: v.disc + 1, at: c, into: '-z' })
  })
  const pilot = cylinder({ radius: v.pilot / 2, height: v.pilot_depth, center: [0, 0, top + v.hex_long - v.pilot_depth / 2], segments: v.segments })
  return v.ops.subtract(v.ops.union(plate, shaft, collar, hex), screws, pilot)
}
```

### The arm

The upper arm prints with its top face on the bed, and everything hanging below it rises off that face: the
hexagon's socket, the elbow's fixed ring and posts. The elbow's motor bolts to the bed side.

```json projects/arm/objects/upper.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "upper",
  "title": "Upper arm",
  "version": "0.1.0",
  "uses": ["x1c", "arm", "m2", "m3"],
  "engine": "manifold",
  "orientation": "The arm's top face on the bed: the hub, the elbow's fixed ring and its posts all rise from the one flat face, and go on hanging down",
  "description": "From the shoulder's hexagon to the elbow's motor. Printed as one part with the elbow's fixed ring, so the elbow's gearbox costs a sun, three planets and an output ring.",
  "anchors": {
    "hub": {"at": [0, 0, "thick + collar"], "axis": [0, 0, -1], "ref": [1, 0, 0]},
    "elbow": {"at": ["long", 0, "thick"], "axis": [0, 0, 1], "ref": [1, 0, 0]},
    "output": {"at": ["long", 0, "thick + gear + arm_gap"], "axis": [0, 0, 1], "ref": [1, 0, 0]},
    "motor": {"at": ["long", 0, 0], "axis": [0, 0, 1], "ref": [1, 0, 0]},
    "clip1": {"at": ["long + post_r * cosd(p1)", "post_r * sind(p1)", "clip_at"], "axis": [0, 0, 1], "ref": ["cosd(p1)", "sind(p1)", 0]},
    "clip2": {"at": ["long + post_r * cosd(p2)", "post_r * sind(p2)", "clip_at"], "axis": [0, 0, 1], "ref": ["cosd(p2)", "sind(p2)", 0]},
    "clip3": {"at": ["long + post_r * cosd(p3)", "post_r * sind(p3)", "clip_at"], "axis": [0, 0, 1], "ref": ["cosd(p3)", "sind(p3)", 0]},
    "switch": {"at": ["long + (switch_r - switch_pitch / 2) * cosd(switch_a)", "(switch_r - switch_pitch / 2) * sind(switch_a)", "thick + switch_high + switch_half"], "axis": [0, 0, 1], "ref": ["cosd(switch_a)", "sind(switch_a)", 0]},
    "flag": {"at": ["flag_r", 0, "thick + flag_h"], "axis": [0, 0, 1]},
    "cable": {"at": ["long / 2", 0, 0], "axis": [0, 0, 1]}
  },
  "variables": {
    "long": {"value": "arm.upper", "unit": "mm", "rule": "Shoulder to elbow", "label": "Upper arm", "show": true, "interface": true},
    "neck": {"value": 22, "unit": "mm", "rule": "The arm's width: its sag and sideways bending are in the chapter"},
    "hub": {"value": 36, "unit": "mm", "rule": "Round the hexagon socket"},
    "collar": {"value": "arm.arm_gap", "unit": "mm", "rule": "A collar on the arm's underside, on the bearing's inner race, so the outer race doesn't drag"},
    "collar_d": {"value": 13.5, "unit": "mm", "rule": "On the inner race, clear of the outer"},
    "hex": {"value": 8, "unit": "mm", "rule": "The spindle's hexagon"},
    "hex_depth": {"value": "thick + collar - floor", "unit": "mm", "rule": "The socket's depth"},
    "floor": {"value": 3, "unit": "mm", "rule": "What the screw pulls against: a socket's floor"},
    "hex_fit": {"value": "x1c.fit + x1c.hole_comp", "unit": "mm", "rule": "Across the socket's flats, over the spindle's, printed"},
    "screw": {"value": "m3.clearance + x1c.hole_comp", "unit": "mm", "rule": "M3 clearance"},
    "gear": {"value": "arm.gear", "unit": "mm", "rule": "The fixed ring's face"},
    "arm_gap": {"value": "arm.ring_gap", "unit": "mm", "rule": "Between the fixed ring and the output ring"},
    "rim": {"value": 62, "unit": "mm", "rule": "Round the 54-tooth ring"},
    "module": {"value": 1, "unit": "mm", "rule": "The gears'"},
    "teeth": {"value": 54, "rule": "The fixed ring"},
    "post_r": {"value": 37, "unit": "mm", "rule": "Three posts outside the output ring"},
    "post": {"value": 7, "unit": "mm", "rule": "Each post's diameter"},
    "lobe": {"value": 12, "unit": "mm", "rule": "The plate reaches out to each post"},
    "p1": {"value": 30, "unit": "°", "rule": "First post"},
    "p2": {"value": 150, "unit": "°", "rule": "Second post"},
    "p3": {"value": 270, "unit": "°", "rule": "Third post"},
    "rad": {"value": 0.017453293, "rule": "Radians in a degree"},
    "clip_at": {"value": "thick + gear + arm_gap + gear + arm.flange + clip_gap", "unit": "mm", "rule": "Each post's tip, where its clip goes on, just past the output's flange"},
    "clip_gap": {"value": 0.3, "unit": "mm", "rule": "The output turns under the clips with this to spare"},
    "pilot": {"value": 2.9, "unit": "mm", "rule": "An M3 screw self-tapped into a post", "kind": "community"},
    "pilot_depth": {"value": 8, "unit": "mm", "rule": "For an M3 × 10 through a clip"},
    "flag_r": {"value": 50, "unit": "mm", "rule": "The home flag, as far from the shoulder as its switch"},
    "flag_h": {"value": 5.5, "unit": "mm", "rule": "Down from the arm's underside far enough to reach the switch's lever"},
    "flag_wide": {"value": 14, "unit": "mm", "rule": "Along the radius"},
    "flag_thick": {"value": 4, "unit": "mm", "rule": "Tangential"},
    "switch_a": {"value": 183, "unit": "°", "rule": "Round from straight on: the forearm's flag meets the lever at 160° of fold"},
    "switch_r": {"value": 45.7, "unit": "mm", "rule": "The elbow switch, as far from the elbow as the forearm's flag: outside the posts' radius"},
    "switch_x": {"value": "long + switch_r * cosd(switch_a)", "unit": "mm", "rule": "Elbow switch post"},
    "switch_y": {"value": "switch_r * sind(switch_a)", "unit": "mm", "rule": "Elbow switch post"},
    "switch_high": {"value": 9.5, "unit": "mm", "rule": "A post so the switch hangs level with the forearm's flag"},
    "post_w": {"value": 14, "unit": "mm", "rule": "Elbow switch post, along the radius"},
    "post_d": {"value": 12, "unit": "mm", "rule": "Elbow switch post, tangential"},
    "switch_pitch": {"value": "arm.switch_pitch", "unit": "mm", "rule": "The switch's screw spacing"},
    "switch_pilot": {"value": "m2.clearance - 0.6", "unit": "mm", "rule": "An M2 self-tapped", "kind": "community"},
    "switch_depth": {"value": 9, "unit": "mm", "rule": "Pilot depth for M2 × 8"},
    "segments": {"value": 64, "rule": "Round enough"},
    "ring_segments": {"value": 96, "rule": "The rim's circle"},
    "hex_segments": {"value": 6, "rule": "A hexagon's sides"},
    "cos30": {"value": "cosd(30)", "rule": "A hexagon, across corners to across flats"},
    "thick": {"value": "arm.arm", "unit": "mm", "rule": "The arm's thickness, and the elbow motor's plate: 16 lines of 0.42 and 40 layers"},
    "bias_d": {"value": 4, "unit": "mm", "rule": "A hole for a rubber band, or a cable tie to hook one on"},
    "bias_1": {"value": 30, "unit": "mm", "rule": "The shoulder's band, from here to a corner bolt of the base"},
    "bias_2": {"value": 95, "unit": "mm", "rule": "The elbow's band, from here to the forearm"},
    "switch_half": {"value": 3, "unit": "mm", "rule": "Half the switch's thickness"}
  }
}
```

```js projects/arm/objects/upper.js
// The upper arm, drawn as it prints: its top face on the bed, the elbow's ring standing on it, the hub's socket opening
// upward. The elbow's NEMA 14 bolts on the bed side, its shaft up through the plate, as chapter 11's housing does.
import jscad from '@jscad/modeling'
const { cylinder, cylinderElliptic, cuboid, circle } = jscad.primitives
const { translate, rotateZ } = jscad.transforms
const { extrudeLinear } = jscad.extrusions
const { hull } = jscad.hulls

export function main (v) {
  const motor = v.motors.motorModel('nema14')
  const at = (r, a) => [v.long + r * Math.cos(a), r * Math.sin(a)]
  const posts = [v.p1, v.p2, v.p3].map((a) => a * v.rad)
  const round = (r, c) => translate([c, 0], circle({ radius: r, segments: v.segments }))
  const neck = extrudeLinear({ height: v.thick }, hull(round(v.hub / 2, 0), round(v.neck / 2, v.long)))
  const hub = cylinder({ radius: v.hub / 2, height: v.thick, center: [0, 0, v.thick / 2], segments: v.ring_segments })
  const plate = cylinder({ radius: v.rim / 2, height: v.thick, center: [v.long, 0, v.thick / 2], segments: v.ring_segments })
  const ring = translate([v.long, 0, v.thick], v.gears.internal({ module: v.module, teeth: v.teeth, width: v.gear, rim: v.rim }))
  const lobes = posts.map((a) => cylinder({ radius: v.lobe / 2, height: v.thick, center: [...at(v.post_r, a), v.thick / 2], segments: v.segments }))
  const joins = posts.map((a) => translate([v.long, 0, 0], rotateZ(a, cuboid({ size: [v.post_r - v.rim / 2 + 2, v.lobe, v.thick], center: [(v.post_r + v.rim / 2 - 2) / 2, 0, v.thick / 2] }))))
  const uprights = posts.map((a) => cylinder({ radius: v.post / 2, height: v.clip_at, center: [...at(v.post_r, a), v.clip_at / 2], segments: v.segments }))
  const pilots = posts.map((a) => cylinder({ radius: v.pilot / 2, height: v.pilot_depth, center: [...at(v.post_r, a), v.clip_at - v.pilot_depth / 2], segments: v.segments }))
  const collar = cylinder({ radius: v.collar_d / 2, height: v.collar + 1, center: [0, 0, v.thick + (v.collar - 1) / 2], segments: v.segments })
  const socket = cylinder({ radius: (v.hex + v.hex_fit) / 2 / v.cos30, height: v.hex_depth + 1, center: [0, 0, v.floor + (v.hex_depth + 1) / 2], segments: v.hex_segments })
  const through = cylinder({ radius: v.screw / 2, height: v.floor + 1, center: [0, 0, (v.floor - 1) / 2], segments: v.segments })
  const flag = cuboid({ size: [v.flag_wide, v.flag_thick, v.flag_h], center: [v.flag_r, 0, v.thick + v.flag_h / 2] })
  const a = v.switch_a * v.rad
  const switchPost = translate([v.switch_x, v.switch_y, 0], rotateZ(a, cuboid({ size: [v.post_w, v.post_d, v.thick + v.switch_high], center: [0, 0, (v.thick + v.switch_high) / 2] })))
  const switchPilots = [-1, 1].map((s) => cylinder({ radius: v.switch_pilot / 2, height: v.switch_depth, center: [v.switch_x + s * v.switch_pitch / 2 * Math.cos(a), v.switch_y + s * v.switch_pitch / 2 * Math.sin(a), v.thick + v.switch_high - v.switch_depth / 2], segments: v.segments }))
  const bands = [v.bias_1, v.bias_2].map((x) => cylinder({ radius: v.bias_d / 2, height: v.thick + 1, center: [x, 0, v.thick / 2], segments: v.segments }))
  const hole = v.motors.mountModel(motor, { plate: v.thick, counterbore: true }), rise = v.thick - hole.pocketDepth
  const roof = translate([v.long, 0, 0], cylinderElliptic({ height: rise + 1, startRadius: [hole.pocket / 2, hole.pocket / 2], endRadius: [hole.pocket / 2 - rise - 1, hole.pocket / 2 - rise - 1], center: [0, 0, hole.pocketDepth + (rise + 1) / 2], segments: v.segments }))
  const mount = translate([v.long, 0, 0], v.motors.mount(motor, { plate: v.thick, counterbore: true }, v.ops))
  return v.ops.subtract(v.ops.union(neck, hub, plate, ring, lobes, joins, uprights, collar, flag, switchPost), socket, through, pilots, switchPilots, bands, mount, roof)
}
```

```json projects/arm/objects/clip.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "clip",
  "title": "Retaining clip",
  "version": "0.1.0",
  "uses": ["x1c", "m3"],
  "orientation": "Flat on the bed",
  "description": "Holds the elbow's output ring from dropping off its posts.",
  "anchors": {
    "post": {"at": [0, 0, 0], "axis": [0, 0, 1], "ref": [1, 0, 0]}
  },
  "variables": {
    "reach": {"value": 6, "unit": "mm", "rule": "In over the flange's edge, 4 mm"},
    "back": {"value": 4, "unit": "mm", "rule": "Round the post"},
    "wide": {"value": 8, "unit": "mm", "rule": "As wide as the post and a little"},
    "thick": {"value": 3, "unit": "mm", "rule": "Fifteen layers"},
    "hole": {"value": "m3.clearance + x1c.hole_comp", "unit": "mm", "rule": "M3 clearance"},
    "segments": {"value": 24, "rule": "Small round hole"}
  }
}
```

```js projects/arm/objects/clip.js
// A flat tab screwed to a post, its nose over the flange.
import jscad from '@jscad/modeling'
const { cuboid, cylinder } = jscad.primitives
const { subtract } = jscad.booleans

export function main (v) {
  const tab = cuboid({ size: [v.reach + v.back, v.wide, v.thick], center: [(v.back - v.reach) / 2, 0, v.thick / 2] })
  return subtract(tab, cylinder({ radius: v.hole / 2, height: v.thick + 1, center: [0, 0, v.thick / 2], segments: v.segments }))
}
```

```json projects/arm/objects/forearm.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "forearm",
  "title": "Forearm",
  "version": "0.1.0",
  "uses": ["x1c", "arm", "m3"],
  "engine": "manifold",
  "orientation": "The bar flat on the bed, the boss and flag up",
  "anchors": {
    "hub": {"at": [0, 0, "boss"], "axis": [0, 0, -1], "ref": [1, 0, 0]},
    "holder": {"at": ["long", 0, "mid"], "axis": [0, 1, 0], "ref": [1, 0, 0]},
    "flag": {"at": ["flag_x", "flag_y", "bar + flag_h"], "axis": [0, 0, 1]},
    "cable": {"at": ["long / 2", 0, "bar"], "axis": [0, 0, 1]}
  },
  "variables": {
    "long": {"value": "arm.fore - pen_x", "unit": "mm", "rule": "To the holder's bolts: the 110 mm link less the holder's own reach", "label": "Forearm", "show": true, "interface": true},
    "pen_x": {"value": 54, "unit": "mm", "rule": "From the holder's bolts to the pen, its own reach"},
    "bar": {"value": 8, "unit": "mm", "rule": "Thickness, sized in the chapter"},
    "wide": {"value": 20, "unit": "mm", "rule": "Width by the boss"},
    "mid": {"value": "arm.arm_mid", "unit": "mm", "rule": "Half the thickness"},
    "boss": {"value": "arm.boss", "unit": "mm", "rule": "The bar passes under the elbow's clips, the boss above reaches the flange"},
    "boss_d": {"value": 46, "unit": "mm", "rule": "Round the 40 mm bolt circle"},
    "screw": {"value": "m3.clearance + x1c.hole_comp", "unit": "mm", "rule": "M3 clearance"},
    "head": {"value": "m3.head + 2 * x1c.fit + x1c.hole_comp", "unit": "mm", "rule": "The screw's head, counterbored in the bed side"},
    "head_depth": {"value": "m3.head_height + x1c.layer", "unit": "mm", "rule": "Sunk"},
    "bolt": {"value": 20, "unit": "mm", "rule": "The output's bolt circle, radius"},
    "bolts": {"value": 4, "rule": "On the bolt circle"},
    "quarter": {"value": 1.57079633, "rule": "A quarter turn in radians"},
    "block": {"value": 16, "unit": "mm", "rule": "The holder's thickness, between the cheeks"},
    "cheek": {"value": 6, "unit": "mm", "rule": "Each cheek's thickness"},
    "slot_fit": {"value": "x1c.fit + x1c.hole_comp", "unit": "mm", "rule": "Across the slot, over the holder"},
    "slot_from": {"value": 8, "unit": "mm", "rule": "The slot runs back this far before the holder's bolts"},
    "reach": {"value": 7, "unit": "mm", "rule": "Past the bolts, to the slot's end: stops before the servo's tab"},
    "pitch": {"value": 4, "unit": "mm", "rule": "Half the spacing between the holder's two bolts"},
    "flag_x": {"value": 44.75, "unit": "mm", "rule": "The home flag, along the arm"},
    "flag_y": {"value": 9.5, "unit": "mm", "rule": "On the cheek's far edge, past the elbow's posts: about 46 mm from the elbow"},
    "flag_h": {"value": 12, "unit": "mm", "rule": "Up to the elbow switch's lever"},
    "flag_wide": {"value": 5.5, "unit": "mm", "rule": "Along the arm"},
    "flag_thick": {"value": 4, "unit": "mm", "rule": "Sideways"},
    "segments": {"value": 64, "rule": "Round enough"},
    "bias_d": {"value": 4, "unit": "mm", "rule": "A hole for the elbow's rubber band"},
    "bias_at": {"value": 30, "unit": "mm", "rule": "Clear of the boss"}
  }
}
```

```js projects/arm/objects/forearm.js
// A short bar from the elbow's output to a yoke round the pen holder's block.
import jscad from '@jscad/modeling'
const { cylinder, cuboid, circle, rectangle } = jscad.primitives
const { translate } = jscad.transforms
const { extrudeLinear } = jscad.extrusions
const { hull } = jscad.hulls

export function main (v) {
  const endWide = v.block + v.cheek * 2, tip = v.long + v.reach
  const dot = (r, x) => translate([x, 0], circle({ radius: r, segments: v.segments }))
  const bar = extrudeLinear({ height: v.bar }, hull(dot(v.wide / 2, 0), rectangle({ size: [1, endWide], center: [tip - 1 / 2, 0] })))
  const boss = cylinder({ radius: v.boss_d / 2, height: v.boss, center: [0, 0, v.boss / 2], segments: v.segments * 2 })
  const slot = cuboid({ size: [tip + 1 - (v.long - v.slot_from), v.block + v.slot_fit, v.bar + 1], center: [(tip + 1 + v.long - v.slot_from) / 2, 0, v.bar / 2] })
  const holes = [-1, 1].map((s) => v.shapes.teardropHole({ d: v.screw, length: endWide + 1, at: [v.long + s * v.pitch, 0 - endWide / 2 - 1 / 2, v.mid], into: '+y', through: true }))
  const bolts = Array.from({ length: v.bolts }, (_, k) => cylinder({ radius: v.screw / 2, height: v.boss + 1, center: [v.bolt * Math.cos(k * v.quarter), v.bolt * Math.sin(k * v.quarter), v.boss / 2], segments: v.segments }))
  const heads = Array.from({ length: v.bolts }, (_, k) => cylinder({ radius: v.head / 2, height: v.head_depth + 1, center: [v.bolt * Math.cos(k * v.quarter), v.bolt * Math.sin(k * v.quarter), (v.head_depth - 1) / 2], segments: v.segments }))
  const flag = cuboid({ size: [v.flag_wide, v.flag_thick, v.flag_h], center: [v.flag_x, v.flag_y, v.bar + v.flag_h / 2] })
  const band = cylinder({ radius: v.bias_d / 2, height: v.bar + 1, center: [v.bias_at, 0, v.bar / 2], segments: v.segments })
  return v.ops.subtract(v.ops.union(bar, boss, flag), slot, holes, bolts, heads, band)
}
```

### The pen holder

A parallel guide of two tapered leaves, printed flat in PETG, is the pen's linear bearing and its spring at once: the
leaves are its pressure. At rest the leaves are straight and the tip sits 1 mm below the paper, so the paper pushes the
shuttle up 1 mm: 0.6 N on the pen. An SG90 on its stock horn lifts the shuttle by a lug, 5 mm at the most: 3 N, against
the servo's 9.8 N at 18 mm of horn, 3 times over, and 0.80% strain in the leaves against the PETG's limit. (The figures
come out of the build: the holder's `.js` computes them and refuses to build if the strain is too much.)

```json projects/arm/objects/holder.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "holder",
  "title": "Pen holder with lift",
  "version": "0.1.0",
  "uses": ["x1c", "arm", "petg", "m2", "m3"],
  "engine": "manifold",
  "material": "PETG",
  "orientation": "Flat on the bed: the drawing's x and y are the bed's, the pen's axis along y. The leaves bend within their layers. PETG: it creeps less than PLA held bent",
  "description": "A shuttle holding the pen on two tapered leaves: a parallel guide. Its spring is the pen's pressure; an SG90 on a stock horn lifts it. Drawn at rest, the leaves straight.",
  "anchors": {
    "mount": {"at": [0, 0, "half"], "axis": [0, 0, -1], "ref": [1, 0, 0]},
    "tool": {"at": ["pen_x", "paper", "half"], "axis": [0, 1, 0], "ref": [1, 0, 0]},
    "pen": {"at": ["pen_x", "paper - arm.press", "half"], "axis": [0, 1, 0], "ref": [1, 0, 0]},
    "servo": {"at": ["xh", "yh", "thick"], "axis": [0, 0, 1], "ref": [1, 0, 0]},
    "horn": {"at": ["xh", "yh", "thick + horn_at"], "axis": [0, 0, 1], "ref": [1, 0, 0]},
    "cable": {"at": ["xh", "yh", 0], "axis": [0, 0, 1]}
  },
  "variables": {
    "thick": {"value": 16, "unit": "mm", "rule": "The block's thickness, 80 layers, and the leaves' width", "interface": true},
    "half": {"value": "thick / 2", "unit": "mm", "rule": "Half of it"},
    "pen_x": {"value": 54, "unit": "mm", "rule": "From the bolts to the pen", "interface": true},
    "paper": {"value": "0 - arm.fore_mid", "unit": "mm", "rule": "The paper, in this frame: the bench is the sheet's plane, the bolts are level with the forearm's middle"},
    "pen_d": {"value": 10.4, "unit": "mm", "rule": "A 10 mm fineliner, 0.2 mm each side; set this to your pen"},
    "pen_wall": {"value": 7, "unit": "mm", "rule": "The shuttle reaches this far past the pen each way"},
    "leaf_t": {"value": "x1c.line * 2", "unit": "mm", "rule": "Two lines: stiff enough against pen drag, soft enough for the servo"},
    "leaf_l": {"value": 38, "unit": "mm", "rule": "Long enough to keep the strain small at full lift", "label": "Leaf", "show": true},
    "taper": {"value": 0.3, "rule": "Thickened toward both ends: the strain spread along the leaf"},
    "fillet": {"value": "x1c.line * 3", "unit": "mm", "rule": "A round where each leaf meets its block: no square corner to yield at"},
    "travel": {"value": 5, "unit": "mm", "rule": "1 mm below the paper at rest, to 4 mm above it lifted"},
    "gap": {"value": 20, "unit": "mm", "rule": "Between the leaves: resists the pen's drag twisting the shuttle"},
    "block_x": {"value": 8, "unit": "mm", "rule": "Half the bolt block's length along x"},
    "shuttle": {"value": 14, "unit": "mm", "rule": "Half the shuttle's height along y"},
    "bolt_y": {"value": 4, "unit": "mm", "rule": "Half the bolts' spacing along x"},
    "bolt": {"value": "m3.clearance + x1c.hole_comp", "unit": "mm", "rule": "M3 clearance, through the block"},
    "clamp": {"value": "m3.clearance - 0.6", "unit": "mm", "rule": "The pen's clamp screw, self-tapped through the shuttle's wall", "kind": "community"},
    "lug_x0": {"value": 43, "unit": "mm", "rule": "The lug the horn lifts, its left edge"},
    "lug_x1": {"value": 47.5, "unit": "mm", "rule": "Its right edge, clear of the pen"},
    "lug_y": {"value": -22.2, "unit": "mm", "rule": "Its underside, a hair above the horn at rest"},
    "horn_at": {"value": 13.3, "unit": "mm", "rule": "Horn seat above the tabs: the case's top and boss"},
    "lug_top": {"value": "thick + horn_at + 2", "unit": "mm", "rule": "Up to the horn's top"},
    "lug_wide": {"value": 4, "unit": "mm", "rule": "The lug's depth along y where it stands up: strong enough for 3 N"},
    "xh": {"value": 30, "unit": "mm", "rule": "The servo's shaft, along x"},
    "yh": {"value": -25, "unit": "mm", "rule": "The servo's shaft, along y"},
    "frame_x": {"value": 41.4, "unit": "mm", "rule": "The servo frame's right edge"},
    "frame_top": {"value": -16, "unit": "mm", "rule": "The frame's top edge, clear of the lower leaf's travel"},
    "frame_low": {"value": -37, "unit": "mm", "rule": "The frame's bottom edge"},
    "segments": {"value": 32, "rule": "Round enough"}
  }
}
```

```js projects/arm/objects/holder.js
// All in one flat print: a fixed frame with the servo, two tapered leaves, the shuttle with the pen's bore and a lug for the horn.
import jscad from '@jscad/modeling'
const { cuboid, cylinder } = jscad.primitives
const { translate } = jscad.transforms

export function main (v) {
  const f = v.flexures, material = f.flexureMaterial({ modulus: v.petg.modulus, strength: v.petg.strength, name: 'PETG' })
  const leaf = { length: v.leaf_l, thickness: v.leaf_t, width: v.thick, gap: v.gap, taper: v.taper, fillet: v.fillet, shuttle: v.pen_x - v.block_x - v.leaf_l + v.pen_wall, base: v.block_x * 2 }
  const model = f.parallelGuideModel(leaf, { E: v.petg.modulus })
  for (const x of f.printable({ thickness: v.leaf_t, width: v.thick, travel: v.travel }, v.x1c, material, model)) if (x.level === 'fail') throw new Error(x.text)
  const guide = translate([v.block_x, 0, 0], f.parallelGuide(leaf))
  const block = cuboid({ size: [v.block_x * 2, v.shuttle * 2, v.thick], center: [0, 0, v.half] })
  const frameBody = cuboid({ size: [v.frame_x + v.block_x, v.frame_top - v.frame_low, v.thick], center: [(v.frame_x - v.block_x) / 2, (v.frame_top + v.frame_low) / 2, v.half] })
  const tail = cuboid({ size: [v.block_x * 2, v.frame_top - v.frame_low + v.shuttle * 2 - 1, v.thick], center: [0, (v.frame_top + v.frame_low + v.shuttle * 2) / 2 - 1 / 2 - 1, v.half] })
  const shuttleBlock = cuboid({ size: [v.pen_x + v.pen_wall - v.block_x - v.leaf_l, v.shuttle * 2, v.thick], center: [v.block_x + v.leaf_l + (v.pen_x + v.pen_wall - v.block_x - v.leaf_l) / 2, 0, v.half] })
  const tabBody = cuboid({ size: [v.lug_x1 - v.lug_x0, (0 - v.shuttle) - v.lug_y + 1, v.thick], center: [(v.lug_x0 + v.lug_x1) / 2, (v.lug_y + (0 - v.shuttle) + 1) / 2, v.half] })
  const lug = cuboid({ size: [v.lug_x1 - v.lug_x0, v.lug_wide, v.lug_top - v.thick + 1], center: [(v.lug_x0 + v.lug_x1) / 2, v.lug_y + v.lug_wide / 2, v.thick + (v.lug_top - v.thick - 1) / 2] })
  const bore = v.shapes.teardropHole({ d: v.pen_d, length: v.shuttle * 2 + 1, at: [v.pen_x, 0 - v.shuttle - 1 / 2, v.half], into: '+y', through: true })
  const clamp = cylinder({ radius: v.clamp / 2, height: v.thick, center: [v.pen_x, 0, v.thick - v.half / 2], segments: v.segments })
  const servo = translate([v.xh, v.yh, v.thick], v.motors.mount(v.motors.motorModel('sg90'), { plate: v.thick }, v.ops))
  const holes = [-1, 1].map((s) => cylinder({ radius: v.bolt / 2, height: v.thick + 1, center: [s * v.bolt_y, 0, v.half], segments: v.segments }))
  return v.ops.subtract(v.ops.union(guide, block, frameBody, tail, shuttleBlock, tabBody, lug), bore, clamp, servo, holes)
}
```

Two more bought parts, drawn from a few measurements of the ones on the bench: the pen, and the horn.

```json projects/arm/objects/pen.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "pen",
  "title": "Pen (bought, a fineliner)",
  "version": "0.1.0",
  "role": "reference",
  "anchors": {
    "tip": {"at": [0, 0, 0], "axis": [0, 0, 1], "ref": [1, 0, 0]}
  },
  "variables": {
    "d": {"value": 10, "unit": "mm", "rule": "A fineliner's body, about: measure yours and set the holder's bore"},
    "long": {"value": 140, "unit": "mm", "rule": "Its length"},
    "point": {"value": 15, "unit": "mm", "rule": "The tapered point"},
    "tip_d": {"value": 2, "unit": "mm", "rule": "At the tip"},
    "segments": {"value": 32, "rule": "Round enough"}
  }
}
```

```js projects/arm/objects/pen.js
// A fineliner, drawn from a few measurements.
import jscad from '@jscad/modeling'
const { cylinder, cylinderElliptic } = jscad.primitives

export function main (v) {
  const body = cylinder({ radius: v.d / 2, height: v.long - v.point, center: [0, 0, v.point + (v.long - v.point) / 2], segments: v.segments })
  const cone = cylinderElliptic({ height: v.point, startRadius: [v.tip_d / 2, v.tip_d / 2], endRadius: [v.d / 2, v.d / 2], center: [0, 0, v.point / 2], segments: v.segments })
  return v.ops.union(body, cone)
}
```

```json projects/arm/objects/horn.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "horn",
  "title": "Servo horn (bought, comes with the SG90)",
  "version": "0.1.0",
  "role": "reference",
  "anchors": {
    "axis": {"at": [0, 0, 0], "axis": [0, 0, 1], "ref": [1, 0, 0]}
  },
  "variables": {
    "reach": {"value": 18, "unit": "mm", "rule": "Axis to the arm's tip, a single-arm horn as sold, about: measure yours", "kind": "estimate", "source": "Measured on one horn: SG90 horns vary"},
    "wide": {"value": 5, "unit": "mm", "rule": "The arm's width"},
    "thick": {"value": 2, "unit": "mm", "rule": "The arm's thickness"},
    "hub": {"value": 7, "unit": "mm", "rule": "Round the spline"},
    "segments": {"value": 24, "rule": "Round enough"}
  }
}
```

```js projects/arm/objects/horn.js
// The arm a servo comes with, pointing along x at rest.
import jscad from '@jscad/modeling'
const { cuboid, cylinder } = jscad.primitives

export function main (v) {
  const arm = cuboid({ size: [v.reach, v.wide, v.thick], center: [v.reach / 2, 0, v.thick / 2] })
  const hub = cylinder({ radius: v.hub / 2, height: v.thick, center: [0, 0, v.thick / 2], segments: v.segments })
  return v.ops.union(arm, hub)
}
```

### The assembly

One assembly, every output. The `task` block says what it is for; the `planetary` blocks are chapter 11's; the
drivers, the supply and the wires are `bought` items and `wires` entries; the joints carry their home switches
and the error terms that read the rules.

```json projects/arm/assemblies/arm.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/assembly.schema.json",
  "title": "SCARA arm that draws",
  "kind": "fit",
  "description": "A two-link arm on a bench, an A5 sheet in front of it. The task, the wires, the drivers and the supply are all here: one assembly, every output.",
  "uses": ["arm"],
  "items": [
    { "id": "base", "object": "base" },
    { "id": "m1", "motor": { "model": "17HS4401", "drives": "drive", "speed": 300, "duty": 0.3, "driver": "d1", "current": 0.5, "microsteps": 8 } },
    { "id": "housing", "object": "housing", "at": [0, 0, "arm.face"] },
    { "id": "sun", "object": "sun" },
    { "id": "carrier", "object": "speck" },
    { "id": "p1", "object": "planet" }, { "id": "p2", "object": "planet" }, { "id": "p3", "object": "planet" },
    { "id": "output", "object": "output" },
    { "id": "spindle", "object": "spindle" },
    { "id": "bridge", "object": "bridge", "at": [0, 0, "arm.bridge_low"] },
    { "id": "b1", "bought": "bearing-6800", "at": [0, 0, "arm.bridge_low + arm.bridge - arm.bearing_width"] },
    { "id": "upper", "object": "upper" },
    { "id": "m2", "motor": { "model": "nema14", "drives": "edrive", "speed": 300, "duty": 0.3, "driver": "d2", "current": 0.5, "microsteps": 8 } },
    { "id": "esun", "object": "sun", "set": { "tip": 11.7 } },
    { "id": "ecarrier", "object": "speck" }, { "id": "ering", "object": "speck" },
    { "id": "ep1", "object": "planet" }, { "id": "ep2", "object": "planet" }, { "id": "ep3", "object": "planet" },
    { "id": "eoutput", "object": "output" },
    { "id": "clip1", "object": "clip" }, { "id": "clip2", "object": "clip" }, { "id": "clip3", "object": "clip" },
    { "id": "forearm", "object": "forearm" },
    { "id": "holder", "object": "holder" },
    { "id": "servo", "motor": { "model": "sg90", "drives": "lift_servo", "duty": 0.05 } },
    { "id": "horn", "object": "horn" },
    { "id": "pen", "object": "pen" },
    { "id": "es1", "bought": "endstop-10t85" },
    { "id": "es2", "bought": "endstop-10t85" },
    { "id": "d1", "bought": "drv8825", "at": [-300, -30, 8] },
    { "id": "d2", "bought": "drv8825", "at": [-300, 0, 8] },
    { "id": "shield", "bought": "cnc-shield-v3", "at": [-300, 0, 0] },
    { "id": "psu", "bought": "supply-24v", "variant": "LRS-50-24", "at": [-330, 150, 0] }
  ],
  "joints": [
    { "id": "m1_on", "type": "fixed", "parent": "housing.motor", "child": "m1.face" },
    { "id": "drive", "type": "revolute", "parent": "housing.axis", "child": "sun.axis", "min": -4570, "max": 4588, "label": "Shoulder motor" },
    { "id": "turn", "type": "revolute", "parent": "housing.axis", "child": "carrier.axis", "min": -4570, "max": 4588 },
    { "id": "s1", "type": "revolute", "parent": "carrier.a", "child": "p1.axis", "min": -30000, "max": 30000 },
    { "id": "s2", "type": "revolute", "parent": "carrier.b", "child": "p2.axis", "min": -30000, "max": 30000 },
    { "id": "s3", "type": "revolute", "parent": "carrier.c", "child": "p3.axis", "min": -30000, "max": 30000 },
    { "id": "out", "type": "revolute", "parent": { "item": "housing", "at": [0, 0, "arm.plate + arm.gear + arm.ring_gap"], "axis": [0, 0, 1] }, "child": "output.axis", "min": -116, "max": 125, "label": "Shoulder", "support": { "bearings": ["b1"] },
      "errors": { "play": "arm.play_shoulder", "twist": "arm.twist_shoulder" }, "home": { "endstop": "es1.lever", "direction": -1 } },
    { "id": "spindle_on", "type": "fixed", "parent": "output.flange", "child": "spindle.down" },
    { "id": "upper_on", "type": "fixed", "parent": "spindle.seat", "child": "upper.hub" },
    { "id": "m2_on", "type": "fixed", "parent": "upper.motor", "child": "m2.face" },
    { "id": "edrive", "type": "revolute", "parent": "upper.elbow", "child": "esun.axis", "min": -5900, "max": 180, "label": "Elbow motor" },
    { "id": "ering_on", "type": "fixed", "parent": "upper.elbow", "child": "ering.axis" },
    { "id": "eturn", "type": "revolute", "parent": "upper.elbow", "child": "ecarrier.axis", "min": -5900, "max": 180 },
    { "id": "es1a", "type": "revolute", "parent": "ecarrier.a", "child": "ep1.axis", "min": -30000, "max": 30000 },
    { "id": "es2a", "type": "revolute", "parent": "ecarrier.b", "child": "ep2.axis", "min": -30000, "max": 30000 },
    { "id": "es3a", "type": "revolute", "parent": "ecarrier.c", "child": "ep3.axis", "min": -30000, "max": 30000 },
    { "id": "elbow", "type": "revolute", "parent": "upper.output", "child": "eoutput.axis", "min": 0, "max": 160, "label": "Elbow", "support": { "clips": ["clip1", "clip2", "clip3"], "pitch": 74 },
      "errors": { "play": "arm.play_elbow", "twist": "arm.twist_elbow" }, "home": { "endstop": "es2.lever", "direction": 1 } },
    { "id": "c1_on", "type": "fixed", "parent": "upper.clip1", "child": "clip1.post" },
    { "id": "c2_on", "type": "fixed", "parent": "upper.clip2", "child": "clip2.post" },
    { "id": "c3_on", "type": "fixed", "parent": "upper.clip3", "child": "clip3.post" },
    { "id": "forearm_on", "type": "fixed", "parent": "eoutput.flange", "child": "forearm.hub" },
    { "id": "holder_on", "type": "fixed", "parent": "forearm.holder", "child": "holder.mount" },
    { "id": "servo_on", "type": "fixed", "parent": "holder.servo", "child": "servo.face" },
    { "id": "lift_servo", "type": "revolute", "parent": "holder.horn", "child": "horn.axis", "min": 0, "max": 20, "label": "Pen lift" },
    { "id": "lift", "type": "prismatic", "parent": "holder.pen", "child": "pen.tip", "min": 0, "max": 5, "follow": "lift_servo", "ratio": 0.25 },
    { "id": "es1_on", "type": "fixed", "parent": "base.switch", "child": "es1.left" },
    { "id": "es2_on", "type": "fixed", "parent": "upper.switch", "child": "es2.left" }
  ],
  "planetary": [
    { "sun": "sun", "carrier": "carrier", "ring": "housing", "planets": ["p1", "p2", "p3"], "drive": "sun", "module": 1, "teeth": [18, 18, 54], "output": { "ring": "output", "planet": 21, "teeth": 57 } },
    { "sun": "esun", "carrier": "ecarrier", "ring": "ering", "planets": ["ep1", "ep2", "ep3"], "drive": "sun", "module": 1, "teeth": [18, 18, 54], "output": { "ring": "eoutput", "planet": 21, "teeth": 57 } }
  ],
  "fits": [
    { "a": "m1", "b": "housing", "fastens": true, "min": -0.1, "note": "The shoulder motor, on its four screws, its boss seated in the plate's pocket" },
    { "a": "m1", "b": "sun", "shaft": true, "note": "The shaft in the sun" },
    { "a": "m2", "b": "esun", "shaft": true, "note": "The elbow motor's shaft in its sun" },
    { "a": "m2", "b": "upper", "fastens": true, "min": -0.1, "note": "The elbow motor, on its four screws, its boss seated in the plate's pocket" },
    { "a": "housing", "b": "base", "fastens": true, "min": 0, "note": "The housing, on the base's three columns" },
    { "a": "bridge", "b": "housing", "fastens": true, "min": 0, "note": "The bridge, on the housing's posts" },
    { "a": "b1", "b": "bridge", "seat": "press", "note": "The 6800 in its seat" },
    { "a": "es1", "b": "base", "fastens": true, "min": -0.1, "note": "The home switch on its post, 0.1 mm of resting contact allowed" },
    { "a": "es2", "b": "upper", "fastens": true, "min": -0.1, "note": "The elbow's home switch on its post" },
    { "a": "es1", "b": "upper", "min": -30, "note": "The arm's flag on the home switch's lever at the end of the range" },
    { "a": "es2", "b": "forearm", "min": -30, "note": "The forearm's flag on the elbow switch's lever" },
    { "a": "horn", "b": "holder", "min": -30, "note": "The horn lifts the shuttle's lug: drawn at rest, the lug doesn't rise here" },
    { "a": "ecarrier", "b": "ering", "min": -1, "note": "Two specks: neither is printed" },
    { "a": "d1", "b": "shield", "fastens": true, "min": -20, "note": "Plugged in" },
    { "a": "d2", "b": "shield", "fastens": true, "min": -20, "note": "Plugged in" }
  ],
  "wires": [
    { "id": "shoulder", "from": "m1.connector", "to": "shield.X", "via": ["base.cable"], "gauge": "awg24", "colour": "black, red, green, blue", "connectors": ["JST-XH 4 pin", "screw terminal"], "note": "From the motor's own lead, down through the base" },
    { "id": "elbow", "from": "m2.connector", "to": "shield.Y", "via": ["upper.cable", "base.cable"], "gauge": "awg24", "colour": "black, red, green, blue", "connectors": ["JST-XH 4 pin", "screw terminal"] },
    { "id": "pen", "from": "servo.connector", "to": "shield.Z", "via": ["forearm.cable", "upper.cable", "base.cable"], "gauge": "awg26", "colour": "brown, red, orange", "conductors": 3, "current": 0.7, "connectors": ["Servo JR 3 pin", "D11, 5 V, GND"], "note": "D11 is the Z limit pin on a V3.00 shield: arm.ino uses it for the servo" },
    { "id": "home1", "from": "es1.left", "to": "shield.X", "via": ["base.cable"], "gauge": "awg26", "colour": "white, black", "conductors": 2, "connectors": ["Crimped spade", "X limit and GND"] },
    { "id": "home2", "from": "es2.left", "to": "shield.Y", "via": ["upper.cable", "base.cable"], "gauge": "awg26", "colour": "white, black", "conductors": 2, "connectors": ["Crimped spade", "Y limit and GND"] },
    { "id": "power", "from": "psu.terminals", "to": "shield.top", "gauge": "awg22", "colour": "red, black", "conductors": 2, "current": 2, "connectors": ["Ring terminal", "Screw terminal"], "note": "24 V into the shield's motor terminals" }
  ],
  "loads": [
    { "joint": "out", "torque": "arm.shoulder_torque", "note": "The pen's drag at its reach, the arm's inertia at 500 mm/s², the bias" },
    { "joint": "elbow", "torque": "arm.elbow_torque", "note": "The pen's drag, the forearm's inertia, the bias" }
  ],
  "task": { "tool": "holder.tool", "sheet": { "size": "a5", "landscape": true, "at": ["arm.near + arm.sheet_h / 2", 0, 0], "u": [0, 1, 0] }, "speed": 50, "accuracy": 0.3, "accel": 500, "elbow": "left", "deflection": "arm.deflection", "pen": { "up": 20, "down": 0 } },
  "poses": { "rest": { "drive": -1530, "edrive": -4586, "lift_servo": 0 } }
}
```

Why each driver is set where it is: both motors run at 0.5 A a coil, under the 17HS4401's 1.5 A and the NEMA 14's
0.8 A, and the number comes from what they must do rather than what they can. The shoulder needs 0.011 N m at the motor's
shaft for the task (0.2 N m through 38:1 at 47%) and has about 0.09 N m at 0.5 A, turning, eight times over. More current
would only heat the motor and the PLA it is bolted to. It also sets the worst the arm can do to itself: stalled against
something, 0.5 A puts about 2.4 N m on the shoulder's output, and that is 12 MPa of shear in the spindle's printed 10 mm
shaft, against PLA's 22, about twice over (at the current the shoulder could take, the shaft would break first). A
DRV8825 runs 0.5 A with no heat sink. Set each trimmer to what `cad check` says for these 0.1 Ω sense resistors (0.25 V):
read the resistors on your own board first, because clones differ.

```xml projects/arm/drawings/test.svg
<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="148mm" viewBox="0 0 210 148"><rect id="square" x="55" y="24" width="100" height="100" fill="none"/><circle id="circle" cx="105" cy="74" r="35" fill="none"/></svg>
```

```sh
npx cad check arm/arm --json
npx cad list arm/arm
npx cad wires arm/arm
npx cad machine arm/arm
npx cad plot arm/arm projects/arm/drawings/test.svg
npx cad plot arm/arm --calibrate
npx cad preview arm/arm
```

The check runs with `--json` here because the arm's budget rests on estimates, and those are warnings the test would stop at: run
it without `--json` and read them. What it says:

- `task.reach` passes: `holder.tool` reaches the whole sheet with the elbow to the left, 25 mm to spare at the worst point, the
  shoulder between -11° and 101° and the elbow between 58° and 157°.
- `task.speed` passes, just: 51.3 mm/s at the slowest point, the middle of the near edge, against the 50 asked for. The
  motors are at 300 rpm, 8000 steps a second at 1/8 step, which is about what the Uno's firmware streams; any faster and
  the speed has to give, not the microsteps.
- `task.accuracy` warns, as it should: 0.244 mm worst case, 0.11 root-sum-square, at the far corner, against 0.3, with the
  shoulder's play the biggest single term. Those figures are the bench's to replace, and the sentence says so: `Rests on estimates`.
  The worst case is 81% of the budget, under the 100% where the check would fail, over the 80% where it stops saying pass.
  Bench test 14 (play) and 17 (repeatability) decide whether this arm draws to 0.3 mm or to 0.5.
- The rules that are guesses are named in one warning line, `uses estimates, not measurements`, and each settles with `cad measured arm/arm <name>=<value>`.
- `joint.moment` puts 83 N equivalent on the 6800, against its 925 N static rating, eleven times over; `fit.seat` says the
  pocket is drawn 19.038 mm, a press fit, with a 1.11 mm lip on the outer race and clear of the inner.
- `m1 into out` gives 25 times the 0.2 N m the task asks at the shoulder (that figure is at rated current: at the 0.5 A chosen, about 8 times),
  `m2 into elbow` 28 times. Both joints hold with the power off: 38:1 at 47% can't be driven backwards.
- `motor.driver` gives 0.25 V on each trimmer for 0.5 A. `power.supply`: the machine draws under 1 A at 24 V, and an
  LRS-50-24 gives 2.2 A.
- `cad list` is the shopping list: 440 g of printing in 20 parts, about 8 hours, and everything bought. `cad wires` is the
  wiring sheet: each wire's length through the arm's whole range, its gauge, its colours and its board pins.
- `cad machine` writes `exports/arm/arm.machine.json`: steps per degree, 168.9 at 1/8 step through 38:1, the rates and the
  homing. `cad plot` plans the test drawing, a 100 mm square and a circle, in 15 s, and the preview in `.preview/arm/`
  animates it. `cad plot --calibrate` writes the calibration drawing the same way.

Home the arm with the elbow open: homing swings the shoulder to its stop with the elbow wherever it was, and with the
elbow folded the holder comes round to the base's switch post. `npx cad check arm/arm --sweep` moves each joint alone across its range and finds nothing colliding (the switches' flags and the horn's lug
touch where they are meant to, and say so in `fits`). It takes about a quarter of an hour, so run it yourself: the replay here leaves it out.

What the chapter leaves to the bench is written down in `examples/bench/projects/benchmarks/MEASURE.md`: the play, the
twist and the repeatability; the pen's drag, and whether the rubber bands bias the arm enough to take up the gears' backlash.
Print the shoulder's coupon before the whole arm, then measure, then `cad measured`, then read the budget again.

