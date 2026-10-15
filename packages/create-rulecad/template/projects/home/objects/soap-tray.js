// A soap tray: a shallow box with ribs across the floor to hold the soap up, and drain slots between them.
// Every measurement is a variable in soap-tray.json; this file only says how they combine. Z is up, the bed is z = 0.
import jscad from '@jscad/modeling'
const { cuboid } = jscad.primitives
const { translate } = jscad.transforms
const { subtract, union } = jscad.booleans

// A box sitting on z = z0, centred in x and y
const box = (x, y, z0, h, cx = 0) => translate([cx, 0, z0 + h / 2], cuboid({ size: [x, y, h] }))

export function main (v) {
  const inside = [v.length - v.wall * 2, v.width - v.wall * 2]
  const count = Math.floor(inside[0] / v.pitch) // ribs, centred along the length
  const at = (i) => (i - (count - 1) / 2) * v.pitch
  const ribs = Array.from({ length: count }, (_, i) => box(v.rib_width, inside[1], v.floor / 2, v.rib_height + v.floor / 2, at(i)))
  const slots = Array.from({ length: count - 1 }, (_, i) => box(v.slot, inside[1] - v.margin * 2, -v.floor / 2, v.floor * 2, (at(i) + at(i + 1)) / 2))
  const tray = subtract(box(v.length, v.width, 0, v.height), box(inside[0], inside[1], v.floor, v.height))
  return subtract(union(tray, ...ribs), ...slots)
}
