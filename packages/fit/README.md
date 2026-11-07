# @rulecad/fit

Do these parts fit? `closest()` measures the smallest gap between two meshes, in millimetres: a keycap's slot around
a switch stem, a board inside its case. A grid of cells keeps it fast enough to check every key of a keyboard. Only
dependency: `@rulecad/printcheck`'s `bounds`.

```js
import { closest } from '@rulecad/fit';

const gap = closest(capTriangles, stemTriangles);   // 0.05: a press fit? a slide fit? compare with your printer's rules
closest(a, b, 5);                                   // look up to 5 mm away (default 2); farther is Infinity
```

It measures from each mesh's corners and edge midpoints to the other's faces (Ericson, Real-Time Collision Detection
5.1.5), both ways. Two solids that run into each other have no gap, however far their corners are from each other's
faces: `closest` is 0 for them, and `closestAt` says `overlap: true` and where (an edge of one through a face of the
other, or a corner of one inside the other; `overlapAt(a, b)` on its own). Touching faces are not an overlap. How
much they overlap needs a CAD kernel's booleans, so that stays out of this package; with JSCAD it's
`measureVolume(intersect(a, b))`.
