// NAME. Every measurement is a variable in NAME.json; this file only says how they combine.
// Z is up and the bed is z = 0: build the shape the way it will print.
import jscad from '@jscad/modeling'
const { cuboid } = jscad.primitives
const { translate } = jscad.transforms

export function main (v) {
  return translate([0, 0, v.height / 2], cuboid({ size: [v.width, v.depth, v.height] }))
}
