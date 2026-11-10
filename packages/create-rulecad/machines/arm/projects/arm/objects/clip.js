// A flat tab screwed to a post, its nose over the flange.
import jscad from '@jscad/modeling'
const { cuboid, cylinder } = jscad.primitives
const { subtract } = jscad.booleans

export function main (v) {
  const tab = cuboid({ size: [v.reach + v.back, v.wide, v.thick], center: [(v.back - v.reach) / 2, 0, v.thick / 2] })
  return subtract(tab, cylinder({ radius: v.hole / 2, height: v.thick + 1, center: [0, 0, v.thick / 2], segments: v.segments }))
}
