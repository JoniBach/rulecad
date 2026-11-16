// Lever bench specimen A: a plain bar, the envelope's length, its width whatever makes its volume the target (after
// the three bolt holes), centred on the bolts' line. Flat on the bed, z up.
import jscad from '@jscad/modeling'
const { rectangle, circle } = jscad.primitives
const { subtract } = jscad.booleans
const { extrudeLinear } = jscad.extrusions

export function main (v) {
  // The bolts' holes, as radii: the two M5 fixing bolts and the M4 load bolt, their clearance holes from v.fixings
  const hole5 = v.fixings.holeModel('M5').diameter / 2, hole4 = v.fixings.holeModel('M4').diameter / 2
  const b = v.bench, holes = Math.PI * (hole5 * hole5 * 2 + hole4 * hole4)
  const width = (v.target / b.thickness + holes) / b.length
  const outline = subtract(
    rectangle({ center: [b.length / 2 - b.behind, 0], size: [b.length, width] }),
    circle({ center: [0, 0], radius: hole5, segments: v.smooth }),
    circle({ center: [b.pitch, 0], radius: hole5, segments: v.smooth }),
    circle({ center: [b.span, 0], radius: hole4, segments: v.smooth })
  )
  return extrudeLinear({ height: b.thickness }, outline)
}
