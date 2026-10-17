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
// projects/macropad/objects/pcb.js: four keys wired straight to a XIAO, and a Qwiic socket for a small display
export function main(v) {
  const { xiao, mx, qwiic } = v.pcb, p = v.mx.pitch;
  const keys = Array.from({ length: v.keys }, (_, i) => mx(`K${i + 1}`, (i - (v.keys - 1) / 2) * p, v.key_y, v.mx));
  return {
    center: { x: 0, y: 0 }, width: p * v.keys + v.margin * 2, height: v.height, thickness: v.thickness, track: v.track, autoroute: true,
    parts: [
      ...keys,                                                       // one MX switch per key, from the mx rules
      xiao('U1', 0, v.mcu_y, v.xiao),                                // pins labelled D0..D10, 3V3, GND, 5V from the xiao rules
      qwiic('J1', v.qwiic_x, v.mcu_y, v.qwiic, { rotation: v.qwiic_turn }) // turned to face the board's edge
    ],
    nets: { GND: ['U1.GND', 'J1.GND', ...keys.map((k) => `${k.name}.pin2`)], SDA: ['U1.D4', 'J1.SDA'], SCL: ['U1.D5', 'J1.SCL'],
      ...Object.fromEntries(keys.map((k, i) => [`KEY${i + 1}`, [`${k.name}.pin1`, `U1.D${i}`]])) },
    traces: [], silk: [], holes: []
  };
}
```

- **Parts:** `xiao`, `qwiic`, `jstph` and `header` take their sizes and pinouts from rule sets in @rulecad/rules (each
  value with its source); `part(name, footprint, x, y)` takes any footprinter name: `soic8`, `0603`, `sot23`,
  `jst4_sh`, `pinrow4` (SMD or through-hole). Options: `rotation` (0, 90, 180, 270), `layer`, `mpn`, `labels`.
- **Parts from KiCad:** `fromKicad(text)` turns a KiCad footprint (`.kicad_mod`) into pad data (y up) and its
  courtyard. Keep the result in a rule set's `"footprints"` with its source and pin names (`labels: { pin1: 'GND' }`),
  then place it with `footprint(name, data, x, y, o)`: a design reads rule sets, never files or the network.
- **Any board shape:** give `outline: [{ x, y }, ...]` in place of a centre and size. `shape.rounded(w, h, r)`,
  `shape.bevelled(w, h, b)`, `shape.circle(d)` and `shape.rect(w, h)` make common ones. The router keeps tracks
  inside the outline, and a check finds any pad outside it.
- **Copper of any shape:** a pad `{ pin, smd: true, x, y, points: [[x, y], ...] }` (x, y: where tracks join it), such
  as a ring from `shape.ring(r0, r1)` (a rotary contact, a touch pad). The router sees it as strips that follow its shape.
- **Nets:** each net's pins are joined by the shortest set of links between them, at `board.track` (or the net's own
  `{ pins, width }`); pins are named `part.pin` by label, name or number. The schematic labels them by net.
- **What a board tells the parts around it:** `board_x`, `board_y`, `board_w`, `board_d`, its mounting holes, where
  each part is (`parts(json)`: `{ U1: { x, y, w, h, layer, rotation } }`) and a shaped board's outline, so a case can
  read it (`"uses": ["macropad/pcb"]` in @rulecad/cad: bosses under its holes, openings over its USB socket and
  buttons) and a holes fit can check the screws find their inserts.
- **Routing:** connections no rule draws go to tscircuit's capacity autorouter. Its tracks come back as pieces of each
  net, named here by the pads they end on; where a piece ends on a one-sided pad from the other layer, a via is added
  clear of the pad; and the build fails if any pad is left without a track. Drawn tracks can name their `layer`.
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
