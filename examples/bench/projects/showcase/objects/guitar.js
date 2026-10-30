// Guitar hanger: the optimiser's surface for the showcase's guitar problem, its screw bosses and arm pads made exact,
// with a screw hole through each boss and a 45° gable under each pad. Print coordinates, as optimised: lying on its back, the wall side on the bed.
import jscad from '@jscad/modeling'
const { cylinder, polygon } = jscad.primitives
const { extrudeLinear } = jscad.extrusions
const { rotateX, translate } = jscad.transforms

export function main (v) {
  const result = v.problems[v.problem], solid = v.shapes.optimisedSolid(result, { ops: v.ops, segments: v.smooth })
  const bosses = result.regions.keep.filter((k) => k.r != null) // the round keeps are the screw bosses
  const holes = bosses.map((k) => cylinder({ radius: v.screw / 2, height: k.length + 2, center: [k.at[0], k.at[1], k.at[2]], segments: v.smooth }))
  // A gable under each pad (the box keeps): two faces a touch steeper than 45° (booleans tip a 45° face by hundredths of a
  // degree) meeting at a ridge, so the pad's underside is self-supporting where the optimiser's struts meet it from one side
  const gables = result.regions.keep.filter((k) => k.size).map((k) => {
    const [x0, x1] = [k.at[0] - k.size[0] / 2, k.at[0] + k.size[0] / 2], z0 = k.at[2] - k.size[2] / 2, ridge = z0 - (k.size[0] / 2) * v.steeper
    const prism = extrudeLinear({ height: k.size[1] }, polygon({ points: [[x0, z0], [(x0 + x1) / 2, ridge], [x1, z0], [x1, z0 + 1], [x0, z0 + 1]] }))
    return translate([0, k.at[1] + k.size[1] / 2, 0], rotateX(Math.PI / 2, prism))
  })
  return v.ops.subtract(v.ops.union(solid, ...gables), ...holes)
}
