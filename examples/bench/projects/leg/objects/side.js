// Two hubs and a spar, flat on the bed. Each hub is a window for a hip motor with the housing's three pilot holes round it.
import jscad from '@jscad/modeling'
const { cylinder, cuboid, roundedRectangle } = jscad.primitives
const { extrudeLinear } = jscad.extrusions
const { translate } = jscad.transforms

export function main (v) {
  const hubs = [-1, 1].map((s) => cylinder({ radius: v.hub, height: v.thick, center: [s * v.half, 0, v.thick / 2], segments: v.segments * 2 }))
  const spar = cuboid({ size: [v.half * 2, v.spar, v.thick], center: [0, 0, v.thick / 2] })
  const windows = [-1, 1].map((s) => translate([s * v.half, 0, 0], extrudeLinear({ height: v.thick + 1 }, roundedRectangle({ size: [v.window, v.window], roundRadius: v.corner, segments: v.segments }))))
  const feet = [-1, 1].flatMap((s) => [v.a1, v.a2, v.a3].map((a) => a * v.rad).map((a) => cylinder({ radius: v.pilot / 2, height: v.thick + 1, center: [s * v.half + v.feet_r * Math.cos(a), 0 - v.feet_r * Math.sin(a), v.thick / 2], segments: v.segments })))
  const beams = [-1, 1].flatMap((x) => [-1, 1].map((s) => cylinder({ radius: v.pilot / 2, height: v.thick + 1, center: [x * v.beam_at + s * v.beam_y, 0, v.thick / 2], segments: v.segments })))
  return v.ops.subtract(v.ops.union(hubs, spar), windows, feet, beams)
}
