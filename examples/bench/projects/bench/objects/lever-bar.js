// Lever bench specimen A: a plain bar, the envelope's length, its width whatever makes its volume the target (after
// the three bolt holes), centred on the bolts' line. Flat on the bed, z up.
import jscad from '@jscad/modeling'
const { rectangle, circle } = jscad.primitives
const { subtract } = jscad.booleans
const { extrudeLinear } = jscad.extrusions

export function main (v) {
  const b = v.bench, holes = Math.PI * (v.hole5 * v.hole5 * 2 + v.hole4 * v.hole4)
  const width = (v.target / b.thickness + holes) / b.length
  const outline = subtract(
    rectangle({ center: [b.length / 2 - b.behind, 0], size: [b.length, width] }),
    circle({ center: [0, 0], radius: v.hole5, segments: v.smooth }),
    circle({ center: [b.pitch, 0], radius: v.hole5, segments: v.smooth }),
    circle({ center: [b.span, 0], radius: v.hole4, segments: v.smooth })
  )
  return extrudeLinear({ height: b.thickness }, outline)
}
