// Bin: the optimiser's lattice wall, plus what's finer than its 6 mm cells: a 2 mm floor, and a ledge under the rim
// sloping in a touch steeper than 45° (booleans tip a 45° face by hundredths of a degree) so the rim prints without supports across the gaps between braces. Print coordinates: standing
// up, z up.
import jscad from '@jscad/modeling'
const { polygon, cylinder } = jscad.primitives
const { extrudeRotate } = jscad.extrusions

export function main (v) {
  const raw = v.shapes.optimisedSolid(v.problems[v.problem], { ops: v.ops, segments: v.smooth })
  const wall = raw
  const floor = cylinder({ radius: v.radius, height: v.floor, center: [0, 0, v.floor / 2], segments: v.smooth })
  const top = v.height - v.rim
  const ledge = extrudeRotate({ segments: v.smooth }, polygon({ points: [[v.inner, top], [v.radius, top - v.wall * 1.02], [v.radius, top]] }))
  return v.ops.union(wall, floor, ledge)
}
