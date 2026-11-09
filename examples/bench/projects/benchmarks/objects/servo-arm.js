// A flat arm with a slot along its middle: the horn screws through it wherever its holes fall, so any horn fits.
import jscad from '@jscad/modeling'
const { cuboid, cylinder, roundedRectangle } = jscad.primitives
const { extrudeLinear } = jscad.extrusions
const { translate } = jscad.transforms

export function main (v) {
  const span = v.length + v.tail
  const bar = translate([(v.length - v.tail) / 2, 0, 0], extrudeLinear({ height: v.thick }, roundedRectangle({ size: [span, v.bar], roundRadius: v.corner, segments: v.segments })))
  const slot = cuboid({ size: [2 * v.slot_to, v.slot, v.thick + 1], center: [0, 0, v.thick / 2] })
  const holes = [v.r1, v.r2, v.r3].map((r) => cylinder({ radius: v.hole / 2, height: v.thick + 1, center: [r, 0, v.thick / 2], segments: v.segments }))
  return v.ops.subtract(bar, slot, cylinder({ radius: v.middle / 2, height: v.thick + 1, center: [0, 0, v.thick / 2], segments: v.segments }), holes)
}
