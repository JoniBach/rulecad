// The fit bar: three rows of five blind holes in a plain block. Every hole opens at the top, so the first layer is one
// solid rectangle and no hole carries the first layer's squash. Row 1 plain holes, row 2 D-bores for a 5 mm shaft,
// row 3 M3 pilots, each labelled with its drawn diameter.
import jscad from '@jscad/modeling'
const { cuboid, cylinder, roundedRectangle } = jscad.primitives
const { extrudeLinear } = jscad.extrusions
const { translate, rotateX, center } = jscad.transforms

export function main (v) {
  const motor = v.motors.motorModel('17HS4401'), xs = Array.from({ length: v.cols }, (_, i) => (i - (v.cols - 1) / 2) * v.pitch)
  const L = v.pitch * v.cols + v.margin, W = v.row * v.rows + v.margin, ys = [v.row, 0, 0 - v.row]
  const block = extrudeLinear({ height: v.height }, roundedRectangle({ size: [L, W], roundRadius: v.corner, segments: v.segments }))
  const blind = (d, depth, x, y) => cylinder({ radius: d / 2, height: depth + 1, center: [x, y, v.height - depth / 2 + 1 / 2], segments: v.segments })
  const cuts = [], labels = []
  const say = (text, x, y) => labels.push(translate([x, y + v.row / 2 - v.label / 2, v.height], extrudeLinear({ height: v.emboss }, center({ axes: [true, false, false] }, v.shapes.text({ text, height: v.label, stroke: v.stroke })))))
  xs.forEach((x, i) => {
    const hole = v.hole_from + i * v.hole_step, bore = v.bore_from + i * v.bore_step, pilot = v.pilot_from + i * v.pilot_step
    cuts.push(blind(hole, v.hole_depth, x, ys[0]), blind(pilot, v.pilot_depth, x, ys[2]))
    // bore() draws its mouth at z = 0, going up: turned over, so its mouth is at the block's top
    cuts.push(translate([x, ys[1], v.height], rotateX(Math.PI, v.motors.bore(motor, { depth: v.bore_depth, fit: 'press', printer: { hole_comp: bore - v.press_base } }, v.ops))))
    say(hole.toFixed(1), x, ys[0]); say(bore.toFixed(1), x, ys[1]); say(pilot.toFixed(1), x, ys[2])
  })
  return v.ops.union(v.ops.subtract(block, cuts), labels)
}
