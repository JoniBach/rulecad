# @rulecad/pcb

Circuit boards from rules, for `@rulecad/cad` designs with `"engine": "pcb"`. Footprints come from rule sets
(datasheets, KiCad's library) rather than numbers in code. The keyboard router draws every matrix track by rule, with
one diode per key on the back. The output is what a fab needs: Gerbers, drill files, a JLCPCB BOM and placement file,
and KiCad files.

**No framework.** The board is written directly as [Circuit JSON](https://github.com/tscircuit/circuit-json), an open
data format, and the work is done by tscircuit's framework-free libraries: footprints (footprinter), the autorouter,
the design checks, and the Gerber, KiCad and drawing exporters. React, which tscircuit's own board-building layer uses,
is never loaded. Two of those libraries list tscircuit among their dependencies, so React may be installed alongside
them, unused; rulecad's tests fail if it's ever loaded.

**Any board.** Place parts from rule sets or any standard footprint, turn them in quarter turns, join their pins with
nets, and let the autorouter draw the tracks:

```js
// projects/node/objects/carrier.js: a radio module, two Qwiic sensor sockets, a battery socket and its diode
export function main(v) {
  const { xiao, qwiic, jstph, part } = v.pcb;
  return {
    center: { x: 7.5, y: -2.2 }, width: 35.5, height: 25.4, thickness: v.thickness, track: v.track, autoroute: true,
    parts: [
      xiao('U1', 0, 0, v.xiao),                                  // pins labelled D0..D10, 3V3, GND, 5V from the xiao rules
      qwiic('J1', v.qwiic_x, v.qwiic_y, v.qwiic),                // plug in from the top edge
      qwiic('J2', v.j2_x, 0, v.qwiic, { rotation: v.j2_turn }),  // turned to face the right edge
      jstph('J3', v.qwiic_x, v.bat_y, v.jstph, { labels: { pin1: 'BAT', pin2: 'BATGND' } }),
      part('D1', 'sod123', v.qwiic_x, v.diode_y, { mpn: 'B5819W' })
    ],
    nets: { GND: ['U1.GND', 'J1.GND', 'J2.GND', 'J3.BATGND'], SDA: ['U1.D4', 'J1.SDA', 'J2.SDA'], /* ... */ },
    traces: [], silk: [], holes: []
  };
}
```

- **Parts:** `xiao`, `qwiic`, `jstph` and `header` take their sizes and pinouts from rule sets in @rulecad/rules (each
  value with its source); `part(name, footprint, x, y)` takes any footprinter name: `soic8`, `0603`, `sot23`,
  `jst4_sh`, `pinrow4` (SMD or through-hole). Options: `rotation` (0, 90, 180, 270), `layer`, `mpn`, `labels`.
- **Nets:** each net's pins are joined by the shortest set of links between them, at `board.track` (or the net's own
  `{ pins, width }`); pins are named `part.pin` by label, name or number. The schematic labels them by net.
- **Keyboards** are one recipe built on the same parts: every matrix track drawn by rule, one diode per key.

A keyboard:

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
