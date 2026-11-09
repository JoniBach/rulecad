// The dial: a square over the motor's holes and a sector out to the pointer, one plain outline on the bed, ticks raised on top.
import jscad from '@jscad/modeling'
const { cuboid, cylinder, roundedRectangle, polygon } = jscad.primitives
const { extrudeLinear } = jscad.extrusions
const { translate, rotateZ, center } = jscad.transforms

export function main (v) {
  const deg = Math.PI / v.half_turn, n = 2 * v.half, arc = Array.from({ length: n + 1 }, (_, i) => { const a = (i - v.half) * deg; return [v.reach * Math.cos(a), v.reach * Math.sin(a)] })
  const sector = polygon({ points: [[0, 0], ...arc] })
  const body = extrudeLinear({ height: v.thick }, jscad.booleans.union(sector, roundedRectangle({ size: [v.hub, v.hub], roundRadius: v.corner, segments: v.segments })))
  const s = v.spacing / 2, cuts = [[s, s], [s, 0 - s], [0 - s, s], [0 - s, 0 - s]].map(([x, y]) => cylinder({ radius: v.hole / 2, height: v.thick + 1, center: [x, y, v.thick / 2], segments: v.segments }))
  cuts.push(cylinder({ radius: v.shaft / 2, height: v.thick + 1, center: [0, 0, v.thick / 2], segments: v.segments }))
  const ticks = [], labels = []
  for (let d = 0 - v.ticks; d <= v.ticks; d++) {
    const five = d % v.every === 0, len = five ? v.tick_long : v.tick_short
    ticks.push(rotateZ(d * deg, cuboid({ size: [len, v.tick, v.tick_height], center: [v.tick_r + len / 2, 0, v.thick + v.tick_height / 2] })))
    if (d % (2 * v.every) === 0) labels.push(translate([(v.tick_r - v.label) * Math.cos(d * deg), (v.tick_r - v.label) * Math.sin(d * deg), v.thick], extrudeLinear({ height: v.tick_height }, center({ axes: [true, true, false] }, v.shapes.text({ text: `${Math.abs(d)}`, height: v.label, stroke: v.stroke })))))
  }
  return v.ops.union(v.ops.subtract(body, cuts), ticks, labels)
}
