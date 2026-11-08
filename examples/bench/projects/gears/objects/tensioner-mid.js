// The middle shaft: the first stage's gear below, the second stage's pinion above, on one hub.
import jscad from '@jscad/modeling'
const { cylinder } = jscad.primitives
const { translate } = jscad.transforms

export function main (v) {
  const gear = v.gears.herringbone({ module: v.module, teeth: v.teeth, width: v.width, helix: v.helix, hand: 'left', bore: v.bore })
  const pinion = translate([0, 0, v.width + v.gap], v.gears.herringbone({ module: v.module, teeth: v.pinion, width: v.width, helix: v.helix, bore: v.bore }))
  const hub = v.ops.subtract(cylinder({ radius: v.hub / 2, height: v.gap, center: [0, 0, v.width + v.gap / 2] }), cylinder({ radius: v.bore / 2, height: v.gap, center: [0, 0, v.width + v.gap / 2] }))
  return v.ops.union(gear, hub, pinion)
}
