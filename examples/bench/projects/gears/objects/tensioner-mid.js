// The middle shaft: the first stage's gear below and the second stage's pinion above. The pinion's teeth run straight
// down through the gap onto the gear (a herringbone starts with no twist, so plain spur teeth meet it), so nothing
// overhangs as it prints.
import jscad from '@jscad/modeling'
const { cylinder } = jscad.primitives
const { translate } = jscad.transforms

export function main (v) {
  const gear = v.gears.herringbone({ module: v.module, teeth: v.teeth, width: v.width, helix: v.helix, hand: 'left', bore: v.bore })
  const foot = translate([0, 0, v.width], v.gears.spur({ module: v.module, teeth: v.pinion, width: v.gap, chamfer: 0, bore: v.bore }))
  const pinion = translate([0, 0, v.width + v.gap], v.gears.herringbone({ module: v.module, teeth: v.pinion, width: v.width, helix: v.helix, chamfer: 0, bore: v.bore }))
  return v.ops.union(gear, foot, pinion)
}
