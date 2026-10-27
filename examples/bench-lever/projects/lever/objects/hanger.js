// Lever bench hanger: a strap with round ends, the load bolt's hole at the top (the origin) and an eye at the bottom.
// Flat on the bed, z up; y up the strap as it hangs.
import jscad from '@jscad/modeling'
const { circle } = jscad.primitives
const { subtract } = jscad.booleans
const { hull } = jscad.hulls
const { extrudeLinear } = jscad.extrusions

export function main (v) {
  const b = v.bench, r = b.hanger_w / 2, round = (y, radius) => circle({ center: [0, y], radius, segments: v.smooth })
  const strap = hull(round(0, r), round(0 - b.hanger_l, b.eye + r))
  return extrudeLinear({ height: b.thickness }, subtract(strap, round(0, v.hole4 / 2), round(0 - b.hanger_l, b.eye)))
}
