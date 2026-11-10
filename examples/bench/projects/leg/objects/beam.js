// A flat bar with two teardrop pilot holes in each end.
import jscad from '@jscad/modeling'
const { cuboid } = jscad.primitives

export function main (v) {
  const bar = cuboid({ size: [v.long, v.deep, v.wide], center: [0, 0, v.wide / 2] })
  const holes = [1, -1].flatMap((end) => [-1, 1].map((s) => v.shapes.teardropHole({ d: v.pilot, length: v.pilot_len + 1, at: [end * (v.long / 2 + 1), s * v.screw_y, v.wide / 2], into: end > 0 ? '-x' : '+x' })))
  return v.ops.subtract(bar, holes)
}
