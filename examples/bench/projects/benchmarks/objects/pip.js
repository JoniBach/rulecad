// Nothing is printed here: the planets ride on the sun and the rings. A mark for the planets' joints to hang from.
// Building it holds the posts' figures to the motor's screws, from v.fixings (pipScrews)
import jscad from '@jscad/modeling'
import { pipScrews } from './shoulder-pip-parts.js'
const { sphere } = jscad.primitives

export function main (v) {
  pipScrews(v)
  return sphere({ radius: v.r, center: [0, 0, v.far] })
}
