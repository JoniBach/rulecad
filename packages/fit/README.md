# @rulecad/fit

Do these parts fit? `closest()` measures the smallest gap between two meshes, in millimetres: a keycap's slot around
a switch stem, a board inside its case. A grid of cells keeps it fast enough to check every key of a keyboard. Only
dependency: `@rulecad/printcheck`'s `bounds`.

```js
import { closest } from '@rulecad/fit';

const gap = closest(capTriangles, stemTriangles);   // 0.05: a press fit? a slide fit? compare with your printer's rules
closest(a, b, 5);                                   // look up to 5 mm away (default 2); farther is Infinity
```

It measures from each mesh's corners to the other's faces, and from each mesh's edges to the other's edges (Ericson,
Real-Time Collision Detection 5.1.5 and 5.1.9), so the nearest two faces can be is found even where two edges pass
each other mid-span. Two solids that run into each other have no gap, however far their corners are from each other's
faces: `closest` is 0 for them, and `closestAt` says `overlap: true` and where (`overlapAt(a, b)` on its own). They run
into each other when an edge of one passes through a face of the other, a corner of one is inside the other, or a
point just inside a face of one is inside the other: the last finds solids that share face planes, such as two boxes
half into each other on one plane, or a part placed twice. Touching faces are not an overlap. How much they overlap
needs a CAD kernel's booleans, so that stays out of this package; with JSCAD it's `measureVolume(intersect(a, b))`.

Two smaller tools, for checks of your own (cad's assembly checks use both):

- `inside(point, faces)`: is a point inside a closed solid? True or false, by counting how many of its faces a straight
  line out from the point passes through: an odd number means inside.
- `distanceToFace(point, face)`: how far a point is from one face (a polygon), in mm, to its nearest point, inside it
  or on its edge.
