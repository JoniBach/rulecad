// A tapered bar from the knee's boss to a round foot, flat on the bed. The foot's rim has a V groove for the pad's ridge.
import jscad from '@jscad/modeling'
const { cylinder, circle, polygon } = jscad.primitives
const { translate } = jscad.transforms
const { extrudeLinear, extrudeRotate } = jscad.extrusions
const { hull } = jscad.hulls

export function main (v) {
  const dot = (r, x) => translate([x, 0], circle({ radius: r, segments: v.segments }))
  const bar = extrudeLinear({ height: v.bar }, hull(dot(v.wide / 2, 0), dot(v.toe / 2, v.long)))
  const boss = cylinder({ radius: v.boss_d / 2, height: v.boss, center: [0, 0, v.boss / 2], segments: v.segments * 2 })
  const r = v.foot_r, mid = v.foot_w / 2, g = v.groove
  const foot = translate([v.long, 0, 0], extrudeRotate({ segments: v.segments }, polygon({ points: [[0, 0], [r, 0], [r, mid - g], [r - g, mid], [r, mid + g], [r, v.foot_w], [0, v.foot_w]] })))
  const bolts = Array.from({ length: v.bolts }, (_, k) => cylinder({ radius: v.screw / 2, height: v.boss + 1, center: [v.bolt * Math.cos(k * v.quarter), v.bolt * Math.sin(k * v.quarter), v.boss / 2], segments: v.segments }))
  const heads = Array.from({ length: v.bolts }, (_, k) => cylinder({ radius: v.head / 2, height: v.head_depth + 1, center: [v.bolt * Math.cos(k * v.quarter), v.bolt * Math.sin(k * v.quarter), (v.head_depth - 1) / 2], segments: v.segments }))
  return v.ops.subtract(v.ops.union(bar, boss, foot), bolts, heads)
}
