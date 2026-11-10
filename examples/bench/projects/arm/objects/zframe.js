// A Z axis for the wrist, printed flat: a frame bolted into the forearm's yoke, two bars with the rods' holes, and the
// small stepper on the top bar, its shaft down through the bar to a lead screw.
import jscad from '@jscad/modeling'
const { cuboid, cylinder } = jscad.primitives

export function main (v) {
  const W = v.width, box = (x0, x1, y0, y1, z0 = 0, z1 = W) => cuboid({ size: [x1 - x0, y1 - y0, z1 - z0], center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2] })
  const block = box(-v.block_x, v.block_x, -v.block_y, v.block_y, 0, v.block_w)
  const spine = box(v.block_x - 1, v.spine_x, -v.y_out, v.y_out)
  const top = box(v.block_x - 1, v.bar_x, v.y_in, v.y_out), bottom = box(v.block_x - 1, v.bar_x, -v.y_out, -v.y_in)
  const rods = [v.sx - v.rod_gap, v.sx + v.rod_gap].map((x) => v.shapes.teardropHole({ d: v.rod, length: 2 * v.y_out + 2, at: [x, -v.y_out - 1, v.half], into: '+y', through: true }))
  const screwFree = v.shapes.teardropHole({ d: v.screw, length: v.y_out - v.y_in + 2, at: [v.sx, -v.y_out - 1, v.half], into: '+y', through: true })
  const bolts = [-1, 1].map((s) => cylinder({ radius: v.bolt / 2, height: W + 1, center: [s * v.bolt_x, 0, v.half], segments: v.segments }))
  const motorHoles = [-1, 1].map((s) => v.shapes.teardropHole({ d: v.motor_hole, length: v.y_out - v.y_in + 2, at: [v.sx + s * v.tab, v.y_in - 1, v.half - v.offset], into: '+y', through: true }))
  const boss = v.shapes.teardropHole({ d: v.boss, length: v.y_out - v.y_in + 2, at: [v.sx, v.y_in - 1, v.half], into: '+y', through: true })
  return v.ops.subtract(v.ops.union(block, spine, top, bottom), rods, screwFree, bolts, motorHoles, boss)
}
