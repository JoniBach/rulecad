// A ring with a slot and a screw across it, closing round the rod. The screw's hole is a teardrop across the layers.
import jscad from '@jscad/modeling'
const { cylinder, cuboid } = jscad.primitives

export function main (v) {
  const ring = cylinder({ radius: v.outer / 2, height: v.high, center: [0, 0, v.high / 2], segments: v.segments * 2 })
  const hole = cylinder({ radius: v.bore / 2, height: v.high + 1, center: [0, 0, v.high / 2], segments: v.segments })
  const slot = cuboid({ size: [v.outer / 2 + 1, v.slot, v.high + 1], center: [(v.outer / 2 + 1) / 2, 0, v.high / 2] })
  const screw = v.shapes.teardropHole({ d: v.screw, length: v.outer, at: [v.screw_out, 0 - v.outer / 2, v.high / 2], into: '+y', through: true })
  return v.ops.subtract(ring, hole, slot, screw)
}
