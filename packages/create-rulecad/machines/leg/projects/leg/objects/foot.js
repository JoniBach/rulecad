// A block with a rod's socket in the top and a bolt through each end.
import jscad from '@jscad/modeling'
const { cylinder, roundedRectangle } = jscad.primitives
const { extrudeLinear } = jscad.extrusions

export function main (v) {
  const block = extrudeLinear({ height: v.thick }, roundedRectangle({ size: [v.long, v.wide], roundRadius: v.corner, segments: v.segments }))
  const socket = cylinder({ radius: v.socket / 2, height: v.depth + 1, center: [0, 0, v.thick - v.depth + (v.depth + 1) / 2], segments: v.segments })
  const bolts = [-1, 1].map((s) => cylinder({ radius: v.bolt / 2, height: v.thick + 1, center: [s * v.bolt_x, 0, v.thick / 2], segments: v.segments }))
  return v.ops.subtract(block, socket, bolts)
}
