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
