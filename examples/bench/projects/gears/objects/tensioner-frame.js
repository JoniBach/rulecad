// The frame as it prints: a base, the three shafts standing on it as pins the gears turn on, and the post the pawl
// stands on.
import jscad from '@jscad/modeling'
const { cuboid, cylinder } = jscad.primitives

export function main (v) {
  const base = cuboid({ size: [v.length, v.wide, v.thick], center: [v.start + v.length / 2, 0, v.thick / 2] })
  const post = cuboid({ size: [v.post, v.post, v.post_height], center: [v.post_x, v.post_y, v.thick + v.post_height / 2] })
  const pins = [[0, v.crank_pin], [v.mid_x, v.mid_pin], [v.out_x, v.out_pin]].map(([x, h]) => cylinder({ radius: v.pin / 2, height: h, center: [x, 0, v.thick + h / 2] }))
  return v.ops.union(base, post, ...pins)
}
