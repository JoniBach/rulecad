// Two pins on a plain plate, with the four holes that bolt it to the stand's front.
import jscad from '@jscad/modeling'
const { cylinder, roundedRectangle } = jscad.primitives
const { extrudeLinear } = jscad.extrusions

export function main (v) {
  const plate = extrudeLinear({ height: v.plate }, roundedRectangle({ size: [v.wide, v.tall], roundRadius: v.corner, segments: v.segments }))
  const pin = (x) => v.ops.subtract(cylinder({ radius: v.pin / 2, height: v.plate + v.pin_height, center: [x, 0, (v.plate + v.pin_height) / 2], segments: v.segments }), cylinder({ radius: v.pilot / 2, height: v.pilot_depth, center: [x, 0, v.plate + v.pin_height - v.pilot_depth / 2], segments: v.segments }))
  const s = v.spacing / 2, holes = [[s, s], [s, 0 - s], [0 - s, s], [0 - s, 0 - s]].map(([x, y]) => cylinder({ radius: v.hole / 2, height: v.plate + 1, center: [x, y, v.plate / 2], segments: v.segments }))
  return v.ops.subtract(v.ops.union(plate, pin(v.pinion_x), pin(v.pinion_x + v.centre)), holes)
}
