// A long, thin RP2040 module for keyboards: Sea-Picro's circuit (rules/sea_picro.json, read from its KiCad board by
// cad clone; CERN-OHL-S, so this board is too), redrawn with castellated pins along the bottom edge and up both ends
// and USB-C on the top edge. Its core keeps Sea-Picro's own proven layout and routing (its tracks and vias), turned on
// its side, so only the connections out of it are routed; the pins are new, with
// Sea-Picro's numbers and pad shapes; the USB-C socket brings its fuse and CC resistors. The checks prove the circuit is
// still Sea-Picro's and every small part still sits by the pin it serves.
export function main (v) {
  const { clone, arrange, moveGroup, withFootprint, addPins } = v.pcb, src = v.sea_picro.circuit
  const left = -v.length / 2, right = v.length / 2, bottom = -v.height / 2, top = v.height / 2

  // The edge pins, Sea-Picro's numbers in its order round the board: down the left end, along the bottom, up the right
  const j2 = src.parts.find((p) => p.ref === 'J2'), srcLeft = Math.min(...src.outline.map((p) => p.x))
  const half = j2.pads.find((q) => q.pin === '1' && q.castellated), header = j2.pads.find((q) => q.pin === '1' && !q.castellated)
  const out = srcLeft - (j2.x + half.x) // the half hole's centre beyond the edge, as on Sea-Picro
  const chip = src.parts.find((p) => /RP2040/i.test(`${p.footprint} ${p.value}`)), padOf = (gpio) => Object.entries(v.rp2040.pinMaps.gpio).find(([, g]) => g === `GPIO${gpio}`)[0]
  const gp = (t) => Number(t.slice(2)), run = (a, b) => Array.from({ length: gp(b) - gp(a) + 1 }, (_, i) => `GP${gp(a) + i}`) // 'GP12'; 'GP0' to 'GP10'
  // One pin more than Sea-Picro's, a second 3V3; with row_gnd, a GND at each end of the bottom row too (into the GND
  // plane, so nothing to route). With open_pins, five more: reset and boot (on test points on the module's underside,
  // out of reach under a keyboard's board) and GPIO10, 11 and 24 (unconnected on Sea-Picro). They
  // start inside Sea-Picro's kept routing round the RP2040, where the autorouter finds no way out for them, so their
  // pins are left unjoined, for tracks drawn by hand. The checks name every added pin
  const extras = [{ pin: '35', net: '+3V3' }, ...(v.row_gnd ? [{ pin: '39', net: 'GND' }, { pin: '40', net: 'GND' }] : []), ...(v.open_pins ? [['33', '/nRST'], ['34', '/BOOT'], ['36', 'GP10'], ['37', 'GP11'], ['38', 'GP24']]
    .map(([pin, n]) => ({ pin, net: `${n.startsWith('GP') ? `GPIO${gp(n)}` : n.slice(1)}_unconnected`, joins: [] })) : [])]
  const pins = [...[...new Set(j2.pads.filter((q) => q.castellated).map((q) => q.pin))].sort((a, b) => a - b), ...extras.map((e) => e.pin)]
  const rowStart = -((v.edge_pins - 1) * v.pitch) / 2 // the long edge's pins centred, at least row_in from the ends
  if (Number((rowStart - left).toFixed(2)) < v.row_in) throw new Error(`${v.edge_pins} pins along the bottom leave ${(rowStart - left).toFixed(2)} mm at each end: under row_in (${v.row_in} mm)`)
  const spots = [
    ...Array.from({ length: v.end_pins }, (_, i) => ({ side: [1, 0], x: left - out, y: bottom + v.end_rise + (v.end_pins - 1 - i) * v.pitch })),
    ...Array.from({ length: v.edge_pins }, (_, i) => ({ side: [0, 1], x: rowStart + i * v.pitch, y: bottom - out })),
    ...Array.from({ length: v.end_pins }, (_, i) => ({ side: [-1, 0], x: right + out, y: bottom + v.end_rise + i * v.pitch }))]
  const inn = header.x - half.x, offset = header.hole_offset[0] // the header pad's copper in from the half hole; its hole further in (pin 1 is on the left)
  // The end columns slot between keys: their header holes span key widths (span × key_pitch), so length must say so
  if ((v.length - 2 * (inn + offset - out)).toFixed(2) !== (v.span * v.key_pitch).toFixed(2)) throw new Error(`the end columns' holes are ${(v.length - 2 * (inn + offset - out)).toFixed(2)} mm apart, not ${v.span} keys (${(v.span * v.key_pitch).toFixed(2)} mm): hole_in is ${(inn + offset - out).toFixed(2)} mm with Sea-Picro's pads`)
  const led = j2.pads.find((q) => q.pin === '32')
  // The corners: each end's lowest pad has its top level with the tips of the long edge's pads, and the long edge's first
  // pad is a pin's usual gap (a pitch less a pad's width) past the end of it. end_rise and row_in must say so
  if (v.headers) {
    const tip = inn - out + header.w / 2, rise = tip - header.h / 2, rowIn = tip + (v.pitch - header.h) + header.h / 2
    if (rise.toFixed(2) !== v.end_rise.toFixed(2) || rowIn.toFixed(2) !== v.row_in.toFixed(2)) throw new Error(`with Sea-Picro's pads, end_rise is ${rise.toFixed(2)} and row_in ${rowIn.toFixed(2)} mm, not ${v.end_rise} and ${v.row_in}`)
  }

  // The core first, turned as one block with Sea-Picro's own routing, while the rest is where Sea-Picro has it: its
  // tracks out to the old pins become escapes, routed on from where they leave the core. Then USB-C and its parts
  const usbParts = ['J1', ...src.placement.filter((r) => r.anchor === 'J1').map((r) => r.part)]
  let c = moveGroup(src, src.parts.map((p) => p.ref).filter((r) => r !== 'J2' && !usbParts.includes(r)), { turn: v.core_turn, dx: v.core_x, dy: v.core_y }, { keep: true })
  c = arrange(c, { J1: { x: v.usb_x, y: top + v.usb_out, rotation: 0 } })
  c = addPins(c, 'J2', extras.map((e) => ({ ...half, ...e, x: 0, y: 0 }))) // placed with the rest below

  // Which pin goes where, grouped for whoever wires the keyboard, each group on the side its signals leave the core
  // (seen from above, USB-C at the top):
  //  - up the left end: power and control: 5V, 3V3 and GND together; reset and boot either side of a GND (a button
  //    across each pair); the USB data pair, for a socket elsewhere
  //  - along the bottom: SWITCH, then the GPIO in two runs: 20 to 29 (26 to 29 can read analog), then 0 to 10, with a
  //    GND at each end
  //  - up the right end: an SPI display's header (GND, VCC, SCL, SDA, RES, DC, CS, then BLK, an LCD's backlight: a 7-pin
  //    SSD1322 OLED or an 8-pin ST7789 LCD fits without cutting the header), on the RP2040's SPI1 pins
  // 'GP12' is GPIO12; other names are Sea-Picro's nets. The pins keep Sea-Picro's numbers and nets; only their places change
  const netOf = (pin) => Object.entries(c.nets).find(([, n]) => n.includes(`J2.${pin}`)) || []
  const used = new Set(), take = (want) => {
    if (!want) return null // a place left empty
    const io = want.startsWith('GP'), waiting = `${io ? `GPIO${gp(want)}` : want.replace(/^\//, '')}_unconnected` // an extra pin, not yet joined
    const pin = pins.find((x) => !used.has(x) && (netOf(x)[0] === waiting || (io ? (netOf(x)[1] || []).includes(`${chip.ref}.${padOf(gp(want))}`) : netOf(x)[0] === want)))
    if (!pin) throw new Error(`no edge pin left for ${want}`)
    used.add(pin); return pin
  }
  const display = ['GND', '+3V3', ...[v.display_scl, v.display_sda, v.display_res, v.display_dc, v.display_cs, v.display_blk].map((g) => `GP${g}`)].map(take) // front to back
  const leftEnd = (v.open_pins ? ['+5V', '+3V3', 'GND', '/nRST', 'GND', '/BOOT', '/USB-', '/USB+'] : ['+5V', '+3V3', 'GND', 'GND', '/USB-', '/USB+', null, null]).map(take) // front to back; the top places left empty
  const ends = v.row_gnd ? ['GND'] : []
  const row = [...ends, '/SWITCH', ...run('GP20', 'GP23'), ...(v.open_pins ? ['GP24'] : []), ...run('GP26', 'GP29'), ...run('GP0', 'GP8'), ...(v.open_pins ? ['GP10', 'GP11'] : []), ...ends].map(take) // left to right (GPIO9: the display's backlight)
  const order = [...[...leftEnd].reverse(), ...row, ...(v.display_gnd_front ? display : [...display].reverse())] // the left end's places run top to bottom, the right end's bottom to top
  if (order.length !== spots.length || used.size !== pins.length) throw new Error(`the layout places ${order.length} of the module's ${pins.length} edge pins`)
  // Each end's lowest pin sits at the corner, beside the long edge's first pin, as on Waveshare's RP2040-Zero: if its
  // header pad would reach that pin's pad, it stops a clearance short, its outer end and hole where they were
  const cornerReach = v.row_in - header.h / 2 - v.clearance // from the end's edge, the farthest in the corner pad may reach
  const bottomReach = inn - out + header.w / 2 // how far the header pads reach in from their edge
  const pads = order.flatMap((pin, i) => {
    if (!pin) return [] // a place left empty
    const { side: [ix, iy], x, y } = spots[i], across = iy !== 0
    let len = header.w, along = inn, hole = offset
    if (!across && y - header.h / 2 - v.clearance < bottom + bottomReach && cornerReach < bottomReach) {
      const outer = inn - out - header.w / 2 // the pad's outer end, in from the edge
      len = cornerReach - outer; along = out + outer + len / 2; hole = inn + offset - along
    }
    if (!v.headers) return [{ ...half, pin, x, y }]
    return [{ ...half, pin, x, y },
      { ...header, pin, x: x + ix * along, y: y + iy * along, w: across ? header.h : len, h: across ? len : header.h, hole_offset: [ix * hole, iy * hole] }]
  })
  pads.push({ ...led, x: v.led_x, y: v.led_y })
  const pin28 = spots[order.indexOf('28')]
  c = arrange(withFootprint(c, 'J2', pads), { J2: { x: 0, y: 0, rotation: 0 },
    R4: { x: pin28.x + pin28.side[0] * v.switch_in, y: pin28.y + pin28.side[1] * v.switch_in, rotation: pin28.side[0] ? 0 : v.switch_turn } })

  // The outline: a rectangle with Sea-Picro's notch for the mid-mount socket, its size read off Sea-Picro's outline
  const j1 = src.parts.find((p) => p.ref === 'J1'), srcTop = Math.max(...src.outline.map((p) => p.y))
  const inNotch = src.outline.filter((p) => p.y < srcTop - v.notch_below && Math.abs(p.x - j1.x) < v.notch_reach)
  const wide = Math.max(...inNotch.map((p) => Math.abs(p.x - j1.x))), deep = srcTop - Math.min(...inNotch.map((p) => p.y))
  const n0 = v.usb_x - wide, n1 = v.usb_x + wide, nd = top - deep
  const outline = [[left, bottom], [right, bottom], [right, top], [n1, top], [n1, nd], [n0, nd], [n0, top], [left, top]].map(([x, y]) => ({ x, y }))

  // Pin labels on the top silkscreen, just inside each header pad: the RP2040's GPIO number (12 for GP12), or the power
  // or signal name. The pins aren't in Sea-Picro's order, so the board says which is which
  const names = { GND: 'GND', '+3V3': '3V3', '+5V': '5V', '/USB+': 'D+', '/USB-': 'D-', '/SWITCH': 'SW', '/nRST': 'RST', '/BOOT': 'BOOT' }
  const label = (pin) => {
    const [net, pins] = netOf(pin)
    const gpio = pins?.find((x) => x.startsWith(`${chip.ref}.`))
    const name = gpio && v.rp2040.pinMaps.gpio[gpio.split('.')[1]]
    return name ? name.replace('GPIO', '') : names[net] ?? String(net).replace(/^[/+]/, '')
  }
  const silk = order.map((pin, i) => {
    if (!pin) return null
    const { side: [ix, iy], x, y } = spots[i], text = label(pin), long = text.length * v.jlcpcb.silk_text * v.label_char
    const reach = v.headers ? inn + Math.max(header.w, header.h) / 2 : half.w / 2 - out // how far the pin's copper reaches in
    const from = reach + v.label_gap + (iy ? long : v.jlcpcb.silk_text) / 2
    return { text, x: x + ix * (from + (ix ? long / 2 - v.jlcpcb.silk_text / 2 : 0)), y: y + iy * from, size: v.jlcpcb.silk_text, layer: 'top', rotation: iy ? v.label_turn : 0,
      // where an arrow to the pin could end, just off its pad: past its end, or beside it, either side
      tip: [{ x: x + ix * (reach + v.label_gap / 2), y: y + iy * (reach + v.label_gap / 2) },
        ...[1, -1].map((k) => ({ x: x + ix * reach / 2 + k * iy * (header.h / 2 + v.label_gap / 2), y: y + iy * reach / 2 + k * ix * (header.h / 2 + v.label_gap / 2) }))] }
  }).filter(Boolean)

  silk.push({ text: 'LED5V', x: v.led_x, y: v.led_y - Math.max(led.w, led.h) / 2 - v.label_gap - v.jlcpcb.silk_text / 2, size: v.jlcpcb.silk_text, layer: 'top' }) // pad 32: WS2812 data at 5 V (GPIO25, level-shifted)
  // the long edge's labels first: the ends' labels have room to slide up and down out of their way
  const first = v.pcb.clearLabels([...silk.filter((l) => l.rotation), ...silk.filter((l) => !l.rotation)], c, { char: v.label_char })
  // A label with no room beside its pin (a corner pin's, hemmed in by the long edge's first pad) goes to the nearest
  // clear place on the board instead, with a small triangle pointing at the pin
  const area = { minX: left + v.label_gap, maxX: right - v.label_gap, minY: bottom + v.label_gap, maxY: top - v.label_gap }
  const labels = v.pcb.clearLabels(first.map(({ clash, tip, ...l }) => (clash ? { ...l, to: tip } : l)), c, { char: v.label_char, area })
  const k = clone(c, { layers: v.layers })
  // Shown with pin headers (show_headers: 1): a header pin and its plastic spacer in each header hole, in the 3D model only
  const holesOf = pads.filter((q) => q.hole_offset).map((q) => ({ x: q.x + q.hole_offset[0], y: q.y + q.hole_offset[1] }))
  const parts = v.show_headers && v.headers ? k.parts.map((p) => (p.name === 'J2' ? { ...p, model: v.pcb.pinHeaders(holesOf, { thickness: v.thickness, pitch: v.pitch }) } : p)) : k.parts
  // Mounting holes, for M2 screws as on a Raspberry Pi Pico, where the board has room: between the core and the USB-C parts
  const mounting = [[v.hole_a_x, v.hole_a_y], [v.hole_b_x, v.hole_b_y]].map(([x, y]) => ({ x, y, d: v.hole_d, keepout: v.hole_keepout }))
  return {
    board: { outline, thickness: v.thickness, track: v.track, autoroute: true, layers: k.layers, planes: k.planes,
      via_pad: k.via_pad, via_hole: k.via_hole, route_via: { pad: v.via_pad, hole: v.via_hole }, plane_clearance: k.plane_clearance, clearance: v.clearance, neck: v.jlcpcb.track_min, smooth: true, via_hole_gap: v.jlcpcb.via_hole_track, copper: k.copper, parts, nets: k.nets, holes: [...k.holes, ...mounting], silk: labels },
    clone: { circuit: src, arranged: c }
  }
}
