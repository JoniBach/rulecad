// The frame as it prints: a base with a hole for each shaft's rod, and the post the pawl stands on.
import jscad from '@jscad/modeling'
const { cuboid, cylinder } = jscad.primitives

export function main (v) {
  const base = cuboid({ size: [v.length, v.wide, v.thick], center: [v.start + v.length / 2, 0, v.thick / 2] })
  const post = cuboid({ size: [v.post, v.post, v.post_height], center: [v.post_x, v.post_y, v.thick + v.post_height / 2] })
  const holes = [0, v.mid_x, v.out_x].map((x) => cylinder({ radius: v.rod / 2, height: v.thick, center: [x, 0, v.thick / 2] }))
  return v.ops.subtract(v.ops.union(base, post), ...holes)
}
