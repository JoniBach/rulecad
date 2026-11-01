// A long, thin RP2040 module for keyboards: Sea-Picro's circuit (rules/sea_picro.json, read from its KiCad board by
// cad clone; CERN-OHL-S, so this board is too), redrawn with castellated pins along the bottom edge and up both ends
// and USB-C on the top edge. Its core keeps Sea-Picro's own proven layout and routing (its tracks and vias), turned on
// its side, so only the connections out of it are routed; the pins are new, with
// Sea-Picro's numbers and pad shapes; the USB-C socket brings its fuse and CC resistors. The checks prove the circuit is
// still Sea-Picro's and every small part still sits by the pin it serves.
export function main (v) {
  const { clone, arrange, moveGroup, withFootprint } = v.pcb, src = v.sea_picro.circuit
  const left = -v.length / 2, right = v.length / 2, bottom = -v.height / 2, top = v.height / 2

  // The edge pins, Sea-Picro's numbers in its order round the board: down the left end, along the bottom, up the right
  const j2 = src.parts.find((p) => p.ref === 'J2'), srcLeft = Math.min(...src.outline.map((p) => p.x))
  const half = j2.pads.find((q) => q.pin === '1' && q.castellated), header = j2.pads.find((q) => q.pin === '1' && !q.castellated)
  const out = srcLeft - (j2.x + half.x) // the half hole's centre beyond the edge, as on Sea-Picro
  const pins = [...new Set(j2.pads.filter((q) => q.castellated).map((q) => q.pin))].sort((a, b) => a - b)
  const spots = [
    ...Array.from({ length: v.end_pins }, (_, i) => ({ side: [1, 0], x: left - out, y: bottom + (v.end_pins - 1 - i + v.end_from) * v.pitch })),
    ...Array.from({ length: v.edge_pins }, (_, i) => ({ side: [0, 1], x: left + (i + 1) * v.pitch, y: bottom - out })),
    ...Array.from({ length: v.end_pins }, (_, i) => ({ side: [-1, 0], x: right + out, y: bottom + (i + v.end_from) * v.pitch }))]
  if (pins.length !== spots.length) throw new Error(`Sea-Picro has ${pins.length} edge pins: edge_pins + 2 × end_pins must come to ${pins.length}, not ${spots.length}`)
  const inn = header.x - half.x, offset = Math.hypot(...header.hole_offset) // the header pad in from the half hole, its hole set back out
  const led = j2.pads.find((q) => q.pin === '32')

  // The core first, turned as one block with Sea-Picro's own routing, while the rest is where Sea-Picro has it: its
  // tracks out to the old pins become escapes, routed on from where they leave the core. Then USB-C and its parts
  const usbParts = ['J1', ...src.placement.filter((r) => r.anchor === 'J1').map((r) => r.part)]
  let c = moveGroup(src, src.parts.map((p) => p.ref).filter((r) => r !== 'J2' && !usbParts.includes(r)), { turn: v.core_turn, dx: v.core_x, dy: v.core_y }, { keep: true })
  c = arrange(c, { J1: { x: v.usb_x, y: top + v.usb_out, rotation: 0 } })

  // Which pin goes where: each pin's copper comes out of the core somewhere (an escape's end, or the part it joins), and
  // the pins take the places round the U in that same order, so their tracks fan out without crossing. The pins keep
  // Sea-Picro's numbers and nets; only their places change (firmware names the RP2040's pins, not these)
  const placeOf = new Map(c.parts.map((p) => [p.ref, p]))
  const toward = (pin) => {
    const stub = c.kept.stubs.find((b) => src.nets[b.net]?.includes(`J2.${pin}`))
    if (stub) return stub.end
    const other = (Object.values(src.nets).find((n) => n.includes(`J2.${pin}`)) || []).find((x) => !x.startsWith('J2.'))
    return other ? placeOf.get(other.split('.')[0]) : { x: 0, y: -1 }
  }
  const round = (q) => (Math.atan2(q.y, q.x) - Math.PI / 2 + 2 * 2 * Math.PI) % (2 * Math.PI) // counter-clockwise from the top middle
  const order = [...pins].sort((a, b) => round(toward(a)) - round(toward(b)))
  const pads = order.flatMap((pin, i) => {
    const { side: [ix, iy], x, y } = spots[i], across = iy !== 0
    return [{ ...half, pin, x, y },
      { ...header, pin, x: x + ix * inn, y: y + iy * inn, w: across ? header.h : header.w, h: across ? header.w : header.h, hole_offset: [-ix * offset, -iy * offset] }]
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

  const k = clone(c, { layers: v.layers })
  return {
    board: { outline, thickness: v.thickness, track: v.track, autoroute: true, layers: k.layers, planes: k.planes,
      via_pad: k.via_pad, via_hole: k.via_hole, plane_clearance: k.plane_clearance, clearance: v.clearance, neck: v.jlcpcb.track_min, copper: k.copper, parts: k.parts, nets: k.nets, holes: k.holes },
    clone: { circuit: src, arranged: c }
  }
}
