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
- **Whole boards from KiCad (clones):** `fromKicadPcb(text)` reads a published board (`.kicad_pcb`, KiCad 6 or later)
  as a circuit: its parts (each with its pads, value and LCSC number, where the source put it), its nets, the nets it
  fills as planes, its outline and holes. `cad clone` keeps it in a rule set's `"circuit"` with its source and licence.
  `clone(v.<set>.circuit)` gives a board's `parts` and `nets` from it, and `notes` on what boards here can't carry
  yet (castellated pads, oval pads, holes set off-centre in a pad, more than 2 layers: plane nets are left out of the
  routing). `sameCircuit(json, circuit)` checks that a board joins exactly the pins the source joins, and names any
  that differ: the layout can change, the circuit can't.
- **Placement learnt from the source:** `learnPlacement(circuit)` keeps each small part (a capacitor, a resistor, an
  LED) near the pin it serves on a bigger part, as the source has it: a decoupling capacitor by its power pin, a
  crystal's capacitor by the crystal. It goes by the part's most particular net (the one joining the fewest pins), so
  GND doesn't decide. `cad clone` keeps these rules in `circuit.placement`, where `max` (mm) can be edited.
  `arrange(circuit, { U3: { x, y, rotation } })` moves parts, and their small parts move and turn with them;
  `placementChecks(circuit)` names any small part out of reach of its pin.
- **Reshaping a clone:** `moveGroup(circuit, refs, { turn, dx, dy })` moves a block of parts as one, keeping the
  source's proven layout of an area (a chip and all its small parts) while the board around it changes. With
  `{ keep: true }` the source's own tracks and vias come too, wherever they join only that block's pads, and only the
  connections leaving the block are routed: dense areas round a fine-pitch chip keep their proven routing, and the
  router has far less to do. A track from one of the block's pins out to a part elsewhere keeps its stretch inside the
  block (a chip's escape), and is routed on from where it leaves.
  `withFootprint(circuit, 'J2', pads)` puts a part on new pads with the same pins, so its nets can't change: new edge
  pins for a new board shape. A design returns `{ board, clone: { circuit, arranged } }`, and `cad check` then also
  checks the circuit is the source's and every small part is still by its pin.
- **As the source has it:** on a clone, a pad as close to the board's edge as the source has it (a mid-mount USB-C
  socket in its notch), or a part that reaches past the outline there too, is said in the checks rather than failed.
  The same thing new to your layout fails as usual.
- **4 layers and planes:** `layers: 4` (or 6) puts tracks on the outer layers and `planes: { GND: { layer: 'inner1',
  pins } }` fills inner layers with plane nets. Before routing, each SMD pad of a plane net gets a via beside it (or
  a short track to one nearby; a pad with its pin's own plated hole in it, such as a chip's centre pad with thermal
  vias, needs none; a pad with no room is routed to the nearest pad of its net that reaches the plane). A plane net's pads
  are tied only to their own links when routing, not to every pad of the net (they're joined by the plane). The planes are
  poured with tscircuit's copper pour solver, clear of other nets' holes and vias, with thermal spokes; the checks
  confirm every plane pad reaches its copper, and the inner layers get their own Gerbers (`.G1`, `.G2`). `clone()`
  gives a 4-layer source's plane nets their planes, with the source's via size and clearance.
- **Routing to a clearance:** `clearance` (mm) is the gap the autorouter keeps from everything in its way (a clone:
  the source's own). After routing, any connection in a design-rule error is pulled up and routed again with every good
  track fixed in place, a minute per try. Then, with `neck` (mm, the fab's smallest track), a track still a little too
  close to another is straightened where the router doubled back, or narrowed where they pass. Existing vias reach the
  router at their real size.
- **Labels clear of copper:** `clearLabels(silk, circuit)` slides each silkscreen label across its reading direction to
  the nearest place clear of every pad and of the labels before it (the fab trims silkscreen off copper, so a label
  on a pad loses letters). Silkscreen text takes a `rotation`.
- **Schematics without a layout:** parts with no place on the schematic (a clone's) are laid out in rows, biggest
  first, each pin drawn once and labelled with its net, in place of wires across the sheet. After routing, silkscreen
  labels the router's vias landed on slide clear too.
- **Off the BOM and placement files:** a part with `bom: false` (edge pads, test points) isn't in the BOM, and one with
  `place: false` isn't in the placement file. `fromKicadPcb` reads both from KiCad's footprint attributes.
- **Parts in 3D:** `fromKicadPcb` keeps each part's 3D model (its path, offset, scale, turn), and `cad clone` fetches
  them into the workspace's `models/`: KiCad's library models as meshes (`wrlMesh` reads its VRML), and a model
  whose shape can't be shared (no licence), or comes only as STEP, as a box its size (`stepBounds`). The board's
  build then has a `components` part beside `board`, each model where its part is (`partModels`), so fit checks
  see the real parts. `--no-models` skips them.
- **Pad shapes:** round SMD pads stay round, and rounded pads keep their corner radius, so clearances are measured to
  the real copper.
- **Castellated and oval pads:** a pad `{ castellated: true }` is a half hole on the board's edge (tracks join it on
  its inner side, mid-way across its copper ring), checked against JLCPCB's rules for castellated holes instead of the edge clearance. A pad
  `{ rect: { w, h, offset } }` is an oval (a rounded rectangle) round its hole, which can sit off-centre.
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
  clear of the pad; a track may change layer inside a plated hole or a via, whose copper already joins the layers; and the build fails if any pad is left without a track. Drawn tracks can name their `layer`.
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
  package.json. tscircuit itself is pinned too: the Gerber writer lists it as a peer, so npm would otherwise install
  the newest, and since its 0.0.3032 that has pulled in an old circuit-json that the design checks can't load
  (tscircuit/circuit-json-to-gerber#200).
- Ordering is your click: `cad export` makes the fab zip and never places an order.
