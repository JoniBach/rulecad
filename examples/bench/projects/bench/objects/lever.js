// Lever bench specimens C and D: the optimiser's outline for the bench's problem, its bosses and holes made exact,
// extruded to the bench's thickness. Flat on the bed, z up.
import jscad from '@jscad/modeling'
const { extrudeLinear } = jscad.extrusions

export function main (v) {
  return extrudeLinear({ height: v.bench.thickness }, v.shapes.optimisedOutline(v.problems[v.problem]))
}
