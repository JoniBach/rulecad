// The box's lid: a plate as wide and deep as the box (box.json), with a clearance hole over each of its corner posts.
// The holes come from v.fixings, named by the thread, at the places box.js puts the screws.
import jscad from '@jscad/modeling'
import { corners } from './box.js'
const { cuboid } = jscad.primitives

export function main (v) {
  const plate = cuboid({ size: [v.box.width, v.box.depth, v.thick], center: [0, 0, v.thick / 2] })
  const holes = corners(v.box.width, v.box.depth, v.box.inset).map(([x, y]) => v.fixings.hole('M3', { depth: v.thick, at: [x, y, v.thick] }))
  return v.ops.subtract(plate, ...holes)
}
