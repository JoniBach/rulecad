// A short bar from the elbow's output to a yoke round the pen holder's block. The yoke's cheeks run parallel along the
// slot, so the heads and nuts of the screws across it sit square.
// The screws' holes are v.fixings': two M3 clearance holes across the yoke for the holder's screws, each head
// counterbored into the near cheek (on its side, so a teardrop) so an M3x30 reaches its nut on the far one, and four
// in the boss with their cap heads' counterbores for the screws into the elbow's output.
import jscad from '@jscad/modeling'
const { cylinder, cuboid, circle, rectangle } = jscad.primitives
const { translate } = jscad.transforms
const { extrudeLinear } = jscad.extrusions
const { hull } = jscad.hulls

export function main (v) {
  const screw = v.fixings.holeModel('M3').diameter, cb = v.fixings.counterboreModel('M3 cap'), head = cb.diameter, headDepth = cb.depth + v.sink
  const endWide = v.block + v.cheek * 2, tip = v.long + v.reach
  const dot = (r, x) => translate([x, 0], circle({ radius: r, segments: v.segments }))
  const bar = extrudeLinear({ height: v.bar }, hull(dot(v.wide / 2, 0), rectangle({ size: [tip - v.long + v.slot_from, endWide], center: [(tip + v.long - v.slot_from) / 2, 0] })))
  const boss = cylinder({ radius: v.boss_d / 2, height: v.boss, center: [0, 0, v.boss / 2], segments: v.segments * 2 })
  const slot = cuboid({ size: [tip + 1 - (v.long - v.slot_from), v.block + v.slot_fit, v.bar + 1], center: [(tip + 1 + v.long - v.slot_from) / 2, 0, v.bar / 2] })
  const holes = [-1, 1].map((s) => v.fixings.counterbore('M3 cap', { length: endWide, at: [v.long + s * v.pitch, 0 - endWide / 2, v.mid], into: '+y' }))
  const bolts = Array.from({ length: v.bolts }, (_, k) => cylinder({ radius: screw / 2, height: v.boss + 1, center: [v.bolt * Math.cos(k * v.quarter), v.bolt * Math.sin(k * v.quarter), v.boss / 2], segments: v.segments }))
  const heads = Array.from({ length: v.bolts }, (_, k) => cylinder({ radius: head / 2, height: headDepth + 1, center: [v.bolt * Math.cos(k * v.quarter), v.bolt * Math.sin(k * v.quarter), (headDepth - 1) / 2], segments: v.segments }))
  const flag = cuboid({ size: [v.flag_wide, v.flag_thick, v.flag_h], center: [v.flag_x, v.flag_y, v.bar + v.flag_h / 2] })
  const band = cylinder({ radius: v.bias_d / 2, height: v.bar + 1, center: [v.bias_at, 0, v.bar / 2], segments: v.segments })
  return v.ops.subtract(v.ops.union(bar, boss, flag), slot, holes, bolts, heads, band)
}
