// A 0.1 in female socket strip, its pins along y: the body on the board it's soldered into, the pins down through that
// board (and any under it). The board's top is z = 0. Not printed: a reference for an assembly.
import jscad from '@jscad/modeling'
const { cuboid } = jscad.primitives
const { translate } = jscad.transforms
const { union } = jscad.booleans

export function main (v) {
  const ys = Array.from({ length: v.pins }, (_, i) => (i - (v.pins - 1) / 2) * v.pitch)
  const body = translate([0, 0, v.height / 2], cuboid({ size: [v.pitch, v.pins * v.pitch, v.height] }))
  const pins = union(...ys.map((y) => translate([0, y, -v.below / 2], cuboid({ size: [v.pin, v.pin, v.below] }))))
  return { body, pins }
}
