// Nothing is printed here: the planets ride on the sun and the rings. A mark for the planets' joints to be on.
import jscad from '@jscad/modeling'
const { sphere } = jscad.primitives

export function main (v) { return sphere({ radius: v.r, center: [0, 0, v.far] }) }
