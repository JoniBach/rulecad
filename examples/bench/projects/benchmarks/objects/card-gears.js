// The card's gears, laid out on one bed in the card's own order, so a pair stays a pair.
import jscad from '@jscad/modeling'
import { layout } from '../card-layout.mjs'
const { cylinder } = jscad.primitives
const { translate } = jscad.transforms

export function main (v) {
  const g = v.gears, L = layout(v, g), parts = {}
  const size = g.gearModel({ module: v.module_c, teeth: v.teeth, shift: v.shift }).tip + v.space
  L.pins.forEach((p, i) => {
    const ring = (v.bore / 2 + g.gearModel({ module: p.module, teeth: v.teeth, shift: v.shift }).root / 2) / 2, step = v.dot_pitch / ring
    const marks = Array.from({ length: p.dots }, (_, k) => cylinder({ radius: v.dot / 2, height: v.dot_height, center: [ring * Math.cos(k * step), ring * Math.sin(k * step), v.width + v.dot_height / 2], segments: v.segments }))
    const one = v.ops.union(g.spur({ module: p.module, teeth: v.teeth, shift: v.shift, width: v.width, bore: v.bore, backlash: p.backlash }), marks)
    parts[p.id] = translate([(i % v.across) * size, Math.floor(i / v.across) * size, 0], one)
  })
  return parts
}
