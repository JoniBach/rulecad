// Lever bench rig: a wall standing on a base. x along the wall (the specimen's length), y back from the wall's front
// face (the specimen bolts flat against it at y = 0 and reaches out past the wall's end), z up from the bed. Behind
// the specimen's two fixing bolts, hex pockets hold their nuts; under the top, side slots take the gauge arm's nuts.
import jscad from '@jscad/modeling'
const { cuboid, cylinder } = jscad.primitives
const { union, subtract } = jscad.booleans
const { hull } = jscad.hulls
const { translate } = jscad.transforms

export function main (v) {
  const b = v.bench, x1c = v.x1c, L = b.wall_length
  const box = (x0, x1, y0, y1, z0, z1) => translate([(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], cuboid({ size: [x1 - x0, y1 - y0, z1 - z0] }))
  // The base, its bottom edges chamfered; the wall; a gusset at each end, a triangle behind the wall
  const base = hull(box(v.left + x1c.chamfer, v.left + L - x1c.chamfer, x1c.chamfer, b.base - x1c.chamfer, 0, x1c.chamfer),
    box(v.left, v.left + L, 0, b.base, x1c.chamfer, b.base_t))
  const wall = box(v.left, v.left + L, 0, b.wall, 0, v.height)
  // Each gusset: a triangle behind the wall, the hull of a sliver up the wall and a sliver along the base
  const gusset = (x0) => hull(box(x0, x0 + v.gusset_t, b.wall, b.wall + x1c.layer, b.base_t, b.base_t + v.gusset),
    box(x0, x0 + v.gusset_t, b.wall, b.wall + v.gusset, b.base_t, b.base_t + x1c.layer))
  const gussets = [gusset(v.left), gusset(v.left + L - v.gusset_t)]
  const body = union(base, wall, ...gussets)

  const cuts = [0, b.pitch].flatMap((x) => [
    // The specimen's fixing bolt, through the wall, and its nut's pocket in the back
    v.shapes.teardropHole({ d: v.hole5, length: v.through, at: [x, 0, b.bolt_z], into: '+y' }),
    v.shapes.nutPocket({ flats: v.nut5, height: v.nut5_h, hole: v.hole5, at: [x, b.wall, b.bolt_z], into: '-y' }),
    // The gauge arm's bolt, down from the top, and the slot its nut slides into from the back
    translate([x, b.wall / 2, (v.top_z - v.nut5_h + v.height + x1c.fit) / 2], cylinder({ radius: v.hole5 / 2, height: v.height + x1c.fit - v.top_z + v.nut5_h, segments: v.smooth })),
    v.shapes.wallOpening({ width: v.nut5_corner, height: v.nut5_h, depth: v.slot_depth, at: [x, b.wall, v.top_z], into: '-y', bridge: x1c.bridge })
  ])
  return subtract(body, ...cuts)
}
