// The lid: the body's outline as a plate with a snap pin standing at each socket, drawn mirrored in x so that, turned
// over about y onto the body, the pins drop into the sockets. A window over the grip pocket shows the bow at work.
import jscad from '@jscad/modeling'
const { polygon, cuboid } = jscad.primitives
const { extrudeLinear } = jscad.extrusions
const { translate, mirrorX } = jscad.transforms

export function main (v) {
  const b = v.body, front = b.col1 + b.wall_t
  const outline = polygon({ points: [[b.back, b.grip_bottom], [b.grip_front, b.grip_bottom], [b.grip_front, b.guard_bottom], [b.guard_front, b.guard_bottom], [b.guard_front, b.receiver_bottom], [front, b.receiver_bottom], [front, 0 - b.barrel_h], [b.muzzle, 0 - b.barrel_h], [b.muzzle, b.barrel_h], [front, b.barrel_h], [front, b.top], [b.back, b.top]] })
  const plate = extrudeLinear({ height: v.thickness }, outline)
  const pins = [[b.pin_a, b.pin_a_y], [b.pin_b, b.pin_b_y], [b.pin_c, b.pin_c_y], [b.pin_d, b.pin_d_y]].map(([x, y]) => translate([x, y, v.thickness - v.foot], v.flexures.snapPin({ diameter: v.pin, length: v.length, lip: v.lip, slot: v.slot, gap: v.slot_gap, head: 0 })))
  const window = cuboid({ center: [0 - b.travel_max / 2, (b.grip_bottom + b.tip_y) / 2, v.thickness / 2], size: [v.window, b.tip_y - b.grip_bottom - 2 * v.window, v.thickness + 2] })
  return mirrorX(v.ops.subtract(v.ops.union(plate, ...pins), window))
}
