# @rulecad/pcb

Keyboard circuit boards from rules, for `@rulecad/cad` designs with `"engine": "pcb"`. Footprints come from rule sets
(datasheets, KiCad's library) rather than numbers in code. The keyboard router draws every matrix track by rule, with
one diode per key on the back. The output is what a fab needs: Gerbers, drill files, a JLCPCB BOM and placement file,
and KiCad files. Built on [tscircuit](https://github.com/tscircuit/tscircuit).

```js
// projects/macropad/objects/board.js: main(v) returns a tscircuit board, built with v.pcb
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
- A Pico under the board has its connections autorouted (that takes minutes, then the build cache keeps it).
  Everything else is drawn by rule.
- tscircuit is pinned (0.0.2885). Until its next release, add `"overrides": { "@tscircuit/math-utils": "0.0.36" }` to
  your package.json.
- Ordering is your click: `cad export` makes the fab zip and never places an order.
