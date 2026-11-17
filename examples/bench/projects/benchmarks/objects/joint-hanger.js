// The joint rig's hanger (MEASURE.md, rows 34 to 36): a plate on the free end of a rig beam, in the end's frame (z out of
// the end, y up the beam's section). Its top edge is the beam's top, for the dial's plunger; under the beam, the hook's
// hole. One M5 screw into the beam's tapped end bore holds it: its hole comes from v.fixings by the thread.
import jscad from '@jscad/modeling'
const { roundedRectangle, cylinder } = jscad.primitives
const { extrudeLinear } = jscad.extrusions
const { translate } = jscad.transforms

export function main (v) {
  const top = v.wide / 2, bottom = -v.wide / 2 - v.below, tall = top - bottom
  const plate = translate([0, (top + bottom) / 2, 0], extrudeLinear({ height: v.thick }, roundedRectangle({ size: [v.wide, tall], roundRadius: v.round, segments: v.segments })))
  const hook = translate([0, v.hook_y, v.thick / 2], cylinder({ radius: v.hook / 2, height: v.thick * 2, segments: v.segments }))
  return v.ops.subtract(plate, v.fixings.hole('M5', { depth: v.thick, at: [0, 0, v.thick] }), hook)
}
