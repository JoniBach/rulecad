// The joint rig's nut puller (MEASURE.md, row 37), as it lies on the base beam's top face: z up from the face, x along
// the slot. A screw near one end goes into the slot nut under test; a luggage scale's hook pulls on the hole at the
// other end, along the slot. The screw's hole comes from v.fixings by the thread: an M5 clearance, which an M4 passes.
import jscad from '@jscad/modeling'
const { roundedRectangle, cylinder } = jscad.primitives
const { extrudeLinear } = jscad.extrusions
const { translate } = jscad.transforms

export function main (v) {
  const plate = extrudeLinear({ height: v.thick }, roundedRectangle({ size: [v.long, v.wide], roundRadius: v.round, segments: v.segments }))
  const hook = translate([v.hook_x, 0, v.thick / 2], cylinder({ radius: v.hook / 2, height: v.thick * 2, segments: v.segments }))
  return v.ops.subtract(plate, v.fixings.hole('M5', { depth: v.thick, at: [v.screw_x, 0, v.thick] }), hook)
}
