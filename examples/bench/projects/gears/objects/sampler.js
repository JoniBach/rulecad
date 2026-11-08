// The sampler plate: rows by module (largest at the back), columns by backlash, a pair of pins for each with its label
// in front; the front row a rail for a loose rack and a lip for a loose ring, each with a pin for its pinion. Where
// everything goes is sampler-layout.mjs, which the mounted assembly reads too.
import jscad from '@jscad/modeling'
import { layout } from '../sampler-layout.mjs'
const { cuboid, cylinder } = jscad.primitives
const { translate } = jscad.transforms
const { extrudeLinear } = jscad.extrusions

export function main (v) {
  const L = layout(v, v.gears), parts = []
  const label = (text, x, y) => translate([x, y, v.thick], extrudeLinear({ height: v.emboss }, v.shapes.text({ text, height: v.label, stroke: v.stroke })))
  for (const p of L.pins) parts.push(cylinder({ radius: v.pin / 2, height: v.pin_height, center: [p.x, p.y, v.thick + v.pin_height / 2] }))
  for (const l of L.labels) parts.push(label(l.text, l.x, l.y))
  for (const r of L.rails) parts.push(cuboid({ size: [r.length, v.rail_width, v.rail_height], center: [r.x + r.length / 2, r.y + v.rail_width / 2, v.thick + v.rail_height / 2] }))
  const lip = v.ops.subtract(cylinder({ radius: L.lip.outer, height: v.lip_height, center: [L.lip.x, L.lip.y, v.thick + v.lip_height / 2] }), cylinder({ radius: L.lip.inner, height: v.lip_height, center: [L.lip.x, L.lip.y, v.thick + v.lip_height / 2] }))
  const plate = cuboid({ size: [L.size[0], L.size[1], v.thick], center: [L.size[0] / 2, L.size[1] / 2, v.thick / 2] })
  return v.ops.union(plate, lip, ...parts)
}
