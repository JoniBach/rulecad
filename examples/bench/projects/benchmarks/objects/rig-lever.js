// A flat lever: two screws to the wheel, holes along it at known radii.
import jscad from '@jscad/modeling'
const { cylinder, roundedRectangle } = jscad.primitives
const { extrudeLinear } = jscad.extrusions
const { translate } = jscad.transforms

export function main (v) {
  const span = v.reach + v.tail + v.bar / 2
  const bar = translate([(v.reach + v.bar / 2 - v.tail) / 2, 0, 0], extrudeLinear({ height: v.thick }, roundedRectangle({ size: [span, v.bar], roundRadius: v.corner, segments: v.segments })))
  const round = (r, x) => cylinder({ radius: r / 2, height: v.thick + 1, center: [x, 0, v.thick / 2], segments: v.segments })
  return v.ops.subtract(bar, round(v.bore, 0), round(v.hole_m3, v.bolt), round(v.hole_m3, 0 - v.bolt), round(v.hole, v.r1), round(v.hole, v.r2), round(v.hole, v.r3))
}
