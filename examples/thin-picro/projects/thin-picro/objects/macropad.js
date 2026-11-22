// A 3 × 4 macropad to test the thin module on: a through-hole build. Twelve keys on a footprint that takes a Cherry MX or
// a Kailh Choc v1 switch, soldered, in a 4-row × 3-column matrix with a 1N4148 (DO-35) diode per key, each lying in a
// gap between two columns of switches, on the front. Two ways to carry the module:
//  - front: the module on top at the board's top edge (its USB-C over the edge), beyond the keys, on long pads that
//    take it soldered flat by its castellated edges. An SPI display (GND VCC SCL SDA RES DC CS BLK: a 2.0 in ST7789)
//    plugs into the module's own display column (a socket in its header holes) and lies over it; the module sits far
//    enough from the keys that the display clears the top row's keycaps. A socket at the module's left end for an I2C
//    display (GND VCC SCL SDA)
//  - rear: the module under the top row of keys, parts facing down, on pin headers through the gaps between the keys
//    (its end columns are three key widths apart for this). The board is no bigger than the keys and the module
// The module's pins come from rules/thin_picro_pins.json (read from the module's KiCad board), so this board needs no
// build of the module. Every connection is autorouted on two layers, and finished (square exits, no acute corners).
// Where the parts an assembly mounts on it go (the module, the display's socket, the keys) is in matrix.place
export function main (v) {
  const P = v.mx.pitch, mod = v.thin_picro_pins, pins = mod.footprints.module.pins, rear = v.mount === 'rear', d35 = v.do35
  const L = mod.length, H = mod.height, hole = mod.header_hole, ring = mod.header_pad_h // a header hole and its round pad here
  const keyTop = P / 2, keyBottom = -(v.rows - 1) * P - P / 2, keyLeft = -v.cols * P / 2, keyRight = v.cols * P / 2
  const text = v.jlcpcb.silk_text, line = v.jlcpcb.silk_line, silk = []

  // ---- the module ----
  // rear: seen from above, the module is upside down (parts facing down), so mirrored left to right; its bottom row of
  // header holes lies along the gap between the top two rows of keys. front: beyond the top row, module_gap clear of it
  const flip = rear ? -1 : 1
  const holeRow = pins.find((p) => p.side === 'bottom').hole.y // the bottom row's holes, from the module's centre
  // front: the module at the board's top edge, its USB-C over the edge. A display plugs into its own display column (a
  // socket in its header holes) and lies over it, hanging below it by half its height less the column's: the module
  // sits far enough from the keys that the display's edge clears the top row's keycaps by display_clear (and never less
  // than module_gap from the keys' square)
  const column = pins.filter((p) => p.side === 'right').map((p) => p.hole.y), columnY = column.reduce((n, y) => n + y, 0) / column.length
  const capEdge = keyTop - (P - v.mx.cap_base) / 2 // the top row's keycaps' back edge
  const mc = { x: 0, y: rear ? -P / 2 - holeRow : Math.max(keyTop + v.module_gap + H / 2, capEdge + v.display_clear + v.st7789_2in.height / 2 - columnY) }
  const at = (q) => ({ x: mc.x + flip * q.x, y: mc.y + q.y })
  const out = { left: [-1, 0], right: [1, 0], bottom: [0, -1] } // each side's outward direction, on the module
  const modulePads = pins.map((p) => {
    const h = at(p.hole), [nx, ny] = out[p.side], n = [flip * nx, ny]
    if (rear) return { pin: `pin${p.pin}`, x: h.x - mc.x, y: h.y - mc.y, hole, outer: ring } // header pins only
    // front: one long pad per pin, from just inside the header hole out past the module's edge, so the castellated half
    // hole can be soldered to it (the fillet on the part beyond the edge), or a header pin to its hole
    const edge = p.side === 'bottom' ? -H / 2 : (p.side === 'left' ? -L / 2 : L / 2) // the module's edge, along n
    const along = (q) => q.x * nx + q.y * ny // a point's distance along n, in the module's frame
    const inner = along(p.hole) - ring / 2, outer = Math.abs(edge) + v.castle_out, len = outer - inner, mid = (inner + outer) / 2
    const c = { x: mc.x + n[0] * mid + (ny ? p.hole.x : 0) * flip, y: mc.y + n[1] * mid + (nx ? p.hole.y : 0) }
    return { pin: `pin${p.pin}`, x: c.x - mc.x, y: c.y - mc.y, hole, outer: ring, rect: { w: nx ? len : ring, h: nx ? ring : len, offset: [h.x - c.x, h.y - c.y] } }
  })
  const pinOf = (signal) => pins.filter((p) => p.signal === signal)
  const parts = [{ name: 'U1', ftype: 'simple_chip', mpn: 'thin RP2040 module', package: `thin RP2040 module, ${rear ? 'on pin headers under the board' : 'castellated or on pin headers'}`,
    x: mc.x, y: mc.y, layer: 'top', bom: false, place: false, pads: modulePads, courtyard: null,
    sch: { x: 0, y: 0, pinLabels: Object.fromEntries(pins.map((p) => [`pin${p.pin}`, p.signal])) } }]

  // ---- the keys and their diodes ----
  const keys = []
  for (let r = 0; r < v.rows; r++) for (let c = 0; c < v.cols; c++) keys.push({ n: r * v.cols + c + 1, r, c, x: keyLeft + c * P + P / 2, y: -r * P })
  // Each diode lies in a gap between two columns of switches (or beyond the outer columns), along it, its cathode down:
  // the gap to its key's left where it's free. The rear board's top row has the module's end columns of pins where its
  // outer gaps would be, so a key there takes the nearest free gap, in the row below if need be
  const spots = []
  for (let r = 0; r < v.rows; r++) for (let g = 0; g <= v.cols; g++) {
    const blocked = rear && r === 0 && (g === 0 || g === v.cols)
    if (!blocked) spots.push({ x: keyLeft + g * P, y: -r * P, taken: false })
  }
  const pairs = keys.flatMap((k) => spots.map((s) => ({ k, s, d: Math.hypot(s.x - (k.x - P / 2), s.y - k.y) }))).sort((a, b) => a.d - b.d)
  const diodeAt = new Map()
  for (const { k, s } of pairs) if (!diodeAt.has(k.n) && !s.taken) { diodeAt.set(k.n, s); s.taken = true }
  if (diodeAt.size !== keys.length) throw new Error(`${keys.length} keys, room for ${diodeAt.size} diodes`)
  for (const k of keys) {
    const s = diodeAt.get(k.n)
    parts.push({ ...v.pcb.hybridSwitch(`K${k.n}`, k.x, k.y, v.mx, v.choc, { x: (k.c + v.cols) * v.sch_grid, y: -k.r * v.sch_grid }), bom: false, place: false },
      v.pcb.do35(`D${k.n}`, s.x, s.y, d35, { rotation: v.diode_turn, thickness: v.thickness, sch: { x: (k.c + v.cols) * v.sch_grid + v.sch_grid / 2, y: -k.r * v.sch_grid } }))
    // the cathode's band on the silkscreen, beside the body's cathode end (turned with the diode: down)
    silk.push({ rect: { x: s.x, y: s.y - d35.body_length / 2 + line * 2, w: d35.body_d + line * 2, h: line * 2 }, layer: 'top' })
  }

  // ---- the matrix: columns to switch pin 1, each switch's pin 2 through its diode to its row ----
  const gp = (list) => String(list).split(/[ ,]+/).filter(Boolean).map((g) => `GP${g}`)
  const rowGpio = gp(v.row_gpio), colGpio = gp(v.col_gpio)
  if (rowGpio.length !== v.rows || colGpio.length !== v.cols) throw new Error(`row_gpio lists ${rowGpio.length} GPIO for ${v.rows} rows, col_gpio ${colGpio.length} for ${v.cols} columns`)
  const nets = {}, modulePin = (g) => { const p = pinOf(g)[0]; if (!p) throw new Error(`the module has no ${g} pin`); return `U1.pin${p.pin}` }
  for (let r = 0; r < v.rows; r++) nets[`ROW${r}`] = [modulePin(rowGpio[r]), ...keys.filter((k) => k.r === r).map((k) => `D${k.n}.cathode`)]
  for (let c = 0; c < v.cols; c++) nets[`COL${c}`] = [modulePin(colGpio[c]), ...keys.filter((k) => k.c === c).map((k) => `K${k.n}.pin1`)]
  for (const k of keys) nets[`K${k.n}_D`] = [`K${k.n}.pin2`, `D${k.n}.anode`]
  const matrix = { keys: keys.map((k) => ({ key: `K${k.n}`, row: k.r, col: k.c })), rows: Object.fromEntries(rowGpio.map((g, r) => [r, g])), cols: Object.fromEntries(colGpio.map((g, c) => [c, g])) }

  // ---- the I2C display's socket (front), at the module's left end; the SPI display plugs into the module itself ----
  const sockets = { pitch: mod.pitch, drill: hole, pad: ring }
  const place = { module_x: mc.x, module_y: mc.y, key_x0: keyLeft + P / 2, key_y0: 0, flip }
  let xs = [-L / 2, L / 2]
  if (!rear) {
    const right = pins.filter((p) => p.side === 'right')
    nets.GND = pinOf('GND').map((p) => `U1.pin${p.pin}`) // (all of them: joined inside the module anyway, and no pad left off a net for a track to pass over)
    nets['3V3'] = [`U1.pin${pinOf('3V3').find((p) => p.side === 'left').pin}`]
    const i2c = ['GND', '3V3', `GP${v.i2c_scl}`, `GP${v.i2c_sda}`]
    const ix = -(L / 2 + v.castle_out + v.socket_gap), iy = mc.y
    const strip = (n, height) => v.pcb.stripModel(n, { pitch: mod.pitch, height, thickness: v.thickness })
    // header(): pin 1 at the top of the column; turned half round, pin 1 (GND) at the bottom
    parts.push({ ...v.pcb.header('J2', ix, iy, sockets, { pins: i2c.length, rotation: v.socket_turn, mpn: `1 × ${i2c.length} female header, ${mod.pitch} mm`, model: strip(i2c.length, v.socket_height), sch: { x: -v.cols * v.sch_grid, y: -v.rows * v.sch_grid } }), bom: false, place: false })
    i2c.forEach((sig, i) => { (nets[sig] ||= [`U1.pin${pinOf(sig)[0].pin}`]).push(`J2.pin${i + 1}`) })
    // each pin's name on the back, beside the socket
    const labels = ['GND', 'VCC', 'SCL', 'SDA']
    labels.forEach((t, i) => silk.push({ text: t, x: ix + ring / 2 + v.label_gap + t.length * text * v.label_char / 2, y: iy + (i - (labels.length - 1) / 2) * mod.pitch, size: text, layer: 'bottom' }))
    xs = [ix - ring / 2 - v.edge_keep, L / 2]
    // where the SPI display's socket goes: in the module's own display column (its right end), for the assembly
    Object.assign(place, { spi_x: mc.x + flip * right[0].hole.x, spi_y: mc.y + columnY, i2c_x: ix, i2c_y: iy, usb_x: mc.x + v.usb_x, usb_y: mc.y + H / 2 + v.usb_out })
  }

  // ---- the board ----
  // rear: exactly the keys and the module (the module's top edge, with USB-C, is the board's). front: the module's
  // pads, the keys, the diodes and the sockets, edge_keep beyond them, reaching up under the
  // whole display. M2 holes where four keys meet, in the lower rows (clear of the module and the diodes)
  const halfW = rear ? Math.max(L / 2, keyRight) : Math.max(L / 2 + v.castle_out, keyRight + d35.pad / 2) + v.edge_keep
  const left = rear ? -halfW : Math.min(-halfW, xs[0]), right = rear ? halfW : Math.max(halfW, xs[1])
  const top = mc.y + H / 2, bottom = keyBottom
  const outline = [[left, bottom], [right, bottom], [right, top], [left, top]].map(([x, y]) => ({ x, y }))
  const holes = String(v.mount_rows).split(/[ ,]+/).map(Number).flatMap((r) => [-1, 1].map((sx) => v.pcb.mount('M2', sx * P / 2, -r * P - P / 2)))

  // Silkscreen: each switch's outline; where the module goes (on the side it's fitted)
  const rect = (x, y, w, h, layer) => ({ rect: { x, y, w, h }, layer })
  const box = (x, y, w, h, layer = 'top') => [rect(x, y + h / 2, w, line, layer), rect(x, y - h / 2, w, line, layer), rect(x - w / 2, y, line, h, layer), rect(x + w / 2, y, line, h, layer)]
  const body = Math.max(v.mx.pcb_body, v.choc.pcb_body)
  for (const k of keys) silk.push(...box(k.x, k.y, body, body))
  silk.push({ text: rear ? 'module: parts down, USB up' : 'module: castellated or on headers', x: mc.x, y: rear ? keyBottom + P : mc.y, size: text, layer: rear ? 'bottom' : 'top' })
  matrix.place = place

  return {
    board: { outline, thickness: v.thickness, autoroute: true, track: v.track, clearance: v.clearance, smooth: true, finish: v.finish !== 0, layers: 2,
      silk_line: line, silk_text: text, via_hole: v.via_hole, via_pad: v.via_hole + 2 * v.jlcpcb.annular, fab: v.jlcpcb, // (vias with the ring the fab recommends)
      parts, nets, silk, holes },
    matrix,
  }
}
