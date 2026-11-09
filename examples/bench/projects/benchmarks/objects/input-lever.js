// A lever with a copy of the motor's shaft standing on it.
import jscad from '@jscad/modeling'
const { cylinder, roundedRectangle } = jscad.primitives
const { extrudeLinear } = jscad.extrusions
const { translate } = jscad.transforms

export function main (v) {
  const shaft = translate([0, 0, v.thick], v.motors.motorParts(v.motors.motorModel('17HS4401'), v.ops).shaft)
  const bar = translate([v.length / 2, 0, 0], extrudeLinear({ height: v.thick }, roundedRectangle({ size: [v.length + v.bar, v.bar], roundRadius: v.corner, segments: v.segments })))
  const holes = [v.r1, v.r2].map((r) => cylinder({ radius: v.hole / 2, height: v.thick + 1, center: [r, 0, v.thick / 2], segments: v.segments }))
  return v.ops.union(v.ops.subtract(bar, holes), shaft)
}
