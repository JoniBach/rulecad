// The Z axis's carriage, printed standing: two LM8UU pockets and a nut trap, all going down from the top.
import jscad from '@jscad/modeling'
const { cuboid } = jscad.primitives

export function main (v) {
  const body = cuboid({ size: [v.long * 2, v.deep * 2, v.high], center: [0, 0, v.high / 2] })
  const bearing = { bore: v.rod_d, outer_diameter: v.lm_d, length: v.lm_l }
  const pockets = [-1, 1].map((s) => v.shapes.lm8uuPocket(bearing, { fit: 'press', printer: v.x1c, at: [s * v.rod_gap, 0, v.high], into: '-z', through: true }))
  const nut = { flange_diameter: v.flange, flange_thickness: v.flange_t, body_diameter: v.nut_d, length: v.nut_l, hole_circle: v.hole_c, hole_count: v.holes, hole_diameter: v.hole_d }
  const trap = v.shapes.nutTrap(nut, { printer: v.x1c, at: [0, 0, v.high], depth: v.high + 1 })
  return v.ops.subtract(body, pockets, trap)
}
