# @rulecad/pcb

Keyboard circuit boards from rules, for `@rulecad/cad` designs with `"engine": "pcb"`. Footprints come from rule sets
(datasheets, KiCad's library) rather than numbers in code. The keyboard router draws every matrix track by rule, with
one diode per key on the back. The output is what a fab needs: Gerbers, drill files, a JLCPCB BOM and placement file,
and KiCad files.

**No framework.** The board is written directly as [Circuit JSON](https://github.com/tscircuit/circuit-json), an open
data format, and the work is done by tscircuit's framework-free libraries: footprints (footprinter), the autorouter,
the design checks, and the Gerber, KiCad and drawing exporters. React, which tscircuit's own board-building layer uses,
is never loaded. Two of those libraries list tscircuit among their dependencies, so React may be installed alongside
them, unused; rulecad's tests fail if it's ever loaded.

```js
// projects/macropad/objects/board.js: main(v) returns a board, built with v.pcb
export function main(v) {
  const keys = v.pcb.grid(v.rows, v.cols, v.mx.pitch);
  return v.pcb.keyboard(v, keys);              // { board, matrix }
}
```

```sh
npm install @rulecad/pcb
npx cad check macropad/board      # tscircuit's checks, JLCPCB's limits, the matrix
npx cad preview macropad/board    # copper from above, the schematic, and the board in 3D
npx cad export macropad/board     # <name>-fab.zip for JLCPCB, KiCad files, the matrix for your firmware
```

- The board is also a solid, so it takes part in fit checks: switches on the board, plate over it, board in the case.
- A Pico under the board has its connections autorouted (that needs Node 22 or newer; boards drawn wholly by rule build on
  Node 20 too). That takes minutes; then the build cache keeps it.
  Everything else is drawn by rule.
- The autorouter and footprint versions are pinned, so a board builds the same until rulecad moves them on; each move is
  checked against boards built before it (same tracks, same checks, same fab files). Nothing to add to your
  package.json.
- Ordering is your click: `cad export` makes the fab zip and never places an order.
