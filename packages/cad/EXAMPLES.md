# Worked examples: from parts to a mechanism

[The tutorial](TUTORIAL.md) ends with a wall hook checked against its screw. These examples carry on from there, one
for each thing the [README](README.md) describes after that: parts, variants and releases, joints and poses, a model
from elsewhere, an optimised part, a board, a mechanism printed flat, gears, and a gearbox. Each is a few files and the commands to run
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
  "anchors": {
    "axle": { "at": [0, "centre", "thick"], "axis": [0, 0, 1] },
    "track": { "at": ["0 - length / 2", 0, "thick"], "axis": [1, 0, 0] }
  },
  "variables": {
    "centre": { "value": 7.2, "unit": "mm", "rule": "The pinion's axle above the rack's pitch line: its pitch radius and its shift, m z / 2 + x m" },
    "length": { "value": 140, "unit": "mm", "rule": "Room for the rack's whole travel" },
    "wide": { "value": 40, "unit": "mm", "rule": "Under the rack and the knob" },
    "thick": { "value": "x1c.layer * 15", "unit": "mm", "rule": "Fifteen layers" }
  }
}
```

```js projects/home/objects/rail.js
// The base: a plate under the rack's travel and the knob, the axle above the rack.
import jscad from '@jscad/modeling'

export function main (v) {
  return jscad.primitives.cuboid({ size: [v.length, v.wide, v.thick], center: [0, v.wide / 4, v.thick / 2] })
}
```

The assembly: the knob turns on the base's axle, and the rack slides along its track. The slide's joint doesn't say
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
  "poses": { "home": { "knob": 0 }, "out": { "knob": 150 } }
}
```

```sh
npx cad check home/slider
npx cad check home/slider --sweep --steps 12
```

The check says `knob drives slide: 43.98 mm of rack a turn`, the contact ratio, and that the axle is where the gears
need it (`centre distance 7.2 mm, as they need`). Set the base's `centre` to 7 and it fails: the teeth would jam. The
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
planets, and the carrier with the planets' pins and the crank.

```json projects/home/objects/winder-case.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "winder-case",
  "title": "Winder case",
  "version": "0.1.0",
  "uses": ["x1c"],
  "engine": "manifold",
  "variables": {
    "radius": { "value": 34, "unit": "mm", "rule": "Round the ring's rim (62.5 mm across)" },
    "t": { "value": "x1c.layer * 15", "unit": "mm", "rule": "Base, fifteen layers" },
    "pin": { "value": 3, "unit": "mm", "rule": "The sun's axle" },
    "pin_height": { "value": 24, "unit": "mm", "rule": "Up through the sun and its shaft" }
  }
}
```

```js projects/home/objects/winder-case.js
// The case: a base with the sun's axle standing in the middle. The ring sits on it.
import jscad from '@jscad/modeling'
const { cylinder } = jscad.primitives

export function main (v) {
  return v.ops.union(cylinder({ radius: v.radius, height: v.t, center: [0, 0, v.t / 2] }),
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
  "variables": {
    "module": { "value": 1, "unit": "mm", "rule": "3.6 lines across a tooth on the X1C" },
    "teeth": { "value": 54, "rule": "The sun and two planets across: 18 + 2 × 18" },
    "width": { "value": "x1c.layer * 40", "unit": "mm", "rule": "Face width, forty layers" }
  }
}
```

