---
title: the stress at a part's surface, and a warning where the grid is too coarse to read it
bump: minor
---
### Added

- `analyse()` returns `surface`: each solid cell's von Mises stress at the part's surface, beside `stress`. `stress` is read at each cell's centre, half a cell inside the part, so where the part bends it reads the peak stress low by about one cell's share of the member's depth: 27 to 30% low at the four cells through that the README recommends, 10% at ten. `surface` comes within 2% of beam theory from four cells through, in 2D and 3D. Read a part's strength from `surface`.
- `surfaceStress(g, u, modulus, nu, density)` gives the same reading for any solution, with each node's value as well as each cell's.
- `analyse()` returns `findings`: a warning (`fea.coarse-stress`, in the kit's shape `{ level, text, code, values, at, box }`) for each load whose peak stress is in a member under eight cells through, where even the surface reading can be a few percent out.
- The README's grid-fineness table now says how far each stress reading is out at each number of cells through the depth.

### Changed

- The package's tests compare a cantilever's tip with beam theory including shear (Timoshenko's), and no longer check a field (`converged`) that `solve` never returned.

Upgrading: nothing changes for existing results. `stress`, `u`, `compliance` and `deflection` keep their values; `surface` and `findings` are new. A check that judges strength from `stress` reads low: move it to `surface` (the kit's own checks move in the next release). No printed size changes.
