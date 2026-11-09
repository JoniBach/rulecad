// The wheel on the bed, two small pilots in the bed face for the lever. Turned over, like the pinion, that face is outside.
import jscad from '@jscad/modeling'
const { cylinder } = jscad.primitives

export function main (v) {
  const gear = v.gears.spur({ module: v.module, teeth: v.teeth, width: v.width, backlash: v.backlash })
  const pilots = [v.bolt, 0 - v.bolt].map((x) => cylinder({ radius: v.pilot / 2, height: v.pilot_depth + 1, center: [x, 0, v.pilot_depth / 2 - 1 / 2], segments: v.segments }))
  return v.ops.subtract(gear, pilots, cylinder({ radius: v.bore / 2, height: 2 * v.width, center: [0, 0, 0], segments: v.segments }))
}
