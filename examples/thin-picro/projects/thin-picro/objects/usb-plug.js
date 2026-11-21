// A USB-C cable's plug, plugged in: its overmould out from the socket's mouth along +y. The mouth's centre is the
// origin, at the socket's mid-height. Not printed: a reference to check the cable's room.
import jscad from '@jscad/modeling'
const { roundedCuboid } = jscad.primitives
const { translate } = jscad.transforms

export function main (v) {
  return { plug: translate([0, v.reach / 2, 0], roundedCuboid({ size: [v.width, v.reach, v.height], roundRadius: v.round, segments: v.smooth })) }
}
