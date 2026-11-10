// A C of TPU, printed lying down: its bore has a 45° ridge that snaps into the foot's groove, and ribs across its tread.
import jscad from '@jscad/modeling'
const { polygon, cuboid } = jscad.primitives
const { translate, rotateZ } = jscad.transforms
const { extrudeRotate } = jscad.extrusions

export function main (v) {
  const mid = v.width / 2, r = v.inner - v.grip, g = v.ridge
  const arc = v.sweep * v.rad
  const ring = extrudeRotate({ segments: v.segments, startAngle: -arc / 2 - Math.PI / 2, angle: arc }, polygon({ points: [[r, 0], [v.outer, 0], [v.outer, v.width], [r, v.width], [r, mid + g], [r - g, mid], [r, mid - g]] }))
  const n = v.ribs
  const cuts = Array.from({ length: n }, (_, k) => rotateZ(-arc / 2 - Math.PI / 2 + (arc * (k + 1)) / (n + 1), cuboid({ size: [v.rib_d * 2, v.rib_w, v.width + 1], center: [v.outer, 0, mid] })))
  return v.ops.subtract(ring, cuts)
}
