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
5.1.5), both ways. Overlap volume needs a CAD kernel's booleans, so it stays out of this package; with JSCAD it's
`measureVolume(intersect(a, b))`.
