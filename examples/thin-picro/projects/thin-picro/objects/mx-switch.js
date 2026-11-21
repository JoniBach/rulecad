// Cherry MX switch on a circuit board (PCB mount, no plate), simplified, for an assembly's fit checks: the bottom
// housing on the board, the top housing tapering up from where a plate would hold it, the stem's cross, and the centre
// post down into its hole. The board's top is z = 0. Not printed.
import jscad from '@jscad/modeling'
const { cuboid, rectangle, cylinder } = jscad.primitives
const { union } = jscad.booleans
const { translate } = jscad.transforms
const { hull } = jscad.hulls
const { extrudeLinear } = jscad.extrusions

export function main (v) {
  const square = (width, z) => translate([0, 0, z], extrudeLinear({ height: v.sliver }, rectangle({ size: [width, width] })))
  const bottom = translate([0, 0, v.plate_at / 2], cuboid({ size: [v.mx.cutout, v.mx.cutout, v.plate_at] }))
  const top = hull(square(v.mx.housing, v.plate_at), square(v.mx.housing_top, v.housing_top - v.sliver))
  const arm = (x, y) => translate([0, 0, v.housing_top + v.mx.stem_height / 2], cuboid({ size: [x, y, v.mx.stem_height] }))
  const post = translate([0, 0, -v.post_below / 2], cylinder({ radius: v.post_d / 2, height: v.post_below, segments: v.smooth }))
  return { housing: union(bottom, top), stem: union(arm(v.mx.stem, v.mx.stem_arm_h), arm(v.mx.stem_arm_v, v.mx.stem)), post }
}
