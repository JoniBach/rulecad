// The sled: a plate that slides in the barrel slot, its nose pushing the disc, on a rod that runs back through the
// grip's top to a tab hanging down through the floor for the bow to push, and on to a ring for cocking. Drawn in the launcher's frame
// (x along the barrel, y up, z across from the bed wall), then laid on its plate to print.
import jscad from '@jscad/modeling'
const { cuboid, cylinder } = jscad.primitives
const { translate, rotateX } = jscad.transforms

export function main (v) {
  const t = v.thickness, z0 = v.wall + v.x1c.fit, box = (x0, x1, y0, y1, zlo, zhi) => cuboid({ center: [(x0 + x1) / 2, (y0 + y1) / 2, (zlo + zhi) / 2], size: [x1 - x0, y1 - y0, zhi - zlo] })
  const plate = box(v.reach, v.reach + v.length, -t / 2, t / 2, z0, z0 + v.across)
  const nose = box(v.reach + v.length, v.reach + v.length + v.nose, -t / 2, t / 2, z0, z0 + v.nose_width)
  const zt = v.wall + v.width / 2, tab = box(0, v.tab, -(t / 2 + v.launcher.rail + v.tab_drop), t / 2, zt - v.tab_width / 2, v.rod_z + v.overlap) // up into the rod, flush with its face so it stands on the bed
  const rod = box(-v.rod + v.ring - v.ring_wall, v.reach + v.overlap, -t / 2, t / 2, v.rod_z, v.rod_z + v.rod_width) // from the ring's hole (not into it) to the plate
  const ringAt = [-v.rod, 0, v.ring_z], hoop = (r) => translate(ringAt, rotateX(Math.PI / 2, cylinder({ radius: r, height: t, segments: v.smooth })))
  const ring = v.ops.subtract(hoop(v.ring), hoop(v.ring - v.ring_wall))
  const sled = v.ops.union(plate, nose, tab, rod, ring)
  return translate([0, 0, t / 2], rotateX(-Math.PI / 2, sled)) // on its plate: the launcher's z becomes y, the tab stands up
}
