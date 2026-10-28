// Bracket bench, brackets B and C: the optimiser's surface for the bench's problem, its pads, boss and holes made
// exact. Print coordinates, as optimised: z up from the bed.
export function main (v) {
  return v.shapes.optimisedSolid(v.problems[v.problem], { ops: v.ops, segments: v.smooth })
}
