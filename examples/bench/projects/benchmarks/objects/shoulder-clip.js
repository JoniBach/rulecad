// A flat tab: its nose goes in over the flange, its hole on the post.
import jscad from '@jscad/modeling'
const { cylinder, roundedRectangle } = jscad.primitives
const { extrudeLinear } = jscad.extrusions
const { translate } = jscad.transforms

export function main (v) {
  const hole = v.fixings.holeModel('M3', { depth: v.thick }).diameter // the M3 screw's clearance hole, from v.fixings
  const tab = translate([(v.back - v.reach) / 2, 0, 0], extrudeLinear({ height: v.thick }, roundedRectangle({ size: [v.reach + v.back, v.wide], roundRadius: v.corner, segments: v.segments })))
  return v.ops.subtract(tab, cylinder({ radius: hole / 2, height: v.thick + 1, center: [0, 0, v.thick / 2], segments: v.segments }))
}
