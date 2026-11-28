---
title: a link with long open edges no longer freezes the STL and 3MF writers
bump: patch
---
### Fixed

- Before writing an STL or 3MF, `stl()`, `threemf()` and `mesh()` look along each open edge for loose corners to mend it at. They searched every millimetre cell of the edge's box, so the work grew with the cube of a slanted edge's length: a link of 46 characters holding one open triangle 400 mm across took about 10 seconds to write, and one a metre across took minutes, locking the viewer's tab (a link ending `&get=stl` starts the download as the page opens). A long slanted edge now looks only in the cells its line passes through, so the work grows with its length: the 400 mm triangle writes in a few milliseconds. The searches also share a work budget sized from the mesh; past it, an edge looks at each loose corner in turn, so even a mesh made to be slow is mended in bounded time.
- Nothing to do when upgrading: every part mends to exactly the same triangles as before (checked on all 1,021 parts of the 64 models in the public archive). No printed size changes.
