// Bracket bench, brackets B, C and D: the optimiser's surface for the bench's problem, its pads, boss and holes made
// exact. Print coordinates, as optimised (z up from the bed) or, with side, laid on its side: the problem's y turned
// up and its bottom edge (y = -bracket_h / 2) put on the bed.
import jscad from '@jscad/modeling'
const { rotateX, translate } = jscad.transforms

export function main (v) {
  const solid = v.shapes.optimisedSolid(v.problems[v.problem], { ops: v.ops, segments: v.smooth })
  return v.side ? translate([0, 0, v.bench.bracket_h / 2], rotateX(Math.PI / 2, solid)) : solid
}
