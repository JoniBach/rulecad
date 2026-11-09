// A flat tab: its nose goes in over the flange, its hole on the post.
import jscad from '@jscad/modeling'
const { cylinder, roundedRectangle } = jscad.primitives
const { extrudeLinear } = jscad.extrusions
const { translate } = jscad.transforms

export function main (v) {
  const tab = translate([(v.back - v.reach) / 2, 0, 0], extrudeLinear({ height: v.thick }, roundedRectangle({ size: [v.reach + v.back, v.wide], roundRadius: v.corner, segments: v.segments })))
  return v.ops.subtract(tab, cylinder({ radius: v.hole / 2, height: v.thick + 1, center: [0, 0, v.thick / 2], segments: v.segments }))
}
