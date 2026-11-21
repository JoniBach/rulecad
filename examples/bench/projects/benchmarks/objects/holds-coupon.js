// The holds coupon, the fixings coupon's second plate: what holds two parts together without a screw of steel. A plate
// with a row for each fit, at sizes either side of the one the kit draws: snap pin sockets (S3, S4), holes for a 3 mm
// steel dowel and for 1.75 mm filament, pressed (D3P, FP) and slipping (D3S, FS), pockets for 6x3 and 8x3 disc magnets
// pressed in (6x3, 8x3) and held by crush ribs (8x3R), and printed nuts for printed M8 and M10 bolts (M8N, M10N). Beside
// it, loose: the printed bolts for those nuts, one for each thread gap, a pull bolt to break, and snap pins at three barb
// depths for each socket row. Every size comes from v.fixings and the printer's rules, so the coupon prints round the
// figures the kit draws today, and again round yours once they are measured (MEASURE.md, rows 40 to 46).
// The plate's first layer is one rectangle with a few round holes (the sockets go through it, and each magnet pocket has
// a hole under it to push the magnet out); every loose piece stands on a plain round or hexagonal foot. Nothing needs a support.
import jscad from '@jscad/modeling'
const { cylinder, cylinderElliptic, roundedRectangle, circle, polygon } = jscad.primitives
const { extrudeLinear, extrudeRotate } = jscad.extrusions
const { translate } = jscad.transforms
const { hull } = jscad.hulls
const { offset } = jscad.expansions
const { measureBoundingBox } = jscad.measurements

