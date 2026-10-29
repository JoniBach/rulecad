// Bin: the optimiser's lattice wall, plus what's finer than its 6 mm cells: a 2 mm floor, and a ledge under the rim
// sloping in at 45° so the rim prints without supports across the gaps between braces. Print coordinates: standing
// up, z up.
import jscad from '@jscad/modeling'
const { polygon, cylinder } = jscad.primitives
const { extrudeRotate } = jscad.extrusions
const { scale } = jscad.transforms

export function main (v) {
  const raw = v.shapes.optimisedSolid(v.problems[v.problem], { ops: v.ops, segments: v.smooth })
  // Round faces: drawn from cubes, the wall's round faces become flat blocks wherever the circle runs along a row of
  // cells. Scaled about the axis a cell's width out and in (which keeps each brace's angle and height) and cut back to
  // the exact wall, every brace reaches the true round faces inside and out.
  const out = (v.radius + v.cell) / v.radius, inward = (v.inner - v.cell) / v.inner
  const grown = v.ops.union(raw, scale([out, out, 1], raw), scale([inward, inward, 1], raw))
  const shell = v.ops.subtract(cylinder({ radius: v.radius, height: v.height, center: [0, 0, v.height / 2], segments: v.smooth }),
    cylinder({ radius: v.inner, height: v.height * 2, center: [0, 0, v.height / 2], segments: v.smooth }))
  const wall = v.ops.intersect(grown, shell)
  const floor = cylinder({ radius: v.radius, height: v.floor, center: [0, 0, v.floor / 2], segments: v.smooth })
  const top = v.height - v.rim
  const ledge = extrudeRotate({ segments: v.smooth }, polygon({ points: [[v.inner, top], [v.radius, top - v.wall], [v.radius, top]] }))
  return v.ops.union(wall, floor, ledge)
}
