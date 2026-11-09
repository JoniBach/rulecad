// The output ring as it prints: a solid flange on the bed with four small holes, the teeth standing on it.
import jscad from '@jscad/modeling'
const { cylinder } = jscad.primitives
const { translate } = jscad.transforms

export function main (v) {
  const flange = cylinder({ radius: v.rim / 2, height: v.top, center: [0, 0, v.top / 2], segments: v.segments * 2 })
  const ring = translate([0, 0, v.top], v.gears.internal({ module: v.module, teeth: v.teeth, width: v.width, rim: v.rim }))
  const holes = Array.from({ length: v.bolts }, (_, k) => cylinder({ radius: v.pilot / 2, height: v.top + 1, center: [v.bolt * Math.cos(2 * k * Math.PI / v.bolts), v.bolt * Math.sin(2 * k * Math.PI / v.bolts), v.top / 2], segments: v.segments }))
  return v.ops.subtract(v.ops.union(flange, ring), holes)
}
