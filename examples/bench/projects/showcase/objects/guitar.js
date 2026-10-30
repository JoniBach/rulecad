// Guitar hanger: the optimiser's surface for the showcase's guitar problem, its screw bosses and arm pads made exact,
// with a screw hole through each boss. Print coordinates, as optimised: lying on its back, the wall side on the bed.
import jscad from '@jscad/modeling'
const { cylinder } = jscad.primitives

export function main (v) {
  const result = v.problems[v.problem], solid = v.shapes.optimisedSolid(result, { ops: v.ops, segments: v.smooth })
  const bosses = result.regions.keep.filter((k) => k.r != null) // the round keeps are the screw bosses
  const holes = bosses.map((k) => cylinder({ radius: v.screw / 2, height: k.length + 2, center: [k.at[0], k.at[1], k.at[2]], segments: v.smooth }))
  return v.ops.subtract(solid, ...holes)
}