```js projects/home/objects/winder-ring.js
export function main (v) {
  return v.gears.internal({ module: v.module, teeth: v.teeth, width: v.width })
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
    "width": { "value": "x1c.layer * 40", "unit": "mm", "rule": "As the ring" },
    "bore": { "value": "3 + x1c.line / 2", "unit": "mm", "rule": "A 3 mm pin and half a line's clearance" }
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
    "width": { "value": "x1c.layer * 40", "unit": "mm", "rule": "As the ring" },
    "bore": { "value": "3 + x1c.line / 2", "unit": "mm", "rule": "On the case's 3 mm axle" },
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

The carrier: a disc over the gears, inside the ring's tips, with a pin down into each planet and the crank on top. Its
anchors are where the planets turn, every 120° at the sun-to-planet distance (m (S + P) / 2 = 18 mm).

```json projects/home/objects/winder-carrier.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "winder-carrier",
  "title": "Winder carrier and crank",
  "version": "0.1.0",
  "uses": ["x1c"],
  "engine": "manifold",
  "anchors": {
    "axis": { "at": [0, 0, 0], "axis": [0, 0, 1] },
    "p0": { "at": ["a", 0, "0 - drop"], "axis": [0, 0, 1] },
    "p1": { "at": ["0 - a / 2", "a * 0.8660254", "0 - drop"], "axis": [0, 0, 1] },
    "p2": { "at": ["0 - a / 2", "0 - a * 0.8660254", "0 - drop"], "axis": [0, 0, 1] }
  },
  "variables": {
    "a": { "value": 18, "unit": "mm", "rule": "Sun to planet: m (S + P) / 2" },
    "drop": { "value": "8 + x1c.layer * 2", "unit": "mm", "rule": "A planet's width and two layers' gap above it" },
    "radius": { "value": 25, "unit": "mm", "rule": "Inside the ring's tips (26 mm)" },
    "t": { "value": "x1c.layer * 15", "unit": "mm", "rule": "Fifteen layers" },
    "hole": { "value": 9, "unit": "mm", "rule": "Round the sun's 8 mm shaft" },
    "pin": { "value": 3, "unit": "mm", "rule": "The planets' axles" },
    "arm": { "value": 45, "unit": "mm", "rule": "The crank's reach" },
    "bar": { "value": 10, "unit": "mm", "rule": "The crank arm's width" },
    "handle": { "value": 20, "unit": "mm", "rule": "The handle's height" },
    "grip": { "value": 8, "unit": "mm", "rule": "The handle's diameter" }
  }
}
```

```js projects/home/objects/winder-carrier.js
import jscad from '@jscad/modeling'
const { cylinder, cuboid } = jscad.primitives

export function main (v) {
  const disc = cylinder({ radius: v.radius, height: v.t, center: [0, 0, v.t / 2] })
  const arm = cuboid({ size: [v.arm, v.bar, v.t], center: [v.arm / 2, 0, v.t + v.t / 2] })
  const handle = cylinder({ radius: v.grip / 2, height: v.handle, center: [v.arm - v.grip / 2, 0, v.t * 2 + v.handle / 2] })
  const third = (2 * Math.PI) / 3
  const pins = [0, 1, 2].map((k) => cylinder({ radius: v.pin / 2, height: v.drop, center: [v.a * Math.cos(k * third), v.a * Math.sin(k * third), 0 - v.drop / 2] }))
  const hole = cylinder({ radius: v.hole / 2, height: v.t * 2, center: [0, 0, v.t] })
  return v.ops.subtract(v.ops.union(disc, arm, handle, ...pins), hole)
}
```

The assembly holds the ring in the case and turns the carrier on the crank; the `planetary` turns the sun and the
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
    { "id": "p0", "object": "winder-gear" },
    { "id": "p1", "object": "winder-gear" },
    { "id": "p2", "object": "winder-gear" }
  ],
  "joints": [
    { "id": "sun", "type": "revolute", "parent": { "item": "case", "at": [0, 0, "case.t + 0.4"], "axis": [0, 0, 1] }, "child": "sun.axis", "min": -3000, "max": 3000 },
    { "id": "crank", "type": "revolute", "parent": { "item": "case", "at": [0, 0, "case.t + 0.8 + ring.width"], "axis": [0, 0, 1] }, "child": "carrier.axis", "min": -180, "max": 180, "label": "Crank" },
    { "id": "p0", "type": "revolute", "parent": "carrier.p0", "child": "p0.axis", "min": -3000, "max": 3000 },
    { "id": "p1", "type": "revolute", "parent": "carrier.p1", "child": "p1.axis", "min": -3000, "max": 3000 },
    { "id": "p2", "type": "revolute", "parent": "carrier.p2", "child": "p2.axis", "min": -3000, "max": 3000 }
  ],
  "planetary": [
    { "sun": "sun", "carrier": "carrier", "ring": "ring", "planets": ["p0", "p1", "p2"], "drive": "carrier",
      "module": "ring.module", "teeth": ["sun.teeth", "p0.teeth", "ring.teeth"] }
  ],
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
