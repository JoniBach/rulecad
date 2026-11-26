# Worked examples: from parts to a mechanism

[The tutorial](TUTORIAL.md) ends with a wall hook checked against its screw. These examples carry on from there, one
for each thing the [README](README.md) describes after that: parts, variants and releases, joints and poses, a model
from elsewhere, an optimised part, a board, a mechanism printed flat, gears, a gearbox, a motor, a robot joint, a machine sized from its task, a bracket screwed on, a frame of beams with a moving axis, and a case of printed beams as a kit. Each is a few files and the commands to run
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
checks run the fab's design rules. Then a printed case for it, which reads the board's size and holes, and the board
screwed into it.

```json projects/home/objects/pad.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "pad",
  "title": "Four-key pad",
  "version": "0.1.0",
  "engine": "pcb",
  "role": "board",
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
    "mount_holes": { "value": 1, "rule": "A mounting hole in each corner: the recipe names each by its screw's thread, below" },
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

`"role": "board"` says the fab makes it: it is not printed, and a list leaves it out of the plastic.

```sh
npx cad check home/pad
npx cad export home/pad
```

The board's mounting holes are named by their screws' thread. The keyboard recipe draws one in each corner with
`v.pcb.mount('M2', x, y)`, which sizes it from the thread's rule set: `m2.clearance`, 2.4 mm (ISO 273's normal
clearance hole), as the fab drills it, with nothing added for a printer. A board drawn by hand names its own the same
way, in its `holes`: `v.pcb.mount('M2', 10, 5)`, or `v.pcb.mount('M2', 10, 5, { fit: 'close' })` for the close hole.

### The case

A case reads the board rather than copying its numbers: `"uses": ["home/pad"]`, then `v.pad.board_w` and
`v.pad.board_holes` are the board's own. The board stands on four bosses, one under each of its holes, each with a
heat-set insert's hole in its top: `v.fixings.insertBoss('M2', ...)` sizes the hole, its depth and the least wall from
the insert's rules, and draws the column with its foot flared. A boss is as tall as the room the board needs under it,
so each is the board's standoff too.

```json projects/home/objects/case.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "case",
  "title": "Four-key pad case",
  "version": "0.1.0",
  "uses": ["x1c", "home/pad"],
  "material": "PLA",
  "orientation": "Upright, its floor on the bed, open at the top: the board drops in from above",
  "variables": {
    "floor": { "value": "x1c.layer * 10", "unit": "mm", "rule": "The floor: whole layers, stiff under a hand on the keys" },
    "wall": { "value": "x1c.line * 5", "unit": "mm", "rule": "The walls: five lines" },
    "gap": { "value": "x1c.fit * 2", "unit": "mm", "rule": "Round the board inside the walls, so it drops in" },
    "stand": { "value": "x1c.layer * 25", "unit": "mm", "rule": "Under the board: room for the switches' pins and the diodes on its back, and deeper than the inserts' holes" },
    "round": { "value": 1, "unit": "mm", "rule": "The inside corners, rounded: tight enough to clear the board's square corners by the gap" },
    "chamfer": { "value": "x1c.chamfer * 2", "unit": "mm", "rule": "A 45° chamfer where the walls meet the floor, so no inside corner is square" }
  }
}
```

```js projects/home/objects/case.js
// A tray for the four-key pad: walls round the board, and a heat-set insert's boss under each of its mounting holes,
// for the board to stand on. The case reads the board (its size, where it is, its holes); the bosses come from
// v.fixings, named by the board's M2 screws.
import jscad from '@jscad/modeling'
const { roundedRectangle } = jscad.primitives
const { extrudeLinear } = jscad.extrusions
const { translate } = jscad.transforms
const { hull } = jscad.hulls

export function main (v) {
  const b = v.pad, f = v.fixings, top = v.floor + v.stand + b.thickness, c = v.chamfer
  const w = b.board_w + 2 * v.gap, d = b.board_d + 2 * v.gap
  const plan = (x, y, r) => roundedRectangle({ size: [x, y], roundRadius: r, center: [b.board_x, b.board_y] })
  const shell = extrudeLinear({ height: top }, plan(w + 2 * v.wall, d + 2 * v.wall, v.round + v.wall))
  const inside = v.ops.union(
    hull(translate([0, 0, v.floor], extrudeLinear({ height: c }, plan(w - 2 * c, d - 2 * c, v.round - c))),
      translate([0, 0, v.floor + c], extrudeLinear({ height: c }, plan(w, d, v.round)))),
    translate([0, 0, v.floor + c], extrudeLinear({ height: top }, plan(w, d, v.round))))
  // a boss under each hole, wide enough to join the wall beside it
  const bosses = b.board_holes.map((h) => {
    const edge = Math.min(b.board_w / 2 - Math.abs(h.x - b.board_x), b.board_d / 2 - Math.abs(h.y - b.board_y))
    return f.insertBoss('M2', { height: v.stand, outer: 2 * (edge + v.gap + v.wall / 2), at: [h.x, h.y, v.floor] })
  })
  return v.ops.subtract(v.ops.union(v.ops.subtract(shell, inside), ...bosses.map((x) => x.boss)), ...bosses.map((x) => x.hole))
}
```

Each boss is 7.9 mm across round a 3.2 mm hole 4 mm deep (`m2.insert_hole` and `m2.insert_depth`), with 2.35 mm of
wall where `m2.insert_wall` asks 1.3 mm, and joins the wall beside it. The case prints upright with no supports.

### Screwed in

The board sits on the bosses, and one `fasten` holds it: M2 cap screws down the board's own holes (`"holes":
"pad.board"`) into the case. The check finds the four holes in the board, follows each screw's axis into its boss, and
chooses the length. Chapter 15 explains `fasten` in full: every finding it makes, nuts, countersunk heads, and the
order the screws go in.

```json projects/home/assemblies/padcase.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/assembly.schema.json",
  "title": "The four-key pad in its case",
  "kind": "fit",
  "items": [
    { "id": "case", "object": "case" },
    { "id": "pad", "object": "pad", "at": [0, 0, "case.floor + case.stand"] }
  ],
  "fits": [
    { "a": "pad", "b": "case", "min": 0, "max": 0.05, "note": "The board stands on the bosses" }
  ],
  "fasten": [
    { "screw": "M2 cap", "through": ["pad"], "into": "case", "holes": "pad.board", "note": "The board's screws" }
  ]
}
```

```sh
npx cad check home/case
npx cad check home/padcase
npx cad list home/padcase
```

The check says the board's holes measure 2.4 mm, an M2 clearance hole; each screw ends in an insert's hole, 3.2 mm
and 4 mm deep; M2x4 cap is the shortest sold that fits, 1.6 mm under its head and 2.4 mm into the insert; the head
sits flat on the board; and a 1.5 mm hex key reaches each one. `cad list` counts four M2x4 cap screws and four M2
inserts, with the case's 18.3 g of plastic.

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
    "bore": { "value": 3.2, "unit": "mm", "rule": "The bore, turning on the base's printed axle: the base sizes its pin from it (rail.pin)" },
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
    "snap_length": { "value": 4, "unit": "mm", "rule": "Up the ring's 6 mm rim, to the 2 mm step at its top the barb clicks over" },
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
    "barb": { "value": 1.6, "unit": "mm", "rule": "The radius of the step the barb sits in: the barb, and room round it" },
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
through it, so its body needs room below: two feet stand the rail up. An M3 cap screw down through the rail holds
each foot, cutting its own thread in a pilot in the foot's top. Both holes come from `v.fixings`, named by the thread:
the rail's is an M3 clearance hole, the foot's an M3 pilot, each the printer's own figure.

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
    "track": { "at": ["start", 0, "thick"], "axis": [1, 0, 0] },
    "f1": { "at": ["0 - foot_x", "foot_y", "thick"], "axis": [0, 0, 1] },
    "f2": { "at": ["foot_x", "foot_y", "thick"], "axis": [0, 0, 1] }
  },
  "variables": {
    "centre": { "value": 7.2, "unit": "mm", "rule": "The pinion's axis above the rack's pitch line: m z / 2 + x m" },
    "length": { "value": 120, "unit": "mm", "rule": "The rack and its travel" },
    "start": { "value": -37.7, "unit": "mm", "rule": "The rack's middle under the pinion at rest" },
    "thick": { "value": "x1c.layer * 23", "unit": "mm", "rule": "23 layers: the motor's boss pocket, and plate enough for its screws" },
    "y0": { "value": -14.5, "unit": "mm", "rule": "Past the motor's near ear" },
    "y1": { "value": 29, "unit": "mm", "rule": "Past its far ear, 17.5 mm off the axis" },
    "plate": { "value": 26, "unit": "mm", "rule": "Wide enough round the motor's boss and its ears" },
    "guide_y": { "value": "0 - 5.45 - x1c.line / 2", "unit": "mm", "rule": "Behind the rack's back, half a line clear" },
    "guide": { "value": "x1c.line * 4", "unit": "mm", "rule": "The guide wall: four lines" },
    "guide_height": { "value": "x1c.layer * 20", "unit": "mm", "rule": "Most of the rack's width" },
    "foot_x": { "value": 52, "unit": "mm", "rule": "Each foot's screw, from the middle" },
    "foot_y": { "value": -11, "unit": "mm", "rule": "On the strip, behind the guide" }
  }
}
```

```js projects/home/objects/drive-rail.js
// The rail: a strip under the rack, a plate for the motor (turned 90° on its shaft, so its ears clear the rack), a wall
// behind the rack, and the motor's own cuts. Each foot's screw passes an M3 clearance hole from v.fixings.
import jscad from '@jscad/modeling'
const { cuboid, cylinder } = jscad.primitives
const { translate, rotateZ } = jscad.transforms

export function main (v) {
  const motor = v.motors.motorModel('28byj48'), hole = v.fixings.holeModel('M3').diameter
  const strip = cuboid({ size: [v.length, 12, v.thick], center: [0, v.y0 + 6, v.thick / 2] })
  const seat = cuboid({ size: [v.plate, v.y1 - v.y0, v.thick], center: [8, (v.y0 + v.y1) / 2, v.thick / 2] })
  const guide = cuboid({ size: [v.length, v.guide, v.guide_height], center: [0, v.guide_y - v.guide / 2, v.thick + v.guide_height / 2] })
  const cuts = translate([0, v.centre, 0], rotateZ(Math.PI / 2, v.motors.mount(motor, { plate: v.thick, screw: 'M3' }, v.ops)))
  const screws = [1, -1].map((s) => cylinder({ radius: hole / 2, height: v.thick + 2, center: [s * v.foot_x, v.foot_y, v.thick / 2] }))
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
    "depth": { "value": 12, "unit": "mm", "rule": "The pilot's depth: more than the screw down through the rail needs, so the check chooses its length" }
  }
}
```

```js projects/home/objects/drive-foot.js
// A foot: a block under each end of the rail, screwed on from above by an M3 cap screw through the rail, which cuts
// its own thread in the M3 pilot from v.fixings.
import jscad from '@jscad/modeling'
const { cuboid, cylinder } = jscad.primitives
const { subtract } = jscad.booleans

export function main (v) {
  const pilot = v.fixings.holeModel('M3', { kind: 'pilot' }).diameter
  const block = cuboid({ size: [v.size, v.long, v.height], center: [0, 0, v.height / 2] })
  return subtract(block, cylinder({ radius: pilot / 2, height: v.depth, center: [0, 0, v.height - v.depth / 2] }))
}
```

The assembly says the motor drives the pinion's joint, the slide follows by its `mesh`, and the load is a force on the
slide: a 200 g camera on a rail with the friction of plastic on plastic, about 1 N. The `shaft` fit reads the bore from
the pinion as drawn. `duty` says the motor runs a fifth of the time, since a focus stack is mostly standing still.
Each foot's screw is a `fasten`, as the pad's in chapter 6: the screw named by thread and head with no length, the
part it passes through, the part it ends in and the anchor on its axis. The check follows the screw through the parts
as drawn and chooses its length, and `cad list` counts it; chapter 15 explains `fasten` in full.

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
    { "a": "foot_a", "b": "rail", "min": 0, "note": "A foot, under the rail" },
    { "a": "foot_b", "b": "rail", "min": 0, "note": "A foot, under the rail" },
    { "a": "drive", "b": "rail", "fastens": true, "min": 0, "note": "The motor, on its two ears" },
    { "a": "drive", "b": "gear", "shaft": true, "note": "The motor's shaft in the pinion" }
  ],
  "fasten": [
    { "screw": "M3 cap", "through": ["rail"], "into": "foot_a", "at": ["rail.f1"], "note": "A foot, screwed on from above" },
    { "screw": "M3 cap", "through": ["rail"], "into": "foot_b", "at": ["rail.f2"], "note": "A foot, screwed on from above" }
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
`motor.mount` bends the rail under the motor by FE, held where its feet are screwed on: the shaft's tip moves a few
thousandths of a millimetre against the pinion's seat on the rail, far inside the 0.2 mm the pinion is drawn with. A NEMA 17 hung from a 2 mm PLA plate would
fail the same check, and say how thick the plate would need to be. Each foot's `fasten` passes: an M3x10 cap, the
shortest sold that fits, 5.4 mm into the foot's 2.9 mm pilot against the 5 mm `m3.pilot_depth` asks, its head flat on
the rail and a 2.5 mm hex key clear above it. `npx cad list home/driven` lists the two, beside the motor's own two M3x8.

### The spool winder, driven

The winder from chapter 9 with an N20 gear motor where the crank was, so it winds at a steady speed. The motor turns
the sun now, and the slow part is the carrier: four turns of the motor's shaft for one of the spool's. So the spool
moves onto the carrier. What changes:

- The case loses its axle pin. The motor hangs under the hub on its two M1.6 screws, and three ears reach out past the
  ring for feet tall enough to stand it over the motor. An M3 cap screw down through each ear holds its foot, in an
  M3 pilot in the foot's top, as the slider's feet are held.
- The sun takes the motor's D-shaft with `v.motors.bore`, and keeps its 8 mm shaft, which the spool now turns on.
- The carrier and the spool are one part, printed upside down: the outer cheek on the bed, the drum, a 45° cone out
  to the carrier's plate (the spool's inner cheek, printed without supports), and the planets' pins on top. The drum
  is hollow, open on the bed, under a roof that closes in at 45°.
- The handle goes. The ring and the planets are the hand winder's.

The N20's figures are Pololu's, for its 100:1 gearbox. Unbranded N20s look the same and vary widely: treat a cheap
one's torque as about half until it has been measured.

```json projects/home/objects/winder-base.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "winder-base",
  "title": "Winder base for an N20",
  "version": "0.1.0",
  "uses": ["x1c"],
  "engine": "manifold",
  "anchors": {
    "e1": { "at": [0, "ear_at", "t"], "axis": [0, 0, 1] },
    "e2": { "at": ["0 - ear_at * 0.8660254", "0 - ear_at / 2", "t"], "axis": [0, 0, 1] },
    "e3": { "at": ["ear_at * 0.8660254", "0 - ear_at / 2", "t"], "axis": [0, 0, 1] }
  },
  "variables": {
    "radius": { "value": 33, "unit": "mm", "rule": "The ring's rim: as the hand winder's case" },
    "rim": { "value": "x1c.line * 14", "unit": "mm", "rule": "The rim under the ring's, wide enough for its push pins" },
    "snap": { "value": 2, "unit": "mm", "rule": "Two push pins hold the ring still: their shafts" },
    "snap_lip": { "value": 0.3, "unit": "mm", "rule": "The barb's lip, clicking over the floor of the ring's counterbore" },
    "snap_back": { "value": 90, "unit": "deg", "rule": "A square back: it holds for good" },
    "snap_at": { "value": 30.6, "unit": "mm", "rule": "Halfway across the ring's rim, between its roots and its outside" },
    "snap_length": { "value": 4, "unit": "mm", "rule": "Up the ring's 6 mm rim, to the 2 mm step at its top the barb clicks over" },
    "flange": { "value": 2, "unit": "mm", "rule": "A push pin's foot flange, buried in the rim" },
    "hub": { "value": 14, "unit": "mm", "rule": "Round the N20's face: its two M1.6 holes 9 mm apart, with a wall outside them" },
    "spoke": { "value": "x1c.line * 12", "unit": "mm", "rule": "Three spokes from the hub to the rim" },
    "spokes": { "value": 3, "rule": "Three: it stands without rocking" },
    "t": { "value": "x1c.layer * 15", "unit": "mm", "rule": "Base, fifteen layers" },
    "ear_at": { "value": 38, "unit": "mm", "rule": "A foot's screw, outside the ring (33 mm) by a screw head's radius and a little" },
    "ear": { "value": 10, "unit": "mm", "rule": "An ear's width, round its screw" }
  }
}
```

```js projects/home/objects/winder-base.js
// The hand winder's case with the motor under it: the axle pin goes, the hub takes the N20's face and screws, and three
// ears reach out past the ring, a quarter turn round from the spokes, for the feet that stand it over the motor. Each
// ear has an M3 clearance hole from v.fixings for its foot's screw.
import jscad from '@jscad/modeling'
const { cylinder, cuboid } = jscad.primitives
const { rotateZ, translate } = jscad.transforms

export function main (v) {
  const motor = v.motors.motorModel('n20'), hole = v.fixings.holeModel('M3').diameter
  const rim = v.ops.subtract(cylinder({ radius: v.radius, height: v.t, center: [0, 0, v.t / 2] }), cylinder({ radius: v.radius - v.rim, height: v.t, center: [0, 0, v.t / 2] }))
  const turn = (k) => (2 * Math.PI * k) / v.spokes
  const spokes = Array.from({ length: v.spokes }, (_, k) => rotateZ(turn(k), cuboid({ size: [v.radius - v.rim / 2, v.spoke, v.t], center: [(v.radius - v.rim / 2) / 2, 0, v.t / 2] })))
  const ears = Array.from({ length: v.spokes }, (_, k) => rotateZ(turn(k) + Math.PI / 2, v.ops.union(
    cuboid({ size: [v.ear_at - v.radius + v.rim, v.ear, v.t], center: [(v.ear_at + v.radius - v.rim) / 2, 0, v.t / 2] }),
    cylinder({ radius: v.ear / 2, height: v.t, center: [v.ear_at, 0, v.t / 2] }))))
  const holes = Array.from({ length: v.spokes }, (_, k) => rotateZ(turn(k) + Math.PI / 2, cylinder({ radius: hole / 2, height: v.t * 2, center: [v.ear_at, 0, v.t / 2] })))
  const snaps = [0, Math.PI].map((a) => translate([v.snap_at * Math.cos(a), v.snap_at * Math.sin(a), v.t - v.flange], v.flexures.snapPin({ diameter: v.snap, length: v.snap_length, lip: v.snap_lip, back: v.snap_back }, v.ops)))
  const body = v.ops.union(rim, cylinder({ radius: v.hub / 2, height: v.t, center: [0, 0, v.t / 2] }), ...spokes, ...ears, ...snaps)
  return v.ops.subtract(body, v.motors.mount(motor, { plate: v.t, screw: 'M1.6' }, v.ops), ...holes)
}
```

```json projects/home/objects/winder-foot.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "winder-foot",
  "title": "Winder foot",
  "version": "0.1.0",
  "uses": ["x1c"],
  "variables": {
    "height": { "value": 32, "unit": "mm", "rule": "Under the motor: its 25 mm, its terminals, and room for the wires to bend" },
    "size": { "value": 10, "unit": "mm", "rule": "As wide as the base's ear" },
    "depth": { "value": 12, "unit": "mm", "rule": "The pilot's depth: more than the screw down through the 3 mm ear needs, so the check chooses its length" }
  }
}
```

```js projects/home/objects/winder-foot.js
// A foot under each of the base's ears, screwed on from above by an M3 cap screw through the ear, which cuts its own
// thread in the M3 pilot from v.fixings.
import jscad from '@jscad/modeling'
const { cylinder } = jscad.primitives

export function main (v) {
  const pilot = v.fixings.holeModel('M3', { kind: 'pilot' }).diameter
  const block = cylinder({ radius: v.size / 2, height: v.height, center: [0, 0, v.height / 2] })
  return v.ops.subtract(block, cylinder({ radius: pilot / 2, height: v.depth, center: [0, 0, v.height - v.depth / 2] }))
}
```

The sun's bore runs right through it, with the flat only as far as the motor's shaft reaches: 10 mm of shaft, less
the base and the gap under the sun.

```json projects/home/objects/winder-drive.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "winder-drive",
  "title": "Winder sun on the motor",
  "version": "0.1.0",
  "uses": ["x1c"],
  "engine": "manifold",
  "anchors": { "axis": { "at": [0, 0, 0], "axis": [0, 0, 1] } },
  "variables": {
    "module": { "value": 1, "unit": "mm", "rule": "As the ring" },
    "teeth": { "value": 18, "rule": "From planetary()" },
    "width": { "value": "x1c.layer * 30", "unit": "mm", "rule": "As the ring" },
    "shaft": { "value": 8, "unit": "mm", "rule": "The reel turns on it, inside the sun's roots" },
    "shaft_height": { "value": 12, "unit": "mm", "rule": "Up through the reel's plate and into its cone" },
    "tip": { "value": 6.6, "unit": "mm", "rule": "Where the N20's shaft ends, from the sun's underside: 10 mm of shaft less the 3 mm base and the 0.4 mm gap" }
  }
}
```

```js projects/home/objects/winder-drive.js
// The sun with the N20's D-shaft in it, and the 8 mm shaft above that carries the reel.
import jscad from '@jscad/modeling'
const { cylinder } = jscad.primitives

export function main (v) {
  const motor = v.motors.motorModel('n20')
  const gear = v.gears.spur({ module: v.module, teeth: v.teeth, width: v.width })
  const shaft = cylinder({ radius: v.shaft / 2, height: v.shaft_height, center: [0, 0, v.width + v.shaft_height / 2] })
  return v.ops.subtract(v.ops.union(gear, shaft), v.motors.bore(motor, { depth: v.width + v.shaft_height, tip: v.tip }, v.ops))
}
```

```json projects/home/objects/winder-reel.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "winder-reel",
  "title": "Winder reel and carrier",
  "version": "0.1.0",
  "uses": ["x1c"],
  "engine": "manifold",
  "anchors": {
    "axis": { "at": [0, 0, "base"], "axis": [0, 0, -1] },
    "p0": { "at": ["a", 0, "base + t + drop"], "axis": [0, 0, -1] },
    "p1": { "at": ["0 - a / 2", "a * 0.8660254", "base + t + drop"], "axis": [0, 0, -1] },
    "p2": { "at": ["0 - a / 2", "0 - a * 0.8660254", "base + t + drop"], "axis": [0, 0, -1] }
  },
  "variables": {
    "a": { "value": 18, "unit": "mm", "rule": "Sun to planet: m (S + P) / 2" },
    "drop": { "value": "6 + x1c.layer * 2", "unit": "mm", "rule": "A planet's width and two layers' gap above it" },
    "radius": { "value": 22, "unit": "mm", "rule": "The carrier's plate: past the planets' pins (18 mm out, 1.5 mm round) by four lines" },
    "t": { "value": "x1c.layer * 15", "unit": "mm", "rule": "The plate, fifteen layers" },
    "hole": { "value": 9, "unit": "mm", "rule": "Round the sun's 8 mm shaft, which it turns on" },
    "pin": { "value": 3, "unit": "mm", "rule": "The planets' axles" },
    "planets": { "value": 3, "rule": "From planetary(): three planets" },
    "drum": { "value": 24, "unit": "mm", "rule": "The spool's core: a strap bends round it easily" },
    "wall": { "value": "x1c.line * 4", "unit": "mm", "rule": "The drum's wall: four lines" },
    "length": { "value": 16, "unit": "mm", "rule": "A 15 mm strap and a millimetre" },
    "cheek": { "value": 40, "unit": "mm", "rule": "The outer cheek: a few turns of strap" },
    "cheek_t": { "value": "x1c.layer * 6", "unit": "mm", "rule": "Six layers, on the bed" },
    "base": { "value": "cheek_t + length + radius - drum / 2", "unit": "mm", "rule": "The plate's far face: the cheek, the drum, and a 45° cone out to the plate" }
  }
}
```

```js projects/home/objects/winder-reel.js
// The carrier and the spool in one part, printed upside down: the outer cheek on the bed, the drum, a 45° cone out to
// the carrier's plate, and the planets' pins standing up from it. The assembly turns it over.
import jscad from '@jscad/modeling'
const { cylinder, cylinderElliptic } = jscad.primitives

export function main (v) {
  const cone = v.base - v.cheek_t - v.length
  const cheek = cylinder({ radius: v.cheek / 2, height: v.cheek_t, center: [0, 0, v.cheek_t / 2] })
  const drum = cylinder({ radius: v.drum / 2, height: v.length, center: [0, 0, v.cheek_t + v.length / 2] })
  const flare = cylinderElliptic({ height: cone, startRadius: [v.drum / 2, v.drum / 2], endRadius: [v.radius, v.radius], center: [0, 0, v.cheek_t + v.length + cone / 2] })
  const plate = cylinder({ radius: v.radius, height: v.t, center: [0, 0, v.base + v.t / 2] })
  const third = (2 * Math.PI) / v.planets
  const pins = Array.from({ length: v.planets }, (_, k) => cylinder({ radius: v.pin / 2, height: v.drop, center: [v.a * Math.cos(k * third), v.a * Math.sin(k * third), v.base + v.t + v.drop / 2] }))
  const hole = cylinder({ radius: v.hole / 2, height: v.base + v.t, center: [0, 0, (v.base + v.t) / 2] })
  // hollow inside the drum, open on the bed, its roof closing in at 45° to the bore so it prints without supports
  const inside = v.drum / 2 - v.wall, roof = inside - v.hole / 2, deep = v.cheek_t + v.length
  const hollow = v.ops.union(cylinder({ radius: inside, height: deep, center: [0, 0, deep / 2] }),
    cylinderElliptic({ height: roof, startRadius: [inside, inside], endRadius: [v.hole / 2, v.hole / 2], center: [0, 0, deep + roof / 2] }))
  return v.ops.subtract(v.ops.union(cheek, drum, flare, plate, ...pins), hole, hollow)
}
```

The motor drives the sun, and the planetary takes the rest: `"drive": "sun"`. The load is the strap: 10 N at the
full spool's 20 mm radius, 0.2 N m on the reel. With the catalogue's 100:1 gearbox the check warns, 0.301 N m against
0.2 N m, 1.5 times over. Pololu sells the same motor at 150:1, and `"set": { "ratio": 150 }` scales the torque and
speed to it.

```json projects/home/assemblies/winder-driven.json
{
  "title": "Motorised spool winder",
  "kind": "fit",
  "items": [
    { "id": "base", "object": "winder-base" },
    { "id": "foot_a", "object": "winder-foot", "at": [0, "base.ear_at", "0 - foot_a.height"] },
    { "id": "foot_b", "object": "winder-foot", "at": ["0 - base.ear_at * 0.8660254", "0 - base.ear_at / 2", "0 - foot_b.height"] },
    { "id": "foot_c", "object": "winder-foot", "at": ["base.ear_at * 0.8660254", "0 - base.ear_at / 2", "0 - foot_c.height"] },
    { "id": "drive", "motor": { "model": "n20", "set": { "ratio": 150 }, "drives": "sun", "screw": "M1.6" } },
    { "id": "ring", "object": "winder-ring", "at": [0, 0, "base.t"] },
    { "id": "sun", "object": "winder-drive" },
    { "id": "reel", "object": "winder-reel" },
    { "id": "p0", "object": "winder-gear" },
    { "id": "p1", "object": "winder-gear" },
    { "id": "p2", "object": "winder-gear" }
  ],
  "joints": [
    { "id": "sun", "type": "revolute", "parent": { "item": "base", "at": [0, 0, "base.t + 0.4"], "axis": [0, 0, 1] }, "child": "sun.axis", "label": "Motor" },
    { "id": "reel", "type": "revolute", "parent": { "item": "base", "at": [0, 0, "base.t + 0.8 + ring.width + reel.t"], "axis": [0, 0, 1] }, "child": "reel.axis", "min": -180, "max": 180 },
    { "id": "p0", "type": "revolute", "parent": "reel.p0", "child": "p0.axis", "min": -3000, "max": 3000 },
    { "id": "p1", "type": "revolute", "parent": "reel.p1", "child": "p1.axis", "min": -3000, "max": 3000 },
    { "id": "p2", "type": "revolute", "parent": "reel.p2", "child": "p2.axis", "min": -3000, "max": 3000 }
  ],
  "planetary": [
    { "sun": "sun", "carrier": "reel", "ring": "ring", "planets": ["p0", "p1", "p2"], "drive": "sun",
      "module": "ring.module", "teeth": ["sun.teeth", "p0.teeth", "ring.teeth"] }
  ],
  "fits": [
    { "a": "ring", "b": "base", "fastens": true, "note": "The ring held still on the base by its two push pins" },
    { "a": "drive", "b": "base", "fastens": true, "min": 0, "note": "The motor, on its two M1.6 screws" },
    { "a": "drive", "b": "sun", "shaft": true, "note": "The motor's shaft in the sun" },
    { "a": "foot_a", "b": "base", "min": 0, "note": "A foot, under an ear" },
    { "a": "foot_b", "b": "base", "min": 0, "note": "A foot, under an ear" },
    { "a": "foot_c", "b": "base", "min": 0, "note": "A foot, under an ear" }
  ],
  "fasten": [
    { "screw": "M3 cap", "through": ["base"], "into": "foot_a", "at": ["base.e1"], "note": "A foot, screwed on from above" },
    { "screw": "M3 cap", "through": ["base"], "into": "foot_b", "at": ["base.e2"], "note": "A foot, screwed on from above" },
    { "screw": "M3 cap", "through": ["base"], "into": "foot_c", "at": ["base.e3"], "note": "A foot, screwed on from above" }
  ],
  "loads": [{ "joint": "reel", "torque": 0.2, "note": "A strap pulled with 10 N at the full spool's 20 mm radius" }],
  "poses": { "rest": { "sun": 0 } }
}
```

```sh
npx cad check home/winder-driven   # warns: nothing says whether it holds with the power off
npx cad check home/winder-driven --sweep --steps 12   # warns, as above
npx cad animate home/winder-driven
npx cad preview home/winder-driven --check
```

`cad animate` cuts the gearbox across its shafts and turns it: the planets roll round the held ring as the sun turns,
and the reel, picked out as the part with the load, turns a quarter as far. `cad preview --check` labels the motor's
torque where it starts and where it arrives, with the margin and the open question of holding unpowered.

The check says the sun drives the carrier at a quarter of its speed, the shaft has 6.6 mm of its flat in the sun's
bore, and the motor gives `0.45 N m there against 0.2 N m needed, 2.25 times over (rests on derived figures)`: scaled
from the 100:1 gearbox's, so measure it. It takes a DC motor's working speed as half its free speed: the reel at
about 26 rpm, a turn in 2.3 s, about 2 m of strap a minute onto the bare drum. `npx cad preview home/winder-driven`
draws the motor's curve beside the picture, with that point on it: against the 0.2 N m load alone it would run nearer
40 rpm. Printed, it's 51 g in ten parts, the reel 19 g of it. The feet take three M3x8 caps through the 3 mm ears, 5 mm
into their pilots, and the motor its two M1.6x3.

It warns that nothing says whether the spool holds with the power off. It doesn't: an N20's spur gearbox can be turned
back from its shaft, and the planetary is no help, since a pull on the reel turns the motor four times as fast the
easy way. A ratchet on the reel holds it: the strap tensioner in `examples/bench/projects/gears` has one. Draw it on,
give the reel's joint `"brake": "the ratchet"`, and the check passes it. Print the winder and report two things: how
fast it winds against a known weight, and whether the spool runs back when the power goes. They become the N20's
measured figures.

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
    "plate": { "value": 5, "unit": "mm", "rule": "Deep enough for the motor's four screws to bite, 1.5 times their thread" },
    "width": { "value": 8, "unit": "mm", "rule": "The fixed ring's face: strong enough for the motor's whole torque" },
    "rim": { "value": 62, "unit": "mm", "rule": "Round the 54-tooth ring, three lines and more of wall" },
    "module": { "value": 1, "unit": "mm", "rule": "The gears'" },
    "teeth": { "value": 54, "rule": "The held ring" },
    "post_r": { "value": 37, "unit": "mm", "rule": "Three posts outside the output ring's 33 mm" },
    "post": { "value": 7, "unit": "mm", "rule": "Each post's diameter" },
    "post_height": { "value": 19.7, "unit": "mm", "rule": "From the plate to under the clips, just over the output ring" },
    "pilot_depth": { "value": 8, "unit": "mm", "rule": "Each post's pilot, deep enough for its clip's screw" }
  }
}
```

```js projects/home/objects/joint-housing.js
// A motor plate with the fixed ring standing on it. The motor bolts underneath, its shaft up through the middle.
// Each post has an M3 pilot from v.fixings: its clip's screw cuts its own thread in it.
import jscad from '@jscad/modeling'
const { cylinder } = jscad.primitives
const { translate } = jscad.transforms

export function main (v) {
  const motor = v.motors.motorModel('nema17'), pilot = v.fixings.holeModel('M3', { kind: 'pilot' }).diameter
  const plate = cylinder({ radius: v.rim / 2, height: v.plate, center: [0, 0, v.plate / 2], segments: 96 })
  const ring = translate([0, 0, v.plate], v.gears.internal({ module: v.module, teeth: v.teeth, width: v.width, rim: v.rim }))
  const at = (a) => [v.post_r * Math.cos(a), v.post_r * Math.sin(a)]
  const angles = [Math.PI / 6, (5 * Math.PI) / 6, (3 * Math.PI) / 2]
  const lobes = angles.map((a) => cylinder({ radius: v.post, height: v.plate, center: [...at(a), v.plate / 2], segments: 32 }))
  const posts = angles.map((a) => cylinder({ radius: v.post / 2, height: v.post_height + v.plate, center: [...at(a), (v.post_height + v.plate) / 2], segments: 32 }))
  const arms = angles.map((a) => jscad.transforms.rotateZ(a, jscad.primitives.cuboid({ size: [v.post_r - v.rim / 2 + 2, v.post, v.plate], center: [(v.post_r + v.rim / 2 - 2) / 2, 0, v.plate / 2] })))
  const pilots = angles.map((a) => cylinder({ radius: pilot / 2, height: v.pilot_depth, center: [...at(a), v.plate + v.post_height - v.pilot_depth / 2], segments: 24 }))
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
    "middle": { "value": 15, "unit": "mm", "rule": "A hole in the middle for the motor's shaft to come up in" },
    "bolt": { "value": 20, "unit": "mm", "rule": "Radius of the arm's bolt circle: four screws, each through a clearance hole" }
  }
}
```

```js projects/home/objects/joint-output.js
// The output ring, drawn as it prints: its flange on the bed, the teeth standing on it; it goes on upside down. An
// arm would bolt to its flange through four M3 clearance holes from v.fixings.
import jscad from '@jscad/modeling'
const { cylinder } = jscad.primitives
const { translate } = jscad.transforms

export function main (v) {
  const hole = v.fixings.holeModel('M3').diameter
  const flange = cylinder({ radius: v.rim / 2, height: v.top, center: [0, 0, v.top / 2], segments: 96 })
  const ring = translate([0, 0, v.top], v.gears.internal({ module: v.module, teeth: v.teeth, width: v.width, rim: v.rim }))
  const holes = [0, 1, 2, 3].map((k) => cylinder({ radius: hole / 2, height: v.top + 1, center: [v.bolt * Math.cos(k * Math.PI / 2), v.bolt * Math.sin(k * Math.PI / 2), v.top / 2], segments: 24 }))
  const middle = cylinder({ radius: v.middle / 2, height: v.top + 1, center: [0, 0, v.top / 2], segments: 48 })
  return v.ops.subtract(v.ops.union(flange, ring), holes, middle)
}
```

Three clips on three posts keep the output ring from lifting off. It turns under them with 0.3 mm to spare. Each clip
is held by an M3 cap screw through a clearance hole, cutting its own thread in an M3 pilot in its post, both from
`v.fixings`.

```json projects/home/objects/joint-clip.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "joint-clip",
  "title": "Retaining clip",
  "version": "0.1.0",
  "uses": ["x1c"],
  "anchors": { "post": { "at": [0, 0, "thick"], "axis": [0, 0, 1] } },
  "variables": {
    "reach": { "value": 6, "unit": "mm", "rule": "In over the flange's edge, 4 mm" },
    "back": { "value": 4, "unit": "mm", "rule": "Round the post" },
    "wide": { "value": 8, "unit": "mm", "rule": "As wide as the post and a little" },
    "thick": { "value": 3, "unit": "mm", "rule": "Fifteen layers" }
  }
}
```

```js projects/home/objects/joint-clip.js
// A flat tab screwed to a post by an M3 cap screw, its nose over the flange. The screw passes an M3 clearance hole
// from v.fixings.
import jscad from '@jscad/modeling'
const { cuboid, cylinder } = jscad.primitives
const { subtract } = jscad.booleans

export function main (v) {
  const hole = v.fixings.holeModel('M3').diameter
  const tab = cuboid({ size: [v.reach + v.back, v.wide, v.thick], center: [(v.back - v.reach) / 2, 0, v.thick / 2] })
  return subtract(tab, cylinder({ radius: hole / 2, height: v.thick + 1, center: [0, 0, v.thick / 2], segments: 24 }))
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
    { "a": "clip1", "b": "housing", "min": 0, "note": "A clip, on its post" },
    { "a": "clip2", "b": "housing", "min": 0, "note": "A clip, on its post" },
    { "a": "clip3", "b": "housing", "min": 0, "note": "A clip, on its post" },
    { "a": "motor", "b": "sun", "shaft": true, "note": "The motor's shaft in the sun" }
  ],
  "fasten": [
    { "screw": "M3 cap", "through": ["clip1"], "into": "housing", "at": ["clip1.post"], "note": "A clip, screwed on" },
    { "screw": "M3 cap", "through": ["clip2"], "into": "housing", "at": ["clip2.post"], "note": "A clip, screwed on" },
    { "screw": "M3 cap", "through": ["clip3"], "into": "housing", "at": ["clip3.post"], "note": "A clip, screwed on" }
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
motor all the way round and finds no teeth touching, and neither do the output ring's steps. Each clip's `fasten`
chooses an M3x8 cap, 5 mm into its post's pilot.

Ten times over is more margin than the job needs, but the gearbox is the size it is for what the motor could do to it, not
the arm: stalled against a stop, the 7.44 N m at the output puts 33 MPa on the planets' top teeth (`strength`, the Lewis
equation, for teeth 8 mm wide), against PLA's 39. Give that a home switch, or a smaller current.

## 12. A machine from its task: a SCARA arm that draws

A two-link arm with a pen, standing on a bench, draws on an A5 sheet to 0.3 mm at 50 mm/s. That sentence is the
design's first line and everything else follows from it: where the sheet goes, how long the links are, what turns them,
and what the error budget has to say. This chapter is a whole machine, so it is long. It is the project in
`examples/bench/projects/arm` written out in full: the tests write every file here and run every command.

The arm is a compound planetary at the shoulder (chapter 11's gearbox, on a 17HS4401) and the same gearbox at the
elbow on a second 17HS4401. Its joints are vertical, so gravity never loads a motor. The base can bolt flat on a
bench to draw, or upright on a stand later, on the same four holes.

It is built from parts already on the bench: Usongshine 17HS4401 steppers, DRV8825 drivers on a CNC Shield V3 over an
Arduino Uno R3, microstepping set to 1/8 by the M0 and M1 jumpers (1600 steps a turn), a 12 V bench supply with a
current limit, and one SG90. The assembly marks each of those `"have": true`, so `cad list` lists them as in hand and
everything else as to buy: the 6800 bearing, the two home switches, the screws and the wire. Two rubber bands bias the
joints (below); the assembly does not count them, so buy those too.

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
| Geared | 17HS4401 through the 38:1 gearbox | 0.0059° × 115 mm = 0.012 mm at 1/8 step | 280 g; the gearbox's play and twist | the choice |

The geared elbow uses the shoulder's gearbox unchanged, so the sun, the planets and the output ring are the same prints
and the same bench test measures both. Its motor is the shoulder's too: a 17HS4401 on the same `v.motors` mount, so one
motor, one driver setting and one spare cover both joints. The torque the elbow needs is tiny: 0.08 N m at the elbow
(the pen's drag, the forearm's inertia, the bias) against 1.6 N m the 17HS4401 gives through 38:1 at 0.5 A on 12 V.
A NEMA 14 would do the same 90 g lighter; those 90 g sit at the end of the 160 mm upper arm, and the shoulder pays for
them: its arm's inertia goes from 0.019 to 0.024 kg m², the bearing's load from 89 to 108 N, and it still has seven
times the torque it needs. The fixed ring is printed into the upper arm itself: the elbow costs a sun, three planets, an
output ring and three clips.

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
    "shoulder_torque": {"value": 0.22, "unit": "N m", "rule": "What the shoulder must do at the task's speed and accel: the pen's drag at 242 mm, the arm's inertia and the bias", "kind": "estimate", "source": "Drag 0.3 N x 0.242 m = 0.073 N m + inertia 0.024 kg m2 (motor.accel's, with the 17HS4401 at the elbow) x 2.07 rad/s2 (500 mm/s2 at 242 mm) = 0.05 N m + the rubber band's bias 0.1 N m", "checked": "2026-11-22"},
    "elbow_torque": {"value": 0.08, "unit": "N m", "rule": "What the elbow must do: the pen's drag at 115 mm, the forearm's inertia and the bias", "kind": "estimate", "source": "Drag 0.3 N x 0.115 m = 0.035 N m + inertia 0.0006 kg m2 (motor.accel's forearm) x 4.35 rad/s2 (500 mm/s2 at 115 mm) = 0.003 N m + the rubber band's bias 0.04 N m, 0.077 N m: the elbow's motor rides on the upper arm, so the change of motor leaves it", "checked": "2026-11-22"},
    "foot": {"value": 6, "unit": "mm", "rule": "The base plate's thickness", "kind": "default", "source": "Stiff enough for four M5 screws", "checked": "2026-11-09"},
    "room": {"value": 2, "unit": "mm", "rule": "Air between the shoulder motor's back and the base plate", "kind": "default", "source": "Design", "checked": "2026-11-09"},
    "motor17": {"value": 40, "unit": "mm", "rule": "The 17HS4401's body length", "kind": "community", "source": "nema17 variant 17HS4401 (https://market.samm.com/17hs4401-nema17-step-motor-en)", "checked": "2026-11-09"},
    "face": {"value": "foot + room + motor17", "unit": "mm", "rule": "The shoulder motor's mounting face above the bench: the base's height", "kind": "default", "source": "The stack", "checked": "2026-11-09"},
    "plate": {"value": 5, "unit": "mm", "rule": "The shoulder housing's plate: deep enough for the motor's four screws to bite, 1.5 times their thread", "kind": "default", "source": "Chapter 11's housing", "checked": "2026-11-09"},
    "gear": {"value": 8, "unit": "mm", "rule": "Each gear stage's face", "kind": "default", "source": "Chapter 11's gearbox", "checked": "2026-11-09"},
    "ring_gap": {"value": 0.4, "unit": "mm", "rule": "Between the fixed ring and the output ring", "kind": "default", "source": "Chapter 11's gearbox", "checked": "2026-11-09"},
    "flange": {"value": 5, "unit": "mm", "rule": "The output ring's flange: thick enough for the spindle's four screws to bite", "kind": "default", "source": "Design", "checked": "2026-11-09"},
    "output_top": {"value": "face + plate + gear + ring_gap + gear + flange", "unit": "mm", "rule": "Top of the shoulder's output flange above the bench", "kind": "default", "source": "The stack", "checked": "2026-11-09"},
    "disc": {"value": 3, "unit": "mm", "rule": "The spindle's disc, on the flange", "kind": "default", "source": "Design", "checked": "2026-11-09"},
    "bridge_gap": {"value": 0.6, "unit": "mm", "rule": "Between the spindle's disc and the bridge above it", "kind": "default", "source": "Design", "checked": "2026-11-09"},
    "bridge": {"value": 7, "unit": "mm", "rule": "The bridge's thickness: the 5 mm bearing and a 2 mm ledge", "kind": "default", "source": "Design", "checked": "2026-11-09"},
    "bridge_low": {"value": "output_top + disc + bridge_gap", "unit": "mm", "rule": "The bridge's underside above the bench", "kind": "default", "source": "The stack", "checked": "2026-11-09"},
    "arm_gap": {"value": 0.5, "unit": "mm", "rule": "Between the bridge's top and the upper arm's underside", "kind": "default", "source": "Design", "checked": "2026-11-09"},
    "arm": {"value": 12, "unit": "mm", "rule": "The upper arm's thickness, a plate over the elbow too: about 1.7 mm of sag under its load at 8 mm thick, 0.5 mm at 12", "kind": "default", "source": "The cantilever formula in EXAMPLES.md chapter 12", "checked": "2026-11-09"},
    "switch_pitch": {"value": 9.5, "unit": "mm", "rule": "Between the endstop's two mounting screws", "kind": "estimate", "source": "endstop-10t85 in @rulecad/rules: the set has words among its figures, so an object can't read it through uses", "checked": "2026-11-09"},
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
with the motor hanging between them, and a post carries the shoulder's home switch. Every hole a screw goes in comes
from `v.fixings`, named by its thread: the M5 bolts' clearance holes, an M3 pilot in each column for the housing's
screw, and two M2 pilots in the post for the switch's. The housing and the bridge counterbore their M3 cap heads a
layer below their faces.

```json projects/arm/objects/base.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "base",
  "title": "Base: plate and motor stand",
  "version": "0.1.0",
  "uses": ["x1c", "arm"],
  "engine": "manifold",
  "orientation": "The plate on the bed, columns up",
  "description": "A square plate that bolts down through four corner holes, flat on the bench or upright on a stand, with three columns round the motor carrying the shoulder housing and a post for the home switch.",
  "anchors": {
    "sw1": {"at": ["(post_r + switch_pitch / 2) * cosd(post_a)", "(post_r + switch_pitch / 2) * sind(post_a)", "post_top"], "axis": [0, 0, 1]},
    "sw2": {"at": ["(post_r - switch_pitch / 2) * cosd(post_a)", "(post_r - switch_pitch / 2) * sind(post_a)", "post_top"], "axis": [0, 0, 1]},
    "top": {"at": [0, 0, "column_top"], "axis": [0, 0, 1]},
    "cable": {"at": ["0 - side / 2", 0, "foot"], "axis": [0, 0, 1]},
    "switch": {"at": ["(post_r + switch_pitch / 2) * cosd(post_a)", "(post_r + switch_pitch / 2) * sind(post_a)", "post_top + switch_half"], "axis": [0, 0, 1], "ref": ["0 - cosd(post_a)", "0 - sind(post_a)", 0]}
  },
  "variables": {
    "side": {"value": 96, "unit": "mm", "rule": "The plate's side: round the columns, with room for the bolts", "label": "Plate", "show": true},
    "foot": {"value": "arm.foot", "unit": "mm", "rule": "The plate's thickness"},
    "corner": {"value": 8, "unit": "mm", "rule": "The plate's corners, rounded"},
    "bolt_at": {"value": 38, "unit": "mm", "rule": "Half the bolts' square: the same pattern on a bench and on a stand"},
    "column_top": {"value": "arm.face", "unit": "mm", "rule": "Up to the shoulder motor's mounting face"},
    "column_r": {"value": 37, "unit": "mm", "rule": "Round the motor's corners"},
    "column": {"value": 10, "unit": "mm", "rule": "Solid, stiff enough for the arm's tipping load: section against 2 x the arm's weight in the chapter"},
    "pilot_depth": {"value": 16, "unit": "mm", "rule": "Each column's pilot, deep enough for the housing's screw"},
    "post_r": {"value": 50, "unit": "mm", "rule": "The switch post, outside the housing's posts", "interface": true},
    "post_a": {"value": 235, "unit": "°", "rule": "Round from the front: where the upper arm's flag meets the switch's lever at the shoulder's home, -116°", "interface": true},
    "post_w": {"value": 14, "unit": "mm", "rule": "The post's width along the radius, for the switch's two screws"},
    "post_d": {"value": 12, "unit": "mm", "rule": "The post's depth, tangential"},
    "post_top": {"value": "arm.bridge_low + arm.bridge - 6", "unit": "mm", "rule": "The switch lies on the post, its lever under the arm's flag"},
    "switch_pitch": {"value": "arm.switch_pitch", "unit": "mm", "rule": "The switch's screw spacing"},
    "switch_depth": {"value": 10, "unit": "mm", "rule": "Each switch screw's pilot depth"},
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
// A plate with three columns and a post: first layer one square with four holes. Every screw's hole is v.fixings':
// the M5 bolts' clearance, the M3 pilots the housing's screws cut their thread in, and the switch's M2 pilots.
import jscad from '@jscad/modeling'
const { cylinder, cuboid, roundedRectangle } = jscad.primitives
const { extrudeLinear } = jscad.extrusions
const { translate, rotateZ } = jscad.transforms

export function main (v) {
  const bolt = v.fixings.holeModel('M5').diameter, pilot = v.fixings.holeModel('M3', { kind: 'pilot' }).diameter, switchPilot = v.fixings.holeModel('M2', { kind: 'pilot' }).diameter
  const plate = extrudeLinear({ height: v.foot }, roundedRectangle({ size: [v.side, v.side], roundRadius: v.corner, segments: v.segments }))
  const angles = [v.c1, v.c2, v.c3].map((a) => a * v.rad)
  const at = (r, a) => [r * Math.cos(a), r * Math.sin(a)]
  const columns = angles.map((a) => cylinder({ radius: v.column / 2, height: v.column_top, center: [...at(v.column_r, a), v.column_top / 2], segments: v.segments }))
  const pilots = angles.map((a) => cylinder({ radius: pilot / 2, height: v.pilot_depth, center: [...at(v.column_r, a), v.column_top - v.pilot_depth / 2], segments: v.segments }))
  const a = v.post_a * v.rad
  const post = translate([...at(v.post_r, a), 0], rotateZ(a, cuboid({ size: [v.post_w, v.post_d, v.post_top], center: [0, 0, v.post_top / 2] })))
  const pads = [-1, 1].map((s) => cylinder({ radius: switchPilot / 2, height: v.switch_depth, center: [...at(v.post_r + s * v.switch_pitch / 2, a), v.post_top - v.switch_depth / 2], segments: v.segments }))
  const holes = [[1, 1], [-1, 1], [1, -1], [-1, -1]].map(([x, y]) => cylinder({ radius: bolt / 2, height: v.foot + 1, center: [x * v.bolt_at, y * v.bolt_at, v.foot / 2], segments: v.segments }))
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
  "uses": ["x1c", "arm"],
  "engine": "manifold",
  "orientation": "The motor plate on the bed, the ring and posts up",
  "anchors": {
    "f1": {"at": ["column_r * cosd(f1)", "column_r * sind(f1)", "plate"], "axis": [0, 0, 1]},
    "f2": {"at": ["column_r * cosd(f2)", "column_r * sind(f2)", "plate"], "axis": [0, 0, 1]},
    "f3": {"at": ["column_r * cosd(f3)", "column_r * sind(f3)", "plate"], "axis": [0, 0, 1]},
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
    "pilot_depth": {"value": 8, "unit": "mm", "rule": "Each post's pilot, deep enough for the bridge's screw"},
    "column_r": {"value": 37, "unit": "mm", "rule": "Over the base's columns"},
    "lobe": {"value": 12, "unit": "mm", "rule": "The plate reaches out over each column"},
    "sink": {"value": "x1c.layer", "unit": "mm", "rule": "Each foot's screw head sits a layer under the plate's face"},
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
// The screws' holes are v.fixings': an M3 pilot in each post for the bridge, and an M3 clearance hole with its cap
// head's counterbore in each foot, sunk a layer, for the screw down into the base's column.
import jscad from '@jscad/modeling'
const { cylinder, cylinderElliptic } = jscad.primitives
const { translate } = jscad.transforms

export function main (v) {
  const pilot = v.fixings.holeModel('M3', { kind: 'pilot' }).diameter, screw = v.fixings.holeModel('M3').diameter, cb = v.fixings.counterboreModel('M3 cap'), head = cb.diameter, headDepth = cb.depth + v.sink
  const motor = v.motors.motorModel('17HS4401')
  const at = (r, a) => [r * Math.cos(a), r * Math.sin(a)]
  const posts = [v.p1, v.p2, v.p3].map((a) => a * v.rad), feet = [v.f1, v.f2, v.f3].map((a) => a * v.rad)
  const plate = cylinder({ radius: v.rim / 2, height: v.plate, center: [0, 0, v.plate / 2], segments: v.ring_segments })
  const ring = translate([0, 0, v.plate], v.gears.internal({ module: v.module, teeth: v.teeth, width: v.gear, rim: v.rim }))
  const lobes = [...posts, ...feet].map((a) => cylinder({ radius: v.lobe / 2, height: v.plate, center: [...at(v.post_r, a), v.plate / 2], segments: v.segments }))
  const joins = [...posts, ...feet].map((a) => jscad.transforms.rotateZ(a, jscad.primitives.cuboid({ size: [v.post_r - v.rim / 2 + 2, v.lobe, v.plate], center: [(v.post_r + v.rim / 2 - 2) / 2, 0, v.plate / 2] })))
  const uprights = posts.map((a) => cylinder({ radius: v.post / 2, height: v.post_high + v.plate, center: [...at(v.post_r, a), (v.post_high + v.plate) / 2], segments: v.segments }))
  const pilots = posts.map((a) => cylinder({ radius: pilot / 2, height: v.pilot_depth, center: [...at(v.post_r, a), v.plate + v.post_high - v.pilot_depth / 2], segments: v.segments }))
  const screws = feet.map((a) => cylinder({ radius: screw / 2, height: v.plate + 1, center: [...at(v.column_r, a), v.plate / 2], segments: v.segments }))
  const heads = feet.map((a) => cylinder({ radius: head / 2, height: headDepth, center: [...at(v.column_r, a), v.plate - headDepth / 2], segments: v.segments }))
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
  "uses": ["x1c", "arm"],
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
// Its four holes are v.fixings' M3 pilots, through the flange: the spindle's screws cut their thread in them.
import jscad from '@jscad/modeling'
const { cylinder } = jscad.primitives
const { translate } = jscad.transforms

export function main (v) {
  const pilot = v.fixings.holeModel('M3', { kind: 'pilot' }).diameter
  const flange = cylinder({ radius: v.rim / 2, height: v.top, center: [0, 0, v.top / 2], segments: v.ring_segments })
  const ring = translate([0, 0, v.top], v.gears.internal({ module: v.module, teeth: v.teeth, width: v.width, rim: v.rim }))
  const holes = Array.from({ length: v.bolts }, (_, k) => cylinder({ radius: pilot / 2, height: v.top + 1, center: [v.bolt * Math.cos(k * v.quarter), v.bolt * Math.sin(k * v.quarter), v.top / 2], segments: v.segments }))
  const middle = cylinder({ radius: v.middle / 2, height: v.top + 1, center: [0, 0, v.top / 2], segments: v.ring_segments })
  return v.ops.subtract(v.ops.union(flange, ring), holes, middle)
}
```

The spindle bolts onto the output's flange with four M3 countersunk screws into the flange's pilots, each head flush in a
countersink as wide as an ISO 10642 head (6.72 mm), so the bridge passes over; the disc is 48 mm across so the
countersinks keep an edge outside them. It carries the bearing's inner race on a shoulder. The bridge, on the housing's
posts, holds the outer race in a seat drawn from the 6800's rule set and this printer's press fit.

```json projects/arm/objects/bridge.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "bridge",
  "title": "Bridge: the 6800's seat",
  "version": "0.1.0",
  "uses": ["x1c", "arm"],
  "engine": "manifold",
  "orientation": "Upside to the sky, as it goes on: the pocket opens upward and its ledge prints flat",
  "description": "Three arms across the housing's posts, holding the bearing that takes the output's tipping load.",
  "anchors": {
    "s1": {"at": ["post_r * cosd(p1)", "post_r * sind(p1)", "thick"], "axis": [0, 0, 1]},
    "s2": {"at": ["post_r * cosd(p2)", "post_r * sind(p2)", "thick"], "axis": [0, 0, 1]},
    "s3": {"at": ["post_r * cosd(p3)", "post_r * sind(p3)", "thick"], "axis": [0, 0, 1]},
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
    "sink": {"value": "x1c.layer", "unit": "mm", "rule": "Each screw head sits a layer under the face, so the arm passes over"},
    "segments": {"value": 64, "rule": "Round enough"}
  }
}
```

```js projects/arm/objects/bridge.js
// A three-armed plate over the gearbox, the bearing's seat in the middle.
// Each post's screw: an M3 clearance hole and its cap head's counterbore, sunk a layer, both v.fixings'.
import jscad from '@jscad/modeling'
const { cylinder, cuboid } = jscad.primitives
const { rotateZ } = jscad.transforms

export function main (v) {
  const screw = v.fixings.holeModel('M3').diameter, cb = v.fixings.counterboreModel('M3 cap'), head = cb.diameter, headDepth = cb.depth + v.sink
  const posts = [v.p1, v.p2, v.p3].map((a) => a * v.rad), at = (a) => [v.post_r * Math.cos(a), v.post_r * Math.sin(a)]
  const hub = cylinder({ radius: v.hub / 2, height: v.thick, center: [0, 0, v.thick / 2], segments: v.segments * 2 })
  const arms = posts.map((a) => rotateZ(a, cuboid({ size: [v.post_r, v.lobe, v.thick], center: [v.post_r / 2, 0, v.thick / 2] })))
  const lobes = posts.map((a) => cylinder({ radius: v.lobe / 2, height: v.thick, center: [...at(a), v.thick / 2], segments: v.segments }))
  const seat = v.shapes.bearingSeat({ bore: v.bore, outer_diameter: v.outer, width: v.width }, { fit: 'press', relief: v.relief, through: true, printer: v.x1c, at: [0, 0, v.thick], into: '-z', lead: 0 })
  const screws = posts.map((a) => cylinder({ radius: screw / 2, height: v.thick + 1, center: [...at(a), v.thick / 2], segments: v.segments }))
  const heads = posts.map((a) => cylinder({ radius: head / 2, height: headDepth + 1, center: [...at(a), v.thick - (headDepth - 1) / 2], segments: v.segments }))
  return v.ops.subtract(v.ops.union(hub, arms, lobes), seat, screws, heads)
}
```

```json projects/arm/objects/spindle.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "spindle",
  "title": "Spindle: disc and shaft",
  "version": "0.1.0",
  "uses": ["x1c", "arm"],
  "engine": "manifold",
  "orientation": "The disc on the bed, the shaft up, as it goes on",
  "description": "The output's flange turns the spindle; the spindle's shaft runs in the 6800 and carries the upper arm on a hexagon at its top.",
  "anchors": {
    "b1": {"at": ["bolt", 0, "disc"], "axis": [0, 0, 1]},
    "b2": {"at": [0, "bolt", "disc"], "axis": [0, 0, 1]},
    "b3": {"at": ["0 - bolt", 0, "disc"], "axis": [0, 0, 1]},
    "b4": {"at": [0, "0 - bolt", "disc"], "axis": [0, 0, 1]},
    "down": {"at": [0, 0, 0], "axis": [0, 0, 1], "ref": [1, 0, 0]},
    "seat": {"at": [0, 0, "collar_top + width"], "axis": [0, 0, 1], "ref": [1, 0, 0]}
  },
  "variables": {
    "disc": {"value": "arm.disc", "unit": "mm", "rule": "Thick enough for the countersinks, with a wall of screw hole under each"},
    "rim": {"value": 48, "unit": "mm", "rule": "Round the 40 mm bolt circle and its countersinks, 6.82 mm across, with a 0.6 mm edge outside them"},
    "bolt": {"value": 20, "unit": "mm", "rule": "On the output's bolt circle"},
    "shaft": {"value": "arm.bearing_bore - x1c.press", "unit": "mm", "rule": "A close slide into the bearing's bore, clamped end to end by the upper arm's screw"},
    "width": {"value": "arm.bearing_width", "unit": "mm", "rule": "The bearing"},
    "collar_top": {"value": "arm.bridge_low + arm.bridge - width - arm.output_top", "unit": "mm", "rule": "Where the inner race rests, above the disc's underside"},
    "shoulder": {"value": 13, "unit": "mm", "rule": "Stops the inner race; clears the outer race"},
    "hex": {"value": 8, "unit": "mm", "rule": "Hexagon across its flats: inside the bore, drives the upper arm"},
    "hex_long": {"value": 5, "unit": "mm", "rule": "Into the arm's socket"},
    "pilot_depth": {"value": 12, "unit": "mm", "rule": "The pilot in the hexagon's top, for the upper arm's screw"},
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
// The screws are v.fixings': four M3 countersunk screws down through the disc into the output's flange, each hole's
// countersink as wide as an ISO 10642 head so it sits flush, and an M3 pilot in the hexagon's top for the upper arm's screw.
import jscad from '@jscad/modeling'
const { cylinder } = jscad.primitives

export function main (v) {
  const pilotD = v.fixings.holeModel('M3', { kind: 'pilot' }).diameter
  const plate = cylinder({ radius: v.rim / 2, height: v.disc, center: [0, 0, v.disc / 2], segments: v.segments * 2 })
  const top = v.collar_top + v.width
  const shaft = cylinder({ radius: v.shaft / 2, height: top - 1, center: [0, 0, (top + 1) / 2], segments: v.segments * 2 })
  const collar = v.shapes.shaftShoulder(v.shaft, { shoulder: v.shoulder, height: v.collar_top - v.disc, at: [0, 0, v.collar_top] })
  const hex = cylinder({ radius: v.hex / 2 / v.cos30, height: v.hex_long, center: [0, 0, top + v.hex_long / 2], segments: v.hex_segments })
  const screws = Array.from({ length: v.bolts }, (_, k) => {
    const c = [v.bolt * Math.cos(k * v.quarter), v.bolt * Math.sin(k * v.quarter), v.disc]
    return v.fixings.countersink('M3', { length: v.disc + 1, at: c, into: '-z' })
  })
  const pilot = cylinder({ radius: pilotD / 2, height: v.pilot_depth, center: [0, 0, top + v.hex_long - v.pilot_depth / 2], segments: v.segments })
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
  "uses": ["x1c", "arm"],
  "engine": "manifold",
  "orientation": "The arm's top face on the bed: the hub, the elbow's fixed ring and its posts all rise from the one flat face, and go on hanging down",
  "description": "From the shoulder's hexagon to the elbow's motor. Printed as one part with the elbow's fixed ring, so the elbow's gearbox costs a sun, three planets and an output ring.",
  "anchors": {
    "sw1": {"at": ["switch_x - switch_pitch / 2 * cosd(switch_a)", "switch_y - switch_pitch / 2 * sind(switch_a)", "thick + switch_high"], "axis": [0, 0, 1]},
    "sw2": {"at": ["switch_x + switch_pitch / 2 * cosd(switch_a)", "switch_y + switch_pitch / 2 * sind(switch_a)", "thick + switch_high"], "axis": [0, 0, 1]},
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
    "pilot_depth": {"value": 8, "unit": "mm", "rule": "Each post's pilot, deep enough for its clip's screw"},
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
    "switch_depth": {"value": 9, "unit": "mm", "rule": "Each switch screw's pilot depth"},
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
// upward. The elbow's 17HS4401, the shoulder's motor, bolts on the bed side, its shaft up through the plate, on the same
// v.motors mount as the shoulder's housing.
// The screws' holes are v.fixings': an M3 clearance hole through the socket's floor for the screw into the spindle,
// an M3 pilot in each post for its clip, and the elbow switch's M2 pilots.
import jscad from '@jscad/modeling'
const { cylinder, cylinderElliptic, cuboid, circle } = jscad.primitives
const { translate, rotateZ } = jscad.transforms
const { extrudeLinear } = jscad.extrusions
const { hull } = jscad.hulls

export function main (v) {
  const screw = v.fixings.holeModel('M3').diameter, pilot = v.fixings.holeModel('M3', { kind: 'pilot' }).diameter, switchPilot = v.fixings.holeModel('M2', { kind: 'pilot' }).diameter
  const motor = v.motors.motorModel('17HS4401')
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
  const pilots = posts.map((a) => cylinder({ radius: pilot / 2, height: v.pilot_depth, center: [...at(v.post_r, a), v.clip_at - v.pilot_depth / 2], segments: v.segments }))
  const collar = cylinder({ radius: v.collar_d / 2, height: v.collar + 1, center: [0, 0, v.thick + (v.collar - 1) / 2], segments: v.segments })
  const socket = cylinder({ radius: (v.hex + v.hex_fit) / 2 / v.cos30, height: v.hex_depth + 1, center: [0, 0, v.floor + (v.hex_depth + 1) / 2], segments: v.hex_segments })
  const through = cylinder({ radius: screw / 2, height: v.floor + 1, center: [0, 0, (v.floor - 1) / 2], segments: v.segments })
  const flag = cuboid({ size: [v.flag_wide, v.flag_thick, v.flag_h], center: [v.flag_r, 0, v.thick + v.flag_h / 2] })
  const a = v.switch_a * v.rad
  const switchPost = translate([v.switch_x, v.switch_y, 0], rotateZ(a, cuboid({ size: [v.post_w, v.post_d, v.thick + v.switch_high], center: [0, 0, (v.thick + v.switch_high) / 2] })))
  const switchPilots = [-1, 1].map((s) => cylinder({ radius: switchPilot / 2, height: v.switch_depth, center: [v.switch_x + s * v.switch_pitch / 2 * Math.cos(a), v.switch_y + s * v.switch_pitch / 2 * Math.sin(a), v.thick + v.switch_high - v.switch_depth / 2], segments: v.segments }))
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
  "uses": ["x1c"],
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
    "segments": {"value": 24, "rule": "Small round hole"}
  }
}
```

```js projects/arm/objects/clip.js
// A flat tab screwed to a post, its nose over the flange.
// Its screw's hole is v.fixings' M3 clearance hole.
import jscad from '@jscad/modeling'
const { cuboid, cylinder } = jscad.primitives
const { subtract } = jscad.booleans

export function main (v) {
  const hole = v.fixings.holeModel('M3').diameter
  const tab = cuboid({ size: [v.reach + v.back, v.wide, v.thick], center: [(v.back - v.reach) / 2, 0, v.thick / 2] })
  return subtract(tab, cylinder({ radius: hole / 2, height: v.thick + 1, center: [0, 0, v.thick / 2], segments: v.segments }))
}
```

```json projects/arm/objects/forearm.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "forearm",
  "title": "Forearm",
  "version": "0.1.0",
  "uses": ["x1c", "arm"],
  "engine": "manifold",
  "orientation": "The bar flat on the bed, the boss and flag up",
  "anchors": {
    "b1": {"at": ["bolt", 0, 0], "axis": [0, 0, 1]},
    "b2": {"at": [0, "bolt", 0], "axis": [0, 0, 1]},
    "b3": {"at": ["0 - bolt", 0, 0], "axis": [0, 0, 1]},
    "b4": {"at": [0, "0 - bolt", 0], "axis": [0, 0, 1]},
    "h1": {"at": ["long - pitch", 0, "mid"], "axis": [0, 1, 0]},
    "h2": {"at": ["long + pitch", 0, "mid"], "axis": [0, 1, 0]},
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
    "sink": {"value": 1.5, "unit": "mm", "rule": "Each screw head sits this far into the boss, so an M3x12 engages the whole flange and its tip stops at the flange's far face, clear of the planets"},
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
// A short bar from the elbow's output to a yoke round the pen holder's block. The yoke's cheeks run parallel along the
// slot, so the heads and nuts of the screws across it sit square.
// The screws' holes are v.fixings': two M3 clearance holes across the yoke for the holder's screws, each head
// counterbored into the near cheek (on its side, so a teardrop) so an M3x30 reaches its nut on the far one, and four
// in the boss with their cap heads' counterbores for the screws into the elbow's output.
import jscad from '@jscad/modeling'
const { cylinder, cuboid, circle, rectangle } = jscad.primitives
const { translate } = jscad.transforms
const { extrudeLinear } = jscad.extrusions
const { hull } = jscad.hulls

export function main (v) {
  const screw = v.fixings.holeModel('M3').diameter, cb = v.fixings.counterboreModel('M3 cap'), head = cb.diameter, headDepth = cb.depth + v.sink
  const endWide = v.block + v.cheek * 2, tip = v.long + v.reach
  const dot = (r, x) => translate([x, 0], circle({ radius: r, segments: v.segments }))
  const bar = extrudeLinear({ height: v.bar }, hull(dot(v.wide / 2, 0), rectangle({ size: [tip - v.long + v.slot_from, endWide], center: [(tip + v.long - v.slot_from) / 2, 0] })))
  const boss = cylinder({ radius: v.boss_d / 2, height: v.boss, center: [0, 0, v.boss / 2], segments: v.segments * 2 })
  const slot = cuboid({ size: [tip + 1 - (v.long - v.slot_from), v.block + v.slot_fit, v.bar + 1], center: [(tip + 1 + v.long - v.slot_from) / 2, 0, v.bar / 2] })
  const holes = [-1, 1].map((s) => v.fixings.counterbore('M3 cap', { length: endWide, at: [v.long + s * v.pitch, 0 - endWide / 2, v.mid], into: '+y' }))
  const bolts = Array.from({ length: v.bolts }, (_, k) => cylinder({ radius: screw / 2, height: v.boss + 1, center: [v.bolt * Math.cos(k * v.quarter), v.bolt * Math.sin(k * v.quarter), v.boss / 2], segments: v.segments }))
  const heads = Array.from({ length: v.bolts }, (_, k) => cylinder({ radius: head / 2, height: headDepth + 1, center: [v.bolt * Math.cos(k * v.quarter), v.bolt * Math.sin(k * v.quarter), (headDepth - 1) / 2], segments: v.segments }))
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
  "uses": ["x1c", "arm", "petg"],
  "engine": "manifold",
  "material": "PETG",
  "orientation": "Flat on the bed: the drawing's x and y are the bed's, the pen's axis along y. The leaves bend within their layers. PETG: it creeps less than PLA held bent",
  "description": "A shuttle holding the pen on two tapered leaves: a parallel guide. Its spring is the pen's pressure; an SG90 on a stock horn lifts it. Drawn at rest, the leaves straight.",
  "anchors": {
    "clamp": {"at": ["pen_x", 0, "thick"], "axis": [0, 0, 1]},
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
// The screws' holes are v.fixings': M3 clearance through the block for the forearm's two screws, and an M3 pilot down
// through the shuttle's wall for the screw that clamps the pen.
import jscad from '@jscad/modeling'
const { cuboid, cylinder } = jscad.primitives
const { translate } = jscad.transforms

export function main (v) {
  const bolt = v.fixings.holeModel('M3').diameter, clampPilot = v.fixings.holeModel('M3', { kind: 'pilot' }).diameter
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
  const clamp = cylinder({ radius: clampPilot / 2, height: v.thick, center: [v.pen_x, 0, v.thick - v.half / 2], segments: v.segments })
  const servo = translate([v.xh, v.yh, v.thick], v.motors.mount(v.motors.motorModel('sg90'), { plate: v.thick }, v.ops))
  const holes = [-1, 1].map((s) => cylinder({ radius: bolt / 2, height: v.thick + 1, center: [s * v.bolt_y, 0, v.half], segments: v.segments }))
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
and the error terms that read the rules. Each screwed joint is a `fasten`: the screw named by thread and head with no
length, the parts it passes through and the part it ends in, at anchors on the holes' axes. The check follows each
screw through the parts as drawn and chooses its length, and `cad list` counts it. Chapter 15 explains `fasten` in
full. The forearm's four screws into the elbow's output are sunk 1.5 mm in their counterbores, so an M3x12 takes the
whole 5 mm flange and stops at its face, clear of the planets; the yoke's heads are counterbored into its near cheek
so an M3x30, the longest sold, reaches its nut on the far one.

```json projects/arm/assemblies/arm.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/assembly.schema.json",
  "title": "SCARA arm that draws",
  "kind": "fit",
  "description": "A two-link arm on a bench, an A5 sheet in front of it. The task, the wires, the drivers and the supply are all here: one assembly, every output.",
  "uses": ["arm"],
  "items": [
    { "id": "base", "object": "base" },
    { "id": "m1", "motor": { "model": "17HS4401", "drives": "drive", "speed": 300, "duty": 0.3, "driver": "d1", "current": 0.5, "microsteps": 8 }, "have": true },
    { "id": "housing", "object": "housing", "at": [0, 0, "arm.face"] },
    { "id": "sun", "object": "sun" },
    { "id": "carrier", "object": "speck" },
    { "id": "p1", "object": "planet" }, { "id": "p2", "object": "planet" }, { "id": "p3", "object": "planet" },
    { "id": "output", "object": "output" },
    { "id": "spindle", "object": "spindle" },
    { "id": "bridge", "object": "bridge", "at": [0, 0, "arm.bridge_low"] },
    { "id": "b1", "bought": "bearing-6800", "at": [0, 0, "arm.bridge_low + arm.bridge - arm.bearing_width"] },
    { "id": "upper", "object": "upper" },
    { "id": "m2", "motor": { "model": "17HS4401", "drives": "edrive", "speed": 300, "duty": 0.3, "driver": "d2", "current": 0.5, "microsteps": 8 }, "have": true },
    { "id": "esun", "object": "sun", "set": { "tip": 11.7 } },
    { "id": "ecarrier", "object": "speck" }, { "id": "ering", "object": "speck" },
    { "id": "ep1", "object": "planet" }, { "id": "ep2", "object": "planet" }, { "id": "ep3", "object": "planet" },
    { "id": "eoutput", "object": "output" },
    { "id": "clip1", "object": "clip" }, { "id": "clip2", "object": "clip" }, { "id": "clip3", "object": "clip" },
    { "id": "forearm", "object": "forearm" },
    { "id": "holder", "object": "holder" },
    { "id": "servo", "motor": { "model": "sg90", "drives": "lift_servo", "duty": 0.05 }, "have": true },
    { "id": "horn", "object": "horn" },
    { "id": "pen", "object": "pen" },
    { "id": "es1", "bought": "endstop-10t85" },
    { "id": "es2", "bought": "endstop-10t85" },
    { "id": "d1", "bought": "drv8825", "at": [-300, -30, 8], "have": true },
    { "id": "d2", "bought": "drv8825", "at": [-300, 0, 8], "have": true },
    { "id": "shield", "bought": "cnc-shield-v3", "at": [-300, 0, 0], "have": true },
    { "id": "psu", "bought": "supply-12v", "set": { "output_current": 1.5 }, "at": [-330, 150, 0], "have": true }
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
    { "a": "housing", "b": "base", "min": 0, "note": "The housing, on the base's three columns" },
    { "a": "bridge", "b": "housing", "min": 0, "note": "The bridge, on the housing's posts" },
    { "a": "b1", "b": "bridge", "seat": "press", "note": "The 6800 in its seat" },
    { "a": "es1", "b": "base", "min": -0.1, "note": "The home switch on its post, 0.1 mm of resting contact allowed" },
    { "a": "es2", "b": "upper", "min": -0.1, "note": "The elbow's home switch on its post" },
    { "a": "es1", "b": "upper", "min": -30, "note": "The arm's flag on the home switch's lever at the end of the range" },
    { "a": "es2", "b": "forearm", "min": -30, "note": "The forearm's flag on the elbow switch's lever" },
    { "a": "horn", "b": "holder", "min": -30, "note": "The horn lifts the shuttle's lug: drawn at rest, the lug doesn't rise here" },
    { "a": "ecarrier", "b": "ering", "min": -1, "note": "Two specks: neither is printed" },
    { "a": "d1", "b": "shield", "fastens": true, "min": -20, "note": "Plugged in" },
    { "a": "d2", "b": "shield", "fastens": true, "min": -20, "note": "Plugged in" }
  ],
  "fasten": [
    { "screw": "M3 cap", "through": ["housing"], "into": "base", "at": ["housing.f1", "housing.f2", "housing.f3"], "note": "The housing on the base's three columns" },
    { "screw": "M3 cap", "through": ["bridge"], "into": "housing", "at": ["bridge.s1", "bridge.s2", "bridge.s3"], "note": "The bridge on the housing's posts" },
    { "screw": "M3 countersunk", "through": ["spindle"], "into": "output", "at": ["spindle.b1", "spindle.b2", "spindle.b3", "spindle.b4"], "note": "The spindle on the output's flange, its heads flush under the bridge" },
    { "screw": "M3 cap", "through": ["upper"], "into": "spindle", "at": ["upper.hub"], "note": "The upper arm clamped down on the spindle's hexagon" },
    { "screw": "M3 cap", "through": ["clip1"], "into": "upper", "at": ["clip1.post"], "note": "A clip on its post" },
    { "screw": "M3 cap", "through": ["clip2"], "into": "upper", "at": ["clip2.post"], "note": "A clip on its post" },
    { "screw": "M3 cap", "through": ["clip3"], "into": "upper", "at": ["clip3.post"], "note": "A clip on its post" },
    { "screw": "M3 cap", "through": ["forearm"], "into": "eoutput", "at": ["forearm.b1", "forearm.b2", "forearm.b3", "forearm.b4"], "note": "The forearm on the elbow's output" },
    { "screw": "M3 cap", "through": ["forearm", "holder"], "into": "forearm", "at": ["forearm.h1", "forearm.h2"], "nut": true, "note": "The pen holder in the forearm's yoke" },
    { "screw": "M3 set", "through": [], "into": "holder", "at": ["holder.clamp"], "length": 3, "note": "The pen's clamp screw, down through the shuttle's wall" },
    { "screw": "M2 cap", "through": ["es1"], "into": "base", "at": ["base.sw1", "base.sw2"], "note": "The home switch on its post" },
    { "screw": "M2 cap", "through": ["es2"], "into": "upper", "at": ["upper.sw1", "upper.sw2"], "note": "The elbow's home switch on its post" }
  ],
  "wires": [
    { "id": "shoulder", "from": "m1.connector", "to": "shield.X", "via": ["base.cable"], "gauge": "awg24", "colour": "black, red, green, blue", "connectors": ["JST-XH 4 pin", "screw terminal"], "note": "From the motor's own lead, down through the base" },
    { "id": "elbow", "from": "m2.connector", "to": "shield.Y", "via": ["upper.cable", "base.cable"], "gauge": "awg24", "colour": "black, red, green, blue", "connectors": ["JST-XH 4 pin", "screw terminal"] },
    { "id": "pen", "from": "servo.connector", "to": "shield.Z", "via": ["forearm.cable", "upper.cable", "base.cable"], "gauge": "awg26", "colour": "brown, red, orange", "conductors": 3, "current": 0.7, "connectors": ["Servo JR 3 pin", "D11, 5 V, GND"], "note": "D11 is the Z limit pin on a V3.00 shield: arm.ino uses it for the servo" },
    { "id": "home1", "from": "es1.left", "to": "shield.X", "via": ["base.cable"], "gauge": "awg26", "colour": "white, black", "conductors": 2, "connectors": ["Crimped spade", "X limit and GND"] },
    { "id": "home2", "from": "es2.left", "to": "shield.Y", "via": ["upper.cable", "base.cable"], "gauge": "awg26", "colour": "white, black", "conductors": 2, "connectors": ["Crimped spade", "Y limit and GND"] },
    { "id": "power", "from": "psu.terminals", "to": "shield.top", "gauge": "awg22", "colour": "red, black", "conductors": 2, "current": 2, "connectors": ["Ring terminal", "Screw terminal"], "note": "12 V from the bench supply, its current limit at 1.5 A, into the shield's motor terminals" }
  ],
  "loads": [
    { "joint": "out", "torque": "arm.shoulder_torque", "note": "The pen's drag at its reach, the arm's inertia at 500 mm/s², the bias" },
    { "joint": "elbow", "torque": "arm.elbow_torque", "note": "The pen's drag, the forearm's inertia, the bias" }
  ],
  "task": { "tool": "holder.tool", "sheet": { "size": "a5", "landscape": true, "at": ["arm.near + arm.sheet_h / 2", 0, 0], "u": [0, 1, 0] }, "speed": 50, "accuracy": 0.3, "accel": 500, "elbow": "left", "deflection": "arm.deflection", "pen": { "up": 20, "down": 0 } },
  "poses": { "rest": { "drive": -1530, "edrive": -4586, "lift_servo": 0 } }
}
```

Why each driver is set where it is: both motors run at 0.5 A a coil, a third of the 17HS4401's 1.5 A, and the number
comes from what they must do rather than what they can. On 12 V the motor's torque is flat up to its corner speed,
60 × 12 V / (2 × 4.2 mH × 1.5 A × 200 steps) = 286 rpm, and falls as one over the speed past it; `motor.torque` reads the
volts from the supply item. At the 300 rpm the task runs at, that is 0.2694 N m at full current and 0.0898 N m at 0.5 A.
The shoulder needs 0.012 N m at the motor's shaft (0.22 N m through 38:1 at 47%), seven times under that; the elbow
0.0045 N m, twenty times under. More current would only heat the motor and the PLA it is bolted to. It also sets the
worst the arm can do to itself: stalled against something, 0.5 A puts about 2.4 N m on the shoulder's output, and that
is 12 MPa of shear in the spindle's printed 10 mm shaft, against PLA's 22, about twice over (at the current the shoulder
could take, the shaft would break first). A DRV8825 runs 0.5 A with no heat sink. The machine draws 0.5 A from the
12 V supply: set the bench supply's current limit to 1.5 A, which is three times that and still under 2 A.

Setting each driver's trimmer, the Pololu DRV8825 carrier's way (the `drv8825` rule set's source): the current limit is
twice the reference voltage, Vref = I / 2, for its 0.1 Ω sense resistors, so 0.5 A is 0.25 V. Read the two small
resistors beside the chip first (R100 is 0.1 Ω): clones differ, and a different one changes the formula. With the
motors unplugged and the power off, seat the drivers, then switch on the 12 V supply and plug the Uno into USB. Set the
meter to DC volts, put its black probe on the shield's GND and its red probe on the trimmer's metal top, and turn the
trimmer with a small plastic or ceramic screwdriver until it reads 0.25 V. Switch off before plugging in each motor:
plugging or unplugging a motor with the power on can destroy the driver. A trimmer whose reading will not move is a
faulty driver: set it aside.

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

- `task.reach` passes: `holder.tool` reaches the whole sheet with the elbow to the left, 5.6 mm to spare at the worst point, the
  shoulder between -11° and 101° and the elbow between 58° and 157°.
- `task.speed` passes, just: 51.3 mm/s at the slowest point, the middle of the near edge, against the 50 asked for. The
  motors are at 300 rpm, 8000 steps a second at 1/8 step, which is about what the Uno's firmware streams; any faster and
  the speed has to give, not the microsteps.
- `task.accuracy` warns, as it should: 0.244 mm worst case, 0.11 root-sum-square, at the far corner, against 0.3, with the
  shoulder's play the biggest single term. Those figures are the bench's to replace, and the sentence says so: `Rests on estimates`.
  The worst case is 81% of the budget, under the 100% where the check would fail, over the 80% where it stops saying pass.
  Bench test 14 (play) and 17 (repeatability) decide whether this arm draws to 0.3 mm or to 0.5.
- The rules that are guesses are named in one warning line, `uses estimates, not measurements`, and each settles with `cad measured arm/arm <name>=<value>`.
- `joint.moment` puts 108.1 N equivalent on the 6800, against its 925 N static rating, 8.6 times over (89 N with a
  NEMA 14 at the elbow); `fit.seat` says the
  pocket is drawn 19.038 mm, a press fit, with a 1.11 mm lip on the outer race and clear of the inner.
- `m1 into out` gives 7.3 times the 0.22 N m the task asks at the shoulder, at the 0.5 A chosen, and `m2 into elbow` 20
  times its 0.08 N m, both at 300 rpm on the supply's 12 V. (On 24 V, with a NEMA 14 at the elbow and 0.2 N m asked at
  the shoulder, they were 8.4 and 17.7 times.) Both joints hold with the power off: 38:1 at 47% can't be driven backwards.
- `motor.accel` and `task.time`: the 12 V torque still accelerates the pen at up to 5898 mm/s² (7174 on 24 V), twelve
  times the 500 the task plans, so a move across the sheet takes 5.24 s either way: the speed sets it, not the torque.
- Each `fasten` is followed screw by screw: the holes line up, each far end is a pilot (an M3's 2.9 mm, `x1c.pilot_m3`,
  measured; an M2's 2.1 mm, `m2.pilot`, a community figure) or the yoke's nut, the length is the shortest sold that fits
  (M3x8 into the base's columns, M3x10 into the posts, M3x8 countersunk into the output's flange, M3x12 into the elbow's,
  M3x16 down into the spindle, M3x30 through the yoke, M2x10 for the switches, and an M3x3 set screw that clamps the
  pen), each cap screw in a pilot has the thread its rule set's `pilot_depth` asks, and a hex key reaches every head,
  the bridge's and the spindle's before the parts above them go on.
- `motor.driver` gives 0.25 V on each trimmer for 0.5 A at 1/8 step. `power.supply`: the machine draws 0.5 A at 12 V
  (6 W), and the bench supply, its limit at 1.5 A, gives three times that.
- `cad list` is the shopping list: 439 g of printing in 20 parts, about 8 hours, and everything bought, the screws
  included: 33 of them and the yoke's two nuts, 30 g, each length the one the check chose. What is to buy comes first
  (the 6800 and the two 10T85 switches, the screws, the wire), then what is in hand (the two 17HS4401s, the drivers,
  the shield, the supply, the SG90). `cad wires` is the wiring sheet: each wire's length through the arm's whole range,
  its gauge, its colours and its board pins, the supply's two wires carrying 12 V into the shield.
- `cad machine` writes `exports/arm/arm.machine.json`: steps per degree, 168.9 at 1/8 step through 38:1, the rates and the
  homing. `cad plot` plans the test drawing, a 100 mm square and a circle, in 15 s, and the preview in `.preview/arm/`
  animates it. `cad plot --calibrate` writes the calibration drawing the same way.

Home the arm with the elbow open: homing swings the shoulder to its stop with the elbow wherever it was, and with the
elbow folded the holder comes round to the base's switch post. `npx cad check arm/arm --sweep` moves each joint alone across its range and finds nothing colliding (the switches' flags and the horn's lug
touch where they are meant to, and say so in `fits`). It takes about a quarter of an hour, so run it yourself: the replay here leaves it out.

What the chapter leaves to the bench is written down in `examples/bench/projects/benchmarks/MEASURE.md`: the play, the
twist and the repeatability; the pen's drag, and whether the rubber bands bias the arm enough to take up the gears' backlash.
Print the shoulder's coupon before the whole arm, then measure, then `cad measured`, then read the budget again.

## 13. The same arm, lifting: upright, a gripper, a Z axis

Chapter 12's arm has vertical joints: gravity never loads a motor, the pen hardly weighs anything, and its figures are about drawing straight. This chapter bolts the same parts to a wall so the joints' axes are level. Now the motors hold the arm up, a payload hangs off the end, and the numbers that matter are the shoulder's torque, the bearing's moment, the links' bend and what happens with the power off. Every part of chapter 12's arm stays: the base, the gearboxes, the upper arm, the forearm. What's new is a compliant gripper where the pen holder bolted, and then, on its own stand, a small Z axis that could bolt to the same place.

### What changes from drawing to lifting

The base plate has four corner holes and bolts flat on a bench or against a wall on the same pattern. In `arm-upright` it is on a wall: the plate's face is vertical, the arm's joints have level axes, and the arm swings in a vertical plane. Nothing else about the base changes.

The task is a box of points in front of the arm, 80 mm deep and 120 mm tall, with a payload of 100 g at the tool. The arm is planar, so the box is one plane thick. The assembly writes it as a volume with the plane's depth given, `"y": [-56.6, -56.6]`: the tool's plane is 56.6 mm out from the wall, the height of the forearm's middle above the base plate in chapter 12's stack.

| | Drawing (chapter 12) | Lifting (this chapter) |
|---|---|---|
| Load on the shoulder | 0.22 N m of pen drag, inertia and bias, no gravity | 1.15 N m, the arm's own weight and 100 g, at the far end of the box |
| Shoulder motor at 0.5 A, 12 V | 7.3 times over | 1.4 times over: under the 2 times the check asks for |
| Current | 0.5 A a coil | 0.8 A a coil for the shoulder, 2.2 times over; the elbow stays at 0.5 A |
| What the links do | 0.3 N of drag sideways, about 0.02 mm | 6.6 N of weight in their plane: the tool drops 2.1 mm, the biggest term in the budget |
| What the 6800 sees | The pen's drag | 0.189 N m of tipping and 6.6 N across it: 33 N equivalent, against 925 N |
| The budget | 0.3 mm | 2.5 mm: a gripper, not a pen |

The shoulder has to hold the arm up, and the way to read that is the worst pose: the arm stretched forward with its elbow up, the tool at the box's far side, the masses all as far out as they get. `motor.torque` looks at each loaded joint with its motor run through its range, and at each pose of the assembly. The assembly is drawn in that far pose (named `reach`), so that sweep passes through it. The shoulder needs 1.153 N m and has 2.56 N m at 0.8 A on 12 V through the 38:1 gearbox: 2.2 times over. The kit's other torque figure, `motor.accel`, is worked out across all the box's sampled points: at the worst of them there is still 0.089 N m left at the motor to accelerate with. (With a NEMA 14 at the elbow on 24 V the shoulder needed 1.016 N m and had 2.69: 2.65 times. The 17HS4401's 90 g more at the elbow, 0.14 N m at 160 mm, and the 12 V supply's lower torque at 300 rpm take that down to 2.2.)

Why 0.8 A and not more. Chapter 12 set the current from what the arm has to do, and the same reasoning sets it here: the shoulder gives 3.2 N m an amp at 300 rpm on 12 V, so 0.72 A is the least that keeps it over the check's 2 times, and 0.8 A rounds that up. It also sets what the arm can do to itself when it stalls: at 0.8 A the shoulder can give about 3.8 N m stalled, and that is 19 MPa of shear in the spindle's printed 10 mm shaft, against PLA's 22. At 1 A the torque would be 2.8 times over, but stalled it would put about 4.8 N m on the output, 24 MPa, past PLA's 22: the shaft would break before the motor slipped. Set the shoulder's trimmer to 0.4 V (0.8 A) and the elbow's to 0.25 V, the way chapter 12 says. The machine draws 0.64 A from the 12 V supply, so the same 1.5 A limit covers it. A person running this arm at 0.8 A should print the spindle in PETG or put a steel shaft through it. That is the first thing that changes in the parts, and it's the sort of number a check can't fix for you.

The loads are written in the assembly as three masses at anchors, from the mass table that `joint.moment` prints:

- `lift.upper_mass` 0.466 kg at `upper.elbow` (0.376 kg with a NEMA 14): the upper arm, the elbow's gears and motor, treated as all at the elbow, which overstates it a little: the shoulder's figure is on the safe side.
- `lift.fore_mass` 0.07 kg at `forearm.cable`, about halfway along the forearm: the forearm and the elbow's output gear.
- `lift.tool_mass` 0.148 kg at `gripper.tool`: the gripper, its servo and the 100 g payload.

### Holding it with the power off

`motor.holds` passes the shoulder and the elbow with the power off, for the same reason as chapter 11: the 38:1 compound planetary is about 47% efficient forwards, and a train under 50% can't be turned backwards from the output (efficiency backwards is 2 minus one over the forward efficiency). That 47% is an estimate of a printed gearbox, though, and printed gears run in. What matters is how far the real figure can move before the arm falls, and the numbers say by a long way:

| Real efficiency | Backward efficiency | Back at the motor | Against the 0.025 N m detent |
|---|---|---|---|
| 47% (the estimate) | under 0 | 0, it can't turn backwards | holds |
| 60% | 33% | 0.010 N m | holds, 2.5 times over |
| 75% | 67% | 0.020 N m | holds, 1.2 times over |
| 85% | 82% | 0.025 N m | on the edge |

The back torque there is the shoulder's 1.153 N m worst load through 38:1, times the backward efficiency: the motor's own detent torque, 0.025 N m (the catalogue's figure, an `estimate`), carries it even if the gears run much freer than anything printed is likely to. The elbow, 0.233 N m through the same box against the 17HS4401's 0.025 N m detent, holds by the same arithmetic five times over at 85%: the bigger motor's detent leaves more in hand there than the NEMA 14's 0.008 N m did.

Three things could hold the arm with the power off: the gears' friction, a counter-spring, or a brake. A counter-spring from `@rulecad/flexures` is the usual way to take gravity off a shoulder, and it earns its place when a joint is back-drivable; it would cost a leaf spring strong enough for a newton metre across 90° of swing, a large part, for a joint that already holds. A brake is a bought part and a coil to wire for a problem the gears already solve. So the chapter chooses friction, marks it `estimate`, and bench test 14 in `examples/bench/projects/benchmarks/MEASURE.md` (the gearbox's play, measured at both directions) is where a person learns whether the efficiency is what the figures assume.

### The gripper

A compliant gripper holds what it's given by a servo's force and the friction at its jaws, with no hinge to wear or backlash to take up. The gripper replaces the pen holder in the forearm's yoke, on the same two M3 screws, printed flat in PETG with its 16 mm width (the yoke's slot) as the height of every wall.

It has a palm and two fingers. Each finger is a long leaf with rounded ends and a tapered middle, carrying a stiff back that ends in a jaw reaching inward; the leaf's root grows from an arm off the palm. The servo stands on the palm with its shaft pointing down into the print, and its double-arm horn turns *in the plane of the leaves*, halfway up their width. That detail is the point of the design: a horn on top of the print, pushing on lugs that stand up from the fingers, twists each finger about its long leaf with a couple the leaf can't resist. A leaf 1 mm thick and 16 wide has almost no torsional stiffness (0.2 N m of twist at 5 N and 40 mm would turn it most of a radian). With the horn at the leaves' mid-plane there's no twist to resist.

Each tip of the horn presses on a flat cut into the outer face of a finger, pushing it inward. Because the two arms of a double horn are diametrically opposed, one tip presses on the upper finger in front of the servo's axis and the other tip presses on the lower finger behind it. So the two fingers aren't mirror images: the upper leaf ends ahead of the axis and the lower leaf ends behind it, on different lengths along the palm. Both leaves are 50 mm long, and on the far side of their contact each finger is a rigid back carrying its jaw. A horn with its contact in the plane of the fingers, on its outer face, and no lugs or links: it's the simplest way found here to close two jaws with one rotating arm, and its cost is that the two fingers aren't equal.

`tool.grip` works out what the servo gives. The SG90 is taken as usable at 60% of its 0.1765 N m stall. Its horn's arm at full close is 18 mm long and pointing 47° from the axis along the arm, so its lever on the flat, the force's moment arm, is 18 cos 47° = 12.3 mm: the servo's 0.106 N m pushes each finger with 0.106 / (2 × 0.0123) = 4.3 N (`lift.grip_horn`, the smallest lever on the way shut). That push reaches the jaw by a lever. A leaf bends about a centre about a third of its length back from its tip, so a finger pivots there, roughly: on the lower finger, the worse of the two, the contact is 21 mm from that centre and the jaw 55 mm, so only 38% of the push reaches the jaw: 1.64 N (`lift.grip_lever`, an `estimate` from a beam argument until the grip is measured). The leaf itself takes 0.17 N to bend the 3 mm the horn pushes it, by `leafModel`, leaving 1.46 N at each jaw.

With μ = 0.4 (PETG on a clean plastic or wood part, an `estimate`) and two jaws, that holds 2 × 0.4 × 1.46 = 1.17 N. The object needs its weight and the arm's acceleration, `m (g + a)`. The closing check, at the arm's 300 mm/s² and a 50 g object, needs 0.51 N: held 2.3 times over, past the 2 asked for. At 100 g the same grip is 1.17 against 1.01 N: 1.2 times over, and `tool.grip` warns: the gripper is rated for 50 g at twice over, and carries 100 g only with a cleaner pad or a tighter hold. A soft pad on the jaws, roughly doubling the friction, is the cheap fix a person would try first. The leaf at full close is 3.3 MPa, 10% of PETG's 34 MPa strength, in `tool.strain`: comfortable, because a long leaf only bends a little.

Why 50 mm of leaf and not less: halving the leaf to 25 mm halves the travel it can give for the same strain, and the 1/L³ makes the spring eight times stiffer, so the servo's small grip would go almost all into bending the leaf. A longer leaf costs only print length.

The rules these figures come from:

```json rules/lift.json
{
  "_doc": "What the arm's lifting adds to the drawing arm's rules: the payload, the masses a motor has to raise, the gripper's numbers. Examples chapter 13 explains each.",
  "name": "lift",
  "rules": {
    "payload": {"value": 0.1, "unit": "kg", "rule": "The most the arm is rated to carry at the tool", "kind": "default", "source": "Design: the top of the range the arm is for, 50 to 100 g", "checked": "2026-11-09"},
    "upper_mass": {"value": 0.466, "unit": "kg", "rule": "The upper arm, the elbow's gears, the elbow's motor (a 17HS4401, 280 g) and the switch: as the shoulder sees them", "kind": "derived", "source": "joint.moment's carried mass in chapter 13, less what's beyond the elbow: 0.376 kg with a 190 g NEMA 14, 90 g more with the 17HS4401", "checked": "2026-11-22"},
    "fore_mass": {"value": 0.07, "unit": "kg", "rule": "The forearm and the elbow's output gear, about", "kind": "derived", "source": "joint.moment's carried mass in chapter 13", "checked": "2026-11-09"},
    "tool_mass": {"value": 0.148, "unit": "kg", "rule": "The gripper with its servo and horn, and the payload", "kind": "derived", "source": "joint.moment's carried mass in chapter 13", "checked": "2026-11-09"},
    "grip_horn": {"value": 12.3, "unit": "mm", "rule": "The horn's lever at full close, where it's smallest (18 mm reach × cos 47°): what the servo's torque turns into the push on each finger", "kind": "derived", "source": "gripper's reach and close_a", "checked": "2026-11-09"},
    "grip_lever": {"value": 0.38, "rule": "What of the push reaches the jaw, on the worse finger: from the leaf's bending centre, the contact is nearer than the jaw", "kind": "estimate", "source": "A beam argument in the chapter, an estimate until the grip is measured", "checked": "2026-11-09"},
    "grip_travel": {"value": 3, "unit": "mm", "rule": "How far the horn pushes each finger at the flat to close it fully", "kind": "derived", "source": "gripper's flat: tip travel between rest_a and close_a", "checked": "2026-11-09"},
    "leaf_l": {"value": 50, "unit": "mm", "rule": "The gripper's leaf length", "kind": "default", "source": "gripper's leaf_l", "checked": "2026-11-09"},
    "leaf_t": {"value": 1, "unit": "mm", "rule": "The gripper's leaf thickness", "kind": "default", "source": "gripper's leaf_t", "checked": "2026-11-09"},
    "leaf_w": {"value": 16, "unit": "mm", "rule": "The gripper's leaf width", "kind": "default", "source": "gripper's width", "checked": "2026-11-09"},
    "grip_payload": {"value": 0.05, "unit": "kg", "rule": "What the closing check holds, the object the gripper is rated for at 2×", "kind": "default", "source": "Issue: a 50 g object at 2× margin", "checked": "2026-11-09"},
    "z_lead": {"value": 8, "unit": "mm", "rule": "The T8 screw's lead: four starts, the screw at the screw's own rule", "kind": "community", "source": "t8-screw in @rulecad/rules", "checked": "2026-11-09"},
    "z_friction": {"value": 0.2, "rule": "Brass or POM on steel, about, dry", "kind": "estimate", "source": "A hand figure: bench it", "checked": "2026-11-09"},
    "z_mass": {"value": 0.25, "unit": "kg", "rule": "What the Z axis lifts: the gripper, the payload, the servo and the carriage, about", "kind": "derived", "source": "This chapter's masses", "checked": "2026-11-09"},
    "belt_k": {"value": 2817, "unit": "N/strain/mm", "rule": "A 6 mm GT2 belt's stiffness per unit strain per mm of width", "kind": "spec", "source": "gt2-belt-6 in @rulecad/rules", "checked": "2026-11-09"},
    "belt_load": {"value": 5, "unit": "N", "rule": "The belt's working pull: the load's weight and its acceleration at a few hundred mm/s²", "kind": "estimate", "source": "Worked in chapter 13", "checked": "2026-11-09"},
    "friction": {"value": 0.4, "rule": "PETG on a clean plastic or wood part, about", "kind": "estimate", "source": "A hand figure for a dry contact: a soft pad on the jaw would double it", "checked": "2026-11-09"}
  }
}
```

The two objects, drawn at rest with the fingers straight. The gripper is one print, the fingers joined only through their leaves; the `part` variable lets the closing check below take it apart. Its holes are named, never typed: the block's two are `v.fixings`' M3 clearance holes, 3.5 mm, for the yoke's screws, and the posts under the servo's tabs have pilots of 1.7 mm for the screws that come with the SG90, sized from its tabs as `v.motors.mount` sizes them. The double horn is the one the SG90 comes with, drawn from a few measurements of the bag's contents:

```js projects/arm/objects/gripper.js
// A compliant gripper, printed flat in PETG: a palm with the servo on it, and two fingers, each a rigid jaw on one long
// leaf with rounded ends. A double-arm horn in the leaves' own plane pushes each finger inward at its outer face.
// The screws' holes: M3 clearance through the block for the yoke's two screws, from v.fixings, and pilots for the
// servo's own self-tapping screws, sized from its tabs' holes as v.motors.mount sizes them.
import jscad from '@jscad/modeling'
const { cuboid, cylinder, polygon } = jscad.primitives
const { translate } = jscad.transforms
const { extrudeLinear } = jscad.extrusions

export function main (v) {
  const bolt = v.fixings.holeModel('M3').diameter, pilot = v.motors.mountModel(v.motors.motorModel('sg90'), { plate: v.pilot_d }).holes[0].diameter
  const f = v.flexures, W = v.width, box = (x0, x1, y0, y1, z0 = 0, z1 = W) => cuboid({ size: [x1 - x0, y1 - y0, z1 - z0], center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2] })
  const leaf = (end, y) => translate([end - v.leaf_l, y + v.leaf_t / 2, 0], f.leaf({ length: v.leaf_l, thickness: v.leaf_t, width: W, taper: v.taper, fillet: v.fillet, tip: true, into: v.into }))
  const wedge = (a0, a1, r, h, z0) => extrudeLinear({ height: h }, polygon({ points: [[0, 0], ...Array.from({ length: v.wedge_n + 1 }, (_, i) => { const a = (a0 + (a1 - a0) * i / v.wedge_n) * v.deg; return [r * Math.cos(a), r * Math.sin(a)] })] }))
  const wedgeAt = (a0, a1) => translate([v.xs, 0, v.cavity], wedge(a0, a1, v.reach + v.slack, W, 0))
  // Palm: the block in the forearm's yoke, the stem under the servo and the two arms the leaves grow from
  const block = box(-v.block_x, v.block_x, -v.block_y, v.block_y)
  const stem = v.ops.union(box(v.block_x - 1, v.xs - v.pocket_back, -v.stem_y0, v.stem_y0), box(v.xs - v.pocket_back - 2, v.stem_x1, -v.stem_y, v.stem_y))
  const armUp = box(v.up_root - v.root, v.up_root + v.into, v.arm_y, v.y_in + v.leaf_t), armLow = box(v.low_root - v.root, v.low_root + v.into, -(v.y_in + v.leaf_t), -v.arm_y)
  const pads = [box(v.xs + v.pocket_front + v.pad_gap, v.xs + v.pad_front + v.pad_x, -v.pad_y, v.pad_y, W - v.dip, v.face), box(v.xs - v.pad_back - v.pad_x, v.xs - v.pocket_back - v.pad_gap, -v.pad_y, v.pad_y, W - v.dip, v.face)]
  const pilots = [v.xs + v.pad_front, v.xs - v.pad_back].map((x) => cylinder({ radius: pilot / 2, height: v.pilot_d + 1, center: [x, 0, v.face - (v.pilot_d - 1) / 2], segments: v.segments }))
  const bolts = [-1, 1].map((s) => cylinder({ radius: bolt / 2, height: W + 1, center: [s * v.bolt_x, 0, W / 2], segments: v.segments }))
  // The servo's case and boss come down into the stem from above; the horn turns in two wedges cut from the stem's top
  const pocket = box(v.xs - v.pocket_back, v.xs + v.pocket_front, -v.pocket_y, v.pocket_y, v.case_z, W + 1)
  const boss = cylinder({ radius: v.boss / 2, height: v.case_z - v.horn_z + 1, center: [v.xs, 0, v.horn_z + (v.case_z - v.horn_z + 1) / 2], segments: v.segments })
  const hub = cylinder({ radius: v.hub / 2, height: W - v.cavity + 1, center: [v.xs, 0, v.cavity + (W - v.cavity + 1) / 2], segments: v.segments })
  const cutPalm = [wedgeAt(v.close_a - v.spare, v.rest_a + v.spare), wedgeAt(v.half_turn + v.close_a - v.spare, v.half_turn + v.rest_a + v.spare), hub, boss, pocket]
  const palm = v.ops.subtract(v.ops.union(block, stem, armUp, armLow, pads), ...cutPalm, bolts, pilots)
  // A finger: leaf, then a stiff back with a flat where the horn presses, then the jaw reaching in
  const finger = (s, end, flatX0, flatX1) => {
    const y0 = s > 0 ? v.y_in : -v.y_out, y1 = s > 0 ? v.y_out : -v.y_in
    const back = box(end - v.overlap, v.jaw_x1, y0, y1)
    const flat = s > 0 ? box(flatX0, flatX1, v.y_flat, v.y_out + 1, -1, W + 1) : box(flatX0, flatX1, -v.y_out - 1, -v.y_flat, -1, W + 1)
    const jaw = s > 0 ? box(v.jaw_x0, v.jaw_x1, v.pad_y, v.y_out) : box(v.jaw_x0, v.jaw_x1, -v.y_out, -v.pad_y)
    return v.ops.subtract(v.ops.union(leaf(end, s > 0 ? v.y_in : -v.y_in - v.leaf_t), back, jaw), flat)
  }
  const up = finger(1, v.up_end, v.xs + v.flat_a, v.xs + v.flat_b), low = finger(-1, v.low_end, v.xs - v.flat_b, v.xs - v.flat_a)
  const parts = [palm, up, low]
  return v.part ? parts[v.part - 1] : v.ops.union(...parts)
}
```

```json projects/arm/objects/gripper.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "gripper",
  "title": "Gripper: palm and two fingers on leaves",
  "version": "0.1.0",
  "uses": [
    "x1c"
  ],
  "engine": "manifold",
  "material": "PETG",
  "orientation": "Flat on the bed, the leaves printed upright in their layers: every wall of the leaves is a whole layer stack, no overhang, the same outline the whole way up",
  "description": "Bolts into the forearm's yoke where the pen holder bolts. Two fingers on long leaves, closed by a double-arm horn turning in the leaves' own plane: no lift, no twist. Drawn at rest, open, the leaves straight.",
  "anchors": {
    "mount": {
      "at": [
        0,
        0,
        "half"
      ],
      "axis": [
        0,
        0,
        -1
      ],
      "ref": [
        1,
        0,
        0
      ]
    },
    "tool": {
      "at": [
        "jaw_at",
        0,
        "half"
      ],
      "axis": [
        1,
        0,
        0
      ],
      "ref": [
        0,
        1,
        0
      ]
    },
    "servo": {
      "at": [
        "xs",
        0,
        "face"
      ],
      "axis": [
        0,
        0,
        -1
      ],
      "ref": [
        1,
        0,
        0
      ]
    },
    "horn": {
      "at": [
        "xs",
        0,
        "horn_z"
      ],
      "axis": [
        0,
        0,
        -1
      ],
      "ref": [
        "cosd(rest_a)",
        "sind(rest_a)",
        0
      ]
    },
    "cable": {
      "at": [
        "xs",
        0,
        0
      ],
      "axis": [
        0,
        0,
        1
      ]
    },
    "upper": {
      "at": [
        "jaw_x0",
        "pad_y",
        "half"
      ],
      "axis": [
        0,
        -1,
        0
      ],
      "ref": [
        1,
        0,
        0
      ]
    },
    "lower": {
      "at": [
        "jaw_x0",
        "0 - pad_y",
        "half"
      ],
      "axis": [
        0,
        1,
        0
      ],
      "ref": [
        1,
        0,
        0
      ]
    }
  },
  "variables": {
    "part": {
      "value": 0,
      "rule": "0 the whole print, 1 the palm, 2 the upper finger, 3 the lower: the closing check moves the fingers apart from the palm",
      "tweak": {
        "min": 0,
        "max": 3
      }
    },
    "width": {
      "value": 16,
      "unit": "mm",
      "rule": "The print's thickness, and the width of the leaves: the yoke's slot and stiff against the payload's weight across the leaves",
      "interface": true
    },
    "half": {
      "value": "width / 2",
      "unit": "mm",
      "rule": "Half of it, where the horn turns and the load sits"
    },
    "block_x": {
      "value": 8,
      "unit": "mm",
      "rule": "Half the block in the yoke, along the arm"
    },
    "block_y": {
      "value": 9,
      "unit": "mm",
      "rule": "Half the block across it"
    },
    "bolt_x": {
      "value": 4,
      "unit": "mm",
      "rule": "Half the spacing of the yoke's two screws, as the pen holder's"
    },
    "xs": {
      "value": 62,
      "unit": "mm",
      "rule": "From the bolts to the servo's shaft: the leaves' length and the servo's body set it"
    },
    "leaf_l": {
      "value": 50,
      "unit": "mm",
      "rule": "A leaf's length: long, so the servo spends little of its torque bending it and the strain stays small",
      "label": "Leaf",
      "show": true
    },
    "leaf_t": {
      "value": 1,
      "unit": "mm",
      "rule": "A leaf's thickness: two and a bit lines"
    },
    "taper": {
      "value": 0.25,
      "rule": "Thicker toward both ends, the strain spread along it"
    },
    "fillet": {
      "value": 1.5,
      "unit": "mm",
      "rule": "A round where each leaf meets a block: no square corner to yield at"
    },
    "into": {
      "value": 1.5,
      "unit": "mm",
      "rule": "How far a leaf runs into the block at each end"
    },
    "y_in": {
      "value": 14,
      "unit": "mm",
      "rule": "A finger's inner face at rest: the stem's side, its full travel and a gap"
    },
    "y_out": {
      "value": 18.5,
      "unit": "mm",
      "rule": "A finger's outer edge"
    },
    "y_flat": {
      "value": 16,
      "unit": "mm",
      "rule": "The flat the horn presses, the finger cut back to here so the tip reaches it from the outside"
    },
    "up_end": {
      "value": "xs + 6.5",
      "unit": "mm",
      "rule": "The upper leaf ends just before the horn's contact"
    },
    "low_end": {
      "value": "xs - 15.5",
      "unit": "mm",
      "rule": "The lower leaf ends just before its contact: the two arms of a horn press on opposite sides of its axis"
    },
    "up_root": {
      "value": "up_end - leaf_l",
      "unit": "mm",
      "rule": "Where the upper leaf grows from"
    },
    "low_root": {
      "value": "low_end - leaf_l",
      "unit": "mm",
      "rule": "Where the lower leaf grows from"
    },
    "arm_y": {
      "value": 5,
      "unit": "mm",
      "rule": "Where the root arms join the palm, off the middle: clear of the forearm's bar, which runs on behind the yoke"
    },
    "root": {
      "value": 6,
      "unit": "mm",
      "rule": "The root arms' depth along the arm"
    },
    "overlap": {
      "value": 1.5,
      "unit": "mm",
      "rule": "A leaf's tip into the finger's back"
    },
    "flat_a": {
      "value": 7,
      "unit": "mm",
      "rule": "The flat, starting out from the axis along the arm: where the tip touches at rest"
    },
    "flat_b": {
      "value": 15.5,
      "unit": "mm",
      "rule": "The flat's far end: where the tip gets to at full close, with a little over"
    },
    "jaw_x0": {
      "value": 78,
      "unit": "mm",
      "rule": "The jaws begin, past the end of the stem and the servo's front"
    },
    "jaw_x1": {
      "value": 92,
      "unit": "mm",
      "rule": "The jaws end"
    },
    "pad_y": {
      "value": 4,
      "unit": "mm",
      "rule": "Half a post across"
    },
    "jaw_at": {
      "value": 85,
      "unit": "mm",
      "rule": "Halfway along the jaws: the payload's point and the tool's anchor"
    },
    "stem_x1": {
      "value": 75,
      "unit": "mm",
      "rule": "The stem ends past the servo's front screw"
    },
    "stem_y": {
      "value": 8.4,
      "unit": "mm",
      "rule": "Half the stem round the servo's body: 6.1 and a 2 mm wall"
    },
    "stem_y0": {
      "value": 5.5,
      "unit": "mm",
      "rule": "Half the stem behind the servo"
    },
    "face": {
      "value": "horn_top + 13.3",
      "unit": "mm",
      "rule": "The servo's mounting tabs: its case and boss reach down 13.3 mm to the horn"
    },
    "horn_z": {
      "value": "half",
      "unit": "mm",
      "rule": "The horn's plane: the middle of the leaves' width, so a push on the finger doesn't twist it",
      "interface": true
    },
    "horn_t": {
      "value": 2,
      "unit": "mm",
      "rule": "The horn's thickness"
    },
    "horn_top": {
      "value": "horn_z + horn_t / 2",
      "unit": "mm",
      "rule": "The side of the horn toward the servo"
    },
    "case_z": {
      "value": "face - 10",
      "unit": "mm",
      "rule": "Where the servo's case ends, coming down"
    },
    "pocket_back": {
      "value": 17.3,
      "unit": "mm",
      "rule": "The case's pocket, behind the shaft"
    },
    "pocket_front": {
      "value": 6.6,
      "unit": "mm",
      "rule": "The case's pocket, ahead of the shaft"
    },
    "pocket_y": {
      "value": 6.3,
      "unit": "mm",
      "rule": "Half the case's pocket across"
    },
    "boss": {
      "value": 12.4,
      "unit": "mm",
      "rule": "Round the servo's boss, through the stem"
    },
    "hub": {
      "value": 13,
      "unit": "mm",
      "rule": "Round the horn's hub"
    },
    "cavity": {
      "value": 6.5,
      "unit": "mm",
      "rule": "The floor under the horn: what's left of the stem where the horn sweeps"
    },
    "pad_front": {
      "value": 8.4,
      "unit": "mm",
      "rule": "The servo's front screw, from the shaft"
    },
    "pad_back": {
      "value": 19.1,
      "unit": "mm",
      "rule": "The servo's rear screw, from the shaft"
    },
    "pad_x": {
      "value": 4,
      "unit": "mm",
      "rule": "A post under each of the servo's tabs, how far past its screw, along the arm"
    },
    "pad_gap": {
      "value": 0.2,
      "unit": "mm",
      "rule": "Air between a post and the case's pocket"
    },
    "dip": {
      "value": 1,
      "unit": "mm",
      "rule": "How far the posts run down into the stem"
    },
    "pilot_d": {
      "value": 8,
      "unit": "mm",
      "rule": "How deep each of the servo's screws goes into its post"
    },
    "reach": {
      "value": 18,
      "unit": "mm",
      "rule": "The horn's arm, from the axis to its tip, as drawn by the kit's reference horn"
    },
    "slack": {
      "value": 2,
      "unit": "mm",
      "rule": "The wedge's reach past the horn's tip"
    },
    "spare": {
      "value": 20,
      "unit": "\u00b0",
      "rule": "The wedge's angular spare each side"
    },
    "rest_a": {
      "value": 64,
      "unit": "\u00b0",
      "rule": "The horn's arm direction at rest: the tip just touching the finger's flat"
    },
    "close_a": {
      "value": 47,
      "unit": "\u00b0",
      "rule": "The horn's arm direction at full close: 3 mm of push at the flat"
    },
    "wedge_n": {
      "value": 8,
      "rule": "Steps round a wedge's arc"
    },
    "half_turn": {
      "value": 180,
      "unit": "\u00b0",
      "rule": "Half a turn"
    },
    "deg": {
      "value": 0.017453293,
      "rule": "Radians in a degree"
    },
    "segments": {
      "value": 48,
      "rule": "Round enough"
    }
  }
}
```

```js projects/arm/objects/ghorn.js
// A double-arm servo horn as sold: a hub and two arms across it, a rounded tip on each.
import jscad from '@jscad/modeling'
const { cuboid, cylinder } = jscad.primitives

export function main (v) {
  const arm = cuboid({ size: [v.reach * 2, v.wide, v.thick], center: [0, 0, 0] })
  const tips = [-1, 1].map((s) => cylinder({ radius: v.wide / 2, height: v.thick, center: [s * v.reach, 0, 0], segments: v.segments }))
  const hub = cylinder({ radius: v.hub / 2, height: v.thick, center: [0, 0, 0], segments: v.segments })
  return v.ops.union(arm, ...tips, hub)
}
```

```json projects/arm/objects/ghorn.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "ghorn",
  "title": "Double-arm servo horn (bought, comes with the SG90)",
  "version": "0.1.0",
  "role": "reference",
  "anchors": {
    "axis": {"at": [0, 0, 0], "axis": [0, 0, 1], "ref": [1, 0, 0]}
  },
  "variables": {
    "reach": {"value": 18, "unit": "mm", "rule": "Axis to the tip's centre, about, on the long double horn in the bag", "kind": "estimate", "source": "A guess from the usual SG90 horn set: measure yours"},
    "wide": {"value": 4.5, "unit": "mm", "rule": "The arm's width, and the tip's round"},
    "thick": {"value": 2, "unit": "mm", "rule": "The arm's thickness, centred on the horn's plane"},
    "hub": {"value": 7, "unit": "mm", "rule": "Round the spline"},
    "segments": {"value": 24, "rule": "Round enough"}
  }
}
```

The project lists the new objects:

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
    "holder",
    "gripper",
    "ghorn",
    "zframe",
    "zcar"
  ]
}
```

### The upright assembly

`arm-upright` is `arm` from chapter 12 with five differences: the base, the housing, the bridge and its bearing are rotated 90° about the x axis and the rest follows through the joints (their positions become `[0, "0 - arm.face", 0]` and so on: a rotation of x, y, z to x, -z, y); the pen holder is replaced by the gripper on the forearm's same anchor; the task is a box of points with `payload` and `grip`; `gravity` is set to `[0, 0, -1]` as the check needs the word down; and the elbow folds only to 140°, not 160°, for the reason under the commands below. Its one pose, `reach`, is the far corner of the box: the assembly is drawn there because the shoulder's load is worst there, and "drawn" is what `motor.torque` sweeps its motor from. The fingers are straight in it, as every flexure here is. Its gripper's SG90 is the pen lift's, moved across: the upright arm has no pen to lift, so the one SG90 on the bench serves both builds, and `"have": true` keeps it off the buy list. Its `fasten` list is chapter 12's, with the yoke's two screws and their nuts through the gripper where they went through the pen holder, and no set screw, since there is no pen to clamp. The check chooses each screw's length and `cad list` counts it; chapter 15 explains `fasten` in full.

```json projects/arm/assemblies/arm-upright.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/assembly.schema.json",
  "title": "The arm upright: it lifts",
  "kind": "fit",
  "description": "The drawing arm's parts on the same base, its plate bolted to a wall so the joints' axes are level and gravity loads the motors. The tool is a compliant gripper, the task a box of points in front of the arm.",
  "gravity": [0, 0, -1],
  "uses": ["arm", "lift"],
  "items": [
    { "id": "base", "object": "base", "rotate": [90, 0, 0] },
    { "id": "m1", "motor": { "model": "17HS4401", "drives": "drive", "speed": 300, "duty": 0.3, "driver": "d1", "current": 0.8, "microsteps": 8 }, "have": true },
    { "id": "housing", "object": "housing", "at": [0, "0 - arm.face", 0], "rotate": [90, 0, 0] },
    { "id": "sun", "object": "sun" },
    { "id": "carrier", "object": "speck" },
    { "id": "p1", "object": "planet" }, { "id": "p2", "object": "planet" }, { "id": "p3", "object": "planet" },
    { "id": "output", "object": "output" },
    { "id": "spindle", "object": "spindle" },
    { "id": "bridge", "object": "bridge", "at": [0, "0 - arm.bridge_low", 0], "rotate": [90, 0, 0] },
    { "id": "b1", "bought": "bearing-6800", "at": [0, "0 - (arm.bridge_low + arm.bridge - arm.bearing_width)", 0], "rotate": [90, 0, 0] },
    { "id": "upper", "object": "upper" },
    { "id": "m2", "motor": { "model": "17HS4401", "drives": "edrive", "speed": 300, "duty": 0.3, "driver": "d2", "current": 0.5, "microsteps": 8 }, "have": true },
    { "id": "esun", "object": "sun", "set": { "tip": 11.7 } },
    { "id": "ecarrier", "object": "speck" }, { "id": "ering", "object": "speck" },
    { "id": "ep1", "object": "planet" }, { "id": "ep2", "object": "planet" }, { "id": "ep3", "object": "planet" },
    { "id": "eoutput", "object": "output" },
    { "id": "clip1", "object": "clip" }, { "id": "clip2", "object": "clip" }, { "id": "clip3", "object": "clip" },
    { "id": "forearm", "object": "forearm" },
    { "id": "gripper", "object": "gripper" },
    { "id": "gservo", "motor": { "model": "sg90", "drives": "squeeze", "duty": 0.05 }, "have": true },
    { "id": "ghorn", "object": "ghorn" },
    { "id": "es1", "bought": "endstop-10t85" },
    { "id": "es2", "bought": "endstop-10t85" },
    { "id": "d1", "bought": "drv8825", "at": [-300, -30, 8], "have": true },
    { "id": "d2", "bought": "drv8825", "at": [-300, 0, 8], "have": true },
    { "id": "shield", "bought": "cnc-shield-v3", "at": [-300, 0, 0], "have": true },
    { "id": "psu", "bought": "supply-12v", "set": { "output_current": 1.5 }, "at": [-330, 150, 0], "have": true }
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
    { "id": "edrive", "type": "revolute", "parent": "upper.elbow", "child": "esun.axis", "min": -5320, "max": 180, "label": "Elbow motor" },
    { "id": "ering_on", "type": "fixed", "parent": "upper.elbow", "child": "ering.axis" },
    { "id": "eturn", "type": "revolute", "parent": "upper.elbow", "child": "ecarrier.axis", "min": -5320, "max": 180 },
    { "id": "es1a", "type": "revolute", "parent": "ecarrier.a", "child": "ep1.axis", "min": -30000, "max": 30000 },
    { "id": "es2a", "type": "revolute", "parent": "ecarrier.b", "child": "ep2.axis", "min": -30000, "max": 30000 },
    { "id": "es3a", "type": "revolute", "parent": "ecarrier.c", "child": "ep3.axis", "min": -30000, "max": 30000 },
    { "id": "elbow", "type": "revolute", "parent": "upper.output", "child": "eoutput.axis", "min": 0, "max": 140, "label": "Elbow", "support": { "clips": ["clip1", "clip2", "clip3"], "pitch": 74 },
      "errors": { "play": "arm.play_elbow", "twist": "arm.twist_elbow" }, "home": { "endstop": "es2.lever", "direction": 1 } },
    { "id": "c1_on", "type": "fixed", "parent": "upper.clip1", "child": "clip1.post" },
    { "id": "c2_on", "type": "fixed", "parent": "upper.clip2", "child": "clip2.post" },
    { "id": "c3_on", "type": "fixed", "parent": "upper.clip3", "child": "clip3.post" },
    { "id": "forearm_on", "type": "fixed", "parent": "eoutput.flange", "child": "forearm.hub" },
    { "id": "gripper_on", "type": "fixed", "parent": "forearm.holder", "child": "gripper.mount" },
    { "id": "servo_on", "type": "fixed", "parent": "gripper.servo", "child": "gservo.face" },
    { "id": "squeeze", "type": "revolute", "parent": "gripper.horn", "child": "ghorn.axis", "min": 0, "max": 17, "label": "Grip" },
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
    { "a": "housing", "b": "base", "min": 0, "note": "The housing, on the base's three columns" },
    { "a": "bridge", "b": "housing", "min": 0, "note": "The bridge, on the housing's posts" },
    { "a": "b1", "b": "bridge", "seat": "press", "note": "The 6800 in its seat" },
    { "a": "es1", "b": "base", "min": -0.1, "note": "The home switch on its post, 0.1 mm of resting contact allowed" },
    { "a": "es2", "b": "upper", "min": -0.1, "note": "The elbow's home switch on its post" },
    { "a": "es1", "b": "upper", "min": -30, "note": "The arm's flag on the home switch's lever at the end of the range" },
    { "a": "es2", "b": "forearm", "min": -30, "note": "The forearm's flag on the elbow switch's lever" },
    { "a": "ghorn", "b": "gripper", "min": -30, "note": "The horn presses the fingers' flats: drawn at rest, the fingers don't move here" },
    { "a": "gservo", "b": "gripper", "fastens": true, "min": -0.2, "note": "The servo on its two posts" },
    { "a": "ecarrier", "b": "ering", "min": -1, "note": "Two specks: neither is printed" },
    { "a": "d1", "b": "shield", "fastens": true, "min": -20, "note": "Plugged in" },
    { "a": "d2", "b": "shield", "fastens": true, "min": -20, "note": "Plugged in" }
  ],
  "fasten": [
    { "screw": "M3 cap", "through": ["housing"], "into": "base", "at": ["housing.f1", "housing.f2", "housing.f3"], "note": "The housing on the base's three columns" },
    { "screw": "M3 cap", "through": ["bridge"], "into": "housing", "at": ["bridge.s1", "bridge.s2", "bridge.s3"], "note": "The bridge on the housing's posts" },
    { "screw": "M3 countersunk", "through": ["spindle"], "into": "output", "at": ["spindle.b1", "spindle.b2", "spindle.b3", "spindle.b4"], "note": "The spindle on the output's flange, its heads flush under the bridge" },
    { "screw": "M3 cap", "through": ["upper"], "into": "spindle", "at": ["upper.hub"], "note": "The upper arm clamped down on the spindle's hexagon" },
    { "screw": "M3 cap", "through": ["clip1"], "into": "upper", "at": ["clip1.post"], "note": "A clip on its post" },
    { "screw": "M3 cap", "through": ["clip2"], "into": "upper", "at": ["clip2.post"], "note": "A clip on its post" },
    { "screw": "M3 cap", "through": ["clip3"], "into": "upper", "at": ["clip3.post"], "note": "A clip on its post" },
    { "screw": "M3 cap", "through": ["forearm"], "into": "eoutput", "at": ["forearm.b1", "forearm.b2", "forearm.b3", "forearm.b4"], "note": "The forearm on the elbow's output" },
    { "screw": "M3 cap", "through": ["forearm", "gripper"], "into": "forearm", "at": ["forearm.h1", "forearm.h2"], "nut": true, "note": "The gripper in the forearm's yoke" },
    { "screw": "M2 cap", "through": ["es1"], "into": "base", "at": ["base.sw1", "base.sw2"], "note": "The home switch on its post" },
    { "screw": "M2 cap", "through": ["es2"], "into": "upper", "at": ["upper.sw1", "upper.sw2"], "note": "The elbow's home switch on its post" }
  ],
  "wires": [
    { "id": "shoulder", "from": "m1.connector", "to": "shield.X", "via": ["base.cable"], "gauge": "awg24", "colour": "black, red, green, blue", "connectors": ["JST-XH 4 pin", "screw terminal"], "note": "From the motor's own lead, down through the base" },
    { "id": "elbow", "from": "m2.connector", "to": "shield.Y", "via": ["upper.cable", "base.cable"], "gauge": "awg24", "colour": "black, red, green, blue", "connectors": ["JST-XH 4 pin", "screw terminal"] },
    { "id": "grip", "from": "gservo.connector", "to": "shield.Z", "via": ["gripper.cable", "forearm.cable", "upper.cable", "base.cable"], "gauge": "awg26", "colour": "brown, red, orange", "conductors": 3, "current": 0.7, "connectors": ["Servo JR 3 pin", "D11, 5 V, GND"] },
    { "id": "home1", "from": "es1.left", "to": "shield.X", "via": ["base.cable"], "gauge": "awg26", "colour": "white, black", "conductors": 2, "connectors": ["Crimped spade", "X limit and GND"] },
    { "id": "home2", "from": "es2.left", "to": "shield.Y", "via": ["upper.cable", "base.cable"], "gauge": "awg26", "colour": "white, black", "conductors": 2, "connectors": ["Crimped spade", "Y limit and GND"] },
    { "id": "power", "from": "psu.terminals", "to": "shield.top", "gauge": "awg22", "colour": "red, black", "conductors": 2, "current": 2, "connectors": ["Ring terminal", "Screw terminal"], "note": "12 V from the bench supply, its current limit at 1.5 A, into the shield's motor terminals" }
  ],
  "loads": [
    { "mass": "lift.upper_mass", "at": "upper.elbow", "note": "The upper arm, the elbow's gears and its motor, worst placed at the elbow" },
    { "mass": "lift.fore_mass", "at": "forearm.cable", "note": "The forearm and the elbow's output gear, about half along" },
    { "mass": "lift.tool_mass", "at": "gripper.tool", "note": "The gripper, its servo and the payload" }
  ],
  "task": { "tool": "gripper.tool", "volume": { "x": [170, 250], "y": [-56.6, -56.6], "z": [-60, 60] }, "accuracy": 2.5, "accel": 300, "elbow": "left", "payload": "lift.payload", "grip": { "material": "petg", "servo": "gservo", "horn": "lift.grip_horn", "leaf": { "length": "lift.leaf_l", "thickness": "lift.leaf_t", "width": "lift.leaf_w" }, "travel": "lift.grip_travel", "friction": "lift.friction", "lever": "lift.grip_lever" } },
  "poses": { "reach": { "drive": -1269.4, "edrive": -2679.6, "squeeze": 0 } }
}
```

The shoulder's bearing is the same `support` with the 6800 named; the elbow's three printed clips are named too, as they are in chapter 12. `joint.moment` puts 0.134 N m of tipping and 5.72 N across the shoulder bearing (24 N equivalent, against its 925 N static rating), and 0.038 N m through the elbow's clips, which FE reads at 1.1 MPa. Neither is close. The moment is small because the tool is held out in the plane the arm turns in: gravity does its work as torque on the motors, not as tipping on the bearing. A person who put an object out in front of the plate instead (the wrist 100 mm further from the wall) would see this moment grow, and the 6800 and the clips are what would need looking at again.

`link.deflection` reads the links as drawn, by finite elements: the upper arm with everything bolted to it, as one piece from its joint's axis out, held at the joint and loaded at its far end with the weight it carries, then the forearm the same way. This is a coarse model: 4 mm cubes through a 12 mm arm, and printed parts bolted together treated as one solid. It says the tool drops 1.8 mm at full stretch, nearly all of it from the upper arm bending in its plane with its own motor at its end. It's an `estimate`, and a generous one: a hand formula on the bare 22 × 12 mm upper arm gives about 0.6 mm at the tool; finer cells (`"linkCell": 2.5` on the joint's `support`) and a real measurement are both worth doing before believing either. Bench test 17 measures the tool's actual position. It is the largest term in the budget (the arm's own sag under its own weight and motor): the budget here, 2.5 mm, is a gripper's, and a gripper tolerates being a millimetre low. To draw upright, the arm would need its elbow motor off the far end of the upper arm, or a thicker link: that's the second thing a person would change.

`assembly.frequency` puts the lowest mode at about 12 Hz at full stretch, from the same FE stiffness and the mass it carries: slow enough to see, and worth moving gently at the start and end of a motion. The FE's coarseness is why this is said to one significant figure.

The joints in chapter 12's gearboxes (the motor's sun, the carriers and the planets) also now show `joint.moment` warnings that nothing named takes their tipping: they carry grams, on shafts and printed pins inside the gear train, and the check doesn't know them from a real joint. `fasten.load` warns once, too: the upper arm's one screw down on the spindle's hexagon would hold the shoulder's 1.455 N m of twist by friction alone. It doesn't have to, since the hexagon carries that twist, but the check reads the screw and not the shape the parts lock by, so it can't see that. They stay as warnings; the check runs with `--json` for that reason, and because the rules are estimates.

### Closing the gripper, shown at rest

The gripper is one flexing print, and an assembly can't show a leaf bending. `gripper-check` is the check of the closing. It takes the gripper apart into its palm and two fingers, through the `part` variable, and puts each finger on a slide that follows the servo's turn by what the horn pushes it: 3 mm at the flat over 17° of turn. Only the horn's tips, the fingers and the palm can touch; the leaves pass through their roots freely, because really the leaf bends rather than slides. The check's poses are `open` and `closed`, the finger shown at rest in `open`, and the closing is swept by the assembly's `poses`:

```json projects/arm/assemblies/gripper-check.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/assembly.schema.json",
  "title": "Gripper: closing check",
  "kind": "fit",
  "description": "The gripper's three pieces moved apart so the fingers' closing can be swept: the palm, and each finger on a slide that follows the servo by how far the horn pushes it. The real part is one print, at rest; this is the check, not the build.",
  "gravity": [
    0,
    0,
    -1
  ],
  "uses": [
    "lift"
  ],
  "items": [
    {
      "id": "palm",
      "object": "gripper",
      "set": {
        "part": 1
      }
    },
    {
      "id": "upper",
      "object": "gripper",
      "set": {
        "part": 2
      }
    },
    {
      "id": "lower",
      "object": "gripper",
      "set": {
        "part": 3
      }
    },
    {
      "id": "gservo",
      "motor": {
        "model": "sg90",
        "drives": "squeeze",
        "duty": 0.05
      }
    },
    {
      "id": "ghorn",
      "object": "ghorn"
    }
  ],
  "joints": [
    {
      "id": "servo_on",
      "type": "fixed",
      "parent": "palm.servo",
      "child": "gservo.face"
    },
    {
      "id": "squeeze",
      "type": "revolute",
      "parent": "palm.horn",
      "child": "ghorn.axis",
      "min": 0,
      "max": 17,
      "label": "Grip"
    },
    {
      "id": "close_up",
      "type": "prismatic",
      "parent": "palm.upper",
      "child": "upper.upper",
      "min": 0,
      "max": 4,
      "follow": "squeeze",
      "ratio": 0.176
    },
    {
      "id": "close_low",
      "type": "prismatic",
      "parent": "palm.lower",
      "child": "lower.lower",
      "min": 0,
      "max": 4,
      "follow": "squeeze",
      "ratio": 0.176
    }
  ],
  "fits": [
    {
      "a": "gservo",
      "b": "palm",
      "fastens": true,
      "min": -0.3,
      "note": "The servo on its two posts, its case and boss down in the pocket"
    },
    {
      "a": "gservo",
      "b": "upper",
      "min": -0.05,
      "note": "The servo clears the finger"
    },
    {
      "a": "ghorn",
      "b": "upper",
      "min": -0.25,
      "note": "The horn's tip on the finger's flat"
    },
    {
      "a": "ghorn",
      "b": "lower",
      "min": -0.25,
      "note": "The horn's tip on the finger's flat"
    },
    {
      "a": "upper",
      "b": "palm",
      "min": -2,
      "note": "The leaf's root runs into its arm: the fingers slide here as a check, the leaf really bends"
    },
    {
      "a": "lower",
      "b": "palm",
      "min": -2,
      "note": "The leaf's root runs into its arm"
    }
  ],
  "task": {
    "tool": "upper.tool",
    "volume": {
      "x": [
        85,
        85
      ],
      "y": [
        0,
        0
      ],
      "z": [
        8,
        8
      ]
    },
    "payload": "lift.grip_payload",
    "grip": {
      "material": "petg",
      "servo": "gservo",
      "horn": "lift.grip_horn",
      "leaf": {
        "length": "lift.leaf_l",
        "thickness": "lift.leaf_t",
        "width": "lift.leaf_w"
      },
      "travel": "lift.grip_travel",
      "friction": "lift.friction",
      "lever": "lift.grip_lever"
    },
    "accel": 300
  },
  "poses": {
    "open": {
      "squeeze": 0
    },
    "closed": {
      "squeeze": 17
    }
  }
}
```

The check sees the horn's tips touch the fingers' flats at both poses, and nothing else collide: the horn's swing clears the palm's wedges and its hub's hole, the servo's case sits in its pocket, and the fingers clear the stem. Everything else the assembly says about the arm's own joints doesn't apply here, and the check runs with `--json`. `tool.grip` in this assembly is the 50 g case, passing at 2.3 times over.

The closing check moves the fingers as stiff pieces on slides because the kit moves stiff pieces on joints. The real finger's leaf bends and tilts the jaw a little: 1 or 2 degrees of tilt over the 3 mm, which the object's own compliance takes up. Bench test: print it, load it with a 50 g weight on a thread, and watch the jaws.

### A Z axis, and where it goes

Lifting wants a Z, the tool up and down, and on a flat arm a Z is the only way to pick something up: the arm of chapter 12 can only reach sideways. There are two places to put it, and the numbers choose between them. Say the tool end weighs 250 g and the arm all told 1.3 kg:

| | Z at the wrist | Z at the base |
|---|---|---|
| What the screw lifts | The gripper, the payload and the carriage: about 250 g, 2.5 N | The whole arm: motors, gears, links and tool, 1.3 kg, 13 N |
| What it adds at the tool | About 300 g on the end of a 275 mm arm (steel rods and screw, frame, motor) | Nothing at the tool; the arm is unchanged |
| What it costs | 0.9 N m more on the shoulder of an upright arm, and sag at the wrist | A column as tall as the travel, with the arm's whole tipping moment carried on two LM8UUs: the 1.3 kg at 150 mm is 2 N m, four times what the wrist's screw ever sees, and 8 mm rods flex under it |
| What it leaves unchanged | The arm's links and joints, calibrated as they are | Nothing |
| The choice | Wrist: it lifts a fifth of the mass and needs no new structure | |

So the Z goes at the wrist, bolted into the forearm's yoke where the gripper goes, and on the drawing arm only: on the upright arm a wrist Z runs level, in and out from the wall, and adds to the shoulder's load instead of lifting anything. The motor is the small geared stepper, the 28BYJ-48: 30 g rather than the 190 g NEMA 14, because a 250 g load on an 8 mm lead needs only 2.45 N. Everything turns on the lead's torque, `F = T × 2π × η / lead`: with an 8 mm lead the 28BYJ-48's 0.034 N m gives 15.5 N at about 58% (μ 0.2 on the nut, an `estimate` in the rule set), 6 times over.

The frame bolts into the yoke, two bars hold two 8 mm rods with teardrop holes, and the screw hangs from a coupler at the top with its far end loose in the bottom bar, steadied only by the nut: this is small enough that the rods keep it straight. The carriage rides the rods on two LM8UUs and carries a flanged T8 nut. Printed standing, its pockets and trap open from the top. The frame's holes come from `v.fixings`: M3 clearance holes for the yoke's two screws, and for the motor's ears a clearance hole for the thread its mount takes, M4, 4.6 mm, as teardrops on their sides. The carriage reads the T8 nut's figures from the kit's `t8-nut` set.

```js projects/arm/objects/zframe.js
// A Z axis for the wrist, printed flat: a frame bolted into the forearm's yoke, two bars with the rods' holes, and the
// small stepper on the top bar, its shaft down through the bar to a lead screw.
// The screws' holes are v.fixings' clearance holes: M3 for the yoke's two screws, and for the motor's ears the
// thread its mount takes (v.motors), on their sides as teardrops.
import jscad from '@jscad/modeling'
const { cuboid, cylinder } = jscad.primitives

export function main (v) {
  const bolt = v.fixings.holeModel('M3').diameter, motorHole = v.fixings.holeModel(v.motors.mountModel(v.motors.motorModel('28byj48'), { plate: v.y_out - v.y_in }).screw.thread).diameter
  const W = v.width, box = (x0, x1, y0, y1, z0 = 0, z1 = W) => cuboid({ size: [x1 - x0, y1 - y0, z1 - z0], center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2] })
  const block = box(-v.block_x, v.block_x, -v.block_y, v.block_y, 0, v.block_w)
  const spine = box(v.block_x - 1, v.spine_x, -v.y_out, v.y_out)
  const top = box(v.block_x - 1, v.bar_x, v.y_in, v.y_out), bottom = box(v.block_x - 1, v.bar_x, -v.y_out, -v.y_in)
  const rods = [v.sx - v.rod_gap, v.sx + v.rod_gap].map((x) => v.shapes.teardropHole({ d: v.rod, length: 2 * v.y_out + 2, at: [x, -v.y_out - 1, v.half], into: '+y', through: true }))
  const screwFree = v.shapes.teardropHole({ d: v.screw, length: v.y_out - v.y_in + 2, at: [v.sx, -v.y_out - 1, v.half], into: '+y', through: true })
  const bolts = [-1, 1].map((s) => cylinder({ radius: bolt / 2, height: W + 1, center: [s * v.bolt_x, 0, v.half], segments: v.segments }))
  const motorHoles = [-1, 1].map((s) => v.shapes.teardropHole({ d: motorHole, length: v.y_out - v.y_in + 2, at: [v.sx + s * v.tab, v.y_in - 1, v.half - v.offset], into: '+y', through: true }))
  const boss = v.shapes.teardropHole({ d: v.boss, length: v.y_out - v.y_in + 2, at: [v.sx, v.y_in - 1, v.half], into: '+y', through: true })
  return v.ops.subtract(v.ops.union(block, spine, top, bottom), rods, screwFree, bolts, motorHoles, boss)
}
```

```json projects/arm/objects/zframe.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "zframe",
  "title": "Z axis frame",
  "version": "0.1.0",
  "uses": ["x1c"],
  "engine": "manifold",
  "orientation": "Flat on the bed: the rods' holes run along the bed and have teardrop roofs, the motor's mount cut through the top bar",
  "description": "Bolts into the forearm's yoke where the pen holder or gripper bolts. Two bars hold two 8 mm rods; a 28BYJ-48 on the top bar turns a T8 screw between them.",
  "anchors": {
    "mount": {"at": [0, 0, "block_w / 2"], "axis": [0, 0, -1], "ref": [1, 0, 0]},
    "motor": {"at": ["sx", "y_out", "half"], "axis": [0, -1, 0], "ref": [1, 0, 0]},
    "slide": {"at": ["sx", "0 - y_in", "half"], "axis": [0, 1, 0], "ref": [1, 0, 0]},
    "rod1": {"at": ["sx - rod_gap", "0 - y_out", "half"], "axis": [0, 1, 0], "ref": [1, 0, 0]},
    "rod2": {"at": ["sx + rod_gap", "0 - y_out", "half"], "axis": [0, 1, 0], "ref": [1, 0, 0]},
    "screw": {"at": ["sx", "0 - y_in", "half"], "axis": [0, 1, 0], "ref": [1, 0, 0]},
    "cable": {"at": ["sx", "y_out", 0], "axis": [0, 0, 1]}
  },
  "variables": {
    "width": {"value": 24, "unit": "mm", "rule": "The bars' thickness: the motor's screws sit 8 mm off the shaft, so the plate has to reach past them", "interface": true},
    "block_w": {"value": 16, "unit": "mm", "rule": "The block's thickness, the yoke's slot"},
    "half": {"value": "width / 2", "unit": "mm", "rule": "Half of it: the rods and the screw lie here"},
    "block_x": {"value": 8, "unit": "mm", "rule": "Half the block in the yoke"},
    "block_y": {"value": 9, "unit": "mm", "rule": "Half the block across it"},
    "bolt_x": {"value": 4, "unit": "mm", "rule": "Half the yoke's screws' spacing"},
    "spine_x": {"value": 12, "unit": "mm", "rule": "The spine's far edge"},
    "bar_x": {"value": 75, "unit": "mm", "rule": "The bars' far edge: past the second rod's hole"},
    "y_in": {"value": 41, "unit": "mm", "rule": "Half the window between the bars: the carriage and its 50 mm of travel", "interface": true},
    "y_out": {"value": 51, "unit": "mm", "rule": "Outside the bars: 10 mm of bar, enough for the motor's screws"},
    "sx": {"value": 43, "unit": "mm", "rule": "From the bolts to the screw", "interface": true},
    "rod_gap": {"value": 20, "unit": "mm", "rule": "Each rod from the screw: wide enough to clear the nut's flange and take the load's tipping"},
    "rod": {"value": 8, "unit": "mm", "rule": "The 8 mm rod's hole: a light press, printed", "label": "Rod", "show": true},
    "screw": {"value": 9, "unit": "mm", "rule": "The lead screw through the bottom bar, loose: its end only steadied"},
    "tab": {"value": 17.5, "unit": "mm", "rule": "Half the 28BYJ-48's tab screws' spacing", "kind": "community", "source": "28byj48 in @rulecad/rules"},
    "offset": {"value": 8, "unit": "mm", "rule": "The 28BYJ-48's screws sit this far from its shaft", "kind": "community", "source": "28byj48 in @rulecad/rules"},
    "boss": {"value": 12, "unit": "mm", "rule": "Round the motor's boss, through the top bar"},
    "segments": {"value": 48, "rule": "Round enough"}
  }
}
```

```js projects/arm/objects/zcar.js
// The Z axis's carriage, printed standing: two LM8UU pockets and a nut trap, all going down from the top.
import jscad from '@jscad/modeling'
const { cuboid } = jscad.primitives

export function main (v) {
  const body = cuboid({ size: [v.long * 2, v.deep * 2, v.high], center: [0, 0, v.high / 2] })
  const bearing = { bore: v.rod_d, outer_diameter: v.lm_d, length: v.lm_l }
  const pockets = [-1, 1].map((s) => v.shapes.lm8uuPocket(bearing, { fit: 'press', printer: v.x1c, at: [s * v.rod_gap, 0, v.high], into: '-z', through: true }))
  const nut = { flange_diameter: v.flange, flange_thickness: v.flange_t, body_diameter: v.nut_d, length: v.nut_l, hole_circle: v.hole_c, hole_count: v.holes, hole_diameter: v.hole_d }
  const trap = v.shapes.nutTrap(nut, { printer: v.x1c, at: [0, 0, v.high], depth: v.high + 1 })
  return v.ops.subtract(body, pockets, trap)
}
```

```json projects/arm/objects/zcar.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "zcar",
  "title": "Z axis carriage",
  "version": "0.1.0",
  "uses": ["x1c", "t8-nut"],
  "engine": "manifold",
  "orientation": "Standing, the rods' direction vertical: both LM8UU pockets and the nut trap open from the top, nothing to bridge",
  "description": "Rides the frame's two rods on LM8UU bearings; a flanged T8 nut in the middle takes the screw's push. The tool anchor is on its front face.",
  "anchors": {
    "slide": {"at": [0, 0, 0], "axis": [0, 0, 1], "ref": [1, 0, 0]},
    "tool": {"at": ["long", 0, "high / 2"], "axis": [1, 0, 0], "ref": [0, 1, 0]},
    "lm1": {"at": ["0 - rod_gap", 0, "high - lm_l"], "axis": [0, 0, 1], "ref": [1, 0, 0]},
    "lm2": {"at": ["rod_gap", 0, "high - lm_l"], "axis": [0, 0, 1], "ref": [1, 0, 0]}
  },
  "variables": {
    "high": {"value": 30, "unit": "mm", "rule": "Along the rods: the two bearings' length and a floor", "label": "Carriage", "show": true, "interface": true},
    "long": {"value": 30, "unit": "mm", "rule": "Half the carriage's width along the arm: the rods' spacing and a wall", "interface": true},
    "deep": {"value": 13.5, "unit": "mm", "rule": "Half across: the nut's flange and a wall"},
    "rod_gap": {"value": 20, "unit": "mm", "rule": "Each rod from the screw, as the frame"},
    "rod_d": {"value": 8, "unit": "mm", "rule": "The rod, the LM8UU's bore"},
    "lm_d": {"value": 15, "unit": "mm", "rule": "The LM8UU's outside diameter"},
    "lm_l": {"value": 24, "unit": "mm", "rule": "The LM8UU's length"},
    "flange": {"value": "t8_nut.flange_diameter", "unit": "mm", "rule": "The T8 nut's flange"},
    "flange_t": {"value": "t8_nut.flange_width", "unit": "mm", "rule": "The flange's thickness"},
    "nut_d": {"value": "t8_nut.body_diameter", "unit": "mm", "rule": "The lead nut's round body"},
    "nut_l": {"value": "t8_nut.length", "unit": "mm", "rule": "The lead nut's length"},
    "hole_c": {"value": "t8_nut.hole_circle", "unit": "mm", "rule": "The flange's bolt circle"},
    "holes": {"value": "t8_nut.hole_count", "rule": "Bolts in the flange"},
    "hole_d": {"value": "t8_nut.mount_hole_diameter", "unit": "mm", "rule": "A flange bolt's hole"},
    "segments": {"value": 48, "rule": "Round enough"}
  }
}
```

The Z axis is checked by itself, on a fixed frame, because an upright or a drawing arm around it changes nothing about its own figures. Its rods stand along y, and down is -y:

```json projects/arm/assemblies/arm-z.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/assembly.schema.json",
  "title": "A Z axis on a T8 lead screw",
  "kind": "fit",
  "description": "The wrist's Z axis on its own, bolted down by the block that goes in the forearm's yoke. Fifty millimetres of travel on two 8 mm rods and LM8UU bearings, a 28BYJ-48 turning a T8 screw of 8 mm lead. The rods stand along y, so down is -y.",
  "gravity": [
    0,
    -1,
    0
  ],
  "uses": [
    "lift"
  ],
  "items": [
    {
      "id": "frame",
      "object": "zframe"
    },
    {
      "id": "car",
      "object": "zcar"
    },
    {
      "id": "zm",
      "motor": {
        "model": "28byj48",
        "drives": "z",
        "leadscrew": {
          "lead": "lift.z_lead",
          "diameter": 8,
          "friction": "lift.z_friction"
        },
        "microsteps": 1,
        "duty": 0.3
      }
    },
    {
      "id": "rod1",
      "bought": "rod-8",
      "set": {
        "length": 102
      }
    },
    {
      "id": "rod2",
      "bought": "rod-8",
      "set": {
        "length": 102
      }
    },
    {
      "id": "screw",
      "bought": "rod-8",
      "set": {
        "length": 92
      }
    },
    {
      "id": "lm1",
      "bought": "lm8uu"
    },
    {
      "id": "lm2",
      "bought": "lm8uu"
    }
  ],
  "joints": [
    {
      "id": "zm_on",
      "type": "fixed",
      "parent": "frame.motor",
      "child": "zm.face"
    },
    {
      "id": "z",
      "type": "prismatic",
      "parent": "frame.slide",
      "child": "car.slide",
      "min": 0,
      "max": 50,
      "label": "Z"
    },
    {
      "id": "rod1_on",
      "type": "fixed",
      "parent": "frame.rod1",
      "child": "rod1.bottom"
    },
    {
      "id": "rod2_on",
      "type": "fixed",
      "parent": "frame.rod2",
      "child": "rod2.bottom"
    },
    {
      "id": "screw_on",
      "type": "fixed",
      "parent": "frame.screw",
      "child": "screw.bottom"
    },
    {
      "id": "lm1_on",
      "type": "fixed",
      "parent": "car.lm1",
      "child": "lm1.face"
    },
    {
      "id": "lm2_on",
      "type": "fixed",
      "parent": "car.lm2",
      "child": "lm2.face"
    }
  ],
  "fits": [
    {
      "a": "zm",
      "b": "frame",
      "fastens": true,
      "min": -0.1,
      "note": "The stepper's face on the top bar"
    },
    {
      "a": "zm",
      "b": "screw",
      "min": -100,
      "note": "Coupled, drawn as one line"
    },
    {
      "a": "rod1",
      "b": "frame",
      "fastens": true,
      "min": -100,
      "note": "The rod pressed in its holes"
    },
    {
      "a": "rod2",
      "b": "frame",
      "fastens": true,
      "min": -100,
      "note": "The rod pressed in its holes"
    },
    {
      "a": "lm1",
      "b": "car",
      "fastens": true,
      "min": -100,
      "note": "The bearing in its pocket"
    },
    {
      "a": "lm2",
      "b": "car",
      "fastens": true,
      "min": -100,
      "note": "The bearing in its pocket"
    },
    {
      "a": "rod1",
      "b": "car",
      "min": -100,
      "note": "The rod runs through the carriage's bearing"
    },
    {
      "a": "rod2",
      "b": "car",
      "min": -100,
      "note": "The rod runs through the carriage's bearing"
    },
    {
      "a": "rod1",
      "b": "lm1",
      "min": -100,
      "note": "Rod in bearing"
    },
    {
      "a": "rod2",
      "b": "lm2",
      "min": -100,
      "note": "Rod in bearing"
    },
    {
      "a": "screw",
      "b": "car",
      "min": -100,
      "note": "The screw through the nut"
    },
    {
      "a": "screw",
      "b": "frame",
      "min": -100,
      "note": "The screw's end, loose in the bottom bar"
    }
  ],
  "loads": [
    {
      "mass": "lift.z_mass",
      "at": "car.tool",
      "note": "The gripper, servo, payload and carriage, as the screw sees them"
    }
  ],
  "task": {
    "tool": "car.tool",
    "volume": {
      "x": [
        73,
        73
      ],
      "y": [
        -26,
        24
      ],
      "z": [
        12,
        12
      ]
    },
    "accuracy": 0.5,
    "accel": 100,
    "payload": "lift.z_mass"
  }
}
```

The kit's `leadscrew` on the motor item turns the motor's torque into the screw's force, and into mm per turn for the steps: 4096 steps a revolution of the 28BYJ-48's shaft (64:1 geared, in the catalogue), and 8 mm a revolution is 512 steps a millimetre, the figure `cad machine` writes (`stepsPerUnit`). The joint's support is unnamed because the kit doesn't count linear bearings as a `support` (a printed clip or a bought ball bearing): `joint.moment` warns it can't check them. By hand: 326 g, the carriage and everything on it, is 0.074 N m of tipping at the tool, which over the rods' 40 mm spacing is 1.85 N each, against an LM8UU's 400 N static rating (a community figure): not the limit.

With an 8 mm lead the screw itself back-drives (`Tr8x8` has a 20° lead angle): the screw doesn't hold the load. The motor's own 64:1 gearbox does, 0.0588 N m of friction against 0.001 N m of back torque: the Z holds unpowered, and `motor.holds` says why. Choosing a 2 mm lead instead would make the screw lock on its own (a 5° lead angle) and lift four times slower still (0.29 mm/s against this one's 1.17 mm/s). The kit gives 1.17 mm/s at the 28BYJ-48's working speed: 43 s across the 50 mm travel. It's a slow axis and honest about it: the gripper's job is to pick something up, not to move quickly while doing it.

### A belt instead of a screw

The same frame and carriage can run on a GT2 belt: a 20-tooth pulley on the motor's shaft, 40 mm of travel a turn, and the belt's stretch in the budget. The kit's `belt` on a motor item reads the belt's stiffness and its length and the load on it, and adds a `belt stretch` line to the error budget. On a 240 mm run with the 6 mm belt at 2817 N per unit strain per mm width (from `gt2-belt-6`), a 5 N load stretches it 5 × 240 / (2817 × 6) = 0.07 mm: the budget's biggest term, and small. The torque drops to 2.09 times over, because 40 mm a turn is five times the screw's 8 mm lead: the belt moves faster and pushes less. In the check a motor sits on its joint's axis because that's what the kit's check of the shaft expects; a real belt's pulley axis crosses the travel, and the assembly's description says so.

```json projects/arm/assemblies/arm-z-belt.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/assembly.schema.json",
  "title": "A Z axis on a GT2 belt",
  "kind": "fit",
  "description": "The same frame and carriage driven by a 20-tooth pulley on a 6 mm GT2 belt, shown with the motor on the axis of the slide (the kit wants that for its checks): really the pulley's axis crosses it. The screw is gone; the belt stretches under load and the stretch goes in the budget.",
  "gravity": [
    0,
    -1,
    0
  ],
  "uses": [
    "lift"
  ],
  "items": [
    {
      "id": "frame",
      "object": "zframe"
    },
    {
      "id": "car",
      "object": "zcar"
    },
    {
      "id": "zm",
      "motor": {
        "model": "28byj48",
        "drives": "z",
        "belt": {
          "teeth": 20,
          "pitch": 2,
          "stiffness": "lift.belt_k",
          "width": 6,
          "length": 240,
          "load": "lift.belt_load"
        },
        "microsteps": 1,
        "duty": 0.3
      }
    },
    {
      "id": "rod1",
      "bought": "rod-8",
      "set": {
        "length": 102
      }
    },
    {
      "id": "rod2",
      "bought": "rod-8",
      "set": {
        "length": 102
      }
    },
    {
      "id": "lm1",
      "bought": "lm8uu"
    },
    {
      "id": "lm2",
      "bought": "lm8uu"
    }
  ],
  "joints": [
    {
      "id": "zm_on",
      "type": "fixed",
      "parent": "frame.motor",
      "child": "zm.face"
    },
    {
      "id": "z",
      "type": "prismatic",
      "parent": "frame.slide",
      "child": "car.slide",
      "min": 0,
      "max": 50,
      "label": "Z"
    },
    {
      "id": "rod1_on",
      "type": "fixed",
      "parent": "frame.rod1",
      "child": "rod1.bottom"
    },
    {
      "id": "rod2_on",
      "type": "fixed",
      "parent": "frame.rod2",
      "child": "rod2.bottom"
    },
    {
      "id": "lm1_on",
      "type": "fixed",
      "parent": "car.lm1",
      "child": "lm1.face"
    },
    {
      "id": "lm2_on",
      "type": "fixed",
      "parent": "car.lm2",
      "child": "lm2.face"
    }
  ],
  "fits": [
    {
      "a": "zm",
      "b": "frame",
      "fastens": true,
      "min": -0.1,
      "note": "The stepper's face on the top bar"
    },
    {
      "a": "rod1",
      "b": "frame",
      "fastens": true,
      "min": -100,
      "note": "The rod pressed in its holes"
    },
    {
      "a": "rod2",
      "b": "frame",
      "fastens": true,
      "min": -100,
      "note": "The rod pressed in its holes"
    },
    {
      "a": "lm1",
      "b": "car",
      "fastens": true,
      "min": -100,
      "note": "The bearing in its pocket"
    },
    {
      "a": "lm2",
      "b": "car",
      "fastens": true,
      "min": -100,
      "note": "The bearing in its pocket"
    },
    {
      "a": "rod1",
      "b": "car",
      "min": -100,
      "note": "The rod runs through the carriage's bearing"
    },
    {
      "a": "rod2",
      "b": "car",
      "min": -100,
      "note": "The rod runs through the carriage's bearing"
    },
    {
      "a": "rod1",
      "b": "lm1",
      "min": -100,
      "note": "Rod in bearing"
    },
    {
      "a": "rod2",
      "b": "lm2",
      "min": -100,
      "note": "Rod in bearing"
    }
  ],
  "loads": [
    {
      "mass": "lift.z_mass",
      "at": "car.tool",
      "note": "The gripper, servo, payload and carriage, as the screw sees them"
    }
  ],
  "task": {
    "tool": "car.tool",
    "volume": {
      "x": [
        73,
        73
      ],
      "y": [
        -26,
        24
      ],
      "z": [
        12,
        12
      ]
    },
    "accuracy": 0.5,
    "accel": 100,
    "payload": "lift.z_mass"
  }
}
```

A bare stepper on a belt would drop the load: a belt doesn't self-lock and there's no screw in the way. This motor's 64:1 gearbox holds it (`motor.holds` passes through gearbox friction), and that is why this small stepper is the one on the axis; a NEMA 17 belt axis would need a brake, a spring or its driver left on. `cad machine arm/arm-z-belt` writes `stepsPerUnit` at 102.4: 4096 steps a turn across 40 mm.

The commands. The checks that print what they find are written with `--json` where the findings include warnings on purpose (the estimates, the gearbox joints with no support, the linear bearings), so the replay here stops only if the assembly fails. Run them without `--json` and read them.

```sh
npx cad check arm/gripper
npx cad check arm/ghorn
npx cad check arm/zframe
npx cad check arm/zcar
npx cad check arm/arm-upright --json
npx cad check arm/gripper-check --json
npx cad check arm/arm-z --json
npx cad check arm/arm-z-belt --json
npx cad machine arm/arm-z
npx cad list arm/arm-upright
```

What it says:

- `motor.torque` passes at 2.22 and 6.88 times over at the far pose, on 12 V (2.65 and 6.1 on 24 V with a NEMA 14 at the elbow); the shoulder needs 0.8 A here, not chapter 12's 0.5, and both figures rest on the catalogue's community motor figures, an estimate until measured.
- `motor.holds` passes both joints with the power off, on the gears' 47% (an estimate): the table above says how much that figure can rise before it stops being true, and the detent torque carries it by a wide margin.
- `joint.moment` gives the shoulder's 6800 28 times over (38 with the lighter NEMA 14), the elbow's clips 35. They aren't the limits; the arm's sag is.
- `link.deflection` gives 2.1 mm at full stretch from coarse FE on the whole link, an `estimate` (see above), 1.8 mm with the NEMA 14: the elbow motor's 90 g more bends the upper arm. It's the largest error in the stack, and `task.accuracy` warns at 2.36 mm worst case against the 2.5 mm budget (2.08 before).
- `task.reach` passes with 48.9 mm in hand.
- `tool.grip` warns at 100 g (1.2 times over) on `arm-upright` and passes on `gripper-check` at 50 g (2.3 times over). `tool.strain` passes at 10% of PETG's strength at full close, in the leaf the check reads as a plain cantilever (`leafModel`).
- The Z axis gives 512 steps a mm, 15.5 N of force at 6 times over its 2.45 N load, and holds with the power off because of the motor's gearbox. The belt gives 102.4 steps a mm and 5.1 N, 2 times over, with 0.07 mm of stretch in the budget.
- `fasten` chooses every screw and passes each: the housing's three M3x8 caps into the base, the spindle's four M3x8 countersunk, the bridge's and the clips' six M3x10, the forearm's four M3x12, the upper arm's M3x16 into the hexagon, the home switches' four M2x10, and two M3x30 with their nuts through the yoke and the gripper. Each head has room for its hex key. The one warning, the twist on the hexagon's screw, is above.
- `cad list` prints the same 444.2 g printed as `check`'s mass table, with the gripper's 37 g in it, and buys those screws with the motors' own (4 M3x6 and 4 M3x12 from their mounts): 30.3 g of fixings. To buy: the 6800, the two switches, the screws and the wire; in hand: the two 17HS4401s, the drivers, the shield, the bench supply and the one SG90. The whole machine weighs about 1.05 kg before the wires and the wall (the supply, the drivers and the shield have no mass in their sets).

`npx cad check arm/arm-upright --sweep` swings each joint of the arm through its range and finds nothing colliding, with the finger-flat contact allowed by its `fits` entry. It earned its keep: with chapter 12's limit of 160° of fold, the sweep found the gripper's servo hitting the shoulder housing and the output ring, because the gripper is 32 mm longer than the pen holder and its servo stands up from the print. The elbow is limited to 140° here, which clears with room to spare and costs nothing, since the box needs at most about 113°. Like chapter 12's sweep it is slow, half an hour on a busy laptop, so the replay leaves it out.

### What a person would change

Read the check's output and the table at the top together, and three things stand out: the current (0.8 A against the shaft, and PETG or steel in the spindle if the arm will ever stall); the upper arm's in-plane stiffness (the 2.1 mm figure, which a person would refine by measuring, and fix by moving the elbow motor back along the arm or thickening the link across its 22 mm); the gripper's friction and grip, which rate the arm for 50 g reliably and 100 g with a pad on the jaws; and the elbow's home switch, which sits at 160° of fold, past the new 140° limit. As drawn, this arm can't home its elbow on that switch with the gripper on: a person would move the switch post and the forearm's flag to about 130°, or home the elbow against the opposite end of its travel. It's left unchanged here so that the arm's parts stay chapter 12's, and it's the one thing that stops this arm being built as it stands.

### What waits on the bench

The figures that are `estimate` above wait on the bench: the gearbox's real efficiency for holding, the link's sag against FE, the leaf's force against `leafModel`, the friction of a jaw on what it holds and the jaw lever `lift.grip_lever`, the belt's working load, and the motor's torque figures as the catalogue gives them. Bench tests 14, 15 and 17 in `examples/bench/projects/benchmarks/MEASURE.md` measure the gearbox and the tool; for the gripper, the test is a 50 g weight on a thread held and shaken, then a 100 g one with a pad; for the Z axis, how far the carriage moves when a load is added, and whether the motor's gearbox slips. As in chapter 12, `cad measured` writes each result back where its estimate was, and the budget moves.

## 14. A leg from the arm's parts: a stand, then a quadruped on paper

The shoulder gearbox that holds a drawing arm still also holds a leg up. This chapter takes the arm's hip and elbow, turns them on
their side, and asks them to stand on a kitchen scale: one leg on a stand first, then four of them on a body as a design exercise.
It is the project in `examples/bench/projects/leg` written out in full, and the tests write every file here and run every command.

Everything in this chapter is quasi-static: the feet move slowly enough that the body's own acceleration does not count, and no
gait here has been built or measured. The gearbox's efficiency and the printed parts' strength are estimates, marked as such, until
a bench says otherwise.

### From arm to leg, in the numbers

| | The arm (chapter 12) | The leg |
|---|---|---|
| Joint axis | Vertical: gravity never loads a motor | Horizontal: gravity is the load |
| Task | A pen's drag on paper, 0.3 N | The weight on the foot, 9.9 N on the stand |
| Worst torque | 0.22 N m at the shoulder | 0.608 N m at the knee, 0.198 N m at the hip |
| Margin at the motor | 8 times (shoulder, at 0.5 A) | 2.8 times at the knee, 8.5 times at the hip, at the same 0.5 A |
| What decides the link length | Reach across a sheet, and how far the elbow's error swings | The lever on the foot: the shorter, the less torque |

The same gearbox with a 17HS4401 at the hip and another at the knee: the motor the arm uses at both its joints, and the one on the
bench (chapter 12). A NEMA 14 at the knee would be 90 g lighter, but it is a part to buy, and the 17HS4401 is in hand. A 1.5 kg robot
trotting puts its weight on two feet at a time, so each leg carries up to 0.75 kg (`leg.share`). On the stand, the foot carries
whatever rides the rods: the leg itself (855 g of motors, gears and prints, and its bearing), the carriage and its two bushings, and the
screws, 1.01 kg in all (`leg.riding`, summed from `cad list`). That is more than the share, so the stand's load, `leg.stand_load`, is
the larger of the two: the carriage's own weight stands in for the robot's body, and is a little more than it.

The thigh is 100 mm, the shortest that keeps the knee's 43 mm gearbox radius clear of the hip's (43 + 43 and a little to swing past), and
the shin 100 mm to match. At 170 mm of standing height the foot is under the hip with the knee bent 32° each way, and the
torque on the knee is the shin's weight share across its lever: about 53 mm at the middle of the stride, up to about 73 mm at its ends.

### The leg's rules

The stack of the same gearbox with the motor's face as zero, what the leg stands on, and the stand. Nothing is copied by hand from the arm: where a figure is the arm's, its rule says so.

```json rules/leg.json
{
  "_doc": "A leg made from the drawing arm's parts: the stack of the same gearbox, with the arm's motor face as this leg's zero, what the leg is asked to stand up, and the stand it does that on. Examples chapter 14 explains each.",
  "name": "leg",
  "rules": {
    "plate": {"value": 5, "unit": "mm", "rule": "The hip housing's plate: deep enough for the motor's four screws to bite, 1.5 times their thread", "kind": "default", "source": "EXAMPLES chapter 11's housing", "checked": "2026-11-09"},
    "gear": {"value": 8, "unit": "mm", "rule": "Each gear stage's face", "kind": "default", "source": "EXAMPLES chapter 11's gearbox", "checked": "2026-11-09"},
    "ring_gap": {"value": 0.4, "unit": "mm", "rule": "Between the fixed ring and the output ring", "kind": "default", "source": "EXAMPLES chapter 11's gearbox", "checked": "2026-11-09"},
    "flange": {"value": 5, "unit": "mm", "rule": "The output ring's flange: thick enough for the spindle's four screws to bite", "kind": "default", "source": "EXAMPLES chapter 12", "checked": "2026-11-09"},
    "output_top": {"value": "plate + gear + ring_gap + gear + flange", "unit": "mm", "rule": "The top of the hip's output flange, from the motor's face", "kind": "default", "source": "The stack", "checked": "2026-11-09"},
    "disc": {"value": 3, "unit": "mm", "rule": "The spindle's disc, on the flange", "kind": "default", "source": "EXAMPLES chapter 12", "checked": "2026-11-09"},
    "bridge_gap": {"value": 0.6, "unit": "mm", "rule": "Between the spindle's disc and the bridge above it", "kind": "default", "source": "EXAMPLES chapter 12", "checked": "2026-11-09"},
    "bridge": {"value": 7, "unit": "mm", "rule": "The bridge's thickness: the 5 mm bearing and a 2 mm ledge", "kind": "default", "source": "EXAMPLES chapter 12", "checked": "2026-11-09"},
    "bridge_low": {"value": "output_top + disc + bridge_gap", "unit": "mm", "rule": "The bridge's underside, from the motor's face", "kind": "default", "source": "The stack", "checked": "2026-11-09"},
    "arm_gap": {"value": 0.5, "unit": "mm", "rule": "Between the bridge's top and the thigh", "kind": "default", "source": "EXAMPLES chapter 12", "checked": "2026-11-09"},
    "arm": {"value": 12, "unit": "mm", "rule": "The thigh's thickness, a plate over the knee too", "kind": "default", "source": "EXAMPLES chapter 12's upper arm", "checked": "2026-11-09"},
    "bearing_bore": {"value": 10, "unit": "mm", "rule": "The 6800's bore", "kind": "spec", "source": "bearing-6800 in @rulecad/rules (NTN)", "checked": "2026-11-09"},
    "bearing_outer": {"value": 19, "unit": "mm", "rule": "The 6800's outside diameter", "kind": "spec", "source": "bearing-6800", "checked": "2026-11-09"},
    "bearing_width": {"value": 5, "unit": "mm", "rule": "The 6800's width", "kind": "spec", "source": "bearing-6800", "checked": "2026-11-09"},
    "knee_flange": {"value": "bridge_low + bridge + arm_gap - gear - ring_gap - gear - flange", "unit": "mm", "rule": "The knee output flange's underside, where the shin bolts on: the thigh's underside less the knee's stack", "kind": "default", "source": "The stack", "checked": "2026-11-09"},
    "boss": {"value": 11.5, "unit": "mm", "rule": "The shin's boss, so its bar passes under the knee's clips", "kind": "default", "source": "EXAMPLES chapter 12's forearm", "checked": "2026-11-09"},
    "thigh": {"value": 100, "unit": "mm", "rule": "Hip to knee: past the 43 mm radius of each gearbox's posts, plus room to swing past one another", "kind": "default", "source": "EXAMPLES chapter 14", "checked": "2026-11-09"},
    "shin": {"value": 100, "unit": "mm", "rule": "Knee to the middle of the foot: as long as the thigh, the longest stride for the height", "kind": "default", "source": "EXAMPLES chapter 14", "checked": "2026-11-09"},
    "foot_r": {"value": 15, "unit": "mm", "rule": "The foot's round end, with its pad: rolls on the ground as the shin leans, so the gait's point stays over the contact", "kind": "default", "source": "EXAMPLES chapter 14", "checked": "2026-11-09"},
    "stance": {"value": 170, "unit": "mm", "rule": "Hip to the foot's centre, standing: the knee bent about 32° each way, its lever on the foot small", "kind": "default", "source": "EXAMPLES chapter 14", "checked": "2026-11-09"},
    "stride": {"value": 40, "unit": "mm", "rule": "The foot's travel in stance", "kind": "default", "source": "EXAMPLES chapter 14", "checked": "2026-11-09"},
    "lift": {"value": 15, "unit": "mm", "rule": "The foot's lift in swing", "kind": "default", "source": "EXAMPLES chapter 14", "checked": "2026-11-09"},
    "robot": {"value": 1.5, "unit": "kg", "rule": "The small robot the leg is sized for first; the quadruped built from these parts weighs more, and the chapter says how much", "kind": "default", "source": "EXAMPLES chapter 14", "checked": "2026-11-09"},
    "share": {"value": "robot / 2", "unit": "kg", "rule": "Each leg's share in a trot, the most: two feet down at once", "kind": "default", "source": "Statics: the weight split over the two feet in stance", "checked": "2026-11-09"},
    "riding": {"value": 1.01, "unit": "kg", "rule": "What rides the stand's rods, and so stands on the foot: the leg (its two 17HS4401s 560 g, its prints 295 g, the 6800 5 g), the carriage 92 g, its two LM8UU 32 g and the screws 24 g", "kind": "derived", "source": "cad list leg/stand, summed by hand", "checked": "2026-11-23"},
    "stand_load": {"value": "max(share, riding)", "unit": "kg", "rule": "The stand's load in its gait: the robot's share, or what rides the rods if that is more, since the foot carries all of it", "kind": "derived", "source": "Statics: the carriage, lifted off its stops, stands on the foot", "checked": "2026-11-23"},
    "scale_h": {"value": 25, "unit": "mm", "rule": "A kitchen scale's height: the foot's ground is its top. Yours differs", "kind": "estimate", "source": "A guess at a common 5 kg scale: measure yours", "checked": "2026-11-09"},
    "stop_drop": {"value": 3, "unit": "mm", "rule": "How far the carriage drops onto its stops when the foot lifts: the foot pushes it up this much standing, so the scale carries the leg", "kind": "default", "source": "EXAMPLES chapter 14", "checked": "2026-11-09"},
    "rod_x": {"value": 90, "unit": "mm", "rule": "Each rod's distance from the middle: a 130 mm scale fits between the feet", "kind": "default", "source": "EXAMPLES chapter 14", "checked": "2026-11-09"},
    "rod_y": {"value": 17, "unit": "mm", "rule": "The rods behind the carriage's face", "kind": "default", "source": "EXAMPLES chapter 14", "checked": "2026-11-09"},
    "rod_d": {"value": 8, "unit": "mm", "rule": "The rods' diameter", "kind": "community", "source": "rod-8 in @rulecad/rules", "checked": "2026-11-09"},
    "rod_long": {"value": 300, "unit": "mm", "rule": "The rods, cut to this: bench to above the carriage's travel", "kind": "default", "source": "EXAMPLES chapter 14", "checked": "2026-11-09"},
    "foot_block": {"value": 16, "unit": "mm", "rule": "The foot blocks' thickness: 12 mm of socket and a floor", "kind": "default", "source": "EXAMPLES chapter 14", "checked": "2026-11-09"},
    "body_half": {"value": 75, "unit": "mm", "rule": "Hip to hip along the body, halved: the side plate, 242 mm long, fits on a 256 mm bed, and the knees point outward so they stay apart", "kind": "default", "source": "EXAMPLES chapter 14", "checked": "2026-11-09"},
    "body_w": {"value": 50, "unit": "mm", "rule": "The body's half-width, to the hips' plates: two hip motors back to back fit inside", "kind": "default", "source": "EXAMPLES chapter 14", "checked": "2026-11-09"},
    "side_t": {"value": 6, "unit": "mm", "rule": "The side plate's thickness", "kind": "default", "source": "EXAMPLES chapter 14", "checked": "2026-11-09"},
    "robot_mass": {"value": 4.2, "unit": "kg", "rule": "The quadruped as drawn: 3.83 kg of prints, eight 17HS4401s, bearings and screws from cad list, and about 0.4 kg for its electronics (a Mega 2560, eight DRV8825s on their breakouts, none weighed), a battery and the wires, an estimate until built", "kind": "estimate", "source": "cad list leg/quadruped (3834 g, the knees 17HS4401s at 280 g each) and a guess at the electronics", "checked": "2026-11-23"},
    "foot_socket": {"value": 12, "unit": "mm", "rule": "How far each rod goes into a foot block", "kind": "default", "source": "EXAMPLES chapter 14", "checked": "2026-11-09"}
  }
}
```

```json projects/leg/project.json
{
  "name": "leg",
  "description": "A leg from the arm's parts: hip and knee from the same compound planetary, on a stand that reads its stance on a scale, and four of them as a quadruped. EXAMPLES chapter 14 explains it.",
  "material": "PLA",
  "objects": [
    "carriage",
    "foot",
    "tie",
    "collar",
    "housing",
    "sun",
    "planet",
    "output",
    "bridge",
    "spindle",
    "thigh",
    "clip",
    "shin",
    "pad",
    "side",
    "beam"
  ]
}
```

### The gearbox, as the arm's

The housing, the sun, the planets, the carrier that isn't printed, the output ring with its flange, the spindle with its shaft through a 6800, the bridge, and the clips are chapter 12's prints, read through this leg's rule set. The hip is the arm's shoulder and the knee the elbow, each turned on its side. Their screw holes are chapter 12's too, each from `v.fixings` by its thread: clearance holes, pilots, the cap heads' counterbores sunk a layer, and the spindle's countersinks, 6.82 mm across for an ISO 10642 head so it sits flush under the bridge, on the 48 mm disc that keeps 0.6 mm of edge round them.

```json projects/leg/objects/housing.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "housing",
  "title": "Shoulder housing and fixed ring",
  "version": "0.1.0",
  "uses": ["x1c", "leg"],
  "engine": "manifold",
  "orientation": "The motor plate on the bed, the ring and posts up",
  "anchors": {
    "f1": {"at": ["column_r * cosd(f1)", "column_r * sind(f1)", "plate"], "axis": [0, 0, 1]},
    "f2": {"at": ["column_r * cosd(f2)", "column_r * sind(f2)", "plate"], "axis": [0, 0, 1]},
    "f3": {"at": ["column_r * cosd(f3)", "column_r * sind(f3)", "plate"], "axis": [0, 0, 1]},
    "axis": {"at": [0, 0, "plate"], "axis": [0, 0, 1]},
    "motor": {"at": [0, 0, 0], "axis": [0, 0, 1], "ref": [1, 0, 0]}
  },
  "variables": {
    "plate": {"value": "leg.plate", "unit": "mm", "rule": "The motor plate", "interface": true},
    "gear": {"value": "leg.gear", "unit": "mm", "rule": "The fixed ring's face: strong enough for the motor's whole torque"},
    "rim": {"value": 62, "unit": "mm", "rule": "Round the 54-tooth ring, three lines and more of wall"},
    "module": {"value": 1, "unit": "mm", "rule": "The gears'"},
    "teeth": {"value": 54, "rule": "The fixed ring"},
    "post_r": {"value": 37, "unit": "mm", "rule": "Three posts outside the output ring", "interface": true},
    "post": {"value": 7, "unit": "mm", "rule": "Each post's diameter"},
    "post_high": {"value": "leg.bridge_low - 0 - plate", "unit": "mm", "rule": "From the plate to under the bridge", "interface": true},
    "pilot_depth": {"value": 8, "unit": "mm", "rule": "Each post's pilot, deep enough for the bridge's screw"},
    "column_r": {"value": 37, "unit": "mm", "rule": "Over the base's columns"},
    "lobe": {"value": 12, "unit": "mm", "rule": "The plate reaches out over each column"},
    "sink": {"value": "x1c.layer", "unit": "mm", "rule": "Each foot's screw head sits a layer under the plate's face"},
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

```js projects/leg/objects/housing.js
// The motor plate with the fixed ring and posts standing on it. The motor bolts underneath, its shaft up through the middle.
// The screws' holes are v.fixings': an M3 pilot in each post for the bridge, and an M3 clearance hole with its cap
// head's counterbore in each foot, sunk a layer, for the screw down into the plate under it.
import jscad from '@jscad/modeling'
const { cylinder, cylinderElliptic } = jscad.primitives
const { translate } = jscad.transforms

export function main (v) {
  const pilot = v.fixings.holeModel('M3', { kind: 'pilot' }).diameter, screw = v.fixings.holeModel('M3').diameter, cb = v.fixings.counterboreModel('M3 cap'), head = cb.diameter, headDepth = cb.depth + v.sink
  const motor = v.motors.motorModel('17HS4401')
  const at = (r, a) => [r * Math.cos(a), r * Math.sin(a)]
  const posts = [v.p1, v.p2, v.p3].map((a) => a * v.rad), feet = [v.f1, v.f2, v.f3].map((a) => a * v.rad)
  const plate = cylinder({ radius: v.rim / 2, height: v.plate, center: [0, 0, v.plate / 2], segments: v.ring_segments })
  const ring = translate([0, 0, v.plate], v.gears.internal({ module: v.module, teeth: v.teeth, width: v.gear, rim: v.rim }))
  const lobes = [...posts, ...feet].map((a) => cylinder({ radius: v.lobe / 2, height: v.plate, center: [...at(v.post_r, a), v.plate / 2], segments: v.segments }))
  const joins = [...posts, ...feet].map((a) => jscad.transforms.rotateZ(a, jscad.primitives.cuboid({ size: [v.post_r - v.rim / 2 + 2, v.lobe, v.plate], center: [(v.post_r + v.rim / 2 - 2) / 2, 0, v.plate / 2] })))
  const uprights = posts.map((a) => cylinder({ radius: v.post / 2, height: v.post_high + v.plate, center: [...at(v.post_r, a), (v.post_high + v.plate) / 2], segments: v.segments }))
  const pilots = posts.map((a) => cylinder({ radius: pilot / 2, height: v.pilot_depth, center: [...at(v.post_r, a), v.plate + v.post_high - v.pilot_depth / 2], segments: v.segments }))
  const screws = feet.map((a) => cylinder({ radius: screw / 2, height: v.plate + 1, center: [...at(v.column_r, a), v.plate / 2], segments: v.segments }))
  const heads = feet.map((a) => cylinder({ radius: head / 2, height: headDepth, center: [...at(v.column_r, a), v.plate - headDepth / 2], segments: v.segments }))
  // the pocket for the motor's boss would be bridged across: a 45° cone from its roof up through the plate needs no bridge
  const hole = v.motors.mountModel(motor, { plate: v.plate, counterbore: true }), rise = v.plate - hole.pocketDepth
  const roof = cylinderElliptic({ height: rise + 1, startRadius: [hole.pocket / 2, hole.pocket / 2], endRadius: [hole.pocket / 2 - rise - 1, hole.pocket / 2 - rise - 1], center: [0, 0, hole.pocketDepth + (rise + 1) / 2], segments: v.segments })
  return v.ops.subtract(v.ops.union(plate, ring, lobes, joins, uprights), v.motors.mount(motor, { plate: v.plate, counterbore: true }, v.ops), pilots, screws, heads, roof)
}
```

```json projects/leg/objects/sun.json
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

```js projects/leg/objects/sun.js
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

```json projects/leg/objects/planet.json
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

```js projects/leg/objects/planet.js
// A planet in two steps, in one piece, printed with the wider step on the bed.
import jscad from '@jscad/modeling'
const { translate } = jscad.transforms

export function main (v) {
  const high = v.gears.spur({ module: v.module, teeth: v.high, width: v.width })
  const low = translate([0, 0, v.width], v.gears.spur({ module: v.module, teeth: v.low, width: v.width, chamfer: v.low_chamfer }))
  return v.ops.union(high, low)
}
```

```json projects/leg/objects/speck.json
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
    "far": {"value": 110, "unit": "mm", "rule": "Out of the way, past the leg"}
  }
}
```

```js projects/leg/objects/speck.js
// Nothing is printed here: the planets ride on the sun and the rings. A mark for the planets' joints to be on.
import jscad from '@jscad/modeling'
const { sphere } = jscad.primitives

export function main (v) { return sphere({ radius: v.r, center: [0, 0, v.far] }) }
```

```json projects/leg/objects/output.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "output",
  "title": "Output ring and flange",
  "version": "0.1.0",
  "uses": ["x1c", "leg"],
  "engine": "manifold",
  "orientation": "The flange on the bed, the teeth standing on it",
  "description": "Printed flange down and fitted upside down: the same part on the shoulder and the elbow.",
  "anchors": {
    "axis": {"at": [0, 0, "top + width"], "axis": [0, 0, -1]},
    "flange": {"at": [0, 0, 0], "axis": [0, 0, -1]}
  },
  "variables": {
    "top": {"value": "leg.flange", "unit": "mm", "rule": "The flange, printed on the bed", "interface": true},
    "width": {"value": "leg.gear", "unit": "mm", "rule": "The output ring's face"},
    "rim": {"value": 66, "unit": "mm", "rule": "Round the 57-tooth ring"},
    "module": {"value": 1, "unit": "mm", "rule": "The gears'"},
    "teeth": {"value": 57, "rule": "The output ring"},
    "middle": {"value": 15, "unit": "mm", "rule": "A hole in the middle for the motor's shaft to come up in"},
    "bolt": {"value": 20, "unit": "mm", "rule": "Radius of the bolt circle", "interface": true},
    "segments": {"value": 24, "rule": "Small holes"},
    "ring_segments": {"value": 96, "rule": "Smooth to the eye and to the gear"},
    "quarter": {"value": 1.57079633, "rule": "The bolts, a quarter turn apart, in radians"},
    "bolts": {"value": 4, "rule": "Four"}
  }
}
```

```js projects/leg/objects/output.js
// The output ring, drawn as it prints: its flange on the bed, the teeth standing on it; it goes on upside down.
// Its four holes are v.fixings' M3 pilots, through the flange: the spindle's screws cut their thread in them.
import jscad from '@jscad/modeling'
const { cylinder } = jscad.primitives
const { translate } = jscad.transforms

export function main (v) {
  const pilot = v.fixings.holeModel('M3', { kind: 'pilot' }).diameter
  const flange = cylinder({ radius: v.rim / 2, height: v.top, center: [0, 0, v.top / 2], segments: v.ring_segments })
  const ring = translate([0, 0, v.top], v.gears.internal({ module: v.module, teeth: v.teeth, width: v.width, rim: v.rim }))
  const holes = Array.from({ length: v.bolts }, (_, k) => cylinder({ radius: pilot / 2, height: v.top + 1, center: [v.bolt * Math.cos(k * v.quarter), v.bolt * Math.sin(k * v.quarter), v.top / 2], segments: v.segments }))
  const middle = cylinder({ radius: v.middle / 2, height: v.top + 1, center: [0, 0, v.top / 2], segments: v.ring_segments })
  return v.ops.subtract(v.ops.union(flange, ring), holes, middle)
}
```

```json projects/leg/objects/bridge.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "bridge",
  "title": "Bridge: the 6800's seat",
  "version": "0.1.0",
  "uses": ["x1c", "leg"],
  "engine": "manifold",
  "orientation": "Upside to the sky, as it goes on: the pocket opens upward and its ledge prints flat",
  "description": "Three arms across the housing's posts, holding the bearing that takes the output's tipping load.",
  "anchors": {
    "s1": {"at": ["post_r * cosd(p1)", "post_r * sind(p1)", "thick"], "axis": [0, 0, 1]},
    "s2": {"at": ["post_r * cosd(p2)", "post_r * sind(p2)", "thick"], "axis": [0, 0, 1]},
    "s3": {"at": ["post_r * cosd(p3)", "post_r * sind(p3)", "thick"], "axis": [0, 0, 1]},
    "seat": {"at": [0, 0, "thick - width"], "axis": [0, 0, 1]},
    "under": {"at": [0, 0, 0], "axis": [0, 0, 1]}
  },
  "variables": {
    "thick": {"value": "leg.bridge", "unit": "mm", "rule": "The bearing's width and a ledge", "interface": true},
    "bore": {"value": "leg.bearing_bore", "unit": "mm", "rule": "The 6800's bore"},
    "outer": {"value": "leg.bearing_outer", "unit": "mm", "rule": "The 6800's outside"},
    "width": {"value": "leg.bearing_width", "unit": "mm", "rule": "The 6800's width"},
    "relief": {"value": "thick - width", "unit": "mm", "rule": "Through the ledge, so the seat prints without a bridge"},
    "hub": {"value": 34, "unit": "mm", "rule": "Round the pocket, three lines and more of wall"},
    "post_r": {"value": 37, "unit": "mm", "rule": "On the housing's posts"},
    "lobe": {"value": 12, "unit": "mm", "rule": "Each arm's width"},
    "p1": {"value": 30, "unit": "°", "rule": "First post"},
    "p2": {"value": 150, "unit": "°", "rule": "Second post"},
    "p3": {"value": 270, "unit": "°", "rule": "Third post"},
    "rad": {"value": 0.017453293, "rule": "Radians in a degree"},
    "sink": {"value": "x1c.layer", "unit": "mm", "rule": "Each screw head sits a layer under the face, so the thigh passes over"},
    "segments": {"value": 64, "rule": "Round enough"}
  }
}
```

```js projects/leg/objects/bridge.js
// A three-armed plate over the gearbox, the bearing's seat in the middle.
// Each post's screw: an M3 clearance hole and its cap head's counterbore, sunk a layer, both v.fixings'.
import jscad from '@jscad/modeling'
const { cylinder, cuboid } = jscad.primitives
const { rotateZ } = jscad.transforms

export function main (v) {
  const screw = v.fixings.holeModel('M3').diameter, cb = v.fixings.counterboreModel('M3 cap'), head = cb.diameter, headDepth = cb.depth + v.sink
  const posts = [v.p1, v.p2, v.p3].map((a) => a * v.rad), at = (a) => [v.post_r * Math.cos(a), v.post_r * Math.sin(a)]
  const hub = cylinder({ radius: v.hub / 2, height: v.thick, center: [0, 0, v.thick / 2], segments: v.segments * 2 })
  const arms = posts.map((a) => rotateZ(a, cuboid({ size: [v.post_r, v.lobe, v.thick], center: [v.post_r / 2, 0, v.thick / 2] })))
  const lobes = posts.map((a) => cylinder({ radius: v.lobe / 2, height: v.thick, center: [...at(a), v.thick / 2], segments: v.segments }))
  const seat = v.shapes.bearingSeat({ bore: v.bore, outer_diameter: v.outer, width: v.width }, { fit: 'press', relief: v.relief, through: true, printer: v.x1c, at: [0, 0, v.thick], into: '-z', lead: 0 })
  const screws = posts.map((a) => cylinder({ radius: screw / 2, height: v.thick + 1, center: [...at(a), v.thick / 2], segments: v.segments }))
  const heads = posts.map((a) => cylinder({ radius: head / 2, height: headDepth + 1, center: [...at(a), v.thick - (headDepth - 1) / 2], segments: v.segments }))
  return v.ops.subtract(v.ops.union(hub, arms, lobes), seat, screws, heads)
}
```

```json projects/leg/objects/spindle.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "spindle",
  "title": "Spindle: disc and shaft",
  "version": "0.1.0",
  "uses": ["x1c", "leg"],
  "engine": "manifold",
  "orientation": "The disc on the bed, the shaft up, as it goes on",
  "description": "The output's flange turns the spindle; the spindle's shaft runs in the 6800 and carries the thigh on a hexagon at its top.",
  "anchors": {
    "b1": {"at": ["bolt", 0, "disc"], "axis": [0, 0, 1]},
    "b2": {"at": [0, "bolt", "disc"], "axis": [0, 0, 1]},
    "b3": {"at": ["0 - bolt", 0, "disc"], "axis": [0, 0, 1]},
    "b4": {"at": [0, "0 - bolt", "disc"], "axis": [0, 0, 1]},
    "down": {"at": [0, 0, 0], "axis": [0, 0, 1], "ref": [1, 0, 0]},
    "seat": {"at": [0, 0, "collar_top + width"], "axis": [0, 0, 1], "ref": [1, 0, 0]}
  },
  "variables": {
    "disc": {"value": "leg.disc", "unit": "mm", "rule": "Thick enough for the countersinks, with a wall of screw hole under each"},
    "rim": {"value": 48, "unit": "mm", "rule": "Round the 40 mm bolt circle and its countersinks, 6.82 mm across, with a 0.6 mm edge outside them"},
    "bolt": {"value": 20, "unit": "mm", "rule": "On the output's bolt circle"},
    "shaft": {"value": "leg.bearing_bore - x1c.press", "unit": "mm", "rule": "A close slide into the bearing's bore, clamped end to end by the thigh's screw"},
    "width": {"value": "leg.bearing_width", "unit": "mm", "rule": "The bearing"},
    "collar_top": {"value": "leg.bridge_low + leg.bridge - width - leg.output_top", "unit": "mm", "rule": "Where the inner race rests, above the disc's underside"},
    "shoulder": {"value": 13, "unit": "mm", "rule": "Stops the inner race; clears the outer race"},
    "hex": {"value": 8, "unit": "mm", "rule": "Hexagon across its flats: inside the bore, drives the thigh"},
    "hex_long": {"value": 5, "unit": "mm", "rule": "Into the thigh's socket"},
    "pilot_depth": {"value": 12, "unit": "mm", "rule": "The pilot in the hexagon's top, for the thigh's screw"},
    "cos30": {"value": "cosd(30)", "rule": "A hexagon, across corners to across flats"},
    "bolts": {"value": 4, "rule": "On the bolt circle"},
    "quarter": {"value": 1.57079633, "rule": "A quarter turn in radians"},
    "segments": {"value": 64, "rule": "Round enough"},
    "hex_segments": {"value": 6, "rule": "A hexagon's sides"}
  }
}
```

```js projects/leg/objects/spindle.js
// A disc on the output's flange and a shaft up through the bearing, a hexagon at its top for the arm.
// The screws are v.fixings': four M3 countersunk screws down through the disc into the output's flange, each hole's
// countersink as wide as an ISO 10642 head so it sits flush, and an M3 pilot in the hexagon's top for the thigh's screw.
import jscad from '@jscad/modeling'
const { cylinder } = jscad.primitives

export function main (v) {
  const pilotD = v.fixings.holeModel('M3', { kind: 'pilot' }).diameter
  const plate = cylinder({ radius: v.rim / 2, height: v.disc, center: [0, 0, v.disc / 2], segments: v.segments * 2 })
  const top = v.collar_top + v.width
  const shaft = cylinder({ radius: v.shaft / 2, height: top - 1, center: [0, 0, (top + 1) / 2], segments: v.segments * 2 })
  const collar = v.shapes.shaftShoulder(v.shaft, { shoulder: v.shoulder, height: v.collar_top - v.disc, at: [0, 0, v.collar_top] })
  const hex = cylinder({ radius: v.hex / 2 / v.cos30, height: v.hex_long, center: [0, 0, top + v.hex_long / 2], segments: v.hex_segments })
  const screws = Array.from({ length: v.bolts }, (_, k) => {
    const c = [v.bolt * Math.cos(k * v.quarter), v.bolt * Math.sin(k * v.quarter), v.disc]
    return v.fixings.countersink('M3', { length: v.disc + 1, at: c, into: '-z' })
  })
  const pilot = cylinder({ radius: pilotD / 2, height: v.pilot_depth, center: [0, 0, top + v.hex_long - v.pilot_depth / 2], segments: v.segments })
  return v.ops.subtract(v.ops.union(plate, shaft, collar, hex), screws, pilot)
}
```

```json projects/leg/objects/clip.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "clip",
  "title": "Retaining clip",
  "version": "0.1.0",
  "uses": ["x1c"],
  "orientation": "Flat on the bed",
  "description": "Holds the knee's output ring from dropping off its posts.",
  "anchors": {
    "post": {"at": [0, 0, 0], "axis": [0, 0, 1], "ref": [1, 0, 0]}
  },
  "variables": {
    "reach": {"value": 6, "unit": "mm", "rule": "In over the flange's edge, 4 mm"},
    "back": {"value": 4, "unit": "mm", "rule": "Round the post"},
    "wide": {"value": 8, "unit": "mm", "rule": "As wide as the post and a little"},
    "thick": {"value": 3, "unit": "mm", "rule": "Fifteen layers"},
    "segments": {"value": 24, "rule": "Small round hole"}
  }
}
```

```js projects/leg/objects/clip.js
// A flat tab screwed to a post, its nose over the flange.
// Its screw's hole is v.fixings' M3 clearance hole.
import jscad from '@jscad/modeling'
const { cuboid, cylinder } = jscad.primitives
const { subtract } = jscad.booleans

export function main (v) {
  const hole = v.fixings.holeModel('M3').diameter
  const tab = cuboid({ size: [v.reach + v.back, v.wide, v.thick], center: [(v.back - v.reach) / 2, 0, v.thick / 2] })
  return subtract(tab, cylinder({ radius: hole / 2, height: v.thick + 1, center: [0, 0, v.thick / 2], segments: v.segments }))
}
```

### The thigh, the shin and the foot

The thigh is the arm's upper arm, 100 mm long, without its home switch or bands. The shin is new, and its four screws into the knee's output are sunk 1.5 mm in their counterbores, as the forearm's are, so an M3x12 takes the whole flange and stops short of the planets. It is a tapered bar from the knee's flange to a disc, printed flat, so the bending under a foot's load runs along the layers. A disc for a foot means the contact rolls as the shin leans, so a point at the disc's centre stays over the ground: that centre is the `tip` the gait moves, and `height` is the hip to that centre. The pad is TPU, printed lying down, its ridge snapping into a groove round the disc so a wet floor can't pull it off and PLA doesn't skate on a scale's top.

```json projects/leg/objects/thigh.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "thigh",
  "title": "Thigh",
  "version": "0.1.0",
  "uses": ["x1c", "leg"],
  "engine": "manifold",
  "orientation": "The thigh's outer face on the bed: the hub, the knee's fixed ring and its posts all rise from the one flat face",
  "description": "From the hip's hexagon to the knee's motor. The drawing arm's upper arm, shorter and without its home switch or bands: printed as one part with the knee's fixed ring, so the knee's gearbox costs a sun, three planets and an output ring.",
  "anchors": {
    "hub": {"at": [0, 0, "thick + collar"], "axis": [0, 0, -1], "ref": [1, 0, 0]},
    "knee": {"at": ["long", 0, "thick"], "axis": [0, 0, 1], "ref": [1, 0, 0]},
    "output": {"at": ["long", 0, "thick + gear + arm_gap"], "axis": [0, 0, 1], "ref": [1, 0, 0]},
    "motor": {"at": ["long", 0, 0], "axis": [0, 0, 1], "ref": [1, 0, 0]},
    "clip1": {"at": ["long + post_r * cosd(p1)", "post_r * sind(p1)", "clip_at"], "axis": [0, 0, 1], "ref": ["cosd(p1)", "sind(p1)", 0]},
    "clip2": {"at": ["long + post_r * cosd(p2)", "post_r * sind(p2)", "clip_at"], "axis": [0, 0, 1], "ref": ["cosd(p2)", "sind(p2)", 0]},
    "clip3": {"at": ["long + post_r * cosd(p3)", "post_r * sind(p3)", "clip_at"], "axis": [0, 0, 1], "ref": ["cosd(p3)", "sind(p3)", 0]},
    "cable": {"at": ["long / 2", 0, 0], "axis": [0, 0, 1]}
  },
  "variables": {
    "long": {"value": "leg.thigh", "unit": "mm", "rule": "Hip to knee", "label": "Thigh", "show": true, "interface": true},
    "neck": {"value": 22, "unit": "mm", "rule": "The thigh's width at the knee: its bending under the stance load is in the chapter"},
    "hub": {"value": 36, "unit": "mm", "rule": "Round the hexagon socket"},
    "collar": {"value": "leg.arm_gap", "unit": "mm", "rule": "A collar on the thigh's underside, on the bearing's inner race, so the outer race doesn't drag"},
    "collar_d": {"value": 13.5, "unit": "mm", "rule": "On the inner race, clear of the outer"},
    "hex": {"value": 8, "unit": "mm", "rule": "The spindle's hexagon"},
    "hex_depth": {"value": "thick + collar - floor", "unit": "mm", "rule": "The socket's depth"},
    "floor": {"value": 3, "unit": "mm", "rule": "What the screw pulls against: a socket's floor"},
    "hex_fit": {"value": "x1c.fit + x1c.hole_comp", "unit": "mm", "rule": "Across the socket's flats, over the spindle's, printed"},
    "gear": {"value": "leg.gear", "unit": "mm", "rule": "The fixed ring's face"},
    "arm_gap": {"value": "leg.ring_gap", "unit": "mm", "rule": "Between the fixed ring and the output ring"},
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
    "clip_at": {"value": "thick + gear + arm_gap + gear + leg.flange + clip_gap", "unit": "mm", "rule": "Each post's tip, where its clip goes on, just past the output's flange"},
    "clip_gap": {"value": 0.3, "unit": "mm", "rule": "The output turns under the clips with this to spare"},
    "pilot_depth": {"value": 8, "unit": "mm", "rule": "Each post's pilot, deep enough for its clip's screw"},
    "segments": {"value": 64, "rule": "Round enough"},
    "ring_segments": {"value": 96, "rule": "The rim's circle"},
    "hex_segments": {"value": 6, "rule": "A hexagon's sides"},
    "cos30": {"value": "cosd(30)", "rule": "A hexagon, across corners to across flats"},
    "thick": {"value": "leg.arm", "unit": "mm", "rule": "The thigh's thickness, and the knee motor's plate: 16 lines of 0.42 and 40 layers"}
  }
}
```

```js projects/leg/objects/thigh.js
// The thigh, drawn as it prints: its outer face on the bed, the knee's ring standing on it, the hub's socket opening
// upward. The knee's 17HS4401, the hip's motor, bolts on the bed side, its shaft up through the plate, as the arm's elbow does.
// The screws' holes are v.fixings': an M3 clearance hole through the socket's floor for the screw into the spindle,
// and an M3 pilot in each post for its clip.
import jscad from '@jscad/modeling'
const { cylinder, cylinderElliptic, cuboid, circle } = jscad.primitives
const { translate, rotateZ } = jscad.transforms
const { extrudeLinear } = jscad.extrusions
const { hull } = jscad.hulls

export function main (v) {
  const screw = v.fixings.holeModel('M3').diameter, pilot = v.fixings.holeModel('M3', { kind: 'pilot' }).diameter
  const motor = v.motors.motorModel('17HS4401')
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
  const pilots = posts.map((a) => cylinder({ radius: pilot / 2, height: v.pilot_depth, center: [...at(v.post_r, a), v.clip_at - v.pilot_depth / 2], segments: v.segments }))
  const collar = cylinder({ radius: v.collar_d / 2, height: v.collar + 1, center: [0, 0, v.thick + (v.collar - 1) / 2], segments: v.segments })
  const socket = cylinder({ radius: (v.hex + v.hex_fit) / 2 / v.cos30, height: v.hex_depth + 1, center: [0, 0, v.floor + (v.hex_depth + 1) / 2], segments: v.hex_segments })
  const through = cylinder({ radius: screw / 2, height: v.floor + 1, center: [0, 0, (v.floor - 1) / 2], segments: v.segments })
  const hole = v.motors.mountModel(motor, { plate: v.thick, counterbore: true }), rise = v.thick - hole.pocketDepth
  const roof = translate([v.long, 0, 0], cylinderElliptic({ height: rise + 1, startRadius: [hole.pocket / 2, hole.pocket / 2], endRadius: [hole.pocket / 2 - rise - 1, hole.pocket / 2 - rise - 1], center: [0, 0, hole.pocketDepth + (rise + 1) / 2], segments: v.segments }))
  const mount = translate([v.long, 0, 0], v.motors.mount(motor, { plate: v.thick, counterbore: true }, v.ops))
  return v.ops.subtract(v.ops.union(neck, hub, plate, ring, lobes, joins, uprights, collar), socket, through, pilots, mount, roof)
}
```

```json projects/leg/objects/shin.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "shin",
  "title": "Shin and foot",
  "version": "0.1.0",
  "uses": ["x1c", "leg"],
  "engine": "manifold",
  "orientation": "The bar and the foot flat on the bed, the boss up. The foot's V groove at 45° needs no support",
  "description": "From the knee's output flange to a round foot: a bar in one piece with the disc the grip pad snaps round.",
  "anchors": {
    "b1": {"at": ["bolt", 0, 0], "axis": [0, 0, 1]},
    "b2": {"at": [0, "bolt", 0], "axis": [0, 0, 1]},
    "b3": {"at": ["0 - bolt", 0, 0], "axis": [0, 0, 1]},
    "b4": {"at": [0, "0 - bolt", 0], "axis": [0, 0, 1]},
    "hub": {"at": [0, 0, "boss"], "axis": [0, 0, -1], "ref": [1, 0, 0]},
    "tip": {"at": ["long", 0, "foot_w / 2"], "axis": [0, 0, 1], "ref": [1, 0, 0]},
    "pad": {"at": ["long", 0, 0], "axis": [0, 0, 1], "ref": [1, 0, 0]},
    "cable": {"at": ["long / 2", 0, "bar"], "axis": [0, 0, 1]}
  },
  "variables": {
    "long": {"value": "leg.shin", "unit": "mm", "rule": "Knee to the foot's centre", "label": "Shin", "show": true, "interface": true},
    "bar": {"value": 8, "unit": "mm", "rule": "The bar's thickness, sized in the chapter: 2 MPa under the worst stance load"},
    "wide": {"value": 20, "unit": "mm", "rule": "The bar's width at the knee"},
    "toe": {"value": 16, "unit": "mm", "rule": "Its width at the foot: tapered, as the bending falls to nothing at the foot"},
    "boss": {"value": "leg.boss", "unit": "mm", "rule": "The bar passes under the knee's clips, the boss above reaches the flange"},
    "boss_d": {"value": 46, "unit": "mm", "rule": "Round the 40 mm bolt circle"},
    "sink": {"value": 1.5, "unit": "mm", "rule": "Each screw head sits this far into the boss, so an M3x12 engages the whole flange and its tip stops at the flange's far face, clear of the planets"},
    "bolt": {"value": 20, "unit": "mm", "rule": "The output's bolt circle, radius"},
    "bolts": {"value": 4, "rule": "On the bolt circle"},
    "quarter": {"value": 1.57079633, "rule": "A quarter turn in radians"},
    "foot_w": {"value": 14, "unit": "mm", "rule": "The foot's width across the leg: wide enough to stand on the pad's tread", "interface": true},
    "foot_r": {"value": "leg.foot_r - pad_t", "unit": "mm", "rule": "The disc's radius, under the pad"},
    "pad_t": {"value": 3, "unit": "mm", "rule": "The pad's thickness, its tread included", "interface": true},
    "groove": {"value": 1, "unit": "mm", "rule": "The V groove the pad's ridge locks into, 1 mm deep: at 45° it prints without support", "interface": true},
    "segments": {"value": 64, "rule": "Round enough"}
  }
}
```

```js projects/leg/objects/shin.js
// A tapered bar from the knee's boss to a round foot, flat on the bed. The foot's rim has a V groove for the pad's ridge.
// The four screws into the knee's output are v.fixings': M3 clearance holes with their cap heads' counterbores.
import jscad from '@jscad/modeling'
const { cylinder, circle, polygon } = jscad.primitives
const { translate } = jscad.transforms
const { extrudeLinear, extrudeRotate } = jscad.extrusions
const { hull } = jscad.hulls

export function main (v) {
  const screw = v.fixings.holeModel('M3').diameter, cb = v.fixings.counterboreModel('M3 cap'), head = cb.diameter, headDepth = cb.depth + v.sink
  const dot = (r, x) => translate([x, 0], circle({ radius: r, segments: v.segments }))
  const bar = extrudeLinear({ height: v.bar }, hull(dot(v.wide / 2, 0), dot(v.toe / 2, v.long)))
  const boss = cylinder({ radius: v.boss_d / 2, height: v.boss, center: [0, 0, v.boss / 2], segments: v.segments * 2 })
  const r = v.foot_r, mid = v.foot_w / 2, g = v.groove
  const foot = translate([v.long, 0, 0], extrudeRotate({ segments: v.segments }, polygon({ points: [[0, 0], [r, 0], [r, mid - g], [r - g, mid], [r, mid + g], [r, v.foot_w], [0, v.foot_w]] })))
  const bolts = Array.from({ length: v.bolts }, (_, k) => cylinder({ radius: screw / 2, height: v.boss + 1, center: [v.bolt * Math.cos(k * v.quarter), v.bolt * Math.sin(k * v.quarter), v.boss / 2], segments: v.segments }))
  const heads = Array.from({ length: v.bolts }, (_, k) => cylinder({ radius: head / 2, height: headDepth + 1, center: [v.bolt * Math.cos(k * v.quarter), v.bolt * Math.sin(k * v.quarter), (headDepth - 1) / 2], segments: v.segments }))
  return v.ops.subtract(v.ops.union(bar, boss, foot), bolts, heads)
}
```

```json projects/leg/objects/pad.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "pad",
  "title": "Grip pad",
  "version": "0.1.0",
  "uses": ["x1c", "leg"],
  "engine": "manifold",
  "material": "TPU",
  "orientation": "On one flat side: a C with its tread across the layers. TPU, 95A: PLA on a kitchen scale would slip",
  "description": "A printed tread that snaps round the foot's disc, its inner ridge in the disc's groove. It takes the ground's push and bends a little under it.",
  "anchors": {
    "axis": {"at": [0, 0, 0], "axis": [0, 0, 1], "ref": [1, 0, 0]}
  },
  "variables": {
    "width": {"value": 14, "unit": "mm", "rule": "The foot's width, the disc's", "interface": true},
    "inner": {"value": "leg.foot_r - 3", "unit": "mm", "rule": "The disc's radius"},
    "outer": {"value": "leg.foot_r", "unit": "mm", "rule": "Out to the tread"},
    "grip": {"value": 0.05, "unit": "mm", "rule": "How much the pad's bore is under the disc: TPU stretches, and it stays on"},
    "ridge": {"value": 1, "unit": "mm", "rule": "The ridge in the groove, 45°"},
    "sweep": {"value": 200, "unit": "°", "rule": "Round the disc: past half way, so it snaps on and stays"},
    "rad": {"value": 0.017453293, "rule": "Radians in a degree"},
    "ribs": {"value": 11, "rule": "Cuts across the tread, each a little more edge on the ground"},
    "rib_w": {"value": 1.2, "unit": "mm", "rule": "Each cut's width: three lines of 0.4"},
    "rib_d": {"value": 1, "unit": "mm", "rule": "Each cut's depth, a third of the pad's thickness"},
    "segments": {"value": 64, "rule": "Round enough"}
  }
}
```

```js projects/leg/objects/pad.js
// A C of TPU, printed lying down: its bore has a 45° ridge that snaps into the foot's groove, and ribs across its tread.
import jscad from '@jscad/modeling'
const { polygon, cuboid } = jscad.primitives
const { translate, rotateZ } = jscad.transforms
const { extrudeRotate } = jscad.extrusions

export function main (v) {
  const mid = v.width / 2, r = v.inner - v.grip, g = v.ridge
  const arc = v.sweep * v.rad
  const ring = extrudeRotate({ segments: v.segments, startAngle: -arc / 2 - Math.PI / 2, angle: arc }, polygon({ points: [[r, 0], [v.outer, 0], [v.outer, v.width], [r, v.width], [r, mid + g], [r - g, mid], [r, mid - g]] }))
  const n = v.ribs
  const cuts = Array.from({ length: n }, (_, k) => rotateZ(-arc / 2 - Math.PI / 2 + (arc * (k + 1)) / (n + 1), cuboid({ size: [v.rib_d * 2, v.rib_w, v.width + 1], center: [v.outer, 0, mid] })))
  return v.ops.subtract(ring, cuts)
}
```

### The stand

A carriage rides up two 8 mm rods on two LM8UU bushings; the hip's housing screws to its face and the hip motor goes through a window in the middle. A foot block holds each rod to the bench and a tie across their tops stops them leaning. The scale sits on the bench under the foot, between the two feet; a collar on each rod is the stop the carriage rests on when the foot lifts. The housing's three screws cut their thread in M3 pilots through the carriage's plate, the foot blocks take M5 bolts to the bench through clearance holes of 5.6 mm, and the collar's clamp screw crosses its slot in an M3 clearance hole drawn as a teardrop, all from `v.fixings`.

In this design the body's frame is the world: the hip is at the origin, so the gait's targets are in the body's frame as they should be, and the stand hangs off it rather than the other way round. That is why nothing joins the carriage to the rods: the slide is real on the bench, but the check treats the frame as still and the leg as stepping from it.

```json projects/leg/objects/carriage.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "carriage",
  "title": "Stand carriage: the leg's mount on two rods",
  "version": "0.1.0",
  "uses": ["x1c", "leg", "lm8uu"],
  "engine": "manifold",
  "orientation": "The hip's face on the bed, the bosses up; each bearing pocket is a teardrop across the layers",
  "description": "A plate on two LM8UU bushings. The hip housing screws to its face and the hip's motor goes through its middle. It rides up the rods as the foot pushes, so the scale reads the leg.",
  "anchors": {
    "hip": {"at": [0, 0, 0], "axis": [0, 0, -1], "ref": [1, 0, 0]},
    "cable": {"at": ["half_w", 0, 0], "axis": [0, 0, -1]}
  },
  "variables": {
    "plate": {"value": 8, "unit": "mm", "rule": "The plate's thickness: the housing's three screws bite here and carry the leg into the bushings"},
    "feet_r": {"value": 37, "unit": "mm", "rule": "The housing's three feet", "interface": true},
    "hub": {"value": 46, "unit": "mm", "rule": "The plate's round middle: past the feet, for the screws"},
    "arm_w": {"value": 24, "unit": "mm", "rule": "The arms' width, out to the bosses"},
    "half_w": {"value": "leg.rod_x + boss_x", "unit": "mm", "rule": "To the far side of a boss"},
    "boss_x": {"value": 11, "unit": "mm", "rule": "Half a boss's width"},
    "boss_long": {"value": 26, "unit": "mm", "rule": "A boss along the rod: 24 mm of bushing and a 2 mm wall with the rod's hole at the far end"},
    "boss_h": {"value": "leg.rod_y + boss_x", "unit": "mm", "rule": "Up from the face, past the bushing"},
    "rod_x": {"value": "leg.rod_x", "unit": "mm", "rule": "Each rod"},
    "rod_y": {"value": "leg.rod_y", "unit": "mm", "rule": "The rods' distance behind the face"},
    "cut": {"value": 44.5, "unit": "mm", "rule": "The motor's way through: a NEMA 17 and 1.1 mm each side"},
    "corner": {"value": 3, "unit": "mm", "rule": "Round the corners of the motor's window"},
    "a1": {"value": 90, "unit": "°", "rule": "The housing's first foot"},
    "a2": {"value": 210, "unit": "°", "rule": "Second"},
    "a3": {"value": 330, "unit": "°", "rule": "Third"},
    "rad": {"value": 0.017453293, "rule": "Radians in a degree"},
    "segments": {"value": 48, "rule": "Round enough"}
  }
}
```

```js projects/leg/objects/carriage.js
// A round hub for the hip, arms out to two bushing bosses, the hip's face down on the bed.
// The housing's three screws cut their thread in v.fixings' M3 pilots, through the plate.
import jscad from '@jscad/modeling'
const { cylinder, cuboid, roundedRectangle } = jscad.primitives
const { extrudeLinear } = jscad.extrusions

export function main (v) {
  const pilot = v.fixings.holeModel('M3', { kind: 'pilot' }).diameter
  const arms = cuboid({ size: [v.half_w * 2, v.arm_w, v.plate], center: [0, 0, v.plate / 2] })
  const hub = cylinder({ radius: v.hub, height: v.plate, center: [0, 0, v.plate / 2], segments: v.segments * 2 })
  const bosses = [-1, 1].map((s) => cuboid({ size: [v.boss_x * 2, v.boss_long, v.boss_h], center: [s * v.rod_x, 0, v.boss_h / 2] }))
  const window = extrudeLinear({ height: v.plate + 1 }, roundedRectangle({ size: [v.cut, v.cut], roundRadius: v.corner, segments: v.segments }))
  const feet = [v.a1, v.a2, v.a3].map((a) => a * v.rad).map((a) => cylinder({ radius: pilot / 2, height: v.plate + 1, center: [v.feet_r * Math.cos(a), 0 - v.feet_r * Math.sin(a), v.plate / 2], segments: v.segments }))
  const pockets = [-1, 1].map((s) => v.shapes.lm8uuPocket(v.lm8uu, { printer: v.x1c, at: [s * v.rod_x, 0 - v.boss_long / 2, v.rod_y], into: '+y', through: true }))
  return v.ops.subtract(v.ops.union(arms, hub, bosses), window, feet, pockets)
}
```

```json projects/leg/objects/foot.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "foot",
  "title": "Stand foot block",
  "version": "0.1.0",
  "uses": ["x1c", "leg"],
  "engine": "manifold",
  "orientation": "Flat on the bed, the rod's socket opening up",
  "description": "Holds a rod upright, and bolts to the bench through two holes.",
  "variables": {
    "long": {"value": 36, "unit": "mm", "rule": "Along the bench: the rod and a bolt each side"},
    "wide": {"value": 26, "unit": "mm", "rule": "Across: the socket and the bolts"},
    "thick": {"value": "leg.foot_block", "unit": "mm", "rule": "The socket's depth and a floor"},
    "socket": {"value": "leg.rod_d + x1c.hole_comp", "unit": "mm", "rule": "The rod, a press into the printed bore"},
    "depth": {"value": "leg.foot_socket", "unit": "mm", "rule": "How far the rod goes in"},
    "bolt_x": {"value": 12, "unit": "mm", "rule": "The bolts, either side of the rod"},
    "corner": {"value": 4, "unit": "mm", "rule": "The block's corners, rounded"},
    "segments": {"value": 48, "rule": "Round enough"}
  }
}
```

```js projects/leg/objects/foot.js
// A block with a rod's socket in the top and a bolt through each end.
// The bolts' holes are v.fixings' M5 clearance holes.
import jscad from '@jscad/modeling'
const { cylinder, roundedRectangle } = jscad.primitives
const { extrudeLinear } = jscad.extrusions

export function main (v) {
  const bolt = v.fixings.holeModel('M5').diameter
  const block = extrudeLinear({ height: v.thick }, roundedRectangle({ size: [v.long, v.wide], roundRadius: v.corner, segments: v.segments }))
  const socket = cylinder({ radius: v.socket / 2, height: v.depth + 1, center: [0, 0, v.thick - v.depth + (v.depth + 1) / 2], segments: v.segments })
  const bolts = [-1, 1].map((s) => cylinder({ radius: bolt / 2, height: v.thick + 1, center: [s * v.bolt_x, 0, v.thick / 2], segments: v.segments }))
  return v.ops.subtract(block, socket, bolts)
}
```

```json projects/leg/objects/tie.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "tie",
  "title": "Stand top tie",
  "version": "0.1.0",
  "uses": ["x1c", "leg"],
  "engine": "manifold",
  "orientation": "Flat on the bed, the rods up through it",
  "description": "A bar across the tops of the two rods, so they cannot lean apart.",
  "variables": {
    "long": {"value": "leg.rod_x * 2 + width * 2", "unit": "mm", "rule": "From rod to rod, and a width past each"},
    "width": {"value": 20, "unit": "mm", "rule": "Across the bar"},
    "thick": {"value": 8, "unit": "mm", "rule": "Thick enough not to flex"},
    "socket": {"value": "leg.rod_d + x1c.hole_comp", "unit": "mm", "rule": "The rod, pressed through"},
    "rod_x": {"value": "leg.rod_x", "unit": "mm", "rule": "Each rod"},
    "corner": {"value": 5, "unit": "mm", "rule": "The bar's corners"},
    "segments": {"value": 48, "rule": "Round enough"}
  }
}
```

```js projects/leg/objects/tie.js
// A flat bar with a hole at each end, pressed down over the tops of the rods.
import jscad from '@jscad/modeling'
const { cylinder, roundedRectangle } = jscad.primitives
const { extrudeLinear } = jscad.extrusions

export function main (v) {
  const bar = extrudeLinear({ height: v.thick }, roundedRectangle({ size: [v.long, v.width], roundRadius: v.corner, segments: v.segments }))
  const holes = [-1, 1].map((s) => cylinder({ radius: v.socket / 2, height: v.thick + 1, center: [s * v.rod_x, 0, v.thick / 2], segments: v.segments }))
  return v.ops.subtract(bar, holes)
}
```

```json projects/leg/objects/collar.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "collar",
  "title": "Rod collar: the carriage's stop",
  "version": "0.1.0",
  "uses": ["x1c", "leg"],
  "engine": "manifold",
  "orientation": "Flat on the bed, the rod's hole upright, the clamp's slot through one side",
  "description": "Set on a rod under the carriage: the carriage drops onto it when the foot lifts, so the foot really leaves the scale.",
  "variables": {
    "bore": {"value": "leg.rod_d + x1c.hole_comp", "unit": "mm", "rule": "The rod"},
    "outer": {"value": 22, "unit": "mm", "rule": "Round the rod, wall enough to take the screw"},
    "high": {"value": 10, "unit": "mm", "rule": "Along the rod"},
    "slot": {"value": 1.5, "unit": "mm", "rule": "The slot the clamp screw closes"},
    "screw_out": {"value": 8, "unit": "mm", "rule": "The screw, clear of the rod"},
    "segments": {"value": 48, "rule": "Round enough"}
  }
}
```

```js projects/leg/objects/collar.js
// A ring with a slot and a screw across it, closing round the rod. The screw's hole is a teardrop across the layers.
// The clamp screw's hole is v.fixings' M3 clearance hole.
import jscad from '@jscad/modeling'
const { cylinder, cuboid } = jscad.primitives

export function main (v) {
  const screwD = v.fixings.holeModel('M3').diameter
  const ring = cylinder({ radius: v.outer / 2, height: v.high, center: [0, 0, v.high / 2], segments: v.segments * 2 })
  const hole = cylinder({ radius: v.bore / 2, height: v.high + 1, center: [0, 0, v.high / 2], segments: v.segments })
  const slot = cuboid({ size: [v.outer / 2 + 1, v.slot, v.high + 1], center: [(v.outer / 2 + 1) / 2, 0, v.high / 2] })
  const screw = v.shapes.teardropHole({ d: screwD, length: v.outer, at: [v.screw_out, 0 - v.outer / 2, v.high / 2], into: '+y', through: true })
  return v.ops.subtract(ring, hole, slot, screw)
}
```

```json projects/leg/objects/scale.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "scale",
  "title": "Kitchen scale (not printed)",
  "version": "0.1.0",
  "role": "reference",
  "uses": ["leg"],
  "anchors": {
    "top": {"at": [0, 0, "high"], "axis": [0, 0, 1]}
  },
  "variables": {
    "side": {"value": 120, "unit": "mm", "rule": "The platform: a common 5 kg kitchen scale. Measure yours", "kind": "estimate"},
    "high": {"value": "leg.scale_h", "unit": "mm", "rule": "Its height"}
  }
}
```

```js projects/leg/objects/scale.js
// A block where the scale goes: the foot stands on its top.
import jscad from '@jscad/modeling'
const { cuboid } = jscad.primitives

export function main (v) { return cuboid({ size: [v.side, v.side, v.high], center: [0, 0, v.high / 2] }) }
```

### The stand assembly

Standing, the foot is under the hip with the knee behind it. The gait is a single leg's: `"pattern": { "duty": 0.6, "phase": [0] }` says stance for 60% of the cycle, swing for the rest. The mass is `leg.stand_load`, 1.01 kg: what rides the rods, more than the robot's 0.75 kg share. The motors, the drivers, the shield and the supply are marked `"have": true`, the parts on the builder's bench, so `cad list` puts them under "in hand" and the buy list is the bearings, the rods, the screws and the wire. The supply is the 12 V bench supply with its current limit set at 1.5 A: each motor's torque at speed is worked out at its 12 V.

```json projects/leg/assemblies/stand.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/assembly.schema.json",
  "title": "A leg on a test stand",
  "kind": "fit",
  "description": "One leg on a carriage that rides up two rods: it stands and steps against a kitchen scale. The body's frame is the world: the hip at the origin, the ground at the scale's top.",
  "uses": ["leg"],
  "items": [
    { "id": "foot1", "object": "foot", "at": ["0 - leg.rod_x", "0 - leg.rod_y", "0 - leg.stance - leg.foot_r - leg.scale_h"] },
    { "id": "carriage", "object": "carriage", "rotate": [90, 0, 0] },
    { "id": "lm1", "bought": "lm8uu", "at": ["0 - leg.rod_x", "0 - leg.rod_y", "0 - carriage.boss_long / 2"] },
    { "id": "lm2", "bought": "lm8uu", "at": ["leg.rod_x", "0 - leg.rod_y", "0 - carriage.boss_long / 2"] },
    { "id": "m1", "motor": { "model": "17HS4401", "drives": "hd", "speed": 200, "duty": 0.3, "driver": "d1", "current": 0.5, "microsteps": 8 }, "have": true },
    { "id": "housing", "object": "housing", "rotate": [-90, 0, 0] },
    { "id": "sun", "object": "sun" },
    { "id": "carrier", "object": "speck" },
    { "id": "p1", "object": "planet" }, { "id": "p2", "object": "planet" }, { "id": "p3", "object": "planet" },
    { "id": "output", "object": "output" },
    { "id": "spindle", "object": "spindle" },
    { "id": "bridge", "object": "bridge", "at": [0, "leg.bridge_low", 0], "rotate": [-90, 0, 0] },
    { "id": "b1", "bought": "bearing-6800", "at": [0, "leg.bridge_low + leg.bridge - leg.bearing_width", 0], "rotate": [-90, 0, 0] },
    { "id": "thigh", "object": "thigh" },
    { "id": "m2", "motor": { "model": "17HS4401", "drives": "kd", "speed": 200, "duty": 0.3, "driver": "d2", "current": 0.5, "microsteps": 8 }, "have": true },
    { "id": "esun", "object": "sun", "set": { "tip": 11.7 } },
    { "id": "ecarrier", "object": "speck" }, { "id": "ering", "object": "speck" },
    { "id": "ep1", "object": "planet" }, { "id": "ep2", "object": "planet" }, { "id": "ep3", "object": "planet" },
    { "id": "eoutput", "object": "output" },
    { "id": "clip1", "object": "clip" }, { "id": "clip2", "object": "clip" }, { "id": "clip3", "object": "clip" },
    { "id": "shin", "object": "shin" },
    { "id": "pad", "object": "pad" },
    { "id": "rod1", "bought": "rod-8", "set": { "length": "leg.rod_long" }, "at": ["0 - leg.rod_x", "0 - leg.rod_y", "0 - leg.stance - leg.foot_r - leg.scale_h + leg.foot_block - leg.foot_socket"] },
    { "id": "rod2", "bought": "rod-8", "set": { "length": "leg.rod_long" }, "at": ["leg.rod_x", "0 - leg.rod_y", "0 - leg.stance - leg.foot_r - leg.scale_h + leg.foot_block - leg.foot_socket"] },
    { "id": "foot2", "object": "foot", "at": ["leg.rod_x", "0 - leg.rod_y", "0 - leg.stance - leg.foot_r - leg.scale_h"] },
    { "id": "tie", "object": "tie", "at": [0, "0 - leg.rod_y", 76] },
    { "id": "collar1", "object": "collar", "rotate": [0, 0, 180], "at": ["0 - leg.rod_x", "0 - leg.rod_y", "0 - carriage.boss_long / 2 - leg.stop_drop - collar1.high"] },
    { "id": "collar2", "object": "collar", "at": ["leg.rod_x", "0 - leg.rod_y", "0 - carriage.boss_long / 2 - leg.stop_drop - collar2.high"] },
    { "id": "scale", "object": "scale", "at": [0, 5, "0 - leg.stance - leg.foot_r - leg.scale_h"] },
    { "id": "d1", "bought": "drv8825", "at": [240, -30, -180], "have": true },
    { "id": "d2", "bought": "drv8825", "at": [240, 0, -180], "have": true },
    { "id": "shield", "bought": "cnc-shield-v3", "at": [240, 0, -190], "have": true },
    { "id": "psu", "bought": "supply-12v", "set": { "output_current": 1.5 }, "at": [300, 150, -190], "have": true }
  ],
  "joints": [
    { "id": "m1_on", "type": "fixed", "parent": "housing.motor", "child": "m1.face" },
    { "id": "hd", "type": "revolute", "parent": "housing.axis", "child": "sun.axis", "min": -6200, "max": 200, "label": "Hip motor" },
    { "id": "turn", "type": "revolute", "parent": "housing.axis", "child": "carrier.axis", "min": -6200, "max": 200 },
    { "id": "s1", "type": "revolute", "parent": "carrier.a", "child": "p1.axis", "min": -30000, "max": 30000 },
    { "id": "s2", "type": "revolute", "parent": "carrier.b", "child": "p2.axis", "min": -30000, "max": 30000 },
    { "id": "s3", "type": "revolute", "parent": "carrier.c", "child": "p3.axis", "min": -30000, "max": 30000 },
    { "id": "hip", "type": "revolute", "parent": { "item": "housing", "at": [0, 0, "leg.plate + leg.gear + leg.ring_gap"], "axis": [0, 0, 1] }, "child": "output.axis", "min": 30, "max": 150, "label": "Hip", "support": { "bearings": ["b1"] } },
    { "id": "spindle_on", "type": "fixed", "parent": "output.flange", "child": "spindle.down" },
    { "id": "thigh_on", "type": "fixed", "parent": "spindle.seat", "child": "thigh.hub" },
    { "id": "m2_on", "type": "fixed", "parent": "thigh.motor", "child": "m2.face" },
    { "id": "kd", "type": "revolute", "parent": "thigh.knee", "child": "esun.axis", "min": -5900, "max": 180, "label": "Knee motor" },
    { "id": "ering_on", "type": "fixed", "parent": "thigh.knee", "child": "ering.axis" },
    { "id": "eturn", "type": "revolute", "parent": "thigh.knee", "child": "ecarrier.axis", "min": -5900, "max": 180 },
    { "id": "es1a", "type": "revolute", "parent": "ecarrier.a", "child": "ep1.axis", "min": -30000, "max": 30000 },
    { "id": "es2a", "type": "revolute", "parent": "ecarrier.b", "child": "ep2.axis", "min": -30000, "max": 30000 },
    { "id": "es3a", "type": "revolute", "parent": "ecarrier.c", "child": "ep3.axis", "min": -30000, "max": 30000 },
    { "id": "knee", "type": "revolute", "parent": "thigh.output", "child": "eoutput.axis", "min": 0, "max": 150, "label": "Knee", "support": { "clips": ["clip1", "clip2", "clip3"], "pitch": 74 } },
    { "id": "c1_on", "type": "fixed", "parent": "thigh.clip1", "child": "clip1.post" },
    { "id": "c2_on", "type": "fixed", "parent": "thigh.clip2", "child": "clip2.post" },
    { "id": "c3_on", "type": "fixed", "parent": "thigh.clip3", "child": "clip3.post" },
    { "id": "shin_on", "type": "fixed", "parent": "eoutput.flange", "child": "shin.hub" },
    { "id": "pad_on", "type": "fixed", "parent": "shin.pad", "child": "pad.axis" }
  ],
  "planetary": [
    { "sun": "sun", "carrier": "carrier", "ring": "housing", "planets": ["p1", "p2", "p3"], "drive": "sun", "module": 1, "teeth": [18, 18, 54], "output": { "ring": "output", "planet": 21, "teeth": 57 } },
    { "sun": "esun", "carrier": "ecarrier", "ring": "ering", "planets": ["ep1", "ep2", "ep3"], "drive": "sun", "module": 1, "teeth": [18, 18, 54], "output": { "ring": "eoutput", "planet": 21, "teeth": 57 } }
  ],
  "fasten": [
    {"screw": "M3 cap", "through": ["housing"], "into": "carriage", "at": ["housing.f1", "housing.f2", "housing.f3"], "note": "The housing on the carriage's face"},
    {"screw": "M3 cap", "through": ["bridge"], "into": "housing", "at": ["bridge.s1", "bridge.s2", "bridge.s3"], "note": "The bridge on the housing's posts"},
    {"screw": "M3 countersunk", "through": ["spindle"], "into": "output", "at": ["spindle.b1", "spindle.b2", "spindle.b3", "spindle.b4"], "note": "The spindle on the hip's output, its heads flush under the bridge"},
    {"screw": "M3 cap", "through": ["thigh"], "into": "spindle", "at": ["thigh.hub"], "note": "The thigh clamped down on the spindle's hexagon"},
    {"screw": "M3 cap", "through": ["clip1"], "into": "thigh", "at": ["clip1.post"], "note": "A clip on its post"},
    {"screw": "M3 cap", "through": ["clip2"], "into": "thigh", "at": ["clip2.post"], "note": "A clip on its post"},
    {"screw": "M3 cap", "through": ["clip3"], "into": "thigh", "at": ["clip3.post"], "note": "A clip on its post"},
    {"screw": "M3 cap", "through": ["shin"], "into": "eoutput", "at": ["shin.b1", "shin.b2", "shin.b3", "shin.b4"], "note": "The shin on the knee's output"}
  ],
  "fits": [
    { "a": "m1", "b": "housing", "fastens": true, "min": -0.1, "note": "The hip motor, on its four screws, its boss seated in the plate's pocket" },
    { "a": "m1", "b": "sun", "shaft": true, "note": "The shaft in the sun" },
    { "a": "m2", "b": "esun", "shaft": true, "note": "The knee motor's shaft in its sun" },
    { "a": "m2", "b": "thigh", "fastens": true, "min": -0.1, "note": "The knee motor, on its four screws" },
    { "a": "housing", "b": "carriage", "min": 0, "note": "The housing, screwed to the carriage's face" },
    { "a": "bridge", "b": "housing", "min": 0, "note": "The bridge, on the housing's posts" },
    { "a": "b1", "b": "bridge", "seat": "press", "note": "The 6800 in its seat" },
    { "a": "ecarrier", "b": "ering", "min": -1, "note": "Two specks: neither is printed" },
    { "a": "lm1", "b": "carriage", "fastens": true, "min": -0.5, "note": "The bushing, pressed in its pocket" },
    { "a": "lm2", "b": "carriage", "fastens": true, "min": -0.5, "note": "The bushing, pressed in its pocket" },
    { "a": "rod1", "b": "lm1", "fastens": true, "min": -1000, "note": "The bushing rides the rod: the carriage is free to rise and is held on the rods" },
    { "a": "rod2", "b": "lm2", "fastens": true, "min": -1000, "note": "The bushing rides the rod" },
    { "a": "rod1", "b": "foot1", "fastens": true, "min": -1000, "note": "The rod in its socket" },
    { "a": "rod2", "b": "foot2", "fastens": true, "min": -1000, "note": "The rod in its socket" },
    { "a": "rod1", "b": "tie", "fastens": true, "min": -1000, "note": "The rod through the tie" },
    { "a": "rod2", "b": "tie", "fastens": true, "min": -1000, "note": "The rod through the tie" },
    { "a": "rod1", "b": "collar1", "fastens": true, "min": -1000, "note": "The stop clamped on the rod" },
    { "a": "rod2", "b": "collar2", "fastens": true, "min": -1000, "note": "The stop clamped on the rod" },
    { "a": "pad", "b": "shin", "min": -2, "note": "The pad on the foot's disc" },
    { "a": "pad", "b": "scale", "min": -0.5, "note": "The foot stands on the scale" },
    { "a": "d1", "b": "shield", "fastens": true, "min": -20, "note": "Plugged in" },
    { "a": "d2", "b": "shield", "fastens": true, "min": -20, "note": "Plugged in" }
  ],
  "wires": [
    { "id": "hip_wire", "from": "m1.connector", "to": "shield.X", "via": ["carriage.cable"], "gauge": "awg24", "colour": "black, red, green, blue", "connectors": ["JST-XH 4 pin", "screw terminal"] },
    { "id": "knee_wire", "from": "m2.connector", "to": "shield.Y", "via": ["thigh.cable", "carriage.cable"], "gauge": "awg24", "colour": "black, red, green, blue", "connectors": ["JST-XH 4 pin", "screw terminal"] },
    { "id": "power", "from": "psu.terminals", "to": "shield.top", "gauge": "awg22", "colour": "red, black", "conductors": 2, "current": 2, "connectors": ["Ring terminal", "Screw terminal"], "note": "12 V from the bench supply, its current limit at 1.5 A, into the shield's motor terminals" }
  ],
  "gait": { "legs": ["shin.tip"], "pattern": { "duty": 0.6, "phase": [0] }, "stride": "leg.stride", "lift": "leg.lift", "period": 2, "height": "leg.stance", "mass": "leg.stand_load", "clearance": 12 },
  "poses": { "standing": { "hd": -5587.7, "kd": -2236 } }
}
```

```sh
npx cad check leg/stand --json
npx cad list leg/stand
npx cad animate leg/stand
```

The check runs with `--json` here because the stand's warnings, that its figures rest on estimates and that two of the shin's screws want a ball-end key, would otherwise stop the test: run it plain to read it. What it says:

- `gait.clearance` passes: the swing foot lifts 15 mm clear of the scale (asked 12).
- `motor.torque` through the gait: the hip needs 0.198 N m at the worst of the cycle against 1.682 N m the 17HS4401 gives at 0.5 A through 38:1 at 47%, 8.5 times; the knee 0.608 N m against the same 1.682 N m, 2.8 times. By hand: the 17HS4401 holds 0.4 N m, and moving, 0.4 / √2 = 0.283 N m, flat up to its 12 V corner of 60 × 12 / (2 × 4.2 mH × 1.5 A × 200 steps) = 286 rpm, so all of it at 200 rpm; at 0.5 of its 1.5 A, 0.094 N m; through 38:1 at 47%, 1.682 N m. The supply's 12 V costs nothing here, since 200 rpm is under its corner: only the mass moves the margins. With the NEMA 14 the knee had 1.419 N m for 0.451 N m at 0.75 kg, 3.1 times, and the hip 11.4 times; the 17HS4401 gives the knee more torque, and the 90 g it adds, with the load now counted as what rides the rods, brings both margins down to these. Those figures are the foot's load only, not the leg's own weight in the swing, and the gearbox efficiency is an estimate.
- The drivers and the supply: each DRV8825's trimmer at 0.25 V for 0.5 A a coil (on 0.1 ohm sense resistors: read yours first), and the machine draws 0.22 A at 12 V (2.6 W) from the bench supply's 1.5 A limit, 6.9 times over.
- `gait.sweep` passes: the leg, moved through the cycle pose by pose, hits nothing, with every planet and the sun turning as they should (the gait moves the motor's shaft that leads each output, and the rest follows).
- The gears' overlap is zero: the second ring is put in phase at the joint's own zero, wherever its range starts. (A range that left out zero once put the ring 30° out, and every planet into its teeth.)
- `fasten` chooses every screw and passes each: the housing's three M3x8 caps into the carriage, the bridge's three M3x10, the spindle's four M3x8 countersunk, the thigh's M3x16 into the hexagon, the clips' three M3x8 and the shin's four M3x12. It warns that the shin's first and third screws are reached only by a ball-end key tilted up to 25°: in the standing pose rod1, and for one of them collar1, stands over the straight line. That is true on the bench, so the shin goes on the knee before the leg goes on the stand. The collar's clamp screw is not a `fasten` yet: its head and nut would sit on the collar's round outside, and the collar needs flats for them first.
- `cad list` gives 471 g of printing and about 8.6 hours, and buys those screws with the motors' own (4 M3x6 and 4 M3x12 from their mounts): 24 g of fixings. Per part, printed and bought, the leg (without the stand) is the sum above; the heaviest prints are the thigh (98 g), the carriage (92 g), the tie (43 g) and the shin (43 g).
- Margin per part, by hand (`estimate`, PLA at 39 MPa, bending at the worst stance load): the thigh 59 times, the shin 33 times, the carriage's arms 97 times. These were 80, 45 and 130 times at the robot's 0.75 kg share; the stance load is now the 1.01 kg that rides the rods, and bending stress follows the load, so each is 0.75 / 1.01 of what it was. The motors' margins above are the small ones.
- `cad animate leg/stand` writes `.preview/leg/stand-gait.svg`: the leg's sticks in side view, the foot's stance in blue and swing in orange. The model page plays the same cycle in the Motion panel of a link: `cad link leg/stand` carries it.

To run the leg on the bench: tare the scale with the carriage resting on its stops and the foot just off it, command the stance, and read the scale, which reads the foot's push. A known mass hung on the carriage is the test of whether the leg holds and what the torque margin really is.

### The quadruped

Four legs, on a body two plates wide: a design exercise. The two side plates are the same 242 mm print, turned end for end, held apart by two beams and each with two hips. Each hip motor goes through its plate, inward, so a body 100 mm wide takes two motors back to back. The knees point outward, front and back, so a front knee never reaches a back hip. Each hip's housing screws into M3 pilots in its plate, and each beam is held by screws through M3 clearance holes in the plates into pilots in the beam's ends: a pilot in the plate as well would leave the screw nothing to clamp, and the check's `fasten.clearance` would fail it.

```json projects/leg/objects/side.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "side",
  "title": "Body side plate",
  "version": "0.1.0",
  "uses": ["x1c", "leg"],
  "engine": "manifold",
  "orientation": "Flat on the bed: the hips' faces down",
  "description": "Two hip hubs joined by a spar, with the windows the hip motors go through and four pilot holes for the cross beams. The two sides are the same print, turned end for end.",
  "anchors": {
    "hip1": {"at": ["half", 0, 0], "axis": [0, 0, 1], "ref": [1, 0, 0]},
    "hip2": {"at": ["0 - half", 0, 0], "axis": [0, 0, 1], "ref": [1, 0, 0]}
  },
  "variables": {
    "half": {"value": "leg.body_half", "unit": "mm", "rule": "Hip to the middle: the body's half-length", "interface": true},
    "thick": {"value": 6, "unit": "mm", "rule": "The plate: enough for the housing's three screws to bite"},
    "hub": {"value": 46, "unit": "mm", "rule": "A hub's radius: past the housing's feet"},
    "spar": {"value": 30, "unit": "mm", "rule": "The spar's depth between the hubs"},
    "feet_r": {"value": 37, "unit": "mm", "rule": "The housing's three feet", "interface": true},
    "a1": {"value": 90, "unit": "°", "rule": "The housing's first foot"},
    "a2": {"value": 210, "unit": "°", "rule": "Second"},
    "a3": {"value": 330, "unit": "°", "rule": "Third"},
    "window": {"value": 44.5, "unit": "mm", "rule": "The motor's way through the plate: a NEMA 17 and 1.1 mm each side"},
    "corner": {"value": 3, "unit": "mm", "rule": "Round the corners of the window"},
    "beam_at": {"value": 27, "unit": "mm", "rule": "The two cross beams, between the hip motors: the motors take the space from 54 mm to the plate's end"},
    "beam_y": {"value": 16, "unit": "mm", "rule": "Each beam's two screws, this far either side of its middle"},
    "rad": {"value": 0.017453293, "rule": "Radians in a degree"},
    "segments": {"value": 64, "rule": "Round enough"}
  }
}
```

```js projects/leg/objects/side.js
// Two hubs and a spar, flat on the bed. Each hub is a window for a hip motor with the housing's three pilot holes round it.
// The screws' holes are v.fixings': an M3 pilot for each of a housing's screws, and an M3 clearance hole for each of
// the screws on into a beam's end.
import jscad from '@jscad/modeling'
const { cylinder, cuboid, roundedRectangle } = jscad.primitives
const { extrudeLinear } = jscad.extrusions
const { translate } = jscad.transforms

export function main (v) {
  const pilot = v.fixings.holeModel('M3', { kind: 'pilot' }).diameter, screw = v.fixings.holeModel('M3').diameter
  const hubs = [-1, 1].map((s) => cylinder({ radius: v.hub, height: v.thick, center: [s * v.half, 0, v.thick / 2], segments: v.segments * 2 }))
  const spar = cuboid({ size: [v.half * 2, v.spar, v.thick], center: [0, 0, v.thick / 2] })
  const windows = [-1, 1].map((s) => translate([s * v.half, 0, 0], extrudeLinear({ height: v.thick + 1 }, roundedRectangle({ size: [v.window, v.window], roundRadius: v.corner, segments: v.segments }))))
  const feet = [-1, 1].flatMap((s) => [v.a1, v.a2, v.a3].map((a) => a * v.rad).map((a) => cylinder({ radius: pilot / 2, height: v.thick + 1, center: [s * v.half + v.feet_r * Math.cos(a), 0 - v.feet_r * Math.sin(a), v.thick / 2], segments: v.segments })))
  const beams = [-1, 1].flatMap((x) => [-1, 1].map((s) => cylinder({ radius: screw / 2, height: v.thick + 1, center: [x * v.beam_at + s * v.beam_y, 0, v.thick / 2], segments: v.segments })))
  return v.ops.subtract(v.ops.union(hubs, spar), windows, feet, beams)
}
```

```json projects/leg/objects/beam.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "beam",
  "title": "Body cross beam",
  "version": "0.1.0",
  "uses": ["x1c", "leg"],
  "engine": "manifold",
  "orientation": "Flat on one side, its screw holes along the bed: each hole a teardrop",
  "description": "A beam across the body between the side plates: it holds them square against the legs' push. Three of them, screwed in through the plates.",
  "anchors": {
    "end": {"at": ["0 - long / 2", 0, "wide / 2"], "axis": [-1, 0, 0], "ref": [0, 1, 0]},
    "other": {"at": ["long / 2", 0, "wide / 2"], "axis": [1, 0, 0], "ref": [0, 1, 0]}
  },
  "variables": {
    "long": {"value": "leg.body_w * 2 - leg.side_t * 2", "unit": "mm", "rule": "Between the two side plates' inner faces"},
    "deep": {"value": 46, "unit": "mm", "rule": "Across the body's length: its two screws at each end, plus room, and clear of the hip motors"},
    "wide": {"value": 12, "unit": "mm", "rule": "Thick: 25 layers of stiffness for the side plates to pull on"},
    "pilot_len": {"value": 12, "unit": "mm", "rule": "Each end's pilot depth, for the screw through the side plate"},
    "screw_y": {"value": 16, "unit": "mm", "rule": "The two screws at each end"},
    "segments": {"value": 32, "rule": "Round enough"}
  }
}
```

```js projects/leg/objects/beam.js
// A flat bar with two teardrop pilot holes in each end.
// The pilots are v.fixings' M3 pilots, lying on their sides: the side plates' screws cut their thread in them.
import jscad from '@jscad/modeling'
const { cuboid } = jscad.primitives

export function main (v) {
  const pilot = v.fixings.holeModel('M3', { kind: 'pilot', into: '+x' }).diameter
  const bar = cuboid({ size: [v.long, v.deep, v.wide], center: [0, 0, v.wide / 2] })
  const holes = [1, -1].flatMap((end) => [-1, 1].map((s) => v.shapes.teardropHole({ d: pilot, length: v.pilot_len + 1, at: [end * (v.long / 2 + 1), s * v.screw_y, v.wide / 2], into: end > 0 ? '-x' : '+x' })))
  return v.ops.subtract(bar, holes)
}
```

The quadruped carries the leg's parts, every one, as items of a single assembly. That costs length, because each leg's gearbox is written out; it is what lets the gait below move every joint, with every planet turning, and lets the sweep look for leg against leg. Two gaits, one file each: a trot and a crawl, the same machine. The hip motors live between the two plates, with the beams between them.

Eight motors are more than the stand's Uno under a CNC shield can step: its streamer has three axes. The quadruped carries one Arduino Mega 2560 (`mega`, the `arduino-mega-2560` rule set), which runs the same streamer built for eight axes, and a DRV8825 for each motor on its own driver breakout (`driver-breakout`): each motor's wire goes to its breakout, and each breakout's EN, STEP, DIR and GND go on to one of the Mega's slots, `S0` to `S7`. One board keeps every leg's steps in the same blocks, which two boards kept in step could not promise. The boards sit over the body, clear of the hip motors, as references for the shopping list and the wire lengths; a deck to hold them is not designed yet. `cad machine leg/quadruped` lists each axis with its slot, and `cad plot leg/quadruped` writes the trot as a step file that the sender, `projects/leg/send.mjs`, streams to the Mega (`projects/leg/STREAMER.md` says how).

```json projects/leg/assemblies/quadruped.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/assembly.schema.json",
  "title": "A quadruped, trotting: a design from the leg's parts",
  "kind": "fit",
  "description": "Four legs on a body: the leg's parts, all of them, as items of one assembly so the gait moves every joint. Trotting: the feet in diagonal pairs, statically balanced on two feet only in passing, and quasi-static only. A design, not yet a build.",
  "uses": ["leg"],
  "items": [
    {"id": "left", "object": "side", "at": [0, "leg.body_w",0], "rotate": [90,0,0]},
    {"id": "right", "object": "side", "at": [0, "0 - leg.body_w",0], "rotate": [90,0,180]},
    {"id": "beam1", "object": "beam", "at": ["left.beam_at",0,-6], "rotate": [0,0,90]},
    {"id": "beam2", "object": "beam", "at": ["0 - left.beam_at",0,-6], "rotate": [0,0,90]},
    {"id": "fl_m1", "motor": {"model": "17HS4401", "drives": "fl_hd", "speed": 200, "duty": 0.3, "current": 1, "microsteps": 8, "driver": "fl_d1"}},
    {"id": "fl_housing", "object": "housing", "at": ["leg.body_half", "leg.body_w",0], "rotate": [-90,0,0]},
    {"id": "fl_sun", "object": "sun"},
    {"id": "fl_carrier", "object": "speck"},
    {"id": "fl_p1", "object": "planet"},
    {"id": "fl_p2", "object": "planet"},
    {"id": "fl_p3", "object": "planet"},
    {"id": "fl_output", "object": "output"},
    {"id": "fl_spindle", "object": "spindle"},
    {"id": "fl_bridge", "object": "bridge"},
    {"id": "fl_b1", "bought": "bearing-6800"},
    {"id": "fl_thigh", "object": "thigh"},
    {"id": "fl_m2", "motor": {"model": "17HS4401", "drives": "fl_kd", "speed": 200, "duty": 0.3, "current": 1, "microsteps": 8, "driver": "fl_d2"}},
    {"id": "fl_esun", "object": "sun", "set": {"tip": 11.7}},
    {"id": "fl_ecarrier", "object": "speck"},
    {"id": "fl_ering", "object": "speck"},
    {"id": "fl_ep1", "object": "planet"},
    {"id": "fl_ep2", "object": "planet"},
    {"id": "fl_ep3", "object": "planet"},
    {"id": "fl_eoutput", "object": "output"},
    {"id": "fl_clip1", "object": "clip"},
    {"id": "fl_clip2", "object": "clip"},
    {"id": "fl_clip3", "object": "clip"},
    {"id": "fl_shin", "object": "shin"},
    {"id": "fl_pad", "object": "pad"},
    {"id": "fr_m1", "motor": {"model": "17HS4401", "drives": "fr_hd", "speed": 200, "duty": 0.3, "current": 1, "microsteps": 8, "driver": "fr_d1"}},
    {"id": "fr_housing", "object": "housing", "at": ["leg.body_half", "0 - leg.body_w",0], "rotate": [-90,0,180]},
    {"id": "fr_sun", "object": "sun"},
    {"id": "fr_carrier", "object": "speck"},
    {"id": "fr_p1", "object": "planet"},
    {"id": "fr_p2", "object": "planet"},
    {"id": "fr_p3", "object": "planet"},
    {"id": "fr_output", "object": "output"},
    {"id": "fr_spindle", "object": "spindle"},
    {"id": "fr_bridge", "object": "bridge"},
    {"id": "fr_b1", "bought": "bearing-6800"},
    {"id": "fr_thigh", "object": "thigh"},
    {"id": "fr_m2", "motor": {"model": "17HS4401", "drives": "fr_kd", "speed": 200, "duty": 0.3, "current": 1, "microsteps": 8, "driver": "fr_d2"}},
    {"id": "fr_esun", "object": "sun", "set": {"tip": 11.7}},
    {"id": "fr_ecarrier", "object": "speck"},
    {"id": "fr_ering", "object": "speck"},
    {"id": "fr_ep1", "object": "planet"},
    {"id": "fr_ep2", "object": "planet"},
    {"id": "fr_ep3", "object": "planet"},
    {"id": "fr_eoutput", "object": "output"},
    {"id": "fr_clip1", "object": "clip"},
    {"id": "fr_clip2", "object": "clip"},
    {"id": "fr_clip3", "object": "clip"},
    {"id": "fr_shin", "object": "shin"},
    {"id": "fr_pad", "object": "pad"},
    {"id": "bl_m1", "motor": {"model": "17HS4401", "drives": "bl_hd", "speed": 200, "duty": 0.3, "current": 1, "microsteps": 8, "driver": "bl_d1"}},
    {"id": "bl_housing", "object": "housing", "at": ["0 - leg.body_half", "leg.body_w",0], "rotate": [-90,0,0]},
    {"id": "bl_sun", "object": "sun"},
    {"id": "bl_carrier", "object": "speck"},
    {"id": "bl_p1", "object": "planet"},
    {"id": "bl_p2", "object": "planet"},
    {"id": "bl_p3", "object": "planet"},
    {"id": "bl_output", "object": "output"},
    {"id": "bl_spindle", "object": "spindle"},
    {"id": "bl_bridge", "object": "bridge"},
    {"id": "bl_b1", "bought": "bearing-6800"},
    {"id": "bl_thigh", "object": "thigh"},
    {"id": "bl_m2", "motor": {"model": "17HS4401", "drives": "bl_kd", "speed": 200, "duty": 0.3, "current": 1, "microsteps": 8, "driver": "bl_d2"}},
    {"id": "bl_esun", "object": "sun", "set": {"tip": 11.7}},
    {"id": "bl_ecarrier", "object": "speck"},
    {"id": "bl_ering", "object": "speck"},
    {"id": "bl_ep1", "object": "planet"},
    {"id": "bl_ep2", "object": "planet"},
    {"id": "bl_ep3", "object": "planet"},
    {"id": "bl_eoutput", "object": "output"},
    {"id": "bl_clip1", "object": "clip"},
    {"id": "bl_clip2", "object": "clip"},
    {"id": "bl_clip3", "object": "clip"},
    {"id": "bl_shin", "object": "shin"},
    {"id": "bl_pad", "object": "pad"},
    {"id": "br_m1", "motor": {"model": "17HS4401", "drives": "br_hd", "speed": 200, "duty": 0.3, "current": 1, "microsteps": 8, "driver": "br_d1"}},
    {"id": "br_housing", "object": "housing", "at": ["0 - leg.body_half", "0 - leg.body_w",0], "rotate": [-90,0,180]},
    {"id": "br_sun", "object": "sun"},
    {"id": "br_carrier", "object": "speck"},
    {"id": "br_p1", "object": "planet"},
    {"id": "br_p2", "object": "planet"},
    {"id": "br_p3", "object": "planet"},
    {"id": "br_output", "object": "output"},
    {"id": "br_spindle", "object": "spindle"},
    {"id": "br_bridge", "object": "bridge"},
    {"id": "br_b1", "bought": "bearing-6800"},
    {"id": "br_thigh", "object": "thigh"},
    {"id": "br_m2", "motor": {"model": "17HS4401", "drives": "br_kd", "speed": 200, "duty": 0.3, "current": 1, "microsteps": 8, "driver": "br_d2"}},
    {"id": "br_esun", "object": "sun", "set": {"tip": 11.7}},
    {"id": "br_ecarrier", "object": "speck"},
    {"id": "br_ering", "object": "speck"},
    {"id": "br_ep1", "object": "planet"},
    {"id": "br_ep2", "object": "planet"},
    {"id": "br_ep3", "object": "planet"},
    {"id": "br_eoutput", "object": "output"},
    {"id": "br_clip1", "object": "clip"},
    {"id": "br_clip2", "object": "clip"},
    {"id": "br_clip3", "object": "clip"},
    {"id": "br_shin", "object": "shin"},
    {"id": "br_pad", "object": "pad"},
    {"id": "mega", "bought": "arduino-mega-2560", "at": [0, 0, 20]},
    {"id": "psu", "bought": "supply-12v", "at": [0, 150, 20]},
    {"id": "fl_board1", "bought": "driver-breakout", "at": [69, 19.5, 48]},
    {"id": "fl_d1", "bought": "drv8825", "at": [69, 19.5, 58.1]},
    {"id": "fl_board2", "bought": "driver-breakout", "at": [23, 19.5, 48]},
    {"id": "fl_d2", "bought": "drv8825", "at": [23, 19.5, 58.1]},
    {"id": "fr_board1", "bought": "driver-breakout", "at": [69, -19.5, 48]},
    {"id": "fr_d1", "bought": "drv8825", "at": [69, -19.5, 58.1]},
    {"id": "fr_board2", "bought": "driver-breakout", "at": [23, -19.5, 48]},
    {"id": "fr_d2", "bought": "drv8825", "at": [23, -19.5, 58.1]},
    {"id": "bl_board1", "bought": "driver-breakout", "at": [-69, 19.5, 48]},
    {"id": "bl_d1", "bought": "drv8825", "at": [-69, 19.5, 58.1]},
    {"id": "bl_board2", "bought": "driver-breakout", "at": [-23, 19.5, 48]},
    {"id": "bl_d2", "bought": "drv8825", "at": [-23, 19.5, 58.1]},
    {"id": "br_board1", "bought": "driver-breakout", "at": [-69, -19.5, 48]},
    {"id": "br_d1", "bought": "drv8825", "at": [-69, -19.5, 58.1]},
    {"id": "br_board2", "bought": "driver-breakout", "at": [-23, -19.5, 48]},
    {"id": "br_d2", "bought": "drv8825", "at": [-23, -19.5, 58.1]}
  ],
  "joints": [
    {"id": "fl_m1_on", "type": "fixed", "parent": "fl_housing.motor", "child": "fl_m1.face"},
    {"id": "fl_hd", "type": "revolute", "parent": "fl_housing.axis", "child": "fl_sun.axis", "min": -6200, "max": 6200},
    {"id": "fl_turn", "type": "revolute", "parent": "fl_housing.axis", "child": "fl_carrier.axis", "min": -6200, "max": 6200},
    {"id": "fl_s1", "type": "revolute", "parent": "fl_carrier.a", "child": "fl_p1.axis", "min": -30000, "max": 30000},
    {"id": "fl_s2", "type": "revolute", "parent": "fl_carrier.b", "child": "fl_p2.axis", "min": -30000, "max": 30000},
    {"id": "fl_s3", "type": "revolute", "parent": "fl_carrier.c", "child": "fl_p3.axis", "min": -30000, "max": 30000},
    {"id": "fl_hip", "type": "revolute", "parent": {"item": "fl_housing", "at": [0,0, "leg.plate + leg.gear + leg.ring_gap"], "axis": [0,0,1]}, "child": "fl_output.axis", "min": 30, "max": 150, "label": "fl hip"},
    {"id": "fl_spindle_on", "type": "fixed", "parent": "fl_output.flange", "child": "fl_spindle.down"},
    {"id": "fl_thigh_on", "type": "fixed", "parent": "fl_spindle.seat", "child": "fl_thigh.hub"},
    {"id": "fl_bridge_on", "type": "fixed", "parent": {"item": "fl_housing", "at": [0,0, "leg.bridge_low"], "axis": [0,0,1]}, "child": "fl_bridge.under"},
    {"id": "fl_b1_on", "type": "fixed", "parent": {"item": "fl_housing", "at": [0,0, "leg.bridge_low + leg.bridge - leg.bearing_width"], "axis": [0,0,1]}, "child": "fl_b1.face"},
    {"id": "fl_m2_on", "type": "fixed", "parent": "fl_thigh.motor", "child": "fl_m2.face"},
    {"id": "fl_kd", "type": "revolute", "parent": "fl_thigh.knee", "child": "fl_esun.axis", "min": -6200, "max": 6200},
    {"id": "fl_ering_on", "type": "fixed", "parent": "fl_thigh.knee", "child": "fl_ering.axis"},
    {"id": "fl_eturn", "type": "revolute", "parent": "fl_thigh.knee", "child": "fl_ecarrier.axis", "min": -6200, "max": 6200},
    {"id": "fl_es1", "type": "revolute", "parent": "fl_ecarrier.a", "child": "fl_ep1.axis", "min": -30000, "max": 30000},
    {"id": "fl_es2", "type": "revolute", "parent": "fl_ecarrier.b", "child": "fl_ep2.axis", "min": -30000, "max": 30000},
    {"id": "fl_es3", "type": "revolute", "parent": "fl_ecarrier.c", "child": "fl_ep3.axis", "min": -30000, "max": 30000},
    {"id": "fl_knee", "type": "revolute", "parent": "fl_thigh.output", "child": "fl_eoutput.axis", "min": -150, "max": 0, "label": "fl knee"},
    {"id": "fl_c1_on", "type": "fixed", "parent": "fl_thigh.clip1", "child": "fl_clip1.post"},
    {"id": "fl_c2_on", "type": "fixed", "parent": "fl_thigh.clip2", "child": "fl_clip2.post"},
    {"id": "fl_c3_on", "type": "fixed", "parent": "fl_thigh.clip3", "child": "fl_clip3.post"},
    {"id": "fl_shin_on", "type": "fixed", "parent": "fl_eoutput.flange", "child": "fl_shin.hub"},
    {"id": "fl_pad_on", "type": "fixed", "parent": "fl_shin.pad", "child": "fl_pad.axis"},
    {"id": "fr_m1_on", "type": "fixed", "parent": "fr_housing.motor", "child": "fr_m1.face"},
    {"id": "fr_hd", "type": "revolute", "parent": "fr_housing.axis", "child": "fr_sun.axis", "min": -6200, "max": 6200},
    {"id": "fr_turn", "type": "revolute", "parent": "fr_housing.axis", "child": "fr_carrier.axis", "min": -6200, "max": 6200},
    {"id": "fr_s1", "type": "revolute", "parent": "fr_carrier.a", "child": "fr_p1.axis", "min": -30000, "max": 30000},
    {"id": "fr_s2", "type": "revolute", "parent": "fr_carrier.b", "child": "fr_p2.axis", "min": -30000, "max": 30000},
    {"id": "fr_s3", "type": "revolute", "parent": "fr_carrier.c", "child": "fr_p3.axis", "min": -30000, "max": 30000},
    {"id": "fr_hip", "type": "revolute", "parent": {"item": "fr_housing", "at": [0,0, "leg.plate + leg.gear + leg.ring_gap"], "axis": [0,0,1]}, "child": "fr_output.axis", "min": 30, "max": 150, "label": "fr hip"},
    {"id": "fr_spindle_on", "type": "fixed", "parent": "fr_output.flange", "child": "fr_spindle.down"},
    {"id": "fr_thigh_on", "type": "fixed", "parent": "fr_spindle.seat", "child": "fr_thigh.hub"},
    {"id": "fr_bridge_on", "type": "fixed", "parent": {"item": "fr_housing", "at": [0,0, "leg.bridge_low"], "axis": [0,0,1]}, "child": "fr_bridge.under"},
    {"id": "fr_b1_on", "type": "fixed", "parent": {"item": "fr_housing", "at": [0,0, "leg.bridge_low + leg.bridge - leg.bearing_width"], "axis": [0,0,1]}, "child": "fr_b1.face"},
    {"id": "fr_m2_on", "type": "fixed", "parent": "fr_thigh.motor", "child": "fr_m2.face"},
    {"id": "fr_kd", "type": "revolute", "parent": "fr_thigh.knee", "child": "fr_esun.axis", "min": -6200, "max": 6200},
    {"id": "fr_ering_on", "type": "fixed", "parent": "fr_thigh.knee", "child": "fr_ering.axis"},
    {"id": "fr_eturn", "type": "revolute", "parent": "fr_thigh.knee", "child": "fr_ecarrier.axis", "min": -6200, "max": 6200},
    {"id": "fr_es1", "type": "revolute", "parent": "fr_ecarrier.a", "child": "fr_ep1.axis", "min": -30000, "max": 30000},
    {"id": "fr_es2", "type": "revolute", "parent": "fr_ecarrier.b", "child": "fr_ep2.axis", "min": -30000, "max": 30000},
    {"id": "fr_es3", "type": "revolute", "parent": "fr_ecarrier.c", "child": "fr_ep3.axis", "min": -30000, "max": 30000},
    {"id": "fr_knee", "type": "revolute", "parent": "fr_thigh.output", "child": "fr_eoutput.axis", "min": 0, "max": 150, "label": "fr knee"},
    {"id": "fr_c1_on", "type": "fixed", "parent": "fr_thigh.clip1", "child": "fr_clip1.post"},
    {"id": "fr_c2_on", "type": "fixed", "parent": "fr_thigh.clip2", "child": "fr_clip2.post"},
    {"id": "fr_c3_on", "type": "fixed", "parent": "fr_thigh.clip3", "child": "fr_clip3.post"},
    {"id": "fr_shin_on", "type": "fixed", "parent": "fr_eoutput.flange", "child": "fr_shin.hub"},
    {"id": "fr_pad_on", "type": "fixed", "parent": "fr_shin.pad", "child": "fr_pad.axis"},
    {"id": "bl_m1_on", "type": "fixed", "parent": "bl_housing.motor", "child": "bl_m1.face"},
    {"id": "bl_hd", "type": "revolute", "parent": "bl_housing.axis", "child": "bl_sun.axis", "min": -6200, "max": 6200},
    {"id": "bl_turn", "type": "revolute", "parent": "bl_housing.axis", "child": "bl_carrier.axis", "min": -6200, "max": 6200},
    {"id": "bl_s1", "type": "revolute", "parent": "bl_carrier.a", "child": "bl_p1.axis", "min": -30000, "max": 30000},
    {"id": "bl_s2", "type": "revolute", "parent": "bl_carrier.b", "child": "bl_p2.axis", "min": -30000, "max": 30000},
    {"id": "bl_s3", "type": "revolute", "parent": "bl_carrier.c", "child": "bl_p3.axis", "min": -30000, "max": 30000},
    {"id": "bl_hip", "type": "revolute", "parent": {"item": "bl_housing", "at": [0,0, "leg.plate + leg.gear + leg.ring_gap"], "axis": [0,0,1]}, "child": "bl_output.axis", "min": 30, "max": 150, "label": "bl hip"},
    {"id": "bl_spindle_on", "type": "fixed", "parent": "bl_output.flange", "child": "bl_spindle.down"},
    {"id": "bl_thigh_on", "type": "fixed", "parent": "bl_spindle.seat", "child": "bl_thigh.hub"},
    {"id": "bl_bridge_on", "type": "fixed", "parent": {"item": "bl_housing", "at": [0,0, "leg.bridge_low"], "axis": [0,0,1]}, "child": "bl_bridge.under"},
    {"id": "bl_b1_on", "type": "fixed", "parent": {"item": "bl_housing", "at": [0,0, "leg.bridge_low + leg.bridge - leg.bearing_width"], "axis": [0,0,1]}, "child": "bl_b1.face"},
    {"id": "bl_m2_on", "type": "fixed", "parent": "bl_thigh.motor", "child": "bl_m2.face"},
    {"id": "bl_kd", "type": "revolute", "parent": "bl_thigh.knee", "child": "bl_esun.axis", "min": -6200, "max": 6200},
    {"id": "bl_ering_on", "type": "fixed", "parent": "bl_thigh.knee", "child": "bl_ering.axis"},
    {"id": "bl_eturn", "type": "revolute", "parent": "bl_thigh.knee", "child": "bl_ecarrier.axis", "min": -6200, "max": 6200},
    {"id": "bl_es1", "type": "revolute", "parent": "bl_ecarrier.a", "child": "bl_ep1.axis", "min": -30000, "max": 30000},
    {"id": "bl_es2", "type": "revolute", "parent": "bl_ecarrier.b", "child": "bl_ep2.axis", "min": -30000, "max": 30000},
    {"id": "bl_es3", "type": "revolute", "parent": "bl_ecarrier.c", "child": "bl_ep3.axis", "min": -30000, "max": 30000},
    {"id": "bl_knee", "type": "revolute", "parent": "bl_thigh.output", "child": "bl_eoutput.axis", "min": 0, "max": 150, "label": "bl knee"},
    {"id": "bl_c1_on", "type": "fixed", "parent": "bl_thigh.clip1", "child": "bl_clip1.post"},
    {"id": "bl_c2_on", "type": "fixed", "parent": "bl_thigh.clip2", "child": "bl_clip2.post"},
    {"id": "bl_c3_on", "type": "fixed", "parent": "bl_thigh.clip3", "child": "bl_clip3.post"},
    {"id": "bl_shin_on", "type": "fixed", "parent": "bl_eoutput.flange", "child": "bl_shin.hub"},
    {"id": "bl_pad_on", "type": "fixed", "parent": "bl_shin.pad", "child": "bl_pad.axis"},
    {"id": "br_m1_on", "type": "fixed", "parent": "br_housing.motor", "child": "br_m1.face"},
    {"id": "br_hd", "type": "revolute", "parent": "br_housing.axis", "child": "br_sun.axis", "min": -6200, "max": 6200},
    {"id": "br_turn", "type": "revolute", "parent": "br_housing.axis", "child": "br_carrier.axis", "min": -6200, "max": 6200},
    {"id": "br_s1", "type": "revolute", "parent": "br_carrier.a", "child": "br_p1.axis", "min": -30000, "max": 30000},
    {"id": "br_s2", "type": "revolute", "parent": "br_carrier.b", "child": "br_p2.axis", "min": -30000, "max": 30000},
    {"id": "br_s3", "type": "revolute", "parent": "br_carrier.c", "child": "br_p3.axis", "min": -30000, "max": 30000},
    {"id": "br_hip", "type": "revolute", "parent": {"item": "br_housing", "at": [0,0, "leg.plate + leg.gear + leg.ring_gap"], "axis": [0,0,1]}, "child": "br_output.axis", "min": 30, "max": 150, "label": "br hip"},
    {"id": "br_spindle_on", "type": "fixed", "parent": "br_output.flange", "child": "br_spindle.down"},
    {"id": "br_thigh_on", "type": "fixed", "parent": "br_spindle.seat", "child": "br_thigh.hub"},
    {"id": "br_bridge_on", "type": "fixed", "parent": {"item": "br_housing", "at": [0,0, "leg.bridge_low"], "axis": [0,0,1]}, "child": "br_bridge.under"},
    {"id": "br_b1_on", "type": "fixed", "parent": {"item": "br_housing", "at": [0,0, "leg.bridge_low + leg.bridge - leg.bearing_width"], "axis": [0,0,1]}, "child": "br_b1.face"},
    {"id": "br_m2_on", "type": "fixed", "parent": "br_thigh.motor", "child": "br_m2.face"},
    {"id": "br_kd", "type": "revolute", "parent": "br_thigh.knee", "child": "br_esun.axis", "min": -6200, "max": 6200},
    {"id": "br_ering_on", "type": "fixed", "parent": "br_thigh.knee", "child": "br_ering.axis"},
    {"id": "br_eturn", "type": "revolute", "parent": "br_thigh.knee", "child": "br_ecarrier.axis", "min": -6200, "max": 6200},
    {"id": "br_es1", "type": "revolute", "parent": "br_ecarrier.a", "child": "br_ep1.axis", "min": -30000, "max": 30000},
    {"id": "br_es2", "type": "revolute", "parent": "br_ecarrier.b", "child": "br_ep2.axis", "min": -30000, "max": 30000},
    {"id": "br_es3", "type": "revolute", "parent": "br_ecarrier.c", "child": "br_ep3.axis", "min": -30000, "max": 30000},
    {"id": "br_knee", "type": "revolute", "parent": "br_thigh.output", "child": "br_eoutput.axis", "min": -150, "max": 0, "label": "br knee"},
    {"id": "br_c1_on", "type": "fixed", "parent": "br_thigh.clip1", "child": "br_clip1.post"},
    {"id": "br_c2_on", "type": "fixed", "parent": "br_thigh.clip2", "child": "br_clip2.post"},
    {"id": "br_c3_on", "type": "fixed", "parent": "br_thigh.clip3", "child": "br_clip3.post"},
    {"id": "br_shin_on", "type": "fixed", "parent": "br_eoutput.flange", "child": "br_shin.hub"},
    {"id": "br_pad_on", "type": "fixed", "parent": "br_shin.pad", "child": "br_pad.axis"}
  ],
  "planetary": [
    {"sun": "fl_sun", "carrier": "fl_carrier", "ring": "fl_housing", "planets": ["fl_p1", "fl_p2", "fl_p3"], "drive": "sun", "module": 1, "teeth": [18,18,54], "output": {"ring": "fl_output", "planet": 21, "teeth": 57}},
    {"sun": "fl_esun", "carrier": "fl_ecarrier", "ring": "fl_ering", "planets": ["fl_ep1", "fl_ep2", "fl_ep3"], "drive": "sun", "module": 1, "teeth": [18,18,54], "output": {"ring": "fl_eoutput", "planet": 21, "teeth": 57}},
    {"sun": "fr_sun", "carrier": "fr_carrier", "ring": "fr_housing", "planets": ["fr_p1", "fr_p2", "fr_p3"], "drive": "sun", "module": 1, "teeth": [18,18,54], "output": {"ring": "fr_output", "planet": 21, "teeth": 57}},
    {"sun": "fr_esun", "carrier": "fr_ecarrier", "ring": "fr_ering", "planets": ["fr_ep1", "fr_ep2", "fr_ep3"], "drive": "sun", "module": 1, "teeth": [18,18,54], "output": {"ring": "fr_eoutput", "planet": 21, "teeth": 57}},
    {"sun": "bl_sun", "carrier": "bl_carrier", "ring": "bl_housing", "planets": ["bl_p1", "bl_p2", "bl_p3"], "drive": "sun", "module": 1, "teeth": [18,18,54], "output": {"ring": "bl_output", "planet": 21, "teeth": 57}},
    {"sun": "bl_esun", "carrier": "bl_ecarrier", "ring": "bl_ering", "planets": ["bl_ep1", "bl_ep2", "bl_ep3"], "drive": "sun", "module": 1, "teeth": [18,18,54], "output": {"ring": "bl_eoutput", "planet": 21, "teeth": 57}},
    {"sun": "br_sun", "carrier": "br_carrier", "ring": "br_housing", "planets": ["br_p1", "br_p2", "br_p3"], "drive": "sun", "module": 1, "teeth": [18,18,54], "output": {"ring": "br_output", "planet": 21, "teeth": 57}},
    {"sun": "br_esun", "carrier": "br_ecarrier", "ring": "br_ering", "planets": ["br_ep1", "br_ep2", "br_ep3"], "drive": "sun", "module": 1, "teeth": [18,18,54], "output": {"ring": "br_eoutput", "planet": 21, "teeth": 57}}
  ],
  "fasten": [
    {"screw": "M3 cap", "through": ["fl_housing"], "into": "left", "at": ["fl_housing.f1", "fl_housing.f2", "fl_housing.f3"], "note": "The fl housing on the left side plate"},
    {"screw": "M3 cap", "through": ["fl_bridge"], "into": "fl_housing", "at": ["fl_bridge.s1", "fl_bridge.s2", "fl_bridge.s3"], "note": "The fl bridge on the housing's posts"},
    {"screw": "M3 countersunk", "through": ["fl_spindle"], "into": "fl_output", "at": ["fl_spindle.b1", "fl_spindle.b2", "fl_spindle.b3", "fl_spindle.b4"], "note": "The fl spindle on the hip's output, its heads flush under the bridge"},
    {"screw": "M3 cap", "through": ["fl_thigh"], "into": "fl_spindle", "at": ["fl_thigh.hub"], "note": "The fl thigh clamped down on the spindle's hexagon"},
    {"screw": "M3 cap", "through": ["fl_clip1"], "into": "fl_thigh", "at": ["fl_clip1.post"], "note": "A clip on its post"},
    {"screw": "M3 cap", "through": ["fl_clip2"], "into": "fl_thigh", "at": ["fl_clip2.post"], "note": "A clip on its post"},
    {"screw": "M3 cap", "through": ["fl_clip3"], "into": "fl_thigh", "at": ["fl_clip3.post"], "note": "A clip on its post"},
    {"screw": "M3 cap", "through": ["fl_shin"], "into": "fl_eoutput", "at": ["fl_shin.b1", "fl_shin.b2", "fl_shin.b3", "fl_shin.b4"], "note": "The fl shin on the knee's output"},
    {"screw": "M3 cap", "through": ["fr_housing"], "into": "right", "at": ["fr_housing.f1", "fr_housing.f2", "fr_housing.f3"], "note": "The fr housing on the right side plate"},
    {"screw": "M3 cap", "through": ["fr_bridge"], "into": "fr_housing", "at": ["fr_bridge.s1", "fr_bridge.s2", "fr_bridge.s3"], "note": "The fr bridge on the housing's posts"},
    {"screw": "M3 countersunk", "through": ["fr_spindle"], "into": "fr_output", "at": ["fr_spindle.b1", "fr_spindle.b2", "fr_spindle.b3", "fr_spindle.b4"], "note": "The fr spindle on the hip's output, its heads flush under the bridge"},
    {"screw": "M3 cap", "through": ["fr_thigh"], "into": "fr_spindle", "at": ["fr_thigh.hub"], "note": "The fr thigh clamped down on the spindle's hexagon"},
    {"screw": "M3 cap", "through": ["fr_clip1"], "into": "fr_thigh", "at": ["fr_clip1.post"], "note": "A clip on its post"},
    {"screw": "M3 cap", "through": ["fr_clip2"], "into": "fr_thigh", "at": ["fr_clip2.post"], "note": "A clip on its post"},
    {"screw": "M3 cap", "through": ["fr_clip3"], "into": "fr_thigh", "at": ["fr_clip3.post"], "note": "A clip on its post"},
    {"screw": "M3 cap", "through": ["fr_shin"], "into": "fr_eoutput", "at": ["fr_shin.b1", "fr_shin.b2", "fr_shin.b3", "fr_shin.b4"], "note": "The fr shin on the knee's output"},
    {"screw": "M3 cap", "through": ["bl_housing"], "into": "left", "at": ["bl_housing.f1", "bl_housing.f2", "bl_housing.f3"], "note": "The bl housing on the left side plate"},
    {"screw": "M3 cap", "through": ["bl_bridge"], "into": "bl_housing", "at": ["bl_bridge.s1", "bl_bridge.s2", "bl_bridge.s3"], "note": "The bl bridge on the housing's posts"},
    {"screw": "M3 countersunk", "through": ["bl_spindle"], "into": "bl_output", "at": ["bl_spindle.b1", "bl_spindle.b2", "bl_spindle.b3", "bl_spindle.b4"], "note": "The bl spindle on the hip's output, its heads flush under the bridge"},
    {"screw": "M3 cap", "through": ["bl_thigh"], "into": "bl_spindle", "at": ["bl_thigh.hub"], "note": "The bl thigh clamped down on the spindle's hexagon"},
    {"screw": "M3 cap", "through": ["bl_clip1"], "into": "bl_thigh", "at": ["bl_clip1.post"], "note": "A clip on its post"},
    {"screw": "M3 cap", "through": ["bl_clip2"], "into": "bl_thigh", "at": ["bl_clip2.post"], "note": "A clip on its post"},
    {"screw": "M3 cap", "through": ["bl_clip3"], "into": "bl_thigh", "at": ["bl_clip3.post"], "note": "A clip on its post"},
    {"screw": "M3 cap", "through": ["bl_shin"], "into": "bl_eoutput", "at": ["bl_shin.b1", "bl_shin.b2", "bl_shin.b3", "bl_shin.b4"], "note": "The bl shin on the knee's output"},
    {"screw": "M3 cap", "through": ["br_housing"], "into": "right", "at": ["br_housing.f1", "br_housing.f2", "br_housing.f3"], "note": "The br housing on the right side plate"},
    {"screw": "M3 cap", "through": ["br_bridge"], "into": "br_housing", "at": ["br_bridge.s1", "br_bridge.s2", "br_bridge.s3"], "note": "The br bridge on the housing's posts"},
    {"screw": "M3 countersunk", "through": ["br_spindle"], "into": "br_output", "at": ["br_spindle.b1", "br_spindle.b2", "br_spindle.b3", "br_spindle.b4"], "note": "The br spindle on the hip's output, its heads flush under the bridge"},
    {"screw": "M3 cap", "through": ["br_thigh"], "into": "br_spindle", "at": ["br_thigh.hub"], "note": "The br thigh clamped down on the spindle's hexagon"},
    {"screw": "M3 cap", "through": ["br_clip1"], "into": "br_thigh", "at": ["br_clip1.post"], "note": "A clip on its post"},
    {"screw": "M3 cap", "through": ["br_clip2"], "into": "br_thigh", "at": ["br_clip2.post"], "note": "A clip on its post"},
    {"screw": "M3 cap", "through": ["br_clip3"], "into": "br_thigh", "at": ["br_clip3.post"], "note": "A clip on its post"},
    {"screw": "M3 cap", "through": ["br_shin"], "into": "br_eoutput", "at": ["br_shin.b1", "br_shin.b2", "br_shin.b3", "br_shin.b4"], "note": "The br shin on the knee's output"},
    {"screw": "M3 cap", "through": ["left"], "into": "beam1", "holes": "left", "note": "A beam on two screws through the left side plate"},
    {"screw": "M3 cap", "through": ["right"], "into": "beam1", "holes": "right", "note": "A beam on two screws through the right side plate"},
    {"screw": "M3 cap", "through": ["left"], "into": "beam2", "holes": "left", "note": "The other beam on two screws through the left side plate"},
    {"screw": "M3 cap", "through": ["right"], "into": "beam2", "holes": "right", "note": "The other beam on two screws through the right side plate"}
  ],
  "fits": [
    {"a": "beam1", "b": "left", "min": 0, "note": "A beam, on two screws through each side plate"},
    {"a": "beam1", "b": "right", "min": 0},
    {"a": "beam2", "b": "left", "min": 0},
    {"a": "beam2", "b": "right", "min": 0},
    {"a": "fl_m1", "b": "fl_housing", "fastens": true, "min": -0.1},
    {"a": "fl_m1", "b": "fl_sun", "shaft": true},
    {"a": "fl_m2", "b": "fl_esun", "shaft": true},
    {"a": "fl_m2", "b": "fl_thigh", "fastens": true, "min": -0.1},
    {"a": "fl_housing", "b": "left", "min": 0},
    {"a": "fl_bridge", "b": "fl_housing", "min": 0},
    {"a": "fl_b1", "b": "fl_bridge", "seat": "press"},
    {"a": "fl_ecarrier", "b": "fl_ering", "min": -1},
    {"a": "fl_pad", "b": "fl_shin", "min": -2},
    {"a": "fr_m1", "b": "fr_housing", "fastens": true, "min": -0.1},
    {"a": "fr_m1", "b": "fr_sun", "shaft": true},
    {"a": "fr_m2", "b": "fr_esun", "shaft": true},
    {"a": "fr_m2", "b": "fr_thigh", "fastens": true, "min": -0.1},
    {"a": "fr_housing", "b": "right", "min": 0},
    {"a": "fr_bridge", "b": "fr_housing", "min": 0},
    {"a": "fr_b1", "b": "fr_bridge", "seat": "press"},
    {"a": "fr_ecarrier", "b": "fr_ering", "min": -1},
    {"a": "fr_pad", "b": "fr_shin", "min": -2},
    {"a": "bl_m1", "b": "bl_housing", "fastens": true, "min": -0.1},
    {"a": "bl_m1", "b": "bl_sun", "shaft": true},
    {"a": "bl_m2", "b": "bl_esun", "shaft": true},
    {"a": "bl_m2", "b": "bl_thigh", "fastens": true, "min": -0.1},
    {"a": "bl_housing", "b": "left", "min": 0},
    {"a": "bl_bridge", "b": "bl_housing", "min": 0},
    {"a": "bl_b1", "b": "bl_bridge", "seat": "press"},
    {"a": "bl_ecarrier", "b": "bl_ering", "min": -1},
    {"a": "bl_pad", "b": "bl_shin", "min": -2},
    {"a": "br_m1", "b": "br_housing", "fastens": true, "min": -0.1},
    {"a": "br_m1", "b": "br_sun", "shaft": true},
    {"a": "br_m2", "b": "br_esun", "shaft": true},
    {"a": "br_m2", "b": "br_thigh", "fastens": true, "min": -0.1},
    {"a": "br_housing", "b": "right", "min": 0},
    {"a": "br_bridge", "b": "br_housing", "min": 0},
    {"a": "br_b1", "b": "br_bridge", "seat": "press"},
    {"a": "br_ecarrier", "b": "br_ering", "min": -1},
    {"a": "br_pad", "b": "br_shin", "min": -2}
  ],
  "wires": [
    {"id": "fl_hd_motor", "from": "fl_m1.connector", "to": "fl_board1.top", "gauge": "awg24", "colour": "black, red, green, blue", "connectors": ["JST-XH 4 pin", "screw terminal"]},
    {"id": "fl_hd_signal", "from": "fl_board1.centre", "to": "mega.S0", "gauge": "awg26", "conductors": 4, "colour": "white, yellow, green, black", "connectors": ["Dupont 4 pin", "Dupont"], "note": "EN, STEP, DIR and GND: the streamer's axis 0"},
    {"id": "fl_kd_motor", "from": "fl_m2.connector", "to": "fl_board2.top", "via": ["fl_thigh.cable"], "gauge": "awg24", "colour": "black, red, green, blue", "connectors": ["JST-XH 4 pin", "screw terminal"]},
    {"id": "fl_kd_signal", "from": "fl_board2.centre", "to": "mega.S1", "gauge": "awg26", "conductors": 4, "colour": "white, yellow, green, black", "connectors": ["Dupont 4 pin", "Dupont"], "note": "EN, STEP, DIR and GND: the streamer's axis 1"},
    {"id": "fr_hd_motor", "from": "fr_m1.connector", "to": "fr_board1.top", "gauge": "awg24", "colour": "black, red, green, blue", "connectors": ["JST-XH 4 pin", "screw terminal"]},
    {"id": "fr_hd_signal", "from": "fr_board1.centre", "to": "mega.S2", "gauge": "awg26", "conductors": 4, "colour": "white, yellow, green, black", "connectors": ["Dupont 4 pin", "Dupont"], "note": "EN, STEP, DIR and GND: the streamer's axis 2"},
    {"id": "fr_kd_motor", "from": "fr_m2.connector", "to": "fr_board2.top", "via": ["fr_thigh.cable"], "gauge": "awg24", "colour": "black, red, green, blue", "connectors": ["JST-XH 4 pin", "screw terminal"]},
    {"id": "fr_kd_signal", "from": "fr_board2.centre", "to": "mega.S3", "gauge": "awg26", "conductors": 4, "colour": "white, yellow, green, black", "connectors": ["Dupont 4 pin", "Dupont"], "note": "EN, STEP, DIR and GND: the streamer's axis 3"},
    {"id": "bl_hd_motor", "from": "bl_m1.connector", "to": "bl_board1.top", "gauge": "awg24", "colour": "black, red, green, blue", "connectors": ["JST-XH 4 pin", "screw terminal"]},
    {"id": "bl_hd_signal", "from": "bl_board1.centre", "to": "mega.S4", "gauge": "awg26", "conductors": 4, "colour": "white, yellow, green, black", "connectors": ["Dupont 4 pin", "Dupont"], "note": "EN, STEP, DIR and GND: the streamer's axis 4"},
    {"id": "bl_kd_motor", "from": "bl_m2.connector", "to": "bl_board2.top", "via": ["bl_thigh.cable"], "gauge": "awg24", "colour": "black, red, green, blue", "connectors": ["JST-XH 4 pin", "screw terminal"]},
    {"id": "bl_kd_signal", "from": "bl_board2.centre", "to": "mega.S5", "gauge": "awg26", "conductors": 4, "colour": "white, yellow, green, black", "connectors": ["Dupont 4 pin", "Dupont"], "note": "EN, STEP, DIR and GND: the streamer's axis 5"},
    {"id": "br_hd_motor", "from": "br_m1.connector", "to": "br_board1.top", "gauge": "awg24", "colour": "black, red, green, blue", "connectors": ["JST-XH 4 pin", "screw terminal"]},
    {"id": "br_hd_signal", "from": "br_board1.centre", "to": "mega.S6", "gauge": "awg26", "conductors": 4, "colour": "white, yellow, green, black", "connectors": ["Dupont 4 pin", "Dupont"], "note": "EN, STEP, DIR and GND: the streamer's axis 6"},
    {"id": "br_kd_motor", "from": "br_m2.connector", "to": "br_board2.top", "via": ["br_thigh.cable"], "gauge": "awg24", "colour": "black, red, green, blue", "connectors": ["JST-XH 4 pin", "screw terminal"]},
    {"id": "br_kd_signal", "from": "br_board2.centre", "to": "mega.S7", "gauge": "awg26", "conductors": 4, "colour": "white, yellow, green, black", "connectors": ["Dupont 4 pin", "Dupont"], "note": "EN, STEP, DIR and GND: the streamer's axis 7"},
    {"id": "fl_board1_power", "from": "psu.terminals", "to": "fl_board1.bottom", "gauge": "awg22", "colour": "red, black", "conductors": 2, "current": 2, "connectors": ["Ring terminal", "Screw terminal"], "note": "12 V into the breakout's motor supply terminals (VMOT and GND), with its 100 uF capacitor across them"},
    {"id": "fl_board2_power", "from": "psu.terminals", "to": "fl_board2.bottom", "gauge": "awg22", "colour": "red, black", "conductors": 2, "current": 2, "connectors": ["Ring terminal", "Screw terminal"], "note": "12 V into the breakout's motor supply terminals (VMOT and GND), with its 100 uF capacitor across them"},
    {"id": "fr_board1_power", "from": "psu.terminals", "to": "fr_board1.bottom", "gauge": "awg22", "colour": "red, black", "conductors": 2, "current": 2, "connectors": ["Ring terminal", "Screw terminal"], "note": "12 V into the breakout's motor supply terminals (VMOT and GND), with its 100 uF capacitor across them"},
    {"id": "fr_board2_power", "from": "psu.terminals", "to": "fr_board2.bottom", "gauge": "awg22", "colour": "red, black", "conductors": 2, "current": 2, "connectors": ["Ring terminal", "Screw terminal"], "note": "12 V into the breakout's motor supply terminals (VMOT and GND), with its 100 uF capacitor across them"},
    {"id": "bl_board1_power", "from": "psu.terminals", "to": "bl_board1.bottom", "gauge": "awg22", "colour": "red, black", "conductors": 2, "current": 2, "connectors": ["Ring terminal", "Screw terminal"], "note": "12 V into the breakout's motor supply terminals (VMOT and GND), with its 100 uF capacitor across them"},
    {"id": "bl_board2_power", "from": "psu.terminals", "to": "bl_board2.bottom", "gauge": "awg22", "colour": "red, black", "conductors": 2, "current": 2, "connectors": ["Ring terminal", "Screw terminal"], "note": "12 V into the breakout's motor supply terminals (VMOT and GND), with its 100 uF capacitor across them"},
    {"id": "br_board1_power", "from": "psu.terminals", "to": "br_board1.bottom", "gauge": "awg22", "colour": "red, black", "conductors": 2, "current": 2, "connectors": ["Ring terminal", "Screw terminal"], "note": "12 V into the breakout's motor supply terminals (VMOT and GND), with its 100 uF capacitor across them"},
    {"id": "br_board2_power", "from": "psu.terminals", "to": "br_board2.bottom", "gauge": "awg22", "colour": "red, black", "conductors": 2, "current": 2, "connectors": ["Ring terminal", "Screw terminal"], "note": "12 V into the breakout's motor supply terminals (VMOT and GND), with its 100 uF capacitor across them"}
  ],
  "gait": {"legs": ["fl_shin.tip", "fr_shin.tip", "bl_shin.tip", "br_shin.tip"], "pattern": "trot", "stride": "leg.stride", "lift": "leg.lift", "period": 2, "height": "leg.stance", "mass": "leg.robot_mass", "clearance": 11},
  "poses": { "standing": {"fl_hd": -3171.4, "fl_kd": 2597, "fr_hd": -5587.7, "fr_kd": -2236, "bl_hd": -5587.7, "bl_kd": -2236, "br_hd": -3171.4, "br_kd": 2597} }
}
```

```json projects/leg/assemblies/crawl.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/assembly.schema.json",
  "title": "A quadruped, crawling: a statically stable walk",
  "kind": "fit",
  "description": "The same machine as quadruped.json, walking one foot at a time, so its centre of mass is inside its feet in every pose. A design, not yet a build.",
  "uses": ["leg"],
  "items": [
    {"id": "left", "object": "side", "at": [0, "leg.body_w",0], "rotate": [90,0,0]},
    {"id": "right", "object": "side", "at": [0, "0 - leg.body_w",0], "rotate": [90,0,180]},
    {"id": "beam1", "object": "beam", "at": ["left.beam_at",0,-6], "rotate": [0,0,90]},
    {"id": "beam2", "object": "beam", "at": ["0 - left.beam_at",0,-6], "rotate": [0,0,90]},
    {"id": "fl_m1", "motor": {"model": "17HS4401", "drives": "fl_hd", "speed": 200, "duty": 0.3, "current": 1, "microsteps": 8, "driver": "fl_d1"}},
    {"id": "fl_housing", "object": "housing", "at": ["leg.body_half", "leg.body_w",0], "rotate": [-90,0,0]},
    {"id": "fl_sun", "object": "sun"},
    {"id": "fl_carrier", "object": "speck"},
    {"id": "fl_p1", "object": "planet"},
    {"id": "fl_p2", "object": "planet"},
    {"id": "fl_p3", "object": "planet"},
    {"id": "fl_output", "object": "output"},
    {"id": "fl_spindle", "object": "spindle"},
    {"id": "fl_bridge", "object": "bridge"},
    {"id": "fl_b1", "bought": "bearing-6800"},
    {"id": "fl_thigh", "object": "thigh"},
    {"id": "fl_m2", "motor": {"model": "17HS4401", "drives": "fl_kd", "speed": 200, "duty": 0.3, "current": 1, "microsteps": 8, "driver": "fl_d2"}},
    {"id": "fl_esun", "object": "sun", "set": {"tip": 11.7}},
    {"id": "fl_ecarrier", "object": "speck"},
    {"id": "fl_ering", "object": "speck"},
    {"id": "fl_ep1", "object": "planet"},
    {"id": "fl_ep2", "object": "planet"},
    {"id": "fl_ep3", "object": "planet"},
    {"id": "fl_eoutput", "object": "output"},
    {"id": "fl_clip1", "object": "clip"},
    {"id": "fl_clip2", "object": "clip"},
    {"id": "fl_clip3", "object": "clip"},
    {"id": "fl_shin", "object": "shin"},
    {"id": "fl_pad", "object": "pad"},
    {"id": "fr_m1", "motor": {"model": "17HS4401", "drives": "fr_hd", "speed": 200, "duty": 0.3, "current": 1, "microsteps": 8, "driver": "fr_d1"}},
    {"id": "fr_housing", "object": "housing", "at": ["leg.body_half", "0 - leg.body_w",0], "rotate": [-90,0,180]},
    {"id": "fr_sun", "object": "sun"},
    {"id": "fr_carrier", "object": "speck"},
    {"id": "fr_p1", "object": "planet"},
    {"id": "fr_p2", "object": "planet"},
    {"id": "fr_p3", "object": "planet"},
    {"id": "fr_output", "object": "output"},
    {"id": "fr_spindle", "object": "spindle"},
    {"id": "fr_bridge", "object": "bridge"},
    {"id": "fr_b1", "bought": "bearing-6800"},
    {"id": "fr_thigh", "object": "thigh"},
    {"id": "fr_m2", "motor": {"model": "17HS4401", "drives": "fr_kd", "speed": 200, "duty": 0.3, "current": 1, "microsteps": 8, "driver": "fr_d2"}},
    {"id": "fr_esun", "object": "sun", "set": {"tip": 11.7}},
    {"id": "fr_ecarrier", "object": "speck"},
    {"id": "fr_ering", "object": "speck"},
    {"id": "fr_ep1", "object": "planet"},
    {"id": "fr_ep2", "object": "planet"},
    {"id": "fr_ep3", "object": "planet"},
    {"id": "fr_eoutput", "object": "output"},
    {"id": "fr_clip1", "object": "clip"},
    {"id": "fr_clip2", "object": "clip"},
    {"id": "fr_clip3", "object": "clip"},
    {"id": "fr_shin", "object": "shin"},
    {"id": "fr_pad", "object": "pad"},
    {"id": "bl_m1", "motor": {"model": "17HS4401", "drives": "bl_hd", "speed": 200, "duty": 0.3, "current": 1, "microsteps": 8, "driver": "bl_d1"}},
    {"id": "bl_housing", "object": "housing", "at": ["0 - leg.body_half", "leg.body_w",0], "rotate": [-90,0,0]},
    {"id": "bl_sun", "object": "sun"},
    {"id": "bl_carrier", "object": "speck"},
    {"id": "bl_p1", "object": "planet"},
    {"id": "bl_p2", "object": "planet"},
    {"id": "bl_p3", "object": "planet"},
    {"id": "bl_output", "object": "output"},
    {"id": "bl_spindle", "object": "spindle"},
    {"id": "bl_bridge", "object": "bridge"},
    {"id": "bl_b1", "bought": "bearing-6800"},
    {"id": "bl_thigh", "object": "thigh"},
    {"id": "bl_m2", "motor": {"model": "17HS4401", "drives": "bl_kd", "speed": 200, "duty": 0.3, "current": 1, "microsteps": 8, "driver": "bl_d2"}},
    {"id": "bl_esun", "object": "sun", "set": {"tip": 11.7}},
    {"id": "bl_ecarrier", "object": "speck"},
    {"id": "bl_ering", "object": "speck"},
    {"id": "bl_ep1", "object": "planet"},
    {"id": "bl_ep2", "object": "planet"},
    {"id": "bl_ep3", "object": "planet"},
    {"id": "bl_eoutput", "object": "output"},
    {"id": "bl_clip1", "object": "clip"},
    {"id": "bl_clip2", "object": "clip"},
    {"id": "bl_clip3", "object": "clip"},
    {"id": "bl_shin", "object": "shin"},
    {"id": "bl_pad", "object": "pad"},
    {"id": "br_m1", "motor": {"model": "17HS4401", "drives": "br_hd", "speed": 200, "duty": 0.3, "current": 1, "microsteps": 8, "driver": "br_d1"}},
    {"id": "br_housing", "object": "housing", "at": ["0 - leg.body_half", "0 - leg.body_w",0], "rotate": [-90,0,180]},
    {"id": "br_sun", "object": "sun"},
    {"id": "br_carrier", "object": "speck"},
    {"id": "br_p1", "object": "planet"},
    {"id": "br_p2", "object": "planet"},
    {"id": "br_p3", "object": "planet"},
    {"id": "br_output", "object": "output"},
    {"id": "br_spindle", "object": "spindle"},
    {"id": "br_bridge", "object": "bridge"},
    {"id": "br_b1", "bought": "bearing-6800"},
    {"id": "br_thigh", "object": "thigh"},
    {"id": "br_m2", "motor": {"model": "17HS4401", "drives": "br_kd", "speed": 200, "duty": 0.3, "current": 1, "microsteps": 8, "driver": "br_d2"}},
    {"id": "br_esun", "object": "sun", "set": {"tip": 11.7}},
    {"id": "br_ecarrier", "object": "speck"},
    {"id": "br_ering", "object": "speck"},
    {"id": "br_ep1", "object": "planet"},
    {"id": "br_ep2", "object": "planet"},
    {"id": "br_ep3", "object": "planet"},
    {"id": "br_eoutput", "object": "output"},
    {"id": "br_clip1", "object": "clip"},
    {"id": "br_clip2", "object": "clip"},
    {"id": "br_clip3", "object": "clip"},
    {"id": "br_shin", "object": "shin"},
    {"id": "br_pad", "object": "pad"},
    {"id": "mega", "bought": "arduino-mega-2560", "at": [0, 0, 20]},
    {"id": "fl_board1", "bought": "driver-breakout", "at": [69, 19.5, 48]},
    {"id": "fl_d1", "bought": "drv8825", "at": [69, 19.5, 58.1]},
    {"id": "fl_board2", "bought": "driver-breakout", "at": [23, 19.5, 48]},
    {"id": "fl_d2", "bought": "drv8825", "at": [23, 19.5, 58.1]},
    {"id": "fr_board1", "bought": "driver-breakout", "at": [69, -19.5, 48]},
    {"id": "fr_d1", "bought": "drv8825", "at": [69, -19.5, 58.1]},
    {"id": "fr_board2", "bought": "driver-breakout", "at": [23, -19.5, 48]},
    {"id": "fr_d2", "bought": "drv8825", "at": [23, -19.5, 58.1]},
    {"id": "bl_board1", "bought": "driver-breakout", "at": [-69, 19.5, 48]},
    {"id": "bl_d1", "bought": "drv8825", "at": [-69, 19.5, 58.1]},
    {"id": "bl_board2", "bought": "driver-breakout", "at": [-23, 19.5, 48]},
    {"id": "bl_d2", "bought": "drv8825", "at": [-23, 19.5, 58.1]},
    {"id": "br_board1", "bought": "driver-breakout", "at": [-69, -19.5, 48]},
    {"id": "br_d1", "bought": "drv8825", "at": [-69, -19.5, 58.1]},
    {"id": "br_board2", "bought": "driver-breakout", "at": [-23, -19.5, 48]},
    {"id": "br_d2", "bought": "drv8825", "at": [-23, -19.5, 58.1]}
  ],
  "joints": [
    {"id": "fl_m1_on", "type": "fixed", "parent": "fl_housing.motor", "child": "fl_m1.face"},
    {"id": "fl_hd", "type": "revolute", "parent": "fl_housing.axis", "child": "fl_sun.axis", "min": -6200, "max": 6200},
    {"id": "fl_turn", "type": "revolute", "parent": "fl_housing.axis", "child": "fl_carrier.axis", "min": -6200, "max": 6200},
    {"id": "fl_s1", "type": "revolute", "parent": "fl_carrier.a", "child": "fl_p1.axis", "min": -30000, "max": 30000},
    {"id": "fl_s2", "type": "revolute", "parent": "fl_carrier.b", "child": "fl_p2.axis", "min": -30000, "max": 30000},
    {"id": "fl_s3", "type": "revolute", "parent": "fl_carrier.c", "child": "fl_p3.axis", "min": -30000, "max": 30000},
    {"id": "fl_hip", "type": "revolute", "parent": {"item": "fl_housing", "at": [0,0, "leg.plate + leg.gear + leg.ring_gap"], "axis": [0,0,1]}, "child": "fl_output.axis", "min": 30, "max": 150, "label": "fl hip"},
    {"id": "fl_spindle_on", "type": "fixed", "parent": "fl_output.flange", "child": "fl_spindle.down"},
    {"id": "fl_thigh_on", "type": "fixed", "parent": "fl_spindle.seat", "child": "fl_thigh.hub"},
    {"id": "fl_bridge_on", "type": "fixed", "parent": {"item": "fl_housing", "at": [0,0, "leg.bridge_low"], "axis": [0,0,1]}, "child": "fl_bridge.under"},
    {"id": "fl_b1_on", "type": "fixed", "parent": {"item": "fl_housing", "at": [0,0, "leg.bridge_low + leg.bridge - leg.bearing_width"], "axis": [0,0,1]}, "child": "fl_b1.face"},
    {"id": "fl_m2_on", "type": "fixed", "parent": "fl_thigh.motor", "child": "fl_m2.face"},
    {"id": "fl_kd", "type": "revolute", "parent": "fl_thigh.knee", "child": "fl_esun.axis", "min": -6200, "max": 6200},
    {"id": "fl_ering_on", "type": "fixed", "parent": "fl_thigh.knee", "child": "fl_ering.axis"},
    {"id": "fl_eturn", "type": "revolute", "parent": "fl_thigh.knee", "child": "fl_ecarrier.axis", "min": -6200, "max": 6200},
    {"id": "fl_es1", "type": "revolute", "parent": "fl_ecarrier.a", "child": "fl_ep1.axis", "min": -30000, "max": 30000},
    {"id": "fl_es2", "type": "revolute", "parent": "fl_ecarrier.b", "child": "fl_ep2.axis", "min": -30000, "max": 30000},
    {"id": "fl_es3", "type": "revolute", "parent": "fl_ecarrier.c", "child": "fl_ep3.axis", "min": -30000, "max": 30000},
    {"id": "fl_knee", "type": "revolute", "parent": "fl_thigh.output", "child": "fl_eoutput.axis", "min": -150, "max": 0, "label": "fl knee"},
    {"id": "fl_c1_on", "type": "fixed", "parent": "fl_thigh.clip1", "child": "fl_clip1.post"},
    {"id": "fl_c2_on", "type": "fixed", "parent": "fl_thigh.clip2", "child": "fl_clip2.post"},
    {"id": "fl_c3_on", "type": "fixed", "parent": "fl_thigh.clip3", "child": "fl_clip3.post"},
    {"id": "fl_shin_on", "type": "fixed", "parent": "fl_eoutput.flange", "child": "fl_shin.hub"},
    {"id": "fl_pad_on", "type": "fixed", "parent": "fl_shin.pad", "child": "fl_pad.axis"},
    {"id": "fr_m1_on", "type": "fixed", "parent": "fr_housing.motor", "child": "fr_m1.face"},
    {"id": "fr_hd", "type": "revolute", "parent": "fr_housing.axis", "child": "fr_sun.axis", "min": -6200, "max": 6200},
    {"id": "fr_turn", "type": "revolute", "parent": "fr_housing.axis", "child": "fr_carrier.axis", "min": -6200, "max": 6200},
    {"id": "fr_s1", "type": "revolute", "parent": "fr_carrier.a", "child": "fr_p1.axis", "min": -30000, "max": 30000},
    {"id": "fr_s2", "type": "revolute", "parent": "fr_carrier.b", "child": "fr_p2.axis", "min": -30000, "max": 30000},
    {"id": "fr_s3", "type": "revolute", "parent": "fr_carrier.c", "child": "fr_p3.axis", "min": -30000, "max": 30000},
    {"id": "fr_hip", "type": "revolute", "parent": {"item": "fr_housing", "at": [0,0, "leg.plate + leg.gear + leg.ring_gap"], "axis": [0,0,1]}, "child": "fr_output.axis", "min": 30, "max": 150, "label": "fr hip"},
    {"id": "fr_spindle_on", "type": "fixed", "parent": "fr_output.flange", "child": "fr_spindle.down"},
    {"id": "fr_thigh_on", "type": "fixed", "parent": "fr_spindle.seat", "child": "fr_thigh.hub"},
    {"id": "fr_bridge_on", "type": "fixed", "parent": {"item": "fr_housing", "at": [0,0, "leg.bridge_low"], "axis": [0,0,1]}, "child": "fr_bridge.under"},
    {"id": "fr_b1_on", "type": "fixed", "parent": {"item": "fr_housing", "at": [0,0, "leg.bridge_low + leg.bridge - leg.bearing_width"], "axis": [0,0,1]}, "child": "fr_b1.face"},
    {"id": "fr_m2_on", "type": "fixed", "parent": "fr_thigh.motor", "child": "fr_m2.face"},
    {"id": "fr_kd", "type": "revolute", "parent": "fr_thigh.knee", "child": "fr_esun.axis", "min": -6200, "max": 6200},
    {"id": "fr_ering_on", "type": "fixed", "parent": "fr_thigh.knee", "child": "fr_ering.axis"},
    {"id": "fr_eturn", "type": "revolute", "parent": "fr_thigh.knee", "child": "fr_ecarrier.axis", "min": -6200, "max": 6200},
    {"id": "fr_es1", "type": "revolute", "parent": "fr_ecarrier.a", "child": "fr_ep1.axis", "min": -30000, "max": 30000},
    {"id": "fr_es2", "type": "revolute", "parent": "fr_ecarrier.b", "child": "fr_ep2.axis", "min": -30000, "max": 30000},
    {"id": "fr_es3", "type": "revolute", "parent": "fr_ecarrier.c", "child": "fr_ep3.axis", "min": -30000, "max": 30000},
    {"id": "fr_knee", "type": "revolute", "parent": "fr_thigh.output", "child": "fr_eoutput.axis", "min": 0, "max": 150, "label": "fr knee"},
    {"id": "fr_c1_on", "type": "fixed", "parent": "fr_thigh.clip1", "child": "fr_clip1.post"},
    {"id": "fr_c2_on", "type": "fixed", "parent": "fr_thigh.clip2", "child": "fr_clip2.post"},
    {"id": "fr_c3_on", "type": "fixed", "parent": "fr_thigh.clip3", "child": "fr_clip3.post"},
    {"id": "fr_shin_on", "type": "fixed", "parent": "fr_eoutput.flange", "child": "fr_shin.hub"},
    {"id": "fr_pad_on", "type": "fixed", "parent": "fr_shin.pad", "child": "fr_pad.axis"},
    {"id": "bl_m1_on", "type": "fixed", "parent": "bl_housing.motor", "child": "bl_m1.face"},
    {"id": "bl_hd", "type": "revolute", "parent": "bl_housing.axis", "child": "bl_sun.axis", "min": -6200, "max": 6200},
    {"id": "bl_turn", "type": "revolute", "parent": "bl_housing.axis", "child": "bl_carrier.axis", "min": -6200, "max": 6200},
    {"id": "bl_s1", "type": "revolute", "parent": "bl_carrier.a", "child": "bl_p1.axis", "min": -30000, "max": 30000},
    {"id": "bl_s2", "type": "revolute", "parent": "bl_carrier.b", "child": "bl_p2.axis", "min": -30000, "max": 30000},
    {"id": "bl_s3", "type": "revolute", "parent": "bl_carrier.c", "child": "bl_p3.axis", "min": -30000, "max": 30000},
    {"id": "bl_hip", "type": "revolute", "parent": {"item": "bl_housing", "at": [0,0, "leg.plate + leg.gear + leg.ring_gap"], "axis": [0,0,1]}, "child": "bl_output.axis", "min": 30, "max": 150, "label": "bl hip"},
    {"id": "bl_spindle_on", "type": "fixed", "parent": "bl_output.flange", "child": "bl_spindle.down"},
    {"id": "bl_thigh_on", "type": "fixed", "parent": "bl_spindle.seat", "child": "bl_thigh.hub"},
    {"id": "bl_bridge_on", "type": "fixed", "parent": {"item": "bl_housing", "at": [0,0, "leg.bridge_low"], "axis": [0,0,1]}, "child": "bl_bridge.under"},
    {"id": "bl_b1_on", "type": "fixed", "parent": {"item": "bl_housing", "at": [0,0, "leg.bridge_low + leg.bridge - leg.bearing_width"], "axis": [0,0,1]}, "child": "bl_b1.face"},
    {"id": "bl_m2_on", "type": "fixed", "parent": "bl_thigh.motor", "child": "bl_m2.face"},
    {"id": "bl_kd", "type": "revolute", "parent": "bl_thigh.knee", "child": "bl_esun.axis", "min": -6200, "max": 6200},
    {"id": "bl_ering_on", "type": "fixed", "parent": "bl_thigh.knee", "child": "bl_ering.axis"},
    {"id": "bl_eturn", "type": "revolute", "parent": "bl_thigh.knee", "child": "bl_ecarrier.axis", "min": -6200, "max": 6200},
    {"id": "bl_es1", "type": "revolute", "parent": "bl_ecarrier.a", "child": "bl_ep1.axis", "min": -30000, "max": 30000},
    {"id": "bl_es2", "type": "revolute", "parent": "bl_ecarrier.b", "child": "bl_ep2.axis", "min": -30000, "max": 30000},
    {"id": "bl_es3", "type": "revolute", "parent": "bl_ecarrier.c", "child": "bl_ep3.axis", "min": -30000, "max": 30000},
    {"id": "bl_knee", "type": "revolute", "parent": "bl_thigh.output", "child": "bl_eoutput.axis", "min": 0, "max": 150, "label": "bl knee"},
    {"id": "bl_c1_on", "type": "fixed", "parent": "bl_thigh.clip1", "child": "bl_clip1.post"},
    {"id": "bl_c2_on", "type": "fixed", "parent": "bl_thigh.clip2", "child": "bl_clip2.post"},
    {"id": "bl_c3_on", "type": "fixed", "parent": "bl_thigh.clip3", "child": "bl_clip3.post"},
    {"id": "bl_shin_on", "type": "fixed", "parent": "bl_eoutput.flange", "child": "bl_shin.hub"},
    {"id": "bl_pad_on", "type": "fixed", "parent": "bl_shin.pad", "child": "bl_pad.axis"},
    {"id": "br_m1_on", "type": "fixed", "parent": "br_housing.motor", "child": "br_m1.face"},
    {"id": "br_hd", "type": "revolute", "parent": "br_housing.axis", "child": "br_sun.axis", "min": -6200, "max": 6200},
    {"id": "br_turn", "type": "revolute", "parent": "br_housing.axis", "child": "br_carrier.axis", "min": -6200, "max": 6200},
    {"id": "br_s1", "type": "revolute", "parent": "br_carrier.a", "child": "br_p1.axis", "min": -30000, "max": 30000},
    {"id": "br_s2", "type": "revolute", "parent": "br_carrier.b", "child": "br_p2.axis", "min": -30000, "max": 30000},
    {"id": "br_s3", "type": "revolute", "parent": "br_carrier.c", "child": "br_p3.axis", "min": -30000, "max": 30000},
    {"id": "br_hip", "type": "revolute", "parent": {"item": "br_housing", "at": [0,0, "leg.plate + leg.gear + leg.ring_gap"], "axis": [0,0,1]}, "child": "br_output.axis", "min": 30, "max": 150, "label": "br hip"},
    {"id": "br_spindle_on", "type": "fixed", "parent": "br_output.flange", "child": "br_spindle.down"},
    {"id": "br_thigh_on", "type": "fixed", "parent": "br_spindle.seat", "child": "br_thigh.hub"},
    {"id": "br_bridge_on", "type": "fixed", "parent": {"item": "br_housing", "at": [0,0, "leg.bridge_low"], "axis": [0,0,1]}, "child": "br_bridge.under"},
    {"id": "br_b1_on", "type": "fixed", "parent": {"item": "br_housing", "at": [0,0, "leg.bridge_low + leg.bridge - leg.bearing_width"], "axis": [0,0,1]}, "child": "br_b1.face"},
    {"id": "br_m2_on", "type": "fixed", "parent": "br_thigh.motor", "child": "br_m2.face"},
    {"id": "br_kd", "type": "revolute", "parent": "br_thigh.knee", "child": "br_esun.axis", "min": -6200, "max": 6200},
    {"id": "br_ering_on", "type": "fixed", "parent": "br_thigh.knee", "child": "br_ering.axis"},
    {"id": "br_eturn", "type": "revolute", "parent": "br_thigh.knee", "child": "br_ecarrier.axis", "min": -6200, "max": 6200},
    {"id": "br_es1", "type": "revolute", "parent": "br_ecarrier.a", "child": "br_ep1.axis", "min": -30000, "max": 30000},
    {"id": "br_es2", "type": "revolute", "parent": "br_ecarrier.b", "child": "br_ep2.axis", "min": -30000, "max": 30000},
    {"id": "br_es3", "type": "revolute", "parent": "br_ecarrier.c", "child": "br_ep3.axis", "min": -30000, "max": 30000},
    {"id": "br_knee", "type": "revolute", "parent": "br_thigh.output", "child": "br_eoutput.axis", "min": -150, "max": 0, "label": "br knee"},
    {"id": "br_c1_on", "type": "fixed", "parent": "br_thigh.clip1", "child": "br_clip1.post"},
    {"id": "br_c2_on", "type": "fixed", "parent": "br_thigh.clip2", "child": "br_clip2.post"},
    {"id": "br_c3_on", "type": "fixed", "parent": "br_thigh.clip3", "child": "br_clip3.post"},
    {"id": "br_shin_on", "type": "fixed", "parent": "br_eoutput.flange", "child": "br_shin.hub"},
    {"id": "br_pad_on", "type": "fixed", "parent": "br_shin.pad", "child": "br_pad.axis"}
  ],
  "planetary": [
    {"sun": "fl_sun", "carrier": "fl_carrier", "ring": "fl_housing", "planets": ["fl_p1", "fl_p2", "fl_p3"], "drive": "sun", "module": 1, "teeth": [18,18,54], "output": {"ring": "fl_output", "planet": 21, "teeth": 57}},
    {"sun": "fl_esun", "carrier": "fl_ecarrier", "ring": "fl_ering", "planets": ["fl_ep1", "fl_ep2", "fl_ep3"], "drive": "sun", "module": 1, "teeth": [18,18,54], "output": {"ring": "fl_eoutput", "planet": 21, "teeth": 57}},
    {"sun": "fr_sun", "carrier": "fr_carrier", "ring": "fr_housing", "planets": ["fr_p1", "fr_p2", "fr_p3"], "drive": "sun", "module": 1, "teeth": [18,18,54], "output": {"ring": "fr_output", "planet": 21, "teeth": 57}},
    {"sun": "fr_esun", "carrier": "fr_ecarrier", "ring": "fr_ering", "planets": ["fr_ep1", "fr_ep2", "fr_ep3"], "drive": "sun", "module": 1, "teeth": [18,18,54], "output": {"ring": "fr_eoutput", "planet": 21, "teeth": 57}},
    {"sun": "bl_sun", "carrier": "bl_carrier", "ring": "bl_housing", "planets": ["bl_p1", "bl_p2", "bl_p3"], "drive": "sun", "module": 1, "teeth": [18,18,54], "output": {"ring": "bl_output", "planet": 21, "teeth": 57}},
    {"sun": "bl_esun", "carrier": "bl_ecarrier", "ring": "bl_ering", "planets": ["bl_ep1", "bl_ep2", "bl_ep3"], "drive": "sun", "module": 1, "teeth": [18,18,54], "output": {"ring": "bl_eoutput", "planet": 21, "teeth": 57}},
    {"sun": "br_sun", "carrier": "br_carrier", "ring": "br_housing", "planets": ["br_p1", "br_p2", "br_p3"], "drive": "sun", "module": 1, "teeth": [18,18,54], "output": {"ring": "br_output", "planet": 21, "teeth": 57}},
    {"sun": "br_esun", "carrier": "br_ecarrier", "ring": "br_ering", "planets": ["br_ep1", "br_ep2", "br_ep3"], "drive": "sun", "module": 1, "teeth": [18,18,54], "output": {"ring": "br_eoutput", "planet": 21, "teeth": 57}}
  ],
  "fasten": [
    {"screw": "M3 cap", "through": ["fl_housing"], "into": "left", "at": ["fl_housing.f1", "fl_housing.f2", "fl_housing.f3"], "note": "The fl housing on the left side plate"},
    {"screw": "M3 cap", "through": ["fl_bridge"], "into": "fl_housing", "at": ["fl_bridge.s1", "fl_bridge.s2", "fl_bridge.s3"], "note": "The fl bridge on the housing's posts"},
    {"screw": "M3 countersunk", "through": ["fl_spindle"], "into": "fl_output", "at": ["fl_spindle.b1", "fl_spindle.b2", "fl_spindle.b3", "fl_spindle.b4"], "note": "The fl spindle on the hip's output, its heads flush under the bridge"},
    {"screw": "M3 cap", "through": ["fl_thigh"], "into": "fl_spindle", "at": ["fl_thigh.hub"], "note": "The fl thigh clamped down on the spindle's hexagon"},
    {"screw": "M3 cap", "through": ["fl_clip1"], "into": "fl_thigh", "at": ["fl_clip1.post"], "note": "A clip on its post"},
    {"screw": "M3 cap", "through": ["fl_clip2"], "into": "fl_thigh", "at": ["fl_clip2.post"], "note": "A clip on its post"},
    {"screw": "M3 cap", "through": ["fl_clip3"], "into": "fl_thigh", "at": ["fl_clip3.post"], "note": "A clip on its post"},
    {"screw": "M3 cap", "through": ["fl_shin"], "into": "fl_eoutput", "at": ["fl_shin.b1", "fl_shin.b2", "fl_shin.b3", "fl_shin.b4"], "note": "The fl shin on the knee's output"},
    {"screw": "M3 cap", "through": ["fr_housing"], "into": "right", "at": ["fr_housing.f1", "fr_housing.f2", "fr_housing.f3"], "note": "The fr housing on the right side plate"},
    {"screw": "M3 cap", "through": ["fr_bridge"], "into": "fr_housing", "at": ["fr_bridge.s1", "fr_bridge.s2", "fr_bridge.s3"], "note": "The fr bridge on the housing's posts"},
    {"screw": "M3 countersunk", "through": ["fr_spindle"], "into": "fr_output", "at": ["fr_spindle.b1", "fr_spindle.b2", "fr_spindle.b3", "fr_spindle.b4"], "note": "The fr spindle on the hip's output, its heads flush under the bridge"},
    {"screw": "M3 cap", "through": ["fr_thigh"], "into": "fr_spindle", "at": ["fr_thigh.hub"], "note": "The fr thigh clamped down on the spindle's hexagon"},
    {"screw": "M3 cap", "through": ["fr_clip1"], "into": "fr_thigh", "at": ["fr_clip1.post"], "note": "A clip on its post"},
    {"screw": "M3 cap", "through": ["fr_clip2"], "into": "fr_thigh", "at": ["fr_clip2.post"], "note": "A clip on its post"},
    {"screw": "M3 cap", "through": ["fr_clip3"], "into": "fr_thigh", "at": ["fr_clip3.post"], "note": "A clip on its post"},
    {"screw": "M3 cap", "through": ["fr_shin"], "into": "fr_eoutput", "at": ["fr_shin.b1", "fr_shin.b2", "fr_shin.b3", "fr_shin.b4"], "note": "The fr shin on the knee's output"},
    {"screw": "M3 cap", "through": ["bl_housing"], "into": "left", "at": ["bl_housing.f1", "bl_housing.f2", "bl_housing.f3"], "note": "The bl housing on the left side plate"},
    {"screw": "M3 cap", "through": ["bl_bridge"], "into": "bl_housing", "at": ["bl_bridge.s1", "bl_bridge.s2", "bl_bridge.s3"], "note": "The bl bridge on the housing's posts"},
    {"screw": "M3 countersunk", "through": ["bl_spindle"], "into": "bl_output", "at": ["bl_spindle.b1", "bl_spindle.b2", "bl_spindle.b3", "bl_spindle.b4"], "note": "The bl spindle on the hip's output, its heads flush under the bridge"},
    {"screw": "M3 cap", "through": ["bl_thigh"], "into": "bl_spindle", "at": ["bl_thigh.hub"], "note": "The bl thigh clamped down on the spindle's hexagon"},
    {"screw": "M3 cap", "through": ["bl_clip1"], "into": "bl_thigh", "at": ["bl_clip1.post"], "note": "A clip on its post"},
    {"screw": "M3 cap", "through": ["bl_clip2"], "into": "bl_thigh", "at": ["bl_clip2.post"], "note": "A clip on its post"},
    {"screw": "M3 cap", "through": ["bl_clip3"], "into": "bl_thigh", "at": ["bl_clip3.post"], "note": "A clip on its post"},
    {"screw": "M3 cap", "through": ["bl_shin"], "into": "bl_eoutput", "at": ["bl_shin.b1", "bl_shin.b2", "bl_shin.b3", "bl_shin.b4"], "note": "The bl shin on the knee's output"},
    {"screw": "M3 cap", "through": ["br_housing"], "into": "right", "at": ["br_housing.f1", "br_housing.f2", "br_housing.f3"], "note": "The br housing on the right side plate"},
    {"screw": "M3 cap", "through": ["br_bridge"], "into": "br_housing", "at": ["br_bridge.s1", "br_bridge.s2", "br_bridge.s3"], "note": "The br bridge on the housing's posts"},
    {"screw": "M3 countersunk", "through": ["br_spindle"], "into": "br_output", "at": ["br_spindle.b1", "br_spindle.b2", "br_spindle.b3", "br_spindle.b4"], "note": "The br spindle on the hip's output, its heads flush under the bridge"},
    {"screw": "M3 cap", "through": ["br_thigh"], "into": "br_spindle", "at": ["br_thigh.hub"], "note": "The br thigh clamped down on the spindle's hexagon"},
    {"screw": "M3 cap", "through": ["br_clip1"], "into": "br_thigh", "at": ["br_clip1.post"], "note": "A clip on its post"},
    {"screw": "M3 cap", "through": ["br_clip2"], "into": "br_thigh", "at": ["br_clip2.post"], "note": "A clip on its post"},
    {"screw": "M3 cap", "through": ["br_clip3"], "into": "br_thigh", "at": ["br_clip3.post"], "note": "A clip on its post"},
    {"screw": "M3 cap", "through": ["br_shin"], "into": "br_eoutput", "at": ["br_shin.b1", "br_shin.b2", "br_shin.b3", "br_shin.b4"], "note": "The br shin on the knee's output"},
    {"screw": "M3 cap", "through": ["left"], "into": "beam1", "holes": "left", "note": "A beam on two screws through the left side plate"},
    {"screw": "M3 cap", "through": ["right"], "into": "beam1", "holes": "right", "note": "A beam on two screws through the right side plate"},
    {"screw": "M3 cap", "through": ["left"], "into": "beam2", "holes": "left", "note": "The other beam on two screws through the left side plate"},
    {"screw": "M3 cap", "through": ["right"], "into": "beam2", "holes": "right", "note": "The other beam on two screws through the right side plate"}
  ],
  "fits": [
    {"a": "beam1", "b": "left", "min": 0, "note": "A beam, on two screws through each side plate"},
    {"a": "beam1", "b": "right", "min": 0},
    {"a": "beam2", "b": "left", "min": 0},
    {"a": "beam2", "b": "right", "min": 0},
    {"a": "fl_m1", "b": "fl_housing", "fastens": true, "min": -0.1},
    {"a": "fl_m1", "b": "fl_sun", "shaft": true},
    {"a": "fl_m2", "b": "fl_esun", "shaft": true},
    {"a": "fl_m2", "b": "fl_thigh", "fastens": true, "min": -0.1},
    {"a": "fl_housing", "b": "left", "min": 0},
    {"a": "fl_bridge", "b": "fl_housing", "min": 0},
    {"a": "fl_b1", "b": "fl_bridge", "seat": "press"},
    {"a": "fl_ecarrier", "b": "fl_ering", "min": -1},
    {"a": "fl_pad", "b": "fl_shin", "min": -2},
    {"a": "fr_m1", "b": "fr_housing", "fastens": true, "min": -0.1},
    {"a": "fr_m1", "b": "fr_sun", "shaft": true},
    {"a": "fr_m2", "b": "fr_esun", "shaft": true},
    {"a": "fr_m2", "b": "fr_thigh", "fastens": true, "min": -0.1},
    {"a": "fr_housing", "b": "right", "min": 0},
    {"a": "fr_bridge", "b": "fr_housing", "min": 0},
    {"a": "fr_b1", "b": "fr_bridge", "seat": "press"},
    {"a": "fr_ecarrier", "b": "fr_ering", "min": -1},
    {"a": "fr_pad", "b": "fr_shin", "min": -2},
    {"a": "bl_m1", "b": "bl_housing", "fastens": true, "min": -0.1},
    {"a": "bl_m1", "b": "bl_sun", "shaft": true},
    {"a": "bl_m2", "b": "bl_esun", "shaft": true},
    {"a": "bl_m2", "b": "bl_thigh", "fastens": true, "min": -0.1},
    {"a": "bl_housing", "b": "left", "min": 0},
    {"a": "bl_bridge", "b": "bl_housing", "min": 0},
    {"a": "bl_b1", "b": "bl_bridge", "seat": "press"},
    {"a": "bl_ecarrier", "b": "bl_ering", "min": -1},
    {"a": "bl_pad", "b": "bl_shin", "min": -2},
    {"a": "br_m1", "b": "br_housing", "fastens": true, "min": -0.1},
    {"a": "br_m1", "b": "br_sun", "shaft": true},
    {"a": "br_m2", "b": "br_esun", "shaft": true},
    {"a": "br_m2", "b": "br_thigh", "fastens": true, "min": -0.1},
    {"a": "br_housing", "b": "right", "min": 0},
    {"a": "br_bridge", "b": "br_housing", "min": 0},
    {"a": "br_b1", "b": "br_bridge", "seat": "press"},
    {"a": "br_ecarrier", "b": "br_ering", "min": -1},
    {"a": "br_pad", "b": "br_shin", "min": -2}
  ],
  "wires": [
    {"id": "fl_hd_motor", "from": "fl_m1.connector", "to": "fl_board1.top", "gauge": "awg24", "colour": "black, red, green, blue", "connectors": ["JST-XH 4 pin", "screw terminal"]},
    {"id": "fl_hd_signal", "from": "fl_board1.centre", "to": "mega.S0", "gauge": "awg26", "conductors": 4, "colour": "white, yellow, green, black", "connectors": ["Dupont 4 pin", "Dupont"], "note": "EN, STEP, DIR and GND: the streamer's axis 0"},
    {"id": "fl_kd_motor", "from": "fl_m2.connector", "to": "fl_board2.top", "via": ["fl_thigh.cable"], "gauge": "awg24", "colour": "black, red, green, blue", "connectors": ["JST-XH 4 pin", "screw terminal"]},
    {"id": "fl_kd_signal", "from": "fl_board2.centre", "to": "mega.S1", "gauge": "awg26", "conductors": 4, "colour": "white, yellow, green, black", "connectors": ["Dupont 4 pin", "Dupont"], "note": "EN, STEP, DIR and GND: the streamer's axis 1"},
    {"id": "fr_hd_motor", "from": "fr_m1.connector", "to": "fr_board1.top", "gauge": "awg24", "colour": "black, red, green, blue", "connectors": ["JST-XH 4 pin", "screw terminal"]},
    {"id": "fr_hd_signal", "from": "fr_board1.centre", "to": "mega.S2", "gauge": "awg26", "conductors": 4, "colour": "white, yellow, green, black", "connectors": ["Dupont 4 pin", "Dupont"], "note": "EN, STEP, DIR and GND: the streamer's axis 2"},
    {"id": "fr_kd_motor", "from": "fr_m2.connector", "to": "fr_board2.top", "via": ["fr_thigh.cable"], "gauge": "awg24", "colour": "black, red, green, blue", "connectors": ["JST-XH 4 pin", "screw terminal"]},
    {"id": "fr_kd_signal", "from": "fr_board2.centre", "to": "mega.S3", "gauge": "awg26", "conductors": 4, "colour": "white, yellow, green, black", "connectors": ["Dupont 4 pin", "Dupont"], "note": "EN, STEP, DIR and GND: the streamer's axis 3"},
    {"id": "bl_hd_motor", "from": "bl_m1.connector", "to": "bl_board1.top", "gauge": "awg24", "colour": "black, red, green, blue", "connectors": ["JST-XH 4 pin", "screw terminal"]},
    {"id": "bl_hd_signal", "from": "bl_board1.centre", "to": "mega.S4", "gauge": "awg26", "conductors": 4, "colour": "white, yellow, green, black", "connectors": ["Dupont 4 pin", "Dupont"], "note": "EN, STEP, DIR and GND: the streamer's axis 4"},
    {"id": "bl_kd_motor", "from": "bl_m2.connector", "to": "bl_board2.top", "via": ["bl_thigh.cable"], "gauge": "awg24", "colour": "black, red, green, blue", "connectors": ["JST-XH 4 pin", "screw terminal"]},
    {"id": "bl_kd_signal", "from": "bl_board2.centre", "to": "mega.S5", "gauge": "awg26", "conductors": 4, "colour": "white, yellow, green, black", "connectors": ["Dupont 4 pin", "Dupont"], "note": "EN, STEP, DIR and GND: the streamer's axis 5"},
    {"id": "br_hd_motor", "from": "br_m1.connector", "to": "br_board1.top", "gauge": "awg24", "colour": "black, red, green, blue", "connectors": ["JST-XH 4 pin", "screw terminal"]},
    {"id": "br_hd_signal", "from": "br_board1.centre", "to": "mega.S6", "gauge": "awg26", "conductors": 4, "colour": "white, yellow, green, black", "connectors": ["Dupont 4 pin", "Dupont"], "note": "EN, STEP, DIR and GND: the streamer's axis 6"},
    {"id": "br_kd_motor", "from": "br_m2.connector", "to": "br_board2.top", "via": ["br_thigh.cable"], "gauge": "awg24", "colour": "black, red, green, blue", "connectors": ["JST-XH 4 pin", "screw terminal"]},
    {"id": "br_kd_signal", "from": "br_board2.centre", "to": "mega.S7", "gauge": "awg26", "conductors": 4, "colour": "white, yellow, green, black", "connectors": ["Dupont 4 pin", "Dupont"], "note": "EN, STEP, DIR and GND: the streamer's axis 7"}
  ],
  "gait": {"legs": ["fl_shin.tip", "fr_shin.tip", "bl_shin.tip", "br_shin.tip"], "pattern": "crawl", "stride": "leg.stride", "lift": "leg.lift", "period": 4, "height": "leg.stance", "mass": "leg.robot_mass", "clearance": 11},
  "poses": { "standing": {"fl_hd": -3171.4, "fl_kd": 2597, "fr_hd": -5587.7, "fr_kd": -2236, "bl_hd": -5587.7, "bl_kd": -2236, "br_hd": -3171.4, "br_kd": 2597} }
}
```

```sh
npx cad list leg/quadruped
npx cad plates leg/quadruped
```

The weight first, plainly: the shopping list says 1470 g of printing, 2260 g of bought parts and 105 g of screws, 3834 g as a machine, before electronics. The 1.5 kg robot the leg was sized for does not exist: eight 17HS4401s weigh 2240 g alone, 360 g more than with NEMA 14 knees. So the robot is 4.2 kg (`leg.robot_mass`, with its electronics an `estimate` of about 0.4 kg), and every number below is at that mass. The knees run at 1 A, as the hips do: a DRV8825 gives that without a heat sink, and the 17HS4401 is rated 1.5 A.

The screws are the stand's four times over, each chosen by `fasten`, with each hip's housing on its side plate (three M3x8) and the beams held by two M3x12 at each end: 24 M3x8 cap, 16 M3x8 countersunk, 12 M3x10, 40 M3x12 with the knee motors' own and 4 M3x16, and the hip motors' 16 M3x6.

Trot and crawl are run through their checks by `cad check leg/quadruped --json` and `cad check leg/crawl --json`: they take several minutes each, so the replay here leaves them out; run them yourself. What they said when this chapter was written (quasi-static, a design, nothing built):

- **Trot.** Two feet down at a time: `gait.stable` reports it is quasi-static, resting on two feet, so its balance depends on moving: this is a slow walk, not a run. The worst joint is 1.465 N m at a back knee, against 3.364 N m from its 17HS4401 at 1 A through 38:1 at 47%, 2.3 times over; the worst hip 0.477 N m, 7 times. (With NEMA 14 knees at 0.8 A and 3.8 kg it was 1.325 N m against 2.27 N m, 1.7 times, and the check warned.) The 17HS4401 is 42.3 mm square and 40 mm long, against the NEMA 14's 35 mm and 34 mm; the trot's poses at its start, a quarter, a half and three quarters of its cycle were swept with the larger knee motors, and nothing collided.
- **Crawl.** One foot up at a time: statically stable, the least margin 4.3 mm of balance to spare, with the worst joint 1.288 N m at a knee, 2.6 times over (1.165 N m and 1.9 times before). Slower, and safer: a crawl is what a quadruped with no balance control can do.
- `cad plates` lays the quadruped's prints on beds, and `cad list` lists it all, ready to buy. That part of the design was done from the assembly, unchanged.

The honest reading: with a 17HS4401 at each knee at 1 A, the knees have 2.3 times the torque a trot asks of them at 4.2 kg, where NEMA 14s at 0.8 A had 1.7 times at 3.8 kg and the check warned. The bigger motor more than pays for its 90 g. Two times is still thin on a printed gearbox whose efficiency is a guess, and the 0.4 kg of electronics is an estimate: weigh the robot as built, set `leg.robot_mass` to that, and check again before printing it as a robot.

### What a walking robot needs that this does not do

Said plainly, because a gait that passes these checks is not a robot that walks:

- **Dynamics.** Only statics are here: the torque is the weight on the foot through the leg's angles, no acceleration of the body or the leg's own swing. A real step's jolt is not in these numbers.
- **Balance.** A crawl keeps its centre of mass inside its feet. A trot does not; it depends on moving, and on a controller nobody has written. There is no estimator of where the body is, no reaction to being pushed.
- **Feedback.** The motors are open-loop steppers: a stall or a slip goes unnoticed. A real leg needs at least encoders at the joints and a way to feel the ground, and code that uses them.
- **Measuring.** Nothing here has been printed. The stand exists to change that: run its leg, write what the scale reads into the ledger with `cad measured`, and start again from what it says.

`npm create rulecad --machine leg` starts a project from the leg and its stand, with the streamer and its sender. The trot streams through the streamer on a simulated Mega 2560 in the kit's tests, every step counted; a measured leg is not done yet.


## 15. Fixings: a bracket screwed on

A small shelf bracket and the wall plate it screws to. Every hole and seat in them comes from `v.fixings`, named by its
thread and never by a typed diameter: a counterbore and its clearance hole for the screws' heads, a pilot the screw
cuts its own thread in, a boss for a heat-set insert, a slot a nut drops into, and countersinks. The assembly says which
screws join what with `fasten`, and the check follows each screw along its axis: whether the holes line up, what holds
its far end, how long it should be, how much thread it has, what its head sits on, whether a hex key reaches it, and
what the shelf's weight does to it. Two mistakes follow, each caught by name. [Choosing a pilot, an insert or a
nut](../../docs/guides/pilot-insert-nut.md) explains when each end is the right one.

The bracket is shown with all three ends at once, so one small model shows each. A real one would use one kind.

```json projects/fix/project.json
{
  "name": "fix",
  "title": "A bracket screwed on",
  "printer": "x1c",
  "material": "PLA",
  "objects": ["plate", "bracket", "wall"]
}
```

### The plate

It goes flat on the bed with its back down, and the back goes on the wall. Four posts stand out of it for the
bracket's foot to rest on. One is the insert's boss from `insertBoss`; the other three are the same column, flared at
the root the same way, so no inside corner is square. The top post has a pilot; the two in the middle are passed
right through by screws coming from behind, their heads sunk flush with the back in countersinks that open on to the
bed (a 45° cone, which prints). Two M4 countersinks at the ends take the wall's own screws, chosen for the wall.

```json projects/fix/objects/plate.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "plate",
  "title": "Wall plate",
  "version": "0.1.0",
  "uses": ["x1c"],
  "material": "PLA",
  "orientation": "Flat, its back on the bed: the back goes against the wall, the four posts stand out from it",
  "variables": {
    "thick": { "value": "x1c.layer * 15", "unit": "mm", "rule": "The plate: whole layers, and enough for the wall screws' M4 countersinks, 2.2 mm deep" },
    "stand": { "value": "x1c.layer * 34", "unit": "mm", "rule": "The posts: as tall as the insert's hole is deep, in whole layers, so the insert's boss is a post" },
    "pitch": { "value": 32, "unit": "mm", "rule": "Between the two screws from the front, up the wall: as the bracket's" },
    "nut_pitch": { "value": 12, "unit": "mm", "rule": "Between the two screws from behind, up the wall: as the bracket's nuts" },
    "width": { "value": 20, "unit": "mm", "rule": "Across the plate: a post and a few mm each side" },
    "long": { "value": 70, "unit": "mm", "rule": "Up the plate: the bracket's foot and a wall screw beyond each end" },
    "round": { "value": 4, "unit": "mm", "rule": "The plate's corners, rounded" },
    "wall_pitch": { "value": 58, "unit": "mm", "rule": "Between the wall screws, clear of the bracket's foot and the posts" },
    "floor": { "value": "x1c.layer * 5", "unit": "mm", "rule": "Plastic left under the pilot, so it does not break through the back" }
  }
}
```

```js projects/fix/objects/plate.js
// The wall plate: four posts for the bracket, each the end its screw needs, and two countersunk holes for the wall.
import jscad from '@jscad/modeling'
const { roundedRectangle, cylinder, cylinderElliptic } = jscad.primitives
const { extrudeLinear } = jscad.extrusions

export function main (v) {
  const f = v.fixings, top = v.thick + v.stand
  const slab = extrudeLinear({ height: v.thick }, roundedRectangle({ size: [v.width, v.long], roundRadius: v.round }))
  // the insert's boss, from the kit; the other posts are the same column, flared at the root the same way
  const boss = f.insertBoss('M3', { height: v.stand, at: [0, 0 - v.pitch / 2, v.thick] }), R = boss.model.outer / 2, root = boss.model.root
  const post = (y) => v.ops.union(cylinderElliptic({ height: root, startRadius: [R + root, R + root], endRadius: [R, R], center: [0, y, v.thick + root / 2] }),
    cylinder({ radius: R, height: v.stand, center: [0, y, v.thick + v.stand / 2] }))
  const body = v.ops.union(slab, boss.boss, post(v.pitch / 2), ...[-1, 1].map((s) => post(s * v.nut_pitch / 2)))
  return v.ops.subtract(body, boss.hole,
    f.hole('M3', { kind: 'pilot', depth: top - v.floor, at: [0, v.pitch / 2, top] }),
    ...[-1, 1].map((s) => f.countersink('M3', { length: top, thickness: top, into: '+z', at: [0, s * v.nut_pitch / 2, 0] })),
    ...[-1, 1].map((s) => f.countersink('M4', { length: v.thick, thickness: v.thick, at: [0, s * v.wall_pitch / 2, v.thick] })))
}
```

### The bracket

The bracket prints on its side: the web, the triangle that carries the shelf, lies flat on the bed, and the foot stands
up from its back edge. So the first layer is one plain shape, the inside corner between web and foot is a 45° fillet,
and every hole through the foot lies on its side: a counterbore and its hole are one teardrop cutter, with 45° roofs.
The nut's slot opens at the top of the foot as it prints, and the nut drops in from there, so nothing spans. The web's
lower end is deep enough (`heel`) that the foot and its fillet stand on it all the way along.

```json projects/fix/objects/bracket.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "bracket",
  "title": "Shelf bracket",
  "version": "0.1.0",
  "uses": ["x1c"],
  "material": "PLA",
  "orientation": "On its side: the web flat on the bed, the foot standing up from its back edge, the nuts' slots open at the top",
  "variables": {
    "web": { "value": "x1c.layer * 15", "unit": "mm", "rule": "The web's thickness, flat on the bed: 3 mm carries the shelf 80 times over (EXAMPLES chapter 15 works it); thinner is a floppy edge" },
    "wide": { "value": 44, "unit": "mm", "rule": "Up the wall: the four screws and the foot's ends" },
    "reach": { "value": 40, "unit": "mm", "rule": "Out from the wall: the shelf's depth it carries" },
    "heel": { "value": 14, "unit": "mm", "rule": "The web's depth at its lower end: under the whole foot and its fillet, so neither hangs in the air" },
    "foot": { "value": "x1c.layer * 32", "unit": "mm", "rule": "The foot's thickness, where the screws pass: a counterbored head, and the nut's slot with plastic each side of it" },
    "out": { "value": 25, "unit": "mm", "rule": "The foot, out to one side of the web: room for the screws and the nuts' slots beyond them" },
    "at": { "value": 14, "unit": "mm", "rule": "The screws' line, from the web's face: clear of the web and its fillet for the head and the key" },
    "pitch": { "value": 32, "unit": "mm", "rule": "Between the two screws from the front: as far apart as the foot allows, so they share the shelf's pull" },
    "nut_pitch": { "value": 12, "unit": "mm", "rule": "Between the two nuts' slots, inside the front screws' counterbores with plastic between" },
    "fillet": { "value": 4, "unit": "mm", "rule": "The 45° fillet in the inside corner between the web and the foot, so the corner is not square" },
    "nut_floor": { "value": "x1c.layer * 6", "unit": "mm", "rule": "Plastic between the foot's back and the nut's slot" }
  },
  "anchors": {
    "pilot": { "at": ["pitch / 2", "foot", "at"], "axis": [0, 1, 0] },
    "insert": { "at": ["0 - pitch / 2", "foot", "at"], "axis": [0, 1, 0] },
    "nut1": { "at": ["nut_pitch / 2", 0, "at"], "axis": [0, -1, 0] },
    "nut2": { "at": ["0 - nut_pitch / 2", 0, "at"], "axis": [0, -1, 0] },
    "shelf": { "at": ["wide / 2", "reach - 10", "web / 2"], "axis": [0, 0, 1] }
  }
}
```

The anchors are where the screws go: `pilot` and `insert` on the foot's front face, over the two front screws' holes,
and `nut1` and `nut2` on its back, where the screws from behind come in. `shelf` is where the shelf's weight is hung.

```js projects/fix/objects/bracket.js
// A shelf bracket, drawn as it prints: the web flat on the bed, the foot standing up along its back edge.
// Two cap screws go down counterbores in the foot into the wall plate; two more come from behind the plate into nuts
// dropped into slots in the foot.
import jscad from '@jscad/modeling'
const { polygon, cuboid } = jscad.primitives
const { extrudeLinear } = jscad.extrusions
const { transform, translate } = jscad.transforms

// (a profile drawn in y and z, extruded along x)
const alongX = (g) => transform([0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1], g)

export function main (v) {
  const f = v.fixings, half = v.wide / 2
  const web = extrudeLinear({ height: v.web }, polygon({ points: [[0 - half, 0], [half, 0], [half, v.reach], [0 - half, v.heel]] }))
  const foot = cuboid({ size: [v.wide, v.foot, v.out], center: [0, v.foot / 2, v.out / 2] })
  const fillet = translate([0 - half, 0, 0], alongX(extrudeLinear({ height: v.wide }, polygon({ points: [[v.foot, v.web], [v.foot + v.fillet, v.web], [v.foot, v.web + v.fillet]] }))))
  const trap = f.nutTrapModel('M3', { axis: 'y', into: '-z', depth: v.out - v.at })
  return v.ops.subtract(v.ops.union(web, foot, fillet),
    ...[-1, 1].map((s) => f.counterbore('M3 cap', { length: v.foot, thickness: v.foot, into: '-y', at: [s * v.pitch / 2, v.foot, v.at] })),
    ...[-1, 1].flatMap((s) => [f.hole('M3', { depth: v.foot, into: '+y', at: [s * v.nut_pitch / 2, 0, v.at] }),
      f.nutTrap('M3', { axis: 'y', into: '-z', depth: v.out - v.at, at: [s * v.nut_pitch / 2, v.nut_floor + trap.gap / 2, v.out] })]))
}
```

`nutTrapModel` gives the slot's numbers before it is cut: its `gap` along the screw puts the nut's middle where the
slot is drawn, so the nut sits `nut_floor` in from the foot's back whatever the printer's slip.

```sh
npx cad check fix/plate
npx cad check fix/bracket
```

Each prints without supports: no overhang past 45°, no ledge, nothing in mid-air, one piece, a plain first layer. Each
seat says what it was drawn to and the rule it rests on: the pilot 2.9 mm from `x1c.pilot_m3` (measured on this
printer), the insert's hole 4 mm from `m3.insert_hole` (a community figure, as drawn), each clearance hole 3.5 mm
(`m3.clearance`, from ISO 273, plus `x1c.hole_comp`), the counterbore 6 mm by 3 mm, the countersink 6.82 mm at 90°, and
the nut's slot 5.7 mm across the flats and 2.6 mm along the screw (`m3.nut_flats` and `m3.nut_height`, plus
`x1c.hole_comp` and `x1c.slip`).

### Screwed together

The plate's back is the wall, at z = 0, and up the wall is y. The bracket is turned from how it prints to how it hangs,
and stands on the posts. Two `fasten` relations hold it: two cap screws from the front, through the bracket into the
plate, and two countersunk screws from behind, through the plate into the bracket's nuts. Neither names a length: the
check chooses the shortest sold that fits each screw. The shelf is 2 kg hung at the `shelf` anchor, and gravity runs
down the wall.

```json projects/fix/assemblies/shelf.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/assembly.schema.json",
  "title": "A shelf bracket on its wall plate",
  "kind": "fit",
  "description": "The plate's back on the wall (z = 0), the bracket on its four posts, up the wall along y. Two cap screws go through the bracket's foot into the plate, one into a pilot and one into a heat-set insert; two countersunk screws come from behind the plate into nuts in the foot.",
  "items": [
    { "id": "plate", "object": "plate" },
    { "id": "bracket", "object": "bracket", "rotate": [90, 0, 90], "at": ["0 - bracket.at", 0, "plate.thick + plate.stand"] }
  ],
  "fits": [
    { "a": "bracket", "b": "plate", "min": 0, "max": 0.05, "note": "The foot sits on the plate's posts" }
  ],
  "fasten": [
    { "screw": "M3 cap", "through": ["bracket"], "into": "plate", "at": ["bracket.pilot", "bracket.insert"], "note": "Front screws" },
    { "screw": "M3 countersunk", "through": ["plate"], "into": "bracket", "at": ["bracket.nut1", "bracket.nut2"], "nut": true, "torque": 0.3, "note": "Back screws" }
  ],
  "gravity": [0, -1, 0],
  "loads": [
    { "mass": 2, "at": "bracket.shelf", "note": "A shelf and what stands on it" }
  ]
}
```

```sh
npx cad check fix/shelf
npx cad list fix/shelf
npx cad order fix/shelf
```

What the check says, screw by screw:

- `fasten.holes`: each screw has one axis from under its head through the part it passes into the part it ends in.
- `fasten.clearance`: the bracket's and the plate's holes measure 3.5 mm, an M3 clearance hole as drawn.
- `fasten.end`: the top front screw ends in a pilot, 2.9 mm and 8.8 mm deep; the bottom one in an insert's hole, 4 mm
  and 6.7 mm deep; each back screw in an M3 hex nut in its seat in the bracket, 5.7 mm across the flats for the nut's
  5.5 mm. The slot is found where it crosses the screw, and the nut drawn there, flats to the slot's walls.
- `fasten.length`: M3x10 cap for the pilot (3.4 mm under the head and 6.6 mm into the plate, 1.2 mm short of
  bottoming out), M3x8 cap for the insert, M3x16 countersunk for the nuts.
- `fasten.engagement`: 6.6 mm of thread in PLA where `m3.pilot_depth` asks 5 mm; 4.6 mm in the insert, where
  `fixings.insert_engagement` asks a diameter or the whole insert; the nut's whole 2.4 mm.
- `fasten.seat`: the cap heads sit flat, 3 mm down their counterbores, and PLA under them takes 553 N, a tightening
  of 0.33 N m; the countersunk heads sit in an 89.8° countersink, flush with the back.
- `fasten.access`: a 2.5 mm hex key reaches each cap head along its axis, and a 2 mm key each countersunk head, with
  nothing within the key's corners for its long arm's 58.5 mm or 52 mm (`hexkey`, ISO 2936).
- `fasten.load`: with the shelf's 2 kg, the front screws hold 41.4 times the load, the pilot's thread in PLA first;
  the back screws 32.6 times, the screw first (the nut's thread is steel and not checked). Each holds its shear by
  friction 9.5 and 3.6 times over. The torque on the back screws is given (0.3 N m), because the check holds the
  pressure under a flat seat and not yet on a countersink's cone.

Each relation is reckoned as if it held the bracket alone, so the two figures are each the worst case. They rest on
estimates (the plastic's strength in shear, the nut factor, the friction), and the finding names each one.

`cad list` gives the screws by thread, length and head, with what they weigh and how they are bought, and the two
prints: the plate 5.9 g and the bracket 11.8 g, 17.7 g and about 20 minutes of printing, and 5 g of fixings.
`cad order` gives the steps: the plate first, then the bracket with its four screws, each with its key and torque, the
insert and the nuts named with them.

### Strong enough, and small

The design rule is the smallest part that carries its load about twice over. By hand, PLA at 39 MPa along the layers
(`pla.strength`, a community figure), 2 kg is 19.6 N:

| Part | Where it is worst | Load | Stress | Margin |
|---|---|---|---|---|
| Bracket's web | At the foot, 23.6 mm in from the shelf's weight, a section 44 mm deep and 3 mm thick | 463 N mm | 0.48 MPa | 81 times |
| Plate | At the lowest post, 19 mm above its bottom edge, which bears on the wall; the top wall screw pulls 780 / 64 = 12.2 N | 232 N mm | 7.7 MPa | 5 times |
| Front screws | `fasten.load` | 16.3 N of pull | | 41.4 times |
| Back screws | `fasten.load` | 65.2 N of pull | | 32.6 times |

The web's section modulus is 3 × 44² / 6 = 968 mm³ and the plate's 20 × 3² / 6 = 30 mm³; each stress is the moment
over it. The web is stressed along its layers, since it lies flat as it prints. The plate is the part the load sizes:
its 3 mm is the least that holds the wall screws' countersinks, and carries the shelf five times. The bracket is sized
by its fixings, not its load: room for a head and its key, a nut's slot with plastic round it, and four screws far
enough apart to share the pull. A thinner web would still carry the shelf, and would flap.

### Two mistakes, caught

A screw too short. The front screws named as M3x6 by hand:

```json projects/fix/assemblies/short.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/assembly.schema.json",
  "title": "The shelf bracket on front screws too short",
  "kind": "fit",
  "items": [
    { "id": "plate", "object": "plate" },
    { "id": "bracket", "object": "bracket", "rotate": [90, 0, 90], "at": ["0 - bracket.at", 0, "plate.thick + plate.stand"] }
  ],
  "fits": [
    { "a": "bracket", "b": "plate", "min": 0, "max": 0.05, "note": "The foot sits on the plate's posts" }
  ],
  "fasten": [
    { "screw": "M3x6 cap", "through": ["bracket"], "into": "plate", "at": ["bracket.pilot", "bracket.insert"], "note": "Front screws" },
    { "screw": "M3 countersunk", "through": ["plate"], "into": "bracket", "at": ["bracket.nut1", "bracket.nut2"], "nut": true, "torque": 0.3, "note": "Back screws" }
  ]
}
```

`npx cad check fix/short` fails, and says what would do:

```text
✗ Front screws, screw 1 (bracket.pilot): M3x6 cap engages 2.6 mm of thread in pla (a plastic), 5.2 turns, where m3.pilot_depth asks 5 mm: M3x10 cap would do
✗ Front screws, screw 2 (bracket.insert): M3x6 cap engages 2.6 mm of thread in the insert, 5.7 mm long, 5.2 turns, where fixings.insert_engagement asks a diameter of thread or the whole insert, 3 mm: M3x8 cap would do
```

A screw that cannot be reached. Shelves usually go up plate first: screw the plate to the wall, then hang the bracket
on it. With the wall in the assembly, drawn faint and never printed, and the plate fastened to it:

```json projects/fix/objects/wall.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "wall",
  "title": "A patch of wall",
  "version": "0.1.0",
  "role": "reference",
  "variables": {
    "size": { "value": 120, "unit": "mm", "rule": "A patch of wall round the plate" },
    "deep": { "value": 20, "unit": "mm", "rule": "Enough to show where it is" }
  }
}
```

```js projects/fix/objects/wall.js
// The wall the plate goes on: a reference, drawn faint and never printed. Its face is z = 0.
import jscad from '@jscad/modeling'
const { cuboid } = jscad.primitives

export function main (v) {
  return cuboid({ size: [v.size, v.size, v.deep], center: [0, 0, 0 - v.deep / 2] })
}
```

```json projects/fix/assemblies/wall-first.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/assembly.schema.json",
  "title": "The plate on the wall first",
  "kind": "fit",
  "items": [
    { "id": "wall", "object": "wall" },
    { "id": "plate", "object": "plate" },
    { "id": "bracket", "object": "bracket", "rotate": [90, 0, 90], "at": ["0 - bracket.at", 0, "plate.thick + plate.stand"] }
  ],
  "fits": [
    { "a": "plate", "b": "wall", "fastens": true, "min": 0, "note": "The plate on the wall, on two wall screws" },
    { "a": "bracket", "b": "plate", "min": 0, "max": 0.05, "note": "The foot sits on the plate's posts" }
  ],
  "fasten": [
    { "screw": "M3 cap", "through": ["bracket"], "into": "plate", "at": ["bracket.pilot", "bracket.insert"], "note": "Front screws" },
    { "screw": "M3 countersunk", "through": ["plate"], "into": "bracket", "at": ["bracket.nut1", "bracket.nut2"], "nut": true, "torque": 0.3, "note": "Back screws" }
  ]
}
```

`npx cad check fix/wall-first` fails on the back screws and on the order, naming the wall:

```text
✗ Back screws, 2 M3 countersunk screws: a 2 mm hex key cannot reach the head: wall stands over it, 0.05 mm up the screw's axis and goes on first (The plate on the wall, on two wall screws), and a ball-end key tilted 25° does not clear it either. Move the screw, open a way through wall, or fit wall after
✗ the screw of "Back screws" can't be reached in any order: wall stands over it and goes on first (The plate on the wall, on two wall screws)
```

So this bracket goes on its plate at the bench, and the plate then goes on the wall: its wall screws are clear of the
foot, and `cad order fix/shelf` builds it in that order. The other way to hang it plate first is to bring every screw
in from the front: four front screws into pilots or inserts, and no nut.

### The build page

`npx cad link fix/shelf --md` gives a link to the model page. Since the assembly has a `fasten`, the link carries a build
page: the prints with their grams and time, a Fasteners table (each screw, nut and insert, how many, their grams, and
the packs to buy with what is spare), and the steps of `cad order`, each with its screws, the key and the torque to
tighten to. The screws, the insert and the nuts are drawn faint in place.

### What is measured, and what waits on the bench

The pilot is the X1C's own measured figure. The insert's hole, the nut's slot, the counterbore's room for a head and
the strength figures under `fasten.load` are not, and their findings say so. Print 7 in
`examples/bench/projects/benchmarks/MEASURE.md`, the fixings coupon, settles them: pilots at five sizes, insert holes,
nut pockets and slots at three fits, a counterbore and printed threads. Its results go back with `cad measured
benchmarks/fixings-test <rule>=<figure>`, and every design drawn from `v.fixings` follows them the next time it is
built.

## 16. A frame: beams, joins and an axis

A small box of aluminium extrusion with a moving axis along its top: the kind of frame a camera slider, a plotter or a
test rig starts from. Every beam is one profile, MISUMI's 2020 (`2020-misumi-hfs5`), placed by its two ends, so its
length is where its ends are. The joins say how beams hold each other: a blind join hides a screw inside the corner, a
printed bracket goes on the outside. Feet and end caps finish the posts. Two rods on the top front rail carry a printed
carriage, driven by a lead screw from a NEMA 17. A printed plate for a board is screwed into a slot. Then the frame is
cut, drilled and printed from what the check worked out: the cut list, a sheet for each beam, the jigs, one plate of
printed parts and the order to build it in. Two mistakes follow, each caught by name.

The project, and the one object in it, are made by commands: `cad new frame` writes `projects/frame/project.json`
(its title, the printer its parts are checked against, PLA), and `cad new frame/plate` starts the plate from the
template and lists it in the project.

```sh
npx cad new frame --title "A frame with a moving axis" --printer x1c --material PLA
npx cad new frame/plate
```

### The plate

The board plate is the one part drawn by hand: its two files replace the template's. It lies on a beam's slotted face, two M4 holes from `v.fixings` along
its middle, so both screws go into one slot's nuts. Its thickness is chosen with its screws: 3 mm of plate and the
slot's 2 mm lip leave an M4x8 a hex nut's height of thread in a slot nut without reaching the slot's floor.

```json projects/frame/objects/plate.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/object.schema.json",
  "name": "plate",
  "title": "Board plate",
  "version": "0.1.0",
  "uses": ["x1c"],
  "material": "PLA",
  "orientation": "Flat, the face that lies on the beam down",
  "variables": {
    "thick": { "value": "x1c.layer * 15", "unit": "mm", "rule": "The plate: whole layers, and thin enough that an M4x8 screw reaches a nut's height of thread in the slot nut", "tweak": { "min": 2, "max": 4 } },
    "long": { "value": 70, "unit": "mm", "rule": "Along the beam: a small board and a screw beyond each end of it", "tweak": { "min": 40, "max": 120 } },
    "wide": { "value": 20, "unit": "mm", "rule": "Across the beam: as wide as its face", "tweak": { "min": 20, "max": 60 } },
    "pitch": { "value": 50, "unit": "mm", "rule": "Between the two screws", "tweak": { "min": 10, "max": 100 } },
    "round": { "value": 3, "unit": "mm", "rule": "The plate's corners, rounded" }
  }
}
```

```js projects/frame/objects/plate.js
// A printed plate a board screws to, held on a beam's slotted face by two M4 screws into slot nuts.
import jscad from '@jscad/modeling'
const { roundedRectangle } = jscad.primitives
const { extrudeLinear } = jscad.extrusions

export function main (v) {
  const plate = extrudeLinear({ height: v.thick }, roundedRectangle({ size: [v.long, v.wide], roundRadius: v.round }))
  return v.ops.subtract(plate, ...[-1, 1].map((s) => v.fixings.hole('M4', { depth: v.thick, at: [s * v.pitch / 2, 0, v.thick] })))
}
```

```sh
npx cad check frame/plate
```

### The box

Up is z, and the box stands on its feet at z = 0. Four posts, `p1` to `p4`, stand 200 mm tall at the corners of a
300 by 260 mm rectangle (their centres 280 by 240 mm apart). Four rails run along x between them, `x1` and `x2` at
30 mm up, `x3` and `x4` at 170 mm, and four along y, `y1` and `y2` at 10 mm up, `y3` and `y4` at 190 mm. Each beam is
placed by `from` and `to`, the middles of its two ends, so a rail between two posts starts and stops at their faces.
An address names a place on a beam: `p1.back@30` is the face of `p1` that looks back along x, 30 mm from its end `a`;
`x1.top@50%` is half way along the top face of `x1`.

- **Blind joins.** Twelve of the sixteen corners are `blind`: the rail's end is tapped M5, a button-head screw sits
  inside the post's slot under its lips, and an access hole across the post lets a hex key reach it. Nothing shows
  from outside, and the rail stays as long as the gap.
- **Printed brackets.** The two bottom rails along y, `y1` and `y2`, are held by `bracket` joins with `"fitting":
  "printed"`: a corner bracket from `@rulecad/frames`, drawn from the profile's slot, sized from a 100 N load, on two
  M4 screws into slot nuts. Their nuts are `drop-in`, since those slots are closed at both ends by the time the
  brackets go on.
- **Feet and caps.** A printed `foot` on each post's end `a`, screwed into the end's bore, which the post's own `ops`
  tap M5 as the foot asks. A printed `end-cap` on each end `b`, pushed on: its pegs go 5 mm into the slots and the bore,
  a press fit (`"min": -5`).
- **The axis.** A `rods` guide on the top face of `x3`, from 100 to 250 mm along it: two 8 mm rods in printed holders,
  a printed carriage on two LM8UU bearings. A `screw` guide drives it: a printed motor plate before the first holder,
  a NEMA 17 on it, a coupler and an 8 mm lead T8 screw, a 608 bearing for the screw in each holder and the lead nut on
  the carriage. Every part is placed by the guide from the beam's addresses. The holders' and the plate's screws go
  into `x3`'s side slots, closed at both ends by its joins, so the guide's `"nut"` is `drop-in` too. The driver is set
  to 1.2 A, where the motor's case stays under PLA's softening point.
- **The board plate.** At `x1.top@50%`, fastened into `x1`'s top slot on drop-in nuts. No screw length is given: the
  check chooses the shortest sold that fits.
- **Loads.** The carriage carries 0.5 kg, and the axis pushes 20 N along the rods (a cable chain's drag, or a tool
  pressed along the way: a figure to replace with the task's own).

```json projects/frame/assemblies/box.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/assembly.schema.json",
  "title": "A box of 2020 with a moving axis",
  "kind": "fit",
  "description": "Four posts, four rails along x and four along y, all one profile placed by their ends. Blind joins at every corner but the two bottom rails along y, which are held by printed brackets. Printed feet and end caps on the posts. A carriage on two rods along the top front rail, driven by a lead screw from a NEMA 17, and a board plate on the bottom front rail.",
  "items": [
    { "id": "p1", "beam": { "profile": "2020-misumi-hfs5", "ops": [{ "op": "tap", "at": "a", "thread": "M5", "depth": 18.5 }] }, "from": [10, 10, 0], "to": [10, 10, 200] },
    { "id": "p2", "beam": { "profile": "2020-misumi-hfs5", "ops": [{ "op": "tap", "at": "a", "thread": "M5", "depth": 18.5 }] }, "from": [290, 10, 0], "to": [290, 10, 200] },
    { "id": "p3", "beam": { "profile": "2020-misumi-hfs5", "ops": [{ "op": "tap", "at": "a", "thread": "M5", "depth": 18.5 }] }, "from": [290, 250, 0], "to": [290, 250, 200] },
    { "id": "p4", "beam": { "profile": "2020-misumi-hfs5", "ops": [{ "op": "tap", "at": "a", "thread": "M5", "depth": 18.5 }] }, "from": [10, 250, 0], "to": [10, 250, 200] },
    { "id": "x1", "beam": { "profile": "2020-misumi-hfs5" }, "from": [20, 10, 30], "to": [280, 10, 30] },
    { "id": "x2", "beam": { "profile": "2020-misumi-hfs5" }, "from": [20, 250, 30], "to": [280, 250, 30] },
    { "id": "x3", "beam": { "profile": "2020-misumi-hfs5" }, "from": [20, 10, 170], "to": [280, 10, 170] },
    { "id": "x4", "beam": { "profile": "2020-misumi-hfs5" }, "from": [20, 250, 170], "to": [280, 250, 170] },
    { "id": "y1", "beam": { "profile": "2020-misumi-hfs5" }, "from": [10, 20, 10], "to": [10, 240, 10] },
    { "id": "y2", "beam": { "profile": "2020-misumi-hfs5" }, "from": [290, 20, 10], "to": [290, 240, 10] },
    { "id": "y3", "beam": { "profile": "2020-misumi-hfs5" }, "from": [10, 20, 190], "to": [10, 240, 190] },
    { "id": "y4", "beam": { "profile": "2020-misumi-hfs5" }, "from": [290, 20, 190], "to": [290, 240, 190] },
    { "id": "foot1", "fitting": { "kind": "foot", "profile": "2020-misumi-hfs5" }, "at": "p1.a" },
    { "id": "foot2", "fitting": { "kind": "foot", "profile": "2020-misumi-hfs5" }, "at": "p2.a" },
    { "id": "foot3", "fitting": { "kind": "foot", "profile": "2020-misumi-hfs5" }, "at": "p3.a" },
    { "id": "foot4", "fitting": { "kind": "foot", "profile": "2020-misumi-hfs5" }, "at": "p4.a" },
    { "id": "cap1", "fitting": { "kind": "end-cap", "profile": "2020-misumi-hfs5" }, "at": "p1.b" },
    { "id": "cap2", "fitting": { "kind": "end-cap", "profile": "2020-misumi-hfs5" }, "at": "p2.b" },
    { "id": "cap3", "fitting": { "kind": "end-cap", "profile": "2020-misumi-hfs5" }, "at": "p3.b" },
    { "id": "cap4", "fitting": { "kind": "end-cap", "profile": "2020-misumi-hfs5" }, "at": "p4.b" },
    { "id": "plate", "object": "plate", "at": "x1.top@50%" }
  ],
  "joins": [
    { "kind": "blind", "a": "x1.a", "b": "p1.back@30" }, { "kind": "blind", "a": "x1.b", "b": "p2.front@30" },
    { "kind": "blind", "a": "x2.a", "b": "p4.back@30" }, { "kind": "blind", "a": "x2.b", "b": "p3.front@30" },
    { "kind": "blind", "a": "x3.a", "b": "p1.back@170" }, { "kind": "blind", "a": "x3.b", "b": "p2.front@170" },
    { "kind": "blind", "a": "x4.a", "b": "p4.back@170" }, { "kind": "blind", "a": "x4.b", "b": "p3.front@170" },
    { "kind": "bracket", "a": "y1.a", "b": "p1.top@10", "fitting": "printed", "nut": "drop-in" },
    { "kind": "bracket", "a": "y1.b", "b": "p4.bottom@10", "fitting": "printed", "nut": "drop-in" },
    { "kind": "bracket", "a": "y2.a", "b": "p2.top@10", "fitting": "printed", "nut": "drop-in" },
    { "kind": "bracket", "a": "y2.b", "b": "p3.bottom@10", "fitting": "printed", "nut": "drop-in" },
    { "kind": "blind", "a": "y3.a", "b": "p1.top@190" }, { "kind": "blind", "a": "y3.b", "b": "p4.bottom@190" },
    { "kind": "blind", "a": "y4.a", "b": "p2.top@190" }, { "kind": "blind", "a": "y4.b", "b": "p3.bottom@190" }
  ],
  "fits": [
    { "a": "cap1", "b": "p1", "fastens": true, "min": -5, "note": "An end cap, its pegs pushed 5 mm into the slots and the bore" },
    { "a": "cap2", "b": "p2", "fastens": true, "min": -5, "note": "An end cap, its pegs pushed 5 mm into the slots and the bore" },
    { "a": "cap3", "b": "p3", "fastens": true, "min": -5, "note": "An end cap, its pegs pushed 5 mm into the slots and the bore" },
    { "a": "cap4", "b": "p4", "fastens": true, "min": -5, "note": "An end cap, its pegs pushed 5 mm into the slots and the bore" }
  ],
  "guides": [
    { "kind": "rods", "on": "x3.top", "from": 100, "length": 150, "nut": "drop-in" },
    { "kind": "screw", "guide": "g1", "screw": "t8-screw", "motor": { "model": "nema17", "current": 1.2 } }
  ],
  "fasten": [
    { "screw": "M5 cap", "through": ["foot1"], "into": "p1", "at": ["foot1.b1"], "note": "Foot 1" },
    { "screw": "M5 cap", "through": ["foot2"], "into": "p2", "at": ["foot2.b1"], "note": "Foot 2" },
    { "screw": "M5 cap", "through": ["foot3"], "into": "p3", "at": ["foot3.b1"], "note": "Foot 3" },
    { "screw": "M5 cap", "through": ["foot4"], "into": "p4", "at": ["foot4.b1"], "note": "Foot 4" },
    { "screw": "M4 button", "through": ["plate"], "into": "x1.top", "holes": "plate.body", "nut": "drop-in", "note": "The board plate" }
  ],
  "loads": [
    { "mass": 0.5, "at": "g1-carriage-1.top", "note": "What the carriage carries" },
    { "joint": "g1-1", "force": 20, "note": "A push along the rods: a cable chain's drag, or a tool pressed along the way" }
  ]
}
```

```sh
npx cad check frame/box
npx cad check frame/box --sweep --steps 12
```

What the check says, piece by piece:

- `join.geometry`: each of the sixteen ends meets its face square and flush, where `b` says, on the slot's centre line.
  `join.end`: all 24 beam ends are joined or capped.
- A blind join's screw, followed as any `fasten` is: an M5x12 button, 10 mm into the rail's own tapped thread (two
  diameters in aluminium, `engagement.aluminium`), its head bearing on the post's lips from inside: 17.9 mm² of
  aluminium either side of the opening takes 3677 N, so it is tightened to 3.68 N m at most.
- A bracket: 4.8 mm thick and 4.07 g, 2.86 times under PLA's strength at its 100 N by finite elements, two M4x10 cap
  screws, each into a drop-in nut with 4 mm of thread.
- The feet: an M5x16 cap through each foot's 5 mm floor and 11 mm into the post's tapped end.
- The board plate: each screw over the centre line of `x1`'s top slot (`fasten.slot`), at 105 and 155 mm from its end
  a; M4x8 button chosen, 3.8 mm into its nut and 1 mm short of the slot's floor. `frame.nut`: the drop-in nuts go in
  through the slot's opening, anywhere along it.
- The axis: the carriage slides 99.5 mm (`guide.travel`); the motor's shaft goes 12.5 mm into the coupler, half of
  it, so it stops short of the screw coming in from the other end (`guide.coupler`). `motor.torque`: 127.2 N at the
  carriage against the 20 N asked, 6.36 times over; it moves at 80 mm/s, and holds with the power off on the motor's
  detent (0.012 against 0.025 N m). `motor.heat`: the case reaches 53.8 °C at 1.2 A, under PLA's 57 °C.
  `joint.moment`: 556 g carried, the worse bearing takes 2.7 N against an LM8UU's 400 N.
- `frame.square`: each bay's two diagonals, to measure when building it. The two sides along x have a 260 by 120 mm
  opening: each diagonal 286.36 mm, and a difference of up to 1.08 mm to accept. The two rails' cuts at ±0.5 mm give
  0.91 mm of it (2 × 0.5 × 260 / 286.36) and the four blind joins' play 0.17 mm (4 × 0.1 × 120 / 286.36, an
  estimate), stacked worst case; 0.65 mm root-sum-square. Once it is squared, the difference measured goes back with
  `cad measured frame/box frame.square.p1-p2-x1-x3=<mm>`.
- `join.stiffness`: what each join puts at the rail's end when the frame is solved. A blind join is 1.5 N·m/mrad in
  bending and 0.3 in twist, an estimate; a bracket's bending, 0.095 N·m/mrad, is its own by finite elements, and the
  slot nuts and lips are in neither. Both stay estimates until the joint rig (issue 264) measures one.

The sweep moves the carriage from one end of its travel to the other, 0 to 99.5 mm in 12 steps: nothing collides.

### Strong enough, and small

Each printed part is sized from a named load to about twice the margin, where its load sizes it at all:

| Part | Grams | Load it is sized for | Margin |
|---|---|---|---|
| Corner bracket (× 4) | 4.1 | 100 N across the rail at its screw | 2.86, by finite elements |
| Carriage | 23.6 | 50 N on its middle, between its bearings | 6.04 |
| Motor plate | 10.5 | 50 N along the beam at the shaft's height | 4.95 |
| Rod holder (× 2) | 17.6 | 50 N along the beam at the rods' height | 24.3 |
| Foot (× 4) | 7.0 | 250 N down the post | 78.8 |
| End cap (× 4) | 1.3 | none: pushed on | |
| Board plate | 5.1 | its screws' seat: 1124 N under each head | |

The bracket is the part its load sizes: thinner, it would bend past its margin. The others are sized by what they hold
rather than what they carry: the carriage by its two bearings' pockets and the nut's bore, the holder by the 608
bearing pressed into it, the plate by the motor's boss and its four screws, the foot by the counterbore its screw's
head sinks into. Each is as small as those allow. The margins under 2.86 come from beam formulas or coarse finite
elements on PLA's 39 MPa (`pla.strength`, a community figure), so each is an estimate, and the finding says so.

### Cut, drilled and tapped

```sh
npx cad list frame/box
npx cad beams frame/box
npx cad beams frame/box --jigs
```

`cad list` gives the cut list. The beams come in seven marks, beams cut and drilled alike sharing one: `A`, the four
rails along x at 260 mm, each tapped M5 18.5 mm deep at both ends; `B`, the two bracket-held rails at 220 mm, cut
square and nothing more; `C`, the two top rails along y, tapped; and `D` to `G`, the four posts at 200 mm, each tapped
at its foot, with three access holes on the faces its rails meet. All twelve come out of one 4000 mm bar, with a
3 mm kerf and 10 mm trimmed off its first end, leaving a 1234 mm offcut. Then the bought parts (the rods, bearings,
coupler, screw, nut and motor), the fasteners by size with the packs to buy, and 124 g printed in 17 parts, about
134 minutes of printing. The fasteners, as `cad list` gives them:

- 12 × M5x12 button, for the blind joins.
- 16 × M4x10 cap, with 16 of the 18 drop-in nuts, for the brackets, the rod holders and the motor plate.
- 2 × M4x8 button, with the other 2 drop-in nuts, for the board plate.
- 4 × M5x16 cap, for the feet.
- 4 × M3x8 cap, for the motor on its plate.
- 4 × M3x12 button, for the lead nut's flange on the carriage.

`cad beams` writes a cut-and-drill sheet for each mark, `exports/frame/box.beam-A.svg` and on: its length, each
operation dimensioned from end `a`, and which face is up. `--jigs` makes the jigs the beams take, as one plate,
`exports/frame/box.jigs.3mf`: a tap guide for the M5 ends, a cut-length stop for each length (260, 220 and 200 mm),
two drill guides for the posts' access holes (one 30 mm from an end, one 10 mm), and a squaring corner of each hand
for the blind joins, 8 jigs in 12 parts. Each is marked with what it is for, and prints without supports.

### Printed on one plate

```sh
npx cad plates frame/box
```

Every printed part of the frame goes on one plate of the X1C's bed, laid as each prints: the four brackets, the four
feet and caps, the two rod holders, the carriage, the motor plate and the board plate, 17 parts and 124 g, spaced by
the first layer's rule (0.84 mm). The plate is written as an assembly, `box-base-1`, and checked as one print: no
overhang past 45°, nothing in mid-air, nothing too near its neighbour on the first layer.

### Built in order

```sh
npx cad order frame/box
```

`cad order` takes the frame from bars to square in 37 numbered steps, and `cad check` counts the same 37
(`assembly.order`):

1. Cut the beams, mark by mark, from the one bar.
2. Drill and tap each mark as its sheet shows, and write the item on each beam.
3. Side 1, the front (`p1`, `p2`, `x1` and `x3`), built flat on the bench, a join at a time, each with its screw, its
   3 mm hex key and its torque (steps 3 to 6). Each join is left snug, then the side is squared by its diagonals and
   its joins tightened to their torque (step 7).
4. Side 2, the back, the same (steps 8 to 12).
5. The rails along y go on side 1 (steps 13 to 16), and side 2 goes on as one (step 17): the heads of its blind joins
   slide into the posts' slots from their ends.
6. The two bays along y are squared (step 18).
7. The rest is mounted: the feet and caps, the board plate, the holders, the carriage, the motor plate, the rods,
   the bearings, the motor, the coupler, the screw and its nut (steps 19 to 37).

Every head and every nut has a way into its slot at the step that puts it there: an end of the slot that nothing has
closed yet, and nothing already in the slot between it and that end. Here each blind join's head slides in from the
nearer end of its post as its rail goes on, and every slot nut is a drop-in, which goes in through the opening. Where a
slide-in nut or a head has no such way as its beam goes on, the build loads it at a step where it has one (`Load 2 ×
... through its end b, before cap1 goes on`, or `Slide an M5x12 button screw into x3's back slot head first ...`),
and where no step has one, it is refused with the slot and what is in the way.

It ends with each kind of join's tightening: the twelve blind joins to 3.68 N m (what the lips take), the four bracket
joins to 0.68 N m (what the PLA under each head takes).

### Two mistakes, caught

A trapped nut. The board plate on its rail between two posts, its nuts `slide-in`, which go into a slot only from an
open end. This one is built by commands, each checked as it is written: an empty assembly, three beams placed by
their ends, the plate at the middle of x1's top face, the two joins and the fasten.

```sh
npx cad new frame/trapped --assembly --title "The board plate on slide-in nuts"
npx cad add beam frame/trapped --id p1 --profile 2020-misumi-hfs5 --from 10,10,0 --to 10,10,200
npx cad add beam frame/trapped --id p2 --profile 2020-misumi-hfs5 --from 290,10,0 --to 290,10,200
npx cad add beam frame/trapped --id x1 --profile 2020-misumi-hfs5 --from 20,10,30 --to 280,10,30
npx cad add item frame/trapped --id plate --object plate --at x1.top@50%
npx cad add join frame/trapped --kind blind --a x1.a --b p1.back@30
npx cad add join frame/trapped --kind blind --a x1.b --b p2.front@30
npx cad add fasten frame/trapped --screw "M4 button" --through plate --into x1.top --holes plate.body --nut slide-in --note "The board plate"
```

`projects/frame/assemblies/trapped.json` is then the file a person would have written: the four items, the two joins
and the fasten.

`npx cad check frame/trapped` fails on `frame.nut`, and names the nut that would do:

```text
✗ The board plate: 2 slide-in nuts (slot-nut-6-misumi-m4-slide-in) go into x1's top slot at 105 and 155 mm, between x1's end a (the blind join of x1.a to p1.back@30) and x1's end b (the blind join of x1.b to p2.front@30), which close it at both ends: a slide-in nut goes in only from an open end. slot-nut-6-misumi-m4-drop-in (an M4 drop-in nut) goes in through the opening anywhere: give "nut": "drop-in"
```

and `npx cad order frame/trapped` refuses to give an order:

```text
frame/trapped: x1's top slot: 2 slide-in nuts (slot-nut-6-misumi-m4-slide-in) for plate would be shut in between the blind join of x1.a to p1.back@30 and the blind join of x1.b to p2.front@30: whichever of the two is made second shuts them in, and a nut loaded before it can never be taken out or replaced: give "nut": "drop-in" (slot-nut-6-misumi-m4-drop-in), which goes in through the opening anywhere
```

A plate drawn for the wrong slot spacing. The same plate turned across a wider rail, a 2040 whose top face has two
slots 20 mm apart, with its holes drawn 30 mm apart, as a 30 series beam's slots are:

```sh
npx cad new frame/spacing --assembly --title "A plate drawn for 30 mm slots on a 2040"
npx cad add beam frame/spacing --id x1 --profile 2040-misumi-hfs5 --from 0,0,10 --to 260,0,10
npx cad add item frame/spacing --id plate --object plate --at 130,0,20 --rotate 0,0,90 --set pitch=30,long=44
npx cad add fasten frame/spacing --screw "M4 button" --through plate --into x1.top --holes plate.body --nut drop-in --note "The board plate"
```

`npx cad check frame/spacing` fails on `fasten.slot`, for each screw:

```text
✗ The board plate, screw 1 (hole at -15, 0, 1.5): plate's hole is 5 mm off the centre line of x1's top.1 slot, where its 4.6 mm hole lets an M4 screw move 0.3 mm: the screw meets the face beside the slot, not its nut. x1's top slots are 20 mm apart. Move the hole 5 mm, or plate is drawn for another profile
✗ The board plate, screw 2 (hole at 15, 0, 1.5): plate's hole is 5 mm off the centre line of x1's top.2 slot, where its 4.6 mm hole lets an M4 screw move 0.3 mm: the screw meets the face beside the slot, not its nut. x1's top slots are 20 mm apart. Move the hole 5 mm, or plate is drawn for another profile
```

### The build page

`npx cad link frame/box --md` gives a link to the model page. Its Build button opens the shopping list, the cut list
and each beam's sheet, the plate drawn on its bed, and "Building the frame": the 37 steps, each a button that shows the
frame at that step, with the torques and the diagonals as tables. The carriage is a slider on the page, so the axis
can be run along its travel.

### What rests on estimates

The beams' sections, the slot nuts, the rods, the bearings, the screw and the motor come from their makers' figures.
Five things do not, and their findings say so:

- Each join's stiffness, until the joint rig (issue 264) measures one.
- The torque a blind join's head puts on the lips, which counts their bearing and not their bending.
- The printed parts' margins, which rest on PLA's strength and on beam formulas or coarse finite elements.
- The motor's case temperature (`motor.heat`): the maker's rise at its rated current, scaled by the square of the
  current the driver is set to (1.2 A here), since the heat goes as the current squared.
- The lead nut's friction on the screw, 0.15, an estimate that goes to the motor's checks with the lead.

The frame's own sag and sway under the carriage's load, and its lowest frequency, come with the frame checks (issues
265 to 267).

## 17. Printed beams: a small case as a kit

A case for a Raspberry Pi 4 with every beam printed: no bar to buy, no saw, no tap. The frame is drawn first in
aluminium, MISUMI's 2020 (`2020-misumi-hfs5`), and the check is asked which of its beams could be printed in PETG
instead. All of them can, by a wide margin, so the case is drawn again with every beam printed: four posts and eight
rails printed standing up, so they keep the four slots of MISUMI's section, and the cross beam under the board printed
lying down from the kit's printable 2020 (`2020-printed`), whose one slot faces up. Printed brackets hold the corners,
printed gussets the cross beam, a 3 mm acrylic panel closes each side, and the feet, end caps, the board's mount and a
fan mount all come from the kit's fittings. The frame's sag under the board is reported for both materials. A rail
longer than the printer's bed is spliced, a foot drawn for the aluminium post is caught, and the whole case is written
out as a kit: one plate to print and a page to build it from.

```sh
npx cad new case --title "A printed case for a small computer board" --printer x1c --material PETG
```

PETG rather than PLA: a board in a closed case runs warm, and PETG softens later.

### The board

The board is bought, so it is a rule set: its size, its four mounting holes and their diameter from the Raspberry Pi 4
Model B product brief (Raspberry Pi Ltd, April 2024). The brief gives no mass and no board thickness: the mass is what
shops list (45 to 50 g, a community figure) and the thickness is the common 1.6 mm board (an estimate). Weigh and
measure yours.

```json rules/rpi4.json
{
  "_doc": "Raspberry Pi 4 Model B, the board alone, from the maker's product brief. Board in the x-y plane, the USB and Ethernet end at +x, seen from above.",
  "name": "rpi4",
  "part": "board",
  "rules": {
    "body_width": { "value": 85, "unit": "mm", "rule": "The board's length, along x", "kind": "spec", "source": "Raspberry Pi 4 Model B product brief (Raspberry Pi Ltd, April 2024), Physical specification, https://pip.raspberrypi.com/categories/545-raspberry-pi-4-model-b", "checked": "2026-11-20" },
    "body_depth": { "value": 56, "unit": "mm", "rule": "The board's width, along y", "kind": "spec", "source": "Raspberry Pi 4 Model B product brief (Raspberry Pi Ltd, April 2024), Physical specification, https://pip.raspberrypi.com/categories/545-raspberry-pi-4-model-b", "checked": "2026-11-20" },
    "mount_holes": { "value": [-39, -24.5, 19, -24.5, -39, 24.5, 19, 24.5], "unit": "mm", "rule": "The four mounting holes, centres from the board's middle, x then y for each: 3.5 mm in from the end away from the USB sockets and 58 mm on, 3.5 mm in from each long edge and 49 mm apart", "kind": "spec", "source": "Raspberry Pi 4 Model B product brief (Raspberry Pi Ltd, April 2024), Physical specification, https://pip.raspberrypi.com/categories/545-raspberry-pi-4-model-b", "checked": "2026-11-20" },
    "mount_hole_diameter": { "value": 2.7, "unit": "mm", "rule": "The mounting holes, for M2.5 screws", "kind": "spec", "source": "Raspberry Pi 4 Model B product brief (Raspberry Pi Ltd, April 2024), Physical specification, https://pip.raspberrypi.com/categories/545-raspberry-pi-4-model-b", "checked": "2026-11-20" },
    "board_thickness": { "value": 1.6, "unit": "mm", "rule": "The board through its mounting holes: the brief does not give it, so the common 1.6 mm board is taken. Measure yours", "kind": "estimate", "source": "The common 1.6 mm FR-4 board; the maker's brief gives no thickness", "checked": "2026-11-20" },
    "mass": { "value": 0.05, "unit": "kg", "rule": "The board as sold, without a case: shops list 45 to 50 g, and the maker publishes none. Weigh yours", "kind": "community", "source": "Shop listings: Heltec, 50 g, https://heltec.org/?p=81049; othoba.com, 45 g, https://othoba.com/raspberry-pi-4-model-b-4gb-for-high-performance-general-purpose-computer-incorporating-a-quad-core-64-bit-arm-cortex-a72-cpu-dishantech-bd-940248", "checked": "2026-11-20" }
  }
}
```

### The case in aluminium

Up is z, and the case stands on its feet at z = 0. Four posts, `p1` to `p4`, stand 120 mm tall at the corners of a
180 by 170 mm rectangle. Rails join them at 10 mm and at 110 mm up: `x1` to `x4` along x, `y1` to `y4` along y, each
placed by its two ends so it runs from post face to post face. `x2` and `x4` run from `p3` to `p4`, right to left: a
gusset lies on the side of its two beams that b's direction turns toward a's, so with `x2` drawn that way the gusset at
the cross beam's far end lies on top, as the near one does.

- **The corners.** Every rail is held to its post by a `bracket` join with `"fitting": "printed"`: a corner bracket
  from `@rulecad/frames`, sized from a 100 N load, on two M4 screws into drop-in nuts. A bracket lies in the corner
  on the rail's top or bottom face and the post's face, so it needs a slot in both.
- **The cross beam.** `m1` runs along y in the middle of the bottom, from `x1` to `x2`, held at each end by a printed
  `gusset`: a T plate on the top faces of both beams.
- **The board.** `pi` is the bought board on a printed mount (`"mount"`) in the middle of `m1`'s top slot, turned so
  its long side lies across the beam. Its four M2.5 screws go down through its holes into pilots in the mount's bosses;
  the mount's two M5 screws go into roll-in nuts in the slot.
- **The fan.** A printed `fan-mount` for a 40 mm fan on the inner face of the back top rail, `x4`, on two M5 screws.
- **The sides.** A 3 mm acrylic `panel` in each side, its clips screwed into the slots that face out. A clip's nut
  goes into a slot already closed at both ends, so the panels take roll-in nuts (`"nut": "roll-in"`).
- **Feet and caps.** A printed `foot` under each post, an M5 screw through it into the post's tapped end, and a
  printed `end-cap` on each post's top.
- **The sag.** `"frame": { "points": ["m1.top@50%"] }` asks for the sag under the board. Nothing is hung there by
  hand: the board and its mount are items on `m1`, so their mass is where they are.
- **Printed instead.** `"printed": "petg"` asks, for each beam, whether it could be printed in PETG.

```json projects/case/assemblies/aluminium.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/assembly.schema.json",
  "title": "The case in aluminium",
  "kind": "fit",
  "description": "Four posts and two rings of MISUMI 2020, a cross beam under the board, printed brackets at the corners and gussets at the cross beam, a panel in each side, feet and caps, the board on its mount and a fan mount; each beam tried printed in PETG.",
  "items": [
    { "id": "p1", "beam": { "profile": "2020-misumi-hfs5", "ops": [{ "op": "tap", "at": "a", "thread": "M5", "depth": 18.5 }] }, "from": [10, 10, 0], "to": [10, 10, 120] },
    { "id": "p2", "beam": { "profile": "2020-misumi-hfs5", "ops": [{ "op": "tap", "at": "a", "thread": "M5", "depth": 18.5 }] }, "from": [170, 10, 0], "to": [170, 10, 120] },
    { "id": "p3", "beam": { "profile": "2020-misumi-hfs5", "ops": [{ "op": "tap", "at": "a", "thread": "M5", "depth": 18.5 }] }, "from": [170, 160, 0], "to": [170, 160, 120] },
    { "id": "p4", "beam": { "profile": "2020-misumi-hfs5", "ops": [{ "op": "tap", "at": "a", "thread": "M5", "depth": 18.5 }] }, "from": [10, 160, 0], "to": [10, 160, 120] },
    { "id": "x1", "beam": { "profile": "2020-misumi-hfs5" }, "from": [20, 10, 10], "to": [160, 10, 10] },
    { "id": "x2", "beam": { "profile": "2020-misumi-hfs5" }, "from": [160, 160, 10], "to": [20, 160, 10] },
    { "id": "y1", "beam": { "profile": "2020-misumi-hfs5" }, "from": [10, 20, 10], "to": [10, 150, 10] },
    { "id": "y2", "beam": { "profile": "2020-misumi-hfs5" }, "from": [170, 20, 10], "to": [170, 150, 10] },
    { "id": "x3", "beam": { "profile": "2020-misumi-hfs5" }, "from": [20, 10, 110], "to": [160, 10, 110] },
    { "id": "x4", "beam": { "profile": "2020-misumi-hfs5" }, "from": [160, 160, 110], "to": [20, 160, 110] },
    { "id": "y3", "beam": { "profile": "2020-misumi-hfs5" }, "from": [10, 20, 110], "to": [10, 150, 110] },
    { "id": "y4", "beam": { "profile": "2020-misumi-hfs5" }, "from": [170, 20, 110], "to": [170, 150, 110] },
    { "id": "m1", "beam": { "profile": "2020-misumi-hfs5" }, "from": [90, 20, 10], "to": [90, 150, 10] },
    { "id": "foot1", "fitting": { "kind": "foot", "profile": "2020-misumi-hfs5" }, "at": "p1.a" },
    { "id": "foot2", "fitting": { "kind": "foot", "profile": "2020-misumi-hfs5" }, "at": "p2.a" },
    { "id": "foot3", "fitting": { "kind": "foot", "profile": "2020-misumi-hfs5" }, "at": "p3.a" },
    { "id": "foot4", "fitting": { "kind": "foot", "profile": "2020-misumi-hfs5" }, "at": "p4.a" },
    { "id": "cap1", "fitting": { "kind": "end-cap", "profile": "2020-misumi-hfs5" }, "at": "p1.b" },
    { "id": "cap2", "fitting": { "kind": "end-cap", "profile": "2020-misumi-hfs5" }, "at": "p2.b" },
    { "id": "cap3", "fitting": { "kind": "end-cap", "profile": "2020-misumi-hfs5" }, "at": "p3.b" },
    { "id": "cap4", "fitting": { "kind": "end-cap", "profile": "2020-misumi-hfs5" }, "at": "p4.b" },
    { "id": "front", "panel": { "sheet": "acrylic", "thickness": 3, "bay": ["x1", "p2", "x3", "p1"], "out": [0, -1, 0], "nut": "roll-in" } },
    { "id": "back", "panel": { "sheet": "acrylic", "thickness": 3, "bay": ["x2", "p3", "x4", "p4"], "out": [0, 1, 0], "nut": "roll-in" } },
    { "id": "left", "panel": { "sheet": "acrylic", "thickness": 3, "bay": ["y1", "p4", "y3", "p1"], "out": [-1, 0, 0], "nut": "roll-in" } },
    { "id": "right", "panel": { "sheet": "acrylic", "thickness": 3, "bay": ["y2", "p3", "y4", "p2"], "out": [1, 0, 0], "nut": "roll-in" } },
    { "id": "pi", "bought": "rpi4", "mount": { "on": "m1.top@65", "turn": 90, "nut": "roll-in" } },
    { "id": "fan", "fitting": { "kind": "fan-mount", "profile": "2020-misumi-hfs5", "size": 40 }, "at": "x4.back@70" }
  ],
  "joins": [
    { "kind": "bracket", "a": "x1.a", "b": "p1.back@10", "fitting": "printed", "nut": "drop-in" },
    { "kind": "bracket", "a": "x1.b", "b": "p2.front@10", "fitting": "printed", "nut": "drop-in" },
    { "kind": "bracket", "a": "x2.a", "b": "p3.front@10", "fitting": "printed", "nut": "drop-in" },
    { "kind": "bracket", "a": "x2.b", "b": "p4.back@10", "fitting": "printed", "nut": "drop-in" },
    { "kind": "bracket", "a": "y1.a", "b": "p1.top@10", "fitting": "printed", "nut": "drop-in" },
    { "kind": "bracket", "a": "y1.b", "b": "p4.bottom@10", "fitting": "printed", "nut": "drop-in" },
    { "kind": "bracket", "a": "y2.a", "b": "p2.top@10", "fitting": "printed", "nut": "drop-in" },
    { "kind": "bracket", "a": "y2.b", "b": "p3.bottom@10", "fitting": "printed", "nut": "drop-in" },
    { "kind": "bracket", "a": "x3.a", "b": "p1.back@110", "fitting": "printed", "nut": "drop-in" },
    { "kind": "bracket", "a": "x3.b", "b": "p2.front@110", "fitting": "printed", "nut": "drop-in" },
    { "kind": "bracket", "a": "x4.a", "b": "p3.front@110", "fitting": "printed", "nut": "drop-in" },
    { "kind": "bracket", "a": "x4.b", "b": "p4.back@110", "fitting": "printed", "nut": "drop-in" },
    { "kind": "bracket", "a": "y3.a", "b": "p1.top@110", "fitting": "printed", "nut": "drop-in" },
    { "kind": "bracket", "a": "y3.b", "b": "p4.bottom@110", "fitting": "printed", "nut": "drop-in" },
    { "kind": "bracket", "a": "y4.a", "b": "p2.top@110", "fitting": "printed", "nut": "drop-in" },
    { "kind": "bracket", "a": "y4.b", "b": "p3.bottom@110", "fitting": "printed", "nut": "drop-in" },
    { "kind": "gusset", "a": "m1.a", "b": "x1.back@70", "fitting": "printed", "nut": "drop-in" },
    { "kind": "gusset", "a": "m1.b", "b": "x2.back@70", "fitting": "printed", "nut": "drop-in" }
  ],
  "fasten": [
    { "screw": "M5 cap", "through": ["foot1"], "into": "p1", "at": ["foot1.b1"], "note": "Foot 1" },
    { "screw": "M5 cap", "through": ["foot2"], "into": "p2", "at": ["foot2.b1"], "note": "Foot 2" },
    { "screw": "M5 cap", "through": ["foot3"], "into": "p3", "at": ["foot3.b1"], "note": "Foot 3" },
    { "screw": "M5 cap", "through": ["foot4"], "into": "p4", "at": ["foot4.b1"], "note": "Foot 4" },
    { "screw": "M5 button", "through": ["fan"], "into": "x4.back", "at": ["fan.b1", "fan.b2"], "nut": "roll-in", "note": "The fan mount" }
  ],
  "frame": { "points": ["m1.top@50%"], "printed": "petg" }
 }
```

```sh
npx cad check case/aluminium
```

The frame checks with nothing failing and nothing warning. Under the board, `m1` sags 0.000352 mm with the joins'
springs (`frame.deflection`), against 0.361 mm allowed (its 130 mm span over 360). Then `beam.printable` takes each
beam in turn, puts the kit's printable 2020 in its place in PETG, solves the frame again and holds the beam to the
frame's sags, its stress and buckling with twice the margin, a creep limit and its sag as it creeps:

- Every one of the 13 beams can be printed. The least margin of each is from 70 (`x1` and `x2`, on their sag as they
  creep: they carry the cross beam's ends) to 368 (the bottom side rails); `m1` under the board 82, the posts over 200.
- All 13 printed together and solved once more, the least margin is 26.6, on `m1`'s sag as it creeps (0.014 mm), with
  438 g of PETG in all.
- 14 of the joins need changing to print it that way: the kit's printable 2020 has one slot, in its top face, and a
  bracket landing on a post's side face, or a panel's clip, needs a slot there.

So every beam could be either: aluminium, or PETG. What decides how each is printed is how many of its faces need a
slot.

### Every beam printed

A beam lying down prints with its layers along it, strong in bending, but only a slot facing up prints without
supports, so the kit's printable profiles have one. A beam standing on its end prints its section exactly as drawn,
every slot included, but its layers lie across it, so it bends at PETG's strength across its layers, 23 MPa against
34 along them, and its slots' lips hold less. In this case the posts and the rails each need three or four slotted
faces: the brackets' and the panels'. They print standing up, from MISUMI's own section, each no taller than the
X1C's 256 mm. The cross beam needs its top slot alone, for the gussets and the board's mount, so it lies down.

- **`"printed"` on a beam.** `{ "pose": "standing", "pull": 50 }` for the posts and rails: `pull` is the design pull
  on a slot nut. At 100 N, the kit's default, a standing slot's lips hold 1.56 times, under the twice a printed part
  is sized for; at 50 N they hold 3.07 times. 50 N is a hand pressing on a closed case.
- **The posts' ends.** A tapped end of a printed beam becomes a fixing of the print. MISUMI's section has a 4.2 mm
  bore and names no printed end of its own, so standing up the end takes its screw in the bore's place: an M4 heat-set
  insert needs 4.95 mm of plastic round its middle and the section has 4, so it takes an M3 captive nut (`"end":
  "nut"`), slid in from the side 4.5 mm in from the end, its screw up the bore. The foot is drawn for that thread
  (`"thread": "M3"`), and its screw is an M3.
- **The rest** is as in aluminium: the same joins, fittings, panels and board.

```json projects/case/assemblies/printed.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/assembly.schema.json",
  "title": "The case, every beam printed",
  "kind": "fit",
  "description": "Four posts and two rings of beams, all printed in PETG: those that need four slotted faces standing up from MISUMI's 2020, the cross beam under the board lying down from the kit's printable 2020. Printed brackets at the corners, gussets at the cross beam, a panel in each side, feet and caps, the board on its mount and a fan mount.",
  "items": [
    { "id": "p1", "beam": { "profile": "2020-misumi-hfs5", "material": "petg", "printed": { "pose": "standing", "pull": 50, "end": "nut" }, "ops": [{ "op": "tap", "at": "a" }] }, "from": [10, 10, 0], "to": [10, 10, 120] },
    { "id": "p2", "beam": { "profile": "2020-misumi-hfs5", "material": "petg", "printed": { "pose": "standing", "pull": 50, "end": "nut" }, "ops": [{ "op": "tap", "at": "a" }] }, "from": [170, 10, 0], "to": [170, 10, 120] },
    { "id": "p3", "beam": { "profile": "2020-misumi-hfs5", "material": "petg", "printed": { "pose": "standing", "pull": 50, "end": "nut" }, "ops": [{ "op": "tap", "at": "a" }] }, "from": [170, 160, 0], "to": [170, 160, 120] },
    { "id": "p4", "beam": { "profile": "2020-misumi-hfs5", "material": "petg", "printed": { "pose": "standing", "pull": 50, "end": "nut" }, "ops": [{ "op": "tap", "at": "a" }] }, "from": [10, 160, 0], "to": [10, 160, 120] },
    { "id": "x1", "beam": { "profile": "2020-misumi-hfs5", "material": "petg", "printed": { "pose": "standing", "pull": 50 } }, "from": [20, 10, 10], "to": [160, 10, 10] },
    { "id": "x2", "beam": { "profile": "2020-misumi-hfs5", "material": "petg", "printed": { "pose": "standing", "pull": 50 } }, "from": [160, 160, 10], "to": [20, 160, 10] },
    { "id": "y1", "beam": { "profile": "2020-misumi-hfs5", "material": "petg", "printed": { "pose": "standing", "pull": 50 } }, "from": [10, 20, 10], "to": [10, 150, 10] },
    { "id": "y2", "beam": { "profile": "2020-misumi-hfs5", "material": "petg", "printed": { "pose": "standing", "pull": 50 } }, "from": [170, 20, 10], "to": [170, 150, 10] },
    { "id": "x3", "beam": { "profile": "2020-misumi-hfs5", "material": "petg", "printed": { "pose": "standing", "pull": 50 } }, "from": [20, 10, 110], "to": [160, 10, 110] },
    { "id": "x4", "beam": { "profile": "2020-misumi-hfs5", "material": "petg", "printed": { "pose": "standing", "pull": 50 } }, "from": [160, 160, 110], "to": [20, 160, 110] },
    { "id": "y3", "beam": { "profile": "2020-misumi-hfs5", "material": "petg", "printed": { "pose": "standing", "pull": 50 } }, "from": [10, 20, 110], "to": [10, 150, 110] },
    { "id": "y4", "beam": { "profile": "2020-misumi-hfs5", "material": "petg", "printed": { "pose": "standing", "pull": 50 } }, "from": [170, 20, 110], "to": [170, 150, 110] },
    { "id": "m1", "beam": { "profile": "2020-printed", "material": "petg", "printed": true }, "from": [90, 20, 10], "to": [90, 150, 10] },
    { "id": "foot1", "fitting": { "kind": "foot", "profile": "2020-misumi-hfs5", "thread": "M3" }, "at": "p1.a" },
    { "id": "foot2", "fitting": { "kind": "foot", "profile": "2020-misumi-hfs5", "thread": "M3" }, "at": "p2.a" },
    { "id": "foot3", "fitting": { "kind": "foot", "profile": "2020-misumi-hfs5", "thread": "M3" }, "at": "p3.a" },
    { "id": "foot4", "fitting": { "kind": "foot", "profile": "2020-misumi-hfs5", "thread": "M3" }, "at": "p4.a" },
    { "id": "cap1", "fitting": { "kind": "end-cap", "profile": "2020-misumi-hfs5" }, "at": "p1.b" },
    { "id": "cap2", "fitting": { "kind": "end-cap", "profile": "2020-misumi-hfs5" }, "at": "p2.b" },
    { "id": "cap3", "fitting": { "kind": "end-cap", "profile": "2020-misumi-hfs5" }, "at": "p3.b" },
    { "id": "cap4", "fitting": { "kind": "end-cap", "profile": "2020-misumi-hfs5" }, "at": "p4.b" },
    { "id": "front", "panel": { "sheet": "acrylic", "thickness": 3, "bay": ["x1", "p2", "x3", "p1"], "out": [0, -1, 0], "nut": "roll-in" } },
    { "id": "back", "panel": { "sheet": "acrylic", "thickness": 3, "bay": ["x2", "p3", "x4", "p4"], "out": [0, 1, 0], "nut": "roll-in" } },
    { "id": "left", "panel": { "sheet": "acrylic", "thickness": 3, "bay": ["y1", "p4", "y3", "p1"], "out": [-1, 0, 0], "nut": "roll-in" } },
    { "id": "right", "panel": { "sheet": "acrylic", "thickness": 3, "bay": ["y2", "p3", "y4", "p2"], "out": [1, 0, 0], "nut": "roll-in" } },
    { "id": "pi", "bought": "rpi4", "mount": { "on": "m1.top@65", "turn": 90, "nut": "roll-in" } },
    { "id": "fan", "fitting": { "kind": "fan-mount", "profile": "2020-misumi-hfs5", "size": 40 }, "at": "x4.back@70" }
  ],
  "joins": [
    { "kind": "bracket", "a": "x1.a", "b": "p1.back@10", "fitting": "printed", "nut": "drop-in" },
    { "kind": "bracket", "a": "x1.b", "b": "p2.front@10", "fitting": "printed", "nut": "drop-in" },
    { "kind": "bracket", "a": "x2.a", "b": "p3.front@10", "fitting": "printed", "nut": "drop-in" },
    { "kind": "bracket", "a": "x2.b", "b": "p4.back@10", "fitting": "printed", "nut": "drop-in" },
    { "kind": "bracket", "a": "y1.a", "b": "p1.top@10", "fitting": "printed", "nut": "drop-in" },
    { "kind": "bracket", "a": "y1.b", "b": "p4.bottom@10", "fitting": "printed", "nut": "drop-in" },
    { "kind": "bracket", "a": "y2.a", "b": "p2.top@10", "fitting": "printed", "nut": "drop-in" },
    { "kind": "bracket", "a": "y2.b", "b": "p3.bottom@10", "fitting": "printed", "nut": "drop-in" },
    { "kind": "bracket", "a": "x3.a", "b": "p1.back@110", "fitting": "printed", "nut": "drop-in" },
    { "kind": "bracket", "a": "x3.b", "b": "p2.front@110", "fitting": "printed", "nut": "drop-in" },
    { "kind": "bracket", "a": "x4.a", "b": "p3.front@110", "fitting": "printed", "nut": "drop-in" },
    { "kind": "bracket", "a": "x4.b", "b": "p4.back@110", "fitting": "printed", "nut": "drop-in" },
    { "kind": "bracket", "a": "y3.a", "b": "p1.top@110", "fitting": "printed", "nut": "drop-in" },
    { "kind": "bracket", "a": "y3.b", "b": "p4.bottom@110", "fitting": "printed", "nut": "drop-in" },
    { "kind": "bracket", "a": "y4.a", "b": "p2.top@110", "fitting": "printed", "nut": "drop-in" },
    { "kind": "bracket", "a": "y4.b", "b": "p3.bottom@110", "fitting": "printed", "nut": "drop-in" },
    { "kind": "gusset", "a": "m1.a", "b": "x1.back@70", "fitting": "printed", "nut": "drop-in" },
    { "kind": "gusset", "a": "m1.b", "b": "x2.back@70", "fitting": "printed", "nut": "drop-in" }
  ],
  "fasten": [
    { "screw": "M3 cap", "through": ["foot1"], "into": "p1", "at": ["foot1.b1"], "note": "Foot 1" },
    { "screw": "M3 cap", "through": ["foot2"], "into": "p2", "at": ["foot2.b1"], "note": "Foot 2" },
    { "screw": "M3 cap", "through": ["foot3"], "into": "p3", "at": ["foot3.b1"], "note": "Foot 3" },
    { "screw": "M3 cap", "through": ["foot4"], "into": "p4", "at": ["foot4.b1"], "note": "Foot 4" },
    { "screw": "M5 button", "through": ["fan"], "into": "x4.back", "at": ["fan.b1", "fan.b2"], "nut": "roll-in", "note": "The fan mount" }
  ],
  "frame": { "points": ["m1.top@50%"] }
 }
```

```sh
npx cad check case/printed
```

It checks with nothing failing and nothing warning, 1102 checks passing:

- Each post: `beam.printable` says it prints standing on end a with no supports; `beam.end` says end a takes an M3
  captive nut in its bore's place, with 4 mm of plastic round the screw's line for the nut's corners and a line.
- Each foot: an M3x10 cap through the foot's 3 mm floor into the post's nut in its seat (`fasten.end`), the nut
  5.5 mm across its flats in a 5.7 mm slot.
- Each bracket's and gusset's nut in a slot: in the posts and rails, MISUMI's slot, its thread from 1.2 mm under the
  face; in `m1`, the printable slot, whose lips slope underneath at 45°, so a drop-in nut, 10 mm wide in its 6.1 mm
  opening, seats 2 + (10 − 6.1) / 2 = 3.95 mm under the face and its thread runs from 3.15 to 7.25 mm. Each gusset
  has MISUMI's slot under one arm and the printable slot under the other, so it is drawn for both (`fitting.screw`):
  4.6 mm thick, the least at which a length sold fits each, M4x10 into the rails (its tip 5.4 mm in) and M4x12 into
  `m1` (its tip 7.4 mm in, 0.45 mm short of the floor). Each screw has the 3.2 mm of thread a hex nut's height asks.
- The board on its mount: M2.5x8 cap screws, the largest whose 4.5 mm heads sit whole on the board, its holes 3.5 mm
  from its edges; 6.4 mm of PETG engaged in each pilot.
- `frame.deflection`: under the board, `m1` sags 0.009 mm with the joins' springs, 0.007 mm with them rigid, against
  0.361 mm. `frame.rack`: 20 N pushed at the top sways it 0.072 mm along x and 0.074 mm along y, against 0.275 mm (its
  height, 110 mm between the rails, over 400): the panels hold it. `frame.frequency`: the lowest mode 139.7 Hz.
- `assembly.order`: it goes together in 47 steps, nothing trapped.

The sag under the board, both ways:

| Frame | Sag at `m1.top@50%`, joins' springs | Joins rigid | Allowed |
|---|---|---|---|
| Aluminium, `case/aluminium` | 0.000352 mm | 0.000223 mm | 0.361 mm |
| Printed in PETG, `case/printed` | 0.009 mm | 0.007 mm | 0.361 mm |

The printed case sags about 26 times as much as the aluminium one: PETG's 1810 MPa along its layers (1540 standing)
against the aluminium's 69972 makes each beam 38 to 48 times as soft (with each section's second moment), and the printed brackets' springs, the same in both,
make up the rest. Both are far inside the limit. As a check by hand: `m1` alone, pinned at its ends, under the board
and its mount at its middle (0.05 + 0.027 kg, 0.756 N) and its own 33.8 g, sags 0.756 × 130³ / (48 × 1810 × 7605) +
5 × 0.00255 × 130⁴ / (384 × 1810 × 7605) = 0.0025 + 0.0007 = 0.0032 mm; the frame's 0.009 mm adds `x1` and `x2`
bending under its ends and the joins giving.

### Strong enough, and small

Each printed part is sized from a named load to about twice the margin, where its load sizes it at all:

| Part | Grams | Load it is sized for | Margin |
|---|---|---|---|
| Post, standing (× 4) | 26.8 | 50 N pulling a nut out of a slot | 3.07 |
| Rail, standing (× 8) | 31.3 along x, 29.1 along y | 50 N pulling a nut out of a slot | 3.07 |
| Cross beam, lying | 33.8 | 100 N pulling a nut out of its slot | 4.2 |
| Corner bracket (× 16) | 4.5 | 100 N across the rail at its screw | 3.09, by finite elements |
| T gusset (× 2) | 9.4 | 100 N in its plane at its farthest screw | 5.97, by finite elements |
| Board mount | 27.1 | 50 N on the board at its farthest hole | 4.62 |
| Fan mount | 17.5 | 50 N on the fan at its farthest hole | 5.65 |
| Panel clip (× 32) | 1.6 | 30 N pushing the panel out | 2.12 |
| Foot (× 4) | 4.6 | 250 N down the post | 73.8 |
| End cap (× 4) | 1.3 | none: pushed on | |

The beams are sized by their slots, not their bending: the frame's highest stress is 0.04 MPa, in `x1`, 633 times
under PETG's 23 MPa across its layers. The bracket and the clip are the parts their loads size; the
mounts are sized by their screws' bosses and the board's and fan's holes, the foot by its counterbore. 593 g in all,
73 parts.

### Two mistakes, caught

A rail longer than the bed. A wider case might take a 300 mm rail, printed lying down:

```json projects/case/assemblies/long.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/assembly.schema.json",
  "title": "A 300 mm rail, printed whole",
  "kind": "fit",
  "items": [
    { "id": "r1", "beam": { "profile": "2020-printed", "material": "petg", "printed": true }, "from": [0, 0, 10], "to": [300, 0, 10] },
    { "id": "cap1", "fitting": { "kind": "end-cap", "profile": "2020-printed" }, "at": "r1.a" },
    { "id": "cap2", "fitting": { "kind": "end-cap", "profile": "2020-printed" }, "at": "r1.b" }
  ],
  "frame": { "supports": { "r1.a": "fixed", "r1.b": "fixed" } }
}
```

`npx cad check case/long` fails on `beam.printable`:

```text
✗ r1: profile-2020-printed x 300, printed lying down: 300 mm long, and x1c's bed is 256 mm: splice it in two (splice()), or stand it up if it is no taller than the printer
```

Spliced where it must be: two halves of 150 mm, end to end, held by a `splice` join with a printed splice plate on
their top faces, two M4 screws into drop-in nuts in each half's slot:

```json projects/case/assemblies/spliced.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/assembly.schema.json",
  "title": "The 300 mm rail in two halves, spliced",
  "kind": "fit",
  "items": [
    { "id": "r1", "beam": { "profile": "2020-printed", "material": "petg", "printed": true }, "from": [0, 0, 10], "to": [150, 0, 10] },
    { "id": "r2", "beam": { "profile": "2020-printed", "material": "petg", "printed": true }, "from": [150, 0, 10], "to": [300, 0, 10] },
    { "id": "cap1", "fitting": { "kind": "end-cap", "profile": "2020-printed" }, "at": "r1.a" },
    { "id": "cap2", "fitting": { "kind": "end-cap", "profile": "2020-printed" }, "at": "r2.b" }
  ],
  "joins": [{ "kind": "splice", "a": "r1.b", "b": "r2.a", "fitting": "printed", "nut": "drop-in" }],
  "frame": { "supports": { "r1.a": "fixed", "r2.b": "fixed" } }
}
```

```sh
npx cad check case/spliced
```

Both halves print lying down, and the plate is 4.6 mm thick, 3.7 g, 4.88 times under PETG's strength at 100 N by
finite elements. Its thickness is set by its screws, not its load: the nuts seat 3.95 mm down under the halves' sloped
lips, so an M4x12 through 4.6 mm reaches 7.4 mm into the slot and has the 3.2 mm of thread asked, where an M4x10
through the 4 mm the load needs would have 2.85. Its stiffness, 0.152 N·m/mrad, is its own, the slot nuts and lips
left out, an estimate until the joint rig measures one.

A foot drawn for the aluminium post. The printed post with its foot as the aluminium case had it, an M5 screw for the
post's tapped bore:

```json projects/case/assemblies/foot.json
{
  "$schema": "https://jonibach.github.io/rulecad/schemas/assembly.schema.json",
  "title": "A foot drawn for an aluminium post",
  "kind": "fit",
  "items": [
    { "id": "p1", "beam": { "profile": "2020-misumi-hfs5", "material": "petg", "printed": { "pose": "standing", "pull": 50, "end": "nut" }, "ops": [{ "op": "tap", "at": "a" }] }, "from": [10, 10, 0], "to": [10, 10, 120] },
    { "id": "foot1", "fitting": { "kind": "foot", "profile": "2020-misumi-hfs5" }, "at": "p1.a" },
    { "id": "cap1", "fitting": { "kind": "end-cap", "profile": "2020-misumi-hfs5" }, "at": "p1.b" }
  ],
  "fasten": [{ "screw": "M5 cap", "through": ["foot1"], "into": "p1", "at": ["foot1.b1"], "note": "Foot 1" }]
}
```

`npx cad check case/foot` fails on `fasten.end`, and names the screw that would do:

```text
✗ Foot 1, an M5 cap screw: p1's end a is printed with an M3 captive nut in place of a tap, and the screw is M5: use an M3 screw (a printed foot takes it as "thread": "M3")
```

### The kit

```sh
npx cad kit case/printed
```

`cad kit` checks the case, refuses it if anything fails, and writes `exports/case/printed-kit/`:

- `README.md`: what the checks say, what to buy (the board, the four panels cut to size, the screws and nuts in
  packs), what to print, and the build in 47 steps.
- `buy.csv`: the same shopping list as a table.
- `print/printed-base-1.3mf`: one plate of PETG with every printed part on it, 73 parts and 593 g, about 654 minutes,
  laid out as each prints: the posts and rails on their ends, the cross beam on its bottom face, the brackets on their
  sides, the feet and the mounts on their beam sides. It prints clean: no overhang past 45°, nothing in mid-air.

There is no cut list, no drilling and no jigs: nothing is cut from a bar. The fasteners, as the kit lists them:

- 40 × M4x10 cap for the brackets and the gussets into the rails, 4 × M4x12 cap for the gussets into `m1`, with 44
  drop-in nuts.
- 32 × M5x10 button, for the panels' clips, and 4 × M5x12 button for the fan mount and the board's mount, with 36
  roll-in nuts.
- 4 × M3x10 cap, with 4 M3 hex nuts, for the feet.
- 4 × M2.5x8 cap, for the board.

### What rests on estimates

The board's size and holes, MISUMI's section and the slot nuts come from their makers' figures. These do not, and the
findings say so:

- A printed beam's stiffness and strength: its walls and infill (three walls, 40%), PETG's figures, and across its
  layers 0.6 of its strength along them where the plastic gives no figure of its own, until the beam coupon (the bench's
  `beam-test`, MEASURE.md rows 38 and 39) measures them.
- The creep limits that `beam.printable` holds a printed beam to, and the sag as it creeps.
- Each join's stiffness: the printed brackets' and gussets' own by finite elements, the slot nuts and lips left out.
- A slot's hold in plastic, and the 50 N pull the standing beams are sized for.
- The board's mass, a shop's figure, and its thickness. The fan is not modelled: its mount is, and its mass is not in
  the frame's solve.
