// Bracket bench gauge arm: on top of the rig's wall (the rig's x and y; z up from its underside, which lies on the
// wall's top and on the bed), a plate over the wall and a beam reaching out from it (towards -y) past the bracket's
// load bolt. Over the bolt's head, a bore for the dial indicator's stem, slit to the end and pinched by an M4 bolt.
// The bolts' holes and the M4 nut's pocket come from v.fixings, named by the thread: no screw size is typed.
import jscad from '@jscad/modeling'
const { cuboid, cylinder } = jscad.primitives
const { union, subtract } = jscad.booleans
const { hull } = jscad.hulls
const { translate } = jscad.transforms

export function main (v) {
  const b = v.bench, x1c = v.x1c, t = b.arm_t, half = v.beam / 2
  // M5 bolts down onto the wall, the M4 pinch bolt across the slit and its nut's pocket (the nut and two layers)
  const hole5 = v.fixings.holeModel('M5', { depth: t }).diameter, hole4 = v.fixings.holeModel('M4', { depth: v.beam }).diameter
  const pocket = v.fixings.nutPocketModel('M4'), nut4 = pocket.flats, nut4_h = pocket.depth
  const box = (x0, x1, y0, y1, z0, z1) => translate([(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], cuboid({ size: [x1 - x0, y1 - y0, z1 - z0] }))
  const chamfered = (x0, x1, y0, y1) => hull(box(x0 + x1c.chamfer, x1 - x1c.chamfer, y0 + x1c.chamfer, y1 - x1c.chamfer, 0, x1c.chamfer), box(x0, x1, y0, y1, x1c.chamfer, t))
  const column = (x, y, d) => translate([x, y, t / 2], cylinder({ radius: d / 2, height: t + x1c.fit * 2, segments: v.smooth }))
  const body = union(chamfered(v.left, v.left + b.wall_length, 0, b.wall), chamfered(v.gauge_x - half, v.gauge_x + half, v.end, b.wall))
  return subtract(body,
    column(0, b.wall / 2, hole5), column(b.pitch, b.wall / 2, hole5), // onto the wall's two top bolts
    column(v.gauge_x, 0 - b.reach, v.bore), // the indicator's stem
    box(v.gauge_x - v.slit / 2, v.gauge_x + v.slit / 2, v.end - x1c.fit, 0 - b.reach, 0 - x1c.fit, t + x1c.fit), // the slit
    v.shapes.teardropHole({ d: hole4, length: v.beam, at: [v.gauge_x - half, v.pinch_y, t / 2], into: '+x' }),
    v.shapes.nutPocket({ flats: nut4, height: nut4_h, hole: hole4, at: [v.gauge_x + half, v.pinch_y, t / 2], into: '-x' }))
}
