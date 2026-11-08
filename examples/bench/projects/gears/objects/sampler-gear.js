// One sampler gear, its backlash marked by dots on its face.
import jscad from '@jscad/modeling'
const { cylinder } = jscad.primitives

export function main (v) {
  const g = v.gears, ring = (v.bore / 2 + g.gearModel({ module: v.module, teeth: v.teeth }).root / 2) / 2, step = v.dot_pitch / ring
  const marks = Array.from({ length: v.dots }, (_, i) => cylinder({ radius: v.dot / 2, height: v.dot_height, center: [ring * Math.cos(i * step), ring * Math.sin(i * step), v.width + v.dot_height / 2] }))
  return v.ops.union(g.spur({ module: v.module, teeth: v.teeth, width: v.width, bore: v.bore, backlash: v.backlash }), ...marks)
}
