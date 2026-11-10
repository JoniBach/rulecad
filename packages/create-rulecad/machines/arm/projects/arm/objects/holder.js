// All in one flat print: a fixed frame with the servo, two tapered leaves, the shuttle with the pen's bore and a lug for the horn.
import jscad from '@jscad/modeling'
const { cuboid, cylinder } = jscad.primitives
const { translate } = jscad.transforms

export function main (v) {
  const f = v.flexures, material = f.flexureMaterial({ modulus: v.petg.modulus, strength: v.petg.strength, name: 'PETG' })
  const leaf = { length: v.leaf_l, thickness: v.leaf_t, width: v.thick, gap: v.gap, taper: v.taper, fillet: v.fillet, shuttle: v.pen_x - v.block_x - v.leaf_l + v.pen_wall, base: v.block_x * 2 }
  const model = f.parallelGuideModel(leaf, { E: v.petg.modulus })
  for (const x of f.printable({ thickness: v.leaf_t, width: v.thick, travel: v.travel }, v.x1c, material, model)) if (x.level === 'fail') throw new Error(x.text)
  const guide = translate([v.block_x, 0, 0], f.parallelGuide(leaf))
  const block = cuboid({ size: [v.block_x * 2, v.shuttle * 2, v.thick], center: [0, 0, v.half] })
  const frameBody = cuboid({ size: [v.frame_x + v.block_x, v.frame_top - v.frame_low, v.thick], center: [(v.frame_x - v.block_x) / 2, (v.frame_top + v.frame_low) / 2, v.half] })
  const tail = cuboid({ size: [v.block_x * 2, v.frame_top - v.frame_low + v.shuttle * 2 - 1, v.thick], center: [0, (v.frame_top + v.frame_low + v.shuttle * 2) / 2 - 1 / 2 - 1, v.half] })
  const shuttleBlock = cuboid({ size: [v.pen_x + v.pen_wall - v.block_x - v.leaf_l, v.shuttle * 2, v.thick], center: [v.block_x + v.leaf_l + (v.pen_x + v.pen_wall - v.block_x - v.leaf_l) / 2, 0, v.half] })
  const tabBody = cuboid({ size: [v.lug_x1 - v.lug_x0, (0 - v.shuttle) - v.lug_y + 1, v.thick], center: [(v.lug_x0 + v.lug_x1) / 2, (v.lug_y + (0 - v.shuttle) + 1) / 2, v.half] })
  const lug = cuboid({ size: [v.lug_x1 - v.lug_x0, v.lug_wide, v.lug_top - v.thick + 1], center: [(v.lug_x0 + v.lug_x1) / 2, v.lug_y + v.lug_wide / 2, v.thick + (v.lug_top - v.thick - 1) / 2] })
  const bore = v.shapes.teardropHole({ d: v.pen_d, length: v.shuttle * 2 + 1, at: [v.pen_x, 0 - v.shuttle - 1 / 2, v.half], into: '+y', through: true })
  const clamp = cylinder({ radius: v.clamp / 2, height: v.thick, center: [v.pen_x, 0, v.thick - v.half / 2], segments: v.segments })
  const servo = translate([v.xh, v.yh, v.thick], v.motors.mount(v.motors.motorModel('sg90'), { plate: v.thick }, v.ops))
  const holes = [-1, 1].map((s) => cylinder({ radius: v.bolt / 2, height: v.thick + 1, center: [s * v.bolt_y, 0, v.half], segments: v.segments }))
  return v.ops.subtract(v.ops.union(guide, block, frameBody, tail, shuttleBlock, tabBody, lug), bore, clamp, servo, holes)
}
