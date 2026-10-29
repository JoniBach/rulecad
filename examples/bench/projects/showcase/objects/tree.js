// Tree stand: the optimiser's surface for the showcase's tree problem, its plate and feet made exact.
// Print coordinates, as optimised: standing on its feet, z up.
import jscad from '@jscad/modeling'

export function main (v) {
  return v.shapes.optimisedSolid(v.problems[v.problem], { ops: v.ops, segments: v.smooth })
}
