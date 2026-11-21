// Kailh Choc v1 switch on a circuit board (no plate), simplified, for an assembly's fit checks: the bottom housing on
// the board, the wider top housing, the stem's two posts, and the centre post down into its hole. The board's top is
// z = 0. Not printed.
import jscad from '@jscad/modeling'
const { cuboid, cylinder } = jscad.primitives
const { union } = jscad.booleans
const { translate } = jscad.transforms

export function main (v) {
  const box = (w, d, z0, z1, x = 0) => translate([x, 0, (z0 + z1) / 2], cuboid({ size: [w, d, z1 - z0] }))
  const housing = union(box(v.bottom, v.bottom, 0, v.bottom_h), box(v.choc.pcb_body, v.choc.pcb_body, v.bottom_h, v.housing_top))
  const stem = union(...[-1, 1].map((s) => box(v.post_w, v.post_d, v.housing_top, v.stem_top, s * v.post_x)))
  const post = translate([0, 0, -v.post_below / 2], cylinder({ radius: v.centre_d / 2, height: v.post_below, segments: v.smooth }))
  return { housing, stem, post }
}
