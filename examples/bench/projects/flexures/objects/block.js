// Nothing is printed here: the block the folding tray holds, to check the walls stand clear of it.
import jscad from '@jscad/modeling'
const { cuboid } = jscad.primitives

export function main (v) { return cuboid({ size: [v.side, v.side, v.height], center: [0, 0, v.height / 2] }) }
