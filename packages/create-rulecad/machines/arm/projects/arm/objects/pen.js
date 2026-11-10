// A fineliner, drawn from a few measurements.
import jscad from '@jscad/modeling'
const { cylinder, cylinderElliptic } = jscad.primitives

export function main (v) {
  const body = cylinder({ radius: v.d / 2, height: v.long - v.point, center: [0, 0, v.point + (v.long - v.point) / 2], segments: v.segments })
  const cone = cylinderElliptic({ height: v.point, startRadius: [v.tip_d / 2, v.tip_d / 2], endRadius: [v.d / 2, v.d / 2], center: [0, 0, v.point / 2], segments: v.segments })
  return v.ops.union(body, cone)
}
