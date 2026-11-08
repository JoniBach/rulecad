// The spool shaft: the second stage's gear, the ratchet wheel over it, and the strap's spool with its flanges on top.
import jscad from '@jscad/modeling'
const { cylinder } = jscad.primitives
const { translate } = jscad.transforms

export function main (v) {
  const gear = v.gears.herringbone({ module: v.module, teeth: v.teeth, width: v.width, helix: v.helix, hand: 'left', bore: v.bore })
  const up = v.width + v.gap, top = up + v.ratchet_width
  const ratchet = translate([0, 0, up], v.flexures.ratchetWheel({ teeth: v.ratchet_teeth, radius: v.ratchet_radius, height: v.ratchet_height, width: v.ratchet_width, pin: v.bore }))
  const spacer = cylinder({ radius: v.spool, height: v.gap, center: [0, 0, v.width + v.gap / 2] })
  const spool = cylinder({ radius: v.spool, height: v.spool_height, center: [0, 0, top + v.spool_height / 2] })
  const flanges = [top + v.flange_thick / 2, top + v.spool_height - v.flange_thick / 2].map((z) => cylinder({ radius: v.flange, height: v.flange_thick, center: [0, 0, z] }))
  const hole = cylinder({ radius: v.bore / 2, height: top + v.spool_height, center: [0, 0, (top + v.spool_height) / 2] })
  return v.ops.subtract(v.ops.union(gear, spacer, ratchet, spool, ...flanges), hole)
}
