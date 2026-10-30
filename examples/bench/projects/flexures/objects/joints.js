// Joints that aren't flexures, for comparison: a pin joint printed in place (a pin on a base, a lever on a ring round
// it, a cap over it, all a support gap apart, so it breaks free with a twist), and a snap pin standing beside the
// socket it clicks into. Three named parts: the base with the pin and the socket, the lever, and the peg.
import jscad from '@jscad/modeling'
const { translate } = jscad.transforms

export function main (v) {
  const f = v.flexures
  const joint = { pin: v.pin, width: v.height, clearance: v.clearance, lift: v.lift, lip: v.lip, ring: v.ring, arm: v.arm, base: v.base }
  const socket = translate([v.socket_at, 0, 0], f.snapSocket({ diameter: v.peg, depth: v.depth, clearance: v.clearance, wall: v.wall }))
  const near = v.socket_at - v.peg / 2 - v.clearance - v.wall + v.overlap // the socket's near face, a little in
  const bridge = jscad.primitives.cuboid({ center: [near / 2, 0, v.base / 2], size: [near, 2 * v.wall, v.base] }) // joins the base to the socket, stopping at its wall so the hole stays open
  return {
    base: v.ops.union(f.pinJoint(joint, 'pin'), socket, bridge),
    lever: f.pinJoint(joint, 'ring'),
    peg: translate([v.peg_at, 0, 0], f.snapPin({ diameter: v.peg, length: v.depth, lip: v.barb, slot: v.slot, gap: v.slot_gap, lead: v.lead, back: v.back }))
  }
}
