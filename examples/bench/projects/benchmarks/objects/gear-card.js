// The gear card: one solid rounded plate with pins standing on it, figures embossed on top. Where the pins go is
// card-layout.mjs, which the gears' plate and the mounted assembly read too.
import jscad from '@jscad/modeling'
import { layout } from '../card-layout.mjs'
const { cylinder, roundedRectangle } = jscad.primitives
const { extrudeLinear } = jscad.extrusions
const { translate, center } = jscad.transforms

export function main (v) {
  const L = layout(v, v.gears)
  const plate = translate([L.size[0] / 2, L.size[1] / 2, 0], extrudeLinear({ height: v.thick }, roundedRectangle({ size: L.size, roundRadius: v.corner, segments: v.segments })))
  const pins = L.pins.map((p) => cylinder({ radius: v.pin / 2, height: v.pin_height + v.thick, center: [p.x, p.y, (v.pin_height + v.thick) / 2], segments: v.segments }))
  const say = (text, x, y) => translate([x, y, v.thick], extrudeLinear({ height: v.emboss }, center({ axes: [true, true, false] }, v.shapes.text({ text, height: v.label, stroke: v.stroke }))))
  return v.ops.union(plate, pins, L.labels.map((l) => say(l.text, l.x, l.y)))
}
