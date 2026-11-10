// A block where the scale goes: the foot stands on its top.
import jscad from '@jscad/modeling'
const { cuboid } = jscad.primitives

export function main (v) { return cuboid({ size: [v.side, v.side, v.high], center: [0, 0, v.high / 2] }) }
