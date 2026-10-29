// Twisted tube: the optimiser's surface for the showcase's twist problem, its rings and shaft hole made exact.
// Print coordinates, as optimised: standing on its bottom ring, z up.
import jscad from '@jscad/modeling'

export function main (v) {
  return v.shapes.optimisedSolid(v.problems[v.problem], { ops: v.ops, segments: v.smooth })
}
