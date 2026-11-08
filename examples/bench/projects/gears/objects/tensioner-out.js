// The spool shaft: the second stage's gear, the ratchet wheel over it, and the strap's spool with its flanges on top.
import jscad from '@jscad/modeling'
const { cylinder } = jscad.primitives
const { translate } = jscad.transforms

export function main (v) {
  const gear = v.gears.herringbone({ module: v.module, teeth: v.teeth, width: v.width, helix: v.helix, hand: 'left', bore: v.bore })
  const up = v.width + v.gap, top = up + v.ratchet_width
  const ratchet = translate([0, 0, up], v.flexures.ratchetWheel({ teeth: v.ratchet_teeth, radius: v.ratchet_radius, height: v.ratchet_height, width: v.ratchet_width, pin: v.bore }))
  const spacer = cylinder({ radius: v.ratchet_radius, height: v.gap, center: [0, 0, v.width + v.gap / 2] }) // (under the whole ratchet: its teeth don't overhang)
  const spool = cylinder({ radius: v.spool, height: v.spool_height, center: [0, 0, top + v.spool_height / 2] })
  // the bottom flange sits on the ratchet; the top one's underside slants in at 45° to the spool, so it prints unsupported
  const lip = v.flange - v.spool, z1 = top + v.spool_height - v.flange_thick
  const flanges = [cylinder({ radius: v.flange, height: v.flange_thick, center: [0, 0, top + v.flange_thick / 2] }),
    cylinder({ radius: v.flange, height: v.flange_thick, center: [0, 0, z1 + v.flange_thick / 2] }),
    jscad.primitives.cylinderElliptic({ startRadius: [v.spool, v.spool], endRadius: [v.flange, v.flange], height: lip, center: [0, 0, z1 - lip / 2] })]
  const hole = cylinder({ radius: v.bore / 2, height: top + v.spool_height, center: [0, 0, (top + v.spool_height) / 2] })
  return v.ops.subtract(v.ops.union(gear, spacer, ratchet, spool, ...flanges), hole)
}
