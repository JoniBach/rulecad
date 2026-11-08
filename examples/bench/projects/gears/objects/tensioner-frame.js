// The frame as little as holds it: a spine along the shafts, a boss round each pin, a foot across each end, and a
// branch out to the pawl's post. Everything stands on the bed.
import jscad from '@jscad/modeling'
const { cuboid, cylinder } = jscad.primitives

export function main (v) {
  const bar = (x0, x1, y0, y1, h) => cuboid({ size: [x1 - x0, y1 - y0, h], center: [(x0 + x1) / 2, (y0 + y1) / 2, h / 2] })
  const spine = bar(v.start, v.post_x, 0 - v.spine / 2, v.spine / 2, v.base)
  const feet = [v.start + v.foot_w / 2, v.post_x].map((x) => bar(x - v.foot_w / 2, x + v.foot_w / 2, 0 - v.foot / 2, v.foot / 2, v.base))
  const branch = bar(v.post_x - v.post / 2, v.post_x + v.post / 2, 0, v.post_y, v.base)
  const post = bar(v.post_x - v.post / 2, v.post_x + v.post / 2, v.post_y - v.post / 2, v.post_y + v.post / 2, v.thick + v.post_height)
  const shafts = [[0, v.crank_pin], [v.mid_x, v.mid_pin], [v.out_x, v.out_pin]]
  const bosses = shafts.map(([x]) => cylinder({ radius: v.boss / 2, height: v.thick, center: [x, 0, v.thick / 2] }))
  const pins = shafts.map(([x, h]) => cylinder({ radius: v.pin / 2, height: h, center: [x, 0, v.thick + h / 2] }))
  return v.ops.union(spine, ...feet, branch, post, ...bosses, ...pins)
}
