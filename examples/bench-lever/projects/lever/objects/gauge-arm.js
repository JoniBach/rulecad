// Lever bench gauge arm: a bar on top of the rig's wall (in the rig's x and y; z up from its underside, which lies on
// the wall's top and on the bed), reaching past the load bolt. Over the load bolt's head, a bore for the dial
// indicator's stem, slit to the end and pinched shut by an M4 bolt across the slit.
import jscad from '@jscad/modeling'
const { cuboid, cylinder } = jscad.primitives
const { subtract } = jscad.booleans
const { hull } = jscad.hulls
const { translate } = jscad.transforms

export function main (v) {
  const b = v.bench, x1c = v.x1c, t = b.arm_t, back = b.wall
  const box = (x0, x1, y0, y1, z0, z1) => translate([(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], cuboid({ size: [x1 - x0, y1 - y0, z1 - z0] }))
  const column = (x, y, d) => translate([x, y, t / 2], cylinder({ radius: d / 2, height: t + x1c.fit * 2, segments: v.smooth }))
  // The bar, its bottom edges chamfered
  const bar = hull(box(v.left + x1c.chamfer, v.end - x1c.chamfer, v.front + x1c.chamfer, back - x1c.chamfer, 0, x1c.chamfer),
    box(v.left, v.end, v.front, back, x1c.chamfer, t))
  return subtract(bar,
    column(0, b.wall / 2, v.hole5), column(b.pitch, b.wall / 2, v.hole5), // onto the wall's two top bolts
    column(b.span, v.gauge_y, v.bore), // the indicator's stem
    box(b.span, v.end + x1c.fit, v.gauge_y - v.slit / 2, v.gauge_y + v.slit / 2, 0 - x1c.fit, t + x1c.fit), // the slit
    v.shapes.teardropHole({ d: v.hole4, length: v.through, at: [v.pinch_x, v.front, t / 2], into: '+y' }),
    v.shapes.nutPocket({ flats: v.nut4, height: v.nut4_h, hole: v.hole4, at: [v.pinch_x, back, t / 2], into: '-y' }))
}
