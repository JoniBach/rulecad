// The arm a servo comes with, pointing along x at rest.
import jscad from '@jscad/modeling'
const { cuboid, cylinder } = jscad.primitives

export function main (v) {
  const arm = cuboid({ size: [v.reach, v.wide, v.thick], center: [v.reach / 2, 0, v.thick / 2] })
  const hub = cylinder({ radius: v.hub / 2, height: v.thick, center: [0, 0, v.thick / 2], segments: v.segments })
  return v.ops.union(arm, hub)
}
