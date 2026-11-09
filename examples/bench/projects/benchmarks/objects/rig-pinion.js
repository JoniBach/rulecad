// The pinion standing on a lever as wide as its tips, the lever running along -x, away from the wheel.
import jscad from '@jscad/modeling'
const { cylinder, roundedRectangle } = jscad.primitives
const { extrudeLinear } = jscad.extrusions
const { translate } = jscad.transforms

export function main (v) {
  const gear = translate([0, 0, v.lever_t], v.gears.spur({ module: v.module, teeth: v.teeth, shift: v.shift, width: v.width, backlash: v.backlash, chamfer: 0 }))
  const bar = translate([0 - v.reach / 2, 0, 0], extrudeLinear({ height: v.lever_t }, roundedRectangle({ size: [v.reach + v.bar, v.bar], roundRadius: v.corner, segments: v.segments })))
  const holes = [v.r1, v.r2, v.r3].map((r) => cylinder({ radius: v.hole / 2, height: v.lever_t + 1, center: [0 - r, 0, v.lever_t / 2], segments: v.segments }))
  return v.ops.subtract(v.ops.union(bar, gear), holes, cylinder({ radius: v.bore / 2, height: 2 * (v.lever_t + v.width), center: [0, 0, 0], segments: v.segments }))
}
