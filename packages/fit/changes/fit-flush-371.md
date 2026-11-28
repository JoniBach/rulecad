---
title: overlaps between solids that share face planes are found
bump: patch
---
### Fixed

- `overlapAt` and `closestAt` missed solids that run into each other while sharing face planes: two boxes side by side on one plane, half into each other; a part placed twice; a bar flush with the top and bottom of a block. Their edges lie in each other's faces and their corners on each other's surface, so neither of the old tests fired and they read as merely touching. A third test now looks at a point just inside each face of one solid (a thousandth of a millimetre in, or less on small faces) and asks whether it is inside the other. Faces that only touch are still not an overlap. If you upgrade, pairs like these now say `overlap: true`; `overlapAt` takes a little longer on pairs that touch. No printed size changes.
- The README now says what the gap measures (corners to faces and edges to edges) and describes `inside` and `distanceToFace`.
