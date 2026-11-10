// A double-arm servo horn as sold: a hub and two arms across it, a rounded tip on each.
import jscad from '@jscad/modeling'
const { cuboid, cylinder } = jscad.primitives

export function main (v) {
  const arm = cuboid({ size: [v.reach * 2, v.wide, v.thick], center: [0, 0, 0] })
  const tips = [-1, 1].map((s) => cylinder({ radius: v.wide / 2, height: v.thick, center: [s * v.reach, 0, 0], segments: v.segments }))
  const hub = cylinder({ radius: v.hub / 2, height: v.thick, center: [0, 0, 0], segments: v.segments })
  return v.ops.union(arm, ...tips, hub)
}
