// Bracket bench gauge arm: on top of the rig's wall (the rig's x and y; z up from its underside, which lies on the
// wall's top and on the bed), a plate over the wall and a beam reaching out from it (towards -y) past the bracket's
// load bolt. Over the bolt's head, a bore for the dial indicator's stem, slit to the end and pinched by an M4 bolt.
import jscad from '@jscad/modeling'
const { cuboid, cylinder } = jscad.primitives
const { union, subtract } = jscad.booleans
const { hull } = jscad.hulls
const { translate } = jscad.transforms

export function main (v) {
  const b = v.bench, x1c = v.x1c, t = b.arm_t, half = v.beam / 2
  const box = (x0, x1, y0, y1, z0, z1) => translate([(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], cuboid({ size: [x1 - x0, y1 - y0, z1 - z0] }))
  const chamfered = (x0, x1, y0, y1) => hull(box(x0 + x1c.chamfer, x1 - x1c.chamfer, y0 + x1c.chamfer, y1 - x1c.chamfer, 0, x1c.chamfer), box(x0, x1, y0, y1, x1c.chamfer, t))
  const column = (x, y, d) => translate([x, y, t / 2], cylinder({ radius: d / 2, height: t + x1c.fit * 2, segments: v.smooth }))
  const body = union(chamfered(v.left, v.left + b.wall_length, 0, b.wall), chamfered(v.gauge_x - half, v.gauge_x + half, v.end, b.wall))
  return subtract(body,
    column(0, b.wall / 2, v.hole5), column(b.pitch, b.wall / 2, v.hole5), // onto the wall's two top bolts
    column(v.gauge_x, 0 - b.reach, v.bore), // the indicator's stem
    box(v.gauge_x - v.slit / 2, v.gauge_x + v.slit / 2, v.end - x1c.fit, 0 - b.reach, 0 - x1c.fit, t + x1c.fit), // the slit
    v.shapes.teardropHole({ d: v.hole4, length: v.beam, at: [v.gauge_x - half, v.pinch_y, t / 2], into: '+x' }),
    v.shapes.nutPocket({ flats: v.nut4, height: v.nut4_h, hole: v.hole4, at: [v.gauge_x + half, v.pinch_y, t / 2], into: '-x' }))
}
