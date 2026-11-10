// A three-armed plate over the gearbox, the bearing's seat in the middle.
import jscad from '@jscad/modeling'
const { cylinder, cuboid } = jscad.primitives
const { rotateZ } = jscad.transforms

export function main (v) {
  const posts = [v.p1, v.p2, v.p3].map((a) => a * v.rad), at = (a) => [v.post_r * Math.cos(a), v.post_r * Math.sin(a)]
  const hub = cylinder({ radius: v.hub / 2, height: v.thick, center: [0, 0, v.thick / 2], segments: v.segments * 2 })
  const arms = posts.map((a) => rotateZ(a, cuboid({ size: [v.post_r, v.lobe, v.thick], center: [v.post_r / 2, 0, v.thick / 2] })))
  const lobes = posts.map((a) => cylinder({ radius: v.lobe / 2, height: v.thick, center: [...at(a), v.thick / 2], segments: v.segments }))
  const seat = v.shapes.bearingSeat({ bore: v.bore, outer_diameter: v.outer, width: v.width }, { fit: 'press', relief: v.relief, through: true, printer: v.x1c, at: [0, 0, v.thick], into: '-z', lead: 0 })
  const screws = posts.map((a) => cylinder({ radius: v.screw / 2, height: v.thick + 1, center: [...at(a), v.thick / 2], segments: v.segments }))
  const heads = posts.map((a) => cylinder({ radius: v.head / 2, height: v.head_depth + 1, center: [...at(a), v.thick - (v.head_depth - 1) / 2], segments: v.segments }))
  return v.ops.subtract(v.ops.union(hub, arms, lobes), seat, screws, heads)
}
