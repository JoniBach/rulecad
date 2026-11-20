// A 3 × 4 macropad to test the thin module on: twelve keys, each wired straight to a GPIO of its own (no matrix, no
// diodes), on a footprint that takes a Cherry MX or a Kailh Choc v1 switch. Two ways to carry the module:
//  - front: the module on top, beyond the keys, on long pads that take it either way: soldered flat by its castellated
//    edges, or on pin headers in sockets so it can move between boards. Below the keys, sockets for a display: an SPI
//    one in the module's own display order (GND VCC SCL SDA RES DC CS BLK: a 7-pin SSD1322 OLED or an 8-pin ST7789 LCD)
//    and an I2C one (GND VCC SCL SDA: the common SSD1306 OLEDs)
//  - rear: the module under the top row of keys, parts facing down, on pin headers through the gaps between the keys
//    (its end columns are three key widths apart for this). The board is no bigger than the keys and the module
// The module's pins come from rules/thin_picro_pins.json (read from the module's KiCad board), so this board needs no
// build of the module. Every connection is autorouted on two layers
export function main (v) {
  const P = v.mx.pitch, mod = v.thin_picro_pins, pins = mod.footprints.module.pins, rear = v.mount === 'rear'
  const L = mod.length, H = mod.height, hole = mod.header_hole, ring = mod.header_pad_h // a header hole and its round pad here
  const keyTop = P / 2, keyBottom = -(v.rows - 1) * P - P / 2, keyLeft = -v.cols * P / 2, keyRight = v.cols * P / 2

  // ---- the module ----
  // rear: seen from above, the module is upside down (parts facing down), so mirrored left to right; its bottom row of
  // header holes lies along the gap between the top two rows of keys. front: beyond the top row, module_gap clear of it
  const flip = rear ? -1 : 1
  const holeRow = pins.find((p) => p.side === 'bottom').hole.y // the bottom row's holes, from the module's centre
  const mc = { x: 0, y: rear ? -P / 2 - holeRow : keyTop + v.module_gap + H / 2 }
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
    const w = nx ? len : ring, ht = nx ? ring : len
    return { pin: `pin${p.pin}`, x: c.x - mc.x, y: c.y - mc.y, hole, outer: ring, rect: { w, h: ht, offset: [h.x - c.x, h.y - c.y] } }
  })
  const pinOf = (signal) => pins.filter((p) => p.signal === signal)
  const U1 = { name: 'U1', ftype: 'simple_chip', mpn: 'thin RP2040 module', package: `thin RP2040 module, ${rear ? 'on pin headers under the board' : 'castellated or on pin headers'}`,
    x: mc.x, y: mc.y, layer: 'top', bom: false, place: false, pads: modulePads, courtyard: null,
    sch: { x: 0, y: 0, pinLabels: Object.fromEntries(pins.map((p) => [`pin${p.pin}`, p.signal])) } }

  // ---- the keys ----
  const keys = []
  for (let r = 0; r < v.rows; r++) for (let c = 0; c < v.cols; c++) keys.push({ n: r * v.cols + c + 1, r, c, x: keyLeft + c * P + P / 2, y: -r * P })
  const parts = [U1, ...keys.map((k) => ({ ...v.pcb.hybridSwitch(`K${k.n}`, k.x, k.y, v.mx, v.choc, { x: (k.c + v.cols) * v.sch_grid, y: -k.r * v.sch_grid }), bom: false, place: false }))]

  // Each key takes a GPIO along the module's bottom row: the twelve listed in key_gpio, given out left to right as the
  // pins lie on this board, down each column in turn (so neighbouring keys have neighbouring pins and no tracks cross)
  const gpio = String(v.key_gpio).split(/[ ,]+/).filter(Boolean).map((g) => `GP${g}`)
  if (gpio.length !== keys.length) throw new Error(`key_gpio lists ${gpio.length} GPIO for ${keys.length} keys`)
  const byX = gpio.map((g) => { const p = pinOf(g)[0]; if (!p) throw new Error(`the module has no ${g} pin`); return { g, p, x: at(p.hole).x } }).sort((a, b) => a.x - b.x)
  const order = [...keys].sort((a, b) => a.c - b.c || a.r - b.r)
  const nets = {}, matrix = { keys: [], direct: {} }
  order.forEach((k, i) => {
    const { g, p } = byX[i]
    nets[g] = [`U1.pin${p.pin}`, `K${k.n}.pin1`]
    matrix.keys.push({ key: `K${k.n}`, row: k.r, col: k.c, gpio: g }); matrix.direct[`K${k.n}`] = g
  })
  // Ground: every key's other pin, and the module's GND pins along its bottom row (on the rear board the ends' GND pins
  // are joined to these inside the module already)
  const gnds = pinOf('GND').filter((p) => !rear || p.side === 'bottom')
  nets.GND = [...gnds.map((p) => `U1.pin${p.pin}`), ...keys.map((k) => `K${k.n}.pin2`)]

  // ---- the displays' sockets (front) ----
  const silk = [], text = v.jlcpcb.silk_text, line = v.jlcpcb.silk_line
  const sockets = { pitch: mod.pitch, drill: hole, pad: ring }
  let bottom = keyBottom
  if (!rear) {
    const y = keyBottom - v.strip / 2, spi = ['GND', '3V3', `GP${v.display_scl}`, `GP${v.display_sda}`, `GP${v.display_res}`, `GP${v.display_dc}`, `GP${v.display_cs}`, `GP${v.display_blk}`]
    const i2c = ['GND', '3V3', `GP${v.i2c_scl}`, `GP${v.i2c_sda}`]
    const spiLabels = ['GND', 'VCC', 'SCL', 'SDA', 'RES', 'DC', 'CS', 'BLK'], i2cLabels = ['GND', 'VCC', 'SCL', 'SDA']
    const spiX = keyLeft + (spi.length - 1) * mod.pitch / 2 + v.socket_in, i2cX = keyRight - (i2c.length - 1) * mod.pitch / 2 - v.socket_in
    parts.push(v.pcb.header('J1', spiX, y, sockets, { pins: spi.length, rotation: v.socket_turn, mpn: `1 × ${spi.length} female header, ${mod.pitch} mm`, bom: false, place: false, sch: { x: -v.cols * v.sch_grid, y: -v.sch_grid } }),
      v.pcb.header('J2', i2cX, y, sockets, { pins: i2c.length, rotation: v.socket_turn, mpn: `1 × ${i2c.length} female header, ${mod.pitch} mm`, bom: false, place: false, sch: { x: -v.cols * v.sch_grid, y: -v.rows * v.sch_grid } }))
    // each socket pin joins the module's pin of that signal (GND and 3V3: the nets already holding the module's)
    nets['3V3'] = [`U1.pin${pinOf('3V3').find((p) => p.side === 'right').pin}`]
    const join = (part, list) => list.forEach((s, i) => { (nets[s] ||= [`U1.pin${pinOf(s)[0].pin}`]).push(`${part}.pin${i + 1}`) })
    join('J1', spi); join('J2', i2c)
    const label = (x0, labels, name) => {
      // each pin's name above it, running up the board (at the fab's least height, a name is wider than a pin's pitch)
      labels.forEach((t, i) => silk.push({ text: t, x: x0 + (i - (labels.length - 1) / 2) * mod.pitch, y: y + ring / 2 + v.label_gap + t.length * text * v.label_char / 2, size: text, layer: 'top', rotation: v.socket_turn }))
      silk.push({ text: name, x: x0, y: y - ring / 2 - v.label_gap - text / 2, size: text, layer: 'top' })
    }
    label(spiX, spiLabels, 'SPI display'); label(i2cX, i2cLabels, 'I2C display')
    bottom = keyBottom - v.strip
  }

  // ---- the board ----
  // rear: exactly the keys and the module (the module's top edge, with USB-C, is the board's). front: the module's pads,
  // the keys and the sockets, margin beyond them, and an M2 hole in each corner
  const halfW = rear ? Math.max(L / 2, keyRight) : Math.max(L / 2 + v.castle_out, keyRight) + v.margin
  const top = mc.y + H / 2, lo = bottom - (rear ? 0 : v.margin)
  const outline = [[-halfW, lo], [halfW, lo], [halfW, top], [-halfW, top]].map(([x, y]) => ({ x, y }))
  const holes = rear ? [] : [[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sy]) => v.pcb.mount('M2', sx * (halfW - v.margin / 2), sy > 0 ? top - v.margin / 2 : lo + v.margin / 2))

  // Silkscreen: each switch's outline; where the module goes (on the side it's fitted), its USB-C end marked
  const rect = (x, y, w, h, layer) => ({ rect: { x, y, w, h }, layer })
  const box = (x, y, w, h, layer = 'top') => [rect(x, y + h / 2, w, line, layer), rect(x, y - h / 2, w, line, layer), rect(x - w / 2, y, line, h, layer), rect(x + w / 2, y, line, h, layer)]
  const body = Math.max(v.mx.pcb_body, v.choc.pcb_body)
  for (const k of keys) silk.push(...box(k.x, k.y, body, body))
  const side = rear ? 'bottom' : 'top'
  if (!rear) silk.push(...box(mc.x, mc.y, L, H, side))
  // (rear: the note on the back, in the gap between the bottom two rows of keys, clear of every pad)
  silk.push({ text: rear ? 'module behind the top row: parts facing down, USB-C to the top edge' : 'module: castellated or on headers, USB-C to this edge', x: mc.x, y: rear ? keyBottom + P : mc.y, size: text, layer: side })

  return {
    board: { outline, thickness: v.thickness, autoroute: true, track: v.track, clearance: v.clearance, smooth: true, finish: true, layers: 2,
      silk_line: line, silk_text: text, via_hole: v.via_hole, via_pad: v.via_hole + 2 * v.jlcpcb.annular, fab: v.jlcpcb, // (vias with the ring the fab recommends)
      parts, nets, silk, holes },
    matrix,
  }
}
