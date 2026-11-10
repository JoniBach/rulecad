// The output ring, drawn as it prints: its flange on the bed, the teeth standing on it; it goes on upside down.
import jscad from '@jscad/modeling'
const { cylinder } = jscad.primitives
const { translate } = jscad.transforms

export function main (v) {
  const flange = cylinder({ radius: v.rim / 2, height: v.top, center: [0, 0, v.top / 2], segments: v.ring_segments })
  const ring = translate([0, 0, v.top], v.gears.internal({ module: v.module, teeth: v.teeth, width: v.width, rim: v.rim }))
  const holes = Array.from({ length: v.bolts }, (_, k) => cylinder({ radius: v.pilot / 2, height: v.top + 1, center: [v.bolt * Math.cos(k * v.quarter), v.bolt * Math.sin(k * v.quarter), v.top / 2], segments: v.segments }))
  const middle = cylinder({ radius: v.middle / 2, height: v.top + 1, center: [0, 0, v.top / 2], segments: v.ring_segments })
  return v.ops.subtract(v.ops.union(flange, ring), holes, middle)
}
