// The sampler as little as holds it: each pair's two pins on a bar, its label on a tab in front, the bars joined by
// two rails down the sides; the front row a rail for a loose rack (on a strip under its travel) and a lip on a floor for
// a loose ring, each with a pin for its pinion. Where everything goes is sampler-layout.mjs, which the mounted
// assembly reads too.
import jscad from '@jscad/modeling'
import { layout } from '../sampler-layout.mjs'
const { cuboid, cylinder, roundedRectangle } = jscad.primitives
const { translate } = jscad.transforms
const { extrudeLinear } = jscad.extrusions

export function main (v) {
  const L = layout(v, v.gears), parts = [], t = v.thick, flat = (x0, x1, y0, y1) => cuboid({ size: [x1 - x0, y1 - y0, t], center: [(x0 + x1) / 2, (y0 + y1) / 2, t / 2] })
  const label = (text, x, y) => translate([x, y, t], extrudeLinear({ height: v.emboss }, v.shapes.text({ text, height: v.label, stroke: v.stroke })))
  for (const p of L.pins) parts.push(cylinder({ radius: v.pin / 2, height: v.pin_height, center: [p.x, p.y, t + v.pin_height / 2] }))
  for (const b of L.bars) parts.push(translate([0, 0, 0], extrudeLinear({ height: t }, roundedRectangle({ size: [b.x1 - b.x0 + v.bar, v.bar], center: [(b.x0 + b.x1) / 2, b.y], roundRadius: (v.bar - v.clear) / 2 }))))
  for (const l of L.labels) parts.push(flat(l.x - v.column / 2 + v.margin, l.x + v.column / 2 - v.margin, l.y - v.tab / 2, l.y + v.tab / 2), label(l.text, l.x, l.y))
  // the rails: down both sides, joining every bar and tab
  for (const x of [0, L.size[0] - v.spine]) parts.push(flat(x, x + v.spine, 0, L.size[1]))
  // and across: under each row of tabs, so the middle column's bars hang on something
  for (const l of L.labels.filter((x, i, all) => all.findIndex((y) => y.y === x.y) === i)) parts.push(flat(0, L.size[0], l.y - v.tab / 2, l.y - v.tab / 2 + v.spine))
  for (const b of L.bars) parts.push(flat(b.x0 + (b.x1 - b.x0) / 2 - v.spine / 2, b.x0 + (b.x1 - b.x0) / 2 + v.spine / 2, b.y - (b.y - L.labels.find((l) => Math.abs(l.x - (b.x0 + b.x1) / 2) < v.column / 2 && l.y < b.y && b.y - l.y < v.column).y), b.y)) // each bar to its tab
  for (const r of L.rails) parts.push(cuboid({ size: [r.length, v.rail_width, v.rail_height], center: [r.x + r.length / 2, r.y + v.rail_width / 2, t + v.rail_height / 2] }), flat(0, r.x + r.length + 2 * v.spine, r.y, r.y + v.spine)) // the rail, on a strip from the side rail out to the pinion's stem
  const lip = v.ops.subtract(cylinder({ radius: L.lip.outer, height: v.lip_height, center: [L.lip.x, L.lip.y, t + v.lip_height / 2] }), cylinder({ radius: L.lip.inner, height: v.lip_height, center: [L.lip.x, L.lip.y, t + v.lip_height / 2] }))
  const floor = cylinder({ radius: L.lip.outer, height: t, center: [L.lip.x, L.lip.y, t / 2] })
  const pinionPad = L.pins.filter((p) => p.id.endsWith('pinion')).map((p) => cylinder({ radius: v.bar / 2, height: t, center: [p.x, p.y, t / 2] }))
  // the rack's pinion on a stem down to the rail's strip, past the rack's end (it slides under the pinion, not the stem)
  const rp = L.pins.find((p) => p.id === 'rack-pinion'), stemX = L.rails[0].x + L.rails[0].length + v.spine
  pinionPad.push(flat(rp.x, stemX + v.spine, rp.y - v.spine / 2, rp.y + v.spine / 2), flat(stemX, stemX + v.spine, L.rails[0].y, rp.y))
  return v.ops.union(lip, floor, ...pinionPad, ...parts)
}
