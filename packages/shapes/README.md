# @rulecad/shapes

Helpers for [JSCAD](https://github.com/jscad/OpenJSCAD.org) designs that get printed. JSCAD is a peer dependency: use
the one you already have.

```js
import jscad from '@jscad/modeling';
import { text, anchor, cut } from '@rulecad/shapes';

const line = 0.42;                                                           // your printer's line width
const legend = text({ text: 'Esc', height: 3.5, stroke: line * 2 });         // a 2D outline
const [x, y] = anchor({ width: 18, depth: 18 }, [8, 4], 'tl');               // where it goes on an 18 mm face
const inlay = jscad.transforms.translate([x, y, 0], jscad.extrusions.extrudeLinear({ height: 0.6 }, legend));
const cap = cut(body, inlay);                                                // only the faces near the legend are cut
```

- `text({ text, height, stroke, segments })` uses JSCAD's single-line font, scaled so a capital is `height` tall.
  Every line is thickened to `stroke` wide, so make it whole print lines. Punctuation keeps its size, and the arrows
  the font lacks (↑ ↓ ← →) are drawn in the same stroke.
- `anchor({ width, depth }, [w, d], at)` places something `w` × `d` on a face at one of nine anchors: `tl tc tr / ml
  mc mr / bl bc br`. The face is centred on 0, with y to the back.
- `cut(a, b, margin)` is `subtract(a, b)`, but only the faces near `b` are cut. JSCAD's subtract splits every face of
  `a` along `b`'s planes, however far away, and those splits can leave hairline gaps that slicers dislike.
- `size(geom2)` gives a 2D outline's `[width, depth]`.

## Enclosures

The pieces cases are made of, drawn one way everywhere, so a family of parts looks like one system. Footprints are in
x and y, centred on 0, z up from the bed; every slope is 45 degrees, so they print without supports as drawn.

```js
import { shell, lid, dovetail, gabled } from '@rulecad/shapes';

const box = shell({ width: 72, height: 72, depth: 17, round: 6, wall: 2.1, floor: 1.6, bottom: 0.4 }); // open at the top
const front = lid({ width: 72, height: 72, round: 6, thick: 2.4, edge: 2, wall: 2.1, fit: 0.2, lip: 2, ring: 1.26 }); // printed face down
const rail = extrudeLinear({ height: 17 }, dovetail({ base: 6, height: 1.6 }));       // and its slot: dovetail({ ..., gap: 0.4 })
const window = gabled([-1, 1], [-1, 4], [10, 13]);                                     // an opening in an upright wall
```

- `outline(w, h, { round, bevel })`: a rectangle with rounded or cut corners (2D).
- `slab({ width, height, depth, round, bevel, bottom, top })`: a block on that outline, its lower and upper edges
  sloped in by `bottom` (against elephant's foot) and `top` (a bevelled front edge).
- `shell({ ...slab, wall, floor })`: a slab hollowed from `floor` up, open at the top.
- `lid({ width, height, round, bevel, thick, edge, wall, fit, lip, ring })`: a lid printed face down, its front edge
  sloped by `edge`, with a lip `ring` wide that drops `lip` deep inside a shell's walls, `fit` away. Place it turned
  over (an assembly item's `"rotate": [180, 0, 0]`).
- `dovetail({ base, height, gap })`: a rail's profile rising from y = 0, flanks at 45 degrees; with `gap`, the slot
  that takes it, `gap` wider each side and deeper.
- `gabled([x0, x1], [y0, y1], [z0, z1], axis)`: a box with a 45 degree gabled roof, for openings in upright walls.
- `diamond(size, axis, length)`: a square hole turned 45 degrees, for small holes in upright walls.
- `vents({ count, width, pitch, length, depth })`: slots side by side along x.

## Print-aware features

Holes, pockets and ribs drawn so they print without supports with the part lying as drawn (z up from the bed).
Each starts at a point on a face (`at`) and goes into the material (`into`: `'+x'`, `'-x'`, `'+y'`, `'-y'`, `'+z'` up
from the bed, `'-z'` down from a top). Sizes come from your rules; nothing is built in.

```js
import { countersink, teardropHole, nutPocket, crushRibs, wallOpening } from '@rulecad/shapes'

countersink({ hole: v.hole, head: v.csk, length: 16, at: [x, y, 0], into: '+z' }) // flat head flush with the face
teardropHole({ d: v.hole, length: 20, at: [-10, 0, 5], into: '+x' })              // across a part: a 45° pointed roof
nutPocket({ flats: v.m3.nut_flats + v.x1c.hole_comp, height: v.m3.nut_height, hole: v.hole, at: [x, y, 0], into: '+z' })
crushRibs({ at: [[-9.4, 5], [9.4, 5]], into: [[1, 0], [-1, 0]], z: [3, 5], radius: 0.84, protrude: 0.5 }) // to add
wallOpening({ width: 12.75, height: 6.9, depth: v.wall, at: [x, 0, z], into: '-y', bridge: v.x1c.bridge })
```

- A countersink from the side (`into` ±x or ±y) is a teardrop: its round parts get a 45° ridge on top.
- A nut pocket going up from the bed gets a 45° hexagonal roof to the hole; across a part, a flat top (a short bridge).
- An opening wider than the printer's `bridge` rises at 45° each side to a flat that wide.
- Cutters start a little outside the face they enter by, so no faces lie on each other.
