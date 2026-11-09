// A short bar from the elbow's output to a yoke round the pen holder's block.
import jscad from '@jscad/modeling'
const { cylinder, cuboid, circle, rectangle } = jscad.primitives
const { translate } = jscad.transforms
const { extrudeLinear } = jscad.extrusions
const { hull } = jscad.hulls

export function main (v) {
  const endWide = v.block + v.cheek * 2, tip = v.long + v.reach
  const dot = (r, x) => translate([x, 0], circle({ radius: r, segments: v.segments }))
  const bar = extrudeLinear({ height: v.bar }, hull(dot(v.wide / 2, 0), rectangle({ size: [1, endWide], center: [tip - 1 / 2, 0] })))
  const boss = cylinder({ radius: v.boss_d / 2, height: v.boss, center: [0, 0, v.boss / 2], segments: v.segments * 2 })
  const slot = cuboid({ size: [tip + 1 - (v.long - v.slot_from), v.block + v.slot_fit, v.bar + 1], center: [(tip + 1 + v.long - v.slot_from) / 2, 0, v.bar / 2] })
  const holes = [-1, 1].map((s) => v.shapes.teardropHole({ d: v.screw, length: endWide + 1, at: [v.long + s * v.pitch, 0 - endWide / 2 - 1 / 2, v.mid], into: '+y', through: true }))
  const bolts = Array.from({ length: v.bolts }, (_, k) => cylinder({ radius: v.screw / 2, height: v.boss + 1, center: [v.bolt * Math.cos(k * v.quarter), v.bolt * Math.sin(k * v.quarter), v.boss / 2], segments: v.segments }))
  const heads = Array.from({ length: v.bolts }, (_, k) => cylinder({ radius: v.head / 2, height: v.head_depth + 1, center: [v.bolt * Math.cos(k * v.quarter), v.bolt * Math.sin(k * v.quarter), (v.head_depth - 1) / 2], segments: v.segments }))
  const flag = cuboid({ size: [v.flag_wide, v.flag_thick, v.flag_h], center: [v.flag_x, v.flag_y, v.bar + v.flag_h / 2] })
  const band = cylinder({ radius: v.bias_d / 2, height: v.bar + 1, center: [v.bias_at, 0, v.bar / 2], segments: v.segments })
  return v.ops.subtract(v.ops.union(bar, boss, flag), slot, holes, bolts, heads, band)
}
