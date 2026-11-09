// A block with a pocket from the top, on a flange that's one plain rectangle on the bed. The servo drops in, its tabs on top.
import jscad from '@jscad/modeling'
const { cuboid, cylinder, roundedRectangle } = jscad.primitives
const { extrudeLinear } = jscad.extrusions

export function main (v) {
  const top = v.floor + v.depth
  const flange = extrudeLinear({ height: v.flange_t }, roundedRectangle({ size: [v.flange, v.wide], roundRadius: v.corner, segments: v.segments }))
  const block = cuboid({ size: [v.long, v.wide, top], center: [0, 0, top / 2] })
  const pocket = cuboid({ size: [v.body + 2 * v.fit, v.across + 2 * v.fit, v.depth + 1], center: [0, 0, v.floor + (v.depth + 1) / 2] })
  const windowed = cuboid({ size: [v.window, v.wide + 1, v.window_h], center: [0, 0, v.floor + v.window_h / 2] })
  const s = v.spacing / 2, pilots = [s, 0 - s].map((x) => cylinder({ radius: v.pilot / 2, height: v.pilot_depth, center: [x, 0, top - v.pilot_depth / 2], segments: v.segments }))
  return v.ops.subtract(v.ops.union(flange, block), pocket, windowed, pilots)
}
