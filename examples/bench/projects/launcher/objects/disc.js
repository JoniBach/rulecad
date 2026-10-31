// The disc: a flat cylinder with a chamfer round its bed edge and a shallow dimple in its top face. Printed flat, six
// at a time. The rim is what the launcher pushes and what rolls along the lid, so it is drawn with many segments.
import jscad from '@jscad/modeling'
const { cylinder, cylinderElliptic } = jscad.primitives
const { translate } = jscad.transforms

export function main (v) {
  const r = v.diameter / 2, c = v.chamfer
  const base = cylinderElliptic({ height: c, startRadius: [r - c, r - c], endRadius: [r, r], center: [0, 0, c / 2], segments: v.smooth })
  const body = cylinder({ radius: r, height: v.thickness - c, center: [0, 0, c + (v.thickness - c) / 2], segments: v.smooth })
  const dimple = cylinder({ radius: v.dimple / 2, height: v.dimple_depth * 2, center: [0, 0, v.thickness], segments: v.smooth })
  return v.ops.subtract(v.ops.union(base, body), translate([0, 0, 0], dimple))
}
