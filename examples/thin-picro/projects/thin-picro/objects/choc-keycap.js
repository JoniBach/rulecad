// A low-profile Choc keycap, simplified, for an assembly: a slab with rounded corners, its underside on the stem's top
// at rest. The cap's underside is z = 0. Not printed here.
import jscad from '@jscad/modeling'
const { roundedCuboid } = jscad.primitives
const { translate } = jscad.transforms

export function main (v) {
  return { cap: translate([0, 0, v.thickness / 2], roundedCuboid({ size: [v.width, v.depth, v.thickness], roundRadius: v.corner, segments: v.smooth })) }
}
