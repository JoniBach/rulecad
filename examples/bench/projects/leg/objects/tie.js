// A flat bar with a hole at each end, pressed down over the tops of the rods.
import jscad from '@jscad/modeling'
const { cylinder, roundedRectangle } = jscad.primitives
const { extrudeLinear } = jscad.extrusions

export function main (v) {
  const bar = extrudeLinear({ height: v.thick }, roundedRectangle({ size: [v.long, v.width], roundRadius: v.corner, segments: v.segments }))
  const holes = [-1, 1].map((s) => cylinder({ radius: v.socket / 2, height: v.thick + 1, center: [s * v.rod_x, 0, v.thick / 2], segments: v.segments }))
  return v.ops.subtract(bar, holes)
}
