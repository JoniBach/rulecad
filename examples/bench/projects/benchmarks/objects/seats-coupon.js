// A 608's pocket at three clearances, each with its printed clearance embossed beside it. Seats from @rulecad/shapes.
import jscad from '@jscad/modeling'
const { roundedRectangle } = jscad.primitives
const { extrudeLinear } = jscad.extrusions
const { translate, center } = jscad.transforms

export function main (v) {
  const bearing = { bore: v.bore, outer_diameter: v.outer, width: v.bearing_width }, fits = [v.press_tight, v.press_mid, v.slip], n = fits.length
  const width = v.pitch * (n - 1) + 2 * v.edge, depth = 2 * v.edge + v.label * 2
  const plate = translate([width / 2, depth / 2, 0], extrudeLinear({ height: v.thick }, roundedRectangle({ size: [width, depth], roundRadius: v.corner, segments: v.segments })))
  const at = (i) => [v.edge + i * v.pitch, v.edge, v.thick]
  const seats = fits.map((fit, i) => v.shapes.bearingSeat(bearing, { fit, printer: { hole_comp: v.x1c.hole_comp }, relief: v.relief, through: true, at: at(i), into: '-z' }))
  const say = (i) => translate([at(i)[0], depth - v.label, v.thick], extrudeLinear({ height: v.emboss }, center({ axes: [true, true, false] }, v.shapes.text({ text: `${fits[i]}`, height: v.label, stroke: v.stroke }))))
  return v.ops.union(v.ops.subtract(plate, seats), fits.map((_, i) => say(i)))
}
