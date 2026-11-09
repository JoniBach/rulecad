// The arm lying flat: a boss at one end, a tapered pointer rising from it towards the dial.
import jscad from '@jscad/modeling'
const { cylinder, cylinderElliptic, roundedRectangle } = jscad.primitives
const { extrudeLinear } = jscad.extrusions
const { translate } = jscad.transforms

export function main (v) {
  const span = v.length + v.beyond + v.hub / 2
  const bar = translate([(v.length + v.beyond - v.hub / 2) / 2, 0, 0], extrudeLinear({ height: v.thick }, roundedRectangle({ size: [span, v.bar], roundRadius: v.corner, segments: v.segments })))
  const pad = cylinder({ radius: v.hub / 2, height: v.thick + v.boss, center: [0, 0, (v.thick + v.boss) / 2], segments: v.segments * 2 })
  const pointer = cylinderElliptic({ height: v.pointer_top, startRadius: [v.pointer / 2, v.pointer / 2], endRadius: [v.point / 2, v.point / 2], center: [v.pointer_r, 0, v.pointer_top / 2], segments: v.segments })
  const bolts = Array.from({ length: v.bolts }, (_, k) => cylinder({ radius: v.hole / 2, height: v.thick + v.boss + 1, center: [v.bolt * Math.cos(2 * k * Math.PI / v.bolts), v.bolt * Math.sin(2 * k * Math.PI / v.bolts), (v.thick + v.boss) / 2], segments: v.segments }))
  const hangs = [v.r1, v.r2, v.r3].map((r) => cylinder({ radius: v.hang / 2, height: v.thick + 1, center: [r, 0, v.thick / 2], segments: v.segments }))
  return v.ops.subtract(v.ops.union(bar, pad, pointer), bolts, hangs)
}