export function main (v) {
  const f = v.fixings, base = v.base, wall = v.wall, seg = v.segments
  const fig = (x) => String(Number(x.toFixed(2))) // a figure as it is labelled and written back
  const around = (centre, n, step) => Array.from({ length: n }, (_, i) => Number((centre + (i - (n - 1) / 2) * step).toFixed(3)))
  const width = (text) => { const [lo, hi] = measureBoundingBox(v.shapes.text({ text, height: v.label, stroke: v.stroke })); return hi[0] - lo[0] }
  const say = (text, x, y, z) => translate([x, y, z], extrudeLinear({ height: v.emboss }, v.shapes.text({ text, height: v.label, stroke: v.stroke })))
  // the printer as plain values with one figure changed: each feature in a row is drawn as if the printer's rule were its figure
  const printer = (k, x) => ({ ...v.x1c, [k]: x })
  // A feature's stand, its outline rising from the bed to its top, flared at 45° where it meets the base
  const stand = (outline, top) => v.ops.union(extrudeLinear({ height: top }, outline),
    hull(extrudeLinear({ height: base }, offset({ delta: v.root, corners: 'round', segments: seg }, outline)), extrudeLinear({ height: base + v.root }, outline)))
  const round = (across, top, cut) => ({ across, deep: across, top, make: (x, y) => ({ solid: stand(circle({ radius: across / 2, center: [x, y], segments: seg }), top), cut: cut(x, y) }) })
  // A hole down through everything at (x, y): under a magnet's pocket, to push the magnet out with a pin
  const through = (d, x, y, top) => translate([x, y, top / 2], cylinder({ radius: d / 2, height: top + 2, segments: seg }))

  // ---------- the plate's rows ----------
  // Snap pin sockets: a hole through a boss as thick as the pin's shaft is long, at three clearances round the kit's
  const sockets = (d) => {
    const name = `snap pin ${d}x${v.shaft}`, c0 = f.pinModel(name).hole.clearance / 2, cs = around(c0, 3, v.step)
    return { name: `S${d}`, items: cs.map((c) => ({ label: fig(c), ...round(d + 2 * Math.max(...cs) + 2 * wall, v.shaft, (x, y) => f.pinHole(name, { printer: printer('snap_clearance', c), at: [x, y, v.shaft], depth: v.shaft, through: true })) })) }
  }
  // Plain pins: blind holes from the top, pressed (the figure is how much smaller than the pin, before hole_comp) or slipping
  const pins = (pin, label, fit) => {
    const key = fit === 'press' ? 'pin_press' : 'pin_slip', c0 = f.pinModel(pin, { fit }).hole.clearance, x0 = fit === 'press' ? -c0 : c0
    const xs = around(x0, 3, fit === 'press' ? v.press_step : v.step), d = f.pinModel(pin, { fit: 'slip', printer: printer('pin_slip', Math.max(...xs)) }).hole.diameter, top = base + v.pin_depth
    return { name: label, items: xs.map((x) => ({ label: fig(x), ...round(d + 2 * wall, top, (cx, cy) => f.pinHole(pin, { fit, printer: printer(key, x), at: [cx, cy, top], depth: v.pin_depth })) })) }
  }
  // Magnet pockets: as deep as the magnet, the base under it, a push-out hole through that
  const magnets = (size, label, fit) => {
    const name = `disc magnet ${size}`, s0 = f.magnetSeatModel(name, { fit }), key = fit === 'press' ? 'magnet_press' : 'magnet_crush'
    const x0 = fit === 'press' ? -s0.pocket.clearance : s0.rests.find((r) => r.name.endsWith(key)).value, xs = around(x0, 3, v.step)
    const top = base + s0.pocket.depth, across = s0.pocket.nominal[0] + 2 * (s0.pocket.lead ?? 0) + 2 * wall
    return { name: label, items: xs.map((x) => ({ label: fig(x), ...round(across, top, (cx, cy) => v.ops.union(f.magnetSeat(name, { fit, printer: printer(key, x), at: [cx, cy, top] }), through(v.push, cx, cy, top))) })) }
  }
  // Printed nuts for printed bolts: a thread drawn half the gap off its basic profile (the bolt takes the other half)
  const nuts = (t) => {
    const g0 = f.holeModel(t, { kind: 'thread', mate: 'printed' }).threaded.clearance, gaps = around(g0, 3, v.step)
    const made = gaps.map((gap) => f.holeModel(t, { kind: 'thread', mate: 'printed', gap })), across = Math.max(...made.map((h) => h.diameter)) + 2 * wall
    return { name: `${t}N`, items: gaps.map((gap, i) => ({ label: fig(gap), ...round(across, base + made[i].depth, (x, y) => f.hole(t, { kind: 'thread', mate: 'printed', gap, at: [x, y, base + made[i].depth] })) })), gaps, depths: made.map((h) => h.depth) }
  }

  const n8 = nuts('M8'), n10 = nuts('M10')
  const rows = [[sockets(3), sockets(4)], [pins('dowel 3x12', 'D3P', 'press'), pins('dowel 3x12', 'D3S', 'slip')],
    [pins('filament pin 1.75x12', 'FP', 'press'), pins('filament pin 1.75x12', 'FS', 'slip')],
    [magnets('6x3', '6x3', 'press'), magnets('8x3', '8x3', 'press'), magnets('8x3', '8x3R', 'ribs')], [n8, n10]]
  const solids = [], cuts = [], labels = []
  let y = v.gap, length = 0
  for (const row of rows) {
    const deep = Math.max(...row.flatMap((g) => g.items.map((it) => it.deep))), line = y + v.label / 2, mid = y + v.label + v.gap + deep / 2
    let x = v.gap
    for (const g of row) {
      const nameWidth = width(g.name)
      labels.push(say(g.name, x + nameWidth / 2, mid, base)); x += nameWidth + v.gap
      for (const it of g.items) {
        const pitch = Math.max(it.across, width(it.label) + v.gap), cx = x + pitch / 2, m = it.make(cx, mid)
        solids.push(m.solid); cuts.push(m.cut); labels.push(say(it.label, cx, line, base)); x += pitch + v.gap
      }
      x += v.gap
    }
    length = Math.max(length, x); y += deep + v.label + v.gap * 2
  }
  const plate = extrudeLinear({ height: base }, roundedRectangle({ size: [length, y], center: [length / 2, y / 2], roundRadius: v.corner, segments: seg }))
  const out = { plate: v.ops.union(v.ops.subtract(v.ops.union(plate, ...solids), ...cuts), ...labels) }

  // ---------- the loose pieces, in a row behind the plate ----------
  // Marks: one, two or three notches down the side of a bolt's head or a pin's foot, for the first, second and third figure
  const notches = (count, radius, height) => Array.from({ length: count }, (_, i) => cylinder({ radius: v.notch, height: 2 * height, center: [radius * Math.cos(i * Math.PI / 3), radius * Math.sin(i * Math.PI / 3), 0], segments: 16 }))
  let x = v.gap, deep = 0
  const place = (name, solid, across) => { out[name] = translate([x + across / 2, y + v.gap + across / 2, 0], solid); x += across + v.gap * 2; deep = Math.max(deep, across) }
  // Printed bolts standing on their heads, one for each of the nuts' gaps, short enough not to reach the nut's floor
  for (const [t, n] of [['M8', n8], ['M10', n10]]) {
    n.gaps.forEach((gap, i) => {
      const length = Math.floor(n.depths[i] * v.engaged), b = f.printedBolt(`${t}x${length} hex printed`, { gap }), across = b.screw.headDiameter
      place(`bolt-${t.toLowerCase()}-${fig(gap)}`, v.ops.subtract(b, ...notches(i + 1, (across / 2) * Math.cos(Math.PI / 6), b.screw.headHeight)), across + v.gap)
    })
  }
  // The pull bolt: an M8 printed bolt for a bought steel nut, its shank turned down to a waist that breaks within the
  // luggage scale's reach. The waist is reached by 45° cones from the shank, so nothing overhangs past the printer's limit
  {
    const b = f.printedBolt(`M8x${v.pull_length} hex printed`, { nut: 'steel' }), k = b.screw.headHeight, R = b.screw.major / 2, r = v.waist / 2, z1 = k + 1, z2 = z1 + (R - r) + v.waist_length + (R - r)
    const keep = extrudeRotate({ segments: seg }, polygon({ points: [[0, z1], [R, z1], [r, z1 + R - r], [r, z2 - (R - r)], [R, z2], [0, z2]] }))
    const ring = v.ops.subtract(translate([0, 0, (z1 + z2) / 2], cylinder({ radius: R + 2, height: z2 - z1, segments: seg })), keep)
    place('pull-bolt', v.ops.subtract(b, ring), b.screw.headDiameter + v.gap)
  }
  // Snap pins standing on their feet, three barb depths for each socket row, the split ending a millimetre above the foot
  for (const d of [3, 4]) {
    around(v.barb, 3, v.barb_step).forEach((lip, i) => {
      const r = d / 2, rise = r + lip, slot = v.shaft - 1 + lip + rise, p = f.pin(`snap pin ${d}x${v.shaft} barb ${lip}`, { slot }), foot = d * 2
      place(`snap-pin-${d}-${fig(lip)}`, v.ops.subtract(p, ...notches(i + 1, foot / 2, 2)), foot + 2)
    })
  }
  return out
}
